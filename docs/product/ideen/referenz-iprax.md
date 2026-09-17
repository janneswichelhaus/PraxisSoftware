# Referenz: iPrax — Kalender, Anlegen-Menü, Patientenansicht

> Nicht normativ. Siehe [../IDEENSPEICHER.md](../IDEENSPEICHER.md).

Jannes hat am 2026-09-16 fünf Bildschirmfotos aus **iPrax** geteilt, der
Praxissoftware, die er heute benutzt. Festgehalten wird hier, was sie über
**Aufbau und Ablauf** zeigen — als Anregung, nicht als Vorbild für
Datenmodell, Berechtigungen oder Rechtsrahmen.

**Herkunft und Grenzen.** Ein fremdes Produkt. Vorlage für Umfang, Ablauf und
Informationsarchitektur; **keine Übernahme** von Texten, Symbolen, Grafiken,
Benennungen oder Code (Urheber- und Markenrecht). Was übernommen wird,
entsteht in unserer Sprache und in unserer Reihenfolge.

**Ein Bildschirmfoto zeigte echte Patientendaten** (Name, Anschrift,
Telefonnummer, E-Mail-Adresse, Geburtsdatum, Kostenträger). Es liegt **nicht**
im Repository, und aus ihm wird hier **kein Inhalt** wiedergegeben — nur der
Aufbau der Seite. Für weitere Screenshots gilt: Demo-Datensatz oder geschwärzt
(`PROJECT_PRINCIPLES.md` §3.1, `CLAUDE.md`, „Harte Regeln").

## Was die Bilder zeigen

**Tagesansicht, Telefon.** Spalten je behandelnder Person, Zeitachse im
5-Minuten-Raster, die laufende Zeit als Punkt am Rand, hinterlegte Fläche für
Zeiten außerhalb der Arbeitszeit. Ein belegter Block trägt seine Zeitspanne im
Klartext. Unten eine Leiste mit vier Bereichen, oben Datum mit Kalenderwoche.

**Anlegen aus dem Kalender.** Auf der freien Fläche wird eine **Zeitspanne
aufgezogen** (im Bild 09:45–10:15, in einem zweiten Bild nur ein
Rasterpunkt). An der Auswahl erscheint ein Menü mit fünf Einträgen: *Neuer
Termin*, *Gruppentermin*, *Dauertermin*, *Fehlzeit*, *Dauerfehlzeit*. Die
Auswahl ist am Rand mit einer Sprechblasenspitze mit der gewählten Zeit
verbunden — die Zeit steht also schon fest, bevor die Art gewählt wird.

**Stammdaten einer Person.** Eine Seite mit Feldzeilen und darüber eine
Symbolreihe für die Unterbereiche derselben Person. Aufgebaut ist sie
personenzentriert: erst die Person, dann der Bereich.

## Was Jannes daraus entschieden hat (2026-09-16)

Entschieden ist es **hier nicht** — dieser Ordner entscheidet nichts. Die
Festlegungen stehen in
[`../../development/CAL-EPIC-004.md`](../../development/CAL-EPIC-004.md), die
Änderung an §8.1 in `PROJECT_PRINCIPLES.md` 0.11, die offenen Punkte als E16
und E17 in [`../../decisions/OPEN_DECISIONS.md`](../../decisions/OPEN_DECISIONS.md).

| Aus dem Vorbild | Entscheidung |
| --- | --- |
| Zeitspanne aufziehen, dann Art wählen | übernommen (CAL-019) |
| *Neuer Termin*, *Dauertermin*, *Fehlzeit*, *Dauerfehlzeit* | übernommen |
| *Gruppentermin* | **vorerst nicht** |
| Freie Terminlänge | übernommen, mit Zeichen bei Abweichung von 45/60 (CAL-020) |
| Personenzentrierte Unterbereiche | steht seit AKTE-000/UI-002a/DAT-001 — fünf Bereiche in der Akte |
| Symbolreihe ohne Beschriftung | **nicht** übernommen: Symbole tragen bei uns eine Beschriftung |

## Was für uns anders bleiben muss

- **Termine hängen an einer Abrechnungsgrundlage.** iPrax zeigt Termine je
  Person; Jannes will sie **je Verordnung** gruppiert sehen, und die
  Grundlage kann auch ein Privatrezept oder eine Selbstzahler-Rechnung sein.
  Das ist bei uns eine offene Entscheidung (**E16**), keine Übernahme.
- **Keine PIN, keine Sammelkonten, keine Symbolnavigation ohne Text.**
- **Fehlzeit ist bei uns ein Ereignis**, kein eigener Datentyp — sonst
  entstünde eine zweite Terminart neben der, die es schon gibt.

## Merksatz

Das Vorbild liefert die **Geste** und die **Reihenfolge der Entscheidungen**
beim Anlegen — nicht die Begriffe und nicht das Modell darunter.
