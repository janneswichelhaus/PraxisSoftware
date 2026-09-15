# Status · Stand 2026-09-15 · letzte Session: Konsolidierung R2

Livestand, sonst nichts. Die **Reihenfolge** legt
[`development/ROADMAP.md`](development/ROADMAP.md) fest, Befunde sammelt
[`development/BEFUNDE.md`](development/BEFUNDE.md), Ideen gehören nach
[`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md). Wer hier eine Aufgabe
einträgt, hat sie damit nicht eingeplant.

## Jetzt

- **ROL-EPIC-001** — `office` liest klinische Inhalte, ohne Schreibrecht auf
  Dokumentation und mit Auditpflicht je Zugriff (E15, ADR-004 Fassung 2).
  Aufruf: `/feature-loop ROL-EPIC-001 Office liest klinische Inhalte` ·
  Pfad A · Effort: xhigh (Policies)

## Danach

- **CAL-018** — Hausbesuch-Szenarien aus E14: Nichtantreffen, Ausfallhonorar,
  Protokoll. Pfad A · Effort: Default
- **VER-EPIC-002** — Verordnung im Office-Alltag; Vorgabe in
  [`development/VER-EPIC-002.md`](development/VER-EPIC-002.md). Pfad A ·
  Effort: Default

## Blocker (Jannes-seitig)

- Branch Protection und Secret Scanning einschalten (M0, 30.09.) —
  [`DEVELOPMENT.md`](DEVELOPMENT.md), „Manuelle Schritte"
- Anfragen B1, B2 und B4 verschicken — Volltexte in
  [`decisions/ANFRAGEN.md`](decisions/ANFRAGEN.md)
- PTV-Free-Abo vor MAP-002, PTV-Vertragsdokumente vor MAP-006
- Prompt der Wochenupdate-Routine nachziehen (`DEVELOPMENT.md`)

## Auf Abnahme warten

CAL-EPIC-003b (mit CAL-012/013), AKTE-000 bis AKTE-005, UX-012, UI-002,
FIX-EPIC-001 (braucht Docker), FIX-EPIC-003, CAL-014 bis CAL-017,
DAT-EPIC-001 — Prüfschritte in [`abnahme/`](abnahme/README.md).

## Letzte Session

Konsolidierung R2: weniger Dateien, weniger Zeilen, keine Dopplungen. Neu sind
`docs/STATUS.md`, `docs/development/SESSION-START.md` und das Gate
`pnpm docs:check`; `PROJECT_PRINCIPLES.md` steht auf 0.10.1, ADR-013 auf
Fassung 3.

Nach dem Merge lokal: `git pull origin main`. Kein `pnpm install` (Lockfile
unverändert), kein `supabase db reset` (keine Migration).
