# Status · Stand 2026-09-20 · letzte Session: ABR-EPIC-004 (Etappe L, Loop 1 von 5)

Livestand, sonst nichts. Die **Reihenfolge** legt [`development/ROADMAP.md`](development/ROADMAP.md)
fest, Befunde sammelt [`development/BEFUNDE.md`](development/BEFUNDE.md), Ideen gehören nach
[`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md); ein Eintrag hier ist keine Einplanung.

## Jetzt

**ABR-EPIC-004 ist gebaut** (Roadmap 5.27) — erster Loop der **Etappe L**, der einzige, der Gebautes
korrigiert. Jede Rechnung nennt den **Grund der Steuerbefreiung** (§ 14 Abs. 4 Nr. 8 UStG) im
**Snapshot** und im Druckbild (**BEF-019 erledigt**); der **§ 14c-Riegel** sperrt vor der Ausstellung
serverseitig jeden Steuerausweis an einem steuerfreien oder nicht steuerbaren Posten — elf
Datenbanktests, nach ADR-009 Punkt 18 verbindlich. Neu: **ANN-082** (fester Text je Kennzeichen).
Stand 35,4 → **35,9 Prozent**, vier Loops der Etappe L stehen aus.

## Danach — Reihenfolge seit 2026-09-20

1. **LEI-EPIC-001** — Trainingsverhältnis: Tabelle, Datenklasse, Löschlauf, Trainingsbetreuung
2. **CAL-EPIC-005** — Terminkontext und Trainingsgrundlage; braucht LEI-EPIC-001
3. **ABR-EPIC-005** — ein Bereich je Rechnung, getrennte Nummernkreise; braucht CAL-EPIC-005

Daneben: **MAP-002** ist **startbar** (PTV-Free-Schlüssel liegt vor) · **E18 Schritt 7** und
**`MDR_REVIEW_REQUIRED` verorten** als eigene Sitzungen; kein Loop wartet darauf.

## Prüfverfahren

**Die CI läuft wieder** (seit PR #48). Lokal: `pnpm test:db` gegen einen Wegwerf-Container (Port
54329), seit R3 halb so lang; **angemeldete E2E-Tests laufen in der Cloud nicht**, Rest: `.env.local`.
`ASSUMPTIONS.md` steht mit ANN-082 **auf seiner Obergrenze** (1090) — der nächste Loop mit einer
Annahme hebt sie in `scripts/docs-check.mjs`, wie die vier davor.

## Blocker (Jannes-seitig)

- **PTV-Schlüssel nur lokal** (Abo seit 2026-09-20): `.env.local`, nie ins Repository, synthetische
  Koordinaten; offen: **Domainbindung** (ADR-019).
- **Lokal `pnpm dlx supabase@2.116.0 db reset`** nach dem Merge (zwei Migrationen aus ABR-EPIC-004,
  Seed unverändert). **Node 22** (`.nvmrc`), sonst rot.
- **G13 ist überfällig:** Nummernformat (**je Nummernkreis**, ABR-EPIC-005), Umsatzsteuer-Status und
  **der Wortlaut des Befreiungshinweises** stehen als Annahme (ANN-074, ANN-075, **ANN-082**); dazu
  echte Preise und Stammdaten.
- **M0 am 30.09.:** B1, B2, B4 ([`decisions/ANFRAGEN.md`](decisions/ANFRAGEN.md)) — **B2 trägt** die
  Trennung aus ADR-021, die Einwilligung im Training, die Office-Sicht (§4.8) und **neu die Frist für
  Screening-Daten** (sonst Annahme in LEI-EPIC-001) · **Secret Scanning und Push Protection** ·
  Kartendienst ablegen.
- **Abnahme R3** (25 Befunde umgesetzt, 26 bleiben Backlog) und **CAL-018, CAL-EPIC-004a/b/c,
  FIX-EPIC-004, UX-013, GRD-001, VER-EPIC-002, ABR-EPIC-001, ABR-EPIC-002a/b, ABR-EPIC-003** in
  [`abnahme/etappe-1-kernprozess.md`](abnahme/etappe-1-kernprozess.md); **Sichtprüfung hinter der
  Anmeldung wartet auf OPS-002**.
- **B8:** Lizenzbeleg · **OPS-001** offen · `claude/issue-42-status-fv319v` ungemergt.

## Auf Abnahme warten

Alles aus Etappe 1 seit CAL-EPIC-003b, dazu DAT-EPIC-001, ROL-EPIC-001, FIX-015 und neu **ABR-EPIC-004**
([`abnahme/etappe-l-leistungsbereiche.md`](abnahme/etappe-l-leistungsbereiche.md)); FIX-EPIC-001 braucht Docker. Gesamtliste: [`abnahme/README.md`](abnahme/README.md).

## Letzte Session

**ABR-EPIC-004 — zwei Stories, zwei Migrationen, elf Datenbank- und drei Komponententests.** Über die
Vorgabe hinaus ging nichts. **Offen:** die Sichtprüfung hinter der Anmeldung (kein GoTrue in der Cloud)
— das Blatt prüft Jannes lokal. Lokal: `git pull origin main`, dann `db reset`.
