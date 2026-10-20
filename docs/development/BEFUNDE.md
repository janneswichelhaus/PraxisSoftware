# Befunde an der laufenden Anwendung

Stand: 2026-10-20

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
Die Lösungsanalyse zu den Befunden bis 2026-10-02 liegt in
[`archiv/BEFUNDE-LOESUNGEN.md`](archiv/BEFUNDE-LOESUNGEN.md); auch sie hat keinen Rang.

**Befunde gehen in Bereichsüberholungen** (seit 2026-10-12): Die offenen
Befunde eines Bereichs werden die ersten Stories seiner nächsten Überholung
(`/bereich`); andere werden gebündelt in einem Auftrag erledigt, nicht als
eigener Einzel-Story-Loop. Abläufe misst nicht mehr eine Ablaufrunde
([`archiv/OPTIMIERUNG.md`](archiv/OPTIMIERUNG.md)), sondern die Tipp-Budgets in
[`../product/kernablaeufe.md`](../product/kernablaeufe.md).

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
Messwerte (Pixel, Taps, Sekunden) sind Beobachtungen von Jannes selbst, aus dem
Code oder per Playwright auf Seed-Daten — nie aus Telemetrie und nie an
Mitarbeitenden (§20).

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


### BEF-127 — Die Koordinaten-Constraints lassen eine Breite ohne Länge durch

|         |   |
| ------- | - |
| Datum   | 2026-10-05 |
| Bereich | Datenmodell, Kartendienst |
| Quelle  | UBK-EPIC-002, Zweitreview (Testlücke am Garagen-Constraint) |
| Status  | offen (eigenes Ticket; der Garagen-Constraint aus UBK-015 ist bereits dicht) |
| Berührt | `patient_contact_details_coordinate_check`, `appointments_visit_coordinate_check`, `locations_coordinate_check` (Migration `20260925100000_map_006a_coordinates.sql`) |

**Beobachtet:** Die drei Constraints prüfen `lat between …`, `lon between …` und `geocode_precision in (…)` ohne ausdrückliches `is not null`. Ein CHECK, der NULL ergibt, gilt als erfüllt: Eine Breite ohne Länge oder eine Genauigkeit ohne Koordinate kommt durch, sobald die Adresse vollständig ist. Geschrieben wird heute nur über die Funktionen, die beides zusammen setzen, und der Trigger verwirft die Koordinate mit der Adresse - ein Fehler entsteht deshalb erst mit einem neuen Schreibweg. **Erwartet:** Eine neue Migration ersetzt die drei Constraints durch die dichte Form aus `locations_garage_coordinate_check` (UBK-015); vorher prüft sie, dass keine Zeile die engere Regel verletzt. Ein Test je Tabelle wie in `supabase/tests/garage.test.ts`. Klein, Pfad A (Migration).

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

### BEF-140 — Drei Löschkandidaten aus dem Leitfaden fallen weg

|         |   |
| ------- | - |
| Datum   | 2026-10-10 |
| Bereich | Übersicht, Stammdaten, Tour |
| Quelle  | Jannes, Entscheidung zu den Löschkandidaten in `docs/design/leitfaden-schlank.md` (2026-10-10) |
| Status  | teilweise erledigt (1 und 2 am 2026-10-11), offen: 3 |
| Berührt | Übersicht (`src/features/today/MyDayPage.tsx`), Formular der Person (`phone_work`), `src/features/tours/Tourenliste.tsx` |

**Entscheidung (Jannes, 2026-10-10).** (1) Der Aufklapper „Organisatorisches und Kommunikation“ am Ende der Übersicht fällt weg; „Panne melden“ bleibt im Fuhrpark erreichbar. (2) „Telefon (geschäftlich)“ verschwindet aus dem Formular; die Spalte `phone_work` bleibt, damit Auskunft, Zusammenführen und Bestand unberührt sind. (3) „Andere Ziel-App prüfen (für die Gerätebewertung)“ unter der Tourliste fällt weg, sobald die Sichtung Kartendienst die Gerätebewertung abgeschlossen hat.

**Erwartet.** (1) und (2) in einem Loop, nur Oberfläche: Komponenten und Tests anpassen, Sichtprüfung bei 375 und 1280 px. Ob ein vorhandener Wert in `phone_work` noch lesend erscheint, entscheidet der Loop als Annahme. (3) nach der Sichtung Kartendienst, mit der Sichtungsdatei.

**Umsetzung (1) und (2), 2026-10-11.** Der Aufklapper samt seiner Vorschaukarten ist aus `MyDayPage.tsx` entfernt. „Telefon (geschäftlich)“ erscheint im Formular nur noch, wenn die Akte beim Öffnen schon eine Nummer trägt – dann berichtigbar und leerbar; in den Stammdaten bleibt sie lesend (ANN-340). Sichtung: [UX-Review](../sichtung/ux-review.md) Schritt 10. Offen bleibt (3).

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

### BEF-153 — Spracheingabe auf der Schreibseite

|         |   |
| ------- | - |
| Datum   | 2026-10-14 |
| Bereich | Dokumentation |
| Quelle  | Jannes, Durchsicht am Rechner (Befund B3) |
| Status  | erledigt mit Nachbildung in PR #243 (gemergt 2026-10-15); offen: Anbieter und Mikrofon (Jannes, Frage 1 im Bericht) |
| Berührt | `CompleteTreatmentPage`, Edge Function `ai-gateway`, E13 |

**Beobachtung.** Diktieren geht nicht; die Doku entsteht nur getippt oder aus Bausteinen.

**Erwartet.** Spracheingabe über das AI Gateway, in Entwicklung und Test gegen eine Nachbildung; den Anbieter entscheidet Jannes (ADR-002, ADR-005).

### BEF-166 — Ein Rad kennt keine Löschsperre

|         |   |
| ------- | - |
| Datum   | 2026-10-15 |
| Bereich | Radflotte (`/betrieb/flotte…`), Löschlauf |
| Quelle  | FLT-EPIC-001, Bau des Löschlaufs `app.delete_due_fleet_records` |
| Status  | offen; Bedingung vor dem Scharfschalten |
| Berührt | `supabase/migrations/20261119100000_flt_001_radflotte.sql` (Abschnitt 22); ANN-551, ANN-033; ADR-008 |

**Beobachtung.** Check-Ups, Pannen und Sperren fallen drei Jahre nach dem Ereignis von selbst; eine Löschsperre gibt es nur an der Akte (ANN-033). Ist ein Unfall mit einem Rad länger streitig, fiele der Nachweis der Pflege.

**Erwartet.** Eine Löschsperre je Rad mit Grund, gesetzt von `owner`, die der Löschlauf beachtet. Bis dahin lässt sich eine fällige Löschung nicht anhalten; die Unterlage für die Werkstatt ersetzt das nicht, sie zeigt nur offene Stellen. Bedingung vor dem Scharfschalten, Pfad A (Löschpfad).

### BEF-167 — Fotos am Rad: Ein verlorenes Objekt fällt erst beim Öffnen auf

|         |   |
| ------- | - |
| Datum   | 2026-10-15 |
| Bereich | Radflotte, Fotos am Rad |
| Quelle  | FLT-EPIC-001, Review der Fotos am Rad (Subagent) |
| Status  | offen |
| Berührt | `supabase/migrations/20261119110000_flt_002_fotos_am_rad.sql`, `src/features/fleet/Fotoreihe.tsx`; ADR-017 (Abgleich); ANN-552 |

**Beobachtung.** Die Dateien der Akte tragen nach dem Abgleich mit dem Speicher `object_missing` und sagen das in der Liste. Die Fotos am Rad kennen das Kennzeichen nicht; ein verlorenes Foto steht in der Fotoreihe wie jedes andere und meldet erst beim Öffnen einen Fehler.

**Erwartet.** Derselbe Abgleich und dasselbe Kennzeichen wie bei den Dateien der Akte; die Fotoreihe sagt, dass das Foto fehlt. Pfad A (Dateien).

### BEF-170 — Einzeln gelöschte Dateien der Akte fehlen im Löschjournal

|         |   |
| ------- | - |
| Datum   | 2026-10-16 |
| Bereich | Akte, Dateien (`delete_patient_file`); Wiederherstellung |
| Quelle  | Zweitreview FLT-EPIC-001 (Subagent), Vergleich mit den Fotos am Rad |
| Status  | offen |
| Berührt | `supabase/migrations/20261006110100_log_001b_schreibpfade.sql` (`delete_patient_file`), `reapply_deletion_journal`; ADR-008 Punkt 8, ADR-017 Punkt 26 |

**Beobachtung.** Der Löschlauf schreibt fällige Dateien ins Löschjournal, `delete_patient_file` aber nicht. Nach einer Wiederherstellung käme eine einzeln gelöschte Datei zurück, etwa ein falsch zugeordnetes Foto. Die Anhänge an Rückfragen (`app.remove_message_attachments`) und seit FLT-EPIC-001 die Fotos am Rad journalisieren jede Löschung.

**Erwartet.** Ein Journaleintrag `patient_files` in `delete_patient_file`, dazu ein Test mit Wiederherstellung wie in `fleet-photos.test.ts` („Löschjournal“). Pfad A (Löschpfad).

### BEF-171 — Uberspace bricht die SSH-Verbindung der Auslieferung vor dem Handshake ab

|         |   |
| ------- | - |
| Datum   | 2026-10-16 |
| Bereich | Betrieb: Test-Umgebung, Auslieferung (OPS-002a) |
| Quelle  | Workflow „Test-Umgebung“, Lauf 149 nach #252, zweimal (08:23 und 09:09 Uhr) |
| Status  | offen |
| Berührt | `.github/workflows/test-umgebung.yml` (Schritt „Verbindung aufbauen“), `verbinde` in `scripts/testumgebung.mjs`; ANN-559 |

**Beobachtung.** Build, Migrationen und Kartendienst liefen durch; die erste SSH-Verbindung zu `janus.uberspace.de` brach der Server ab, bevor ein Schlüssel geprüft wurde (`kex_exchange_identification: read: Connection reset by peer`). Ein neuer Versuch 45 Minuten später scheiterte gleich; bis zum 15.10., 23:44 Uhr, ging derselbe Ablauf. Seitdem zeigt die Test-Umgebung die Oberfläche von #250 auf der Datenbank von #252.

**Erwartet.** Die Auslieferung übersteht eine kurze Drosselung (bis zu fünf Versuche, ANN-559). Hält der Abbruch an: den Zugang von einem anderen Rechner prüfen (`ssh -4`) und bei Uberspace erfragen, ob Adressen von GitHub Actions gesperrt sind.

### BEF-176 — Panne und Einstiege am Lastenrad: Platzhalter statt Anruf, Frage nach dem Wochentag, Weg zur Radflotte

|         |   |
| ------- | - |
| Datum   | 2026-10-17 |
| Bereich | Radflotte (G3, G4), Hausbesuch (G1) |
| Quelle  | Praxis- und Design-Review der Überholung 6 |
| Status  | offen |
| Berührt | `src/features/fleet/standortvorlage.ts`, `src/features/fleet/Pannenfenster.tsx`, `src/features/fleet/FleetPage.tsx`, `src/features/appointments/HomeVisitFlow.tsx` |

**Beobachtung.** (1) „Rad zurücklassen“ verlangt den Anruf bei der Werkstatt (Platzhalter „noch nicht hinterlegt“, fest in der Köln-Vorlage) und eine Nachricht im Team-Kanal „Flotte“, den es nicht gibt; die Zusammenfassung lässt beides als erledigt bestätigen. (2) „Ist heute Mittwoch?“ fragt, was die App weiß („Heute ist Freitag.“). (3) „Panne melden“ und „Schlüssel übergeben“ beginnen nur auf der Radflotte, drei Tipps vom Rad entfernt. (4) Die Zusammenfassung der Panne rollt bei 375 × 667; der Satz zum Ersatzrad steht nur dort, nicht in der Meldung danach. (5) G1 Seite „Angerufen?“: der Anrufknopf oben, „Erreicht – Besuch findet statt“ im Daumenbereich direkt unter der Antwort. (6) Zwei Bedingungen in einer Ja/Nein-Frage (Depot), Titel und Kasten wiederholen sich (Reparieren).

**Erwartet.** Mit der Tübinger Vorlage (ANN-554): Werkstatt und Teamleitung als Anrufknopf, die Ruhetagsfrage aus dem Datum, „Panne melden“ an der Karte des nächsten Wegs, die Zusammenfassung kürzer und das Ersatzrad in der Meldung; bei G1 der Anruf als Hauptknopf.

**Vermerk TEAM-001 (2026-10-17).** Statt eines Team-Kanals „Flotte“ hat die Radflotte jetzt die Ansicht „Nachrichten“ (ANN-613); die Panne kann darauf verweisen. Der Rest bleibt offen.

### BEF-177 — Urheber und Zeitpunkt des Wochenplans stehen jeder Praxisrolle offen

|         |   |
| ------- | - |
| Datum   | 2026-10-17 |
| Bereich | Arbeitszeit, Planung (`staff_working_hours`) |
| Quelle  | Zweitreview der Überholung 8 (AZ-001) |
| Status  | offen (Vorschlag) |
| Berührt | `supabase/migrations/20260830120100_working_hours.sql` (Tabellenrecht), `src/features/scheduling/api.ts` |

**Beobachtung.** Der Wochenplan ist mit Tabellenrecht lesbar (seit CAL-005), also auch `created_by` und `created_at`. Seit den Fassungen (ANN-589) zeigt das, wer eine genehmigte dauerhafte Änderung eingetragen hat und wann – jeder Praxisrolle, solange die Fassung gilt. Die Abweichungen haben dafür seit URL-001 ein Spaltenrecht (ANN-580). **Erwartet.** Wie bei den Abweichungen nur die Spalten, die Kalender und Planung brauchen (`id`, `organization_id`, `staff_member_id`, `weekday`, `starts_at`, `ends_at`, `valid_from`, `valid_until`); Pfad A, eine Migration mit Negativtest.

### BEF-178 — Beschäftigtendaten werden automatisch gelöscht, eine Löschsperre gibt es nur für Patientenakten

|         |   |
| ------- | - |
| Datum   | 2026-10-17 |
| Bereich | Aufbewahrung und Löschung (ADR-008), Urlaub, Arbeitszeit, Zeitkonto |
| Quelle  | Zweitreview der Überholung 9 (ZK-001), gilt seit Überholung 7 |
| Status  | eingeplant: eigener Auftrag (Pfad A), Entscheidung Jannes 2026-10-17 |
| Berührt | `app.delete_due_staff_leave` (URL-001), `app.delete_due_working_time_requests` (AZ-001), `app.delete_due_time_account_entries` (ZK-001), `public.legal_holds` |

**Beobachtung.** ANN-033 lässt die Löschsperre nur für Patientenakten zu, weil es für Beschäftigtendaten keine automatische Löschung gab. Seit URL-001 löscht der Lauf Urlaubsanträge und -ansprüche, seit AZ-001 Arbeitszeitänderungen, mit ZK-001 auch gültige Zeitkonto-Einträge – jeweils an der Verjährungsgrenze, an der ein laufender Streit sie bräuchte. ADR-008 Punkt 7 verlangt, dass eine Sperre automatische Löschung während laufender Vorgänge verhindert.

**Erwartet.** Änderungspfad von ANN-033: Gegenstand `staff_member` zulassen (owner setzt und hebt auf wie bei Akten) und in den drei Löschregeln `app.under_legal_hold(…, 'staff_member', …)` prüfen. Das schreibt Auditeinträge zu einem neuen Gegenstand und braucht deshalb Jannes' Freigabe (ADR-010, Label `freigabe-audit`); bis dahin nichts gebaut. Genehmigtes und Gültiges fällt frühestens Anfang 2030.

**Entscheidung (Jannes, 2026-10-17).** Wie empfohlen: ein eigener kleiner Pfad-A-Auftrag für Urlaub, Arbeitszeit, Zeitkonto und Erstattungen zusammen; die Auditeinträge zum neuen Gegenstand brauchen an dessen PR weiter das Label `freigabe-audit`.

### BEF-179 — Zeitkonto: Eine Zurückweisung erreicht die Person nicht von selbst

|         |   |
| ------- | - |
| Datum   | 2026-10-17 |
| Bereich | Zeitkonto (`/betrieb/zeitkonto`), Übersicht „Noch offen“ |
| Quelle  | Praxis-Review der Überholung 9 (ZK-001), Frage an Jannes |
| Status  | eingeplant: Folge-Story im Zeitkonto, Entscheidung Jannes 2026-10-17 |
| Berührt | `list_time_account`, `src/features/today/NochOffen.tsx` |

**Beobachtung.** Weist owner einen Freizeitausgleich zurück, ist die Zeit sofort wieder Arbeitszeit; die Person sieht das nur, wenn sie ins Zeitkonto schaut. **Erwartet.** Ein zurückgewiesener Eintrag mit kommendem Tag steht bei der Person unter „Noch offen“ in der Übersicht, bis der Tag vorbei ist – ohne Benachrichtigung, Push bleibt aus.

### BEF-180 — Zeitkonto: Ein Freizeitausgleich für heute lässt sich nicht zurücknehmen

|         |   |
| ------- | - |
| Datum   | 2026-10-17 |
| Bereich | Zeitkonto (`/betrieb/zeitkonto`) |
| Quelle  | Praxis-Review der Überholung 9 (ZK-001), Runde 2 |
| Status  | eingeplant: eigener kleiner Auftrag (Pfad A), Entscheidung Jannes 2026-10-17 |
| Berührt | `public.withdraw_time_account_entry` und `can_withdraw` in `list_time_account` (`20261126100000_zk_001_zeitkonto.sql`), `TimeAccountPage.tsx` |

**Beobachtung.** Zurücknehmen geht beim Freizeitausgleich nur vor seinem Tag (`on_date > heute`); wer heute doch bleibt, kann den Eintrag für heute nicht zurücknehmen. **Erwartet.** Zurücknehmen auch am Tag selbst, solange die freie Zeit noch nicht begonnen hat; die Abweichung im Kalender fällt mit dem Eintrag. Pfad A: Prüfung am Server, Negativtests.

### BEF-184 — Einwilligung „Ernährungsberatung“: das unterschriebene Blatt bleibt außerhalb der Anwendung

|         |   |
| ------- | - |
| Datum   | 2026-10-18 |
| Bereich | Akte und Trainingsverhältnis, Reiter Ernährung |
| Quelle  | Praxis-Review ERN-EPIC-001 |
| Status  | offen: Vorschlag (ADR-017, Dateien) |
| Berührt | `ProfilFormular.tsx`, Dateiablage der Akte |

**Beobachtung.** Das Anlegen verlangt die Einwilligung „auf Papier unterschrieben“; den Wortlaut zeigt das Formular seit dem Review, ein Foto des Blatts lässt sich aber nicht ablegen wie beim Anmeldebogen. Der Nachweis nach Art. 7 Abs. 1 liegt im Ordner. **Erwartet.** „Unterschriebenes Blatt fotografieren“ am Kästchen, abgelegt als Dokument der Akte bzw. des Verhältnisses mit der Frist der Ernährungsberatung.

### BEF-188 — Gesperrte Anhänge an Rückfragen lassen sich nicht herausgeben

|         |   |
| ------- | - |
| Datum   | 2026-10-20 |
| Bereich | Akte, Rückfragen der Plattform; Betroffenenrechte |
| Quelle  | Zweitreview BEF-146 |
| Status  | offen: Vorschlag (ADR-017 Abschnitt L, Pfad A) |
| Berührt | `public.issue_message_attachment_link`, `app.message_attachment_visible` |

**Beobachtung.** Die Auskunft nennt jeden Anhang an einer Rückfrage, auch gesperrte (Legal Hold). Öffnen kann die Praxis aber nur bestätigte, nicht gesperrte und höchstens 30 Tage alte Anhänge; ein Gegenstück zu `hand_out_patient_photo` gibt es nur für Fotos der Akte. `nicht_enthalten` sagt das seit dem Zweitreview. **Erwartet.** Eine protokollierte Herausgabe gesperrter Anhänge für owner, wie bei den Fotos der Akte.
