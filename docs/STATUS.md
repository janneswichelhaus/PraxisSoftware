# Status · Stand 2026-09-20 · letzte Session: ADR-006 Fassung 3 angenommen (E18, Schritt 3)

Livestand, sonst nichts. Die **Reihenfolge** legt [`development/ROADMAP.md`](development/ROADMAP.md)
fest, Befunde sammelt [`development/BEFUNDE.md`](development/BEFUNDE.md), Ideen gehören nach
[`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md); ein Eintrag hier ist keine Einplanung.

## Jetzt

**E18 Schritt 3 ist abgeschlossen:** ADR-006 Fassung 3 ist angenommen — die Zweckbestimmung gilt
über **beide** Leistungsbereiche, die drei Feature-Verbote sind Ausschlusskriterien. Die Fassung
führt allein [`adr/README.md`](adr/README.md), §21 nennt keine und blieb unberührt. **Schritt 4
(ADR-009 neue Fassung) ist damit frei.** **ADR-021 und ADR-022 sind angenommen** (§21 **0.12.2**),
**gebaut ist von E18 nichts**. **R3 ist vollständig gemergt** (PR #57, #58, #59),
`R3-UEBERGABE.md` weiter nur auf `claude/r3-analyse`; **Etappe 1 der Abrechnung ist gebaut**,
Abnahme steht aus.

## Danach — Reihenfolge seit 2026-09-20

1. **ADR-009 neue Fassung** — Steuerkennzeichen am Posten, getrennte Nummernkreise, §14c-Riegel
   (E18, Schritt 4); Entscheidungsarbeit, kein Code
2. **`PROJECT_PRINCIPLES.md` neue Version** — §1, §4, Zweckbestimmung und §14 nachziehen
   (E18, Schritt 5); Rang 1, kommt zuletzt
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
  Seed trägt erfundene. **Schritt 4 fasst dieselbe Stelle an.**
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

**ADR-006 Fassung 3 angenommen** — kein Code, kein Schema, keine Migration. Erzwungen wird nichts:
Ein Verbot, etwas **nicht** zu bauen, wirkt im Zuschnitt und im Zweitreview, nicht serverseitig.
Offen und jetzt dringlicher: **`MDR_REVIEW_REQUIRED` hat keine Codestelle** — eine Zeile in der
Roadmap, kein Loop wartet darauf. Lokal: `git pull origin main`.
