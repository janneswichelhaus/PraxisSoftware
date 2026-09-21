# Status · Stand 2026-09-21 · letzte Session: MAP-003 Fahrradrouting

Livestand, sonst nichts. Die **Reihenfolge** legt [`development/ROADMAP.md`](development/ROADMAP.md)
fest, Befunde sammelt [`development/BEFUNDE.md`](development/BEFUNDE.md), Ideen gehören nach
[`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md); ein Eintrag hier ist keine Einplanung.

## Jetzt

**Die Fahrradroute liegt auf der Karte** — MAP-003 ist gebaut. Die Edge Function
`location-provider` rechnet sie **serverseitig** bei PTV (ANN-017) oder liefert eine **erkennbare**
Nachbildung; ohne Sitzung antwortet sie 401, speichert nichts, protokolliert keine Koordinate.
`/touren/karte` zeigt Linie, Strecke und Fahrzeit je Abschnitt, benennt jeden Fehlerzustand und
stellt beide Profile nebeneinander (MAP-003c). **ANN-090**: „nicht eingerichtet" ist eine eigene
Klasse, nie still die Nachbildung. **109 neue Tests. 41,9 %.**

## Danach — Reihenfolge seit 2026-09-21

1. **CAL-027** — Bestandswerte umbenennen, mechanisch, blockiert nichts
2. **OPS-001** — Providerprüfung Supabase als Docs-Session, ohne Code; sie entscheidet auch über
   die Edge Runtime (ADR-015 Punkt 20), an der jeder weitere Kartenloop hängt
3. **MAP-004** — Fahrzeitmatrix auf derselben Function; Lauf und Abnahme wieder nur lokal

## Prüfverfahren

**Die CI läuft wieder** (seit PR #48). Lokal: `pnpm test:db` gegen einen Wegwerf-Container (54329);
**angemeldete E2E-Tests und die Deno-Laufzeit laufen in der Cloud nicht** — die Function ist dort
mit 65 Unit-Tests geprüft, die Linie mit zwei Browserprüfungen. `ASSUMPTIONS.md`: **1186** Zeilen.

## Blocker (Jannes-seitig)

- **MAP-003 abnehmen** ([`abnahme/etappe-t-kartendienst.md`](abnahme/etappe-t-kartendienst.md)):
  nur lokal — `[edge_runtime] enabled = true` **für den Lauf** (im Repository bleibt `false`),
  `supabase/functions/.env.local`, `functions serve`. Dabei fällt die Antwort auf **BEF-023**
  (Schreibweise der Abfrageparameter) und die **Profilfrage aus MAP-003c**.
- **Freigabe für Etappe TR.** §14 nimmt den **Trainingsbereich selbst** aus; ohne neue
  Version nach §21 beginnt dort kein Loop. Gebraucht wird sie, wenn Etappe TR an der Reihe ist.
- **PTV:** Karte läuft (Sichtprüfung 2026-09-21, dabei BEF-021 und BEF-022). Offen:
  **Domainbindung** (ADR-019 Punkt 19). Serverseitig gilt vorerst **derselbe Schlüssel** —
  Entscheidung 2026-09-21, nur synthetische Koordinaten.
- **Lokal:** `git pull`. **Keine neue Abhängigkeit, keine Migration, kein `db reset`.** **Node 22** (`.nvmrc`), sonst rot.
- **G13 fehlt:** Umsatzsteuer-Status, **Wortlaut des Befreiungshinweises** und die **Kürzel
  der beiden Nummernkreise** (`RG`/`TR` als Festlegung) — ANN-074/075/082; dazu echte Preise. **B4**
  entscheidet zusätzlich über den **ermäßigten Satz**; bis dahin weist eine Constraint ihn ab.
- **B9:** Die Auswertung liefert beide Grundlagen und wählt keine; welche die Gewinnermittlung verlangt, gehört mit B4 in dieselbe Frage (**ANN-088**).
- **M0 (Vorlauf):** B1, B2, B4 ([`decisions/ANFRAGEN.md`](decisions/ANFRAGEN.md)) — **B2 trägt** die
  Trennung aus ADR-021, die Einwilligung im Training, die Office-Sicht (§4.8), **die Frist für
  Screening-Daten**, den **Handoff** (ADR-019 Punkt 23) · **Secret Scanning** · Kartendienst ablegen.
- **Abnahme R3** (25 Befunde umgesetzt, 26 bleiben Backlog) und **CAL-018, CAL-EPIC-004a/b/c,
  FIX-EPIC-004, UX-013, GRD-001, VER-EPIC-002, ABR-EPIC-001/002a/b/003** in
  [`abnahme/etappe-1-kernprozess.md`](abnahme/etappe-1-kernprozess.md); **Sichtprüfung hinter der Anmeldung wartet auf OPS-002** — in der Cloud startet kein GoTrue.
- **B8:** Lizenzbeleg · ungemergt liegen `claude/issue-42-status-fv319v` (3), `claude/r3-analyse` (5) und `claude/r3-code-review-hardening-c22b8f` (1 Commit).

## Auf Abnahme warten

Alles aus Etappe 1 seit CAL-EPIC-003b, dazu DAT-EPIC-001, ROL-EPIC-001, FIX-015, ABR-EPIC-004, LEI-EPIC-001, FRB-EPIC-000, CAL-EPIC-005, ABR-EPIC-005, ABR-EPIC-006 ([`Etappe L`](abnahme/etappe-l-leistungsbereiche.md)) und MAP-002 samt MAP-003 ([`Etappe T`](abnahme/etappe-t-kartendienst.md)); FIX-EPIC-001 und MAP-003 brauchen Docker. Gesamtliste: [`abnahme/README.md`](abnahme/README.md).

## Letzte Session

**Was bisher nur als Vertrag dastand, rechnet jetzt** — und der Browser spricht dafür weiter nur
mit der eigenen Anwendung. Lokal: `git pull origin main`, sonst nichts; dann die Abnahme oben.
