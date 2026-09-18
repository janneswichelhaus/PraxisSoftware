# Status · Stand 2026-09-18 · letzte Session: CAL-EPIC-004b Anlegen-Menü und Fehlzeiten

Livestand, sonst nichts. Die **Reihenfolge** legt
[`development/ROADMAP.md`](development/ROADMAP.md) fest, Befunde sammelt
[`development/BEFUNDE.md`](development/BEFUNDE.md), Ideen gehören nach
[`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md). Wer hier eine Aufgabe
einträgt, hat sie damit nicht eingeplant.

## Jetzt

Nichts läuft. CAL-EPIC-004b liegt als PR gegen `main`, Abnahme steht aus; der
nächste Loop beginnt auf Freigabe.

## Danach — Reihenfolge seit 2026-09-18

1. **UX-013** — Kopfleiste sucht Funktionen; hängt an nichts · Pfad A · Vorgabe
   in [`development/CAL-EPIC-004.md`](development/CAL-EPIC-004.md)
2. **GRD-001** — Behandlungsgrundlage nach
   [ADR-020](adr/ADR-020-treatment-basis.md) (angenommen); Migration, `test:db`
3. **VER-EPIC-002** — Verordnung im Office-Alltag

Danach unverändert: CAL-EPIC-004c · ABR-EPIC-001 (xhigh).

## Prüfverfahren, solange die CI steht

Die Actions-Minuten sind aufgebraucht: ein rotes Kreuz am PR heißt **„nicht
gelaufen"**. Alle Gates laufen lokal; `pnpm test:db` läuft unter Windows gegen
einen Wegwerf-Container (`docker run … supabase/postgres`, Port 54329), die
**angemeldeten E2E-Tests kann nur Jannes ausführen**. `pnpm test` ist unter
Node 24 an rund 60 navigierenden Tests rot — auf `main` genauso (**BEF-011**);
CI und `engines` meinen Node 22.

## Blocker (Jannes-seitig)

- **PR zu CAL-EPIC-004b mergen**, danach lokal `db reset` (neue Migration
  `20260918110000_event_series.sql`).
- **Abnahme CAL-018, CAL-EPIC-004a, FIX-EPIC-004, CAL-EPIC-004b** — Klickwege
  in [`abnahme/etappe-1-kernprozess.md`](abnahme/etappe-1-kernprozess.md)
- **E18 überführen:** nächster Schritt ist **ADR-021**, nicht Code
  ([`development/E18-LEISTUNGSBEREICHE.md`](development/E18-LEISTUNGSBEREICHE.md))
- Branch Protection und Secret Scanning (M0, 30.09.), Anfragen B1, B2, B4
  ([`decisions/ANFRAGEN.md`](decisions/ANFRAGEN.md)), PTV-Free-Abo vor MAP-002 ·
  `claude/issue-42-status-fv319v` hat drei ungemergte Commits
- **Gegenlesen:** Die Obergrenze des Annahmenregisters steht seit CAL-EPIC-004b
  bei 1000 statt 800 Zeilen (`scripts/docs-check.mjs`, Begründung dort).

## Auf Abnahme warten

CAL-EPIC-003b (mit CAL-012/013), AKTE-000 bis AKTE-005, UX-012, UI-002, FIX-EPIC-001
(braucht Docker), FIX-EPIC-003, CAL-014 bis CAL-018, CAL-EPIC-004a und -004b,
FIX-EPIC-004, DAT-EPIC-001, ROL-EPIC-001, FIX-015 — [`abnahme/`](abnahme/README.md).

## Letzte Session

**CAL-EPIC-004b gebaut** (CAL-019, CAL-021). Auf der freien Fläche wird eine
Spanne aufgezogen, danach steht das Anlegen-Menü mit vier Einträgen im Gitter;
die Fehlzeit ist ein Ereignis, die Dauerfehlzeit eine Serie mit eigener Kennung
neben der Gruppenkennung — Ändern und Absagen gelten wahlweise für ein Vorkommen
oder die ganze Serie. **ANN-059, ANN-060** neu. Nach dem Merge lokal:
`git checkout main && git pull origin main`, `pnpm dlx supabase@2.116.0 db reset`.
