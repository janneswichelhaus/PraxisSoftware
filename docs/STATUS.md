# Status · Stand 2026-09-16 · letzte Session: Vorgaben aus dem iPrax-Vergleich

Livestand, sonst nichts. Die **Reihenfolge** legt
[`development/ROADMAP.md`](development/ROADMAP.md) fest, Befunde sammelt
[`development/BEFUNDE.md`](development/BEFUNDE.md), Ideen gehören nach
[`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md). Wer hier eine Aufgabe
einträgt, hat sie damit nicht eingeplant.

## Jetzt

- **CAL-018** — Hausbesuch-Szenarien aus E14: Nichtantreffen, Ausfallhonorar,
  Protokoll. Aufruf: `/feature-loop CAL-018 Hausbesuch-Szenarien` · Pfad A ·
  Effort: Default · beginnt auf Freigabe

## Danach

- **CAL-EPIC-004** — Anlegen-Menü im Kalender, freie Terminlänge, Fehlzeiten,
  Überplanung einer Verordnung, Rückfrage beim Verschieben, Akte nach
  Verordnung, Funktionssuche. Vorgabe in
  [`development/CAL-EPIC-004.md`](development/CAL-EPIC-004.md) · Pfad A ·
  **Einordnung in die Roadmap steht noch aus**
- **VER-EPIC-002** — Verordnung im Office-Alltag;
  [`development/VER-EPIC-002.md`](development/VER-EPIC-002.md), setzt auf
  ROL-EPIC-001 auf · Pfad A · Effort: Default
- **ABR-EPIC-001** — Leistungen aus durchgeführten Terminen · Pfad A · xhigh

## Blocker (Jannes-seitig)

- **GitHub-Actions-Minuten des Monats aufgebraucht** (2026-09-16): kein CI-Lauf
  und damit **kein Merge** bis zum Reset. Entwickeln, Pushen und die lokalen
  Gates laufen weiter.
- **E16 entscheiden** — Abrechnungsgrundlage neben der Verordnung
  (Selbstzahler: planbare Klammer oder nur Abrechnungsart?). P1 **vor**
  VER-EPIC-002 und ABR-EPIC-001, [`decisions/OPEN_DECISIONS.md`](decisions/OPEN_DECISIONS.md)
- **E17 bestätigen** — wohin die Patientensuche zieht, wenn die Kopfleiste
  Funktionen sucht
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
[`abnahme/`](abnahme/README.md). **PR #41 und #42 sind gemergt.**

## Letzte Session

Keine Codeänderung. Jannes hat am Vergleich mit iPrax sechs Festlegungen
getroffen; sie stehen als Loop-Vorgabe in `development/CAL-EPIC-004.md`, als
Befunde BEF-006 bis BEF-008 und als E16/E17 in den offenen Entscheidungen. Die
Terminlänge ist damit **frei** — das ändert eine MUSS-Anforderung und steht in
`PROJECT_PRINCIPLES.md` **0.11 §8.1**, gebaut wird es in CAL-020.

Lokal: `git pull origin claude/nice-goldberg-kcnct0`. Kein `pnpm install`,
keine neue Migration.
