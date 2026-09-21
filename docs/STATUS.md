# Status · Stand 2026-09-21 · letzte Session: FRB-EPIC-000 — Schema und Validator der Instrumente

Livestand, sonst nichts. Die **Reihenfolge** legt [`development/ROADMAP.md`](development/ROADMAP.md)
fest, Befunde sammelt [`development/BEFUNDE.md`](development/BEFUNDE.md), Ideen gehören nach
[`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md); ein Eintrag hier ist keine Einplanung.

## Jetzt

**FRB-EPIC-000 ist gebaut** (Roadmap 5.29, Phase P1 des FRB-Plans). `src/features/assessments/`
trägt das Schema beider Datenmodelle, den Ladepfad und 78 Tests — **kein Inhalt, keine Datenbank,
keine Oberfläche**. Sechs Rechenformen, aus dem Inventar abgelesen; `cutoffs`, `mcid` und `mdc`
werden gespeichert und **nicht angezeigt** (ADR-006 Punkt 11, Anzeige hängt an **B1**). Fünf Annahmen
**ANN-083 bis ANN-087**. Stand 37,0 → **37,7 %**. Anschluss wäre **P2** — eingeplant ist er nicht.

## Danach — Reihenfolge seit 2026-09-20

1. **CAL-EPIC-005** — Terminkontext und Trainingsgrundlage; Voraussetzung liegt jetzt vor
2. **ABR-EPIC-005** — ein Bereich je Rechnung, getrennte Nummernkreise; braucht CAL-EPIC-005
3. **ABR-EPIC-006** — „Einnahmen je Leistungsart"; darf als einziger rutschen

Daneben: **MAP-002** ist **startbar** (PTV-Free-Schlüssel liegt vor) · **E18 Schritt 7** und
**`MDR_REVIEW_REQUIRED` verorten** als eigene Sitzungen; kein Loop wartet darauf.

## Prüfverfahren

**Die CI läuft wieder** (seit PR #48). Lokal: `pnpm test:db` gegen einen Wegwerf-Container (Port
54329), seit R3 halb so lang; **angemeldete E2E-Tests laufen in der Cloud nicht**, Rest: `.env.local`.
`ASSUMPTIONS.md`: Obergrenze zum **fünften Mal** angehoben, 1090 → **1150**, weil ANN-083 bis
ANN-087 sie genau ausgeschöpft vorfanden (`scripts/docs-check.mjs`). 87 Einträge, alle mit Anker.

## Blocker (Jannes-seitig)

- **PTV-Schlüssel nur lokal** (Abo seit 2026-09-20): `.env.local`, nie ins Repository, synthetische
  Koordinaten; offen: **Domainbindung** (ADR-019).
- **Lokal `pnpm dlx supabase@2.116.0 db reset`** nach dem Merge (drei Migrationen aus LEI-EPIC-001,
  **Seed geändert**). **Node 22** (`.nvmrc`), sonst rot.
- **G13 ist überfällig:** Nummernformat (**je Nummernkreis**, ABR-EPIC-005), Umsatzsteuer-Status und
  **der Wortlaut des Befreiungshinweises** stehen als Annahme (ANN-074/075/082); dazu echte Preise.
- **M0 am 30.09.:** B1, B2, B4 ([`decisions/ANFRAGEN.md`](decisions/ANFRAGEN.md)) — **B2 trägt** die
  Trennung aus ADR-021, die Einwilligung im Training, die Office-Sicht (§4.8) und **die Frist für
  Screening-Daten**, die LEI-EPIC-001 bewusst offengelassen hat (ohne Daten kein Anker) · **Secret
  Scanning und Push Protection** · Kartendienst ablegen.
- **Abnahme R3** (25 Befunde umgesetzt, 26 bleiben Backlog) und **CAL-018, CAL-EPIC-004a/b/c,
  FIX-EPIC-004, UX-013, GRD-001, VER-EPIC-002, ABR-EPIC-001, ABR-EPIC-002a/b, ABR-EPIC-003** in
  [`abnahme/etappe-1-kernprozess.md`](abnahme/etappe-1-kernprozess.md); **Sichtprüfung hinter der
  Anmeldung wartet auf OPS-002**.
- **B8:** Lizenzbeleg · **OPS-001** offen · `claude/issue-42-status-fv319v` ungemergt.

## Auf Abnahme warten

Alles aus Etappe 1 seit CAL-EPIC-003b, dazu DAT-EPIC-001, ROL-EPIC-001, FIX-015, ABR-EPIC-004 und neu
**LEI-EPIC-001** ([`abnahme/etappe-l-leistungsbereiche.md`](abnahme/etappe-l-leistungsbereiche.md));
FIX-EPIC-001 braucht Docker. Gesamtliste: [`abnahme/README.md`](abnahme/README.md).

## Letzte Session

**Schema und Validator, sonst nichts.** Ein neues Instrument ist ab jetzt **eine Datei** unter
`src/features/assessments/definitionen/`. Lokal: `git pull origin claude/stoic-ramanujan-o6q5aw`;
**keine** neuen Abhängigkeiten, **keine** Migration, also kein `db reset`. Offen für P2: **D2** (vier
unvollständige Blöcke) und **D3** (Tippfehler der Vorlage) — sonst im Loop als Annahme entschieden.
