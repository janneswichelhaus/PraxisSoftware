# Handoff: Runde 1 · Rahmen (Seitenleiste, Kopfzeile, Tableiste, Akte, Außen, Startbild)

> **Entwurfsreferenz, kein Produktionscode.** Die Entwürfe liegen auf der Design-Leinwand
> „Design-Audit Praxisplattform“ (Reihe 4, Runde 1; privat bei Jannes, bewusst nicht im Repository).
> Umgesetzt wird in den bestehenden Bausteinen unter `src/components/ui`, `src/app` und den
> betroffenen Feature-Seiten, mit deren Namen, Props und Verhalten. Es ändern sich **Werte, Anordnung
> und Beschriftung**, dazu kommt **ein** neuer Baustein (das Startbild). Routen, Rückwege,
> Rollenprüfungen, Lesepfade und Audit-Verhalten bleiben unverändert.

Stand 05.10.2026. Ergänzt den Handoff vom 01.10.2026 (`handoff-2026-10-01-praxissoftware.md`) und
ersetzt nichts daraus. Werte im Repo stehen in `src/index.css` `@theme`; die Designsprache
„Flasche & Salbei“ (DS-001) gilt unverändert.

## 0 · Entscheidungen von Jannes (05.10.2026)

Aus dem UX-Review (`docs/development/BEFUNDE.md`), alle wie empfohlen:

- **BEF-048, Option 1:** (1) Salbei-Strich an der Auswahl, zwischen 640 und 1023 px nennt der Rahmen
  den Bereich, Tooltips an den Symbolen; (2) „Abmelden“ ruhig, mit Abstand und der Meldung „Wird
  abgemeldet …“; (3) das Untermenü „Patient:innen | Verordner:innen“ entfällt in der Akte; (4)
  `theme_color` Weiß, `background_color` Fläche. Dazu, ohne Festlegung: Hover ohne Fläche.
- **BEF-049, Option 2:** Reife vor Reihenfolge in der Tableiste; Sicherheit und Aufbewahrung werden ein
  Punkt; Raster, Frist und Startort eingeklappt unter den Arbeitszeiten; der Satz auf `/bereiche` wird
  an den Stand angepasst; kein Vorschau-Zeichen an „Kommunikation“ (Festlegung vom 22.09.2026).
- **BEF-050, Option 1:** ein Titel je Route nach dem Muster „Seitenart – Own Motion“, nie ein Name.

Aus den Varianten der Leinwand:

- **2b** Tablet: beschriftete Symbolspalte 84 px (statt Bereichsname in der Kopfzeile).
- **1b** Handy: „Abmelden“ als Symbolknopf mit Beschriftung für Vorlesesoftware.
- **4b** Akte am Handy: der Rückweg wird ein Pfeilknopf in der ersten Zeile der Kopfkarte.
- **Startbild:** das Intro „Speiche wird O“ aus dem Website-Intro, **einmal je Sitzung, auf allen
  Geräten in voller Länge**, je Gerät mit eigenem Landeplatz der Marke (Abschnitt 6).
- **Der Kalender bleibt, wie er ist.** Das Raster muss für die Terminierung sichtbar bleiben. Das
  Wochenraster auf den Tablet-Boards war Platzhalter für den Rahmen, kein Entwurf des Kalenders.

## 1 · Geltung

**Unverändert bleiben:** `arbeitsbereiche(user)` als Quelle der Bereiche und ihrer Reihenfolge, die
Routen und `mitRueckweg`, die Kopfsuche (UX-013), die Rollenprüfungen, `aria-current="page"` in
Seitenleiste, Tableiste und Akte-Pillen, die Rückfrage vor dem Abmelden bei ungesichertem Text
(FIX-014), die Druckregeln, die Begriffe aus `src/lib/begriffe.ts`.

**Texte:** Sie-Form wie im Repo; neue Beschriftungen sind unten markiert (_neu_). Erklärsätze kommen
keine hinzu (Handoff 01.10., Abschnitt 1).

**Kein Scope:** Schriftgrößen und Kleingedrucktes (BEF-068, Runde 2), der gesperrte Hauptknopf
(BEF-069, Runde 2), der Kalender (BEF-053/054, Runde 3). Die 11 px der Tableiste werden hier nur
benannt, nicht geändert.

## 2 · Tokens

Keine neue Farbe. Drei Ergänzungen in `src/index.css`:

| Rolle                     | Token                     | Wert | Verwendung                                                                        |
| ------------------------- | ------------------------- | ---- | --------------------------------------------------------------------------------- |
| Beschriftung in Leisten   | `--text-leiste` (_neu_)   | 11px | Tableiste unter 640 px und Symbolspalte 640–1023 px; Gewicht 600 aktiv, 500 sonst |
| Strich der Auswahl        | `--spacing-auswahlstrich` | 3px  | linker Rand der Seitenleiste und der Symbolspalte am aktiven Eintrag              |
| Symbolspalte, beschriftet | `--spacing-symbolspalte`  | 84px | Breite der Symbolspalte 640–1023 px (bisher 72)                                   |

Die 11 px sind der heutige Wert der Tableiste (BEF-068); das Token benennt ihn, damit kein freier
Wert mehr im Code steht. Ob er auf 12 px wandert, entscheidet Runde 2.

Web-Manifest und `index.html`: `theme_color` `#ffffff` (Kopfzeile), `background_color` `#eceee8`
(Fläche), `<meta name="theme-color" content="#ffffff">`. Das Startsymbol bleibt das maskierbare
Master aus `marke/` (BEF-040).

## 3 · Bausteine

### Seitenleiste ≥ 1024 px (`AppShell`)

Vier Zustände, jeder an etwas anderem erkennbar:

| Zustand | Darstellung                                                                                          |
| ------- | ---------------------------------------------------------------------------------------------------- |
| Ruhe    | Salbei `#87a98d`, 15 / 500, keine Fläche                                                             |
| Hover   | Text Papier, **keine Fläche** (bis heute sahen Hover und Auswahl gleich aus, 1,35:1 zwischen beiden) |
| Aktiv   | Fläche Hauptfarbe, Papier 600, dazu **Salbei-Strich 3 px** am linken Rand der Leiste, Radius 0 2 2 0 |
| Fokus   | Ring 2 px Papier, Abstand 2, Radius 10 (unverändert)                                                 |

Maße bleiben: Eintrag min 44 hoch, Radius 10, Symbol 20, Abstand 12, Leiste 248. Der Strich ist
Darstellung; `aria-current="page"` bleibt das Zeichen.

### Symbolspalte 640–1023 px (Variante 2b)

- Breite **84** statt 72. Oben das Monogramm 40 px (`marke/app/own-motion-monogramm.svg`).
- Jeder Eintrag 56 hoch: Symbol 22 px, darunter die **Kurzform** aus der Tableiste
  (`tableiste`-Kurzformen in `src/app/navigation.tsx`: „Übersicht“, „Kalender“, „Patienten“,
  „Nachrichten“, „Abrechnung“, „Statistiken“, „Organisation“) in `--text-leiste`, 600 aktiv, sonst 500. Zustände wie in der Seitenleiste, Strich 3 px links, Hover ohne Fläche.
- `title` am Eintrag (Tooltip) und der sichtbare Text tragen denselben Wortlaut; `aria-label` entfällt,
  weil der Text sichtbar ist.
- Die Kopfzeile am Tablet nennt den Bereich **nicht** (2a verworfen); sie trägt Suche (max 384, 40
  hoch), „Mein Konto · Name“ 14 und „Abmelden“ 14/400 Leise mit **24 px** Abstand.

### Kopfzeile unter 640 px (Variante 1b)

- Wortmarke 24 hoch (`Wortmarke`, Mindestmaß bleibt erzwungen), Bereichsname 14 Leise daneben, mit
  `truncate`.
- Rechts: Lupe als `Symbolknopf` 44 in Hauptfarbe, „Mein Konto“ 14/600 Leise als Textlink 44 hoch,
  dann **„Abmelden“ als `Symbolknopf` 44** in `line-strong` mit `aria-label="Abmelden"` und `title`,
  Abstand 8 davor. Symbol: Tür mit Pfeil nach rechts, Strich 1,75, `viewBox 0 0 20 20`.
- Nach dem Tippen erscheint unter der Kopfzeile eine Statuszeile `role="status"`: Akzentfläche, Radius
  14, min 44, 15/600 Hauptfarbe, Kreis-Symbol vorn: **„Wird abgemeldet …“** (_neu_). Sie steht, bis
  die Anmeldemaske geladen ist. Die Rückfrage bei ungesichertem Text (FIX-014) bleibt davor.

### Tableiste unter 640 px (BEF-049, Option 2)

- `tableiste(bereiche)` bekommt **Reife vor Reihenfolge**: Bereiche, die ganz Vorschau sind (heute
  nur Kommunikation), werden übersprungen; sichtbar sind die ersten **vier** übrigen und „Mehr“.
  owner und office: Übersicht, Kalender, Patienten, Abrechnung, Mehr. therapist und team_lead:
  Übersicht, Kalender, Patienten, Organisation, Mehr. Hinter „Mehr“ stehen alle übrigen Bereiche in
  Seitenleisten-Reihenfolge, Kommunikation eingeschlossen, und „Alle Bereiche“.
- Die Seitenleiste und `/bereiche` zeigen weiter **alle** Bereiche in ihrer Reihenfolge; es entsteht
  keine neue Vorschau-Kennzeichnung. Der Satz auf `/bereiche` wird an den Stand angepasst:
  „Vorschauen — im Untermenü so bezeichnet — und die Kommunikation speichern nichts; was dort
  simuliert wurde, steht im Vorschau-Protokoll.“ (_neu_), mit Textlink zum Protokoll für alle Rollen;
  die Kopfsuche findet „Vorschau-Protokoll“ als Funktion.
- Beschriftung `--text-leiste`; aktiv Hauptfarbe mit 3-px-Strich oben (unverändert), sonst Leise.

### Untermenü Organisatorisches (`SubNav`, `navigation.tsx`)

- „Protokoll“ und „Aufbewahrung“ werden **ein** Punkt **„Sicherheit und Aufbewahrung“** (_neu_,
  Ziel `/praxis/sicherheit/audit`; die Aufbewahrung bleibt dort als zweite Seite mit eigener
  Unterleiste oder Reiter, Routen unverändert).
- Der scrollbare Rand zeigt, dass es weitergeht: rechts ein **Verlauf** 72 px (Weiß nach
  transparent) mit „›“ in `line-strong`, `aria-hidden`, nur solange rechts noch Einträge liegen. Den
  aktiven Punkt rollt die Leiste weiter ins Bild (UXR-001).

### Arbeitszeiten (`SchedulingPage`)

- Reihenfolge: Person, Wochenplan, „Arbeitszeiten ändern“; **darunter** ein `Disclosure` in Karte
  **„Praxiseinstellungen“** (_neu_, Label 12 Versalien, Zusatz rechts „Raster · Frist · Startort“ 14
  Leise), **zu** beim Öffnen. Inhalt: Praxisraster, Dokumentationsfrist, Startort der Touren mit ihren
  bisherigen Formularen und Hauptknöpfen, unverändert im Verhalten.
- Der Weg „Arbeitszeiten“ aus dem Mitarbeiterdatensatz landet beim Wochenplan der Person, nicht
  beim Raster.

### Patientenakte unter 640 px (Variante 4b, `PatientRecordLayout`, `PatientKopf`)

- Das Untermenü „Patient:innen | Verordner:innen“ wird in der Akte und ihren Formularen
  **ausgeblendet**; Verordner:innen bleiben über die Liste und die Kopfsuche erreichbar.
- Der `Rueckweg` wird in der Kopfkarte ein **Pfeilknopf 40 px** (`Symbolknopf`, Hauptfarbe, Chevron
  links, Strich 2) in der ersten Zeile **vor dem Namen**, `aria-label="Zurück zu den Patient:innen"`
  und `title="Patient:innen"`; das Ziel bleibt das Ziel des bisherigen Rückwegs (`?zurueck=` gilt
  weiter). Kopfkarte innen 12 oben, 10 links in der Namenszeile, 16 rechts; alles unter dem Namen
  rückt 6 px ein, damit es mit dem Namen fluchtet.
- Ab 640 px bleibt der `Rueckweg` als Zeile stehen (Variante 4b gilt nur unter 640 px).
- Gewinn am Handy: der Reiterinhalt beginnt rund 150 px höher (im Entwurf bei 380 statt 538 px).

### Tab-Titel (BEF-050, `AppShell`, `index.html`)

Ein Titel **je Route**, fest, nie aus dem Seitentitel abgeleitet, Trenner Gedankenstrich:

| Route                                                   | Titel im Tab                   |
| ------------------------------------------------------- | ------------------------------ |
| `/`                                                     | Übersicht – Own Motion         |
| `/kalender`, `/kalender/…`                              | Kalender – Own Motion          |
| `/patienten`                                            | Patient:innen – Own Motion     |
| `/patienten/:id/…` (alle Bereiche)                      | Akte – Own Motion              |
| `/patienten/neu`, `…/bearbeiten`                        | Akte – Own Motion              |
| `/termine/:id`, `/termine/…`                            | Termin – Own Motion            |
| `/termine/:id/dokumentation…`, `/termine/:id/abschluss` | Dokumentation – Own Motion     |
| `/warteliste`                                           | Warteliste – Own Motion        |
| `/verordner`, `…/neu`, `…/bearbeiten`                   | Verordner:innen – Own Motion   |
| `/abrechnung`, `/abrechnung/…`                          | Abrechnung – Own Motion        |
| `/abrechnung/rechnungen/:id…`                           | Rechnung – Own Motion          |
| `/statistiken`                                          | Statistiken – Own Motion       |
| `/praxis/…`, `/betrieb/…`                               | Organisatorisches – Own Motion |
| `/team`                                                 | Kommunikation – Own Motion     |
| `/training…`                                            | Training – Own Motion          |
| `/mein-konto`                                           | Mein Konto – Own Motion        |
| `/bereiche`                                             | Alle Bereiche – Own Motion     |
| Anmeldemaske und Vollseiten                             | Anmelden – Own Motion          |

Nach dem Seitenwechsel springt der Fokus auf den Inhalt (`main`, `tabindex="-1"`), damit
Vorlesesoftware den neuen Titel ansagt. Ein Test hält fest, dass kein Titel Daten aus einer Abfrage
enthält (keine Namen, nie klinischer Inhalt; ADR-011, ADR-013 Punkt 9).

## 4 · Layout und Responsive-Verhalten

| Breite            | Rahmen                                                                                                                                        |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| < 640 (Handy)     | Kopfzeile 56 mit Wortmarke 24, Bereichsname, Lupe, „Mein Konto“, Abmelden-Symbol; Tableiste 56 + safe-area, vier Bereiche + „Mehr“ nach Reife |
| 640–1023 (Tablet) | Symbolspalte 84, beschriftet, Monogramm 40; Kopfzeile mit Suche, Konto, Abmelden 14/400                                                       |
| ≥ 1024 (PC)       | Seitenleiste 248 mit Wortmarke Papier 36, Strich 3 px am aktiven Eintrag, Hover ohne Fläche                                                   |

Der Inhalt (max 1200, zwei Spalten ab 900 px Inhaltsbreite) bleibt wie im Handoff vom 01.10.

## 5 · Barrierefreiheit

- Ziele ≥ 44 px: Abmelden-Symbol 44, Lupe 44, Rückweg-Pfeil 40 in einer Karte mit 12 px Innenabstand
  (zählt mit, Regel aus Handoff 01.10. Abschnitt 9), Einträge der Symbolspalte 56 × 84.
- Symbolknöpfe tragen `aria-label` und `title` mit demselben Wortlaut; die Beschriftung der
  Symbolspalte ist sichtbarer Text, kein `aria-label`.
- Auswahl: `aria-current="page"` überall; der Strich ist Zusatz, nie allein.
- „Wird abgemeldet …“ ist `role="status"`; Tab-Titel ändern sich je Route, Fokus auf `main`.
- Kontraste: Salbei auf Tiefgrün 5,9:1 (≥ 12/600), Leise auf Weiß 7,2:1, Hauptfarbe auf Fläche 10,3:1,
  `line-strong` als Symbolfarbe 4,6:1 auf Weiß — alle Paare in `src/lib/kontrast.test.ts`.
- Bewegung: 120 ms `cubic-bezier(.2,.7,.2,1)` für Hover; das Startbild respektiert
  `prefers-reduced-motion` (Abschnitt 6).

## 6 · Startbild: Intro „Speiche wird O“

Das Website-Intro von Jannes (Komposition auf `animations-v3`, 1440 × 900) wird der Start der
Anwendung. **Nicht übernommen** werden React-Standalone, Babel und der Kompositions-Motor aus dem
Export — sie dienen dort nur der Vorschau. Die App zeichnet das Stück selbst: **ein** Baustein
`Startbild` (`src/app/Startbild.tsx`), SVG plus `requestAnimationFrame`, keine neue Abhängigkeit.

### Wann

- **Einmal je Sitzung** (Entscheidung Jannes): beim ersten Aufbau der angemeldeten Anwendung nach
  einem Kaltstart und nach jeder Anmeldung; auf allen Geräten in voller Länge, auch am Praxisrechner.
- **Nie** beim Neuladen, bei Navigation, beim Zurückkehren aus dem Hintergrund oder nach dem
  Sperrbildschirm (ADR-025). Merker: `sessionStorage` `startbild-gezeigt` (ein Wahrheitswert, kein
  klinischer Inhalt; ANN-019 bleibt gewahrt), gesetzt beim Start des Intros, gelöscht beim Abmelden.
- Ohne Sitzung zeigt die App die Anmeldemaske ohne Intro; das Intro folgt nach der Anmeldung.
- Das Intro **wartet auf nichts**: Tagesliste und Profil laden währenddessen. Steht die Übersicht nach
  1,8 s nicht, erscheint der Ladezustand wie heute.

### Szenen und Dauern (unverändert aus dem Website-Intro, 1,8 s bis zur Seite)

| Bild | Szene      | Dauer  | Was passiert                                                                                                                 |
| ---- | ---------- | ------ | ---------------------------------------------------------------------------------------------------------------------------- |
| 1    | Papier     | 0,12 s | leere Fläche, „Überspringen“ steht                                                                                           |
| 2    | Rad        | 0,56 s | ein Laufrad (14 Speichen, Nabe) rollt von links herein, Drehung folgt dem Weg (φ = s / r), bremst an der Stelle des O        |
| 3    | Speiche    | 0,36 s | Speichen ziehen sich zur Nabe, Felge wird das O (Ellipse rx/ry der Marke, Strich 2,5 → 27,5 im 640er-Maß), 18° Restdrehung   |
| 4    | Buchstaben | 0,30 s | W und N wischen per `clip-path` von links auf (0,22 s, Staffel 0,06), MOTION fährt 24 px ein (0,24 s)                        |
| 5    | Wortmarke  | 0,14 s | harter Schnitt auf die unveränderte SVG-Datei, kurzes Halten                                                                 |
| 6    | Abgang     | 0,32 s | die Marke wird kleiner und wandert an ihren Platz; die Seite blendet gestaffelt ein (560 ms, Staffel 70 ms, 16 px von unten) |

Zwei Kurven im ganzen Stück: `cubic-bezier(.2,.7,.2,1)` für Ankommen und Erscheinen,
`cubic-bezier(.65,0,.35,1)` für Verwandlung und Abgang. Grund ist **Fläche `#eceee8`**, nicht Papier
— dieselbe Farbe wie `background_color` im Manifest, deshalb kein Sprung vom Systemstart ins Intro.
Alles ist Darstellung der Marke aus `marke/`: Buchstaben werden nur beschnitten und verschoben, nie
umgefärbt, gedreht oder gedehnt (Verbote in `marke/README.md`).

### Geometrie je Gerät (Maßstab zur 640er Marke des Website-Intros)

| Gerät             | Marke mittig                                            | Maßstab | Landeplatz (Bild 6)                                                                                                                                                                                                                                                                                  |
| ----------------- | ------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| < 640 (Handy)     | 300 breit, x 45, y 360 (bei 390 × 844; sonst zentriert) | 0,469   | Kopfzeile: links 16, oben 16, 24 hoch (Wortmarke der Kopfzeile wird in dem Moment sichtbar)                                                                                                                                                                                                          |
| 640–1023 (Tablet) | 420 breit, zentriert                                    | 0,656   | **Monogramm** 40 px oben in der Symbolspalte: W, N und die übrigen Buchstaben von MOTION blenden aus, **O und M bleiben** stehen und rücken als Paar in die 40er-Kachel; harter Schnitt auf `own-motion-monogramm.svg` am Ende (das Monogramm sind genau diese beiden Buchstaben, `marke/README.md`) |
| ≥ 1024 (PC)       | 640 breit, zentriert                                    | 1       | Seitenleiste: die Tiefgrün-Leiste schiebt sich in Bild 6 von links unter die Marke; mit dem Schnitt auf Tiefgrün wechselt die Datei zur **Papier-Fassung** (`own-motion-block-papier.svg`, eigene Datei, kein Umfärben); Ziel links 20, oben 24, 36 hoch                                             |

Die Buchstabenbereiche der 640er Marke (für `clip-path`): W 139,8–326,9, N 341,4–451,4, erste
Zeile bis 138,3; MOTION ab 158,7 oben und 150,6 links; O-Mitte 65,3 / 70,9; Rad-Radius 68. Alle Werte
skalieren mit dem Maßstab. Die Werte stammen aus `intro-scene-export.jsx` des Exports.

### Überspringen und reduzierte Bewegung

- Knopf **„Überspringen“** (_neu_, Sekundärknopf kompakt 44, Rahmen `line-strong`, oben rechts 16/16)
  ab Bild 1; ab Bild 2 beendet auch ein Tipp irgendwo auf die Fläche. Beides springt an den Anfang
  von Bild 6 (die Seite blendet trotzdem ein, 0,32 s).
- `prefers-reduced-motion: reduce`: nur Bild 5 und 6 ohne Bewegung — Marke steht 0,14 s, dann
  harter Schnitt auf die Seite. Gesamt 0,3 s.
- Der Knopf ist ein echter `<button>`; das Intro liegt in einem `aria-hidden`-Container über der
  Seite, der Fokus bleibt auf der Seite.

### Prüfung

- Komponententest: Szenenfolge nach Zeit (Cue-Tabelle), Merker gesetzt und beim Abmelden gelöscht,
  reduzierte Bewegung, Überspringen, kein Intro ohne Sitzung.
- Prüfseite `tests/e2e/fixtures/startbild.html` mit Tweak „Uhrzeit“ (Szene anspringen) für die
  Sichtprüfung bei 375, 834 und 1280 px.
- `src/marke.test.ts`: die Papier-Fassung und das Monogramm liegen byte-gleich in `public/marke/`.

## 7 · Reihenfolge der Umsetzung

1. Tokens und Manifest (`--text-leiste`, Strich, Symbolspalte 84; `theme_color`, `background_color`,
   `theme-color`). Kontrastpaare prüfen. Screenshot-Vergleich 375 / 834 / 1280.
2. Seitenleiste und Symbolspalte: Zustände, Strich, Beschriftung, Hover ohne Fläche.
3. Kopfzeile Handy: Abmelden als Symbol, „Wird abgemeldet …“; Tablet: Abstände.
4. Tableiste nach Reife, `/bereiche`-Satz, Vorschau-Protokoll als Funktion in der Suche.
5. Untermenü Organisatorisches: ein Punkt für Sicherheit und Aufbewahrung, Verlauf am Rand;
   Arbeitszeiten mit „Praxiseinstellungen“.
6. Akte unter 640 px: Untermenü weg, Rückweg in der Kopfkarte.
7. Tab-Titel je Route mit Test.
8. Startbild mit Prüfseite und Tests.

Jeder Schritt ein Commit; Tests der Seiten bleiben grün (Texte unverändert, nur Struktur und
Beschriftung des Rahmens). Nach dem Bau: Sichtung am Handy auf der Test-Umgebung, als Anna, Olivia
und Jannes; Schritte in `docs/sichtung/` ergänzen.

## 8 · Beim Bauen nachzutragen

- `BEFUNDE.md`: BEF-048, BEF-049, BEF-050 auf „entschieden 05.10.2026, Option …“; die übrigen
  Entscheidungen vom 05.10. (BEF-053, -054, -057, -061, -068, -069) ebenso, mit Verweis auf ihre Runde.
- `docs/decisions/ASSUMPTIONS.md`: je eine Annahme für das Startbild (einmal je Sitzung, Merker in
  `sessionStorage`), für die Tableiste nach Reife und für die Tab-Titel.
- `docs/development/ARBEITSBEREICHE.md`: Zeile zur Tableiste und zur Akte (Untermenü) nachziehen.
- `marke/README.md`: unter „Wo die Marke in der Anwendung steht“ das Startbild ergänzen.

Entwurf: Claude Design, 05.10.2026, auf der Leinwand „Design-Audit Praxisplattform“, Reihe 4.
Beispieldaten synthetisch.
