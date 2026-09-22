# Status · Stand 2026-09-22 · letzte Session: BEF-027 Fehlermeldungen der Routenfunktion

Livestand, sonst nichts. Die **Reihenfolge** legt [`development/ROADMAP.md`](development/ROADMAP.md)
fest, Befunde sammelt [`development/BEFUNDE.md`](development/BEFUNDE.md), Ideen gehören nach
[`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md); ein Eintrag hier ist keine Einplanung.

## Jetzt

**Die Providerprüfung steht, bestanden ist sie nicht** —
[`decisions/providerpruefung-supabase.md`](decisions/providerpruefung-supabase.md). `supabase.com`
ist aus der Cloud gesperrt, kein Vertragstext war lesbar, **kein Eintrag trägt „belegt"**; zwölf Punkte stehen in der Gate-Liste. Drei Antworten ändern trotzdem etwas: **ADR-017 Punkt 5 fällt negativ aus**, **PITR wird Bedingung** (ADR-012), und die **Edge Runtime bleibt gesperrt** — mit vier Bedingungen statt eines Fragezeichens. Fortschritt **41,9 → 43,9 %**.

## Danach — Reihenfolge seit 2026-09-21

1. **MAP-004** — Fahrzeitmatrix auf der Function aus MAP-003; synthetische Koordinaten wie bisher,
   Lauf und Abnahme lokal — die Edge-Runtime-Sperre ändert daran nichts
2. **MAP-005** — Navigations-Handoff mit einem Tap (ANN-018); braucht den Handoff aus **B2**
3. **OPS-004** — Verbotsliste aus ADR-011 automatisiert prüfen, mit der Logfrist aus **R14**
   (**OPS-003 geht nicht vor**: „PITR aktiv" setzt das Cloudprojekt voraus)

## Prüfverfahren

**Die CI läuft wieder** (seit PR #48). Lokal: `pnpm test:db` gegen einen Wegwerf-Container (54329);
**angemeldete E2E-Tests und die Deno-Laufzeit laufen in der Cloud nicht**. Stand heute:
`test:db` **1769** Tests, `test` **2129**. `ASSUMPTIONS.md`: **1186** Zeilen, unverändert.

## Blocker (Jannes-seitig)

- **OPS-001 weitertragen** — sonst bleibt jede Zeile der Prüfung ein Suchauszug: Unterlagen aus Teil 9 von einem **ungeproxten Rechner** laden; zwei Fragen an den Support (**Zugriff durch Beschäftigte**, **Verschlüsselung der Objekte**); Gate-Punkt 1 bis 6 an **B2**, darunter **§203
  Abs. 4 StGB** — der einzige, dessen Scheitern den Anbieter kostet. **Zuerst** `auth-smtp`.
- **BEF-026 / B13:** Der eingebaute Mailversand stellt laut Auszug nur an Adressen des Projektteams zu. Entweder eigener SMTP-Anbieter (zweiter Auftragsverarbeiter, eigene Prüfung, Rücknahme von B13) oder kein Mailversand (Handgriff nach ANN-025). **STAFF-004 ruht bis dahin.**
- **MAP-003 abnehmen** ([`abnahme/etappe-t-kartendienst.md`](abnahme/etappe-t-kartendienst.md)):
  nur lokal — `[edge_runtime] enabled = true` **für den Lauf** (im Repository bleibt `false`),
  `supabase/functions/.env.local`, `functions serve`. **BEF-027 behoben** — die Meldungen zeigen
  jetzt auf den, der es war; Schritt 2 neu laufen. Offen: **Profilfrage aus MAP-003c**.
- **Freigabe für Etappe TR.** §14 nimmt den **Trainingsbereich selbst** aus; ohne neue Version nach §21 beginnt dort kein Loop — gebraucht, wenn Etappe TR an der Reihe ist.
- **PTV:** Karte und Schlüssel tragen auch serverseitig (BEF-021, BEF-022). Offen: **Domainbindung** (ADR-019 Punkt 19); nur synthetische Koordinaten.
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

Alles aus Etappe 1 seit CAL-EPIC-003b, dazu DAT-EPIC-001, ROL-EPIC-001, FIX-015, ABR-EPIC-004, LEI-EPIC-001, FRB-EPIC-000, CAL-EPIC-005 samt CAL-027, ABR-EPIC-005, ABR-EPIC-006 ([`Etappe L`](abnahme/etappe-l-leistungsbereiche.md)) und MAP-002 samt MAP-003 ([`Etappe T`](abnahme/etappe-t-kartendienst.md)); FIX-EPIC-001 und MAP-003 brauchen Docker. Gesamtliste: [`abnahme/README.md`](abnahme/README.md).

## Letzte Session

**Ein Befund aus dem Abnahmelauf, kein Feature** — **BEF-027**: `unauthorized` trug zwei
Bedeutungen, die Sitzungsprüfung kannte nur ja/nein, und eine Antwort **vor** der Function galt als
Anbieterausfall. Drei Ursachen, eine Meldung, und die zeigte auf den Kartendienst. Jetzt getrennt:
`session_invalid` und `function_unavailable` dazu, 12 Tests mehr. Keine neue Annahme.
