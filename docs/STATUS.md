# Status · Stand 2026-09-22 · letzte Session: OPS-004 Verbotsliste

Livestand, sonst nichts. Die **Reihenfolge** legt [`development/ROADMAP.md`](development/ROADMAP.md)
fest, Befunde sammelt [`development/BEFUNDE.md`](development/BEFUNDE.md), Ideen gehören nach
[`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md); ein Eintrag hier ist keine Einplanung.

## Jetzt

**Die Verbotsliste aus ADR-011 ist automatisiert geprüft — zur Laufzeit und in CI.** `src/lib/protokoll.ts` ist die eine Stelle aus ADR-011 Punkt 6, durch die Betriebslogs das Programm verlassen; sie filtert mit einer **Erlaubnisliste**, weil kein Muster einen Patientennamen zuverlässig erkennt. Der Befund davor war unbequem: `no-console` sperrte `console.log` und ließ `console.warn/error` frei — also genau den häufigen Fall offen. Der Test liest die elf Punkte **aus dem ADR**, nicht aus einer zweiten Fassung im Code; ein zwölfter macht ihn rot. Ein zweiter Wächter hält fest, dass es bei zwei erklärten Ausgängen bleibt. **Keine neue Annahme:** Die 30 Tage aus ADR-011 Punkt 4 haben mit `BETRIEBSLOG_FRIST_TAGE` erstmals einen Ort im Code — ANN-001 nannte `public.retention_classes`, aber Betriebslogs liegen nicht in unserer Datenbank. **G6 ist damit nicht fertig:** gebaut ist einer von sieben Punkten. Fortschritt **45,5 → 46,4 %**.

## Danach — Reihenfolge seit 2026-09-22

1. **OPS-006 (minimal)** — Betroffenenrechte: Verfahren, Export der Akte, begründete Ablehnung
2. **OPS-007** — Bootstrap-Runbook, gegen die Testumgebung geprobt (G11, M3)
3. **OPS-004, Rest** — davon gehen ohne Cloudprojekt nur zwei: Entscheidung zu externem
   Error-Tracking und „abgewiesene Zugriffe protokolliert"; Alarmierung, Security-Log 12 Monate
   und die Erkennung für Art. 33 warten auf **G3**

## Prüfverfahren

**Die CI läuft wieder** (seit PR #48). Lokal: `pnpm test:db` gegen einen Wegwerf-Container (54329);
**angemeldete E2E-Tests und die Deno-Laufzeit laufen in der Cloud nicht**. Stand heute: `test` **2272** (+36); `test:db` **1769** — in dieser Session **nicht gelaufen**, weil keine Migration und keine Policy berührt ist. `ASSUMPTIONS.md`: **1198** Zeilen (unverändert, OPS-004 brauchte keine neue Annahme).

## Blocker (Jannes-seitig)

- **Logfrist für Betriebslogs entscheiden (R14)** — neu aus dieser Session, und es ist eine Wahl mit
  zwei Wegen: **(a) andere Frist** — ADR-011 Punkt 4 in einer neuen Fassung auf das senken, was die
  Plattform hält (1 bis 28 Tage); billig, aber es verkürzt die Zeit, in der ein Vorfall nach Art. 33
  überhaupt noch nachweisbar ist. **(b) Ausleitungsweg** — Logs zu einem eigenen Ziel schreiben;
  hält die 30 Tage, ist aber ein **zweiter Auftragsverarbeiter** mit eigenem Prüfkatalog nach
  ADR-002. **Empfehlung: (a) vorerst nicht, (b) erst nach G3** — bis zum Scharfschalten ist nichts
  davon nötig, und mit synthetischen Daten kostet die Lücke nichts. Gebraucht wird die Antwort,
  **bevor echte Daten laufen**; bis dahin steht die 30 im Code als Anforderung, nicht als Zusage.
- **OPS-001 weitertragen** — sonst bleibt jede Zeile der Prüfung ein Suchauszug: Unterlagen aus Teil 9 von einem **ungeproxten Rechner** laden; zwei Fragen an den Support (**Zugriff durch Beschäftigte**, **Verschlüsselung der Objekte**); Gate-Punkt 1 bis 6 an **B2**, darunter **§203
  Abs. 4 StGB** — der einzige, dessen Scheitern den Anbieter kostet. **Zuerst** `auth-smtp`.
- **BEF-026 / B13:** Der eingebaute Mailversand stellt laut Auszug nur an Adressen des Projektteams zu. Entweder eigener SMTP-Anbieter (zweiter Auftragsverarbeiter, eigene Prüfung, Rücknahme von B13) oder kein Mailversand (Handgriff nach ANN-025). **STAFF-004 ruht bis dahin.**
- **MAP-003, MAP-004 und MAP-005 abnehmen** ([`abnahme/etappe-t-kartendienst.md`](abnahme/etappe-t-kartendienst.md)): MAP-003 und MAP-004 nur lokal — `[edge_runtime] enabled = true` **für den Lauf** (im Repository bleibt `false`), `supabase/functions/.env.local`, `functions serve`. MAP-003 Schritt 1 und 4 **durch**, **BEF-027 behoben**; offen bleiben Schritt 2, 3 und 5 sowie **alle fünf Schritte von MAP-004**. **MAP-005 ist in zwei Teilen abnehmbar**: **Teil A am Laptop** — er geht jetzt und deckt alles ab, was die Anwendung selbst verantwortet (kein Docker, kein Schlüssel); **Teil B am Telefon ruht**, bis ein Gerät da ist. Bis dahin bleibt `MAX_ZWISCHENZIELE` bei drei.
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

Alles aus Etappe 1 seit CAL-EPIC-003b, dazu DAT-EPIC-001, ROL-EPIC-001, FIX-015, ABR-EPIC-004, LEI-EPIC-001, FRB-EPIC-000, CAL-EPIC-005 samt CAL-027, ABR-EPIC-005, ABR-EPIC-006 ([`Etappe L`](abnahme/etappe-l-leistungsbereiche.md)) und MAP-002 samt MAP-003, MAP-004 und MAP-005 ([`Etappe T`](abnahme/etappe-t-kartendienst.md)); FIX-EPIC-001, MAP-003 und MAP-004 brauchen Docker. Gesamtliste: [`abnahme/README.md`](abnahme/README.md). **OPS-004 steht nicht dabei** — was dieser Loop gebaut hat, prüfen Tests und Lint, nicht ein Klickweg.

## Letzte Session

**Eine Verbotsliste, die niemand prüft, ist ein Vorsatz.** ADR-011 hatte das selbst geschrieben und die Frage offen gelassen, ob die Prüfung in CI oder zur Laufzeit gehört; die Antwort ist **beides**, und die beiden Teile prüfen Verschiedenes. Die eigentliche Entscheidung steckt in der Richtung des Filters: **Erlaubnisliste statt Verbotsliste**, weil ein Filter, der behauptet, Patientennamen zu erkennen, schlimmer ist als keiner. Heraus kommt nur, was vorher beschrieben wurde — ein fester Bezeichner, eine UUID, eine endliche Zahl. Eine echte Verbotsliste blieb für **Schlüsselnamen** (Token, Cookie, Authorization): der Fall, den die Erlaubnisliste nicht trägt, weil manche Sitzungsschlüssel wie UUIDs aussehen. **Vier Gegenproben** sind gelaufen und zurückgenommen worden, damit die Wächter nicht leerlaufen. Zur Logfrist ist bewusst **keine** Annahme entstanden: Die kleinere Zahl still einzutragen wäre das Aufweichen einer Nachweismöglichkeit gewesen.
