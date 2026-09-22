# Status · Stand 2026-09-22 · letzte Session: MAP-004 Fahrzeitmatrix

Livestand, sonst nichts. Die **Reihenfolge** legt [`development/ROADMAP.md`](development/ROADMAP.md)
fest, Befunde sammelt [`development/BEFUNDE.md`](development/BEFUNDE.md), Ideen gehören nach
[`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md); ein Eintrag hier ist keine Einplanung.

## Jetzt

**MAP-004 ist gebaut, abgenommen ist es nicht.** Die Function kennt eine zweite Aufgabe: eine Fahrzeitmatrix über die acht Teststopps, dazu die reine Domänenfunktion `erreichbarkeit()` in `scheduling` und die Matrix als Tabelle auf `/touren/karte`, markiert an einem **erfundenen** Terminraster. Keine Migration, keine Speicherung. **Die Schreibweise der Matrix-Anfrage ist abgeleitet, nicht geprüft** — `api.myptv.com` ist aus der Cloud gesperrt, und bei der Route hat dieselbe Lage drei Fehler gekostet (BEF-023). Schritt 1 der Abnahme ist genau dafür da. Fortschritt **43,9 → 44,7 %**.

## Danach — Reihenfolge seit 2026-09-22

1. **MAP-005** — Navigations-Handoff mit einem Tap (ANN-018); **B2** entscheidet über das
   Scharfschalten, nicht über den Bau (§15.2, ADR-019 Punkt 23)
2. **OPS-004** — Verbotsliste aus ADR-011 automatisiert prüfen, mit der Logfrist aus **R14**
   (**OPS-003 geht nicht vor**: „PITR aktiv" setzt das Cloudprojekt voraus)
3. **OPS-006 (minimal)** — Betroffenenrechte: Verfahren, Export der Akte, begründete Ablehnung

## Prüfverfahren

**Die CI läuft wieder** (seit PR #48). Lokal: `pnpm test:db` gegen einen Wegwerf-Container (54329);
**angemeldete E2E-Tests und die Deno-Laufzeit laufen in der Cloud nicht**. Stand heute: `test:db` **1769** Tests (unverändert, keine Migration), `test` **2202**. `ASSUMPTIONS.md`: **1198** Zeilen (ANN-091, Obergrenze mit angehoben).

## Blocker (Jannes-seitig)

- **OPS-001 weitertragen** — sonst bleibt jede Zeile der Prüfung ein Suchauszug: Unterlagen aus Teil 9 von einem **ungeproxten Rechner** laden; zwei Fragen an den Support (**Zugriff durch Beschäftigte**, **Verschlüsselung der Objekte**); Gate-Punkt 1 bis 6 an **B2**, darunter **§203
  Abs. 4 StGB** — der einzige, dessen Scheitern den Anbieter kostet. **Zuerst** `auth-smtp`.
- **BEF-026 / B13:** Der eingebaute Mailversand stellt laut Auszug nur an Adressen des Projektteams zu. Entweder eigener SMTP-Anbieter (zweiter Auftragsverarbeiter, eigene Prüfung, Rücknahme von B13) oder kein Mailversand (Handgriff nach ANN-025). **STAFF-004 ruht bis dahin.**
- **MAP-003 und MAP-004 abnehmen** ([`abnahme/etappe-t-kartendienst.md`](abnahme/etappe-t-kartendienst.md)): nur lokal — `[edge_runtime] enabled = true` **für den Lauf** (im Repository bleibt `false`), `supabase/functions/.env.local`, `functions serve`. MAP-003 Schritt 1 und 4 **durch** (25,4 km gegen 26,2 km, Lastenrad gewählt); **BEF-027 behoben** — offen bleiben Schritt 2, 3 und 5 sowie **alle fünf Schritte von MAP-004**.
- **Freigabe für Etappe TR.** §14 nimmt den **Trainingsbereich selbst** aus; ohne neue Version nach §21 beginnt dort kein Loop — gebraucht, wenn Etappe TR an der Reihe ist.
- **PTV:** Karte und Schlüssel tragen auch serverseitig (BEF-021, BEF-022). Offen: **Domainbindung** (ADR-019 Punkt 19) und die **Höchstzahl der Relationen je Matrix-Anfrage** (ANN-091 überbrückt sie mit 25 × 25); nur synthetische Koordinaten.
- **Lokal:** `git pull`. Keine neue Abhängigkeit, keine Migration. **Node 22** (`.nvmrc`), sonst rot.
- **G13 fehlt:** Umsatzsteuer-Status, **Wortlaut des Befreiungshinweises**, die **Kürzel der beiden
  Nummernkreise** (`RG`/`TR`) — ANN-074/075/082; dazu echte Preise. **B4** entscheidet zusätzlich über den **ermäßigten Satz**; bis dahin weist eine Constraint ihn ab.
- **B9:** Die Auswertung liefert beide Grundlagen und wählt keine; welche die Gewinnermittlung verlangt, gehört mit B4 in dieselbe Frage (**ANN-088**).
- **M0 (Vorlauf):** B1, B2, B4 ([`decisions/ANFRAGEN.md`](decisions/ANFRAGEN.md)) — **B2 trägt** die
  Trennung aus ADR-021, die Einwilligung im Training, die Office-Sicht (§4.8), **die Frist für
  Screening-Daten**, den **Handoff** (ADR-019 Punkt 23) · **Secret Scanning** · Kartendienst ablegen.
- **Abnahme R3** (25 Befunde umgesetzt, 26 bleiben Backlog) und **CAL-018, CAL-EPIC-004a/b/c,
  FIX-EPIC-004, UX-013, GRD-001, VER-EPIC-002, ABR-EPIC-001/002a/b/003** in
  [`abnahme/etappe-1-kernprozess.md`](abnahme/etappe-1-kernprozess.md); **Sichtprüfung hinter der Anmeldung wartet auf OPS-002** — in der Cloud startet kein GoTrue.
- **B8:** Lizenzbeleg · ungemergt liegen `claude/issue-42-status-fv319v` (3), `claude/r3-analyse` (5) und `claude/r3-code-review-hardening-c22b8f` (1 Commit).

## Auf Abnahme warten

Alles aus Etappe 1 seit CAL-EPIC-003b, dazu DAT-EPIC-001, ROL-EPIC-001, FIX-015, ABR-EPIC-004, LEI-EPIC-001, FRB-EPIC-000, CAL-EPIC-005 samt CAL-027, ABR-EPIC-005, ABR-EPIC-006 ([`Etappe L`](abnahme/etappe-l-leistungsbereiche.md)) und MAP-002 samt MAP-003 und MAP-004 ([`Etappe T`](abnahme/etappe-t-kartendienst.md)); FIX-EPIC-001, MAP-003 und MAP-004 brauchen Docker. Gesamtliste: [`abnahme/README.md`](abnahme/README.md).

## Letzte Session

**Die Matrix rechnet, die Regel warnt, gespeichert wird nichts.** Neu ist **ANN-091**: Ohne Antwort des PTV-Supports begrenzt die Function eine Matrix selbst auf 25 × 25 Punkte — sonst löst ein Aufruf beliebig viele Relationen aus, und bezahlt wird je Relation. Der **Fahrpuffer der Praxis** ist bewusst **keine** Annahme geworden: Fünf Minuten sind Teil des erfundenen Rasters, die echte Zahl gehört zu MAP-006 (§8.1) und steht als Zeile in der Roadmap. Aus der Sichtprüfung bei 375 px kam **BEF-029** — 64 unsichtbare Zellenbeschriftungen zogen die ganze Seite in die Breite; behoben.
