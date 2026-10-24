# Briefing 2 – Übungen

Für Claude Design. Hebel 2 von 7. Quelle: Design-Review Lauf 1 vom 21.10.2026 (Befunde DR-127 bis
DR-131, dazu DR-117 und DR-154). Aufgefrischt am 24.10.2026: Schritt 1 (Briefing 1) ist gebaut und
abgenommen, die Bilder zeigen den Stand danach.

**Mitgeben:** dieses Briefing, die 22 Bilder aus `fuer-claude-design/02-uebungen/`,
`docs/design/PLATTFORM.md` und als Grundlage das „Own Motion Designsystem“ und die Leinwand
„Plattform – Erster Eindruck“ (Briefing 1).

## Kontext

Own Motion ist eine private Physiotherapiepraxis in Tübingen (Eröffnung Juli 2027). Jede
Behandlung ist ein Hausbesuch; die Therapeut:innen fahren Lastenrad. Zur Praxissoftware gehört eine
Web-App für Patient:innen und Trainingskund:innen, die „Plattform“: am eigenen Telefon (375 px
zuerst), auch am Rechner, für Menschen bis 78 Jahre, Anrede „Sie“. Die Therapeutin stellt beim
Hausbesuch einen Heimübungsplan zusammen; die Person übt dann allein zu Hause – „Ich stehe in der
Küche und mache meine Übungen“. Im Personal Training heißt derselbe Bereich „Training“.

## Ziel

Üben soll sich anfühlen wie bei Kaia oder Hinge Health – ruhig, klar, mit Vorfreude –, ohne deren
Punkte, Serien und Lob. Heute liest sich der Plan wie ein Textdokument: kein Bild, keine Dauer, die
Übungstage ohne erkennbaren Zustand, der Hauptknopf der Einheit am Seitenende.

**Wichtig: Bilder und Videos der Übungen gibt es noch nicht.** Der Praxisinhaber dreht sie selbst;
KI-Bilder sind ausgeschlossen. Der Entwurf muss deshalb **ohne Medien vollwertig** sein. Zusätzlich
bitte eine Variante „mit Video der Praxis“ zeigen (Platzhalter), damit das Layout später nicht neu
gedacht werden muss – gebaut wird sie erst, wenn Medien vorliegen.

## Seit Schritt 1 gebaut – gilt, bitte nicht neu entwerfen

Die Plattform-Sprache aus Briefing 1 steht im Code und in `PLATTFORM.md`. Sie ist hier die Grundlage:

- **Schrift und Raum:** Skala in rem – Seitentitel 28/800 (Rechner 32), Abschnitt 22/700, Zeile
  18/600, Text 18/400, nichts unter 18; keine Versalien; 40 px zwischen Abschnitten (Rechner 48),
  Seitenrand 20. Eine Schattenstufe nur für Hero-, Aufgaben- und Besuchskarte. Druck an Knopf, Zeile
  und Karte: 98 % und vertiefte Fläche in 120 ms.
- **Bausteine:** Hero-Karte (Tiefgrün, eine je Bildschirm), Aufgabenkarte, Besuchskarte, Skelett statt
  „wird geladen …“, Leerzustand mit Markenform, Schalter, Wahlreihe, geführter Ablauf mit „Später“
  und Balken je Schritt, Verbindungszeile ohne Netz.
- **Gerüst:** Kopf 72 mit Initialen; Reiterleiste in drei Stufen (eine Reihe, zwei Reihen, unter
  23rem ein Menü); ab 1024 px Navigation im Kopf und jede Seite in einer Spalte von 48rem.
- **Seitentyp „Durchführung“** ist in `PLATTFORM.md` schon beschrieben – Übung im Vollbild, Hauptknopf
  fest unten, ohne Reiterleiste –, aber noch nicht gebaut: Heute steht die Reiterleiste darunter.
- **Einstieg aus der Übersicht:** „Ihre Übungen für heute“ ist dort die Hauptsache (Hero-Karte mit
  „Übungen beginnen“, führt direkt in die Durchführung) oder eine Aufgabenkarte unter „Heute“; im
  Training „Ihr Plan für zu Hause“ (Bild 22).

Damit erledigt: DR-117 (Druckzustand), DR-154 (Skala, Versalien) und DR-131 (der Planname steht in
Satzschreibung). Offen bleiben DR-127 bis DR-130, dazu zwei neue Befunde (unten).

## Ist-Zustand (Bilder vom 24.10.2026, Ordner `fuer-claude-design/02-uebungen/`)

Alles synthetisch. Bilder 01, 03, 04, 06, 12 bis 16 aus dem lokalen Stack (Erika, Behandlung;
Tina, Training), die übrigen von der Prüfseite `plattform-uebungen.html` mit einem langen Plan.
Ganzseitenaufnahmen: Die Reiterleiste steht am Telefon fest unten und liegt deshalb mitten im Bild.

| Datei                                           | Was zu sehen ist                                                                                           |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `01-uebungen-plan-375.png`                      | Reiter „Übungen“: Planname, Stand und Laufzeit, Übungstage als sieben Pillen in zwei Reihen, „Jetzt üben“. |
| `02-uebungen-langer-planname-375.png`           | Langer Planname, drei gewählte Übungstage mit Haken, „Zuletzt geübt: heute“, „Weiter üben“.                |
| `03-uebungen-1280.png`                          | Derselbe Reiter am Rechner in der Spalte von 48rem.                                                        |
| `04-training-375.png`                           | „Training“ einer Trainingskundin mit Plan.                                                                 |
| `05-training-ohne-plan-375.png`                 | Leer: „Noch kein Plan“.                                                                                    |
| `06-einheit-375.png`                            | Durchführung: „Übung 1 von 3“, vier Kacheln, „So geht’s“ in Schritten, Durchgänge, „Nächste Übung“.        |
| `07-einheit-langer-name-375.png`                | Durchführung mit langem Übungsnamen neben „Abbrechen“ – das Wort bricht (BEF-196).                         |
| `08-einheit-1280.png`                           | Durchführung am Rechner.                                                                                   |
| `09-einheit-beenden-375.png`                    | Abschluss: drei Skalen 0–10, freies Feld, drei Knöpfe; die Reiterleiste liegt über dem Inhalt.             |
| `10-ohne-netz-plan-375.png`                     | Reiter ohne Verbindung: Verbindungszeile oben, Plan bleibt.                                                |
| `11-ohne-netz-einheit-375.png`                  | Durchführung ohne Verbindung.                                                                              |
| `12-laden-375.png`                              | Laden: noch ein Satz in einer Karte, kein Skelett.                                                         |
| `13-fehler-375.png`                             | Fehler ohne Plan auf dem Gerät.                                                                            |
| `14-fehler-mit-plan-auf-dem-geraet-375.png`     | Serverfehler mit Plan auf dem Gerät – sagt „Ohne Verbindung“ (BEF-197).                                    |
| `15-planblatt-375.png`, `16-planblatt-1280.png` | Plan als Blatt (Drucken oder als PDF sichern).                                                             |
| `17-plan-sehr-gross-375.png`                    | Reiter bei „Sehr groß“.                                                                                    |
| `18-einheit-sehr-gross-375.png`                 | Durchführung bei „Sehr groß“.                                                                              |
| `19-plan-200-prozent-188.png`                   | Reiter bei 200 % (188 px): Planname und Übungen brechen mitten im Wort (BEF-196).                          |
| `20-einheit-200-prozent-188.png`                | Durchführung bei 200 %: „Durchgang“ bricht vor dem „g“ in den Haken-Zeilen (BEF-196).                      |
| `21-termine-mit-uebungstagen-375.png`           | Termine: „Diese Woche“ mit den Übungstagen – dort taucht der Plan ebenfalls auf.                           |
| `22-uebersicht-uebungen-heute-375.png`          | Übersicht nach Schritt 1: „Ihre Übungen für heute“ als Aufgabenkarte unter „Heute“.                        |

Was trägt: die großen Zeilen zum Abhaken je Durchgang, die Anleitung in nummerierten Schritten, die
Dosierung in Worten, „Sie brauchen“ und „Hinweis“ der Fachperson, das Üben ohne Netz (jeder Haken
liegt zuerst auf dem Gerät).

## Probleme nach Schwere

**S2:**

- Plan und Einheit lesen sich wie ein Textdokument – kein Bild, keine Bühne, kein Moment (DR-127).
- Übungstage als sieben Pillen in zwei Reihen; gewählte tragen jetzt Haken und Fläche, aber eine
  Rückmeldung wie „Sie üben an 3 Tagen“ fehlt, und am Telefon brauchen sie zwei Reihen (DR-128).
- Übungs- und Plannamen brechen mitten im Wort – bei 375 px neben „Abbrechen“, bei 200 % in Titel,
  Dosierung und Haken-Zeilen (BEF-196).

**S3:**

- „Jetzt üben“ ohne Dauer und Hilfsmittel vorab (DR-129).
- Durchführung nicht im Vollbild: Reiterleiste darunter, „Nächste Übung“ am Seitenende unter dem
  Text, darunter ein Erklärsatz; „Abbrechen“ als kleiner Textknopf oben rechts (DR-130).
- „Einheit beenden“: drei Knöpfe gleich laut, der Planname abgeschnitten mit „Mehr“.
- Laden als Satz statt Skelett; ein Serverfehler heißt „Ohne Verbindung“ (BEF-197).

## Referenzmuster

- **PhysiApp** (App Store, gesehen): „Übung 2 von 4“, Dosierung in einer Zeile („Sätze 3 · Wdh 10 ·
  Pause 30 s“), Hilfsmittel als Chips, Ausführungstext darunter. Nicht: Auszeichnungen,
  „Therapietreue 85 %“.
- **Medbridge GO** (App Store, gesehen): vor dem Start die Übungen des Tages als Liste, Gliederung
  Ausgangsstellung / Bewegung / Tipp, der Abschluss sagt, dass die Fachperson es sieht. Nicht: „High
  fives!“.
- **Kaia** (App Store, gesehen): „Das erwartet Sie heute“ mit Art und Dauer, Hilfsmittel vorab, ältere
  Menschen in Wohnzimmern. Passt zum Hausbesuch. Nicht: Duzen, Kamera-Coach.
- **Hinge Health** (App Store, gesehen): „15 min · Hilfsmittel: Stuhl, Tisch“ vor „Beginnen“, Player
  vollflächig mit Zähler. Nicht: Punkte, Level.
- **Apple Health, Medikamente** (Hilfe, beschrieben): „Genommen“ und „Ausgelassen“ gleichwertig –
  Vorbild für „gemacht“ ohne Druck.

## Bildschirme und Zustände

1. **Reiter „Übungen“ / „Training“:** Plan mit Name (Satzschreibung), gültig bis, wie oft je Woche;
   Übungstage wählen (Zustand sichtbar, eine Zeile); Vorschau der Einheit (Zahl der Übungen, Dauer
   „wenn vorhanden“, Hilfsmittel); „Jetzt üben“ als Hauptknopf im Daumenbereich; Liste der Übungen;
   „Plan als PDF“; „Frage zu diesem Plan“. Zustände: kein Plan („Ihre Therapeutin stellt Ihnen hier
   Übungen zusammen“), mehrere Pläne, Einheit liegt noch auf dem Gerät („noch nicht übertragen“),
   heute schon geübt, Lesefrist (nur lesen).
2. **Durchführung (Vollbild, ohne Reiterleiste):** Übung n von m mit Fortschritt; Dosierung als
   Chips oder Kacheln; Anleitung in Schritten; Hilfsmittel und Hinweis; Durchgänge abhaken; Pause als
   ruhige Uhr (keine Alarmfarbe, kein Countdown-Druck); „Nächste Übung“ fest unten; „Abbrechen“
   erreichbar, aber leise. **Abschluss „Einheit beenden“** (gibt es schon): kurze Angaben zur Einheit
   nach Plan (etwa wie anstrengend, Schmerz, Sicherheit – Skala 0–10), freiwilliges Feld „Das war
   schwierig, weil …“ mit dem Satz, wer es liest, heute drei Aktionen („Einheit beenden“, „Zurück zu
   den Übungen“, „Abbrechen“) – bitte auf einen Hauptknopf ordnen. Danach „Gespeichert“ bzw. „Liegt
   auf dem Gerät und wird übertragen“ – ohne Lob. Variante „mit Video der Praxis“ (Platzhalter).
3. **Ohne Verbindung:** dieselbe Durchführung mit Zeile „Ohne Verbindung – Ihre Haken liegen auf
   diesem Gerät“. Getrennt davon der Fehler bei bestehender Verbindung: Die Praxis antwortet gerade
   nicht, geübt werden kann trotzdem mit dem Plan vom letzten Laden (BEF-197). Laden als Skelett.
4. **Planblatt:** Bildschirm und Druck (A4, schwarzweiß tauglich, Marke im Kopf).
5. **Rechner (1280 px):** Plan links, Vorschau der Einheit rechts; Durchführung mittig mit großem
   Hauptknopf.

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
bleiben Platzhalter, keine KI-Bilder in der Umsetzung. Nicht: neue Farbfamilie, Dunkelmodus, zweite Fassung
der Marke.

**Bausteine** (Werte dürfen sich ändern, nicht die Rolle): Seitenkopf, Abschnitt, Liste aus ganzen
Zeilen, Kachel, Knopf (Haupt, Zweit, leise), Symbolknopf, Chip, Segment, Statuszeichen (Zeichen +
Wort), Rückmeldung, Rückfrage, Fenster, geführter Ablauf, Formularfuß, Aktionsleiste (klebend über
dem unteren Rand), Bild 4:3, Personenbild, Laden/Fehler/Leer, Kleingedrucktes, Aufklapper; dazu die
Plattform-Bausteine aus Schritt 1 (Hero-Karte, Aufgabenkarte, Besuchskarte, Skelett, Schalter,
Wahlreihe, Verbindungszeile).

**Nicht verhandelbar:**

- 375 px zuerst, dann 1280 px; Ziele ≥ 44 px (Knöpfe 48); 200 % Zoom (188 px) und „Sehr groß“ ohne
  Verlust.
- Kontrast ≥ 4,5:1 für Text, ≥ 3:1 für Linien; Farbe nie allein; sichtbarer Fokus.
- **Keine Bewertung, keine Spielmechanik:** keine Punkte, kein Score, keine Serie („3 Tage in
  Folge“), kein Lob („Super!“), kein Countdown-Druck, keine rote Zahl, keine Prozent-Therapietreue.
- Keine neuen Funktionen: Rückmeldung zur Einheit nur so weit, wie es sie gibt (Haken je Durchgang,
  freiwilliges Feld „Das war schwierig, weil …“).
- Sprache: „Sie“; „Übung“ und „Variante“, nie „Workout“ oder „Drill“; Planname in Satzschreibung.
- Nur synthetische Daten (Übungen wie „Mit Halt leicht in die Knie gehen“, „Becken anheben“).
- „Bewegung reduzieren“: nur Farbe.

## Gewünschtes Ergebnis

1. Entwürfe bei **375 px** und **1280 px** für die Bildschirme oben, je mit normal, leer, laden,
   Fehler, ohne Netz; „Sehr groß“ und 200 % für die Durchführung; langer Planname.
2. Variante „mit Video der Praxis“ für Übung und Durchführung (Platzhalter, nur Entwurf).
3. Übergabe für Claude Code im Format der bisherigen Handoffs (Markdown): 0 Entscheidungen · 1
   Geltung · 2 Tokens · 3 Bausteine · 4 Layout und Responsive · 5 Bildschirme mit Maßen und Texten
   (neue Texte _neu_) · 6 Barrierefreiheit · 7 Bewegung · 8 Prüfung · 9 Reihenfolge der Umsetzung
   (je Schritt ein Pull Request) · 10 Beim Bauen nachzutragen.
