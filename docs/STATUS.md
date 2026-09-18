# Status · Stand 2026-09-18 · letzte Session: VER-EPIC-002 Office-Formular

Livestand, sonst nichts. Die **Reihenfolge** legt
[`development/ROADMAP.md`](development/ROADMAP.md) fest, Befunde sammelt
[`development/BEFUNDE.md`](development/BEFUNDE.md), Ideen gehören nach
[`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md). Wer hier eine Aufgabe
einträgt, hat sie damit nicht eingeplant.

## Jetzt

Nichts läuft. VER-EPIC-002 liegt als PR gegen `main`, die **Abnahme steht
aus** — wie die von GRD-001 (PR #50, gemergt). Nächster Loop auf Freigabe.

## Danach — Reihenfolge seit 2026-09-18

1. **CAL-EPIC-004c** — überplanen, Termine je Grundlage (CAL-022, AKTE-006)
2. **ABR-EPIC-001** — Leistungen aus durchgeführten Terminen (xhigh)
3. **ABR-EPIC-002a** — Rechnung aus Leistungen, mit Empfänger

## Prüfverfahren

**Die CI läuft wieder** (2026-09-18, PR #48: alle fünf Läufe grün) — ein rotes Kreuz
heißt wieder „rot". Lokal: `pnpm test:db` unter Windows gegen einen Wegwerf-Container
(`docker run … supabase/postgres`, Port 54329); die **angemeldeten E2E-Tests laufen in
der Cloud nicht**, dort prüft sie nur die CI. `pnpm test` ist unter Node 24 an rund 60
navigierenden Tests rot — auf `main` genauso (**BEF-011**), CI meint Node 22.

## Blocker (Jannes-seitig)

- **Lokal `pnpm dlx supabase@2.116.0 db reset`** nach dem Merge von
  VER-EPIC-002 (`20260918130000_appointment_count.sql`, Seed geändert).
- **Abnahme CAL-018, CAL-EPIC-004a, FIX-EPIC-004, CAL-EPIC-004b, UX-013,
  GRD-001, VER-EPIC-002** —
  [`abnahme/etappe-1-kernprozess.md`](abnahme/etappe-1-kernprozess.md). Die
  **Sichtprüfung hinter der Anmeldung steht weiter aus** (`supabase start` in
  der Cloud blockiert); VER-EPIC-002 wurde als Bauteil bei 375 und 1280 px
  geprüft.
- **E18 überführen:** nächster Schritt ist **ADR-021**, nicht Code ([`E18`](development/E18-LEISTUNGSBEREICHE.md))
- Branch Protection und Secret Scanning (M0, 30.09.), Anfragen B1, B2, B4
  ([`decisions/ANFRAGEN.md`](decisions/ANFRAGEN.md)), PTV-Free-Abo vor MAP-002 ·
  `claude/issue-42-status-fv319v` hat drei ungemergte Commits

## Auf Abnahme warten

CAL-EPIC-003b (mit CAL-012/013), AKTE-000 bis AKTE-005, UX-012, UI-002, FIX-EPIC-001
(braucht Docker), FIX-EPIC-003, CAL-014 bis CAL-018, CAL-EPIC-004a und -004b,
FIX-EPIC-004, UX-013, GRD-001, VER-EPIC-002, DAT-EPIC-001, ROL-EPIC-001, FIX-015
— [`abnahme/`](abnahme/README.md).

## Letzte Session

**VER-EPIC-002 gebaut.** Das Office hakt Heilmittel an — KG, MT, beide auch als
Doppelbehandlung, Hausbesuch — und trägt daneben die **Anzahl möglicher Termine**
ein. Die steht jetzt an der Grundlage und ist **nicht mehr die Summe der
Positionen**: Sechs Termine mit drei Heilmitteln boten vorher achtzehn (**ANN-064**).
„Genutzt", „Position hinzufügen", Therapieziel und das zweite Bemerkungsfeld sind
weg; es gibt ein Feld **„Anmerkungen"** (**ANN-065**), der Katalog ist eine Liste im
Code (**ANN-066**). Bestandswerte bleiben sichtbar; eine **Empfehlungsanzeige** gibt
es nicht — keine Quelle, Wiedervorlage in der Roadmap. Lokal: `git pull origin main`,
dann **`db reset`**.
