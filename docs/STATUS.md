# Status · Stand 2026-09-16 · letzte Session: CAL-018 Hausbesuch-Szenarien

Livestand, sonst nichts. Die **Reihenfolge** legt
[`development/ROADMAP.md`](development/ROADMAP.md) fest, Befunde sammelt
[`development/BEFUNDE.md`](development/BEFUNDE.md), Ideen gehören nach
[`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md). Wer hier eine Aufgabe
einträgt, hat sie damit nicht eingeplant.

## Jetzt

- **CAL-EPIC-004a** — freie Terminlänge (0.11 §8.1) und Rückfrage beim Ziehen.
  Aufruf: `/feature-loop CAL-EPIC-004a` · Pfad A · Vorgabe in
  [`development/CAL-EPIC-004.md`](development/CAL-EPIC-004.md) · beginnt auf
  Freigabe

## Danach — Reihenfolge seit 2026-09-16

1. **CAL-EPIC-004b** — Anlegen-Menü, Fehlzeit und Dauerfehlzeit
2. **UX-013** — Kopfleiste sucht Funktionen; hängt an nichts, vorziehbar
3. **GRD-001** — Behandlungsgrundlage nach
   [ADR-020](adr/ADR-020-treatment-basis.md) (angenommen); Migration, `test:db`

Danach unverändert: VER-EPIC-002 · CAL-EPIC-004c · ABR-EPIC-001 (xhigh).

## Blocker (Jannes-seitig)

- **GitHub-Actions-Minuten des Monats aufgebraucht** (2026-09-16): kein CI-Lauf
  und damit **kein Merge** bis zum Reset. Entwickeln, Pushen und die lokalen
  Gates laufen weiter. **Solange nichts gemergt ist, beginnt jeder neue Branch
  auf dem zuletzt gepushten Branch, nicht auf `main`** — dieser Stand, ADR-020,
  CAL-EPIC-004 und CAL-018 liegen nur dort.
- **ANN-055 entscheiden:** Soll ein Nichtantreffen **in der Praxis** ebenfalls
  eine Ausfallgebühr auslösen? E14 regelt nur den Hausbesuch; bis dahin bleibt
  der Praxisvermerk ohne Gebühr.
- Branch Protection und Secret Scanning einschalten (M0, 30.09.) —
  [`DEVELOPMENT.md`](DEVELOPMENT.md), „Manuelle Schritte"
- Anfragen B1, B2 (mit E15 und ANN-052 Fassung 2) und B4 (mit E14 Fall 1)
  verschicken — Volltexte in [`decisions/ANFRAGEN.md`](decisions/ANFRAGEN.md)
- PTV-Free-Abo vor MAP-002, PTV-Vertragsdokumente vor MAP-006
- Prompt der Wochenupdate-Routine nachziehen (`DEVELOPMENT.md`)

## Auf Abnahme warten

CAL-EPIC-003b (mit CAL-012/013), AKTE-000 bis AKTE-005, UX-012, UI-002,
FIX-EPIC-001 (braucht Docker), FIX-EPIC-003, CAL-014 bis CAL-018,
DAT-EPIC-001, ROL-EPIC-001, FIX-015 — Prüfschritte in
[`abnahme/`](abnahme/README.md). **PR #41 und #42 sind gemergt.**

## Letzte Session

**CAL-018** gebaut: Am Hausbesuch verlangt das Nichtantreffen das bestätigte
Protokoll (15 Minuten, Klingeln, Anruf) und merkt danach eine Ausfallgebühr
vor; „Tür geöffnet, keine Behandlung" schließt mit Pflichtvermerk ab, ohne
Gebühr; der Termin führt erklärend durch die Szenarien. Neu: **ANN-055**.
Nachgezogen: ANN-035, ADR-018 Punkt 9, Prinzipien **0.11.2**, E14, Abnahme.
Der angemeldete E2E-Lauf fand dabei einen Fehler, den die lokalen Gates nicht
sahen (Akte ohne Pflichtvermerk) — behoben, mit Test über beide Lesepfade.

Lokal: `git pull origin claude/erste-offene-aufgabe-76ya36`, dann
`pnpm dlx supabase@2.116.0 db reset` (neue Migration). Kein `pnpm install`.
