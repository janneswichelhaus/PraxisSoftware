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

| DESIGN.md                   | Plattform                                                                                                                                                                         |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keine Schatten              | Eine Tiefenstufe `shadow-plattform`, nur für Hero-, Aufgaben- und Besuchskarte (ANN-678). Listen bleiben Linie.                                                                   |
| Schriftrollen in px         | Skala in rem, Werte unter der Tabelle.                                                                                                                                            |
| Etiketten in Versalien      | Keine Versalien. Die Bausteine heben `uppercase` unter `.plattform-schrift` auf (DR-154).                                                                                         |
| Keine Erklärsätze           | Ein Satz Orientierung, wo sonst unklar bleibt, was passiert (leer, nach dem Absenden, wer meine Angaben sieht); nie eine Gebrauchsanweisung der Oberfläche.                       |
| Silbentrennung im Fließtext | Nur lange Wörter ab zwölf Buchstaben; nie in Namen, Anschriften, Überschriften, Knöpfen und Reitern (DR-114); unter 23rem auch Plan- und Übungsnamen (`trennen-schmal`, ANN-707). |
| Ziele ≥ 44 px               | Knöpfe 48, antippbare Karten ≥ 80, Zeilen und Textlinks ≥ 44; Abstand zwischen Zielen ≥ 8, nicht in der Wochenleiste (ANN-708). Hauptknopf der Durchführung 56 (`gross`).         |
| Rhythmus 4/8/12/16/24/32    | Dazu 40 (Telefon) und 48 (Rechner) zwischen Abschnitten; Seitenrand 20, Türseiten 24; in Zeilen und Zeichen auch 2, 6, 10 und 14 (Handoffs).                                      |
| Hover 120 ms                | Druck an Knopf, Zeile und Karte: 98 % und vertiefte Fläche in 120 ms; bei „Bewegung reduzieren“ nur die Fläche (DR-117).                                                          |
| Bilder `Medienbild` 4:3     | Eigene Fotos der Praxis, keine KI-Bilder; 4:3 oder 16:9 im Radius 16, Personen rund (`Personenbild` `karte`, 56). Markenform ist das Laufrad, nie neben der Wortmarke.            |
| Liste in Karte              | Die Hauptsache als Hero-Karte (Tiefgrün, Papier-Schrift), höchstens drei Aufgabenkarten; alles Weitere als `ListRow`, jede Zeile ganz das Ziel.                                   |

**Skala:** Gruß `text-gruss` 34/800 (Rechner 40), Seitentitel `text-plattform-titel` 28/800 (32),
Hero `text-hero` 26/800 (32, unter 23rem 22), Abschnitt `text-abschnitt` 22/700; Zeile 18/600, Text
18/400, Leise `ink-muted` 18/400.

## Bausteine der Plattform

`HeroKarte` (eine Markenfläche je Bildschirm) · `Aufgabenkarte` · `Besuchskarte` · `Notfallkarte`
(über jedem Eingabefeld für Nachrichten) · `Skelett` mit `SkelettBereich` statt „wird geladen …“ ·
`EmptyState` mit `markenform` · `Button`/`ButtonLink` Variante `marke` (nur auf Tiefgrün) ·
`Personenbild` Größe `karte` · `Laufrad` · `Verbindungszeile` · `Menueknopf` · `Schalter` (eine
Wahl, die sofort gilt; Zustand als Wort) · `Wahlreihe` mit `sofort` (Knöpfe statt Radios: Pfeiltasten
wählen nichts, etwa eine Einwilligung) · `Zwischentitel` mit `stufe="abschnitt"` (Kartentitel 22) ·
`Vertretungsband` („Sie handeln für …“ im Gerüst und im Einstieg). Übungen: `Buehne`,
`Dosierungsmarken`, `Hakenzeile`, `Wochenleiste`, `Uebungszeile`, `Durchfuehrungskopf`/`-fuss`,
`Abschlussseite`. Termine: `Terminzeile`, `Wunschzeile`, `WerUndWo`, `FragenZumTermin`,
`Wahlflaechen`, `HeroKarte` mit `ziel` und `zustand`, `HeroSkelett`, `EmptyState` mit `zeichen`;
Zeichen und Knöpfe brechen nur zwischen Wörtern (ANN-765).
Prüfseiten `tests/e2e/fixtures/plattform-*bausteine.html`.

## Seitentypen und Gerüst

**Seitentypen:** Heute (Übersicht: Gruß, Hauptsache, Heute, Nächster Besuch, Neu für Sie; ANN-698
bis ANN-702) · Liste · Objekt ·
geführter Ablauf (Einladung, Einstieg, Wunsch, Absage, Check-in, Fragebogen) · Durchführung (Vollbild
ohne Gerüst; Kopf mit „Später weiter“ und Balken, Fuß mit Stand und Hauptknopf 56; ANN-714) · Tür
(Einladung, Anmeldung, Einrichten, Sperre, Zugang beendet) · Blatt (Planblatt, Rechnung). Der geführte Ablauf kann „Später“ statt ✕ tragen,
einen Balken je Schritt und das Band einer Vertretung unter dem Fortschritt; mit `plattform` 20 Rand,
unter 23rem 12 und alles in einer Rollfläche, die Frage ohne Rollen (ein Bild darüber schrumpft in
4:3). Ein Titel mit einem Wort über elf Zeichen steht unter 23rem in 22 (ANN-696). Abschaltbar; so
der Einstieg, DRP-EPIC-005.

**Gerüst** (`src/features/portal/platform/Navigation.tsx`): Kopf 72 mit Wortmarke 28 und „Ich“ mit
Initialen. Reiterleiste in drei Stufen (ANN-679): eine Reihe, solange die Wörter passen - gemessen,
nicht aus der Einstellung gelesen -, sonst zwei; unter 23rem der `Menueknopf` im Kopf (ANN-682). Bei
offener Tastatur tritt sie zurück (ANN-676, ANN-681). Ab 1024 px Navigation im Kopf, Inhalt
`max-w-inhalt`, jede Seite einspaltig in `max-w-spalte` außer der Übersicht (ab 900 px
Inhaltsbreite zwei Spalten), den Übungen und den Terminen (ANN-724, ANN-775); geschaltet über
`data-rechner` (`useRechner`). Unter 23rem Zeichen und Bild der Karten über dem Text, innen 12;
Titel in rem (ANN-683). Statt Startbild Markenmoment B beim ersten Erscheinen der Übersicht je Tab
(ANN-680). Verbindungszeile ohne Netz; Tab-Titel je Seite, nie mit Daten.

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
