# Briefing 6 – Unterlagen und Verträge

Für Claude Design. Hebel 6 von 7. Quelle: Design-Review Lauf 1 vom 21.10.2026 (Befunde DR-147 bis
DR-149, DR-162, dazu DR-143). Baut auf der Plattform-Sprache aus Briefing 1 auf; liegt deren
Ergebnis nicht vor, gelten die Leitplanken unten.

## Kontext

Own Motion ist eine private Physiotherapiepraxis in Tübingen (Eröffnung Juli 2027); jede Behandlung
ist ein Hausbesuch per Lastenrad. Abgerechnet wird privat: Die Rechnung geht an die Person selbst
oder an jemand anderen (etwa die Beihilfestelle, Eltern), bezahlt wird per Überweisung. Zur
Praxissoftware gehört eine Web-App für Patient:innen und Trainingskund:innen, die „Plattform“: am
eigenen Telefon (375 px zuerst), auch am Rechner, für Menschen bis 78 Jahre, Anrede „Sie“.

Unter „Ich“ liegen die Unterlagen: **Rechnungen** (erscheinen von selbst, sobald gestellt),
**Dokumente** (nur einzeln von der Praxis freigegeben), das **Nachsorge-Abo** (monatlich kündbar,
ohne Rückhaltedialog; danach 30 Tage lesend), das **Angebot** „Training nach Ihrer Behandlung“ aus
dem Abschlussgespräch (Vertrag im eigenen Konto mit Widerrufsbelehrung, Freigaben aus der
Behandlung und eigener Einwilligung), der **Trainingsvertrag** (Widerruf in der Frist) und das
**Trainingspaket** mit Preisen (nicht pausierbar, nicht vorzeitig kündbar).

## Ziel

Geld und Verträge sollen sich anfühlen wie bei ottonova oder in der Oura-Mitgliedschaft: Der Betrag
und der nächste Schritt stehen oben, Rechtliches ist vollständig, aber geordnet. Heute sind die
Seiten ehrlich und vollständig, wirken aber wie Einstellungsseiten; die Rechnung hebt den Betrag
nicht hervor, und der Vertragsabschluss ist eine einzige Seite von 4 374 px.

## Ist-Zustand (Bilder zum Hochladen, Ordner `fuer-claude-design/06-unterlagen-vertraege/`)

| Datei                        | Was zu sehen ist                                                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `01-rechnungen-375.png`      | Rechnungen: Datum, Nummer und Betrag, Empfänger, fällig am, Abzeichen „! offen“ bzw. „✓ bezahlt“.                      |
| `02-rechnung-375.png`        | Eine Rechnung: Nummer als Titel, „! offen“, Von/An/Datum, Positionen, Gesamtbetrag, Diagnose, Bankverbindung, Drucken. |
| `03-dokumente-375.png`       | Freigegebene Dokumente.                                                                                                |
| `04-abo-375.png`             | Nachsorge-Abo: „Läuft seit …“, nächste Monatsrechnung, „Abo kündigen“.                                                 |
| `05-angebot-375.png`         | Angebot „Training nach Ihrer Behandlung“ als eine lange Seite bis „Zahlungspflichtig buchen“.                          |
| `06-preise-375.png`          | Pakete und Preise als Textzeilen, Bedingungen als Aufzählung.                                                          |
| `07-vertrag-375.png`         | Trainingsvertrag einer Trainingskundin.                                                                                |
| `08-paket-375.png`           | Trainingspaket einer Trainingskundin.                                                                                  |
| `09-rechnungen-leer-375.png` | Leerzustand: „Es liegt noch keine Rechnung vor.“                                                                       |

Was trägt: Kündigen ohne Umweg und ohne Rückhaltedialog, die vollständige Widerrufsbelehrung, die
Umsatzsteuer am Preis, „Zahlungspflichtig buchen“ als eindeutiger Knopftext, freiwillige
Freigaben einzeln ankreuzbar.

## Probleme nach Schwere

**S2:**

- Rechnung als Detailliste: Der Betrag ist nicht herausgehoben, „! offen“ steht schon vor der
  Fälligkeit im Warnton, der Positionsbetrag steht über der Menge (DR-147).
- Vertragsabschluss als eine Seite von 4 374 px: Paket, Freigaben, Einwilligung, Widerrufsbelehrung
  und „Zahlungspflichtig buchen“ untereinander (DR-162).

**S3:**

- Abo und Paket wirken wie Einstellungsseiten (DR-148).
- Leerzustände als Satz in einer Karte (DR-143).
- Rückweg „← Zu „Ich““ mit Anführungszeichen (DR-149).

## Referenzmuster

- **ottonova** (App Store, gesehen): Dokumente nach Datum, Papier-Miniatur, Zustand als Pille
  („Bezahlt“). → Rechnung als Dokument mit eindeutigem Zustand. Nicht: Erstattungslogik.
- **Oura, Mitgliedschaft** (Hilfe, beschrieben): Plan, nächstes Zahlungsdatum, Verlauf, Kündigen;
  danach Zugang bis Periodenende, Daten bleiben. → Nachsorge-Abo auf einer Seite, „Was passiert mit
  meinen Daten?“ direkt beantwortet.
- **Eversports** (Hilfe, beschrieben): Pässe und Mitgliedschaften in einer Liste, Kündigen und
  Widerruf als eigene Wege, Bestätigung mit Enddatum. → Paket und Vertrag.
- **One Medical / MyChart** (App Store, gesehen): Kosten am Entscheidungspunkt, Prüfschritt mit
  Betrag vor dem Absenden. → Zusammenfassung vor „Zahlungspflichtig buchen“.

## Bildschirme und Zustände

1. **Rechnungen:** Liste mit Betrag, Empfänger („an Beihilfestelle Tübingen“), fällig am und
   Zustand (offen ohne Warnton, überfällig mit Warnzeichen und Wort, bezahlt, storniert). Zustände:
   keine Rechnung, laden, Fehler, ohne Netz; Bereichsschalter Behandlung | Training.
2. **Eine Rechnung:** Betrag groß mit „fällig am“, Zahlungsangaben als Karte (IBAN, Verwendungszweck
   kopieren), Positionen, Steuerhinweis, Behandlungsgrundlage, „Drucken oder als PDF sichern“;
   bezahlt, überfällig, storniert.
3. **Dokumente:** Liste freigegebener Dokumente mit Art und Datum, Öffnen ohne Herunterladen; leer.
4. **Nachsorge-Abo:** läuft, beginnt am …, gekündigt („endet am …“), beendet; Kündigen leise am
   Ende mit Bestätigung; was nach dem Ende bleibt.
5. **Angebot → Vertrag** (geführt): Paket und Preis, Freigaben aus der Behandlung, Einwilligung zu
   Gesundheitsangaben im Training, Widerrufsbelehrung (vollständig, lesbar, mit Muster-Formular),
   Zusammenfassung mit Betrag, „Zahlungspflichtig buchen“, Bestätigung. Zustände: Angebot gilt bis …,
   früher Beginn, Wartezeit, abgelaufen.
6. **Trainingsvertrag und Paket:** gebucht am, läuft bis, Widerruf bis … (eigener Weg), Pakete und
   Preise zum Vergleich.
7. **Rechner (1280 px):** Rechnung als Blatt rechts neben der Liste.

## Feste Grenzen

**Marke** (unverändert): Wortmarke „OWN / MOTION“ nur als gelieferte Datei – nicht umfärben, drehen,
dehnen, keine Kontur, kein Schatten, kein Piktogramm und kein Rad daneben; Schutzraum die Höhe der
MOTION-Zeile; Mindesthöhe 24 px. Farben: Hauptfarbe #004429, Tiefgrün #042c1b, Papier #f6f7f4; auf
Rechnung und Druck die schwarze Fassung.

**Werte der App:** Fläche #ffffff, Vertiefung #f4f5f7, Tinte #14181b, Leise #5a6169, Linie #e6e8eb,
Linie stark #767c84, Hauptfarbe #004429, Salbei hell #e1f0e4, Warnung #5a4300 auf #f3ead6, Fehler
#7a2418 auf #f4e3e0. Schrift Hanken Grotesk. Radien: Knopf und Feld 10, Karte 14, Bild 16, Pille
rund. Knopf 48 px, kompakt 44. Rhythmus 4/8/12/16/24/32 px. Beträge in Ziffern gleicher Breite.

**Darf auf der Plattform abweichen:** mehr Weißraum (40/48 px), eine Schattenstufe, Markenfläche
Tiefgrün, eigene Schriftskala ab 18 px, ruhige Bewegung. Nicht: neue Farbfamilie, Dunkelmodus,
zweite Fassung der Marke.

**Bausteine** (Werte dürfen sich ändern, nicht die Rolle): Seitenkopf, Abschnitt, Liste aus ganzen
Zeilen (mit Betrag), Datenliste für Positionen, Kachel, Knopf, Statuszeichen (Zeichen + Wort),
Rückmeldung, Rückfrage, geführter Ablauf, Formularfuß, Druckblatt, Laden/Fehler/Leer,
Kleingedrucktes, Aufklapper.

**Nicht verhandelbar:**

- 375 px zuerst, dann 1280 px; Ziele ≥ 44 px; 200 % Zoom (188 px) und „Sehr groß“ ohne Verlust.
- Kontrast ≥ 4,5:1 für Text, ≥ 3:1 für Linien; Farbe nie allein; sichtbarer Fokus.
- **Kündigen ohne Rückhaltedialog**, Widerruf als eigener Weg, Widerrufsbelehrung vollständig und
  vor dem Abschluss lesbar, Knopftext „Zahlungspflichtig buchen“ bleibt, Preise mit Umsatzsteuer.
- Keine neuen Funktionen (kein Bezahlen in der App, kein Lastschriftmandat); was es nicht gibt
  (Überweisungscode), höchstens als Variante „wenn vorhanden“.
- Keine Werbung, keine Rabattspiele, kein Druck („nur noch heute“).
- Sprache: „Sie“; Trainingskund:in, nie „Kunde“ allein, nie „PT“.
- Nur synthetische Daten (Beträge, Nummern, IBAN-Platzhalter wie DE02 1203 0000 0000 2020 51).
- „Bewegung reduzieren“: nur Farbe.

## Gewünschtes Ergebnis

1. Entwürfe bei **375 px** und **1280 px** für die Bildschirme oben, je mit normal, leer, laden,
   Fehler, ohne Netz; „Sehr groß“ und 200 % für Rechnung und Vertragsabschluss.
2. Für den Vertragsabschluss die Schrittfolge mit allen Seiten; für die Rechnung das Blatt im Druck.
3. Übergabe für Claude Code im Format der bisherigen Handoffs (Markdown): 0 Entscheidungen · 1
   Geltung · 2 Tokens · 3 Bausteine · 4 Layout und Responsive · 5 Bildschirme mit Maßen und Texten
   (neue Texte _neu_) · 6 Barrierefreiheit · 7 Bewegung · 8 Prüfung · 9 Reihenfolge der Umsetzung
   (je Schritt ein Pull Request) · 10 Beim Bauen nachzutragen.
