# Annahmenregister

Zuletzt aktualisiert: 2026-09-21.

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
Zusatz der Statuszeile ist `Prüfpaket`, `erledigt` oder `—`.

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
Zusatz `Prüfpaket` (heute 30 Einträge):
`grep -n -A2 '^### ANN-' docs/decisions/ASSUMPTIONS.md | grep 'Prüfpaket'`.
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

Datenschutz · offen · 2026-08-28 · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung / DSFA-Prozess vor Produktivstart

**Annahme.** Die Fristen ohne unmittelbare gesetzliche Vorgabe gelten vorläufig so, wie ADR-008 und ADR-011 sie tabellieren — von 7 Tagen (nicht angenommene KI-Entwürfe) über 30 Tage (Routing-Rohdaten, Operational Logs) und 12 Monate (Terminanfragen ohne Behandlungsverhältnis, Auth-/Securitylogs, Teamchat rollierend) bis 3 Jahre (abgesagte Termine und No-shows ohne Rechnung ab Jahresende, organisatorische Patientenkommunikation, Patientenakten-Auditlog, AI-Gateway-Metadaten).

**Begründung.** Art. 5 Abs. 1 lit. e DSGVO verlangt je Zweck eine definierte Frist; gesetzlich bestimmt sind nur Behandlungsunterlagen (§630f Abs. 3 BGB) und steuerlich relevante Belege (§147 AO, §257 HGB). Die übrigen hat ADR-008 als interne Initialentscheidung gesetzt und selbst zur Validierung vorgemerkt; §195 BGB und Art. 5 Abs. 2 DSGVO sind naheliegende Anker, aber eine Lesart, keine belegte Herleitung.

**Anker.** `public.retention_classes` in `supabase/migrations/20260911150000_retention_schedule.sql` — die einzige Stelle, gelesen nur über `app.retention_interval()`; Zuordnung in `public.retention_assignments`, geprüft von `supabase/tests/retention.test.ts`.

**Änderungspfad.** Frist ändern: Migration mit `update` auf `public.retention_classes`, Tabelle in ADR-008 nachziehen · Aufwand `klein`. Neue Frist, wo bisher keine galt: zusätzlich fachlicher Anker und Regel in `public.apply_retention()` · Aufwand `mittel`. Bewusst kein Klickweg in der Oberfläche (ADR-013).

### ANN-002 — Versorgungsstatus `inactive` und Rollenschnitt des Wechsels

Praxisprozess · entschieden (Jannes) · 2026-09-08 · Jannes · erledigt · Wiedervorlage: Jannes (Rollenschnitt, B9); der Behandlungsabschluss ist mit ANN-032 erledigt

**Ablösung.** abgelöst durch ANN-032 in der Frage „Behandlungsabschluss"

**Annahme.** `inactive` ist eine rein organisatorische Markierung („nicht in laufender Versorgung"), kein Behandlungsabschluss im Sinne von ADR-008, und startet keine Aufbewahrungsfrist. Den Status wechseln dürfen `owner`, `team_lead` und `office`, `therapist` nicht.

**Begründung.** Der Wechsel nimmt eine Person aus dem laufenden Betrieb und ist damit Praxisführung und Verwaltung (`PROJECT_PRINCIPLES.md` §4.1, §4.3, §4.5), kein Behandlungsschritt; der „Abschluss der Behandlung" ist in ADR-008 eigene Folgefrage und braucht ein eigenes Feld mit ADR-Bezug.

**Anker.** `app.can_change_patient_status()` und `set_patient_status` in `supabase/migrations/20260829110000_patient_status.sql`; Abnahmeschritt PAT-003 in `docs/abnahme/etappe-0-patienten-und-termine.md`.

**Änderungspfad.** Rollenschnitt: Migration, die `app.can_change_patient_status()` ersetzt · Aufwand `klein`. Behandlungsabschluss: eigenes Feld und eigene Regel statt dieser Funktion · Aufwand `mittel`, weil die klinische Retention daran hängt.

### ANN-003 — Adress-Snapshot beim Hausbesuchstermin

Datenschutz · offen · 2026-08-30 · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung / DSFA-Prozess vor Produktivstart; Bestätigung durch Jannes steht aus

**Annahme.** Für Hausbesuche wird die Patientenadresse bei der Terminanlage in den Termin kopiert (`visit_street`, `visit_house_number`, `visit_postal_code`, `visit_city`), nicht referenziert; eine spätere Stammdatenänderung ändert nicht rückwirkend, wohin an diesem Tag gefahren wurde. Die Adresse liegt damit doppelt vor und unterliegt im Termin der Frist „organisatorische Behandlungsdaten" — auch bei abgesagten Terminen.

**Begründung.** Behandlungsnachweis (§4.4) und spätere Abrechnung (§19, Snapshot-Prinzip aus ADR-009) brauchen den damaligen Ort; die Datenminimierung nach Art. 5 Abs. 1 lit. c DSGVO ist gewahrt, solange nur die für die Anfahrt nötigen Felder kopiert werden. Wunder Punkt ist der abgesagte Hausbesuch: Er behält die Adresse drei Jahre, obwohl keine Anfahrt stattfand.

**Anker.** Spalten `visit_*` und Constraint `appointments_address_matches_type` in `supabase/migrations/20260830100100_appointments.sql`; einziger Schreiber ist `create_appointment`; Abnahmeschritt CAL-001 in `docs/abnahme/etappe-0-patienten-und-termine.md`.

**Änderungspfad.** Kürzere Frist oder Entfernen bei abgesagten Terminen: `visit_*` in `cancel_appointment` auf `null` setzen · Aufwand `klein`. Referenz statt Kopie: Migration entfernt die Spalten, der Nachweis liest die Stammdaten · Aufwand `mittel`, mit dem Verlust der historischen Adresse als Folge.

### ANN-004 — Inhalt des Audit-Kontexts bei organisatorischen Einstellungen

Datenschutz · offen · 2026-08-30 · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung / DSFA-Prozess vor Produktivstart

**Annahme.** Bei `organization.appointment_grid_changed` stehen alter und neuer Minutenwert in `audit_log.context`. Bei Arbeitszeiten (`staff_working_hours.*`, `staff_working_hour_exception.*`) enthält der Kontext Datensatz-Kennungen und bei Abweichungen deren Art (`kind`) — keine Uhrzeiten, keinen Wochentag, kein Datum.

**Begründung.** ADR-010 beschränkt das Auditlog auf Metadaten ohne klinische Inhalte; Beschäftigtendaten unterliegen `PROJECT_PRINCIPLES.md` §20 und §26 BDSG, und ein Log, das Arbeitszeitverläufe je Person nachzeichnet, wäre eine von §20 nicht gedeckte Auswertung. Der Lesepfad `list_audit_events` gibt `context` ohnehin nicht heraus.

**Anker.** `set_appointment_grid` in `supabase/migrations/20260830120000_scheduling_grid.sql`; `set_staff_working_hours` und `set_staff_working_hour_exception` in `20260830130000_working_hours_audit.sql`; `list_audit_events` und `set_documentation_deadline` in `20260904120000_treatment_note_auto_finalisation.sql`.

**Änderungspfad.** Kontextinhalt je Funktion in einer Migration ändern · Aufwand `klein`. Bereits geschriebene Zeilen sind über den Anwendungspfad nicht lesbar; ob sie bereinigt werden müssen, entscheidet die Prüfung.

### ANN-005 — Terminabschluss ohne Dokumentationspflicht

Praxisprozess · entschieden (Jannes) · 2026-09-08 · Jannes · erledigt · Wiedervorlage: ABR-002 (Leistungserfassung am abgeschlossenen Termin); DOK-003 hat die Kopplung geprüft und nicht eingeführt, siehe Nachtrag

**Annahme.** Ein Termin kann abgeschlossen werden, ohne dass eine Behandlungsdokumentation existiert; der Abschluss gibt den Zeitraum nicht frei und lässt sich wieder öffnen, beide Ereignisse bleiben im Auditlog. Die Kopplung „Fakturierung erst nach finalisierter Dokumentation" (§19) wird an Leistung und Rechnung verankert, nicht am Terminstatus.

**Begründung.** §19 bindet die Fakturierung an die Dokumentation, nicht an den Terminstatus; DOK-001 und DOK-002 (ADR-016) haben die Kopplung bewusst nicht eingeführt — ein Entwurf darf unbegrenzt Entwurf bleiben, und ein Termin mit Dokumentation bleibt absagbar (`docs/DEVELOPMENT.md`, Bekannte Einschränkungen 9 und 10).

**Anker.** `complete_appointment` und `reopen_appointment` in `supabase/migrations/20260830110000_appointment_completion.sql`; Abnahmeschritt CAL-004 in `docs/abnahme/etappe-0-patienten-und-termine.md`.

**Änderungspfad.** Entweder eine Prüfung in `complete_appointment` ergänzen oder den Abschluss aus der Finalisierung heraus auslösen · Aufwand `klein` bis `mittel`. Die Entscheidung fällt spätestens, wenn ABR-002 abgeschlossene Termine zu Leistungen macht.

### ANN-006 — Umfang und Protokollierung des Behandlungsnachweises in der Akte

Datenschutz · verworfen · 2026-09-13 · Jannes · — · Wiedervorlage: die Aufnahme der Leistungskürzel in den Nachweis bei ABR-002

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

**Anker.** `app.documentation_deadline()` und die Spalte `organizations.documentation_auto_finalize_days` in `supabase/migrations/20260904120000_treatment_note_auto_finalisation.sql`; `FRIST_WERTE` in `src/features/documentation/api.ts`; Abnahmeschritt DOK-004 in `docs/abnahme/etappe-1-kernprozess.md`.

**Änderungspfad.** Anderer Bezugstag oder eine Uhrzeit statt Mitternacht: `app.documentation_deadline()` in einer Migration ersetzen · Aufwand `klein`. Frist je Person oder je Terminart: eigene Spalte und Auswertung in derselben Funktion · Aufwand `mittel`. Bereits finalisierte Einträge bleiben finalisiert.

### ANN-009 — Systemakteur im Auditlog

Datenschutz · offen · 2026-09-04 · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung / DSFA-Prozess vor Produktivstart

**Annahme.** Auditereignisse ohne handelnden Account tragen `actor_kind = 'system'` und keinen `actor_user_id`, alle übrigen bleiben `user` mit Account; eine Constraint erzwingt genau diese Paarung. Die Auditansicht zeigt solche Ereignisse als „System", der Benutzerfilter blendet sie aus. Bei der automatischen Finalisierung wird keine finalisierende Person eingetragen.

**Begründung.** ADR-010 Punkt 3 verlangt die zur Nachvollziehbarkeit erforderlichen Metadaten; ein Platzhalter-Account oder die zuletzt schreibende Person als vermeintlich finalisierende wäre eine falsche Angabe (Art. 5 Abs. 1 lit. d DSGVO) und liefe ADR-016 Punkt 1 zuwider. Unsicher: ob die Prüfung eine Kennzeichnung des Auslösers verlangt; heute stehen dort `surface = scheduler` und das Fristende.

**Anker.** Spalte `audit_log.actor_kind` und Constraint `audit_log_actor_consistent` in `supabase/migrations/20260904120000_treatment_note_auto_finalisation.sql`; `list_audit_events` ebendort; Anzeige in `src/features/audit/AuditLogPage.tsx`.

**Änderungspfad.** Zusätzliche Kennzeichnung des Auslösers: Kontext des Inserts in `finalize_overdue_treatment_notes` erweitern · Aufwand `klein`. Eigener Pseudo-Account statt Systemakteur: Spalte zurückbauen und Konto im Seed anlegen · Aufwand `mittel`, ausdrücklich nicht empfohlen.

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

**Anker.** `app.can_read_prescriptions()` und `app.can_write_prescriptions()` in `supabase/migrations/20260907110000_prescriptions.sql`; `app.can_read_prescription_clinical()` nach E15 in `20260915110000_office_reads_prescriptions_and_clinical_files.sql`; `list_patient_prescriptions` und `list_patient_prescriptions_clinical` in `20260907120000_prescription_read_paths.sql`; Rollenweiche in `src/features/prescriptions/verordnungen.ts`.

**Änderungspfad.** Anderer Rollenschnitt beim Lesen oder Schreiben: die betroffene `app.can_*`-Funktion ersetzen · Aufwand `klein` — `office` wieder von der Diagnose auszuschließen widerspräche E15. Heilmittel als klinisch einstufen: Spaltenliste und Oberfläche anpassen · Aufwand `mittel`. Andere Frist: eigene Datenklasse und Löschregel in LOE-001 · Aufwand `mittel`.

### ANN-012 — Genutzte Menge wird bis CAL-007 und ABR-002 von Hand gepflegt

Praxisprozess · entschieden (Jannes) · 2026-09-08 · Jannes · erledigt · Wiedervorlage: ABR-002 (genutzte Menge aus der Abrechnung)

**Ablösung.** abgelöst durch ANN-038 und ANN-042 in der Zählweise („verplant ist nicht genutzt", „ausgeschöpft") · vollständig abgelöst durch **ANN-064**: Seit VER-EPIC-002 ist die genutzte Menge keine Eingabe des Formulars mehr

**Annahme.** Jede Verordnungsposition führt eine genutzte Menge, die die Praxis im Verordnungsformular selbst pflegt. Die verbleibende Menge wird daraus gerechnet und nirgends gespeichert; eine Constraint verhindert, dass die genutzte Menge die verordnete übersteigt.

**Begründung.** Das Restkontingent ist die Zahl, wegen der man eine Verordnung im Alltag aufschlägt; die automatische Verrechnung setzt CAL-007 und ABR-002 voraus, ein leeres Feld wäre ein Zukunftsfeature auf Vorrat (ADR-014). Die verbleibende Menge wird nicht gespeichert, weil ein zweiter Zähler auseinanderlaufen kann (§13). Unsicher: ob die Praxis die Zahl im Alltag nachführt — das zeigt Probewoche 1.

**Anker.** Spalte `prescription_items.used_quantity` und Constraint `prescription_items_used_within_prescribed` in `supabase/migrations/20260907110000_prescriptions.sql`; Eingabefeld in `src/features/prescriptions/PrescriptionFormFields.tsx`; Berechnung in `src/features/prescriptions/api.ts`.

**Änderungspfad.** Automatischer Verbrauch: CAL-007 und ABR-002 schreiben das Feld fort, das Eingabefeld entfällt oder wird zur Korrekturmöglichkeit · Aufwand `mittel`, ohne Datenumzug, weil die Spalte bleibt.

### ANN-013 — Datenklasse und Frist der Verordnerkartei

Datenschutz · offen · 2026-09-07 · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung / DSFA-Prozess (Verzeichnis der Verarbeitungstätigkeiten)

**Annahme.** `prescribers` enthält berufliche Kontaktdaten Dritter und ist kein Gesundheits- und kein Patientendatum — erst die Verordnung stellt den Bezug her. Datenklasse: Stammdaten, aufbewahrt, solange eine Verordnung darauf verweist (`on delete restrict`). Sichtbar für alle vier Praxisrollen, nicht für Patientenkonten; erfasst wird nur, was Identifikation und Folgeverordnung brauchen — keine Arztnummer, keine Betriebsstättennummer.

**Begründung.** Rechtsgrundlage ist Art. 6 Abs. 1 lit. b/f DSGVO, nicht Art. 9 — die Kartei allein sagt nichts über eine Gesundheit aus. Die Kopplung der Frist an die Verordnung folgt ADR-008 Punkt 2, weil eine Verordnung ohne auflösbaren Verordner als Behandlungsunterlage unvollständig wäre. Der Verzicht auf LANR und BSNR folgt der Datenminimierung (Art. 5 Abs. 1 lit. c DSGVO): GKV-Merkmale, und die Praxis rechnet privat ab (ADR-009). Unsicher: ob die Prüfung eine eigene Zeile im Verarbeitungsverzeichnis und eine Information nach Art. 14 DSGVO verlangt.

**Anker.** Tabelle `public.prescribers` mit Tabellenkommentar und Policy `prescribers_select_staff_only` in `supabase/migrations/20260907110000_prescriptions.sql`; Formularfelder in `src/features/prescriptions/PrescriberFormFields.tsx`.

**Änderungspfad.** Eigene Löschregel oder kürzere Frist: Regel in LOE-001 ergänzen · Aufwand `klein`, solange keine Verordnung verweist. Information nach Art. 14 DSGVO: Textbaustein in G8/G14 · Aufwand `klein`, außerhalb des Codes.

### ANN-014 — „Empfehlung zum Verordnungsende" ist eine erfasste Angabe, keine Systemempfehlung

Recht · offen · 2026-09-07 · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung; B1 (externe MDR-Abgrenzung, ADR-006 Punkt 7)

**Annahme.** Das Feld „Empfehlung zum Verordnungsende" nimmt die Empfehlung der Therapeut:in auf, die sie selbst formuliert und verantwortet; die Anwendung erzeugt, ergänzt und bewertet sie nicht. Daneben zeigt sie ausschließlich eine Rechnung („noch 3 von 10") und, wenn nichts mehr offen ist, den neutralen Sachsatz „Kontingent ausgeschöpft" — keine Handlungsempfehlung, keine Prognose, keine Ampel, keine Erinnerung.

**Begründung.** ADR-006 Punkt 2 erlaubt Erfassen, Speichern und Darstellen von Gesundheitsinformationen, Punkt 4 verbietet eigene Therapieempfehlungen; eine von einem Menschen geschriebene Empfehlung zu speichern und anzuzeigen fällt unter Punkt 2. Die Differenz „verordnet minus genutzt" ist eine veröffentlichte Rechenvorschrift ohne klinische Aussage. Regulatorisch zählt auch die Beschriftung, deshalb heißt das Feld „Empfehlung der Therapeut:in zum Verordnungsende". Unsicher: ob die externe Prüfung aus B1 den Sachsatz bereits als Handlungsaufforderung liest.

**Anker.** Spalte `prescriptions.follow_up_recommendation` mit Spaltenkommentar in `supabase/migrations/20260907110000_prescriptions.sql`; Beschriftung und Hinweistext in `src/features/prescriptions/PrescriptionFormFields.tsx`; Darstellung des Restkontingents in `src/features/prescriptions/PatientPrescriptions.tsx`.

**Änderungspfad.** Feld oder Sachsatz anders beschriften: eine Stelle in der Oberfläche · Aufwand `klein`. Feld ganz entfernen: Spalte und Formularfeld zurückbauen · Aufwand `klein`. Eine automatische Erinnerung oder Bewertung wäre keine Änderung dieser Annahme, sondern `MDR_REVIEW_REQUIRED` nach ADR-006 Punkt 6 und ein eigenes Epic nach B9 und B10.

### ANN-015 — Umfang und Wortlaut der Verbindungsanzeige

Technik · entschieden (Jannes) · 2026-09-08 · Jannes · erledigt · Wiedervorlage: Jannes nach dem ersten Feldtag

**Ablösung.** abgelöst durch ANN-046 im Textverlustschutz

**Annahme.** Die Verbindungsanzeige stützt sich allein auf `navigator.onLine` und die Ereignisse `online`/`offline`; es gibt keinen Ping gegen den Server und keinen Abfragetakt. Sie erscheint nur im Fall „getrennt", ein dauerhaftes „verbunden" gibt es nicht. Der Text nennt die Folge für die Arbeit, nicht den technischen Zustand, und bittet darum, den Text im Feld stehen zu lassen.

**Begründung.** Anlass ist der Hausbesuch: reißt die Verbindung ab, merkt man es sonst erst beim fehlgeschlagenen Speichern. Ein regelmäßiger Ping wäre genauer, aber eine wiederkehrende Verbindung ohne fachlichen Grund (§18) und ein Signal, wann ein Gerät benutzt wird (§20). Der Preis ist bekannt und benannt: ein Gerät hinter einem Anmeldeportal gilt als verbunden, deshalb behauptet der Text nicht, der Server sei erreichbar. Die Anzeige ist keine Offline-Fähigkeit (ADR-015 Punkt 16, ADR-001). Unsicher: ob der Hinweis früh genug kommt, um Textverlust zu verhindern.

**Anker.** `src/app/verbindung.ts` (`useIstVerbunden`); `src/app/Verbindungsanzeige.tsx` in `src/app/AppShell.tsx`; seit UX-009 zusätzlich `src/features/documentation/Textverlustschutz.tsx`.

**Änderungspfad.** Zusätzliche Prüfung gegen den Server: eine Abfrage in `useIstVerbunden` · Aufwand `klein`, aber datenschutzrelevant und deshalb nicht ohne Entscheidung. Anderer Wortlaut oder dauerhafte Anzeige: eine Stelle · Aufwand `klein`. Echte Offline-Fähigkeit: eigenes Epic nach ADR-001 · Aufwand `groß`.

### ANN-016 — Koordinate als abgeleitetes Stammdatum der Adresse

Datenschutz · offen · 2026-09-08 · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung / DSFA-Wiedervorlage Kartendienst; MAP-006 verankert sie in der Migration

**Annahme.** Zu jeder Hausbesuchsadresse wird die geocodierte Koordinate (`lat`, `lon`, Genauigkeitsstufe) bei der Adresse gespeichert; Geocoding läuft nur beim Anlegen oder Ändern der Adresse, nie beim Öffnen einer Karte oder Berechnen einer Route. Die Koordinate ist ein abgeleitetes Stammdatum mit Datenklasse und Frist der Adresse — keine Rohantwort des Anbieters, kein Anzeigetext. Unterhalb der Hausnummerngenauigkeit bestätigt die erfassende Person den Treffer, sonst bleibt die Adresse ohne Koordinate.

**Begründung.** Datenminimierung gegenüber dem Anbieter (Art. 5 Abs. 1 lit. c DSGVO): Die Adresse geht genau einmal je Änderung zum Kartendienst, jede spätere Karte oder Route arbeitet mit Koordinaten (ADR-019 Punkt 13); ohne Speicherung müsste jede Routenberechnung alle Adressen des Tages erneut übermitteln. Die Koordinate ist so personenbezogen wie die Adresse, deshalb dieselbe Klasse und Frist (ADR-008). Unsicher: ob die Prüfung die Speicherung anders bewertet als die Adresse und ob bei abgesagten Hausbesuchen (ANN-003) die Koordinate mitzulöschen ist.

**Anker.** Bis MAP-006: `src/lib/location/contract.ts`, Abschnitt „Geocoding", und ADR-019 Punkt 14. Ab MAP-006: die Migration mit den Koordinatenspalten und der einzige Schreiber beim Adress-Upsert.

**Änderungspfad.** Geocoding je Aufruf statt Speicherung: Spalten entfallen, der Adapter geocodiert vor jeder Route · Aufwand `mittel`, mit mehr Übermittlungen als Folge. Andere Frist oder eigene Datenklasse: Retention Schedule ergänzen · Aufwand `klein`. Koordinate im Termin-Snapshot statt bei der Adresse: eine Migration · Aufwand `klein`.

### ANN-017 — Serverseitiger Kartendienst-Adapter als Supabase Edge Function

Technik · offen · 2026-09-08 · — · — · Wiedervorlage: OPS-001 Providerprüfung (Edge Runtime nach ADR-015 Punkt 20); MAP-003 baut den Adapter

**Annahme.** Geocoding, Routing und Matrix laufen in einer Supabase Edge Function (`location-provider`), die den Server-Schlüssel als Supabase-Secret hält und den Vertrag aus `src/lib/location/contract.ts` erfüllt. Der Browser ruft nur diese Function auf (immer angemeldet) und spricht nie direkt mit dem Kartendienst; einzige Ausnahme sind die Kartenkacheln mit getrenntem Kachelschlüssel. Der Vorbehalt aus ADR-015 Punkt 20 bleibt: Für produktive Gesundheitsdaten braucht die Edge Runtime eine eigene Datenfluss- und Providerprüfung (OPS-001).

**Begründung.** Direkt aus dem Browser stünde der Schlüssel im Bundle und IP-Adresse und User-Agent lägen beim Anbieter; aus der Datenbank (`pg_net`) wären Timeout-Kontrolle schlecht und das Secret in der Datenbank; ein eigener Dienst wäre eine zusätzliche Laufzeitkomponente mit eigener Wiederherstellungslast bei Bus-Faktor 1 (ADR-012). Die Edge Function gehört zum Stack (ADR-015 Punkt 6), hat eine Stelle für Schlüssel, Redaction (ADR-011) und Timeout und ist mit gemocktem `fetch` testbar. Unsicher: wo die global verteilte Edge Runtime ausgeführt wird und ob sie auf EU-Regionen festlegbar ist.

**Anker.** `src/lib/location/contract.ts`, Abschnitt „Serverseitiger Anbieteradapter"; `supabase/functions/location-provider/` — geplant für MAP-003, existiert noch nicht.

**Änderungspfad.** Andere Laufzeit (eigener Dienst, Datenbankfunktion): Der Adapter ist ein Modul hinter dem Vertrag, Oberfläche und Fachlogik bleiben · Aufwand `mittel`. Scheidet die Edge Runtime nach OPS-001 für Gesundheitsdaten aus, greift derselbe Pfad vor MAP-006.

### ANN-018 — Übergabeziel und URL-Format des Navigations-Handoffs

Datenschutz · entschieden (Jannes) · 2026-09-11 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2, Handoff und §203/Art. 9); MAP-005 bewertet die Ziel-Apps und setzt Apple Maps und `geo:` um

**Annahme.** Der Handoff übergibt an die Navigations-App nur Ziel und Fahrradmodus: die Koordinate, sobald sie vorliegt (ANN-016, ab MAP-006), bis dahin die Postanschrift ohne Namen. Nie Name, Uhrzeit, Termin- oder Patientenkennung, Notiz oder Diagnose. Formate: Google Maps (`travelmode=bicycling`, Tageslink mit höchstens neun Wegpunkten), Apple Maps (`mode=cycling`), Systemnavigation `geo:`. Die URL entsteht in einer Funktion, erst beim Tippen, wird nie gespeichert und nie automatisch geöffnet.

**Begründung.** Die Koordinate ist für den Betreiber der Navigations-App so identifizierend wie die Adresse, enthält aber keinen Freitext und keinen Anhaltspunkt außer dem Punkt; Adresse und Klingelhinweis bleiben lokal. Die Feldliste folgt Art. 5 Abs. 1 lit. c DSGVO und ADR-019 Punkt 12. Unsicher: ob ein Pin ohne sichtbare Hausnummer auf dem Rad verwirrt (MAP-005 prüft das auf echten Geräten) und ob die Übergabe an einen eigenen Verantwortlichen Art. 9 oder §203 StGB berührt — Rechtsfrage an B2 (ADR-019 Punkt 23).

**Anker.** `src/lib/location/contract.ts`, Typ `NavigationTarget`; seit UX-002 `src/lib/location/navigation.ts` — die eine Stelle für Feldliste, Ländercode, URL-Format und Wegpunktlimit, mit Tests in `navigation.test.ts`; „nur auf Aktion" in `src/features/appointments/NavigationStarten.tsx`.

**Änderungspfad.** Adresse statt Koordinate, anderes Limit, andere Ziel-App: eine Funktion · Aufwand `klein`. Verlangt B2 eine Einwilligung vor dem Handoff: Einwilligungsstruktur aus PAT-006 und Prüfung vor dem Bauen der URL · Aufwand `mittel`. Verlangt B2, den Handoff zu unterlassen: die Funktion entfällt, die Tagesliste zeigt die Adresse · Aufwand `klein`.

### ANN-019 — Verfallsdauer und Bindung des Verordnungsentwurfs (VER-003)

Technik · offen · 2026-09-08 · — · — · Wiedervorlage: Jannes, falls die 30-Minuten-Grenze in der Praxis zu knapp oder zu großzügig wirkt; der Restpunkt aus UX-EPIC-001 ist mit UX-009 behoben, siehe unten

**Annahme.** Der Formularzustand liegt in einem eigenen kleinen In-Memory-Speicher (`entwurfSpeicher`), nicht im Query-Cache. Ein Entwurf ist an Vorgang (Rücksprungpfad) und Benutzer (Auth-`user.id`) gebunden und verfällt nach 30 Minuten von selbst; bei Abmeldung werden zusätzlich sofort alle Entwürfe verworfen.

**Begründung.** Ein Entwurf muss die Anlage einer fehlenden Verordner:in überleben; mit der Standard-`gcTime` von fünf Minuten für einen unbeobachteten Cache-Eintrag ist das nicht verlässlich, und den Cache dafür umzuwidmen hieße, seine nächsten Eigenheiten (Rehydrierung, `refetchOnMount`) zu erben. 30 Minuten sind eine Schätzung, keine Messung. Die Benutzerbindung verhindert, dass ein Kontowechsel im selben Tab einen fremden Entwurf übernimmt; das Verwerfen bei Abmeldung ist Verteidigung in der Tiefe, weil die Verordnung klinischen Freitext enthält (§18, ADR-011). Nichts verlässt den Arbeitsspeicher — kein `localStorage`, kein `sessionStorage`, kein Weg über die URL.

**Anker.** `src/features/prescriptions/api.ts` (`entwurfSpeicher`, `ENTWURF_MAX_ALTER_MS`); Verwendung in `PrescriptionFormPage.tsx` und `PrescriberFormPage.tsx`; Verwerfen bei Abmeldung in `src/features/auth/SessionProvider.tsx`.

**Änderungspfad.** Andere Frist: eine Zahl in `ENTWURF_MAX_ALTER_MS` · Aufwand `klein`. Mehrere gleichzeitige Entwürfe je Person oder Ausdehnung auf mehrere Tabs: eigener Mechanismus (etwa `BroadcastChannel`) · Aufwand `mittel`.

### ANN-020 — Datenklasse und Frist der Textbausteine

Datenschutz · entschieden (Jannes) · 2026-09-11 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung; LOE-001 nimmt die Klasse in den Retention Schedule auf

**Annahme.** Ein Textbaustein ist ein Betriebsdatum der Praxis ohne Patientenbezug und kein Gesundheitsdatum; `public.treatment_text_snippets` trägt deshalb bewusst keine `patient_id` und keine `appointment_id`. Aufbewahrung bis zur Löschung durch die Praxis — keine gesetzliche Frist, kein selbsttätiger Verfall. Ein persönlicher Baustein endet mit dem Mitarbeiterdatensatz seiner Person (`on delete cascade`), ein praxisweiter überlebt jeden Personalwechsel; Löschen ist echtes Löschen, was damit geschrieben wurde, steht unverändert in der Akte.

**Begründung.** Der Baustein ist eine vorformulierte Wendung ohne Fall, damit fehlt der Personenbezug nach Art. 4 Nr. 1 DSGVO und Art. 9 greift nicht; ohne Spalte für Patient oder Termin lässt sich ein Bezug auch nachträglich nicht herstellen. Der Restwert liegt im Freitext selbst — dagegen hilft die Beschriftung („keine Angaben aus einer Akte") und die Länge von 2 000 Zeichen. In Logs erscheint der Text nie (ADR-011). Unsicher: ob die Prüfung den Freitext trotz fehlenden Bezugs der Akte zuordnet und damit der Zehnjahresfrist (ADR-008).

**Anker.** `supabase/migrations/20260910140000_treatment_text_snippets.sql` — Tabelle mit Datenklasse und Frist als `COMMENT`; Tests im Abschnitt „Datenschutz" von `supabase/tests/text-snippets.test.ts`.

**Änderungspfad.** Andere Frist oder eigene Datenklasse: Eintrag im Retention Schedule (LOE-001) und eine Löschregel je Tabelle · Aufwand `klein`. Bausteine wie Aktendaten behandeln: dieselbe Frist plus Aufnahme ins Löschjournal (LOE-002) · Aufwand `klein`. Trennung persönlich/praxisweit aufheben: eine Spalte und zwei Policies · Aufwand `mittel`.

### ANN-021 — Feldliste und Vorhaltedauer des Tagesplans im Arbeitsspeicher

Datenschutz · entschieden (Jannes) · 2026-09-11 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung; Jannes nach dem ersten Feldtag (reicht die Vorhaltedauer, ist sie zu lang?)

**Annahme.** Die zuletzt erfolgreich geladene Tagesliste bleibt im Arbeitsspeicher der laufenden Seite lesbar, auch wenn eine spätere Abfrage scheitert, und wird dann als älterer Stand gekennzeichnet. Feldliste ist genau die Rückgabe von `list_day_plan` — keine klinischen Inhalte, keine Verordnung, keine Akte. Vorhaltedauer acht Stunden ab dem Laden; sie endet zusätzlich bei Neuladen, geschlossenem Tab, Abmeldung und Tageswechsel. Gespeichert wird nichts: kein `localStorage`, kein `sessionStorage`, kein IndexedDB, kein Service Worker (ADR-015 Punkt 16).

**Begründung.** ADR-001 nennt den Tagesplan als das, was offline verfügbar sein soll, und lässt den Mechanismus offen; der Zwischenspeicher der laufenden Seite genügt dem Zweck ohne neue Technik und kann die Lage aus ADR-001 („dokumentiert geglaubt, nirgends gespeichert") nicht erzeugen, weil er nur liest. Ein dauerhafter lokaler Bestand hieße Gesundheitsdaten auf einem mobilen Gerät mit allem, was daran hängt — nach §16 kein Weg, den man nebenbei geht. Unsicher: ob acht Stunden für einen langen Tag reichen und ob die Prüfung den Zugangshinweis im Arbeitsspeicher anders bewertet als auf dem Bildschirm.

**Anker.** `TAGESPLAN_VORHALTEDAUER_MS` in `src/features/today/api.ts` — die eine Zahl; die Feldliste ist die Rückgabe von `public.list_day_plan` (`supabase/migrations/20260910100000_day_plan.sql`); Leeren beim Wechsel der Identität in `src/features/auth/SessionProvider.tsx` (seit FIX-005 dort, verglichen wird die Benutzerkennung, nicht die Ereignisart).

**Änderungspfad.** Andere Vorhaltedauer: eine Zahl · Aufwand `klein`. Nichts über einen Fehlversuch hinaus stehen lassen: `gcTime` auf 0 und Kennzeichnung entfernen · Aufwand `klein`, mit dem Verlust der Anschrift im Funkloch als Folge. Echter Offline-Modus: eigenes Epic nach ADR-001 · Aufwand `groß`.

### ANN-022 — Tiefgrün der Marke als Hover-Zustand des Akzents

Technik · offen · 2026-09-10 · — · — · Wiedervorlage: Jannes, sobald er die Oberfläche eine Weile bedient hat; außerdem MARKE-001, falls die Marke um abgestufte Farbwerte ergänzt wird

**Annahme.** `--color-accent-hover` trägt das Tiefgrün der Marke (`#042c1b`) — einen dunkleren, nicht helleren Wert als den Akzent. `marke/README.md` führt Tiefgrün als Fläche für App-Symbol, Aufkleber und Visitenkarte; die Verwendung als Fläche und Textfarbe in der Anwendung geht darüber hinaus und ist deshalb registriert.

**Begründung.** `--color-accent-hover` ist an rund einem Dutzend Stellen Textfarbe und nur an zweien Knopffläche; ein hellerer Wert hätte beide Verwendungen geschwächt, der dunklere stärkt sie (Text 13,85:1 statt 10,30:1, weiß darauf 15,19:1 statt 11,29:1). `marke/README.md` schließt mit „Keine weiteren Kombinationen" eigene Abstufungen aus, und Tiefgrün ist die einzige dunklere Farbe, die die Marke kennt. `--color-accent-soft` folgt derselben Logik mit Buntheit `0.022`, bewusst unter `positiv-soft`.

**Anker.** `src/index.css`, `--color-accent-hover` und `--color-accent-soft`; geprüft in `src/lib/kontrast.test.ts` (Textkontrast, weißer Text darauf, Mindestabstand der Zustände, Ordnung gegenüber `positiv-soft`).

**Änderungspfad.** Andere Richtung oder anderer Wert: eine Zeile in `src/index.css`, der Test rechnet die Grenzen neu · Aufwand `klein`. Bekommt die Marke später eine abgestufte Farbskala, ersetzt sie den Wert an derselben Stelle · Aufwand `klein`.

### ANN-023 — Die Kopfzeile führt die Marke, nicht den Organisationsnamen

Praxisprozess · offen · 2026-09-10 · — · — · Wiedervorlage: Jannes; erneut, sobald eine zweite Praxis dazukäme (ADR-003, „echter Mehrmandantenbetrieb")

**Annahme.** Die Kopfzeile der angemeldeten Anwendung zeigt die Wortmarke; der Organisationsname aus den Stammdaten erscheint dort nicht mehr. Die Anmeldemaske zeigt ebenfalls die Marke statt des Worts „Praxisplattform", der Seitentitel lautet „Own Motion".

**Begründung.** ADR-003 stellt fest, dass `organization_id` keine Mandantenfähigkeit schafft und echter Mehrmandantenbetrieb ein eigenes Vorhaben bliebe; es gibt genau eine Praxis, und der Name aus der Datenbank sagt neben der Marke nichts Zusätzliches — im aktuellen Stand wäre er sogar irreführend („Test Praxis Tuebingen"). Die Alternative, den Namen als zugängliche Bezeichnung zu hinterlegen, wurde verworfen, weil Vorlesesoftware dann etwas anderes sagt, als zu sehen ist.

**Anker.** `src/app/AppShell.tsx` (Kopfzeile), `src/features/auth/LoginPage.tsx`, `index.html`; festgehalten in `AppShell.test.tsx` und `LoginPage.test.tsx`. `organizationName` in `src/features/session/types.ts` bleibt geladen, nur nicht angezeigt.

**Änderungspfad.** Namen wieder anzeigen: ein Element in `AppShell.tsx`, Abstand nach `schutzraum()` in `src/components/ui/markeRegeln.ts` · Aufwand `klein`. Mehrere Praxen: eigenes Vorhaben nach ADR-003 · Aufwand `mittel`, durch diese Annahme nicht vorweggenommen.

### ANN-024 — Privatangaben Beschäftigter: Schreibrecht folgt dem Leserecht

Datenschutz · entschieden (Jannes) · 2026-09-11 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung im Rahmen der TOM (G14). Kategorie `Datenschutz`: Die Bestätigung durch den Projektinhaber ersetzt sie nicht, der Eintrag bleibt im Prüfpaket

**Annahme.** „Anschrift" und „Telefon" aus E10 sind die dienstlichen Angaben: Name, dienstliche E-Mail, Diensttelefon, Hauptstandort darf `office` schreiben. Die Privatangaben in `staff_private_details` (Geburtsdatum, private E-Mail, Privattelefon, Privatanschrift) bleiben bei `owner` — beim Lesen wie beim Schreiben, Schreibrecht und Leserecht sind deckungsgleich.

**Begründung.** §20 beschränkt das Lesen dieser Angaben auf `owner` und die betroffene Person, §4.7 verbietet, Geschütztes auszuliefern und erst im Client auszublenden. Ein Schreibrecht ohne Leserecht wäre deshalb die gefährlichere Variante: Das Formular des Office bekäme die Felder als `null` und löschte sie beim Speichern. Die Privatanschrift wird für Terminplanung und Vertretung nicht gebraucht (Art. 5 Abs. 1 lit. c DSGVO). Jannes hat die Auslegung am 2026-09-11 bestätigt; offen ist nur, ob die Datenschutzprüfung die Aufteilung im Rahmen der TOM so bestätigt.

**Anker.** `app.can_manage_staff_private_details()` in `supabase/migrations/20260911100000_staff_permission_split.sql` — genau ein Ausdruck; `canManageStaffPrivateDetails` in `src/features/session/types.ts` steuert nur die Darstellung.

**Änderungspfad.** Office soll Privatangaben schreiben und lesen: diese Funktion und die Lese-Policy auf `staff_private_details` gemeinsam erweitern · Aufwand `klein`, aber mit Änderung an §20, also erst nach ausdrücklicher Entscheidung. Umgekehrt: `app.can_manage_staff_master_data()` auf `owner` zurück · Aufwand `klein`.

### ANN-025 — Die Anwendung legt keine Authentifizierungskonten an

Datenschutz · offen · 2026-09-11 · — · Prüfpaket · Wiedervorlage: **OPS-001** (Providerprüfung, Auth-Mails) — dort entscheidet sich, ob eine Edge Function mit `service_role` den Versand übernimmt; Datenschutzprüfung

**Annahme.** Die Anwendung erzeugt kein Konto beim Anmeldedienst, sondern verwaltet nur die Berechtigung: `invite_staff_account` legt die Einladung an, `claim_staff_invitation` bindet ein vorhandenes Konto daran. Das Konto entsteht einmalig je Person auf der Oberfläche des Anmeldedienstes; die Anwendung fordert die Anmeldemail nur für ein bestehendes Konto an (`signInWithOtp` mit `shouldCreateUser: false`).

**Begründung.** `supabase/config.toml` setzt `enable_signup = false` (§4.2), damit lehnt der Dienst die Anlage ab. Selbstregistrierung einzuschalten wäre das Aufweichen einer Sicherheitsmaßnahme und nach §15.1 ein Hard Stop; die Admin-API verlangt den `service_role`-Schlüssel und damit eine serverseitige Funktion, die ADR-015 für Gesundheitsdaten nicht freigegeben hat; ein eigener Maildienst wäre ein zweiter Dienstleister und durch B13 ausgeschlossen. Bleibt der manuelle Handgriff — eine Minute je Zugang und die restriktivere Seite (§16). B13 ist damit nur für den Teil einlösbar, der ein Konto voraussetzt; §4.2 steht im Rang darüber (gemeldet nach §21). Unsicher: ob die Praxis den Handgriff bei Personalwechseln auf Dauer akzeptiert.

**Anker.** `sendeZugangsMail` in `src/features/staff/konto-api.ts` (`shouldCreateUser: false`); die tragende Eigenschaft in `claim_staff_invitation` (`supabase/migrations/20260911110000_staff_account_invitations.sql`): ein Konto ohne passende offene Einladung bleibt zugriffslos.

**Änderungspfad.** Sobald ADR-015 Edge Functions freigibt und OPS-001 die Auth-Mails einschließt: eine Edge Function mit dem `service_role`-Schlüssel als Secret, aufgerufen aus `sendeZugangsMail`; Datenmodell, Rollen, RPCs und Abnahmeschritt bleiben unverändert · Aufwand `mittel`. Zurückzunehmen ist nichts — der heutige Stand ist die restriktive Variante.

### ANN-026 — Datenklasse und Frist der Einladung

Datenschutz · offen · 2026-09-11 · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung (die Frist); die Klasse steht seit LOE-001a im Retention Schedule

**Annahme.** Eine Einladung (`public.staff_account_invitations`) ist ein Zugangs- und Authentifizierungsdatum, kein Gesundheits- und kein Beschäftigtendatum im Sinne von §20. Frist: 12 Monate nach Abschluss des Vorgangs, wie „Normale Authentifizierungs- und Securitylogs" in ADR-008. Die Gültigkeit einer offenen Einladung beträgt 14 Tage; sie läuft ab, statt aufgeräumt zu werden — kein Hintergrundjob, kein unbeobachtet kippender Zustand.

**Begründung.** Der Datensatz enthält E-Mail-Adresse, Rollenliste und Zeitstempel — Kontaktdatum und Berechtigungsentscheidung, kein Inhalt über eine Person. Er ist zugleich der Nachweis, auf welcher Grundlage ein Zugang entstand; ADR-010 Punkt 2 führt Rollen- und Berechtigungsänderungen als auditpflichtig, und ein Nachweis, der früher verschwindet als das Auditlog, wäre wertlos — deshalb wird eine Einladung abgeschlossen, nie gelöscht. 14 Tage überstehen Urlaub und Krankheit, ohne eine vergessene Einladung dauerhaft offenzulassen. Unsicher: ob die Prüfung statt 12 Monaten die drei Jahre des Auditlogs verlangt.

**Anker.** `COMMENT ON TABLE public.staff_account_invitations` und die Frist `now() + interval '14 days'` in `invite_staff_account`, beides in `supabase/migrations/20260911110000_staff_account_invitations.sql`.

**Änderungspfad.** Andere Gültigkeit: ein Intervall · Aufwand `klein`. Andere Aufbewahrung: die Zeile `zugangseinladung` in `public.retention_classes` · Aufwand `klein`.

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

### ANN-029 — Auditeinträge folgen ihrer eigenen Frist, nicht der der Akte

Datenschutz · entschieden (Jannes) · 2026-09-11 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung / DSFA-Prozess vor Produktivstart

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

Datenschutz · entschieden (Jannes) · 2026-09-11 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung; erneut mit OPS-003, sobald der Backup-Lebenszyklus definiert ist (ADR-012, offene Folgefrage)

**Annahme.** Das Löschjournal (`deletion_journal`) wird nicht automatisch gelöscht. Es hält je gelöschtem Datensatz Tabelle, Kennung, Datenklasse, Fälligkeit und Zeitpunkt fest — keinen Namen, keinen Inhalt, keine Fremdschlüssel auf bestehende Daten.

**Begründung.** ADR-008 Punkt 8 verlangt, wirksam gewordene Löschungen nach einer Wiederherstellung erneut anzuwenden, aus einer Liste, die den Restore überlebt; eine Liste mit eigener Frist könnte kürzer sein als die älteste Backup-Generation, und gelöschte Daten kämen unbemerkt zurück. Solange der Backup-Lebenszyklus offen ist (ADR-012), lässt sich keine sichere Frist bestimmen. Der Preis ist gering: Die verbleibende UUID ist ein Schlüssel ohne Schloss (Erwägungsgrund 26 DSGVO), und die Zeile ist zugleich der von ADR-008 verlangte Nachweis. Unsicher: ob die Prüfung das Journal dennoch als personenbezogen einstuft.

**Anker.** Datenklasse `loeschjournal` in `supabase/migrations/20260911150000_retention_schedule.sql` und der Tabellenkommentar von `public.deletion_journal`.

**Änderungspfad.** Frist einführen, sobald der Backup-Lebenszyklus steht: Zeile in `retention_classes` auf Anker `event_time` und ein Intervall, das die älteste Backup-Generation sicher überdauert, plus Regel im Löschlauf · Aufwand `klein`.

### ANN-032 — „Abschluss der Versorgung" als ausdrücklicher, rücknehmbarer Vorgang

Praxisprozess · entschieden (Jannes) · 2026-09-11 · Jannes · erledigt · Wiedervorlage: Jannes nach den ersten Praxiswochen (passt der Vorgang in den Alltag?); die Datenschutzprüfung sieht den Fristanker unabhängig davon

**Ablösung.** ersetzt ANN-002 in der Frage „Behandlungsabschluss"

**Annahme.** Der „Abschluss der Behandlung" aus §630f Abs. 3 BGB ist ein ausdrücklicher Vorgang auf der Akte: `patients.care_concluded_on`, gesetzt von `owner`, `therapist` oder `team_lead`, mit frei wählbarem Tag (nicht in der Zukunft, nicht vor dem Beginn der Versorgung) und zurücknehmbar. Ohne diesen Vorgang läuft keine Aufbewahrungsfrist und wird nichts gelöscht; eine Rücknahme lässt die Frist mit dem nächsten Abschluss neu beginnen.

**Begründung.** ADR-008 verlangt den Anker und lässt seine Definition offen; ANN-002 hält fest, dass `inactive` ihn nicht ersetzt. Gegen einen Automatismus („sechs Monate kein Termin") spricht, dass er eine zehnjährige Frist ohne fachliche Entscheidung startet, dass eine Pause kein Abschluss ist und dass die automatische Klassifizierung am offenen Rechtsrahmen B9 hängt. Die Rücknehmbarkeit ist die sicherere Seite (§16, ADR-008 Punkt 2). Unsicher: ob die Praxis den Vorgang zuverlässig ausführt — wird er vergessen, wird nicht gelöscht, der Fehler geht also in Richtung Aufbewahrung.

**Anker.** `public.conclude_patient_care`, `public.reopen_patient_care` und `app.can_conclude_patient_care()` in `supabase/migrations/20260911160000_care_conclusion.sql`; Tests in `supabase/tests/care-conclusion.test.ts`; Oberfläche `VersorgungAbschliessen` in `src/features/patients/PatientDetailPage.tsx`.

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

Recht · entschieden (Jannes) · 2026-09-12, nachgezogen 2026-09-16 (CAL-018) · Jannes · Prüfpaket · Wiedervorlage: ABR-003 — sobald es Rechnungen gibt, entscheidet die Rechnung statt des Kennzeichens; Datenschutzprüfung (B2)

**Annahme.** Ein Termin im Zustand `no_show` fällt unter die bestehende Klasse `termin_ohne_nachweis` — drei Jahre ab Ende des Kalenderjahres, gerechnet ab dem Zeitpunkt des Vermerks statt ab der Absage. Er wird nicht gelöscht, wenn ein Gebührenanlass gesetzt ist; Behandlungsnachweis und Löschsperre halten ihn wie bisher zurück. Eine eigene Datenklasse bekommt er nicht. **Seit CAL-018** trägt jedes Nichtantreffen am Hausbesuch diesen Anlass (E14, ADR-018 Fassung 3 Punkt 9) — dort ist der Löschschutz damit der Regelfall und nicht mehr die Ausnahme; in der Praxis und im Videotermin bleibt es umgekehrt (ANN-055).

**Begründung.** Die Klasse trägt seit LOE-001a ausdrücklich „Abgesagte Termine und No-shows ohne Rechnung" (ADR-008); fachlich ist beides derselbe Fall — ein Termin ohne Behandlungsnachweis und ohne die Zehnjahresfrist aus §630f Abs. 3 BGB —, und eine eigene Klasse mit derselben Frist wäre eine zweite Zahl für denselben Sachverhalt (ADR-014). Dass ein No-show mit Kennzeichen stehen bleibt, ist die vorsichtigere Seite (§16): Was abgerechnet werden soll, unterliegt der steuerlichen Aufbewahrung (§147 AO, §257 HGB). Unsicher: ob diese Frist an der Rechnung hängt statt am Vorgang — ABR-003 beantwortet das mit der Rechnung selbst.

**Anker.** Die Regel „Abgesagte Termine und No-shows ohne Behandlungsnachweis" in `public.apply_retention()`, zuletzt gefasst in `supabase/migrations/20260912200000_cancellation_notice.sql` (Bedingung `fee_basis is null`); Tests in `supabase/tests/retention-run.test.ts`. Die Regel selbst blieb mit CAL-018 unverändert — sie fragt seit CAL-014b nach dem Anlass und nicht nach seiner Herkunft.

**Änderungspfad.** Eigene Klasse mit eigener Frist: eine Zeile in `retention_classes`, eine Zuordnung in `retention_assignments`, die Regel aufteilen · Aufwand `klein`. Rechnung statt Kennzeichen als Haltegrund: eine Bedingung in derselben Regel austauschen, sobald ABR-003 die Rechnungstabelle bringt · Aufwand `klein` — dafür ist die Wiedervorlage gesetzt.

### ANN-036 — `documented` auch aus `confirmed`: die Finalisierung schließt den Termin mit ab

Technik · in ADR überführt · 2026-09-13 · ADR-018 Fassung 3 · erledigt · Wiedervorlage: ADR-018; erneut nur mit ABR-003, wenn `invoiced` denselben Weg geht

**Verweis.** Am 2026-09-13 in ADR-018 Fassung 3 überführt: Die Finalisierung einer Behandlungsdokumentation hebt den Termin auch aus `confirmed` auf `documented`, setzt `completed_at` nach und lässt `completed_by` leer. Maßgeblich ist seitdem der ADR; Herleitung und Abwägung: Git-Historie bis `7160fd5`.

**Anker.** `app.mark_appointment_documented()` in `supabase/migrations/20260912130000_appointment_documented.sql`; Tests in `supabase/tests/appointment-states.test.ts` samt Invariantenprüfung über alle Termine.

**Änderungspfad.** Umkehren: die `where`-Bedingung auf `status = 'completed'` verengen und `finalize_treatment_note` einen `confirmed`-Termin abweisen lassen · Aufwand `klein` im Code, aber eine neue fachliche Entscheidung für den Scheduler-Fall — und eine Änderung an ADR-018.

### ANN-037 — Geprüft wird die Länge des Terminfensters, nicht der Zeitpunkt

Praxisprozess · entschieden (Jannes) · 2026-09-12 · Jannes · erledigt · Wiedervorlage: keine — die Längenschranke ist mit `PROJECT_PRINCIPLES.md` 0.11 §8.1 entfallen (CAL-020)

**Ablösung.** abgelöst durch ANN-056 in der Frage, wogegen die Länge geprüft wird; der Bestandsschutz („nur wenn sie sich ändert") gilt dort unverändert weiter

**Annahme.** `create_appointment` verlangt immer ein Zeitfenster von 60 Minuten; `update_appointment` prüft die Länge genau dann, wenn sie sich ändert. Ein Bestandstermin mit abweichender Länge bleibt gültig, bearbeitbar und verschiebbar, solange seine Länge unangetastet bleibt. Im Bearbeitungsformular zieht ein geänderter Beginn das Ende mit der bisherigen Länge mit; ein eigener Knopf setzt den Termin ausdrücklich auf das Terminfenster.

**Begründung.** §8.1 sagt zweierlei, das sich beim Verschieben eines Bestandstermins nicht beides halten lässt: Prüfung, „wenn das Zeitfenster neu gesetzt wird", und Bestandsschutz — die Anwendung DARF einen Altfall „nicht selbsttätig verlängern, verkürzen oder verschieben". Die Auflösung nach Rang gibt dem stärkeren Verbot recht; die MUSS-Anforderung bleibt vollständig durchgesetzt, weil kein Weg eine abweichende Länge neu entstehen lässt. Unsicher: ob Jannes lieber hätte, dass ein verschobener Altfall die 60 Minuten gleich mitbekommt — bequemer, aber gegen das Verbot.

**Anker.** `app.appointment_window_minutes()` und die beiden Längenprüfungen in `supabase/migrations/20260912150000_appointment_window.sql`; `TERMINFENSTER_MINUTEN`, `fensterEnde` und `terminLaengeMinuten` in `src/features/appointments/api.ts`; Tests in `supabase/tests/appointment-window.test.ts`.

**Änderungspfad.** Strenger (jede Zeitänderung erzwingt 60 Minuten): die Bedingung `v_neu_laenge is distinct from v_alt_laenge` streichen und das Formular nachziehen · Aufwand `klein`, ohne Datenumzug. Lockerer (begründete Abweichung nach E12 Punkt 1): ein Parameter nach dem Muster `p_allow_outside_working_hours` mit Auditvermerk · Aufwand `klein` bis `mittel`.

### ANN-038 — Terminserie: verplant ist nicht genutzt, drei Rhythmen, höchstens 30 je Vorgang

Praxisprozess · entschieden (Jannes) · 2026-09-12 · Jannes · erledigt · Wiedervorlage: nur noch mit ABR-002: dort entscheidet sich, ob die genutzte Menge automatisch fortgeschrieben wird

**Ablösung.** ersetzt ANN-012 in der Zählweise („verplant ist nicht genutzt") · **ANN-064** ersetzt die Bezugsgröße: `verordnet` ist seit VER-EPIC-002 die Anzahl möglicher **Termine**, nicht die Summe der Leistungsmengen. Die Formel `offen = verordnet − max(genutzt, verplant)` bleibt unverändert

**Annahme.** Drei Festlegungen: Verplant ist nicht genutzt — ein aus einer Verordnung geplanter Termin trägt deren Kennung, offen ist `verordnet − max(genutzt, verplant)`, abgesagte Termine zählen nicht als verplant, „nicht angetroffen" zählt mit, und die genutzte Menge pflegt die Praxis weiter von Hand (ANN-012). Das Kontingent begrenzt die Serie nicht: Die Oberfläche schlägt das offene Kontingent vor und weist auf eine Überschreitung hin, der Server lässt sie zu. Drei Rhythmen (wöchentlich, zweimal pro Woche als 3/4-Wechsel, zweiwöchentlich), höchstens 30 Termine je Vorgang.

**Begründung.** Ohne die Verknüpfung böte die Anwendung beim zweiten Aufruf dieselben Behandlungen erneut an; eine Addition von genutzt und verplant zählte jede durchgeführte Behandlung doppelt. Die genutzte Menge automatisch fortzuschreiben wäre eine Aussage über die Leistung und gehört zu ABR-002. Die harte Grenze sitzt bereits an der Constraint `prescription_items_used_within_prescribed`; eine zweite am Kalender blockierte alltägliche Planung, ohne die Abrechnung sicherer zu machen. Der 3/4-Wechsel hält die Serie auf zwei festen Wochentagen. Unsicher: ob Jannes eine Rückfrage bei Überschreitung will und ob Gebietstage feste Wochentage verlangen.

**Anker.** `app.prescription_slot_counts()` und `app.appointment_series_limit()` sowie die Spalte `appointments.prescription_id` in `supabase/migrations/20260912160000_appointment_series.sql`; `rhythmen` und `SERIE_HOECHSTZAHL` in `src/features/appointments/serie.ts`.

**Änderungspfad.** Automatischer Verbrauch: ABR-002 schreibt `used_quantity` fort, die Rechnung fällt auf `verordnet − genutzt` zurück · Aufwand `mittel`. Harte Grenze: eine Prüfung in `create_appointment_series` gegen `remaining` · Aufwand `klein`. Weitere Rhythmen oder freier Tagesabstand: ein Eintrag in `rhythmen` · Aufwand `klein`.

### ANN-039 — Terminzettel: Inhalt, Druck, Aufruf als Aktenzugriff protokolliert

Datenschutz · entschieden (Jannes) · 2026-09-12 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2); der Versandweg seit CAL-013 in ANN-041 und B15

**Ablösung.** abgelöst durch ANN-041 in Punkt 2 (Versand)

**Annahme.** Der Terminzettel trägt Name der Patient:in und je Termin Datum, Uhrzeit, Ort und behandelnde Person — nicht Terminstatus, Verordnung, Diagnose, Behandlungsinhalt oder die Hausbesuchsadresse (der Ort steht als „bei Ihnen zu Hause"); ausgegeben werden nur bestätigte künftige Termine. Sein Aufruf wird als `patient_record.viewed` mit `view: 'appointment_slip'` protokolliert. Der Druck vermerkt nichts; erst die anschließende Frage „Wurde der Zettel ausgehändigt?" schreibt den Mitteilungsvermerk. Der Versandweg ist seit CAL-013 in ANN-041 geregelt.

**Begründung.** Was auf Papier steht, lässt sich nicht zurückrufen: Der Zettel beantwortet genau eine Frage, alles weitere wäre Offenlegung ohne Zweck (§5, §4.6). ADR-010 Punkt 2 verlangt das Öffnen einer Akte als auditierbares Ereignis — der Zettel ist derselbe Blick über eine andere Adresse, ein eigener Ereignistyp hätte den Katalog verlängert, ohne mehr zu sagen. Der Vermerk wanderte in Fassung 2 hinter den Druck, weil ein abgebrochener Druckdialog der Regelfall ist und ein Vermerk, der eine Aushändigung behauptet, ein unrichtiges Datum wäre (Art. 5 Abs. 1 lit. d DSGVO). Unsicher: ob die Prüfung ein eigenes Ereignis „Dokument ausgegeben" vorzöge.

**Anker.** `public.list_patient_appointment_slip()` in `supabase/migrations/20260912170000_appointment_slip.sql` — Spaltenliste und Auditeintrag sind die Grenze; `src/features/appointments/AppointmentSlipPage.tsx`; Tests in `supabase/tests/appointment-slip.test.ts`.

**Änderungspfad.** Zur Reihenfolge aus Fassung 1 zurück: Klickhandler und Bestätigungskasten in `AppointmentSlipPage.tsx` · Aufwand `klein`. Mehr oder weniger Inhalt: Spaltenliste und Darstellung · Aufwand `klein`. Eigenes Auditereignis: ein Eintrag im Katalog und ein geänderter `insert` · Aufwand `klein`. Versand nach B15: eigenes Epic · Aufwand `groß`.

### ANN-040 — Mitteilungsvermerk: vier Wege, Verfall mit jeder Terminänderung, Auditeintrag

Datenschutz · offen · 2026-09-12 · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2); der Weg `email` zusätzlich mit B15 und PAT-006

**Annahme.** Ein Termin trägt einen Vermerk, ob und auf welchem Weg er der Patient:in mitgeteilt wurde: vier Wege (persönlich, telefonisch, Terminzettel ausgehändigt, per E-Mail) — `sms` und `messenger` fehlen bewusst. Der Vermerk verfällt mit jeder Terminänderung (gültig nur, solange `notified_at >= appointments.updated_at`), gelöscht wird dabei nichts. Der Vorgang ist auditiert (`appointment.notified`), mit den Wegen im Kontext und ohne jeden Inhalt. Seit CAL-013 entsteht der Weg `email` auch aus der Übergabe ans Mailprogramm (ANN-041).

**Begründung.** Die Wahl des Kanals bleibt Sache der Praxis; die Anwendung hält fest, was geschehen ist, und schafft keinen Empfänger, der vorher keiner war — deshalb kein neuer Verarbeitungsweg nach §3.5. Ein Vermerk, der eine verschobene Zeit überlebt, wäre schlimmer als keiner; der Vergleich gegen `updated_at` löst das ohne Frist und ohne Aufräumlauf, um den Preis, dass „nie mitgeteilt" und „seit der Mitteilung geändert" gleich aussehen — beabsichtigt, der Handlungsbedarf ist derselbe. Unsicher und deshalb im Prüfpaket: ob die Datenschutzprüfung den Weg `email` in der Auswahl sehen will.

**Anker.** Tabelle `public.appointment_notifications`, `app.appointment_notification_channels()`, `public.set_appointment_notification()` und `public.add_appointment_notification()` in `supabase/migrations/20260912180000_appointment_notification.sql`; `notificationChannelSchema` in `src/features/appointments/api.ts`.

**Änderungspfad.** Weg streichen oder ergänzen: ein Wert in Constraint, Zod-Schema und Beschriftungstabelle · Aufwand `klein`; gesetzte Vermerke eines gestrichenen Weges wären einmalig zu entfernen. Verfallsregel lockern: Vergleich gegen einen eigenen Zeitstempel, den nur `update_appointment` bei Zeitänderungen bumpt · Aufwand `mittel`. Echter Versand nach B15: eigenes Epic · Aufwand `groß`.

### ANN-041 — Termin-E-Mail als Handoff ins eigene Mailprogramm

Datenschutz · offen · 2026-09-12 · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2); der dokumentierte Wunsch je Patient:in mit PAT-006

**Ablösung.** ersetzt ANN-039 Punkt 2 (Versand)

**Annahme.** Die Anwendung baut eine `mailto:`-Adresse und übergibt sie dem Mailprogramm der Praxis — kein Versand, keine Verbindung, keine gespeicherte Nachricht, nur auf Aktion und nie automatisch. Inhalt sind genau die Felder des Terminzettels, der Betreff nennt weder Praxis noch Fach („Ihre nächsten Termine"). Vor der Übergabe zeigt die Oberfläche Text, Empfängeradresse und den Hinweis, dass E-Mail unterwegs unverschlüsselt ist und der Weg den ausdrücklichen Wunsch der Patient:in voraussetzt. Die Übergabe vermerkt nichts; erst die Frage „Wurde sie gesendet?" schreibt den Vermerk. Der Entwurf bleibt unter 1 800 Zeichen, kürzt von hinten und benennt, welche Termine fehlen.

**Begründung.** §3.5 verlangt die Prüfung vor der Freischaltung eines Dienstleisters; ein Handoff schaltet keinen frei — die Nachricht entsteht im Postfach, das die Praxis ohnehin betreibt (dieselbe Konstruktion wie der Navigations-Handoff, ANN-018). Eine Terminliste ist ein Gesundheitsdatum; die DSK-Orientierungshilfe zur E-Mail-Übermittlung (16.06.2021) verlangt dafür Ende-zu-Ende- und Transportverschlüsselung, erkennt aber den ausdrücklichen Wunsch nach Aufklärung an (so auch die Hinweise von Bundesärztekammer/KBV). Unsicher und deshalb im Prüfpaket: Dieselben Quellen sagen, dass das Schutzniveau nicht durch Vereinbarung absenkbar ist — die Antwort dieser Annahme ist deshalb Datenminimierung, nicht Einwilligung. Der Vermerk steht hinter der Übergabe, weil die Anwendung den Ausgang eines Handoffs nicht sieht (§13).

**Anker.** `src/features/appointments/terminmail.ts` — Inhalt, Betreff, Längengrenze und Übergabe an einer Stelle; Oberfläche `src/features/appointments/TermineMailen.tsx` in `AppointmentSlipPage.tsx`; Tests in `terminmail.test.ts` und `TermineMailen.test.tsx`.

**Änderungspfad.** Inhalt oder Betreff ändern: `terminMailText` und `MAIL_BETREFF` · Aufwand `klein`. Den Weg zurücknehmen: `TermineMailen` aus `AppointmentSlipPage.tsx` entfernen, beide Dateien löschen; der Weg `email` bleibt als Vermerk von Hand · Aufwand `klein`. Dokumentierten Wunsch je Patient:in verlangen: Kennzeichen in den Kontaktdaten plus Bedingung · Aufwand `mittel`, gehört zu PAT-006. Echter Versand: eigenes Epic · Aufwand `groß`.

### ANN-042 — Wann eine Verordnung ausgeschöpft ist

Praxisprozess · offen · 2026-09-12 · — · — · Wiedervorlage: Jannes nach den ersten Praxiswochen; erneut mit ABR-002, sobald die genutzte Menge aus der Abrechnung kommt

**Ablösung.** ersetzt ANN-012 in der Frage, wann eine Verordnung ausgeschöpft ist · **ANN-064** ersetzt die Bezugsgröße: gezählt werden seit VER-EPIC-002 Termine

**Annahme.** Eine Verordnung gilt als ausgeschöpft, sobald ihre genutzten die möglichen Termine erreichen (`used >= prescribed`). Solange Termine offen sind, gilt sie als laufend und zerfällt in „offen" (`remaining > 0`, es lässt sich noch etwas planen) und „vollständig verplant" (Termine offen, aber für jeden steht ein Eintrag im Kalender). Ein Ablauf nach Zeit kommt nicht vor.

**Begründung.** Die Praxis rechnet privat ab; die Fristen des Heilmittelkatalogs sind GKV-Regeln und gelten für eine Privatverordnung nicht unmittelbar, und welche Frist ein privater Kostenträger ansetzt, steht in seinem Tarif. Eine erfundene Frist zeigte eine Verordnung als erledigt, die es nicht ist — genau davor warnt §13. Gezählt wurden bis VER-EPIC-002 Leistungseinheiten, weil ein Termin abgesagt werden kann und seinen Platz zurückgibt, eine genutzte Einheit aber genutzt bleibt; seit ANN-064 steht dieselbe Überlegung an der genutzten **Terminzahl**, die aus derselben Spalte kommt und ebenso wenig zurückfällt.

**Anker.** `verordnungszustand()` in `src/features/treatment-bases/grundlagen.ts` — die eine Stelle, an der die Regel steht; Tests in `src/features/treatment-bases/PatientTreatmentBasesPage.test.tsx`.

**Änderungspfad.** Schwelle ändern (etwa „ausgeschöpft erst, wenn jeder Termin stattgefunden hat"): `verordnungszustand()` · Aufwand `klein`. Ablauf nach Zeit ergänzen: Feld `valid_until` an `prescriptions`, im Formular und in `create/update_prescription` gepflegt · Aufwand `mittel`, mit Migration.

### ANN-043 — Auth-Links werden über den `token_hash` eingelöst, nicht über eine Sitzung in der Adresszeile

Datenschutz · offen · 2026-09-12 · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2); Providerprüfung OPS-001, Teil Auth-Mails

**Annahme.** Der Rückweg aus einer Auth-Mail läuft über den einmaligen `token_hash`: eigene Vorlagen (`recovery.html`, `magic_link.html`) übergeben `{{ .TokenHash }}` an eine Adresse dieser Anwendung, eingelöst wird mit `verifyOtp`, `detectSessionInUrl` bleibt `false`. Es gibt genau zwei öffentliche Seiten, `/kennwort-neu` und `/zugang`. Nach dem Setzen bleibt die Person nur auf diesem Gerät angemeldet; steht dort schon eine Sitzung, wird zuerst gefragt, und „Angemeldet bleiben" lässt den Link unverbraucht. Ein Verbindungsfehler gilt nicht als verbrauchter Link.

**Begründung.** Der Weg über `{{ .ConfirmationURL }}` verlangt `detectSessionInUrl: true`; dann stünde ein vollwertiges Zugriffs- und Erneuerungstoken im Adressfragment — im Verlauf und für jedes Skript lesbar. Ein `token_hash` ist einmalig, kurzlebig und für sich keine Sitzung (§16). Selbst zerlegte Fragmente mit `setSession` wären Eigenbau an der Sitzungsmechanik, den §3.4 ausschließt; PKCE verlangt den Prüfschlüssel im selben Browserprofil und bricht im häufigsten Praxisfall (angefordert am Praxisrechner, geöffnet am Telefon). Die beiden Seiten geben keine Auskunft über den Kontobestand, weil abgelaufener, benutzter und vorab geöffneter Link denselben Fehler liefern (§13).

**Anker.** `src/features/auth/linkEinloesen.ts` — `loeseLinkEin`, die Unterscheidung von `LinkUngueltigError` und `VerbindungError`, beide Pfadkonstanten und `istEinloesePfad` (die Liste steht dort und nicht im Gate, weil genau diese Trennung einmal schiefging); Vorlagen unter `supabase/templates/`, Einträge in `supabase/config.toml`.

**Änderungspfad.** Anderer Wortlaut in der Mail: die Vorlagen · Aufwand `klein`. Zurück auf `detectSessionInUrl: true`: eine Zeile in `src/lib/supabase.ts` und die Vorlagen auf `{{ .ConfirmationURL }}` · Aufwand `klein`, mit den Token im Verlauf als Folge. Auf PKCE wechseln · Aufwand `klein`, aber der geräteübergreifende Fall bricht — nicht empfohlen. Eigener Mailversand: eigenes Epic, neuer Dienstleister nach §3.5 und Rücknahme von B13 · Aufwand `groß`.

### ANN-044 — „Alle Sitzungen beenden": Vermerk als Vorbedingung, und die Zusage nennt das Restfenster

Datenschutz · offen · 2026-09-12 · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2); der Wert `jwt_expiry` mit OPS-001

**Annahme.** Der Vermerk steht vor dem Vorgang „Alle Sitzungen beenden" und ist seine Vorbedingung: Scheitert er, unterbleibt das Abmelden. Er hält die Auslösung fest, nicht die Wirkung. Die Zusage nennt das Restfenster: Sitzungen und Erneuerungstoken löscht der Anmeldedienst sofort, ein ausgestelltes Zugriffstoken bleibt bis `jwt_expiry` gültig; sofort wirkt allein die Sperre des Zugangs, weil die Datenbank bei jeder Anfrage `user_profiles.is_active` liest.

**Begründung.** Der Vermerk kann dem Vorgang nicht folgen, weil dieser dem Konto die eigene Sitzung nimmt und `log_account_security_event` `auth.uid()` verlangt — nachher melden hieße gar nicht melden, und ein Auditlog, dessen Einträge nicht zu den Tatsachen passen, ist nach ADR-010 wertlos. Das läuft ANN-041 Fassung 2 entgegen, und zwar bewusst: Dort ist der Ausgang nicht beobachtbar, hier ist er beobachtbar, aber nicht mehr aufschreibbar. Das gemeinsame Prinzip ist dasselbe — nichts festhalten, wofür man nicht einstehen kann.

**Anker.** `src/features/account/api.ts` — Dateikopf und `meldeVorab`; der Text in `src/features/account/MeinKontoPage.tsx`, Abschnitt „Sitzungen"; Tests in `src/features/account/api.test.ts`.

**Änderungspfad.** Anderer Wortlaut: der Text in `MeinKontoPage` · Aufwand `klein`. Restfenster verkleinern: `jwt_expiry` in `config.toml` und im Cloudprojekt · Aufwand `klein`, mit häufigerem Erneuern als Folge. Vermerk serverseitig aus dem Vorgang erzeugen: Migration mit autonomer Transaktion · Aufwand `mittel`. Sofortiger Widerruf einzelner Token · Aufwand `groß`, zweite Berechtigungsschicht ohne Not.

### ANN-045 — Das gewöhnliche Abmelden endet nur die eigene Sitzung

Technik · offen · 2026-09-12 · — · — · Wiedervorlage: Jannes nach dem ersten Feldtag

**Annahme.** Das gewöhnliche Abmelden läuft mit `scope: 'local'`, ausdrücklich angegeben und nicht als Weglassung. Alle Geräte beendet ausschließlich der eigene Weg auf „Mein Konto".

**Begründung.** Wer am Praxisrechner Feierabend macht, meldet nicht sein Diensttelefon mit ab — er müsste sich beim nächsten Hausbesuch neu anmelden, unterwegs und womöglich im Funkloch; die weiter reichende Wirkung ist hier nicht die sicherere, sondern die überraschende. Zwei Wege mit unterschiedlicher Reichweite sind zudem nur verständlich, wenn sie sich unterscheiden. Die Angabe steht ausdrücklich im Code, weil der Default des Anmeldedienstes sich ändern kann und die Absicht aus einem Fehlen nicht zu lesen wäre.

**Anker.** `src/features/auth/SessionProvider.tsx` (`signOut`); Test in `src/features/auth/SessionProvider.test.tsx`.

**Änderungspfad.** Zurück auf global: die Angabe entfernen oder auf `'global'` setzen · Aufwand `klein`; dann ist der Text in `MeinKontoPage.tsx` mitzuändern und „Alle Sitzungen beenden" verliert seinen Zweck. Wahl beim Abmelden anbieten · Aufwand `klein`, aber eine Entscheidung mehr an einer Stelle, an der niemand eine treffen will.

### ANN-046 — Navigationsschutz: Data Router, drei Wege, und „Speichern" heißt Entwurf

Technik · offen · 2026-09-12 · — · — · Wiedervorlage: Jannes nach dem ersten Feldtag mit Dokumentation unterwegs

**Ablösung.** ersetzt ANN-015 im Textverlustschutz

**Annahme.** Vier Festlegungen: Der Router wird ein Data Router (`createBrowserRouter` mit einer Platzhalterroute), denn nur so gibt es `useBlocker`. Die Rückfrage bietet drei Wege — speichern und weitergehen, verwerfen und weitergehen, hier bleiben — im eingelassenen Kasten `Rueckfrage`, nicht als modaler Dialog. „Speichern" sichert den Entwurf, nie mehr; wo es keinen Entwurfszustand gibt (Korrektur eines finalisierten Eintrags), gibt es nur Verwerfen und Bleiben. Ein Fehlschlag navigiert nicht: Text und Seite bleiben stehen, die Rückfrage bleibt offen.

**Begründung.** Ein eigener Wachposten käme an das Zurück des Browsers nur über einen Eingriff in die Verlaufsliste heran — selbst gebaute Infrastruktur, wo die eingesetzte Bibliothek eine geprüfte anbietet (ADR-015, §3.4 sinngemäß); der gewählte Weg ändert die Routentabelle nicht und ist mit zwei Dateien zurückzunehmen. §19 und ADR-016 machen die Finalisierung zum ausdrücklichen Schritt mit Folgen — sie darf nicht Nebenwirkung eines Tastendrucks sein, der Entwurf ist die leichter umkehrbare Seite (§16). Ein Seitenwechsel nach fehlgeschlagenem Speichern wäre der stille Verlust, den §13 ausschließt.

**Anker.** `src/features/documentation/Textverlustschutz.tsx` (`useTextverlustschutz`); Router in `src/app/App.tsx`, Abmeldeschutz in `src/app/abmeldeschutz.ts` und `AbmeldeschutzProvider.tsx`; Tests in `Textverlustschutz.test.tsx` (29 Fälle) und `tests/e2e/authenticated/treatment-note-workflows.spec.ts`.

**Änderungspfad.** Zurück auf `<BrowserRouter>`: zwei Dateien, dann entfällt der Schutz für interne Navigation ersatzlos · Aufwand `klein`. Speichern auch für die Korrektur anbieten: ein Parameter mehr, aber eine fachliche Entscheidung gegen ADR-016 · Aufwand `klein`, Folge `groß`. Schutz auf weitere Formulare ausdehnen: je Formular ein Aufruf des Hooks · Aufwand `klein` je Stelle.

### ANN-047 — Nur die Patientenabsage löst die Ausfallgebühr aus; „verlegt" und „sonstiger Grund" nicht

Praxisprozess · offen · 2026-09-12 · — · — · Wiedervorlage: Jannes, zusammen mit ABR-001 (Leistungskatalog)

**Annahme.** Von den vier Absagegründen (ANN-034) löst genau einer die 24-Stunden-Regel aus: `patient_request`. `practice_request` ist ausdrücklich ausgenommen; `moved` („Termin verlegt") und `other` („Sonstiger Grund") lösen ebenfalls nicht aus — das ist die Lücke, die diese Annahme schließt.

**Begründung.** Für `moved` spricht der Wortsinn: Eine Verlegung ist das Ergebnis einer Absprache, und wer einen Ersatztermin bekommt, zahlt nicht für den ersten. `other` sagt über den Anlass per Definition nichts — daraus eine Forderung abzuleiten hieße, sie auf eine Nicht-Angabe zu stützen. Beides ist die leichter umkehrbare Seite (§16): Eine nicht entstandene Gebühr lässt sich nachtragen, solange der Vorgang steht (der Löschlauf wartet drei Jahre), eine zu Unrecht vorgemerkte Forderung ist erst aus der Welt, wenn jemand sie bemerkt.

**Anker.** `app.is_late_cancellation()` in `supabase/migrations/20260912200000_cancellation_notice.sql`; Tests in `supabase/tests/cancellation-notice.test.ts` (je ein Fall für alle drei ausgenommenen Gründe).

**Änderungspfad.** Weitere Gründe aufnehmen: eine Bedingung in `app.is_late_cancellation` · Aufwand `klein`. Beschriftung von `moved` schärfen: eine Zeile in `cancellationReasonLabels` · Aufwand `klein`. Rückwirkend gilt eine Änderung ausdrücklich nicht: Was ohne Gebührenanlass abgesagt wurde, bleibt ohne.

### ANN-048 — Der Eingang der Absage wird in Ortszeit erfasst, ohne Vorbelegung aus der Vergangenheit

Praxisprozess · offen · 2026-09-12 · — · — · Wiedervorlage: Jannes nach den ersten Wochen im Betrieb

**Annahme.** Die Absage-Rückfrage fragt „Wann ist die Absage eingegangen?" mit zwei Antworten — „Gerade eben" (vorbelegt) und „Früher – jetzt erst eingetragen", die erst Datum und Uhrzeit einblendet. Bei „Gerade eben" schickt die Anwendung kein Datum, die Datenbank setzt `now()`; eine falsch gehende Uhr im Browser entscheidet nie über eine Forderung. Datum und Uhrzeit werden in Ortszeit der Praxis erfasst, die Umrechnung macht der Server.

**Begründung.** Der Regelfall ist das laufende Telefonat — dafür darf niemand ein Datum tippen; der Ausnahmefall ist der Anrufbeantworter von gestern Abend, an dem eine Forderung hängt. Ein einzelnes vorbelegtes Feld hätte beides vermischt: Wer die Vorbelegung stehen lässt, hätte eine Angabe gemacht, ohne sie zu treffen. Ein Zeitstempel aus dem Browser verlangte, dass die Oberfläche eine Wanduhrzeit umrechnet — eine Rechnung, die sie sonst nirgends macht und die auf einem Gerät in anderer Zeitzone still falsch wäre.

**Anker.** `AbsageAktion` in `src/features/appointments/AppointmentDetailPage.tsx` und der Parameterblock von `public.cancel_appointment` in `supabase/migrations/20260912200000_cancellation_notice.sql`; Tests in `AppointmentDetailPage.test.tsx` und `supabase/tests/cancellation-notice.test.ts`.

**Änderungspfad.** Vorbelegung entfernen und eine Antwort verlangen: ein Anfangswert und eine Prüfung · Aufwand `klein`. Den Eingang zur Pflichtangabe für jede Absage machen · Aufwand `klein`, aber dann trägt jede Absage am Telefon einen Tap mehr.

### ANN-049 — Ereignisse stehen in derselben Tabelle wie Behandlungstermine

Technik · offen · 2026-09-12 · — · — · Wiedervorlage: ABR-002 (Leistungserfassung) — dort muss die Abgrenzung halten

**Ablösung.** abgelöst durch ANN-051 in der Frage der gemeinsamen Kennung

**Annahme.** Ein Ereignis des Praxisbetriebs ist eine Zeile in `public.appointments` mit `kind = 'event'`, ohne `patient_id`, ohne `prescription_id`, mit `title` — kein eigenes Datenmodell und keine eigene Tabelle.

**Begründung.** Ein Ereignis belegt denselben Kalender und denselben Zeitraum wie eine Behandlung; die `EXCLUDE`-Constraint gegen Doppelbuchungen wirkt nur innerhalb einer Tabelle, eine zweite hätte die Belegungsprüfung in Anwendungscode verlagert und damit genau den Schutz aufgegeben, der hier zählt — nebenbei hätte jede Kalenderabfrage zwei Quellen zusammenführen müssen. Der Preis ist die Fallunterscheidung in den Schreibpfaden; vier Constraints halten sie zusammen, eine Behandlung ohne Patient:in und ein Ereignis mit Patient:in sind schemaseitig unmöglich.

**Anker.** `supabase/migrations/20260912210000_appointment_events.sql` — Kopfkommentar und Constraints; Tests in `supabase/tests/appointment-events.test.ts` (26 Fälle).

**Änderungspfad.** Eigene Tabelle: Migration mit Datenübernahme, neue Belegungsprüfung über beide Tabellen, jede Kalenderabfrage anfassen · Aufwand `groß`.

### ANN-050 — Der Kalender trägt Patient:in und Verordnung als Kontext mit

Praxisprozess · offen · 2026-09-12 · — · — · Wiedervorlage: Jannes nach den ersten Wochen im Betrieb

**Annahme.** Der Kalenderstand führt neben `patient` einen zweiten Kontextparameter `verordnung`; beide stehen als Kennung in der Adresse, nie als Name und nie als Diagnose (ADR-011). Ist der Kalender auf eine Patient:in gefiltert, führt ein Tap auf eine freie Stelle direkt in deren Terminformular — mit Verordnung, wenn eine mitgereist ist — statt über die Patientensuche; der Rückweg ist der Kalenderstand.

**Begründung.** Der Weg „Akte → Verordnung → Kalender → freie Stelle" ist genau dann etwas wert, wenn am Ende nicht noch einmal gesucht werden muss; ein Formular, das nach der eben ausgewählten Person fragt, ist eine Rückfrage ohne Erkenntnis. Der Filter grenzt weiterhin nur die Darstellung ein, nicht den Lesepfad (AKTE-003): Der Kalender liest den Ausschnitt ohnehin vollständig, sichtbar ist, was die RLS liefert.

**Anker.** `KalenderParameter.verordnung` in `src/features/appointments/calendar.ts` und `freieZeit` in `src/features/appointments/CalendarPage.tsx`; Tests in `CalendarPage.test.tsx` und `calendar.test.ts`.

**Änderungspfad.** Kontextweg herausnehmen: zwei Stellen · Aufwand `klein`. Patientenfilter beim Planen nur hervorheben statt ausblenden: eine Änderung in der Darstellung des Gitters · Aufwand `klein` bis `mittel`.

### ANN-051 — Ein Teamereignis ist ein Vorgang; die einzelne Teilnahme bleibt davon getrennt

Praxisprozess · offen · 2026-09-13 · — · — · Wiedervorlage: Jannes, nach der ersten Woche mit Teambesprechungen im Kalender

**Ablösung.** ersetzt ANN-049 in der Frage der gemeinsamen Kennung

**Annahme.** Die Zeilen eines Ereignisses tragen eine gemeinsame Gruppenkennung (`event_group_id`) und sind damit ein Vorgang, nicht n Termine. Bezeichnung, Tag, Zeit, Länge, Art und Ort gehören dem Ereignis und werden für alle Beteiligten zugleich geändert — in einer Transaktion, mit Konfliktprüfung je Person vor dem ersten Schreibzugriff; dasselbe gilt für die Absage. Wer teilnimmt, gehört der einzelnen Zeile („Teilnahme ändern", „Nur diese Teilnahme absagen"). Bestandszeilen werden nicht zusammengeführt.

**Begründung.** Eine Besprechung, die bei einer Person um 9 und bei einer anderen um 10 steht, hat niemand gemeint — sie entsteht aber zwangsläufig, wenn das Verschieben je Kalender einzeln geschieht und irgendwo unterbricht; die Belegungsprüfung bleibt richtigerweise an der einzelnen Zeile, ergänzt wird nur die Klammer darüber. Absage für sich und Absage für alle sehen ähnlich aus und bedeuten Verschiedenes, deshalb zwei Schaltflächen mit zwei Namen. Eine Heuristik über Titel und Uhrzeit würde zwei getrennte Vorgänge stillschweigend verheiraten — eine nachträgliche Umdeutung vorhandener Daten (§13).

**Anker.** `supabase/migrations/20260913100000_event_groups.sql`: `event_group_id`, `update_appointment_event`, `cancel_appointment_event`, `list_event_participants` und der Trigger `appointments_event_group_guard`; `updateAppointmentEvent` in `src/features/appointments/api.ts`; Oberfläche in `EditEventPage.tsx` und `AppointmentDetailPage.tsx`.

**Änderungspfad.** Beteiligte nachträglich hinzufügen: Personenliste im Formular und ein Einfügezweig in `update_appointment_event` · Aufwand `mittel`. Trennung zwischen Ereignis und Teilnahme aufgeben: der Trigger bleibt, `update_appointment` verlöre seinen Ereigniszweig · Aufwand `klein`, Folge `mittel` (Personentausch nur noch über Absage und Neueintrag).

### ANN-052 — Eine Datei verlässt den Speicher nur über einen auditierten Vorgang

Datenschutz · offen · 2026-09-13, Fassung 2 vom 2026-09-15 (FIX-015) · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2); erneut, sobald OPS-001 Punkt 5 beantwortet ist (Entzug eines Verweises vor Ablauf); vor jeder UPDATE-Policy auf `storage.objects`; bei jedem Upgrade der Storage-API — Supabase aktualisiert sie im Betrieb ohne Zutun, deshalb läuft `patient-file-access.spec.ts` vor der ersten echten Datei regelmäßig gegen Staging (ROADMAP, OPS-001)

**Annahme.** Jede Storage-Operation an einer Datei der Akte braucht eine **einmalige Freigabe** der anfragenden Person. `issue_patient_file_link` protokolliert `patient_file.link_issued` und legt sie für genau diese Datei an; `claim_storage_deletion_order` protokolliert `storage_deletion.claimed` und legt sie für das Objekt genau dieses Löschauftrags an; diese Löschfreigabe gilt nur für die Entfernen-Operation, die die Storage-API in `storage.operation` meldet. Die RLS auf `storage.objects` lässt eine Zeile nur gegen eine passende Freigabe zu, die höchstens 30 Sekunden alt ist, und verbraucht sie dabei. Ein so signierter Verweis gilt danach unverändert 60 Sekunden (ADR-017 Punkt 15).

**Begründung.** Ein signierter Verweis entsteht im Browser; eine serverseitige Zwischenstelle gibt es nicht, weil eine Edge Function für produktive Gesundheitsdaten nach ADR-015 Punkt 20 nicht freigegeben ist. Die erste Fassung verließ sich darauf, dass nur `issue_patient_file_link` den Objektschlüssel herausgibt. Der Schlüssel ist aber für jede lesende Rolle ableitbar und nach einem Öffnen ohnehin bekannt (BEF-004); ein versteckter Zufallsanteil hätte daran nichts geändert. Die RLS ist die einzige Stelle, die die Storage-API vor Signieren, Laden, Auflisten, Kopieren und Löschen fragt. Die Storage-API 1.72 prüft Signieren, Laden, Kopieren und Entfernen mit der Rolle der anfragenden Person gegen diese RLS, meldet dabei die Operation in `storage.operation` und liest einen bereits signierten Verweis als Superuser — belegt am Code der API und gegen die laufende API im E2E-Test. Grenzen: Eine Auflistung prüft jede Zeile des Buckets und verbraucht dabei offene Freigaben der anfragenden Person, nie fremde; Verschieben prüft die Quelle in einer zurückgerollten Transaktion und scheitert nur, weil es keine UPDATE-Policy gibt; eine verfallene, nicht genutzte Freigabe liegt bis zur nächsten Ausstellung in der Organisation. Unsicher: ob eine spätere Version der Storage-API anders abfragt und ob 30 Sekunden für eine langsame Verbindung reichen.

**Anker.** `app.patient_file_access_grant_ttl()`, `app.may_read_patient_file_object`, `app.may_read_storage_object_for_deletion`, `issue_patient_file_link` und `claim_storage_deletion_order` in `supabase/migrations/20260915120000_patient_file_access_grants.sql`; `oeffneDatei` in `src/features/files/api.ts`; Tests in `supabase/tests/patient-file-access.test.ts` und `tests/e2e/authenticated/patient-file-access.spec.ts`.

**Änderungspfad.** Andere Wartezeit: `app.patient_file_access_grant_ttl()` · Aufwand `klein`. Fällt OPS-001 Punkt 5 positiv aus (Entzug eines Verweises ohne Support), kommt ein Werkzeug hinzu · Aufwand `klein`. Wird die Edge Runtime freigegeben, kann die Ausstellung serverseitig unterschreiben, und die Freigabetabelle entfällt · Aufwand `mittel`.

### ANN-053 — Die Bestätigung prüft Größe und MIME-Typ gegen den Objektspeicher; die Prüfsumme bleibt eine Erklärung des Browsers

Technik · offen · 2026-09-13 · — · — · Wiedervorlage: mit ABR-003b (Rechnungs-PDF, ADR-009 Punkt 9) und mit dem Restore-Test aus ADR-012 Punkt 6

**Annahme.** Größe und MIME-Typ werden serverseitig gegen `storage.objects.metadata` geprüft, das die Storage-API beim Upload selbst schreibt; weichen sie von der Ankündigung aus Phase (a) ab, bleibt die Datei `pending` und wird nicht sichtbar. Die SHA-256-Prüfsumme wird nicht nachgerechnet: Sie entsteht vor dem Hochladen im Browser, wird in Phase (a) mitgegeben und unverändert festgehalten.

**Begründung.** Die **Größe** in `metadata` misst die Storage-API an den empfangenen Bytes und ist damit eine echte zweite Quelle — der Grund, warum es Phase (c) gibt. Für den **MIME-Typ gilt das nicht** (R3-014): Dort übernimmt die API unverändert den `contentType` desselben Uploads, und den leitet der Browser aus der Dateiendung ab; Phase (c) vergleicht insoweit zwei Angaben derselben Quelle. Deshalb prüft der Browser seit R3-014 vor Phase (a) zusätzlich die ersten Bytes gegen das angekündigte Format — keine Virenprüfung und keine Hürde für jemanden, der den Browser selbst steuert, aber eine umbenannte Fremddatei fällt damit auf. Die Datenbank sieht die Bytes nie und könnte die Summe nur nachrechnen, wenn sie die Datei lädt; den HTTP-Zugang dafür zu schaffen (`pg_net`, Edge Function) wäre eine neue wesentliche Abhängigkeit und ein Stopp nach §15.1. Die Summe ist deshalb eine festgehaltene Erklärung — aus derselben Sitzung wie der Upload, über den Auditeintrag einer Person und einem Zeitpunkt zugeordnet; wer auf einem Praxisgerät Bytes fälschen wollte, könnte auch eine falsche Datei hochladen (ADR-017 Punkt 8 und 20).

**Anker.** `supabase/migrations/20260913110000_patient_files.sql`: `confirm_patient_file_upload` (Vergleich gegen `storage.objects.metadata`) und der Kommentar an `patient_files.checksum_sha256`; `pruefsumme` in `src/features/files/api.ts` und `dateiInhaltAblehnungsgrund` in `src/features/files/dokumentarten.ts`; Tests in `supabase/tests/patient-files.test.ts`, Abschnitt „Phase (c): bestaetigen".

**Änderungspfad.** Prüfsumme serverseitig nachrechnen: braucht einen Vorgang, der die Datei liest — freigegebene Edge Runtime oder ein Betriebswerkzeug, das den Abgleich aus DAT-003 erweitert · Aufwand `mittel`, zusätzlich eine Providerentscheidung, wenn er außer Haus läuft. Prüfsumme ganz weglassen · Aufwand `klein`, aber ADR-017 Punkt 9 und ADR-009 Punkt 9 verlören ihren einzigen technischen Anker — nicht empfohlen.

### ANN-054 — Der Dependency-Audit blockiert den Merge ab Schweregrad `high`

Technik · offen · 2026-09-15 · — · — · Wiedervorlage: mit OPS-002 (Betriebsaufnahme, Roadmap G5)

**Annahme.** `pnpm audit --audit-level=high` im Job „Secret Scanning und Dependency Audit" lässt `low` und `moderate` durch und macht den Lauf ab `high` rot. Gemeldet werden alle Schweregrade in der Jobausgabe; blockierend sind nur `high` und `critical`.

**Begründung.** ADR-013 nennt den Dependency-Scan als Pflichtprüfung, legt die Schwelle aber nicht fest; die Folgefrage steht in `OPEN_DECISIONS.md` (Spur F). `high` ist die Schwelle, ab der eine Meldung in der Regel einen praktisch erreichbaren Pfad beschreibt — darunter überwiegen bei einer reinen Browseranwendung ohne Serverlauf transitive Befunde in Werkzeugketten, die ein Gate nur abstumpfen würden (§16: ein Gate, das oft grundlos rot ist, wird umgangen). Die Einschätzung ist vorläufig und gehört mit der Betriebsaufnahme auf den Prüfstand.

**Anker.** `.github/workflows/ci.yml`: der Schritt „Dependency Audit" mit dem Kommentar `ANN-054` über `--audit-level=high`.

**Änderungspfad.** Schwelle senken (`moderate`) oder anheben: ein Wort in `ci.yml` · Aufwand `klein`. Wird zusätzlich eine Ausnahmeliste nötig, kommt sie als `pnpm.auditConfig.ignoreCves` in `package.json` dazu, mit je einer Begründung · Aufwand `klein`.

### ANN-055 — Protokoll und Ausfallgebühr des Nichtantreffens gelten am Hausbesuch

Praxisprozess · entschieden (Jannes) · 2026-09-16, bestätigt 2026-09-17 · Jannes · erledigt · Wiedervorlage: ABR-003, sobald die Rechnung statt des Anlasses entscheidet; erneut, falls die Praxis je Räume bezieht

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

Praxisprozess · entschieden (Jannes) · 2026-09-18 · Jannes · erledigt · Wiedervorlage: ABR-EPIC-001, falls ein nachgetragener Termin abrechnungsseitig anders zu behandeln ist; Datenschutzprüfung nur, falls `in_the_past` je als Merkmal am Termin gespeichert würde

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

Technik · offen · 2026-09-18 · — · — · Wiedervorlage: Jannes, sobald er eine Dauerfehlzeit eine Weile geführt hat — insbesondere, ob „die ganze Serie" ohne die vergangenen Vorkommen das Erwartete tut

**Annahme.** Eine Dauerfehlzeit bekommt mit `appointments.event_series_id` eine **zweite** Kennung neben der Gruppenkennung aus CAL-017: Die Gruppe ist ein Vorkommen mit allen Beteiligten, die Serie sind alle Vorkommen. Serienweite Änderung und Absage wirken ausschließlich auf die **noch nicht begonnenen** Vorkommen; begonnene und bereits abgesagte bleiben unberührt und werden übersprungen. Die Tage einer Serie ändert kein serienweiter Vorgang — wer sie verschieben will, sagt die Serie ab und legt eine neue an.

**Begründung.** CAL-EPIC-004 überlässt dem SPEC die Wahl, ob eine Kennung beides trägt. Sie kann es nicht: „dieses Vorkommen" ist genau die Gruppe, und eine doppelt belegte Spalte machte jede Änderung an einer Woche zu einer Änderung an allen. Der Schnitt nach vorn folgt `PROJECT_PRINCIPLES.md` §13: Ein Teammeeting, das letzte Woche stattgefunden hat, nachträglich als abgesagt zu führen, wäre eine Aussage über die Vergangenheit, die niemand getroffen hat; dieselbe Grenze zieht `update_appointment_event` schon für den Tag (CAL-003). Die Serie bleibt dabei Erzeugungsregel und kein Zustandsträger (ADR-018 Punkt 5): keine Tabelle, kein Serienstatus. Unsicher: ob die Praxis eine Serie je um Tage verschieben will statt sie neu zu legen.

**Anker.** `event_series_id`, `create_event_series`, `update_event_series`, `cancel_event_series` in `supabase/migrations/20260918110000_event_series.sql`; `createEventSeries`, `updateEventSeries`, `cancelEventSeries` in `src/features/appointments/api.ts`.

**Änderungspfad.** Serienweite Vorgänge auch auf begonnene Vorkommen: die `having`-Bedingung in beiden Funktionen streichen · Aufwand `klein`. Serie um Tage verschieben: ein weiterer Parameter und eine Neuberechnung der Tage in `update_event_series` · Aufwand `mittel`. Zurück zu einer Kennung: nicht ohne Verlust von „dieses Vorkommen" · Aufwand `groß`.

### ANN-060 — Die Bezeichnung einer Fehlzeit ist organisatorisch, und geprüft wird das am Feld

Datenschutz · offen · 2026-09-18 · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung / DSFA-Prozess vor Produktivstart

**Annahme.** Die frei benannte Bezeichnung einer Fehlzeit (CAL-021) ist eine **organisatorische** Angabe: kein Patientenname, keine Diagnose, kein klinischer Inhalt. Durchgesetzt wird das an drei Stellen und ausdrücklich **nicht** durch eine inhaltliche Prüfung des Freitexts: der Hinweis am Eingabefeld sagt die Regel, die Länge ist auf 120 Zeichen begrenzt, und der Titel erscheint weder im Auditkontext noch in einem Log noch in der Adresszeile. Er steht allein an der Zeile und als Aufschrift im Gitter.

**Begründung.** Der Kalender ist für das ganze Team sichtbar; eine Fehlzeit mit Patientenbezug wäre eine Offenbarung ohne Anlass (`PROJECT_PRINCIPLES.md` §4.6, ADR-011 für die Logs). Eine automatische Inhaltsprüfung wäre die schlechtere Antwort: Sie müsste Patientennamen gegen den Bestand prüfen, dabei genau die Daten anfassen, die sie schützen soll, und ergäbe trotzdem falsche Treffer („Frau Meier" ist auch eine Kollegin). Deshalb die Regel am Feld, wo sie gelesen wird, plus die technische Zusicherung, dass der Text die Anwendung nicht verlässt. Unsicher: ob die Datenschutzprüfung eine Protokollierung der Bezeichnung bei Änderungen verlangt.

**Anker.** Hinweis und Längengrenze am Feld `Bezeichnung` in `src/features/appointments/EreignisFormFields.tsx`; der Auditkontext ohne Titel in `supabase/migrations/20260913100000_event_groups.sql` (`create_appointment_event`, `update_appointment_event`).

**Änderungspfad.** Bezeichnung aus einer Liste statt Freitext: ein Wertebereich in der Datenbank und eine Auswahl im Formular · Aufwand `mittel`. Prüfung gegen den Patientenbestand: eine Abfrage im Schreibpfad · Aufwand `mittel` — widerspräche der Begründung. Titel im Auditkontext: ein Feld in `jsonb_build_object` · Aufwand `klein`, aber eine neue Datenschutzentscheidung.

### ANN-061 — Die Kopfleistensuche findet Funktionen und Namen, keine klinischen Inhalte

Datenschutz · entschieden (Jannes) · 2026-09-18 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung / DSFA-Prozess vor Produktivstart; Jannes, sobald er die Leiste eine Weile bedient hat

**Annahme.** Die dauerhaft sichtbare Suchleiste findet zweierlei und nichts sonst: **Funktionen** (Bereiche, Seiten, Vorgänge — im Browser, aus der Navigation abgeleitet) und **Namen** von Patient:innen (serverseitig über `search_patients`, ab drei Zeichen, Obergrenze in der Datenbank). **Klinische Inhalte sind ausgeschlossen** — keine Diagnose, kein Verordnungsinhalt, keine Dokumentation, auch nicht als Stichwort eines Funktionstreffers. Die beiden Gruppen stehen in fester Reihenfolge, Funktionen zuerst; gemischt wird nicht. Die Rollenprüfung der Funktionsgruppe ist Relevanz, keine Zugriffskontrolle (§4.7).

**Begründung.** E17 Fassung 1 hätte die Namen aus der Leiste genommen; Jannes hat am 2026-09-18 entschieden, sie daneben zu behalten — der Weg aus einem Termin in eine Akte ist der häufigste im Haus, und ein Schritt mehr trifft ihn jedes Mal. Damit bleibt der Stand von UX-004: Ein Name steht nur so lange auf dem Bildschirm, wie jemand tippt, und nie in der Adresszeile (ADR-011). Eine Suche über klinische Inhalte wäre etwas anderes und keine Erweiterung: Sie bräuchte eine eigene Datenbankfunktion samt Policy, eine Entscheidung darüber, was ein Suchtreffer im Auditlog ist (ADR-004 Punkt 6, ADR-010), und sie stellte Diagnosen in eine Vorschlagsliste, die auf jedem Bildschirm des Teams aufgeht — deshalb ausdrücklich nicht hier. Die feste Reihenfolge ist kein Geschmack: Die Namen treffen eine Anfrage später ein, und eine nach Güte gemischte Liste verschöbe die Auswahl unter den Pfeiltasten genau dann, wenn die Antwort kommt. Unsicher: ob die Datenschutzprüfung Namen in einer auf jedem Bildschirm sichtbaren Leiste beanstandet.

**Anker.** `funktionskatalog` und `vorgaenge` in `src/app/funktionen.ts` (was gefunden wird), `Funktionssuche` in `src/app/Funktionssuche.tsx` (die beiden Gruppen und ihre Reihenfolge); Tests in `src/app/funktionen.test.ts` und `src/app/Funktionssuche.test.tsx`.

**Änderungspfad.** Namen wieder aus der Leiste (E17 Fassung 1): die Namensgruppe in `Funktionssuche` streichen, der Treffer „Patient:in suchen" bleibt · Aufwand `klein`. Weitere Trefferart (Verordnung, Termin): eine serverseitige Suchfunktion mit Policy, eine dritte Gruppe, eine Auditentscheidung · Aufwand `mittel` bis `groß` — und eine neue Datenschutzentscheidung. Gemischte statt fester Reihenfolge: eine gemeinsame Sortierung in `Funktionssuche`, dazu ein Weg, die Auswahl über eintreffende Treffer hinweg festzuhalten · Aufwand `mittel`.

### ANN-062 — Die Adresse der Akte behält `verordnungen`, die Beschriftung nicht

Technik · offen · 2026-09-18 · Loop GRD-001 · Wiedervorlage: sobald ein Loop die Routen der Akte ohnehin anfasst (CAL-EPIC-004c/AKTE-006)

**Annahme.** Die sichtbaren Beschriftungen folgen ADR-020 Punkt 7 — der Bereich der Akte heißt „Behandlungsgrundlagen", die einzelne Karte nennt ihre Bauart. Das **Adressfragment bleibt** `/patienten/:id/verordnungen` (samt `…/neu`, `…/:id/bearbeiten`, `…/:id/serie` und dem Filter `?verordnung=` an den Terminen), ebenso die Sprungmarke `#verordnung-<id>`.

**Begründung.** ADR-020 Punkt 7 regelt, was auf dem **Bildschirm** steht; über Adressen sagt er nichts, und ADR-020 zählt die Umbenennung ausdrücklich für Tabellen, Funktionen, Policies, Auditwerte, Typen und Texte auf. Eine geänderte Adresse entwertet jedes Lesezeichen und jeden Link, den jemand aus der Anwendung kopiert hat, und bringt fachlich nichts, was die Beschriftung nicht schon leistet. Sie mitzunehmen kostet außerdem dort nichts, wo ein Loop die Routen ohnehin anfasst — CAL-EPIC-004c baut die Gruppierung der Termine je Grundlage und berührt genau diese Wege. Gegen die Annahme spricht, dass Adresse und Beschriftung vorerst auseinanderfallen; das ist sichtbar, aber folgenlos, weil in der Adresse ohnehin nie ein Name steht (ADR-011).

**Anker.** Die Routen unter `/patienten/:patientId/verordnungen` in `src/routes/AuthenticatedRoutes.tsx`; der Bereichseintrag in `src/features/patients/akte.ts` trägt die Beschriftung neben demselben Pfad.

**Änderungspfad.** Adressfragment mitziehen: die vier Routen in `AuthenticatedRoutes.tsx`, `zurueck`/`verordnerRueckpfad` in `TreatmentBasisFormPage.tsx`, die Links in `PatientTreatmentBasesPage.tsx` und `PatientAppointmentsPage.tsx`, der Parametername `verordnung` im Kalenderstand, dazu die angemeldeten E2E-Tests · Aufwand `klein`, aber jedes bestehende Lesezeichen läuft ins Leere; sinnvoll nur zusammen mit einem Loop, der diese Seiten ohnehin öffnet.

### ANN-063 — Der Löschjournaleintrag wandert beim Umbenennen einer Tabelle mit

Technik · offen · 2026-09-18 · Loop GRD-001 · Wiedervorlage: Datenschutzprüfung / DSFA-Prozess vor Produktivstart

**Annahme.** Wird eine Tabelle umbenannt, schreibt die Migration den **Tabellennamen** in `deletion_journal.target_table` und in `retention_assignments.table_name` auf den neuen Wert um. Alles andere am Journaleintrag — welche Zeile, welche Klasse, wann, durch welchen Lauf — bleibt unverändert, und der zugehörige Auditeintrag wird nicht angefasst.

**Begründung.** Der Zweck des Löschjournals ist die **erneute Anwendung** einer Löschung nach einer Wiederherstellung (ADR-008 Punkt 9, LOE-002); `reapply_deletion_journal` löscht dafür je Eintrag aus der benannten Tabelle. Ein Eintrag, der auf `prescriptions` zeigt, findet nach GRD-001 keine Tabelle mehr — er wäre nicht mehr anwendbar und damit wertlos, und eine wiederhergestellte Sicherung behielte Zeilen, die gelöscht sein müssen. Das ist kein Umschreiben von Historie im Sinne von ADR-010: Der Auditeintrag daneben bleibt unberührt, und die Aussage des Journals („diese Zeile wurde gelöscht") ändert sich nicht — nur der Ort trägt seinen neuen Namen. Unsicher: ob die Datenschutzprüfung den Journaleintrag als Nachweis versteht, der überhaupt nicht angefasst werden darf; dann bräuchte es eine zweite Spalte mit dem historischen Namen.

**Anker.** Die beiden `update`-Anweisungen in `supabase/migrations/20260918120000_treatment_basis.sql`, Abschnitt 4b.

**Änderungspfad.** Historischen Namen mitführen statt umschreiben: eine Spalte `target_table_at_deletion` an `deletion_journal`, gefüllt beim Schreiben, und `reapply_deletion_journal` löst über eine Zuordnungstabelle auf · Aufwand `mittel`. Umgekehrt — gar nicht umschreiben — hieße, die Wiederanwendung für diese Einträge aufzugeben; das widerspricht ADR-008 Punkt 9.

### ANN-064 — Die Terminzahl steht an der Grundlage, die Leistungsmenge an der Position

Praxisprozess · entschieden (Jannes) · 2026-09-18 · Jannes · Prüfpaket · Wiedervorlage: ABR-002 (dort wird die genutzte Menge fortgeschrieben); Jannes nach den ersten Praxiswochen

**Ablösung.** löst ANN-012 vollständig ab; ersetzt in ANN-038 und ANN-042 die Bezugsgröße (Termine statt Leistungseinheiten)

**Annahme.** Eine Behandlungsgrundlage trägt in `treatment_bases.appointment_count` die **Anzahl möglicher Termine** — verordnet beim Rezept, vereinbart beim Selbstzahler (ADR-020 Punkt 5). Gegen diese Zahl plant die Anwendung; mehrere Heilmittel erzeugen keine zusätzlichen Termine. Die **Leistungsmenge** je Heilmittel bleibt an `treatment_base_items.prescribed_quantity`, ebenso die genutzte Menge. Das Formular schickt Positionen nur noch als Auswahl: Eine vorhandene Position behält ihre Mengen unverändert, eine neu angehakte erbt die Terminzahl als Leistungsmenge, und „Genutzt" ist keine Eingabe mehr — fortgeschrieben wird sie mit ABR-002. Genutzte **Termine** sind die größte genutzte Positionsmenge, nicht deren Summe. Bestandszeilen haben ihre Terminzahl aus der **größten** Positionsmenge geerbt, nie aus deren Summe.

**Begründung.** Das Kontingent war bis VER-EPIC-002 die Summe der Positionen: Eine Verordnung über sechs Termine mit KG-Doppelbehandlung, MT-Doppelbehandlung und Hausbesuch bot achtzehn Termine an — die Serienplanung hätte dreimal so viele Termine vergeben, wie das Rezept hergibt (§13). Jannes' Vorgabe trennt die beiden Größen ausdrücklich („Die Terminzahl zählt Behandlungstermine, keine Summe von Heilmitteln"); eine eigene Spalte ist die einzige Abbildung, die sie nicht wieder vermischt — ein abgeleiteter Wert (Summe, Maximum) wäre genau die Vermischung, die der Befund meint. Die Leistungsmenge bleibt, weil ABR-EPIC-001 sie braucht und §11 verbietet, sie vorsorglich wegzuwerfen. Dass das Formular keine Mengen mehr schreibt, ist der Preis dafür, dass es sie auch nicht mehr überschreiben kann: Eine Bestandsverordnung mit sieben genutzten von zehn Einheiten geht durch das vereinfachte Formular unverändert hindurch. Die Ableitung für den Bestand nimmt das Maximum, weil es nie über der alten Summe liegt — die Serienplanung kann dadurch nur weniger anbieten als vorher, nie mehr. Unsicher: ob die Praxis Leistungsmengen je Heilmittel später doch abweichend von der Terminzahl pflegen will; dann braucht ABR-001 dafür einen eigenen Weg.

**Anker.** Spalte `appointment_count` samt Kommentar und die Ableitung für den Bestand in `supabase/migrations/20260918130000_appointment_count.sql`; dort auch `app.treatment_basis_slot_counts` (die drei Zahlen) und `app.write_treatment_base_items` (Mengen bleiben stehen). In der Oberfläche `treatmentBasisFormSchema` und `rpcPositionen` in `src/features/treatment-bases/api.ts`.

**Änderungspfad.** Leistungsmenge wieder von Hand pflegen: ein Zahlenfeld je angehaktem Heilmittel im Formular, `rpcPositionen` schickt die Menge mit — der Schreibpfad nimmt sie bereits entgegen · Aufwand `klein`. Terminzahl wieder aus den Positionen ableiten: `app.treatment_basis_slot_counts` und die Spalte zurückbauen · Aufwand `mittel`, und der Befund von 2026-09-13 wäre zurück. Genutzte Termine aus der Abrechnung: in ABR-002 schreiben, `used` bleibt, wo es steht · Aufwand `mittel`.

### ANN-065 — „Anmerkungen" ist das organisatorische Feld, der Verordnerhinweis bleibt Bestand

Datenschutz · offen · 2026-09-18 · Loop VER-EPIC-002 · Prüfpaket · Wiedervorlage: Datenschutzprüfung; Jannes, sobald er eine Weile Verordnungen erfasst hat

**Annahme.** Das eine Textfeld „Anmerkungen" schreibt in die **organisatorische** Spalte `treatment_bases.note` — für beide Bauarten, in beiden Projektionen, für alle vier Praxisrollen sichtbar. Der klinische `prescriber_note` („Hinweis der Verordner:in") nimmt **keine neue Eingabe** mehr entgegen; ein vorhandener Text bleibt stehen, wird mit seiner Herkunft angezeigt und niemals zusammengeführt, überschrieben oder vervielfacht. Dasselbe gilt für `therapy_goal` und `follow_up_recommendation`.

**Begründung.** Die Feldvorgabe verlangt ein gemeinsames Feld „Anmerkungen" und nennt es die Nachfolge des Verordnerhinweises. Auf `prescriber_note` abgebildet hätte ein **Selbstzahler gar kein Anmerkungsfeld** mehr: ADR-020 Punkt 4 hält die klinischen Felder dort leer, und seit VER-EPIC-002 erzwingt das eine Constraint. `note` ist das einzige Feld, das beide Bauarten tragen und das die Vorgabe „allen vier Praxisrollen anzeigen" ohne das klinische Leserecht erfüllt — der Loop öffnet damit keine Sicht, die es nicht schon gab (§4.3, E15). Die Grenze zwischen organisatorischer und klinischer Projektion bleibt unangetastet: Diagnose, Therapieziel, Verordnerhinweis und Empfehlung stehen weiter ausschließlich in der klinischen Sicht. Zusammengeführt wird nichts, weil jede Zusammenführung beim zweiten Speichern denselben Text ein zweites Mal anhängen könnte. Unsicher: ob die Datenschutzprüfung Text, den das Office vom Rezept abschreibt, in der organisatorischen Spalte beanstandet — dann zieht der Hinweistext am Feld nach, oder das Feld wandert auf `prescriber_note` und der Selbstzahler bekommt ein eigenes.

**Anker.** Das Feld „Anmerkungen" auf `note` in `src/features/treatment-bases/TreatmentBasisFormFields.tsx`, die Beschriftung in `src/features/treatment-bases/grundlagenfelder.ts`; die Bestandstexte liefert `bestandstexte()` in `src/features/treatment-bases/api.ts`, und `public.update_treatment_basis` in `supabase/migrations/20260918130000_appointment_count.sql` fasst die drei Spalten nicht an.

**Änderungspfad.** „Anmerkungen" auf `prescriber_note` legen: das Feld im Formular umhängen, den Parameter in beiden Schreibpfaden wieder aufnehmen, ein zweites Feld für den Selbstzahler vorsehen · Aufwand `klein` bis `mittel`. Bestandstexte ganz entfernen: `bestandstexte()` streichen und die drei Spalten in einer Migration leeren · Aufwand `klein`, aber ein Textverlust ohne Weg zurück.

### ANN-066 — Der Heilmittelkatalog ist eine Liste im Code, kein gepflegter Stammdatensatz

Technik · offen · 2026-09-18 · Loop VER-EPIC-002 · Wiedervorlage: ABR-001 (Leistungskatalog mit Preisen und Steuerkennzeichen)

**Annahme.** Die vordefinierte Heilmittelauswahl steht als fünf Einträge in `src/features/treatment-bases/heilmittel.ts`: Krankengymnastik, KG als Doppelbehandlung, Manuelle Therapie, MT als Doppelbehandlung, Hausbesuch. Jeder Eintrag ist ein eigenes Kästchen und schließt keinen anderen aus. Die **Datenbank prüft den Wert nicht**: Ein Heilmittel außerhalb der Liste bleibt gültig, wird im Formular als angehakter Bestandseintrag mit seiner Menge angezeigt und verschwindet nur, wenn jemand es ausdrücklich abhakt.

**Begründung.** Die Vorgabe verlangt eine vordefinierte Auswahl und schließt eine freie Katalogverwaltung ausdrücklich aus; Preise kommen mit ABR-001. Eine Tabelle mit Pflegeoberfläche wäre ein Zukunftsfeature auf Vorrat (ADR-014 §11) und teurer zurückzunehmen als fünf Zeilen. Dass die Datenbank den Wert nicht prüft, ist der Punkt: Eine Prüfung wiese eine Bestandsposition („Wärmetherapie") beim nächsten Speichern ab — das Gegenteil von „Bestandswerte bleiben erhalten". Die Doppelbehandlung ist ein eigener Eintrag und kein Zusatzhaken, weil sie eine andere Leistung ist; nur so ist die Kombination KG-Doppelbehandlung + MT-Doppelbehandlung + Hausbesuch vollständig möglich. Die gespeicherten Bezeichnungen „Krankengymnastik" und „Manuelle Therapie" sind unverändert die aus VER-EPIC-001, damit eine Bestandsverordnung ihr Kästchen wiederfindet. Unsicher: ob die Praxis weitere Heilmittel braucht, bevor ABR-001 den Leistungskatalog bringt — dann kommt ein Eintrag dazu, nicht eine Verwaltungsoberfläche.

**Anker.** `HEILMITTEL` und `istBestand()` in `src/features/treatment-bases/heilmittel.ts`.

**Änderungspfad.** Weiteres Heilmittel: eine Zeile in `heilmittel.ts` · Aufwand `klein`. Eintrag entfernen: dieselbe Zeile streichen — vorhandene Positionen bleiben als Bestand stehen · Aufwand `klein`. Echte Katalogtabelle mit Preisen: gehört zu ABR-001, dort mit Versionierung und Steuerkennzeichen (ADR-009) · Aufwand `groß`.

### ANN-067 — Gedeckt sind die frühesten Termine einer Grundlage, gezählt statt zugeteilt

Praxisprozess · offen · 2026-09-18 · Loop CAL-EPIC-004c · Wiedervorlage: ABR-002 (dort entsteht die Leistung, die eine Deckung braucht); Jannes nach den ersten Wochen mit Dauerterminen

**Annahme.** Ob eine Behandlungsgrundlage einen Termin trägt, ist **gerechnet und nicht gespeichert**: Die nicht abgesagten Termine einer Grundlage werden nach Beginn geordnet (bei gleichem Beginn nach Kennung), die ersten `appointment_count` gelten als gedeckt, jeder weitere als geplant, aber ungedeckt. Ein abgesagter Termin macht keine Aussage — er verbraucht nichts, und sein Platz rückt an den nächsten weiter. Ein Termin ohne Grundlage ist nicht ungedeckt, sondern ungebunden. Die Zahlen `covered` und `uncovered` an der Grundlage sind dieselbe Rechnung als Summe.

**Begründung.** CAL-022 verlangt, dass Überplanung sichtbar wird, und lässt offen, **welcher** Termin ungedeckt ist. Eine gespeicherte Zuteilung („dieser Termin verbraucht Einheit 7") wäre eine zweite Wahrheit neben dem Kalender: Jede Absage, jede Verschiebung und jede Übertragung müsste sie nachziehen, und liefe sie einmal auseinander, zeigte die Akte eine Deckung, die es nicht gibt (§13). Gerechnet kann sie nicht auseinanderlaufen. Die Reihenfolge nach Beginn bildet ab, wie die Praxis denkt: Die Verordnung trägt, was zuerst stattfindet; was danach kommt, gehört auf die Folgeverordnung. Deterministisch muss sie sein, weil Kalender, Akte und Terminliste sonst verschiedene Antworten gäben — daher die Kennung als zweites Ordnungsmerkmal. Dass Abgesagtes nicht zählt, folgt derselben Linie wie „verplant" (ANN-038): Eine Absage gibt den Platz zurück. Unsicher: ob die Praxis einen einzelnen Termin ausdrücklich als ungedeckt kennzeichnen will, obwohl ein früherer noch offen ist — das wäre eine Zuteilung und bräuchte eine Spalte.

**Anker.** `app.appointment_is_covered` und die beiden Ausgaben `covered`/`uncovered` in `app.treatment_basis_slot_counts`, beide in `supabase/migrations/20260918140000_appointment_coverage.sql`.

**Änderungspfad.** Andere Reihenfolge (etwa Anlagedatum statt Beginn): die `order by`-Entsprechung in `app.appointment_is_covered` ändern · Aufwand `klein`. Echte Zuteilung je Termin: eine Spalte an `appointments`, Pflege in jedem Schreibpfad samt Absage und Übertragung · Aufwand `groß`. Abgesagte mitzählen: die Bedingung `status <> 'cancelled'` an beiden Stellen streichen · Aufwand `klein`, widerspricht aber ANN-038.

### ANN-068 — Übertragen wird jeder Termin derselben Patient:in außer abgesagt und abgerechnet

Praxisprozess · offen · 2026-09-18 · Loop CAL-EPIC-004c · Wiedervorlage: ABR-002/ABR-003 (dann steht die Leistung als eigene Zeile, nicht nur der Terminzustand)

**Annahme.** `transfer_appointments_to_treatment_basis` nimmt jeden Termin an, der zur Patient:in der **Zielgrundlage** gehört und weder `cancelled` noch `invoiced` ist — auch einen vergangenen oder bereits durchgeführten. Die Patient:in kommt aus der Zielgrundlage und nicht vom Aufrufer. Das **Kontingent des Ziels wird nicht geprüft**: Die Übertragung darf es überschreiten, und was dann nicht mehr gedeckt ist, zeigt die Akte (ANN-067). Alles oder nichts; ein einziger unzulässiger Termin lässt den ganzen Vorgang scheitern. Die Oberfläche bietet davon nur die **ungedeckten künftigen** Termine an. `updated_at` bleibt unberührt, der Mitteilungsvermerk gilt weiter.

**Begründung.** Die Vorgabe nennt eine einzige Grenze ausdrücklich: „nie mit abgerechneter Leistung". Leistungen gibt es noch nicht (ABR-EPIC-001), und der einzige objektive Marker dafür ist heute der Terminzustand `invoiced` — er ist deshalb die Grenze, die die Datenbank zieht. Ein abgesagter Termin kommt dazu, weil er nichts mehr plant: Ihn umzuhängen änderte rückwirkend die Zahlen zweier Grundlagen, ohne dass ihm etwas folgt. Ein durchgeführter Termin bleibt dagegen übertragbar — genau dann fällt im Alltag auf, dass die Behandlung schon zur Folgeverordnung gehörte. Das Kontingent des Ziels zu prüfen wäre widersprüchlich: Denselben Termin dort neu anzulegen ist erlaubt (CAL-022), ihn dorthin zu übertragen also zu verbieten, wäre eine Regel, die nur den bequemeren Weg trifft. Dass `updated_at` stehen bleibt, folgt aus CAL-012: Mitgeteilt wurde ein Zeitpunkt, und der ändert sich nicht. Unsicher: ob die Praxis einen bereits durchgeführten Termin überhaupt übertragen will — dann kommt `completed`/`documented` zur Ausschlussliste.

**Anker.** Die Bedingung `status not in ('cancelled', 'invoiced')` in `public.transfer_appointments_to_treatment_basis`, `supabase/migrations/20260918140000_appointment_coverage.sql`; das Angebot der Oberfläche in `angebot` in `src/features/treatment-bases/TermineUebertragenPage.tsx`.

**Änderungspfad.** Weitere Zustände ausschließen: die Liste in der Funktion ergänzen und den Testfall spiegeln · Aufwand `klein`. Kontingent des Ziels doch prüfen: eine Abfrage vor dem Schreiben, Fehlermeldung mit Zahl · Aufwand `klein`, widerspricht aber CAL-022. Echte Leistungsprüfung statt Terminzustand: gehört zu ABR-002, dort über die Leistungszeile · Aufwand `mittel`.

### ANN-069 — Die Akte gruppiert Termine je Richtung, nicht über beide hinweg

Technik · offen · 2026-09-18 · Loop CAL-EPIC-004c · Wiedervorlage: Jannes, sobald er die Akte einer Person mit mehreren Verordnungen im Alltag benutzt

**Annahme.** Der Terminbereich der Akte behält die beiden Abschnitte „Kommende Termine" und „Vergangene Termine" und gruppiert **innerhalb** jedes Abschnitts nach Behandlungsgrundlage: je Grundlage eine Überschrift mit Bauart und Ausstellungsdatum, daneben ihre Deckung, darunter ihre Termine. Termine ohne Grundlage stehen in einem eigenen, so benannten Abschnitt am Ende. Die Reihenfolge der Gruppen ist die des Bereichs „Behandlungsgrundlagen" (neueste zuerst). Gruppiert wird, was geladen ist; die Deckungszahlen kommen vom Server und zählen immer alle Termine der Grundlage.

**Begründung.** AKTE-006 verlangt „je Verordnung ein Abschnitt … und die Termine darunter" und sagt nichts darüber, ob die Trennung in kommend und vergangen dabei fällt. Sie fallen zu lassen hieße, die Frage aufzugeben, für die der Bereich gebaut wurde (AKTE-003: „was steht an, und was war"). Beide Listen blättern über einen eigenen Keyset-Cursor; eine Gruppe je Grundlage über beide Richtungen bräuchte je Grundlage zwei davon — bei fünf Grundlagen zehn Abfragen beim Öffnen — und zeigte in einer Akte über zehn Jahre zwanzig Abschnitte, von denen zwei Arbeitsvorrat sind. Dass nur das Geladene gruppiert wird, ist der Preis des Blätterns; die Deckung daneben ist davon unabhängig und ändert sich beim Weiterblättern nicht. Unsicher: ob Jannes die Grundlage als oberste Ebene erwartet und die Trennung kommend/vergangen darunter — dann tauschen die beiden Ebenen die Plätze, und jede Gruppe bekommt zwei Listen.

**Anker.** `gruppiere()` und `Gruppenkopf` in `src/features/appointments/PatientAppointmentsPage.tsx`.

**Änderungspfad.** Grundlage als oberste Ebene: `Terminliste` je Gruppe zweimal aufrufen, Cursor je Gruppe und Richtung · Aufwand `mittel`. Gruppierung ganz zurücknehmen: `gruppiere()` streichen, die flache Liste mit dem Grundlagenlink je Zeile steht in der Historie · Aufwand `klein`.

### ANN-070 — Die Katalogversion ist eine eingefrorene Preisliste, die Leistung verweist auf ihre Position

Technik · offen · 2026-09-19 · — · — · Wiedervorlage: mit ABR-003, wenn der Rechnungssnapshot nach ADR-009 Punkt 10 entsteht

**Annahme.** Eine Katalogversion ist eine vollständige Preisliste mit Gültigkeitsbeginn. Als Entwurf beliebig änderbar, mit dem Veröffentlichen unveränderlich — Positionen, Preise, Steuerkennzeichen und der Beginn; eine Preisänderung ist deshalb immer eine neue Version. Welche Liste an einem Tag gilt, ist die veröffentlichte mit dem größten Beginn bis zu diesem Tag, und maßgeblich ist der **Leistungstag**, nicht der Tag der Erfassung. Eine Leistung kopiert daher **keinen** Preis, sondern verweist auf die Position. Die steuerliche Einordnung steht je Position in drei Werten: `exempt_healthcare` (Heilbehandlung, § 4 Nr. 14 UStG), `taxable` (etwa Prävention oder Training) und `not_taxable` (kein Leistungsaustausch — der Fall des Ausfallhonorars); welcher Wert im Einzelfall gilt, entscheidet die Praxis mit ihrer Steuerberatung.

**Begründung.** ADR-009 Punkt 5 verlangt, dass spätere Preisänderungen historische Leistungen nicht verändern, und beschreibt selbst den Verweis auf eine Katalogversion statt auf einen aktuellen Preis. Eine Preiskopie an der Leistung wäre ein zweiter Wert für denselben Sachverhalt und damit die Abweichung, die §13 an der Abrechnung ausschließt; den Snapshot verlangt ADR-009 Punkt 10 erst beim Ausstellen der Rechnung. Die Sperre sitzt am Trigger und nicht im Schreibpfad, damit sie für jeden Weg in die Tabelle gilt. Die drei Steuerwerte sind nicht erfunden: Ohne `not_taxable` müsste ein Ausfallhonorar als steuerfrei oder steuerpflichtig geführt werden, und beides wäre falsch. Unsicher: ob die Praxis je einen anderen Steuersatz als 19 Prozent braucht — die Spalte trägt Promille und kann es, das Formular bietet es noch nicht an.

**Anker.** Tabellen `service_catalog_versions` und `service_catalog_items`, die Trigger `service_catalog_versions_frozen` und `service_catalog_items_frozen` sowie `app.active_service_catalog_version()` in `supabase/migrations/20260919100000_service_catalog.sql`.

**Änderungspfad.** Preis doch an der Leistung festhalten: Spalten an `billable_services` und ihre Belegung in `record_billable_services` · Aufwand `mittel`, mit Migration. Einen weiteren Steuersatz zulassen: ein Zahlenfeld neben der Auswahl in `CatalogPage.tsx`, die Spalte nimmt ihn bereits · Aufwand `klein`. Eine veröffentlichte Liste doch korrigierbar machen: die beiden Trigger · Aufwand `klein` — widerspräche ADR-009 Punkt 5.

### ANN-071 — Preise pflegt die Inhaberin, Leistungen erfassen Inhaberin und Office

Praxisprozess · offen · 2026-09-19 · — · — · Wiedervorlage: Jannes nach den ersten Praxiswochen — insbesondere, ob eine Therapeutin am Termin selbst erfassen soll

**Annahme.** Den Leistungskatalog **lesen** alle vier Praxisrollen, **pflegen** darf ihn allein `owner`. Leistungen **erfassen und zurücknehmen** dürfen `owner` und `office`; die therapeutischen Rollen tun es nicht, und die Erfassung findet im Abrechnungsbereich statt, nicht am Termin. Die Termin-Detailseite bleibt unberührt.

**Begründung.** §4.1 zählt Praxiseinstellungen zur Inhaberrolle, §4.3 gibt dem Office Rechnungen und Zahlungsstatus — nicht die Preisbildung. Lesen muss der Katalog für alle offen sein, sonst sähe die Erfassung ihre eigenen Preise nicht. Die Erfassung auf zwei Rollen zu beschränken hält den Bedienweg an einer Stelle: Eine zweite Oberfläche am Termin wäre eine zweite Implementierung derselben Regel, und die Regel selbst ist ohnehin serverseitig. Unsicher: ob das im Alltag trägt — bei einer Praxis, in der Jannes beide Rollen hat, fällt der Unterschied nicht auf, bei einer angestellten Therapeutin schon.

**Anker.** `app.can_read_service_catalog()` und `app.can_manage_service_catalog()` in `supabase/migrations/20260919100000_service_catalog.sql`; `app.can_read_billable_services()` und `app.can_record_billable_services()` in `supabase/migrations/20260919110000_billable_services.sql`; die Anzeigeweiche `canManageServiceCatalog` und `canRecordBillableServices` in `src/features/session/types.ts`.

**Änderungspfad.** Therapeut:innen erfassen lassen: die beiden `can_*_billable_services()` um `therapist` und `team_lead` erweitern, dazu `canRecordBillableServices` · Aufwand `klein`; ein Einstieg am Termin käme als eigene Aufgabe dazu · Aufwand `mittel`. Office Preise pflegen lassen: `app.can_manage_service_catalog()` · Aufwand `klein`.

### ANN-072 — Eine Leistung entsteht nur aus „dokumentiert" oder aus einem Gebührenanlass, ohne Override

Praxisprozess · offen · 2026-09-19 · — · — · Wiedervorlage: Probewoche 1 — ob der fehlende Override im Alltag stört

**Annahme.** `record_billable_services` nimmt einen Termin nur an, wenn er im Zustand `documented` steht **oder** einen Gebührenanlass trägt (`fee_basis`, ADR-018 Fassung 2). Es gibt keinen Weg daran vorbei und keinen begründeten Override. Aus einem dokumentierten Termin entstehen ausschließlich Positionen der Art `treatment`, aus einem Gebührenanlass ausschließlich `absence_fee`; beides rutscht nie ineinander. Ein Ereignis ohne Patient:in erzeugt keine Leistung.

**Begründung.** `PROJECT_PRINCIPLES.md` §19 sagt das abschließend: „In V1 gibt es keinen Override: Fakturiert wird ausschließlich aus ‚dokumentiert' oder aus einem Vorgang mit Gebührenanlass (ADR-018)." Der Eintrag zu ABR-EPIC-001 in `ROADMAP.md` nennt dagegen „Kopplung an finalisierte Dokumentation mit protokolliertem Override (C1, ANN-006)" — die Roadmap hat keinen Rang, §21 gibt den Prinzipien den ersten, also gilt der Satz ohne Override. Die Trennung von Behandlung und Ausfallhonorar folgt daraus, dass an einem nicht angetroffenen Termin keine Behandlung stattgefunden hat; sie in einem Feld zu vermischen wäre genau die Falschzuordnung aus §13.

**Anker.** Die Zustandsprüfung und `v_erwartet` in `public.record_billable_services` in `supabase/migrations/20260919110000_billable_services.sql`.

**Änderungspfad.** Einen Override einführen: Er wäre eine Änderung an §19 und damit kein Fall für eine Annahme — erst Prinzipien, dann Spalten für Grund und Protokoll an `billable_services` · Aufwand `mittel`. Weitere abrechenbare Ereignisse neben dem Termin: eine eigene Quelle an der Leistung · Aufwand `groß`.

### ANN-073 — Die genutzte Menge der Grundlage schreibt die Leistungserfassung fort

Praxisprozess · offen · 2026-09-19 · — · — · Wiedervorlage: Probewoche 1 · löst die Wiedervorlage von ANN-012, ANN-038 und ANN-064 ein

**Ablösung.** löst die Wiedervorlage „automatischer Verbrauch mit ABR-002" aus ANN-012, ANN-038 und ANN-064 ein; die dort beschriebene Handpflege entfällt

**Annahme.** Erfasst die Praxis eine Leistung, deren Katalogposition ein Heilmittel der Behandlungsgrundlage des Termins nennt, erhöht sich `treatment_base_items.used_quantity` dieser Position um die erfasste Menge; das Zurücknehmen senkt sie um denselben Betrag. Welche Position betroffen war, hält die Leistung selbst fest — nicht die Grundlage des Termins, die sich durch eine Übertragung ändern kann (CAL-022). Die Constraint `used_quantity <= prescribed_quantity` bleibt und weist eine Erfassung ab, die darüber hinausginge; die Oberfläche nennt den Grund.

**Begründung.** ANN-064 hat die Fortschreibung ausdrücklich auf ABR-002 vertagt, ANN-038 und ANN-012 ebenso; ohne sie bliebe die Zahl für immer stehen, und „noch planbar" wäre eine Erfindung. Die Wirkung an der Leistung festzuhalten statt sie aus der Grundlage zurückzurechnen ist der einzige Weg, der auch nach einer Terminübertragung genau das zurücknimmt, was gesetzt wurde. Die Constraint bleibt, weil ADR-020 Punkt 5 sie ausdrücklich der Abrechnung zuordnet und nicht der Planung — über das Kontingent hinaus **planen** bleibt erlaubt, darüber hinaus **abrechnen** nicht.

**Anker.** Spalte `billable_services.treatment_base_item_id` sowie die beiden `update public.treatment_base_items`-Blöcke in `record_billable_services` und `delete_billable_services` in `supabase/migrations/20260919110000_billable_services.sql`.

**Änderungspfad.** Fortschreibung zurücknehmen: die beiden Blöcke streichen, die Spalte bleibt als Nachweis · Aufwand `klein`. Über das Kontingent hinaus abrechnen zulassen: die Constraint `treatment_base_items_used_within_prescribed` · Aufwand `klein` — widerspräche ADR-020 Punkt 5.

### ANN-074 — Die Praxis-Stammdaten sind Pflichtangaben, der Umsatzsteuerstatus wird nicht geraten

Recht · offen · 2026-09-19 · — · — · Wiedervorlage: mit der Antwort aus G13 (Steuerberatung), spätestens vor dem ersten echten Rechnungslauf

**Annahme.** Eine Praxis hat genau einen Rechnungsabsender, und ohne Name, Anschrift, Steuernummer und IBAN entsteht keine Zeile — diese vier sind Pflichtspalten. Der umsatzsteuerliche Status (`small_business`, Kleinunternehmerregelung nach § 19 UStG) hat **keinen Vorgabewert**; die Praxis muss ihn setzen, bevor sie eine Rechnung ausstellt. Der Preis einer Katalogposition ist der **Endpreis**: Eine enthaltene Umsatzsteuer wird je Steuersatz herausgerechnet und getrennt ausgewiesen, unter der Kleinunternehmerregelung entfällt der Ausweis und die Rechnung trägt den Hinweis. Das Zahlungsziel steht bei den Stammdaten (Vorgabe 14 Tage) und bestimmt das Fälligkeitsdatum.

**Begründung.** ADR-009 Punkt 10 verlangt beim Ausstellen einen Snapshot über „alle rechnungsrelevanten Stammdaten"; ohne Absender gibt es nichts zu snapshotten, und eine halb gefüllte Zeile verschöbe die Prüfung in den Schreibpfad. Der Status ist der eine Wert, den die Software nicht schätzen darf: Er steht auf jeder Rechnung, und beide Möglichkeiten kommen in einer Physiotherapiepraxis vor — Heilbehandlungen sind nach § 4 Nr. 14 UStG ohnehin befreit, Prävention und Training nicht. G13 beantwortet ihn mit der Steuerberatung. Der Endpreis ist der Betrag, den die Praxis nennt; aus ihm die enthaltene Steuer zu rechnen ist für beide Status richtig, während ein Nettopreis unter der Kleinunternehmerregelung eine Zahl wäre, die auf keiner Rechnung steht. Unsicher: ob die Regelbesteuerung eine Netto-Spalte je Zeile braucht — heute steht sie nur je Steuergruppe.

**Anker.** Tabelle `practice_billing_profiles` und `public.save_practice_billing_profile` in `supabase/migrations/20260919130000_practice_billing_profile.sql`; die Steuergruppen in `app.build_invoice_document` in `supabase/migrations/20260919150000_invoices.sql`; die Auswahl ohne Vorbelegung in `src/features/billing/PracticeProfilePage.tsx`.

**Änderungspfad.** Netto je Zeile ausweisen: die Zeilen in `app.build_invoice_document` um Netto und Steuer ergänzen, der Snapshot trägt sie ab dann · Aufwand `klein` — ältere Rechnungen behalten ihre Form, das ist ihr Zweck. Preis als Nettobetrag führen: `unit_price_cents` bekäme eine zweite Bedeutung, also besser eine neue Katalogversion mit anderer Auslegung · Aufwand `groß`.

### ANN-075 — Die Rechnungsnummer ist lückenlos je Kreis und Kalenderjahr und entsteht beim Ausstellen

Recht · offen · 2026-09-19 · — · — · Wiedervorlage: mit der Antwort aus G13 (Format und Nummernkreis)

**Annahme.** Eine Rechnungsnummer hat die Form `Kürzel-Jahr-vierstellig`, etwa `RG-2026-0001`. Das Kürzel wählt die Praxis in den Stammdaten — seit **ABR-010 eines je Leistungsbereich** (`RG` Behandlung, `TR` Training), und beide müssen sich unterscheiden. Das Jahr ist das Kalenderjahr der Ausstellung in der Zeitzone der Praxis, die laufende Zahl beginnt in jedem Jahr wieder bei 1 und wird **lückenlos je Kreis** vergeben; einmalig bleibt jede Nummer über alle Kreise (§ 14 Abs. 4 Nr. 4 UStG erlaubt mehrere Zahlenreihen, doppelte Nummern nicht). Vergeben wird sie erst beim Ausstellen, aus einer eigenen Zeile je Organisation, Jahr und Bereich; unter gleichzeitigen Zugriffen bekommt genau eine Ausstellung die nächste Nummer. Ein Entwurf trägt keine Nummer und lässt sich folgenlos verwerfen.

**Begründung.** ADR-009 Punkt 8 verlangt Vergabe erst bei Ausstellung, Eindeutigkeit und Nichtwiederverwendung; „wie wird ein Nummernkreis geführt — pro Organisation, pro Jahr, fortlaufend?" steht dort als offene Folgefrage. Das Kalenderjahr ist die Antwort, die zur steuerlichen Aufbewahrung passt, die ebenfalls am Jahresende ansetzt. Eine Datenbanksequenz wäre der naheliegende Weg und der falsche: Sie ist transaktionsfrei und ließe bei jedem fehlgeschlagenen Ausstellungsvorgang eine Lücke — und eine Lücke ist bei Rechnungsnummern genau das, was eine Betriebsprüfung erklärt haben will. Die Zeile mit `for update` kostet dafür Nebenläufigkeit, die eine Praxis dieser Größe nicht braucht. Unsicher: ob die Steuerberatung ein anderes Format erwartet; es steckt an einer Stelle.

**Anker.** Tabelle `invoice_number_series` und `app.next_invoice_number` in `supabase/migrations/20260919150000_invoices.sql`; der dritte Schlüsselteil, `app.invoice_number_prefix` und das zweite Kürzel in `supabase/migrations/20260921150000_invoice_number_series_per_area.sql` (ABR-010).

**Änderungspfad.** Anderes Format: die `return`-Zeile in `app.next_invoice_number` · Aufwand `klein`. Durchlaufende Nummer über Jahresgrenzen: dieselbe Funktion ohne Jahresanteil, die Tabelle trägt das Jahr weiter · Aufwand `klein`. Andere Kürzel: die Praxis-Stammdaten, ohne Punkt 17 zu berühren · Aufwand `klein`. Bereits vergebene Nummern sind davon nie betroffen — sie stehen im Snapshot.

### ANN-076 — Der Rechnungsempfänger ist eine eigene Zeile, die Vorgabe ist die Patientin selbst

Praxisprozess · offen · 2026-09-19 · — · — · Wiedervorlage: Probewoche 1 — ob Beihilfe und Versicherung je geteilt abgerechnet werden müssen

**Annahme.** Ein Rechnungsempfänger ist eine eigene Zeile je Patientin mit einer von fünf Arten: Sorgeberechtigte, Betreuung, Beihilfestelle, private Krankenversicherung, sonstiger Kostenträger. **Die Patientin selbst bekommt keine Zeile**: Ist keine hinterlegte Empfängerin als Vorgabe markiert, geht die Rechnung an sie. Je Patientin sind beliebig viele Empfänger möglich, höchstens einer trägt die Vorgabe; eine Rechnung hat genau einen Empfänger. Pflegen und Rechnungen ausstellen dürfen `owner` und `office`.

**Begründung.** ADR-009 Punkt 2 verlangt die Trennung und nennt die Fälle; die offene Folgefrage „benötigt das eigene Empfängertypen?" ist damit beantwortet — die Art entscheidet über Anrede und Aktenzeichen, nicht über Berechtigungen (der Empfänger ist kein Zugang zur Akte, B5 bleibt unberührt). Eine Zeile „die Patientin selbst" wäre eine Kopie ihrer Anschrift und damit ein zweiter Wert für denselben Sachverhalt, der still veraltet — genau das schließt §13 aus. Die Aufteilung einer Rechnung auf Beihilfe und Versicherung nach Quote ist bewusst nicht gebaut und nicht vorbereitet (ADR-014): Sie käme als eigene Aufgabe mit eigener Summenlogik. Unsicher: ob die Praxis sie braucht; bei privat abrechnenden Praxen reicht regelmäßig eine Rechnung, die der Patient selbst einreicht.

**Anker.** Tabelle `invoice_recipients`, `app.can_read_invoicing()` und `app.can_manage_invoicing()` in `supabase/migrations/20260919140000_invoice_recipients.sql`; die Anzeigeweiche `canManageInvoicing` in `src/features/session/types.ts`.

**Änderungspfad.** Weitere Art: der `check` an `recipient_kind` und die Beschriftungen in `src/features/billing/api.ts` · Aufwand `klein`. Rechnung auf zwei Empfänger aufteilen: eigene Quotenzeilen an der Rechnung, zwei Dokumente je Ausstellung · Aufwand `groß`.

### ANN-077 — Eine Rechnung fasst Person, Kalendermonat und Leistungsbereich zusammen und kennt zwei Zustände

Praxisprozess · offen · 2026-09-19 · — · — · Wiedervorlage: Probewoche 1 — ob der Monat die richtige Klammer ist

**Annahme.** Ein Rechnungsentwurf nimmt **alle** noch nicht abgerechneten Leistungen einer Patientin aus einem Kalendermonat **und einem Leistungsbereich** auf; einzelne Zeilen lassen sich nicht abwählen. Je Patientin, Monat und Bereich gibt es höchstens einen Entwurf; eine nachgereichte Leistung ergibt nach dem Ausstellen eine zweite Rechnung für denselben Monat. Seit **ABR-009** ist der Bereich der dritte Schlüssel: Eine Person mit beiden Verhältnissen bekommt in einem Monat zwei Rechnungen, und eine gemischte Rechnung ist schemaseitig unmöglich (ADR-009 Punkt 16). Gebaut sind zwei Zustände, `Entwurf` und `ausgestellt`; die übrigen fünf aus ADR-009 Punkt 7 hängen an Versand, Zahlungen und Storno und entstehen mit ABR-EPIC-002b und -003. Der Snapshot ist ein Dokument mit eigener `schema_version` und enthält keine klinischen Inhalte — der Verordnungsbezug steht als Bauart, Ausstellungsdatum und Verordner:in da, ohne Diagnose.

**Begründung.** Die Roadmap nennt die Sammelrechnung je Person und Monat mit Behandlungsnachweis (`IDEA-PRX-013`); die Auswahl einzelner Zeilen wäre die Gelegenheit, eine Leistung zu übersehen, und ADR-009 Punkt 4 verlangt das Gegenteil. Einen Zustand zu führen, den kein Schreibpfad setzen kann, wäre der Vorgriff aus ADR-014 — die fünf fehlenden kommen mit ihrer Funktion. Der Snapshot als `jsonb` mit eigener Version beantwortet die offene Folgefrage des ADR („wie wird er gegen spätere Schemaänderungen robust gehalten?"): Er ist von der Tabellenform unabhängig. Die Diagnose bleibt draußen, weil die Rechnung regelmäßig an Dritte geht (ADR-004 Fassung 2, Datensparsamkeit). Unsicher: ob eine Beihilfestelle die Diagnose verlangt — dann ist das eine eigene, begründete Entscheidung und keine stille Erweiterung des Dokuments.

**Anker.** `public.create_invoice_draft`, der Teilindex `invoices_draft_period_key`, der `check` an `invoices.status` und `app.build_invoice_document` in `supabase/migrations/20260919150000_invoices.sql`; der dritte Schlüssel und die beiden zusammengesetzten Fremdschlüssel an `invoice_items` in `supabase/migrations/20260921140000_invoice_service_area.sql` (ABR-009).

**Änderungspfad.** Andere Klammer als der Monat (je Verordnung, je Termin): `create_invoice_draft` und der Teilindex · Aufwand `mittel`. Einzelne Zeilen abwählen: eine Auswahl an `create_invoice_draft`, dazu eine sichtbare Anzeige des Rests · Aufwand `mittel` — widerspräche der Begründung oben. Diagnose in den Snapshot: der Block `treatment_bases` in `app.build_invoice_document` · Aufwand `klein`, aber eine Datenschutzentscheidung.

### ANN-078 — Zahlungen sind Transaktionen mit Richtung, der Zahlungsstand wird gerechnet

Praxisprozess · offen · 2026-09-19 · — · — · Wiedervorlage: Probewoche 1 — ob Überweisung als einziger Weg trägt

**Annahme.** Eine Zahlung ist eine eigene Zeile an einer **ausgestellten** Rechnung: Richtung (Eingang oder Rückzahlung), Betrag in ganzen Cent und immer positiv, Tag, Weg (Überweisung oder „anderer Weg" — **kein Bargeld**, Jannes am 2026-09-19) und eine freiwillige Notiz. Der Zahlungsstand der Rechnung (offen, teilweise bezahlt, bezahlt, überzahlt) und die Überfälligkeit werden aus diesen Zeilen **gerechnet** und nirgends gespeichert. Überzahlung ist erlaubt; zurückgezahlt werden kann höchstens, was eingegangen ist. Eine gebuchte Zahlung lässt sich **nur stornieren, mit Grund** — nicht ändern und nicht löschen; die stornierte Zeile bleibt sichtbar und fällt aus jeder Summe.

**Begründung.** ADR-009 Punkt 12 verlangt eigene Transaktionen mit Teilzahlung und Rückzahlung, und die Konsequenz dazu sagt ausdrücklich: „Der Zahlungsstatus ist damit abgeleitet, nicht gesetzt" — eine gepflegte Spalte könnte von den Transaktionen abweichen, eine gerechnete Summe nicht. Deshalb bleibt `invoices.status` bei zwei Werten (ANN-077); „teilweise bezahlt" und „bezahlt" aus Punkt 7 entstehen als abgeleitete Werte. Die Richtung statt eines negativen Betrags hält die Spalte eindeutig. Das Storno statt des Löschens folgt demselben Gedanken wie die unveränderliche Rechnung (Punkt 9): Ein Zahlungsvorgang muss auch Jahre später erklärbar sein. Bargeld ist ausgeschlossen, weil es die Kassenbuchpflicht auslöst und Kassenbuch, TSE und Kartenzahlung laut Roadmap ausdrücklich nicht Teil von Etappe 1 sind. Unsicher: ob eine Praxis ohne Bargeld auskommt — die Probewoche sagt es.

**Anker.** Tabelle `payments` mit dem `check` an `method`, `app.invoice_payment_state`, `app.invoice_paid_cents` und `app.payments_frozen` in `supabase/migrations/20260919160000_payments.sql`.

**Änderungspfad.** Weiterer Zahlungsweg: der `check` an `payments.method` und die Beschriftungen in `src/features/billing/api.ts` · Aufwand `klein`. Bargeld annehmen: derselbe `check`, aber dann mit Kassenbuch, TSE und einer Frage an die Steuerberatung (B4) · Aufwand `groß`. Mahnstufen: eine eigene Aufgabe, ADR-009 nennt das Mahnwesen ausdrücklich als nicht entschieden.

### ANN-079 — Storno ist ein eigenes Dokument; „storniert" wird abgeleitet, nicht gesetzt

Praxisprozess · offen · 2026-09-19 · — · — · Wiedervorlage: Probewoche 1 — ob die Praxis die Korrekturrechnung so findet

**Annahme.** Eine ausgestellte Rechnung wird nie geändert. Storniert wird sie durch ein **eigenes Dokument** mit Pflichtgrund, das eine eigene Nummer aus **dem Kreis der Rechnung trägt, die es betrifft** (seit ABR-010 je Leistungsbereich, ADR-009 Punkt 17) und an denselben Empfänger geht. „Storniert" ist deshalb kein dritter Wert in `invoices.status`, sondern die Existenz dieser Zeile. Das Storno gibt die Leistungen wieder frei, ohne eine Rechnungszeile zu löschen (`released_at`), und die Korrekturrechnung merkt sich in `replaces_invoice_id`, welche Rechnung sie ersetzt. Eine Rechnung mit **stehender Zahlung** lässt sich nicht stornieren — erst die Zahlung stornieren, dann die Rechnung.

**Begründung.** ADR-009 Punkt 9 verlangt Korrektur durch „nachvollziehbare Korrektur-/Stornodokumente und gegebenenfalls eine neue Rechnung"; Punkt 8 verlangt eindeutige, nie wiederverwendete Nummern. Ein Storno geht an den Empfänger und ist damit selbst ein ausgehendes Dokument — eine zweite Zählung daneben hätte eigene Lücken. Der abgeleitete Zustand folgt ANN-078: Was gerechnet wird, kann nicht abweichen. Die Freigabe statt des Löschens hält die Frage „welche Leistung stand auf welcher Rechnung" beantwortbar, ohne die Invariante gegen Doppelabrechnung (Punkt 4) aufzugeben. Die Kette über `replaces_invoice_id` beantwortet die offene Folgefrage des ADR zur mehrfachen Korrektur: Jede Korrektur zeigt auf genau ihre Vorgängerin. Unsicher: ob die Praxis die eigene Nummer für das Storno erwartet — die Steuerberatung (B4) kann es bestätigen.

**Anker.** Tabelle `invoice_cancellations`, `public.cancel_invoice`, `public.create_correction_draft` und `app.invoice_items_frozen` in `supabase/migrations/20260919170000_invoice_cancellations.sql`.

**Änderungspfad.** Eigener Nummernkreis fürs Storno: `cancel_invoice` und eine weitere Zeile im Nummernkreis · Aufwand `mittel`. Teilstorno einzelner Zeilen: widerspricht ANN-077 und wäre eine eigene Aufgabe · Aufwand `groß`. Storno trotz Zahlung: die Prüfung in `cancel_invoice`, dann aber mit einem Weg für den Geldeingang · Aufwand `mittel`.

### ANN-080 — Zahlungserinnerung ohne Stufen, mit festgeschriebenem Betrag

Praxisprozess · offen · 2026-09-19 · — · — · Wiedervorlage: Probewoche 1 — ob vierzehn Tage Frist taugen

**Annahme.** Aus einer **überfälligen** Rechnung entsteht eine Zahlungserinnerung als Dokument: Tag, offener Betrag und eine neue Frist von **vierzehn Tagen**. Keine Stufen, keine Gebühren, keine Verzugszinsen, keine Automatik und **keine eigene Nummer** — sie verweist auf die Rechnungsnummer. Der offene Betrag wird im Dokument **festgeschrieben**; eine spätere Zahlung ändert das Blatt nicht mehr. Mehrere Erinnerungen sind erlaubt und gleichrangig, höchstens eine je Rechnung und Tag; an einer bezahlten oder stornierten Rechnung gibt es keine.

**Begründung.** `IDEA-PRX-012` ist am 2026-09-06 genau so bestätigt worden, und ADR-009 führt das Mahnwesen ausdrücklich als nicht entschieden — Stufen und Gebühren sind eine Rechtsfolge mit eigenen Voraussetzungen und kommen mit ABR-005 nach Praxiserfahrung. Vierzehn Tage sind die im Schriftverkehr übliche Nachfrist und entsprechen dem Zahlungsziel der Rechnung; sie sind eine Angabe auf dem Blatt, keine Rechtsfolge. Der festgeschriebene Betrag folgt der Logik des Rechnungs-Snapshots (ADR-009 Punkt 10): Ein Beleg, dessen Zahl sich nachträglich ändert, ist keiner — der heutige Stand wird weiter an der Rechnung gerechnet (ANN-078). Unsicher: ob vierzehn Tage in der Praxis passen und ob die Erinnerung ohne Stufen reicht.

**Anker.** Tabelle `invoice_payment_reminders` und die Konstante `c_frist_tage` in `public.create_payment_reminder` in `supabase/migrations/20260919180000_payment_reminders.sql`.

**Änderungspfad.** Andere Frist: die Konstante `c_frist_tage` · Aufwand `klein`. Mahnstufen und Gebühren: eine eigene Aufgabe mit eigener Rechtsprüfung (ABR-005) · Aufwand `groß`. Erinnerung vor Fälligkeit: die Prüfung in `create_payment_reminder` · Aufwand `klein`.

### ANN-081 — Abgerechnet ist die Leistung, nicht der Termin

Technik · offen · 2026-09-20 · — · — · Wiedervorlage: mit der Folgestory zu ADR-018 Punkt 2

**Annahme.** Der Terminzustand `invoiced` aus ADR-018 bleibt vorerst **unbesetzt**: `issue_invoice` hebt `billable_services.status` auf `invoiced` und lässt den Termin, wo er ist. Wer wissen will, ob ein Termin abgerechnet ist, fragt die Leistung. Jede Stelle, die „abgerechnet" als Grenze braucht — heute der Transfer-Guard aus ANN-068 —, prüft deshalb `billable_services.status`.

**Begründung.** ADR-018 Punkt 2 sieht den Übergang vor, die Abrechnung aus ABR-003 setzt ihn nicht um; die Abweichung besteht seit PR #53 und ist in R3 als Befund R3-001 belegt worden. Der Übergang nachzuziehen ist Feature-Arbeit mit einer Datenmodell-Entscheidung — der Weg zurück aus `invoiced` beim Rechnungsstorno braucht den gemerkten Vorzustand (`documented`, `no_show` oder `cancelled`), also eine neue Spalte oder eine Ableitung. Bis dahin wäre die **stillschweigend wirkungslose** Grenze der größere Schaden: Sie sah aus, als schütze sie, und tat es nicht. Unsicher bleibt nur der Zeitpunkt der Vollumsetzung, nicht ihre Richtung.

**Anker.** Die Bedingung `not exists (… billable_services … status = 'invoiced')` in `public.transfer_appointments_to_treatment_basis` in `supabase/migrations/20260920106000_transfer_guard_billable_services.sql`.

**Änderungspfad.** ADR-018 Punkt 2 vollständig umsetzen: Statuswechsel in `issue_invoice` und Rückweg in `cancel_invoice` samt gemerktem Vorzustand und Auditereignis `appointment.invoiced`; die Bedingung hier fällt dann ersatzlos weg · Aufwand `mittel`.

### ANN-082 — Der Befreiungsgrund ist ein fester Text je Steuerkennzeichen

Recht · offen · 2026-09-20 · — · — · Wiedervorlage: mit der Antwort aus B4 (Steuerberatung, G13), spätestens vor dem ersten echten Rechnungslauf

**Annahme.** Der Grund der Steuerbefreiung entsteht als **fester Text je Steuerkennzeichen** und nicht als Feld an der Katalogposition: `exempt_healthcare` trägt „Steuerfreie Heilbehandlung nach § 4 Nr. 14 Buchstabe a UStG", `not_taxable` trägt „Nicht steuerbar, kein Leistungsaustausch (§ 1 Abs. 1 Nr. 1 UStG)", `taxable` trägt keinen. Er steht an der **Steuergruppe** des Dokuments, nicht an der Zeile, und damit im Snapshot (`schema_version` 2). Ohne ihn lässt sich eine Rechnung mit steuerfreiem Posten nicht ausstellen.

**Begründung.** § 14 Abs. 4 Nr. 8 UStG verlangt den Hinweis als Pflichtangabe; ADR-009 Fassung 2 Punkt 18 legt ihn in den Snapshot und führt die Frage „fester Text oder Feld an der Position" ausdrücklich als offene Folgefrage. Ein Feld erlaubte verschiedene Befreiungstatbestände — diese Praxis führt genau einen, und ein Freitext an der Position wäre eine zweite Wahrheit neben `tax_treatment` (ARBEITSBEREICHE.md). Der nicht steuerbare Posten braucht die Angabe rechtlich nicht, bekommt sie aber aus demselben Grund: Ein Betrag ohne Steuer und ohne Erklärung sieht auf dem Papier wie ein Fehler aus. Unsicher bleibt allein der **Wortlaut** — ob die Steuerberatung „§ 4 Nr. 14 Buchstabe a" oder „§ 4 Nr. 14a" schreibt und ob sie beim Ausfallhonorar eine andere Formulierung will (B4).

**Anker.** `app.tax_exemption_reason` in `supabase/migrations/20260920120000_invoice_tax_exemption_reason.sql`; die Pflichtprüfung dazu in `app.assert_invoice_tax_lawful` in `supabase/migrations/20260920121000_invoice_tax_lock.sql`.

**Änderungspfad.** Anderer Wortlaut: die Funktion, eine Zeile je Kennzeichen · Aufwand `klein` — ausgestellte Rechnungen behalten ihren Satz, das ist der Zweck des Snapshots. Grund je Katalogposition (mehrere Befreiungstatbestände): neue Spalte an `service_catalog_items`, neue Katalogversion, die Funktion fällt weg · Aufwand `mittel`.

### ANN-083 — Die Instrumentenbibliothek liegt als Dateien im Release, nicht in der Datenbank

Technik · offen · 2026-09-21 · — · — · Wiedervorlage: mit P6 (Ergebnisse erheben und speichern)

**Annahme.** Definitionen von Untersuchungsbausteinen und Scores liegen als JSON-Dateien unter `src/features/assessments/definitionen/` und werden zur Bauzeit eingesammelt. Sie tragen **kein** `organization_id`, stehen in keiner Tabelle und sind für alle Mandanten gleich. Ergebnisse gehen den umgekehrten Weg: Sie sind Gesundheitsdaten und kommen mit Datenklasse, Frist und RLS in die Datenbank.

**Begründung.** Der Arbeitsauftrag §0 verlangt „als Daten abgelegt, nicht als Code und nicht als PDF", §1 „ein neuer Score ist eine neue Datei". ADR-014 führt als offene Folgefrage ausdrücklich, wie „Daten ohne Organisationsbezug, etwa Instrumenten- und Leistungskatalog" zu behandeln sind; für die Bibliothek beantwortet das diese Annahme. Der Unterschied zum Leistungskatalog (`service_catalog_items`, in der Datenbank) ist sachlich: Preise gehören der Praxis und ändern sich je Mandant, ein validierter Fragebogen gehört niemandem und ändert sich nur mit seiner Fassung. Nur so ist `definition_version` etwas Festes — läge die Bibliothek je Mandant in der Datenbank, hieße „1.2.0" in zwei Praxen womöglich Verschiedenes.

**Anker.** `ladeDefinitionen()` in `src/features/assessments/definitionen.ts`; das Einsammeln in `src/features/assessments/bibliothek.ts`.

**Änderungspfad.** Bibliothek je Mandant (eigene Instrumente einer Praxis): Tabelle mit `organization_id`, RLS, Löschpfad; der Ladepfad bekommt eine zweite Quelle, das Schema bleibt · Aufwand `mittel`. Zurück in den Code: nicht vorgesehen — das wäre das Leitprinzip selbst.

### ANN-084 — Definitionen tragen eine semantische Version

Technik · offen · 2026-09-21 · — · — · Wiedervorlage: mit P6, sobald das erste Ergebnis eine `definition_version` speichert

**Annahme.** `version` ist eine semantische Version (`1.0.0`), kein Datum und kein Zähler. Eine Korrektur am Wortlaut hebt die Patch-Stelle, ein geändertes oder entferntes Item die Minor-, ein anderer Zuschnitt der Subskalen die Major-Stelle.

**Begründung.** Der Arbeitsauftrag §1 verlangt eine Version je Definition und die Mitschrift der verwendeten Fassung an jedem Ergebnis, sagt aber nicht, welcher Form. Ein Datum sagt nur, *wann* geändert wurde; die Frage im Verlauf ist aber, **ob** zwei Werte vergleichbar sind — und das hängt daran, ob ein Item verschwunden ist oder ein Tippfehler verschwand. D2 bis D6 im Plan zeigen, dass beides kommt.

**Anker.** `versionSchema` in `src/features/assessments/schema.ts`.

**Änderungspfad.** Datum oder Zähler: ein regulärer Ausdruck, ein Testfall, die vorhandenen Dateien · Aufwand `klein`, solange kein Ergebnis gespeichert ist; danach `mittel`, weil gespeicherte Fassungen mitwandern.

### ANN-085 — Ein Instrument ohne Wertung trägt die Richtung `nicht_anwendbar`

Technik · offen · 2026-09-21 · — · — · Wiedervorlage: mit P5, wenn Anamnesebogen und Tegner-Skala entstehen

**Annahme.** `richtung` bleibt Pflichtfeld, bekommt neben `hoch_ist_besser` und `hoch_ist_schlechter` aber den dritten Wert `nicht_anwendbar`. Er gilt für Instrumente ohne Score (Anamnesebogen: „kein Summenscore") und für Skalen, deren Quelle bewusst keine Wertung ausspricht (Tegner: „hoch = aktiver").

**Begründung.** Der Arbeitsauftrag §3 nennt zwei Werte. Die Quellen brauchen einen dritten: Das Inventar führt beim Anamnesebogen „Richtung: n/a (kein Score)" und bei der Tegner-Skala „hoch = aktiver" — nicht besser. Aus „aktiver" ein „besser" zu machen wäre eine eigene Bewertung und damit genau das, was ADR-006 Punkt 11 verbietet. Ein Pflichtfeld mit einem falschen Wert ist schlechter als ein ehrlicher dritter.

**Anker.** `RICHTUNGEN` in `src/features/assessments/schema.ts`, samt der Prüfung, dass ein Instrument ohne Gesamtwert und ohne Subskala keine Richtung behaupten darf.

**Änderungspfad.** Zurück auf zwei Werte: die Aufzählung, die Prüfung und je ein Feld in den betroffenen Definitionen · Aufwand `klein` — aber nur zusammen mit einer Antwort darauf, was der Anamnesebogen dann tragen soll.

### ANN-086 — Der Lizenzstatus hängt am Instrument, und `aktiv` hängt an ihm

Recht · offen · 2026-09-21 · Jannes (Erklärung vom 2026-09-21) · — · Wiedervorlage: mit dem schriftlichen Beleg des Lizenzgebers (B8), spätestens vor M3

**Annahme.** Jede Score-Definition trägt `lizenzstatus` mit Status, Begründung und Stand; ein Instrument mit dem Status `lizenz_erforderlich` oder `ungeklaert` kann nicht `aktiv` sein — das Schema weist es zurück. Für die 18 vorliegenden Instrumente gilt der Status `freigegeben` auf Grundlage der Erklärung von Jannes vom 2026-09-21, es gebe keine Lizenzierung und alle Inhalte dürften integriert werden.

**Begründung.** Die Roadmap-Zeile FRB-001 verlangt die Bibliothek „versioniert, mit Lizenzfeld", `IDEA-OUT-001` begründet es: Viele etablierte Fragebögen sind urheberrechtlich geschützt, und was für diese 18 gilt, gilt nicht für das neunzehnte. B8 führt den **schriftlichen Beleg des Lizenzgebers** weiter als offen; die Erklärung von Jannes trägt das Bauen, nicht die Freigabe. Die Kopplung an `aktiv` steht im Schema und nicht in der Oberfläche, weil ein ausgeblendetes Element keine Zugriffskontrolle ist (`CLAUDE.md`, Harte Regeln).

**Anker.** `lizenzstatusSchema` und die Prüfung `aktiv → freigegeben` in `src/features/assessments/schema.ts`.

**Änderungspfad.** Fällt die Auskunft des Lizenzgebers anders aus: Status je betroffener Datei auf `lizenz_erforderlich`, `aktiv` auf `false` · Aufwand `klein` — eine Zeile je Instrument, und das Instrument verschwindet aus der Auswahl, ohne dass Ergebnisse verlorengehen.

### ANN-087 — `skip_logic` entsteht erst mit dem Instrument, das sie braucht

Technik · offen · 2026-09-21 · — · — · Wiedervorlage: mit P5, wenn alle 18 Instrumente übertragen sind

**Annahme.** Das Item-Schema der Scores führt **kein** Feld `skip_logic`, obwohl die Skizze im Arbeitsauftrag §3 es nennt. Braucht ein Instrument eine Sprungregel, entsteht das Feld mit ihm — zusammen mit dem Fall, an dem sich prüfen lässt, was es bedeutet.

**Begründung.** Keines der 18 Instrumente braucht es: Was das Inventar an Auslassungen kennt, betrifft ganze Subskalen (KOOS: „Nicht-Sportler: Sport-Subskala auslassen") oder einzelne Antworten („nicht zutreffend" beim FAAM) und steht dort in der Missing-Value-Regel. `CLAUDE.md` verbietet prophylaktische Zukunftsfeatures, ADR-014 führt dieselbe Grenze als Negativliste. Ein Feld ohne Fall wird falsch benutzt, bevor jemand festgelegt hat, was es heißen soll — und steht dann in Definitionsdateien, die niemand mehr anfasst. Der Widerspruch zur Skizze des Auftrags ist nach Rang aufgelöst (`CLAUDE.md`: Rang 1 und 2 vor Rang 3).

**Anker.** Der Kommentar an `scoreItemSchema` in `src/features/assessments/schema.ts`, der die Auslassung samt Grund festhält.

**Änderungspfad.** Ein Instrument mit echter Sprungregel: Feld am Item, Prüfung gegen bekannte Item-Kennungen, ein Testfall · Aufwand `klein`.

### ANN-088 — Eine Teilzahlung verteilt sich anteilig auf die Steuergruppen ihrer Rechnung

Technik · offen · 2026-09-21 · — · — · Wiedervorlage: mit B9, wenn die Steuerberatung die Grundlage der Gewinnermittlung benennt

**Annahme.** Auf der Grundlage **Zufluss** wird eine gebuchte Zahlung auf die Steuergruppen ihrer Rechnung verteilt: anteilig nach deren Bruttoanteil am Rechnungsbetrag, in ganzen Cent, der verbleibende Rest an die größten Bruchteile und bei Gleichstand in fester Reihenfolge. Eine Vollzahlung ergibt damit genau die Gruppen des Dokuments, eine Rückzahlung hebt ihren Eingang centgenau auf, und keine Summe verliert einen Cent.

**Begründung.** ADR-009 Punkt 19 verlangt die Aufschlüsselung je Kennzeichen und Satz auf **beiden** Grundlagen, sagt aber nicht, welchem Posten eine Teilzahlung gilt — die Rechnung nennt keinen, und der Zahlende nennt ihn im Regelfall auch nicht. Die anteilige Verteilung ist die Antwort ohne Bewertung: Sie bevorzugt keine Gruppe und entspricht der Aufteilung, mit der die Istversteuerung nach § 20 UStG rechnet. Die Aufschlüsselung auf dieser Grundlage wegzulassen verstieße gegen Punkt 19; zuerst die steuerpflichtigen Posten als bezahlt zu behandeln wäre eine Tilgungsbestimmung — die trifft der Zahlende (§ 366 BGB) und nicht die Software.

**Anker.** Die Schritte `abgerundet` und `verteilt` in `public.list_revenue_by_service_area` (`supabase/migrations/20260921160000_revenue_by_service_area.sql`).

**Änderungspfad.** Eine andere Zuordnung — Tilgungsbestimmung am Zahlungsbeleg oder eine feste Reihenfolge der Kennzeichen: die beiden Schritte und ein Testfall je Regel · Aufwand `klein`, solange die Auswertung nichts speichert — sie rechnet bei jedem Aufruf aus Dokumenten neu.

### ANN-089 — `MDR_REVIEW_REQUIRED` wird als Register mit gesperrten Adressen geführt

Technik · offen · 2026-09-21 · — · — · Wiedervorlage: mit B1, wenn die externe regulatorische Prüfung vorliegt

**Annahme.** Die Klassifikation nach ADR-006 Punkt 6 wird an genau einer Codestelle geführt: `src/app/mdr.ts`. Ein Eintrag mit reservierter Adresse ist gesperrt — ein Riegel über der Routentabelle fängt sie ab, bevor eine Route greift; ein Eintrag ohne Adresse ist ein Ausgabeverbot und wirkt im Zuschnitt und im Zweitreview. Einen Schalter gibt es nicht: Geöffnet wird eine Funktion nur, indem ihr Eintrag entfernt wird.

**Begründung.** ADR-006 verlangt in den „Konsequenzen" ausdrücklich mehr als eine Liste — geführt, sichtbar und technisch wirksam —, und Punkt 13 schließt das Feature-Flag als Weg aus; seit 0.13 steht dieselbe Pflicht in `PROJECT_PRINCIPLES.md` §17 an Rang 1. Wo das geschieht, sagt keines der Dokumente; die offene Folgefrage steht seit Fassung 1. Die Reservierung einer Adresse ist der einzige Riegel, der heute schon wirkt, weil die klassifizierten Funktionen noch nicht gebaut sind: Sie sperrt, ohne etwas zu bauen. Für die drei Ausgabeverbote wäre ein Riegel dagegen eine Behauptung — ADR-006 nimmt ihre technische Durchsetzung ausdrücklich aus, weil sich nicht erzwingen lässt, etwas **nicht** zu bauen.

**Anker.** `MDR_REVIEW_REQUIRED`, `REGULATORISCHE_PRUEFUNG` und `mdrSperre` in `src/app/mdr.ts`; der Riegel darüber in `src/routes/AuthenticatedRoutes.tsx`.

**Änderungspfad.** Andere Adresse für eine klassifizierte Funktion: das Feld `pfade` des Eintrags · Aufwand `klein`. Klassifikation aufheben, nachdem die Prüfung vorliegt: Eintrag entfernen, `REGULATORISCHE_PRUEFUNG` mit der Fundstelle belegen, Test nachziehen · Aufwand `klein`, aber nie ohne die dokumentierte Prüfung — das ist die Entscheidung, nicht ihre Umsetzung.

### ANN-090 — Fehlende Einrichtung des Kartendienstes ist eine eigene Fehlerklasse

Technik · offen · 2026-09-21 · — · — · Wiedervorlage: mit OPS-001, wenn die Prüfung der Edge Runtime vorliegt

**Annahme.** Der Vertrag bekommt die Fehlerklasse `not_configured`. Ist kein Anbieter eingerichtet — `LOCATION_PROVIDER` fehlt, ist unbekannt oder der Schlüssel fehlt —, antwortet der Adapter mit dieser Klasse und **nie** mit der Nachbildung; die Oberfläche zeigt dafür einen Einrichtungshinweis und keine Störungsmeldung.

**Begründung.** ADR-019 Punkt 24 legt Abo und Schlüssel zu Jannes und nie ins Repository: „nicht eingerichtet" ist damit der Regelfall dieses Prototyps und kein Ausfall des Anbieters. MAP-003b verlangt den Zustand „nicht konfiguriert" ausdrücklich neben „Anbieter nicht erreichbar" — ohne eigene Klasse wären beide dieselbe Meldung, und die Seite behauptete eine Störung, die es nicht gibt. Eine stillschweigend einspringende Nachbildung wäre die andere Hälfte desselben Fehlers: Eine Luftlinie sieht auf der Karte aus wie eine Route.

**Anker.** `LocationErrorCode` in `src/lib/location/contract.ts`; die Wahl selbst in `supabase/functions/location-provider/auswahl.ts`.

**Änderungspfad.** Eine andere Antwort auf fehlende Einrichtung — etwa die Nachbildung als Standard: Klasse aus dem Vertrag nehmen, `waehleAdapter` umstellen, Zustand der Oberfläche streichen · Aufwand `klein`.
