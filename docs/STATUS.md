# Status · Stand 2026-09-21 · letzte Session: ABR-EPIC-006 — Einnahmen je Leistungsart

Livestand, sonst nichts. Die **Reihenfolge** legt [`development/ROADMAP.md`](development/ROADMAP.md)
fest, Befunde sammelt [`development/BEFUNDE.md`](development/BEFUNDE.md), Ideen gehören nach
[`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md); ein Eintrag hier ist keine Einplanung.

## Jetzt

**ABR-EPIC-006 ist gebaut** (Roadmap 5.32) — **Etappe L ist komplett**, fünf von fünf Loops. Die
Auswertung trennt die Erlöse je Leistungsbereich und darin je Steuerkennzeichen und Satz, aus
Snapshots, Stornodokumenten und Zahlungen. **Die Grundlage ist Pflicht** — Zufluss oder
Rechnungsstellung —, steht an jeder Zahl und wird nie gemischt; welche gilt, sagt die Steuerberatung (B9). 25 Datenbanktests, 8 Komponententests, **eine** neue Annahme (ANN-088). 39,8 → **40,3 %**.

## Danach — Reihenfolge seit 2026-09-21

1. **MAP-002** — In-App-Kartenprototyp, startbar und von nichts abhängig
2. **E18 Schritt 7** — die vierzehn Trainingsbereiche zuschneiden (eigene Sitzung)
3. **`MDR_REVIEW_REQUIRED` verorten** (eigene Sitzung, seit 0.13 §17 an Rang 1)

Daneben: **CAL-027** (Bestandswerte umbenennen, mechanisch) · **OPS-001** (Docs-Session).

## Prüfverfahren

**Die CI läuft wieder** (seit PR #48). Lokal: `pnpm test:db` gegen einen Wegwerf-Container (54329);
**angemeldete E2E-Tests laufen in der Cloud nicht**. `ASSUMPTIONS.md` steht bei **1162** Zeilen und
88 Einträgen — die Grenze wanderte zum sechsten Mal mit der Zahl der Einträge, nicht ihrer Länge.

## Blocker (Jannes-seitig)

- **PTV-Schlüssel nur lokal** (Abo seit 2026-09-20): `.env.local`, nie ins Repository, synthetische
  Koordinaten; offen: **Domainbindung** (ADR-019).
- **Lokal `pnpm dlx supabase@2.116.0 db reset`** nach dem Merge (eine neue Migration, Seed
  **unverändert**). **Node 22** (`.nvmrc`), sonst rot.
- **G13 ist überfällig:** Umsatzsteuer-Status, **Wortlaut des Befreiungshinweises** und die **Kürzel
  der beiden Nummernkreise** (`RG`/`TR` als Festlegung) — ANN-074/075/082; dazu echte Preise. **B4**
  entscheidet zusätzlich über den **ermäßigten Satz**; bis dahin weist eine Constraint ihn ab.
- **B9 ist jetzt anfassbar:** Die Auswertung liefert beide Grundlagen, benennt sie und wählt keine.
  Welche die Gewinnermittlung verlangt, gehört mit B4 in dieselbe Frage — dazu **ANN-088**.
- **M0 am 30.09.:** B1, B2, B4 ([`decisions/ANFRAGEN.md`](decisions/ANFRAGEN.md)) — **B2 trägt** die
  Trennung aus ADR-021, die Einwilligung im Training, die Office-Sicht (§4.8) und **die Frist für
  Screening-Daten** · **Secret Scanning und Push Protection** · Kartendienst ablegen.
- **Vertragsfrage (kein Blocker):** Gilt der **Gebührenanlass** aus ADR-018 Punkt 8 auch im
  Dienstvertrag über Training? Bis zur Antwort nur für die Behandlung.
- **Abnahme R3** (25 Befunde umgesetzt, 26 bleiben Backlog) und **CAL-018, CAL-EPIC-004a/b/c,
  FIX-EPIC-004, UX-013, GRD-001, VER-EPIC-002, ABR-EPIC-001/002a/b/003** in
  [`abnahme/etappe-1-kernprozess.md`](abnahme/etappe-1-kernprozess.md); **Sichtprüfung hinter der
  Anmeldung wartet auf OPS-002** — in der Cloud startet kein GoTrue.
- **B8:** Lizenzbeleg · **OPS-001** offen · ungemergt liegen `claude/issue-42-status-fv319v` (3),
  `claude/r3-analyse` (5) und `claude/r3-code-review-hardening-c22b8f` (1 Commit).

## Auf Abnahme warten

Alles aus Etappe 1 seit CAL-EPIC-003b, dazu DAT-EPIC-001, ROL-EPIC-001, FIX-015, ABR-EPIC-004,
LEI-EPIC-001, FRB-EPIC-000, CAL-EPIC-005, ABR-EPIC-005 und neu **ABR-EPIC-006** ([`Etappe L`](abnahme/etappe-l-leistungsbereiche.md)); FIX-EPIC-001 braucht Docker. Gesamtliste: [`abnahme/README.md`](abnahme/README.md).

## Letzte Session

**Eine Zahl ohne ihre Grundlage gibt es nicht.** Der Server verlangt sie als Pflichtargument, die
Seite belegt sie nicht vor, und die Summe steht innerhalb des Bereichs und nie darüber. Neu ist
`/abrechnung/auswertung`. Lokal: `git pull origin claude/erste-aufgabe-status-oa202x`, dann `db reset`.
