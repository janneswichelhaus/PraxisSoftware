# Status · Stand 2026-09-22 · letzte Session: MAP-005 Navigations-Handoff

Livestand, sonst nichts. Die **Reihenfolge** legt [`development/ROADMAP.md`](development/ROADMAP.md)
fest, Befunde sammelt [`development/BEFUNDE.md`](development/BEFUNDE.md), Ideen gehören nach
[`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md); ein Eintrag hier ist keine Einplanung.

## Jetzt

**MAP-005 ist gebaut, abgenommen ist es nicht.** `buildNavigationUrl(ziel, app)` bedient alle drei Ziel-Apps aus ADR-019 Punkt 22, und `/touren/karte` trägt den Knopf je Teststopp und für den Tag — die URL entsteht erst beim Tippen, gespeichert wird nichts, eine Präferenz ist nicht vorgebaut. **Apple Maps und `geo:` sind erstmals aus Primärquellen belegt**; Google bleibt Suchauszug, weil `developers.google.com` aus der Cloud gesperrt ist. Deshalb erzwingt die Anwendung **drei statt neun Zwischenziele** und teilt längere Tage in sichtbare Abschnitte — was trägt, sagt erst die Gerätebewertung auf einem echten Telefon. Fortschritt **44,7 → 45,5 %**.

## Danach — Reihenfolge seit 2026-09-22

1. **OPS-004** — Verbotsliste aus ADR-011 automatisiert prüfen, mit der Logfrist aus **R14**
   (**OPS-003 geht nicht vor**: „PITR aktiv" setzt das Cloudprojekt voraus)
2. **OPS-006 (minimal)** — Betroffenenrechte: Verfahren, Export der Akte, begründete Ablehnung
3. **OPS-007** — Bootstrap-Runbook, gegen die Testumgebung geprobt (G11, M3)

## Prüfverfahren

**Die CI läuft wieder** (seit PR #48). Lokal: `pnpm test:db` gegen einen Wegwerf-Container (54329);
**angemeldete E2E-Tests und die Deno-Laufzeit laufen in der Cloud nicht**. Stand heute: `test` **2236** (+34); `test:db` **1769** — in dieser Session **nicht gelaufen**, weil keine Migration und keine Policy berührt ist. `ASSUMPTIONS.md`: **1198** Zeilen (unverändert, MAP-005 brauchte keine neue Annahme).

## Blocker (Jannes-seitig)

- **OPS-001 weitertragen** — sonst bleibt jede Zeile der Prüfung ein Suchauszug: Unterlagen aus Teil 9 von einem **ungeproxten Rechner** laden; zwei Fragen an den Support (**Zugriff durch Beschäftigte**, **Verschlüsselung der Objekte**); Gate-Punkt 1 bis 6 an **B2**, darunter **§203
  Abs. 4 StGB** — der einzige, dessen Scheitern den Anbieter kostet. **Zuerst** `auth-smtp`.
- **BEF-026 / B13:** Der eingebaute Mailversand stellt laut Auszug nur an Adressen des Projektteams zu. Entweder eigener SMTP-Anbieter (zweiter Auftragsverarbeiter, eigene Prüfung, Rücknahme von B13) oder kein Mailversand (Handgriff nach ANN-025). **STAFF-004 ruht bis dahin.**
- **MAP-003, MAP-004 und MAP-005 abnehmen** ([`abnahme/etappe-t-kartendienst.md`](abnahme/etappe-t-kartendienst.md)): MAP-003 und MAP-004 nur lokal — `[edge_runtime] enabled = true` **für den Lauf** (im Repository bleibt `false`), `supabase/functions/.env.local`, `functions serve`. MAP-003 Schritt 1 und 4 **durch**, **BEF-027 behoben**; offen bleiben Schritt 2, 3 und 5 sowie **alle fünf Schritte von MAP-004**. **MAP-005 braucht weder Docker noch Schlüssel**, aber ein Android- und ein iOS-Gerät (`pnpm dev --host`).
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

Alles aus Etappe 1 seit CAL-EPIC-003b, dazu DAT-EPIC-001, ROL-EPIC-001, FIX-015, ABR-EPIC-004, LEI-EPIC-001, FRB-EPIC-000, CAL-EPIC-005 samt CAL-027, ABR-EPIC-005, ABR-EPIC-006 ([`Etappe L`](abnahme/etappe-l-leistungsbereiche.md)) und MAP-002 samt MAP-003, MAP-004 und MAP-005 ([`Etappe T`](abnahme/etappe-t-kartendienst.md)); FIX-EPIC-001, MAP-003 und MAP-004 brauchen Docker. Gesamtliste: [`abnahme/README.md`](abnahme/README.md).

## Letzte Session

**Der Handoff steht, die Zahl fehlt.** Apple Maps (`/directions`, wiederholbares `waypoint`, `mode=cycling`, ab iOS 18.4) und der `geo:`-URI sind aus den Anbieterdokumenten belegt — bei Google blieb es beim Suchauszug, und dieselbe Lage hat in MAP-004 drei Fehler gekostet. **Neue Annahme keine:** ANN-018 deckt Format und Limit und wurde nur nachgeführt. Aus der Unsicherheit wurde eine Entscheidung gegen die bequemere Zahl: Wer neun Zwischenziele übergibt und im mobilen Browser landet, verliert Stopps **still** — drei sind sichtbar teuer, aber ehrlich. Die Fortschrittstabelle hat außerdem die fehlende **MAP-004-Zeile** bekommen.
