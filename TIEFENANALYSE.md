# Tiefenanalyse PraxisSoftware: Module, Grunddesign, Datenbank, Features, Doku

Stand: Commit `3c5e72b` auf `main` (nach #310, 2026-10-25), abgelegt auf dem Analyse-Branch
`claude/architecture-code-analysis-v4wxd7`. **Strikt lesend erhoben:** Keine Code-, Test- oder
Doku-Datei wurde geändert; diese Datei ist die einzige neue. Sie hat keinen Rang nach
`PROJECT_PRINCIPLES.md` §21 und ist kein Auftrag. Sie ist die Eingabe für die Aufräumschritte 3 und 4
(`docs/development/ROADMAP.md` 7.16).

**Methode.**

- **Zahlen per Skript, nicht geschätzt.** Gezählt wurde nach denselben Regeln wie
  `scripts/aufraeumen.mjs` (Kategorien, Importziele, Zyklen).
- **DB-Zahlen aus dem Katalog.** Grundlage ist eine lokale Wegwerf-Postgres mit
  `supabase/tests/helpers/supabase-shim.sql` und `supabase/migrations/20261225000000_basis.sql`.
  Ausgewertet wurden `pg_proc`, `pg_policies`, `pg_trigger`, `pg_constraint` und `pg_views`, dazu
  Spaltendefaults und Indexausdrücke.
- **Lesen in Teilfragen.** 17 Agenten haben je eine Teilfrage gelesen und jede übernommene Zahl
  gegen Repository oder Katalog nachgezählt. Wo sie die Ausgangszahlen korrigiert haben, steht das
  im Abschnitt.
- **Gegenprüfung der Duplikate.** Die semantischen Duplikate (Abschnitt 2b) hat ein eigener
  Durchgang gegengeprüft, der überzeichnete Funde verwerfen sollte.
- **Messskripte nicht im Repository.** Die Skripte (`funcs.mjs`, `module.mjs`, `registry.mjs`,
  `domaenen.mjs` u. a.) lagen nur im Arbeitsordner der Sitzung, in dieser Datei `analyse/…`
  genannt. Wo ein Abschnitt sie nennt, ist das Verfahren so beschrieben, dass es sich nachbauen
  lässt.
- **Schätzungen sind gekennzeichnet.** Jede steht als „Schätzung“ da, mit der Herleitung in einem
  Halbsatz.

## 0. Kurzfassung

### 0.1 Die Ausgangszahlen des Auftrags, nachgemessen

| Auftrag nennt                                       | gemessen                           | Erklärung                                                                                                                                                                |
| --------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 44 Module                                           | **44**                             | bestätigt; **keines** hat eine `index.ts` (einzige `index.ts`: Unterordner `exercises/katalog/`)                                                                         |
| 32 Modulpaare mit Zyklen                            | **32**                             | bestätigt; zusätzlich: **36 der 44 Module bilden eine einzige starke Zusammenhangskomponente**                                                                           |
| appointments: 23 Dateien, von 26 Modulen importiert | **23 Dateien von 27 Modulen**      | 185 tiefe Importe von 28 Nutzern (27 Module + `src/routes`) auf 35 Dateien; 12 davon sind Seiten nur für `src/routes`                                                    |
| 209.000 Zeilen TS                                   | **204.959**                        | Programmzeilen `src/` + Edge Functions ohne Tests (`aufraeumen.mjs`); in Modulen 177.691 (86,7 %), Tests insgesamt 269.197                                               |
| ~1.200 DB-Funktionen                                | **1.206 Namen / 1.211 Funktionen** | `aufraeumen.mjs` zählt 1.204 Namen im Migrationstext; der Katalog hat zusätzlich 2 implizite Range-Konstruktoren (`app.timerange`, `app.timemultirange`, 5 Überladungen) |
| 151 Tabellen                                        | **151**                            | alle mit RLS; dazu 5 Views, 68 Policies, 91 Trigger, 366 Fremdschlüssel                                                                                                  |
| 54.000 Zeilen Doku                                  | **48.722 Markdown**                | 54.558 mit den übrigen Textdateien unter `docs/` (`fortschritt.json`, Kanvas-HTML und -JSON, `own-motion-praxis.html`)                                                   |
| 732 ANN                                             | **610 Einträge**                   | Nummern reichen bis ANN-731; 121 Nummern sind nie vergeben oder leer                                                                                                     |
| 230 BEF                                             | **126 Einträge**                   | 38 in `BEFUNDE.md` + 88 im Archiv; Nummernraum BEF-001 bis BEF-230; 88 Kennungen nur noch als Zitat, 16 nirgends                                                         |
| 3D-Radmodell 2.650 in 10.000 Zeilen Radflotte       | **2.650 / 12.118**                 | `fleet/bike3d/` exakt 2.650 (mit Tests); Flotte 12.118 TS, mit Unit-, DB- und E2E-Tests 21.851                                                                           |

### 0.2 Antworten in einem Satz je Sektion

1. **Module.** 14 Domänen (13 fachliche + `core`) sind fachlich tragfähig. Umgruppieren allein
   beseitigt aber **keinen** Zyklus: Es bleibt 1 SCC über alle Domänen mit 594 Querimporten. Erst
   drei Dinge zusammen machen den Domänengraphen azyklisch:
   - 171 Importe geteilter Hilfen nach `src/lib`/`src/components` (K),
   - eine Kompositionsschicht nur für Seiten (S, 382 Importe),
   - 17 umgedrehte Restimporte.

   `appointments` bekommt eine `index.ts` mit 15 Exporten. Von den 107 heute importierten Symbolen
   sind 24 gar keine Terminlogik. Die Zyklen mit appointments fallen von 13 auf 0, die Paare im
   ganzen Repo von 32 auf 14.

2. **Grunddesign vs. Anbau.** 88 Dateien über 500 Zeilen tragen 72.292 Zeilen, also 35 % des
   Programms. Die Ursache ist nicht Wiederholung im Kleinen, sondern ein fehlendes Grunddesign für
   sieben Dinge:
   - RPC-Vertrag,
   - Abfrage- und Aktionshaken,
   - Terminkontext als Strategie,
   - Antrags-/Ablaufautomat,
   - Formularbaustein,
   - Aktion mit Rückfrage,
   - Funktionsregister.

   Diese Bausteine decken **≥ 95 % der Fälle**, sparen aber nur ≈ 12.150 Zeilen (17 %) der großen
   Dateien. Den Rest löst eine Zerlegungsregel für Seiten, kein weiterer Baustein.

   Die zehn gegengeprüften semantischen Duplikate (2b) sparen konservativ ≈ 3.650 Zeilen. Ihr
   eigentlicher Wert sind die belegten Fehler, die aus abweichenden Kopien entstanden sind. Die
   Top 3:
   - die Client-RPC-Schicht mit 12 Wrappern und 45 Fehler-Mappern,
   - die Terminformulare, die einen vorhandenen Kern nachbauen,
   - die Antragsmechanik, dreimal in SQL und viermal in der Oberfläche.

3. **Datenbank.** Die 1.206 Funktionsnamen teilen sich so auf:

   | Klasse                                      | Namen |
   | ------------------------------------------- | ----: |
   | a) Trigger                                  |    84 |
   | b) Policy-Helfer (davon 16 nur in Policies) |    34 |
   | c) TS-Endpunkte                             |   544 |
   | d) intern                                   |   515 |
   | d) Cron                                     |    10 |
   | e) ohne Produktionsaufrufer                 |    19 |

   172 Funktionen (14 %) sind redundant oder generisch ersetzbar, etwa 2.400 Migrationszeilen. Der
   größte Posten sind 72 reine Rollentupel (70 `can_*` plus `is_staff`/`is_practice_account`) mit
   nur 10 verschiedenen Rollenmengen; mit 4 Aliasen entfallen 76 Funktionen.

   Von den vier Querschnittspflichten betroffen:
   - 126 Tabellen haben Personenbezug,
   - 81 liegen im Patienten-/Trainingsbereich,
   - alle vier Pflichten treffen 64 Tabellen.

   Eine neue Patiententabelle muss heute an 6 bis 23 Stellen eingetragen werden, davon sind nur 3
   bis 11 testerzwungen. Die Registry baut auf `retention_assignments` auf, die bereits alle 151
   Tabellen kennt, heute aber nichts steuert.

4. **Features.** Termine/Kalender (67.735 Code-Zeilen inkl. Tests und DB-Funktionsrümpfen) und Plattform (63.415)
   führen die Rangliste an. Überproportional zum Kerngeschäft sind Plattform-Teile, Radflotte (3D,
   Check-up-Fenster), Teamchat-Zusätze, Barometer, Ladestrom-Tourenrechnung und
   Ernährungs-Tracker. Der Praxisbetrieb aus Personal, Flotte und Teamchat hat **85.004 Zeilen ohne
   einen einzigen Kernablauf** und ist größer als Abrechnung und Dokumentation zusammen (66.897).
   Die neun konkreten Vereinfachungen M1–M9 sparen ≈ 28.500 Zeilen (5,5 %), dazu 989 Skript- und
   3.672 Doku-Zeilen.
5. **Doku.**
   - **BEF:** Sofort ersatzlos löschbar sind 73 Einträge plus `BEFUNDE-LOESUNGEN.md`, zusammen
     2.233 Zeilen. Zieht man 9 Entscheidungen vorher in ANN oder ADR um, sind es 97 Einträge und
     3.371 von 3.886 Befund-Zeilen. Wirklich offen sind 24 Befunde und 5 Reste.
   - **ANN:** Von 610 Einträgen sind 350 als eigener Eintrag entbehrlich, das sind 51 % der Bytes:
     45 veraltet, 103 rein technisch, 63 redundant, 139 Oberflächendetail. 120 Einträge
     widersprechen einer anderen Stelle, darunter 59 fachlich wichtige, die neu gefasst werden
     müssen.
   - **BEF erledigt:** 95 der 126 Einträge (8 in `BEFUNDE.md`, 87 im Archiv), dazu BEF-026 überholt
     und BEF-149 verworfen.
   - **Zielstruktur:** **9.894 Zeilen** in 6 Schritten. Die 208 Prüfpaket-Einträge und 101
     fachlich behaltene Regeln außerhalb des Prüfpakets bleiben als Kurzeinträge (5c, Nachtrag);
     DSGVO-, Abrechnungs- und Aufbewahrungswissen geht so nicht verloren.

### 0.3 Befunde, die nicht warten sollten

Die Analyse hat nebenbei Fehler im Gebauten gefunden. Sie sind nur gemeldet, nicht behoben
(read-only):

| #   | Befund                                                                                                                                                                                                                                                                                                                                                                             | Schwere                                          | Fundort                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ----------------------- |
| 1   | **Die Teillöschung unter Belegfrist lässt Art.-9-Daten des Trainings stehen.** `app.reduce_training_relationship` löscht 6 Tabellen. 17 Kind-Tabellen bleiben, darunter Screening, Assessments, Check-ins, Gewohnheiten und Übungspläne, bis die Belegfrist endet: 8 Jahre statt 3 ab Vertragsende, also bis zu etwa 5 Jahre zu lang. Das widerspricht ADR-021 Punkt 4 und ANN-183 | hoch, Pfad A                                     | 3b.6 L-L1               |
| 2   | **Manuelle Löschwege schreiben kein Löschjournal.** 12 RPCs löschen in 16 Tabellen ohne Journaleintrag. Nach einem Restore kämen diese Zeilen zurück (ADR-008 Punkt 8). Das ist breiter als BEF-198                                                                                                                                                                                | mittel, Pfad A                                   | 3b.6 L-J1               |
| 3   | **Für das Zusammenführen gibt es weder Vollständigkeitstest noch Ersatznachweis.** 26 FK-Spalten zeigen auf `patients`. Eine neue cascade-Tabelle fiele beim Merge still mit der Dublette. Nach LOG-EPIC-001 gibt es keine Aktion `patient.merged` mehr. Ein Restore von vor dem Merge brächte die Dublette ohne Nachweis zurück                                                   | mittel                                           | 3b.6 L-M1, L-J3         |
| 4   | **Ein Trainings-Nachtrag gilt bei 403 als gespeichert.** `addTrainingProtocolAddendum` (`training/api.ts` 585–601) prüft nur `error`. Der Server antwortet bei fehlender Rolle mit 403 und `null`, die Oberfläche meldet also Erfolg. Die 11 anderen Schreibwege derselben Datei prüfen das                                                                                        | mittel (Datenverlust ohne Hinweis)               | 2b Fund 1               |
| 5   | **Upload-Recht der Akte schwächer als die vier anderen Dateiarten.** `may_upload_patient_file_object` prüft weder `uploaded_by = auth.uid()` noch das 24-h-Fenster. Dazu sperren `confirm_fleet_photo_upload` und `confirm_message_attachment_upload`, ohne den Zustand unter der Sperre nachzuprüfen                                                                              | mittel, Prüffall fürs Sicherheitsreview (Pfad A) | 2b Fund 5               |
| 6   | **Namen in der Adresse.** `staff/StaffListPage.tsx` 99–111 und 193 schreiben den Suchbegriff (meist einen Namen) in URL und Rückweg. Das widerspricht `src/lib/rueckweg.ts` 22–25 („Keine Namen im Rückweg“, ADR-011)                                                                                                                                                              | gering–mittel (Datenschutz)                      | 2b, nicht in den Top 10 |
| 7   | **Zeitumstellung:** In der doppelten Stunde liegt „jetzt“ eine Stunde in der Zukunft (BEF-223), per SELECT reproduziert. Dazu kommen 55 SQL-Funktionen, die das Praxis-„Heute“ inline rechnen, obwohl es `app.training_today` gibt, und „gestern“ als jetzt − 24 h im Teamchat                                                                                                     | mittel, Pfad A                                   | BEF-223; 2b Fund 7      |
| 8   | **Annahmen setzen geltende ADRs außer Kraft (Rang 4 gegen Rang 2).** ANN-662 hebt die Benachrichtigungsgrenze aus ADR-024 Punkt 15 auf. ANN-541 widerspricht ADR-009 Punkt 15 (Steuerkennzeichen). ANN-291 löst ADR-023 Punkt 7 und 11 zwar nach Rang 1 (PP §4.10) auf, die ADR-Fassung ist aber nicht nachgezogen                                                                 | mittel (Rangfolge)                               | 5b                      |
| 9   | **Prüfpaket unvollständig.** 17 Einträge der Kategorie Datenschutz oder Recht tragen den Zusatz „Prüfpaket“ nicht, 11 Technik- oder Praxis-Einträge tragen ihn zu Unrecht. Der `grep` aus dem Kopf des Registers liefert der Datenschutzprüfung damit eine falsche Liste                                                                                                           | mittel (Go-live)                                 | 5c                      |
| 10  | **Kommentare und Annahmen versprechen Protokolle, die nicht entstehen.** `COMMENT ON` an `set_appointment_grid`, `list_revenue_by_staff`, `set_practice_target` und `waive_appointment_fee` nennt ein Audit, das die Funktion nicht schreibt. 25 und mehr ANN nennen Aktionen außerhalb der 27 aus `supabase/audit-aktionen.txt`                                                   | gering (Doku-Drift, aber Prüfgegenstand)         | 5b                      |
| 11  | **Neun public-RPCs ohne Produktionsaufrufer sind für `authenticated` ausführbar.** Sie sind über PostgREST ohne Oberfläche erreichbar und prüfen ihre Rechte selbst. Dazu kommt `void_offset_payments`                                                                                                                                                                             | gering (Angriffsfläche)                          | 3a e)                   |
| 12  | **BEF-229 ist unvollständig.** Es nennt 9 Funktionen und 4 Betriebswege. Es fehlen drei, die nur Tests rufen: `list_patient_treatment_evidence`, `app.mdr_released` und `app.appointment_window_options`; insgesamt haben 19 Funktionen keinen Produktionsaufrufer (3a e)). BEF-082 betrifft noch 15 statt 16 Funktionen                                                           | gering                                           | 5a                      |

## 1. Röntgenbild der 44 Module und Schnittplan

### 1a.1 Gegenprobe der Basiszahlen

| Prüfung                                                     | Ergebnis                                 | Herleitung                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 44 Module                                                   | bestätigt                                | `git ls-files src/features \| cut -d/ -f3 \| sort -u` ergibt 44                                                                                                                                                                                                                                                                   |
| LOC und Test-LOC je Modul                                   | bestätigt, 6 von 6 Stichproben identisch | `wc -l` über `git ls-files`: appointments 22.144/17.729, fleet 12.118/3.493, exercises 8.627/1.166, statistics 1.817/421, session 643/333, practice-settings 259/166                                                                                                                                                              |
| Dateien je Modul                                            | bestätigt                                | appointments 66 + 53 Testdateien = 119 Dateien in git, platform 80 + 52 = 132                                                                                                                                                                                                                                                     |
| 765 Querimporte, 226 gerichtete Kanten, 32 Paare            | bestätigt                                | eigener Parser (`verify_edges.mjs`, erfasst auch relative Pfade, `import()` und `vi.mock`) liefert dieselbe Kantenliste. 0 relative Querimporte, 0 dynamische, 0 `export *`                                                                                                                                                       |
| „kein Modul hat eine index.ts“                              | präzisiert                               | stimmt für alle 44 Modulwurzeln. Die einzige `index.ts` unter `src/features` ist `src/features/exercises/katalog/index.ts` (Unterordner)                                                                                                                                                                                          |
| LOC-Basis                                                   | präzisiert                               | gezählt werden nur `.ts/.tsx/.css`. `assessments` hat zusätzlich 13 JSON-Definitionen und 2 README (3.357 Zeilen) sowie 1 webp. Das ist Produktinhalt und steht nicht in den LOC                                                                                                                                                  |
| „tiefe Importe ein“ und „Nutzer ein“                        | präzisiert                               | die Spalten zählen `src/app`, `src/routes`, `src/components` und `src/lib` mit: session 148 Importe ein (138 davon aus Modulen), appointments 185 (172), documentation 70 (63), auth 36 (28). `src/components/ui/RoleBadge.tsx` und `roleLabels.ts` importieren `session/types`, also umgekehrt zur Schicht components → features |
| Typ-Importe                                                 | ergänzt                                  | mindestens 106 der 765 Querimporte (13,9 %) sind einzeilige reine `import type`. Das ist eine Untergrenze, weil mehrzeilige nicht erfasst sind. Sie zählen architektonisch, erzeugen aber keinen Laufzeitzyklus                                                                                                                   |
| 36 Module in einer SCC                                      | bestätigt                                | `module.json → sccs`                                                                                                                                                                                                                                                                                                              |
| appointments: 107 Symbole, `todayInTimeZone` mit 23 Nutzern | bestätigt                                | `apptsym_all.mjs`. Dazu: `fetchAssignableTherapists` und `formatLocalDate` haben je 9 Nutzer                                                                                                                                                                                                                                      |

Featurecode: 177.691 LOC in 747 Dateien, das sind 86,7 % der 204.959 Programmzeilen. In den Modulen liegen 105.463 Test-LOC.

### 1a.2 Röntgenbild aller 44 Module

Sortiert nach LOC. „Von außen importiert“ ist die Zahl der Moduldateien, die andere importieren (Kennzahl „interne Dateien“ von `aufraeumen.mjs`; bei appointments 35, davon 23 aus Modulen). „Ein“-Spalten schließen `src/app`, `src/routes`, `src/components` und `src/lib` ein. „Aus“ zählt nur Importe in andere Module. Zyklenpartner sind die gegenseitigen Paare (Importe in beide Richtungen). Die Zieldomäne steht in Abschnitt 1a.5.

| Modul                   | Zweck                                                                                                                                                                                                                           | LOC ohne Tests | Programmdateien | davon von außen importiert (alle Nutzer / nur Module) | Test-LOC | tiefe Importe ein | Nutzer ein | tiefe Importe aus | Zyklenpartner                                                                                                                              | Zieldomäne  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | --------------- | ----------------------------------------------------- | -------- | ----------------- | ---------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| `appointments`          | Kalender und Termine: Termin, Ereignis, Serie, Dauertermin anlegen/ändern/absagen, Zustände (ADR-018), Terminpanel mit Abschluss, Hausbesuchsablauf, Tag umplanen, Terminzettel                                                 | 22.144         | 66              | 35 / 23                                               | 17.729   | 185               | 28         | 89                | billing, treatment-bases, documentation, patients, datenschutz, tours, fleet, scheduling, open-points, staff, slot-search, today, waitlist | `calendar`  |
| `platform`              | Plattform der Patient:innen und Kund:innen unter `/p`: Termine, Übungsdurchführung, Tagebuch, Ernährung, Check-in, Nachrichten, Dokumente, Einwilligungen, Rechnungen, Einladung; nur Plattformprojektionen (ADR-023 P. 19, 26) | 20.137         | 80              | 11 / 6                                                | 11.956   | 17                | 4          | 51                | auth                                                                                                                                       | `portal`    |
| `fleet`                 | Radflotte: Depots, Räder, Schlüssel, Check-Up, Panne, Stellen am 3D-Rad, Werkstattblatt, Meldungen (FLT-EPIC-001)                                                                                                               | 12.118         | 43              | 14 / 5                                                | 3.493    | 19                | 6          | 34                | appointments                                                                                                                               | `fleet`     |
| `billing`               | Abrechnung: Leistungskatalog, Leistungen, Rechnungen, Abrechnungslauf, Zahlungen und offene Posten, Mahnung, Storno, Briefkopf, Nachsorgeabo, Trainingspaket (ADR-009)                                                          | 10.781         | 33              | 18 / 7                                                | 6.225    | 21                | 6          | 15                | appointments, treatment-bases                                                                                                              | `billing`   |
| `teamchat`              | Interner Teamchat wie Slack: Kanäle, Direkt- und Gruppennachrichten, Threads, Entwürfe, Gemerkt, Suche, Flottennachrichten (TEAM-001/002)                                                                                       | 9.234          | 49              | 13 / 2                                                | 3.775    | 13                | 4          | 28                | auth                                                                                                                                       | `teamchat`  |
| `exercises`             | Übungsbibliothek mit mitgeliefertem Katalog (`katalog/eintraege/*`), Varianten, Durchsicht (UEB-EPIC-001)                                                                                                                       | 8.627          | 34              | 14 / 11                                               | 1.166    | 29                | 2          | 7                 | exercise-plans                                                                                                                             | `exercise`  |
| `documentation`         | Behandlungsdokumentation: Verlaufseintrag, Entwurf und Festschreiben, Revision, Nachtrag, Verlauf, Textbausteine, Diktat; dazu der überall genutzte `Textverlustschutz` (ADR-016)                                               | 7.988          | 29              | 14 / 7                                                | 7.392    | 70                | 26         | 47                | appointments, assessments, auth, checkins, offline-documentation, patients                                                                 | `clinical`  |
| `assessments`           | Befund und Fragebögen: Instrumente, Bausteine je Körperregion, Scores, Körperschema, Messreihen; dazu 13 JSON-Definitionen und 2 README (3.357 Zeilen, nicht in LOC) (FRB-002b)                                                 | 6.094          | 25              | 15 / 12                                               | 4.618    | 25                | 5          | 12                | documentation                                                                                                                              | `clinical`  |
| `treatment-bases`       | Behandlungsgrundlagen (Verordnung, Selbstzahler; Kontingent, Freigabe, Termine übertragen) und Verordnerkartei (ADR-020)                                                                                                        | 5.601          | 23              | 10 / 5                                                | 4.406    | 25                | 6          | 39                | appointments, billing, patients                                                                                                            | `patients`  |
| `exercise-plans`        | Übungspläne je Verhältnis (`service_area` therapy/training), Vorlagen, Fassungen, Planblatt, Wiedervorlage (UEB-EPIC-002)                                                                                                       | 5.184          | 29              | 9 / 6                                                 | 3.264    | 14                | 6          | 32                | exercises                                                                                                                                  | `exercise`  |
| `training`              | Trainingsverhältnis: Kund:innen, Trainingstermine, Protokoll, Einwilligung, Profil, Verträge, Screening (TRN-EPIC-001, ADR-021)                                                                                                 | 5.118          | 18              | 8 / 2                                                 | 1.574    | 8                 | 3          | 35                | nutrition                                                                                                                                  | `training`  |
| `files`                 | Dateiablage der Akte (zweiphasiger Upload, Fotos, Verordnungsscan, Herausgabe) und generische Kamera-/Bildbereinigung (ADR-017)                                                                                                 | 4.933          | 17              | 15 / 15                                               | 3.213    | 51                | 13         | 7                 | patients                                                                                                                                   | `patients`  |
| `staff`                 | Mitarbeiterverwaltung: Stamm- und Privatdaten, Zugang einrichten, Einsatz, Arbeitszeitvorlagen (STAFF-001)                                                                                                                      | 4.496          | 16              | 6 / 1                                                 | 2.986    | 9                 | 4          | 31                | appointments                                                                                                                               | `workforce` |
| `today`                 | „Mein Tag“: Tagesliste des Hausbesuchstags mit Adresse, Rufnummer, Zugang (`list_day_plan`), Zeitstrahl, Wochenleiste, Druck (UX-001)                                                                                           | 4.458          | 18              | 4 / 3                                                 | 5.527    | 9                 | 6          | 46                | appointments, feedback, tours                                                                                                              | `calendar`  |
| `patients`              | Patientenkartei (Stammdaten, Suche, Neuaufnahme, Zusammenführen) und Rahmen der Akte (`PatientRecordLayout`, `akte.ts`)                                                                                                         | 4.371          | 19              | 12 / 6                                                | 3.864    | 49                | 15         | 29                | appointments, datenschutz, documentation, files, open-points, treatment-bases                                                              | `patients`  |
| `nutrition`             | Ernährungsberatung: Profil, Zielwerte, Lebensmittel (BLS, OFF), Tagebuch, Beratungstermin (ADR-027)                                                                                                                             | 3.548          | 16              | 12 / 9                                                | 727      | 24                | 3          | 10                | training                                                                                                                                   | `nutrition` |
| `auth`                  | Anmeldung (Passkey, App-PIN, Einlöselink), `SessionProvider`, Sitzungssperre, Freigabe ohne Netz (ADR-025)                                                                                                                      | 3.515          | 25              | 15 / 11                                               | 2.610    | 36                | 9          | 4                 | documentation, teamchat, platform                                                                                                          | `core`      |
| `open-points`           | „Offene Punkte“ und Anrufliste: sammelt Erstaufnahmen, zu erfassende Verordnungen, Anträge, Widerrufe, Aufgaben, Erinnerungen                                                                                                   | 3.217          | 30              | 13 / 11                                               | 1.560    | 19                | 8          | 38                | appointments, messages, patients                                                                                                           | `workplace` |
| `reimbursements`        | Erstattungen an Beschäftigte (Ladestrom, Einkauf mit Beleg): beantragen, entscheiden, auszahlen (ERS-001)                                                                                                                       | 2.919          | 13              | 10 / 5                                                | 1.388    | 14                | 4          | 17                | –                                                                                                                                          | `workforce` |
| `tours`                 | Touren: Tagesroute auf der Karte, Fahrzeiten, Fahrpuffer, Startort/Garage, Fahrzeitfaktor (ADR-019, MAP-006)                                                                                                                    | 2.868          | 17              | 8 / 7                                                 | 2.615    | 18                | 5          | 8                 | appointments, today                                                                                                                        | `calendar`  |
| `vacation`              | Urlaub: Anspruch, beantragen, entscheiden, betroffene Termine (URL-001)                                                                                                                                                         | 2.400          | 12              | 8 / 3                                                 | 1.400    | 13                | 5          | 21                | –                                                                                                                                          | `workforce` |
| `working-time`          | Arbeitszeitänderung beantragen und entscheiden (AZ-001)                                                                                                                                                                         | 2.284          | 10              | 6 / 3                                                 | 1.047    | 11                | 5          | 12                | scheduling                                                                                                                                 | `workforce` |
| `platform-access`       | Plattformzugang aus Praxissicht: Einladung/QR, Zustand, Vertretungen, Benachrichtigungen, Einsicht der Inhaber:in (ADR-023 P. 6–11)                                                                                             | 2.051          | 9               | 6 / 4                                                 | 1.154    | 9                 | 5          | 9                 | –                                                                                                                                          | `portal`    |
| `datenschutz`           | Betroffenenrechte (Auskunft zu Akte und Training) und Aufnahmeblätter (Anmeldebogen, Patienteninformation, Praxisabsender) (OPS-006)                                                                                            | 2.035          | 14              | 9 / 6                                                 | 1.323    | 12                | 6          | 14                | appointments, patients                                                                                                                     | `privacy`   |
| `offline-documentation` | Doku-Entwürfe ohne Netz auf dem Gerät, Abgleich `sync_offline_treatment_note`, Diensttelefon, Abmeldewache (ADR-024 P. 7, 8)                                                                                                    | 1.874          | 14              | 9 / 3                                                 | 1.037    | 12                | 4          | 11                | documentation                                                                                                                              | `clinical`  |
| `timeaccount`           | Zeitkonto: Überstunden und Freizeitausgleich eintragen, zurückweisen (ZK-001)                                                                                                                                                   | 1.850          | 7               | 5 / 2                                                 | 943      | 8                 | 3          | 12                | –                                                                                                                                          | `workforce` |
| `statistics`            | Kennzahlen, Zielwerte, Umsatz je Monat/Leistung/Person (`get_practice_statistics`: Server nur owner; Route auch für Beschäftigte mit Umsatzbeteiligung) (STA-001/002)                                                           | 1.817          | 6               | 1 / 0                                                 | 421      | 1                 | 1          | 3                 | –                                                                                                                                          | `billing`   |
| `therapy-reports`       | Therapiebericht an die Verordner:in: Entwurf, eingefrorener Snapshot, Druck (DOK-005)                                                                                                                                           | 1.713          | 6               | 5 / 3                                                 | 801      | 5                 | 2          | 8                 | –                                                                                                                                          | `clinical`  |
| `preview`               | Vorschau-Protokoll und `VorschauProvider` für nicht angebundene Bereiche; `simuliere` hat keinen Produktionsaufrufer mehr                                                                                                       | 1.663          | 10              | 3 / 1                                                 | 644      | 3                 | 2          | 1                 | –                                                                                                                                          | `core`      |
| `scheduling`            | Praxisraster und Arbeitszeiten je Person (CAL-005)                                                                                                                                                                              | 1.633          | 4               | 2 / 2                                                 | 1.288    | 7                 | 4          | 4                 | appointments, working-time                                                                                                                 | `calendar`  |
| `messages`              | Rückfragen von der Plattform in der Praxis: lesen, beantworten, Anhänge, „In die Akte“ (KOM-002/003)                                                                                                                            | 1.540          | 8               | 5 / 4                                                 | 627      | 11                | 7          | 4                 | open-points                                                                                                                                | `portal`    |
| `waitlist`              | Warteliste mit Zeitfenstern und organisatorischem Grund, Treffer für freie Plätze (PRX-001)                                                                                                                                     | 1.331          | 8               | 5 / 3                                                 | 387      | 10                | 4          | 14                | appointments                                                                                                                               | `calendar`  |
| `checkins`              | Check-in mit Takt und Gewohnheiten zwischen den Terminen, Praxisseite, beide Verhältnisse (TRK-002)                                                                                                                             | 1.283          | 5               | 1 / 1                                                 | 529      | 2                 | 2          | 1                 | documentation                                                                                                                              | `exercise`  |
| `feedback`              | Barometer und Rückmeldung der Beschäftigten an die Praxisleitung (ORG-006, §20.2)                                                                                                                                               | 1.172          | 9               | 5 / 3                                                 | 432      | 5                 | 3          | 8                 | organisation, today                                                                                                                        | `workplace` |
| `retention`             | Aufbewahrungsplan, Löschsperren, Löschläufe lesen, nur owner (LOE-002b, ADR-008)                                                                                                                                                | 1.166          | 3               | 2 / 1                                                 | 582      | 2                 | 2          | 3                 | –                                                                                                                                          | `privacy`   |
| `audit`                 | Auditlog lesen über `list_audit_events`, nur owner (ADR-010)                                                                                                                                                                    | 805            | 3               | 2 / 1                                                 | 455      | 2                 | 2          | 0                 | –                                                                                                                                          | `privacy`   |
| `session`               | `CurrentUser`, Rollen und `can*`-Prädikate (`types.ts`), `useCurrentUser`                                                                                                                                                       | 643            | 2               | 2 / 2                                                 | 333      | 148               | 40         | 0                 | –                                                                                                                                          | `core`      |
| `slot-search`           | Terminsuche als Vorschlagsliste (`find_free_slots`, `rate_slot_travel`) (PRX-003)                                                                                                                                               | 630            | 2               | 2 / 1                                                 | 222      | 2                 | 2          | 8                 | appointments                                                                                                                               | `calendar`  |
| `account`               | „Mein Konto“: Passkey und PIN verwalten, Diensttelefon, Profilbild im Teamchat                                                                                                                                                  | 524            | 2               | 1 / 0                                                 | 789      | 1                 | 1          | 6                 | –                                                                                                                                          | `workplace` |
| `territories`           | Gebietstage (PLZ-Listen je Wochentag) als Hinweis bei der Terminvergabe (PRX-002)                                                                                                                                               | 518            | 3               | 2 / 1                                                 | 188      | 4                 | 2          | 1                 | –                                                                                                                                          | `calendar`  |
| `training-offers`       | Trainingsangebot aus der Akte, Übergabe als dokumentierte Kopie (ADR-021 P. 7, KND-EPIC-001)                                                                                                                                    | 496            | 2               | 1 / 1                                                 | 151      | 1                 | 1          | 0                 | –                                                                                                                                          | `patients`  |
| `intake`                | Einstieg und Seite der geführten Erstaufnahme am Termin (K10)                                                                                                                                                                   | 388            | 3               | 3 / 2                                                 | 296      | 3                 | 3          | 15                | –                                                                                                                                          | `patients`  |
| `organisation`          | „Eingang“ Organisation: offene Anträge, Räder, eigene Anträge, neuer Antrag (ORG-004)                                                                                                                                           | 265            | 4               | 3 / 1                                                 | 160      | 5                 | 2          | 24                | feedback                                                                                                                                   | `workplace` |
| `practice-settings`     | Praxiseinstellungen (owner): bündelt Formulare aus scheduling, documentation, tours, reimbursements, platform-access (ORG-002)                                                                                                  | 259            | 1               | 1 / 0                                                 | 166      | 1                 | 1          | 7                 | –                                                                                                                                          | `workplace` |

**Was die Tabelle zeigt**

- **Größe ist ungleich verteilt.** Die 5 größten Module haben 74.414 LOC (41,9 %), die 10 größten 107.908 (60,7 %). 20 Module unter 2.000 LOC kommen zusammen auf 21.570 (12,1 %), 9 Module unter 1.000 LOC auf 4.528.
- **Eingangsnaben:**
  - session: 40 Nutzer, 148 Importe; `session/types.ts` hat 513 Zeilen und 39 exportierte `can*`/`is*`-Prädikate.
  - appointments: 28 Nutzer, 185 Importe.
  - documentation: 26 Nutzer, 70 Importe; `Textverlustschutz` wird in 20 Modulen genutzt.
  - patients: 15 Nutzer, 49 Importe; files: 13 Nutzer, 51 Importe.
- **Ausgangsnaben (Kompositionen):** appointments importiert aus 17 Modulen (89 Importe), open-points aus 15 (38), patients aus 12 (29), documentation aus 10 (47), today aus 9 (46), training aus 9 (35).
- **Paare:** appointments steckt allein in 13 der 32 gegenseitigen Paare. 15 Module haben gar kein Paar.
- **Befund `preview`:**
  - `VORSCHAUBEREICHE` (`src/features/preview/trennung.test.ts:11`) enthält nur noch `src/features/preview` selbst.
  - `useVorschau().simuliere` wird nur in `ProtokollPage.test.tsx` aufgerufen. Das Protokoll unter `/vorschau/protokoll` bleibt im Betrieb also leer.
  - `identitaet.ts` (54 Zeilen), `SignaturFeld.tsx` (153) und `ui.tsx` (128) haben keinen Importeur außerhalb der Tests, zusammen 335 LOC.
  - Einzige Fremdnutzung: `open-points/CallListPage.tsx` importiert `preview/format#formatDatum`.
  - Damit ist `preview` ein Kandidat für den Rückbau, nicht für die Konsolidierung.

### 1a.3 Woran die Zyklen hängen: drei Ursachenklassen

| Szenario                                                                    | Querimporte übrig | Modulkanten | gegenseitige Paare |
| --------------------------------------------------------------------------- | ----------------- | ----------- | ------------------ |
| Ist-Zustand                                                                 | 765               | 226         | 32                 |
| K: geteilte Hilfen aus den Fachmodulen nach `src/lib` bzw. `src/components` | 594               | 186         | 26                 |
| S: Seiten in eine Kompositionsschicht                                       | 383               | 136         | 18                 |
| S + K                                                                       | 290               | 111         | 14                 |

**K – geteilter Kern in Fachmodulen** (`kernel.mjs`): 171 von 765 Importen (22,4 %) holen nur Hilfen, die fachlich nichts mit ihrem Modul zu tun haben:

| Hilfe                                                                                              | Importe |
| -------------------------------------------------------------------------------------------------- | ------- |
| Zeitfunktionen aus `appointments/api` (`todayInTimeZone`, `formatLocal*`, `dayKey`, `zeitpunktIn`) | 52      |
| `documentation/Textverlustschutz`                                                                  | 49      |
| `appointments/calendar` (Datumsrechnung `tagePlus`, `monatsBeginn` usw.)                           | 19      |
| `files/{dokumentarten, metadaten, Kameradialog, Dateiansicht, farbe, kamera}`                      | 32      |
| `working-time/format` und `vacation/zeitraum`                                                      | 8       |
| `documentation/aufnahme` und `documentation/format`                                                | 5       |
| Rest                                                                                               | 6       |

Damit lösen sich 6 Paare auf: appointments~~billing, appointments~~datenschutz, assessments~~documentation, checkins~~documentation, documentation~~patients, scheduling~~working-time. Zum Vergleich: `src/lib/datum.ts` hat heute 17 Zeilen und einen einzigen Export. 54 Programmdateien unter `src/features` rufen `Intl.DateTimeFormat` direkt auf.

**S – Seiten als Komposition** (`seiten.mjs`): 125 Seitendateien (`*Page`, `*Seite`, `*Layout`, importiert aus `src/routes` oder `src/app`) sind Quelle von 382 Querimporten (49,9 %). Kein Featuremodul importiert eine dieser Seiten (0 Treffer). Sie lassen sich also anheben, ohne dass neue Kanten entstehen. Die größten Quellen:

| Seite                                       | Querimporte |
| ------------------------------------------- | ----------- |
| `patients/PatientMasterDataPage`            | 16          |
| `today/MyDayPage`                           | 15          |
| `treatment-bases/PatientTreatmentBasesPage` | 12          |
| `organisation/EingangPage`                  | 10          |
| `training/TrainingClientPage`               | 10          |
| `intake/ErstaufnahmePage`                   | 9           |
| `documentation/PatientDokuPage`             | 8           |

**F – fehlplatzierte Dateien**

- `open-points/intake-api.ts` und `useOffeneErstaufnahme.ts` werden 8-mal importiert, aus intake, patients und today.
- `fetchAssignableTherapists` (9 Module) und `fetchLocations` liegen in `appointments/api.ts`, gehören aber zu Mitarbeiter- bzw. Standortdaten.
- Den Praxisabsender gibt es doppelt: `datenschutz/absender.ts`, `AbsenderBlock`, `useAbsender` (4 Importe aus appointments, `get_practice_sender`) neben `billing/Briefkopf.tsx`.
- `auth/SessionProvider.tsx` importiert `teamchat/speicher#teamchatLeeren` und `documentation/uebernahme#uebergabenLeeren`.
- `auth/linkEinloesen.ts` importiert `platform/einladung#EINLADUNG_PFAD`.
- `open-points/Arbeitszeile.tsx` (eine UI-Zeile) wird aus messages importiert, `open-points/tasks-api.ts` aus teamchat.

### 1a.4 Konsolidierung: Iterationen und Messung

**Methode** (`domaenen.mjs` auf `module.json → edges`):

- (a) wie viele der 32 Paare domänenintern werden,
- (b) Zahl der Domänenkanten und der Importe zwischen Domänen,
- (c) starke Zusammenhangskomponenten (Tarjan) auf Domänenebene.
- Dazu die **exakte minimale Rückkantenmenge**: dynamische Programmierung über alle Teilmengen, gewichtete lineare Anordnung, Gewicht = Zahl der Importanweisungen. Das ist die kleinste Zahl von Importen, die umgedreht oder verlegt werden muss, damit der Domänengraph azyklisch wird.

| Variante | Unterschied                                                                                                                                                                                          | Domänen inkl. core | Paare intern (von 32) | Domänenkanten | Importe quer | SCC (Domänen)       | min. Rückkanten-Importe: roh / K / S / S+K |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | --------------------- | ------------- | ------------ | ------------------- | ------------------------------------------ |
| V1       | fachlich naiv: core (session, auth, account, preview), compliance (audit, retention, datenschutz), Kalender ohne Tag, homevisits (tours, today), portal (platform, platform-access, messages), inbox | 14                 | 11                    | 88            | 637          | 14                  | 103 / 71 / 36 / 25                         |
| V2       | homevisits in den Kalender; datenschutz und retention in die Akte; audit nach core; account nach organisation                                                                                        | 12                 | 14                    | 70            | 582          | 12                  | 90 / 58 / 28 / 17                          |
| V3a      | wie V2, portal geteilt in platform und engagement (platform-access, messages)                                                                                                                        | 13                 | 14                    | 73            | 586          | 13                  | 87 / 51 / 28 / 17                          |
| V3b      | wie V3a, today nach oben in workday                                                                                                                                                                  | 13                 | 13                    | 74            | 621          | 13                  | 84 / 48 / 29 / 18                          |
| V3c      | wie V3a, clinical in die Akte (Domäne mit 36.659 LOC)                                                                                                                                                | 12                 | 15                    | 59            | 566          | 12                  | 88 / 63 / 35 / 27                          |
| V3d      | wie V3a, „visit“ = Kalender + documentation + offline-documentation (43.444 LOC)                                                                                                                     | 12                 | 14                    | 61            | 549          | 12                  | 73 / 42 / 23 / 14                          |
| V4       | privacy, nutrition und engagement je eigene Domäne                                                                                                                                                   | 15                 | 12                    | 86            | 598          | 15                  | 90 / 55 / 28 / 17                          |
| V4b      | wie V4, nutrition in training                                                                                                                                                                        | 14                 | 13                    | 81            | 596          | 14                  | 90 / 54 / 28 / 17                          |
| **Ziel** | wie V4, portal zusammengelegt (platform, platform-access, messages)                                                                                                                                  | **14**             | **12**                | **83**        | **594**      | 14 (S: 13, S+K: 13) | **90 / 58 / 28 / 17**                      |

**Ergebnis: Umgruppieren allein beseitigt die Zyklen nicht.** Jede getestete fachlich vertretbare Gruppierung bildet eine einzige SCC über alle Domänen. Zwischen 73 und 103 Importe (9,5–13,5 %) müssten umgedreht werden. Ursache sind Naben, die zugleich Basis und Komposition sind: `appointments/api.ts`, `TerminPanel`, `PatientRecordLayout`, `MyDayPage`, `open-points`. Erst K und S zusammen senken den Rest auf 17 Importe auf 11 Domänenkanten.

**Warum „Ziel“ und nicht die Variante mit den besten Zahlen**

- **V3d und V3c** erzeugen neue Monolithen: `visit` hätte 24,4 % des Featurecodes, `record` 20,6 %. Das wiederholt das Problem von appointments.
- **V2, V3a und V3c** legen datenschutz in die Akte. Dann importiert die Therapieseite die Trainingsseite (`datenschutz/TrainingAuskunftPage` → `training/api#getTrainingClient`). Das widerspricht ADR-021 Punkt 3 und 6 auf Modulebene. Die Auskunft betrifft beide Verhältnisse und gehört deshalb über beide.
- **V4b** legt nutrition in training. Nach ADR-027 Punkt 1 hängt ein Ernährungsprofil aber an einer Akte **oder** einem Trainingsverhältnis (`nutrition_profiles`: CHECK `relationship_kind` treatment XOR training). ADR-021 Punkt 11 nimmt es vom Büro-Lesen aus. Die eigene Domäne kostet 1 Paar (nutrition~training, je 1 Import).
- **portal zusammenlegen** kostet roh nichts (90 wie V4) und spart eine Domäne. ADR-023 regelt beide Seiten. `trennung.test.ts` bleibt auf den Unterordner der App beschränkt.

**ADR-021 bleibt gewahrt**

- `training` ist eine eigene Domäne. Sie importiert keinen Datenzugriff aus `patients` oder `clinical`, nur 5 Kernimporte von `Textverlustschutz`.
- Die gemeinsam genutzten Domänen trennen die Verhältnisse in der Datenbank:
  - Spalte `relationship_kind` (treatment/training) in 7 Tabellen: checkins, checkin_schedules, habits, nutrition_profiles, platform_accesses, platform_appointment_requests, platform_messages.
  - Spalte `service_area` (therapy/training) in 6 Tabellen: exercise_plans, billable_services, invoices, invoice_items, invoice_number_series, service_catalog_items.
  - XOR-CHECK zwischen `patient_id` und `training_relationship_id` geprüft für exercise_plans, checkins, checkin_schedules, habits, nutrition_profiles, platform_accesses.
- **Nebenbefund:** Für dasselbe Verhältnis gibt es zwei Bezeichnungen, `treatment` und `therapy`. ADR-021 Punkt 2 legt `therapy` fest.

### 1a.5 Zielbild: 13 Fachdomänen + core

Die Ebenen folgen einer optimalen Ordnung von unten nach oben. Die Ordnung ist nicht eindeutig. „Rück“ zählt Importe aus der Domäne in eine höhere Domäne.

| Ebene | Domäne      | Module                                                                     | LOC    | Dateien | Test-LOC | Paare intern | Importe intern | Importe ein | Importe aus | davon rück |
| ----- | ----------- | -------------------------------------------------------------------------- | ------ | ------- | -------- | ------------ | -------------- | ----------- | ----------- | ---------- |
| 0     | `core`      | session, auth, preview                                                     | 5.821  | 37      | 3.587    | 0            | 1              | 166         | 4           | 4          |
| 1     | `patients`  | patients, treatment-bases, files, intake, training-offers                  | 15.789 | 64      | 11.930   | 2            | 23             | 92          | 67          | 43         |
| 2     | `privacy`   | datenschutz, retention, audit                                              | 4.006  | 20      | 2.360    | 0            | 2              | 9           | 15          | 4          |
| 3     | `calendar`  | appointments, scheduling, slot-search, waitlist, territories, tours, today | 33.582 | 118     | 27.956   | 6            | 79             | 137         | 91          | 31         |
| 4     | `clinical`  | documentation, offline-documentation, assessments, therapy-reports         | 17.669 | 74      | 13.848   | 2            | 19             | 72          | 59          | 3          |
| 5     | `fleet`     | fleet                                                                      | 12.118 | 43      | 3.493    | 0            | 0              | 10          | 34          | 0          |
| 6     | `billing`   | billing, statistics                                                        | 12.598 | 39      | 6.646    | 0            | 0              | 10          | 18          | 0          |
| 7     | `workforce` | staff, vacation, working-time, timeaccount, reimbursements                 | 13.949 | 58      | 7.764    | 0            | 4              | 30          | 89          | 0          |
| 8     | `nutrition` | nutrition                                                                  | 3.548  | 16      | 727      | 0            | 0              | 20          | 10          | 1          |
| 9     | `exercise`  | exercises, exercise-plans, checkins                                        | 15.094 | 68      | 4.959    | 1            | 28             | 11          | 12          | 2          |
| 10    | `portal`    | platform, platform-access, messages                                        | 23.728 | 97      | 13.737   | 0            | 5              | 20          | 59          | 1          |
| 11    | `training`  | training                                                                   | 5.118  | 18      | 1.574    | 0            | 0              | 2           | 35          | 0          |
| 12    | `teamchat`  | teamchat                                                                   | 9.234  | 49      | 3.775    | 0            | 0              | 2           | 28          | 1          |
| 13    | `workplace` | open-points, organisation, feedback, practice-settings, account            | 5.437  | 46      | 3.107    | 1            | 10             | 13          | 73          | 0          |

Summen: 177.691 LOC, 12 von 32 Paaren intern, 171 Importe werden domänenintern, 594 bleiben quer auf 83 Domänenkanten.

**Rückkanten im Ist-Zustand: 90 Importe auf 23 Domänenkanten**

| Rückkante (tiefere importiert höhere)    | Importe | Modulkanten                                                                                                        |
| ---------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------ |
| calendar → clinical                      | 14      | appointments>documentation 11, scheduling>documentation 1, today>documentation 1, waitlist>documentation 1         |
| patients → calendar                      | 14      | patients>appointments 7, treatment-bases>appointments 6, patients>today 1                                          |
| patients → clinical                      | 11      | intake>assessments 4, treatment-bases>therapy-reports 3, patients>documentation 2, treatment-bases>documentation 2 |
| calendar → workforce                     | 7       | appointments>staff 3, today>timeaccount 3, scheduling>working-time 1                                               |
| patients → workplace                     | 6       | intake>open-points 4, patients>open-points 2                                                                       |
| patients → billing                       | 6       | patients>billing 4, treatment-bases>billing 2                                                                      |
| calendar → workplace                     | 5       | today>open-points 3, appointments>open-points 1, today>feedback 1                                                  |
| calendar → fleet                         | 3       | appointments>fleet 2, today>fleet 1                                                                                |
| patients → privacy                       | 3       | patients>datenschutz 2, intake>datenschutz 1                                                                       |
| patients → portal                        | 3       | patients>platform-access 2, patients>messages 1                                                                    |
| core → portal                            | 2       | auth>platform 2                                                                                                    |
| calendar → billing                       | 2       | appointments>billing 2                                                                                             |
| privacy → portal                         | 2       | datenschutz>messages 2                                                                                             |
| clinical → exercise                      | 2       | documentation>exercise-plans 1, documentation>checkins 1                                                           |
| exercise → portal                        | 2       | exercise-plans>platform-access 2                                                                                   |
| core → clinical, core → teamchat         | 1 + 1   | auth>documentation 1, auth>teamchat 1                                                                              |
| privacy → calendar, privacy → training   | 1 + 1   | datenschutz>appointments 1, datenschutz>training 1                                                                 |
| clinical → portal                        | 1       | documentation>messages 1                                                                                           |
| portal → workplace, teamchat → workplace | 1 + 1   | messages>open-points 1, teamchat>open-points 1                                                                     |
| nutrition → training                     | 1       | nutrition>training 1                                                                                               |

**Rest nach S + K: 17 Importe auf 11 Domänenkanten.** Sind diese behoben, ist der Domänengraph azyklisch. Das folgt aus der Konstruktion der Rückkantenmenge. `training` liegt schon nach S in keinem Zyklus mehr.

| Rückkante                        | Importe | Datei → Ziel                                                                                                                                               | Abhilfe                                                                                               |
| -------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| patients → workplace             | 3       | `intake/ErstaufnahmeEinstieg.tsx` und `intake/stand.ts` → `open-points/intake-api`, `useOffeneErstaufnahme`                                                | beide Dateien nach `patients/intake` verlegen                                                         |
| calendar → clinical              | 3       | `appointments/TerminAktionen.tsx` → `TreatmentNoteSection`; `appointments/TerminPanel.tsx` → `VERLAUF_ANKER`; `today/api.ts` → `documentationStatusSchema` | Doku-Abschnitt als Slot über die Seite einsetzen; Status und Anker als Vertrag unterhalb von clinical |
| patients → calendar              | 2       | `patients/AdresseVerorten.tsx` → `aktualisiereHausbesuchAdressen`, `fetchVeralteteHausbesuche`; `PatientMasterDataFields.tsx` → `AssignableTherapist`      | Adress-RPC zu patients; zuweisbare Therapeut:innen in die Praxisstammdaten von core                   |
| calendar → workforce             | 2       | `today/NochOffen.tsx` → `timeaccount` (`RejectedTimeOff`, `TIME_ACCOUNT_HOME`)                                                                             | Hinweis über `MyDayPage` einsetzen                                                                    |
| core → clinical, core → teamchat | 1 + 1   | `auth/SessionProvider.tsx` → `uebergabenLeeren`, `teamchatLeeren`                                                                                          | Abmelde-Registry in core, in die sich die Domänen eintragen                                           |
| core → portal                    | 1       | `auth/linkEinloesen.ts` → `platform/einladung#EINLADUNG_PFAD`                                                                                              | Pfadkonstante nach core                                                                               |
| patients → clinical              | 1       | `intake/stand.ts` → `assessments/api` (Typ `Erhebung`)                                                                                                     | Typvertrag nach unten                                                                                 |
| portal → workplace               | 1       | `messages/RueckfrageAnhaenge.tsx` → `open-points/Arbeitszeile`                                                                                             | Zeile nach `src/components`                                                                           |
| calendar → workplace             | 1       | `today/Tagesliste.tsx` → `open-points/intake-api#openItemsText`                                                                                            | wandert mit intake-api                                                                                |
| patients → billing               | 1       | `treatment-bases/posNummern.ts` → `billing/api#fetchKatalogPositionen`, `fetchKatalogVersionen`                                                            | eine Richtung des Paars billing~treatment-bases auflösen (Katalog-Lesevertrag)                        |

### 1a.6 Domänen im Einzelnen

#### `core` – session, auth, preview (5.821 LOC, 37 Dateien)

- **Begründung:** `session/types` ist mit 145 Importen aus 16 Quellen der meistgenutzte Vertrag. Anmeldung, Sitzung und Sperre gelten für Praxis- und Plattformkonten gleich (ADR-023 P. 17, ADR-025). `audit` steht nicht hier: es ist eine owner-Leseseite nach ADR-010 und gehört zu privacy.
- **Rückkanten:** 4 (auth>platform 2, auth>documentation 1, auth>teamchat 1).
- **Zuerst:** session und auth zusammenlegen. Zwischen beiden gibt es heute 0 Importe, es ist also nur eine Ordnerverschiebung. `preview` prüfen und zurückbauen statt einschmelzen (siehe Befund in 1a.2).
- **Zusätzlich:** ein schmales Lesemodell der Praxisstammdaten. Standorte (`fetchLocations`), zuweisbare Therapeut:innen (`fetchAssignableTherapists`, 9 Nutzer) und Praxisabsender (`get_practice_sender`) wandern aus appointments, datenschutz und billing hierher.
- **Schnittstelle:**
  1. `useCurrentUser`/`CurrentUser` mit Rollen
  2. Fähigkeiten (`can*`, `is*`; 39 Prädikate)
  3. `useSession`/`SessionProvider`
  4. `abmelden()` mit Registrierung von Aufräumhaken
  5. Sitzungssperre (`useSperrsicherung`, `Sitzungssperre`, `freigabeOhneNetz`)
  6. Passkey und PIN einrichten und verwalten
  7. Einlösepfade (`ZUGANG_PFAD`, `EINLADUNG_PFAD`, `loeseLinkEin`)
  8. Praxisstammdaten lesen (Standorte, Therapeut:innen, Absender)

#### `patients` – patients, treatment-bases, files, intake, training-offers (15.789 LOC, 64 Dateien)

- **Begründung:**
  - Das Behandlungsverhältnis und seine Stammdaten: Nach ADR-021 Punkt 2 _ist_ `patients` das Behandlungsverhältnis.
  - Dazu die Grundlagen (ADR-020), die Dateien der Akte (ADR-017) und die Erstaufnahme (K10).
  - Das Trainingsangebot ist die Therapieseite der Übergabe (ADR-021 P. 7); sein einziger Nutzer ist `patients`.
- **Intern:** 2 Paare (files~~patients, patients~~treatment-bases), 23 Importe.
- **Rückkanten:** mit 43 die meisten, weil die Akte Termine, Doku, Rechnungen und Plattform zeigt. Nach S + K bleiben 7.
- **Zuerst:**
  1. treatment-bases mit files: 10 Importe (Verordnungsscan, `ordneScanZu`, `useDateien`).
  2. intake übernimmt `open-points/intake-api.ts` und `useOffeneErstaufnahme.ts` sowie die Aufnahmeblätter aus datenschutz (`Anmeldebogen`: 3 Importe).
  3. Die Kamera- und Bildbereinigung von files (32 Kernimporte aus 7 Modulen) geht nach `src/components`.
- **Schnittstelle:**
  1. Patient:in lesen und suchen (`fetchPatient`, `searchPatients`, `fullName`; 21 Importe aus 6 Modulen)
  2. Akte-Kontext (`usePatientRecord`, Anker)
  3. Patientenauswahl und -suche als Baustein
  4. Grundlagen einer Akte mit Kontingent und Deckung (`fetchPatientTreatmentBases`, `kontingentJeGrundlage`, `useAktuelleGrundlage`)
  5. Verordner:innen lesen
  6. Dateien der Akte lesen, hochladen, zuordnen und offene Scans (`fetchPatientFiles`, `ordneScanZu`, `fetchOffeneScans`)
  7. Erstaufnahme-Checkliste (`fetchIntakeChecklist`)
  8. Trainingsangebot machen und zurückziehen

#### `privacy` – datenschutz, retention, audit (4.006 LOC, 20 Dateien)

- **Begründung:** owner-Lesepfade über beide Verhältnisse: Auskunft zu Akte und Training (OPS-006), Aufbewahrung, Löschsperren und Löschläufe (ADR-008), Auditlog (ADR-010). Die Domäne liegt über patients und training, damit die Therapieseite nicht mehr training importiert.
- **Eingang:** 9 Importe, davon 7 auf Aufnahmeblätter und Absender (appointments 4, patients 2, intake 1). Die gehören nicht hierher. Wandern sie ab, nutzen privacy nur noch workplace (`zweckTexte`) und billing (`statistics` → `datenschutz/datei#sichereAlsDatei`), je 1 Import.
- **Zuerst:** retention und audit (je 3 Dateien, reine Leseseiten) mit dem Auskunftsteil von datenschutz zusammenlegen. Vorher Aufnahmeblätter nach `patients/intake` und den Absender in die Praxisstammdaten von core verlegen.
- **Schnittstelle:**
  1. Auskunft erstellen (Akte, Trainingsverhältnis)
  2. Aufbewahrungsstand eines Verhältnisses
  3. Löschsperren und Löschläufe lesen
  4. Auditlog lesen (`list_audit_events`)
  5. Katalog der Datenklassen (`DATENKLASSEN`)
  6. Beschriftung der Audit-Aktionen (`auditActionLabels`)

#### `calendar` – appointments, scheduling, slot-search, waitlist, territories, tours, today (33.582 LOC, 118 Dateien)

- **Begründung:**
  - ein Kalender für beide Verhältnisse (ADR-022),
  - der Hausbesuchstag (K1–K4: today, tours),
  - Planungshilfen (Raster, Gebietstage, Terminsuche, Warteliste).
- **Intern:** 6 Paare (appointments mit scheduling, slot-search, today, tours und waitlist; today~tours), 79 Importe; allein today>appointments sind 31.
- **Größe:** größte Domäne mit 18,9 % des Featurecodes. Innen gliedern in `appointments/`, `day/` (today), `routing/` (tours, territories) und `planning/` (scheduling, slot-search, waitlist).
- **Rückkanten:** 31, nach S + K noch 6.
- **Zuerst:**
  1. today mit appointments (31 + 2 Importe),
  2. dann tours (10 + 4, dazu today↔tours 4 + 3),
  3. dann waitlist und slot-search (8 + 3, 3 + 1, slot-search>waitlist 2).
- **Vorher heraus:** die Zeitfunktionen aus `appointments/api.ts` (52 Kernimporte) nach `src/lib`.
- **Schnittstelle:**
  1. Termine lesen nach Tag, Person, Akte und Verhältnis (`fetchAppointments`, `fetchPatientAppointments`, `fetchAppointment`)
  2. Termin anlegen, ändern, absagen, abschließen, wieder öffnen, mit Vorbelegung (`schreibeTerminVorbelegung`, `leseAngelegtenTermin`)
  3. Zustände und Arten mit Beschriftung (ADR-018: `appointmentStatusLabels`, `appointmentTypeHint`)
  4. Sprung zum Termin bzw. Kalender (`kalenderZumTermin`, `terminPfad`)
  5. Tagesplan einer Person (`list_day_plan`)
  6. Tagesroute und Fahrzeit (`fetchDayRoute`, `fahrzeitZwischen`, `usePlanungsmatrix`)
  7. freie Plätze und Lücken (`findFreeSlots`, `freieLuecken`)
  8. Arbeitszeiten und Raster (`fetchWorkingHours`, `saveAppointmentGrid`)
  9. Warteliste lesen und bestätigen
  10. Termine eines Zeitraums umplanen (`DaysToReschedule`, `tagUmplanenAdresse`; genutzt von vacation, working-time und timeaccount)

#### `clinical` – documentation, offline-documentation, assessments, therapy-reports (17.669 LOC, 74 Dateien)

- **Begründung:** der klinische Inhalt der Akte, dessen Lesen protokolliert wird (ADR-016, ADR-010): Verlauf, Befund, Bericht, Offline-Entwurf (ADR-024).
- **Intern:** 2 Paare (assessments~~documentation, documentation~~offline-documentation), 19 Importe.
- **Rückkanten:** die sauberste Schicht mit nur 3 (documentation>exercise-plans, >checkins und >messages, je 1). Nach S bleibt keine.
- **Zuerst:**
  1. documentation mit offline-documentation (4 + 1 Importe; ein gemeinsamer Weg für Entwurf und Abgleich),
  2. dann assessments (8 + 2),
  3. dann therapy-reports.
- **Vorher heraus:** `Textverlustschutz` (49 Importe aus 20 Modulen), `aufnahme` (Sprachaufnahme) und `format#FREITEXT`.
- **Schnittstelle:**
  1. Behandlungsnotiz zum Termin (`TreatmentNoteSection`)
  2. Dokumentationsstatus je Termin
  3. Dokumentationsfrist lesen und setzen (`fetchDocumentationDeadline`, `saveDocumentationDeadline`)
  4. Verlauf der Akte (`PatientRecordDocumentation`)
  5. Erhebungen lesen und Instrumente anbieten (`fetchErhebungen`, `erhebbareInstrumente`, `erhebenPfad`)
  6. Fragebogen-Bausteine ohne Datenzugriff für die Plattform (`FragebogenFelder`, `schema`, `antworten`, `darstellung`)
  7. Körperschema-Darstellung
  8. Berichte einer Verordnung (`BerichteDerVerordnung`, `empfehlungDerVerordnung`)
  9. Entwurf auf dem Gerät sichern und abgleichen (`AufGeraetSichern`, `servicePhone`)

#### `fleet` – fleet (12.118 LOC, 43 Dateien)

- **Begründung:** eigener Betriebsbereich Radflotte (FLT-EPIC-001). Das Modul hängt schon in sich zusammen.
- **Rückkanten:** 0. Das Paar appointments~fleet besteht nur aus Kalenderhinweisen (`CheckupKalenderhinweis`, `Tagesspalte`); es fällt mit S weg. Nach S + K bleiben nur fleet>calendar 2 und fleet>core 1.
- **Schnittstelle:**
  1. Flotte und Rad lesen (`fetchFleet`, `flotteSchluessel`, `standort`)
  2. Schlüssel nehmen und übergeben (`takeKey`)
  3. Check-Up-Hinweise für Kalender, Tag und Eingang (`CheckupKalenderhinweis`, `CheckupErinnerung`)
  4. Räder mit Problem für den Eingang
  5. Rhythmus bzw. Tagesspalte für den Kalender
  6. Meldungen

#### `billing` – billing, statistics (12.598 LOC, 39 Dateien)

- **Begründung:** Abrechnung nach ADR-009 und die Kennzahlen, die aus ihr lesen (ARBEITSBEREICHE „Abrechnung, Statistiken“).
- **Kopplung:** zwischen billing und statistics gibt es 0 Importe; die Zusammenlegung ist organisatorisch. Rückkanten 0. Das Paar billing~treatment-bases (2 + 2) bleibt quer.
- **Zuerst:** statistics als Unterordner. Vorher das Paar mit treatment-bases auflösen (`HEILMITTEL`/`BAUARTEN` gegen Katalogpositionen).
- **Schnittstelle:**
  1. Katalogpositionen und -versionen lesen
  2. Empfänger und Honorarvereinbarung einer Akte (`fetchEmpfaenger`, `fetchHonorar`, `Honorarvereinbarung`)
  3. Rechnungen einer Akte (`RechnungenDerAkte`)
  4. Abrechnungslage am Termin (heute in `appointments/abrechnungslage-api.ts`, `get_appointment_billing_context`)
  5. Nachsorgeabo
  6. Trainingspaket (`service_area` training)
  7. Praxiskennzahlen (`get_practice_statistics`, owner)
  8. Briefkopf, zusammengeführt mit dem Absender

#### `workforce` – staff, vacation, working-time, timeaccount, reimbursements (13.949 LOC, 58 Dateien)

- **Begründung:** die Personalvorgänge. Vier Antragsflüsse haben dasselbe Gerüst: Übersicht, Beantragen, Entscheiden; `api.ts` mit Schemas; `rules.ts` und `testdata.ts` in working-time, timeaccount und reimbursements; `paths.ts` in timeaccount und reimbursements. Dazu der Mitarbeiterstamm. Die Listen zählen nichts je Person (§20).
- **Kopplung:** 4 Importe intern, 0 Rückkanten. 36 Importe gehen in den Kalender, überwiegend Zeitfunktionen, `DaysToReschedule` und `fetchAssignableTherapists`.
- **Zuerst:**
  1. working-time mit timeaccount (2 Importe, gemeinsame Regeln `toMinutes`/`blocksText`),
  2. dann vacation und reimbursements in ein gemeinsames Antragsgerüst,
  3. staff als Unterordner für die Stammdaten.
- **Schnittstelle:**
  1. Mitarbeitende lesen (`fetchStaffMembers`)
  2. offene Anträge je Art für den Eingang (`fetchUrlaub`, `fetchWorkingTime`, `fetchTimeAccount`, `fetchReimbursements`)
  3. Pfade zum Entscheiden und Auszahlen (`decidePath`, `payPath`)
  4. Urlaubsfenster und -tage (`urlaubsfenster`, `urlaubstage`)
  5. abgelehnter Freizeitausgleich für „Mein Tag“ (`fetchRejectedTimeOff`)
  6. Ladestrom: Vorschläge und Einstellung
  7. Zugang einrichten (`ZugangEinrichtenPage`)

#### `nutrition` – nutrition (3.548 LOC, 16 Dateien)

- **Begründung:**
  - ADR-027: eigene Fähigkeit, eigene Einwilligung, eigene Datenklasse.
  - Hängt an einer Akte **oder** an einem Trainingsverhältnis.
  - Vom Büro-Lesen ausgenommen (ADR-021 P. 11).
  - Deshalb gehört sie weder zu patients noch zu training.
- **Kopplung:** 20 Importe ein, davon 19 von platform: Bausteine ohne Datenzugriff, die `platform/trennung.test.ts` erlaubt. Rückkanten 1 (`TrainingTerminFormular`).
- **Zuerst:** keine Verschmelzung. Die Modelle (`zielwerte`, `lebensmittel`, `tagebuch`, `texte`, `eingabe`) in einen Unterordner `model/` für die Plattform.
- **Schnittstelle:**
  1. Ernährungsreiter eines Verhältnisses (`ErnaehrungReiter`, `AkteErnaehrung`)
  2. Profil und Zielwerte (`zielwerteSchema`, `Zielwertliste`)
  3. Lebensmittel suchen und anlegen (`LebensmittelSuche`, `lebensmittelSchema`)
  4. Tagebuchregeln (`MAHLZEITEN`, `energieDerMenge`, `nochUebrig`)
  5. Beratungstermin
  6. Einwilligungstext

#### `exercise` – exercises, exercise-plans, checkins (15.094 LOC, 68 Dateien)

- **Begründung:** alles, was zwischen den Terminen passiert, für beide Verhältnisse: Bibliothek, Heimprogramm, Check-in, Gewohnheiten (ARBEITSBEREICHE „Training und Übungen“). ADR-021 wird hier im Datenmodell durchgesetzt (XOR-CHECKs, siehe 1a.4).
- **Kopplung:** das Paar exercise-plans~exercises wird intern (26 + 2 Importe). Rückkanten 2 (exercise-plans>platform-access).
- **Zuerst:** exercise-plans mit exercises. checkins hat 0 Importe zu beiden und verschmilzt als fachliche Zuordnung zuletzt.
- **Schnittstelle:**
  1. Bibliothek und Katalog lesen (`fetchBibliothek`, `ladeKatalog`)
  2. Plan eines Verhältnisses (`PlanAbschnitt`)
  3. fällige Pläne und Wiedervorlage (`fetchFaellige`, `PlanWiedervorlage`)
  4. Planblatt und Dosierung in Worten für die Plattform (`Planblatt`, `Dosis`, `haeufigkeit`)
  5. Übung einem Plan hinzufügen (`ZuEinemPlan`)
  6. Check-in-Takt eines Verhältnisses (`ZwischenDenTerminen`, `saveCheckinTakt`, `endCheckinTakt`)

#### `portal` – platform, platform-access, messages (23.728 LOC, 97 Dateien)

- **Begründung:** ADR-023 als Ganzes: die App der Patient:innen und Kund:innen und ihre Praxisseite (Zugang, Vertretung, Benachrichtigung, Rückfragen). Innen zwei Unterordner: `app/` (das heutige platform; `trennung.test.ts` gilt weiter) und `desk/` (platform-access, messages).
- **Kopplung:** 5 Importe intern (platform-access>platform 4 für die Einsicht). Rückkanten 1 (messages>open-points).
- **Zuerst:** platform-access mit messages. platform bleibt versiegelt.
- **Schnittstelle:**
  1. Plattformzugang eines Verhältnisses: Zustand, einladen, beenden (`usePlattformzugang`, `PlattformAbschnitt`, `zugangBeendbar`)
  2. Rückfragen eines Verhältnisses (`RueckfragenAbschnitt`, `TrainingRueckfragen`)
  3. offene Rückfragen für den Eingang (`OffeneRueckfragen`, `fetchRueckfragen`)
  4. Anhang für die Auskunft herausgeben (`AnhangHerausgabe`)
  5. Benachrichtigungsschalter
  6. Einsicht der Inhaber:in (`PlattformEinsicht`)
  7. Einstieg und Pfade der App (`PlattformApp`, `ladePlattformkontext`, `PLATTFORM_PFAD`, `EINLADUNG_PFAD`)

#### `training` – training (5.118 LOC, 18 Dateien)

- **Begründung:** das Trainingsverhältnis selbst (ADR-021 P. 2–6). Weil es rechtlich getrennt ist, bekommt es eine eigene Domäne.
- **Kopplung:** 2 Importe ein (privacy `getTrainingClient`, nutrition `TrainingTerminFormular`), 35 aus. Davon gehen 16 in den Kalender, wie ADR-022 es vorsieht (ein Kalender).
- **Schnittstelle:**
  1. Trainingsverhältnis lesen (für die Auskunft)
  2. Trainingstermin-Formular (besser in den Kalender)
  3. Trainingsprotokoll
  4. Einwilligung und Screening (Art. 9 Abs. 2 lit. a)
  5. Verträge mit dem Anker des Vertragsendes (ADR-021 P. 4)
  6. Annahme des Trainingsangebots (Gegenstück zu training-offers)

#### `teamchat` – teamchat (9.234 LOC, 49 Dateien)

- **Begründung:** interne Kommunikation (TEAM-001/002) mit eigener Speicherfrist (ANN-610).
- **Kopplung:** 2 Importe ein (auth `teamchatLeeren`, account `ProfilAbschnitt`). Von den 28 Importen aus sind 16 Kern (Kamera, Sprachaufnahme, Zeit, Videometadaten). Nach K bleiben nur core und workplace (`createTask`).
- **Schnittstelle:**
  1. Ungelesen-Zähler (`useTeamchatZaehler`)
  2. Profilabschnitt für „Mein Konto“
  3. Aufräumen beim Abmelden über die Registry
  4. Ausgang-Abmeldewache
  5. Kanal der Flotte (`FlottenNachrichtenPage`)
  6. Nachricht als Aufgabe

#### `workplace` – open-points, organisation, feedback, practice-settings, account (5.437 LOC, 46 Dateien)

- **Begründung:** die oberste Kompositionsschicht des Arbeitsplatzes:
  - „Offene Punkte“ und der Eingang Organisation, die dieselben Gruppen und Abfragen nutzen (ANN-450),
  - Rückmeldungen (§20.2),
  - Praxiseinstellungen und „Mein Konto“.
- **Kopplung:** liest aus 10 Domänen (73 Importe), 0 Rückkanten, Paar feedback~organisation intern. Die 13 eingehenden Importe kommen nur über fehlplatzierte Dateien (`intake-api`, `useOffeneErstaufnahme`, `platform-requests-api`, `tasks-api`, `Arbeitszeile`, `OpenPointsSummary`).
- **Zuerst:**
  1. open-points mit organisation (5 Importe),
  2. dann feedback (3 + 2),
  3. practice-settings und account als Seiten.
- **Schnittstelle:**
  1. Zusammenfassung der offenen Punkte für „Mein Tag“ (`OpenPointsSummary`)
  2. Aufgabe anlegen (`createTask`)
  3. Plattformanfragen lesen (`fetchPlatformRequests`)
  4. Eingangsrechte (`eingangsrechte`)
  5. Barometer-Hinweis (`useBarometerHinweise`)
  6. Einstieg in neue Anträge

**Reihenfolge der Umsetzung (Schätzung, abgeleitet aus den Szenarien):**

1. K: Kern herauslösen, 171 Importe.
2. Die Dateien aus Klasse F verlegen, etwa 25 Importe.
3. S: Regel einführen, dass nur Seiten in fremde Domänen importieren dürfen. Betrifft 382 Importe.
4. Die verbleibenden 17 Rückkanten umdrehen.
5. Erst danach die Ordner zusammenlegen.

Die Gruppierung ohne diese Schritte senkt die Querimporte nur von 765 auf 594.

Skripte und Rohdaten liegen unter `analyse`: `domaenen.mjs`, `kernel.mjs`, `seiten.mjs`, `verify_edges.mjs`, `api_bedarf.mjs`, `ziel.json`, `alle.json`.

### 1b Modul `appointments`: Grenze, öffentliche Schnittstelle, Zyklen

Nachgezählt habe ich mit einem eigenen Skript nach den Regeln von `module.mjs`: Es zählt Importanweisungen ohne Tests und listet Datei, Zeile und Symbole (Skripte `appt/imports.mjs`, `mapping.mjs`, `schritte.mjs`, `graph.mjs` im Analyseordner).

#### Basiszahlen: bestätigt und präzisiert

- **Bestätigt:** Es gibt 185 tiefe Importanweisungen von 28 Nutzern (27 Module und `src/routes`) auf 35 Dateien mit 107 Symbolen. Davon sind 12 Seiten, die nur `src/routes` importiert. Ausgehend sind es 89 Anweisungen in 17 Module, dazu 13 gegenseitige Partner.
  - `git grep` findet 186 Zeilen. Die 186. ist `src/test-utils.tsx:6` und wird als Testhilfe zu Recht nicht gezählt.
- **Präzisiert, „kein Modul hat eine index.ts“:** Auf Modulebene stimmt das. Es gibt genau eine `index.ts` in einem Unterordner: `src/features/exercises/katalog/index.ts`.
- **Präzisiert, Schwerpunkt `api.ts`:**
  - `api.ts` trägt 106 der 185 Anweisungen (57 %) und 56 der 107 Symbole.
  - `todayInTimeZone` steht in 52 Anweisungen, 37 davon importieren sonst nichts.
  - 52 der 106 `api.ts`-Anweisungen holen ausschließlich Zeithilfen (`todayInTimeZone`, `formatLocal*`, `dayKey`, `zeitpunktIn`).
  - `src/lib/datum.ts:9–10` verweist für Zeitpunkte ausdrücklich auf `@/features/appointments/api`.
- **Gastcode:** 3 der 23 Dateien benutzt `appointments` selbst nie. Es sind `FolgeterminVorschlaege.tsx` (683 Zeilen), `DaysToReschedule.tsx` (91) und `FreigabeNachHaken.tsx` (24), zusammen 798 Zeilen für documentation, timeaccount/vacation/working-time und today.
- **Tests:**
  - 54 Testimporte zeigen auf `appointments`.
  - 36 `vi.mock`-Stellen in 31 Testdateien außerhalb des Moduls: 29× `api`, 3× `abrechnungslage-api`, 2× `leistungenAmTermin`, 2× `kurzblick-api`.
  - Am häufigsten überschrieben werden `fetchAssignableTherapists` (13), `fetchAppointment` (8), `fetchLocations` (5) und `fetchPatientAppointments` (4).
- **Doppelungen am Rand:**
  - `leseMeldung` (`terminformular.ts:208–212`) ist identisch mit `leseText` (`src/lib/meldung.ts:15–19`).
  - `tagePlus` (`calendar.ts:56`) gibt es ein zweites und drittes Mal: `plusTage` in `fleet/format.ts:74` und `preview/demodaten.ts:36`.
  - `dayKey` (`api.ts:1518`) entspricht weitgehend `kalendertag` (`fleet/format.ts:37–44`, mit Ersatzzone).
  - `terminBezeichnung` (`api.ts:510–530`) entspricht weitgehend `terminName` (`today/tagesstart.ts:364–371`), mit anderem Rückfallwert.
  - `HausbesucheMitAlterAdresse.tsx` doppelt `UmstellenNachVerorten` (`patients/AdresseVerorten.tsx:90–150`): gleicher Query-Key, gleiche 4 Invalidierungen.
  - Die Abfrage `['appointment', id, 'abrechnungslage']` steht neben `useAbrechnungslage.ts:11–18` noch dreimal von Hand: `documentation/CompleteTreatmentPage.tsx:110–115` und `:680–685`, `today/MyDayPage.tsx:662–667`.
  - Die Kalenderadresse wird von Hand gebaut in `staff/StaffMemberDetailPage.tsx:341` und `treatment-bases/PatientTreatmentBasesPage.tsx:383–392`.
- **Modulintern:** `api.ts:5` (Laufzeit) und `calendar.ts:16` (nur Typ) importieren sich gegenseitig.

#### 1. Die 23 von außen importierten Dateien

`api.ts` ist nach Symbolgruppen aufgeteilt. Zahlen in Klammern sind Nutzermodule je Symbol.

| Datei (Zeilen)                         | importierende Module (Anweisungen)                                                                                | Symbole                                                                                                                                                                                                                                                                                                                                                                                                      | Warum, mit Importstelle                                                                                                                                                                                                                                                                                                                                                            | Art                                             | Ziel                                                                          |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------- |
| `api.ts` (2.213), Zeit                 | 23 Module (52)                                                                                                    | todayInTimeZone (23), formatLocalDate (9), formatLocalTimeRange (7), formatLocalTime (6), dayKey (3), zeitpunktIn (1)                                                                                                                                                                                                                                                                                        | „Heute“ der Praxis als Vorgabe oder Vergleich (`billing/Zahlungsformular.tsx:83`, `datenschutz/Anmeldebogen.tsx:244`, `statistics/StatisticsPage.tsx:619`, `teamchat/Zeitwahl.tsx:36`); Datum und Uhrzeit in der Praxiszone (`messages/InDieAkte.tsx:108`, `platform-access/Vertretungen.tsx:151`); Tageszuordnung (`exercise-plans/PlanblattSeite.tsx:65`, `teamchat/zeit.ts:85`) | Datums-Hilfe, **fachfremd**                     | b: `src/lib/praxiszeit.ts`                                                    |
| `api.ts`, Vokabular                    | documentation, today, training, waitlist, slot-search, open-points, staff, offline-documentation, treatment-bases | appointmentTypeSchema (4), appointmentTypeHint (7), appointmentTypeLabels (3), AppointmentType (2), appointmentStatusSchema (2), appointmentStatusLabels (3), appointmentStatusTon (3), AppointmentStatus, appointmentKindSchema, terminAnlassSchema (2), notificationChannelLabels, cancellationReasonSchema, CancellationReason, waehlbareAbsagegruende, staffName (3), patientName, terminBezeichnung (2) | zod-Schemas eigener Lesepfade (`documentation/api.ts:487–488`, `today/api.ts:4–11`, `training/api.ts:425`, `waitlist/api.ts:4`); Etiketten und Ton in Listen (`open-points/CallListPage.tsx:324`, `training/TrainingClientSections.tsx:17`, `today/MyDayPage.tsx:25`)                                                                                                              | Termin-Typen und Labels                         | b: `src/lib/termin.ts`                                                        |
| `api.ts`, Adressen                     | documentation, nutrition, today, waitlist, slot-search, tours, training, `src/routes`                             | kalenderZumTermin (5), terminPfad (2), zurueckZumTermin, schreibeTerminVorbelegung (2), leseTerminVorbelegung                                                                                                                                                                                                                                                                                                | Link zum Termin (`documentation/Schreibflaeche.tsx:196`, `src/routes/AuthenticatedRoutes.tsx:943`, `tours/Tourenliste.tsx:157`); Vorbelegung des Terminformulars aus Warteliste und Terminsuche                                                                                                                                                                                    | URL-Vertrag                                     | b: `src/lib/wege.ts`                                                          |
| `api.ts`, Verzeichnis                  | 9 Module (11)                                                                                                     | fetchAssignableTherapists (9), AssignableTherapist, fetchLocations (2), Location                                                                                                                                                                                                                                                                                                                             | Personen- und Standortauswahl in Stammdaten, Planung, Urlaub, Touren; RPC `list_assignable_therapists`, Tabelle `locations` (`api.ts:349–396`)                                                                                                                                                                                                                                     | Daten-API eines anderen Bereichs, **fachfremd** | c: neues Blattmodul `praxisverzeichnis`                                       |
| `api.ts`, Formular                     | training, nutrition                                                                                               | appointmentFormSchema, AppointmentFormField, AppointmentFormValues (2), leererTermin (2), TERMINFENSTER_MINUTEN (2), fensterEnde, appointmentToFormValues, updateAppointment, istAusserhalbArbeitszeit, istVergangenheit, liegtInVergangenheit, fetchAssignableTrainers, schreibfehler (2)                                                                                                                   | `training/TrainingTerminFormular.tsx` (337 Zeilen) baut das Terminformular nach; `nutrition/BeratungsterminSeite.tsx:16` benutzt es über training                                                                                                                                                                                                                                  | Formularlogik                                   | d: Terminformular zieht ein; a: `TerminformularWerte`, `schreibfehler`        |
| `api.ts`, Daten                        | documentation, today, training, assessments, treatment-bases, vacation                                            | Appointment, fetchAppointment (2), fetchAppointments (2), CalendarEntry, fetchPatientAppointments (2), PatientAppointment, cancelAppointment, completeAppointment, reopenAppointment (2)                                                                                                                                                                                                                     | Kopf und Schale der Doku (`documentation/DocumentationShell.tsx:6`); Tagesübersicht (`today/MyDayPage.tsx:1068`); Verlauf (`assessments/VerlaufAbschnitt.tsx:72`); Status am Trainingstermin (`training/TrainingProtocol.tsx:502, 509`)                                                                                                                                            | Daten-API                                       | a, sonst d                                                                    |
| `api.ts`, Hausbesuche                  | patients                                                                                                          | fetchVeralteteHausbesuche, aktualisiereHausbesuchAdressen                                                                                                                                                                                                                                                                                                                                                    | Rückfrage nach dem Verorten (`patients/AdresseVerorten.tsx:94, 99`)                                                                                                                                                                                                                                                                                                                | Fachlogik von patients                          | c: patients                                                                   |
| `calendar.ts` (793)                    | 8 Module (19)                                                                                                     | tagePlus (6), monatsBeginn (3), monatPlus (2), istIsoDatum                                                                                                                                                                                                                                                                                                                                                   | Fristen und Fenster auf `YYYY-MM-DD` (`documentation/format.ts:120`, `vacation/zeitraum.ts:2`, `timeaccount/rules.ts:1`, `open-points/eingang.ts:2`)                                                                                                                                                                                                                               | Datums-Hilfe, **fachfremd**                     | b: `src/lib/kalendertag.ts`                                                   |
| `calendar.ts`                          | fleet                                                                                                             | Zeitband                                                                                                                                                                                                                                                                                                                                                                                                     | Typ der Check-up-Lücke (`fleet/rhythmus.ts:1, 82–99`)                                                                                                                                                                                                                                                                                                                              | Datums-Hilfe, **fachfremd**                     | b: `src/lib/zeitbaender.ts`                                                   |
| `calendar.ts`                          | treatment-bases                                                                                                   | ZOOM_STANDARD, schreibeParameter                                                                                                                                                                                                                                                                                                                                                                             | Kalenderadresse „planen“ an der Verordnung (`PatientTreatmentBasesPage.tsx:383–392`)                                                                                                                                                                                                                                                                                               | URL-Vertrag                                     | b: `lib/wege.ts`, neue Funktion `kalenderAdresse()`                           |
| `terminformular.ts` (212)              | documentation, fleet, staff (5)                                                                                   | leseMeldung (3)                                                                                                                                                                                                                                                                                                                                                                                              | Bestätigung aus `navigate`-State (`fleet/BikePage.tsx:18`, `staff/StaffMemberDetailPage.tsx:252`, `documentation/TreatmentNotePage.tsx:4`)                                                                                                                                                                                                                                         | allgemeine Hilfe, **fachfremd**                 | b: `src/lib/meldung.ts` (vorhanden)                                           |
| `terminformular.ts`                    | slot-search, waitlist, training                                                                                   | DAUER_PARAM (2), leseAngelegtenTermin (2), mitAngelegtemTermin                                                                                                                                                                                                                                                                                                                                               | Adressparameter `dauer` und `neu`                                                                                                                                                                                                                                                                                                                                                  | URL-Vertrag                                     | b: `lib/wege.ts`                                                              |
| `terminformular.ts`                    | training                                                                                                          | speicherfehlerText, terminFehlerliste, terminFeldfehler                                                                                                                                                                                                                                                                                                                                                      | `TrainingTerminFormular.tsx:26`                                                                                                                                                                                                                                                                                                                                                    | Formularlogik                                   | d: Terminformular                                                             |
| `haken.ts` (50)                        | today (6)                                                                                                         | hakenFehlt, dokumentiertOhneHaken, hakenZuruecknehmbar                                                                                                                                                                                                                                                                                                                                                       | Zustandsregel B4/ADR-018 in Tagesliste, Zeitstrahl, `tagesstart.ts:3`, `today/api.ts:13`                                                                                                                                                                                                                                                                                           | Termin-Zustandsregel                            | b: `lib/termin.ts`                                                            |
| `DaysToReschedule.tsx` (91)            | timeaccount, vacation, working-time (5)                                                                           | DaysToReschedule                                                                                                                                                                                                                                                                                                                                                                                             | „Termine umplanen“ nach Urlaub, Arbeitszeit, Zeitausgleich (`timeaccount/RecordTimeAccountPage.tsx:327`); in appointments unbenutzt                                                                                                                                                                                                                                                | UI-Baustein                                     | b: `src/components/ui/UmzuplanendeTage.tsx`, Prop `darfUmplanen` statt `user` |
| `tageslage.ts` (24)                    | nutrition, training (4)                                                                                           | tageslageNeuLaden                                                                                                                                                                                                                                                                                                                                                                                            | Cache-Schlüssel `appointments`/`day-plan`/`day-route`/`travel-buffers` nach dem Speichern (`training/NewTrainingAppointmentPage.tsx:116`)                                                                                                                                                                                                                                          | Cache-Vertrag                                   | b: `src/lib/tageslage.ts`                                                     |
| `Laengenzeichen.tsx` (77)              | staff, today (4)                                                                                                  | Laengenzeichen                                                                                                                                                                                                                                                                                                                                                                                               | Abzeichen für abweichende Dauer (`staff/StaffMemberDetailPage.tsx:119`, `today/Zeitstrahl.tsx:11`)                                                                                                                                                                                                                                                                                 | UI-Baustein                                     | b: `src/components/ui/`; die Rechnung `abweichendeLaenge*` nach `lib/termin`  |
| `abrechnungslage-api.ts` (61)          | documentation, today (2)                                                                                          | fetchAbrechnungslage (2), positionText (2), Abrechnungslage                                                                                                                                                                                                                                                                                                                                                  | „Termin n von m“ (`CompleteTreatmentPage.tsx:110–115, 646, 680–685`; `MyDayPage.tsx:662–667, 817`)                                                                                                                                                                                                                                                                                 | Daten-API                                       | a: über `useAbrechnungslage`                                                  |
| `useAbrechnungslage.ts` (19)           | documentation (1)                                                                                                 | useAbrechnungslage                                                                                                                                                                                                                                                                                                                                                                                           | Kachel in `TreatmentNoteSection.tsx:18`                                                                                                                                                                                                                                                                                                                                            | Daten-API (Hook)                                | a                                                                             |
| `TerminAbschliessen.tsx` (125)         | today (2)                                                                                                         | TerminAbschliessenKnopf                                                                                                                                                                                                                                                                                                                                                                                      | Haken an der Tageskarte (`MyDayPage.tsx:427`, `NochOffen.tsx:51`)                                                                                                                                                                                                                                                                                                                  | UI-Baustein                                     | a: `Terminknopf.Abschliessen`                                                 |
| `tagumplanen.ts` (190)                 | timeaccount (1)                                                                                                   | tagUmplanenAdresse                                                                                                                                                                                                                                                                                                                                                                                           | Link nach dem Zeitkonto-Eintrag (`RecordTimeAccountPage.tsx:281`)                                                                                                                                                                                                                                                                                                                  | URL-Vertrag                                     | b: `lib/wege.ts`                                                              |
| `lueckenfinder.ts` (359)               | fleet (1)                                                                                                         | freieLuecken                                                                                                                                                                                                                                                                                                                                                                                                 | Arbeitszeit minus Belegtes, rein ohne Abhängigkeiten (`lueckenfinder.ts:79–97`; Aufruf `fleet/rhythmus.ts:88`)                                                                                                                                                                                                                                                                     | Datums-Hilfe, **fachfremd**                     | b: `lib/zeitbaender.ts`                                                       |
| `kurzblick-api.ts` (59)                | documentation (1)                                                                                                 | fetchKurzblick                                                                                                                                                                                                                                                                                                                                                                                               | „Wie zuletzt“ (`documentation/WieZuletzt.tsx:44`)                                                                                                                                                                                                                                                                                                                                  | Daten-API                                       | a                                                                             |
| `Kurzblick.tsx` (228)                  | today (1)                                                                                                         | LetzterEintragVorDerTuer                                                                                                                                                                                                                                                                                                                                                                                     | „Vor der Tür“ in `today/Tagesliste.tsx:9`                                                                                                                                                                                                                                                                                                                                          | UI-Baustein                                     | a                                                                             |
| `NavigationStarten.tsx` (118)          | today (1)                                                                                                         | NavigationZumTermin                                                                                                                                                                                                                                                                                                                                                                                          | Tageskarte (`MyDayPage.tsx:616, 765`); hängt nur an components/ui und `lib/location`                                                                                                                                                                                                                                                                                               | UI-Baustein, **fachfremd**                      | b: `src/components/ui/NavigationStarten.tsx`                                  |
| `HomeVisitFlow.tsx` (474)              | today (1)                                                                                                         | HomeVisitFlow                                                                                                                                                                                                                                                                                                                                                                                                | `AusfallKnopf` (`today/Besuchsknoepfe.tsx:134–176`)                                                                                                                                                                                                                                                                                                                                | Termin-Ablauf                                   | d: `Terminknopf.Ausfall`                                                      |
| `NichtAngetroffen.tsx` (93)            | today (1)                                                                                                         | NichtAngetroffenAktion                                                                                                                                                                                                                                                                                                                                                                                       | wie oben, für Praxis- und Videotermin                                                                                                                                                                                                                                                                                                                                              | Termin-Ablauf                                   | d: `Terminknopf.Ausfall`                                                      |
| `FreigabeNachHaken.tsx` (24)           | today (1)                                                                                                         | FreigabeNachHaken                                                                                                                                                                                                                                                                                                                                                                                            | Vorschlag „In die Abrechnung“ (`MyDayPage.tsx:898`); in appointments unbenutzt                                                                                                                                                                                                                                                                                                     | UI für today, **fachfremd**                     | c: today                                                                      |
| `FolgeterminVorschlaege.tsx` (683)     | documentation (1)                                                                                                 | FolgeterminVorschlaege                                                                                                                                                                                                                                                                                                                                                                                       | Block „Danach“ (`documentation/Danach.tsx:58`); in appointments unbenutzt                                                                                                                                                                                                                                                                                                          | UI-Baustein Termin                              | a: `NachDemTermin`                                                            |
| `LeistungAmTermin.tsx` (144)           | documentation (1)                                                                                                 | LeistungAmTermin                                                                                                                                                                                                                                                                                                                                                                                             | Block „Danach“ (`Danach.tsx:54`)                                                                                                                                                                                                                                                                                                                                                   | UI-Baustein                                     | a: `NachDemTermin`                                                            |
| `HausbesucheMitAlterAdresse.tsx` (145) | patients (1)                                                                                                      | HausbesucheMitAlterAdresse                                                                                                                                                                                                                                                                                                                                                                                   | Stammdaten nach Adressänderung (`patients/PatientMasterDataPage.tsx:397`)                                                                                                                                                                                                                                                                                                          | Fachlogik von patients, **fachfremd**           | c: patients, mit der API; dort das Duplikat zusammenführen                    |
| `AppointmentFormFields.tsx` (555)      | training (1)                                                                                                      | AppointmentFormFields, ArbeitszeitRueckfrage                                                                                                                                                                                                                                                                                                                                                                 | `TrainingTerminFormular.tsx:10`                                                                                                                                                                                                                                                                                                                                                    | Formularlogik                                   | d: Terminformular                                                             |
| `Deckungszeichen.tsx` (32)             | treatment-bases (1)                                                                                               | Deckungszeichen                                                                                                                                                                                                                                                                                                                                                                                              | Abzeichen „Ohne Deckung“ an der Verordnung (`PatientTreatmentBasesPage.tsx:143`); Deckung ist ein Begriff der Grundlage                                                                                                                                                                                                                                                            | Fachlogik von treatment-bases, **fachfremd**    | c: treatment-bases                                                            |

**Fachfremd sind 24 der 107 Symbole:** Zeit (6), Kalendertag (4), Zeitband und Lücken (2), `leseMeldung`, `tageslageNeuLaden`, Praxisverzeichnis (4), `NavigationZumTermin`, `Deckungszeichen`, Hausbesuche-API mit Komponente (3) und `FreigabeNachHaken`.

**Leitplanken für die Ziele:**

- **Kein Datenzugriff in `src/lib`.** `src/features/platform/trennung.test.ts` erlaubt pauschal `/^@\/lib\//` (ADR-023 Punkt 26). Jeder Datenzugriff in `src/lib` wäre damit für die Plattform importierbar. Deshalb werden `praxisverzeichnis` und `tagesplan` Blattmodule mit eigener `index.ts`.
- **Vokabular in `src/lib` hat ein Vorbild:** `src/lib/vertretung.ts:1–7` und `src/lib/einwilligung.ts:1–4`, jeweils mit der Begründung „deshalb hier und nicht in einem der beiden Features“.
- **`lib/praxiszeit` für die Plattform sperren (Vorschlag):** `platform/zeit.ts:1–8` nennt die Praxiszone „kein Import für die Plattform“. Ein Ausschluss in `trennung.test.ts` wäre eine Verschärfung.

#### 2. Vorschlag für `src/features/appointments/index.ts`

```ts
// src/features/appointments/index.ts – VORSCHLAG, nicht angelegt (15 Exporte)
export type { Appointment, CalendarEntry } from './api'; // 1, 2
export { fetchAppointment, fetchAppointments, fetchPatientAppointments } from './api'; // 3–5
export { cancelAppointment, schreibfehler } from './api'; // 6, 7
export { Terminformular, type TerminformularWerte } from './Terminformular'; // 8, 9  (aus training/TrainingTerminFormular.tsx)
export { useAbrechnungslage } from './useAbrechnungslage'; // 10 (mit enabled, liefert position)
export { fetchKurzblick } from './kurzblick-api'; // 11
export { NachDemTermin } from './NachDemTermin'; // 12 (LeistungAmTermin + FolgeterminVorschlaege)
export { Terminknopf } from './Terminknopf'; // 13 (.Abschliessen .Ausfall .Zuruecknehmen)
export { LetzterEintragVorDerTuer } from './Kurzblick'; // 14
export { terminRouten } from './routen'; // 15 (ort 'akte' | 'praxis', Slot dokuAbschnitt)
```

| #   | Export                   | Art                              | Wer braucht ihn                                                                                                    | ersetzt heute                                                                                                                                                                                        |
| --- | ------------------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Appointment              | Typ                              | documentation, 9 Dateien                                                                                           | api#Appointment                                                                                                                                                                                      |
| 2   | CalendarEntry            | Typ                              | `today/MyDayPage.tsx`                                                                                              | api#CalendarEntry                                                                                                                                                                                    |
| 3   | fetchAppointment         | Funktion                         | `documentation/DocumentationShell.tsx`, `PatientRecordDocumentation.tsx`                                           | dasselbe Symbol                                                                                                                                                                                      |
| 4   | fetchAppointments        | Funktion                         | `today/MyDayPage.tsx`, `vacation/termine.ts`                                                                       | dasselbe Symbol                                                                                                                                                                                      |
| 5   | fetchPatientAppointments | Funktion                         | `assessments/VerlaufAbschnitt.tsx`                                                                                 | dasselbe Symbol                                                                                                                                                                                      |
| 6   | cancelAppointment        | Funktion                         | `training/TrainingAppointmentPage.tsx`                                                                             | dasselbe Symbol                                                                                                                                                                                      |
| 7   | schreibfehler            | Funktion                         | `training/api.ts`, `nutrition/api.ts` (eigene RPCs mit denselben Fehlern)                                          | dasselbe Symbol                                                                                                                                                                                      |
| 8   | Terminformular           | Komponente                       | `training/NewTrainingAppointmentPage.tsx`, `EditTrainingAppointmentPage.tsx`, `nutrition/BeratungsterminSeite.tsx` | 16 Formularsymbole                                                                                                                                                                                   |
| 9   | TerminformularWerte      | Typ                              | `training/api.ts`, `nutrition/api.ts`                                                                              | AppointmentFormValues                                                                                                                                                                                |
| 10  | useAbrechnungslage       | Hook                             | `CompleteTreatmentPage.tsx` (2×), `TreatmentNoteSection.tsx`, `today/MyDayPage.tsx`, `today/FreigabeNachHaken.tsx` | fetchAbrechnungslage, positionText, Abrechnungslage, useAbrechnungslage                                                                                                                              |
| 11  | fetchKurzblick           | Funktion                         | `documentation/WieZuletzt.tsx`                                                                                     | dasselbe Symbol                                                                                                                                                                                      |
| 12  | NachDemTermin            | Komponente                       | `documentation/Danach.tsx`                                                                                         | FolgeterminVorschlaege, LeistungAmTermin                                                                                                                                                             |
| 13  | Terminknopf              | zusammengesetzte Komponente      | `today/MyDayPage.tsx`, `NochOffen.tsx`, `training/TrainingProtocol.tsx`                                            | TerminAbschliessenKnopf sowie completeAppointment, reopenAppointment, HomeVisitFlow, NichtAngetroffenAktion; `AusfallKnopf` und `HakenRueckgaengig` (`today/Besuchsknoepfe.tsx:134, 187`) ziehen ein |
| 14  | LetzterEintragVorDerTuer | Komponente                       | `today/Tagesliste.tsx`                                                                                             | dasselbe Symbol                                                                                                                                                                                      |
| 15  | terminRouten             | Funktion, liefert Route-Elemente | `src/routes/AuthenticatedRoutes.tsx` (Z. 305 und 433–517)                                                          | 12 Seiten sowie `TermineUebertragenPage`; setzt den Slot `TreatmentNoteSection`                                                                                                                      |

**Zuordnung aller 107 Symbole:**

| Ziel                                                     | Symbole                                                                                                                                                                                                                                                                                                                                                                                                                      | Anzahl  |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| (a) index.ts                                             | Appointment, CalendarEntry, fetchAppointment, fetchAppointments, fetchPatientAppointments, cancelAppointment, schreibfehler; AppointmentFormValues → `TerminformularWerte`; fetchAbrechnungslage, positionText, Abrechnungslage, useAbrechnungslage → `useAbrechnungslage`; fetchKurzblick; LetzterEintragVorDerTuer; FolgeterminVorschlaege, LeistungAmTermin → `NachDemTermin`; TerminAbschliessenKnopf → `Terminknopf`    | **17**  |
| (b) `src/lib/praxiszeit.ts` (neu)                        | todayInTimeZone, formatLocalDate, formatLocalTime, formatLocalTimeRange, dayKey, zeitpunktIn                                                                                                                                                                                                                                                                                                                                 | 6       |
| (b) `src/lib/kalendertag.ts` (neu)                       | tagePlus, monatsBeginn, monatPlus, istIsoDatum                                                                                                                                                                                                                                                                                                                                                                               | 4       |
| (b) `src/lib/zeitbaender.ts` (neu)                       | Zeitband, freieLuecken                                                                                                                                                                                                                                                                                                                                                                                                       | 2       |
| (b) `src/lib/meldung.ts` (vorhanden)                     | leseMeldung                                                                                                                                                                                                                                                                                                                                                                                                                  | 1       |
| (b) `src/lib/tageslage.ts` (neu)                         | tageslageNeuLaden                                                                                                                                                                                                                                                                                                                                                                                                            | 1       |
| (b) `src/lib/termin.ts` (neu)                            | appointmentTypeSchema, AppointmentType, appointmentTypeLabels, appointmentTypeHint, appointmentStatusSchema, AppointmentStatus, appointmentStatusLabels, appointmentStatusTon, appointmentKindSchema, terminAnlassSchema, notificationChannelLabels, cancellationReasonSchema, CancellationReason, waehlbareAbsagegruende, patientName, staffName, terminBezeichnung, hakenFehlt, dokumentiertOhneHaken, hakenZuruecknehmbar | 20      |
| (b) `src/lib/wege.ts` (neu)                              | kalenderZumTermin, zurueckZumTermin, terminPfad, schreibeTerminVorbelegung, leseTerminVorbelegung, DAUER_PARAM, mitAngelegtemTermin, leseAngelegtenTermin, tagUmplanenAdresse, schreibeParameter und ZOOM_STANDARD (→ `kalenderAdresse`)                                                                                                                                                                                     | 11      |
| (b) `src/components/ui/`                                 | Laengenzeichen, NavigationZumTermin, DaysToReschedule (→ `UmzuplanendeTage`)                                                                                                                                                                                                                                                                                                                                                 | 3       |
| (c) Blattmodul `praxisverzeichnis` (neu, mit index.ts)   | fetchAssignableTherapists, AssignableTherapist, fetchLocations, Location                                                                                                                                                                                                                                                                                                                                                     | 4       |
| (c) patients                                             | HausbesucheMitAlterAdresse, fetchVeralteteHausbesuche, aktualisiereHausbesuchAdressen                                                                                                                                                                                                                                                                                                                                        | 3       |
| (c) treatment-bases                                      | Deckungszeichen                                                                                                                                                                                                                                                                                                                                                                                                              | 1       |
| (c) today                                                | FreigabeNachHaken                                                                                                                                                                                                                                                                                                                                                                                                            | 1       |
| (d) Terminformular zieht nach appointments ein           | appointmentFormSchema, AppointmentFormField, AppointmentFormFields, ArbeitszeitRueckfrage, appointmentToFormValues, updateAppointment, fensterEnde, leererTermin, TERMINFENSTER_MINUTEN, istAusserhalbArbeitszeit, istVergangenheit, liegtInVergangenheit, fetchAssignableTrainers, speicherfehlerText, terminFehlerliste, terminFeldfehler                                                                                  | 16      |
| (d) Terminknopf ersetzt Einzelteile                      | completeAppointment, reopenAppointment, HomeVisitFlow, NichtAngetroffenAktion                                                                                                                                                                                                                                                                                                                                                | 4       |
| (d) `TermineUebertragenPage` zieht nach appointments ein | PatientAppointment                                                                                                                                                                                                                                                                                                                                                                                                           | 1       |
| (d) Route über `terminRouten`                            | PatientAppointmentsPage, CalendarPage, TagUmplanenPage, NewAppointmentPage, NewEventPage, NewEventSeriesPage, NewAppointmentStartPage, DauerterminStartPage, AppointmentSeriesPage, AppointmentSlipPage, EditAppointmentPage, EditEventPage                                                                                                                                                                                  | 12      |
| **Summe**                                                | (a) 17 · (b) 48 · (c) 9 · (d) 33                                                                                                                                                                                                                                                                                                                                                                                             | **107** |

#### 3. Zyklen: beide Richtungen und Bruch

„P → A“ heißt: Partner importiert appointments. „A → P“ heißt: appointments importiert den Partner. Zeilenangaben sind der Beginn der Importanweisung. Die Schritte S1 bis S11 stehen in Abschnitt 4.

| Partner         | P → A (Anweisungen)                                                                                                                                                                                                                                                                                                                       | A → P (Anweisungen)                                                                                                                                                                                                                                                                                                                              | bleibt                         | Bruch                                                                                                                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| billing         | 5: `CatalogPage.tsx:24`, `InvoiceDetailPage.tsx:25`, `InvoicesPage.tsx:13`, `OffenePosten.tsx:14`, `Zahlungsformular.tsx:8`, alle nur todayInTimeZone                                                                                                                                                                                     | 2: `Abrechnungslage.tsx:7` empfaengerartLabels; `LeistungAmTermin.tsx:7` fetchHonorar                                                                                                                                                                                                                                                            | A → billing                    | S1                                                                                                                                                                                      |
| treatment-bases | 6: `DatenUebertragenFenster.tsx:11` todayInTimeZone; `GrundlagenVerlauf.tsx:5` formatLocalDate/Time; `PatientTreatmentBasesPage.tsx:28–30` todayInTimeZone, Deckungszeichen, ZOOM_STANDARD, schreibeParameter; `TermineUebertragenPage.tsx:16` fetchPatientAppointments, PatientAppointment, staffName, appointmentTypeHint, formatLocal* | 13 in 10 Dateien: grundlageBezeichnung (Abrechnungslage, DauerterminStartPage, Kurzblick, NewAppointmentPage, PatientAppointmentsPage, TerminKompakt), FreigabeVorschlag/FreigabeStand (FreigabeNachHaken, LeistungAmTermin), useVerordnungenDerAkte, useAktuelleGrundlage, kontingentJeGrundlage, BAUARTEN (abrechnungslage-api, kurzblick-api) | A → treatment-bases            | S1, S2, S3 (`kalenderAdresse`), S5 (Deckungszeichen → treatment-bases), S8 (`TermineUebertragenPage` → appointments, nutzt `transferAppointmentsToTreatmentBasis` über treatment-bases) |
| documentation   | 19 in 14 Dateien: Appointment, patientName, fetchAppointment, Wege, Status-Vokabular, FolgeterminVorschlaege, LeistungAmTermin, Abrechnungslage, Kurzblick, leseMeldung, tagePlus                                                                                                                                                         | 11: Textverlustschutz 8× (AppointmentSeriesPage:20, EditAppointmentPage:18, EditEventPage:16, HomeVisitFlow:15, NewAppointmentPage:13, NewEventPage:15, NewEventSeriesPage:18, TagUmplanenPage:26); `Kurzblick.tsx:10` FREITEXT; `TerminAktionen.tsx:34` TreatmentNoteSection; `TerminPanel.tsx:22` VERLAUF_ANKER                                | documentation → A (über index) | S10 (Einzelheiten unter der Tabelle)                                                                                                                                                    |
| patients        | 7: `AdresseVerorten.tsx:13` Hausbesuche-API; `EditPatientPage.tsx:16`, `NewPatientPage.tsx:16` fetchAssignableTherapists; `PatientMasterDataFields.tsx:6` AssignableTherapist; `PatientMasterDataPage.tsx:4, 16` HausbesucheMitAlterAdresse, todayInTimeZone; `Zusammenfuehrungsvermerke.tsx:3`                                           | 10: fetchPatient/fullName (AppointmentSeriesPage:21, AppointmentSlipPage:10, DauerterminStartPage:13, NewAppointmentPage:14, EditAppointmentPage:19, TermineMailen:9); Patientenauswahl (DauerterminStartPage:14, NewAppointmentStartPage:8); `PatientAppointmentsPage.tsx:15, 19` usePatientRecord, Patient                                     | A → patients                   | S1, S4, S5 (Hausbesuche nach patients, `UmstellenNachVerorten` zusammenführen)                                                                                                          |
| datenschutz     | 1: `Anmeldebogen.tsx:15` todayInTimeZone                                                                                                                                                                                                                                                                                                  | 4: `AppointmentSlipPage.tsx:15–16` useAbsender, absenderKontakt; `Terminzettelblatt.tsx:4–5` AbsenderBlock, PraxisAbsender                                                                                                                                                                                                                       | A → datenschutz                | S1                                                                                                                                                                                      |
| tours           | 4: `FahrpufferHinweis.tsx:3`, `Fahrten.tsx:6` formatLocalTime; `TourenPage.tsx:15` fetchAssignableTherapists, todayInTimeZone; `Tourenliste.tsx:15` formatLocalTimeRange, terminBezeichnung, terminPfad                                                                                                                                   | 10: `CalendarPage.tsx:1` FahrpufferHinweis; `fahrwege.ts:5–7`, `lueckenfinder.ts:4–6`, `wegpruefung.ts:5–7` (usePlanungsroute(n)/matrizen, fetchStandorte, tagesorte, garagenpunkt, fetchDayRoute, routenplan, fahrzeitZwischen, streckeZwischen, Tagesstopp)                                                                                    | A → tours (Wegdienst)          | S1–S4                                                                                                                                                                                   |
| fleet           | 14: todayInTimeZone 9× (BikeNewPage:8, BikePage:17, BreakdownPage:11, CheckupPage:10, DepotsPage:16, FleetPage:20, KeyPage:23, MeldungenPage:15, WerkstattblattPage:12); leseMeldung 3× (BikePage:18, FleetPage:21, Testbausteine:2); `rhythmus.ts:1–2` Zeitband, freieLuecken                                                            | 2: `CalendarPage.tsx:6–7` CheckupKalenderhinweis, Tagesspalte                                                                                                                                                                                                                                                                                    | A → fleet                      | S1, S3                                                                                                                                                                                  |
| scheduling      | 1: `SchedulingPage.tsx:20` fetchAssignableTherapists, todayInTimeZone                                                                                                                                                                                                                                                                     | 3: `CalendarPage.tsx:28`, `FolgeterminVorschlaege.tsx:11`, `wegpruefung.ts:4` fetchWorkingHours, fetchWorkingHourExceptions                                                                                                                                                                                                                      | A → scheduling                 | S1, S4                                                                                                                                                                                  |
| open-points     | 6: `CallListPage.tsx:15, 21` appointmentTypeHint, formatLocalTime, notificationChannelLabels, todayInTimeZone, tagePlus; `CallsSummary.tsx:7`, `eingang.ts:2` tagePlus; `OpenPointsPage.tsx:8`; `PlatformRequests.tsx:11` formatLocalDate/TimeRange                                                                                       | 1: `CalendarPage.tsx:29–32` PLATFORM_REQUESTS_KEY, fetchPlatformRequests                                                                                                                                                                                                                                                                         | A → open-points                | S1, S2                                                                                                                                                                                  |
| staff           | 7: `EditStaffMemberPage.tsx:13` fetchLocations; `NewStaffMemberPage.tsx:18` todayInTimeZone; `StaffListPage.tsx:15` fetchAssignableTherapists; `StaffMasterDataFields.tsx:3` Location; `StaffMemberDetailPage.tsx:18–20` Laengenzeichen, leseMeldung, appointmentTypeHint, fetchAssignableTherapists, formatLocal*, todayInTimeZone       | 3: `EditAppointmentPage.tsx:20`, `NewEventPage.tsx:22`, `NewEventSeriesPage.tsx:27` fetchStaffMembers                                                                                                                                                                                                                                            | A → staff                      | S1–S5; Kalenderlink `StaffMemberDetailPage.tsx:341` über `kalenderAdresse`                                                                                                              |
| slot-search     | 3: `SlotSearchPage.tsx:17, 25` appointmentTypeLabels/Schema, AppointmentType, fetchAssignableTherapists, schreibeTerminVorbelegung, todayInTimeZone, DAUER_PARAM; `api.ts:5` AppointmentType                                                                                                                                              | 1: `FolgeterminVorschlaege.tsx:13` findFreeSlots, SearchParams, Slot                                                                                                                                                                                                                                                                             | A → slot-search                | S1–S4                                                                                                                                                                                   |
| today           | 31 in 12 Dateien (MyDayPage 8, Besuchsknoepfe 4, NochOffen 4, Tagesliste 3, Zeitstrahl 3, `api.ts` 2, tagesstart 2, sonst je 1)                                                                                                                                                                                                           | 2: `HomeVisitFlow.tsx:16` fetchDayPlan, rufnummern; `TagUmplanenPage.tsx:28` fetchDayPlan, rufnummern, DayPlanEntry                                                                                                                                                                                                                              | today → A (über index)         | S9 (Einzelheiten unter der Tabelle)                                                                                                                                                     |
| waitlist        | 8: `WaitlistFormPage.tsx:18`, `WaitlistMatches.tsx:8–9`, `WaitlistPage.tsx:14–15`, `api.ts:4`, `form.ts:1`, `format.ts:1` (Vokabular, Wege, fetchAssignableTherapists, todayInTimeZone)                                                                                                                                                   | 3: `NewAppointmentStartPage.tsx:9`, `TerminAktionen.tsx:35` WaitlistMatches; `PatientAppointmentsPage.tsx:16` WaitlistNotice                                                                                                                                                                                                                     | A → waitlist                   | S1–S4                                                                                                                                                                                   |

**Bruch documentation (S10):**

- `Textverlustschutz.tsx` (695 Zeilen) zieht nach `src/app/` neben `abmeldeschutz`. Nach `src/lib` passt es nicht: Es importiert `@/app/abmeldeschutz`, `@/app/verbindung` und `@/features/auth/sitzungssperre/sperrsicherung` (Z. 7–9). Betroffen sind 55 Importanweisungen in 21 Modulen.
- Die Erlaubnis in `trennung.test.ts:63` muss den neuen Pfad 1:1 übernehmen.
- `FREITEXT` zieht nach `src/components/ui`, `VERLAUF_ANKER` nach `lib/wege.ts`.
- `TreatmentNoteSection` wird ein Slot `dokuAbschnitt`: CalendarPage reicht ihn an `TerminAktionenDialog` weiter, gesetzt wird er in `AuthenticatedRoutes`.

**Bruch today (S9):** Der Lesepfad `list_day_plan` wird Blattmodul `src/features/tagesplan`.

- Er umfasst `today/api.ts` Z. 1–220: Schema, DayPlanEntry, fetchDayPlan, Rufnummer, rufnummern.
- Die Vokabular-Importe von `today/api.ts:4–13` und `documentationStatusSchema` (`documentation/api.ts:498`) gehen nach `lib/termin`.
- Nebenwirkung: `tours` → `today` (3: `tagesroute.ts:10`, `TagesrouteAufklapper.tsx:6`, `fahrpuffer.ts:6`) wird `tours` → `tagesplan`. Damit fällt auch das Paar today↔tours.

#### 4. Ergebnis-Bilanz und Reihenfolge

Die Werte nach jedem Schritt sind modelliert, nicht gemessen. Grundlage sind die Symbolzuordnung aus Abschnitt 2 und die Importanweisungen von heute (`schritte.mjs`, `graph.mjs`).

| Größe                                 | vorher             | nachher                                                                               | Herleitung                                                                                                                                                                                              |
| ------------------------------------- | ------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| tiefe Importe in appointments         | 185                | **0**                                                                                 | alle Restimporte laufen über index.ts                                                                                                                                                                   |
| Importanweisungen in appointments     | 185                | **25**, eine je Datei, über index.ts                                                  | 25 Dateien mit Bedarf an (a), nach Zusammenlegen je Datei                                                                                                                                               |
| Nutzer                                | 28                 | **7**: assessments, documentation, nutrition, today, training, vacation, `src/routes` |                                                                                                                                                                                                         |
| öffentliche Symbole                   | 107                | **15**                                                                                |                                                                                                                                                                                                         |
| gegenseitige Paare mit appointments   | 13                 | **0**                                                                                 | simuliert                                                                                                                                                                                               |
| gegenseitige Paare gesamt             | 32                 | **14**                                                                                | zusätzlich fallen assessments↔documentation, checkins↔documentation, documentation↔patients, nutrition↔training, today↔tours; kein neues Paar                                                           |
| größte starke Zusammenhangskomponente | 36 Module          | **34**, appointments bleibt drin                                                      | Rest-Rückwege siehe unten                                                                                                                                                                               |
| tiefe Importe in documentation        | 70                 | 18                                                                                    | Textverlustschutz, FREITEXT, VERLAUF_ANKER, documentationStatusSchema                                                                                                                                   |
| Querimporte gesamt                    | 765                | ≈571                                                                                  | Schätzung: eine Anweisung je heutiger Anweisung, interne Importe der umgezogenen Dateien nicht modelliert                                                                                               |
| tiefe Importe gesamt                  | 933                | ≈688                                                                                  | Schätzung, wie oben                                                                                                                                                                                     |
| appointments nach außen               | 89 tief, 17 Module | ≈85 tief, 17 Module                                                                   | Schätzung: −11 documentation, −2 today, +4 Deckungszeichen, +1 Hausbesuche, +3 `TermineUebertragenPage`. documentation und today fallen weg, tagesplan und praxisverzeichnis kommen über index.ts hinzu |

**Rest-Rückwege, außerhalb dieses Moduls:**

- appointments → intake → assessments → appointments: `intake/ErstaufnahmePage.tsx:13–15`, `assessments/VerlaufAbschnitt.tsx:11`
- appointments → patients → today → appointments: `patients/PatientMasterDataPage.tsx:39` zugangMitStockwerk
- appointments → datenschutz → training → appointments: `datenschutz/TrainingAuskunftPage.tsx:14`
- appointments → open-points → vacation → appointments: `open-points/eingang.ts:22–23`, `Urlaubsantraege.tsx:8`
- appointments → treatment-bases → auth → documentation → appointments: `useSession` 4× in treatment-bases, `auth/SessionProvider.tsx:11` uebergabenLeeren

**Umbauschritte, je ein PR:**

| Schritt | Inhalt                                                                                                                                                             | tiefe Importe danach     | Nutzer | Zyklenpartner                                | Fremddateien | Hinweise                                                                                                                                                                               |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ | ------ | -------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1      | `lib/praxiszeit`, `lib/kalendertag`, `lib/zeitbaender`                                                                                                             | 114                      | 19     | 11 (billing, datenschutz fallen)             | 87           | mechanisch; teilbar in S1a (praxiszeit) und S1b; 3 Mocks von todayInTimeZone umstellen; Duplikate in `fleet/format.ts` mitziehen                                                       |
| S2      | `lib/termin`: Vokabular, Haken-Regeln, Namen, `abweichendeLaenge*`, documentationStatusSchema                                                                      | 98                       | 17     | 10 (open-points)                             | 30           |                                                                                                                                                                                        |
| S3      | `lib/wege` (inklusive `kalenderAdresse`), `lib/meldung`, `lib/tageslage`                                                                                           | 75                       | 16     | 9 (fleet)                                    | 22           | `leseText` und `leseMeldung` zusammenlegen                                                                                                                                             |
| S4      | Blattmodul `praxisverzeichnis` mit index.ts                                                                                                                        | 62                       | 12     | 5 (tours, scheduling, slot-search, waitlist) | 14           | 13 Mocks fetchAssignableTherapists und 5 fetchLocations umstellen; Plattform-Trennung bleibt unberührt                                                                                 |
| S5      | Laengenzeichen, NavigationStarten, UmzuplanendeTage nach `components/ui`; Deckungszeichen → treatment-bases; Hausbesuche → patients; FreigabeNachHaken → today     | 48                       | 8      | 3 (patients, staff)                          | 12           | `nurIn` in `src/lib/begriffe.ts:223, 248` um die neuen Pfade erweitern, sonst entfällt die Wortprüfung für „Länge“ und „Ereignis“; Zähler in `src/designsystem.grenzen.ts` wandern mit |
| S6      | `TrainingTerminFormular` → `appointments/Terminformular` (Startwerte und `updateAppointment` intern)                                                               | 43                       | 8      | 3                                            | 4            | Paar nutrition↔training fällt                                                                                                                                                          |
| S7      | `Terminknopf` (AusfallKnopf und HakenRueckgaengig einziehen, TrainingProtocol stellt um), `NachDemTermin`, `useAbrechnungslage({enabled})` mit `position`          | 39                       | 8      | 3                                            | 2            | 3 handgeschriebene Abrechnungslage-Abfragen entfallen                                                                                                                                  |
| S8      | `TermineUebertragenPage` → appointments                                                                                                                            | 38                       | 7      | 2 (treatment-bases)                          | 1            | Route zieht in `terminRouten`                                                                                                                                                          |
| S9      | Blattmodul `tagesplan`                                                                                                                                             | 38                       | 7      | 1 (today)                                    | 6            | today↔tours fällt                                                                                                                                                                      |
| S10     | Textverlustschutz → `src/app`; FREITEXT; VERLAUF_ANKER; Slot `dokuAbschnitt`                                                                                       | 38                       | 7      | **0**                                        | ≈49          | `trennung.test.ts:63` Pfad 1:1 anpassen, das ist keine Lockerung                                                                                                                       |
| S11     | `index.ts`, `terminRouten`; alle 38 Restanweisungen umstellen; Prüfung „kein tiefer Import nach `features/appointments`“ in `scripts/aufraeumen.mjs` oder als Test | **0** (25 über index.ts) | 7      | 0                                            | 25           | ANN (Technik) für öffentliche Schnittstelle und Terminvertrag in `src/lib`, verankert an `index.ts`                                                                                    |

S9 und S10 hängen nicht an S1 bis S8 und können vorgezogen werden. Bei `vi.mock` auf `@/features/appointments/api` reicht die index.ts nur weiter, die Mocks gelten deshalb weiter. Anzupassen sind sie nur für die Symbole, die nach `lib` oder in andere Module ziehen.

## 2. Grunddesign vs. Anbauen und semantische Redundanz

### 2a Grunddesign oder Anbau: die 88 Programmdateien über 500 Zeilen

**Basis bestätigt:** `gross.txt` je Datei mit `wc -l` nachgezählt: 88 Dateien, 72.292 Zeilen, 16 über 1.000, 3 über 2.000. Das stimmt mit FAKTEN.md überein. Messskripte und Rohwerte liegen in `analyse/s2a/` (`mess.mjs`, `klass.mjs`, `zusammensetzung.mjs`, `anbau2.mjs`, `rpcbloecke.mjs`, `mutation.mjs`, `ersparnis.mjs`).

**Methode für Zeilenarten:** Jede Zeile bekommt genau eine Art. Zuerst Kommentar, Leerzeile oder Import. Alle anderen Zeilen gehören zu ihrem Block auf oberster Ebene. Mögliche Blöcke sind Zod-Schema, Typ, Konstante, RPC-Funktion, Hilfsfunktion, Hook und Komponente. Eine RPC-Funktion ist eine Funktion mit `.rpc(` oder einem lokalen Wrapper `rufe`/`call`/`aufrufen`. Innerhalb einer Komponente zählt alles bis zum letzten `return (` auf Einrückung 2 als „Logik“, der Rest als „JSX“.

#### 2a.1 Klassifikation aller 88 Dateien

| Art                         | Dateien |     Zeilen | Anteil |     Ø | Zusammensetzung (Zeilenarten)                                                 |
| --------------------------- | ------: | ---------: | -----: | ----: | ----------------------------------------------------------------------------- |
| Seite/Seitenabschnitt       |      37 |     29.928 | 41,4 % |   809 | JSX 41 %, Logik 28 %, Kommentar 15 %, Import 6 %                              |
| api.ts-Datenschicht         |      12 |     12.734 | 17,6 % | 1.061 | RPC-Funktionen 32 %, Kommentar 20 %, Zod 17 %, Hilfsfunktionen 12 %, Leer 9 % |
| Formular                    |      18 |     11.709 | 16,2 % |   651 | Logik 36 %, JSX 29 %, Kommentar 13 %, Import 7 %                              |
| Dialog                      |       4 |      3.956 |  5,5 % |   989 | JSX 39 %, Logik 31 %, Kommentar 15 %                                          |
| Definitionen/Daten          |       5 |      3.257 |  4,5 % |   651 | Funktionen 34 %, Konstanten 24 %, Kommentar 21 %, Zod 13 %                    |
| App-Gerüst (Routing/Shell)¹ |       3 |      2.720 |  3,8 % |   907 | JSX 52 %, Kommentar 23 %, Import 11 %                                         |
| Raster/Visualisierung       |       2 |      2.331 |  3,2 % | 1.166 | JSX 37 %, Logik 26 %, Kommentar 23 %                                          |
| Fachlogik rein²             |       3 |      1.846 |  2,6 % |   615 | Kommentar 35 %, Funktionen 33 %, Hook 13 %                                    |
| 3D/Grafik                   |       2 |      1.752 |  2,4 % |   876 | Funktionen 58 %, Klasse `BikeViewer` 24 %                                     |
| CSS                         |       1 |      1.436 |  2,0 % | 1.436 | Regeln 57 %, Kommentar 33 %, Leer 10 %                                        |
| Edge-Function               |       1 |        623 |  0,9 % |   623 | Funktionen 48 %, Kommentar 35 %                                               |
| **Summe**                   |  **88** | **72.292** |  100 % |   822 |                                                                               |

¹ Diese Art ist ergänzt; Routing und Shell passen in keine der vorgegebenen Arten. ² `appointments/wegpruefung.ts` enthält den Hook `useWegpruefung` (ab Zeile 288) und ist damit nicht vollständig rein.

**Über alle 88 Dateien** (ohne CSS, 70.856 Zeilen): JSX 27,5 %, Komponentenlogik 20,8 %, **Kommentar 17,1 % (12.099 Zeilen)**, Hilfsfunktionen 8,2 %, RPC-Funktionen 5,8 %, Leer 5,5 %, Import 4,9 %, Zod 3,7 %, Konstanten 3,2 %, Typen 1,4 %, Hooks 1,3 %.

Die Dateien je Art, Zeilen in Klammern; `src/features/` ist weggelassen:

- **Datenschicht (12):** platform/api.ts (2.314), appointments/api.ts (2.213), billing/api.ts (1.499), teamchat/api.ts (1.277), treatment-bases/api.ts (989), training/api.ts (754), fleet/api.ts (718), documentation/api.ts (640), platform/ablage.ts (602, Geräteablage in IndexedDB), exercise-plans/api.ts (595), files/api.ts (584), reimbursements/api.ts (549).
- **Seite/Seitenabschnitt (37):** appointments/CalendarPage (2.072), billing/InvoiceDetailPage (1.700), today/MyDayPage (1.343), scheduling/SchedulingPage (1.232), billing/CatalogPage (1.222), platform/Uebungen (1.139), platform/Durchfuehrung (985), treatment-bases/PatientTreatmentBasesPage (964), platform/Uebersicht (933), files/Dateiliste (927), appointments/AppointmentSeriesPage (926), documentation/CompleteTreatmentPage (846), retention/AufbewahrungPage (748), documentation/PatientRecordDocumentation (733), platform/Einstieg (732), assessments/ErhebungPage (707), therapy-reports/TherapieberichtPage (702), staff/StaffAccountSection (700), appointments/FolgeterminVorschlaege (683), appointments/TagUmplanenPage (674), statistics/StatisticsPage (663), fleet/WerkstattblattPage (645), patients/PatientMasterDataPage (635), billing/ServicesPage (624), training/TrainingClientPage (617), exercises/UebungPage (606), nutrition/ErnaehrungReiter (599), fleet/FleetPage (597), appointments/PatientAppointmentsPage (595), platform/Nachrichten (586), platform-access/PlattformAbschnitt (571), platform-access/Vertretungen (567), offline-documentation/AufDemGeraet (554), documentation/TreatmentNotePage (544), exercise-plans/PlanPage (531), teamchat/Anhaenge (514), platform/Tagebuch (512).
- **Formular (18):** reimbursements/RequestReimbursementPage (860), assessments/BausteinFeld (822), timeaccount/RecordTimeAccountPage (769), working-time/RequestWorkingTimePage (720), exercise-plans/Planeditor (715), teamchat/Eingabe (711), documentation/Textverlustschutz (695, Formular-Infrastruktur), nutrition/ProfilFormular (662), appointments/EditAppointmentPage (625), training/TrainingProtocol (614), appointments/NewAppointmentPage (612), staff/Einrichtungsseiten (600), treatment-bases/TreatmentBasisFormPage (584), vacation/UrlaubBeantragenPage (560), appointments/AppointmentFormFields (555), staff/NewStaffMemberPage (549), training/TrainingAssessments (541), exercises/Formulare (515).
- **Dialog (4):** fleet/CheckupFenster (1.453), appointments/TerminAktionen (1.341), fleet/Pannenfenster (624), src/components/ui/Dialogfenster (538).
- **Raster/Visualisierung (2):** appointments/CalendarGrid (1.647), files/FotosImVerlauf (684).
- **3D/Grafik (2):** fleet/bike3d/model.ts (1.043), fleet/bike3d/viewer.ts (709).
- **Fachlogik rein (3):** appointments/calendar.ts (793), appointments/wegpruefung.ts (540), session/types.ts (513).
- **Definitionen/Daten (5):** assessments/schema.ts (839), src/app/navigation.tsx (702), preview/demodaten.ts (654), exercises/katalog/eintraege/sh.ts (536), src/app/funktionen.ts (526).
- **App-Gerüst (3):** platform/PlattformApp (1.113), src/routes/AuthenticatedRoutes (950), src/app/AppShell (657).
- **CSS:** src/index.css (1.436). **Edge-Function:** supabase/functions/location-provider/ptv.ts (623).

#### 2a.2 Die 16 Dateien über 1.000 Zeilen

| Datei                           | Zeilen | Art          |     exp. Fn | Zod-Dekl. (`z.object`) | Endpunkte | useState/useEffect/useQuery/useMutation | Komponenten | Kommentar  |
| ------------------------------- | -----: | ------------ | ----------: | ---------------------- | --------: | --------------------------------------- | ----------: | ---------- |
| platform/api.ts                 |  2.314 | Datenschicht |          97 | 40 (63)                |        70 | –                                       |           0 | 308 (13 %) |
| appointments/api.ts             |  2.213 | Datenschicht |          67 | 22 (12)                |        31 | –                                       |           0 | 712 (32 %) |
| appointments/CalendarPage.tsx   |  2.072 | Seite        |           1 | –                      |         – | 13/7/8/1                                |           1 | 454 (22 %) |
| billing/InvoiceDetailPage.tsx   |  1.700 | Seite        |           1 | –                      |         – | 10/1/4/8                                |          14 | 279 (16 %) |
| appointments/CalendarGrid.tsx   |  1.647 | Raster       | 1 + 6 Typen | –                      |         – | 2/4/0/0 (11 useRef)                     |           2 | 437 (27 %) |
| billing/api.ts                  |  1.499 | Datenschicht |          45 | 18 (27)                |        39 | –                                       |           0 | 264 (18 %) |
| fleet/CheckupFenster.tsx        |  1.453 | Dialog       |           1 | –                      |         – | 16/0/0/2                                |           9 | 122 (8 %)  |
| src/index.css                   |  1.436 | CSS          |           – | –                      |         – | –                                       |           – | 473 (33 %) |
| today/MyDayPage.tsx             |  1.343 | Seite        |           1 | –                      |         – | 3/3/5/0                                 |  5 + 1 Hook | 293 (22 %) |
| appointments/TerminAktionen.tsx |  1.341 | Dialog       |           2 | –                      |         – | 12/0/4/6                                |          10 | 244 (18 %) |
| teamchat/api.ts                 |  1.277 | Datenschicht |          58 | 18 (19)                |        45 | –                                       |           0 | 209 (16 %) |
| scheduling/SchedulingPage.tsx   |  1.232 | Seite        |           1 | –                      |         – | 13/5/3/2                                |           6 | 176 (14 %) |
| billing/CatalogPage.tsx         |  1.222 | Seite        |           1 | –                      |         – | 12/2/2/5                                |           7 | 162 (13 %) |
| platform/Uebungen.tsx           |  1.139 | Seite        |           2 | –                      |         – | 2/0/4/1                                 |          18 | 153 (13 %) |
| platform/PlattformApp.tsx       |  1.113 | App-Gerüst   |           1 | –                      |         – | 2/1/6/1                                 |          17 | 193 (17 %) |
| fleet/bike3d/model.ts           |  1.043 | 3D           |           5 | –                      |         – | –                                       |           0 | 69 (7 %)   |

Die Endpunkte stammen aus `klassen.json` (Klasse c, Zuordnung zur TS-Datei). Die übrigen Werte sind per grep gezählt; useState wurde als Aufruf `useState(`/`useState<` gezählt.

##### platform/api.ts (2.314): eine Datei, deren Größe die Summe ihrer Endpunkte ist

- **Zählwerte:** 70 Endpunkte in 68 RPC-Funktionen, davon 51× `getSupabase().rpc` und 20× `verbindung.rpc`. Dazu 40 Zod-Deklarationen, 23 Query-Schlüsselfunktionen, 8 Fehlertextfunktionen (`wunschfehler`, `bogenfehler`, `einwilligungsfehler`, `nachrichtenfehler`, `anhangfehler`, `gewohnheitsfehler`, `ernaehrungsfehler`, `tagebuchfehler`), 35× `const satz =`, 82× `throw new Error` und 40× `antwort(`.
- **Zusammensetzung:** RPC-Funktionen 948 Zeilen (41 %), Zod 566 (24 %), Kommentar 308 (13 %), Hilfsfunktionen (Schlüssel, Fehlertexte) 188 (8 %), Leer 186 (8 %), Typen 65 (3 %). Ø 13,7 Codezeilen je RPC-Funktion.
- **Gliederung:** 22 Abschnittsköpfe `// ---`, ein Abschnitt je Ticket.

| Zeilen                      | Abschnitt                                                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1–112                       | Importe, `kontextSchema` 35–54, `Verbindung`/`DIREKT` 58–77, Abmelden                                                                            |
| 113–157 · 158–205 · 206–324 | Vertretungen (POR-007) · Termine (POR-008) · Terminwünsche (POR-009)                                                                             |
| 325–412                     | Befundbogen (POR-012), das Muster in Reinform: Schema 328–339, Schlüssel 342–345, Laden 346–358, `bogenfehler` 359–370, drei Schreibwege 371–415 |
| 413–562                     | Eigene Rechnungen (POR-013); `rechnungSchema` 469–539 (71 Zeilen)                                                                                |
| 563–653 · 654–721           | Dokumente (POR-014) · Einwilligungen (POR-016/017)                                                                                               |
| 724–727 / 728–793 / 794–881 | Kopf „Datenexport“ **ohne Inhalt**, darunter eingeschoben „Trainingspaket und Preise“ (ANG-008), erst danach der Datenexport-Code                |
| 882–1180                    | Einstieg, Nachsorge-Abo, Trainingsangebot/Buchung/Vertrag (KND-003/004)                                                                          |
| 1181–1350                   | Übungen und Übertragung (UEB-009), `einheitUebertragen` 1302–1335 mit SQLSTATE-Abbildung 1329–1331                                               |
| 1351–1664                   | Nachrichten, Anhänge (`anhangSenden` 1545–1626, 82 Zeilen)                                                                                       |
| 1665–1902                   | Benachrichtigungen/Geräte, Check-in, Gewohnheiten                                                                                                |
| 1903–2314                   | Ernährung, Lebensmittel, Tagebuch, Erinnerungen (ERN-002, ERN-EPIC-002/003)                                                                      |

- **Warum so groß:** Jeder Endpunkt bringt dieselben vier Teile mit: Schema (Ø ~14 Zeilen), Funktion (Ø 13,7) mit Cast `as { data: unknown; error: … }`, `if (error) throw` und `antwort(schema, …, satz)`, eine Schlüsselfunktion (4 Zeilen) und oft eine Fehlertextfunktion. 70 × ~30 Zeilen ergeben die Datei fast vollständig.
- **Schwäche:**
  - Jede RPC ist von Hand geschrieben; einen Vertrag gibt es nicht.
  - Zwei Aufrufwege bestehen nebeneinander: `verbindung` gibt es nur an den 20 Lesewegen, die die Einsicht (E-001) braucht.
  - Das Rechnungsschema ist doppelt. `rechnungSchema` hat 55 Feldnamen gemeinsam mit `dokumentSchema` in billing/api.ts:565–672. Grund: ADR-023 Punkt 26 verbietet Importe aus Praxisfeatures, und es gibt keinen gemeinsamen Ort für Verträge. `@/lib` wäre laut `platform/trennung.test.ts:18–74` erlaubt.
  - Abschnitte werden eingefügt statt einsortiert (724–727).

##### appointments/api.ts (2.213): Datenschicht und fehlender Domänenkern in einer Datei

- **Zählwerte:** 31 Endpunkte in 30 RPC-Funktionen mit **Ø 18,1 Codezeilen**, dem höchsten Wert der 12 Datenschicht-Dateien. Dazu 22 Zod-Deklarationen, 54 `message?.includes`-Zweige, 2 Fehlerklassen, 7 Label-Records, 14× `.parse(` neben 12× `antwort(`.
- **Zusammensetzung:** Kommentar 712 (32 %), RPC 560 (25 %), Hilfsfunktionen 375 (17 %), Zod 218 (10 %), Leer 183 (8 %), Konstanten 98 (4 %).

| Zeilen                            | Inhalt                                                                                                                 | Zeilen |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -----: |
| 21–234                            | Begriffe: Terminart, Status, Absagegründe, Kanäle, `appointmentKindSchema` 223, `terminAnlassSchema` 227, Labels, Töne |    214 |
| 235–336                           | `appointmentSchema` (82) und `TERMIN_SPALTEN`                                                                          |    102 |
| 406–438, 1512–1578                | Zeitzonenhelfer (`todayInTimeZone`, `dayKey`, `zeitpunktIn`, `zonenversatz`, `minutesOfDay`)                           |   ~100 |
| 439–538, 813–916                  | Pfad- und URL-Wissen (`terminPfad`, `kalenderZumTermin`, `TERMIN_PARAM`, Vorbelegung über Suchparameter)               |    204 |
| 539–686                           | Formularschema, Terminfenster, Längenregeln                                                                            |    148 |
| 917–963, 1616–1726                | Fehlerklassen und `schreibfehler` (21 `includes`-Zweige)                                                               |    158 |
| 964–1398                          | Anlegen/Ändern: Termin, Ereignis, Serie (`createAppointment` 964–1033)                                                 |    435 |
| 1399–1511 · 1727–1926 · 1927–2213 | Kalender lesen · Statuswechsel · Slots, Zettel, Benachrichtigung, Hausbesuche                                          |    600 |

- **Warum so groß:** Nur ein Viertel ist RPC-Code. Rund 830 Zeilen (38 %) sind gar keine Datenschicht: Begriffe, Zeitzonen, Pfade, Formularregeln, Fehlerabbildung.
- **Schwäche:** Der Domänenkern „Termin“ fehlt als eigenes Modul. Deshalb importieren laut FAKTEN 28 Nutzer diese Datei und 23 allein `todayInTimeZone`. Das ist ein naheliegender Treiber der Querimporte und Zyklen rund um appointments (Schlussfolgerung, nicht gemessen).

##### appointments/CalendarPage.tsx (2.072): eine Komponente mit 1.825 Zeilen

- **Aufbau:** Importe 1–97, 9 Hilfsfunktionen 120–247, `CalendarPage` 248–2072 (88 % der Datei).
- **Hooks:** 13 useState, 6 useRef, 7 useEffect, 8 useQuery, 1 useMutation, 5 useMemo, dazu `useFahrwege` und `useLueckenfinder`.

| Zeilen    | Verantwortung in derselben Komponente                                             | Zeilen |
| --------- | --------------------------------------------------------------------------------- | -----: |
| 248–338   | URL-Parameter, gemerkter Kalenderstand, eingetragene Fehlzeit                     |     91 |
| 339–427   | Refs, Sprungtermin, 4 Effekte                                                     |     89 |
| 428–539   | 8 Abfragen (Personen, Standorte, Termine, belegt, Wünsche, Wochenplan, Ausnahmen) |    112 |
| 540–643   | Verschieben-Mutation, `setze`, `zoomen`                                           |    104 |
| 644–997   | Spalten, Fahrwege, Lückenfinder, Check-up-Spalten, Spaltenmodell, Gittereinträge  |    354 |
| 998–1104  | `wegfrageFuer`, `ablegen` (Entscheidung beim Drag & Drop)                         |    107 |
| 1105–1264 | `anlegenMenue`, Trainingstermin anlegen                                           |    160 |
| 1265–1329 | Lade- und Kopfzustand                                                             |     65 |
| 1330–2072 | JSX, darin `CalendarGrid` mit 26 Props und `TerminAktionenDialog`                 |    743 |

- **Zusammensetzung:** Logik 36 %, JSX 28 %, Kommentar 22 %, Import 5 %.
- **Schwäche:** Eine einzige Komponente hält URL-Zustand, Datenladen, Gestenentscheidung, Anlegemenü, abgeleitete Spaltenmodelle und Layout. Tag- und Wochenansicht sind **33 Weichen** `p.ansicht === 'tag' | 'woche'` (z. B. 1106–1107) statt einer Ansichtsstrategie. Die 26 Props an das Raster zeigen, wie viel Zustand durchgereicht wird.

##### billing/InvoiceDetailPage.tsx (1.700): 14 Abschnitte, jeder mit eigenem Datenweg

- **Komponenten:** InvoiceDetailPage 132–190, Rechnungskopf 227–277, StammdatenFehlen 278–308, Rechnung 309–390, Dokument 391–542, Ausstellmeldung 583–607, **Zahlungen 608–795**, Guthaben 796–885, Zahlungserinnerungen 886–1034, **Stornokette 1035–1208**, Empfaengerwahl 1209–1357, **Empfaengerformular 1367–1540**, Kontrollwerte 1541–1573, Entwurfsaktionen 1574–1700.
- **Zusammensetzung:** JSX 48 %, Logik 21 %, Kommentar 16 %. 4 useQuery, 8 useMutation, 10 useState, 4 Rückfragen.
- **Schwäche:** Jeder Abschnitt bringt eigene Abfrage, Mutation und von Hand geschriebene Invalidierung mit; die Stornokette lädt in 1069–1075 vier Schlüssel einzeln nach. Lade- und Fehlerweichen sind ebenfalls von Hand geschrieben (Zahlungen 645–653), obwohl `Abfragezustand` existiert. Dazu kommen zwei Formulare direkt in der Seite. Kommentare tragen Änderungshistorie, etwa „Seit UXR-010 (ABR-07)“ und „ABN-008: … sperrt das Storno nicht mehr“ in 1047–1065.

##### appointments/CalendarGrid.tsx (1.647): Raster, drei Gesten und Steuerung in einer Komponente

- **Aufbau:** 6 exportierte Typen in 52–361 (168 Typzeilen). `CalendarGrid` 377–1374 (998 Zeilen: Logik 341, JSX 657) mit 26 Props in 377–499. `Kachel` 1375–1647.
- **Hooks:** 11 useRef, 4 useEffect und die Gestenhaken `useTerminZiehen` (521), `useSpanneAufziehen` (556) und `useZweiFingerZoom` (710). Kommentar 27 %.
- **Schwäche:** Darstellung, Gesten, Scroll- und Sprungsteuerung (581–657), Auswahl und Anlegeleiste liegen zusammen. Die Kachel unterscheidet den Kontext per Ternär: 1513 `kind === 'internal'`, 1528 `kind === 'training'`.

##### billing/api.ts (1.499)

- **Gliederung:** 10 Abschnitte: Leistungskatalog 26, Honorarvereinbarung 204, Stammdaten 281, Empfänger 347, **Rechnungen 415–931 (517 Zeilen)**, Zahlungserinnerung 932, Zahlungen und offene Posten 1006, Leistungen 1150, Einnahmen 1342, Rechnungen der Akte 1462.
- **Zählwerte:** 39 Endpunkte in 37 Funktionen (Ø 12,6). 18 Zod-Deklarationen, davon `dokumentSchema` 565–672 mit 108 Zeilen. 8 Fehlerklassen (237–1264), 23 `includes`-Zweige, **19× `.parse(` und 0× `antwort(`**.
- **Zusammensetzung:** RPC 33 %, Zod 24 %, Kommentar 18 %, Leer 11 %.
- **Schwäche:** Die Antwortformen sind von Hand gespiegelt. Die Datei validiert noch im alten Stil: `antwort()` wurde laut `src/lib/antwort.ts:1–16` gerade gegen englische ZodError-Texte in der Oberfläche eingeführt (R3-023). Das Rechnungsdokument ist ein zweites Mal in platform/api.ts beschrieben.

##### fleet/CheckupFenster.tsx (1.453)

- **Aufbau:** 74 Importzeilen. `CheckupFenster` 103–718: Zustand 103–167, zwei Mutationen 176–237, **18 Handlerfunktionen 238–475**, Ableitungen 476–536, JSX 537–718.
- **Seitenkomponenten:** Punktseite 826–1012, Werbungsseite 1013–1084, Fotoseite 1085–1152, Abschluss 1153–1364.
- **Zählwerte:** 16 useState, 38 Weichen `seite.art === …`. Logik 45 %, JSX 35 %, Kommentar nur 8 %.
- **Schwäche:** Die Ablaufregeln liegen bereits rein in `fleet/checkupablauf.ts` (Import 50–68). Der Dialog orchestriert aber 3D-Fokus, Stellen am Rad, Fotos, Speichern, Wiederholen und Verlustschutz zugleich. Der Seitentyp wird über 38 Weichen statt über eine Seitentabelle verteilt.

##### src/index.css (1.436)

| Zeilen    | Teil                                                       | Kommentar / Regeln |
| --------- | ---------------------------------------------------------- | ------------------ |
| 1–46      | Import, Schrift                                            | 33 / 10            |
| 47–441    | `@theme`: 133 Tokens                                       | **229 / 137**      |
| 442–588   | Plattformschrift, Basis, Telefonregeln                     | 52 / 94            |
| 589–722   | Bewegung der Plattform (7 Keyframes), `@utility schraffur` | 28 / 104           |
| 723–866   | Basisschicht der Bausteine                                 | 34 / 96            |
| 867–1347  | Bewegungsbausteine (ANN-567, 19 Keyframes)                 | 73 / 337           |
| 1348–1436 | Druck                                                      | 42 / 39            |

- **Befund:** Hier liegt kein Anbau im Code-Sinn vor; die Tokens sind Grunddesign.
- **Wo die Größe herkommt:** zu 33 % aus Entscheidungsprotokoll im Kommentar, z. B. 48–60: „Papier ist seit UI-002b weiß (Rückmeldung von Jannes, 12.09.2026)“. Außerdem aus Bewegungsregeln, die jeder Baustein selbst mitbringt.
- **Wachstum:** seit 2026-10-16 von 967 auf 1.436 Zeilen, die Keyframes von 12 auf 29.

##### Die übrigen 8 Dateien über 1.000 Zeilen

- **today/MyDayPage.tsx:** `MeinTag` 328–1037 (Logik 546, JSX 156) enthält 9 Render-Funktionen statt Komponenten: `haken` 408, `dokuFuer` 457, `ausfall` 474, `zeilenAktionen` 488, `dokuKnopf` 520, `knopfreihe` 542, `hakenZuruecknehmen` 558, `zeilenKarte` 579, `karte` 706–830. Dazu 10 `kind`-Vergleiche und 3 `occasion`-Vergleiche.
- **appointments/TerminAktionen.tsx:** Je Zustandsübergang eine Komponente: GebuehrVerzicht 244–278, WiederOeffnen 327–372, AbsageAktion 373–601, EreignisAbsageAktion 602–699, SerieAbsageAktion 700–803, StatusAktion 804–865. Dazu die Sammelkomponente 866–1278. 6 useMutation, 5 Rückfragen, 18 Statusvergleiche. Ereignis- und Serienabsage haben **57 von 95 eindeutigen Zeilen gemeinsam**.
- **teamchat/api.ts:** Als einzige Datenschicht-Datei nach Schichten gegliedert: Schemas 38, Fehler 243, Schlüssel 348, Lesen 397, Profilbild 461, Personenkarte 537, Schreiben 650, **Anhänge 692–1196**, Darstellung 1197–1277. Sie hat einen eigenen Wrapper `rufe` (331–350), SQLSTATE-Klassen (`VORUEBERGEHEND` 314) und eine Satztabelle (248–283). Ergebnis: Ø **10,3** Codezeilen je Endpunkt, der niedrigste Wert der Datenschicht. Das belegt, was schon ein lokaler Vertrag spart.
- **scheduling/SchedulingPage.tsx:** Zwei Editoren auf einer Seite: Wochenplan 300–593 und Abweichungen 636–979 (Logik 228), dazu ArbeitszeitJePerson 1045–1232. 13 useState, 5 useEffect, eigene Blockprüfung 98–116.
- **billing/CatalogPage.tsx:** Preisliste 504–897 (394 Zeilen), Positionsformular 1014–1222. `pruefe` 174–218 baut die DB-CHECKs von `service_catalog_items` nach. 5 useMutation.
- **platform/Uebungen.tsx:** 18 Komponenten. Online- und Gerätefassung desselben Reiters stehen nebeneinander (44 Bezüge auf Gerät, Ablage und Wartestand). Eigenes Symbolset `SVG` ab 985. Seit 2026-10-16 um 665 Zeilen gewachsen.
- **platform/PlattformApp.tsx:** `Geruest` 146–591 (446 Zeilen) ist eine Routentabelle als JSX: 33 `<Route>` mit je eigener Bereichsfilterung, etwa 525/537/548/558 `lesbar.filter((z) => z.relationship_kind === 'treatment' | 'training')`. Der Ich-Bereich 749–1113 hat eine Zeilenkomponente je Produkt (Abo, Paket, Vertrag, Ernährung, Vertretung).
- **fleet/bike3d/model.ts:** `buildCargoBike` 219–983 macht 765 Zeilen aus (73 %), mit 751 Dezimalliteralen und 58 Konstruktoren aus three.js. Die Datei ist ein Port aus `docs/design/lastenrad-3d/kanvas/Lastenrad3D.dc.html` (Kopf 34–45). Das ist kein Anbau, sondern Geometrie als Code statt als Asset.

##### Querschnitt: welche Architekturschwäche dahinter steckt

| Schwäche                                  | Beleg                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Jede RPC von Hand                         | 12 Datenschicht-Dateien: 293 RPC-Funktionen mit 3.815 Codezeilen (Ø 13,0), darin 621 `p_`-Argumentzeilen, 309 `if (error)`, 382 `throw`. Im Repo gibt es keinen generierten `Database`-Typ: `src/lib/supabase.ts:19` ruft `createClient` ohne Typparameter auf.                                                                                                                                                                                 |
| Antwortformen gespiegelt statt abgeleitet | 178 Zod-Deklarationen mit 2.187 Zeilen in der Datenschicht. `starts_at` steht in 20 Schemas in 12 Dateien, `patient_id` in 31 Schemas in 19 Dateien. Das Rechnungsdokument existiert zweimal.                                                                                                                                                                                                                                                   |
| Fehler als Textsuche                      | SQL: 2.377× `raise exception` mit 1.051 verschiedenen Texten auf nur 14 SQLSTATEs (22023: 947, 42501: 852, P0002: 284). Client: 188 `message.includes` in 28 Dateien, 8 Satztabellen, SQLSTATE-Abbildung an 2 Stellen.                                                                                                                                                                                                                          |
| Domänenkern fehlt                         | appointments/api.ts besteht zu 38 % aus Nicht-Datenschicht. Der Kontext hat drei Vokabulare in DB und TS: `kind` therapy/internal/training, `relationship_kind` treatment/training (7 Spalten), `service_area` therapy/training (6 Spalten). Zwei Stellen übersetzen zwischen ihnen: exercise-plans/PlanPage.tsx:115 und nutrition/BeratungsterminSeite.tsx:83. 11 Tabellen tragen denselben XOR-CHECK `patient_id`/`training_relationship_id`. |
| Seite hält alles                          | CalendarPage ist eine Komponente mit 1.825 Zeilen. `MeinTag` hat 710 Zeilen mit 9 Render-Funktionen. InvoiceDetailPage hat 14 Abschnitte mit 8 Mutationen.                                                                                                                                                                                                                                                                                      |
| Serverregeln im Client nachgebaut         | TerminAktionen.tsx:893–929 (9 Flags), CatalogPage.tsx:174–218, session/types.ts mit 39 `can*`-Spiegeln.                                                                                                                                                                                                                                                                                                                                         |
| Wissen dreifach                           | 151 Routen, 49 Navigations- und 23 Funktionspfade. 43 Navigationspfade und alle 23 Funktionspfade stehen zusätzlich als Literal in den Routen.                                                                                                                                                                                                                                                                                                  |

#### 2a.3 Anbau-Spuren

| Spur                                                                                                                    |               88 Dateien (72.292 Z.) | ganzes Programm (953 ts/tsx ohne Tests, 203.263 Z.) |
| ----------------------------------------------------------------------------------------------------------------------- | -----------------------------------: | --------------------------------------------------: |
| Kontextvergleich mit Literal (`===`/`!==` gegen therapy, training, internal, treatment, nutrition_counselling, regular) |                   85 (36 als Ternär) |                                 178 (79 als Ternär) |
| Statusvergleich `.status === '…'`                                                                                       |                                  125 |                                                 298 |
| `if (`-Zeilen                                                                                                           |             1.689 (23,4 je 1.000 Z.) |                            4.998 (24,6 je 1.000 Z.) |
| Fehlertextsuche `message.includes('…')`                                                                                 | 126 (in den 12 Datenschicht-Dateien) |                                   188 in 28 Dateien |
| Ticketkennungen in Kommentarzeilen (Regex aus scripts/kommentare-check.mjs:15)                                          |         **1.489 (427 verschiedene)** |                                                   – |
| ANN- / ADR-Verweise in Kommentarzeilen                                                                                  |         624 (299 verschiedene) / 443 |                          ANN: 1.768 Kommentarzeilen |
| Änderungshistorie im Kommentar („seit/bis <Ticket>“, „vorher“, „früher“, „nicht mehr“, „neu ist“)                       | 155 Zeilen (67× „seit/bis <Ticket>“) |                                                   – |
| Kommentarzeilen mit Datum / mit „Jannes“                                                                                |                             125 / 31 |                                            392 / 86 |
| Wortsuche „Ausnahme“ / „Sonderfall“ / „falls“ im Kommentar / „sonst“ im Kommentar                                       |                      8 / 1 / 2 / 187 |                                      27 / 3 / – / – |

**Lesart:**

- Sonderfälle heißen im Code nicht „Sonderfall“. Sie stehen als zusätzliche Bedingung mit Ticketkennung im Kommentar daneben: 20,6 Ticketkennungen je 1.000 Zeilen.
- Die `if`-Dichte der 88 Dateien entspricht dem Rest des Programms. Anbau zeigt sich also nicht in der Zahl der Verzweigungen, sondern darin, _wo_ sie stehen: Kontextregeln stecken in Seiten und Dialogen statt an einem Ort.

**Fünf typische Beispiele:**

1. **today/MyDayPage.tsx:414–422:** `if (!darfTermine || // ERN-012: Die Ernährungsberatung wird abgehakt, auch im Training. (termin.kind !== 'therapy' && termin.occasion !== 'nutrition_counselling') || …)`. Ein neuer Anlass wird zur Zusatzbedingung. Die Sonderbehandlung des Anlasses `nutrition_counselling` steht in anderer Form wieder in 437–440 und 458–461. Der vorhandene Helfer `istBeratung` (appointments/api.ts:230–233) wird dabei nicht genutzt.
2. **appointments/TerminAktionen.tsx:893–929:** Neun Flags (`darfVerwalten`, `darfAendern`, `darfWiederOeffnen`, `hakenOffen`, `beratung`, `darfDokumentieren`, `darfVerzichten`, `istEreignis`, `istHausbesuch`) ergeben sich aus Rolle × Status × `kind` × `occasion` × `fee_basis`. Damit wird der Zustandsautomat aus ADR-018 im Client rekonstruiert. Der Kommentar daneben sagt selbst: „Verbindlich pruefen das die Serverfunktionen“.
3. **appointments/api.ts:1626–1726** `schreibfehler`: 21 Zweige `if (error?.message?.includes('…'))` gegen englische Servertexte, je Ticket ergänzt (TRN-009, ANN-574, TRN-004, B7/ANN-515). `createAppointment` 1001–1027 wiederholt fünf davon inline und ergänzt einen sechsten.
4. **appointments/CalendarPage.tsx:** Z. 960 `ziehbar: e.status === 'confirmed' && e.kind !== 'training' && darfAendern`, Z. 1004 `g.eintrag.kind === 'internal'`. Dazu kommen 33 Weichen `p.ansicht === 'tag' | 'woche'`, etwa 1106–1107: `p.ansicht === 'tag' ? gewaehlt.spalteId : wochenPerson`.
5. **billing/CatalogPage.tsx:174–218** `pruefe`: Je `item_kind` (`aftercare_month`, `training_package`, `absence_fee`) und `service_area` ist eine if-Regel angebaut (ANG-002, ANG-005, ADR-021). Der Kommentar sagt selbst: „Verbindlich ist die Constraint in der Datenbank“. Die Regel steht also zweimal.

Weitere Belege: platform/api.ts:724–793. Dort steht ein leerer Kopf „Datenexport“, darunter der eingeschobene Abschnitt „Trainingspaket“, und erst danach folgt der Datenexport-Code (794–881). `platform/trennung.test.ts:18–74` führt 23 Ausnahmen, jede mit eigener Ticketbegründung.

**Halb vollzogene Vereinheitlichungen:** Bausteine wurden eingeführt, die Altform blieb daneben stehen.

| Baustein                                                                                                                    | Neu                                                                                                                                                        | Daneben weiter                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Abfragezustand` (src/components/ui/Abfragezustand.tsx; der Kopfkommentar nennt „rund 200-mal“ selbst geschriebene Weichen) | 46× in den 88, 153× gesamt                                                                                                                                 | 184 Ternäre `isPending ?`/`isError ?` in den 88 (512 gesamt; 2b Fund 10 zählt dagegen ganze Lade-/Fehler-/Leer-Blöcke), 125 selbst geschriebene Lade-, Fehler- und Leer-Elemente (472 Zeilen)                                                                                                                                                                         |
| `antwort()` (src/lib/antwort.ts, R3-023)                                                                                    | 222 Aufrufe                                                                                                                                                | 66× `.parse(` in 12 api.ts (billing 19, appointments 14, treatment-bases 8, …)                                                                                                                                                                                                                                                                                        |
| RPC-Wrapper                                                                                                                 | –                                                                                                                                                          | 11 lokale Varianten in 10 Modulen: teamchat:331, fleet:308, vacation:164, reimbursements:189, feedback:107, timeaccount:152, working-time:181, exercise-plans:268 und 550, nutrition/api.ts:115, nutrition/lebensmittelApi.ts:22. Dazu `Verbindung` in platform/api.ts:63–76. Daneben direkte Aufrufe `getSupabase().rpc` (platform 51, billing 39, appointments 30). |
| Satztabellen für Fehler                                                                                                     | 8 Tabellen: teamchat:248, fleet:261, exercise-plans:213/528, reimbursements:152, feedback:94, timeaccount:108, vacation:137                                | if-Ketten in appointments, billing, documentation, treatment-bases, training, platform                                                                                                                                                                                                                                                                                |
| Upload pending→ready                                                                                                        | In der DB fünfmal derselbe Status-CHECK: fleet_photos, platform_message_attachments, staff_reimbursement_receipts, team_message_attachments, patient_files | Fünf Implementierungen mit zusammen 372 Zeilen: platform/api.ts:1545–1626, teamchat/api.ts:791–893, files/api.ts:139–218, reimbursements/api.ts:449–496, fleet/api.ts:611–669                                                                                                                                                                                         |

**Wachstum:** Der Klon ist flach; der älteste Commit ist ee7fbd1 vom 2026-10-16.

- 75 der 88 Dateien gab es damals schon: 59.030 Zeilen, heute 63.335. Das sind +4.305 Zeilen in 9 Tagen.
- 13 Dateien sind neu, zusammen 8.957 Zeilen. Umbenennungen sind nicht verfolgt.
- Größte Zuwächse: platform/Uebungen +665, platform/Einstieg +611, platform/Uebersicht +543, platform/api.ts +483 (1.831 → 2.314), index.css +469.
- Die großen Praxisdateien blieben gleich (CalendarPage, InvoiceDetailPage) oder schrumpften (SchedulingPage −209). Angebaut wird derzeit vor allem in der Plattform.

#### 2a.4 Grunddesign: sieben Bausteine und ihre Reichweite

| #   | Baustein                                                                                                                                                                                                                                                                                                                                 | ersetzt (Messbasis in den 88)                                                                                                                                                        | Herleitung                                                                                                                                                                                                                                                                 |                                    Zeilen (Schätzung) |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------: |
| B1  | **Endpunkt-Vertrag:** eine Tabelle `name → Argumente, Rückgabe, Fehlerschlüssel, Nachladeschlüssel` und ein Client. Der Client übernimmt Fehlerklassen, SQLSTATE, Einsichtsverbindung E-001 und den Datei-Weg pending→ready. Rückgabetypen werden aus `pg_catalog` generiert.                                                            | 293 RPC-Funktionen mit 3.815 Codezeilen, 178 Zod-Deklarationen, 39 Schlüsselfunktionen, 5 Upload-Wege                                                                                | Je Datei gerechnet: (Codezeilen − 4 × Funktionen) + 84 % der Zod-Codezeilen + 3 je Schlüsselfunktion. Die 84 % ergeben sich so: 457 von 544 Endpunkten haben eine generierbare Rückgabe (156 RETURNS TABLE, 133 void, 168 Skalar); 87 jsonb-Endpunkte bleiben Handvertrag. |                                               ≈ 4.600 |
| B2  | **Abfrage- und Aktionshaken aus der Tabelle:** `useEndpunkt(name, args)` und `useAktion(name)` mit deklarativem Nachladen; `Abfragezustand` als einziger Weg                                                                                                                                                                             | 116 `useMutation` (1.565 Z., Ø 13,5), 154 `useQuery` (887 Z., Ø 5,8), 151 `invalidateQueries`-Zeilen, 125 Lade-, Fehler- und Leer-Elemente (472 Z.) in 65 tsx                        | Mutation auf 4 Zeilen, Abfrage auf 2 Zeilen; 70 % der Zustandselemente entfallen                                                                                                                                                                                           |                                               ≈ 2.000 |
| B3  | **Kontext als Strategie:** ein Typ Terminkontext/Verhältnis (therapy · training · internal × occasion) mit Fähigkeiten: abhakbar, dokumentierbar, ziehbar, abrechenbar, Detailpfad, Bezeichnung, Ansprechperson. Ein Vokabular.                                                                                                          | 85 Kontextvergleiche, 2 Übersetzungen therapy↔treatment                                                                                                                              | 3 Zeilen je Vergleich                                                                                                                                                                                                                                                      |                  ≈ 250 (Nutzen vor allem Korrektheit) |
| B4  | **Geführter Ablauf als Daten plus Antragsautomat:** Schrittlisten über `GefuehrterAblauf`/`abfolge.ts`. Ein Antragsbaustein für den Automaten requested → approved / rejected / withdrawn (+ cancelled/paid), der in staff_leave_requests, staff_working_time_requests und staff_reimbursements gleich ist, mit `decide_*`/`withdraw_*`. | Ablaufkomponenten der 4 Antragsseiten (2.324 Z.); 6 weitere geführte Abläufe (4.632 Z.)                                                                                              | −45 % bzw. −10 %, abzüglich ~200 schon in B2 gezählter Zeilen                                                                                                                                                                                                              |                                               ≈ 1.300 |
| B5  | **Formular-Baustein:** Formularschema → Felder, Feld-IDs, Pflicht- und Formatprüfung, Serverfehler → Feld. Prüfregeln werden aus den DB-CHECKs abgeleitet statt nachgebaut.                                                                                                                                                              | Formulare ohne Antragsseiten 8.800 Z. (149 useState, 97 Bezüge auf Feldfehler); Inline-Formulare CatalogPage 1014–1222 und InvoiceDetailPage 1367–1540                               | ~10 % bzw. ~25 %                                                                                                                                                                                                                                                           |                                               ≈ 1.000 |
| B6  | **Aktion mit Rückfrage:** eine Aktionstabelle (Text, Grund, Endpunkt, Meldung, Rückgängig). Ob eine Aktion sichtbar ist, entscheiden vom Server gelieferte erlaubte Übergänge statt einer Flag-Ableitung.                                                                                                                                | 56 `<Rueckfrage>` (1.071 Z., Ø 19,1), Flag-Ableitungen wie TerminAktionen.tsx:893–929                                                                                                | 5 Zeilen je Rückfrage                                                                                                                                                                                                                                                      |                                                 ≈ 800 |
| B7  | **Funktionsregister:** eine Tabelle mit Pfad, Seite, Fähigkeit, Navigationsort, Suchwörtern und Plattformbereich; Fähigkeiten aus `app.can_*` generiert                                                                                                                                                                                  | AuthenticatedRoutes.tsx 950 (151 Routen), app/navigation.tsx 702, app/funktionen.ts 526, PlattformApp `Geruest` 446 (33 Routen), session/types.ts 513 (39 `can*`); zusammen 3.137 Z. | Ziel: 184 Routen × 2 Zeilen + ~400 Zeilen Darstellung ≈ 770–950                                                                                                                                                                                                            |                                               ≈ 2.200 |
| Σ   |                                                                                                                                                                                                                                                                                                                                          |                                                                                                                                                                                      |                                                                                                                                                                                                                                                                            | **≈ 12.150 (Spanne 10.000–14.500) = 17 % der 72.292** |

B1, B2, B3 und B6 sind je Datei aus Messwerten gerechnet (`ersparnis.mjs`: 4.635 / 2.041 / 255 / 791). Die Zielgrößen von 4, 2 bzw. 5 Zeilen sind Annahmen. B4, B5 und B7 sind Prozentschätzungen. Die Fehlerschlüssel aus B1 brauchen maschinenlesbare Codes im SQL; heute verteilen sich 1.051 Texte auf 14 SQLSTATEs. Bis dahin kann die Tabelle die heutigen Textschlüssel tragen.

**Reichweite: Fälle gegenüber Zeilen.**

- Bei den Fällen erreichen die Bausteine **≥ 95 %**. Sie decken alle 293 RPC-Funktionen, 270 Abfrage- und Aktionshaken, 85 Kontextvergleiche, 56 Rückfragen und 184 Routen ab.
- Ausnahmen mit eigenem Erweiterungspunkt: 87 jsonb-Endpunkte, die Einsichtsverbindung und die Offline-Ablage platform/ablage.ts.
- Bei den Zeilen sind es nur **~17 %**. Rund 60.000 Zeilen bleiben:
  - 12.099 Kommentarzeilen,
  - fachspezifische Logik und JSX (allein der Kalender mit CalendarPage, CalendarGrid, calendar.ts und wegpruefung.ts: 5.052 Zeilen),
  - 3D (1.752), CSS (1.436) und Definitionen (3.257).

**Wirkung auf die großen Dateien** (B1/B2/B3/B6 per Formel):

| Datei                                         |         heute |          danach | größter Posten                                                                            |
| --------------------------------------------- | ------------: | --------------: | ----------------------------------------------------------------------------------------- |
| platform/api.ts                               |         2.314 |         ≈ 1.110 | B1 1.201; aufgeteilt je Abschnitt < 120 je Datei                                          |
| appointments/api.ts                           |         2.213 |         ≈ 1.590 | B1 608; der Rest sind die ~830 Zeilen Domänenkern (Zeit, Pfade, Begriffe) → eigenes Modul |
| billing/api.ts                                |         1.499 |           ≈ 880 | B1 620                                                                                    |
| teamchat/api.ts                               |         1.277 |           ≈ 800 | B1 474                                                                                    |
| appointments/TerminAktionen.tsx               |         1.341 |         ≈ 1.025 | B6 208, B2 84                                                                             |
| billing/InvoiceDetailPage.tsx                 |         1.700 |         ≈ 1.540 | B2 90, B6 69                                                                              |
| appointments/CalendarPage.tsx                 |         2.072 |         ≈ 1.930 | B2 138                                                                                    |
| fleet/CheckupFenster.tsx                      |         1.453 |         ≈ 1.400 | B2 48                                                                                     |
| appointments/CalendarGrid.tsx / src/index.css | 1.647 / 1.436 | ≈ 1.640 / 1.436 | –                                                                                         |

**Folgerung:**

- Ein Grunddesign macht die Datenschicht klein und gleichförmig.
- Die großen UI-Dateien schrumpfen dagegen meist um weniger als 10 %, nur `TerminAktionen.tsx` um etwa ein Viertel (B6). Ihre Größe kommt aus gebündelten Zuständigkeiten, nicht aus Wiederholung.
- Dafür braucht es eine **Zerlegungsregel** statt eines weiteren Bausteins: Seite = Datenhaken (B2) + reines Zustandsmodul (wie `fleet/checkupablauf.ts`) + Darstellung. Ansichtsvarianten (Tag/Woche, Online/Gerät) werden Strategien, Abschnitte einer Detailseite eigene Dateien.
- Mit dieser Zerlegung, die keine Zeilen spart, fielen CalendarPage (8 Verantwortungsblöcke à 65–354 Zeilen plus 743 Zeilen JSX) und InvoiceDetailPage (14 Abschnitte à 25–188 Zeilen) je Datei unter 500. Nur der JSX-Block von CalendarPage müsste dafür selbst noch geteilt werden.

**Abweichungen und Präzisierungen zu FAKTEN.md:**

- **Bestätigt:** 88 Dateien, 72.292 Zeilen, 16 über 1.000, 3 über 2.000.
- **Präzisiert:** Der Wert „2,7 % doppelte Zeilen“ unterschätzt die Wiederholung. Sie ist strukturell: 293 RPC-Funktionen folgen einem Fünf-Schritt-Muster, und Ereignis- und Serienabsage teilen 57 von 95 eindeutigen Zeilen, aber nicht als zusammenhängenden 8-Zeilen-Block. Der Scanner wurde nicht nachgemessen.
- **Präzisiert:** Von den 544 Endpunkten der Klasse c rufen die 11 api.ts dieser Liste 305 auf (56 %).
- **Präzisiert:** ts/tsx ohne Tests umfassen per `git ls-files` 953 Dateien mit 203.263 Zeilen; mit index.css sind es 204.699. FAKTEN nennt 204.959; der Rest von 260 Zeilen sind andere Dateitypen, nicht geprüft.
- **Präzisiert:** Die Git-Historie ist flach (317 Commits ab 2026-10-16). Aussagen zum Wachstum gelten nur für 9 Tage.

#### 2a.5 Begründung je Datei: die 72 Dateien mit 501 bis 1.000 Zeilen

Nach der Gegenlese ergänzt. Die 88 Dateien aus 2a.1 sind 87 TS/TSX-Dateien und `src/index.css`. Die 16
Dateien über 1.000 Zeilen stehen in 2a.2. Die übrigen 72 wurden je Datei über ihre Gliederung gelesen:
Exporte, Unterkomponenten, `useState`, `useQuery`/`useMutation`, `z.object` und `.rpc(`.

„Hebel“ nennt den Baustein aus 2a.4 (B1–B7), die Zerlegungsregel (Z), die Kommentarregel (K, bei mehr
als 25 % Kommentar) oder „Inhalt“ (I).

| Datei                                         | Zeilen | Art               | Warum so groß (Beleg)                                                                                                                                                                                                                                      | Hebel          |
| --------------------------------------------- | ------ | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| treatment-bases/api.ts                        | 989    | API               | 15 RPC-Wrapper mit je eigenem Zod-Schema (8 `z.object`) und eigener Fehlerübersetzung über `message.includes` (Löschen, Übertragen, Freigabe), dazu 2 Formularschemata, Entwurfsablage und 26 % Kommentar mit 49 Ticketverweisen                           | B1, B5, K      |
| platform/Durchfuehrung.tsx                    | 985    | Seite (Ablauf)    | 11 Unterkomponenten; `Einheit` allein 327 Z. mit 12 `useState` (Haken, Pause, Index, Notiz, Werte, Schreibzähler …) ohne Zustandsmodul; Online- und Gerätefassung nebeneinander (Serverplan gegen `abgelegterPlan`/Warteschlange)                          | Z              |
| treatment-bases/PatientTreatmentBasesPage.tsx | 964    | Akte-Abschnitt    | 11 Unterkomponenten; laufende und abgeschlossene Verordnung als zwei getrennte Kartenfassungen (133 + 94 Z.), Aktionsblock 125 Z., 24 % Kommentar mit 43 Ticketverweisen                                                                                   | Z              |
| src/routes/AuthenticatedRoutes.tsx            | 950    | Routen            | 144 Importe und 151 `<Route>` von Hand, 13 Rollenflags (`show…`) und 32 bedingte Routenzweige                                                                                                                                                              | B7             |
| platform/Uebersicht.tsx                       | 933    | Seite (Übersicht) | 13 `useQuery` in einer Komponente, jede mit eigener Bedingung je Zugangsart (behandlung/begleitung/nurLesen), dazu ein Sammelzustand laden/gescheitert/veraltet; „Heute“ wird aus 17 `push` in if-Ketten gebaut                                            | B2, Z          |
| files/Dateiliste.tsx                          | 927    | Akte-Abschnitt    | 3 große Unterkomponenten in einer Datei: Uploadfeld (249 Z., 10 `useState` inkl. Kamera/Vorschau/Name), Artkorrektur (140 Z., eigener Offen-/Fokuszustand), Dateizeile (171 Z., Öffnen/Herunterladen/Freigeben/Löschen)                                    | Z, B5, B6      |
| appointments/AppointmentSeriesPage.tsx        | 926    | Formularseite     | eine Komponente mit ~805 Z., 14 `useState` (5 Felder, Vorschlagsliste, Prüfbefunde, Feldfehler, Prüfstand) und 2 Mutationen (Prüfen, Anlegen); Formular und bearbeitbare Vorschlagsliste auf einer Seite                                                   | B5, Z          |
| reimbursements/RequestReimbursementPage.tsx   | 860    | Antrag (Ablauf)   | 6 Schritte (kind, month, receipt, item, account, summary) als if-Zweige in einer `Flow`-Komponente (~725 Z.), 10 `useState`, Abfragen für Übersicht, Vorschau und Tour                                                                                     | B4             |
| documentation/CompleteTreatmentPage.tsx       | 846    | Editor-Seite      | `Abschluss` 578 Z. vereint Textfeld, Diktat, Befundwerkzeug, Verlauf, Vorschlag und Textverlustschutz (8 `useState`); etwa die Hälfte der Editorzeilen steht gleichlautend in TreatmentNotePage; 46 Ticketverweise                                         | Z              |
| assessments/schema.ts                         | 839    | Schema            | Definitionsschema für Bausteine und Scores: 20 `z.object`, 33 `addIssue`-Querprüfungen; 40 % Kommentar (335 Z.) mit der Herleitung aus dem Arbeitsauftrag                                                                                                  | I, K           |
| assessments/BausteinFeld.tsx                  | 822    | Komponente        | 9 Unterkomponenten; `Eingabe` allein 287 Z. mit Einklappen, Notiz, Abwählen mit Rückfrage und doppelter Ausführung für links/rechts                                                                                                                        | Z, B6          |
| appointments/calendar.ts                      | 793    | Logik (rein)      | 38 reine Funktionen zu vier Themen (Datumsrechnung, URL-Parameter, Spalten-/Kachellayout, Zoom/Gitter/Arbeitszeitbänder); 37 % Kommentar                                                                                                                   | K              |
| timeaccount/RecordTimeAccountPage.tsx         | 769    | Antrag (Ablauf)   | 6 Seiten (kind, date, times, reason, summary, done) als if-Zweige in `Flow`, zwei Schrittfolgen (dated/correction) über die `STEP`-Tabelle, 10 `useState`, 3 Abfragen und 1 Mutation                                                                       | B4             |
| training/api.ts                               | 754    | API               | 20 RPC-Wrapper mit 11 Schemas und 14 `includes`-Fehlerübersetzungen (u. a. `protokollfehler`), dazu Abbildung der Formularwerte (`rpcWerte`/`werteAus`)                                                                                                    | B1             |
| retention/AufbewahrungPage.tsx                | 748    | Sammelseite       | 8 unabhängige Abschnitte (Plan, Klassendetail, Löschsperren, Journal, Löschaufträge, Dateiabgleich, Zu tun, Grundlagen) mit je eigener Abfrage und zusammen 19 Lade-/Fehlerstellen                                                                         | B2, Z          |
| documentation/PatientRecordDocumentation.tsx  | 733    | Akte-Abschnitt    | 7 Komponenten, zwei Einstiege (Verlauf, „Dieser Termin“) mit eigenen Abfragen, die Fristabfrage steht doppelt; `AkteEintrag` 135 Z., `Behandlungsdokumentation` 188 Z.                                                                                     | Z, B2          |
| platform/Einstieg.tsx                         | 732    | Ablauf            | geführter Einstieg (Willkommen → Einwilligungen → Mitteilungen → Bereit) als Kette von `seite === …`-Ternären in `Ablauf` (262 Z.), dazu 6 `useQuery` und 3 `useMutation` in Einwilligungsfrage und Push-Schalter                                          | B4, B2         |
| working-time/RequestWorkingTimePage.tsx       | 720    | Antrag (Ablauf)   | 5 Seitenarten (kind, date, times, day × Wochentag, summary) als `page.art`-Zweige in `Flow`; der Abfolge-Helfer ist da, das JSX der Schritte steht aber inline; Abfragen für Basis und Vorschau, dazu Absenden                                             | B4             |
| fleet/api.ts                                  | 718    | API               | 23 `z.object` (≈ 200 Z. Schemas) und 20 Endpunkte; der generische Aufruf existiert lokal schon (`rufe()` + `SAETZE`); dazu das Foto-Upload-Protokoll (Prüfsumme, Vorbereiten, Prüfen, Verwerfen, 60-s-Verweis), das fast gleich in 4 weiteren api.ts steht | B1             |
| exercise-plans/Planeditor.tsx                 | 715    | Editor            | 6 Fensterarten (auswahl, vorlage, vorschau, kopf, zuweisen, position) als `fenster?.art`-Zweige, 6 `useMutation` und 3 `useQuery` in einer Datei                                                                                                           | B6, B2         |
| teamchat/Eingabe.tsx                          | 711    | Komponente        | eine Komponente mit ~590 Z. und 9 `useState`; 4 Werkzeuge inline (Erwähnen, Format, Anhängen, Sprachnachricht), dazu geplantes Senden und „auch im Kanal“                                                                                                  | Z              |
| fleet/bike3d/viewer.ts                        | 709    | 3D-Viewer         | Three.js-Klasse `BikeViewer` (~450 Z.: Orbitkamera, 6 Zeiger-/Radereignisse, Raycast, Pins); 6 % Kommentar                                                                                                                                                 | – (kein Anbau) |
| assessments/ErhebungPage.tsx                  | 707    | Formularseite     | `Formular` ~400 Z. mit 10 `useState`, davon 5 nur für Fehler (je Frage, Zusammenfassung, Datum, Begründung), dazu Entwurf/Abschluss/Verwerfen                                                                                                              | B5             |
| therapy-reports/TherapieberichtPage.tsx       | 702    | Formularseite     | `Berichtsformular` ~400 Z. mit Vergleich Eingabe/Gesichert, Mutationen für Abschließen und Verwerfen, dazu Quellenauswahl (Eintragsliste, Auswahlknopf)                                                                                                    | B5, B6         |
| src/app/navigation.tsx                        | 702    | Register          | 9 Inline-SVG-Symbole (~80 Z.), 36 Pfadangaben, `arbeitsbereiche` und `betriebUnterpunkte` als Ketten von Rollen-ifs (~345 Z.); 28 % Kommentar                                                                                                              | B7, K          |
| staff/StaffAccountSection.tsx                 | 700    | Abschnitt         | 3 Kontozustände (keine Einladung, offene Einladung, bestehender Zugang) mit 6 `useMutation` (Einladen, Erneut senden, Widerrufen, Rollen, Sperren, Anmeldelink) und 3 `Rueckfrage`-Blöcken                                                                 | B6             |
| documentation/Textverlustschutz.tsx           | 695    | Hook (Baustein)   | schon ein geteilter Baustein (56 Dateien nutzen ihn); ein Hook mit 506 Z., 7 `useState`, 4 Effekten und Navigationsblocker (Selbstsichern, Abmelden); 35 % Kommentar                                                                                       | K, Z           |
| files/FotosImVerlauf.tsx                      | 684    | Akte-Abschnitt    | 5 Komponenten: Aufnahme (160 Z., Kamera/Vorschau/Name/Speichern, im Kern wie das Uploadfeld der Dateiliste), Ansicht/Vergleich, Fotozeile mit Löschen, Liste mit 6 `useState`                                                                              | Z, B6          |
| appointments/FolgeterminVorschlaege.tsx       | 683    | Komponente        | 6 `useQuery` (Kalender, Wochenplan, Ausnahmen, Kommende, Am Tag, Frei) und 3 `useMutation` (Anlegen, Zurücknehmen, Absagen mit Rückfrage)                                                                                                                  | B2, B6         |
| appointments/TagUmplanenPage.tsx              | 674    | Ablauf            | geführter Ablauf (Grund → Termine → Absagen → Anrufseite je Person) in `Ablauf` (352 Z.); der Zustand liegt teils in `useState`, teils in URL-Parametern                                                                                                   | B4             |
| statistics/StatisticsPage.tsx                 | 663    | Seite             | 10 Komponenten, 6 `useQuery` in 4 Abschnitten (Kennzahlen, Ziele, Verlauf, Mein Umsatz), Zielzeile mit Mutation, CSV-Export                                                                                                                                | B2, Z          |
| nutrition/ProfilFormular.tsx                  | 662    | Formulare         | 2 Formulare (Profil mit 8 Feldern, Zielwerte mit 5) mit handgeschriebenem `pruefen()`, je eigener Tabelle für Beschriftung, Reihenfolge und IDs und je Fehlerzusammenfassung, dazu 3 Seiten                                                                | B5             |
| src/app/AppShell.tsx                          | 657    | Layout            | eine Komponente mit 473 Z. und drei Fassungen der Leiste (Tableiste < 640 px, Symbolspalte, Seitenleiste lg) samt Klassenkonstanten; 35 % Kommentar mit Design-Herleitung                                                                                  | K, Z           |
| preview/demodaten.ts                          | 654    | Inhalt            | synthetische Vorschaudaten (Räder, Mitarbeitende, Urlaub, Katalog, Leistungen, Rechnungen, Zahlungen)                                                                                                                                                      | I              |
| fleet/WerkstattblattPage.tsx                  | 645    | Druckseite        | 8 reine Darstellungskomponenten (Blattseite, Nadeln, Seitenbild, Ausschnitt, Fotos), `Unterlage` 278 Z., 169 JSX-Zeilen, 7 % Kommentar                                                                                                                     | Z              |
| documentation/api.ts                          | 640    | API               | 12 RPC-Wrapper, `schreibfehler` mit 14 `includes`-Zweigen, seitenweises Laden der Akte; 32 % Kommentar                                                                                                                                                     | B1, K          |
| patients/PatientMasterDataPage.tsx            | 635    | Akte-Abschnitt    | `Stammdaten` 303 Z. plus 5 Karten-/Zeilenkomponenten (Telefon, Versorgung abschließen, Anmeldebogen, Abrechnung); 27 % Kommentar                                                                                                                           | Z, K           |
| appointments/EditAppointmentPage.tsx          | 625    | Formularseite     | eine Komponente mit ~540 Z.: 7 `useState` (derselbe Satz wie in NewAppointmentPage), 5 `useQuery`, Zweige je `kind` (internal/training/therapy) und Ort (practice/home_visit)                                                                              | B5, B3         |
| fleet/Pannenfenster.tsx                       | 624    | Ablauf            | die Ablaufmodule (`pannenablauf`, `pannenseiten`) sind schon ausgelagert; übrig bleiben die Hauptkomponente (~310 Z., Melden, Fotos erneut übertragen) und `Schrittinhalt` mit 10 `case`-Zweigen                                                           | B4             |
| billing/ServicesPage.tsx                      | 624    | Seite             | 6 Komponenten: Leistungsliste, Zurücknehmen mit Mutation, offene Termine, `Erfassungsformular` 193 Z. (Vorschlagsabfrage, Mengenprüfung, Erfassen)                                                                                                         | B5, B6         |
| supabase/functions/location-provider/ptv.ts   | 623    | Edge Function     | Adapter für 3 PTV-APIs (Routing, Matrix, Geocoding) mit 21 Hilfsfunktionen, die untypisierte Antworten auswerten; 35 % Kommentar mit der Prüfhistorie der API                                                                                              | K (kein Anbau) |
| training/TrainingClientPage.tsx               | 617    | Detailseite       | `Ansicht` 238 Z. mit 5 Reitern inline (2 davon rollenabhängig), dazu Bearbeitungsformular und Vertrag beenden mit 2 `Rueckfrage`-Fassungen                                                                                                                 | Z, B6          |
| training/TrainingProtocol.tsx                 | 614    | Doku (Training)   | 6 Komponenten für Entwurf, Abschluss, Nachtrag und Wiedereröffnen (4 `useMutation`, 10 `useState`): derselbe Lebenszyklus wie in der Behandlungsdoku, nur eigens gebaut                                                                                    | B3, B6         |
| appointments/NewAppointmentPage.tsx           | 612    | Formularseite     | eine Komponente mit ~520 Z.: 10 `useState` (Werte, Fehler, Prüfung, Fenster, Dauer, Vorfrage), Vorbelegung aus der URL, 4 `useQuery`                                                                                                                       | B5             |
| exercises/UebungPage.tsx                      | 606    | Detailseite       | `Pflege` mit 5 `useMutation` (Variante archivieren/löschen, Übung archivieren/löschen, Prüfvermerk), 4 Formularmodi und eine Durchsehen-Mutation                                                                                                           | B6             |
| platform/ablage.ts                            | 602    | Offline-Ablage    | Geräteablage, Warteschlange und Übertragung (`einmalUebertragen` ~95 Z.) samt React-Kontext und Hooks in einer Datei, 7 Schemas; 24 % Kommentar                                                                                                            | Z              |
| staff/Einrichtungsseiten.tsx                  | 600    | Ablaufseiten      | 13 Komponenten, nämlich die Schrittseiten des Einrichtungsablaufs (Person, Rolle, Vorlage, Rad, Einladung, Abschluss- und Ergebnisliste)                                                                                                                   | B4             |
| nutrition/ErnaehrungReiter.tsx                | 599    | Reiter            | 8 Komponenten mit 4 Kleinformularen bzw. Aktionen, jede mit eigener Mutation (Gewicht, Einwilligung, Notizen, Beenden)                                                                                                                                     | B5, B6         |
| fleet/FleetPage.tsx                           | 597    | Listenseite       | Filter (Suche, Zustand, freier Tag) im URL-Zustand, `Radzeile` 137 Z. mit Wochenbelegung und Schlüsselaktion, Einstellungen mit Mutation                                                                                                                   | Z              |
| exercise-plans/api.ts                         | 595    | API               | 12 Schemas, ~18 Endpunkte; der generische Aufruf steht zweimal in derselben Datei (`rufe`/`meldung` und `rufeVorlagen`/`vorlagenMeldung`)                                                                                                                  | B1             |
| appointments/PatientAppointmentsPage.tsx      | 595    | Akte-Abschnitt    | zwei Ansichten derselben Termine nebeneinander (Liste gruppiert nach Verordnung, Kacheln); 21 % Kommentar                                                                                                                                                  | Z              |
| platform/Nachrichten.tsx                      | 586    | 3 Seiten          | Liste, `NeueNachricht` (Formular, Senden) und `NachrichtDetail` (Nachtragen, Erledigen) in einer Datei: 4 `useQuery`, 3 `useMutation`                                                                                                                      | Z, B5          |
| treatment-bases/TreatmentBasisFormPage.tsx    | 584    | Formularseite     | `GrundlagenFormular` 419 Z. mit Speichern- und Löschen-Mutation, Verordnerwahl, Heilmittelpositionen und Entwurfsablage; 24 % Kommentar                                                                                                                    | B5, B6         |
| files/api.ts                                  | 584    | API               | 16 RPC-Wrapper, 8 Schemas, Upload-Protokoll (Prüfsumme, Vorbereiten, Bestätigen, Verwerfen, 60-s-Verweis) ~170 Z.; 31 % Kommentar                                                                                                                          | B1, K          |
| platform-access/PlattformAbschnitt.tsx        | 571    | Abschnitt         | 10 Komponenten, 5 `useMutation` (Einladen, Versenden, Sperren, Entziehen, Überspringen), für Sperren und Entziehen je eine eigene Frage-Komponente                                                                                                         | B6             |
| platform-access/Vertretungen.tsx              | 567    | Abschnitt         | `VertretungsEintrag` mit 4 Aktionen, die vom Status abhängen (invited/active/locked/revoked); `VertretungEinrichten` mit 10 `useState` für Felder und Checkboxen                                                                                           | B6, B5         |
| vacation/UrlaubBeantragenPage.tsx             | 560    | Antrag (Ablauf)   | 5 Seiten (monat, beginn, ende, abschluss, fertig) als if-Zweige in `Antrag`, Vorschau und Absenden, Zusammenfassung                                                                                                                                        | B4             |
| appointments/AppointmentFormFields.tsx        | 555    | Formularfelder    | Ortsfelder als Ternärkette `practice`/`home_visit`, Dauerwahl, übernommene Adresse, Rückfrage zur Arbeitszeit; 28 % Kommentar                                                                                                                              | B5, B3, K      |
| offline-documentation/AufDemGeraet.tsx        | 554    | Gerätefassung     | Doku auf dem Gerät: `Entwurfskarte` 165 Z. mit 4 Konfliktaktionen (Nachtrag, Korrektur, Fassung lesen, Kopieren), `Entwurfsfeld` mit eigenem Speicherzustand                                                                                               | B6, Z          |
| staff/NewStaffMemberPage.tsx                  | 549    | Ablauf            | eine Komponente mit ~380 Z. und 10 `useState` für die Schritte, nach dem Anlegen 3 Folgeaufrufe (Wochenplan, Schlüssel, Einladung)                                                                                                                         | B4             |
| reimbursements/api.ts                         | 549    | API               | 15 Schemas; der generische Aufruf ist schon da (`call()` + `SENTENCES`); dazu Antragszustände (submit, withdraw, decide approved/rejected, markPaid) und das Upload-Protokoll in einer weiteren Kopie                                                      | B1, B4         |
| documentation/TreatmentNotePage.tsx           | 544    | Editor-Seite      | `Editor` ~340 Z.; 133 seiner 266 eigenen Zeilen stehen gleichlautend in CompleteTreatmentPage; 37 Ticketverweise                                                                                                                                           | Z              |
| training/TrainingAssessments.tsx              | 541    | Abschnitt         | Batterieansicht, Entfernen und `Festhalten`-Formular (~220 Z. als Zeilenliste; 8 `useState` in der Datei)                                                                                                                                                  | B5             |
| appointments/wegpruefung.ts                   | 540    | Hook/Logik        | reine Entscheidungslogik, dazu `useWegpruefung` mit 7 voneinander abhängigen `useQuery` (Standorte, Tag, eigener Tag, Adresse, Wochenplan, Ausnahmen, Prüfung) und 24 if-Zweigen für den Zustand                                                           | B2, B3         |
| src/components/ui/Dialogfenster.tsx           | 538    | UI-Basis          | Modal-Baustein: Fokusfalle, Sperren des Hintergrunds, Ausblendanimation über ein geklontes Abbild mit kopierten Seitenregeln; 25 % Kommentar                                                                                                               | – (kein Anbau) |
| exercises/katalog/eintraege/sh.ts             | 536    | Inhalt            | 22 Katalogeinträge Schulter (mitgelieferter Inhalt)                                                                                                                                                                                                        | I              |
| exercise-plans/PlanPage.tsx                   | 531    | Detailseite       | 11 Komponenten, 3 `useMutation` (neue Fassung, Verlängern, Beenden) und 4 Darstellungsabschnitte (Positionen, Durchgeführt, Je Übung, Einheit)                                                                                                             | B6, Z          |
| src/app/funktionen.ts                         | 526    | Register          | `vorgaenge()` ~300 Z. mit 22 `push`-Einträgen in Ketten von Rollen-ifs, parallel zu navigation.tsx; 24 % Kommentar                                                                                                                                         | B7             |
| exercises/Formulare.tsx                       | 515    | Formulare         | 3 Formulare (neue Übung, Übung, Variante) mit je eigener Mutation, zusammen 12 `useState`                                                                                                                                                                  | B5             |
| teamchat/Anhaenge.tsx                         | 514    | Komponenten       | 9 Komponenten: Darstellung je Medienart (Bild, Ton, PDF-Prüfung, Ton- und Anhangfenster) und 3 Listenfassungen                                                                                                                                             | Z              |
| session/types.ts                              | 513    | Rechte            | 39 exportierte `can…`/`is…`-Prädikate mit je eigener Rollenliste und 5–10 Zeilen Doku samt Ticket und Serverfunktion; 55 % Kommentar                                                                                                                       | B7, K          |
| platform/Tagebuch.tsx                         | 512    | Seite             | 9 Komponenten, 5 `useMutation` (Wasser zählen, Eintrag ändern und löschen, Kopieren, Einstellung schalten)                                                                                                                                                 | B6             |

**Zusammenfassung.**

- **Erstgenannter Hebel je Datei:**

  | Hebel      | Dateien |
  | ---------- | ------: |
  | Z          |      17 |
  | B5         |      12 |
  | B4         |       9 |
  | B6         |       8 |
  | B1         |       7 |
  | B2         |       5 |
  | B7         |       4 |
  | K          |       3 |
  | I          |       3 |
  | B3         |       1 |
  | ohne Hebel |       3 |

- **Kein Anbau** ist bei 6 Dateien im Spiel: drei Inhaltsdateien, der 3D-Viewer, die PTV-Edge-Function
  und der Modal-Baustein.
- **Kommentarregel K** greift bei 12 Dateien.
- **Doppelungen über die Datei hinaus:** Das Upload-Protokoll steht fünfmal (2b Fund 5). Die Editoren
  von `TreatmentNotePage` und `CompleteTreatmentPage` teilen etwa die Hälfte ihrer Zeilen; ein
  gemeinsamer Editor-Haken nach Z wäre hier der Hebel.

### 2b · Top 10 der semantischen Duplikate nach der Gegenprüfung

Ich habe die 23 Kandidaten der vier Sucher an den genannten Stellen nachgelesen, am Code (Commit 3c5e72b) und an der Analyse-DB. Überschneidende Kandidaten habe ich zusammengeführt:

- 7, 8, 11 und der TS-Teil von 2 werden zu Fund 1,
- 3, 4 und 14 zu Fund 3,
- 5, 10, 19 und 20 zu Fund 5,
- 18, 21 und 22 zu Fund 7.

**Rangwert** = konservative Einsparung × Fehlerrisiko, mit hoch = 3, mittel = 2, niedrig = 1. Das Fehlerrisiko richtet sich nach den belegten Abweichungen mit Folgen.

**Vorbehalt für alle SQL-Einsparungen.** Die Basis-Migration wird „nie von Hand geändert; neue Migrationen kommen dahinter“ (`docs/DEVELOPMENT.md` 53-61). Eine Vereinheitlichung bringt deshalb zunächst eine Folgemigration mit allen Neudefinitionen, die Zeilenzahl steigt also erst. Weniger Zeilen gibt es erst beim nächsten Abzug mit `scripts/basis-migration.mjs`. Jeder Umbau an RPC-Gates, Upload-Rechten oder Policies ist Pfad A (ADR-013 Punkt 9) und braucht ein Zweitreview.

**Zuordnung der Themen des Auftrags zu den Funden:**

| Thema                       | Funde                                                   |
| --------------------------- | ------------------------------------------------------- |
| Rollen- und Rechteprüfung   | 6, 4                                                    |
| Formular-Handling           | 2, 8                                                    |
| Datums- und Zeitreihenlogik | 7                                                       |
| Fehlerbehandlung            | 1, 10                                                   |
| Supabase-RPC-Aufrufe        | 1, 9                                                    |
| Status-Übergänge            | 3 (Anträge); Terminzustände unter „Nicht in den Top 10“ |

| Rang | Thema                                                                 | Varianten                                                                                                        | betroffene Zeilen                     | Einsparung (konservativ)                       | Risiko  | Abstraktion                                                                            |
| ---- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------- | ------- | -------------------------------------------------------------------------------------- |
| 1    | Client-RPC-Schicht: Aufruf, 403-Abweisung, Fehlersatz, Antwortprüfung | 12 Wrapper, 45 Mapper, 5 Schreibweisen der Abweisung, 2 Prüfwege                                                 | ≈ 2.700 (Schätzung)                   | ≈ 600                                          | hoch    | `src/lib/rpc.ts` (`rufeRpc`, `leseRpc`) + `src/lib/serverfehler.ts` (`satzFuer`)       |
| 2    | Terminformulare Behandlung und Fehlzeit                               | 6 Formulare neben einem vorhandenen Kern, 5 Kopien des Einzelstandort-Effekts                                    | 2.862                                 | ≈ 500                                          | hoch    | `appointments/Terminformular.tsx` mit Slots, `Fehlzeitformular`, `useEinzigerStandort` |
| 3    | Antragsmechanik: SQL-Zyklus und Entscheidungsseiten                   | 4 Antragsarten (3 volle Zyklen, Zeitkonto als Variante)                                                          | 2.399                                 | ≈ 500                                          | hoch    | SQL-Helfer `app.staff_request_*` + `features/antraege/Entscheidungsablauf.tsx`         |
| 4    | RPC-Eingangsprüfung in SQL                                            | 140 Audit-Vorspänne (27 bis 66 Formen), ≥ 145 rohe Gates, 2 byte-identische Helfer                               | 1.650–2.300 (hängt an der Abgrenzung) | ≈ 550, erst nach dem Basis-Abzug               | mittel  | `app.enter(p_allowed, p_operation, p_message, p_on_denied)`                            |
| 5    | Dateiarten nach ADR-017 fünffach: SQL-Lebenszyklus und Client-Weg     | 5 Arten: 66 SQL-Funktionen, 5 Upload-Abläufe, 12 Lader                                                           | 3.138                                 | ≈ 350, davon SQL 150 erst nach dem Basis-Abzug | hoch    | SQL-Helfer `app.assert_uploaded_object` u. a. + `files/ablage.ts`                      |
| 6    | Rollenspiegel SQL ↔ TS                                                | 4 Mechanismen plus Server-Flags, 10 Rollenmengen in 12 Schreibweisen                                             | 1.182                                 | ≈ 200                                          | hoch    | `session/rechte.ts` + Drift-Test, später `get_my_capabilities()`                       |
| 7    | Zeit und Datum: Praxistag, Kalendertag, Formate                       | SQL: 1 Helfer und 55 Eigenrechnungen; TS: 29 Kalendertag-Eigenbauten, 49 Formatoptionssätze, 16 Wochentagslisten | 822                                   | ≈ 300                                          | mittel  | `app.org_today` + `src/lib/{praxiszeit,kalendertag,datumsformat}.ts`                   |
| 8    | Formulargerüst der Stammdaten- und Einzelformulare                    | 10 Formulare, 4 Strategien für die Fehlerzusammenfassung                                                         | 1.985                                 | ≈ 170                                          | hoch    | `useFormular` in `src/lib/formular.ts`                                                 |
| 9    | React-Query-Abfragen                                                  | 42 Paare aus Schlüssel und Ladefunktion an 154 Stellen, 347× `retry: false`                                      | 1.069                                 | ≈ 330                                          | niedrig | `abfragen.ts` je Besitzermodul (`queryOptions`)                                        |
| 10   | Weiche für Laden, Fehler und Leer                                     | 65 Weichen in 53 Dateien                                                                                         | 626                                   | ≈ 150                                          | mittel  | vorhandenes `Abfragezustand` + `kombiniereAbfragen`                                    |

Rangwerte: 1.800 · 1.500 · 1.500 · 1.100 · 1.050 · 600 · 600 · 510 · 330 · 300.

- Gleichstand 2 und 3: Die Terminformulare stehen vorn, weil ihr Kopierfehler schon einmal eingetreten ist (FIX-013).
- Gleichstand 6 und 7: Die Rollen stehen vorn, weil sie Autorisierung betreffen.

#### 1 · Client-RPC-Schicht: Aufruf, Abweisung, Fehlersatz, Antwortprüfung

**Stellen.** Zwölf Modul-Wrapper:

| Datei                                       | Zeilen                               |
| ------------------------------------------- | ------------------------------------ |
| `src/features/timeaccount/api.ts`           | 106-158                              |
| `src/features/working-time/api.ts`          | 115-187                              |
| `src/features/feedback/api.ts`              | 92-114                               |
| `src/features/reimbursements/api.ts`        | 150-196                              |
| `src/features/exercise-plans/api.ts`        | 205-274 und 526-556 (`rufeVorlagen`) |
| `src/features/teamchat/api.ts`              | 246-345                              |
| `src/features/vacation/api.ts`              | 135-171                              |
| `src/features/fleet/api.ts`                 | 259-315                              |
| `src/features/nutrition/api.ts`             | 92-122                               |
| `src/features/nutrition/lebensmittelApi.ts` | 22-44                                |
| `src/features/platform/api.ts`              | 66-76 (`Verbindung`)                 |

Zwei Paare sind byte-gleich, per diff nachgeprüft: `feedback/api.ts` 101-114 mit `reimbursements/api.ts` 183-196 und `vacation/api.ts` 158-171 mit `fleet/api.ts` 302-315.

Nachgezählt:

- 409 `.rpc(` in 74 Dateien, davon 374 `getSupabase().rpc('…')`.
- 121 einzeilige Casts `as { data: unknown; error: unknown }`; die Sucher zählen 152 mit den mehrzeiligen.
- Antwortprüfung: `src/lib/antwort.ts` 16-20 wird 222× genutzt, daneben 80× `.parse(data…)` (Sucher: 81).

Laut Sucher (AST) gibt es 45 eigene Mapper in drei Formen, z. B. `appointments/api.ts` 1626-1725 und 8 Mapper in `platform/api.ts`. `schreibfehler` steht in 7 Dateien mit zwei unverträglichen Signaturen.

**Muster.** Jede Stelle läuft so ab: Aufruf, Cast, `if (error)`, ein englischer Teilstring der Servermeldung wird zum deutschen Satz, dann `antwort` oder `.parse`, und an den Schreibwegen mit record_denied_write zusätzlich eine Hand-Prüfung mit `abgewiesen()`.

**Belegte Fehler aus den Abweichungen:**

1. `training/api.ts` 585-601 `addTrainingProtocolAddendum` prüft nur `error`. `add_training_protocol_addendum` (Migration 16885-16933) antwortet bei fehlender Rolle über `app.record_denied_write` mit 403 und `return null`. Damit gilt der Nachtrag als gespeichert, obwohl der Dateikopf (12-19) die Prüfung zusagt. Die 11 übrigen Aufrufer mit record_denied_write in derselben Datei prüfen sie, nachgezählt.
2. `platform/api.ts` 1508-1520 `anhangfehler` hat keinen Zweig für „platform access not allowed“ und „topic needs consent“; beide wirft `prepare_message_attachment_upload` mit 42501. Die Person liest dann „Bitte versuchen Sie es erneut.“
3. `lebensmittelApi.ts` 22-44 mit `lebensmittel.ts` 299-310: Auch die Lesewege `search_foods`, `list_food_sources` und `list_practice_foods` melden „Nicht gespeichert …“.
4. `appointments/api.ts` 2130-2142 endet mit `.parse`. In `MitteilungVermerken.tsx` 123-124 steht damit ZodError-JSON in der Oberfläche, also genau das Muster, das R3-023/BEF-070 behoben hat.

Dazu kommt eine Reihenfolgeabhängigkeit: „not allowed“ muss in 4 Tabellen hinter „not allowed to …“ stehen.

**Server.** 2.377 `raise exception`. „not allowed…“ kommt 412× mit 42501 und 2× mit 22023, „changed meanwhile“ 33× mit 40001, beides nachgezählt. Der SQLSTATE wäre also ein verlässlicher Standardschlüssel; der Client liest ihn rund 14×.

**Fachlich nötig** sind nur:

- die Regelpräfixe von Arbeitszeit und Zeitkonto,
- die Netzklassifikation im Teamchat (ANN-641),
- die Verbindungs-Naht der Einsicht (`platform/api.ts` 66-76, `einsicht.ts` 71),
- rollenspezifische Sätze und Fehlerklassen, an denen Folgelogik hängt.

**Abstraktion:**

```ts
// src/lib/serverfehler.ts
export type Fehlersaetze = readonly (readonly [muster: string, satz: string])[];
export class Serverfehler extends Error {
  readonly code: string | null;
  readonly netz: boolean;
  readonly bekannt: boolean;
}
export function satzFuer(
  error: { message?: string; code?: string } | null,
  saetze: Fehlersaetze,
  rest: string,
  standard?: Partial<Record<'42501' | '40001' | '23505' | 'P0002', string>>,
): Serverfehler; // längstes Muster gewinnt
// src/lib/rpc.ts – wendet abgewiesen() immer an, leseRpc immer antwort()
export async function rufeRpc(
  fn: string,
  args: Record<string, unknown> | undefined,
  satz: string,
  opt?: { saetze?: Fehlersaetze; regel?: (m: string) => string | null; verbindung?: Verbindung },
): Promise<unknown>;
export async function leseRpc<T>(
  fn: string,
  args: Record<string, unknown> | undefined,
  schema: ZodType<T>,
  satz: string,
  opt?: Parameters<typeof rufeRpc>[3],
): Promise<T>;
```

Die Modul-Wrapper werden zu Einzeilern.

**Einsparung.** Schätzung, zusammen ≈ 640, gerundet 600:

- Inline-Gerüst −450: Die Sucher messen an 259 gleichförmigen Stellen 1.524 → 936 Zeilen, also −588; ich setze rund ¾ davon an.
- Wrapper 113 → ~50: −60.
- Mapper als Tabellen −200: statt −380 laut Sucher.
- 14 safeParse-Dreizeiler: −28.
- Zwei neue Dateien: +100.

**Betroffen** sind ≈ 2.700 Zeilen. Schätzung: 1.648 + 1.441 + 134 = 3.223 laut Sucher, abzüglich ~450 Zeilen Inline-Fehlerprüfungen, die in beiden Messungen stecken.

#### 2 · Terminformulare: Behandlungstermin baut den vorhandenen Kern nach, Fehlzeit steht dreimal von Hand da

**Stellen:**

| Datei                                              | Zeilen                            | Rolle                                                                                                                                                              |
| -------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/features/training/TrainingTerminFormular.tsx` | 122-335                           | vorhandener Kern; genutzt von `NewTrainingAppointmentPage.tsx` (180 Z.), `EditTrainingAppointmentPage.tsx` (108 Z.), `nutrition/BeratungsterminSeite.tsx` (107 Z.) |
| `appointments/NewAppointmentPage.tsx`              | 147-372, 462-606 (612 Z.)         | Nachbau                                                                                                                                                            |
| `appointments/EditAppointmentPage.tsx`             | 96-114, 180-345, 471-621 (625 Z.) | Nachbau                                                                                                                                                            |
| `appointments/NewEventPage.tsx`                    | 98-332 (332 Z.)                   | Fehlzeit                                                                                                                                                           |
| `appointments/NewEventSeriesPage.tsx`              | 146-468 (468 Z.)                  | Fehlzeit                                                                                                                                                           |
| `appointments/EditEventPage.tsx`                   | 81-480 (480 Z.)                   | Fehlzeit                                                                                                                                                           |
| `appointments/AppointmentSeriesPage.tsx`           | 242-249                           | Kopie                                                                                                                                                              |

**Eigene Nachmessung.** Gezählt sind Zeilen, die nach trim gleich sind, ohne Leer-, Kommentar-, Import- und reine Klammerzeilen. Das ist eine Obergrenze, weil generische JSX-Zeilen mitzählen.

- Kern und die zwei Behandlungsformulare teilen 580 von 1.009 Zeilen (57,5 %).
- Die drei Fehlzeitformulare teilen 512 von 837 (61,2 %). NewEventPage steckt zu 92 % in den beiden anderen.

Der FAKTEN-Scanner mit 2,7 % sieht das nicht, weil eingestreute Abweichungen die Kopien zerschneiden.

**Muster:**

- `werte` und Vergleichsstand als useState, `setzen` mit Ableitung `start_time`→`end_time`.
- Rückfragekette Vorfrage → Arbeitszeit → Vergangenheit → Hinweisfenster: NewAppointmentPage 469-503 ≙ TrainingTerminFormular 253-287 ≙ EditAppointmentPage 477-511.
- Der Einzelstandort-Effekt steht 5× wortgleich: NewAppointmentPage 216-227, TrainingTerminFormular 140-151, NewEventPage 140-153, NewEventSeriesPage 197-205, AppointmentSeriesPage 242-249. NewEventPage 140-144 dokumentiert, dass genau das Fehlen dieser Kopie schon ein Fehler war (FIX-013).

**Zufällige Abweichungen:**

- (a) Personenvorbelegung: „ich“ in NewAppointmentPage 237-252, „genau eine“ in TrainingTerminFormular 154-169.
- (b) Fehlerzusammenfassung: Die Termine nutzen eine Momentaufnahme mit Nummer, begründet in NewAppointmentPage 157-166. Die Fehlzeiten zeigen sie live (NewEventPage 225, NewEventSeriesPage 295, EditEventPage 323); daraus folgt der Fokussprung aus Fund 8.
- (c) ZST-07: Die Termine melden am Feld, die Fehlzeiten sperren still den Knopf (NewEventPage 211-213, 320).
- (d) Speicherfehler: Hinweisfenster gegen Statusmeldung (NewEventPage 310).
- (e) „trotzdem“-Beschriftungen in mehreren Formen: „Termin trotzdem anlegen“ (NewAppointmentPage 480), „Änderung trotzdem speichern“ (EditAppointmentPage 488), `${absendeText} – trotzdem` (TrainingTerminFormular 264).

**Fachlich trägt die gemeinsame Abstraktion.** ADR-021 (Z. 188) sieht „ein Kalender, ein Kontext je Termin“ vor, und der Kern importiert ohnehin `AppointmentFormFields` und `appointmentFormSchema` aus appointments. Nötig bleiben als Slots: Wegauskunft und TerritoryHint nur am Behandlungstermin, die nicht gezeigte Trainingsadresse (ANN-177), der Ereigniszweig, die Wiederholung und der Ändern-Umfang.

**Abstraktion:**

- `Terminformular({ startwerte, startMinuten, vergleich?, personen: { abfrage, beschriftung, vorbelegung: 'ich' | 'einzige' | 'keine' }, vorFeldern?, nachFeldern?: (werte, setzen) => ReactNode, texte: { absenden, laeuft, trotzdem, fehlerTitel, verlust }, abbrechenZiel, onSpeichern(werte, bestaetigung): Promise<string>, onGespeichert })` in `src/features/appointments/Terminformular.tsx`. Damit entfällt auch die Kante nutrition>training.
- `useEinzigerStandort(standorte: Location[] | undefined, setze: (f: (w) => w) => void)` in `appointments/terminformular.ts`.
- `Fehlzeitformular({ start, zusatz?: ReactNode, zusatzPruefen?: () => Partial<Record<string, string>>, absendeText, onSpeichern })`.

**Einsparung ≈ 500.** Schätzung: Die Sucher kommen über einen Rohzeilenfaktor auf 750; ich ziehe ein Drittel für Slots, Hüllen und Konfiguration ab. Das Vorbild zeigt den Effekt: EditTrainingAppointmentPage hat 108 Zeilen, EditAppointmentPage 625.

#### 3 · Antragsmechanik: dreimal neu in SQL, viermal kopierte Entscheidungsseite

**SQL-Stellen** (Migration, Zeilen nachgeprüft):

| Schritt      | Funktionen                                                                                                                                                                                                             |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entscheiden  | `decide_leave_request` 23030-23108, `decide_working_time_request` 23157-23226, `decide_reimbursement` 23112-23153, `reject_time_account_entry` 42749-42783, `mark_reimbursement_paid` 36790-36817                      |
| Zurückziehen | `withdraw_leave_request` 52233-52253 ≡ `withdraw_working_time_request` 52528-52548 (bis auf Tabelle und Text), `withdraw_reimbursement` 52355-52381, `withdraw_time_account_entry` 52385-52420                         |
| Stellen      | `request_leave` 43518, `request_leave_cancellation` 43586, `request_working_time_change` 43870, `submit_electricity_reimbursement` 48862, `submit_purchase_reimbursement` 48995, `app.reimbursement_start` 12872-12893 |

**Abweichungen ohne fachlichen Grund** (Rümpfe und pg_constraint gelesen):

1. Eigen-Prüfung: Der Urlaub prüft `staff_member_id = own OR requested_by = auth.uid()`, die Erstattung nur `staff_member_id is not distinct from own` (23128), obwohl die Tabelle `requested_by` hat.
2. Nicht offener Antrag: Urlaub antwortet mit P0002 „leave request not found“, Erstattung mit 55000 „reimbursement is not open“.
3. Prüfreihenfolge und Texte: „decision is required“ / „note is too long“ gegen „decision missing“ / „reason is too long“.
4. Notiz bei Genehmigung: Urlaub und Arbeitszeit speichern sie, die Erstattung verwirft sie. Grund: `staff_reimbursements_reject_reason` verlangt die Äquivalenz `(status='rejected') = (decision_note IS NOT NULL)`, die beiden anderen nur die Implikation.
5. Selbsteintrag in drei Quellen:
   - 9× `app.has_any_role('owner')` in 7 Funktionen (request_leave, request_leave_cancellation, request_working_time_change, list_leave 2×, list_working_time, preview_leave, preview_working_time_change 2×);
   - 1× `app.can_decide_staff_requests()` in reimbursement_start;
   - 1× im Client: `selfEntered = state.can_decide` (`reimbursements/RequestReimbursementPage.tsx` 142).

   Deckungsgleich ist das nur, solange `can_decide_staff_requests` = owner bleibt (2278-2285).

6. `*_self_entered` als CHECK gibt es nur an `staff_reimbursements`.
7. Die `*_decided`-CHECKs listen die Endzustände je Tabelle von Hand.

Das Zeitkonto hat eigene Spalten (`rejected_by`, `rejected_at`, `rejection_note`). Es bekommt deshalb nur Helfer, keine Einheitstabelle.

**UI-Stellen:**

- Die vier Entscheidungsseiten mit 1.281 Zeilen: `vacation/UrlaubEntscheidenPage.tsx` (414), `working-time/DecideWorkingTimePage.tsx` (333), `reimbursements/DecideReimbursementPage.tsx` (267), `timeaccount/RejectTimeAccountEntryPage.tsx` (267).
- Eigene Nachmessung: 502 von 918 nichttrivialen Zeilen (54,7 %) stehen wörtlich auch in einer der anderen Seiten. Der Ablehnschritt in DecideReimbursementPage 184-218 und RejectTimeAccountEntryPage 204-238 unterscheidet sich per diff nur in Namen, Fehlerzeile und Knopfwort.
- Statusanzeige 3×: `vacation/zeitraum.ts` 135-158, `working-time/format.ts` 67-79, `reimbursements/rules.ts` 164-187. Für requested, approved, rejected und withdrawn sind Wort, Ton und Zeichen jeweils gleich.
- Unterzeile 4×: `VacationPage.tsx` 170-173, `WorkingTimePage.tsx` 296-298, `reimbursements/BelowRow.tsx` 1-9, `TimeAccountPage.tsx` 267-269.
- Eingangsgruppen: `open-points/Urlaubsantraege.tsx`, `Arbeitszeitantraege.tsx`, `Erstattungen.tsx`, zusammen 166 Zeilen.

**UI-Abweichungen mit Folge:**

- `DecideReimbursementPage.tsx` 39 setzt `REJECT_TEXTS` ohne `zeile`, nutzt aber `kompakt: true` (122-125). Deshalb erscheinen die Vorgaben der Schreibseite aus `Textverlustschutz.tsx` 572-575 und 663: „Text noch nicht gespeichert.“ und „Weiterschreiben“. DecideWorkingTimePage 50-58 zeigt dagegen „Der Antrag ist noch nicht abgelehnt.“
- Die Erstattung zeigt `decide.error.message` roh, die anderen Seiten einen Ersatzsatz.

**Abstraktion SQL** (neben `app.staff_request_org`):

- `app.staff_request_decision_note(p_approve boolean, p_note text) returns text`
- `app.assert_not_own_staff_request(p_org uuid, p_staff_member_id uuid, p_requested_by uuid) returns void`
- `app.staff_request_self_enters() returns boolean` (= `can_decide_staff_requests()`, auch als Flag `self_entered` für den Client)
- `app.withdraw_staff_request(p_table regclass, p_id uuid, p_not_found text) returns void`, `regclass` gegen eine feste Liste geprüft
- einheitliche `*_decided`-, `*_reject_reason`- und `*_self_entered`-CHECKs; ob eine Notiz bei Genehmigung erlaubt ist, entscheidet Jannes fachlich.

**Abstraktion TS** in `src/features/antraege/`:

- `Entscheidungsablauf<A, E>({ titel, abfrage, finde: (stand) => A | undefined, objekt: (a) => string, details: (a) => ReactNode, entscheiden: (a, genehmigen: boolean, grund: string | null) => Promise<E>, fertig: (a, e) => ReactNode, ablehnWort?: 'Ablehnen' | 'Zurückweisen', nurAblehnen?: boolean, invalidieren: QueryKey[] })`
- `ANTRAGSSTATUS_ANZEIGE: Record<'requested' | 'approved' | 'rejected' | 'withdrawn' | 'cancelled' | 'paid', { text: string; ton: Ton; zeichen?: string }>`
- `Antragsgruppe`

Voraussetzung: Textverlustschutz kommt aus `features/documentation` heraus. 18 Module importieren documentation nur dafür (`s2bC/doku_imports.txt`).

**Einsparung ≈ 500.** Schätzung, zusammen ≈ 555, abgerundet:

- Seiten 1.281 → ~880: −400.
- Statusanzeige: −40.
- Unterzeile: −14.
- Eingangsgruppen: −50.
- SQL-Helfer: −50, erst nach dem Basis-Abzug.

Der Hauptnutzen sind die sieben SQL- und zwei UI-Abweichungen.

#### 4 · RPC-Eingangsprüfung in SQL von Hand

**Stellen** (nachgezählt):

- 140 public-RPCs schreiben einen Abweisungseintrag über `app.record_denied_read`, `_write` oder `_owner_read`, z. B. `add_training_protocol_addendum` 16885-16933. Die Aufrufer-Zahlen: record_denied_read 106, record_denied_write 34, record_denied_owner_read 2.
- 145 RPCs haben ein rohes Gate in strenger Form `if not app.can_…()/has_any_role(…) then raise exception` ohne Eintrag; die Sucher zählen 162 mit weiteren Formen.
- `app.staff_request_org` 13752-13771 und `app.fleet_org` 6466-6485 sind byte-identisch (prosrc-Vergleich = true) und haben 37 bzw. 22 Aufrufer. staff_request_org hat 8 fremde Aufrufer: teamchat_member, staff_feedback_giver, get_my_staff_feedback_status, get_staff_feedback_summary, list_staff_feedback_named, electricity_suggestions, electricity_tour_points und preview_electricity_reimbursement.

Länge des Vorspanns: Die Sucher messen 1.076 Zeilen (Ø 7,7) bis zum Abweisungszweig. Meine Nachmessung bis zum Ende des Organisationsblocks ergibt 1.737 Zeilen (Ø 12,4). Formen: 27 laut Sucher (normalisiert), 66 bei mir mit Variablennamen.

**Abweichungen:**

- Der COMMENT zu record_denied_write (12652) nennt „die zehn Schreibpfade“; tatsächlich sind es 34 Aufrufer.
- 15 STABLE-RPCs schreiben über record_denied_read, nämlich find_free_slots, find_possible_duplicates, get_intake_checklist, get_practice_statistics, get_practice_targets, list_call_list, list_ending_prescriptions, list_open_intakes, list_open_prescription_scans, list_practice_revenue_months, list_tasks, list_top_services, list_waitlist_entries, list_waitlist_matches und rate_slot_travel. Das ist BEF-082 (offen); der Befund nannte 16, list_care_without_conclusion ist inzwischen nicht mehr darunter.
- `return;` gegen `return null;`, wechselnde Reihenfolge von uid, Recht und Organisation.

**Fachlich nötig** ist nur die Abweisungsart je Bereich (ADR-010 Punkt 16, ANN-115, ANN-172). Sie bleibt ein expliziter Parameter, und die Menge der protokollierten Pfade darf sich nicht ändern. Mehr Protokollierung braucht eine ADR-Änderung und das Label `freigabe-audit`, weniger wäre ein abgeschwächtes Gate. `supabase/tests/abgewiesene-schreibpfade.test.ts` und `abgewiesene-lesepfade.test.ts` bleiben die Prüfung.

**Abstraktion.** `app.enter(p_allowed boolean, p_operation text, p_message text, p_on_denied text default 'raise') returns uuid`, VOLATILE, neben `app.record_denied_read`. Sie gibt die Organisation zurück oder null nach einem protokollierten Abweisen. Aufruf: `v_org := app.enter(app.can_x(), 'x.read', 'not allowed …', 'audit_read'); if v_org is null then return; end if;`. staff_request_org und fleet_org werden erst Aliase, dann ersetzt. Ein Katalogtest in `audit.test.ts` verlangt: Wer `app.enter` mit `'audit_*'` ruft, ist nicht STABLE. Den Fehler aus BEF-082 behebt erst dieser Test, nicht der Helfer.

**Einsparung ≈ 550**, erst nach dem Basis-Abzug. Schätzung:

- 140 Vorspänne × ~4 Zeilen (7,7 → ~3, die `v_actor`-Zeile bleibt, wo sie gebraucht wird) = −560.
- Die rohen Gates sind nicht eingerechnet.
- Die Helferkopie entfällt: −17.
- `app.enter` kostet +30.

#### 5 · Dateiarten nach ADR-017 fünffach: SQL-Lebenszyklus und Client-Weg

**SQL** (Migration, Zeilen nachgeprüft):

| Rolle                     | Zeilen      |
| ------------------------- | ----------- |
| `prepare_*`               | 39717-40107 |
| `confirm_*`               | 19876-20220 |
| `record_*_verification`   | 41348-42353 |
| `discard_stale_*`         | 24376-24472 |
| Cron                      | 63390-63485 |
| `may_upload_*`            | 8452-8542   |
| `may_read_*`              | 8127-8401   |
| `own_pending_*`           | 10245-10409 |
| `order_*_object_deletion` | 10125-10225 |
| `issue_*_link`            | 30448-30825 |

Dazu die Edge Function: `supabase/functions/patient-file-verify/handler.ts` 70-110 (Id-Feld fünffach) und `instanz.ts` 106-131 und 156-196 (zwei fünffach verschachtelte Ternäre). Laut Sucher sind es 66 artspezifische Funktionen mit 2.212 Zeilen.

**SQL-Abweichungen mit Folgen** (nachgeprüft):

1. `confirm_fleet_photo_upload` (19876-19910) und `confirm_message_attachment_upload` (19915-19984; Sperre in 19943) sperren mit `perform 1 … for update`, ohne den Zustand nachzuprüfen. Beleg (20126-20170) und Teamchat (20174-20220) prüfen unter der Sperre nach („Zweitreview Runde 2“). Ein Wettlauf ist plausibel, aber nicht durch einen Test belegt.
2. `may_upload_patient_file_object` (8505-8525) prüft weder `uploaded_by = auth.uid()` noch `confirmation_requested_at is null` noch das 24-h-Fenster; die vier anderen prüfen alle drei. Das ist ein Prüffall für das Sicherheitsreview (Pfad A). Ausnutzbar ist es wohl kaum, weil der Objektschlüssel zufällig ist und `upsert: false` gilt; geprüft habe ich das nicht.
3. `interval '24 hours'` steht 21× als Literal in 21 Funktionen. `own_pending_fleet_photo`, `own_pending_reimbursement_receipt` und `own_pending_attachment` haben das Fenster nicht, nur `own_pending_team_attachment`.
4. Abgelaufene Lesefreigaben räumen nur discard_stale für Radflotte, Beleg und Teamchat nächtlich ab (Begründung PROJECT_PRINCIPLES §20). Akte und Rückfrage räumen erst beim nächsten Ausstellen, Herausgeben oder Löschauftrag in derselben Organisation ab (issue_patient_file_link, hand_out_patient_photo, claim_storage_deletion_order bzw. grant_message_attachment, hand_out_message_attachment). Korrektur zum Kandidaten: Es ist nicht nur das Ausstellen.
5. Das Löschjournal wird beim Verwerfen auf vier Arten geschrieben.

**TS-Upload:**

| Datei                   | Zeilen                             | Länge |
| ----------------------- | ---------------------------------- | ----- |
| `files/api.ts`          | 122-128, 139-218, 235-246, 256-262 | 106   |
| `fleet/api.ts`          | 584-590, 611-669, 672-683          | 78    |
| `reimbursements/api.ts` | 422-428, 449-496, 499-510          | 67    |
| `teamchat/api.ts`       | 698-704, 791-893, 896-907          | 122   |
| `platform/api.ts`       | 1526-1532, 1545-1626               | 89    |

Die SHA-256-Prüfsumme steht 5× gleich, nachgezählt.

**TS-Lader:** `files/api.ts` 276-359, `files/patientenfotos.ts` 111-150 und 192-218, `fleet/api.ts` 686-710, `messages/api.ts` 198-217 und 382-403, `platform/api.ts` 593-651 und 1633-1653, `reimbursements/api.ts` 522-549, `teamchat/api.ts` 919-955. Die Gültigkeit von 60 s steht 6× als eigene Konstante und 2× als Literal (`messages/api.ts` 212, 396).

**TS-Abweichungen:**

- `patientenfotos.ts` 149 und 217 geben `abruf.blob()` zurück, also den Typ aus dem Antwortkopf. `files/api.ts` 329-343 schließt das ausdrücklich aus, im selben Modul, und `patientenfotos.ts` 111-114 hat dazu ein eigenes verweisSchema ohne mime_type. Praktisch gedeckt ist das, weil `confirm_*` den mimetype gegen storage.objects abgleicht.
- Die Größe nach der Umkodierung prüft nur `files/api.ts` 158-160.
- `platform/api.ts` 1624 erkennt den eigenen Wurf am Meldungstext.

Korrektur zum Kandidaten: Dass fleet und reimbursements das Ergebnis von `discard_*` verschlucken, ist gewollt („der tägliche Lauf räumt auf“, `fleet/api.ts` 655-660). Das ist kein Befund.

**Fachlich nötig:**

- Bucket, Tabelle, Rechtsprüfung, Zuordnung, Aufbewahrungsklasse;
- Legal Hold und Audit bei der Akte, Tonspur- und Virenprüfung bei Rückfragen, Videodauer;
- der Downloadname nur bei Akte und Plattformdokument (ADR-017 Punkt 55), die Netzklasse im Teamchat.

Die 5 Grant-Tabellen sind wegen der Fremdschlüssel vertretbar.

**Abstraktion SQL** (neben `app.patient_file_verification_required`):

- `app.assert_uploaded_object(p_bucket text, p_object_key text, p_byte_size bigint, p_mime_type text) returns void`
- `app.lock_pending_upload(p_table regclass, p_id uuid) returns void` mit Nachprüfung unter der Sperre
- `app.finish_upload_confirmation(p_table regclass, p_id uuid) returns void`
- `app.verification_gate(p_status text, p_verified_at timestamptz, p_confirmation_requested_at timestamptz) returns text`
- `app.upload_window() returns interval`
- ein generischer Trigger `app.order_storage_object_deletion()` mit `TG_ARGV[0]` = Bucket
- `public.discard_stale_uploads() returns jsonb`, ein Cron-Job für alle Upload- und Grant-Tabellen
- in der Edge Function `const ARTEN: Record<Art, { idFeld: string; ankuendigung: string; eintrag: string }>`

**Abstraktion TS:** `src/features/files/ablage.ts` mit

- `VERWEIS_GUELTIGKEIT_SEKUNDEN = 60`
- `pruefsumme(datei: Blob): Promise<string>`
- `pruefeAmServer(ziel: Partial<Record<'file_id' | 'photo_id' | 'receipt_id' | 'attachment_id' | 'team_attachment_id', string>>): Promise<string | null>`
- `ladeAngekuendigtHoch<V extends { bucket_id: string; object_key: string }>(o: { datei: Blob; vorbereiten(): Promise<V>; bestaetigen(v: V): Promise<void>; verwerfen(v: V): Promise<void>; uebertragungsfehler(u: unknown): Error; signal?: AbortSignal }): Promise<V>`
- `ladeFreigegeben(o: { freigabe(): Promise<{ bucket_id: string; object_key: string; mime_type: string }>; texte: { fehlt: string; laden: string }; downloadName?: string }): Promise<Blob>`, immer mit `new Blob(…, { type: mime_type })`.

Eine Einheitstabelle `upload_objects` wäre ein großer Umbau; ich nenne sie nur als Vorschlag.

**Einsparung ≈ 350.** Schätzung:

- SQL ~150, erst nach dem Basis-Abzug: Trigger −46, discard_stale und Cron −80, Storage-Abgleich −40, Zustandsprüfung −18.
- TS ~200: Prüfsummen −28, Serverprüfung −32, upload/confirm/discard −55, Lader −90 statt −127 laut Sucher.

**Betroffen:** SQL 2.212 + Cron 75 + Edge 108 = 2.395; TS 743.

#### 6 · Rollenspiegel SQL ↔ TS ohne Drift-Prüfung

**Stellen** (nachgezählt):

1. **SQL can\_\*:** 70 `app.can_*` mit reinem Rumpf `select app.has_any_role(…)`. 68 ohne und 2 mit Kommentarzeilen im Rumpf (can_release_treatment_basis, can_manage_tasks). Sie decken 10 Rollenmengen in 12 Schreibweisen ab:
   - 22× owner/therapist/team_lead/office
   - 18× owner
   - 10× owner/office
   - 6× alle fünf Praxisrollen, in 3 Reihenfolgen
   - 5× owner/therapist/team_lead
   - je 3× owner/team_lead und owner/trainer/office
   - je 1× owner/trainer, owner/team_lead/office und therapist/team_lead

   Dazu kommen `app.is_staff` (4er-Tupel) und `app.is_practice_account` (5er-Tupel), Migration 7595-7625.

2. **Inline in RPCs:** 25 public-RPCs mit 27 direkten `has_any_role`-Aufrufen.
3. **TS-Prädikate:** `src/features/session/types.ts` 63-513, 451 Zeilen, davon 249 Kommentarzeilen. 39 exportierte Prädikate und 9 Tupel-Konstanten. Gleich sind `directoryRoles` 65, `appointmentRoles` 78 und `therapyStaffRoles` 402; ebenso `trainingRoles` 415 und `trainingContentReaders` 444. Die Prädikate werden 255× in 87 Dateien aufgerufen (grep).
4. **Inline-Spiegel:** `src/app/navigation.tsx` 405-408 (canSeeBilling), `teamchat/NeuPage.tsx` 45, `account/MeinKontoPage.tsx` 304-306, `files/dateien.ts` 140 und 198.
5. **Server-Flags** `can_decide`: `VacationPage.tsx` 91, `WorkingTimePage.tsx` 171, `ReimbursementsPage.tsx` 114 und 128.

**Abweichungen:**

- Namensfalle: TS `isStaff` (types.ts 389-391: alles außer patient) entspricht SQL `is_practice_account`, TS `isTherapyStaff` entspricht SQL `is_staff`.
- `preview/identitaet.ts` 51-54 `darfEntscheiden` = owner‖team_lead widerspricht `can_decide_staff_requests` (2278-2285: „owner, nie den eigenen (BEF-066 Option 2)“). Die Funktion hat 0 Aufrufer, ist also toter Code.
- „Anträge entscheiden“ hat zwei Quellen: das TS-Tupel in `open-points/eingang.ts` 210-212 und `OpenPointsSummary.tsx` 86/91, das Server-Flag auf den Antragsseiten.
- Kein Test in `supabase/tests` vergleicht TS-Tupel mit pg_proc (grep ohne Treffer).

**Fachlich nötig** ist nur der Bereichsparameter therapy/training, z. B. in `can_read_exercise_plans`. Die UI ist ohnehin nur Darstellung (ADR-004).

**Abstraktion.**

- Stufe 1: `src/features/session/rechte.ts` mit `export const RECHTE = { … } as const satisfies Record<Recht, readonly RoleKey[]>` (die 10 Mengen als benannte Konstanten) und `darf(roles: readonly RoleKey[], recht: Recht): boolean`. Dazu ein Drift-Test `supabase/tests/rechte-spiegel.test.ts` gegen die Rümpfe in pg_proc. `isStaff` wird in `isPracticeAccount` umbenannt, `darfEntscheiden` gelöscht.
- Stufe 2: `public.get_my_capabilities() returns text[]`. Das ist eine neue RPC, also Pfad A.
- Stufe 3: Tabelle `app.capability_roles`. Das ist ein großer Umbau und nur nach Rückfrage bei Jannes; er ist nicht eingerechnet.

**Einsparung ≈ 200.** Schätzung: types.ts 451 → ~200, mit einem Satz je Recht, weil die Begründung im SQL-COMMENT bleibt: −250. Der Drift-Test kostet +40, die Inline-Spiegel bringen −5.

#### 7 · Zeit und Datum: Praxistag, Kalendertag, Formate

**Praxistag.**

- `app.training_today` (15174-15181) läuft in 65 Funktionen mit 67 Aufrufen.
- `app.practice_today` (12247-12254) hat 0 Aufrufe in Funktionsrümpfen; einzige Nutzung ist die Policy `staff_working_hours_select_staff_only`.
- 55 weitere Funktionen rechnen `now() at time zone …` selbst, nachgezählt. Der Kandidat nennt 57, weil er die zwei Helfer mitzählt. Die Zonenvariable trägt 8 verschiedene Namen.
- `coalesce(v_zone, 'Europe/Berlin')` steht 6× in 6 Funktionen (z. B. 41757-41883), obwohl `organizations.time_zone` NOT NULL ist.
- `app.staff_feedback_month` (13607-13614) steht neben 5 Inline-Monatsanfängen.

TS: Die Basis liegt in `appointments/api.ts` 430-437 und 1518-1574 (todayInTimeZone, dayKey, zeitpunktIn). Kopien stehen in `preview/format.ts` 43-86, `fleet/format.ts` 11 und 36-44 sowie `teamchat/zeit.ts` 45-47. Für eine noch nicht geladene Zone gibt es zwei Politiken: 51× `?? 'Europe/Berlin'`, davon 45× `organizationTimeZone ?? 'Europe/Berlin'` gegen 22× `zone ? … : ''`.

**Kalendertag.** Die Basis ist `appointments/calendar.ts` 39-68. Daneben stehen 29 Eigenbauten laut Sucher, z. B.:

- in appointments selbst: `serie.ts` 52-56, `api.ts` 911-915;
- in anderen Modulen: `exercise-plans/laufzeit.ts` 33-37, `vacation/feiertage.ts` 40-44, `fleet/format.ts` 63-83, `preview/demodaten.ts` 32-47, `slot-search/SlotSearchPage.tsx` 47-51, `teamchat/zeit.ts` 56-64;
- in src/lib und den Bausteinen: `src/lib/gewohnheiten.ts` 25-29, `src/lib/zeitachse.ts` 7-14, `components/ui/Monatsblatt.tsx` 28-52.

**Formate.**

- 98 `new Intl.DateTimeFormat` in 56 Dateien, nachgezählt.
- „TT.MM.JJJJ in der Praxiszone“ steht 9× mit gleichem Rumpf, z. B. `messages/api.ts` 338-345 = `open-points/format.ts` 2-9.
- „Wochentag + Datum“ gibt es in 13 Funktionen mit 7 Schreibweisen.
- 16 Wochentagslisten mit drei Indexsystemen, z. B. `scheduling/api.ts` 28-36, `waitlist/api.ts` 31-39, `working-time/format.ts` 6-14.

**Belegte Fehler** (nachgerechnet):

- `teamchat/zeit.ts` 12 und 32 bilden „gestern“ als jetzt − 86.400.000 ms. Am 2026-03-30 um 00:30 MESZ ergibt das den 2026-03-28, und am Tag der Rückstellung ist zwischen 23:00 und 24:00 MEZ „gestern“ derselbe Tag wie „heute“; das betrifft zwei Stunden im Jahr.
- `platform/zeit.ts` 30-33: Die Doku verspricht „Di 14.10.“, die Funktion liefert „Mi., 14.10“.
- `datenschutz/datei.ts` 10-16 nimmt für den Dateinamen den UTC-Tag.
- `audit/api.ts` 52-65 bildet die Tagesgrenzen in Gerätezeit.
- `patients/api.ts` 238-245 prüft per Date-Parse und lässt „2026-02-31“ durch (V8 macht daraus den 03.03.). Die Wirkung ist gering, weil `type="date"` und der Server-Cast solche Werte abweisen.

**Fachlich nötig:** Die Plattform rechnet bewusst in Gerätezeit (ADR-023 Punkt 26); das wird ein Parameter, keine eigene Funktion. Die Feiertage sind bewusst doppelt und getestet (`vacation/feiertage.ts` gegen `app.is_public_holiday`).

**Abstraktion:**

- SQL: `app.org_today(p_org uuid default app.current_organization_id()) returns date`, STABLE; training_today bleibt als Alias. Dazu `app.org_month_start(p_org uuid default …) returns date`.
- `src/lib/praxiszeit.ts`: `heuteIn(zone: string): Kalendertag`, `kalendertagIn(iso: string, zone: string): Kalendertag`, `zeitpunktIn(tag: Kalendertag, minute: number, zone: string): string`, `ERSATZZONE`.
- `src/lib/kalendertag.ts`: `istKalendertag(w): w is Kalendertag`, `plusTage(t, n)`, `tageZwischen(von, bis)`, `isoWochentag(t): 1|2|3|4|5|6|7`, `montagDerWoche(t)`, `monatPlus(m, n)`, `tageImMonat(m)`.
- `src/lib/datumsformat.ts`: `WOCHENTAGE: readonly { nr: 1|…|7; kurz: string; lang: string; adverb: string }[]`, `datumIn(iso, zone)`, `wochentagUndDatum(wert, o?: { zone?: string; mitJahr?: boolean })`, `monatJahr(tag)`.
- `usePraxiszeit(user): { zone: string; heute: Kalendertag }` als einzige Fallback-Politik. `appointments/api.ts` und `calendar.ts` re-exportieren.

Nebeneffekt: 52 von 106 Importanweisungen auf `appointments/api` aus 23 Modulen holen nur Zeithelfer (1b). Und staff importiert fleet nur für `montagDerWoche` (`staff/NewStaffMemberPage.tsx` 21).

**Einsparung ≈ 300.** Schätzung: Praxiszeit −80 (SQL-Anteil ~50 erst nach dem Basis-Abzug), Kalendertag −100, Formate −150 statt −280 laut Sucher, weil Ableitungszeilen und Formatter-Cache geschätzt sind.

#### 8 · Formulargerüst je Seite von Hand, mit Fokussprung beim Korrigieren

**Stellen:**

- `patients/EditPatientPage.tsx` 48-188 (setzen 98-102, Zod-Schleife 111-116, Zusammenfassung 131-138)
- `patients/NewPatientPage.tsx` 52-290
- `staff/EditStaffMemberPage.tsx` 62-197
- `training/NewTrainingClientPage.tsx` 55-249
- `training/TrainingClientPage.tsx` 449-552
- `treatment-bases/PrescriberFormPage.tsx` 114-257
- `treatment-bases/TreatmentBasisFormPage.tsx` 100-518
- `fleet/BikeForm.tsx` 74-274 (Zusammenfassung 156)
- `vacation/AnspruchPage.tsx` 110-236
- `waitlist/WaitlistFormPage.tsx` 87-365

**Vorhandene Basis:** `src/lib/formularfehler.ts` und `src/components/ui/Fehlerzusammenfassung.tsx` (104 Zeilen, 25 Aufrufe, nachgezählt). Es fehlt der Zustandsteil.

**Muster** laut Sucher:

- 13× dieselbe Schleife über die Zod-issues;
- 14× Feldfehler wortgleich beim Tippen gelöscht;
- 3 Formen des Dirty-Checks;
- der Satz „Die Eingaben stehen noch im Formular …“ 13× in 11 Dateien;
- `weiterMitEnter` nur in 2 von ~25 Formularen.

**Fehler**, aus dem Code abgeleitet, nicht im Browser geprüft: `Fehlerzusammenfassung.tsx` 63-65 fokussiert den Kasten bei jeder Änderung von `anzahl`. In 12 Live-Formularen, die Feldfehler beim Tippen löschen, springt der Fokus deshalb bei ≥ 2 Fehlern nach dem ersten Tastendruck aus dem Feld in den Kasten. Betroffen sind EditPatient, NewPatient, EditStaff, NewTrainingClient, TrainingClient, Prescriber, TreatmentBasis, Bike, Anspruch, NewEvent, NewEventSeries und EditEvent. Genau diesen Effekt nennt NewAppointmentPage 157-166 als Grund für die Momentaufnahme.

**Abstraktion:**

- `useFormular<F extends string, D>({ start: Record<F, string>, felder: readonly F[], beschriftungen: Record<F, string>, feldId: (f: F) => string, pruefen: ZodType<D> | ((w) => { daten: D } | { fehler: Partial<Record<F, string>> }), zusatz? })` liefert `{ werte, setzen, fehler, ungespeichert, absenden(): D | null, zusammenfassung: { key: number; fehler: Formularfehler[] }, formProps }`. Die Momentaufnahme mit key ist dann die einzige Strategie.
- `feldfehlerAus(issues)` in `formularfehler.ts`.
- `Speicherfehlerfenster({ titel, onSchliessen, zurueckAuf })` in `Dialogfenster.tsx`.
- Sofort und unabhängig davon möglich: `Fehlerzusammenfassung` bekommt einen Prop `pruefung: number` als Auslöser für den Fokus.

**Einsparung ≈ 170.** Schätzung: rund 20 Zeilen je Formular bei 10 Formularen, dazu Fokus-Rückgabe und Fenster, abzüglich ~100 Zeilen Hook und Fenster.

#### 9 · React-Query-Abfragen wiederholen Standardwerte und Paare aus Schlüssel und Ladefunktion

**Stellen:**

- `src/app/App.tsx` 34-42 setzt als Standard `retry: false`, `staleTime 30_000` und `refetchOnWindowFocus false`.
- Trotzdem stehen 372 Zeilen `retry: false` in Nicht-Test-Code (grep); laut Sucher (AST) 347 davon an Abfragen, bei 487 `useQuery`.
- Paare, nachgezählt: `['patient', id]` + `fetchPatient` 17×, `fetchAssignableTherapists` 15×, `['locations']` 9×. Laut Sucher sind es 42 Gruppen an 154 Stellen mit 858 Zeilen.
- Die einzige Basis ist `open-points/eingang.ts` 69-191.
- Dieselben 5 Invalidierungen stehen 3× von Hand: `billing/InvoiceDetailPage.tsx` 824, `Zahlungsformular.tsx` 117, `Zahlungsstorno.tsx` 41. Vorbild für einen Helfer ist `appointments/tageslage.ts` 22.

**Risiko niedrig:** Die Sucher fanden keine tote Invalidierung und keine Schlüsselkollision.

**Voraussetzung:** 19 Tests bauen `new QueryClient()` ohne Standardwerte (nachgezählt). Sie brauchen `testQueryClient()` in `src/test-utils.tsx`, sonst wiederholen ihre Fehlerfälle dreimal mit Backoff.

**Abstraktion:** je Besitzermodul eine `abfragen.ts`, z. B. `export const patientAbfrage = (id: string) => queryOptions({ queryKey: ['patient', id] as const, queryFn: () => fetchPatient(id) })`. Aufruf: `useQuery({ ...patientAbfrage(id), enabled: Boolean(id) })`.

**Einsparung ≈ 330.** Angesetzt sind nur die `retry: false`-Zeilen an Abfragen, 347 abzüglich ~15 Sonderfälle. Den Nettogewinn der Fabriken (Sucher +172) habe ich nicht eingerechnet.

#### 10 · Weiche für Laden, Fehler und Leer 65-mal neben dem vorhandenen Abfragezustand

„Weiche“ meint hier einen ganzen Lade-, Fehler- und Leer-Block, nicht einen einzelnen Ternär (2a.3 zählt 512 Ternäre). **Basis:** `src/components/ui/Abfragezustand.tsx` 1-133 (153 Aufrufe, nachgezählt) und `abfrageTexte.ts` 4-13. Laut Sucher-Liste (`s2bC/weichen.txt`) gibt es 65 Weichen in 53 Dateien mit 626 Zeilen; `<LoadingState` steht in features 89× (nachgezählt).

**Beispiele:**

- Plattform: `platform/Abo.tsx` 44-55 (nachgeprüft: ErrorState und alter Stand erscheinen gleichzeitig), `Vertrag.tsx` 47-62, `Angebot.tsx` 66-80, `Paket.tsx` 44-56, `Checkin.tsx` 46-53 und 213-220.
- `staff/EditStaffMemberPage.tsx` 214-226.
- Mehrfach in einer Datei: `billing/InvoiceDetailPage.tsx` 159-173, 651-657, 947-955, 1244-1255; `scheduling/SchedulingPage.tsx` 428-437, 752-759, 1135-1141.
- Eigene Fehlersatz-Konstanten: `retention/AufbewahrungPage.tsx` 77 (ERNEUT_LADEN) mit Weichen in 412-421 und 533-542, `today/MyDayPage.tsx` 120 (NACH_LADEFEHLER) mit Weiche in 249-256.

**Abweichungen:**

- Nur 10 der 65 Weichen prüfen `!x.data`. Die 7 Plattform-Weichen zeigen bei gescheitertem Nachladen ErrorState über dem alten Stand, in Angebot 78-80 sogar über einem Formular. Das widerspricht ZST-03.
- Den Fehlersatz gibt es in 4 Formen.
- Die Ratsche in `src/designsystem.grenzen.ts` kennt 6 Muster (breiten, details, divideY, knoepfe, tabellen, ueberschriften), die Weiche nicht.

**Abstraktion:** das vorhandene `Abfragezustand` nutzen, ergänzt um `kombiniereAbfragen<A, B>(a: Abfrage<A>, b: Abfrage<B>): Abfrage<[A, B]>`. Dazu als Werkzeugregel ein siebtes Ratschenmuster `weichen`.

**Einsparung ≈ 150.** Schätzung: 65 × ~2,3 Zeilen; die Sucher setzen ~3,1 an.

#### Korrekturen an FAKTEN.md und an den Kandidaten

**FAKTEN.md:**

- „~67 reine Rollentupel mit 7 Tupeln“: Es sind 70 can_*-Funktionen mit 10 Rollenmengen in 12 Schreibweisen. Das 4er-Tupel steht 22× (nicht 20×), alle fünf Praxisrollen stehen 6× (nicht 4×). Dazu kommen is_staff und is_practice_account, zusammen 72.
- „25 public-RPCs rufen has_any_role direkt“: bestätigt, mit 27 Aufrufen.
- „record_denied_read 106“: bestätigt; 140 public-RPCs schreiben überhaupt einen Abweisungseintrag.
- „app.training_today 65“: Das sind 65 Funktionen mit 67 Aufrufen.
- „ca. 394 Literal-Aufrufe in 74 Dateien“: 409 `.rpc(` in 74 Dateien, davon 374 `getSupabase().rpc('…')`, dazu laut Sucher 20 `verbindung.rpc('…')`.
- „36 Spiegel in types.ts“: Es sind 39 exportierte Prädikate.
- Der Copy-Paste-Scanner mit 2,7 % unterschätzt die semantischen Duplikate. Wörtliche Zeilenüberdeckung nach eigener Messung: Terminformulare 57–61 %, Entscheidungsseiten 55 %, Kamera- und Videodialog 64 %.

**Kandidaten:**

- „57 SQL-Funktionen rechnen inline“: 55 ohne die Helfer.
- „BEF-082 16 Funktionen“: heute 15.
- „8× owner als Selbsteintrag“: 9 Vorkommen in 7 Funktionen.
- „257 Aufrufstellen“: 255 per grep.

#### Summe

Die konservative Einsparung der Top 10 liegt bei **≈ 3.650 Zeilen**, eine Schätzung.

- Davon wirken ≈ 800 erst nach dem nächsten Basis-Abzug: Fund 4 550, Fund 5 150, Fund 3 50, Fund 7 ~50.
- ≈ 2.850 sind TS-Zeilen.

Belegte Fehler, die aus Abweichungen der Kopien folgen:

- Fund 1: 4 Fehler, darunter der 403-Nachtrag im Training;
- Fund 3: 7 SQL- und 2 UI-Abweichungen;
- Fund 5: 2 Sperren ohne Nachprüfung und das schwächere Upload-Recht der Akte;
- Fund 6: eine Namensvertauschung und toter widersprüchlicher Code;
- Fund 7: 5 Fehler;
- Fund 8: der Fokussprung in 12 Formularen;
- Fund 10: 7 Abweichungen von ZST-03.

#### Verworfen, zusammengeführt, nicht ausgewählt

**Zusammengeführt:**

- Kandidat 3 (Antragsmechanik SQL), 4 (Antrags-Oberfläche, 930) und 14 (Genehmigen/Ablehnen, 400) sind Fund 3. 4 und 14 beschreiben dieselben vier Seiten; die 930 aus Kandidat 4 sind überzeichnet, weil generische JSX-Zeilen die wörtliche Überdeckung aufblähen.
- Kandidat 5 (Upload-Prüfzustand), 10 (Dateitransfer), 19 (SQL-Lebenszyklus) und 20 (Upload- und Ladeweg TS) sind Fund 5. Sie zeigen dieselben Funktionen; einzeln gezählt wäre die Einsparung doppelt.
- Kandidat 7 (RPC-Aufrufgerüst), 8 (Fehlerabbildung), 11 (antwort gegen .parse) und der TS-Teil von 2 (abgewiesen je Aufrufstelle) sind Fund 1. Wrapper und Mapper sind dieselben Funktionen, die Abstraktion ist eine einzige Schicht.
- Kandidat 18 (Praxiszeit), 21 (Kalendertag) und 22 (Datumsformate) sind Fund 7. Dieselben Dateien (teamchat/zeit.ts, fleet/format.ts, preview) und dieselbe Ursache: Die Basis liegt in appointments, nicht in src/lib.

**Nicht in den Top 10, aber bestätigt:**

| Kandidat                                                      | Befund                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Einsparung                                                                          | Rangwert | Empfehlung                                                                                        |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| 23 Kamera-/Videodialog                                        | `files/Kameradialog.tsx` und `platform/Videodialog.tsx` teilen 251 von 391 Codezeilen; dem Videodialog fehlen der NotReadableError-Zweig (Kameradialog 60-66) und ein Test                                                                                                                                                                                                                                                                                                                                                              | ≈ 120                                                                               | 240      | Platz 11                                                                                          |
| 16 Rückmeldung nach Seitenwechsel                             | `leseMeldung` (`appointments/terminformular.ts` 208-212) nimmt die Meldung nicht aus dem Verlauf, und die 6 Produktivnutzer setzen nirgends `state: null` (nachgeprüft). Nach Neuladen erscheint sie wieder; bei CalendarPage nur ohne gemerkten Kalenderstand. Genau diesen Fehler beschreibt `src/lib/meldung.ts` 22-28 als behoben                                                                                                                                                                                                   | ≈ 60                                                                                | 180      | Einzelfix weitergeben                                                                             |
| 17 Listensuche                                                | Wenig Zeilen. Aber `staff/StaffListPage.tsx` 99-111 und 193 schreiben den Suchbegriff, meist einen Namen, in Adresse und Rückweg, gegen `src/lib/rueckweg.ts` 22-25 („Keine Namen im Rückweg“, ADR-011)                                                                                                                                                                                                                                                                                                                                 | ≈ 30                                                                                | 90       | als Datenschutzbefund weitergeben                                                                 |
| 6 Statuswerte                                                 | `training/api.ts` 413 schreibt den Terminstatus neu, statt `appointmentStatusSchema` aus `appointments/api.ts` 32-39 zu nehmen; dazu 3× `['draft','issued']` in billing und 6× `['draft','final']`                                                                                                                                                                                                                                                                                                                                      | ≈ 25                                                                                | 50       | Der Nutzen liegt im Drift-Test gegen pg_constraint; der kann mit dem Drift-Test aus Fund 6 laufen |
| Terminzustandsübergänge (ADR-018), nach der Gegenlese ergänzt | SQL-Rümpfe: `cancel_appointment` 123, `cancel_appointment_event` 64, `cancel_event_series` 67, `complete_appointment` 84, `reopen_appointment` 113, `record_no_show` 118, `undo_appointment_creation` 160, `waive_appointment_fee` 70 Zeilen (psql); jede Funktion bildet ihren Übergang selbst ab, die Rümpfe sind nicht im Einzelnen verglichen. Client: `TerminAktionen.tsx` 893–929 leitet aus Rolle × Status × `kind` × `occasion` × `fee_basis` 9 Flags ab; Ereignis- und Serienabsage teilen 57 von 95 eindeutigen Zeilen (2a.3) | ≈ 100 TS (Schätzung: Ereignis- und Serienabsage zusammenlegen); SQL nicht beziffert | –        | über B6 (2a.4): Der Server liefert die erlaubten Übergänge, der Client leitet keine Flags mehr ab |

**Verworfene Teilbehauptungen:** Vollständig verworfen ist kein Kandidat. Diese Teilbehauptungen halten nicht:

- fleet und reimbursements verschlucken den Fehler von `discard_*`: gewollt und kommentiert, kein Befund.
- „Für patient_file_access_grants ist issue_patient_file_link der einzige Abbau“: falsch, auch hand_out_patient_photo und claim_storage_deletion_order räumen ab.
- „31. Februar geht durch“ als Fehler mit Wirkung: Native Datumsfelder und der Server-Cast fangen ihn ab, das bleibt nur ein Schönheitsfehler.
- Blob-Typ bei den Patientenfotos als Risiko: praktisch gedeckt durch den mimetype-Abgleich in confirm_*, es bleibt eine Regelabweichung.

**Nicht eingerechnete Einsparungen:**

- Stufe 3 von Kandidat 1 (−543 SQL-Zeilen): großer Umbau mit teurer Rücknahme, nur nach Rückfrage bei Jannes.
- Die Einheitstabelle `upload_objects`: aus demselben Grund.

## 3. Datenbank: Inventur der 1.206 Funktionen und 151 Tabellen

### 3a Inventur der Datenbankfunktionen

Grundlage: Katalog der Analyse-DB (`pg_proc`, Schemata `app` und `public`, identisch mit `funcs.json`, 0 abweichende Rümpfe) und `supabase/migrations/20261225000000_basis.sql` (63.507 Zeilen, Commit 3c5e72b).

- **Rumpfzeilen**: Zeilen zwischen `AS $$` und `$$;` in der Migration. `klassen.json`→`lines` zählt `prosrc`-Zeilen, also je Funktion zwei Leerzeilen mehr; für d) ergibt das 10.096 statt 9.073.
- **Migrationszeilen**: CREATE FUNCTION + COMMENT ON FUNCTION + GRANT/REVOKE derselben Funktion.

Skripte und Rohdaten liegen in `analyse/s3a/`.

#### Endzählung a–e

| Klasse                                      |     Namen | Überladungen | app | public | Rumpfzeilen | Migrationszeilen |            SECURITY DEFINER |
| ------------------------------------------- | --------: | -----------: | --: | -----: | ----------: | ---------------: | --------------------------: |
| a) Trigger-Funktionen                       |        84 |           84 |  71 |     13 |       1.411 |            1.938 |                          33 |
| b) Policy-Helfer (16 davon nur in Policies) |        34 |           34 |  34 |      0 |         393 |              652 |                          28 |
| c) TS-Endpunkte                             |       544 |          544 |   0 |    544 |      30.252 |           35.091 |                         544 |
| d) intern                                   |       515 |          520 | 514 |      1 |       9.073 |           12.914 |                         336 |
| d) Cron-Jobs                                |        10 |           10 |   0 |     10 |         756 |              831 |                          10 |
| e) ohne Produktionsaufrufer                 |        19 |           19 |   9 |     10 |         791 |              950 |                          14 |
| **Summe**                                   | **1.206** |    **1.211** | 628 |    578 |      42.676 |           52.376 | 965 (nach Überladungen 966) |

e) teilt sich auf in 3 verwaist, 13 nur Tests, 2 nur Skripte und 1 Betriebsweg.

**Korrekturen an FAKTEN.md**

- **e) hat 19 Namen, nicht 18.** Damit stimmt die Summe: FAKTEN.md kam auf 1.205.
  - `app.appointment_window_options` (Migration Z. 437) fehlt in der FAKTEN-Aufzählung.
  - Seine einzige Skript-Fundstelle `scripts/basis-migration.mjs:347` ist ein Ankertext des Migrationsgenerators, kein Aufruf.
  - Gerufen wird es nur in `supabase/tests/appointment-window.test.ts:203`, als Gleichlauftest gegen den TS-Spiegel `TERMINFENSTER_OPTIONEN` (`src/features/appointments/api.ts:593–598`).
  - Es gehört deshalb zu „nur Tests“, das damit 13 Funktionen hat; „nur Skripte“ hat 2.
- **Woher die Differenz zu 1.204 kommt.**
  - `scripts/aufraeumen.mjs` (`dbFunktionen`, Z. 100–131) zählt Namen hinter `create function` im Migrationstext.
  - Die Migration enthält 1.206 CREATE FUNCTION. Zwei Namen sind überladen (`app.assert_questionnaire_answers`, `app.reimbursement_view`), also 1.204 Namen.
  - Der Katalog enthält zusätzlich die Konstruktoren, die `CREATE TYPE app.timerange AS RANGE` (Migration Z. 12–14) implizit erzeugt: `app.timerange` (2 Überladungen) und `app.timemultirange` (3), Sprache `internal`, in d) gezählt.
  - Ergebnis: +2 Namen und +5 Überladungen, also 1.206 Namen und 1.211 Überladungen.
- **Rollentupel.**
  - Es gibt 70 reine `can_*`-Rollentupel, nicht „~67“; mit `is_staff` und `is_practice_account` sind es 72.
  - Sie verwenden 10 verschiedene Rollenmengen, nicht 7. Als Schreibweisen sind es 12, weil die Fünferliste in drei Reihenfolgen vorkommt.
  - Häufigkeiten: 23× (22 can_ + is_staff), 18×, 10×, 7×, 5×, 3×, 3×, 1×, 1×, 1×.
- **Parameterlose SQL-Funktionen in app.** Es sind 152; davon sind 132 Einzeiler (FAKTEN nennt 128, andere Abgrenzung) und 62 Konstanten (immutable, ohne Tabellenzugriff).
- **Aufbewahrungsplan.**
  - `public.retention_classes` hat 41 Zeilen, nicht 45 wie im FAKTEN-Querschnitt.
  - `retention_assignments` hat 183 Zeilen über 151 Tabellen. Nach Löschmodus: automatisch 49 Zeilen (44 Tabellen), keine 33 (33), über Elterndatensatz 101 (83).

#### Prüfung der Klassifikation

**c) TS-Endpunkte.** Für alle 544 Funktionen wurde jede Nennung im Code mit herausgerechneten Kommentaren nach Kontext eingeordnet (`ctx.mjs`).

| Aufrufform                          | Funktionen |
| ----------------------------------- | ---------: |
| direkt `.rpc('name'`                |        407 |
| erstes Argument einer lokalen Hülle |        125 |
| `/rest/v1/rpc/…` in Edge Functions  |          8 |
| Ternärausdruck vor `.rpc`           |          4 |
| nur in Kommentaren                  |          0 |

- **Hüllen**: `rufe`, `call`, `aufrufen`, `rufeVorlagen`, verteilt auf 10 Dateien: teamchat, fleet, reimbursements, exercise-plans, nutrition, vacation, timeaccount, working-time, feedback und `supabase/functions/notifications/auftragsbuch.ts`. Jede Hülle ruft nachweislich selbst `.rpc(fn, args)` bzw. `/rest/v1/rpc/${name}`.
- **REST-Aufrufe**: `platform-access/anmeldedienst.ts` und `ai-gateway/berechtigung.ts:52`.
- **Ternärausdrücke**: `training/api.ts:380` und `appointments/api.ts:986`.
- **Namensgleichheit mit Tabellen**: `platform_messages`, `platform_appointment_requests`, `platform_notification_settings` und `notification_kind_switches` heißen auch so. Jede hat zusätzlich einen echten `.rpc`-Aufruf (`platform/api.ts:1433`, `:242`, `:1693`, `platform-access/benachrichtigungen-api.ts:18`).
- **Stichprobe**: 25 zufällig gezogene Funktionen (LCG, Startwert 20261025, `stichprobe.mjs`, Ausgabe `sample25.txt`). Alle 25 sind echte Aufrufe: 19 direkt, 5 über Hülle, 1 per REST.
- **Eine Ebene höher**: Die TS-Funktion, die den Aufruf enthält, wird in allen 544 Fällen außerhalb von Tests referenziert (`deadts.mjs`). Ob sie über eine Route erreichbar ist, wurde nicht geprüft.
- **Nur Edge Functions**: 21 Funktionen werden nur von dort gerufen; 19 davon sind nicht für `authenticated` ausführbar, sondern nur für `service_role`.

**b) Policy-Helfer.**

- Alle 34 wurden direkt gegen `pg_policies` bestätigt.
- 18 stehen in den 20 Policies auf `storage.objects` (Migration Z. 63329–63348): 6 Bucket-Konstanten, 5 `may_read_*_object`, 5 `may_upload_*_object`, `may_delete_storage_object`, `may_read_storage_object_for_deletion`.
- 16 stehen in Policies auf public-Tabellen. Am häufigsten: `current_organization_id` (44 Policies), `can_read_exercise_plans` (10), `is_staff` (9).
- 16 werden nur von Policies genutzt: 12 Storage-Helfer sowie `can_read_service_catalog`, `can_read_billing_profile`, `is_practice_account` und `practice_today`.
- Keine public-Funktion wird in einer Policy verwendet.

**e) ohne Produktionsaufrufer** (alle 19 per `git grep` außerhalb der Migration geprüft)

| Funktion                                                              | Unterklasse            | Rumpfzeilen | EXECUTE authenticated | Fundstelle außerhalb der Migration                                                                               |
| --------------------------------------------------------------------- | ---------------------- | ----------: | :-------------------: | ---------------------------------------------------------------------------------------------------------------- |
| app.exercise_illustration_bases                                       | verwaist               |           5 |           –           | nur Doku (ASSUMPTIONS.md:4543, BEFUNDE.md:717)                                                                   |
| app.platform_mailbox_confirmed                                        | verwaist               |           7 |           –           | nur Doku                                                                                                         |
| app.team_message_text                                                 | verwaist               |          11 |           –           | nur BEFUNDE.md:717                                                                                               |
| app.appointment_window_options                                        | nur Tests (korrigiert) |           1 |           –           | appointment-window.test.ts:203; TS-Spiegel api.ts:598                                                            |
| app.has_strong_authentication                                         | nur Tests              |           1 |          ja           | staff-accounts.test.ts:896–928                                                                                   |
| app.mdr_released                                                      | nur Tests              |           2 |          ja           | mdr-released.test.ts; nur im Kommentar `src/app/mdr.ts:4`                                                        |
| public.delete_invoice_recipient                                       | nur Tests              |          29 |          ja           | invoice-recipients.test.ts:34, invoices.test.ts:324                                                              |
| public.start_/mark_/finish_platform_exercise_session (3)              | nur Tests              |    35/32/44 |          ja           | platform-exercise-sessions.test.ts u. a.; abgelöst durch `sync_platform_exercise_session` (platform/api.ts:1318) |
| public.list_patient_treatment_evidence                                | nur Tests              |          46 |          ja           | TS nur im Kommentar (documentation/api.ts:461–466: „die Akte fragt ihn nicht mehr an“)                           |
| public.place_legal_hold / place_staff_legal_hold / release_legal_hold | nur Tests              |    49/44/46 |          ja           | abgewiesene-schreibpfade.test.ts, legal-hold*.test.ts                                                            |
| public.reapply_deletion_journal                                       | nur Tests              |         214 |           –           | 24 DB-Testtreffer; Betriebsweg in docs/DEVELOPMENT.md:551–560                                                    |
| public.update_service_catalog_version                                 | nur Tests              |          45 |          ja           | service-catalog.test.ts:242                                                                                      |
| app.import_food_catalog_batch / finish_food_catalog_import            | nur Skripte            |       29/19 |           –           | scripts/lebensmittel/laden.mjs:43/48                                                                             |
| app.bootstrap_practice                                                | Betriebsweg            |         132 |           –           | docs/betrieb/bootstrap.md:63                                                                                     |

- Keine public-Funktion steht im TS nur in Tests oder Kommentaren und wurde trotzdem als c) gezählt.
- 10 public-Funktionen haben keinen Produktionsaufrufer. 9 davon sind für `authenticated` ausführbar und damit über PostgREST ohne Oberfläche erreichbar; sie prüfen die Rechte selbst. Dazu kommt `public.void_offset_payments` (d), das ebenfalls für `authenticated` ausführbar ist.
- **Legal Hold**:
  - Lesen ist in der Oberfläche vorhanden (`list_legal_holds`, src/features/retention/api.ts:95). Setzen und Aufheben kommen nur aus Tests.
  - Eine Betriebsanleitung dafür fehlt in `docs/betrieb/` (dort liegen nur bootstrap.md und lebensmitteldaten.md).
  - Die Formulierung „laut Betriebsdoku gewollt“ aus BEF-229 ist damit nur für `reapply_deletion_journal` belegt.

#### d) intern nach Rolle

Die Rollen wurden in fester Regelreihenfolge zugewiesen: zuerst nach Namensmuster, dann nach Rumpfmerkmalen (`provolatile`, Zahl der Argumente, Tabellenzugriff); siehe `rollen.mjs`, Ergebnis in `rollen.json`.

| Rolle                                             | Funktionen | Rumpfzeilen | Migrationszeilen |                                                 SECURITY DEFINER | Beispiele / Aufrufstellen                                                        |
| ------------------------------------------------- | ---------: | ----------: | ---------------: | ---------------------------------------------------------------: | -------------------------------------------------------------------------------- |
| Fachberechnung und -abfrage                       |        131 |       2.692 |            3.693 |                                                               71 | nutrition_calculation, build_invoice_document, leave_balance, working_ranges     |
| Autorisierung (can_/may_/is_/Zugriffsprüfung)     |        112 |         586 |            1.448 |                                                              110 | 79 can_, 3 may_, 30 weitere wie platform_access_allows (52 Aufrufer)             |
| Konstante/Konfiguration (parameterlos, immutable) |         54 |         148 |              544 |                                                                0 | session_idle_timeout, pin_max_attempts, notification_kinds                       |
| Validierung, Guards, Normalisierung               |         49 |       1.257 |            1.613 |                                                               16 | assert_* (15), *_valid, *_problems, fleet_text                                   |
| JSON-Projektion und Anzeige                       |         44 |         910 |            1.242 |                                                               31 | *_json (22), *_view, *_display_name                                              |
| Aufbewahrung und Löschung                         |         33 |       1.549 |            1.798 |                                                               26 | delete_due_* (11), delete_patient_record (204 Rumpfzeilen), retention_*          |
| Org-/Kontext-Auflösung und *_for_write-Lader      |         29 |         415 |              621 |                                                               28 | staff_request_org (37 Aufrufer), fleet_org (22), own_pending_*                   |
| Schreibende Hilfsfunktion (volatile)              |         29 |       1.034 |            1.247 |                                                               28 | write_treatment_base_items, enqueue_notification, public.void_offset_payments    |
| Sitzung, JWT, eigene Person                       |         16 |         166 |              275 |                                                               12 | jwt_*, session_open, teamchat_member                                             |
| Storage/Dateien                                   |          9 |         171 |              235 |                                                                6 | grant_message_attachment, patient_file_bucket_for                                |
| Audit-/Zugriffsprotokoll                          |          4 |          98 |              127 |                                                                4 | log_platform_representation (54 Aufrufer), log_record_access (29)                |
| Abweisungsprotokoll                               |          3 |          47 |               71 |                                                                3 | record_denied_read (108 Stellen in 106 Funktionen), _write (34), _owner_read (2) |
| Typkonstruktor (Range)                            |          2 |           0 |                0 |                                                                0 | timerange, timemultirange                                                        |
| **Summe**                                         |    **515** |   **9.073** |       **12.914** | **335** (Rollenzuordnung; nach Namen 336, nach Überladungen 337) |                                                                                  |

Weitere häufig gerufene Helfer: `app.current_organization_id` wird an 338 Stellen in 337 Funktionen gerufen, `app.has_any_role` an 119 Stellen in 110 Funktionen. 25 public-RPCs rufen `has_any_role` direkt statt einer benannten `can_*`-Funktion.

#### e) Familien, die redundant oder generisch ersetzbar sind

| Familie                                                                                                                                                                   |               Funktionen | Rumpfzeilen |           Migrationszeilen | Ersatz                                                                                                                                                      | Funktionen danach |    Einsparung Funktionen |                                                                   Einsparung Zeilen (Schätzung) |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -----------------------: | ----------: | -------------------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------: | -----------------------: | ----------------------------------------------------------------------------------------------: |
| (1) can_*-Rollentupel und Aliase                                                                                                                                          | 76 (72 Tupel + 4 Aliase) |          77 |                        665 | Tabelle Fähigkeit → Rollenmenge (72 Schlüssel mit 202 Rolle-Fähigkeit-Paaren, dazu 4 Aliase als Verweis auf einen Schlüssel) + `app.can(text)`              |                 1 |                       75 |                                                  ≈ 570 (665 − ≈ 95 für Tabelle, Seed, Funktion) |
| (2) Parameterlose Konstanten (ohne Buckets)                                                                                                                               |                       56 |         154 |                        566 | 46 → Konfigurationstabelle + `app.setting(text)`; 10 bleiben immutable, weil sie in CHECK-Constraints stehen                                                |                11 |                       45 |                                         ≈ 390 (566 − 111 für die 10 verbleibenden − ≈ 65 Neues) |
| (3) Storage-Policy-Helfer: __bucket, patient_file_bucket_for, may_read___object, may_upload_*\_object, _*for_deletion, may_delete_storage_object, order*__object_deletion |                       24 |         416 | 588 (+20 Storage-Policies) | Register je Bucket + generische `may_read_object`, `may_upload_object`, Trigger `order_object_deletion` (Bucket über TG_ARGV); Patientenakte als Sonderfall |               ≈ 7 |                     ≈ 17 |                                                                          ≈ 370; Policies 20 → 4 |
| (4) discard_stale_* (Cron), record_*_verification, *_for_verification                                                                                                     |                       15 |         371 |  493 (+5 von 10 Cron-Jobs) | `discard_stale_uploads()`, `object_for_verification(bucket, …)`, `record_object_verification(bucket, …)` über das Register; Patientenakte als Sonderfall    |               ≈ 4 |                     ≈ 11 |                                                                          ≈ 330; Cron-Jobs 5 → 1 |
| (5) delete_due_*                                                                                                                                                          |                       11 |         809 |                        895 | `app.delete_due(table)` über `retention_assignments` für 6 einfache Regeln (322 Rumpfzeilen); 5 Sonderfälle bleiben                                         |                 6 |                        5 |                                                                                           ≈ 290 |
| (6a) *_org-Helfer                                                                                                                                                         |                        9 |         137 |                        200 | staff_request_org ≡ fleet_org (bytegleich); exercise_library_writer → staff_request_org; auskunft_organisation(_training) → eine Funktion mit Art-Parameter |                 6 |                        3 | 79 direkt; dazu ≈ 160 für 18 public-RPCs mit wörtlich eingebautem Prolog (≈ 9 Zeilen je Stelle) |
| (6b) *_for_write-Lader                                                                                                                                                    |                        6 |         110 |                        152 | keiner: verschiedene Tabellen und Bedingungen, kein Paar mit J ≥ 0,8                                                                                        |                 6 |                        0 |                                                                                               0 |
| (7) list_*-RPCs                                                                                                                                                           |                      100 |           – |                      5.743 | 16 (Typ A und D unten) als `security_invoker`-View + SELECT-Policy                                                                                          |     84 + 16 Views |                       16 |                                                     ≈ 190 (643 − ≈ 450 für View, Policy, Grant) |
| **Summe (1)–(7)**                                                                                                                                                         |                          |             |                            |                                                                                                                                                             |                   | **172** (14 % von 1.206) |                                                                **≈ 2.400** (≈ 3,8 % von 63.507) |

Die Zeilenersparnisse sind Schätzungen: jeweils Migrationszeilen der Familie minus der Umfang, den Ersatztabelle, Seed und generische Funktion vermutlich brauchen. Nach dem Ersatz blieben etwa 1.034 Funktionen.

**(1) Rollentupel**

- Betroffen sind 70 can_ und 2 is_ mit reinem `select app.has_any_role(…)` sowie 4 Aliase: can_read_calendar, can_read_training_protocols, can_use_text_snippets, can_read_treatment_basis_clinical.
- Umzuschreiben wären 404 Aufrufstellen in 349 Funktionen und 35 in Policies.
- Bleiben würden 14 parametrierte oder zusammengesetzte `can_*`, z. B. can_write_patient_file und can_record_services_for_appointment.
- Risiko: Ein Tippfehler in `app.can('x')` fällt erst zur Laufzeit auf. Das gilt wegen `set check_function_bodies = false` (Migration Z. 4) heute aber auch für `app.can_x()`. Absichern ließe sich das über einen Fremdschlüssel auf die Fähigkeitsschlüssel und einen Test.

**(2) Konstanten**

- In CHECK-Constraints stehen 10: fleet_photo_sides, exercise_axes, exercise_body_regions, fleet_breakdown_outcomes, exercise_goals, fleet_bike_types, exercise_starting_positions, notification_kinds, team_voice_max_seconds, staff_color_palette. CHECK verlangt IMMUTABLE, eine Tabellenabfrage ist dort nicht möglich.
- 25 der 62 Konstanten sind im TS gespiegelt (`klassen.json`→`mirror`). Diese Doppelung bleibt, solange der TS-Teil nicht aus der Tabelle erzeugt wird.

**(3)/(4) Storage und Upload-Lebenszyklus**

- Die Kopien sind wortgleich bis auf die Objektnamen. Beispiel: `may_read_fleet_photo_object` (Z. 8176–8212) und `may_read_reimbursement_receipt_object` (Z. 8365–8401) haben J 1,00, ebenso die 4 `order_*_object_deletion`.
- **Drift zwischen den Kopien**:
  - `discard_stale_*` schreibt nur bei Erstattungsbelegen ins Löschjournal (Z. 24428–24454); bei Fahrzeugfotos nicht (Z. 24376–24393).
  - Abgelaufene Lesefreigaben räumen nur 3 von 5 Varianten ab.
  - `record_*_verification` schreibt das Journal in 3 Varianten direkt; die Patientenakte nutzt `app.journal_patient_file_deletion`, Rückfrageanhänge `app.remove_message_attachments`.
  - Eine generische Fassung erzwingt ein einheitliches Verhalten; welches, ist zu entscheiden.
- Weitere Kandidaten ohne Ersatzrechnung: prepare___upload (5), confirm_**upload (5), discard**_upload (3) und own_pending__ (4), zusammen 17 Funktionen mit 731 Rumpfzeilen und 876 Migrationszeilen.
- Generische Policy-Helfer brauchen `EXECUTE format(…)`, also Laufzeit-SQL, das pro Zeile in der Policy ausgewertet wird. Die Alternative, eine gemeinsame Objekttabelle, ist ein großer Umbau.

**(5) delete_due_***

- Die 4 Regeln working_time_requests, reimbursements, time_account_entries und staff_leave bilden einen Cluster (J 0,87–0,89, 262 Rumpfzeilen). Zusammen mit nutrition_profiles und platform_accesses sind das die 6 generisch ersetzbaren.
- Sonderfälle mit zusammen 526 Migrationszeilen:

  | Regel             | Rumpfzeilen | Grund                            |
  | ----------------- | ----------: | -------------------------------- |
  | team_messages     |         150 | 6 Tabellen                       |
  | fleet_records     |         137 | 5 Tabellen                       |
  | staff_feedback    |          73 | 3 Tabellen                       |
  | patient_photos    |          57 | Storage, 5 Parameter             |
  | platform_accounts |          70 | kein DELETE, nur Auftrag an Auth |

- `retention_assignments` hat heute nur die Spalten table_name, class_key, deletion_mode, scope_note und sort_order; für den generischen Weg fehlen Anker- und Legal-Hold-Bezug. `apply_retention` (Z. 16996–17549) ruft alle 11 einzeln auf.

**(6) Org-Prolog**

- 21 Funktionen enthalten wörtlich den Prolog von `staff_request_org` (18 davon public): Anmeldung prüfen, Recht prüfen, Organisation laden, jeweils mit 42501.
- 72 Funktionen enthalten beide Bausteine, aber nicht wörtlich gleich.
- `own_staff_member` (Z. 10411) und `fleet_current_staff_member` (Z. 6386) sind ebenfalls bytegleich.

**(7) list\_*-RPCs**

- 99 von 100 sind plpgsql. Die Ausgangsvermutung „select … where organization_id = app.current_organization_id() and app.can_x()“ trifft wörtlich auf keine zu.
- Die Einteilung entstand per Musterabgleich auf normalisiertem `prosrc`: Prolog entfernen, dann prüfen, ob genau eine Abfrage übrig bleibt (`fam7b.mjs`).

| Typ                                                                    | Anzahl | Migrationszeilen | Durch View/SELECT-Policy ersetzbar?                                                                                |
| ---------------------------------------------------------------------- | -----: | ---------------: | ------------------------------------------------------------------------------------------------------------------ |
| A: Prolog + 1 Abfrage, Org-Filter, ohne Abweisungsprotokoll            |     13 |              535 | ja, aber ohne Recht kommen 0 Zeilen statt Fehler 42501                                                             |
| D: Prolog + 1 Abfrage, Org-Filter indirekt (Join/Helfer)               |      3 |              108 | ja (darunter das e)-Objekt list_patient_treatment_evidence)                                                        |
| B/B2: Prolog (ggf. Parameterprüfung) + 1 Abfrage mit `record_denied_*` |     27 |            1.340 | nein, ohne Verlust von `access.denied` (ADR-010 Punkt 16, docs/adr/ADR-010-audit-and-privileged-access.md:151–152) |
| C: protokolliert den Lesezugriff (`log_record_access`)                 |     12 |              770 | nein (Leseprotokoll nach ADR-010)                                                                                  |
| E: mehrteilige Logik                                                   |     45 |            2.990 | nein; Schätzung: ≈ 12 davon haben vor der Abfrage nur eine Zeitzonenabfrage (Durchsicht der Rümpfe)                |

#### Ähnlichkeitscluster der Funktionsrümpfe

Verfahren (`jaccard.mjs`):

- Kommentare entfernt, Text in Kleinbuchstaben, Strings → S, Zahlen → N.
- Variante A: alle Bezeichner außer SQL-Schlüsselwörtern → I. Variante B: Objektnamen nach `app.` bzw. `public.` bleiben stehen.
- Rümpfe als 4-Gramm-Shingles, Jaccard-Ähnlichkeit, Cluster per Union-Find.
- Einbezogen sind nur Rümpfe mit mindestens 30 Tokens: 979 von 1.206.

| Variante / Schwelle | Paare | Cluster | Funktionen | Rumpfzeilen | Zeilen über dem längsten Vertreter je Cluster |
| ------------------- | ----: | ------: | ---------: | ----------: | --------------------------------------------: |
| A, J ≥ 0,8          |    74 |      45 |        104 |       2.763 |                                         1.432 |
| A, J ≥ 0,7          |   159 |      67 |        185 |       7.216 |                                         3.826 |
| A, J ≥ 0,9          |    53 |      32 |         74 |       1.578 |                                           808 |
| B, J ≥ 0,8          |    45 |      31 |         69 |       1.682 |                                           868 |

Die letzte Spalte ist eine Obergrenze für das Zusammenlegen. Generische Fassungen brauchen Parameter, sparen also weniger.

Die 104 Funktionen der Variante A (J ≥ 0,8) verteilen sich auf die Klassen so: c) 44, d) 39, a) 12, b) 5, e) 2, Cron 2.

Byte-identische Rümpfe (Leerraum und Kommentare normalisiert): 20 Gruppen mit 94 Funktionen, davon 74 überzählig.

- 8 Rollentupel-Gruppen mit 68 Funktionen.
- 8 Konstanten-Gruppen mit 18 Funktionen, z. B. `select 7` ×3 und `select 3` ×3.
- staff_request_org ≡ fleet_org, own_staff_member ≡ fleet_current_staff_member, exercise_plan_text ≡ fleet_text, aftercare_tax_allowed ≡ training_package_tax_allowed.

Größte Cluster (Variante A, J ≥ 0,8; Rumpfzeilen in Klammern):

| #   | Funktionen                                                                                                                                 | Rumpfzeilen | J (A)     | J (B)     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------: | --------- | --------- |
| 1   | app.delete_patient_record (204, Z. 4493), app.delete_training_relationship (170, Z. 4705)                                                  |         374 | 0,90      | 0,82      |
| 2   | public.create_appointment (171, Z. 20468), public.create_training_appointment (167, Z. 22236)                                              |         338 | 0,80      | < 0,8     |
| 3   | app.delete_due_working_time_requests (56), _reimbursements (58), _time_account_entries (61), _staff_leave (87)                             |         262 | 0,87–0,89 | 0,82–0,83 |
| 4   | public.list_patient_course_events (31), list_patient_questionnaire_responses (49), list_removed_patient_course_events (33)                 |         113 | 0,81–0,85 | 0,86*     |
| 5   | public.list_treatment_basis_versions (44), get_treatment_note_versions (50)                                                                |          94 | 0,89      | < 0,8     |
| 6   | public.place_legal_hold (49), place_staff_legal_hold (44)                                                                                  |          93 | 0,94      | 0,89      |
| 7   | public.set_documentation_deadline (44), set_appointment_grid (44)                                                                          |          88 | 0,83      | < 0,8     |
| 8   | public.set_location_garage (42), set_location_tour_start (45)                                                                              |          87 | 0,88      | 0,88      |
| 9   | public.revoke_platform_access (36), record_companion_consent_withdrawn (39)                                                                |          75 | 0,97      | 0,98      |
| 10  | public.confirm_fleet_photo_upload (30), confirm_reimbursement_receipt_upload (40)                                                          |          70 | 0,85      | < 0,8     |
| 11  | public.list_invoice_reminders (22), list_invoice_recipients (23), list_invoice_payments (24)                                               |          69 | 0,82–0,88 | 0,86*     |
| 12  | app.billing_retention_due_at (35), training_billing_retention_due_at (32): unterscheiden sich nur in patient_id ↔ training_relationship_id |          67 | 1,00      | 1,00      |
| 13  | app.may_read_fleet_photo_object (32), may_read_reimbursement_receipt_object (32)                                                           |          64 | 1,00      | < 0,8     |
| 14  | public.set_exercise_archived, set_exercise_variant_archived, set_exercise_variant_reviewed (je 20)                                         |          60 | 1,00      | 0,91–0,94 |
| 15  | app.auskunft_organisation (25, Z. 1402), auskunft_organisation_training (27, Z. 1435)                                                      |          52 | 1,00      | 0,90      |
| 16  | app.order_{fleet_photo, message_attachment, reimbursement_receipt, team_attachment}_object_deletion (je 11)                                |          44 | 1,00      | 0,83      |

\* In Variante B bilden nur zwei der drei Funktionen einen Cluster: list_patient_course_events und list_removed_patient_course_events bzw. list_invoice_reminders und list_invoice_recipients.

#### Zeilenbilanz der Basis-Migration (63.507 Zeilen, 3.089.761 Bytes, 7.227 Anweisungen)

Gezählt per Anweisungsparser mit Dollar-Quoting (`migstmt.mjs`; die Summe über alle Kategorien ergibt genau 63.507 Zeilen).

| Kategorie                                                                                                  | Anweisungen |     Zeilen | Anteil Zeilen |     Bytes | Anteil Bytes |
| ---------------------------------------------------------------------------------------------------------- | ----------: | ---------: | ------------: | --------: | -----------: |
| Funktionsrümpfe: Code                                                                                      |           – |     36.775 |        57,9 % | 1.456.212 |       47,1 % |
| Funktionsrümpfe: Kommentarzeilen                                                                           |           – |      2.764 |         4,4 % |   187.263 |        6,1 % |
| Funktionsrümpfe: Leerzeilen                                                                                |           – |      3.137 |         4,9 % |     3.137 |        0,1 % |
| Funktionsköpfe (CREATE … AS $$ / $$;, ≈ 5 Zeilen je Funktion)                                              |       1.206 |      6.016 |         9,5 % |   249.640 |        8,1 % |
| **Funktionen gesamt**                                                                                      |       1.206 | **48.692** |    **76,7 %** | 1.896.252 |       61,4 % |
| CREATE TABLE (mit 812 Inline-CHECKs)                                                                       |         151 |      2.904 |         4,6 % |   194.773 |        6,3 % |
| ALTER TABLE: PK 151, FK 366, UNIQUE 67, EXCLUDE 5, IDENTITY 1                                              |         590 |      1.186 |         1,9 % |    97.747 |        3,2 % |
| RLS aktivieren                                                                                             |         151 |        151 |         0,2 % |    10.016 |        0,3 % |
| Indizes (236 + 68 UNIQUE)                                                                                  |         304 |        304 |         0,5 % |    40.364 |        1,3 % |
| Trigger (89 + 2 Constraint-Trigger)                                                                        |          91 |         91 |         0,1 % |    16.852 |        0,5 % |
| Views                                                                                                      |           5 |        128 |         0,2 % |     4.465 |        0,1 % |
| Schema, Typ, Extensions, set/reset, setval                                                                 |           8 |         11 |         0,0 % |       466 |        0,0 % |
| **Tabellen-DDL gesamt**                                                                                    |       1.300 |  **4.775** |     **7,5 %** |   364.683 |       11,8 % |
| **Grants/Revokes** (auf FUNCTION 2.832, TABLE 201, SCHEMA 5)                                               |       3.038 |  **3.038** |     **4,8 %** |   299.901 |        9,7 % |
| **Policies**                                                                                               |          68 |    **118** |     **0,2 %** |    16.493 |        0,5 % |
| COMMENT ON (FUNCTION 852, COLUMN 322, TABLE 151, CONSTRAINT 21, VIEW 5, POLICY 2, TYPE/TRIGGER/INDEX je 1) |       1.356 |      1.356 |         2,1 % |   390.506 |       12,6 % |
| SQL-Kommentare außerhalb von Rümpfen                                                                       |           – |         29 |         0,0 % |     1.158 |        0,0 % |
| **Kommentare gesamt** (inkl. Kommentarzeilen in Rümpfen)                                                   |       1.356 |  **4.149** |     **6,5 %** |   578.927 |       18,7 % |
| **Seed-artige Daten** `INSERT … VALUES`                                                                    |         250 |    **250** |     **0,4 %** |   111.250 |        3,6 % |
| DO-Blöcke (Cron-Planung, Z. 63355–63490)                                                                   |           9 |        132 |         0,2 % |     4.401 |        0,1 % |
| Leerzeilen außerhalb von Rümpfen                                                                           |           – |      5.117 |         8,1 % |     5.117 |        0,2 % |

**Seed-Zeilen nach Ziel**: retention_assignments 183, retention_classes 41, patient_file_document_types 8, roles 6, storage.buckets 6, questionnaire_definitions 4, food_sources 2. Die 4 Fragebogen-Zeilen sind zusammen 27.769 Bytes lang.

**Funktionsbezogener Anteil**: CREATE (48.692) + COMMENT ON FUNCTION (852) + GRANT/REVOKE ON FUNCTION (2.832) = 52.376 Zeilen, also 82,5 % der Basis.

**Kommentare**: COMMENT ON ist je Anweisung einzeilig, im Mittel 288 Bytes lang. Gemessen in Bytes sind Kommentare daher 18,7 % der Datei, gemessen in Zeilen nur 6,5 %.

**Grants**: Auf jede Funktion kommen im Mittel 2,35 Grant/Revoke-Anweisungen, verteilt auf zwei Blöcke.

- Z. 59092–60311 (1.208 Anweisungen, Überschrift Z. 60300: „Was Migrationen den API-Rollen entzogen hatten, die Supabase in public von selbst vergibt“).
- Z. 60312–63323: ACL-Block im pg_dump-Stil.
- Häufigkeit der Formen (nur Anweisungen auf Funktionen):

  | Form                                            | Anzahl |
  | ----------------------------------------------- | -----: |
  | REVOKE … FROM PUBLIC                            |  1.085 |
  | GRANT … TO authenticated                        |    662 |
  | REVOKE … FROM anon                              |    609 |
  | REVOKE … FROM anon, authenticated               |    447 |
  | GRANT … TO service_role                         |     20 |
  | REVOKE … FROM anon, authenticated, service_role |      9 |

Daten, die in Funktionsrümpfen stecken (z. B. `app.tracking_parameters` als VALUES-Liste, Konstanten-Arrays), zählen hier als Funktionsrumpf, nicht als Seed.

### 3b Die vier Querschnittsfunktionen und die zentrale Registry (Schritt 4)

#### 3b.1 Grundlage und Zählweise

Grundlage: Katalog der Analyse-DB (151 Tabellen, 366 Fremdschlüssel: 152 `cascade`, 182 `restrict`, 30 `set null`, 2 `no action`), die Rümpfe (prosrc) der Funktionen vollständig gelesen, dazu die Tests. Zeilenangaben „prosrc Z.“ zählen im Funktionsrumpf, „basis Z.“ in `supabase/migrations/20261225000000_basis.sql`.

| Pflicht               | Funktionen (Zeilen prosrc)                                                                                                                                                                                                                                                                                                                                                                                   | Definition basis Z.      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| Auskunft              | `public.export_patient_record` (853, 43 Abschnitte), `public.export_training_record` (488, 30 Abschnitte), Helfer `app.checkins_json`, `app.habits_json`, `app.exercise_plan_sessions_json`, `app.exercise_plan_item_json`, `app.nutrition_profile_json` (+5 Unterfunktionen), `app.auskunft_ohne_kennungen`. Selbstauskunft: `public.platform_export` (126) und `public.platform_export_notifications` (49) | 25103, 25962             |
| Aufbewahrung/Löschung | `public.apply_retention` (551) mit 24 Regeln: 10 stehen inline, 14 sind an 15 Funktionen delegiert, darunter `app.delete_patient_record` (206), `app.delete_training_relationship` (172) und `app.reduce_training_relationship` (96). Dazu 6 weitere Zeitpläne: `purge_notification_deliveries` und 5× `discard_stale_*`                                                                                     | 16996, 4493, 4705, 12754 |
| Löschjournal          | 30 schreibende Funktionen mit 77 `insert into public.deletion_journal`. `public.reapply_deletion_journal` (216) arbeitet eine feste Liste aus 51 Einträgen ab (49 Tabellen, `auth_users`, `team_message_contents`)                                                                                                                                                                                           | 40497                    |
| Zusammenführen        | `public.merge_patients` (289; 31 `update`, 5 `delete`), `app.patient_merge_plan` (282; 24 Zähler, 10 Sperrcodes)                                                                                                                                                                                                                                                                                             | 36895, 10590             |

- **Dynamisches SQL** gibt es in den vier Familien genau einmal: `reapply_deletion_journal` (prosrc Z. 166–173, `execute format('… public.%I where %I = any($1) …')`). Der Tabellenname kommt dort aus der festen Liste, der Schlüssel aus `app.deletion_key_column`; nur `training_contact_details` weicht vom Schlüssel `id` ab.
- **`retention_assignments` liest keine DB-Funktion.** Gelesen wird die Tabelle nur von `src/features/retention/api.ts` (Anzeige) und von 20 Testdateien. Die Zuordnung ist heute also Dokumentation mit Test, sie steuert nichts.
- **Was „erfasst“ heißt:**
  - Löschen: Die Tabelle wird ausdrücklich gelöscht, oder sie fällt per `on delete cascade` mit einer ausdrücklich gelöschten Tabelle. Die Kaskadenhülle ist aus `pg_constraint` berechnet.
  - Auskunft: Die Tabelle steht als eigener Abschnitt oder verschachtelt in einem Abschnitt.
  - Journal: Die Tabelle wird namentlich journalisiert, oder sie hängt per `cascade` an einem journalisierten Elterndatensatz und fällt beim Nachziehen mit.
  - Merge: Die Tabelle wird umgehängt oder zusammengelegt, oder sie hängt an einem umgehängten Elterndatensatz.

#### 3b.2 Korrekturen an FAKTEN.md und registry2.json

| Angabe                                      | FAKTEN/Heuristik | Befund                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Beleg                                           |
| ------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Klassen in `retention_classes`              | 45               | **41** (ebenso 41 verschiedene `class_key` in `retention_assignments`)                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `select count(*) from public.retention_classes` |
| Tabellen mit Patienten- oder Trainingsbezug | 74               | Per FK-Weg 74 bestätigt. Fachlich sind es **79**: dazu kommen `persons`, `legal_holds` und `audit_log` (Bezug ohne FK) sowie `platform_account_deletions` und `platform_mailbox_confirmations` (Plattformkonto). Hinzu kommen 2 pseudonyme Tabellen. 6 FK-Wege sind Artefakte, etwa `training_protocols` → `appointments.patient_id` oder `therapy_reports.body_chart_response_id` → `source_access_id` → `training_relationships`; der Check `appointments_kind_fields` schließt sie fachlich aus                                  | Skript `paths.json`                             |
| Auskunft                                    | 57               | Akte **58** (42 Tabellen mit eigenem Abschnitt + 16 verschachtelt), Training **48** (30 + 18), zusammen **71**. Die Heuristik kannte `export_training_record` nicht                                                                                                                                                                                                                                                                                                                                                                 | prosrc beider Funktionen                        |
| „Von keiner der vier berührt“               | 15 Tabellen      | **Falsch für 9 Tabellen:** `training_assessment_results`, `training_assessments`, `training_consent_records`, `training_contracts`, `training_course_events`, `training_packages`, `training_profiles`, `training_protocol_addenda`, `training_takeovers`. Sie stehen in `export_training_record` (prosrc Z. 33–108), fallen per cascade mit `training_relationships` und werden über dessen Journaleintrag nachgezogen. Von den übrigen 6 sind 5 bewusst ausgenommen, 1 ist ohne Entscheidung (`message_attachment_access_grants`) | wie links                                       |
| `delete_patient_record`                     | 12               | 13 explizite Löschungen; mit der Kaskadenhülle (45) sind es **58** Tabellen                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `closure.json`                                  |
| Löschjournal                                | 28               | **45** Tabellen namentlich (+ `auth_users`), davon 27 im Patienten- und Trainingsbereich. Die Reapply-Liste nennt 49 Tabellen; 4 davon schreibt niemand                                                                                                                                                                                                                                                                                                                                                                             | Skript `journal.mjs`                            |
| Merge                                       | 29               | 27 Tabellen direkt (24 umgehängt, 3 zusammengelegt), 34 über den Elterndatensatz, 1 sperrt                                                                                                                                                                                                                                                                                                                                                                                                                                          | prosrc Z. 86–263                                |
| Journal-Schreiber                           | 30               | bestätigt. Regex-Zählungen mit `;` finden nur 29: `app.journal_patient_file_deletion` ist eine SQL-Funktion ohne `;`                                                                                                                                                                                                                                                                                                                                                                                                                | basis Z. 7719                                   |

#### 3b.3 Personenbezug aller 151 Tabellen

| Gruppe                                                                   | Anzahl | Tabellen                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Patient, Trainingskunde, Plattformkonto (Gegenstand der vier Funktionen) | 79     | Matrix 3b.4                                                                                                                                                                                                                                                                     |
| pseudonyme Löschnachweise                                                | 2      | `deletion_journal` (`target_id`); `storage_deletion_orders` (`object_key` = `<org>/<treatment_basis_id oder patient_id>/<file_id>`, gesetzt von `app.set_patient_file_object_key`)                                                                                              |
| Mitarbeitende, Praxiskonten, Dritte                                      | 45     | 18× `staff_*`, 11× `team_*` (ohne `team_channels`), 8× `fleet_*` (über `regular_rider_id` bzw. `holder_staff_id`), `treatment_text_snippets`, `user_profiles`, `user_roles`, `account_pins`, `passkey_approvals`, `session_activity`, `session_unlocks`; `prescribers` (Dritte) |
| ohne Personenbezug                                                       | 25     | `organizations`, `locations`, `roles`, Kataloge, Vorlagen, Konfiguration, `team_channels`, `staff_feedback_blocks` (anonyme Monatssummen)                                                                                                                                       |

Mitarbeitende liegen außerhalb der vier Patientenfunktionen:

- Es gibt **keine Auskunftsfunktion für Beschäftigtendaten**; in `ASSUMPTIONS.md` habe ich keine Entscheidung dazu gefunden.
- Für die 6 Kerntabellen ist die Frist offen (ANN-030).
- Löschregeln mit Journal haben Urlaub, Arbeitszeit, Zeitkonto, Erstattung, Rückmeldung, Teamchat, Radflotte und Profilbild.

#### 3b.4 Matrix der 81 Tabellen im Patienten- und Trainingsbereich

Legende:

- **Bezug:** P = Akte, T = Trainingsverhältnis, PT = beide Spalten, K = Plattformzugang oder -konto, S = Beschäftigte.
- **Auskunft:** P§/T§ = eigener Abschnitt in `export_patient_record` bzw. `export_training_record`. P⊂x = verschachtelt im Abschnitt x. Pl = nur der Selbstexport der Plattform. aus = in `BEWUSST_AUSSEN` begründet.
- **Löschen:** Akte, Tr und Teil stehen für `delete_patient_record`, `delete_training_relationship` und `reduce_training_relationship`; e = ausdrücklich gelöscht, k = per cascade. R = eigene Regel (Klasse).
- **Journal:** J = namentlich. E = über einen journalisierten Elterndatensatz. Rg = regelbasiert ohne Journal, in der `scope_note` begründet. M! = manueller Löschweg ohne Journal.
- **Merge:** U = umhängen, Z = zusammenlegen, Zg = Ziel gewinnt, E = zieht mit dem Elterndatensatz, S = sperrt den Vorgang, – = entfällt.

| Tabelle                          | Bezug     | Weg zur Akte/zum Verhältnis                                              | Auskunft                                                      | Löschen                                                           | Journal                                                                    | Merge                                                     |
| -------------------------------- | --------- | ------------------------------------------------------------------------ | ------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------- |
| aftercare_subscriptions          | P         | patient_id (c)                                                           | P§                                                            | Akte k                                                            | E, M! delete_aftercare_subscription                                        | U                                                         |
| appointment_call_states          | P         | appointment_id (c) → appointments                                        | P§                                                            | Akte k, R anrufstand                                              | J                                                                          | E                                                         |
| appointment_notifications        | PT        | appointment_id (c) → appointments                                        | P§ T§                                                         | Akte k, Tr k, Teil k                                              | E                                                                          | E                                                         |
| appointment_session_fees         | PT        | appointment_id (c) → appointments                                        | P§ T§ (session_fees)                                          | Akte k, Tr k, Teil k                                              | E, M! delete_billable_services/reopen_appointment                          | E                                                         |
| appointments                     | PT        | patient_id (r) / training_relationship_id (r)                            | P§ T§                                                         | Akte e, Tr e, Teil e, R termin_ohne_nachweis                      | J                                                                          | U                                                         |
| audit_log                        | P T S     | subject_id/context (ohne FK)                                             | P§ T§ (access_log)                                            | R auditlog ×2                                                     | J                                                                          | – bewusst (ABN-018: Auflösung über patient_merge_records) |
| billable_services                | PT        | patient_id (r) / training_relationship_id (r)                            | P§ T§                                                         | Akte e, Tr e, Teil: bleibt (Beleg)                                | J, M! 4 RPCs                                                               | U                                                         |
| checkin_schedules                | PT        | patient_id (c) / training_relationship_id (c)                            | P§ T§                                                         | Akte k, Tr k, **Teil: LÜCKE**                                     | E, M! end_checkin_schedule                                                 | Zg + relationship_id                                      |
| checkin_values                   | PT        | checkin_id (c) → checkins                                                | P⊂checkins T⊂checkins                                         | Akte k, Tr k, **Teil: LÜCKE**                                     | E                                                                          | E                                                         |
| checkins                         | PT        | patient_id (c) / training_relationship_id (c)                            | P§ T§                                                         | Akte k, Tr k, **Teil: LÜCKE**                                     | E                                                                          | U + relationship_id                                       |
| custom_foods                     | PT        | profile_id (c) → nutrition_profiles                                      | P⊂nutrition_profiles T⊂…                                      | Akte k, Tr k, Teil k                                              | E, M! delete_platform_food                                                 | E                                                         |
| exercise_plan_days               | PT        | plan_id (c) → exercise_plans                                             | P⊂exercise_plans T⊂…                                          | Akte k, Tr k, **Teil: LÜCKE**                                     | E                                                                          | E                                                         |
| exercise_plan_items              | PT        | plan_id (c) → exercise_plans                                             | P⊂exercise_plans T⊂…                                          | Akte k, Tr k, **Teil: LÜCKE**                                     | E (Entwurf: delete_exercise_plan_item)                                     | E                                                         |
| exercise_plan_session_sets       | PT        | item_id (c) → exercise_plan_items                                        | P⊂exercise_plans T⊂…                                          | Akte k, Tr k, **Teil: LÜCKE**                                     | E                                                                          | E                                                         |
| exercise_plan_session_values     | PT        | session_id (c) → exercise_plan_sessions                                  | P⊂exercise_plans T⊂…                                          | Akte k, Tr k, **Teil: LÜCKE**                                     | E                                                                          | E                                                         |
| exercise_plan_sessions           | PT        | plan_id (c) → exercise_plans                                             | P⊂exercise_plans T⊂…                                          | Akte k, Tr k, **Teil: LÜCKE**                                     | E                                                                          | E                                                         |
| exercise_plans                   | PT        | patient_id (c) / training_relationship_id (c)                            | P§ T§                                                         | Akte k, Tr k, **Teil: LÜCKE**                                     | E (Entwurf: discard_exercise_plan)                                         | U                                                         |
| habit_marks                      | PT        | habit_id (c) → habits                                                    | P⊂habits T⊂habits                                             | Akte k, Tr k, **Teil: LÜCKE**                                     | E                                                                          | E                                                         |
| habits                           | PT        | patient_id (c) / training_relationship_id (c)                            | P§ T§                                                         | Akte k, Tr k, **Teil: LÜCKE**                                     | E                                                                          | U + relationship_id                                       |
| invoice_cancellations            | PT        | invoice_id (r) → invoices                                                | P§ T§                                                         | Akte e, Tr e, Teil: bleibt (Beleg)                                | J                                                                          | E                                                         |
| invoice_items                    | PT        | invoice_id (c) → invoices                                                | P§ T§                                                         | Akte e, Tr e, Teil: bleibt (Beleg)                                | J, M! 4 RPCs + Entwurf                                                     | E                                                         |
| invoice_payment_reminders        | PT        | invoice_id (r) → invoices                                                | P§ T§                                                         | Akte e, Tr e, Teil: bleibt (Beleg)                                | J                                                                          | E                                                         |
| invoice_recipients               | P         | patient_id (r)                                                           | P§                                                            | Akte e                                                            | J, M! delete_invoice_recipient                                             | U (Standardempfänger: Ziel gewinnt)                       |
| invoices                         | PT        | patient_id (r) / training_relationship_id (r)                            | P§ T§                                                         | Akte e, Tr e, Teil: bleibt (Beleg)                                | J (Entwurf: delete_invoice_draft)                                          | U (Sperre draft_invoice_overlap)                          |
| legal_holds                      | P S       | subject_id + subject_type (ohne FK)                                      | P§                                                            | Akte e                                                            | J                                                                          | U (subject_id)                                            |
| message_attachment_access_grants | PT        | attachment_id (c) → platform_message_attachments                         | **keine Entscheidung** (Token wie patient_file_access_grants) | Akte k, Tr k, Teil k, verbraucht/30 s                             | E                                                                          | E                                                         |
| notification_deliveries          | K         | access_id (c) → platform_accesses                                        | Pl (aus, ANN-344)                                             | mit Zugang k, R benachrichtigung (purge)                          | Rg (scope_note)                                                            | E (bleibt am Zugang)                                      |
| nutrition_consent_records        | PT        | profile_id (c) → nutrition_profiles                                      | P⊂nutrition_profiles T⊂…                                      | Akte k, Tr k, Teil k                                              | E                                                                          | E                                                         |
| nutrition_diary_entries          | PT        | profile_id (c) → nutrition_profiles                                      | P⊂nutrition_profiles T⊂…                                      | Akte k, Tr k, Teil k                                              | E, M! delete_platform_diary_entry                                          | E                                                         |
| nutrition_diary_favorites        | PT        | profile_id (c) → nutrition_profiles                                      | P⊂nutrition_profiles T⊂…                                      | Akte k, Tr k, Teil k                                              | E                                                                          | E                                                         |
| nutrition_diary_reminders        | K         | access_id (c) / profile_id (c)                                           | Pl (aus, ANN-344)                                             | Akte k, Tr k, R purge                                             | Rg                                                                         | E                                                         |
| nutrition_profiles               | PT        | patient_id (c) / training_relationship_id (c)                            | P§ T§                                                         | Akte k, Tr k, Teil e, R ernaehrungsberatung                       | J                                                                          | U + relationship_id (Sperre)                              |
| nutrition_water_days             | PT        | profile_id (c) → nutrition_profiles                                      | P⊂nutrition_profiles T⊂…                                      | Akte k, Tr k, Teil k                                              | E                                                                          | E                                                         |
| nutrition_weight_entries         | PT        | profile_id (c) → nutrition_profiles                                      | P⊂nutrition_profiles T⊂…                                      | Akte k, Tr k, Teil k                                              | E                                                                          | E                                                         |
| patient_care_details             | P         | patient_id (c)                                                           | P§                                                            | Akte k                                                            | E (toter Eintrag in der Reapply-Liste)                                     | Z (feldweise)                                             |
| patient_contact_details          | P         | patient_id (c)                                                           | P§                                                            | Akte k                                                            | E (toter Eintrag in der Reapply-Liste)                                     | Z (feldweise, Anschrift als Block)                        |
| patient_course_events            | P         | patient_id (c)                                                           | P§                                                            | Akte k                                                            | E (Entfernen = removed_at)                                                 | U                                                         |
| patient_fee_agreements           | P         | patient_id (c)                                                           | P§ (fee_agreements)                                           | Akte k                                                            | E, M! delete_patient_fee_agreement                                         | U (Sperre)                                                |
| patient_file_access_grants       | P         | patient_file_id (c) → patient_files                                      | aus (BEWUSST_AUSSEN)                                          | Akte k, verbraucht/30 s                                           | E                                                                          | E                                                         |
| patient_files                    | P         | patient_id (c)                                                           | P§ (+ patient_photos)                                         | Akte k, R patientenfoto                                           | J (BEF-170); M! Kaskade aus delete_treatment_basis (BEF-198)               | U                                                         |
| patient_merge_records            | P         | target_patient_id (c)                                                    | P§                                                            | Akte k                                                            | E                                                                          | U (target_patient_id)                                     |
| patient_privacy_records          | P         | patient_id (c)                                                           | P§                                                            | Akte k                                                            | E                                                                          | U                                                         |
| patient_questionnaire_responses  | P         | patient_id (c)                                                           | P§                                                            | Akte k                                                            | E (Entwurf: discard_*)                                                     | U                                                         |
| patients                         | P         | Wurzel                                                                   | P§                                                            | Akte e, R patientenakte                                           | J                                                                          | Z (Versorgungsstand), Quelle fällt ohne Journal (ANN-150) |
| payments                         | PT        | invoice_id (r) → invoices                                                | P§ T§                                                         | Akte e, Tr e, Teil: bleibt (Beleg)                                | J                                                                          | E                                                         |
| persons                          | P T S     | Wurzel                                                                   | P§ T§                                                         | Akte e, Tr e, bedingt (4 Verweise)                                | J                                                                          | Quelle bedingt gelöscht (ANN-150)                         |
| platform_access_invitations      | K         | platform_access_id (c) → platform_accesses                               | P⊂platform_accesses T⊂…                                       | mit Zugang k (R plattformzugang)                                  | E                                                                          | E (bleibt am Zugang)                                      |
| platform_accesses                | PT K      | patient_id (n) / training_relationship_id (n)                            | P§ T§                                                         | Akte/Tr: set null (bleibt mit Zweifel-Vermerk), R plattformzugang | J                                                                          | S (source_has_platform_access, BEF-132)                   |
| platform_account_deletions       | K         | account_user_id (ohne FK)                                                | **keine Entscheidung**                                        | Auftrag bis Bestätigung                                           | J als auth_users                                                           | –                                                         |
| platform_appointment_requests    | PT        | patient_id (c) / training_relationship_id (c) / created_by_access_id (c) | P§ T§                                                         | Akte k, Tr k, Teil: nur Regel, offene bleiben, R terminwunsch     | J                                                                          | U + relationship_id                                       |
| platform_mailbox_confirmations   | K         | account_user_id (c) → auth.users                                         | **keine Entscheidung**; Tabelle ohne Schreiber                | mit Konto                                                         | –                                                                          | –                                                         |
| platform_message_attachments     | PT        | message_id (c) → platform_messages                                       | P⊂platform_messages T⊂…                                       | Akte k, Tr k, Teil k, R rueckfrageanhang                          | J (Entwurf: discard_*_upload)                                              | E                                                         |
| platform_message_entries         | PT        | message_id (c) → platform_messages                                       | P⊂platform_messages T⊂…                                       | Akte k, Tr k, Teil k                                              | E                                                                          | E                                                         |
| platform_messages                | PT        | patient_id (c) / training_relationship_id (c)                            | P§ T§                                                         | Akte k, Tr k, Teil e, R patientenkommunikation                    | J                                                                          | U + relationship_id                                       |
| platform_notification_settings   | K         | access_id (c) → platform_accesses                                        | Pl (aus, ANN-344)                                             | mit Zugang k, Widerruf (Trigger), R purge                         | Rg                                                                         | E                                                         |
| platform_push_subscriptions      | K         | access_id (c) → platform_accesses                                        | Pl (aus, ANN-344)                                             | mit Zugang k, Widerruf (Trigger), R purge                         | Rg                                                                         | E                                                         |
| tasks                            | P         | patient_id (c)                                                           | P§                                                            | Akte k, R aufgabe                                                 | J, M! delete_task                                                          | U                                                         |
| therapy_reports                  | P         | patient_id (c)                                                           | P§                                                            | Akte k                                                            | E (Entwurf: discard_therapy_report); M! Kaskade aus delete_treatment_basis | U                                                         |
| training_assessment_results      | T         | assessment_id (c) → training_assessments                                 | T⊂training_assessments                                        | Tr k, **Teil: LÜCKE**                                             | E                                                                          | –                                                         |
| training_assessments             | T         | training_relationship_id (c)                                             | T§                                                            | Tr k, **Teil: LÜCKE**                                             | E                                                                          | –                                                         |
| training_bases                   | T         | training_relationship_id (r)                                             | T§                                                            | Tr e, Teil e                                                      | J                                                                          | –                                                         |
| training_consent_records         | T         | training_relationship_id (c)                                             | T§ (P: BEWUSST_AUSSEN)                                        | Tr k, **Teil: LÜCKE**                                             | E                                                                          | –                                                         |
| training_contact_details         | T         | training_relationship_id (c)                                             | T§                                                            | Tr k, Teil e                                                      | J (Schlüssel training_relationship_id)                                     | –                                                         |
| training_contracts               | T         | training_relationship_id (c)                                             | T§ (P: BEWUSST_AUSSEN)                                        | Tr k, Teil: bleibt (Beleg)                                        | E                                                                          | –                                                         |
| training_course_events           | T         | training_relationship_id (c)                                             | T§                                                            | Tr k, **Teil: LÜCKE**                                             | E                                                                          | –                                                         |
| training_offers                  | P         | patient_id (c)                                                           | P§                                                            | Akte k                                                            | E                                                                          | U (Sperre)                                                |
| training_packages                | T         | training_relationship_id (c)                                             | T§                                                            | Tr k, Teil: bleibt (Beleg)                                        | E, M! delete_training_package                                              | –                                                         |
| training_profiles                | T         | training_relationship_id (c)                                             | T§                                                            | Tr k, **Teil: LÜCKE**                                             | E                                                                          | –                                                         |
| training_protocol_addenda        | T         | protocol_id (c) → training_protocols                                     | T⊂training_protocols                                          | Tr k, Teil k                                                      | E                                                                          | –                                                         |
| training_protocols               | T         | training_relationship_id (r)                                             | T§                                                            | Tr e, Teil e                                                      | J                                                                          | –                                                         |
| training_relationships           | T         | Wurzel                                                                   | T§                                                            | Tr e, Teil: bleibt (Beleg), R trainingsverhaeltnis                | J                                                                          | – (kein Zusammenführen von Verhältnissen)                 |
| training_takeovers               | T         | training_relationship_id (c)                                             | T§                                                            | Tr k, **Teil: LÜCKE**                                             | E                                                                          | –                                                         |
| treatment_base_items             | P         | treatment_basis_id (c) → treatment_bases                                 | P§                                                            | Akte k                                                            | E (toter Eintrag); M! Kaskade aus delete_treatment_basis                   | E                                                         |
| treatment_bases                  | P         | patient_id (r)                                                           | P§                                                            | Akte e                                                            | J, M! delete_treatment_basis (BEF-198)                                     | U                                                         |
| treatment_basis_versions         | P         | treatment_basis_id (c) → treatment_bases                                 | P§                                                            | Akte k                                                            | E; M! Kaskade aus delete_treatment_basis                                   | E                                                         |
| treatment_draft_findings         | P         | appointment_id (c) → appointments                                        | P§                                                            | Akte k                                                            | E                                                                          | E                                                         |
| treatment_note_versions          | P         | note_id (c) → treatment_notes                                            | P§                                                            | Akte k                                                            | E (toter Eintrag in der Reapply-Liste)                                     | E                                                         |
| treatment_notes                  | P         | appointment_id (r) → appointments                                        | P§                                                            | Akte e                                                            | J                                                                          | E                                                         |
| waitlist_entries                 | P         | patient_id (c)                                                           | P§                                                            | Akte k, R warteliste                                              | J                                                                          | U (Sperre)                                                |
| deletion_journal                 | pseudonym | target_id (ohne FK)                                                      | **keine Entscheidung** (ANN-031 trüge sie)                    | R loeschjournal 60 Tage                                           | –                                                                          | –                                                         |
| storage_deletion_orders          | pseudonym | object_key enthält patient_id/treatment_basis_id                         | **keine Entscheidung**                                        | R loeschauftrag                                                   | – (bewusst, apply_retention prosrc Z. 233–236)                             | –                                                         |

#### 3b.5 Abdeckung je Funktion

| Pflicht                       | betroffen                                                                                     | erfasst                                                                                                                                                    | bewusst ausgenommen (Beleg)                                                                                                          | Lücke bzw. ohne Entscheidung                                                                                                                                                                                             |
| ----------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Auskunft                      | 79 (+2)                                                                                       | 71 in den Praxiskopien (Akte 58 = 42 Abschnittstabellen + 16 verschachtelt; Training 48 = 30 + 18)                                                         | 5: `patient_file_access_grants` und 4 Benachrichtigungstabellen (ANN-344, im Plattformexport über `app.platform_notifications_json`) | 3 + 2 pseudonyme (L-A1 bis L-A3)                                                                                                                                                                                         |
| Löschen, vollständig          | 79                                                                                            | 77 automatisch: mit der Akte 58 (13 e + 45 k), mit dem Verhältnis 49 (11 e + 38 k), dazu eigene Regeln. 2 Tabellen fallen mit dem Konto beim Anmeldedienst | –                                                                                                                                    | 0                                                                                                                                                                                                                        |
| Teillöschung unter Belegfrist | 45 Tabellen am Verhältnis                                                                     | 18 (`reduce` 6 e + Kaskade)                                                                                                                                | 9 bleiben als Beleg (ANN-183, `scope_note` von `training_contracts` und `training_packages`); offene Terminwünsche bleiben           | **17** (L-L1)                                                                                                                                                                                                            |
| Löschjournal                  | 79                                                                                            | 28 namentlich (J), 46 über einen Elterndatensatz (E)                                                                                                       | 4 regelbasiert ohne Journal (Rg)                                                                                                     | 16 Tabellen mit manuellem Löschweg ohne Journal (L-J1); 4 tote Einträge in der Reapply-Liste (L-J2); Merge ohne Ersatznachweis (L-J3); 1 ohne Schreiber und Journalentscheidung (`platform_mailbox_confirmations`, L-A2) |
| Merge                         | 64 (P-Weg ohne die 2 Trainingsprotokoll-Artefakte, mit `persons`, `legal_holds`, `audit_log`) | 24 umgehängt (6 davon mit `relationship_id`), 3 zusammengelegt, 34 mit dem Elterndatensatz, `persons` bedingt                                              | 1 sperrt (`platform_accesses`, BEF-132); `audit_log` wird über `patient_merge_records` aufgelöst (ABN-018)                           | heute 0, aber kein Vollständigkeitstest (L-M1); Folgelücke in der Auskunft (L-A4)                                                                                                                                        |

**Antwort auf Frage 2, Teil 1:**

- Von der Aufbewahrungszuordnung sind alle **151** Tabellen erfasst (`retention_assignments`, 183 Zeilen).
- Personenbezug haben **126**: 79 + 2 + 45.
- Gegenstand von Auskunft, Löschen und Journal im Patienten- und Trainingsbereich sind **81** (79 + 2).
- **Alle vier Pflichten** einschließlich Merge treffen **64** Tabellen.

#### 3b.6 Lückenliste

Gezählt sind nur Tabellen mit Personenbezug, bei denen eine der vier Funktionen fehlt und keine begründete Ausnahme vorliegt. Alles ist aus Code und Katalog belegt; ausgeführt wurde nichts (read-only).

| Nr.      | Lücke                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Tabellen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Beleg                                                                                                                                                                                                                                                                                                                                                                                                                                   | Schwere                                                               |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **L-L1** | **Die Teillöschung unter Belegfrist lässt Gesundheits- und Trainingsdaten stehen.** `app.reduce_training_relationship` löscht nur 6 Tabellen; die cascade-Kinder von `training_relationships` bleiben, weil die Verhältniszeile bleibt. Sie stehen bis zum Ende der Belegfrist, also 8 Jahre ab Ende des Kalenderjahres der Rechnung statt 3 Jahre ab Vertragsende. Schätzung: bis zu rund 5 Jahre länger (8 − 3, plus Rundung auf das Jahresende)                                                       | 17: `training_assessments`, `training_assessment_results`, `training_profiles`, `training_course_events`, `training_consent_records`, `training_takeovers`, `checkins`, `checkin_values`, `checkin_schedules`, `habits`, `habit_marks`, `exercise_plans` (+ `items`, `days`, `sessions`, `session_sets`, `session_values`)                                                                                                                                                                                                                                                                                                                                                             | `reduce_training_relationship` prosrc Z. 1–96 (basis Z. 12754). Kommentar `apply_retention` basis Z. 17143: „gehalten werden nur die Belege und was sie tragen; der Rest faellt nach den drei Jahren“. ADR-021 Punkt 4: „3 Jahre ab Vertragsende, Screening früher“. ANN-183 nennt als bleibend nur Belege, abgerechnete Termine, Verhältniszeile und Namen. Der Test `training-invoices.test.ts:749–802` prüft nur Kontakt und Termine | hoch (Art. 9; Widerspruch zu einem geltenden ADR)                     |
| **L-J1** | **Manuelle Löschwege schreiben kein Journal.** Nach einem Restore kommen gelöschte Zeilen zurück (ADR-008 Punkt 8). BEF-198 ist offen und nennt nur `delete_treatment_basis` „und etwa“ die übrigen Wege                                                                                                                                                                                                                                                                                                 | 12 RPCs: `delete_treatment_basis` (Kaskade auf `patient_files`, `therapy_reports`, `treatment_base_items`, `treatment_basis_versions`), `delete_billable_services`, `reopen_appointment` (über `app.withdraw_appointment_services`), `delete_aftercare_month`, `delete_aftercare_subscription`, `delete_training_package`, `delete_patient_fee_agreement`, `delete_invoice_recipient` (nur Tests, BEF-229), `delete_task`, `delete_platform_diary_entry`, `delete_platform_food` (Kaskade auf Favoriten), `end_checkin_schedule`. Betroffen sind **16 Tabellen**: 12 direkt, 4 über die Kaskade von `treatment_bases` (17 mit `nutrition_diary_favorites` über `delete_platform_food`) | Skript `manual.mjs`. Von 51 RPCs, die solche Zeilen löschen, journalisieren 10 (2 über `app.journal_patient_file_deletion`, 7 über `remove_message_attachments`/`delete_due_patient_photos`, 1 über `undo_appointment_creation`); 7 löschen Token, 13 schalten Zustände um, 8 verwerfen Entwürfe oder Uploads, 1 ist der Merge                                                                                                          | mittel                                                                |
| L-J2     | Die Reapply-Liste trägt 4 Tabellen, die kein Schreiber journalisiert. Ein harmloser Drift, aber er zeigt, dass Liste und Schreiber getrennt gepflegt werden. Kein Test prüft „journalisiert ⇒ in der Liste“; nur zur Laufzeit wirft die Funktion (prosrc Z. 108–116)                                                                                                                                                                                                                                     | `treatment_note_versions`, `treatment_base_items`, `patient_contact_details`, `patient_care_details`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | basis Z. 40510 ff.                                                                                                                                                                                                                                                                                                                                                                                                                      | gering                                                                |
| L-J3     | **Der Merge hat keinen Ersatznachweis mehr.** Nach ANN-150 schreibt er bewusst kein Journal; das Wiederherstellungsverfahren soll „anhand der Auditeinträge erneut zusammenführen“. Die Aktion `patient.merged` gibt es seit LOG-EPIC-001 nicht mehr (`supabase/audit-aktionen.txt`, 27 Aktionen). `patient_merge_records` wird mit einer älteren Sicherung mit zurückgesetzt. Folge: Wer eine Sicherung von vor dem Zusammenführen zurückspielt, bekommt die Dublette ohne überlebenden Nachweis zurück | `patients`, `persons`, `patient_contact_details`, `patient_care_details`, `checkin_schedules` (Löschungen in `merge_patients` prosrc Z. 188, 261–273)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | ANN-150 (ASSUMPTIONS Z. 1969), `merge_patients` prosrc Z. 221 (Flag aus vor dem Löschen)                                                                                                                                                                                                                                                                                                                                                | mittel                                                                |
| L-A1     | Ein Token ohne Ausschlussentscheidung. Der Test wählt die Tabelle nicht aus: Sie hat weder `patient_id` noch `access_id`, und ihre Klasse ist `rueckfrageanhang`                                                                                                                                                                                                                                                                                                                                         | `message_attachment_access_grants`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `betroffenenrechte.test.ts:194–203`, `BEWUSST_AUSSEN` in Z. 39–135 ohne Eintrag                                                                                                                                                                                                                                                                                                                                                         | gering                                                                |
| L-A2     | E-Mail-Adresse des Plattformkontos in keiner Kopie. **Die Tabelle hat keinen Schreiber:** kein `insert` in der Basis, in `src`, in Edge Functions oder Skripten (`git grep`); nur `platform-mailbox.test.ts` schreibt. Der Leser `app.platform_mailbox_confirmed` ist verwaist (BEF-229)                                                                                                                                                                                                                 | `platform_mailbox_confirmations`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | basis Z. 54245, 5020, 11635                                                                                                                                                                                                                                                                                                                                                                                                             | gering; die Tabelle zu entfernen wäre besser, als sie zu registrieren |
| L-A3     | Pseudonyme Lösch- und Betriebsnachweise ohne begründete Ausnahme; der Test wählt sie nicht aus                                                                                                                                                                                                                                                                                                                                                                                                           | `platform_account_deletions` (Konto-Kennung), `storage_deletion_orders` (`object_key` mit `patient_id` bzw. `treatment_basis_id`), `deletion_journal`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `app.set_patient_file_object_key`; ANN-031 („Schlüssel ohne Schloss“) trüge die Ausnahme                                                                                                                                                                                                                                                                                                                                                | gering                                                                |
| L-A4     | **Der Merge nimmt entzogenen Zugängen der Dublette den Bezug.** `platform_accesses.patient_id` wird beim Löschen der Quelle `set null`. Die Zeile bleibt bis 3 Jahre nach ihrem Ende stehen (`delete_due_platform_accesses`) samt Vertretungsname, Grundlage und Einladungen mit E-Mail, erscheint aber in keiner Kopie mehr: Der Export filtert `z.patient_id = p_patient_id`, prosrc Z. 543–544                                                                                                        | `platform_accesses`, `platform_access_invitations`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Sperre nur für nicht entzogene Zugänge (`patient_merge_plan`, BEF-132); `merge_patients` prosrc Z. 175–180                                                                                                                                                                                                                                                                                                                              | gering bis mittel                                                     |
| L-M1     | **Für den Merge gibt es keinen Vollständigkeitstest.** 26 FK-Spalten zeigen auf `patients` (20 `cascade`, 5 `restrict`, 1 `set null`). Eine neue cascade-Tabelle, die `merge_patients` nicht kennt, fiele beim Zusammenführen still mit der Dublette (§13). `patient-merge.test.ts:432–446` (`TABELLEN`, 13 Einträge, 12 Tabellen) ist hart codiert; ein Katalogtest wie `appointment-undo.test.ts:416–440` fehlt                                                                                        | heute 0 Tabellen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Skript `fk.txt`                                                                                                                                                                                                                                                                                                                                                                                                                         | mittel (strukturell)                                                  |
| Hinweis  | Eine Tabelle hat mehrere cascade-Eltern mit verschiedenen Fristen: `platform_appointment_requests` hängt an `patients`, `training_relationships` und `created_by_access_id` → `platform_accesses`. Ein offener Wunsch fällt mit dem Zugang 3 Jahre nach dessen Ende, auch wenn die Akte lebt                                                                                                                                                                                                             | 1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `fk.txt`                                                                                                                                                                                                                                                                                                                                                                                                                                | Designpunkt für die Registry (`governs_deletion`)                     |

#### 3b.7 Änderungsaufwand für eine neue Tabelle mit Patientenbezug heute

| Nr.   | Stelle                                                                                         | wann                                | testerzwungen                                                                                                                                   |
| ----- | ---------------------------------------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Migration: Zeile in `retention_assignments` (+ COMMENT)                                        | immer                               | ja (`retention.test.ts:23`)                                                                                                                     |
| 2     | `export_patient_record`: Abschnitt                                                             | immer                               | nur bei Spalte `patient_id`/`access_id`/`platform_access_id` oder Klasse `patientenakte`/`personenstammdaten` (`betroffenenrechte.test.ts:187`) |
| 3     | `kategorien.ts` `AUSKUNFT_KATEGORIEN`                                                          | immer                               | ja (`betroffenenrechte.test.ts:609`)                                                                                                            |
| 4     | `merge_patients`: `update`                                                                     | immer                               | **nein**                                                                                                                                        |
| 5     | `patient_merge_plan`: Zähler, ggf. Sperre                                                      | immer                               | **nein**                                                                                                                                        |
| 6     | `patient-merge.test.ts` `TABELLEN`                                                             | immer                               | **nein**                                                                                                                                        |
| 7–8   | `export_training_record` + `TRAINING_KATEGORIEN`                                               | auch im Training                    | ja (`auskunft-training.test.ts:138, 275`)                                                                                                       |
| 9     | `reduce_training_relationship`                                                                 | auch im Training                    | **nein** (daraus entstand L-L1)                                                                                                                 |
| 10    | `merge_patients`: `relationship_id` mitführen                                                  | polymorph                           | **nein**                                                                                                                                        |
| 11    | Kennungsspalten-Liste `auskunft-training.test.ts:255–273`                                      | für 10 genannte Tabellen            | ja                                                                                                                                              |
| 12    | `delete_patient_record` (+ `delete_training_relationship`)                                     | FK `restrict`                       | indirekt (der Lauf scheitert)                                                                                                                   |
| 13–14 | Reapply-Liste, `app.deletion_key_column`                                                       | journalisiert bzw. Schlüssel ≠ `id` | nur zur Laufzeit                                                                                                                                |
| 15    | `retention_classes` + `src/features/retention/klassen.ts`                                      | eigene Frist                        | ja (`retention.test.ts:86`)                                                                                                                     |
| 16    | `apply_retention`: Regel + 4 Stellen für den Zähler (Variable, `v_gesamt`, Bedingung, Kontext) | eigene Frist                        | Zähler nein                                                                                                                                     |
| 17    | Liste „automatisch“ in `retention-run.test.ts:793`                                             | eigene Frist                        | ja (Änderungsdetektor)                                                                                                                          |
| 18–19 | `BEWUSST_AUSSEN` in beiden Auskunftstests                                                      | verschachtelt oder ausgenommen      | ja                                                                                                                                              |
| 20–21 | `undo_appointment_creation` + FK-Liste `appointment-undo.test.ts:416`                          | FK auf `appointments`               | ja                                                                                                                                              |
| 22    | Journal-Insert im Lösch-RPC                                                                    | manuell löschbar                    | **nein** (BEF-198)                                                                                                                              |
| 23    | `platform_export`/`platform_*`                                                                 | auf der Plattform sichtbar          | nein                                                                                                                                            |

**Antwort auf Frage 2, Teil 2:**

| Fall                                                             | Stellen                                                                                    | davon testerzwungen      |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------ |
| minimal: Kind von `patients` (cascade), nur Behandlung           | **6**                                                                                      | 3                        |
| typisch: Tabelle mit `patient_id` und `training_relationship_id` | **11**                                                                                     | 5                        |
| höchstens (alle Bedingungen)                                     | **23** Stellen in 21 Artefakten (13 DB-Funktionen, Migration, 2 TS-Dateien, 5 Testdateien) | 11 (+2 nur zur Laufzeit) |

#### 3b.8 Design der zentralen Registry (Schritt 4)

**Entscheidung zum Schnitt:** `retention_assignments` bleibt n:1 (183 Zeilen, PK `(table_name, class_key)`, 26 Tabellen mit 2 bis 4 Klassen). Darüber kommt eine 1:1-Kopftabelle, auf die `retention_assignments` per FK zeigt. Die Alternative wären Spalten direkt an `retention_assignments` mit `unique (table_name) where primary_row`. Sie wiederholt aber Tabellenattribute je Klassenzeile und lässt sich schlechter prüfen.

```sql
-- Vorschlag, nicht ausgeführt. Eine Zeile je Tabelle in public (151).
create table public.data_registry (
  table_name        text primary key check (table_name ~ '^[a-z_]+$'),
  subject_kind      text not null check (subject_kind in ('patient', 'training', 'patient_training',
                      'platform_account', 'staff', 'third_party', 'pseudonymous', 'none')),
  export_mode       text not null check (export_mode in
                      ('section', 'nested', 'platform_only', 'excluded', 'not_personal')),
  export_section    text check (export_section ~ '^[a-z_]+$'),
  export_parent     text references public.data_registry (table_name),
  export_key        text,                         -- Schlüssel im Elternobjekt, z. B. 'items'
  export_fn         regprocedure,                 -- Sonderprojektion; null = generisch
  export_exclude    text[] not null default '{}', -- Geheimnisse, Objektschlüssel
  export_order      text[] not null default '{created_at}',
  merge_mode        text not null check (merge_mode in
                      ('repoint', 'combine', 'target_wins', 'via_parent', 'blocks', 'not_applicable')),
  merge_also        text[] not null default '{}', -- {relationship_id}
  merge_fn          regprocedure,                 -- combine, target_wins
  merge_check_fn    regprocedure,                 -- liefert Sperrcode oder null
  journal_mode      text not null check (journal_mode in ('row', 'via_parent', 'rule', 'none')),
  journal_key       text not null default 'id',   -- ersetzt app.deletion_key_column
  journal_class_fn  regprocedure,                 -- Klasse je Zeile (audit_log)
  retention_mode    text not null check (retention_mode in ('own_rule', 'with_parent', 'none')),
  retention_fn      regprocedure,                 -- Regel des Laufs (app.delete_due_*)
  retention_summary_key text,                     -- null = nicht in retention.applied (rueckmeldung)
  partial_mode      text not null default 'not_applicable'
                      check (partial_mode in ('falls', 'kept_as_receipt', 'not_applicable')),
  reapply_fn        regprocedure,                 -- Sonderzweig beim Nachziehen
  decision_note     text check (length(btrim(decision_note)) between 1 and 500),
  assumption_key    text check (assumption_key ~ '^ANN-[0-9]{3}$'),
  constraint data_registry_section check ((export_mode = 'section') = (export_section is not null)),
  constraint data_registry_nested  check ((export_mode = 'nested') = (export_parent is not null)),
  constraint data_registry_reasoned check (
    not (export_mode in ('excluded', 'platform_only') or journal_mode in ('rule', 'none')
         or merge_mode = 'blocks' or partial_mode = 'kept_as_receipt')
    or (decision_note is not null and assumption_key is not null)),
  constraint data_registry_merge_fn check ((merge_mode in ('combine', 'target_wins')) = (merge_fn is not null)),
  constraint data_registry_rule     check ((retention_mode = 'own_rule') = (retention_fn is not null))
);

-- Weg zur Wurzel, ein Hop je Zeile; PT-Tabellen haben zwei Zeilen.
-- Schätzung ≈ 112 Zeilen: 79 Tabellen + 33 PT-Tabellen.
create table public.data_registry_links (
  table_name       text not null references public.data_registry (table_name) on delete cascade,
  root             text not null check (root in ('patients', 'training_relationships',
                     'platform_accesses', 'staff_members', 'persons')),
  parent_table     text not null references public.data_registry (table_name),
  fk_columns       text[] not null check (cardinality(fk_columns) >= 1),
  parent_columns   text[] not null default '{id}',
  filter_column    text,                          -- polymorph ohne FK: legal_holds.subject_type
  filter_value     text,
  governs_deletion boolean not null default true, -- bei mehreren cascade-Eltern
  primary key (table_name, root),
  check ((filter_column is null) = (filter_value is null))
);

alter table public.retention_assignments
  add constraint retention_assignments_registry_fkey
  foreign key (table_name) references public.data_registry (table_name);
-- RLS an, revoke all from anon, authenticated; Lesen für Praxisrollen wie bei
-- retention_assignments (app.is_staff()); schreiben nur per Migration.
```

**Startbefüllung** aus dem heutigen Stand (Matrix 3b.4):

| Spalte         | Befüllung                                                                                                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `subject_kind` | aus dem FK-Weg                                                                                                                                                                |
| `export_mode`  | 42 + 30 Abschnitte, 18 verschachtelt (Vereinigung), 4 `platform_only`, 1 `excluded`                                                                                           |
| `merge_mode`   | 24 `repoint` (inkl. Zg), 3 `combine`, 34 `via_parent`, 1 `blocks`                                                                                                             |
| `journal_mode` | 28 `row`, 46 `via_parent`, 4 `rule`                                                                                                                                           |
| `partial_mode` | 18 `falls`, 9 `kept_as_receipt`; **17 Tabellen ohne zulässigen Wert**: Der Test bleibt rot, bis L-L1 entschieden ist. Das macht die Lücke sichtbar, statt sie festzuschreiben |

**Generische Funktionen** (Bezeichner nur über `format('%I')`, Werte als `$1`/`%L`, Registry nur per Migration schreibbar):

```sql
-- Pfadprädikat: x.<fk> in (select <pk> from <parent> where <Pfad zur Wurzel>)
create function app.registry_filter(p_table text, p_root text, p_depth int default 0)
returns text language plpgsql stable set search_path = '' as $$
declare l public.data_registry_links; a text := 'x' || p_depth; b text := 'x' || (p_depth + 1);
begin
  select * into l from public.data_registry_links where table_name = p_table and root = p_root;
  if not found then return null; end if;
  return case when l.parent_table = p_root
    then format('%I.%I = $1', a, l.fk_columns[1])
    else format('(%s) in (select %s from public.%I %I where %s)',
           (select string_agg(format('%I.%I', a, c), ',') from unnest(l.fk_columns) c),
           (select string_agg(format('%I.%I', b, c), ',') from unnest(l.parent_columns) c),
           l.parent_table, b, app.registry_filter(l.parent_table, p_root, p_depth + 1))
    end || coalesce(format(' and %I.%I = %L', a, l.filter_column, l.filter_value), '');
end $$;

-- Merge: alle direkten repoint-Tabellen in einer Schleife (heute 31 update-Anweisungen).
for r in select g.table_name, l.fk_columns[1] as col, g.merge_also, l.filter_column, l.filter_value
           from public.data_registry g
           join public.data_registry_links l on l.table_name = g.table_name
          where l.root = 'patients' and l.parent_table = 'patients' and g.merge_mode = 'repoint' loop
  execute format('update public.%I set %I = $2%s where %I = $1%s', r.table_name, r.col,
    (select coalesce(string_agg(format(', %I = $2', c), ''), '') from unnest(r.merge_also) c), r.col,
    coalesce(format(' and %I = %L', r.filter_column, r.filter_value), ''))
  using p_source, p_target;
end loop;
-- danach combine/target_wins über merge_fn; Sperren über merge_check_fn

-- Journal: eine Triggerfunktion statt 77 Insert-Anweisungen in 30 Funktionen.
create function app.journal_deletion() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('app.patient_merge', true) = 'on'      -- ANN-150
     or current_setting('app.reapplying', true) = 'on' then  -- kein Doppeleintrag beim Nachziehen
    return old;
  end if;
  insert into public.deletion_journal (organization_id, run_id, target_table, target_id, retention_class, due_at)
  values (old.organization_id,
          coalesce(nullif(current_setting('app.deletion_run', true), '')::uuid, extensions.gen_random_uuid()),
          tg_table_name, (to_jsonb(old) ->> tg_argv[0])::uuid,
          coalesce(nullif(current_setting('app.deletion_class', true), ''), tg_argv[1]),
          coalesce(nullif(current_setting('app.deletion_due', true), '')::timestamptz, now()));  -- ANN-703
  return old;
end $$;
-- je journal_mode = 'row': after delete … for each row execute function app.journal_deletion('<journal_key>', '<Klasse>')

-- Lösch- und Nachziehreihenfolge berechnet statt der Liste mit 51 Einträgen:
-- Kind vor Elter über restrict, no action und set null (heute z. B. waitlist vor treatment_bases).
create function app.registry_delete_order() returns table (table_name text, rank int)
language sql stable set search_path = '' as $$
  with recursive dep as (
    select ch.relname::text as child, pa.relname::text as parent
      from pg_catalog.pg_constraint c
      join pg_catalog.pg_class ch on ch.oid = c.conrelid
      join pg_catalog.pg_class pa on pa.oid = c.confrelid
     where c.contype = 'f' and c.confdeltype in ('r', 'a', 'n') and c.conrelid <> c.confrelid
       and ch.relnamespace = 'public'::regnamespace and pa.relnamespace = 'public'::regnamespace),
  lvl(t, n) as (
    select r.table_name, 0 from public.data_registry r where r.journal_mode = 'row'
    union all
    select d.parent, l.n + 1 from lvl l join dep d on d.child = l.t where l.n < 20)
  select t, max(n) from lvl group by t
$$;

-- Löschen (Akte, Verhältnis, Teillöschung): eine Schleife statt 13 + 11 + 6 CTE-Blöcken.
for r in select g.table_name from public.data_registry g
           join public.data_registry_links l on l.table_name = g.table_name and l.root = p_root
           join app.registry_delete_order() o on o.table_name = g.table_name
          where l.governs_deletion and (not p_partial or g.partial_mode = 'falls')
          order by o.rank loop
  execute format('delete from public.%I x0 where %s', r.table_name, app.registry_filter(r.table_name, p_root))
  using p_id;
end loop;

-- Auskunft: Abschnitt generisch oder über export_fn (heute 58 bzw. 30 Unterabfragen von Hand).
for r in select g.* from public.data_registry g
           join public.data_registry_links l on l.table_name = g.table_name and l.root = p_root
          where g.export_mode = 'section' loop
  if r.export_fn is not null then
    execute format('select %s($1)', r.export_fn::regproc) into v_teil using p_id;
  else
    execute format('select coalesce(jsonb_agg(app.registry_row_json(%L, to_jsonb(x0))), ''[]''::jsonb)
                      from public.%I x0 where %s', r.table_name, r.table_name,
                   app.registry_filter(r.table_name, p_root))
      into v_teil using p_id;
  end if;
  v_daten := v_daten || jsonb_build_object(r.export_section, v_teil);
end loop;
-- app.registry_row_json: export_exclude und app.auskunft_ohne_kennungen anwenden, Namen auflösen
-- (Resolver je Zieltabelle: staff_members, user_profiles, prescribers, service_catalog_items),
-- Kinder mit export_parent = Tabelle unter export_key verschachteln.
```

**Was generisch geht und was Sonderregel bleibt** (Schätzung aus den gelesenen Rümpfen):

| Funktion                                                 | heute                                                                                    | generisch                                                                                   | Sonderregel                                                                                                                                                                                                          |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auskunft Akte                                            | 43 Abschnitte, 58 `from` + 20 `join`, Spalten handverlesen                               | 35                                                                                          | 8: `patient_photos`, `access_log`, `platform_accesses` (E-Mail nur am eigenen Zugang), `platform_appointment_requests` (`requested_by` aus dem Zugang), `exercise_plans`, `checkins`, `habits`, `nutrition_profiles` |
| Auskunft Training                                        | 30 Abschnitte, 10 davon schon generisch über `auskunft_ohne_kennungen` (prosrc Z. 25–96) | 23                                                                                          | 7 (wie oben, ohne Fotos)                                                                                                                                                                                             |
| `delete_patient_record` / `delete_training_relationship` | 13 / 11 CTE-Blöcke                                                                       | alle bis auf `persons`                                                                      | 1 gemeinsamer Helfer `persons` (4 `not exists`)                                                                                                                                                                      |
| `reduce_training_relationship`                           | 6 Blöcke                                                                                 | über `partial_mode`                                                                         | 2: Termine ohne Leistung, `training_bases` ohne Termin                                                                                                                                                               |
| `apply_retention`                                        | 24 Regeln (10 inline), 25 Schlüssel in der Zusammenfassung von Hand                      | Verteilung der Regeln und Zusammenfassung über `retention_fn`/`retention_summary_key`       | 24 Regelfunktionen bleiben fachlich; die 10 inline-Regeln wandern in eigene Funktionen                                                                                                                               |
| Journal                                                  | 77 Inserts in 30 Funktionen                                                              | 1 Trigger                                                                                   | 5: `auth_users` (Admin-API), `team_message_contents` (leeren statt löschen), `staff_feedback` (anonym neu geschrieben), `staff_profile_pictures`, Klasse je Zeile bei `audit_log`                                    |
| Nachziehen                                               | Liste mit 51 Einträgen + `deletion_key_column`                                           | Reihenfolge berechnet, Schlüssel aus der Registry                                           | 5 Sonderzweige (2 in der Schleife, 3 Nachläufe)                                                                                                                                                                      |
| Merge                                                    | 31 `update` + 5 `delete`                                                                 | 23 (16 einfach, 5 mit `relationship_id`, `legal_holds` mit Filter, `patient_merge_records`) | 8: Kontakt, Versorgung, Standardempfänger, `checkin_schedules`, `patients`, `persons`, Fotoregel, Advisory-Lock                                                                                                      |
| Merge-Plan                                               | 24 Zähler, 10 Sperrcodes                                                                 | Zähler je umgehängter Tabelle; 6 Sperren über `merge_check_fn`, 1 über `blocks`             | 2 Zähler (`invoices_issued`, `treatment_notes`), 3 Sperren (`source_has_account`, `note_too_long`, `take_along_too_many`)                                                                                            |

**Folgen für die Regeln:**

- **ADR-008:** eine neue Fassung (heute gilt Fassung 6) mit neuem Punkt 13: „Jede Tabelle trägt in der Registry Personenbezug und die Entscheidungen zu Auskunft, Löschen, Journal und Zusammenführen; Ausnahmen mit Begründung und ANN; ein Test erzwingt das.“ Das konkretisiert die Konsequenz „Zuordnung ist Teil des Datenmodells“. Der Zeilentrigger löst Punkt 8 auch für manuelle Wege ein (schließt BEF-198, macht ANN-703 zur Regel). Die Konsistenzregel zu `partial_mode` schließt L-L1. ANN-150 ist neu zu fassen (L-J3): etwa ein Journaleintrag eigener Art „zusammengeführt“ mit Quelle und Ziel, 60 Tage wie das Journal.
- **ADR-010:** Keine neue Aktion, `supabase/audit-aktionen.txt` bleibt unverändert, das Label `freigabe-audit` ist nicht nötig. Die Schlüssel von `retention.applied` bleiben, wenn `retention_summary_key` sie trägt; `rueckmeldung` bleibt wie heute draußen (apply_retention prosrc Z. 443–446, §20.2). Das Journal führt keinen Akteur (ANN-703), daher kein neues Verzeichnis über Beschäftigte. Das sollte das Zweitreview ausdrücklich bestätigen.
- **ADR-013, Pfad A:** Jede Story berührt Migration, SECURITY-DEFINER-Funktionen, Löschpfad und Datenklasse und ist damit kritisch: Checkliste je Punkt, `pnpm test:db`, Zweitreview vor dem Merge (Nr. 8: Löschung, SECURITY DEFINER). Punkt 4 („Löschtest je Tabelle“) erfüllt der Ende-zu-Ende-Test generisch.
- **Schnitt in Stories:**
  1. Registry + Vollständigkeitstest (nur lesend, macht L-L1, L-A1 bis L-A3 und L-M1 sichtbar)
  2. Journal-Trigger (L-J1, L-J2)
  3. Löschen und Teillöschung generisch (L-L1)
  4. Merge generisch (L-M1, L-A4)
  5. Auskunft generisch (die Inhalte der Abschnitte ändern sich; `kategorien.ts` und die Merge-Vorschau ziehen nach)

#### 3b.9 Automatischer Vollständigkeitstest (Skizze `supabase/tests/data-registry.test.ts`)

```ts
import { beforeAll, describe, expect, it } from 'vitest';
import { AUSKUNFT_KATEGORIEN, TRAINING_KATEGORIEN } from '@/features/datenschutz/kategorien';
import { asPostgres, asUser, resetDatabase, SEED } from './helpers/db';
import { BUILDERS, seedSubjectRows } from './helpers/registry-fixtures';

const REACH = `
  with recursive fk as (
    select ch.relname::text as child, pa.relname::text as parent
      from pg_constraint c
      join pg_class ch on ch.oid = c.conrelid and ch.relnamespace = 'public'::regnamespace
      join pg_class pa on pa.oid = c.confrelid and pa.relnamespace = 'public'::regnamespace
     where c.contype = 'f' and pa.relname not in ('organizations', 'locations')),
  reach(tbl, root) as (
    select r, r from unnest(array['patients', 'training_relationships', 'persons']) r
    union select fk.child, reach.root from fk join reach on fk.parent = reach.tbl)
  select distinct tbl, root from reach`;

describe('Datenregistry (ADR-008, neue Fassung)', () => {
  beforeAll(() => resetDatabase(), 120_000);

  it('führt jede Tabelle in public genau einmal', async () => {
    const { rows } = await asPostgres<{ t: string }>(`
      select tablename as t from pg_tables p where schemaname = 'public'
         and not exists (select 1 from public.data_registry r where r.table_name = p.tablename)
      union all
      select table_name from public.data_registry r
       where not exists (select 1 from pg_tables p where p.schemaname = 'public' and p.tablename = r.table_name)`);
    expect(rows.map((r) => r.t)).toEqual([]);
  });

  it('entscheidet für jede Tabelle mit Weg zu einer Person alle vier Pflichten', async () => {
    const { rows } = await asPostgres<{ t: string }>(`
      with r as (${REACH})
      select distinct r.tbl as t from r join public.data_registry g on g.table_name = r.tbl
       where g.subject_kind = 'none' or g.export_mode = 'not_personal'
          or (r.root = 'patients' and g.merge_mode = 'not_applicable' and g.decision_note is null)
          or not exists (select 1 from public.data_registry_links l
                          where l.table_name = r.tbl and l.root = r.root)`);
    expect(rows.map((r) => r.t)).toEqual([]);
  });

  it('jeder Registry-Weg ist ein Fremdschlüssel oder ausdrücklich polymorph', async () => {
    const { rows } = await asPostgres<{ t: string }>(`
      select l.table_name || '.' || array_to_string(l.fk_columns, ',') as t
        from public.data_registry_links l
       where l.filter_column is null and l.parent_table <> l.table_name
         and not exists (
           select 1 from pg_constraint c
            where c.contype = 'f' and c.conrelid = ('public.' || l.table_name)::regclass
              and c.confrelid = ('public.' || l.parent_table)::regclass
              and (select array_agg(a.attname::text order by a.attname) from pg_attribute a
                    where a.attrelid = c.conrelid and a.attnum = any (c.conkey))
                  @> l.fk_columns)`);
    expect(rows.map((r) => r.t)).toEqual([]);
  });

  it('die Kopien haben genau die Abschnitte der Registry, jede mit Beschriftung', async () => {
    for (const [root, fn, id, labels] of [
      ['patients', 'export_patient_record', SEED.patients.max, AUSKUNFT_KATEGORIEN],
      [
        'training_relationships',
        'export_training_record',
        SEED.trainingRelationships.tina,
        TRAINING_KATEGORIEN,
      ],
    ] as const) {
      const { rows: soll } = await asPostgres<{ s: string }>(
        `select g.export_section as s from public.data_registry g
           join public.data_registry_links l on l.table_name = g.table_name
          where l.root = $1 and g.export_mode = 'section' order by 1`,
        [root],
      );
      const { rows } = await asUser<{ d: { tabellen: object } }>(
        SEED.users.ownerTherapist,
        `select public.${fn}($1::uuid) as d`,
        [id],
      );
      expect(Object.keys(rows[0]!.d.tabellen).sort()).toEqual(soll.map((r) => r.s));
      expect(Object.keys(labels).sort()).toEqual(soll.map((r) => r.s));
    }
  });

  it('der Merge kennt jede Spalte, die auf patients zeigt, und jede polymorphe Spalte', async () => {
    const { rows } = await asPostgres<{ s: string }>(`
      select ch.relname || '.' || a.attname as s
        from pg_constraint c
        join pg_class ch on ch.oid = c.conrelid
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
       where c.contype = 'f' and c.confrelid = 'public.patients'::regclass
      except
      select l.table_name || '.' || unnest(l.fk_columns)
        from public.data_registry_links l join public.data_registry g using (table_name)
       where l.root = 'patients' and l.parent_table = 'patients'
         and g.merge_mode in ('repoint', 'combine', 'target_wins', 'blocks')`);
    expect(rows).toEqual([]);
    const { rows: poly } = await asPostgres(`
      select c.table_name from information_schema.columns c
        join public.data_registry g on g.table_name = c.table_name
       where c.table_schema = 'public' and c.column_name = 'relationship_id'
         and g.merge_mode = 'repoint' and not ('relationship_id' = any (g.merge_also))`);
    expect(poly).toEqual([]);
  });

  it('Journal, Frist und Teillöschung passen zusammen', async () => {
    const { rows } = await asPostgres<{ fehler: string }>(`
      select 'row ohne Trigger: ' || g.table_name from public.data_registry g
       where g.journal_mode = 'row' and not exists (select 1 from pg_trigger t
             where t.tgrelid = ('public.' || g.table_name)::regclass
               and t.tgfoid = 'app.journal_deletion'::regproc)
      union all
      select 'via_parent ohne journalisierten cascade-Elter: ' || l.table_name
        from public.data_registry g join public.data_registry_links l using (table_name)
        join public.data_registry p on p.table_name = l.parent_table
       where g.journal_mode = 'via_parent' and p.journal_mode not in ('row', 'via_parent')
      union all
      select 'automatisch ohne Regel: ' || a.table_name from public.retention_assignments a
        join public.data_registry g using (table_name)
       where a.deletion_mode = 'automatisch' and g.retention_fn is null
         and g.journal_mode <> 'via_parent'
      union all
      select 'row ohne organization_id: ' || g.table_name from public.data_registry g
       where g.journal_mode = 'row' and not exists (select 1 from information_schema.columns c
             where c.table_schema = 'public' and c.table_name = g.table_name
               and c.column_name = 'organization_id')
      union all  -- fällt in der Teillöschung, Elter bleibt: nur ein eigener Eintrag zieht nach
      select 'Teillöschung ohne Zeilenjournal: ' || g.table_name
        from public.data_registry g join public.data_registry_links l using (table_name)
        join public.data_registry p on p.table_name = l.parent_table
       where l.root = 'training_relationships' and g.partial_mode = 'falls'
         and p.partial_mode = 'kept_as_receipt' and g.journal_mode <> 'row'
      union all
      select 'Training ohne Teillöschungsentscheidung: ' || l.table_name
        from public.data_registry_links l join public.data_registry g using (table_name)
       where l.root = 'training_relationships' and g.partial_mode = 'not_applicable'`);
    expect(rows.map((r) => r.fehler)).toEqual([]);
  });

  describe('Ende zu Ende: eine synthetische Zeile je Registry-Tabelle', () => {
    // Generator aus der Registry: topologisch über data_registry_links. Die Werte liefert
    // BUILDERS[tabelle], weil alle 79 Tabellen CHECK-Constraints (480) und 69 Trigger tragen;
    // ein Test verlangt einen Builder je Tabelle mit subject_kind <> 'none'.
    it('hat für jede personenbezogene Tabelle einen Builder', async () => {
      const { rows } = await asPostgres<{
        t: string;
      }>(`select table_name as t from public.data_registry
        where subject_kind not in ('none', 'staff', 'third_party', 'pseudonymous') order by 1`);
      expect(rows.map((r) => r.t).filter((t) => !BUILDERS[t])).toEqual([]);
    });
    it('Auskunft: jede Marker-Kennung steht in der Kopie, ausgenommene nicht', async () => {
      /* seedSubjectRows('patients', Q) … */
    });
    it('Merge Q→Z: jede Zeile hängt an Z oder ist nach Konfliktregel aufgegangen; nichts fiel per Kaskade', async () => {
      /* … */
    });
    it('Löschlauf nach Fristablauf: jede Zeile ist weg, jede row-Tabelle steht im Journal', async () => {
      /* … */
    });
    it('Restore: zurückgespielte Zeilen (session_replication_role = replica) nimmt reapply_deletion_journal erneut', async () => {
      /* … */
    });
    it('Teillöschung unter Belegfrist: nur kept_as_receipt bleibt', async () => {
      /* … */
    });
  });
});
```

**Was der Test ersetzt:**

| Datei                              | ersetzt                                                                                                                                                                                                                                                              |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `retention.test.ts`                | Z. 23–46 (2 Tests; künftig über Registry ⇔ `pg_tables` und den FK von `retention_assignments`)                                                                                                                                                                       |
| `betroffenenrechte.test.ts`        | `BEWUSST_AUSSEN` (Z. 39–135, 23 Einträge), `ABSCHNITT_FUER` (Z. 141), Vollständigkeit (Z. 187–220), Beschriftung (Z. 609–618)                                                                                                                                        |
| `auskunft-training.test.ts`        | `BEWUSST_AUSSEN` (Z. 55–111, 23 Einträge), Vollständigkeit (Z. 138–157), Kennungsspalten (Z. 244–273), Beschriftung (Z. 275–278)                                                                                                                                     |
| `patient-merge.test.ts`            | `TABELLEN` mit Z. 496–518; der Umhängen-Teil der Merge-Tests in `aftercare-subscriptions:201`, `exercise-plans:649/1343`, `nutrition:729`, `record-messages:205`, `session-fee-tariff:254`, `training-offers:285`, `patient-merge:1238/1288`. Die Sperrfälle bleiben |
| `retention-run.test.ts`            | Liste „automatisch“ (Z. 793–866)                                                                                                                                                                                                                                     |
| `training-offers.test.ts`          | Kaskadenprüfung Z. 312–319                                                                                                                                                                                                                                           |
| „fällt mit Akte, Verhältnis, Plan“ | Kaskadenteil von Schätzung rund 30 Tests (41 `it`-Titel mit „fällt mit“/„mit der Akte“, abzüglich rund 8 zu Beschäftigten, Organisation und Audit)                                                                                                                   |

`appointment-undo.test.ts:416–440` bleibt, solange `undo_appointment_creation` nicht an der Registry hängt.

## 4. Feature-Umfang vs. Kerngeschäft

### 4.1 Messregeln und Korrekturen an FAKTEN.md

**Messregeln.** Gezählt werden physische Zeilen nach der Regel aus `scripts/aufraeumen.mjs`.

- **TS:** `.ts/.tsx/.css` in `src/` und `supabase/functions/`, ohne Tests.
- **Unit:** die `*.test.*`-Dateien daneben.
- **DB-Fn:** `prosrc`-Zeilen aus `pg_proc` (psql, `analysedb`).
- **DB-Tests:** `supabase/tests/`, nach Dateiname zugeordnet.
- **E2E:** `tests/` mit Spec und Fixture, nach Dateiname zugeordnet.
- **Code** = TS + Unit + DB-Fn + DB-Tests + E2E. Das ist dieselbe Summe wie in `dbanteil.json`, ohne DDL und ohne Doku.
- **Doku:** Dateien unter `docs/` mit Themenbezug, dazu ANN-Einträge. Ein ANN-Eintrag geht an das Feature mit den meisten Stimmen aus Zitaten im Code, Ankern, Tabellen und Titeln.
- **Zuordnung:** Auf oberster Ebene ist sie exklusiv.
  - Funktionen werden in dieser Reihenfolge zugeordnet: nach Namensmuster, dann über eine Trigger-Tabelle, dann über einen eindeutigen TS-Aufrufer, dann über den Aufrufgraphen.
  - Teilsysteme sind nicht exklusiv.

Skript und Daten liegen unter `analyse/s4/` (`messung.mjs`, `features.mjs`, `ergebnis.json`).

**Summenprobe.**

| Größe          |                                     Wert | Abgleich                                                                          |
| -------------- | ---------------------------------------: | --------------------------------------------------------------------------------- |
| TS             |                                  204.959 | = FAKTEN                                                                          |
| Unit           |                                  128.098 |                                                                                   |
| DB-Fn          | 45.081 Zeilen in 1.211 Funktionen (psql) | 58 Funktionen mit 1.900 Zeilen ohne eindeutigen Eigentümer gehen an „Querschnitt“ |
| DB-Tests       |                                  103.344 |                                                                                   |
| E2E            |                                   35.327 |                                                                                   |
| Tabellen       |                                      151 |                                                                                   |
| **Code-Basis** |                              **516.809** |                                                                                   |

**Korrekturen an FAKTEN.md und am Auftrag.**

| Punkt                | Annahme bzw. FAKTEN      | Gemessen                                                                                                            |
| -------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Radflotte gesamt     | 20.159 (`dbanteil.json`) | **21.851**                                                                                                          |
| … E2E                | 394                      | **1.458**: `tests/e2e/radflotte.spec.ts` 1.066, `rad3d.spec.ts` 199, Fixtures 193                                   |
| … DB-Fn              | 1.238 Zeilen             | **61 Funktionen / 1.669 Zeilen** (psql, Muster `fleet\|_bike\|bike_\|breakdown\|checkup\|depot\|key_hand\|garage`)  |
| „Radflotte ~10.000?“ | –                        | **12.118 TS (43 Dateien) + 3.493 Unit = 15.611** in `src/features/fleet/`; mit DB und Tests 21.851, mit Doku 25.710 |
| „3D ~2.650?“         | –                        | Stimmt genau für `src/features/fleet/bike3d/`: 8 Dateien, 2.650 Zeilen, davon 91 Testzeilen                         |

- **3D im Detail.** `three` wird nur in 3 Dateien importiert: `model.ts` 1.043, `viewer.ts` 709 und `werkstattbilder.ts` 222, zusammen 1.974.
  - Mit der 3D-Stellenerfassung außerhalb des Ordners hat das Teilsystem 3.554 TS: `Stellenerfassung.tsx` 332, `RadStellen.tsx` 281, `stellen.ts` 247, `Nadel.tsx` 69, `Testbausteine.tsx` 66.
  - Insgesamt: 4.042 Code und 3.672 Doku-Zeilen (`docs/design/lastenrad-3d/kanvas/*.dc.html` 3.386, Handoff 277, README 9), dazu 7 WebP-Bilder.
  - `three` ist eine von 9 Laufzeitabhängigkeiten (`package.json:46`).
- **Ernährung.** Gemessen 13.248 statt 5.981, zusätzlich 989 Skriptzeilen in `scripts/lebensmittel/`.
  - Zur Ernährung gehören auch die Plattform-Oberfläche (`Ernaehrung`, `Lebensmittel`, `Tagebuch*`, 1.645 Zeilen) und `src/features/platform/api.ts:1908–2314`.
  - DB-Tests 4.272 statt 813.
- **Personal-Suite.** `dbanteil.json` nennt nur `staff` (8.916). Die sechs Module zusammen haben 41.394.
  - `working-time` hat 1.595 DB-Testzeilen statt 0: `working-time-requests` 1.017, `working-hours-audit` 423, `working-week` 155.
- **„Übungskatalog mit Illustrationen“ ist überholt.** Übungsbilder gibt es nicht mehr: ANN-539 entschieden (Jannes, 2026-10-15), ANN-381 verworfen. Übrig sind:
  - `app.exercise_illustration_bases` (verwaist, 7 Zeilen) und `app.exercise_illustration_valid` (3 Zeilen, „gültig ist nur null“);
  - je eine Spalte `illustration` mit CHECK in `exercise_variants` und `exercise_plan_items`;
  - 23 Migrationszeilen und 19 Testzeilen.
- **Veraltete Doku.** `docs/development/ARBEITSBEREICHE.md:28` sagt über den Teamchat „keine Anhänge“. Seit TEAM-003 und TEAM-004 (`docs/development/ROADMAP.md:908 f.`) gibt es Anhänge und Sprachnachrichten.

### 4.2 Maßstab: das Kerngeschäft

**Die Praxis zur Eröffnung (Juli 2027):**

- Jannes ist Owner, Therapeut, Trainer und Büro, dazu „vielleicht eine weitere Person“; „nichts setzt ein Team voraus“ (`docs/PRODUCT_VISION.md:37`).
- Es gibt so viele Räder wie Therapeut:innen (`:19`).
- „Anfangs ist das Geschäft praktisch nur Heilbehandlung“ (`:98`).
- „Ein Konto ist keine Akte … Pläne gibt es dann als PDF“ (`:82`).
- Das Ernährungstagebuch steht nur als Zusatzleistung in der Trainingsspalte (`:78`).

**Rang 1 dazu:** §14 gibt Training, Plattform, Abo und Paket sowie den Praxisbetrieb frei (`PROJECT_PRINCIPLES.md:1273–1283`). §16 setzt „zusätzliche Features“ an die letzte Stelle (`:1424`). Bewertet wird deshalb der Nutzen für das Kerngeschäft und die Größe, nicht die Zulässigkeit.

**Abläufe als Maßstab.**

- Die Kernabläufe K1–K15 (`docs/product/kernablaeufe.md:18–32`) verteilen sich so: Tagesansicht und Tour (K1–K4, K15), Dokumentation (K3, K5, K6), Termine (K4, K7–K9), Akte, Dateien und Befund (K10, K11), Pläne und Katalog (K12), Abrechnung (K8, K13, K14).
- Die geführten Abläufe G1–G10 (`:51–60`): Termine (G1, G2), Radflotte (G3, G4), Personal (G5, G7–G10), Plattform (G6).
- **Teamchat, Ernährung, Training und Statistik haben keinen K- oder G-Ablauf.**

### 4.3 Rangliste der 15 größten Features (Code-Zeilen)

| #   | Feature (Module)                                                                                                                                        |     TS |   Unit | DB-Fn (Anz. / Z.) | Tab. | DB-Tests |   E2E |                         **Code** | Anteil |                           Doku-Dateien | ANN (Anz. / Z.) |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -----: | -----: | ----------------: | ---: | -------: | ----: | -------------------------------: | -----: | -------------------------------------: | --------------: |
| 1   | Termine & Kalender (appointments, scheduling, slot-search, waitlist)                                                                                    | 25.738 | 19.626 |        87 / 4.460 |    4 |   13.344 | 4.567 |                       **67.735** | 13,1 % |                                    890 |        66 / 762 |
| 2   | Plattform Patient:innen/Kund:innen (platform, platform-access, messages, Edge `platform-access` + `notifications`; ohne Ernährungs- und Check-in-Teile) | 22.707 | 14.785 |       187 / 6.248 |   13 |   13.448 | 6.227 |                       **63.415** | 12,3 % |                                  5.945 |     112 / 1.264 |
| 3   | Personal-Suite (staff, vacation, working-time, timeaccount, reimbursements, feedback, Edge `electricity-distance`)                                      | 15.556 |  8.697 |       146 / 5.024 |   17 |    9.553 | 2.564 |                       **41.394** |  8,0 % |                                    222 |        35 / 391 |
| 4   | Abrechnung (billing)                                                                                                                                    | 10.781 |  6.225 |       115 / 4.660 |   14 |   12.127 | 2.450 |                       **36.243** |  7,0 % |                                    840 |        30 / 337 |
| 5   | Behandlungsdokumentation (documentation, offline-documentation, therapy-reports)                                                                        | 11.575 |  9.230 |        41 / 1.941 |    5 |    5.319 | 2.589 |                       **30.654** |  5,9 % |                                    336 |        24 / 270 |
| 6   | Patientenakte (patients, treatment-bases, intake)                                                                                                       | 10.360 |  8.566 |        74 / 4.203 |   11 |    5.732 | 1.539 |                       **30.400** |  5,9 % |                                    302 |        42 / 490 |
| 7   | Tagesansicht, Tour, Karte (today, tours, territories, `src/lib/location`, Edge `location-provider`)                                                     | 10.716 | 10.677 |        19 / 1.015 |    2 |    2.753 | 3.652 |                       **28.813** |  5,6 % |                                  2.079 |        33 / 367 |
| 8   | Radflotte (fleet)                                                                                                                                       | 12.118 |  3.493 |        61 / 1.669 |    9 |    3.113 | 1.458 |                       **21.851** |  4,2 % |                                  3.672 |        17 / 187 |
| 9   | Teamchat                                                                                                                                                |  9.234 |  3.775 |        93 / 2.282 |   14 |    5.269 | 1.199 |                       **21.759** |  4,2 % | 84 (+ ≈ 214 in ADR-017 Abschnitte M–O) |        25 / 287 |
| 10  | Personal Training, Praxisseite (training, training-offers)                                                                                              |  5.614 |  1.725 |        66 / 2.994 |   14 |    6.206 |   940 |                       **17.479** |  3,4 % |                                  1.177 |        25 / 279 |
| 11  | Dateien & Fotos (files, Edge `patient-file-verify`)                                                                                                     |  6.036 |  4.248 |        52 / 1.486 |    4 |    4.526 |   707 |                       **17.003** |  3,3 % |                                  2.271 |        14 / 162 |
| 12  | Ernährungsberatung (nutrition + Plattform-Oberfläche + `platform/api.ts:1908–2314`)                                                                     |  5.651 |    727 |        72 / 2.221 |   10 |    4.272 |   377 |       **13.248** (+ 989 Skripte) |  2,6 % |                                    399 |        13 / 151 |
| 13  | Heimübungspläne (exercise-plans)                                                                                                                        |  5.184 |  3.264 |        34 / 1.290 |    8 |    2.347 | 1.154 |                       **13.239** |  2,6 % |                                    519 |        18 / 208 |
| 14  | Befund, Scores, Befundbausteine (assessments)                                                                                                           |  6.094 |  4.618 |          12 / 591 |    2 |    1.167 |   637 | **13.107** (+ 3.295 JSON-Inhalt) |  2,5 % |                                  1.074 |        23 / 255 |
| 15  | Übungskatalog (exercises)                                                                                                                               |  8.627 |  1.166 |          30 / 949 |    3 |    1.489 |   442 |                       **12.673** |  2,5 % |                                      0 |        17 / 193 |

**Außerhalb der Top 15:**

- Offene Punkte: 6.206
- Check-ins & Gewohnheiten (mit Plattformteilen): 5.453
- Statistik: 5.123
- Querschnitt: 69.114 Code und 14 Basistabellen; ohne die 1.900 Funktionszeilen ohne eindeutigen Eigentümer (58 Funktionen), mit ihnen 71.014.
- Nicht zugeordnet ist der übrige DB-Anteil: 18.426 Migrationszeilen für Tabellen-DDL, Grants, Policies und `COMMENT ON` (3a, Zeilenbilanz). „DB-Fn“ in der Rangliste sind nur Funktionsrümpfe. Dazu zählen auth, session, account, audit, retention, datenschutz, organisation, practice-settings, preview, `src/app`, `src/components`, `src/lib`, `src/routes` und Edge `ai-gateway`.

**Blöcke im Vergleich:**

- Kernfeatures (Rang 1, 4–7, 11, 13–15): 249.867, das sind 48,3 %.
- Plattform, Personal, Flotte, Teamchat, Training und Ernährung: 179.146, das sind 34,7 %.
- Der Praxisbetrieb allein (Personal + Flotte + Teamchat) hat 85.004 Zeilen (16,4 %). Das ist mehr als Abrechnung und Dokumentation zusammen (66.897).

### 4.4 Teilsysteme

| Teilsystem (Feature)                                                   |    TS |  Unit |      DB-Fn | Tab. | DB-Tests |   E2E |                  Code |  Anteil am Feature |
| ---------------------------------------------------------------------- | ----: | ----: | ---------: | ---: | -------: | ----: | --------------------: | -----------------: |
| 3D-Radmodell (Flotte)                                                  | 3.554 |    91 |    6 / 119 |   1¹ |        0 |   278 |                 4.042 | 18,5 % (TS 29,3 %) |
| Check-Up (Flotte); `CheckupFenster.tsx` allein 1.453                   | 2.281 |   958 |    4 / 137 |    1 |       –² |    –² |                 3.376 |             15,5 % |
| Panne, Meldungen, Werkstattblatt, Fotos (Flotte)                       | 2.777 | 1.204 |   26 / 578 |    4 |    1.324 |    –² |                 5.883 |             26,9 % |
| Schlüssel (Flotte)                                                     |   442 |   426 |    3 / 101 |    1 |       –² |    –² |                   969 |              4,4 % |
| Zusätze über §10 hinaus (Teamchat)³                                    | 1.922 |   272 |   26 / 545 |    5 |      844 |   302 |               ≥ 3.885 |           ≥ 17,9 % |
| Übungen und Durchführung (Plattform)                                   | 5.158 | 3.713 |   12 / 538 |   0⁴ |    1.481 | 1.519 |                12.409 |             19,6 % |
| … davon Üben ohne Netz                                                 |   820 |   522 |    1 / 214 |    0 |      602 |     0 |                 2.158 |              3,4 % |
| Zugang, Einladung, Einstieg (Plattform)                                | 3.674 | 2.778 | 34 / 1.015 |    4 |    1.389 |   461 |                 9.317 |             14,7 % |
| Nachrichten/Rückfragen, beide Seiten (Plattform)                       | 2.889 | 1.189 | 54 / 1.365 |    4 |    2.440 |   649 |                 8.532 |             13,5 % |
| Termine & Terminwünsche (Plattform)                                    | 1.704 | 1.211 |    8 / 357 |    1 |      695 |   475 |                 4.442 |              7,0 % |
| Einsicht der Praxis, `platform_preview` (Plattform)                    |   603 | 1.005 |    3 / 216 |    0 |    1.314 |   275 |                 3.413 |              5,4 % |
| Vertretung/Begleitung (Plattform)                                      |   641 |   332 |    9 / 409 |    0 |    1.482 |     0 |                 2.864 |              4,5 % |
| Angebot, Vertrag, Paket, Abo (Plattform)                               | 1.496 |   651 |   11 / 656 |    0 |      170 |     0 |                 2.973 |              4,7 % |
| Einwilligungen (Plattform)                                             |   333 |   240 |    8 / 326 |    0 |      661 |     0 |                 1.560 |              2,5 % |
| Mitarbeiterverwaltung `staff` (Personal)                               | 4.496 | 2.986 | 20 / 1.012 |    4 |    2.593 | 1.051 |                12.138 |             29,3 % |
| Erstattungen (Personal)                                                | 3.354 | 1.889 | 41 / 1.074 |    4 |    2.244 |   339 |                 8.900 |             21,5 % |
| … davon Ladestrom aus Touren mit Edge Function                         |   694 |   675 |   10 / 310 |    0 |      462 |     0 |                 2.141 |              5,2 % |
| Arbeitszeit (Personal)                                                 | 2.284 | 1.047 | 31 / 1.334 |    3 |    1.595 |   385 |                 6.645 |             16,1 % |
| Urlaub (Personal)                                                      | 2.400 | 1.400 |   22 / 672 |    2 |      862 |   320 |                 5.654 |             13,7 % |
| Zeitkonto (Personal)                                                   | 1.850 |   943 |   13 / 497 |    1 |    1.479 |   469 |                 5.238 |             12,7 % |
| Feedback/Barometer (Personal)                                          | 1.172 |   432 |   15 / 393 |    3 |      780 |     0 |                 2.777 |              6,7 % |
| Ernährungstagebuch (Ernährung)                                         | 1.691 |    76 |   24 / 753 |    4 |    1.248 |   184 |                 3.952 |             29,8 % |
| Lebensmittelkatalog mit Import BLS/OFF (Ernährung)                     | 1.249 |   296 |   17 / 406 |    3 |      905 |     0 | 2.856 (+ 989 Skripte) |             21,6 % |
| Offline-Dokumentation (Doku)                                           | 1.874 | 1.037 |    3 / 154 |    0 |      531 |   791 |                 4.387 |             14,3 % |
| Therapieberichte (Doku)                                                | 1.713 |   801 |   12 / 639 |    1 |      601 |   299 |                 4.053 |             13,2 % |
| Textverlustschutz (Doku)                                               |   695 | 1.249 |          – |    – |        – |     – |                 1.944 |              6,3 % |
| Diktat (Doku)                                                          |   517 |   127 |     1 / 33 |    0 |      321 |     0 |                   998 |              3,3 % |
| Dokumentationsbausteine: Befund- und Textbausteine, modulübergreifend  | 2.839 | 2.433 |    7 / 216 |    1 |      308 |   220 |  6.016 (+ 1.917 JSON) |                  – |
| Fragebögen/Scores, Messverlauf (Befund)                                | 3.533 | 2.331 |    9 / 444 |    2 |    1.167 |   417 |  7.892 (+ 1.378 JSON) |             60,2 % |
| Kalender-Raster (Termine)                                              | 5.628 | 5.139 |          – |    – |        – | 1.101 |                11.868 |             17,5 % |
| … davon Gesten (Ziehen, Aufziehen, Zwei-Finger-Zoom)                   |   804 |   421 |          – |    – |        – |     – |                 1.225 |              1,8 % |
| Terminserien (Termine)                                                 | 1.785 | 1.332 |    7 / 348 |    0 |    1.023 |   341 |                 4.829 |              7,1 % |
| Ereignisse ohne Patient (Termine)                                      | 1.032 |   802 |    5 / 497 |    0 |    1.026 |   302 |                 3.659 |              5,4 % |
| Wegprüfung im Termin (Termine)                                         | 1.306 |   977 |    2 / 179 |    0 |      286 |     0 |                 2.748 |              4,1 % |
| Leistungskatalog mit Fassungen (Abrechnung)                            | 1.846 | 1.376 |   22 / 917 |    3 |    1.032 |     0 |                 5.171 |             14,3 % |
| Nachsorge-Abo, Praxisseite (Abrechnung)                                |   629 |   164 |   17 / 457 |    1 |    1.197 |   362 |                 2.809 |              7,8 % |
| Mitgelieferter Inhalt `katalog/eintraege/`, 14 Dateien (Übungskatalog) | 4.854 |     – |          – |    – |        – |     – |                 4.854 |             38,3 % |

Fußnoten:

1. `fleet_spots` bleibt fachlich bestehen; nur `point_x/y/z` und `model_version` sind 3D-spezifisch.
2. Gemischt in `fleet.test.ts` (1.182), `fleet-pflege.test.ts` (407) und `radflotte.spec.ts` (1.066), nicht trennbar.
3. Untergrenze. Gezählt sind nur eigene Dateien und `teamchat/api.ts:460–568` sowie `:1134–1195`; Anteile in gemischten Dateien fehlen.
4. Die Durchführungstabellen `exercise_plan_session*` zählen zu den Heimübungsplänen.

### 4.5 Bewertung

| #   | Feature                 | Nutzen                                | Begründung                                                                                                                                                                                 | K/G-Abläufe |  Code je Ablauf | Tab. / Fn | Befund                                                                                                                                                                                                          |
| --- | ----------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------: | --------------: | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Termine & Kalender      | hoch                                  | Behandlungstag (Vision §3); K4, K7–K9, G1, G2                                                                                                                                              |           6 |          11.289 | 4 / 87    | Groß, aber dem Nutzen angemessen. `CalendarPage.tsx` 2.072 und `CalendarPage.test.tsx` 3.179, der größte Unit-Test. Der Zwei-Finger-Zoom geht auf Jannes zurück (`useZweiFingerZoom.ts:6`). **Nicht markiert.** |
| 2   | Plattform               | mittel                                | §14 frei, Vision §4. Aber nur G6 als eigener Ablauf; K10 (Bogen vorab) und K12 (Plan mitgeben) nur optional. Das Konto ist freiwillig (`:82`), anfangs gibt es nur Heilbehandlung (`:98`). |   1 (bis 3) | 63.415 (21.138) | 13 / 187  | **Überproportional:** 12,3 % des Codes für einen G-Ablauf. Markiert sind die Einsicht (3.413) und das Üben ohne Netz (2.158).                                                                                   |
| 3   | Personal-Suite          | gering (Mitarbeiterverwaltung mittel) | 0–1 Beschäftigte zur Eröffnung (`:37`); G5 und G7–G10 sind „selten“ oder „monatlich“                                                                                                       |           5 |           8.279 | 17 / 146  | **Überproportional** bei Barometer und Ladestrom. Das Barometer zeigt anonyme Antworten erst ab 3 Berechtigten und 5 Antworten (`PROJECT_PRINCIPLES.md:1661`; `app.staff_feedback_threshold` liefert 5 und 3).  |
| 4   | Abrechnung              | hoch                                  | Privatabrechnung; K8, K13, K14                                                                                                                                                             |           3 |          12.081 | 14 / 115  | Angemessen.                                                                                                                                                                                                     |
| 5   | Dokumentation           | hoch                                  | Vision §3.3–3.4; K3, K5, K6                                                                                                                                                                |           3 |          10.218 | 5 / 41    | Angemessen. Textverlustschutz folgt §13, Offline-Doku folgt ADR-001.                                                                                                                                            |
| 6   | Patientenakte           | hoch                                  | K10, K11                                                                                                                                                                                   |           2 |          15.200 | 11 / 74   | Angemessen. `export_patient_record` ist mit 853 Zeilen die größte SQL-Funktion und dient der Auskunftspflicht.                                                                                                  |
| 7   | Tagesansicht/Tour       | hoch                                  | K1–K4, K15                                                                                                                                                                                 |           5 |           5.763 | 2 / 19    | Bestes Verhältnis im Repo.                                                                                                                                                                                      |
| 8   | Radflotte               | gering                                | 1–2 Räder zur Eröffnung (`:19`, `:37`); G3 selten, G4 wöchentlich                                                                                                                          |           2 |          10.926 | 9 / 61    | **Überproportional:** 3D 4.042 Code und 3.672 Doku; Check-Up-Fenster 1.453 Zeilen.                                                                                                                              |
| 9   | Teamchat                | gering                                | 1–2 Personen zur Eröffnung. §10 nennt Kanäle, Direktnachrichten, Threads, Erwähnungen, Suche, Anhänge, Benachrichtigungen (`PROJECT_PRINCIPLES.md:1168–1176`).                             |           0 |               – | 14 / 93   | **Überproportional** bei den Zusätzen über §10 hinaus: ≥ 3.885 Code, 5 Tabellen, 26 Funktionen.                                                                                                                 |
| 10  | Training                | mittel                                | Zweiter Leistungsbereich; anfangs buchen ihn einzelne Patient:innen (`:98 f.`)                                                                                                             |           0 |               – | 14 / 66   | Nicht markiert: Die rechtliche Trennung verlangen ADR-021 und ADR-022.                                                                                                                                          |
| 11  | Dateien & Fotos         | hoch                                  | Verordnungsfoto in K10; Fotos in Vision §3.5                                                                                                                                               |           1 |          17.003 | 4 / 52    | Angemessen. Die Prüf-Edge-Function nutzen auch Teamchat und Flotte.                                                                                                                                             |
| 12  | Ernährung               | gering                                | Nur Zusatzleistung (`:78`), kein K/G                                                                                                                                                       |           0 |               – | 10 / 72   | **Überproportional:** klassischer Tracker mit BLS/OFF-Import. Die Roadmap plant noch ERN-EPIC-004 bis -006 (Barcode, Rezepte, Verlauf; `ROADMAP.md:78–80`).                                                     |
| 13  | Heimübungspläne         | hoch                                  | K12                                                                                                                                                                                        |           1 |          13.239 | 8 / 34    | Angemessen.                                                                                                                                                                                                     |
| 14  | Befund/Scores/Bausteine | hoch                                  | Erstaufnahme mit Scores und DIGOTOR-Bogen (Vision §3); K10                                                                                                                                 |           1 |          13.107 | 2 / 12    | Angemessen; 3.295 Zeilen JSON sind Inhalt.                                                                                                                                                                      |
| 15  | Übungskatalog           | mittel–hoch                           | Vorlagen für K12                                                                                                                                                                           |           1 |          12.673 | 3 / 30    | 38,3 % sind Startinhalt (CLAUDE.md); Programmcode ohne Inhalt 3.773.                                                                                                                                            |

### 4.6 Vereinfachungsvorschläge für die markierten Teile

Alle markierten Teile hat Jannes beauftragt. Einiges davon steht auf offenen ANN-Annahmen (Rang 4), einiges auf ADRs oder Prinzipien (Rang 2 und 1). Jede Rücknahme entscheidet Jannes.

**M1 · 3D-Radmodell durch eine Bauteilliste ersetzen**

- **Bleibt:** `bike3d/zones.ts` mit 27 Bauteilen und 12 Prüfpunkten (Gegenstück `app.fleet_zones`/`fleet_check_items`), die Fotos am Rad und eine Stelle als Bauteil, Schwere und Notiz.
- **Entfällt:**
  - `model.ts`, `viewer.ts`, `BikeModel3D.tsx`, `werkstattbilder.ts`, `nadeltreffer.ts`;
  - `Stellenerfassung.tsx`, `RadStellen.tsx`, `Nadel.tsx`, `stellen.ts`, `Testbausteine.tsx`;
  - `einstieg.test.ts` (prüft nur das Nachladen von three);
  - die Spalten `point_x/y/z` und `model_version` sowie `app.fleet_model_version`;
  - die Abhängigkeiten `three` und `@types/three`.
- **Neues Design:** „Wo genau?“ wird eine Auswahlliste der Bauteile des Prüfpunkts, nach dem Muster von `Radwahl.tsx` (36 Zeilen). Das Werkstattblatt zeigt Bauteilnamen und die vorhandenen Fotos.
- **Einsparung:** TS ≈ 3.300, Unit 192, E2E 278, DB-Fn ≈ 30; Doku 3.672 ins Archiv.
  - Schätzung: 3.554 gemessen, abzüglich 243 für `zones.ts` und ≈ 150 für die Ersatzliste, zuzüglich ≈ 150 für die 3D-Anbindung in `CheckupFenster.tsx`.
- **Verlust:** der Punkt auf dem Modell und die gerenderten Werkstattansichten. Die Schrittzahl von G3 bleibt gleich; `kernablaeufe.md:53` nennt das 3D-Rad nur als Darstellung.
- **Rang:** Auftrag Jannes vom 07./08.10.2026 (`handoff-2026-10-08-lastenrad-3d.md:19`); ANN-555 und ANN-556 sind offen.

**M2 · Check-Up auf eine Checkliste**

- **Bleibt:** 12 Prüfpunkte mit „in Ordnung / beobachten / Problem“, Notiz, Fotos je Seite (ANN-568), Hinweis zum Rhythmus.
- **Entfällt:** das geführte Fenster mit einer Seite je Prüfpunkt, Kameraflug und Eingabesperre (`CheckupFenster.tsx:77–90`).
- **Einsparung (Schätzung):** TS ≈ 1.150, Unit ≈ 415.
  - `CheckupFenster.tsx` 1.453 → ≈ 400, `checkupablauf.ts` 214 → ≈ 100.
  - `CheckupPage.test.tsx` 584 → ≈ 250, `checkupablauf.test.ts` 131 → ≈ 50.
- **Verlust:** die Führung ohne Scrollen. Die Regel „kein Scrollen bei 375 px“ (`kernablaeufe.md:46 f.`) gilt nur für G1–G10, und der Check-Up ist kein G-Ablauf.
- **Rang:** ANN-563 ist offen.

**M3 · Teamchat auf den Umfang von §10 zurückführen**

- **Bleibt:** Kanäle, Direkt- und Gruppennachrichten, Threads, Erwähnungen, Suche, Anhänge, Benachrichtigung in der App, „Als Aufgabe“ (Pflicht aus §10) und die Löschfrist.
- **Entfällt:**
  - Reaktionen, Anheften, „Für später“ mit Erinnern, Planen;
  - Profilbild mit Zuschnitt, Farbe, Personenkarte;
  - Sprachnachricht und Slack-Formatierung (`format.tsx` und `formatierung.ts`, 343 Zeilen);
  - die Tabellen `team_message_reactions`, `team_message_pins`, `team_saved_messages`, `staff_profile_pictures`, `staff_colors`.
- **Einsparung:**
  - TS ≈ 2.300: 1.922 gemessen, dazu ≈ 400 in gemischten Dateien (164 Trefferzeilen × ≈ 2,5).
  - Unit ≈ 870: 272, dazu ≈ 600 aus `TeamChat.test.tsx` (123 Trefferzeilen).
  - DB-Tests ≈ 1.400: `teamchat-profil.test.ts` 844, dazu ≈ 550 aus `teamchat-slack.test.ts:486–783` und Teilen von `:1075–1500`.
  - E2E ≈ 450: `profilbild.spec.ts` 302, dazu ≈ 150.
  - DB-Fn 545 in 26 Funktionen (psql).
- **Verlust:** Komfort, nichts aus §10. Die Sprachnachricht hat Jannes ausdrücklich gewollt (`ADR-017:43`).
- **Rang:** Aufträge TEAM-002, -006, -007 und -009 (`ROADMAP.md:907–914`); ANN-643 bis -646 und ANN-655 sind offen.

**M4 · Barometer streichen**

- **Bleibt:** eine Rückmeldung als Direktnachricht an `owner`.
- **Entfällt:** `src/features/feedback/` (1.604 Zeilen), drei Tabellen `staff_feedback*`, 15 Funktionen.
- **Einsparung (gemessen):** TS 1.172, Unit 432, DB-Tests 780, DB-Fn 393.
- **Verlust:** das anonyme Barometer. Bei weniger als 3 berechtigten Beschäftigten zeigt es ohnehin nichts.
- **Rang:** §20.2 (Rang 1, Formulierung „DÜRFEN“) sowie ANN-607 und ANN-608 (entschieden) → Jannes. Alternative: abschalten bis zur dritten Einstellung.

**M5 · Ladestrom ohne Tourenrechnung**

- **Bleibt:** die Erstattung „Strom“ als Betrag mit Beleg, wie beim Einkauf.
- **Entfällt:** `supabase/functions/electricity-distance/` (435 Zeilen + 501 Testzeilen), `LadestromEinstellung` und `LadestromVorschlaege`, 10 SQL-Funktionen (darunter `app.electricity_tour_days` mit 74 Zeilen), `electricity-tour-distance.test.ts` (462).
- **Einsparung:** TS ≈ 894 (694 gemessen + ≈ 200 in `RequestReimbursementPage.tsx`, Schätzung), Unit 675, DB-Tests 462, DB-Fn 310.
- **Verlust:** Heute rechnet der Server den Betrag aus den Tourenkilometern (G10: 5 Tipps). Danach sind es 5 Tipps plus Betrag.
- **Rang:** ANN-615 offen, ANN-599 geändert.

**M6 · Lebensmittelkatalog und Tagebuch zurückstellen**

- **Bleibt:** Profil, Bedarf mit Rechenweg, Einwilligung, Gewicht, Beratungstermin und Abrechnung, zusammen 6.440 Code.
- **Entfällt:**
  - Katalog: `food_catalog`, `food_sources`, `custom_foods`, die Trigramm-Suche und der Import in `scripts/lebensmittel/`;
  - Tagebuch: `nutrition_diary_entries`, `nutrition_diary_favorites`, `nutrition_diary_reminders`, `nutrition_water_days`, `platform/Tagebuch*.tsx` und `api.ts:2100–2314`;
  - die geplanten ERN-EPIC-004 bis -006.
- **Einsparung (gemessen):** TS 2.940, Unit 372, DB-Tests 2.153, E2E 184, DB-Fn 1.159 (41 Funktionen), 7 Tabellen, 989 Skriptzeilen.
- **Verlust:** die „klassische Tracking-App“ aus ADR-027.
- **Rang:** ADR-027 (Rang 2, angenommen am 2026-10-18) → die ADR müsste Jannes ändern.

**M7 · Einsicht der Praxis in die Plattform streichen**

- **Bleibt:** `PlattformAbschnitt.tsx` in der Akte.
- **Entfällt:** der Verteiler `platform_preview` (160 Zeilen) mit einer zweiten Fassung der Plattformfunktionen (`platform/einsicht.ts`, 282 Zeilen), `PlattformEinsicht.tsx` und `platform-preview.test.ts` (1.314).
- **Einsparung (gemessen):** TS 603, Unit 1.005, DB-Tests 1.314, E2E 275, DB-Fn 216.
- **Verlust:** die Ansicht „So sieht … die Plattform“ für Telefonsupport. Zugleich fällt ein zusätzlicher Lesepfad auf Plattformdaten weg.
- **Rang:** Befund B11 aus der Durchsicht vom 14.10. (`ROADMAP.md:950`).

**M8 · Üben nur noch mit Netz**

- **Bleibt:** die Durchführung mit Haken je Satz, online.
- **Entfällt:** `ablage.ts` (602), `PlattformAblage.tsx`, `LokaleUebungen.tsx`, `uebertragung`, `public.sync_platform_exercise_session` (214 Zeilen), `platform-exercise-sync.test.ts` (602).
- **Einsparung (gemessen):** TS 820, Unit 522, DB-Tests 602, DB-Fn 214.
- **Verlust:** Üben im Funkloch, etwa bei Training draußen.
- **Rang:** ADR-024 Punkte 5, 7 und 8 (Rang 2); ANN-358 offen.

**M9 · Reste der Übungsbilder entfernen**

- **Entfällt:** zwei Funktionen, zwei Spalten mit CHECK, das Feld `illustration` im RPC-JSON.
- **Einsparung:** DB-Fn 10, DB-Tests 19, dazu ≈ 23 Migrationszeilen.
- **Verlust:** keiner, ANN-539 ist entschieden.

| Nr    |           TS |        Unit |    DB-Tests |         E2E |       DB-Fn |      Tabellen |                            Summe |           Anteil am Feature |
| ----- | -----------: | ----------: | ----------: | ----------: | ----------: | ------------: | -------------------------------: | --------------------------: |
| M1    |      ≈ 3.300 |         192 |           0 |         278 |        ≈ 30 | 0 (4 Spalten) |                          ≈ 3.800 |               Flotte 17,4 % |
| M2    |      ≈ 1.150 |       ≈ 415 |           0 |           0 |           0 |             0 |                          ≈ 1.565 |                Flotte 7,2 % |
| M3    |      ≈ 2.300 |       ≈ 870 |     ≈ 1.400 |       ≈ 450 |         545 |             5 |                          ≈ 5.565 |             Teamchat 25,6 % |
| M4    |        1.172 |         432 |         780 |           0 |         393 |             3 |                            2.777 |              Personal 6,7 % |
| M5    |        ≈ 894 |         675 |         462 |           0 |         310 |             0 |                          ≈ 2.341 |              Personal 5,7 % |
| M6    |        2.940 |         372 |       2.153 |         184 |       1.159 |             7 |            6.808 (+ 989 Skripte) |            Ernährung 51,4 % |
| M7    |          603 |       1.005 |       1.314 |         275 |         216 |             0 |                            3.413 |             Plattform 5,4 % |
| M8    |          820 |         522 |         602 |           0 |         214 |             0 |                            2.158 |             Plattform 3,4 % |
| M9    |            0 |           0 |          19 |           0 |          10 | 0 (2 Spalten) |                               29 |                           – |
| **Σ** | **≈ 13.179** | **≈ 4.483** | **≈ 6.730** | **≈ 1.187** | **≈ 2.877** |        **15** | **≈ 28.456 (5,5 % von 516.809)** | + 989 Skripte, + 3.672 Doku |

**Aufteilung der Summe:**

- Gemessen (M4, M6–M9): 15.185.
- Teils geschätzt (M1–M3, M5): 13.271.

**Größerer Hebel, nur als Frage an Jannes:** Teamchat, Radflotte und Personal-Suite haben zusammen 85.004 Code-Zeilen und keinen Kernablauf. Sie bis zur ersten Einstellung einzufrieren, berührt §14 (Rang 1). Einfrieren spart keine Zeilen, verhindert aber, dass diese Bereiche weiter wachsen.

**Nicht markiert, obwohl groß:**

- Kalender-Raster mit 11.868 Zeilen.
- Plattform: Übungen, Nachrichten, Termine und Zugang (Vision §4, `:78`).
- Arbeitszeit, Zeitkonto und Urlaub mit 17.537 Zeilen. Die Pflicht zur Aufzeichnung begründet `ASSUMPTIONS.md:6180` (EuGH C-55/18, BAG 1 ABR 22/21).
- Training (ADR-021/022), Leistungskatalog (5.171) und Offline-Doku (ADR-001).

## 5. Doku-Inventur

### 5a BEF-Inventur

Stand Commit 3c5e72b, Prüfung am Code, an den Tests und am Katalog der Analyse-DB. Rohdaten: `analyse/s5a/inventur.json` (je Kennung: Eintrag ja/nein, Fundorte) und `…/s5a/codezitate.mjs`.

#### Bestand und Nummernraum

| Größe                                 | Wert                                                                                                                                     | Beleg                                                                                   |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Nummernraum                           | BEF-001 bis BEF-230 = 230 Kennungen                                                                                                      | höchste Kennung `BEFUNDE.md:719`                                                        |
| mit Eintrag (Überschrift `### BEF-`)  | **126** = 38 in `docs/development/BEFUNDE.md` (729 Z.) + 88 in `archiv/BEFUNDE-ERLEDIGT.md` (2.054 Z.); keine Kennung in beiden          | `grep '^### BEF-'`                                                                      |
| nur noch als Zitat (Eintrag gelöscht) | **88**; 72 davon in Code/Tests/Skripten, 16 nur in Doku (002, 006, 008, 009, 012, 017, 020, 025, 029, 054, 084, 087, 091, 093, 109, 125) | Git-Historie ist flach (317 Commits ab 2026-10-16); schon damals fehlten diese Einträge |
| nirgends genannt                      | **16**; davon 5 nur über die Spanne „BEF-084 bis BEF-091“ (085, 086, 088, 089, 090); **11 ohne jede Spur**: 045, 126, 203–209, 227, 228  | `git grep`, `git log --all -S` leer                                                     |
| verschiedene zitierte Kennungen       | 214 (= 126 + 88), FAKTEN bestätigt                                                                                                       |                                                                                         |
| `archiv/BEFUNDE-LOESUNGEN.md`         | 1.103 Z., Übersichtstabelle mit **59** Befunden (Kopf: „59 offene Befunde“); 60 genannt, BEF-076 nur als Verweis                         | Z. 7, 26–90                                                                             |

Regel D in `scripts/docs-check-regeln.mjs:26–27, 193–210` prüft nur, dass eine Kennung **höchstens einmal als Überschrift** steht. Schon heute schützt sie die 88 nur zitierten und die 16 nie genannten Nummern nicht vor Wiedervergabe. Die Regel „nächste Kennung = höchste aus beiden Dateien + 1“ (`BEFUNDE.md:43`) hängt heute nur an BEF-230 in `BEFUNDE.md`.

#### Prüfung der 38 Einträge in BEFUNDE.md

| BEF | Z.      | Status laut Doku                       | Befund am Code heute                                                                                                                                                                                                                                                                                                                                    | Urteil    |
| --- | ------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 010 | 51–81   | Einzelfall erledigt, Muster offen      | Einzelfalltest `supabase/tests/home-visit-scenarios.test.ts:329`; keine Prüfung je Schema. **Das Muster ist wieder aufgetreten:** `get_treatment_note` liefert `reported_written_at` (basis.sql:29729), der jsonb-Bau in `list_patient_treatment_notes` (basis.sql:34184–34201) nicht. TS fängt das mit `.optional()` ab (`documentation/api.ts:61–65`) | teilweise |
| 024 | 82–107  | offen                                  | `src/features/staff/api.ts:231` zählt `z.enum(['therapy','internal','training'])` neu auf, statt `appointmentKindSchema` (`appointments/api.ts:223`) zu nutzen                                                                                                                                                                                          | offen     |
| 026 | 108–141 | offen                                  | Richtung entschieden 2026-10-10 (eigener SMTP-Anbieter): `OPEN_DECISIONS.md:58, 217`, `ROADMAP.md:295` (R8), `:605`; Adapter mit `mock` (`supabase/functions/platform-access/authmail.ts:20`). Die verlangte Prüfung des Empfängerkreises ist damit gegenstandslos                                                                                      | überholt  |
| 028 | 142–215 | Gate erledigt (G19), Nebenbefund offen | Gate `docs-check-regeln.mjs` Regeln A–D, Test `docs-check.test.mjs:181`. Der Nebenbefund „Zeilengrenzen voll“ ist überholt: Seit 2026-10-12 gelten Bytegrenzen (`:224–232`; CLAUDE.md 7.166/8.192 B, STATUS 3.262/4.096 B). Offen sind nur noch OPEN_DECISIONS 399/400 Zeilen und `OPEN_DECISIONS.md:52` (B7 nennt „ADR-019 Fassung 2“, gilt Fassung 6) | teilweise |
| 034 | 216–236 | erledigt (UX-002h), G6b-Ausgang offen  | `StaffListPage.tsx:67–80` und `StaffMemberDetailPage.tsx:244–246` fragen nur mit `canManageAppointments`. `list_assignable_therapists` weist ohne `record_denied_read` ab, `audit.test.ts:217` hält das als „bewusst“ fest. Der Menüpunkt ist überholt: trainer hat eigene Arbeitszeit (`navigation.tsx:239–252`)                                       | teilweise |
| 048 | 237–298 | entschieden, gebaut RAH-EPIC-001       | `index.css:372, 375` (Strich 3 px, Spalte 84 px), Manifest `#ffffff` (`manifest.webmanifest:8–9`), `index.html:11`; Tests `designsystem.test.ts:522–541`, `AppShell.test.tsx:626`                                                                                                                                                                       | erledigt  |
| 050 | 299–339 | entschieden, gebaut                    | `src/app/tabtitel.ts`, Test „trägt nie Daten“ `tabtitel.test.ts:100`, `seitenwechsel.ts`                                                                                                                                                                                                                                                                | erledigt  |
| 082 | 340–353 | offen                                  | Katalog: noch **15** (nicht 16) `STABLE`-Funktionen mit `record_denied_*`; `list_care_without_conclusion` ist inzwischen `VOLATILE`. Liste in `audit.test.ts:372–390`                                                                                                                                                                                   | offen     |
| 120 | 354–365 | erledigt PR #169                       | `MyDayPage.test.tsx:1230–1233, 1287–1289, 2156–2158` setzen die Uhr fest (`vi.setSystemTime`)                                                                                                                                                                                                                                                           | erledigt  |
| 121 | 366–377 | erledigt PR #171                       | `platform-accesses.test.ts:179–181`                                                                                                                                                                                                                                                                                                                     | erledigt  |
| 122 | 378–389 | erledigt PR #172                       | `patient-merge.test.ts:117–121` (20 Uhr UTC)                                                                                                                                                                                                                                                                                                            | erledigt  |
| 123 | 390–402 | erledigt                               | Gate `scripts/migrationen-check.mjs`, Job `migrationen` in `ci.yml:215–239`; die genannten Migrationen gibt es seit #309 nicht mehr                                                                                                                                                                                                                     | erledigt  |
| 127 | 403–414 | offen                                  | In allen drei Constraints fehlt im zweiten Zweig `IS NOT NULL` (Katalog). SELECT-Auswertung mit lat 50, lon NULL ergibt NULL, der CHECK gilt also als erfüllt. Vorbild `locations_garage_coordinate_check` ist dicht                                                                                                                                    | offen     |
| 130 | 415–428 | erledigt PR #202                       | `aftercare-cancellation.test.ts:55–58`, `aftercare-subscriptions.test.ts:51–54` (`app.training_today`)                                                                                                                                                                                                                                                  | erledigt  |
| 140 | 429–444 | (1)(2) erledigt, (3) offen             | (1) `MyDayPage.test.tsx:678`, (2) `PatientMasterDataFields.tsx:94`. (3) steht noch in `tours/Tourenliste.tsx:206–210`; die Bedingung „Gerätebewertung“ führt kein lebendes Dokument                                                                                                                                                                     | teilweise |
| 142 | 445–458 | offen, Frage an Jannes                 | `platform/einwilligungstexte.ts:58` unverändert, `Einwilligungen.test.tsx:106` hält den alten Wortlaut fest                                                                                                                                                                                                                                             | offen     |
| 153 | 459–472 | gebaut mit Nachbildung, Anbieter offen | `Spracheingabe.tsx`, `diktat.ts`, `ai-gateway/zwecke.ts:8`, `dictation-access.test.ts`. Der Rest wird schon als `OPEN_DECISIONS.md:87` (E13/C6) und `STATUS.md:27` geführt                                                                                                                                                                              | erledigt  |
| 166 | 473–486 | offen, vor dem Scharfschalten          | `legal_holds.subject_type` erlaubt nur `patient`/`staff_member` (CHECK), `app.delete_due_fleet_records` kennt keine Sperre                                                                                                                                                                                                                              | offen     |
| 167 | 487–500 | offen                                  | `fleet_photos` ohne `object_missing`; die Akte hat es (`list_patient_files` basis.sql:33393); kein Treffer in `src/features/fleet/`                                                                                                                                                                                                                     | offen     |
| 171 | 501–514 | offen                                  | Wiederholung gebaut: `SSH_PAUSEN` `scripts/testumgebung.mjs:121–126`, `test-umgebung.yml:311–322` (ANN-559). Ob der Abbruch anhält, zeigen nur die Actions-Läufe                                                                                                                                                                                        | teilweise |
| 177 | 515–526 | offen                                  | `authenticated` hat Tabellen-SELECT auf `staff_working_hours` inkl. `created_by/created_at`; Policy `…_select_staff_only` gilt für jede Praxisrolle                                                                                                                                                                                                     | offen     |
| 184 | 527–538 | offen (Vorschlag)                      | `nutrition/ProfilFormular.tsx:170–180` nur Kästchen und Datum, kein Foto                                                                                                                                                                                                                                                                                | offen     |
| 194 | 539–550 | offen                                  | `assessments/darstellung.ts:27` ist der einzige Lookbehind in ausgeliefertem `src/`; ein Test besteht nur für `begriffe.ts` (`begriffe.test.ts:107`)                                                                                                                                                                                                    | offen     |
| 195 | 551–562 | offen                                  | `platform/Navigation.tsx:190` `max-[23rem]:basis-full` greift bei 375 px nicht (23 rem = 368 px), dazu `overflow-wrap:anywhere` `index.css:460`; Code unverändert seit 22.10., Befund vom 24.10.                                                                                                                                                        | offen     |
| 198 | 563–574 | offen                                  | Rumpf von `delete_treatment_basis` ohne `deletion_journal` (30 Funktionen schreiben es)                                                                                                                                                                                                                                                                 | offen     |
| 201 | 575–586 | offen                                  | `platform/Anhaenge.tsx:177` `onClick={() => loeschen.mutate(a.id)}` ohne Rückfrage                                                                                                                                                                                                                                                                      | offen     |
| 202 | 587–598 | offen                                  | `playwright.config.ts:55` `retries: 1`, kein `E2E_LAUF`, 24 Spezifikationen mit `const LAUF = Date.now()`                                                                                                                                                                                                                                               | offen     |
| 212 | 599–610 | offen                                  | `LokaleUebungen.tsx:38–42, 104–108` ohne `networkMode` (anders als `Durchfuehrung.tsx:105/236/675`)                                                                                                                                                                                                                                                     | offen     |
| 217 | 611–622 | offen (Entscheidung)                   | Bühne und Marken unverändert; kein Test, der Wortbruch bei 188 px und „sehr groß“ zugleich misst (`plattform-uebungen.spec.ts:352` misst nur das waagerechte Rollen)                                                                                                                                                                                    | offen     |
| 220 | 623–634 | offen, Schritt 3                       | `overflow-wrap:anywhere` `index.css:460`; `Termine.tsx` seit 22.10. unverändert; 7× im Handoff 2026-10-24                                                                                                                                                                                                                                               | offen     |
| 221 | 635–646 | offen, Schritt 3                       | Satz in `Terminaenderung.tsx:108`                                                                                                                                                                                                                                                                                                                       | offen     |
| 222 | 647–658 | offen, Frage an Jannes                 | `app.platform_access_allows`: `when p_capability in ('read','request','message') then true`                                                                                                                                                                                                                                                             | offen     |
| 223 | 659–670 | offen, Pfad A                          | `cancel_appointment`: `(datum+zeit) at time zone v_tz > now()`; SELECT: 02:30 am 25.10. wird zu 01:30 UTC (die spätere Lesart)                                                                                                                                                                                                                          | offen     |
| 224 | 671–682 | offen                                  | `RequestWorkingTimePage.tsx:693–706` ohne kompakten Ladezustand; letzter Commit 02873b0 trägt den Befund selbst ein                                                                                                                                                                                                                                     | offen     |
| 225 | 683–694 | offen                                  | `tests/e2e/plaene.spec.ts:45–49` misst einmal (`?? 0`), kein `expect.poll`                                                                                                                                                                                                                                                                              | offen     |
| 226 | 695–706 | offen                                  | `plattform.spec.ts:113` mit Standardlimit, `plattform-uebungen.spec.ts:246–251` ohne `data-schrift`                                                                                                                                                                                                                                                     | offen     |
| 229 | 707–718 | offen                                  | Alle 9 Funktionen existieren. **Es fehlen 3 weitere**, die nur Tests rufen: `public.list_patient_treatment_evidence`, `app.mdr_released` und `app.appointment_window_options` (Korrektur 3a) (in `src` nur in Kommentaren, keine Policy, kein Rumpf)                                                                                                    | offen     |
| 230 | 719–729 | offen                                  | Shim ohne `default privileges`; die Basis hat 1.219× `REVOKE … FROM anon`. Die vier genannten Funktionen sind nur `FROM PUBLIC` entzogen                                                                                                                                                                                                                | offen     |

Summe: **8 erledigt, 1 überholt, 5 teilweise, 24 offen.** 9 Einträge widersprechen der eigenen Regel in `BEFUNDE.md:39–42` („hier nur offene“), weil sie erledigt sind. 6 offene Einträge (082, 127, 166, 167, 177, 198) nennen Migrationsdateien, die es seit #309 nicht mehr gibt; nur `basis.sql` existiert (7 von 8 genannten Dateien fehlen).

#### BEFUNDE-ERLEDIGT.md

- Status der 88 Einträge: 86 „erledigt“ (dazu zählen 049, 061 und 066 mit „entschieden … gebaut/erledigt“), 1 „verworfen“ (149). Bei BEF-064 ist der Status veraltet: Dort steht „eingeplant in UX-EPIC-008“, gebaut ist es aber (`StaffAccountSection.test.tsx:327–377`, `navigation.test.tsx:148`, `fortschritt.json:489–492` „fertig 2026-10-10“).
- **Stichprobe 15/15 bestätigt:**

| BEF | Beleg                                                         |
| --- | ------------------------------------------------------------- |
| 046 | `App.test.tsx:81`, `App.nachladen.echt.test.tsx:97`           |
| 064 | siehe oben                                                    |
| 070 | drei `api.antwort.test.ts` (Dateien, Bericht, Erhebung)       |
| 114 | Tabelle `training_packages`                                   |
| 124 | `treatment_basis_versions`, `treatment-basis-history.test.ts` |
| 138 | `platform-files.test.ts:132` (Abruf ohne Protokoll)           |
| 146 | `betroffenenrechte.test.ts:187`                               |
| 149 | Entscheidung „Nein“ im Eintrag                                |
| 165 | `app.small_business_notice` in `build_invoice_document`       |
| 170 | `app.journal_patient_file_deletion`                           |
| 178 | `place_staff_legal_hold`, `legal-hold-staff.test.ts`          |
| 181 | `supabase/functions/electricity-distance/`                    |
| 211 | `Durchfuehrung.tsx:235`                                       |
| 213 | `Durchfuehrung.test.tsx:612, 651`                             |
| 219 | `RequestWorkingTimePage.tsx:691`, `arbeitszeit.spec.ts`       |

- **64 Einträge (916 Z.) enthalten keine Entscheidung von Jannes.** Sie sind reine Geschichte und können ersatzlos weg. Wo Jannes Quelle war, steht die Festlegung in einer ANN (z. B. 129 → ANN-341, 133–138 → ANN-214 ff., ADR-010 Fassung 4).
- **24 Einträge (1.138 Z.) enthalten eine Entscheidung von Jannes:** 046, 047, 049, 052, 055, 056, 058–067, 070, 139, 149, 178, 181–183, 189. 15 davon zitiert ein ANN, ADR oder Designdokument. **9 stehen nur hier:** 047, 055, 058, 060, 063, 065, 070, 149, 182. Gebaut sind alle, ausgenommen 149, das verworfen wurde.
- Kein Eintrag verankert noch etwas. Die 17 dort genannten Migrationsdateien gibt es alle nicht mehr.

#### BEFUNDE-LOESUNGEN.md

Von den 59 analysierten Befunden haben noch 5 einen Eintrag in `BEFUNDE.md`: 024, 026, 048, 050 und 082. 16 stehen in ERLEDIGT, 38 sind gelöscht. Wirklich offen sind davon nur **024 und 082**, und beide tragen ihre Lösung im eigenen Eintrag (`BEFUNDE.md:103–106`, `:352–353`). **Die Datei wird nicht mehr gebraucht.** Löschen kostet 2 Linkänderungen (`BEFUNDE.md:19`, `archiv/README.md:17`). Die zwei Nennungen als Code-Text (`ROADMAP.md:466`, `ADR-017-file-storage.md:1924`, dort mit falschem Pfad) prüft kein Gate.

#### Zitate im Code und was Löschen bedeutet

| Sicht                                           | Wert                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zitate in `src`, `supabase`, `tests`, `scripts` | **1.515** in 576 Dateien, 162 Kennungen. Davon src 928 (343 in Tests), supabase 460 (`basis.sql` 221, `supabase/tests` 191, Edge Functions 43, Sonstiges 5), tests/e2e 100, scripts 27                                                                                                                                |
| Art                                             | ≈ 1.090 in Kommentaren (Schätzung: 1.007 eindeutige Kommentarzeilen plus der Großteil von 87 Fortsetzungszeilen in JSX-Kommentaren, Stichprobe 36/40), 297 in Testnamen (`it`/`describe`), 124 in `COMMENT ON` (Katalogtexte der DB), 4 als Testdaten (`docs-check.test.mjs:184–187`, `kommentare-check.test.mjs:79`) |
| Ziel                                            | 61 auf offene Einträge (15 Kennungen), 938 auf ERLEDIGT (75), **516 schon heute auf nichts (72 Kennungen, 34 %)**                                                                                                                                                                                                     |

Folgen des Löschens:

- **Kein Gate bricht.** `docs:check` prüft nur die Eindeutigkeit der Überschriften und relative Links. `kommentare:check` behandelt `BEF-NNN` ohnehin als Ticket und lässt es in neuen oder geänderten Kommentaren nicht zu (`scripts/kommentare-check.mjs:13–15, 83–86`; `basis.sql` ist ausgenommen). Die rund 1.090 Kommentarzitate sind also schon heute auslaufender Bestand.
- Wird ERLEDIGT gelöscht, steigen die ins Leere zeigenden Zitate von 516 auf 1.454 (96 %). Kommen die 9 löschbaren Einträge aus `BEFUNDE.md` dazu (37 Zitate), sind es 1.491 (98 %). Nachvollziehbar bleiben sie über `git log -S`, die PRs und `fortschritt.json`, dessen 61 BEF-Nennungen nur Postennamen sind.
- Testnamen und `COMMENT ON` nennen dann eine Kennung ohne Eintrag. Das ist eine kosmetische Folge, keine funktionale.
- Eine Massenbereinigung über 576 Dateien wäre ein ungefragtes Refactoring. Die Zitate gehen beim nächsten Anfassen weg, wie es die Kommentarregel ohnehin vorsieht.
- Eine einzige Codestelle braucht ihren offenen Befund weiter: `audit.test.ts:372` (BEF-082, „Liste darf nur schrumpfen“).
- Schafft man ERLEDIGT ganz ab, muss die Prozessregel mit: `BEFUNDE.md:39–45` und vier Skills (`.claude/skills/aufraeumen/SKILL.md:31`, `bereich/SKILL.md:108`, `feature-loop/SKILL.md:77`, `sichtung/SKILL.md:24`). Dazu gehört ein fester Zähler „nächste Kennung“, denn Regel D sieht gelöschte Nummern nicht.

#### Ergebnis

**Erledigt** sind 95 der 126 Einträge: 8 in `BEFUNDE.md` und 87 im Archiv, darunter BEF-064 mit veraltetem Status. Dazu kommen BEF-026 (überholt) und BEF-149 (verworfen), zusammen 97 abgeschlossen.

**Sofort ersatzlos löschbar: 73 BEF-Einträge mit 1.130 Zeilen, dazu die ganze `BEFUNDE-LOESUNGEN.md` mit 1.103 Zeilen, zusammen 2.233 Zeilen:**

- aus `BEFUNDE.md` 9 Einträge mit 214 Z.: 026 (34), 048 (62), 050 (41), 120, 121, 122 (je 12), 123 (13), 130 (14), 153 (14);
- aus `BEFUNDE-ERLEDIGT.md` die 64 Einträge ohne Entscheidung von Jannes, 916 Z.

Zieht man die 9 Entscheidungen, die nur dort stehen (047, 055, 058, 060, 063, 065, 070, 149, 182), vorher je in einen Satz in ANN oder ADR, oder gilt Git als Archiv, kommen 24 Einträge mit 1.138 Z. dazu. Dann sind es 97 Einträge und 3.371 von 3.886 Zeilen (87 %). Die 5 teilweise erledigten Einträge haben 156 Z.; auf ihren Rest gekürzt, sparen sie geschätzt weitere rund 125 Z. (Annahme: etwa 6 Zeilen je Rest).

**Wirklich offen: 24 Einträge und 5 Reste.**

| Art                        | Befunde                                                                                                                                                                                                                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datenbank, Pfad A          | 082 (15 Funktionen auf VOLATILE), 127, 166 (vor dem Scharfschalten), 167, 177, 198, 222 (wartet auf Jannes), 223, 229 (+3 Funktionen), 230                                                                                                                                               |
| Plattform-Oberfläche       | 194, 195, 201, 212, 217 (Entscheidung), 220, 221                                                                                                                                                                                                                                         |
| Praxis-Oberfläche und Text | 024, 142 (neue Textfassung, Jannes), 184, 224                                                                                                                                                                                                                                            |
| Tests und E2E              | 202, 225, 226                                                                                                                                                                                                                                                                            |
| Reste                      | 010 (Muster; konkreter neuer Fall `reported_written_at`), 028 (B7-Verweis Fassung 2 → 6, OPEN_DECISIONS 399/400), 034 (Abweisung von `list_assignable_therapists` protokollieren oder als bewusst schließen; braucht ADR-010 und `freigabe-audit`), 140 (3), 171 (Actions-Läufe ansehen) |

#### Korrekturen an FAKTEN.md

- „Lösungsanalyse zu 60 BEF“: Analysiert sind **59**, genannt 60 (BEF-076 nur als Verweis).
- 214 zitierte Kennungen, 38 und 88 Einträge sowie „Nummern bis BEF-230“ stimmen.
- BEF-229 nennt 9 Funktionen plus 4 Betriebswege. Die Messung in 3a (3 verwaist, 13 nur aus Tests) ist vollständiger: `list_patient_treatment_evidence`, `app.mdr_released` und `app.appointment_window_options` fehlen im Befund.
- BEF-082 nennt 16 Funktionen, tatsächlich sind es noch 15.

### 5b ANN-Inventur: 610 Einträge

**Bestand.**

- **Umfang:** `docs/decisions/ASSUMPTIONS.md` hat 7.620 Zeilen und 1.017.934 B. Die Einträge
  allein haben 953.349 B.
- **Nummern:** 610 Einträge, Kennungen ANN-001 bis ANN-731. 121 Nummern sind nie vergeben, zum
  Beispiel ANN-158 bis -171 und ANN-623 bis -639.
- **Größe:** 384 Einträge sind größer als 1 KB, 31 größer als 3 KB. Die 1-KB-Regel steht im Kopf
  der Datei, aber kein Gate prüft sie (5c).
- **Kategorien:** Praxisprozess 229, Datenschutz 159, Technik 136, Oberfläche 45, Recht 39,
  Prozess 2. „Oberfläche“ und „Prozess“ kennt der Kopf der Datei nicht.
- **Status:**

  | Status               | Einträge |
  | -------------------- | -------: |
  | entschieden (Jannes) |      394 |
  | offen                |      178 |
  | entschieden (Claude) |       22 |
  | verworfen            |       11 |
  | sonstige             |        5 |

  „entschieden (Claude)“ und „vorläufig“ kennt der Lebenszyklus nicht.

- **Anker:**
  - 288 Einträge zeigen auf Einzelmigrationen, die es seit #309 nur noch in der Basis gibt.
  - 12 zeigen auf gelöschte TS-Dateien, 6 auf entfernte Funktionen.
  - 18 Anker hat `scripts/basis-migration.mjs` als `-- ANN-…`-Kommentar vor fachfremde Objekte der
    Basis gesetzt („Scheinanker“), darunter ANN-480 und ANN-483, beide verworfen. Das Anker-Gate
    bleibt trotzdem grün.

**Verfahren.**

- Vier Agenten haben je etwa 153 Einträge vollständig gelesen und jeden **genau einer** Klasse
  zugeordnet.
- Die Anker wurden im Code und im Katalog geprüft (`git grep`, `pg_proc`).
- „Widerspruch“ ist ein zusätzliches Merkmal quer zu den Klassen: gegen eine andere ANN, gegen ein
  ADR oder gegen den heutigen Code.
- Die Zuordnung ist ein Urteil. Die Zahlen sind belastbar auf etwa ± 5 % je Klasse; als
  Prüfgröße dienen die Beispiele in den Teilberichten.

| Klasse            | Einträge |   Bytes | Anteil Bytes | ≈ Zeilen | davon Prüfpaket | Kennungen (ANN-…; „a–b“ = alle vorhandenen Einträge dazwischen)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------- | -------: | ------: | -----------: | -------: | --------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| fachlich behalten |      260 | 470.529 |       49,4 % |    3.716 |             148 | 003, 008–011, 013–014, 020–021, 024–026, 028–030, 033–034, 039–044, 052, 055, 057, 060–061, 063–064, 067–068, 074, 076, 078–082, 086, 088, 092–093, 096–097, 099, 103–104, 116, 121–125, 128, 132–133, 135–139, 142, 144, 146, 148, 150, 152, 156–174, 176, 178–183, 185–186, 189–191, 194, 203–206, 208, 210, 213–216, 220, 226–227, 229, 236–237, 240, 242, 245–251, 257, 261–266, 268–285, 288–292, 294, 297, 300, 302, 304, 306–312, 319–321, 323–325, 327–331, 333, 335, 339–344, 346, 348–355, 360–361, 364–370, 386, 476, 510, 516, 520, 534, 536, 539–541, 544, 550–554, 558, 560–562, 565, 568–570, 574, 576–580, 588, 590–591, 593–594, 596–598, 601–602, 605, 607, 609, 611, 616–617, 619, 622, 642, 644, 646–647, 651–652, 656–657, 662, 664–665, 667–669, 673–675, 677, 690, 693–694, 703, 712 |
| Oberflächendetail |      139 | 153.197 |       16,1 % |    1.210 |               2 | 022–023, 048, 050, 058, 069, 107–109, 111–114, 117, 129–131, 192–193, 195–196, 198–202, 211, 225, 234, 241, 243–244, 252–254, 258, 260, 267, 314, 403–404, 406, 435–443, 445–461, 467–472, 477, 479, 481–482, 484–500, 502–503, 517, 521, 530–533, 535, 537–538, 542–543, 546–547, 563, 566–567, 573, 583, 585–587, 592, 604, 606, 620, 648, 650, 663, 666, 670, 678–686, 688, 692, 696–702, 705–711, 713–716, 721–725, 727, 731                                                                                                                                                                                                                                                                                                                                                                            |
| rein technisch    |      103 | 150.679 |       15,8 % |    1.190 |               5 | 007, 015, 045–046, 049, 051, 054, 056, 059, 062, 066, 073, 083–085, 087, 090–091, 098, 100–102, 106, 110, 115, 118, 141, 145, 147, 149, 151, 153, 155, 187, 197, 217, 219, 222, 228, 235, 238–239, 255, 259, 286, 295–296, 299, 301, 303, 313, 317–318, 322, 326, 336–337, 347, 357, 359, 362, 380, 382, 384, 387, 478, 522–524, 555–557, 559, 564, 571, 575, 581–582, 584, 589, 595, 600, 613, 615, 618, 621, 641, 643, 645, 649, 653, 658–661, 671, 676, 687, 689, 691, 704, 717, 730                                                                                                                                                                                                                                                                                                                     |
| redundant         |       63 |  96.731 |       10,1 % |      764 |              25 | 001, 005, 016–018, 035–036, 070, 072, 075, 089, 094–095, 127, 184, 188, 212, 223, 230–233, 256, 287, 293, 298, 315–316, 332, 334, 338, 345, 358, 363, 371, 383, 385, 400–402, 405, 407, 501, 511–515, 525–529, 572, 603, 608, 610, 640, 654–655, 672, 695, 726                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| veraltet          |       45 |  82.213 |        8,6 % |      649 |              11 | 002, 004, 006, 012, 019, 027, 031–032, 037–038, 047, 053, 065, 071, 077, 105, 119–120, 126, 134, 140, 143, 154, 175, 177, 207, 209, 218, 221, 224, 305, 356, 381, 388, 430, 444, 465–466, 475, 480, 483, 599, 612, 614, 720                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

**Mit Widerspruch** (zusätzliches Merkmal, quer zu den Klassen): 120 Einträge: 001, 003–004, 011, 017, 019, 021, 027, 029–034, 038, 040, 043, 047, 052–053, 057, 063–065, 072, 077, 079, 081, 083, 092–093, 099, 104–105, 110, 116, 119–120, 126–127, 133–134, 137–139, 141, 144, 148, 150, 153–154, 156–157, 174–175, 177, 179–182, 184–186, 189, 191, 196, 198, 200–202, 204, 207, 209, 212–214, 218, 224, 226–227, 230, 232, 238, 242, 244–245, 249, 256–257, 266, 281, 287, 291, 293, 298, 305–306, 311–312, 329, 337, 356, 371, 386, 388, 404, 450, 466, 478, 481, 485, 541, 563, 598, 610, 612, 614, 622, 662, 691.
Davon fachlich behalten und deshalb neu zu fassen statt zu löschen: 59: 003, 011, 021, 029–030, 033–034, 040, 043, 052, 057, 063–064, 079, 081, 092–093, 099, 104, 116, 133, 137–139, 144, 148, 150, 156–157, 174, 179–182, 185–186, 189, 191, 204, 213–214, 226–227, 242, 245, 249, 257, 266, 281, 291, 306, 311–312, 329, 386, 541, 598, 622, 662.

**Antwort auf die Frage des Auftrags:**

| Merkmal                                                                                                           |                                    Einträge |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------: |
| veraltet                                                                                                          |                                      **45** |
| rein technisch (Code, Tests oder Linter halten das Wissen fest)                                                   |                                     **103** |
| redundant (steht im Wesentlichen schon in ADR, PP, DESIGN.md oder einer anderen ANN)                              |                                      **63** |
| zusätzlich Oberflächendetail (UI-Mikroentscheidung, heute über DESIGN.md, PLATTFORM.md und die Handoffs geregelt) |                                     **139** |
| **als eigener Eintrag entbehrlich**                                                                               | **350 = 57 % der Einträge, 51 % der Bytes** |
| widersprüchlich (Merkmal quer zu den Klassen)                                                                     |                                     **120** |
| davon fachlich behalten, also neu zu fassen statt zu löschen                                                      |                                          59 |

**Was das fachlich behaltene Wissen ist** (260 Einträge, 470 KB):

| Wissen                | Einträge |
| --------------------- | -------: |
| DSGVO/Datenschutz     |       95 |
| Praxisprozess         |       66 |
| Recht                 |       39 |
| Abrechnung            |       23 |
| Aufbewahrung/Löschung |       20 |
| Sicherheit            |       15 |
| Technik               |        2 |

148 der 260 tragen „Prüfpaket“.

**Was das Löschen hemmt** (aus den vier Teilberichten):

- **Zitate im Code:** 608 der 610 Kennungen werden in `src`, `supabase`, `scripts` und `tests`
  4.814-mal zitiert, mit `.github/` sind es alle 610 (Zählung 5c; FAKTEN nannte 4.331 bei anderer
  Zählweise). Allein die 66 löschbaren Einträge aus Teil 2 haben 552
  Zitate.
- **Zitate in ADRs:** 96 Kennungen stehen in ADRs.
- **Verweise aus der DB:** `public.retention_classes.assumption_key` zeigt auf 35 Klassen-Anker
  (ANN-001, -013, -020, -026, -030, -126, -133, -142, -144, -189, -230, -246, -256, -579, -591,
  -597, -602, -607, -610, -619, -667 u. a.).
- **Der Kopf der Datei:** Er sagt „Kein Eintrag verschwindet“.

Löschen heißt deshalb: Die Kennung bleibt auflösbar, als Tabellenzeile mit Titel, Status und
Anker (5c, Schritt 2). Die Prosa geht nach Git. Ausgenommen sind die 101 fachlich behaltenen
Einträge außerhalb des Prüfpakets; sie bleiben als Kurzeintrag (5c, Nachtrag).

Die KB-Werte in den Teilberichten 3 und 4 stammen aus einer eigenen Bytezählung der Agenten und
weichen je Klasse um bis zu ≈ 1,2 KB ab. Maßgeblich ist die Gesamttabelle oben.

**Widersprüche in fachlich behaltenen Einträgen (59, Neufassung nötig):**

| Eintrag | Wissen                 | widerspricht                                                                                                                                                     |
| ------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ANN-003 | DSGVO_Datenschutz      | ADR-010 Punkt 16: appointment.updated nicht mehr im Katalog; intern: Wiedervorlage „Bestätigung steht aus“ vs. Abnahme 2026-10-02                                |
| ANN-011 | DSGVO_Datenschutz      | ADR-010 Punkt 16: prescription.viewed entfällt, nur noch „Akte geöffnet“ je Tag                                                                                  |
| ANN-021 | DSGVO_Datenschutz      | ADR-024 Punkt 6: Tagesplan liegt auf eingerichtetem Diensttelefon in IndexedDB (src/features/offline-documentation/tagesplan.ts); „kein Service Worker“ überholt |
| ANN-029 | Aufbewahrung_Loeschung | ADR-010 Punkt 18/ADR-008 Fassung 2: Lese- und Sicherheitsereignisse 12 Monate, Annahme sagt pauschal drei Jahre                                                  |
| ANN-030 | Aufbewahrung_Loeschung | ANN-579/ANN-591/ANN-597: Arbeitszeitabweichungen haben inzwischen Fristen (urlaub, arbeitszeit, zeitkonto)                                                       |
| ANN-033 | Recht                  | ANN-674: Titel „nur Patientenebene“, subject_type kennt staff_member; ANN-150 Fassung 2: mehrere Holds je Akte                                                   |
| ANN-034 | DSGVO_Datenschutz      | ADR-018 Fassung 4 Punkt 8: Constraint hat sechs Werte (patient_moved, practice_moved), Titel sagt vier                                                           |
| ANN-040 | DSGVO_Datenschutz      | ADR-010 Punkt 16: appointment.notified entfällt, Annahme sagt „auditiert“                                                                                        |
| ANN-043 | Sicherheit             | Code: /kennwort-neu entfiel mit SEC-EPIC-002 (supabase/config.toml Z. 49); Einlöseseiten sind /zugang und Einladung                                              |
| ANN-052 | Sicherheit             | ANN-230: patient_file.link_issued und storage_deletion.claimed nicht mehr im Katalog, Annahme nennt sie                                                          |
| ANN-057 | Praxisprozess          | ANN-230: in_the_past entfällt (0 Treffer in der Basis), Annahme nennt es                                                                                         |
| ANN-063 | Aufbewahrung_Loeschung | Code: Anker-Updates fehlen in der Basis; „-- ANN-063“ steht fachfremd vor appointment_directory (scripts/basis-migration.mjs Z. 348)                             |
| ANN-064 | Abrechnung             | ADR-020 Punkt 5: nennt prescribed_quantity die Terminzahl, Schema hat treatment_bases.appointment_count; ANN-210 ersetzt „größte Positionsmenge“                 |
| ANN-079 | Abrechnung             | ANN-215: Storno trotz stehender Zahlung (ABN-008); Annahme sagt „nicht stornierbar“                                                                              |
| ANN-081 | Abrechnung             | ADR-018 Punkt 3: Invariante „invoiced genau dann“; issue_invoice setzt nur billable_services.status                                                              |
| ANN-092 | DSGVO_Datenschutz      | intern: Titel „keine Auditzeilen“ vs. Fassung 2 (Abschnitt access_log in export_patient_record)                                                                  |
| ANN-093 | DSGVO_Datenschutz      | ADR-017 Punkt 57: Fotoeinwilligung nicht mehr angeboten; Code kennt vier Zwecke (message_attachments), Titel sagt zwei                                           |
| ANN-099 | Praxisprozess          | Code: psfs.json, nrs.json, globale_veraenderung.json stehen auf 0.1.0/aktiv false trotz Freigabe vom 2026-09-28                                                  |
| ANN-104 | Recht                  | Kopf ASSUMPTIONS.md Z. 51–53/69–72: Recht verlangt Zusatz „Prüfpaket“, Eintrag trägt „—“                                                                         |
| ANN-116 | DSGVO_Datenschutz      | ADR-010 Punkt 16: patient.updated nicht mehr im Auditkatalog                                                                                                     |
| ANN-133 | Aufbewahrung_Loeschung | ADR-010 Punkt 16: waitlist_entry.reviewed nicht im Katalog                                                                                                       |
| ANN-137 | DSGVO_Datenschutz      | ANN-230: Aufklappen schreibt nur „Akte geöffnet“ je Tag; appointment_brief.viewed nur noch als Abweisung                                                         |
| ANN-138 | DSGVO_Datenschutz      | ADR-010 Punkt 16: patient.updated nicht mehr im Katalog                                                                                                          |
| ANN-139 | DSGVO_Datenschutz      | Kopf ASSUMPTIONS.md Z. 51–53/69–72: Datenschutz verlangt Zusatz „Prüfpaket“, Eintrag trägt „erledigt“                                                            |
| ANN-144 | DSGVO_Datenschutz      | ADR-010 Punkt 16: appointment.call_recorded nicht mehr im Katalog                                                                                                |
| ANN-148 | Aufbewahrung_Loeschung | ANN-510: Versorgungsstatus entfällt; ANN-511: Abschluss ist nicht mehr alleiniger Fristanker                                                                     |
| ANN-150 | Recht                  | ANN-230: Nachweis ist patient_merge_records; intern: Annahme „Hold wird aufgehoben“ vs. Fassung 2 (mehrere Holds)                                                |
| ANN-156 | DSGVO_Datenschutz      | Titel „jeder Aufruf protokolliert“ vs. eigener LOG-EPIC-Vermerk und ADR-010 F3; DB-COMMENT list_revenue_by_staff veraltet                                        |
| ANN-157 | Praxisprozess          | „jede Änderung protokolliert“ vs. ADR-010 F3: set_staff_compensation_model schreibt kein Audit                                                                   |
| ANN-174 | DSGVO_Datenschutz      | „protokolliert training_relationship.updated“ vs. ADR-010 F3 (nur noch Operationsname bei access.denied)                                                         |
| ANN-179 | Praxisprozess          | „jede Änderung steht im Protokoll“ vs. ADR-010 F3 (training_basis.* nur Operationsname)                                                                          |
| ANN-180 | DSGVO_Datenschutz      | Titel „nur Trainingstermine“ vs. eigene Fassung 2 (list_busy_blocks); Leseprotokoll per LOG-EPIC geändert                                                        |
| ANN-181 | Abrechnung             | Einzelstundenregel im Paketzeitraum durch ANN-279 eingeschränkt, im Eintrag nur als Abnahmesatz                                                                  |
| ANN-182 | DSGVO_Datenschutz      | „ohne Anschrift ausgestellt“ und „Zeile ungeteilt“ vs. eigene Fassung 2 und ANN-177 Fassung 2                                                                    |
| ANN-185 | Praxisprozess          | Titel „kein Korrekturweg in V1“ vs. eigene Fassung 2 (Nachtrag); training_protocol.addendum_created fehlt im Katalog                                             |
| ANN-186 | Praxisprozess          | training_protocol.discarded fehlt im Katalog (0 Treffer im Code); Annahme „nicht im Löschjournal“ vs. Fassung 2                                                  |
| ANN-189 | Aufbewahrung_Loeschung | Titel „Löschlauf entfernt Konto selbst“ vs. Umsetzung ABN-011 (Löschauftrag, ANN-217); Lesefrist ab Abo-Ende (ANN-274) fehlt                                     |
| ANN-191 | Sicherheit             | Titel „bestätigt mit Kennwort“ vs. ADR-023 F4 und ADR-025 P9; B13-Absatz durch ANN-331 überholt                                                                  |
| ANN-204 | DSGVO_Datenschutz      | „neues Kennwort nur vor Ort“ vs. ADR-023 F4 (Passkey, kein Kennwort)                                                                                             |
| ANN-213 | Abrechnung             | appointment.fee_waived fehlt im 27er-Katalog (fee_waived_by trägt es, auch ADR-018 P8.6 veraltet); Anker AppointmentDetailPage.tsx tot                           |
| ANN-214 | DSGVO_Datenschutz      | Titel „behandelnde Rollen“ vs. eigene Umsetzung ABN-031 (alle Praxisrollen); Auditsatz vs. ADR-010 F3; ohne Prüfpaket                                            |
| ANN-226 | Praxisprozess          | „staff_member.updated im Protokoll“ vs. ADR-010 F3 (nur Operationsname bei access.denied)                                                                        |
| ANN-227 | Praxisprozess          | „Fotoeinwilligung muss erfassbar bleiben“ vs. ANN-316 und ADR-017 Punkt 57 (nicht mehr angeboten)                                                                |
| ANN-242 | DSGVO_Datenschutz      | Kategorie Datenschutz ohne Prüfpaket (Kopfregel der Datei)                                                                                                       |
| ANN-245 | DSGVO_Datenschutz      | Kategorie Datenschutz ohne Prüfpaket (Kopfregel der Datei)                                                                                                       |
| ANN-249 | DSGVO_Datenschutz      | Titel „protokolliert als patient_file.downloaded“ vs. ADR-010 F4 P22 und ADR-023 F3 P24; ohne Prüfpaket                                                          |
| ANN-257 | Sicherheit             | Titel „Freigabe mit Kennwort“ vs. ADR-025 F2 Punkte 7 und 9; Lücke (1) überholt                                                                                  |
| ANN-266 | Praxisprozess          | „Benachrichtigungen fehlen bis ADR-024“, ADR-024 ist seit 2026-10-11 angenommen                                                                                  |
| ANN-281 | Recht                  | „Einen Kaufknopf gibt es nicht“ vs. ANN-288 („Zahlungspflichtig buchen“ im Konto seit KND-003)                                                                   |
| ANN-291 | DSGVO_Datenschutz      | Zugang ohne Einladung vs. ADR-023 Punkte 7 und 11; nach Rang aufgelöst, ADR nicht nachgezogen                                                                    |
| ANN-306 | DSGVO_Datenschutz      | „im Training lesen owner und Trainingsbetreuung“ vs. ANN-298-Abnahme, ANN-315 und ADR-021 P10                                                                    |
| ANN-311 | DSGVO_Datenschutz      | Begründung „Büro liest Sonstiges im Training nicht“ vs. eigene Fassungen 2 und 3; ohne Prüfpaket                                                                 |
| ANN-312 | Aufbewahrung_Loeschung | retention_classes.patientenkommunikation trägt ANN-001 statt ANN-312                                                                                             |
| ANN-329 | Sicherheit             | ADR-025: Restlücke dort „eigene“, hier „fremde“ Passkeys löschbar                                                                                                |
| ANN-386 | Recht                  | ANN-539: „und -bilder“ gegenstandslos, Übungen haben keine Bilder                                                                                                |
| ANN-541 | Recht                  | ADR-009 Punkt 15: ermäßigtes Kennzeichen ohne Verordnung angelegt (7 %); ANN sagt 19 %, kein Kennzeichen, Pfad je Grundlage                                      |
| ANN-598 | Praxisprozess          | ANN-616: Büro sieht Tourenanträge ohne km und Betrag; hier „owner und Büro sehen alle“ ohne Hinweis                                                              |
| ANN-622 | Abrechnung             | ANN-664: Erfassung am Termin gebaut (Constraint appointments_nutrition_occasion); Titel/Annahme sagen „noch ohne Erfassung“                                      |
| ANN-662 | Praxisprozess          | ADR-024 Punkt 15: höchstens eine je Art und Tag, „darüber nichts“; hier bis vier am Tag, außerhalb der Wochengrenze                                              |

#### 5b.1 Teil 1: ANN-001 bis ANN-153

| Klasse             | Einträge |       Bytes | Anteil Bytes | davon Prüfpaket |
| ------------------ | -------: | ----------: | -----------: | --------------: |
| fachlich_behalten  |       68 |     162 292 |         47 % |              43 |
| rein_technisch     |       32 |      62 325 |         18 % |               0 |
| veraltet           |       22 |      50 044 |         15 % |               5 |
| oberflaeche_detail |       17 |      34 547 |         10 % |               0 |
| redundant          |       14 |      33 221 |         10 % |               7 |
| **gesamt**         |  **153** | **342 429** |              |          **55** |

- **Was übrig bleibt:** 85 von 153 Einträgen (180 KB, 53 %) enthalten kein Wissen, das nicht schon in Code, Tests, einem ADR oder einer späteren ANN steht. 50 Einträge widersprechen mindestens einer anderen Stelle. 27 davon sind fachlich_behalten und brauchen deshalb eine Neufassung, keine Löschung.
- **Fassung angehängt statt ersetzt:** 45 Einträge tragen eine „Fassung 2/3“. Bei 14 hat Jannes' Abnahme die Regel geändert (ANN-019, -040, -044, -047, -053, -079, -089, -092, -105, -119, -120, -126, -128, -150). Titel und Annahme-Absatz nennen dort weiter die alte Regel. Beispiele: ANN-119 „Tippfehler bleiben stehen“, korrigiert seit Version 1.0.1. ANN-092 „Zugriffsprotokoll nicht Teil der Auskunft“, `access_log` steht in `export_patient_record`. ANN-019 „verfällt nach 30 Minuten“, `src/lib/abstecher.ts` hat keine Frist.
- **LOG-EPIC-001 nur halb nachgezogen:** `supabase/audit-aktionen.txt` führt 27 Aktionen (ADR-010 Punkt 16). Nur 14 Einträge tragen eine LOG-EPIC-Notiz im Kopf. Mindestens 9 weitere nennen ohne Notiz Aktionen, die die Basis nicht mehr schreibt (0 Schreibstellen): `patient.updated` (ANN-116, -138), `appointment.call_recorded` (-144), `patient_file.assigned` (-141), `waitlist_entry.reviewed` (-133), `prescription.viewed` (-011), außerdem ANN-003, -004 und -053. Die Notiz „gegenstandslos – Einstellungen und Arbeitszeiten“ steht fälschlich bei ANN-001. Bei ANN-004, um das es geht, fehlt sie. Der Kommentar an `set_appointment_grid` (Basis Z. 46035) behauptet weiter ein Audit.
- **Spätere Grundsatzentscheidungen ohne Rückwirkung:** ANN-510/-511 machen ANN-032 und ANN-148 hinfällig (Fristanker). ANN-513 macht ANN-072 und ANN-140 hinfällig (Leistung erst mit Haken). ADR-024 Punkt 6 widerspricht ANN-021 und ANN-110: Es gibt einen Service Worker, und der Tagesplan liegt in IndexedDB (`src/features/offline-documentation/tagesplan.ts`). ADR-017 Punkt 57 (keine Fotoeinwilligung mehr) überholt ANN-093, -126 und -127. ANN-229 (Diagnose auf der Rechnung) überholt ANN-077.
- **Text weicht vom Code ab:**
  - ANN-034 nennt „vier Absagegründe“, der Constraint hat sechs.
  - ANN-153 schließt „verlegt“ aus, `get_practice_statistics` zählt `patient_moved` mit.
  - ANN-099 meldet PSFS als gestrichen und NRS/Veränderungsfrage am 2026-09-28 als 1.0.0 freigegeben. Alle drei Dateien stehen aber auf `0.1.0`, `aktiv: false`, und `psfs.json` liegt noch da. Das ist ein offener Auftrag, kein Altbestand.
  - ANN-043 nennt `/kennwort-neu`, das entfallen ist (`supabase/config.toml` Z. 49).
  - Umgekehrt hinken die ADRs hinterher: ADR-020 Punkt 5 ist gegenüber ANN-064 veraltet (die Terminzahl liegt in `treatment_bases.appointment_count`), ADR-018 Punkt 3 gegenüber ANN-081 (`issue_invoice` setzt `invoiced` nie am Termin).
- **Scheinanker:** `scripts/basis-migration.mjs` Z. 343–362 setzt für 18 Annahmen, deren einziger Anker ein Kommentar in einer alten Einzelmigration war, „-- ANN-…“ vor ein Objekt der Basis. Im Abschnitt landet der Kommentar fachfremd: ANN-004 vor `practice_targets`, ANN-049 vor `app.appointment_window_options`, ANN-063 vor `appointment_directory`. Die Anker-Prüfung bleibt grün, obwohl die Regel von ANN-063 (Löschjournal beim Umbenennen einer Tabelle) nirgends mehr im Code steht.
- **Prüfpaket mit Altlast:** 5 veraltete Einträge stehen weiter als „entschieden (Jannes) · Prüfpaket“ und blockieren damit formal den Produktivstart (Kopf Z. 79–83): ANN-004, -027, -031, -065, -126. Umgekehrt fehlen ANN-104 (Recht, Zusatz „—“) sowie ANN-134 und -139 (Datenschutz, „erledigt“) im Prüfpaket, obwohl Z. 51–53 und 69–72 es verlangen. Vor dem Löschen beachten: `public.retention_classes.assumption_key` verweist auf ANN-001, -013, -020, -026, -030, -126, -133, -142 und -144.
- **Präzisierung zu FAKTEN:**
  - Im Abschnitt sind 152 von 153 Einträgen größer als 1 KB und 17 größer als 3 KB (größter: ANN-021 mit 4 332 B).
  - 110 Anker in 101 Einträgen zeigen auf Einzelmigrationen.
  - `ann.json` führt global 26 fehlende Pfade außerhalb von `supabase/migrations/`. 14 davon sind nur Kurznamen von Migrationen (im Abschnitt ANN-004 ×2, -037, -093). Tote TS-Pfade gibt es 12, nicht 10. 6 davon liegen im Abschnitt: `AppointmentDetailPage.tsx` bei ANN-048, -051, -055, `PatientDatenschutzPage.tsx` bei ANN-127, `HeilmittelBestaetigen.tsx` bei ANN-140.
  - Tote Funktionen im Abschnitt: 3 (ANN-002, -038, -143).

#### 5b.2 Teil 2: ANN-154 bis ANN-320

| Klasse             | Einträge |                         Bytes | Beispiele                                  |
| ------------------ | -------: | ----------------------------: | ------------------------------------------ |
| fachlich_behalten  |       87 |                       175.755 | ANN-183, 208, 247, 261–285, 288–291        |
| oberflaeche_detail |       22 |                        36.878 | ANN-192–199, 252–254, 260, 267             |
| rein_technisch     |       21 |                        37.720 | ANN-187, 197, 219, 238, 295, 299           |
| redundant          |       14 |                        27.300 | ANN-184, 230–233, 287, 293, 298, 315, 316  |
| veraltet           |        9 |                        18.138 | ANN-175, 177, 207, 209, 218, 221, 224, 305 |
| **Summe**          |  **153** | **295.791** (31 % der 953 KB) | 66 löschbar = 120.036 Bytes (41 %)         |

- **Korrekturen zu FAKTEN/ann.json:** Die Kennungen ANN-158 bis 171 fehlen. Die Zusatzwerte „Kopf, Reiter und Hinweis)“ und „Tageskarte: Doku zusammenführen)“ sind Parse-Fehler, weil die Instanz ein „·“ enthält; ANN-224 und 225 stehen auf `erledigt`. ANN-231 und 232 haben gar keinen Zusatz. Neunmal steht „Änderung BEF-13x“ als Zusatz. Tote TS-Anker gibt es nur in ANN-198 und 213 (`AppointmentDetailPage.tsx/.test.tsx` gibt es nicht mehr, heute `TerminAktionen`). Die drei übrigen Treffer sind Namen von Migrationsdateien ohne Pfad. Alle 128 Migrationspfade in 117 Einträgen zeigen auf die Zeit vor der Basis. Nur zwei Anker zeigen auf Funktionen, die es nicht mehr gibt (ANN-177 `split_street_and_house_number`, ANN-207 `note_companion_capacity_doubt`); die Einträge sagen das selbst. Die übrigen 56 geprüften Ankerfunktionen gibt es im Katalog.
- **Nachtrag statt Neufassung:** 35 Einträge haben einen Abnahme-Absatz, 13 davon mit „anders entschieden/geändert“. In 14 Einträgen widerspricht der Titel dem eigenen Nachtrag, z. B. ANN-185 („kein Korrekturweg“, es gibt aber den Nachtrag), ANN-191 und 257 („Kennwort“, nach ADR-025 F2 gibt es keins), ANN-249 („protokolliert“, laut ADR-010 P22 nicht), ANN-287/293/298 („Büro sieht nicht“, nach ADR-021 P10 F3 liest es). Eine formale Ablösung gibt es nur zweimal (221→316, 305→357). ANN-224 fehlt der Gegenvermerk zu ANN-227.
- **Altlast im Auditlog:** 16 Einträge nennen Aktionen, die nicht unter den 27 von `audit_log_action_check` stehen (z. B. ANN-186 `training_protocol.discarded`, 213 `appointment.fee_waived`, 226 `staff_member.updated`). Neun davon haben keinen Vermerk zu LOG-EPIC-001 (157, 174, 179, 185, 186, 212, 213, 214, 226). Die Altlast steckt auch im Code: Die DB-COMMENTs von `list_revenue_by_staff`, `set_practice_target` und `waive_appointment_fee` versprechen ein Protokoll, das laut `pg_get_functiondef` keine der Funktionen schreibt. `v_aktion` in `public.update_appointment` wird gesetzt und nie gelesen. ADR-018 P8.6 nennt `appointment.fee_waived` noch. ANN-230 spricht von 26 Aktionen, ADR-010 P16 von 27.
- **Lücken im Prüfpaket:** Acht Datenschutz-Einträge tragen kein `Prüfpaket` (ANN-214, 218, 242, 245, 249, 256, 287, 311). Der Grep aus dem Dateikopf findet sie deshalb nicht. ANN-255 bis 260 tragen `entschieden (Claude)`, die Kategorien „Prozess“ (198, 201) und „Oberfläche“ (199, 202, 234) haben ANN-198 bis 202 und 234; beides kennt der Kopf der Datei nicht. ANN-230 sagt „in ADR überführt“, hat aber den Status `entschieden (Jannes)`.
- **Widersprüche zwischen Einträgen:** ANN-227↔316 (Fotoeinwilligung), 281↔288 (Kaufknopf), 244↔314 (Vorschau), 196/238↔240 (Garage), 306↔298/315 (Büro liest Einheiten), 182↔177 F2 (Hausnummer), 218↔331 (Wiederherstellung), 189↔274 (Lesefrist ab Abo-Ende). ANN-291 weicht bewusst von ADR-023 P7/P11 ab, ohne dass es eine neue ADR-Fassung gibt.
- **Redundanz ballt sich** an wenigen ADR-Stellen: Leserecht im Training (184, 287, 293, 298, 315 → ADR-021 P10 F3), Terminhonorar (231–233 → ADR-009 P5/22/23), ADR-017 F4 (223, 316), ADR-010 F3 (230), ADR-025 (256). Der fachliche Kern liegt in Block 5 (ANN-261–291: Abo, Paket, Vertrag, Widerruf): 28 von 31 Einträgen sind behalten, 12 davon Recht (§§ 188, 312k, 356a BGB, §§ 14, 14c UStG). ADR-009 P21 gibt dafür nur den Rahmen.
- **Was das Löschen hemmt:** Die 66 löschbaren Einträge werden 552-mal im Code zitiert (Summe `codeRefs`, z. B. ANN-230 51-mal, ANN-293 45-mal). Datenklassen führen ANN-189, ANN-230 (dreimal), ANN-246 und ANN-256 als `assumption_key`. ADR-024 und ADR-001 verweisen auf ANN-305, 319 und 320 als Quelle. Der Dateikopf sagt selbst „Kein Eintrag verschwindet“. Außerdem trägt `retention_classes.patientenkommunikation` die Kennung ANN-001, obwohl die Regel aus ANN-312 stammt.

#### 5b.3 Teil 3: ANN-321 bis ANN-559

| Klasse             | Einträge |   KB | davon Prüfpaket |
| ------------------ | -------: | ---: | --------------: |
| fachlich_behalten  |       51 | 83,1 |              21 |
| oberflaeche_detail |       47 | 37,7 |               0 |
| redundant          |       25 | 27,3 |               6 |
| rein_technisch     |       20 | 26,1 |               1 |
| veraltet           |       10 |  9,8 |               1 |

- **Statuszeilen verletzen den Kopf der Datei:** 16 Einträge tragen `entschieden (Claude)`, den der Lebenszyklus nicht kennt (ANN-324 bis ANN-338, ANN-342). 4 Technik-Einträge stehen im Prüfpaket (ANN-324, -325, -327, -328). Dagegen fehlen 5 Datenschutz-Einträge im Prüfpaket und damit im `grep … Prüfpaket` (ANN-342 „erledigt“; ANN-358, -360, -361, -501 „—“). ANN-381, -480 und -539 haben „—“ statt „erledigt“. 42 Einträge haben die Kategorie „Oberfläche“, die keine der vier erlaubten ist. 70 offene Einträge außerhalb von Datenschutz und Recht haben trotz der Regel „offen ohne Wiedervorlage“ eine Wiedervorlage. ANN-321, -322 und -323 stehen auf `offen`, obwohl der Text „Entscheidung Jannes 2026-10-09“ nennt.
- **1-KB-Regel (seit 2026-10-12) nicht eingehalten:** 34 Einträge ab diesem Datum sind größer, vor allem der Block ANN-343 bis ANN-371 (bis 3,8 KB: ANN-370, ANN-362). Ab ANN-380 liegen die Einträge meist unter 1 KB.
- **ADR nachgezogen, ANN bleibt stehen:** ANN-511 steht in ADR-008 Punkt 11, ANN-512 in ADR-018 Punkt 10, ANN-513 bis -515 in ADR-009 Punkt 24 und ADR-020 Punkt 9, ANN-525 bis -529 in ADR-023 Punkt 25. ANN-332, -334, -338 und -371 stehen in ADR-017 Abschnitt L bzw. Fassung 6, ANN-400 bis -407 in DESIGN.md 9.x (DESIGN.md verweist auf die Kennungen).
- **Überholt, aber ohne Ablösungsvermerk:** ANN-356 („keine Kurve“, Tabelle) wird von ANN-364 und ANN-367 (Punktbild) überholt. ANN-481 begründet mit „Festschreiben schließt ab“, das ANN-512 aufhebt. ANN-478 nennt noch die Heilmittelbestätigung, die ANN-513 abgeschafft hat. ANN-485 nennt „Nicht in Versorgung“, das nach ANN-510 nicht mehr existiert. ANN-386, -388 und -404 sprechen von Bildern bzw. Figuren, die es seit ANN-539 nicht mehr gibt. Die Gruppenliste in ANN-450 weicht von `OpenPointsPage.tsx` ab.
- **Harte Widersprüche:**
  - ANN-371: Titel und Fassung-1-Text sagen „Standard aus“. Der Spaltendefault `organizations.external_attachments_enabled` ist aber `true`, wie Fassung 2 und ADR-017 Fassung 6 es vorsehen.
  - ANN-541 steht gegen ADR-009 Punkt 15. Das ermäßigte Kennzeichen (7 %) für Behandlungen ohne Verordnung ist angelegt und durch den Constraint `service_catalog_items_reduced_rate_not_activated` gesperrt. ANN-541 sagt dagegen „wohl 19 %“, „kein Kennzeichen“ und schlägt ein Kennzeichen je Grundlage statt je Posten vor.
  - DESIGN.md 9.10 nennt weiter „Dosierung als Tile-Reihe“, ANN-466 und der Code nutzen `Dosierungsmarken`.
  - ANN-329 spricht von „fremden“ Passkeys, ADR-025 von „eigenen“.
- **Code-Reste verworfener Annahmen:**
  - `app.exercise_illustration_bases` ist verwaist; sein Kommentar zeigt auf die gelöschte `bild/schema.ts`.
  - `--color-figur-*` in `src/index.css` lesen nur noch `designsystem.test.ts` und `kontrast.test.ts`.
  - `-- ANN-480` steht vor `CREATE TABLE exercise_plan_items` (basis.sql:5840), `-- ANN-483` vor `CREATE TABLE appointments` (basis.sql:8738). Beide setzt `scripts/basis-migration.mjs`, obwohl beide Annahmen verworfen sind.
- **Anker:** 58 der 153 Einträge zeigen auf Einzelmigrationen, die es nur noch in der Basis gibt. 3 Einträge zeigen auf gelöschte TS-Dateien (ANN-381, -475, -480). Von 41 geprüften DB-Funktionen existieren 39; die fehlenden zwei hat ANN-510 bewusst entfernt. Werkzeugdetails, die laut CLAUDE.md keine Annahme sind: ANN-559 (SSH-Versuche), ANN-380 (Seed).
- **Präzisierung FAKTEN (Querschnitt Patientendaten):** Die Heuristik in `registry2.json` kennt `export_training_record` nicht. `training_course_events`, `training_assessments` und `training_assessment_results` stehen dort (laut `pg_proc.prosrc`) und fallen mit dem Trainingsverhältnis (`retention_assignments`: `ueber_elterndatensatz`). `notification_deliveries` fällt bewusst ohne Journal über `purge_notification_deliveries` (Klasse `benachrichtigung`, ANN-345). Für diese vier Tabellen ist „von keiner der vier berührt“ also keine Lücke.

#### 5b.4 Teil 4: ANN-560 bis ANN-731

| Klasse             | Einträge |   KB | davon Prüfpaket |
| ------------------ | -------: | ---: | --------------: |
| fachlich_behalten  |       54 | 48,2 |              37 |
| oberflaeche_detail |       53 | 43,0 |               1 |
| rein_technisch     |       30 | 23,9 |               4 |
| redundant          |       10 |  8,7 |               6 |
| veraltet           |        4 |  4,2 |               0 |

- **Fachlicher Kern sind die Beschäftigtendaten.** ANN-576 bis ANN-608 sowie ANN-615 bis -617, -674 und -675 regeln Urlaub, ArbZG-Grenzen, Zeitkonto, Erstattungen, IBAN und Barometer. Die Fristen für Urlaub, Arbeitszeit, Zeitkonto und Erstattungen fehlen in der Fristentabelle von ADR-008 (Zeilen 86–105). Sie stehen nur in diesen Einträgen und in `retention_classes`, deren `assumption_key` auf ANN-579, -591, -597 und -602 zeigt; die DB-Werte stimmen mit dem Text überein (3 J., 1 J., 8 J.).
- **UI-Handoffs als Annahmen:** 53 Oberflächendetails, eingeordnet als `Technik` (35) oder `Praxisprozess` (18). Die Kategorie „Oberfläche“ kommt im Abschnitt nicht mehr vor. Ab ANN-678 (Zeile 7016) sind 36 von 50 Einträgen Mikroentscheidungen aus den Plattform-Handoffs vom 22. und 24.10. (ANN-692 bis -731). PLATTFORM.md fasst 14 davon mit Kennung zusammen, ANN-699 bis -701 über den Bereich „ANN-698 bis ANN-702“.
- **Statuszeilen verletzen den Kopf der Datei:**
  - ANN-670 und -671 haben den unbekannten Status `vorläufig` mit Instanz „offen“.
  - 7 Einträge außerhalb von Datenschutz/Recht tragen `Prüfpaket` (ANN-589, -590, -594, -595, -664, -670, -671). ANN-562 (Recht, offen) fehlt dagegen im Prüfpaket.
  - 10 Einträge mit `entschieden (Jannes)` haben „—“ statt „erledigt“ (ANN-565 bis -568, -570, -571, -663, -684, -688, -701).
  - 8 offene Einträge haben eine Instanz („Claude“: ANN-609 bis -614, -664, -665).
  - 15 offene Einträge außerhalb von Datenschutz/Recht haben eine Wiedervorlage.
  - ANN-674, -675, -682 und -702 stehen auf `offen`, obwohl der Text eine Entscheidung von Jannes nennt.
- **Ablösungen nur einseitig vermerkt:** ANN-611, -612 und -614 nennen „abgelöst durch ANN-641/642/644/646/647“, aber keiner dieser Nachfolger trägt „ersetzt“. ANN-614 löst die Öffnung aus ANN-314 ab, ANN-314 hat keinen Vermerk.
- **Harte Widersprüche:**
  - ANN-662 hebt für Tagebuch-Erinnerungen die Grenze „höchstens eine je Art und Tag, darüber nichts“ aus ADR-024 Punkt 15 auf: bis vier am Tag, außerhalb der Zehn-pro-Woche-Grenze. Damit setzt eine Annahme (Rang 4) einen ADR außer Kraft.
  - ANN-612 und -614 erklären „keine Anhänge“ ausdrücklich für weiter gültig. ANN-652 bis -655 und ADR-017 Punkte 71–87 bauen aber Anhänge und Sprachnachrichten.
  - ANN-622 sagt „noch ohne Erfassung am Termin“; ANN-664 und der Constraint `appointments_nutrition_occasion` setzen die Erfassung um.
  - ANN-610 sagt „Kanäle bleiben“; nach ANN-642 fallen private Kanäle ohne aktives Mitglied.
  - ANN-598 sagt „Büro sieht alle Erstattungen“; ANN-616 schränkt das für Touren ein, ohne dass ANN-598 darauf verweist.
  - Der Änderungspfad von ANN-563 nennt `TIPPSPERRE_MS` in `CheckupFenster`. Die Konstante steht heute in `src/components/ui/GefuehrterAblauf.tsx:22`.
- **Inhalt steht schon im ADR, die ANN bleibt stehen:**
  - ANN-610 in ADR-008 Punkt 12.
  - ANN-654, -655 und -672 in ADR-017 Punkten 74, 84/87 und 96 sowie ADR-010 Fassung 5.
  - ANN-603 in ADR-024 Punkt 12 und PROJECT_PRINCIPLES §20.2 Nr. 2; ANN-608 in §20.2.
  - ANN-572 im Abschnitt „Geführter Ablauf“ von DESIGN.md.
  - Doppelte Einträge: ANN-695 = ANN-685, ANN-726 = ANN-712; der Datenschutzteil von ANN-640 = ANN-609.
- **Rückverweise verhindern einfaches Löschen:** 31 Kennungen werden aus ADR-008, -010, -013, -017, -024, PROJECT_PRINCIPLES, DESIGN.md, PLATTFORM.md, DEVELOPMENT.md oder Handoffs zitiert. 8 Kennungen stehen in `retention_classes.assumption_key` (ANN-579, -591, -597, -602, -607, -610, -619, -667). Dazu kommen 1.119 Zitate in src/, supabase/, scripts/ und tests/ (Summe `codeRefs`).
- **Präzisierungen zu FAKTEN und ann.json:**
  - `codeRefs = 0` für ANN-564 ist ein Messartefakt: Die Kennung steht in `.github/workflows/test-umgebung.yml:367`, und der Ordner wird nicht gezählt.
  - Der Parser findet 11 Migrationsanker vor der Basis. Tatsächlich sind es 17: ANN-568, -655, -656, -666, -667 und -668 nennen die Migration nur über Zeitstempel oder Story-Kennung.
  - Geprüft wurden 102 Ankerfunktionen in der DB und 50 TS-Symbole. Alle existieren außer den zwei bewusst entfernten Funktionen von ANN-599.
  - 21 Nummern wurden nie vergeben (ANN-623 bis -639, -718, -719, -728, -729; `git log -S` liefert nichts).
  - 24 Einträge sind größer als 1 KB, obwohl die Regel seit 12.10. gilt (am größten ANN-679 mit 1,4 KB, ANN-687 und ANN-614 mit je 1,3 KB).
  - ANN-571 nennt „13 von 52 Spezifikationen“; heute gibt es 58 Spec-Dateien in `tests/e2e`.
  - ANN-564 und ANN-571 sind Werkzeugdetails, die laut CLAUDE.md keine Annahme sein sollen.

### 5c Doku-Struktur und Zielstruktur unter 10.000 Zeilen

Stand Commit `3c5e72b`. Gemessen mit `git ls-files '*.md'` (145 Dateien), `wc -l` und `wc -c`. Skripte zur Zuordnung: `analyse/s5c/kat.mjs`, `analyse/s5c/links.mjs`.

#### Bestand nach Ordner

| Ordner                                                          | Dateien |     Zeilen |       KiB | B/Zeile |
| --------------------------------------------------------------- | ------: | ---------: | --------: | ------: |
| docs/development/archiv (davon abnahme/ 5 Dateien, 4.946 Z.)    |      17 |     10.370 |       793 |      78 |
| docs/decisions                                                  |       7 |      9.584 |     1.149 |     123 |
| docs/adr                                                        |      28 |      8.686 |       562 |      66 |
| docs/product (davon ideen/ 15 Dateien, 4.839 Z.)                |      19 |      5.460 |       280 |      52 |
| docs/design (davon review-2026-10/ 9 Dateien, 1.796 Z.)         |      21 |      4.980 |       438 |      90 |
| docs/development ohne archiv                                    |      11 |      2.856 |       419 |     150 |
| Wurzel (PROJECT_PRINCIPLES, CLAUDE, README)                     |       3 |      1.928 |        87 |      46 |
| docs/ (DEVELOPMENT, PRINCIPLES-CHRONIK, PRODUCT_VISION, STATUS) |       4 |      1.608 |        96 |      61 |
| quellen/                                                        |       4 |      1.229 |        57 |      47 |
| docs/sichtung                                                   |      15 |        800 |       309 |     396 |
| docs/datenschutz, docs/betrieb                                  |       4 |        469 |        31 |      68 |
| .claude (6 Skills, 3 Agenten)                                   |       9 |        441 |        26 |      60 |
| marke/README, 2 READMEs unter src/                              |       3 |        311 |        27 |      89 |
| **Summe**                                                       | **145** | **48.722** | **4.274** |  **90** |

#### Bestand nach Dokumentart

| Art                                                                                                                          | Dateien | Zeilen | Anteil | KiB |
| ---------------------------------------------------------------------------------------------------------------------------- | ------: | -----: | -----: | --: |
| ADR mit Index                                                                                                                |      28 |  8.686 | 17,8 % | 562 |
| Annahmen (ASSUMPTIONS.md)                                                                                                    |       1 |  7.620 | 15,6 % | 994 |
| Archiv und Abnahmen, ohne Befunde                                                                                            |      15 |  7.213 | 14,8 % | 487 |
| Produktideen (ideen/, IDEENSPEICHER)                                                                                         |      16 |  5.123 | 10,5 % | 253 |
| Design-Handoffs und Reviews                                                                                                  |      18 |  4.589 |  9,4 % | 409 |
| Befunde (BEFUNDE, archiv/BEFUNDE-ERLEDIGT 2.054, archiv/BEFUNDE-LOESUNGEN 1.103)                                             |       3 |  3.886 |  8,0 % | 363 |
| Roadmap, Status, Chroniken (ROADMAP 1.021, PRINCIPLES-CHRONIK 719, ROADMAP-CHRONIK 211, ARBEITSBEREICHE, STATUS, AUFRAEUMEN) |       6 |  2.088 |  4,3 % | 357 |
| Offene Entscheidungen, Anfragen, Optionspapiere, Providerprüfungen                                                           |       6 |  1.964 |  4,0 % | 155 |
| Prinzipien                                                                                                                   |       1 |  1.754 |  3,6 % |  77 |
| quellen/                                                                                                                     |       4 |  1.229 |  2,5 % |  57 |
| Sichtung                                                                                                                     |      15 |    800 |  1,6 % | 309 |
| Loop-Vorgaben (PLATTFORM-ANSICHTEN 424, FRB-BAUSTEINE-UND-SCORES 233, MAP-LOOPS 134)                                         |       3 |    791 |  1,6 % |  51 |
| Entwicklungsanleitung (DEVELOPMENT.md)                                                                                       |       1 |    680 |  1,4 % |  39 |
| Agentensteuerung (CLAUDE.md, Skills, Agenten)                                                                                |      10 |    550 |  1,1 % |  33 |
| Produktvision, Kernabläufe, Startinhalt                                                                                      |       4 |    493 |  1,0 % |  39 |
| Designregeln (DESIGN, PLATTFORM, leitfaden-schlank)                                                                          |       3 |    391 |  0,8 % |  28 |
| README (Wurzel, marke, src)                                                                                                  |       4 |    376 |  0,8 % |  30 |
| Datenschutz                                                                                                                  |       2 |    249 |  0,5 % |  18 |
| Betrieb                                                                                                                      |       2 |    220 |  0,5 % |  13 |
| Weiterleitungen (GRAPH-ENGINEERING-WORKFLOW, UMBAU, SESSION-START)                                                           |       3 |     20 |  0,0 % |   1 |

- **Ein Drittel ist Geschichte:** Archiv 7.213, Befunde-Archiv 3.157, Chroniken 930, Handoffs und Reviews 4.589, Weiterleitungen 20. Zusammen sind das 15.909 Zeilen (32,7 %).
- **Zeilen täuschen:** docs/sichtung hat 800 Zeilen, aber 309 KiB. ROADMAP-CHRONIK hat 211 Zeilen und 158.537 B, ihre längste Zeile 4.482 Zeichen. archiv/STATUS-bis-2026-10-12.md hat 64 Zeilen und 48.526 B, darin eine Zeile mit 27.463 Zeichen. Ein Ziel in Zeilen braucht daneben eine Bytegrenze. Genau deshalb gibt es Regel E (scripts/docs-check-regeln.mjs Z. 28–31).
- **Präzisierung FAKTEN:**
  - ASSUMPTIONS.md hat 1.017.934 B (994 KiB). Die „953 KB“ aus FAKTEN sind die Summe der Eintragsbytes ohne Vorspann (953.349 B).
  - `wc -l` liefert 48.721 Zeilen, aufraeumen.mjs 48.722. Grund: docs/product/ideen/referenz-wettbewerb.md endet ohne Zeilenumbruch.
  - `public.retention_classes` hat **41** Zeilen, nicht 45. retention_assignments hat 183 Zeilen mit 41 verschiedenen Klassen auf 151 Tabellen.
  - Eigene Zählung der ANN-Zitate in src/, supabase/, scripts/ und tests/: 4.814 Treffer in 4.515 Zeilen, 608 Kennungen. Mit .github/ sind alle 610 Register-Kennungen zitiert. FAKTEN nennt 4.331 Zitate und 606 Kennungen, offenbar mit anderer Zählweise.

#### Woher die 54.000 kommen

Es fehlt kein Markdown: `find` außerhalb von node_modules findet dieselben 145 Dateien. Die Differenz von rund 5.300 Zeilen steckt in Textdateien, die aufraeumen.mjs (`kategorie()`, Z. 41–48) unter „Rest“ zählt.

| Quelle                                                        | Zeilen |
| ------------------------------------------------------------- | -----: |
| Markdown (Zählweise aufraeumen.mjs)                           | 48.722 |
| docs/development/fortschritt.json                             |  1.980 |
| quellen/**/*.txt (27 PDF-Extrakte)                            |  2.743 |
| docs/design/lastenrad-3d/kanvas: 6 × .dc.html und canvas.json |  3.472 |
| docs/product/kanvas/own-motion-praxis.html                    |    384 |
| supabase/audit-aktionen.txt                                   |     36 |

Zwei Zählweisen treffen „54.000“:

- **(a)** Markdown plus alle Textdateien unter docs/: 48.722 + 5.836 = 54.558.
- **(b)** Markdown plus .txt und .json unter docs/ und quellen/: 53.531.

Welche der Auftraggeber benutzt hat, lässt sich nicht bestimmen. Ein naives `wc -l` über alle Dateien passt nicht, weil es Zeilenumbrüche in Binärdateien mitzählt: docs/ käme auf 51.884, quellen/ wegen der PDFs auf 72.419.

#### Was `pnpm docs:check` heute erzwingt

| Nr. | Prüfung                                 | Fundstelle                                                                                                               | Regel                                                                                                                                                                                                                                      | Stand heute                                                                                                                                      |
| --- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Obergrenzen der Pflichtlektüre in Bytes | docs-check-regeln.mjs Z. 224–236; die Werte schreibt docs-check.test.mjs Z. 254–263 fest (senken ja, still anheben nein) | CLAUDE.md 8.192 · STATUS.md 4.096 · ARBEITSBEREICHE.md 8.192 · DESIGN.md 12.800 (optional) · PLATTFORM.md 8.192 · OPEN_DECISIONS.md 400 Zeilen · jede `.claude/skills/*/SKILL.md` 8.192                                                    | 7.166 · 3.262 · 5.106 · **12.713 (99,3 %)** · **8.178 (99,8 %)** · **399 Z. (99,8 %)** · höchstens 6.689 (bereich)                               |
| 1b  | Annahmenregister                        | docs-check.mjs Z. 69–122                                                                                                 | Vorspann ≤ 90 Zeilen; je Eintrag ≤ 14 Zeilen; **keine Bytegrenze**                                                                                                                                                                         | Vorspann genau 90. 384 von 610 Einträgen sind größer als 1 KB, der größte hat 4.332 B. Die 1-KB-Regel (ASSUMPTIONS.md Z. 45) prüft also niemand. |
| 2   | Register-Anker                          | Z. 80–145                                                                                                                | Jede `### ANN-NNN` steht in src/, supabase/migrations/ oder .github/workflows/; Tests zählen nicht                                                                                                                                         | 610 von 610                                                                                                                                      |
| 3   | Relative Links                          | Z. 150–169                                                                                                               | Jedes Linkziel in jeder getrackten .md existiert                                                                                                                                                                                           | 805 relative Links                                                                                                                               |
| 4   | Querverweise                            | docs-check-regeln.mjs Z. 138–189                                                                                         | „ADR-NNN Fassung N“ höchstens bis zur Fassung aus der Index-Tabelle in docs/adr/README.md; Prinzipien-Version laut Dokumentinformation; §NN ist ein Abschnitt von PP (Ausnahmen: Gesetz, Überschrift „Änderungsvermerk/-historie/Chronik“) | 2.200 §-Verweise im Markdown, 503 im Code                                                                                                        |
| 5   | Eindeutige Kennungen                    | Z. 192–208                                                                                                               | ANN-, BEF- und IDEA-Kennungen höchstens einmal als Überschrift                                                                                                                                                                             | prüft nur vorhandene Dateien                                                                                                                     |
| 6   | Fortschrittstabelle                     | docs-check.mjs Z. 190–196                                                                                                | Die Tabelle in ROADMAP.md Z. 795–996 (202 Z.) entspricht der Ausgabe aus fortschritt.json                                                                                                                                                  | aktuell                                                                                                                                          |

**Was existieren muss.** Ohne diese Dateien bricht das Gate ab oder meldet einen Verstoß:

- PROJECT_PRINCIPLES.md, docs/adr/README.md, docs/development/ROADMAP.md, fortschritt.json und ASSUMPTIONS.md (Z. 208) werden ungeschützt gelesen.
- CLAUDE.md, STATUS.md, ARBEITSBEREICHE.md, PLATTFORM.md und OPEN_DECISIONS.md stehen ohne `optional` in den Obergrenzen.
- Jedes Verzeichnis unter .claude/skills braucht eine SKILL.md.

**Von Tests gelesen**, also nur mit Teständerung zu verschieben oder zu kürzen:

- ADR-011, die Verbotsliste unter „**Operational Logs DÜRFEN NICHT enthalten:**“ (src/lib/protokoll.test.ts Z. 31–52).
- docs/betrieb/bootstrap.md, die SQL-Blöcke (supabase/tests/bootstrap.test.ts Z. 28–32).
- quellen/README.md, das sha256-Register: Jede Datei in quellen/ muss dort stehen (src/quellen.test.ts).
- fortschritt.json (src/fortschritt.test.ts).
- scripts/nur-doku.mjs Z. 34–39 führt ADR-011 und bootstrap.md deshalb als `VON_TESTS_GELESEN`.

**Folgen für jede Zielstruktur:**

1. **Kennungen müssen auflösbar bleiben.** Im Code stehen 608 ANN-Kennungen mit 4.814 Treffern (mit `.github/` alle 610), `ADR-0` mit 3.662 Treffern in 897 Dateien, 162 BEF-Kennungen mit 1.515 Treffern (Zählung 5a) und 51 IDEA-Kennungen mit 210 Treffern.
2. **Nummern bleiben stabil:** die Abschnittsnummern von PP und die Punktnummern der ADRs (Regel A; der Code zitiert etwa „ADR-017 Punkt 96“).
3. **Löschen bricht Links.** 169 Links zeigen in Dateien, die wegfallen sollen. 56 davon stehen in Dateien, die bleiben, am meisten in ROADMAP (16) und sichtung/README (15). Außerdem verliert Regel D die archivierten BEF-Nummern aus dem Blick.
4. **Grenzen verdrängen Wachstum.** Drei begrenzte Dateien stehen bei 99 % ihrer Grenze, und neuer Text weicht in unbegrenzte Dateien aus. PLATTFORM.md entstand, „weil DESIGN.md an seiner Grenze steht“ (docs-check-regeln.mjs Z. 229–230).

#### Mehrfachhaltung: zehn Beispiele

| #   | Regel oder Fakt                                    | Fundstellen                                                                                                                                                                                                                                                                                                              | Befund                                                                                                                                                                                                                                                                          |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Rangfolge der Dokumente                            | PROJECT_PRINCIPLES.md Z. 1672–1690 (Z. 1675: „steht hier und wird nur hier geändert“) · CLAUDE.md Z. 10–17 · docs/adr/README.md Z. 80–92 · IDEENSPEICHER.md Z. 11–15 · Rang-Vermerke in 27 Dateien (48 Zeilen)                                                                                                           | PP verbietet die Kopie selbst (Z. 1735: „Zwei Stellen, die dasselbe behaupten, driften auseinander“).                                                                                                                                                                           |
| 2   | Annahmen-Verfahren (≤ 1 KB, ein Anker, Stoppliste) | PP §15.1/15.2 Z. 1325–1404 · CLAUDE.md Z. 19–29 · ASSUMPTIONS.md Z. 5–15, 38–60 · feature-loop/SKILL.md Z. 31–33 · bereich/SKILL.md Z. 47 · DEVELOPMENT.md Z. 439–441 · ROADMAP Z. 673                                                                                                                                   | Die 1-KB-Regel steht an vier Stellen und wird nirgends geprüft. 384 Einträge sind größer.                                                                                                                                                                                       |
| 3   | Grenzen des Doku-Gates                             | docs-check-regeln.mjs Z. 224–236 (Quelle) · docs-check.mjs Z. 7–12 · DEVELOPMENT.md Z. 487–496 · STATUS.md Z. 3                                                                                                                                                                                                          | DEVELOPMENT nennt „CLAUDE.md (150), STATUS (60)“ als Zeilengrenzen. Seit 2026-10-12 gelten Bytes, dazu drei weitere Dateien und alle Skills. Die Angabe ist veraltet.                                                                                                           |
| 4   | K1 / Pfad A, Zweitreview, `/effort xhigh`          | ADR-013 Punkt 9 Z. 98–158 (Quelle) · CLAUDE.md Z. 84–86 · feature-loop Z. 15–19, 64–68 · bereich Z. 59–67 · ROADMAP Z. 735–744 · DEVELOPMENT.md Z. 510–515 · SESSION-START.md Z. 3–5 · GRAPH-ENGINEERING-WORKFLOW.md Z. 3–8                                                                                              | „Zweitreview“ steht in 31 Dateien (243 Zeilen), „Pfad A“ in 26 (149 Zeilen). Ein Stub existiert nur, weil ADR-013 Z. 156 auf ihn zeigt.                                                                                                                                         |
| 5   | Pflichten je PR (Definition of Done)               | CLAUDE.md Z. 102–105 („nur vier Dinge“) · ROADMAP Z. 671–692 · feature-loop Z. 74–78 · bereich Z. 95–108 · weiter Z. 22                                                                                                                                                                                                  | Die Skills fügen ein fünftes Ding hinzu (erledigte BEF ins Archiv), die Roadmap ein sechstes (Datenklasse und Löschtest je Tabelle).                                                                                                                                            |
| 6   | Aufbewahrungsfristen                               | DB `public.retention_classes` (41 Klassen, 33 mit Frist, 35 mit assumption_key, 12 mit Norm, Spalte note mit 8.946 Zeichen Begründung) · ADR-008 Z. 85–107 (19 Zeilen) · PP §18 Z. 1512–1516, 1529–1533 · ANN-001 Z. 91–103, dazu ANN-579, -591, -597, -602, -607, -610 · ADR-011 Punkt 4 und src/lib/protokoll.ts Z. 57 | PP Z. 1529 sagt, der vollständige Schedule stehe in ADR-008. Dort stehen 19 Klassen, die DB führt 41. Etwa 29 DB-Klassen fehlen in der ADR-Tabelle, 21 davon mit Frist (Zuordnung von Hand), etwa urlaub, zeitkonto, erstattung (8 Jahre), radflotte_ereignis, sitzungsvermerk. |
| 7   | Fristanker der Akte                                | ADR-008 Punkt 11 Z. 66–74 · ANN-511 (steht auf „entschieden (Jannes) · Prüfpaket“) · retention_classes.note der Klasse `patientenakte` · `app.patient_retention_anchor`                                                                                                                                                  | Dreifach gehalten. Nur 1 von 610 Einträgen trägt „in ADR überführt“, obwohl ADRs 96 ANN-Kennungen zitieren, 49 davon aus dem Prüfpaket.                                                                                                                                         |
| 8   | Office liest klinische Inhalte (E15)               | PP §4.3 Z. 432–437 · ADR-004 Punkt 3 Z. 52–58 und Konsequenzen Z. 97–108 · OPEN_DECISIONS Z. 332 · DEVELOPMENT.md Z. 594–602 · src/features/session/types.ts Z. 90, 125, 137–139, 169 · DB `app.can_read_treatment_evidence` = `has_any_role('owner','therapist','team_lead','office')`                                  | Ausführbare Wahrheit ist die DB, eines von 22 gleichen `can_*`-Rollentupeln (23 mit `is_staff`). Dazu kommen fünf Kopien in Prosa.                                                                                                                                              |
| 9   | Ausfallhonorar bei Absage unter 24 Stunden         | PP §8 Z. 1008–1042 · ADR-018 Z. 10, 30, 232, 248, 306, 458 · ADR-022 Z. 202 · PRINCIPLES-CHRONIK Z. 492, 539–553 · DB `app.cancellation_notice_period`                                                                                                                                                                   | PP Z. 1020 („Genau 24 Stunden liegen außerhalb“) wiederholt ADR-018 Z. 248 in der Sache.                                                                                                                                                                                        |
| 10  | Externe Prüfungen B1–B17                           | OPEN_DECISIONS Z. 46–62 und Z. 97–260 · ANFRAGEN.md (526 Z.) · ROADMAP Z. 581–598 · DEVELOPMENT.md Z. 533–570 · Wiedervorlagen in ASSUMPTIONS (B4 allein 15-mal)                                                                                                                                                         | B4 steht in 10 Dateien. 39 der 50 Übersichtszeilen von OPEN_DECISIONS sind laut Statustext entschieden oder erledigt (Heuristik); trotzdem steht die Datei bei 399 von 400 Zeilen.                                                                                              |

**Weitere Fälle:**

- **ADR-Liste:** CLAUDE.md Z. 31–41, docs/adr/README.md Z. 94–123 und die Tabelle in PP §21 Z. 1703–1730. Die PP-Tabelle nennt 24 ADRs und lässt 024 bis 026 aus. PP Z. 10 nennt noch „ADR-001 bis ADR-023“.
- **Audit-Katalog:** 27 Aktionen stehen in audit-aktionen.txt, im Constraint und in actions.ts, abgeglichen durch Test und Label-Workflow. Diese Mehrfachhaltung ist maschinell gesichert und damit in Ordnung. DEVELOPMENT.md Z. 610 nennt sie aber „doppelt“.
- **test:db-Aufruf:** CLAUDE.md Z. 57–60, DEVELOPMENT.md Z. 37–38 und 160–161, feature-loop Z. 46–48.
- **Veralteter Stand:** DEVELOPMENT.md Z. 630 sagt „Kein Offline-Modus und kein Service Worker“. Dem widersprechen src/serviceworker/sw.ts und ADR-024.
- **Zählstand im Register:** ASSUMPTIONS.md Z. 72 nennt „heute 169“ Prüfpaket-Einträge, die Statuszeilen tragen 191.

#### Zielstruktur

Grundsätze:

1. **Eine Aussage an genau einem Ort**, in dieser Rangfolge der Art: ausführbar (DB-Konfiguration, Konstante, Test) vor Entscheidung (PP, ADR) vor Prüfunterlage (Prüfpaket) vor Arbeitsanweisung (CLAUDE.md, Skills). Prosa nennt den Namen (`public.retention_classes`, `app.can_*`), wiederholt aber nicht den Inhalt.
2. **Geschichte steht in Git und in den PRs.** Für abgelegte Dateien reicht eine Zeile „Stand bis `3c5e72b`: `git show 3c5e72b:<pfad>`“. Das Muster gibt es schon: ASSUMPTIONS.md Z. 16.
3. **Kennungen bleiben auflösbar und werden nie neu vergeben.** Jedes Register bekommt eine Zählerzeile.
4. **Jede bleibende Datei hat eine Zeilen- und eine Bytegrenze.**

| Datei                                                                                   |   Ziel Z. | Ziel KB (Schätzung) | Inhalt / Herkunft                                                                                                                                                                                                                                                          | heute Z. |
| --------------------------------------------------------------------------------------- | --------: | ------------------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------: |
| CLAUDE.md                                                                               |       100 |                   7 | Kern bleibt; Rangfolge als ein Satz mit Verweis auf §21                                                                                                                                                                                                                    |      109 |
| .claude/skills/* (6)                                                                    |       250 |                  16 | nur Ablauf, Regeln als Verweis; „erledigte BEF ins Archiv“ entfällt                                                                                                                                                                                                        |      319 |
| .claude/agents/* (3)                                                                    |       110 |                   7 | gekürzt                                                                                                                                                                                                                                                                    |      122 |
| README.md                                                                               |        50 |                   3 |                                                                                                                                                                                                                                                                            |       65 |
| PROJECT_PRINCIPLES.md                                                                   |       600 |                  40 | MUSS- und DARF-NICHT-Kern je Abschnitt, Nummern 0–21 bleiben. Tabelle „Konsolidiert in“ (Z. 1703–1735) und Detailfälle (24-h-Fälle in §8, Rollenlisten in §4) wandern in ADR oder DB.                                                                                      |    1.754 |
| docs/STATUS.md                                                                          |        50 |                   4 |                                                                                                                                                                                                                                                                            |       53 |
| docs/DEVELOPMENT.md                                                                     |       380 |                  30 | Werkzeug, Befehle, Umgebungen; ohne Go-live, Audit, Wochenroutine und Gate-Prosa                                                                                                                                                                                           |      680 |
| docs/PRODUCT_VISION.md                                                                  |       100 |                   7 |                                                                                                                                                                                                                                                                            |      156 |
| docs/adr/README.md                                                                      |        60 |                   6 | Index (Quelle des Gates für Fassungen) und Regeln                                                                                                                                                                                                                          |      123 |
| docs/adr/ADR-001…027                                                                    |     2.840 |                 230 | Je ADR: Status in 3 Z., Kontext ≤ 15 Z., Entscheidung mit stabilen Punktnummern, Konsequenzen ≤ 15 Z., Änderungshistorie. Es entfallen beantwortete Bestätigungsfragen (333 Z.), Recherchequellen außer Normen (149 Z.) und „Konsequenzen der Fassung N“. ADR-017 ≤ 450 Z. |    8.563 |
| docs/decisions/ASSUMPTIONS.md                                                           |     1.480 |                 220 | Vorspann 30 Z.; Prüfpaket mit 208 Einträgen à 5 Z. und ≤ 800 B; die übrigen 402 Einträge als je eine Tabellenzeile (Kennung, Titel, Kategorie und Status, Anker)                                                                                                           |    7.620 |
| docs/decisions/OPEN_DECISIONS.md                                                        |       120 |                  10 | nur offene Punkte (heute etwa 11); entschiedene als eine Zeile mit Fundstelle; dazu die Tabelle „Externe Prüfungen“ aus der Roadmap                                                                                                                                        |      399 |
| docs/decisions/ANFRAGEN.md                                                              |       200 |                  16 | nur Volltexte offener Anfragen (B1–B4, B8, B9)                                                                                                                                                                                                                             |      526 |
| docs/decisions/providerpruefung-supabase.md, -kartendienst.md                           |       180 |                  16 | Gate-Punkte und Befund, ohne den Recherchegang                                                                                                                                                                                                                             |      604 |
| docs/datenschutz/README.md (neu)                                                        |        60 |                   5 | Prüfpaket-Index (G14): Unterlagen, Reihenfolge, Stand je B-Punkt, Abfrage der Fristen aus der DB                                                                                                                                                                           |        – |
| docs/datenschutz/betroffenenrechte.md, kartendienst.md                                  |       249 |                  18 | unverändert                                                                                                                                                                                                                                                                |      249 |
| docs/betrieb/bootstrap.md, lebensmitteldaten.md                                         |       220 |                  13 | unverändert (ein Test liest die SQL-Blöcke)                                                                                                                                                                                                                                |      220 |
| docs/betrieb/test-umgebung.md (neu)                                                     |        60 |                   5 | Schritte 2a–2e aus hosting-optionen.md Z. 193–327; test-umgebung.yml Z. 11, 70 und 302 verweisen darauf                                                                                                                                                                    |        – |
| docs/design/DESIGN.md, PLATTFORM.md, leitfaden-schlank.md                               |       350 |                  28 | Leitfaden gekürzt                                                                                                                                                                                                                                                          |      391 |
| docs/development/ROADMAP.md                                                             |       240 |                  20 | Ziel, Kette, Meilensteine, nächste Bereiche; offene Loop-Vorgaben (MAP-007, FRB-EPIC-004/005) als Zeilen; ohne Fortschrittstabelle (+202 Z., falls Prüfung 6 bleibt)                                                                                                       |    1.021 |
| ARBEITSBEREICHE.md, AUFRAEUMEN.md                                                       |        84 |                   7 | unverändert                                                                                                                                                                                                                                                                |       84 |
| docs/development/BEFUNDE.md                                                             |       300 |                  25 | nur offene Befunde (heute 24 offene und 5 teilweise erledigte von 38), ≤ 10 Z. je Befund, Zählerzeile „nächste Kennung BEF-231“                                                                                                                                            |      729 |
| docs/product/kernablaeufe.md, preisblatt-entwurf.md, gefuehrte-ablaeufe-und-antraege.md |       195 |                  15 | gefuehrte-ablaeufe reduziert auf Muster und Budgets                                                                                                                                                                                                                        |      337 |
| docs/product/IDEENSPEICHER.md und ideen/                                                |       220 |                  25 | Regeln in 40 Z.; 152 IDEA-Kennungen je eine Tabellenzeile; Referenz-Recherchen gehören in die PR des jeweiligen /bereich                                                                                                                                                   |    5.123 |
| docs/sichtung/README.md                                                                 |        60 |                   5 | Sichtliste am Gerät, höchstens 20 Punkte                                                                                                                                                                                                                                   |       80 |
| quellen/README.md, ARBEITSAUFTRAG…, bausteine/mt-untersuchung-quelldaten.md             |       823 |                  52 | Fremdmaterial mit Prüfsumme, unverändert; README verliert 19 Z. mit score-inventar                                                                                                                                                                                         |      842 |
| marke/README.md, src/**/README.md                                                       |       311 |                  27 | unverändert; marke/ ist die einzige Quelle der Marke                                                                                                                                                                                                                       |      311 |
| **Summe**                                                                               | **9.692** |           **≈ 860** |                                                                                                                                                                                                                                                                            |   30.480 |

**Fällt ersatzlos weg** (Git, PR oder Code), zusammen 18.242 Zeilen:

- **docs/development/archiv/**: 17 Dateien, 10.370 Zeilen (abnahme/ 4.946, BEFUNDE-ERLEDIGT 2.054, BEFUNDE-LOESUNGEN 1.103). Die Archiv-README nennt die Inhalte selbst „ohne Rang und ohne Pflege“.
- **Chroniken:** PRINCIPLES-CHRONIK (719 Z.) und ROADMAP-CHRONIK (211 Z.). Regel A liest Versionen aus der Dokumentinformation von PP, nicht aus der Chronik (docs-check-regeln.mjs Z. 80–87).
- **Design:** handoff-* (8 Dateien, 2.784 Z.), review-2026-10/ (1.796 Z.) und lastenrad-3d/. Ihre Regeln stehen in DESIGN.md und PLATTFORM.md.
- **Loop-Vorgaben und Weiterleitungen:**
  - PLATTFORM-ANSICHTEN (424 Z.): POR-EPIC-001 bis -003 sind fertig.
  - FRB-BAUSTEINE (233 Z.): FRB-EPIC-004/005 sind noch offen und werden zwei Roadmap-Zeilen.
  - MAP-LOOPS (134 Z.): MAP-007 ist noch offen und wird eine Roadmap-Zeile.
  - Dazu die 3 Weiterleitungen (20 Z.).
- **14 alte Sichtungsdateien** (720 Z., etwa 300 KiB). Vorher müssen die rund 170 offenen Schritte triagiert werden (sichtung/README Z. 45).
- **Erledigte Optionspapiere:** hosting-optionen.md (344 Z.; B16 ist seit 2026-09-23 entschieden, das Vorgehen wandert nach betrieb/) und rechnungs-pdf-optionen.md (91 Z.; B14 ist entschieden).
- **quellen/scores/score-inventar.md** (387 Z.); quellen/README Z. 80 nennt sie selbst „Wiedergabe, nicht Quelle“.
- **Innerhalb bleibender Dateien:**
  - Begründung und Änderungspfad der 402 Einträge außerhalb des Prüfpakets (4.562 Z., 577 KB); der Anker im Code bleibt.
  - In den ADRs die Statusblöcke (595 → 81 Z.).
  - In der Roadmap die Fortschrittstabelle (202 Z., erzeugt) und Z. 638–769 (Sessions, Definition of Done, Arbeitsweise, Wochenupdate).
  - In DEVELOPMENT.md Z. 523–613.

#### Quelle der Wahrheit je Thema

| Thema                          | Gilt (Code/DB, ausführbar)                                                                                                                                                                                                | Begründet (PP Rang 1, ADR Rang 2)                                                                                                     | Wird extern geprüft (Prüfpaket)                                                                                                        | Darf dann nicht mehr stehen in                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Aufbewahrungsfristen           | `public.retention_classes` (41 Klassen: Frist, Anker, Norm, ANN-Schlüssel) und `retention_assignments` (183 Zeilen, alle 151 Tabellen), retention.test.ts; Betriebslogs: `BETRIEBSLOG_FRIST_TAGE` in src/lib/protokoll.ts | PP §18 (Grundsätze); ADR-008 (Anker, Legal Hold, Journal, Restore) mit Verweis statt Fristtabelle; ADR-011 Punkt 4 (vom Test gelesen) | ANN zu jedem `assumption_key` (35 Klassen) und ANN-001. Die Fristliste für die Prüfung wird aus der DB abgefragt, nicht abgeschrieben. | ADR-008 Z. 85–107, PP Z. 1512–1516, Fristwerte in ANN-Prosa |
| Löschung und Wiederherstellung | apply_retention (551 Z.), reapply_deletion_journal, place/release_legal_hold, delete_patient_record; Runbook in docs/betrieb                                                                                              | ADR-008 Punkte 6–12, ADR-012                                                                                                          | ANN-007, ANN-031                                                                                                                       | DEVELOPMENT.md Z. 545–563                                   |
| Betroffenenrechte              | export_patient_record (853 Z.), export_training_record; betroffenenrechte.test.ts prüft die Vollständigkeit gegen den Aufbewahrungsplan                                                                                   | ADR-007 Punkt 5                                                                                                                       | docs/datenschutz/betroffenenrechte.md (Verfahren, Fristen nach Art. 12)                                                                | –                                                           |
| Rechtsgrundlage, Einwilligung  | training_consent_records, nutrition_consent_records                                                                                                                                                                       | PP §3, ADR-021, ADR-023, ADR-027                                                                                                      | 143 Datenschutz- und 37 Recht-Einträge mit Norm und Anker; ANFRAGEN B2                                                                 | Normzitate in den Recherchequellen der ADRs                 |
| Rollen und Rechte              | 88 `app.can_*`, 68 Policies, 566 SECURITY-DEFINER-RPCs, Negativtests                                                                                                                                                      | PP §4 (wer was sieht), ADR-004 (Mechanik)                                                                                             | E15 und B2 (Office liest klinisch)                                                                                                     | DEVELOPMENT.md Z. 594–602, Prosa in session/types.ts        |
| Audit                          | audit-aktionen.txt (27 Aktionen) = Constraint = actions.ts; Label-Workflow audit-katalog.yml                                                                                                                              | ADR-010 Punkte 15–21                                                                                                                  | ANN-029, ANN-230                                                                                                                       | DEVELOPMENT.md Z. 572–612                                   |
| Abrechnung                     | invoices, invoice_number_series, invoice_cancellations, service_catalog_versions/-items (Constraint `service_catalog_items_reduced_rate_not_activated`), 61 Funktionen; `app.cancellation_notice_period`                  | PP §19 (Grundsätze), ADR-009 (Steuerkennzeichen am Posten, Nummernkreise, §14c-Riegel), ADR-018, ADR-020                              | Recht-Einträge (z. B. ANN-074, -075, -082) und ANFRAGEN B4 (Steuerberatung)                                                            | Detailfälle in PP, ROADMAP Z. 592                           |
| DSFA und Go-live               | Schalter im Code (z. B. src/app/mdr.ts)                                                                                                                                                                                   | ADR-007 Punkt 5, PP §3.7                                                                                                              | docs/datenschutz/README.md (G14: Schwellwert, VVT, TOM, Löschkonzept, Subprozessoren); B2 und B3                                       | DEVELOPMENT.md Z. 533–570, ROADMAP Z. 581–598               |
| Anbieter                       | Adapter `mock`                                                                                                                                                                                                            | ADR-002, ADR-019                                                                                                                      | providerpruefung-supabase.md, -kartendienst.md                                                                                         | hosting-optionen.md                                         |

VVT und TOM gibt es im Repository nicht als Dokument. Sie werden nur erwähnt (ROADMAP Z. 559 „G14 DSFA-Paket“, MAP-LOOPS Z. 67). Ihr künftiger Ort ist der Prüfpaket-Index.

**Das Prüfpaket im Ziel:**

- **Umfang heute uneinheitlich:**
  - 191 Einträge tragen den Zusatz „Prüfpaket“.
  - Nach der Regel des Registers (Kategorie Datenschutz oder Recht, nicht verworfen) wären es 197.
  - Die Vereinigung beider Mengen umfasst 208 Einträge mit 2.359 Zeilen und 376 KB.
  - Ohne Zusatz, obwohl Datenschutz oder Recht: 17 Einträge (ANN-104, -134, -139, -214, -218, -242, -245, -249, -256, -287, -311, -342, -358, -360, -361, -501, -562).
  - Mit Zusatz, obwohl Technik oder Praxisprozess: 11 Einträge (ANN-324, -325, -327, -328, -589, -590, -594, -595, -664, -670, -671).
- **Ziel:** Der Zusatz folgt aus Kategorie und Status, und das Gate prüft das.
- **Format je Eintrag** (≤ 5 Zeilen, ≤ 800 B): Kopf, Statuszeile und ein Absatz mit **Annahme** (1–2 Sätze), **Grundlage** (Norm, ADR-Punkt), **Anker** (Funktion, Tabelle oder Konstante) und **Rücknahme** (klein, mittel oder groß). Es entfallen Abnahme-Absätze, Herleitungen und Fristwerte, die schon in der DB stehen. Heute hat ein Eintrag im Mittel 11,3 Zeilen und 1.809 B.
- **Steht der Inhalt schon in einem ADR**, bekommt der Eintrag den Status „in ADR überführt“ und bleibt als Prüfpunkt mit Verweis. Beispiele: ANN-511 ↔ ADR-008 Punkt 11, ANN-512 ↔ ADR-018 Punkt 10, ANN-525 bis -529 ↔ ADR-023 Punkt 25.
- **ADR-Kandidaten (Schätzung über grep):** 20 Einträge aus Praxisprozess oder Technik mit Status „entschieden (Jannes)“ und Aufwand „groß“. Nach PP §21 sollen sie ein ADR werden.

#### Bilanz

| Bereich                                                      |   heute Z. |   Ziel Z. |           Δ |
| ------------------------------------------------------------ | ---------: | --------: | ----------: |
| Agentensteuerung (CLAUDE.md, Skills, Agenten)                |        550 |       460 |         −90 |
| Prinzipien mit Chronik                                       |      2.473 |       600 |      −1.873 |
| ADR mit Index                                                |      8.686 |     2.900 |      −5.786 |
| Annahmen                                                     |      7.620 |     1.480 |      −6.140 |
| Offene Entscheidungen, Anfragen, Anbieter, Optionspapiere    |      1.964 |       500 |      −1.464 |
| Datenschutz (mit neuem Prüfpaket-Index)                      |        249 |       309 |         +60 |
| Betrieb (mit Test-Umgebung)                                  |        220 |       280 |         +60 |
| Entwicklungsanleitung                                        |        680 |       380 |        −300 |
| Roadmap, Status, Arbeitsbereiche, Aufräumen, ROADMAP-CHRONIK |      1.369 |       374 |        −995 |
| Befunde                                                      |      3.886 |       300 |      −3.586 |
| Produkt (Vision, Kernabläufe, Startinhalt, Ideen)            |      5.616 |       515 |      −5.101 |
| Design (Regeln, Handoffs, Reviews)                           |      4.980 |       350 |      −4.630 |
| Archiv und Abnahmen                                          |      7.213 |         0 |      −7.213 |
| Loop-Vorgaben, Weiterleitungen                               |        811 |         0 |        −811 |
| Sichtung                                                     |        800 |        60 |        −740 |
| quellen/                                                     |      1.229 |       823 |        −406 |
| README (Wurzel, marke, src)                                  |        376 |       361 |         −15 |
| **Summe**                                                    | **48.722** | **9.692** | **−39.030** |

**Nachtrag nach der Gegenlese: Fachregeln außerhalb des Prüfpakets.**

- **Lücke im Plan oben:** Er kürzt alle 402 Einträge außerhalb des Prüfpakets auf eine
  Tabellenzeile. Darunter sind **101**, die 5b als fachlich behalten einstuft (Kategorie: 92
  Praxisprozess, 9 Technik), heute 1.137 Zeilen. Nach Wissen sind es:

  | Wissen        | Einträge |
  | ------------- | -------: |
  | Praxisprozess |       64 |
  | Abrechnung    |       21 |
  | Recht         |        5 |
  | Datenschutz   |        4 |
  | Aufbewahrung  |        3 |
  | Sicherheit    |        2 |
  | Technik       |        2 |

  Ohne sie ginge Abrechnungs- und Aufbewahrungswissen verloren.

- **Betroffen** sind ANN-008, 042, 055, 057, 063–064, 067–068, 076, 078–081, 088, 097, 099, 103, 122, 132, 135–136, 138, 146, 157, 179, 181, 185–186, 190, 210, 213, 215, 220, 226–227, 236–237, 240, 246, 257, 263, 266, 268, 271, 276, 278–279, 284, 294, 300, 302, 304, 307–310, 319–321, 339–341, 343, 346, 348–355, 366–369, 510, 516, 534, 536, 539, 544, 550, 553–554, 561, 565, 568, 570, 574, 576, 578, 598, 605, 611, 617, 647, 656, 662, 673, 703.
- **Abrechnung:** ANN-042, -064, -067, -068, -076, -078, -079, -080, -081, -088, -181, -213, -215, -268, -271, -276, -279, -321, -339, -516, -544.
- **Aufbewahrung:** ANN-063, -246, -703.
- **Ziel:** Das Register bekommt einen Abschnitt „Fachregeln“ mit je höchstens drei Zeilen
  (Regel, Grundlage, Anker). Das sind +202 Zeilen, das Ziel liegt damit bei **9.894 Zeilen**.
- **Mit Prüfung 6:** Bleibt die Fortschrittstabelle, sind es 10.096 Zeilen; dann muss das
  ADR-Budget von 2.840 auf höchstens 2.740 sinken.
- **Besser:** Die 21 Abrechnungsregeln vorher in ADR-009 überführen, die 3 Aufbewahrungsregeln in
  ADR-008. Dann wird der Abschnitt kleiner, und das Wissen steht an seinem Rang-2-Ort.

**Wie empfindlich das Budget ist:**

- Bleibt Prüfung 6 (Fortschrittstabelle) erhalten, sind es **9.894** Zeilen.
- Ohne Gate-Änderung für das Register braucht jeder der 402 übrigen Einträge eine eigene `### ANN-NNN`-Zeile und eine Leerzeile. Das kostet 392 Zeilen mehr; zusammen mit der Tabelle wären es 10.286. Dann muss das ADR-Budget auf ≤ 2.500 sinken.
- **Bytes:** etwa 860 KB statt 4.274 KiB (Schätzung aus den Bytes je Zeile der Zieldateien).

#### Umsetzung in sechs Schritten

| Schritt                         | Inhalt                                                                                                                                                                                                                                                                                                                                                                                                                   | Zeilen danach | Gate und Tests                                                                                                                                                                                                                                                                                                                          | Freigabe durch Jannes nötig                                                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Ablegen                       | Archiv, Chroniken, Handoffs, Reviews, Lastenrad-Kanvas, Weiterleitungen, hosting-optionen und rechnungs-pdf-optionen, score-inventar löschen (−16.731); betrieb/test-umgebung.md neu (+60). 56 Links nachziehen, ebenso Verweise im Code und in Workflows (archiv/ in 10 Dateien, BEFUNDE-ERLEDIGT in 4 Skills, hosting-optionen in test-umgebung.yml), quellen/README bereinigen, Zählerzeilen für BEF und IDEA anlegen |        32.051 | Prüfung 3 wird durch die Linkkorrektur wieder grün. Neu: Eine BEF- oder IDEA-Kennung muss größer sein als der Zählerstand, weil Regel D archivierte Nummern nicht mehr sieht. Gelöschte Dateien starten die volle CI (nur-doku.mjs), das ist gewollt.                                                                                   | Ja. PP Z. 15–16 und 1737–1739 verlangen den Änderungsvermerk in der Chronik, also PP 0.29. ADR-013 Z. 156 zeigt auf GRAPH-ENGINEERING-WORKFLOW.md. |
| 2 Register                      | Prüfpaket (208 Einträge à 5 Z.), Index der übrigen 402 Einträge, Status „in ADR überführt“ setzen, den Zusatz korrigieren (17 fehlen, 11 zu viel)                                                                                                                                                                                                                                                                        |        25.911 | Vorspann-Grenze 90 → 40 (senken). Neue Bytegrenze je Eintrag (800 B im Prüfpaket, 200 B im Index). Tabellenzeilen `\| ANN-NNN \|` in docs-check.mjs Z. 103 und 137 sowie in Regel D (docs-check-regeln.mjs Z. 196) mitzählen, dazu Tests. Neue Prüfung: Zusatz „Prüfpaket“ genau dann, wenn Datenschutz oder Recht und nicht verworfen. | Ja: ob das Prüfpaket 191, 197 oder 208 Einträge umfasst, und der gekürzte Wortlaut (Rang 4).                                                       |
| 3 Wahrheit in die DB            | Fristtabelle in ADR-008 durch Verweis und Abfrage ersetzen, PP Z. 1529 korrigieren, Prüfpaket-Index docs/datenschutz/README.md anlegen. Aus DEVELOPMENT.md fallen Go-live, Audit, Wochenroutine, Gate-Prosa und die Zeile „kein Service Worker“ (−300).                                                                                                                                                                  |        25.671 | Keine Änderung nötig. Optional ein DB-Test: Jede Klasse mit `basis = 'intern'` trägt einen `assumption_key`.                                                                                                                                                                                                                            | Ja (PP Rang 1, ADR-008 Rang 2)                                                                                                                     |
| 4 ADR verdichten                | Konsolidierte Fassung je ADR mit stabilen Punktnummern; die Verbotsliste in ADR-011 bleibt wörtlich                                                                                                                                                                                                                                                                                                                      |        19.885 | Grenzen je ADR in die Obergrenzen aufnehmen (etwa 16 KB, ADR-017 40 KB) und docs-check.test.mjs Z. 254–263 nachziehen. Neue Grenzen verschärfen nur. Regeln A und B bleiben gültig, weil Index und Nummern bleiben.                                                                                                                     | Ja: docs/adr/README.md Z. 49 („wird nicht umgeschrieben“) muss eine konsolidierte Fassung zulassen; Z. 55 verweist die Vorfassung bereits auf Git. |
| 5 Prozessregeln an einen Ort    | Roadmap Z. 638–769 in CLAUDE.md und die Skills, Z. 581–598 nach OPEN_DECISIONS, Fortschrittstabelle durch `pnpm fortschritt` ersetzen. PP 1.754 → 600; Agentensteuerung 550 → 460; OPEN_DECISIONS, ANFRAGEN und Providerprüfungen 1.529 → 500; Loop-Vorgaben 791 → 0                                                                                                                                                     |        16.037 | OPEN_DECISIONS-Grenze 400 → 150 Zeilen (senken). Prüfung 6 entfällt, oder sie bleibt (dann +202 Z.).                                                                                                                                                                                                                                    | Ja. Prüfung 6 zu streichen heißt eine CI-Prüfung abzubauen, und das steht auf der Stoppliste in CLAUDE.md. Die PP-Kürzung betrifft Rang 1.         |
| 6 Rest und Budget festschreiben | Befunde 729 → 300, Ideen 5.123 → 220, übriges Produkt 493 → 295, Sichtung 800 → 60 nach der Triage, Design 391 → 350, README 65 → 50, `quellen/README.md` 842 → 823 (die in Schritt 1 begonnene Bereinigung)                                                                                                                                                                                                             |         9.692 | Neue Prüfung: alle .md zusammen ≤ 10.000 Zeilen und ≤ 900 KB, der Wert im Test festgeschrieben und nur senkbar, dazu Bytegrenzen für alle bleibenden Dateien. Regel D für IDEA-Tabellenzeilen erweitern; /idee-Skill anpassen.                                                                                                          | Ja, für den Verzicht auf die Triage der rund 170 Sichtungsschritte; sonst nein.                                                                    |

Prüfungen je Schritt: `pnpm format:check && pnpm docs:check && pnpm test` (darunter docs-check.test, quellen.test, protokoll.test, fortschritt.test und nur-doku.test). `pnpm test:db` nur, wenn docs/betrieb/bootstrap.md berührt wird (bootstrap.test.ts).

Risiko einer Gesamtgrenze: Die Register-Gesamtgrenze „musste elfmal angehoben werden und schützte nichts“ (docs-check.mjs Z. 58–68). Eine Doku-Gesamtgrenze trägt deshalb nur, wenn Wachstum nach Git abfließt statt in die Datei und der Test den Wert ausschließlich senken lässt.

## 6. Gesamtbild: Hebel, Reihenfolge, Fragen

### 6.1 Hebel im Vergleich

Die Einsparungen überlappen sich. Der RPC-Vertrag B1 aus 2a enthält zum Beispiel einen Teil der
Duplikate aus 2b. Die Spalte darf deshalb nicht einfach summiert werden.

| Hebel                                         | Abschnitt | Wirkung                                                                                                                                                              |                                                                                                                                                                                                                                                                                                                                        Zeilen | gemessen / geschätzt                                  | braucht                               |
| --------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | ----------------------------------------------------- | ------------------------------------- |
| Geteilte Hilfen aus den Fachmodulen lösen (K) | 1a.3      | 171 Querimporte, Paare 32 → 26                                                                                                                                       |                                                                                                                                                                                                                                                                                                                                     0 (Umzug) | gemessen                                              | – (mechanisch)                        |
| Seiten als Kompositionsschicht (S)            | 1a.3      | 382 Querimporte entfallen als Kante; mit K bleiben 290 Querimporte, 14 Paare                                                                                         |                                                                                                                                                                                                                                                                                                                                             0 | gemessen                                              | Regel und Gate                        |
| 17 Restimporte umdrehen                       | 1a.5      | Domänengraph azyklisch                                                                                                                                               |                                                                                                                                                                                                                                                                                                                                           ≈ 0 | gemessen                                              | K + S vorher                          |
| `appointments/index.ts` mit 15 Exporten       | 1b        | tiefe Importe 185 → 0, Zyklenpartner 13 → 0                                                                                                                          |                                                                                                                                                                                                                                                                                                                                           ≈ 0 | modelliert                                            | S1–S11                                |
| Grunddesign B1–B7                             | 2a.4      | ≥ 95 % der Fälle ohne Sonderbau                                                                                                                                      |                                                                                                                                                                                                                                                                                                                   ≈ 12.150 TS (10.000–14.500) | B1/B2/B3/B6 aus Messwerten, B4/B5/B7 Prozentschätzung | Architekturentscheidung (ANN Technik) |
| Top 10 semantische Duplikate                  | 2b        | gemeinsame Basis statt Handkopien; beseitigt belegte Fehler aus Drift (403-Nachtrag, Upload-Recht, Fokussprung in 12 Formularen, 7 Abweichungen der Antragsmechanik) |                                                                                                                                                                                                                                                                                        ≈ 3.650 (≈ 800 SQL erst nach dem nächsten Basis-Abzug) | gegengeprüft, konservativ                             | überwiegend in B1–B6 enthalten        |
| DB-Familien generisch                         | 3a e)     | 172 Funktionen weniger (1.206 → ≈ 1.034)                                                                                                                             |                                                                                                                                                                                                                                                                                                                             ≈ 2.400 Migration | Schätzung je Familie                                  | Pfad A (Rechte, Storage, Löschen)     |
| Zentrale Registry                             | 3b.8      | Eintragsstellen je neuer Tabelle 6–23 → 1 Zeile + Sonderregel; schließt L-L1, L-J1, L-J2, L-M1                                                                       | Schätzung, in 3b nicht hergeleitet: etwa die Hälfte der 2.602 Rumpfzeilen von `export_patient_record`, `export_training_record`, `merge_patients`, `patient_merge_plan`, `delete_patient_record`, `delete_training_relationship`, `reduce_training_relationship` und `reapply_deletion_journal`; `apply_retention` (551) bleibt als Verteiler | Schätzung                                             | Pfad A, ADR-008                       |
| Feature-Vereinfachung M1–M9                   | 4.6       | 15 Tabellen weniger, `three` entfällt                                                                                                                                |                                                                                                                                                                                                                                                                                                        ≈ 28.500 (+ 989 Skripte, + 3.672 Doku) | 15.185 gemessen, 13.271 geschätzt                     | Entscheidung Jannes je Punkt          |
| Doku-Zielstruktur                             | 5c        | 48.722 → 9.894 (mit Nachtrag)                                                                                                                                        |                                                                                                                                                                                                                                                                                                                                  −38.828 Doku | gemessen (Ist), geplant (Ziel)                        | Jannes (PP, ADR, Gate)                |

**Was das für das Ziel „95 % im Grunddesign“ heißt:**

- **Die Fallabdeckung von 95 % ist mit sieben Bausteinen erreichbar.** Gezählt wurden 293
  RPC-Funktionen, 270 Abfrage- und Aktionshaken, 85 Kontextvergleiche, 56 Rückfragen und 184
  Routen.
- **Ausnahmen mit Erweiterungspunkt:** 87 jsonb-Endpunkte, die Einsichtsverbindung und die
  Offline-Ablage.
- **Zeilen spart das Grunddesign weniger, als man erwarten würde** (≈ 17 % der großen Dateien).
  Der größere Hebel liegt woanders:
  - im Umfang (Abschnitt 4: Praxisbetrieb 85.004 Zeilen ohne Kernablauf),
  - in der Doku (−80 %),
  - in den 12.099 Kommentarzeilen der großen Dateien, die Entscheidungsgeschichte statt „Warum“
    tragen. Das widerspricht der Regel „Kommentare höchstens drei Zeilen, nur das Warum, ohne
    Tickets“: Allein die 88 Dateien haben 1.489 Ticketkennungen in Kommentarzeilen; repo-weit gibt
    es 3.317 Kommentarblöcke über drei Zeilen (`aufraeumen.mjs`, ohne Migrationen).
- **In der DB ist die Vollständigkeit der Gewinn, nicht die Zeilenzahl.** Eine Registry mit
  Katalogtest macht „vergessene Tabelle“ unmöglich. Heute sind von 23 möglichen Eintragsstellen nur
  11 testerzwungen, 2 weitere fallen erst zur Laufzeit auf.

### 6.2 Vorgeschlagene Reihenfolge

Sie passt zu ROADMAP 7.16: Schritt 3 sind die Modulschnittstellen ab „Termine“, Schritt 4 ist die
Registry.

| #   | Auftrag                                                                                                                                                                                                                                                                         | Pfad           | Größe              | Abhängig von         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------ | -------------------- |
| 0   | **Einzelfixes ohne Umbau:** 403-Prüfung in `addTrainingProtocolAddendum`, Suchbegriff aus der Adresse der Mitarbeiterliste, Fokusauslöser der `Fehlerzusammenfassung`, `leseMeldung` aus dem Verlauf nehmen (2b)                                                                | –              | klein              | –                    |
| 1   | **L-L1 beheben.** Die Teillöschung unter Belegfrist um die 17 Tabellen ergänzen, mit Test (3b.6). Die Lücke betrifft Art.-9-Daten und widerspricht einem geltenden ADR                                                                                                          | A              | klein–mittel       | Entscheidung 1 unten |
| 2   | Aufräumen Schritt 3, Teil 1: `src/lib/praxiszeit.ts`, `kalendertag.ts`, `zeitbaender.ts`, `termin.ts`, `wege.ts` (appointments S1–S3). Damit fallen die Paare appointments~billing und ~datenschutz, und die Nutzer sinken von 28 auf 16                                        | –              | mittel, mechanisch | –                    |
| 3   | Aufräumen Schritt 3, Teil 2: Blattmodule `praxisverzeichnis` und `tagesplan`, UI-Bausteine nach `components/ui`, Terminformular und Terminknopf, `index.ts` (S4–S11). Dazu ein Gate „kein tiefer Import nach `features/appointments`“ in `scripts/aufraeumen.mjs` oder als Test | –              | groß, in 8 PRs     | 2                    |
| 4   | Aufräumen Schritt 4: Registry in 5 Stories (3b.8). Story 1 ist nur lesend und macht die Lücken als roten Test sichtbar; danach Journal-Trigger, Löschen, Merge, Auskunft                                                                                                        | A, Zweitreview | groß               | 1                    |
| 5   | Kompositionsregel S für alle Domänen, dann die 17 Rückkanten, dann das Zusammenlegen der Ordner                                                                                                                                                                                 | –              | groß               | 2, 3                 |
| 6   | Grunddesign B1 und B2 (Endpunkt-Vertrag, Haken) zuerst an `platform/api.ts` und `billing/api.ts` (≈ 1.800 Zeilen weniger), dann B6 und B4                                                                                                                                       | –              | groß               | ANN Technik          |
| 7   | Doku-Schritte 1 und 2 (Archiv, Befunde, Register-Index)                                                                                                                                                                                                                         | –              | mittel             | Entscheidung 3       |
| 8   | DB-Familien (1) und (3)/(4) (Fähigkeitsmatrix, Storage-Register); dabei das Upload-Recht der Akte und die Sperren ohne Nachprüfung angleichen (2b Fund 5)                                                                                                                       | A              | mittel             | 4                    |
| 9   | Feature-Vereinfachungen nach Entscheidung je Punkt                                                                                                                                                                                                                              | – / A je Punkt | je klein–mittel    | Entscheidung 2       |

### 6.3 Fragen an Jannes (höchstens fünf, je mit Empfehlung)

1. **Teillöschung unter Belegfrist (L-L1).** Fallen Screening, Assessments, Check-ins, Gewohnheiten
   und Übungspläne eines beendeten Trainingsverhältnisses nach drei Jahren, auch wenn Belege acht
   Jahre bleiben? _Empfehlung: ja._ So steht es in ADR-021 Punkt 4 und ANN-183. Als erste
   Pfad-A-Story vor der Registry umsetzen.
2. **Umfang.** Welche der Vereinfachungen M1–M9 sollen gebaut werden? _Empfehlung:_
   - sofort M9 (Reste der verworfenen Übungsbilder) und M7 (Plattform-Einsicht, ein Lesepfad
     weniger auf Plattformdaten);
   - M4 (Barometer) bis zur dritten Einstellung abschalten statt löschen;
   - Teamchat, Radflotte und Personal-Suite bis zur ersten Einstellung einfrieren, also kein
     Ausbau;
   - M1 (3D), M3 (Teamchat-Zusätze) und M6 (Ernährungs-Tracker) gesondert entscheiden. Sie stehen
     auf eigenen Aufträgen bzw. ADR-027.
3. **Git als Archiv.** Dürfen `docs/development/archiv/` (mit `BEFUNDE-ERLEDIGT.md` und
   `BEFUNDE-LOESUNGEN.md`), die Chroniken, die erledigten Handoffs und Reviews, der
   Lastenrad-Kanvas, die Weiterleitungen, die zwei erledigten Optionspapiere und
   `quellen/scores/score-inventar.md` ersatzlos gehen? Das sind −16.731 Zeilen (5c, Schritt 1). Vorher würden die 9 nur dort stehenden Entscheidungen in ANN oder ADR gesichert.
   _Empfehlung: ja._ Kennungen bleiben über Zählerzeilen geschützt (5c, Schritt 1).
4. **Domänenschnitt.** Gilt der Vorschlag „Ziel“ aus 1a.4 mit 14 Domänen? Er hat `privacy` und
   `nutrition` eigenständig und `portal` zusammengelegt. _Empfehlung: ja._ Die besten Kennzahlen
   (V3d) erkaufen sich eine Domäne mit 43.444 LOC und wiederholen damit das Problem von
   `appointments`.
5. **Prüfpaket.** Welcher Umfang gilt: 191 (Zusatz heute), 197 (Regel des Registers) oder 208
   (Vereinigung)? Soll ein Gate den Zusatz aus Kategorie und Status erzwingen? _Empfehlung: 208
   und das Gate._ Dann fehlt der Datenschutzprüfung kein Eintrag.

**Vorschlag für den nächsten Auftrag:** Aufräumen Schritt 3, Teil 1 (Reihenfolge Nr. 2). Er ist
rein mechanisch und berührt keinen Pfad-A-Auslöser. Er senkt die tiefen Importe auf
`appointments` von 185 auf 75 (modelliert, 1b Schritte S1–S3) und die Nutzer von 28 auf 16. Parallel dazu Frage 1 klären, damit L-L1 als erste
Pfad-A-Story folgen kann.

### 6.4 Grenzen dieser Analyse

- **Nichts ausgeführt außer lesenden Abfragen.** Kein Typecheck, kein Testlauf, keine Migration. Die
  Werte „nachher“ in 1b und 2a.4 sind modelliert, nicht gemessen.
- **Die DB lief lokal mit Shim, nicht in Supabase.** `pg_cron` fehlt dort. Die 10 Cron-Jobs sind
  deshalb aus dem Migrationstext gezählt, nicht aus `cron.job`.
- **Die Git-Historie ist flach.** Sie hat 317 Commits ab 2026-10-16. Aussagen zum Wachstum gelten
  nur für diese 9 Tage.
- **Einordnungen sind Urteile.** Das gilt für die ANN-Klassen, den Nutzen in 4.5, die Kernhilfen K
  und die Funktionsrollen in 3a. Die Verfahren sind in den Abschnitten beschrieben, die Grenzfälle
  benannt.
