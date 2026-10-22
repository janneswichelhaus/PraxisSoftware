# Briefing 2 – Übungen

Für Claude Design. Hebel 2 von 7. Quelle: Design-Review Lauf 1 vom 21.10.2026 (Befunde DR-127 bis
DR-131, dazu DR-117 und DR-154). Baut auf der Plattform-Sprache aus Briefing 1 auf; liegt deren
Ergebnis nicht vor, gelten die Leitplanken unten.

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

## Ist-Zustand (Bilder zum Hochladen, Ordner `fuer-claude-design/02-uebungen/`)

| Datei                           | Was zu sehen ist                                                                                                                 |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `01-uebungen-plan-375.png`      | Reiter „Übungen“: Planname als Versal-Etikett, Stand und Laufzeit, Übungstage als 7 Pillen, „Jetzt üben“, Liste, „Plan als PDF“. |
| `02-einheit-375.png`            | Durchführung: „ÜBUNG 1 VON 3“, vier Kacheln (Durchgänge, Wiederholungen, Pause, Mit), Schrittliste, Durchgänge zum Abhaken.      |
| `03-planblatt-375.png`          | Plan als Blatt am Bildschirm (zum Drucken oder als PDF).                                                                         |
| `04-training-375.png`           | Dieselbe Seite als „Training“ einer Trainingskundin.                                                                             |
| `05-ohne-netz-375.png`          | Ohne Verbindung: „! Ohne Verbindung. Hier ist nur, was auf diesem Gerät liegt.“, Planname in Versalien, „Jetzt üben“.            |
| `06-einheit-pruefseite-375.png` | Durchführung an einer Prüfseite, ganze Seite.                                                                                    |
| `07-uebungen-1280.png`          | Reiter „Übungen“ am Rechner (576 px breite Spalte).                                                                              |
| `08-laden-375.png`              | Laden: ein Satz in einer Karte.                                                                                                  |

Was trägt: die großen Zeilen zum Abhaken je Durchgang, die Anleitung in nummerierten Schritten, die
Dosierung in Worten, „Sie brauchen“ und „Hinweis“ der Fachperson, das Üben ohne Netz (jeder Haken
liegt zuerst auf dem Gerät).

## Probleme nach Schwere

**S2:**

- Plan und Einheit lesen sich wie ein Textdokument – kein Bild, keine Bühne, kein Moment (DR-127).
- Übungstage als sieben umrahmte Pillen in zwei Reihen; ob und wie man wählt, ist nicht zu erkennen
  (DR-128).
- Kein Druckzustand an Knöpfen und Zeilen (DR-117); eine Schriftgröße für alles, Versal-Etiketten
  (DR-154).

**S3:**

- „Jetzt üben“ ohne Dauer und Hilfsmittel vorab (DR-129).
- Der Hauptknopf „Nächste Übung“ liegt am Seitenende unter dem Text, darunter ein Erklärsatz;
  „Abbrechen“ als kleiner Textknopf oben rechts (DR-130).
- Langer Planname in Versalien mit Trennstrich („KNIE-TO-TALENDOPROTHESE“) (DR-131).

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
   diesem Gerät“.
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

**Darf auf der Plattform abweichen:** Bilder (Platzhalter, keine KI-Bilder in der Umsetzung), mehr
Weißraum (40/48 px), eine Schattenstufe, Markenfläche Tiefgrün, eigene Schriftskala ab 18 px, ruhige
Bewegung. Nicht: neue Farbfamilie, Dunkelmodus, zweite Fassung der Marke.

**Bausteine** (Werte dürfen sich ändern, nicht die Rolle): Seitenkopf, Abschnitt, Liste aus ganzen
Zeilen, Kachel, Knopf (Haupt, Zweit, leise), Symbolknopf, Chip, Segment, Statuszeichen (Zeichen +
Wort), Rückmeldung, Rückfrage, Fenster, geführter Ablauf, Formularfuß, Aktionsleiste (klebend über
dem unteren Rand), Bild 4:3, Personenbild, Laden/Fehler/Leer, Kleingedrucktes, Aufklapper.

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
