# Status · Stand 2026-09-18 · letzte Session: CAL-EPIC-004a Freie Länge, Rückfrage

Livestand, sonst nichts. Die **Reihenfolge** legt
[`development/ROADMAP.md`](development/ROADMAP.md) fest, Befunde sammelt
[`development/BEFUNDE.md`](development/BEFUNDE.md), Ideen gehören nach
[`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md). Wer hier eine Aufgabe
einträgt, hat sie damit nicht eingeplant.

## Jetzt

- **CAL-EPIC-004b** — Anlegen-Menü (Spanne aufziehen), Fehlzeit und
  Dauerfehlzeit. Aufruf: `/feature-loop CAL-EPIC-004b` · Pfad A · Vorgabe in
  [`development/CAL-EPIC-004.md`](development/CAL-EPIC-004.md) (CAL-019,
  CAL-021) · beginnt auf Freigabe, **nach dem Merge von CAL-EPIC-004a**

## Danach — Reihenfolge seit 2026-09-16

1. **UX-013** — Kopfleiste sucht Funktionen; hängt an nichts, vorziehbar
2. **GRD-001** — Behandlungsgrundlage nach
   [ADR-020](adr/ADR-020-treatment-basis.md) (angenommen); Migration, `test:db`
3. **VER-EPIC-002** — Verordnung im Office-Alltag

Danach unverändert: CAL-EPIC-004c · ABR-EPIC-001 (xhigh).

## Prüfverfahren, solange die CI steht

Die Actions-Minuten sind aufgebraucht: ein rotes Kreuz am PR heißt **„nicht
gelaufen"**. Alle Gates laufen lokal; `pnpm test:db` läuft unter Windows gegen
einen Wegwerf-Container (`docker run … supabase/postgres`, Port 54329), die
**angemeldeten E2E-Tests kann nur Jannes ausführen**. `pnpm test` ist unter
Node 24 an zwölf Kalendertests rot — auf `main` genauso (**BEF-011**), CI und
`engines` meinen Node 22.

## Blocker (Jannes-seitig)

- **PR zu CAL-EPIC-004a mergen**, danach lokal `db reset` (neue Migration).
- **Abnahme CAL-018 und CAL-EPIC-004a** — Klickwege in
  [`abnahme/etappe-1-kernprozess.md`](abnahme/etappe-1-kernprozess.md)
- **ANN-056 bestätigen:** Die freie Länge muss ein Vielfaches des Praxisrasters
  sein (5/10/15 Minuten). Reicht das, oder braucht die Praxis Längen dazwischen?
- **E18 überführen:** nächster Schritt ist **ADR-021**, nicht Code
  ([`development/E18-LEISTUNGSBEREICHE.md`](development/E18-LEISTUNGSBEREICHE.md))
- Branch Protection und Secret Scanning (M0, 30.09.), Anfragen B1, B2, B4
  ([`decisions/ANFRAGEN.md`](decisions/ANFRAGEN.md)), PTV-Free-Abo vor MAP-002 ·
  `claude/issue-42-status-fv319v` hat drei ungemergte Commits

## Auf Abnahme warten

CAL-EPIC-003b (mit CAL-012/013), AKTE-000 bis AKTE-005, UX-012, UI-002, FIX-EPIC-001
(braucht Docker), FIX-EPIC-003, CAL-014 bis CAL-018, CAL-EPIC-004a, DAT-EPIC-001,
ROL-EPIC-001, FIX-015 — Schritte in [`abnahme/`](abnahme/README.md).

## Letzte Session

**CAL-EPIC-004a gebaut** (CAL-020, CAL-023). Der Server nimmt jede Terminlänge im
Praxisraster an; wer weder 45 noch 60 Minuten dauert, trägt in Kalender und allen
Terminlisten ein Zeichen mit Vorlesetext. Das Ziehen fragt beim Loslassen immer nach,
der Arbeitszeit-Hinweis steht im selben Kasten, die Rückgängig-Leiste bleibt. **ANN-056**
ersetzt ANN-037; BEF-008 erledigt, BEF-011 neu. Lokal nach dem Merge:
`git checkout main && git pull origin main`, dann `pnpm dlx supabase@2.116.0 db reset`.
