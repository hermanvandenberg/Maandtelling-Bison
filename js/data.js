/* Inlezen van Excel-bestanden, opslag in de browser, berekeningen en aggregaties. */
(function () {
  'use strict';
  const B = window.BISON;

  const OPSLAG_DATA = 'bison.data.v1';
  const OPSLAG_CONFIG = 'bison.config.v1';

  const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
  const MAANDEN_KORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

  function norm(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim();
  }
  function slug(s) {
    return norm(s).replace(/%/g, 'pct').replace(/\s+/g, '_') || 'kolom';
  }
  function getal(v) {
    if (v == null || v === '') return 0;
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    const n = parseFloat(String(v).replace(',', '.'));
    return isFinite(n) ? n : 0;
  }

  /* ---------- Opslag ---------- */
  function veiligLezen(key) {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  }
  function veiligSchrijven(key, waarde) {
    try { localStorage.setItem(key, JSON.stringify(waarde)); return true; } catch (e) { console.warn('Opslaan mislukt', e); return false; }
  }

  // Data: { maanden: { 'YYYY-MM': { bron, ingelezen, regels:[...] } }, extraVelden: [{key,label}] }
  function laadData() {
    const d = veiligLezen(OPSLAG_DATA);
    return d && d.maanden ? d : { maanden: {}, extraVelden: [] };
  }
  function bewaarData(d) { return veiligSchrijven(OPSLAG_DATA, d); }

  function kopie(o) { return JSON.parse(JSON.stringify(o)); }
  function vulConfigAan(c) {
    const s = kopie(B.STANDAARD_CONFIG);
    if (!c || typeof c !== 'object') return s;
    return {
      versie: 1,
      formules: Object.assign(s.formules, c.formules || {}),
      koppelingen: Array.isArray(c.koppelingen) ? c.koppelingen : s.koppelingen,
      signalen: Object.assign(s.signalen, c.signalen || {}),
      velden: Object.assign({}, c.velden || {}),
      favorieten: Array.isArray(c.favorieten) ? c.favorieten : [],
    };
  }
  function laadConfig() {
    const c = veiligLezen(OPSLAG_CONFIG);
    return c ? vulConfigAan(c) : null;
  }
  function bewaarConfig(c) { return veiligSchrijven(OPSLAG_CONFIG, c); }

  /* ---------- Maand herkennen ---------- */
  function herkenMaand(tekst) {
    const t = norm(tekst);
    let m = t.match(/(20\d\d)\s*(?:[-_ ]\s*)?(0?[1-9]|1[0-2])(?!\d)/);
    if (m) return m[1] + '-' + String(m[2]).padStart(2, '0');
    m = t.match(/(?:^|\D)(0?[1-9]|1[0-2])\s*[-_ ]\s*(20\d\d)/);
    if (m) return m[2] + '-' + String(m[1]).padStart(2, '0');
    const jaar = (t.match(/20\d\d/) || [])[0];
    for (let i = 0; i < 12; i++) {
      const re = new RegExp('(^|\\s)(' + MAANDEN[i] + '|' + MAANDEN_KORT[i] + ')(\\s|$|\\d)');
      if (re.test(t)) return (jaar || String(new Date().getFullYear())) + '-' + String(i + 1).padStart(2, '0');
    }
    return null;
  }
  function maandLabel(ym, kort) {
    if (!ym) return '';
    const [j, m] = ym.split('-');
    const n = parseInt(m, 10) - 1;
    return (kort ? MAANDEN_KORT[n] + ' ' + j.slice(2) : MAANDEN[n] + ' ' + j);
  }

  /* ---------- Excel inlezen ---------- */
  function koppelKolommen(kopRij) {
    const alle = B.DIMENSIES.filter(d => d.match).map(d => Object.assign({ soort: 'dim' }, d))
      .concat(B.MEETWAARDEN.map(m => Object.assign({ soort: 'meet' }, m)));
    const kaart = {}; // kolomindex -> key
    const gebruikt = new Set();
    const extra = [];
    const koppen = kopRij.map(norm);
    // 1e ronde: exacte match, 2e ronde: begint-met, 3e ronde: bevat
    const rondes = [
      (k, p) => k === p,
      (k, p) => k.startsWith(p),
      (k, p) => k.includes(p),
    ];
    for (const test of rondes) {
      koppen.forEach((k, i) => {
        if (!k || kaart[i] != null) return;
        for (const def of alle) {
          if (gebruikt.has(def.key)) continue;
          if (def.match.some(p => test(k, p))) { kaart[i] = def.key; gebruikt.add(def.key); return; }
        }
      });
    }
    koppen.forEach((k, i) => {
      if (k && kaart[i] == null) {
        if (k === 'maand' || k === 'periode') { kaart[i] = 'maand'; return; }
        const key = 'x_' + slug(kopRij[i]);
        kaart[i] = key;
        extra.push({ key, label: String(kopRij[i]).trim() });
      }
    });
    return { kaart, extra };
  }

  function vindKopRij(rijen) {
    for (let r = 0; r < Math.min(rijen.length, 20); r++) {
      const cellen = (rijen[r] || []).map(norm);
      if (cellen.some(c => c === 'medewerker' || c === 'naam') || cellen.some(c => c.startsWith('te werken dagen'))) return r;
    }
    return -1;
  }

  /** Leest een werkmap en geeft per tabblad een lijst regels terug. */
  function leesWerkmap(arrayBuffer, bestandsnaam) {
    const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
    const bladen = [];
    wb.SheetNames.forEach(naam => {
      const ws = wb.Sheets[naam];
      const rijen = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
      const kr = vindKopRij(rijen);
      if (kr < 0) return;
      const { kaart, extra } = koppelKolommen(rijen[kr]);
      const regels = [];
      for (let r = kr + 1; r < rijen.length; r++) {
        const rij = rijen[r] || [];
        const reg = {};
        Object.keys(kaart).forEach(i => { reg[kaart[i]] = rij[i]; });
        if (!reg.naam || String(reg.naam).trim() === '') continue;
        regels.push(normaliseerRegel(reg, extra));
      }
      if (!regels.length) return;
      const heeftMaandKolom = regels.some(r => r.maand);
      bladen.push({
        blad: naam,
        regels,
        extra,
        maand: herkenMaand(naam) || herkenMaand(bestandsnaam) || null,
        heeftMaandKolom,
      });
    });
    return bladen;
  }

  function normaliseerMaandWaarde(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) return v.getFullYear() + '-' + String(v.getMonth() + 1).padStart(2, '0');
    if (typeof v === 'number' && v > 20000) { // Excel-datumgetal
      const d = new Date(Math.round((v - 25569) * 86400 * 1000));
      return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
    }
    return herkenMaand(String(v));
  }

  function normaliseerRegel(reg, extra) {
    const uit = {};
    uit.mdw = reg.mdw == null ? '' : String(reg.mdw).trim();
    uit.naam = String(reg.naam).trim();
    uit.functie = reg.functie == null || reg.functie === '' ? 'Onbekend' : String(reg.functie).trim();
    uit.ploeg = reg.ploeg == null || reg.ploeg === '' ? 'Onbekend' : (/^\d+$/.test(String(reg.ploeg).trim()) ? 'Ploeg ' + String(reg.ploeg).trim() : String(reg.ploeg).trim());
    uit.type = /^\d+$/.test(uit.mdw) ? 'Vast' : (uit.mdw ? uit.mdw.charAt(0).toUpperCase() + uit.mdw.slice(1) : 'Onbekend');
    if (reg.maand != null) uit.maand = normaliseerMaandWaarde(reg.maand);
    B.MEETWAARDEN.forEach(m => { if (!m.berekend) uit[m.key] = getal(reg[m.key]); });
    (extra || []).forEach(x => { uit[x.key] = getal(reg[x.key]); });
    // Niet-numerieke nummers (bijv. "Uitzendkracht") zijn niet uniek: gebruik dan de naam als sleutel.
    uit.mdwNr = uit.mdw;
    if (!/^\d+$/.test(uit.mdw)) uit.mdw = uit.naam;
    return uit;
  }

  /* ---------- Berekeningen ---------- */
  function som(r, keys) { return (keys || []).reduce((s, k) => s + (r[k] || 0), 0); }

  /** Voegt berekende velden toe aan een regel volgens de formules in de config. */
  function bereken(r, config) {
    const f = config.formules;
    r.gewerkt = som(r, f.gewerkt.plus) - som(r, f.gewerkt.min);
    const nG = som(r, f.pct_gewerkt.noemer);
    r.pct_gewerkt = nG ? som(r, f.pct_gewerkt.teller) / nG * 100 : null;
    const nZ = som(r, f.pct_ziek.noemer);
    r.pct_ziek = nZ ? som(r, f.pct_ziek.teller) / nZ * 100 : null;
    return r;
  }

  /** Alle regels als platte lijst, met maand en berekende velden. */
  function alleRegels(data, config) {
    const uit = [];
    Object.keys(data.maanden).sort().forEach(ym => {
      data.maanden[ym].regels.forEach(r => {
        const k = Object.assign({}, r);
        k.maand = ym;
        uit.push(bereken(k, config));
      });
    });
    return uit;
  }

  /* ---------- Aggregatie ---------- */
  const AGGREGATIES = [
    { key: 'som', label: 'Totaal (som)' },
    { key: 'gem_mdw', label: 'Gemiddelde per medewerker' },
    { key: 'gem', label: 'Gemiddelde per regel (medewerker × maand)' },
    { key: 'mediaan', label: 'Mediaan per regel' },
    { key: 'max', label: 'Hoogste' },
    { key: 'min', label: 'Laagste' },
    { key: 'aantal', label: 'Aantal regels met waarde > 0' },
  ];

  function laatstePerMedewerker(regels) {
    const m = new Map();
    regels.forEach(r => { const o = m.get(r.mdw); if (!o || o.maand < r.maand) m.set(r.mdw, r); });
    return Array.from(m.values());
  }

  /** Waarde van een meetwaarde over een verzameling regels. */
  function meet(regels, key, agg, config) {
    agg = agg || 'som';
    if (!regels.length) return null;
    if (key === 'pct_gewerkt' || key === 'pct_ziek') {
      const f = config.formules[key];
      if (agg === 'som' || agg === 'gem_mdw') {
        const n = regels.reduce((s, r) => s + som(r, f.noemer), 0);
        return n ? regels.reduce((s, r) => s + som(r, f.teller), 0) / n * 100 : null;
      }
    }
    const def = B.MEETWAARDEN.find(m => m.key === key);
    let bron = regels;
    if (def && def.voorraad && (agg === 'som' || agg === 'gem_mdw')) bron = laatstePerMedewerker(regels);
    const w = bron.map(r => r[key]).filter(v => v != null && isFinite(v));
    if (!w.length) return null;
    switch (agg) {
      case 'som': return w.reduce((a, b) => a + b, 0);
      case 'gem_mdw': return w.reduce((a, b) => a + b, 0) / new Set(regels.map(r => r.mdw)).size;
      case 'gem': return w.reduce((a, b) => a + b, 0) / w.length;
      case 'mediaan': { const s = w.slice().sort((a, b) => a - b); const h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; }
      case 'max': return Math.max.apply(null, w);
      case 'min': return Math.min.apply(null, w);
      case 'aantal': return w.filter(v => v > 0).length;
      default: return null;
    }
  }

  function groepeer(regels, dim) {
    const m = new Map();
    regels.forEach(r => {
      const k = r[dim] == null ? 'Onbekend' : r[dim];
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    });
    return m;
  }

  /** Per medewerker de regels samenvoegen tot één regel (voor tabellen en correlaties). */
  function perMedewerker(regels, config, velden) {
    const out = [];
    groepeer(regels, 'mdw').forEach((rs, mdw) => {
      const laatste = rs.reduce((a, b) => (a.maand > b.maand ? a : b));
      const r = { mdw, naam: laatste.naam, functie: laatste.functie, ploeg: laatste.ploeg, type: laatste.type, maanden: rs.length, _regels: rs };
      velden.forEach(v => { r[v.key] = meet(rs, v.key, 'som', config); });
      out.push(r);
    });
    return out;
  }

  function pearson(xs, ys) {
    const n = xs.length;
    if (n < 3) return null;
    let sx = 0, sy = 0;
    for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; }
    const mx = sx / n, my = sy / n;
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < n; i++) {
      const a = xs[i] - mx, b = ys[i] - my;
      num += a * b; dx += a * a; dy += b * b;
    }
    if (!dx || !dy) return null;
    return num / Math.sqrt(dx * dy);
  }

  function correlatie(regels, a, b) {
    const xs = [], ys = [];
    regels.forEach(r => {
      const x = r[a], y = r[b];
      if (x != null && y != null && isFinite(x) && isFinite(y)) { xs.push(x); ys.push(y); }
    });
    return { r: pearson(xs, ys), n: xs.length };
  }

  /* ---------- Voorbeelddata ---------- */
  function willekeur(seed) {
    let s = seed >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  function maakVoorbeeld() {
    const rnd = willekeur(20261031);
    const kies = a => a[Math.floor(rnd() * a.length)];
    const achternamen = ['Bakker', 'Visser', 'Smit', 'Meijer', 'de Groot', 'Mulder', 'de Boer', 'Bos', 'Vos', 'Peters', 'Hendriks', 'van Dijk', 'Dekker', 'Brouwer', 'de Wit', 'Dijkstra', 'Smits', 'de Graaf', 'van der Meer', 'Kok', 'Jacobs', 'de Haan', 'Vermeulen', 'van den Heuvel', 'van der Veen', 'van den Broek', 'de Bruijn', 'Schouten', 'Willems', 'Hoekstra'];
    const voornamen = ['Jan', 'Piet', 'Kees', 'Sanne', 'Lotte', 'Mark', 'Ruben', 'Tim', 'Eva', 'Noah', 'Daan', 'Sem', 'Lucas', 'Milan', 'Bram', 'Thijs', 'Anna', 'Fleur', 'Jesse', 'Lars', 'Stijn', 'Ivo', 'Rik', 'Joris', 'Koen', 'Maud', 'Niels', 'Floor', 'Gijs', 'Teun'];
    const functies = [['Kapitein havenduwboot', 5], ['Stuurman havenduwboot', 2], ['Matroos havenduwboot', 18], ['Leerlingmatroos havenduwboot', 3], ['Schipper Bison', 2]];
    const mensen = [];
    let i = 0;
    functies.forEach(([f, n]) => {
      for (let k = 0; k < n; k++, i++) {
        const uitzend = f === 'Matroos havenduwboot' && k >= 16;
        mensen.push({
          mdw: uitzend ? 'Uitzendkracht' : String(1170010 + i * 9),
          naam: achternamen[i] + ', ' + voornamen[i].charAt(0) + '. (' + voornamen[i] + ')',
          functie: f,
          ploeg: String(1 + (i % 5)),
          ziekteRisico: rnd(),
          langdurigVanaf: rnd() < 0.08 ? 3 + Math.floor(rnd() * 6) : null,
          saldo: 20 + Math.floor(rnd() * 25),
          opleidingMaand: Math.floor(rnd() * 12),
          or: i === 4 || i === 13,
          werkgroep: rnd() < 0.2,
        });
      }
    });
    mensen.forEach((p, idx) => { p.uid = p.mdw === 'Uitzendkracht' ? 'Uitzendkracht ' + (idx + 1) : p.mdw; });
    const data = { maanden: {}, extraVelden: [] };
    const jaar = 2026;
    for (let m = 1; m <= 10; m++) {
      const ym = jaar + '-' + String(m).padStart(2, '0');
      const zomer = m >= 6 && m <= 8;
      const winter = m <= 2 || m >= 11;
      const regels = mensen.map(p => {
        const te = 13 + Math.floor(rnd() * 4);
        let ziekte = 0;
        const langdurig = p.langdurigVanaf && m >= p.langdurigVanaf && m < p.langdurigVanaf + 3;
        if (langdurig) ziekte = te;
        else if (rnd() < 0.12 + p.ziekteRisico * 0.18 + (winter ? 0.1 : 0)) ziekte = 1 + Math.floor(rnd() * (p.ziekteRisico > 0.8 ? 6 : 3));
        const rest = Math.max(0, te - ziekte);
        const vakantie = langdurig ? 0 : Math.min(rest, zomer ? 3 + Math.floor(rnd() * 6) : (rnd() < 0.35 ? 1 + Math.floor(rnd() * 3) : 0));
        const gekocht = !langdurig && zomer && rnd() < 0.15 ? 1 + Math.floor(rnd() * 2) : 0;
        const afgewezen = zomer ? (rnd() < 0.25 ? 1 + Math.floor(rnd() * 2) : 0) : (rnd() < 0.05 ? 1 : 0);
        const boven = !langdurig && rnd() < 0.08 ? 1 + Math.floor(rnd() * 2) : 0;
        const opleiding = !langdurig && (p.opleidingMaand === m - 1 || (p.functie.startsWith('Leerling') && rnd() < 0.5)) ? 1 + Math.floor(rnd() * 3) : 0;
        const werkgroep = !langdurig && p.werkgroep && rnd() < 0.5 ? 1 : 0;
        const omst = !langdurig && rnd() < 0.05 ? 1 : 0;
        const or = !langdurig && p.or ? 1 + Math.floor(rnd() * 2) : 0;
        const geboorte = p.naam.startsWith('Smit') && (m === 4 || m === 5) ? 3 : 0;
        const reserve = !langdurig && rnd() < 0.3 ? 1 + Math.floor(rnd() * 3) : 0;
        const extra = !langdurig && rnd() < 0.25 ? 1 + Math.floor(rnd() * 2) : 0;
        p.saldo = Math.max(0, p.saldo - vakantie + (m === 1 ? 0 : 0));
        if (m === 1) p.saldo += 0;
        const loon = langdurig ? Math.round(ziekte * 0.7) : 0;
        return {
          mdw: p.uid, naam: p.naam, functie: p.functie,
          ploeg: 'Ploeg ' + p.ploeg, type: p.mdw === 'Uitzendkracht' ? 'Uitzendkracht' : 'Vast',
          te_werken: te, reserveweek: reserve, extra_varen: extra, ziekte, boven_sterkte: boven,
          opleiding, werkgroep, omstandigheden: omst, or, vakantie, gekocht, geboorteverlof: geboorte,
          afgewezen, verlofsaldo: p.saldo + 2 * (10 - m), loonsuppletie: loon,
        };
      });
      data.maanden[ym] = { bron: 'Voorbeelddata', voorbeeld: true, ingelezen: new Date().toISOString(), regels };
    }
    return data;
  }

  Object.assign(B, {
    norm, getal, laadData, bewaarData, laadConfig, bewaarConfig, vulConfigAan, kopie,
    herkenMaand, maandLabel, leesWerkmap, bereken, alleRegels, AGGREGATIES, meet, groepeer,
    perMedewerker, correlatie, pearson, maakVoorbeeld, MAANDEN,
  });
})();
