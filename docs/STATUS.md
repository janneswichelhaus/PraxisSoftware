# Status · Stand 2026-09-18 · letzte Session: FIX-EPIC-004 Kalender-Bedienung

Livestand, sonst nichts. Die **Reihenfolge** legt
[`development/ROADMAP.md`](development/ROADMAP.md) fest, Befunde sammelt
[`development/BEFUNDE.md`](development/BEFUNDE.md), Ideen gehören nach
[`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md). Wer hier eine Aufgabe
einträgt, hat sie damit nicht eingeplant.

## Jetzt

- **CAL-EPIC-004b** — Anlegen-Menü (Spanne aufziehen), Fehlzeit und
  Dauerfehlzeit. Aufruf: `/feature-loop CAL-EPIC-004b` · Pfad A · Vorgabe in
  [`development/CAL-EPIC-004.md`](development/CAL-EPIC-004.md) (CAL-019,
  CAL-021) · beginnt auf Freigabe, **nach dem Merge von FIX-EPIC-004**

## Danach — Reihenfolge seit 2026-09-18

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
Node 24 an rund 60 navigierenden Tests rot — auf `main` genauso (**BEF-011**);
CI und `engines` meinen Node 22.

## Blocker (Jannes-seitig)

- **PR zu FIX-EPIC-004 mergen**, danach lokal `db reset` (neue Migration).
- **Abnahme CAL-018, CAL-EPIC-004a, FIX-EPIC-004** — Klickwege in
  [`abnahme/etappe-1-kernprozess.md`](abnahme/etappe-1-kernprozess.md)
- **E18 überführen:** nächster Schritt ist **ADR-021**, nicht Code
  ([`development/E18-LEISTUNGSBEREICHE.md`](development/E18-LEISTUNGSBEREICHE.md))
- Branch Protection und Secret Scanning (M0, 30.09.), Anfragen B1, B2, B4
  ([`decisions/ANFRAGEN.md`](decisions/ANFRAGEN.md)), PTV-Free-Abo vor MAP-002 ·
  `claude/issue-42-status-fv319v` hat drei ungemergte Commits
- Das Annahmenregister steht bei 798 von 800 Zeilen — vor ANN-059 kürzen oder
  die Obergrenze anheben (`scripts/docs-check.mjs`).

## Auf Abnahme warten

CAL-EPIC-003b (mit CAL-012/013), AKTE-000 bis AKTE-005, UX-012, UI-002, FIX-EPIC-001
(braucht Docker), FIX-EPIC-003, CAL-014 bis CAL-018, CAL-EPIC-004a, FIX-EPIC-004,
DAT-EPIC-001, ROL-EPIC-001, FIX-015 — Schritte in [`abnahme/`](abnahme/README.md).

## Letzte Session

**FIX-EPIC-004 gebaut** (FIX-016 bis FIX-019, Befunde von Jannes). Rückfragen
der Terminformulare sind Fenster über dem Inhalt, das Anlegen kehrt in den
Kalender zurück; die Zieh-Rückfrage steht im Gitter mit Umriss und neuer Kachel;
Ziehen scrollt und blättert; die Vergangenheit ist mit Bestätigung erlaubt.
**ANN-057, ANN-058** neu; BEF-012 bis BEF-016 erledigt. Lokal nach dem Merge:
`git checkout main && git pull origin main`, dann `pnpm dlx supabase@2.116.0 db reset`.
