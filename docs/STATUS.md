# Status · Stand 2026-09-20 · letzte Session: ADR-009 Fassung 2 angenommen (E18, Schritt 4 fertig)

Livestand, sonst nichts. Die **Reihenfolge** legt [`development/ROADMAP.md`](development/ROADMAP.md)
fest, Befunde sammelt [`development/BEFUNDE.md`](development/BEFUNDE.md), Ideen gehören nach
[`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md); ein Eintrag hier ist keine Einplanung.

## Jetzt

**ADR-009 Fassung 2 ist angenommen** (2026-09-20, E18 Schritt 4): Steuerkennzeichen am **Posten**
statt am Kunden, **ein Leistungsbereich je Rechnung**, getrennte Nummernkreise, der **§ 14c-Riegel**,
die Auswertung „Einnahmen je Leistungsart"; Punkte 1 bis 14 unverändert. Damit sind **die Schritte 1
bis 4 aus E18 abgeschlossen** (ADR-021, ADR-022, ADR-006 Fassung 3, ADR-009 Fassung 2; §21 **0.12.2**)
und **Schritt 5 ist frei** — **gebaut ist von E18 nichts**. **R3 ist vollständig gemergt** (PR #57,
#58, #59), `R3-UEBERGABE.md` weiter nur auf `claude/r3-analyse`; **Etappe 1 der Abrechnung ist
gebaut**, Abnahme steht aus.

## Danach — Reihenfolge seit 2026-09-20

1. **`PROJECT_PRINCIPLES.md` neue Version** — §1, §4, Zweckbestimmung und §14 nachziehen
   (E18, Schritt 5); Rang 1, Entscheidungsarbeit, kein Code
2. **Roadmap neu schneiden** (E18, Schritt 6) — dort landet, was aus ADR-009 Fassung 2 zu bauen ist, samt **BEF-019**
3. **MAP-002** — In-App-Kartenprototyp; parallel startbar, sobald das PTV-Free-Abo vorliegt

## Prüfverfahren

**Die CI läuft wieder** (seit PR #48). Lokal: `pnpm test:db` gegen einen Wegwerf-Container (Port
54329), seit R3 in der halben Zeit; **angemeldete E2E-Tests laufen in der Cloud nicht**, die
übrigen brauchen `.env.local`.

## Blocker (Jannes-seitig)

- **PTV-Free-Abo vor MAP-002** — ohne Schlüssel läuft der Prototyp nur gegen
  den Mock-Adapter (ADR-019); nur synthetische Koordinaten.
- **Lokal `pnpm dlx supabase@2.116.0 db reset`** nach dem Merge von R3 (eine
  Migration aus G2); Seed unverändert. **Node 22** (`.nvmrc`), sonst rot.
- **G13 ist überfällig:** Nummernformat und Umsatzsteuer-Status stehen als
  Annahme (ANN-074, ANN-075); dazu **echte Preise und Praxisstammdaten** — der
  Seed trägt erfundene. **Schritt 4 gilt jetzt** (getrennte Kreise je Bereich).
- **M0 am 30.09.:** B1, B2, B4 ([`decisions/ANFRAGEN.md`](decisions/ANFRAGEN.md))
  — **B2 trägt** die Trennung aus ADR-021 und die Einwilligung im Training ·
  **Secret Scanning und Push Protection prüfen** · Kartendienst ablegen.
- **Abnahme R3** (25 Befunde umgesetzt, 26 bleiben Backlog) und **CAL-018,
  CAL-EPIC-004a/b/c, FIX-EPIC-004, UX-013, GRD-001, VER-EPIC-002, ABR-EPIC-001,
  ABR-EPIC-002a/b, ABR-EPIC-003** in [`abnahme/etappe-1-kernprozess.md`](abnahme/etappe-1-kernprozess.md);
  **Sichtprüfung hinter der Anmeldung wartet auf OPS-002**.
- **B8:** Lizenzbeleg · **OPS-001** offen · `claude/issue-42-status-fv319v`
  ungemergt.

## Auf Abnahme warten

Alles aus Etappe 1 seit CAL-EPIC-003b, dazu DAT-EPIC-001, ROL-EPIC-001, FIX-015;
FIX-EPIC-001 braucht Docker. Liste: [`abnahme/README.md`](abnahme/README.md).

## Letzte Session

**ADR-009 Fassung 2 angenommen** — kein Code, keine Migration, kein Test; alle sechs neuen Punkte wie
vorgeschlagen. Nachgezogen: Status, Datum und Änderungshistorie im ADR, die Fassung in
[`adr/README.md`](adr/README.md) — der einzigen Stelle, die Fassung und Status führt —, Schritt 4 in E18
und in der Roadmap (Vermerk 5.24). §21 und der Index in `CLAUDE.md` nennen für ADR-009 keine Fassung und
blieben unberührt. **BEF-019 bleibt offen**, mit Punkt 18 jetzt verbindlich. Lokal: `git pull origin main`.
