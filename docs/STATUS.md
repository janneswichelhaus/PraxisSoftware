# Status · Stand 2026-09-18 · letzte Session: UX-013 Kopfleistensuche

Livestand, sonst nichts. Die **Reihenfolge** legt
[`development/ROADMAP.md`](development/ROADMAP.md) fest, Befunde sammelt
[`development/BEFUNDE.md`](development/BEFUNDE.md), Ideen gehören nach
[`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md). Wer hier eine Aufgabe
einträgt, hat sie damit nicht eingeplant.

## Jetzt

Nichts läuft. UX-013 liegt als PR gegen `main`, die **Abnahme steht aus** —
wie die von CAL-EPIC-004b (PR #48, gemergt). Nächster Loop auf Freigabe.

## Danach — Reihenfolge seit 2026-09-18

1. **GRD-001** — Behandlungsgrundlage nach
   [ADR-020](adr/ADR-020-treatment-basis.md) (angenommen); Migration, `test:db`
2. **VER-EPIC-002** — Verordnung im Office-Alltag
3. **CAL-EPIC-004c** — überplanen, Termine je Verordnung (nach beiden oben)

Danach unverändert: ABR-EPIC-001 (xhigh).

## Prüfverfahren

**Die CI läuft wieder** (2026-09-18, PR #48: alle fünf Läufe grün) — ein rotes
Kreuz heißt wieder „rot". Lokal: `pnpm test:db` unter Windows gegen einen
Wegwerf-Container (`docker run … supabase/postgres`, Port 54329); die
**angemeldeten E2E-Tests laufen in der Cloud nicht** (`supabase start` blockiert),
dort prüft sie nur die CI. `pnpm test` ist unter Node 24 an rund 60 navigierenden
Tests rot — auf `main` genauso (**BEF-011**), CI meint Node 22.

## Blocker (Jannes-seitig)

- **Lokal `pnpm dlx supabase@2.116.0 db reset`** nach dem Merge von
  CAL-EPIC-004b (`20260918110000_event_series.sql`); UX-013 bringt keine mit.
- **Abnahme CAL-018, CAL-EPIC-004a, FIX-EPIC-004, CAL-EPIC-004b, UX-013** —
  [`abnahme/etappe-1-kernprozess.md`](abnahme/etappe-1-kernprozess.md)
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
FIX-EPIC-004, UX-013, DAT-EPIC-001, ROL-EPIC-001, FIX-015 — [`abnahme/`](abnahme/README.md).

## Letzte Session

**UX-013 gebaut.** Die Kopfleiste sucht Funktionen, Bereiche und Vorgänge — aus der
Navigation abgeleitet, auf die Rolle gefiltert (Relevanz, keine Zugriffskontrolle) —
und darunter, in einer zweiten Gruppe, weiterhin **Namen**: **E17 hat auf deine Frage
eine Fassung 2 bekommen**, der Schritt mehr aus einem Termin heraus entfällt wieder.
Strg/Cmd + K, Pfeiltasten, Eingabetaste; bei ~375 px bildschirmfüllend. Die
Patientensuche steht zusätzlich im Bereich „Patient:innen". **ANN-061** neu; eine
Verordnungssuche wäre eine eigene Story (ROADMAP). Lokal: `git pull origin main`.
