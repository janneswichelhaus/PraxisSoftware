# Status · Stand 2026-09-20 · letzte Session: R3 Gruppe G2 (Oberfläche härten)

Livestand, sonst nichts. Die **Reihenfolge** legt
[`development/ROADMAP.md`](development/ROADMAP.md) fest, Befunde sammelt
[`development/BEFUNDE.md`](development/BEFUNDE.md), Ideen gehören nach
[`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md); ein Eintrag hier ist keine Einplanung.

## Jetzt

**R3 läuft** — Härtung in drei Gruppen. **G1 ist gemergt** (PR #57), **G2
liegt als PR** (Oberfläche und Datenzugriff), **G3 steht aus**; Plan und
Befunde in `docs/development/R3-UEBERGABE.md` auf `claude/r3-analyse` (nie
gemergt). **Etappe 1 der Abrechnung ist gebaut**, ihre Abnahme steht aus.

## Danach — Reihenfolge seit 2026-09-19

1. **R3 G3** — Tests, Gates und Werkzeuge, die letzte Härtungsgruppe
2. **ADR-021** — Leistungsbereiche aus E18; Entscheidungsarbeit, kein Loop
3. **MAP-002** — Fahrzeiten und Navigations-Handoff; braucht das PTV-Free-Abo
4. **OPS-001** — Providerprüfung; vor Weg 3 des PDF und vor jeder Datei (ADR-017)

## Prüfverfahren

**Die CI läuft wieder** (seit PR #48). Lokal: `pnpm test:db` gegen einen
Wegwerf-Container (Port 54329); **angemeldete E2E-Tests laufen in der Cloud
nicht**, die übrigen brauchen dort `.env.local` aus `.env.example`. `pnpm test`
war unter Node 24 rot (**BEF-011**), lief hier grün.

## Blocker (Jannes-seitig)

- **Lokal `pnpm dlx supabase@2.116.0 db reset`** nach dem Merge von G2 (eine
  Migration); Seed unverändert.
- **G13 ist überfällig:** Nummernformat und Umsatzsteuer-Status stehen als
  Annahme (ANN-074, ANN-075); dazu **echte Preise und Praxisstammdaten** — der
  Seed trägt erfundene, bis zur Antwort wird mit Platzhaltern gearbeitet.
- **M0 am 30.09.:** Anfragen B1, B2, B4 ([`decisions/ANFRAGEN.md`](decisions/ANFRAGEN.md))
  · **prüfen, ob Secret Scanning und Push Protection an sind** (`main` ist als
  geschützt bestätigt, beides ist von hier nicht lesbar) · Kartendienst ablegen.
- **Abnahme CAL-018, CAL-EPIC-004a/b/c, FIX-EPIC-004, UX-013, GRD-001,
  VER-EPIC-002, ABR-EPIC-001, ABR-EPIC-002a/b, ABR-EPIC-003** in
  [`abnahme/etappe-1-kernprozess.md`](abnahme/etappe-1-kernprozess.md); die
  **Sichtprüfung hinter der Anmeldung wartet auf OPS-002** (2026-09-19).
- **B8:** Lizenzbeleg nachreichen (Nutzung bestätigt) · PTV-Free-Abo vor MAP-002,
  trägt **nur** den Prototyp · `claude/issue-42-status-fv319v` ungemergt

## Auf Abnahme warten

Alles aus Etappe 1 seit CAL-EPIC-003b, dazu DAT-EPIC-001, ROL-EPIC-001, FIX-015;
FIX-EPIC-001 braucht Docker. Liste: [`abnahme/README.md`](abnahme/README.md).

## Letzte Session

**R3 Gruppe G2** — acht Befunde, je ein Commit mit rotem Test davor: die
**Patientenliste** bekommt eine schlanke Sicht ohne Versorgungsangaben und
Anschrift (ADR-004); die **Kennwortlänge** gilt auch im Anmeldedienst; der
**Dateiinhalt** wird gegen sein Format geprüft (ANN-053 nachgezogen); „Gültig
ab" nimmt den **Praxistag**; kein **Inkraftsetzen** mit ungespeicherten Zeilen;
ein nicht erreichbarer **Anmeldedienst** heißt nicht mehr Erfolg oder „kein
Konto"; **deutsche Sätze** statt ZodError-Text; die **Schrift** als WOFF2
(144 → 61 kB) mit Preload. Lokal: `git pull`, dann **`db reset`**.
