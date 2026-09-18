# Status · Stand 2026-09-18 · letzte Session: GRD-001 Behandlungsgrundlage

Livestand, sonst nichts. Die **Reihenfolge** legt
[`development/ROADMAP.md`](development/ROADMAP.md) fest, Befunde sammelt
[`development/BEFUNDE.md`](development/BEFUNDE.md), Ideen gehören nach
[`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md). Wer hier eine Aufgabe
einträgt, hat sie damit nicht eingeplant.

## Jetzt

Nichts läuft. GRD-001 liegt als PR gegen `main`, die **Abnahme steht aus** —
wie die von UX-013 (PR #49, gemergt). Nächster Loop auf Freigabe.

## Danach — Reihenfolge seit 2026-09-18

1. **VER-EPIC-002** — Verordnung im Office-Alltag (Feldvorgaben bestätigen)
2. **CAL-EPIC-004c** — überplanen, Termine je Grundlage (nach VER-EPIC-002)
3. **ABR-EPIC-001** — Leistungen aus durchgeführten Terminen (xhigh)

## Prüfverfahren

**Die CI läuft wieder** (2026-09-18, PR #48: alle fünf Läufe grün) — ein rotes
Kreuz heißt wieder „rot". Lokal: `pnpm test:db` unter Windows gegen einen
Wegwerf-Container (`docker run … supabase/postgres`, Port 54329); die
**angemeldeten E2E-Tests laufen in der Cloud nicht** (`supabase start` blockiert),
dort prüft sie nur die CI. `pnpm test` ist unter Node 24 an rund 60 navigierenden
Tests rot — auf `main` genauso (**BEF-011**), CI meint Node 22.

## Blocker (Jannes-seitig)

- **Lokal `pnpm dlx supabase@2.116.0 db reset`** nach dem Merge von GRD-001
  (`20260918120000_treatment_basis.sql`), falls nötig auch für CAL-EPIC-004b.
- **Abnahme CAL-018, CAL-EPIC-004a, FIX-EPIC-004, CAL-EPIC-004b, UX-013,
  GRD-001** — [`abnahme/etappe-1-kernprozess.md`](abnahme/etappe-1-kernprozess.md).
  Die **Sichtprüfung zu GRD-001 steht aus**: Die Seiten liegen hinter der
  Anmeldung, `supabase start` ist in der Cloud blockiert.
- **E18 überführen:** nächster Schritt ist **ADR-021**, nicht Code
  ([`development/E18-LEISTUNGSBEREICHE.md`](development/E18-LEISTUNGSBEREICHE.md))
- Branch Protection und Secret Scanning (M0, 30.09.), Anfragen B1, B2, B4
  ([`decisions/ANFRAGEN.md`](decisions/ANFRAGEN.md)), PTV-Free-Abo vor MAP-002 ·
  `claude/issue-42-status-fv319v` hat drei ungemergte Commits

## Auf Abnahme warten

CAL-EPIC-003b (mit CAL-012/013), AKTE-000 bis AKTE-005, UX-012, UI-002, FIX-EPIC-001
(braucht Docker), FIX-EPIC-003, CAL-014 bis CAL-018, CAL-EPIC-004a und -004b,
FIX-EPIC-004, UX-013, GRD-001, DAT-EPIC-001, ROL-EPIC-001, FIX-015 —
[`abnahme/`](abnahme/README.md).

## Letzte Session

**GRD-001 gebaut.** Ein Termin hängt jetzt an einer **Behandlungsgrundlage**;
die Verordnung ist eine Bauart, der Selbstzahler die zweite (ADR-020). Die
Tabellen heißen `treatment_bases`/`treatment_base_items`, 29 Funktionen wurden
dafür neu erstellt; die Auditwerte treten **neben** die alten. Ein Selbstzahler
bekommt Kontingent, Deckung und Serienplanung geschenkt und heißt in der Akte
„Selbstzahler seit …". **ANN-062** (Adressen bleiben `verordnungen`) und
**ANN-063** (Löschjournal wandert mit) neu; zwei Fehler dabei gefunden und
behoben (innerer Verbund auf die Verordner:in, leerer Name statt `null`).
Lokal: `git pull origin main`, dann **`db reset`**.
