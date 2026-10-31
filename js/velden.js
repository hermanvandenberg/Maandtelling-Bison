/* Velddefinities en standaardinstellingen van het Maandtelling-dashboard.
 * De kolomkoppen in het Excel-bestand worden herkend via `match` (kleine letters,
 * zonder leestekens). Kolommen die niet herkend worden, maar wel getallen bevatten,
 * worden automatisch als extra veld toegevoegd. */
(function () {
  'use strict';

  // Dimensies: velden waarop je kunt filteren en groeperen.
  const DIMENSIES = [
    { key: 'maand', label: 'Maand' },
    { key: 'ploeg', label: 'Ploeg', match: ['ploeg'] },
    { key: 'functie', label: 'Functie', match: ['functie'] },
    { key: 'naam', label: 'Medewerker', match: ['medewerker', 'naam'] },
    { key: 'type', label: 'Dienstverband' },
    { key: 'mdw', label: 'Mdw.-nr', match: ['mdw', 'mdwnr', 'personeelsnummer'] },
  ];

  // Meetwaarden (getallen). groep: beschikbaar / uitval / verlof / overig / berekend
  const MEETWAARDEN = [
    { key: 'te_werken', label: 'Te werken dagen (rooster)', kort: 'Te werken', groep: 'beschikbaar', match: ['te werken dagen volgens rooster', 'te werken dagen'] },
    { key: 'reserveweek', label: 'Inzet in reserveweek', kort: 'Reserveweek', groep: 'beschikbaar', match: ['inzet in reserveweek', 'reserveweek'] },
    { key: 'extra_varen', label: 'Extra varen (dagen)', kort: 'Extra varen', groep: 'beschikbaar', match: ['extra varen in dagen', 'extra varen'] },
    { key: 'ziekte', label: 'Uitval wegens ziekte', kort: 'Ziekte', groep: 'uitval', match: ['uitval wegens ziekte'] },
    { key: 'boven_sterkte', label: 'Uitval wegens boven de sterkte', kort: 'Boven sterkte', groep: 'uitval', match: ['uitval wegens boven de sterkte', 'boven de sterkte'] },
    { key: 'opleiding', label: 'Uitroostering wegens opleiding', kort: 'Opleiding', groep: 'uitval', match: ['uitroostering wegens opleiding', 'opleiding'] },
    { key: 'werkgroep', label: 'Uitroostering wegens werkgroep', kort: 'Werkgroep', groep: 'uitval', match: ['uitroostering wegens werkgroep', 'werkgroep'] },
    { key: 'omstandigheden', label: 'Uitroostering omstandigheden', kort: 'Omstandigheden', groep: 'uitval', match: ['uitroostering omstandigheden', 'omstandigheden'] },
    { key: 'or', label: 'Uitroostering wegens OR', kort: 'OR', groep: 'uitval', match: ['uitroostering wegens or'] },
    { key: 'vakantie', label: 'Opname vakantiedagen', kort: 'Vakantie', groep: 'verlof', match: ['opname vakantie dagen', 'opname vakantiedagen'] },
    { key: 'gekocht', label: 'Gekochte vakantiedagen', kort: 'Gekocht', groep: 'verlof', match: ['gekochte vakantiedagen', 'gekochte vakantie dagen'] },
    { key: 'geboorteverlof', label: 'Opname geboorteverlof', kort: 'Geboorteverlof', groep: 'verlof', match: ['opname geboorte verlof', 'opname geboorteverlof', 'geboorte'] },
    { key: 'afgewezen', label: 'Afgewezen vakantieaanvragen', kort: 'Afgewezen', groep: 'overig', match: ['afgewezen vakantie aanvragen', 'afgewezen'] },
    { key: 'verlofsaldo', label: 'Huidig verlofsaldo', kort: 'Verlofsaldo', groep: 'overig', voorraad: true, match: ['huidig verlofsaldo', 'verlofsaldo'] },
    { key: 'loonsuppletie', label: 'Loonsuppletie', kort: 'Loonsuppletie', groep: 'overig', match: ['loonsuppletie'] },
    // Berekende velden: worden altijd opnieuw berekend met de formules uit de instellingen.
    { key: 'gewerkt', label: 'Daadwerkelijk gewerkte dagen', kort: 'Gewerkt', groep: 'berekend', berekend: true, match: ['daadwerkelijk gewerkte dagen'] },
    { key: 'pct_gewerkt', label: 'Percentage gewerkte dagen', kort: '% gewerkt', groep: 'berekend', berekend: true, ratio: 'pct_gewerkt', eenheid: '%', match: ['percentage gewerkte dagen'] },
    { key: 'pct_ziek', label: 'Percentage ziekteverzuim', kort: '% verzuim', groep: 'berekend', berekend: true, ratio: 'pct_ziek', eenheid: '%', match: ['percentage ziekteverzuim'] },
  ];

  const GROEP_LABELS = {
    beschikbaar: 'Beschikbaar',
    uitval: 'Uitval & uitroostering',
    verlof: 'Verlof',
    overig: 'Overig',
    berekend: 'Berekend',
    extra: 'Extra kolommen',
  };

  // Standaardinstellingen: komen overeen met de formules in het Excel-sjabloon.
  const STANDAARD_CONFIG = {
    versie: 1,
    formules: {
      // T = E+F+G-H-I-J-K-L-M-N-O-P
      gewerkt: {
        plus: ['te_werken', 'reserveweek', 'extra_varen'],
        min: ['ziekte', 'boven_sterkte', 'opleiding', 'werkgroep', 'omstandigheden', 'or', 'vakantie', 'gekocht', 'geboorteverlof'],
      },
      // U = T/E*100
      pct_gewerkt: { teller: ['gewerkt'], noemer: ['te_werken'] },
      // V = (H+I)/E*100
      pct_ziek: { teller: ['ziekte', 'boven_sterkte'], noemer: ['te_werken'] },
    },
    koppelingen: [
      { a: 'ziekte', b: 'pct_ziek', status: 'gekoppeld', notitie: 'Ziekte telt mee in het ziekteverzuim (formule Excel).' },
      { a: 'boven_sterkte', b: 'pct_ziek', status: 'onbekend', notitie: 'In de Excel-formule telt uitval wegens boven de sterkte mee als ziekteverzuim. Klopt dat?' },
      { a: 'gekocht', b: 'gewerkt', status: 'onbekend', notitie: 'Gekochte vakantiedagen worden in Excel afgetrokken van de gewerkte dagen. Klopt dat?' },
      { a: 'vakantie', b: 'verlofsaldo', status: 'gekoppeld', notitie: 'Opname vakantie verlaagt het verlofsaldo.' },
      { a: 'ziekte', b: 'loonsuppletie', status: 'onbekend', notitie: '' },
    ],
    signalen: {
      verzuimBoven: 5, // % ziekteverzuim waarboven een signaal verschijnt
      gewerktOnder: 80, // % gewerkt waaronder een signaal verschijnt
      verlofsaldoBoven: 40, // dagen verlofsaldo waarboven een signaal verschijnt
      afgewezenVanaf: 1, // aantal afgewezen aanvragen vanaf wanneer een signaal verschijnt
    },
    favorieten: [], // bewaarde grafieken uit de grafiekbouwer
    velden: {}, // per veld: { label: 'eigen naam', verborgen: true }
  };

  window.BISON = window.BISON || {};
  Object.assign(window.BISON, { DIMENSIES, MEETWAARDEN, GROEP_LABELS, STANDAARD_CONFIG });
})();
