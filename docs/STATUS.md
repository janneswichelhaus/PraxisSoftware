# Status · Stand 2026-09-19 · letzte Session: ABR-EPIC-002a Rechnung

Livestand, sonst nichts. Die **Reihenfolge** legt
[`development/ROADMAP.md`](development/ROADMAP.md) fest, Befunde sammelt
[`development/BEFUNDE.md`](development/BEFUNDE.md), Ideen gehören nach
[`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md); ein Eintrag hier ist keine Einplanung.

## Jetzt

Nichts läuft. ABR-EPIC-002a liegt als PR gegen `main`, die **Abnahme steht
aus** — wie die von ABR-EPIC-001 (PR #53, gemergt). Nächster Loop auf Freigabe.

## Danach — Reihenfolge seit 2026-09-19

1. **ABR-EPIC-002b** — Die Rechnung als Dokument (PDF, Storno, Erinnerung);
   braucht vorher die Entscheidung zu **B14** (Optionen liegen vor)
2. **ABR-EPIC-003** — Zahlungen und offene Posten
3. **MAP-002** — Fahrzeiten und Navigations-Handoff; braucht das PTV-Free-Abo

## Prüfverfahren

**Die CI läuft wieder** (seit PR #48). Lokal: `pnpm test:db` gegen einen
Wegwerf-Container (Port 54329); **angemeldete E2E-Tests laufen in der Cloud
nicht**. `pnpm test` war unter Node 24 rot (**BEF-011**), lief hier grün.

## Blocker (Jannes-seitig)

- **Lokal `pnpm dlx supabase@2.116.0 db reset`** nach dem Merge von
  ABR-EPIC-002a (drei Migrationen, geänderter Seed).
- **B14 entscheiden** — Weg für das Rechnungs-PDF, Vorlage in
  [`decisions/rechnungs-pdf-optionen.md`](decisions/rechnungs-pdf-optionen.md);
  ABR-EPIC-002b beginnt nicht ohne sie.
- **G13 ist überfällig:** Nummernformat und Umsatzsteuer-Status stehen als
  Annahme (ANN-074, ANN-075); dazu **echte Preise und Praxisstammdaten** — der
  Seed trägt erfundene.
- **E18 überführen:** nächster Schritt ist **ADR-021**, nicht Code
  ([`E18`](development/E18-LEISTUNGSBEREICHE.md))
- **Abnahme CAL-018, CAL-EPIC-004a/b/c, FIX-EPIC-004, UX-013, GRD-001,
  VER-EPIC-002, ABR-EPIC-001, ABR-EPIC-002a** in
  [`abnahme/etappe-1-kernprozess.md`](abnahme/etappe-1-kernprozess.md); die
  **Sichtprüfung hinter der Anmeldung steht aus** (`supabase start` blockiert).
- Branch Protection und Secret Scanning (M0, 30.09.), Anfragen B1, B2, B4
  ([`decisions/ANFRAGEN.md`](decisions/ANFRAGEN.md)), PTV-Free-Abo vor MAP-002 ·
  `claude/issue-42-status-fv319v` hat drei ungemergte Commits

## Auf Abnahme warten

Alles aus Etappe 1 seit CAL-EPIC-003b, dazu DAT-EPIC-001, ROL-EPIC-001 und
FIX-015; FIX-EPIC-001 braucht Docker. Die Liste führt
[`abnahme/README.md`](abnahme/README.md).

## Letzte Session

**ABR-EPIC-002a gebaut, mit ABR-000.** Die Praxis hat einen
**Rechnungsabsender**; sein Umsatzsteuerstatus ist **nicht vorbelegt**
(**ANN-074**). **Empfänger** sind eigene Zeilen, die Patientin selbst bekommt
keine — sie ist die Vorgabe (**ANN-076**). Die **Rechnung** kennt zwei Zustände,
die **Nummer** entsteht lückenlos beim Ausstellen (**ANN-075**), der **Snapshot**
ist ein versioniertes Dokument ohne klinische Inhalte, je Person und Monat
(**ANN-077**). Lokal: `git pull`, dann **`db reset`**.
