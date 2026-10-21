# Briefing 7 – Ich und Datenschutz

Für Claude Design. Hebel 7 von 7. Quelle: Design-Review Lauf 1 vom 21.10.2026 (Befunde DR-150 bis
DR-153, dazu DR-104, DR-105, DR-119, DR-157 bis DR-159). Baut auf der Plattform-Sprache aus Briefing
1 auf; liegt deren Ergebnis nicht vor, gelten die Leitplanken unten.

## Kontext

Own Motion ist eine private Physiotherapiepraxis in Tübingen (Eröffnung Juli 2027); jede Behandlung
ist ein Hausbesuch per Lastenrad. Zur Praxissoftware gehört eine Web-App für Patient:innen und
Trainingskund:innen, die „Plattform“: am eigenen Telefon (375 px zuerst), auch am Rechner, für
Menschen bis 78 Jahre, Anrede „Sie“. Die Plattform verarbeitet Gesundheitsdaten; Vertrauen in den
Umgang mit Daten ist Teil des Produkts.

„Ich“ (oben rechts) sammelt, was man selten braucht: je Bereich (Behandlung, Training) Rechnungen,
Dokumente, Antworten aus dem Check-in, Gewohnheiten, Ernährung, Abo bzw. Paket und Vertrag,
**Einwilligungen** (erteilen und widerrufen, nichts ist Pflicht für die Behandlung), **Meine Daten
herunterladen**; dazu „Wer für Sie Zugang hat“ (Begleitpersonen, rechtliche Vertretung – eine
Begleitung kann die Person selbst beenden) und das Konto: angemeldet als, **Einstellungen**
(Schriftgröße für dieses Gerät, Benachrichtigungen je Bereich mit Ruhezeit, Passkey und PIN),
Abmelden, „Überall abmelden“ (etwa bei verlorenem Telefon). Begleitpersonen sehen eine schmalere
Fassung.

## Ziel

„Ich“ soll sich anfühlen wie ein aufgeräumtes Profil bei Apple Health oder Doctolib: oben wer ich
bin und bei welcher Praxis, darunter wenige Gruppen nach Zweck, Datenschutz als ruhiger, eigener Ort.
Heute sind es 13 gleichförmige Zeilen ohne Symbol und Pfeil, „Abmelden“ ist der einzige Hauptknopf,
die Einstellungen sprechen in Regeln, und im Kleingedruckten steht ein „Kennwort“, das es nicht
gibt.

## Ist-Zustand (Bilder zum Hochladen, Ordner `fuer-claude-design/07-ich-datenschutz/`)

| Datei                           | Was zu sehen ist                                                                                                     |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `01-ich-375.png`                | „Ich“: „Zugang von Test Praxis Tuebingen“, Blöcke „Behandlung“ und „Training“ mit je 6–7 Zeilen, Konto, „Abmelden“.  |
| `02-einstellungen-375.png`      | Einstellungen: Schriftgröße als Radios, Benachrichtigungen mit Erklärsatz und Aufklappern, „Passkey und PIN“.        |
| `03-einwilligungen-375.png`     | Einwilligungen: Text je Einwilligung, „✓ Erteilt am …“ mit „Widerrufen“, „Noch nicht entschieden“ mit „Einwilligen“. |
| `04-datenexport-375.png`        | Meine Daten: was enthalten ist, „Daten zusammenstellen“.                                                             |
| `05-ich-begleitung-375.png`     | „Ich“ einer Begleitperson.                                                                                           |
| `06-handeln-fuer-375.png`       | Übersicht einer Begleitperson mit dem Balken „Sie handeln für Max Mustermann · Begleitung“.                          |
| `07-zugang-beendet-375.png`     | Nach der Lesefrist: nur noch Einwilligungen, „Meine Daten“ bei der Praxis, Konto.                                    |
| `08-schrift-sehr-gross-375.png` | Mit Schriftgröße „Sehr groß“: Reiter „Nachrichten“ abgeschnitten.                                                    |
| `09-ich-1280.png`               | „Ich“ am Rechner.                                                                                                    |

Was trägt: Einwilligen und Widerrufen gleichwertig (kein Drängen), der klare Balken „Sie handeln für
…“, „Überall abmelden“ mit Rückfrage, die Schriftgröße für das eigene Gerät.

## Probleme nach Schwere

**S2:**

- „Abmelden“ ist der einzige Hauptknopf der Seite (DR-150).
- 13 gleichförmige Zeilen in zwei Bereichsblöcken, ohne Symbol und Pfeil, kein Profilkopf (DR-151);
  „Ich“ als Silhouette, kein Name (DR-119).
- „Kennwort“ und „Mein Konto“ in Texten, obwohl es auf der Plattform weder Kennwort noch „Mein
  Konto“ gibt (DR-104, DR-105); „Ihre Therapeut:in“, wo ein Name bekannt wäre (DR-159).
- Uneinheitliche Muster: eigene Radiogruppen statt der vorhandenen Wahlreihe, Bestätigungen auf
  verschiedenen Wegen (DR-157).

**S3:**

- Einstellungen: Schriftgröße ohne Vorschau; Versal-Überschrift mit Trennstrich („EINGE-STELLT“);
  Hinweis „Die Praxis spricht Sie mit „Sie“ an.“; drei Hauptknöpfe (DR-152).
- „Die Datei ist im Format JSON.“ (DR-153); Überschriftenfolge auf zwei Seiten (DR-158).

## Referenzmuster

- **Doctolib, Einwilligungen** (Hilfe, beschrieben): „Das Wichtigste auf einen Blick“, welche Daten,
  Ablehnen gleichwertig, nach dem Speichern der Zustand. Nicht: Wiedervorlage nach Ablehnung.
- **Apple Health, Teilen und Export** (Hilfe, beschrieben): Teilen als sichtbarer, umkehrbarer
  Schalter mit Liste; Export für Menschen (PDF) und für Maschinen (Datei). Nicht: Teilen mit
  Kontakten.
- **How We Feel** (App Store, gesehen): das Datenschutzversprechen als ruhiger, eigener Bildschirm.
- **NHS App** (Barrierefreiheitserklärung, beschrieben): 200 % Zoom als Prüfmaßstab; Systemschrift
  respektieren.
- **MyChart / NHS login** (beschrieben): Passkeys als Geräteliste im Konto, in Gerätewörtern.

## Bildschirme und Zustände

1. **Ich:** Profilkopf (Initialen und Name „wenn vorhanden“, sonst E-Mail; Praxis), Gruppen nach
   Zweck – Unterlagen (Rechnungen, Dokumente), Meine Angaben (Check-in, Gewohnheiten, Ernährung),
   Verträge (Abo, Paket, Vertrag), Datenschutz (Einwilligungen, Meine Daten, wer Zugang hat), Konto
   (Einstellungen, Abmelden leise am Ende, „Überall abmelden“ mit Rückfrage) – je Zeile ein Symbol.
   Bereich Behandlung | Training als Wahl statt doppelter Liste. Fassungen: Begleitperson,
   Lesefrist läuft, Zugang beendet.
2. **Einstellungen:** Schriftgröße mit Vorschau („Aa“ und ein Beispielsatz), Benachrichtigungen je
   Art als Schalter mit Ruhezeit auf Abruf, Mitteilungen auf diesem Gerät (geht/geht nicht), Passkey
   und PIN als Zeile mit Zustand (Geräteliste, PIN ändern), was die Praxis eingestellt hat.
3. **Einwilligungen:** je Einwilligung Zweck in einem Satz, Details auf Abruf, Zustand (erteilt am …,
   nicht entschieden, widerrufen am …), Einwilligen und Widerrufen gleichwertig mit Rückfrage;
   Hinweis zur Freiwilligkeit.
4. **Meine Daten:** was enthalten ist, „Daten zusammenstellen“, Fortschritt, Datei bereit; was die
   Praxis zusätzlich auf Anfrage herausgibt.
5. **Wer für Sie Zugang hat:** Begleitpersonen und rechtliche Vertretung, Zustand (eingeladen,
   aktiv, gesperrt), Begleitung beenden mit Rückfrage.
6. **Rechner (1280 px):** Profil links, Inhalt rechts.

## Feste Grenzen

**Marke** (unverändert): Wortmarke „OWN / MOTION“ nur als gelieferte Datei – nicht umfärben, drehen,
dehnen, keine Kontur, kein Schatten, kein Piktogramm und kein Rad daneben; Schutzraum die Höhe der
MOTION-Zeile; Mindesthöhe 24 px. Farben: Hauptfarbe #004429, Tiefgrün #042c1b, Papier #f6f7f4.

**Werte der App:** Fläche #ffffff, Vertiefung #f4f5f7, Tinte #14181b, Leise #5a6169, Linie #e6e8eb,
Linie stark #767c84, Hauptfarbe #004429, Salbei hell #e1f0e4, Warnung #5a4300 auf #f3ead6, Fehler
#7a2418 auf #f4e3e0. Schrift Hanken Grotesk. Radien: Knopf und Feld 10, Karte 14, Bild 16, Pille
rund. Knopf 48 px, kompakt 44. Rhythmus 4/8/12/16/24/32 px.

**Darf auf der Plattform abweichen:** mehr Weißraum (40/48 px), eine Schattenstufe, Markenfläche
Tiefgrün, eigene Schriftskala ab 18 px, ruhige Bewegung. Nicht: neue Farbfamilie, Dunkelmodus
(auch nicht als Einstellung), zweite Fassung der Marke.

**Bausteine** (Werte dürfen sich ändern, nicht die Rolle): Seitenkopf, Abschnitt, Liste aus ganzen
Zeilen, Knopf, Symbolknopf, Schalter, Wahlreihe, Segment, Statuszeichen (Zeichen + Wort),
Rückmeldung, Rückfrage, Fenster, Formularfuß, Laden/Fehler/Leer, Kleingedrucktes, Aufklapper.

**Nicht verhandelbar:**

- 375 px zuerst, dann 1280 px; Ziele ≥ 44 px; 200 % Zoom (188 px) und „Sehr groß“ ohne Verlust.
- Kontrast ≥ 4,5:1 für Text, ≥ 3:1 für Linien; Farbe nie allein; sichtbarer Fokus.
- **Einwilligungen:** nichts vorausgewählt, Ablehnen und Widerrufen so leicht wie Einwilligen, kein
  Drängen, kein Hinweis „empfohlen“; Widerruf wirkt ab dann.
- Abmelden und „Überall abmelden“ bleiben; Zerstörendes leise am Ende mit Rückfrage.
- Keine neuen Funktionen (kein Dunkelmodus, kein Profilfoto-Hochladen); Name der Person nur als
  Variante „wenn vorhanden“.
- Sprache: „Sie“; kein „Kennwort“ (es gibt keins), kein „Mein Konto“, kein „Sitzung“; Technikwörter
  (JSON, Passkey) nur hinter einer verständlichen Beschreibung.
- Nur synthetische Daten (erika.beispiel@…, Max Mustermann, Paula als Begleitung).
- „Bewegung reduzieren“: nur Farbe.

## Gewünschtes Ergebnis

1. Entwürfe bei **375 px** und **1280 px** für die Bildschirme oben, je mit normal, leer, laden,
   Fehler, ohne Netz; „Sehr groß“ und 200 % für „Ich“ und die Einstellungen; lange Namen.
2. Zwei Varianten für die Gliederung von „Ich“ (nach Zweck / nach Bereich), mit Empfehlung.
3. Übergabe für Claude Code im Format der bisherigen Handoffs (Markdown): 0 Entscheidungen · 1
   Geltung · 2 Tokens · 3 Bausteine · 4 Layout und Responsive · 5 Bildschirme mit Maßen und Texten
   (neue Texte _neu_) · 6 Barrierefreiheit · 7 Bewegung · 8 Prüfung · 9 Reihenfolge der Umsetzung
   (je Schritt ein Pull Request) · 10 Beim Bauen nachzutragen.
