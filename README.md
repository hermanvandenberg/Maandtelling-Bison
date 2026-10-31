# Maandtelling Bison – dashboard

Een interactief dashboard voor de maandtelling van de Bison. Je leest het ingevulde Excel-bestand in en ziet direct
uitval, ziekteverzuim, verlof en inzet per maand, ploeg, functie en medewerker.

**Privacy:** alles draait in je eigen browser. Het Excel-bestand wordt niet geüpload en er staan geen namen of
telgegevens in deze repo. Ingelezen gegevens worden alleen in de browser van de gebruiker bewaard (localStorage).

## Openen

- **Online:** via GitHub Pages (zie hieronder), bijvoorbeeld `https://hermanvandenberg.github.io/Maandtelling-Bison/`.
- **Lokaal:** download de repo als ZIP en open `index.html` in Chrome, Edge of Firefox. Alles werkt offline.

## Zo werkt het

1. Ga naar **Gegevens** en sleep het ingevulde Excel-bestand erin (of klik op *Bestand kiezen*).
2. Kies per bestand (of per tabblad) de maand. Staat de maand in de bestandsnaam of tabbladnaam
   (bijv. `Maandtelling 2026-03.xlsx` of tabblad `Maart 2026`), dan wordt die al ingevuld.
   Een maand opnieuw inlezen vervangt de oude versie.
3. Lees elke maand in; het dashboard bouwt zo een verloop over de tijd op.

Wil je eerst rondkijken? Klik op **Voorbeelddata laden** (verzonnen namen en cijfers).

Een volledige handleiding staat in het tabblad **Handleiding** van het dashboard, en als PDF om te printen in [`docs/Handleiding-Maandtelling-Bison.pdf`](docs/Handleiding-Maandtelling-Bison.pdf).

## Onderdelen

| Tabblad | Wat je ermee doet |
|---|---|
| **Overzicht** | Kerncijfers met vergelijking t.o.v. de vorige maand, verloop per maand, niet-gewerkte dagen per oorzaak, vergelijking per ploeg en functie, verdeling van de roosterdagen, top 10 uitval en automatische signalen. Klik op een ploeg of functie om erop te filteren, op een KPI om hem in de grafiekbouwer te openen. |
| **Grafiekbouwer** | Kies zelf meetwaarde, berekening (totaal, gemiddelde per medewerker, mediaan, hoogste, laagste, aantal), indeling, uitsplitsing, grafiektype, sortering en top N. Bewaar grafieken als favoriet, exporteer als afbeelding of CSV. |
| **Medewerkers** | Sorteerbare tabel per medewerker of per maand, met kolomkeuze, databalken, signaalmarkeringen en CSV-export. Klik op een naam voor het detailscherm. |
| **Koppelingen** | Leg vast welke gegevens wel (🔗) of juist niet (⛔) aan elkaar gekoppeld horen, of nog uitgezocht moeten worden (❔), met toelichting. Een samenhangmatrix laat zien hoe sterk velden in de cijfers samen bewegen; het dashboard doet suggesties en waarschuwt als je oordeel en de cijfers botsen. Gekoppelde velden vormen groepen die in het detailscherm bij elkaar staan. |
| **Instellingen** | Pas aan wat meetelt in *gewerkte dagen*, *% gewerkt* en *% ziekteverzuim* (standaard precies de Excel-formules), stel signaalwaarden in, hernoem of verberg velden en exporteer/importeer alle instellingen. |
| **Gegevens** | Bestanden inlezen, maanden beheren, back-up maken en terugzetten, alles exporteren als CSV. |

Filters bovenaan (periode, ploeg, functie, dienstverband, medewerker, zoeken) werken op alle onderdelen. Met **PDF maken** in de filterbalk kies je welke onderdelen in een PDF komen, om te mailen of te printen.

## Instellingen delen

Koppelingen, formules, signaalwaarden, veldnamen en bewaarde grafieken worden in de browser bewaard. Om ze te
delen: **Instellingen → Instellingen exporteren**. Het bestand `koppelingen.json` kan een ander importeren, of je
zet het in deze repo als `config/koppelingen.json`; dan is het de standaard voor iedereen die het dashboard voor het
eerst opent.

## Excel-sjabloon

Het dashboard verwacht de kolommen uit het sjabloon *Maandtelling Power BI Bison*: Mdw., Medewerker, Functie, Ploeg,
de telkolommen (te werken dagen t/m loonsuppletie) en de berekende kolommen. Kolommen worden op kopnaam herkend,
dus de volgorde maakt niet uit. Extra kolommen met getallen worden automatisch als extra veld toegevoegd. Een kolom
*Maand* is ook mogelijk: dan kunnen meerdere maanden in één tabblad staan.

## Publiceren met GitHub Pages

De workflow in `.github/workflows/pages.yml` publiceert de site bij elke push naar `main`. Zet eenmalig in de repo
**Settings → Pages → Source** op **GitHub Actions**.

## Techniek

Statische site zonder build-stap: `index.html`, `css/`, `js/` en meegeleverde bibliotheken in `vendor/`
([SheetJS](https://sheetjs.com) voor Excel, [Chart.js](https://www.chartjs.org) voor grafieken).
