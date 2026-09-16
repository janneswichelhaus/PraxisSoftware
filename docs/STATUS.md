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

## Danach — Reihenfolge seit 2026-09-16

Vorgabe der vier neuen Loops:
[`development/CAL-EPIC-004.md`](development/CAL-EPIC-004.md). Alle Pfad A.

1. **CAL-EPIC-004a** — freie Terminlänge (0.11 §8.1) + Rückfrage beim Ziehen
2. **CAL-EPIC-004b** — Anlegen-Menü, Fehlzeit und Dauerfehlzeit
3. **UX-013** — Kopfleiste sucht Funktionen; hängt an nichts, vorziehbar
4. **GRD-001** — Behandlungsgrundlage nach [ADR-020](adr/ADR-020-treatment-basis.md);
   Migration, `test:db` · **wartet auf die Annahme des ADR**
5. **VER-EPIC-002** — [`development/VER-EPIC-002.md`](development/VER-EPIC-002.md)
6. **CAL-EPIC-004c** — Überplanung, Übertragung, Akte je Grundlage
7. **ABR-EPIC-001** — Leistungen aus durchgeführten Terminen · xhigh

## Blocker (Jannes-seitig)

- **GitHub-Actions-Minuten des Monats aufgebraucht** (2026-09-16): kein CI-Lauf
  und damit **kein Merge** bis zum Reset. Entwickeln, Pushen und die lokalen
  Gates laufen weiter.
- **[ADR-020](adr/ADR-020-treatment-basis.md) annehmen** — die
  Behandlungsgrundlage aus E16, ausgearbeitet; ohne Annahme startet GRD-001
  nicht. Dabei mitbestätigen: „Privatrezept" ist die vorhandene Verordnung,
  keine dritte Bauart
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

Keine Codeänderung. Jannes' Festlegungen aus dem iPrax-Vergleich stehen als
Vorgabe in `development/CAL-EPIC-004.md`, als BEF-006 bis BEF-008 und in den
offenen Entscheidungen. Die Terminlänge ist **frei** — eine MUSS-Änderung,
`PROJECT_PRINCIPLES.md` **0.11 §8.1**, gebaut in CAL-020. E16 und E17 sind
entschieden; aus E16 wurde ADR-020, aus der Reihenfolge ein Plan.

Lokal: `git pull origin claude/nice-goldberg-kcnct0`. Kein `pnpm install`.
