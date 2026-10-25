# Briefing 3 – Termine

Für Claude Design. Hebel 3 von 7. Quelle: Design-Review Lauf 1 vom 21.10.2026 (Befunde DR-132 bis
DR-136, dazu DR-114 und DR-159). Aufgefrischt am 24.10.2026: Schritt 1 (Briefing 1) ist gebaut und
abgenommen, 2a (Übungen, Bausteine) gemergt; die Bilder zeigen den Stand danach.

**Mitgeben:** dieses Briefing, die 24 Bilder vom 24.10.2026 (unten; auf der Leinwand „Plattform –
Termine“ als Seite „Ist“), `docs/design/PLATTFORM.md` und als Grundlage das „Own Motion
Designsystem“ (am 24.10.2026 auf den Code-Stand `main@616a5545` gebracht: Schriftskala der
Plattform, Tiefenstufe, Plattform-Bausteine im Bündel) und die Leinwände „Plattform – Erster
Eindruck“ (Briefing 1) und „Plattform – Übungen“ (Briefing 2).

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
Ihnen.“ Heute ist die Liste korrekt, aber gesichtslos: Datum und Titel gleich fett, keine Art auf
einen Blick (Hausbesuch, Video, Praxis), kein „heute/morgen“, der Hausbesuch in drei Zeilen, und der
vergangene Termin endet in „rufen Sie die Praxis an“ ohne Nummer.

## Seit Schritt 1 gebaut – gilt, bitte nicht neu entwerfen

Die Plattform-Sprache aus Briefing 1 steht im Code und in `PLATTFORM.md`. Sie ist hier die Grundlage:

- **Schrift und Raum:** Skala in rem – Seitentitel 28/800 (Rechner 32), Abschnitt 22/700, Zeile
  18/600, Text 18/400, nichts unter 18; keine Versalien; 40 px zwischen Abschnitten (Rechner 48),
  Seitenrand 20. Eine Schattenstufe nur für Hero-, Aufgaben- und Besuchskarte. Druck an Knopf, Zeile
  und Karte: 98 % und vertiefte Fläche in 120 ms.
- **Bausteine:** Hero-Karte (Tiefgrün, eine je Bildschirm), Aufgabenkarte, **Besuchskarte** (Tag
  groß, Zeit, nach einer Linie die Person mit Bild 56, Art und Ort – auf der Übersicht unter
  „Nächster Besuch“, Bild 18), Skelett statt „wird geladen …“, Leerzustand mit Markenform, Schalter,
  Wahlreihe, geführter Ablauf mit „Später“ und Balken je Schritt, Verbindungszeile ohne Netz,
  Vertretungsband; aus 2a die **Wochenleiste** (Wochentage als ein Segment, gewählt gefüllt mit
  Haken) und die **Abschlussseite** (Kreis mit Zeichen, Titel in der Stufe des Grußes, ein
  Hauptknopf).
- **Gerüst:** Kopf 72 mit Initialen; Reiterleiste in drei Stufen (eine Reihe, zwei Reihen, unter
  23rem ein Menü); ab 1024 px Navigation im Kopf und jede Seite außer der Übersicht in einer Spalte
  von 48rem.
- **Daten seit N1/N2 (#292):** Der Plattformkontext trägt den eigenen Namen und die **Rufnummer der
  Praxis** aus dem Absender der Rechnungen (ANN-691) – sie kann fehlen. Auf den Türen steht
  „Praxis anrufen“ schon als Hauptknopf (ANN-688). Ein Personenbild der Therapeutin gibt es nicht
  (N3 kommt später): Initialen auf neutraler Fläche.
- **Entschieden (Jannes, PR #297 Frage 4):** „Termin ansehen“ auf der Übersicht führt heute zur
  Liste; die Seite des einen Termins wird sein Ziel.

Damit erledigt: DR-114 (Silbentrennung nie in Namen und Anschriften, Schritt 0b) und DR-117
(Druckzustand). Offen bleiben DR-132 bis DR-136, dazu zwei neue Befunde (unten).

## Ist-Zustand (Bilder vom 24.10.2026)

Alles synthetisch. Bilder 01 bis 18 von der Prüfseite `plattform.html` (Erika: ein Hausbesuch in
drei Tagen, ein Praxistermin mit offenem Änderungswunsch, zwei vergangene, zwei Wünsche, ein
Übungsplan), 19 bis 24 aus dem lokalen Stack mit reichem Seed (Erika: sechs kommende Termine, acht
vergangene; Paula: Begleitung für Max). Ganzseitenaufnahmen: Die Reiterleiste steht am Telefon fest
unten und liegt deshalb mitten im Bild.

| Datei                                                                  | Was zu sehen ist                                                                                                                       |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `01-termine-375.png`                                                   | „Kommende Termine“ als Liste in einer Karte, „Termin wünschen“, „Ihre Wünsche“, „Diese Woche“ mit Übungstagen, Vergangene eingeklappt. |
| `02-termine-1280.png`                                                  | Dieselbe Seite am Rechner in der Spalte von 48rem – einspaltig.                                                                        |
| `03-termine-sehr-gross-375.png`                                        | „Sehr groß“: der Hausbesuch in sechs Zeilen, „Änderung angefragt“ bricht mitten im Wort (BEF-220).                                     |
| `04-termine-200-prozent-188.png`                                       | 200 %: „Wunsch zurückziehen“ bricht ohne Strich („zurückzieh/en“, BEF-220); jeder Tag der Woche in drei Zeilen.                        |
| `05-termine-begleitung-375.png`, `23-termine-begleitung-stack-375.png` | Begleitung mit „Sie handeln für …“ – ein Termin, sonst dieselbe Seite.                                                                 |
| `06-termine-ohne-netz-375.png`                                         | Ohne Verbindung: Verbindungszeile, die Liste bleibt, „Termin wünschen“ bleibt bedienbar.                                               |
| `07-termine-vergangene-offen-375.png`                                  | Vergangene Termine aufgeklappt, „durchgeführt“ als Zeichen und Wort.                                                                   |
| `08-termin-was-moechten-sie-375.png`                                   | Ein Termin, Schritt 1 von 3: „Termin ändern“ (Hauptknopf) und „Termin absagen“ im Fuß.                                                 |
| `09-absage-ausfallhonorar-375.png`                                     | Absage, Schritt 2 „Ausfallhonorar“: rechtzeitig, kein Honorar, die Regel auf Abruf.                                                    |
| `10-absage-ausfallhonorar-kurzfristig-375.png`                         | Dasselbe unter 24 Stunden: Warnung mit „!“ in Warnfarbe.                                                                               |
| `11-absage-zusammenfassung-375.png`                                    | „Ist alles richtig?“, „Ändern“ an der Zeile, Nachricht eingeklappt, Satz zum Eingang über „Absage senden“.                             |
| `12-aendern-wann-375.png`, `13-wunsch-wann-375.png`                    | „Wann passt es Ihnen?“: Montag bis Freitag und Tageszeiten als Kästchen in zwei Spalten (DR-134).                                      |
| `14-wunsch-zusammenfassung-375.png`                                    | „Ist alles richtig?“ mit „Dienstag und Donnerstag, Vormittag, bis Donnerstag, 12.11.“ und „Wunsch senden“.                             |
| `15-wunsch-200-prozent-188.png`, `16-wunsch-sehr-gross-375.png`        | Der Wunsch bei 200 % und „Sehr groß“: Kästchen untereinander, der Fuß rutscht unter den Inhalt.                                        |
| `17-wunsch-1280.png`                                                   | Der Wunsch am Rechner als breites Fenster, Inhalt schmal in der Mitte.                                                                 |
| `18-uebersicht-naechster-besuch-375.png`                               | Übersicht nach Schritt 1: „Nächster Besuch“ als Besuchskarte – hier schon, was die Terminliste nicht hat.                              |
| `19-termine-laden-375.png`                                             | Laden: „Ihre Termine werden geladen …“ als Satz in einer Karte, „Termin wünschen“ schon bedienbar (DR-136).                            |
| `20-termine-fehler-375.png`                                            | Fehler mit „Erneut versuchen“; „Termin wünschen“ bleibt (gewollt: wünschen geht auch ohne Liste).                                      |
| `21-termine-stack-375.png`                                             | Sechs kommende Termine (Mo bis Mi je Hausbesuch und Praxis) als gleichförmige Zeilen ohne Hauptsache.                                  |
| `22-vergangener-termin-375.png`, `24-vergangener-termin-1280.png`      | Vergangener Termin: „… rufen Sie bitte die Praxis an.“ – ohne Nummer und Knopf, obwohl sie seit N2 vorliegt (DR-133, BEF-221).         |

Was trägt: die geführten Abläufe für Wunsch, Ändern und Absage (Kopf mit Termin und ✕, „Zurück“,
„Schritt 2 von 3“, eine Frage je Seite, Hauptknopf unten), das Ausfallhonorar als eigener Schritt mit
klarer Aussage („Ihre Absage geht rechtzeitig ein … es entsteht kein Ausfallhonorar“), die Wünsche
als „angefragt – die Praxis meldet sich“, nie wie ein Termin, die Besuchskarte der Übersicht.

## Probleme nach Schwere

**S2:**

- Liste ohne Hauptsache, Gesicht und Art auf einen Blick, Datum und Titel konkurrieren (beide fett),
  kein relativer Tag; der Hausbesuch braucht drei Zeilen, bei „Sehr groß“ sechs (DR-132).
- Sackgasse am vergangenen Termin: „rufen Sie an“ ohne Nummer und ohne Knopf (DR-133). Seit N2 liegt
  die Rufnummer vor, wenn die Praxis eine führt; ohne Nummer führt der Weg zu „Der Praxis
  schreiben“ (BEF-221).
- Wörter brechen mitten im Wort: das Statuszeichen „Änderung angefragt“ bei „Sehr groß“, der Knopf
  „Wunsch zurückziehen“ bei 200 % (BEF-220).

**S3:**

- Terminwunsch als Kästchenformular in zwei Spalten (DR-134); am Rechner ein breites Fenster mit
  schmalem Inhalt.
- „Diese Woche“: die Pillen „Übungstag“ und „Termin“ über dem Text, das Datum mittig; an Tagen ohne
  etwas „Nichts geplant.“ (DR-135).
- „Termin wünschen“ ist bedienbar, während die Liste noch lädt; Laden als Satz statt Skelett
  (DR-136).
- „Ihre Wünsche“ stehen zwischen Hauptknopf und Woche, jeder Wunsch mit vier Zeilen Text.

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

1. **Termine (Liste):** nächster Besuch als Karte (Person mit Initialen, Bild „wenn vorhanden“, Art,
   „kommt zu Ihnen“ bei Hausbesuch, Anschrift, Tag relativ: heute, morgen, Donnerstag); weitere
   Termine als ruhige Zeilen; angefragte Wünsche („angefragt – die Praxis meldet sich“, nie wie ein
   bestätigter Termin); „Diese Woche“ mit Übungstagen (leere Tage zusammengefasst); vergangene
   Termine eingeklappt. Hauptknopf „Termin wünschen“. Zustände: keine Termine, nur Wünsche, laden,
   Fehler, ohne Netz, Lesefrist (nur lesen).
2. **Ein Termin** (Ziel von „Termin ansehen“ und jeder Zeile): kommend mit „Termin ändern“ und
   „Termin absagen“ (heute Schritt 1 von 3 des Ablaufs), mit offenem Wunsch, vergangen („Praxis
   anrufen“, wenn eine Rufnummer vorliegt, sonst „Der Praxis schreiben“), abgesagt.
3. **Terminwunsch** (geführt, 2 Schritte): Tage und Tageszeiten wählen (große Wahlflächen statt
   Kästchen), freie Zeile, Zusammenfassung, Bestätigung „Ihr Wunsch ist bei der Praxis angekommen“.
4. **Ändern und Absage** (geführt, 3 Schritte): Ausfallhonorar rechtzeitig und knapp (weniger als
   24 Stunden, deutlich über dem Knopf), Zusammenfassung, Bestätigung.
5. **Begleitperson und Trainingskundin:** dieselben Seiten mit „Sie handeln für …“ bzw. Videotermin
   und Einheiten im Training.
6. **Rechner (1280 px):** Liste und nächster Besuch nebeneinander; der Wunsch als Fenster.

## Feste Grenzen

**Marke** (unverändert): Wortmarke „OWN / MOTION“ nur als gelieferte Datei – nicht umfärben, drehen,
dehnen, keine Kontur, kein Schatten, kein Piktogramm und kein Rad daneben; Schutzraum die Höhe der
MOTION-Zeile; Mindesthöhe 24 px. Farben: Hauptfarbe #004429, Tiefgrün #042c1b, Papier #f6f7f4 (Marke
auf Tiefgrün).

**Werte der App:** Fläche #ffffff, Vertiefung #f4f5f7, Tinte #14181b, Leise #5a6169, Linie #e6e8eb,
Linie stark #767c84, Hauptfarbe #004429, Salbei hell #e1f0e4, Warnung #5a4300 auf #f3ead6, Fehler
#7a2418 auf #f4e3e0. Schrift Hanken Grotesk. Radien: Knopf und Feld 10, Karte 14, Bild 16, Pille
rund. Knopf 48 px, kompakt 44. Rhythmus 4/8/12/16/24/32 px.

**Plattform:** Es gilt `PLATTFORM.md`, oben unter „Seit Schritt 1 gebaut“ zusammengefasst. Bilder
bleiben Platzhalter, keine KI-Bilder in der Umsetzung. Nicht: neue Farbfamilie, Dunkelmodus, zweite
Fassung der Marke.

**Bausteine** (Werte dürfen sich ändern, nicht die Rolle): Seitenkopf, Abschnitt, Liste aus ganzen
Zeilen (Zeit · Titel · Zusatz · Zustand), Kachel, Knopf, Symbolknopf, Chip, Segment, Statuszeichen
(Zeichen + Wort), Rückmeldung, Rückfrage, Fenster, geführter Ablauf, Formularfuß, Monatsblatt
(44 px je Tag), Personenbild, Laden/Fehler/Leer, Kleingedrucktes, Aufklapper; dazu die
Plattform-Bausteine aus Schritt 1 und 2a (oben).

**Nicht verhandelbar:**

- 375 px zuerst, dann 1280 px; Ziele ≥ 44 px (Knöpfe 48); 200 % Zoom (188 px) und „Sehr groß“ ohne
  Verlust.
- Kontrast ≥ 4,5:1 für Text, ≥ 3:1 für Linien; Farbe nie allein; sichtbarer Fokus.
- **Keine Selbstbuchung, keine freien Zeiten anderer:** Wunsch bleibt Wunsch, Belegung anderer
  Personen nie sichtbar, auch nicht als „belegt“.
- Wortlaut des Ausfallhonorars kommt aus den Praxisstammdaten; Form frei, Inhalt nicht.
- Keine neuen Funktionen (kein Kalender-Export, keine Erinnerungseinstellung hier) – was es an Daten
  nicht gibt (Foto der Person), nur als Variante „wenn vorhanden“; die Rufnummer gibt es, kann aber
  fehlen.
- Sprache: „Sie“; „Termin wünschen“; Dauer statt „Länge“ oder „Terminfenster“; keine Silbentrennung
  in Namen, Anschriften, Überschriften, Knöpfen und Statuszeichen.
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
