# Status · Stand 2026-09-17 · letzte Session: FIX-015 (BEF-004)

Livestand, sonst nichts. Die **Reihenfolge** legt
[`development/ROADMAP.md`](development/ROADMAP.md) fest, Befunde sammelt
[`development/BEFUNDE.md`](development/BEFUNDE.md), Ideen gehören nach
[`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md). Wer hier eine Aufgabe
einträgt, hat sie damit nicht eingeplant.

## Jetzt

- **CAL-018** — Hausbesuch-Szenarien aus E14: Nichtantreffen, Ausfallhonorar,
  Protokoll. Aufruf: `/feature-loop CAL-018 Hausbesuch-Szenarien` · Pfad A ·
  Effort: Default · beginnt erst auf Freigabe

## Danach

- **VER-EPIC-002** — Verordnung im Office-Alltag; Vorgabe in
  [`development/VER-EPIC-002.md`](development/VER-EPIC-002.md), setzt auf
  ROL-EPIC-001 auf. Pfad A · Effort: Default
- **ABR-EPIC-001** — Leistungen entstehen aus durchgeführten Terminen
  (Praxis-Stammdaten, Leistungskatalog). Pfad A · Effort: xhigh (Migrationen)

## Blocker (Jannes-seitig)

- Branch Protection und Secret Scanning einschalten (M0, 30.09.) —
  [`DEVELOPMENT.md`](DEVELOPMENT.md), „Manuelle Schritte"
- Anfragen B1, B2 (mit E15 und ANN-052 Fassung 2) und B4 verschicken —
  Volltexte in [`decisions/ANFRAGEN.md`](decisions/ANFRAGEN.md)
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

ROL-EPIC-001 und FIX-015 sind seit dem 16.09. auf `main`; offen ist nur noch
die Abnahme. Lokal: `git checkout main`, `git pull origin main`, dann
`pnpm dlx supabase@2.116.0 db reset` (drei neue Migrationen). Kein
`pnpm install` (Lockfile unverändert).
