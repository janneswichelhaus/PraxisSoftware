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


### BEF-140 — Drei Löschkandidaten aus dem Leitfaden fallen weg

|         |   |
| ------- | - |
| Datum   | 2026-10-10 |
| Bereich | Übersicht, Stammdaten, Tour |
| Quelle  | Jannes, Entscheidung zu den Löschkandidaten in `docs/design/leitfaden-schlank.md` (2026-10-10) |
| Status  | offen |
| Berührt | Übersicht (`src/features/today/MyDayPage.tsx`), Formular der Person (`phone_work`), `src/features/tours/Tourenliste.tsx` |

**Entscheidung (Jannes, 2026-10-10).** (1) Der Aufklapper „Organisatorisches und Kommunikation“ am Ende der Übersicht fällt weg; „Panne melden“ bleibt im Fuhrpark erreichbar. (2) „Telefon (geschäftlich)“ verschwindet aus dem Formular; die Spalte `phone_work` bleibt, damit Auskunft, Zusammenführen und Bestand unberührt sind. (3) „Andere Ziel-App prüfen (für die Gerätebewertung)“ unter der Tourliste fällt weg, sobald die Sichtung Kartendienst die Gerätebewertung abgeschlossen hat.

**Erwartet.** (1) und (2) in einem Loop, nur Oberfläche: Komponenten und Tests anpassen, Sichtprüfung bei 375 und 1280 px. Ob ein vorhandener Wert in `phone_work` noch lesend erscheint, entscheidet der Loop als Annahme. (3) nach der Sichtung Kartendienst, mit der Sichtungsdatei.

### BEF-141 — Rechnungsliste, offene Posten und Zahlungen zeigen bei ausgestellten Rechnungen den heutigen Empfängernamen

|         |   |
| ------- | - |
| Datum   | 2026-10-10 |
| Bereich | Abrechnung: Rechnungsliste, offene Posten, Zahlungen, Suche |
| Quelle  | Zweitreview UX-EPIC-008 (S3) |
| Status  | offen |
| Berührt | `list_invoices`, `list_open_items`, `list_payments` (`supabase/migrations/20261012110000_abr_033_rechnungsliste_suche.sql`); ADR-009 Punkt 10 |

**Beobachtung.** Seit UX-008c lassen sich Empfänger bearbeiten. Das Blatt und die Zahlungserinnerung lesen den Snapshot und bleiben gleich; die drei Listen und die Suche lesen den Namen aber live aus `invoice_recipients` und zeigen bei ausgestellten und stornierten Rechnungen den geänderten Namen.

**Erwartet.** Einzel-Story-Loop im kritischen Pfad: Für `status = 'issued'` den Empfänger aus `snapshot -> 'recipient'` lesen, die Suche ebenso; Datenbanktest „Empfänger geändert, Liste zeigt den alten Namen“. Bis dahin sagt die Oberfläche nur, dass das Blatt bleibt.

### BEF-142 — Der Einwilligungstext der Plattform verspricht beim Widerruf „alle Fotos“

|         |   |
| ------- | - |
| Datum   | 2026-10-10 |
| Bereich | Plattform: Einwilligungen (`src/features/platform/einwilligungstexte.ts`) |
| Quelle  | UX-008a, beim Prüfen des Foto-Widerrufs |
| Status  | offen |
| Berührt | `einwilligungstexte.ts` (Zweck `patient_photos`, Satz zum Widerruf); ADR-017 Punkt 46 |

**Beobachtung.** Der Satz „Die Praxis löscht dann sofort alle Fotos, die sie von Ihnen hat.“ stimmt nicht: Der Widerruf löscht die Arbeitshilfen; Dokumentationsfotos gehören zur Akte und bleiben (ADR-017 Punkt 46). In der Praxis ist der Satz mit UX-008a berichtigt.

**Frage an Jannes.** Der Text ist ein Einwilligungstext an die Person – soll er lauten „… alle Fotos, die als Arbeitshilfe entstanden sind; Fotos, die zur Behandlungsdokumentation gehören, bleiben in der Akte“? Eine Änderung braucht eine neue Fassung des Textes.
