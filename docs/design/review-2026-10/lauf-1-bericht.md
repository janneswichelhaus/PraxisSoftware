# Design-Review Lauf 1 – Plattform für Patient:innen und Kund:innen

Stand 21.10.2026 · Grundlage `origin/main` 844f5255 (PR #286) · Branch `claude/design-review-lauf-1`.
Reine Analyse: kein Produktcode, keine Migration, kein Seed, kein Test geändert. Nummern DR-101 bis
DR-162; was Jannes übernimmt, trägt er selbst in `BEFUNDE.md` ein. Briefings für Claude Design:
[`lauf-1-briefings/`](lauf-1-briefings/), Reihenfolge der Umsetzung:
[`lauf-1-umsetzung.md`](lauf-1-umsetzung.md).

Umfang: alle Routen unter `/p/…`, Einladung, Anmeldung, Anmeldung einrichten, Sperre, Zugang
beendet und gesperrt, die Einsicht der Praxis nur am Rand. Drei Gruppen nach
[PLATTFORM-ANSICHTEN.md](../../development/PLATTFORM-ANSICHTEN.md): Behandlung (Stufe 1),
Nachsorge-Abo (Stufe 2), Trainingskund:in.

Grundlage der Befunde (Bilder unversioniert unter `PraxisSoftware\.tmp\design-review\lauf-1\`):

- **Bildstrecke:** 80 Bilder, alle 35 Routen der Bereiche Plattform und Anmeldung, je Konto (Erika:
  Behandlung und Training, Tina: Training, Paula: Begleitung für Max, Inhaber:in: Einsicht, ohne
  Anmeldung) bei 375 und 1280 px, Stack mit reichem Seed. Ordner `bildstrecke/`, Kontaktbogen
  `bildstrecke/index.html`.
- **Zusatzzustände:** rund 150 Bilder – Prüfseiten aus `tests/e2e/fixtures/` (Einladung mit Code,
  Einstieg Schritt 1 bis 4, Passkey und PIN, Sperre, ohne Netz, Abo, Paket, Rechnung, Check-in,
  Absage mit Ausfallhonorar), Laden und Fehler je Seite, Wechsel ohne Netz, Schrift „Groß“ und „Sehr
  groß“, 200 % Zoom (188 px), offene Tastatur (angenähert), lange Namen, Startbild in Einzelbildern.
  Ordner `zustaende/`.
- **Messung:** 80 Seiten im Browser vermessen – Kontrast jedes Textes gegen seinen tatsächlichen
  Grund, Größe jedes Tippziels, Schriftgrößen und -gewichte, Abstände gegen den Rhythmus,
  Hauptknöpfe, Überschriften, Bilder, Zeilenlänge, Fokusring per Tabulator, axe-core (WCAG 2.2 AA
  und Best Practice), Seitentitel. Ein Lesewächter hielt jede schreibende Anfrage an – angehalten
  wurde keine. Ordner `messung/`.
- **Code:** Durchsicht aller Plattformseiten gegen [DESIGN.md](../DESIGN.md) und `src/components/ui`.
- **Referenzen:** 16 Plattformen, nur öffentliche Seiten, Store-Bilder und Hilfe-Center.

Bildangaben in den Tabellen: `B:` = `bildstrecke/`, `Z:` = `zustaende/`, `M:` = `messung/`.

## Kurzfassung

Die Plattform ist fachlich weit und technisch sauber – kein Kontrastfehler, Fokusring überall, axe
fast ohne Befund, kein Querscrollen –, aber sie sieht aus wie ein gut gemachtes Formular, nicht wie
ein Produkt, dem man seine Gesundheit anvertraut. Neben Doctolib, Oura und Headspace verliert sie am
ersten Bildschirm: Die Einladung begrüßt nicht, die Einrichtung spricht Technik, der Einstieg
erklärt die Bedienung, und die Übersicht hat keine Hauptsache. Auf 80 Seiten steht kein einziges
Bild außer der Wortmarke, 96 % aller Texte sind exakt 18 px, und die Therapeutin, die mit dem
Lastenrad nach Hause kommt – das stärkste Vertrauenssignal der Praxis –, kommt nur als Textzeile
vor. Die fünf größten Hebel:

1. **Eine Plattform-Sprache** mit eigener Bildwelt, mehr Raum, einer Tiefenstufe, eigener
   Schriftskala ohne Versalien und ruhiger Bewegung – gleiche Marke, gleiche Bausteine (Briefing 1,
   Abschnitt „Plattform“ unten).
2. **Ein durchgehender Willkommensweg** von der Einladung über Gesicht oder Finger und den Einstieg
   bis zu einer Übersicht mit genau einer Hauptsache (Briefing 1).
3. **Menschen zeigen:** nächster Besuch mit Person, Antworten von einer Person, Gruß mit Namen –
   teils Gestaltung, teils Daten (Nebenbei N1 bis N3).
4. **Barrierefreiheit des Gerüsts reparieren:** Türseiten unter 18 px, Silbentrennung in Namen,
   Tab-Titel und Reiterleiste bei offener Tastatur sofort und ohne Entwurf (Umsetzung, Schritt 0);
   die Reiterleiste bei 200 % und großer Schrift mit Briefing 1.
5. **Zustände und Bewegung als Bausteine:** Skelett statt Satz, Verbindungsanzeige, Druckzustand,
   Startbild mit eigenem Landeplatz – und als Erstes die falsche Bestätigung, die beim Reiterwechsel
   „Ihr Wunsch ist bei der Praxis angekommen“ zeigt (DR-160).

Anfangen in Claude Design mit Briefing 1 („Erster Eindruck und Plattform-Sprache“).

## Ampel je Bereich

| Bereich                                                         | Ampel | Ein Satz                                                                                                       |
| --------------------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------- |
| Türseiten: Einladung, Anmeldung, Einrichten, Sperre             | rot   | Erster Bildschirm ohne Begrüßung, Technikwörter, unter 18 px – genau hier entscheidet sich das Vertrauen.      |
| Einstieg (erste Nutzung)                                        | rot   | Vier Textseiten, die die Oberfläche erklären, mit zwei Knopfebenen und ohne Abschluss-Moment.                  |
| Gerüst: Kopf, Reiterleiste, Rechner, Startbild                  | rot   | Reiterleiste bricht bei 200 % und großer Schrift; am Rechner ein gestrecktes Telefon; Startbild landet falsch. |
| Übersicht                                                       | rot   | Gleichförmige Liste ohne Hauptsache, ohne Namen, mit Notfallsatz auf jeder Startseite.                         |
| Übungen (Plan, Einheit, Blatt)                                  | gelb  | Klar und einhändig bedienbar, aber ohne Bild, Dauer und Vorfreude; Übungstage ohne erkennbaren Zustand.        |
| Termine (Liste, Wunsch, Ändern, Absagen)                        | gelb  | Geführte Abläufe gut; Liste ohne Gesicht und Art, getrennte Namen, Sackgasse am vergangenen Termin.            |
| Nachrichten                                                     | gelb  | Strukturiert wie gewollt; Notfallkasten dreimal, Zustände kryptisch, Verlauf ohne Gesicht.                     |
| Selbstauskunft: Befundbogen, Check-in, Angaben, Gewohnheiten    | gelb  | Körperbild und Skalen tragen; Fachtitel, lange Schritte, Skala bricht 6 + 5, Leerzustände ohne Perspektive.    |
| Ernährung: Tagebuch, Lebensmittel                               | gelb  | Funktional vollständig, wirkt wie eine Tabelle aus Kästen.                                                     |
| Unterlagen und Verträge: Rechnungen, Dokumente, Abo, Paket      | gelb  | Ehrlich und vollständig, aber wie Einstellungsseiten; Betrag und nächster Schritt nicht herausgehoben.         |
| Ich und Datenschutz: Ich, Einstellungen, Einwilligungen, Export | gelb  | 13 gleichförmige Zeilen, „Abmelden“ als Hauptknopf, Einstellungen mit Regeltexten.                             |
| Begleitung und Einsicht der Praxis                              | grün  | „Sie handeln für …“ ist klar und dauerhaft sichtbar; Einsicht der Praxis gehört zu Lauf 2.                     |

## Drei Gruppen

**Behandlung (Stufe 1).** Am vollständigsten gebaut: Befundbogen, Termine mit Wunsch und Absage,
Übungen mit Durchführung, Check-in, Nachrichten, Rechnungen, Einwilligungen. Was fehlt, ist der
Eindruck: Die Patientin sieht nie, wer kommt, und die Übersicht sagt nicht, was jetzt das Wichtigste
ist. Für sie gelten alle Hebel oben.

**Nachsorge-Abo (Stufe 2).** Gestalterisch gibt es die Stufe nur als Abo-Seite unter „Ich“ und als
Lesefrist-Hinweis; der Reiter „Verlauf“ aus DSN-001 fehlt noch (laut Register kommen Verlauf,
Rückfragen mit Medien und Plan als PDF mit ihren Loops). Wer monatlich zahlt, sieht keinen
Unterschied zur kostenlosen Stufe. Gestaltungsauftrag: Das Abo braucht einen sichtbaren Mehrwert auf
der Übersicht (Gewohnheiten des Tages, Antwortfrist) – ohne Serie und ohne Druck (Briefing 1 und 4).

**Trainingskund:in.** Eigener Reiter „Training“, Paket und Vertrag, Ernährungstagebuch als
Zusatzleistung. Die Übersicht ist fast leer (Gruß, ein Termin, Notfallsatz); Paketstand und
nächste Einheit stehen nur unter „Ich“. Hier wirkt das Fehlen einer Hauptsache am stärksten
(DR-124).

## Systemische Muster

Was an vielen Stellen gleich ist, steht hier einmal; die Befunde unten sind die Belege.

1. **Formular statt Produkt.** Jede Seite ist `PageHeader` → Versal-Etikett → umrahmte Karte mit
   Zeilen. Kein Inhaltsbild auf 80 Seiten (gemessen: je Seite genau ein Bild, die Wortmarke), keine
   Markenfläche, keine Hero-Fläche, Leerzustände als Satz in einer Karte. Belege: DR-101, DR-108,
   DR-121, DR-127, DR-132, DR-143, DR-145, DR-148, DR-151, DR-155.
2. **Kein Mensch.** Die behandelnde Person steht nur als Text im Termin („Anna Beispiel kommt zu
   Ihnen“), sonst „Ihre Therapeut:in“ und Antworten „von Praxis“; Gruß ohne Namen, „Ich“ als
   Silhouette. Die Projektion liefert weder den eigenen Namen noch ein Bild oder eine Rufnummer –
   teils Gestaltung, teils Daten (Nebenbei N1 bis N3). Belege: DR-119, DR-122, DR-132, DR-139,
   DR-159.
3. **Eine Schriftgröße, Versalien, Trennstriche.** `.plattform-schrift` hebt alle kleinen Rollen auf
   18 px – richtig für die Lesbarkeit, aber ohne Ersatz für die Hierarchie: 1 044 von 1 089
   Textelementen sind 18 px, Abschnittstitel 18/600 in Versalien, nur der Seitentitel ist größer.
   Dazu trennt `hyphens: auto` Namen, Orte und kurze Wörter. Belege: DR-114, DR-131, DR-152,
   DR-154.
4. **Erklären statt sprechen.** Die Plattform erklärt ihre Bedienung („Unten finden Sie …“), nennt
   Technik („Passkey“, „öffentlicher Schlüssel“, „Sitzung“, „JSON“), Fachtitel („Anamnesebogen
   Version 8 (DIGOTOR)“) und widerspricht sich („Kennwort“). Belege: DR-103 bis DR-106, DR-108,
   DR-111, DR-125, DR-138, DR-153; die Liste von 25 Stellen steht im Code-Anhang.
5. **Türseiten gehören nicht zur Plattform.** Einladung, Anmeldung, Einrichten und Sperre stehen in
   der Hülle der Praxis-App: 14 px, linksbündig oder mittig, kein Willkommen. Belege: DR-101 bis
   DR-107.
6. **Der Rechner ist nicht gestaltet.** 576-px-Spalte mit Reiterleiste unten auf allen Breiten.
   Beleg: DR-113.
7. **Zustände sind Sätze – und einmal falsch.** Laden als Satz, kein Skelett (die Ladekacheln der
   Bausteine werden auf der Plattform nie genutzt), keine Verbindungsanzeige, Fehler teils
   verschluckt; eine Bestätigung wandert über die Reiterleiste auf eine fremde Seite. Belege:
   DR-118, DR-126, DR-136, DR-143, DR-160.
8. **Bewegung fehlt – oder läuft falsch.** Kein Druckzustand im ganzen System, Reiterwechsel ohne
   Übergang, Startbild ohne Landeplatz. Belege: DR-116, DR-117.
9. **Die Reiterleiste ist der Engpass der Barrierefreiheit.** 200 %, „Sehr groß“ und offene
   Tastatur scheitern an derselben festen Leiste. Belege: DR-112, DR-120.
10. **Eine Aufgabe, viele Lösungen.** Sechs Wege, ein Absenden zu bestätigen, nachgebaute Zeilen und
    Überschriften neben den Bausteinen, drei Wörter für „senden“. Belege: DR-109, DR-137, DR-140,
    DR-150, DR-157.

**Was trägt und bleiben soll:** die Palette (kein einziger Kontrastfehler gemessen), der sichtbare
Fokusring, die geführten Abläufe für Wunsch, Ändern und Absage (Kopf mit Termin und ✕, „Schritt 2
von 3“, Ausfallhonorar als eigener Schritt), das Körperbild im Befundbogen, die großen
Durchgangs-Zeilen der Übungseinheit, der Balken „Sie handeln für …“ und die konsequente Freiheit von
Serien, Punkten und Lob.

## Befundtabelle

Kategorie nach Prüfraster (1 Vertrauen · 2 Hierarchie · 3 Typografie · 4 Raum · 5 Farbe · 6
Konsistenz · 7 Zustände · 8 Bewegung · 9 Text · 10 Telefon · 11 Barrierefreiheit · 12 Wege).
Schwere S1 verhindert Vertrauen oder Nutzung, S2 deutlich unter Premium, S3 Feinschliff. Art (a)
Politur innerhalb DESIGN.md, (b) braucht einen Entwurf, (c) braucht eine Änderung an DESIGN.md.
Spalte „Route“: Route · Breite · Konto.

### Türseiten

| Nr     | Route                                                          | Kat. | S   | Aufwand | Art | Beobachtung                                                                                                                                                                                                          | Vorschlag                                                                                                                                                                                   | Bild                                                          |
| ------ | -------------------------------------------------------------- | ---- | --- | ------- | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| DR-101 | `/einladung#code=…` (Prüfseite) · 375, 1280 · ohne             | 1    | S1  | mittel  | b   | Erster Bildschirm nach dem QR-Code: Wortmarke, „Ihr Zugang“, ein 14-px-Satz über Passkey, PIN und Kennwort, ein Feld. Kein Willkommen, kein Absender, kein Wozu, keine Vorschau der Schritte.                        | Tür als Begrüßung: Markenfläche (Tiefgrün oder Foto), „Willkommen bei Own Motion“, ein Satz wozu, Vorschau „3 Schritte · etwa 2 Minuten“ (E-Mail, Gesicht oder Finger, PIN), Weg zur Hilfe. | `Z: pruef-einladung-mit-code-375.png`                         |
| DR-102 | `/`, `/einladung`, `/zugang`, Einrichten, Sperre · 375 · ohne  | 11   | S1  | klein   | a   | Türseiten liegen außerhalb von `.plattform-schrift`: gemessen 10 (Anmeldung), 4 (Einladung), 3 (Zugangslink), 7 (Passkey), 13 (PIN), 4 (Sperre) Texte unter 18 px; „Groß/Sehr groß“ wirkt dort nicht.                | `Vollseite` in einer Plattform-Fassung: 18 px und Schriftgröße des Geräts auf allen Türen, die Patient:innen sehen; die gemeinsame Anmeldeseite für alle 18 px.                             | `Z: pruef-einrichten-pin-375.png`                             |
| DR-103 | Anmeldung einrichten (Prüfseite `anmeldung.html`) · 375 · ohne | 9    | S1  | mittel  | b   | Passkey-Schritt in Technikwörtern: „Passkey“, „öffentlicher Schlüssel“, „nicht umkehrbare Prüfsumme“, „1. PASSKEY“ als winziges Versal-Etikett; kein Bild des Gerätedialogs. Wahrscheinlichste Abbruchstelle mit 78. | Titel in Gerätesprache („Mit Gesicht oder Fingerabdruck anmelden“), schematisches Bild des Systemdialogs, ein Satz Sicherheit, Technik auf Abruf; PIN als zweiter Schritt mit Fortschritt.  | `Z: pruef-einrichten-passkey-375.png`                         |
| DR-104 | QR der Praxis (Prüfseite `seite=qr`), `/p/ich` · 375           | 9    | S2  | klein   | a   | Widerspruch: QR-Text „Dort entstehen Adresse und Kennwort“, Kleingedrucktes unter „Ich“ „Adresse und Kennwort nicht weitergeben“ – die Einladung sagt „ein Kennwort gibt es nicht“.                                  | Wortlaut angleichen („Dort richtet die Person ihren Zugang mit Gesicht oder Finger ein“; „Geben Sie Ihr entsperrtes Telefon nicht weiter“).                                                 | `Z: pruef-praxis-qr-einladung-375.png`                        |
| DR-105 | Einrichten, Passkey-Sätze · alle · ohne                        | 6    | S2  | klein   | a   | Patient:innen werden auf „Mein Konto“ verwiesen; auf der Plattform heißt der Ort „Ich → Einstellungen → Passkey und PIN“.                                                                                            | Ziel je Oberfläche benennen.                                                                                                                                                                | `Z: pruef-einrichten-passkey-375.png`                         |
| DR-106 | `/p…` beim Öffnen (Laden, Fehler) · 375 · Erika                | 9    | S2  | klein   | a   | „Sitzung wird geprüft …“, „Sitzung nicht geprüft“ – Fachwort; Marke links, Satz mittig.                                                                                                                              | „Einen Moment …“ bzw. „Keine Verbindung – bitte erneut versuchen“; Marke und Satz auf einer Achse, ruhige Markenbewegung statt Satz.                                                        | `Z: laden-uebersicht-375.png`, `Z: fehler-uebersicht-375.png` |
| DR-107 | Anmeldung, Einladung, Einrichten · 375                         | 4    | S3  | klein   | a   | Drei Türseiten, drei Ausrichtungen: Anmeldung mittig, Einladung und Einrichten linksbündig, Ladezustand gemischt.                                                                                                    | Eine Ausrichtung für alle Türen (Marke und Titel mittig, Felder linksbündig wie bei der Anmeldung).                                                                                         | `M: blick/anmeldemaske__ohne__375.png`                        |

### Einstieg

| Nr     | Route                                       | Kat. | S   | Aufwand | Art | Beobachtung                                                                                                                                                                                                                                                 | Vorschlag                                                                                                                                    | Bild                                                                 |
| ------ | ------------------------------------------- | ---- | --- | ------- | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| DR-108 | `/p` beim ersten Besuch · 375, 1280 · Erika | 1    | S1  | mittel  | b   | Vier Textschritte: „Unten finden Sie Übersicht und Termine …“ (Gebrauchsanweisung, dazu ungenau – es sind vier Reiter), „Dieser Zugang gilt für: Behandlung.“, Schritt 4 „Fertig“ mit einem Satz. Kein Gesicht, kein Bild, kein Ankommen, kein „Was jetzt“. | Willkommen mit dem Gesicht der Praxis, ein Satz wozu; Abschluss zeigt den nächsten Schritt (nächster Besuch oder Fragebogen) als Hauptknopf. | `B: plattform--p--plattform--375.png`, `Z: pruef-einstieg-4-375.png` |
| DR-109 | Einstieg Schritt 2 und 3 · 375 · Erika      | 2    | S2  | mittel  | b   | Zwei Knopfebenen: je Einwilligung „Einwilligen/Widerrufen“ plus „Weiter/Später“; in Schritt 3 „Speichern“ und „Weiter“ beide gefüllt. Gemessen auf `/p/einstellungen`: drei Hauptknöpfe.                                                                    | Je Schritt eine Entscheidung und ein Hauptknopf; Wahl als Schalter im Schritt, gespeichert wird mit „Weiter“.                                | `Z: pruef-einstieg-2-375-voll.png`, `Z: pruef-einstieg-3-375.png`    |
| DR-110 | Einstieg · 375 · Erika                      | 12   | S2  | mittel  | b   | Reiterleiste und Bereichsschalter stehen während des Einstiegs; Fortschritt nur als Versal-Kicker „SCHRITT 1 VON 4“; kein `GefuehrterAblauf`, obwohl DESIGN.md ihn für Seltenes vorsieht.                                                                   | Einstieg als geführter Ablauf im Vollbild mit Fortschrittspunkten, „Später“ immer sichtbar, ohne Reiterleiste.                               | `Z: pruef-einstieg-1-willkommen-375.png`                             |
| DR-111 | Einstieg Schritt 3 · 375 · Erika            | 9    | S2  | klein   | a   | Regeltexte: „Höchstens eine Benachrichtigung je Art und Tag, höchstens zehn in der Woche …“, „Gleiche Uhrzeiten heißen: keine Ruhezeit.“                                                                                                                    | Im Einstieg ein Schalter „Erinnerung an Termine“; Ruhezeit und Regeln auf Abruf in den Einstellungen.                                        | `Z: pruef-einstieg-3-375.png`                                        |

### Gerüst

| Nr     | Route                                                        | Kat. | S   | Aufwand | Art   | Beobachtung                                                                                                                                                                                                                                                                | Vorschlag                                                                                                                                                                              | Bild                                                                 |
| ------ | ------------------------------------------------------------ | ---- | --- | ------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| DR-112 | alle `/p` · 188 px (200 %) und „Sehr groß“ · Erika           | 11   | S1  | mittel  | b     | Reiterleiste bricht: bei 200 % sind „Übungen“ und „Nachrichten“ abgeschnitten und nicht erreichbar, bei „Sehr groß“ wird „Nachrichten“ gekappt, bei „Groß“ stoßen die Wörter aneinander (DSN-001 Abschnitt 7 Punkt 1).                                                     | Leiste für große Schrift entwerfen: Symbol 28 px, Wort darunter, alle vier Ziele bei 188 px sichtbar (kürzere Wörter, zweizeilig oder Symbol mit Wort im Wechsel) – Lösung im Entwurf. | `Z: zoom200-uebersicht.png`, `Z: schrift-sehr-gross-termine-375.png` |
| DR-113 | alle `/p` · 1280 · alle                                      | 4    | S2  | groß    | b + c | Am Rechner eine 576-px-Telefonspalte, Reiterleiste unten mittig, links und rechts leere Fläche. Gemessen: Inhaltsbreite 576 px auf allen Plattformseiten, im Plattformcode kein `lg:`.                                                                                     | Eigene Rechneransicht ab 1024 px: Navigation im Kopf, Inhalt bis 48rem, Übersicht zweispaltig ab 900 px Inhaltsbreite; das Telefon bleibt Maßstab.                                     | `B: plattform--p-termine--plattform--1280.png`                       |
| DR-114 | alle `/p` · 375, 1280 · alle                                 | 3    | S2  | klein   | a     | `hyphens: auto` am ganzen Gerüst trennt Namen („Anna Bei-spiel“, „Jan-nes“), kurze Wörter („Pra-xis“, „Über-sicht“, „Ge-wohnheit“), Orte („Tue-bingen“) und Versal-Überschriften („EINGE-STELLT“).                                                                         | Trennung nur für lange Wörter (`hyphenate-limit-chars`, wo der Browser es kennt), nie in Namen, Adressen, Überschriften und Knöpfen.                                                   | `B: plattform--p-termine--plattform--375.png`                        |
| DR-115 | alle `/p` · alle · alle                                      | 6    | S2  | klein   | a     | Der Browser-Tab heißt nach der Anmeldung auf 78 von 80 gemessenen Seiten „Anmelden – Own Motion“: Die Türseite setzt den Titel, die Plattform keinen eigenen.                                                                                                              | Titel je Plattformseite („Termine – Own Motion“), nie ein Name oder eine Gesundheitsangabe.                                                                                            | `M: json/*.json` (Feld `titel`)                                      |
| DR-116 | Öffnen der Plattform im neuen Tab · 375, 1280 · Erika        | 8    | S2  | klein   | a     | Startbild ohne Landeplatz: am Rechner schiebt sich die tiefgrüne Seitenleiste der Praxis ein, die es auf der Plattform nicht gibt; am Telefon landet die Intro-Marke über dem Seitentitel, die echte steht schon im Kopf.                                                  | Landeplatz im Plattformkopf (28 px) – oder für die Plattform ein eigener, kürzerer Markenmoment; Entscheidung im Entwurf.                                                              | `Z: startbild2-1280-1300ms.png`, `Z: startbild2-375-1300ms.png`      |
| DR-117 | alle `/p` · 375 · Erika                                      | 8    | S2  | klein   | a     | Kein Druckzustand an Knöpfen und Zeilen (im ganzen Code nur ein `active:` – ein Mauszeiger im Teamchat), Reiterwechsel ohne Übergang (0 Animationen gemessen). Ein Tipp fühlt sich bis zum Seitenwechsel folgenlos an.                                                     | Druckzustand für Knopf, Zeile und Reiter (Fläche dunkler, leicht kleiner, 80 ms, vorhandene Federkurve), ruhige Überblendung beim Reiterwechsel; reduziert nur Farbe.                  | `B: plattform--p-uebungen--plattform--375.png`                       |
| DR-118 | `/p/termine` ohne Netz · 375 · Erika                         | 7    | S2  | klein   | a     | Ohne Netz bleibt „Ihre Termine werden geladen …“ stehen, „Termin wünschen“ ist bedienbar; das Gerüst hat keine Verbindungsanzeige (die Praxis-App hat eine).                                                                                                               | Verbindungszeile im Kopf („Keine Verbindung – Sie sehen den letzten Stand“), schreibende Knöpfe gesperrt mit Grund.                                                                    | `Z: ohne-netz-reiterwechsel-termine-375.png`                         |
| DR-119 | Kopf · alle · alle                                           | 1    | S3  | klein   | b     | „Ich“ ist eine Silhouette; kein Name, keine Initialen; „Ich“ beginnt mit „Zugang von Test Praxis Tuebingen“.                                                                                                                                                               | Initialen und Name, sobald die Projektion einen Namen trägt (N1); bis dahin Symbol mit Wort.                                                                                           | `B: plattform--p-ich--plattform--375.png`                            |
| DR-120 | Tastatur offen (angenähert 375 × 470) · Erika                | 10   | S2  | klein   | a     | Bei offener Tastatur bleibt die feste Reiterleiste stehen (~70 px), der Sendeknopf liegt außer Sicht.                                                                                                                                                                      | Reiterleiste ausblenden, solange ein Eingabefeld den Fokus hat; Hauptknopf über der Tastatur.                                                                                          | `Z: tastatur-nachricht-neu-375.png`                                  |
| DR-160 | `/p/nachrichten?gesendet=1` → Reiter „Termine“ · 375 · Erika | 7    | S1  | klein   | a     | Falsche Bestätigung: Die Reiterleiste hängt die ganze Adresse an. Nach dem Absenden einer Nachricht zeigt ein Wechsel zu „Termine“ „Ihr Wunsch ist bei der Praxis angekommen. Sie meldet sich bei Ihnen.“ – ohne dass ein Wunsch gesendet wurde (im Browser nachgestellt). | Reiter tragen nur den Bereich (`bereich`/`zugang`) weiter; Bestätigungen verbrauchen ihren Parameter; ein Muster für Rückmeldungen (DR-157).                                           | `Z: mitwandern-2-termine-375.png`                                    |

### Übersicht

| Nr     | Route                                               | Kat. | S   | Aufwand | Art | Beobachtung                                                                                                                                                                                                    | Vorschlag                                                                                                                                                       | Bild                                              |
| ------ | --------------------------------------------------- | ---- | --- | ------- | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| DR-121 | `/p` (Prüfseite `seite=geruest`; Tina, Paula) · 375 | 2    | S1  | mittel  | b   | Keine Hauptsache: „Jetzt dran“ ist eine Liste gleich aussehender Zeilen (Fragebogen, Gewohnheit, Antwort, Rechnung) ohne Symbol und Gewichtung; gemessen 0 Hauptknöpfe auf den Übersichten von Tina und Paula. | Hero-Karte „Als Nächstes“ (Markenfläche, ein Satz, ein Knopf), darunter „Heute“ (Übungen mit Dauer), dann der nächste Besuch mit Person, dann eine kurze Liste. | `Z: pruef-geruest-uebersicht-375-voll.png`        |
| DR-122 | `/p` · 375 · alle                                   | 1    | S2  | klein   | b   | „Guten Tag“ ohne Namen; Untertitel „Sie sind bei Test Praxis Tuebingen angemeldet – Bereich Behandlung.“, gekürzt mit „Mehr“ (43 × 44 px, das einzige zu kleine Ziel).                                         | Gruß nach Tageszeit und Datum; Name, sobald verfügbar (N1); kein Systemsatz, kein „Mehr“.                                                                       | `B: plattform--p--plattform-training--375.png`    |
| DR-123 | `/p` · 375 · alle                                   | 9    | S2  | klein   | b   | Der Notfallsatz (112/116117) steht auf jeder Startseite unter „Fragen an die Praxis“; DSN-001 verlangt ihn über dem Eingabefeld der Nachricht. Auf der Startseite färbt er jeden Besuch alarmierend.           | Startseite: Zeile „Der Praxis schreiben“; die Notfallkarte steht im Schreibweg. Begründet in Frage gestellt – Wortlaut und Pflicht im Schreibweg bleiben.       | `B: plattform--p--begleitung--375.png`            |
| DR-124 | `/p?bereich=training` · 375 · Tina                  | 2    | S2  | mittel  | b   | Für Trainingskund:innen ist die Übersicht fast leer: Gruß, ein Termin, Notfallsatz. Kein Training heute, kein Paketstand.                                                                                      | Gleiches Hero-Muster: nächste Einheit mit Trainer:in, „Heute trainieren“, Paket „läuft bis …“ als ruhige Zeile.                                                 | `B: plattform--p--plattform-training--375.png`    |
| DR-125 | `/p`, `/p/befundbogen` · 375 · Erika                | 9    | S2  | klein   | a   | Der Befundbogen heißt „Anamnesebogen Version 8 (DIGOTOR)“ – in der Übersicht und als Seitentitel.                                                                                                              | „Fragebogen vor dem ersten Termin“; Quelle und Version ins Kleingedruckte.                                                                                      | `B: plattform--p-befundbogen--plattform--375.png` |
| DR-126 | `/p` laden · 375 · Tina                             | 7    | S3  | mittel  | a   | Laden nur als Satz; die Übersicht wartet nur auf die Termine, die übrigen Zeilen springen nach; Fehler von 5 der 9 Abfragen erscheinen nicht (Code).                                                           | Skelett der Hero-Karte und zweier Zeilen; alle Abfragen in einem Zustand.                                                                                       | `Z: laden2-uebersicht-training-375.png`           |

### Übungen

| Nr     | Route                                                            | Kat. | S   | Aufwand | Art | Beobachtung                                                                                                                                                                           | Vorschlag                                                                                                                                                                                  | Bild                                                          |
| ------ | ---------------------------------------------------------------- | ---- | --- | ------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| DR-127 | `/p/uebungen`, `/p/uebungen/einheit/…` · 375 · Erika             | 1    | S2  | mittel  | b   | §4.6 verspricht einen Heimübungsplan „mit Übungen und Videos“; nach ANN-539 gibt es bis zu eigenen Aufnahmen weder Bild noch Video. Plan und Einheit lesen sich wie ein Textdokument. | Entscheidung bleibt. Entwurf: Einheit mit großer Ziffer, Dosierung als Chips in einer Zeile, Hilfsmittel und Dauer vorab; ein Platz für Medien, der ohne Medien nicht als Lücke erscheint. | `B: plattform--p-uebungen-einheit-planid--plattform--375.png` |
| DR-128 | `/p/uebungen` · 375 · Erika                                      | 7    | S2  | klein   | b   | Übungstage als sieben umrahmte Pillen Mo–So (5 + 2 Zeilen), keine gewählt; ob und wie man wählt, ist nicht zu erkennen.                                                               | Chips mit sichtbarem Gewählt-Zustand (Fläche und Haken) in einer Zeile; Rückmeldung „Sie üben an 3 Tagen“.                                                                                 | `B: plattform--p-uebungen--plattform--375.png`                |
| DR-129 | `/p/uebungen` · 375 · Erika                                      | 2    | S3  | klein   | b   | „Jetzt üben“ ohne Dauer und Hilfsmittel vorab.                                                                                                                                        | „3 Übungen · etwa 12 Minuten · Sie brauchen: Stuhl, Arbeitsplatte“ über dem Hauptknopf (Kaia, Hinge).                                                                                      | `B: plattform--p-uebungen--plattform--375.png`                |
| DR-130 | `/p/uebungen/einheit/…` · 375 · Erika                            | 6    | S3  | klein   | a   | Durchführung ohne klebende `Aktionsleiste`: „Nächste Übung“ liegt am Seitenende, darunter der Satz „Jeder Haken wird gespeichert …“; „Abbrechen“ als Textknopf oben rechts.           | Hauptknopf fest unten im Daumenbereich, Speicherstand als Statuszeichen, Vollbild ohne Reiterleiste.                                                                                       | `B: plattform--p-uebungen-einheit-planid--plattform--375.png` |
| DR-131 | Übungen ohne Netz (Prüfseite `ohne-netz.html?seite=lokal`) · 375 | 3    | S3  | klein   | a   | Planname als Versal-Etikett „HEIMPROGRAMM NACH KNIE-TO-TALENDOPROTHESE, PHASE ZWEI …“ – Versalien und Trennstrich in einem langen Inhaltstitel.                                       | Inhaltstitel nie in Versalien.                                                                                                                                                             | `Z: pruef-ohne-netz-lokal-375.png`                            |

### Termine

| Nr     | Route                                                                 | Kat. | S   | Aufwand | Art | Beobachtung                                                                                                                                          | Vorschlag                                                                                                                                                                    | Bild                                                   |
| ------ | --------------------------------------------------------------------- | ---- | --- | ------- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| DR-132 | `/p/termine` · 375 · Erika, Paula                                     | 2    | S2  | mittel  | b   | Liste in einer Karte, Datum und Titel beide fett; keine Unterscheidung Hausbesuch, Video, Praxis; kein Gesicht, kein „heute/morgen“; Namen getrennt. | Nächster Besuch als Karte mit Person und Art („Anna kommt zu Ihnen“ – der Hausbesuch ist das Alleinstellungsmerkmal), weitere Termine als ruhige Zeilen mit relativen Tagen. | `B: plattform--p-termine--plattform--375.png`          |
| DR-133 | `/p/termine/:id` (vergangen) · 375 · Erika                            | 12   | S2  | klein   | a   | „Bei Fragen rufen Sie bitte die Praxis an.“ – ohne Nummer und ohne Knopf: Sackgasse. Die Projektion kennt keine Rufnummer (N2).                      | Bis eine Nummer da ist, „Der Praxis schreiben“ als Weg; danach ein Anrufknopf.                                                                                               | `B: plattform--p-termine-terminid--plattform--375.png` |
| DR-134 | `/p/termine/wunsch` (Fenster) · 375 · Erika                           | 1    | S3  | mittel  | b   | Tage und Tageszeiten als Kästchen in zwei Spalten – Formularbild.                                                                                    | Tageszeiten als große Wahlkarten, Tage als Chips, Zusammenfassung vor dem Senden (MyChart).                                                                                  | `B: plattform--p-termine-wunsch--plattform--375.png`   |
| DR-135 | „Diese Woche“ (Prüfseite `plattform-uebungen.html?seite=woche`) · 375 | 4    | S3  | klein   | a   | „Nichts geplant.“ an drei von fünf Tagen; die Pillen „Übungstag“ und „Termin“ stehen über dem Text, das Datum mittig – unruhig.                      | Leere Tage zusammenfassen; Art als Zeichen vor dem Titel in einer Zeile.                                                                                                     | `Z: pruef-termine-mit-uebungstagen-375-voll.png`       |
| DR-136 | `/p/termine` laden · 375 · Erika                                      | 7    | S3  | klein   | a   | Während die Liste lädt, ist „Termin wünschen“ schon bedienbar.                                                                                       | Hauptknopf mit den Daten oder als Skelett.                                                                                                                                   | `Z: laden2-termine-375.png`                            |

### Nachrichten

| Nr     | Route                                          | Kat. | S   | Aufwand | Art | Beobachtung                                                                                                                                                                             | Vorschlag                                                                                                                                            | Bild                                                          |
| ------ | ---------------------------------------------- | ---- | --- | ------- | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| DR-137 | `/p/nachrichten`, `/neu`, `/:id` · 375 · Erika | 6    | S2  | klein   | b   | Der Notfallkasten steht auf Liste, Detail und Neu – dreimal im Ablauf, jedes Mal als grauer Kasten mit Linie.                                                                           | Einmal über dem Eingabefeld als Notfallkarte (Überschrift ist die Handlung, Muster NHS Care Card); auf Liste und Detail nur die Antwortfrist.        | `B: plattform--p-nachrichten--plattform--375.png`             |
| DR-138 | `/p/nachrichten` · 375 · Erika                 | 9    | S2  | klein   | a   | Zustände als Pillen mit Zeichen: „↩ beantwortet“, „… bei der Praxis“ (wirkt abgeschnitten); „Antwort bis 20.10.2026“ am 21.10. ohne Hinweis.                                            | „Beantwortet“ und „Wartet auf Antwort“ mit klarem Zeichen; überschrittene Frist als Zustand gestalten (Wortlaut fachlich, N4).                       | `B: plattform--p-nachrichten--plattform--375.png`             |
| DR-139 | `/p/nachrichten/:id` · 375 · Erika             | 1    | S2  | mittel  | b   | Verlauf ohne Gesicht: eigene Nachricht als Karte „Sie · Datum“, Antworten „von Praxis“; Zähler „0 von 2000 Zeichen“ vor dem Tippen; zwei volle Knöpfe „Senden“ und „Hat sich erledigt“. | Gesprächskopf mit Thema und Praxis (Person, sobald verfügbar), Nachrichten links und rechts, Zähler erst nahe der Grenze, „Hat sich erledigt“ leise. | `B: plattform--p-nachrichten-nachrichtid--plattform--375.png` |
| DR-140 | `/p/nachrichten/neu` · 375 · Erika             | 6    | S3  | klein   | a   | Drei Wörter für dieselbe Handlung („Neue Nachricht“, „Nachricht senden“, „Senden“); Themen als eigene Radiogruppe statt `Wahlreihe`.                                                    | Ein Wort; Themen als Wahlreihe oder Chips mit Symbol.                                                                                                | `B: plattform--p-nachrichten-neu--plattform--375.png`         |

### Selbstauskunft und Ernährung

| Nr     | Route                                                               | Kat. | S   | Aufwand | Art | Beobachtung                                                                                                                                                                                                  | Vorschlag                                                                                                                                                       | Bild                                                                |
| ------ | ------------------------------------------------------------------- | ---- | --- | ------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| DR-141 | `/p/befundbogen` · 375 · Erika                                      | 2    | S2  | mittel  | b   | 7 Schritte, Schritt 1 mit sechs Fragen auf 2 491 px; drei Aktionen am Ende („Weiter“, „Zwischenspeichern“, „Abbrechen“); Beruf und Sport als große Textfelder.                                               | Ein Thema je Schritt, Speichern leise oder im Hintergrund, einzeilige Felder für kurze Angaben.                                                                 | `B: plattform--p-befundbogen--plattform--375.png`                   |
| DR-142 | `/p/befundbogen`, `/p/checkin` · 375 · Erika                        | 10   | S2  | klein   | a   | Skala 0–10 bricht bei 375 px in 6 + 5: Die Skala liest sich nicht mehr als Linie.                                                                                                                            | Zwei gleich lange Reihen (0–5, 6–10) mit Ankern oder senkrecht; große Ziffern (Bearable).                                                                       | `Z: pruef2-checkin-375.png`                                         |
| DR-161 | `/p/angaben` (Prüfseite `seite=angaben`) · 375                      | 2    | S3  | mittel  | b   | „Meine Angaben“: acht einzelne Punktbilder untereinander (3 131 px), Achsen und Anker je Bild wiederholt, Werte klein; der Satz zur Deutung steht richtig, aber die Seite ist ein Stapel.                    | Je Frage eine ruhige Zeile mit letztem Wert und Datum, Verlauf auf Abruf (Kaia: Balken mit Zahl, Tage ohne Eintrag leer); keine Linie, keine Farbe als Wertung. | `Z: pruef2-angaben-375.png`                                         |
| DR-143 | Check-in, Gewohnheiten, Angebot, Abo, Rechnungen leer · 375 · Erika | 7    | S3  | klein   | b   | Leerzustände sind ein Satz in einer Karte auf sonst leerer Seite („Ihre Praxis hat zurzeit keinen Check-in für Sie eingestellt.“).                                                                           | Leerzustand mit Bild oder Markenform, was als Nächstes kommt und wer es auslöst.                                                                                | `B: plattform--p-checkin--plattform--375.png`                       |
| DR-144 | `/p/gewohnheiten` aus „Ich“ · 375 · Erika                           | 12   | S3  | klein   | a   | Aus „Ich“ verlinkt, der Rückweg sagt „Zur Übersicht“.                                                                                                                                                        | Rückweg folgt der Herkunft.                                                                                                                                     | `B: plattform--p-gewohnheiten--plattform--375.png`                  |
| DR-145 | `/p/ernaehrung/tagebuch` · 375 · Erika                              | 5    | S2  | mittel  | b   | Kastenlook: Restkalorien-Karte, drei Balken mit dunkler Spur (`--color-spur`, gewollt 3:1, wirkt hier schwer), je Mahlzeit Versal-Etikett, „Eintragen“ und eine leere Karte „Nichts eingetragen.“ (dreimal). | Tag als ruhiger Strom (AteMate): Mahlzeiten als Zeilen mit „+“, leere Mahlzeiten als eine Zeile; Balken mit heller Fläche und Kante statt dunkler Spur.         | `B: plattform--p-ernaehrung-tagebuch--plattform--375.png`           |
| DR-146 | `/p/ernaehrung/tagebuch/eintragen` · 375 · Erika                    | 9    | S3  | klein   | a   | Lizenzzeile (BLS, Open Food Facts, CC BY, ODbL) als Fließtext und zusätzlich im Aufklapper „Quellenangabe“.                                                                                                  | Einmal, als Kleingedrucktes oder im Aufklapper.                                                                                                                 | `B: plattform--p-ernaehrung-tagebuch-eintragen--plattform--375.png` |

### Unterlagen, Verträge, Ich und Datenschutz

| Nr     | Route                                                  | Kat. | S   | Aufwand | Art | Beobachtung                                                                                                                                                                                                         | Vorschlag                                                                                                                                                                                   | Bild                                                                   |
| ------ | ------------------------------------------------------ | ---- | --- | ------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| DR-147 | `/p/rechnungen/:id` (Prüfseite `seite=rechnung`) · 375 | 2    | S2  | mittel  | b   | Rechnung als Detailliste; Betrag nicht herausgehoben; Abzeichen „! offen“ im Warnton schon vor Fälligkeit; Positionsbetrag steht über der Menge.                                                                    | Betrag groß oben mit „fällig am“, Zahlungsangaben als Karte mit Kopierknöpfen (IBAN, Verwendungszweck), Warnton erst bei Überfälligkeit.                                                    | `Z: pruef2-rechnung-375.png`                                           |
| DR-148 | `/p/abo`, `/p/paket` (Prüfseiten) · 375                | 1    | S3  | mittel  | b   | Abo und Paket wirken wie Einstellungsseiten: Text in Karten, Preise als Textzeilen, Bedingungen als Aufzählung.                                                                                                     | Plankarte (Name, Preis, nächste Zahlung, enthaltene Leistungen); Kündigen leise am Ende, ohne Rückhaltedialog wie heute.                                                                    | `Z: pruef-abo-375-voll.png`, `Z: pruef-preise-ohne-paket-375-voll.png` |
| DR-162 | `/p/angebot` (Prüfseite `seite=angebot`) · 375         | 12   | S2  | mittel  | b   | Vertragsabschluss „Training nach Ihrer Behandlung“ als eine Seite von 4 374 px: Paket mit Bedingungen, Freigaben aus der Behandlung, Einwilligung, volle Widerrufsbelehrung, ganz unten „Zahlungspflichtig buchen“. | Geführter Ablauf (DESIGN.md: selten, nichts darf vergessen werden): Paket → Freigaben → Einwilligung → Widerrufsbelehrung → Zusammenfassung → „Zahlungspflichtig buchen“ (Wortlaut bleibt). | `Z: pruef2-angebot-375.png`                                            |
| DR-149 | Unterseiten von „Ich“ · 375 · Erika                    | 9    | S3  | klein   | a   | Rückweg „← Zu „Ich““ mit Anführungszeichen.                                                                                                                                                                         | „← Ich“.                                                                                                                                                                                    | `B: plattform--p-rechnungen--plattform--375.png`                       |
| DR-150 | `/p/ich` · 375 · Erika                                 | 2    | S2  | klein   | a   | Der einzige Hauptknopf der Seite ist „Abmelden“.                                                                                                                                                                    | „Abmelden“ als leise Zeile am Ende; „Überall abmelden“ mit Rückfrage darunter.                                                                                                              | `B: plattform--p-ich--plattform--375.png`                              |
| DR-151 | `/p/ich` · 375 · Erika                                 | 4    | S2  | mittel  | b   | 13 gleichförmige Zeilen in zwei Bereichsblöcken (je Rechnungen, Check-in, Gewohnheiten, Einwilligungen, Daten), ohne Symbol und Pfeil, kein Profilkopf.                                                             | Profilkopf (Initialen, Praxis), Gruppen nach Zweck (Unterlagen, Meine Angaben, Datenschutz, Konto) mit Symbolen; Bereich als Wahl statt doppelter Liste.                                    | `B: plattform--p-ich--plattform--375.png`                              |
| DR-152 | `/p/einstellungen` · 375 · Erika                       | 9    | S3  | mittel  | b   | Schriftgröße ohne Vorschau; getrennte Versal-Überschrift („EINGE-STELLT“); „Die Praxis spricht Sie mit „Sie“ an.“; drei Karten, zwei Aufklapper, drei Hauptknöpfe gemessen.                                         | Schriftgröße mit Vorschau, Benachrichtigungen als Schalterliste, Passkey und PIN als Zeile mit Zustand.                                                                                     | `B: plattform--p-einstellungen--plattform--375.png`                    |
| DR-153 | `/p/daten` · 375 · Erika                               | 9    | S3  | klein   | a   | „Die Datei ist im Format JSON.“                                                                                                                                                                                     | Technikwort nur in Klammern hinter einer verständlichen Beschreibung.                                                                                                                       | `Z: pruef2-daten-375.png`                                              |

### Plattform als Ganzes

| Nr     | Route                         | Kat. | S   | Aufwand | Art   | Beobachtung                                                                                                                                                                                        | Vorschlag                                                                                                                                                                                 | Bild                             |
| ------ | ----------------------------- | ---- | --- | ------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| DR-154 | alle `/p` · 375 · alle        | 3    | S2  | mittel  | c     | Eine Größe für fast alles: 1 044 von 1 089 gemessenen Textelementen sind 18 px, der Seitentitel 26 px, Abschnittstitel 18/600 in Versalien; Hierarchie nur über das Gewicht (400/500/600/700/800). | Plattform-Skala: Gruß 34, Seitentitel 28, Abschnitt 22, Zeilentitel 18/600, Text 18, Leise 18; keine Versalien; Mindestmaß 18 bleibt.                                                     | `M: zusammenfassung.json`        |
| DR-155 | alle `/p` · 375, 1280 · alle  | 1    | S1  | groß    | b + c | Kein Inhaltsbild auf 80 gemessenen Seiten – je Seite genau ein Bild, die Wortmarke; im Code 0× `Personenbild`, 0× `Medienbild`. Die Plattform zeigt weder Praxis noch Menschen noch Lastenrad.     | Bildsprache der Plattform: eigene Fotos (Praxis, Rad, Hände, Zuhause – keine KI-Bilder; ANN-539 bleibt für Übungen), Markenflächen in Tiefgrün, Personenbild, sobald die Daten es tragen. | `M: blick/*.png`                 |
| DR-156 | alle `/p` · 375 · alle        | 4    | S3  | klein   | a     | Abstände außerhalb des Rhythmus 4/8/12/16/24/32: gemessen 6 px (122×), 20 px (56×, Seitenrand), 10 px (27×); 31 Hüllen nur mit `mt-N` (Code).                                                      | Plattform-Rhythmus festlegen (Seitenrand als Token), Abstände über `Section` und `Listenabschnitt`.                                                                                       | `M: zusammenfassung.json`        |
| DR-157 | alle `/p` · Code              | 6    | S2  | mittel  | a     | Dieselbe Aufgabe mehrfach gelöst: Bestätigung nach dem Absenden auf sechs Wegen; 8 nachgebaute Listenzeilen, rund 18 Pseudo-Überschriften, rund 15 freie Knopfreihen neben 17 `Formularfuss`.      | Ein Muster je Aufgabe (`Rueckmeldung` nach Rückkehr, `ListRow` mit `darunter`, `Zwischentitel`, `Formularfuss`); Ratsche um die Plattform ergänzen.                                       | Code-Anhang                      |
| DR-158 | 4 Plattformseiten · 375, 1280 | 11   | S3  | klein   | a     | axe: `heading-order` (Übungseinheit, Einwilligungen), `page-has-heading-one` (Übungsblatt, Rechnung). Sonst keine Verstöße, kein Kontrastfehler, Fokusring überall sichtbar.                       | Überschriftenfolge und `h1` ergänzen.                                                                                                                                                     | `M: json/*uebungseinheit*.json`  |
| DR-159 | Plattform · Texte             | 9    | S2  | klein   | a     | Doppelpunkt-Formen, wo der Name bekannt wäre („Ihre Therapeut:in sieht Ihre Angaben …“); Antworten „von Praxis“.                                                                                   | Wo die Person bekannt ist, ihr Name; sonst „Ihre Praxis“; Doppelpunkt nur, wo es keinen Namen gibt.                                                                                       | `Z: pruef-checkin-danke-375.png` |

## Abschnitt „Plattform“ für DESIGN.md (Entwurf)

DESIGN.md steht mit 12 795 Byte an seiner Grenze von 12,5 KB (`pnpm docs:check`). Vorschlag: Der
heutige Absatz „Plattform“ in DESIGN.md wird durch einen gleich langen Verweis ersetzt, die Regeln
stehen in einer eigenen Datei `docs/design/PLATTFORM.md` mit eigener Grenze. Entwurf dieser Datei:

> **PLATTFORM – so sieht eine Seite unter `/p` aus.** Gleiche Marke, gleiche Bausteine, eigene
> Sprache. Für Patient:innen und Kund:innen bis 78, am eigenen Telefon, zuhause. Es gilt
> DESIGN.md, soweit hier nichts anderes steht.
>
> **Grundsätze.** (1) Vertrauen vor Dichte: genau eine Hauptsache je Bildschirm, der Mensch hinter
> der Praxis sichtbar. (2) Wärme aus Bild, Raum und Marke – keine eigene Farbwelt (DESIGN.md 9.12
> bleibt). (3) Lesbar für alle: nichts unter 18 px, 200 % und „Sehr groß“ ohne Verlust. (4) Telefon
> zuerst; ab 1024 px eine eigene Rechneransicht, kein gestrecktes Telefon. (5) Ruhig: keine
> Bewertung, keine Serie, kein Lob, kein Countdown (DSN-001 Abschnitt 7).
>
> **Was aus DESIGN.md gilt:** alle Bausteine und die Ratsche; Status = Zeichen + Wort; kein Kasten
> im Kasten; ein Hauptknopf je Ansicht, Zerstörendes leise am Ende mit `Rueckfrage`; Zustände über
> `Abfragezustand`; Links unterstrichen; geführte Abläufe für Seltenes; kein Dunkelmodus (ANN-401).
>
> **Was auf der Plattform anders gilt:**
>
> | DESIGN.md                                     | Plattform                                                                                                                                                               |
> | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
> | Sonnenlicht, keine Schatten, Ebenen aus Linie | Eine Tiefenstufe `--shadow-plattform` für antippbare Karten (Hero, Aufgaben); Listen bleiben Linie.                                                                     |
> | Keine Erklärsätze                             | Ein Satz Orientierung, wo eine Patientin sonst nicht weiß, was passiert (leer, nach dem Absenden, wer sieht meine Angaben); nie eine Gebrauchsanweisung der Oberfläche. |
> | Kicker und Etiketten in Versalien             | Keine Versalien; Abschnittstitel in Satzschreibung.                                                                                                                     |
> | Schriftrollen 12–15 px, Titel 26/32           | Skala: Gruß 34/800, Seitentitel 28/800, Abschnitt 22/700, Zeilentitel 18/600, Text 18/400, Leise 18/400 `ink-muted`; Zeilenhöhe 1,45.                                   |
> | Silbentrennung frei                           | Nur lange Wörter; nie in Namen, Adressen, Überschriften und Knöpfen.                                                                                                    |
> | Ziele ≥ 44 px                                 | Knöpfe 48 px, Zeilen und Textlinks ≥ 44 px (ANN-267); Abstand zwischen Zielen ≥ 8 px.                                                                                   |
> | Rhythmus 4/8/12/16/24/32                      | Dazu 40 und 48 zwischen Abschnitten; Seitenrand 20 als Token.                                                                                                           |
> | Bewegung: Federn, Hover 120 ms                | Druckzustand an Knopf, Zeile und Reiter; Seitenwechsel als Überblendung; Hero erscheint gestaffelt; reduziert nur Farbe.                                                |
> | Bilder: `Medienbild` 4:3                      | Dazu Hero-Bild 3:2 im Radius 16, `Personenbild` an Terminen und Antworten; eigene Fotos, keine KI-Bilder; Markenformen nie neben der Wortmarke.                         |
> | Liste in Karte                                | „Als Nächstes“ als Hero-Karte (Tiefgrün, Papier-Schrift), höchstens drei Aufgabenkarten mit Symbol; alles Weitere als `ListRow`.                                        |
> | Arbeit an jeder Zeile (L3)                    | Entfällt; jede Zeile ist ganz das Ziel.                                                                                                                                 |
>
> **Seitentypen.** Heute (Übersicht: Hero, Heute, nächster Besuch, Liste) · Liste · Objekt ·
> Geführter Ablauf (Einladung, Einstieg, Wunsch, Absage, Check-in, Fragebogen) · Durchführung
> (Übungseinheit im Vollbild, Hauptknopf fest unten, ohne Reiterleiste) · Tür (Einladung,
> Anmeldung, Einrichten, Sperre, Zugang beendet – in der Plattform-Schrift, mit Markenfläche) ·
> Blatt (Planblatt, Rechnung).
>
> **Gerüst.** Telefon: Kopf mit Wortmarke 28 und „Ich“ (Initialen), Reiterleiste mit vier Zielen,
> die bei 200 % erreichbar bleiben und bei offener Tastatur verschwinden. Ab 1024 px: Navigation im
> Kopf, Inhalt bis `max-w-spalte`, Übersicht zweispaltig ab 900 px Inhaltsbreite. Startbild mit
> Landeplatz im Plattformkopf. Tab-Titel je Seite.
>
> **Begriffe.** Übersicht, Termine, Übungen bzw. Training, Nachrichten, Ich · „Termin wünschen“ ·
> „Fragebogen vor dem ersten Termin“ (nicht Anamnesebogen, Version, DIGOTOR) · „Mit Gesicht oder
> Fingerabdruck anmelden (Passkey)“ · „Ihre Praxis“ oder der Name der Person (Doppelpunkt nur ohne
> Namen) · nie: Sitzung, Zugang als Bedienwort, Projektion, Instrument, Mein Konto, Kennwort
> (außer „kein Kennwort“), JSON ohne Erklärung, Workout, Drill.
>
> **Prüfliste.** Wie DESIGN.md, dazu: 200 % bei 188 px; „Sehr groß“; Tastatur offen; Tab-Titel;
> ein Bild oder eine Markenfläche je Hauptseite; keine Versalien; keine Trennung in Namen.

Abgleich für Lauf 2: Lauf 2 prüft dieselben Begriffe aus Sicht der Praxis-App (DSN-001 Abschnitt 6:
Abschnitt „Plattform“ in Akte und Trainingsverhältnis, Einsicht der Praxis).

## Referenzen

Je Briefing 3 bis 5 Plattformen; gewählt nach drei Fragen: Kennen deutsche Patient:innen sie
(Doctolib, ottonova)? Zeigt sie dieselbe Aufgabe mit einer Fachperson im Rücken (PhysiApp,
Medbridge GO, Hinge Health, Kaia)? Ist sie für Ruhe und Vertrauen bekannt (Oura, Headspace, Apple
Health, How We Feel)? Muster mit eigenen Worten; „gesehen“ = App-Store-Bild oder Seite angesehen,
„beschrieben“ = aus Hilfetexten. Nicht übertragbar ist überall: Serien, Punkte, Lob, Scores und
Ampeln (DSN-001 Abschnitt 2 Punkt 5), Selbstbuchung (Terminwunsch statt Buchung), KI-Bilder und
alles, was Gesundheitsdaten auf Sperrbildschirm oder Dritte bringt.

**Briefing 1 – Erster Eindruck.**

- **Hinge Health** (gesehen, https://apps.apple.com/us/app/hinge-health/id1429270372): Gruß nach
  Tageszeit, darunter „Today“ mit einer großen Fotokarte und einem Knopf „Start“; die Therapeutin
  als Gesicht im Videoanruf. Passt: eine Hauptkarte, Mensch statt Logo. Nicht: Wochenziel 0/3,
  Punkte.
- **Oura** (gesehen, https://apps.apple.com/de/app/oura/id1043837948): „Heute“ als Titelseite mit
  ruhigem Landschaftsfoto, Serifen-Überschrift, zwei Sätze, ein Knopf. Passt: Hero mit einem Satz.
  Nicht: Scores, dunkle kleine Schrift.
- **Medbridge GO** (gesehen, https://apps.apple.com/us/app/medbridge-go-for-patients/id1089747982):
  zwei Schritte bis zum Start, der erste Satz nennt die Fachperson als Absenderin des Programms.
  Passt: Wer einlädt, steht vorn. Nicht: Coach-Marks in kleiner Schrift.
- **PhysiApp** (beschrieben, https://support.physitrack.com/article/131-what-do-my-patients-see):
  Ein zugewiesener Fragebogen kommt direkt nach der Anmeldung, dann das Programm. Passt: Fragebogen
  vor dem ersten Termin als erste Hauptsache. Nicht: Code + Geburtsjahr statt Passkey.
- **NHS login** (beschrieben, https://developer.chrome.com/blog/nhs-passkeys-case-study): Passkey
  in Gerätewörtern („Face ID“, Fingerabdruck), Liste der Geräte im Konto. Passt: Einrichtung ohne
  Technikwort. Nicht: Kennwort als Rückfall.

**Briefing 2 – Übungen.** PhysiApp (gesehen, App Store id1047722007): „Übung 2 von 4“, Dosierung in
einer Zeile, Rückmeldung mit tatsächlich gemachten Sätzen und „Unbehagen 0/10“ – passt; nicht:
Auszeichnungen. Medbridge GO (gesehen): vor dem Start Übungen an- und abwählen, Gliederung
Ausgangsstellung, Bewegung, Tipp; Abschluss sagt, dass die Fachperson es sieht – passt; nicht: „High
fives“. Kaia (gesehen, https://apps.apple.com/de/app/kaia-r%C3%BCckenschmerzen/id1576668844): „Das
erwartet dich heute“ mit Art und Dauer, Hilfsmittel vorab, ältere Menschen in Wohnzimmern – passt
zum Hausbesuch; nicht: Duzen, Kamera-Coach. Apple Health, Medikamente (beschrieben,
https://support.apple.com/en-us/105064): „Genommen“ und „Ausgelassen“ gleichwertig – Vorlage für
„gemacht / heute nicht“.

**Briefing 3 – Termine.** One Medical (gesehen, https://apps.apple.com/us/app/one-medical/id393507802):
nächster Termin als erste Karte mit rundem Foto. MyChart (beschrieben,
https://www.ecommunity.com/mychart-guide/visits-appointments): „Request an Appointment“ mit
Wunschtagen und Zeitfenstern, Prüfschritt vor dem Senden. Doctolib (beschrieben,
https://doctolib.zendesk.com/hc/de/articles/4402839123476): Verbindlichkeit an drei Stellen, Frist
als Regel, danach „Praxis anrufen“. ottonova (gesehen,
https://apps.apple.com/de/app/ottonova/id1174272231): eine Zeitleiste mit Datumsüberschriften und
Symbol je Art. Nicht: Selbstbuchung, Video-Umstellung, Werbekarten.

**Briefing 4 – Selbstauskunft und Tagebuch.** Apple Health, Gemütszustand (gesehen und
beschrieben, https://support.apple.com/de-de/guide/iphone/iph6a6decb13/ios): eine Frage je
Bildschirm, Klartext über dem Wert, Vertiefung freiwillig, Nachtragen erlaubt. Bearable (gesehen,
https://apps.apple.com/us/app/bearable-symptom-tracker/id1482581097): 0–10 als große Kacheln in
zwei Reihen. How We Feel (gesehen, https://apps.apple.com/us/app/how-we-feel/id1562706384): Verlauf
als ruhiger Kalender ohne Zahl, Datenschutzversprechen als eigener Bildschirm. AteMate (gesehen,
https://apps.apple.com/us/app/atemate-food-journal-coach/id1164976477): der Tag als Strom aus
Mahlzeiten und Wasser. Nicht: Farbe als Wertung, Korrelationen, Scores.

**Briefing 5 – Nachrichten.** Doctolib (beschrieben,
https://doctolibpatient.zendesk.com/hc/de/articles/4406135221010): „Für wen?“ → „Grund“ → Text,
Notfallhinweis vorangestellt, Status „Warten auf Ihre Antwort“, Abwesenheit schon beim Schreiben.
NHS Care Cards (beschrieben, https://service-manual.nhs.uk/design-system/components/care-cards):
Notfall als eigene Karte, Überschrift ist die Handlung. MyChart (beschrieben,
https://www.mychart.org/Help/messaging): Thema vor Text, Entwurf bleibt. ottonova (gesehen):
Gespräch mit benannter Person, „Gelöst?“ durch die Person selbst. Nicht: Chat, Bewertung,
Symptomlisten (ADR-006).

**Briefing 6 – Unterlagen und Verträge.** ottonova (gesehen): Dokumente nach Datum, Papier-Miniatur,
Pille „Bezahlt“. Oura Membership (beschrieben,
https://support.ouraring.com/hc/en-us/articles/4409086524819): Plan, nächstes Zahlungsdatum,
Kündigen, was mit den Daten geschieht. Eversports (beschrieben,
https://helpcenter.eversportsmanager.com/1-terminate-your-membership-on-the-eversports-website):
Pass und Mitgliedschaft in einer Liste, Kündigen und Widerruf als eigene Wege. One Medical (gesehen):
Kosten am Entscheidungspunkt. Nicht: Rückhaltedialog, Erstattungslogik.

**Briefing 7 – Ich und Datenschutz.** Doctolib (beschrieben,
https://doctolibpatient.zendesk.com/hc/de/articles/26436006805404): „Das Wichtigste auf einen
Blick“, Ablehnen gleichwertig, Zustand nach dem Speichern. Apple Health (beschrieben,
https://support.apple.com/de-de/guide/iphone/iph5ede58c3d/ios): Teilen als sichtbarer, umkehrbarer
Schalter, Export für Menschen (PDF) und Maschinen (Datei). How We Feel (gesehen):
Datenschutzversprechen als ruhiger eigener Moment. NHS App (beschrieben,
https://www.nhs.uk/nhs-app/nhs-app-legal-and-cookies/nhs-app-accessibility-statement/): Zoom bis
200 % als Prüfmaßstab. Nicht: Nudging nach Ablehnung, Teilen mit Kontakten.

Nicht belegt (bei keiner gewählten Plattform öffentlich nachweisbar): Skelette statt Spinner,
Haptik, Leerzustände mit Bild, eine Schriftgröße innerhalb der App, Fortschritt im Onboarding. Die
Vorschläge dazu stützen sich auf DESIGN.md und DSN-001, nicht auf Referenzen.

## Annahmen

1. **Ablage.** Bilder, Messungen und Fortschritt liegen im Hauptordner
   `PraxisSoftware\.tmp\design-review\lauf-1\`, nicht im Worktree – sie überleben das Aufräumen
   des Worktrees und sind für Lauf 2 auffindbar.
2. **Stack.** `scripts/cloud-stack.sh` läuft nur unter Linux. Genommen wurde der Docker-Stack aus
   `docs/DEVELOPMENT.md`: Docker Desktop startete erst, nachdem zwei verwaiste Socket-Ordner
   umbenannt waren (`%LOCALAPPDATA%\Docker\run` und `%LOCALAPPDATA%\docker-secrets-engine`, je
   `*.stale-20261021*`, nichts gelöscht – wie am 20. und 26.09.). `supabase db reset` aus dem
   Worktree, reicher Seed wie `cloud-stack.sh reset --reich` per `psql` (`testpatienten.sql` und
   `praxiswoche.sql` in einer Transaktion), danach zurückgesetzt (siehe Schlussbericht).
3. **Umgebung, kein Befund.** Lokal hing die Abfrage `own_offline_passkeys`, und der Anmeldedienst
   im vorhandenen Container kennt die Passkey-Endpunkte nicht (404). Daher „keine Netzruhe“ in der
   Bildstrecke und ein Fehlerzustand bei „Passkey und PIN“; beides ist nicht gewertet.
4. **Adresse.** Vite lauschte unter Node 24 nur auf `localhost:5173`; Bildstrecke und Messung liefen
   mit `E2E_BASE_URL=http://localhost:5173`.
5. **Erste Nutzung.** Erika hat im Seed einen offenen Einstieg; `/p` zeigt bei ihr deshalb Schritt
   1. Die Übersicht mit Inhalt ist an der Prüfseite `plattform.html?seite=geruest` bewertet.
6. **Tastatur** ist als Fenster 375 × 470 mit fokussiertem Feld angenähert; **200 %** als Fenster
   188 × 406 (wie `plattform-barrierefreiheit.spec.ts`); **lange Namen** durch Ersetzen im DOM
   (synthetisch, ohne Daten zu ändern).
7. **Ohne Netz neu laden** ergibt im Entwicklungsserver eine weiße Seite, weil der Service Worker nur
   im Auslieferungsstand registriert wird – nicht gewertet.
8. **ANN-539** (keine Bilder bei Übungen) und die Wortlaute von Notfallhinweis und Ausfallhonorar
   sind entschieden und werden nicht neu aufgerollt; Vorschläge betreffen Platz und Form.
9. **„Wärmer und hochwertiger“** heißt hier: eigene Fotos und Markenflächen, mehr Raum, eine
   Tiefenstufe, ruhige Bewegung – keine neue Farbwelt (DESIGN.md 9.12), kein Dunkelmodus (ANN-401),
   keine KI-Bilder (Jannes, ANN-539).
10. **Der QR-Text der Praxis** (DR-104) gehört zur Einladungsstrecke und steht deshalb in Lauf 1,
    obwohl er in der Praxis-App erscheint; die Einsicht der Praxis bleibt Lauf 2.
11. **Zielgröße:** gewertet ist 44 px (DESIGN.md, ANN-267). Gegen das Ziel 48 aus DSN-001 Abschnitt
    7 Punkt 2 verfehlen 503 Ziele auf 76 Seiten – fast alle Zeilen und Textlinks mit 44 px; das ist
    eine Regelfrage, kein Einzelbefund.
12. **Schwere S1** nur dort, wo eine Patientin wahrscheinlich abbricht oder ein Ziel nicht erreicht
    (Einladung, Einrichtung, Einstieg, Übersicht ohne Hauptsache, Reiterleiste bei 200 %, Türen
    unter 18 px, Bildlosigkeit als Ganzes).

## Nebenbei (Funktionsideen außerhalb des Designs, nicht verfolgt)

- **N1 Eigener Name in der Projektion** – für Gruß, Kopf und Einladung („Guten Morgen, Frau …“).
- **N2 Rufnummer der Praxis in der Projektion** – für „Praxis anrufen“ am Termin und in der
  Hilfe; heute endet der vergangene Termin in „rufen Sie an“ ohne Nummer.
- **N3 Bild der behandelnden Person auf der Plattform** – `Personenbild` gibt es in der Praxis-App;
  auf der Plattform bräuchte es eine Freigabe und eine Projektion.
- **N4 Zustand „Antwortfrist überschritten“** – Wortlaut und Folge (Anruf?) fachlich klären.
- **N5 Dauer einer Einheit** – „etwa 12 Minuten“ aus Dosierung und Pausen ableiten oder als Angabe
  der Fachperson.
- **N6 Zahlen per Überweisungscode (GiroCode)** an offenen Rechnungen.
- **N7 Termin in den eigenen Kalender** (ICS-Datei) am Termin.
- **N8 Eigene Fotos und Videos der Übungen** (Wiedervorlage von ANN-539) – die Plattform verspricht
  sie nach §4.6.
- **N9 Inhalte der Stufe 2** (Verlauf, Rückfragen mit Medien, Plan als PDF) – laut Register noch
  offen; gestalterisch der größte Hebel für das Abo.

## Offene Branches

`git fetch origin --prune` am 21.10.2026: Auf `origin` liegen nur `main` und zwei gemergte
`ccr-…`-Branches. Die fünf Branches, die STATUS unter „Offen auf Branches“ nennt (Bewegung,
Übungen zweite Runde, Monatsabrechnung, Übersicht, Intro), sind gemergt (PR #246 bis #259) und
gelöscht – die Zeile in STATUS ist veraltet. Lokal ist nur `claude/dok-003-role-projection-p4b90k`
ungemergt, ohne Änderungen an Plattform oder Türseiten. `gh` ist nicht angemeldet; offene Pull
Requests waren nicht abfragbar. Kein Befund dieses Berichts ist auf einem Branch schon umgebaut.

## Nicht geprüft

- **Echte Geräte:** iOS-Safari und Android-Chrome, echte Bildschirmtastatur, Passkey-Dialog des
  Systems, Haptik, Sonne – nur angenähert oder gar nicht.
- **Auslieferungsstand:** Service Worker, Neuladen ohne Netz, Installieren als App.
- **Einladung bis zum Ende:** Einlösen und Anmelden ohne Kennwort hätte ein Konto angelegt (Daten
  verändert); gezeigt sind Formular, ungültiger Code und die Einrichtung an Prüfseiten.
- **Abschluss einer Übungseinheit, Absenden von Check-in, Nachricht und Wunsch:** schreibend; die
  Rückmeldungen danach sind nur aus dem Code beurteilt.
- **Stufe 2 mit laufendem Abo** gibt es im Seed nicht; bewertet an der Prüfseite `seite=abo`.
- **Begleitung als Einwilligende:** nur die Übersicht, Termine und „Ich“ der Begleitung.
- **Bewegung in Echtzeit** jenseits der Startbild-Einzelbilder und der Animationszählung.

## Anhang: Messwerte

| Messung                               | Ergebnis                                                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Seiten vermessen                      | 80 (35 Routen × Konten × 375/1280), 0 Ausfälle                                                                            |
| Querscrollen bei 375 und 1280         | keins; bei 188 px (200 %) schneidet die feste Reiterleiste ab (DR-112)                                                    |
| Kontrast unter WCAG AA                | 0 Texte (niedrigster Wert über der Grenze)                                                                                |
| Ziele unter 44 px                     | 5, alle derselbe Textknopf „Mehr“ (43 × 44)                                                                               |
| Ziele unter 48 px                     | 503 auf 76 Seiten (Zeilen, Textlinks 44 px; Annahme 11)                                                                   |
| Schrift unter 18 px                   | nur Türseiten und Einsicht: Anmeldung 10, Einladung 4, Zugangslink 3, Einsicht 3; Prüfseiten: Passkey 7, PIN 13, Sperre 4 |
| Schriftgrößen auf `/p` (375)          | 18 px: 1 044 · 26 px: 34 · 24 px: 5 · 20 px: 3 · 14 px: 3 Textelemente                                                    |
| Gewichte auf `/p` (375)               | 400: 519 · 600: 270 · 500: 206 · 700: 60 · 800: 34                                                                        |
| Abstände außerhalb des Rhythmus       | 6 px: 122 · 20 px: 56 · 10 px: 27                                                                                         |
| Mehr als ein Hauptknopf               | Einstellungen 3, Lebensmittel anlegen und ändern je 2                                                                     |
| Fokusring per Tabulator               | auf allen Seiten sichtbar                                                                                                 |
| axe-core (WCAG 2.2 AA, Best Practice) | `heading-order` 4×, `page-has-heading-one` 4× (je 375 und 1280)                                                           |
| Bilder je Seite                       | 1 (die Wortmarke) auf allen 80 Seiten                                                                                     |
| Tab-Titel                             | „Anmelden – Own Motion“ auf 78 von 80 Seiten                                                                              |
| Zeichen je Zeile (1280)               | höchstens 69                                                                                                              |
| Längste Seiten (375)                  | Befundbogen 2 491 px, Übungsblatt 2 165, Ernährung 1 959, Tagebuch 1 903, Ich 1 683                                       |
| Schreibende Anfragen beim Öffnen      | keine (Lesewächter hielt nichts an)                                                                                       |

## Anhang: Code-Durchsicht (Auszug)

25 Stellen mit Erklärsatz oder Fachwort gegenüber Patient:innen, je mit Fundstelle, und die
Zählungen zu Einzelanfertigungen, Zuständen, Größen und Breite stehen in
`PraxisSoftware\.tmp\design-review\lauf-1\code-befunde.md`. Die wichtigsten:

- „Anamnesebogen Version 8 (DIGOTOR)“ – `Befundbogen.tsx:274`, `Uebersicht.tsx:259`
- „Bitte geben Sie Adresse und Kennwort nicht weiter.“ – `PlattformApp.tsx:859`
- „Unten finden Sie Übersicht und Termine …“ – `Einstieg.tsx:62`
- „… öffentlichen Schlüssel des Passkeys, … nicht umkehrbare Prüfsumme.“ – `AnmeldungEinrichten.tsx:58`
- „Richten Sie später in „Mein Konto“ einen zweiten Passkey ein“ – `AnmeldungEinrichten.tsx:85`, `passkey.ts:43`
- „Grob genügt. Es geht nicht um mehr oder weniger, sondern darum, Ihre anderen Angaben richtig zu
  lesen.“ – `Checkin.tsx:153`
- „Die Datei ist im Format JSON.“ – `Datenexport.tsx:145`
- Übersicht wertet 4 von 9 Abfragen für den Fehlerzustand aus – `Uebersicht.tsx:180`
- Reiterleiste hängt die ganze Suche an (`?gesendet=1` wandert mit, im Browser nachgestellt:
  DR-160) – `PlattformApp.tsx:1159`
