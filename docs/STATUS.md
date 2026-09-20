# Status · Stand 2026-09-20 · letzte Session: ADR-021 angenommen (E18, Schritt 1)

Livestand, sonst nichts. Die **Reihenfolge** legt [`development/ROADMAP.md`](development/ROADMAP.md)
fest, Befunde sammelt [`development/BEFUNDE.md`](development/BEFUNDE.md), Ideen gehören nach
[`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md); ein Eintrag hier ist keine Einplanung.

## Jetzt

**ADR-021 ist angenommen** (2026-09-20) und steht an allen drei Stellen: Index
in [`../CLAUDE.md`](../CLAUDE.md), Tabelle in [`adr/README.md`](adr/README.md),
Tabelle in §21 (Prinzipien **0.12.1**). **E18, Schritt 2 ist damit frei.**
Dieser Stand liegt als **PR #61** gegen `main`, ungemergt. **R3 ist
vollständig gemergt** (PR #57, #58, #59), `R3-UEBERGABE.md` weiter nur auf
`claude/r3-analyse`; **Etappe 1 der Abrechnung ist gebaut**, Abnahme steht aus.

## Danach — Reihenfolge seit 2026-09-20

1. **ADR-022** — Terminkontext und Trainingsgrundlage (E18, Schritt 2),
   Abgrenzung zu ADR-020; Entscheidungsarbeit, kein Code
2. **MAP-002** — Fahrzeiten und Navigations-Handoff; braucht das PTV-Free-Abo
3. **ADR-006 neue Fassung** — die drei Feature-Verbote an der MDR-Grenze
   (E18, Schritt 3)

## Prüfverfahren

**Die CI läuft wieder** (seit PR #48). Lokal: `pnpm test:db` gegen einen
Wegwerf-Container (Port 54329), seit R3 in der halben Zeit; **angemeldete
E2E-Tests laufen in der Cloud nicht**, die übrigen brauchen `.env.local`.

## Blocker (Jannes-seitig)

- **Lokal `pnpm dlx supabase@2.116.0 db reset`** nach dem Merge von R3 (eine
  Migration aus G2); Seed unverändert. **Node 22** (`.nvmrc`), sonst rot.
- **G13 ist überfällig:** Nummernformat und Umsatzsteuer-Status stehen als
  Annahme (ANN-074, ANN-075); dazu **echte Preise und Praxisstammdaten** — der
  Seed trägt erfundene, bis zur Antwort wird mit Platzhaltern gearbeitet.
- **M0 am 30.09.:** B1, B2, B4 ([`decisions/ANFRAGEN.md`](decisions/ANFRAGEN.md))
  — **B2 trägt** die Trennung aus ADR-021 (jetzt angenommen) und die
  Einwilligung im Training · **Secret Scanning und Push Protection prüfen**
  (von hier nicht lesbar, `main` ist geschützt) · Kartendienst ablegen.
- **Abnahme R3** (25 Befunde umgesetzt, 26 bleiben Backlog) und **CAL-018,
  CAL-EPIC-004a/b/c, FIX-EPIC-004, UX-013, GRD-001, VER-EPIC-002, ABR-EPIC-001,
  ABR-EPIC-002a/b, ABR-EPIC-003** in
  [`abnahme/etappe-1-kernprozess.md`](abnahme/etappe-1-kernprozess.md);
  **Sichtprüfung hinter der Anmeldung wartet auf OPS-002**.
- **B8:** Lizenzbeleg · PTV-Free-Abo vor MAP-002 (nur Prototyp) · **OPS-001**
  offen · `claude/issue-42-status-fv319v` ungemergt.

## Auf Abnahme warten

Alles aus Etappe 1 seit CAL-EPIC-003b, dazu DAT-EPIC-001, ROL-EPIC-001, FIX-015;
FIX-EPIC-001 braucht Docker. Liste: [`abnahme/README.md`](abnahme/README.md).

## Letzte Session

**ADR-021 angenommen** — kein Code, kein Schema, keine Migration. Vollzogen an vier
Stellen: Status im ADR, Index in `../CLAUDE.md`, Tabelle in `adr/README.md` und Zeile
in §21; letztere ist Rang 1 und trägt die **Korrekturversion 0.12.1**, die keine
Leitplanke ändert — ADR-021 wendet §1.1, §4, §14 und §18 an, statt sie zu ändern.
Offen bleibt alles, was erst der Loop baut. Lokal: `git pull`.
