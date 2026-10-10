# Annahmenregister

Zuletzt aktualisiert: 2026-10-10.

Begründete, **vorläufige** Annahmen: Festlegungen, die eine Aufgabe brauchte,
die aber weder `PROJECT_PRINCIPLES.md` noch ein ADR noch die
Feature-Spezifikation trifft (§15.1). Eine Annahme füllt eine Lücke und
überschreibt nichts; sie ist dafür gebaut, bestätigt, geändert oder verworfen zu
werden — insbesondere durch die Datenschutzprüfung vor Produktivstart (ADR-007).
Sie DARF NICHT einer MUSS- oder DARF-NICHT-Anforderung widersprechen, keine
Sicherheits- oder Datenschutzmaßnahme aufweichen und nichts berühren, was §3.1
bis §3.3 und ADR-013 regeln. Was das bräuchte, ist keine Annahme, sondern eine
Änderungsanfrage an Jannes. Überbrückt eine Annahme einen Punkt aus
`OPEN_DECISIONS.md`, bleibt der Punkt dort offen und verweist auf die Kennung.

## Lebenszyklus

| Status | Bedeutung |
|---|---|
| `offen` | getroffen und umgesetzt, noch von niemandem bestätigt |
| `entschieden (Jannes)` | Jannes hat die Festlegung selbst getroffen oder bestätigt. Für `Praxisprozess` und `Technik` ist der Eintrag damit erledigt; für `Datenschutz` und `Recht` ist es **keine** externe Bestätigung — der Eintrag bleibt im Prüfpaket |
| `bestätigt (Prüfung)` | von der Datenschutzprüfung oder der zuständigen externen Stelle bestätigt, mit Datum und Instanz |
| `geändert` | die Prüfung hat eine andere Festlegung verlangt; der Eintrag nennt die neue |
| `verworfen` | die Annahme wurde aufgegeben; der Eintrag nennt, was stattdessen gilt |
| `in ADR überführt` | bestätigt und als ADR festgehalten; Verweis auf die ADR-Nummer |

Die Trennung von `entschieden (Jannes)` und `bestätigt (Prüfung)` ist nötig,
weil §15.1 Punkt 5 für `Datenschutz` und `Recht` den Datenschutzprozess nach
§3.7 verlangt: Jannes' Festlegung zählt fürs Bauen, nicht für die Freigabe. Kein
Eintrag verschwindet — Kopf, Statuszeile und Anker bleiben auch dann stehen,
wenn eine Annahme verworfen oder in einen ADR überführt wurde; ihr Wortlaut
steht dann in der Git-Historie.

## Aufbau eines Eintrags

Kennung und Titel, darunter eine Statuszeile
`Kategorie · Status · Datum · Instanz · Zusatz · Wiedervorlage: …` und vier
Absätze: **Annahme** (ein bis drei Sätze, so konkret, dass man sie widerlegen
kann), **Begründung** (Quellen — Gesetz, Behördenleitlinie, ADR, Praxislogik;
Unsicheres steht als unsicher da), **Anker** (wo sie greift: Datei, Funktion,
Migration, Test) und **Änderungspfad** (was zu tun ist, wenn sie nicht hält, mit
Aufwand `klein` = eine Stelle, `mittel` = ein Modul oder eine Migration ohne
Datenumzug, `groß` = mehrere Module oder Datenumzug). Optional **Ablösung**
(„ersetzt ANN-…" / „abgelöst durch ANN-…"; beide Einträge tragen sie).
Kategorien sind `Datenschutz`, `Recht`, `Praxisprozess` und `Technik`; der
Zusatz der Statuszeile ist `Prüfpaket` (siehe unten), `erledigt` (jeder andere
Status als `offen`) oder `—` (`offen`). Die Instanz ist, wer entschieden oder
bestätigt hat, bei `offen` also `—`.

**Reversibel verankern** ist eine Entwurfsregel, keine Kür: Eine Annahme SOLLTE
an genau einer Stelle greifen — eine Policy-Funktion, ein Konfigurationswert,
eine Konstante, eine Migration. Wäre der Änderungsaufwand `groß`, ist das ein
Signal, vor der Umsetzung nachzufragen.

### Kennung im Code

Die Stelle, an der eine Annahme greift, trägt ihre Kennung im Kommentar
(`-- ANN-002: …` in SQL, `// ANN-005: …` in TypeScript). Alle Verankerungen
findet `git grep -n "ANN-[0-9]\{3\}" -- ':!docs/decisions/ASSUMPTIONS.md'`.
Eine Kennung im Code ohne Eintrag hier — oder ein Eintrag, dessen Anker im Code
keine Kennung trägt — ist ein Mangel, der im Review auffallen muss.

## Prüfpaket für die Datenschutzprüfung

Arbeitsliste sind die Einträge der Kategorien `Datenschutz` und `Recht` mit
Status `offen` oder `entschieden (Jannes)`; ihre Statuszeile trägt dafür den
Zusatz `Prüfpaket` (heute 100 Einträge):
`grep -n -A2 '^### ANN-' docs/decisions/ASSUMPTIONS.md | grep 'Prüfpaket'`.
Welche Stelle prüft, nennt die Wiedervorlage — meist die Datenschutzprüfung,
bei Steuerfragen die Steuerberatung (B4), bei Lizenzen der Lizenzgeber (B8).
Je Eintrag bestätigen oder eine andere Festlegung verlangen — der Änderungspfad
sagt vorab, was eine Änderung kostet, die Prüfung muss den Code dafür nicht
lesen. Das Ergebnis kommt in den Eintrag (Status, Datum, Instanz); eine geänderte
Annahme wird als eigene Aufgabe umgesetzt. Vor Produktivstart MUSS jeder Eintrag
der Kategorien `Datenschutz` und `Recht` auf `bestätigt (Prüfung)`, `geändert`,
`verworfen` oder `in ADR überführt` stehen — `offen` und `entschieden (Jannes)`
blockieren beide den Produktivstart (`docs/DEVELOPMENT.md`, Go-live-Blocker;
ROADMAP M3).

Verlauf der Einträge: `git log -- docs/decisions/ASSUMPTIONS.md`.

---

## Einträge

### ANN-001 — Interne Initialfristen des Retention Schedule

Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung / DSFA-Prozess vor Produktivstart · **LOG-EPIC-001:** gilt weiter für `retention.applied` und am Server verworfene Dateien (`access.denied`). · **LOG-EPIC-001 (2026-10-03):** gegenstandslos – Einstellungen und Arbeitszeiten schreiben keinen Auditeintrag mehr (ANN-230).

**Annahme.** Die Fristen ohne unmittelbare gesetzliche Vorgabe gelten vorläufig so, wie ADR-008 und ADR-011 sie tabellieren — von 7 Tagen (nicht angenommene KI-Entwürfe) über 30 Tage (Routing-Rohdaten, Operational Logs) und 12 Monate (Terminanfragen ohne Behandlungsverhältnis, Auth-/Securitylogs, Teamchat rollierend) bis 3 Jahre (abgesagte Termine und No-shows ohne Rechnung ab Jahresende, organisatorische Patientenkommunikation, Patientenakten-Auditlog, AI-Gateway-Metadaten).

**Begründung.** Art. 5 Abs. 1 lit. e DSGVO verlangt je Zweck eine definierte Frist; gesetzlich bestimmt sind nur Behandlungsunterlagen (§630f Abs. 3 BGB) und steuerlich relevante Belege (§147 AO, §257 HGB). Die übrigen hat ADR-008 als interne Initialentscheidung gesetzt und selbst zur Validierung vorgemerkt; §195 BGB und Art. 5 Abs. 2 DSGVO sind naheliegende Anker, aber eine Lesart, keine belegte Herleitung.

**Anker.** `public.retention_classes` in `supabase/migrations/20260911150000_retention_schedule.sql` — die einzige Stelle für alles, was in unserer Datenbank liegt, gelesen nur über `app.retention_interval()`; Zuordnung in `public.retention_assignments`, geprüft von `supabase/tests/retention.test.ts`. **Betriebslogs liegen nicht dort** und hatten deshalb bis OPS-004 als einziger Wert der Tabelle keinen Ort im Code: Ihre 30 Tage stehen seit 2026-09-22 als `BETRIEBSLOG_FRIST_TAGE` in `src/lib/protokoll.ts`, gehalten gegen die Tabelle in ADR-011 Punkt 4. Sie sind dort die **Anforderung**, nicht der gemessene Zustand — R14 (Plattformfrist 1 bis 28 Tage) ist damit sichtbar und nicht stillschweigend auf die kleinere Zahl gedreht.

**Änderungspfad.** Frist ändern: Migration mit `update` auf `public.retention_classes`, Tabelle in ADR-008 nachziehen · Aufwand `klein`. Neue Frist, wo bisher keine galt: zusätzlich fachlicher Anker und Regel in `public.apply_retention()` · Aufwand `mittel`. Betriebslogs gehen den anderen Weg: eine Zahl in `src/lib/protokoll.ts` und dieselbe Zeile in ADR-011 · Aufwand `klein` — dass die Plattform sie einhält, ist damit aber nicht gesagt (R14). Bewusst kein Klickweg in der Oberfläche (ADR-013).

**Abnahme (Jannes, 2026-10-02).** Vorläufig bestätigt; bleibt zur Datenschutzprüfung vorgemerkt. Präzisiert: „30 Tage“ gilt nur für Betriebslogs (ADR-011); Sicherheits- und Authentifizierungslogs (12 Monate) und das Auditlog (drei Jahre, ANN-029) haben eigene Fristen.

### ANN-002 — Versorgungsstatus `inactive` und Rollenschnitt des Wechsels

Praxisprozess · entschieden (Jannes) · 2026-09-08 · Jannes · erledigt · Wiedervorlage: Jannes (Rollenschnitt, B9); der Behandlungsabschluss ist mit ANN-032 erledigt

**Ablösung.** abgelöst durch ANN-032 in der Frage „Behandlungsabschluss"

**Annahme.** `inactive` ist eine rein organisatorische Markierung („nicht in laufender Versorgung"), kein Behandlungsabschluss im Sinne von ADR-008, und startet keine Aufbewahrungsfrist. Den Status wechseln dürfen `owner`, `team_lead` und `office`, `therapist` nicht.

**Begründung.** Der Wechsel nimmt eine Person aus dem laufenden Betrieb und ist damit Praxisführung und Verwaltung (`PROJECT_PRINCIPLES.md` §4.1, §4.3, §4.5), kein Behandlungsschritt; der „Abschluss der Behandlung" ist in ADR-008 eigene Folgefrage und braucht ein eigenes Feld mit ADR-Bezug.

**Anker.** `app.can_change_patient_status()` und `set_patient_status` in `supabase/migrations/20260829110000_patient_status.sql`; Abnahmeschritt PAT-003 in `docs/development/archiv/abnahme/etappe-0-patienten-und-termine.md`.

**Änderungspfad.** Rollenschnitt: Migration, die `app.can_change_patient_status()` ersetzt · Aufwand `klein`. Behandlungsabschluss: eigenes Feld und eigene Regel statt dieser Funktion · Aufwand `mittel`, weil die klinische Retention daran hängt.

### ANN-003 — Adress-Snapshot beim Hausbesuchstermin

Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung / DSFA-Prozess vor Produktivstart; Bestätigung durch Jannes steht aus

**Annahme.** Für Hausbesuche wird die Patientenadresse bei der Terminanlage in den Termin kopiert (`visit_street`, `visit_house_number`, `visit_postal_code`, `visit_city`), nicht referenziert; eine spätere Stammdatenänderung ändert nicht rückwirkend, wohin an diesem Tag gefahren wurde. Die Adresse liegt damit doppelt vor und unterliegt im Termin der Frist „organisatorische Behandlungsdaten" — auch bei abgesagten Terminen.

**Begründung.** Behandlungsnachweis (§4.4) und spätere Abrechnung (§19, Snapshot-Prinzip aus ADR-009) brauchen den damaligen Ort; die Datenminimierung nach Art. 5 Abs. 1 lit. c DSGVO ist gewahrt, solange nur die für die Anfahrt nötigen Felder kopiert werden. Wunder Punkt ist der abgesagte Hausbesuch: Er behält die Adresse drei Jahre, obwohl keine Anfahrt stattfand.

**Anker.** Spalten `visit_*` und Constraint `appointments_address_matches_type` in `supabase/migrations/20260830100100_appointments.sql`; einziger Schreiber ist `create_appointment`; Abnahmeschritt CAL-001 in `docs/development/archiv/abnahme/etappe-0-patienten-und-termine.md`.

**Änderungspfad.** Kürzere Frist oder Entfernen bei abgesagten Terminen: `visit_*` in `cancel_appointment` auf `null` setzen · Aufwand `klein`. Referenz statt Kopie: Migration entfernt die Spalten, der Nachweis liest die Stammdaten · Aufwand `mittel`, mit dem Verlust der historischen Adresse als Folge. **Abnahme (Jannes, 2026-10-02):** bestätigt. **Fassung 2 (ABN-004, 2026-10-02, Abnahme Jannes, BEF-092):** Die Kopie bleibt, aber die Akte nennt künftige bestätigte Hausbesuche mit abweichender Adresse (`list_home_visits_with_outdated_address`) und aktualisiert sie nur auf ausdrücklichen Auftrag, einzeln oder alle (`update_home_visit_addresses`, Audit `appointment.updated` mit `visit_address`), `supabase/migrations/20261002123000_abn_004_home_visit_addresses.sql`. Vergangene Termine behalten ihre damalige Adresse.

**Abnahme (Jannes, 2026-10-02).** Adresskopie bestätigt; vergangene Termine behalten ihre damalige Adresse. Ergänzt: Nach einer Änderung der Stammdaten muss die Akte auf künftige Hausbesuche mit alter Adresse hinweisen und sie gezielt aktualisieren lassen — BEF-092.

### ANN-004 — Inhalt des Audit-Kontexts bei organisatorischen Einstellungen

Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung / DSFA-Prozess vor Produktivstart

**Annahme.** Bei `organization.appointment_grid_changed` stehen alter und neuer Minutenwert in `audit_log.context`. Bei Arbeitszeiten (`staff_working_hours.*`, `staff_working_hour_exception.*`) enthält der Kontext Datensatz-Kennungen und bei Abweichungen deren Art (`kind`) — keine Uhrzeiten, keinen Wochentag, kein Datum.

**Begründung.** ADR-010 beschränkt das Auditlog auf Metadaten ohne klinische Inhalte; Beschäftigtendaten unterliegen `PROJECT_PRINCIPLES.md` §20 und §26 BDSG, und ein Log, das Arbeitszeitverläufe je Person nachzeichnet, wäre eine von §20 nicht gedeckte Auswertung. Der Lesepfad `list_audit_events` gibt `context` ohnehin nicht heraus.

**Anker.** `set_appointment_grid` in `supabase/migrations/20260830120000_scheduling_grid.sql`; `set_staff_working_hours` und `set_staff_working_hour_exception` in `20260830130000_working_hours_audit.sql`; `list_audit_events` und `set_documentation_deadline` in `20260904120000_treatment_note_auto_finalisation.sql`.

**Änderungspfad.** Kontextinhalt je Funktion in einer Migration ändern · Aufwand `klein`. Bereits geschriebene Zeilen sind über den Anwendungspfad nicht lesbar; ob sie bereinigt werden müssen, entscheidet die Prüfung. **Abnahme (Jannes, 2026-10-02, Block 1):** bestätigt; nachgetragen mit Block 9.

### ANN-005 — Terminabschluss ohne Dokumentationspflicht

Praxisprozess · entschieden (Jannes) · 2026-09-08 · Jannes · erledigt · Wiedervorlage: keine — ABR-EPIC-001 verankert die Kopplung an der Leistung (ANN-072), DOK-003 hat sie am Termin geprüft und nicht eingeführt

**Annahme.** Ein Termin kann abgeschlossen werden, ohne dass eine Behandlungsdokumentation existiert; der Abschluss gibt den Zeitraum nicht frei und lässt sich wieder öffnen, beide Ereignisse bleiben im Auditlog. Die Kopplung „Fakturierung erst nach finalisierter Dokumentation" (§19) wird an Leistung und Rechnung verankert, nicht am Terminstatus.

**Begründung.** §19 bindet die Fakturierung an die Dokumentation, nicht an den Terminstatus; DOK-001 und DOK-002 (ADR-016) haben die Kopplung bewusst nicht eingeführt — ein Entwurf darf unbegrenzt Entwurf bleiben, und ein Termin mit Dokumentation bleibt absagbar (`docs/DEVELOPMENT.md`, Bekannte Einschränkungen 9 und 10).

**Anker.** `complete_appointment` und `reopen_appointment` in `supabase/migrations/20260830110000_appointment_completion.sql`; Abnahmeschritt CAL-004 in `docs/development/archiv/abnahme/etappe-0-patienten-und-termine.md`.

**Änderungspfad.** Entweder eine Prüfung in `complete_appointment` ergänzen oder den Abschluss aus der Finalisierung heraus auslösen · Aufwand `klein` bis `mittel`. ABR-EPIC-001 hat sie getroffen: Eine Leistung entsteht nur aus `documented` oder einem Gebührenanlass (ANN-072), der Terminabschluss bleibt ohne Pflicht.

### ANN-006 — Umfang und Protokollierung des Behandlungsnachweises in der Akte

Datenschutz · verworfen · 2026-09-13 · Jannes · erledigt · Wiedervorlage: keine

**Verweis.** Verworfen am 2026-09-13 mit E15: Office liest alle klinischen Inhalte einer Akte im Umfang der Therapeut:innen (`PROJECT_PRINCIPLES.md` §4.3/§4.4, ADR-004 Fassung 2). Umgesetzt am 2026-09-15 mit ROL-EPIC-001 (ROL-001): `office` liest die Dokumentation über `list_patient_treatment_notes` mit `treatment_note.viewed` je Eintrag; die Akte fragt den Behandlungsnachweis nicht mehr an, er bleibt serverseitig als Rechnungssicht (Punkt 4). Wortlaut der verworfenen Annahme und ihrer Begründung: Git-Historie bis `7160fd5`.

**Anker.** `app.can_read_treatment_evidence()` und die Spaltenliste von `list_patient_treatment_evidence` in `supabase/migrations/20260904110000_patient_record_documentation.sql`; der Rollenschnitt nach E15 in `app.can_read_treatment_note()`, `supabase/migrations/20260915100000_office_reads_treatment_documentation.sql`. Die Client-Weiche `canReadTreatmentEvidence` ist mit ROL-001 entfallen.

**Änderungspfad.** Umfang der Rechnungssicht ändern: Spaltenliste von `list_patient_treatment_evidence` · Aufwand `klein`. Office wieder auf den Nachweis beschränken: `app.can_read_treatment_note()` in einer Migration ersetzen und die Nachweis-Oberfläche aus der Git-Historie zurückholen · Aufwand `mittel` — widerspräche E15.

### ANN-007 — Mechanismus der automatischen Finalisierung: pg_cron

Technik · entschieden (Jannes) · 2026-09-05 · Jannes · erledigt · Wiedervorlage: Providerprüfung nach ADR-002 vor dem Cloudprojekt (OPS-001) — sie muss `pg_cron` bestätigen oder den Auslöser ersetzen

**Annahme.** Die automatische Finalisierung ist die Datenbankfunktion `finalize_overdue_treatment_notes`, aufgerufen von der Erweiterung `pg_cron` alle 15 Minuten, registriert durch die Migration und nur, wenn die Erweiterung auf dem Server verfügbar ist. Sie ist für keine Anwendungsrolle ausführbar, idempotent und überspringt Einträge in Bearbeitung; es gibt keinen Fallback beim nächsten Zugriff und keine Berechnung zur Laufzeit.

**Begründung.** Nur ein Scheduler materialisiert den finalisierten Stand unabhängig davon, ob jemand die Akte öffnet — bei einer Frist mit Wirkung nach §630f BGB die entscheidende Eigenschaft. `pg_cron` ist Teil des Supabase-Postgres-Images, braucht keinen weiteren Dienst und führt keinen Anbieter ein (§3.5, ADR-015), bleibt aber eine Infrastrukturabhängigkeit nach §11. Unsicher: ob die Providerprüfung nach ADR-002 sie freigibt und ob 15 Minuten Verzug tragbar sind.

**Anker.** Der `do`-Block am Ende von `supabase/migrations/20260904120000_treatment_note_auto_finalisation.sql` ist die einzige Stelle, die den Auslöser kennt; die Funktion `finalize_overdue_treatment_notes` steht ebendort.

**Änderungspfad.** Anderer Auslöser (externer Cron-Dienst, Edge Function, Betriebsskript): den `do`-Block ersetzen und dieselbe Funktion aufrufen · Aufwand `klein`. Anderes Intervall: Migration mit erneutem `cron.schedule` unter demselben Namen · Aufwand `klein`. Berechnung beim Lesen: Umbau der Lesepfade und der Versionierung · Aufwand `groß`.

### ANN-008 — Fristbezug der automatischen Finalisierung

Praxisprozess · entschieden (Jannes) · 2026-09-08 · Jannes · erledigt · Wiedervorlage: Jannes nach den ersten Wochen Praxisbetrieb (ADR-016 nennt diesen Punkt als den, der am ehesten nachjustiert wird) — die **Zahl**, Voreinstellung 1 Tag; Datenschutzprüfung für den Zeitpunktbegriff

**Annahme.** Die Frist ist eine praxisweite Zahl von Kalendertagen (`documentation_auto_finalize_days`, 0 bis 30, Voreinstellung 1) und endet um Mitternacht der Praxiszeitzone nach dem N-ten Kalendertag nach dem Behandlungstag; für später angelegte Einträge zählt stattdessen der Anlagetag, wenn er später liegt. `finalized_at` ist der Zeitpunkt der Festschreibung, das rechnerische Fristende steht als `due_at` im Auditkontext. Setzen darf nur `owner`.

**Begründung.** ADR-016 Punkt 7 legt Voreinstellung und Konfigurierbarkeit fest, nicht den Bezugstag für nachträglich angelegte Einträge; ohne den Anlagetag wäre ein Nachtrag zu einem alten Termin nach Minuten festgeschrieben. Der spätere Bezug wahrt „in unmittelbarem zeitlichen Zusammenhang" (§630f Abs. 1 S. 1 BGB) und ist die restriktivere Option; der Rollenschnitt folgt §4.1. Unsicher: ob eine Frist je Organisation genügt (offene Folgefrage in ADR-016).

**Anker.** `app.documentation_deadline()` und die Spalte `organizations.documentation_auto_finalize_days` in `supabase/migrations/20260904120000_treatment_note_auto_finalisation.sql`; `FRIST_WERTE` in `src/features/documentation/api.ts`; Abnahmeschritt DOK-004 in `docs/development/archiv/abnahme/etappe-1-kernprozess.md`.

**Änderungspfad.** Anderer Bezugstag oder eine Uhrzeit statt Mitternacht: `app.documentation_deadline()` in einer Migration ersetzen · Aufwand `klein`. Frist je Person oder je Terminart: eigene Spalte und Auswertung in derselben Funktion · Aufwand `mittel`. Bereits finalisierte Einträge bleiben finalisiert.

### ANN-009 — Systemakteur im Auditlog

Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung / DSFA-Prozess vor Produktivstart

**Annahme.** Auditereignisse ohne handelnden Account tragen `actor_kind = 'system'` und keinen `actor_user_id`, alle übrigen bleiben `user` mit Account; eine Constraint erzwingt genau diese Paarung. Die Auditansicht zeigt solche Ereignisse als „System", der Benutzerfilter blendet sie aus. Bei der automatischen Finalisierung wird keine finalisierende Person eingetragen.

**Begründung.** ADR-010 Punkt 3 verlangt die zur Nachvollziehbarkeit erforderlichen Metadaten; ein Platzhalter-Account oder die zuletzt schreibende Person als vermeintlich finalisierende wäre eine falsche Angabe (Art. 5 Abs. 1 lit. d DSGVO) und liefe ADR-016 Punkt 1 zuwider. Unsicher: ob die Prüfung eine Kennzeichnung des Auslösers verlangt; heute stehen dort `surface = scheduler` und das Fristende.

**Anker.** Spalte `audit_log.actor_kind` und Constraint `audit_log_actor_consistent` in `supabase/migrations/20260904120000_treatment_note_auto_finalisation.sql`; `list_audit_events` ebendort; Anzeige in `src/features/audit/AuditLogPage.tsx`.

**Änderungspfad.** Zusätzliche Kennzeichnung des Auslösers: Kontext des Inserts in `finalize_overdue_treatment_notes` erweitern · Aufwand `klein`. Eigener Pseudo-Account statt Systemakteur: Spalte zurückbauen und Konto im Seed anlegen · Aufwand `mittel`, ausdrücklich nicht empfohlen.

**Abnahme (Jannes, 2026-10-02).** Bestätigt. Nur tatsächliche Systemvorgänge stehen als „System“ im Protokoll, ohne eine Person als Handelnde.

### ANN-010 — Sichtbarkeit und Frist der internen Versorgungsangaben

Datenschutz · entschieden (Jannes) · 2026-09-08 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung / DSFA-Prozess vor Produktivstart; Jannes für den Praxisnutzen

**Annahme.** Zugangshinweis Hausbesuch, Besonderheit, Bemerkung und die feste Therapeut:in sind organisatorische Angaben der Praxis, keine Gesundheitsdaten und keine klinische Dokumentation. Sie liegen in `patient_care_details` und sind für alle vier Praxisrollen einschließlich `office` sichtbar, nicht für das Patientenkonto und nicht für `anon`; ihre Datenklasse ist die der Patientenakte (zehn Jahre nach Abschluss der Behandlung, ADR-008), und sie erscheinen nie in Logs (ADR-011). Die zusätzliche Erreichbarkeit bleibt bei den Kontaktdaten der Person.

**Begründung.** §4.3 gibt `office` die Terminorganisation — ohne Zugangshinweis wäre die Rolle arbeitsunfähig —, hält sie aber von klinischem Freitext fern; deshalb der Hinweis am Formular und die eigene Tabelle. Der Ausschluss des Patientenkontos folgt §4.6 und §16, das Auskunftsrecht (Art. 15 DSGVO) läuft über OPS-006. Die Frist folgt der Akte, weil die Angaben am Behandlungsverhältnis hängen und ADR-008 eine Klasse ohne Fristzuordnung als Mangel führt. Unsicher: ob die Prüfung „Besonderheit" für ein Feld hält, in das regelmäßig Gesundheitsdaten geraten.

**Anker.** Tabelle `public.patient_care_details`, Policy `patient_care_details_select_directory_only` und die Sicht `patient_directory` in `supabase/migrations/20260907100000_patient_master_data.sql`; Abschnitt „Versorgung" in `src/features/patients/PatientMasterDataFields.tsx`.

**Änderungspfad.** Engere Rollenmenge (etwa ohne `office`) oder Sichtbarkeit für das Patientenkonto: die eine Policy ersetzen · Aufwand `klein`. Kürzere Frist: eigene Datenklasse und Löschregel in LOE-001 · Aufwand `mittel`. Felder in die klinische Dokumentation verlegen: Migration mit Datenumzug und neuem Lesepfad · Aufwand `groß`.

### ANN-011 — Datenklasse und Rollenschnitt der Verordnung

Datenschutz · entschieden (Jannes) · 2026-09-13 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung / DSFA-Prozess (B2), dort mit E15 (Office liest die Diagnose)

**Annahme.** Eine Verordnung ist ein Mischdatensatz und wird in zwei Projektionen ausgeliefert: organisatorisch (Verordner:in, Art, Ausstellungsdatum, Frequenz, organisatorische Bemerkung, Positionen mit Bezeichnung des Heilmittels und verordneter, genutzter, verbleibender Menge) und klinisch zusätzlich mit Diagnose beziehungsweise Leitsymptomatik, Therapieziel, Hinweisen der Verordner:in und Empfehlung zum Verordnungsende. Beide lesen alle vier Praxisrollen einschließlich `office`; schreiben dürfen nur `owner`, `therapist`, `team_lead`. Umgesetzt als zwei Funktionen mit zwei Rückgabetypen, nicht als eine Funktion mit genullten Spalten.

**Begründung.** Die Diagnose ist ein Gesundheitsdatum nach Art. 9 DSGVO; zugleich ist die Verordnung die Grundlage von Terminserie und Rechnung. Die Heilmittelbezeichnung gilt als organisatorisch, weil sie später ohnehin als Leistungsposition auf der Rechnung steht (C1). Das Schreibrecht ohne `office` folgt §16: Wer erfasst, tippt die Diagnose mit ab. Die zehnjährige Frist folgt §630f BGB und ADR-008 Punkt 4. Der ursprüngliche Leseausschluss der klinischen Projektion für `office` ist mit E15 abgelöst (ADR-004 Fassung 2 Punkt 3, umgesetzt 2026-09-15 mit ROL-002); jeder Zugriff wird als `prescription.viewed` protokolliert (ADR-010). Datenklasse, Frist und Schreibregel gelten unverändert. Unsicher: ob die Datenschutzprüfung (B2) den Lesezugriff von `office` auf die Diagnose trägt.

**Stand 2026-09-28 (Jannes).** **Office darf Grundlagen erfassen und bearbeiten** (Sichtung Kernprozess, Schritt 1: „gang und gäbe in jeder Praxis“). Ablauf dazu: Die Therapeut:in fotografiert die Verordnung vor Ort, Office tippt sie aus einer Büroliste mit dem Foto daneben ab (PRX-EPIC-003). Umgesetzt in PRX-010 (2026-09-29) über `app.can_write_treatment_bases()`: Schreiben dürfen jetzt alle vier Praxisrollen; der Verordnungsscan folgt dem Schreibrecht an der Grundlage (`app.can_write_patient_file`, ADR-017 Punkt 13), die übrigen klinischen Dateiarten bleiben bei den therapeutischen Rollen. Office tippt die Verordnung ab — eigene klinische Dokumentation schreibt es weiterhin nicht (ADR-004 Punkt 3): Die Empfehlung zum Verordnungsende steht nicht im Formular und kommt aus dem Therapiebericht. Stehen an einer Bestandsgrundlage Therapieziel, Verordnerhinweis oder Empfehlung, dürfen nur die therapeutischen Rollen sie durch den Wechsel auf Selbstzahler oder das Löschen der Grundlage abräumen (`app.can_clear_treatment_basis_clinical_texts`, Zweitreview PRX-EPIC-003). Einen eigenen Prüfpunkt bekommt die Freigabe nicht — der Eintrag steht wegen E15 ohnehin im Prüfpaket, und Office liest die Diagnose dort schon.

**Anker.** `app.can_read_treatment_bases()`, `app.can_read_treatment_basis_clinical()` (Rollenschnitt nach E15) und `app.can_write_treatment_bases()` (seit `supabase/migrations/20260929150000_prx_010_office_writes_treatment_bases.sql` mit office) sowie die Lesepfade `list_patient_treatment_bases` und `list_patient_treatment_bases_clinical` in `supabase/migrations/20260918120000_treatment_basis.sql` (ADR-020 hat die Verordnung zur Behandlungsgrundlage umbenannt); Rollenweiche in `src/features/treatment-bases/grundlagen.ts`.

**Änderungspfad.** Anderer Rollenschnitt beim Lesen oder Schreiben: die betroffene `app.can_*`-Funktion ersetzen · Aufwand `klein` — `office` wieder von der Diagnose auszuschließen widerspräche E15. Heilmittel als klinisch einstufen: Spaltenliste und Oberfläche anpassen · Aufwand `mittel`. Andere Frist: eigene Datenklasse und Löschregel in LOE-001 · Aufwand `mittel`.

### ANN-012 — Genutzte Menge wird bis CAL-007 und ABR-002 von Hand gepflegt

Praxisprozess · verworfen · 2026-09-19 · ANN-064, ANN-073 · erledigt · Wiedervorlage: keine

**Ablösung.** abgelöst durch ANN-038 und ANN-042 in der Zählweise, durch ANN-064 im Formular (die genutzte Menge ist seit VER-EPIC-002 keine Eingabe mehr) und durch ANN-073 in der Fortschreibung (die Leistungserfassung schreibt sie seit ABR-EPIC-001 fort)

**Verweis.** Die Handpflege der genutzten Menge gibt es nicht mehr. Was bleibt: Die verbleibende Menge wird gerechnet und nirgends gespeichert, und die Constraint hält die genutzte unter der verordneten Menge — beides trägt heute ANN-073. Wortlaut der abgelösten Annahme: Git-Historie bis `6784a5f`.

**Anker.** Spalte `treatment_base_items.used_quantity` und Constraint `treatment_base_items_used_within_prescribed` (umbenannt in `supabase/migrations/20260918120000_treatment_basis.sql`); die Fortschreibung in `supabase/migrations/20260919110000_billable_services.sql`.

**Änderungspfad.** Keiner mehr an dieser Stelle; Änderungen an der Zählweise gehen über ANN-064 und ANN-073.

### ANN-013 — Datenklasse und Frist der Verordnerkartei

Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung / DSFA-Prozess (Verzeichnis der Verarbeitungstätigkeiten)

**Annahme.** `prescribers` enthält berufliche Kontaktdaten Dritter und ist kein Gesundheits- und kein Patientendatum — erst die Verordnung stellt den Bezug her. Datenklasse: Stammdaten, aufbewahrt, solange eine Verordnung darauf verweist (`on delete restrict`). Sichtbar für alle vier Praxisrollen, nicht für Patientenkonten; erfasst wird nur, was Identifikation und Folgeverordnung brauchen — keine Arztnummer, keine Betriebsstättennummer.

**Begründung.** Rechtsgrundlage ist Art. 6 Abs. 1 lit. b/f DSGVO, nicht Art. 9 — die Kartei allein sagt nichts über eine Gesundheit aus. Die Kopplung der Frist an die Verordnung folgt ADR-008 Punkt 2, weil eine Verordnung ohne auflösbaren Verordner als Behandlungsunterlage unvollständig wäre. Der Verzicht auf LANR und BSNR folgt der Datenminimierung (Art. 5 Abs. 1 lit. c DSGVO): GKV-Merkmale, und die Praxis rechnet privat ab (ADR-009). Unsicher: ob die Prüfung eine eigene Zeile im Verarbeitungsverzeichnis und eine Information nach Art. 14 DSGVO verlangt.

**Anker.** Tabelle `public.prescribers` mit Tabellenkommentar und Policy `prescribers_select_staff_only` in `supabase/migrations/20260907110000_prescriptions.sql`; Formularfelder in `src/features/treatment-bases/PrescriberFormFields.tsx`.

**Änderungspfad.** Eigene Löschregel oder kürzere Frist: Regel in LOE-001 ergänzen · Aufwand `klein`, solange keine Verordnung verweist. Information nach Art. 14 DSGVO: Textbaustein in G8/G14 · Aufwand `klein`, außerhalb des Codes. **Abnahme (Jannes, 2026-10-02):** bestätigt; berufliche Kontaktdaten sind personenbezogene Stammdaten, für sich keine Gesundheitsdaten.

### ANN-014 — „Empfehlung zum Verordnungsende" ist eine erfasste Angabe, keine Systemempfehlung

Recht · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung; B1 (externe MDR-Abgrenzung, ADR-006 Punkt 7). Seit DOK-005 (2026-09-26) wird die Empfehlung im Therapiebericht geschrieben, mit Verfasser:in und Tag

**Annahme.** Das Feld „Empfehlung zum Verordnungsende" nimmt die Empfehlung der Therapeut:in auf, die sie selbst formuliert und verantwortet; die Anwendung erzeugt, ergänzt und bewertet sie nicht. Daneben zeigt sie ausschließlich eine Rechnung („noch 3 von 10") und, wenn nichts mehr offen ist, den neutralen Sachsatz „Kontingent ausgeschöpft" — keine Handlungsempfehlung, keine Prognose, keine Ampel, keine Erinnerung.

**Begründung.** ADR-006 Punkt 2 erlaubt Erfassen, Speichern und Darstellen von Gesundheitsinformationen, Punkt 4 verbietet eigene Therapieempfehlungen; eine von einem Menschen geschriebene Empfehlung zu speichern und anzuzeigen fällt unter Punkt 2. Die Differenz „verordnet minus genutzt" ist eine veröffentlichte Rechenvorschrift ohne klinische Aussage. Regulatorisch zählt auch die Beschriftung, deshalb heißt das Feld „Empfehlung der Therapeut:in zum Verordnungsende". Unsicher: ob die externe Prüfung aus B1 den Sachsatz bereits als Handlungsaufforderung liest.

**Anker.** Spalte `treatment_bases.follow_up_recommendation` mit Spaltenkommentar in `supabase/migrations/20260918120000_treatment_basis.sql`; Bestandstext im Formular in `src/features/treatment-bases/TreatmentBasisFormFields.tsx` (seit VER-EPIC-002 nicht mehr neu erfassbar, ANN-065); Darstellung von Empfehlung und Restkontingent in `src/features/treatment-bases/PatientTreatmentBasesPage.tsx`, der Sachsatz „Kontingent ausgeschöpft“ in `src/features/appointments/AppointmentSeriesPage.tsx`; seit DOK-005 die Spalte `therapy_reports.recommendation` in `supabase/migrations/20260926140000_dok_005a_therapy_reports.sql` und ihre Anzeige an der Verordnung in `src/features/therapy-reports/BerichteDerVerordnung.tsx`.

**Änderungspfad.** Feld oder Sachsatz anders beschriften: eine Stelle in der Oberfläche · Aufwand `klein`. Feld ganz entfernen: Spalte und Formularfeld zurückbauen · Aufwand `klein`. Eine automatische Erinnerung oder Bewertung wäre keine Änderung dieser Annahme, sondern `MDR_REVIEW_REQUIRED` nach ADR-006 Punkt 6 und ein eigenes Epic nach B9 und B10. **Abnahme (Jannes, 2026-10-02):** bestätigt; Empfehlungen stammen von der Therapeut:in, die App zeigt nur den organisatorischen Kontingentstand.

### ANN-015 — Umfang und Wortlaut der Verbindungsanzeige

Technik · entschieden (Jannes) · 2026-09-08 · Jannes · erledigt · Wiedervorlage: Jannes nach dem ersten Feldtag

**Ablösung.** abgelöst durch ANN-046 im Textverlustschutz

**Annahme.** Die Verbindungsanzeige stützt sich allein auf `navigator.onLine` und die Ereignisse `online`/`offline`; es gibt keinen Ping gegen den Server und keinen Abfragetakt. Sie erscheint nur im Fall „getrennt", ein dauerhaftes „verbunden" gibt es nicht. Der Text nennt die Folge für die Arbeit, nicht den technischen Zustand, und bittet darum, den Text im Feld stehen zu lassen.

**Begründung.** Anlass ist der Hausbesuch: reißt die Verbindung ab, merkt man es sonst erst beim fehlgeschlagenen Speichern. Ein regelmäßiger Ping wäre genauer, aber eine wiederkehrende Verbindung ohne fachlichen Grund (§18) und ein Signal, wann ein Gerät benutzt wird (§20). Der Preis ist bekannt und benannt: ein Gerät hinter einem Anmeldeportal gilt als verbunden, deshalb behauptet der Text nicht, der Server sei erreichbar. Die Anzeige ist keine Offline-Fähigkeit (ADR-015 Punkt 16, ADR-001). Unsicher: ob der Hinweis früh genug kommt, um Textverlust zu verhindern.

**Anker.** `src/app/verbindung.ts` (`useIstVerbunden`); `src/app/Verbindungsanzeige.tsx` in `src/app/AppShell.tsx`; seit UX-009 zusätzlich `src/features/documentation/Textverlustschutz.tsx`.

**Änderungspfad.** Zusätzliche Prüfung gegen den Server: eine Abfrage in `useIstVerbunden` · Aufwand `klein`, aber datenschutzrelevant und deshalb nicht ohne Entscheidung. Anderer Wortlaut oder dauerhafte Anzeige: eine Stelle · Aufwand `klein`. Echte Offline-Fähigkeit: eigenes Epic nach ADR-001 · Aufwand `groß`.

### ANN-016 — Koordinate als abgeleitetes Stammdatum der Adresse

Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung / DSFA-Wiedervorlage Kartendienst; MAP-006 verankert sie in der Migration

**Annahme.** Zu jeder Hausbesuchsadresse wird die geocodierte Koordinate (`lat`, `lon`, Genauigkeitsstufe) bei der Adresse gespeichert; Geocoding läuft nur beim Anlegen oder Ändern der Adresse, nie beim Öffnen einer Karte oder Berechnen einer Route. Die Koordinate ist ein abgeleitetes Stammdatum mit Datenklasse und Frist der Adresse — keine Rohantwort des Anbieters, kein Anzeigetext. Unterhalb der Hausnummerngenauigkeit bestätigt die erfassende Person den Treffer, sonst bleibt die Adresse ohne Koordinate.

**Begründung.** Datenminimierung gegenüber dem Anbieter (Art. 5 Abs. 1 lit. c DSGVO): Die Adresse geht genau einmal je Änderung zum Kartendienst, jede spätere Karte oder Route arbeitet mit Koordinaten (ADR-019 Punkt 13); ohne Speicherung müsste jede Routenberechnung alle Adressen des Tages erneut übermitteln. Die Koordinate ist so personenbezogen wie die Adresse, deshalb dieselbe Klasse und Frist (ADR-008). Unsicher: ob die Prüfung die Speicherung anders bewertet als die Adresse und ob bei abgesagten Hausbesuchen (ANN-003) die Koordinate mitzulöschen ist.

**Anker.** Seit MAP-006a: `supabase/migrations/20260925100000_map_006a_coordinates.sql` — Spalten `lat`, `lon`, `geocode_precision` an `patient_contact_details` und `visit_*` an `appointments`, Trigger `app.drop_coordinate_on_address_change` (Koordinate verfällt mit der Adresse), einziger Schreiber `set_patient_address_coordinate` mit Bestätigungspflicht in `app.assert_geocode_result`; Tests in `supabase/tests/address-coordinates.test.ts`. Geocoding nur auf Handlung in `src/features/patients/AdresseVerorten.tsx`.

**Änderungspfad.** Geocoding je Aufruf statt Speicherung: Spalten entfallen, der Adapter geocodiert vor jeder Route · Aufwand `mittel`, mit mehr Übermittlungen als Folge. Andere Frist oder eigene Datenklasse: Retention Schedule ergänzen · Aufwand `klein`. Koordinate im Termin-Snapshot statt bei der Adresse: eine Migration · Aufwand `klein`. **Abnahme (Jannes, 2026-10-02):** bestätigt.

### ANN-017 — Serverseitiger Kartendienst-Adapter als Supabase Edge Function

Technik · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: OPS-001 Providerprüfung (Edge Runtime nach ADR-015 Punkt 20)

**Annahme.** Geocoding, Routing und Matrix laufen in einer Supabase Edge Function (`location-provider`), die den Server-Schlüssel als Supabase-Secret hält und den Vertrag aus `src/lib/location/contract.ts` erfüllt. Der Browser ruft nur diese Function auf (immer angemeldet) und spricht nie direkt mit dem Kartendienst; einzige Ausnahme sind die Kartenkacheln mit getrenntem Kachelschlüssel. Der Vorbehalt aus ADR-015 Punkt 20 bleibt: Für produktive Gesundheitsdaten braucht die Edge Runtime eine eigene Datenfluss- und Providerprüfung (OPS-001).

**Begründung.** Direkt aus dem Browser stünde der Schlüssel im Bundle und IP-Adresse und User-Agent lägen beim Anbieter; aus der Datenbank (`pg_net`) wären Timeout-Kontrolle schlecht und das Secret in der Datenbank; ein eigener Dienst wäre eine zusätzliche Laufzeitkomponente mit eigener Wiederherstellungslast bei Bus-Faktor 1 (ADR-012). Die Edge Function gehört zum Stack (ADR-015 Punkt 6), hat eine Stelle für Schlüssel, Redaction (ADR-011) und Timeout und ist mit gemocktem `fetch` testbar. Unsicher: wo die global verteilte Edge Runtime ausgeführt wird und ob sie auf EU-Regionen festlegbar ist.

**Anker.** `src/lib/location/contract.ts`, Abschnitt „Serverseitiger Anbieteradapter"; `supabase/functions/location-provider/` — geplant für MAP-003, existiert noch nicht.

**Änderungspfad.** Andere Laufzeit (eigener Dienst, Datenbankfunktion): Der Adapter ist ein Modul hinter dem Vertrag, Oberfläche und Fachlogik bleiben · Aufwand `mittel`. Scheidet die Edge Runtime nach OPS-001 für Gesundheitsdaten aus, greift derselbe Pfad vor MAP-006. **Abnahme (Jannes, 2026-10-02):** bestätigt.

### ANN-018 — Übergabeziel und URL-Format des Navigations-Handoffs

Datenschutz · entschieden (Jannes) · 2026-09-11 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2, Handoff und §203/Art. 9); Gerätebewertung durch Jannes in der Sichtung Kartendienst (`docs/sichtung/kartendienst.md`) — sie beantwortet das Wegpunktlimit und die Standard-Ziel-App

**Annahme.** Der Handoff übergibt an die Navigations-App nur Ziel und Fahrradmodus: die Koordinate, sobald sie vorliegt (ANN-016, ab MAP-006), bis dahin die Postanschrift ohne Namen. Nie Name, Uhrzeit, Termin- oder Patientenkennung, Notiz oder Diagnose. Formate seit MAP-005 alle drei: Google Maps (`travelmode=bicycling`), Apple Maps (`/directions`, `mode=cycling`, wiederholbares `waypoint`), Systemnavigation `geo:` (ein Ziel, kein Verkehrsmittel). Ein Tageslink trägt **höchstens drei Zwischenziele** — die kleinere der beiden von Google dokumentierten Zahlen (neun sonst, drei im mobilen Browser), weil die Anwendung nicht weiß, wo der Tap landet; was nicht hineinpasst, wird in sichtbare Abschnitte geteilt statt still abgeschnitten. Die URL entsteht in einer Funktion, erst beim Tippen, wird nie gespeichert und nie automatisch geöffnet.

**Begründung.** Die Koordinate ist für den Betreiber der Navigations-App so identifizierend wie die Adresse, enthält aber keinen Freitext und keinen Anhaltspunkt außer dem Punkt; Adresse und Klingelhinweis bleiben lokal. Die Feldliste folgt Art. 5 Abs. 1 lit. c DSGVO und ADR-019 Punkt 12. Unsicher: ob ein Pin ohne sichtbare Hausnummer auf dem Rad verwirrt (MAP-005 prüft das auf echten Geräten) und ob die Übergabe an einen eigenen Verantwortlichen Art. 9 oder §203 StGB berührt — Rechtsfrage an B2 (ADR-019 Punkt 23).

**Anker.** `src/lib/location/contract.ts`, Typ `NavigationTarget`; seit UX-002 `src/lib/location/navigation.ts` — die eine Stelle für Feldliste, Ländercode, URL-Format je Ziel-App und Wegpunktlimit (`MAX_ZWISCHENZIELE`), mit Tests in `navigation.test.ts`; „nur auf Aktion" in `src/features/appointments/NavigationStarten.tsx` und seit MAP-006 in `src/features/tours/Tourenliste.tsx`. Seit MAP-006d übergibt `navigationsZiel` die Koordinate des Hausbesuchs, sobald `list_day_plan` sie liefert (`supabase/migrations/20260925130000_map_006d_day_plan_coordinates.sql`).

**Änderungspfad.** Adresse statt Koordinate, anderes Limit, andere Ziel-App: eine Funktion · Aufwand `klein`. Verlangt B2 eine Einwilligung vor dem Handoff: Einwilligungsstruktur aus PAT-006 und Prüfung vor dem Bauen der URL · Aufwand `mittel`. Verlangt B2, den Handoff zu unterlassen: die Funktion entfällt, die Tagesliste zeigt die Adresse · Aufwand `klein`.

### ANN-019 — Verfallsdauer und Bindung des Verordnungsentwurfs (VER-003)

Technik · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Jannes, falls die 30-Minuten-Grenze in der Praxis zu knapp oder zu großzügig wirkt

**Annahme.** Der Formularzustand liegt in einem eigenen kleinen In-Memory-Speicher (`src/lib/abstecher.ts`), nicht im Query-Cache. Ein Entwurf ist an Vorgang (Zufallskennung je Abstecher, seit UX-009) und Benutzer (Auth-`user.id`) gebunden und verfällt nach 30 Minuten von selbst; bei Abmeldung werden zusätzlich sofort alle Entwürfe verworfen.

**Begründung.** Ein Entwurf muss die Anlage einer fehlenden Verordner:in überleben; mit der Standard-`gcTime` von fünf Minuten für einen unbeobachteten Cache-Eintrag ist das nicht verlässlich, und den Cache dafür umzuwidmen hieße, seine nächsten Eigenheiten (Rehydrierung, `refetchOnMount`) zu erben. 30 Minuten sind eine Schätzung, keine Messung. Die Benutzerbindung verhindert, dass ein Kontowechsel im selben Tab einen fremden Entwurf übernimmt; das Verwerfen bei Abmeldung ist Verteidigung in der Tiefe, weil die Verordnung klinischen Freitext enthält (§18, ADR-011). Nichts verlässt den Arbeitsspeicher — kein `localStorage`, kein `sessionStorage`, kein Weg über die URL.

**Anker.** `src/lib/abstecher.ts` (Bindung an Vorgang und Benutzer, `abstecherVerwerfenFuer`); Verwendung in `src/features/treatment-bases/TreatmentBasisFormPage.tsx` und `PrescriberFormPage.tsx`; Rückfrage vor dem freiwilligen Abmelden in `src/app/AbstecherAbmeldewache.tsx` (Fassung 2; bis ABN-019 `MAX_ALTER_MS` und `alleEntwuerfeVerwerfen` im `SessionProvider`).

**Änderungspfad.** Wieder eine Frist: eine Zahl in `src/lib/abstecher.ts` · Aufwand `klein`. Mehrere gleichzeitige Entwürfe je Person oder Ausdehnung auf mehrere Tabs: eigener Mechanismus (etwa `BroadcastChannel`) · Aufwand `mittel`. **Abnahme (Jannes, 2026-10-02):** geändert: Ablauf und automatische Abmeldung dürfen keine Eingaben still löschen; der Entwurf wird geschützt gesichert, Wiederaufnahme nur mit demselben Konto (BEF-110, ADR-025 Punkt 4). **Fassung 2 (ABN-019, 2026-10-02, BEF-110 Punkt 1):** Kein stiller Verfall mehr: Ein Abstecher-Entwurf bleibt im Arbeitsspeicher, bis das Formular ihn zurückholt oder die Person ihn ausdrücklich verwirft. Beim freiwilligen Abmelden fragt `AbstecherAbmeldewache` („Zurück“ oder „Verwerfen und abmelden“); eine automatische Abmeldung oder Sperre lässt ihn liegen, gebunden an das Konto, und kein anderes findet ihn. Ein Neuladen verwirft ihn weiter. Ein serverseitiger Entwurf kommt, wenn SEC-EPIC-001 den Entwurfspfad baut (ADR-025 Punkt 4).

### ANN-020 — Datenklasse und Frist der Textbausteine

Datenschutz · entschieden (Jannes) · 2026-09-11 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung; die Klasse steht seit LOE-001 im Retention Schedule (`treatment_text_snippets`, Betriebsdaten)

**Annahme.** Ein Textbaustein ist ein Betriebsdatum der Praxis ohne Patientenbezug und kein Gesundheitsdatum; `public.treatment_text_snippets` trägt deshalb bewusst keine `patient_id` und keine `appointment_id`. Aufbewahrung bis zur Löschung durch die Praxis — keine gesetzliche Frist, kein selbsttätiger Verfall. Ein persönlicher Baustein endet mit dem Mitarbeiterdatensatz seiner Person (`on delete cascade`), ein praxisweiter überlebt jeden Personalwechsel; Löschen ist echtes Löschen, was damit geschrieben wurde, steht unverändert in der Akte.

**Begründung.** Der Baustein ist eine vorformulierte Wendung ohne Fall, damit fehlt der Personenbezug nach Art. 4 Nr. 1 DSGVO und Art. 9 greift nicht; ohne Spalte für Patient oder Termin lässt sich ein Bezug auch nachträglich nicht herstellen. Der Restwert liegt im Freitext selbst — dagegen hilft die Beschriftung („keine Angaben aus einer Akte") und die Länge von 2 000 Zeichen. In Logs erscheint der Text nie (ADR-011). Unsicher: ob die Prüfung den Freitext trotz fehlenden Bezugs der Akte zuordnet und damit der Zehnjahresfrist (ADR-008).

**Anker.** `supabase/migrations/20260910140000_treatment_text_snippets.sql` — Tabelle mit Datenklasse und Frist als `COMMENT`; Tests im Abschnitt „Datenschutz" von `supabase/tests/text-snippets.test.ts`.

**Änderungspfad.** Andere Frist oder eigene Datenklasse: Eintrag im Retention Schedule (LOE-001) und eine Löschregel je Tabelle · Aufwand `klein`. Bausteine wie Aktendaten behandeln: dieselbe Frist plus Aufnahme ins Löschjournal (LOE-002) · Aufwand `klein`. Trennung persönlich/praxisweit aufheben: eine Spalte und zwei Policies · Aufwand `mittel`.

### ANN-021 — Feldliste und Vorhaltedauer des Tagesplans im Arbeitsspeicher

Datenschutz · entschieden (Jannes) · 2026-09-11 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung; Jannes nach dem ersten Feldtag (reicht die Vorhaltedauer, ist sie zu lang?); Fassung 2 vom 2026-09-22 zu ADR-012 Punkt 9 (Jannes, Weg a)

**Annahme.** Die zuletzt erfolgreich geladene Tagesliste bleibt im Arbeitsspeicher der laufenden Seite lesbar, auch wenn eine spätere Abfrage scheitert, und wird dann als älterer Stand gekennzeichnet. Feldliste ist genau die Rückgabe von `list_day_plan` — keine klinischen Inhalte, keine Verordnung, keine Akte. Vorhaltedauer acht Stunden ab dem Laden; sie endet zusätzlich bei Neuladen, geschlossenem Tab, Abmeldung und Tageswechsel. Gespeichert wird nichts: kein `localStorage`, kein `sessionStorage`, kein IndexedDB, kein Service Worker (ADR-015 Punkt 16). **Fassung 2 (2026-09-22):** Diese Liste ist zugleich die Bereitstellung der Tagesinformationen, die ADR-012 Punkt 9 verlangt; ein eigener Druck- oder Exportweg für den Tagesplan wird nicht gebaut (G10-Funktionsteil gestrichen, Entscheidung Jannes); wer Papier will, druckt die Übersicht über den Browser mit der Druck-Basis aus UI-000. Das dokumentierte Ausfallverfahren nach ADR-012 Punkt 8 bleibt Praxisprozess bei Jannes.

**Begründung.** ADR-001 nennt den Tagesplan als das, was offline verfügbar sein soll, und lässt den Mechanismus offen; der Zwischenspeicher der laufenden Seite genügt dem Zweck ohne neue Technik und kann die Lage aus ADR-001 („dokumentiert geglaubt, nirgends gespeichert") nicht erzeugen, weil er nur liest. Ein dauerhafter lokaler Bestand hieße Gesundheitsdaten auf einem mobilen Gerät mit allem, was daran hängt — nach §16 kein Weg, den man nebenbei geht. Unsicher: ob acht Stunden für einen langen Tag reichen und ob die Prüfung den Zugangshinweis im Arbeitsspeicher anders bewertet als auf dem Bildschirm. Zu Fassung 2: ADR-012 nennt das Degraded-Verfahren einen Praxisprozess, dessen Tagesinformationen die Anwendung unterstützen soll, und gibt dafür ausdrücklich der begrenzten Offline-Fähigkeit aus ADR-001 einen zweiten Zweck; ein Papierexport mit Anschriften aller Patient:innen eines Tages wäre ein Datenabfluss ohne Löschfrist, den die Praxis nicht braucht. Unsicher: Nach einem Neuladen oder im Ausfall vor dem ersten Laden ist die Liste weg, sofern sie nicht vorher gedruckt wurde — ob das für einen mehrstündigen Ausfall reicht, zeigt erst Probewoche 1.

**Anker.** `TAGESPLAN_VORHALTEDAUER_MS` in `src/features/today/api.ts` — die eine Zahl; die Feldliste ist die Rückgabe von `public.list_day_plan` (`supabase/migrations/20260910100000_day_plan.sql`); Leeren beim Wechsel der Identität in `src/features/auth/SessionProvider.tsx` (seit FIX-005 dort, verglichen wird die Benutzerkennung, nicht die Ereignisart).

**Änderungspfad.** Andere Vorhaltedauer: eine Zahl · Aufwand `klein`. Nichts über einen Fehlversuch hinaus stehen lassen: `gcTime` auf 0 und Kennzeichnung entfernen · Aufwand `klein`, mit dem Verlust der Anschrift im Funkloch als Folge. Echter Offline-Modus: eigenes Epic nach ADR-001 · Aufwand `groß`. Fassung 2 zurücknehmen: Druckblatt des Tagesplans über die Druck-Basis aus dem vorhandenen Lesepfad, Zeile G10 wieder öffnen · Aufwand `klein`.

### ANN-022 — Tiefgrün der Marke als Hover-Zustand des Akzents

Technik · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Jannes, sobald er die Oberfläche eine Weile bedient hat; außerdem MARKE-001, falls die Marke um abgestufte Farbwerte ergänzt wird

**Annahme.** `--color-accent-hover` trägt das Tiefgrün der Marke (`#042c1b`) — einen dunkleren, nicht helleren Wert als den Akzent. `marke/README.md` führt Tiefgrün als Fläche für App-Symbol, Aufkleber und Visitenkarte; die Verwendung als Fläche und Textfarbe in der Anwendung geht darüber hinaus und ist deshalb registriert.

**Begründung.** `--color-accent-hover` ist an rund einem Dutzend Stellen Textfarbe und nur an zweien Knopffläche; ein hellerer Wert hätte beide Verwendungen geschwächt, der dunklere stärkt sie (Text 13,85:1 statt 10,30:1, weiß darauf 15,19:1 statt 11,29:1). `marke/README.md` schließt mit „Keine weiteren Kombinationen" eigene Abstufungen aus, und Tiefgrün ist die einzige dunklere Farbe, die die Marke kennt. `--color-accent-soft` folgt derselben Logik mit Buntheit `0.022`, bewusst unter `positiv-soft`.

**Anker.** `src/index.css`, `--color-accent-hover` und `--color-accent-soft`; geprüft in `src/lib/kontrast.test.ts` (Textkontrast, weißer Text darauf, Mindestabstand der Zustände, Ordnung gegenüber `positiv-soft`).

**Änderungspfad.** Andere Richtung oder anderer Wert: eine Zeile in `src/index.css`, der Test rechnet die Grenzen neu · Aufwand `klein`. Bekommt die Marke später eine abgestufte Farbskala, ersetzt sie den Wert an derselben Stelle · Aufwand `klein`. **Abnahme (Jannes, 2026-10-02):** bestätigt.

### ANN-023 — Die Kopfzeile führt die Marke, nicht den Organisationsnamen

Praxisprozess · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Jannes; erneut, sobald eine zweite Praxis dazukäme (ADR-003, „echter Mehrmandantenbetrieb")

**Annahme.** Die Kopfzeile der angemeldeten Anwendung zeigt die Wortmarke; der Organisationsname aus den Stammdaten erscheint dort nicht mehr. Die Anmeldemaske zeigt ebenfalls die Marke statt des Worts „Praxisplattform", der Seitentitel lautet „Own Motion".

**Begründung.** ADR-003 stellt fest, dass `organization_id` keine Mandantenfähigkeit schafft und echter Mehrmandantenbetrieb ein eigenes Vorhaben bliebe; es gibt genau eine Praxis, und der Name aus der Datenbank sagt neben der Marke nichts Zusätzliches — im aktuellen Stand wäre er sogar irreführend („Test Praxis Tuebingen"). Die Alternative, den Namen als zugängliche Bezeichnung zu hinterlegen, wurde verworfen, weil Vorlesesoftware dann etwas anderes sagt, als zu sehen ist.

**Anker.** `src/app/AppShell.tsx` (Kopfzeile), `src/features/auth/LoginPage.tsx`, `index.html`; festgehalten in `AppShell.test.tsx` und `LoginPage.test.tsx`. `organizationName` in `src/features/session/types.ts` bleibt geladen, nur nicht angezeigt.

**Änderungspfad.** Namen wieder anzeigen: ein Element in `AppShell.tsx`, Abstand nach `schutzraum()` in `src/components/ui/markeRegeln.ts` · Aufwand `klein`. Mehrere Praxen: eigenes Vorhaben nach ADR-003 · Aufwand `mittel`, durch diese Annahme nicht vorweggenommen. **Abnahme (Jannes, 2026-10-02):** bestätigt.

### ANN-024 — Privatangaben Beschäftigter: Schreibrecht folgt dem Leserecht

Datenschutz · entschieden (Jannes) · 2026-09-11 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung im Rahmen der TOM (G14). Kategorie `Datenschutz`: Die Bestätigung durch den Projektinhaber ersetzt sie nicht, der Eintrag bleibt im Prüfpaket

**Annahme.** „Anschrift" und „Telefon" aus E10 sind die dienstlichen Angaben: Name, dienstliche E-Mail, Diensttelefon, Hauptstandort darf `office` schreiben. Die Privatangaben in `staff_private_details` (Geburtsdatum, private E-Mail, Privattelefon, Privatanschrift) bleiben bei `owner` — beim Lesen wie beim Schreiben, Schreibrecht und Leserecht sind deckungsgleich.

**Begründung.** §20 beschränkt das Lesen dieser Angaben auf `owner` und die betroffene Person, §4.7 verbietet, Geschütztes auszuliefern und erst im Client auszublenden. Ein Schreibrecht ohne Leserecht wäre deshalb die gefährlichere Variante: Das Formular des Office bekäme die Felder als `null` und löschte sie beim Speichern. Die Privatanschrift wird für Terminplanung und Vertretung nicht gebraucht (Art. 5 Abs. 1 lit. c DSGVO). Jannes hat die Auslegung am 2026-09-11 bestätigt; offen ist nur, ob die Datenschutzprüfung die Aufteilung im Rahmen der TOM so bestätigt.

**Anker.** `app.can_manage_staff_private_details()` in `supabase/migrations/20260911100000_staff_permission_split.sql` — genau ein Ausdruck; `canManageStaffPrivateDetails` in `src/features/session/types.ts` steuert nur die Darstellung.

**Änderungspfad.** Office soll Privatangaben schreiben und lesen: diese Funktion und die Lese-Policy auf `staff_private_details` gemeinsam erweitern · Aufwand `klein`, aber mit Änderung an §20, also erst nach ausdrücklicher Entscheidung. Umgekehrt: `app.can_manage_staff_master_data()` auf `owner` zurück · Aufwand `klein`.

### ANN-025 — Die Anwendung legt keine Authentifizierungskonten an

Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung; abgelöst durch STAFF-005 (Roadmap G21)

**Annahme.** Die Anwendung erzeugt kein Konto beim Anmeldedienst, sondern verwaltet nur die Berechtigung: `invite_staff_account` legt die Einladung an, `claim_staff_invitation` bindet ein vorhandenes Konto daran. Das Konto entsteht einmalig je Person auf der Oberfläche des Anmeldedienstes; die Anwendung fordert die Anmeldemail nur für ein bestehendes Konto an (`signInWithOtp` mit `shouldCreateUser: false`).

**Begründung.** `PROJECT_PRINCIPLES.md` §4 verlangt als SOLLTE, dass der Praxisinhaber ein neues Teammitglied selbst anlegt, ohne technische Administration; diese Annahme erfüllt das für Rolle und Einladung, nicht für das Konto. Der Rest scheitert an drei Stellen: `supabase/config.toml` setzt `enable_signup = false` (§4.2), Selbstregistrierung einzuschalten wäre das Aufweichen einer Sicherheitsmaßnahme (§15.1, Stopp); die Admin-API verlangt den `service_role`-Schlüssel und damit eine serverseitige Funktion, und die Edge Runtime ist nach OPS-001 (2026-09-21) nicht freigegeben; ein Versandweg fehlt, weil der eingebaute Versand nur an Adressen des Projektteams zustellt (`providerpruefung-supabase.md`, Teil 3 und 4; BEF-026) und B13 deshalb wieder offen ist. Bleibt der manuelle Handgriff — eine Minute je Zugang und die restriktivere Seite (§16). Unsicher: ob die Praxis ihn bei Personalwechseln auf Dauer akzeptiert.

**Anker.** `sendeZugangsMail` in `src/features/staff/konto-api.ts` (`shouldCreateUser: false`); die tragende Eigenschaft in `claim_staff_invitation` (`supabase/migrations/20260911110000_staff_account_invitations.sql`): ein Konto ohne passende offene Einladung bleibt zugriffslos.

**Änderungspfad.** Sobald B13 einen Versandweg hat und eine serverseitige Funktion freigegeben ist: eine Funktion mit dem `service_role`-Schlüssel als Secret, aufgerufen aus `sendeZugangsMail`; Datenmodell, Rollen und RPCs bleiben unverändert · Aufwand `mittel`. Zurückzunehmen ist nichts — der heutige Stand ist die restriktive Variante.

**Abnahme (Jannes, 2026-10-02).** Als Übergang bestätigt. Ziel ist, neue Mitarbeitende ganz aus der Anwendung einzuladen, ohne ein Konto auf der Oberfläche des Anmeldedienstes anzulegen: offene Aufgabe G21 STAFF-005 der Roadmap, die diese Annahme ablöst.

### ANN-026 — Datenklasse und Frist der Einladung

Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (die Frist); die Klasse steht seit LOE-001a im Retention Schedule

**Annahme.** Eine Einladung (`public.staff_account_invitations`) ist ein Zugangs- und Authentifizierungsdatum, kein Gesundheits- und kein Beschäftigtendatum im Sinne von §20. Frist: 12 Monate nach Abschluss des Vorgangs, wie „Normale Authentifizierungs- und Securitylogs" in ADR-008. Die Gültigkeit einer offenen Einladung beträgt 14 Tage; sie läuft ab, statt aufgeräumt zu werden — kein Hintergrundjob, kein unbeobachtet kippender Zustand.

**Begründung.** Der Datensatz enthält E-Mail-Adresse, Rollenliste und Zeitstempel — Kontaktdatum und Berechtigungsentscheidung, kein Inhalt über eine Person. Er ist zugleich der Nachweis, auf welcher Grundlage ein Zugang entstand; ADR-010 Punkt 2 führt Rollen- und Berechtigungsänderungen als auditpflichtig, und ein Nachweis, der früher verschwindet als das Auditlog, wäre wertlos — deshalb wird eine Einladung abgeschlossen, nie gelöscht. 14 Tage überstehen Urlaub und Krankheit, ohne eine vergessene Einladung dauerhaft offenzulassen. Unsicher: ob die Prüfung statt 12 Monaten die drei Jahre des Auditlogs verlangt.

**Anker.** `COMMENT ON TABLE public.staff_account_invitations` und die Frist `now() + interval '14 days'` in `invite_staff_account`, beides in `supabase/migrations/20260911110000_staff_account_invitations.sql`.

**Änderungspfad.** Andere Gültigkeit: ein Intervall · Aufwand `klein`. Andere Aufbewahrung: die Zeile `zugangseinladung` in `public.retention_classes` · Aufwand `klein`.

**Abnahme (Jannes, 2026-10-02).** 14 Tage Gültigkeit bestätigt. Die zwölf Monate hat Jannes zur Prüfung zurückgegeben. **Prüfergebnis (Claude, 2026-10-02), zu bestätigen:** Der Berechtigungsnachweis hängt nicht an der Einladung. Die Auditeinträge `staff_account.invited` (wer, welche Rollen), `.invitation_accepted` (welches Konto) und `.roles_changed` tragen ihn selbst, verweisen auf die Mitarbeiterin statt auf die Einladung und gelten drei Jahre (ANN-029). Die Einladung trägt danach nur die Adresse, ein Kontaktdatum, für das zwölf Monate zur Datenminimierung passen. Anders bei der Plattform (ADR-023 Punkt 5): Dort steht der Nachweis nur an Zugang und Einladung, deshalb drei Jahre. Vorschlag: Einladung zwölf Monate, Nachweis im Auditlog drei Jahre — getrennt, wie heute gebaut, kein Code. **Abnahme (Jannes, 2026-10-02):** bestätigt unter der Trennung: Einladung zwölf Monate nach Abschluss; der vollständige, davon unabhängige Berechtigungsnachweis steht drei Jahre im Auditlog.

### ANN-027 — Mindestlänge des Kennworts: 12 Zeichen, keine Zeichenklassen

Datenschutz · entschieden (Jannes) · 2026-09-11 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung im Rahmen der TOM (G14); OPS-001 (Einstellung beim Provider). Kategorie `Datenschutz`: Die Bestätigung durch den Projektinhaber ersetzt die Prüfung nicht

**Annahme.** Ein Kennwort für die Praxisplattform braucht mindestens 12 Zeichen. Keine erzwungenen Zeichenklassen, kein turnusmäßiger Wechsel, keine Sperre nach Fehlversuchen über das hinaus, was der Anmeldedienst ohnehin tut.

**Begründung.** Das BSI hat die Empfehlung zum regelmäßigen Kennwortwechsel 2020 aus dem IT-Grundschutz gestrichen, und NIST SP 800-63B rät von erzwungener Komplexität und periodischem Wechsel ab: Beides führt zu vorhersehbaren Mustern und aufgeschriebenen Kennwörtern. Länge trägt, und 12 Zeichen sind der von beiden Quellen genannte untere Wert für Konten ohne zweiten Faktor; gegen mehr spricht die Eingabe auf dem Telefon am Hausbesuch (§16). Unsicher: ob die TOM-Prüfung mehr verlangt und ob der Anmeldedienst die Regel serverseitig in derselben Höhe durchsetzt — verbindlich ist die Einstellung beim Provider (OPS-001).

**Anker.** `KENNWORT_MINDESTLAENGE` in `src/features/account/api.ts` — eine Zahl; `kennwortProblem` daneben ist die einzige Prüfung; Test in `src/features/account/MeinKontoPage.test.tsx`.

**Änderungspfad.** Andere Länge: eine Zahl · Aufwand `klein`, zusätzlich die Provider-Einstellung nachziehen. Zeichenklassen oder Wechselzwang: eine Regel in `kennwortProblem` und eine Provider-Einstellung · Aufwand `klein`, inhaltlich aber gegen die genannten Quellen und deshalb nur auf ausdrückliches Verlangen der Prüfung.

### ANN-028 — MFA für `owner`: eingerichtet und sichtbar, nicht erzwungen

Datenschutz · entschieden (Jannes) · 2026-09-11 · Jannes · Prüfpaket · Wiedervorlage: **Jannes, nach dem Online-Schalten der Anwendung** (Entscheidung vom 2026-09-12; bis dahin galt „sobald eine Domain feststeht“). Vorher wird der zweite Faktor weder abgefragt noch erzwungen. Die Datenschutzprüfung sieht den Punkt unabhängig davon.

**Annahme.** Der zweite Faktor (TOTP) ist einrichtbar und sichtbar, aber die Anmeldung wird nicht darauf festgelegt: Kein Datenpfad verlangt heute `aal2`. Ein `owner`-Zugang ohne zweiten Faktor sieht in „Mein Konto" einen Warnhinweis; sperren tut ihn nichts.

**Begründung.** ADR-010 Punkt 10 verlangt MFA für privilegierten Produktionszugriff, nicht für die Alltagsrolle `owner` (Punkt 11 hält beide Domänen getrennt). Ein Zwang wäre eine Verschärfung über den ADR hinaus mit gefährlicher Nebenwirkung: Es gibt genau einen `owner`-Zugang (Bus-Faktor 1, ADR-012) ohne zweiten Faktor — er wäre im selben Moment ausgesperrt, und der Weg zurück wäre ein privilegierter Produktionszugriff, den ADR-010 Punkt 9 ausschließt. Erst einrichten, dann erzwingen. Unsicher: ob die Datenschutzprüfung MFA für Vollzugriff auf Gesundheitsdaten als TOM verlangt — das wäre kein Widerspruch, sondern der geplante zweite Schritt.

**Anker.** `app.has_strong_authentication()` in `supabase/migrations/20260911140000_account_security.sql` — der eine Ausdruck, an dem eine Durchsetzung hinge; der Test „setzt heute nichts durch" in `supabase/tests/staff-accounts.test.ts` hält fest, dass nichts daran hängt; Hinweis in `src/features/account/MeinKontoPage.tsx`.

**Änderungspfad.** Durchsetzung einschalten, sobald mindestens zwei `owner`-Zugänge einen bestätigten Faktor haben: `app.has_strong_authentication()` in die Policies der Zugangsverwaltung aufnehmen und den genannten Test umdrehen · Aufwand `klein`. Vorher nicht — die Rücknahme wäre ein privilegierter Produktionszugriff und damit `groß`.

**Bestätigt (Jannes, 2026-10-06):** „Behalten, aber erstmal nicht einrichten. Wichtiger ist, dass Nutzer nach 30/60 min automatisch ausgeloggt werden.“ Der zweite Faktor bleibt einrichtbar und wird nicht erzwungen; Jannes richtet ihn vorerst nicht ein. Vorrang hat die Sitzungssperre nach ADR-025 (SEC-EPIC-001). Das Geheimnis „Zum Abtippen“ steht seit SKN-008 in 14 px Festbreite.

### ANN-029 — Auditeinträge folgen ihrer eigenen Frist, nicht der der Akte

Datenschutz · entschieden (Jannes) · 2026-09-11 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung / DSFA-Prozess vor Produktivstart · **LOG-EPIC-001:** eigene Fristen bleiben, jetzt zwei – Lesen und Sicherheit 12 Monate, übrige 3 Jahre (ADR-010 Fassung 3, ANN-230).

**Annahme.** Ein Auditeintrag wird drei Jahre nach dem Ereignis gelöscht, unabhängig davon, ob die Akte, auf die er sich bezieht, noch besteht. Die Löschung einer Patientenakte löscht nicht die Auditeinträge über die Zugriffe auf sie.

**Begründung.** ADR-008 führt Patientenakten-Auditlogs als eigene Datenklasse mit eigener Frist, nicht als Anhängsel der Akte; ADR-010 nennt das Auditlog die tragende Kompensation dafür, dass alle Therapeut:innen alle Akten sehen dürfen (§4.2) — fiele es mit der Akte, verschwände der Nachweis genau dann, wenn er am weitesten zurückreicht. Der Eintrag trägt nur Metadaten (ADR-010 Punkt 3), und nach der Löschung ist die Patientenkennung ein Schlüssel ohne Schloss. Unsicher: ob die Prüfung verlangt, mit der Akte auch den Zugriffsnachweis zu tilgen (Art. 17 DSGVO) — eine vertretbare Gegenposition, die Nachweisbarkeit kostet.

**Anker.** Datenklasse `auditlog` in `supabase/migrations/20260911150000_retention_schedule.sql` und die eigenständige Regel für `audit_log` im Löschlauf (LOE-002a); Test „löscht Auditeinträge nach eigener Frist, nicht mit der Akte" in `supabase/tests/retention-run.test.ts`.

**Änderungspfad.** Auditlog mit der Akte fallen lassen: im Löschlauf zusätzlich die Einträge mit `subject_id = patient_id` und `context->>'patient_id'` entfernen · Aufwand `klein`. Längere Aufbewahrung: Friständerung in `retention_classes` · Aufwand `klein`.

### ANN-030 — Beschäftigtendaten ohne Frist: keine automatische Löschung in V1

Datenschutz · entschieden (Jannes) · 2026-09-11 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung; Jannes, sobald die erste Person ausscheidet — spätestens vor der ersten Einstellung

**Annahme.** Mitarbeiterdatensätze, Privatangaben und Arbeitszeiten (`staff_members`, `staff_private_details`, `staff_working_hours`, `staff_working_hour_exceptions`) werden nicht automatisch gelöscht; sie tragen die Datenklasse `beschaeftigtendaten` mit der Grundlage `offen`.

**Begründung.** ADR-008 tabelliert für Beschäftigtendaten keine Frist, und die naheliegenden Anker widersprechen sich: steuerliche Fristen für Lohnunterlagen (§147 AO, §257 HGB), die diese Anwendung nicht führt, Wochen für Bewerbungsunterlagen, §195 BGB für arbeitsrechtliche Streitfälle. Eine erfundene Zahl wäre schlechter als keine — §20 schützt diese Daten besonders, und eine zu kurze Frist löscht Nachweise, die die Praxis im Streitfall braucht; zudem fehlt der Anker im Datenmodell (kein Datum des Ausscheidens). Unsicher: ob die Prüfung eine Frist verlangt, bevor die erste Person ausscheidet.

**Anker.** Datenklasse `beschaeftigtendaten` in `supabase/migrations/20260911150000_retention_schedule.sql` mit `basis = offen`; der Test „begründet jede Frist ohne gesetzliche Grundlage mit einer Annahme" in `supabase/tests/retention.test.ts` verhindert, dass die Lücke stillschweigend bleibt.

**Änderungspfad.** Frist setzen: ein Datum des Ausscheidens auf `staff_members`, die Klasse auf diesen Anker stellen, Regel im Löschlauf ergänzen · Aufwand `mittel`, weil das Datum fachlich gepflegt werden muss. Reine Friständerung ohne neuen Anker · Aufwand `klein`.

### ANN-031 — Das Löschjournal hat selbst keine Frist

Datenschutz · entschieden (Jannes) · 2026-09-11 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung; erneut mit OPS-003, sobald der Backup-Lebenszyklus definiert ist (ADR-012, offene Folgefrage) · **LOG-EPIC-001:** abgelöst – das Löschjournal lebt 60 Tage (Backups 30 Tage, ADR-012 Fassung 2).

**Annahme.** Das Löschjournal (`deletion_journal`) wird nicht automatisch gelöscht. Es hält je gelöschtem Datensatz Tabelle, Kennung, Datenklasse, Fälligkeit und Zeitpunkt fest — keinen Namen, keinen Inhalt, keine Fremdschlüssel auf bestehende Daten.

**Begründung.** ADR-008 Punkt 8 verlangt, wirksam gewordene Löschungen nach einer Wiederherstellung erneut anzuwenden, aus einer Liste, die den Restore überlebt; eine Liste mit eigener Frist könnte kürzer sein als die älteste Backup-Generation, und gelöschte Daten kämen unbemerkt zurück. Solange der Backup-Lebenszyklus offen ist (ADR-012), lässt sich keine sichere Frist bestimmen. Der Preis ist gering: Die verbleibende UUID ist ein Schlüssel ohne Schloss (Erwägungsgrund 26 DSGVO), und die Zeile ist zugleich der von ADR-008 verlangte Nachweis. Unsicher: ob die Prüfung das Journal dennoch als personenbezogen einstuft.

**Anker.** Datenklasse `loeschjournal` in `supabase/migrations/20260911150000_retention_schedule.sql` und der Tabellenkommentar von `public.deletion_journal`.

**Änderungspfad.** Frist einführen, sobald der Backup-Lebenszyklus steht: Zeile in `retention_classes` auf Anker `event_time` und ein Intervall, das die älteste Backup-Generation sicher überdauert, plus Regel im Löschlauf · Aufwand `klein`.

### ANN-032 — „Abschluss der Versorgung" als ausdrücklicher, rücknehmbarer Vorgang

Praxisprozess · entschieden (Jannes) · 2026-09-11 · Jannes · erledigt · Wiedervorlage: Jannes nach den ersten Praxiswochen (passt der Vorgang in den Alltag?); die Datenschutzprüfung sieht den Fristanker unabhängig davon

**Ablösung.** ersetzt ANN-002 in der Frage „Behandlungsabschluss"

**Annahme.** Der „Abschluss der Behandlung" aus §630f Abs. 3 BGB ist ein ausdrücklicher Vorgang auf der Akte: `patients.care_concluded_on`, gesetzt von `owner`, `therapist` oder `team_lead`, mit frei wählbarem Tag (nicht in der Zukunft, nicht vor dem Beginn der Versorgung) und zurücknehmbar. Ohne diesen Vorgang läuft keine Aufbewahrungsfrist und wird nichts gelöscht; eine Rücknahme lässt die Frist mit dem nächsten Abschluss neu beginnen.

**Begründung.** ADR-008 verlangt den Anker und lässt seine Definition offen; ANN-002 hält fest, dass `inactive` ihn nicht ersetzt. Gegen einen Automatismus („sechs Monate kein Termin") spricht, dass er eine zehnjährige Frist ohne fachliche Entscheidung startet, dass eine Pause kein Abschluss ist und dass die automatische Klassifizierung am offenen Rechtsrahmen B9 hängt. Die Rücknehmbarkeit ist die sicherere Seite (§16, ADR-008 Punkt 2). Unsicher: ob die Praxis den Vorgang zuverlässig ausführt — wird er vergessen, wird nicht gelöscht, der Fehler geht also in Richtung Aufbewahrung.

**Anker.** `public.conclude_patient_care`, `public.reopen_patient_care` und `app.can_conclude_patient_care()` in `supabase/migrations/20260911160000_care_conclusion.sql`; Tests in `supabase/tests/care-conclusion.test.ts`; Oberfläche `VersorgungAbschliessen` in `src/features/patients/PatientMasterDataPage.tsx`.

**Änderungspfad.** Rollenschnitt ändern: Migration, die `app.can_conclude_patient_care()` ersetzt · Aufwand `klein`. Automatische Klassifizierung: eigenes Feature, hängt an B9 · Aufwand `mittel` bis `groß`. Anker verschieben (etwa auf den letzten durchgeführten Termin): Migration und Änderung der Löschregel · Aufwand `klein`, solange noch nichts gelöscht wurde.

### ANN-033 — Legal Hold nur auf Patientenebene, nur `owner`, ohne Pflegeoberfläche

Recht · entschieden (Jannes) · 2026-09-11 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2); außerdem sofort, wenn der erste reale Vorgang eintritt — dann zeigt sich, ob der Zuschnitt trägt

**Annahme.** Eine Löschsperre wirkt auf genau eine Patientenakte, wird nur von `owner` gesetzt und aufgehoben, trägt einen Pflichtgrund als Freitext und wird beim Aufheben nicht gelöscht, sondern mit Ende und verantwortlicher Person fortgeschrieben. Es gibt keine Pflegeoberfläche; laufende Sperren sind in der Aufbewahrungsübersicht sichtbar.

**Begründung.** ADR-008 verlangt den Mechanismus und lässt Träger und Berechtigung offen; der realistische Anlass in einer Einzelpraxis hängt an einer Akte, eine Sperre „für alles" wäre heute ein Feature ohne Anwendungsfall (ADR-014) und ließe sich als weiterer `subject_type` nachziehen. Der Rollenschnitt folgt §4.1, das Fortschreiben beim Aufheben verlangt ADR-008 selbst („Beginn, Grund, verantwortliche Person und Ende"). Unsicher: ob die Prüfung eine Sperre auch für Beschäftigten- oder Abrechnungsdaten verlangt — für beide gibt es heute keine automatische Löschung (ANN-030).

**Anker.** `public.legal_holds`, `app.under_legal_hold()` und `app.can_manage_legal_hold()` in `supabase/migrations/20260911170000_legal_hold.sql`; Tests in `supabase/tests/legal-hold.test.ts` und der Haltefall in `supabase/tests/retention-run.test.ts`.

**Änderungspfad.** Weiterer Gegenstand (etwa `staff_member` oder `invoice`): `subject_type` erweitern und die Prüfung in die betreffende Löschregel aufnehmen · Aufwand `klein`. Pflegeoberfläche: eine Seite mit zwei Aktionen auf den bestehenden Funktionen · Aufwand `klein`, bewusst nicht in diesem Epic.

### ANN-034 — Absagegrund als codierte Auswahl aus vier Werten, kein Freitext

Datenschutz · entschieden (Jannes) · 2026-09-12 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2); außerdem Jannes nach den ersten Praxiswochen — dort zeigt sich, ob vier Werte reichen

**Annahme.** Der Absagegrund ist eine codierte Auswahl aus genau vier Werten — „Patient:in hat abgesagt", „Praxis hat abgesagt", „Termin verlegt", „Sonstiger Grund" — ohne Freitextfeld. Er ist Pflicht für jede neue Absage, Bestandszeilen behalten `null`, und er steht an der Terminzeile, nicht im Auditkontext.

**Begründung.** ADR-018 nennt den Zweck: ohne Grund ist die Absagequote nicht lesbar — wer abgesagt hat und ob verlegt wurde, ist die ganze dafür nötige Auskunft. Ein Freitextfeld leistet nichts zusätzlich, ist aber die wahrscheinlichste Stelle, an der eine Gesundheitsangabe in einen klinikfreien Datensatz rutscht; §4.6 und §5 halten den Termin davon frei, §16 verlangt die datensparsamere Option. Dass der Grund nicht ins Auditlog wandert, folgt derselben Linie: Die Terminzeile fällt nach drei Jahren (ANN-001), das Auditlog läuft nach eigener Frist (ANN-029). Unsicher: ob die Praxis eine fünfte Kategorie vermisst, sobald ADR-009 das Ausfallhonorar regelt.

**Anker.** `public.appointments.cancellation_reason` mit Constraint `appointments_cancellation_reason_values` und die Prüfung in `public.cancel_appointment`, beide in `supabase/migrations/20260912110000_cancellation_reason.sql`; Beschriftungen in `cancellationReasonLabels` (`src/features/appointments/api.ts`).

**Änderungspfad.** Weiterer Wert: ein Eintrag in der Constraint, einer in `cancellationReasonLabels` · Aufwand `klein`, ohne Migration bestehender Zeilen. Freitext zusätzlich: neue Spalte, Redaction-Regel im Logging, Aufnahme in die Löschprüfung und eine Aussage in der DSFA · Aufwand `mittel`, und die Abwägung oben spricht dagegen.

### ANN-035 — No-show fällt unter die Frist der abgesagten Termine; mit Gebührenanlass wird nicht gelöscht

Recht · entschieden (Jannes) · 2026-09-12, nachgezogen 2026-09-16 (CAL-018) · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2), Steuerberatung (B4) für die Aufbewahrung des Gebührenanlasses; die Abrechnung hat das Kennzeichen als Haltegrund belassen, weil eine Ausfallleistung nur aus ihm entsteht (ANN-072)

**Annahme.** Ein Termin im Zustand `no_show` fällt unter die bestehende Klasse `termin_ohne_nachweis` — drei Jahre ab Ende des Kalenderjahres, gerechnet ab dem Zeitpunkt des Vermerks statt ab der Absage. Er wird nicht gelöscht, wenn ein Gebührenanlass gesetzt ist; Behandlungsnachweis und Löschsperre halten ihn wie bisher zurück. Eine eigene Datenklasse bekommt er nicht. **Seit CAL-018** trägt jedes Nichtantreffen am Hausbesuch diesen Anlass (E14, ADR-018 Fassung 3 Punkt 9) — dort ist der Löschschutz damit der Regelfall und nicht mehr die Ausnahme; in der Praxis und im Videotermin bleibt es umgekehrt (ANN-055).

**Begründung.** Die Klasse trägt seit LOE-001a ausdrücklich „Abgesagte Termine und No-shows ohne Rechnung" (ADR-008); fachlich ist beides derselbe Fall — ein Termin ohne Behandlungsnachweis und ohne die Zehnjahresfrist aus §630f Abs. 3 BGB —, und eine eigene Klasse mit derselben Frist wäre eine zweite Zahl für denselben Sachverhalt (ADR-014). Dass ein No-show mit Kennzeichen stehen bleibt, ist die vorsichtigere Seite (§16): Was abgerechnet werden soll, unterliegt der steuerlichen Aufbewahrung (§147 AO, §257 HGB). Unsicher: ob diese Frist an der Rechnung hängt statt am Vorgang — ABR-003 beantwortet das mit der Rechnung selbst.

**Anker.** Die Regel „Abgesagte Termine und No-shows ohne Behandlungsnachweis" in `public.apply_retention()`, zuletzt gefasst in `supabase/migrations/20260912200000_cancellation_notice.sql` (Bedingung `fee_basis is null`); Tests in `supabase/tests/retention-run.test.ts`. Die Regel selbst blieb mit CAL-018 unverändert — sie fragt seit CAL-014b nach dem Anlass und nicht nach seiner Herkunft.

**Änderungspfad.** Eigene Klasse mit eigener Frist: eine Zeile in `retention_classes`, eine Zuordnung in `retention_assignments`, die Regel aufteilen · Aufwand `klein`. Rechnung statt Kennzeichen als Haltegrund: eine Bedingung in derselben Regel austauschen, die Rechnungstabelle gibt es seit ABR-EPIC-002a · Aufwand `klein`.

### ANN-036 — `documented` auch aus `confirmed`: die Finalisierung schließt den Termin mit ab

Technik · in ADR überführt · 2026-09-13 · ADR-018 Fassung 3 · erledigt · Wiedervorlage: ADR-018; erneut nur, wenn ein Loop den Terminzustand `invoiced` setzt — die Abrechnung setzt ihn nicht (R3-001)

**Verweis.** Am 2026-09-13 in ADR-018 Fassung 3 überführt: Die Finalisierung einer Behandlungsdokumentation hebt den Termin auch aus `confirmed` auf `documented`, setzt `completed_at` nach und lässt `completed_by` leer. Maßgeblich ist seitdem der ADR; Herleitung und Abwägung: Git-Historie bis `7160fd5`.

**Anker.** `app.mark_appointment_documented()` in `supabase/migrations/20260912130000_appointment_documented.sql`; Tests in `supabase/tests/appointment-states.test.ts` samt Invariantenprüfung über alle Termine.

**Änderungspfad.** Umkehren: die `where`-Bedingung auf `status = 'completed'` verengen und `finalize_treatment_note` einen `confirmed`-Termin abweisen lassen · Aufwand `klein` im Code, aber eine neue fachliche Entscheidung für den Scheduler-Fall — und eine Änderung an ADR-018.

### ANN-037 — Geprüft wird die Länge des Terminfensters, nicht der Zeitpunkt

Praxisprozess · verworfen · 2026-09-17 · ANN-056 · erledigt · Wiedervorlage: keine

**Ablösung.** abgelöst durch ANN-056 in der Frage, wogegen die Länge geprüft wird; der Bestandsschutz („nur wenn sie sich ändert") gilt dort unverändert weiter

**Verweis.** Die feste Länge von 60 Minuten ist mit `PROJECT_PRINCIPLES.md` 0.11 §8.1 entfallen (CAL-020); seitdem gilt ANN-056 — jede Länge im Praxisraster, geprüft nur, wenn sie sich ändert. Wortlaut der abgelösten Annahme: Git-Historie bis `6784a5f`.

**Anker.** Die Längenprüfungen in `supabase/migrations/20260917110000_free_appointment_length.sql` (ANN-056); die frühere Fassung in `20260912150000_appointment_window.sql` ist durch sie ersetzt.

**Änderungspfad.** Keiner mehr an dieser Stelle; siehe ANN-056.

### ANN-038 — Terminserie: verplant ist nicht genutzt, drei Rhythmen, höchstens 30 je Vorgang

Praxisprozess · entschieden (Jannes) · 2026-09-12 · Jannes · erledigt · Wiedervorlage: keine — die Fortschreibung der genutzten Menge trägt seit ABR-EPIC-001 ANN-073

**Ablösung.** ersetzt ANN-012 in der Zählweise („verplant ist nicht genutzt") · **ANN-064** ersetzt die Bezugsgröße: `verordnet` ist seit VER-EPIC-002 die Anzahl möglicher **Termine**, nicht die Summe der Leistungsmengen. Die Formel `offen = verordnet − max(genutzt, verplant)` bleibt unverändert

**Annahme.** Drei Festlegungen: Verplant ist nicht genutzt — ein aus einer Verordnung geplanter Termin trägt deren Kennung, offen ist `verordnet − max(genutzt, verplant)`, abgesagte Termine zählen nicht als verplant, „nicht angetroffen" zählt mit, und die genutzte Menge schreibt die Leistungserfassung fort (ANN-073). Das Kontingent begrenzt die Serie nicht: Die Oberfläche schlägt das offene Kontingent vor und weist auf eine Überschreitung hin, der Server lässt sie zu. Drei Rhythmen (wöchentlich, zweimal pro Woche als 3/4-Wechsel, zweiwöchentlich), höchstens 30 Termine je Vorgang.

**Begründung.** Ohne die Verknüpfung böte die Anwendung beim zweiten Aufruf dieselben Behandlungen erneut an; eine Addition von genutzt und verplant zählte jede durchgeführte Behandlung doppelt. Die genutzte Menge automatisch fortzuschreiben wäre eine Aussage über die Leistung und gehört zu ABR-002. Die harte Grenze sitzt bereits an der Constraint `prescription_items_used_within_prescribed`; eine zweite am Kalender blockierte alltägliche Planung, ohne die Abrechnung sicherer zu machen. Der 3/4-Wechsel hält die Serie auf zwei festen Wochentagen. Unsicher: ob Jannes eine Rückfrage bei Überschreitung will und ob Gebietstage feste Wochentage verlangen.

**Anker.** `app.prescription_slot_counts()` und `app.appointment_series_limit()` sowie die Spalte `appointments.prescription_id` in `supabase/migrations/20260912160000_appointment_series.sql`; `rhythmen` und `SERIE_HOECHSTZAHL` in `src/features/appointments/serie.ts`.

**Änderungspfad.** Harte Grenze: eine Prüfung in `create_appointment_series` gegen `remaining` · Aufwand `klein`. Weitere Rhythmen oder freier Tagesabstand: ein Eintrag in `rhythmen` · Aufwand `klein`.

### ANN-039 — Terminzettel: Inhalt, Druck, Aufruf als Aktenzugriff protokolliert

Datenschutz · entschieden (Jannes) · 2026-09-12 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2); der Versandweg seit CAL-013 in ANN-041 und B15 · **LOG-EPIC-001:** gilt, als „Akte geöffnet“ einmal je Person, Akte und Tag (ANN-230).

**Ablösung.** abgelöst durch ANN-041 in Punkt 2 (Versand)

**Annahme.** Der Terminzettel trägt Name der Patient:in und je Termin Datum, Uhrzeit, Ort und behandelnde Person — nicht Terminstatus, Verordnung, Diagnose, Behandlungsinhalt oder die Hausbesuchsadresse (der Ort steht als „bei Ihnen zu Hause"); ausgegeben werden nur bestätigte künftige Termine. Sein Aufruf wird als `patient_record.viewed` mit `view: 'appointment_slip'` protokolliert. Der Druck vermerkt nichts; erst die anschließende Frage „Wurde der Zettel ausgehändigt?" schreibt den Mitteilungsvermerk. Der Versandweg ist seit CAL-013 in ANN-041 geregelt.

**Begründung.** Was auf Papier steht, lässt sich nicht zurückrufen: Der Zettel beantwortet genau eine Frage, alles weitere wäre Offenlegung ohne Zweck (§5, §4.6). ADR-010 Punkt 2 verlangt das Öffnen einer Akte als auditierbares Ereignis — der Zettel ist derselbe Blick über eine andere Adresse, ein eigener Ereignistyp hätte den Katalog verlängert, ohne mehr zu sagen. Der Vermerk wanderte in Fassung 2 hinter den Druck, weil ein abgebrochener Druckdialog der Regelfall ist und ein Vermerk, der eine Aushändigung behauptet, ein unrichtiges Datum wäre (Art. 5 Abs. 1 lit. d DSGVO). Unsicher: ob die Prüfung ein eigenes Ereignis „Dokument ausgegeben" vorzöge.

**Anker.** `public.list_patient_appointment_slip()` in `supabase/migrations/20260912170000_appointment_slip.sql` — Spaltenliste und Auditeintrag sind die Grenze; `src/features/appointments/AppointmentSlipPage.tsx`; Tests in `supabase/tests/appointment-slip.test.ts`.

**Änderungspfad.** Zur Reihenfolge aus Fassung 1 zurück: Klickhandler und Bestätigungskasten in `AppointmentSlipPage.tsx` · Aufwand `klein`. Mehr oder weniger Inhalt: Spaltenliste und Darstellung · Aufwand `klein`. Eigenes Auditereignis: ein Eintrag im Katalog und ein geänderter `insert` · Aufwand `klein`. Versand nach B15: eigenes Epic · Aufwand `groß`.

### ANN-040 — Mitteilungsvermerk: vier Wege, Verfall mit jeder Terminänderung, Auditeintrag

Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2); der Weg `email` zusätzlich mit B15 und PAT-006 · **LOG-EPIC-001:** gegenstandslos – der Vermerk steht am Termin (`notified_by`), nicht im Auditlog.

**Annahme.** Ein Termin trägt einen Vermerk, ob und auf welchem Weg er der Patient:in mitgeteilt wurde: vier Wege (persönlich, telefonisch, Terminzettel ausgehändigt, per E-Mail) — `sms` und `messenger` fehlen bewusst. Der Vermerk verfällt mit jeder Terminänderung (gültig nur, solange `notified_at >= appointments.updated_at`), gelöscht wird dabei nichts. Der Vorgang ist auditiert (`appointment.notified`), mit den Wegen im Kontext und ohne jeden Inhalt. Seit CAL-013 entsteht der Weg `email` auch aus der Übergabe ans Mailprogramm (ANN-041).

**Begründung.** Die Wahl des Kanals bleibt Sache der Praxis; die Anwendung hält fest, was geschehen ist, und schafft keinen Empfänger, der vorher keiner war — deshalb kein neuer Verarbeitungsweg nach §3.5. Ein Vermerk, der eine verschobene Zeit überlebt, wäre schlimmer als keiner; der Vergleich gegen `updated_at` löst das ohne Frist und ohne Aufräumlauf, um den Preis, dass „nie mitgeteilt" und „seit der Mitteilung geändert" gleich aussehen — beabsichtigt, der Handlungsbedarf ist derselbe. Unsicher und deshalb im Prüfpaket: ob die Datenschutzprüfung den Weg `email` in der Auswahl sehen will.

**Anker.** Tabelle `public.appointment_notifications`, `app.appointment_notification_channels()`, `public.set_appointment_notification()` und `public.add_appointment_notification()` in `supabase/migrations/20260912180000_appointment_notification.sql`; `notificationChannelSchema` in `src/features/appointments/api.ts`.

**Änderungspfad.** Weg streichen oder ergänzen: ein Wert in Constraint, Zod-Schema und Beschriftungstabelle · Aufwand `klein`; gesetzte Vermerke eines gestrichenen Weges wären einmalig zu entfernen. Verfallsregel lockern: Vergleich gegen einen eigenen Zeitstempel, den nur `update_appointment` bei Zeitänderungen bumpt · Aufwand `mittel`. Echter Versand nach B15: eigenes Epic · Aufwand `groß`. **Fassung 2 (ABN-003, 2026-10-02, Abnahme Jannes, BEF-093):** Der Vermerk verfällt nur noch bei Änderungen, die die Patient:in betreffen (Beginn, Ende, Terminart, Ort, Adresse, Person, Absage); Anker ist die Spalte `appointments.patient_relevant_changed_at` mit dem Trigger `appointments_patient_relevant_change` in `supabase/migrations/20261002122000_abn_003_patient_relevant_change.sql`. Weitere Spalten als relevant erklären: die Liste im Trigger ergänzen · Aufwand `klein`.

**Abnahme (Jannes, 2026-10-02).** Anders entschieden als bisher: „Mitgeteilt“ verfällt nur bei Änderungen, die für die Patient:in relevant sind (Zeit, Ort, Terminart, behandelnde Person, Absage), nicht bei Dokumentations- oder Abrechnungsstatus — BEF-093. Bis zur Umsetzung gilt die bisherige Regel.

### ANN-041 — Termin-E-Mail als Handoff ins eigene Mailprogramm

Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2); der dokumentierte Wunsch je Patient:in mit PAT-006

**Ablösung.** ersetzt ANN-039 Punkt 2 (Versand)

**Annahme.** Die Anwendung baut eine `mailto:`-Adresse und übergibt sie dem Mailprogramm der Praxis — kein Versand, keine Verbindung, keine gespeicherte Nachricht, nur auf Aktion und nie automatisch. Inhalt sind genau die Felder des Terminzettels, der Betreff nennt weder Praxis noch Fach („Ihre nächsten Termine"). Vor der Übergabe zeigt die Oberfläche Text, Empfängeradresse und den Hinweis, dass E-Mail unterwegs unverschlüsselt ist und der Weg den ausdrücklichen Wunsch der Patient:in voraussetzt. Die Übergabe vermerkt nichts; erst die Frage „Wurde sie gesendet?" schreibt den Vermerk. Der Entwurf bleibt unter 1 800 Zeichen, kürzt von hinten und benennt, welche Termine fehlen.

**Begründung.** §3.5 verlangt die Prüfung vor der Freischaltung eines Dienstleisters; ein Handoff schaltet keinen frei — die Nachricht entsteht im Postfach, das die Praxis ohnehin betreibt (dieselbe Konstruktion wie der Navigations-Handoff, ANN-018). Eine Terminliste ist ein Gesundheitsdatum; die DSK-Orientierungshilfe zur E-Mail-Übermittlung (16.06.2021) verlangt dafür Ende-zu-Ende- und Transportverschlüsselung, erkennt aber den ausdrücklichen Wunsch nach Aufklärung an (so auch die Hinweise von Bundesärztekammer/KBV). Unsicher und deshalb im Prüfpaket: Dieselben Quellen sagen, dass das Schutzniveau nicht durch Vereinbarung absenkbar ist — die Antwort dieser Annahme ist deshalb Datenminimierung, nicht Einwilligung. Der Vermerk steht hinter der Übergabe, weil die Anwendung den Ausgang eines Handoffs nicht sieht (§13).

**Anker.** `src/features/appointments/terminmail.ts` — Inhalt, Betreff, Längengrenze und Übergabe an einer Stelle; Oberfläche `src/features/appointments/TermineMailen.tsx` in `AppointmentSlipPage.tsx`; Tests in `terminmail.test.ts` und `TermineMailen.test.tsx`.

**Änderungspfad.** Inhalt oder Betreff ändern: `terminMailText` und `MAIL_BETREFF` · Aufwand `klein`. Den Weg zurücknehmen: `TermineMailen` aus `AppointmentSlipPage.tsx` entfernen, beide Dateien löschen; der Weg `email` bleibt als Vermerk von Hand · Aufwand `klein`. Dokumentierten Wunsch je Patient:in verlangen: Kennzeichen in den Kontaktdaten plus Bedingung · Aufwand `mittel`, gehört zu PAT-006. Echter Versand: eigenes Epic · Aufwand `groß`. **Abnahme (Jannes, 2026-10-02):** bestätigt.

### ANN-042 — Wann eine Verordnung ausgeschöpft ist

Praxisprozess · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Jannes nach den ersten Praxiswochen; die genutzte Menge kommt seit ABR-EPIC-001 aus der Leistungserfassung (ANN-073)

**Ablösung.** ersetzt ANN-012 in der Frage, wann eine Verordnung ausgeschöpft ist · **ANN-064** ersetzt die Bezugsgröße: gezählt werden seit VER-EPIC-002 Termine

**Annahme.** Eine Verordnung gilt als ausgeschöpft, sobald ihre genutzten die möglichen Termine erreichen (`used >= prescribed`). Solange Termine offen sind, gilt sie als laufend und zerfällt in „offen" (`remaining > 0`, es lässt sich noch etwas planen) und „vollständig verplant" (Termine offen, aber für jeden steht ein Eintrag im Kalender). Ein Ablauf nach Zeit kommt nicht vor.

**Begründung.** Die Praxis rechnet privat ab; die Fristen des Heilmittelkatalogs sind GKV-Regeln und gelten für eine Privatverordnung nicht unmittelbar, und welche Frist ein privater Kostenträger ansetzt, steht in seinem Tarif. Eine erfundene Frist zeigte eine Verordnung als erledigt, die es nicht ist — genau davor warnt §13. Gezählt wurden bis VER-EPIC-002 Leistungseinheiten, weil ein Termin abgesagt werden kann und seinen Platz zurückgibt, eine genutzte Einheit aber genutzt bleibt; seit ANN-064 steht dieselbe Überlegung an der genutzten **Terminzahl**, die aus derselben Spalte kommt und ebenso wenig zurückfällt.

**Anker.** `verordnungszustand()` in `src/features/treatment-bases/grundlagen.ts` — die eine Stelle, an der die Regel steht; Tests in `src/features/treatment-bases/PatientTreatmentBasesPage.test.tsx`.

**Änderungspfad.** Schwelle ändern (etwa „ausgeschöpft erst, wenn jeder Termin stattgefunden hat"): `verordnungszustand()` · Aufwand `klein`. Ablauf nach Zeit ergänzen: Feld `valid_until` an `prescriptions`, im Formular und in `create/update_prescription` gepflegt · Aufwand `mittel`, mit Migration. **Abnahme (Jannes, 2026-10-02):** bestätigt mit Präzisierung: ausgeschöpft bei genutzte ≥ mögliche **Behandlungstermine**; gebuchte Termine sind nur verplant; mehrere Heilmittel oder Doppelbehandlung erzeugen keine weiteren Termine; kein Ablauf nach Zeit. Die heutige Zählung aus der größten Positionsmenge zählt zu wenig — BEF-096. **Umgesetzt in ABN-001 (2026-10-02):** `used` zählt seitdem durchgeführte Termine, siehe ANN-210.

### ANN-043 — Auth-Links werden über den `token_hash` eingelöst, nicht über eine Sitzung in der Adresszeile

Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2); Providerprüfung OPS-001, Teil Auth-Mails

**Annahme.** Der Rückweg aus einer Auth-Mail läuft über den einmaligen `token_hash`: eigene Vorlagen (`recovery.html`, `magic_link.html`) übergeben `{{ .TokenHash }}` an eine Adresse dieser Anwendung, eingelöst wird mit `verifyOtp`, `detectSessionInUrl` bleibt `false`. Es gibt genau zwei öffentliche Seiten, `/kennwort-neu` und `/zugang`. Nach dem Setzen bleibt die Person nur auf diesem Gerät angemeldet; steht dort schon eine Sitzung, wird zuerst gefragt, und „Angemeldet bleiben" lässt den Link unverbraucht. Ein Verbindungsfehler gilt nicht als verbrauchter Link.

**Begründung.** Der Weg über `{{ .ConfirmationURL }}` verlangt `detectSessionInUrl: true`; dann stünde ein vollwertiges Zugriffs- und Erneuerungstoken im Adressfragment — im Verlauf und für jedes Skript lesbar. Ein `token_hash` ist einmalig, kurzlebig und für sich keine Sitzung (§16). Selbst zerlegte Fragmente mit `setSession` wären Eigenbau an der Sitzungsmechanik, den §3.4 ausschließt; PKCE verlangt den Prüfschlüssel im selben Browserprofil und bricht im häufigsten Praxisfall (angefordert am Praxisrechner, geöffnet am Telefon). Die beiden Seiten geben keine Auskunft über den Kontobestand, weil abgelaufener, benutzter und vorab geöffneter Link denselben Fehler liefern (§13).

**Anker.** `src/features/auth/linkEinloesen.ts` — `loeseLinkEin`, die Unterscheidung von `LinkUngueltigError` und `VerbindungError`, beide Pfadkonstanten und `istEinloesePfad` (die Liste steht dort und nicht im Gate, weil genau diese Trennung einmal schiefging); Vorlagen unter `supabase/templates/`, Einträge in `supabase/config.toml`. Seit Fassung 2 zusätzlich `einmalCodeAusAdresse` in `src/features/auth/linkEinloesen.ts` mit Test `src/features/auth/einmalCode.test.ts`.

**Änderungspfad.** Anderer Wortlaut in der Mail: die Vorlagen · Aufwand `klein`. Zurück auf `detectSessionInUrl: true`: eine Zeile in `src/lib/supabase.ts` und die Vorlagen auf `{{ .ConfirmationURL }}` · Aufwand `klein`, mit den Token im Verlauf als Folge. Auf PKCE wechseln · Aufwand `klein`, aber der geräteübergreifende Fall bricht — nicht empfohlen. Eigener Mailversand: eigenes Epic, neuer Dienstleister nach §3.5 und Rücknahme von B13 · Aufwand `groß`.

**Abnahme (Jannes, 2026-10-02).** Bestätigt mit drei Bedingungen, seit Fassung 2 umgesetzt: Der Code gilt eine Stunde (`otp_expiry = 3600` in `supabase/config.toml`, im Cloudprojekt dieselbe Zahl); er steht im Fragment (`#token_hash=…`) und erreicht damit keinen Webserver und kein Zugriffsprotokoll; die Seite liest ihn einmal und nimmt ihn sofort aus der Adresszeile. Die Anwendung protokolliert ihn nirgends.

### ANN-044 — „Alle Sitzungen beenden": Vermerk vorab, ohne den Vorgang aufzuhalten, und die Zusage nennt das Restfenster

Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2); `jwt_expiry` des Cloudprojekts mit OPS-001, Zielwert mit SEC-EPIC-001 (ADR-025) · **LOG-EPIC-001:** gilt weiter (`account.sessions_ended` bleibt im Katalog).

**Annahme.** Der Vermerk steht vor dem Vorgang „Alle Sitzungen beenden" und dokumentiert den Versuch. *(Fassung 2)* Scheitert er, werden die Sitzungen trotzdem beendet; der Fehlschlag steht im Betriebslog. *Fassung 1: „ist seine Vorbedingung: Scheitert er, unterbleibt das Abmelden."* Er hält die Auslösung fest, nicht die Wirkung. Die Zusage nennt das Restfenster: Sitzungen und Erneuerungstoken löscht der Anmeldedienst sofort, ein ausgestelltes Zugriffstoken bleibt bis `jwt_expiry` gültig; sofort wirkt allein die Sperre des Zugangs, weil die Datenbank bei jeder Anfrage `user_profiles.is_active` liest.

**Begründung.** Der Vermerk kann dem Vorgang nicht folgen, weil dieser dem Konto die eigene Sitzung nimmt und `log_account_security_event` `auth.uid()` verlangt — nachher melden hieße gar nicht melden, und ein Auditlog, dessen Einträge nicht zu den Tatsachen passen, ist nach ADR-010 wertlos. Das läuft ANN-041 Fassung 2 entgegen, und zwar bewusst: Dort ist der Ausgang nicht beobachtbar, hier ist er beobachtbar, aber nicht mehr aufschreibbar. Das gemeinsame Prinzip ist dasselbe — nichts festhalten, wofür man nicht einstehen kann.

**Anker.** `src/features/account/api.ts` — Dateikopf und `meldeVersuch`; der Text in `src/features/account/MeinKontoPage.tsx`, Abschnitt „Sitzungen"; Tests in `src/features/account/api.test.ts`.

**Änderungspfad.** Anderer Wortlaut: der Text in `MeinKontoPage` · Aufwand `klein`. Restfenster verkleinern: `jwt_expiry` in `config.toml` und im Cloudprojekt · Aufwand `klein`, mit häufigerem Erneuern als Folge. Vermerk serverseitig aus dem Vorgang erzeugen: Migration mit autonomer Transaktion · Aufwand `mittel`. Sofortiger Widerruf einzelner Token · Aufwand `groß`, zweite Berechtigungsschicht ohne Not.

**Abnahme (Jannes, 2026-10-02).** Geändert (Fassung 2): Ein Fehler beim Protokollieren verhindert das Beenden der Sitzungen nicht mehr; der Vorabeintrag dokumentiert den Versuch, ein Fehlschlag steht im Betriebslog (`meldeVersuch`). Das Restfenster ist `jwt_expiry`: im Repository 3600 Sekunden, und das ist auch der Standard des Anbieters. Den tatsächlichen Wert des Cloudprojekts kann diese Sitzung nicht lesen; er steht im Dashboard unter den JWT- bzw. Sitzungseinstellungen und wird mit OPS-001 abgelesen. Die 60 Minuten sind **kein** bestätigter Zielwert; den legt SEC-EPIC-001 fest (ADR-025).

### ANN-045 — Das gewöhnliche Abmelden endet nur die eigene Sitzung

Technik · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Jannes nach dem ersten Feldtag

**Annahme.** Das gewöhnliche Abmelden läuft mit `scope: 'local'`, ausdrücklich angegeben und nicht als Weglassung. Alle Geräte beendet ausschließlich der eigene Weg auf „Mein Konto".

**Begründung.** Wer am Praxisrechner Feierabend macht, meldet nicht sein Diensttelefon mit ab — er müsste sich beim nächsten Hausbesuch neu anmelden, unterwegs und womöglich im Funkloch; die weiter reichende Wirkung ist hier nicht die sicherere, sondern die überraschende. Zwei Wege mit unterschiedlicher Reichweite sind zudem nur verständlich, wenn sie sich unterscheiden. Die Angabe steht ausdrücklich im Code, weil der Default des Anmeldedienstes sich ändern kann und die Absicht aus einem Fehlen nicht zu lesen wäre.

**Anker.** `src/features/auth/SessionProvider.tsx` (`signOut`); Test in `src/features/auth/SessionProvider.test.tsx`.

**Änderungspfad.** Zurück auf global: die Angabe entfernen oder auf `'global'` setzen · Aufwand `klein`; dann ist der Text in `MeinKontoPage.tsx` mitzuändern und „Alle Sitzungen beenden" verliert seinen Zweck. Wahl beim Abmelden anbieten · Aufwand `klein`, aber eine Entscheidung mehr an einer Stelle, an der niemand eine treffen will.

**Abnahme (Jannes, 2026-10-02).** Bestätigt: Normales Abmelden beendet nur die aktuelle Sitzung; andere Geräte bleiben angemeldet.

### ANN-046 — Navigationsschutz: Data Router, drei Wege, und „Speichern" heißt Entwurf

Technik · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Jannes nach dem ersten Feldtag mit Dokumentation unterwegs

**Ablösung.** ersetzt ANN-015 im Textverlustschutz

**Annahme.** Vier Festlegungen: Der Router wird ein Data Router (`createBrowserRouter` mit einer Platzhalterroute), denn nur so gibt es `useBlocker`. Die Rückfrage bietet drei Wege — speichern und weitergehen, verwerfen und weitergehen, hier bleiben — im eingelassenen Kasten `Rueckfrage`, nicht als modaler Dialog. „Speichern" sichert den Entwurf, nie mehr; wo es keinen Entwurfszustand gibt (Korrektur eines finalisierten Eintrags), gibt es nur Verwerfen und Bleiben. Ein Fehlschlag navigiert nicht: Text und Seite bleiben stehen, die Rückfrage bleibt offen.

**Begründung.** Ein eigener Wachposten käme an das Zurück des Browsers nur über einen Eingriff in die Verlaufsliste heran — selbst gebaute Infrastruktur, wo die eingesetzte Bibliothek eine geprüfte anbietet (ADR-015, §3.4 sinngemäß); der gewählte Weg ändert die Routentabelle nicht und ist mit zwei Dateien zurückzunehmen. §19 und ADR-016 machen die Finalisierung zum ausdrücklichen Schritt mit Folgen — sie darf nicht Nebenwirkung eines Tastendrucks sein, der Entwurf ist die leichter umkehrbare Seite (§16). Ein Seitenwechsel nach fehlgeschlagenem Speichern wäre der stille Verlust, den §13 ausschließt.

**Anker.** `src/features/documentation/Textverlustschutz.tsx` (`useTextverlustschutz`); Router in `src/app/App.tsx`, Abmeldeschutz in `src/app/abmeldeschutz.ts` und `AbmeldeschutzProvider.tsx`; Tests in `Textverlustschutz.test.tsx` (29 Fälle) und `tests/e2e/authenticated/treatment-note-workflows.spec.ts`.

**Änderungspfad.** Zurück auf `<BrowserRouter>`: zwei Dateien, dann entfällt der Schutz für interne Navigation ersatzlos · Aufwand `klein`. Speichern auch für die Korrektur anbieten: ein Parameter mehr, aber eine fachliche Entscheidung gegen ADR-016 · Aufwand `klein`, Folge `groß`. Schutz auf weitere Formulare ausdehnen: je Formular ein Aufruf des Hooks · Aufwand `klein` je Stelle. **Abnahme (Jannes, 2026-10-02):** bestätigt.

### ANN-047 — Nur die Patientenabsage löst die Ausfallgebühr aus; „verlegt" und „sonstiger Grund" nicht

Praxisprozess · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Jannes in Probewoche 1; der Leistungskatalog (ABR-EPIC-001) übernimmt den Gebührenanlass unverändert

**Annahme.** Von den vier Absagegründen (ANN-034) löst genau einer die 24-Stunden-Regel aus: `patient_request`. `practice_request` ist ausdrücklich ausgenommen; `moved` („Termin verlegt") und `other` („Sonstiger Grund") lösen ebenfalls nicht aus — das ist die Lücke, die diese Annahme schließt.

**Begründung.** Für `moved` spricht der Wortsinn: Eine Verlegung ist das Ergebnis einer Absprache, und wer einen Ersatztermin bekommt, zahlt nicht für den ersten. `other` sagt über den Anlass per Definition nichts — daraus eine Forderung abzuleiten hieße, sie auf eine Nicht-Angabe zu stützen. Beides ist die leichter umkehrbare Seite (§16): Eine nicht entstandene Gebühr lässt sich nachtragen, solange der Vorgang steht (der Löschlauf wartet drei Jahre), eine zu Unrecht vorgemerkte Forderung ist erst aus der Welt, wenn jemand sie bemerkt.

**Anker.** `app.is_late_cancellation()` in `supabase/migrations/20260912200000_cancellation_notice.sql`; Tests in `supabase/tests/cancellation-notice.test.ts` (je ein Fall für alle drei ausgenommenen Gründe).

**Änderungspfad.** Weitere Gründe aufnehmen: eine Bedingung in `app.is_late_cancellation` · Aufwand `klein`. Beschriftung von `moved` schärfen: eine Zeile in `cancellationReasonLabels` · Aufwand `klein`. Rückwirkend gilt eine Änderung ausdrücklich nicht: Was ohne Gebührenanlass abgesagt wurde, bleibt ohne.

**Abnahme (Jannes, 2026-10-02).** Anders entschieden als bisher: Eine kurzfristige Verlegung durch die Patient:in fällt unter die 24-Stunden-Regel wie eine Absage; praxisveranlasste Änderungen bleiben gebührenfrei; ein bewusster, protokollierter Gebührenverzicht ist möglich; Nichtantreffen bleibt eigener Anlass nach ADR-018 — BEF-094, mit neuer Fassung von ADR-018 Punkt 8. **Umgesetzt (ABN-006, 2026-10-02).** Aus `moved` werden `patient_moved` („Patient:in hat verlegt“) und `practice_moved` („Praxis hat verlegt“); `app.is_late_cancellation` löst bei `patient_request` und `patient_moved` aus. `moved` bleibt an Bestandszeilen gültig und wird nicht umgedeutet, neu setzen kann ihn niemand mehr. Der Verzicht ist ANN-213, die Verlegung über eine Zeitänderung ANN-212. Anker jetzt in `supabase/migrations/20261002130000_abn_006_patient_moved_and_fee_waiver.sql`; ADR-018 Fassung 4 Punkt 8.

### ANN-048 — Der Eingang der Absage wird in Ortszeit erfasst, ohne Vorbelegung aus der Vergangenheit

Praxisprozess · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Jannes nach den ersten Wochen im Betrieb

**Annahme.** Die Absage-Rückfrage fragt „Wann ist die Absage eingegangen?" mit zwei Antworten — „Gerade eben" (vorbelegt) und „Früher – jetzt erst eingetragen", die erst Datum und Uhrzeit einblendet. Bei „Gerade eben" schickt die Anwendung kein Datum, die Datenbank setzt `now()`; eine falsch gehende Uhr im Browser entscheidet nie über eine Forderung. Datum und Uhrzeit werden in Ortszeit der Praxis erfasst, die Umrechnung macht der Server.

**Begründung.** Der Regelfall ist das laufende Telefonat — dafür darf niemand ein Datum tippen; der Ausnahmefall ist der Anrufbeantworter von gestern Abend, an dem eine Forderung hängt. Ein einzelnes vorbelegtes Feld hätte beides vermischt: Wer die Vorbelegung stehen lässt, hätte eine Angabe gemacht, ohne sie zu treffen. Ein Zeitstempel aus dem Browser verlangte, dass die Oberfläche eine Wanduhrzeit umrechnet — eine Rechnung, die sie sonst nirgends macht und die auf einem Gerät in anderer Zeitzone still falsch wäre.

**Anker.** `AbsageAktion` in `src/features/appointments/AppointmentDetailPage.tsx` und der Parameterblock von `public.cancel_appointment` in `supabase/migrations/20260912200000_cancellation_notice.sql`; Tests in `AppointmentDetailPage.test.tsx` und `supabase/tests/cancellation-notice.test.ts`.

**Änderungspfad.** Vorbelegung entfernen und eine Antwort verlangen: ein Anfangswert und eine Prüfung · Aufwand `klein`. Den Eingang zur Pflichtangabe für jede Absage machen · Aufwand `klein`, aber dann trägt jede Absage am Telefon einen Tap mehr. **Abnahme (Jannes, 2026-10-02):** bestätigt.

### ANN-049 — Ereignisse stehen in derselben Tabelle wie Behandlungstermine

Technik · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: keine — die Abgrenzung hält in der Leistungserfassung, ein Ereignis erzeugt keine Leistung (ANN-072)

**Ablösung.** abgelöst durch ANN-051 in der Frage der gemeinsamen Kennung

**Annahme.** Ein Ereignis des Praxisbetriebs ist eine Zeile in `public.appointments` mit `kind = 'event'`, ohne `patient_id`, ohne `prescription_id`, mit `title` — kein eigenes Datenmodell und keine eigene Tabelle.

**Begründung.** Ein Ereignis belegt denselben Kalender und denselben Zeitraum wie eine Behandlung; die `EXCLUDE`-Constraint gegen Doppelbuchungen wirkt nur innerhalb einer Tabelle, eine zweite hätte die Belegungsprüfung in Anwendungscode verlagert und damit genau den Schutz aufgegeben, der hier zählt — nebenbei hätte jede Kalenderabfrage zwei Quellen zusammenführen müssen. Der Preis ist die Fallunterscheidung in den Schreibpfaden; vier Constraints halten sie zusammen, eine Behandlung ohne Patient:in und ein Ereignis mit Patient:in sind schemaseitig unmöglich.

**Anker.** `supabase/migrations/20260912210000_appointment_events.sql` — Kopfkommentar und Constraints; Tests in `supabase/tests/appointment-events.test.ts` (26 Fälle).

**Änderungspfad.** Eigene Tabelle: Migration mit Datenübernahme, neue Belegungsprüfung über beide Tabellen, jede Kalenderabfrage anfassen · Aufwand `groß`. **Abnahme (Jannes, 2026-10-02):** bestätigt.

### ANN-050 — Der Kalender trägt Patient:in und Verordnung als Kontext mit

Praxisprozess · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Jannes nach den ersten Wochen im Betrieb

**Annahme.** Der Kalenderstand führt neben `patient` einen zweiten Kontextparameter `verordnung`; beide stehen als Kennung in der Adresse, nie als Name und nie als Diagnose (ADR-011). Ist der Kalender auf eine Patient:in gefiltert, führt ein Tap auf eine freie Stelle direkt in deren Terminformular — mit Verordnung, wenn eine mitgereist ist — statt über die Patientensuche; der Rückweg ist der Kalenderstand.

**Begründung.** Der Weg „Akte → Verordnung → Kalender → freie Stelle" ist genau dann etwas wert, wenn am Ende nicht noch einmal gesucht werden muss; ein Formular, das nach der eben ausgewählten Person fragt, ist eine Rückfrage ohne Erkenntnis. Der Filter grenzt weiterhin nur die Darstellung ein, nicht den Lesepfad (AKTE-003): Der Kalender liest den Ausschnitt ohnehin vollständig, sichtbar ist, was die RLS liefert.

**Anker.** `KalenderParameter.verordnung` in `src/features/appointments/calendar.ts` und `freieZeit` in `src/features/appointments/CalendarPage.tsx`; Tests in `CalendarPage.test.tsx` und `calendar.test.ts`.

**Änderungspfad.** Kontextweg herausnehmen: zwei Stellen · Aufwand `klein`. Patientenfilter beim Planen nur hervorheben statt ausblenden: eine Änderung in der Darstellung des Gitters · Aufwand `klein` bis `mittel`. **Abnahme (Jannes, 2026-10-02):** bestätigt.

### ANN-051 — Ein Teamereignis ist ein Vorgang; die einzelne Teilnahme bleibt davon getrennt

Praxisprozess · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Jannes, nach der ersten Woche mit Teambesprechungen im Kalender

**Ablösung.** ersetzt ANN-049 in der Frage der gemeinsamen Kennung

**Annahme.** Die Zeilen eines Ereignisses tragen eine gemeinsame Gruppenkennung (`event_group_id`) und sind damit ein Vorgang, nicht n Termine. Bezeichnung, Tag, Zeit, Länge, Art und Ort gehören dem Ereignis und werden für alle Beteiligten zugleich geändert — in einer Transaktion, mit Konfliktprüfung je Person vor dem ersten Schreibzugriff; dasselbe gilt für die Absage. Wer teilnimmt, gehört der einzelnen Zeile („Teilnahme ändern", „Nur diese Teilnahme absagen"). Bestandszeilen werden nicht zusammengeführt.

**Begründung.** Eine Besprechung, die bei einer Person um 9 und bei einer anderen um 10 steht, hat niemand gemeint — sie entsteht aber zwangsläufig, wenn das Verschieben je Kalender einzeln geschieht und irgendwo unterbricht; die Belegungsprüfung bleibt richtigerweise an der einzelnen Zeile, ergänzt wird nur die Klammer darüber. Absage für sich und Absage für alle sehen ähnlich aus und bedeuten Verschiedenes, deshalb zwei Schaltflächen mit zwei Namen. Eine Heuristik über Titel und Uhrzeit würde zwei getrennte Vorgänge stillschweigend verheiraten — eine nachträgliche Umdeutung vorhandener Daten (§13).

**Anker.** `supabase/migrations/20260913100000_event_groups.sql`: `event_group_id`, `update_appointment_event`, `cancel_appointment_event`, `list_event_participants` und der Trigger `appointments_event_group_guard`; `updateAppointmentEvent` in `src/features/appointments/api.ts`; Oberfläche in `EditEventPage.tsx` und `AppointmentDetailPage.tsx`.

**Änderungspfad.** Beteiligte nachträglich hinzufügen: Personenliste im Formular und ein Einfügezweig in `update_appointment_event` · Aufwand `mittel`. Trennung zwischen Ereignis und Teilnahme aufgeben: der Trigger bleibt, `update_appointment` verlöre seinen Ereigniszweig · Aufwand `klein`, Folge `mittel` (Personentausch nur noch über Absage und Neueintrag). **Abnahme (Jannes, 2026-10-02):** bestätigt.

### ANN-052 — Eine Datei verlässt den Speicher nur über einen auditierten Vorgang

Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2); erneut, sobald OPS-001 Punkt 5 beantwortet ist (Entzug eines Verweises vor Ablauf); vor jeder UPDATE-Policy auf `storage.objects`; bei jedem Upgrade der Storage-API — Supabase aktualisiert sie im Betrieb ohne Zutun, deshalb läuft `patient-file-access.spec.ts` vor der ersten echten Datei regelmäßig gegen Staging (ROADMAP, OPS-001) · **LOG-EPIC-001:** geändert – protokolliert wird nur das Herunterladen (`patient_file.downloaded`), nicht das Anzeigen.

**Annahme.** Jede Storage-Operation an einer Datei der Akte braucht eine **einmalige Freigabe** der anfragenden Person. `issue_patient_file_link` protokolliert `patient_file.link_issued` und legt sie für genau diese Datei an; `claim_storage_deletion_order` protokolliert `storage_deletion.claimed` und legt sie für das Objekt genau dieses Löschauftrags an; diese Löschfreigabe gilt nur für die Entfernen-Operation, die die Storage-API in `storage.operation` meldet. Die RLS auf `storage.objects` lässt eine Zeile nur gegen eine passende Freigabe zu, die höchstens 30 Sekunden alt ist, und verbraucht sie dabei. Ein so signierter Verweis gilt danach unverändert 60 Sekunden (ADR-017 Punkt 15).

**Begründung.** Ein signierter Verweis entsteht im Browser; eine serverseitige Zwischenstelle gibt es nicht, weil eine Edge Function für produktive Gesundheitsdaten nach ADR-015 Punkt 20 nicht freigegeben ist. Die erste Fassung verließ sich darauf, dass nur `issue_patient_file_link` den Objektschlüssel herausgibt. Der Schlüssel ist aber für jede lesende Rolle ableitbar und nach einem Öffnen ohnehin bekannt (BEF-004); ein versteckter Zufallsanteil hätte daran nichts geändert. Die RLS ist die einzige Stelle, die die Storage-API vor Signieren, Laden, Auflisten, Kopieren und Löschen fragt. Die Storage-API 1.72 prüft Signieren, Laden, Kopieren und Entfernen mit der Rolle der anfragenden Person gegen diese RLS, meldet dabei die Operation in `storage.operation` und liest einen bereits signierten Verweis als Superuser — belegt am Code der API und gegen die laufende API im E2E-Test. Grenzen: Eine Auflistung prüft jede Zeile des Buckets und verbraucht dabei offene Freigaben der anfragenden Person, nie fremde; Verschieben prüft die Quelle in einer zurückgerollten Transaktion und scheitert nur, weil es keine UPDATE-Policy gibt; eine verfallene, nicht genutzte Freigabe liegt bis zur nächsten Ausstellung in der Organisation. Unsicher: ob eine spätere Version der Storage-API anders abfragt und ob 30 Sekunden für eine langsame Verbindung reichen.

**Anker.** `app.patient_file_access_grant_ttl()`, `app.may_read_patient_file_object`, `app.may_read_storage_object_for_deletion`, `issue_patient_file_link` und `claim_storage_deletion_order` in `supabase/migrations/20260915120000_patient_file_access_grants.sql`; `oeffneDatei` in `src/features/files/api.ts`; Tests in `supabase/tests/patient-file-access.test.ts` und `tests/e2e/authenticated/patient-file-access.spec.ts`.

**Änderungspfad.** Andere Wartezeit: `app.patient_file_access_grant_ttl()` · Aufwand `klein`. Fällt OPS-001 Punkt 5 positiv aus (Entzug eines Verweises ohne Support), kommt ein Werkzeug hinzu · Aufwand `klein`. Wird die Edge Runtime freigegeben, kann die Ausstellung serverseitig unterschreiben, und die Freigabetabelle entfällt · Aufwand `mittel`. **Abnahme (Jannes, 2026-10-02):** bestätigt.

### ANN-053 — Die Bestätigung prüft Größe und MIME-Typ gegen den Objektspeicher; die Prüfsumme bleibt eine Erklärung des Browsers

Technik · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: mit Weg 3 des Rechnungs-PDF nach OPS-001 (B14, ADR-009 Punkt 9) und mit dem Restore-Test aus ADR-012 Punkt 6

**Annahme.** Größe und MIME-Typ werden serverseitig gegen `storage.objects.metadata` geprüft, das die Storage-API beim Upload selbst schreibt; weichen sie von der Ankündigung aus Phase (a) ab, bleibt die Datei `pending` und wird nicht sichtbar. Die SHA-256-Prüfsumme wird nicht nachgerechnet: Sie entsteht vor dem Hochladen im Browser, wird in Phase (a) mitgegeben und unverändert festgehalten.

**Begründung.** Die **Größe** in `metadata` misst die Storage-API an den empfangenen Bytes und ist damit eine echte zweite Quelle — der Grund, warum es Phase (c) gibt. Für den **MIME-Typ gilt das nicht** (R3-014): Dort übernimmt die API unverändert den `contentType` desselben Uploads, und den leitet der Browser aus der Dateiendung ab; Phase (c) vergleicht insoweit zwei Angaben derselben Quelle. Deshalb prüft der Browser seit R3-014 vor Phase (a) zusätzlich die ersten Bytes gegen das angekündigte Format — keine Virenprüfung und keine Hürde für jemanden, der den Browser selbst steuert, aber eine umbenannte Fremddatei fällt damit auf. Die Datenbank sieht die Bytes nie und könnte die Summe nur nachrechnen, wenn sie die Datei lädt; den HTTP-Zugang dafür zu schaffen (`pg_net`, Edge Function) wäre eine neue wesentliche Abhängigkeit und ein Stopp nach §15.1. Die Summe ist deshalb eine festgehaltene Erklärung — aus derselben Sitzung wie der Upload, über den Auditeintrag einer Person und einem Zeitpunkt zugeordnet; wer auf einem Praxisgerät Bytes fälschen wollte, könnte auch eine falsche Datei hochladen (ADR-017 Punkt 8 und 20).

**Anker.** `supabase/migrations/20260913110000_patient_files.sql`: `confirm_patient_file_upload` (Vergleich gegen `storage.objects.metadata`) und der Kommentar an `patient_files.checksum_sha256`; `pruefsumme` in `src/features/files/api.ts` und `dateiInhaltAblehnungsgrund` in `src/features/files/dokumentarten.ts`; Tests in `supabase/tests/patient-files.test.ts`, Abschnitt „Phase (c): bestaetigen".

**Änderungspfad.** Prüfsumme serverseitig nachrechnen: braucht einen Vorgang, der die Datei liest — freigegebene Edge Runtime oder ein Betriebswerkzeug, das den Abgleich aus DAT-003 erweitert · Aufwand `mittel`, zusätzlich eine Providerentscheidung, wenn er außer Haus läuft. Prüfsumme ganz weglassen · Aufwand `klein`, aber ADR-017 Punkt 9 und ADR-009 Punkt 9 verlören ihren einzigen technischen Anker — nicht empfohlen. **Abnahme (Jannes, 2026-10-02):** geändert: Der Dateityp wird serverseitig am Inhalt geprüft; Speicher-MIME und Browser-Prüfsumme sind keine unabhängigen Nachweise, die Prüfsumme gilt als „nicht serverseitig verifiziert“ (BEF-105). **Fassung 2 (ABN-024/025, 2026-10-02, BEF-105, ADR-017 Abschnitt I):** Typ an der Signatur, SHA-256 und Metadaten prüft der Server am Inhalt — die Edge Function `patient-file-verify`, gebaut, scharf mit OPS-001. Ergebnis an der Zeile (`verified_at`, je Prüfung ein Feld); ohne Ergebnis steht an der Datei „nicht serverseitig geprüft“. Der Schalter `app.patient_file_verification_required()` steht auf `false`: Bis OPS-001 wird eine Datei mit der Bestätigung `ready`; scharf bleibt sie `pending`, bis das Ergebnis vorliegt. Ein Befund verwirft (Zeile weg, Löschauftrag, `patient_file.verification_failed`). Anker: `supabase/migrations/20261004101000_abn_024_patient_file_verification.sql`. Scharfschalten: eine Migration, die den Schalter auf `true` setzt, Go-live-Vorbedingung.

### ANN-054 — Der Dependency-Audit blockiert den Merge ab Schweregrad `high`

Technik · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: mit OPS-002 (Betriebsaufnahme, Roadmap G5)

**Annahme.** `pnpm audit --audit-level=high` im Job „Secret Scanning und Dependency Audit" lässt `low` und `moderate` durch und macht den Lauf ab `high` rot. Gemeldet werden alle Schweregrade in der Jobausgabe; blockierend sind nur `high` und `critical`.

**Begründung.** ADR-013 nennt den Dependency-Scan als Pflichtprüfung, legt die Schwelle aber nicht fest; die Folgefrage steht in `OPEN_DECISIONS.md` (Spur F). `high` ist die Schwelle, ab der eine Meldung in der Regel einen praktisch erreichbaren Pfad beschreibt — darunter überwiegen bei einer reinen Browseranwendung ohne Serverlauf transitive Befunde in Werkzeugketten, die ein Gate nur abstumpfen würden (§16: ein Gate, das oft grundlos rot ist, wird umgangen). Die Einschätzung ist vorläufig und gehört mit der Betriebsaufnahme auf den Prüfstand.

**Anker.** `.github/workflows/ci.yml`: der Schritt „Dependency Audit" mit dem Kommentar `ANN-054` über `--audit-level=high`.

**Änderungspfad.** Schwelle senken (`moderate`) oder anheben: ein Wort in `ci.yml` · Aufwand `klein`. Wird zusätzlich eine Ausnahmeliste nötig, kommt sie als `pnpm.auditConfig.ignoreCves` in `package.json` dazu, mit je einer Begründung · Aufwand `klein`.

**Abnahme (Jannes, 2026-10-02).** Bestätigt. Niedrigere Schweregrade bleiben in der Jobausgabe sichtbar und werden bearbeitet, wenn sie ein konkret relevantes Risiko tragen.

### ANN-055 — Protokoll und Ausfallgebühr des Nichtantreffens gelten am Hausbesuch

Praxisprozess · entschieden (Jannes) · 2026-09-16, bestätigt 2026-09-17 · Jannes · erledigt · Wiedervorlage: falls die Praxis je Räume bezieht; die Abrechnung nimmt den Anlass unverändert als Quelle der Ausfallleistung (ANN-072)

**Annahme.** Die drei Szenarien aus E14 gelten am **Hausbesuchstermin**: Dort verlangt `record_no_show` das bestätigte Protokoll und setzt daraufhin den Gebührenanlass, und dort nimmt `complete_treatment` den Pflichtvermerk „Tür geöffnet, keine Behandlung" an. An einem Praxis- oder Videotermin bleibt das Nichtantreffen der Vermerk ohne Gebühr aus CAL-014c; ein bestätigtes Protokoll und ein Pflichtvermerk werden dort abgewiesen.

**Begründung.** E14 und `PROJECT_PRINCIPLES.md` 0.10 §8 regeln ausdrücklich den Hausbesuch — die Gebühr hängt an der Anfahrt, und die drei Protokollschritte („15 Minuten gewartet, geklingelt, angerufen") beschreiben eine Haustür. An der Praxistür gibt es nichts zu klingeln; eine Bestätigung, die niemand wahrheitsgemäß geben kann, wäre die Grundlage einer Forderung gegen eine Patientin. Für das Nichtantreffen in der Praxis gibt es keine Festlegung, und eine zu Unrecht vorgemerkte Forderung ist teurer zurückzunehmen als eine nachzutragende (§16). **Bestätigt am 2026-09-17:** Jannes hat festgelegt, dass die Praxis **ausschließlich Hausbesuche** durchführt und keine Räume hat. Damit ist die Lücke nicht mehr nur vorläufig geschlossen, sondern gegenstandslos: Den Fall „Nichtantreffen in der Praxis" gibt es nicht. Die Artprüfung im Schreibpfad bleibt trotzdem stehen — sie kostet nichts und hält die Regel an den Fall gebunden, den E14 beschreibt (ADR-004, Defense-in-Depth). Was diese Festlegung darüber hinaus für die Terminart `practice`, für Standorte und das Praxisraster bedeutet, ist **nicht** Gegenstand dieser Annahme und offen.

**Anker.** Die Artprüfung in `public.record_no_show` und in `public.complete_treatment` in `supabase/migrations/20260916100000_home_visit_scenarios.sql`; `istHausbesuch` in `src/features/appointments/AppointmentDetailPage.tsx`; Tests in `supabase/tests/home-visit-scenarios.test.ts`.

**Änderungspfad.** Regel auf alle Behandlungstermine ausdehnen: die Artprüfung in beiden Funktionen fällt weg, die Protokolltexte werden neutral formuliert, der geführte Ablauf gilt für jeden Termin · Aufwand `klein`. Eigene Regel je Terminart (etwa Gebühr ohne Protokoll in der Praxis): eine Verzweigung mehr an derselben Stelle · Aufwand `klein`.

### ANN-056 — Die freie Terminlänge liegt im Praxisraster und wird nur geprüft, wenn sie sich ändert

Praxisprozess · entschieden (Jannes) · 2026-09-17, bestätigt 2026-09-18 · Jannes · erledigt · Wiedervorlage: nur mit E12 Punkt 2 (Länge je Praxis einstellbar)

**Ablösung.** ersetzt ANN-037 in der Frage, wogegen die Länge geprüft wird

**Annahme.** Ein Behandlungstermin darf jede Länge haben, die ein ganzes Vielfaches des Praxisrasters ist, mindestens einen Rasterschritt; `create_appointment` prüft das immer, `update_appointment` nur, wenn sich die Länge ändert. Ein Termin mit einer Länge außerhalb des Rasters (Altbestand, späterer Rasterwechsel) bleibt gültig, organisatorisch änderbar und verschiebbar. Gekennzeichnet wird in der Anzeige, was weder 45 noch 60 Minuten dauert — gerechnet aus Beginn und Ende, ohne gespeichertes Merkmal.

**Begründung.** `PROJECT_PRINCIPLES.md` 0.11 §8.1 nennt als Schranke „mindestens einen Rasterschritt" und hält zugleich fest, dass das Raster serverseitig durchgesetzt bleibt. „Vielfaches des Rasters" ist die Lesart, bei der mit dem Beginn auch das Ende auf einem Rasterpunkt liegt — dieselbe Regel, die für Ereignisse schon gilt (CAL-015b), und die Voraussetzung dafür, dass CAL-019 eine aufgezogene Spanne ohne Sonderfall übernimmt. 45 und 60 Minuten passen in jedes zulässige Raster (5, 10, 15). Der Bestandsschutz stammt unverändert aus ANN-037 und §8.1 („DARF NICHT an der Länge scheitern"). Das Kennzeichen wird gerechnet statt gespeichert, weil es vollständig aus zwei vorhandenen Werten folgt und so nie von ihnen abweichen kann (ADR-014). **Bestätigt am 2026-09-18:** Jannes hat festgelegt, dass die Praxis ausschließlich in 5-Minuten-Schritten terminiert; eine Zeit, die nicht auf einem Rasterpunkt beginnt, gibt es nicht.

**Anker.** `app.is_valid_treatment_length` und die beiden Längenprüfungen in `supabase/migrations/20260917110000_free_appointment_length.sql`; `abweichendeLaengeMinuten` in `src/features/appointments/api.ts`, `Laengenzeichen.tsx`; Tests in `supabase/tests/appointment-window.test.ts` und `src/features/appointments/Laengenzeichen.test.tsx`.

**Änderungspfad.** Länge ganz vom Raster lösen: `app.is_valid_treatment_length` auf „größer null" reduzieren und die Schrittweite des Minutenfelds entfernen · Aufwand `klein`, ohne Datenumzug. Kennzeichen an anderen Regellängen ausrichten: `app.appointment_window_options()` und `TERMINFENSTER_OPTIONEN` gemeinsam ändern (ein Datenbanktest hält sie gegeneinander) · Aufwand `klein`.

### ANN-057 — Die Vergangenheit ist erlaubt, aber nie unbemerkt: Bestätigung und Auditkennzeichen

Praxisprozess · entschieden (Jannes) · 2026-09-18 · Jannes · erledigt · Wiedervorlage: ABR-EPIC-001 behandelt nachgetragene Termine wie alle anderen; Datenschutzprüfung nur, falls `in_the_past` je als Merkmal am Termin gespeichert würde · **LOG-EPIC-001:** gegenstandslos – einen nachgetragenen Termin zeigen `created_at` und `starts_at`.

**Annahme.** `create_appointment` und `update_appointment` nehmen einen Tag vor dem heutigen Praxistag nur mit `p_confirmed_past = true` an; ohne Bestätigung bleibt die Abweisung aus CAL-003. Es gibt keine Grenze nach hinten und keinen Begründungstext; der Auditeintrag trägt `in_the_past`. Die Oberfläche fragt vor dem Server, wenn sie den Tag kennt (Formular, Kalender), und nimmt den Hinweis in denselben Kasten wie den Arbeitszeit-Hinweis. Eine Ausnahme: Ein Bestandstermin, dessen Tag schon vergangen ist, lässt sich organisatorisch ändern (Person, Art, Ort, Uhrzeit am selben Tag), ohne dass gefragt wird — die Bestätigung gilt dann dem Tag, der schon war, und der Auditeintrag trägt `in_the_past` trotzdem.

**Begründung.** Festlegung von Jannes (BEF-012): Nachtragen und Zurücklegen gehören zum Praxisalltag. Keine Leitplanke verlangt eine Sperre; das Muster „bestätigen statt sperren" gibt es schon für die Arbeitszeit (CAL-005). Ein Kennzeichen im Auditkontext statt eines Merkmals am Termin, weil es eine Aussage über den Vorgang ist, nicht über den Termin (ADR-010); eine Grenze nach hinten wäre eine erfundene Frist (§13). Unsicher: ob die Abrechnung nachgetragene Termine je unterscheiden muss.

**Anker.** `p_confirmed_past` und `in_the_past` in `supabase/migrations/20260918100000_past_appointments_confirmed.sql`; `VergangenheitError`, `liegtInVergangenheit` in `src/features/appointments/api.ts`; Tests in `supabase/tests/create-appointment.test.ts`, `supabase/tests/change-appointment.test.ts`.

**Änderungspfad.** Grenze nach hinten (etwa 90 Tage): eine Bedingung in beiden Funktionen und ein Satz in der Rückfrage · Aufwand `klein`. Begründung verlangen: ein Textparameter mit Auditvermerk nach dem Muster der Absage · Aufwand `klein` bis `mittel`. Zurück zur Sperre: `p_confirmed_past` ignorieren · Aufwand `klein`.

### ANN-058 — Rückfragen, die nicht am Auslöser stehen können, sind ein Fenster über dem Inhalt

Technik · entschieden (Jannes) · 2026-09-18 · Jannes · erledigt · Wiedervorlage: Jannes, sobald er das Muster eine Weile bedient hat; Barrierefreiheitsprüfung mit UI-002

**Annahme.** Eine Rückfrage oder ein Fehler, der nicht unmittelbar neben dem auslösenden Element stehen kann — nach dem Absenden eines langen Formulars, bei einem Vorgang ohne sichtbaren Auslöser —, erscheint als modales Fenster (`Dialogfenster`: `role="dialog"`, Fokus hinein und im Kreis, Escape und Klick daneben sind Abbrechen, Fokus zurück). Eine Rückfrage, die den Auslöser an Ort und Stelle ersetzt (`Rueckfrage`), bleibt ein Kasten im Fluss; die Zieh-Rückfrage im Kalender bleibt im Gitter, weil dort der Kalender sichtbar sein muss.

**Begründung.** UI-000 hatte „kein modaler Dialog" als Regel; BEF-016 zeigt die Grenze: Ein Hinweis außerhalb des Sichtfelds ist keiner. Die Festlegung von Jannes gilt „immer" für solche Warnungen; die Grenze ist der Ort, nicht die Art der Frage. Ohne Paket, weil `<dialog>` in jsdom kein `showModal` kennt und der Fokuskreis klein ist (ADR-015).

**Anker.** `src/components/ui/Dialogfenster.tsx` (`Dialogfenster`, `Hinweisfenster`), `ArbeitszeitRueckfrage` in `src/features/appointments/AppointmentFormFields.tsx`, Kommentar in `src/components/ui/Rueckfrage.tsx`; Tests in `src/components/ui/Dialogfenster.test.tsx`.

**Änderungspfad.** Alle Rückfragen modal: `Rueckfrage` auf `Dialogfenster` umstellen · Aufwand `mittel` (acht Aufrufer, Tests mit `role="group"`). Zurück zum Kasten im Fluss: `Dialogfenster` durch einen Kasten mit Bildlauf zum Element ersetzen · Aufwand `klein`.

### ANN-059 — Serie und Vorkommen sind zwei Kennungen; serienweite Vorgänge wirken nach vorn

Technik · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Jannes, sobald er eine Dauerfehlzeit eine Weile geführt hat — insbesondere, ob „die ganze Serie" ohne die vergangenen Vorkommen das Erwartete tut

**Annahme.** Eine Dauerfehlzeit bekommt mit `appointments.event_series_id` eine **zweite** Kennung neben der Gruppenkennung aus CAL-017: Die Gruppe ist ein Vorkommen mit allen Beteiligten, die Serie sind alle Vorkommen. Serienweite Änderung und Absage wirken ausschließlich auf die **noch nicht begonnenen** Vorkommen; begonnene und bereits abgesagte bleiben unberührt und werden übersprungen. Die Tage einer Serie ändert kein serienweiter Vorgang — wer sie verschieben will, sagt die Serie ab und legt eine neue an.

**Begründung.** CAL-EPIC-004 überlässt dem SPEC die Wahl, ob eine Kennung beides trägt. Sie kann es nicht: „dieses Vorkommen" ist genau die Gruppe, und eine doppelt belegte Spalte machte jede Änderung an einer Woche zu einer Änderung an allen. Der Schnitt nach vorn folgt `PROJECT_PRINCIPLES.md` §13: Ein Teammeeting, das letzte Woche stattgefunden hat, nachträglich als abgesagt zu führen, wäre eine Aussage über die Vergangenheit, die niemand getroffen hat; dieselbe Grenze zieht `update_appointment_event` schon für den Tag (CAL-003). Die Serie bleibt dabei Erzeugungsregel und kein Zustandsträger (ADR-018 Punkt 5): keine Tabelle, kein Serienstatus. Unsicher: ob die Praxis eine Serie je um Tage verschieben will statt sie neu zu legen.

**Anker.** `event_series_id`, `create_event_series`, `update_event_series`, `cancel_event_series` in `supabase/migrations/20260918110000_event_series.sql`; `createEventSeries`, `updateEventSeries`, `cancelEventSeries` in `src/features/appointments/api.ts`.

**Änderungspfad.** Serienweite Vorgänge auch auf begonnene Vorkommen: die `having`-Bedingung in beiden Funktionen streichen · Aufwand `klein`. Serie um Tage verschieben: ein weiterer Parameter und eine Neuberechnung der Tage in `update_event_series` · Aufwand `mittel`. Zurück zu einer Kennung: nicht ohne Verlust von „dieses Vorkommen" · Aufwand `groß`. **Abnahme (Jannes, 2026-10-02):** bestätigt.

### ANN-060 — Die Bezeichnung einer Fehlzeit ist organisatorisch, und geprüft wird das am Feld

Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung / DSFA-Prozess vor Produktivstart

**Annahme.** Die frei benannte Bezeichnung einer Fehlzeit (CAL-021) ist eine **organisatorische** Angabe: kein Patientenname, keine Diagnose, kein klinischer Inhalt. Durchgesetzt wird das an drei Stellen und ausdrücklich **nicht** durch eine inhaltliche Prüfung des Freitexts: der Hinweis am Eingabefeld sagt die Regel, die Länge ist auf 120 Zeichen begrenzt, und der Titel erscheint weder im Auditkontext noch in einem Log noch in der Adresszeile. Er steht allein an der Zeile und als Aufschrift im Gitter.

**Begründung.** Der Kalender ist für das ganze Team sichtbar; eine Fehlzeit mit Patientenbezug wäre eine Offenbarung ohne Anlass (`PROJECT_PRINCIPLES.md` §4.6, ADR-011 für die Logs). Eine automatische Inhaltsprüfung wäre die schlechtere Antwort: Sie müsste Patientennamen gegen den Bestand prüfen, dabei genau die Daten anfassen, die sie schützen soll, und ergäbe trotzdem falsche Treffer („Frau Meier" ist auch eine Kollegin). Deshalb die Regel am Feld, wo sie gelesen wird, plus die technische Zusicherung, dass der Text die Anwendung nicht verlässt. Unsicher: ob die Datenschutzprüfung eine Protokollierung der Bezeichnung bei Änderungen verlangt.

**Anker.** Hinweis und Längengrenze am Feld `Bezeichnung` in `src/features/appointments/EreignisFormFields.tsx`; der Auditkontext ohne Titel in `supabase/migrations/20260913100000_event_groups.sql` (`create_appointment_event`, `update_appointment_event`).

**Änderungspfad.** Bezeichnung aus einer Liste statt Freitext: ein Wertebereich in der Datenbank und eine Auswahl im Formular · Aufwand `mittel`. Prüfung gegen den Patientenbestand: eine Abfrage im Schreibpfad · Aufwand `mittel` — widerspräche der Begründung. Titel im Auditkontext: ein Feld in `jsonb_build_object` · Aufwand `klein`, aber eine neue Datenschutzentscheidung. **Abnahme (Jannes, 2026-10-02):** bestätigt.

### ANN-061 — Die Kopfleistensuche findet Funktionen und Namen, keine klinischen Inhalte

Datenschutz · entschieden (Jannes) · 2026-09-18 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung / DSFA-Prozess vor Produktivstart; Jannes, sobald er die Leiste eine Weile bedient hat

**Annahme.** Die dauerhaft sichtbare Suchleiste findet zweierlei und nichts sonst: **Funktionen** (Bereiche, Seiten, Vorgänge — im Browser, aus der Navigation abgeleitet) und **Namen** von Patient:innen (serverseitig über `search_patients`, ab drei Zeichen, Obergrenze in der Datenbank). **Klinische Inhalte sind ausgeschlossen** — keine Diagnose, kein Verordnungsinhalt, keine Dokumentation, auch nicht als Stichwort eines Funktionstreffers. Die beiden Gruppen stehen in fester Reihenfolge, Funktionen zuerst; gemischt wird nicht. Die Rollenprüfung der Funktionsgruppe ist Relevanz, keine Zugriffskontrolle (§4.7).

**Begründung.** E17 Fassung 1 hätte die Namen aus der Leiste genommen; Jannes hat am 2026-09-18 entschieden, sie daneben zu behalten — der Weg aus einem Termin in eine Akte ist der häufigste im Haus, und ein Schritt mehr trifft ihn jedes Mal. Damit bleibt der Stand von UX-004: Ein Name steht nur so lange auf dem Bildschirm, wie jemand tippt, und nie in der Adresszeile (ADR-011). Eine Suche über klinische Inhalte wäre etwas anderes und keine Erweiterung: Sie bräuchte eine eigene Datenbankfunktion samt Policy, eine Entscheidung darüber, was ein Suchtreffer im Auditlog ist (ADR-004 Punkt 6, ADR-010), und sie stellte Diagnosen in eine Vorschlagsliste, die auf jedem Bildschirm des Teams aufgeht — deshalb ausdrücklich nicht hier. Die feste Reihenfolge ist kein Geschmack: Die Namen treffen eine Anfrage später ein, und eine nach Güte gemischte Liste verschöbe die Auswahl unter den Pfeiltasten genau dann, wenn die Antwort kommt. Unsicher: ob die Datenschutzprüfung Namen in einer auf jedem Bildschirm sichtbaren Leiste beanstandet.

**Anker.** `funktionskatalog` und `vorgaenge` in `src/app/funktionen.ts` (was gefunden wird), `Funktionssuche` in `src/app/Funktionssuche.tsx` (die beiden Gruppen und ihre Reihenfolge); Tests in `src/app/funktionen.test.ts` und `src/app/Funktionssuche.test.tsx`.

**Änderungspfad.** Namen wieder aus der Leiste (E17 Fassung 1): die Namensgruppe in `Funktionssuche` streichen, der Treffer „Patient:in suchen" bleibt · Aufwand `klein`. Weitere Trefferart (Verordnung, Termin): eine serverseitige Suchfunktion mit Policy, eine dritte Gruppe, eine Auditentscheidung · Aufwand `mittel` bis `groß` — und eine neue Datenschutzentscheidung. Gemischte statt fester Reihenfolge: eine gemeinsame Sortierung in `Funktionssuche`, dazu ein Weg, die Auswahl über eintreffende Treffer hinweg festzuhalten · Aufwand `mittel`.

### ANN-062 — Die Adresse der Akte behält `verordnungen`, die Beschriftung nicht

Technik · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: sobald ein Loop die Routen der Akte ohnehin anfasst — AKTE-006 hat sie nicht angefasst

**Annahme.** Die sichtbaren Beschriftungen folgen ADR-020 Punkt 7 — der Bereich der Akte heißt „Behandlungsgrundlagen", die einzelne Karte nennt ihre Bauart. Das **Adressfragment bleibt** `/patienten/:id/verordnungen` (samt `…/neu`, `…/:id/bearbeiten`, `…/:id/serie` und dem Filter `?verordnung=` an den Terminen), ebenso die Sprungmarke `#verordnung-<id>`.

**Begründung.** ADR-020 Punkt 7 regelt, was auf dem **Bildschirm** steht; über Adressen sagt er nichts, und ADR-020 zählt die Umbenennung ausdrücklich für Tabellen, Funktionen, Policies, Auditwerte, Typen und Texte auf. Eine geänderte Adresse entwertet jedes Lesezeichen und jeden Link, den jemand aus der Anwendung kopiert hat, und bringt fachlich nichts, was die Beschriftung nicht schon leistet. Sie mitzunehmen kostet außerdem dort nichts, wo ein Loop die Routen ohnehin anfasst — CAL-EPIC-004c baut die Gruppierung der Termine je Grundlage und berührt genau diese Wege. Gegen die Annahme spricht, dass Adresse und Beschriftung vorerst auseinanderfallen; das ist sichtbar, aber folgenlos, weil in der Adresse ohnehin nie ein Name steht (ADR-011).

**Anker.** Die Routen unter `/patienten/:patientId/verordnungen` in `src/routes/AuthenticatedRoutes.tsx`; der Bereichseintrag in `src/features/patients/akte.ts` trägt die Beschriftung neben demselben Pfad.

**Änderungspfad.** Adressfragment mitziehen: die vier Routen in `AuthenticatedRoutes.tsx`, `zurueck`/`verordnerRueckpfad` in `TreatmentBasisFormPage.tsx`, die Links in `PatientTreatmentBasesPage.tsx` und `PatientAppointmentsPage.tsx`, der Parametername `verordnung` im Kalenderstand, dazu die angemeldeten E2E-Tests · Aufwand `klein`, aber jedes bestehende Lesezeichen läuft ins Leere; sinnvoll nur zusammen mit einem Loop, der diese Seiten ohnehin öffnet. **Abnahme (Jannes, 2026-10-02):** bestätigt.

### ANN-063 — Der Löschjournaleintrag wandert beim Umbenennen einer Tabelle mit

Technik · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Datenschutzprüfung / DSFA-Prozess vor Produktivstart

**Annahme.** Wird eine Tabelle umbenannt, schreibt die Migration den **Tabellennamen** in `deletion_journal.target_table` und in `retention_assignments.table_name` auf den neuen Wert um. Alles andere am Journaleintrag — welche Zeile, welche Klasse, wann, durch welchen Lauf — bleibt unverändert, und der zugehörige Auditeintrag wird nicht angefasst.

**Begründung.** Der Zweck des Löschjournals ist die **erneute Anwendung** einer Löschung nach einer Wiederherstellung (ADR-008 Punkt 9, LOE-002); `reapply_deletion_journal` löscht dafür je Eintrag aus der benannten Tabelle. Ein Eintrag, der auf `prescriptions` zeigt, findet nach GRD-001 keine Tabelle mehr — er wäre nicht mehr anwendbar und damit wertlos, und eine wiederhergestellte Sicherung behielte Zeilen, die gelöscht sein müssen. Das ist kein Umschreiben von Historie im Sinne von ADR-010: Der Auditeintrag daneben bleibt unberührt, und die Aussage des Journals („diese Zeile wurde gelöscht") ändert sich nicht — nur der Ort trägt seinen neuen Namen. Unsicher: ob die Datenschutzprüfung den Journaleintrag als Nachweis versteht, der überhaupt nicht angefasst werden darf; dann bräuchte es eine zweite Spalte mit dem historischen Namen.

**Anker.** Die beiden `update`-Anweisungen in `supabase/migrations/20260918120000_treatment_basis.sql`, Abschnitt 4b.

**Änderungspfad.** Historischen Namen mitführen statt umschreiben: eine Spalte `target_table_at_deletion` an `deletion_journal`, gefüllt beim Schreiben, und `reapply_deletion_journal` löst über eine Zuordnungstabelle auf · Aufwand `mittel`. Umgekehrt — gar nicht umschreiben — hieße, die Wiederanwendung für diese Einträge aufzugeben; das widerspricht ADR-008 Punkt 9.

**Abnahme (Jannes, 2026-10-02).** Bestätigt. Die Löschung muss auch nach Umbenennung und Wiederherstellung zuverlässig erneut angewendet werden können (`reapply_deletion_journal`).

### ANN-064 — Die Terminzahl steht an der Grundlage, die Leistungsmenge an der Position

Praxisprozess · entschieden (Jannes) · 2026-09-18 · Jannes · erledigt · Wiedervorlage: Jannes nach den ersten Praxiswochen; die Fortschreibung der genutzten Menge steht seit ABR-EPIC-001 in ANN-073

**Ablösung.** löst ANN-012 vollständig ab; ersetzt in ANN-038 und ANN-042 die Bezugsgröße (Termine statt Leistungseinheiten)

**Annahme.** Eine Behandlungsgrundlage trägt in `treatment_bases.appointment_count` die **Anzahl möglicher Termine** — verordnet beim Rezept, vereinbart beim Selbstzahler (ADR-020 Punkt 5). Gegen diese Zahl plant die Anwendung; mehrere Heilmittel erzeugen keine zusätzlichen Termine. Die **Leistungsmenge** je Heilmittel bleibt an `treatment_base_items.prescribed_quantity`, ebenso die genutzte Menge. Das Formular schickt Positionen nur noch als Auswahl: Eine vorhandene Position behält ihre Mengen unverändert, eine neu angehakte erbt die Terminzahl als Leistungsmenge, und „Genutzt" ist keine Eingabe mehr — fortgeschrieben wird sie von der Leistungserfassung (ANN-073). Genutzte **Termine** sind die größte genutzte Positionsmenge, nicht deren Summe. Bestandszeilen haben ihre Terminzahl aus der **größten** Positionsmenge geerbt, nie aus deren Summe.

**Begründung.** Das Kontingent war bis VER-EPIC-002 die Summe der Positionen: Eine Verordnung über sechs Termine mit KG-Doppelbehandlung, MT-Doppelbehandlung und Hausbesuch bot achtzehn Termine an — die Serienplanung hätte dreimal so viele Termine vergeben, wie das Rezept hergibt (§13). Jannes' Vorgabe trennt die beiden Größen ausdrücklich („Die Terminzahl zählt Behandlungstermine, keine Summe von Heilmitteln"); eine eigene Spalte ist die einzige Abbildung, die sie nicht wieder vermischt — ein abgeleiteter Wert (Summe, Maximum) wäre genau die Vermischung, die der Befund meint. Die Leistungsmenge bleibt, weil ABR-EPIC-001 sie braucht und §11 verbietet, sie vorsorglich wegzuwerfen. Dass das Formular keine Mengen mehr schreibt, ist der Preis dafür, dass es sie auch nicht mehr überschreiben kann: Eine Bestandsverordnung mit sieben genutzten von zehn Einheiten geht durch das vereinfachte Formular unverändert hindurch. Die Ableitung für den Bestand nimmt das Maximum, weil es nie über der alten Summe liegt — die Serienplanung kann dadurch nur weniger anbieten als vorher, nie mehr. Unsicher: ob die Praxis Leistungsmengen je Heilmittel später doch abweichend von der Terminzahl pflegen will; dann braucht ABR-001 dafür einen eigenen Weg.

**Anker.** Spalte `appointment_count` samt Kommentar und die Ableitung für den Bestand in `supabase/migrations/20260918130000_appointment_count.sql`; dort auch `app.treatment_basis_slot_counts` (die drei Zahlen) und `app.write_treatment_base_items` (Mengen bleiben stehen). In der Oberfläche `treatmentBasisFormSchema` und `rpcPositionen` in `src/features/treatment-bases/api.ts`.

**Änderungspfad.** Leistungsmenge wieder von Hand pflegen: ein Zahlenfeld je angehaktem Heilmittel im Formular, `rpcPositionen` schickt die Menge mit — der Schreibpfad nimmt sie bereits entgegen · Aufwand `klein`. Terminzahl wieder aus den Positionen ableiten: `app.treatment_basis_slot_counts` und die Spalte zurückbauen · Aufwand `mittel`, und der Befund von 2026-09-13 wäre zurück. Abgleich (2026-10-02, Abnahme Block 3): Terminzahl und Leistungsmenge bleiben getrennt; „genutzt“ an der Grundlage wird künftig aus durchgeführten Terminen gezählt, nicht aus `used_quantity` — BEF-096. Abgleich (2026-10-02, Abnahme Block 4): Neben Terminzahl und Heilmittelmenge ist das Honorar eine dritte, getrennte Größe — je Behandlungstermin einmal das Terminhonorar (ADR-009 Fassung 4 Punkt 22, BEF-099). **ABN-001 (2026-10-02):** `app.treatment_basis_slot_counts` zählt genutzte Termine statt der größten Positionsmenge (ANN-210); die Terminzahl an der Grundlage bleibt.

### ANN-065 — „Anmerkungen" ist das organisatorische Feld, der Verordnerhinweis bleibt Bestand

Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung; Jannes, sobald er eine Weile Verordnungen erfasst hat

**Annahme.** Das eine Textfeld „Anmerkungen" schreibt in die **organisatorische** Spalte `treatment_bases.note` — für beide Bauarten, in beiden Projektionen, für alle vier Praxisrollen sichtbar. Der klinische `prescriber_note` („Hinweis der Verordner:in") nimmt **keine neue Eingabe** mehr entgegen; ein vorhandener Text bleibt stehen, wird mit seiner Herkunft angezeigt und niemals zusammengeführt, überschrieben oder vervielfacht. Dasselbe gilt für `therapy_goal` und `follow_up_recommendation`.

**Begründung.** Die Feldvorgabe verlangt ein gemeinsames Feld „Anmerkungen" und nennt es die Nachfolge des Verordnerhinweises. Auf `prescriber_note` abgebildet hätte ein **Selbstzahler gar kein Anmerkungsfeld** mehr: ADR-020 Punkt 4 hält die klinischen Felder dort leer, und seit VER-EPIC-002 erzwingt das eine Constraint. `note` ist das einzige Feld, das beide Bauarten tragen und das die Vorgabe „allen vier Praxisrollen anzeigen" ohne das klinische Leserecht erfüllt — der Loop öffnet damit keine Sicht, die es nicht schon gab (§4.3, E15). Die Grenze zwischen organisatorischer und klinischer Projektion bleibt unangetastet: Diagnose, Therapieziel, Verordnerhinweis und Empfehlung stehen weiter ausschließlich in der klinischen Sicht. Zusammengeführt wird nichts, weil jede Zusammenführung beim zweiten Speichern denselben Text ein zweites Mal anhängen könnte. Unsicher: ob die Datenschutzprüfung Text, den das Office vom Rezept abschreibt, in der organisatorischen Spalte beanstandet — dann zieht der Hinweistext am Feld nach, oder das Feld wandert auf `prescriber_note` und der Selbstzahler bekommt ein eigenes.

**Anker.** Das Feld „Anmerkungen" auf `note` in `src/features/treatment-bases/TreatmentBasisFormFields.tsx`, die Beschriftung in `src/features/treatment-bases/grundlagenfelder.ts`; die Bestandstexte liefert `bestandstexte()` in `src/features/treatment-bases/api.ts`, und `public.update_treatment_basis` in `supabase/migrations/20260918130000_appointment_count.sql` fasst die drei Spalten nicht an.

**Änderungspfad.** „Anmerkungen" auf `prescriber_note` legen: das Feld im Formular umhängen, den Parameter in beiden Schreibpfaden wieder aufnehmen, ein zweites Feld für den Selbstzahler vorsehen · Aufwand `klein` bis `mittel`. Bestandstexte ganz entfernen: `bestandstexte()` streichen und die drei Spalten in einer Migration leeren · Aufwand `klein`, aber ein Textverlust ohne Weg zurück. **Abnahme (Jannes, 2026-10-02):** organisatorische Anmerkungen und Erhalt der Bestandstexte bestätigt. Neue behandlungsrelevante Hinweise brauchen weiterhin einen klinischen Ort, den das Büro liest wie die Therapeut:innen — BEF-098.

**Umgesetzt (ABN-007, 2026-10-02).** `prescriber_note` nimmt als „Behandlungsrelevanter Hinweis“ wieder Eingaben an, über eine eigene Funktion und nur in der Akte (ANN-214). Das Formular der Grundlage bleibt bei den organisatorischen „Anmerkungen“ und zeigt den Hinweis nicht mehr als Bestandstext.

### ANN-066 — Der Heilmittelkatalog ist eine Liste im Code, kein gepflegter Stammdatensatz

Technik · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Jannes, sobald ein Heilmittel fehlt; der Leistungskatalog aus ABR-EPIC-001 ist eine eigene Preisliste und trifft das Heilmittel über seine Katalogposition (ANN-073)

**Annahme.** Die vordefinierte Heilmittelauswahl steht als fünf Einträge in `src/features/treatment-bases/heilmittel.ts`: Krankengymnastik, KG als Doppelbehandlung, Manuelle Therapie, MT als Doppelbehandlung, Hausbesuch. Jeder Eintrag ist ein eigenes Kästchen und schließt keinen anderen aus. Die **Datenbank prüft den Wert nicht**: Ein Heilmittel außerhalb der Liste bleibt gültig, wird im Formular als angehakter Bestandseintrag mit seiner Menge angezeigt und verschwindet nur, wenn jemand es ausdrücklich abhakt.

**Begründung.** Die Vorgabe verlangt eine vordefinierte Auswahl und schließt eine freie Katalogverwaltung ausdrücklich aus; Preise kommen mit ABR-001. Eine Tabelle mit Pflegeoberfläche wäre ein Zukunftsfeature auf Vorrat (ADR-014 §11) und teurer zurückzunehmen als fünf Zeilen. Dass die Datenbank den Wert nicht prüft, ist der Punkt: Eine Prüfung wiese eine Bestandsposition („Wärmetherapie") beim nächsten Speichern ab — das Gegenteil von „Bestandswerte bleiben erhalten". Die Doppelbehandlung ist ein eigener Eintrag und kein Zusatzhaken, weil sie eine andere Leistung ist; nur so ist die Kombination KG-Doppelbehandlung + MT-Doppelbehandlung + Hausbesuch vollständig möglich. Die gespeicherten Bezeichnungen „Krankengymnastik" und „Manuelle Therapie" sind unverändert die aus VER-EPIC-001, damit eine Bestandsverordnung ihr Kästchen wiederfindet. Unsicher: ob die Praxis weitere Heilmittel braucht, bevor ABR-001 den Leistungskatalog bringt — dann kommt ein Eintrag dazu, nicht eine Verwaltungsoberfläche.

**Anker.** `HEILMITTEL` und `istBestand()` in `src/features/treatment-bases/heilmittel.ts`.

**Änderungspfad.** Weiteres Heilmittel: eine Zeile in `heilmittel.ts` · Aufwand `klein`. Eintrag entfernen: dieselbe Zeile streichen — vorhandene Positionen bleiben als Bestand stehen · Aufwand `klein`. Echte Katalogtabelle mit Preisen: gehört zu ABR-001, dort mit Versionierung und Steuerkennzeichen (ADR-009) · Aufwand `groß`. **Abnahme (Jannes, 2026-10-02):** bestätigt; der Verzicht auf eine Liste in der Datenbank hebt die serverseitige Prüfung von Pflichtfeldern, Mengen und Berechtigungen nicht auf. Abgleich (2026-10-02, Abnahme Block 4): Die Heilmittelliste beschreibt Verordnung und Erbrachtes, nicht den Preis; sie verändert das Terminhonorar nicht (BEF-099).

### ANN-067 — Gedeckt sind die frühesten Termine einer Grundlage, gezählt statt zugeteilt

Praxisprozess · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Jannes nach den ersten Wochen mit Dauerterminen; die Leistungserfassung prüft die Deckung nicht, ihre Grenze ist die Constraint an der Position (ANN-073)

**Annahme.** Ob eine Behandlungsgrundlage einen Termin trägt, ist **gerechnet und nicht gespeichert**: Die nicht abgesagten Termine einer Grundlage werden nach Beginn geordnet (bei gleichem Beginn nach Kennung), die ersten `appointment_count` gelten als gedeckt, jeder weitere als geplant, aber ungedeckt. Ein abgesagter Termin macht keine Aussage — er verbraucht nichts, und sein Platz rückt an den nächsten weiter. Ein Termin ohne Grundlage ist nicht ungedeckt, sondern ungebunden. Die Zahlen `covered` und `uncovered` an der Grundlage sind dieselbe Rechnung als Summe.

**Begründung.** CAL-022 verlangt, dass Überplanung sichtbar wird, und lässt offen, **welcher** Termin ungedeckt ist. Eine gespeicherte Zuteilung („dieser Termin verbraucht Einheit 7") wäre eine zweite Wahrheit neben dem Kalender: Jede Absage, jede Verschiebung und jede Übertragung müsste sie nachziehen, und liefe sie einmal auseinander, zeigte die Akte eine Deckung, die es nicht gibt (§13). Gerechnet kann sie nicht auseinanderlaufen. Die Reihenfolge nach Beginn bildet ab, wie die Praxis denkt: Die Verordnung trägt, was zuerst stattfindet; was danach kommt, gehört auf die Folgeverordnung. Deterministisch muss sie sein, weil Kalender, Akte und Terminliste sonst verschiedene Antworten gäben — daher die Kennung als zweites Ordnungsmerkmal. Dass Abgesagtes nicht zählt, folgt derselben Linie wie „verplant" (ANN-038): Eine Absage gibt den Platz zurück. Unsicher: ob die Praxis einen einzelnen Termin ausdrücklich als ungedeckt kennzeichnen will, obwohl ein früherer noch offen ist — das wäre eine Zuteilung und bräuchte eine Spalte.

**Anker.** `app.appointment_is_covered` und die beiden Ausgaben `covered`/`uncovered` in `app.treatment_basis_slot_counts`, beide in `supabase/migrations/20260918140000_appointment_coverage.sql`.

**Änderungspfad.** Andere Reihenfolge (etwa Anlagedatum statt Beginn): die `order by`-Entsprechung in `app.appointment_is_covered` ändern · Aufwand `klein`. Echte Zuteilung je Termin: eine Spalte an `appointments`, Pflege in jedem Schreibpfad samt Absage und Übertragung · Aufwand `groß`. Abgesagte mitzählen: die Bedingung `status <> 'cancelled'` an beiden Stellen streichen · Aufwand `klein`, widerspricht aber ANN-038. **Abnahme (Jannes, 2026-10-02):** berechnete Deckung nach zeitlicher Reihenfolge bestätigt. Abgesagte **und nicht angetroffene** Termine belegen und verbrauchen kein Kontingent (heute zählt Nichtantreffen mit — BEF-096); Ausfallhonorar getrennt; Überplanung bleibt ungedeckt sichtbar. **Umgesetzt in ABN-001 (2026-10-02):** `no_show` zählt an beiden Stellen wie `cancelled` (ANN-210).

### ANN-068 — Übertragen wird jeder Termin derselben Patient:in außer abgesagt und abgerechnet

Praxisprozess · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: keine eigene — seit R3-001 prüft die Übertragung zusätzlich die Leistungszeile (`20260920106000_transfer_guard_billable_services.sql`)

**Annahme.** `transfer_appointments_to_treatment_basis` nimmt jeden Termin an, der zur Patient:in der **Zielgrundlage** gehört und weder `cancelled` noch `invoiced` ist — auch einen vergangenen oder bereits durchgeführten. Die Patient:in kommt aus der Zielgrundlage und nicht vom Aufrufer. Das **Kontingent des Ziels wird nicht geprüft**: Die Übertragung darf es überschreiten, und was dann nicht mehr gedeckt ist, zeigt die Akte (ANN-067). Alles oder nichts; ein einziger unzulässiger Termin lässt den ganzen Vorgang scheitern. Die Oberfläche bietet davon nur die **ungedeckten künftigen** Termine an. `updated_at` bleibt unberührt, der Mitteilungsvermerk gilt weiter.

**Begründung.** Die Vorgabe nennt eine einzige Grenze ausdrücklich: „nie mit abgerechneter Leistung". Leistungen gibt es noch nicht (ABR-EPIC-001), und der einzige objektive Marker dafür ist heute der Terminzustand `invoiced` — er ist deshalb die Grenze, die die Datenbank zieht. Ein abgesagter Termin kommt dazu, weil er nichts mehr plant: Ihn umzuhängen änderte rückwirkend die Zahlen zweier Grundlagen, ohne dass ihm etwas folgt. Ein durchgeführter Termin bleibt dagegen übertragbar — genau dann fällt im Alltag auf, dass die Behandlung schon zur Folgeverordnung gehörte. Das Kontingent des Ziels zu prüfen wäre widersprüchlich: Denselben Termin dort neu anzulegen ist erlaubt (CAL-022), ihn dorthin zu übertragen also zu verbieten, wäre eine Regel, die nur den bequemeren Weg trifft. Dass `updated_at` stehen bleibt, folgt aus CAL-012: Mitgeteilt wurde ein Zeitpunkt, und der ändert sich nicht. Unsicher: ob die Praxis einen bereits durchgeführten Termin überhaupt übertragen will — dann kommt `completed`/`documented` zur Ausschlussliste.

**Anker.** Die Bedingung `status not in ('cancelled', 'invoiced')` in `public.transfer_appointments_to_treatment_basis`, `supabase/migrations/20260918140000_appointment_coverage.sql`; das Angebot der Oberfläche in `angebot` in `src/features/treatment-bases/TermineUebertragenPage.tsx`.

**Änderungspfad.** Weitere Zustände ausschließen: die Liste in der Funktion ergänzen und den Testfall spiegeln · Aufwand `klein`. Kontingent des Ziels doch prüfen: eine Abfrage vor dem Schreiben, Fehlermeldung mit Zahl · Aufwand `klein`, widerspricht aber CAL-022. Die Leistungsprüfung steht seit R3-001 neben der Zustandsprüfung; sie zurückzunehmen hieße, abgerechnete Termine wieder übertragbar zu machen. **Abnahme (Jannes, 2026-10-02):** Übertragung samt Überplanung und durchgeführter Termine als nachvollziehbare Zuordnungskorrektur bestätigt; abgerechnete Leistungen bleiben ausgeschlossen. Erfasste, nicht abgerechnete Leistungen müssen mitziehen, damit Termin, Leistung und Verbrauch zusammenpassen — BEF-097. **Fassung 2 (ABN-002, 2026-10-02, Abnahme Jannes):** Erfasste, nicht abgerechnete Leistungen ziehen in derselben Transaktion auf die Position des Ziels mit demselben Heilmittel mit, die genutzte Menge wandert; ohne passende Position oder bei erschöpftem Kontingent wird der ganze Vorgang abgewiesen (`supabase/migrations/20261002121000_abn_002_transfer_services.sql`). Durchgeführte Termine bietet die Oberfläche zugeklappt an (ANN-211).

### ANN-069 — Die Akte gruppiert Termine je Richtung, nicht über beide hinweg

Technik · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Jannes, sobald er die Akte einer Person mit mehreren Verordnungen im Alltag benutzt

**Annahme.** Der Terminbereich der Akte behält die beiden Abschnitte „Kommende Termine" und „Vergangene Termine" und gruppiert **innerhalb** jedes Abschnitts nach Behandlungsgrundlage: je Grundlage eine Überschrift mit Bauart und Ausstellungsdatum, daneben ihre Deckung, darunter ihre Termine. Termine ohne Grundlage stehen in einem eigenen, so benannten Abschnitt am Ende. Die Reihenfolge der Gruppen ist die des Bereichs „Behandlungsgrundlagen" (neueste zuerst). Gruppiert wird, was geladen ist; die Deckungszahlen kommen vom Server und zählen immer alle Termine der Grundlage.

**Begründung.** AKTE-006 verlangt „je Verordnung ein Abschnitt … und die Termine darunter" und sagt nichts darüber, ob die Trennung in kommend und vergangen dabei fällt. Sie fallen zu lassen hieße, die Frage aufzugeben, für die der Bereich gebaut wurde (AKTE-003: „was steht an, und was war"). Beide Listen blättern über einen eigenen Keyset-Cursor; eine Gruppe je Grundlage über beide Richtungen bräuchte je Grundlage zwei davon — bei fünf Grundlagen zehn Abfragen beim Öffnen — und zeigte in einer Akte über zehn Jahre zwanzig Abschnitte, von denen zwei Arbeitsvorrat sind. Dass nur das Geladene gruppiert wird, ist der Preis des Blätterns; die Deckung daneben ist davon unabhängig und ändert sich beim Weiterblättern nicht. Unsicher: ob Jannes die Grundlage als oberste Ebene erwartet und die Trennung kommend/vergangen darunter — dann tauschen die beiden Ebenen die Plätze, und jede Gruppe bekommt zwei Listen.

**Anker.** `gruppiere()` und `Gruppenkopf` in `src/features/appointments/PatientAppointmentsPage.tsx`.

**Änderungspfad.** Grundlage als oberste Ebene: `Terminliste` je Gruppe zweimal aufrufen, Cursor je Gruppe und Richtung · Aufwand `mittel`. Gruppierung ganz zurücknehmen: `gruppiere()` streichen, die flache Liste mit dem Grundlagenlink je Zeile steht in der Historie · Aufwand `klein`. **Abnahme (Jannes, 2026-10-02):** bestätigt.

### ANN-070 — Die Katalogversion ist eine eingefrorene Preisliste, die Leistung verweist auf ihre Position

Technik · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: keine — der Rechnungssnapshot aus ABR-EPIC-002a hält den Preis am Dokument fest (ANN-077)

**Annahme.** Eine Katalogversion ist eine vollständige Preisliste mit Gültigkeitsbeginn. Als Entwurf beliebig änderbar, mit dem Veröffentlichen unveränderlich — Positionen, Preise, Steuerkennzeichen und der Beginn; eine Preisänderung ist deshalb immer eine neue Version. Welche Liste an einem Tag gilt, ist die veröffentlichte mit dem größten Beginn bis zu diesem Tag, und maßgeblich ist der **Leistungstag**, nicht der Tag der Erfassung. Eine Leistung kopiert daher **keinen** Preis, sondern verweist auf die Position. Die steuerliche Einordnung steht je Position in drei Werten: `exempt_healthcare` (Heilbehandlung, § 4 Nr. 14 UStG), `taxable` (etwa Prävention oder Training) und `not_taxable` (kein Leistungsaustausch — der Fall des Ausfallhonorars); welcher Wert im Einzelfall gilt, entscheidet die Praxis mit ihrer Steuerberatung.

**Begründung.** ADR-009 Punkt 5 verlangt, dass spätere Preisänderungen historische Leistungen nicht verändern, und beschreibt selbst den Verweis auf eine Katalogversion statt auf einen aktuellen Preis. Eine Preiskopie an der Leistung wäre ein zweiter Wert für denselben Sachverhalt und damit die Abweichung, die §13 an der Abrechnung ausschließt; den Snapshot verlangt ADR-009 Punkt 10 erst beim Ausstellen der Rechnung. Die Sperre sitzt am Trigger und nicht im Schreibpfad, damit sie für jeden Weg in die Tabelle gilt. Die drei Steuerwerte sind nicht erfunden: Ohne `not_taxable` müsste ein Ausfallhonorar als steuerfrei oder steuerpflichtig geführt werden, und beides wäre falsch. Unsicher: ob die Praxis je einen anderen Steuersatz als 19 Prozent braucht — die Spalte trägt Promille und kann es, das Formular bietet es noch nicht an.

**Anker.** Tabellen `service_catalog_versions` und `service_catalog_items`, die Trigger `service_catalog_versions_frozen` und `service_catalog_items_frozen` sowie `app.active_service_catalog_version()` in `supabase/migrations/20260919100000_service_catalog.sql`.

**Änderungspfad.** Preis doch an der Leistung festhalten: Spalten an `billable_services` und ihre Belegung in `record_billable_services` · Aufwand `mittel`, mit Migration. Einen weiteren Steuersatz zulassen: ein Zahlenfeld neben der Auswahl in `CatalogPage.tsx`, die Spalte nimmt ihn bereits · Aufwand `klein`. Eine veröffentlichte Liste doch korrigierbar machen: die beiden Trigger · Aufwand `klein` — widerspräche ADR-009 Punkt 5. **Abnahme (Jannes, 2026-10-02):** Versionierung und Leistungstag bestätigt. Maßgeblich ist die mit der Person vereinbarte Honorarregelung, sonst der Tarif; eine neue Preisliste ändert bestehende Vereinbarungen und Historie nicht. Das Behandlungshonorar ist ein Terminhonorar (heute 140 € je 60 Minuten inkl. Dokumentation und Hausbesuch), Heilmittel verändern den Preis nicht — ADR-009 Fassung 4 Punkt 22, BEF-099; Rechnungsdarstellung offen (B17).

### ANN-071 — Preise pflegt die Inhaberin, Leistungen erfassen Inhaberin und Office

Praxisprozess · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Jannes nach den ersten Praxiswochen — insbesondere, ob eine Therapeutin am Termin selbst erfassen soll

**Ablösung.** abgelöst durch ANN-140 in der Frage „wer Leistungen erfasst“ (seit PRX-009 auch Behandelnde an ihrem eigenen Termin); der Katalog und das Zurücknehmen bleiben wie hier

**Annahme.** Den Leistungskatalog **lesen** alle vier Praxisrollen, **pflegen** darf ihn allein `owner`. Leistungen **erfassen und zurücknehmen** dürfen `owner` und `office`; die therapeutischen Rollen tun es nicht, und die Erfassung findet im Abrechnungsbereich statt, nicht am Termin. Die Termin-Detailseite bleibt unberührt.

**Begründung.** §4.1 zählt Praxiseinstellungen zur Inhaberrolle, §4.3 gibt dem Office Rechnungen und Zahlungsstatus — nicht die Preisbildung. Lesen muss der Katalog für alle offen sein, sonst sähe die Erfassung ihre eigenen Preise nicht. Die Erfassung auf zwei Rollen zu beschränken hält den Bedienweg an einer Stelle: Eine zweite Oberfläche am Termin wäre eine zweite Implementierung derselben Regel, und die Regel selbst ist ohnehin serverseitig. Unsicher: ob das im Alltag trägt — bei einer Praxis, in der Jannes beide Rollen hat, fällt der Unterschied nicht auf, bei einer angestellten Therapeutin schon.

**Anker.** `app.can_read_service_catalog()` und `app.can_manage_service_catalog()` in `supabase/migrations/20260919100000_service_catalog.sql`; `app.can_read_billable_services()` und `app.can_record_billable_services()` in `supabase/migrations/20260919110000_billable_services.sql`; die Anzeigeweiche `canManageServiceCatalog` und `canRecordBillableServices` in `src/features/session/types.ts`.

**Änderungspfad.** Therapeut:innen erfassen lassen: die beiden `can_*_billable_services()` um `therapist` und `team_lead` erweitern, dazu `canRecordBillableServices` · Aufwand `klein`; ein Einstieg am Termin käme als eigene Aufgabe dazu · Aufwand `mittel`. Office Preise pflegen lassen: `app.can_manage_service_catalog()` · Aufwand `klein`. **Abnahme (Jannes, 2026-10-02):** an ANN-140 angepasst: Preise pflegt owner; Behandelnde bestätigen erbrachte Leistungen an ihren eigenen dokumentierten Terminen, owner und Büro an allen; Zurücknehmen und Ausfallhonorar bleiben bei owner und Büro.

### ANN-072 — Eine Leistung entsteht nur aus „dokumentiert" oder aus einem Gebührenanlass, ohne Override

Praxisprozess · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Probewoche 1 — ob der fehlende Override im Alltag stört

**Annahme.** `record_billable_services` nimmt einen Termin nur an, wenn er im Zustand `documented` steht **oder** einen Gebührenanlass trägt (`fee_basis`, ADR-018 Fassung 2). Es gibt keinen Weg daran vorbei und keinen begründeten Override. Aus einem dokumentierten Termin entstehen ausschließlich Positionen der Art `treatment`, aus einem Gebührenanlass ausschließlich `absence_fee`; beides rutscht nie ineinander. Ein Ereignis ohne Patient:in erzeugt keine Leistung.

**Begründung.** `PROJECT_PRINCIPLES.md` §19 sagt das abschließend: „In V1 gibt es keinen Override: Fakturiert wird ausschließlich aus ‚dokumentiert' oder aus einem Vorgang mit Gebührenanlass (ADR-018)." Der Eintrag zu ABR-EPIC-001 in `ROADMAP.md` nennt dagegen „Kopplung an finalisierte Dokumentation mit protokolliertem Override (C1, ANN-006)" — die Roadmap hat keinen Rang, §21 gibt den Prinzipien den ersten, also gilt der Satz ohne Override. Die Trennung von Behandlung und Ausfallhonorar folgt daraus, dass an einem nicht angetroffenen Termin keine Behandlung stattgefunden hat; sie in einem Feld zu vermischen wäre genau die Falschzuordnung aus §13.

**Anker.** Die Zustandsprüfung und `v_erwartet` in `public.record_billable_services` in `supabase/migrations/20260919110000_billable_services.sql`.

**Änderungspfad.** Einen Override einführen: Er wäre eine Änderung an §19 und damit kein Fall für eine Annahme — erst Prinzipien, dann Spalten für Grund und Protokoll an `billable_services` · Aufwand `mittel`. Weitere abrechenbare Ereignisse neben dem Termin: eine eigene Quelle an der Leistung · Aufwand `groß`. **Abnahme (Jannes, 2026-10-02):** bestätigt. Ein abgeschlossener Termin ohne finalisierte Dokumentation ist noch nicht abrechenbar; den fehlenden Dokumentationsstatus sieht auch das Büro (BEF-095).

### ANN-073 — Die genutzte Menge der Grundlage schreibt die Leistungserfassung fort

Praxisprozess · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · erledigt · Wiedervorlage: Probewoche 1 · löst die Wiedervorlage von ANN-012, ANN-038 und ANN-064 ein

**Ablösung.** löst die Wiedervorlage „automatischer Verbrauch mit ABR-002" aus ANN-012, ANN-038 und ANN-064 ein; die dort beschriebene Handpflege entfällt

**Annahme.** Erfasst die Praxis eine Leistung, deren Katalogposition ein Heilmittel der Behandlungsgrundlage des Termins nennt, erhöht sich `treatment_base_items.used_quantity` dieser Position um die erfasste Menge; das Zurücknehmen senkt sie um denselben Betrag. Welche Position betroffen war, hält die Leistung selbst fest — nicht die Grundlage des Termins, die sich durch eine Übertragung ändern kann (CAL-022). Die Constraint `used_quantity <= prescribed_quantity` bleibt und weist eine Erfassung ab, die darüber hinausginge; die Oberfläche nennt den Grund.

**Begründung.** ANN-064 hat die Fortschreibung ausdrücklich auf ABR-002 vertagt, ANN-038 und ANN-012 ebenso; ohne sie bliebe die Zahl für immer stehen, und „noch planbar" wäre eine Erfindung. Die Wirkung an der Leistung festzuhalten statt sie aus der Grundlage zurückzurechnen ist der einzige Weg, der auch nach einer Terminübertragung genau das zurücknimmt, was gesetzt wurde. Die Constraint bleibt, weil ADR-020 Punkt 5 sie ausdrücklich der Abrechnung zuordnet und nicht der Planung — über das Kontingent hinaus **planen** bleibt erlaubt, darüber hinaus **abrechnen** nicht.

**Anker.** Spalte `billable_services.treatment_base_item_id` sowie die beiden `update public.treatment_base_items`-Blöcke in `record_billable_services` und `delete_billable_services` in `supabase/migrations/20260919110000_billable_services.sql`.

**Änderungspfad.** Fortschreibung zurücknehmen: die beiden Blöcke streichen, die Spalte bleibt als Nachweis · Aufwand `klein`. Über das Kontingent hinaus abrechnen zulassen: die Constraint `treatment_base_items_used_within_prescribed` · Aufwand `klein` — widerspräche ADR-020 Punkt 5. Abgleich (2026-10-02, Abnahme Block 3): `used_quantity` bleibt die Leistungsmenge der Abrechnung, nicht die Zahl genutzter Termine (BEF-096); bei einer Terminübertragung zieht sie mit der Leistung um (BEF-097). Abgleich (2026-10-02, Abnahme Block 4): Die Fortschreibung der Heilmittelmenge wird vom Preis getrennt; bestätigte Heilmittel tragen kein eigenes Honorar mehr (BEF-099).

### ANN-074 — Die Praxis-Stammdaten sind Pflichtangaben, der Umsatzsteuerstatus wird nicht geraten

Recht · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: mit der Antwort aus G13 (Steuerberatung), spätestens vor dem ersten echten Rechnungslauf

**Annahme.** Eine Praxis hat genau einen Rechnungsabsender, und ohne Name, Anschrift, Steuernummer und IBAN entsteht keine Zeile — diese vier sind Pflichtspalten. Der umsatzsteuerliche Status (`small_business`, Kleinunternehmerregelung nach § 19 UStG) hat **keinen Vorgabewert**; die Praxis muss ihn setzen, bevor sie eine Rechnung ausstellt. Der Preis einer Katalogposition ist der **Endpreis**: Eine enthaltene Umsatzsteuer wird je Steuersatz herausgerechnet und getrennt ausgewiesen, unter der Kleinunternehmerregelung entfällt der Ausweis und die Rechnung trägt den Hinweis. Das Zahlungsziel steht bei den Stammdaten (Vorgabe 14 Tage) und bestimmt das Fälligkeitsdatum.

**Begründung.** ADR-009 Punkt 10 verlangt beim Ausstellen einen Snapshot über „alle rechnungsrelevanten Stammdaten"; ohne Absender gibt es nichts zu snapshotten, und eine halb gefüllte Zeile verschöbe die Prüfung in den Schreibpfad. Der Status ist der eine Wert, den die Software nicht schätzen darf: Er steht auf jeder Rechnung, und beide Möglichkeiten kommen in einer Physiotherapiepraxis vor — Heilbehandlungen sind nach § 4 Nr. 14 UStG ohnehin befreit, Prävention und Training nicht. G13 beantwortet ihn mit der Steuerberatung. Der Endpreis ist der Betrag, den die Praxis nennt; aus ihm die enthaltene Steuer zu rechnen ist für beide Status richtig, während ein Nettopreis unter der Kleinunternehmerregelung eine Zahl wäre, die auf keiner Rechnung steht. Unsicher: ob die Regelbesteuerung eine Netto-Spalte je Zeile braucht — heute steht sie nur je Steuergruppe.

**Anker.** Tabelle `practice_billing_profiles` und `public.save_practice_billing_profile` in `supabase/migrations/20260919130000_practice_billing_profile.sql`; die Steuergruppen in `app.build_invoice_document` in `supabase/migrations/20260919150000_invoices.sql`; die Auswahl ohne Vorbelegung in `src/features/billing/PracticeProfilePage.tsx`.

**Änderungspfad.** Netto je Zeile ausweisen: die Zeilen in `app.build_invoice_document` um Netto und Steuer ergänzen, der Snapshot trägt sie ab dann · Aufwand `klein` — ältere Rechnungen behalten ihre Form, das ist ihr Zweck. Preis als Nettobetrag führen: `unit_price_cents` bekäme eine zweite Bedeutung, also besser eine neue Katalogversion mit anderer Auslegung · Aufwand `groß`. **Abnahme (Jannes, 2026-10-02):** bestätigt mit „Steuernummer **oder** USt-IdNr.“ (heute ist die Steuernummer Pflicht — BEF-100); IBAN bleibt Pflicht für den Überweisungsablauf; USt-Status ohne Vorgabe und Endpreise richtig; steuerliche Freigabe über B4.

**Umgesetzt (ABN-008, 2026-10-02).** `tax_number` ist optional, wenn `vat_id` steht; die Constraint `practice_billing_profiles_tax_id_present` und `save_practice_billing_profile` verlangen eine von beiden. Rechnung, Storno und Ausdruck nennen, was steht. Anker: `supabase/migrations/20261002132000_abn_008_billing_from_acceptance.sql`.

### ANN-075 — Die Rechnungsnummer ist lückenlos je Kreis und Kalenderjahr und entsteht beim Ausstellen

Recht · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: mit der Antwort aus G13 (Format und Nummernkreis)

**Annahme.** Eine Rechnungsnummer hat die Form `Kürzel-Jahr-vierstellig`, etwa `RG-2026-0001`. Das Kürzel wählt die Praxis in den Stammdaten — seit **ABR-010 eines je Leistungsbereich** (`RG` Behandlung, `TR` Training), und beide müssen sich unterscheiden. Das Jahr ist das Kalenderjahr der Ausstellung in der Zeitzone der Praxis, die laufende Zahl beginnt in jedem Jahr wieder bei 1 und wird **lückenlos je Kreis** vergeben; einmalig bleibt jede Nummer über alle Kreise (§ 14 Abs. 4 Nr. 4 UStG erlaubt mehrere Zahlenreihen, doppelte Nummern nicht). Vergeben wird sie erst beim Ausstellen, aus einer eigenen Zeile je Organisation, Jahr und Bereich; unter gleichzeitigen Zugriffen bekommt genau eine Ausstellung die nächste Nummer. Ein Entwurf trägt keine Nummer und lässt sich folgenlos verwerfen.

**Begründung.** ADR-009 Punkt 8 verlangt Vergabe erst bei Ausstellung, Eindeutigkeit und Nichtwiederverwendung; „wie wird ein Nummernkreis geführt — pro Organisation, pro Jahr, fortlaufend?" steht dort als offene Folgefrage. Das Kalenderjahr ist die Antwort, die zur steuerlichen Aufbewahrung passt, die ebenfalls am Jahresende ansetzt. Eine Datenbanksequenz wäre der naheliegende Weg und der falsche: Sie ist transaktionsfrei und ließe bei jedem fehlgeschlagenen Ausstellungsvorgang eine Lücke — und eine Lücke ist bei Rechnungsnummern genau das, was eine Betriebsprüfung erklärt haben will. Die Zeile mit `for update` kostet dafür Nebenläufigkeit, die eine Praxis dieser Größe nicht braucht. Unsicher: ob die Steuerberatung ein anderes Format erwartet; es steckt an einer Stelle.

**Anker.** Tabelle `invoice_number_series` und `app.next_invoice_number` in `supabase/migrations/20260919150000_invoices.sql`; der dritte Schlüsselteil, `app.invoice_number_prefix` und das zweite Kürzel in `supabase/migrations/20260921150000_invoice_number_series_per_area.sql` (ABR-010).

**Änderungspfad.** Anderes Format: die `return`-Zeile in `app.next_invoice_number` · Aufwand `klein`. Durchlaufende Nummer über Jahresgrenzen: dieselbe Funktion ohne Jahresanteil, die Tabelle trägt das Jahr weiter · Aufwand `klein`. Andere Kürzel: die Praxis-Stammdaten, ohne Punkt 17 zu berühren · Aufwand `klein`. Bereits vergebene Nummern sind davon nie betroffen — sie stehen im Snapshot. **Abnahme (Jannes, 2026-10-02):** Format, getrennte Kreise, Vergabe beim Ausstellen und Nichtwiederverwendung bestätigt. Korrektur der Begründung: Gesetzlich verlangt ist die Einmaligkeit; die Lückenlosigkeit ist eine interne Praxisregel (ADR-009 Fassung 4 Punkt 17), keine Pflicht aus § 14 UStG.

### ANN-076 — Der Rechnungsempfänger ist eine eigene Zeile, die Vorgabe ist die Patientin selbst

Praxisprozess · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Probewoche 1 — ob Beihilfe und Versicherung je geteilt abgerechnet werden müssen

**Annahme.** Ein Rechnungsempfänger ist eine eigene Zeile je Patientin mit einer von fünf Arten: Sorgeberechtigte, Betreuung, Beihilfestelle, private Krankenversicherung, sonstiger Kostenträger. **Die Patientin selbst bekommt keine Zeile**: Ist keine hinterlegte Empfängerin als Vorgabe markiert, geht die Rechnung an sie. Je Patientin sind beliebig viele Empfänger möglich, höchstens einer trägt die Vorgabe; eine Rechnung hat genau einen Empfänger. Pflegen und Rechnungen ausstellen dürfen `owner` und `office`.

**Begründung.** ADR-009 Punkt 2 verlangt die Trennung und nennt die Fälle; die offene Folgefrage „benötigt das eigene Empfängertypen?" ist damit beantwortet — die Art entscheidet über Anrede und Aktenzeichen, nicht über Berechtigungen (der Empfänger ist kein Zugang zur Akte, B5 bleibt unberührt). Eine Zeile „die Patientin selbst" wäre eine Kopie ihrer Anschrift und damit ein zweiter Wert für denselben Sachverhalt, der still veraltet — genau das schließt §13 aus. Die Aufteilung einer Rechnung auf Beihilfe und Versicherung nach Quote ist bewusst nicht gebaut und nicht vorbereitet (ADR-014): Sie käme als eigene Aufgabe mit eigener Summenlogik. Unsicher: ob die Praxis sie braucht; bei privat abrechnenden Praxen reicht regelmäßig eine Rechnung, die der Patient selbst einreicht.

**Anker.** Tabelle `invoice_recipients`, `app.can_read_invoicing()` und `app.can_manage_invoicing()` in `supabase/migrations/20260919140000_invoice_recipients.sql`; die Anzeigeweiche `canManageInvoicing` in `src/features/session/types.ts`.

**Änderungspfad.** Weitere Art: der `check` an `recipient_kind` und die Beschriftungen in `src/features/billing/api.ts` · Aufwand `klein`. Rechnung auf zwei Empfänger aufteilen: eigene Quotenzeilen an der Rechnung, zwei Dokumente je Ausstellung · Aufwand `groß`. **Abnahme (Jannes, 2026-10-02):** bestätigt. Standard ist die behandelte Person; PKV oder Beihilfe werden durch einen Erstattungsanspruch nicht von selbst Rechnungsempfänger.

### ANN-077 — Eine Rechnung fasst Person, Kalendermonat und Leistungsbereich zusammen und kennt zwei Zustände

Praxisprozess · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Probewoche 1 — ob der Monat die richtige Klammer ist

**Annahme.** Ein Rechnungsentwurf nimmt **alle** noch nicht abgerechneten Leistungen einer Patientin aus einem Kalendermonat **und einem Leistungsbereich** auf; einzelne Zeilen lassen sich nicht abwählen. Je Patientin, Monat und Bereich gibt es höchstens einen Entwurf; eine nachgereichte Leistung ergibt nach dem Ausstellen eine zweite Rechnung für denselben Monat. Seit **ABR-009** ist der Bereich der dritte Schlüssel: Eine Person mit beiden Verhältnissen bekommt in einem Monat zwei Rechnungen, und eine gemischte Rechnung ist schemaseitig unmöglich (ADR-009 Punkt 16). Gebaut sind zwei Zustände, `Entwurf` und `ausgestellt`; die übrigen fünf aus ADR-009 Punkt 7 hängen an Versand, Zahlungen und Storno und entstehen mit ABR-EPIC-002b und -003. Der Snapshot ist ein Dokument mit eigener `schema_version` und enthält keine klinischen Inhalte — der Verordnungsbezug steht als Bauart, Ausstellungsdatum und Verordner:in da, ohne Diagnose.

**Begründung.** Die Roadmap nennt die Sammelrechnung je Person und Monat mit Behandlungsnachweis (`IDEA-PRX-013`); die Auswahl einzelner Zeilen wäre die Gelegenheit, eine Leistung zu übersehen, und ADR-009 Punkt 4 verlangt das Gegenteil. Einen Zustand zu führen, den kein Schreibpfad setzen kann, wäre der Vorgriff aus ADR-014 — die fünf fehlenden kommen mit ihrer Funktion. Der Snapshot als `jsonb` mit eigener Version beantwortet die offene Folgefrage des ADR („wie wird er gegen spätere Schemaänderungen robust gehalten?"): Er ist von der Tabellenform unabhängig. Die Diagnose bleibt draußen, weil die Rechnung regelmäßig an Dritte geht (ADR-004 Fassung 2, Datensparsamkeit). Unsicher: ob eine Beihilfestelle die Diagnose verlangt — dann ist das eine eigene, begründete Entscheidung und keine stille Erweiterung des Dokuments.

**Anker.** `public.create_invoice_draft`, der Teilindex `invoices_draft_period_key`, der `check` an `invoices.status` und `app.build_invoice_document` in `supabase/migrations/20260919150000_invoices.sql`; der dritte Schlüssel und die beiden zusammengesetzten Fremdschlüssel an `invoice_items` in `supabase/migrations/20260921140000_invoice_service_area.sql` (ABR-009).

**Änderungspfad.** Andere Klammer als der Monat (je Verordnung, je Termin): `create_invoice_draft` und der Teilindex · Aufwand `mittel`. Einzelne Zeilen abwählen: eine Auswahl an `create_invoice_draft`, dazu eine sichtbare Anzeige des Rests · Aufwand `mittel` — widerspräche der Begründung oben. Diagnose in den Snapshot: der Block `treatment_bases` in `app.build_invoice_document` · Aufwand `klein`, aber eine Datenschutzentscheidung. **Abnahme (Jannes, 2026-10-02):** bestätigt. **Fassung 2 (ABR-032, 2026-10-05, Entscheidung Jannes zu B17):** Die Klammer ist die **Behandlungsgrundlage** (je Verordnung) statt des Kalendermonats: `create_invoice_draft_for_basis` nimmt alle offenen Leistungen der Termine einer Grundlage auf, je Grundlage höchstens ein Entwurf (`invoices.treatment_basis_id`, Teilindex `invoices_draft_basis_key`); `period_month` nennt dann den Monat der ersten Leistung. Leistungen an Terminen ohne Grundlage bleiben beim Monat. Die Diagnose steht seit ANN-229 im Snapshot. `supabase/migrations/20261007120000_abr_032_invoice_per_treatment_basis.sql`.

### ANN-078 — Zahlungen sind Transaktionen mit Richtung, der Zahlungsstand wird gerechnet

Praxisprozess · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Probewoche 1 — ob Überweisung als einziger Weg trägt

**Annahme.** Eine Zahlung ist eine eigene Zeile an einer **ausgestellten** Rechnung: Richtung (Eingang oder Rückzahlung), Betrag in ganzen Cent und immer positiv, Tag, Weg (Überweisung oder „anderer Weg" — **kein Bargeld**, Jannes am 2026-09-19) und eine freiwillige Notiz. Der Zahlungsstand der Rechnung (offen, teilweise bezahlt, bezahlt, überzahlt) und die Überfälligkeit werden aus diesen Zeilen **gerechnet** und nirgends gespeichert. Überzahlung ist erlaubt; zurückgezahlt werden kann höchstens, was eingegangen ist. Eine gebuchte Zahlung lässt sich **nur stornieren, mit Grund** — nicht ändern und nicht löschen; die stornierte Zeile bleibt sichtbar und fällt aus jeder Summe.

**Begründung.** ADR-009 Punkt 12 verlangt eigene Transaktionen mit Teilzahlung und Rückzahlung, und die Konsequenz dazu sagt ausdrücklich: „Der Zahlungsstatus ist damit abgeleitet, nicht gesetzt" — eine gepflegte Spalte könnte von den Transaktionen abweichen, eine gerechnete Summe nicht. Deshalb bleibt `invoices.status` bei zwei Werten (ANN-077); „teilweise bezahlt" und „bezahlt" aus Punkt 7 entstehen als abgeleitete Werte. Die Richtung statt eines negativen Betrags hält die Spalte eindeutig. Das Storno statt des Löschens folgt demselben Gedanken wie die unveränderliche Rechnung (Punkt 9): Ein Zahlungsvorgang muss auch Jahre später erklärbar sein. Bargeld ist ausgeschlossen, weil es die Kassenbuchpflicht auslöst und Kassenbuch, TSE und Kartenzahlung laut Roadmap ausdrücklich nicht Teil von Etappe 1 sind. Unsicher: ob eine Praxis ohne Bargeld auskommt — die Probewoche sagt es.

**Anker.** Tabelle `payments` mit dem `check` an `method`, `app.invoice_payment_state`, `app.invoice_paid_cents` und `app.payments_frozen` in `supabase/migrations/20260919160000_payments.sql`.

**Änderungspfad.** Weiterer Zahlungsweg: der `check` an `payments.method` und die Beschriftungen in `src/features/billing/api.ts` · Aufwand `klein`. Bargeld annehmen: derselbe `check`, aber dann mit Kassenbuch, TSE und einer Frage an die Steuerberatung (B4) · Aufwand `groß`. Mahnstufen: eine eigene Aufgabe, ADR-009 nennt das Mahnwesen ausdrücklich als nicht entschieden. **Abnahme (Jannes, 2026-10-02):** bestätigt.

### ANN-079 — Storno ist ein eigenes Dokument; „storniert" wird abgeleitet, nicht gesetzt

Praxisprozess · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Probewoche 1 — ob die Praxis die Korrekturrechnung so findet

**Annahme.** Eine ausgestellte Rechnung wird nie geändert. Storniert wird sie durch ein **eigenes Dokument** mit Pflichtgrund, das eine eigene Nummer aus **dem Kreis der Rechnung trägt, die es betrifft** (seit ABR-010 je Leistungsbereich, ADR-009 Punkt 17) und an denselben Empfänger geht. „Storniert" ist deshalb kein dritter Wert in `invoices.status`, sondern die Existenz dieser Zeile. Das Storno gibt die Leistungen wieder frei, ohne eine Rechnungszeile zu löschen (`released_at`), und die Korrekturrechnung merkt sich in `replaces_invoice_id`, welche Rechnung sie ersetzt. Eine Rechnung mit **stehender Zahlung** lässt sich nicht stornieren — erst die Zahlung stornieren, dann die Rechnung.

**Begründung.** ADR-009 Punkt 9 verlangt Korrektur durch „nachvollziehbare Korrektur-/Stornodokumente und gegebenenfalls eine neue Rechnung"; Punkt 8 verlangt eindeutige, nie wiederverwendete Nummern. Ein Storno geht an den Empfänger und ist damit selbst ein ausgehendes Dokument — eine zweite Zählung daneben hätte eigene Lücken. Der abgeleitete Zustand folgt ANN-078: Was gerechnet wird, kann nicht abweichen. Die Freigabe statt des Löschens hält die Frage „welche Leistung stand auf welcher Rechnung" beantwortbar, ohne die Invariante gegen Doppelabrechnung (Punkt 4) aufzugeben. Die Kette über `replaces_invoice_id` beantwortet die offene Folgefrage des ADR zur mehrfachen Korrektur: Jede Korrektur zeigt auf genau ihre Vorgängerin. Unsicher: ob die Praxis die eigene Nummer für das Storno erwartet — die Steuerberatung (B4) kann es bestätigen.

**Anker.** Tabelle `invoice_cancellations`, `public.cancel_invoice`, `public.create_correction_draft` und `app.invoice_items_frozen` in `supabase/migrations/20260919170000_invoice_cancellations.sql`.

**Änderungspfad.** Eigener Nummernkreis fürs Storno: `cancel_invoice` und eine weitere Zeile im Nummernkreis · Aufwand `mittel`. Teilstorno einzelner Zeilen: widerspricht ANN-077 und wäre eine eigene Aufgabe · Aufwand `groß`. Storno trotz Zahlung: die Prüfung in `cancel_invoice`, dann aber mit einem Weg für den Geldeingang · Aufwand `mittel`. **Abnahme (Jannes, 2026-10-02):** eigenes Stornodokument und Korrekturkette bestätigt. Geändert: Eine Zahlung sperrt das Storno nicht mehr; der eingegangene Betrag bleibt und wird mit der Ersatzrechnung verrechnet oder tatsächlich zurückgezahlt; ein Zahlungsstorno korrigiert nur eine falsche Buchung — BEF-100. Bis zur Umsetzung gilt die bisherige Regel.

**Umgesetzt (ABN-008, 2026-10-02).** `cancel_invoice` storniert auch mit stehender Zahlung. Der eingegangene Betrag bleibt an der stornierten Rechnung; sie nimmt danach keinen Eingang, aber die Rückzahlung (`record_payment`, Richtung `refund`) und die Verrechnung mit der Ersatzrechnung (`offset_payment`, ANN-215) an. Ein Zahlungsstorno bleibt die Korrektur einer falschen Buchung.

### ANN-080 — Zahlungserinnerung ohne Stufen, mit festgeschriebenem Betrag

Praxisprozess · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Probewoche 1 — ob vierzehn Tage Frist taugen

**Annahme.** Aus einer **überfälligen** Rechnung entsteht eine Zahlungserinnerung als Dokument: Tag, offener Betrag und eine neue Frist von **vierzehn Tagen**. Keine Stufen, keine Gebühren, keine Verzugszinsen, keine Automatik und **keine eigene Nummer** — sie verweist auf die Rechnungsnummer. Der offene Betrag wird im Dokument **festgeschrieben**; eine spätere Zahlung ändert das Blatt nicht mehr. Mehrere Erinnerungen sind erlaubt und gleichrangig, höchstens eine je Rechnung und Tag; an einer bezahlten oder stornierten Rechnung gibt es keine.

**Begründung.** `IDEA-PRX-012` ist am 2026-09-06 genau so bestätigt worden, und ADR-009 führt das Mahnwesen ausdrücklich als nicht entschieden — Stufen und Gebühren sind eine Rechtsfolge mit eigenen Voraussetzungen und kommen mit ABR-005 nach Praxiserfahrung. Vierzehn Tage sind die im Schriftverkehr übliche Nachfrist und entsprechen dem Zahlungsziel der Rechnung; sie sind eine Angabe auf dem Blatt, keine Rechtsfolge. Der festgeschriebene Betrag folgt der Logik des Rechnungs-Snapshots (ADR-009 Punkt 10): Ein Beleg, dessen Zahl sich nachträglich ändert, ist keiner — der heutige Stand wird weiter an der Rechnung gerechnet (ANN-078). Unsicher: ob vierzehn Tage in der Praxis passen und ob die Erinnerung ohne Stufen reicht.

**Anker.** Tabelle `invoice_payment_reminders` und die Konstante `c_frist_tage` in `public.create_payment_reminder` in `supabase/migrations/20260919180000_payment_reminders.sql`.

**Änderungspfad.** Andere Frist: die Konstante `c_frist_tage` · Aufwand `klein`. Mahnstufen und Gebühren: eine eigene Aufgabe mit eigener Rechtsprüfung (ABR-005) · Aufwand `groß`. Erinnerung vor Fälligkeit: die Prüfung in `create_payment_reminder` · Aufwand `klein`. **Abnahme (Jannes, 2026-10-02):** bestätigt.

### ANN-081 — Abgerechnet ist die Leistung, nicht der Termin

Technik · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: mit der Folgestory zu ADR-018 Punkt 2

**Annahme.** Der Terminzustand `invoiced` aus ADR-018 bleibt vorerst **unbesetzt**: `issue_invoice` hebt `billable_services.status` auf `invoiced` und lässt den Termin, wo er ist. Wer wissen will, ob ein Termin abgerechnet ist, fragt die Leistung. Jede Stelle, die „abgerechnet" als Grenze braucht — heute der Transfer-Guard aus ANN-068 —, prüft deshalb `billable_services.status`.

**Begründung.** ADR-018 Punkt 2 sieht den Übergang vor, die Abrechnung aus ABR-003 setzt ihn nicht um; die Abweichung besteht seit PR #53 und ist in R3 als Befund R3-001 belegt worden. Der Übergang nachzuziehen ist Feature-Arbeit mit einer Datenmodell-Entscheidung — der Weg zurück aus `invoiced` beim Rechnungsstorno braucht den gemerkten Vorzustand (`documented`, `no_show` oder `cancelled`), also eine neue Spalte oder eine Ableitung. Bis dahin wäre die **stillschweigend wirkungslose** Grenze der größere Schaden: Sie sah aus, als schütze sie, und tat es nicht. Unsicher bleibt nur der Zeitpunkt der Vollumsetzung, nicht ihre Richtung.

**Anker.** Die Bedingung `not exists (… billable_services … status = 'invoiced')` in `public.transfer_appointments_to_treatment_basis` in `supabase/migrations/20260920106000_transfer_guard_billable_services.sql`.

**Änderungspfad.** ADR-018 Punkt 2 vollständig umsetzen: Statuswechsel in `issue_invoice` und Rückweg in `cancel_invoice` samt gemerktem Vorzustand und Auditereignis `appointment.invoiced`; die Bedingung hier fällt dann ersatzlos weg · Aufwand `mittel`. **Abnahme (Jannes, 2026-10-02):** bestätigt.

### ANN-082 — Der Befreiungsgrund ist ein fester Text je Steuerkennzeichen

Recht · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: mit der Antwort aus B4 (Steuerberatung, G13), spätestens vor dem ersten echten Rechnungslauf

**Annahme.** Der Grund der Steuerbefreiung entsteht als **fester Text je Steuerkennzeichen** und nicht als Feld an der Katalogposition: `exempt_healthcare` trägt „Steuerfreie Heilbehandlung nach § 4 Nr. 14 Buchstabe a UStG", `not_taxable` trägt „Nicht steuerbar, kein Leistungsaustausch (§ 1 Abs. 1 Nr. 1 UStG)", `taxable` trägt keinen. Er steht an der **Steuergruppe** des Dokuments, nicht an der Zeile, und damit im Snapshot (`schema_version` 2). Ohne ihn lässt sich eine Rechnung mit steuerfreiem Posten nicht ausstellen.

**Begründung.** § 14 Abs. 4 Nr. 8 UStG verlangt den Hinweis als Pflichtangabe; ADR-009 Fassung 2 Punkt 18 legt ihn in den Snapshot und führt die Frage „fester Text oder Feld an der Position" ausdrücklich als offene Folgefrage. Ein Feld erlaubte verschiedene Befreiungstatbestände — diese Praxis führt genau einen, und ein Freitext an der Position wäre eine zweite Wahrheit neben `tax_treatment` (ARBEITSBEREICHE.md). Der nicht steuerbare Posten braucht die Angabe rechtlich nicht, bekommt sie aber aus demselben Grund: Ein Betrag ohne Steuer und ohne Erklärung sieht auf dem Papier wie ein Fehler aus. Unsicher bleibt allein der **Wortlaut** — ob die Steuerberatung „§ 4 Nr. 14 Buchstabe a" oder „§ 4 Nr. 14a" schreibt und ob sie beim Ausfallhonorar eine andere Formulierung will (B4).

**Anker.** `app.tax_exemption_reason` in `supabase/migrations/20260920120000_invoice_tax_exemption_reason.sql`; die Pflichtprüfung dazu in `app.assert_invoice_tax_lawful` in `supabase/migrations/20260920121000_invoice_tax_lock.sql`.

**Änderungspfad.** Anderer Wortlaut: die Funktion, eine Zeile je Kennzeichen · Aufwand `klein` — ausgestellte Rechnungen behalten ihren Satz, das ist der Zweck des Snapshots. Grund je Katalogposition (mehrere Befreiungstatbestände): neue Spalte an `service_catalog_items`, neue Katalogversion, die Funktion fällt weg · Aufwand `mittel`. **Abnahme (Jannes, 2026-10-02):** feste Texte je Kennzeichen und Speicherung im Snapshot bestätigt, vorbehaltlich B4. Steuerbefreiung und „nicht steuerbar“ bleiben unterschieden; die Einordnung des Ausfallhonorars bestätigt die Steuerberatung (B4).

### ANN-083 — Die Instrumentenbibliothek liegt als Dateien im Release, nicht in der Datenbank

Technik · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: mit P6 (Ergebnisse erheben und speichern)

**Annahme.** Definitionen von Untersuchungsbausteinen und Scores liegen als JSON-Dateien unter `src/features/assessments/definitionen/` und werden zur Bauzeit eingesammelt. Sie tragen **kein** `organization_id`, stehen in keiner Tabelle und sind für alle Mandanten gleich. Ergebnisse gehen den umgekehrten Weg: Sie sind Gesundheitsdaten und kommen mit Datenklasse, Frist und RLS in die Datenbank.

**Begründung.** Der Arbeitsauftrag §0 verlangt „als Daten abgelegt, nicht als Code und nicht als PDF", §1 „ein neuer Score ist eine neue Datei". ADR-014 führt als offene Folgefrage ausdrücklich, wie „Daten ohne Organisationsbezug, etwa Instrumenten- und Leistungskatalog" zu behandeln sind; für die Bibliothek beantwortet das diese Annahme. Der Unterschied zum Leistungskatalog (`service_catalog_items`, in der Datenbank) ist sachlich: Preise gehören der Praxis und ändern sich je Mandant, ein validierter Fragebogen gehört niemandem und ändert sich nur mit seiner Fassung. Nur so ist `definition_version` etwas Festes — läge die Bibliothek je Mandant in der Datenbank, hieße „1.2.0" in zwei Praxen womöglich Verschiedenes.

**Anker.** `ladeDefinitionen()` in `src/features/assessments/definitionen.ts`; das Einsammeln in `src/features/assessments/bibliothek.ts`.

**Änderungspfad.** Bibliothek je Mandant (eigene Instrumente einer Praxis): Tabelle mit `organization_id`, RLS, Löschpfad; der Ladepfad bekommt eine zweite Quelle, das Schema bleibt · Aufwand `mittel`. Zurück in den Code: nicht vorgesehen — das wäre das Leitprinzip selbst. **Abnahme (Jannes, 2026-10-02):** bestätigt.

### ANN-084 — Definitionen tragen eine semantische Version

Technik · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: mit P6, sobald das erste Ergebnis eine `definition_version` speichert

**Annahme.** `version` ist eine semantische Version (`1.0.0`), kein Datum und kein Zähler. Eine Korrektur am Wortlaut hebt die Patch-Stelle, ein geändertes oder entferntes Item die Minor-, ein anderer Zuschnitt der Subskalen die Major-Stelle.

**Begründung.** Der Arbeitsauftrag §1 verlangt eine Version je Definition und die Mitschrift der verwendeten Fassung an jedem Ergebnis, sagt aber nicht, welcher Form. Ein Datum sagt nur, *wann* geändert wurde; die Frage im Verlauf ist aber, **ob** zwei Werte vergleichbar sind — und das hängt daran, ob ein Item verschwunden ist oder ein Tippfehler verschwand. D2 bis D6 im Plan zeigen, dass beides kommt.

**Anker.** `versionSchema` in `src/features/assessments/schema.ts`.

**Änderungspfad.** Datum oder Zähler: ein regulärer Ausdruck, ein Testfall, die vorhandenen Dateien · Aufwand `klein`, solange kein Ergebnis gespeichert ist; danach `mittel`, weil gespeicherte Fassungen mitwandern. **Abnahme (Jannes, 2026-10-02):** präzisiert: Patch nur für bedeutungserhaltende Korrekturen (Schreibfehler). Geänderter Frageninhalt, Antwortmöglichkeiten oder Berechnung sind fachliche Änderungen; ihre Vergleichbarkeit wird geprüft und vermerkt — die Nummer garantiert sie nicht (BEF-101). **Fassung 2 (ABN-014, 2026-10-02, BEF-101 Punkt 4):** Die Nummer sagt nicht, ob Werte vergleichbar sind. `meta.vergleichbar_mit` vermerkt es je Fassung; eine reine Patch-Änderung muss dort stehen (Ladepfad `definitionen.ts`), geänderter Inhalt, andere Optionen oder eine andere Berechnung werden je Änderung geprüft. Frühere Fassungen liegen unter `definitionen/scores/archiv/` und bleiben im Release; eine Erhebung wird mit ihrer eigenen Fassung angezeigt (`fassungFuer`), der Verlauf zeichnet nur vergleichbare Fassungen in eine Reihe. Eine eingetragene Fassung ändert sich nie (Trigger an `questionnaire_definitions`, Prüfung in `scripts/definitionen-sql.mjs`).

### ANN-085 — Ein Instrument ohne Wertung trägt die Richtung `nicht_anwendbar`

Technik · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: mit P5, wenn Anamnesebogen und Tegner-Skala entstehen

**Annahme.** `richtung` bleibt Pflichtfeld, bekommt neben `hoch_ist_besser` und `hoch_ist_schlechter` aber den dritten Wert `nicht_anwendbar`. Er gilt für Instrumente ohne Score (Anamnesebogen: „kein Summenscore") und für Skalen, deren Quelle bewusst keine Wertung ausspricht (Tegner: „hoch = aktiver").

**Begründung.** Der Arbeitsauftrag §3 nennt zwei Werte. Die Quellen brauchen einen dritten: Das Inventar führt beim Anamnesebogen „Richtung: n/a (kein Score)" und bei der Tegner-Skala „hoch = aktiver" — nicht besser. Aus „aktiver" ein „besser" zu machen wäre eine eigene Bewertung und damit genau das, was ADR-006 Punkt 11 verbietet. Ein Pflichtfeld mit einem falschen Wert ist schlechter als ein ehrlicher dritter.

**Anker.** `RICHTUNGEN` in `src/features/assessments/schema.ts`, samt der Prüfung, dass ein Instrument ohne Gesamtwert und ohne Subskala keine Richtung behaupten darf.

**Änderungspfad.** Zurück auf zwei Werte: die Aufzählung, die Prüfung und je ein Feld in den betroffenen Definitionen · Aufwand `klein` — aber nur zusammen mit einer Antwort darauf, was der Anamnesebogen dann tragen soll. **Abnahme (Jannes, 2026-10-02):** bestätigt als fehlende Wertung „besser/schlechter“; Tegner zeigt seinen Zahlenwert mit „höher = aktiver“ (BEF-101). **Fassung 2 (ABN-014, 2026-10-02, BEF-101 Punkt 3):** Rechnet ein Instrument mit Richtung `nicht_anwendbar` etwas, ist `scoring.leseart` Pflicht (Tegner: „höher = aktiver“). Der Wert steht mit diesem Satz im Verlauf und in den Instrumenten, ohne Wertung.

### ANN-086 — Der Lizenzstatus hängt am Instrument, und `aktiv` hängt an ihm

Recht · entschieden (Jannes) · 2026-09-21 · Jannes · Prüfpaket · Wiedervorlage: mit dem schriftlichen Beleg des Lizenzgebers (B8), spätestens vor M3

**Annahme.** Jede Score-Definition trägt `lizenzstatus` mit Status, Begründung und Stand; ein Instrument mit dem Status `lizenz_erforderlich` oder `ungeklaert` kann nicht `aktiv` sein — das Schema weist es zurück. Für die 18 vorliegenden Instrumente gilt der Status `freigegeben` auf Grundlage der Erklärung von Jannes vom 2026-09-21, es gebe keine Lizenzierung und alle Inhalte dürften integriert werden.

**Begründung.** Die Roadmap-Zeile FRB-001 verlangt die Bibliothek „versioniert, mit Lizenzfeld", `IDEA-OUT-001` begründet es: Viele etablierte Fragebögen sind urheberrechtlich geschützt, und was für diese 18 gilt, gilt nicht für das neunzehnte. B8 führt den **schriftlichen Beleg des Lizenzgebers** weiter als offen; die Erklärung von Jannes trägt das Bauen, nicht die Freigabe. Die Kopplung an `aktiv` steht im Schema und nicht in der Oberfläche, weil ein ausgeblendetes Element keine Zugriffskontrolle ist (`CLAUDE.md`, Harte Regeln).

**Anker.** `lizenzstatusSchema` und die Prüfung `aktiv → freigegeben` in `src/features/assessments/schema.ts`.

**Änderungspfad.** Fällt die Auskunft des Lizenzgebers anders aus: Status je betroffener Datei auf `lizenz_erforderlich`, `aktiv` auf `false` · Aufwand `klein` — eine Zeile je Instrument, und das Instrument verschwindet aus der Auswahl, ohne dass Ergebnisse verlorengehen.

### ANN-087 — `skip_logic` entsteht erst mit dem Instrument, das sie braucht

Technik · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: mit P5, wenn alle 18 Instrumente übertragen sind

**Annahme.** Das Item-Schema der Scores führt **kein** Feld `skip_logic`, obwohl die Skizze im Arbeitsauftrag §3 es nennt. Braucht ein Instrument eine Sprungregel, entsteht das Feld mit ihm — zusammen mit dem Fall, an dem sich prüfen lässt, was es bedeutet.

**Begründung.** Keines der 18 Instrumente braucht es: Was das Inventar an Auslassungen kennt, betrifft ganze Subskalen (KOOS: „Nicht-Sportler: Sport-Subskala auslassen") oder einzelne Antworten („nicht zutreffend" beim FAAM) und steht dort in der Missing-Value-Regel. `CLAUDE.md` verbietet prophylaktische Zukunftsfeatures, ADR-014 führt dieselbe Grenze als Negativliste. Ein Feld ohne Fall wird falsch benutzt, bevor jemand festgelegt hat, was es heißen soll — und steht dann in Definitionsdateien, die niemand mehr anfasst. Der Widerspruch zur Skizze des Auftrags ist nach Rang aufgelöst (`CLAUDE.md`: Rang 1 und 2 vor Rang 3).

**Anker.** Der Kommentar an `scoreItemSchema` in `src/features/assessments/schema.ts`, der die Auslassung samt Grund festhält.

**Änderungspfad.** Ein Instrument mit echter Sprungregel: Feld am Item, Prüfung gegen bekannte Item-Kennungen, ein Testfall · Aufwand `klein`. **Abnahme (Jannes, 2026-10-02):** bestätigt.

### ANN-088 — Eine Teilzahlung verteilt sich anteilig auf die Steuergruppen ihrer Rechnung

Technik · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: mit B9, wenn die Steuerberatung die Grundlage der Gewinnermittlung benennt

**Annahme.** Auf der Grundlage **Zufluss** wird eine gebuchte Zahlung auf die Steuergruppen ihrer Rechnung verteilt: anteilig nach deren Bruttoanteil am Rechnungsbetrag, in ganzen Cent, der verbleibende Rest an die größten Bruchteile und bei Gleichstand in fester Reihenfolge. Eine Vollzahlung ergibt damit genau die Gruppen des Dokuments, eine Rückzahlung hebt ihren Eingang centgenau auf, und keine Summe verliert einen Cent.

**Begründung.** ADR-009 Punkt 19 verlangt die Aufschlüsselung je Kennzeichen und Satz auf **beiden** Grundlagen, sagt aber nicht, welchem Posten eine Teilzahlung gilt — die Rechnung nennt keinen, und der Zahlende nennt ihn im Regelfall auch nicht. Die anteilige Verteilung ist die Antwort ohne Bewertung: Sie bevorzugt keine Gruppe und entspricht der Aufteilung, mit der die Istversteuerung nach § 20 UStG rechnet. Die Aufschlüsselung auf dieser Grundlage wegzulassen verstieße gegen Punkt 19; zuerst die steuerpflichtigen Posten als bezahlt zu behandeln wäre eine Tilgungsbestimmung — die trifft der Zahlende (§ 366 BGB) und nicht die Software.

**Anker.** Die Schritte `abgerundet` und `verteilt` in `public.list_revenue_by_service_area` (`supabase/migrations/20260921160000_revenue_by_service_area.sql`).

**Änderungspfad.** Eine andere Zuordnung — Tilgungsbestimmung am Zahlungsbeleg oder eine feste Reihenfolge der Kennzeichen: die beiden Schritte und ein Testfall je Regel · Aufwand `klein`, solange die Auswertung nichts speichert — sie rechnet bei jedem Aufruf aus Dokumenten neu. **Abnahme (Jannes, 2026-10-02):** anteiliges Verteilen bestätigt. Mehrere Teilzahlungen müssen bei voller Zahlung zusammen exakt die Steuergruppen ergeben; dafür wird kumulativ verteilt statt je Zahlung gerundet, und eine Rückzahlung nimmt ihre Verteilung nachvollziehbar zurück — BEF-100.

**Umgesetzt (ABN-008, 2026-10-02).** `list_revenue_by_service_area` verteilt kumulativ: je Zahlung die Summe aller Zahlungen der Rechnung bis einschließlich dieser (Reihenfolge Zahlungstag, Erfassung, Kennung) minus die bis zur vorigen, Brutto und Steuer. Die Verteilung selbst steht an einer Stelle, `app.distribute_to_tax_groups`. Test mit drei krummen Teilzahlungen in `supabase/tests/revenue-by-service-area.test.ts`.

### ANN-089 — `MDR_REVIEW_REQUIRED` wird als Register mit gesperrten Adressen geführt

Technik · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: mit B1, wenn die externe regulatorische Prüfung vorliegt

**Annahme.** Die Klassifikation nach ADR-006 Punkt 6 wird an genau einer Codestelle geführt: `src/app/mdr.ts`. Ein Eintrag mit reservierter Adresse ist gesperrt — ein Riegel über der Routentabelle fängt sie ab, bevor eine Route greift; ein Eintrag ohne Adresse ist ein Ausgabeverbot und wirkt im Zuschnitt und im Zweitreview. Einen Schalter gibt es nicht: Geöffnet wird eine Funktion nur, indem ihr Eintrag entfernt wird.

**Begründung.** ADR-006 verlangt in den „Konsequenzen" ausdrücklich mehr als eine Liste — geführt, sichtbar und technisch wirksam —, und Punkt 13 schließt das Feature-Flag als Weg aus; seit 0.13 steht dieselbe Pflicht in `PROJECT_PRINCIPLES.md` §17 an Rang 1. Wo das geschieht, sagt keines der Dokumente; die offene Folgefrage steht seit Fassung 1. Die Reservierung einer Adresse ist der einzige Riegel, der heute schon wirkt, weil die klassifizierten Funktionen noch nicht gebaut sind: Sie sperrt, ohne etwas zu bauen. Für die drei Ausgabeverbote wäre ein Riegel dagegen eine Behauptung — ADR-006 nimmt ihre technische Durchsetzung ausdrücklich aus, weil sich nicht erzwingen lässt, etwas **nicht** zu bauen.

**Anker.** `MDR_REVIEW_REQUIRED`, `freigabeVollstaendig` und `mdrSperre` in `src/app/mdr.ts`; der Riegel darüber in `src/routes/AuthenticatedRoutes.tsx`; `app.mdr_released` im Server.

**Änderungspfad.** Andere Adresse für eine klassifizierte Funktion: das Feld `pfade` des Eintrags · Aufwand `klein`. Klassifikation aufheben, nachdem die Prüfung vorliegt: Eintrag entfernen, `REGULATORISCHE_PRUEFUNG` mit der Fundstelle belegen, Test nachziehen · Aufwand `klein`, aber nie ohne die dokumentierte Prüfung — das ist die Entscheidung, nicht ihre Umsetzung. **Abnahme (Jannes, 2026-10-02):** geändert: Geöffnet wird erst nach dokumentierter MDR-Prüfung mit Freigabevermerk; bloßes Entfernen des Registereintrags genügt nicht; vorhandene Serverzugänge werden ebenfalls gesperrt (BEF-110). **Fassung 2 (ABN-019, 2026-10-02, BEF-110 Punkt 2):** Geöffnet wird nur mit vollständigem Freigabevermerk am Eintrag (`freigabe`: geprüft von, am, Ergebnis, Verweis auf das Prüfdokument im Repository; `mdr.test.ts` prüft jedes Feld und das Dokument); Entfernen genügt nicht, die Vollzähligkeit hält der Test. `REGULATORISCHE_PRUEFUNG` entfällt. Auf dem Server antwortet `app.mdr_released(id)` (heute für jede Kennung `false`, `supabase/migrations/20261003106000_abn_019_mdr_released.sql`), die jede künftige Serverfunktion eines klassifizierten Bereichs zuerst fragt.

### ANN-090 — Fehlende Einrichtung des Kartendienstes ist eine eigene Fehlerklasse

Technik · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: mit OPS-001, wenn die Prüfung der Edge Runtime vorliegt

**Annahme.** Der Vertrag bekommt die Fehlerklasse `not_configured`. Ist kein Anbieter eingerichtet — `LOCATION_PROVIDER` fehlt, ist unbekannt oder der Schlüssel fehlt —, antwortet der Adapter mit dieser Klasse und **nie** mit der Nachbildung; die Oberfläche zeigt dafür einen Einrichtungshinweis und keine Störungsmeldung.

**Begründung.** ADR-019 Punkt 24 legt Abo und Schlüssel zu Jannes und nie ins Repository: „nicht eingerichtet" ist damit der Regelfall dieses Prototyps und kein Ausfall des Anbieters. MAP-003b verlangt den Zustand „nicht konfiguriert" ausdrücklich neben „Anbieter nicht erreichbar" — ohne eigene Klasse wären beide dieselbe Meldung, und die Seite behauptete eine Störung, die es nicht gibt. Eine stillschweigend einspringende Nachbildung wäre die andere Hälfte desselben Fehlers: Eine Luftlinie sieht auf der Karte aus wie eine Route.

**Anker.** `LocationErrorCode` in `src/lib/location/contract.ts`; die Wahl selbst in `supabase/functions/location-provider/auswahl.ts`.

**Änderungspfad.** Eine andere Antwort auf fehlende Einrichtung — etwa die Nachbildung als Standard: Klasse aus dem Vertrag nehmen, `waehleAdapter` umstellen, Zustand der Oberfläche streichen · Aufwand `klein`. **Abnahme (Jannes, 2026-10-02):** bestätigt.

### ANN-091 — Höchstgröße einer Fahrzeitmatrix

Technik · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: mit der Antwort des PTV-Supports zur Höchstzahl der Relationen (ADR-019, „Offene Folgefragen")

**Annahme.** Eine Matrix-Anfrage trägt höchstens **25 Startpunkte und 25 Ziele**. Die Function weist alles darüber mit `invalid_request` ab, ohne den Anbieter zu fragen; der Browser schickt sie gar nicht erst los.

**Begründung.** Wie viele Relationen die Matrix Routing OSM API je Anfrage annimmt, ist nicht belegt — die Providerprüfung hält es als „im Client nicht beziffert" fest, und die Supportanfrage vom 2026-09-21 ist unbeantwortet geblieben (Teil 1 Punkt 4 und die Antworttabelle in `providerpruefung-kartendienst.md`). Ohne eigene Grenze löst ein einziger Aufruf beliebig viele Relationen aus; abgerechnet wird je Relation, und das Free-Abo ist ausdrücklich klein (ADR-019 Punkt 24). Genommen ist die Zahl des Nachbarn: Die Routing OSM API trägt 25 Wegpunkte, und mehr als 25 Stopps hat kein Tag dieser Praxis — die Grenze schneidet damit nichts ab, was gebraucht würde. Sie ist eine Sparmaßnahme gegen versehentliche Kosten, keine fachliche Aussage über Tourengrößen.

**Anker.** `MAX_MATRIX_PUNKTE` in `src/lib/location/matrix.ts`; die Kopie in `supabase/functions/location-provider/typen.ts` hängt über `typen.test.ts` daran und darf nicht wegdriften.

**Änderungspfad.** Nennt PTV eine Zahl, tritt sie an die Stelle dieser: eine Konstante, ihre Kopie und der Test dazwischen · Aufwand `klein`. **Abnahme (Jannes, 2026-10-02):** als **interne** Grenze bestätigt: 25 × 25 sind 625 Verbindungen; sie ist kein belegtes Anbieterlimit und wird nicht so dargestellt.

### ANN-092 — Das Zugriffsprotokoll ist nicht Teil der Auskunft nach Art. 15

Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: mit dem DSFA-Paket (G14), zusammen mit der Frage nach den Namen der Beschäftigten · **LOG-EPIC-001:** angepasst – die Auskunft nennt nur noch die Aktionen aus ADR-010 Fassung 3 und keine Abweisungen.

**Annahme.** Die Kopie der Akte nach Art. 15 Abs. 3 DSGVO enthält **keine Auditzeilen**. Verlangt die betroffene Person ausdrücklich Auskunft über die Zugriffe auf ihre Akte, wird sie erteilt — von Hand aus dem Auditlog und ohne die Namen der Beschäftigten, solange kein besonderer Grund dagegen spricht.

**Begründung.** Jede Auditzeile ist zwei Datensätze zugleich: einer über die Patientin und einer über die zugreifende beschäftigte Person. Art. 15 Abs. 4 DSGVO nimmt die Rechte anderer aus, §20 `PROJECT_PRINCIPLES.md` verbietet jede Auswertung an Mitarbeitenden, und ADR-010 Punkt 13 hält das Lesen des Auditlogs deshalb schon intern bei `owner`. Ein automatischer Export würde diese Beschränkung über den Umweg der Auskunft aufheben — bei einem Anspruch, den niemand geltend gemacht hat. Der umgekehrte Fehler wäre, die Auskunft ganz zu verweigern: Wer bei wem in Behandlung ist, steht auch im Protokoll, und ein Auskunftsanspruch dazu ist nicht fernliegend. Unsicher ist die Mitte: ob die Namen der Beschäftigten herausgehören. Dazu gibt es keine gefestigte Linie; die Zurückhaltung ist die vorsichtige Seite und rücknehmbar.

**Anker.** Das Feld `nicht_enthalten` in `public.export_patient_record`, `supabase/migrations/20260922100000_betroffenenrechte.sql`; der Test dazu in `supabase/tests/betroffenenrechte.test.ts`.

**Änderungspfad.** Soll das Protokoll mitkommen: einen Abschnitt `audit_log` in die Funktion aufnehmen, Beschriftung in `kategorien.ts` ergänzen, Hinweis streichen · Aufwand `klein`. Soll die Auskunft dazu ganz entfallen: Hinweis umformulieren, Verfahren nachziehen · Aufwand `klein`. **Abnahme (Jannes, 2026-10-02):** geändert: Zugriffsdaten nicht pauschal ausschließen — bei umfassender Auskunft auch Datum und Zweck der Zugriffe; Beschäftigtennamen grundsätzlich weglassen, begründete Ausnahmen prüfen (BEF-107). **Fassung 2 (ABN-017, 2026-10-02, BEF-107):** Die Auskunft enthält den Abschnitt `access_log`: Zeitpunkt, Aktion, Gegenstand, Ergebnis und Art des Handelnden (Praxis, System, Person selbst, Vertretung) jedes Zugriffs auf die Akte, ohne Kennung und Namen der Beschäftigten; den Zweck in Worten setzt die Oberfläche aus dem Auditkatalog (`mitZweck`). Namen nur auf begründetes Verlangen nach Prüfung im Einzelfall, weiter von Hand. `supabase/migrations/20261003104000_abn_017_access_request_completeness.sql`. Wiedervorlage B2.

### ANN-093 — Einwilligung nur für zwei Zwecke; Papier bleibt Papier

Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2), zusammen mit dem Wortlaut der Datenschutzinformation und der Einwilligung im Training

**Annahme.** Die Praxis holt eine Einwilligung für genau zwei Zwecke ein: **Kontakt per unverschlüsselter E-Mail** (`email_contact`) und **Bericht an die verordnende Praxis** (`prescriber_report`, Schweigepflichtentbindung). Die Behandlung selbst braucht keine. Datenschutzinformation und Behandlungsvertrag bleiben Papier; die Akte vermerkt Datum und bei der Information die Fassung. Vermerke werden nie geändert, ein Widerruf ist eine eigene Zeile, und der Stand eines Zwecks ist seine jüngste Eingabe.

**Begründung.** Grundlage der Behandlung sind der Vertrag (§§ 630a ff. BGB) und Art. 9 Abs. 2 lit. h DSGVO mit § 22 Abs. 1 Nr. 1 lit. b BDSG; eine Einwilligung daneben wäre wegen ihrer jederzeitigen Widerrufbarkeit (Art. 7 Abs. 3 DSGVO) die schwächere Grundlage. Die E-Mail setzt nach ANN-041 den ausdrücklichen Wunsch voraus, der Arztbericht berührt § 203 StGB. Nachweis nach Art. 7 Abs. 1 DSGVO verlangt, dass die Erteilung den Widerruf überlebt. Unsicher: ob die Prüfung weitere Zwecke sieht (Fotos zur Verlaufsdokumentation, Angehörige), und ob die Einwilligung vor dem Mailweg technisch geprüft werden soll — heute zeigt die Anwendung nur den Stand.

*Vermerk 2026-09-26 (DOK-006b):* Dritter Zweck **Fotos im Behandlungsverlauf** (`patient_photos`) — dort ist die Einwilligung die Grundlage selbst (ADR-017 Punkt 35); dazu die Ablehnung als eigener Vermerk (ANN-127).

**Anker.** Constraint `purpose` und `public.record_patient_privacy_entry()` in `supabase/migrations/20260922130000_datenschutzvermerke.sql`, zuletzt geändert in `20260926150000_dok_006b_patient_photos.sql`; `EINWILLIGUNGSZWECKE` in `src/features/datenschutz/vermerke.ts`; Texte in `src/features/datenschutz/patienteninformation.ts`.

**Änderungspfad.** Zweck ergänzen oder streichen: ein Wert in Constraint, Konstante und Beschriftung, ein Satz in der Datenschutzinformation · Aufwand `klein`. Einwilligung vor dem Mailweg prüfen: Abfrage des Stands in `AppointmentSlipPage.tsx` vor der Übergabe · Aufwand `mittel`. Unterschrift in der Anwendung: eigenes Epic · Aufwand `groß`. **Abnahme (Jannes, 2026-10-02):** bestätigt, mit den Patientenfotos als drittem Zweck (ANN-127).

### ANN-094 — Ein benannter Schalter öffnet den Kartendienst für eine Umgebung

Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Gate aus ADR-019 Punkt 9 vor dem ersten Lauf mit echten Adressen; Go-live-Vorbedingungen (ADR-007 Punkt 5)

**Annahme.** Die Edge Function `location-provider` spricht einen echten Anbieter nur an, wenn das Secret `LOCATION_DATA_GATE` den Wert `synthetic` (Umgebung mit ausschließlich synthetischen Daten, §3.1) oder `released` (Gate aus ADR-019 Punkt 9 bestanden) trägt. Fehlt es oder ist es falsch geschrieben, antwortet sie `not_configured` — auch mit gültigem Schlüssel. `released` in einer Umgebung mit echten Daten zu setzen ist eine Go-live-Vorbedingung, kein Konfigurationsdetail; die Nachbildung braucht den Schalter nicht, weil sie nichts hinausschickt.

**Begründung.** ADR-019 Punkt 25 (Fassung 4) verlangt einen „eigenen, benannten Schritt", der vor dem ersten Lauf mit echten Patientenadressen zu bleibt; ab MAP-006 trägt die Function erstmals Adressen (Geocoding). Ein Schalter, der von selbst zu ist, macht das Vergessen harmlos: Eine Produktivumgebung mit Schlüssel, aber ohne bewusste Freigabe, schickt nichts. Die Function kann synthetische und echte Adressen nicht unterscheiden; der Schalter beschreibt deshalb die Umgebung, nicht die Anfrage. Unsicher: ob die Prüfung eine technische statt einer organisatorischen Sperre gegen `synthetic` in der Produktion verlangt.

**Anker.** `DATENFREIGABEN` und `waehleAdapter` in `supabase/functions/location-provider/auswahl.ts`; Tests in `auswahl.test.ts`; Go-live-Vorbedingung in `docs/datenschutz/kartendienst.md`.

**Änderungspfad.** Anderer Name oder weitere Stufe: eine Konstante und ihre Tests · Aufwand `klein`. Technische Sperre gegen `synthetic` in der Produktion: Umgebungskennung als zweites Secret und Vergleich in derselben Funktion · Aufwand `klein`. **Abnahme (Jannes, 2026-10-02):** bestätigt mit Ergänzung: `synthetic` ist in der Produktivumgebung technisch ausgeschlossen; die Anbieterprüfung deckt auch die direkt geladenen Kartenkacheln ab (BEF-109). **Fassung 3 (ABN-028, 2026-10-02, BEF-109, ADR-019 Punkte 35 und 36):** Neben dem Schalter steht das Secret `APP_ENVIRONMENT` (`development`, `test`, `production`); fehlt es oder ist es unbekannt, gilt `production`. Dort ist nur `released` offen: `synthetic` und `mock` antworten `not_configured`, das Log trägt `gate_rejected` ohne Anfrage und Koordinate. Derselbe Schalter gibt die Kacheln frei: Die Karte fragt die Function (`aufgabe: 'status'`) und lädt Kacheln nur bei `mapReleased: true`, sonst steht „Karte nicht freigegeben“. Lokal und in der Test-Umgebung muss `APP_ENVIRONMENT` gesetzt sein. Anker: `richteEin` und `umgebungsart` in `supabase/functions/location-provider/auswahl.ts`; `useKartenfreigabe` in `src/lib/location/kartenfreigabe.ts`.

### ANN-095 — Verortet wird auf Handlung, und die Koordinate reist in künftige Hausbesuche

Praxisprozess · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Jannes nach der Sichtung Kartendienst (reicht ein Tipp nach dem Speichern, oder soll das Speichern selbst verorten?)

**Annahme.** Geocodiert wird nicht im Speichervorgang selbst, sondern mit „Adresse verorten" direkt danach in den Stammdaten — solange die Adresse keine Koordinate hat. Ein hausnummergenauer Treffer des Anbieters wird ohne Rückfrage gespeichert, jeder andere und jeder der Nachbildung erst nach „Treffer übernehmen". Die gespeicherte Koordinate wird in **künftige** Hausbesuche übernommen, deren Snapshot-Adresse genau dieser Adresse entspricht; vergangene Termine behalten, was sie hatten.

**Begründung.** ADR-019 Punkt 14 und ANN-016 verlangen Geocoding nur bei Anlage oder Änderung der Adresse; ein Knopf, der nur ohne Koordinate erscheint, erfüllt das und hält die Übermittlung an eine sichtbare Handlung (§20-Logik des Handoffs, Punkt 20). Ein automatischer Aufruf beim Speichern hätte einen zweiten Fehlerpfad im Stammdatenformular gebraucht. Ohne Übertragung stünden Hausbesuche, die vor dem Verorten angelegt wurden, ohne Stopp auf der Karte; ANN-003 bleibt unberührt, weil nur Termine mit derselben Adresse und in der Zukunft betroffen sind.

**Anker.** `src/features/patients/AdresseVerorten.tsx`; die Übertragung im zweiten `update` von `set_patient_address_coordinate`, `supabase/migrations/20260925100000_map_006a_coordinates.sql`; Test „überträgt die Koordinate in künftige Hausbesuche" in `supabase/tests/address-coordinates.test.ts`.

**Änderungspfad.** Verorten im Speichervorgang: Aufruf nach `updatePatient` in `EditPatientPage.tsx` · Aufwand `klein`. Keine Übertragung in Termine: das zweite `update` entfällt · Aufwand `klein`. **Abnahme (Jannes, 2026-10-02):** präzisiert: automatisch nur bei eindeutigem Treffer zur vollständigen Adresse; bei Adressänderung wird die alte Koordinate verworfen; historische Termine behalten ihren Stand (BEF-109). **Fassung 2 (ABN-028, 2026-10-02, BEF-109, ADR-019 Punkt 37):** Ohne Rückfrage gespeichert wird nur ein **eindeutiger** Treffer (`unique`): Die Anfrage trug Straße, Hausnummer, PLZ und Ort, der Anbieter fand genau einen Treffer, und der ist hausnummergenau. Sonst zeigt die Anwendung den ersten Treffer mit der Zahl aller („Der Kartendienst kennt 2 Treffer …“) und verlangt „Treffer übernehmen“; das Protokoll vermerkt die Bestätigung auch bei Hausnummergenauigkeit. Eine Auswahl unter mehreren Treffern gibt es nicht; stimmt der erste nicht, wird die Anschrift genauer erfasst. Anker: `geocodingAuswerten` in `supabase/functions/location-provider/ptv.ts`; `brauchtBestaetigung`, `trefferanzahlText` in `src/lib/location/geocode.ts`. Änderungspfad: Trefferliste zur Auswahl · Aufwand `klein` bis `mittel` (Vertrag und zwei Oberflächen).

### ANN-096 — Auf der Karte nur Nummern, der Startort gilt für den Seitenbesuch

Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Jannes nach der Sichtung Kartendienst (reicht die Nummer auf dem Rad?); Datenschutzprüfung zusammen mit B2

**Annahme.** Die Marker der Tagesroute tragen **nur eine Nummer** (Start: „S"), kein Vornamen-Kürzel; Name und Anschrift stehen in der Tourenliste daneben, die dieselbe Nummer führt. Startort ist der verortete Standort der Praxis oder der erste Besuch; die Wahl gilt für den Besuch der Seite und wird nicht gespeichert. Einen persönlichen Startort (Wohnung) gibt es nicht.

**Begründung.** ADR-019 Punkt 2 und MAP-LOOPS erlauben „Vorname-Kürzel oder Nummer — nie Vollname". Die Nummer ist die sparsamere Wahl (Art. 5 Abs. 1 lit. c DSGVO): Eine Karte ist auf dem Lenker für Umstehende lesbar, und schon ein Kürzel mit Straße daneben identifiziert in einer kleinen Stadt; die Liste trägt den Namen ohnehin. Ein gespeicherter persönlicher Startort wäre eine Beschäftigtenadresse beim Kartendienst und eine Form der Standortangabe über Mitarbeitende (§20) — das braucht eine eigene Prüfung und ist nicht gebaut.

**Anker.** `kartenmarker` und `START_LABEL` in `src/features/tours/tagesroute.ts`; Test „trägt nur Koordinate und Nummer" in `tagesroute.test.ts`; Startwahl als Zustand der Seite in `src/features/tours/TourenPage.tsx`.

**Änderungspfad.** Kürzel statt Nummer: `kartenmarker` bekommt den Termin mit, Test anpassen · Aufwand `klein`. Persönlicher Startort: eigene Prüfung nach §20, Spalte an `staff_private_details` mit Koordinate, Schreiber nur die Person selbst · Aufwand `mittel`. **Abnahme (Jannes, 2026-10-02):** bestätigt.

### ANN-097 — Fahrpuffer: Fahrzeit live, Rundung im Server, Warnung statt Sperre

Praxisprozess · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Jannes nach den ersten Tagen mit echten Fahrzeiten (E12 Punkt 4 „Warnung oder Sperre"); E12 Punkt 3a in `OPEN_DECISIONS.md`

**Annahme.** Die Fahrzeit zwischen zwei Terminen wird im Moment der Prüfung über die eigene Function beim Kartendienst abgerufen und **nicht gespeichert** (E12 Punkt 3a: Live-Abruf). Der Browser reicht sie an `check_travel_buffers` weiter; dort — und nur dort — gilt die Rundungsregel aus §8.1 (`app.earliest_follow_up_start`). Eine Unterschreitung erscheint als **Warnung** in Tour und Kalender-Tagesansicht mit Personenfilter; gesperrt wird nichts, und das Anlegen oder Verschieben eines Termins prüft keinen Fahrpuffer.

**Begründung.** ADR-019 Punkt 16 verbietet die Speicherung von Fahrzeiten, §8.1 verlangt die serverseitige Rundung, sobald eine Fahrzeit vorliegt; die Datenbank kann den Dienst nicht selbst fragen (ANN-017). Beides zusammen geht nur mit einer hereingereichten Fahrzeit — und die darf nur dann vom Client kommen, wenn aus ihr nichts gesperrt oder freigegeben wird. E12 Punkt 4 hat Jannes am 2026-09-12 bis zu echten Zahlen offengelassen; die Roadmap nennt „Warnung bei Unterschreitung". Unsicher: ob eine Sperre später gewünscht ist — dann muss die Fahrzeit serverseitig entstehen.

**Anker.** `app.earliest_follow_up_start` und `public.check_travel_buffers` in `supabase/migrations/20260925120000_map_006c_travel_buffer.sql`; Testfall 09:05–10:05 plus 12 Minuten = 10:20 in `supabase/tests/travel-buffer.test.ts`; Anzeige in `src/features/tours/Fahrten.tsx` und `FahrpufferHinweis.tsx`.

**Änderungspfad.** Sperre statt Warnung: Fahrzeit serverseitig über einen Aufruf der Function aus einem Hintergrundpfad, Prüfung in `create_appointment`/`update_appointment` · Aufwand `mittel`. Kurze Speicherung statt Live-Abruf: Tabelle mit Frist „Routing-Rohdaten" (ADR-008, 30 Tage) · Aufwand `mittel`. **Abnahme (Jannes, 2026-10-02):** Warnung statt Sperre bestätigt; Luftlinien- oder Ersatzschätzungen des Anbieters werden gekennzeichnet oder als „Fahrzeit nicht verfügbar“ behandelt (BEF-109). **Fassung 2 (ABN-028, 2026-10-02, BEF-109, ADR-019 Punkt 38):** Eine Ersatzschätzung ist keine Fahrzeit. Trägt eine Matrixantwort ein Schätzungskennzeichen (`estimatedByDirectDistance`, `isEstimated`, `estimated`, `directDistance`) oder je Relation irgendein anderes gesetztes Kennzeichen, wird die Relation `null` (Fahrzeit und Strecke); eine geschätzte Route endet als `not_found`. Die Oberfläche sagt „Fahrzeit nicht verfügbar – nicht geprüft“, der Fahrpuffer gilt dort als ungeprüft. Welches Kennzeichen PTV tatsächlich trägt, ist nicht belegt (Gate-Liste Punkt 11). Anker: `SCHAETZUNG`, `geschaetzteRelationen`, `routeGeschaetzt` in `supabase/functions/location-provider/ptv.ts`. **Wiedervorlage (Jannes, 2026-10-05):** Die Fahrzeiten des Dienstes sind zu kurz (rund 23 statt 15 km/h); jede Fahrzeit wird vor Anzeige und Prüfung mit dem Fahrzeitfaktor der Praxis multipliziert (ANN-237, Voreinstellung 1,5). Warnung statt Sperre bleibt.

### ANN-098 — Fehlt ein gewerteter Wert, rechnet der Kern keinen

Praxisprozess · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: D6 im FRB-Plan, je Score mit P4 und P5

**Annahme.** Fehlt die Antwort auf ein gewertetes Item, gibt der Rechenkern für die betroffene Skala **keinen Wert** aus und nennt die fehlenden Items. Er zählt nichts als 0, rechnet nichts hoch und bildet keinen Mittelwert über das Beantwortete. Die einzige Ausnahme ist eine Formel, die sie selbst ausspricht: `summe_prozent` mit `aus_gewerteten_items` (FAAM, „nicht zutreffend" verkleinert das Maximum). Gerechnet wird ohne Rundung; gerundet wird bei der Anzeige.

**Begründung.** Das Inventar sagt für ODI, RMDQ, NDI, FABQ, PCS und weitere „im PDF nicht geregelt" (D6); der Arbeitsauftrag §5 Punkt 3 und `quellen/README.md` Regel 2 verbieten, eine Lücke mit Plausiblem zu füllen. Ein fehlender Wert ist sichtbar und harmlos, ein erfundener steht im Verlauf und behauptet Vergleichbarkeit. ADR-006 Punkt 2 deckt nur die Rechnung nach **veröffentlichter** Vorschrift.

**Anker.** `wende()` in `src/features/assessments/rechnen.ts`; Testfall „gibt keinen Wert, solange ein gewertetes Item fehlt" in `rechnen.test.ts`.

**Änderungspfad.** Je Score eine eigene Missing-Value-Regel, sobald D6 für ihn entschieden ist: maschinenlesbares Feld neben `missing_value_regel`, Auswertung in `wende()`, Referenzfall mit fehlender Antwort · Aufwand `klein`. **Abnahme (Jannes, 2026-10-02):** bestätigt: keine eigenmächtige Ersetzung durch 0 oder Hochrechnung; veröffentlichte Regeln des Instruments, auch zu fehlenden Antworten, haben Vorrang; ohne belegte Regel bleibt die Skala ohne Ergebnis und die fehlenden Items werden genannt.

### ANN-099 — Ohne Vorlage im Repository bleibt ein Instrument inaktiv

Technik · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: mit FRB-EPIC-004 (Veränderungsfrage und NRS freigegeben, PSFS gestrichen — Stand 2026-09-29)

**Annahme.** Ein Instrument ohne Vorlage in `quellen/scores/pdf/` darf in der Bibliothek stehen, aber nicht aktiv sein: `quelle.datei` fehlt, `quelle.literatur` nennt die Veröffentlichung, der Wortlaut gilt als vorläufig und die Version bleibt `0.x`. NRS, PSFS und die globale Veränderungsfrage liegen so vor — Wortlaut nach der gängigen deutschen Form, PSFS mit **drei** Aktivitäten (die Originalfassung erlaubt bis zu fünf), Veränderungsfrage **siebenstufig** von −3 bis +3. `prioritaet` steht auf `a`, weil die Roadmap die drei zuerst nennt; im Inventar der 18 kommen sie nicht vor.

**Begründung.** `quellen/README.md` Regel 1 und der FRB-Plan §7 Punkt 2 verlangen einen Wortlaut, der gegen eine Vorlage zu halten ist, und verbieten die Rekonstruktion aus dem Gedächtnis. Aus der Cloud-Umgebung waren die deutschen Fassungen (Deutsche Schmerzgesellschaft, physiopraxis) nicht abrufbar. Bauen wartet nicht (§15.2): Die Struktur, der Rechenkern und die Referenzfälle hängen nicht am Wortlaut, das Erheben schon — und das beginnt erst mit FRB-EPIC-002. Die Kopplung steht im Schema neben der Lizenzkopplung (ANN-086), nicht in der Oberfläche. Unsicher: welche Fassung der PSFS (drei oder fünf Aktivitäten) und der Veränderungsfrage (sieben oder mehr Stufen) die Praxis tatsächlich nutzt.

**Stand 2026-09-28 (Jannes).** **PSFS wird gestrichen** und nicht integriert. Für die **Veränderungsfrage** gilt der Wortlaut oben — eine Frage, sieben Stufen von „sehr viel schlechter“ bis „sehr viel besser“ — als **Praxisvorgabe**, freigegeben von Jannes; eine Vorlage als PDF ist nicht nötig, weil es keine einheitliche deutsche Fassung gibt und das Instrument weder Normwerte noch Cut-offs trägt. Für die NRS gibt Jannes die Frage **„Heutiges Befinden (im Bezug auf die typischen Beschwerden)“** vor (2026-09-28), Skala 0 bis 10 mit **0 = keine Beschwerden** und **10 = stärkste vorstellbare Beschwerden** (freigegeben 2026-09-29); damit ist der Wortlaut beider Instrumente Praxisvorgabe. Umgesetzt wird beides im ersten Schritt von FRB-EPIC-004 (Freigabe als Quelldatei unter `quellen/scores/`, Version `1.0.0`, `aktiv: true`; `psfs.json` entfällt).

**Anker.** Die Prüfung `aktiv` ohne `quelle.datei` in `scoreDefinitionSchema`, `src/features/assessments/schema.ts`; die drei Dateien unter `src/features/assessments/definitionen/scores/`.

**Änderungspfad.** Bogen in `quellen/scores/pdf/` ablegen, Wortlaut der Datei gegen ihn halten, `quelle.datei` setzen, Version `1.0.0`, `aktiv: true` · Aufwand `klein` je Instrument. Andere Stufenzahl oder fünf Aktivitäten: Items ergänzen, Referenzfall anpassen · Aufwand `klein`. **Abnahme (Jannes, 2026-10-02):** Stand übernommen: PSFS entfällt; NRS und Veränderungsfrage werden mit Jannes’ freigegebenem Wortlaut als **Praxisvorgaben** umgesetzt (FRB-EPIC-004); die Frage zu „Beschwerden“ wird nicht als unveränderte, validierte Schmerz-NRS bezeichnet. Die Definitionsdateien stehen noch auf dem alten Stand und werden in FRB-EPIC-004 nachgezogen.

### ANN-100 — Die Test-Umgebung wird nur auf Knopfdruck neu aufgesetzt, ihr Zugang kommt aus einem Secret

Technik · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: G5 (OPS-002), wenn die Produktion eine eigene Pipeline bekommt

**Annahme.** Die Test-Umgebung (OPS-002a) bekommt die Migrationen bei **jedem** Lauf nach grüner CI auf `main`, den Seed samt Praxiswoche aber **nur auf Knopfdruck** (Handstart mit „neu aufsetzen"), weil der Seed alles löscht. Seed, Praxiswoche und Zugang laufen in **einer** Transaktion; darin wird das Entwicklungskennwort aus `supabase/seed.sql` für alle Seed-Konten durch das Secret `TESTENV_LOGIN_PASSWORD` (mindestens 12 Zeichen) ersetzt, und fehlt das Secret, bekommt jedes Konto ein eigenes Zufallskennwort — gesperrt statt offen. Die Praxiswoche sind die Werktage von vorgestern bis in vier Tagen, heute ausgespart. Neu aufgesetzt wird nur eine leere Datenbank (sie bekommt dabei die Kennung `testumgebung.kennung`) oder eine, die diese Kennung schon trägt.

**Begründung.** Die Test-Umgebung ist öffentlich erreichbar; ein Kennwort aus dem Repository wäre dort ein offener Zugang, auch zu synthetischen Daten (§3.3, Hosting-Vorlage „Zugang geschützt"). Jannes hat am 2026-09-25 Option 1a gewählt (ein Secret). Ein Seed bei jedem Merge würde alles verwerfen, was Jannes am Handy anlegt, und die Sichtung zerstören. Die Kalenderwoche wäre an einem Freitag ganz Vergangenheit, deshalb ein Fenster um heute.

**Anker.** `supabase/testumgebung/zugang.sql` (Kennwort), `supabase/testumgebung/kennung.sql` (nur die Test-Umgebung), `supabase/testumgebung/neu-aufsetzen.psql` (eine Transaktion, Reihenfolge), Eingabe `neu_aufsetzen` in `.github/workflows/test-umgebung.yml`; Test `supabase/tests/testumgebung.test.ts`.

**Änderungspfad.** Seed bei jedem Lauf: die Bedingung im Workflow streichen · Aufwand `klein`. Eigene Konten statt Seed-Konten: `zugang.sql` auf eine Liste von Adressen umstellen · Aufwand `klein`. Anderes Fenster: `praxiswoche.sql` · Aufwand `klein`.

**Abnahme (Jannes, 2026-10-02).** Bestätigt: Migrationen automatisch nach grüner CI; Neuaufsetzen mit Seed und Praxiswoche ausschließlich von Hand.

### ANN-101 — Die Test-Umgebung schützt sich mit Kopfzeilen, CSP und einer optionalen zweiten Tür per `.htaccess`

Technik · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: vor echten Daten (G5), mit der vollständigen Prüfung des Hosting-Anbieters

**Annahme.** Die ausgelieferte Oberfläche bekommt über eine erzeugte `.htaccess`: Umleitung aller Pfade ohne Datei auf `index.html`, `X-Robots-Tag: noindex` samt `robots.txt`, `nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, HSTS und eine Content-Security-Policy, die Skripte nur vom eigenen Ursprung und Verbindungen nur zum Supabase-Projekt erlaubt (`style-src 'unsafe-inline'` und `blob:`-Worker für MapLibre). Die zweite Tür ist HTTP-Basic-Auth mit Benutzer `praxis` und dem Secret `TESTENV_TUER_PASSWORD`, als bcrypt neben dem ausgelieferten Ordner `html/` abgelegt (in `/var/www/virtual/<konto>/praxis-test/`, denn in den Heimatordner kommt der Webserver nicht); ohne Secret gibt es keine Tür. Ob Uberspace 8 die `.htaccess` auswertet, prüft der Workflow nach jedem Upload selbst.

**Begründung.** Die Hosting-Vorlage verlangt `noindex`, Sicherheitskopfzeilen und die zweite Tür, nennt die Tür aber ausdrücklich „erwünscht, nicht tragend": Die Daten schützen Supabase Auth und RLS. Jannes hat am 2026-09-25 Option 2a gewählt. Die CSP ist an der gebauten Anwendung geprüft (Anmeldeseite bei 1280 und 375 px ohne Verstoß); die Karte hinter der Anmeldung nicht, und ein Kachelschlüssel ist in der Test-Umgebung nicht gesetzt. Am Konto belegt (2026-09-25): Uberspace 8 wertet die `.htaccess` mit Apache aus; der erste Lauf scheiterte nur an der Kennwortdatei im Heimatordner (AH01620).

**Anker.** `htaccess()` und `inhaltsrichtlinie()` in `scripts/testumgebung.mjs`; Test `scripts/testumgebung.test.mjs`; Schritt „Zweite Tuer" in `.github/workflows/test-umgebung.yml`.

**Änderungspfad.** Wertet Uberspace die `.htaccess` nicht aus: Kopfzeilen und Umleitung über die Webserver-Einstellungen von Uberspace (`uberspace web header`, falls vorhanden) oder Anbieterwechsel nach `hosting-optionen.md` Option 2 · Aufwand `mittel`. Kachelschlüssel in der Test-Umgebung: Kachelanbieter in `inhaltsrichtlinie()` · Aufwand `klein`.

**Abnahme (Jannes, 2026-10-02).** Bestätigt. Anmeldung und Datenbankberechtigungen sind die verpflichtende Sicherung; die zusätzliche Passwort-Tür bleibt optional.

### ANN-102 — Der Anamnesebogen V8 wird ohne Punktwerte übertragen; eine Erhebung speichert die Kennung der Option

Technik · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: mit P4 (erster gewerteter Score, der erhoben wird)

**Annahme.** Optionen tragen eine sprechende Kennung (`nachtschmerzen`); eine Option ohne Punktwert muss eine haben, eine gewertete ohne Kennung wird mit ihrem Punktwert gespeichert (`optionKennung`). Der Bogen wird mit den 39 nummerierten Fragen übertragen, 12a/b und die drei Felder zu Frage 26 als eigene Items unter derselben Nummer; „nein" ist in einer Mehrfachauswahl eine exklusive Option, „Sonstiges?", „andere Erkrankung?", „anderes Ereignis?", „andere Medikamente?" und „Anderes?" tragen eine eigene Angabe. Aus dem Kopf kommen Beruf und Sport/Hobby mit; Name und Alter stehen in der Akte, Datum ist das Erhebungsdatum, die Unterschrift bleibt Papier. „Anmerkungen Therapeut:" ist ein Freitext mit `ausgefuellt_von: therapeut`.

**Begründung.** Das Inventar sagt „Kein Scoring - reine Informationserfassung"; ein erfundener Punktwert wäre die Rekonstruktion, die der Arbeitsauftrag §5 Punkt 2 verbietet. Eine Position in der Liste statt einer Kennung wäre in der Kopie nach Art. 15 unlesbar. Name und Alter doppelt zu erheben ergäbe eine zweite Quelle, die abweichen kann (Art. 5 Abs. 1 lit. c und d DSGVO).

**Anker.** `optionSchema` und `optionKennung` in `src/features/assessments/schema.ts`; Definition `src/features/assessments/definitionen/scores/anamnese_v8.json`; Tests `anamnese.test.ts`, Wortlaut gegen den Extrakt in `definitionen.test.ts`.

**Änderungspfad.** Andere Aufteilung des Bogens: neue Version der Definition (`1.1.0`), alte Erhebungen behalten ihre `definition_version` · Aufwand `klein`. Kennung statt Punktwert auch an gewerteten Scores: Kennungen in den Dateien nachtragen · Aufwand `klein`. **Abnahme (Jannes, 2026-10-02):** bestätigt.

### ANN-103 — Ein Fragebogen ist Entwurf oder abgeschlossen; korrigiert wird als neue Erhebung, erheben nur die behandelnden Rollen

Praxisprozess · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: nach vier Wochen Betrieb mit echten Anamnesen

**Annahme.** Eine Erhebung hat zwei Zustände: `entwurf` (frei änderbar, darf verworfen werden) und `abgeschlossen` (unveränderlich, auch gegen direkten Zugriff durch einen Trigger). Eine Korrektur ist eine **neue** Erhebung mit Verweis auf die alte und einer Begründung von 3 bis 500 Zeichen; eine Erhebung wird höchstens einmal ersetzt. Es gibt **keine** automatische Finalisierung wie in ADR-016 Punkt 7. Erheben, abschließen, verwerfen und korrigieren dürfen `owner`, `therapist` und `team_lead`; lesen alle vier Praxisrollen, je gelieferter Erhebung protokolliert.

**Begründung.** §7 verlangt, dass abgeschlossene Fragebögen in der beantworteten Version erhalten bleiben; ADR-016 Punkt 5 und 6 geben das Muster „nie überschreiben, Korrektur mit Grund" vor, das hier ohne Versionstabelle auskommt, weil ein Bogen als Ganzes ersetzt wird. Eine automatische Finalisierung schützt bei der Behandlungsdokumentation vor einem fehlenden Nachweis (§630f); ein halb ausgefüllter Bogen, der sich selbst abschließt, wäre dagegen eine Aussage der Person, die sie nicht vollständig gemacht hat. Office liest nach ADR-004 Fassung 2, schreibt aber keine klinischen Inhalte.

**Anker.** `supabase/migrations/20260926100000_frb_002b_questionnaire_responses.sql` (`app.guard_questionnaire_response`, `app.can_write_questionnaire_response`, `save_questionnaire_response`); `canWriteQuestionnaire` in `src/features/session/types.ts`; Tests `supabase/tests/questionnaire-responses.test.ts`.

**Änderungspfad.** Automatische Finalisierung: Frist und Lauf nach dem Muster von DOK-002 ergänzen · Aufwand `mittel`. Office darf erfassen (Papierbogen abtippen): Rolle in beiden Funktionen ergänzen · Aufwand `klein`. **Abnahme (Jannes, 2026-10-02):** bestätigt; die Korrektur bleibt mit der ursprünglichen Erhebung verknüpft, Erhebungsdatum und Korrekturzeitpunkt getrennt, im Verlauf keine zusätzliche Messung (BEF-101). **Fassung 2 (ABN-014, 2026-10-02, BEF-101 Punkt 2):** Eine Korrektur behält den Erhebungstag der korrigierten Erhebung — der Server weist einen anderen ab, auch am Entwurf der Korrektur; die Erhebungsseite zeigt ihn als Text. Der Korrekturzeitpunkt ist `created_at`, die Akte nennt „Korrektur vom …“. Im Verlauf steht die Korrektur am Erhebungstag, nicht als zusätzliche Messung.

### ANN-104 — Hervorgehoben werden acht Fragen des Anamnesebogens nach IFOMPT, je Frage und ohne Verknüpfung

Recht · entschieden (Jannes) · 2026-09-26 · Jannes (Regeln fachlich bestätigt) · — · Wiedervorlage: mit der externen Prüfung nach ADR-006 Punkt 7 (B1)

**Annahme.** Hervorgehoben wird, wenn angekreuzt ist: Frage 4 Nacht- oder Ruheschmerzen, Frage 23 jede Angabe, Frage 24 Blasenschwäche oder belastungsabhängige Brustschmerzen, Frage 25 jede Angabe, Frage 26 „ja", Frage 28 Unfall/Sturz/Verletzung, Frage 29 Schwangerschaft, Frage 30 Kortison oder Blutverdünner. Gezeigt werden die Angabe wörtlich, Frage und Datum und daneben die Regel mit Quelle — kein Text zur Bedeutung, keine Farbe als Ampel, keine Zählung, keine Verknüpfung mehrerer Angaben wie im Beispiel von §7.1, nur am geltenden, nicht am ersetzten Bogen.

**Begründung.** §7.1 erlaubt Hervorhebung nach transparenten Regeln und verbietet Score, Risikoklasse und Handlungsempfehlung; ADR-006 Punkt 11 fasst auch Farbe und Symbol als Aussage. Die Auswahl folgt den Rahmenwerken der IFOMPT (Finucane et al. 2020 für die Wirbelsäule, Rushton et al. 2023 für die Halsgefäße) und Goodman/Heick/Lazaro 2018; sie ist eine fachliche Auswahl, die Jannes bestätigen sollte. Das Beispiel „Tumoranamnese und Gewichtsverlust" aus §7.1 wäre eine Verknüpfung — konservativ nach ADR-006 Punkt 13 nicht gebaut, bis die Prüfung sie freigibt.

**Anker.** `hervorhebungSchema` in `src/features/assessments/schema.ts`; `hervorhebungen` im Anamnesebogen `src/features/assessments/definitionen/scores/anamnese_v8.json`; `src/features/assessments/hervorhebung.ts`; Tests `hervorhebung.test.tsx`.

**Änderungspfad.** Andere Fragen oder Optionen: Liste `hervorhebungen` in der Definition, neue Version · Aufwand `klein`. Verknüpfte Regeln nach Freigabe: Regel um eine Liste von Bedingungen erweitern · Aufwand `mittel`.

### ANN-105 — Die Antworten prüft die Anwendung gegen die Definition, der Server nur ihre Form

Technik · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: mit dem Patientenlink (POR-EPIC-002), bevor Menschen außerhalb der Praxis schreiben

**Annahme.** Der Server prüft an einer Erhebung Kennung und Version in ihrer Form, dass die Antworten ein Objekt mit Kennungen als Schlüsseln und Objekten als Werten sind, und eine Obergrenze von 64 KiB. Ob eine Antwort zur Frage passt (Option vorhanden, „nein" allein, Skala im Bereich), prüft `antwortenSchema` in der Anwendung gegen die Definitionsdatei. Angezeigt wird eine ältere Erhebung mit der Definition des Releases; eine abweichende Version wird an der Erhebung genannt.

**Begründung.** Die Definitionen liegen als Dateien im Release (ANN-083) und nicht in der Datenbank; eine zweite Fassung in SQL wäre eine zweite Quelle, die abweichen kann. Schreiben dürfen heute nur angemeldete behandelnde Rollen, für die die Anwendung vertrauenswürdig ist; ein Fehler schadet der eigenen Akte, nicht einer fremden. Kennungen sind unveränderlich (Arbeitsauftrag §1), deshalb bleibt eine alte Erhebung mit der neueren Definition lesbar.

**Anker.** `app.assert_questionnaire_answers` in `supabase/migrations/20260926100000_frb_002b_questionnaire_responses.sql`; `antwortenSchema` in `src/features/assessments/antworten.ts`.

**Änderungspfad.** Prüfung auch auf dem Server (spätestens für den Patientenlink): die Definition beim Build als Tabelle oder JSON-Schema in eine Migration erzeugen und in `save_questionnaire_response` prüfen · Aufwand `mittel`. Frühere Fassungen der Definition aufbewahren: Datei je Version unter `definitionen/` · Aufwand `klein`. **Abnahme (Jannes, 2026-10-02):** so **nicht** bestätigt: Der Server prüft auch Instrument, Version, Optionen, Wertebereiche und unzulässige Kombinationen, aus denselben Definitionsdateien; historische Erhebungen werden mit ihrer ursprünglichen Definition angezeigt und ausgewertet (BEF-101). Bis zur Umsetzung gilt die bisherige Prüfung. **Fassung 2 (ABN-014, 2026-10-02, BEF-101 Punkt 1):** Der Server prüft Instrument und Fassung, Items, Form je Typ, Optionen, Skalenbereich, freie Angaben, exklusive Optionen und Körperbereiche (`app.assert_questionnaire_answers(instrument, version, answers)` in `supabase/migrations/20261003101000_abn_014_questionnaire_definitions.sql`) — gegen `public.questionnaire_definitions`, erzeugt aus denselben Dateien (ANN-219). Die Anwendung prüft weiter vorab mit Zod.

### ANN-106 — Der Verlauf zeigt Rohwerte als Punkte mit Ereignissen der Praxis; fünf Ereignisarten, setzen und entfernen statt ändern

Praxisprozess · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: wenn P4/P5 weitere Instrumente aktivieren

**Annahme.** Der Verlauf im Befund zeigt je Skalenfrage der aktiven Instrumente die Werte **geltender** Bögen (abgeschlossen, nicht ersetzt) als Punkte mit Zahl, ohne Linie, Trend, Mittel oder Farbe nach Höhe; darunter die Werte als Text. Ereignisse haben fünf Arten (Operation, Erkrankung, Urlaub/Pause, Medikation geändert, Sonstiges) mit Tag und Notiz bis 200 Zeichen, auch in der Zukunft; eine falsche Markierung wird entfernt und neu gesetzt, beides protokolliert, das Auditlog trägt weder Art noch Notiz. Durchgeführte Termine (die letzten 50) stehen als Striche an der Zeitachse.

**Begründung.** `IDEA-OUT-005` verlangt Ereignisse neben der Kurve und „weniger Mittelwert, mehr Rohdaten"; ADR-006 Punkt 11 verbietet jede abgeleitete Aussage, auch als Farbe. „Schübe" aus der Idee sind eine Erkrankung und bekommen keine eigene Art, bis ein Fall sie braucht (ADR-014). Eine geplante Operation gehört vorher in den Verlauf.

**Anker.** `patient_course_events` in `supabase/migrations/20260926110000_frb_002e_course_events.sql`; `EREIGNISARTEN` und `messreihen` in `src/features/assessments/verlauf.ts`; `Messreihenbild` in `src/features/assessments/Messreihenbild.tsx`.

**Änderungspfad.** Weitere Art: Constraint und `EREIGNISARTEN` gemeinsam erweitern (Test hält beide gleich) · Aufwand `klein`. Mehr als 50 Termine: eigener Lesepfad nur mit Tagen · Aufwand `klein`. **Abnahme (Jannes, 2026-10-02):** Rohwerte und Ereignisarten bestätigt; „Entfernen“ löscht künftig nicht mehr, Inhalt, Urheber und Entfernungszeitpunkt bleiben in der Akte nachvollziehbar, das Auditlog bleibt bei Metadaten (BEF-102). **Fassung 2 (ABN-013, 2026-10-02):** `remove_patient_course_event` setzt `removed_at`/`removed_by` statt zu löschen; der Verlauf filtert, `list_removed_patient_course_events` zeigt die Einträge unter „Entfernte Ereignisse“ (geladen erst beim Aufklappen, protokolliert wie der Verlauf), die Auskunft führt sie mit `removed_at`; Frist wie die Akte. `supabase/migrations/20261003100000_abn_013_course_event_removal.sql`.

### ANN-107 — Das Körperschema ist Jannes' Zeichnung; markiert wird mit einem Kreis an der Stelle, gespeichert Stelle und nächster Bereich

Praxisprozess · entschieden (Jannes) · 2026-09-26 · Jannes · — · Wiedervorlage: erledigt mit DOK-005 — das Körperschema steht im Therapiebericht als dieselbe Zeichnung mit dem Tag der Erhebung (ANN-122)

**Annahme.** Grundlage ist die Zeichnung, die Jannes am 2026-09-26 selbst gezeichnet und zur Nutzung im Repository gegeben hat (Vorder- und Rückansicht, als WebP 820 × 749, Weiß transparent). Ein Tipp setzt einen Kreis in der Hauptfarbe an genau dieser Stelle, ein Tipp auf den Kreis entfernt ihn; höchstens 30 Kreise. Gespeichert werden je Kreis die Stelle relativ zum Bild und der Bereich des nächstgelegenen von 47 Ankerpunkten; weiter als 60 Bildpunkte von jedem Anker setzt nichts. Die Liste zum Aufklappen setzt den Kreis auf den Anker.

**Begründung.** Jannes hat den Kreis gewählt; er verdeckt die Anatomie nicht, bleibt bei nahen Markierungen unterscheidbar, übersteht Schwarz-Weiß-Druck und deutet keine Stärke an wie ein roter, auslaufender Punkt (ADR-006 Punkt 11). Der Bereich macht die Stelle in Akte, Verlauf und Auskunft lesbar; der nächste Anker statt eines Umrisses je Bereich braucht keine zweite, passgenaue Zeichnung.

**Anker.** `KOERPERBEREICHE`, `bereichAn` und `MAX_ABSTAND` in `src/features/assessments/koerperschema.ts`; `src/features/assessments/koerperschema.webp`; `KoerperschemaFeld` in `src/features/assessments/KoerperschemaFeld.tsx`.

**Änderungspfad.** Genauere Bereiche: Anker ergänzen oder verschieben (Test prüft, dass jeder Anker seinen Bereich trifft) · Aufwand `klein`. Andere Zeichnung: Datei tauschen und Anker neu setzen; gespeicherte Stellen bleiben relativ zum Bild · Aufwand `mittel`.

### ANN-108 — Das Anlegen-Menü ist eine Leiste unter dem Gitter; ein zweiter Tipp hebt auf oder zieht die Spanne auf

Praxisprozess · entschieden (Jannes) · 2026-09-28 · Jannes (Sichtung Kernprozess, Schritt 2) · erledigt · Wiedervorlage: —

**Annahme.** Nach einem Tipp auf freie Zeit steht das Anlegen-Menü als Leiste am unteren Fensterrand, über der Tableiste, und nicht mehr in der Spalte unter der Auswahl. Ein zweiter Tipp auf **dasselbe** Feld hebt die Auswahl auf; auf ein **anderes** Feld derselben Spalte wählt er die Spanne zwischen beiden Tipps (in beiden Richtungen, ohne das zweite Feld mitzuzählen: 08:50 und 09:30 ergeben 08:50–09:30). Ein Tipp in einer anderen Spalte oder nach einer fertigen Spanne beginnt eine neue Auswahl; Aufziehen durch Ziehen bleibt daneben erhalten.

**Begründung.** BEF-035 und BEF-036 (Sichtung am 2026-09-26): Das Menü im Gitter deckte die Felder zu, auf denen die Spanne weitergeht, und Aufziehen verlangte am Finger einen langen Druck. Wo das Menü stattdessen steht, lässt der Befund offen; eine Leiste am Fensterrand ist die Stelle, die bei jeder Spalte, jeder Zoomstufe und jeder Bildschirmbreite frei von der Spalte bleibt. „40 Minuten weiter" im Befund ist eine Spanne von 40 Minuten, deshalb zählt das zweite Feld als Ende, nicht als letztes Feld. Unsicher: ob die Leiste am Handy zu viel vom Raster verdeckt, wenn die Auswahl tief unten liegt.

**Anker.** `naechsteAuswahl` in `src/features/appointments/useSpanneAufziehen.ts`; die Leiste in `src/features/appointments/AnlegenMenue.tsx`, ihr Platz am Ende von `CalendarGrid` in `src/features/appointments/CalendarGrid.tsx`.

**Änderungspfad.** Das zweite Feld mitzählen: in `naechsteAuswahl` das Ende um das Praxisraster verlängern · Aufwand `klein`. Menü zurück an die Auswahl, aber seitlich oder oberhalb: den Platz in `CalendarGrid` ändern · Aufwand `klein`.

**Beantwortet (Jannes, Runde 3, 2026-10-06):** Die Leiste verdeckte am Handy zu viel. Seitdem ist sie unter 640 px dichter (keine Hinweiszeilen, je zwei Wahlen in einer Reihe), der Gesten-Hinweis steht nur bis zur ersten Spanne (ANN-255), und die Seite rollt eine verdeckte Auswahl ins obere Drittel über der Leiste (`auswahlBildlauf` in `src/features/appointments/auswahlBildlauf.ts`).

### ANN-109 — Über dem Kalender stehen Monat, Person mit Woche und „Jetzt"; alles Übrige liegt hinter der Ecke des Rasters

Praxisprozess · entschieden (Jannes) · 2026-09-28 · Jannes (Sichtung Kernprozess, Schritt 2) · erledigt · Wiedervorlage: —

**Annahme.** Über dem Raster stehen nur noch: links der Monat, der einen Monatskalender aufklappt; in der Mitte der Name der behandelnden Person als Auswahl (in der Tagesansicht „Alle Personen"), darunter Kalenderwoche und Tag beziehungsweise Woche, daneben die Pfeile zum Blättern; rechts „Jetzt" (heutiger Tag, das Raster rollt zur Linie der aktuellen Uhrzeit). Tag/Woche, Zoom, Standort, Status und die Anlegen-Schaltflächen für die Tastatur (einschließlich „Tag umplanen") liegen hinter einem Knopf in der Ecke des Rasters, der beim Bildlauf stehen bleibt und einen aktiven Filter mit einem Punkt anzeigt. Am Telefon wird die Suche zur Lupe links neben „Konto"; ab 640 px bleibt sie das Feld in der Kopfzeile.

**Begründung.** BEF-039 (Sichtung am 2026-09-26) nennt das Ziel und lässt offen, wohin Person, Standort, Status, Tag/Woche und Raster wandern. Die Person gehört zu dem, was oben stehen soll — sie wählbar zu machen, wo sie steht, spart ein zweites Feld. Die Pfeile bleiben bei der Woche, weil Blättern die häufigste Bewegung ist; Tag/Woche ist daneben auch über die Spaltenköpfe erreichbar (CAL-012), Zoom über zwei Finger (BEF-038), Anlegen über das Raster (BEF-035). Die Ecke ist die einzige Stelle, die „am Raster" liegt und bei jedem Bildlauf sichtbar bleibt. Unsicher: ob die Pfeile oben bleiben sollen oder das Wischen sie ersetzt; ob der Unterreiter „Kalender · Touren" ebenfalls weichen soll (BEF-001, nicht Teil dieses Loops).

**Anker.** Kopfzeile, `optionenKnopf` und das Feld „Ansicht und Filter" in `CalendarPage` (`src/features/appointments/CalendarPage.tsx`); `Monatskalender` in `src/features/appointments/Monatskalender.tsx`; `ecke`, `jetzt` und `sprung` an `CalendarGrid`; die Lupe (`sucheOffen`) in `src/app/AppShell.tsx`.

**Änderungspfad.** Ein Element zurück nach oben: aus dem Feld „Ansicht und Filter" in die Kopfzeile verschieben · Aufwand `klein`. Suche auch am Rechner als Lupe: die Klasse `max-sm:hidden` am Suchfeld für alle Breiten setzen und die Lupe überall zeigen · Aufwand `klein`.

### ANN-110 — Das Web-Manifest nennt das Master als maskierbares Symbol und öffnet die Anwendung mit schmaler Leiste (`minimal-ui`)

Technik · entschieden (Jannes) · 2026-09-28 · Jannes (Sichtung Kernprozess, Schritt 10, Android) · erledigt · Wiedervorlage: —

**Annahme.** `public/manifest.webmanifest` nennt als einziges Symbol das vorhandene Master `own-motion-app-1024.png`, einmal für `any` und einmal für `maskable`; `display` ist `minimal-ui` (bis UX-002i `browser`). Es gibt keinen Service Worker. Eingebunden wird das Manifest mit `crossorigin="use-credentials"`.

**Begründung.** BEF-040: Ohne Manifest nimmt Android das `apple-touch-icon` und legt es in einen weißen Kreis. Das Master ist vollflächig und hält den Schutzkreis ein (nachgemessen in `marke/README.md`), deshalb braucht es keine zweite Fassung der Marke. `browser` ändert am Öffnen nichts, auch unter iOS nicht, das seit 16.4 ein `standalone` des Manifests übernehmen würde. Ein Service Worker bleibt nach ADR-015 Punkt 16 ausgeschlossen. `use-credentials`, weil der Browser das Manifest sonst ohne die Anmeldung der zweiten Tür der Test-Umgebung abruft (ANN-101). BEF-041: Mit `browser` meldete Chrome die Seite als nicht installierbar — vorher, ohne Manifest, hatte Chrome sie auf eigene Faust installiert. `minimal-ui` ist installierbar ohne Service Worker und behält in Chrome eine schmale Leiste mit Zurück und Neu laden; `standalone` gäbe am Handy die volle Höhe, verlangte aber eigene Zurück-Wege in jeder Ansicht und schaltete auch iOS ab dem Startbildschirm ohne Browserleiste. iOS kennt `minimal-ui` nicht und öffnet weiter im Browser. Unsicher: ob Jannes am Handy die volle Höhe von `standalone` lieber hätte.

**Anker.** `public/manifest.webmanifest`; `<link rel="manifest">` in `index.html`; die Messung `MASTER_WORTMARKE` in `src/components/ui/markeRegeln.ts`, geprüft in `src/marke.test.ts` („Web-Manifest").

**Änderungspfad.** Volle Höhe ohne Leiste: `display` auf `standalone` und in den Ansichten ohne Rückweg einen Zurück-Knopf ergänzen · Aufwand `mittel`. Zurück in den Browser-Tab: `browser`, dann ohne Installation in Chrome · Aufwand `klein`. Kleinere Dateien: aus dem Master gerasterte Kopien mit 192 und 512 px in `marke/app/` · Aufwand `klein`.

### ANN-111 — Die Begriffe stehen in einer Datei; im Kalender heißt der Eintrag ohne Patient:in „Fehlzeit", eine Person des Teams „Mitarbeiter:in"

Praxisprozess · entschieden (Jannes) · 2026-09-28 · Jannes (Sichtung Kernprozess, Schritt 7) · erledigt · Wiedervorlage: —

**Annahme.** Bezeichnungen, die an mehr als einer Stelle dieselbe Sache nennen — die sechs Arbeitsbereiche mit Kurzform und Leitfrage, die Vorgänge aus Menü, Suche und Kalender, die Personen —, stehen einmal in `src/lib/begriffe.ts`. Abgelöst und aus jedem Oberflächentext ausgeschlossen sind: „Mein Tag" und „Touren & Termine" (Beschriftungen vom 2026-09-12), „Passwort" (es gilt „Kennwort"), „Mitarbeitende:n"/„Mitarbeitende:r" (Einzahl „Mitarbeiter:in", Mehrzahl „Mitarbeitende") und im Kalender „Ereignis" (es gilt „Fehlzeit").

**Begründung.** Oberflächen-Checkliste Punkt 9 („gleiche Sache, gleiches Wort") und die Bedienprinzipien in `docs/PRODUCT_VISION.md` (Beschriftungen folgen einer Begriffsliste). Jannes hat die vorhandenen Begriffe am 2026-09-26 für in Ordnung befunden; dieser Loop legt deshalb keine neuen Wörter fest, sondern entscheidet nur, wo zwei Wörter für dieselbe Sache nebeneinanderstanden: Die Anlegen-Leiste sagte in Jannes' Worten „Fehlzeit · Dauerfehlzeit" (BEF-035), die Suche „Fehlzeit eintragen", das Formular dahinter „Ereignis eintragen". „Kennwort" steht 62-mal im Bestand, „Passwort" einmal in einem Kommentar. Die Einzahl „Mitarbeiter:in" folgt der Schreibweise von „Patient:in" und „Therapeut:in"; die Suche sagte als einzige Stelle „Mitarbeitende:n anlegen". Im Auditlog und im Verlauf der Messwerte (ANN-106) meint „Ereignis" etwas anderes und bleibt. Unsicher: ob „Fehlzeit" für ein Teammeeting passt, das Arbeitszeit ist.

Seit 2026-09-29 auch „Auditlog“ → „Protokoll“ (Jannes in der Sichtung, BEF-080).

**Anker.** `ABGELOESTE_BEGRIFFE` in `src/lib/begriffe.ts`, durchgesetzt von `src/lib/begriffe.test.ts` über jeden Quelltext unter `src/` ohne Kommentare und Tests.

**Änderungspfad.** Ein anderes Wort: den Wert in `BEGRIFFE` bzw. `BEREICHE` ändern, den Eintrag in `ABGELOESTE_BEGRIFFE` umkehren und den Test die übrigen Stellen finden lassen · Aufwand `klein`. Das Gate aufgeben: den Test entfernen, die Datei bleibt als Quelle · Aufwand `klein`.

### ANN-112 — Ein Arbeitsbereich öffnet auf seinem ersten echten Punkt; Vorschauen stehen eingeklappt dahinter

Praxisprozess · entschieden (Jannes) · 2026-09-28 · Jannes (Sichtung Kernprozess, Schritt 8) · erledigt · Wiedervorlage: —

**Annahme.** „Organisatorisches" öffnet auf „Mitarbeitende" statt auf der Vorschau „Radflotte". Im Untermenü eines Bereichs stehen die angebundenen Punkte offen; Vorschauen liegen hinter einem Knopf „Vorschau (n)" und klappen von selbst auf, wenn man auf einer von ihnen steht. Menüpunkte, deren Route einer Rolle verschlossen ist, stehen für sie nicht im Menü (trainer: „Arbeitszeiten", BEF-034).

**Begründung.** Die Bedienprinzipien aus UX-EPIC-002 (Roadmap, Block 1a): ein Hauptknopf je Ansicht, was nicht gebraucht wird, ist eingeklappt, Handy zuerst. Wer den Bereich öffnete, landete in einem Prototyp ohne Speicherung und musste den echten Punkt erst suchen; am Handy stand die Hälfte des Untermenüs außerhalb des Bildschirms. Der Rollentest ist Darstellung, keine Zugriffskontrolle (ADR-004); die Route prüft dieselbe Bedingung. Unsicher: ob Jannes die Vorschauen ganz aus dem Menü nehmen und nur über die Bereichsübersicht erreichen will.

**Anker.** `to` des Bereichs `betrieb` und `betriebUnterpunkte` in `src/app/navigation.tsx`; `einklappbar` in `SubNav` (`src/components/ui/SubNav.tsx`).

**Änderungspfad.** Vorschauen wieder offen: `einklappbar` auf `false` setzen · Aufwand `klein`. Anderer Einstieg: `to` des Bereichs ändern · Aufwand `klein`.

### ANN-113 — Die Tour ist eine Ansicht des Kalenders; der Kalender hat keine Unterzeile mehr

Praxisprozess · entschieden (Jannes) · 2026-09-28 · Jannes (Sichtung Kernprozess, Schritt 9) · erledigt · Wiedervorlage: —

**Annahme.** Die Zeile „Kalender · Touren" über dem Raster entfällt. „Tour" steht als dritter Knopf neben „Tag" und „Woche" unter „Ansicht und Filter" und öffnet `/touren` mit dem gezeigten Tag und der gezeigten Person; die Tourenseite heißt „Tour" und führt mit „Zum Kalender" in die Tagesansicht desselben Tages zurück. `/touren` bleibt Adresse und Teil des Bereichs Kalender. Die Unterzeilen der Bereiche Patient:innen (Patient:innen · Verordner:innen) und Organisatorisches bleiben.

**Begründung.** BEF-044: Dass man im Kalender ist, zeigen Seitenleiste und Tableiste; die Zeile kostete Höhe über dem Raster. Die Tourenseite fragt dasselbe wie der Kalender — Tag und Person —, deshalb reisen beide mit. Unter „Ansicht und Filter" statt im Kopf über dem Raster, weil der Kopf am Handy seit BEF-039 voll ist (Monat, Person mit Woche, „Jetzt"). In den beiden anderen Bereichen führt die Zeile zu Zielen, die anders nicht erreichbar sind; sie zu streichen, wäre ein eigener Umbau. Unsicher: ob Jannes die Tour mit einem Tipp statt mit zwei erreichen will.

**Anker.** `unterpunkte` des Bereichs `termine` in `src/app/navigation.tsx`; der Knopf „Tour" in der Gruppe „Ansicht" in `src/features/appointments/CalendarPage.tsx`.

**Änderungspfad.** Ein Tipp: den Knopf aus der Gruppe in den Kopf über dem Raster ziehen (ab `sm`, am Handy neben „Jetzt") · Aufwand `klein`. Zeile zurück: `unterpunkte` wieder füllen · Aufwand `klein`. Die Tour als echte Ansicht im Raster (ohne Seitenwechsel) · Aufwand `mittel`.

**Fassung 2 (Jannes, Runde 3, 2026-10-06):** „Tour" steht mit einem Tipp im Kopf, rechts neben „Tag | Team" bzw. „Woche | Team", auf allen Breiten; im Feld „Ansicht und Filter" entfällt sie, die Anlegewege stehen dort zugeklappt unter „Ohne Raster anlegen". Anker jetzt: der Link „Tour" nach der Gruppe „Ansicht" in `src/features/appointments/CalendarPage.tsx`.

### ANN-114 — Flächen-Ansichten reichen bis an den Rand, Listen und Texte behalten die Kappung

Technik · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Jannes bei der nächsten Sichtung am Rechner (breiter Bildschirm) und am Handy

**Annahme.** Der Kalender (`/kalender`) nutzt die ganze Fläche neben der Seitenleiste: keine Kappung auf 1200 px, 8 bis 12 px Rand, kein Kasten um das Raster, nur eine Linie oben und unten. Alle übrigen Seiten behalten die Kappung aus DS-001. Der Abstand unter der Kopfzeile ist überall kleiner (20 bis 24 px statt 32 px).

**Begründung.** BEF-043: Links und rechts des Rasters blieb Fläche ungenutzt, am breiten Bildschirm viel davon. Die Kappung aus DS-001 ist für Listen gedacht — ohne sie stünde der Status einer Zeile einen halben Meter vom Namen entfernt; ein Raster hat diese Sorge nicht. Die Kopfzeile und die Seitenleiste bleiben auf jeder Seite gleich, deshalb springt beim Wechsel das Gerüst nicht (UI-001). Durchgesehen wurden die übrigen Bereiche mit derselben Frage: Sie sind Listen, Formulare oder Text; die Tourenseite mit Karte wäre der nächste Kandidat, sobald die Karte die Breite braucht. Unsicher: ob Jannes weitere Seiten randlos will.

**Anker.** `RANDLOSE_SEITEN` in `src/app/navigation.tsx`, angewendet in `<main>` in `src/app/AppShell.tsx`; geprüft in `src/app/AppShell.test.tsx`.

**Änderungspfad.** Weitere Seite randlos: ihren Pfad in `RANDLOSE_SEITEN` aufnehmen · Aufwand `klein`. Zurück zum Kasten: den Eintrag entfernen und in `CalendarGrid` `rounded-card border` wieder setzen · Aufwand `klein`. **Abnahme (Jannes, 2026-10-02):** bestätigt.

### ANN-115 — Ein abgewiesener Schreibversuch wird bestätigt protokolliert und mit HTTP 403 beantwortet; der Client prüft den Status

Technik · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Jannes lokal mit `supabase start` (echte HTTP-Antwort über PostgREST) · **LOG-EPIC-001:** gilt, als `access.denied` mit Operation und Zähler (ANN-230).

**Annahme.** Die zehn Schreibpfade für Rollen und Konten, Legal Hold und Löschaufträge weisen eine fehlende Rolle ohne Ausnahme ab: `app.record_denied_write` schreibt den Versuch mit `outcome = 'denied'` (Subjekt ist die Organisation), setzt `response.status = 403` lokal zur Transaktion, und der Pfad kehrt vor jedem Schreiben zurück. Ohne Sitzung und ohne Organisation bleibt es bei der Ausnahme; die übrigen Schreibpfade bleiben ohne Eintrag. Die Aufrufer in der Oberfläche werten eine Antwort als gescheitert, wenn ein Fehler **oder** HTTP 403 vorliegt (`abgewiesen` in `src/lib/abgewiesen.ts`).

**Begründung.** Jannes' Wahl zu G6c (2026-09-26): bestätigte Transaktion mit HTTP 403 für diese drei Bereiche, nichts für den Rest. PostgREST bestätigt eine Transaktion, die nicht fehlschlägt, und antwortet mit dem gesetzten Status; zurückgerollt wird nur bei einer Ausnahme (PostgREST, „Transactions", `response.status`). Für den Aufrufer ändert sich am Status nichts — 42501 wurde schon bisher als 403 ausgeliefert. Anders ist der Körper: Eine Funktion mit Skalar-Rückgabe liefert `null`, und `supabase-js` (postgrest-js 2.112.4, `processResponse`) liest `JSON.parse("null")` als „kein Fehler". Ohne die Statusprüfung hielte der Client die Abweisung für einen Erfolg; beim Einladen ginge danach die Anmeldemail hinaus. Die Oberfläche ruft diese Pfade für eine abgewiesene Rolle nie auf; die Prüfung ist die zweite Linie. Unsicher: die tatsächliche Antwort von PostgREST ist in der Cloud nicht prüfbar (kein `supabase start`); `pnpm test:db` belegt Eintrag, Status und unveränderte Daten auf der Datenbankseite.

**Anker.** `app.record_denied_write` in `supabase/migrations/20260926120000_abgewiesene_schreibzugriffe.sql`; die Liste der Pfade in `supabase/tests/abgewiesene-schreibpfade.test.ts`; auf der Clientseite `abgewiesen` in `src/lib/abgewiesen.ts`.

**Änderungspfad.** Weitere Schreibpfade: den Zweig „Rolle fehlt" auf `app.record_denied_write` umstellen und den Pfad in die Liste des Tests aufnehmen · Aufwand `klein` je Pfad. Zurück zur Ausnahme: den Zweig wieder `raise exception` werfen lassen · Aufwand `klein`. Bestätigt PostgREST die Transaktion lokal nicht: Eintrag über eine autonome Verbindung (`dblink`) statt `response.status` · Aufwand `mittel`.

**Abnahme (Jannes, 2026-10-02).** Bestätigt für Abweisungen wegen fehlender Berechtigung in den beschriebenen Schreibpfaden: Der Protokolleintrag bleibt, die fachliche Änderung unterbleibt. Andere Fehler antworten weiter mit ihrem passenden Status.

### ANN-116 — Die Behandlungsliege ist eine organisatorische Versorgungsangabe der Person

Datenschutz · entschieden (Jannes) · 2026-09-28 · Jannes (Sichtung Kernprozess, Schritte 10 und 12) · Prüfpaket · Wiedervorlage: Datenschutzprüfung / DSFA-Prozess vor Produktivstart

**Annahme.** „Behandlungsliege mitnehmen" ist ein Ja/Nein-Merkmal der Person (`patient_care_details.treatment_table_required`; seit PRX-013 ohne Standard: leer heißt „noch nicht entschieden“, ANN-143), keine Angabe je Termin und kein Befundinhalt. Es erbt Rollenschnitt und Frist der internen Versorgungsangaben aus ANN-010: sichtbar und setzbar für die vier Praxisrollen (dieselbe Menge wie `app.can_update_patient()`), nicht für das Patientenkonto und nicht für die Trainingsrolle, Datenklasse Patientenakte. Die Tagesliste liefert es nur am Behandlungstermin; am Trainingstermin und an einer Fehlzeit bleibt es leer. Jede Änderung steht als `patient.updated` mit dem Feldnamen im Auditlog.

**Begründung.** §9 verlangt, dass der Liegenbedarf beim Tagesstart erkennbar ist und als Merkmal der Person im Befund gesetzt wird; bis FRB-EPIC-003 den Befund anbindet, braucht es einen Ort in der Akte. Das Merkmal sagt, was mitzunehmen ist, nicht warum — derselbe Charakter wie Zugangshinweis und Besonderheit, die Office für die Planung sieht (§4.3, ANN-010). Unsicher: Mittelbar deutet „braucht eine Liege" auf eine Einschränkung hin und kann damit als Gesundheitsdatum nach Art. 9 DSGVO gelesen werden; der Rollenschnitt wäre dann trotzdem gedeckt, weil Office seit E15 klinische Inhalte ohnehin liest (ADR-004 Fassung 2). Am Trainingstermin bliebe es ein Durchgriff über den gemeinsamen Kalender (ADR-022 Punkt 11) und fehlt deshalb dort.

**Anker.** Spalte und `public.set_treatment_table_required` in `supabase/migrations/20260926130000_ux_003a_treatment_table.sql`, dort auch `patient_directory`, `export_patient_record` und `list_day_plan`; Oberfläche `src/features/patients/Behandlungsliege.tsx`; Tests `supabase/tests/treatment-table.test.ts`.

**Änderungspfad.** Enger (etwa ohne Office): eigene Rollenfunktion statt `app.can_update_patient()` im Schreibpfad und eine Projektion ohne die Spalte · Aufwand `mittel`. Als Befundinhalt führen (klinische Dokumentation): Spalte in den Befund verlegen, Datenumzug und neuer Lesepfad der Tagesliste · Aufwand `groß` — deshalb vor echten Daten zu klären. **Fassung 2 (UBK-EPIC-001, 2026-10-05, BEF-051):** Die Liege gehört an den **Hausbesuch**: Liege-Zeile, die Zählung „ab n. Besuch“ (`hausbesucheDesTages` in `src/features/today/tagesstart.ts`) und die Pille an der Karte (`Tageskarte`) berücksichtigen nur `appointment_type = 'home_visit'`; an einem Tag nur mit Praxisterminen gibt es keine Liege-Zeile. Der Server liefert das Merkmal weiter an jedem Behandlungstermin; es dort am Praxistermin zu leeren, wäre sauberer (Datenminimierung), kostet aber eine Migration und ist als Folgeschritt vorgeschlagen. **Bestätigt (Jannes, 2026-10-05):** „Die Liege ist nur bei Hausbesuchen relevant.“ Änderungspfad: die Funktion und die Bedingung an der Pille · Aufwand `klein`.

### ANN-117 — Tagesstart: erster Weg und „ab dem n-ten Besuch" zählen nach den Besuchen des Tages

Praxisprozess · entschieden (Jannes) · 2026-10-05 · Jannes (Sichtung Kernprozess, Schritt 10; Fassung 2 im Auftrag UBK-EPIC-001) · erledigt · Wiedervorlage: —

**Annahme.** Die Übersicht zeigt oben den **nächsten noch anzufahrenden** Besuch (Status bestätigt) als „Erster Weg" — „Nächster Weg", sobald heute schon ein Besuch lag — und den übernächsten als knappe Vorschau „Danach". „Liege heute: ja, ab n. Besuch (Uhrzeit)" zählt n in der Folge der Behandlungsbesuche des Tages ohne Absagen (Fehlzeiten und Training zählen nicht, wie bei „Offen heute"); ein erledigter Besuch zählt mit, braucht aber keine Liege mehr. Braucht keine noch ausstehende Behandlung die Liege, steht dort „nein". Der Plan des Teams ist für behandelnde Rollen zugeklappt, für das Büro offen. **Seit dem Design-Handoff vom 2026-10-01** steht der Tag als Zeitstrahl da: Der nächste Besuch ist die ausgeklappte Karte, die Vorschau „Danach" ist entfallen, und die Liege-Zeile lautet „Ja · ab n. Besuch Uhrzeit" oder „Nein"; die Zählung gilt unverändert.

**Begründung.** §9 und `UMBAU.md` (Ein Behandlungstag, Punkte 1, 2 und 4): ruhige Oberfläche, erster Weg, Vorschau auf den nächsten, Liege schon beim Losfahren sichtbar. Die Zählung folgt dem, was man am Rad vor sich hat — „der zweite Besuch heute" meint auch nach dem ersten noch denselben. Die Uhrzeit steht dabei, damit die Zahl nicht nachgezählt werden muss. Unsicher: ob Jannes nach einem erledigten Besuch lieber ab dem nächsten neu zählt.

**Anker.** `besucheDesTages`, `wegeDesTages` und `liegeHeute` in `src/features/today/tagesstart.ts`; Tests `src/features/today/tagesstart.test.ts`.

**Änderungspfad.** Andere Zählung oder anderer Wortlaut: die drei Funktionen und ihre Tests · Aufwand `klein`. Plan des Teams immer offen: die Bedingung `teamplanZugeklappt` in `src/features/today/MyDayPage.tsx` · Aufwand `klein`. **Fassung 2 (UBK-EPIC-001, 2026-10-05, Auftrag Jannes: „nächster Weg nach Uhrzeit statt nach Abhaken“):** Noch anzufahren ist ein Besuch, der bestätigt ist **und dessen Ende noch nicht erreicht ist** (`stehtAus` in `tagesstart.ts`); nach seinem Ende gibt die Übersicht den nächsten Weg frei, auch ohne Haken, und nach einem frühen Haken ebenso. Der vorbeigegangene, nicht abgehakte Besuch bleibt im Zeitstrahl mit „Nicht abgeschlossen“ und dem Haken stehen; erst wenn kein Weg mehr aussteht, wird er die ausgeklappte Karte („Seit … offen“). Liege-Zeile, Wegbalken und Fahrzeitabfrage folgen derselben Regel; „n von m Besuchen erledigt“ zählt weiter nur Abgehaktes, und der Tagesabschluss sagt „Alle Besuche erledigt“ nur dann, sonst „Kein Weg mehr offen“. Gezählt wird für „ab n. Besuch“ seit BEF-051 nur unter Hausbesuchen (ANN-116 Fassung 2). Tests: `tagesstart.test.ts` („Die Uhr statt des Hakens“), `MyDayPage.test.tsx` (UBK-EPIC-001).

### ANN-118 — Übertragung der MT-Bausteine: drei Lücken offen, SIG vollständig, Hinweise getrennt, kein Grenzwert

Praxisprozess · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Jannes, wenn er die drei Lücken nachliefert (Plan D2)

**Annahme.** Die neun Regionen stehen wörtlich aus der Vorlage in `definitionen/bausteine/`. Schulter „Untersuchung ACG", LWS „Behandlung" und HWS „Therapie Hochzervikal" tragen `status: "unvollstaendig"` — auch die beiden, vor deren Abbruch Items stehen; LWS „Untersuchung SIG" ist mit sechs Items vollständig. Text hinter „ – " und reine Durchführungsklammern sind Hinweise, die nie in den Dokumentationstext gehen; eine dritte Gliederungsebene wird flach, die Zwischenüberschrift steht als Hinweis. Die Klammer beim Navicular Drop („mehr als 1 cm Differenz im Svgl. → Training Gewölbe") ist **nicht** übernommen. Seitengetrennt sind Extremitäten und Kiefer, an der Wirbelsäule nur Neurologie, Neurodynamik und SIG; wie die Seite abgefragt wird, regelt seit 2026-09-26 ANN-129. Seitengetrennte Tests mit Messwert (Knee to Wall, Navicular Drop) werden je Seite erfasst — das hat Jannes am 2026-09-26 entschieden.

**Begründung.** Plan D2 (am Original-PDF nachgesehen) und Arbeitsauftrag §2: Lücken sichtbar lassen, nicht aus eigenem Wissen füllen. Das Schema aus FRB-EPIC-000 kannte nur leere unvollständige Blöcke; die Vorlage bricht aber zweimal nach verwertbaren Punkten ab. Die Navicular-Klammer ist ein Schwellenwert neben dem eigenen Messwert samt Therapiefolge — `cutoff-anzeige` in `src/app/mdr.ts` und ADR-006 Punkte 4, 10 und 11 gehen dem Wortlautgebot des Arbeitsauftrags im Rang vor (Zweitreview). Unsicher: ob Deutungsklammern im Label wie „(zentrale Problematik?)" beim Babinski die externe Prüfung (B1) bestehen; sie bleiben als Wortlaut stehen.

**Anker.** `blockSchema` in `src/features/assessments/schema.ts`; Regeln in `src/features/assessments/definitionen/bausteine/README.md`; Test `src/features/assessments/bausteine.test.ts`.

**Änderungspfad.** Lücken nachliefern: Items in die Regionsdatei, Version heben, Zähltest anpassen · Aufwand `klein`. Andere Seitenregel oder Hinweis entfernen: das Feld in den Regionsdateien · Aufwand `klein`. **Abnahme (Jannes, 2026-10-02):** bestätigt; die drei unvollständigen Bereiche bleiben sichtbar als unvollständig gekennzeichnet, Fehlendes wird nicht selbst ergänzt.

### ANN-119 — Tippfehler der Bausteinvorlage bleiben stehen

Praxisprozess · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Jannes (Plan D3)

**Annahme.** „Relocation Tet", „Supinatin", „Lachmann", „Painfull Arc Sign" und die übrigen Schreibweisen der Vorlage stehen unverändert in den Bezeichnungen und damit im erzeugten Dokumentationstext; die Kennungen sind davon unabhängig.

**Begründung.** Plan D3 schlägt Stehenlassen vor, der Arbeitsauftrag §2 verlangt es bis zu Jannes' Freigabe, und der Wortlauttest hält jede Bezeichnung gegen die Quelldatei. Ohne Antwort gilt der Vorschlag (STATUS, Blocker D2/D3). Nachteil: Die Tippfehler erscheinen im Dokumentationstext der Akte.

**Anker.** `src/features/assessments/definitionen/bausteine/README.md`; Test „lässt die Tippfehler der Vorlage stehen" in `src/features/assessments/bausteine.test.ts`.

**Änderungspfad.** Korrigieren: Labels in den Regionsdateien, Version heben, Quelldatei mit Vermerk anpassen, damit der Wortlauttest die neue Schreibweise hält · Aufwand `klein`. Kennungen bleiben. **Abnahme (Jannes, 2026-10-02):** geändert: offensichtliche Tippfehler werden für künftige Einträge korrigiert, Kennungen bleiben, bestehende Dokumentation ändert sich nicht (BEF-103). **Fassung 2 (ABN-015, 2026-10-02, BEF-103 Punkt 4):** „Relocation Test“, „Supination“, „Lachman-Test“ und „Painful Arc Sign“ sind korrigiert, als Patch-Version 1.0.1 von Schulter, Ellenbogen und Knie; Kennungen bleiben, bestehende Dokumentation ändert sich nicht. Der Wortlauttest in `bausteine.test.ts` führt die Korrekturen in `KORRIGIERT`.

### ANN-120 — Bausteine erzeugen nur Text: kein gespeichertes Einzelergebnis, der Befund ist die Dokumentation des Termins

Praxisprozess · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Phase P6 des FRB-Plans (Ergebnisse speichern, Verlauf je Test); Jannes in der Sichtung

**Annahme.** Das Bausteinfeld steht in „Behandlung abschließen" und „Dokumentation bearbeiten" (nicht im Nachtrag, nicht ohne Behandlung). Die Häkchen leben nur auf der Seite; gespeichert wird allein der übernommene Text als Entwurf nach ADR-016. Der Erstbefund ist damit die Dokumentation des Termins der Erstaufnahme, kein eigener Eintragstyp. Ein nicht übernommener Vorschlag gilt als ungespeicherte Arbeit: Er hält „Als Entwurf speichern" und den Abschluss an, bis er im Text steht oder verworfen ist; nur wer die Seite verlässt und in der Rückfrage „Speichern" wählt, bekommt ihn an den Entwurf angehängt. Während eines Schreibvorgangs ist das Feld gesperrt. Keine Kopierschaltfläche.

**Begründung.** Plan Abschnitt 4 und Phase P3: der erzeugte Text ist ein Vorschlag, erst die Übernahme macht ihn zum Eintrag, und nichts Finalisiertes wird überschrieben; ADR-016 Punkt 4 verlangt, dass festgeschrieben wird, was gelesen wurde, und nach Punkt 7 würde ein ungesehen angehängter Entwurf automatisch zu Version 1; §13 verbietet den stillen Verlust — beim Verlassen der Seite wiegt der Verlust schwerer, und der angehängte Text steht danach sichtbar im Entwurf am Termin (Zweitreview). Strukturierte Ergebnisse brauchen Datenklasse, Frist und RLS und sind P6 — heute vorzubauen wäre Vorratsbau (ADR-014). Die Kopierschaltfläche des Plans entfällt, weil der Text direkt ins Feld geht und eine Zwischenablage mit Gesundheitsdaten auf manchen Geräten synchronisiert wird. Unsicher: ob Jannes den Befund als eigenen Eintrag neben der Verlaufsdoku sehen will.

**Anker.** `useBausteinAuswahl` in `src/features/assessments/bausteinauswahl.ts` und `dokumentationstext` in `src/features/assessments/dokumentationstext.ts`; Einbindung in `src/features/documentation/TreatmentNotePage.tsx` und `CompleteTreatmentPage.tsx`; Tests dort und in `src/features/assessments/BausteinFeld.test.tsx`.

**Änderungspfad.** Einzelergebnisse speichern: Tabelle mit Datenklasse, Frist und Policy nach Plan P6, die Auswahl als Entwurf dort ablegen · Aufwand `groß`. Eigener Befund-Eintrag: neuer Eintragstyp nach ADR-016 · Aufwand `groß`. Vorschlag nie automatisch anhängen: die beiden `entwurfSichern` · Aufwand `klein`. **Abnahme (Jannes, 2026-10-02):** Bausteine und Erstbefund als Termindokumentation bestätigt. Geändert: Kein unbestätigter Vorschlag wird beim Verlassen oder Speichern ungesehen an den Entwurf gehängt; die Eingaben bleiben dennoch erhalten (BEF-103). Bis zur Umsetzung gilt die bisherige Regel. **Fassung 2 (ABN-015, 2026-10-02, BEF-103 Punkt 1):** Ein nicht übernommener Vorschlag geht **nie** in den Entwurf, auch nicht beim Verlassen. Häkchen, Werte und Seiten werden getrennt vom Entwurf gesichert (`treatment_draft_findings`, `save_treatment_draft_findings`/`get_treatment_draft_findings`, nur dokumentierende Rollen, protokolliert), beim Öffnen zurückgeholt und beim Festschreiben verworfen. „Festschreiben“ hält weiter an, solange ein Vorschlag offen ist; „Entwurf“ nicht mehr. `supabase/migrations/20261003102000_abn_015_treatment_draft_findings.sql`, `src/features/documentation/befundangaben.ts`.

### ANN-121 — Der Therapiebericht ist ein gespeicherter Datensatz; beim Abschluss friert er als Snapshot ein

Recht · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung; mit Weg 3 aus B14 (serverseitiges PDF nach OPS-001)

**Annahme.** Ein Therapiebericht hängt an genau einer Verordnung und hat zwei Zustände: `entwurf` (frei änderbar, verwerfbar) und `abgeschlossen` (als `jsonb`-Snapshot mit `schema_version` eingefroren, unveränderlich per Trigger auch für postgres). Eine Korrektur ist ein neuer Bericht; eine Verordnung mit Bericht lässt sich nicht löschen. Gedruckt wird über den Browser (B14 Weg 1); der Druckknopf gilt als Export (`therapy_report.exported`).

**Begründung.** Die Roadmap nennt eine Druckansicht, aber eine rein flüchtige Ansicht könnte später nicht belegen, was an die Verordner:in ging — der Bericht gehört als Schreiben zur Akte (§630f BGB) und in die Auskunft nach Art. 15. Das Muster ist der Rechnungs-Snapshot (ANN-077): Spätere Änderungen an Dokumentation oder Stammdaten erreichen einen abgeschlossenen Bericht nicht. Unsicher: ob die Prüfung die abgelegte Datei selbst verlangt; die kommt erst mit Weg 3.

**Anker.** `public.therapy_reports`, `app.therapy_report_unveraenderlich` und `public.complete_therapy_report` in `supabase/migrations/20260926140000_dok_005a_therapy_reports.sql`; `src/features/therapy-reports/api.ts`.

**Änderungspfad.** Nur Druckansicht ohne Ablage: Tabelle und Funktionen zurückbauen, die Empfehlung braucht dann einen eigenen Ort · Aufwand `mittel`. Serverseitiges PDF: Ablage nach ADR-017 an den abgeschlossenen Bericht hängen · Aufwand `mittel`. **Abnahme (Jannes, 2026-10-02):** bestätigt; eine Berichtskorrektur nennt den ersetzten Bericht, Grund, Zeitpunkt und Verfasser:in (BEF-104). **Fassung 2 (ABN-016, 2026-10-02, BEF-104):** Eine Korrektur ist ein neuer Bericht derselben Verordnung mit `supersedes_report_id` und `change_reason` (3–500 Zeichen), nur zu einem abgeschlossenen, höchstens einmal; Zeitpunkt und Verfasser:in sind `created_at`/`created_by`. Das Dokument nennt sie (`korrektur`), das Blatt heißt „korrigierte Fassung“, die Verordnung zeigt die Kette und „Korrigieren“ nur am geltenden Bericht. `supabase/migrations/20261003103000_abn_016_therapy_report_correction.sql`.

### ANN-122 — Was in den Bericht geht, kreuzt die Therapeut:in an; nichts ist vorbelegt, alles wörtlich

Praxisprozess · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Jannes in der Sichtung (Befund Schritt 8)

**Annahme.** Zur Auswahl stehen die finalisierten Einträge der ganzen Akte (die 200 jüngsten, die der Verordnung zuerst, weitere zugeklappt, höchstens 50 im Bericht) und abgeschlossene, nicht ersetzte Erhebungen mit Körperschema; angekreuzt ist nichts. Der Bericht übernimmt Einträge wörtlich mit Tag und Verfasser:in, das Körperschema als Bild mit dem Tag der Erhebung, dazu Diagnose, Heilmittel und die **gezählten** stattgefundenen Termine mit erstem und letztem Tag. Eigener Text und Empfehlung stehen mit Verfasser:in und Tag der letzten inhaltlichen Änderung.

**Begründung.** §17 und ADR-006 Punkt 4: Eine Vorauswahl „wichtiger" Einträge wäre eine Auswahl nach klinischem Gehalt. Übernehmen ohne Kürzen folgt der engen Lesart aus ADR-006 Punkt 8. Die Auswahl hält den Bericht zugleich knapp — an die Verordner:in geht, was sie braucht, nicht die Akte (Art. 5 Abs. 1 lit. c DSGVO). Skalen und Verlaufsereignisse fehlen, bis FRB-EPIC-004 sie liefert.

**Anker.** `app.therapy_report_pruefen` und `app.therapy_report_dokument` in `supabase/migrations/20260926140000_dok_005a_therapy_reports.sql`; `src/features/therapy-reports/TherapieberichtPage.tsx`.

**Änderungspfad.** Andere Auswahlmenge oder Obergrenze: die beiden Funktionen und `EINTRAEGE_MAX` · Aufwand `klein`. Verlaufsereignisse oder Skalen dazu: ein Feld im Dokument und ein Abschnitt im Blatt · Aufwand `klein`. **Abnahme (Jannes, 2026-10-02):** bewusste Auswahl ohne Vorbelegung bestätigt; der eigene Berichtstext bleibt Kern, Einträge sind ergänzende Auszüge; die Grenze von 50 ist sichtbar und schneidet nichts still ab (BEF-104). **Fassung 2 (ABN-016, 2026-10-02, BEF-104):** Beim Auswählen steht „n von 50 Einträgen gewählt“; bei 50 lässt sich kein weiterer Haken setzen. Der eigene Berichtstext bleibt der Kern, die Einträge sind ergänzende Auszüge.

### ANN-123 — Der Briefkopf kommt aus den Praxis-Stammdaten, ohne Steuer- und Bankangaben

Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung

**Annahme.** Kopf und Absenderzeile tragen Name, Anschrift, Telefon und E-Mail aus `practice_billing_profiles`; fehlen die Stammdaten, steht nur der Name der Organisation. Die Serverfunktion liest diese Felder für den Bericht auch für therapist und team_lead, die die Stammdaten sonst nicht lesen; Steuernummer und Bankverbindung liefert sie nicht. Dazu die schwarze Wortmarke, die `marke/README.md` für Rechnung und Fax vorsieht.

**Begründung.** Ein Bericht an die Verordner:in braucht einen Absender, und die Anschrift der eigenen Praxis ist gegenüber den eigenen Beschäftigten nicht schutzbedürftig. Das Leserecht auf die ganze Stammdatenzeile bleibt bei owner und office (ABR-000); die Projektion gibt nur, was auf den Brief gehört (ADR-013 Punkt 9 Nr. 3). Unsicher: ob eine Einzelpraxis mit Privatanschrift das anders sieht.

**Anker.** Der Schlüssel `praxis` in `app.therapy_report_dokument`, `supabase/migrations/20260926140000_dok_005a_therapy_reports.sql`.

**Änderungspfad.** Nur der Name der Organisation: den Zweig mit `practice_billing_profiles` streichen · Aufwand `klein`. Eigener Briefkopf je Standort: Feld an `locations` und hier lesen · Aufwand `mittel`. **Abnahme (Jannes, 2026-10-02):** bestätigt.

### ANN-124 — Die Anwendung verschickt keinen Bericht; ob er an die Verordner:in gehen darf, entscheidet die Praxis

Recht · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2); vor dem ersten Bericht mit echten Daten

**Annahme.** Der Bericht wird gedruckt, als PDF gespeichert oder gefaxt — von der Praxis, außerhalb der Anwendung. Eine Einwilligung oder Schweigepflichtentbindung für die Übermittlung wird nicht erfasst und nicht geprüft; die Seite sagt nur „Die Anwendung verschickt nichts".

**Begründung.** Die Weitergabe an die verordnende Ärzt:in ist eine Offenbarung nach § 203 StGB und braucht eine Grundlage — üblich ist die Anforderung des Berichts auf der Verordnung mit Wissen der Patient:in oder eine ausdrückliche Einwilligung. Welche die Praxis verwendet, ist eine Frage der Datenschutzberatung (§15.2) und blockiert das Bauen mit synthetischen Daten nicht, wohl aber den ersten echten Bericht. Ein Versand aus der Anwendung wäre ein neuer externer Datenfluss (ADR-002) und ist nicht Teil von DOK-005.

**Anker.** Der Hinweis unter dem Druckknopf in `src/features/therapy-reports/TherapieberichtDruckPage.tsx`.

**Änderungspfad.** Vermerk „Bericht angefordert / Einwilligung liegt vor" vor dem Druck: ein Feld am Bericht und eine Bedingung am Knopf · Aufwand `klein`. Versand aus der Anwendung: eigenes Epic nach ADR-002 · Aufwand `groß`. **Abnahme (Jannes, 2026-10-02):** bestätigt; die Grundlage der Übermittlung klärt B2 — der Hinweis „Die Anwendung verschickt nichts“ ersetzt diese Klärung nicht.

### ANN-125 — Beim Entfernen der Metadaten bleibt nur die Ausrichtung und, was der Dekoder braucht

Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2); am echten Gerät in der Sichtung (Fotos Schritt 1)

**Annahme.** Vor jedem Upload eines JPEG oder PNG — aus dem Dateiwähler wie aus dem Kameradialog — entfernt das Gerät alle Segmente und Chunks neben den Bilddaten: EXIF samt GPS und Vorschaubild, XMP, IPTC, Kommentare, Farbprofile (ICC, `iCCP`), Textchunks, Zeitstempel, JFIF und alles hinter dem Bildende (angehängte Zweitbilder). Erhalten bleiben die Ausrichtung als neues, minimales EXIF-Segment beziehungsweise `eXIf`-Chunk, das Adobe-Segment eines JPEG (Farbumrechnung) und die Farbangaben eines PNG (`gAMA`, `cHRM`, `sRGB`, `sBIT`, `tRNS`) sowie Animationschunks. Die Bilddaten bleiben Byte für Byte. Es gilt eine **Erlaubnisliste**: Ein Segment oder kritischer Chunk, der weder Bilddaten noch bekannte Metadaten ist (reservierter JPEG-Marker, unbekannter kritischer PNG-Chunk), lässt das Bild abweisen; ebenso ein Bild, das sich nicht sicher zerlegen lässt.

**Begründung.** ADR-017 Punkt 34 verlangt „verlustfrei, nur die Ausrichtung bleibt" und nennt EXIF, XMP, IPTC und das Vorschaubild. Offen ließ er, was mit Angaben geschieht, die nichts über die Aufnahme sagen, aber das Lesen des Bildes steuern. Ein ICC-Profil trägt im Kopf Hersteller und Gerät und geht deshalb; ohne es erscheint ein Weitraumfoto etwas blasser — für ein Dokument ohne Belang, für ein Verlaufsfoto hinnehmbar. Das Adobe-Segment dagegen braucht der Dekoder für die Farben mancher Scans und sagt nichts über Ort, Zeit oder Gerät. Angehängte Zweitbilder (Mehrbildformate, Tiefenkarten) tragen eigene Metadaten. Unsicher: ob die Prüfung auch das Adobe-Segment entfernt sehen will.

**Anker.** `istBildsegment`, `bereinigeJpeg`, `bereinigePng`, `PNG_BEHALTEN` und `PNG_KRITISCH` in `src/features/files/metadaten.ts`; Nachweis in `src/features/files/metadaten.test.ts`.

**Änderungspfad.** Ein Segment mehr oder weniger behalten: eine Bedingung in `bereinigeJpeg` beziehungsweise ein Eintrag in `PNG_BEHALTEN` · Aufwand `klein`. Farbprofil behalten, aber Hersteller- und Geräteangaben darin leeren: eine eigene Bereinigung des ICC-Kopfs · Aufwand `mittel`. **Abnahme (Jannes, 2026-10-02):** bestätigt mit Ergänzung: Metadatenfreiheit zusätzlich serverseitig absichern; Ausrichtung und korrekte Farbdarstellung erhalten (BEF-105). **Fassung 3 (ABN-026, 2026-10-02, BEF-105, ADR-017 Punkt 53):** Trägt ein Bild aus dem Dateiwähler ein Farbprofil, das **nicht sRGB** ist, rechnet das Gerät es vor der Bereinigung nach sRGB um (Ausrichtung in die Pixel übernommen, JPEG mit Qualität 0,95); danach entfernt die Bereinigung das Profil wie bisher. Ein sRGB-Profil gilt nicht als abweichend — Chromium bettet es in jedes Canvas-JPEG ein, auch in die Bilder des Kameradialogs, die sonst bei jedem Foto neu kodiert würden. Erkannt wird sRGB am RGB-Farbraum im Kopf und „sRGB“ in der Beschreibung; ein unlesbares Profil gilt als abweichend. Anker: `hatFarbprofil` und `nachSrgb` in `src/features/files/farbe.ts`.

### ANN-126 — Patientenfotos stehen auf Einwilligung, leben höchstens zwölf Monate und sind gesperrt, sobald sie fällig sind

Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2) und DSFA (G14), vor dem ersten Foto einer echten Person (ADR-017 Punkt 41)

**Annahme.** Ein Patientenfoto stützt sich auf die ausdrückliche Einwilligung (Art. 9 Abs. 2 lit. a DSGVO), ist Arbeitshilfe neben der Akte und hat die Klasse `patientenfoto`: fällig zum frühesten von zwölf Monaten nach der Aufnahme, drei Monaten nach dem **festgehaltenen** Abschluss der Versorgung (`care_concluded_at`) und dem ersten Widerruf nach der Aufnahme. **Aufnahme** ist das Anlegen der Zeile vor dem Upload, damit ein Widerruf auch einen laufenden Upload trifft. Ein fälliges Foto ist auf allen Wegen gesperrt — Liste, Verweis, Leseregel am Objekt, Herausgabe, Löschen von Hand —, auch wenn ein Legal Hold die Löschung anhält; dann wird die Sperre festgehalten (`photo_locked_at`), damit eine Wiederaufnahme der Versorgung sie nicht aufhebt. Neue Fotos setzen eine Erteilung voraus und dass ein Foto von jetzt nicht schon fällig wäre (Versorgung höchstens drei Monate abgeschlossen); eine neue Einwilligung gilt nur für neue Fotos. Der Widerruf löscht in derselben Transaktion, das Ende des Hold und die Wiederaufnahme ebenso, sonst der Löschlauf.

**Begründung.** ADR-017 Punkte 35, 36 und 38 (Fassung 2, von Jannes am 2026-09-26 bestätigt). Offen ließ der ADR, ob ein wegen Ablaufs fälliges, vom Hold gehaltenes Foto sichtbar bleibt: Gesperrt ist die sparsamere Lesart, denn der Hold sichert Beweise und keinen Arbeitsgebrauch (ADR-008 Konsequenzen: er setzt die Löschung aus, nicht die Zugriffsregeln — die Zugriffsregel ist hier die Frist). Zwölf und drei Monate sind interne Initialentscheidungen nach ADR-008. Unsicher: die Einordnung selbst — die Sekundärquellen stützen Verlaufsfotos überwiegend auf Art. 9 Abs. 2 lit. h DSGVO als Teil der Akte (ADR-017, Konsequenzen der Fassung 2).

**Anker.** Klassenzeile `patientenfoto`, Spalte `patient_files.photo_locked_at` sowie `app.patient_photo_due_at`, `app.patient_photo_accessible` und `app.delete_due_patient_photos` in `supabase/migrations/20260926150000_dok_006b_patient_photos.sql`; Nachweis in `supabase/tests/patient-photos.test.ts`.

**Änderungspfad.** Andere Fristen: Intervall oder Obergrenze der Klassenzeile · Aufwand `klein`. Alternative aus Bestätigungsfrage 9 (Teil der Akte, zehn Jahre, Widerruf stoppt nur neue Fotos): Klassenzeile auf `patientenakte`, `delete_due_patient_photos` aus dem Widerruf nehmen und `patient_photo_due_at` ohne Widerruf rechnen · Aufwand `mittel`. **Abnahme (Jannes, 2026-10-02):** geändert: Medizinisch notwendige Dokumentationsfotos gehören zur Akte; die kurzen Fristen gelten nur für zusätzliche, vorübergehende Foto-Arbeitshilfen; ein Widerruf hebt gesetzliche Aufbewahrung und Legal Hold nicht auf (BEF-106, neue Fassung ADR-017). **Fassung 3 (ABN-023, 2026-10-02, BEF-106, ADR-017 Abschnitt H):** Diese Annahme gilt nur noch für die **Foto-Arbeitshilfe** (Schlüssel `patientenfoto`, in der Oberfläche „Arbeitshilfe“). Daneben gibt es das **Dokumentationsfoto** (`dokumentationsfoto`): Teil der Akte, Grundlage Behandlung (Art. 9 Abs. 2 lit. h DSGVO), keine Einwilligung, Klasse und Bucket `patientenakte`; der Widerruf berührt es nicht, ein Legal Hold hält es wie die Akte; löschen von Hand nur am Aufnahmetag (Zeitzone der Praxis) durch die aufnehmende Person oder owner, danach nur mit der Akte; keine Korrektur zwischen den Fotoarten. Anker: `app.is_patient_photo_type`, `app.patient_photo_usable`, `app.documentation_photo_deletable` in `supabase/migrations/20261004100000_abn_023_documentation_photos.sql`. Wiedervorlage B2 (lit. h).

### ANN-127 — Eine Ablehnung ist ein eigener Vermerk; die Fotoeinwilligung ist der dritte Zweck

Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2) mit dem Wortlaut der Fotoeinwilligung; Erstaufnahme (PRX-EPIC-003)

**Annahme.** `patient_privacy_records` kennt neben Erteilung und Widerruf die Vermerkart `consent_refused` für jeden Zweck: zulässig, solange der Zweck nicht erteilt und nicht schon abgelehnt ist; danach ist eine Erteilung möglich. Die Oberfläche zeigt „abgelehnt am …" als erledigten Stand. Neuer Zweck ist `patient_photos`; der Widerruf dort löscht die Fotos und steht vor dem Vermerken so auf der Seite und der Schaltfläche. Wortlaut der Fotoeinwilligung und ein Satz in der Datenschutzinformation kommen mit B2 — bis dahin nennt die ausgedruckte Information zwei Zwecke, und Fotos echter Personen gibt es nicht (ADR-017 Punkt 41).

**Begründung.** ADR-017 Punkt 35: „Eine Ablehnung ist ein eigener Vermerk, kein Widerruf", und ohne Einwilligung wird genauso behandelt (Art. 7 Abs. 4 DSGVO) — die Erstaufnahme soll „abgelehnt" als erledigt führen, nicht als offenen Punkt. Eine Ablehnung während einer erteilten Einwilligung wäre in der Sache ein Widerruf mit anderer Rechtsfolge; deshalb abgewiesen. Den Druckbogen jetzt zu ändern hieße, eine neue Fassung der Datenschutzinformation vor der Prüfung ihres Wortlauts auszugeben.

**Anker.** Constraints `record_kind`, `purpose` und `purpose_shape` sowie `public.record_patient_privacy_entry()` in `supabase/migrations/20260926150000_dok_006b_patient_photos.sql`; `vermerkartSchema`, `EINWILLIGUNGSZWECKE` und `datenschutzstand` in `src/features/datenschutz/vermerke.ts`; `FOTO_WIDERRUF` in `src/features/datenschutz/PatientDatenschutzPage.tsx`.

**Änderungspfad.** Ablehnung nur für Fotos: eine Bedingung in `record_patient_privacy_entry` und in `moeglicheVermerke` · Aufwand `klein`. Fotoeinwilligung als eigener Druckbogen neben der Datenschutzinformation: ein Blatt in `vorlage.ts` und eine neue Fassung · Aufwand `klein`. **Abnahme (Jannes, 2026-10-02):** Ablehnung als eigener Vermerk bestätigt; Widerruf und Löschung gelten nur für Foto-Arbeitshilfen, nicht für Dokumentationsfotos der Akte, und nie gegen Aufbewahrungspflicht oder Legal Hold (BEF-106). **Fassung 3 (ABN-023, 2026-10-02, BEF-106):** Die Einwilligung `patient_photos` ist nur noch Voraussetzung der Arbeitshilfe; ohne sie oder bei Ablehnung bietet der Fotobereich das Dokumentationsfoto an und sagt bei der Arbeitshilfe, warum sie nicht geht. Der Widerruf löscht nur Arbeitshilfen (`app.delete_due_patient_photos` kennt nur `patientenfoto`); die Texte am Einwilligungsstand sagen es.

### ANN-128 — Ein Patientenfoto wird als Einzeldatei durch owner herausgegeben, mit eigenem Auditereignis

Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2); Verfahren der Betroffenenrechte (OPS-006) · **LOG-EPIC-001:** gilt weiter (`patient_file.handed_out` bleibt im Katalog).

**Annahme.** Die Auskunft nach Art. 15 DSGVO nennt jedes Foto wie jede Datei mit Name, Art und Prüfsumme, enthält es aber nicht. Die Kopie des Fotos selbst — nach Art. 15 Abs. 3 und, weil die Einwilligung die Grundlage ist, nach Art. 20 DSGVO — entsteht auf der Seite „Auskunft und Löschverlangen" je Foto als JPEG, nur durch `owner`, nur für ein nicht gesperrtes Foto, protokolliert als `patient_file.handed_out`. Ein Paket aller Fotos gibt es nicht.

**Begründung.** ADR-017 Punkt 40 lässt als einzige Herausgabe die an die Person selbst zu und überlässt Einzeldatei oder Paket und das Auditereignis dem Bau. Einzeldateien brauchen kein Archivformat (Punkt 18 schließt Archive aus) und halten das Protokoll je Foto genau. Ein eigenes Ereignis trennt den Export nach außen vom Öffnen in der Praxis (ADR-010 Punkt 2). Unsicher: ob die Prüfung für Art. 20 ein strukturiertes Paket mit Metadaten erwartet.

**Anker.** `public.hand_out_patient_photo()` in `supabase/migrations/20260926160000_dok_006d_patient_photo_handout.sql`; `gibPatientenfotoHeraus` in `src/features/files/patientenfotos.ts`.

**Änderungspfad.** Paket mit allen Fotos und einer Übersicht: eine zweite Funktion und ein Archivformat, das Punkt 18 dafür ausdrücklich zulässt · Aufwand `mittel`. Herausgabe auch durch office: Rollenprüfung in `app.auskunft_organisation` bzw. der Funktion · Aufwand `klein`. **Abnahme (Jannes, 2026-10-02):** owner und Protokollierung bestätigt; geändert: Die vollständige Kopie enthält die Fotos selbst, und noch vorhandene, gesperrte Fotos sind nicht pauschal ausgeschlossen (BEF-107). **Fassung 2 (ABN-017, 2026-10-02, BEF-107):** Die Auskunft führt jedes vorhandene Foto (`patient_photos`), auch gesperrte; owner gibt auch ein gesperrtes, noch vorhandenes Foto als Datei heraus (`hand_out_patient_photo`, Audit mit `gesperrt`), die Liste dazu liefert `list_patient_photos_for_access_request`. Bewusst getragen: Die Datenbank kennt keinen Auskunftsvorgang und prüft den Zweck deshalb nicht; die Sperre gilt für `owner` bei der Herausgabe nicht, unabhängig davon, von welcher Seite aus sie geschieht. Das Restrisiko — owner gibt ein gesperrtes Foto ohne Verlangen heraus — fängt das Auditereignis mit `gesperrt` auf, das jede solche Herausgabe einzeln nachweist. Strenger: ein Auskunftsvorgang als Datensatz und dessen Kennung als Pflichtargument · Aufwand `mittel`. Wiedervorlage B2. **Fassung 3 (ABN-023, 2026-10-02):** Auskunft und Herausgabe führen beide Fotoarten mit ihrer Art (`patient_photos.art`, `list_patient_photos_for_access_request.document_type`); das Dokumentationsfoto ist nie gesperrt und wird aus dem Bucket `patientenakte` herausgegeben.

### ANN-129 — Die Seite wird an Extremitäten und Kiefer einmal je Region gewählt, an der Wirbelsäule je Test

Praxisprozess · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Jannes in der Sichtung (Befund, Schritt 6)

**Annahme.** Eine Region, deren Tests und Techniken alle seitengetrennt sind (Schulter, Ellenbogen, Hand, Hüfte, Knie, Fuß, Kiefer), fragt nach der Regionswahl einmal „links", „rechts" oder „beidseits", ohne Vorauswahl; erst danach klappen die Blöcke auf. Bei einer Seite hat jeder Test eine Zeile, und die Seite steht nur in der Überschrift des Textes („Untersuchung Hüfte rechts"). Bei „beidseits" bekommt jeder Test eine Zeile für links und eine für rechts; gleiche Ergebnisse stehen im Text als „bds.". An HWS und LWS gibt es keine Regionsseite: Die seitengetrennten Tests (Neurologie, Neurodynamik, SIG) haben immer eine Zeile je Seite. Gemessene Tests (Knee to Wall, Navicular Drop) haben immer beide Seiten. Ein Wechsel von einer Seite auf die andere nimmt die Angaben mit; von „beidseits" auf eine Seite fallen die der anderen Seite weg.

**Begründung.** Jannes, 2026-09-26: An den Extremitäten geht es meist um eine Seite, die Seitenwahl an jedem Test war zu umständlich. Keine Vorauswahl, weil eine falsche Seite in der Akte schwerer wiegt als ein Tipp mehr. Die Wirbelsäule ist keine seitige Region; dort ist bei Nerventests gerade der Seitenvergleich der Befund. Mitnehmen beim Wechsel, weil der Wechsel meist einen Vertipper korrigiert; Wegfallen statt Verstecken, weil unsichtbare Angaben im Text auftauchen würden, ohne dass man sie sieht (§13). Unsicher: ob „beidseits" bei gleichen Ergebnissen lieber zwei Zeilen zeigen soll.

**Anker.** `seitenDes` und `seiteUmstellen` in `src/features/assessments/dokumentationstext.ts`; Oberfläche `SeitenWahl` in `BausteinFeld.tsx`; Tests in `dokumentationstext.test.ts` und `BausteinFeld.test.tsx`.

**Änderungspfad.** Vorauswahl oder zuletzt gewählte Seite: Anfangswert in `useBausteinAuswahl` · Aufwand `klein`. Regionsseite auch an der Wirbelsäule: `seitlicheRegion` · Aufwand `klein`. „bds." nie zusammenfassen: `eintraege` · Aufwand `klein`. **Abnahme (Jannes, 2026-10-02):** Seitenwahl bestätigt; beim Wechsel von „beidseits“ auf eine Seite gehen Ergebnisse der anderen Seite nicht still verloren (BEF-103). **Fassung 2 (ABN-015, 2026-10-02, BEF-103 Punkt 2):** Von „beidseits“ auf eine Seite fragt das Feld vorher und nennt die Zahl der Angaben, die verloren gingen (`verworfeneAngaben`); Abbrechen lässt alles stehen.

### ANN-130 — Der Dokumentationstext aus Bausteinen: Zeichen statt Wort, Ausgangsstellung nur beim Abhaken, gegliedert

Praxisprozess · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Jannes in der Sichtung (Befund, Schritt 6)

**Annahme.** Ein Test hat die Ergebnisse o.B., positiv und nicht getestet (Jannes' Festlegung, ersetzt negativ und nicht beurteilbar). Im Text steht je Block ein Absatz mit Überschrift, je Test eine Zeile mit dem Ergebnis als Zeichen vorn — ✅ für o.B., ❗ für positiv —, dahinter Seite, Messwert und nach „–" die Notiz. „Nicht getestet" steht ausgeschrieben in einer Sammelzeile am Ende des Absatzes. Unterpunkte einer Testgruppe (Impingement, LET, Motorik) stehen eingerückt unter dem Gruppennamen; eine Ausgangsstellung (`ausgangsstellung: true`, heute nur Rückenlage und Bauchlage der Hüfte) steht beim Abhaken, aber nicht im Text. Techniken stehen als Aufzählung mit „•".

**Begründung.** Jannes, 2026-09-26: Der übernommene Text war zu unübersichtlich; Zeichen für o.B. und positiv, „nicht getestet" ausgeschrieben, die Ausgangsstellung nicht im Text, Absätze und Aufzählungspunkte. Die Wahl der beiden Zeichen ist unsere: Sie unterscheiden sich in Form und Farbe (auch ohne Farbsehen lesbar), ✅ ist das übliche „in Ordnung", ❗ markiert den Befund, dem man im Verlauf nachgeht. Die Zeichen geben nur wieder, was die Therapeut:in selbst gewählt hat — Erfassen und Darstellen nach ADR-006 Punkt 2, keine abgeleitete Bewertung und keine Ampel im Sinn von Punkt 11. Der Text ist Klartext mit Unicode-Zeichen; Akte, Druck und Textfeld zeigen ihn unverändert, und kein Druckweg der Plattform setzt ihn in eine Schrift ohne diese Zeichen (der Therapiebericht nach DOK-005 übernimmt keinen Dokumentationstext). Die Gruppenzeile bleibt, weil ein Unterpunkt wie „Passiver Provokationstest" ohne „MES" nicht eindeutig ist. Unsicher: ob Verordner:innen, die einen Auszug der Akte erhalten, die Zeichen ohne Legende lesen.

**Anker.** `ERGEBNIS_ZEICHEN` und `dokumentationstext` in `src/features/assessments/dokumentationstext.ts`; `ausgangsstellung` in `bausteinItemSchema` (`schema.ts`) und in `definitionen/bausteine/06-huefte.json` (Version 1.1.0); Tests in `dokumentationstext.test.ts`, `schema.test.ts`, `bausteine.test.ts`.

**Änderungspfad.** Andere Zeichen oder Wörter statt Zeichen: `ERGEBNIS_ZEICHEN` · Aufwand `klein`. Weitere Ausgangsstellungen: das Feld in der Regionsdatei, Version heben · Aufwand `klein`. „Nicht getestet" je Zeile statt gesammelt: `schreibe` · Aufwand `klein`. **Abnahme (Jannes, 2026-10-02):** Gliederung bestätigt; im gespeicherten Text stehen „o.B.“ bzw. „positiv“ ausgeschrieben, die Zeichen ergänzen nur (BEF-103). **Fassung 2 (ABN-015, 2026-10-02, BEF-103 Punkt 3):** Im Text steht das Ergebnis ausgeschrieben hinter dem Test („✅ Lachman-Test re.: o.B.“, „❗ …: positiv“); das Zeichen ergänzt nur.

### ANN-131 — Blätter für den Fensterumschlag: DIN 5008 Form B, Fenster links

Praxisprozess · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Jannes beim ersten Probedruck einer Rechnung im Fensterumschlag

**Annahme.** Rechnung, Stornodokument und Zahlungserinnerung werden für einen Fensterumschlag DL nach DIN 5008 Form B mit Fenster links gedruckt: Das Anschriftfeld liegt 20 mm vom linken und 45 mm vom oberen Blattrand und ist 85 × 45 mm groß; die Angaben rechts (Nummer, Datum, behandelte Person) beginnen bei 125 mm; Vermerke stehen unter dem Feld, nicht darin. Am Bildschirm ändert sich nichts.

**Begründung.** UX-Review 2026-09 (Review ABR-22, im Druckmodus gemessen): Die Anschrift begann bisher 12 mm vom Rand, beim Stornodokument erst bei 77 mm; die ersten Buchstaben lagen damit im Fensterumschlag verdeckt. Form B ist die in Deutschland verbreitete Lage für Geschäftsbriefe; ein Umschlagformat hat die Praxis noch nicht festgelegt. Die Angaben des Blatts kommen aus dem Snapshot (ADR-009 Punkt 10) — eine andere Lage ändert keine Rechnungsangabe. Die Form des verschickten Blatts bewahrt erst Weg 3 auf (B14): Nachdrucke schon ausgestellter Blätter sehen seit UXR-010 anders aus als das Original, ihre Angaben bleiben gleich. Aktenzeichen oder Versichertennummer stehen bei den Angaben rechts, nicht im Anschriftfeld, damit sie nicht durch das Fenster lesbar sind (Zweitreview H3). Unsicher: Anschriften mit mehr als etwa sechs Zeilen ragen unter das Fenster (synthetischer Behördenempfänger: Feldende bei 106 mm).

**Anker.** `Briefkopf` in `src/features/billing/Briefkopf.tsx` (Druckklassen des Anschriftfelds und der Angaben); Nutzung in `InvoicePrintPage.tsx`, `CancellationPrintPage.tsx`, `ReminderPrintPage.tsx`.

**Änderungspfad.** Form A (27 mm von oben) oder Fenster rechts: die Druckklassen in `Briefkopf.tsx` · Aufwand `klein`. **Abnahme (Jannes, 2026-10-02):** bestätigt.

### ANN-132 — Die Dringlichkeit auf der Warteliste ist organisatorisch: drei Gründe und ein Datum

Praxisprozess · entschieden (Jannes) · 2026-09-28 · Jannes (Sichtung Praxisverwaltung, Schritt 1) · erledigt · Wiedervorlage: —

**Annahme.** Ein Eintrag der Warteliste trägt als Dringlichkeit genau einen von drei Gründen — **Wunsch der Person**, **Verordnung endet**, **Vorgabe der Praxis** — und optional ein Datum „bis spätestens“. Die Liste ordnet nach diesem Datum (ohne Datum zuletzt), dann nach Wartezeit. Einen Freitext als Dringlichkeit, eine Stufe wie „hoch“ oder eine Einordnung nach Beschwerdebild gibt es nicht; die Notiz ist ausdrücklich organisatorisch.

**Begründung.** `IDEA-PRX-003` verlangt, die Dringlichkeit „organisatorisch zu fassen …, nicht als klinische Einstufung“: Eine Reihung nach Beschwerdebild wäre eine Risikoklassifikation und ist nach ADR-006 Punkt 4 ausgeschlossen. Ein Datum und ein benannter Grund sind prüfbar und deterministisch (§6.2); eine Punktzahl wäre eine Bewertung, die niemand nachvollziehen kann. Unsicher: ob Jannes einen vierten Grund braucht (etwa „nach Krankenhausaufenthalt“ — das wäre klinisch und gehört dann in die Notiz der Akte, nicht hierher).

**Anker.** Constraint `priority_reason` an `public.waitlist_entries` und `app.waitlist_check_input` in `supabase/migrations/20260928100000_prx_001_waitlist.sql`; Beschriftungen `reasonLabels` in `src/features/waitlist/api.ts`; Test „kennt nur organisatorische Gruende“ in `supabase/tests/waitlist.test.ts`.

**Änderungspfad.** Ein weiterer Grund: Wert in Constraint und Prüfung, Beschriftung in `api.ts` · Aufwand `klein`. Eine andere Reihung: `order by` in `list_waitlist_entries` · Aufwand `klein`.

### ANN-133 — Ein geschlossener Wartelisteneintrag fällt zwölf Monate nach dem Schließen

Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung mit dem Retention Schedule (ADR-007, ADR-008)

**Annahme.** Ein offener Eintrag bleibt, bis er geschlossen wird oder mit der Akte fällt. Ein geschlossener — eingeplant oder zurückgezogen — wird zwölf Monate nach dem Schließen gelöscht (Klasse `warteliste`, Anker „Abschluss des Vorgangs“) und im Löschjournal festgehalten. Ein Legal Hold an der Akte hält die Löschung an. Die Auskunft nach Art. 15 enthält die Einträge.

**Begründung.** ADR-008 kennt keine Klasse „Warteliste“; am nächsten liegt „Terminanfragen ohne Behandlungsverhältnis — 12 Monate nach letztem Kontakt“ (interne Initialentscheidung). Ein Wartelisteneintrag ist eine Terminanfrage **mit** Behandlungsverhältnis, sein Zweck endet mit dem Schließen; zwölf Monate lassen nachvollziehen, warum jemand eingeplant wurde, ohne ihn in die zehnjährige Akte zu ziehen — er ist kein Behandlungsnachweis. Unsicher: ob die Datenschutzprüfung eine kürzere Frist verlangt (Zweck erfüllt mit dem Termin).

**Anker.** Klasse `warteliste` und zwei Zuordnungen in `supabase/migrations/20260928100000_prx_001_waitlist.sql`; Regel in `public.apply_retention`, Reihenfolge in `public.reapply_deletion_journal`; Beschriftung in `src/features/retention/klassen.ts`; Tests „Warteliste im Loeschlauf“ in `supabase/tests/waitlist.test.ts`.

**Änderungspfad.** Andere Frist: `retention_interval` der Klasse `warteliste` (Datenänderung) · Aufwand `klein`. Löschen sofort beim Schließen: Regel im Lauf auf `closed_at` ohne Intervall · Aufwand `klein`. **Abnahme (Jannes, 2026-10-02):** bestätigt; offene Einträge werden regelmäßig auf Aktualität geprüft (BEF-108). **Fassung 2 (ABN-018, 2026-10-02, BEF-108 Punkt 1):** Offene Einträge, die länger als `app.waitlist_review_interval()` (acht Wochen, ANN-220) unverändert sind, tragen `review_due` und stehen unter „Warteliste prüfen“ in Offene Punkte; „Noch aktuell“ (`confirm_waitlist_entry`, Audit `waitlist_entry.reviewed`) beginnt die Frist neu.

### ANN-134 — Das Lesen der Warteliste wird wie das Lesen des Kalenders nicht protokolliert

Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Datenschutzprüfung mit dem Auditkatalog (ADR-010) · **LOG-EPIC-001:** gilt; der abgewiesene Versuch steht als `access.denied`.

**Annahme.** Anlegen, Ändern und Schließen eines Eintrags schreiben je einen Auditeintrag (`waitlist_entry.*`, nur Metadaten, nie die Notiz). Das Lesen der Liste schreibt keinen; ein abgewiesener Leseversuch schon (`waitlist.read`, G6b).

**Begründung.** Die Liste zeigt organisatorische Angaben — Name, Telefon, Postleitzahl, Wunschzeiten, Grund —, dieselben, die Kalender und Tagesliste ohne Leseprotokoll zeigen (ADR-010 Punkt 2 nennt klinische Dokumente, Verordnung, Scan und Export als lesepflichtig). Ein Leseeintrag je Aufruf einer Arbeitsliste, die das Büro mehrmals am Tag öffnet, verwässerte das Protokoll, ohne einen Zugriff sichtbar zu machen, den der Kalender nicht ohnehin erlaubt. Unsicher: Die Notiz könnte gegen die Anweisung am Feld Gesundheitsangaben enthalten.

**Anker.** `public.list_waitlist_entries` in `supabase/migrations/20260928100000_prx_001_waitlist.sql` (kein Auditeintrag im Erfolgsfall); Katalog in `src/features/audit/actions.ts`; Fall in `supabase/tests/abgewiesene-lesepfade.test.ts`.

**Änderungspfad.** Leseprotokoll: ein `waitlist.viewed` je Aufruf in `list_waitlist_entries`, Wert im Auditkatalog · Aufwand `klein`. **Abnahme (Jannes, 2026-10-02):** bestätigt.

### ANN-135 — Gebietstage: genaue Postleitzahl, Tageshälfte am Beginn, Warnung statt Sperre

Praxisprozess · entschieden (Jannes) · 2026-09-28 · Jannes (Sichtung Praxisverwaltung, Schritte 1 und 2) · erledigt · Wiedervorlage: —

**Annahme.** Ein Gebiet ist eine Liste **genauer** Postleitzahlen (kein Präfix, kein Stadtteil) mit Wochentagen und Tageshälften; eine Postleitzahl gehört höchstens zu einem Gebiet. Vormittag heißt **Beginn vor 12:00**, Nachmittag **Beginn ab 12:00**, jeweils in Praxiszeit; beides angehakt heißt ganztags. Ein Hausbesuch außerhalb des Gebietstags seiner Adresse wird **gemeldet**, nie gesperrt. Geprüft wird die Postleitzahl, die der Termin trägt: beim Bearbeiten die festgehaltene Anschrift, beim Anlegen die aus den Kontaktdaten.

**Begründung.** `IDEA-PRX-031`: „eine Vorbelegung, keine Optimierung … Termine bleiben frei vergebbar; die Regel warnt, sie verbietet nicht“. Die genaue Postleitzahl ist die Angabe, die an jeder Anschrift sicher vorliegt und sich deterministisch vergleichen lässt (§6.2) — ein Stadtteil stünde nicht in der Adresse, ein Präfix fasste in Städten ganz andere Gegenden zusammen. Die Grenze um 12:00 am Beginn ist die einfachste Regel, die ein Mensch am Kalender nachrechnen kann. Die Regel sagt nichts über Personen oder Touren (B6) und braucht keinen Kartendienst (E12).

**Anker.** `app.territory_day_status` in `supabase/migrations/20260928110000_prx_002_territories.sql` (die eine Stelle der Regel), `check_territory_days` für die Formulare; Hinweis `src/features/territories/TerritoryHint.tsx`; Tests in `supabase/tests/territories.test.ts`.

**Änderungspfad.** Andere Grenze der Tageshälfte oder Präfixe statt genauer Postleitzahlen: nur `app.territory_day_status` und die Prüfung in `save_territory` · Aufwand `klein`. Sperre statt Warnung: Prüfung in `create_appointment` mit Rückfrage wie bei der Arbeitszeit · Aufwand `mittel`.

### ANN-136 — Terminsuche: dicht gepackte Vorschläge, Fahrzeit als Warnung für die ersten zehn

Praxisprozess · entschieden (Jannes) · 2026-09-28 · Jannes (Sichtung Praxisverwaltung, Schritt 2: „Reihenfolge passt“) · erledigt · Wiedervorlage: E12 Punkt 4 (Warnung oder Sperre)

**Annahme.** Die Terminsuche schlägt je freier Lücke den ersten Rasterpunkt in der Wunschzeit vor und danach dicht aufeinander folgende Plätze (Beginn plus Dauer), höchstens 50 in höchstens 42 Tagen. Belegt ist, was die Therapeut:in **oder** die Patient:in schon hat. Beim Hausbesuch stehen Vorschläge im Gebietstag vorn (ANN-135). Für die ersten **zehn** Hausbesuchsvorschläge holt die Anwendung die Fahrzeit von und zu den Nachbarterminen derselben Person live mit **einer** Matrix beim eigenen Kartendienst; der Server bewertet sie mit der Rundungsregel aus §8.1. Ein knapper Weg wird gekennzeichnet und nach hinten gestellt, **nicht verworfen**; fehlt eine Fahrzeit, steht „Fahrweg nicht geprüft“. Gespeichert wird nichts.

**Begründung.** §8 nennt die Fahrzeit unter den harten Constraints für Terminvorschläge; E12 Punkt 3/4 und ANN-097 lassen die Fahrzeit aber nur live und nur als Warnung zu, und eine pauschale Fahrzeit ist ausgeschlossen. Nach Rang (§21) gilt die Prinzipienregel, umgesetzt so weit, wie die geltenden Festlegungen tragen: Die Fahrzeit wird für jeden geprüften Vorschlag berücksichtigt, die Entscheidung bleibt beim Menschen, und ein Vorschlag verschwindet nicht wegen einer Zahl, deren Grundlage (Wegprofil, Abstellzeit) noch niemand an echten Tagen geprüft hat. Die Grenze von zehn hält eine Suche bei einem Matrixaufruf mit höchstens elf Punkten je Seite (ANN-091: 25). Dichtes Packen ist die einfachste deterministische Regel, die Lücken schließt statt neue zu reißen; eine Bewertung nach Wegen wäre Optimierung (`IDEA-PRX-031`: „keine Optimierung“). Unsicher: ob Jannes knappe Vorschläge lieber ganz ausblendet — dann wird aus der Warnung ein Filter.

**Anker.** `public.find_free_slots` und `public.rate_slot_travel` in `supabase/migrations/20260928120000_prx_003_slot_search.sql`; `TRAVEL_CHECK_LIMIT` und `orderByTravel` in `src/features/slot-search/api.ts`; Tests in `supabase/tests/slot-search.test.ts`.

**Änderungspfad.** Knappe Wege ausblenden: Filter in `orderByTravel` · Aufwand `klein`. Mehr geprüfte Vorschläge: `TRAVEL_CHECK_LIMIT` bis zur Grenze der Matrix · Aufwand `klein`. Andere Packregel (etwa halbstündlich): `generate_series` in `find_free_slots` · Aufwand `klein`.

### ANN-137 — Kurzblick am Termin: aufklappbar, jedes Aufklappen protokolliert, letzter Haupteintrag im Wortlaut

Datenschutz · entschieden (Jannes) · 2026-09-29 · Jannes (Sichtung Praxisverwaltung, Schritt 5) · Prüfpaket · Wiedervorlage: Datenschutzprüfung mit dem Auditkatalog (ADR-010); Jannes nach der Sichtung · **LOG-EPIC-001:** geändert – das Aufklappen schreibt „Akte geöffnet“, einmal je Person, Akte und Tag (ANN-230).

**Annahme.** Der Vertretungs-Kurzblick steht an jedem Behandlungstermin **zugeklappt** und wird erst beim Aufklappen gelesen. Er zeigt Zugangshinweis, Besonderheit, feste Therapeut:in, die Grundlage mit Terminzahl und Mengen je Heilmittel und den **letzten Haupteintrag** der Person vor diesem Termin im Wortlaut — auch einen Entwurf, als Entwurf gekennzeichnet; Nachträge nur in der Akte. Jedes Aufklappen schreibt `appointment_brief.viewed`, der gezeigte Eintrag zusätzlich `treatment_note.viewed` mit der Oberfläche `appointment_brief`. Lesen dürfen die Rollen, die Termine **und** Dokumentation lesen (owner, therapist, team_lead, office); Trainingsbetreuung und Patientenkonto werden protokolliert abgewiesen.

**Begründung.** `IDEA-PRX-016` verlangt den Blick „aufklappbar und auditiert“; §4.2 macht die Vertretung zum Regelfall, und ADR-010 Punkt 2 und ADR-016 Punkt 9 machen das Lesen eines Eintrags protokollpflichtig — ein Kurzblick, der den Wortlaut zeigt, darf dieser Spur nicht ausweichen. Zugeklappt, weil die Tagesansicht im Treppenhaus mitgelesen wird (`IDEA-PRX-035`, §4.6). Der Wortlaut statt einer Zusammenfassung, weil jede Verdichtung eine Auswahl über klinischen Inhalt wäre (ADR-006 Punkt 2 und 4). Unsicher: ob der Entwurf gezeigt werden soll; ein unfertiger Text kann in die Irre führen, fehlt aber sonst genau dann, wenn die Kollegin am Vortag noch nicht finalisiert hat.

**Anker.** `public.get_appointment_brief` in `supabase/migrations/20260929100000_prx_006_appointment_brief.sql`; Oberfläche `src/features/appointments/Kurzblick.tsx`; Tests in `supabase/tests/appointment-brief.test.ts`.

**Änderungspfad.** Nur finalisierte Einträge: Bedingung `t.status = 'final'` in der Auswahl · Aufwand `klein`. Aufklappen ohne eigenes Ereignis (nur `treatment_note.viewed`): Einfügung in `get_appointment_brief` streichen, Wert im Katalog belassen · Aufwand `klein`. Weitere Felder (Wortlaut der Verordnung): Rückgabe erweitern · Aufwand `klein`.

### ANN-138 — „Mitnehmen“: von Hand gepflegte Liste an der Person, am Tag nur zusammengezählt

Praxisprozess · entschieden (Jannes) · 2026-09-29 · Jannes (Sichtung Praxisverwaltung, Schritt 4) · erledigt · Wiedervorlage: —

**Annahme.** Was für einen Besuch aufs Rad muss, steht als **von Hand gepflegte Liste an der Person** — höchstens zehn Einträge zu je 1 bis 60 Zeichen, ohne Doppel —, nicht am einzelnen Termin und nie aus Befund oder Dokumentation abgeleitet. Sie liegt bei den internen Versorgungsangaben neben der Behandlungsliege, erbt deren Rollenschnitt (alle vier Praxisrollen setzen und lesen, nie das Patientenkonto) und Datenklasse (Patientenakte), gehört zur Auskunft nach Art. 15 und wird wie die Liege mit `patient.updated` und dem Feldnamen protokolliert. Die Übersicht zeigte „Heute mitnehmen“ **zusammengezählt und ohne Person** über die noch anzufahrenden Besuche; **seit dem Design-Handoff vom 2026-10-01 entfällt diese Zeile** (Entscheidung Jannes: die einzige Tagesfrage der Übersicht ist die Liege). Mit Person steht die Liste weiter im Kurzblick am Termin und in der Akte.

**Begründung.** `IDEA-PRX-035` lässt offen, ob von Hand oder abgeleitet und ob am Termin, an der Person oder am Tag; ohne diese Entscheidung war nichts spezifizierbar. Abgeleitet scheidet aus: ein Vorschlag „aus den letzten Befunden“ wäre eine Auswertung klinischer Inhalte (ADR-006 Punkt 2 und 4). An der Person, weil sich das Material von Besuch zu Besuch wiederholt — eine Liste je Termin müsste jedes Mal neu entstehen und wäre am Serientermin leer. Ohne Namen am Tag, weil die Übersicht im Treppenhaus mitgelesen wird und „Kinesiotape für Frau X“ etwas über ihre Behandlung sagt (§4.6). Unsicher: ob die Praxis Material je Besuch braucht (etwa „diesmal den neuen Plan“) — dann trüge der Termin eine zweite, kurze Liste.

**Anker.** Spalte, Formregel `app.take_along_items_valid` und `public.set_take_along_items` in `supabase/migrations/20260929110000_prx_007_take_along.sql`; Anzeige am Termin `src/features/appointments/Kurzblick.tsx`; Pflege `src/features/patients/Mitnehmen.tsx`; Tests in `supabase/tests/take-along.test.ts`.

**Änderungspfad.** Material je Termin: eigene Spalte an `appointments` mit derselben Formregel, Kurzblick und Tagesliste lesen beide · Aufwand `mittel`. Zusammenzählung wieder in der Übersicht: `mitnehmenHeute` und seine Zeile aus der Git-Historie (bis zum UI-Redesign Schritt 3) · Aufwand `klein`. Andere Grenzen: nur `app.take_along_items_valid` und die Konstanten in `src/features/patients/api.ts` · Aufwand `klein`.

### ANN-139 — Abrechnungslage am Termin: Position für alle, Empfänger und offene Rechnungen nur für owner und office

Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Jannes nach der Sichtung; Datenschutzprüfung mit dem Rollenschnitt (ADR-004)

**Annahme.** Am Behandlungstermin steht „Termin n von m“ mit der Bauart der Grundlage — gezählt wie die Deckung (nicht abgesagte Termine der Grundlage nach Beginn und Kennung) — für alle Rollen der Terminverwaltung. Der **Standard-Rechnungsempfänger** (ohne Eintrag: die Person selbst) und die **offenen Rechnungen** der Person (Anzahl, offener Betrag, ob eine überfällig ist) kommen nur für owner und office; für Behandelnde und Vertretungen bleiben die Felder leer, entschieden in der Datenbank. „Offen“ heißt wie in der Liste der offenen Posten: ausgestellt, nicht storniert, nicht voll bezahlt — ab Ausstellung, nicht erst ab Fälligkeit; die Überfälligkeit steht daneben. Gezählt werden die offenen Rechnungen der Person aus **beiden** Leistungsbereichen, weil owner und office beide sehen dürfen. Im Erfolgsfall wird nicht protokolliert.

**Begründung.** `IDEA-PRX-037` warnt: „Rechnung offen“ am Termin ist eine Zahlungsinformation in einer Ansicht, die auch eine Vertretung sieht; ADR-004 und §4.3 geben Rechnungen und Zahlungsstatus owner und office, und `app.can_read_invoicing` zieht genau diese Grenze schon. Ob abkassiert oder ein offener Betrag angesprochen wird, entscheidet das Büro, nicht die Vertretung an der Tür. Die Frage „ab wann offen“ beantwortet ADR-009 über den Rechnungszustand; eine zweite Regel am Termin wäre eine zweite Wahrheit — deshalb liest die Liste der offenen Posten jetzt dieselbe Funktion. Die Kostenträgerart ist kein neues Feld: Sie ergibt sich aus der Bauart der Grundlage und dem Empfänger (ADR-009 Punkt 2, ADR-020). Unsicher: ob Behandelnde am Hausbesuch wissen sollen, dass etwas offen ist, um es anzusprechen.

**Anker.** `public.get_appointment_billing_context`, `app.appointment_basis_position` und `app.open_invoices` in `supabase/migrations/20260929120000_prx_008_appointment_billing_context.sql`; Anzeige `src/features/appointments/Abrechnungslage.tsx`; Tests in `supabase/tests/appointment-billing-context.test.ts`.

**Änderungspfad.** Behandelnde sehen „Rechnung offen“ ohne Betrag: eigene Bedingung für `open_invoice_count` statt `v_darf` · Aufwand `klein`. „Offen“ erst ab Fälligkeit: Bedingung in `app.open_invoices` — trifft dann auch die offenen Posten · Aufwand `klein`. **Abnahme (Jannes, 2026-10-02):** bestätigt einschließlich BEF-096 (Nichtantreffen verbraucht keinen Behandlungstermin). Finanzangaben bleiben bei owner und Büro; die gemeinsamen klinischen Leserechte aus Block 2 (BEF-095) gelten für Büro und Behandelnde.

### ANN-140 — Termin abhaken: Behandelnde bestätigen die Heilmittel an ihrem eigenen Termin, zurücknehmen bleibt beim Büro

Praxisprozess · entschieden (Jannes) · 2026-09-29 · Jannes (Sichtung Praxisverwaltung, Schritt 6) · erledigt · Wiedervorlage: —

**Ablösung.** ersetzt ANN-071 in der Frage „wer Leistungen erfasst“

**Annahme.** Am dokumentierten Termin bestätigt die behandelnde Person, welche Heilmittel sie geleistet hat — vorbelegt aus der Grundlage, mit einer Rückfrage, geschrieben über dieselbe `record_billable_services` wie im Büro. `therapist` und `team_lead` dürfen das **nur an ihrem eigenen Termin** (ihre Beschäftigtenkennung steht am Termin); `owner` und `office` weiter an jedem. **Zurücknehmen** und das **Ausfallhonorar** (eine Forderung gegen die Patient:in) bleiben bei `owner` und `office`. Ist das Kontingent danach erreicht, sagt die Seite es; eine Rechnung entsteht dabei nie — sie bleibt im Büro (ANN-077). Das Protokoll trägt, ob am Termin oder im Büro erfasst wurde.

**Begründung.** Jannes hat am 2026-09-28 entschieden, dass Behandelnde abhaken; `IDEA-PRX-039` empfiehlt, das als Oberfläche von ABR-002 zu bauen und nicht als zweiten Weg — so gelten Dokumentationskopplung (§19, ANN-072), Kontingent (ADR-020 Punkt 5) und Schutz vor Doppelerfassung (ADR-009 Punkt 4) ohne Ausnahme. Die Grenze „eigener Termin“ folgt dem Zweck: Was geleistet wurde, weiß, wer behandelt hat; eine Vertretung übernimmt den Termin und damit die Kennung. Das Zurücknehmen beim Büro folgt der Warnung aus `IDEA-PRX-039`: Abhaken darf nicht so aussehen, als ließe es sich durch erneutes Antippen zurücknehmen. Die „Freigabe zur Abrechnung“ braucht keinen eigenen Zustand, weil abgerechnet wird, was erfasst ist, monatlich je Person (ANN-077). Unsicher: ob Behandelnde auch Termine einer Kollegin abhaken sollen, etwa nach einem Tausch ohne Umbuchung.

**Anker.** `app.can_record_services_for_appointment` in `supabase/migrations/20260929130000_prx_009_record_at_appointment.sql` (die eine Stelle der Rollenregel), genutzt von `get_billable_service_draft`, `record_billable_services` und `get_appointment_services`; Anzeigeweiche `canRecordAtAppointment` in `src/features/session/types.ts`; Oberfläche `src/features/appointments/HeilmittelBestaetigen.tsx`; Tests in `supabase/tests/record-at-appointment.test.ts`.

**Änderungspfad.** Auch fremde Termine: Bedingung in `app.can_record_services_for_appointment` streichen · Aufwand `klein`. Behandelnde dürfen zurücknehmen: `delete_billable_services` auf dieselbe Funktion umstellen · Aufwand `klein`. Zurück zu ANN-071: Funktion auf `app.can_record_billable_services()` verkürzen · Aufwand `klein`. Abgleich (2026-10-02, Abnahme Block 4): Bestätigt werden die erbrachten Heilmittel (Mengen); das Terminhonorar entsteht je durchgeführtem Termin einmal, unabhängig von der Auswahl (ADR-009 Fassung 4 Punkt 22, BEF-099).

### ANN-141 — Verordnung ohne Papier: Das Foto hängt bis zum Erfassen an der Person, sein Objektschlüssel bleibt beim Zuordnen stehen

Praxisprozess · entschieden (Jannes) · 2026-09-29 · Jannes (Abnahme PRX-EPIC-003) · erledigt · Wiedervorlage: —

**Annahme.** Ein Verordnungsscan, den die Therapeut:in am Termin aufnimmt, hängt zunächst an der Patient:in (ohne Grundlage) und ist so lange ein offener Punkt „Verordnung zu erfassen“. Beim Speichern der Grundlage ordnet das Formular ihn zu — einmal, nur an eine Grundlage derselben Person, protokolliert als `patient_file.assigned`. Der Objektschlüssel wird beim Anlegen gesetzt und danach nie geändert; ein zugeordneter Scan liegt deshalb weiter unter dem Pfad der Person. Scheitert nur das Zuordnen, bleibt die Grundlage gespeichert, die Seite sagt es, und das Foto bleibt in den offenen Punkten.

**Begründung.** Jannes 2026-09-28 (Sichtung Kernprozess): Therapeut:in fotografiert, Office tippt ab. ADR-017 Punkt 10 nennt die Patient:in als zulässigen Bezugsdatensatz; Klasse und Frist sind dieselben wie an der Grundlage (Patientenakte, ADR-008 Punkt 4), die Datei fällt mit der Akte. Punkt 8 verbietet, ein abgelegtes Objekt zu verändern — ein Verschieben im Speicher wäre genau das; deshalb wandert der Bezug, nicht der Ort. Der Pfad besteht nur aus Kennungen (Punkt 5), ein „falscher“ Elternteil im Pfad sagt nichts über die Person hinaus. Ein eigener Zustand „zu erfassen“ wäre ein zweiter Wahrheitsort neben dem leeren Bezug. Unsicher: ob eine falsch zugeordnete Grundlage beim Löschen ihr Foto mitnehmen soll (heute ja, wie jeden Scan — die Kaskade stammt aus DAT-001).

**Anker.** `list_open_prescription_scans`, `assign_prescription_scan` und der Trigger `patient_files_object_key` (`app.set_patient_file_object_key`) in `supabase/migrations/20260929160000_prx_011_prescription_without_paper.sql`; Oberfläche `src/features/files/PrescriptionPhoto.tsx`, `src/features/open-points/PrescriptionsToCapture.tsx`, `src/features/treatment-bases/ScanBesideForm.tsx`; Tests in `supabase/tests/prescription-scans.test.ts`.

**Änderungspfad.** Das Foto soll beim Löschen einer Grundlage zurück in die offenen Punkte: Fremdschlüssel `patient_files_treatment_basis_id_fkey` auf `on delete set null` für Scans · Aufwand `mittel`. Ohne Umweg über die Person (Foto nur an bestehender Grundlage): Constraint `patient_files_scan_belongs_to_treatment_basis` wiederherstellen und den Knopf am Termin entfernen · Aufwand `klein`.

### ANN-142 — Aufgaben: alle vier Praxisrollen sehen alle, erledigte fallen nach zwölf Monaten

Datenschutz · entschieden (Jannes) · 2026-09-29 · Jannes (Abnahme PRX-EPIC-003) · Prüfpaket · Wiedervorlage: Datenschutzprüfung mit dem Retention Schedule (ADR-007, ADR-008)

**Annahme.** Aufgaben und Wiedervorlagen lesen und schreiben alle vier Praxisrollen (`owner`, `therapist`, `team_lead`, `office`), und zwar alle Aufgaben der Praxis — auch die einer Kollegin; die Zuweisung ist ein Hinweis, keine Sichtgrenze. Trainingsbetreuung und Patientenkonto sehen keine. Eine erledigte Aufgabe wird zwölf Monate nach dem Erledigen gelöscht (Klasse `aufgabe`, Anker „Abschluss des Vorgangs“); eine offene bleibt, mit Personenbezug fällt sie mit der Akte, ein Legal Hold an der Akte hält auch die erledigte. Titel und Notiz stehen nie im Protokoll; das Lesen der Liste wird wie bei der Warteliste nicht protokolliert (ANN-134), eine Abweisung schon.

**Begründung.** `IDEA-PRX-019`: „Ein Bezug erweitert keine Berechtigung“ (§4.7) — wer Aufgaben sieht, sieht die Kartei ohnehin, und in einer kleinen Praxis übernimmt, wer gerade Zeit hat. ADR-008 kennt keine Klasse „Aufgabe“; am nächsten liegen die Warteliste (ANN-133, zwölf Monate nach dem Schließen) und die Terminanfragen ohne Behandlungsverhältnis (zwölf Monate nach letztem Kontakt). Eine erledigte Aufgabe ist ein abgeschlossener organisatorischer Vorgang; was fachlich bleiben muss, steht in Dokumentation oder Grundlage. Unsicher: ob Freitext mit Namen Dritter („Rückruf Frau X“) eine kürzere Frist verlangt.

**Anker.** `app.can_manage_tasks()`, Klasse `aufgabe` mit zwei Zuordnungen und die Regel in `public.apply_retention` in `supabase/migrations/20260929170000_prx_012_tasks.sql`; Anzeigeweiche `canManageTasks` in `src/features/session/types.ts`; Beschriftung in `src/features/retention/klassen.ts`; Tests in `supabase/tests/tasks.test.ts`.

**Änderungspfad.** Nur eigene und zugewiesene Aufgaben sichtbar: Bedingung in `list_tasks` und den Schreibpfaden ergänzen · Aufwand `mittel`. Andere Frist: `retention_interval` der Klasse `aufgabe` (Datenänderung) · Aufwand `klein`. Office ausschließen: `app.can_manage_tasks()` · Aufwand `klein`.

### ANN-143 — Erstaufnahme: fünf Punkte, abgeleitet aus der Akte; „nein“ bei der Liege ist eine Entscheidung

Praxisprozess · entschieden (Jannes) · 2026-09-29 · Jannes (Abnahme PRX-EPIC-003) · erledigt · Wiedervorlage: —

**Annahme.** Die Erstaufnahme-Checkliste hat fünf Punkte, und jeder gilt als erledigt, sobald in der Akte steht, was er verlangt — niemand hakt etwas ab: **Verordnungsfoto** (ein Verordnungsscan an der Person, auch ein noch nicht zugeordneter; entfällt, wenn alle Grundlagen Selbstzahler sind), **Anamnesebogen** (V8 abgeschlossen), **Datenschutz und Vertrag** (Datenschutzinformation ausgehändigt **und** Behandlungsvertrag unterschrieben; freiwillige Einwilligungen für Mail, Bericht und Fotos zählen nicht), **Befund** (ein abgeschlossener Bogen einer der neun Regionen) und **Liege** (entschieden, ja oder nein). Die Liste führt Personen in Versorgung (`status = active`, ohne Abschluss der Versorgung); sie steht in der Tagesansicht an der Karte, im Aktenkopf und unter „Offene Punkte“, sichtbar für die vier Praxisrollen, nicht protokolliert (sie nennt, ob etwas vorliegt, nicht den Inhalt). Die Liege bekommt dafür einen dritten Zustand: leer heißt „noch nicht entschieden“; die bisherigen „nein“ (Standard, nie bewusst gewählt) wurden leer.

**Begründung.** Roadmap PRX-EPIC-003 nennt die fünf Punkte (Jannes, Umbau U2, §5); abgeleitet statt gepflegt, weil ein Haken neben der Akte der zweite Wahrheitsort wäre, der auseinanderläuft. „Einwilligungen“ ist als Datenschutzinformation und Behandlungsvertrag gelesen: das sind die beiden Blätter der Aufnahme (PAT-006), die übrigen Einwilligungen sind freiwillig und dürfen nicht als „fehlend“ drängen (Art. 7 Abs. 4 DSGVO, Freiwilligkeit). Ein „nein“ als Standard war von einer Entscheidung nicht zu unterscheiden — genau das soll die Liste aber sehen. Die Datenbank trägt nur synthetische Daten; das Leeren der Bestands-„nein“ kostet deshalb nichts. Unsicher: ob ein Anamnesebogen auf Papier (als Foto, DOK-006) den Punkt ebenfalls erledigen soll.

**Anker.** `app.intake_checklist` (die eine Stelle der Regeln), `app.intake_finding_instruments`, `get_intake_checklist` und `list_open_intakes` sowie die Spalte in `supabase/migrations/20260929180000_prx_013_intake_checklist.sql`; Beschriftung und Ziele in `src/features/open-points/intake-api.ts`; Liege mit drei Zuständen in `src/features/patients/Behandlungsliege.tsx`; Tests in `supabase/tests/intake-checklist.test.ts`.

**Änderungspfad.** Ein Punkt mehr oder anders: `app.intake_checklist` und die Liste in `intake-api.ts` · Aufwand `klein`. Papierbogen zählt: im Punkt `anamnesis` zusätzlich eine Datei einer neuen Dokumentart prüfen · Aufwand `mittel`. Zurück zu „nein“ als Standard: Spalte wieder `not null default false` · Aufwand `klein`.

**Ablösung.** abgelöst durch ANN-224 in der Zahl der Punkte (seit AKTE-007 nur Verordnungsfoto und Anmeldebogen); der dritte Zustand der Liege gilt weiter.

### ANN-144 — Anrufliste: „erreicht“ ist ein Mitteilungsvermerk, „nicht erreicht“ ein Stand am Termin für zwei Wochen

Datenschutz · entschieden (Jannes) · 2026-09-29 · Jannes (Abnahme PRX-EPIC-003) · Prüfpaket · Wiedervorlage: Datenschutzprüfung mit dem Retention Schedule (ADR-007, ADR-008)

**Annahme.** Die Anrufliste zeigt je Tag (Standard: morgen) die bestätigten Behandlungstermine mit Rufnummern. „Erreicht, bestätigt“ setzt den vorhandenen Mitteilungsvermerk „telefonisch“ am Termin (CAL-012) und verfällt wie dieser, sobald der Termin sich ändert. „Nicht erreicht“ und „Nachricht hinterlassen“ werden als Stand **am Termin** gespeichert (`appointment_call_states`: Ergebnis, Zahl der Versuche, wann, wer) und vierzehn Tage nach Terminbeginn gelöscht (Klasse `anrufstand`); nie als Merkmal der Person. Lesen und Vermerken dürfen die Rollen des Mitteilungsvermerks (`app.can_update_appointment`); jedes Ergebnis wird als `appointment.call_recorded` protokolliert, ohne Gesprächsinhalt.

**Begründung.** `IDEA-PRX-041` fragt, ob der Stand an den Termin oder an einen eigenen Vorgang gehört und ob „nicht erreicht“ ein Merkmal der Patientin wird (§20); am Termin und kurzlebig beantwortet beides am engsten. „Erreicht“ ist dieselbe Aussage wie „telefonisch mitgeteilt“ — ein zweiter Ort dafür liefe auseinander. Vierzehn Tage genügen, um einen Ausfall („trotz zweimal Nachricht nicht erschienen“) im Gespräch nachzuvollziehen; länger wäre ein Verlauf über das Erreichbarkeitsverhalten einer Person. Unsicher: ob die Praxis bei Ausfallhonoraren (ANN-035) den Anrufstand länger als Beleg braucht.

**Anker.** Tabelle, Klasse `anrufstand`, `list_call_list` und `record_call_outcome` sowie die Regel in `public.apply_retention` in `supabase/migrations/20260929190000_prx_014_call_list.sql`; Oberfläche `src/features/open-points/CallListPage.tsx`; Tests in `supabase/tests/call-list.test.ts`.

**Änderungspfad.** Andere Frist: `retention_interval` der Klasse `anrufstand` · Aufwand `klein`. Verlauf aller Versuche statt eines Stands: eigene Zeile je Versuch statt `on conflict` · Aufwand `mittel`. Auch die Anrufliste nach „Tag umplanen“ (CAL-009) speichert ihren Stand hier: dieselbe Funktion für abgesagte Termine öffnen · Aufwand `mittel`.

### ANN-145 — Dublettenhinweis: gleicher Nachname und gleiches Geburtsdatum oder gleicher Vorname

Praxisprozess · entschieden (Jannes) · 2026-09-29 · Jannes (Abnahme PRX-EPIC-003) · erledigt · Wiedervorlage: mit PRX-EPIC-003b (Zusammenführen)

**Annahme.** Beim Anlegen einer Person prüft die Anwendung vor dem ersten Speichern auf mögliche Dubletten in der eigenen Praxis: gleicher Nachname **und** (gleiches Geburtsdatum **oder** gleicher Vorname), verglichen in der Suchform (klein, ohne Akzente, Umlaute aufgelöst). Treffer erscheinen als Hinweis mit Link zur vorhandenen Akte; wer erneut „anlegen“ tippt, legt an. Scheitert die Prüfung, wird ohne sie angelegt. Höchstens fünf Treffer, nur Name, Geburtsdatum und Status — dieselben Angaben wie die Suche, nicht protokolliert wie deren Trefferliste.

**Begründung.** `IDEA-PRX-018`: „Hinweis auf gleichen Namen und Geburtsdatum … nie automatisch.“ Der Nachname allein wäre zu laut (Familien), Vorname und Nachname ohne Geburtsdatum fangen den häufigsten Fall — eine zweite Anlage ohne Geburtsdatum oder mit Tippfehler darin —, Nachname und Geburtsdatum den Fall mit Kurzform im Vornamen („Max“/„Maximilian“). Tippfehler im Nachnamen fängt die Regel nicht; das bleibt der Suche in der Kopfleiste überlassen. Ein Hinweis statt einer Sperre, weil es Namensgleiche mit gleichem Geburtstag gibt.

**Anker.** `public.find_possible_duplicates` in `supabase/migrations/20260929200000_prx_015_duplicate_check.sql`; Hinweis in `src/features/patients/NewPatientPage.tsx`; Tests in `supabase/tests/duplicate-check.test.ts`.

**Änderungspfad.** Andere Regel (etwa Ähnlichkeit statt Gleichheit mit `pg_trgm`): die Bedingung in `find_possible_duplicates` · Aufwand `klein` (mit neuer Erweiterung `mittel`). Harte Sperre: `create_patient` ruft dieselbe Regel und verlangt eine Bestätigung · Aufwand `mittel`.

### ANN-146 — Erinnerungen fragen nur: Verordnung endet bei ganz verplantem Kontingent und letztem Termin in 14 Tagen; Abschluss nach sechs Monaten ohne Termin

Praxisprozess · entschieden (Jannes) · 2026-09-29 · Jannes (Abnahme PRX-EPIC-003) · erledigt · Wiedervorlage: STA-EPIC-001 Kennzahl 4 liest dieselbe Regel

**Annahme.** Unter „Offene Punkte“ stehen zwei Listen, die nur fragen und nichts setzen. **Verordnung endet:** eine Verordnung (nicht Selbstzahler) einer Person in Versorgung, zu der es keine jüngere Grundlage gibt, deren Kontingent genutzt ist **oder** deren Termine alle verplant sind und deren letzter Termin in den nächsten 14 Tagen liegt (oder schon war); dazu nur, **ob** eine Empfehlung zum Verordnungsende vorliegt (Therapiebericht oder Bestandsfeld), und Name und Telefon der Verordner:in — sichtbar für die vier Praxisrollen. **Versorgung abschließen?:** Personen ohne Abschluss der Versorgung, deren letzter Behandlungstermin sechs Monate zurückliegt (ohne Termin: die Anlage der Akte) und die keinen kommenden haben — sichtbar nur für die Rollen, die abschließen dürfen (`owner`, `therapist`, `team_lead`).

**Begründung.** `IDEA-LZK-009`: „Ein Vorschlag darf keine Frist starten, sondern nur fragen“ — der Abschluss bleibt der ausdrückliche Vorgang aus LOE-001b, weil an ihm die Löschung in zehn Jahren hängt. `IDEA-LZK-007` trennt die Empfehlung der Therapeutin (Dokumentation, DOK-005) von einer automatischen Einstufung (B9); die Liste zeigt deshalb nur, ob eine Empfehlung da ist. 14 Tage entsprechen der Kennzahl 4 aus STA-EPIC-001, sechs Monate dem üblichen Abstand, nach dem eine Folgeverordnung nicht mehr „Anschluss“ ist. Unsicher: ob Office die Abschlussliste sehen soll, um Therapeut:innen anzusprechen (IDEA-LZK-009 lässt es offen).

**Anker.** `app.reminder_prescription_horizon()`, `app.reminder_care_idle()`, `list_ending_prescriptions` und `list_care_without_conclusion` in `supabase/migrations/20260929210000_prx_016_reminders.sql`; Oberfläche `src/features/open-points/Reminders.tsx`; Tests in `supabase/tests/reminders.test.ts`.

**Änderungspfad.** Andere Schwellen: die beiden `app.reminder_*`-Funktionen · Aufwand `klein`. Office sieht die Abschlussliste: Rollenprüfung in `list_care_without_conclusion` auf `app.can_read_patient_directory()` · Aufwand `klein`. Mit Erinnerung an die Therapeut:in (Benachrichtigung): gehört zu KOM-EPIC-003 · Aufwand `groß`.

### ANN-147 — Zusammenführen: Die bleibende Akte behält ihre Stammdaten, Leeres füllt die Dublette, Freitexte werden angehängt

Praxisprozess · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Sichtung Praxisverwaltung (PRX-EPIC-003b)

**Annahme.** Beim Zusammenführen gewinnt in jedem Feld der Stammdaten die Akte, aus der heraus `owner` die Dublette übernimmt; nur leere Felder füllt die Dublette, die Anschrift nur als Ganzes und mit ihrer Verortung. Weichen die Freitexte (Zugangshinweis, Besonderheit, Bemerkung) ab, wird der Text der Dublette durch eine Leerzeile getrennt **angehängt**, nie verworfen; „Mitnehmen“ wird ohne Doppel vereinigt. Hat die bleibende Akte schon einen Standard-Rechnungsempfänger, verliert der der Dublette diese Markierung. Die Vorschau zeigt vor dem Bestätigen, welche Felder in beiden Akten verschieden sind.

**Begründung.** `IDEA-PRX-018` verlangt „nie automatisch“; eine Regel, die Felder nach Alter oder Häufigkeit auswählt, wäre genau das. Die Akte, die jemand bewusst als die richtige öffnet, ist die bessere Quelle; wer einen Wert der Dublette braucht, trägt ihn vorher oder danach in den Stammdaten ein. Freitexte sind Wissen des Teams („Klingel defekt“) — sie zu verwerfen verstieße gegen §13. Unsicher: ob Jannes die Felder lieber einzeln auswählen will.

**Anker.** `app.merge_note`, `app.merge_take_along` und der Stammdatenteil von `public.merge_patients` in `supabase/migrations/20260929220000_prx_017_patient_merge.sql`; Tests in `supabase/tests/patient-merge.test.ts`.

**Änderungspfad.** Felder einzeln wählen: Parameter an `merge_patients` und Auswahl in der Vorschau · Aufwand `mittel`. Freitexte verwerfen statt anhängen: `app.merge_note` · Aufwand `klein`. **Abnahme (Jannes, 2026-10-02):** bestätigt.

### ANN-148 — Zusammenführen: aktiv, wenn eine Akte aktiv ist; ein Abschluss bleibt nur, wenn beide abgeschlossen sind, dann der spätere

Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung mit dem Retention Schedule (ADR-007, ADR-008)

**Annahme.** Nach dem Zusammenführen ist die Person in laufender Versorgung, wenn eine der beiden Akten es war; der Abschluss der Versorgung (Anker der zehnjährigen Aufbewahrung, ANN-032) bleibt nur stehen, wenn beide Akten abgeschlossen waren — dann der spätere. Beginn der Versorgung ist der frühere.

**Begründung.** Eine Behandlung ist erst beendet, wenn die ganze Person nicht mehr behandelt wird; eine abgeschlossene Dublette neben einer laufenden Akte wäre ein Abschluss, den niemand ausgesprochen hat. Der spätere Abschluss hält die Frist für alle Unterlagen, die nun in einer Akte liegen, eher länger als kürzer — früheres Löschen einer Hälfte wäre der schwerere Fehler (§630f BGB, ADR-008 Punkt 2). Unsicher: ob die Prüfung für die Unterlagen der früher abgeschlossenen Dublette die frühere Frist verlangt (Speicherbegrenzung, Art. 5 Abs. 1 lit. e DSGVO).

**Anker.** Abschnitt „Versorgungsstand“ in `public.merge_patients` in `supabase/migrations/20260929220000_prx_017_patient_merge.sql`; Test „behält bei zwei Abschlüssen den späteren“ in `supabase/tests/patient-merge.test.ts`.

**Änderungspfad.** Getrennte Fristen je Herkunft: Abschlussdatum an den gewanderten Zeilen statt an der Akte · Aufwand `groß`. Ein Abschluss der Dublette wird verworfen: dieselbe Stelle · Aufwand `klein`. **Abnahme (Jannes, 2026-10-02):** bestätigt.

### ANN-149 — Zusammenführen sperrt statt zu raten: Konto an der Dublette, zwei Entwürfe für denselben Monat, zwei offene Wartelisteneinträge ohne Grundlage, zu langer Freitext

Praxisprozess · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Sichtung Praxisverwaltung (PRX-EPIC-003b)

**Annahme.** Das Zusammenführen findet nicht statt, solange (a) an der Person der Dublette ein Konto hängt, (b) beide Akten einen Rechnungsentwurf für denselben Monat und Leistungsbereich haben, (c) beide einen offenen Wartelisteneintrag ohne Grundlage haben, (d) ein angehängter Freitext länger würde als erlaubt oder (e) „Mitnehmen“ mehr als zehn Einträge hätte. Die Vorschau nennt den Grund und den Weg: Konto klären, einen Entwurf verwerfen, einen Eintrag schließen, einen Text kürzen.

**Begründung.** In jedem dieser Fälle müsste der Vorgang selbst etwas entscheiden, das die Praxis entscheiden sollte — welcher Entwurf gilt, welcher Wunsch auf der Warteliste, welches Konto seine Akte verliert. Kürzen hieße Text verlieren (§13). Alle Fälle sind selten und in einem Handgriff zu lösen. Ein Trainingsverhältnis, eine Mitarbeiterrolle oder ein Legal Hold sperren dagegen nicht (ANN-150).

**Anker.** Sperrgründe in `app.patient_merge_plan` in `supabase/migrations/20260929220000_prx_017_patient_merge.sql`; Texte in `src/features/patients/zusammenfuehren.ts`; Tests „Sperren (ANN-149)“ in `supabase/tests/patient-merge.test.ts`.

**Änderungspfad.** Entwürfe zusammenlegen statt sperren: Zeilen umhängen und einen Entwurf löschen · Aufwand `mittel`. Konto mitnehmen: `user_profiles.person_id` auf die bleibende Person · Aufwand `mittel` (mit Patientenportal POR-EPIC prüfen). **Abnahme (Jannes, 2026-10-02):** bestätigt.

### ANN-150 — Zusammenführen: nicht rückgängig, Legal Hold wandert mit, Nachweis ist der Auditeintrag

Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: OPS-003 (Wiederherstellungsverfahren) und Datenschutzprüfung · **LOG-EPIC-001:** geändert – Nachweis ist `patient_merge_records` mit `merged_by`, kein Auditeintrag.

**Annahme.** Das Zusammenführen ist nicht rückgängig zu machen. Ein Legal Hold der Dublette zieht auf die bleibende Akte um und gilt dort weiter; steht die bleibende Akte schon unter einer Sperre, wird die der Dublette dabei aufgehoben und bleibt als Nachweis an der bleibenden Akte stehen (für eine Akte gibt es nur eine aktive Sperre). Ein gleichzeitig gesetzter Legal Hold wartet, bis das Zusammenführen fertig ist. Die leere Akte fällt; ihre Person nur, wenn nichts anderes an ihr hängt (Mitarbeiter:in, Konto, Trainingsverhältnis). Nachweis ist ein Auditeintrag `patient.merged` an der bleibenden Akte mit der Kennung der Dublette und den Zahlen je Bereich, ohne Namen und Inhalt; kein Eintrag im Löschjournal. Wird eine Sicherung von vor dem Zusammenführen zurückgespielt, kommt die Dublette zurück; das Wiederherstellungsverfahren (OPS-003) führt sie anhand der Auditeinträge erneut zusammen.

**Begründung.** Ein Rückgängig müsste sich merken, welche Zeile woher kam — eine zweite Wahrheit über die Akte. Eine Vorschau mit Bestätigung und die Beschränkung auf `owner` sind der Schutz vor dem Irrtum. Ein Legal Hold schützt Unterlagen, nicht eine Kennung; er folgt deshalb den Unterlagen (ADR-008 Punkt 7, ANN-033). Das Löschjournal ist für Löschungen nach Frist gemacht und würde nach einem Restore eine Akte löschen wollen, an der wieder Termine hängen; der Auditeintrag trägt dieselbe Information ohne diese Falle. Unsicher: ob die Prüfung für die gefallene Akte einen Journaleintrag verlangt.

**Anker.** Umhängen der Legal Holds, Löschen der leeren Akte und Auditeintrag in `public.merge_patients`, Sperre der Akte in `public.place_legal_hold`, beide in `supabase/migrations/20260929220000_prx_017_patient_merge.sql`; Hinweis „nicht rückgängig“ in `src/features/patients/ZusammenfuehrenPage.tsx`; Tests in `supabase/tests/patient-merge.test.ts`.

**Änderungspfad.** Rückgängig innerhalb einer Frist: Herkunft je gewanderter Zeile speichern · Aufwand `groß`. Journaleintrag für die gefallene Akte: eine Zeile in `merge_patients` und eine Regel im Nachziehen nach dem Restore · Aufwand `mittel`. **Abnahme (Jannes, 2026-10-02):** geändert: Der Nachweis des Zusammenführens bleibt so lange wie die betroffene Akte, nicht nur drei Jahre im Auditlog; alle Gründe bestehender Legal Holds bleiben wirksam (BEF-108). **Fassung 2 (ABN-018, 2026-10-02, BEF-108 Punkte 2 und 3):** Das Zusammenführen hebt keine Sperre mehr auf; eine Akte kann mehrere aktive Legal Holds tragen (Index ohne `unique`), `place_legal_hold` nimmt eine weitere mit eigenem Grund an, der Aufbewahrungsstand nennt alle Gründe. Der Nachweis steht als `patient_merge_records` an der bleibenden Akte (so lange wie sie, zieht bei einem weiteren Zusammenführen mit) und in „Verwaltung“ der Akte. `supabase/migrations/20261003105000_abn_018_waitlist_review_merge_records_holds.sql`.

### ANN-151 — Statistik: Umsatz ist brutto nach Rechnungsstellung, als Praxissumme mit der Aufteilung je Bereich; der Zahlungseingang steht getrennt daneben

Praxisprozess · entschieden (Jannes) · 2026-09-29 · Jannes (Bericht STA-EPIC-001) · erledigt · Wiedervorlage: Steuerberatung (B9), Sichtung Statistiken

**Annahme.** Kennzahl (1) „Umsatz“ ist die Bruttosumme ausgestellter Rechnungen am Ausstellungstag, abzüglich Stornodokumenten am Tag des Stornos; „Zahlungseingang“ ist die Summe gebuchter Zahlungen abzüglich Rückzahlungen, ohne stornierte Zahlungen. Beide stehen immer getrennt, nie in einer Zahl. Der Umsatz erscheint als Praxissumme über beide Leistungsbereiche mit der Aufteilung Behandlung/Training darunter; der Zielwert gilt dem Umsatz, nicht dem Eingang.

**Begründung.** Für die Steuerung braucht Jannes eine Monatszahl, nicht je Bereich zwei; die getrennte Gewinnermittlung (ADR-009 Punkt 19) leistet weiter die Auswertung „Einnahmen je Leistungsart“ mit Steuergruppen, und die Aufteilung je Bereich steht auch hier. Die beiden Grundlagen werden wie dort getrennt gerechnet und nie gemischt. Unsicher: ob die Steuerberatung für die Steuerung lieber netto sähe.

**Anker.** Abschnitt (1) in `public.get_practice_statistics`, `supabase/migrations/20260929230000_sta_001_practice_statistics.sql`; Tests „(1) Umsatz und Zahlungseingang“ in `supabase/tests/practice-statistics.test.ts`.

**Änderungspfad.** Netto statt brutto: Summe über `snapshot -> 'tax_groups' -> net_cents` an derselben Stelle · Aufwand `klein`. Ziel am Zahlungseingang: Spalte in `practice_targets` und Zuordnung in `src/features/statistics/kennzahlen.ts` · Aufwand `klein`.

### ANN-152 — Statistik: Auslastung zählt Behandlungs- und Trainingstermine innerhalb der Arbeitszeit, nur als Praxissumme

Datenschutz · entschieden (Jannes) · 2026-09-29 · Jannes (Bericht STA-EPIC-001) · Prüfpaket · Wiedervorlage: B6 (Beschäftigtendaten), Datenschutzprüfung

**Annahme.** Kennzahl (3) „Auslastung“ teilt die Minuten nicht abgesagter Behandlungs- und Trainingstermine, soweit sie in der Arbeitszeit liegen, durch die Minuten der Arbeitszeit aller Personen, die Termine bekommen können — für heute und die folgenden dreizehn Tage, nach dem Wochenplan und seinen Abweichungen (dieselbe Regel wie die Terminsuche). Interne Termine zählen nicht, „nicht angetroffen“ zählt als gebucht. Die Funktion rechnet je Person und Tag, liefert aber **nur die Praxissumme**; einen Wert je Person gibt es weder in der Datenbank noch in der Oberfläche.

**Begründung.** §20 und B6 schließen Leistungskontrolle über Beschäftigtendaten aus; eine Summe über die Praxis ist Planungsgröße, kein Verhalten einer Person (IDEA-PRX-025: „Keine Werte je Person, bis B6 entschieden ist“). Arbeitszeit außerhalb gebuchter Termine ist freie Kapazität, Termine außerhalb der Arbeitszeit sind keine Auslastung der geplanten Zeit. Unsicher: ob die Prüfung eine Praxissumme bei sehr kleinem Team (zwei Personen) als personenbeziehbar einordnet.

**Anker.** Abschnitt (3) in `public.get_practice_statistics`, `supabase/migrations/20260929230000_sta_001_practice_statistics.sql`; Tests „(3) Auslastung“ in `supabase/tests/practice-statistics.test.ts`.

**Änderungspfad.** Interne Termine mitzählen oder Termine außerhalb der Arbeitszeit voll rechnen: Filter und Schnitt an derselben Stelle · Aufwand `klein`. Werte je Person erst nach B6 und als eigenes Epic · Aufwand `mittel`.

### ANN-153 — Statistik: Ausfälle sind Absagen durch Patient:innen und Nichtantreffen, nach dem Tag des Termins; das Honorar ist, was erfasst ist

Praxisprozess · entschieden (Jannes) · 2026-09-29 · Jannes (Bericht STA-EPIC-001) · erledigt · Wiedervorlage: Sichtung Statistiken

**Annahme.** Kennzahl (5) zählt Behandlungs- und Trainingstermine mit Absagegrund „auf Wunsch der Patient:in“ und nicht angetroffene Termine, deren Beginn in den letzten 28 Tagen (heute eingeschlossen) beziehungsweise den 28 Tagen davor liegt. Absagen der Praxis, „verlegt“ und „sonstiger Grund“ zählen nicht. „Mit Gebühr“ zählt Ausfälle mit Gebührenanlass; die Summe der Ausfallhonorare ist die Summe der daran erfassten Honorar-Leistungen zum Katalogpreis — ein Ausfall mit Anlass, aber ohne erfasste Leistung, steht nur in der Anzahl.

**Begründung.** Nur die Patientenabsage ist ein Ausfall, den die Praxis beeinflussen kann (Erinnerung, Anrufliste); dieselbe Abgrenzung trifft ADR-018 Punkt 8 Nr. 4 für die Gebühr. Eine Gebühr vorauszurechnen, die niemand erfasst hat, wäre eine Forderung, die es nicht gibt.

**Anker.** Abschnitt (5) in `public.get_practice_statistics`, `supabase/migrations/20260929230000_sta_001_practice_statistics.sql`; Test „(5) Ausfälle“ in `supabase/tests/practice-statistics.test.ts`.

**Änderungspfad.** „Verlegt“ oder „sonstiger Grund“ mitzählen: Bedingung an derselben Stelle · Aufwand `klein`. Honorar nach Rechnung statt nach Erfassung: Join über die Rechnungsposten · Aufwand `klein`.

### ANN-154 — Statistik: Der erfolgreiche Aufruf wird nicht protokolliert, der abgewiesene schon

Datenschutz · entschieden (Jannes) · 2026-09-29 · Jannes (Bericht STA-EPIC-001) · Prüfpaket · Wiedervorlage: Datenschutzprüfung mit dem Auditkatalog (ADR-010) · **LOG-EPIC-001:** gilt; der abgewiesene Versuch steht als `access.denied`.

**Annahme.** `get_practice_statistics` und `get_practice_targets` schreiben beim erfolgreichen Aufruf durch `owner` keinen Auditeintrag; ein abgewiesener Aufruf liefert keine Zeile und steht als `statistics.read` mit Ausgang „abgewiesen“ im Protokoll. Der CSV-Export entsteht im Browser aus derselben Antwort und wird ebenfalls nicht protokolliert. Das Ändern eines Zielwerts wird protokolliert (`organization.practice_target_changed`).

**Begründung.** Die Antwort enthält nur Summen ohne Patientin, Rechnung oder Mitarbeiterin — wie die Auswertung „Einnahmen je Leistungsart“, die ebenfalls nicht protokolliert (ABR-011). ADR-010 verlangt das Protokoll für Zugriffe auf personenbezogene Inhalte; ein Eintrag je Blick auf Praxissummen wäre Rauschen im Protokoll. Der abgewiesene Versuch bleibt nachweisbar (G6b).

**Anker.** Kopfkommentar von `supabase/migrations/20260929230000_sta_001_practice_statistics.sql` und die Rollenprüfung in `public.get_practice_statistics`; `public.get_practice_targets` in `supabase/migrations/20260929231000_sta_002_practice_targets.sql`.

**Änderungspfad.** Lesen protokollieren: ein Eintrag `statistics.read` mit Ausgang „erfolgreich“ in beiden Funktionen · Aufwand `klein`.

### ANN-155 — Statistik: Richtung der Zielwerte und die eine Handlung je Kennzahl

Praxisprozess · entschieden (Jannes) · 2026-09-29 · Jannes (Bericht STA-EPIC-001) · erledigt · Wiedervorlage: Sichtung Statistiken

**Annahme.** Ein Zielwert ist beim Umsatz und bei der Auslastung ein Mindestwert, bei offenen Posten, Verordnungen ohne Anschluss und Ausfällen ein Höchstwert; ohne Zielwert zeigt die Karte keinen Vergleich. Je Kennzahl führt genau eine Handlung weiter: Umsatz → Rechnungen, offene Posten → offene Posten mit Mahnung, Auslastung → Warteliste (freie Fenster füllen; die Terminsuche selbst gehört zu einer Person), Verordnungen → „Verordnung endet“ unter Offene Punkte (dort mit Telefon der Verordner:in), Ausfälle → Anrufliste für morgen. Eine eigene Anfragefunktion an Verordner:innen entsteht nicht.

**Begründung.** Die Roadmap verlangt zu jeder Zahl die eine Handlung, die sie auslöst (Mahnung, Anrufliste, freie Fenster, Verordner:in anfragen); alle Ziele gibt es schon als Seiten. Eine Anfragefunktion wäre ein neuer Versandweg (ADR-002) und ein eigenes Epic.

**Anker.** `src/features/statistics/kennzahlen.ts` (Richtung, Ziel erreicht, Handlung je Kennzahl) mit Tests in `src/features/statistics/kennzahlen.test.ts`.

**Änderungspfad.** Richtung oder Ziel einer Handlung ändern: Eintrag in `kennzahlen.ts` · Aufwand `klein`.

### ANN-156 — Umsatz je Person: der behandelnden Person zugeordnet; owner sieht alle, wer Umsatzbeteiligung hat, sich selbst; jeder Aufruf protokolliert

Datenschutz · entschieden (Jannes) · 2026-09-29 · Jannes (B6 aufgelöst) · Prüfpaket · Wiedervorlage: Datenschutzprüfung Beschäftigtendaten (Art. 88 DSGVO, § 26 BDSG), Vergütungsmodelle (IDEA-PRX-047) · **LOG-EPIC-001:** verworfen – der Blick auf den Umsatz je Person wird nicht protokolliert (Zweckbindung, ADR-010 Fassung 3 Punkt 20).

**Annahme.** Der Umsatz nach Rechnungsstellung wird je Monat der Person zugeordnet, die den Termin der abgerechneten Leistung behandelt hat; was sich keiner Person zuordnen lässt (etwa ein nach dem Storno gelöschter Posten), steht als „ohne Zuordnung“, sodass die Summe eines Monats immer der Praxisumsatz ist. `owner` sieht alle Personen mit Namen — erst auf Klick, weil jeder Abruf protokolliert wird —, eine Person mit Umsatzbeteiligung ausschließlich die eigenen Zahlen (maßgeblich ist das Modell am Mitarbeiterdatensatz, nicht die Rolle; ein inaktiver Beschäftigungsstatus sperrt nicht, das Konto schon), alle anderen nichts. Jeder erfolgreiche Aufruf steht als `statistics.staff_revenue_viewed` mit Umfang (alle oder selbst), ohne Beträge, im Protokoll. Die Auswertung liest keine Zeiten, Wege, Orte oder Ausfälle je Person (§20).

**Begründung.** Jannes hat B6 am 2026-09-29 aufgelöst, weil Vergütungsmodelle mit Umsatzbeteiligung geplant sind; wer beteiligt ist, braucht die eigene Zahl. Zugeordnet wird nach der Behandlung, weil der Umsatz dort entsteht — die Person, die die Rechnung schreibt, ist meist das Büro. Das Protokoll kompensiert, dass es sich um Beschäftigtendaten handelt (ADR-010). Unsicher: ob die Prüfung eine Information der Beschäftigten (Art. 13 DSGVO) vor dem ersten Einsatz verlangt — empfohlen.

**Anker.** `public.list_revenue_by_staff` in `supabase/migrations/20260929234000_sta_006_revenue_by_staff.sql`, Posten aus `app.revenue_staff_lines` in `supabase/migrations/20260929232000_sta_004_revenue_series.sql`; Laden auf Klick in `src/features/statistics/StatisticsPage.tsx`; Tests in `supabase/tests/revenue-series.test.ts`.

**Änderungspfad.** Nach Zahlungseingang statt Rechnungsstellung: Zahlung anteilig auf die Zeilen verteilen (wie ANN-088) · Aufwand `mittel`. Personen ohne Umsatzbeteiligung für owner ausblenden: Bedingung in `list_revenue_by_staff` · Aufwand `klein`.

### ANN-157 — Vergütungsmodell: zwei Werte, owner trägt ein, ohne Angabe kein Umsatz für die Person

Praxisprozess · entschieden (Jannes) · 2026-09-29 · Jannes (B6 aufgelöst) · erledigt · Wiedervorlage: Vergütungsmodelle (IDEA-PRX-047)

**Annahme.** Je Person gibt es genau eine Angabe: Festgehalt oder Umsatzbeteiligung. Die Person wählt ihr Modell, `owner` trägt es ein (es ist Teil des Arbeitsvertrags); jede Änderung wird mit altem und neuem Wert protokolliert. Ohne Angabe zählt die Person wie Festgehalt und sieht keinen Umsatz. Lesen dürfen `owner` und die Person selbst, `office` nicht.

**Begründung.** Die Sicht auf den eigenen Umsatz soll an einer vereinbarten Tatsache hängen, nicht an einer Rolle; eine fehlende Angabe darf niemandem Zahlen zeigen. Sätze und Abrechnung der Beteiligung sind ein eigenes Epic.

**Anker.** `public.staff_compensation_models`, `app.has_revenue_share` und `public.set_staff_compensation_model` in `supabase/migrations/20260929233000_sta_005_compensation_model.sql`; Abschnitt „Vergütung“ in `src/features/staff/StaffCompensationSection.tsx`.

**Änderungspfad.** Weitere Modelle: Wert in der Check-Constraint und in der Auswahl · Aufwand `klein`. Die Person wählt selbst in der Anwendung: eigener Schreibweg mit Bestätigung durch owner · Aufwand `mittel`.

### ANN-172 — Trainingsverhältnisse anlegen, ändern und beenden: owner, Trainingsbetreuung und Büro

Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2, DSFA Training)

**Annahme.** Ein Trainingsverhältnis legen `owner`, `trainer` und `office` an, ändern es und beenden es; `therapist` und `team_lead` weder lesend noch schreibend. Jeder abgewiesene Versuch steht als `denied` im Protokoll (HTTP 403, wie G6c).

**Begründung.** §4.9 gibt der Trainingsbetreuung Anlegen, Ändern und Beenden; `owner` ist Vertragspartner beider Verhältnisse. §4.8 lässt `office` im Training „nur organisatorisch“ zu — Termin, Vertragsstatus, Leistung, Rechnung, Zahlung. Name, Kontakt und Vertragsdaten sind genau das; Screening- und Gesundheitsangaben gibt es in diesem Loop nicht, sie bleiben für `office` gesperrt, wenn sie kommen. Die Lesegrenze (owner, trainer, office) steht seit LEI-003; Schreiben ohne Lesen wäre sinnlos. Unsicher: ob die Prüfung das Büro auf Lesen beschränkt sehen will.

**Anker.** `app.can_write_training_relationships()` in `supabase/migrations/20260930100000_trn_001_training_clients.sql`; Tests in `supabase/tests/training-clients.test.ts` und `supabase/tests/abgewiesene-schreibpfade.test.ts`.

**Änderungspfad.** Büro nur lesend: `office` aus der Funktion nehmen, die Oberfläche folgt `canWriteTrainingClients` · Aufwand `klein`.

### ANN-173 — Das zweite Verhältnis entsteht nur bei owner und Büro, und aus der Akte wird nichts übernommen

Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2, Zweckbindung ADR-021 Punkt 7)

**Annahme.** Eine Person, die schon eine Akte hat (oder im Team ist), bekommt ihr Trainingsverhältnis ohne zweite `persons`-Zeile — aber nur durch jemanden, der sie aus der Behandlung ohnehin sieht, also `owner` oder `office`. Der Dublettenhinweis beim Anlegen zeigt der Trainingsbetreuung nur Trainingskund:innen; für sie ist eine Akte „nicht gefunden“, ununterscheidbar von einer fremden Kennung. Kontaktdaten hängen am Verhältnis (`training_contact_details`, Gegenstück zu `patient_contact_details`); beim zweiten Verhältnis wird nichts aus der Akte übernommen, auch keine Adresse — mit kommt nur, was die anlegende Person ins Formular getippt hat (Kontakt, Vertragsbeginn), nie der Name aus dem Formular.

**Begründung.** ADR-021 verwirft zwei Personendatensätze (Dubletten) und verlangt zugleich, dass aus der Trainingsrolle nicht auf die Behandlung geschlossen wird, „auch nicht mittelbar über die gemeinsame Identität“ (§4.8). Beides zusammen geht nur, wenn die Verbindung von einer Rolle gezogen wird, die beide Bereiche sieht. Die Kontaktdaten sind seit der Datenminimierung (`20260828110000_person_data_minimisation.sql`) an den Kontext gebunden; eine automatische Übernahme wäre eine Übernahme aus dem Behandlungskontext ohne dokumentierte Einwilligung (ADR-021 Punkt 7). Unsicher: ob Kontaktdaten unter Punkt 7 fallen — bewusst die strengere Lesart.

**Anker.** `public.start_training_for_person` und `public.find_possible_training_duplicates` in `supabase/migrations/20260930100000_trn_001_training_clients.sql`; Dublettenhinweis in `src/features/training/NewTrainingClientPage.tsx`.

**Änderungspfad.** Kontaktdaten auf ausdrückliche Bestätigung übernehmen: Schalter im Anlegen, Kopie in `start_training_for_person` mit Vermerk im Protokoll · Aufwand `klein`.

### ANN-174 — Der Name gehört der Person: Eine Änderung im Training gilt auch in der Akte

Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2)

**Annahme.** Ändert die Trainingsbetreuung Vor- oder Nachnamen einer Trainingskund:in, ändert sie ihn in `persons` — und damit auch in einer Akte derselben Person, von der sie nichts weiß. Protokolliert wird die Änderung am Trainingsverhältnis (`training_relationship.updated`, Feld `name`). Ausnahme: Ist die Person Mitarbeiter:in oder hat sie ein Konto, ändert den Namen nur, wer Mitarbeiterstammdaten pflegt (owner, office); die Trainingsbetreuung bekommt „name is managed in staff master data“ (Zweitreview).

**Begründung.** ADR-021 Punkt 3 macht die Identität zum einzigen geteilten Punkt; zwei Namenszeilen wären die verworfenen zwei Personendatensätze. Ein Verbot für Personen mit Akte verriete durch seine Fehlermeldung genau das, was §4.8 schützt. Namensänderungen (Heirat, Tippfehler) betreffen die Person, nicht das Verhältnis.

**Anker.** `public.update_training_client` in `supabase/migrations/20260930100000_trn_001_training_clients.sql`.

**Änderungspfad.** Name im Training nur für Personen ohne weiteres Verhältnis änderbar, sonst stiller Vorschlag an owner: Prüfung in `update_training_client` plus Aufgabe (PRX-012) · Aufwand `mittel`.

### ANN-175 — Protokoll im Training: Detailansicht und jede Änderung ja, Trefferliste und Dublettenhinweis nein

Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (ADR-010, ADR-021 Punkt 8) · **LOG-EPIC-001:** geändert – Öffnen einmal je Person, Verhältnis und Tag; Änderungen weist das Datenmodell nach.

**Annahme.** Wie bei der Akte: Das Öffnen einer Trainingskund:in (`training_relationship.viewed`) und jede Änderung (`.created`, `.updated`, `.ended`, `.reopened`) stehen im Protokoll, Kontaktdaten und Namen nie — bei Änderungen nur die Namen der geänderten Felder, beim Vertragsende der Tag. Die Trefferliste und der Dublettenhinweis zeigen keinen Kontakt und werden nicht protokolliert; ihr abgewiesener Aufruf schon (`training_relationships.read`). Das Geburtsdatum einer Trainingskund:in nennt der Hinweis nur, wenn es genau das eingegebene ist. Bekannt und hingenommen: Wer schreiben darf, kann Beginn und Ende zurückdatieren und damit die Frist früher auslösen — beides steht mit Tag im Protokoll, wie beim Abschluss der Versorgung.

**Begründung.** ADR-021 Punkt 8 verlangt für das Training das Auditniveau der Akte; ADR-010 protokolliert das Öffnen, nicht die Trefferliste. Der Tag des Vertragsendes bestimmt die Frist und gehört deshalb in den Eintrag (wie `patient.care_concluded`).

**Anker.** `public.get_training_client`, `public.list_training_clients` und die Schreibwege in `supabase/migrations/20260930100000_trn_001_training_clients.sql`; Katalog in `src/features/audit/actions.ts`.

**Änderungspfad.** Trefferliste protokollieren: ein Eintrag je Aufruf in `list_training_clients` · Aufwand `klein`.

### ANN-176 — Trainingstermine schreiben owner, Trainingsbetreuung und Büro; zugeordnet wird die Trainingsbetreuung

Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2, DSFA Training)

**Annahme.** Einen Trainingstermin legen `owner`, `trainer` und `office` an, verschieben ihn und sagen ihn ab – dieselbe Stelle wie am Verhältnis (ANN-172). `therapist` und `team_lead` finden einen Trainingstermin über keinen Schreibweg („nicht gefunden“, wie eine unbekannte Kennung); umgekehrt findet die Trainingsbetreuung keinen Behandlungstermin. Betreuen kann einen Trainingstermin nur, wer die Rolle Trainingsbetreuung trägt, mit aktiver Beschäftigung und aktivem Zugang. Wer behandelt und trainiert, trägt beide Rollen. Ein abgewiesenes Anlegen steht als `denied` im Protokoll.

**Begründung.** ADR-022 Punkt 11 und ADR-021 Punkt 6 verbieten den Durchgriff. CAL-026 hatte nur das Lesen gefiltert; die Schreibwege holten eine Zeile per Kennung und prüften nur die Rolle. Aus einer Behandlungsrolle folgt keine Zuordnung im Training (§4.8: Häufung erlaubt, kein Schluss). Unsicher: ob das Büro Trainingstermine nur lesen soll.

**Anker.** `app.may_write_appointment_context`, `app.is_assignable_trainer`, der Trigger `appointments_context_write_guard` und `public.create_training_appointment` in `supabase/migrations/20260930110000_trn_004_training_appointments.sql`; Tests in `supabase/tests/training-appointments.test.ts`.

**Änderungspfad.** Büro nur lesend: `office` aus `app.can_write_training_relationships` nehmen, wie bei ANN-172 · Aufwand `klein`. Behandelnde Personen im Training zuordenbar: `therapist` in `app.is_assignable_trainer` · Aufwand `klein`.

### ANN-177 — Hausbesuch im Training: Anschrift aus dem Trainingskontakt, Hausnummer am letzten Leerzeichen getrennt

Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (ADR-021 Punkt 3, ANN-003)

**Annahme.** Ein Trainingstermin als Hausbesuch (Personal Training zu Hause, ADR-022 Punkt 9) nimmt die Anschrift als Kopie aus `training_contact_details`, nie aus der Akte – auch wenn dieselbe Person eine hat. Weil der Trainingskontakt „Straße und Hausnummer“ in einem Feld führt, wird am letzten Leerzeichen vor einer Hausnummer getrennt, die mit einer Ziffer beginnt („12“, „12a“, „12 a“, „3-5“, „7 / 9“). Gelingt das nicht oder fehlt PLZ oder Ort, wird der Hausbesuch abgewiesen („home visit requires a complete address“), statt eine Hausnummer zu erfinden.

**Begründung.** ADR-022 lässt die Quelle des Adress-Snapshots offen („die Kopie bleibt eine Kopie“); ADR-021 Punkt 3 erlaubt als geteilten Punkt nur die Identität, nicht die Kontaktdaten der Akte. Der Termin braucht Straße und Hausnummer getrennt (`appointments_address_matches_type`, Tourenplanung). Unsicher: Straßennamen mit Ziffer am Ende („An der B 27“) und Bruchnummern („Am Markt 1 1/2“) werden falsch getrennt (Zweitreview).

**Anker.** `app.split_street_and_house_number` und `app.training_visit_address` in `supabase/migrations/20260930110000_trn_004_training_appointments.sql`; Fälle in `supabase/tests/training-appointments.test.ts`.

**Änderungspfad.** Eigenes Feld Hausnummer im Trainingskontakt (Spalte, Formular, `app.training_visit_address` liest es) · Aufwand `mittel`. **Abnahme (Jannes, 2026-10-02):** Anders entschieden als bisher: Straße und Hausnummer werden getrennte Felder im Trainingskontakt; die Trennung am letzten Leerzeichen entfällt (BEF-111). **Fassung 2 (ABN-020, 2026-10-02, BEF-111 Punkt 1):** Der Trainingskontakt führt Straße und Hausnummer getrennt (`training_contact_details.house_number`); der Hausbesuch übernimmt beide unverändert, `app.split_street_and_house_number` entfällt. Bestehende Einträge wurden einmal aufgeteilt, nur wenn eindeutig (Hausnummer beginnt mit einer Ziffer, der Rest endet nicht auf eine Zahl oder einen einzelnen Großbuchstaben); der Rest steht auf der Kontaktseite „zur Prüfung“. `supabase/migrations/20261003107000_abn_020_training_house_number_invoice_address.sql`.

### ANN-178 — Eine Absage im Training setzt kein Ausfallhonorar-Kennzeichen

Recht · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Jannes (AGB Personal Training, ADR-022 offene Folgefrage)

**Annahme.** Wird ein Trainingstermin abgesagt, auch weniger als 24 Stunden vorher, setzt der Server keinen Gebührenanlass (`fee_basis` bleibt leer). Die Oberfläche fragt deshalb weder nach dem Eingang der Absage noch nennt sie ein Ausfallhonorar. Die Absagegründe sind dieselben Codes wie in der Behandlung, im Training als „Kund:in hat abgesagt“ beschriftet.

**Begründung.** ADR-022 lässt offen, ob der Anlass aus ADR-018 Punkt 8 im Dienstvertrag über Training entsteht – das ist eine Vertrags- und AGB-Frage des Projektinhabers. Bis sie beantwortet ist, gilt die Regel „unverändert für die Behandlung“ (ADR-022); `appointments_fee_basis_values` bindet den Anlass seit CAL-024 an `therapy`.

**Anker.** `v_anlass` in `public.cancel_appointment`, `supabase/migrations/20260930110000_trn_004_training_appointments.sql`; Absage in `src/features/training/TrainingAppointmentPage.tsx`.

**Änderungspfad.** Anlass auch im Training: Constraint `appointments_fee_basis_values` um `training` erweitern, Bedingung in `cancel_appointment`, Frage nach dem Eingang in der Absage · Aufwand `mittel`. **Abnahme (Jannes, 2026-10-02):** Bestätigt: vorerst kein Ausfallhonorar im Training. Die 24-Stunden-Regel der Behandlung (BEF-094) wird nicht automatisch übernommen; ein Anlass im Training braucht eine eigene Entscheidung.

### ANN-179 — Eine Vereinbarung im Training sperrt nicht, wenn die Anzahl erreicht ist

Praxisprozess · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Jannes (Sichtung Training Schritt 5)

**Annahme.** Die Trainingsgrundlage heißt in der Oberfläche „Vereinbarung“. Sie wird von owner, Trainingsbetreuung und Büro angelegt (Beginn, vereinbarte Einheiten oder ohne feste Anzahl), abgeschlossen und wieder geöffnet; jede Änderung steht im Protokoll. Die Zahl der Termine (ohne Abgesagte) ist eine Anzeige („7 Termine von 10“), keine Sperre: Ein elfter Termin geht. An einer abgeschlossenen Vereinbarung entstehen keine neuen Termine; die geplanten bleiben. Ein Termin ohne Vereinbarung ist eine Einzelstunde.

**Begründung.** ADR-022 Punkt 5: Pflicht ist das Verhältnis, nicht die Klammer. CAL-025 hat keine Deckungsregel gebaut, weil die Abrechnung im Training (TRN-EPIC-003) noch fehlt; eine Sperre ohne Abrechnung wäre ein Feature auf Vorrat (ADR-014).

**Anker.** `public.create_training_basis`, `public.conclude_training_basis`, `public.reopen_training_basis` und `public.list_training_bases` in `supabase/migrations/20260930111000_trn_005_training_bases.sql`; `vereinbarungText` in `src/features/training/api.ts`.

**Änderungspfad.** Sperre bei erreichter Anzahl: Prüfung in `create_training_appointment` und Hinweis im Formular · Aufwand `klein`.

### ANN-180 — Die Trainingsbetreuung sieht im Kalender nur Trainingstermine; Lesen protokolliert wie am Behandlungstermin

Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (ADR-022 Punkt 11, ADR-010) · **LOG-EPIC-001:** geändert – Lesen als „Trainingsverhältnis geöffnet“ einmal je Tag (ANN-230).

**Annahme.** Die Trainingsbetreuung öffnet Kalender und eigene Tagesliste und sieht darin nur Trainingstermine – mit dem Namen aus dem Training, nie aus der Akte. Behandlungstermine und interne Termine (Pausen, Besprechungen) sieht sie nicht; die Belegung erfährt sie nur beim Speichern als „belegt“. Arbeitszeiten sieht sie weiterhin nicht (die Policy bleibt bei den Praxisrollen). Protokolliert wird wie am Behandlungstermin: jede Änderung ja, Kalender, Tagesliste und Termindetail nicht; die Termine und Vereinbarungen einer Trainingskund:in gehören zur protokollierten Detailansicht (ANN-175). Jeder abgewiesene Lesezugriff steht als `denied` im Protokoll.

**Begründung.** ADR-022 Punkt 11 nimmt die Belegung als Restoffenbarung hin und nennt nur Zeit und Mitarbeitende. Die offene Folgefrage „Sieht die Trainingsrolle interne Termine?“ bleibt bei der engeren Antwort aus CAL-026. ADR-022 verlangt für Trainingstermine das Auditniveau der Behandlungstermine – nicht mehr.

**Anker.** `app.can_read_calendar`, `public.list_appointments`, `public.list_day_plan`, `public.get_training_appointment` und `public.list_training_client_appointments` in `supabase/migrations/20260930112000_trn_006_calendar_by_context.sql`; `canSeeCalendar` in `src/features/session/types.ts`.

**Änderungspfad.** Interne Termine für die Trainingsbetreuung: `app.may_read_appointment_context` für `internal` um `app.can_read_training_relationships()` erweitern · Aufwand `klein`. Termindetail protokollieren: Eintrag in `get_training_appointment` · Aufwand `klein`. **Abnahme (Jannes, 2026-10-02):** Anders entschieden als bisher: Die Trainingsbetreuung sieht relevante belegte Zeiten als anonyme Blöcke „belegt“, ohne Kontext, Namen oder Inhalt, damit sie freie Zeiten erkennt (BEF-112; `PROJECT_PRINCIPLES.md` §4.8, Belegung). **Fassung 2 (ABN-021, 2026-10-02, BEF-112):** Die Trainingsbetreuung sieht im Kalender belegte Zeiten der Mitarbeitenden, die sie buchen kann, als anonyme Blöcke „belegt“ (`list_busy_blocks`: genau Person, Beginn, Ende; angrenzende Zeiten verschmolzen; ohne abgesagte; Praxisrollen bekommen nichts; kein Audit, die Belegung ist die in ADR-022 Punkt 11 getragene Restoffenbarung). Räume gibt es im Datenmodell nicht. `supabase/migrations/20261003108000_abn_021_busy_blocks.sql`.

### ANN-181 — Im Training entsteht eine Leistung aus dem durchgeführten Termin

Praxisprozess · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Jannes (Sichtung Training Schritt 7)

**Annahme.** Die „vereinbarte Trainingsleistung“ aus §19 ist der durchgeführte Trainingstermin (`completed`, später auch `documented`). Eine Dokumentation wird nicht verlangt, ein Ausfallhonorar gibt es nicht (ANN-178). Erfasst wird wie in der Behandlung durch `owner` und `office` im Bereich **Abrechnung → Leistungen**. Angeboten werden nur Positionen des Bereichs `training`, ohne Vorbelegung. Die Trainingsbetreuung erfasst nicht, und die Ausnahme aus ANN-140 (Behandelnde am eigenen Termin) gilt nur am Behandlungstermin.

**Begründung.** §19 bindet die Fakturierung an die finalisierte Dokumentation nur für die Behandlung. Für das Training nennt er die vereinbarte Leistung, und die Roadmap stellt klar, dass TRN-EPIC-003 `documented` nicht voraussetzt. ADR-022 Punkt 8 macht `documented` am Trainingstermin erst mit dem Trainingsprotokoll erreichbar. Eine Trainingsgrundlage hat kein Kontingent wie die Verordnung (ANN-179), daher gibt es keinen Vorschlag aus der Grundlage. Unsicher: ob eine Einheit schon mit der Buchung geschuldet ist (Paket, Abo). Das regelt ADR-009 Punkt 21 in Block 5.

**Anker.** `app.appointment_is_billable` in `supabase/migrations/20260930120000_trn_007_training_services.sql`; Tests in `supabase/tests/training-services.test.ts`. Dass Behandelnde am Trainingstermin nicht erfassen (`app.can_record_services_for_appointment`), ist keine Annahme, sondern ADR-021 Punkt 6.

**Änderungspfad.** Erst nach dem Trainingsprotokoll abrechnen: Den Zweig `training` in `app.appointment_is_billable` auf `documented` setzen · Aufwand `klein`. Trainingsbetreuung erfasst am eigenen Termin: Zweig in `app.can_record_services_for_appointment` für `trainer` und `training` · Aufwand `klein`. **Abnahme (Jannes, 2026-10-02):** Langfristig feste Paketpreise für drei oder sechs Monate Betreuung; die 140 € der Behandlung gelten im Training nicht. Bei Paketen entsteht die Forderung aus der Paketvereinbarung, enthaltene Termine erzeugen keine weitere. Preis, Umfang und Zahlungsweise offen; eingeplant in ABR-EPIC-007 (BEF-114, ADR-009 Punkt 21).

### ANN-182 — Eine Trainingsrechnung geht an die Kund:in selbst, mit der Anschrift aus dem Training und ohne Geburtsdatum

Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (ADR-021 Punkt 3, Art. 5 Abs. 1 lit. c DSGVO)

**Annahme.** Eine Trainingsrechnung hat keinen abweichenden Empfänger. Empfänger ist die Kund:in selbst, mit Name und Anschrift aus dem Trainingskontakt. Die Zeile „Straße und Hausnummer“ kommt ungeteilt auf die Rechnung. Aus der Akte wird nichts gelesen, auch wenn dieselbe Person eine hat. Die hinterlegten Empfänger (Beihilfe, Versicherung, Betreuung) hängen an der Akte und lassen sich an einer Trainingsrechnung nicht setzen. Die Person, für die geleistet wurde, steht als „Leistung für“ auf der Rechnung, nicht als „Behandelt“, und ohne Geburtsdatum. Fehlt die Anschrift im Training, wird die Rechnung ohne Anschrift ausgestellt.

**Begründung.** ADR-021 Punkt 3 erlaubt zwischen den Verhältnissen nur die gemeinsame Identität, keine Kontaktdaten und keine Empfängerstammdaten der Akte. Das Geburtsdatum dient in der Behandlung der Zuordnung bei Beihilfe und privater Versicherung. Für einen Dienstvertrag über Training ist es keine Pflichtangabe nach § 14 Abs. 4 UStG und entfällt nach dem Grundsatz der Datenminimierung. Unsicher: ob Firmen (Betriebssport) oder Angehörige als Zahler vorkommen – dann bräuchte das Training eigene Empfänger. Unsicher ist auch, ob § 14 Abs. 4 Nr. 1 UStG eine vollständige Anschrift verlangt: Ohne Anschrift im Trainingskontakt ist die Rechnung formal unvollständig.

**Anker.** Zweig `training_relationship_id is not null` in `app.build_invoice_document`, `supabase/migrations/20260930121000_trn_008_training_invoices.sql`; Tests in `supabase/tests/training-invoices.test.ts`. Die Oberfläche hat keine eigene Regel: Sie liest den Bereich aus dem Dokument (`personLabel`, `empfaengerart` in `src/features/billing/anzeige.ts`) und bietet die Empfängerwahl nur an einer Rechnung mit Patient:in an.

**Änderungspfad.** Eigene Empfänger im Training: Empfängerstammdaten an `training_relationships` binden (Spalte oder eigene Tabelle), `set_invoice_recipient` und der Zweig in `app.build_invoice_document` lesen sie · Aufwand `mittel`. Ausstellen ohne Anschrift sperren: Prüfung in `issue_invoice` · Aufwand `klein`. **Abnahme (Jannes, 2026-10-02):** Bestätigt, mit einer Korrektur: Ohne vollständige Empfängeranschrift wird nicht ausgestellt (BEF-111). **Fassung 2 (ABN-020, 2026-10-02, BEF-111 Punkt 2):** `issue_invoice` stellt keine Rechnung ohne vollständige Empfängeranschrift aus (Straße, Hausnummer, PLZ, Ort; `app.assert_invoice_recipient_address`, DETAIL nennt die Felder) — auf Entscheidung von Jannes für **alle** Rechnungen, nicht nur im Training. Die Rechnungsseite nennt, was fehlt, und führt bei Rechnungen an die Person selbst zu den Stammdaten.

### ANN-183 — Nach drei Jahren fällt das Trainingsverhältnis bis auf die Belege; diese bleiben bis zum Ende ihrer steuerlichen Frist

Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (ADR-008 Punkt 2, ADR-021 Punkt 4)

**Annahme.** Drei Jahre nach Vertragsende löscht der Löschlauf das Trainingsverhältnis. Liegt einer seiner Belege (Rechnung, Storno, Erinnerung, Zahlung) noch in der Frist von acht Jahren ab Ende des Kalenderjahres, fällt nur ein Teil: Kontakt mit Anschrift und Geburtsdatum, Termine ohne Leistung und Vereinbarungen ohne verbliebenen Termin. Stehen bleiben die Belege, die abgerechneten Termine mit ihren Leistungen, die Verhältniszeile und der Name der Person. Im Bericht des Laufs erscheint das Verhältnis als `steuerfrist_gehalten`. Nach Ablauf der Belegfrist fällt der Rest. Jeder gelöschte Datensatz steht im Löschjournal und wird nach einem Restore erneut gelöscht.

**Begründung.** ADR-021 Punkt 4 legt drei Jahre fest. ADR-008 Punkt 2 und § 147 Abs. 3 AO rechtfertigen die längere Aufbewahrung nur für die Belege, und die Rechnung trägt Name und Anschrift in ihrem Snapshot. Leistung und Rechnung zeigen mit RESTRICT auf Termin und Verhältnis; diese Zeilen bleiben deshalb, ohne Kontakt. Unsicher: ob der abgerechnete Termin (Zeit, betreuende Person) als Teil des Belegs gilt oder früher fallen muss.

**Seit TRN-EPIC-004** fällt in der Teillöschung auch das Trainingsprotokoll, am abgerechneten Termin ebenso: Es ist kein Beleg. Der Termin bleibt `documented` stehen, ohne Protokoll – die einzige Stelle, an der die Invariante aus ADR-018 Punkt 3 nicht mehr greift, und zwar durch die Frist, nicht durch einen Schreibweg.

**Anker.** `app.reduce_training_relationship` und die Sperre in der Trainingsschleife von `public.apply_retention` in `supabase/migrations/20260930122000_trn_epic_003_zweitreview.sql` (mit den Protokollen neu gefasst in `supabase/migrations/20260930130000_trn_009_training_protocols.sql`); Frist in `app.training_billing_retention_due_at`, `supabase/migrations/20260930121000_trn_008_training_invoices.sql`; Tests in `supabase/tests/training-invoices.test.ts`, für das Protokoll in `supabase/tests/training-protocols.test.ts`.

**Änderungspfad.** Abgerechnete Termine auch früher löschen: die Leistung vom Termin lösen (`appointment_id` nullbar, `on delete set null`) und in `app.reduce_training_relationship` mitlöschen · Aufwand `mittel`.

### ANN-184 — Trainingsprotokolle schreiben, abschließen und lesen nur owner und Trainingsbetreuung

Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (ADR-021 Punkte 6 und 8, §4.8) · **LOG-EPIC-001:** geändert – Lesen als „Trainingsverhältnis geöffnet“ einmal je Tag (ANN-230).

**Annahme.** Das Trainingsprotokoll schreiben, abschließen und lesen `owner` und `trainer`. Das Büro (`office`) liest es nicht, auch nicht in der Liste der Einheiten. Es sieht aber weiter den Termin mit seinem Zustand und kann ihn als durchgeführt vermerken (ANN-186). `therapist` und `team_lead` erreichen das Protokoll nicht (kein Durchgriff). Jedes Öffnen eines Protokolls, auch in der Liste, steht als `training_protocol.viewed` im Protokoll, jeder abgewiesene Versuch als `denied`.

**Begründung.** Ein Trainingsprotokoll kann Angaben zur Gesundheit enthalten (Schmerz, Belastbarkeit), die im Training unter Art. 9 Abs. 2 lit. a DSGVO stehen (ADR-021 Punkt 4). §4.8 nennt das Büro im Training „nur organisatorisch“; für die Abrechnung braucht es den Zustand des Termins, nicht den Inhalt der Einheit. Das ist enger als in der Behandlung, wo das Büro die Dokumentation liest (ADR-004 Fassung 2). Unsicher: ob das Büro für Rückfragen der Kund:in zur Rechnung den Inhalt braucht.

**Anker.** `app.can_access_training_protocols` in `supabase/migrations/20260930130000_trn_009_training_protocols.sql`; `canWriteTrainingProtocols` in `src/features/session/types.ts`; Tests in `supabase/tests/training-protocols.test.ts`.

**Änderungspfad.** Büro liest mit: `app.can_access_training_protocols` in eine Lese- und eine Schreibfunktion teilen und `office` in die Lesefunktion aufnehmen, dazu `canWriteTrainingProtocols` · Aufwand `klein`. **Abnahme (Jannes, 2026-10-02):** Anders entschieden als bisher: Das Büro liest Trainingsprotokolle und sieht ihren Zustand; Schreiben und Abschließen bleiben bei owner und Trainingsbetreuung. Nachgezogen in `PROJECT_PRINCIPLES.md` 0.19 §4.8 und ADR-021 Fassung 2 Punkt 10; scharf erst mit der DSFA (B2). Umsetzung BEF-113. **Fassung 2 (ABN-022, 2026-10-02, BEF-113 Punkt 1):** Lesen und Schreiben getrennt: `app.can_read_training_protocols()` (owner, Trainingsbetreuung, Büro) für `get_training_protocol` und `list_training_protocols`, protokolliert als `training_protocol.viewed`; Schreiben, Abschließen und Nachträge bleiben bei `app.can_access_training_protocols()` (owner, trainer). Das Büro sieht Protokoll und Einheiten nur zum Lesen. **Scharf mit echten Daten erst, wenn die DSFA (B2) das Lesen durch das Büro bestätigt.**

### ANN-185 — Ein abgeschlossenes Trainingsprotokoll ist unveränderlich; einen Korrekturweg gibt es in V1 nicht

Praxisprozess · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Jannes (Sichtung Training Schritt 10)

**Annahme.** Ein Trainingsprotokoll ist Entwurf oder abgeschlossen. Den Entwurf können `owner` und `trainer` beliebig oft ändern. Das Abschließen ist ein ausdrücklicher Schritt mit Rückfrage. Danach ist der Text unveränderlich: über jeden Schreibweg, auch am Server vorbei. Es gibt weder Korrektur noch Nachtrag und auch keine automatische Finalisierung.

**Begründung.** §13 verbietet, Dokumentation unbemerkt zu überschreiben. ADR-022 Punkt 7 nimmt dem Protokoll die Versionspflicht aus § 630f BGB. Ohne Versionen bliebe als Korrektur nur das Überschreiben, und das schließt §13 aus. ADR-022 Punkt 6 schließt die automatische Finalisierung für den Trainingstermin aus. Unsicher: wie oft ein Tippfehler nach dem Abschluss auffällt. Das zeigt erst die Nutzung.

**Anker.** `public.training_protocols_guard` in `supabase/migrations/20260930130000_trn_009_training_protocols.sql`; Tests in `supabase/tests/training-protocols.test.ts` („ist danach unveraenderlich“).

**Änderungspfad.** Nachtrag wie in der Behandlung: eigene Zeile mit Verweis auf das Protokoll, eigener Schreibweg und Anzeige unter dem Text · Aufwand `mittel`. **Abnahme (Jannes, 2026-10-02):** Bestätigt: Abgeschlossen bleibt unveränderlich. Korrekturen kommen als verknüpfter Nachtrag mit Grund, Verfasser:in und Zeitpunkt (BEF-113). **Fassung 2 (ABN-022, 2026-10-02, BEF-113 Punkt 2):** Korrekturen am abgeschlossenen Protokoll kommen als Nachtrag (`training_protocol_addenda`, `add_training_protocol_addendum`) mit Grund, Verfasser:in und Zeitpunkt, unveränderlich, unter dem Text angezeigt; Audit `training_protocol.addendum_created`.

### ANN-186 — Am Trainingstermin vermerken owner, Trainingsbetreuung und Büro „durchgeführt“ und öffnen wieder

Praxisprozess · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Jannes (Sichtung Training Schritt 10)

**Annahme.** Einen Trainingstermin vermerken dieselben Rollen als durchgeführt und öffnen ihn wieder, die ihn auch anlegen, verschieben und absagen: `owner`, `trainer` und `office` (ANN-176). „Durchgeführt“ braucht kein Protokoll (wie ANN-005 in der Behandlung). „Dokumentiert“ wird der Termin erst mit dem abgeschlossenen Protokoll, und von dort gibt es keinen Weg zurück (ADR-018 Punkt 2). Neben einem abgeschlossenen Protokoll gibt es keine Absage und kein Nichtantreffen. Ein **Entwurf** fällt bei Absage oder Nichtantreffen im selben Vorgang weg; das Protokoll hält das als `training_protocol.discarded` fest, nur mit Kennungen. Das gilt auch, wenn das Büro absagt, das den Entwurf nicht sieht. Der verworfene Entwurf steht nicht im Löschjournal: Er wurde nicht nach Ablauf einer Frist gelöscht, sondern ist mit seinem Termin entfallen. Nach einem Restore stünde er wieder da, an einem abgesagten Termin.

**Begründung.** ADR-018 Punkt 2 gibt den Abschluss den „therapeutischen Rollen“. Im Training ist das die Trainingsbetreuung; ohne sie könnte niemand, der die Einheit betreut hat, sie abschließen. Das Büro schließt auch in der Behandlung ab (`app.can_complete_appointment`), und im Training fasst es den Termin ohnehin an. Ein abgeschlossenes Protokoll heißt: Die Einheit hat stattgefunden, eine Absage daneben wäre ein Widerspruch im Bestand. Ein Entwurf heißt das nicht. Würde er sperren, bliebe ein Termin, an dem jemand vorgeschrieben hat, für immer bestätigt, und ADR-022 Punkt 10 (absagen und neu anlegen) liefe ins Leere (Zweitreview).

**Anker.** Rollenprüfung in `public.complete_appointment` und `public.reopen_appointment` in `supabase/migrations/20260930131000_trn_010_training_documented.sql`; `public.appointments_training_protocol_guard` in `supabase/migrations/20260930132000_trn_epic_004_zweitreview.sql`; `TerminAbschluss` in `src/features/training/TrainingProtocol.tsx`.

**Änderungspfad.** Nur die Trainingsbetreuung schließt ab: `or app.can_write_training_relationships()` in beiden Funktionen durch eine Prüfung auf `trainer` und `owner` ersetzen, dazu `office` im Kontextzweig ausnehmen · Aufwand `klein`. Entwurf sperrt die Absage doch: den Löschzweig in `public.appointments_training_protocol_guard` wieder durch die Sperre ersetzen und einen Weg zum Verwerfen bauen · Aufwand `mittel`. **Abnahme (Jannes, 2026-10-02):** Rechte bestätigt. Vor dem Verwerfen eines Entwurfs weist die Oberfläche auf den Verlust hin, und ein verworfener Entwurf taucht nach einer Wiederherstellung nicht wieder auf (BEF-113). **Fassung 2 (ABN-022, 2026-10-02, BEF-113 Punkt 3):** Vor der Absage nennt die Rückfrage einen vorhandenen Protokollentwurf, der dabei verworfen wird, auch dem Büro. Der verworfene Entwurf steht im Löschjournal (`appointments_training_protocol_guard`) und taucht nach einer Wiederherstellung nicht wieder auf. `supabase/migrations/20261003109000_abn_022_training_protocol_read_addenda_discard.sql`.

### ANN-187 — Ein Plattformkonto hat kein Profil in `user_profiles`; Praxis- und Plattformkonto schließen sich in beide Richtungen aus

Technik · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Zweitreview POR-EPIC-001

**Annahme.** Ein Konto, das an einen Plattformzugang gebunden ist oder war, bekommt nie eine Zeile in `user_profiles` und damit nie eine Rolle, auch nicht über die Annahme einer Praxiseinladung. Umgekehrt bindet ein Zugang kein Konto, das ein Profil hat, auch keines ohne Rolle. Die Konto-Art ergibt sich damit aus den Daten: Profil heißt Praxiskonto, gebundener Zugang heißt Plattformkonto. Ein eigenes Kennzeichen am Konto gibt es nicht.

**Begründung.** ADR-023 Punkt 2 verlangt, dass die Datenbank „Praxis- oder Plattformkonto, nie beides“ erzwingt, und überlässt das Schema dem SPEC. Ohne Profil liefert `app.current_organization_id()` für ein Plattformkonto `null`. Damit läuft jede Praxispolicy ins Leere, bevor sie eine Rolle fragt, und zwar auch eine künftige, die jemand ohne Rollenprüfung schreibt. Das ist die stärkste Linie, die ohne neuen Code in jeder Policy zu haben ist. Punkt 5 nennt `user_profiles` beim Konto nur beschreibend; die Frist von 30 Tagen gilt hier für das Konto beim Anmeldedienst (ANN-189). Unsicher ist, ob spätere Plattformfunktionen ein eigenes Profil brauchen, etwa für Anrede oder Einstellungen. Das käme dann als eigene Tabelle, nicht als `user_profiles`.

**Anker.** `app.user_profiles_not_platform_account` und `app.platform_accesses_guard` in `supabase/migrations/20260930141000_por_002_platform_accesses.sql`; Beweis über alle Tabellen und Funktionen in `supabase/tests/plattform-abschottung.test.ts`, Riegel in `supabase/tests/platform-accesses.test.ts`.

**Änderungspfad.** Plattformkonten mit Profil: eine Spalte `account_kind` an `user_profiles`, alle Praxispolicies auf `app.is_practice_account()` umstellen und den Abschottungstest gegen ein Konto mit Profil laufen lassen · Aufwand `groß`.

### ANN-188 — Mail-Einladung nur mit Vermerk „Adresse von der Person selbst bestätigt“, gespeichert an der Einladung

Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2, B5; ADR-023 Punkt 11)

**Annahme.** Per Mail wird nur an die Adresse eingeladen, die im Verhältnis steht (Akte bzw. Kontakt im Training). Vorher muss die einladende Person ankreuzen, dass die Person selbst ihr diese Adresse bestätigt hat. Die Einladung speichert die Adresse, wer den Vermerk gesetzt hat und wann. Vor dem Versand prüft der Server, ob die Adresse im Verhältnis noch dieselbe ist. Hat sie sich geändert, wird nicht versandt, und es braucht eine neue Einladung. Wer einlädt, ist zugleich, wer übergibt. Einen eigenen Vermerk „übergeben durch“ gibt es daneben nicht.

**Begründung.** ADR-023 Punkt 11 (Fassung 2): „Abgeglichen heißt: Die Person hat die Adresse selbst bestätigt.“ Eine Adresse aus einer Überweisung oder von Angehörigen genügt nicht, weil in der mobilen Versorgung die Adresse in der Akte oft der Tochter gehört. Ein Häkchen ist die kleinste Form, die das nachweisbar macht, ohne ein neues Datum über die Person zu erheben. Unsicher ist, ob die Prüfung einen Vermerk je Adresse am Verhältnis statt an der Einladung verlangt.

**Anker.** `public.invite_platform_access` und `public.platform_invitation_mail` in `supabase/migrations/20260930141000_por_002_platform_accesses.sql` (Constraint `platform_access_invitations_email_channel`); `MailEinladung` in `src/features/platform-access/PlattformAbschnitt.tsx`.

**Änderungspfad.** Bestätigung am Verhältnis statt an der Einladung: zwei Spalten an den Kontakttabellen, die Einladung liest sie statt des Häkchens · Aufwand `mittel`.

### ANN-189 — Ende des Zugangs: Entziehen, Ende der Lesefrist oder Ablauf der letzten Einladung; der Löschlauf entfernt das Konto beim Anmeldedienst selbst

Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2, ADR-008 Validierung; ADR-023 Punkt 5)

**Annahme.** Ein Zugang endet mit dem frühesten dieser Ereignisse: Er wird entzogen. 30 Tage nach dem Ende des Verhältnisses läuft die Lesefrist ab (DSN-001 D2; Anker ist der Abschluss der Versorgung bzw. das Vertragsende). Ein nie eingelöster Zugang endet mit dem Ablauf seiner letzten Einladung. Fällt das Verhältnis, endet der Zugang sofort. Er löst sich dabei von Verhältnis und Person und behält nur die Kennung des Verhältnisses; die Adressen seiner Einladungen werden geleert. Der Löschlauf entfernt ein Konto, 30 Tage nachdem alle seine Zugänge geendet haben, direkt aus `auth.users`, am Anfang des Laufs, und vermerkt es im Löschjournal als `auth_users`. Zugang und Einladungen fallen drei Jahre nach dem Ende (Datenklasse `plattformzugang`). Beides wird nach einem Restore erneut gelöscht.

**Begründung.** ADR-023 Punkt 5 (Fassung 2) trennt die Fristen: Das Konto fällt 30 Tage nach dem letzten Zugang, der Nachweis nach drei Jahren wie das Auditlog (ANN-029). Die Konsequenzen dort verlangen, dass der Nachweis die Stammdaten nicht festhält. Die Lesefrist als Ende zu nehmen folgt aus D2: Danach sieht die Person nur noch „Ich“, ihr Zugang hat also keinen Zweck mehr. Der Lauf löscht das Konto selbst und nicht über den Zugangsdienst, weil er zeitgesteuert ohne Edge Runtime laufen muss (ADR-015 Punkt 20). Seit dem Zweitreview räumt der Lauf auch ein Konto ab, das der Zugangsdienst angelegt hat (Marke `platform_account` in den Metadaten des Anmeldedienstes) und das 30 Tage nach dem Anlegen noch an keinem Zugang hängt. Jedes Ende eines Zugangs, auch durch Löschlauf oder Zusammenführen, steht als `platform_access.revoked` mit Grund im Protokoll. Unsicher: ob der Anmeldedienst im Produktivprojekt das Löschen aus `auth.users` per SQL durch die Rolle des Laufs zulässt. Das ist vor OPS-001 am Testprojekt zu prüfen.

**Anker.** `app.platform_access_ended_at`, `app.delete_due_platform_accounts`, `app.delete_due_platform_accesses`, der Riegel in `app.platform_accesses_guard` und die Nachträge in `public.apply_retention` und `public.reapply_deletion_journal`, alle in `supabase/migrations/20260930141000_por_002_platform_accesses.sql`; Konstante `app.platform_read_period`; Tests in `supabase/tests/platform-accesses.test.ts` („im Loeschlauf“).

**Änderungspfad.** Andere Fristen: `app.platform_read_period` bzw. `retention_classes.plattformzugang` ändern · Aufwand `klein`. Konten über den Zugangsdienst löschen: den Löschschritt in eine Warteschlange schreiben lassen, die der Dienst abarbeitet · Aufwand `mittel`. **Abnahme (Jannes, 2026-10-02):** Fristen bestätigt. Der Ablauf der Einladung beendet nur einen nie eingelösten Zugang; das Konto fällt erst 30 Tage nach dem Ende aller seiner Zugänge. Gelöscht wird über die unterstützte Admin-API des Anmeldedienstes statt per SQL in `auth.users`; zu prüfen in OPS-001 (BEF-115).

**Umgesetzt (ABN-011, 2026-10-02).** Fristen unverändert; neu ist der Weg. Der Löschlauf entzieht die Zugänge sofort und gibt einen Löschauftrag (`platform_account_deletions`); der Zugangsdienst holt ihn ab (`claim_platform_account_deletions`), entfernt das Konto über die Admin-API des Anmeldedienstes und bestätigt (`confirm_platform_account_deletion`). Erst die Bestätigung schreibt das Löschjournal, und sie wird abgewiesen, solange das Konto noch besteht. Nach einem Restore gibt `reapply_deletion_journal` neue Aufträge. Tests mit zwei Zugängen (einer endet früher) und einer abgelaufenen Einladung zum neuen Kennwort in `supabase/tests/platform-accesses.test.ts`. Den Aufruf durch den Betrieb regelt ANN-217.

### ANN-190 — Ohne Geburtsdatum gibt es keine Einladung zu einem eigenen Zugang

Praxisprozess · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Jannes (Sichtung Plattform)

**Annahme.** Ein eigener Zugang setzt 18 Jahre voraus (ADR-023 Punkt 15, W4). Der Server prüft das beim Einladen am Geburtsdatum im Verhältnis. Fehlt das Geburtsdatum, wird nicht eingeladen, und die Praxis sieht den Hinweis, es zu ergänzen. Das betrifft vor allem Trainingskund:innen, deren Geburtsdatum kein Pflichtfeld ist.

**Begründung.** Punkt 15 verlangt die Prüfung am Server und nicht in der Oberfläche. Ohne Geburtsdatum lässt sich die Grenze nicht prüfen. Die restriktive Seite gilt (§16), und das Ergänzen kostet einen Handgriff. Unsicher ist, wie oft das im Training stört.

**Anker.** Prüfung in `public.invite_platform_access`, Grenze in `app.platform_min_age_years` (`supabase/migrations/20260930141000_por_002_platform_accesses.sql`); Hinweis in `src/features/platform-access/api.ts` (`einladefehler`).

**Änderungspfad.** Ohne Geburtsdatum einladen und die Volljährigkeit als Vermerk der einladenden Person festhalten: ein Häkchen wie bei ANN-188 · Aufwand `klein`.

### ANN-191 — Beim Einlösen legt die Person ihre Adresse selbst fest; ein bestehendes Konto derselben Person bestätigt sie mit ihrem Kennwort

Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B5; ADR-023 Punkte 4, 7, 8)

**Annahme.** Beim Einlösen gibt die Person Adresse und Kennwort ein. Hat die Adresse noch kein Konto, legt der Zugangsdienst eines an, die Adresse gilt als bestätigt. Hat sie schon eines, zum Beispiel weil die Person schon einen Zugang zum Training hat, bestätigt die Person es mit ihrem Kennwort. Ein Konto einer anderen Person weist die Datenbank ab, ebenso ein Praxiskonto. Die Adresse des Kontos darf von der im Verhältnis abweichen. Scheitert das Binden, wird ein gerade angelegtes Konto wieder entfernt.

**Begründung.** Punkt 4: ein Konto je Person, bis zu zwei Zugänge. Punkt 8: Vor Ort legt die Person „dort Adresse und Kennwort fest“. Die Übergabe ist die Identitätsprüfung (Punkt 11), die Adresse also nur Anmeldename. Beim Weg per Mail ist sie ohnehin die bestätigte aus dem Verhältnis. Die Prüfung per Kennwort meldet sich beim Anmeldedienst an und erzeugt dabei eine Sitzung, die der Dienst verwirft. Unsicher ist, ob die Prüfung eine abweichende Adresse beim Weg vor Ort akzeptiert. Seit dem Zweitreview bekommen „Adresse vergeben“ und „Konto passt nicht“ dieselbe Auskunft. Jeder solche Fehlversuch zählt, nach fünf ist die Einladung verbraucht. Die Sitzung aus der Kennwortprüfung beendet der Dienst sofort. **Mit B13 neu zu entscheiden:** Die selbst gewählte Adresse gilt beim Anlegen als bestätigt. Eine Wiederherstellung per Mail darf es für Plattformkonten erst geben, wenn diese Adresse bestätigt wurde, sonst wäre sie ein Übernahmeweg.

**Anker.** `einloesen` in `supabase/functions/platform-access/handler.ts`, `kennwortPruefen` in `supabase/functions/platform-access/anmeldedienst.ts`; Personenprüfung in `app.platform_accesses_guard` (`supabase/migrations/20260930141000_por_002_platform_accesses.sql`).

**Änderungspfad.** Adresse muss der im Verhältnis entsprechen: Vergleich in `public.redeem_platform_invitation` · Aufwand `klein`. **Abnahme (Jannes, 2026-10-02):** Bestätigt mit Bedingung: Wiederherstellung per Mail nur, wenn das Postfach tatsächlich per Link bestätigt wurde; der beim Anlegen gesetzte Status genügt nicht. Ohne Bestätigung gibt es einen neuen Code nach Identitätsprüfung vor Ort; jede Adressänderung verlangt neue Bestätigung. Die Sperre gilt im Server und im Anmeldedienst, nicht nur in der Oberfläche (BEF-118, B13).

**Umgesetzt (ABN-012, 2026-10-02).** Der Bestätigungsstatus, den der Zugangsdienst beim Anlegen setzt, gilt nur für die Anmeldung. Für die Wiederherstellung per Mail zählt allein das eigene Merkmal eines per Link bestätigten Postfachs (`platform_mailbox_confirmations`), für die Adresse, die das Konto heute trägt (ANN-218).

### ANN-192 — Der Hausbesuch ist die Regel und trägt kein Wort; Praxis- und Videotermin tragen ihr Kennzeichen

Praxisprozess · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Jannes (Sichtung Praxisverwaltung Schritt 9)

**Annahme.** Die Regel-Terminart dieser Praxis ist der Hausbesuch. Er steht deshalb an keinem Termin, keiner Kalenderkachel, keiner Tageskarte und keiner Terminzeile als Wort; nur eine abweichende Art wird gekennzeichnet — der Praxistermin mit seinem Standort, der Videotermin mit einem Hinweis, dass noch kein Videolink erzeugt wird. Wer den Ort eines Hausbesuchs sucht, findet die Anschrift mit dem Navigationsknopf. *Seit UBK-017 (ANN-242) steht auf der Kalenderkachel des Hausbesuchs Straße und Hausnummer – ein Ort, kein Wort der Terminart.*

**Begründung.** Jannes (2026-09-30): „Hausbesuch ist Standard, nur ein Praxistermin muss auffallen.“ Ein Wort, das an jeder Stelle steht, sagt nichts mehr und frisst am Telefon eine Zeile je Karte (§5, ADR-015 Punkt zur Bedienbarkeit). Die Terminart bleibt im Datenmodell und in allen Formularen wählbar; nur die Anzeige des Regelfalls entfällt. Eine Praxis mit anderem Regelfall ändert eine Konstante.

**Anker.** `REGEL_TERMINART` und `appointmentTypeHint` in `src/features/appointments/api.ts`; alle Kacheln und Zeilen lesen die Terminart darüber.

**Änderungspfad.** Anderer Regelfall (etwa eine Praxis, die überwiegend im Haus behandelt): `REGEL_TERMINART` auf `practice` setzen · Aufwand `klein`. Terminart immer zeigen: `appointmentTypeHint` gibt stets das Etikett zurück · Aufwand `klein`. **Abnahme (Jannes, 2026-10-02):** bestätigt.

### ANN-193 — Die behandelnde Person steht am Termin nur, wenn sie nicht die angemeldete Person ist

Praxisprozess · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Jannes (Sichtung Praxisverwaltung Schritt 9)

**Annahme.** Auf der Terminseite steht die behandelnde Person nur, wenn sie von der angemeldeten Person abweicht — für das Büro also immer, für die Therapeut:in nur an fremden Terminen. Am eigenen Termin ist die Angabe klar und entfällt. Der Status „Bestätigt“ steht ebenfalls nur für Vorlesesoftware; sichtbar ist nur ein abweichender Zustand (abgesagt, nicht angetroffen, abgeschlossen, dokumentiert, abgerechnet).

**Begründung.** Jannes (2026-09-30): „Die behandelnde Person ist in der Situation klar, der Status für die Behandelnde irrelevant.“ Die Zuordnung bleibt in den Daten und im Kalender sichtbar; die Seite zeigt nur, was in der Situation nicht schon feststeht (§5). Für das Büro, das fremde Termine öffnet, steht die Person weiter im Kopf.

**Anker.** `fremdePerson` in `src/features/appointments/AppointmentHeadline.tsx`.

**Änderungspfad.** Person immer zeigen: die Bedingung `fremdePerson` entfernen · Aufwand `klein`. Status immer sichtbar: den Zweig für `confirmed` in derselben Datei durch das Abzeichen ersetzen · Aufwand `klein`. **Abnahme (Jannes, 2026-10-02):** bestätigt.

### ANN-194 — Die Übersicht ruft die Route des eigenen Tages beim Öffnen ab

Datenschutz · entschieden (Jannes) · 2026-10-01 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung zusammen mit B2 und dem Gate aus ADR-019 Punkt 9; Kontingent beim Anbieter nach den ersten Feldtagen

**Annahme.** Die Übersicht ruft für die angemeldete Person beim Öffnen die Punkte der eigenen Tagesroute (`list_day_route`), den Startort der Praxis und **eine** Route über alle Stopps ab, solange noch ein Besuch mit Ort aussteht — bisher geschah das dort erst beim Aufklappen der Karte. Hinaus gehen wie in Tour und Kalender nur Koordinaten in Fahrtreihenfolge und das Fahrprofil; gespeichert wird nichts. Die Karte selbst (Kacheln aus dem Browser) lädt weiterhin erst auf Tipp.

**Begründung.** Der Design-Handoff vom 2026-10-01 (Entscheidung Jannes: Wegbalken mit Farbstufen nach Puffer) braucht die Fahrzeit, bevor losgefahren wird; ohne Abruf beim Öffnen gäbe es keinen Balken. ADR-019 Punkt 12, 13, 15 und 16 sind unverändert erfüllt, „nur auf Aktion" gilt nach dem ADR für den Handoff, nicht für Routen; neu ist allein die Häufigkeit: ein Aufruf je Besuch der Übersicht, im Zwischenspeicher der Seite gehalten und 30 Sekunden nach dem Verlassen verworfen. Unsicher: ob die Prüfung die häufigeren Aufrufe anders bewertet als in Tour und Kalender, und ob das Kontingent des Anbieters sie trägt.

**Anker.** `FAHRZEITEN_BEIM_OEFFNEN` und `useTagesfahrzeiten` in `src/features/today/fahrzeiten.ts`; Datenweg 3 in `docs/datenschutz/kartendienst.md`; Tests `src/features/today/fahrzeiten.test.ts` und „schickt nur Koordinaten und Profil" in `src/features/today/MyDayPage.test.tsx`.

**Änderungspfad.** Wieder nur auf Tipp: `FAHRZEITEN_BEIM_OEFFNEN` auf `false` — Wegbalken, Übergänge und „Anfahrt ≈ …" entfallen ohne weitere Änderung · Aufwand `klein`. Abruf auf Tipp mit Wegbalken: ein Knopf „Fahrzeiten zeigen", der den Abruf je Seitenbesuch freigibt · Aufwand `klein`.

### ANN-195 — Der Wegbalken rechnet in echten Minuten, die Rundung aus §8.1 bleibt beim Server

Praxisprozess · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Jannes (Sichtung der Übersicht nach dem UI-Redesign)

**Annahme.** Der Puffer im Wegbalken ist die Zeit zwischen zwei Terminen minus der geschätzten Fahrzeit, in Minuten und **ohne** Rundung auf das Praxisraster; die Stufen sind bis 0 rot, bis 3 dunkles Orange, unter 5 helleres Orange, ab 5 grün (Entscheidung Jannes im Handoff). Der Balken ist eine Auskunft für unterwegs und sperrt nichts. Die Angebotsregel aus §8.1 — frühester Beginn auf das Raster aufgerundet — gilt unverändert in `check_travel_buffers` und damit in Tour und Kalender (ANN-097).

**Begründung.** „Abfahrt spätestens 08:58" ist eine Frage an die Uhr, nicht an das Raster; gerundet stünde dort eine Zeit, die niemand so fährt. Der Preis: Dieselbe Lücke kann in der Tour „1 Min. zu knapp" heißen (gerundet) und in der Übersicht „2 min Puffer" (echt). Beides stimmt für seine Frage — Planung dort, Fahrt hier. Unsicher: ob Jannes eine Zahl für beides will.

**Anker.** `travelLevel` und `travelPlan` in `src/components/ui/travelPlan.ts`; Tests „Wegbalken (TravelBar)" in `src/components/ui/bausteine.test.tsx`.

**Änderungspfad.** Andere Schwellen: `travelLevel` · Aufwand `klein`. Gerundeter Puffer wie in der Tour: die Übersicht reicht ihre Paare an `check_travel_buffers` und gibt dem Balken das Ergebnis · Aufwand `mittel`.

**Abnahme (Jannes, 2026-10-02).** Bestätigt mit eindeutigen Grenzen: rot bei ≤ 0 Minuten, orange bei > 0 und < 5 Minuten (zwei Stufen), grün ab 5 Minuten; der Puffer steht als Zahl daneben. So ist es gebaut (`travelLevel` in `src/components/ui/travelPlan.ts`, „… min Puffer“).

### ANN-196 — Der Wegbalken beginnt am Ende des Termins davor und zählt danach herunter; der erste Weg beginnt jetzt

Praxisprozess · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Jannes (Sichtung der Übersicht nach dem UI-Redesign)

**Annahme.** Der große Wegbalken beginnt am geplanten Ende des Termins davor. Gibt es keinen — der erste Weg des Tages — oder ist dieses Ende schon vorbei, beginnt er **jetzt**: Der Puffer ist dann, was bis zum Beginn des nächsten Termins nach Abzug der Fahrzeit noch bleibt, und schrumpft mit der Uhr. Der erste Weg rechnet vom verorteten Standort der Praxis (wie die Tagesroute, ANN-096); ohne verorteten Standort gibt es für ihn keinen Balken.

**Begründung.** Der Handoff nennt für den ersten Weg eine „Startort-Zeit"; einen geplanten Aufbruch kennt die Anwendung aber nicht, und eine erfundene Uhrzeit rechnete einen Puffer vor, den es nicht gibt. „Jetzt" ist die einzige Zeit, die stimmt. Nach dem Ende des Termins davor gilt dasselbe: Wer um 10:40 noch beim Besuch von 09:30 ist, soll „Zu spät, Abfahrt sofort" lesen und nicht den geplanten Puffer. Ein persönlicher Startort (Wohnung) bleibt ausgeschlossen (§20, ANN-096). Unsicher: ob Jannes morgens lieber einen festen Aufbruch sähe, etwa den Arbeitszeitbeginn.

**Anker.** `naechsterWeg` in `src/features/today/tagesstart.ts`; Tests „Der naechste Weg" in `src/features/today/tagesstart.test.ts`.

**Änderungspfad.** Fester Aufbruch aus dem Arbeitszeitbeginn: `naechsterWeg` bekommt die Uhrzeit hereingereicht, die Übersicht liest den Wochenplan · Aufwand `mittel`. Immer der geplante Abstand: die Bedingung `jetzt <= …` in `naechsterWeg` entfernen · Aufwand `klein`.

**Abnahme (Jannes, 2026-10-02).** Bestätigt für die aktuelle Anfahrt in „Mein Tag“. Bei der Planung künftiger Tage geht der erste Weg nie von der aktuellen Uhrzeit aus; `naechsterWeg` läuft nur auf der Tagesseite für heute.

### ANN-197 — Das Stockwerk kommt vom Anfang des Zugangshinweises, bis es ein eigenes Feld gibt

Technik · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Jannes (Sichtung der Übersicht nach dem UI-Redesign); eigenes Feld als `IDEA-PRX-050`

**Annahme.** Die Stockwerk-Pille der Tageskarte zeigt die **erste Angabe** des Zugangshinweises, wenn sie die Form „[Zahl.] Ebene [Seite]" hat (etwa „2. OG links", „EG", „Hochparterre") und vor einem Komma, Semikolon, Gedankenstrich oder Zeilenumbruch steht. Der Rest steht als Zugangshinweis hinter dem Info-Knopf. Alles andere bleibt ganz im Zugangshinweis — lieber keine Pille als eine falsche. Gespeichert oder umgeschrieben wird nichts.

**Begründung.** Der Handoff verlangt die Pille und ausdrücklich keine Migration („zunächst aus dem Anfang des Zugangshinweises"). Eine enge Regel hält den Fehler klein: Ein nicht erkanntes Stockwerk steht weiter im Hinweis, einen Tipp entfernt; ein falsch erkanntes gibt es nur, wenn der Hinweis wirklich so anfängt. Unsicher: wie die Praxis Stockwerke tatsächlich schreibt — das zeigt die Sichtung.

**Anker.** `zugangMitStockwerk` in `src/features/today/stockwerk.ts`; Tests `src/features/today/stockwerk.test.ts`.

**Änderungspfad.** Eigenes Feld: Spalte `home_visit_floor` mit Migration und Schreibpfad (`IDEA-PRX-050`), die Karte liest sie direkt, `stockwerk.ts` entfällt · Aufwand `mittel`. Weitere Schreibweisen: die Wortlisten in `stockwerk.ts` · Aufwand `klein`. **Abnahme (Jannes, 2026-10-02):** bestätigt.

**Verweis.** Seit AKTE-008 (Jannes, 2026-10-03) ist das Stockwerk keine Pille mehr, sondern die erste Zeile „Etage“ im Info-Aufklapper der Tageskarte; die Regel zum Abtrennen gilt unverändert.

### ANN-198 — Der Hinweis auf die vorherige Absage bleibt am Hausbesuch als eine Zeile

Prozess · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Jannes (Sichtung UI-Redesign Schritt 10)

**Annahme.** Im Ablauf „Niemand öffnet?" bleibt unter „Tür geöffnet, aber keine Behandlung?" eine Zeile zum dritten Szenario: „Vorher abgesagt? Dann am Seitenende ‚Termin absagen'." Die Folge – Ausfallhonorar bei einem Eingang unter 24 Stunden – steht in der Absage-Rückfrage, nicht mehr hier.

**Begründung.** Der Design-Handoff vom 2026-10-01 streicht den Satz „Hat die Patient:in vorher abgesagt? …" (Abschnitt 1). ADR-018 Punkt 9.3 verlangt aber, dass die Oberfläche **durch alle drei** Hausbesuch-Szenarien führt; ein ADR geht der Design-Spezifikation vor (`PROJECT_PRINCIPLES.md` §21). Die kürzeste Form, die beides hält: der Fall wird genannt und der Weg gezeigt, die Regel steht dort, wo abgesagt wird.

**Anker.** `HomeVisitFlow` in `src/features/appointments/HomeVisitFlow.tsx`; Test `AppointmentDetailPage.test.tsx` („Vorher abgesagt?").

**Änderungspfad.** Ganz streichen, wenn Jannes entscheidet, dass die Absage-Rückfrage das Szenario allein erklärt (dann ADR-018 Punkt 9.3 so lesen oder ergänzen) · Aufwand `klein`. **Abnahme (Jannes, 2026-10-02):** bestätigt.

### ANN-199 — Der Haken und die kompakten Knöpfe bleiben bei 44 px

Oberfläche · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Jannes (Sichtung UI-Redesign Schritt 11)

**Annahme.** Der Design-Handoff vom 2026-10-01 (Zyklen 2–4) nennt Kompaktknöpfe und den kleinen Haken mit 40 px, Chips mit 36/32 px. Im Repo bleiben sie bei 44 px; nur der Haken als Hauptknopf einer Karte wird 48 px groß.

**Begründung.** Das Repo hält „Ziele ≥ 44" für Knöpfe ohne umgebende Polsterung ausdrücklich fest (Oberflächen-Checkliste Punkt 1, `buttonStile.ts`); der Handoff selbst nennt 44 als Regel und 40 nur als zulässige Ausnahme (Abschnitt 9). Am Telefon im Hausflur zählt das Tippziel mehr als 4 px Dichte. Die Lesart, die das Tippziel schützt, gilt.

**Anker.** `symbolknopfKlassen` und `kartenAktionKlassen` in `src/components/ui/buttonStile.ts`; Test `bausteine.test.tsx` („nie 40").

**Änderungspfad.** Eine Größe `dicht` (40 px) in `buttonStile.ts` ergänzen und nur am Rechner verwenden · Aufwand `klein`. **Abnahme (Jannes, 2026-10-02):** bestätigt.

### ANN-200 — Die bisherigen Einträge auf der Schreibseite öffnen nie von selbst

Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Prüfpaket · Wiedervorlage: Jannes (Sichtung UI-Redesign Schritt 12) · **LOG-EPIC-001:** geändert – das Öffnen des Blatts schreibt „Akte geöffnet“ einmal je Tag statt je Eintrag.

**Annahme.** Auf der Schreibseite stehen die bisherigen Einträge der Person hinter „Verlauf" in der Fußleiste: am Telefon als Blatt, ab 640 px als Spalte. Gelesen wird erst, wenn jemand das Blatt öffnet – über denselben Lesepfad wie der Behandlungsverlauf der Akte, der jeden gezeigten Eintrag als `treatment_note.viewed` protokolliert. Der Handoff lässt die Spalte am Rechner von selbst offen; hier bleibt sie zu, bis jemand sie öffnet. Gezeigt werden die Einträge der jüngsten 20 Termine ohne den gerade dokumentierten. Der Satz zur Folge des Festschreibens steht nicht mehr sichtbar über dem Knopf, sondern als Beschreibung des Knopfes für Vorlesesoftware.

**Begründung.** Wie beim Kurzblick (ANN-137) folgt ein protokolliertes Lesen klinischer Einträge einer Handlung, nicht dem Öffnen einer Seite; sonst stünde in jedem Protokoll ein Lesen, das niemand wollte, und am Rechner im Büro läse die Seite mit. ADR-016 Punkt 4 verlangt einen ausdrücklichen Schritt; der Knopf heißt nach dem, was er tut („Festschreiben"), und die Folge bleibt für Vorlesesoftware am Knopf (DOK-20).

**Anker.** `BisherigeEintraege` in `src/features/documentation/BisherigeEintraege.tsx`, eingehängt in `CompleteTreatmentPage.tsx`; Test `CompleteTreatmentPage.test.tsx` („liest die bisherigen Einträge erst, wenn jemand den Verlauf öffnet").

**Änderungspfad.** Ab 640 px offen beginnen: Anfangswert von `verlaufOffen` an die Breite binden · Aufwand `klein`. **Abnahme (Jannes, 2026-10-02):** bestätigt; gleiche Leserechte und gleiche Protokollierung für Büro und Behandelnde (BEF-095).

### ANN-201 — „Doku offen" ist eine Aufgabe für die, die dokumentieren

Prozess · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Jannes (Sichtung UI-Redesign Schritt 13)

**Annahme.** Abschließen und Dokumentieren sind getrennt (Design-Handoff 2026-10-01, Entscheidung Jannes): Der Haken schließt einen Termin ohne Eintrag ab, wie bisher erlaubt (ANN-005). Danach steht „Doku offen" (Übersicht) bzw. „Dokumentation fehlt" (Termin) als Warnung – aber nur für Rollen, die dokumentieren dürfen. Das Büro sieht am abgeschlossenen Termin ohne Eintrag nichts. Ein bestätigter Termin in der Zukunft hat keinen Doku-Abschnitt; der Weg dahin ist „Doku" in der Aktionsleiste.

**Begründung.** ANN-005 schloss eine Markierung als fehlend aus, damit der Abschluss keine Pflicht zur Dokumentation vortäuscht. Die ausdrückliche Entscheidung von Jannes vom 01.10. geht dieser Annahme vor; die Pflicht selbst bleibt unverändert – gesperrt wird weiterhin erst die Rechnung, nicht der Abschluss (ADR-018, Konsequenzen). Dieselbe Regel gilt schon für die Übersicht (`istOffen`): eine Aufgabe, die jemand nicht erledigen kann, wäre Rauschen.

**Anker.** Fassung 2: `app.can_read_treatment_note()` in `list_day_plan` und `list_appointments` (`supabase/migrations/20261002124000_abn_005_documentation_read_right.sql`), `canReadTreatmentNote` in `TreatmentNoteSection` (Bedingung `faellig`) und im Kalender (kein Ausblenden mehr in `CalendarPage.tsx`); `offenGrund` in `src/features/today/api.ts`.

**Änderungspfad.** Auch dem Büro zeigen: Bedingung `darfSchreiben` streichen · Aufwand `klein`. **Fassung 2 (ABN-005, 2026-10-02, Abnahme Jannes, BEF-095):** Stand, „Doku offen“ und Lese-Links folgen dem einen Leserecht für Dokumentation; die Aufgabe („Doku“ schreiben, `istOffen` für die Arbeitskarte) bleibt bei den Schreibenden. Wieder nur Schreibenden zeigen: die Bedingung `darfSchreiben` zurück in `TreatmentNoteSection` und das Ausblenden in `CalendarPage` · Aufwand `klein`.

**Abnahme (Jannes, 2026-10-02).** Anders entschieden als bisher: Das Büro liest alle Dokumentation einschließlich Verlauf (ADR-004 Fassung 2) und sieht „Doku offen“ bzw. „Dokumentation fehlt“ wie die Therapeut:innen; Sichtbarkeit hängt am Leserecht, nicht am Schreibrecht. Bearbeiten und Finalisieren bleiben bei den behandelnden Rollen — BEF-095. Bis zur Umsetzung gilt die bisherige Anzeige.

### ANN-202 — Der Kalender nach dem Handoff: Panel als Karte, Kopf bleibt schlank

Oberfläche · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Jannes (Sichtung UI-Redesign Schritt 15)

**Annahme.** Umgesetzt aus Abschnitt 7a: „Woche | Team“ (am Handy „Tag | Team“) als Umschalter im Kopf; die Woche zeigt Mo–Fr, Samstag und Sonntag nur mit Termin der gezeigten Person; die Kachel trägt Zeit, Name und eine Zeile „! Doku offen“, „✓ Dokumentiert“ oder „× Abgesagt“, die Linie links wird bei offener Doku zur Warnung; ein Tipp öffnet ein Terminpanel mit Haken, „Doku“, „Bisherige Doku →“ und „Termin →“ – am fremden Termin ohne Haken und Doku, dafür mit der behandelnden Person. Anders als im Handoff: Das Panel ist überall eine Karte (am Handy ein Blatt), nicht ab 1200 px eine feste Spalte; „Tag“ am Handy ist die eigene Spalte im Tagesraster, keine Zeilenliste mit Wegbalken; der Kopf bleibt ohne sichtbare Überschrift (BEF-039); „Heute“ springt weiter zur Linie der aktuellen Uhrzeit statt sich abzuschalten. Den Doku-Stand liefert `list_appointments` nur Rollen mit `can_read_treatment_evidence`, wie die Tagesliste.

**Begründung.** Die feste Spalte und die Zeilenliste hätten Raster, Zieh-Geste und Breitenrechnung umgebaut; die Karte bringt dieselben Handgriffe ohne diesen Umbau. Der schlanke Kopf ist eine Sichtungsentscheidung (BEF-039), die der Handoff nicht ausdrücklich aufhebt.

**Anker.** `TerminPanel` in `src/features/appointments/TerminPanel.tsx`, Umschalter und Wochenende in `CalendarPage.tsx`, Kachel in `CalendarGrid.tsx`; Migration `20261001200000_cal_doku_stand_im_kalender.sql`; Tests `CalendarPage.test.tsx`, `supabase/tests/list-appointments.test.ts`.

**Änderungspfad.** Panel ab 1200 px als Spalte: Rasterbreite in `CalendarPage` um 320 px kürzen · Aufwand `mittel`. Tagesliste am Handy mit Wegbalken: eigene Darstellung aus `list_day_plan` · Aufwand `mittel`.

**Abnahme (Jannes, 2026-10-02).** Gestaltung bestätigt. Ergänzt: Dokumentationsstatus und Links zum Lesen müssen auch für das Büro und an fremden Terminen da sein — BEF-095, mit einem zentralen Leserecht für Akte, Termin, Kalender und Übersicht (ADR-004). **Fassung 2 (Jannes, 2026-10-05):** Die Woche zeigt **Montag bis Sonntag durchgehend**, auch ohne Termin am Wochenende; der Filter `wochenTage` in `CalendarPage.tsx` nimmt alle sieben Tage. Test: „zeigt in der Wochenansicht Montag bis Sonntag durchgehend“ in `CalendarPage.test.tsx`.

### ANN-203 — Die vertretende Person bekommt keine Zeile in `persons`; ihr Name steht am Zugang als Nachweis

Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2, B5; ADR-023 Punkt 13 und Konsequenzen)

**Annahme.** Eine Vertretung (rechtliche Vertretung oder Begleitung) wird in der Praxis nicht als Person angelegt. Ihr Vor- und Nachname steht als Freitext am Zugang (`representative_name`) und gehört zum Nachweis. Er bleibt drei Jahre nach dem Ende des Zugangs stehen, auch wenn das Verhältnis der vertretenen Person vorher fällt. Der Name der vertretenen Person steht nie am Zugang.

**Begründung.** ADR-023 verlangt in den Konsequenzen (Fassung 2) ausdrücklich, dass der Nachweis bei einer Vertretung den Namen der vertretenden Person trägt, weil ihr Konto nach 30 Tagen fällt. Eine eigene `persons`-Zeile wäre ein zweites Datum mit eigener Frist und eigener Löschfrage, ohne Mehrwert: Die Praxis behandelt die vertretende Person nicht. Die Adresse der vertretenden Person liegt nur beim Anmeldedienst (ANN-191). Unsicher: ob die Prüfung den Namen nach dem Ende kürzer halten will als die Auditeinträge.

**Anker.** Spalte `representative_name` und Constraint `platform_accesses_kind_fields` in `supabase/migrations/20261002100000_por_005_representation.sql`; Test „beendet die Vertretung mit dem Verhaeltnis …" in `supabase/tests/platform-representation.test.ts`.

**Änderungspfad.** Kürzere Frist für den Namen: im Löschlauf `representative_name` nach dem Ende des Zugangs leeren und den Constraint für `revoked` lockern · Aufwand `mittel`.

### ANN-204 — Vertretungen werden in V1 nur vor Ort eingeladen

Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B5); Mailversand mit B13

**Annahme.** Eine Vertretung bekommt ihren Code nur auf dem Praxisgerät zum Scannen. Eine Einladung per Mail gibt es für Vertretungen nicht, und ihre Adresse wird in der Praxis nicht gespeichert. Einen neuen Code (neue Einladung oder neues Kennwort) gibt es ebenfalls nur vor Ort.

**Begründung.** ADR-023 Punkt 13 verlangt, dass die Praxis den Ausweis der vertretenden Person und bei rechtlicher Vertretung das Dokument der Vollmacht ansieht. Das geschieht ohnehin vor Ort, und dort ist die Übergabe des Codes zugleich die Identitätsprüfung (Punkt 11). Eine Mail ginge an eine Adresse, die die Praxis nicht geprüft hat und die sie sonst nicht braucht. Punkt 13 verlangt außerdem, dass die Begleitung „vor Ort in zwei Minuten" eingerichtet ist. Unsicher: ob Betreuer:innen, die selten in die Praxis kommen, einen Weg per Mail brauchen.

**Anker.** `public.invite_platform_representation` und `app.issue_platform_invitation` (Kanal `on_site`) in `supabase/migrations/20261002100000_por_005_representation.sql`.

**Änderungspfad.** Mail für Vertretungen: Adressfeld am Zugang, Bestätigungsvermerk wie ANN-188, Versand über den Zugangsdienst · Aufwand `mittel`.

### ANN-205 — Der Nachweisvermerk besteht aus Häkchen je Dokumentart; gespeichert wird kein Dokument

Recht · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung und rechtliche Klärung (B5; ADR-023 Punkt 13, Folgefrage Aufgabenkreis)

**Annahme.** Der Nachweis einer Vertretung hält fest, welche Art Dokument angesehen wurde, wer es angesehen hat und wann: immer den Ausweis der vertretenden Person, bei rechtlicher Vertretung zusätzlich den Sorgerechtsnachweis, den Betreuerausweis oder die Vollmacht. Bei einer Betreuung bestätigt die Praxis außerdem mit einem Häkchen, dass der Aufgabenkreis die Gesundheitssorge umfasst; ohne dieses Häkchen gibt es keine Betreuung als Vertretung. Weder ein Scan noch eine Ausweis- oder Aktennummer wird gespeichert. Art und Nachweis eines Zugangs ändern sich nie; ein anderer Umfang ist eine neue Einladung.

**Begründung.** ADR-023 Punkt 13 (Fassung 2): „Gespeichert wird davon nichts, weder Scan noch Ausweisnummer. Der Vermerk hält nur fest, was wer wann gesehen hat." Die Folgefrage zum Aufgabenkreis schlägt den Vermerk „Betreuerausweis gesehen, Aufgabenkreis …" vor. Ein Häkchen statt Freitext hält Gesundheitsangaben aus dem Vermerk heraus. Unsicher: ob der Aufgabenkreis „Gesundheitssorge" genügt oder ob „Vermögenssorge" für Rechnungen dazukommen muss (B5).

**Anker.** `app.assert_platform_representation` und Constraint `platform_accesses_kind_fields` in `supabase/migrations/20261002100000_por_005_representation.sql`; `NACHWEISDOKUMENT` in `src/lib/vertretung.ts`; Formular `VertretungEinrichten` in `src/features/platform-access/Vertretungen.tsx`.

**Änderungspfad.** Weitere Dokumentarten oder ein zweiter Aufgabenkreis: Werteliste und Prüfung in `app.assert_platform_representation`, Constraint nachziehen · Aufwand `klein`. **Abnahme (Jannes, 2026-10-02):** Anders entschieden als bisher: zweites Häkchen „Aufgabenkreis umfasst Vermögenssorge“. Rechnungen und Zahlungen sieht eine Vertretung nur, wenn der geprüfte Bereich sie umfasst; Gesundheitssorge allein gibt keinen Abrechnungszugriff. Freigegeben werden nur nachgewiesene Bereiche, nie pauschal alles (BEF-119).

**Umgesetzt (ABN-010, 2026-10-02).** Gesundheitssorge vermerkt die Praxis jetzt bei Betreuung **und** Vorsorgevollmacht (`health_scope`, bis dahin `guardianship_health_scope`); das Sorgerecht umfasst sie. Rechnungen und Zahlungen nur mit dem zweiten Häkchen „umfasst die Vermögenssorge“ (`finance_scope`, BEF-119). Die Bereiche regelt ANN-216.

### ANN-206 — Wortlaut der Einwilligung zur Begleitung, versioniert und auf dem Praxisgerät bestätigt

Recht · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2; ADR-023 Punkt 13 „Den Wortlaut legt POR-EPIC-001b fest, geprüft wird er in B2")

**Annahme.** Die Einwilligung zur Begleitung hat den Wortlaut aus `einwilligungBegleitung` in der Fassung `begleitung-2026-10-02`. Er nennt die begleitende Person und die Praxis, was die Begleitung sieht und schreiben darf, ob frühere Nachrichten sichtbar sind, was sie nicht darf (Einwilligung, Widerruf, Datenexport, Befund, Dokumentation), die Entbindung von der Schweigepflicht, die Freiwilligkeit ohne Nachteil und den jederzeitigen Widerruf. Die Person liest ihn auf dem Praxisgerät, und die Praxis bestätigt per Häkchen, dass sie selbst eingewilligt hat. Gespeichert werden die Fassung, wer dabei war und wann. Ändert sich die Sichtbarkeit früherer Nachrichten, muss erneut eingewilligt werden. Die Einwilligung im eigenen Konto unter „Ich" kommt mit POR-EPIC-003. Widerrufen kann die Person unter „Ich“ (POR-007) oder in der Praxis; dort vermerkt die Praxis den Widerruf eigens (`record_companion_consent_withdrawn`), damit er im Nachweis als Widerruf steht und nicht als Entziehen.

**Begründung.** ADR-023 Punkt 13 verlangt eine ausdrückliche Einwilligung nach Art. 9 Abs. 2 lit. a DSGVO, konkret, informiert, freiwillig, widerruflich und nachweisbar nach Art. 7 Abs. 1. Ohne eigenes Konto bestätigt die Person sie auf dem Praxisgerät, und der Vermerk nennt, wer dabei war. Die Fassung als Kennung macht nachweisbar, welchem Text zugestimmt wurde, ohne den Text je Zugang zu speichern. Unsicher: ob die Prüfung eine Unterschrift oder Textform statt des Häkchens der Praxis verlangt.

**Anker.** `EINWILLIGUNG_BEGLEITUNG_FASSUNG` und `einwilligungBegleitung` in `src/lib/vertretung.ts`; `app.platform_companion_consent_version` in `supabase/migrations/20261002100000_por_005_representation.sql`; Gleichlauf im Test „Fassung der Einwilligung" in `supabase/tests/platform-representation.test.ts`.

**Änderungspfad.** Neuer Wortlaut: neue Kennung an beiden Stellen; bestehende Begleitungen behalten ihre Fassung · Aufwand `klein`. Unterschrift statt Häkchen: Unterschriftsfeld und Ablage als Dokument (ADR-017) · Aufwand `mittel`. **Abnahme (Jannes, 2026-10-02):** Präzisiert: Die Person stimmt ausdrücklich zu. Festgehalten werden Fassung des Wortlauts, benannte Begleitperson, freigegebener Umfang, Zeitpunkt und bestätigende Praxiskraft. Ob Häkchen der Praxis und Fassung als Nachweis genügen, ist nicht entschieden, sondern wird in B2 geprüft (BEF-116).

**Umgesetzt (ABN-010, 2026-10-02).** Neue Fassung `begleitung-2026-10-02b`: Der Wortlaut nennt den Umfang je Bereich, Termine und Unterlagen immer, frühere Nachrichten und Rechnungen je mit Ja oder Nein (BEF-116). Der Nachweis hält Fassung, benannte Begleitperson, Bereiche (`consent_earlier_messages`, `finance_scope`), Zeitpunkt und bestätigende Praxiskraft fest. Das Nachweisverfahren bleibt an einer Stelle, `app.assert_platform_representation`. Ob das Häkchen genügt, entscheidet B2.

### ANN-207 — Ein Zweifel an der Einwilligungsfähigkeit wird nur als Vorgang vermerkt, ohne Grund

Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2; ADR-023 Punkt 13) · **Fassung 2 (2026-10-03, LOG-EPIC-001):** Der Zweifel wird nicht mehr als Auditeintrag vermerkt, sondern als Feld am Zugang der rechtlichen Vertretung (`companion_declined_at/by/reason`, fester Grund `capacity_doubt`), aufbewahrt wie die Akte; folgt keine rechtliche Vertretung, bleibt er ungespeichert. Anker: `invite_platform_representation` in `supabase/migrations/20261006110100_log_001b_schreibpfade.sql`.

**Annahme.** Zweifelt die Praxis daran, dass die Person einwilligen kann, tippt sie im Formular „Zweifel an der Einwilligungsfähigkeit". Dann gibt es keine Begleitung, nur eine rechtliche Vertretung. Vermerkt wird ein Auditeintrag `platform_access.companion_declined` mit der Akte bzw. dem Trainingsverhältnis als Gegenstand und dem Kontext `reason: capacity_doubt`, ohne Freitext und ohne Diagnose. Am Verhältnis selbst wird nichts gespeichert. Der Vermerk sperrt keine spätere Begleitung; er dokumentiert die Entscheidung im Moment.

**Begründung.** ADR-023 Punkt 13: „Der Zweifel wird vermerkt, eine Diagnose nicht." Ein Merkmal an der Akte („nicht einwilligungsfähig") wäre eine Gesundheitsangabe mit eigener Wirkung und würde die Person auf Dauer festlegen. Ein Auditeintrag weist nach, dass und warum keine Begleitung eingerichtet wurde, und fällt nach drei Jahren (ANN-029). Unsicher: ob die Prüfung eine Sperre am Verhältnis erwartet.

**Anker.** `public.note_companion_capacity_doubt` in `supabase/migrations/20261002100000_por_005_representation.sql`; Knopf im Formular `VertretungEinrichten` in `src/features/platform-access/Vertretungen.tsx`.

**Änderungspfad.** Sperre am Verhältnis: Spalte mit Datum und Rücknahme, Prüfung in `app.assert_platform_representation` · Aufwand `mittel`.

### ANN-208 — Ohne Geburtsdatum keine Vertretung; das Sorgerecht endet am 18. Geburtstag in der Zeitzone der Praxis

Recht · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B5; ADR-023 Punkt 15, W4)

**Annahme.** Eine Vertretung setzt ein Geburtsdatum im Verhältnis voraus, wie der eigene Zugang (ANN-190). Unter 18 Jahren gibt es nur die rechtliche Vertretung durch Sorgeberechtigte, ab 18 kein Sorgerecht und erst dann Betreuung, Vorsorgevollmacht oder Begleitung. Ein Zugang aus dem Sorgerecht endet um 0 Uhr am 18. Geburtstag in der Zeitzone der Praxis, ohne Zutun der Praxis. Damit enden auch Lesefrist und Kontofrist (30 Tage danach). Eine Sorgeberechtigte bekommt danach keinen neuen Code, auch nicht für eine noch offene Einladung. Umgekehrt endet jede andere Vertretung, sobald das Geburtsdatum die Person minderjährig macht oder fehlt, auch nach einer nachträglichen Korrektur; als Ende gilt dann der Tag der Einladung. Alle Stellen rechnen den Tag in der Zeitzone der Praxis (`app.platform_is_minor`). Ein 29. Februar wird zum 28. Februar volljährig, einen Tag früher, also auf der restriktiven Seite.

**Begründung.** ADR-023 Punkt 15: „Mit dem 18. Geburtstag endet deren Wirkung aus dem Sorgerecht. Das prüft der Server am Geburtsdatum der Person." § 1626 BGB endet mit der Volljährigkeit (§ 2 BGB). Ohne Geburtsdatum ist die Grenze nicht prüfbar, und die restriktive Seite gilt (§16). Das Ende rechnet `app.platform_access_ended_at`, die eine Stelle für Ende, Lesefrist und Löschlauf. Unsicher: ob eine volljährig gewordene Person übergangsweise sehen soll, wer bisher Zugang hatte. Das kommt mit ihrem eigenen Zugang unter „Ich" (POR-007).

**Anker.** `app.platform_is_minor`, `app.assert_platform_representation`, `app.platform_access_ended_at` und `public.renew_platform_representation_code` in `supabase/migrations/20261002100000_por_005_representation.sql` (Grenze `app.platform_min_age_years`); Tests „Sorgerecht endet am 18. Geburtstag" in `supabase/tests/platform-representation.test.ts`.

**Änderungspfad.** Andere Altersgrenze: `app.platform_min_age_years` · Aufwand `klein`. Vertretung ohne Geburtsdatum für Erwachsene zulassen: Prüfung in `app.assert_platform_representation` lockern · Aufwand `klein`. **Abnahme (Jannes, 2026-10-02):** Korrektur bestätigt: Bei Geburt am 29. Februar tritt die Volljährigkeit im Nichtschaltjahr am 1. März um 0 Uhr ein (§§ 187 Abs. 2, 188 Abs. 2 BGB). Eigener Zugang und Ende des Sorgerechts rechnen mit derselben Funktion; heute rechnet das Ende des Sorgerechts einen Tag zu früh (BEF-117).

**Umgesetzt (ABN-009, 2026-10-02).** `app.majority_date` liefert den Tag der Volljährigkeit (Geburtstag minus ein Tag plus 18 Jahre plus ein Tag; am 29. Februar im Nichtschaltjahr der 1. März), 0 Uhr in der Zeitzone der Praxis. `app.platform_is_minor`, das Ende des Sorgerechts in `app.platform_access_ended_at` und die Einladung zum eigenen Zugang (bisher in UTC) rufen sie auf. Tests mit 29. Februar, 28. Februar und 1. März in `supabase/tests/platform-representation.test.ts`.

### ANN-209 — Jeder Aufruf über eine Vertretung wird protokolliert, auch das Gerüst der Plattform

Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2; ADR-023 Punkt 24, W5) · **LOG-EPIC-001:** geändert – Zugriffe über eine Vertretung einmal je Tag und Akte (ANN-230).

**Annahme.** Jeder Aufruf einer Plattformprojektion über einen lesbaren Vertretungszugang schreibt einen Auditeintrag `platform_representation.read`, auch der Aufruf des Gerüsts, der nur den Namen der vertretenen Person liefert. Akteurstyp ist `representative`, Akteur das Konto der vertretenden Person. Gegenstand ist die Akte bzw. das Trainingsverhältnis, im Kontext stehen der Zugang, die Art und die Ansicht. Ein gesperrter oder abgelaufener Zugang liest nichts und schreibt nichts. Das eigene Lesen der Person bleibt unprotokolliert.

**Begründung.** ADR-023 Punkt 24 (W5): „jeder Zugriff über eine Vertretung, auch lesend". Schon das Gerüst zeigt den Namen der vertretenen Person und ist damit ein Zugriff auf ihre Daten. Der Gegenstand `patient` sorgt dafür, dass ein Legal Hold auch diese Einträge hält und die Praxis im Protokoll nach der Akte filtern kann. Die Menge ist überschaubar: ein Eintrag je Seitenaufruf. Unsicher: ob die Prüfung eine Bündelung je Sitzung vorzieht.

**Anker.** `app.log_platform_representation` und `public.platform_context` in `supabase/migrations/20261002101000_por_006_acting_for.sql`; Tests in `supabase/tests/platform-acting-for.test.ts`.

**Änderungspfad.** Bündeln je Tag und Zugang: in `app.log_platform_representation` vor dem Einfügen nach einem Eintrag desselben Tages fragen · Aufwand `klein`.

### ANN-210 — Genutzt ist ein durchgeführter Behandlungstermin, auch ohne finalisierte Dokumentation

Praxisprozess · entschieden (Jannes) · 2026-10-02 · Jannes · erledigt · Wiedervorlage: Jannes nach den ersten Praxiswochen, zusammen mit ANN-042

**Annahme.** Das Kontingent einer Behandlungsgrundlage zählt als **genutzt** die Termine im Zustand `completed`, `documented` oder `invoiced`; mehrere Heilmittel oder eine Doppelbehandlung im selben Termin zählen einmal. Als **verplant** zählt jeder Termin außer `cancelled` und `no_show`; Absage und Nichtantreffen belegen, verbrauchen und decken nichts. Die Leistungsmenge je Position (`used_quantity`) bleibt eine getrennte Größe der Abrechnung (ANN-073).

**Begründung.** Abnahme der Annahmen (Jannes, 2026-10-02, BEF-096): Terminzahl und Leistungsmenge sind getrennte Größen (ANN-064), genutzt sind durchgeführte Termine, Nichtantreffen belegt kein Kontingent, das Ausfallhonorar bleibt davon getrennt (ADR-018 Punkt 9). Unsicher und hier als Annahme festgehalten: ob ein Termin, der abgehakt, aber noch nicht dokumentiert ist (`completed`), schon als genutzt zählt — ja, weil die Behandlung stattgefunden hat und ADR-018 Punkt 7 den Zustand nicht von selbst zurücknimmt; die Dokumentation ändert die Zahl nicht mehr.

**Anker.** `app.treatment_basis_slot_counts` und `app.appointment_basis_position` in `supabase/migrations/20261002120000_abn_001_slot_counts.sql`; Tests in `supabase/tests/appointment-coverage.test.ts` („Genutzt zaehlt Termine").

**Änderungspfad.** Genutzt erst ab `documented`: die Statusliste in `app.treatment_basis_slot_counts` kürzen · Aufwand `klein`. Nichtantreffen wieder mitzählen: `no_show` aus beiden `not in`-Listen streichen · Aufwand `klein`, widerspricht aber der Abnahme.

### ANN-211 — Durchgeführte Termine lassen sich übertragen, stehen aber zugeklappt und nicht vorgewählt

Praxisprozess · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · erledigt · Wiedervorlage: Jannes in der Sichtung der Grundlagen (ABN-EPIC-001)

**Annahme.** Die Seite „Termine übertragen“ bietet neben den ungedeckten künftigen Terminen auch die **durchgeführten** Termine der Patient:in an (`completed`, `documented`, nicht am Ziel), als eigenen, zugeklappten Abschnitt „Vergangene Termine“ ohne Vorauswahl, mit dem Hinweis, dass erfasste Leistungen mitziehen. Abgesagte, nicht angetroffene und abgerechnete Termine werden nicht angeboten.

**Begründung.** Die Abnahme (BEF-097) verlangt, dass auch durchgeführte Termine als Zuordnungskorrektur übertragen werden können; der Server erlaubt es seit CAL-022 (ANN-068). Ohne einen Weg in der Oberfläche bliebe die Korrektur unerreichbar. Zugeklappt und ohne Vorauswahl, weil der Regelfall die ungedeckten künftigen Termine sind und eine Korrektur der Vergangenheit eine bewusste Handlung bleiben soll (§13: nichts wandert unbemerkt). Unsicher: ob die Praxis die Korrektur häufiger braucht und der Abschnitt offen stehen sollte.

**Anker.** `vergangenesAngebot` und der Aufklapper „Vergangene Termine“ in `src/features/treatment-bases/TermineUebertragenPage.tsx`; Test in `TermineUebertragenPage.test.tsx`.

**Änderungspfad.** Abschnitt offen zeigen oder vorwählen: `Disclosure offen` beziehungsweise Startwert der Auswahl ändern · Aufwand `klein`. Vergangene gar nicht anbieten: den Abschnitt entfernen, der Server bleibt unverändert · Aufwand `klein`.

### ANN-212 — Eine Verlegung mit Gebühr ist eine Absage „Patient:in hat verlegt“; das Verschieben eines Termins bleibt gebührenfrei

Praxisprozess · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · erledigt · Wiedervorlage: Jannes in der Sichtung der Praxisverwaltung (ABN-EPIC-001)

**Annahme.** Die 24-Stunden-Regel einer Verlegung durch die Patient:in (BEF-094) greift am Weg **Absagen → „Patient:in hat verlegt“**: Der vereinbarte Termin wird abgesagt, der Server merkt bei weniger als 24 Stunden die Gebühr vor, der neue Termin wird wie jeder Folgetermin angelegt. Ändert das Büro dagegen nur Datum oder Uhrzeit eines bestätigten Termins (`update_appointment`, Auditereignis `appointment.rescheduled`), entsteht **keine** Gebühr — der Termin besteht weiter, es gibt keinen ausgefallenen Termin, an dem ein Gebührenanlass hängen könnte (ADR-018 Punkt 4: Anlass nur an `cancelled` und `no_show`).

**Begründung.** Ein Gebührenanlass ist an einen ausgefallenen Termin gebunden; ein verschobener Termin ist kein ausgefallener. Den Anlass an eine Zeitänderung zu hängen, hieße entweder einen dritten Anlass an einem bestätigten Termin einzuführen oder den Termin bei der Zeitänderung still in Absage und Neuanlage zu zerlegen — beides größer als die Abnahme verlangt. Unsicher: Wer im Alltag den Termin nur verschiebt, verschenkt die Gebühr, ohne es zu merken.

**Anker.** `app.is_late_cancellation` und die Gründeliste in `public.cancel_appointment` (`supabase/migrations/20261002130000_abn_006_patient_moved_and_fee_waiver.sql`); `selectableCancellationReasons` in `src/features/appointments/api.ts`; Tests in `supabase/tests/cancellation-notice.test.ts` („Verlegung: wer sie veranlasst hat“).

**Änderungspfad.** Am Terminformular bei einer Zeitänderung unter 24 Stunden fragen „Hat die Patient:in verlegt?“ und dann den Weg über Absage und Neuanlage gehen · Aufwand `mittel`.

### ANN-213 — Auf eine Gebühr verzichten owner und office, endgültig und nur vor der Erfassung

Praxisprozess · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · erledigt · Wiedervorlage: Jannes in der Sichtung der Praxisverwaltung (ABN-EPIC-001)

**Annahme.** Den Verzicht auf eine Gebühr (BEF-094) vermerken **owner und office** — dieselben Rollen, die ein Ausfallhonorar als Leistung erfassen (ANN-140). Er ist möglich, solange aus dem Anlass weder eine Leistung erfasst noch eine Rechnung ausgestellt ist; danach führt der Weg über das Entfernen der Leistung beziehungsweise das Storno. Er ist **endgültig**: Es gibt keinen Rückweg „Verzicht zurücknehmen“. Der Anlass (`fee_basis`) bleibt stehen, daneben `fee_waived_at` und `fee_waived_by`; die Terminsicht zeigt nur den Zeitpunkt, die Person steht im Auditlog (`appointment.fee_waived`). Kein Freitext zum Grund. Fällt der Anlass weg (Wiederöffnen eines Nichtantreffens), fällt der Verzicht mit. Ein Termin mit Verzicht bleibt unter dem Löschschutz der Termine mit Gebührenanlass (ANN-035): Der Vermerk ist der Nachweis, warum keine Forderung entstand.

**Begründung.** Ein Verzicht ist eine Entscheidung über eine Forderung und gehört zu den Rollen, die Forderungen erfassen; die Behandelnden erfassen am eigenen Termin die Heilmittel, nicht das Ausfallhonorar (ANN-140). Endgültig, weil der Verzicht in der Regel der Patient:in mitgeteilt wird — wie die Absage selbst (ADR-018 Punkt 2). Kein Freitextgrund, weil ein freies Feld am Termin die wahrscheinlichste Stelle für eine Gesundheitsangabe ist (ANN-034).

**Anker.** `public.waive_appointment_fee` und `app.billable_fee_basis` in `supabase/migrations/20261002130000_abn_006_patient_moved_and_fee_waiver.sql`; `GebuehrVerzicht` in `src/features/appointments/AppointmentDetailPage.tsx`; Tests in `supabase/tests/cancellation-notice.test.ts` („Verzicht auf die Gebühr“) und `AppointmentDetailPage.test.tsx`.

**Änderungspfad.** Rücknahme erlauben: eine zweite Funktion, die beide Spalten leert und protokolliert · Aufwand `klein`. Codierter Grund: eine Spalte mit Werteliste · Aufwand `klein`. Weitere Rollen: die Rollenprüfung in `waive_appointment_fee` · Aufwand `klein`.

### ANN-214 — Den behandlungsrelevanten Hinweis pflegen die behandelnden Rollen in der Akte, nicht im Formular der Grundlage

Datenschutz · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · Änderung BEF-134 · Wiedervorlage: Jannes in der Sichtung der Grundlagen (ABN-EPIC-001); Datenschutzprüfung mit ANN-065

**Annahme.** Der klinische Hinweis aus einer Verordnung (`treatment_bases.prescriber_note`, BEF-098) wird **an der Verordnung in der Akte** erfasst und geändert, mit einem eigenen Knopf „Behandlungsrelevanten Hinweis erfassen“ — nicht im Formular der Grundlage, das auch das Büro ausfüllt. Schreiben dürfen **therapist und team_lead** (`app.can_write_treatment_note`, wie die Dokumentation); ein reiner owner-Zugang und das Büro lesen ihn nur. Lesen dürfen alle mit dem Leserecht der Dokumentation (`app.can_read_treatment_note`); `app.can_read_treatment_basis_clinical` ruft es seitdem auf, statt die Rollen ein zweites Mal zu führen. Nur an einer Verordnung, nie am Selbstzahler (ADR-020 Punkt 4). Das Auditlog hält fest, dass das Feld geändert oder geleert wurde, nie den Text.

**Begründung.** Die Abnahme verlangt den Hinweis „getrennt von den organisatorischen Anmerkungen“ und lässt die behandelnden Rollen schreiben. Im gemeinsamen Formular wäre das Feld für das Büro sichtbar, aber gesperrt, und ein Formular, das die Rolle anders behandelt, ist die Stelle, an der so etwas verrutscht. Eine eigene Funktion hält die Rechte an einer Stelle und lässt `create_treatment_basis` und `update_treatment_basis` unverändert (ANN-065). Unsicher: Das Büro tippt die Verordnung ab und sieht den Hinweis auf dem Rezept zuerst; nach dieser Annahme muss es ihn der Therapeut:in weitergeben.

**Anker.** `public.set_treatment_basis_clinical_note` in `supabase/migrations/20261002131000_abn_007_clinical_prescription_note.sql`; `KlinischerHinweis` in `src/features/treatment-bases/KlinischerHinweis.tsx`; Tests in `supabase/tests/treatment-basis-clinical-note.test.ts` und `PatientTreatmentBasesPage.test.tsx`.

**Änderungspfad.** Das Büro schreiben lassen: die Rollenprüfung auf `app.can_write_treatment_bases()` umstellen und `canWriteTreatmentBases` im Client · Aufwand `klein`. Ins Formular legen: das Feld im Formular wieder aufnehmen und den Parameter an beide Schreibpfade geben · Aufwand `mittel`.

**Abnahme (Jannes, 2026-10-09).** geändert: Den behandlungsrelevanten Hinweis aus der Verordnung erfassen alle Praxisrollen außer einer reinen Trainingsbetreuung, also auch das Büro. Umsetzung: BEF-134. **Umgesetzt (ABN-031, 2026-10-09):** `set_treatment_basis_clinical_note` prüft `app.can_write_treatment_bases()` (owner, Therapeut:innen, Teamleitung, Büro) in `supabase/migrations/20261021110000_abn_031_prescriber_note_all_roles.sql`, der Knopf an der Verordnung `canWriteTreatmentBases`; Lesen unverändert.

### ANN-215 — Ein Betrag an einer stornierten Rechnung wird nur mit ihrer ausgestellten Ersatzrechnung verrechnet, als verbundenes Paar

Praxisprozess · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · erledigt · Wiedervorlage: Jannes in der Sichtung der Abrechnung (ABN-EPIC-001); Steuerberatung mit B9

**Annahme.** „Mit der Ersatzrechnung verrechnen“ (BEF-100) heißt: Der Betrag geht von der stornierten Rechnung auf **die** Rechnung über, die sie ersetzt (`replaces_invoice_id`), sobald diese **ausgestellt** ist — nicht auf eine beliebige offene Rechnung derselben Person und nicht auf einen Entwurf. Gebucht wird ein **Paar**: an der stornierten Rechnung eine Rückzahlung, an der Ersatzrechnung ein Eingang, beide mit dem Weg „Verrechnung“ (`method = 'offset'`), verbunden über `offset_group`, datiert auf den Tag der Verrechnung. Höchstens der eingegangene Betrag; ein Teilbetrag ist möglich. Storniert wird eine Verrechnung nur als Paar. In der Auswertung nach Zufluss heben sich die beiden Hälften in der Summe auf; verteilt wird jede nach den Steuergruppen ihrer Rechnung. Rechte wie beim Buchen einer Zahlung (owner, office). Ein Überschuss der Zahlung über die Ersatzrechnung bleibt dort als Überzahlung stehen und wird von dort zurückgezahlt.

**Begründung.** Die Ersatzrechnung ist der nachvollziehbare Ort: Dieselbe Forderung, korrigiert. Ein Paar statt einer Umhängung der vorhandenen Zahlung, weil eine gebuchte Zahlung nie geändert wird (ANN-078) und jede Rechnung ihre eigene Zahlungsgeschichte behalten muss. Der Tag der Verrechnung statt des ursprünglichen Zahlungstags, weil an diesem Tag gebucht wird; im Zufluss heben sich beide Hälften auf. Unsicher: ob die Steuerberatung für die Zuflussrechnung den ursprünglichen Zahlungstag an der Ersatzrechnung verlangt (B9).

**Anker.** `public.offset_payment`, `public.void_offset_payments` und `payments.offset_group` in `supabase/migrations/20261002132000_abn_008_billing_from_acceptance.sql`; `Guthaben` in `src/features/billing/InvoiceDetailPage.tsx`; Tests in `supabase/tests/invoice-cancellations.test.ts` („Storno trotz Zahlung“).

**Änderungspfad.** Verrechnung mit einer anderen offenen Rechnung derselben Person: die Prüfung auf `replaces_invoice_id` in `offset_payment` lockern · Aufwand `klein`. Ursprünglicher Zahlungstag an der Ersatzrechnung: `paid_on` aus der Quelle übernehmen · Aufwand `klein`.

### ANN-216 — Eine Vertretung trägt zwei Bereiche: Gesundheit immer, Rechnungen nur nachgewiesen

Datenschutz · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · Prüfpaket · Wiedervorlage: B2 und B5 mit ANN-205 und ANN-206; Jannes in der Sichtung der Plattform (ABN-EPIC-001)

**Annahme.** Freigegeben werden nur nachgewiesene bzw. eingewilligte Bereiche (BEF-119). Die Plattform kennt dafür zwei: **Gesundheit** (Termine, Wünsche, Nachrichten, Befundbogen, freigegebene Unterlagen) und **Rechnungen** (Rechnungen und Zahlungen). Gesundheit ist Voraussetzung jeder Vertretung — die Plattform zeigt Gesundheitsdaten, eine Vollmacht nur für Finanzen begründet hier keinen Zugang. Rechnungen sind immer eine ausdrückliche Ja/Nein-Angabe (`finance_scope`): bei der rechtlichen Vertretung das Häkchen „umfasst die Vermögenssorge“ für Sorgerecht, Betreuung und Vollmacht gleichermaßen, bei der Begleitung ein Satz der Einwilligung. `app.platform_access_allows` ist die eine Stelle: `billing` für den eigenen Zugang und nur mit `finance_scope`; `consent`, `export` und `manage_companions` weiter nur eigener Zugang und rechtliche Vertretung. Bestehende Vertretungen: rechtliche ohne Rechnungen, Begleitungen der alten Fassung mit (ihr Wortlaut nannte sie); eine Vollmacht ohne Vermerk der Gesundheitssorge wird entzogen (`scope_unproven`) und neu eingerichtet, statt den Nachweis zu unterstellen.

**Begründung.** Die Abnahme verlangt die Freigabe je nachgewiesenem Bereich und nennt die Vermögenssorge für Rechnungen ausdrücklich. Zwei Bereiche decken, was POR-EPIC-002 und -003 zeigen; feiner (etwa Termine getrennt von Unterlagen) wäre eine Unterscheidung, die die Praxis vor Ort nicht prüfen kann. Unsicher: ob B5 auch beim Sorgerecht einen ausdrücklichen Vermerk der Gesundheitssorge verlangt (heute: das Sorgerecht umfasst sie).

**Anker.** `platform_accesses.health_scope`, `.finance_scope`, `app.platform_access_allows` und `app.assert_platform_representation` in `supabase/migrations/20261002134000_abn_010_representation_scopes.sql`; Formular in `src/features/platform-access/Vertretungen.tsx`; Wortlaut in `src/lib/vertretung.ts`; Tests in `supabase/tests/platform-acting-for.test.ts` („Rechte je Art“) und `platform-representation.test.ts`.

**Änderungspfad.** Ein weiterer Bereich: eine Spalte, ein Satz im Wortlaut, ein Fall in `platform_access_allows` · Aufwand `klein`. Vertretung nur für Rechnungen: die Pflicht zur Gesundheitssorge in `assert_platform_representation` und der Constraint lockern, die Gesundheitsfähigkeiten an `health_scope` binden · Aufwand `mittel`.

### ANN-217 — Den Zugangsdienst ruft nach dem Löschlauf der Zeitplan des Betriebs; bis OPS-001 bleiben fällige Konten gesperrt stehen

Technik · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · erledigt · Wiedervorlage: OPS-001 (Edge Runtime am Testprojekt prüfen)

**Annahme.** Die Aufgabe `konten_loeschen` des Zugangsdienstes ruft der Zeitplan des Betriebs nach jedem Löschlauf auf, mit dem Admin-Schlüssel als Bearer; ein anderer Aufruf wird abgewiesen. Ein abgeholter Auftrag ist 15 Minuten vergeben; was scheitert, kommt beim nächsten Aufruf wieder. Ein Konto, das beim Anmeldedienst schon fehlt (404), gilt als entfernt. Ein Konto, das seit dem Auftrag wieder einen laufenden Zugang hat, wird nicht gelöscht, der Auftrag fällt — außer nach einem Restore: Dann verliert das Konto seine Zugänge, und der Auftrag bleibt. Restrisiko: Bindet jemand das Konto genau zwischen Abholen und Löschen neu, zeigt der neue Zugang auf ein gelöschtes Konto; er ist dann wie jeder ohne Konto neu einzuladen. Solange die Edge Runtime nicht freigegeben ist (OPS-001), läuft der Aufruf nicht: Fällige Konten stehen dann ohne jeden Zugang beim Anmeldedienst, bis der Dienst scharf ist.

**Begründung.** BEF-115 verlangt die unterstützte Admin-API statt SQL auf `auth.users`. Die Admin-API braucht den `service_role`-Schlüssel und damit eine serverseitige Funktion; die einzige, die ihn hält, ist der Zugangsdienst (ADR-023 Punkt 9). Ein Konto ohne Zugang kann nichts sehen (ADR-023 Punkt 18); das Warten bis OPS-001 ist deshalb ein Fristverzug, kein Zugriffsrisiko. Unsicher: welcher Zeitplan das sein wird (pg_cron, GitHub Actions oder der Anbieter) — das entscheidet OPS-001.

**Anker.** `kontenLoeschen` in `supabase/functions/platform-access/handler.ts`, `istDienstaufruf` und `loeschauftraege` in `anmeldedienst.ts`; `public.claim_platform_account_deletions` in `supabase/migrations/20261002135000_abn_011_platform_account_deletion_queue.sql`; Tests in `supabase/functions/platform-access/handler.test.ts` („konten_loeschen“).

**Änderungspfad.** Anderer Auslöser: nur der Aufruf von außen ändert sich, der Dienst bleibt · Aufwand `klein`. Längere Vergabe eines Auftrags: die 15 Minuten in `claim_platform_account_deletions` · Aufwand `klein`.

### ANN-218 — Die Sperre der Wiederherstellung wirkt im Anmeldedienst über einen Mail-Hook; bis B13 bestätigt kein Plattformkonto sein Postfach

Datenschutz · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · erledigt · Wiedervorlage: B13 und OPS-001 (Hook einschalten); Jannes in der Sichtung der Plattform

**Annahme.** Ein Plattformkonto bekommt einen Wiederherstellungslink per Mail nur mit einem per Link bestätigten Postfach für seine heutige Adresse (BEF-118). Die eine Regel ist `public.auth_email_allowed`: Praxiskonten unverändert; Plattformkonten nur `recovery` und nur mit Merkmal, nie einen Anmeldelink. Im Anmeldedienst wirkt sie über dessen **Mail-Hook**: Eingeschaltet verschickt der Anmeldedienst keine Mail mehr selbst, sondern ruft den Zugangsdienst (signiert nach „Standard Webhooks“). Der fragt die Regel und verschickt über den Versandweg oder verwirft **stumm** mit Erfolg, damit die Antwort nicht verrät, ob es ein Plattformkonto ist. Eine wiederholte Nachricht (dieselbe `webhook-id`) geht nicht ein zweites Mal hinaus; das Merkmal fällt mit jeder Adressänderung, auch bei der Rückkehr zu einer früheren Adresse. Der Hook ist abgeschaltet, bis der Versanddienst aus B13 steht und OPS-001 die Edge Runtime freigibt. Bis dahin gilt: Mails an Patient:innen erreichen niemanden (der eingebaute Versand stellt nur an das Projektteam zu, BEF-026), und die Plattform ist nicht scharf. Den Weg, ein Postfach per Link zu bestätigen, baut der Loop, der B13 umsetzt; bis dahin trägt kein Konto das Merkmal, und ein vergessenes Kennwort heißt: neuer Code vor Ort (ADR-023 Punkt 10).

**Begründung.** Der Anmeldedienst verschickt den Wiederherstellungslink an jede bekannte Adresse; sein öffentlicher Endpunkt umgeht jede Oberfläche, und er kennt keine Regel je Konto. Die einzige unterstützte Stelle, an der sich das Verschicken prüfen lässt, ist der Mail-Hook. Er übernimmt dann alle Mails des Anmeldedienstes, auch die der Mitarbeitenden (Kennwort zurücksetzen, Zugangslink), und braucht deshalb einen Versanddienst — der fehlt bis B13. Unsicher: ob der Hook-Weg mit dem in B13 gewählten Anbieter so trägt; der Zugangsdienst spricht ihn ohnehin über den Adapter an.

**Anker.** `public.auth_email_allowed`, `app.platform_mailbox_confirmed` und `platform_mailbox_confirmations` in `supabase/migrations/20261002136000_abn_012_platform_mailbox_confirmation.sql`; `supabase/functions/platform-access/authmail.ts`; der abgeschaltete Eintrag in `supabase/config.toml`; Tests in `supabase/tests/platform-mailbox.test.ts` und `supabase/functions/platform-access/authmail.test.ts`.

**Änderungspfad.** Hook einschalten: Eintrag in `supabase/config.toml` bzw. im Cloudprojekt, Secret `SEND_EMAIL_HOOK_SECRET`, Versandweg aus B13 · Aufwand `klein`, sobald B13 steht. Bestätigungsweg: eine Mail mit Link an die Adresse und eine Funktion, die das Merkmal setzt · Aufwand `mittel`.

### ANN-219 — Die Definitionen der Fragebögen kommen als erzeugte Migration auf den Server, nicht als zweite Fassung von Hand

Technik · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · erledigt · Wiedervorlage: mit dem Patientenlink (POR-EPIC-002) oder dem nächsten neuen Instrument

**Annahme.** Der Server prüft Antworten gegen `public.questionnaire_definitions`, eine Zeile je Fassung (Kennung@Version) mit der Definitionsdatei als jsonb, dazu `app.questionnaire_body_regions()` mit den Kennungen der Körperbereiche. Beides schreibt eine Migration, die `pnpm definitionen:sql --schreiben` aus den Dateien unter `src/features/assessments/definitionen/scores/` (samt `archiv/`) und `koerperschema.ts` erzeugt; jede Fassung trägt einen Marker mit Prüfsumme. Eine eingetragene Fassung ändert sich nie: Das Skript weist eine geänderte Datei derselben Version ab, ein Trigger sperrt Update und Löschen. Die Regeln der Prüfung stehen in plpgsql (`app.assert_questionnaire_answers`) und folgen `antwortSchema`.

**Begründung.** BEF-101 verlangt dieselben Definitionsdateien wie die Anwendung, „etwa als vom Build erzeugte Tabelle oder Funktion“. Eine Tabelle statt einer erzeugten Funktion je Instrument, weil eine Fassung damit Daten bleibt: Sie lässt sich in einem Test mit der Datei vergleichen (`supabase/tests/questionnaire-definitions.test.ts`), und neue Fassungen brauchen keinen neuen Code. Eine Migration statt eines Seeds, weil die Prüfung in jeder Umgebung gelten muss. Unsicher: Die Regeln je Typ stehen zweimal (Zod und plpgsql); ein Unterschied fiele nur über die Tests in `questionnaire-responses.test.ts` auf.

**Anker.** `scripts/definitionen-sql.mjs` und `scripts/definitionen-sql.test.mjs` (meldet eine fehlende Fassung im CI); `supabase/migrations/20261003101000_abn_014_questionnaire_definitions.sql`; erzeugt: `supabase/migrations/20261003101100_questionnaire_definitions.sql`.

**Änderungspfad.** Neues Instrument oder neue Fassung: Datei ablegen, `pnpm definitionen:sql --schreiben` · Aufwand `klein`. Regeln nur noch an einer Stelle: das Zod-Schema als JSON-Schema exportieren und im Server mit einer Prüferweiterung auswerten (neue Abhängigkeit, ADR-015) · Aufwand `mittel`.

### ANN-220 — Ein Wartelisteneintrag ist nach acht Wochen ohne Änderung zu prüfen

Praxisprozess · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · erledigt · Wiedervorlage: nach drei Monaten Betrieb mit der Warteliste; Jannes in der Sichtung

**Annahme.** Ein offener Wartelisteneintrag, den acht Wochen niemand geändert oder bestätigt hat, steht unter „Warteliste prüfen“ in Offene Punkte. „Noch aktuell“ bestätigt ihn, ohne etwas zu ändern, und die acht Wochen beginnen neu; „Bearbeiten“ führt ins Formular.

**Begründung.** BEF-108 verlangt eine regelmäßige Prüfung und überlässt die Zeit dem Loop. Eine Verordnung ist 28 Tage nach Ausstellung zu beginnen (Heilmittel-Richtlinie, bei Privatverordnungen üblich übernommen); wer acht Wochen wartet, hat oft schon woanders einen Termin oder eine neue Verordnung. Kürzer (vier Wochen) erzeugte bei ruhigen Phasen ständig Rückfragen an dieselben Personen. Unsicher: wie lang die Warteliste der Praxis tatsächlich ist.

**Anker.** `app.waitlist_review_interval()` und `confirm_waitlist_entry` in `supabase/migrations/20261003105000_abn_018_waitlist_review_merge_records_holds.sql`; `src/features/open-points/WaitlistReview.tsx`.

**Änderungspfad.** Andere Frist: die Konstante in einer Migration ändern · Aufwand `klein`. Frist je Praxis: Spalte an `organizations` und Einstellung · Aufwand `klein`.

### ANN-221 — Die Fotoart wird im Fotobereich vor dem Kamerastart gewählt, mit Frist und Einwilligung im Wortlaut

Praxisprozess · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · Änderung BEF-135 · Wiedervorlage: Jannes in der Sichtung (Befund); Wortlaut mit B2

**Annahme.** Über „Foto aufnehmen“ fragt der Fotobereich „Wofür ist das Foto?“ mit zwei Optionen ohne Vorauswahl: „Teil der Dokumentation (Akte, zehn Jahre)“ — „Für die Dokumentation der Behandlung erforderlich. Keine Einwilligung nötig; löschen nur heute.“ — und „Arbeitshilfe (höchstens zwölf Monate, nur mit Einwilligung)“ — „Für Übergabe und Vergleich. Ein Widerruf löscht sie sofort.“ Erst eine Wahl gibt „Foto aufnehmen“ frei; nach dem Speichern oder Verwerfen ist die Wahl wieder leer. Ohne Einwilligung ist die Arbeitshilfe gesperrt und sagt warum; solange der Stand nicht geladen ist, ebenso, ohne eine fehlende Einwilligung zu behaupten.

**Begründung.** ADR-017 Punkt 44 verlangt die Wahl, bevor die Kamera startet, ohne Vorauswahl, und überlässt den Wortlaut dem Bau. Die Wahl steht vor dem Dialog statt in ihm, weil die Kamera beim Öffnen des Dialogs startet; so läuft sie nie, solange noch nicht entschieden ist. Die Frist steht in der Option selbst, damit niemand ein Foto ungewollt zehn Jahre aufbewahrt oder nach einem Jahr verliert (Konsequenzen der Fassung 3).

**Anker.** `FOTOART_WAHL` und `Aufnahme` in `src/features/files/FotosImVerlauf.tsx`.

**Änderungspfad.** Anderer Wortlaut: die Konstante · Aufwand `klein`. Wahl im Kameradialog selbst: eine Stufe vor dem Kamerastart in `Kameradialog.tsx` · Aufwand `klein`.

**Abnahme (Jannes, 2026-10-09).** geändert: Ein Foto, das aus der Dokumentation heraus entsteht, ist immer Teil der Dokumentation – keine Frage vor der Aufnahme. An das Foto von Anmeldebogen und Rezept erinnert die App an der passenden Stelle; andere Zwecke gibt es nicht. Umsetzung: BEF-135. **Abgelöst durch ANN-316** (ABN-032, 2026-10-09).

### ANN-222 — Die Anwendung löst die Prüfung am Server nach der Bestätigung aus; fehlt die Function, bleibt die Datei ungeprüft

Technik · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · erledigt · Wiedervorlage: mit OPS-001 (Scharfschalten der Edge Runtime und des Schalters)

**Annahme.** Nach der Bestätigung ruft die Anwendung die Edge Function `patient-file-verify` mit der Datei-Kennung auf. Die Function prüft die Sitzung, findet nur bestätigte Dateien der eigenen Organisation, liest das Objekt mit einem eigenen Dienstschlüssel (`PATIENT_FILE_VERIFY_SERVICE_KEY`) und trägt das Ergebnis ein. Antwortet sie nicht, bleibt die Datei „nicht serverseitig geprüft“, und der Upload gilt als gelungen; nur ein ausdrückliches „verworfen“ meldet die Anwendung der Person. Eine einmal geprüfte Datei wird nicht noch einmal gelesen. Auslösen kann nur die hochladende Person in den ersten 24 Stunden; unter Legal Hold verwirft ein Befund nicht, er steht nur im Protokoll (`held`), und eine bestätigte, wartende Datei lässt sich nicht von Hand verwerfen (Zweitreview).

**Begründung.** ADR-017 Punkt 50 legt den Ausführungsort fest, nicht den Auslöser. Ein Datenbank-Trigger mit Netzaufruf bräuchte eine Erweiterung (`pg_net`) und damit eine neue Abhängigkeit; ein Speicher-Webhook ist Einrichtung beim Anbieter. Der Aufruf aus der Anwendung erfüllt Punkt 52 („die hochladende Person informiert“) ohne weiteren Weg. Bis OPS-001 verhindert das die Cloud-Umgebung nicht, denn die Prüfung ist dort nie Bedingung (Punkt 51). Unsicher: Bei scharfem Schalter bleibt eine Datei ohne Antwort der Function unsichtbar `pending` und fällt nach 24 Stunden weg — die Person sieht dann nur, dass sie fehlt.

**Anker.** `pruefeAmServer` in `src/features/files/api.ts`; `supabase/functions/patient-file-verify/`; `patient_file_for_verification` in `supabase/migrations/20261004104000_abn_zweitreview_verification.sql`; `[functions.patient-file-verify]` in `supabase/config.toml`.

**Änderungspfad.** Auslöser am Server: Speicher-Webhook oder `pg_net`-Trigger auf `confirmation_requested_at` · Aufwand `mittel` (neue Einrichtung). Meldung „Prüfung steht aus“ bei scharfem Schalter: die Bestätigung gibt den Zustand zurück · Aufwand `klein`.

### ANN-223 — „Öffnen“ zeigt Bilder in der Anwendung; ein PDF hat bis zur Entscheidung nur „Herunterladen“

Technik · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · Änderung BEF-133 · Wiedervorlage: Jannes (Sicherheitsmaßnahme, §15.1); am echten iPhone mit Sichtung Befund

**Annahme.** „Öffnen“ lädt eine Datei ohne Downloadnamen per `fetch` mit `cache: 'no-store'` in den Speicher der Seite und zeigt sie unter der Zeile — für JPEG und PNG. Ein PDF bekommt kein „Öffnen“, sondern nur „Herunterladen“: eigener Verweis mit Downloadnamen, im Protokoll `link_issued` mit `download: true`; für beide Fotoarten weist die Datenbank das Herunterladen ab. Beim Verordnungsfoto neben dem Formular gilt dasselbe.

**Begründung.** ADR-017 Punkt 54 verlangt ein PDF „in einem abgeschotteten Rahmen ohne Skriptrechte“. Geprüft in Chromium (2026-10-02): Ein `iframe` mit `sandbox` zeigt kein PDF (der Betrachter ist im abgeschotteten Rahmen gesperrt), ohne `sandbox` schon; zudem verbietet die Content-Security-Policy der Test-Umgebung Rahmen aus Objekt-URLs (`default-src 'self'`) und `object-src 'none'`. Beides zu öffnen schwächte eine Sicherheitsmaßnahme ab — nach §15.1 ein Stopp, keine Annahme. Punkt 54 lässt für Geräte, die das PDF im Rahmen nicht zeigen, ausdrücklich Punkt 55 zu; bis Jannes entscheidet, gilt das für alle.

**Anker.** `istAnzeigbar` in `src/features/files/dokumentarten.ts`; `ladeDateiZumAnzeigen`, `ladeDateiHerunter` in `src/features/files/api.ts`; `issue_patient_file_link(uuid, boolean)` in `supabase/migrations/20261004102000_abn_027_open_means_display.sql`.

**Änderungspfad.** PDF in der Anwendung: Rahmen ohne `sandbox` aus einer Objekt-URL mit festem Typ `application/pdf` (der PDF-Betrachter des Browsers läuft in eigenem Ursprung) und `frame-src blob:` in `inhaltsrichtlinie` (`scripts/testumgebung.mjs`), dazu `istAnzeigbar` um PDF erweitern · Aufwand `klein`, braucht die Entscheidung von Jannes und einen Vermerk an ADR-017 Punkt 54.

**Abnahme (Jannes, 2026-10-09).** entschieden: Option (a) – die App zeigt PDFs selbst (Rahmen ohne `sandbox`, `frame-src blob:`, Vermerk an ADR-017 Punkt 54). Umsetzung: BEF-133. **Umgesetzt (ABN-034, 2026-10-09):** `istAnzeigbar` nimmt PDF auf, `PdfRahmen` in `src/features/files/Dateiansicht.tsx` (Objekt-URL mit festem Typ `application/pdf`, kein `sandbox`), auch neben dem Formular (`ScanBesideForm`); `frame-src blob:` in `inhaltsrichtlinie`; ADR-017 Fassung 4 Punkt 58. Die Plattform gibt PDFs weiter auf das Gerät (ANN-249).

### ANN-224 — Erstaufnahme: nur Verordnungsfoto und Anmeldebogen; der Anmeldebogen sind die Vermerke zu Datenschutzinformation und Vertrag

Praxisprozess · entschieden (Jannes) · 2026-10-03 · Jannes (Akte · Kopf, Reiter und Hinweis) · erledigt · Wiedervorlage: wenn der eigene Anmeldebogen gestaltet ist (`IDEA-PRX-054`)

**Annahme.** Die Erstaufnahme-Checkliste hat zwei Punkte: **Verordnungsfoto** (unverändert aus ANN-143) und **Anmeldebogen** (`registration_form`). Der Anmeldebogen ist ein Blatt mit Kontaktdaten, Datenschutzinformation und Behandlungsvertrag; erledigt ist er, sobald die beiden vorhandenen Vermerke „Datenschutzinformation ausgehändigt“ **und** „Behandlungsvertrag unterschrieben“ in der Akte stehen — keine neue Spalte, keine neue Vermerkart, kein Datenumzug. Anamnesebogen, Befund und Liege sind kein Punkt mehr; der Anamnesebogen bleibt klinisch und steht im Reiter Doku. Der Kopf der Akte zeigt nur „! Anmeldebogen fehlt“; ein fehlendes Verordnungsfoto steht weiter in der Tagesliste und unter „Offene Punkte“. Freiwillige Einwilligungen zählen wie bisher nicht.

**Begründung.** Jannes (2026-10-03): Es gibt zwei Bögen — den Anamnesebogen (vor dem ersten Termin, klinisch) und den Anmeldebogen (Datenschutz, Vertrag, Kontaktdaten); die Checkliste soll ausschließlich Anmeldebogen und Verordnungsgrundlage enthalten. Das Blatt ist noch nicht gestaltet; die beiden Vermerke sind heute die eine Stelle, an der sein Vorliegen steht, und sie bleiben einzeln nachweisbar (PAT-006, Fassung der Datenschutzinformation). Unsicher: ob die Praxis künftig einen einzigen Vermerk „Anmeldebogen unterschrieben“ will.

**Anker.** `app.intake_checklist` und `list_open_intakes` in `supabase/migrations/20261004110000_akte_anmeldebogen_checklist.sql`; `INTAKE_ITEMS`, Beschriftung und Ziel in `src/features/open-points/intake-api.ts`; `BEGRIFFE.anmeldebogen` in `src/lib/begriffe.ts`; Tests in `supabase/tests/intake-checklist.test.ts`.

**Änderungspfad.** Ein Vermerk statt zweier: neue Vermerkart in `patient_privacy_records` und der Punkt `registration_form` in `app.intake_checklist` · Aufwand `mittel`. Ein Punkt mehr: `app.intake_checklist` und `INTAKE_ITEMS` · Aufwand `klein`.

**Ablösung.** ersetzt ANN-143 in der Zahl der Punkte.

### ANN-225 — „Doku“ auf der Tageskarte führt in den Reiter Doku mit dem Termin oben; geschrieben wird auf der Schreibseite

Praxisprozess · entschieden (Jannes) · 2026-10-03 · Jannes (Übersicht · Tageskarte: Doku zusammenführen) · erledigt · Wiedervorlage: Sichtung der Übersicht

**Annahme.** Die Tageskarte hat genau einen Knopf „Doku“ (statt „Bisherige Doku“ und „Doku“). Er führt in den Reiter Doku der Akte mit `?termin=<id>`. Dort steht oben „Dieser Termin“: der Eintrag zu diesem Termin samt Nachträgen, oder „Noch kein Eintrag.“; darunter die übrigen Einträge, neueste zuerst, ohne diesen Termin. Schreiben heißt dort „Eintrag schreiben“ bzw. „Weiterschreiben“ und führt auf die bestehende Schreibseite außerhalb des Aktenrahmens, mit Rückweg in die Doku; an einem festgeschriebenen Eintrag gibt es den Knopf nicht (Korrektur und Nachtrag am Termin). Den Knopf sehen alle Rollen, die die Doku lesen (auch das Büro); schreiben nur die dokumentierenden.

**Begründung.** Jannes legt Ziel und Inhalt fest („oben der Eintrag zu diesem Termin, neu oder vorhanden, darunter die bisherigen Einträge“). Offen war nur, ob in der Akte selbst getippt wird. Nein: Formulare stehen bewusst außerhalb des Aktenrahmens, damit ein Tipp auf die Bereichsleiste keinen Text verwirft (UX-009, AKTE-000). Gelesen wird über die vorhandenen Wege (`fetchAppointment`, `get_treatment_note`), jeder gelieferte Eintrag wird protokolliert (ADR-010). Unsicher: ob der zusätzliche Tipp bis zum Schreiben im Alltag stört — dann könnte „Doku“ direkt auf die Schreibseite führen, die die bisherigen Einträge schon daneben zeigt.

**Anker.** `doku` in der Karte von `src/features/today/MyDayPage.tsx`; `DieserTermin` in `src/features/documentation/PatientRecordDocumentation.tsx`; `?termin=` in `src/features/documentation/PatientDokuPage.tsx`; Tests `src/features/documentation/DieserTermin.test.tsx`, `src/features/today/MyDayPage.test.tsx`.

**Änderungspfad.** Direkt auf die Schreibseite: das Ziel `doku` in `MyDayPage.tsx` · Aufwand `klein`. In der Akte schreiben: ein Formular in `DieserTermin` mit eigenem Verlustschutz · Aufwand `mittel`.

### ANN-226 — Im Kalender steht, wen owner dort hinnimmt – auch ohne eigenen Zugang

Praxisprozess · entschieden (Jannes) · 2026-10-03 · Jannes (Kalender ohne Zugang) · erledigt · Wiedervorlage: wenn owner Zugänge selbst anlegen soll (Edge Function nach ADR-023 Punkt 9, nach OPS-001)

**Annahme.** Eine Person ist für Behandlungen zuordenbar, wenn sie aktiv beschäftigt ist **und** entweder owner sie in den Kalender genommen hat (`staff_members.schedulable_treatment`) **oder** sie – wie bisher – einen aktiven Zugang mit der Rolle Therapeut:in oder Teamleitung hat; für Personal Training ebenso mit `schedulable_training` oder der Rolle trainer. Das Merkmal setzt allein owner, auf der Detailseite der Person unter „Kalender“; jede Änderung steht als `staff_member.updated` mit den Feldnamen im Protokoll, ein abgewiesener Versuch wie bei den Konten als denied-Eintrag mit HTTP 403 (G6c). Dabei entsteht weder ein Zugang noch ein Kennwort noch eine Rolle: Anmelden kann sich die Person weiterhin nur über die Einladung (ANN-025). Wer im Kalender steht, aber keinen Zugang hat, bekommt Termine; dokumentieren und abschließen tun dann andere.

**Begründung.** Jannes (2026-10-03): Neu angelegte Therapeut:innen sollen sofort im Kalender stehen, ohne ihren Zugang selbst zu aktivieren. Ein Zugang, den owner samt Kennwort anlegt, bräuchte einen Admin-Schlüssel am Server und weichte die Bestätigung der E-Mail-Adresse auf – das hat Jannes verworfen. Der zweite Weg ergänzt den ersten, statt ihn zu ersetzen; bestehende Konten und Tests bleiben unberührt. Unsicher: ob ein Zugang mit Behandlungsrolle die Person künftig auch automatisch in den Kalender nehmen soll, ohne dass owner das Merkmal setzt – heute tut er das über den bisherigen Weg ohnehin.

**Anker.** `app.is_assignable_therapist`, `app.is_assignable_trainer`, `set_staff_member_schedulable` in `supabase/migrations/20261005090000_akte_009_kalender_ohne_zugang.sql`; `StaffCalendarSection` in `src/features/staff/StaffCalendarSection.tsx`; Tests `supabase/tests/staff-schedulable.test.ts`.

**Änderungspfad.** Kalender nur noch über das Merkmal (der Zugang reicht nicht mehr): den zweiten Zweig in beiden Prädikaten streichen und das Merkmal aus den bestehenden Konten befüllen · Aufwand `mittel`. Auch office darf das Merkmal setzen: `app.can_manage_staff_master_data` statt `app.can_manage_staff_accounts` · Aufwand `klein`.

### ANN-227 — Der Anmeldebogen ist erledigt, sobald sein Foto in der Akte liegt

Praxisprozess · entschieden (Jannes) · 2026-10-03 · Jannes (Akte entschlacken: Anmeldebogen per Foto) · erledigt · Wiedervorlage: wenn der eigene Anmeldebogen gestaltet ist (`IDEA-PRX-054`)

**Annahme.** Der Papier-Anmeldebogen trägt Kontaktdaten, Datenschutzinformation und die Unterschrift unter den Behandlungsvertrag. Das Foto des unterschriebenen Blatts ist der Nachweis für beides. Es geht als Datei der Art `vertrag` (organisatorisch, das Büro sieht sie) mit dem Anzeigenamen „Anmeldebogen, Foto vom …“ in die Akte, ohne Vorschau und ohne zweiten Tipp: Das „Foto verwenden“ im Kameradialog ist die Bestätigung. Aufgenommen wird es direkt aus der Zeile „! Anmeldebogen fehlt“ im Kopf der Akte („Fotografieren“) oder im Abschnitt Anmeldebogen der Stammdaten; ohne Kamera öffnet sich der Dateiwähler. Die Vermerke „Datenschutzinformation ausgehändigt“ und „Behandlungsvertrag unterschrieben“ werden nicht mehr einzeln erfasst; im Bestand erledigen sie den Punkt weiter. Die Einwilligungen (Mail, Bericht, Fotos) bleiben als eigener Abschnitt in den Stammdaten, bis die Runde zum Reiter Stammdaten über ihren Platz entscheidet. Die Fotoeinwilligung schaltet serverseitig die Foto-Arbeitshilfe frei und muss deshalb erfassbar bleiben.

**Begründung.** Jannes (2026-10-03): „Wenn man auf Anmeldebogen tippt, soll man direkt ein Foto machen können, ähnlich wie bei Verordnung. Datenschutzinformation und Behandlungsvertrag kann also weg.“ Keine neue Dokumentart: `vertrag` trägt den Behandlungsvertrag schon heute und ist organisatorisch klassifiziert. Eine neue Art hätte Katalog, Fristen und Rollenschnitt berührt, ohne dass sich am Inhalt etwas ändert. Unsicher ist zweierlei. Erstens, ob die Fassung der Datenschutzinformation am Foto ablesbar bleibt, wenn das Blatt sich ändert. Zweitens, ob ein anderer hochgeladener Vertrag den Punkt fälschlich erledigt.

**Anker.** Der Punkt `registration_form` in `app.intake_checklist` (`supabase/migrations/20261005100000_akte_anmeldebogen_foto.sql`); `AnmeldebogenFoto` in `src/features/datenschutz/Anmeldebogen.tsx`; Tests in `supabase/tests/intake-checklist.test.ts`, `src/features/patients/PatientRecordLayout.test.tsx` und `src/features/datenschutz/Anmeldebogen.test.tsx`.

**Änderungspfad.** Eigene Dokumentart `anmeldebogen`: Katalogeintrag, `dokumentarten.ts` und die Bedingung in `app.intake_checklist` · Aufwand `klein`. Wieder mit Vermerken: die Optionen in `moeglicheVermerke` · Aufwand `klein`.

**Ablösung.** ersetzt ANN-224 in der Bedingung für den Anmeldebogen.

### ANN-228 — Ohne eigene Angabe sind die Termine einer Verordnung die größte Anzahl ihrer Positionen

Praxisprozess · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · erledigt · Wiedervorlage: Jannes in der Sichtung der Behandlungsgrundlagen

**Annahme.** Im Fenster „Daten übertragen“ trägt jede Position ihre eigene Anzahl („6 × KG“). Die Zahl möglicher Termine der Grundlage ist dann ohne eigene Angabe die größte Anzahl einer Position; das Feld „Termine“ bleibt im Fenster änderbar. „Hausbesuch je Termin“ legt die Position Hausbesuch mit dieser Terminzahl an – kein eigenes Kennzeichen, keine Migration. Die Pos.-Nr. steht nur zur Orientierung neben dem Heilmittel und kommt aus der gültigen Preisliste.

**Begründung.** Auf einem Privatrezept steht meist ein Heilmittel mit seiner Anzahl; mehrere Heilmittel werden in der Regel je Termin zusammen erbracht. Die größte Anzahl ist deshalb die beste Vorgabe, die Summe wäre bei „6 × KG + 6 × Wärme“ doppelt so groß. Unsicher: Rezepte mit gestaffelten Heilmitteln (erst MT, dann KG) – dafür bleibt das Feld änderbar.

**Anker.** `terminzahl` in `src/features/treatment-bases/DatenUebertragenFenster.tsx`; Test in `src/features/treatment-bases/GrundlagenKacheln.test.tsx`.

**Änderungspfad.** Summe statt Maximum oder Pflichtfeld: die eine Zeile `groessteAnzahl` · Aufwand `klein`.

### ANN-229 — Die Diagnose der Verordnung steht auf der Rechnung

Datenschutz · entschieden (Jannes) · 2026-10-03 · Jannes (Akte entschlacken: „Diagnose drauf“) · Prüfpaket · Wiedervorlage: Datenschutzberatung vor dem Scharfschalten (PROJECT_PRINCIPLES.md §15.2)

**Annahme.** Neue Rechnungsdokumente (`schema_version` 4) tragen je Behandlungsgrundlage ICD-10-Code und Diagnosetext der Verordnung, dazu wie bisher Datum und verordnende Ärzt:in. Therapieziel und Verordnerhinweis bleiben weg; am Selbstzahler gibt es keine Diagnose. Ausgestellte Rechnungen behalten ihren Snapshot (ADR-009 Punkt 10). Der ICD-10-Code ist ein eigenes Feld an der Grundlage (`diagnosis_icd10`) mit eigener Schreibfunktion und Protokoll.

**Begründung.** Private Krankenversicherung und Beihilfe erstatten Heilmittel nur mit Diagnose; ohne sie fordern sie die Verordnung nach, und die Rechnung geht ohnehin nur zusammen mit dem Rezept hinaus. Bisher stand die Diagnose aus Datensparsamkeit bewusst nicht darauf. Die Rechnung geht an die behandelte Person oder an eine von ihr benannte Stelle; die Übermittlung dient der Erstattung in ihrem Interesse. Unsicher ist, ob bei abweichender Empfänger:in (etwa Angehörige) eine Einwilligung nötig ist – das prüft die Datenschutzberatung vor der Inbetriebnahme. Entwickelt wird mit synthetischen Daten trotzdem jetzt (§15.2).

**Anker.** Der Schalter `app.invoice_shows_diagnosis()` in `supabase/migrations/20261005120000_rechnung_diagnose.sql`; Anzeige `diagnoseText` in `src/features/billing/anzeige.ts`; Tests in `supabase/tests/invoice-diagnosis.test.ts` und `src/features/billing/InvoicePrintPage.test.tsx`.

**Änderungspfad.** Diagnose wieder weg: der Schalter liefert `false` (neue Migration) · Aufwand `klein`. Nur bei Empfänger:in „selbst“ oder Kasse: Bedingung im Schalter um die Rechnung erweitern · Aufwand `mittel`.

### ANN-230 — Protokollierung auf das Mindestmaß: Lesen je Akte und Tag, eine Aktion je Abweisung

Datenschutz · entschieden (Jannes) · 2026-10-03 · Jannes (LOG-EPIC-001, Freigabe) · Prüfpaket · Wiedervorlage: Datenschutzberatung vor dem Scharfschalten · in ADR überführt: ADR-010 Fassung 3, ADR-016 Fassung 3, PROJECT_PRINCIPLES 0.21

**Annahme.** Leitprinzip: Das Datenmodell ist die Nachweisführung; das Auditlog hält nur, was es nicht abbildet. PR (a): „Akte geöffnet“ (`patient_record.viewed`, `training_relationship.viewed`) steht höchstens einmal je Person, Akte und Kalendertag der Praxis, auch beim Lesen über eine Vertretung; jeder Lesepfad auf klinische Inhalte schreibt nur noch diesen Eintrag statt eines `*.viewed` je Datensatz. Eine Datei steht nur beim Herunterladen im Protokoll (`patient_file.downloaded`). Jede Abweisung ist `access.denied` mit `context.operation`; gleichartige (Person, Operation) binnen zehn Minuten fasst ein Zähler zusammen. Das Lesen des Protokolls und des Umsatzes je Person wird nicht protokolliert.

**Begründung.** Kleine Praxis, wenige Rollen, Lesen des Protokolls nur durch owner, unveränderliche Akte mit `created_by`, `finalized_by` und Versionen als Nachweis: Wer an welchem Tag in welcher Akte war, genügt für Art. 5, 15 und 32 DSGVO; die Zeile je Datensatz erzeugte hunderte Einträge am Tag ohne Mehrwert. PR (b) und (c): Schreibvorgänge weist das Datenmodell nach (Lücken geschlossen: `reopened_by`, `ordered_by`, Zweifel am Zugang), 26 Aktionen; Fristen 12 Monate Lesen und Sicherheit, 3 Jahre übrige; Legal Hold über die ganze Akte; Löschjournal 60 Tage. Unsicher: ob die Prüfung eine feinere Körnung als den Tag verlangt.

**Anker.** `app.log_record_access` und `app.record_denied_read` in `supabase/migrations/20261006100000_log_001a_protokoll_lesen.sql`; die Lesepfade in `supabase/migrations/20261006100100_log_001a_lesepfade.sql`; Katalog `src/features/audit/actions.ts`; Tests in `supabase/tests/audit-protokoll-lesen.test.ts`.

**Änderungspfad.** Feinere Körnung: Tagesgrenze im Helfer durch Stunde ersetzen · Aufwand `klein`. Zurück zu je Datensatz: die Lesepfade wieder einzeln schreiben lassen · Aufwand `groß`.

### ANN-231 — Der Tarif des Terminhonorars steht an der Preisliste, die Vereinbarung je Person daneben

Praxisprozess · entschieden (Jannes) · 2026-10-05 · Jannes (ABR-EPIC-007, „wie empfohlen“) · Wiedervorlage: Probewoche 1

**Annahme.** Der allgemeine Tarif ist ein Betrag an der Katalogversion (`service_catalog_versions.session_fee_cents`) und wird mit ihr veröffentlicht und eingefroren. Eine patientenbezogene Honorarvereinbarung ist ein unveränderlicher Eintrag mit Betrag und Gültigkeitsbeginn (`patient_fee_agreements`); eine Änderung ist ein neuer Eintrag. Am Leistungstag gilt die jüngste Vereinbarung bis zu diesem Tag, sonst der Tarif der dann gültigen Preisliste. Anlegen und Entfernen einer noch nie angewandten Vereinbarung darf nur owner (wie ANN-071), lesen owner und office.

**Begründung.** ADR-009 Punkte 5 und 22: versioniert mit Gültigkeitsbeginn, Vereinbarung vor Tarif, eine neue Preisliste ändert keine Vereinbarung. Die Preisliste ist schon versioniert und eingefroren (ANN-070); ein zweites Versionsmodell für einen Betrag wäre eine zweite Wahrheit. Preisbildung ist Praxiseinstellung (§4.1).

**Anker.** `app.session_fee_on` in `supabase/migrations/20261007100000_abr_030_session_fee_tariff.sql`; Oberfläche `src/features/billing/Honorarvereinbarung.tsx`.

**Änderungspfad.** Auch office legt Vereinbarungen an: `app.can_manage_fee_agreements` · Aufwand `klein`. Tarif je Heilmittel-Kombination statt eines Betrags: eigene Tabelle je Version · Aufwand `mittel`.

### ANN-232 — Das Terminhonorar entsteht einmal je Termin und wird beim Bestätigen festgeschrieben

Praxisprozess · entschieden (Jannes) · 2026-10-05 · Jannes (ABR-EPIC-007) · Wiedervorlage: Probewoche 1

**Annahme.** Bestätigt jemand an einem Behandlungstermin mindestens ein Heilmittel, entsteht genau ein Eintrag in `appointment_session_fees` mit dem am Leistungstag geltenden Betrag (ANN-231), festgeschrieben; eine spätere oder rückwirkende Vereinbarung ändert ihn nicht. Ohne Tarif und Vereinbarung lässt sich nichts bestätigen. Im Terminhonorar ist die Menge je Heilmittel 1 (eine Doppelbehandlung ist eine eigene Position). Eine Position ohne Heilmittel (etwa eine Selbstzahlerleistung) und das Ausfallhonorar behalten ihren eigenen Preis. Leistungen, die vor ABR-EPIC-007 erfasst wurden, behalten ihre Katalogpreise.

**Begründung.** ADR-009 Punkt 22: genau einmal je Termin, die Heilmittelauswahl ändert den Preis nicht, eine Preisänderung ändert keine erfasste Leistung. Festschreiben statt Nachschlagen macht die Zusage unabhängig davon, wann eine Vereinbarung angelegt wird. Unsicher: ob es Behandlungstermine gibt, die kein Heilmittel tragen und trotzdem ein Honorar auslösen.

**Anker.** `public.record_billable_services` in `supabase/migrations/20261007110000_abr_031_session_fee_recording.sql`.

**Änderungspfad.** Honorar ohne Heilmittel: Bedingung in `record_billable_services` · Aufwand `klein`. Betrag nachträglich korrigieren: Erfassung zurücknehmen und neu bestätigen (heute schon möglich, solange keine Rechnung daran hängt).

### ANN-233 — Das Honorar wird auf die Heilmittel nach ihren Preisen in der Preisliste aufgeteilt

Recht · entschieden (Jannes) · 2026-10-05 · Jannes (B17, „wie empfohlen“) · Prüfpaket · Wiedervorlage: erster echter Erstattungsfall mit Beihilfe oder privater Versicherung

**Annahme.** Auf der Rechnung steht je bestätigtem Heilmittel eine Position. Ihr Betrag ist der Anteil am Terminhonorar im Verhältnis der Preise der Heilmittel in der am Leistungstag geltenden Preisliste; Restcents gehen an den größten Bruchteil, bei Gleichstand an die erste Position der Liste. Die Summe je Termin ist genau das Honorar. Ein Vergleichsbetrag (Kassen- oder Beihilfesatz) steht nicht auf der Rechnung.

**Begründung.** Beihilfe (Paragraf 23 BBhV mit Anlage 9) und private Versicherung erstatten je Heilmittel; eine Zeile je Termin ließe sich keinem Höchstbetrag zuordnen (ADR-009 Punkt 23). Die Preise der Heilmittel pflegt owner ohnehin; als Gewichte gibt jede Kombination eine Aufteilung ohne eigene Pflege. Unsicher: ob eine Erstattungsstelle eine Aufteilung beanstandet, die von ihren Höchstbeträgen abweicht.

**Anker.** `app.session_fee_lines` in `supabase/migrations/20261007110000_abr_031_session_fee_recording.sql`.

**Änderungspfad.** Andere Gewichte (etwa Beihilfe-Höchstbeträge als eigenes Feld): nur `app.session_fee_lines` · Aufwand `klein`. Eine Zeile je Termin: dieselbe Funktion · Aufwand `klein`.

### ANN-234 — Die Übersicht wechselt den Tag um je einen Kalendertag, der Tag steht in der Adresse

Oberfläche · entschieden (Jannes) · 2026-10-05 · Jannes (Auftrag UBK-EPIC-001, Umschalten auf Vortag und Folgetag bestätigt; „Samstag passt“) · erledigt · Wiedervorlage: —

**Annahme.** Unter dem Kopf der Übersicht stehen „‹ Vortag“, „Folgetag ›“ und, an einem anderen Tag, „Heute“; gewechselt wird um je einen Kalendertag, auch über das Wochenende. Der gezeigte Tag steht als `?tag=JJJJ-MM-TT` in der Adresse, ein ungültiger Wert führt auf heute. An einem anderen Tag gelten dieselben Regeln wie heute, gemessen an einem Bezugszeitpunkt: Ein künftiger Tag liegt ganz vor einem (alles wartet, der erste Besuch ist der „Erste Weg“, kein Haken), ein vergangener ganz hinter einem (nicht Abgehaktes steht als „Nicht abgeschlossen“ da und lässt sich abhaken). Jetzt-Marke und Wegbalken gibt es nur heute; Liege-Zeile („Liege morgen“), Zeitstrahl mit Anfahrten, Teamplan und Tagesroute zeigen den gewählten Tag. Offene Punkte bleiben beim heutigen Stand.

**Begründung.** Abends den nächsten Tag samt Liege sehen und morgens den Vortag abhaken sind die beiden Fälle, die der Auftrag meint. Ein Datum in der Adresse ist kein Personenbezug (ADR-013 Punkt 9 Nr. 5) und macht den Tag mit „zurück“ erreichbar. Der Bezugszeitpunkt statt einer zweiten Logik hält ANN-117 Fassung 2 an einer Stelle. Am Freitag zeigt „Folgetag“ den Samstag – so entschieden (Jannes, 2026-10-05).

**Anker.** `gewaehlterTag`, `bezugszeitpunkt` und `tagesWort` in `src/features/today/tageswahl.ts`; `TagWechsel` in `src/features/today/MyDayPage.tsx`; Tests `tageswahl.test.ts`, `MyDayPage.test.tsx` („UBK-003“).

**Änderungspfad.** Wochenende überspringen oder größere Sprünge: `tagePlus` in `TagWechsel` durch eine Werktagsfunktion ersetzen · Aufwand `klein`. Haken auch an künftigen Tagen: die Bedingung `datum > heute` in `MeinTag` · Aufwand `klein`.

### ANN-235 — Fahrwege im Kalender: beim Anzeigen abgerufen, ab heute, vom Startort der Praxis

Technik · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · erledigt · Wiedervorlage: Jannes in der Sichtung; Gate aus ADR-019 Punkt 9 vor echten Adressen

**Annahme.** Der Kalender zeigt vor jedem Termin mit Ort einen gestrichelten Block „Weg ≈ n min“, so lang wie die Fahrzeit und endend am Beginn des Termins – in der Tagesansicht in jeder Spalte einer Person, in der Woche an jedem gezeigten Tag der Person. Der erste Weg des Tages beginnt am Startort der Praxis (erster Standort, wie Übersicht und Tour). Abgerufen wird beim Anzeigen, nur für Tage ab heute und nur für die Praxisrollen: je Spalte `list_day_route` und eine Route über die eigene Function, mit denselben Schlüsseln wie Übersicht und Tour, sodass dieselben Stopps nur einmal beim Anbieter landen. Ohne Fahrzeit (Position, Route oder Startort fehlt, Ersatzschätzung) gibt es keinen Block. Der Block ist Darstellung: Er nimmt keinen Tipp an, und ob ein Übergang zu knapp ist, sagt weiter allein der Fahrpuffer (ANN-097). *Seit UBK-016 (ANN-241) nimmt der Block einen Tipp an und öffnet ein Menü; die Prüfung bleibt beim Fahrpuffer.*

**Begründung.** ADR-019 Punkt 3 nennt Fahrzeiten im Kalender als Ziel, Punkt 12, 13 und 16 werden eingehalten (nur Koordinaten und Profil, nichts gespeichert). Vergangene Tage werden nicht mehr geplant und kosten beim Anbieter nur Kontingent. Der Startort entspricht ANN-196 („Start am Rad“), ohne eine Beschäftigtenadresse beim Dienst (ADR-019, `startort.ts`). Unsicher: ob eine Tagesansicht mit vielen Personen das Kontingent des Anbieters spürbar belastet – je Person und Tag eine Route, im Zwischenspeicher der Sitzung.

**Anker.** `FAHRWEGE_IM_KALENDER`, `fahrwegeAusRoute` und `useFahrwege` in `src/features/appointments/fahrwege.ts`; Darstellung `fahrwege` in `CalendarGrid.tsx`; Tests `fahrwege.test.ts`, `CalendarGrid.test.tsx`, `CalendarPage.test.tsx` („Fahrwege als Bloecke“).

**Änderungspfad.** Abschalten: `FAHRWEGE_IM_KALENDER = false` · Aufwand `klein`. Erst auf Tipp abrufen oder nur mit Personenfilter: die Bedingung `gefragt` in `useFahrwege` · Aufwand `klein`. Ohne ersten Weg vom Startort: `start` in `useFahrwege` auf `null` · Aufwand `klein`. **UBK-015 (2026-10-05):** Der erste Weg beginnt an der Garage, falls gesetzt, und nach dem letzten Besuch steht der Rückweg als Block (ANN-240).

### ANN-236 — Eine veraltete Anschrift am Termin ergibt keine Fahrzeit; nach dem Verorten fragt die Akte nach dem Umstellen

Praxisprozess · entschieden (Jannes) · 2026-10-05 · Jannes (Sichtung: Fahrzeit 10 statt 33 Minuten; „bau beides, (a) zuerst“) · erledigt · Wiedervorlage: —

**Annahme.** (a) Nach einem erfolgreichen „Adresse verorten“ in der Akte fragt die Seite direkt mit, wenn künftige Hausbesuche noch die alte Anschrift tragen: „n künftige Hausbesuche nennen noch die alte Anschrift … Alle n auf die neue Anschrift umstellen“ – nur für Rollen, die Termine ändern, und nur auf Tipp; umgestellt wird mit Anschrift und Kartenposition aus der Akte. (b) `list_day_route` meldet je Stopp `address_outdated`, wenn ein künftiger bestätigter Behandlungs-Hausbesuch eine andere Anschrift trägt als die vollständige Anschrift der Akte – dieselbe Regel wie `list_home_visits_with_outdated_address` –, und liefert für ihn keine Koordinate. Übersicht und Tour sagen dort „Fahrzeit nicht verfügbar – Adresse am Termin veraltet“, der Kalender zeigt statt des Fahrwegs einen gelben Block „! Adresse veraltet“ (15 Minuten, nur Darstellung). Vergangene oder begonnene Termine behalten ihre Anschrift und Koordinate (ANN-003).

**Begründung.** Eine Fahrzeit aus einer veralteten Koordinate sieht aus wie eine richtige und verleitet zur falschen Planung (Sichtung 2026-10-05: 10 Minuten statt rund einer halben Stunde); ungeprüft ist nicht „kurz“ (MAP-004b, ADR-019 Punkt 38 sinngemäß). Der Snapshot am Termin bleibt die Regel (ANN-003, ABN-004); umgestellt wird weiter nie von selbst. Die neue Angabe ist ein Ja/Nein ohne Namen und Adresse (ADR-019 Punkt 12, ADR-004 Projektionen).

**Anker.** `supabase/migrations/20261008100000_ubk_007_day_route_address_outdated.sql`; `UmstellenNachVerorten` in `src/features/patients/AdresseVerorten.tsx`; `VERALTET_TEXT` in `src/features/today/tagesstart.ts`; `veralteteWege` in `src/features/appointments/fahrwege.ts`; Tests `supabase/tests/day-route.test.ts`, `AdresseVerorten.test.tsx`, `fahrwege.test.ts`, `CalendarGrid.test.tsx`, `MyDayPage.test.tsx`.

**Änderungspfad.** Ohne Warnblock im Kalender: `veralteteWege` nicht mehr aufnehmen · Aufwand `klein`. Beim Verorten automatisch umstellen statt fragen: `UmstellenNachVerorten` ruft das Umstellen selbst auf · Aufwand `klein`, berührt aber ANN-003 (vorher entscheiden). Die alte Koordinate trotzdem zeigen: die `case`-Zweige in `list_day_route` · Aufwand `klein`.

### ANN-237 — Fahrzeitfaktor: ein Wert je Praxis, angewendet im Browser an genau einer Stelle

Praxisprozess · entschieden (Jannes) · 2026-10-05 · Jannes (Faktor 1,5, Wiedervorlage von ANN-097; Ort, Bereich und Rolle im Zuschnitt von UBK-EPIC-002) · erledigt · Wiedervorlage: Jannes nach den ersten Wochen mit echten Wegen

**Annahme.** Jede Fahrzeit des Kartendienstes wird mit dem Fahrzeitfaktor der Praxis multipliziert und auf ganze Sekunden gerundet, bevor sie angezeigt (Tour, Übersicht, Kalender-Fahrwege, Terminsuche) oder an `check_travel_buffers` und `rate_slot_travel` gegeben wird. Der Faktor ist **ein** Wert je Organisation (`organizations.travel_time_factor`, Voreinstellung 1,5, erlaubt 1,0 bis 2,5 in Schritten von 0,1), geändert nur von owner (`set_travel_time_factor`, ohne Auditeintrag wie der Startort). Er gilt nur für Fahrzeiten, nicht für Strecken. Lässt er sich nicht lesen, rechnet die Anwendung mit 1,5, nie mit 1,0; solange er lädt, geht keine Route und keine Matrix hinaus.

**Begründung.** PTV rechnet mit `OSM_CARGO_BICYCLE` praktisch mit festen ~23 km/h (gemessen an vier Abschnitten 22,6 bis 23,5 km/h), Google lag bei rund 15 km/h (Walhau 43 → Steinäckerstraße 91: 33 statt 22 Minuten); Google bleibt als Rechendienst ausgeschlossen (ADR-019 Punkt 10), ein Steigungsmodell und eine Rüstzeit will Jannes nicht. Angewendet wird im Browser, weil die Fahrzeit dort entsteht und die Datenbank sie nur hereingereicht bekommt (ANN-097); ein Zuschlag im Server wäre eine zweite Stelle, und die Anzeige hätte ihn nicht. Je Organisation statt je Standort, weil dieselben Räder überall fahren (ADR-003: kein Vorbau für mehrere Standorte). Unsicher: ob ein fester Faktor kurze Wege (Ampeln, Abstellen zählen relativ mehr) unter- und lange überschätzt.

**Anker.** `planungsfahrzeit` in `src/features/tours/fahrzeitfaktor.ts` (dazu `usePlanungsroute`, `usePlanungsrouten`, `usePlanungsmatrix`; Rückfall `useFahrzeitfaktor`); `supabase/migrations/20261009100000_ubk_010_travel_time_factor.sql`; Einstellung `FahrzeitfaktorEinstellung.tsx` unter Planung; Tests `fahrzeitfaktor.test.tsx` (mit Quelltextprüfung: Route und Matrix im Fachcode nur über diese Datei), `supabase/tests/travel-time-factor.test.ts`, `CalendarPage.test.tsx`, `fahrpuffer.test.tsx`.

**Änderungspfad.** Anderer Wert: Einstellung unter Organisatorisches → Planung · Aufwand keiner. Anderer Bereich oder feinere Schritte: Check in der Migration, `FAHRZEITFAKTOR_WERTE` · Aufwand `klein`. Faktor nach Weglänge oder zusätzlich ein fester Zuschlag je Weg: allein `planungsfahrzeit` · Aufwand `klein`. Faktor je Standort: Spalte an `locations`, Lesen in `fahrzeitfaktor-api.ts` · Aufwand `mittel`.

### ANN-238 — „Passt es?“: Luft nach §8.1, Nachbarn aus der Tagesroute, Tagesrand am Startort, Koordinate wie in der Terminsuche

Praxisprozess · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · erledigt · Wiedervorlage: Jannes in der Sichtung (UI-Redesign; Kartendienst)

**Annahme.** Im Anlegen- und Ändern-Formular eines Behandlungstermins steht, sobald Person, Tag, Zeit und Ort feststehen, „Passt es?“ mit Anfahrt und Weiterfahrt: „passt · X Min. Luft“ oder „zu knapp um X Min., frühester Beginn …“. Luft ist der Beginn des Folgetermins minus (Ende plus Fahrzeit, aufgerundet aufs Raster) in ganzen Minuten, gerechnet allein im Server (`check_travel_fit`, dieselbe Rundung wie `check_travel_buffers`). Nachbarn sind die Termine mit Ort derselben Person an diesem Tag (`list_day_route`, ohne den bearbeiteten Termin); fehlt einer, zählt der Arbeitsbeginn bzw. das Arbeitsende am Startort (ohne Arbeitszeit bleibt die Seite leer). Stufen wie der Wegbalken (ANN-195): ab 5 Minuten passt es, 0 bis 4 ist knapp, darunter zu knapp. Ein neuer Hausbesuch nimmt die Koordinate der Akte über `get_visit_position` (Rechte wie die Terminsuche: owner, therapist, team_lead, office), ein bestehender behält seine (ANN-003) und ist bei veralteter Anschrift ungeprüft (ANN-236); ohne Koordinate steht „nicht verortet“ statt einer Zeit. Video prüft nichts. Nichts sperrt; „Passt es?“ steht nicht am Trainingsformular.

**Begründung.** Zuschnitt Jannes (UBK-EPIC-002): nur Auskunft, live beim Verstellen, kein Name eines anderen Termins nötig („vom Termin davor (bis 10:00 Uhr)“). Die Rundung bleibt an einer Stelle (§8.1, ANN-097); `check_travel_fit` liest dafür keine Termine, sondern bekommt Zeiten und Fahrzeiten herein und gibt einem Aufrufer nichts, was er nicht schon hat. Die Koordinate der Akte gibt die Terminsuche denselben Rollen bereits (`find_free_slots`), ANN-016 bleibt für die Kartei bestehen. Zum Kartendienst geht eine Route über höchstens drei Koordinaten (ADR-019 Punkt 12, 13), mit Fahrzeitfaktor (ANN-237). Unsicher: ob der Arbeitsbeginn als Tagesrand im Alltag stört, wenn der erste Termin bewusst auf den Arbeitsbeginn gelegt ist.

**Anker.** `supabase/migrations/20261009110000_ubk_012_travel_fit.sql` (`get_visit_position`, `check_travel_fit`); `luftStufe`, `nachbarnDes`, `tagesrand`, `useWegpruefung` in `src/features/appointments/wegpruefung.ts`; Anzeige `Wegauskunft.tsx`; `tagesorte` in `src/features/tours/startort.ts`; Tests `supabase/tests/travel-fit.test.ts`, `wegpruefung.test.tsx`, `Wegauskunft.test.tsx`, `NewAppointmentPage.test.tsx`, `EditAppointmentPage.test.tsx`. **UBK-013:** Beim Ziehen im Kalender steht dieselbe Auskunft in einer Leiste am unteren Rand (gefragt nach 250 ms Stillstand, nicht vorgelesen) und in der Rückfrage nach dem Loslassen; ohne Recht auf die Tagesroute (Trainingsbetreuung) fragt das Ziehen nicht — `wegfrageFuer` in `CalendarPage.tsx`, `WegauskunftFuer` in `Wegauskunft.tsx`, Test „UBK-013“ in `CalendarPage.test.tsx`.

**Änderungspfad.** Ohne Tagesrand: in `useWegpruefung` nur Termine als Nachbarn · Aufwand `klein`. Andere Stufen: `luftStufe` · Aufwand `klein`. Sperre statt Auskunft: die Fahrzeit müsste im Server entstehen (Änderungspfad von ANN-097) · Aufwand `mittel`. Auch am Trainingsformular: `Wegauskunft` dort einbinden, Rechte von `get_visit_position` für den Trainingskontakt prüfen · Aufwand `mittel`.

### ANN-239 — Lückenfinder: Tagesansicht mit Patientenfilter, eine Stufe je Lücke, 60 Minuten, andere Termine als „belegt“

Praxisprozess · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · Änderung BEF-136 · Wiedervorlage: Jannes in der Sichtung (Kartendienst: Matrix gegen den echten Dienst)

**Annahme.** Ist im Kalender eine Patient:in gewählt (`?patient=`, nur die Kennung), färbt die **Tagesansicht** ab heute jede freie Lücke in der Arbeitszeit (ab 15 Minuten): **passt** (ab 5 Min. Luft, Wort „passt ab 10:20“), **knapp** (0 bis 4), **passt nicht** (darunter) oder **zu kurz** (kürzer als der Termin). Gerechnet wird für einen Termin von 60 Minuten (Terminfenster), mit dem frühesten Beginn nach der Anfahrt und der Weiterfahrt bis zum Ende der Lücke — vom Ort davor (letzter Termin mit Ort, sonst der Startort) zur Anschrift der Akte und weiter zum Ort danach (nächster Termin, sonst der Startort zum Feierabend); die Zeitgrenzen sind die Lücke selbst, also auch eine Fehlzeit davor oder danach. Fahrzeiten aus zwei Matrizen je Spalte, gerundet im Server (`check_travel_fit`). Scheitert eine Matrix oder fehlt eine Koordinate, steht „nicht geprüft“ statt einer Farbe; ohne verortete Adresse sagt der Hinweis „nicht verortet“. Mit Patientenfilter bleiben die übrigen Termine als gestrichelte Kachel „belegt“ stehen (BEF-053 Punkt 1, Option 1), statt zu verschwinden. Nur Auskunft: jede Lücke bleibt antippbar.

**Begründung.** Zuschnitt Jannes (UBK-EPIC-002, Teil 2 von CAL-015c, `IDEA-PRX-042`): passt / knapp / nicht, kein Name in der URL, bei Fehler „nicht geprüft“; die Woche ausdrücklich nicht. Die Stufen sind die des Wegbalkens (ANN-195) und von „Passt es?“ (ANN-238). 60 Minuten sind die Vorbelegung des Formulars (§8.1); der Lückenfinder kennt die Verordnung nicht. Ohne BEF-053 Punkt 1 färbte er Zeiten, die nur ausgeblendet, aber belegt sind; gezeigt wird nichts Neues, der Ausschnitt ist ohnehin geladen (AKTE-003). Die Matrix ist gegen den echten Dienst nie geprüft (PTV aus der Cloud gesperrt) — deshalb der eigene Sichtungsschritt. Unsicher: ob eine Fehlzeit als Grenze zu streng ist und ob 60 Minuten für Erstbefunde zu kurz sind.

**Anker.** `freieLuecken`, `umfeldDer`, `useLueckenfinder`, `MIN_LUECKE_MINUTEN` in `src/features/appointments/lueckenfinder.ts`; `usePlanungsmatrizen` in `src/features/tours/fahrzeitfaktor.ts`; `lueckenDarstellung` und `zurueckgenommen` in `CalendarGrid.tsx`; `lueckenSpalten`, `lueckenHinweis` in `CalendarPage.tsx`; Tests `lueckenfinder.test.tsx`, `CalendarPage.test.tsx` („UBK-014“, „AKTE-003“).

**Änderungspfad.** Andere Dauer, etwa aus der Verordnung: `dauer` in `useLueckenfinder` aus dem Kalenderstand · Aufwand `klein`. Ein Band je Tag statt je Lücke: Darstellung in `CalendarGrid.tsx` · Aufwand `klein`. Auch in der Woche: `lueckenSpalten` für Tage statt Personen · Aufwand `klein`, kostet zwei Matrizen je Tag. Andere Termine wieder ausblenden: `zurueckgenommen` in `CalendarPage.tsx` · Aufwand `klein`.

**Abnahme (Jannes, 2026-10-09).** geändert: Der Lückenfinder rechnet auch mit 45 Minuten Termindauer; bevorzugt bleiben 60 Minuten. Umsetzung: BEF-136. **Umgesetzt (ABN-033, 2026-10-09):** ANN-317.

### ANN-240 — Garage je Standort: Beginn und Ende der Tour, getrennt vom Startort; Rückweg in Tour und Kalender

Praxisprozess · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · erledigt · Wiedervorlage: Jannes in der Sichtung (Kartendienst)

**Annahme.** Jeder Standort kann eine Garage (Abstellort der Räder) tragen — eigene Spalten neben dem Startort, gesetzt und entfernt nur von owner unter Organisatorisches → Planung, mit derselben Verortung wie der Startort (eindeutiger Treffer, sonst Bestätigung). Der Startort bleibt die Koordinate der Praxistermine. Wo der Tag am Rad beginnt und endet, ist die Garage, falls gesetzt, sonst die Praxis (`tagesorte`): so rechnen Übersicht, Kalender-Fahrwege, „Passt es?“ und der Lückenfinder. Die Tour bietet für den Start Garage / Praxis / erster Besuch und für das Ende Garage / Praxis / letzter Besuch, voreingestellt wie oben; die Wahl gilt für den Besuch der Seite. Der Rückweg steht als letzte Fahrzeile der Tour („Rückweg 18 Min. · 4,0 km“, „Ende an der Garage“) und im Kalender als Block „Rückweg ≈ n min“ ab dem Ende des letzten Besuchs; die Übersicht zeigt ihn nicht. Der Rückweg wird nicht gegen den Fahrpuffer geprüft — es folgt kein Termin.

**Begründung.** Zuschnitt Jannes (UBK-EPIC-002): „eine Praxisadresse, keine persönliche“ (§20) — eine Wohnadresse von Mitarbeitenden wäre ein Beschäftigtendatum beim Kartendienst; die Oberfläche sagt das, erzwingen lässt es sich nicht. Den Startort auf die Garage zu setzen, verschöbe die Praxistermine an die Garage. Je Standort statt je Person, weil die Räder der Praxis gehören (`IDEA-PRX-017` bleibt für einen Startort je Tag). Kein Auditeintrag (ADR-010 Fassung 3, wie der Startort); Datenklasse und Frist des Standorts.

**Anker.** `supabase/migrations/20261009120000_ubk_015_garage.sql` (`set_location_garage`, `clear_location_garage`, Trigger `locations_drop_garage_coordinate`); `garagenpunkt`, `tagesorte`, `saveGarage`, `clearGarage` in `src/features/tours/startort.ts`; `GarageEinstellung` in `StartortEinstellung.tsx`; `Ortswahl` in `TourenPage.tsx`; `rueckweg` in `useFahrten` (`fahrpuffer.ts`) und in `fahrwegeAusRoute` (`src/features/appointments/fahrwege.ts`); Tests `supabase/tests/garage.test.ts`, `TourenPage.test.tsx`, `StartortEinstellung.test.tsx`, `fahrwege.test.ts`, `tagesroute.test.ts`, `CalendarGrid.test.tsx`.

**Änderungspfad.** Rückweg auch in der Übersicht: `tagesorte(...).ende` in `useTagesfahrzeiten` · Aufwand `klein`. Ein Startort je Tag oder Person: eigenes Epic nach §20-Prüfung (`IDEA-PRX-017`) · Aufwand `mittel`. Tour ohne Wahl, immer Garage: `Ortswahl` entfernen · Aufwand `klein`.

### ANN-241 — Fahrweg im Kalender antippbar: ganzer Block als Fläche, Menü mit Navigation und Tour

Praxisprozess · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · erledigt · Wiedervorlage: Jannes in der Sichtung (UI-Redesign)

**Annahme.** Ein Fahrweg-Block im Kalender ist eine Fläche: Ein Tipp markiert ihn als Ganzes (durchgezogener Rand) und öffnet daneben ein Menü — „Fahrweg“ bzw. „Rückweg“, von → nach (der Termin davor oder Garage/Praxis, der Termin danach oder Garage/Praxis; Namen aus den geladenen Terminen, keine neue Abfrage), „≈ n Min. · x km“, „Navigation starten“ und „Zur Tour“ (Tag und Person). Der Tipp gilt dem Weg und markiert keine Zeile darunter. „Navigation starten“ ist der vorhandene Handoff: URL erst beim Tippen, nur die Koordinate des Ziels und der Fahrradmodus, Ziel-App Google Maps wie am Termin. Ein Warnblock „Adresse veraltet“ (ANN-236) bleibt Darstellung. Escape oder „Schließen“ schließt.

**Begründung.** Zuschnitt Jannes (UBK-EPIC-002): Bisher waren die Blöcke `pointer-events-none` (ANN-235), und ein Tipp darauf markierte die Zeilen darunter. ADR-019 Punkt 20 bis 23 gelten unverändert: nur auf Aktion, nur das Ziel ohne Namen. Die Namen im Menü stehen ohnehin auf den Kacheln daneben; in die Adresse kommt nichts (ADR-011). Unsicher: ob ein Tipp auf einen sehr kurzen Block (unter 16 px) am Telefon sicher trifft.

**Anker.** `FahrwegMenue.tsx`; `gewaehlterWeg` und der Block als `button` in `CalendarGrid.tsx`; `mitAuskunft` in `CalendarPage.tsx`; `vonTerminId`, `ort`, `ziel`, `meter` in `fahrwegeAusRoute` (`fahrwege.ts`); Tests `FahrwegMenue.test.tsx`, `CalendarPage.test.tsx` („UBK-016“), `fahrwege.test.ts`.

**Änderungspfad.** Wieder nur Darstellung: `auskunft` in `mitAuskunft` weglassen · Aufwand `klein`. Andere Ziel-App: wie am Termin nach der Gerätebewertung (MAP-005c) · Aufwand `klein`.

### ANN-242 — Ort auf der Kalenderkachel: Straße und Hausnummer am Hausbesuch, Standort am Praxistermin

Datenschutz · entschieden (Jannes) · 2026-10-06 · Jannes (Rückfrage UBK-017: „Straße mitliefern“) · erledigt · Wiedervorlage: Jannes in der Sichtung (UI-Redesign)

**Annahme.** Die Kalenderkachel nennt den Ort: am Hausbesuch Straße und Hausnummer aus dem Snapshot am Termin (ANN-003), am Praxistermin den Standort, am Videotermin das Wort der Terminart. Steht in der dritten Zeile ein Zustand („! Nicht angetroffen“, „! Doku offen“), rückt der Ort in die vierte, wenn die Kachel hoch genug ist; im Tooltip steht er immer. `list_appointments` liefert dafür zwei Spalten mehr, nur am Hausbesuch; Postleitzahl, Ort, Koordinate und Kontaktdaten bleiben draußen. Rechte und Zeilen unverändert: Wer die Zeile sieht, sah schon den Namen. Am Trainingstermin stammt die Straße aus den Kontaktdaten des Trainings, nie aus der Akte (ADR-021 Punkt 3), und nur Rollen des Trainingskontexts sehen die Zeile.

**Begründung.** Zuschnitt Jannes (UBK-EPIC-002) ging davon aus, dass der Kalender die Straße schon liefert; das stimmte nur für den Standort, und ein Datensparsamkeitstest verbot den Adress-Snapshot ausdrücklich. Ein harter Stopp (§15.1); Jannes hat am 2026-10-06 entschieden. Straße und Hausnummer sind der Teil der Anschrift, den die behandelnde Person zur Planung braucht; Postleitzahl und Ort sagen in einer Praxis mit einem Einzugsgebiet wenig und machen die Zeile zur vollständigen Anschrift. Unsicher: ob Büro und Teamleitung in der Wochenübersicht die Straße brauchen – sie sehen die Zeile ohnehin mit Namen.

**Anker.** `supabase/migrations/20261009130000_ubk_017_place_on_tile.sql` (`list_appointments`); `ortDerKachel` und `zeile4` in `CalendarGrid.tsx`; `visit_street`, `visit_house_number` im Kalenderschema (`api.ts`); Tests `list-appointments.test.ts` („Datensparsamkeit“, „Ort auf der Kachel“), `CalendarGrid.test.tsx` („UBK-017“).

**Änderungspfad.** Ohne Straße: die zwei Spalten in einer neuen Migration wieder entfernen und `ortDerKachel` am Hausbesuch `null` liefern lassen; der Datensparsamkeitstest nimmt sie zurück in die verbotene Liste · Aufwand `klein`.

### ANN-243 — Startbild einmal je Sitzung, Merker im Sitzungsspeicher des Tabs

Praxisprozess · entschieden (Jannes) · 2026-10-06 · Jannes (Design-Runde 1, 05.10.2026: „Einmal je Sitzung, auch am Rechner volles Intro“) · erledigt · Wiedervorlage: Jannes in der Sichtung (Rahmen)

**Annahme.** Das Startbild „Speiche wird O“ (Handoff Rahmen vom 2026-10-05, Abschnitt 6) läuft **einmal je Sitzung** in voller Länge (1,8 s) auf jedem Gerät: beim ersten Aufbau der angemeldeten Anwendung nach einem Kaltstart und nach jeder Anmeldung. Nie beim Neuladen, bei Navigation, beim Zurückkehren aus dem Hintergrund oder nach dem Sperrbildschirm (ADR-025). Der Merker ist ein Wahrheitswert `startbild-gezeigt` im `sessionStorage` des Tabs, gesetzt beim **Start** des Intros (ein Abbruch wiederholt nicht), gelöscht beim Wechsel der Identität im `SessionProvider` (Abmelden, Ablauf, anderes Konto). Ein neuer Tab ist ein neuer Start. Ohne Sitzung kein Intro; es folgt nach der Anmeldung. Das Intro wartet auf nichts: Profil und Tagesliste laden darunter. „Überspringen“ und ab Bild 2 ein Tipp auf die Fläche springen zum Abgang; bei `prefers-reduced-motion` steht nur die Marke 0,14 s (0,3 s gesamt). Das Intro liegt in einem `aria-hidden`-Container; der Fokus bleibt auf der Seite.

**Begründung.** Entscheidung Jannes am 2026-10-05 nach dem Entwurf auf der Leinwand (Varianten: nur am Handy, nur beim Kaltstart). `sessionStorage` statt `localStorage`: Der Wert gehört zum Tab, nicht zum Gerät, und trägt keinen Inhalt — ANN-019 (kein klinischer Inhalt im Browserspeicher) bleibt gewahrt. Ohne verfügbaren Speicher (privates Fenster, gesperrter Speicher) gilt „noch nicht gezeigt“: ein Intro zu viel ist kein Schaden, ein Fehler beim Start wäre einer. Unsicher: ob 1,8 s am Praxisrechner nach der dritten Anmeldung des Tages noch erwünscht sind — dann greift der Änderungspfad.

**Anker.** `src/lib/startbildMerker.ts` (`startbildFaellig`, `startbildVormerken`, `startbildZuruecksetzen`); `AuthenticatedApp` in `src/app/App.tsx`; `raeumen` in `src/features/auth/SessionProvider.tsx`; Baustein `src/app/Startbild.tsx` mit `src/app/startbildGeometrie.ts`; Tests `startbildMerker.test.ts`, `Startbild.test.tsx`, `tests/e2e/startbild.spec.ts`; Prüfseite `tests/e2e/fixtures/startbild.html`.

**Änderungspfad.** Nur beim Kaltstart (nicht nach jeder Anmeldung): `startbildZuruecksetzen()` aus `raeumen` herausnehmen · Aufwand `klein`. Nur am Telefon: in `AuthenticatedApp` zusätzlich `window.innerWidth < 640` prüfen · Aufwand `klein`. Ganz abschalten: den Baustein in `AuthenticatedApp` nicht mehr zeichnen · Aufwand `klein`.

### ANN-244 — Tableiste nach Reife: ein Bereich, der ganz Vorschau ist, bekommt keinen Platz in der Tableiste

Praxisprozess · entschieden (Jannes) · 2026-10-06 · Jannes (BEF-049, Option 2, 05.10.2026) · erledigt · Wiedervorlage: Jannes in der Sichtung (Rahmen)

**Annahme.** Die Tableiste unter 640 px zeigt die ersten **vier** Bereiche, die **nicht** ganz Vorschau sind, in Seitenleisten-Reihenfolge, dazu „Mehr“; hinter „Mehr“ stehen alle übrigen Bereiche, die Vorschau eingeschlossen, in derselben Reihenfolge, und „Alle Bereiche“. Ganz Vorschau ist heute allein die Kommunikation (`vorschau: true` am Arbeitsbereich). therapist und team_lead sehen damit Übersicht, Kalender, Patienten, Organisation, Mehr; owner und office Übersicht, Kalender, Patienten, **Training**, Mehr — Training ist ein echter Bereich und steht in der Seitenleiste vor Abrechnung; der Handoff nannte für owner und office „Abrechnung“, weil er Training nicht mitzählte. Nur wenn alle Bereiche ohne „Mehr“ passen und keiner Vorschau ist (Patienten-, Trainingskonto), bleibt die Leiste, wie sie ist. Seitenleiste und `/bereiche` zeigen weiter alle Bereiche an ihrem Platz; es entsteht keine neue Vorschau-Kennzeichnung (Festlegung vom 2026-09-22).

**Begründung.** BEF-049: Für therapist und team_lead lag „Nachrichten“ (ein Chat ohne Versand) in der Leiste und der Weg zu Mitarbeitenden und Arbeitszeiten hinter „Mehr“. Die Regel „Reife vor Reihenfolge“ ist die Entscheidung; die Reihenfolge der Seitenleiste hat Jannes am 2026-09-12 festgelegt, und diese Annahme ändert sie nicht. Unsicher: ob owner am Telefon Abrechnung statt Training im vierten Platz will — das wäre eine Änderung der Reihenfolge, nicht der Regel.

**Anker.** `vorschau` am `Arbeitsbereich` und `tableiste` in `src/app/navigation.tsx`; Tests `navigation.test.tsx` („tableiste (BEF-049 …)“), `AppShell.test.tsx` („stellt die Kommunikation am Telefon hinter „Mehr“ …“).

**Änderungspfad.** Abrechnung vor Training am Telefon: Reihenfolge in `arbeitsbereiche` ändern (gilt dann auch in der Seitenleiste) · Aufwand `klein`. Vorschau wieder in der Leiste: `vorschau: true` an der Kommunikation entfernen · Aufwand `klein`.

### ANN-245 — Tab-Titel fest je Route: „Seitenart – Own Motion“, nie ein Name

Datenschutz · entschieden (Jannes) · 2026-10-06 · Jannes (BEF-050, Option 1, 05.10.2026) · erledigt · Wiedervorlage: Jannes in der Sichtung (Rahmen)

**Annahme.** Jeder Browser-Tab trägt einen festen Titel je Route aus der Tabelle in `src/app/tabtitel.ts` („Übersicht – Own Motion“, „Kalender – …“, „Patient:innen – …“, „Akte – …“ für alle Seiten einer Akte und die Formulare, „Termin – …“, „Dokumentation – …“ für Schreibseite und Abschluss, „Warteliste – …“, „Verordner:innen – …“, „Abrechnung – …“, „Rechnung – …“ für Rechnung, Blatt, Storno und Erinnerung, „Statistiken – …“, „Organisatorisches – …“ für `/praxis` und `/betrieb`, „Kommunikation – …“, „Training – …“, „Mein Konto – …“, „Alle Bereiche – …“, „Vorschau-Protokoll – …“); Anmeldemaske und Vollseiten heißen „Anmelden – Own Motion“; wo keine Regel greift (Plattformoberfläche `/p`), bleibt „Own Motion“. Der Titel wird beim Seitenwechsel im Rahmen gesetzt, mit dem Fokus auf dem Inhalt (NAV-09), damit Vorlesesoftware ihn ansagt. **Nie** aus dem Seitentitel abgeleitet, nie ein Name, eine Kennung oder klinischer Inhalt: Tab-Titel landen in Verlauf, Lesezeichen, Fensterlisten und der Browser-Synchronisation (ADR-011, ADR-013 Punkt 9).

**Begründung.** BEF-050: Alle Tabs hießen „Own Motion“. Option 3 (mit Namen) ist ein externer Datenfluss, den ADR-013 Punkt 9 für die Adresszeile schon ausschließt. Die Titel „Vorschau-Protokoll“ und „Übersicht“ für `/offen` ergänzen die Tabelle des Handoffs, weil diese Routen dort fehlten. Unsicher: ob „Akte“ als Titel aller Aktenseiten im Büro mit vier offenen Akten reicht — mehr darf der Tab nach dieser Annahme nicht sagen.

**Anker.** `src/app/tabtitel.ts` (Tabelle `REGELN`, `tabTitel`); `useSeitenwechsel` in `src/app/seitenwechsel.ts`; `Vollseite.tsx`; Tests `tabtitel.test.ts` (darunter „trägt nie Daten“), `AppShell.test.tsx`, `Vollseite.test.tsx`.

**Änderungspfad.** Andere Wörter oder mehr Stufen („Rechnungen – Abrechnung – Own Motion“): nur die Tabelle `REGELN` und `TAB_NAMEN` · Aufwand `klein`. Ein Titel mit Daten ist kein Änderungspfad, sondern eine ADR-Frage.

### ANN-246 — Terminwunsch als eigener Datensatz: offen, erledigt, nicht möglich, zurückgezogen; kein neuer Terminzustand; ein Jahr nach Abschluss gelöscht

Praxisprozess · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · erledigt · Wiedervorlage: Jannes in der Sichtung (Plattform, Schritte 13 bis 15)

**Annahme.** Ein Terminwunsch von der Plattform (neuer Termin, Änderung, Absage) ist ein eigener Datensatz `platform_appointment_requests` mit bis zu 14 Wunschtagen, Tageszeiten Vormittag/Mittag/Nachmittag und einer freiwilligen Notiz bis 500 Zeichen; die Zustände sind `open`, `done`, `declined`, `withdrawn`. Er erzeugt keinen Termin und keinen Terminzustand – ADR-018 kennt `requested`/`tentative`, beide bleiben ungebaut; erst die Praxis legt einen Termin an, bestätigt ihn und schließt den Wunsch mit „erledigt“ oder „nicht möglich“ (Antwort bis 300 Zeichen). Je Termin ist nur ein offener Änderungs- oder Absagewunsch möglich. Die Person kann einen offenen Wunsch zurückziehen. Datenklasse `terminwunsch` (Aufbewahrung: ein Jahr nach Abschluss des Wunsches, `apply_retention`), keine Protokollierung (ADR-010 Fassung 3: der Datensatz trägt Urheber, Zeitpunkt und Ausgang selbst).

**Begründung.** DSN-001 D4 und PROJECT_PRINCIPLES.md 8.2: Die Plattform bietet eine Anfrage, keinen Kalenderzugriff; ein vereinbarter Termin entsteht nur durch die Praxis. Ein eigener Datensatz hält den Kalender frei von unbestätigten Einträgen und macht den Wunsch mit Urheber (Person, Begleitung, Vertretung) nachvollziehbar. 14 Tage sind der Horizont, in dem eine Praxis realistisch Termine vergibt; längere Wünsche gehören in die Notiz. Ein Jahr ist die kürzeste Frist, mit der ein Wunsch für Rückfragen zum Ausfallhonorar (Absagewunsch, ANN-247) erhalten bleibt. Unsicher: ob die Praxis einen Wunsch lieber an den angelegten Termin heften möchte (`resulting_appointment_id` ist dafür da, aber die Oberfläche fragt nicht danach).

**Anker.** `supabase/migrations/20261010110000_por_009_platform_appointment_requests.sql` (Tabelle, `request_platform_appointment`, `platform_appointment_requests`, `withdraw_platform_appointment_request`, Klasse `terminwunsch` in `apply_retention`); `WUNSCHTAGE` in `src/features/platform/Wunschfelder.tsx`; `terminwunsch` in `src/features/retention/klassen.ts`; Tests `supabase/tests/platform-appointment-requests.test.ts`, `retention-run.test.ts`, `Terminwunsch.test.tsx`.

**Änderungspfad.** Anderer Horizont: `WUNSCHTAGE` und der Check `cardinality(preferred_days) <= 14` in einer neuen Migration · Aufwand `klein`. Längere oder kürzere Frist: die Regel `terminwunsch` in `apply_retention` · Aufwand `klein`. Wunsch als Terminzustand `requested`: eigenes Epic mit ADR-018-Änderung · Aufwand `groß`.

### ANN-247 — Absagewunsch über die Plattform: Eingang ist die Wunschzeit, die Frist rechnet der Server, der Hinweis zum Ausfallhonorar hat einen Wortlaut

Recht · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · Prüfpaket · Wiedervorlage: Datenschutz- und Rechtsberatung vor echten Daten (Prüfpaket); Jannes in der Sichtung

**Annahme.** Trägt die Praxis eine Absage aus einem Absagewunsch ein (`cancel_appointment_from_request`), gilt als Eingang der Absage der Zeitpunkt, zu dem die Person den Wunsch abgeschickt hat – nicht der Zeitpunkt, an dem die Praxis ihn bearbeitet (DSN-001 D4). Ob eine Absage „zu spät“ ist, rechnet allein der Server mit `app.cancellation_notice_period()` (24 Stunden, ADR-018 Punkt 8) und liefert es als `late_notice` an die Plattform; die Oberfläche zeigt davor den Hinweis in einem Wortlaut, der auch in der Patienteninformation steht (`AUSFALLHONORAR_REGEL`, `AUSFALLHONORAR_SPAET`, `AUSFALLHONORAR_RECHTZEITIG`). Die Plattform entscheidet nicht über das Honorar; Grund `patient_request`, Verzicht und Erfassung bleiben bei der Praxis (ABN-EPIC-001). Der Eingang wird für `cancel_appointment` in Datum und Uhrzeit der Praxiszeitzone übersetzt; in der doppelten Stunde der Zeitumstellung kann er dadurch um eine Stunde verrutschen (Zweitreview, hingenommen).

**Begründung.** Wer rechtzeitig absagt, darf nicht dafür zahlen, dass das Büro den Wunsch erst am nächsten Morgen liest – das ist der Sinn eines Absagewegs rund um die Uhr (PROJECT_PRINCIPLES.md 4.6). Ein Hinweis vor dem Abschicken ist Transparenzpflicht gegenüber der Person (§ 630c BGB sinngemäß, AGB-Recht); er muss mit dem Wortlaut übereinstimmen, den die Person bei der Aufnahme gelesen hat, sonst widerspricht sich die Praxis. Unsicher: ob eine Absage über die Plattform rechtlich als „Zugang“ beim Praxisinhaber gilt, bevor jemand sie liest (§ 130 BGB: Zugang bei Abrufbarkeit unter gewöhnlichen Umständen – spricht dafür), und ob die Frist am Wochenende anders gelten müsste.

**Anker.** `supabase/migrations/20261010130000_por_011_practice_requests.sql` (`cancel_appointment_from_request`: `received_on`/`received_at` aus `created_at` des Wunsches); `late_notice` in `20261010120000_por_010_platform_appointment_change.sql`; `src/lib/ausfallhonorar.ts` (ein Wortlaut für Plattform und `src/features/datenschutz/patienteninformation.ts`); Tests `supabase/tests/platform-requests-practice.test.ts` („D4“), `platform-appointment-change.test.ts`, `Terminaenderung.test.tsx`, `PlatformRequests.test.tsx`.

**Änderungspfad.** Eingang = Bearbeitungszeit: in `cancel_appointment_from_request` `now()` statt `created_at` · Aufwand `klein`. Anderer Wortlaut: nur `src/lib/ausfallhonorar.ts` · Aufwand `klein`. Frist mit Wochenendregel: `app.cancellation_notice_period` / `app.is_late_cancellation` (ADR-018-Änderung) · Aufwand `mittel`.

### ANN-248 — Befundbogen vorab: nur die Person selbst oder die rechtliche Vertretung, nur Instrumente mit `ausgefuellt_von: patient`, Absenden heißt abgeschlossen mit Herkunft `platform`

Datenschutz · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · Prüfpaket · Wiedervorlage: Datenschutzprüfung (Prüfpaket); Jannes in der Sichtung

**Annahme.** Über die Plattform füllt eine Person einen Befundbogen vorab aus, wenn ihr Zugang das Recht `questionnaire` hat: die Person selbst und eine rechtliche Vertretung, nie eine Begleitung. Angeboten werden nur aktive Instrumente, deren Definition `ausgefuellt_von: 'patient'` trägt (heute der Anamnesebogen); die Erhebung trägt `source = 'platform'` und `source_access_id`. Ein Entwurf bleibt speicherbar; **Absenden schließt die Erhebung ab** – danach kann die Person sie weder ändern noch löschen, die Praxis sieht sie in der Akte mit dem Vermerk „Über die Plattform ausgefüllt“. Die Plattform sieht nur ihre eigenen Erhebungen (`source = 'platform'`), nie die der Praxis. Die Prüfung gegen die Definition läuft dieselbe wie in der Praxis (ANN-219); Auswertungen (Scores) rechnet weiter nur die Praxisseite.

**Begründung.** DSN-001 4.1: „Befundbogen vorab, etwa 10 Minuten“. Eine Begleitung liest mit und schreibt Terminwünsche, aber Angaben zur eigenen Gesundheit macht die Person selbst (ADR-023 Punkt 19, ANN-206). Herkunft am Datensatz statt im Protokoll (ADR-010 Fassung 3). Abschluss beim Absenden, weil eine Erhebung, die die Person nachträglich ändern kann, für die Therapeut:in keine verlässliche Grundlage ist; wer sich vertippt hat, sagt es beim Termin (Dokumentationsgrundsatz wie ANN-119). Unsicher: ob die Vorabangaben eine eigene Information nach Art. 13 DSGVO brauchen (die Patienteninformation nennt die Plattform bereits).

**Anker.** `supabase/migrations/20261010140000_por_012_platform_questionnaire.sql` (`source`, `source_access_id`, Recht `questionnaire` in `app.platform_access_allows`, `app.platform_questionnaire_instrument`, `platform_questionnaire`, `save_platform_questionnaire_response`, `complete_platform_questionnaire_response`, `discard_platform_questionnaire_response`); `fuerDiePlattform` in `src/features/platform/instrumentwahl.ts`; Vermerk in `src/features/assessments/PatientBefundPage.tsx`; Tests `supabase/tests/platform-questionnaire.test.ts`, `Befundbogen.test.tsx`, `PatientBefundPage.test.tsx`.

**Änderungspfad.** Auch für Begleitungen: `questionnaire` in `app.platform_access_allows` zur Gruppe `request` · Aufwand `klein`. Änderbar nach dem Absenden: `complete_platform_questionnaire_response` setzt `entwurf` statt `abgeschlossen`, Akte zeigt den Stand · Aufwand `mittel`. Weitere Instrumente: `ausgefuellt_von: 'patient'` in der Definition, keine Codeänderung · Aufwand `klein`.

### ANN-249 — Freigegebene Dokumente: Freigabe einzeln am Datensatz durch owner, Therapeut:in oder Teamleitung; nie Fotos; Abruf über die Plattform protokolliert als `patient_file.downloaded`

Datenschutz · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · Änderung BEF-138 · Wiedervorlage: Datenschutzprüfung (Prüfpaket); Jannes in der Sichtung

**Annahme.** Eine Datei der Akte erscheint auf der Plattform erst, wenn die Praxis sie **einzeln** freigibt (`released_at`, `released_by`); das dürfen die Rollen, die klinische Dateien schreiben (`app.can_write_clinical_patient_files`: owner, therapist, team_lead), nicht das Büro. Patientenfotos und Dokumentationsfotos sind nie freigebbar (Constraint). Die Freigabe ist jederzeit widerrufbar; danach ist auch ein ausgegebener Verweis wertlos, weil der Lesepfad der Ablage (`app.may_read_patient_file_object`) die Freigabe beim Abruf prüft. Die Plattform zeigt Bilder in der Anwendung und gibt PDFs auf das Gerät; jeder Abruf über die Plattform wird als bestehende Aktion `patient_file.downloaded` mit `actor_kind = platform` bzw. `representative` protokolliert – keine neue Auditaktion. Im Training gibt es keine Dokumente. Rechte: `read` des Zugangs (Begleitung liest mit).

**Begründung.** DSN-001 D3: „freigegebene Dokumente“, nicht die Akte. Freigabe statt Übergabe-Kopie, weil das Original in der Ablage bleibt (ADR-017 Punkt 10) und der Widerruf sonst wirkungslos wäre. Fotos ausgeschlossen, weil ihre Einwilligung einen anderen Zweck hat (ADR-017 Fassung 3, ANN-216) und ein Foto ohne Kontext der Person nicht hilft. `patient_file.downloaded` steht schon im Katalog; die Plattform ist nur ein weiterer Akteur (ADR-010 Fassung 3, ADR-023 Punkt 24). Unsicher: ob ein Arztbrief Dritter (der Ärzt:in) ohne Weiteres an die Person herausgegeben werden darf – § 630g BGB gibt der Person Einsicht in die vollständige Akte, spricht dafür.

**Anker.** `supabase/migrations/20261010160000_por_014_platform_files.sql` (`released_at`/`released_by`, Constraints `patient_files_release_stamp`, `patient_files_release_not_photo`, `set_patient_file_release`, `platform_files`, `issue_platform_file_link`, Plattformzweig in `app.may_read_patient_file_object`); `setzeFreigabe` in `src/features/files/api.ts`; `darfFreigeben`/`istFoto` in `Dateiliste.tsx`; `ladeDokumentHerunter`/`ladeDokumentZumAnzeigen` in `src/features/platform/api.ts`; Tests `supabase/tests/platform-files.test.ts`, `Dateiliste.test.tsx`, `Dokumente.test.tsx`.

**Änderungspfad.** Büro darf freigeben: Rollenprüfung in `set_patient_file_release` · Aufwand `klein`. Freigabe je Dokumentart statt je Datei: eigene Regel in `platform_files` · Aufwand `mittel`. Ohne Protokoll des Abrufs: `issue_platform_file_link` ohne Audit-Insert – nur mit ADR-010-Änderung · Aufwand `klein`.

**Abnahme (Jannes, 2026-10-09).** geändert: Der Abruf eines freigegebenen Dokuments über die Plattform wird nicht protokolliert. Braucht neue Fassungen von ADR-023 Punkt 24, ADR-010 und PROJECT_PRINCIPLES §4 und das Label `freigabe-audit`. Umsetzung: BEF-138. **Umgesetzt (BEF-138, 2026-10-10):** ADR-010 Fassung 4 Punkt 22, ADR-023 Fassung 3 Punkt 24, Prinzipien 0.23; `issue_platform_file_link` schreibt keinen Eintrag `patient_file.downloaded` mehr, eine Vertretung liest damit höchstens einmal am Tag (`platform_representation.read`), Migration `supabase/migrations/20261022100000_bef_138_platform_file_retrieval.sql`, Test `supabase/tests/platform-files.test.ts`.

### ANN-250 — Eigene Rechnungen auf der Plattform: nur ausgestellte, als Snapshot der Praxis, mit Zahlungsstand und Storno-Kette; Recht `billing`

Datenschutz · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · Prüfpaket · Wiedervorlage: Datenschutzprüfung (Prüfpaket); Jannes in der Sichtung

**Annahme.** Die Plattform zeigt Rechnungen des eigenen Verhältnisses, sobald sie **ausgestellt** sind – nie Entwürfe –, als dasselbe Blatt, das die Praxis druckt (Snapshot, ADR-009 Punkt 10), dazu den vom Server gerechneten Zahlungsstand (bezahlt, teilweise, offen, überfällig, storniert) und die Nummern von Storno, Vorgänger und Korrekturrechnung. Auch Rechnungen an einen anderen Adressaten (Beihilfestelle, Angehörige) sieht die behandelte Person – mit dem Adressaten aus dem Snapshot –, weil es ihre Behandlung ist (ADR-023 Punkt 16); der Adressat selbst hat keinen Zugang. Recht `billing` (ABN-010): die Person selbst, eine Begleitung nur mit dem Häkchen „Rechnungen und Zahlungen sind sichtbar“, eine Vertretung mit Vermögenssorge. Steuernummer und Bankverbindung der Praxis stehen mit auf dem Blatt, ebenso Geburtsdatum und Behandlungsgrundlage mit Diagnose, wie auf dem Druck der Praxis – eine Beihilfe verlangt beides (Zweitreview). Keine Zahlfunktion.

**Begründung.** DSN-001 D3: eigene Rechnungen ohne eigenen Schritt. Der Snapshot ist der Beleg, den die Person auch auf Papier bekäme – eine zweite Darstellung widerspräche ADR-009 Punkt 12 (Beträge nur vom Server). Entwürfe sind interne Arbeit der Praxis. Zahlungsstand aus denselben Funktionen wie die Praxisseite (`app.invoice_paid_cents`, `app.invoice_payment_state`), damit die Person nichts anderes liest als das Büro. Unsicher: ob eine Beihilferechnung die Person verwirrt, wenn sie nicht zahlen soll – die Zeile „an Beihilfestelle“ sagt es, erklärt es aber nicht.

**Anker.** `supabase/migrations/20261010150000_por_013_platform_invoices.sql` (`platform_invoices`, `platform_invoice`); `zahlungsstand`, `anJemandAnderen`, `positionen` in `src/features/platform/zahlungsstand.ts`; Tests `supabase/tests/platform-invoices.test.ts`, `Rechnungen.test.tsx`.

**Änderungspfad.** Rechnung nur für den Adressaten: Filter `recipient.kind = 'self'` in beiden Funktionen · Aufwand `klein`. Ohne Diagnose oder Geburtsdatum auf der Plattform: die Schlüssel in `platform_invoice` aus `document` entfernen (`- 'treatment_bases'`) · Aufwand `klein`. Ohne Bankverbindung auf der Plattform: Schlüssel aus `document` in `platform_invoice` entfernen · Aufwand `klein`. Online bezahlen: eigenes Epic nach Anbieterprüfung (ADR-002) · Aufwand `groß`.

### ANN-251 — Eigene Termine auf der Plattform: künftige und die der letzten zwölf Monate, feste Spaltenliste ohne Dokumentation

Datenschutz · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · Prüfpaket · Wiedervorlage: Datenschutzprüfung (Prüfpaket); Jannes in der Sichtung

**Annahme.** Die Projektion `platform_appointments` liefert die Termine des eigenen Verhältnisses: alle künftigen und die vergangenen der letzten zwölf Monate (`app.platform_appointment_history()`), mit Beginn, Ende, Terminart, Zustand in den Worten der Person (bestätigt, durchgeführt, nicht erschienen, abgesagt), Name der behandelnden Person, Standort bzw. Besuchsadresse, Fristkennzeichen und offenem Wunsch – und nichts aus der Dokumentation, kein Honorar, keine Notiz der Praxis (feste Spaltenliste, ADR-023 Punkt 22). Dokumentierte und abgerechnete Termine erscheinen als „durchgeführt“ bzw. „nicht erschienen“ nach `fee_basis`; interne Termine und Fehlzeiten nie. Über eine Vertretung ist das Lesen protokolliert (Punkt 24), das eigene nicht.

**Begründung.** DSN-001 4.1 und D3: „nächster Termin“, „alle Termine“. Zwölf Monate decken eine Verordnungsserie und die Rückfrage zur letzten Rechnung ab; ältere Termine stehen auf den Rechnungen (ANN-250). Zustände werden übersetzt, weil `documented`/`invoiced` Begriffe der Praxis sind, die Person aber wissen will, ob der Termin stattgefunden hat. Datensparsamkeit (PROJECT_PRINCIPLES.md 3.2): Was die Person nicht braucht, verlässt den Server nicht. Unsicher: ob zwölf Monate zu kurz sind, wenn eine Behandlung pausiert und wieder aufgenommen wird.

**Anker.** `supabase/migrations/20261010100000_por_008_platform_appointments.sql` (`app.platform_appointment_history`, `platform_appointments`; neu gefasst in `20261010120000_por_010_platform_appointment_change.sql`); `terminBeschreibung` in `src/features/platform/terminbeschreibung.ts`; Tests `supabase/tests/platform-appointments.test.ts` (Spaltenliste, Fremdzugriff), `Termine.test.tsx`.

**Änderungspfad.** Anderer Zeitraum: `app.platform_appointment_history` in einer neuen Migration · Aufwand `klein`. Weitere Spalten (etwa das Honorar): Spaltenliste in `platform_appointments` und Test der Datensparsamkeit · Aufwand `klein`, vorher ADR-023 Punkt 22 prüfen.

### ANN-252 — Schrift und Knöpfe nach Runde 2: nichts unter 12 px außer der Absenderzeile, Kleingedrucktes 14 px, gesperrt heißt gestrichelt

Praxisprozess · entschieden (Jannes) · 2026-10-06 · Jannes (Leinwand, Reihe 5) · erledigt · Wiedervorlage: —

**Annahme.** Kein Lesetext unter 12 px; die Tableiste steht in 12 px ohne seitlichen Innenabstand (statt 11 px, Variante L-B), die Symbolspalte ebenso. Kleingedrucktes am Seitenende hat 14 px über den Baustein `Kleingedrucktes` (Variante K-A). Ein gesperrter Haupt- oder Sekundärknopf zeigt eine gestrichelte Kontur in `line-strong` ohne Fläche, der leise Knopf nur leisen Text (Variante B). Einzige Schrift unter 12 px ist die Absenderzeile auf Papier (`--text-absenderzeile`); Haken und Kreuz im Zeitstrahl sind gezeichnet.

**Begründung.** BEF-068 Option 2 und BEF-069 Option 1 (Jannes 2026-10-05), Varianten auf der Leinwand am 2026-10-06 gewählt. Gemessen: „Organisation“ in 12/600 ist 69 px breit, bei 360 px hat jedes Ziel 72 px (vorher mit 11 px und Innenabstand 0,8 px Luft). Gestrichelt statt durchgezogen, weil ein gesperrter Hauptknopf neben einem aktiven Sekundärknopf sonst fast gleich aussah. Handoff `docs/design/handoff-2026-10-06-schrift-und-knoepfe.md`.

**Anker.** `--text-leiste`, `--text-kleingedruckt`, `--text-absenderzeile` in `src/index.css`; die Varianten in `src/components/ui/buttonStile.ts`; Wächter „Kein Lesetext unter 12 px“ in `src/designsystem.test.ts`; E2E `tests/e2e/tableiste.spec.ts`.

**Änderungspfad.** Andere Größe: das Token ändern · Aufwand `klein`. Gesperrt anders zeigen: die drei Varianten in `buttonStile.ts` · Aufwand `klein`.

### ANN-253 — Grundton B: weiße Fläche, neutrale Grautöne, sichtbare Spur der Balken

Praxisprozess · entschieden (Jannes) · 2026-10-06 · Jannes (Leinwand, Reihe 7) · erledigt · Wiedervorlage: —

**Annahme.** Die Seitenfläche ist Weiß wie Papier; die Vertiefung (Hover, Rückfrage, Arbeitszeit im Kalender) ist #f4f5f7; Tinte, Leise und beide Linien sind neutral ohne Grünstich (#14181b, #5a6169, #e6e8eb, #767c84). Die leere Spur von Wegbalken und Fortschrittsbalken trägt `--color-spur` (#8c939b) mit mindestens 3:1. Hauptfarbe, Tiefgrün der Seitenleiste, Salbei hell für „erledigt“, Warnung und Fehler bleiben. Manifest und Startbild beginnen auf Weiß.

**Begründung.** Jannes am 2026-10-06: Der Hintergrund sei zu grau-grünlich, „das Ganze sieht etwas öko aus“, die leere Spur des Fahrzeit-Balkens war nicht zu sehen (gemessen 1,01:1). Von drei Varianten (Hellgrau, Weiß, gebrochenes Weiß) gewählt: B. Leitfaden `docs/design/leitfaden-schlank.md`, L4 und L5. Unsicher: ob Karten mit der hellen Linie auf Weiß am Handy in der Sonne genug abgrenzen; das prüft die Sichtung.

**Anker.** `--color-canvas`, `--color-surface-sunken`, `--color-ink`, `--color-ink-muted`, `--color-line`, `--color-line-strong`, `--color-spur` in `src/index.css`; Kontrastpaare in `src/lib/kontrast.test.ts`; `public/manifest.webmanifest`.

**Änderungspfad.** Anderer Grundton: die Tokens ändern, `kontrast.test.ts` rechnet nach · Aufwand `klein`.

### ANN-254 — Tour am Handy: Liste vor Karte, Felder hinter „ändern"; ab 1024 px zwei Spalten

Praxisprozess · entschieden (Jannes) · 2026-10-06 · Jannes (Leinwand, Reihe 6, Runde 3 „alles A") · erledigt · Wiedervorlage: —

**Annahme.** Unter 640 px zeigt die Tour oben eine Zeile „Name · Tag" mit „Start und Ende: …" und dem Textknopf „ändern", der Person, Tag, Start und Ende aufklappt; danach Summe, „Navigation: ganzer Tag" über die ganze Breite, die Stopps, „Tourenliste drucken" und zuletzt die zugeklappte Karte. Zwischen 640 und 1023 px stehen die vier Felder offen in einer Zeile und die Karte zugeklappt über der Liste; ab 1024 px links die Liste, rechts die Karte offen und beim Rollen oben stehend. Im Dokument steht die Liste immer vor der Karte.

**Begründung.** BEF-054: Am Handy kamen zuerst Filter und Karte, die Liste - wofür man die Tour öffnet - erst nach zwei Bildschirmen. Variante A der Runde 3, gewählt von Jannes. Unsicher: ob die Karte am Tablet über oder unter der Liste besser steht.

**Anker.** Felder `tour-felder`, `felderOffen` und das Raster der zwei Spalten in `src/features/tours/TourenPage.tsx`; Kopfzeile aus `src/features/tours/tourKopf.ts`.

**Änderungspfad.** Karte am Tablet unter die Liste: `sm:order-first` am Kartenbereich streichen · Aufwand `klein`. Felder auch am Handy offen: `felderOffen` mit `true` beginnen · Aufwand `klein`.

### ANN-255 — Der Gesten-Hinweis im Kalender steht bis zur ersten Spanne; der Merker ist ein Wahrheitswert in `localStorage`

Technik · entschieden (Claude) · 2026-10-06 · Claude (Runde 3, Handoff Kalender und Tour) · erledigt · Wiedervorlage: Jannes in der Sichtung Rahmen am Handy

**Annahme.** „Zweites Feld antippen: Spanne bis dorthin. Dasselbe Feld: aufheben." steht in der Anlegen-Leiste, bis auf diesem Gerät zum ersten Mal eine Spanne aufgezogen wurde. Gemerkt wird das als `kalender-spanne-gelernt = 1` in `localStorage`; ohne Speicher steht der Hinweis weiter. Beim Abmelden bleibt der Merker.

**Begründung.** Der Handoff verlangt den Hinweis nur bis zum ersten Lernen. `localStorage` statt `sessionStorage`, weil eine gelernte Geste in einem neuen Tab nicht wieder erklärt werden muss. Der Wert trägt keinen Inhalt über Person, Praxis oder Akte (ANN-019 bleibt gewahrt); er ist wie der Startbild-Merker (ANN-243) ein reiner Bedienzustand. Unsicher: ob ein geteiltes Praxisgerät den Hinweis für eine neue Kollegin wieder zeigen sollte.

**Anker.** `GESTEN_MERKER`, `spanneGelernt` und `spanneMerken` in `src/features/appointments/gestenMerker.ts`, gelesen in `src/features/appointments/AnlegenMenue.tsx`.

**Änderungspfad.** Je Sitzung neu: `localStorage` durch `sessionStorage` ersetzen · Aufwand `klein`. Beim Abmelden löschen: den Merker in `raeumen` des `SessionProvider` entfernen wie den Startbild-Merker · Aufwand `klein`.

### ANN-256 — Sitzungssperre im Server: letzte Anmeldung aus `amr`, letzte Bedienung als Vermerk je Sitzung, höchstens einmal je Minute

Datenschutz · entschieden (Claude) · 2026-10-06 · Claude (SEC-EPIC-001, ADR-025 W1 und W2; Auftrag Jannes „nach 30/60 min automatisch ausloggen“) · erledigt · Wiedervorlage: Datenschutzprüfung vor dem Go-live (M3)

**Annahme.** Die Datenbank sperrt jede Anfrage einer Sitzung, deren letzte Anmeldung (jüngster Zeitstempel im Claim `amr`) 60 Minuten oder deren letzte Bedienung 30 Minuten zurückliegt (W1 (a), Jannes). Die letzte Bedienung ist ein Vermerk je `session_id` in `public.session_activity` (W2 (a)): Konto und Zeitpunkt, kein Inhalt, keine Seite. Die Anwendung schreibt ihn bei einem Tipp, Klick oder Tastendruck höchstens einmal je Minute über `session_status(true)`; eine gesperrte Sitzung bekommt keinen Vermerk mehr. Ein Token ohne `amr` oder `session_id` gilt als gesperrt. Datenklasse `sitzungsvermerk`: ein Tag nach der letzten Bedienung, die Löschung macht `session_status` selbst; fällt mit dem Konto.

**Begründung.** ADR-025 Punkt 6 verlangt die Prüfung an einer Stelle in der Datenbank; sie steht in `app.session_open()` und hängt an den vier Funktionen, über die jede Policy, Projektion und RPC liest (`current_organization_id`, `current_person_id`, `has_any_role`, `platform_readable_access`). W2 (b), die Token-Erneuerung, misst Netzwerkverkehr statt Bedienung. Einmal je Minute hält die Schreiblast klein; die Oberfläche rechnet ihre Frist ab dem letzten Vermerk und sperrt deshalb höchstens eine Minute früher als nach der letzten Bedienung, nie später als der Server. Ein Tag Aufbewahrung: Nach 60 Minuten ist die Sitzung ohnehin gesperrt, der Rest ist Spielraum. Unsicher: ob die Datenschutzprüfung den Vermerk als Leistungs- oder Verhaltenskontrolle (§20) sehen könnte — er steht nur dem Server zur Verfügung, kein Konto kann ihn lesen, und er wird nach einem Tag gelöscht.

**Anker.** `app.session_open()`, `app.session_max_duration()`, `app.session_idle_timeout()` und `public.session_status` in `supabase/migrations/20261012100000_sec_001_sitzungssperre.sql`; geprüft in `supabase/tests/sitzungssperre.test.ts`.

**Änderungspfad.** Andere Fristen: die beiden Konstanten-Funktionen und `SPERRFRISTEN` in der Oberfläche ändern · Aufwand `klein`. Je Kontoart verschieden (W1 (c)): `app.session_idle_timeout()` nach `user_profiles` unterscheiden · Aufwand `klein`. Ohne Vermerk (W2 (b)): `session_activity` entfernen und die Inaktivität aus `iat` lesen · Aufwand `mittel`.

### ANN-257 — Sitzungssperre der Oberfläche: Vorlauf 20 Sekunden, Seite mit ungesichertem Text bleibt verborgen stehen, Freigabe mit Kennwort

Technik · entschieden (Claude) · 2026-10-06 · Claude (SEC-EPIC-001, ADR-025 Punkte 3, 4, 5 und 7) · erledigt · Wiedervorlage: Jannes in der Sichtung Betriebsreife; W3 (Passkey) mit OPS-001

**Annahme.** Die Oberfläche sperrt 20 Sekunden vor der früheren Frist, die der Server meldet; in dieser Zeit sichert sie offene Texte als Entwurf auf dem Weg von „Speichern“ (ANN-046), höchstens 10 Sekunden lang. Gelingt das für alle Seiten, gibt sie die Seiten frei und leert den Abfragespeicher. Gelingt es für eine nicht (kein Netz, kein Entwurfsweg wie bei Korrektur oder Formularen, ein ausstehendes Foto), bleibt die angemeldete Anwendung **verborgen und unbedienbar** (`hidden`, `inert`) im Speicher der Seite stehen, und nach der Freigabe steht sie mit dem Text wieder da; dann werden alle Abfragen neu geholt. Bei Rückkehr mit abgelaufener Frist verschwindet der Inhalt sofort, noch vor der Antwort des Servers. Freigegeben wird mit dem Kennwort des eigenen Kontos (neue Anmeldung, dieselbe Kennung, kein Kontowechsel); „Mit anderem Konto anmelden“ meldet ab. Ein Passkey (W3) ist nicht gebaut.

**Begründung.** ADR-025 Punkt 4 verlangt beides: sichern, und wenn das nicht gelingt, den Text im Speicher halten und nach der Freigabe zeigen. Ein Merker je Seite für den Text hieße, in jede der rund zwanzig geschützten Seiten einzugreifen; die verborgen stehende Seite hält ihn ohne Umbau. Der Preis: In diesem Fall bleiben die Daten dieser Seite bis zur Freigabe im Arbeitsspeicher, unsichtbar und nicht bedienbar; der Server gibt keine neue Zeile heraus. Der Vorlauf, weil ein Entwurf nur angenommen wird, solange der Server die Sitzung noch offen sieht. Kennwort ohne zweiten Faktor, weil die Anmeldung ihn heute auch nicht verlangt (ANN-028, bestätigt 2026-10-06). Passkeys stehen beim Anmeldedienst als Beta und brauchen Einstellungen im Dashboard (OPS-001); bis dahin genügt das Kennwort. `jwt_expiry` bleibt 3600 Sekunden: Die Sperre hängt nicht daran, sie liegt in der Datenbank. Unsicher: ob Jannes am Hausbesuch nach 60 Minuten das Kennwort tippen mag — dafür ist der Passkey gedacht.

**Anker.** `VORLAUF_MS`, `SICHERUNG_HOECHSTENS_MS` in `src/features/auth/sitzungssperre/sperrstand.ts`; Phasen `gesperrt` und `halten` in `src/features/auth/sitzungssperre/Sitzungssperre.tsx`; Freigabe in `Sperrseite.tsx`; Sicherungen über `useSperrsicherung` in `Textverlustschutz.tsx` und `Fotoverlustschutz.tsx`.

**Änderungspfad.** Ungesicherten Text verwerfen statt halten: in `sperren` immer `gesperrt` wählen · Aufwand `klein`. Passkey: hinter einem Schalter in `Sperrseite` `signInWithPasskey` anbieten, sobald OPS-001 ihn bestätigt · Aufwand `mittel`. Längerer Vorlauf: `VORLAUF_MS` · Aufwand `klein`.

**Nach dem Zweitreview (2026-10-06).** Behoben: ein zweiter Faktor zählt nicht als Anmeldung (nur `password`, `otp`, `magiclink`, `recovery`, `invite`, `email/signup`, `oauth`, `sso/saml`); Fenster und Kamera verschwinden mit der Seite; der Vorlauf sperrt, solange der Server offen ist; festgehaltene Seiten fallen bei einem Kontowechsel weg; beim Festhalten verlassen fremde Abfragen den Speicher. **Verbleibende Lücken, für OPS-001 und die Datenschutzprüfung:** (1) Wer ein gesperrtes Token aus dem Speicher des Geräts holt, kann beim Anmeldedienst das Kennwort ändern, solange die letzte Anmeldung jünger als 24 Stunden ist (`secure_password_change` greift erst danach) — dafür braucht es das entsperrte Gerät und Entwicklerwerkzeuge. (2) Die Server-Functions (`location-provider`, `patient-file-verify`) prüfen nur die Anmeldung, nicht die Sperre; sie liefern keine Patientendaten, lösen aber Routing oder Prüfungen aus. (3) „Bedienung“ meldet die Anwendung selbst; ein Skript mit dem Token könnte die Inaktivitätsfrist offen halten, nicht die Höchstdauer (Folge von W2 (a)).

### ANN-258 — Skala am Handy in zwei Reihen, Befund aus Bausteinen ohne Kasten im Kasten

Praxisprozess · entschieden (Claude) · 2026-10-06 · Claude (Design-Runde Dokumentation, BEF-057 Option 2 nach Entscheidung Jannes 2026-10-05; Auftrag Jannes „Design konsequent auf jeden Bereich anwenden“) · erledigt · Wiedervorlage: Jannes in der Sichtung Rahmen am Handy

**Annahme.** Eine Skala mit mehr als sechs Stufen steht unter 640 px in zwei Reihen (0–5 und 6–10), jede Stufe mindestens 44 × 44 px; ab 640 px in einer Reihe. Darunter steht der gewählte Wert als Text („gewählt: 6“). Im Befund aus Bausteinen trennen Linien die Blöcke statt eigener Rahmen; die Seitenmarke steht am Handy über der Knopfreihe, die drei Ergebnisse gleich breit in einer Reihe, „+ Notiz“ darunter. Die Bausteinleiste über dem Freitext läuft am Handy waagerecht und hält beim Laden ihre Höhe frei. Im Nachtrag ist der Ursprungseintrag zugeklappt und zeigt seine erste Zeile.

**Begründung.** Jannes hat für BEF-057 Option 2 gewählt („dichter am Handy“). Die Skala aus Option 3 kommt dazu, weil elf Stufen zu je 29 px die Mindestgröße von 44 px (Oberflächen-Checkliste Punkt 1) verfehlen und ein Fehltipp einen Messwert verfälscht, der im Verlauf weiterlebt; die Empfehlung im Befund nannte genau diese Verbindung. Die zweireihige Skala sieht am Handy anders aus als der Papierbogen — Inhalt, Reihenfolge und Anker bleiben gleich. Unsicher: ob Jannes die Skala lieber einreihig mit kleineren Stufen hätte.

**Anker.** `spaltenAmHandy` in `Skala` (`src/features/assessments/FragebogenFelder.tsx`); `ergebnis-knoepfe` und die Blockklassen in `src/features/assessments/BausteinFeld.tsx`; `src/features/documentation/TextbausteinLeiste.tsx`; `src/features/documentation/TreatmentNoteAddendumPage.tsx`. Geprüft in `tests/e2e/befund.spec.ts` und `tests/e2e/bausteine.spec.ts`.

**Änderungspfad.** Skala einreihig: `spaltenAmHandy` auf `stufen.length` · Aufwand `klein`. Blockrahmen zurück: die Klassen am `<details>` des Blocks · Aufwand `klein`.

### ANN-259 — Rechnungsliste: Suche als Teilstring ohne Platzhalter, „offen“ schließt überfällige ein, Seiten zu 100

Praxisprozess · entschieden (Claude) · 2026-10-06 · Claude (BEF-061 Option 1 und 3 nach Entscheidung Jannes 2026-10-05) · erledigt · Wiedervorlage: Jannes in der Sichtung Rahmen am Rechner

**Annahme.** Die Rechnungsliste sucht auf dem Server in Rechnungsnummer, Name der Person und Name der Empfänger:in, ohne Groß- und Kleinschreibung, als Teilstring; `%` und `_` sind gewöhnliche Zeichen, höchstens 100 Zeichen. Filter: „Nur Entwürfe“, „Nur offene“ (ausgestellt, nicht storniert, nicht voll bezahlt — überfällige eingeschlossen), „Nur überfällige“, „Nur bezahlte“, „Nur stornierte“; dazu ein Monat (Abrechnungsmonat der Rechnung). „Weitere laden“ holt Seiten zu 100. Jede Liste nennt die Zahl vor dem Kürzen; die offenen Posten bleiben bei 100 in Fälligkeitsfolge und sagen es, die Zahlungen ebenso.

**Begründung.** BEF-061: Ab der 101. Rechnung verschwanden die ältesten still, und eine Rechnung ist sonst nirgends erreichbar (ANN-061, nicht über die Kopfsuche). Teilstring ohne Platzhalter, weil Büros Nummern stückweise tippen („0042“) und ein `%` im Namen nie gemeint ist. „Offen“ mit überfälligen, weil beides offene Forderungen sind; „überfällig“ ist die engere Auswahl. Der Monat ist der der Klammer, nicht das Ausstellungsdatum — so steht er auch auf der Rechnung. Unsicher: ob die Praxis eher nach Ausstellungsdatum filtern will.

**Anker.** `public.list_invoices` in `supabase/migrations/20261012110000_abr_033_rechnungsliste_suche.sql`; `rechnungsfilterLabels` und `RECHNUNGEN_JE_SEITE` in `src/features/billing/api.ts`; `Rechnungsliste` in `src/features/billing/Rechnungsliste.tsx`. Geprüft in `supabase/tests/invoices.test.ts` („Rechnungsliste mit Suche …“).

**Änderungspfad.** Monat nach Ausstellungsdatum: Bedingung in `list_invoices` auf `issued_on` umstellen · Aufwand `klein`. Größere Seiten: `RECHNUNGEN_JE_SEITE` (Server begrenzt auf 200) · Aufwand `klein`.

### ANN-260 — Leitfaden L2 im ganzen Code: Meldungen und Rückfragen mit Linie links statt als Karte; Erklärsatz über „Plattform“ entfällt

Praxisprozess · entschieden (Claude) · 2026-10-06 · Claude (Auftrag Jannes: „Ich möchte das Design konsequent auf jeden Bereich anwenden … Triff Annahmen, wenn nötig“) · erledigt · Wiedervorlage: Jannes in der Sichtung Rahmen

**Annahme.** Eine Fehlermeldung (`ErrorState`) und eine geöffnete Rückfrage (`Rueckfrage`) sind keine Karten mehr, sondern Flächen mit einer 4 px breiten Linie links, ohne Rahmen und Radius; Rot bzw. die vertiefte Fläche bleiben. Auskünfte in einer Karte (Eintragstext, Treffer der Verortung, hervorgehobene Angaben, Vorschlag aus Bausteinen, Hinweise) stehen mit einer 2 px Linie links. Formulare, die sich in einer Liste öffnen (Art korrigieren, Vertretung einrichten, Bericht korrigieren, Aufgabe), sehen aus wie eine Rückfrage. Abschnitte mit nur einer Zeile oder einem Bedienelement (Behandlungsliege, Zugang in „Mein Konto“) und Abschnitte in einem Fenster (Abrechnung, Zustand in den Terminaktionen) haben keinen Rahmen. Der Erklärsatz über „Plattform“ in Stammdaten und Trainingskund:in entfällt.

**Begründung.** Leitfaden L2 „Kein Kasten im Kasten“, Beispiel Jannes (Stammdaten). Eine Bestandsaufnahme am 06.10.2026 fand rund 60 Stellen; die meisten entstanden durch zwei gemeinsame Bausteine, die selbst Karten waren und fast immer in einer Karte stehen. Die Linie links trennt eine Meldung weiter sichtbar vom Inhalt, ohne einen weiteren Rahmen. Der Erklärsatz war Löschkandidat 3 (reiner Text, kein Verhalten). Unsicher: ob Jannes die rote Fehlerfläche lieber ganz ohne Füllung hätte.

**Anker.** `ErrorState` in `src/components/ui/Feedback.tsx`, `Rueckfrage` in `src/components/ui/Rueckfrage.tsx` (Test „Kein Kasten im Kasten“ in `src/components/ui/bausteine.test.tsx`); `PlattformAbschnitt` in `src/features/platform-access/PlattformAbschnitt.tsx`; Liste in `docs/design/leitfaden-schlank.md`.

**Änderungspfad.** Karte zurück: die Klassen der beiden Bausteine · Aufwand `klein`. Erklärsatz zurück: `hinweis` am Abschnitt · Aufwand `klein`.

### ANN-261 — Nach der Lesefrist widerruft die Person selbst weiter; Export und Vertretung enden mit der Lesezeit

Datenschutz · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · Prüfpaket · Wiedervorlage: Datenschutzprüfung (Prüfpaket); Jannes in der Sichtung Plattform

**Annahme.** Ist die Lesefrist (D2, 30 Tage nach dem Ende des Verhältnisses) vorbei, kann die Person selbst über ihren weiter aktiven Zugang unter „Ich" Einwilligungen widerrufen, aber nicht neu einwilligen. Der Export geht nur in der Lesezeit; danach gibt die Praxis Auskunft (Art. 15, OPS-006), und „Ich" sagt das. Eine Vertretung kann nach ihrem Ende nichts mehr. Gesperrte und entzogene Zugänge können nichts.

**Begründung.** Art. 7 Abs. 3 DSGVO: Der Widerruf muss so einfach sein wie die Erteilung, auch nach dem Vertrag; eine neue Einwilligung nach dem Ende hätte keinen Zweck. Der Export setzt sich aus den Plattformprojektionen zusammen, die nach der Lesefrist nichts zeigen; eine zweite Feldliste nur für danach widerspräche ADR-023 Punkt 22. Das weicht von DSN-001 D2 ab („Ich" behält den Export) — Rechnungen und Dokumente fehlen dort schon seit POR-EPIC-002. Das Ende einer Vertretung kann aus der Volljährigkeit kommen. Unsicher: ob die Prüfung den Export nach dem Ende auf der Plattform verlangt.

**Anker.** `app.platform_own_access_after_reading` in `supabase/migrations/20261013100000_por_016_platform_consents.sql`; `entscheidend` in `src/features/platform/PlattformApp.tsx`. Geprüft in `supabase/tests/platform-consents.test.ts` und `supabase/tests/platform-export.test.ts`.

**Änderungspfad.** D2 vollständig („Ich" mit Rechnungen, Dokumenten, Export nach der Lesefrist): Projektionen mit eigenem Zweig für den eigenen Zugang · Aufwand `mittel`.

### ANN-262 — Eine Einwilligung auf der Plattform speichert die Fassung ihres Texts; ein alter Text wird abgewiesen

Datenschutz · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2, Wortlaut)

**Annahme.** Jede Erteilung und jeder Widerruf auf der Plattform speichert die Fassung des Einwilligungstexts (`2026-10`), den die Person gesehen hat. Der Server kennt nur die aktuelle Fassung und weist eine Seite mit älterem Text ab. Die Texte stehen in kurzen Sätzen je Zweck, mit dem Satz zum Widerruf (Art. 7 Abs. 3) und dazu, dass Behandlung bzw. Vertrag nicht davon abhängen (Art. 7 Abs. 4). Die Einwilligung geht über eine Rückfrage („Ja, ich willige ein“).

**Begründung.** Art. 7 Abs. 1 DSGVO: Die Praxis muss nachweisen, worin eingewilligt wurde; ohne Fassung zeigte ein späterer Text eine andere Einwilligung. Die Rückfrage macht sie ausdrücklich (Art. 9 Abs. 2 lit. a). Der Wortlaut ist ein Entwurf und wird in B2 geprüft. Unsicher: ob eine Textänderung bestehende Einwilligungen berührt (heute nicht).

**Anker.** `EINWILLIGUNGSFASSUNG` und `EINWILLIGUNGSTEXTE` in `src/features/platform/einwilligungstexte.ts`; `app.platform_consent_wording_version` in `supabase/migrations/20261013100000_por_016_platform_consents.sql`. Gleichlauf geprüft in `src/features/platform/einwilligungstexte.test.ts`.

**Änderungspfad.** Neuer Wortlaut: Text und Fassung an beiden Stellen anheben · Aufwand `klein`. Bestehende Einwilligungen neu einholen: eigener Loop · Aufwand `mittel`.

### ANN-263 — Widerrufe über die Plattform stehen 14 Tage in Offene Punkte, ohne „gesehen“

Praxisprozess · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · erledigt · Wiedervorlage: Jannes in der Sichtung Plattform

**Annahme.** Widerruft die Person oder ihre rechtliche Vertretung eine Einwilligung auf der Plattform, steht der Widerruf 14 Tage in Offene Punkte („Widerrufen über die Plattform“), mit Person, Zweck, Datum und wer gehandelt hat. Es gibt keinen Zustand „gesehen“. Sehen dürfen ihn die Rollen, die die Kartei bzw. das Trainingsverhältnis lesen. Die Akte zeigt jeden Vermerk mit „über die Plattform“.

**Begründung.** DSN-001 Abschnitt 6 legt Widerrufe in die Übersicht. Wer ihn nicht erfährt, schickt den nächsten Bericht oder die nächste Mail ohne Grundlage. Ein Haken „gesehen“ wäre eine Aufgabe mehr, und das Datenmodell zeigt den Widerruf ohnehin dauerhaft. 14 Tage decken Urlaub und Wochenende. Unsicher: ob Jannes eine Quittung will.

**Anker.** `app.platform_withdrawal_notice_days` und `list_platform_consent_withdrawals` in `supabase/migrations/20261013100000_por_016_platform_consents.sql`; `src/features/open-points/consent-withdrawals-api.ts`.

**Änderungspfad.** Andere Frist: die Zahl · Aufwand `klein`. Quittung: Spalte und Funktion · Aufwand `mittel`.

### ANN-264 — Einwilligung im Training: eigener Vermerk am Verhältnis, ein Widerruf löscht nichts selbst

Datenschutz · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2, ADR-021 Folgefrage)

**Annahme.** Die Einwilligung zu Angaben zur Gesundheit im Training (Art. 9 Abs. 2 lit. a) ist ein Vermerk je Trainingsverhältnis mit einem Zweck, `training_health_data`, nur anhängend wie in PAT-006. Die Praxis vermerkt sie vom Papier (owner, Trainingsbetreuung, Büro), die Kund:in oder ihre rechtliche Vertretung erteilt und widerruft auf der Plattform. Ein Widerruf löscht keine Angaben selbst: Die Seite sagt „keine neuen Angaben“, und was mit den bisherigen geschieht, klärt die Praxis mit der Person. Ohne Einwilligung bleibt das Trainingsprotokoll heute bedienbar.

**Begründung.** ADR-021 Punkt 4 verlangt die ausdrückliche Einwilligung, Punkt 5 eine Tabelle am Verhältnis, Punkt 6 kein Lesen aus der Behandlung. Art. 17 Abs. 1 lit. b DSGVO verlangt nach einem Widerruf das Löschen, wenn keine andere Grundlage besteht; ob Vertrag oder Abrechnung Teile tragen, ist die offene Folgefrage von ADR-021 (B2). Ein automatisches Löschen wäre nicht rücknehmbar. Unsicher: ob die Prüfung eine Frist für das Löschen nach dem Widerruf setzt und das Protokoll ohne Einwilligung sperren will.

**Anker.** `training_consent_records` und `record_training_consent_entry` in `supabase/migrations/20261013110000_por_017_training_consent.sql`; `TrainingEinwilligung` in `src/features/training/TrainingEinwilligung.tsx`.

**Änderungspfad.** Protokoll nur mit Einwilligung: Prüfung in den Schreibfunktionen des Protokolls · Aufwand `mittel`. Löschen nach Widerruf: Regel im Löschlauf · Aufwand `mittel`.

### ANN-265 — Der Export der Plattform ist eine Auskunft nach Art. 15: dieselbe Aktion im Protokoll, Inhalt nur aus den Projektionen

Datenschutz · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · Prüfpaket · Wiedervorlage: Datenschutzprüfung (Prüfpaket)

**Annahme.** „Meine Daten herunterladen" liefert eine JSON-Datei (und eine lesbare Fassung zum Drucken) mit genau dem, was die Plattform zeigt: Stammdaten des Verhältnisses, Termine, Terminwünsche, Befundbogen, Rechnungen (nur mit Recht auf Rechnungen), die Liste der freigegebenen Dokumente, Einwilligungen. Jeder Export steht als `patient_record.exported` im Protokoll, mit Akteur Plattformkonto oder Vertretung und Zweck `platform_export`. Die Person selbst und ihre rechtliche Vertretung exportieren, die Begleitung nicht.

**Begründung.** ADR-010 Punkt 16 nennt unter „Exporte“ die Auskunft nach Art. 15; eine neue Aktion bräuchte eine ADR-Änderung, ohne Mehrwert. Art. 15 Abs. 3 und Art. 20 verlangen eine Kopie bzw. ein gängiges maschinenlesbares Format; die Kopie der Akte bleibt der Weg in der Praxis (ADR-023 Punkt 12). Unsicher: ob die Prüfung die Dokumente selbst im Export will (heute einzeln abrufbar).

**Anker.** `public.platform_export` in `supabase/migrations/20261013120000_por_018_platform_export.sql`; `Datenexport` in `src/features/platform/Datenexport.tsx`.

**Änderungspfad.** Eigene Aktion: ADR-010 ändern, Katalog, Freigabe · Aufwand `mittel`. Dokumente im Export: ZIP im Browser · Aufwand `mittel`.

### ANN-266 — Der Einstieg gilt je Zugang, „Später" beendet ihn, Überspringen berührt keine Einwilligung

Praxisprozess · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · erledigt · Wiedervorlage: Jannes in der Sichtung Plattform

**Annahme.** Den Einstieg (Willkommen, Einwilligungen, fertig) sieht jede Person einmal je Zugang vor ihrer Übersicht: Wer Behandlung und Training hat, sieht ihn zweimal; eine Begleitung ohne den Schritt Einwilligungen. „Später" beendet ihn wie „Zur Übersicht“. Die Praxis kann ihn im Abschnitt Plattform überspringen (wer den Zugang verwaltet); er steht dann als „übersprungen am … (Name)“ dort und für die Person ohne Namen unter „Ich“. Einwilligungen bleiben dabei offen. Benachrichtigungen fehlen bis ADR-024. Lädt der Stand nicht, gilt die Übersicht.

**Begründung.** DSN-001 4.3 und `IDEA-LZK-005`: Beim Hausbesuch sitzt die Therapeutin daneben, ein erzwungener Einstieg wäre ein Hindernis; eine Einwilligung, die jemand anders klickt, ist keine (Art. 7 Abs. 1). Je Zugang, weil jeder Zugang seine eigenen Einwilligungen hat (§4.8). Ein Einstieg darf nie den Weg zu den eigenen Daten versperren. Nachweis am Zugang statt im Protokoll (ADR-010 Fassung 3). Unsicher: ob zwei Einstiege bei zwei Verhältnissen stören.

**Anker.** `skip_platform_onboarding` und `platform_onboarding` in `supabase/migrations/20261013130000_por_019_platform_onboarding.sql`; `UebersichtOderEinstieg` in `src/features/platform/PlattformApp.tsx`; `src/features/platform/Einstieg.tsx`.

**Änderungspfad.** Einstieg je Konto: Stand an `user_profiles` statt am Zugang · Aufwand `mittel`. Benachrichtigungen: Schritt mit ADR-024 · Aufwand `klein`.

### ANN-267 — Plattform: keine Schrift unter 18 px, Schriftgröße nur auf dem Gerät, Ziele mindestens 44 px

Praxisprozess · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · erledigt · Wiedervorlage: Jannes in der Sichtung Plattform (am Handy, auch mit „Sehr groß")

**Annahme.** Im Plattformgerüst ist jede Schrift mindestens 18 px: Die kleinen Stufen des Systems werden dort auf 18 px gehoben, die Rangfolge tragen Gewicht und Farbe. Unter „Ich → Einstellungen" wählt die Person „Normal", „Groß" (112,5 %) oder „Sehr groß" (125 %), gespeichert nur im Browser des Geräts. Bei wenig Breite brechen lange Wörter und Knöpfe um, Listenzeilen stellen den Zustand unter den Titel. Berührflächen sind mindestens 44 px hoch; Knöpfe haben 48, Textlinks 44. Geprüft automatisch auf jeder Plattformansicht: Schrift, Ziele, axe mit Kontrast, kein waagerechtes Scrollen bei 375 und 188 px (200 %).

**Begründung.** DSN-001 Abschnitt 7 und `IDEA-QSN-006`: 18 px, 200 % ohne waagerechtes Scrollen, Kontrast 4,5 : 1. Die Schriftgröße im Browser zu speichern ist Datenminimierung (Art. 5 Abs. 1 lit. c) und passt zu Geräten, die sich Angehörige teilen. Für die Ziele nennt DSN-001 48 px; WCAG 2.5.5 verlangt 44, und Textlinks auf 48 zu heben hätte die Praxisbausteine verändert. Unsicher: ob Jannes die Versalien der Abschnittstitel in 18 px zu laut findet.

**Anker.** `.plattform-schrift` und `html[data-schrift]` in `src/index.css`; `src/features/platform/schriftgroesse.ts`; `listenzeile` in `src/components/ui/ListRow.tsx`. Geprüft in `tests/e2e/plattform-barrierefreiheit.spec.ts`.

**Änderungspfad.** Andere Grundgröße: die Tokens in `.plattform-schrift` · Aufwand `klein`. Ziele 48 px: Mindesthöhe der Textlinks im Gerüst · Aufwand `klein`. Größe am Konto speichern: Spalte und Projektion · Aufwand `mittel`.

### ANN-268 — Das Nachsorge-Abo beginnt frühestens am Abschluss der Versorgung und höchstens 14 Tage rückwirkend

Praxisprozess · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · erledigt · Wiedervorlage: Jannes in der Sichtung Angebote

**Annahme.** „Ende der Behandlungsgrundlage“ (ADR-009 Punkt 21) heißt im Modell: Abschluss der Versorgung in der Akte (`care_concluded_on`). Vorher lässt sich kein Abo anlegen; es beginnt frühestens an diesem Tag, höchstens 14 Tage vor dem Anlegen und nach dem Ende jedes früheren Abos. Je Person läuft höchstens eines.

**Begründung.** Eine Grundlage hat kein eigenes Ende; sie endet faktisch mit ihrem Kontingent (ADR-020, Folgefragen). Der Abschluss der Versorgung ist der eine ausdrückliche, rücknehmbare Vorgang, der alle Grundlagen zugleich beendet, und er steuert schon Lesefrist und Aufbewahrung. Er ist strenger als das Ende eines Kontingents und schließt aus, dass Behandlung und Abo nebeneinander berechnet werden (§19). Die 14 Tage fangen ein Abo auf, das nach dem Abschlussgespräch erst später eingetragen wird, ohne Monate für eine Zeit fällig zu machen, in der niemand die Nachsorge nutzte (Zweitreview). Unsicher: ob Jannes nach jeder Verordnung abschließt, auch wenn eine Folgeverordnung offen ist.

**Anker.** `app.aftercare_earliest_start` in `supabase/migrations/20261014100000_ang_001_aftercare_subscriptions.sql`; Hinweis in `src/features/billing/Nachsorgeabo.tsx`. Geprüft in `supabase/tests/aftercare-subscriptions.test.ts`.

**Änderungspfad.** Beginn ab dem letzten Termin der letzten Grundlage: die eine Funktion · Aufwand `klein`.

### ANN-269 — Das Nachsorge-Abo ist bis zur Antwort der Steuerberatung umsatzsteuerpflichtig zum Regelsatz

Recht · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · Prüfpaket · Wiedervorlage: Steuerberatung (B4, Anfrage Frage 7)

**Annahme.** Die Position „Nachsorge-Abo (Monat)“ der Preisliste trägt `taxable` mit 19 %. Die Datenbank lässt für diese Positionsart kein anderes Kennzeichen zu; auf der Rechnung steht die enthaltene Umsatzsteuer (39,00 € brutto, 6,23 € Steuer).

**Begründung.** Ob die Nachsorge eine steuerfreie Heilbehandlung nach § 4 Nr. 14 lit. a UStG ist, hängt am therapeutischen Zweck; ohne ärztliche Verordnung lässt er sich kaum belegen (UStAE 4.14.1, präventive Leistungen sind nicht befreit). Im Zweifel gilt für die Steuer nicht das strengere Regime (§1.2): Ein falsches „steuerfrei“ wäre eine falsche Angabe, ein Ausweis ohne Pflicht wird nach § 14c UStG geschuldet – beide Fehler kosten, der zweite ist der ohne Nachforderung. Das Kennzeichen hängt am Posten (ADR-009 Punkt 15). Unsicher: die Einordnung selbst; sie entscheidet die Steuerberatung.

**Anker.** `app.aftercare_tax_allowed` und die Constraint `service_catalog_items_aftercare_month` in `supabase/migrations/20261014110000_ang_002_aftercare_months.sql`; Prüfung in `src/features/billing/CatalogPage.tsx`. Geprüft in `supabase/tests/aftercare-months.test.ts`.

**Änderungspfad.** Anderes Kennzeichen: die eine Funktion und die Prüfung der Preisliste, danach eine neue Preisliste; ausgestellte Rechnungen bleiben und werden bei Bedarf storniert (ADR-009 Punkt 9) · Aufwand `klein`.

### ANN-270 — Abo-Monate laufen ab dem Beginn, werden zu ihrem Beginn berechnet und enden mit der Kündigung zum Ende des laufenden Monats

Recht · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · Prüfpaket · Wiedervorlage: Datenschutzprüfung (Vertragsrecht, AGB des Abos); Jannes mit dem Preis

**Annahme.** Ein Abo-Monat läuft vom Tag des Beginns bis zum Vortag desselben Tags im Folgemonat; fehlt der Tag, bis zum Monatsletzten (§ 188 Abs. 2 und 3 BGB), immer vom Beginn aus gerechnet (Beginn 31.01.: 31.01.–28.02., 01.03.–30.03., 31.03.–30.04.). Er wird zu seinem Beginn berechnet: Ab dem ersten Tag steht er zum Erfassen bereit. Eine Kündigung wirkt zum Ende des laufenden Abo-Monats, ohne weitere Frist; vor dem Beginn beendet sie das Abo, bevor ein Monat entsteht.

**Begründung.** „Monatlich kündbar“ (§4.6, ADR-009 Punkt 21) ohne Bindung über den laufenden Monat hinaus liegt innerhalb von § 309 Nr. 9 BGB; Vorauszahlung je Monat ist bei Abos üblich und vermeidet eine Abrechnung nach Tagen. Vom Beginn aus gerechnet, damit der Tag nicht dauerhaft auf den 28. springt. Unsicher: ob ein Widerruf nach § 312g BGB (Vertrag beim Hausbesuch) eine Erstattung des ersten Monats verlangt – das liefe heute über Storno.

**Anker.** `app.aftercare_month_start`, `app.aftercare_month_end`, `app.aftercare_month_index` in `supabase/migrations/20261014100000_ang_001_aftercare_subscriptions.sql`. Geprüft in `supabase/tests/aftercare-subscriptions.test.ts`.

**Änderungspfad.** Kalendermonate oder Abrechnung am Monatsende: die drei Funktionen und die fälligen Monate · Aufwand `klein`.

### ANN-271 — Läuft die Behandlung wieder, wird kein Abo-Monat berechnet

Praxisprozess · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · erledigt · Wiedervorlage: Jannes in der Sichtung Angebote

**Annahme.** Ist die Versorgung wieder aufgenommen (Abschluss zurückgenommen), lässt sich kein Abo-Monat erfassen; ebenso nie ein Monat, in dem ein Behandlungstermin lag, der nicht abgesagt ist – auch nach dem nächsten Abschluss. Die Liste der fälligen Monate nennt den Grund. Das Abo endet dadurch nicht von selbst: Die Praxis kündigt es oder erfasst die Monate, sobald die Versorgung wieder abgeschlossen ist.

**Begründung.** Während der Behandlung ist die Plattform Teil der Heilbehandlung und kostenlos (§4.6); ADR-009 Punkt 21 will verhindern, dass während der Behandlung etwas doppelt berechnet wird. Ein automatisches Ende wäre eine Kündigung, die niemand erklärt hat; ein automatisches Ruhen bräuchte einen eigenen Zustand. Die Termine im Monat sind der Nachweis, dass behandelt wurde (Zweitreview); ein Monat vor der Wiederaufnahme ohne Termin bleibt erfassbar, sobald wieder abgeschlossen ist. Unsicher: ob Jannes das Abo bei einer neuen Verordnung lieber ruhen lassen will.

**Anker.** `care_open` und `care_during_month` in `app.aftercare_month_blocker` in `supabase/migrations/20261014110000_ang_002_aftercare_months.sql`; `MONATSHINDERNIS` in `src/features/billing/nachsorge-api.ts`. Geprüft in `supabase/tests/aftercare-months.test.ts`.

**Änderungspfad.** Abo ruht während der Behandlung: Zeitraum der Behandlung am Abo und Prüfung je Monat · Aufwand `mittel`.

### ANN-272 — Das Abo wird in der Praxis geschlossen; gekündigt wird über einen Knopf nach dem Muster des § 312k BGB

Recht · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · Prüfpaket · Wiedervorlage: Datenschutzprüfung (Vertragsrecht); B13 für die Bestätigung per Mail

**Annahme.** Das Nachsorge-Abo wird im Abschlussgespräch geschlossen und von owner oder Büro in der Akte angelegt; einen Abschluss über die Plattform gibt es nicht. Gekündigt wird über „Abo kündigen“ unter „Ich“, eine Seite zur Bestätigung mit dem Enddatum und „Jetzt kündigen“; danach steht sofort die Bestätigung mit Datum und Uhrzeit da, zum Ausdrucken oder Speichern, und dauerhaft unter „Ich“. Die Praxis kann eine Kündigung per Telefon oder Brief eintragen. Kündigungen über die Plattform stehen 14 Tage in Offene Punkte.

**Begründung.** § 312k BGB verlangt den Knopf nur, wenn sich der Vertrag auf der Website schließen lässt; die Praxis baut ihn trotzdem, weil „monatlich kündbar mit Kündigungsknopf“ die Vorgabe ist (Roadmap) und der Weg einfach sein soll. Ein Abschluss über die Plattform brächte Widerrufsbelehrung und Informationspflichten mit sich (`IDEA-ANG-004`: „ein eigenes Feature, kein Knopf“). Die Bestätigung in Textform per Mail hängt an B13; bis dahin ist die Seite zum Speichern der dauerhafte Datenträger. Nur die ordentliche Kündigung; eine außerordentliche läuft über die Praxis. Unsicher: ob ein Vertrag beim Hausbesuch ein Widerrufsrecht nach § 312g BGB auslöst, das eine Belehrung im Gespräch verlangt.

**Anker.** `public.cancel_platform_aftercare`, `public.list_platform_aftercare_cancellations` in `supabase/migrations/20261014120000_ang_003_aftercare_cancellation.sql`; `src/features/platform/Abo.tsx`. Geprüft in `supabase/tests/aftercare-cancellation.test.ts` und `src/features/platform/Abo.test.tsx`.

**Änderungspfad.** Abschluss über die Plattform: eigener Loop mit Widerrufsbelehrung · Aufwand `groß`. Bestätigung per Mail: Versand mit B13 · Aufwand `klein`.

### ANN-273 — Kündigen dürfen die Person selbst und ihre rechtliche Vertretung mit Vermögenssorge, nie die Begleitung

Recht · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B5, Vertretung)

**Annahme.** Den Kündigungsknopf haben der eigene Zugang und eine rechtliche Vertretung mit nachgewiesener Vermögenssorge (`finance_scope`). Den Abo-Stand sieht, wer Rechnungen sieht (Recht `billing`); eine Begleitung mit Einwilligung zu Rechnungen sieht ihn also, kündigt aber nicht. Die Kündigung trägt Zugang, Art und bei einer Vertretung deren Namen.

**Begründung.** Eine Kündigung ist eine Willenserklärung über einen entgeltlichen Vertrag – Vermögenssorge, nicht Gesundheitssorge. ADR-023 Punkt 13 lässt die Begleitung lesen und Wünsche schreiben, aber keine Erklärungen für die Person abgeben. Der Name der Vertretung bleibt am Abo, weil ihr Konto nach 30 Tagen fällt (ADR-023 Punkt 5). Unsicher: ob eine Vorsorgevollmacht ohne ausdrückliche Vermögenssorge genügt.

**Anker.** Recht `contract` in `app.platform_access_allows` in `supabase/migrations/20261014120000_ang_003_aftercare_cancellation.sql`. Geprüft in `supabase/tests/aftercare-cancellation.test.ts`.

**Änderungspfad.** Andere Regel: der eine Zweig in `app.platform_access_allows` · Aufwand `klein`.

### ANN-274 — Ein Nachsorge-Abo hält den Plattformzugang offen; die Lesezeit von 30 Tagen zählt ab seinem Ende

Datenschutz · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · Prüfpaket · Wiedervorlage: Datenschutzprüfung (Speicherbegrenzung, ADR-023 Punkt 5)

**Annahme.** In der Behandlung zählt die Lesezeit vom Abschluss der Versorgung oder vom letzten Tag des letzten Nachsorge-Abos, was später liegt; solange ein Abo läuft, endet der Zugang nicht. Danach gelten dieselben 30 Tage wie ohne Abo. Ein Abo im Behandlungsverhältnis verlängert den Zugang zum Training nicht. Die Frist des Zugangs (drei Jahre) und die Löschung des Kontos (30 Tage) rechnen ab demselben Ende.

**Begründung.** §4.6: Das Abo ist der Zweck, die Plattform nach der Behandlung weiter zu nutzen; nach einer Kündigung bleibt der Zugriff 30 Tage lesend (DSN-001 4.3). Eine Stelle (`app.platform_access_ended_at`) trägt das Ende für Projektionen, Löschlauf und Konto, deshalb ändert sich nur der Tag, ab dem gezählt wird. Getrennte Verhältnisse bleiben getrennt (§4.8, ADR-021). Die Inhalte der Stufe 2 (Verlauf, Rückfragen, Plan als PDF) gibt es noch nicht; sie kommen mit ihren Loops. Unsicher: ob die Prüfung für die Zeit des Abos eine eigene Rechtsgrundlage für die Plattform verlangt (Vertrag über die Nachsorge, Art. 9 Abs. 2 lit. h).

**Anker.** `app.platform_read_from` und `app.platform_access_ended_at` in `supabase/migrations/20261014130000_ang_004_platform_follows_aftercare.sql`; Hinweis in `src/features/platform/Uebersicht.tsx`. Geprüft in `supabase/tests/aftercare-platform-access.test.ts`.

**Änderungspfad.** Andere Lesezeit nach dem Abo: der Tag in der einen Funktion · Aufwand `klein`.

### ANN-275 — Ein Trainingspaket hat eine Laufzeit in Monaten, seinen Umfang in der Bezeichnung und bis zur Antwort der Steuerberatung 19 % Umsatzsteuer

Recht · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · Prüfpaket · Wiedervorlage: Jannes mit Preis und Umfang (BEF-114); Steuerberatung (B4)

**Annahme.** Ein Trainingspaket ist eine eigene Positionsart der Preisliste mit einer Laufzeit von 1 bis 24 Monaten, Bereich `training`, ohne Heilmittel und mit `taxable` 19 %. Der Umfang (etwa „eine Einheit je Woche, Plattform inklusive“) steht in der Bezeichnung; ein Kontingent mit Zählung gibt es nicht. Eine Preisliste darf mehrere Pakete führen, im Seed synthetisch 3 Monate für 390 € und 6 Monate für 720 €.

**Begründung.** ADR-009 Punkt 21 und §19: ein Paket gilt für einen festen Zeitraum und wird als eine Leistung des Bereichs `training` berechnet; der Preis ist versioniert wie jeder andere (Punkt 5). Training ist keine Heilbehandlung (ADR-021), also steuerpflichtig zum Regelsatz (ADR-009 Punkt 15); ob die Vorauszahlung etwas daran ändert, klärt B4 – die Steuer entsteht bei Anzahlungen schon mit der Zahlung (§ 13 Abs. 1 Nr. 1 lit. a Satz 4 UStG), was die Auswertung nach Zufluss ohnehin zeigt. Jannes hat Preis, Umfang und Zahlungsweise noch nicht festgelegt (BEF-114); eine Zählung ohne Regel wäre ein Feature auf Vorrat (ADR-014). Unsicher: ob die Praxis Pakete mit fester Einheitenzahl will.

**Anker.** `app.training_package_tax_allowed`, die Spalte `package_months` und die Constraint `service_catalog_items_training_package` in `supabase/migrations/20261015100000_ang_005_training_package_catalog.sql`; Prüfung in `src/features/billing/CatalogPage.tsx`. Geprüft in `supabase/tests/training-packages.test.ts` und `src/features/billing/CatalogPage.test.tsx`.

**Änderungspfad.** Anderes Kennzeichen: die eine Funktion, danach eine neue Preisliste · Aufwand `klein`. Kontingent statt Zeitraum: Zählung am Paket und an der Abgeltung (ANN-279) · Aufwand `mittel`.

### ANN-276 — Ein Trainingspaket wird einmal im Voraus berechnet: eine Leistung zum Beginn, eine Rechnung

Praxisprozess · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · erledigt · Wiedervorlage: Jannes mit der Zahlungsweise (BEF-114)

**Annahme.** Mit dem Paket entsteht im selben Schritt genau eine Leistung des Bereichs `training`, ohne Termin, am Tag des Beginns, zum Preis der Paketposition der am Beginn geltenden Preisliste. Die Rechnung entsteht über den Monatsentwurf des Trainings; das Blatt nennt den ganzen Zeitraum des Pakets. Raten gibt es nicht. Eine Fehlanlage lässt sich mit ihrer Leistung entfernen, solange sie auf keiner Rechnung und keinem Entwurf steht.

**Begründung.** ADR-009 Punkt 21: das Paket „wird als eine Leistung des Bereichs `training` berechnet“; §19 nennt es ein abrechenbares Ereignis. Eine Leistung je Paket macht die Doppelabrechnung zur Invariante (Punkt 4, eindeutiger Index). Der Preis bleibt fest, weil die Leistung auf die unveränderliche Position zeigt (Punkt 5). Den Zeitraum verlangt § 14 Abs. 4 Nr. 6 UStG. Unsicher: ob Jannes Monatsraten will; dann wäre das Paket wie das Abo in Monate zu teilen.

**Anker.** `public.create_training_package`, der dritte Zweig von `billable_services_source` und `billable_services_training_package_key` in `supabase/migrations/20261015110000_ang_006_training_packages.sql`. Geprüft in `supabase/tests/training-packages.test.ts`.

**Änderungspfad.** Monatsraten: eine Leistung je Paketmonat mit den Monatsfunktionen des Abos (ANN-270) · Aufwand `mittel`.

### ANN-277 — Ein Trainingspaket läuft nach § 188 BGB, lässt sich weder pausieren noch kündigen, und der Vertrag endet nicht vor ihm

Recht · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · Prüfpaket · Wiedervorlage: Datenschutzprüfung (Vertragsrecht, AGB des Pakets)

**Annahme.** Ein Paket über n Monate endet am Ende des n-ten Monats vom Beginn aus (§ 188 Abs. 2 und 3 BGB, wie ANN-270). Es hat keinen Zustand, keine Pause und keine Kündigung; ob es geplant ist, läuft oder vorbei ist, ergibt sich aus dem Tag. Zwei Pakete desselben Verhältnisses überschneiden sich nie. Das Trainingsverhältnis lässt sich nicht vor dem letzten Tag eines Pakets beenden – damit bleibt auch der Plattformzugang bis dahin offen.

**Begründung.** §4.10 und §19: „ein Paket gilt für einen Zeitraum und ist nicht pausierbar“; „die Plattform ist im Paketpreis enthalten“. Die Lesefrist von 30 Tagen zählt vom Vertragsende (ADR-023 Punkt 5); hält das Vertragsende das Paket ein, braucht der Zugang keine eigene Regel. Unsicher: ob bei Personal Training als Dienst höherer Art eine jederzeitige Kündigung nach § 627 BGB möglich bleibt und eine anteilige Erstattung verlangt; das klärt die Prüfung, bis dahin läuft eine Erstattung über Storno.

**Anker.** `app.training_package_ends_on`, die Constraint `training_packages_no_overlap` und die Prüfung in `public.end_training_relationship` in `supabase/migrations/20261015110000_ang_006_training_packages.sql`. Geprüft in `supabase/tests/training-packages.test.ts`.

**Änderungspfad.** Kündigung mit anteiliger Erstattung: Ende am Paket, Korrekturrechnung · Aufwand `mittel`.

### ANN-278 — Ein Trainingspaket beginnt nicht während einer laufenden Behandlung derselben Person

Praxisprozess · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · erledigt · Wiedervorlage: Jannes in der Sichtung Angebote

**Annahme.** Hat dieselbe Person in der Praxis eine Akte ohne Abschluss der Versorgung, lässt sich kein Paket anlegen; nach dem Abschluss beginnt es frühestens an dessen Tag. Wie beim Abo höchstens 14 Tage rückwirkend und nicht vor dem Vertragsbeginn. Eine Behandlung, die während eines Pakets beginnt, hält es nicht an (ANN-280).

**Begründung.** §4.10: „Das Paket beginnt nach dem Ende der Behandlung.“ Gelesen wird über die gemeinsame Identität (ADR-021 Punkt 3) und nur der Abschluss, kein Inhalt der Akte; anlegen dürfen nur owner und office, die beide Bereiche tragen – die Meldung erreicht niemanden, der die Akte nicht ohnehin sieht (ADR-021 Punkt 6). Unsicher: ob Jannes einem Paket neben einer laufenden Verordnung doch zustimmen würde, etwa bei einer Behandlung an einer anderen Region.

**Anker.** `care_open` und `before_care_end` in `app.training_package_start_blocker` in `supabase/migrations/20261015110000_ang_006_training_packages.sql`; `STARTHINDERNIS` in `src/features/billing/trainingspaket-api.ts`. Geprüft in `supabase/tests/training-packages.test.ts`.

**Änderungspfad.** Paket auch während einer Behandlung: die zwei Zweige entfernen · Aufwand `klein`.

### ANN-279 — Jeder Trainingstermin im Zeitraum eines Pakets ist mit dem Paket bezahlt

Praxisprozess · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · erledigt · Wiedervorlage: Jannes mit dem Umfang (BEF-114)

**Annahme.** Ein Trainingstermin, dessen Tag zwischen Beginn und Ende eines Pakets desselben Verhältnisses liegt, trägt keine eigene Leistung: Er steht nicht unter den offenen Leistungen, und eine Erfassung wird abgewiesen, auch an den Funktionen vorbei. Umgekehrt entsteht kein Paket über Tage, an denen schon eine Trainingsleistung am Termin erfasst ist. Außerhalb eines Pakets bleibt es bei der Einzelstunde (ANN-181). Gezählt wird nicht: Auch eine zusätzliche Einheit im Zeitraum ist abgegolten.

**Begründung.** BEF-114 (Jannes, 2026-10-02): „Bei einem Paket entsteht die Forderung aus der Paketvereinbarung; Termine im Paket erzeugen keine weitere Forderung.“ Als Invariante in beiden Richtungen verhindert die Regel, dass dieselbe Zeit zweimal bezahlt wird (ADR-009 Punkt 4). Der Umfang steht nur in der Bezeichnung (ANN-275); eine Zählung bräuchte eine Regel, die Jannes noch nicht festgelegt hat. Unsicher: ob Einheiten über den Umfang hinaus extra berechnet werden sollen.

**Anker.** `app.training_package_covering` in `supabase/migrations/20261015120000_ang_007_package_covers_appointments.sql`, gelesen vom Trigger an `billable_services`, von `app.training_package_guard` und von `public.list_open_billable_appointments`. Geprüft in `supabase/tests/training-packages.test.ts`.

**Änderungspfad.** Einheiten über den Umfang extra: Zählung je Paket in der einen Funktion · Aufwand `mittel`.

### ANN-280 — Bei einem Rückfall in die Heilbehandlung läuft das Paket weiter; die Software erstattet nichts

Recht · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · Prüfpaket · Wiedervorlage: Jannes in der Sichtung Angebote; Datenschutzprüfung (Vertragsrecht, AGB des Pakets)

**Annahme.** Beginnt während eines Pakets eine neue Behandlung derselben Person, läuft das Paket unverändert weiter: kein Pausieren, kein automatisches Ende, keine Erstattung. Die Behandlung wird daneben als Heilbehandlung an ihren Terminen abgerechnet, im eigenen Bereich und Nummernkreis. Will die Praxis aus Kulanz etwas erstatten, läuft das über Storno und eine neue Rechnung. Die Bedingungen in der Plattform sagen das vorher.

**Begründung.** §4.10 und §19: Das Paket ist nicht pausierbar; von den drei denkbaren Antworten in `IDEA-ANG-003` bleiben „läuft parallel weiter“ und „Restguthaben wird erstattet“. Parallel ist die einfache und die vorhersehbare: Die Bereiche teilen keine Forderung (ADR-009 Punkt 16), und die Person weiß vor dem Kauf, was gilt. Eine automatische Erstattung wäre ein Korrekturbeleg ohne Regel für die Höhe. Unsicher: ob § 627 BGB eine Kündigung mit anteiliger Rückzahlung erzwingt (siehe ANN-277).

**Anker.** Keine Sperre in `app.training_package_start_blocker` für eine Behandlung nach dem Beginn, Kopf von `supabase/migrations/20261015120000_ang_007_package_covers_appointments.sql`; Bedingungen in `src/features/platform/paketbedingungen.ts`. Geprüft in `supabase/tests/training-packages.test.ts`.

**Änderungspfad.** Erstattung des Restes: Korrekturrechnung über den nicht genutzten Teil · Aufwand `mittel`.

### ANN-281 — Preise und Bedingungen der Pakete sieht jeder Zugang zum Training; geschlossen wird in der Praxis

Recht · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · Prüfpaket · Wiedervorlage: Datenschutzprüfung (Fernabsatz, Preisangaben); KND-EPIC-001

**Annahme.** Unter „Ich → Trainingspaket“ sieht jeder lesbare Zugang zu einem Trainingsverhältnis die Pakete der heute geltenden Preisliste mit Bezeichnung und Umfang, Laufzeit, Gesamtpreis und dem Satz zur Umsatzsteuer, darunter die Bedingungen. Das eigene Paket mit Zeitraum und Preis sieht, wer Rechnungen sieht (Recht `billing`). Zugänge zur Behandlung sehen keine Trainingspreise. Einen Kaufknopf gibt es nicht: Das Paket wird in der Praxis geschlossen und dort angelegt.

**Begründung.** `IDEA-ANG-004`: Der Preis steht vollständig da, mit Laufzeit, Umfang und Bedingungen, ohne Beratungsgespräch als Zwischenschritt. Die Preisangabenverordnung verlangt gegenüber Verbrauchern den Gesamtpreis einschließlich Umsatzsteuer (§ 3 PAngV); unter § 19 UStG wird keine ausgewiesen. Ein Abschluss über die Plattform brächte Widerrufsbelehrung und Informationspflichten des Fernabsatzes mit (§ 312d BGB) und gehört nach §4.10 zum Übergang aus der Behandlung (KND-EPIC-001). Die Bereiche bleiben getrennt (§4.8). Unsicher: ob die Praxis die Preise auch Patient:innen am Ende der Behandlung zeigen will; das gehört zu KND-EPIC-001.

**Anker.** `public.platform_training_offers` und `public.platform_training_packages` in `supabase/migrations/20261015130000_ang_008_platform_training_package.sql`; Wortlaut in `src/features/platform/paketbedingungen.ts`, Seite `src/features/platform/Paket.tsx`. Geprüft in `supabase/tests/training-packages.test.ts` und `src/features/platform/Paket.test.tsx`.

**Änderungspfad.** Abschluss über die Plattform: eigener Loop mit Widerrufsbelehrung (KND-EPIC-001) · Aufwand `groß`. Preise auch für die Behandlung: eine Bedingung in der einen Funktion · Aufwand `klein`.

### ANN-282 — Ein Trainingsangebot halten die Rollen der Akte fest; ob die Person schon trainiert, prüft erst ihr eigenes Konto

Datenschutz · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · Prüfpaket · Wiedervorlage: Jannes in der Sichtung Angebote; Datenschutzprüfung (B2, §4.8)

**Annahme.** Ein Trainingsangebot legen owner, Therapeut:in, Teamleitung und Büro in der Akte an und ziehen es zurück – dieselben Rollen, die die Akte schreiben. Die Trainingsbetreuung sieht kein Angebot. Beim Anbieten fragt der Server nicht, ob die Person schon ein Trainingsverhältnis hat; das zeigt erst die Seite in ihrem eigenen Konto („Sie haben schon einen Trainingsvertrag“).

**Begründung.** §4.10: Das Abschlussgespräch führt die behandelnde Person, und angeboten wird mündlich. §4.8 verbietet den Schluss von einer Rolle des einen Bereichs auf den anderen, „auch nicht mittelbar über die gemeinsame Identität“; eine Fehlermeldung „hat schon ein Trainingsverhältnis“ wäre genau so ein Schluss für eine Therapeut:in. Das Angebot hängt an der Akte (ADR-021 Punkt 5) und enthält Angaben aus der Behandlung, also gehört es den Rollen der Akte. Unsicher: ob Jannes das Anbieten auf owner und Büro beschränken will, weil es ein Angebot über Geld ist.

**Anker.** `app.can_update_patient()` in `public.create_training_offer` und `public.withdraw_training_offer` in `supabase/migrations/20261016100000_knd_002_training_offers.sql`; Abschnitt `src/features/training-offers/Trainingsangebot.tsx`. Geprüft in `supabase/tests/training-offers.test.ts`.

**Änderungspfad.** Nur owner und Büro: `app.can_manage_training_packages()` statt `app.can_update_patient()` in den beiden Funktionen, die Oberfläche folgt `canManageInvoicing` · Aufwand `klein`.

### ANN-283 — Aus der Behandlung wandern nur wörtlich formulierte Übergabeangaben, keine Felder der Akte

Datenschutz · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2, ADR-021 Punkt 7)

**Annahme.** Was aus der Akte ins Training mitgehen soll, formuliert die Praxis im Angebot als bis zu fünf Angaben mit Überschrift (bis 80 Zeichen) und Text (bis 600 Zeichen), etwa „Belastungsgrenzen“ oder „Vorgeschichte“. Dazu kann sie die Kontaktdaten der Akte anbieten. Die Person sieht jede Angabe wörtlich und gibt sie einzeln frei; nur Freigegebenes wird beim Annehmen als Kopie mit Herkunftsvermerk ins Training geschrieben. Eine Auswahl beliebiger Felder aus Befund oder Dokumentation gibt es nicht.

**Begründung.** ADR-021 Punkt 7 verlangt eine dokumentierte Kopie mit Einwilligung, nie eine Referenz; `IDEA-LZK-003` nennt als Beispiele Kontraindikationen, Belastungsgrenzen und Verletzungshistorie – Zusammenfassungen, die eine Therapeut:in schreibt, keine Rohfelder. Eine Einwilligung ist nur informiert (Art. 4 Nr. 11, Art. 7 DSGVO), wenn die Person genau sieht, was weitergeht; bei einem Befundfeld voller Fachbegriffe sähe sie das nicht. Fünf Angaben genügen für die Beispiele und halten die Seite am Telefon lesbar. Unsicher: ob die Prüfung eine Übernahme von Befundzahlen (etwa Bewegungsausmaß) verlangt.

**Anker.** `app.training_offer_handover_valid` und die Spalte `handover_items` in `supabase/migrations/20261016100000_knd_002_training_offers.sql`; `UEBERGABE_HOECHSTENS` in `src/features/training-offers/api.ts`. Geprüft in `supabase/tests/training-offers.test.ts`.

**Änderungspfad.** Mehr oder längere Angaben: die Zahlen in der einen Funktion und in `api.ts` · Aufwand `klein`. Befundfelder zur Auswahl: eigene Kopierfunktion je Feld · Aufwand `groß`.

### ANN-284 — Ein Trainingsangebot gilt 14 Tage, höchstens bis zum Beginn; je Akte eines offen

Praxisprozess · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · erledigt · Wiedervorlage: Jannes in der Sichtung Angebote

**Annahme.** Ein Angebot kann die Person 14 Tage lang annehmen, längstens bis zum Tag, an dem das Training beginnt. Der Beginn liegt zwischen heute und 90 Tagen voraus und nicht vor dem Abschluss der Versorgung. Je Akte ist höchstens ein Angebot offen; ein neues setzt voraus, dass das alte zurückgezogen, angenommen oder abgelaufen ist. Beim Zusammenführen zweier Akten sperren zwei offene Angebote.

**Begründung.** Ein Angebot ohne Frist bliebe als Bindung der Praxis an einen alten Preis stehen (§ 145 BGB); 14 Tage decken die Zeit nach dem Abschlussgespräch, in der die Person überlegt. Ein Beginn in der Vergangenheit kommt bei einem Vertrag, der erst im Konto geschlossen wird, nicht in Frage; 90 Tage reichen für eine Pause zwischen Behandlung und Training. Der Beginn nach dem Abschluss folgt §4.10 und ANN-278. Unsicher: ob Jannes längere Bedenkzeiten will.

**Anker.** `app.training_offer_state`, die Prüfungen in `public.create_training_offer` und der Block `training_offer_overlap` in `app.patient_merge_plan` in `supabase/migrations/20261016100000_knd_002_training_offers.sql`. Geprüft in `supabase/tests/training-offers.test.ts`.

**Änderungspfad.** Andere Frist: `v_heute + 14` und `v_heute + 90` in der einen Funktion · Aufwand `klein`.

### ANN-285 — Die Akte erfährt nicht, ob ein Angebot angenommen wurde

Datenschutz · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2, §4.8)

**Annahme.** Ein Angebot steht in der Akte als „offen“ bis zum Ende seiner Gültigkeit, danach als „abgelaufen“, oder als „zurückgezogen“ – gleich, ob die Person gebucht hat. Den Zeitpunkt der Annahme speichert das Angebot nur, damit es nicht zweimal angenommen wird; ihn liest allein die Projektion der Person, weder die Akte noch die Auskunft der Akte. Zurückziehen geht auch nach einer Annahme und berührt den Vertrag nicht. Die Seite zum Buchen sagt: „In Ihrer Behandlungsakte steht nicht, ob Sie gebucht haben.“

**Begründung.** §4.8 (Rang 1): Aus einer Rolle der Behandlung folgt kein Wissen über das Training, auch nicht über die gemeinsame Identität. „Angenommen am …“ hätte einer Therapeut:in ohne Trainingsrolle einen Vertrag gezeigt; auch „nicht mehr offen“ vor dem Ende der Gültigkeit verriete ihn. Die erste Fassung dieser Annahme (die Akte sieht dass und wann) fiel im Zweitreview gegen §4.8 und wurde nach Rang aufgelöst. Owner und Büro sehen das Trainingsverhältnis ohnehin über ihre Trainingsrolle. Unsicher: ob die behandelnde Person den Ausgang des Abschlussgesprächs für ihre Dokumentation braucht.

**Anker.** `app.training_offer_practice_state` in `supabase/migrations/20261016100000_knd_002_training_offers.sql`; `AKTE_ERFAEHRT` in `src/features/platform/vertragstexte.ts`. Geprüft in `supabase/tests/training-offers.test.ts` und `supabase/tests/training-contracts.test.ts`.

**Änderungspfad.** Annahme mit Einwilligung der Person zurück in die Akte: Zeitpunkt in `get_patient_training_offers`, ein Satz auf der Seite zum Buchen und ein Häkchen dafür · Aufwand `klein`.

### ANN-286 — Ans Abschlussgespräch erinnert die Karte der letzten zwei Termine, bis ein Angebot in der Akte steht

Praxisprozess · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · erledigt · Wiedervorlage: Jannes in der Sichtung Angebote

**Annahme.** An den letzten zwei Terminen einer Behandlungsgrundlage mit Terminzahl (Position mindestens Terminzahl minus eins) zeigt die Tageskarte die Pille „Abschlussgespräch“ und die Terminansicht einen Satz mit dem Weg „Training in der Akte anbieten“. Das gilt für Verordnung und Selbstzahler, solange die Versorgung offen ist, keine jüngere Grundlage folgt und seit dem Beginn der Grundlage kein Trainingsangebot in der Akte steht, das nicht zurückgezogen ist. Eine Mitteilung, ein Zähler oder ein Eintrag in Offene Punkte entsteht nicht.

**Begründung.** §4.10 und E-3: „In den letzten ein bis zwei Terminen einer Verordnung erinnert die App an das Abschlussgespräch.“ Am Termin sieht die behandelnde Person den Hinweis dann, wenn das Gespräch ansteht; die Erinnerung „Verordnungen, die enden“ gibt es schon für die Folgeverordnung. Eine jüngere Grundlage heißt: Die Behandlung geht weiter. Ob die Person schon trainiert, fragt die Erinnerung nicht – das wäre ein Schluss von der Behandlung aufs Training (§4.8). Unsicher: ob Jannes auch ohne Terminzahl erinnert werden will, etwa beim Selbstzahler mit offener Anzahl.

**Anker.** `app.closing_talk_due` in `supabase/migrations/20261016110000_knd_001_closing_talk.sql`; Pille in `src/features/today/Tagesliste.tsx`, Satz in `src/features/appointments/TerminKompakt.tsx`. Geprüft in `supabase/tests/closing-talk.test.ts`.

**Änderungspfad.** Nur der letzte Termin oder drei: die Zahl `- 1` in der einen Funktion · Aufwand `klein`.

### ANN-287 — Das Voraussetzungsprofil führen owner und Trainingsbetreuung; das Büro sieht es nicht

Datenschutz · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · Änderung BEF-137 · Wiedervorlage: Datenschutzprüfung (B2, ADR-021 Punkt 10)

**Annahme.** Am Trainingsverhältnis steht ein Profil aus sieben Freitexten – Ziele, Ausrüstung, Zeitbudget, Orte, Belastungsgrenzen, Vorgeschichte, Vorlieben – und darunter, schreibgeschützt, was die Person aus der Behandlung freigegeben hat, mit Tag des Angebots und der Freigabe. Lesen und schreiben owner und Trainingsbetreuung; Büro, Behandlung und Plattform nicht. Jedes Lesen steht als `training_relationship.viewed` mit `view: profile` im Protokoll. Gespeichert wird mit dem erwarteten Stand, nach dem Vertragsende nicht mehr. Ohne Einwilligung bleibt das Profil bedienbar und sagt es (wie ANN-264). Die Person sieht ihr Profil auf der Plattform noch nicht.

**Begründung.** `IDEA-LZK-004`: Ausrüstung und Zeit sind die häufigsten Gründe, warum ein Plan scheitert. Belastungsgrenzen und Vorgeschichte sind Gesundheitsangaben des Trainings; ADR-021 Punkt 10 lässt das Büro nur das Protokoll lesen und sperrt ihm die übrigen. Freitext statt Auswahllisten, weil Jannes die Kategorien noch nicht festgelegt hat (ADR-014: nicht vorbauen). Unsicher: ob die Person ihr Profil selbst pflegen soll (§4.10 nennt „Profil“ in ihrer Sicht).

**Anker.** `public.get_training_profile` und `public.save_training_profile` mit `app.can_access_training_protocols()` in `supabase/migrations/20261016120000_knd_005_training_profile.sql`; `PROFILFELDER` in `src/features/training/profil-api.ts`. Geprüft in `supabase/tests/training-profile.test.ts`.

**Änderungspfad.** Profil in der Plattform: eigene Projektion mit Recht `read` · Aufwand `mittel`. Büro lesend: eigene Rollenfunktion statt `can_access_training_protocols` · Aufwand `klein`.

**Abnahme (Jannes, 2026-10-09).** geändert: Das Voraussetzungsprofil sieht auch das Büro (lesend). Die Akte erfährt weiter nicht, ob gebucht wurde (ANN-285 bestätigt). Umsetzung: BEF-137. **Umsetzung (ABN-030, 2026-10-09, BEF-137).** `get_training_profile` liest mit `app.can_read_training_content()` (owner, Trainingsbetreuung, Büro; ANN-315), jedes Lesen weiter als `training_relationship.viewed` mit `view: profile`. Schreiben bleibt bei `app.can_access_training_protocols()`. Das Büro sieht das Profil ohne „Bearbeiten“. Scharf mit echten Daten erst nach B2.

### ANN-288 — Der Trainingsvertrag entsteht im Konto mit Musterbelehrung, „Zahlungspflichtig buchen“ und einer Bestätigung zum Speichern

Recht · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · Prüfpaket · Wiedervorlage: Datenschutzprüfung (Vertragsrecht, Fernabsatz); B13 für die Bestätigung per Mail

**Annahme.** Die Seite „Training nach Ihrer Behandlung“ zeigt Paket, Zeitraum, Gesamtpreis, die Paketbedingungen und die Widerrufsbelehrung nach dem Muster der Anlage 1 zu Art. 246a § 1 Abs. 2 EGBGB mit Muster-Widerrufsformular und dem Hinweis auf die Widerrufsfunktion im Konto. Der Vertrag entsteht mit „Zahlungspflichtig buchen“. Beginnt das Paket innerhalb von 14 Tagen nach dem Abschluss, muss die Person ausdrücklich verlangen, dass vorher begonnen wird. Gespeichert werden Paket und Preis als Wert, die Fassung von Belehrung und Bedingungen, der frühe Beginn, die Freigaben und die Einwilligung; die Bestätigung steht sofort und dauerhaft unter „Ich → Trainingsvertrag“ zum Drucken.

**Begründung.** §4.10: Geschlossen wird über das eigene Konto, mit Widerrufsbelehrung. Ob ein Vertrag nach einem Gespräch beim Hausbesuch und einem Klick im Konto Fernabsatz oder außerhalb von Geschäftsräumen ist (§§ 312b, 312c BGB), ändert am Widerrufsrecht nichts; die Musterbelehrung erfüllt die Pflicht (Art. 246a § 1 Abs. 2 Satz 2 EGBGB). § 312j Abs. 3 verlangt die Beschriftung des Knopfs, §§ 356 Abs. 4 und 357a Abs. 2 das ausdrückliche Verlangen für den frühen Beginn, § 312f Abs. 2 eine Bestätigung auf einem dauerhaften Datenträger – bis B13 die Seite zum Speichern wie bei ANN-272. Unsicher: ob die Seite zum Speichern als dauerhafter Datenträger genügt.

**Anker.** `app.training_contract_wording_version` und `public.accept_platform_training_offer` in `supabase/migrations/20261016130000_knd_003_training_contract.sql`; Wortlaut in `src/features/platform/vertragstexte.ts`. Geprüft in `supabase/tests/training-contracts.test.ts`, `src/features/platform/vertragstexte.test.ts` und `src/features/platform/Angebot.test.tsx`.

**Änderungspfad.** Anderer Wortlaut: Text und `VERTRAGSFASSUNG` mit der Funktion anheben · Aufwand `klein`. Bestätigung per Mail: Versand mit B13 · Aufwand `klein`.

### ANN-289 — Den Trainingsvertrag im Konto schließt nur die Person selbst

Recht · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B5, Vertretung)

**Annahme.** Annehmen kann nur der eigene Zugang der Person zu ihrer Behandlung. Eine rechtliche Vertretung mit Vermögenssorge sieht das Angebot und die Seite, aber keinen Knopf („Den Vertrag schließt … selbst in ihrem Konto oder in der Praxis“); eine Begleitung sieht nichts. Mit dem Vertrag bekommt das Konto der Person einen eigenen Zugang zum Training; eine Vertretung im Training richtet die Praxis bei Bedarf eigens ein.

**Begründung.** Der Nachweis einer Vertretung (Ausweis, Vollmacht, Aufgabenkreis) ist für die Behandlung angesehen worden (ADR-023 Punkt 13); ihn still auf ein neues Verhältnis zu übertragen, wäre genau der Schluss über die gemeinsame Identität, den §4.8 verbietet. Eine Vertretung beim Training richtet die Praxis mit eigenem Nachweis ein, wie bisher (ANN-173). Unsicher: ob eine Betreuung oder Vollmacht den Abschluss im Konto braucht, weil die vertretene Person selbst kein Konto hat.

**Anker.** Die Prüfung `v_zugang.access_kind <> 'self'` in `public.accept_platform_training_offer` und `can_accept` in `public.platform_training_offer` in `supabase/migrations/20261016130000_knd_003_training_contract.sql`. Geprüft in `supabase/tests/training-contracts.test.ts`.

**Änderungspfad.** Rechtliche Vertretung schließt ab: Vertretungszugang zum neuen Verhältnis mit übernommenem Nachweis anlegen · Aufwand `mittel`.

### ANN-290 — Der Widerruf im Konto ist die Erklärung; die Praxis wickelt ab

Recht · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · Prüfpaket · Wiedervorlage: Datenschutzprüfung (Vertragsrecht); Jannes in der Sichtung Angebote

**Annahme.** Unter „Ich → Trainingsvertrag“ steht bis zum Ende der Widerrufsfrist (14 Tage ab Abschluss) der Knopf „Vertrag widerrufen“, danach eine Seite mit „Widerruf bestätigen“ und sofort der Eingang mit Datum und Uhrzeit zum Drucken. Widerrufen können die Person selbst und eine rechtliche Vertretung mit Vermögenssorge am Trainingszugang, nie die Begleitung. Der Widerruf steht am Vertragsnachweis, 14 Tage in Offene Punkte und dauerhaft am Trainingsverhältnis (owner, Büro). Er löscht und storniert nichts selbst: Paket entfernen oder stornieren, zurückzahlen und den Vertrag beenden macht die Praxis mit den vorhandenen Funktionen. Ein Widerruf auf anderem Weg (Brief, E-Mail) vermerkt die Praxis heute nicht in der Anwendung.

**Begründung.** § 356a BGB verlangt seit dem 19. Juni 2026 bei Verträgen über eine Online-Oberfläche eine Widerrufsfunktion mit Bestätigungsschritt und Eingangsbestätigung auf einem dauerhaften Datenträger. Was bei frühem Beginn als Wertersatz bleibt (§ 357a Abs. 2 BGB), hängt an den schon erbrachten Einheiten und ist eine Einzelfallrechnung; eine automatische Stornierung wäre ein Beleg ohne Regel für die Höhe. Unsicher: ob die Praxis Widerrufe per Brief ebenfalls in der Anwendung vermerken will.

**Anker.** `public.withdraw_platform_training_contract` und `public.list_platform_training_withdrawals` in `supabase/migrations/20261016140000_knd_004_training_withdrawal.sql`; Knopf in `src/features/platform/Vertrag.tsx`. Geprüft in `supabase/tests/training-contracts.test.ts` und `src/features/platform/Vertrag.test.tsx`.

**Änderungspfad.** Widerruf per Brief vermerken: Praxisfunktion mit Herkunft `practice` wie bei der Abo-Kündigung · Aufwand `klein`. Automatische Rückabwicklung ohne frühen Beginn: Paket entfernen bzw. stornieren im selben Aufruf · Aufwand `mittel`.

### ANN-291 — Mit dem Vertrag entsteht der Zugang zum Training ohne eigene Einladung

Datenschutz · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B5, ADR-023 Punkte 6, 7, 11)

**Annahme.** Bucht die Person im Konto, bekommt dasselbe Konto im selben Aufruf einen aktiven eigenen Zugang zum neuen Trainingsverhältnis – ohne Einladung, ohne Code und ohne Praxisrolle. Der Wächter am Zugang prüft wie bei jeder Einladung, dass Konto und Person zusammengehören und kein Praxiskonto ist. Im Protokoll steht `platform_access.activated` mit `via: training_contract`. Vertretungen im Training richtet weiter die Praxis ein.

**Begründung.** ADR-023 (Rang 2) lässt Zugänge nur aus einer Einladung der Praxis entstehen, weil die Einladung die Identität prüft (Punkt 11). §4.10 (Rang 1) verlangt, dass der Trainingsvertrag über das eigene Konto geschlossen wird – und dieses Konto hat die Praxis bei der Einladung zur Behandlung schon geprüft. Eine zweite Einladung prüfte dieselbe Person noch einmal und hielte den Abschluss an einen Termin. Aufgelöst nach Rang; ADR-023 bleibt für alle anderen Zugänge unverändert. Unsicher: ob die Prüfung eine eigene Bestätigung im Training verlangt.

**Anker.** Das `insert into public.platform_accesses` in `public.accept_platform_training_offer` in `supabase/migrations/20261016130000_knd_003_training_contract.sql`. Geprüft in `supabase/tests/training-contracts.test.ts`.

**Änderungspfad.** Zugang zum Training nur per Einladung: im Aufruf einen Zugang `invited` mit Einladung vor Ort anlegen statt `active` · Aufwand `klein`. Mit Folgen für ADR-023: neue Fassung, die diesen Weg aufnimmt · Aufwand `klein`.


### ANN-292 — Eine Übungsbibliothek für Behandlung und Training

Datenschutz · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2, Trennung der Leistungsbereiche)

**Annahme.** Die Praxis führt **eine** Übungsbibliothek für beide Leistungsbereiche. Übung und Variante tragen keinen Leistungsbereich und keinen Personenbezug; therapist und team_lead lesen dieselbe Bibliothek wie die Trainingsbetreuung. Personenbezogen wird eine Übung erst im Plan (UEB-EPIC-002), der an seinem Verhältnis hängt.

**Begründung.** §4.8 und ADR-021 Punkt 6 trennen **Daten einer Person** nach Rechtsverhältnis; eine Übung ist Fachwissen der Praxis wie ein Textbaustein (ANN-020) und kein Datum über jemanden. Zwei Bibliotheken verdoppelten die Pflege, ohne etwas zu schützen. Die Roadmap verlangt ausdrücklich eine Bibliothek, „die für Therapie und Training trägt“. Unsicher: ob die Prüfung schon im Namen oder in der Kurzanleitung einer Übung einen mittelbaren Personenbezug sieht, wenn eine Praxis Übungen für Einzelne anlegt; die Oberfläche sagt deshalb „für die Praxis“, nicht „für eine Person“.

**Anker.** Die Tabellen `public.exercises` und `public.exercise_variants` ohne Spalte `service_area` in `supabase/migrations/20261017100000_ueb_001_exercise_library.sql`. Geprüft in `supabase/tests/exercise-library.test.ts`.

**Änderungspfad.** Getrennte Bibliotheken: Spalte `service_area` an der Übung und Filter in `public.list_exercise_library` nach der Rolle · Aufwand `mittel`.

### ANN-293 — Die Übungsbibliothek pflegt die Praxisinhaber:in; das Büro sieht sie nicht

Praxisprozess · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · Änderung BEF-137 · Wiedervorlage: Jannes (Sichtung Pläne)

**Annahme.** Lesen dürfen owner, therapist, team_lead und die Trainingsbetreuung; anlegen, ändern, archivieren und löschen nur owner. Das Büro sieht die Bibliothek nicht.

**Begründung.** IDEA-TRN-005 beschreibt die Bibliothek als „kuratierte fachliche Leistung“: Wer sie ändert, ändert, was alle Pläne der Praxis später anbieten – dieselbe Überlegung wie bei den praxisweiten Textbausteinen (`app.can_manage_shared_text_snippets`). Das Büro leitet keine Übung an; was es nicht braucht, sieht es nicht (§3.5 Datenminimierung). Offen ist, ob Therapeut:innen und Trainingsbetreuung selbst Übungen anlegen sollen – das fragt die Freigabe des Epics.

**Anker.** `app.can_read_exercise_library()` und `app.can_manage_exercise_library()` in `supabase/migrations/20261017100000_ueb_001_exercise_library.sql`; Darstellung `canReadExerciseLibrary` in `src/features/session/types.ts`. Geprüft in `supabase/tests/exercise-library.test.ts`.

**Änderungspfad.** Mehr Rollen pflegen lassen: die Rollenliste in `app.can_manage_exercise_library()` erweitern · Aufwand `klein`. Das Büro lesen lassen: dasselbe in `app.can_read_exercise_library()` und `canReadExerciseLibrary` · Aufwand `klein`.

**Abnahme (Jannes, 2026-10-09).** geändert: Das Büro liest die Übungsbibliothek; pflegen bleibt bei owner. Umsetzung: BEF-137. **Umsetzung (ABN-030, 2026-10-09, BEF-137).** `app.can_read_exercise_library()` und `canReadExerciseLibrary` nehmen `office` auf; das Büro findet die Bibliothek unter Organisatorisches. Pflegen bleibt bei owner.

### ANN-294 — Eine Verbindung: von leichter nach schwerer, genau eine Achse

Praxisprozess · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · erledigt · Wiedervorlage: Jannes (Sichtung Pläne)

**Annahme.** Zwei Varianten verbindet höchstens eine Verbindung. Sie führt immer von der leichteren zur schwereren und trägt genau eine der zwölf Achsen aus IDEA-TRN-004 (Last, Wiederholungen, Sätze, Bewegungsausmaß, Hebel, Unterstützung, Unterstützungsfläche, Tempo, Dichte, Komplexität, Geschwindigkeit, Frequenz). Kreise sind ausgeschlossen, archivierte Varianten werden nicht neu verbunden; verbinden lassen sich Varianten auch über Übungen hinweg.

**Begründung.** IDEA-TRN-004 verlangt, je Schritt **eine** Achse zu ändern, damit eine Reaktion zuzuordnen bleibt; zwei Varianten, die sich in zwei Achsen unterscheiden, sind zwei Schritte. IDEA-TRN-005 nennt Regression und Progression als Richtung – „leichter“ und „schwerer“ sagen dasselbe ohne Fachwort. Die Verbindungen werden nur angezeigt; eine Funktion, die sich entlang der Kanten bewegt, wäre nach ADR-006 Punkt 10 eine Vorauswahl und entsteht nicht.

**Anker.** `app.exercise_axes()`, der eindeutige Index `exercise_variant_links_pair_unique` und die Kreisprüfung in `public.link_exercise_variants` in `supabase/migrations/20261017110000_ueb_002_variant_links.sql`; `ACHSEN` in `src/features/exercises/types.ts`. Geprüft in `supabase/tests/exercise-variant-links.test.ts`.

**Änderungspfad.** Andere oder weitere Achsen: beide Listen und eine Migration mit der neuen Funktion · Aufwand `klein`. Mehrere Achsen je Verbindung: Spalte als Feld, Index und Prüfung anpassen · Aufwand `mittel`.

### ANN-295 — Feste Körperregionen, Ausrüstung als freie Schlagworte

Technik · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · erledigt · Wiedervorlage: Jannes (Sichtung Pläne)

**Annahme.** Eine Übung trägt genau eine Körperregion aus einer festen, groben Liste ohne Seite (HWS, BWS, LWS, Schulter, Ellenbogen, Hand, Hüfte, Knie, Fuß, Rumpf, ganzer Körper). Die Ausrüstung einer Variante sind höchstens acht freie Schlagworte zu je höchstens 40 Zeichen, ohne Doppelte.

**Begründung.** Region und Gerät sind die beiden Ordnungen, die ADR-006 Punkt 10 ausdrücklich als keine klinische Vorauswahl nennt. Eine feste Regionsliste macht den Filter verlässlich; das Körperschema der Fragebögen (`app.questionnaire_body_regions`) ist mit Seiten und 40 Feldern für eine Übung zu fein. Für Geräte gibt es keine Liste, die eine Praxis vorab kennt.

**Anker.** `app.exercise_body_regions()` in `supabase/migrations/20261017100000_ueb_001_exercise_library.sql` und `KOERPERREGIONEN` in `src/features/exercises/types.ts`; `supabase/tests/exercise-library.test.ts` hält beide gleich.

**Änderungspfad.** Region ändern oder ergänzen: beide Listen und eine Migration mit der neuen Funktion · Aufwand `klein`. Mehrere Regionen je Übung: Spalte als Feld statt Text · Aufwand `mittel`.

### ANN-296 — Übungen werden archiviert; Löschen nur ohne Abhängige

Praxisprozess · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · erledigt · Wiedervorlage: Jannes (Sichtung Pläne)

**Annahme.** Eine Übung oder Variante, die nicht mehr angeboten werden soll, wird archiviert: Sie verschwindet aus der Bibliothek, bleibt aber nachlesbar und lässt sich zurückholen. Löschen ist für Versehen da – eine Übung erst ohne Varianten, eine Variante nur, solange nichts auf sie zeigt (Verbindung, später Plan).

**Begründung.** ADR-008 Punkt 10 verbietet das dauerhafte Soft-Delete für **personenbezogene** Daten; die Bibliothek ist keins, und Archivieren erhält, was spätere Pläne als Vorlage hatten (der Plan friert ohnehin einen Schnappschuss ein, UEB-EPIC-002). Die Fremdschlüssel halten das Löschen auf, statt eine Prüfung im Code zu verlangen.

**Anker.** `public.set_exercise_archived`, `public.set_exercise_variant_archived`, `public.delete_exercise` und `public.delete_exercise_variant` in `supabase/migrations/20261017100000_ueb_001_exercise_library.sql`; Datenklasse `betriebsdaten` in `public.retention_assignments`.

**Änderungspfad.** Löschen auch mit Abhängigen: Fremdschlüssel auf `cascade` und eine Rückfrage, was mitgeht · Aufwand `mittel`.

### ANN-297 — Ein Plan in einer Tabelle für beide Bereiche, genau ein Verhältnis

Datenschutz · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2, Trennung der Leistungsbereiche)

**Annahme.** Übungspläne beider Leistungsbereiche stehen in **einer** Tabelle `exercise_plans` (Positionen in `exercise_plan_items`). Ein Plan trägt `service_area` und hängt an **genau einem** Verhältnis: an der Akte (`therapy`, `patient_id`) oder am Trainingsverhältnis (`training`, `training_relationship_id`) – eine Constraint verbietet beides und keines. Datenklasse und Frist werden je Zeile am Bereich zugeordnet: Behandlungspläne sind Patientenakte, Trainingspläne Trainingsverhältnis; beide fallen mit ihrem Verhältnis.

**Begründung.** ADR-022 Punkt 3 hat dieselbe Form für den Kalender gewählt; die Trennung erzwingt die Constraint, nicht eine zweite Tabelle (ADR-021 Punkt 1: „erzwingt“). Zwei Tabellen verdoppelten jede Funktion für Entwurf, Schnappschuss, Fassung und Wiedervorlage, ohne etwas zu schützen, das Policy und Funktionen je Bereich nicht schon schützen. Der Retention Schedule nennt „Therapiepläne“ ausdrücklich in der Klasse der Patientenakte (ADR-008). Unsicher: ob die Datenschutzprüfung zwei Tabellen als die sauberere Trennung verlangt.

**Anker.** Constraint `exercise_plans_one_relationship` und die vier Zeilen in `public.retention_assignments` in `supabase/migrations/20261018100000_ueb_004_exercise_plans.sql`. Geprüft in `supabase/tests/exercise-plans.test.ts`.

**Änderungspfad.** Zwei Tabellen: `training_exercise_plans` abspalten, Funktionen je Bereich verdoppeln, Daten umziehen · Aufwand `mittel`.

### ANN-298 — Behandlungspläne schreiben Therapeut:innen, Trainingspläne owner und Trainingsbetreuung; das Büro liest nur Behandlungspläne

Praxisprozess · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · Änderung BEF-137 · Wiedervorlage: Jannes (Sichtung Pläne), Datenschutzprüfung (B2)

**Annahme.** Behandlungspläne stellen therapist und team_lead zusammen, weisen sie zu, steigern, verlängern und beenden sie; lesen dürfen dazu owner und das Büro. Trainingspläne lesen und schreiben owner und die Trainingsbetreuung; das Büro sieht sie nicht. Ein Plan des anderen Bereichs ist für jede Rolle „nicht gefunden“.

**Begründung.** Ein Behandlungsplan ist Teil der Behandlung: Schreiben folgt der Behandlungsdokumentation (`app.can_write_treatment_note`, owner ohne Therapierolle schreibt nicht), Lesen ADR-004 Punkt 3 (das Büro liest alle klinischen Inhalte der Akte). Im Training öffnet ADR-021 Punkt 10 dem Büro **nur** das Protokoll; ein Plan gehört nicht dazu. Die Trainingsrollen folgen Profil und Protokoll (ANN-184, ANN-287). Kein Durchgriff nach ADR-021 Punkt 6.

**Anker.** `app.can_read_exercise_plans(text)` und `app.can_write_exercise_plans(text)` in `supabase/migrations/20261018100000_ueb_004_exercise_plans.sql`; Darstellung `canReadExercisePlans` in `src/features/session/types.ts`. Geprüft in `supabase/tests/exercise-plans.test.ts`.

**Änderungspfad.** Andere Rollen: die Listen in beiden Funktionen und in `canReadExercisePlans` ändern · Aufwand `klein`.

**Abnahme (Jannes, 2026-10-09).** geändert: Das Büro liest auch Trainingspläne; schreiben bleibt wie gebaut. Umsetzung: BEF-137. **Umsetzung (ABN-030, 2026-10-09, BEF-137).** Der Zweig `training` von `app.can_read_exercise_plans` ruft `app.can_read_training_content()` (ANN-315); damit liest das Büro Trainingspläne und ihre Einheiten. `app.can_write_exercise_plans` ist unverändert. Scharf mit echten Daten erst nach B2.

### ANN-299 — Dosierung je Position: Sätze, Wiederholungen oder Dauer, Last und Tempo frei

Praxisprozess · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · erledigt · Wiedervorlage: Jannes (Sichtung Pläne)

**Annahme.** Eine Position trägt Sätze (1–20), **entweder** Wiederholungen von–bis (1–100; gleich für eine feste Zahl) **oder** eine Dauer in Sekunden (1–3600), dazu Last und Tempo als freien Text (je höchstens 40 Zeichen, etwa „Theraband rot“), eine Pause in Sekunden (0–600), das Kennzeichen „doppelte Progression“ (nur mit Wiederholungsbereich und Last) und einen Hinweis an die Person (höchstens 500 Zeichen). Die Einheiten je Woche (1–14) stehen am Plan. Höchstens 30 Positionen je Plan.

**Begründung.** Die Felder decken die Achsen aus IDEA-TRN-004 ab, die eine Dosis sind (Last, Wiederholungen, Sätze, Tempo, Dichte, Frequenz); die übrigen Achsen ändern die Variante. Last als Text, weil Bänder, Rucksack und Körpergewicht keine Zahl in kg sind. Die doppelte Progression (IDEA-TRN-007) braucht einen Bereich und eine Last, sonst gibt es nichts zu steigern.

**Anker.** Spalten und Prüfungen von `public.exercise_plan_items` und `public.save_exercise_plan_item` in `supabase/migrations/20261018100000_ueb_004_exercise_plans.sql`; Darstellung `src/features/exercise-plans/dosierung.ts`.

**Änderungspfad.** Andere Grenzen oder Felder: Constraint, Funktion und Formular `src/features/exercise-plans/PositionFormular.tsx` · Aufwand `klein`.

### ANN-300 — Mit der Zuweisung wird der Plan eingefroren; danach ändern sich nur Laufzeit und Ende

Praxisprozess · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · erledigt · Wiedervorlage: Jannes (Sichtung Pläne)

**Annahme.** Beim Zuweisen hält der Plan je Position die Bezeichnungen beider Sprachebenen, die Körperregion, die Kurzanleitung und die Ausrüstung der Variante fest, dazu die Dosierung. Danach ändert eine Änderung der Bibliothek nichts mehr daran, und am Plan ändern sich nur noch das Ende der Laufzeit, das Beenden und das Ablösen durch eine neue Fassung. Ein Entwurf darf verworfen werden; ein zugewiesener Plan wird nie gelöscht, nur beendet – er fällt erst mit seinem Verhältnis.

**Begründung.** IDEA-TRN-011: Was die Person bekommen hat, muss im Nachhinein feststellbar sein – bei einer Beschwerde oder einem Zwischenfall ist genau das die Frage. Dieselbe Unveränderlichkeit legen ADR-009 für die ausgestellte Rechnung und §5 für die finalisierte Dokumentation fest. Hinweise für die Praxis und Ausweichbewegungen gehören nicht in den Schnappschuss: Sie sind Fachwissen der Praxis, nicht Inhalt des Plans.

**Anker.** Die Riegel `public.exercise_plans_guard` und `public.exercise_plan_items_guard` in `supabase/migrations/20261018100000_ueb_004_exercise_plans.sql`; der Schnappschuss in `public.assign_exercise_plan` in `supabase/migrations/20261018110000_ueb_005_assign_exercise_plan.sql`. Geprüft in `supabase/tests/exercise-plans.test.ts`.

**Änderungspfad.** Weitere Felder einfrieren: Spalte und Zeile im Schnappschuss ergänzen · Aufwand `klein`. Korrektur eines zugewiesenen Plans ohne neue Fassung: ein eigener Korrekturweg mit Fassungskette wie in ADR-016 · Aufwand `mittel`.

### ANN-301 — Progression von Hand als neue Fassung: je Position höchstens ein Schritt in genau einer Achse

Praxisprozess · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · erledigt · Wiedervorlage: Jannes (Sichtung Pläne)

**Annahme.** Gesteigert oder zurückgenommen wird ein zugewiesener Plan in einer **neuen Fassung**: Sie übernimmt Titel, Einheiten je Woche und alle Positionen als Entwurf; je Plan gibt es höchstens eine Folgefassung. An einer übernommenen Position ändert sich gegenüber der vorigen höchstens eines von Variante, Wiederholungen bzw. Dauer, Sätze, Last, Tempo, Pause – und die Fachperson nennt Achse und Richtung dazu. Eine andere Variante nur über eine Verbindung der Bibliothek entlang dieser Achse; bei Sätzen, Wiederholungen und Pause prüft die Datenbank die Richtung – bei der Pause nur, wenn vorher und nachher eine steht; kommt eine hinzu oder fällt weg, gilt die genannte Richtung. Hinweis und Kennzeichen der doppelten Progression ändern sich frei; neue Positionen tragen keinen Schritt – wer eine Übung entfernt und neu hinzufügt, wechselt sie also ohne Verbindung (gewollt, zur Sichtung). Mit der Zuweisung löst die neue Fassung die vorige ab, die lesbar bleibt.

**Begründung.** IDEA-TRN-004: Nur eine Achse je Schritt macht eine Reaktion zuordenbar; IDEA-TRN-007: doppelte Progression ist ein Schritt auf der Achse Last bei gleichem Bereich. Der Schnappschuss (ANN-300) verbietet das Ändern des zugewiesenen Plans; die Fassungskette hält fest, was wann galt. Keine Funktion wählt den Schritt aus (ADR-006 Punkt 10); die Verbindungen der Bibliothek erscheinen erst, wenn die Fachperson Richtung und Achse gewählt hat.

**Anker.** `app.exercise_plan_step_check` und `public.create_exercise_plan_version` in `supabase/migrations/20261018120000_ueb_006_plan_versions.sql`. Geprüft in `supabase/tests/exercise-plans.test.ts`.

**Änderungspfad.** Mehrere Achsen je Schritt zulassen: die Zählung in `app.exercise_plan_step_check` lockern · Aufwand `klein`. Freie Änderung ohne Schritt: die Prüfung entfernen · Aufwand `klein`.

### ANN-302 — Laufzeit voreingestellt sechs Wochen, höchstens 26; Wiedervorlage sieben Tage vorher, bis entschieden ist

Praxisprozess · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · erledigt · Wiedervorlage: Jannes (Sichtung Pläne, nach den ersten Wochen mit echten Plänen)

**Annahme.** Jeder zugewiesene Plan hat ein Ende: beim Zuweisen Pflicht, voreingestellt sechs Wochen, höchstens 26 Wochen ab dem Tag. Sieben Tage vor dem Ende erscheint der Plan unter „Offene Punkte“ bei den Rollen, die ihn schreiben dürfen – nicht beim Büro –, und bleibt dort, auch nach dem Ende, bis jemand verlängert (wieder höchstens 26 Wochen ab heute; das erste Ende bleibt festgehalten), eine neue Fassung zuweist oder den Plan beendet.

**Begründung.** IDEA-ORG-006: Pläne ohne Ablaufdatum laufen ewig weiter; ein Ende erzwingt eine bewusste Entscheidung je Zyklus. Sechs Wochen entsprechen einem üblichen Behandlungs- und Trainingsblock; 26 Wochen sind die Grenze, ab der eine Übungsfolge kaum noch zur Lage passt. Die Wiedervorlage hängt nur am Datum – sie wertet keine Angabe der Person aus (ADR-006 Punkt 11). Das Büro schreibt keine Pläne und entscheidet deshalb nicht darüber.

**Anker.** `app.exercise_plan_max_days()` in `supabase/migrations/20261018110000_ueb_005_assign_exercise_plan.sql` und `app.exercise_plan_review_days()` in `supabase/migrations/20261018130000_ueb_007_plan_review.sql`; `LAUFZEIT_VORSCHLAG_TAGE` in `src/features/exercise-plans/laufzeit.ts`. Geprüft in `supabase/tests/exercise-plans.test.ts`.

**Änderungspfad.** Andere Zahlen: die Funktion bzw. die Konstante ändern · Aufwand `klein`. Wiedervorlage auch für das Büro: Rollenprüfung der Liste erweitern · Aufwand `klein`.

### ANN-303 — Der Plan als PDF ist ein Blatt aus dem Schnappschuss, gedruckt über den Browser

Technik · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · erledigt · Wiedervorlage: Jannes (Sichtung Pläne); mit dem serverseitigen Dokumentweg (OPS-001)

**Annahme.** „Plan als PDF“ ist eine Druckseite des zugewiesenen Plans, die der Browser zu Papier oder zu einer PDF-Datei macht – dieselbe Technik wie Rechnung, Vertrag und Terminzettel (B14 Weg 1). Das Blatt zeigt nur den Schnappschuss der Zuweisung in Alltagssprache (Bezeichnung, Dosierung in Worten, Anleitung, Ausrüstung, Hinweis, Laufzeit, Einheiten je Woche), nie die fachlichen Namen und nie die Bibliothek von heute; ein Entwurf hat kein Blatt. Die Praxis druckt es mit Namen der Person, die Plattform ohne.

**Begründung.** §4.6 und DSN-001 D2 verlangen den Plan als PDF, auch nach dem Ende der Behandlung; ADR-023 Punkt 7 versorgt Personen ohne Konto mit Plänen als PDF. Ein PDF-Generator wäre eine neue Abhängigkeit oder ein neuer Ausführungsort (ADR-015, OPS-001); der Browserdruck braucht keines von beiden. Die Datei entsteht auf dem Gerät und wird nicht abgelegt – aufbewahrt wird der Plan selbst (ANN-300).

**Anker.** `Planblatt` in `src/features/exercise-plans/Planblatt.tsx`; Seite der Praxis `PlanblattSeite.tsx`. Geprüft in `src/features/exercise-plans/Plaene.test.tsx`.

**Änderungspfad.** Ein abgelegtes PDF: serverseitige Erzeugung mit Ablage nach ADR-017, sobald der Dokumentweg der Rechnung (Weg 3) steht · Aufwand `mittel`. Andere Inhalte auf dem Blatt: die eine Komponente · Aufwand `klein`.

### ANN-304 — Die Plattform zeigt die zugewiesenen Pläne, ohne laufenden Plan den zuletzt beendeten

Praxisprozess · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · erledigt · Wiedervorlage: Jannes (Sichtung Plattform, Reiter Übungen)

**Annahme.** Der Reiter „Übungen“ (Behandlung) bzw. „Training“ zeigt alle zugewiesenen Pläne des Verhältnisses hinter dem gewählten Zugang, auch einen, der erst später beginnt („Ab …“). Läuft keiner, zeigt er den zuletzt beendeten Plan zum Lesen und als Blatt. Entwürfe und abgelöste Fassungen zeigt er nie. Gezeigt wird nur der Schnappschuss in Alltagssprache (Bezeichnung, Dosierung, Anleitung, Ausrüstung, Hinweis), ohne fachliche Namen und ohne den Namen der Fachperson. In der Behandlung gibt es den Plan ohne Abo (§4.6); er bleibt so lange sichtbar, wie der Zugang lesbar ist, also auch in der Lesefrist (DSN-001 D2).

**Begründung.** ADR-023 Punkt 22: Ein Plan ist sichtbar, weil er der Person zugewiesen ist. DSN-001 D2 verlangt „Plan als PDF“ nach dem Ende der Behandlung; wird der Plan dabei beendet, hätte die Person sonst nichts mehr mitzunehmen. Eine abgelöste Fassung hat immer eine gültige Nachfolgerin – zwei Fassungen nebeneinander würden verwirren. Die fachliche Sprachebene ist für die Praxis (IDEA-QSN-002).

**Anker.** `app.platform_visible_exercise_plans` in `supabase/migrations/20261019100000_ueb_009_platform_exercise_plans.sql`. Geprüft in `supabase/tests/platform-exercise-plans.test.ts`.

**Änderungspfad.** Auch ältere beendete Pläne zeigen oder den beendeten nie: die eine Funktion · Aufwand `klein`. Den Plan erst ab Laufzeitbeginn zeigen: eine Bedingung dort · Aufwand `klein`.

### ANN-305 — Jeder Haken der Durchführung geht sofort an den Server; in der Lesefrist wird nicht mehr erfasst

Technik · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · erledigt · Wiedervorlage: ADR-024 (Offline-Erfassung); Jannes (Sichtung Plattform)

**Annahme.** Die Durchführungsansicht speichert jeden abgehakten Durchgang sofort als Zeile am Server; eine Einheit entsteht mit dem ersten Haken, höchstens eine offene je Plan und Tag, und wer abbricht und wieder anfängt, setzt sie fort. Ohne Verbindung nimmt die Ansicht den Haken zurück und sagt „Nicht gespeichert“ – auf dem Gerät liegt nichts. Eine nicht beendete Einheit eines früheren Tages bleibt so stehen („nicht beendet“) und nimmt keinen Haken mehr an. Beenden geht erst nach mindestens einem Haken; an der Einheit steht, wer begonnen und wer beendet hat. Erfasst wird nur am zugewiesenen Plan ab seinem Beginn und nicht in der Lesefrist nach dem Ende des Verhältnisses bzw. des Nachsorge-Abos (DSN-001 4.3: „alle Knöpfe, die schreiben, fallen weg“). Erfasst werden Durchgänge, keine Ist-Werte (Last, Wiederholungen).

**Begründung.** IDEA-ORG-003 verlangt „Abbrechen ohne Datenverlust“ und nennt „keine Verbindung“ als Lage. ADR-015 Punkt 16 schließt einen Service Worker aus, ADR-024 steht aus; Gesundheitsdaten im Browser abzulegen wäre eine Offline-Erfassung, die ADR-001 erst mit Geräteregeln zulässt. ADR-001 verlangt, dass niemand glaubt, gespeichert zu haben, was nur lokal liegt. Ist-Werte gehören zu Verlauf und Tracking (Block 7, §17 Verbot 2).

**Anker.** `public.start_platform_exercise_session`, `app.platform_access_writable` und der Index `exercise_plan_sessions_one_open` in `supabase/migrations/20261019110000_ueb_010_exercise_sessions.sql`; Ansicht `src/features/platform/Durchfuehrung.tsx`. Geprüft in `supabase/tests/platform-exercise-sessions.test.ts` und `src/features/platform/Durchfuehrung.test.tsx`.

**Änderungspfad.** Offline-Erfassung mit späterem Abgleich: nach ADR-024, Warteschlange im Gerät und additive Übertragung · Aufwand `groß`. Erfassen auch in der Lesefrist: `app.platform_access_writable` aus der Prüfung nehmen · Aufwand `klein`. Ist-Werte je Durchgang: Spalten an `exercise_plan_session_sets` und Felder in der Ansicht · Aufwand `mittel`.

### ANN-306 — Eine Einheit erfassen die Person und ihre rechtliche Vertretung; im Training „schwierig, weil …“ nur mit Einwilligung

Datenschutz · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2, mit ANN-264)

**Annahme.** Eine Einheit beginnen, Durchgänge abhaken und beenden dürfen die Person selbst und ihre rechtliche Vertretung (Fähigkeit `exercise`), nicht die Begleitung. Das freiwillige „Das war schwierig, weil …“ (höchstens 500 Zeichen) gibt es in der Behandlung immer, im Training nur, solange die Einwilligung zu Gesundheitsangaben (`training_health_data`) erteilt ist. Die Praxis liest die Einheiten am Plan mit denselben Rollen wie den Plan (ANN-298): in der Behandlung owner, Therapeut:innen, Teamleitung und Büro (ADR-004 Fassung 2 Punkt 3), im Training owner und Trainingsbetreuung. Die Einheiten stehen in der Auskunft nach Art. 15 am Plan.

**Begründung.** ADR-023 Punkt 13 erlaubt der Begleitung Lesen, Wünsche und Nachrichten – eine Angabe zur Gesundheit für die Person ist keines davon, wie beim Befundbogen (ANN-248). Ein Freitext über Beschwerden im Training ist eine Angabe zur Gesundheit, die ADR-021 Punkt 4 an die ausdrückliche Einwilligung bindet; das bloße Abhaken sagt nur, dass trainiert wurde. Die Einheiten haben die Datenklasse ihres Plans und fallen mit ihm (ADR-008).

**Anker.** Zweig `exercise` in `app.platform_access_allows` und `app.platform_exercise_note_allowed` in `supabase/migrations/20261019110000_ueb_010_exercise_sessions.sql`. Geprüft in `supabase/tests/platform-exercise-sessions.test.ts`.

**Änderungspfad.** Begleitung darf abhaken: `exercise` in den ersten Zweig von `app.platform_access_allows` · Aufwand `klein`. Freitext im Training auch ohne Einwilligung oder gar nicht: die eine Funktion · Aufwand `klein`. Büro liest die Einheiten nicht: eigene Leseregel in `get_exercise_plan` · Aufwand `klein`.

### ANN-307 — Übungstage wählt die Person selbst; sie stehen nur in ihrer eigenen Woche

Praxisprozess · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · erledigt · Wiedervorlage: Jannes (Sichtung Plattform, Reiter Termine)

**Annahme.** Die Übungstage eines Plans wählt die Person (oder ihre rechtliche Vertretung) auf der Plattform als Wochentage; die Einheiten je Woche der Fachperson stehen daneben als Empfehlung. Die Wahl gilt auch für die nächste Fassung des Plans, bis sie neu getroffen wird; eine leere Wahl heißt „keine Tage“. Unter „Termine“ erscheint „Diese Woche“: heute und die sechs Tage danach, Termine und Übungstage nebeneinander, durch Wort und Zeichen unterschieden, ein Übungstag mit beendeter Einheit als „geübt“. Die Praxis sieht die Tage nicht und ihr Kalender bleibt unverändert; nur die Auskunft nach Art. 15 nennt sie. Es gibt keine Weitergabe an fremde Kalender.

**Begründung.** IDEA-ORG-004: Aus Sicht der Person ist beides „was diese Woche ansteht“; für die Praxis bleibt der bestehende Kalender die Arbeitsansicht. Der zugewiesene Plan ist eingefroren (ANN-300), feste Tage der Fachperson müssten in den Schnappschuss und machten jede Verschiebung zu einer neuen Fassung; die Person kennt ihre Woche selbst. Die Praxis braucht die Tage für keinen Zweck (Art. 5 Abs. 1 lit. c DSGVO). Eine Kalenderweitergabe nach außen wäre eine eigene Entscheidung nach ADR-002 (IDEA-ORG-004, „Vorsicht“).

**Anker.** `public.exercise_plan_days`, `app.exercise_plan_weekdays` und `public.set_platform_exercise_days` in `supabase/migrations/20261019120000_ueb_011_exercise_days.sql`; `src/features/platform/uebungstage.ts`. Geprüft in `supabase/tests/platform-exercise-days.test.ts`.

**Änderungspfad.** Tage legt die Fachperson fest: Spalte am Plan, Feld im Entwurf, Wahl der Person entfällt · Aufwand `mittel`. Die Praxis sieht die Tage am Plan: ein Schlüssel in `get_exercise_plan` · Aufwand `klein`.

### ANN-308 — Eine Frage ist ein Vorgang aus unveränderlichen Einträgen

Praxisprozess · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · erledigt · Wiedervorlage: Jannes (Sichtung Plattform, Reiter Nachrichten)

**Annahme.** Eine Nachricht auf der Plattform ist kein Chatverlauf, sondern ein Vorgang: Thema (Übung · Beschwerden · Termin oder Rechnung · Sonstiges), optional ein Bezug auf einen zugewiesenen Plan und eine Übung daraus (als Schnappschuss der Bezeichnung), Zustand offen · beantwortet · erledigt. Er besteht aus Einträgen – Frage, Antwort der Praxis, Nachtrag –, die nie geändert und nur mit dem Vorgang gelöscht werden; jeder Eintrag trägt, wer ihn geschrieben hat (bei einer Vertretung ihr Name als Schnappschuss, in der Praxis der Anzeigename). Nachtragen geht, solange der Vorgang nicht erledigt ist; danach ist eine neue Frage ein neuer Vorgang. Erledigen dürfen die Person (jede Art des Zugangs) und die Praxis. Auf der Plattform steht die Antwort als „Praxis“, ohne Namen der Fachperson.

**Begründung.** IDEA-KOM-001: Ein offener Chat hat keine Erledigungslogik, lässt sich nicht nach Zuständigkeit ordnen und ist der Akte nicht zuordenbar (§10). Unveränderliche Einträge sind die Voraussetzung dafür, dass in der Akte steht, was geschrieben wurde (IDEA-KOM-007, ADR-006 Punkt 3, § 630f BGB), und machen den Nachweis am Datensatz statt im Auditlog möglich (ADR-010 Fassung 3 Punkt 15). Ohne Namen der Fachperson wie beim Plan (UEB-009, ADR-023 Punkt 22).

**Anker.** `public.platform_messages`, `public.platform_message_entries` mit dem Trigger `platform_message_entries_guard` in `supabase/migrations/20261020100000_kom_001_platform_messages.sql`; Ansicht `src/features/platform/Nachrichten.tsx`. Geprüft in `supabase/tests/platform-messages.test.ts`.

**Änderungspfad.** Offener Chat ohne Vorgang: anderes Datenmodell · Aufwand `groß`. Namen der Fachperson auf der Plattform: ein Schlüssel in `public.platform_messages(uuid)` · Aufwand `klein`. Nur die Praxis erledigt: ein Zweig weniger in `close_platform_message` · Aufwand `klein`.

### ANN-309 — Antwortfrist in Werktagen aus den Praxisstammdaten, überwacht über die Fälligkeit

Praxisprozess · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · erledigt · Wiedervorlage: Jannes (Sichtung Plattform und Kommunikation, nach den ersten Praxiswochen)

**Annahme.** Über jedem Eingabefeld steht „Antwort in der Regel innerhalb von zwei Werktagen.“ und der Notfallhinweis aus DSN-001 4.1, für alle gleich. Die Zahl steht in den Praxisstammdaten (`organizations.message_response_workdays`, 1 bis 10, voreingestellt 2) und ändert nur `owner`. Werktage sind Montag bis Freitag; Feiertage kennt die Anwendung nicht. Fällig ist eine Frage am n-ten Werktag nach dem Tag ihres Eingangs (Samstag zählt ab Montag); ein Nachtrag nach einer Antwort setzt eine neue Frist, ein Nachtrag vor der Antwort nicht. Eingehalten wird die Zusage über die Sicht der Praxis: „Antwort fällig bis …“ an jedem offenen Vorgang und unter „Offene Punkte“ die Zahl der offenen und der überfälligen, die überfälligen mit Wort. Es gibt keine Benachrichtigung und keine Eskalation.

**Begründung.** IDEA-KOM-002: „Eine Zusage ohne Überwachung ist schlechter als keine“ – die Praxis muss sehen, was fällig ist. DSN-001 4.1 nennt die Frist einen Platzhalter aus Praxisstammdaten. Benachrichtigungen regelt erst ADR-024 (KOM-EPIC-003). Ein Feiertagskalender wäre eine eigene Datenquelle je Bundesland für eine Zusage „in der Regel“.

**Anker.** Spalte `organizations.message_response_workdays`, `app.add_workdays` und `app.message_due_on` in `supabase/migrations/20261020100000_kom_001_platform_messages.sql`; der Wortlaut in `src/features/platform/nachrichtentexte.ts`. Geprüft in `supabase/tests/platform-messages.test.ts`.

**Änderungspfad.** Andere Frist: die Zahl in den Praxisstammdaten · Aufwand `klein`. Feiertage berücksichtigen: Kalendertabelle und `app.add_workdays` · Aufwand `mittel`. Erinnerung an die Praxis bei Überschreitung: mit KOM-EPIC-003 nach ADR-024 · Aufwand `mittel`.

### ANN-310 — In der Behandlung liest das Büro alle Rückfragen, antwortet aber nur auf Termin, Rechnung und Sonstiges

Praxisprozess · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · erledigt · Wiedervorlage: Jannes (Sichtung Kommunikation)

**Annahme.** Rückfragen aus der Behandlung lesen `owner`, Therapeut:innen, Teamleitung und Büro (E15). Antworten und erledigen dürfen `owner`, Therapeut:innen und Teamleitung jede Rückfrage, das Büro nur „Termin oder Rechnung“ und „Sonstiges“. Bei „Übung“ und „Beschwerden“ sagt die Seite dem Büro, dass Therapeut:innen antworten. Die Liste unter Kommunikation → Rückfragen trägt keinen Text; erst das Öffnen liest den Inhalt und steht als „Akte geöffnet“ im Protokoll (einmal je Tag und Akte, ADR-010 Fassung 3).

**Begründung.** ADR-004 Punkt 3: Das Büro liest klinische Inhalte wie Therapeut:innen, schreibt aber keine klinische Dokumentation. Eine Antwort auf eine Frage zu Beschwerden oder zur Ausführung einer Übung ist eine fachliche Auskunft und gehört zu den therapeutischen Rollen (§4.2); Termine und Rechnungen sind Sache des Büros (§4.3). Eine Trefferliste ohne Inhalt ist kein Lesen (ADR-010 Konsequenzen).

**Anker.** `app.can_read_platform_message` und `app.can_answer_platform_message` in `supabase/migrations/20261020110000_kom_002_practice_messages.sql`; Seite `src/features/messages/RueckfragenPage.tsx`. Geprüft in `supabase/tests/practice-messages.test.ts`.

**Änderungspfad.** Büro antwortet auf alles: ein Zweig in `app.can_answer_platform_message` · Aufwand `klein`. Büro liest Übung und Beschwerden nicht: ein Zweig in `app.can_read_platform_message` · Aufwand `klein`.

### ANN-311 — Im Training: Gesundheitsthemen nur mit Einwilligung, das Büro liest alles und antwortet wie in der Behandlung

Datenschutz · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · Änderung BEF-137 · Wiedervorlage: Datenschutzprüfung (B2, mit ANN-264 und ANN-306)

**Annahme.** Im Training gibt es die Themen „Übung“ und „Beschwerden“ nur, solange die Einwilligung zu Gesundheitsangaben (`training_health_data`) erteilt ist; nach einem Widerruf kein Nachtrag mehr dazu, bestehende Vorgänge bleiben lesbar. „Termin oder Rechnung“ und „Sonstiges“ gehen immer. Die Praxis liest Nachrichten aus dem Training im Bereich Training (DSN-001 D1 b): `owner`, Trainingsbetreuung und Büro alle (Fassung 2); `owner` und Trainingsbetreuung beantworten alle, das Büro „Termin oder Rechnung“ und „Sonstiges“ (Fassung 3). *Fassung 1: Das Büro las und beantwortete nur „Termin oder Rechnung“.*

**Begründung.** ADR-021 Punkt 4: Gesundheitsangaben im Training brauchen die ausdrückliche Einwilligung; dieselbe Stelle wie „Das war schwierig, weil …“ (ANN-306). DSN-001 D1 überlässt die Sicht des Büros diesem Loop und nennt „Termin oder Rechnung“ als den organisatorischen Teil (wie ANN-184). „Sonstiges“ kann Gesundheitliches enthalten; deshalb liest das Büro es im Training nicht.

**Anker.** `app.platform_message_topic_allowed` in `supabase/migrations/20261020100000_kom_001_platform_messages.sql`; die Sicht der Praxis in `app.can_read_platform_message` (KOM-002); wer antwortet, in `app.can_answer_platform_message` (`supabase/migrations/20261022130000_bef_139_office_answers_training_other.sql`). Geprüft in `supabase/tests/platform-messages.test.ts` und `supabase/tests/practice-messages.test.ts`.

**Änderungspfad.** Gesundheitsthemen im Training auch ohne Einwilligung oder gar nicht: die eine Funktion · Aufwand `klein`. Büro liest im Training alles oder nichts: ein Zweig in `app.can_read_platform_message` · Aufwand `klein`. **Fassung 2 (ABN-030, 2026-10-09, BEF-137).** Das Büro liest im Training alle Rückfragen (`app.can_read_platform_message` → `app.can_read_training_content()`, ANN-315); antworten und erledigen bleibt bei „Termin oder Rechnung“ – BEF-137 öffnet das Lesen, nicht das Schreiben (Zweitreview S1). Ob das Büro im Training wie in der Behandlung auch auf „Sonstiges“ antworten soll, entscheidet Jannes; Änderungspfad: der Zweig `training` in `app.can_answer_platform_message` · Aufwand `klein`.

**Abnahme (Jannes, 2026-10-09).** geändert: Das Büro liest im Training alle Rückfragen (Regel BEF-137, scharf nach B2); antworten darf es weiter nur bei „Termin oder Rechnung“. Umsetzung: BEF-137. **Umgesetzt (ABN-030, 2026-10-09):** Fassung 2. **Entschieden (Jannes, 2026-10-10):** Das Büro antwortet im Training wie in der Behandlung auch auf „Sonstiges“. **Fassung 3 (BEF-139, 2026-10-10):** Das Büro antwortet und erledigt im Training bei „Termin oder Rechnung“ und „Sonstiges“, nicht bei „Übung“ und „Beschwerden“; eine Antwort ist kein Trainingsinhalt nach ADR-021 Punkt 10.

### ANN-312 — Klinisch Relevantes kommt als Verweis am Vorgang in die Akte, endgültig

Datenschutz · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · Prüfpaket · Wiedervorlage: Jannes (Sichtung Kommunikation); Datenschutzprüfung (B2, Fristen nach ADR-008)

**Annahme.** Eine Rückfrage aus der Behandlung ordnen `owner`, Therapeut:innen und Teamleitung mit „In die Akte übernehmen“ der Akte zu; das Büro nicht, im Training gibt es keine Akte. Zugeordnet wird der ganze Vorgang mit allen Einträgen, auch späteren. Die Zuordnung ist ein Verweis am Vorgang (wer, wann, unter welchem Namen), keine Kopie; der Text bleibt unverändert, und die Zuordnung ist endgültig – auch am Schreibpfad vorbei verhindert ein Trigger das Zurücknehmen. Danach steht der Vorgang im Reiter „Doku“ der Akte unter „Nachrichten in der Akte“ mit Herkunft und gehört zur Datenklasse der Akte (zehn Jahre ab Abschluss der Versorgung); nicht zugeordnete Vorgänge der Behandlung fallen drei Jahre nach Ende des Jahres, in dem sie erledigt oder – ohne weitere Frage der Person – zuletzt beantwortet wurden (ADR-008, „Organisatorische Patientenkommunikation“; Zweitreview S1). Beim Zusammenführen zweier Akten ziehen alle Rückfragen mit. Im Training fallen sie mit dem Verhältnis nach drei Jahren, auch wenn Belege länger bleiben. Auskunft nach Art. 15 und Plattformexport nennen alle Rückfragen.

**Begründung.** §10 verlangt die Zuordnung durch die Therapeut:in, §5 und § 630f BGB Nachvollziehbarkeit ohne Überschreiben; IDEA-KOM-007 verlangt sichtbare Herkunft ohne Veränderung. Der Vorgang liegt schon im Behandlungsverhältnis und ist unveränderlich (ANN-308) – eine Kopie wäre ein zweiter Datensatz desselben Inhalts mit eigener Frist, ohne Gewinn. Das Büro schreibt keine klinische Dokumentation (ADR-004 Punkt 3); die Zuordnung ist eine klinische Einordnung. Endgültig, weil eine Akte nicht nachträglich verkleinert wird (ADR-016 Punkt 5). Unsicher: ob die drei Jahre für nicht zugeordnete Nachrichten mit klinischem Inhalt genügen, wenn die Zuordnung unterbleibt – der Pflichtsatz aus §10 liegt bei der Praxis.

**Anker.** `app.can_assign_platform_message`, `public.assign_platform_message_to_record`, Trigger `platform_messages_record_final` und `public.list_record_platform_messages` in `supabase/migrations/20261020120000_kom_004_messages_in_record.sql`; die Regel im Löschlauf in `supabase/migrations/20261020100000_kom_001_platform_messages.sql`; Oberfläche `src/features/messages/InDieAkte.tsx`. Geprüft in `supabase/tests/record-messages.test.ts`.

**Änderungspfad.** Zuordnung als Kopie in einen Dokumentationseintrag: eigener Eintragstyp nach ADR-016 · Aufwand `mittel`. Zuordnung rücknehmbar: Trigger und eine Funktion · Aufwand `klein`. Büro ordnet zu: ein Zweig in `app.can_assign_platform_message` · Aufwand `klein`. Alle Nachrichten der Behandlung wie die Akte aufbewahren: Klasse `patientenkommunikation` auf die Frist der Akte · Aufwand `klein`.

### ANN-313 — In der Lesefrist werden keine Fragen mehr gestellt

Praxisprozess · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · erledigt · Wiedervorlage: Jannes (Sichtung Plattform)

**Annahme.** Nach dem Ende des Verhältnisses bzw. des Nachsorge-Abos sind die Nachrichten 30 Tage lang lesbar; eine neue Frage, ein Nachtrag oder „Hat sich erledigt“ gehen dann nicht mehr. Die Seite sagt, dass neue Fragen direkt an die Praxis gehen.

**Begründung.** DSN-001 4.3: In der Lesefrist „fallen alle Knöpfe weg, die schreiben“ – dieselbe Regel wie beim Üben (ANN-305), an derselben Stelle (`app.platform_access_writable`). Eine Antwortzusage für ein beendetes Verhältnis setzte eine Betreuung voraus, die es nicht mehr gibt.

**Anker.** `app.assert_platform_message` in `supabase/migrations/20261020100000_kom_001_platform_messages.sql`. Geprüft in `supabase/tests/platform-messages.test.ts`.

**Änderungspfad.** Fragen auch in der Lesefrist (etwa zur letzten Rechnung): `app.platform_access_writable` aus der Prüfung nehmen oder nur für „Termin oder Rechnung“ · Aufwand `klein`.

### ANN-314 — Kommunikation ist mit den Rückfragen nicht mehr ganz Vorschau

Technik · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 09.10.2026) · erledigt · Wiedervorlage: Jannes (Sichtung am Handy)

**Annahme.** Der Bereich Kommunikation öffnet auf „Rückfragen“ (`/rueckfragen`), dem ersten Punkt, der wirkt; der Teamchat steht als zweiter Unterpunkt und bleibt als Vorschau gekennzeichnet. Damit ist der Bereich nicht mehr ganz Vorschau und steht bei Therapeut:innen, Teamleitung und Büro am Telefon wieder in der Leiste („Nachrichten“); bei `owner` bleibt er wegen der Zahl der Bereiche hinter „Mehr“.

**Begründung.** ANN-244 („Reife vor Reihenfolge“) stellte nur Bereiche hinter „Mehr“, die ganz Vorschau sind – damals allein die Kommunikation. DSN-001 Abschnitt 6 legt die Rückfragen der Behandlung genau dorthin. Eine Rückfrage mit Antwortzusage muss so schnell erreichbar sein wie die Übersicht.

**Anker.** Eintrag `team` in `src/app/navigation.tsx`. Geprüft in `src/app/navigation.test.tsx` und `src/app/AppShell.test.tsx`.

**Änderungspfad.** Rückfragen als eigener Bereich oder nur in der Übersicht: Eintrag in `navigation.tsx` · Aufwand `klein`. Kommunikation wieder hinter „Mehr“: `vorschau: true` zurück · Aufwand `klein`.

### ANN-315 — Eine Leseregel für das Training: owner, Trainingsbetreuung und Büro

Datenschutz · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 10.10.2026) · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2, ADR-021 Punkt 10)

**Annahme.** Was ein Trainingsverhältnis an Inhalt trägt – Protokoll, Voraussetzungsprofil mit Übernahmen, Pläne und Einheiten, Rückfragen –, lesen genau `owner`, Trainingsbetreuung und Büro, nach einer Funktion `app.can_read_training_content()`; was künftig hinzukommt, liest nach derselben. Schreiben regelt je Inhalt eine eigene Funktion, in der das Büro nicht steht. Die Übungsbibliothek ist kein Inhalt eines Verhältnisses und liest zusätzlich die Behandlung.

**Begründung.** BEF-137 macht aus vier einzelnen Lesegrenzen eine Regel (§4.3, ADR-021 Fassung 3 Punkt 10). Eine Regel an einer Stelle hält sie für die nächsten Loops gleich und macht die Rücknahme nach der DSFA klein. Therapeut:innen und Teamleitung stehen nicht darin (kein Durchgriff, Punkt 6).

**Anker.** `app.can_read_training_content` in `supabase/migrations/20261021100000_abn_030_office_reads_training.sql`; `canReadTrainingContent` in `src/features/session/types.ts`. Geprüft in `supabase/tests/training-profile.test.ts`, `exercise-plans.test.ts`, `practice-messages.test.ts`, `exercise-library.test.ts` und `src/features/session/types.test.ts`.

**Änderungspfad.** Das Büro im Training wieder ausnehmen (etwa nach der DSFA): `office` aus `app.can_read_training_content` und `canReadTrainingContent` nehmen, dazu `app.can_read_exercise_library` · Aufwand `klein`. Einen Inhalt einzeln ausnehmen: dessen Leseprüfung auf eine eigene Funktion stellen · Aufwand `klein`.

**Abnahme (Jannes, 2026-10-10).** Bestätigt: eine Leseregel für alles, was ein Trainingsverhältnis trägt, auch für künftige Inhalte; das Büro schreibt nichts Fachliches. Bleibt im Prüfpaket (B2).

### ANN-316 — Fotos aus dem Verlauf ohne Wahl; keine neue Arbeitshilfe, die Fotoeinwilligung nur noch zum Widerruf

Datenschutz · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 10.10.2026) · Prüfpaket · Wiedervorlage: Jannes (Sichtung Befund, Schritt 10); Datenschutzprüfung (B2, ADR-017 Punkt 45)

**Annahme.** „Foto aufnehmen“ im Verlauf öffnet die Kamera ohne Wahl; jedes Foto ist ein Dokumentationsfoto, über dem Bild steht „Teil der Dokumentation (Akte, zehn Jahre); löschen nur heute“. Die Vorbereitung eines Uploads weist die Art `patientenfoto` ab; vorhandene Arbeitshilfen bleiben bis Frist oder Widerruf. Die Einwilligung zu Fotos zeigen Akte und Plattform nur noch, solange sie erteilt ist – zum Widerruf; angeboten wird sie nicht mehr. An Anmeldebogen und Rezept erinnern die bestehenden Stellen (Kopfzeile der Akte, Offene Punkte „Erstaufnahme“, Verordnungsfoto am Termin); eine neue Erinnerung kommt nicht dazu. **Ablösung:** ersetzt ANN-221.

**Begründung.** BEF-135, ADR-017 Fassung 4 Punkte 56 und 57. Den Schlüssel `patientenfoto` zu entfernen, kostete eine Migration über Katalog, Klassen, Löschlauf und Herausgabe, solange noch eine Arbeitshilfe liegen kann. Eine Einwilligung, die nichts mehr erlaubt, soll niemand neu erteilen; der Widerruf muss bleiben, weil er vorhandene Arbeitshilfen löscht. Der Server nimmt eine Erteilung noch an – sie bleibt ohne Wirkung, weil keine Arbeitshilfe mehr entsteht.

**Anker.** `prepare_patient_file_upload` in `supabase/migrations/20261021120000_abn_032_no_new_photo_aids.sql`; `HINWEIS_DOKUMENTATION` und `Aufnahme` in `src/features/files/FotosImVerlauf.tsx`; `einwilligungAngeboten` in `src/lib/einwilligung.ts`. Geprüft in `supabase/tests/patient-photos.test.ts`, `documentation-photos.test.ts`, `FotosImVerlauf.test.tsx`, `src/lib/einwilligung.test.ts`.

**Änderungspfad.** Arbeitshilfe wieder zulassen: die Abweisung in `prepare_patient_file_upload` streichen, `einwilligungAngeboten` leeren und die Wahl in `Aufnahme` zurückholen (Git-Verlauf) · Aufwand `mittel`. Arbeitshilfe ganz entfernen, wenn keine mehr liegt: Art, Klasse, Bucket und Einwilligungszweck per Migration · Aufwand `groß`.

**Abnahme (Jannes, 2026-10-10).** Bestätigt wie gebaut, auch dass der Server eine Erteilung der Fotoeinwilligung noch ohne Wirkung annimmt; der Zweck entfällt ganz erst, wenn keine Arbeitshilfe mehr liegt. Bleibt im Prüfpaket (B2).

### ANN-317 — Lückenfinder: erst 60 Minuten, sonst 45, gekennzeichnet „nur 45 Min.“

Praxisprozess · entschieden (Jannes) · 2026-10-09 · Jannes (Abnahme 10.10.2026) · erledigt · Wiedervorlage: Jannes (Sichtung Kartendienst, Lückenfinder)

**Annahme.** Der Lückenfinder fragt je Lücke zuerst für 60 Minuten (Terminfenster), dann für 45. Es gilt die erste Dauer, für die die Lücke **passt** oder **knapp** ist; dann steht hinter dem Wort „· nur 45 Min.“, auch vorgelesen. Passt sie für keine, steht die Stufe der längsten geprüften Dauer da; kürzer als 45 Minuten heißt „zu kurz“. Lädt die Antwort für 60 noch, wartet die Lücke, damit sie nicht von „nur 45“ auf „passt“ springt.

**Begründung.** BEF-136: 45 Minuten sind eine mögliche Termindauer, 60 bevorzugt. Eine Lücke, die nur 45 trägt, soll man auf einen Blick von einer vollen unterscheiden, ohne eine neue Farbe einzuführen (die Farben sagen die Fahrzeit, ANN-195). Zwei Fragen je Lücke in einem Aufruf von `check_travel_fit` statt zweier Aufrufe.

**Anker.** `KURZE_TERMINDAUER_MINUTEN` und die Auswahl in `useLueckenfinder` in `src/features/appointments/lueckenfinder.ts`; `LUECKEN_DAUERN` in `CalendarPage.tsx`; `kuerzer` in `CalendarGrid.tsx`. Geprüft in `lueckenfinder.test.tsx`, `CalendarGrid.test.tsx`, `CalendarPage.test.tsx`.

**Änderungspfad.** Andere oder weitere Dauern: `LUECKEN_DAUERN` · Aufwand `klein`. Die Dauer aus der Verordnung: siehe ANN-239 · Aufwand `klein`.

**Abnahme (Jannes, 2026-10-10).** Bestätigt. Sichtbar wird es in der Sichtung Kartendienst (Lückenfinder).

### ANN-318 — Auch die Plattform bleibt bei einem gescheiterten Nachladen des Zugangs stehen

Technik · offen · 2026-10-10 · — · — · Wiedervorlage: Jannes (Sichtung Rahmen, Schritt 13)

**Annahme.** Wie das Praxisprofil nach BEF-046: Ist der Plattformkontext (`platform_context`) geladen und scheitert nur ein Nachladen, etwa nach dem Wieder-online, bleibt die Plattform stehen. Oben steht „Ihr Zugang ließ sich gerade nicht aktualisieren. Eingaben bleiben erhalten.“ mit „Erneut versuchen“. Nur ohne geladenen Zugang ersetzt die Seite „Zugang nicht geladen“.

**Begründung.** Jannes' Entscheidung zu BEF-046 (2026-10-09) nennt das Praxisprofil; die Plattform hatte denselben Fehler, und eine Nachricht an die Praxis wäre im Funkloch genauso verloren gegangen (§13). Ein Recht erweitert das nicht: Ein gesperrter oder entzogener Zugang kommt aus `platform_context` als Zeile mit Zustand zurück, nicht als Fehler, und jede Plattformprojektion prüft den Zugang bei jeder Anfrage selbst (ADR-023 Punkte 18 und 19). Bis zum nächsten gelungenen Laden zeigt die Plattform höchstens schon Geladenes.

**Anker.** `OhneProfil` in `src/app/App.tsx` (`data === undefined`, `ZUGANG_NICHT_AKTUALISIERT`). Geprüft in `App.nachladen.test.tsx`.

**Änderungspfad.** Die Plattform soll wie bisher bei jedem Fehler ersetzen: die Bedingung in `OhneProfil` auf `isError` zurückstellen · Aufwand `klein`.

### ANN-319 — Der Entwurf sichert sich nach drei Sekunden Pause von selbst; nach einem Fehlschlag setzt das aus

Technik · offen · 2026-10-10 · — · — · Wiedervorlage: Jannes nach dem ersten Feldtag mit Dokumentation unterwegs (wie ANN-046)

**Annahme.** Steht der getippte Text drei Sekunden still und ist noch etwas ungespeichert, sichert die Seite ihn als Entwurf auf dem Server – derselbe Weg wie „Als Entwurf speichern“, nie eine Finalisierung. Das gilt an der Schreibseite des Termins, am Nachtrag (anlegen und bearbeiten), am Therapiebericht und an der Erhebung; nicht an der Korrektur (sie kennt keinen Entwurf, ANN-046) und **nicht am Vermerk „Tür geöffnet, nicht behandelt“**. Gesichert wird nur, was sich sichern lässt (nicht leer, nicht zu lang, keine beanstandete Antwort, bei einer Korrektur der Erhebung mit Begründung), nicht ohne Verbindung und nicht, während ein anderer Schreibvorgang läuft. Scheitert die Sicherung dauerhaft (Konflikt, inzwischen finalisiert oder abgesagt), steht der Fehler da und sie setzt aus, bis ein ausdrückliches Speichern gelingt; scheitert sie vorübergehend (Funkloch), versucht sie es mit der nächsten Eingabe oder der zurückkehrenden Verbindung wieder. Ungespeichert ist, was vom Stand abweicht, wie der Server ihn speichert (ohne Leerzeichen und Zeilenumbrüche an den Rändern). Der Stand steht als leise Zeile da: „Als Entwurf gesichert um 10:42.“ **Folge am Nachtrag:** Nach drei Sekunden Tippen ist ein Nachtrag-Entwurf angelegt; „Abbrechen“ lässt ihn danach stehen, und mit der Frist wird er Version 1 (ADR-016 Punkt 7) – bisher blieb nach einem Abbruch nichts zurück.

**Begründung.** BEF-056, Entscheidung Jannes 2026-10-09 (Option 2): Am iPhone fragt beim Wegwischen der App niemand nach; der Schutz soll dort greifen, wo unterwegs am meisten passiert (§13). Drei Sekunden sind eine Pause im Satz, nicht zwischen zwei Buchstaben. Das Aussetzen nach einem Fehlschlag verhindert, dass die Sicherung im Konfliktfall still den Entwurf einer Kollegin überschreibt (ADR-016 Punkt 3 kennt beim Entwurf keine Versionen). Am Vermerk entstünde ein Entwurf ohne `visit_without_treatment`, den die Frist als gewöhnliche Behandlung festschriebe (ADR-016 Punkt 7, ANN-055) – dort bleibt es beim ausdrücklichen „Entwurf“ und „Mit Vermerk festschreiben“. Ein offener Bausteinvorschlag geht nie in den Text (ANN-120); die Befundangaben werden wie bisher daneben gesichert. Folge laut Befund: Entwürfe entstehen früher und laufen früher in die Frist.

**Anker.** `SELBST_SICHERN_PAUSE_MS` und `selbst` in `useTextverlustschutz` (`src/features/documentation/Textverlustschutz.tsx`); die Bedingungen je Seite in `TreatmentNotePage.tsx`, `CompleteTreatmentPage.tsx` (`selbst: ohneBehandlung ? undefined : …`), `TreatmentNoteAddendumPage.tsx`, `TherapieberichtPage.tsx`, `ErhebungPage.tsx`. Geprüft in `Textverlustschutz.test.tsx` („Sicherung von selbst“, sechs Fälle) und den Seitentests.

**Änderungspfad.** Andere Pause: die Konstante · Aufwand `klein`. Abschalten an einer Seite: `selbst` weglassen · Aufwand `klein`. Auch am Vermerk sichern: erst der Entwurfsweg muss den Vermerk tragen (Migration an `create_treatment_note`/`update_treatment_note`) · Aufwand `mittel`.

### ANN-320 — Im Konfliktfall wird der Text ein Nachtrag-Entwurf oder füllt die Korrektur; übergeben wird im Arbeitsspeicher

Praxisprozess · offen · 2026-10-10 · — · — · Wiedervorlage: Jannes (Sichtung Befund, UX-EPIC-007)

**Annahme.** Ist ein Entwurf inzwischen finalisiert – von der Frist oder einer Kollegin – und steht eigener Text im Feld, bietet die Seite „Als Nachtrag übernehmen“ und „In Korrektur übernehmen“ an. Der Nachtrag entsteht als **Entwurf** und öffnet sich zum Weiterschreiben und Festschreiben („Nachtrag festschreiben“ steht jetzt auf der Nachtragsseite, mit der Folge über dem Knopf); die Korrektur öffnet sich mit dem Text im Feld, die Begründung schreibt die Person. Der Text reist zur Korrektur in einer Tabelle im Arbeitsspeicher der Seite, nicht im Navigationszustand des Browsers; beim Sitzungsende wird sie geleert. Ist der Entwurf nur von einer Kollegin geändert, lädt die Seite den Stand nach, der Text bleibt im Feld, und erst ein ausdrückliches Speichern ersetzt den anderen Stand.

**Begründung.** BEF-056 (2): Der Text soll immer einen Weg in die Akte finden (ADR-016 Punkt 6). Als Entwurf, weil ein Konflikt keine Finalisierung auslösen darf (Punkt 4) – festgeschrieben wird ausdrücklich. `history.state` schreiben Browser für die Sitzungswiederherstellung auf das Gerät; das wäre ein lokaler Zwischenspeicher für Gesundheitsdaten (ADR-015, ANN-015). Für das Ersetzen eines fremden Entwurfs gilt ADR-016 Punkt 3 (Entwurf frei änderbar); dass es nur ausdrücklich geschieht, sichert ANN-319.

**Anker.** `textUebergeben`, `nachtragFestschreiben` und `useTextUebernahme` in `src/features/documentation/uebernahme.ts`; `TextUebernehmen` in `Zustaende.tsx`. Geprüft in `TreatmentNotePage.test.tsx` („Übernahme im Konfliktfall“), `CompleteTreatmentPage.test.tsx`, `TreatmentNoteRevisionPage.test.tsx`, `TreatmentNoteAddendumPage.test.tsx`.

**Änderungspfad.** Nachtrag sofort festschreiben: im Hook nach dem Anlegen `nachtragFestschreiben` aufrufen · Aufwand `klein`. Den fremden Entwurf nie ersetzen: im Speicherweg nach einem Konflikt sperren · Aufwand `klein`.
