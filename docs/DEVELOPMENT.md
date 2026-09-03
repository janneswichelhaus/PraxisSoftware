# Entwicklungsumgebung

Stand: 2026-09-03 · verbindlich sind `PROJECT_PRINCIPLES.md` und `docs/adr/`.

> **Es werden ausschließlich synthetische Daten verwendet.** Echte
> Patientendaten dürfen in keiner Entwicklungs-, Test- oder Demoumgebung
> auftauchen (`PROJECT_PRINCIPLES.md` §3.1). Coding- und KI-Werkzeuge erhalten
> niemals Produktionscredentials.

## Voraussetzungen

| Werkzeug          | Version | Zweck                                              |
| ----------------- | ------- | -------------------------------------------------- |
| Node.js           | ≥ 22    | Laufzeit                                           |
| pnpm              | 10.x    | Paketmanager                                       |
| PostgreSQL-Server | 16      | lokale Testdatenbank für Migrations- und RLS-Tests |
| Docker            | aktuell | Supabase-Stack: Anmeldung und echte E2E-Tests      |

## Erste Schritte

```bash
pnpm install
cp .env.example .env.local     # Platzhalter durch lokale Werte ersetzen
pnpm dev
```

## Datenbank- und RLS-Tests

Die Berechtigungstests laufen gegen eine **echte** PostgreSQL-Instanz. Ein Mock
wäre wertlos, weil genau die Policy geprüft wird.

```bash
pnpm db:start                  # lokaler Cluster auf Port 54329 unter .tmp/
export TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:54329/postgres
pnpm test:db
pnpm db:stop
```

`supabase/tests/helpers/supabase-shim.sql` stellt dabei nach, was die
Migrationen von Supabase erwarten: die Rollen `anon`/`authenticated`, das Schema
`auth` und `auth.uid()`. Damit sind die Policies ohne den vollständigen
Supabase-Stack prüfbar — dieselbe Datei wird niemals gegen eine echte
Supabase-Instanz eingespielt.

Der Stand ist jederzeit aus **Migrationen + Seed** reproduzierbar. Es gibt
keinen manuell gepflegten Zwischenzustand.

## Vollständiger Supabase-Stack

Für Anmeldung (GoTrue), PostgREST und die echten E2E-Tests wird der lokale
Supabase-Stack benötigt. Er läuft in Docker und enthält ausschließlich
synthetische Daten.

```bash
pnpm dlx supabase start        # benötigt Docker
pnpm dlx supabase db reset     # Migrationen + Seed erneut anwenden
pnpm dlx supabase status       # URL und anon key dieser Instanz
```

Die Werte aus `supabase status` gehören zu einer **lokalen Wegwerf-Instanz**.
Sie werden bei jedem Neuaufsetzen neu erzeugt, sind kein Secret im Sinne von
`PROJECT_PRINCIPLES.md` §3.3 — und gehören trotzdem **nicht ins Repository**:
der anon key ist ein JWT und wird vom Secret-Scan zu Recht als Fund gemeldet.

## Lokale Abnahme unter Windows (Git Bash)

Ablauf für die manuelle Prüfung eines Feature-Branches. Alle Befehle laufen im
Projektverzeichnis in Git Bash.

**1. Branch aktualisieren**

```bash
git fetch origin
git checkout claude/kernfaehige-terminverwaltung-5y709x
git pull --ff-only origin claude/kernfaehige-terminverwaltung-5y709x
```

**2. Abhängigkeiten installieren**

```bash
pnpm install --frozen-lockfile
```

**3. Supabase starten** (Docker Desktop muss laufen)

```bash
pnpm dlx supabase start
pnpm dlx supabase db reset     # Migrationen + synthetischer Seed
pnpm dlx supabase status       # API URL und anon key notieren
```

**4. `.env.local` anlegen**

```bash
cp .env.example .env.local
```

Darin einsetzen — beides aus `supabase status`:

```
VITE_SUPABASE_URL=<API URL>
VITE_SUPABASE_ANON_KEY=<anon key>
```

`.env.local` ist nicht versioniert und bleibt es auch.

**5. Anwendung starten**

```bash
pnpm dev                       # http://127.0.0.1:5173
```

Anmeldung mit einem Konto aus „Testkonten" und dem Entwicklungskennwort.

**6. Echte E2E-Tests starten** (zweites Git-Bash-Fenster)

```bash
export E2E_SUPABASE_URL=<API URL>
export E2E_SUPABASE_ANON_KEY=<anon key>
pnpm test:e2e
```

Erst wenn **beide** Variablen gesetzt sind, läuft zusätzlich das
Playwright-Projekt `authenticated` mit den Abläufen hinter der Anmeldung.
Ohne sie läuft nur die Abdeckung des nicht angemeldeten Zustands. Die Tests
ändern echte Zeilen im lokalen Stack und stellen den Seed-Zustand am Ende
wieder her.

**7. PAT-002 manuell prüfen** — Stammdaten bearbeiten

1. Als `olivia.office@praxis.invalid` anmelden.
2. „Patient:innen" → „Erika Beispiel" öffnen.
3. „Stammdaten bearbeiten" klicken.
4. Feld „Ort" ändern, „Änderungen speichern".
5. Der neue Ort steht in der Akte unter „Adresse".
6. Seite neu laden (F5) — der Wert steht weiterhin dort.
7. Als `jannes.test@praxis.invalid` (owner) anmelden und
   „Praxis → Sicherheit → Audit" öffnen: dort steht ein Eintrag
   `patient.updated`, ohne Stammdatenwerte.

**8. PAT-003 manuell prüfen** — Versorgungsstatus

Den Status dürfen `owner`, `team_lead` und `office` wechseln, `therapist`
nicht: der Wechsel nimmt eine Person aus dem laufenden Betrieb und ist damit
ein Vorgang der Praxisführung, kein Behandlungsschritt (§4.1, §4.3, §4.5).
`inactive` ist eine rein organisatorische Markierung und **kein**
Behandlungsabschluss im Sinne von ADR-008.

1. Als `olivia.office@praxis.invalid` anmelden, „Max Mustermann" öffnen.
2. „Als inaktiv markieren" klicken — es erscheint eine Rückfrage.
3. Bestätigen. Status steht auf „Inaktiv".
4. Seite neu laden — der Status bleibt „Inaktiv".
5. In der Patientenliste greift der Filter „Inaktiv".
6. „Wieder als aktiv führen" stellt den Ausgangszustand her.
7. Gegenprobe: als `anna.beispiel@praxis.invalid` (nur `therapist`) dieselbe
   Akte öffnen — die Akte ist lesbar, die Statusaktion fehlt. Das ist
   ausdrücklich **kein** Sicherheitsnachweis; verbindlich ist
   `set_patient_status`, geprüft in `pnpm test:db` und im E2E-Test
   „Autorisierung auf RPC-Ebene".

**9. CAL-001 manuell prüfen** — Termin anlegen

Termine dürfen `owner`, `therapist`, `team_lead` und `office` anlegen. Als
behandelnde Person zuordenbar sind nur aktive Mitarbeitende mit therapeutischer
Rolle; `olivia.office@praxis.invalid` taucht in der Auswahl deshalb nicht auf.

1. Als `olivia.office@praxis.invalid` anmelden, „Max Mustermann" öffnen.
2. „Termin anlegen" klicken. Der Patient steht als Kontext und ist nicht
   wechselbar.
3. Behandelnde Person „Anna Beispiel", Terminart „Praxis", ein Datum in der
   Zukunft, Beginn 09:00, Ende 10:00. Der Standort ist vorausgewählt, weil es
   nur einen gibt.
4. „Termin anlegen" — die Detailansicht zeigt Datum und Zeit in der Zeitzone
   der Praxis.
5. Seite neu laden (F5): der Termin steht weiterhin da.
6. Gegenprobe Überschneidung: einen zweiten Termin für dieselbe Person am
   gleichen Tag von 09:30 bis 10:30 anlegen. Er wird mit einer verständlichen
   Meldung abgewiesen.
7. Gegenprobe angrenzend: derselbe Zeitraum ab 10:00 wird angenommen — das
   Intervall ist halboffen.
8. Terminart „Hausbesuch" wählen: die Adresse wird aus den Stammdaten
   übernommen und ist nicht überschreibbar.

**10. CAL-002 manuell prüfen** — Kalender

1. „Kalender" in der Navigation öffnen. Die Wochenansicht zeigt sieben Tage mit
   Stundenachse; zeitgleiche Termine verschiedener Personen stehen
   nebeneinander und sind farblich unterscheidbar.
2. Zwischen „Tag" und „Woche" wechseln, mit den Pfeilen blättern, „Heute"
   nutzen. Ansicht, Datum und Filter stehen in der Adresszeile.
3. Adresszeile kopieren, neues Tab, einfügen: derselbe Stand erscheint.
4. Die Adresszeile absichtlich verstellen, etwa `?ansicht=monat&datum=2027-02-30`
   — es erscheint keine Fehlerseite, sondern die Standardansicht.
5. Nach behandelnder Person und Standort filtern.
6. Fenster auf ~375 px verschmälern (F12 → Gerätesimulation): die Woche wird zur
   gestapelten Tagesagenda, ohne horizontales Scrollen.
7. Einen Termin anklicken — die Detailansicht öffnet sich.

**11. CAL-003 manuell prüfen** — Bearbeiten und Absagen

1. Einen geplanten Termin öffnen, „Bearbeiten" klicken. Das Formular ist
   vorbefüllt; der Patient ist nicht änderbar.
2. Beginn und Ende ändern, speichern. Die Detailansicht zeigt die neue Zeit,
   auch nach dem Neuladen.
3. Terminart von „Praxis" auf „Hausbesuch" wechseln: die Adresse wird
   übernommen. Zurück auf „Video": Ort und Adresse verschwinden.
4. Konfliktprobe: denselben Termin in zwei Browser-Tabs zum Bearbeiten öffnen,
   im ersten speichern, danach im zweiten. Der zweite Versuch wird mit einer
   verständlichen Meldung abgewiesen; der Termin behält die erste Änderung.
5. „Termin absagen" klicken — es erscheint eine Rückfrage, die den betroffenen
   Termin benennt. Ein einzelner Klick sagt nichts ab.
6. Bestätigen: der Status steht auf „Abgesagt", Bearbeiten und Absagen sind
   verschwunden. Der Termin ist nicht gelöscht.
7. Im Kalender ist er standardmäßig ausgeblendet und über den Statusfilter
   „Alle" wieder sichtbar.
8. Der abgesagte Zeitraum lässt sich neu belegen.
9. Als `jannes.test@praxis.invalid` (owner) „Praxis → Sicherheit → Audit"
   öffnen: dort stehen `appointment.created`, `appointment.rescheduled`
   beziehungsweise `appointment.updated` und `appointment.cancelled` — ohne
   Stammdaten und ohne konkrete Terminzeiten.

**12. CAL-004 manuell prüfen** — Abschließen und Wiederöffnen

1. Einen geplanten Termin öffnen. Neben „Termin absagen" steht jetzt
   „Termin abschließen".
2. „Termin abschließen" klicken — ohne Rückfrage, ohne Nachfrage nach einer
   Behandlungsdokumentation. Der Status steht auf „Abgeschlossen", darunter
   erscheint „Abgeschlossen am" mit Datum und Uhrzeit in der Praxiszeitzone.
   Nirgends steht, dass etwas fehle.
3. Bearbeiten, Absagen und Abschließen sind verschwunden; stattdessen steht
   dort „Termin wieder öffnen".
4. Neu laden (F5): der Abschluss bleibt.
5. Im Kalender steht der Termin weiterhin im Tag — ohne den Filter anzufassen —
   und trägt den Vermerk „Abgeschlossen".
6. Gegenprobe belegter Zeitraum: einen zweiten Termin für dieselbe Person zur
   selben Zeit anlegen. Er wird abgewiesen. Anders als eine Absage gibt ein
   Abschluss den Zeitraum **nicht** frei.
7. „Termin wieder öffnen" klicken: der Status steht wieder auf „Geplant",
   „Abgeschlossen am" ist verschwunden, Bearbeiten und Absagen sind zurück.
   Der Termin lässt sich jetzt wieder verschieben.
8. Einen abgesagten Termin öffnen: dort gibt es weder „Termin abschließen"
   noch „Termin wieder öffnen".
9. Als `jannes.test@praxis.invalid` (owner) „Praxis → Sicherheit → Audit"
   öffnen: dort stehen zusätzlich `appointment.completed` und
   `appointment.reopened`. Beide bleiben stehen — auch der Abschluss, der
   wieder geöffnet wurde.

**13. CAL-005 manuell prüfen** — Praxisraster und Arbeitszeiten

1. Als `jannes.test@praxis.invalid` (owner) „Planung" in der Navigation öffnen.
   Oben steht das Praxisraster mit den Werten 5, 10 und 15 Minuten.
2. Auf 15 Minuten stellen und speichern. Danach einen Termin anlegen: das Feld
   „Beginn" springt in 15-Minuten-Schritten, und unter dem Feld steht das
   aktuelle Raster.
3. Gegenprobe Server: im Formular über die Tastatur `09:07` eintragen und
   speichern. Der Vorgang wird mit einem Hinweis auf das Raster abgewiesen —
   die Schrittweite des Feldes ist Bedienkomfort, verbindlich ist der Server.
4. Zurück auf „Planung": ein bestehender Termin außerhalb des Rasters bleibt im
   Kalender sichtbar und lässt sich weiter bearbeiten, solange sein Beginn
   unverändert bleibt.
5. Als `olivia.office@praxis.invalid` (office) „Planung" öffnen: das
   Praxisraster fehlt, der Wochenplan ist pflegbar.
6. Als `anna.beispiel@praxis.invalid` (therapist) „Planung" öffnen: die Zeiten
   sind sichtbar, es gibt keine Schaltfläche zum Speichern.
7. Wieder als office: beim Wochenplan „Montag" wählen, einen zweiten Block
   `13:00`–`18:00` ergänzen, speichern. Die Liste darüber zeigt beide Blöcke.
8. Gegenprobe Überschneidung: einen Block `11:00`–`14:00` ergänzen und
   speichern. Der Vorgang wird abgewiesen.
9. „Blöcke leeren" und speichern: der Wochentag steht danach auf „—", also
   ausdrücklich „an diesem Wochentag keine Termine".
10. Abweichung: unten ein Datum wählen, „An diesem Tag keine Termine" ankreuzen,
    speichern. Der Tag erscheint in der Liste darüber.
11. Einen Termin an genau diesem Tag anlegen: es erscheint die Rückfrage
    „Außerhalb der Arbeitszeit", und es wird noch nichts gespeichert. Erst
    „Termin trotzdem anlegen" legt ihn an.
12. Gegenprobe fehlende Angabe: einen Termin an einem Samstag anlegen. Auch
    hier kommt die Rückfrage — eine fehlende Arbeitszeit gilt nicht als
    „passt schon".
13. Gegenprobe Grenzen der Bestätigung: denselben Zeitraum ein zweites Mal
    bestätigen. Der Überschneidungsschutz greift weiterhin.
14. Als owner „Praxis → Sicherheit → Audit" öffnen: dort steht
    `organization.appointment_grid_changed` mit altem und neuem Minutenwert.
    Ein Minutenraster ist eine organisatorische Einstellung, kein Gesundheits-
    oder Stammdatenwert.

**14. CAL-006 manuell prüfen** — Kalenderdarstellung und Verschieben

1. „Kalender" öffnen, auf „Tag" wechseln. Jede behandelnde Person hat eine
   eigene Spalte; der hellere Hintergrund einer Spalte ist ihre Arbeitszeit.
2. Fenster verschmälern (F12 → Gerätesimulation, ~375 px): das Gitter selbst
   scrollt waagerecht, die Seite nicht. Zeitachse links und Spaltenköpfe oben
   bleiben dabei stehen.
3. Auf „Woche" wechseln: sieben Tagesspalten für **genau eine** Person. Die
   Auswahl „Behandelnde Person" wechselt sie; ein „Alle" gibt es dort nicht.
4. Adresszeile kopieren, neues Tab, einfügen: derselbe Stand erscheint —
   Ansicht, Datum, Person und Filter stehen darin.
5. In der Tagesansicht einen geplanten Termin mit der Maus auf eine andere
   Uhrzeit ziehen. Während des Ziehens zeigt ein gestrichelter Rahmen das Ziel
   mit der einrastenden Uhrzeit; der Beginn springt im Praxisraster, die Dauer
   bleibt gleich.
6. Loslassen: kurz steht „Der Termin wird verschoben …", und erst danach wandert
   die Kachel. Vorher hat der Server nichts zugesagt.
7. Denselben Termin in die Spalte einer anderen Person ziehen. Die
   Detailansicht zeigt danach die neue Person bei unveränderter Zeit.
8. In der Wochenansicht einen Termin auf einen anderen Tag ziehen.
9. Gegenprobe Randzeit: einen Termin unter 18:00 ziehen. Es erscheint die
   Rückfrage „Außerhalb der Arbeitszeit" mit dem Ziel im Klartext, und es wird
   noch nichts geschrieben. Erst „Trotzdem verschieben" führt es aus.
10. Gegenprobe Überschneidung: einen Termin auf einen bereits belegten Zeitraum
    derselben Person ziehen. Es kommt eine Fehlermeldung, keine Rückfrage.
11. Gegenprobe Status: einen Termin abschließen und dann ziehen — er bewegt
    sich nicht. Dasselbe bei einem abgesagten Termin.
12. Escape während des Ziehens bricht ab, ohne etwas zu schreiben.
13. Ziehen ist nie der einzige Weg: unter dem Kalender steht der Hinweis auf
    „Bearbeiten", und die Detailansicht bietet es unverändert an. Wer nur mit
    der Tastatur arbeitet, nutzt diesen Weg.

**15. Typische Fehler**

| Symptom                                                 | Ursache und Abhilfe                                                                                                                                |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Port 5173 is already in use`                           | Ein `pnpm dev` läuft noch. `netstat -ano \| findstr :5173` in PowerShell, dann `taskkill /PID <pid> /F`. Der Port ist bewusst fest (`strictPort`). |
| `Konfiguration unvollständig: VITE_SUPABASE_URL fehlt.` | `.env.local` fehlt oder wurde nach dem Start von `pnpm dev` angelegt — Dev-Server neu starten.                                                     |
| `E2E_SUPABASE_URL und E2E_SUPABASE_ANON_KEY fehlen.`    | Die beiden `export`-Zeilen aus Schritt 6 gelten nur im aktuellen Fenster.                                                                          |
| Anmeldung schlägt fehl, obwohl das Kennwort stimmt      | Der Stack läuft nicht oder wurde neu aufgesetzt. `pnpm dlx supabase status` prüfen, danach `pnpm dlx supabase db reset`.                           |
| E2E-Tests finden „Erika Beispiel" nicht                 | Der Seed fehlt. `pnpm dlx supabase db reset`.                                                                                                      |
| Docker startet nicht                                    | Docker Desktop muss laufen, bevor `supabase start` aufgerufen wird.                                                                                |

## Testkonten

Alle Konten verwenden das Entwicklungskennwort `LokalerTestzugang!2026`. Das ist
kein Secret, sondern ein Platzhalter für eine lokale Wegwerf-Datenbank.

| E-Mail                           | Rollen               |
| -------------------------------- | -------------------- |
| `jannes.test@praxis.invalid`     | owner, therapist     |
| `anna.beispiel@praxis.invalid`   | therapist            |
| `tim.teamleitung@praxis.invalid` | therapist, team_lead |
| `olivia.office@praxis.invalid`   | office               |
| `max.mustermann@patient.invalid` | patient              |
| `erika.beispiel@patient.invalid` | patient              |

## Befehle

```bash
pnpm format:check    # Prettier - eigenes CI-Gate, nicht Teil von lint
pnpm lint            # ESLint inkl. statischer Sicherheitsanalyse
pnpm typecheck       # TypeScript strict
pnpm test            # Unit-/Komponententests
pnpm test:db         # Migrationen + RLS gegen echtes PostgreSQL
pnpm test:e2e        # Playwright
pnpm scan:secrets    # Secret-Scan über versionierte Dateien
pnpm build
```

Steht ein Chromium bereits im System, kann er ohne Download verwendet werden:

```bash
export PLAYWRIGHT_CHROMIUM_EXECUTABLE=/pfad/zu/chromium
```

## Go-live-Blocker

Diese Punkte **müssen** vor einem Produktivbetrieb mit realen Daten erledigt
sein. Sie sind bewusst nicht Teil des aktuellen Stands.

1. **Retention und Löschung nach [ADR-008](adr/ADR-008-data-retention-and-deletion.md)
   sind dokumentiert, aber nicht implementiert.** Es gibt keinen Löschvorgang,
   keinen Legal Hold und keine Wiederanwendung wirksamer Löschungen nach einem
   Restore. Die Datenklassen stehen als `COMMENT` an den Tabellen. ADR-008 muss
   vor Produktivstart technisch umgesetzt **und getestet** sein.
2. **Providerprüfung für Supabase nach [ADR-002](adr/ADR-002-hosting-data-residency.md)**
   — ohne dokumentiertes Ergebnis darf kein Cloudprojekt mit personenbezogenen
   Daten entstehen ([ADR-015](adr/ADR-015-initial-technical-stack.md)).
3. **Datenschutzprozess nach [ADR-007](adr/ADR-007-data-protection-impact-assessment.md)**
   inklusive der sieben dort genannten Vorbedingungen.
4. **Regulatorische Prüfung der Zweckbestimmung nach
   [ADR-006](adr/ADR-006-medical-device-boundary.md).**
5. **Alle Annahmen der Kategorien Datenschutz und Recht im
   [Annahmenregister](decisions/ASSUMPTIONS.md) sind bestätigt oder geändert
   umgesetzt.** Kein Eintrag dieser Kategorien steht mehr auf `offen`
   (`PROJECT_PRINCIPLES.md` §15.1).

## Audit

Das Auditlog hat **kein** direktes `SELECT`-Recht. Gelesen wird ausschließlich
über `list_audit_events` — nur für die Rolle `owner`, strikt auf die eigene
Organisation begrenzt, mit Pagination und Filtern nach Zeitraum, Benutzer und
Aktion. Die Spalte `context` wird grundsätzlich nicht herausgegeben. Jeder
Aufruf wird selbst als `audit_log.read` protokolliert.

Geschrieben wird ausschließlich über `log_patient_record_view`. Beide Funktionen
laufen als `SECURITY DEFINER` mit leerem `search_path` und prüfen Rolle und
Organisation selbst, weil sie RLS umgehen.

Der Ereigniskatalog steht doppelt: als Check-Constraint auf `audit_log.action`
und in `src/features/audit/actions.ts`. Ein Datenbanktest hält beide
deckungsgleich.

## Bekannte Einschränkungen

1. **Die E2E-Abläufe hinter der Anmeldung laufen nur mit Docker.** Sie brauchen
   den lokalen Supabase-Stack und werden über `E2E_SUPABASE_URL` /
   `E2E_SUPABASE_ANON_KEY` freigeschaltet (siehe „Lokale Abnahme"). In CI
   startet der Job `e2e-supabase` den Stack selbst. In Umgebungen ohne Docker
   — etwa der Cloud-Entwicklungsumgebung — läuft weiterhin ausschließlich die
   Abdeckung des nicht angemeldeten Zustands.
2. **Die Abdeckung hinter der Anmeldung ist bewusst schmal.** Belegt sind die
   Kernflüsse von PAT-002 und PAT-003 samt Persistenz über einen Neuladevorgang
   und ein negativer Berechtigungsnachweis auf RPC-Ebene. Die Breite der
   Prüfung liegt weiterhin bei `pnpm test:db` und den Komponententests.
3. **Der Secret-Scan prüft nur den aktuellen Stand**, nicht die Git-Historie.
   GitHub Secret Scanning und Push Protection sollten zusätzlich in den
   Repository-Einstellungen aktiviert werden.
4. **Die statische Sicherheitsanalyse ist `eslint-plugin-security`** — sinnvoll
   für JavaScript/TypeScript, aber kein vollwertiges SAST. Eine Erweiterung ist
   offen.
5. **Kein Offline-Modus und kein Service Worker** (ADR-015, ADR-001).
6. **Abgewiesene Zugriffe werden nicht persistiert.** Die Audit-Schreibfunktion
   bricht mit einer Ausnahme ab, wodurch die Transaktion und damit auch ein
   Protokolleintrag zurückgerollt würden. Die Spalte `outcome` existiert und
   trägt derzeit ausschließlich `success`. Für die Erfassung abgewiesener
   Versuche wäre eine autonome Transaktion nötig — offen.
7. **Kein monatlicher Audit-Report** (ADR-010 führt ihn als SOLLTE) und keine
   Auswertung oder Alarmierung.

## Manuelle Schritte im Repository

Diese Einstellungen lassen sich nicht aus dem Code setzen:

- Branch Protection auf `main`: erforderliche Checks `quality`, `database`,
  `security`, `e2e`, `e2e-supabase`; Force Push verbieten (ADR-013).
- GitHub Secret Scanning und Push Protection aktivieren.
- Dependabot oder eine vergleichbare Aktualisierung der Abhängigkeiten.
