# CAL-EPIC-004 — Anlegen, verschieben, verordnungsbezogen zeigen

Stand 2026-09-16 · **Loop-Vorgabe**: Eingabe für den SPEC-Schritt, kein
eigener Rang · Umsetzung noch nicht begonnen

Quelle sind Jannes' Festlegungen vom 2026-09-16, entstanden am Vergleich mit
**iPrax** (Screenshots, beschrieben in
[`../product/ideen/referenz-iprax.md`](../product/ideen/referenz-iprax.md)).
Die fachlichen Vorgaben stammen von ihm; die Reihenfolge steht in
[ROADMAP.md](ROADMAP.md) und ist für dieses Epic **noch nicht gesetzt**.
Dieses Dokument ersetzt keinen Schritt des
[Feature-Loops](GRAPH-ENGINEERING-WORKFLOW.md).

Vorbild heißt hier **Umfang, Ablauf und Informationsarchitektur** — nicht
Datenmodell, Berechtigungen, Rechtsrahmen, und keine Übernahme von Texten,
Symbolen oder Code eines fremden Produkts.

## Was schon steht

Damit nichts ein zweites Mal gebaut wird
([ARBEITSBEREICHE.md](ARBEITSBEREICHE.md)):

- **Ereignis** (CAL-015b bis CAL-017): Termin ohne Patient:in und ohne
  Verordnung, mit Bezeichnung, mehreren Beteiligten, freiem Beginn **und**
  Ende, Gruppenkennung, eigenem Bearbeiten und Absagen. Erzeugt nie eine
  abrechenbare Leistung.
- **Ziehen im Kalender** (CAL-006, UX-010): Pointer Events, am Finger nach
  langem Druck, Vorschau beim Ziehen, Schreiben erst beim Loslassen, danach
  eine Rückgängig-Leiste.
- **Terminserie aus der Verordnung** (CAL-007): Anzahl aus dem offenen
  Kontingent, drei Rhythmen, Konfliktprüfung je Zeile, alles oder nichts.
- **Terminbereich der Akte** (AKTE-003): alle Zustände, Keyset-Cursor, Filter
  auf eine Verordnung über `?verordnung=`, jeder Serientermin nennt seine
  Verordnung.
- **Patientensuche in der Kopfleiste** (UX-004): serverseitig ab drei Zeichen,
  umlautunempfindlich, höchstens 25 Treffer.

Jede Story unten baut darauf auf. Keine zweite Terminart neben dem Ereignis,
keine zweite Suche neben der Kopfleiste, keine zweite Zieh-Mechanik.

## CAL-019 — Anlegen-Menü im Kalender

Heute führt ein Tap auf freie Zeit unmittelbar in die Terminanlage (UX-005).
Künftig wird auf der freien Fläche eine **Zeitspanne aufgezogen** — am Finger
wie mit der Maus — und danach erscheint an der Auswahl ein Menü mit vier
Einträgen:

| Eintrag | Führt zu |
| --- | --- |
| **Neuer Termin** | Terminanlage, Zeit und Person aus der Auswahl |
| **Dauertermin** | Serienanlage (CAL-021) |
| **Fehlzeit** | Ereignisanlage mit Bezeichnung (CAL-020) |
| **Dauerfehlzeit** | Serie von Fehlzeiten (CAL-020) |

- Ein einzelner Tap ohne Ziehen wählt **einen Rasterpunkt** und öffnet
  dasselbe Menü; die Länge kommt dann aus der Vorbelegung der jeweiligen Art.
- Die aufgezogene Spanne rastet auf dem Praxisraster ein (CAL-005) und setzt
  Beginn **und** Ende. Für Behandlungstermine ist das seit
  `PROJECT_PRINCIPLES.md` 0.11 §8.1 zulässig (CAL-020).
- Das Menü ist mit der Tastatur erreichbar und bedienbar; die vorhandene
  Schaltfläche über dem Gitter bleibt der Weg ohne Zeigegerät.
- **Gruppentermine gehören nicht dazu** — Festlegung von Jannes am
  2026-09-16: vorerst nicht bauen.

## CAL-020 — Freie Terminlänge mit Zeichen für die Abweichung

Grundlage: `PROJECT_PRINCIPLES.md` **0.11 §8.1**. Die Längenprüfung für
Behandlungstermine entfällt; geprüft bleiben Raster, Fenstergrenzen,
Belegung und Arbeitszeit.

- **Beide Schreibwege** (`create_appointment`, `update_appointment`) nehmen
  jede Länge ab einem Rasterschritt an, solange das Ende nach dem Beginn
  liegt. Die Vorbelegung bleibt **60 Minuten**, 45 bleibt ein Schritt weit
  entfernt.
- Ein Behandlungstermin, dessen Länge **weder 45 noch 60 Minuten** beträgt,
  trägt im Kalender und in den Terminlisten ein **kleines Zeichen**. Es
  meldet eine Abweichung, es verbietet nichts, und es braucht eine
  Textfassung für Vorlesewerkzeuge („Länge weicht ab: 30 Minuten").
- **Nur Patiententermine.** Ereignisse, Fehlzeiten und Dauerfehlzeiten tragen
  das Zeichen nie — für sie gab es die Regel ohnehin nicht.
- Bestandstermine ändern sich nicht. **ANN-037** (Bestandstermin mit
  abweichender Länge als eigener Eintrag in der Dauerauswahl) wird
  gegenstandslos, sobald jede Länge zulässig ist; der SPEC schreibt sie fort
  oder löst sie auf, statt sie stehen zu lassen.
- Die Dauerauswahl aus CAL-015b wird zu einer Auswahl mit freier Eingabe. Die
  serverseitigen Tests aus CAL-010a und CAL-015b werden **umgeschrieben, nicht
  gelöscht**: Sie prüfen danach, dass eine abweichende Länge angenommen **und**
  gekennzeichnet wird.

## CAL-021 — Fehlzeit und Dauerfehlzeit

Fehlzeiten sind **Ereignisse** — dieselbe Tabelle, derselbe Zustandsautomat,
dieselben Regeln (§8.1 Absatz „keine Behandlung", §19: keine abrechenbare
Leistung). Neu sind der Einstieg aus dem Kalendermenü und die Serie.

- Eine Fehlzeit trägt eine **frei benannte Bezeichnung** („Teammeeting",
  „Achtsamkeitspuffer", „Kaffeezeit mit Kolleg:in") und erscheint als Fläche
  mit dieser Aufschrift im Gitter.
- Die Bezeichnung ist **organisatorisch**: kein klinischer Inhalt, kein
  Patientenname, keine Diagnose. Der SPEC legt fest, wo das steht und wie es
  geprüft wird (ADR-011 gilt für Logs, nicht für den Kalender selbst).
- **Dauerfehlzeit** ist eine Serie gleichartiger Fehlzeiten mit den Rhythmen
  aus CAL-007. Sie braucht eine eigene Serienkennung neben der Gruppenkennung
  aus CAL-017 — der SPEC entscheidet, ob eine Kennung beides trägt.
  Ändern und Absagen wirken wahlweise auf **diesen Termin** oder **die ganze
  Serie**; beides wird ausdrücklich beschriftet, wie schon bei
  „Ereignis bearbeiten" gegen „Teilnahme ändern".
- **Abgrenzung, damit keine dritte Stelle entsteht:** Wer grundsätzlich nicht
  arbeitet, steht in den Arbeitszeiten und ihren Ausnahmen
  (`/praxis/planung`); ein genehmigter Urlaub bleibt beim Urlaubsbereich
  (Vorschau, Spur A2). Die Fehlzeit ist die **kurzfristige Fläche im
  Kalender**, nicht die Abwesenheitsplanung.

## CAL-022 — Über das Kontingent hinaus planen, auf die Folgeverordnung übertragen

Festlegung von Jannes: Zu einer Verordnung dürfen **mehr Termine geplant**
werden, als auf ihr verschrieben sind — so funktionieren Dauertermine über
das Verordnungsende hinaus. Bei der Folgeverordnung werden die betroffenen
Termine **übertragen**.

**Die Grenze, die bleibt:** Planen ist nicht Verbrauchen.

- Die Constraint `prescription_items_used_within_prescribed`
  (`used_quantity <= prescribed_quantity`) **bleibt bestehen**. Sie schützt
  die Abrechnung (§13: „Rechnungen falsch zuordnen"), nicht den Kalender.
- Termine jenseits des Kontingents sind **geplant, aber ungedeckt**. Sie
  dürfen keine Leistung gegen diese Verordnung erzeugen (§19, ADR-009).
- Ungedeckt heißt **sichtbar**: an der Verordnung („3 von 6 gedeckt, 4 ohne
  Deckung"), am Termin selbst und in der Terminliste der Akte. Eine stille
  Überplanung wäre genau der Abrechnungsfehler, den §13 ausschließt.

**Übertragen auf eine andere Verordnung** ist ein eigener, protokollierter
Vorgang in der Akte:

- Ausgangspunkt ist die neue Verordnung („Termine aus einer früheren
  Verordnung übernehmen") **oder** die alte („Termine übertragen").
- Vorgeschlagen werden die ungedeckten künftigen Termine derselben
  Patient:in; die Auswahl ist einzeln abwählbar.
- Ziel ist eine Verordnung **derselben Patient:in** — serverseitig geprüft,
  nicht nur in der Auswahlliste.
- **Alles oder nichts**, in einer Transaktion, mit Prüfung des Kontingents der
  Zielverordnung. Ein Termin mit bereits abgerechneter Leistung wird nicht
  übertragen.
- Audit: eigenes Ereignis je Übertragung (ADR-010), ohne klinischen Inhalt.

**Überschneidung mit VER-EPIC-002.** Dort entsteht „Anzahl möglicher Termine"
als Feld und die Zusicherung, dass Kalender, Serienprüfung und Aktenübersicht
dieselbe Zahl benutzen. Läuft VER-EPIC-002 zuerst, ist diese Story eine
Erweiterung daran; läuft sie zuerst, hält VER-EPIC-002 die Deckungsanzeige
mit. Der SPEC entscheidet das anhand der dann gültigen Reihenfolge — beide
Zahlen bleiben unterscheidbar: **verschrieben**, **geplant**, **gedeckt**,
**verbraucht**.

## CAL-023 — Rückfrage beim Verschieben

- Das Loslassen schreibt nicht mehr sofort. Es erscheint eine Rückfrage mit
  **alter und neuer Zeit** im Klartext, dazu die behandelnde Person, wenn sich
  auch die Spalte ändert. Bestätigen schreibt, Abbrechen lässt die Kachel, wo
  sie war.
- Die Rückfrage kommt **immer** — auch wenn die Zielzeit frei ist.
- Liegt die Zielzeit außerhalb der Arbeitszeit, sagt **dieselbe** Rückfrage
  das zusätzlich. Keine zwei Dialoge hintereinander.
- Die **Rückgängig-Leiste bleibt** (Festlegung von Jannes am 2026-09-16). Sie
  fängt die versehentliche Bestätigung.
- Der Hinweistext unter dem Gitter wird nachgezogen: Ziehen ist weiterhin die
  Abkürzung, aber keine unmittelbare Änderung mehr.

## AKTE-006 — Termine verordnungsbezogen, Termindetails entschlackt

**Gruppierung.** Der Terminbereich der Akte zeigt Termine künftig **unter der
Überschrift ihrer Verordnung**, nicht als flache Liste mit Filter: je
Verordnung ein Abschnitt mit Bezeichnung, Ausstellungsdatum, Deckung
(CAL-022) und den Terminen darunter. Der bestehende Filter `?verordnung=`
bleibt als Weg aus dem Kalender gültig. Termine ohne Verordnung bekommen
einen eigenen, klar benannten Abschnitt — sie verschwinden nicht.

**Die Termin-Detailseite.** Jannes' Befund: Sie ist zu schwer für das, was sie
zeigt (BEF-006). An ihr hängen heute sieben Vorgänge — Absage mit Grund und
Eingangszeitpunkt, „nicht angetroffen", „Behandlung abschließen", Termin
abschließen, Dokumentation, Mitteilungsvermerk, Navigations-Handoff. Der SPEC
entscheidet **nicht**, ob die Seite hübscher wird, sondern **wohin diese
Vorgänge gehen**; keiner von ihnen darf dabei verloren gehen oder einen
Bestätigungsschritt einbüßen (ADR-018, §8). Vorschlag zur Prüfung: die Seite
bleibt der Ort der Vorgänge, wird aber aus der Akte heraus geöffnet und kehrt
dorthin zurück, während die Liste selbst die häufigen Wege direkt anbietet.

**Symbole statt Wörtern** (iPrax führt die Bereiche als Symbolleiste): nur mit
sichtbarer oder vorgelesener Beschriftung. Ein Symbol allein ist bei uns kein
Bedienelement.

## UX-013 — Die Kopfleistensuche sucht Funktionen und Bereiche

Festlegung von Jannes: Die dauerhaft sichtbare Suchleiste sucht **keine
Namen** mehr, sondern **Funktionen und Bereiche**.

- Getroffen werden Bereiche („Kalender", „Abrechnung"), Seiten („Arbeitszeiten
  und Raster") und Vorgänge („Verordnung erfassen", „Tag umplanen").
- Angeboten wird nur, was die angemeldete Rolle auch aufrufen darf. Das ist
  **Relevanz, keine Zugriffskontrolle** — die bleibt serverseitig (§4.7).
- Tastatur zuerst: Öffnen, Tippen, mit den Pfeiltasten wählen, Eingabetaste
  ausführen. Bei ~375 px nimmt die Liste den Bildschirm ein, statt zu
  überlagern.
- **Die Patientensuche zieht um** (**E17**, von Jannes bestätigt am
  2026-09-16): Sie bleibt serverseitig wie in UX-004 — ab drei Zeichen,
  umlautunempfindlich, höchstens 25 Treffer —, lebt aber im Bereich
  „Patient:innen"; die Funktionssuche führt mit dem Treffer „Patient:in
  suchen" dorthin. Der zusätzliche Schritt aus einem Termin heraus ist
  bestätigt und kein Befund.
- Die Rückwege aus UX-012b gelten unverändert: Ein Treffer merkt sich, woher
  er aufgerufen wurde, und in der Adresse steht nie ein Name (ADR-011).

## Was nicht dazugehört

- **Gruppentermine** (Jannes, 2026-09-16: vorerst nicht).
- Leistungskatalog, Preise, Rechnungsstellung — ABR-EPIC-001 und ADR-009.
- Die Abrechnungsgrundlage neben der Verordnung (Privatrezept,
  Selbstzahler-Rechnung, weitere Wege): **E16**, offen, und Voraussetzung für
  alles, was einen ungedeckten Termin am Ende **abrechnen** soll. Dieses Epic
  plant ihn nur und macht ihn sichtbar.
- Kein neuer Anbieter, kein neues Paket, keine Kalenderbibliothek (ADR-015).

## Abnahmefälle

1. Auf freier Fläche eine Spanne aufziehen, aus dem Menü „Neuer Termin"
   wählen: Beginn und Ende stehen wie gezogen, der Server nimmt eine Länge von
   30 Minuten an, und der Termin trägt danach das Abweichungszeichen — im
   Kalender, in der Tagesliste und in der Akte.
2. Denselben Termin auf 60 Minuten ändern: Das Zeichen verschwindet. Ein
   Ereignis mit 30 Minuten trägt es nie.
3. Eine Fehlzeit „Teammeeting" über 90 Minuten anlegen, dann als
   Dauerfehlzeit wöchentlich für sechs Wochen: sechs Flächen, eine Serie,
   Absage einzeln und als Serie unterscheidbar beschriftet. Keine Leistung,
   kein Abschließen, kein Dokumentieren.
4. Zu einer Verordnung mit sechs möglichen Terminen zehn Termine planen: Die
   Verordnung zeigt vier ungedeckte, die Termine tragen das Kennzeichen, und
   `used_quantity` bleibt unverändert innerhalb des Verschriebenen.
5. Eine Folgeverordnung anlegen und die vier ungedeckten Termine übertragen:
   Alles oder nichts, danach sind sie gedeckt, das Audit trägt einen Eintrag,
   und ein Termin einer anderen Patient:in lässt sich nicht als Ziel wählen.
6. Einen Termin auf eine freie Zeit ziehen: Rückfrage mit alter und neuer
   Zeit, Abbrechen lässt alles stehen, Bestätigen schreibt und zeigt die
   Rückgängig-Leiste. Dasselbe außerhalb der Arbeitszeit — eine Rückfrage,
   nicht zwei.
7. Die Akte einer Patient:in mit zwei Verordnungen öffnen: zwei Abschnitte mit
   je eigener Deckung, Termine ohne Verordnung in einem dritten. Ein Aufruf,
   ein Audit-Eintrag für den Aktenzugriff.
8. Der ganze Ablauf angemeldet bei etwa 375 px, auf Tablet und Desktop,
   einschließlich Tastaturbedienung, Zieh-Geste am Finger nach langem Druck
   und fehlgeschlagenem Speichern.

## Reihenfolge

Jannes hat die Einordnung am 2026-09-16 delegiert; sie steht seitdem in
[ROADMAP.md](ROADMAP.md), Etappe 1, und gilt von dort:

| Loop | Stories | Warum hier |
| --- | --- | --- |
| **CAL-EPIC-004a** | CAL-020, CAL-023 | Zuerst, weil `PROJECT_PRINCIPLES.md` 0.11 §8.1 heute etwas erlaubt, was der Server abweist. Eine Lücke zwischen Leitplanke und Code bleibt nicht offen liegen. Beide Stories sind klein und hängen an nichts |
| **CAL-EPIC-004b** | CAL-019, CAL-021 | Das Anlegen-Menü setzt die freie Länge voraus, sonst müsste es eine aufgezogene Spanne wieder verwerfen |
| **UX-013** | UX-013 | Hängt an nichts. Kann vorgezogen werden, wenn ein Loop Luft hat |
| **CAL-EPIC-004c** | CAL-022, AKTE-006 | Braucht **E16** und arbeitet an denselben Zahlen wie VER-EPIC-002 — deshalb danach |

## Loop und Nachführung

Pfad A, vier Loops nach der Tabelle oben. CAL-022 berührt Datenmodell und
Abrechnungsgrenze und braucht `pnpm test:db`; die übrigen kommen ohne
Migration aus. Der SPEC schneidet die Stories fein, die Roadmap bleibt die
Reihenfolge.

Der SPEC prüft und schreibt fort: **ANN-012**, **ANN-037**, **ANN-038**,
**ANN-049** sowie die Abnahmeschritte unter [`../abnahme/`](../abnahme/README.md).
