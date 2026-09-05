# Annahmenregister

Zuletzt aktualisiert: 2026-09-05

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
| ANN-005 | Terminabschluss ohne Dokumentationspflicht                     | Praxisprozess | offen  | DOK-003, spätestens ABR-002   |

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

**Rückmeldung von Jannes (2026-09-05).** Ein manuell gepflegtes Aktiv/Inaktiv
sei im Alltag praxisfern. Gewünscht ist stattdessen eine automatische
Klassifizierung, gekoppelt an eine Erinnerung für Therapeut:innen gegen
Rezeptende mit einer Empfehlung zum weiteren Vorgehen — festgehalten als
`IDEA-LZK-007` in
`docs/product/ideen/00-lebenszyklus-und-zugang.md`. Das ändert diese Annahme
noch nicht: Automatisierung und der verordnungsfreie Übergang sind durch B9
blockiert (Rechtsrahmen offen). Bis zu einer Entscheidung dort bleibt die
obige Annahme (organisatorische Markierung, kein Behandlungsabschluss,
Rollenschnitt wie beschrieben) technisch in Kraft — Status bleibt `offen`.

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
`list_audit_events` in `supabase/migrations/20260828110100_audit_read_path.sql`.

**Änderungspfad.** Kontextinhalt je Funktion in einer Migration ändern —
Aufwand `klein`. Bereits geschriebene Zeilen sind über den Anwendungspfad nicht
lesbar; ob sie bereinigt werden müssen, entscheidet die Prüfung.

### ANN-005 — Terminabschluss ohne Dokumentationspflicht

| | |
|---|---|
| Kategorie | Praxisprozess |
| Herkunft | CAL-004 |
| Status | offen, seit 2026-08-30 (rückwirkend erfasst 2026-09-03) |
| Wiedervorlage | DOK-003 (Dokumentation in der Akte), spätestens ABR-002 (Leistungserfassung am abgeschlossenen Termin) |

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
Aufwand `klein` bis `mittel`, je nach Variante. Die Entscheidung fällt bei
DOK-003, spätestens wenn ABR-002 abgeschlossene Termine zu Leistungen macht,
und wird hier nachgetragen.
