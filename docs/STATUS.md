# Status · Stand 2026-09-20 · letzte Session: ADR-022 angenommen (E18, Schritt 2)

Livestand, sonst nichts. Die **Reihenfolge** legt [`development/ROADMAP.md`](development/ROADMAP.md)
fest, Befunde sammelt [`development/BEFUNDE.md`](development/BEFUNDE.md), Ideen gehören nach
[`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md); ein Eintrag hier ist keine Einplanung.

## Jetzt

**ADR-022 ist angenommen** (E18, Schritt 2) und steht an allen drei Stellen: Index in
[`../CLAUDE.md`](../CLAUDE.md), [`adr/README.md`](adr/README.md), §21 (**0.12.2**). Ein Kalender,
ein Kontext je Termin — `internal` ist kein neues Feld, es heißt `kind = 'event'`. **Gebaut ist
davon nichts:** kein Schema, keine Migration, keine Spalte. Damit ist **Schritt 3 frei**.
**R3 ist vollständig gemergt** (PR #57, #58, #59), `R3-UEBERGABE.md` weiter nur auf
`claude/r3-analyse`; **Etappe 1 der Abrechnung ist gebaut**, Abnahme steht aus.

## Danach — Reihenfolge seit 2026-09-20

1. **ADR-006 neue Fassung** — die drei Feature-Verbote an der MDR-Grenze (E18, Schritt 3)
2. **ADR-009 neue Fassung** — Steuerkennzeichen am Posten, getrennte Nummernkreise (E18, Schritt 4)
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
  Seed trägt erfundene.
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

**ADR-022 angenommen** — kein Code, kein Schema, keine Migration. Vollzogen sind Status im ADR,
Index in `CLAUDE.md`, Tabelle in `adr/README.md` und die Zeile in §21; die Korrekturversion
**0.12.2** ändert keine Leitplanke, sie zieht in §4, §5, §8 und §18 eine Grenze. Mit angenommen ist
die eine Abweichung von der Vorgabe: `internal` bekommt kein zweites Feld. Teuerste Folge bleibt,
was der ADR nennt — zwei Aufbewahrungsfristen in einer Tabelle, gelöscht wird je Zeile am Kontext.
Lokal: `git pull origin main`.
