# Annahmenregister

Zuletzt aktualisiert: 2026-09-11 (Marke Own Motion: ANN-022 und ANN-023 neu —
beim Zusammenführen aus ANN-020/021 umnummeriert, weil zwei Zweige parallel
dieselben freien Nummern gegriffen hatten. Zuvor am selben Tag: Jannes hat die
Annahmen aus UX-EPIC-001 bestätigt — ANN-018, ANN-020 und ANN-021 stehen auf
`entschieden (Jannes)`. Alle drei sind `Datenschutz` und bleiben deshalb im
Prüfpaket — die Bestätigung durch den Projektinhaber ersetzt die
Datenschutzprüfung nicht.)

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
| `entschieden (Jannes)` | Jannes hat die Festlegung selbst getroffen oder bestätigt, mit Datum. Für `Praxisprozess` und `Technik` ist der Eintrag damit erledigt; für `Datenschutz` und `Recht` ist es **keine externe Bestätigung** — der Eintrag bleibt im Prüfpaket |
| `bestätigt (Prüfung)`  | von der Datenschutzprüfung oder der zuständigen externen Stelle bestätigt — mit Datum und Instanz im Eintrag |
| `geändert`             | die Prüfung hat eine andere Festlegung verlangt; der Eintrag nennt die neue und den Commit    |
| `verworfen`            | die Annahme wurde aufgegeben; der Eintrag nennt, was stattdessen gilt                        |
| `in ADR überführt`     | bestätigt und als ADR festgehalten; Verweis auf die ADR-Nummer                                |

Ein Eintrag wird **nie gelöscht**. Auch eine verworfene Annahme bleibt
nachvollziehbar, damit die Prüfung sieht, was zwischenzeitlich galt.

**Warum `entschieden (Jannes)` und `bestätigt (Prüfung)` getrennt sind.** Beide
standen bis zum 2026-09-07 zusammen unter `bestätigt`. Damit hätte eine
Bestätigung durch Jannes den Go-live-Blocker der Kategorien `Datenschutz` und
`Recht` bereits erfüllt, obwohl §15.1 Punkt 5 dort ausdrücklich den
Datenschutzprozess nach §3.7 verlangt. Die Trennung schließt diese Lücke. Sie
ist die Register-Seite des Status `vorläufig entschieden (Jannes)` aus
`OPEN_DECISIONS.md`: Jannes darf jede offene Festlegung selbst treffen, damit
die Arbeit weiterläuft — sie zählt fürs Bauen, nicht für die Freigabe.

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
   **oder `entschieden (Jannes)`** durchgehen. Die Übersichtstabelle unten
   filtert sie. Ein Eintrag, den Jannes selbst entschieden hat, ist für die
   Prüfung kein erledigter Punkt, sondern eine Vorlage: er sagt, was gelten
   soll, und der Änderungspfad sagt, was ein Widerspruch kostet.
2. Je Eintrag: bestätigen oder eine andere Festlegung verlangen. Der
   **Änderungspfad** sagt vorab, was eine Änderung kostet — die Prüfung muss
   den Code dafür nicht lesen.
3. Ergebnis im Eintrag festhalten: Status, Datum, prüfende Instanz, bei
   Änderungen die neue Festlegung.
4. Geänderte Annahmen werden als eigene Aufgabe umgesetzt; der Eintrag verweist
   danach auf den Commit.

Vor Produktivstart MUSS jeder Eintrag der Kategorien `Datenschutz` und `Recht`
auf `bestätigt (Prüfung)`, `geändert`, `verworfen` oder `in ADR überführt`
stehen. `offen` und `entschieden (Jannes)` blockieren beide den Produktivstart
(`docs/DEVELOPMENT.md`, Go-live-Blocker; ROADMAP M3).

## Übersicht

| Kennung | Thema                                                          | Kategorie     | Status | Wiedervorlage                 |
|---------|----------------------------------------------------------------|---------------|--------|-------------------------------|
| ANN-001 | Interne Initialfristen des Retention Schedule                  | Datenschutz   | offen  | Datenschutzprüfung            |
| ANN-002 | Versorgungsstatus `inactive` und Rollenschnitt des Wechsels    | Praxisprozess | entschieden (Jannes) 2026-09-08 | erledigt; Fristanker erneut bei LOE-001 |
| ANN-003 | Adress-Snapshot beim Hausbesuchstermin                         | Datenschutz   | offen  | Datenschutzprüfung            |
| ANN-004 | Inhalt des Audit-Kontexts bei organisatorischen Einstellungen  | Datenschutz   | offen  | Datenschutzprüfung            |
| ANN-005 | Terminabschluss ohne Dokumentationspflicht                     | Praxisprozess | entschieden (Jannes) 2026-09-08 | verbindlich mit ADR-018       |
| ANN-006 | Umfang und Protokollierung des Behandlungsnachweises in der Akte | Datenschutz | offen  | Datenschutzprüfung; Leistungskürzel bei ABR-002 |
| ANN-007 | Mechanismus der automatischen Finalisierung: pg_cron          | Technik       | entschieden 2026-09-05 | Providerprüfung nach ADR-002 |
| ANN-008 | Fristbezug der automatischen Finalisierung                     | Praxisprozess | entschieden (Jannes) 2026-09-08; **Zahl offen** | Jannes nach den ersten Praxiswochen |
| ANN-009 | Systemakteur im Auditlog                                       | Datenschutz   | offen  | Datenschutzprüfung            |
| ANN-010 | Sichtbarkeit und Frist der internen Versorgungsangaben          | Datenschutz   | entschieden (Jannes) 2026-09-08 | **Datenschutzprüfung** — bleibt im Prüfpaket |
| ANN-011 | Datenklasse und Rollenschnitt der Verordnung                    | Datenschutz   | offen  | Datenschutzprüfung; C1 bei ABR-002 |
| ANN-012 | Genutzte Menge wird bis CAL-007/ABR-002 von Hand gepflegt      | Praxisprozess | entschieden (Jannes) 2026-09-08 | abgelöst durch CAL-007 und ABR-002 |
| ANN-013 | Datenklasse und Frist der Verordnerkartei                       | Datenschutz   | offen  | Datenschutzprüfung            |
| ANN-014 | „Empfehlung zum Verordnungsende" ist eine Angabe, keine Systemempfehlung | Recht | offen | Datenschutzprüfung; B1 (MDR-Abgrenzung) |
| ANN-015 | Umfang und Wortlaut der Verbindungsanzeige                      | Technik       | entschieden (Jannes) 2026-09-08 | UX-EPIC-001 (Textverlust-Schutz) |
| ANN-016 | Koordinate als abgeleitetes Stammdatum der Adresse             | Datenschutz   | offen  | Datenschutzprüfung; MAP-006 (Migration) |
| ANN-017 | Serverseitiger Kartendienst-Adapter als Supabase Edge Function  | Technik       | offen  | OPS-001 (Edge Runtime, ADR-015 Punkt 20); MAP-003 |
| ANN-018 | Übergabeziel und URL-Format des Navigations-Handoffs           | Datenschutz   | entschieden (Jannes) 2026-09-11, weiter im Prüfpaket | Datenschutzprüfung (B2); MAP-005 |
| ANN-019 | Verfallsdauer und Bindung des Verordnungsentwurfs (VER-003)      | Technik       | entschieden 2026-09-08 | UX-EPIC-001 (Restpunkt Textverlust-Schutz) |
| ANN-020 | Datenklasse und Frist der Textbausteine                          | Datenschutz   | entschieden (Jannes) 2026-09-11, weiter im Prüfpaket | Datenschutzprüfung; LOE-001 (Retention Schedule) |
| ANN-021 | Feldliste und Vorhaltedauer des Tagesplans im Arbeitsspeicher    | Datenschutz   | entschieden (Jannes) 2026-09-11, weiter im Prüfpaket | Datenschutzprüfung; Jannes nach dem ersten Feldtag |
| ANN-022 | Tiefgrün der Marke als Hover-Zustand des Akzents                 | Technik       | offen  | Jannes; MARKE-001 (Befund App-Symbole)    |
| ANN-023 | Die Kopfzeile führt die Marke, nicht den Organisationsnamen      | Praxisprozess | offen  | Jannes; erneut, falls eine zweite Praxis dazukommt (ADR-003) |

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
| Status | **entschieden (Jannes) 2026-09-08**; getroffen 2026-08-29, rückwirkend erfasst 2026-09-03 |
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
| Status | **entschieden (Jannes) 2026-09-08**; getroffen 2026-08-30, rückwirkend erfasst 2026-09-03 |
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

**Nachtrag 2026-09-05 (Planungsreview).** Jannes hat den vollständigen
Terminstatus-Automaten entschieden (angefragt, vorgemerkt, bestätigt,
abgesagt, nicht angetroffen, durchgeführt, dokumentiert, abgerechnet;
`OPEN_DECISIONS.md`, Abschnitt D). Die Ausgestaltung — insbesondere ob
„dokumentiert" aus der Finalisierung abgeleitet wird und was aus
„abgeschlossen" wird — legt ADR-018 im Loop CAL-EPIC-003 fest. Bis dahin
bleibt diese Annahme unverändert in Kraft; die Wiedervorlage wechselt von
ABR-002 auf CAL-EPIC-003.

### ANN-006 — Umfang und Protokollierung des Behandlungsnachweises in der Akte

| | |
|---|---|
| Kategorie | Datenschutz |
| Herkunft | DOK-003 (Dokumentation in der Akte, rollenabhängig projiziert); überbrückte bis zum 2026-09-05 auch Punkt C1 in `OPEN_DECISIONS.md`, der seither entschieden ist |
| Status | **entschieden (Jannes) 2026-09-08** — mit einem Vorbehalt: die **Zahl** (Voreinstellung 1 Tag) wird nach den ersten Praxiswochen festgezurrt, wie ADR-016 es vorsieht. Mechanik und Fristbezug stehen. |
| Wiedervorlage | Datenschutzprüfung / DSFA-Prozess vor Produktivstart; die Aufnahme der Leistungskürzel in den Nachweis bei ABR-002 |

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
nicht geliefert werden, weil es sie im System noch nicht gibt; dass
Leistungskürzel organisatorisch sind und dem Office offenstehen, ist seit dem
2026-09-05 mit C1 entschieden (`PROJECT_PRINCIPLES.md` §4.4, Version 0.4) und
umzusetzen, sobald die Leistungserfassung existiert. Für die
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
ergänzen — Aufwand `klein`. Leistungen im Nachweis: mit C1 entschieden,
umzusetzen bei ABR-002; braucht dann eine eigene Spalte aus der
Leistungserfassung — Aufwand `mittel`. Rollenschnitt: `app.can_read_treatment_evidence()` ersetzen —
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

---

### ANN-010 — Sichtbarkeit und Frist der internen Versorgungsangaben

| | |
|---|---|
| Kategorie | Datenschutz |
| Herkunft | PAT-005 (VER-EPIC-001); `IDEA-PRX-001`; `PROJECT_PRINCIPLES.md` §4.3, §4.6 und ADR-008 lassen die Einordnung solcher Felder offen |
| Status | **entschieden (Jannes) 2026-09-08** für den Praxisnutzen; Kategorie `Datenschutz`, deshalb **weiter im Prüfpaket** — die Sichtbarkeit gegenüber `office` und die Frist bestätigt erst die Datenschutzprüfung |
| Wiedervorlage | Datenschutzprüfung / DSFA-Prozess vor Produktivstart; Jannes für den Praxisnutzen |

**Annahme.** Zugangshinweis Hausbesuch, Besonderheit, Bemerkung und die feste
Therapeut:in sind **organisatorische Angaben der Praxis**, keine
Gesundheitsdaten und keine klinische Dokumentation. Sie liegen in einer
eigenen Tabelle `patient_care_details` und sind **für alle vier Praxisrollen
einschließlich `office` sichtbar**, ausdrücklich **nicht für das
Patientenkonto** und nicht für `anon`. Ihre **Datenklasse ist die der
Patientenakte**: zehn Jahre nach Abschluss der Behandlung (ADR-008). Sie
dürfen niemals in Logs erscheinen (ADR-011). Die zusätzliche Erreichbarkeit
(Mobil, geschäftlich, Telefax, Einrichtung) bleibt dagegen bei den
Kontaktdaten der Person und ist für das Patientenkonto sichtbar.

**Begründung.** Die Trennung folgt §4.3: `office` organisiert Termine und
ruft an — der Zugangshinweis ist genau dafür da, und ihn dem Office
vorzuenthalten würde die Rolle arbeitsunfähig machen. Zugleich verlangt §4.3,
klinischen Freitext fernzuhalten; deshalb steht am Formular ein Hinweis, dass
Befund und Verlauf in die Behandlungsdokumentation gehören, und die Felder
liegen nicht in `patients`, wo ein Test klinische Spaltennamen ausschließt.
Der Ausschluss des Patientenkontos folgt §4.6 und der Datensparsamkeit aus
§16: es sind Arbeitsnotizen der Praxis („Schlüssel bei der Nachbarin"), deren
Spiegelung in ein späteres Portal eine eigene fachliche Entscheidung wäre.
Das Auskunftsrecht nach Art. 15 DSGVO bleibt unberührt und läuft über OPS-006
(G9), nicht über eine Live-Ansicht. Die Frist folgt der Patientenakte, weil
die Angaben am Behandlungsverhältnis hängen und ADR-008 eine neue Datenklasse
ohne Fristzuordnung als Mangel führt; die kürzere Alternative („organisatorische
Patientenkommunikation", 3 Jahre) wäre nur mit eigener Löschregel haltbar und
würde die Angaben aus einem noch laufenden Behandlungsfall entfernen.
**Unsicher:** ob die Prüfung „Besonderheit" für ein Feld hält, in das in der
Praxis regelmäßig Gesundheitsdaten geraten (etwa „schwerhörig"), und deshalb
eine engere Rollenmenge oder eine eigene Kennzeichnung verlangt.

**Verankerung.** Tabelle `public.patient_care_details`, Policy
`patient_care_details_select_directory_only` und die Sicht
`patient_directory` in
`supabase/migrations/20260907100000_patient_master_data.sql` (tragen die
Kennung); Abschnitt „Versorgung" mit Hinweistext in
`src/features/patients/PatientMasterDataFields.tsx`; Anzeige in
`src/features/patients/PatientDetailPage.tsx`; Datenbanktests
„PAT-005: erweiterte Stammdaten und interne Versorgungsangaben" in
`pnpm test:db`.

**Änderungspfad.** Engere Rollenmenge (etwa ohne `office`): die eine Policy
ersetzen — Aufwand `klein`. Sichtbarkeit für das Patientenkonto: Policy um
den Zweig „eigene Person" erweitern — Aufwand `klein`. Kürzere Frist: eigene
Datenklasse und Löschregel in LOE-001 — Aufwand `mittel`. Verlegung einzelner
Felder in die klinische Dokumentation: Migration mit Datenumzug und neuem
Lesepfad — Aufwand `groß`.

---

### ANN-011 — Datenklasse und Rollenschnitt der Verordnung

| | |
|---|---|
| Kategorie | Datenschutz |
| Herkunft | VER-001 bis VER-003; `PROJECT_PRINCIPLES.md` §4.3 nennt „klinischen Freitext", ohne die Verordnung einzuordnen; C1 in `OPEN_DECISIONS.md` ist offen |
| Status | offen, seit 2026-09-07 |
| Wiedervorlage | Datenschutzprüfung / DSFA-Prozess; die Einordnung der Leistungskürzel entscheidet C1 bei ABR-002 |

**Annahme.** Eine Verordnung ist ein **Mischdatensatz** und wird deshalb in
zwei Projektionen ausgeliefert:

- **organisatorisch** für alle vier Praxisrollen einschließlich `office`:
  Verordner:in, Art (Erst/Folge), Ausstellungsdatum, Frequenz, organisatorische
  Bemerkung sowie die Positionen mit **Bezeichnung des Heilmittels** und
  verordneter, genutzter und verbleibender Menge;
- **klinisch** nur für `owner`, `therapist`, `team_lead`: Diagnose
  beziehungsweise Leitsymptomatik, Therapieziel, Hinweise der Verordner:in und
  die Empfehlung zum Verordnungsende.

**Anlegen, Ändern und Löschen dürfen nur die therapeutischen Rollen**, nicht
`office`. Die **Datenklasse ist die klinische Patientenakte**: zehn Jahre nach
Abschluss der Behandlung (ADR-008).

**Begründung.** Die Verordnung trägt mit der Diagnose ein Gesundheitsdatum nach
Art. 9 DSGVO; §4.3 hält `office` von klinischem Freitext fern. Zugleich ist die
Verordnung die Grundlage von Terminserie und Rechnung — ohne Kontingent und
Verordner:in kann `office` weder planen noch eine Folgeverordnung anfordern.
Die Bezeichnung des Heilmittels wird als organisatorisch geführt, weil sie
dieselbe Information trägt, die später als Leistungsposition ohnehin auf der
Rechnung steht, die `office` nach §4.3 sieht; das ist die schwächste Stelle
dieser Annahme und hängt an C1. Das Schreibrecht ohne `office` folgt §16
(im Zweifel restriktiver): Wer eine Verordnung erfasst, tippt die Diagnose mit
ab und sähe sie damit zwangsläufig — ein Schreibrecht wäre ein Leserecht durch
die Hintertür. Die zehnjährige Frist folgt §630f BGB und ADR-008 Punkt 4: die
Verordnung ist Teil der Behandlungsunterlagen. Umgesetzt ist die Trennung als
**zwei Funktionen mit zwei Rückgabetypen**, nicht als eine Funktion mit
genullten Spalten — wie bei DOK-003 (ADR-004). **Unsicher:** ob die Prüfung die
Heilmittelbezeichnung für `office` zulässt; ob das Schreibrecht ohne `office`
im Alltag trägt, sobald eine zweite Person im Büro sitzt.

**Verankerung.** `app.can_read_prescriptions()`,
`app.can_read_prescription_clinical()` und `app.can_write_prescriptions()` in
`supabase/migrations/20260907110000_prescriptions.sql` (tragen die Kennung);
`list_patient_prescriptions` und `list_patient_prescriptions_clinical` in
`supabase/migrations/20260907120000_prescription_read_paths.sql`; die
Schreibfunktionen in
`supabase/migrations/20260907130000_prescription_write.sql`; Rollenweiche in
`src/features/prescriptions/PatientPrescriptions.tsx`; Datenbanktests
„VER-002" und „VER-003" in `pnpm test:db`.

**Änderungspfad.** Anderer Rollenschnitt beim Lesen oder Schreiben: die
betroffene `app.can_*`-Funktion ersetzen — Aufwand `klein`. Heilmittel als
klinisch einstufen: Spaltenliste der organisatorischen Funktion und die
Oberfläche anpassen — Aufwand `mittel`, mit fachlicher Folge, weil `office`
dann nicht mehr planen kann. Andere Frist: eigene Datenklasse und Löschregel in
LOE-001 — Aufwand `mittel`.

---

### ANN-012 — Genutzte Menge wird bis CAL-007 und ABR-002 von Hand gepflegt

| | |
|---|---|
| Kategorie | Praxisprozess |
| Herkunft | VER-001; die Roadmap verortet den automatischen Verbrauch bei CAL-007 und ABR-002 (`IDEA-PRX-009`) |
| Status | **entschieden (Jannes) 2026-09-08** — bleibt gültig, bis CAL-007 und ABR-002 die Menge automatisch fortschreiben |
| Wiedervorlage | Jannes; verbindlich entschieden mit CAL-007 und ABR-002 |

**Annahme.** Jede Verordnungsposition führt eine **genutzte Menge**, die die
Praxis im Verordnungsformular selbst pflegt. Die verbleibende Menge wird daraus
gerechnet und nirgends gespeichert. Eine Constraint verhindert, dass die
genutzte Menge die verordnete übersteigt.

**Begründung.** Das Restkontingent ist die einzige Zahl, wegen der man eine
Verordnung im Alltag überhaupt aufschlägt; ohne sie wäre die Story ohne
Nutzen. Die automatische Verrechnung setzt die Verknüpfung von Termin und
Verordnung (CAL-007) und die Leistungserfassung (ABR-002) voraus — beides
später in der Roadmap. Ein leeres, von nichts gepflegtes Feld wäre ein
Zukunftsfeature auf Vorrat (ADR-014); ein von Hand gepflegtes ist heute
brauchbar und wird später zum Startwert der Automatik. Die verbleibende Menge
wird **nicht** gespeichert, weil ein zweiter Zähler auseinanderlaufen kann
(§13). **Unsicher:** ob die Praxis die Zahl im Alltag tatsächlich nachführt —
das zeigt erst die Probewoche 1.

**Verankerung.** Spalte `prescription_items.used_quantity` und Constraint
`prescription_items_used_within_prescribed` in
`supabase/migrations/20260907110000_prescriptions.sql` (tragen die Kennung);
Eingabefeld in `src/features/prescriptions/PrescriptionFormFields.tsx`;
Berechnung des Rests in `src/features/prescriptions/api.ts`.

**Änderungspfad.** Automatischer Verbrauch: CAL-007 und ABR-002 schreiben das
Feld fort, das Eingabefeld entfällt oder wird zur Korrekturmöglichkeit —
Aufwand `mittel`, ohne Datenumzug, weil die Spalte bleibt.

---

### ANN-013 — Datenklasse und Frist der Verordnerkartei

| | |
|---|---|
| Kategorie | Datenschutz |
| Herkunft | VER-001; ADR-008 kennt keine Datenklasse für personenbezogene Daten Dritter ohne Patientenbezug |
| Status | offen, seit 2026-09-07 |
| Wiedervorlage | Datenschutzprüfung / DSFA-Prozess (Verzeichnis der Verarbeitungstätigkeiten) |

**Annahme.** `prescribers` enthält **berufliche Kontaktdaten Dritter** —
Ärzt:innen und ihre Praxen — und ist **kein Gesundheitsdatum und kein
Patientendatum**: erst die Verordnung stellt den Bezug zu einer Patientin her.
Datenklasse: Stammdaten. Aufbewahrt, **solange eine Verordnung darauf
verweist**; das ist über `on delete restrict` strukturell erzwungen. Sichtbar
für alle vier Praxisrollen, nicht für Patientenkonten. Erfasst wird nur, was
zur Identifikation und zur Anforderung einer Folgeverordnung nötig ist — keine
Arztnummer, keine Betriebsstättennummer.

**Begründung.** Rechtsgrundlage ist Art. 6 Abs. 1 lit. b/f DSGVO
(Vertragsdurchführung und berechtigtes Interesse an der Zusammenarbeit mit der
verordnenden Stelle), nicht Art. 9 — die Kartei allein sagt nichts über eine
Gesundheit aus. Die Kopplung der Frist an die Verordnung folgt ADR-008 Punkt 2
(gesetzliche Aufbewahrung vor Löschung): Eine Verordnung ohne auflösbaren
Verordner wäre als Behandlungsunterlage unvollständig. Der Verzicht auf LANR
und BSNR folgt der Datenminimierung (§3, Art. 5 Abs. 1 lit. c DSGVO) — es sind
GKV-Merkmale, und die Praxis rechnet privat ab (ADR-009). **Unsicher:** ob die
Prüfung eine eigene Zeile im Verzeichnis der Verarbeitungstätigkeiten und eine
Information nach Art. 14 DSGVO gegenüber den erfassten Ärzt:innen verlangt.

**Verankerung.** Tabelle `public.prescribers` mit Tabellenkommentar und Policy
`prescribers_select_staff_only` in
`supabase/migrations/20260907110000_prescriptions.sql` (tragen die Kennung);
Formularfelder in `src/features/prescriptions/PrescriberFormFields.tsx`;
Datenbanktest „VER-001: Verordner:innen" in `pnpm test:db`.

**Änderungspfad.** Eigene Löschregel oder kürzere Frist: Regel in LOE-001
ergänzen — Aufwand `klein`, solange keine Verordnung verweist. Information nach
Art. 14 DSGVO: Textbaustein in G8/G14 — Aufwand `klein`, außerhalb des Codes.

---

### ANN-014 — „Empfehlung zum Verordnungsende" ist eine erfasste Angabe, keine Systemempfehlung

| | |
|---|---|
| Kategorie | Recht |
| Herkunft | VER-001; ADR-006 Punkt 4 verbietet eigene Therapieempfehlungen der Anwendung |
| Status | offen, seit 2026-09-07 |
| Wiedervorlage | Datenschutzprüfung; B1 (externe MDR-Abgrenzung, ADR-006 Punkt 7) |

**Annahme.** Das Feld „Empfehlung zum Verordnungsende" nimmt **die Empfehlung
der Therapeut:in** auf, die sie selbst formuliert und selbst verantwortet. Die
Anwendung **erzeugt, ergänzt und bewertet sie nicht**. Was die Anwendung
daneben zeigt, ist ausschließlich eine **Rechnung**: „noch 3 von 10". Wenn
keine Behandlung mehr offen ist, steht dort der neutrale Sachsatz „Kontingent
ausgeschöpft" — **keine** Handlungsempfehlung, keine Prognose, keine Ampel und
keine Erinnerung.

**Begründung.** ADR-006 Punkt 2 erlaubt ausdrücklich das Erfassen, Speichern,
Strukturieren und Darstellen von Gesundheitsinformationen; Punkt 4 verbietet
eigene Therapieempfehlungen. Eine von einem Menschen geschriebene Empfehlung zu
speichern und wieder anzuzeigen ist Punkt 2 und nicht Punkt 4 — dieselbe
Unterscheidung, die ADR-006 in seinen Konsequenzen für §7.1 trifft („Anzeigen"
gegenüber „Bewerten"). Die Differenz „verordnet minus genutzt" ist eine
transparente, veröffentlichte Rechenvorschrift ohne klinische Aussage. Die
Roadmap führt die Prognose eines Wettbewerbers ausdrücklich nicht,
`IDEA-LZK-007` (automatische Erinnerung mit Empfehlung zum weiteren Vorgehen)
ist durch B9 blockiert, und `OPEN_DECISIONS.md` nennt ausdrücklich „die
Empfehlung der Therapeutin zum Verordnungsende" als **nicht** blockiert.
Regulatorisch relevant ist auch die Beschriftung (ADR-006 Konsequenzen): das
Feld heißt deshalb in der Oberfläche „Empfehlung der Therapeut:in zum
Verordnungsende" und nicht „Empfehlung". **Unsicher:** ob die externe Prüfung
aus B1 den neutralen Sachsatz „Kontingent ausgeschöpft" bereits als Hinweis mit
Handlungsaufforderung liest.

**Verankerung.** Spalte `prescriptions.follow_up_recommendation` mit
Spaltenkommentar in
`supabase/migrations/20260907110000_prescriptions.sql` (trägt die Kennung);
Beschriftung und Hinweistext in
`src/features/prescriptions/PrescriptionFormFields.tsx`; Darstellung des
Restkontingents in `src/features/prescriptions/PatientPrescriptions.tsx`.

**Änderungspfad.** Feld oder Sachsatz anders beschriften: eine Stelle in der
Oberfläche — Aufwand `klein`. Feld ganz entfernen, falls die Prüfung es
beanstandet: Spalte und Formularfeld zurückbauen — Aufwand `klein`, ohne
Datenumzug bei leerer Datenbank. Eine automatische Erinnerung oder Bewertung
wäre **keine** Änderung dieser Annahme, sondern `MDR_REVIEW_REQUIRED` nach
ADR-006 Punkt 6 und ein eigenes Epic nach B9 und B10.

---

### ANN-015 — Umfang und Wortlaut der Verbindungsanzeige

| | |
|---|---|
| Kategorie | Technik |
| Herkunft | UI-000; die Roadmap führt die Verbindungsanzeige in UI-000 und UX-EPIC-001 ausdrücklich als `ANN` |
| Status | **entschieden (Jannes) 2026-09-08**; der Textverlust-Schutz ist mit UX-009 (2026-09-10) dazugekommen |
| Wiedervorlage | Jannes nach dem ersten Feldtag |

**Annahme.** Die Verbindungsanzeige stützt sich **allein auf
`navigator.onLine`** und die Ereignisse `online`/`offline` des Browsers. Es
gibt **keinen Ping gegen den Server und keinen Abfragetakt**. Sie erscheint
**nur im Fall „getrennt"** — ein dauerhaftes „verbunden" gibt es nicht. Der
Text nennt die Folge für die Arbeit („Änderungen lassen sich gerade nicht
speichern"), nicht den technischen Zustand, und bittet darum, den Text im Feld
stehen zu lassen.

**Begründung.** Der Anlass ist der Hausbesuch: im Treppenhaus reißt die
Verbindung ab, und ohne Hinweis merkt man das erst, wenn ein Speichern
fehlschlägt — im schlimmsten Fall mit einem Dokumentationstext im Feld. Ein
regelmäßiger Ping wäre die genauere, aber teurere Antwort: eine wiederkehrende
Verbindung ohne fachlichen Grund, zusätzliche Daten ohne Zweck (§18) und ein
Signal, aus dem sich ableiten ließe, wann ein Gerät benutzt wird (§20). Der
Preis der günstigeren Wahl ist bekannt und wird hier festgehalten: **ein Gerät
hinter einem Anmeldeportal oder mit erreichbarem Netz, aber unerreichbarem
Server, gilt als verbunden.** Deshalb behauptet der Text nicht, der Server sei
erreichbar. Ein dauerhaftes „verbunden" wäre Rauschen: es stünde fast immer da
und würde gerade dann übersehen, wenn es umschlägt. Die Anzeige ist
ausdrücklich **keine Offline-Fähigkeit** — kein Zwischenspeicher, keine
Synchronisation, kein Service Worker (ADR-015 Punkt 16); der begrenzte
Offline-Modus aus ADR-001 bleibt ein eigenes Vorhaben. **Unsicher:** ob der
Hinweis im Feldtag früh genug kommt, um einen Textverlust wirklich zu
verhindern — verlässlich wird das erst mit dem Textverlust-Schutz aus
UX-EPIC-001.

**Verankerung.** `src/app/verbindung.ts` (`useIstVerbunden`, trägt die
Kennung) — seit UX-009 eine eigene Datei, weil zwei Stellen den Zustand
brauchen; `src/app/Verbindungsanzeige.tsx`, eingehängt in
`src/app/AppShell.tsx`; seit UX-009 zusätzlich
`src/features/documentation/Textverlustschutz.tsx`, der den Hinweis dort
zeigt, wo gerade getippt wird. Tests in `src/app/Verbindungsanzeige.test.tsx`
und `src/features/documentation/Textverlustschutz.test.tsx`.

**Ergänzung durch UX-009 (2026-09-10).** Der Textverlust-Schutz, der hier als
offener Punkt vermerkt war, besteht aus **zwei** Dingen und ausdrücklich nur
diesen: einer Browserwarnung vor dem Verlassen der Seite, solange
ungespeicherter Text im Feld steht, und dem Hinweis neben den Schaltflächen,
wenn das Gerät getrennt ist. **Kein lokaler Zwischenspeicher** — ein Entwurf,
der nur im Browser läge, wäre nicht gespeichert, würde aber so aussehen (ADR-001,
ADR-015 Punkt 16). Die Unsicherheit aus dem Absatz oben bleibt damit teilweise
bestehen: Die Warnung greift bei Neuladen, Schließen und Zurück, nicht bei
einem Absturz oder einem leeren Akku.

**Änderungspfad.** Zusätzliche Prüfung gegen den Server: eine Abfrage in
`useIstVerbunden` ergänzen — Aufwand `klein`, aber **datenschutzrelevant**,
deshalb nicht ohne Entscheidung. Anderer Wortlaut oder eine dauerhafte Anzeige:
eine Stelle — Aufwand `klein`. Echte Offline-Fähigkeit: eigenes Epic nach
ADR-001, ersetzt ADR-015 Punkt 16 — Aufwand `groß`.

### ANN-016 — Koordinate als abgeleitetes Stammdatum der Adresse

| | |
|---|---|
| Kategorie | Datenschutz |
| Herkunft | MAP-001 (ADR-019 Fassung 2, Punkt 14) |
| Status | **offen**, getroffen 2026-09-08 |
| Wiedervorlage | Datenschutzprüfung / DSFA-Wiedervorlage Kartendienst; MAP-006 verankert sie in der Migration |

**Annahme.** Zu jeder Hausbesuchsadresse wird die geocodierte Koordinate
(`lat`, `lon`, Genauigkeitsstufe) **gespeichert**, und zwar bei der Adresse
selbst. Geocoding läuft **nur beim Anlegen oder Ändern der Adresse**, nie beim
Öffnen einer Karte oder beim Berechnen einer Route. Die Koordinate ist ein
abgeleitetes Stammdatum: sie teilt Datenklasse und Frist der Adresse, wird mit
ihr überschrieben und mit ihr gelöscht. Gespeichert werden nur Koordinate und
Genauigkeitsstufe — **keine Rohantwort des Anbieters**, kein Anzeigetext des
Treffers. Liegt der Treffer unterhalb der Hausnummerngenauigkeit, bestätigt
die erfassende Person ihn ausdrücklich, sonst bleibt die Adresse ohne
Koordinate. Wie die Koordinate zum Termin gelangt (Kopie mit dem
Adress-Snapshot nach ANN-003 oder Verweis), entscheidet MAP-006; Vorzug hat
die Kopie, damit die Regel aus ANN-003 unverändert gilt.

**Begründung.** Datenminimierung gegenüber dem Anbieter (Art. 5 Abs. 1 lit. c
DSGVO): Die Adresse geht **genau einmal** je Änderung zum Kartendienst; jede
spätere Karte, Route oder Matrix arbeitet mit Koordinaten (ADR-019 Punkt 13).
Ohne gespeicherte Koordinate müsste jede Routenberechnung alle Adressen des
Tages erneut übermitteln — mehr Übermittlungen, mehr Adresstext beim Anbieter.
Die Koordinate ist so personenbezogen wie die Adresse, deshalb dieselbe Klasse
und Frist (ADR-008). **Unsicher:** ob die Prüfung die Speicherung einer
Koordinate als zusätzliches Datum anders bewertet als die Adresse; ob bei
abgesagten Hausbesuchen (ANN-003) die Koordinate im Termin mitgelöscht werden
soll.

**Verankerung.** Bis MAP-006: `src/lib/location/contract.ts`, Abschnitt
„Geocoding" (trägt die Kennung), und ADR-019 Punkt 14. Ab MAP-006: die
Migration, die die Koordinatenspalten anlegt, und der einzige Schreiber
(Geocoding beim Adress-Upsert).

**Änderungspfad.** Verlangt die Prüfung Geocoding je Aufruf statt Speicherung:
Spalten entfallen, der Adapter geocodiert vor jeder Route — Aufwand `mittel`,
mit mehr Übermittlungen als bewusster Folge. Andere Frist oder eigene
Datenklasse für die Koordinate: Retention Schedule ergänzen, Löschregel je
Spalte — Aufwand `klein`. Koordinate im Termin-Snapshot statt nur bei der
Adresse oder umgekehrt: eine Migration — Aufwand `klein`.

### ANN-017 — Serverseitiger Kartendienst-Adapter als Supabase Edge Function

| | |
|---|---|
| Kategorie | Technik (datenschutzrelevant) |
| Herkunft | MAP-001 (ADR-019 Fassung 2, Punkt 15) |
| Status | **offen**, getroffen 2026-09-08 |
| Wiedervorlage | OPS-001 Providerprüfung (Edge Runtime nach ADR-015 Punkt 20); MAP-003 baut den Adapter |

**Annahme.** Geocoding, Routing und Matrix laufen in **einer Supabase Edge
Function** (`location-provider`), die den Server-Schlüssel des Anbieters als
Supabase-Secret hält und den Vertrag aus `src/lib/location/contract.ts`
erfüllt. Der Browser ruft nur diese Function auf (mit Anmeldung, nie anonym)
und spricht für Geocoding, Routing und Matrix **nie direkt** mit dem
Kartendienst. Einzige Ausnahme sind die Kartenkacheln, die der Browser mit
einem getrennten Kachelschlüssel direkt lädt. Der Vorbehalt aus ADR-015 Punkt
20 bleibt: Für produktive Gesundheitsdaten braucht die Edge Runtime eine eigene
Datenfluss- und Providerprüfung — sie fällt mit dem Provider-Gate aus ADR-019
Punkt 9 zusammen und wird in OPS-001 mitgeprüft.

**Begründung.** Verglichen wurden drei Wege. **Direkt aus dem Browser:** der
Schlüssel stünde im Bundle, IP-Adresse und User-Agent der Therapeutin landeten
beim Anbieter, und es gäbe keine zentrale Stelle für Redaction und
Fehlerbehandlung (ADR-011). **Aus der Datenbank** (`pg_net`/HTTP-Erweiterung):
HTTP-Aufrufe aus Postgres mit schlechter Timeout-Kontrolle und dem Secret in
der Datenbank; Erweiterung beim Provider nicht sicher verfügbar (R9). **Eigener
kleiner Dienst:** eine zusätzliche Laufzeitkomponente mit eigener
Wiederherstellungslast bei Bus-Faktor 1 (ADR-012). Die Edge Function ist die
Komponente des bestehenden Stacks (ADR-015 Punkt 6), hat genau eine Stelle für
Schlüssel, Redaction und Timeout und lässt sich mit gemocktem `fetch` testen.
**Unsicher:** die Edge Runtime ist global verteilt — wo ein Aufruf tatsächlich
ausgeführt wird und ob sich das auf EU-Regionen festlegen lässt, ist Teil der
Providerprüfung. **Einschränkung der Umgebung:** In der Cloud-Entwicklungs-
umgebung läuft `supabase start` nicht; die Function ist dort nur mit
Komponententests (gemocktes `fetch`) prüfbar, gegen den echten Anbieter nur
lokal bei Jannes und in `e2e-supabase`.

**Verankerung.** `src/lib/location/contract.ts`, Abschnitt „Serverseitiger
Anbieteradapter" (trägt die Kennung); ab MAP-003 `supabase/functions/
location-provider/`.

**Änderungspfad.** Andere Laufzeit (eigener Dienst, Datenbankfunktion): Der
Adapter ist ein Modul hinter dem Vertrag; die Oberfläche und die Fachlogik
ändern sich nicht — Aufwand `mittel`. Ergibt OPS-001, dass die Edge Runtime
für Gesundheitsdaten ausscheidet, greift derselbe Pfad **vor** MAP-006.

### ANN-018 — Übergabeziel und URL-Format des Navigations-Handoffs

| | |
|---|---|
| Kategorie | Datenschutz |
| Herkunft | MAP-001 (ADR-019 Fassung 2, Punkt 20 bis 23); ADR-019 Fassung 1 hatte diese `ANN` für UX-EPIC-001 angekündigt |
| Status | **entschieden (Jannes) 2026-09-11** — Feldliste und Fahrradmodus bestätigt; Kategorie `Datenschutz`, deshalb **weiter im Prüfpaket**: dass die Übergabe an Google in dieser Form zulässig ist, bestätigt erst die Datenschutzprüfung (B2). Getroffen 2026-09-08, mit UX-002 für Google Maps umgesetzt |
| Wiedervorlage | Datenschutzprüfung (B2, Handoff und §203/Art. 9); MAP-005 bewertet die Ziel-Apps und setzt Apple Maps und `geo:` um |

**Annahme.** Der Handoff übergibt an die Navigations-App **nur das Ziel und
den Fahrradmodus**: die Koordinate, sobald sie zur Adresse vorliegt (ANN-016,
ab MAP-006); bis dahin die Postanschrift ohne Namen (Straße, Hausnummer,
Postleitzahl, Ort). **Nie** Name, Uhrzeit, Termin- oder Patientenkennung,
Notiz oder Diagnose. Formate: Google Maps
`https://www.google.com/maps/dir/?api=1&destination=<Ziel>&travelmode=bicycling`
(Tageslink: `waypoints=` mit `|` getrennt, höchstens neun Zwischenziele, drei
in mobilen Browsern — in MAP-005 gegen die Dokumentation zu prüfen); Apple
Maps `https://maps.apple.com/directions?destination=<lat,lon>&mode=cycling`;
Systemnavigation `geo:<lat>,<lon>`. Die URL entsteht in **einer** Funktion,
erst beim Tippen, wird nie gespeichert und nie automatisch geöffnet.

**Begründung.** Die Koordinate ist für den Betreiber der Navigations-App so
identifizierend wie die Adresse (Rückwärts-Geocoding), aber sie enthält keinen
Freitext und keinen Anhaltspunkt außer dem Punkt; die Anwendung zeigt der
Therapeutin Adresse und Klingelhinweis lokal. Der Gewinn ist klein, aber er
kostet nichts. Bis Koordinaten vorliegen, ist die Adresse ohne Namen die
datensparsamste Form, die eine Navigation überhaupt erlaubt. Die Feldliste
folgt Art. 5 Abs. 1 lit. c DSGVO und der Regel aus ADR-019 Punkt 12.
**Unsicher:** ob ein Pin ohne Hausnummer in Google Maps die Therapeutin auf
dem Rad verwirrt (Hausnummer nicht sichtbar) — MAP-005 prüft das auf echten
Geräten; ob die Übergabe der Adresse an einen eigenen Verantwortlichen
Art. 9 oder §203 berührt — Rechtsfrage an B2 (ADR-019 Punkt 23).

**Verankerung.** `src/lib/location/contract.ts`, Typ `NavigationTarget`
(trägt die Kennung); seit UX-002 `src/lib/location/navigation.ts` — die eine
Stelle, an der Feldliste, Ländercode, URL-Format und Wegpunktlimit stehen
(trägt die Kennung ebenfalls), mit Tests in `navigation.test.ts`, darunter
einer, der prüft, dass die URL **außer** Ziel und Fahrmodus nichts trägt. Die
Prüfregel „nur auf Aktion" ist in `src/features/appointments/NavigationStarten.tsx`
umgesetzt — eine Schaltfläche, kein `href`; ein Test prüft, dass vor dem
Tippen keine URL im Seitenquelltext steht.

**Stand der Umsetzung (UX-002, 2026-09-10).** Gebaut ist **nur Google Maps**,
wie es die Roadmap-Zeile von UX-EPIC-001 vorgibt. Apple Maps und die
Systemnavigation (`geo:`) stehen in dieser Annahme und in ADR-019 Punkt 22 als
Festlegung, sind aber nicht implementiert: sie gehören zu **MAP-005**, das die
Ziel-Apps auf echten Geräten bewertet. Sie auf Vorrat zu bauen wäre ein
Zukunftsfeature (§11, ADR-014). Ebenfalls noch offen und dort zu prüfen: das
Wegpunktlimit (hier neun laut Anbieterdokumentation; ein längerer Tag wird in
Abschnitte geteilt, nicht abgeschnitten) und die Frage, ob ein Pin ohne
sichtbare Hausnummer auf dem Rad taugt.

**Änderungspfad.** Adresse statt Koordinate oder umgekehrt, anderes Limit,
andere Ziel-App: eine Funktion — Aufwand `klein`. Verlangt B2 eine
Einwilligung der Patient:innen vor dem Handoff: Einwilligungsstruktur aus
PAT-006, Prüfung vor dem Bauen der URL — Aufwand `mittel`. Verlangt B2, den
Handoff ganz zu unterlassen: die Funktion entfällt, die Tagesliste zeigt die
Adresse zum Abtippen — Aufwand `klein`, mit dem Verlust des einen Taps als
Folge.

### ANN-019 — Verfallsdauer und Bindung des Verordnungsentwurfs (VER-003)

| | |
|---|---|
| Kategorie | Technik |
| Herkunft | Nachprüfung zu PR #15/#16: der erste Fix für den Eingabenverlust beim Anlegen einer Verordner:in speicherte den Entwurf im TanStack-Query-Cache und verlor ihn dort nach der Standard-`gcTime` von fünf Minuten - ein zweiter, echter Fehler in derselben Story. |
| Status | **entschieden 2026-09-08** |
| Wiedervorlage | UX-EPIC-001 (Textverlust-Schutz) — dort wird der unten genannte Restpunkt behoben; außerdem Jannes, falls die 30-Minuten-Grenze in der Praxis zu knapp oder zu großzügig wirkt |

**Annahme.** Der Formularzustand liegt nicht mehr im TanStack-Query-Cache,
sondern in einem eigenen, kleinen In-Memory-Speicher (`src/features/prescriptions/api.ts`,
`entwurfSpeicher`). Ein Entwurf ist an **Vorgang** (Rücksprungpfad, je Patient
und Verordnung eindeutig) **und Benutzer** (Supabase-Auth-`user.id`) gebunden
und verfällt nach **30 Minuten** von selbst, unabhängig davon, ob er
zwischenzeitlich gelesen wurde. Bei Abmeldung werden zusätzlich **sofort alle**
Entwürfe verworfen, nicht erst nach Ablauf der Frist.

**Begründung.** Die eigentliche Anforderung - ein Entwurf muss die Anlage
einer fehlenden Verordner:in überleben, auch wenn die Person dafür Adresse und
Kontaktdaten nachschlägt - ist mit der Standard-`gcTime` (fünf Minuten) eines
inaktiven, unbeobachteten Query-Cache-Eintrags nicht verlässlich erfüllbar:
`setQueryData` ohne einen laufenden `useQuery` an derselben Stelle hat ab dem
Moment des Ablegens keinen Beobachter und gilt sofort als inaktiv. Die
`gcTime` für genau diesen einen Schlüssel dauerhaft zu erhöhen, wäre technisch
möglich gewesen (`setQueryDefaults`), hätte aber weiterhin denselben
Cache-Mechanismus für einen Zweck zweckentfremdet, für den er nicht gebaut ist
- mit dem nächsten daran hängenden Detail (Rehydrierung, Persister-Plugins,
`refetchOnMount`) als nächstem Überraschungskandidaten. Ein eigener, expliziter
Speicher mit genau den drei gebrauchten Operationen (ablegen, ansehen,
entfernen) ist einfacher zu verstehen und zu prüfen als ein Cache-Sonderfall.
30 Minuten sind eine Schätzung, keine Messung: großzügig genug für eine
Verordner-Anlage mit Adress- und Kontaktrecherche, eng genug, dass ein
tatsächlich abgebrochener Versuch nicht Tage später bei einem unabhängigen
neuen Versuch auf demselben Pfad unbemerkt wieder auftaucht. Die
Benutzerbindung verhindert zusätzlich, dass ein Kontowechsel im selben
Browser-Tab (ohne Neuladen der Seite) den Entwurf einer anderen Person
übernimmt; das Verwerfen bei Abmeldung ist Verteidigung in der Tiefe dazu, da
die Verordnung klinische Freitexte enthalten kann (Diagnose, Therapieziel;
§18, ADR-011). Der Speicher bleibt wie zuvor ausschließlich im
Arbeitsspeicher der laufenden Seite - kein `localStorage`, kein
`sessionStorage`, kein Weg über die URL - und betrifft keine andere Abfrage im
Query-Cache.

**Verankerung.** `src/features/prescriptions/api.ts` (`entwurfSpeicher`,
`ENTWURF_MAX_ALTER_MS`, trägt die Kennung im Kommentar); verwendet in
`PrescriptionFormPage.tsx` und `PrescriberFormPage.tsx`; das Verwerfen bei
Abmeldung in `src/features/auth/SessionProvider.tsx`. Tests in
`src/features/prescriptions/api.test.ts` (Speicherverhalten, u. a. mit
`vi.useFakeTimers()`) und `src/features/prescriptions/PrescriptionFormPage.entwurf.test.tsx`
(echter Seitenwechsel über echte Routen, Zeitfortschritt über fünf Minuten via
`Date.now()`).

**Änderungspfad.** Andere Frist: eine Zahl in `ENTWURF_MAX_ALTER_MS` - Aufwand
`klein`. Mehrere gleichzeitige Entwürfe je Person zulassen oder den Speicher
auf mehrere Tabs ausdehnen: eigener Mechanismus (z. B. `BroadcastChannel`),
grundsätzlich anderer Ansatz - Aufwand `mittel`.

**Restpunkt behoben mit UX-009 (2026-09-10).** Der Restpunkt lautete: Wer die
Verordner:innen-Anlage über die **Hauptnavigation** verließ statt über
„Abbrechen", ließ einen Entwurf liegen, der bei einem unabhängigen neuen
Versuch auf demselben Rücksprungpfad wieder eingesetzt wurde — der Pfad war
für beide Versuche derselbe Schlüssel.

Behoben, aber **anders als angekündigt**. Vorgesehen war, den Entwurf beim
Verlassen des Abstechers zu verwerfen. Ein Aufräumen beim Aushängen der
Komponente ist mit React StrictMode nicht verlässlich: Der Entwicklungsmodus
hängt jede Komponente einmal aus und wieder ein, das Aufräumen liefe also
sofort — und verwürfe den Entwurf, den es schützen soll. Stattdessen ist der
Schlüssel jetzt eine **Vorgangskennung**: Sie entsteht bei jedem Besuch des
Verordnungsformulars neu, reist im Rücksprungpfad mit und wird beim
Wiederaufbau verbraucht. Ein unabhängiger neuer Besuch bringt eine neue
Kennung mit und findet nichts vor — unabhängig davon, wie der vorige Versuch
endete. Die 30-Minuten-Frist bleibt, jetzt aber als Grenze dafür, wie lange
ein aufgegebener Entwurf im Arbeitsspeicher liegt, nicht mehr als einziger
Schutz gegen ein Wiederauftauchen.

Verankert in `src/features/prescriptions/api.ts` (`neueVorgangskennung`,
`vorgangAusPfad`, `entwurfSchluessel`), verwendet in `PrescriptionFormPage.tsx`
und `PrescriberFormPage.tsx`. Zwei Regressionstests in
`PrescriptionFormPage.entwurf.test.tsx` mit echtem Seitenwechsel: der
aufgegebene Versuch taucht nicht wieder auf, und zwei Abstecher werden
auseinandergehalten.

### ANN-020 — Datenklasse und Frist der Textbausteine

| | |
|---|---|
| Kategorie | Datenschutz |
| Herkunft | UX-008 (Textbausteine in der Dokumentation, `IDEA-PRX-011`, E-9) |
| Status | **entschieden (Jannes) 2026-09-11** — Textbaustein ohne Patientenbezug, Löschung durch die Praxis; Kategorie `Datenschutz`, deshalb **weiter im Prüfpaket**: ob der Freitext trotz fehlenden Bezugs der Akte zugeordnet wird, entscheidet die Datenschutzprüfung. Getroffen 2026-09-10 |
| Wiedervorlage | Datenschutzprüfung; LOE-001 nimmt die Klasse in den Retention Schedule auf |

**Annahme.** Ein Textbaustein ist ein **Betriebsdatum der Praxis ohne
Patientenbezug** und kein Gesundheitsdatum. Die Tabelle
`public.treatment_text_snippets` trägt deshalb bewusst **keine** `patient_id`
und **keine** `appointment_id`. Aufbewahrungsfrist: **bis zur Löschung durch
die Praxis** — es gibt keine gesetzliche Frist, die einen Baustein erfasst,
und keinen Anlass, ihn selbsttätig verfallen zu lassen. Ein **persönlicher**
Baustein endet mit dem Mitarbeiterdatensatz seiner Person (`on delete
cascade`); ein **praxisweiter** überlebt jeden Personalwechsel. Löschen ist
hier ein echtes Löschen und kein Statuswechsel: Ein Baustein ist eine Vorlage;
was mit ihm geschrieben wurde, steht unverändert in der Akte und ist davon
nicht berührt.

**Begründung.** Der Baustein ist Text, den eine therapeutische Person
**vorher** formuliert, ohne einen Fall vor sich zu haben — eine Formulierung,
keine Aussage über einen Menschen. Damit fehlt der Personenbezug nach Art. 4
Nr. 1 DSGVO, und Art. 9 greift nicht. Das Datenmodell hält das nicht nur fest,
sondern erzwingt es: Ohne Spalte für Patient oder Termin lässt sich ein Bezug
nicht herstellen, auch nicht versehentlich, auch nicht später durch eine
Abfrage. **Der Restwert liegt im Freitext selbst:** Jemand kann in einen
Baustein hineinschreiben, was dort nicht hingehört (»Frau M., 2. OG«). Dagegen
hilft kein Schema, sondern die Beschriftung im Formular („keine Angaben aus
einer Akte") und die Länge von 2.000 Zeichen, die einen Baustein als Satz und
nicht als Befund ausweist. In Logs erscheint der Text nie (ADR-011); der
Auditeintrag trägt Titel und Geltungsbereich, nicht den Inhalt.
**Unsicher:** ob die Prüfung den Freitext trotz fehlenden Bezugs der
Patientenakte zuordnet und damit derselben Frist unterwirft (10 Jahre nach
Behandlungsabschluss, ADR-008) — dann wäre die Klasse eine andere, die
Löschung aber weiterhin durch die Praxis ausgelöst.

**Verankerung.** `supabase/migrations/20260910140000_treatment_text_snippets.sql`
— die Tabelle trägt Datenklasse und Frist als `COMMENT` und die Kennung im
Kopfkommentar. Tests in `supabase/tests/text-snippets.test.ts` (Abschnitt
„Datenschutz"): kein `patient_id`/`appointment_id`, Kommentar mit Klasse und
Frist, Löschung mit dem Mitarbeiterdatensatz.

**Änderungspfad.** Andere Frist oder eigene Datenklasse: Eintrag im Retention
Schedule (LOE-001) und eine Löschregel je Tabelle — Aufwand `klein`; die
Tabelle selbst ändert sich nicht. Verlangt die Prüfung, Bausteine wie
Aktendaten zu behandeln: dieselbe Frist, zusätzlich Aufnahme in das
Löschjournal (LOE-002) — Aufwand `klein`. Verlangt sie, dass praxisweite
Bausteine gar nicht persönlich sein dürfen oder umgekehrt: eine Spalte und
zwei Policies — Aufwand `mittel`.

### ANN-021 — Feldliste und Vorhaltedauer des Tagesplans im Arbeitsspeicher

| | |
|---|---|
| Kategorie | Datenschutz |
| Herkunft | UX-011 (Tagesplan-Cache lesend, `IDEA-PRX-014`, E-12); ADR-001 („offene Folgefrage: Feldliste") |
| Status | **entschieden (Jannes) 2026-09-11** — Feldliste und acht Stunden bestätigt; Kategorie `Datenschutz`, deshalb **weiter im Prüfpaket**. Die Zahl bleibt zudem unter Vorbehalt des ersten Feldtags: Sie ist geschätzt, nicht gemessen. Getroffen 2026-09-10 |
| Wiedervorlage | Datenschutzprüfung; Jannes nach dem ersten Feldtag (reicht die Vorhaltedauer, ist sie zu lang?) |

**Annahme.** Die zuletzt erfolgreich geladene Tagesliste bleibt im
**Arbeitsspeicher der laufenden Seite** lesbar, auch wenn eine spätere Abfrage
scheitert. Sie wird dann als älterer Stand gekennzeichnet („Angezeigt wird der
Stand von 07:52 Uhr – er kann veraltet sein").

- **Feldliste:** genau das, was `list_day_plan` liefert und nicht mehr —
  Zeitraum, Terminart, Status, Name der Patient:in, Besuchsadresse,
  Festnetz- und Mobilnummer, Zugangshinweis, organisatorische Besonderheit,
  Dokumentationsstand ohne Inhalt. **Keine klinischen Inhalte**, keine
  Verordnung, keine Akte. Das ist die Antwort auf die offene Folgefrage aus
  ADR-001, „welche Felder zu den minimal notwendigen Hausbesuchsdaten
  gehören": es sind die Felder eines Arbeitstags einer Person, und die
  Feldliste wird nicht hier gepflegt, sondern ist die Rückgabe der
  Serverfunktion.
- **Vorhaltedauer:** acht Stunden ab dem Laden — ein Arbeitstag, nicht mehr.
  Zusätzlich endet sie bei jedem Neuladen, jedem geschlossenen Tab, jeder
  Abmeldung (der Abfragespeicher wird dabei geleert) und mit dem Wechsel des
  Kalendertags, weil der Abfrageschlüssel den Tag enthält.
- **Verschlüsselung:** keine Frage, weil **nichts gespeichert wird** — kein
  `localStorage`, kein `sessionStorage`, kein IndexedDB, kein Service Worker
  (ADR-015 Punkt 16). Damit landet nichts auf dem Gerät, das eine
  Geräteverschlüsselung oder eine Löschfrist bräuchte. Die
  Endgeräteanforderungen aus ADR-001 entstehen erst mit einem echten
  Offline-Modus.

**Begründung.** ADR-001 nennt „den Tagesplan" und „die minimal notwendigen
Hausbesuchsdaten" ausdrücklich als das, was offline verfügbar sein soll — und
lässt den Mechanismus offen. Der billigste Mechanismus, der dem Zweck genügt,
ist der Zwischenspeicher, den die laufende Seite ohnehin hält: Er kostet keine
neue Technik, keine Synchronisation und keine Konfliktauflösung, und er kann
die Situation aus ADR-001 („dokumentiert geglaubt, aber nirgends gespeichert")
gar nicht erzeugen, weil er **nur liest**. Geschrieben wird ausschließlich
online; scheitert ein Schreibvorgang, sagt die Anwendung das (UX-009).
Ein dauerhafter lokaler Bestand wäre die andere Option: mehr Verfügbarkeit,
aber Gesundheitsdaten auf einem mobilen Gerät mit allem, was daran hängt
(Geräteverschlüsselung, Sperrcode, Verlust, BYOD) — das ist ein eigenes
Vorhaben und nach §16 nicht der Weg, den man nebenbei geht.
**Unsicher:** ob acht Stunden für einen langen Tag reichen und ob die Prüfung
den Zugangshinweis im Arbeitsspeicher anders bewertet als auf dem Bildschirm,
wo er ohnehin steht.

**Verankerung.** `TAGESPLAN_VORHALTEDAUER_MS` in
`src/features/today/api.ts` (trägt die Kennung) — die eine Zahl; die Feldliste
ist die Rückgabe von `public.list_day_plan`
(`supabase/migrations/20260910100000_day_plan.sql`). Das Leeren bei der
Abmeldung in `src/app/App.tsx` (`abmelden`). Tests in
`src/features/today/MyDayPage.test.tsx`, Abschnitt „UX-011".

**Änderungspfad.** Andere Vorhaltedauer: eine Zahl — Aufwand `klein`.
Verlangt die Prüfung, dass gar nichts über einen Fehlversuch hinaus stehen
bleibt: `gcTime` auf 0 und die Kennzeichnung entfernen — Aufwand `klein`, mit
dem Verlust der Anschrift im Funkloch als bewusster Folge. Verlangt der
Betrieb einen echten Offline-Modus: eigenes Epic nach ADR-001, ersetzt
ADR-015 Punkt 16 und bringt die Endgeräteanforderungen mit — Aufwand `groß`.
### ANN-022 — Tiefgrün der Marke als Hover-Zustand des Akzents

| | |
|---|---|
| Kategorie | Technik |
| Herkunft | Umstellung der Akzentfarbe auf die Marke Own Motion (2026-09-10). Die Hauptfarbe `#004429` liegt bei 34,1 % Helligkeit; die bisherige Ableitungsregel „Hover ist 6 Punkte dunkler" hätte von dort aus einen fast schwarzen Wert ergeben. |
| Status | **offen** |
| Wiedervorlage | Jannes, sobald er die Oberfläche eine Weile bedient hat; außerdem MARKE-001, falls die Marke um abgestufte Farbwerte ergänzt wird |

**Annahme.** `--color-accent-hover` trägt das **Tiefgrün der Marke**
(`#042c1b` = `oklch(26.1% 0.0544 160)`) — also einen **dunkleren**, nicht
helleren Wert als den Akzent. `marke/README.md` führt Tiefgrün als Fläche für
App-Symbol, Aufkleber und Visitenkarten-Vorderseite; die Verwendung als Fläche
und Textfarbe in der Anwendung geht darüber hinaus und ist deshalb hier
registriert.

**Begründung.** Die Richtung war die eigentliche Frage, und sie entscheidet
sich nicht am Knopf, sondern an den Links: `--color-accent-hover` ist in rund
einem Dutzend Stellen **Textfarbe** (`text-accent hover:text-accent-hover`,
etwa `MyDayPage.tsx`, `VacationPage.tsx`, `TeamChatPage.tsx`) und nur in
zweien Knopffläche. Ein hellerer Wert hätte beide Verwendungen geschwächt: den
weißen Text auf dem Knopf und den Link auf heller Fläche. Der dunklere Wert
stärkt beide — als Text 13,85:1 statt 10,30:1, weiß darauf 15,19:1 statt
11,29:1 (jeweils schlechteste der drei Flächen). Der Einwand, von 34,1 % aus
weiter abzudunkeln werde „sehr dunkel", trifft die Wahrnehmung, nicht die
Unterscheidbarkeit: der Abstand beträgt 8 Helligkeitspunkte gegenüber 6 in der
Palette davor, der Zustandswechsel ist also **deutlicher** als zuvor.
Ausschlaggebend für genau diesen Wert war schließlich, dass er nicht erfunden
ist: `marke/README.md` schließt mit „Keine weiteren Kombinationen" eigene
Abstufungen aus, und Tiefgrün ist die einzige dunklere Farbe, die die Marke
kennt.

`--color-accent-soft` folgt derselben Logik in die andere Richtung: Farbton der
Marke, Buntheit `0.022` — bewusst **unter** `positiv-soft` (`0.03`), weil beide
seit der Umstellung im Farbton nur neun Grad auseinanderliegen und als Abzeichen
nebeneinander stehen. Papier (`#f6f7f4`) schied als Wert aus: mit 97,5 %
Helligkeit liegt es zu dicht an `canvas` (98,6 %), um eine Fläche zu markieren.

**Verankerung.** `src/index.css`, `--color-accent-hover` und
`--color-accent-soft` (tragen die Kennung im Kommentar). Geprüft in
`src/lib/kontrast.test.ts`: Textkontrast beider Akzentwerte, weißer Text
darauf, Mindestabstand der beiden Zustände (6 Punkte) und die Ordnung
`accent-soft` unter `positiv-soft`.

**Änderungspfad.** Andere Richtung oder anderer Wert: eine Zeile in
`src/index.css`, der Test rechnet die Grenzen neu — Aufwand `klein`. Sollte die
Marke später eine eigene, abgestufte Farbskala bekommen, ersetzt sie diesen
Wert an derselben Stelle — Aufwand `klein`.

### ANN-023 — Die Kopfzeile führt die Marke, nicht den Organisationsnamen

| | |
|---|---|
| Kategorie | Praxisprozess |
| Herkunft | Anwenden der Marke Own Motion (2026-09-10). Die Kopfzeile zeigte `user.organizationName ?? 'Praxisplattform'`; mit der Marke gäbe es zwei Antworten auf dieselbe Frage. |
| Status | **offen** |
| Wiedervorlage | Jannes; erneut, sobald eine zweite Praxis dazukäme (ADR-003, „echter Mehrmandantenbetrieb") |

**Annahme.** Die Kopfzeile der angemeldeten Anwendung zeigt die **Wortmarke**.
Der Organisationsname aus den Stammdaten erscheint dort nicht mehr. Die
Anmeldemaske zeigt ebenfalls die Marke statt des Worts „Praxisplattform", der
Seitentitel lautet „Own Motion".

**Begründung.** ADR-003 stellt ausdrücklich fest, dass `organization_id` **keine
Mandantenfähigkeit schafft** und ein echter Mehrmandantenbetrieb „ein eigenes
Vorhaben mit eigener Prüfung" bliebe; unter „Bewusst nicht Bestandteil" steht
„Mandantenfähigkeit als Produktfunktion: kein Tenant-Switching".
`docs/PRODUCT_VISION.md` benennt die Praxis seit dem 2026-09-10 als Own Motion.
Es gibt also genau eine Praxis, und der Name aus der Datenbank sagt neben der
Marke nichts Zusätzliches. Beides nebeneinander wäre zudem im aktuellen Stand
irreführend: der Seed trägt „Test Praxis Tuebingen", das stünde dann unter der
Wortmarke. Die Alternative — die Marke zeigen und den Organisationsnamen als
zugängliche Bezeichnung hinterlegen — wurde verworfen, weil Vorlesesoftware
dann etwas anderes sagt, als zu sehen ist.

**Bewusst in Kauf genommen.** Der Organisationsname wird damit **nirgends** mehr
angezeigt. Wer aus der laufenden Anwendung ablesen möchte, ob er auf
synthetischen Seed-Daten oder auf einem echten Bestand arbeitet, hat dieses
Signal nicht mehr. Für den aktuellen Stand ist das folgenlos — es gibt keinen
echten Bestand (§3.1) —, vor dem Produktivstart ist es ein Punkt für die
Betriebsdokumentation.

**Verankerung.** `src/app/AppShell.tsx` (Kopfzeile, trägt die Kennung im
Kommentar), `src/features/auth/LoginPage.tsx`, `index.html`. Festgehalten in
`src/app/AppShell.test.tsx` und `src/features/auth/LoginPage.test.tsx`.
`src/features/session/types.ts` führt `organizationName` unverändert weiter —
das Feld wird geladen, nur nicht mehr angezeigt.

**Änderungspfad.** Namen wieder anzeigen: ein Element in `AppShell.tsx`, etwa
als ruhige Zeile neben der Marke; der Schutzraum der Marke gibt den Abstand vor
(`schutzraum()` in `src/components/ui/markeRegeln.ts`) — Aufwand `klein`.
Kämen mehrere Praxen dazu, wäre die Kopfzeile ohnehin neu zu denken; das ist
dann Teil des eigenen Vorhabens aus ADR-003 — Aufwand `mittel` und nicht durch
diese Annahme vorweggenommen.
