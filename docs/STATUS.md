# Status · Stand 2026-09-21 · letzte Session: `MDR_REVIEW_REQUIRED` verortet

Livestand, sonst nichts. Die **Reihenfolge** legt [`development/ROADMAP.md`](development/ROADMAP.md)
fest, Befunde sammelt [`development/BEFUNDE.md`](development/BEFUNDE.md), Ideen gehören nach
[`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md); ein Eintrag hier ist keine Einplanung.

## Jetzt

**`MDR_REVIEW_REQUIRED` hat eine Codestelle** — die Folgefrage aus ADR-006 Fassung 1, seit 0.13
§17 an Rang 1: **`src/app/mdr.ts`**, sieben Einträge, jeder mit Fundstelle und dem Satz, welche
Ausgabe nicht entsteht. **Die vier ohne Adresse** (drei Ausgabeverbote, Cutoff-Anzeige) wirken
weiter im Zuschnitt — ADR-006 nimmt ihre Durchsetzung aus. **Die drei mit Adresse** (KI-Analyse,
Übungsanalyse, Progression) sind gesperrt: Riegel über der Routentabelle, **kein Schalter**.
**ANN-089**, 31 neue Tests. **41,1 %.**

## Danach — Reihenfolge seit 2026-09-21

1. **MAP-003** — Fahrradrouting, **startbar** mit synthetischen Koordinaten (ADR-019 Punkt 15);
   die Edge Function braucht Docker, Lauf und Abnahme also nur lokal
2. **CAL-027** — Bestandswerte umbenennen, mechanisch, blockiert nichts
3. **OPS-001** — Providerprüfung Supabase als Docs-Session, ohne Code

## Prüfverfahren

**Die CI läuft wieder** (seit PR #48). Lokal: `pnpm test:db` gegen einen Wegwerf-Container (54329);
**angemeldete E2E-Tests laufen in der Cloud nicht** — seit MAP-002 prüft eine Playwright-Seite
immerhin den Kartenrenderer, seit ANN-089 eine zweite die MDR-Sperre bei 375 px. `ASSUMPTIONS.md`
steht bei **1174** Zeilen, 89 Einträgen.

## Blocker (Jannes-seitig)

- **Freigabe für Etappe TR.** §14 nimmt den **Trainingsbereich selbst** aus; ohne neue
  Version nach §21 beginnt dort kein Loop. Gebraucht wird sie, wenn Etappe TR an der Reihe ist.
- **PTV: Die Karte läuft** (Schlüssel liegt lokal, Sichtprüfung 2026-09-21, dabei BEF-021 und
  BEF-022 gefunden). Offen: **Domainbindung** (ADR-019 Punkt 19). Für MAP-003 gilt vorerst
  **derselbe Schlüssel** serverseitig — Entscheidung 2026-09-21, nur synthetische Koordinaten.
- **Lokal:** `git pull`. **Keine neue Abhängigkeit, keine Migration, kein `db reset`.** **Node 22** (`.nvmrc`), sonst rot.
- **G13 fehlt:** Umsatzsteuer-Status, **Wortlaut des Befreiungshinweises** und die **Kürzel
  der beiden Nummernkreise** (`RG`/`TR` als Festlegung) — ANN-074/075/082; dazu echte Preise. **B4**
  entscheidet zusätzlich über den **ermäßigten Satz**; bis dahin weist eine Constraint ihn ab.
- **B9:** Die Auswertung liefert beide Grundlagen und wählt keine; welche die Gewinnermittlung verlangt, gehört mit B4 in dieselbe Frage (**ANN-088**).
- **M0 (Vorlauf):** B1, B2, B4 ([`decisions/ANFRAGEN.md`](decisions/ANFRAGEN.md)) — **B2 trägt** die
  Trennung aus ADR-021, die Einwilligung im Training, die Office-Sicht (§4.8), **die Frist für
  Screening-Daten**, den **Handoff** (ADR-019 Punkt 23) · **Secret Scanning** · Kartendienst ablegen.
- **Neu, kein Blocker:** **Wer** klassifiziert, sagt ADR-006 weiter nicht — das Register führt nur, was schon klassifiziert ist. Eine Fassung 4 wäre nötig, sinnvoll erst mit **B1**.
- **Abnahme R3** (25 Befunde umgesetzt, 26 bleiben Backlog) und **CAL-018, CAL-EPIC-004a/b/c,
  FIX-EPIC-004, UX-013, GRD-001, VER-EPIC-002, ABR-EPIC-001/002a/b/003** in
  [`abnahme/etappe-1-kernprozess.md`](abnahme/etappe-1-kernprozess.md); **Sichtprüfung hinter der Anmeldung wartet auf OPS-002** — in der Cloud startet kein GoTrue.
- **B8:** Lizenzbeleg · ungemergt liegen `claude/issue-42-status-fv319v` (3), `claude/r3-analyse` (5) und `claude/r3-code-review-hardening-c22b8f` (1 Commit).

## Auf Abnahme warten

Alles aus Etappe 1 seit CAL-EPIC-003b, dazu DAT-EPIC-001, ROL-EPIC-001, FIX-015, ABR-EPIC-004, LEI-EPIC-001, FRB-EPIC-000, CAL-EPIC-005, ABR-EPIC-005, ABR-EPIC-006 ([`Etappe L`](abnahme/etappe-l-leistungsbereiche.md)) und MAP-002 ([`Etappe T`](abnahme/etappe-t-kartendienst.md)); FIX-EPIC-001 braucht Docker. Gesamtliste: [`abnahme/README.md`](abnahme/README.md).

## Letzte Session

**Ein Verbot, das nur in der Dokumentation stand, steht jetzt im Code** — ohne Weg daran vorbei:
Wer eine gesperrte Funktion öffnen will, entfernt ihren Eintrag, und das steht im Diff. Lokal:
`git pull origin main`, sonst nichts.
