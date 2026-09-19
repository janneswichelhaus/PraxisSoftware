# Status · Stand 2026-09-19 · letzte Session: ABR-EPIC-003 Zahlungen

Livestand, sonst nichts. Die **Reihenfolge** legt
[`development/ROADMAP.md`](development/ROADMAP.md) fest, Befunde sammelt
[`development/BEFUNDE.md`](development/BEFUNDE.md), Ideen gehören nach
[`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md); ein Eintrag hier ist keine Einplanung.

## Jetzt

Nichts läuft. ABR-EPIC-003 liegt als PR gegen `main`, die **Abnahme steht
aus** — wie die von ABR-EPIC-002a (PR #54, gemergt). Nächster Loop auf Freigabe.

## Danach — Reihenfolge seit 2026-09-19

1. **ABR-EPIC-002b** — Die Rechnung als Dokument; **B14 ist entschieden**
   (Weg 1 Browser-Druck jetzt, Weg 3 serverseitig nach OPS-001), also frei
2. **ADR-021** — Leistungsbereiche aus E18; Entscheidungsarbeit, kein Loop
3. **MAP-002** — Fahrzeiten und Navigations-Handoff; braucht das PTV-Free-Abo

## Prüfverfahren

**Die CI läuft wieder** (seit PR #48). Lokal: `pnpm test:db` gegen einen
Wegwerf-Container (Port 54329); **angemeldete E2E-Tests laufen in der Cloud
nicht**. `pnpm test` war unter Node 24 rot (**BEF-011**), lief hier grün.

## Blocker (Jannes-seitig)

- **Lokal `pnpm dlx supabase@2.116.0 db reset`** nach dem Merge von
  ABR-EPIC-003 (eine Migration, Seed unverändert).
- **G13 ist überfällig:** Nummernformat und Umsatzsteuer-Status stehen als
  Annahme (ANN-074, ANN-075); dazu **echte Preise und Praxisstammdaten** — der
  Seed trägt erfundene. Bis zur Antwort wird mit Platzhaltern gearbeitet.
- **M0 am 30.09.:** Anfragen B1, B2, B4 ([`decisions/ANFRAGEN.md`](decisions/ANFRAGEN.md))
  · **prüfen, ob Secret Scanning und Push Protection an sind** (`main` ist als
  geschützt bestätigt, beides ist von hier nicht lesbar) · Kartendienst ablegen.
- **Abnahme CAL-018, CAL-EPIC-004a/b/c, FIX-EPIC-004, UX-013, GRD-001,
  VER-EPIC-002, ABR-EPIC-001, ABR-EPIC-002a, ABR-EPIC-003** in
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

**ABR-EPIC-003 gebaut** — vorgezogen, weil ABR-EPIC-002b auf B14 wartete.
Zahlungen sind **eigene Transaktionen** mit Richtung statt Vorzeichen; der
Zahlungsstand wird **gerechnet und nirgends gespeichert** (**ANN-078**).
Überzahlung ist erlaubt, eine Rückzahlung über dem Eingang nicht. **Gebucht
ist gebucht:** Storno mit Grund statt Löschen. Die **offenen Posten** stehen
ohne einen Tap auf der Einstiegsseite, gebucht wird in drei Taps. Kein
Bargeld. Die Abrechnung ist damit **kein Vorschaubereich mehr**. Dazu
entschieden: **B14**, **B8**, Abnahmeweg, E18-Reihenfolge. Lokal: `git pull`,
dann **`db reset`**.
