# Status · Stand 2026-09-19 · letzte Session: ABR-EPIC-002b Rechnung als Dokument

Livestand, sonst nichts. Die **Reihenfolge** legt
[`development/ROADMAP.md`](development/ROADMAP.md) fest, Befunde sammelt
[`development/BEFUNDE.md`](development/BEFUNDE.md), Ideen gehören nach
[`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md); ein Eintrag hier ist keine Einplanung.

## Jetzt

Nichts läuft. ABR-EPIC-002b liegt als PR gegen `main`, die **Abnahme steht
aus** — wie die von ABR-EPIC-002a (PR #54) und ABR-EPIC-003 (PR #55, beide
gemergt). Damit ist **Etappe 1 der Abrechnung gebaut**.

## Danach — Reihenfolge seit 2026-09-19

1. **ADR-021** — Leistungsbereiche aus E18; Entscheidungsarbeit, kein Loop
2. **MAP-002** — Fahrzeiten und Navigations-Handoff; braucht das PTV-Free-Abo
3. **OPS-001** — Providerprüfung; hängt vor Weg 3 des Rechnungs-PDF (ADR-009
   Punkt 11) und vor jeder produktiven Datei (ADR-017)

## Prüfverfahren

**Die CI läuft wieder** (seit PR #48). Lokal: `pnpm test:db` gegen einen
Wegwerf-Container (Port 54329); **angemeldete E2E-Tests laufen in der Cloud
nicht**. `pnpm test` war unter Node 24 rot (**BEF-011**), lief hier grün.

## Blocker (Jannes-seitig)

- **Lokal `pnpm dlx supabase@2.116.0 db reset`** nach dem Merge von
  ABR-EPIC-002b (zwei Migrationen, Seed unverändert).
- **G13 ist überfällig:** Nummernformat und Umsatzsteuer-Status stehen als
  Annahme (ANN-074, ANN-075); dazu **echte Preise und Praxisstammdaten** — der
  Seed trägt erfundene. Bis zur Antwort wird mit Platzhaltern gearbeitet.
- **M0 am 30.09.:** Anfragen B1, B2, B4 ([`decisions/ANFRAGEN.md`](decisions/ANFRAGEN.md))
  · **prüfen, ob Secret Scanning und Push Protection an sind** (`main` ist als
  geschützt bestätigt, beides ist von hier nicht lesbar) · Kartendienst ablegen.
- **Abnahme CAL-018, CAL-EPIC-004a/b/c, FIX-EPIC-004, UX-013, GRD-001,
  VER-EPIC-002, ABR-EPIC-001, ABR-EPIC-002a, ABR-EPIC-002b, ABR-EPIC-003** in
  [`abnahme/etappe-1-kernprozess.md`](abnahme/etappe-1-kernprozess.md); die
  **Sichtprüfung hinter der Anmeldung wartet auf die Test-Umgebung aus OPS-002**
  (entschieden 2026-09-19), bis dahin auf Tests und Screenshots.
- **B8:** schriftlichen Beleg des Lizenzgebers nachreichen (Nutzung bestätigt) ·
  PTV-Free-Abo vor MAP-002, es trägt **nur** den Prototyp, nicht den Betrieb ·
  `claude/issue-42-status-fv319v` hat drei ungemergte Commits

## Auf Abnahme warten

Alles aus Etappe 1 seit CAL-EPIC-003b, dazu DAT-EPIC-001, ROL-EPIC-001 und
FIX-015; FIX-EPIC-001 braucht Docker. Liste: [`abnahme/README.md`](abnahme/README.md).

## Letzte Session

**ABR-EPIC-002b gebaut** — drei Stories. Die Rechnung ist ein **Blatt zum
Verschicken** (Browser-Druck nach B14 Weg 1, schwarze Wortmarke im Kopf);
**ADR-009 Punkt 11 bleibt unerfüllt**, die Ablage nach ADR-017 entfällt bis
Weg 3. **Storno und Korrektur sind eigene Dokumente:** eigene Nummer aus
demselben Kreis, Pflichtgrund, die Rechnung selbst unangetastet, „storniert"
abgeleitet (**ANN-079**). Die **Zahlungserinnerung** hat keine Stufen, keine
Gebühren, keine Automatik, erst ab Fälligkeit, Betrag festgeschrieben
(**ANN-080**). Dazu **BEF-018**. Lokal: `git pull`, dann **`db reset`**.
