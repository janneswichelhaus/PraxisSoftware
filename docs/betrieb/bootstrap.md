# Bootstrap — die Praxis in einem leeren Projekt einrichten (OPS-007)

Runbook für den **einen** Moment, in dem es noch keine Organisation gibt: nach dem Anlegen eines
Projekts und vor dem ersten Arbeitstag darin. Gilt für die Testumgebung (Probe, M3) und das
Produktivprojekt (M4) gleichermaßen. Maßgeblich sind ADR-003 (genau eine Organisation, angelegt
beim Einrichten, keine Oberfläche dafür) und ADR-010 Punkt 9 bis 11 (privilegierter Zugriff nur
mit Anlass, MFA und Protokoll).

**Der Seed kommt hier nie zum Einsatz.** `supabase/seed.sql` ist synthetisch und nur für
Wegwerf-Datenbanken; in ein Projekt, das echte Daten tragen soll, gehört keine Zeile daraus.

Das Runbook braucht die Konsole **genau einmal**, für Schritt 2 und 3. Alles danach geht über die
Anwendung — so bleibt jeder Schritt im Auditlog nachvollziehbar.

## Stand der Probe

| Umgebung                   | Stand                                                                                    |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| lokal, nur Migrationen     | **geprobt** — `supabase/tests/bootstrap.test.ts` führt die SQL-Blöcke unten wörtlich aus |
| Testumgebung (OPS-002, M3) | **offen** — die Umgebung gibt es noch nicht                                              |
| Produktivprojekt (M4)      | **offen**                                                                                |

## 0. Voraussetzungen

- Das Projekt ist angelegt und geprüft (OPS-001, G3), die Migrationen sind **über die Pipeline**
  eingespielt (OPS-002), **ohne Seed**.
- Angemeldet ist das **Infrastrukturkonto** mit MFA, nicht ein Praxiskonto (ADR-010 Punkt 11).
- Anlass, Datum und Uhrzeit sind notiert: „Bootstrap nach OPS-007". Das ist die Begründung, die
  ADR-010 Punkt 10 verlangt.
- Bereit liegen: Name der Praxis, Name des Standorts, die IANA-Zeitzone (in aller Regel
  `Europe/Berlin`), Vor- und Nachname sowie die dienstliche E-Mail der Praxisinhaberin.

## 1. Das Konto im Anmeldedienst anlegen

Die Anwendung legt keine Konten an (ANN-025, `enable_signup = false`). Deshalb von Hand:
Dashboard → **Authentication → Users → Add user → Create new user**, dienstliche E-Mail und ein
starkes Kennwort, **„Auto Confirm User" angehakt**. Das Kennwort geht nicht in eine Notiz, sondern
direkt in den Kennwortmanager der Inhaberin.

## 2. Die Praxis einrichten

Dashboard → **SQL Editor**, den Block einsetzen, die Werte in spitzen Klammern ersetzen, einmal
ausführen:

```sql
-- runbook:bootstrap
select app.bootstrap_practice(
  p_owner_email       => '<E-Mail des Inhaberkontos>',
  p_organization_name => '<Name der Praxis>',
  p_time_zone         => 'Europe/Berlin',
  p_location_name     => '<Name des Standorts>',
  p_given_name        => '<Vorname>',
  p_family_name       => '<Nachname>'
);
```

Die Funktion legt in **einer** Transaktion Organisation, Standort, Person, Mitarbeiterdatensatz,
Profil und die Rolle `owner` an und schreibt den Auditeintrag `organization.bootstrapped`. Sie
antwortet mit den vier neuen Kennungen. Geht etwas schief, entsteht nichts; die Meldung sagt,
woran es lag:

| Meldung                 | Bedeutung und Abhilfe                                                     |
| ----------------------- | ------------------------------------------------------------------------- |
| `already_bootstrapped`  | Es gibt schon eine Organisation. **Nicht** weiter — Schritt 3 ansehen.    |
| `account not found`     | Schritt 1 fehlt, oder die E-Mail ist anders geschrieben.                  |
| `account not confirmed` | „Auto Confirm User" war nicht angehakt; im Dashboard bestätigen.          |
| `unknown time zone`     | Tippfehler in der Zeitzone.                                               |
| `permission denied`     | Aufruf nicht aus dem SQL-Editor, sondern über die Anwendung oder die API. |

## 3. Prüfen

Im selben Editor:

```sql
-- runbook:pruefung
select 'genau eine Organisation' as pruefung,
       (select count(*) = 1 from public.organizations) as ok
union all
select 'genau eine Praxisinhaberin',
       (select count(*) = 1 from public.user_roles where role_key = 'owner')
union all
select 'Einrichtung im Auditlog',
       (select count(*) = 1 from public.audit_log where action = 'organization.bootstrapped')
union all
select 'keine Konten aus dem Seed',
       not exists (select 1 from auth.users
                   where email like '%@praxis.invalid' or email like '%@patient.invalid'
                      or id::text like '11111111-1111-4111-8111-%')
union all
select 'keine Organisation aus dem Seed',
       not exists (select 1 from public.organizations where id::text like '22222222-2222-4222-8222-%')
union all
select 'keine Patientendaten',
       not exists (select 1 from public.patients);
```

Jede Zeile muss `ok = true` zeigen. Zeigt eine `false`, ist das Projekt nicht sauber: verwerfen
und neu anlegen (Schritt 5), nicht reparieren.

## 4. Die Konsole schließen — ab hier nur noch die Anwendung

Ab jetzt gilt ADR-010 Punkt 9: kein direkter Datenbankzugriff im Normalbetrieb. Die Inhaberin
meldet sich in der Anwendung an und richtet der Reihe nach ein:

1. **Mein Konto** (`/mein-konto`) — den zweiten Faktor einrichten.
2. **Team** (`/praxis/team`) — am eigenen Datensatz unter „Zugang" die Rolle `therapist` ergänzen,
   wenn die Inhaberin selbst behandelt; die Rolle `owner` bleibt.
3. **Praxis-Stammdaten** (`/abrechnung/stammdaten`) — Absender, Steuerangaben, Bankverbindung.
4. **Preisliste** (`/abrechnung/katalog`) — anlegen und in Kraft setzen.
5. **Planung** (`/praxis/planung`) — Terminraster und Dokumentationsfrist.
6. **Mitarbeitende** (`/praxis/team/neu`) — je Person anlegen, dann Arbeitszeiten und Zugang.
   Das Konto jeder Person entsteht wie in Schritt 1 von Hand (ANN-025).

Jeder dieser Schritte schreibt seinen eigenen Auditeintrag.

## 5. Rücknahme

Es gibt keine Rücknahme per Konsole. Scheitert Schritt 2 oder 3 so, dass es sich nicht mit
einem wiederholten Aufruf beheben lässt, wird das **Projekt verworfen und neu angelegt**. Solange
noch keine echten Daten darin liegen, kostet das Minuten; eine Korrektur per `delete` kostet die
Nachvollziehbarkeit (ADR-010, Konsequenzen: Korrekturen laufen über Migrationen oder die
Anwendung).

## 6. Nach dem Durchlauf

- In der Tabelle oben Umgebung und Datum eintragen.
- Anlass und Uhrzeit aus Schritt 0 zum Protokoll des privilegierten Zugriffs legen.
