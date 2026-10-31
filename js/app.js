/* Maandtelling Bison – dashboard. Alles draait in de browser; er wordt niets verstuurd. */
(function () {
  'use strict';
  const B = window.BISON;
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const OPSLAG_UI = 'bison.ui.v1';

  const S = {
    data: { maanden: {}, extraVelden: [] },
    config: B.kopie(B.STANDAARD_CONFIG),
    regels: [],
    gefilterd: [],
    maanden: [],
    filter: { van: '', tot: '', ploeg: new Set(), functie: new Set(), type: new Set(), naam: new Set(), zoek: '' },
    tab: 'overzicht',
    grafieken: {},
    bouwer: { maat: 'pct_ziek', agg: 'som', dim: 'ploeg', split: '', type: 'bar', sort: 'natuurlijk', top: '0', vergelijk: '' },
    tabelSort: { key: 'naam', richting: 'op' },
    kolommen: null,
    perMaand: false,
    koppelPaar: { a: '', b: '' },
    niveau: 'regel',
    trendMaat: '_pct',
    ploegMaat: 'pct_ziek',
    functieMaat: 'pct_gewerkt',
    thema: '',
  };

  /* ================= Hulpfuncties ================= */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  const nf1 = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 });
  const nf2 = new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function isPct(key) { const d = veldDef(key); return !!(d && d.eenheid === '%'); }
  function fmt(v, key) {
    if (v == null || !isFinite(v)) return '–';
    return nf1.format(v) + (isPct(key) ? ' %' : '');
  }
  function natuurlijk(a, b) { return String(a).localeCompare(String(b), 'nl', { numeric: true, sensitivity: 'base' }); }
  function css(naam) { return getComputedStyle(document.documentElement).getPropertyValue(naam).trim(); }
  function reeksKleur(i) { return css('--s' + ((i % 8) + 1)); }
  function melding(tekst) {
    const m = $('#melding'); m.textContent = tekst; m.hidden = false;
    clearTimeout(melding.t); melding.t = setTimeout(() => { m.hidden = true; }, 3500);
  }
  function download(naam, inhoud, type) {
    const blob = inhoud instanceof Blob ? inhoud : new Blob([inhoud], { type: type || 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = naam;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function naarCsv(rijen) {
    return '﻿' + rijen.map(r => r.map(c => {
      const s = c == null ? '' : (typeof c === 'number' ? String(c).replace('.', ',') : String(c));
      return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(';')).join('\r\n');
  }
  function datumStempel() { return new Date().toISOString().slice(0, 10); }
  function bewaarUi() {
    try {
      localStorage.setItem(OPSLAG_UI, JSON.stringify({
        tab: S.tab, bouwer: S.bouwer, kolommen: S.kolommen, perMaand: S.perMaand, niveau: S.niveau,
        trendMaat: S.trendMaat, ploegMaat: S.ploegMaat, functieMaat: S.functieMaat, thema: S.thema,
      }));
    } catch (e) { /* niet erg */ }
  }
  function laadUi() {
    try { const u = JSON.parse(localStorage.getItem(OPSLAG_UI) || 'null'); if (u) Object.assign(S, u, { bouwer: Object.assign(S.bouwer, u.bouwer || {}) }); } catch (e) { /* niet erg */ }
  }

  /* ================= Velden ================= */
  function alleMeetDefs() {
    return B.MEETWAARDEN.concat((S.data.extraVelden || []).map(x => ({ key: x.key, label: x.label, kort: x.label, groep: 'extra' })));
  }
  function veldDef(key) {
    return alleMeetDefs().find(m => m.key === key) || B.DIMENSIES.find(d => d.key === key);
  }
  function label(key, kort) {
    const eigen = S.config.velden[key] && S.config.velden[key].label;
    if (eigen) return eigen;
    const d = veldDef(key);
    if (!d) return key;
    return kort && d.kort ? d.kort : d.label;
  }
  function verborgen(key) { return !!(S.config.velden[key] && S.config.velden[key].verborgen); }
  function meetVelden(ookVerborgen) { return alleMeetDefs().filter(m => ookVerborgen || !verborgen(m.key)); }
  function isDim(key) { return B.DIMENSIES.some(d => d.key === key); }
  const GROEP_DIMS = ['maand', 'ploeg', 'functie', 'naam', 'type'];

  function maatOpties(sel, waarde, opts) {
    opts = opts || {};
    const groepen = {};
    meetVelden().forEach(m => {
      if (opts.filter && !opts.filter(m)) return;
      (groepen[m.groep] = groepen[m.groep] || []).push(m);
    });
    let html = opts.leeg ? '<option value="">' + esc(opts.leeg) + '</option>' : '';
    if (opts.extra) html += opts.extra;
    Object.keys(groepen).forEach(g => {
      html += '<optgroup label="' + esc(B.GROEP_LABELS[g] || g) + '">' +
        groepen[g].map(m => '<option value="' + m.key + '">' + esc(label(m.key)) + '</option>').join('') + '</optgroup>';
    });
    if (opts.dims) {
      html = '<optgroup label="Kenmerken">' + opts.dims.map(d => '<option value="' + d + '">' + esc(label(d)) + '</option>').join('') + '</optgroup>' + html;
    }
    sel.innerHTML = html;
    if (waarde != null && $$('option', sel).some(o => o.value === waarde)) sel.value = waarde;
  }
  function dimOpties(sel, waarde, leeg) {
    sel.innerHTML = (leeg ? '<option value="">' + esc(leeg) + '</option>' : '') + GROEP_DIMS.map(d => '<option value="' + d + '">' + esc(label(d)) + '</option>').join('');
    if (waarde != null) sel.value = waarde;
  }

  /* ================= Filters ================= */
  function filterRegels(behalve) {
    const f = S.filter;
    const z = f.zoek.toLowerCase();
    return S.regels.filter(r =>
      (!f.van || r.maand >= f.van) && (!f.tot || r.maand <= f.tot) &&
      (behalve === 'ploeg' || !f.ploeg.size || f.ploeg.has(r.ploeg)) &&
      (behalve === 'functie' || !f.functie.size || f.functie.has(r.functie)) &&
      (behalve === 'type' || !f.type.size || f.type.has(r.type)) &&
      (behalve === 'naam' || !f.naam.size || f.naam.has(r.naam)) &&
      (!z || r.naam.toLowerCase().includes(z) || String(r.mdwNr || '').toLowerCase().includes(z))
    );
  }

  function uniek(key) { return Array.from(new Set(S.regels.map(r => r[key]))).sort(natuurlijk); }

  function vulFilters() {
    const opt = S.maanden.map(m => '<option value="' + m + '">' + esc(B.maandLabel(m)) + '</option>').join('');
    $('#f-van').innerHTML = opt; $('#f-tot').innerHTML = opt;
    if (!S.maanden.includes(S.filter.van)) S.filter.van = S.maanden[0] || '';
    if (!S.maanden.includes(S.filter.tot)) S.filter.tot = S.maanden[S.maanden.length - 1] || '';
    $('#f-van').value = S.filter.van; $('#f-tot').value = S.filter.tot;
    $$('[data-multi]').forEach(el => {
      const key = el.dataset.multi;
      const waarden = uniek(key);
      const set = S.filter[key];
      Array.from(set).forEach(v => { if (!waarden.includes(v)) set.delete(v); });
      const lijst = $('.multi-lijst', el);
      lijst.innerHTML = '<div class="multi-acties"><input type="search" placeholder="Zoek…" aria-label="Zoek in lijst"><button class="knop licht" type="button" data-alles>Alle</button><button class="knop licht" type="button" data-geen>Geen</button></div>' +
        waarden.map(v => '<label><input type="checkbox" value="' + esc(v) + '"' + (set.has(v) ? ' checked' : '') + '> ' + esc(v) + '</label>').join('');
      $('.multi-knop', el).textContent = !set.size ? 'Alle' : set.size === 1 ? Array.from(set)[0] : set.size + ' gekozen';
    });
    toonActieveFilters();
  }

  function toonActieveFilters() {
    const f = S.filter;
    const chips = [];
    ['ploeg', 'functie', 'type', 'naam'].forEach(k => f[k].forEach(v => chips.push({ k, v, t: label(k) + ': ' + v })));
    if (f.zoek) chips.push({ k: 'zoek', v: f.zoek, t: 'Zoeken: ' + f.zoek });
    $('#actieve-filters').innerHTML = chips.map(c => '<span class="chip">' + esc(c.t) + '<button type="button" data-k="' + c.k + '" data-v="' + esc(c.v) + '" aria-label="Filter verwijderen">×</button></span>').join('');
  }

  function wisselFilter(key, waarde) {
    const set = S.filter[key];
    if (set.has(waarde)) set.delete(waarde); else set.add(waarde);
    vulFilters(); toepassen();
  }

  function initFilters() {
    $('#f-van').addEventListener('change', e => { S.filter.van = e.target.value; if (S.filter.tot < S.filter.van) { S.filter.tot = S.filter.van; $('#f-tot').value = S.filter.tot; } toepassen(); });
    $('#f-tot').addEventListener('change', e => { S.filter.tot = e.target.value; if (S.filter.van > S.filter.tot) { S.filter.van = S.filter.tot; $('#f-van').value = S.filter.van; } toepassen(); });
    let zt;
    $('#f-zoek').addEventListener('input', e => { clearTimeout(zt); zt = setTimeout(() => { S.filter.zoek = e.target.value.trim(); toonActieveFilters(); toepassen(); }, 200); });
    $('#f-wis').addEventListener('click', () => {
      ['ploeg', 'functie', 'type', 'naam'].forEach(k => S.filter[k].clear());
      S.filter.zoek = ''; $('#f-zoek').value = '';
      S.filter.van = S.maanden[0] || ''; S.filter.tot = S.maanden[S.maanden.length - 1] || '';
      vulFilters(); toepassen();
    });
    $$('[data-multi]').forEach(el => {
      const key = el.dataset.multi;
      const lijst = $('.multi-lijst', el);
      $('.multi-knop', el).addEventListener('click', e => {
        e.stopPropagation();
        const open = lijst.hidden;
        $$('.multi-lijst').forEach(l => { l.hidden = true; });
        lijst.hidden = !open;
        if (open) { const zi = $('input[type=search]', lijst); if (zi) zi.focus(); }
      });
      lijst.addEventListener('click', e => e.stopPropagation());
      lijst.addEventListener('change', e => {
        if (e.target.type !== 'checkbox') return;
        if (e.target.checked) S.filter[key].add(e.target.value); else S.filter[key].delete(e.target.value);
        const set = S.filter[key];
        $('.multi-knop', el).textContent = !set.size ? 'Alle' : set.size === 1 ? Array.from(set)[0] : set.size + ' gekozen';
        toonActieveFilters(); toepassen();
      });
      lijst.addEventListener('input', e => {
        if (e.target.type !== 'search') return;
        const q = e.target.value.toLowerCase();
        $$('label', lijst).forEach(l => { l.hidden = !l.textContent.toLowerCase().includes(q); });
      });
      lijst.addEventListener('click', e => {
        if (e.target.matches('[data-alles]')) { S.filter[key].clear(); vulFilters(); toepassen(); lijst.hidden = false; }
        if (e.target.matches('[data-geen]')) { S.filter[key].clear(); uniek(key).forEach(v => S.filter[key].add(v)); vulFilters(); toepassen(); lijst.hidden = false; }
      });
    });
    document.addEventListener('click', () => $$('.multi-lijst').forEach(l => { l.hidden = true; }));
    $('#actieve-filters').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.k === 'zoek') { S.filter.zoek = ''; $('#f-zoek').value = ''; } else S.filter[b.dataset.k].delete(b.dataset.v);
      vulFilters(); toepassen();
    });
  }

  /* ================= Hoofdlus ================= */
  function herbereken() {
    S.regels = B.alleRegels(S.data, S.config);
    S.maanden = Object.keys(S.data.maanden).sort();
    const heeft = S.regels.length > 0;
    $('#leeg').hidden = heeft;
    $('#filterbalk').hidden = !heeft;
    $$('.paneel').forEach(p => { p.hidden = !heeft ? !['data', 'instellingen', 'koppelingen'].includes(p.dataset.paneel) || p.dataset.paneel !== S.tab : p.dataset.paneel !== S.tab; });
    if (!heeft && !['data', 'instellingen', 'koppelingen'].includes(S.tab)) $$('.paneel').forEach(p => { p.hidden = true; });
    const n = new Set(S.regels.map(r => r.mdw)).size;
    $('#bron-info').textContent = heeft
      ? S.maanden.length + ' maand' + (S.maanden.length === 1 ? '' : 'en') + ' (' + B.maandLabel(S.maanden[0], true) + (S.maanden.length > 1 ? ' – ' + B.maandLabel(S.maanden[S.maanden.length - 1], true) : '') + ') · ' + n + ' medewerkers'
      : 'Nog geen gegevens geladen';
    if (S.maanden.some(m => isVoorbeeld(S.data.maanden[m]))) $('#bron-info').textContent += ' · let op: bevat voorbeelddata';
    vulFilters();
    toepassen();
  }

  function toepassen() {
    S.gefilterd = filterRegels();
    renderTab();
  }

  function renderTab() {
    const t = S.tab;
    try {
      if (t === 'overzicht' && S.regels.length) renderOverzicht();
      if (t === 'bouwer' && S.regels.length) renderBouwer();
      if (t === 'medewerkers' && S.regels.length) renderMedewerkers();
      if (t === 'koppelingen') renderKoppelingen();
      if (t === 'instellingen') renderInstellingen();
      if (t === 'data') renderData();
    } catch (e) {
      console.error(e);
      melding('Er ging iets mis bij het tekenen: ' + e.message);
    }
  }

  function kiesTab(t) {
    S.tab = t;
    $$('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
    const heeft = S.regels.length > 0;
    $$('.paneel').forEach(p => { p.hidden = p.dataset.paneel !== t || (!heeft && !['data', 'instellingen', 'koppelingen'].includes(t)); });
    $('#leeg').hidden = heeft || ['data', 'instellingen', 'koppelingen'].includes(t);
    bewaarUi();
    renderTab();
  }

  /* ================= Grafieken ================= */
  function grafiekBasis() {
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    Chart.defaults.font.size = 12;
    Chart.defaults.color = css('--inkt-2');
    Chart.defaults.borderColor = css('--lijn');
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.boxWidth = 8;
    Chart.defaults.plugins.tooltip.backgroundColor = css('--inkt');
    Chart.defaults.plugins.tooltip.titleColor = css('--vlak');
    Chart.defaults.plugins.tooltip.bodyColor = css('--vlak');
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 8;
    Chart.defaults.maintainAspectRatio = false;
    Chart.defaults.animation.duration = 250;
  }
  function teken(id, cfg) {
    if (S.grafieken[id]) S.grafieken[id].destroy();
    const c = document.getElementById(id);
    if (!c) return null;
    S.grafieken[id] = new Chart(c, cfg);
    return S.grafieken[id];
  }
  function assen(opts) {
    opts = opts || {};
    const waardeAs = {
      beginAtZero: true,
      grid: { color: css('--lijn') },
      border: { display: false },
      ticks: { color: css('--inkt-3'), callback: v => nf1.format(v) + (opts.pct ? ' %' : '') },
      stacked: !!opts.stacked,
    };
    const catAs = { grid: { display: false }, border: { color: css('--as') }, ticks: { color: css('--inkt-2'), autoSkip: true, maxRotation: 45 }, stacked: !!opts.stacked };
    return opts.horizontaal ? { x: waardeAs, y: catAs } : { x: catAs, y: waardeAs };
  }
  function staafStijl(kleur, extra) {
    return Object.assign({ backgroundColor: kleur, borderRadius: 4, borderSkipped: 'start', maxBarThickness: 40, borderColor: css('--vlak'), borderWidth: 0 }, extra || {});
  }
  function tooltipWaarde(key) {
    return { callbacks: { label: ctx => ' ' + (ctx.dataset.label ? ctx.dataset.label + ': ' : '') + fmt(ctx.parsed.y != null && ctx.chart.options.indexAxis !== 'y' ? ctx.parsed.y : ctx.parsed.x, ctx.dataset._key || key) } };
  }
  function legendaNodig(n) { return { display: n > 1, position: 'bottom' }; }

  /* ================= Overzicht ================= */
  const KPI_LIJST = [
    { key: 'mdw', label: 'Medewerkers' },
    { key: 'te_werken', label: 'Te werken dagen', beter: 'hoger' },
    { key: 'gewerkt', label: 'Gewerkte dagen', beter: 'hoger' },
    { key: 'pct_gewerkt', label: '% gewerkte dagen', beter: 'hoger' },
    { key: 'pct_ziek', label: '% ziekteverzuim', beter: 'lager' },
    { key: 'ziekte', label: 'Ziektedagen', beter: 'lager' },
    { key: 'vakantie', label: 'Vakantiedagen opgenomen' },
    { key: 'afgewezen', label: 'Afgewezen vakantieaanvragen', beter: 'lager' },
    { key: 'verlofsaldo', label: 'Verlofsaldo (stand)', sub: 'gem_mdw' },
    { key: 'loonsuppletie', label: 'Loonsuppletie' },
  ];

  function renderOverzicht() {
    grafiekBasis();
    const r = S.gefilterd;
    const maandenSel = Array.from(new Set(r.map(x => x.maand))).sort();
    const laatste = maandenSel[maandenSel.length - 1];
    const vorigeIdx = S.maanden.indexOf(laatste) - 1;
    const vorige = vorigeIdx >= 0 ? S.maanden[vorigeIdx] : null;
    const vorigeRegels = vorige ? filterRegelsVoorMaand(vorige) : [];
    const laatsteRegels = r.filter(x => x.maand === laatste);

    $('#kpis').innerHTML = KPI_LIJST.filter(k => k.key === 'mdw' || !verborgen(k.key)).map(k => {
      let waarde, sub = '';
      if (k.key === 'mdw') {
        waarde = nf1.format(new Set(r.map(x => x.mdw)).size);
        sub = maandenSel.length + ' maand' + (maandenSel.length === 1 ? '' : 'en') + ' geselecteerd';
      } else {
        waarde = fmt(B.meet(r, k.key, 'som', S.config), k.key);
        if (k.sub === 'gem_mdw') sub = 'gem. ' + fmt(B.meet(r, k.key, 'gem_mdw', S.config), k.key) + ' per medewerker';
        if (vorige && maandenSel.length >= 1 && k.key !== 'verlofsaldo') {
          const nu = B.meet(laatsteRegels, k.key, 'som', S.config);
          const toen = B.meet(vorigeRegels, k.key, 'som', S.config);
          if (nu != null && toen != null) {
            const d = nu - toen;
            const pijl = d > 0 ? '▲' : d < 0 ? '▼' : '=';
            let cls = '';
            if (k.beter && d !== 0) cls = (d > 0) === (k.beter === 'hoger') ? 'delta-op' : 'delta-neer';
            sub = B.maandLabel(laatste, true) + ': ' + fmt(nu, k.key) + ' <span class="' + cls + '">' + pijl + ' ' + nf1.format(Math.abs(d)) + (isPct(k.key) ? ' pt' : '') + '</span> t.o.v. ' + B.maandLabel(vorige, true);
          }
        }
      }
      return '<button class="kpi" type="button" data-kpi="' + k.key + '"><div class="kpi-label">' + esc((S.config.velden[k.key] && S.config.velden[k.key].label) || k.label) + '</div><div class="kpi-waarde">' + waarde + '</div><div class="kpi-sub">' + sub + '</div></button>';
    }).join('');

    renderTrend();
    renderOorzaak();
    renderPerDim('ploeg', 'c-ploeg', S.ploegMaat);
    renderPerDim('functie', 'c-functie', S.functieMaat);
    renderBesteding();
    renderTop();
    renderSignalen();
  }

  function filterRegelsVoorMaand(ym) {
    const oud = { van: S.filter.van, tot: S.filter.tot };
    S.filter.van = ym; S.filter.tot = ym;
    const r = filterRegels();
    S.filter.van = oud.van; S.filter.tot = oud.tot;
    return r;
  }

  function renderTrend() {
    const sel = $('#trend-maat');
    maatOpties(sel, S.trendMaat, { extra: '<option value="_pct">% gewerkt en % ziekteverzuim</option><option value="_dagen">Te werken en gewerkte dagen</option>' });
    // Trend: alle maanden binnen de overige filters, maar de maandselectie wordt gemarkeerd.
    const basis = filterRegels();
    const maanden = Array.from(new Set(basis.map(r => r.maand))).sort();
    const per = B.groepeer(basis, 'maand');
    let keys = S.trendMaat === '_pct' ? ['pct_gewerkt', 'pct_ziek'] : S.trendMaat === '_dagen' ? ['te_werken', 'gewerkt'] : [S.trendMaat];
    keys = keys.filter(k => veldDef(k));
    const ds = keys.map((k, i) => ({
      label: label(k), _key: k,
      data: maanden.map(m => B.meet(per.get(m) || [], k, 'som', S.config)),
      borderColor: reeksKleur(i), backgroundColor: reeksKleur(i), borderWidth: 2, pointRadius: 4, pointHoverRadius: 6, cubicInterpolationMode: 'monotone',
      pointBorderColor: css('--vlak'), pointBorderWidth: 2,
    }));
    teken('c-trend', {
      type: 'line',
      data: { labels: maanden.map(m => B.maandLabel(m, true)), datasets: ds },
      options: {
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: legendaNodig(ds.length), tooltip: tooltipWaarde() },
        scales: assen({ pct: keys.every(isPct) }),
        onClick: (e, els) => { if (els.length) { const m = maanden[els[0].index]; S.filter.van = m; S.filter.tot = m; vulFilters(); toepassen(); melding('Gefilterd op ' + B.maandLabel(m)); } },
      },
    });
    $('#trend-voet').textContent = maanden.length < 2
      ? 'Lees meer maanden in om een verloop te zien. Klik op een punt om op die maand te filteren.'
      : 'Toont alle ingelezen maanden met de overige filters. Klik op een punt om op die maand te filteren.';
  }

  function renderOorzaak() {
    const r = S.gefilterd;
    const keys = S.config.formules.gewerkt.min.filter(k => veldDef(k) && !verborgen(k));
    const rijen = keys.map(k => ({ k, v: B.meet(r, k, 'som', S.config) || 0 })).sort((a, b) => b.v - a.v);
    teken('c-oorzaak', {
      type: 'bar',
      data: { labels: rijen.map(x => label(x.k, true)), datasets: [Object.assign({ label: 'Dagen', data: rijen.map(x => x.v) }, staafStijl(reeksKleur(0)))] },
      options: {
        indexAxis: 'y',
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + nf1.format(c.parsed.x) + ' dagen' } } },
        scales: assen({ horizontaal: true }),
        onClick: (e, els) => { if (els.length) openInBouwer({ maat: rijen[els[0].index].k, dim: 'ploeg', type: 'bar', split: '' }); },
      },
    });
  }

  function renderPerDim(dim, id, maat) {
    const sel = $('#' + dim + '-maat');
    maatOpties(sel, maat);
    const basis = filterRegels(dim);
    const per = B.groepeer(basis, dim);
    const labels = Array.from(per.keys()).sort(natuurlijk);
    const waarden = labels.map(l => B.meet(per.get(l), maat, 'som', S.config));
    const gekozen = S.filter[dim];
    const kleur = reeksKleur(0);
    const gedimd = css('--as');
    const totaal = B.meet(basis, maat, 'som', S.config);
    teken(id, {
      type: 'bar',
      data: {
        labels: labels.map(l => dim === 'functie' ? l.replace(' havenduwboot', '') : l),
        datasets: [Object.assign({ label: label(maat), _key: maat, data: waarden }, staafStijl(labels.map(l => !gekozen.size || gekozen.has(l) ? kleur : gedimd)))],
      },
      options: {
        indexAxis: dim === 'functie' ? 'y' : 'x',
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { title: c => labels[c[0].dataIndex], label: c => ' ' + label(maat) + ': ' + fmt(dim === 'functie' ? c.parsed.x : c.parsed.y, maat), afterLabel: c => isPct(maat) ? 'Gemiddeld alle: ' + fmt(totaal, maat) : '' } },
        },
        scales: assen({ horizontaal: dim === 'functie', pct: isPct(maat) }),
        onClick: (e, els) => { if (els.length) wisselFilter(dim, labels[els[0].index]); },
      },
    });
  }

  function renderBesteding() {
    const r = S.gefilterd;
    const min = S.config.formules.gewerkt.min.filter(k => veldDef(k));
    let delen = [{ l: label('gewerkt'), v: Math.max(0, B.meet(r, 'gewerkt', 'som', S.config) || 0) }]
      .concat(min.map(k => ({ l: label(k, true), v: B.meet(r, k, 'som', S.config) || 0 })))
      .filter(d => d.v > 0);
    const eerste = delen.shift();
    delen.sort((a, b) => b.v - a.v);
    if (delen.length > 6) {
      const rest = delen.splice(5);
      delen.push({ l: 'Overig', v: rest.reduce((s, d) => s + d.v, 0) });
    }
    if (eerste) delen.unshift(eerste);
    const tot = delen.reduce((s, d) => s + d.v, 0);
    teken('c-besteding', {
      type: 'doughnut',
      data: { labels: delen.map(d => d.l), datasets: [{ data: delen.map(d => d.v), backgroundColor: delen.map((d, i) => reeksKleur(i)), borderColor: css('--vlak'), borderWidth: 2 }] },
      options: {
        cutout: '62%',
        plugins: {
          legend: { position: 'right' },
          tooltip: { callbacks: { label: c => ' ' + c.label + ': ' + nf1.format(c.parsed) + ' dagen (' + (tot ? nf1.format(c.parsed / tot * 100) : 0) + ' %)' } },
        },
      },
    });
  }

  function renderTop() {
    const mdw = B.perMedewerker(S.gefilterd, S.config, meetVelden(true));
    let oorzaken = S.config.formules.gewerkt.min.filter(k => veldDef(k) && k !== 'vakantie' && k !== 'gekocht');
    oorzaken = oorzaken.filter(k => mdw.some(m => m[k] > 0));
    mdw.forEach(m => { m._uitval = oorzaken.reduce((s, k) => s + (m[k] || 0), 0); });
    const top = mdw.filter(m => m._uitval > 0).sort((a, b) => b._uitval - a._uitval).slice(0, 10);
    let reeksen = oorzaken.map(k => ({ l: label(k, true), data: top.map(m => m[k] || 0) }));
    if (reeksen.length > 8) {
      const rest = reeksen.splice(7);
      reeksen.push({ l: 'Overig', data: top.map((m, i) => rest.reduce((s, x) => s + x.data[i], 0)) });
    }
    teken('c-top', {
      type: 'bar',
      data: {
        labels: top.map(m => m.naam),
        datasets: reeksen.map((x, i) => Object.assign({ label: x.l, data: x.data }, staafStijl(reeksKleur(i), { borderWidth: { right: 2 }, borderRadius: 0 }))),
      },
      options: {
        indexAxis: 'y',
        interaction: { mode: 'index', intersect: false, axis: 'y' },
        plugins: { legend: legendaNodig(reeksen.length), tooltip: { filter: c => c.parsed.x > 0, callbacks: { label: c => ' ' + c.dataset.label + ': ' + nf1.format(c.parsed.x) + ' dagen' } } },
        scales: assen({ horizontaal: true, stacked: true }),
        onClick: (e, els) => { if (els.length) openDetail(top[els[0].index].mdw); },
      },
    });
  }

  function signalenLijst(regels) {
    const sg = S.config.signalen;
    const out = [];
    const mdw = B.perMedewerker(regels, S.config, meetVelden(true));
    const zonderRooster = mdw.filter(m => !m.te_werken);
    if (zonderRooster.length) out.push({ ico: 'ℹ️', t: zonderRooster.length + ' medewerker(s) zonder ingevulde ‘te werken dagen’. Percentages kunnen dan niet berekend worden.', ernst: 0 });
    mdw.forEach(m => {
      if (m.te_werken && m.pct_ziek != null && m.pct_ziek > sg.verzuimBoven) out.push({ ico: '⚠', t: m.naam + ': ziekteverzuim ' + fmt(m.pct_ziek, 'pct_ziek') + ' (signaal boven ' + sg.verzuimBoven + ' %)', mdw: m.mdw, ernst: m.pct_ziek });
      if (m.te_werken && m.pct_gewerkt != null && m.pct_gewerkt < sg.gewerktOnder) out.push({ ico: '⚠', t: m.naam + ': ' + fmt(m.pct_gewerkt, 'pct_gewerkt') + ' van de roosterdagen gewerkt (signaal onder ' + sg.gewerktOnder + ' %)', mdw: m.mdw, ernst: 100 - m.pct_gewerkt });
      if (m.verlofsaldo != null && m.verlofsaldo > sg.verlofsaldoBoven) out.push({ ico: '🏖', t: m.naam + ': verlofsaldo ' + fmt(m.verlofsaldo) + ' dagen (signaal boven ' + sg.verlofsaldoBoven + ')', mdw: m.mdw, ernst: 1 });
      if (m.afgewezen >= sg.afgewezenVanaf && sg.afgewezenVanaf > 0) out.push({ ico: '✋', t: m.naam + ': ' + fmt(m.afgewezen) + ' afgewezen vakantieaanvra(a)g(en)', mdw: m.mdw, ernst: 1 });
      if (m.gewerkt != null && m.gewerkt < 0) out.push({ ico: '❗', t: m.naam + ': meer uitval dan beschikbare dagen (gewerkt ' + fmt(m.gewerkt) + '). Controleer de invoer.', mdw: m.mdw, ernst: 50 });
      // Langdurig ziek: 3 of meer opeenvolgende maanden met ziekte >= helft van de roosterdagen
      const rs = m._regels.slice().sort((a, b) => (a.maand < b.maand ? -1 : 1));
      let reeks = 0, max = 0;
      rs.forEach(x => { if (x.te_werken && x.ziekte >= x.te_werken / 2) { reeks++; max = Math.max(max, reeks); } else reeks = 0; });
      if (max >= 3) out.push({ ico: '🩺', t: m.naam + ': ' + max + ' maanden achter elkaar voor meer dan de helft ziek', mdw: m.mdw, ernst: 60 });
    });
    return out.sort((a, b) => b.ernst - a.ernst);
  }

  function renderSignalen() {
    const lijst = signalenLijst(S.gefilterd);
    const max = 25;
    $('#signalen').innerHTML = lijst.slice(0, max).map(s =>
      '<div class="sig"><span class="ico" aria-hidden="true">' + s.ico + '</span><span>' + esc(s.t) + '</span>' +
      (s.mdw ? '<span class="acties"><button class="knop licht" type="button" data-detail="' + esc(s.mdw) + '">Details</button></span>' : '') + '</div>'
    ).join('') + (lijst.length > max ? '<p class="voet">En nog ' + (lijst.length - max) + ' signalen. Pas de signaalwaarden aan bij Instellingen.</p>' : '');
  }

  /* ================= Grafiekbouwer ================= */
  function openInBouwer(st) {
    Object.assign(S.bouwer, st);
    kiesTab('bouwer');
  }

  function bouwerData() {
    const b = S.bouwer;
    const r = S.gefilterd;
    const per = B.groepeer(r, b.dim);
    let labels = Array.from(per.keys());
    const waarde = (rs, k) => B.meet(rs || [], k, b.agg, S.config);
    labels.sort(natuurlijk);
    let reeksen = [];
    let notitie = '';
    if (b.split && b.split !== b.dim && b.type !== 'doughnut') {
      const splitWaarden = Array.from(new Set(r.map(x => x[b.split]))).sort(natuurlijk);
      reeksen = splitWaarden.map(sv => ({ l: String(sv), key: b.maat, data: labels.map(l => waarde((per.get(l) || []).filter(x => x[b.split] === sv), b.maat)) }));
      if (reeksen.length > 8) {
        const tot = x => x.data.reduce((s, v) => s + (v || 0), 0);
        reeksen.sort((a, c) => tot(c) - tot(a));
        notitie = (reeksen.length - 8) + ' kleinere groepen van ‘' + label(b.split) + '’ zijn niet getoond.';
        reeksen = reeksen.slice(0, 8).sort((a, c) => natuurlijk(a.l, c.l));
      }
    } else {
      reeksen = [{ l: label(b.maat), key: b.maat, data: labels.map(l => waarde(per.get(l), b.maat)) }];
      if (b.vergelijk && b.type !== 'doughnut') reeksen.push({ l: label(b.vergelijk), key: b.vergelijk, data: labels.map(l => waarde(per.get(l), b.vergelijk)) });
    }
    // Sorteren en top N op basis van de totale waarde per label
    let idx = labels.map((l, i) => i);
    const totaal = i => reeksen.reduce((s, x) => s + (x.data[i] || 0), 0);
    if (b.sort === 'aflopend') idx.sort((a, c) => totaal(c) - totaal(a));
    if (b.sort === 'oplopend') idx.sort((a, c) => totaal(a) - totaal(c));
    const top = parseInt(b.top, 10);
    if (top > 0 && idx.length > top) {
      if (b.sort === 'natuurlijk') idx.sort((a, c) => totaal(c) - totaal(a));
      idx = idx.slice(0, top);
      if (b.sort === 'natuurlijk') idx.sort((a, c) => a - c);
    }
    labels = idx.map(i => labels[i]);
    reeksen.forEach(x => { x.data = idx.map(i => x.data[i]); });
    return { labels, reeksen, notitie };
  }

  function renderBouwer() {
    grafiekBasis();
    const b = S.bouwer;
    maatOpties($('#b-maat'), b.maat);
    b.maat = $('#b-maat').value;
    $('#b-agg').innerHTML = B.AGGREGATIES.map(a => '<option value="' + a.key + '">' + esc(a.label) + '</option>').join('');
    $('#b-agg').value = b.agg;
    dimOpties($('#b-dim'), b.dim);
    dimOpties($('#b-split'), b.split, 'Niet uitsplitsen');
    $('#b-type').value = b.type; $('#b-sort').value = b.sort; $('#b-top').value = b.top;
    const eenheid = isPct(b.maat);
    maatOpties($('#b-vergelijk'), b.vergelijk, { leeg: 'Niets', filter: m => m.key !== b.maat && isPct(m.key) === eenheid });
    b.vergelijk = $('#b-vergelijk').value;
    $('#b-vergelijk').disabled = !!b.split;

    const { labels, reeksen, notitie } = bouwerData();
    const dimLabels = labels.map(l => b.dim === 'maand' ? B.maandLabel(l, true) : l);
    const horizontaal = b.type === 'hbar' || (b.type === 'stacked' && labels.length > 12);
    // Percentages optellen is misleidend: gestapeld wordt dan naast elkaar getoond.
    const pctGestapeld = b.type === 'stacked' && isPct(b.maat) && b.agg !== 'aantal';
    const gestapeld = b.type === 'stacked' && !pctGestapeld;
    let cfg;
    if (b.type === 'doughnut') {
      const d = reeksen[0].data.map(v => Math.max(0, v || 0));
      let lab = dimLabels.slice(), dat = d.slice();
      if (lab.length > 8) {
        const paren = lab.map((l, i) => [l, dat[i]]).sort((x, y) => y[1] - x[1]);
        const rest = paren.splice(7);
        paren.push(['Overig', rest.reduce((s, p) => s + p[1], 0)]);
        lab = paren.map(p => p[0]); dat = paren.map(p => p[1]);
      }
      const tot = dat.reduce((s, v) => s + v, 0);
      cfg = {
        type: 'doughnut',
        data: { labels: lab, datasets: [{ data: dat, backgroundColor: lab.map((l, i) => reeksKleur(i)), borderColor: css('--vlak'), borderWidth: 2 }] },
        options: { cutout: '60%', plugins: { legend: { position: 'right' }, tooltip: { callbacks: { label: c => ' ' + c.label + ': ' + fmt(c.parsed, b.maat) + (tot ? ' (' + nf1.format(c.parsed / tot * 100) + ' %)' : '') } } } },
      };
    } else {
      const isLijn = b.type === 'line';
      cfg = {
        type: isLijn ? 'line' : 'bar',
        data: {
          labels: dimLabels,
          datasets: reeksen.map((x, i) => {
            const kleur = reeksKleur(i);
            return isLijn
              ? { label: x.l, _key: x.key, data: x.data, borderColor: kleur, backgroundColor: kleur, borderWidth: 2, pointRadius: 4, pointHoverRadius: 6, pointBorderColor: css('--vlak'), pointBorderWidth: 2, cubicInterpolationMode: 'monotone', spanGaps: true }
              : Object.assign({ label: x.l, _key: x.key, data: x.data }, staafStijl(kleur, gestapeld ? { borderRadius: 0, borderWidth: horizontaal ? { right: 2 } : { top: 2 } } : {}));
          }),
        },
        options: {
          indexAxis: horizontaal ? 'y' : 'x',
          interaction: { mode: 'index', intersect: false, axis: horizontaal ? 'y' : 'x' },
          plugins: { legend: legendaNodig(reeksen.length), tooltip: tooltipWaarde(b.maat) },
          scales: assen({ horizontaal, stacked: gestapeld, pct: isPct(b.maat) && b.agg !== 'aantal' }),
          onClick: (e, els) => {
            if (!els.length) return;
            const l = labels[els[0].index];
            if (b.dim === 'maand') { S.filter.van = l; S.filter.tot = l; vulFilters(); toepassen(); }
            else if (b.dim === 'naam') { const r = S.regels.find(x => x.naam === l); if (r) openDetail(r.mdw); }
            else wisselFilter(b.dim, l);
          },
        },
      };
    }
    const hoogte = horizontaal ? Math.max(460, labels.length * 26 + 80) : 460;
    $('#c-bouwer').parentElement.style.height = hoogte + 'px';
    teken('c-bouwer', cfg);
    const aggLabel = (B.AGGREGATIES.find(a => a.key === b.agg) || {}).label;
    $('#b-voet').textContent = [
      label(b.maat) + ' · ' + aggLabel + ' · ingedeeld naar ' + label(b.dim).toLowerCase() + '.',
      isPct(b.maat) && (b.agg === 'som' || b.agg === 'gem_mdw') ? 'Percentages worden berekend over de opgetelde dagen (gewogen).' : '',
      veldDef(b.maat).voorraad && (b.agg === 'som' || b.agg === 'gem_mdw') ? 'Verlofsaldo is een stand: per medewerker telt de laatste maand.' : '',
      notitie,
      pctGestapeld ? 'Percentages kun je niet optellen, daarom staan de staven naast elkaar in plaats van gestapeld.' : '',
      b.dim !== 'maand' && b.dim !== 'naam' ? 'Klik op een staaf om erop te filteren.' : '',
    ].filter(Boolean).join(' ');

    $('#b-tabel').innerHTML = '<thead><tr><th>' + esc(label(b.dim)) + '</th>' + reeksen.map(x => '<th class="getal">' + esc(x.l) + '</th>').join('') + '</tr></thead><tbody>' +
      labels.map((l, i) => '<tr><td>' + esc(dimLabels[i]) + '</td>' + reeksen.map(x => '<td class="getal">' + fmt(x.data[i], b.agg === 'aantal' ? null : x.key) + '</td>').join('') + '</tr>').join('') + '</tbody>';
    S._bouwerTabel = [[label(b.dim)].concat(reeksen.map(x => x.l))].concat(labels.map((l, i) => [dimLabels[i]].concat(reeksen.map(x => x.data[i] == null ? '' : Math.round(x.data[i] * 100) / 100))));
    renderFavorieten();
  }

  function renderFavorieten() {
    $('#favorieten').innerHTML = (S.config.favorieten || []).map((f, i) =>
      '<span class="fav"><button type="button" data-fav="' + i + '">' + esc(f.naam) + '</button><button type="button" data-fav-weg="' + i + '" aria-label="Verwijderen" title="Verwijderen">✕</button></span>').join('');
  }

  function initBouwer() {
    const map = { 'b-maat': 'maat', 'b-agg': 'agg', 'b-dim': 'dim', 'b-split': 'split', 'b-type': 'type', 'b-sort': 'sort', 'b-top': 'top', 'b-vergelijk': 'vergelijk' };
    Object.keys(map).forEach(id => $('#' + id).addEventListener('change', e => { S.bouwer[map[id]] = e.target.value; if (id === 'b-split' && e.target.value) S.bouwer.vergelijk = ''; bewaarUi(); renderBouwer(); }));
    $('#b-csv').addEventListener('click', () => { if (S._bouwerTabel) download('grafiek-' + datumStempel() + '.csv', naarCsv(S._bouwerTabel), 'text/csv'); });
    $('#b-bewaar').addEventListener('click', () => {
      const b = S.bouwer;
      const voorstel = label(b.maat) + ' per ' + label(b.dim).toLowerCase() + (b.split ? ' en ' + label(b.split).toLowerCase() : '');
      const naam = prompt('Naam voor deze grafiek:', voorstel);
      if (!naam) return;
      S.config.favorieten = S.config.favorieten || [];
      S.config.favorieten.push({ naam, instellingen: Object.assign({}, b) });
      bewaarConfigEnMeld('Grafiek bewaard');
      renderFavorieten();
    });
    $('#favorieten').addEventListener('click', e => {
      const f = e.target.closest('[data-fav]'), w = e.target.closest('[data-fav-weg]');
      if (f) { Object.assign(S.bouwer, S.config.favorieten[+f.dataset.fav].instellingen); bewaarUi(); renderBouwer(); }
      if (w && confirm('Deze bewaarde grafiek verwijderen?')) { S.config.favorieten.splice(+w.dataset.favWeg, 1); bewaarConfigEnMeld('Verwijderd'); renderFavorieten(); }
    });
  }

  /* ================= Medewerkers ================= */
  function tabelKolommen() {
    const vast = [{ key: 'naam', l: 'Medewerker' }, { key: 'mdwNr', l: 'Mdw.-nr' }, { key: 'functie', l: 'Functie' }, { key: 'ploeg', l: 'Ploeg' }, { key: 'type', l: 'Dienstverband' }];
    if (S.perMaand) vast.splice(1, 0, { key: 'maand', l: 'Maand' });
    const meet = meetVelden().map(m => ({ key: m.key, l: label(m.key, true), getal: true, titel: label(m.key) }));
    if (!S.kolommen) S.kolommen = meetVelden().map(m => m.key);
    return vast.concat(meet.filter(m => S.kolommen.includes(m.key)));
  }

  function signaalVoor(key, v, r) {
    const sg = S.config.signalen;
    if (v == null) return false;
    if (key === 'pct_ziek') return r.te_werken && v > sg.verzuimBoven;
    if (key === 'pct_gewerkt') return r.te_werken && v < sg.gewerktOnder;
    if (key === 'verlofsaldo') return v > sg.verlofsaldoBoven;
    if (key === 'afgewezen') return sg.afgewezenVanaf > 0 && v >= sg.afgewezenVanaf;
    if (key === 'gewerkt') return v < 0;
    return false;
  }

  function medewerkerRijen() {
    let rijen;
    if (S.perMaand) rijen = S.gefilterd.map(r => Object.assign({}, r));
    else {
      rijen = B.perMedewerker(S.gefilterd, S.config, meetVelden(true));
      rijen.forEach(r => { r.mdwNr = r._regels[0].mdwNr; });
    }
    const { key, richting } = S.tabelSort;
    const f = richting === 'op' ? 1 : -1;
    rijen.sort((a, b) => {
      const x = a[key], y = b[key];
      if (typeof x === 'number' || typeof y === 'number') return ((x == null ? -Infinity : x) - (y == null ? -Infinity : y)) * f;
      return natuurlijk(x, y) * f;
    });
    return rijen;
  }

  function renderMedewerkers() {
    const kol = tabelKolommen();
    const rijen = medewerkerRijen();
    const max = {};
    kol.filter(k => k.getal).forEach(k => { max[k.key] = Math.max.apply(null, rijen.map(r => Math.abs(r[k.key] || 0)).concat([0])); });
    const kop = '<thead><tr>' + kol.map(k => '<th data-sort="' + k.key + '"' + (k.getal ? ' class="getal"' : '') + (k.titel ? ' title="' + esc(k.titel) + '"' : '') + (S.tabelSort.key === k.key ? ' data-richting="' + S.tabelSort.richting + '"' : '') + '>' + esc(k.l) + '</th>').join('') + '</tr></thead>';
    const body = '<tbody>' + rijen.map(r => '<tr>' + kol.map(k => {
      const v = r[k.key];
      if (k.key === 'naam') return '<td><button class="link" type="button" data-detail="' + esc(r.mdw) + '">' + esc(v) + '</button></td>';
      if (k.key === 'maand') return '<td>' + esc(B.maandLabel(v, true)) + '</td>';
      if (!k.getal) return '<td>' + esc(v) + '</td>';
      const sig = signaalVoor(k.key, v, r);
      const breedte = max[k.key] && !isPct(k.key) ? Math.min(100, Math.abs(v || 0) / max[k.key] * 100) : (isPct(k.key) && v != null ? Math.min(100, Math.max(0, v)) : 0);
      return '<td class="getal databalk"><span class="balk" style="width:' + breedte.toFixed(1) + '%"></span><span class="w' + (sig ? ' signaal' : '') + '">' + (sig ? '⚠ ' : '') + fmt(v, k.key) + '</span></td>';
    }).join('') + '</tr>').join('') + '</tbody>';
    const voet = '<tfoot><tr>' + kol.map((k, i) => {
      if (i === 0) return '<td>Totaal (' + rijen.length + ')</td>';
      if (!k.getal) return '<td></td>';
      return '<td class="getal">' + fmt(B.meet(S.gefilterd, k.key, 'som', S.config), k.key) + '</td>';
    }).join('') + '</tr></tfoot>';
    $('#m-tabel').innerHTML = kop + body + voet;
    $('#m-permaand').checked = S.perMaand;
    $('#m-kolomkeuze').innerHTML = meetVelden().map(m => '<label><input type="checkbox" value="' + m.key + '"' + (S.kolommen.includes(m.key) ? ' checked' : '') + '> ' + esc(label(m.key)) + '</label>').join('') +
      '<span class="knoppen" style="margin:0"><button class="knop licht" type="button" data-kol="alle">Alle</button><button class="knop licht" type="button" data-kol="geen">Geen</button><button class="knop licht" type="button" data-kol="kern">Alleen kerncijfers</button></span>';
    S._mTabel = { kol, rijen };
  }

  function initMedewerkers() {
    $('#m-tabel').addEventListener('click', e => {
      const th = e.target.closest('th[data-sort]');
      if (th) {
        const k = th.dataset.sort;
        S.tabelSort = { key: k, richting: S.tabelSort.key === k && S.tabelSort.richting === 'op' ? 'neer' : (S.tabelSort.key === k ? 'op' : (veldDef(k) && !isDim(k) ? 'neer' : 'op')) };
        renderMedewerkers();
      }
    });
    $('#m-permaand').addEventListener('change', e => { S.perMaand = e.target.checked; bewaarUi(); renderMedewerkers(); });
    $('#m-kolommen').addEventListener('click', () => { $('#m-kolomkeuze').hidden = !$('#m-kolomkeuze').hidden; });
    $('#m-kolomkeuze').addEventListener('change', e => {
      const k = e.target.value;
      if (e.target.checked) S.kolommen.push(k); else S.kolommen = S.kolommen.filter(x => x !== k);
      bewaarUi(); renderMedewerkers();
    });
    $('#m-kolomkeuze').addEventListener('click', e => {
      const b = e.target.closest('[data-kol]'); if (!b) return;
      if (b.dataset.kol === 'alle') S.kolommen = meetVelden().map(m => m.key);
      if (b.dataset.kol === 'geen') S.kolommen = [];
      if (b.dataset.kol === 'kern') S.kolommen = ['te_werken', 'ziekte', 'vakantie', 'gewerkt', 'pct_gewerkt', 'pct_ziek', 'verlofsaldo'];
      bewaarUi(); renderMedewerkers();
    });
    $('#m-csv').addEventListener('click', () => {
      if (!S._mTabel) return;
      const { kol, rijen } = S._mTabel;
      const csv = [kol.map(k => k.titel || k.l)].concat(rijen.map(r => kol.map(k => {
        const v = r[k.key];
        if (k.key === 'maand') return B.maandLabel(v);
        return typeof v === 'number' ? Math.round(v * 100) / 100 : v;
      })));
      download('medewerkers-' + datumStempel() + '.csv', naarCsv(csv), 'text/csv');
    });
  }

  /* ================= Detail medewerker ================= */
  function koppelGroepen() {
    const ouder = {};
    const vind = x => { while (ouder[x] !== x) { ouder[x] = ouder[ouder[x]]; x = ouder[x]; } return x; };
    const voeg = (a, b) => { ouder[a] = ouder[a] || a; ouder[b] = ouder[b] || b; ouder[vind(a)] = vind(b); };
    S.config.koppelingen.filter(k => k.status === 'gekoppeld').forEach(k => voeg(k.a, k.b));
    const groepen = {};
    Object.keys(ouder).forEach(k => { const w = vind(k); (groepen[w] = groepen[w] || []).push(k); });
    return Object.values(groepen).filter(g => g.length > 1);
  }

  function openDetail(mdw) {
    const rs = S.regels.filter(r => r.mdw === mdw).sort((a, b) => (a.maand < b.maand ? -1 : 1));
    if (!rs.length) return;
    const inSel = rs.filter(r => (!S.filter.van || r.maand >= S.filter.van) && (!S.filter.tot || r.maand <= S.filter.tot));
    const basis = inSel.length ? inSel : rs;
    const l = rs[rs.length - 1];
    $('#detail-titel').textContent = l.naam;
    const velden = meetVelden();
    const waarde = k => B.meet(basis, k, 'som', S.config);
    const getoond = new Set();
    let groepHtml = koppelGroepen().map((g, i) => {
      const meet = g.filter(k => velden.some(v => v.key === k));
      if (!meet.length) return '';
      meet.forEach(k => getoond.add(k));
      const dims = g.filter(k => isDim(k));
      return '<div class="detail-groep"><h4>🔗 Gekoppelde groep ' + (i + 1) + (dims.length ? ' (met ' + dims.map(d => label(d).toLowerCase()).join(', ') + ')' : '') + '</h4><dl>' + meet.map(k => '<dt>' + esc(label(k)) + '</dt><dd>' + fmt(waarde(k), k) + '</dd>').join('') + '</dl></div>';
    }).join('');
    const perGroep = {};
    velden.filter(v => !getoond.has(v.key)).forEach(v => { (perGroep[v.groep] = perGroep[v.groep] || []).push(v); });
    groepHtml += Object.keys(perGroep).map(g => '<div class="detail-groep"><h4>' + esc(B.GROEP_LABELS[g] || g) + '</h4><dl>' + perGroep[g].map(v => '<dt>' + esc(label(v.key)) + '</dt><dd>' + fmt(waarde(v.key), v.key) + '</dd>').join('') + '</dl></div>').join('');
    const periode = basis.length === 1 ? B.maandLabel(basis[0].maand) : B.maandLabel(basis[0].maand) + ' t/m ' + B.maandLabel(basis[basis.length - 1].maand);
    const sigs = signalenLijst(basis);
    $('#detail-inhoud').innerHTML =
      '<p class="sub">' + esc(l.functie) + ' · ' + esc(l.ploeg) + ' · ' + esc(l.type) + (l.mdwNr && l.mdwNr !== l.naam ? ' · nr. ' + esc(l.mdwNr) : '') + ' · periode: ' + esc(periode) + '</p>' +
      (sigs.length ? '<div class="signalen" style="margin:10px 0">' + sigs.map(s => '<div class="sig"><span class="ico">' + s.ico + '</span><span>' + esc(s.t) + '</span></div>').join('') + '</div>' : '') +
      '<div class="grafiek" style="margin:12px 0"><canvas id="c-detail"></canvas></div>' +
      '<div class="detail-raster">' + groepHtml + '</div>' +
      '<h3 style="margin:16px 0 8px">Per maand</h3><div class="tabel-wrap"><table class="tabel"><thead><tr><th>Maand</th>' + velden.map(v => '<th class="getal" title="' + esc(label(v.key)) + '">' + esc(label(v.key, true)) + '</th>').join('') + '</tr></thead><tbody>' +
      rs.map(r => '<tr><td>' + esc(B.maandLabel(r.maand, true)) + '</td>' + velden.map(v => { const s = signaalVoor(v.key, r[v.key], r); return '<td class="getal' + (s ? ' signaal' : '') + '">' + (s ? '⚠ ' : '') + fmt(r[v.key], v.key) + '</td>'; }).join('') + '</tr>').join('') + '</tbody></table></div>';
    const dlg = $('#detail-dialoog');
    if (!dlg.open) dlg.showModal();
    grafiekBasis();
    const reeks = ['te_werken', 'gewerkt', 'ziekte', 'vakantie'].filter(k => !verborgen(k));
    teken('c-detail', {
      type: rs.length > 1 ? 'line' : 'bar',
      data: {
        labels: rs.map(r => B.maandLabel(r.maand, true)),
        datasets: reeks.map((k, i) => rs.length > 1
          ? { label: label(k), _key: k, data: rs.map(r => r[k]), borderColor: reeksKleur(i), backgroundColor: reeksKleur(i), borderWidth: 2, pointRadius: 4, pointBorderColor: css('--vlak'), pointBorderWidth: 2, cubicInterpolationMode: 'monotone' }
          : Object.assign({ label: label(k), _key: k, data: rs.map(r => r[k]) }, staafStijl(reeksKleur(i)))),
      },
      options: { interaction: { mode: 'index', intersect: false }, plugins: { legend: legendaNodig(reeks.length), tooltip: tooltipWaarde() }, scales: assen() },
    });
  }

  /* ================= Koppelingen ================= */
  const KOPPEL_DIMS = ['ploeg', 'functie', 'type', 'maand'];
  function paarSleutel(a, b) { return [a, b].sort().join('|'); }
  function vindKoppeling(a, b) { const s = paarSleutel(a, b); return S.config.koppelingen.find(k => paarSleutel(k.a, k.b) === s); }
  const STATUS = {
    gekoppeld: { ico: '🔗', t: 'Gekoppeld' },
    niet: { ico: '⛔', t: 'Niet gekoppeld' },
    onbekend: { ico: '❔', t: 'Nog uitzoeken' },
  };
  function statusChip(s) { const x = STATUS[s] || STATUS.onbekend; return '<span class="status ' + s + '">' + x.ico + ' ' + x.t + '</span>'; }

  function correlatieBron() {
    if (S.niveau === 'mdw') return B.perMedewerker(S.gefilterd, S.config, meetVelden(true));
    return S.gefilterd;
  }

  function sterkte(r) {
    if (r == null) return 'geen berekening mogelijk';
    const a = Math.abs(r);
    const richting = r > 0 ? 'positief' : 'negatief';
    if (a >= 0.7) return 'sterk ' + richting + ' verband';
    if (a >= 0.4) return 'matig ' + richting + ' verband';
    if (a >= 0.2) return 'zwak ' + richting + ' verband';
    return 'nauwelijks verband';
  }
  function fmtR(r) { return r == null ? '–' : nf2.format(r); }

  function renderKoppelingen() {
    grafiekBasis();
    const a = $('#k-a'), b = $('#k-b');
    maatOpties(a, S.koppelPaar.a, { dims: KOPPEL_DIMS, leeg: 'Kies een veld…' });
    maatOpties(b, S.koppelPaar.b, { dims: KOPPEL_DIMS, leeg: 'Kies een veld…' });
    $('#k-niveau').value = S.niveau;
    vulFormulierUitKoppeling();
    renderScatter();
    renderKoppelLijst();
    renderMatrix();
    renderSuggesties();
    renderGroepen();
  }

  function vulFormulierUitKoppeling() {
    const { a, b } = S.koppelPaar;
    const k = a && b ? vindKoppeling(a, b) : null;
    const info = $('#k-paar');
    if (!a || !b) { info.innerHTML = ''; return; }
    if (a === b) { info.innerHTML = 'Kies twee verschillende velden.'; return; }
    if (k) {
      $$('input[name=k-status]').forEach(i => { i.checked = i.value === k.status; });
      $('#k-notitie').value = k.notitie || '';
      info.innerHTML = 'Huidige keuze: ' + statusChip(k.status) + ' (opslaan overschrijft)';
    } else {
      info.innerHTML = 'Dit paar is nog niet beoordeeld.';
    }
  }

  function renderScatter() {
    const { a, b } = S.koppelPaar;
    const voet = $('#k-scatter-voet');
    if (!a || !b || a === b) { teken('c-scatter', { type: 'scatter', data: { datasets: [] }, options: { plugins: { legend: { display: false } } } }); voet.textContent = 'Kies twee velden of klik op een vakje in de matrix.'; return; }
    const bron = correlatieBron();
    const dimA = isDim(a), dimB = isDim(b);
    if (!dimA && !dimB) {
      const pts = bron.filter(r => r[a] != null && r[b] != null).map(r => ({ x: r[a], y: r[b], n: r.naam, m: r.maand }));
      const c = B.correlatie(bron, a, b);
      const ds = [{ label: 'Medewerkers', data: pts, backgroundColor: css('--s1') + 'b3', borderColor: css('--vlak'), borderWidth: 1, pointRadius: 5, pointHoverRadius: 7 }];
      if (c.r != null && pts.length > 2) {
        const n = pts.length, mx = pts.reduce((s, p) => s + p.x, 0) / n, my = pts.reduce((s, p) => s + p.y, 0) / n;
        const sxy = pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0), sxx = pts.reduce((s, p) => s + (p.x - mx) ** 2, 0);
        const hel = sxy / sxx, ic = my - hel * mx;
        const xs = pts.map(p => p.x), x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
        ds.push({ type: 'line', label: 'Trendlijn', data: [{ x: x0, y: ic + hel * x0 }, { x: x1, y: ic + hel * x1 }], borderColor: css('--s2'), borderWidth: 2, borderDash: [6, 4], pointRadius: 0, pointHoverRadius: 0 });
      }
      teken('c-scatter', {
        type: 'scatter',
        data: { datasets: ds },
        options: {
          plugins: {
            legend: { display: true, position: 'bottom' },
            tooltip: { filter: c => c.datasetIndex === 0, callbacks: { label: c => ' ' + c.raw.n + (c.raw.m && S.niveau === 'regel' ? ' (' + B.maandLabel(c.raw.m, true) + ')' : '') + ': ' + fmt(c.raw.x, a) + ' / ' + fmt(c.raw.y, b) } },
          },
          scales: {
            x: { title: { display: true, text: label(a) }, grid: { color: css('--lijn') }, ticks: { color: css('--inkt-3') } },
            y: { title: { display: true, text: label(b) }, grid: { color: css('--lijn') }, ticks: { color: css('--inkt-3') }, beginAtZero: true },
          },
          onClick: (e, els) => { const el = els.find(x => x.datasetIndex === 0); if (el) { const p = pts[el.index]; const r = S.regels.find(x => x.naam === p.n); if (r) openDetail(r.mdw); } },
        },
      });
      voet.textContent = 'Correlatie r = ' + fmtR(c.r) + ' over ' + c.n + ' punten: ' + sterkte(c.r) + '. Elke stip is een ' + (S.niveau === 'mdw' ? 'medewerker' : 'medewerker in een maand') + '. Klik op een stip voor details.';
    } else if (dimA !== dimB) {
      const dim = dimA ? a : b, m = dimA ? b : a;
      const bronRegels = S.gefilterd;
      const per = B.groepeer(bronRegels, dim);
      const labels = Array.from(per.keys()).sort(natuurlijk);
      const agg = isPct(m) ? 'som' : 'gem_mdw';
      teken('c-scatter', {
        type: 'bar',
        data: { labels: labels.map(l => dim === 'maand' ? B.maandLabel(l, true) : l), datasets: [Object.assign({ label: label(m), _key: m, data: labels.map(l => B.meet(per.get(l), m, agg, S.config)) }, staafStijl(reeksKleur(0)))] },
        options: { plugins: { legend: { display: false }, tooltip: tooltipWaarde(m) }, scales: assen({ pct: isPct(m) }) },
      });
      voet.textContent = label(m) + (isPct(m) ? '' : ' (gemiddelde per medewerker)') + ' per ' + label(dim).toLowerCase() + '. Grote verschillen tussen de staven wijzen op samenhang.';
    } else {
      const per = B.groepeer(S.gefilterd, a);
      const la = Array.from(per.keys()).sort(natuurlijk);
      let lb = Array.from(new Set(S.gefilterd.map(r => r[b]))).sort(natuurlijk);
      const rest = lb.length > 8 ? lb.splice(7) : [];
      const telling = (rs, waarden) => new Set(rs.filter(r => waarden.includes(r[b])).map(r => r.mdw)).size;
      const reeksen = lb.map(v => ({ l: String(v), w: [v] }));
      if (rest.length) reeksen.push({ l: 'Overig', w: rest });
      teken('c-scatter', {
        type: 'bar',
        data: { labels: la.map(l => a === 'maand' ? B.maandLabel(l, true) : l), datasets: reeksen.map((x, i) => Object.assign({ label: x.l, data: la.map(l => telling(per.get(l), x.w)) }, staafStijl(reeksKleur(i), { borderRadius: 0, borderWidth: { top: 2 } }))) },
        options: { interaction: { mode: 'index', intersect: false }, plugins: { legend: legendaNodig(reeksen.length), tooltip: { callbacks: { label: c => ' ' + c.dataset.label + ': ' + c.parsed.y + ' medewerker(s)' } } }, scales: assen({ stacked: true }) },
      });
      voet.textContent = 'Aantal medewerkers per combinatie van ' + label(a).toLowerCase() + ' en ' + label(b).toLowerCase() + '.';
    }
  }

  function renderKoppelLijst() {
    const filter = $('#k-filter').value;
    const bron = correlatieBron();
    const lijst = S.config.koppelingen.map((k, i) => ({ k, i })).filter(x => !filter || x.k.status === filter);
    $('#k-lijst').innerHTML = '<thead><tr><th>Veld A</th><th>Veld B</th><th>Status</th><th class="getal">r in cijfers</th><th>Toelichting</th><th></th></tr></thead><tbody>' +
      (lijst.length ? lijst.map(({ k, i }) => {
        const c = !isDim(k.a) && !isDim(k.b) ? B.correlatie(bron, k.a, k.b) : { r: null };
        return '<tr><td>' + esc(label(k.a)) + '</td><td>' + esc(label(k.b)) + '</td><td><select data-k-status="' + i + '" aria-label="Status">' +
          Object.keys(STATUS).map(s => '<option value="' + s + '"' + (s === k.status ? ' selected' : '') + '>' + STATUS[s].ico + ' ' + STATUS[s].t + '</option>').join('') + '</select></td>' +
          '<td class="getal" title="' + esc(sterkte(c.r)) + '">' + fmtR(c.r) + '</td><td style="white-space:normal;min-width:220px">' + esc(k.notitie || '') + '</td>' +
          '<td><button class="knop licht" type="button" data-k-bekijk="' + i + '">Bekijk</button> <button class="icon-knop" type="button" data-k-weg="' + i + '" title="Verwijderen" aria-label="Verwijderen">✕</button></td></tr>';
      }).join('') : '<tr><td colspan="6" class="hint">Nog geen koppelingen' + (filter ? ' met deze status' : '') + '.</td></tr>') + '</tbody>';
  }

  function matrixVelden() {
    const bron = correlatieBron();
    return meetVelden().filter(m => {
      const w = bron.map(r => r[m.key]).filter(v => v != null);
      return w.length > 2 && Math.min.apply(null, w) !== Math.max.apply(null, w);
    });
  }

  function kleurVoorR(r) {
    if (r == null) return css('--vlak-2');
    const mid = css('--div-mid'), pool = r >= 0 ? css('--div-pos') : css('--div-neg');
    const t = Math.min(1, Math.abs(r));
    return 'color-mix(in srgb, ' + pool + ' ' + Math.round(t * 100) + '%, ' + mid + ')';
  }

  function renderMatrix() {
    const velden = matrixVelden();
    const bron = correlatieBron();
    const alleenGem = $('#k-alleen-gemarkeerd').checked;
    S._corr = {};
    if (velden.length < 2) {
      $('#k-matrix').innerHTML = '<tbody><tr><td class="hint" style="width:auto;cursor:default">Er zijn (nog) te weinig gevulde velden om verbanden te berekenen. Lees ingevulde gegevens in of laad de voorbeelddata.</td></tr></tbody>';
      $('#k-legenda').innerHTML = '';
      return;
    }
    let html = '<thead><tr><th></th>' + velden.map(v => '<th title="' + esc(label(v.key)) + '">' + esc(label(v.key, true)) + '</th>').join('') + '</tr></thead><tbody>';
    velden.forEach(rv => {
      html += '<tr><th title="' + esc(label(rv.key)) + '">' + esc(label(rv.key, true)) + '</th>';
      velden.forEach(cv => {
        if (rv.key === cv.key) { html += '<td class="diag"></td>'; return; }
        const s = paarSleutel(rv.key, cv.key);
        const c = S._corr[s] || (S._corr[s] = B.correlatie(bron, rv.key, cv.key));
        const k = vindKoppeling(rv.key, cv.key);
        const tekstKleur = c.r != null && Math.abs(c.r) > 0.55 ? '#fff' : css('--inkt');
        html += '<td data-a="' + rv.key + '" data-b="' + cv.key + '" class="' + (alleenGem && !k ? 'gedimd' : '') + '" style="background:' + kleurVoorR(c.r) + ';color:' + tekstKleur + '" title="' + esc(label(rv.key) + ' × ' + label(cv.key) + ': r = ' + fmtR(c.r) + ' (' + sterkte(c.r) + ')' + (k ? ' · ' + STATUS[k.status].t : '')) + '">' +
          (c.r == null ? '·' : nf1.format((Math.round(c.r * 10) / 10) || 0)) + (k ? '<span class="m" aria-hidden="true">' + STATUS[k.status].ico + '</span>' : '') + '</td>';
      });
      html += '</tr>';
    });
    $('#k-matrix').innerHTML = html + '</tbody>';
    $('#k-legenda').innerHTML = '<span>Negatief</span><span class="verloop" aria-hidden="true"></span><span>Positief</span><span>· = niet te berekenen</span><span>🔗 gekoppeld</span><span>⛔ niet gekoppeld</span><span>❔ nog uitzoeken</span><span>Klik op een vakje om het paar te bekijken en te beoordelen.</span>';
  }

  function renderSuggesties() {
    const velden = matrixVelden();
    const bron = correlatieBron();
    const out = [];
    for (let i = 0; i < velden.length; i++) {
      for (let j = i + 1; j < velden.length; j++) {
        const a = velden[i].key, b = velden[j].key;
        const c = (S._corr && S._corr[paarSleutel(a, b)]) || B.correlatie(bron, a, b);
        if (c.r == null || c.n < 8) continue;
        const k = vindKoppeling(a, b);
        const abs = Math.abs(c.r);
        if (!k && abs >= 0.6) out.push({ ico: '💡', a, b, t: label(a) + ' en ' + label(b) + ' hangen sterk samen (r = ' + fmtR(c.r) + '). Horen ze bij elkaar?', score: abs, nieuw: true });
        if (k && k.status === 'niet' && abs >= 0.6) out.push({ ico: '⚠', a, b, t: label(a) + ' en ' + label(b) + ' zijn als ‘niet gekoppeld’ gemarkeerd, maar bewegen in de cijfers sterk samen (r = ' + fmtR(c.r) + ').', score: abs + 1 });
        if (k && k.status === 'gekoppeld' && abs < 0.15) out.push({ ico: '🔍', a, b, t: label(a) + ' en ' + label(b) + ' zijn gekoppeld, maar in de cijfers is nauwelijks samenhang te zien (r = ' + fmtR(c.r) + ').', score: 0.5 });
      }
    }
    S.config.koppelingen.filter(k => k.status === 'onbekend').forEach(k => out.push({ ico: '❔', a: k.a, b: k.b, t: label(k.a) + ' en ' + label(k.b) + ' staan nog op ‘nog uitzoeken’.' + (k.notitie ? ' ' + k.notitie : ''), score: 0.4, nieuw: true }));
    out.sort((x, y) => y.score - x.score);
    $('#k-suggesties').innerHTML = out.slice(0, 15).map(s =>
      '<div class="sig"><span class="ico" aria-hidden="true">' + s.ico + '</span><span>' + esc(s.t) + '</span><span class="acties">' +
      (s.nieuw ? '<button class="knop licht" type="button" data-snel="gekoppeld" data-a="' + s.a + '" data-b="' + s.b + '">🔗 Koppelen</button><button class="knop licht" type="button" data-snel="niet" data-a="' + s.a + '" data-b="' + s.b + '">⛔ Niet</button>' : '') +
      '<button class="knop licht" type="button" data-bekijk-a="' + s.a + '" data-bekijk-b="' + s.b + '">Bekijk</button></span></div>').join('');
  }

  function renderGroepen() {
    $('#k-groepen').innerHTML = koppelGroepen().map((g, i) => '<div class="groep"><strong>Groep ' + (i + 1) + '</strong>' + g.map(k => esc(label(k))).join(' · ') + '</div>').join('');
  }

  function zetKoppeling(a, b, status, notitie) {
    const k = vindKoppeling(a, b);
    if (k) { k.status = status; if (notitie != null) k.notitie = notitie; }
    else S.config.koppelingen.push({ a, b, status, notitie: notitie || '' });
    bewaarConfigEnMeld(label(a) + ' ↔ ' + label(b) + ': ' + STATUS[status].t);
  }

  function bekijkPaar(a, b) {
    S.koppelPaar = { a, b };
    $('#k-a').value = a; $('#k-b').value = b;
    vulFormulierUitKoppeling();
    renderScatter();
    $('#k-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function initKoppelingen() {
    $('#k-a').addEventListener('change', e => { S.koppelPaar.a = e.target.value; vulFormulierUitKoppeling(); renderScatter(); });
    $('#k-b').addEventListener('change', e => { S.koppelPaar.b = e.target.value; vulFormulierUitKoppeling(); renderScatter(); });
    $('#k-niveau').addEventListener('change', e => { S.niveau = e.target.value; bewaarUi(); renderKoppelingen(); });
    $('#k-filter').addEventListener('change', renderKoppelLijst);
    $('#k-alleen-gemarkeerd').addEventListener('change', renderMatrix);
    $('#k-form').addEventListener('submit', e => {
      e.preventDefault();
      const a = $('#k-a').value, b = $('#k-b').value;
      if (!a || !b) { melding('Kies eerst twee velden'); return; }
      if (a === b) { melding('Kies twee verschillende velden'); return; }
      const status = ($('input[name=k-status]:checked') || {}).value || 'onbekend';
      zetKoppeling(a, b, status, $('#k-notitie').value.trim());
      renderKoppelingen();
    });
    $('#k-form').addEventListener('reset', () => { setTimeout(() => { S.koppelPaar = { a: '', b: '' }; $('#k-paar').innerHTML = ''; renderScatter(); }, 0); });
    $('#k-lijst').addEventListener('change', e => {
      const s = e.target.closest('[data-k-status]'); if (!s) return;
      S.config.koppelingen[+s.dataset.kStatus].status = s.value;
      bewaarConfigEnMeld('Status bijgewerkt');
      renderKoppelingen();
    });
    $('#k-lijst').addEventListener('click', e => {
      const w = e.target.closest('[data-k-weg]'), bk = e.target.closest('[data-k-bekijk]');
      if (w && confirm('Deze koppeling verwijderen?')) { S.config.koppelingen.splice(+w.dataset.kWeg, 1); bewaarConfigEnMeld('Koppeling verwijderd'); renderKoppelingen(); }
      if (bk) { const k = S.config.koppelingen[+bk.dataset.kBekijk]; bekijkPaar(k.a, k.b); }
    });
    $('#k-matrix').addEventListener('click', e => { const td = e.target.closest('td[data-a]'); if (td) bekijkPaar(td.dataset.a, td.dataset.b); });
    $('#k-suggesties').addEventListener('click', e => {
      const sn = e.target.closest('[data-snel]'), bk = e.target.closest('[data-bekijk-a]');
      if (sn) { zetKoppeling(sn.dataset.a, sn.dataset.b, sn.dataset.snel); renderKoppelingen(); }
      if (bk) bekijkPaar(bk.dataset.bekijkA, bk.dataset.bekijkB);
    });
  }

  /* ================= Instellingen ================= */
  function formuleTekst() {
    const f = S.config.formules;
    const lijst = (ks, teken) => ks.map(k => label(k, true)).join(' ' + teken + ' ');
    return [
      label('gewerkt') + ' = ' + lijst(f.gewerkt.plus, '+') + (f.gewerkt.min.length ? ' − ' + lijst(f.gewerkt.min, '−') : ''),
      label('pct_gewerkt') + ' = ' + label('gewerkt', true) + ' ÷ (' + lijst(f.pct_gewerkt.noemer, '+') + ') × 100',
      label('pct_ziek') + ' = (' + (lijst(f.pct_ziek.teller, '+') || '0') + ') ÷ (' + lijst(f.pct_ziek.noemer, '+') + ') × 100',
    ];
  }

  function renderInstellingen() {
    const f = S.config.formules;
    const basis = alleMeetDefs().filter(m => !m.berekend);
    $('#i-formules').innerHTML = '<thead><tr><th>Veld</th><th>Gewerkte dagen</th><th>Telt als ziekteverzuim</th><th>Noemer voor percentages</th></tr></thead><tbody>' +
      basis.map(m => {
        const g = f.gewerkt.plus.includes(m.key) ? 'plus' : f.gewerkt.min.includes(m.key) ? 'min' : 'niet';
        return '<tr><td>' + esc(label(m.key)) + '</td>' +
          '<td><select data-f-gewerkt="' + m.key + '" aria-label="Gewerkte dagen"><option value="plus"' + (g === 'plus' ? ' selected' : '') + '>＋ optellen</option><option value="min"' + (g === 'min' ? ' selected' : '') + '>− aftrekken</option><option value="niet"' + (g === 'niet' ? ' selected' : '') + '>telt niet mee</option></select></td>' +
          '<td><input type="checkbox" data-f-ziek="' + m.key + '"' + (f.pct_ziek.teller.includes(m.key) ? ' checked' : '') + ' aria-label="Telt als ziekteverzuim"></td>' +
          '<td><input type="checkbox" data-f-noemer="' + m.key + '"' + (f.pct_ziek.noemer.includes(m.key) ? ' checked' : '') + ' aria-label="Noemer"></td></tr>';
      }).join('') + '</tbody>';
    $('#i-formule-tekst').innerHTML = formuleTekst().map(esc).join('<br>');
    const sg = S.config.signalen;
    $('#i-signalen').innerHTML = [
      ['verzuimBoven', 'Signaal als ziekteverzuim hoger is dan (%)'],
      ['gewerktOnder', 'Signaal als % gewerkte dagen lager is dan (%)'],
      ['verlofsaldoBoven', 'Signaal als verlofsaldo hoger is dan (dagen)'],
      ['afgewezenVanaf', 'Signaal vanaf dit aantal afgewezen aanvragen (0 = uit)'],
    ].map(([k, l]) => '<div class="veld"><label for="sg-' + k + '">' + esc(l) + '</label><input type="number" step="0.5" min="0" id="sg-' + k + '" data-sg="' + k + '" value="' + sg[k] + '"></div>').join('');
    $('#i-velden').innerHTML = '<thead><tr><th>Veld (zoals in Excel)</th><th>Groep</th><th>Eigen naam</th><th>Verbergen</th></tr></thead><tbody>' +
      alleMeetDefs().map(m => '<tr><td>' + esc(m.label) + '</td><td>' + esc(B.GROEP_LABELS[m.groep] || '') + '</td><td><input type="text" data-v-label="' + m.key + '" value="' + esc((S.config.velden[m.key] || {}).label || '') + '" placeholder="' + esc(m.label) + '" aria-label="Eigen naam"></td><td><input type="checkbox" data-v-verborgen="' + m.key + '"' + (verborgen(m.key) ? ' checked' : '') + ' aria-label="Verbergen"></td></tr>').join('') + '</tbody>';
  }

  function bewaarConfigEnMeld(tekst) {
    B.bewaarConfig(S.config);
    if (tekst) melding(tekst);
  }

  function initInstellingen() {
    $('#i-formules').addEventListener('change', e => {
      const f = S.config.formules, t = e.target;
      if (t.dataset.fGewerkt) {
        const k = t.dataset.fGewerkt;
        f.gewerkt.plus = f.gewerkt.plus.filter(x => x !== k);
        f.gewerkt.min = f.gewerkt.min.filter(x => x !== k);
        if (t.value === 'plus') f.gewerkt.plus.push(k);
        if (t.value === 'min') f.gewerkt.min.push(k);
      }
      if (t.dataset.fZiek) { const k = t.dataset.fZiek; f.pct_ziek.teller = f.pct_ziek.teller.filter(x => x !== k); if (t.checked) f.pct_ziek.teller.push(k); }
      if (t.dataset.fNoemer) {
        const k = t.dataset.fNoemer;
        f.pct_ziek.noemer = f.pct_ziek.noemer.filter(x => x !== k); f.pct_gewerkt.noemer = f.pct_gewerkt.noemer.filter(x => x !== k);
        if (t.checked) { f.pct_ziek.noemer.push(k); f.pct_gewerkt.noemer.push(k); }
      }
      bewaarConfigEnMeld('Formule aangepast; alle cijfers zijn opnieuw berekend');
      S.regels = B.alleRegels(S.data, S.config); S.gefilterd = filterRegels();
      $('#i-formule-tekst').innerHTML = formuleTekst().map(esc).join('<br>');
    });
    $('#i-reset-formules').addEventListener('click', () => {
      S.config.formules = B.kopie(B.STANDAARD_CONFIG.formules);
      bewaarConfigEnMeld('Formules teruggezet naar het Excel-sjabloon');
      herbereken();
    });
    $('#i-signalen').addEventListener('change', e => {
      const k = e.target.dataset.sg; if (!k) return;
      S.config.signalen[k] = parseFloat(e.target.value) || 0;
      bewaarConfigEnMeld('Signaalwaarde opgeslagen');
    });
    $('#i-velden').addEventListener('change', e => {
      const t = e.target;
      const k = t.dataset.vLabel || t.dataset.vVerborgen; if (!k) return;
      const v = S.config.velden[k] = S.config.velden[k] || {};
      if (t.dataset.vLabel) { if (t.value.trim()) v.label = t.value.trim(); else delete v.label; }
      if (t.dataset.vVerborgen) v.verborgen = t.checked;
      if (S.kolommen && t.dataset.vVerborgen && !t.checked && !S.kolommen.includes(k)) S.kolommen.push(k);
      bewaarConfigEnMeld('Veld bijgewerkt');
    });
    $('#i-export').addEventListener('click', () => download('koppelingen.json', JSON.stringify(S.config, null, 2), 'application/json'));
    $('#i-import').addEventListener('change', async e => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const c = JSON.parse(await f.text());
        S.config = B.vulConfigAan(c);
        bewaarConfigEnMeld('Instellingen geïmporteerd');
        herbereken();
      } catch (err) { melding('Dit is geen geldig instellingenbestand'); }
      e.target.value = '';
    });
    $('#i-reset').addEventListener('click', async () => {
      if (!confirm('Alle koppelingen, formules, signaalwaarden en veldnamen terugzetten naar de standaard?')) return;
      S.config = await standaardConfig();
      bewaarConfigEnMeld('Instellingen teruggezet');
      herbereken();
    });
  }

  /* ================= Gegevens ================= */
  function renderData() {
    const ms = Object.keys(S.data.maanden).sort();
    $('#d-maanden').innerHTML = '<thead><tr><th>Maand</th><th>Bron</th><th class="getal">Regels</th><th class="getal">Te werken dagen</th><th>Ingelezen op</th><th></th></tr></thead><tbody>' +
      (ms.length ? ms.map(m => {
        const d = S.data.maanden[m];
        const tw = d.regels.reduce((s, r) => s + (r.te_werken || 0), 0);
        return '<tr><td>' + esc(B.maandLabel(m)) + '</td><td>' + esc(d.bron) + '</td><td class="getal">' + d.regels.length + '</td><td class="getal">' + nf1.format(tw) + (tw === 0 ? ' <span class="signaal" title="Er zijn geen te werken dagen ingevuld">⚠</span>' : '') + '</td><td>' + esc(new Date(d.ingelezen).toLocaleString('nl-NL')) + '</td><td><button class="icon-knop" type="button" data-d-weg="' + m + '" title="Verwijderen" aria-label="Verwijderen">✕</button></td></tr>';
      }).join('') : '<tr><td colspan="6" class="hint">Nog niets ingelezen.</td></tr>') + '</tbody>';
  }

  let wachtrij = [];
  async function leesBestanden(files) {
    wachtrij = [];
    for (const f of files) {
      try {
        const buf = await f.arrayBuffer();
        const bladen = B.leesWerkmap(buf, f.name);
        if (!bladen.length) { melding('Geen maandtelling gevonden in ' + f.name); continue; }
        bladen.forEach(b => {
          if (b.heeftMaandKolom) {
            const per = B.groepeer(b.regels, 'maand');
            per.forEach((rs, m) => wachtrij.push({ bestand: f.name, blad: b.blad + (m && m !== 'Onbekend' ? ' (kolom Maand)' : ''), regels: rs, maand: m !== 'Onbekend' ? m : b.maand, extra: b.extra }));
          } else wachtrij.push({ bestand: f.name, blad: b.blad, regels: b.regels, maand: b.maand, extra: b.extra });
        });
      } catch (err) {
        console.error(err);
        melding('Kon ' + f.name + ' niet lezen: ' + err.message);
      }
    }
    if (!wachtrij.length) return;
    const nu = new Date();
    const standaard = nu.getFullYear() + '-' + String(nu.getMonth() + 1).padStart(2, '0');
    $('#import-lijst').innerHTML = wachtrij.map((w, i) =>
      '<div class="import-rij"><div><strong>' + esc(w.bestand) + '</strong><small>Tabblad ‘' + esc(w.blad) + '’ · ' + w.regels.length + ' medewerkers' + (w.maand ? '' : ' · maand niet herkend') + '</small><small class="bestaat" data-i="' + i + '"></small></div>' +
      '<input type="month" required data-import="' + i + '" value="' + (w.maand || standaard) + '" aria-label="Maand"></div>').join('');
    const toonBestaat = () => $$('[data-import]').forEach(inp => { const s = $('.bestaat[data-i="' + inp.dataset.import + '"]'); s.textContent = S.data.maanden[inp.value] ? '⚠ ' + B.maandLabel(inp.value) + ' bestaat al en wordt vervangen' : ''; });
    $('#import-lijst').oninput = toonBestaat;
    toonBestaat();
    $('#import-dialoog').showModal();
  }

  function initData() {
    $('#import-dialoog').addEventListener('close', () => {
      if ($('#import-dialoog').returnValue !== 'ok') { wachtrij = []; return; }
      // Voorbeelddata en echte gegevens mogen niet door elkaar lopen.
      const voorbeeld = Object.keys(S.data.maanden).filter(m => isVoorbeeld(S.data.maanden[m]));
      if (voorbeeld.length && confirm('Er staat nog voorbeelddata (verzonnen namen en cijfers) in het dashboard. ' +
        'Die loopt anders door je echte gegevens heen.\n\nOK = voorbeelddata eerst verwijderen (aanbevolen)\nAnnuleren = voorbeelddata laten staan')) {
        voorbeeld.forEach(m => { delete S.data.maanden[m]; });
      }
      let n = 0;
      $$('[data-import]').forEach(inp => {
        const w = wachtrij[+inp.dataset.import];
        const m = inp.value; if (!m) return;
        S.data.maanden[m] = { bron: w.bestand + (w.blad ? ' / ' + w.blad : ''), ingelezen: new Date().toISOString(), regels: w.regels.map(r => { const k = Object.assign({}, r); delete k.maand; return k; }) };
        (w.extra || []).forEach(x => { if (!S.data.extraVelden.some(e => e.key === x.key)) S.data.extraVelden.push(x); });
        n++;
      });
      wachtrij = [];
      if (!B.bewaarData(S.data)) melding('Let op: opslaan in de browser is mislukt. Maak een back-up.');
      else melding(n + ' maand' + (n === 1 ? '' : 'en') + ' ingelezen');
      S.filter.van = ''; S.filter.tot = '';
      herbereken();
      if (S.tab === 'data') renderData();
    });
    $('#import-ok').addEventListener('click', e => {
      if ($$('[data-import]').some(i => !i.value)) { e.preventDefault(); melding('Kies voor elk bestand een maand'); }
    });
    document.addEventListener('change', e => { if (e.target.matches('.bestand-input')) { leesBestanden(Array.from(e.target.files)); e.target.value = ''; } });
    document.addEventListener('dragover', e => { e.preventDefault(); document.body.classList.add('slepen'); });
    document.addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('slepen'); });
    document.addEventListener('drop', e => {
      e.preventDefault(); document.body.classList.remove('slepen');
      const files = Array.from(e.dataTransfer.files || []).filter(f => /\.(xlsx|xlsm|xls|csv)$/i.test(f.name));
      if (files.length) leesBestanden(files);
    });
    document.addEventListener('click', e => {
      if (e.target.closest('[data-actie="voorbeeld"]')) {
        if (Object.keys(S.data.maanden).length && !confirm('Voorbeelddata vervangt de huidige gegevens in deze browser. Doorgaan?')) return;
        S.data = B.maakVoorbeeld();
        B.bewaarData(S.data);
        S.filter.van = ''; S.filter.tot = '';
        melding('Voorbeelddata geladen (verzonnen namen en cijfers)');
        herbereken();
        if (S.tab === 'data') kiesTab('overzicht');
      }
      const d = e.target.closest('[data-detail]');
      if (d) openDetail(d.dataset.detail);
      const k = e.target.closest('[data-kpi]');
      if (k && k.dataset.kpi !== 'mdw') openInBouwer({ maat: k.dataset.kpi, dim: 'maand', type: 'line', split: '', agg: 'som', sort: 'natuurlijk', top: '0' });
      const p = e.target.closest('[data-png]');
      if (p) { const g = S.grafieken[p.dataset.png]; if (g) { const a = document.createElement('a'); a.href = g.toBase64Image('image/png', 1); a.download = p.dataset.png.replace('c-', 'grafiek-') + '.png'; a.click(); } }
    });
    $('#d-maanden').addEventListener('click', e => {
      const w = e.target.closest('[data-d-weg]'); if (!w) return;
      if (!confirm(B.maandLabel(w.dataset.dWeg) + ' verwijderen?')) return;
      delete S.data.maanden[w.dataset.dWeg];
      B.bewaarData(S.data); herbereken(); renderData();
    });
    $('#d-export').addEventListener('click', () => download('maandtelling-backup-' + datumStempel() + '.json', JSON.stringify({ data: S.data, config: S.config }, null, 2), 'application/json'));
    $('#d-import').addEventListener('change', async e => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const j = JSON.parse(await f.text());
        if (!j.data || !j.data.maanden) throw new Error('geen data');
        if (!confirm('De huidige gegevens worden vervangen door de back-up. Doorgaan?')) return;
        S.data = j.data; S.data.extraVelden = S.data.extraVelden || [];
        if (j.config && confirm('De back-up bevat ook instellingen (koppelingen, formules). Ook die terugzetten?')) { S.config = B.vulConfigAan(j.config); B.bewaarConfig(S.config); }
        B.bewaarData(S.data); herbereken(); renderData(); melding('Back-up teruggezet');
      } catch (err) { melding('Dit is geen geldig back-upbestand'); }
      e.target.value = '';
    });
    $('#d-csv').addEventListener('click', () => {
      const velden = meetVelden(true);
      const rijen = [['Maand', 'Mdw.-nr', 'Medewerker', 'Functie', 'Ploeg', 'Dienstverband'].concat(velden.map(v => label(v.key)))]
        .concat(S.regels.map(r => [r.maand, r.mdwNr, r.naam, r.functie, r.ploeg, r.type].concat(velden.map(v => r[v.key] == null ? '' : Math.round(r[v.key] * 100) / 100))));
      download('maandtelling-alles-' + datumStempel() + '.csv', naarCsv(rijen), 'text/csv');
    });
    $('#d-wis').addEventListener('click', () => {
      if (!confirm('Alle ingelezen gegevens uit deze browser wissen? Instellingen en koppelingen blijven bewaard.')) return;
      S.data = { maanden: {}, extraVelden: [] }; B.bewaarData(S.data); herbereken(); renderData();
    });
  }

  function isVoorbeeld(maand) { return !!(maand && (maand.voorbeeld || maand.bron === 'Voorbeelddata')); }

  /* ================= Start ================= */
  async function standaardConfig() {
    try {
      const r = await fetch('config/koppelingen.json', { cache: 'no-store' });
      if (r.ok) return B.vulConfigAan(await r.json());
    } catch (e) { /* bijv. geopend als bestand: gebruik ingebouwde standaard */ }
    return B.kopie(B.STANDAARD_CONFIG);
  }

  function zetThema() {
    if (S.thema) document.documentElement.setAttribute('data-theme', S.thema);
    else document.documentElement.removeAttribute('data-theme');
  }

  async function start() {
    laadUi();
    zetThema();
    S.data = B.laadData();
    S.config = B.laadConfig() || await standaardConfig();
    $$('.tabs button').forEach(b => b.addEventListener('click', () => kiesTab(b.dataset.tab)));
    $('#thema-knop').addEventListener('click', () => {
      const donkerNu = S.thema ? S.thema === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
      S.thema = donkerNu ? 'light' : 'dark';
      zetThema(); bewaarUi(); renderTab();
    });
    $('#trend-maat').addEventListener('change', e => { S.trendMaat = e.target.value; bewaarUi(); renderTrend(); });
    $('#ploeg-maat').addEventListener('change', e => { S.ploegMaat = e.target.value; bewaarUi(); renderPerDim('ploeg', 'c-ploeg', S.ploegMaat); });
    $('#functie-maat').addEventListener('change', e => { S.functieMaat = e.target.value; bewaarUi(); renderPerDim('functie', 'c-functie', S.functieMaat); });
    $('#detail-sluit').addEventListener('click', () => $('#detail-dialoog').close());
    $('#detail-dialoog').addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.close(); });
    initFilters(); initBouwer(); initMedewerkers(); initKoppelingen(); initInstellingen(); initData();
    herbereken();
    kiesTab(S.tab || 'overzicht');
  }

  window.BISON.app = S;
  document.addEventListener('DOMContentLoaded', start);
})();
