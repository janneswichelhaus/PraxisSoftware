# Status · Stand 2026-09-21 · letzte Session: E18 Schritt 7 — Trainingsbereich zugeschnitten

Livestand, sonst nichts. Die **Reihenfolge** legt [`development/ROADMAP.md`](development/ROADMAP.md)
fest, Befunde sammelt [`development/BEFUNDE.md`](development/BEFUNDE.md), Ideen gehören nach
[`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md); ein Eintrag hier ist keine Einplanung.

## Jetzt

**E18 ist vollständig** (Roadmap 5.36) — Schritt 7 hat den Trainingsbereich geschnitten: **Etappe
TR**, vier Loops (TRN-EPIC-001 bis -004) von April bis Juni 2027, die fünfzehn Navigationspunkte
einzeln zugeordnet, die drei MDR-nahen zuletzt. Etappe L hat das Fundament gebaut, **eine Tür
dorthin nicht**: kein Schreibweg, Rolle nicht zuweisbar, Rechnung ohne Kreis. **41,1 %.**

## Danach — Reihenfolge seit 2026-09-21

1. **`MDR_REVIEW_REQUIRED` verorten** (eigene Sitzung, seit 0.13 §17 an Rang 1)
2. **MAP-003** — Fahrradrouting, **startbar** mit synthetischen Koordinaten (ADR-019 Punkt 15);
   die Edge Function braucht Docker, Lauf und Abnahme also nur lokal
3. **CAL-027** — Bestandswerte umbenennen, mechanisch, blockiert nichts

Daneben: **OPS-001** (Docs-Session) · **Etappe TR** beginnt erst mit der Freigabe unten.

## Prüfverfahren

**Die CI läuft wieder** (seit PR #48). Lokal: `pnpm test:db` gegen einen Wegwerf-Container (54329);
**angemeldete E2E-Tests laufen in der Cloud nicht** — seit MAP-002 prüft eine Playwright-Seite
immerhin den Kartenrenderer. `ASSUMPTIONS.md` unverändert bei **1162** Zeilen, 88 Einträgen.

## Blocker (Jannes-seitig)

- **Neu: Freigabe für Etappe TR.** §14 nimmt den **Trainingsbereich selbst** aus; ohne neue
  Version nach §21 beginnt dort kein Loop. Nicht eilig: gebraucht wird sie erst im April 2027.
- **PTV: Die Karte läuft** (Schlüssel liegt lokal, Sichtprüfung 2026-09-21, dabei BEF-021 und
  BEF-022 gefunden). Offen: **Domainbindung** (ADR-019 Punkt 19). Für MAP-003 gilt vorerst
  **derselbe Schlüssel** serverseitig — Entscheidung 2026-09-21, nur synthetische Koordinaten.
- **Lokal:** `git pull`; `pnpm install` nur, falls MAP-002 noch nicht gezogen ist (`maplibre-gl`).
  **Keine Migration, kein `db reset`.** **Node 22** (`.nvmrc`), sonst rot.
- **G13 ist überfällig:** Umsatzsteuer-Status, **Wortlaut des Befreiungshinweises** und die **Kürzel
  der beiden Nummernkreise** (`RG`/`TR` als Festlegung) — ANN-074/075/082; dazu echte Preise. **B4**
  entscheidet zusätzlich über den **ermäßigten Satz**; bis dahin weist eine Constraint ihn ab.
- **B9:** Die Auswertung liefert beide Grundlagen und wählt keine; welche die Gewinnermittlung
  verlangt, gehört mit B4 in dieselbe Frage (**ANN-088**).
- **M0 am 30.09.:** B1, B2, B4 ([`decisions/ANFRAGEN.md`](decisions/ANFRAGEN.md)) — **B2 trägt** die
  Trennung aus ADR-021, die Einwilligung im Training, die Office-Sicht (§4.8), **die Frist für
  Screening-Daten**, den **Handoff** (ADR-019 Punkt 23) · **Secret Scanning** · Kartendienst ablegen.
- **Kein Blocker:** Gilt der **Gebührenanlass** (ADR-018 Punkt 8) auch im Trainingsvertrag?
- **Abnahme R3** (25 Befunde umgesetzt, 26 bleiben Backlog) und **CAL-018, CAL-EPIC-004a/b/c,
  FIX-EPIC-004, UX-013, GRD-001, VER-EPIC-002, ABR-EPIC-001/002a/b/003** in
  [`abnahme/etappe-1-kernprozess.md`](abnahme/etappe-1-kernprozess.md); **Sichtprüfung hinter der Anmeldung wartet auf OPS-002** — in der Cloud startet kein GoTrue.
- **B8:** Lizenzbeleg · **OPS-001** offen · ungemergt liegen `claude/issue-42-status-fv319v` (3),
  `claude/r3-analyse` (5) und `claude/r3-code-review-hardening-c22b8f` (1 Commit).

## Auf Abnahme warten

Alles aus Etappe 1 seit CAL-EPIC-003b, dazu DAT-EPIC-001, ROL-EPIC-001, FIX-015, ABR-EPIC-004, LEI-EPIC-001, FRB-EPIC-000, CAL-EPIC-005, ABR-EPIC-005, ABR-EPIC-006 ([`Etappe L`](abnahme/etappe-l-leistungsbereiche.md)) und MAP-002 ([`Etappe T`](abnahme/etappe-t-kartendienst.md)); FIX-EPIC-001 braucht Docker. Gesamtliste: [`abnahme/README.md`](abnahme/README.md).

## Letzte Session

**Der Trainingsbereich hat einen Plan, aber noch keine Erlaubnis.** Neu ist Etappe TR in der
Roadmap; die Freigabe nach §14 liegt bei Jannes. Lokal: `git pull origin main`, sonst nichts.
