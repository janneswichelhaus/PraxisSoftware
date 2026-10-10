# Befunde an der laufenden Anwendung

Stand: 2026-10-10

## Zweck

Hier stehen **Befunde aus Sichtungen (früher Abnahmen), Screenrecordings und Reviews an der
laufenden Anwendung** — Beobachtungen an etwas, das gebaut ist, nicht Ideen
für etwas, das fehlt. Ideen gehören in `docs/product/` (Rang 6); ein Befund
gehört hierher, weil er Gebautes korrigiert.

Die Liste ist die **Eingabe für die erste Story des nächsten Loops derselben
Spur** — so verlangt es Roadmap-Regel R6 („Befunde im Folge-Loop derselben
Spur", `ROADMAP.md`, Risiken). Sie hat **keinen Rang** in der
Dokumentenhierarchie, ist **kein Auftrag** und führt **keine zweite
Reihenfolge**: Was wann gebaut wird, steht ausschließlich in `ROADMAP.md`.
Ein Befund wird verbindlich erst im SPEC-Schritt des Loops, der ihn aufnimmt.
Zu jedem offenen Befund steht in [`BEFUNDE-LOESUNGEN.md`](BEFUNDE-LOESUNGEN.md)
(Stand 2026-10-02) der heutige Codestand, die empfohlene Lösung und der
Umsetzungspfad; auch diese Analyse hat keinen Rang.

**Ablaufrunden ruhen.** Die Ablaufrunden nach [`OPTIMIERUNG.md`](OPTIMIERUNG.md)
sind bis Probewoche 1 (Roadmap H1, Feb 2027) eingefroren — Entscheidung von
Jannes vom 2026-09-13. Bis dahin werden Befunde nicht in Ablaufkarten
gemessen, sondern **hier gesammelt** und über R6 in die Loops gegeben. Was
eine Ablaufrunde später messen soll, bleibt hier als Befund stehen, bis die
Runden wieder aufgenommen werden.

## Form

Jeder Befund trägt:

| Feld    | Inhalt                                                                                   |
| ------- | ---------------------------------------------------------------------------------------- |
| Kennung | `BEF-NNN`, fortlaufend, nie wiederverwendet, nie umnummeriert                           |
| Datum   | Tag der Beobachtung                                                                      |
| Bereich | Arbeitsbereich oder Seite (`ARBEITSBEREICHE.md`)                                         |
| Quelle  | Wer hat es wie gesehen: Sichtung, Screenrecording, Review, Herkunft aus dem Ideenspeicher |
| Status  | `offen` · `eingeplant in <Loop>` · `erledigt in <Loop>`                                  |

Ein erledigter Befund zieht mit dem Loop, der ihn geschlossen hat, nach
[`archiv/BEFUNDE-ERLEDIGT.md`](archiv/BEFUNDE-ERLEDIGT.md) um — unverändert,
Kennung und Wortlaut bleiben. Hier stehen nur offene, eingeplante und teilweise
erledigte Befunde. Die nächste Kennung ist die höchste aus beiden Dateien plus
eins; `pnpm docs:check` meldet eine doppelt vergebene.
Messwerte (Pixel, Taps, Sekunden) sind Beobachtungen von Jannes selbst oder
aus dem Code — nie aus Telemetrie und nie an Mitarbeitenden (§20).

---

### BEF-010 — Ein gemeinsames Schema über zwei Lesepfade fällt keinem lokalen Gate auf

|         |                                                                                               |
| ------- | --------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-17                                                                                    |
| Bereich | Behandlungsdokumentation: Termin (`/termine/:id`) und Akte (`…/verlauf`)                       |
| Quelle  | Jannes, angemeldeter E2E-Lauf zu CAL-018; behoben in CAL-018d                                  |
| Status  | erledigt für den Einzelfall (CAL-018d), offen als Muster                                       |
| Berührt | `src/features/documentation/api.ts` (`treatmentNoteSchema`), `get_treatment_note`, `list_patient_treatment_notes` |

**Beobachtung.** CAL-018 machte `visit_without_treatment` zum Pflichtfeld des
Eintragsschemas. Dieses Schema liegt unter **zwei** Serverfunktionen;
nachgezogen war nur eine. Die Akte bekam Einträge ohne das Feld, die Prüfung
im Browser wies die ganze Seite ab, und der Behandlungsverlauf blieb leer —
in jeder Akte mit Dokumentation, nicht nur im Test.

**Warum das zählt.** Sieben lokale Gates waren grün. Die Komponententests
reichen ihre Einträge als **getippte Vorgabe** herein, und genau dort wurde
das Feld ergänzt: Der Typ stimmte, die Wirklichkeit nicht. Sichtbar wurde es
erst, wo echte Daten durch den echten Lesepfad laufen — und dieser Lauf ist in
der Cloud-Umgebung nicht möglich. Das Muster wiederholt sich bei jedem
weiteren Feld an jedem Schema, das mehr als eine Funktion bedient.

**Richtung.** Für den Einzelfall genügt der Datenbanktest aus CAL-018d, der
beide Lesepfade in einem Fall zusammenhält. Als Muster fehlt eine Prüfung, die
je Schema alle bedienenden Funktionen kennt — denkbar als Datenbanktest, der
die Schlüssel der Rückgabe gegen eine Liste hält, oder als Regel, dass ein
Schema genau einer Funktion gehört und die zweite Sicht ihr eigenes bekommt.
Entschieden ist das nicht; es gehört in den Loop, der das nächste Feld an ein
geteiltes Schema hängt.

### BEF-024 — Der Terminkontext steht in zwei Schemata

|         |                                                                                  |
| ------- | -------------------------------------------------------------------------------- |
| Datum   | 2026-09-21                                                                       |
| Bereich | Oberfläche: `src/features/appointments/api.ts`, `src/features/staff/api.ts`      |
| Quelle  | Loop CAL-027, beim Umbenennen der Bestandswerte                                  |
| Status  | offen                                                                            |
| Berührt | `futureAppointmentSchema`; nichts an der Datenbank                               |

**Beobachtung.** `appointmentKindSchema` ist als eine Quelle angelegt und wird
von den Terminschemata benutzt. `futureAppointmentSchema` in `features/staff`
zählt dieselben drei Werte stattdessen ein zweites Mal auf, statt sie zu
importieren.

**Warum das zählt.** CAL-027 hat beide Stellen anfassen müssen, und die zweite
fiel nur auf, weil ein `grep` sie fand — kein Gate hätte sie gemeldet. Ein
vierter Kontext (oder eine weitere Umbenennung) trifft dieselbe Lücke, und
dann steht in der Verwaltung der Zugänge ein Schema, das den neuen Wert
verwirft, während der Kalender ihn kennt: eine Zod-Ausnahme in einer Liste,
die mit dem Kontext gar nichts vorhat.

**Richtung.** `appointmentKindSchema` importieren statt aufzählen — eine
Zeile, gehört in den nächsten Loop, der `features/staff` ohnehin anfasst. Als
eigener Auftrag lohnt sie nicht.

### BEF-026 — B13 ist mit dem eingebauten Mailversand nicht einlösbar

|         |                                                                                       |
| ------- | ------------------------------------------------------------------------------------- |
| Datum   | 2026-09-21                                                                            |
| Bereich | Zugänge und Rollen (`/team…`), Passwort vergessen · STAFF-004, Roadmap G2             |
| Quelle  | Loop OPS-001, Providerprüfung ([`../decisions/providerpruefung-supabase.md`](../decisions/providerpruefung-supabase.md), Teil 3) |
| Status  | offen                                                                                 |
| Berührt | B13 · STAFF-004 · `ANN-025` · Roadmap G2 und G3 · Gate-Punkt 11 der Providerprüfung   |

**Beobachtung.** B13 ist am 2026-09-06 entschieden: nur die Auth-Mails des
Providers, kein zweiter Dienst. Die Providerprüfung findet dazu drei Auszüge,
die zusammen etwas anderes sagen als die Entscheidung: Der eingebaute
SMTP-Server ist „not meant for production use", er sendet **2 Mails je
Stunde**, und ohne eigenen SMTP-Server stellt Supabase Auth **nur an
vorautorisierte Adressen** zu — an das Team des Projekts. Eine angestellte
Person, die kein Mitglied des Supabase-Projekts ist, bekäme danach weder eine
Einladung noch eine Mail zum Zurücksetzen des Passworts.

**Warum das zählt.** STAFF-004 („Passwort vergessen als Selbstbedienung")
steht in Roadmap G2 und setzt genau diesen Versandweg voraus. Trifft der
Auszug zu, gibt es zwei Wege und keinen dritten: ein eigener SMTP-Anbieter —
dann ein zweiter Auftragsverarbeiter mit eigener Prüfung, eigenem ADR und
Rücknahme von B13 — oder kein Mailversand, also der Handgriff in der Praxis,
den `ANN-025` für die Anlage von Konten schon beschreibt. Beides ist eine
Entscheidung von Jannes, keine des Loops.

**Richtung.** Zuerst den **Empfängerkreis verifizieren**
(`supabase.com/docs/guides/auth/auth-smtp`, von einem ungeproxten Rechner) —
an ihm allein hängt, ob überhaupt etwas zu entscheiden ist. Fällt er so aus,
geht B13 als Vorlage mit zwei Optionen zurück an Jannes, zusammen mit den
übrigen Punkten der Providerprüfung. Vor dieser Klärung baut niemand an
STAFF-004.

### BEF-028 — Querverweise zwischen Dokumenten veralten unbemerkt

| | |
|---|---|
| Datum | 2026-09-22 |
| Bereich | Dokumentation (kein Anwendungsbereich): `docs/`, `PROJECT_PRINCIPLES.md`, `CLAUDE.md` |
| Quelle | Frage von Jannes am 2026-09-22 („haben sich Unstimmigkeiten angesammelt?"), belegt mit `grep` über 76 Markdown-Dateien |
| Status | erledigt in G19 (2026-09-22) — Gate erweitert; Nebenbefund Obergrenzen offen |
| Berührt | `scripts/docs-check.mjs`; §21 (Rangfolge), ADR-013 (CI-Gates); BEF-026/BEF-027 (Nummernkollision) |

**Beobachtung.** Dokumente behaupten etwas über andere Dokumente, und diese
Behauptungen veralten, ohne dass es auffällt. Vier Belege vom selben Tag, als
ADR-019 auf Fassung 4 stand:

| Datei | sagt |
| --- | --- |
| `MAP-LOOPS.md` | „Grundlage sind ADR-019 **Fassung 3**" |
| `ARBEITSBEREICHE.md` | „ADR-019 **Fassung 2**, angenommen 2026-09-13" |
| `abnahme/etappe-t-kartendienst.md` | „Grundlage: ADR-019 **Fassung 2**" |
| `OPEN_DECISIONS.md`, B7 | „**Fassung 2**, 2026-09-08" |

**Der erste Eintrag ist der wichtigste**: Er entstand am Morgen desselben
Tages und war zwei Stunden später überholt — geschrieben von derselben
Sitzung, die auch Fassung 4 verfasst hat. Das ist kein Nachlässigkeitsproblem,
das eine Aufräumaktion löst: Niemand hält die Querverweise von 76 Dateien im
Kopf, und eine Aufräumaktion stellt denselben Zustand nur einmal wieder her.

**Zwei weitere Formen desselben Musters.**

1. **Nummernkollision.** Am 2026-09-22 vergaben zwei parallele Sitzungen
   **BEF-026** doppelt; gefunden wurde es von Hand. Heute sind `ANN-`, `BEF-`
   und `IDEA-`-Nummern eindeutig — geprüft, aber durch Glück, nicht durch ein
   Gate.
2. **Normative Drift.** ADR-007 Punkt 6 erlaubt seit dem 2026-09-05
   Entwicklung vor der DSFA. Drei später geschriebene Stellen machten daraus
   trotzdem Startbedingungen einzelner Loops (ADR-019 Punkt 25 und 32,
   `MAP-LOOPS.md`, `OPEN_DECISIONS.md` B7). Der Widerspruch bestand
   **17 Tage** und fiel erst auf, als Jannes danach fragte. Behoben mit
   §15.2 (Version 0.15) und ADR-019 Fassung 4.

**Was das Gate heute prüft und was nicht.** `docs:check` prüft
Zeilenobergrenzen, Register-Anker und Links. Es prüft **nicht, ob eine
Aussage über ein anderes Dokument noch stimmt** — genau die Klasse, die hier
verrottet.

**Nebenbefund: drei von drei festen Obergrenzen sind voll** — `CLAUDE.md`
150/150, `STATUS.md` 60/60, `OPEN_DECISIONS.md` 400/400. (Die 1186 bei
`ASSUMPTIONS.md` zählen nicht: Diese Grenze wandert mit der Zahl der Einträge
und ist konstruktionsbedingt immer voll.) Jede Eintragung verdrängt seitdem
eine andere, und die Auswahl fällt unter Zeitdruck — am 2026-09-22 dreimal in
einer Sitzung. Das ist die Stelle, an der Genauigkeit verloren geht; entweder
steigen die Grenzen bewusst, oder Inhalt zieht tatsächlich aus.

**Vorschlag (kein Auftrag).** Nicht aufräumen, sondern messbar machen: das
Dokumentationsgate um die maschinell prüfbaren Fälle erweitern — Verweise auf
eine ADR-Fassung und auf eine Version von `PROJECT_PRINCIPLES.md` gegen den
tatsächlichen Stand, `§NN`-Verweise gegen vorhandene Abschnitte, Eindeutigkeit
der Registernummern. Historische Nennungen in Änderungsvermerken müssen dabei
erlaubt bleiben, sonst prüft das Gate die Vergangenheit falsch.

**Die inhaltliche Durchsicht ist davon getrennt** und hat ihren Zeitpunkt:
**vor dem B2-Paket**. Widersprüchliche Unterlagen erzeugen eine schlechtere
Auskunft der Datenschutzberatung, und diese Auskunft ist teuer. Vorher kosten
Widersprüche wenig — kein Nutzer, kein Produktivbetrieb, alles umkehrbar.

**Umgesetzt in G19.** `docs:check` prüft jetzt, dass genannte ADR-Fassungen,
Versionen und `§`-Abschnitte der Prinzipien existieren, dass eine als
„Grundlage“ genannte Fassung die geltende ist, und dass jede `ANN-`/`BEF-`/
`IDEA-`-Kennung einmal als Überschrift steht; Änderungsvermerke sind
ausgenommen (`scripts/docs-check-regeln.mjs`). Neun veraltete Grundlagen
korrigiert. **Grenze:** Ohne das Wort „Grundlage“ gilt eine ältere Fassung als
Herkunft — die Belege aus `ARBEITSBEREICHE.md` und `OPEN_DECISIONS.md` B7
fängt das Gate deshalb nicht; sie gehören in die Durchsicht vor B2.

### BEF-034 — Die Teamseiten fragen für trainer die zuordenbaren Personen ab

|         |                                                                                     |
| ------- | ----------------------------------------------------------------------------------- |
| Datum   | 2026-09-23                                                                          |
| Bereich | Organisatorisches → Team (`/praxis/team`, `/praxis/team/:id`)                       |
| Quelle  | Aufgefallen bei der Bestandsaufnahme für G6b Teil 1                                 |
| Status  | erledigt in UX-EPIC-002 (UX-002h, 2026-09-26); Ausgang des Lesepfads in G6b bleibt offen |
| Berührt | `src/features/staff/StaffListPage.tsx`, `src/features/staff/StaffMemberDetailPage.tsx` |

**Beobachtung.** Beide Seiten laden `list_assignable_therapists` ohne
Rollenbedingung. Für ein trainer-Konto weist die Datenbank den Aufruf ab; die
Spalte „zuordenbar" bleibt leer, die Seite lädt sonst.

**Folge für G6b.** Der Pfad behält deshalb die Ausnahme: Die Oberfläche ruft
ihn für die abgewiesene Rolle auf, ein `denied`-Eintrag stünde bei jedem
Seitenaufruf im Auditlog. **Der Weg:** `enabled: canManageAppointments(roles)`
an beiden Abfragen; danach kann der Pfad denselben Ausgang bekommen wie die
übrigen Lesepfade. Dazu, gleich gefunden: Das Menü zeigt trainer
„Arbeitszeiten" (`navigation.tsx`), die Route leitet ohne Aufruf auf `/` um.

### BEF-048 — Rahmen: Am Tablet nennt nichts den Bereich, „Abmelden“ ist das auffälligste Element der Kopfzeile, über der Akte stehen drei Navigationsebenen

|         |                                                                                                                                                                                                                                                                                                                                             |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-27                                                                                                                                                                                                                                                                                                                                  |
| Bereich | Rahmen aller Seiten: Seitenleiste und Symbolspalte (ab 640 px), Kopfzeile, Untermenü über der Akte (unter 640 px), Web-Manifest                                                                                                                                                                                                             |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390/820/1440 px, Gegenprüfung; Review-IDs NAV-06, NAV-18, PAT-09, AUTH-07                                                                                                                                                                                                                 |
| Status  | entschieden 2026-10-05 (Jannes), Option 1, dazu Variante 2b (beschriftete Symbolspalte statt Bereichsname), 1b (Abmelden als Symbol) und 4b (Rückweg-Pfeil in der Kopfkarte); gebaut in RAH-EPIC-001 (2026-10-06, Handoff `docs/design/handoff-2026-10-05-rahmen.md`): Salbei-Strich, Hover ohne Fläche, Symbolspalte 84 px beschriftet, „Abmelden“ als Symbolknopf mit „Wird abgemeldet …“, Untermenü in der Akte ausgeblendet (seit 2026-10-03) und Rückweg als Pfeil, `theme_color`/`background_color` |
| Berührt | `src/app/AppShell.tsx` (Z. 43–51, 165–194, 237, 262), `src/components/ui/buttonStile.ts` (Z. 33), `src/app/navigation.tsx` (Z. 234), `src/features/patients/PatientRecordLayout.tsx` (Z. 247–260), `index.html`, `public/manifest.webmanifest`, `src/marke.test.ts`; DS-001; ANN-109, ANN-110, ANN-113; AKTE-000, UX-002h; BEF-001, BEF-044 |

**Beobachtung.**

- **Seitenleiste am Tablet.** Zwischen 640 und 1023 px ist die Beschriftung der
  Symbolspalte unsichtbar (so in DS-001 festgelegt), es gibt keinen Tooltip, und
  der Bereichsname in der Kopfzeile steht nur unter 640 px: Bei 820 px nennt
  kein Element den Bereich. Am Tablet ohne Hover sind die Symbole auswendig zu
  deuten. Hover und Auswahl sind gleich gefüllt, und die Auswahl hebt sich mit
  1,35:1 kaum vom Tiefgrün ab.
- **Abmelden.** „Abmelden“ steht in 16 px fett in der Hauptfarbe, „Konto“ bzw.
  der Name in 14 px grau 8 px daneben. Abgemeldet wird ohne Rückfrage (außer bei
  ungesicherter Dokumentation) und ohne „Wird abgemeldet …“. Die seltenste
  Handlung zieht auf jeder Seite den Blick; ein Fehltipp am Lenker kostet eine
  Neuanmeldung mit mindestens zwölf Zeichen Kennwort.
- **Über der Akte.** Bei 390 px stehen über jedem Reiterinhalt die Kopfzeile,
  das Untermenü „Patient:innen | Verordner:innen“ (in der Akte als
  „Patient:innen“ markiert), „← Zurück zur Liste“ mit demselben Ziel, die
  Kopfkarte und die Reiterleiste. Der Inhalt beginnt je nach Länge der Hinweise
  bei 426, 538 oder 663 px; über der Tableiste bleiben 362, 250 bzw. 125 px.
- **Installierte App.** Das Web-Manifest hat weder `theme_color` noch
  `background_color`, `index.html` kein `theme-color`: Leiste und Startbild der
  installierten App tragen keine Markenfarbe.

**Frage an Jannes.** Vier kleine Gestaltungsfragen am Rahmen: (1) Soll am Tablet
ein Bereichsname sichtbar sein? (2) „Abmelden“ ruhiger oder am Handy nur noch
auf „Mein Konto“? (3) Das Untermenü in der Akte (`/patienten/:id`, auch die
Formulare) ausblenden? (4) Welche Farbe tragen Leiste und Startbild der App?

**Optionen.**

1. **Alle vier Vorschläge:** (1) an der Auswahl zusätzlich ein Salbei-Strich
   links, zwischen 640 und 1023 px der Bereichsname in der Kopfzeile, Tooltips
   an den Symbolen; (2) „Abmelden“ klein und grau wie der Kontolink, mit mehr
   Abstand und „Wird abgemeldet …“; (3) Untermenü in der Akte ausblenden —
   Rückweg und Tableiste führen zur Liste, Verordner:innen bleibt über die Liste
   erreichbar; (4) `theme_color` Weiß wie die Kopfzeile, `background_color` die
   Seitenfläche (#eceee8). Folge: Kein Recht und kein Ablauf ändert sich; der
   Reiterinhalt gewinnt am Handy 60 bis 130 px; (1) ergänzt DS-001, ohne die
   Symbolspalte zu ändern; auf der Liste bleibt die Zeile, wie ANN-113 sie für
   den Bereich Patient:innen festhält.
2. **Wie 1, aber zurückhaltender am Handy:** „Abmelden“ nur noch auf „Mein
   Konto“, und statt das Untermenü auszublenden, wandert der Rückweg in die
   Kopfkarte. Folge: noch ruhigere Kopfzeile, ein Tipp mehr zum Abmelden; das
   Untermenü bleibt, der Rückweg spart eine Zeile.
3. **Nichts ändern** (DS-001 und ANN-109 wie festgelegt). Folge: Am Tablet
   bleiben die Symbole ohne Namen; die Akte beginnt am Handy im zweiten Drittel
   des Bildschirms.

**Empfehlung.** Option 1. Ohne Entscheidung und im selben Schritt: Hover ohne
Fläche. Das helle Schema allein meldet `index.html` seit UXR-001 an (vorher
„light dark“ mit dunklen Auswahllisten auf dunkel eingestellten Handys, Review
NAV-10).

### BEF-049 — Menü und Untermenü: Die Vorschau „Kommunikation“ belegt einen Tab, Organisatorisches ist am Handy zu lang, „Arbeitszeiten“ beginnt mit Einstellungen

|         |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-27                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Bereich | Tableiste (unter 640 px), Alle Bereiche (`/bereiche`), Kopfsuche, Kommunikation (`/team`), Untermenü Organisatorisches, Arbeitszeiten (`/praxis/planung`), Radflotte (Vorschau)                                                                                                                                                                                                                                                                                                           |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390/820/1440 px, Gegenprüfung; Review-IDs NAV-07, VOR-04, VOR-09, ORG-08, ORG-06                                                                                                                                                                                                                                                                                                                                                        |
| Status  | entschieden 2026-10-05 (Jannes), Option 2; gebaut in RAH-EPIC-001 (2026-10-06): Tableiste nach Reife (ANN-244), Satz auf `/bereiche`, Vorschau-Protokoll in der Suche, „Sicherheit und Aufbewahrung“ als ein Punkt mit Reitern, Verlauf am scrollbaren Rand, „Praxiseinstellungen“ eingeklappt unter den Arbeitszeiten. Offen: „Panne melden“ und „Schlüssel entnehmen“ als Vorgänge in der Suche (FLT-EPIC-001) |
| Berührt | `src/app/navigation.tsx` (`betriebUnterpunkte`, `tableiste`), `src/app/BereichePage.tsx` (Z. 38–41), `src/app/funktionen.ts` (Z. 245–266), `src/components/ui/SubNav.tsx` (Z. 40–58), `src/features/scheduling/SchedulingPage.tsx` (Z. 122, 211, 580–603), `src/features/staff/StaffMemberDetailPage.tsx` (Z. 259–264), `tests/e2e/organisation.spec.ts` (Z. 26–28); ANN-111, ANN-112; Festlegung vom 2026-09-22 (keine neuen Vorschau-Kennzeichnungen, `ARBEITSBEREICHE.md` Abschnitt 2) |

**Beobachtung.**

- **Tableiste und Kennzeichnung.** Die Tableiste nimmt bei mehr als fünf
  Bereichen die ersten vier — für owner und office Übersicht, Kalender,
  Patienten, Nachrichten; Abrechnung und Organisatorisches liegen hinter „Mehr“.
  „Kommunikation“ ist ganz Vorschau (Teamchat ohne Versand) und trägt weder in
  Seitenleiste, Tableiste noch Kopfsuche ein Vorschau-Zeichen; die Seite sagt es
  nur im Knopf „In die Vorschau schreiben“. `/bereiche` behauptet: „Bereiche
  ohne fertige Hintergrundfunktionen sind als Vorschau gekennzeichnet.“ — die
  Liste darüber kennzeichnet keinen. Der einzige Weg zum Vorschau-Protokoll
  steht dort; therapist und team_lead haben keinen „Mehr“-Eintrag, und ab 640 px
  führt kein Menü hin.
- **Untermenü Organisatorisches.** owner hat sechs Punkte plus „Vorschau (4)“;
  bei 390 px sind nur Mitarbeitende, Arbeitszeiten und Textbausteine ganz zu
  sehen, der Rest liegt rechts außerhalb, ohne Verlauf oder Pfeil — auf den
  Sicherheitsseiten auch der aktive Punkt selbst. Das beantwortet die offene
  Frage aus ANN-112 mit einer Messung: Auch eingeklappt ist die Leiste für owner
  zu lang.
- **Pannenweg.** „Panne melden“ liegt vier (therapist) bzw. fünf Tipps (owner,
  office) tief; die Kopfsuche findet „Panne“ nicht.
- **Arbeitszeiten.** Für owner stehen Praxisraster, Frist der automatischen
  Finalisierung und Startort der Touren als offene Karten mit eigenen
  Hauptknöpfen vor den Arbeitszeiten; „Behandelnde Person“ beginnt bei 1 610 px
  (390), 1 361 px (820) und 1 314 px (1440). Der Weg „Arbeitszeiten“ aus dem
  Mitarbeiterdatensatz landet beim Minutenraster, und die Dokumentationsfrist
  sucht unter „Arbeitszeiten“ niemand.

**Frage an Jannes.** (1) Wie weit sollen Vorschauen aus der Navigation
zurücktreten — bis ganz aus dem Menü (die offene Frage aus ANN-112)? (2) Wohin
gehören Raster, Frist und Startort?

**Optionen.**

1. **Nur berichtigen:** den Satz auf `/bereiche` an den Stand anpassen (etwa
   „Vorschauen — im Untermenü so bezeichnet — und die Kommunikation speichern
   nichts; was dort simuliert wurde, steht im Vorschau-Protokoll.“), von dort
   und aus der Suche ein Weg zum Vorschau-Protokoll für alle Rollen;
   Arbeitszeiten zuerst, Raster, Frist und Startort darunter eingeklappt als
   „Praxiseinstellungen“. Folge: kleinste Änderung; ein Daumenziel führt weiter
   in einen Chat ohne Versand, das Untermenü bleibt am Handy zu lang.
2. **Wie 1, dazu Reife vor Reihenfolge:** Die Tableiste überspringt Bereiche,
   die ganz Vorschau sind — owner und office sehen Übersicht, Kalender,
   Patienten, Abrechnung, Mehr; Sicherheit und Aufbewahrung werden ein Punkt;
   „Panne melden“ und „Schlüssel entnehmen“ findet die Suche als Vorgänge.
   Folge: Abrechnung mit einem Tipp, ein kürzeres Untermenü; die sechs Bereiche
   und ihre Reihenfolge in der Seitenleiste bleiben, und es entsteht keine neue
   Vorschau-Kennzeichnung.
3. **Vorschauen ganz aus dem Menü,** erreichbar nur über „Alle Bereiche“ und die
   Suche. Folge: das kürzeste Menü; wer eine Vorschau zeigen will, muss sie
   suchen.

**Empfehlung.** Option 2, Raster, Frist und Startort eingeklappt unter den
Arbeitszeiten (kein neuer Menüpunkt, das Untermenü soll kürzer werden). Ein
Vorschau-Zeichen an „Kommunikation“ empfiehlt dieser Befund bewusst nicht: Nach
deiner Festlegung vom 2026-09-22 entsteht eine Kennzeichnung nicht neu
(`ARBEITSBEREICHE.md` Abschnitt 2); der Satz auf `/bereiche` wird deshalb an den
Stand angepasst, nicht die Bereiche an den Satz. Den aktiven Punkt rollt das
Untermenü seit UXR-001 ins Bild (Review VOR-05, UIK-10); ohne Entscheidung
offen bleibt ein Verlauf am scrollbaren Rand; die E2E-Prüfung soll Sichtbarkeit prüfen statt
zu klicken. Den Pannenweg mit einem Tipp von der Übersicht baut FLT-EPIC-001.

### BEF-050 — Jede Seite heißt im Browser-Tab „Own Motion“

|         |                                                                                                                                                             |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-27                                                                                                                                                  |
| Bereich | Alle Seiten: Titel im Browser-Tab, Verlauf und Lesezeichen; Ansage der Vorlesesoftware beim Seitenwechsel                                                   |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390/820/1440 px, Gegenprüfung; Review-ID UIK-12                                                           |
| Status  | entschieden 2026-10-05 (Jannes), Option 1; gebaut in RAH-EPIC-001 (2026-10-06): ein Titel je Route in `src/app/tabtitel.ts`, „Anmelden – Own Motion“ außerhalb des Rahmens, Test „trägt nie Daten“ (ANN-245) |
| Berührt | `index.html` (Z. 49), `src/components/ui/PageHeader.tsx`, `src/app/AppShell.tsx`; ADR-011; ADR-013 Punkt 9 (externer Datenfluss; Checkliste Nr. 5); ANN-023 |

**Beobachtung.** In allen Aufnahmen der laufenden Anwendung — über 1 100 — heißt
die Seite „Own Motion“: Übersicht, Akte, Kalender und Rechnung gleich. Gesetzt
wird der Titel nur in `index.html`; beim Seitenwechsel ändern sich weder Titel
noch Fokus. Vorlesesoftware sagt einen Seitenwechsel deshalb nicht an, und im
Büro heißen alle Tabs, Verlaufseinträge und Lesezeichen gleich — die richtige
Seite findet man nur durch Anklicken. Die Seitentitel selbst taugen nicht als
Quelle: Sie tragen Namen („Termin – Max Mustermann“, „Guten Morgen, Anna“), und
ein Tab-Titel landet in Verlauf, Lesezeichen und Browser-Synchronisation.

**Frage an Jannes.** Welche Titel tragen die Tabs? Fest steht nur: nie ein Name,
nie ein klinischer Inhalt.

**Optionen.**

1. **Seitenart und Marke:** „Kalender – Own Motion“, „Akte – Own Motion“,
   „Termin – Own Motion“, „Rechnung – Own Motion“, fest je Route und nie aus dem
   Seitentitel abgeleitet; Vollseiten mit eigenem Titel („Anmelden – Own
   Motion“); nach dem Seitenwechsel springt der Fokus auf den Inhalt. Folge:
   unterscheidbare Tabs und eine Ansage beim Seitenwechsel; ein Test hält fest,
   dass kein Titel Daten aus einer Abfrage enthält.
2. **Mit Bereich:** „Rechnungen – Abrechnung – Own Motion“. Folge: genauer, aber
   länger; im Tab ist meist nur der Anfang zu sehen.
3. **Mit Namen:** „Max Mustermann – Akte“. Folge: am bequemsten, aber Namen
   stünden im Browserverlauf und womöglich in der Synchronisation eines privaten
   Kontos — ein externer Datenfluss, den ADR-013 Punkt 9 für die Adresszeile
   schon ausschließt.

**Empfehlung.** Option 1; die Titelliste legst du fest, der Loop setzt sie mit
einem Titel je Route. „Own Motion“ bleibt als Zusatz, wie ANN-023 es für die
Marke vorsieht.

### BEF-052 — Gedruckte Blätter: Die Übersicht druckt ohne Rufnummern und spätere Besuche; Aufnahmeblätter und Terminzettel tragen keinen Absender

|         |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-27                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Bereich | Übersicht (`/`, Browserdruck als Papierweg); Aufnahmeblätter (`/patienten/:id/aufnahmeblaetter`); Terminzettel (`/patienten/:id/terminzettel`)                                                                                                                                                                                                                                                                                                                                                                                                 |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390 und 1440 px, Gegenprüfung; Review-IDs UEB-01, UEB-09, TER-19                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Status  | entschieden 2026-10-09 (Jannes); eingeplant in UX-EPIC-009                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Berührt | `src/index.css` (Druck-Basis, Z. 255–260), `src/features/today/MyDayPage.tsx` (Z. 326–347, 461–464), `src/features/today/Tagesliste.tsx` (Z. 118), `src/components/ui/buttonStile.ts` (Z. 53), `src/features/datenschutz/AufnahmeblaetterPage.tsx` (Z. 25–53), `src/features/datenschutz/patienteninformation.ts` (Z. 37), `src/features/appointments/AppointmentSlipPage.tsx` (Z. 39–42, 144–152), `tests/e2e/bericht.spec.ts` (Muster für einen Drucktest); ANN-021, ANN-039, ANN-041, ANN-123; ADR-012 Punkt 8 und 9; `marke/README.md`; B2 |

**Beobachtung.**

- **Übersicht als Papierweg.** ANN-021 macht den Browserdruck der Übersicht zum
  Papierweg für den Ausfall (ADR-012 Punkt 9). Die Druck-Basis blendet
  Kopfbereiche und Knöpfe aus. Datum und Name druckt der Seitenkopf seit UXR-001
  mit; es fehlen aber jede Rufnummer (sie ist ein Kartenknopf) und jeder
  Besuch ab dem dritten (er steht im zugeklappten „Weitere offene heute“); dafür
  stehen „Termin öffnen →“ und leere Aufklapper-Überschriften darauf. Belegt mit
  einem PDF aus der laufenden Anwendung (therapist, 390 px): keine der fünf
  Rufnummern, ein Besuch fehlt. Der Hinweis auf der Seite verspricht weiter
  „Anschrift, Rufnummer“.
- **Aufnahmeblätter.** Das Blatt für Patient:innen nennt als Praxis nur den
  Organisationsnamen und bittet, sich „persönlich, telefonisch oder schriftlich“
  an die Praxis zu wenden — Anschrift, Telefon und E-Mail stehen nicht darauf.
  Art. 13 Abs. 1 lit. a DSGVO verlangt die Kontaktdaten des Verantwortlichen.
- **Terminzettel.** Name, Termine und „Bitte sagen Sie einen Termin rechtzeitig
  ab …“ — Praxis und Telefon fehlen, Praxistermine nennen nur den internen
  Standortnamen. Eine zu späte Absage kann ein Ausfallhonorar auslösen. Der
  Kommentar im Code vertröstet auf die Praxis-Stammdaten aus ABR-000; die gibt
  es inzwischen, mit Feld Telefon.

**Frage an Jannes.** (1) Was muss auf dem Papier der Übersicht stehen, damit es
im Ausfall trägt — alle eigenen Besuche mit Anschrift und Rufnummer? (2) Sollen
Aufnahmeblätter und Terminzettel einen Absender aus den Praxis-Stammdaten
tragen, auch wenn therapist sie druckt?

**Optionen.**

1. **Vollständig:** Datum und Name als eigene Druckzeile, Rufnummern zusätzlich
   als Text, „Weitere offene heute“ beim Drucken aufgeklappt, Links und leere
   Überschriften weg. Auf beiden Patientenblättern ein Absender (Name,
   Anschrift, Telefon, E-Mail; beim Praxistermin die Standortanschrift) über
   eine Projektion nach dem Muster ANN-123, ohne Wortmarke. Folge: Das Papier
   trägt im Ausfall und nennt den Verantwortlichen; therapist liest über die
   Projektion die Briefkopffelder — dieselbe Öffnung wie beim Bericht (ANN-123),
   Teil der Prüfung B2; Projektion und Rollenschnitt gehen durch den kritischen
   Pfad.
2. **Übersicht knapp:** Datum, Uhrzeit, Name und Rufnummer, aber keine
   Anschriften — ANN-021 nennt ein Papier mit den Anschriften eines Tages einen
   Datenabfluss ohne Löschfrist. Absender wie 1. Folge: weniger auf Papier; im
   Ausfall fehlt die Anschrift, die man für den Weg braucht.
3. **Druck als ungeeignet kennzeichnen** und den Papierweg neu lösen. Folge:
   ADR-012 Punkt 9 ist dann wieder offen.

**Empfehlung.** Option 1, mit einem Drucktest je Blatt. Ein Blatt ohne Rufnummer
und Anschrift hilft im Ausfall nicht, und es enthält nur die eigenen Besuche
eines Tages — dieselben Angaben, die ohnehin auf dem Handy stehen. ANN-021 wird
damit fortgeschrieben: Die Anschriften stehen dann ausdrücklich auf dem Papier.

**Entscheidung (Jannes, 2026-10-09).** Option 1: Die Übersicht druckt alle eigenen Besuche des Tages mit Anschrift und Rufnummer (ANN-021 wird fortgeschrieben); Aufnahmeblatt und Terminzettel tragen einen Absender aus den Praxis-Stammdaten.

### BEF-055 — Am Termin schließt „Finalisieren“ einen offenen Besuch mit ab, ohne es zu sagen; dazu drei ähnliche Abschlusswege und zwei Hauptknöpfe

|         |                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-27                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Bereich | Termin (`/termine/:id`): geführter Ablauf „Was ist passiert?“, Abschnitt Behandlungsdokumentation; Schreibseiten der Dokumentation                                                                                                                                                                                                                                                                                                                                         |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390 px, Gegenprüfung; Review-IDs DOK-04, TER-02, dazu DOK-02                                                                                                                                                                                                                                                                                                                                                             |
| Status  | entschieden 2026-10-09 (Jannes); eingeplant in UX-EPIC-007 |
| Berührt | `src/features/documentation/TreatmentNoteSection.tsx` (Z. 103–166, 224), `src/features/appointments/AppointmentDetailPage.tsx` (Z. 637–653, 770, 874, 1013–1050), `src/features/documentation/TreatmentNotePage.tsx` (Z. 168), `src/features/documentation/TreatmentNoteAddendumPage.tsx` (Z. 103), `app.mark_appointment_documented()` (Migration `20260912130000_appointment_documented.sql`); ADR-016 Punkt 4 und 7; ADR-018 Punkt 2 und 9; ANN-036; BEF-006 (AKTE-006) |

**Beobachtung.**

- **Finalisieren.** Steht zu einem Termin ein Entwurf, zeigt der Abschnitt
  „Finalisieren“ als Hauptknopf — auch am noch offenen Termin. Die Rückfrage
  sagt nur, dass der Wortlaut als Version 1 festgeschrieben wird. Die
  Finalisierung setzt den Termin aber auf „dokumentiert“ samt Abschlusszeit
  (ADR-018 Fassung 3, aus ANN-036) — derselbe Doppelschritt, den „Behandlung
  abschließen“ ausdrücklich ansagt („Mit dem Abschluss geschieht zweierlei …“).
  Am Hausbesuch umgeht das „Was ist passiert?“: „Tür geöffnet, nicht behandelt“
  (Pflichtvermerk) und „nicht angetroffen“ (Gebührenanlass) sind danach nicht
  mehr wählbar. Die Rückfrage ist eigens gebaut, der Fokus bleibt auf dem
  Auslöser. Live nachgestellt (390 px, Hausbesuch mit Entwurf). Dasselbe löst
  die automatische Finalisierung zum Fristende aus — dass es sie gibt, sagt die
  Schreibseite nicht; dort steht „Der Eintrag bleibt ein Entwurf; die
  Finalisierung ist ein eigener Schritt am Termin.“ (Review DOK-02).
- **Abschlusswege.** Am Hausbesuch sehen Behandelnde „Dokumentieren und
  abschließen“ (Hauptknopf), „Ohne Behandlung abschließen“, „Niemand
  angetroffen“, darunter „Ohne Dokumentation abschließen“ und im Doku-Abschnitt
  einen zweiten Hauptknopf („Dokumentation anlegen“ bzw. „Finalisieren“). „Ohne
  Behandlung“ und „Ohne Dokumentation“ klingen gleich und haben verschiedene
  Folgen. office und owner ohne Doku-Recht sehen die ersten beiden Szenarien
  ohne Knopf; ihr „Termin abschließen“ steht erst unter der Liste. Der geführte
  Ablauf beginnt bei 390 px erst unter der achtzeiligen Detailtabelle, bei rund
  1 000 px.

**Frage an Jannes.** (1) Darf am offenen Hausbesuch „Finalisieren“ angeboten
werden, oder führt der Weg dort immer über „Was ist passiert?“? (2) Wie heißen
und ordnen sich die Abschlusswege — als Eingabe für AKTE-006 (BEF-006)?

**Optionen.**

1. **Nur die Folge nennen:** Rückfrage-Baustein statt Eigenbau, und am offenen
   Termin der Satz „Der Termin wird dabei als durchgeführt geführt.“ Folge: Die
   Folge steht da (ADR-016 Punkt 4); am Hausbesuch bleibt der Umweg um die drei
   Szenarien möglich.
2. **Am offenen Hausbesuch kein „Finalisieren“,** stattdessen der Verweis auf
   „Was ist passiert?“ bzw. den Abschluss; an Praxisterminen wie 1. Folge: Die
   drei Szenarien aus ADR-018 Punkt 9 lassen sich am Knopf nicht mehr umgehen —
   über die automatische Finalisierung zum Fristende weiterhin.
3. **Wie 2, dazu die Abschlusswege ordnen:** ein Hauptknopf je Ansicht (der
   Doku-Abschnitt nachrangig, solange oben der Abschluss steht), „Ohne
   Dokumentation abschließen“ als „Nur Termin abschließen“ benannt und
   eingeklappt, für Rollen ohne Doku-Recht „Termin abschließen“ mit ehrlicher
   Folge im Szenario, der geführte Ablauf vor der Detailtabelle. Folge: Das ist
   der Zuschnitt aus BEF-006, jetzt mit Messwerten.

**Empfehlung.** Option 3 — den Teil aus 1 sofort, den Rest mit AKTE-006. Den
Hinweis auf die automatische Finalisierung an den Schreibseiten gleich mitnehmen
(„spätestens automatisch mit Ablauf der Dokumentationsfrist der Praxis“); ein
konkretes Datum am Eintrag bräuchte einen geänderten Lesepfad und bliebe eine
eigene Entscheidung.

**Entscheidung (Jannes, 2026-10-09).** Option 3: Am offenen Hausbesuch kein „Finalisieren“, sondern „Was ist passiert?“; je Ansicht ein Hauptknopf, „Nur Termin abschließen“ eingeklappt.

### BEF-056 — Ungesicherter Text: kein Zwischenstand ohne Verlassen, kein Ausweg im Konfliktfall, Nachtrag festschreiben nur über den Termin

|         |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-27                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Bereich | Behandlungsdokumentation (Abschluss, Entwurf, Nachtrag, Korrektur), Therapiebericht, Erhebung (`/patienten/:id/befund/erheben`)                                                                                                                                                                                                                                                                                                                                                              |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390 px, Gegenprüfung; Review-IDs DOK-06, BEF-10, DOK-07, DOK-17                                                                                                                                                                                                                                                                                                                                                                            |
| Status  | entschieden 2026-10-09 (Jannes); eingeplant in UX-EPIC-007                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Berührt | `src/features/documentation/Textverlustschutz.tsx` (Z. 31, 112–124, 223), `src/features/documentation/api.ts` (Z. 140–174, 306), `src/features/therapy-reports/api.ts` (Z. 140), `src/features/assessments/ErhebungPage.tsx` (Z. 277–343), `src/features/documentation/TreatmentNoteAddendumPage.tsx` (Z. 91–119), `src/features/documentation/TreatmentNotePage.tsx` (Z. 147–164); ADR-001, ADR-015, ADR-016 Punkt 4, 6, 7 und 9; ANN-015, ANN-046, ANN-120; Oberflächen-Checkliste Punkt 5 |

**Beobachtung.**

- **iPhone.** Beim Neuladen und Schließen verlässt sich der Textverlustschutz
  auf `beforeunload`. Safari auf iOS zeigt dafür nach bekanntem Verhalten keine
  Rückfrage (am Gerät zu bestätigen, hier nicht prüfbar); Wegwischen der App
  oder das Verdrängen im Hintergrund beendet jede Seite still. Ein lokaler
  Zwischenspeicher ist ausgeschlossen (ANN-015, ADR-015) — der Schutz endet
  dort, wo unterwegs am meisten passiert.
- **Erhebung.** Datum, „Abschließen“ und „Als Entwurf speichern“ stehen nur nach
  der letzten Frage (Bogenhöhe 11 315 px), und beide Wege verlassen den Bogen.
  Einen Zwischenstand, ohne den Bogen zu verlassen, gibt es nicht.
- **Konfliktfall.** Die Meldungen raten „Bitte den eigenen Text sichern, die
  Ansicht neu laden …“. Neuladen verwirft den Text; „sichern“ geht am Handy nur
  über Kopieren in die Zwischenablage, die ANN-120 für Gesundheitsdaten meidet.
  Ist der Entwurf inzwischen automatisch finalisiert, lehnt der Server jedes
  Speichern ab; die Rückfrage bietet „Speichern“, das wieder scheitert, sonst
  nur „Verwerfen“. Am Code belegt, nicht nachgestellt (verlangt eine
  Datenänderung).
- **Nachtrag.** Festschreiben geht nur über den Termin: speichern, Termin
  öffnen, zum Abschnitt scrollen, „Finalisieren“, „Ja, jetzt finalisieren“. Beim
  Anlegen fehlt die Bausteinleiste, beim Bearbeiten der Ursprungseintrag. Bleibt
  ein Nachtrag liegen, wird er zum Fristende ungeprüft festgeschrieben (ADR-016
  Punkt 7).

**Frage an Jannes.** (1) Soll ein Entwurf während des Schreibens auf dem Server
gesichert werden, ohne die Seite zu verlassen — auf Knopfdruck oder von selbst?
(2) Soll der Konfliktfall den getippten Text als Nachtrag oder Korrektur
übernehmen können, und soll ein Nachtrag auf seiner eigenen Seite
festgeschrieben werden?

**Optionen.**

1. **Auf Knopfdruck:** „Zwischenstand sichern“ auf Dokumentation, Bericht und
   Erhebung, die Seite bleibt offen, mit Statusmeldung „Als Entwurf gesichert um
   10:42“ (in der Erhebung dazu „23 von 46 beantwortet“ in einer schmalen Leiste
   am unteren Rand). Folge: Verloren gehen kann nur, was nach dem letzten Tipp
   kam; am iPhone hilft es nur, wenn man daran denkt.
2. **Von selbst:** nach einer Pause im Tippen als Entwurf sichern — nur der
   eigene Text, nie ein offener Bausteinvorschlag (ANN-120) —, mit sichtbarem
   Stand. Folge: Der Schutz greift auch am iPhone; Entwürfe entstehen früher und
   laufen früher in die Frist (ADR-016 Punkt 7), es gibt mehr Auditeinträge
   (Punkt 9); ANN-046 („Speichern heißt Entwurf“) wird fortgeschrieben.
3. **Erst messen:** bis zum ersten Feldtag nichts ändern (Wiedervorlage von
   ANN-046) und am iPhone prüfen, ob `beforeunload` wirklich schweigt. Folge:
   Bis dahin bleibt der stille Verlust am iPhone möglich.

Zu (2), unabhängig davon: im Konfliktfall „Als Nachtrag übernehmen“ bzw. „In
Korrektur übernehmen“ mit dem Feldinhalt (ADR-016 Punkt 6), und „Nachtrag
festschreiben“ auf der Nachtragsseite mit dem Folgesatz über dem Knopf (Muster
ADR-016 Punkt 4). Folge: Der Text findet immer einen Weg in die Akte; beides ist
ein neuer Serverweg zur Finalisierung und deshalb nie nebenbei.

**Empfehlung.** Zu (1) Option 2, abgesichert durch die Messung aus 3: Zeigt das
iPhone die Rückfrage doch, reicht Option 1. Zu (2) beides. Ein Loop im
kritischen Pfad. Ohne Entscheidung und sofort: kein „neu laden“, solange Text im
Feld steht; beim Terminkonflikt auf „Nur als Entwurf speichern“ verweisen;
Bausteinleiste auch beim Anlegen eines Nachtrags; Ursprung beim Bearbeiten
zugeklappt. Davon getrennt, ebenfalls ohne Entscheidung: Der Therapiebericht und
mehrere Formulare haben gar keinen Schutz vor Verlust (Review ZST-02, NAV-01).

**Entscheidung (Jannes, 2026-10-09).** Zu (1) Option 2: Der eigene Text wird nach einer Pause im Tippen von selbst als Entwurf gesichert, mit sichtbarem Stand (ANN-046 wird fortgeschrieben). Zu (2) beides: Übernahme in Nachtrag oder Korrektur im Konfliktfall, Nachtrag auf seiner eigenen Seite festschreiben.

### BEF-058 — Der Fotobereich steht vor dem Behandlungsverlauf, auch ohne Einwilligung und ohne Fotos

|         |                                                                                                                                                                                                                                                                                                   |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-27                                                                                                                                                                                                                                                                                        |
| Bereich | Akte → Verlauf (`/patienten/:id/verlauf`), Einstieg „Bisherige Doku“ auf der Tageskarte der Übersicht                                                                                                                                                                                             |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390 und 820 px, Gegenprüfung; Review-IDs DAT-16, DOK-16                                                                                                                                                                                         |
| Status  | entschieden 2026-10-09 (Jannes); eingeplant in UX-EPIC-007                                                                                                                                                                                                                                                                                             |
| Berührt | `src/features/documentation/PatientCoursePage.tsx` (Z. 17–21), `src/features/files/FotosImVerlauf.tsx` (Z. 485–563), `src/features/documentation/PatientRecordDocumentation.tsx` (Z. 159–166), `src/features/today/MyDayPage.tsx` (Z. 243); DOK-006; UX-EPIC-003; Oberflächen-Checkliste Punkt 11 |

**Beobachtung.** Die Seite stellt „Patientenfotos“ vor die Dokumentation (so
gebaut in DOK-006) und zeigt den Abschnitt immer ganz: Titel, dreizeiliger
Hinweis, Einwilligungsstand, bei null Fotos ein Leerzustand mit großem
Innenabstand und das Kleingedruckte. Ohne Einwilligung und ohne Fotos belegt er
bei 390 px rund 420 px. Mit Rückweg, Aktenkopf und Bereichsleiste beginnt der
erste Termin in einer gefüllten Akte erst bei rund 1 130 px; bei langem
Aktenkopf beginnen schon die Fotos erst bei rund 670 px. Genau hierher führt
„Bisherige Doku“ auf der Tageskarte — der Weg, der vor der Tür mit einem Tipp
zur letzten Behandlung führen soll (UX-EPIC-003).

**Frage an Jannes.** Soll der Verlauf mit den jüngsten Einträgen beginnen und
die Fotos danach oder zugeklappt zeigen?

**Optionen.**

1. **Reihenfolge bleibt, Umfang schrumpft:** ohne Fotos eine Zeile („Fotos:
   keine · Einwilligung nicht vermerkt“, bei erteilter Einwilligung „Foto
   aufnehmen“ daneben), mit Fotos „Fotos (3)“ zum Aufklappen, nach einer
   Aufnahme offen; das Kleingedruckte in den Hinweis. Folge: Die Festlegung aus
   DOK-006 bleibt, der erste Eintrag rückt um rund 350 px nach oben.
2. **Fotos unter die jüngsten Einträge.** Folge: Die Dokumentation steht nach
   einem Tipp oben; ändert die Reihenfolge aus DOK-006.
3. **„Bisherige Doku“ springt direkt zum ersten Eintrag** (Anker), die Seite
   bleibt. Folge: Nur der Weg aus der Übersicht wird kurz; wer die Akte über die
   Reiter öffnet, scrollt weiter.

**Empfehlung.** Option 1 zusammen mit dem Anker aus 3 — beides ändert keine
Festlegung, und der erste Eintrag steht bei 390 px wieder im ersten oder zweiten
Bildschirm. Nach der Umsetzung neu messen.

**Entscheidung (Jannes, 2026-10-09).** Option 1 mit dem Anker aus Option 3: ohne Fotos eine Zeile, mit Fotos „Fotos (n)“ zum Aufklappen; „Bisherige Doku“ springt zum ersten Eintrag. Seit BEF-135 gibt es keine Einwilligungsfotos mehr, die Zeile nennt deshalb keine Einwilligung.

### BEF-059 — Dateien: „Öffnen“ lädt herunter, die Art ist mit „Befund“ vorbelegt, und die vorgeschlagenen Namen unterscheiden nichts

|         |                                                                                                                                                                                                                                                                                                                                  |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-27                                                                                                                                                                                                                                                                                                                       |
| Bereich | Akte → Dateien (`/patienten/:id/dateien`); Behandlungsgrundlagen → „Scan des Rezepts“; Verlauf → Fotos                                                                                                                                                                                                                           |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390 px, Gegenprüfung; Review-IDs DAT-02, DAT-07, DAT-18                                                                                                                                                                                                                        |
| Status  | entschieden 2026-10-09 (Jannes); eingeplant in UX-EPIC-007 |
| Berührt | `src/features/files/api.ts` (Z. 235–237), `src/features/files/Dateiliste.tsx` (Z. 64, 100, 126, 213, 362–400), `src/features/files/dokumentarten.ts` (Z. 77–78), `src/features/files/kamera.ts` (Z. 16–22), `src/features/files/FotosImVerlauf.tsx` (Z. 160, 190); ADR-017 Punkt 12, 15, 17, 19 und 40; ANN-129; ADR-013 Punkt 9 |

**Beobachtung.**

- **Öffnen.** Der Verweis wird mit dem Anzeigenamen als Downloadnamen signiert
  (ADR-017 Punkt 15), die Antwort kommt als Anhang. Am iPhone erscheint statt
  des Rezepts eine Download-Rückfrage, und die Datei liegt danach in
  „Downloads“, womöglich in iCloud Drive — genau das, was ADR-017 Punkt 40 für
  Fotos ausschließt; Punkt 19 sieht für alle Dateien die Anzeige „im eigenen
  Rahmen der Anwendung“ vor. Das Fenster öffnet sich erst nach zwei
  Serveraufrufen, mit `noopener`; ein Popup-Blocker bliebe unbemerkt, der
  Zugriff wäre trotzdem protokolliert. Der Knopf heißt „Öffnen“. Nicht ausgelöst
  (jedes Öffnen schreibt einen Auditeintrag).
- **Vorbelegte Art.** Ohne Kontext wählt das Formular die erste Art: für
  behandelnde Rollen „Befund“, für office „Einwilligung“. Wer nur die Datei
  wählt und „Datei hinzufügen“ tippt, legt sie still als Befund ab — die Art
  bestimmt, wer löschen darf, und ist nach ADR-017 eine Sichtbarkeitsgrenze;
  vorbelegt werden soll nur „aus dem Kontext“. Der artabhängige Hinweis steht
  zwischen Beschriftung und Auswahl und lässt das Feld bei jedem Wechsel
  springen (40 px bei 390 px).
- **Namen.** Der Anzeigename wird mit dem rohen Dateinamen vorbelegt (etwa
  `IMG_4711.jpg`), Kamerafotos heißen „Foto vom 27.09.2026“ — zwei Aufnahmen
  eines Tages tragen denselben Namen. Ohne Vorschaubilder (Punkt 40) ist der
  Name das einzige Merkmal; wer das richtige Foto sucht, öffnet mehrere, und
  jedes Öffnen ist ein Auditeintrag.

**Frage an Jannes.** (1) Soll „Öffnen“ eine Datei in der Anwendung zeigen statt
herunterzuladen? Das braucht eine neue Fassung von ADR-017 Punkt 15. (2) Soll
die Dokumentart ohne Vorauswahl starten? (3) Welches Namensschema?

**Optionen.**

- Zu (1):
  - **a) Download bleibt,** der Knopf heißt ehrlich „Herunterladen“. Folge:
    keine ADR-Änderung; Gesundheitsdaten landen weiter im Download-Ordner des
    Geräts.
  - **b) Anzeigen im eigenen Rahmen** wie bei Patientenfotos (in den Speicher
    der Seite laden, `no-store`, PDF und Bild), „Herunterladen“ als eigener,
    ebenso protokollierter Schritt für den Versand außerhalb der Anwendung
    (Punkt 17). Folge: neue Fassung von ADR-017 für Punkt 15; der Anzeigeweg aus
    Punkt 40 ist schon gebaut.
  - **c) Nur anzeigen, kein Download.** Folge: wie bei Fotos; ein Befund für die
    Ärzt:in ließe sich dann nur noch drucken.
- Zu (2): **a)** wie heute; **b)** leere Option „Bitte wählen …“, „Datei
  hinzufügen“ erst mit gewählter Art — wie die Seitenwahl ohne Vorauswahl
  (ANN-129). Folge von b: ein Tipp mehr, keine still falsch eingeordnete Datei.
- Zu (3): **a)** in „Dateien“ „‹Art› vom ‹Datum›“ ohne Endung vorschlagen, Fotos
  mit Uhrzeit („Foto vom 27.09.2026, 10:42“), den Verordnungsscan mit seinem
  Verordnungsdatum zeigen; **b)** die Körperregion als Pflichtangabe am Foto.
  Folge von b: aussagekräftiger, aber eine Eingabe mehr je Aufnahme.

**Empfehlung.** (1) b, (2) b, (3) a. Für (1) eine Docs-Session zu ADR-017 vor
dem nächsten Loop an den Dateien, weil es vor der ersten echten Datei geklärt
sein muss; der Rest im selben Loop. Unabhängig davon am echten iPhone prüfen, ob
das Fenster nach zwei Serveraufrufen blockiert wird. Ohne Entscheidung: an den
Namensfeldern kein Autofill, Enter löst Hinzufügen bzw. Speichern aus; der
gleichbleibende Satz „sichtbar für alle Praxisrollen“ entfällt, die artabhängige
Erläuterung steht unter der Auswahl.

**Entscheidung (Jannes, 2026-10-09).** (1) entschieden über ANN-223 (BEF-133). (2) b: Dokumentart ohne Vorauswahl, Hinzufügen erst mit gewählter Art. (3) a: Namensvorschlag „‹Art› vom ‹Datum›“, Fotos mit Uhrzeit.

### BEF-060 — Behandlungsgrundlage: Bauart mit „Erstverordnung“ vorbelegt, Karte ohne Hauptaktion, Kontakt der Verordner:innen nur im Formular

|         |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-27                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Bereich | Akte → Behandlungsgrundlagen (`/patienten/:id/verordnungen`), Grundlage erfassen und bearbeiten; Verordner:innen (`/verordner`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390 und 1440 px, Gegenprüfung; Review-IDs VER-07, DAT-17, VER-18, VER-10                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Status  | entschieden 2026-10-09 (Jannes); eingeplant in UX-EPIC-007 |
| Berührt | `src/features/treatment-bases/api.ts` (Z. 532), `src/features/treatment-bases/TreatmentBasisFormFields.tsx` (Z. 78–93, 266–268), `src/features/treatment-bases/TreatmentBasisFormPage.tsx` (Z. 172–187), `update_treatment_basis` (Migration `20260918130000_appointment_count.sql`, Z. 498–503), `src/features/treatment-bases/PatientTreatmentBasesPage.tsx` (Z. 146, 310–361, 396–401), `src/features/files/Dateiliste.tsx` (Z. 174, 505, 527), `src/features/therapy-reports/BerichteDerVerordnung.tsx` (Z. 113), `src/features/treatment-bases/PrescribersListPage.tsx` (Z. 81–92), `src/features/treatment-bases/PrescriberFormFields.tsx` (Z. 117–144), `src/features/billing/InvoicePrintPage.tsx` (Z. 341); ADR-017 Punkt 10; ADR-020 Punkt 3 und 4; ANN-074; Oberflächen-Checkliste Punkte 8 und 11 |

**Beobachtung.**

- **Bauart.** Eine neue Grundlage ist als „Erstverordnung“ vorbelegt; das Feld
  „Art“ hat keine leere Option. Folgeverordnung oder Selbstzahler werden so ohne
  bewusste Wahl als Erstverordnung gespeichert — und die Bauart steht auf
  Rechnung und Therapiebericht. Der Wechsel auf Selbstzahler leert Verordner:in
  und Diagnose und blendet beide im selben Moment aus; beim Speichern räumt der
  Server zusätzlich Therapieziel, Verordnerhinweis und Empfehlung ab, während
  der Kasten „Aus dem Bestand“ versichert, sie „bleiben beim Speichern
  unverändert stehen“. Im Browser nachgestellt (therapist, 390 px, nichts
  gespeichert).
- **Karte.** Bis zu vier Aktionen („Terminserie anlegen“, „Im Kalender einen
  Platz suchen“, „Termine übertragen“, „Bearbeiten“) stehen als gleichrangige
  Textlinks nebeneinander, darunter „Therapiebericht schreiben“ als größter
  Knopf der Karte. An jeder laufenden Verordnung stehen ein Leerzustand und das
  volle Uploadfeld mit Hauptknopf — auch wenn schon ein Scan da ist; office
  liest dort eine Aufforderung, der es nicht folgen darf. In „Dateien“ steht das
  Uploadfeld unter der Liste, das Ergebnis erscheint oben (bei 390 px beginnt
  das Formular bei rund 1 040 px).
- **Verordner:innen.** Die Kartei zeigt Praxis, Fachrichtung und Ort; die ganze
  Zeile führt ins Bearbeitungsformular, bei 1440 px bleiben rechts rund 750 px
  leer. Telefon, Fax und E-Mail gibt es nur als Eingabefelder, nirgends `tel:`
  oder `mailto:`, und die Verordnungskarte nennt nur Name und Praxis. Wer eine
  Folgeverordnung anfordern will, schreibt die Nummer aus einem offenen Formular
  ab.

**Frage an Jannes.** (1) Soll die Bauart ohne Vorauswahl starten? (2) Welche
Aktion ist je Zustand der Verordnung die Hauptaktion? (3) Brauchen
Verordner:innen eine Leseansicht mit Kontaktwegen, auch an der Verordnungskarte?

**Optionen.**

- Zu (1): **a)** Vorbelegung bleibt — Folge: stille Erstverordnungen auf
  Rechnung und Bericht; **b)** „Bitte wählen …“ als erste Option, kein geratener
  Wert, der auf der Rechnung steht (wie ANN-074 beim Umsatzsteuerstatus) —
  Folge: ein Tipp mehr bei jeder neuen Grundlage.
- Zu (2): **a)** gleichrangig wie heute; **b)** je Zustand eine Hauptaktion —
  offen: „Terminserie anlegen“, verplant: „Termine übertragen“ —, „Bearbeiten“
  ruhig in den Kartenkopf, der Bericht als ruhige Aktion, der Scan als eine
  Zeile mit Zustand und „Scan hinzufügen“ zum Aufklappen (liegt einer vor:
  „Weiteren Scan hinzufügen“), für Rollen ohne Hinzufügen nur „Noch kein Scan.“;
  in „Dateien“ „Datei hinzufügen“ oben. Folge von b: Die laufende Karte wird am
  Handy deutlich kürzer (heute rund 1 790 px, davon rund 760 px Bericht, Scan
  und Upload); der nächste Schritt ist erkennbar.
- Zu (3): **a)** Kontaktwege in der Karteizeile als eigene Links (Telefon,
  E-Mail; Fax als Text), die Zeile führt weiter zum Bearbeiten, dazu Telefon und
  Fax an der Verordnungskarte; **b)** eine eigene Leseansicht, Bearbeiten als
  Aktion darin. Folge von b: eine Seite mehr, dafür kein Nachschlagen in einem
  offenen Formular.

**Empfehlung.** (1) b, (2) b, (3) a — sie erfüllt Checkliste Punkt 8 ohne neue
Seite. Ohne Entscheidung beim Wechsel der Bauart: Werte im Zustand behalten und
nur nicht senden, der sichtbare Satz „Verordner:in und Diagnose entfallen beim
Selbstzahler.“, der Kasten „Aus dem Bestand“ sagt „werden beim Speichern
entfernt“, und das Speichern fragt nach.

**Entscheidung (Jannes, 2026-10-09).** (2) b: je Zustand eine Hauptaktion, Bearbeiten, Bericht und Scan ruhig. (3) a: Kontaktwege der Verordner:in als Links in der Liste und an der Verordnungskarte.

### BEF-062 — Nach einem Storno führen zwei Wege zur neuen Rechnung, und nur einer behält den Bezug; Empfänger lassen sich nur anlegen

|         |                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-27                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Bereich | Abrechnung: „Abzurechnen“ (`/abrechnung`), stornierte Rechnung und Rechnungsentwurf (`/abrechnung/rechnungen/:id`), Abschnitt „Empfänger“                                                                                                                                                                                                                                                                                             |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390 px, Gegenprüfung; Review-IDs ABR-08, ABR-19                                                                                                                                                                                                                                                                                                                                     |
| Status  | entschieden 2026-10-09 (Jannes); eingeplant in UX-EPIC-008                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Berührt | `create_invoice_draft`, `create_correction_draft` (Migration `20260921140000_invoice_service_area.sql`, Z. 627–629), `list_invoice_candidates`, `save_invoice_recipient`; `src/features/billing/api.ts` (Z. 263, 592–594), `src/features/billing/InvoicesPage.tsx` (Z. 336–358), `src/features/billing/InvoiceDetailPage.tsx` (Z. 566, 682–733, 807); ADR-009 Punkt 9 und 10; ANN-079; BEF-018; ADR-013 Punkt 9 (Rechnungsdaten, RPC) |

**Beobachtung.**

- **Korrekturbezug.** Nach dem Storno stehen die Leistungen wieder unter
  „Abzurechnen“ mit dem gewohnten „Entwurf anlegen“ — ohne Bezug zur stornierten
  Rechnung. Nur „Korrekturrechnung erstellen“ an der stornierten Rechnung
  verknüpft (ANN-079). Wer den Weg der Startseite nimmt, bekommt eine Rechnung
  ohne den Satz „Korrekturrechnung zur stornierten Rechnung …“ auf dem Blatt;
  ein späterer Klick auf „Korrekturrechnung erstellen“ meldet „… steht bereits
  ein Entwurf. Er ist die Korrektur.“ — obwohl er nicht verknüpft ist. Die Zeile
  unter „Abzurechnen“ verrät die Herkunft nicht. Der Seed zeigt beide Wege
  zugleich. Beim Empfänger liegen dann zwei Rechnungen über dieselben Leistungen
  ohne Bezug — genau der Fall, den ADR-009 Punkt 9 vermeiden soll.
- **Empfänger.** Hinterlegte Empfänger lassen sich nur neu anlegen, nicht
  korrigieren oder entfernen, obwohl die Speicherfunktion eine Kennung annimmt.
  Einen Standardempfänger gibt es nicht, ein neu gespeicherter Empfänger ist
  danach nicht gewählt, die Art ist mit „Beihilfestelle“ vorbelegt. Bei 390 px
  bricht „Empfänger speichern“ zweizeilig im 48-px-Knopf um, und der gesperrte
  Knopf sagt nicht, was fehlt. Ein Tippfehler in der Anschrift einer
  Beihilfestelle bleibt stehen; jeden Monat ist der Empfänger je Person neu zu
  wählen.

**Frage an Jannes.** (1) Welcher Weg soll nach einem Storno zur neuen Rechnung
führen? (2) Sollen Empfänger bearbeitbar sein und einer je Person als Standard
gelten?

**Optionen.**

- Zu (1):
  - **a) Der Server verknüpft selbst:** Ein neuer Entwurf bezieht sich auf die
    stornierte Rechnung desselben Monats und Leistungsbereichs. Folge: Beide
    Wege ergeben dasselbe; die Regel muss eindeutig sein, auch bei zwei Stornos.
  - **b) Nur ein Weg:** Die Zeile unter „Abzurechnen“ nennt die Herkunft („aus
    stornierter RG-… – Korrekturrechnung erstellen“) und bietet nur diesen Weg.
    Folge: Der Bezug entsteht immer sichtbar; eine Zeile mehr Text.
- Zu (2):
  - **a) Wie heute** (nur anlegen). Folge: siehe oben.
  - **b) Bearbeiten und Standard:** Empfänger korrigieren und einen je Person
    als Standard setzen; der neu gespeicherte wird gleich gewählt. Wirkt auf
    Entwürfe, nie auf ausgestellte Rechnungen (Snapshot, ADR-009 Punkt 10).
    Folge: geänderte Rechnungsdaten, kritischer Pfad.

**Empfehlung.** (1) b — der sichtbare Weg ist leichter zu prüfen als eine
Zuordnung im Hintergrund und beantwortet genau die Wiedervorlage von ANN-079
(„ob die Praxis die Korrekturrechnung so findet“). (2) b. Beides ein Loop im
kritischen Pfad. Sofort und nur Text: die Meldung „Er ist die Korrektur.“
ehrlich machen („… ein Entwurf ohne Bezug zur stornierten Rechnung. Bitte
verwerfen und hier neu anlegen.“). Ohne Entscheidung: Knopfzeile umbrechen, die
Art ohne Vorbelegung („Bitte wählen …“), der Grund am gesperrten Knopf („Name
oder Stelle fehlt“).

**Entscheidung (Jannes, 2026-10-09).** (1) b: Nach einem Storno führt nur der sichtbare Weg „Korrekturrechnung erstellen“ mit Herkunft zur neuen Rechnung. (2) b: Empfänger bearbeitbar, einer je Person als Standard; ausgestellte Rechnungen bleiben unverändert.

### BEF-063 — „Rechnung ausstellen“ geschieht mit einem Tipp, während folgenlose Schritte nachfragen

|         |                                                                                                                                                                                                                                                                                                                                                             |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-27                                                                                                                                                                                                                                                                                                                                                  |
| Bereich | Rechnungsentwurf (`/abrechnung/rechnungen/:id`); Datenschutz der Akte (`/patienten/:id/datenschutz`), Widerruf der Fotoeinwilligung                                                                                                                                                                                                                         |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390 px, Gegenprüfung; Review-IDs ABR-15, ZST-15                                                                                                                                                                                                                                                           |
| Status  | entschieden 2026-10-09 (Jannes); eingeplant in UX-EPIC-008                                                                                                                                                                                                                                                                                                                                                       |
| Berührt | `src/features/billing/InvoiceDetailPage.tsx` (Z. 847–869), `src/features/billing/CatalogPage.tsx` (Z. 423), `src/features/datenschutz/PatientDatenschutzPage.tsx` (Z. 245, 270), `src/features/files/FotosImVerlauf.tsx` (Z. 394); ADR-009 Punkt 9; ADR-016 Punkt 4 (Muster „Folge vor dem Knopf“); ANN-127; `OPTIMIERUNG.md` (Messgrößen Z und F); BEF-064 |

**Stand nach UXR-006.** Der Foto-Widerruf fragt inzwischen nach (Review PAT-04,
umgesetzt an genau einer Stelle, `VermerkErfassen`); offen ist nur noch die
Frage zum Ausstellen der Rechnung.

**Beobachtung.** Ausstellen vergibt eine Nummer aus dem lückenlosen Kreis und
macht die Rechnung unveränderlich; korrigierbar ist sie nur per Storno mit
eigener Nummer und neuer Rechnung. Dafür genügt ein Tipp auf den Hauptknopf; die
Folge steht als Absatz davor — dasselbe Muster wie beim Abschluss der
Dokumentation (ADR-016 Punkt 4). Das folgenlose „Entwurf verwerfen“ daneben und
„In Kraft setzen“ im Katalog fragen dagegen nach; ist die Verwerfen-Rückfrage
offen, stehen ihr „Verwerfen“ und „Rechnung ausstellen“ als zwei gefüllte Knöpfe
direkt untereinander. Der Widerruf der Fotoeinwilligung löscht alle Fotos der
Person sofort (ANN-127); auch dort stehen nur ein Feldhinweis und die
Knopfbeschriftung, während das Löschen eines einzelnen Fotos mit „Endgültig
löschen“ nachfragt. Eine Festlegung, welches Muster für diese beiden gilt, gibt
es nicht. `OPTIMIERUNG.md` nennt für eine Rechnung „≤ 60 s“ und für Fehlerpfade
„Irreversibles nur mit Rückfrage“.

**Frage an Jannes.** Sollen unumkehrbare Schritte mit Außenwirkung — eine
Rechnung ausstellen, alle Fotos einer Person löschen — eine Rückfrage bekommen,
oder gilt auch hier „die Folge steht vor dem Knopf“?

**Optionen.**

1. **Folge vor dem Knopf, ein Tipp** (wie heute), als Annahme festgehalten.
   Folge: schnell; ein Fehlgriff erzeugt Storno, neue Rechnung und zwei
   Schreiben an den Empfänger bzw. löscht alle Fotos einer Person.
2. **Rückfrage im Fluss mit Kontrollwerten:** „An Beihilfestelle …, 45,00 €,
   Kreis RG. Danach unveränderlich. — Ja, Rechnung ausstellen“ bzw. „Ja,
   widerrufen und alle Fotos löschen“. Folge: ein Tipp mehr je Rechnung; die
   Rückfrage zeigt Empfänger und Betrag noch einmal — die häufigsten Fehlgriffe.
3. **Rückfrage nur beim Foto-Widerruf,** die Rechnung bleibt bei einem Tipp.
   Folge: Die Löschung ist geschützt, das Ausstellen schnell.

**Empfehlung.** Option 2 für beide. Die Rückfrage kostet einen Tipp und erspart
im Fehlerfall ein Storno mit zweiter Nummer bzw. eine unwiderrufliche Löschung;
sie zeigt dabei Empfänger und Betrag, die vorher niemand noch einmal ansieht.
Unabhängig davon „Entwurf verwerfen“ als ruhige Aktion mit Abstand, damit seine
Bestätigung nicht unter „Rechnung ausstellen“ steht. Dieselbe Frage stellt sich
beim Entziehen einer Rolle (BEF-064). Die Umsetzung ändert keinen Aufruf, liegt
aber im Ausstellungs- und Löschweg; ADR-013 Punkt 9 dabei prüfen.

**Entscheidung (Jannes, 2026-10-09).** Option 2: Rückfrage mit Kontrollwerten bei „Rechnung ausstellen“ und beim unwiderruflichen Löschen von Fotos; ebenso beim Entziehen einer Rolle (BEF-064).

### BEF-064 — Zugang und Rollen: Die Trainingsbetreuung erscheint rollenlos, Rollen wirken ohne Rückfrage, und die Praxisleitung findet die Instrumente nicht

|         |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Datum   | 2026-09-27                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Bereich | Organisatorisches → Mitarbeitende → Datensatz (`/praxis/team/:id`), Abschnitt „Zugang“; Organisatorisches → Instrumente (`/praxis/instrumente`); Befund der Akte                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390/820/1440 px, Gegenprüfung; Review-IDs ORG-09, ORG-18, BEF-19                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Status | entschieden 2026-10-09 (Jannes); eingeplant in UX-EPIC-008 |
| Berührt | `src/features/staff/StaffAccountSection.tsx` (Z. 34, 270, 290, 354–410), `src/features/staff/StaffMemberDetailPage.tsx` (Z. 149–176, 284–288), `src/app/navigation.tsx` (`betriebUnterpunkte`), `src/routes/AuthenticatedRoutes.tsx` (Z. 135, 326), `src/features/assessments/PatientBefundPage.tsx` (Z. 111), `src/features/assessments/VerlaufAbschnitt.tsx` (Z. 105); `app.assert_staff_role_keys` (Migration `20260911110000_staff_account_invitations.sql`), Migration `20260920132000_training_role.sql`; ADR-004; ADR-021; ANN-103; STAFF-001; ADR-013 Punkt 9 (Rollen, Sichtbarkeit zwischen Rollen) |

**Beobachtung.**

- **Trainingsbetreuung.** Die Rollenwahl kennt vier Kästchen (Therapeut:in,
  Teamleitung, Praxismanagement, Praxisinhaber:in). Für einen Zugang mit der
  Rolle `trainer` (im Seed ein Konto der Trainingsbetreuung) zeigt der Abschnitt
  „Stand: Eingerichtet“ und vier leere Kästchen — die tatsächliche Rolle steht
  nirgends. Hakt man eine Rolle an, geht `trainer` mit hinaus, der Server lehnt
  sie ab, und die Seite sagt nur „Der Vorgang konnte nicht ausgeführt werden.“
  Dass `trainer` hier nicht zuweisbar ist, ist gewollt: Die Rolle wird
  zuweisbar, wenn es im Trainingsbereich etwas zu bedienen gibt (E18 Schritt 7).
- **Rückfragen.** „Rollen speichern“ wirkt sofort auf den Aktenzugriff, ohne
  Rückfrage; „Kennwort zurücksetzen“, das keine Berechtigung ändert, fragt nach.
  Am eigenen Datensatz wird „Zugang sperren“ angeboten und erst nach der
  Bestätigung abgewiesen. Deaktivieren mit offenen Terminen braucht drei Tipps;
  der zweite Schritt erscheint als rote Fehlermeldung, obwohl er eine gewollte
  Bestätigung ist. Ein Häkchen weniger nimmt einer Kollegin im Hausbesuch sofort
  die Akten.
- **Instrumente.** Route und Menüpunkt hängen am Recht, Behandlungen zu
  dokumentieren (therapist, team_lead). Ein reines owner-Konto darf Fragebögen
  erheben (ANN-103), erreicht die Bibliothek mit Wortlaut und Lizenz aber gar
  nicht, auch nicht über die Adresse. office sieht am Bogen nur „Noch nicht
  erhoben.“ ohne Satz, wer erhebt.

**Frage an Jannes.** (1) Soll das Entziehen einer Rolle nachfragen — so wie
heute schon das Zurücksetzen eines Kennworts? (2) Wer soll die
Instrumente-Bibliothek sehen: alle, die erheben dürfen, oder alle Praxisrollen?

**Optionen.**

- Zu (1): **a)** keine Rückfrage wie heute — Folge: ein Fehltipp nimmt sofort
  den Aktenzugriff; **b)** Rückfrage nur beim Entziehen („… verliert damit
  sofort den Zugriff auf die Akten.“) — Folge: ein Tipp mehr, nur im
  folgenreichen Fall.
- Zu (2): **a)** alle, die erheben dürfen (owner, therapist, team_lead) — Folge:
  Die Praxisleitung findet Wortlaut und Lizenz, office nicht; **b)** alle
  Praxisrollen, weil die Bibliothek keinen Personenbezug hat — Folge: auch
  office liest die Bögen, ohne sie erheben zu dürfen.

**Empfehlung.** (1) b, (2) a. Dazu, ohne neue Festlegung, aber im kritischen
Pfad (Rollen): eine hier nicht vergebbare Rolle als Rollenabzeichen
„Trainingsbetreuung – hier nicht änderbar“ zeigen und die Kästchen für solche
Zugänge mit Erklärung sperren; am eigenen Datensatz statt „Zugang sperren“ der
Satz „Den eigenen Zugang können Sie nicht sperren.“; offene Termine beim
Deaktivieren gleich beim Öffnen laden und in einem Schritt bestätigen lassen
(die Prüfung auf dem Server aus STAFF-001 bleibt); für Leserollen am Bogen
„Erhoben wird von den behandelnden Rollen.“

**Entscheidung (Jannes, 2026-10-09).** (1) b: Rückfrage beim Entziehen einer Rolle. (2) b: Die Instrumente-Bibliothek sehen alle Praxisrollen, auch das Büro (Regel BEF-137).

### BEF-065 — Audit, Aufbewahrung und MDR-Sperre: Die Nachweisseiten sprechen Projektsprache und stellen die Arbeit nach hinten

|         |                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-27                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Bereich | Organisatorisches → Sicherheit → Audit (`/praxis/sicherheit/audit`) und Aufbewahrung (`/praxis/sicherheit/aufbewahrung`); MDR-Sperrseite (reservierte Adressen, etwa `/training/ki-analyse`)                                                                                                                                                                                                                                                               |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390 und 1440 px, Gegenprüfung; Review-IDs ORG-13, ORG-19, ORG-23, ORG-B02, NAV-23                                                                                                                                                                                                                                                                                                                        |
| Status  | entschieden 2026-10-09 (Jannes); eingeplant in UX-EPIC-009                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Berührt | `src/features/audit/AuditLogPage.tsx` (Z. 50–83, 164–207), `src/features/audit/api.ts` (Z. 97), `list_audit_events` (Migration `20260922120000_abgewiesene_zugriffe.sql`, Z. 256), `src/features/retention/AufbewahrungPage.tsx` (Z. 72, 231–421), `src/features/retention/klassen.ts`, `src/app/MdrSperre.tsx` (Z. 24–33), `tests/e2e/mdr-sperre.spec.ts` (Z. 21–25); ADR-006; ADR-008; ADR-010 Punkt 3 und 13; ANN-089; ADR-013 Punkt 9 (Audit-Lesepfad) |

**Beobachtung.**

- **Audit.** Der Gegenstand einer Zeile steht als „…“ plus die letzten
  12 Zeichen der Kennung; die volle Kennung nur im Tooltip — am Handy nicht
  erreichbar und nirgends verlinkt. „Abgewiesen“ steht in derselben grauen
  14-px-Zeile wie „Erfolgreich“. Der Aktionsfilter bietet 118 Einträge in
  technischer Reihenfolge. Jede Seite ist eine neue Abfrage ohne Platzhalter,
  Liste und Blätterleiste verschwinden kurz; weil jeder Lesevorgang selbst
  „Auditlog gelesen“ oben ins Log schreibt (ADR-010 Punkt 13), rückt beim
  Weiterblättern alles um eins, der letzte Eintrag der Vorseite erscheint
  erneut. Filter stehen nicht in der Adresse und gehen beim Neuladen verloren;
  am Handy stehen alle vier offen über der Liste (rund 330 px). Die Kernfrage —
  wer hat wessen Akte geöffnet — lässt sich aus der Liste nicht beantworten, und
  abgewiesene Zugriffe gehen in der Masse unter.
- **Aufbewahrung.** Datenklassen tragen die Annahmenkennung als Etikett
  („ANN-126“), Texte verweisen auf ADRs, sprechen von „Objektspeicher“ und
  „Fristen ändern sich über eine Migration“. Offene Löschaufträge und der
  Abgleich der Dateiablage — die einzigen Arbeitsaufgaben der Seite — beginnen
  erst nach 15 Planungskarten: bei 390 px nach 5 460 px (Seitenhöhe 6 498 px),
  bei 1440 px nach 2 305 px.
- **MDR-Sperre.** „Sie ist als MDR_REVIEW_REQUIRED klassifiziert.“ und „Ein
  Feature-Flag ersetzt diese Prüfung nicht …“. Der E2E-Test hält beide Sätze
  fest, die Kennung bewusst (auffindbar für ADR-006 und das Register).
  Erreichbar nur über reservierte Adressen.

**Frage an Jannes.** An wen richten sich diese Seiten — an die Praxisleitung im
Alltag oder an eine Prüfer:in? Und soll das Audit zu einer Zeile die Akte oder
den Termin öffnen können?

**Optionen.**

1. **Für Prüfer:innen lassen** (Kürzel, Verweise und Reihenfolge wie heute).
   Folge: nachvollziehbar für die Prüfung; die Praxisleitung übersieht am Handy
   offene Löschaufträge und abgewiesene Zugriffe.
2. **Für die Praxisleitung schreiben, den Nachweis als Zusatz:** Aufbewahrung
   oben mit einem Zustandsblock (offene Aufträge und Abgleich, leer als eine
   Zeile „Nichts offen, beide Speicher deckungsgleich“), danach Löschsperren,
   Plan und Journal; das Etikett „Annahme – Prüfung offen“ mit der Kennung als
   Zusatz, ADR-Verweise in einer aufklappbaren „Grundlagen“-Zeile,
   „Programmänderung“ statt „Migration“. Audit: „Abgewiesen“ als kritisches
   Abzeichen, Aktionen gruppiert, Filter in der Adresse und am Handy
   eingeklappt, Blättern auf einem festen Zeitpunkt („Stand 14:03 – neu laden“).
   MDR-Seite: Haupttext in Praxissprache („Diese Funktion bleibt gesperrt, bis
   eine Prüfung nach dem Medizinprodukterecht dokumentiert ist.“), die Kennung
   als Fußzeile; der E2E-Test prüft weiter die Kennung und den neuen Satz statt
   „Feature-Flag“, gleich streng. Folge: dieselben Angaben, andere Reihenfolge
   und Sprache; der feste Zeitpunkt ändert den Aufruf des Audit-Lesepfads
   (kritischer Pfad), und der geänderte E2E-Text braucht deine Freigabe, weil er
   eine Sperrprüfung betrifft.
3. **Wie 2, dazu je Auditzeile „Akte öffnen“ bzw. Namen statt Kennung.** Folge:
   Die Kernfrage ist mit einem Tipp beantwortet; Namen im Audit-Lesepfad oder
   ein Sprung in die Akte ändern aber den Lesepfad nach ADR-010 Punkt 13 — und
   jeder Sprung ist selbst ein Aktenzugriff.

**Empfehlung.** Option 2. Sie macht die Arbeit sichtbar, ohne den Nachweis zu
verlieren. Option 3 erst mit der Datenschutzprüfung (B2), weil sie ADR-010
berührt.

**Entscheidung (Jannes, 2026-10-09).** Option 2: Die Nachweisseiten sind für die Praxisleitung im Alltag geschrieben, der Nachweis steht als Zusatz. Den geänderten Satz im E2E-Test der MDR-Sperre (gleich streng, Kennung bleibt geprüft) gibt Jannes hiermit frei.

### BEF-066 — Vorschauen des Praxisbetriebs: Jede Rolle sieht Salden, IBAN und Urlaubsgründe aller und darf Räder anlegen und entfernen

|         |                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-27                                                                                                                                                                                                                                                                                                                                                                                                  |
| Bereich | Organisatorisches → Vorschau: Zeitkonto (`/betrieb/zeitkonto`), Erstattungen (`/betrieb/erstattungen`), Urlaub (`/betrieb/urlaub`), Radflotte (`/betrieb/flotte`)                                                                                                                                                                                                                                           |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390 und 1440 px, Gegenprüfung; Review-IDs VOR-14, VOR-22                                                                                                                                                                                                                                                                                                  |
| Status  | entschieden 2026-10-09 (Jannes); eingeplant in FLT-EPIC-001, URL-001, ZK-001, ERS-001                                                                                                                                                                                                                                                                                                                                                                                                       |
| Berührt | `src/features/timeaccount/TimeAccountPage.tsx` (Z. 77, 96), `src/features/reimbursements/ReimbursementsPage.tsx` (Z. 68, 254, 337), `src/features/vacation/VacationPage.tsx` (Z. 158, 214, 490), `src/features/fleet/FleetPage.tsx` (Z. 193–229, 343), `src/features/fleet/BikeEditPage.tsx` (Z. 294); §4.3, §4.5, §16, §20; B6; ANN-024; ADR-004; Roadmap Block 8 (FLT-EPIC-001, URL-001, ZK-001, ERS-001) |

**Beobachtung.** Als therapist angemeldet: „Saldo über alle Personen: −3,25 h“
und „Alle Zeitkonten“ mit dem Saldo jeder Person; jede Erstattungskarte mit
voller IBAN, die „Historie je Person“ mit allen Beträgen; unter „Alle Anträge“
im Urlaub „Grund: Familienurlaub“ und „Grund: Umzug“ — während das Formular sagt
„Private Gründe müssen nicht angegeben werden.“ In der Radflotte ist „Rad
hinzufügen“ für jede Rolle der Hauptknopf, Bearbeiten und „Rad entfernen“ stehen
allen offen; die Alltagswege Schlüssel, Panne und Check-Up sind nachrangig, und
die erste Radkarte beginnt bei 390 px erst bei rund 830 px. Privatangaben
Beschäftigter liest heute nur owner (§4.3, ANN-024) — eine Bankverbindung ist
von derselben Art. Die Daten sind synthetisch, die Vorschau speichert nichts;
sie ist aber das Vorbild der Loops, die sie in Block 8 ersetzen.

**Frage an Jannes.** Wer sieht in Zeitkonto, Erstattungen und Urlaub die
Einträge anderer, und wer verwaltet die Räder?

**Optionen.**

1. **Wie die Vorschau:** Alle sehen alles, alle dürfen alles. Folge:
   Überstunden, Bankverbindung und private Gründe liegen im Team offen; eine
   Summe über alle Personen ist eine Auswertung über Beschäftigte, die B6 und
   §20 eng begrenzen.
2. **Eng (§16):** Eigenes sieht jede Person; Fremdes in Zeitkonto und
   Erstattungen nur owner; im Urlaub sehen andere nur den Zeitraum, nie den
   Grund; die IBAN nur maskiert („DE02 •••• 01“); keine Summe über alle
   Personen. Räder anlegen und entfernen nur owner, Schlüssel, Panne und
   Check-Up alle. Verbindlich über RLS (ADR-004). Folge: später zu öffnen ist
   billig; jede Öffnung ist eine eigene Rollenentscheidung.
3. **Wie 2, mit den Zusatzrechten aus §4.3 und §4.5 gleich vergeben:** office
   sieht die Belege der Erstattungen, team_lead bearbeitet Urlaubsanträge und
   teilt Räder zu. Folge: näher an einer größeren Praxis, mehr Sichtbarkeit von
   Anfang an.

**Empfehlung.** Option 2, als Vorgabe in den Zuschnitt von FLT-EPIC-001,
URL-001, ZK-001 und ERS-001; die Vorschau selbst wird nicht umgebaut, sondern
ersetzt. Dort auch: der Hauptknopf nach Rolle (Behandelnde „Schlüssel
entnehmen“, „Rad hinzufügen“ nachrangig für owner), Suche und Filter
eingeklappt.

**Entscheidung (Jannes, 2026-10-09).** Option 2 mit Büro: Eigenes sieht jede Person; Fremdes in Zeitkonto und Erstattungen sehen owner und Büro; im Urlaub sehen andere nur den Zeitraum, nie den Grund; IBAN maskiert; keine Summe über alle Personen; Räder anlegen und entfernen nur owner, Schlüssel, Panne und Check-up alle. Verbindlich über RLS; Vorgabe für den Zuschnitt der genannten Loops.

### BEF-067 — Begriffe: Dieselbe Sache heißt an verschiedenen Stellen verschieden

|         |                                                                                                                                                                     |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-27                                                                                                                                                          |
| Bereich | Querschnitt: Kalender, Termin, Übersicht, Akte, Patient:innen, Anmeldung, Mein Konto, Anlegeseiten                                                                  |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390 und 1440 px, Gegenprüfung; Review-IDs WRT-04, WRT-05, WRT-18, KAL-28, UEB-14, AUTH-14, NAV-21, PAT-06, PAT-10 |
| Status  | entschieden 2026-10-09 (Jannes); eingeplant in UX-EPIC-009                                                                                                                                                               |
| Berührt | `src/lib/begriffe.ts`, `src/lib/begriffe.test.ts`; Fundstellen je Zeile unten; ANN-002, ANN-023, ANN-025, ANN-032, ANN-111; BEF-035; Oberflächen-Checkliste Punkt 9 |

**Beobachtung.** Checkliste Punkt 9 verlangt „gleiche Sache, gleiches Wort“,
ANN-111 führt die Begriffe an einer Stelle. Neun Stellen weichen ab:

| Sache                                  | heute                                                                                                                                                                                                       | Fundstellen                                                                                                                                              |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Serie von Terminen aus einer Grundlage | „Dauertermin“ (Kalender, `begriffe.ts`), „Terminserie“ (Serienseite, Akte, Fehlermeldung)                                                                                                                   | `CalendarPage.tsx:657`, `DauerterminStartPage.tsx:153`, `AppointmentSeriesPage.tsx:291`, `PatientTreatmentBasesPage.tsx:319`                             |
| Länge eines Termins                    | „Dauer“ (Feld), „Andere Länge …“, „Länge in Minuten“, „Fenster“, „Terminfenster“, „Länge weicht ab“                                                                                                         | `AppointmentFormFields.tsx:259–283`, `AppointmentSeriesPage.tsx:392–393`, `appointments/api.ts:546, 1363`                                                |
| Eintrag ohne Patient:in                | „Fehlzeit“, beschrieben als „Besprechung, Teamtermin“, mit der Rückfrage „Außerhalb der Arbeitszeit“                                                                                                        | `NewEventPage.tsx:159`, `EreignisFormFields.tsx:148–151`                                                                                                 |
| alle Termine eines Tages absagen       | „Tag umplanen“; der Knopf dahinter heißt „2 Termine absagen“                                                                                                                                                | `TagUmplanenPage.tsx:193, 266`                                                                                                                           |
| bestätigter, noch offener Termin       | Tageskarte „Steht aus“, Terminseite „Status: Bestätigt“; in der Akte steht ein vergangener, offener Termin ohne Zustandswort                                                                                | `today/api.ts:195`, `AppointmentDetailPage.tsx:922`                                                                                                      |
| Titel der Anlegeseiten                 | drei Nomen („Neue:r Patient:in“, „Neue:r Mitarbeiter:in“, „Neue:r Verordner:in“), sonst Verben („Termin anlegen“ …)                                                                                         | `NewPatientPage.tsx:103`, `NewStaffMemberPage.tsx:83`, `PrescriberFormPage.tsx:105`                                                                      |
| Anmeldung mit E-Mail und Kennwort      | „Konto“ und „Zugang“ im selben Absatz; die Mail heißt „Zugangsmail“, am Knopf „Anmeldemail senden“, im Betreff „Zugang zur Praxisanwendung“; „Anmeldemaske“                                                 | `LoginPage.tsx:193`, `ZugangEinrichtenPage.tsx:49`, `ZugangPage.tsx:113`, `StaffAccountSection.tsx:218`, `supabase/config.toml:100`, `MeinKontoPage.tsx` |
| Versorgungsstatus                      | „Aktiv/Inaktiv“, „inaktiv“, „Nicht in Versorgung“, „In Versorgung“/„Nicht in laufender Versorgung“; eine abgeschlossene, aktive Person trägt zugleich „✓ In Versorgung“ und „Versorgung abgeschlossen am …“ | `PatientRecordLayout.tsx:152–160`, `PatientMasterDataPage.tsx:311–320`, `PatientsListPage.tsx:118, 160`, `Patientensuche.tsx:35`                         |
| Name in der Patientenliste             | sortiert nach Nachname, angezeigt „Vorname Nachname“; am Handy wird zuerst der Nachname gekürzt                                                                                                             | `patients/api.ts:101, 185`, `PatientsListPage.tsx:147–150`                                                                                               |

**Frage an Jannes.** Welches Wort gilt je Zeile? Es steht danach in
`begriffe.ts`, und der Test hält die übrigen Stellen fern.

**Optionen.** Je Zeile ein Vorschlag und eine Alternative:

| Sache                   | Vorschlag                                                                                                                                                                                        | Alternative                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Serie                   | „Dauertermin“ überall, auch in Titel, Knopf und Fehlermeldung; „Serie“ bleibt das Wort für die Vorkommen („Ganze Serie absagen“)                                                                 | „Terminserie“ überall, dann auch im Kalender                                                                             |
| Länge                   | „Dauer“ überall („Andere Dauer …“, „Dauer in Minuten“, „Dauer: 60 Minuten, Dokumentation eingeschlossen“, „Dauer weicht ab“); die Begriffe aus §8.1 bleiben im Code                              | „Länge“ überall, auch am Feld                                                                                            |
| Eintrag ohne Patient:in | „Fehlzeit“ bleibt, bis du die offene Frage aus ANN-111 in der Sichtung beantwortet hast; die Beispiele im Formular an `BEGRIFFE.fehlzeit` festhalten                                             | ein Wort, das Arbeitszeit einschließt (etwa „Blockzeit“) — nicht „Praxistermin“, so heißt schon der Termin in der Praxis |
| Tag absagen             | „Tag umplanen“ bleibt (von dir am 2026-09-26 bestätigt)                                                                                                                                          | „Tag absagen“                                                                                                            |
| offener Termin          | „Steht aus“ überall, neutral, auch in der Akte für vergangene, noch offene Termine                                                                                                               | „Bestätigt“ überall                                                                                                      |
| Titel                   | Verben überall: „Patient:in anlegen“, „Mitarbeiter:in anlegen“, „Verordner:in anlegen“; die Anlegen-Leiste behält deine Nomen („Neuer Termin · Dauertermin · Fehlzeit · Dauerfehlzeit“, BEF-035) | Nomen überall                                                                                                            |
| Konto/Zugang            | „Konto“ = Anmeldung mit E-Mail und Kennwort, „Zugang“ = Freischaltung durch die Praxis (ANN-025); eine Mail, ein Wort: „Anmeldemail“, auch im Betreff; „Anmeldeseite“ statt „Anmeldemaske“       | ein Wort für beides                                                                                                      |
| Versorgungsstatus       | „in Versorgung“ / „nicht in Versorgung“ in Filter, Liste, Suche, Stammdaten und Knopf; „abgeschlossen“ nur für den Abschluss; ist der Abschluss gesetzt, zeigt der Kopf nur ihn                  | „aktiv“ / „inaktiv“                                                                                                      |
| Name in Listen          | „Nachname, Vorname“ mit hervorgehobenem Nachnamen, Sortierung bleibt                                                                                                                             | Anzeige bleibt, Sortierung nach Vorname                                                                                  |

Folge in jedem Fall: ein Durchgang durch die Fundstellen, ANN-111 wird
fortgeschrieben; Wortlaut-Tests ziehen mit.

**Empfehlung.** Die Spalte „Vorschlag“ in einem Durchgang. Ohne Entscheidung
sofort: die Zeile „Praxis: …“ auf „Mein Konto“ streichen (ANN-023 zeigt den
Organisationsnamen nicht an), „Laufende Versorgung“ in den Stammdaten durch
„nicht abgeschlossen“ ersetzen, Gedankenstrich statt Bindestrich, Namen in der
Patientenliste umbrechen statt kürzen.

**Entscheidung (Jannes, 2026-10-09).** Spalte „Vorschlag“ in allen Zeilen: „Dauertermin“, „Dauer“, „Fehlzeit“ bleibt, „Tag umplanen“ bleibt, „Steht aus“, Verben in Titeln, Konto/Zugang mit „Anmeldemail“ und „Anmeldeseite“, „in Versorgung“, „Nachname, Vorname“.

### BEF-082 — Sechzehn Lesepfade verlieren ihren Abweisungseintrag hinter PostgREST

|         |   |
| ------- | - |
| Datum   | 2026-09-30 |
| Bereich | Serverfunktionen mit protokollierter Abweisung (ADR-010, G6a/G6b) |
| Quelle  | Zweitreview TRN-EPIC-001 (Review-Subagent), Katalogabfrage in `supabase/tests/audit.test.ts` |
| Status  | offen |
| Berührt | `find_free_slots`, `find_possible_duplicates`, `get_intake_checklist`, `get_practice_statistics`, `get_practice_targets`, `list_call_list`, `list_care_without_conclusion`, `list_ending_prescriptions`, `list_open_intakes`, `list_open_prescription_scans`, `list_practice_revenue_months`, `list_tasks`, `list_top_services`, `list_waitlist_entries`, `list_waitlist_matches`, `rate_slot_travel`; Muster aus `20260923120000_abgewiesene_lesezugriffe_rest.sql` |

**Beobachtung.** Diese Funktionen sind `STABLE` und schreiben im abgewiesenen Fall über `app.record_denied_read` einen `denied`-Eintrag. PostgREST ruft `STABLE`-Funktionen in einer lesenden Transaktion auf; das INSERT scheitert dort mit 25006, der Aufrufer bekommt einen Fehler statt einer leeren Antwort, und der Versuch steht **nicht** im Protokoll. `pnpm test:db` sieht das nicht, weil es über eine direkte Verbindung ohne lesende Transaktion ruft. Für die Pfade von TRN-EPIC-001 ist es behoben; eine Katalogregel in `audit.test.ts` hält die Liste fest und lässt sie nur schrumpfen.

**Erwartet.** Eine Migration, die die sechzehn Funktionen auf `VOLATILE` stellt (`alter function … volatile`, kein Neuschreiben), danach die Liste im Test leeren. Lokal mit `supabase start` als therapist gegenprüfen, dass ein abgewiesener Aufruf 200 mit leerer Antwort liefert und im Protokoll steht.

### BEF-120 — Ein Übersichtstest hängt an der Uhrzeit des Laufs

|         |   |
| ------- | - |
| Datum   | 2026-10-02 |
| Bereich | Tests, Übersicht |
| Quelle  | Loop ABN-EPIC-001b, voller Lauf von `pnpm test` am Abend |
| Status  | erledigt in ABN-EPIC-001b (PR #169: Uhr im Test festgesetzt) |
| Berührt | `src/features/today/MyDayPage.test.tsx` („fragt beim Oeffnen die Route des Tages ab …“, ANN-194) |

**Beobachtet:** Der Test legt die Termine relativ zur echten Uhr (in 60 Minuten, danach 75 Minuten Abstand). Um 21:18 Uhr Berliner Zeit fällt der zweite Termin über Mitternacht, und „≈ 9 min Rad · 66 min Puffer“ erscheint nicht; auf `main` ebenso rot, also unabhängig von ABN-EPIC-001b. **Erwartet:** Der Test setzt die Uhr fest (`vi.setSystemTime` auf einen Vormittag) und ist zu jeder Tageszeit grün. Behoben im selben PR, weil die CI sonst am Abend rot wird.

### BEF-121 — Ein Plattformtest hängt an der Uhrzeit des Laufs (Volljährigkeit)

|         |   |
| ------- | - |
| Datum   | 2026-10-02 |
| Bereich | Tests, Plattformzugang |
| Quelle  | Loop ABN-EPIC-001c, voller Lauf von `pnpm test:db` um 22:40 Uhr UTC |
| Status  | erledigt in ABN-EPIC-001c (PR #171: Tag der Praxis im Test; die CI war zur selben Uhrzeit rot) |
| Berührt | `supabase/tests/platform-accesses.test.ts` („verlangt ein Geburtsdatum und mindestens 18 Jahre“, ANN-190, ANN-208) |

**Beobachtet:** Der Test setzt das Geburtsdatum über `current_date` der Datenbank (UTC), die Einladung rechnet die Volljährigkeit am Tag der Praxis (Europe/Berlin). Zwischen 22 und 24 Uhr UTC ist das schon der nächste Tag; „noch nicht 18“ wird dann zu „18“, und die Einladung geht durch. Unabhängig von ABN-EPIC-001c (Datei nicht berührt). **Erwartet:** Der Test rechnet das Geburtsdatum mit dem Tag in der Zeitzone der Praxis (`(now() at time zone 'Europe/Berlin')::date`) und ist zu jeder Uhrzeit grün. Klein, Pfad S.

### BEF-122 — Ein Zusammenführungstest hängt an der Uhrzeit des Laufs (Terminüberschneidung)

|         |   |
| ------- | - |
| Datum   | 2026-10-03 |
| Bereich | Tests, Dubletten |
| Quelle  | CI von PR #172 (AKTE-007), Lauf um 06:14 Uhr UTC; lokal auf `main` um 06:36 Uhr UTC reproduziert |
| Status  | erledigt in AKTE-007 (PR #172: fester Terminbeginn um 20:00 UTC) |
| Berührt | `supabase/tests/patient-merge.test.ts` (`fuelle()`, PRX-017) |

**Beobachtet:** `fuelle()` legt für Anna einen 45-Minuten-Termin auf `now() - (100 + n) Tage`. Der Seed hat für Anna samstags Termine von 07:00 bis 08:00 UTC; läuft der Test zwischen etwa 06:15 und 08:00 UTC an einem Tag, an dem `100 + n` auf einen solchen Samstag fällt, verletzt der Termin `appointments_no_overlap`. Unabhängig von AKTE-007 (Datei nicht berührt). **Erwartet:** Der Termin beginnt `100 + n` Tage zurück immer um 20:00 UTC, wo kein Seed-Termin liegt, und der Test ist zu jeder Uhrzeit grün. Klein, Pfad S.

### BEF-123 — Eine ausgelieferte Migration wurde nachträglich geändert; die Test-Umgebung lief auseinander

|         |   |
| ------- | - |
| Datum   | 2026-10-03 |
| Bereich | CI, Migrationen, Test-Umgebung |
| Quelle  | Auslieferung „Test-Umgebung“ ab Lauf 62 rot; Ursache in PR #130 (Commit `5d11f19`, 2026-09-26) |
| Status  | erledigt (Gate `pnpm migrationen:check` im Job „Migrationen und RLS-Policies“; Test-Datenbank am 2026-10-03 neu aufgebaut) |
| Berührt | `supabase/migrations/20260926150000_dok_006b_patient_photos.sql`, `…160000_dok_006d_patient_photo_handout.sql`, `.github/workflows/ci.yml`, `scripts/migrationen-check.mjs` |

**Beobachtet:** PR #129 brachte `dok_006b` und `dok_006d` auf `main`, die Test-Umgebung spielte sie ein. PR #130 änderte beide Dateien eine halbe Stunde später (dritter Parameter `p_locked_at`, Spalte `photo_locked_at`, geänderte Rümpfe). `db push` führt eine eingespielte Version nie wieder aus; lokal und in der CI entstand die Datenbank aus der neuen Fassung, in der Test-Umgebung blieb die alte. Eine Woche später scheiterte `abn_023` dort an `app.patient_photo_accessible(uuid, timestamptz, timestamptz)`, und keine Auslieferung kam mehr an. **Erwartet:** Eine Migration auf `main` ist unveränderlich; eine Korrektur ist eine neue Migration, und eine neue Migration liegt hinter der jüngsten. Das prüft jetzt ein Gate; gegen die Historie gelaufen, hätte es genau PR #130 abgewiesen und sonst keinen der letzten 120 Merges.


### BEF-124 — Eine Verordnung kann hart gelöscht und ohne Verlauf geändert werden

|         |   |
| ------- | - |
| Datum   | 2026-10-03 |
| Bereich | Behandlungsgrundlage, Akte, § 630f BGB |
| Quelle  | LOG-EPIC-001, Inventur der Protokollierung (Vorgabe Jannes, 2026-10-03) |
| Status  | offen (eigenes Ticket, nicht in LOG-EPIC-001) |
| Berührt | `public.delete_treatment_basis`, `public.update_treatment_basis`, `public.transfer_appointments_to_treatment_basis`, `public.treatment_bases` |

**Beobachtet:** Seit LOG-EPIC-001 steht das Ändern, Löschen und Umhängen einer Behandlungsgrundlage nicht mehr im Auditlog. Das Datenmodell hält nur den letzten Stand (`updated_by`, `updated_at`); eine gelöschte Grundlage verschwindet ganz, auch wenn Termine an ihr hingen. Den Inhalt einer Änderung hat schon das alte Auditlog nicht gehalten. **Erwartet:** Eine Verordnung ist Teil der Akte. Sobald Termine an ihr hängen, wird sie nicht mehr hart gelöscht; ihre Änderungen bleiben mit ursprünglichem Inhalt und Zeitpunkt erkennbar (§ 630f Abs. 1 BGB), etwa über eine Versionstabelle wie bei der Dokumentation (ADR-016). Zu prüfen: welche Felder fachlich änderbar bleiben müssen und ob ADR-020 dafür eine Fassung braucht.

### BEF-127 — Die Koordinaten-Constraints lassen eine Breite ohne Länge durch

|         |   |
| ------- | - |
| Datum   | 2026-10-05 |
| Bereich | Datenmodell, Kartendienst |
| Quelle  | UBK-EPIC-002, Zweitreview (Testlücke am Garagen-Constraint) |
| Status  | offen (eigenes Ticket; der Garagen-Constraint aus UBK-015 ist bereits dicht) |
| Berührt | `patient_contact_details_coordinate_check`, `appointments_visit_coordinate_check`, `locations_coordinate_check` (Migration `20260925100000_map_006a_coordinates.sql`) |

**Beobachtet:** Die drei Constraints prüfen `lat between …`, `lon between …` und `geocode_precision in (…)` ohne ausdrückliches `is not null`. Ein CHECK, der NULL ergibt, gilt als erfüllt: Eine Breite ohne Länge oder eine Genauigkeit ohne Koordinate kommt durch, sobald die Adresse vollständig ist. Geschrieben wird heute nur über die Funktionen, die beides zusammen setzen, und der Trigger verwirft die Koordinate mit der Adresse - ein Fehler entsteht deshalb erst mit einem neuen Schreibweg. **Erwartet:** Eine neue Migration ersetzt die drei Constraints durch die dichte Form aus `locations_garage_coordinate_check` (UBK-015); vorher prüft sie, dass keine Zeile die engere Regel verletzt. Ein Test je Tabelle wie in `supabase/tests/garage.test.ts`. Klein, Pfad A (Migration).

### BEF-128 — Ein Abo-Monat lässt sich nach einem Storno nicht zurücknehmen

|         |   |
| ------- | - |
| Datum   | 2026-10-07 |
| Bereich | Abrechnung, Nachsorge-Abo |
| Quelle  | Zweitreview ANG-EPIC-002 (derselbe Fehler am Trainingspaket, dort behoben), am Code belegt |
| Status  | offen |
| Berührt | `public.delete_aftercare_month` in `supabase/migrations/20261014110000_ang_002_aftercare_months.sql`; ANN-270 |

**Beobachtung.** Nach einem Storno ist die Rechnungszeile freigegeben (`released_at`), zeigt aber weiter mit RESTRICT auf die Leistung. `delete_aftercare_month` löscht die Leistung, ohne die freigegebenen Zeilen vorher zu entfernen, und scheitert mit `invoice_items_billable_service_id_fkey`; die Oberfläche zeigt „Die Erfassung konnte nicht zurückgenommen werden.“

**Erwartet.** Wie in `delete_billable_services` und `delete_training_package`: freigegebene Zeilen der Leistung zuerst löschen, dazu ein Test „Storno → Zurücknehmen“ in `aftercare-months.test.ts`. Einzel-Story-Loop.

### BEF-129 — Ein widerrufener Trainingsvertrag fällt nach 14 Tagen aus Offene Punkte, auch wenn nichts abgewickelt ist

|         |   |
| ------- | - |
| Datum   | 2026-10-07 |
| Bereich | Training, Angebote |
| Quelle  | Zweitreview KND-EPIC-001 (Hinweis H5), am Code belegt |
| Status  | offen |
| Berührt | `public.list_platform_training_withdrawals` in `supabase/migrations/20261016140000_knd_004_training_withdrawal.sql`; ANN-290 |

**Beobachtung.** Nach einem Widerruf bleiben Paket, Leistung und Zugang zum Training bestehen (ANN-290). Offene Punkte zeigt den Widerruf 14 Tage lang; danach steht er nur noch am Trainingsverhältnis („Bitte Paket und Zahlung abwickeln“). Wird er übersehen, kann das Paket trotz Widerruf abgerechnet werden.

**Erwartet.** Jannes entscheidet, ob ein Widerruf in Offene Punkte bleibt, bis das Paket entfernt oder storniert ist (Bedingung statt 14 Tage), oder ob der Monatsentwurf des Trainings ein Paket mit Widerruf sperrt. Einzel-Story-Loop.

### BEF-130 — Abo-Tests rechnen „heute“ in UTC und werden zwischen 0 und 2 Uhr Berliner Zeit rot

|         |   |
| ------- | - |
| Datum   | 2026-10-07 |
| Bereich | Angebote, Prüfverfahren |
| Quelle  | Voller `pnpm test:db` in UEB-EPIC-002 um 00:08 Uhr Berliner Zeit (22:08 UTC); um 23:26 Uhr grün |
| Status  | erledigt (PR #202) |
| Berührt | `supabase/tests/aftercare-cancellation.test.ts`, `supabase/tests/aftercare-subscriptions.test.ts` |

**Beobachtung.** Drei Tests („trägt eine Kündigung zum Ende des laufenden Abo-Monats ein“, „kündigt über den Knopf …“, „legt ein Abo höchstens 14 Tage rückwirkend an“) vergleichen einen Kalendertag aus `current_date` der Datenbanksitzung (UTC) mit dem Tag der Praxis (Europe/Berlin). Kurz nach Mitternacht in Berlin liegt UTC noch am Vortag: erwartet `2026-10-07`, geliefert `2026-10-08`. Der Code ist richtig, die Erwartung nicht.

**Erwartet.** Die Tests leiten „heute“ aus `app.training_today(organization_id)` ab statt aus UTC – wie `praxistag()` in `supabase/tests/exercise-plans.test.ts`; keine Prüfung wird schwächer. **Erledigt** in PR #202, weil die CI dort nach Mitternacht rot wurde: beide Hilfsfunktionen und ein Update rechnen mit dem Tag der Praxis, um 00:40 Uhr Berliner Zeit reproduziert und grün.

### BEF-131 — Terminwünsche der Plattform fallen beim Zusammenführen mit der Dublette

|         |   |
| ------- | - |
| Datum   | 2026-10-09 |
| Bereich | Plattform, Dubletten |
| Quelle  | KOM-EPIC-001, Prüfung von `merge_patients` beim Einbau der Rückfragen |
| Status  | offen |
| Berührt | `public.merge_patients`, `public.platform_appointment_requests` (POR-009) |

**Beobachtung.** `merge_patients` löscht die Akte der Dublette; `platform_appointment_requests` hängt mit `on delete cascade` an ihr und wird nicht umgehängt. Ein offener oder beantworteter Terminwunsch der Dublette fällt damit beim Zusammenführen still weg. Die Rückfragen (KOM-004) ziehen seit diesem Loop mit; die Terminwünsche wurden bewusst nicht mitgeändert (kein Umbau außerhalb des Auftrags).

**Erwartet.** Eine Zeile in `merge_patients` (`update … set patient_id, relationship_id`) und ein Test in `patient-merge.test.ts`. Einzel-Story-Loop.

### BEF-132 — Plattformzugang an der Dublette: Rückfragen ziehen um, der Zugang nicht

|         |   |
| ------- | - |
| Datum   | 2026-10-09 |
| Bereich | Plattform, Dubletten |
| Quelle  | Zweitreview KOM-EPIC-001 (H2, H5) |
| Status  | offen |
| Berührt | `app.patient_merge_plan`, `public.merge_patients`, `public.add_platform_message_entry`, `public.answer_platform_message` |

**Beobachtung.** Hat die Dublette einen Plattformzugang, ziehen ihre Rückfragen zur bleibenden Akte, der Zugang aber endet mit der Dublette – die Person sieht die Antwort auf ihre Frage nicht mehr. `patient_merge_plan` kennt keinen Sperrgrund dafür, und `counts` nennt die Rückfragen nicht. Daneben (H5): Erledigen und Nachtragen zur selben Zeit enden statt mit 22023 mit dem Constraint-Fehler 23514 – keine Daten gehen verloren, nur die Meldung ist unschön.

**Erwartet.** Sperrgrund `source_has_platform_access` (die Praxis klärt den Zugang vorher, wie ANN-149) und `platform_messages` in `counts`; für H5 eine Zeilensperre vor der Zustandsprüfung. Einzel-Story-Loop mit Zweitreview.

