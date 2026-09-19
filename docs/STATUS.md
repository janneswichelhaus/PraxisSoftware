# Status · Stand 2026-09-19 · letzte Session: ABR-EPIC-001 Leistungen

Livestand, sonst nichts. Die **Reihenfolge** legt
[`development/ROADMAP.md`](development/ROADMAP.md) fest, Befunde sammelt
[`development/BEFUNDE.md`](development/BEFUNDE.md), Ideen gehören nach
[`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md); ein Eintrag hier ist keine Einplanung.

## Jetzt

Nichts läuft. ABR-EPIC-001 liegt als PR gegen `main`, die **Abnahme steht
aus** — wie die von CAL-EPIC-004c (PR #52, gemergt). Nächster Loop auf Freigabe.

## Danach — Reihenfolge seit 2026-09-19

1. **ABR-EPIC-002a** — Rechnung aus Leistungen, mit Empfänger; **mit ABR-000**
   (Praxisstammdaten), aus ABR-EPIC-001 hierher gewandert
2. **ABR-EPIC-002b** — Die Rechnung als Dokument (PDF, Storno, Erinnerung)
3. **ABR-EPIC-003** — Zahlungen und offene Posten

## Prüfverfahren

**Die CI läuft wieder** (seit PR #48) — ein rotes Kreuz heißt wieder „rot".
Lokal: `pnpm test:db` gegen einen Wegwerf-Container (Port 54329); die
**angemeldeten E2E-Tests laufen in der Cloud nicht**. `pnpm test` ist unter
Node 24 an rund 60 navigierenden Tests rot — auf `main` genauso (**BEF-011**).

## Blocker (Jannes-seitig)

- **Lokal `pnpm dlx supabase@2.116.0 db reset`** nach dem Merge von
  ABR-EPIC-001 (drei Migrationen, geänderter Seed).
- **Echter Leistungskatalog mit Preisen** und die steuerliche Einordnung je
  Position (G13, B4) — der Seed trägt **erfundene** Preise; für ABR-EPIC-002a
  dazu die Praxisstammdaten (Anschrift, Bank, Steuernummer, USt-Status).
- **E18 überführen:** nächster Schritt ist **ADR-021**, nicht Code
  ([`E18`](development/E18-LEISTUNGSBEREICHE.md))
- **Abnahme CAL-018, CAL-EPIC-004a/b/c, FIX-EPIC-004, UX-013, GRD-001,
  VER-EPIC-002, ABR-EPIC-001** in
  [`abnahme/etappe-1-kernprozess.md`](abnahme/etappe-1-kernprozess.md). Die
  **Sichtprüfung hinter der Anmeldung steht aus** (`supabase start` blockiert);
  ABR-EPIC-001 ist als Bauteil bei 375 und 1280 px geprüft.
- Branch Protection und Secret Scanning (M0, 30.09.), Anfragen B1, B2, B4
  ([`decisions/ANFRAGEN.md`](decisions/ANFRAGEN.md)), PTV-Free-Abo vor MAP-002 ·
  `claude/issue-42-status-fv319v` hat drei ungemergte Commits

## Auf Abnahme warten

Alles aus Etappe 1 seit CAL-EPIC-003b, dazu DAT-EPIC-001, ROL-EPIC-001 und
FIX-015; FIX-EPIC-001 braucht Docker. Die Liste führt
[`abnahme/README.md`](abnahme/README.md).

## Letzte Session

**ABR-EPIC-001 gebaut, ohne ABR-000.** Der **Katalog** ist eine eingefrorene
Preisliste: Entwurf änderbar, in Kraft unveränderlich, Sperre am Trigger
(**ANN-070**); Preise in ganzen Cent, Steuerkennzeichen je Position, pflegen
darf nur `owner` (**ANN-071**). **Leistungen** entstehen nur aus „dokumentiert"
oder aus einem Gebührenanlass — **ohne Override**, denn §19 schlägt den älteren
Roadmap-Text (**ANN-072**) —, je Termin und Position höchstens einmal, und sie
schreiben die genutzte Menge der Grundlage fort (**ANN-073**). Neue Datenklasse
Abrechnungsdaten (§ 147 AO). Lokal: `git pull`, dann **`db reset`**.
