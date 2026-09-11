# Marke: Own Motion

Die Marke der Praxis, als Dateien und als Regel. **Festgelegt von Jannes am
2026-09-10**, übernommen aus dem Entwurfskanvas „Own Motion · Logo 3b —
Reinzeichnung, App-Symbole, Anwendungen, Regeln".

Der Kanvas liegt seit dem 2026-09-11 selbst hier:
[`kanvas/own-motion-logo-3b.html`](kanvas/own-motion-logo-3b.html). Er ist
eine in sich geschlossene HTML-Datei und lässt sich in jedem Browser öffnen.
Damit ist die Herkunft oben nicht nur behauptet, sondern nachprüfbar — und was
unten steht, lässt sich gegen die Vorlage halten, statt gegen eine Erinnerung.
**Er ist Beleg, nicht Quelle:** Gilt etwas, dann weil es in diesem Dokument
steht; wo beide auseinandergehen, ist das ein Fehler in diesem Dokument und
wird hier behoben.

## Was dieses Verzeichnis ist — und was nicht

- Es ist die **einzige Quelle** für Wortmarke, App-Symbole und die Regeln ihrer
  Verwendung. Wer ein Logo braucht, nimmt eine Datei von hier; es wird keine
  zweite Fassung an anderer Stelle gepflegt.
- Es ist **verbindlich für die Marke** — Farben, Schutzraum, Mindestgröße und
  Verbote sind einzuhalten, wo die Marke auftritt.
- Es ist **kein Implementierungsauftrag**. Dass die Anwendung die Marke seit
  dem 2026-09-10 trägt, geht auf einen eigenen Auftrag von Jannes zurück, nicht
  auf dieses Verzeichnis (siehe „Wo die Marke in der Anwendung steht").
- Es ändert **keine Anforderung** aus `PROJECT_PRINCIPLES.md`, einem ADR oder
  einer Feature-Spezifikation. Es steht neben ihnen, nicht über ihnen.

## Die Marke

|                         |                                                                                                                                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name                    | **Own Motion**                                                                                                                                                                               |
| Wortmarke               | zweizeilig, „OWN" über „MOTION", linksbündig am O                                                                                                                                            |
| Unterzeile              | „Physiotherapie per Lastenrad" — nur in der festgelegten Form                                                                                                                                |
| Träger                  | Jannes Wichelhaus, Physiotherapeut, Tübingen                                                                                                                                                 |
| Betriebsbeginn          | 01.07.2027 (deckt sich mit der Eröffnung in `docs/development/ROADMAP.md`)                                                                                                                   |
| Kontakt auf Drucksachen | hallo@ownmotion.de                                                                                                                                                                           |
| Schrift                 | Hanken Grotesk ExtraBold, Unterzeile Bold — **nur als Vorlage**. Alle Dateien hier sind ausgezeichnete Vektorpfade; zum Setzen der Marke wird keine Schrift benötigt und keine mitgeliefert. |

## Farben

| Rolle      | Wert      | Verwendung                                               |
| ---------- | --------- | -------------------------------------------------------- |
| Hauptfarbe | `#004429` | Marke auf Papier oder heller Fläche                      |
| Papier     | `#f6f7f4` | Marke auf Tiefgrün oder auf der Hauptfarbe               |
| Tiefgrün   | `#042c1b` | Fläche: App-Symbol, Aufkleber, Visitenkarten-Vorderseite |
| Schwarz    | `#000000` | ausschließlich Rechnung und Fax                          |

Keine weiteren Kombinationen. Kein Salbei in der Marke.

## Regeln

**Schutzraum.** Rundum mindestens die Höhe der MOTION-Zeile. Nichts anderes
darin — auch keine Unterzeile außer der festgelegten.

**Mindestgröße.** Digital 24 px Höhe, Druck 8 mm Höhe, jeweils für den Block
ohne Unterzeile. Mit Unterzeile: 60 px beziehungsweise 20 mm; darunter steht
der Block allein.

**Verbote.** Nicht drehen, dehnen, umfärben, mit Kontur oder Schatten versehen.
Versatz und Abstände nicht ändern. Kein Piktogramm daneben, kein Rad.

## Dateien

Wortmarke — `logo/`, SVG, ausgezeichnete Pfade, eine Füllfarbe je Datei:

| Datei                                     | Fläche                   | Farbe     |
| ----------------------------------------- | ------------------------ | --------- |
| `own-motion-block-farbig.svg`             | Papier oder helle Fläche | `#004429` |
| `own-motion-block-schwarz.svg`            | Rechnung, Fax            | `#000000` |
| `own-motion-block-papier.svg`             | Tiefgrün oder Hauptfarbe | `#f6f7f4` |
| `own-motion-block-unterzeile-farbig.svg`  | wie oben, mit Unterzeile | `#004429` |
| `own-motion-block-unterzeile-schwarz.svg` | wie oben, mit Unterzeile | `#000000` |
| `own-motion-block-unterzeile-papier.svg`  | wie oben, mit Unterzeile | `#f6f7f4` |

Seitenverhältnis: Block `5330.93 × 2035.73`, mit Unterzeile `5330.93 × 2492.83`
(Einheiten des Pfadraums, nicht Pixel). Die Dateien tragen keine feste
Pixelgröße — sie skalieren.

App-Symbole — `app/`, PNG, Fläche Tiefgrün:

| Datei                            | Größe       | Form                     |
| -------------------------------- | ----------- | ------------------------ |
| `own-motion-app-1024.png`        | 1024 × 1024 | quadratisch, das Master  |
| `own-motion-app-ios-1024.png`    | 1024 × 1024 | iOS-Rundung              |
| `own-motion-app-android-512.png` | 512 × 512   | Kreis, Ecken transparent |
| `own-motion-favicon-48.png`      | 48 × 48     | Favicon                  |
| `own-motion-favicon-24.png`      | 24 × 24     | Favicon                  |
| `own-motion-favicon-16.png`      | 16 × 16     | Favicon                  |

## Anwendungen außerhalb der Anwendung

Vier Stellen, für die der Kanvas Maße festlegt. Sie sind hier festgehalten,
weil sie sonst mit dem Entwurf verloren gingen — **gebaut ist keine davon**,
und dieser Abschnitt ist kein Auftrag, eine zu bauen.

| Stelle                 | Maße und Fassung                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------- |
| Aufkleber am Lastenrad | Tiefgrün, ca. 40 × 17 cm, Eckradius 16. Block **mit** Unterzeile in Papier             |
| Rechnungskopf          | schwarzweiß, A4-Kopf, Marke **14 mm** hoch — die schwarze Fassung ohne Unterzeile      |
| Website-Header         | Marke **32 px** hoch, Knopfradius 10                                                   |
| Visitenkarte           | 85 × 55 mm; Vorderseite Tiefgrün mit der Marke in Papier, Rückseite Papier mit Kontakt |

Der Rechnungskopf gehört fachlich zu **ABR-000** (Praxis-Stammdaten für
Rechnungen); der Website-Header zu einer Website, die es noch nicht gibt.
Aufkleber und Visitenkarte sind Druckaufträge und berühren die Software nicht.

## Wo die Marke in der Anwendung steht

Umgesetzt am 2026-09-10 auf ausdrücklichen Auftrag von Jannes.

| Stelle                        | Was dort steht                                                                                                          |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Favicon                       | `app/own-motion-favicon-48/24/16.png` über `<link rel="icon">` in `index.html`                                          |
| App-Symbol auf dem Homescreen | `app/own-motion-app-1024.png` als `apple-touch-icon` — das quadratische Master, weil iOS seine eigene Maske darüberlegt |
| Seitentitel                   | „Own Motion"                                                                                                            |
| Anmeldemaske                  | Wortmarke `logo/own-motion-block-farbig.svg`, 40 px                                                                     |
| Kopfzeile der Anwendung       | dieselbe Wortmarke, 26 px — sie ersetzt den Organisationsnamen (ANN-023)                                                |
| „Zugang nicht eingerichtet"   | dieselbe Wortmarke, 40 px — die einzige Vollseite nach der Anmeldung ohne Anwendungsrahmen                              |
| Akzentfarbe                   | Hauptfarbe `#004429`; Hover trägt Tiefgrün `#042c1b` (ANN-022)                                                          |

**Ausgeliefert wird über `public/marke/`.** Vite liefert nur aus, was dort
liegt; die Dateien sind **byte-gleiche Kopien** dieses Verzeichnisses, und
`src/marke.test.ts` prüft das bei jedem Testlauf. Damit bleibt es bei einer
Quelle: wer hier etwas ändert, ohne die Kopie nachzuziehen, bricht den Test.
Kopiert wird nur, was die Anwendung braucht — Druckfassungen und der
Android-Kreis bleiben allein hier.

Die Regeln oben sind im Code erzwungen, nicht nur beschrieben:
`src/components/ui/Wortmarke.tsx` verweigert eine Höhe unter 24 px, hält das
Seitenverhältnis und zeigt die Datei als Bild — ein Inline-SVG mit
`currentColor` könnte die Marke umfärben, eine Bilddatei nicht.
`src/components/ui/markeRegeln.ts` rechnet den Schutzraum aus.

**Noch nicht in der Anwendung:** das Logo auf der Rechnung (schwarze Fassung,
Teil von **ABR-000**) und der Android-Kreis, der ein Web-Manifest bräuchte —
das wäre eine Installationsfunktion und nicht mehr nur Marke.

## Befunde und was noch aussteht

Drei Punkte, die beim Übernehmen der Dateien aufgefallen sind. Keiner davon ist
entschieden; sie stehen hier, damit sie nicht verloren gehen.

1. **Die App-Symbole liegen nur als PNG vor.** Der Kanvas kündigt sie „jeweils
   SVG + PNG" an; im gelieferten Bündel waren nur die sechs PNG enthalten. Für
   das 1024er Master und den Android-Kreis wäre eine SVG-Fassung sinnvoll,
   bevor jemand aus einem PNG heraus neu zeichnet.

   **Bestätigt am 2026-09-11:** Der Kanvas liegt jetzt unter `kanvas/` und
   sagt im Abschnitt 4d wörtlich „jeweils SVG + PNG". Der Befund ist damit
   keine Vermutung mehr, sondern eine belegte Lücke im gelieferten Bündel.

2. **Favicon 24 und 16 tragen die zweizeilige Marke.** Bei 16 px ist sie nicht
   mehr lesbar, und die eigene Mindestgröße-Regel (24 px für den Block) ist
   damit im eigenen Dateisatz unterschritten. Entweder ein eigenes,
   vereinfachtes Kleinformat — oder die Regel bewusst für Favicons ausnehmen.
   Das ist eine Gestaltungsentscheidung, keine Korrektur.

   **Stand 2026-09-10:** die Dateien sind eingesetzt **wie geliefert**, der
   Befund ist damit sichtbar geworden, nicht behoben. Empfehlung: ein eigenes
   Kleinformat zeichnen — ein „OM"-Monogramm oder das alleinstehende „O" auf
   Tiefgrün —, und die Mindestgröße-Regel ausdrücklich auf die **Wortmarke**
   beziehen, nicht auf das App-Symbol. Beides sind verschiedene Dinge: die
   Regel schützt die Lesbarkeit von „MOTION", ein Symbol hat keine zweite
   Zeile zu verlieren. Solange das offen ist, zeigt der Browser bei 16 px
   einen grünen Block mit unlesbarer Schrift — erkennbar als Farbe, nicht als
   Wort. Die Entscheidung gehört Jannes.

3. **Die SVG tragen C2PA-Metadaten des Entwurfswerkzeugs**, je rund 7,7 KB —
   bei den Block-Dateien etwa zwei Drittel des Dateiinhalts. Sie sind
   unverändert übernommen, damit die Herkunft nachvollziehbar bleibt. Wer die
   Dateien schlanker will, kann den `<metadata>`-Block folgenlos entfernen.

**Erledigt am 2026-09-10:** das Erscheinungsbild der Anwendung. Favicon,
Akzentfarbe und Kopfzeile tragen die Marke; was wo steht, sagt der Abschnitt
„Wo die Marke in der Anwendung steht". Die Kontraste der Tokens sind
nachgerechnet und in `src/lib/kontrast.test.ts` festgehalten — der Akzent
erreicht als Textfarbe 10,30:1 auf der ungünstigsten Fläche.

**Weiterhin offen** neben den drei Befunden oben:

- Das Logo auf der Rechnung — die Roadmap führt es als Teil von **ABR-000**
  (Praxis-Stammdaten für Rechnungen). Die schwarze Fassung ist laut Farbtabelle
  genau dieser Fall und liegt fertig in `logo/`.
- Schrift und Radien der Oberfläche. Die Anwendung nutzt weiterhin die
  System-Schriftfamilie; Hanken Grotesk ist ausdrücklich nur Vorlage für das
  Setzen der Marke und wird **nicht** mitgeliefert. Ob die Oberfläche der Marke
  auch typografisch folgen soll, ist nicht entschieden — es wäre ein eigener
  Schritt mit eigener Abwägung (Ladezeit, Datenschutz beim Nachladen von
  Schriften, Lesbarkeit am Rad).
- Die Marke auf Papier innerhalb der Anwendung. Die Druckregeln blenden die
  Kopfzeile aus; die Wortmarke erscheint daher in keinem Ausdruck. Für den
  Tagesplan ist das gewollt (Toner, Platz), für die Rechnung kommt sie mit
  ABR-000.
