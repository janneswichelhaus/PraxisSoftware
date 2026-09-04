# Annahmenregister

Zuletzt aktualisiert: 2026-09-04

Dieses Register hält **begründete, vorläufige Annahmen** fest: Entscheidungen,
die für eine Aufgabe nötig waren, aber weder in `PROJECT_PRINCIPLES.md` noch in
einem ADR noch in der Feature-Spezifikation getroffen sind. Der Prozess dahinter
steht in `PROJECT_PRINCIPLES.md` §15.1.

Eine Annahme ist **kein Fehler und keine Entscheidung des Projektinhabers**. Sie
ist die nach Recherche beste verfügbare Antwort, damit die Arbeit weitergeht —
und sie ist ausdrücklich dafür gebaut, später **bestätigt, geändert oder
verworfen** zu werden, insbesondere durch die Datenschutzprüfung vor
Produktivstart (ADR-007).

## Rang und Grenzen

- Das Register steht in der Dokumentenhierarchie **unter** den Prinzipien, den
  ADRs und der jeweiligen Feature-Spezifikation. Eine Annahme füllt eine Lücke;
  sie überschreibt nichts.
- Eine Annahme DARF NICHT einer MUSS- oder DARF-NICHT-Anforderung aus
  `PROJECT_PRINCIPLES.md` oder einem ADR widersprechen, keine Sicherheits- oder
  Datenschutzmaßnahme aufweichen und nichts berühren, was §3.1 bis §3.3 und
  ADR-013 regeln (echte Daten, Produktionscredentials, Secrets, Deployment).
  Was das bräuchte, ist keine Annahme, sondern eine Änderungsanfrage an Jannes.
- Eine **bestätigte** Annahme, die später teuer rückgängig zu machen wäre, wird
  zum ADR (`docs/adr/README.md`, „Wann ein ADR geschrieben wird"). Der Eintrag
  hier bleibt mit Status `in ADR überführt` und Verweis stehen.
- Überbrückt eine Annahme einen Punkt aus `OPEN_DECISIONS.md`, bleibt der Punkt
  dort **offen** und verweist auf die `ANN`-Kennung. Das Register entscheidet
  nichts endgültig.

## Lebenszyklus

| Status                 | Bedeutung                                                                                    |
|------------------------|----------------------------------------------------------------------------------------------|
| `offen`                | getroffen und umgesetzt, noch von niemandem bestätigt                                        |
| `bestätigt`            | von Jannes oder der Datenschutzprüfung bestätigt — mit Datum und Instanz im Eintrag          |
| `geändert`             | die Prüfung hat eine andere Festlegung verlangt; der Eintrag nennt die neue und den Commit    |
| `verworfen`            | die Annahme wurde aufgegeben; der Eintrag nennt, was stattdessen gilt                        |
| `in ADR überführt`     | bestätigt und als ADR festgehalten; Verweis auf die ADR-Nummer                                |

Ein Eintrag wird **nie gelöscht**. Auch eine verworfene Annahme bleibt
nachvollziehbar, damit die Prüfung sieht, was zwischenzeitlich galt.

## Aufbau eines Eintrags

Jeder Eintrag hat eine fortlaufende Kennung `ANN-NNN` und diese Felder:

| Feld              | Inhalt                                                                                                                   |
|-------------------|--------------------------------------------------------------------------------------------------------------------------|
| **Kategorie**     | `Datenschutz`, `Recht`, `Praxisprozess` oder `Technik` — danach filtert die Prüfung                                      |
| **Herkunft**      | Aufgabe, Story oder ADR, bei der die Lücke aufgefallen ist                                                                 |
| **Annahme**       | die Festlegung in ein bis drei Sätzen, so konkret, dass man sie widerlegen kann                                           |
| **Begründung**    | was recherchiert wurde und warum diese Option: Gesetzestext, Behördenleitlinie, ADR, Praxislogik. Unsicheres steht als unsicher da |
| **Verankerung**   | wo die Annahme im Code oder in Dokumenten greift — Datei, Funktion, Migration, Test. Die Stelle trägt die Kennung als Kommentar |
| **Änderungspfad** | was zu tun ist, wenn die Annahme nicht hält, und der geschätzte Aufwand: `klein` (eine Stelle), `mittel` (ein Modul, Migration ohne Datenumzug), `groß` (mehrere Module oder Datenumzug) |
| **Status**        | siehe Lebenszyklus, mit Datum                                                                                             |
| **Wiedervorlage** | wer oder was die Annahme prüft: Datenschutzprüfung, Jannes, ein bestimmtes Epic                                          |

**Reversibel verankern** ist eine Entwurfsregel, keine Kür: Eine Annahme SOLLTE
an genau einer Stelle greifen — eine Policy-Funktion, ein Konfigurationswert,
eine Konstante, eine Migration. Lässt sich das nicht erreichen und wäre der
Änderungsaufwand `groß`, ist das ein Signal, vor der Umsetzung nachzufragen.

### Kennung im Code

Die Stelle, an der eine Annahme greift, trägt ihre Kennung im Kommentar:

```sql
-- ANN-002: Statuswechsel ist Praxisführung, nicht Behandlung.
create or replace function app.can_change_patient_status() ...
```

```ts
// ANN-005: Abschluss ohne Dokumentationspflicht, siehe Annahmenregister.
```

Alle Verankerungen findet:

```bash
git grep -n "ANN-[0-9]\{3\}" -- ':!docs/decisions/ASSUMPTIONS.md'
```

Eine Kennung, die im Code steht, aber hier fehlt — oder umgekehrt eine
Verankerung, die im Register genannt wird, aber im Code keine Kennung trägt —
ist ein Mangel, der im Review des Loops auffallen muss.

## Prüfpaket für die Datenschutzprüfung

Wenn die Datenschutzprüfung ansteht, ist dieses Register die Arbeitsliste:

1. Alle Einträge der Kategorien `Datenschutz` und `Recht` mit Status `offen`
   durchgehen. Die Übersichtstabelle unten filtert sie.
2. Je Eintrag: bestätigen oder eine andere Festlegung verlangen. Der
   **Änderungspfad** sagt vorab, was eine Änderung kostet — die Prüfung muss
   den Code dafür nicht lesen.
3. Ergebnis im Eintrag festhalten: Status, Datum, prüfende Instanz, bei
   Änderungen die neue Festlegung.
4. Geänderte Annahmen werden als eigene Aufgabe umgesetzt; der Eintrag verweist
   danach auf den Commit.

Vor Produktivstart DARF kein Eintrag der Kategorien `Datenschutz` und `Recht`
mehr `offen` sein (`docs/DEVELOPMENT.md`, Go-live-Blocker).

## Übersicht

| Kennung | Thema                                                          | Kategorie     | Status | Wiedervorlage                 |
|---------|----------------------------------------------------------------|---------------|--------|-------------------------------|
| ANN-001 | Interne Initialfristen des Retention Schedule                  | Datenschutz   | offen  | Datenschutzprüfung            |
| ANN-002 | Versorgungsstatus `inactive` und Rollenschnitt des Wechsels    | Praxisprozess | offen  | Jannes                        |
| ANN-003 | Adress-Snapshot beim Hausbesuchstermin                         | Datenschutz   | offen  | Datenschutzprüfung            |
| ANN-004 | Inhalt des Audit-Kontexts bei organisatorischen Einstellungen  | Datenschutz   | offen  | Datenschutzprüfung            |
| ANN-005 | Terminabschluss ohne Dokumentationspflicht                     | Praxisprozess | offen  | ABR-002                       |
| ANN-006 | Umfang und Protokollierung des Behandlungsnachweises in der Akte | Datenschutz | offen  | Datenschutzprüfung; C1 bei ABR-002 |
| ANN-007 | Mechanismus der automatischen Finalisierung: pg_cron          | Technik       | entschieden 2026-09-05 | Providerprüfung nach ADR-002 |
| ANN-008 | Fristbezug der automatischen Finalisierung                     | Praxisprozess | offen  | Jannes; Datenschutzprüfung    |
| ANN-009 | Systemakteur im Auditlog                                       | Datenschutz   | offen  | Datenschutzprüfung            |

Die Einträge ANN-001 bis ANN-005 wurden am 2026-09-03 **rückwirkend** erfasst.
Sie waren in Migrationen, ADRs und Abnahmeschritten bereits begründet,
standen aber an keiner Stelle gesammelt. Weitere Altannahmen werden
nachgetragen, sobald ein Loop sie berührt.

---

## Einträge

### ANN-001 — Interne Initialfristen des Retention Schedule

| | |
|---|---|
| Kategorie | Datenschutz |
| Herkunft | ADR-008 (Retention Schedule), ADR-010 (Auditlog), ADR-011 (Log-Retention) |
| Status | offen, seit 2026-08-28 (rückwirkend erfasst 2026-09-03) |
| Wiedervorlage | Datenschutzprüfung / DSFA-Prozess vor Produktivstart |

**Annahme.** Die Fristen ohne unmittelbare gesetzliche Vorgabe gelten vorläufig
so, wie ADR-008 und ADR-011 sie tabellieren: abgesagte Termine und No-shows ohne
Rechnung 3 Jahre ab Jahresende; organisatorische Patientenkommunikation 3 Jahre;
Terminanfragen ohne Behandlungsverhältnis 12 Monate; Routing-Rohdaten 30 Tage;
nicht angenommene KI-Entwürfe 7 Tage; Patientenakten-Auditlog und
AI-Gateway-Metadaten 3 Jahre; Authentifizierungs-/Securitylogs 12 Monate;
Operational Logs 30 Tage; interner Teamchat rollierend 12 Monate.

**Begründung.** Art. 5 Abs. 1 lit. e DSGVO (Speicherbegrenzung) verlangt für
jeden Zweck eine definierte Frist; ohne Frist fehlt die rechtmäßige
Speicherdauer. Gesetzlich bestimmt sind nur Behandlungsunterlagen (§630f Abs. 3
BGB, zehn Jahre) und steuerlich relevante Belege (§147 AO, §257 HGB), siehe
ADR-008. Die übrigen Fristen hat ADR-008 als interne Initialentscheidung
gesetzt und dort selbst zur Validierung vor Produktivstart vorgemerkt; eine
Herleitung je Frist ist in ADR-008 nicht dokumentiert. Naheliegender Anker für
die Dreijahresfristen ist die regelmäßige Verjährung nach §195 BGB
(Ausfallhonorar, organisatorische Streitfälle), für Auditlogs die
Rechenschaftspflicht nach Art. 5 Abs. 2 DSGVO. Das ist eine Lesart, keine
belegte Begründung.

**Verankerung.** ADR-008, Abschnitt „Initialer Retention Schedule" (trägt die
Kennung). Im Code ausschließlich als `COMMENT ON TABLE` in den Migrationen
(`20260828100000_foundation.sql`, `20260828100200_audit_log.sql`,
`20260828110000_person_data_minimisation.sql`,
`20260830100100_appointments.sql`, `20260830120100_working_hours.sql`). Es gibt
keinen Löschcode und keine zentrale Konfiguration der Fristen
(`docs/DEVELOPMENT.md`, Go-live-Blocker 1).

**Änderungspfad.** Solange keine Löschung implementiert ist: Tabelle in ADR-008
und die Tabellenkommentare anpassen — Aufwand `klein`. Bei der Umsetzung von
ADR-008 MUSS der Retention Schedule an genau einer Stelle stehen
(Konfigurationstabelle oder ein Modul), sodass eine Friständerung eine
Datenänderung bleibt und nicht mehrere Funktionen berührt.

### ANN-002 — Versorgungsstatus `inactive` und Rollenschnitt des Wechsels

| | |
|---|---|
| Kategorie | Praxisprozess |
| Herkunft | PAT-003 |
| Status | offen, seit 2026-08-29 (rückwirkend erfasst 2026-09-03) |
| Wiedervorlage | Jannes; der Behandlungsabschluss zusätzlich im Epic Behandlungsdokumentation |

**Annahme.** `inactive` ist eine rein organisatorische Markierung („nicht in
laufender Versorgung"). Sie ist kein Behandlungsabschluss im Sinne von ADR-008
und startet keine Aufbewahrungsfrist. Den Status dürfen `owner`, `team_lead`
und `office` wechseln, `therapist` nicht.

**Begründung.** Der Wechsel nimmt eine Person aus dem laufenden Betrieb und ist
damit ein Vorgang der Praxisführung und Verwaltung (`PROJECT_PRINCIPLES.md`
§4.1, §4.3, §4.5), kein Behandlungsschritt. Der „Abschluss der Behandlung" ist
in ADR-008 als offene Folgefrage geführt und braucht ein eigenes Feld mit
ADR-Bezug — nicht diese Markierung.

**Verankerung.** `app.can_change_patient_status()` und `set_patient_status` in
`supabase/migrations/20260829110000_patient_status.sql`; Datenbanktest in
`pnpm test:db`; E2E-Test „Autorisierung auf RPC-Ebene"; Abnahmeschritt PAT-003 in
`docs/abnahme/etappe-0-patienten-und-termine.md`.

**Änderungspfad.** Rollenschnitt: eine Migration, die
`app.can_change_patient_status()` ersetzt — Aufwand `klein`.
Behandlungsabschluss: eigenes Feld und eigene Regel, nicht diese Funktion —
Aufwand `mittel`, weil die klinische Retention daran hängt.

### ANN-003 — Adress-Snapshot beim Hausbesuchstermin

| | |
|---|---|
| Kategorie | Datenschutz |
| Herkunft | CAL-001 |
| Status | offen, seit 2026-08-30 (rückwirkend erfasst 2026-09-03) |
| Wiedervorlage | Datenschutzprüfung / DSFA-Prozess vor Produktivstart |

**Annahme.** Für Hausbesuche wird die Patientenadresse bei Terminanlage in den
Termin kopiert (`visit_street`, `visit_house_number`, `visit_postal_code`,
`visit_city`), nicht referenziert. Eine spätere Stammdatenänderung ändert nicht
rückwirkend, wohin an diesem Tag gefahren wurde. Die Adresse liegt damit
doppelt vor und unterliegt im Termin der Frist der Datenklasse
„organisatorische Behandlungsdaten" — auch bei abgesagten Terminen.

**Begründung.** Behandlungsnachweis (§4.4) und spätere Abrechnung (§19,
Snapshot-Prinzip aus ADR-009) brauchen den damaligen Ort. Die Datenminimierung
nach Art. 5 Abs. 1 lit. c DSGVO ist gewahrt, soweit nur die für die Anfahrt
nötigen Felder kopiert werden und der Termin keiner längeren Frist unterliegt
als die Akte. Der wunde Punkt ist der **abgesagte** Hausbesuch: Er behält die
Adresse nach ADR-008 drei Jahre, obwohl keine Anfahrt stattgefunden hat.

**Verankerung.** Spalten `visit_*` und Constraint
`appointments_address_matches_type` in
`supabase/migrations/20260830100100_appointments.sql`; einziger Schreiber ist
`create_appointment`; Abnahmeschritt CAL-001 in
`docs/abnahme/etappe-0-patienten-und-termine.md`.

**Änderungspfad.** Verlangt die Prüfung für abgesagte Termine eine kürzere
Frist oder das Entfernen der Adresse: die `visit_*`-Felder in
`cancel_appointment` auf `null` setzen — Aufwand `klein`. Verlangt sie
generell Referenz statt Kopie: Migration, die die Spalten entfernt und den
Behandlungsnachweis auf die Stammdaten umstellt — Aufwand `mittel`, mit dem
Verlust der historischen Adresse als bewusster Folge.

### ANN-004 — Inhalt des Audit-Kontexts bei organisatorischen Einstellungen

| | |
|---|---|
| Kategorie | Datenschutz |
| Herkunft | CAL-005 und Nachtrag Arbeitszeit-Audit; ADR-010 |
| Status | offen, seit 2026-08-30 (rückwirkend erfasst 2026-09-03) |
| Wiedervorlage | Datenschutzprüfung / DSFA-Prozess vor Produktivstart |

**Annahme.** Bei `organization.appointment_grid_changed` werden alter und
neuer Minutenwert in `audit_log.context` gespeichert. Bei Änderungen an
Arbeitszeiten (`staff_working_hours.*`, `staff_working_hour_exception.*`)
enthält der Kontext Datensatz-Kennungen und bei Abweichungen die Art der
Abweichung (`kind`) — keine Uhrzeiten, keinen Wochentag, kein Datum. Ein Minutenraster gilt als organisatorische Einstellung
ohne Personenbezug; Arbeitszeiten sind Beschäftigtendaten und bleiben deshalb
aus dem Auditlog heraus.

**Begründung.** ADR-010 beschränkt das Auditlog auf Metadaten ohne klinische
Inhalte. Beschäftigtendaten unterliegen `PROJECT_PRINCIPLES.md` §20 und §26
BDSG; ein Auditlog, das Arbeitszeitverläufe je Person nachzeichnet, wäre eine
Auswertung, die §20 nicht deckt. Der Lesepfad `list_audit_events` gibt
`context` grundsätzlich nicht heraus (`docs/DEVELOPMENT.md`, Abschnitt Audit).

**Verankerung.** `set_appointment_grid` in
`supabase/migrations/20260830120000_scheduling_grid.sql`;
`set_staff_working_hours` und `set_staff_working_hour_exception` in
`supabase/migrations/20260830130000_working_hours_audit.sql`;
`list_audit_events` in `supabase/migrations/20260828110100_audit_read_path.sql`
(seit DOK-004 in `20260904120000_treatment_note_auto_finalisation.sql`);
`set_documentation_deadline` ebendort (Alt- und Neuwert der Frist in Tagen,
DOK-004).

**Änderungspfad.** Kontextinhalt je Funktion in einer Migration ändern —
Aufwand `klein`. Bereits geschriebene Zeilen sind über den Anwendungspfad nicht
lesbar; ob sie bereinigt werden müssen, entscheidet die Prüfung.

### ANN-005 — Terminabschluss ohne Dokumentationspflicht

| | |
|---|---|
| Kategorie | Praxisprozess |
| Herkunft | CAL-004 |
| Status | offen, seit 2026-08-30 (rückwirkend erfasst 2026-09-03) |
| Wiedervorlage | ABR-002 (Leistungserfassung am abgeschlossenen Termin); DOK-003 hat die Kopplung geprüft und nicht eingeführt, siehe Nachtrag |

**Annahme.** Ein Termin kann abgeschlossen werden, ohne dass eine
Behandlungsdokumentation existiert. Der Abschluss gibt den Zeitraum nicht frei
und lässt sich wieder öffnen; beide Ereignisse bleiben im Auditlog. Die
Kopplung „Fakturierung erst nach finalisierter Dokumentation" (§19) wird an der
Leistung beziehungsweise Rechnung verankert, nicht am Terminstatus.

**Begründung.** Bei CAL-004 gab es noch keine Dokumentation. §19 bindet die
Fakturierung an die Dokumentation, nicht den Terminstatus; der
Terminstatus-Automat ist in `OPEN_DECISIONS.md` (Abschnitt D, „bestätigt")
offen. DOK-001 und DOK-002 (ADR-016) haben die Kopplung bewusst nicht
eingeführt: Ein Entwurf darf unbegrenzt Entwurf bleiben, und ein Termin mit
Dokumentation lässt sich weiterhin absagen (`docs/DEVELOPMENT.md`, Bekannte
Einschränkungen 9 und 10).

**Verankerung.** `complete_appointment` und `reopen_appointment` in
`supabase/migrations/20260830110000_appointment_completion.sql`;
Abnahmeschritt CAL-004 in
`docs/abnahme/etappe-0-patienten-und-termine.md`.

**Änderungspfad.** Entweder eine Prüfung in `complete_appointment` ergänzen
oder den Abschluss aus der Finalisierung der Dokumentation heraus auslösen —
Aufwand `klein` bis `mittel`, je nach Variante. Die Entscheidung fällt
spätestens, wenn ABR-002 abgeschlossene Termine zu Leistungen macht, und wird
hier nachgetragen.

**Nachtrag 2026-09-04 (DOK-003).** Die Kopplung wird nicht eingeführt. Seit
DOK-003 zeigt die Akte jeden begonnenen Termin mit seinem Dokumentationsstand:
ein abgeschlossener Termin ohne Dokumentation steht dort für Praxisleitung,
Therapeut:innen und Verwaltung als „Abgeschlossen" mit „Keine Dokumentation."
— sichtbar, ohne dass der Terminabschluss blockiert. Sichtbarkeit statt
Sperre ist die leichter umkehrbare Option (§16); ob eine Sperre nötig wird,
zeigt sich, wenn ABR-002 Leistungen an abgeschlossene Termine bindet.

### ANN-006 — Umfang und Protokollierung des Behandlungsnachweises in der Akte

| | |
|---|---|
| Kategorie | Datenschutz |
| Herkunft | DOK-003 (Dokumentation in der Akte, rollenabhängig projiziert); überbrückt Punkt C1 in `OPEN_DECISIONS.md` |
| Status | offen, seit 2026-09-04 |
| Wiedervorlage | Datenschutzprüfung / DSFA-Prozess vor Produktivstart; der Leistungsanteil (C1) spätestens bei ABR-002 |

**Annahme.** Der Behandlungsnachweis nach `PROJECT_PRINCIPLES.md` §4.4 ist in
der Akte eine eigene Serverfunktion (`list_patient_treatment_evidence`) mit
genau diesem Datenumfang je Termin: Datum, Zeitraum, Terminart, behandelnde
Person, Terminstatus, Dokumentationsstand (`none`, `draft`, `final`) und der
Zeitpunkt der Finalisierung. **Nicht enthalten** sind der klinische Inhalt,
Verfasser- und Finalisierernamen, Versionszahlen, Nachträge,
Korrekturbegründungen und — solange es keine Leistungserfassung gibt — die
„erbrachte Leistung". Ein Entwurf wird nur als vorhanden gemeldet, ohne
Zeitpunkt. Lesen dürfen alle vier Praxisrollen; Patientenkonten nicht. Das
Lesen des Nachweises erzeugt **keinen eigenen Auditeintrag**: er enthält
keinen klinischen Inhalt, und das Öffnen der Akte, in der er steht, wird
bereits als `patient_record.viewed` protokolliert.

**Begründung.** §4.4 zählt die Felder des Nachweises auf und verbietet dem
Office ausdrücklich den medizinischen Inhalt; ADR-004 macht den Nachweis zu
einer „eigenen Sicht mit eigenem Datenumfang, kein gefilterter Auszug". Die
Datenminimierung nach Art. 5 Abs. 1 lit. c DSGVO verlangt, dass für den Zweck
— den organisatorischen Streitfall („am 14.08. sei niemand erschienen") —
nur das Nötige geliefert wird: dass ein Termin stattfand, wer eingeplant war
und ob und wann dokumentiert wurde. Der Zeitpunkt der Finalisierung ist dabei
der Zeitpunkt, ab dem der Eintrag Bestandteil der Akte ist (ADR-016 Punkt 4);
ein Entwurf ist kein Nachweis im Sinne von §630f BGB (ADR-016 Punkt 3) und
bekommt deshalb keinen. Versionen und Nachträge unterliegen nach ADR-016
Punkt 8 derselben Projektion wie der Inhalt und bleiben dem Office
verschlossen. „Signatur/Bestätigung der Behandlung" (§4.4) wird durch die
Finalisierung selbst abgebildet, nicht durch die Nennung der finalisierenden
Person — die restriktivere Lesart nach §16. Die „erbrachte Leistung" kann
nicht geliefert werden, weil es sie im System noch nicht gibt; ob
Leistungsziffern organisatorisch oder klinisch sind, bleibt C1. Für die
Protokollierung gilt ADR-010: auditpflichtig sind das Öffnen der Akte und der
Zugriff auf klinische Dokumente; der Nachweis ist kein klinisches Dokument.
**Unsicher** ist, ob die Datenschutzprüfung das Lesen des Dokumentationsstands
selbst als protokollpflichtigen Zugriff einstuft.

**Verankerung.** `app.can_read_treatment_evidence()` und die Spaltenliste von
`list_patient_treatment_evidence` in
`supabase/migrations/20260904110000_patient_record_documentation.sql` (beide
tragen die Kennung); `canReadTreatmentEvidence` in
`src/features/session/types.ts`; Datenbanktest „DOK-003: Behandlungsnachweis
in der Akte" in `pnpm test:db` (prüft unter anderem, dass der Rückgabetyp
keine Inhaltsspalte kennt und kein Auditeintrag entsteht); Abnahmeschritt
DOK-003 in `docs/abnahme/etappe-1-kernprozess.md`.

**Änderungspfad.** Spalte hinzufügen oder entfernen (etwa die finalisierende
Person): eine Migration, die die Funktion ersetzt, plus das Schema in
`src/features/documentation/api.ts` — Aufwand `klein`. Eigenes Auditereignis
für den Nachweis: Ereigniskatalog erweitern und einen Insert in der Funktion
ergänzen — Aufwand `klein`. Leistungen im Nachweis: fällt mit C1 bei ABR-002
und braucht dann eine eigene Spalte aus der Leistungserfassung — Aufwand
`mittel`. Rollenschnitt: `app.can_read_treatment_evidence()` ersetzen —
Aufwand `klein`.

### ANN-007 — Mechanismus der automatischen Finalisierung: pg_cron

| | |
|---|---|
| Kategorie | Technik |
| Herkunft | DOK-004 (ADR-016 Punkt 7); die Roadmap führte die Wahl als offene Architekturentscheidung |
| Status | **Mechanismus entschieden am 2026-09-05 durch Jannes** (Weg 2, `pg_cron`, alle 15 Minuten, bedingt registriert). Die Providerfrage bleibt offen. |
| Wiedervorlage | Providerprüfung nach ADR-002 vor dem Cloudprojekt — sie muss `pg_cron` bestätigen oder den Auslöser ersetzen |

**Annahme.** Die automatische Finalisierung ist eine Datenbankfunktion
(`finalize_overdue_treatment_notes`), die ein Scheduler in der Datenbank
aufruft: die Erweiterung `pg_cron`, alle 15 Minuten, registriert durch die
Migration — aber nur, wenn die Erweiterung auf dem Server verfügbar ist. Die
Funktion ist für keine Anwendungsrolle ausführbar, idempotent und überspringt
Einträge, die gerade bearbeitet werden. Es gibt keinen Fallback „beim
nächsten Zugriff nachziehen" und keine Berechnung zur Laufzeit.

**Begründung.** Von den drei in der Roadmap beschriebenen Wegen
materialisiert nur ein Scheduler den finalisierten Stand zu einem Zeitpunkt,
der nicht vom Zufall eines Aktenaufrufs abhängt — bei einer Frist mit
Wirkung nach §630f BGB die entscheidende Eigenschaft. `pg_cron` ist Teil des
Supabase-Postgres-Images (lokal wie in der Cloud), braucht keinen weiteren
Dienst, keine Zugangsdaten außerhalb der Datenbank und keine Netzverbindung;
damit bleibt es innerhalb des mit ADR-015 gewählten Stacks und führt keinen
neuen Anbieter ein (§3.5). Es ist dennoch eine neue Infrastrukturabhängigkeit
im Sinne von §11 und wird deshalb hier registriert statt beiläufig eingebaut.
Die Wegwerf-Datenbank der Tests hat kein `pg_cron`; die Funktion wird dort
direkt geprüft, die Registrierung selbst nur dort, wo die Erweiterung
existiert. **Unsicher:** ob die Providerprüfung nach ADR-002 `pg_cron`
im Cloudprojekt freigibt und ob 15 Minuten als Verzögerung nach
Fristende akzeptabel sind.

**Entscheidung vom 2026-09-05.** Jannes hat den Mechanismus nach Vorlage der
drei Wege ausdrücklich gewählt: Weg 2, `pg_cron`. Die Wahl selbst ist damit
keine Annahme mehr, sondern eine getroffene Architekturentscheidung
(`docs/development/ROADMAP.md`, Abschnitt DOK-004); der Eintrag bleibt
bestehen, weil die **Verankerung und der Änderungspfad** weiter gebraucht
werden und die Providerfrage nach ADR-002 offen ist. Ausdrücklich mit
entschieden: der Auslöser bleibt von der Fachlogik getrennt, und die
Registrierung bleibt bedingt.

**Verankerung.** Der `do`-Block am Ende von
`supabase/migrations/20260904120000_treatment_note_auto_finalisation.sql` ist
die einzige Stelle, die den Auslöser kennt (trägt die Kennung); die Funktion
`finalize_overdue_treatment_notes` ebendort; Datenbanktest „DOK-004:
Scheduler-Registrierung" in `pnpm test:db`.

**Änderungspfad.** Anderer Auslöser (externer Cron-Dienst, Edge Function,
Betriebsskript): den `do`-Block durch die neue Registrierung ersetzen und
dieselbe Funktion aufrufen — Aufwand `klein`. Anderes Intervall: eine
Migration mit erneutem `cron.schedule` unter demselben Namen — Aufwand
`klein`. Gänzlich anderer Mechanismus (Berechnung beim Lesen): Umbau der
Lesepfade und der Versionierung — Aufwand `groß`, deshalb nicht gewählt.

### ANN-008 — Fristbezug der automatischen Finalisierung

| | |
|---|---|
| Kategorie | Praxisprozess |
| Herkunft | DOK-004 (ADR-016 Punkt 7) |
| Status | offen, seit 2026-09-04 |
| Wiedervorlage | Jannes nach den ersten Wochen Praxisbetrieb (ADR-016 nennt diesen Punkt als den, der am ehesten nachjustiert wird); Datenschutzprüfung für den Zeitpunktbegriff |

**Annahme.** Die Frist ist eine praxisweite Zahl von Kalendertagen
(`documentation_auto_finalize_days`, 0 bis 30, Voreinstellung 1) und endet um
Mitternacht der Praxiszeitzone nach dem N-ten Kalendertag **nach dem
Behandlungstag**. Für einen Eintrag, der erst später angelegt wird — eine
verspätete Erstdokumentation oder ein Nachtrag —, zählt stattdessen der
Anlagetag, wenn er später liegt; die Frist läuft also nie ab, bevor sie für
diesen Eintrag überhaupt begonnen hat. `finalized_at` ist der Zeitpunkt, zu
dem der Lauf den Eintrag festgeschrieben hat; das rechnerische Fristende
steht als `due_at` im Auditkontext. Nur `owner` darf die Frist setzen.

**Begründung.** ADR-016 Punkt 7 legt Voreinstellung und Konfigurierbarkeit
fest, nicht aber den Bezugstag für nachträglich angelegte Einträge. Würde
die Frist ausschließlich ab Behandlung zählen, wäre ein Nachtrag zu einem
drei Wochen alten Termin beim nächsten Lauf festgeschrieben — nach wenigen
Minuten, bevor die Therapeutin ihn zu Ende geschrieben hat. Das wäre genau
der unfertige Eintrag, den ADR-016 als Preis der Automatik nennt, ohne den
Nutzen des zeitnahen Nachweises. Der Anlagetag als späterer Bezug wahrt die
Absicht („zeitnah nach dem Ereignis dokumentieren", §630f Abs. 1 S. 1 BGB:
„in unmittelbarem zeitlichen Zusammenhang") und bleibt die restriktivere
Option gegenüber einer Ausnahme vom Automatismus. Der Zeitpunkt der
Festschreibung statt des Fristendes ist die ehrliche Angabe: Er sagt, wann
der Stand tatsächlich unveränderlich wurde; das Fristende ist aus Termin und
Frist jederzeit rekonstruierbar und steht zusätzlich im Auditkontext. Der
Rollenschnitt folgt §4.1 („Praxiseinstellungen") und dem Muster des
Praxisrasters. **Unsicher:** ob eine Frist je Organisation genügt oder ob
Hausbesuche am Freitag eine eigene Regel brauchen (offene Folgefrage in
ADR-016).

**Verankerung.** `app.documentation_deadline()` und die Spalte
`organizations.documentation_auto_finalize_days` in
`supabase/migrations/20260904120000_treatment_note_auto_finalisation.sql`
(beide tragen die Kennung); `set_documentation_deadline` ebendort;
`FRIST_WERTE` in `src/features/documentation/api.ts`; Datenbanktests „DOK-004:
Automatische Finalisierung nach Frist" und „DOK-004: Frist konfigurieren" in
`pnpm test:db`; Abnahmeschritt DOK-004 in
`docs/abnahme/etappe-1-kernprozess.md`.

**Änderungspfad.** Anderer Bezugstag oder eine Uhrzeit statt Mitternacht:
`app.documentation_deadline()` in einer Migration ersetzen — Aufwand `klein`.
Frist je Person oder je Terminart: eigene Spalte und Auswertung in derselben
Funktion — Aufwand `mittel`. Bereits automatisch finalisierte Einträge bleiben
finalisiert; sie sind über Korrektur und Nachtrag weiter änderbar.

### ANN-009 — Systemakteur im Auditlog

| | |
|---|---|
| Kategorie | Datenschutz |
| Herkunft | DOK-004; ADR-010 lässt das konkrete Schema der Audit-Einträge offen |
| Status | offen, seit 2026-09-04 |
| Wiedervorlage | Datenschutzprüfung / DSFA-Prozess vor Produktivstart |

**Annahme.** Auditereignisse ohne handelnden Account tragen
`actor_kind = 'system'` und keinen `actor_user_id`; alle übrigen bleiben
`user` mit Account, und eine Constraint erzwingt genau diese Paarung. Die
Auditansicht zeigt solche Ereignisse als „System", der Benutzerfilter blendet
sie aus. Bei der automatischen Finalisierung wird keine finalisierende
Person eingetragen — weder am Eintrag noch im Audit; Urheberin der
festgeschriebenen Version 1 ist wie bei der Finalisierung von Hand die
zuletzt schreibende Person.

**Begründung.** ADR-010 Punkt 3 verlangt die zur Nachvollziehbarkeit
erforderlichen Metadaten; ein Platzhalter-Account oder die zuletzt
schreibende Person als vermeintlich finalisierende wäre eine falsche
Angabe im Nachweis und liefe ADR-016 Punkt 1 („Urheberschaft je Version
bleibt dauerhaft erhalten") zuwider, weil sie eine Handlung zuschriebe, die
niemand vorgenommen hat. Ein ausdrücklicher Systemakteur ist die
datensparsamere und ehrlichere Darstellung (Art. 5 Abs. 1 lit. d DSGVO,
Richtigkeit). Die Unveränderbarkeit des Logs (ADR-010 Punkt 4) ist nicht
berührt: es gibt weiterhin kein Update und kein Delete über den
Anwendungspfad. **Unsicher:** ob die Prüfung eine Kennzeichnung des
konkreten Auslösers (Jobname, Intervall) im Auditkontext verlangt; heute
steht dort `surface = scheduler` und das Fristende.

**Verankerung.** Spalte `audit_log.actor_kind` und Constraint
`audit_log_actor_consistent` in
`supabase/migrations/20260904120000_treatment_note_auto_finalisation.sql`
(tragen die Kennung); `list_audit_events` ebendort; Anzeige in
`src/features/audit/AuditLogPage.tsx`; Datenbanktest „DOK-004: Systemakteur
im Auditlog" in `pnpm test:db`.

**Änderungspfad.** Zusätzliche Kennzeichnung des Auslösers: Kontext des
Inserts in `finalize_overdue_treatment_notes` erweitern — Aufwand `klein`.
Eigener Pseudo-Account statt Systemakteur: Spalte zurückbauen und Konto im
Seed anlegen — Aufwand `mittel`, ausdrücklich nicht empfohlen.
