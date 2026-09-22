# Praxisplattform

Zentrale Softwareplattform für eine privat abrechnende Physiotherapiepraxis mit
Schwerpunkt Hausbesuche.

**Früher Entwicklungsstand.** Es existieren ausschließlich synthetische
Testdaten; ein Produktivbetrieb ist ausdrücklich nicht freigegeben.

## Grundlagen

Verbindlich sind [`PROJECT_PRINCIPLES.md`](PROJECT_PRINCIPLES.md) und die
Architecture Decision Records in [`docs/adr/`](docs/adr/); die Rangfolge aller
Dokumente steht in `PROJECT_PRINCIPLES.md` §21. Offene Entscheidungen und
vorläufige Annahmen: [`docs/decisions/`](docs/decisions/). Reihenfolge der
Umsetzung: [`docs/development/ROADMAP.md`](docs/development/ROADMAP.md). Was
echt angebunden ist und was gekennzeichnete Vorschau:
[`docs/development/ARBEITSBEREICHE.md`](docs/development/ARBEITSBEREICHE.md).

## Stack

TypeScript · React · Vite · Tailwind CSS · TanStack Query · Zod · Supabase
(PostgreSQL, Auth, Storage) · Vitest · Playwright · GitHub Actions ([ADR-015](docs/adr/ADR-015-initial-technical-stack.md))

## Struktur

```
src/
  app/         Anwendungsrahmen, Navigation, Provider
  components/  wiederverwendbare UI-Bausteine
  features/    fachliche Module (patients, appointments, documentation, staff, audit, …)
  lib/         Konfiguration, Supabase-Client, Betriebslog-Ausgang (protokoll.ts)
  routes/      Routendefinition
supabase/
  migrations/  Datenbankmigrationen
  tests/       Migrations- und RLS-Tests gegen echtes PostgreSQL
  seed.sql     synthetische Testdaten
tests/e2e/         Playwright
scripts/           Prüf- und Hilfsskripte
marke/             Wortmarke und App-Symbole (einzige Quelle)
docs/adr/          Architecture Decision Records
docs/decisions/    offene Entscheidungen, Anfragen und Annahmenregister
docs/development/  Roadmap, Arbeitsbereiche, Befunde, Graph-Engineering-Workflow
docs/abnahme/      manuelle Prüfschritte je Feature
docs/datenschutz/  Verfahren und Nachweise für den Datenschutzprozess (ADR-007)
docs/product/      Ideenspeicher für spätere Funktionen (nicht normativ)
```

## Sicherheitsgrundsätze im Code

- Autorisierung liegt in PostgreSQL Row Level Security. Ausgeblendete
  UI-Elemente sind keine Zugriffskontrolle ([ADR-004](docs/adr/ADR-004-authorization-model.md)).
- Der Browser erhält ausschließlich den öffentlichen `anon`-Schlüssel.
- Zugriffe auf Patientenakten werden protokolliert ([ADR-010](docs/adr/ADR-010-audit-and-privileged-access.md)).
- Keine patientenbezogenen Daten in Logs ([ADR-011](docs/adr/ADR-011-logging-and-observability.md)).

## Schnellstart

Einrichtung, Testkonten und Befehle: [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).
