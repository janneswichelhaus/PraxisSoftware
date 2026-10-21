# Briefing 3 – Termine

Für Claude Design. Hebel 3 von 7. Quelle: Design-Review Lauf 1 vom 21.10.2026 (Befunde DR-132 bis
DR-136, dazu DR-114 und DR-159). Baut auf der Plattform-Sprache aus Briefing 1 auf; liegt deren
Ergebnis nicht vor, gelten die Leitplanken unten.

## Kontext

Own Motion ist eine private Physiotherapiepraxis in Tübingen (Eröffnung Juli 2027). **Jede
Behandlung ist ein Hausbesuch**: Die Therapeutin kommt mit dem Lastenrad zu den Menschen nach Hause;
Training findet zuhause, draußen oder per Video statt. Zur Praxissoftware gehört eine Web-App für
Patient:innen und Trainingskund:innen, die „Plattform“: am eigenen Telefon (375 px zuerst), auch am
Rechner, für Menschen bis 78 Jahre, Anrede „Sie“.

Termine bucht man hier nicht selbst: **Ein Terminwunsch ist ein Wunsch**, den das Büro der Praxis
bestätigt. Ändern und Absagen sind ebenfalls Wünsche; vor dem Absenden steht der Hinweis zum
Ausfallhonorar (bei weniger als 24 Stunden deutlich über dem Knopf). Die Belegung anderer Personen
ist nie sichtbar.

## Ziel

Der nächste Besuch soll sich anfühlen wie ein Versprechen: „Anna kommt am Donnerstag um 10:30 zu
Ihnen.“ Heute ist die Liste korrekt, aber gesichtslos: Datum und Titel gleich fett, keine Art
(Hausbesuch, Video, Praxis), kein „heute/morgen“, Namen mit Trennstrich, und der vergangene Termin
endet in „rufen Sie die Praxis an“ ohne Nummer.

## Ist-Zustand (Bilder zum Hochladen, Ordner `fuer-claude-design/03-termine/`)

| Datei                                    | Was zu sehen ist                                                                                                 |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `01-termine-375.png`                     | „Kommende Termine“ als Liste in einer Karte, „Termin wünschen“, „Vergangene Termine (8)“ eingeklappt.            |
| `02-diese-woche-375.png`                 | „Diese Woche“ Tag für Tag mit Übungstagen und Terminen, „Nichts geplant.“ an leeren Tagen.                       |
| `03-wunsch-375.png`                      | Terminwunsch, Schritt 1 von 2: Tage und Tageszeiten als Kästchen.                                                |
| `04-termin-aendern-oder-absagen-375.png` | Termin, Schritt 1 von 3 „Was möchten Sie?“: „Termin ändern“ und „Termin absagen“.                                |
| `05-absage-ausfallhonorar-375.png`       | Absage, Schritt 2 von 3 „Ausfallhonorar“: rechtzeitig, kein Honorar; Regel auf Abruf; „Verstanden, weiter“.      |
| `06-vergangener-termin-375.png`          | Vergangener Termin: „Dieser Termin lässt sich hier nicht mehr ändern. Bei Fragen rufen Sie bitte die Praxis an.“ |
| `07-termine-begleitung-375.png`          | Termine aus Sicht einer Begleitperson („Sie handeln für Max Mustermann“).                                        |
| `08-termine-1280.png`                    | Termine am Rechner (576 px breite Spalte).                                                                       |
| `09-lange-namen-375.png`                 | Lange Namen und Adressen in der Liste.                                                                           |

Was trägt: die geführten Abläufe für Wunsch, Ändern und Absage (Kopf mit Termin und ✕, „Zurück“,
„Schritt 2 von 3“, eine Frage je Seite, Hauptknopf unten), das Ausfallhonorar als eigener Schritt mit
klarer Aussage („Ihre Absage geht rechtzeitig ein … es entsteht kein Ausfallhonorar“).

## Probleme nach Schwere

**S2:**

- Liste ohne Gesicht und Art, Datum und Titel konkurrieren (beide fett), kein relativer Tag (DR-132).
- Sackgasse am vergangenen Termin: „rufen Sie an“ ohne Nummer und ohne Knopf (DR-133). Die Rufnummer
  der Praxis steht heute nicht zur Verfügung – bis dahin führt der Weg zu „Der Praxis schreiben“.
- Silbentrennung in Namen („Anna Bei-spiel“, „Jan-nes“) (DR-114); „Ihre Therapeut:in“, wo der Name
  bekannt ist (DR-159).

**S3:**

- Terminwunsch als Kästchenformular (DR-134).
- „Diese Woche“: „Nichts geplant.“ an drei von fünf Tagen; die Pillen „Übungstag“ und „Termin“ über
  dem Text, das Datum mittig (DR-135).
- „Termin wünschen“ ist bedienbar, während die Liste noch lädt (DR-136).

## Referenzmuster

- **One Medical** (App Store, gesehen): nächster Termin als erste Karte mit rundem Foto, Datum und
  Uhrzeit, „Details“ und „Ändern“. → Der nächste Besuch als Karte mit Person.
- **MyChart** (Hilfe, beschrieben): „Termin anfragen“ mit Wunschtagen und Zeitfenstern, Prüfschritt
  vor dem Senden, „Ändern“ nur, wo online möglich – sonst anrufen. → Zusammenfassung vor dem Senden.
- **Doctolib** (Hilfe, beschrieben): Hinweis auf Verbindlichkeit an drei Stellen (Buchung,
  Bestätigung, Erinnerung), Frist als klare Regel, danach „Praxis anrufen“. → Ausfallhonorar dort,
  wo entschieden wird. Nicht: Selbstbuchung, Umstellen auf Video.
- **ottonova** (App Store, gesehen): eine Zeitleiste mit Datumsüberschriften und Symbol je Art. →
  Hausbesuch, Video und Training auf einen Blick unterscheidbar. Nicht: Werbekarten.

## Bildschirme und Zustände

1. **Termine (Liste):** nächster Besuch als Karte (Person mit Bild „wenn vorhanden“, Art,
   „kommt zu Ihnen“ bei Hausbesuch, Anschrift, Tag relativ: heute, morgen, Donnerstag); weitere
   Termine als ruhige Zeilen; angefragte Wünsche („angefragt – die Praxis meldet sich“, nie wie ein
   bestätigter Termin); „Diese Woche“ mit Übungstagen (leere Tage zusammengefasst); vergangene
   Termine eingeklappt. Hauptknopf „Termin wünschen“. Zustände: keine Termine, nur Wünsche, laden,
   Fehler, ohne Netz, Lesefrist (nur lesen).
2. **Ein Termin:** kommend (Schritt „Was möchten Sie?“ mit „Termin ändern“ und „Termin absagen“),
   vergangen (Weg zu „Der Praxis schreiben“; Variante „Praxis anrufen“, wenn eine Rufnummer
   vorliegt), abgesagt, angefragt.
3. **Terminwunsch** (geführt, 2 Schritte): Tage und Tageszeiten wählen (große Wahlflächen statt
   Kästchen), freie Zeile, Zusammenfassung, Bestätigung „Ihr Wunsch ist bei der Praxis angekommen“.
4. **Absage** (geführt, 3 Schritte): Ausfallhonorar rechtzeitig und knapp (weniger als 24 Stunden,
   deutlich über dem Knopf), Grund, Bestätigung.
5. **Begleitperson und Trainingskundin:** dieselben Seiten mit „Sie handeln für …“ bzw. Videotermin
   und Einheiten im Training.
6. **Rechner (1280 px):** Liste und nächster Besuch nebeneinander; der Wunsch als Fenster.

## Feste Grenzen

**Marke** (unverändert): Wortmarke „OWN / MOTION“ nur als gelieferte Datei – nicht umfärben, drehen,
dehnen, keine Kontur, kein Schatten, kein Piktogramm und kein Rad daneben; Schutzraum die Höhe der
MOTION-Zeile; Mindesthöhe 24 px. Farben: Hauptfarbe #004429, Tiefgrün #042c1b, Papier #f6f7f4.

**Werte der App:** Fläche #ffffff, Vertiefung #f4f5f7, Tinte #14181b, Leise #5a6169, Linie #e6e8eb,
Linie stark #767c84, Hauptfarbe #004429, Salbei hell #e1f0e4, Warnung #5a4300 auf #f3ead6, Fehler
#7a2418 auf #f4e3e0. Schrift Hanken Grotesk. Radien: Knopf und Feld 10, Karte 14, Bild 16, Pille
rund. Knopf 48 px, kompakt 44. Rhythmus 4/8/12/16/24/32 px.

**Darf auf der Plattform abweichen:** Bilder (Personenbild, Platzhalter; keine KI-Bilder in der
Umsetzung), mehr Weißraum (40/48 px), eine Schattenstufe, Markenfläche Tiefgrün, eigene Schriftskala
ab 18 px, ruhige Bewegung. Nicht: neue Farbfamilie, Dunkelmodus, zweite Fassung der Marke.

**Bausteine** (Werte dürfen sich ändern, nicht die Rolle): Seitenkopf, Abschnitt, Liste aus ganzen
Zeilen (Zeit · Titel · Zusatz · Zustand), Kachel, Knopf, Symbolknopf, Chip, Segment, Statuszeichen
(Zeichen + Wort), Rückmeldung, Rückfrage, Fenster, geführter Ablauf, Formularfuß, Monatsblatt
(44 px je Tag), Personenbild, Laden/Fehler/Leer, Kleingedrucktes, Aufklapper.

**Nicht verhandelbar:**

- 375 px zuerst, dann 1280 px; Ziele ≥ 44 px (Knöpfe 48); 200 % Zoom (188 px) und „Sehr groß“ ohne
  Verlust.
- Kontrast ≥ 4,5:1 für Text, ≥ 3:1 für Linien; Farbe nie allein; sichtbarer Fokus.
- **Keine Selbstbuchung, keine freien Zeiten anderer:** Wunsch bleibt Wunsch, Belegung anderer
  Personen nie sichtbar, auch nicht als „belegt“.
- Wortlaut des Ausfallhonorars kommt aus den Praxisstammdaten; Form frei, Inhalt nicht.
- Keine neuen Funktionen (kein Kalender-Export, keine Erinnerungseinstellung hier) – was es an Daten
  nicht gibt (Foto der Person, Rufnummer der Praxis), nur als Variante „wenn vorhanden“.
- Sprache: „Sie“; „Termin wünschen“; Dauer statt „Länge“ oder „Terminfenster“; keine Silbentrennung
  in Namen und Adressen.
- Nur synthetische Daten (Anna Beispiel, Testweg 7, 72072 Tübingen).
- „Bewegung reduzieren“: nur Farbe.

## Gewünschtes Ergebnis

1. Entwürfe bei **375 px** und **1280 px** für die Bildschirme oben, je mit normal, leer, laden,
   Fehler, ohne Netz; „Sehr groß“ und 200 % für die Liste und den Wunsch; lange Namen und Adressen.
2. Höchstens zwei Varianten für die Karte „nächster Besuch“ (mit und ohne Personenbild), mit
   Empfehlung.
3. Übergabe für Claude Code im Format der bisherigen Handoffs (Markdown): 0 Entscheidungen · 1
   Geltung · 2 Tokens · 3 Bausteine · 4 Layout und Responsive · 5 Bildschirme mit Maßen und Texten
   (neue Texte _neu_) · 6 Barrierefreiheit · 7 Bewegung · 8 Prüfung · 9 Reihenfolge der Umsetzung
   (je Schritt ein Pull Request) · 10 Beim Bauen nachzutragen.
