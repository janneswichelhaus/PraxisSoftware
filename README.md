# Praxisplattform

Zentrale Softwareplattform für eine privat abrechnende Physiotherapiepraxis mit
Schwerpunkt Hausbesuche.

**Früher Entwicklungsstand.** Es existieren ausschließlich synthetische
Testdaten; ein Produktivbetrieb ist ausdrücklich nicht freigegeben.

## Verbindliche Grundlagen

| Dokument                                                               | Inhalt                                              |
| ---------------------------------------------------------------------- | --------------------------------------------------- |
| [`PROJECT_PRINCIPLES.md`](PROJECT_PRINCIPLES.md)                       | Produkt-, Sicherheits- und Datenschutzprinzipien    |
| [`docs/adr/`](docs/adr/)                                               | Architecture Decision Records (ADR-001 bis ADR-015) |
| [`docs/decisions/OPEN_DECISIONS.md`](docs/decisions/OPEN_DECISIONS.md) | offene Entscheidungen                               |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)                           | Einrichtung, Testkonten, Einschränkungen            |

## Stack

TypeScript · React · Vite · Tailwind CSS · TanStack Query · Zod · Supabase
(PostgreSQL, Auth, Storage) · Vitest · Playwright · GitHub Actions ([ADR-015](docs/adr/ADR-015-initial-technical-stack.md))

## Struktur

```
src/
  app/         Anwendungsrahmen, Provider
  components/  wiederverwendbare UI-Bausteine
  features/    fachliche Module (auth, session, patients, dashboard)
  lib/         Konfiguration, Supabase-Client
  routes/      Routendefinition
supabase/
  migrations/  Datenbankmigrationen
  tests/       Migrations- und RLS-Tests gegen echtes PostgreSQL
  seed.sql     synthetische Testdaten
tests/e2e/     Playwright
docs/          Prinzipien, ADRs, Entwicklungsdoku
```

## Sicherheitsgrundsätze im Code

- Autorisierung liegt in PostgreSQL Row Level Security. Ausgeblendete
  UI-Elemente sind keine Zugriffskontrolle ([ADR-004](docs/adr/ADR-004-authorization-model.md)).
- Der Browser erhält ausschließlich den öffentlichen `anon`-Schlüssel.
- Zugriffe auf Patientenakten werden protokolliert ([ADR-010](docs/adr/ADR-010-audit-and-privileged-access.md)).
- Keine patientenbezogenen Daten in Logs ([ADR-011](docs/adr/ADR-011-logging-and-observability.md)).

## Schnellstart

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Details in [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).
