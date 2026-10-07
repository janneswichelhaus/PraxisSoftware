# Handoff: Runde 2 · Schrift und Knöpfe (kleine Schrift, Kleingedrucktes, gesperrter Hauptknopf)

> **Entwurfsreferenz, kein Produktionscode.** Die Entwürfe liegen auf der Design-Leinwand
> „Design-Audit Praxisplattform“ (Reihe 5, Runde 2; privat bei Jannes, bewusst nicht im Repository).
> Umgesetzt wird in den bestehenden Bausteinen unter `src/components/ui`, `src/app` und den
> betroffenen Feature-Seiten, mit deren Namen, Props und Verhalten. Es ändern sich **Werte und
> Zustände**, dazu kommt **ein** neuer Baustein (`Kleingedrucktes`). Routen, Rollenprüfungen,
> Lesepfade, Texte und Audit-Verhalten bleiben unverändert.

Stand 06.10.2026. Ergänzt die Handoffs vom 01.10.2026 (`handoff-2026-10-01-praxissoftware.md`) und
vom 05.10.2026 (`handoff-2026-10-05-rahmen.md`) und ersetzt nichts daraus. Werte im Repo stehen in
`src/index.css` `@theme`; die Designsprache „Flasche & Salbei“ (DS-001) gilt unverändert.

## 0 · Entscheidungen von Jannes

Aus dem UX-Review (`docs/development/BEFUNDE.md`), am 05.10.2026 wie empfohlen:

- **BEF-068, Option 2:** mindestens 12 px, Kleingedrucktes über einen Baustein, `Badge` nach Handoff
  (erledigt im UI-Redesign).
- **BEF-069, Option 1:** der gesperrte Hauptknopf bekommt eine Kontur in `line-strong`, die Fläche
  verschwindet.

Aus den Varianten der Leinwand, am 06.10.2026:

- **L-B Leiste:** Tableiste und Symbolspalte in **12 px**; die Tableiste verliert dafür ihren
  seitlichen Innenabstand. Gemessen in Hanken Grotesk: „Organisation“ in 12/600 ist 69,0 px breit,
  bei 360 px stehen je Ziel 72 px zur Verfügung (3 px Luft; heute mit 11 px und 4 + 4 px
  Innenabstand 0,8 px). L-A (11 px bleibt) verworfen.
- **K-A Kleingedrucktes:** **14 px**, so groß wie der Hinweis am Feld. K-B (12 px) verworfen.
- **B Gesperrt:** Kontur **gestrichelt** in `line-strong`, keine Fläche, Text Leise. Gestrichelt heißt
  in der App schon „nicht bedienbar, Platzhalter“ (belegte Zeit und Vorschau im Kalender, leere
  Karte). A (durchgezogen) verworfen, weil der gesperrte Hauptknopf daneben wie ein aktiver
  Sekundärknopf aussah; C (Grund immer darunter) verworfen.
- **Zeitstrahl:** Das Zeichen im Punkt sitzt nicht mittig (Hinweis Jannes; gemessen rund 0,3 px zu
  hoch, weil es als Schriftzeichen gesetzt ist). Es wird ein gezeichnetes Symbol.

Daraus folgt die Regel des Design-Systems: **Kein Lesetext unter 12 px.** Einzige Ausnahme ist die
Absenderzeile im Briefkopf auf Papier, als eigenes Token.

## 1 · Geltung

**Unverändert bleiben:** alle Texte und Begriffe (`src/lib/begriffe.ts`), die Höhen und Radien der
Knöpfe (48 und 44 px, Radius 10), die Tippziele, das Kalenderraster und der Aufbau der
Kalenderkacheln (Runde 3), `Badge`, die Druckregeln, die Farben.

**Kein Scope:** die 12-px-Meta- und Statustexte in dichten Zeilen (Suchtreffer, Wegbalken,
Jetzt-Marke, Kalenderkacheln, Listenzusätze). Sie bleiben 12 px und werden nach dem Bau in der
Sichtung angesehen, wie BEF-068 Option 2 es als Folge nennt. Kein neues Verhalten in Formularen:
gesperrt bleibt gesperrt (BEF-069 Option 3 nicht gewählt).

## 2 · Tokens

Keine neue Farbe. In `src/index.css`:

| Rolle                   | Token                          | Wert              | Verwendung                                                            |
| ----------------------- | ------------------------------ | ----------------- | --------------------------------------------------------------------- |
| Beschriftung in Leisten | `--text-leiste`                | **12px** (bis 11) | Tableiste unter 640 px, Symbolspalte 640–1023 px                      |
| Kleingedrucktes         | `--text-kleingedruckt` (_neu_) | 14px              | nur im Baustein `Kleingedrucktes`                                     |
| Absenderzeile (Druck)   | `--text-absenderzeile` (_neu_) | 11px              | Rücksendeangabe über dem Anschriftfeld in Briefkopf und Berichtsblatt |

Alle drei wie `text-liste` **ohne** Unter-Token für die Zeilenhöhe (die erzeugte Regel setzt nur
`font-size`). Die Absenderzeile ist auf Papier rund 8 pt, die übliche Größe der Rücksendeangabe; sie
erscheint nie am Bildschirm als Lesetext.

## 3 · Bausteine

### Gesperrte Knöpfe (`buttonStile.ts`, Variante B)

Der gesperrte Zustand hängt künftig an der Variante, nicht mehr an der gemeinsamen Basis:

| Variante    | Gesperrt                                                                                      |
| ----------- | --------------------------------------------------------------------------------------------- |
| `primary`   | Fläche **durchsichtig**, Rand 1 px **gestrichelt** `line-strong`, Text `ink-muted`            |
| `secondary` | wie `primary`: der durchgezogene Rand wird gestrichelt, Text `ink-muted`                      |
| `quiet`     | **keine Fläche**, kein Rand, Text `ink-muted` (heute bekam „Abbrechen“ gesperrt einen Kasten) |

- Gilt für alle drei Größen: `buttonKlassen` (48), `kartenAktionKlassen`/`kompakt` (44),
  `symbolknopfKlassen` (44/48; das Symbol erbt `ink-muted`).
- **Hover ändert am gesperrten Knopf nichts:** keine Fläche, keine Farbe. Heute stehen
  `hover:bg-accent-hover` und `disabled:bg-surface-sunken` nebeneinander; die Umsetzung stellt
  sicher, dass der Hover-Stil nur `enabled` greift, und ein Test hält es fest.
- `cursor-not-allowed` bleibt.
- Während „Wird gespeichert …“ und ähnlicher Laufzustände gilt derselbe gesperrte Zustand. Ob der
  Wechsel von gefüllt zu gestrichelt beim Speichern stört, prüft die Sichtung (Abschnitt 8).
- **Grund nur, wo er nicht offensichtlich ist:** Auf der Schlüsselseite (`KeyPage.tsx`, Vorschau)
  steht unter dem Knopf ein Satz in 14 px Leise, mit `aria-describedby` am Knopf: „Erst ein Rad
  wählen.“ (_neu_) oder „Erst einen Namen eintragen.“ (_neu_), je nachdem, was fehlt. Ist der
  Schlüssel bereits entnommen, sagt es die vorhandene Warnung; dann kein zweiter Satz. Sonst kommen
  keine Sätze hinzu.
- Die `Rueckfrage` bleibt, wie sie ist (Karte `surface-sunken` mit Rand `line-strong`); ihre
  gesperrten Knöpfe folgen der Tabelle.

### Tableiste und Symbolspalte (`AppShell.tsx`, Variante L-B)

- Beschriftung über `--text-leiste` (jetzt 12 px), Gewicht 600 aktiv, 500 sonst, unverändert.
- **Tableiste:** `px-1` entfällt (Innenabstand 0); Tippziel bleibt die ganze Zelle, 56 hoch.
- **Symbolspalte:** Innenabstand bleibt (84 px breit, „Organisation“ hat 7 px Luft).
- Die Kurzformen in `navigation.tsx` bleiben; der Kommentar dort und die Rechnung in
  `begriffe.test.ts` und `navigation.test.tsx` werden auf 12 px und 72/75 px je Ziel nachgezogen.
- Die Tableiste der Plattform (`PlattformApp.tsx`) steht schon auf 12 px und bleibt.

### Baustein `Kleingedrucktes` (_neu_, `src/components/ui/Kleingedrucktes.tsx`)

- Ein `<p>` in `text-kleingedruckt`, `ink-muted`, `leading-relaxed`, `max-w-prose`. Der Abstand nach
  oben kommt von der Seite (`className`), weil die Stellen heute 8, 10 oder 6 Einheiten haben.
- Die Hülle `Vollseite` (`src/app/Vollseite.tsx`) setzt ihr `kleingedrucktes` über den Baustein.
- **Umgestellt werden die Sätze am Seitenende**, heute rund 30 Stellen mit der Kette
  `text-ink-muted … text-xs leading-relaxed` (Dokumentation, Nachtrag, Korrektur, Verlauf, Mein
  Konto, Arbeitszeiten, Mitarbeitende, Training, Verordner:innen, Druckseiten der Abrechnung,
  Protokoll, Zugang u. a.). Danach ist die Größe eine Zeile im Token.
- Auf den Druckseiten gilt dieselbe Größe; die Druckregeln bleiben.

### Dichte Angaben auf 12 px

| Stelle                               | Datei                                    | Heute                                                   | Neu                                                                           |
| ------------------------------------ | ---------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Kalender, Stundenachse               | `CalendarGrid.tsx` (volle Stunde)        | 11 px                                                   | `text-xs` (12)                                                                |
| Kalender, halbe Stunde               | `CalendarGrid.tsx` (halbe Stunde)        | 10 px                                                   | `text-xs` (12), Leise                                                         |
| Untermenü, Zeichen „Vorschau“        | `SubNav.tsx`                             | 11 px                                                   | `text-xs`                                                                     |
| Kopfsuche, „Strg K“                  | `Funktionssuche.tsx`                     | 11 px                                                   | `text-xs`                                                                     |
| Statistiken, Achsen                  | `statistics/grafiken.tsx` (zwei Stellen) | 11 px                                                   | `text-xs`                                                                     |
| Befund-Verlauf, Messreihe            | `assessments/Messreihenbild.tsx`         | 13 Bildeinheiten, unter 295 px Breite kleiner als 12 px | **immer 12 px**, aus der gerenderten Breite gerechnet; Abstände wachsen mit   |
| Mein Konto, Geheimnis „Zum Abtippen“ | `MeinKontoPage.tsx`                      | 12 px                                                   | 14 px, Festbreitenschrift (entfällt, falls der zweite Faktor gestrichen wird) |

Spaltenbreite der Stundenachse und Raster bleiben; passt „08:00“ in 12 px nicht in die heutige
Spalte, wird die Spalte nicht breiter, sondern die Zahl rückt bündig nach rechts (Prüfung bei 375
px, Tagesansicht).

### Punkt im Zeitstrahl (`today/Zeitstrahl.tsx`)

- Kein Schriftzeichen mehr im Punkt. Erledigt: Haken, ausgefallen: Kreuz, je als **SVG 8 × 8**,
  Strich 1,6 in `currentColor`, runde Enden, geometrisch in der Mitte des 14-px-Punkts,
  `aria-hidden` (der Punkt ist Schmuck, den Zustand sagt das Abzeichen daneben).
- `text-[10px]`, `leading-none` und `font-bold` entfallen am Punkt.

## 4 · Layout und Responsive-Verhalten

| Breite            | Was sich ändert                                                                    |
| ----------------- | ---------------------------------------------------------------------------------- |
| < 640 (Handy)     | Tableiste 12 px ohne seitlichen Innenabstand; bei 360 und 375 px kein Querscrollen |
| 640–1023 (Tablet) | Symbolspalte 12 px                                                                 |
| alle              | Kleingedrucktes 14 px, gesperrte Knöpfe gestrichelt, Zeitstrahl-Punkt mit Symbol   |

## 5 · Barrierefreiheit

- Kontraste (Paare in `src/lib/kontrast.test.ts` festhalten): `line-strong` als Rand auf `canvas`,
  `surface` und `surface-sunken` ≥ 3:1 (rund 3,9:1 auf der Fläche, 4,6:1 auf Papier; WCAG 1.4.11);
  `ink-muted` auf allen drei Flächen ≥ 4,5:1 (5,8:1 und mehr).
- Gesperrte Knöpfe bleiben echte `disabled`-Knöpfe; der Grund auf der Schlüsselseite hängt über
  `aria-describedby` am Knopf.
- Kein Lesetext unter 12 px; die Absenderzeile ist Druck.
- Die Tableiste bleibt eine `nav` mit `aria-current="page"`; die Zellen bleiben 56 hoch.

## 6 · Prüfung

- `src/designsystem.test.ts`: `--text-leiste` ist 12 px (0.75rem), `--text-kleingedruckt` und
  `--text-absenderzeile` existieren ohne Unter-Token; **kein freier Wert** `text-[…]` unter 12 px in
  `src/**/*.tsx` (px und rem, mit Gegenprobe); die Absenderzeile nur über ihr Token.
- `buttonStile`-Test: gesperrt je Variante (gestrichelt, keine Fläche, kein Hover).
- `Zeitstrahl`-Test: der Punkt enthält ein SVG und keinen Text.
- E2E: Tableiste bei 360 und 375 px ohne Querscrollen und ohne abgeschnittene Beschriftung (Rolle
  therapist, „Organisation“ sichtbar).
- Sichtprüfung bei 375, 834 und 1280 px über die Prüfseiten `schreibseite.html` (Tableiste,
  gesperrtes „Entwurf“), `ui-bausteine.html` (gesperrte Knöpfe auf Fläche, Papier und in der
  Rückfrage; dort zu ergänzen), `kalender.html`, `statistik.html`, `befund.html` (Messreihe) und
  `uebersicht.html?ansicht=abend` (Zeitstrahl).

## 7 · Reihenfolge der Umsetzung

1. Tokens (`--text-leiste` 12, `--text-kleingedruckt`, `--text-absenderzeile`), Tests im
   Design-System.
2. Gesperrte Knöpfe nach Variante, Kontrastpaare, Grund auf der Schlüsselseite, Prüfseite.
3. Tableiste ohne Innenabstand, Rechnungen in den Tests, E2E bei 360 und 375 px.
4. Baustein `Kleingedrucktes`, Umstellung der Stellen und der `Vollseite`.
5. Dichte Angaben auf 12 px: Kalenderachse, Vorschau-Zeichen, „Strg K“, Statistik-Achsen, Messreihe.
6. Zeitstrahl-Punkt mit Symbol.
7. Absenderzeile auf ihr Token; Wache gegen freie Werte unter 12 px.
8. Geheimnis „Zum Abtippen“ in 14 px Festbreite, nur wenn der zweite Faktor im Plan bleibt.

Jeder Schritt ein Commit; Pfad S nach K1 (nur Oberfläche, kein Server, keine Migration). Nach dem
Bau: Sichtung am Handy auf der Test-Umgebung, als Anna, Olivia und Jannes.

## 8 · Beim Bauen nachzutragen

- `BEFUNDE.md`: BEF-068 und BEF-069 auf „erledigt“, mit den Varianten L-B, K-A und B.
- `docs/decisions/ASSUMPTIONS.md`: ANN-111 fortschreiben (Tableiste 12 px ohne Innenabstand statt
  11 px); je eine Annahme für „gesperrt heißt gestrichelt“ und für die Absenderzeile als einzige
  Ausnahme unter 12 px.
- `docs/sichtung/rahmen.md`: Schritte für Runde 2 ergänzen, darunter die Frage, ob der Wechsel von
  gefüllt zu gestrichelt während „Wird gespeichert …“ stört, und ein Blick auf die dichten
  12-px-Zeilen (Tageskarte, Suchtreffer, Listen).
- `docs/development/ROADMAP.md` und `fortschritt.json`: Zeile für das Epic dieser Runde.

Entwurf: Claude Design, 06.10.2026, auf der Leinwand „Design-Audit Praxisplattform“, Reihe 5.
Beispieldaten synthetisch.
