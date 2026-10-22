# Briefing 1 – Erster Eindruck und Plattform-Sprache

Für Claude Design. Hebel 1 von 7: Mit diesem Briefing beginnt die Arbeit; die übrigen sechs
übernehmen die Sprache, die hier entsteht. Quelle: Design-Review Lauf 1 vom 21.10.2026
(Befunde DR-101 bis DR-126, DR-154 bis DR-156, DR-160).

## Kontext

Own Motion ist eine private Physiotherapiepraxis in Tübingen, Eröffnung Juli 2027. Es gibt keine
Behandlungsräume: Jede Behandlung ist ein Hausbesuch, die Therapeut:innen fahren mit dem Lastenrad
zu den Menschen nach Hause. Abgerechnet wird privat (Privatrezept oder Selbstzahler).

Zur Praxissoftware gehört eine Web-App für Patient:innen und Trainingskund:innen, die „Plattform“.
Sie läuft im Browser des eigenen Telefons (375 px zuerst), auch am Rechner. Zielgruppe: Menschen bis
78 Jahre, viele ohne Übung mit Apps. Anrede „Sie“. Drei Gruppen:

1. **Patient:in während der Behandlung** (kostenlos): Fragebogen vor dem ersten Termin, Termine und
   Terminwünsche, Heimübungen, kurze Check-ins, Rechnungen, Dokumente, Einwilligungen, Nachrichten
   an die Praxis.
2. **Patient:in im Nachsorge-Abo** (monatlich kündbar): dasselbe, das Heimprogramm läuft weiter.
3. **Trainingskund:in** im Personal Training: Paket, Vertrag, Training, Ernährungstagebuch als
   Zusatzleistung.

Die Plattform ist ein eigener Bereich derselben App wie die Praxis-Oberfläche, aber eine eigene
Welt: keine Seitenleiste, keine Praxisbegriffe. Wer eingeladen wird, scannt beim Hausbesuch einen
QR-Code am Telefon der Therapeutin oder bekommt einen Link. Es gibt **kein Kennwort**: Angemeldet
wird mit einem Passkey (Gesicht, Fingerabdruck oder Gerätesperre), dazu eine PIN als Rückweg.

## Ziel

Eine Privatpatientin öffnet die Plattform zum ersten Mal – neben Doctolib, Oura und Headspace auf
demselben Telefon. In der ersten Minute soll sie wissen: Das ist meine Praxis, hier sind Menschen,
die zu mir kommen, und hier steht, was ich als Nächstes tun kann. Heute wirkt die Plattform wie ein
sauberes Formular: kein Bild auf 80 Seiten, 96 % aller Texte gleich groß, Technikwörter an der Tür,
keine Hauptsache auf der Startseite.

Das Briefing hat zwei Teile:

1. **Die Plattform-Sprache** – wärmer und hochwertiger als die Praxis-App, gleiche Marke, gleiche
   Bausteine: Bildwelt, Raum, eine Tiefenstufe, Schriftskala, Bewegung, Zustände.
2. **Der Weg vom QR-Code bis zur Übersicht** – Einladung, Anmeldung einrichten, Einstieg,
   Übersicht – und das Gerüst darum (Kopf, Reiter, Rechneransicht).

## Ist-Zustand (Bilder zum Hochladen, Ordner `fuer-claude-design/01-erster-eindruck/`)

| Datei                                | Was zu sehen ist                                                                                                            |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `01-einladung-375.png`               | Erster Bildschirm nach dem QR-Code: Wortmarke, „Ihr Zugang“, ein kleiner Satz über Passkey und PIN, ein Feld, „Weiter“.     |
| `02-passkey-einrichten-375.png`      | „Anmeldung einrichten“: Technikwörter („öffentlicher Schlüssel“, „Prüfsumme“), winziges Etikett „1. PASSKEY“, kein Bild.    |
| `03-einstieg-schritt-1-375.png`      | Einstieg Schritt 1 „Willkommen“: Gebrauchsanweisung („Unten finden Sie …“), „Dieser Zugang gilt für: Behandlung.“           |
| `04-einstieg-einwilligungen-375.png` | Schritt 2: zwei Einwilligungstexte mit eigenen Knöpfen, darunter „Weiter“ und „Später“ – zwei Knopfebenen.                  |
| `05-einstieg-fertig-375.png`         | Schritt 4 „Fertig“: ein Satz, „Zur Übersicht“.                                                                              |
| `06-uebersicht-mit-inhalt-375.png`   | Übersicht: „Guten Tag“ ohne Namen, „Jetzt dran“ als gleichförmige Liste, „Nächster Termin“, Notfallsatz auf der Startseite. |
| `07-uebersicht-training-375.png`     | Übersicht einer Trainingskundin: Gruß, ein Termin, Notfallsatz – sonst leer.                                                |
| `08-rechner-1280.png`                | Am Rechner: eine 576 px breite Telefonspalte, Reiterleiste unten mittig.                                                    |
| `09-reiterleiste-200-prozent.png`    | Bei 200 % Zoom: „Übungen“ und „Nachrichten“ sind abgeschnitten und nicht mehr erreichbar.                                   |
| `10-anmeldung-375.png`               | Anmeldeseite (gemeinsam mit der Praxis-App): „Mit Passkey anmelden“, zwei Aufklapper, Kleingedrucktes.                      |

Was heute trägt und bleiben soll: die Farben (kein einziger Kontrastfehler gemessen), der sichtbare
Fokusring, die geführten Abläufe (Kopf mit Objekt und ✕, „Schritt 2 von 3“, Hauptknopf unten), der
grüne Balken „Sie handeln für …“ bei Begleitpersonen, die konsequente Freiheit von Punkten, Serien
und Lob.

## Probleme nach Schwere

**S1 – verhindert Vertrauen oder Nutzung**

- **Die Tür begrüßt nicht.** Kein Willkommen, kein Absender, kein Wozu, keine Vorschau der Schritte
  (DR-101). Die Einrichtung spricht Technik statt Gerätesprache und zeigt nicht, was gleich passiert
  (DR-103).
- **Die Türseiten verfehlen die eigene Regel:** gemessen 4 bis 13 Texte unter 18 px je Seite
  (DR-102).
- **Der Einstieg erklärt die Oberfläche** statt anzukommen; kein Gesicht, kein „Was jetzt“ (DR-108).
- **Die Übersicht hat keine Hauptsache:** alle Zeilen gleich, kein Hauptknopf; der Fragebogen vor dem
  ersten Termin geht unter (DR-121).
- **Kein Bild, kein Mensch:** Die Therapeutin, die mit dem Lastenrad kommt, ist das stärkste
  Vertrauenssignal der Praxis und erscheint nur als Textzeile (DR-155).
- **Reiterleiste bei 200 % und „Sehr groß“:** Ziele abgeschnitten (DR-112).
- **Falsche Bestätigung:** Nach dem Absenden einer Nachricht zeigt der Reiter „Termine“ „Ihr Wunsch
  ist bei der Praxis angekommen“ (DR-160) – bitte im Gerüst so entwerfen, dass Reiter nur den
  Bereich weitertragen und Bestätigungen einmalig sind.

**S2 – deutlich unter Premium**

- Zwei Hauptknöpfe und zwei Knopfebenen im Einstieg (DR-109); Einstieg mit Reiterleiste und
  Versal-Kicker statt geführtem Ablauf (DR-110); Regeltexte zu Benachrichtigungen (DR-111).
- Am Rechner ein gestrecktes Telefon (DR-113).
- Silbentrennung in Namen, Orten und kurzen Wörtern („Anna Bei-spiel“, „Pra-xis“) (DR-114).
- Browser-Tab heißt nach der Anmeldung weiter „Anmelden – Own Motion“ (DR-115).
- Das Startbild (Markenanimation „ein Laufrad wird das O“) landet auf der Plattform falsch: am
  Rechner schiebt sich die Seitenleiste der Praxis-App ein, am Telefon landet die Marke über dem
  Seitentitel (DR-116).
- Kein Druckzustand, Reiterwechsel ohne Übergang (DR-117); keine Verbindungsanzeige (DR-118);
  Reiterleiste bleibt bei offener Tastatur stehen (DR-120).
- „Guten Tag“ ohne Namen, Systemsatz „Sie sind bei … angemeldet – Bereich Behandlung.“ mit „Mehr“
  (DR-122); Notfallsatz auf jeder Startseite (DR-123); Übersicht im Training fast leer (DR-124);
  Fachtitel „Anamnesebogen Version 8 (DIGOTOR)“ (DR-125); „Kennwort“ und „Mein Konto“ in Texten,
  obwohl es beides auf der Plattform nicht gibt (DR-104, DR-105); „Sitzung wird geprüft …“ (DR-106).
- Eine Schriftgröße für alles: 1 044 von 1 089 Texten sind 18 px, Abschnittstitel 18 px in
  Versalien (DR-154).

**S3 – Feinschliff:** drei Ausrichtungen auf drei Türseiten (DR-107), „Ich“ als Silhouette (DR-119),
Laden als Satz und in Sprüngen (DR-126), Abstände 6, 10 und 20 px außerhalb des Rhythmus (DR-156).

## Referenzmuster

- **Hinge Health** (App Store, gesehen): Gruß nach Tageszeit, darunter „Today“ mit einer großen
  Fotokarte und einem Knopf; die Therapeutin als Gesicht. → Eine Hauptkarte, Mensch statt Logo.
  Nicht übernehmen: Wochenziel 0/3, Punkte.
- **Oura** (App Store, gesehen): „Heute“ als ruhige Titelseite – Foto, Überschrift, zwei Sätze, ein
  Knopf. → Hero mit einem Satz. Nicht: Scores, kleine graue Schrift auf Dunkel.
- **Medbridge GO** (App Store, gesehen): zwei Schritte bis zum Start; der erste Satz nennt die
  Fachperson, die das Programm erstellt hat. → Wer einlädt, steht vorn.
- **PhysiApp** (Hilfe-Center, beschrieben): Ein zugewiesener Fragebogen kommt direkt nach der
  Anmeldung, dann das Programm. → Fragebogen vor dem ersten Termin als erste Hauptsache.
- **NHS login** (Fallstudie, beschrieben): Passkey in Gerätewörtern („Gesicht“, „Fingerabdruck“),
  Geräteliste im Konto. → Einrichtung ohne Technikwort.
- **Headspace** (Store und Analyse): kurzes Willkommen mit eigener Bildwelt, wenige Fragen, Abschluss
  mit genau einer Handlung. Nicht: Personalisierung für den Abo-Verkauf.

## Leitplanken für die Plattform-Sprache (Vorschlag aus dem Review)

Bitte als Ausgangspunkt nehmen, nicht als Vorgabe – begründete Abweichungen sind willkommen.

- **Bildwelt:** eigene Fotos der Praxis – Lastenrad, Hände bei der Behandlung, Wohnzimmer, Tübingen –
  im Entwurf als gekennzeichnete Platzhalter. Keine KI-Bilder (Entscheidung des Praxisinhabers).
  Markenflächen in Tiefgrün mit Papier-Schrift. Formen aus der Marke (das Laufrad, das zum O wird)
  nie neben der Wortmarke.
- **Hierarchie:** genau eine Hauptsache je Bildschirm: auf der Übersicht eine Hero-Karte „Als
  Nächstes“ (ein Satz, ein Knopf), darunter „Heute“, der nächste Besuch mit Person, eine kurze
  Liste.
- **Schrift:** nichts unter 18 px; Hierarchie über Größe statt nur Gewicht, etwa Gruß 34/800,
  Seitentitel 28/800, Abschnitt 22/700, Zeilentitel 18/600, Text 18/400, Leise 18/400. Keine
  Versalien-Etiketten. Silbentrennung nur in langen Wörtern, nie in Namen, Orten, Überschriften und
  Knöpfen.
- **Raum und Tiefe:** Abstände zwischen Abschnitten 40 oder 48; eine Schattenstufe für Karten, die
  man antippt; Listen bleiben Linie.
- **Bewegung:** Druckzustand an Knopf, Zeile und Reiter; ruhige Überblendung beim Seitenwechsel;
  Hero erscheint gestaffelt; „Bewegung reduzieren“ = nur Farbe.
- **Zustände:** Skelett der echten Form statt „wird geladen …“; Leerzustand mit Bild oder
  Markenform und einem Satz, was als Nächstes kommt; Verbindungszeile im Kopf ohne Netz.
- **Rechner (ab 1024 px):** Navigation im Kopf statt Reiterleiste unten, Inhalt bis 768 px,
  Übersicht zweispaltig ab 900 px Inhaltsbreite.

## Bildschirme und Zustände

1. **Einladung** (Link aus dem QR-Code): Begrüßung mit Absender („Own Motion lädt Sie ein“) und
   Wozu, Vorschau der drei Schritte (E-Mail, Gesicht oder Finger, PIN; „etwa 2 Minuten“), Feld
   E-Mail. Zustände: ungültige oder abgelaufene Einladung („gilt 14 Tage und nur einmal“), Adresse
   schon vergeben („mit Passkey anmelden und einlösen“), schon angemeldet („für dieses Konto
   einlösen“ / „abmelden und neu“), Dienst nicht erreichbar.
2. **Anmeldung einrichten:** Schritt Passkey mit schematischem Bild des Systemdialogs, ein Satz
   Sicherheit, Technik auf Abruf; Schritt PIN (sechs Ziffern, zweimal); Gerät unterstützt keine
   Passkeys; Fehler; fertig.
3. **Anmeldung** (Patient:innen und Praxis teilen die Seite): „Mit Passkey anmelden“, „am Rechner
   anmelden“ (Code mit dem Telefon scannen), „Passkey verloren? Die Praxis gibt Ihnen eine neue
   Einladung“. Der Aufklapper „Testkonten“ gibt es nur in der Test-Umgebung.
4. **Sperre** nach 30 Minuten ohne Bedienung (Passkey oder PIN) und **Zugang beendet/gesperrt**.
5. **Einstieg** als geführter Ablauf ohne Reiterleiste: Willkommen (mit Gesicht der Praxis, wenn
   vorhanden), Einwilligungen (je Einwilligung Ja/Nein gleichwertig, nichts ist Pflicht),
   Benachrichtigungen (ein Schalter, Feinheiten später), Abschluss mit dem nächsten Schritt als
   Hauptknopf. „Später“ immer sichtbar. Variante für Begleitpersonen (ohne Einwilligungen).
6. **Übersicht** in fünf Fassungen: Behandlung vor dem ersten Termin (Fragebogen offen), Behandlung
   im Alltag (heute üben, nächster Besuch, Antwort der Praxis, offene Rechnung), Trainingskundin
   (nächste Einheit, Paket läuft bis …), Begleitperson („Sie handeln für Max Mustermann“), Lesefrist
   läuft ab („Sie können hier noch bis 31.10. lesen“). Bereichsschalter „Behandlung | Training“, wenn
   eine Person beides hat.
7. **Gerüst:** Kopf (Wortmarke 28 px, „Ich“ mit Initialen, wenn bekannt), Reiterleiste mit vier
   Zielen (Übersicht, Termine, Übungen bzw. Training, Nachrichten) – erreichbar bei 200 % und „Sehr
   groß“, ausgeblendet bei offener Tastatur –, Rechnernavigation, Verbindungszeile, Landeplatz der
   Markenanimation beim Öffnen (oder ein eigener kürzerer Markenmoment für die Plattform – bitte als
   Variante).
8. **Bausteine**, die alle anderen Briefings brauchen: Hero-Karte, Aufgabenkarte (Symbol, Titel,
   Satz, Aktion), Zeile mit Personenbild, Skelett, Leerzustand mit Bild, Druckzustand,
   Notfallkarte (für Briefing 5).

## Feste Grenzen

**Marke** (unverändert, Dateien kommen aus dem Repository): Wortmarke „OWN / MOTION“ zweizeilig, nur
als gelieferte Datei – nicht umfärben, drehen, dehnen, keine Kontur, kein Schatten, kein Piktogramm
und kein Rad daneben; Schutzraum rundum die Höhe der MOTION-Zeile; Mindesthöhe 24 px (darunter das
Monogramm „OM“ auf Tiefgrün). Farben der Marke: Hauptfarbe #004429, Tiefgrün #042c1b, Papier #f6f7f4
(Marke auf Tiefgrün).

**Werte der App** (gelten weiter): Fläche #ffffff, Vertiefung #f4f5f7, Tinte #14181b, Leise #5a6169,
Linie #e6e8eb, Linie stark #767c84, Hauptfarbe #004429 (Knöpfe, Links, Titel), Salbei hell #e1f0e4
(Bestätigung), Warnung #5a4300 auf #f3ead6, Fehler #7a2418 auf #f4e3e0. Schrift Hanken Grotesk
(variabel 100–900). Radien: Knopf und Feld 10, Karte 14, Bild 16, Pille rund. Knopf 48 px hoch,
kompakt 44; Felder 48. Rhythmus 4/8/12/16/24/32 px.

**Darf auf der Plattform abweichen** (Entscheidung des Praxisinhabers: wärmer und hochwertiger als
die Praxis-App): Bilder, mehr Weißraum (dazu 40 und 48 px), eine Schattenstufe, Markenfläche
Tiefgrün, eine eigene Schriftskala ab 18 px, ruhige Bewegung. Nicht: eine neue Farbfamilie, ein
Dunkelmodus, eine zweite Fassung der Marke.

**Bausteine** (vorhanden; Werte dürfen sich ändern, nicht die Rolle): Seitenkopf, Abschnitt, Liste
aus ganzen Zeilen (Zeit · Titel · Zusatz · Zustand), Kachel, Knopf (Haupt, Zweit, leise),
Symbolknopf, Chip, Segment, Statuszeichen (Zeichen + Wort), Rückmeldung, Rückfrage am Klickort,
Fenster, geführter Ablauf, Formularfuß, Aktionsleiste, Bild 4:3, Personenbild rund, Laden/Fehler/
Leer, Kleingedrucktes, Aufklapper. Fehlt einer, wird er als Baustein entworfen.

**Nicht verhandelbar:**

- 375 px zuerst, dann 1280 px. Ziele ≥ 44 px (Knöpfe 48) mit Abstand. 200 % Zoom (188 px breit)
  ohne Verlust und ohne Querscrollen; „Groß“ (112,5 %) und „Sehr groß“ (125 %) ohne abgeschnittene
  Wörter.
- Kontrast ≥ 4,5:1 für Text, ≥ 3:1 für Linien von Bedienelementen; Farbe nie allein; sichtbarer
  Fokus.
- Keine Bewertung durch die Software: keine Ampel, kein Score, keine Trendlinie mit Deutung, kein
  Lob, keine Serie, kein Countdown, keine rote Zahl.
- Keine neuen Funktionen, keine neuen Abläufe. Was es an Daten heute nicht gibt (Name der Person,
  Foto der behandelnden Person, Rufnummer der Praxis), darf als Variante „wenn vorhanden“ erscheinen
  – immer mit der Fassung ohne.
- Feste Wortlaute bleiben inhaltlich: Notfallhinweis („Antwort in der Regel innerhalb von zwei
  Werktagen. Nicht für akute Beschwerden. Im Notfall 112, außerhalb der Sprechzeiten der ärztliche
  Bereitschaftsdienst 116117.“), Hinweis zum Ausfallhonorar, „Danke. Ihre Therapeut:in sieht Ihre
  Angaben beim nächsten Termin.“ (Name statt Doppelpunkt, wo er bekannt ist).
- Sprache: „Sie“, kurze Sätze. Nicht: Sitzung, Projektion, Instrument, Mein Konto, Kennwort (außer
  „kein Kennwort“), Passwort, „Version“ oder „DIGOTOR“ im Titel, JSON ohne Erklärung, Workout, Drill,
  „Kunde“ allein, PT, „Mein Tag“. Doppelpunkt-Formen nur, wo kein Name bekannt ist.
- Nur synthetische Daten (Erika Beispiel, Anna Beispiel, Max Mustermann, Testweg 7, 72072 Tübingen).
- „Bewegung reduzieren“ des Systems: nur Farbe, keine Wege, keine Größenänderung.

## Gewünschtes Ergebnis

1. Entwürfe aller Bildschirme oben bei **375 px** und **1280 px**, je mit den Zuständen normal, leer,
   laden, Fehler, ohne Netz; „Sehr groß“ und 200 % (188 px) mindestens für Einladung, Einstieg,
   Übersicht und Reiterleiste; lange Namen („Anna-Katharina Leutheusser-Schnarrenberger“); offene
   Tastatur bei der Einladung.
2. Eine kurze Seite „Plattform-Sprache“: Schriftskala, Abstände, Schatten, Bildwelt mit Beispielen
   der Platzhalter, Bewegung, Zustände – als Grundlage für Briefing 2 bis 7.
3. Wo eine Entscheidung offen ist (Markenmoment beim Öffnen, Reiterleiste bei 200 %, Rechnernavigation):
   höchstens zwei Varianten nebeneinander, mit Empfehlung.
4. Eine Übergabe für Claude Code im Format der bisherigen Handoffs des Projekts (Markdown):
   0 Entscheidungen (für Jannes) · 1 Geltung (was unverändert bleibt) · 2 Tokens (neu oder geändert,
   mit Wert und Verwendung) · 3 Bausteine (neu oder geändert, Props, Zustände) · 4 Layout und
   Responsive (375 / 640 / 1024 / 1280) · 5 je Bildschirm Aufbau, Maße und Texte (neue Texte als
   _neu_ markiert) · 6 Barrierefreiheit (Kontrastpaare, Ziele, Fokus, Vorlesesoftware) · 7 Bewegung
   (Dauer, Kurve, reduziert) · 8 Prüfung · 9 Reihenfolge der Umsetzung (je Schritt ein Pull Request)
   · 10 Beim Bauen nachzutragen.
