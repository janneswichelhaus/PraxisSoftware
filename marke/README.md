# Marke: Own Motion

Die Marke der Praxis, als Dateien und als Regel. **Festgelegt von Jannes am
2026-09-10**, übernommen aus dem Entwurfskanvas „Own Motion · Logo 3b —
Reinzeichnung, App-Symbole, Anwendungen, Regeln".

## Was dieses Verzeichnis ist — und was nicht

- Es ist die **einzige Quelle** für Wortmarke, App-Symbole und die Regeln ihrer
  Verwendung. Wer ein Logo braucht, nimmt eine Datei von hier; es wird keine
  zweite Fassung an anderer Stelle gepflegt.
- Es ist **verbindlich für die Marke** — Farben, Schutzraum, Mindestgröße und
  Verbote sind einzuhalten, wo die Marke auftritt.
- Es ist **kein Implementierungsauftrag**. Die Anwendung ist bewusst **nicht**
  umgebrandet: Favicon, Akzentfarbe und Kopfzeile sind unverändert. Das wäre
  eine eigene Aufgabe (siehe „Was noch aussteht").
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

## Befunde und was noch aussteht

Drei Punkte, die beim Übernehmen der Dateien aufgefallen sind. Keiner davon ist
entschieden; sie stehen hier, damit sie nicht verloren gehen.

1. **Die App-Symbole liegen nur als PNG vor.** Der Kanvas kündigt sie „jeweils
   SVG + PNG" an; im gelieferten Bündel waren nur die sechs PNG enthalten. Für
   das 1024er Master und den Android-Kreis wäre eine SVG-Fassung sinnvoll,
   bevor jemand aus einem PNG heraus neu zeichnet.
2. **Favicon 24 und 16 tragen die zweizeilige Marke.** Bei 16 px ist sie nicht
   mehr lesbar, und die eigene Mindestgröße-Regel (24 px für den Block) ist
   damit im eigenen Dateisatz unterschritten. Entweder ein eigenes,
   vereinfachtes Kleinformat — oder die Regel bewusst für Favicons ausnehmen.
   Das ist eine Gestaltungsentscheidung, keine Korrektur.
3. **Die SVG tragen C2PA-Metadaten des Entwurfswerkzeugs**, je rund 7,7 KB —
   bei den Block-Dateien etwa zwei Drittel des Dateiinhalts. Sie sind
   unverändert übernommen, damit die Herkunft nachvollziehbar bleibt. Wer die
   Dateien schlanker will, kann den `<metadata>`-Block folgenlos entfernen.

**Nicht umgesetzt und bewusst offen:** das Erscheinungsbild der Anwendung.
Favicon, Design-Tokens (`src/index.css`) und Kopfzeile führen weiterhin die
neutrale Gestaltung aus UI-000. Ein Umbranden berührt UI-000 und die
Farbkontraste der Tokens und gehört in einen eigenen Loop, nicht nebenbei.
Ebenso offen: das Logo auf der Rechnung — die Roadmap führt es als Teil von
**ABR-000** (Praxis-Stammdaten für Rechnungen).
