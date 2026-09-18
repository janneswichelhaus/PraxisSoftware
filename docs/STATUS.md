# Status · Stand 2026-09-18 · laufend: FIX-EPIC-004 Kalender-Bedienung

Livestand, sonst nichts. Die **Reihenfolge** legt
[`development/ROADMAP.md`](development/ROADMAP.md) fest, Befunde sammelt
[`development/BEFUNDE.md`](development/BEFUNDE.md), Ideen gehören nach
[`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md). Wer hier eine Aufgabe
einträgt, hat sie damit nicht eingeplant.

## Jetzt

- **FIX-EPIC-004** — Kalender-Bedienung: Rückfragen als Fenster, Rückfrage
  beim Ziehen im Gitter, Ziehen über den Ausschnitt hinaus, Vergangenheit
  erlaubt (BEF-012 bis BEF-016). Aufruf: `/feature-loop FIX-EPIC-004` · Pfad A ·
  läuft seit 2026-09-18 auf Freigabe

## Danach — Reihenfolge seit 2026-09-18

1. **CAL-EPIC-004b** — Anlegen-Menü, Fehlzeit und Dauerfehlzeit
   ([`development/CAL-EPIC-004.md`](development/CAL-EPIC-004.md))
2. **UX-013** — Kopfleiste sucht Funktionen; hängt an nichts, vorziehbar
3. **GRD-001** — Behandlungsgrundlage nach
   [ADR-020](adr/ADR-020-treatment-basis.md) (angenommen); Migration, `test:db`

Danach unverändert: VER-EPIC-002 · CAL-EPIC-004c · ABR-EPIC-001 (xhigh).

## Prüfverfahren, solange die CI steht

Die Actions-Minuten sind aufgebraucht: ein rotes Kreuz am PR heißt **„nicht
gelaufen"**. Alle Gates laufen lokal; `pnpm test:db` läuft unter Windows gegen
einen Wegwerf-Container (`docker run … supabase/postgres`, Port 54329), die
**angemeldeten E2E-Tests kann nur Jannes ausführen**. `pnpm test` ist unter
Node 24 an rund 60 navigierenden Tests rot — auf `main` genauso (**BEF-011**);
CI und `engines` meinen Node 22.

## Blocker (Jannes-seitig)

- **Abnahme CAL-018 und CAL-EPIC-004a** — Klickwege in
  [`abnahme/etappe-1-kernprozess.md`](abnahme/etappe-1-kernprozess.md)
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
(von Jannes bestätigt: nur 5-Minuten-Schritte) ersetzt ANN-037; BEF-008 erledigt, BEF-011 neu. Lokal nach dem Merge:
`git checkout main && git pull origin main`, dann `pnpm dlx supabase@2.116.0 db reset`.
