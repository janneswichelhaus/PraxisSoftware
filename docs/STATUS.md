# Status · Stand 2026-09-15 · letzte Session: FIX-015 (BEF-004)

Livestand, sonst nichts. Die **Reihenfolge** legt
[`development/ROADMAP.md`](development/ROADMAP.md) fest, Befunde sammelt
[`development/BEFUNDE.md`](development/BEFUNDE.md), Ideen gehören nach
[`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md). Wer hier eine Aufgabe
einträgt, hat sie damit nicht eingeplant.

## Jetzt

- **CAL-018** — Hausbesuch-Szenarien aus E14: Nichtantreffen, Ausfallhonorar,
  Protokoll. Aufruf: `/feature-loop CAL-018 Hausbesuch-Szenarien` · Pfad A ·
  Effort: Default · beginnt erst auf Freigabe, nach den Merges unten

## Danach

- **VER-EPIC-002** — Verordnung im Office-Alltag; Vorgabe in
  [`development/VER-EPIC-002.md`](development/VER-EPIC-002.md), setzt auf
  ROL-EPIC-001 auf. Pfad A · Effort: Default
- **ABR-EPIC-001** — Leistungen entstehen aus durchgeführten Terminen
  (Praxis-Stammdaten, Leistungskatalog). Pfad A · Effort: xhigh (Migrationen)

## Zum Merge — Reihenfolge verbindlich

1. **PR #41** — ROL-EPIC-001, `claude/rol-epic-001` → `main`.
2. **PR zu FIX-015** — `claude/fix-bef-004`, gestapelt auf
   `claude/rol-epic-001`; enthält die Commits von #41. Erst nach #41 mergen,
   vorher die Basis auf `main` stellen, falls GitHub das nicht selbst tut.

Stand beider: CI grün, Zweitreview in frischem Kontext gelaufen (ROL-EPIC-001:
Befund BEF-004, jetzt behoben; FIX-015: siehe PR), Abnahme durch Jannes offen.

## Blocker (Jannes-seitig)

- Branch Protection und Secret Scanning einschalten (M0, 30.09.) —
  [`DEVELOPMENT.md`](DEVELOPMENT.md), „Manuelle Schritte"
- Anfragen B1, B2 und B4 verschicken — Volltexte in
  [`decisions/ANFRAGEN.md`](decisions/ANFRAGEN.md); E15 und ANN-052 Fassung 2
  gehören in B2
- PTV-Free-Abo vor MAP-002, PTV-Vertragsdokumente vor MAP-006
- Prompt der Wochenupdate-Routine nachziehen (`DEVELOPMENT.md`)

## Auf Abnahme warten

CAL-EPIC-003b (mit CAL-012/013), AKTE-000 bis AKTE-005, UX-012, UI-002,
FIX-EPIC-001 (braucht Docker), FIX-EPIC-003, CAL-014 bis CAL-017,
DAT-EPIC-001, ROL-EPIC-001, FIX-015 — Prüfschritte in
[`abnahme/`](abnahme/README.md).

## Letzte Session

FIX-015 (Befund-Loop zu BEF-004, Pfad A): Die Storage-API gibt eine Datei nur
noch gegen eine einmalige, protokollierte Ausstellung heraus — beim Signieren,
Laden, Auflisten, Kopieren und Entfernen, auch mit bekanntem Schlüssel und
nach einem früheren Öffnen; ein ausgestellter Verweis gilt weiter 60 Sekunden.
Zuerst rot gegen die laufende API belegt, dann behoben (ANN-052 Fassung 2,
neues Auditereignis `storage_deletion.claimed`). E15-Umsetzungsvermerke
nachgezogen. Offen bleiben BEF-005 und die Datenschutzprüfung B2.

Nach beiden Merges lokal: `git checkout main`, `git pull origin main`, dann
`pnpm dlx supabase@2.116.0 db reset` (drei neue Migrationen). Kein
`pnpm install` (Lockfile unverändert).
