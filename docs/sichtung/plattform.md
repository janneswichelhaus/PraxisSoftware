# Sichtung — Block 4: Plattformzugang

Stand 2026-09-30 · entsteht mit dem ersten Oberflächen-Loop des Blocks (POR-EPIC-001).

**Deckt ab:** POR-EPIC-001
**Wo:** lokal mit `pnpm dlx supabase@2.116.0 start`, am Handy im WLAN ([`../DEVELOPMENT.md`](../DEVELOPMENT.md)). Konten: `DEVELOPMENT.md`, „Testkonten“; dazu die Plattformkonten `tina.plattform@patient.invalid` (Training) und `erika.plattform@patient.invalid` (Behandlung und Training), Kennwort wie die übrigen.
**Einladung einlösen (Schritt 1)** braucht den Zugangsdienst, der sonst aus bleibt (ADR-023 Punkt 9): `supabase/functions/.env.local` mit `PLATFORM_ACCESS_ADMIN_KEY=<service_role key aus supabase status>`, `APP_URL=http://<Rechner-IP>:5173`, `MAIL_PROVIDER=mock` und `MAIL_MOCK_URL=<Inbucket-Adresse aus supabase status>`, dann `pnpm dlx supabase@2.116.0 functions serve platform-access --no-verify-jwt --env-file supabase/functions/.env.local`. Nur synthetische Daten, nur lokal.
**Dauer:** rund 20 Minuten.

| #   | Rolle                       | Tun                                                                                                                                                                                                                                                                                                                             | Erwarten                                                                                                                                                                                                                                                                                                                                                                                                       | Loops        |
| --- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| 1   | office, dann eine Patientin | Als Olivia am Rechner: Akte **Max Mustermann → Stammdaten**, Abschnitt **Plattform** → **Vor Ort einladen** → **Code anzeigen**. Mit dem Handy den Code scannen, eine eigene Adresse und ein Kennwort (12 Zeichen) festlegen, **Zugang einrichten**. Am Rechner **Fertig**, dann **Per Mail einladen** ansehen, ohne zu senden. | Der Code füllt den Schirm nicht über den Rand. Am Handy die Seite „Ihr Zugang“, die Adresszeile zeigt **keinen** Code mehr. Danach ohne weitere Anmeldung „Guten Tag – Sie sind bei Test Praxis Tuebingen angemeldet“, **kein** Menü der Praxis, unten nur „Übersicht“. Am Rechner nach dem Neuladen „Aktiv“. Bei **Per Mail einladen** die Adresse aus der Akte und das Häkchen „selbst bestätigt“ (ANN-188). | POR-EPIC-001 |
| 2   | Patientin, dann office      | Am Handy als `erika.plattform@patient.invalid` anmelden, **Training** antippen, **Ich** öffnen. Am Rechner als Olivia Erikas Akte → **Plattform** → **Sperren**. Am Handy die Übersicht neu laden, dann **Ich → Abmelden**.                                                                                                     | Oben der Schalter **Behandlung · Training**, darunter der gewählte Bereich; kein Name, keine Adresse, keine Termine. Unter „Ich“ die eigene Adresse, **Abmelden** und **Überall abmelden**. Nach dem Sperren **ohne** Neuanmelden nur noch „Training“, der Schalter ist weg (ADR-023 Punkt 18); das Training bleibt, weil jeder Zugang für sich gilt.                                                          | POR-EPIC-001 |
| 3   | owner                       | Als Jannes: Erikas Akte → **Plattform** → **Entsperren**; **Training → Tina** ansehen; **Organisatorisches → Protokoll**.                                                                                                                                                                                                       | Bei Tina ein eigener Abschnitt **Plattform** mit „Aktiv“ — unabhängig von der Akte. Im Protokoll „Zur Plattform eingeladen“, „Plattformzugang eingerichtet“ mit dem Akteur **Plattformkonto**, „gesperrt“ und „entsperrt“ — ohne Namen, ohne Code im Eintrag.                                                                                                                                                  | POR-EPIC-001 |

## Nicht in dieser Sichtung

- **Kein Zugriff eines Plattformkontos auf irgendetwas der Praxis**: `pnpm test:db`
  (`plattform-abschottung.test.ts` prüft alle Tabellen und alle freigegebenen Funktionen in jedem
  Zustand des Zugangs).
- **Rollen je Verhältnis, Zustände, Einlösen, ein Konto je Person, unter 18 kein Zugang, Löschlauf**
  mit Konto nach 30 Tagen und Nachweis nach drei Jahren: `pnpm test:db` (`platform-accesses.test.ts`).
- **Negativfälle der Projektion** (fremde Person, gesperrt, entzogen, Lesefrist, Praxiskonto, andere
  Organisation): `pnpm test:db` (`platform-context.test.ts`).
- **Zugangsdienst** (Konto anlegen, Aufräumen im Fehlerfall, neues Kennwort, Versand über `mock`):
  Komponententests unter `supabase/functions/platform-access/`.

## Ergebnis

Gesichtet am: — · Gerät: — · Befunde: —
