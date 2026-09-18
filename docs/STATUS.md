# Status · Stand 2026-09-18 · letzte Session: CAL-EPIC-004c Überplanen

Livestand, sonst nichts. Die **Reihenfolge** legt
[`development/ROADMAP.md`](development/ROADMAP.md) fest, Befunde sammelt
[`development/BEFUNDE.md`](development/BEFUNDE.md), Ideen gehören nach
[`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md). Wer hier eine Aufgabe
einträgt, hat sie damit nicht eingeplant.

## Jetzt

Nichts läuft. CAL-EPIC-004c liegt als PR gegen `main`, die **Abnahme steht
aus** — wie die von VER-EPIC-002 (PR #51, gemergt). Nächster Loop auf Freigabe.

## Danach — Reihenfolge seit 2026-09-18

1. **ABR-EPIC-001** — Leistungen aus durchgeführten Terminen (xhigh)
2. **ABR-EPIC-002a** — Rechnung aus Leistungen, mit Empfänger
3. **ABR-EPIC-002b** — Die Rechnung als Dokument (PDF, Storno, Erinnerung)

## Prüfverfahren

**Die CI läuft wieder** (2026-09-18, PR #48: alle fünf Läufe grün) — ein rotes Kreuz
heißt wieder „rot". Lokal: `pnpm test:db` unter Windows gegen einen Wegwerf-Container
(`docker run … supabase/postgres`, Port 54329); die **angemeldeten E2E-Tests laufen in
der Cloud nicht**, dort prüft sie nur die CI. `pnpm test` ist unter Node 24 an rund 60
navigierenden Tests rot — auf `main` genauso (**BEF-011**), CI meint Node 22.

## Blocker (Jannes-seitig)

- **Lokal `pnpm dlx supabase@2.116.0 db reset`** nach dem Merge von
  CAL-EPIC-004c (`20260918140000_appointment_coverage.sql`).
- **Abnahme CAL-018, CAL-EPIC-004a, FIX-EPIC-004, CAL-EPIC-004b, UX-013,
  GRD-001, VER-EPIC-002, CAL-EPIC-004c** —
  [`abnahme/etappe-1-kernprozess.md`](abnahme/etappe-1-kernprozess.md). Die
  **Sichtprüfung hinter der Anmeldung steht weiter aus** (`supabase start` in
  der Cloud blockiert); CAL-EPIC-004c wurde als Bauteil bei 375 und 1280 px
  geprüft.
- **E18 überführen:** nächster Schritt ist **ADR-021**, nicht Code ([`E18`](development/E18-LEISTUNGSBEREICHE.md))
- Branch Protection und Secret Scanning (M0, 30.09.), Anfragen B1, B2, B4
  ([`decisions/ANFRAGEN.md`](decisions/ANFRAGEN.md)), PTV-Free-Abo vor MAP-002 ·
  `claude/issue-42-status-fv319v` hat drei ungemergte Commits

## Auf Abnahme warten

CAL-EPIC-003b (mit CAL-012/013), AKTE-000 bis AKTE-005, UX-012, UI-002, FIX-EPIC-001
(braucht Docker), FIX-EPIC-003, CAL-014 bis CAL-018, CAL-EPIC-004a, -004b und -004c,
FIX-EPIC-004, UX-013, GRD-001, VER-EPIC-002, DAT-EPIC-001, ROL-EPIC-001, FIX-015
— [`abnahme/`](abnahme/README.md).

## Letzte Session

**CAL-EPIC-004c gebaut.** Zu einer Grundlage dürfen jetzt **mehr Termine
geplant** werden, als sie hergibt — sichtbar statt still: Gedeckt sind die
frühesten, gerechnet statt zugeteilt (**ANN-067**); der Rest trägt „Ohne
Deckung" an Grundlage, Termin und Liste. **Termine übertragen** ist ein eigener,
protokollierter Vorgang auf eine andere Grundlage derselben Patient:in — alles
oder nichts, ohne abgesagte und abgerechnete (**ANN-068**). Der Terminbereich
der Akte gruppiert nach Grundlage, je Richtung (**ANN-069**); Termine ohne
Grundlage bekommen einen eigenen Abschnitt. Die Termin-Detailseite bleibt
unberührt (BEF-006). Lokal: `git pull origin main`, dann **`db reset`**.
