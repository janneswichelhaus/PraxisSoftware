# Status · Stand 2026-09-15 · letzte Session: ROL-EPIC-001

Livestand, sonst nichts. Die **Reihenfolge** legt
[`development/ROADMAP.md`](development/ROADMAP.md) fest, Befunde sammelt
[`development/BEFUNDE.md`](development/BEFUNDE.md), Ideen gehören nach
[`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md). Wer hier eine Aufgabe
einträgt, hat sie damit nicht eingeplant.

## Jetzt

- **CAL-018** — Hausbesuch-Szenarien aus E14: Nichtantreffen, Ausfallhonorar,
  Protokoll. Aufruf: `/feature-loop CAL-018 Hausbesuch-Szenarien` · Pfad A ·
  Effort: Default

## Danach

- **VER-EPIC-002** — Verordnung im Office-Alltag; Vorgabe in
  [`development/VER-EPIC-002.md`](development/VER-EPIC-002.md), setzt auf
  ROL-EPIC-001 auf. Pfad A · Effort: Default
- **ABR-EPIC-001** — Leistungen entstehen aus durchgeführten Terminen
  (Praxis-Stammdaten, Leistungskatalog). Pfad A · Effort: xhigh (Migrationen)

## Blocker (Jannes-seitig)

- Branch Protection und Secret Scanning einschalten (M0, 30.09.) —
  [`DEVELOPMENT.md`](DEVELOPMENT.md), „Manuelle Schritte"
- Anfragen B1, B2 und B4 verschicken — Volltexte in
  [`decisions/ANFRAGEN.md`](decisions/ANFRAGEN.md); E15 ist jetzt gebaut
- PTV-Free-Abo vor MAP-002, PTV-Vertragsdokumente vor MAP-006
- Prompt der Wochenupdate-Routine nachziehen (`DEVELOPMENT.md`)
- Vermerke „bis ROL-EPIC-001" in `PROJECT_PRINCIPLES.md` §4.3, ADR-004,
  ADR-016, ADR-017 und `OPEN_DECISIONS.md` E15 nachziehen (Rang 1/2)

## Auf Abnahme warten

CAL-EPIC-003b (mit CAL-012/013), AKTE-000 bis AKTE-005, UX-012, UI-002,
FIX-EPIC-001 (braucht Docker), FIX-EPIC-003, CAL-014 bis CAL-017,
DAT-EPIC-001, ROL-EPIC-001 — Prüfschritte in [`abnahme/`](abnahme/README.md).

## Letzte Session

ROL-EPIC-001 (Pfad A, drei Stories und ein Nachtrag): `office` liest
Dokumentation mit Verlauf, Verordnung mit Diagnose und klinische Dateien samt
Scan, jeder Zugriff wird protokolliert; kein neues Schreib-, Lösch- oder
Korrekturrecht. Zweitreview in frischem Kontext ohne kritischen Befund; offen
ist **BEF-004** (Dateizugriff am Auditeintrag vorbei, seit DAT-001) als
eigener Loop.

Nach dem Merge lokal: `git pull origin main`, dann
`pnpm dlx supabase@2.116.0 db reset` (zwei neue Migrationen). Kein
`pnpm install` (Lockfile unverändert).
