# Plattform – so sieht eine Seite unter `/p` aus

Gleiche Marke, gleiche Farben, gleiche Bausteine, eigene Sprache. Für Patient:innen und Kund:innen
bis 78, am eigenen Telefon, zuhause. Gilt für `/p`, `/einladung` und die Türseiten (`Vollseite`); es
gilt [DESIGN.md](DESIGN.md), soweit hier nichts anderes steht. In Git: Werte und Bildschirme im
Handoff 2026-10-22 (`git show eb43569:docs/design/handoff-2026-10-22-plattform-erster-eindruck.md`),
Befunde im Design-Review Lauf 1 (`git show 9452575:docs/design/review-2026-10/lauf-1-bericht.md`),
Inhalt und Folge der Ansichten in DSN-001 (`git show 9452575:docs/development/PLATTFORM-ANSICHTEN.md`).

## Grundsätze

1. **Vertrauen vor Dichte:** genau eine Hauptsache je Bildschirm, der Mensch hinter der Praxis sichtbar.
2. **Wärme aus Bild, Raum und Marke** – keine eigene Farbwelt (DESIGN.md 9.12).
3. **Lesbar für alle:** nichts unter 18 px; 200 % Zoom und „Sehr groß“ ohne Verlust.
4. **Telefon zuerst;** ab 1024 px eine eigene Rechneransicht, kein gestrecktes Telefon.
5. **Ruhig:** keine Bewertung, keine Serie, kein Lob, kein Countdown (DSN-001 Abschnitt 7).

## Was aus DESIGN.md gilt

Alle Bausteine und die Ratsche; Status = Zeichen + Wort; kein Kasten im Kasten; ein Hauptknopf je
Ansicht, Zerstörendes leise am Ende mit `Rueckfrage`; Zustände über `Abfragezustand`; Links
unterstrichen; geführte Abläufe für Seltenes; kein Dunkelmodus (ANN-401).

## Was auf der Plattform anders gilt

| DESIGN.md                   | Plattform                                                                                                                                 |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Keine Schatten              | Eine Tiefenstufe `shadow-plattform`, nur für Hero-, Aufgaben- und Besuchskarte (ANN-678). Listen bleiben Linie.                           |
| Schriftrollen in px         | Skala in rem, Werte unter der Tabelle.                                                                                                    |
| Etiketten in Versalien      | Keine Versalien. Die Bausteine heben `uppercase` unter `.plattform-schrift` auf (DR-154).                                                 |
| Keine Erklärsätze           | Ein Satz Orientierung, wo unklar bleibt, was passiert (leer, nach dem Senden, wer meine Angaben sieht); nie eine Gebrauchsanweisung.      |
| Silbentrennung im Fließtext | Ab zwölf Buchstaben; nie in Namen, Anschriften, Titeln, Knöpfen, Reitern; unter 23rem auch Plan-, Übungsnamen und Wahlflächen (ANN-707).  |
| Ziele ≥ 44 px               | Knöpfe 48 (Hauptknopf Durchführung 56), Karten ≥ 80, Stufen 56, Zeilen, Textlinks ≥ 44; Abstand ≥ 8, nicht in der Wochenleiste (ANN-708). |
| Rhythmus 4/8/12/16/24/32    | Dazu 40 (Telefon) und 48 (Rechner) zwischen Abschnitten; Seitenrand 20, Türseiten 24; in Zeilen und Zeichen auch 2, 6, 10, 14 (Handoffs). |
| Hover 120 ms                | Druck an Knopf, Zeile und Karte: 98 % und vertiefte Fläche in 120 ms; bei „Bewegung reduzieren“ nur die Fläche (DR-117).                  |
| Bilder `Medienbild` 4:3     | Eigene Fotos, nie KI-Bilder; 4:3/16:9, Radius 16; Personen rund (`Personenbild karte`, 56); Laufrad als Markenform, nie an der Wortmarke. |
| Liste in Karte              | Die Hauptsache als Hero-Karte (Tiefgrün, Papier-Schrift), höchstens drei Aufgabenkarten; alles Weitere als `ListRow`, ganz das Ziel.      |

**Skala:** Gruß `text-gruss` 34/800 (Rechner 40), Seitentitel `text-plattform-titel` 28/800 (32),
Hero `text-hero` 26/800 (32, unter 23rem 22), Abschnitt `text-abschnitt` 22/700; Zeile 18/600, Text
18/400, Leise `ink-muted` 18/400.

## Bausteine der Plattform

`HeroKarte` (eine Markenfläche je Bildschirm) · `Aufgabenkarte` · `Besuchskarte` · `Notfallkarte`
(über jedem Nachrichtenfeld) · `Skelett` mit `SkelettBereich` statt „wird geladen …“ ·
`EmptyState` mit `markenform` · `Button`/`ButtonLink` Variante `marke` (nur auf Tiefgrün) ·
`Personenbild` Größe `karte` · `Laufrad` · `Verbindungszeile` · `Menueknopf` · `Schalter` (eine
Wahl, die sofort gilt; Zustand als Wort) · `Wahlreihe` mit `sofort` (Knöpfe statt Radios: Pfeiltasten
wählen nichts, etwa eine Einwilligung) · `Zwischentitel` mit `stufe="abschnitt"` (Kartentitel 22) ·
`Vertretungsband` („Sie handeln für …“ im Gerüst und im Einstieg). Übungen: `Buehne`,
`Dosierungsmarken`, `Hakenzeile`, `Wochenleiste`, `Uebungszeile`, `Durchfuehrungskopf`/`-fuss`,
`Abschlussseite`. Termine: `Terminkopf`, `Terminzeile`, `Wunschzeile`, `WerUndWo`,
`FragenZumTermin` mit `titel`, `Wahlflaechen`, `HeroKarte` mit `ziel` und `zustand`, `HeroSkelett`, `EmptyState` mit `zeichen`;
Zeichen und Knöpfe brechen nur zwischen Wörtern (ANN-765). Selbstauskunft: `Stufenskala` (eine
Reihe ab 44rem), `Wahlflaechen` mit `form`, `Angabezeile`, `Antwortbalken`, `ProgressBar` mit
`kante`, `Wochenleiste` mit `zahl`.
Prüfseiten `tests/e2e/fixtures/plattform-*bausteine.html`.

## Seitentypen und Gerüst

**Seitentypen:** Heute (Übersicht: Gruß, Hauptsache, Heute, Nächster Besuch, Neu für Sie, als
Vertretung am Telefon Hauptsache vor Gruß, Lesefrist darüber; ANN-698 bis ANN-702, ANN-820) · Liste
· Objekt (Termin) · geführter Ablauf (Einladung, Einstieg, Wunsch, Absage, Check-in, Fragebogen) ·
Durchführung (Vollbild ohne Gerüst; Kopf mit „Später weiter“ und Balken, Fuß mit Stand und
Hauptknopf 56; ANN-714) · Tür (Einladung, Anmeldung, Einrichten, Sperre, Zugang beendet) · Blatt
(Planblatt, Rechnung). Der geführte Ablauf kann „Später“ statt ✕, einen Balken je Schritt und das
Band einer Vertretung tragen; mit `plattform` 20 Rand, die Frage ohne Rollen (ein Bild darüber
schrumpft in 4:3). Unter 23rem 12 Rand und alles in einer Rollfläche, bei „Sehr groß“ Inhalt und Fuß
(unten, solange alles passt; auf Hinweis, „Willkommen“, „Alles bereit“ fest mit Linie, ANN-819);
beide ohne Bild, ein Titel mit einem Wort über elf Zeichen in 22 (ANN-696, ANN-816). Mit `objekt`
steht der Name im Kopf, mit `breit` am Rechner eine Spalte von 48rem; im Fuß nur Zustand,
Notfallsatz und Hauptknopf. Der Check-in sendet ohne Zusammenfassung; ein Thema des Fragebogens
rollt.

**Gerüst** (`src/features/portal/platform/Navigation.tsx`): Kopf 72 mit Wortmarke 28 und „Ich“ mit
Initialen. Reiterleiste in drei Stufen (ANN-679): eine Reihe, solange die Wörter in 18 px passen,
auch bei „Sehr groß“ (ANN-815, gemessen), sonst zwei; unter 23rem der `Menueknopf` im Kopf
(ANN-682). Bei offener Tastatur tritt sie zurück (ANN-676, ANN-681). Ab 1024 px Navigation im Kopf,
Inhalt `max-w-inhalt`, jede Seite einspaltig in `max-w-spalte` außer der Übersicht (ab 900 px
Inhaltsbreite zwei Spalten), den Übungen, den Terminen und dem Tagebuch (ANN-724, ANN-775, ANN-796),
Schalter `data-rechner`. Unter 23rem Zeichen und Bild der Karten über dem Text, innen 12, die
Hero-Karte auch bei „Sehr groß“; auf der Übersicht ganz das Ziel (ANN-817). Titel in rem (ANN-683).
Statt Startbild Markenmoment B beim ersten Erscheinen der Übersicht je Tab (ANN-680).
Verbindungszeile ohne Netz; Tab-Titel je Seite, nie mit Daten.

## Begriffe

Übersicht, Termine, Übungen bzw. Training, Nachrichten, Ich · „Termin wünschen“ · „Fragebogen vor dem
ersten Termin“ · Türen sprechen von „Zugang“ · „mit Gesicht oder Finger“ · Technikwörter nur in
Klammern hinter einer Erklärung („Format JSON“). Nie: Sitzung, Projektion, Instrument, Mein Konto,
Kennwort (außer „kein Kennwort“), Passwort, „Version“ oder „DIGOTOR“ im Titel, Workout, Drill,
„Kunde“ allein, PT, Mein Tag.

## Prüfliste

Wie DESIGN.md, dazu: 375 und 1280 px, 200 % (188 px), „Sehr groß“ und offene Tastatur; Tab-Titel;
ein Bild oder eine Markenfläche je Hauptseite; keine Versalien; keine Trennung in Namen.
Automatisch: `plattform-barrierefreiheit.spec.ts`, `plattform-bausteine.spec.ts`, die Ratsche in
`src/designsystem.test.ts` und die Paare der Plattform in `src/lib/kontrast.test.ts`.
