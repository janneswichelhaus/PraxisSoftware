# Handoff: Runde 3 · Kalender und Tour (Anlegen-Leiste, Tour mit einem Tipp, Tour am Handy, Woche am Tablet)

> **Entwurfsreferenz, kein Produktionscode.** Die Entwürfe liegen auf der Design-Leinwand
> „Design-Audit Praxisplattform“ (Reihe 6, Runde 3; privat bei Jannes, bewusst nicht im Repository).
> Umgesetzt wird in den bestehenden Komponenten des Kalenders und der Tour, mit deren Namen, Props
> und Verhalten. Es ändern sich **Anordnung, Höhe und ein Bildlauf**; neue Bausteine entstehen keine.
> Routen, Rollenprüfungen, Lesepfade, Server und Audit-Verhalten bleiben unverändert.

Stand 06.10.2026. Ergänzt die Handoffs vom 01.10., 05.10. und 06.10.2026 (Schrift und Knöpfe) und
ersetzt nichts daraus. Es gilt der Grundton B aus dem Leitfaden „schlank und klar“ (L5).

## 0 · Entscheidungen von Jannes

Aus dem UX-Review (`docs/development/BEFUNDE.md`), am 05.10.2026 wie empfohlen:

- **BEF-053, Option 1, Punkt 2:** Die Anlegen-Leiste deckt die Auswahl nicht mehr zu; das Raster
  rollt sie frei, die Leiste wird dichter. (Punkt 1, „belegt“ statt ausgeblendet, ist mit UBK-014
  erledigt.)
- **BEF-054, Option 2, Punkte 1 bis 3:** Tour mit einem Tipp; die Tour am Handy zeigt zuerst die
  Liste; die Woche passt am Tablet. (Punkt 4, Personenfarben, ist im UI-Redesign erledigt.)

Aus den Varianten der Leinwand, am 06.10.2026 **alles A**:

- **Anlegen-Leiste A:** dichter, alle vier Wahlen bleiben je ein Tipp. B (eine Zeile mit „Andere“)
  verworfen, weil Fehlzeit und Dauertermin dann zwei Tipps bräuchten.
- **Tour-Knopf A:** rechts neben „Tag | Team“ bzw. „Woche | Team“, **auf allen Breiten**, auch am
  Handy. B (erst ab 640 px neben „Heute“) verworfen.
- **Tour am Handy A:** eine Zeile für Person, Tag, Start und Ende mit „ändern“, dann Summe,
  „Navigation: ganzer Tag“ und die Liste; die Karte steht eingeklappt **unter** der Liste. B (Karte
  klein oben) verworfen.
- **Woche am Tablet A:** Montag bis Freitag teilen sich die Breite; Samstag und Sonntag erscheinen
  wie heute nur mit Termin. B (schmales Wochenende immer) verworfen.

## 1 · Geltung

**Unverändert bleiben:** das Kalenderraster und der Aufbau der Kacheln (Jannes, 05.10.), die
Teamansicht mit 144 px je Person, die Kachel „belegt“ (UBK-014), die Wege und Fahrzeiten im Raster,
„Tag umplanen“ an seiner Stelle, alle Anlegewege mit ihren Zielen, die Druckliste der Tour, die
Rollenprüfungen.

**Kein Scope:** Reihenfolgevorschlag für den Tag (`IDEA-PRX-056`), neue Filter, Änderungen an der
Kartendarstellung außer dem Verschieben mit zwei Fingern.

## 2 · Werte

Keine neue Farbe, kein neues Token außer einer Spaltenbreite:

| Rolle                         | Wert         | Verwendung                                                            |
| ----------------------------- | ------------ | --------------------------------------------------------------------- |
| Mindestbreite Spalte in Woche | 7.5rem (120) | `CalendarGrid`, nur in der Wochenansicht; die Teamansicht bleibt 9rem |
| Anlegen-Leiste am Handy       | rund 150 px  | statt 189 px; Wahlen 44 hoch, Abstand 4                               |
| Karte der Tour am Rechner     | ≤ 560 hoch   | rechte Spalte ab 1024 px, wie heute begrenzt                          |

## 3 · Bausteine

### Anlegen-Leiste (`AnlegenMenue.tsx`, `CalendarPage.tsx`)

- **Unter 640 px** entfallen die Hinweiszeilen der Wahlen („15:30 Uhr, 60 Minuten“, „Terminserie“,
  „Meeting, Puffer, Pause“, „Über mehrere Wochen“); die Wahlen sind 44 px hoch, je zwei in einer
  Reihe. Ab 640 px bleibt die Leiste, wie sie ist.
- Kopfzeile: „Anna Beispiel · Di 06.10. · 15:30 Uhr“ 14/600, rechts „Abbrechen“ (leise, 44).
- Der **Gesten-Hinweis** („Zweites Feld antippen: Spanne bis dorthin. Dasselbe Feld: aufheben.“)
  steht nur, bis zum ersten Mal eine Spanne gezogen wurde; der Merker liegt in `localStorage`
  (ein Wahrheitswert, kein Inhalt).
- **Das Raster rollt** nach dem ersten Tipp, wenn die Auswahl hinter der Leiste läge: Die Auswahl
  steht danach im oberen Drittel des freien Bereichs über der Leiste, darunter bleibt Platz für den
  zweiten Tipp einer Spanne. Bewegung nach `prefers-reduced-motion` (dann ohne Animation). Der Fokus
  springt weiter in die Leiste, ohne dass sie die Auswahl verdeckt.
- Am Rechner bleibt die Leiste am Fensterende; gerollt wird nur, wenn sie die Auswahl verdeckt.

### Tour-Knopf und Feld „Ansicht und Filter“ (`CalendarPage.tsx`)

- **„Tour“** (Sekundärknopf kompakt 44, Symbol Route 18 px vor dem Wort) steht in der zweiten Zeile
  des Kopfs rechts neben „Tag | Team“ bzw. „Woche | Team“, auf allen Breiten. Ziel und Parameter wie
  heute aus dem Feld (Person und Tag reisen mit). Die Trainingsbetreuung sieht ihn nicht (wie heute).
- Im Feld „Ansicht und Filter“ entfällt „Tour“. Die Anlegewege (Termin, Fehlzeit, Dauerfehlzeit,
  Dauertermin, Warteliste) stehen in einem **zugeklappten** `Disclosure` „Ohne Raster anlegen“
  (_neu_). Raster-Zoom, Standort, Status und „So bedienen Sie den Kalender“ bleiben. Am Handy wird
  das Feld rund 360 statt 480 px hoch.
- Standort und Status stehen ab 640 px nebeneinander mit begrenzter Breite (je höchstens 20rem),
  nicht über die ganze Zeile.

### Tour am Handy (`TourenPage.tsx`, `Tourenliste.tsx`)

- **Unter 640 px:** Statt der drei gestapelten Felder (Person, Tag, Start/Ende) eine Zeile
  „Jannes Test · Di, 06.10.“ 16/600, darunter „Start und Ende: Praxis“ 14 Leise, rechts der Textlink
  **„ändern“** (_neu_, 44 hoch), der die Felder aufklappt. Danach Summe („3,2 km · 8 Min. reine
  Fahrzeit mit dem Lastenrad“), „Navigation: ganzer Tag“ als Hauptknopf über die ganze Breite, dann
  die Stopps. Der Aufklapper **„Karte“** steht **unter** der Liste, zugeklappt (wie seit UBK-009,
  nur an anderer Stelle).
- „Drucken“ steht am Handy nicht in der Feldzeile, sondern als leiser Knopf „Tourenliste drucken“
  unter der Liste. „Zum Kalender“ bleibt oben rechts neben dem Titel.
- **Ab 1024 px:** Person, Tag, Start und Ende in einer Zeile, „Drucken“ und „Zum Kalender“ oben
  rechts; darunter **zwei Spalten**: links Summe, „Navigation: ganzer Tag“ und die Liste (5 Teile),
  rechts die Karte (6 Teile), offen, höchstens 560 px hoch, beim Rollen oben stehend (`sticky`).
- Zwischen 640 und 1023 px: Felder in einer Zeile, Karte über der Liste, zugeklappt.

### Karte (`tours/karte/Karte.tsx`)

- `cooperativeGestures: true`: Ein Finger rollt die Seite, zwei Finger verschieben die Karte; am
  Rechner zoomt Strg plus Mausrad. Die Hinweise auf Deutsch („Zum Verschieben der Karte zwei Finger
  verwenden“, „Zum Zoomen Strg und Mausrad verwenden“). Gilt auch für die Tagesroute der Übersicht.

### Woche am Tablet (`CalendarGrid.tsx`)

- Die Wochenansicht bekommt eine eigene Mindestbreite je Spalte, **7.5rem**, über eine Prop; die
  Spalten teilen sich die verfügbare Breite (`minmax(7.5rem, 1fr)`). Montag bis Freitag passen damit
  bei 834 px (fünf Spalten à rund 135 px neben der Stundenachse). Samstag und Sonntag erscheinen wie
  bisher nur mit Termin; dann darf die Woche waagerecht rollen.
- Die Teamansicht behält 9rem je Person (die Begründung im Code gilt ihr).
- Kacheln bleiben im Aufbau; in schmalen Spalten kürzt der Name mit Auslassung, wie heute.

## 4 · Layout und Responsive-Verhalten

| Breite            | Kalender                                                               | Tour                                                          |
| ----------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------- |
| < 640 (Handy)     | „Tag \| Team“ und „Tour“ in Zeile 2; Leiste dichter, Raster rollt frei | eine Zeile mit „ändern“, Navigation, Liste, Karte zu darunter |
| 640–1023 (Tablet) | „Woche \| Team“ und „Tour“; Woche Mo–Fr ohne Querrollen bei 834 px     | Felder in einer Zeile, Karte zu über der Liste                |
| ≥ 1024 (PC)       | wie Tablet; Leiste am Fensterende                                      | Liste links, Karte rechts offen und mitlaufend                |

## 5 · Barrierefreiheit

- „Tour“ ist ein Link mit sichtbarem Wort; das Symbol ist `aria-hidden`.
- Die Anlegen-Leiste bleibt `role="group"` „Was soll hier entstehen?“ mit Escape zum Schließen und
  Fokus auf der ersten Wahl; der Bildlauf passiert vor dem Fokus, damit Vorlesesoftware nicht an
  einer verdeckten Stelle landet.
- „ändern“ trägt `aria-expanded` und steuert den Bereich der Felder (`aria-controls`).
- Ziele ≥ 44 px überall, auch die Wahlen der dichten Leiste.
- Reduzierte Bewegung: Der Bildlauf springt ohne Animation.

## 6 · Prüfung

- `AnlegenMenue`-Test: unter 640 px keine Hinweiszeilen; Gesten-Hinweis nach der ersten Spanne weg.
- E2E `kalender.spec.ts`: Tipp im **unteren Drittel** bei 375 × 740 **ohne** eigenes Rollen im
  Test — die Auswahl steht danach über der Leiste, und unter ihr ist Platz für den zweiten Tipp.
- `CalendarPage`-Test: „Tour“ im Kopf, ein Tipp, Ziel mit Person und Tag; „Tour“ nicht mehr im Feld;
  „Ohne Raster anlegen“ zu.
- `TourenPage`-Test: Reihenfolge am Handy (Zeile, Navigation, Liste, Karte); ab 1024 px zwei Spalten.
- `Karte`-Test: Optionen mit `cooperativeGestures` und deutschen Texten.
- `CalendarGrid`-Test: Woche mit 7.5rem, Team mit 9rem.
- Sichtprüfung bei 375, 834 und 1280 px über `kalender.html` und `tour.html`.

## 7 · Reihenfolge der Umsetzung

1. Woche mit eigener Spaltenbreite.
2. Tour-Knopf im Kopf; Feld kürzer mit „Ohne Raster anlegen“; Standort und Status schmaler.
3. Anlegen-Leiste dichter, Gesten-Hinweis einmal, Raster rollt frei; E2E im unteren Drittel.
4. Tour am Handy: Zeile mit „ändern“, Karte unter die Liste, Drucken nach unten.
5. Tour am Rechner: zwei Spalten, Karte mitlaufend.
6. Karte mit zwei Fingern.

Jeder Schritt ein Commit; nur Oberfläche, kein Server, keine Migration.

## 8 · Beim Bauen nachzutragen

- `BEFUNDE.md`: BEF-053 und BEF-054 auf „erledigt“.
- `docs/decisions/ASSUMPTIONS.md`: ANN-108 als beantwortet (die Leiste verdeckte zu viel), ANN-113
  Fassung 2 (Tour im Kopf auf allen Breiten), eine Annahme für „Liste vor Karte am Handy“ und eine
  für den Merker des Gesten-Hinweises.
- `docs/development/ARBEITSBEREICHE.md`: Zeile zum Kalender (Tour im Kopf, Feld kürzer).
- `docs/sichtung/`: Schritte für Kalender und Tour am Handy, am Tablet und am Rechner.

Entwurf: Claude Design, 06.10.2026, auf der Leinwand „Design-Audit Praxisplattform“, Reihe 6.
Beispieldaten synthetisch.
