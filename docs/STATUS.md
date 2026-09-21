# Status · Stand 2026-09-21 · letzte Session: MAP-002 — In-App-Kartenprototyp

Livestand, sonst nichts. Die **Reihenfolge** legt [`development/ROADMAP.md`](development/ROADMAP.md)
fest, Befunde sammelt [`development/BEFUNDE.md`](development/BEFUNDE.md), Ideen gehören nach
[`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md); ein Eintrag hier ist keine Einplanung.

## Jetzt

**MAP-002 ist gebaut** (Roadmap 5.33) — der erste Loop der **Etappe T**, einer von fünf. Unter
`/touren/karte` zeigt eine MapLibre-Karte acht **erfundene** Tübinger Koordinaten als eigene,
nummerierte Marker; der Anbieter steht an genau einer Stelle, und **ohne Kachelschlüssel entsteht
keine Karte und keine Anfrage**. 19 Tests, 4 Browserprüfungen, **keine** neue Annahme. 40,3 → **41,1 %**.

## Danach — Reihenfolge seit 2026-09-21

1. **E18 Schritt 7** — die vierzehn Trainingsbereiche zuschneiden (eigene Sitzung)
2. **`MDR_REVIEW_REQUIRED` verorten** (eigene Sitzung, seit 0.13 §17 an Rang 1)
3. **MAP-003** — Fahrradrouting, **startbar** mit synthetischen Koordinaten (ADR-019 Punkt 15;
   echte Adressen erst nach dem Gate). Edge Function braucht Docker — Lauf und Abnahme nur lokal.

Daneben: **CAL-027** (Bestandswerte umbenennen, mechanisch) · **OPS-001** (Docs-Session).

## Prüfverfahren

**Die CI läuft wieder** (seit PR #48). Lokal: `pnpm test:db` gegen einen Wegwerf-Container (54329);
**angemeldete E2E-Tests laufen in der Cloud nicht** — seit MAP-002 prüft eine Playwright-Seite
immerhin den Kartenrenderer. `ASSUMPTIONS.md` unverändert bei **1162** Zeilen, 88 Einträgen.

## Blocker (Jannes-seitig)

- **PTV: Die Karte läuft** (Schlüssel liegt lokal, Sichtprüfung 2026-09-21, dabei BEF-021 und
  BEF-022 gefunden). Offen: **Domainbindung** (ADR-019 Punkt 19). Für MAP-003 gilt vorerst
  **derselbe Schlüssel** serverseitig — Entscheidung 2026-09-21, nur synthetische Koordinaten.
- **Lokal `pnpm install`** nach dem Merge (neu: `maplibre-gl`); **keine Migration, kein `db reset`**.
  **Node 22** (`.nvmrc`), sonst rot.
- **G13 ist überfällig:** Umsatzsteuer-Status, **Wortlaut des Befreiungshinweises** und die **Kürzel
  der beiden Nummernkreise** (`RG`/`TR` als Festlegung) — ANN-074/075/082; dazu echte Preise. **B4**
  entscheidet zusätzlich über den **ermäßigten Satz**; bis dahin weist eine Constraint ihn ab.
- **B9:** Die Auswertung liefert beide Grundlagen und wählt keine; welche die Gewinnermittlung
  verlangt, gehört mit B4 in dieselbe Frage (**ANN-088**).
- **M0 am 30.09.:** B1, B2, B4 ([`decisions/ANFRAGEN.md`](decisions/ANFRAGEN.md)) — **B2 trägt** die
  Trennung aus ADR-021, die Einwilligung im Training, die Office-Sicht (§4.8), **die Frist für
  Screening-Daten** und den **Handoff** (ADR-019 Punkt 23) · **Secret Scanning und Push
  Protection** · Kartendienst ablegen.
- **Kein Blocker:** Gilt der **Gebührenanlass** (ADR-018 Punkt 8) auch im Trainingsvertrag?
- **Abnahme R3** (25 Befunde umgesetzt, 26 bleiben Backlog) und **CAL-018, CAL-EPIC-004a/b/c,
  FIX-EPIC-004, UX-013, GRD-001, VER-EPIC-002, ABR-EPIC-001/002a/b/003** in
  [`abnahme/etappe-1-kernprozess.md`](abnahme/etappe-1-kernprozess.md); **Sichtprüfung hinter der
  Anmeldung wartet auf OPS-002** — in der Cloud startet kein GoTrue.
- **B8:** Lizenzbeleg · **OPS-001** offen · ungemergt liegen `claude/issue-42-status-fv319v` (3),
  `claude/r3-analyse` (5) und `claude/r3-code-review-hardening-c22b8f` (1 Commit).

## Auf Abnahme warten

Alles aus Etappe 1 seit CAL-EPIC-003b, dazu DAT-EPIC-001, ROL-EPIC-001, FIX-015, ABR-EPIC-004,
LEI-EPIC-001, FRB-EPIC-000, CAL-EPIC-005, ABR-EPIC-005, ABR-EPIC-006 ([`Etappe L`](abnahme/etappe-l-leistungsbereiche.md)) und neu **MAP-002** ([`Etappe T`](abnahme/etappe-t-kartendienst.md)); FIX-EPIC-001 braucht Docker. Gesamtliste: [`abnahme/README.md`](abnahme/README.md).

## Letzte Session

**Die Karte kennt den Anbieter nicht, und ohne Schlüssel fragt sie niemanden.** Neu ist `/touren/karte`; zwei Befunde aus der Abnahme sind behoben. Lokal: `git pull origin main`, dann `pnpm install`.
