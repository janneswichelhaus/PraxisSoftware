# Briefing 5 – Nachrichten

Für Claude Design. Hebel 5 von 7. Quelle: Design-Review Lauf 1 vom 21.10.2026 (Befunde DR-137 bis
DR-140, dazu DR-120, DR-159 und DR-160). Baut auf der Plattform-Sprache aus Briefing 1 auf; liegt
deren Ergebnis nicht vor, gelten die Leitplanken unten.

## Kontext

Own Motion ist eine private Physiotherapiepraxis in Tübingen (Eröffnung Juli 2027); jede Behandlung
ist ein Hausbesuch per Lastenrad. Zur Praxissoftware gehört eine Web-App für Patient:innen und
Trainingskund:innen, die „Plattform“: am eigenen Telefon (375 px zuerst), auch am Rechner, für
Menschen bis 78 Jahre, Anrede „Sie“.

„Nachrichten“ sind **kein Chat**, sondern strukturierte Fragen an die Praxis: erst das Thema
(Übung · Beschwerden · Termin oder Rechnung · Sonstiges), dann der Text. Jede Nachricht hat einen
Zustand (bei der Praxis, beantwortet, erledigt) und eine zugesagte Antwortfrist („Antwort in der
Regel innerhalb von zwei Werktagen“). Über dem Eingabefeld steht dauerhaft der Notfallhinweis. Im
Nachsorge-Abo und im Training dürfen Foto und Video angehängt werden – nur aus der Kamera der App,
mit eigener Einwilligung beim ersten Mal, jeder Anhang mit Löschdatum. Antworten kommen heute „von
der Praxis“; die Antwort kann auf eine Stelle im Video zeigen.

## Ziel

Schreiben soll sich anfühlen wie bei Doctolib: Man weiß vorher, wann eine Antwort kommt und wofür
dieser Weg nicht da ist – ohne dass jede Seite alarmiert. Heute steht der Notfallkasten dreimal im
Ablauf, die Zustände sind kryptisch („… bei der Praxis“), und das Gespräch hat kein Gesicht.

## Ist-Zustand (Bilder zum Hochladen, Ordner `fuer-claude-design/05-nachrichten/`)

| Datei                     | Was zu sehen ist                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `01-liste-375.png`        | Liste: Notfallkasten oben, „Ihre Nachrichten“ mit Zuständen als Pillen („↩ beantwortet“, „… bei der Praxis“), „Neue Nachricht“. |
| `02-neu-375.png`          | Neue Nachricht: „1. Worum geht es?“ als umrahmte Radiozeilen, Notfallkasten, „2. Ihre Frage“, Zähler, „Nachricht senden“.       |
| `03-gespraech-375.png`    | Ein Gespräch: eigene Nachricht als Karte, Notfallkasten, „Noch etwas ergänzen“, „Senden“ und „Hat sich erledigt“.               |
| `04-tastatur-375.png`     | Mit offener Tastatur (angenähert): Reiterleiste bleibt stehen, Sendeknopf außer Sicht.                                          |
| `05-liste-1280.png`       | Liste am Rechner.                                                                                                               |
| `06-laden-375.png`        | Laden: ein Satz in einer Karte.                                                                                                 |
| `07-bestaetigung-375.png` | Nach dem Senden: „Ihre Nachricht ist bei der Praxis angekommen.“                                                                |

Was trägt: Thema vor Text, die feste Antwortfrist, der unveränderliche Notfallhinweis, „Hat sich
erledigt“ durch die Person selbst.

## Probleme nach Schwere

**S1:**

- Nach dem Senden wandert die Bestätigung über die Reiterleiste: Der Reiter „Termine“ zeigt danach
  „Ihr Wunsch ist bei der Praxis angekommen“, obwohl kein Wunsch gesendet wurde (DR-160).
  Bestätigungen gehören einmalig an den Ort der Handlung.

**S2:**

- Notfallkasten auf Liste, Detail und Neu – dreimal, jedes Mal als grauer Kasten (DR-137).
- Zustände mit Zeichen „↩ beantwortet“ und „… bei der Praxis“ (wirkt abgeschnitten); eine
  überschrittene Frist („Antwort bis 20.10.“ am 21.10.) hat keinen eigenen Zustand (DR-138).
- Gespräch ohne Gesicht, Antworten „von Praxis“; Zähler „0 von 2000 Zeichen“ schon vor dem Tippen;
  zwei volle Knöpfe (DR-139, DR-159).
- Bei offener Tastatur bleibt die Reiterleiste stehen (DR-120).

**S3:** drei Wörter für dieselbe Handlung („Neue Nachricht“, „Nachricht senden“, „Senden“); Themen
als eigene Radiogruppe (DR-140).

## Referenzmuster

- **Doctolib** (Hilfe, beschrieben): „Für wen?“ → „Grund“ → Text → Anhang; Notfallhinweis
  vorangestellt; Zustand „Warten auf Ihre Antwort“, geschätzte Antwortzeit; Abwesenheit der Praxis
  schon beim Schreiben sichtbar. Nicht: „anderer Grund → Termin buchen“.
- **NHS Care Cards** (Designsystem, beschrieben): Notfall als eigene Karte, die Überschrift ist die
  Handlung („Rufen Sie 112 an, wenn …“), ruhiger Ton, höchstens ein Link. Nicht: Symptomlisten (das
  wäre eine medizinische Einstufung, die die Plattform nicht macht).
- **MyChart** (Hilfe, beschrieben): Thema vor Text, Erwartung „meist drei Werktage“, Entwurf bleibt
  erhalten.
- **ottonova** (App Store, gesehen): Gespräch mit benannter Person, „Gelöst?“ durch die Person selbst.
  Nicht: Chatform, Bewertung des Gesprächs.

## Bildschirme und Zustände

1. **Liste:** Gespräche mit Thema, erster Zeile, Datum und Zustand (Wort + Zeichen: „Wartet auf
   Antwort“, „Beantwortet“, „Erledigt“); Antwortfrist als ruhige Zeile; „Nachricht schreiben“ als
   Hauptknopf. Zustände: keine Nachrichten, laden, Fehler, ohne Netz, Lesefrist (nur lesen), Frist
   überschritten (Form vorschlagen; Wortlaut klärt die Praxis).
2. **Schreiben** (geführt oder eine Seite – mit Empfehlung): Thema als große Wahl mit Symbol,
   Notfallkarte genau einmal über dem Textfeld, Text, optional Foto oder Video (nur wo erlaubt; mit
   Einwilligung beim ersten Mal), Senden, Bestätigung.
3. **Gespräch:** Kopf mit Thema und Praxis (Person mit Bild „wenn vorhanden“), Nachrichten als
   Verlauf mit Absender und Zeit, Anhänge mit Löschdatum, Antwort mit Sprung an eine Stelle im Video,
   „Noch etwas ergänzen“, „Hat sich erledigt“ leise.
4. **Tastatur offen:** Reiterleiste weg, Sendeknopf über der Tastatur.
5. **Begleitperson** („Sie handeln für …“) und **Training** (dieselben Seiten).
6. **Rechner (1280 px):** Liste links, Gespräch rechts.
7. **Neue Antwort am Reiter „Nachrichten“** (Entscheidung Jannes, PR #297 Frage 5): Seit der
   Übersicht aus Schritt 1e steht eine Antwort der Praxis weiter unten. Hier entscheiden, ob der
   Reiter dafür ein Zeichen trägt – ruhig, ohne Zahl, mit Wort für Vorlesesoftware; mit Empfehlung.

## Feste Grenzen

**Marke** (unverändert): Wortmarke „OWN / MOTION“ nur als gelieferte Datei – nicht umfärben, drehen,
dehnen, keine Kontur, kein Schatten, kein Piktogramm und kein Rad daneben; Schutzraum die Höhe der
MOTION-Zeile; Mindesthöhe 24 px. Farben: Hauptfarbe #004429, Tiefgrün #042c1b, Papier #f6f7f4.

**Werte der App:** Fläche #ffffff, Vertiefung #f4f5f7, Tinte #14181b, Leise #5a6169, Linie #e6e8eb,
Linie stark #767c84, Hauptfarbe #004429, Salbei hell #e1f0e4, Warnung #5a4300 auf #f3ead6, Fehler
#7a2418 auf #f4e3e0. Schrift Hanken Grotesk. Radien: Knopf und Feld 10, Karte 14, Bild 16, Pille
rund. Knopf 48 px, kompakt 44. Rhythmus 4/8/12/16/24/32 px.

**Darf auf der Plattform abweichen:** Bilder (Personenbild, Platzhalter; keine KI-Bilder), mehr
Weißraum (40/48 px), eine Schattenstufe, Markenfläche Tiefgrün, eigene Schriftskala ab 18 px, ruhige
Bewegung. Nicht: neue Farbfamilie, Dunkelmodus, zweite Fassung der Marke.

**Bausteine** (Werte dürfen sich ändern, nicht die Rolle): Seitenkopf, Abschnitt, Liste aus ganzen
Zeilen, Knopf, Symbolknopf, Chip, Wahlreihe, Statuszeichen (Zeichen + Wort), Rückmeldung, Rückfrage,
Fenster, geführter Ablauf, Formularfuß, Textfeld mit Zähler, Medienbild, Personenbild,
Laden/Fehler/Leer, Kleingedrucktes.

**Nicht verhandelbar:**

- 375 px zuerst, dann 1280 px; Ziele ≥ 44 px; 200 % Zoom (188 px) und „Sehr groß“ ohne Verlust.
- Kontrast ≥ 4,5:1 für Text, ≥ 3:1 für Linien; Farbe nie allein; sichtbarer Fokus.
- **Kein Chat**, keine Lesebestätigung, keine Tippanzeige, keine Einstufung nach Dringlichkeit; der
  Notfallhinweis ist für alle gleich und hängt nie vom Inhalt ab.
- Notfallhinweis im Wortlaut: „Antwort in der Regel innerhalb von zwei Werktagen. Nicht für akute
  Beschwerden. Im Notfall 112, außerhalb der Sprechzeiten der ärztliche Bereitschaftsdienst 116117.“
  Er steht dauerhaft und nicht wegklickbar über dem Eingabefeld; 112 und 116117 sind anrufbar.
- Anhänge nur aus der Kamera der App, nie aus der Mediathek; kein Herunterladen.
- Keine neuen Funktionen außer dem Zeichen am Reiter (Bildschirm 7); die Person der Praxis nur als
  Variante „wenn vorhanden“.
- Nur synthetische Daten.
- „Bewegung reduzieren“: nur Farbe.

## Gewünschtes Ergebnis

1. Entwürfe bei **375 px** und **1280 px** für die Bildschirme oben, je mit normal, leer, laden,
   Fehler, ohne Netz; „Sehr groß“ und 200 % für Liste und Schreiben; offene Tastatur beim Schreiben.
2. Zwei Varianten für „Schreiben“ (geführt in zwei Schritten / eine Seite), mit Empfehlung.
3. Übergabe für Claude Code im Format der bisherigen Handoffs (Markdown): 0 Entscheidungen · 1
   Geltung · 2 Tokens · 3 Bausteine · 4 Layout und Responsive · 5 Bildschirme mit Maßen und Texten
   (neue Texte _neu_) · 6 Barrierefreiheit · 7 Bewegung · 8 Prüfung · 9 Reihenfolge der Umsetzung
   (je Schritt ein Pull Request) · 10 Beim Bauen nachzutragen.
