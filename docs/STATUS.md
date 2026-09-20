# Status · Stand 2026-09-20 · letzte Session: `PROJECT_PRINCIPLES.md` 0.13 (E18, Schritt 5 fertig)

Livestand, sonst nichts. Die **Reihenfolge** legt [`development/ROADMAP.md`](development/ROADMAP.md)
fest, Befunde sammelt [`development/BEFUNDE.md`](development/BEFUNDE.md), Ideen gehören nach
[`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md); ein Eintrag hier ist keine Einplanung.

## Jetzt

**`PROJECT_PRINCIPLES.md` steht auf 0.13** (2026-09-20, E18 Schritt 5): **§1.2** zwei
Leistungsbereiche, **§4.8** „Zugriff folgt dem Verhältnis" mit Bereichszuordnung je Rolle,
**§4.9** Trainingsbetreuung, **§4.10** Trainingskund:in, **§14** eng aufgehoben, **§17**
Zweckbestimmung und die drei Verbote. Damit sind **die Schritte 1 bis 5 aus E18 abgeschlossen** und
**Schritt 6 ist frei** — **gebaut ist von E18 nichts**. **R3 ist vollständig gemergt** (PR #57,
#58, #59), `R3-UEBERGABE.md` nur auf `claude/r3-analyse`; **Etappe 1 der Abrechnung ist gebaut**,
Abnahme steht aus.

## Danach — Reihenfolge seit 2026-09-20

1. **Roadmap neu schneiden** (E18, Schritt 6) — Datenmodell, Termin, Abrechnung, **BEF-019**
2. **MAP-002** — In-App-Kartenprototyp; parallel startbar, sobald das PTV-Free-Abo vorliegt
3. **`MDR_REVIEW_REQUIRED` verorten** — eigene Sitzung, seit Schritt 5 möglich; kein Loop wartet

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
  — **B2 trägt** die Trennung aus ADR-021, die Einwilligung im Training und
  neu die Office-Sicht im Training (§4.8) · **Secret Scanning und Push
  Protection prüfen** · Kartendienst ablegen.
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

**Rang 1 nachgezogen, 0.12.2 → 0.13** — kein Code, keine Migration, kein Test. Über die Vorgabe
hinaus gingen zwei Stellen, weil der Satz aus §4 sonst ins Leere liefe: die Tabelle in §4.8, die
**jede** Rolle einem Bereich zuordnet, und die Trainingsbetreuung als §4.9. Restriktiv: **Office
sieht im Training nur Organisatorisches** (Screening bis B2 gesperrt, §16). Nachgezogen: E18,
Roadmap (5.25). Lokal: `git pull origin main`.
