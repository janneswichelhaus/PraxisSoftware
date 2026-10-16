# DESIGN – so sieht eine Seite dieser App aus

Stand 16.10.2026. **Die einzige Seitenrezeptur.** Jede neue oder umgebaute Seite folgt ihr (Leitfaden
[L6](leitfaden-schlank.md)). Maßstab sind die abgenommenen Referenzseiten (unten);
die Handoffs bleiben Historie. Werte stehen in
[`src/index.css`](../../src/index.css), Bausteine in [`src/components/ui`](../../src/components/ui),
vorgeführt in [`ui-bausteine.html`](../../tests/e2e/fixtures/ui-bausteine.html).

## Grundsätze

1. **Telefon zuerst.** Entworfen und geprüft bei 375 px, dann 1280. Unterwegs am Lastenrad: eine
   Hand, Daumen unten – die Haupthandlung liegt im unteren Drittel oder in voller Breite.
2. **Sonnenlicht.** Weiß, Tinte, hoher Kontrast; kein Dunkelmodus (ANN-401). Farbe nur für Marke
   und Bedeutung (L5).
3. **Ziele ≥ 44 px**, auch mit Handschuhen. Zeile 56, Knopf 48 (kompakt 44), Feld 48.
4. **Weniger zeigen** (L1, L2): eine Karte je Aufgabe, Seltenes eingeklappt, keine Erklärsätze.
5. **Arbeit an jeder Zeile** (L3), Status als Zeichen und Wort.

## Tokens (kurz)

Farben, Schriftrollen (`text-h2-mobil`, `text-liste` 15, `text-kleingedruckt`), Radien (Knopf/Feld 10,
Karte 14, Bild 16, Pille), Maße und Breiten stehen nur in `index.css`; `src/designsystem.test.ts`
wacht. **Inhaltsbreiten:** Liste und Objekt volle Breite (bis 1200), `max-w-formular` (36rem) für
Formulare, `max-w-spalte` (48rem) für eine einzelne Arbeitsspalte, `max-w-prose` für Lesetext
(ANN-402). **Rhythmus:** 4/8/12/16/24/32 px; Abschnitt zu Abschnitt 32 (`Section`), Kopf zu Inhalt
24, in der Karte 16. Keine Schatten, Ebenen aus Fläche und Linie.

## Seitentypen

**Liste** (Patient:innen, Übungen, Rechnungen): `PageHeader` (Titel, eine Zeile, „Anlegen“ kompakt)
→ `Filterleiste` (Suche offen, weitere Filter am Telefon hinter „Filter (n)“) → `ListRows`/`ListRow`
oder `Datenliste` (Spalten ab 1024 px) → Leerzustand in der Karte → „Weitere laden“. Die ganze Zeile ist
das Ziel; die Arbeit steht als `aktion` daneben.

**Objekt/Detail** (Akte, Trainingskund:in, Mitarbeiter:in, Rad, Rechnung, Übungsplan): `Rueckweg` ab
640 px → `Objektkopf` (Titel, Metazeile, Abzeichen nur für Ausnahmen, ≤ 2 Aktionen, `Warnzeile`,
Hinweise, `Reiterleiste`) → Reiterinhalt: höchstens vier `Tile` für das Wichtigste, dann
`Listenabschnitt`e; Kontext ab 900 px im `Zweispalter` (`schmal`). Reiter: Arbeit → Verlauf →
Verträge/Grundlagen → Stammdaten. Zerstörendes leise am Ende des Reiters, mit `Rueckfrage`. Bis drei
Abschnitte genügt `PageHeader` mit `Section`s.

**Formular**: `Rueckweg` → `PageHeader` → `Fehlerzusammenfassung` (ab zwei Feldern) → `Section` ohne
Rahmen mit `Feldgruppe`, alles in `max-w-formular`; zwei Felder nebeneinander nur ab 640 px und nur,
was zusammengehört (PLZ/Ort) → `Formularfuss` (Speichern zuerst, Abbrechen leise; am Telefon
untereinander in voller Breite).

**Arbeitsseite** (Schreibseite, Erhebung, Trainingsprotokoll): ein langes Eingabefeld, die Knöpfe
in der klebenden `Aktionsleiste` über der Tableiste, Hauptknopf rechts. Die Schreibseite ist eine
Fläche ohne Karten (`einbettung="flaeche"`); andere Arbeitsseiten bleiben gewöhnliche Seiten.

**Geführter Ablauf** (Check-Up): `Dialogfenster vollbild`, Kopf mit Schritt, Objekt, ✕;
„← Zurück“, `ProgressBar`; je Seite eine Frage ohne Rollen, die Antwort führt weiter; Abschluss
über festem `Formularfuss`. Nicht für Tägliches.

**Druckblatt** (Rechnung, Bericht, Planblatt, Tagesplan): eigenes Profil – Briefkopf, Absenderzeile,
Tabellen und eigene Überschriften erlaubt, Bedienung `nicht-drucken`. Geprüft im Druckbild; die
Ratsche zählt dort weder Überschriften noch Tabellen.

**Plattform** (`/p`, Patient:innen bis 78): dieselben Bausteine, das Gerüst hebt alles auf **18 px**
(`.plattform-schrift`). Titel über `PageHeader`, keine handgesetzten `h1`; Knöpfe in voller Größe;
eine Aufgabe je Seite; `plattform-barrierefreiheit.spec.ts` wacht.

## Welcher Baustein wann

| Situation                             | Baustein                                               |
| ------------------------------------- | ------------------------------------------------------ |
| Kopf einer Seite                      | `PageHeader` (Aktionen ohne Angabe kompakt, ANN-403)   |
| Kopf eines Objekts mit Bereichen      | `Objektkopf` + `Reiterleiste`, `Warnzeile`             |
| Abschnitt / Überschrift im Block      | `Section` (`rahmen` für Auskunft) / `Zwischentitel`    |
| Sammlung gleichartiger Dinge          | `ListRows` + `ListRow` (`bild`, `betrag`, `aktion`)    |
| Abschnitt, der eine Liste ist         | `Listenabschnitt` (Titel, Zahl, Leerzustand)           |
| Vergleichen, Beträge in Spalten       | `Datenliste`                                           |
| 2–4 herausgehobene Angaben            | `TileGrid` + `Tile`                                    |
| Beschriftete Angaben                  | `DetailList` / `DetailRow`                             |
| Seltenes, Archiv, Hilfe auf Abruf     | `Disclosure`                                           |
| Suche und Filter über einer Liste     | `Filterleiste`: `SearchField`, `Select`, `Filterchips` |
| 2–4 Ansichten, genau eine gilt        | `Segment`                                              |
| Sprungziel, Filterwert                | `Chip` / `Filterchips`                                 |
| Laden, Fehler, Veraltet, Leer         | `Abfragezustand` (Satz `VERBINDUNG_PRUEFEN`)           |
| Nach einem Vorgang / kurze Meldung    | `Rueckmeldung` / `Statusmeldung`                       |
| Bestätigung am Klickort / Fenster     | `Rueckfrage` / `Dialogfenster`                         |
| Knöpfe am Formularende / Arbeitsseite | `Formularfuss` / `Aktionsleiste`                       |
| Haupt- und Kontextspalte              | `Zweispalter`                                          |
| Bild, Foto                            | `Medienbild` (4:3, ganz; `vorschau` 56 × 56)           |
| Handlung, Seitenwechsel, Symbol, Link | `Button`, `ButtonLink`, `Symbolknopf`, `Textlink`      |
| Rechtssatz am Seitenende              | `Kleingedrucktes`                                      |

## Regeln

1. **Überschriften nur über Bausteine:** `PageHeader`/`Objektkopf` (h1), `Section` (h2/h3),
   `Zwischentitel` (h3/h4). Kein `<h2 className=…>`.
2. **Kein Kasten im Kasten.** Gruppen in einer Karte trennt ein `Zwischentitel` oder eine Linie;
   Meldungen sind Zeilen (Fläche oder Linie links).
3. **Listen nur über `ListRow`/`Listenabschnitt`, Tabellen nur über `Datenliste`.** Kein
   `divide-y`, keine Karte je Eintrag, kein `<table>` am Telefon.
4. **Ein Hauptknopf je Ansicht.** Reihenfolge primär → sekundär → leise; Größe nach Ort: Seite 48,
   Kopf, Karte, Zeile 44. Nur `Button`, `ButtonLink`, `Symbolknopf`, `Chip`, `Segment`.
5. **Status = Zeichen + Wort** (`Badge`, `StatusMark`); der Regelfall trägt kein Abzeichen.
6. **Keine Erklärsätze.** Beschreibung im Kopf höchstens eine Zeile; Hilfe auf Abruf
   (`Disclosure` „So geht’s“); Hinweis am Feld nur, wenn er die Eingabe ändert; Rechtssätze
   (Protokollierung, Navigation, MDR) als `Kleingedrucktes`.
7. **Breiten und Abstände nur aus Tokens und Rhythmus**; neue Seiten ohne `mt-5`, `mt-10`,
   `max-w-xl/2xl/3xl`.
8. **Zustände über `Abfragezustand`**; Leerzustand in der Karte, wenn daneben Karten stehen.
9. **Links unterstrichen** (`Textlink`), Telefon und Mail als `tel:`/`mailto:`.
10. **Tablet (640–1023)** wie Telefon, Felder und Filter nebeneinander; zwei Spalten erst ab 900 px
    Inhaltsbreite.

## Anti-Muster → Ersatz

- `ul.divide-y` mit eigener Höhe → `ListRow`; Tabelle mit `min-w-[36rem]` → `Datenliste`.
- `<h3 className="text-base font-semibold">` → `Zwischentitel`; eigenes `<details>` → `Disclosure`.
- `<button className=…>` als Umschalter oder Pille → `Segment`, `Chip`, `Symbolknopf`.
- Anlegen-Knopf 48 px unter dem Titel → `PageHeader`-Aktion (kompakt).
- zwölf Abschnitte auf einer Objektseite → `Objektkopf` + `Reiterleiste`.
- Suche und drei Filter offen über der Liste → `Filterleiste`.
- `isPending ? … : isError ? …` von Hand → `Abfragezustand`.
- `max-w-xl/2xl/3xl` → `max-w-formular` / `max-w-spalte`; erklärender Satz → weglassen.

## Entscheidungen zu den Lücken des Maßstabs

Nummern der Analyse „Designmaßstab“, Abschnitt 9:

- **9.1 Dunkelmodus:** nein (ANN-401). **9.2 Zwischentitel:** Baustein, 16/600 Tinte.
- **9.3 Inhaltsbreiten:** Tokens `formular` und `spalte` (ANN-402). **9.4 Rechner:** Liste voll,
  Objekt mit `Zweispalter`, Formular `max-w-formular`.
- **9.5 Hauptknopf am Telefon:** `Formularfuss`; `Aktionsleiste` nur auf Arbeitsseiten.
- **9.6 Objektseiten:** `Objektkopf` + `Reiterleiste`, Reiterfolge wie oben.
- **9.7 Zeile mit Aktion:** `ListRow aktion`, neben dem Ziel. **9.8 Filter:** `Filterleiste` (ANN-405).
- **9.9 Umschalter:** `SubNav` = Bereich, `Reiterleiste` = Teil eines Objekts, `Segment` = Ansicht,
  `Filterchips` = Filterwerte (ANN-407).
- **9.10 Bilder:** `Medienbild` 4:3, ganz statt beschnitten, Platzhalter, Pflicht-`alt` (ANN-404).
  Übungen haben keine Zeichnung (ANN-539): Dosierung als `Tile`-Reihe, dann die Anleitung als
  `Schrittliste`; Zeilen ohne Vorschaubild.
- **9.11 Tabellen am Telefon:** `Datenliste`; `Verlaufstabelle` nur für Zeitreihen.
- **9.12 Plattform:** Profil oben, keine eigene Farbwelt. **9.13 Druck:** Profil „Druckblatt“.
- **9.14 Rückmeldung:** `ui/Rueckmeldung.tsx`. **9.15 Symbole:** Raster 20, Strich 1,75–2, runde
  Enden, `currentColor`, `aria-hidden`; bleiben am Ort, bis eines zweimal gebraucht wird.
- **9.16 Zerstörendes/Seltenes:** `Rueckfrage`, Auslöser leise am Ende. **9.17 Leerzustand:** in der
  Karte. **9.18 Rhythmus:** Stufen 1/2/3/4/6/8. **9.19 Tablet:** Regel 10.

## Ratsche

`src/designsystem.test.ts` zählt je Verzeichnis `divide-y`, eigene Überschriften, eigene
`<details>`, rohe `<button className>`, `max-w-xl/2xl/3xl` und `<table>` gegen
[`src/designsystem.grenzen.ts`](../../src/designsystem.grenzen.ts) (ANN-400). Darüber: Seite nach
diesem Dokument bauen. Darunter: Grenze auf den neuen Stand senken. Nie heben.

## Prüfliste je Seite

1. Seitentyp gewählt; ein `PageHeader` oder `Objektkopf`, keine eigene Überschrift.
2. Bei 375 und 1280 px angesehen; kein Querrollen; alle Ziele ≥ 44 px.
3. Haupthandlung mit dem Daumen erreichbar; genau ein Hauptknopf.
4. Listen über `ListRow`, Tabellen über `Datenliste`, Aufklapper über `Disclosure`.
5. Kein Kasten im Kasten; höchstens vier Kacheln.
6. Kein Erklärsatz; Beschreibung eine Zeile.
7. Laden, Fehler, Leer, Veraltet über `Abfragezustand`.
8. Status als Zeichen und Wort; Regelfall ohne Abzeichen.
9. Breiten und Abstände aus Tokens und Rhythmus.
10. Zerstörendes leise am Ende, mit `Rueckfrage`.
11. Ratsche grün und, wo umgebaut, Grenze gesenkt.
12. Plattform: alles ≥ 18 px; Druckblatt: im Druckbild geprüft.

## Referenzseiten

Übersicht (`today/MyDayPage.tsx`, `uebersicht.html`), Akte (`patients/PatientRecordLayout.tsx`,
`akte.html`), Termin-Fenster (`appointments/TerminAktionen.tsx`, `termin.html`), Schreibseite
(`documentation/CompleteTreatmentPage.tsx`, `schreibseite.html`), Kalender
(`appointments/CalendarPage.tsx`, `kalender.html`), Tour (`tours/TourenPage.tsx`, `tour.html`),
Rahmen (`app/AppShell.tsx`), Rechnungsliste als Vorbild der `Datenliste`.

## Was in älteren Handoffs überholt ist

- [01.10.](handoff-2026-10-01-praxissoftware.md): Farbtabelle (Grundton B gilt, L5); Terminseite,
  Abschnitt 6 (seit 03.10. ein Fenster, `TerminAktionen`); Kontextspalte und Kachelreihe im Kopf der
  Akte, Abschnitt 7 (entfallen; Abzeichen und `Warnzeile`); Knöpfe, Haken und Segment mit 40 px (44,
  ANN-199); Hinweissätze unter Abschnitten (Hilfe auf Abruf); Bewegung „kein Fade, kein Bounce“
  (Federn und Übergänge nach ANN-567, `index.css` „Bewegung“; Hover bleibt 120 ms).
- [05.10.](handoff-2026-10-05-rahmen.md): Fläche `#eceee8` für Startbild und Manifest (Weiß).
- [06.10. Kalender und Tour](handoff-2026-10-06-kalender-und-tour.md): Kopfknöpfe der Tour 48 px
  bleiben bis zur Sichtung (ANN-403).
- [08.10. Lastenrad 3D](handoff-2026-10-08-lastenrad-3d.md): gebaut in FLT-EPIC-001; Nadelfarben als Token `--color-nadel-*`.
- Kanvas „Own Motion · Praxis“ (`docs/product/kanvas/`): überholt.
