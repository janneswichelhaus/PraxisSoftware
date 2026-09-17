# Status · Stand 2026-09-17 · letzte Session: CAL-018 Hausbesuch-Szenarien

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

## Prüfverfahren, solange die CI steht

Die Actions-Minuten sind aufgebraucht: Ein Lauf endet nach Sekunden ohne Logs,
ein rotes Kreuz am PR heißt **„nicht gelaufen"**. Alle Gates laufen deshalb
lokal; die **angemeldeten E2E-Tests kann nur Jannes ausführen** (Docker) — sie
fanden in CAL-018 einen Fehler, den sieben Gates nicht sahen (BEF-010). **PR
#43 ist gemergt**, `main` ist wieder der Ausgangspunkt jedes Branches.

## Blocker (Jannes-seitig)

- **Abnahme CAL-018** — fünf Klickwege in
  [`abnahme/etappe-1-kernprozess.md`](abnahme/etappe-1-kernprozess.md)
- **Offen aus „nur Hausbesuche" (17.09.):** Was folgt daraus für die Terminart
  `practice`, für Standorte und das Praxisraster? Nichts entschieden.
- Branch Protection und Secret Scanning einschalten (M0, 30.09.),
  Anfragen B1, B2 und B4 verschicken ([`decisions/ANFRAGEN.md`](decisions/ANFRAGEN.md)),
  PTV-Free-Abo vor MAP-002 · `claude/issue-42-status-fv319v` hat drei
  ungemergte Commits

## Auf Abnahme warten

CAL-EPIC-003b (mit CAL-012/013), AKTE-000 bis AKTE-005, UX-012, UI-002,
FIX-EPIC-001 (braucht Docker), FIX-EPIC-003, CAL-014 bis CAL-018,
DAT-EPIC-001, ROL-EPIC-001, FIX-015 — Schritte in [`abnahme/`](abnahme/README.md).

## Letzte Session

**CAL-018** gebaut und gemergt: Am Hausbesuch verlangt das Nichtantreffen das
bestätigte Protokoll (15 Minuten, Klingeln, Anruf) und merkt eine
Ausfallgebühr vor; „Tür geöffnet, keine Behandlung" schließt mit
Pflichtvermerk ab, ohne Gebühr. **ANN-055 ist entschieden**: Es gibt
ausschließlich Hausbesuche (Jannes, 17.09.). Der angemeldete E2E-Lauf fand
einen echten Fehler (BEF-010), behoben in CAL-018d; BEF-009 dazu ist offen.

Lokal: `git checkout main && git pull origin main`, dann
`pnpm dlx supabase@2.116.0 db reset`. Kein `pnpm install`.
