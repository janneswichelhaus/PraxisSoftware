# Status · Stand 2026-09-22 · letzte Session: PAT-006

Livestand, sonst nichts. Die **Reihenfolge** legt [`development/ROADMAP.md`](development/ROADMAP.md)
fest, Befunde sammelt [`development/BEFUNDE.md`](development/BEFUNDE.md), Ideen gehören nach
[`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md); ein Eintrag hier ist keine Einplanung.

## Jetzt

**Die Akte weiß jetzt, was auf Papier geschehen ist.** PAT-006 (G8): neuer Aktenbereich **Datenschutz** mit den Vermerken „Datenschutzinformation ausgehändigt am" (samt Fassung) und „Behandlungsvertrag unterschrieben am" sowie Einwilligungen je Zweck. Ein **Widerruf ist eine eigene Zeile** und löscht die Erteilung nicht; kein Konto ändert oder löscht einen Vermerk. Dazu ein Druckblatt: Datenschutzinformation (nennt den Kartendienst nach ADR-019) und Ausfallhonorar-Regel ohne Betrag, beide sichtbar als **Entwurf**. Neue Annahme **ANN-093** (zwei Zwecke). Fortschritt **48,3 %** (vorher 47,8).

## Danach — Reihenfolge seit 2026-09-22

1. **E2 Ausfallkonzept (G10)** — Tagesplan mit Adressen und Telefonnummern druck- und exportierbar;
   zugleich der Rückfallplan der Eröffnung (H4)
2. **G19 Dokumentationsgate erweitern (BEF-028)** — vor der inhaltlichen Durchsicht für B2; der Rest
   von OPS-004 (Alarmierung, Security-Log 12 Monate, Art. 33) wartet auf **G3**
3. **G6a Abgewiesene Zugriffe, Rest** — die übrigen rund 80 Abweisungen nachweisbar machen

## Prüfverfahren

**Die CI läuft wieder** (seit PR #48). Lokal: `pnpm test:db` gegen einen Wegwerf-Container (54329); **angemeldete E2E-Tests und die Deno-Laufzeit laufen in der Cloud nicht**. Stand heute: `test` **2328** (19 neu); `test:db` **1834** (22 neu) — **vollständig gelaufen**, weil eine Migration dazukam. `ASSUMPTIONS.md`: **1222** Zeilen (Obergrenze um 12 angehoben, wie bei den zehn Einträgen davor). **Sichtprüfung** bei 375 und 1280 px in einer Wegwerf-Umgebung mit synthetischen Daten und ersetzter API — die echte Anmeldung läuft in der Cloud nicht; kein waagerechtes Scrollen, zwei Befunde daraus behoben.

## Blocker (Jannes-seitig)

- **Datenschutzinformation und Ausfallhonorar-Text (PAT-006)** gehen als Entwurf in **B2** und **B4**;
  bis dahin keine Aushändigung an echte Patient:innen. Offen dort: weitere Zwecke (Fotos, Angehörige).
- **Logfrist für Betriebslogs entscheiden (R14)** — es ist eine Wahl mit
  zwei Wegen: **(a) andere Frist** — ADR-011 Punkt 4 in einer neuen Fassung auf das senken, was die
  Plattform hält (1 bis 28 Tage); billig, aber es verkürzt die Zeit, in der ein Vorfall nach Art. 33
  überhaupt noch nachweisbar ist. **(b) Ausleitungsweg** — Logs zu einem eigenen Ziel schreiben;
  hält die 30 Tage, ist aber ein **zweiter Auftragsverarbeiter** mit eigenem Prüfkatalog nach
  ADR-002. **Empfehlung: (a) vorerst nicht, (b) erst nach G3** — bis zum Scharfschalten ist nichts
  davon nötig, und mit synthetischen Daten kostet die Lücke nichts. Gebraucht wird die Antwort,
  **bevor echte Daten laufen**; bis dahin steht die 30 im Code als Anforderung, nicht als Zusage.
- **OPS-001 weitertragen** — sonst bleibt jede Zeile der Prüfung ein Suchauszug: Unterlagen aus Teil 9 von einem **ungeproxten Rechner** laden; zwei Fragen an den Support (**Zugriff durch Beschäftigte**, **Verschlüsselung der Objekte**); Gate-Punkt 1 bis 6 an **B2**, darunter **§203 Abs. 4 StGB** — der einzige, dessen Scheitern den Anbieter kostet. **Zuerst** `auth-smtp`.
- **BEF-026 / B13:** Der eingebaute Mailversand stellt laut Auszug nur an Adressen des Projektteams zu. Entweder eigener SMTP-Anbieter (zweiter Auftragsverarbeiter, eigene Prüfung, Rücknahme von B13) oder kein Mailversand (Handgriff nach ANN-025). **STAFF-004 ruht bis dahin.**
- **MAP-003, MAP-004 und MAP-005 abnehmen** ([`abnahme/etappe-t-kartendienst.md`](abnahme/etappe-t-kartendienst.md)): MAP-003 und MAP-004 nur lokal — `[edge_runtime] enabled = true` **für den Lauf** (im Repository bleibt `false`), `supabase/functions/.env.local`, `functions serve`. MAP-003 Schritt 1 und 4 **durch**, **BEF-027 behoben**; offen bleiben Schritt 2, 3 und 5 sowie **alle fünf Schritte von MAP-004**. **MAP-005 Teil A ist durch** (Laptop, 2026-09-22) — die drei Befunde daraus sind behoben und in Teil A **erneut zu prüfen**, weil die Seite sich geändert hat; dabei gleich **MAP-002 Schritt 3** mitprüfen, der ohne Vorschaubanner neu geschrieben ist. **Teil B am Telefon ruht**, bis ein Gerät da ist. Bis dahin bleibt `MAX_ZWISCHENZIELE` bei drei.
- **Freigabe für Etappe TR.** §14 nimmt den **Trainingsbereich selbst** aus; ohne neue Version nach §21 beginnt dort kein Loop — gebraucht, wenn Etappe TR an der Reihe ist.
- **PTV:** Karte und Schlüssel tragen auch serverseitig (BEF-021, BEF-022). Offen: **Domainbindung** (ADR-019 Punkt 19) und die **Höchstzahl der Relationen je Matrix-Anfrage** (ANN-091 überbrückt sie mit 25 × 25); nur synthetische Koordinaten.
- **Lokal:** `git pull`, dann `pnpm dlx supabase@2.116.0 db reset` — **eine neue Migration** (PAT-006). Keine neue Abhängigkeit. **Node 22** (`.nvmrc`), sonst rot.
- **G13 fehlt:** Umsatzsteuer-Status, **Wortlaut des Befreiungshinweises**, die **Kürzel der beiden Nummernkreise** (`RG`/`TR`) — ANN-074/075/082; dazu echte Preise. **B4** entscheidet zusätzlich über den **ermäßigten Satz**; bis dahin weist eine Constraint ihn ab.
- **B9:** Die Auswertung liefert beide Grundlagen und wählt keine; welche die Gewinnermittlung verlangt, gehört mit B4 in dieselbe Frage (**ANN-088**).
- **M0 (Vorlauf):** B1, B2, B4 ([`decisions/ANFRAGEN.md`](decisions/ANFRAGEN.md)) — **B2 trägt** die
  Trennung aus ADR-021, die Einwilligung im Training, die Office-Sicht (§4.8), **die Frist für
  Screening-Daten**, den **Handoff** (ADR-019 Punkt 23) · **Secret Scanning** · Kartendienst ablegen.
- **Abnahme R3** (25 Befunde umgesetzt, 26 bleiben Backlog) und **CAL-018, CAL-EPIC-004a/b/c,
  FIX-EPIC-004, UX-013, GRD-001, VER-EPIC-002, ABR-EPIC-001/002a/b/003** in
  [`abnahme/etappe-1-kernprozess.md`](abnahme/etappe-1-kernprozess.md); **Sichtprüfung hinter der Anmeldung wartet auf OPS-002** — in der Cloud startet kein GoTrue.
- **B8:** Lizenzbeleg · ungemergt liegen `claude/issue-42-status-fv319v` (3), `claude/r3-analyse` (5) und `claude/r3-code-review-hardening-c22b8f` (1 Commit).

## Auf Abnahme warten

Alles aus Etappe 1 seit CAL-EPIC-003b, dazu DAT-EPIC-001, ROL-EPIC-001, FIX-015, ABR-EPIC-004, LEI-EPIC-001, FRB-EPIC-000, CAL-EPIC-005 samt CAL-027, ABR-EPIC-005, ABR-EPIC-006 ([`Etappe L`](abnahme/etappe-l-leistungsbereiche.md)) und MAP-002 samt MAP-003, MAP-004 und MAP-005 ([`Etappe T`](abnahme/etappe-t-kartendienst.md)); FIX-EPIC-001, MAP-003 und MAP-004 brauchen Docker. Gesamtliste: [`abnahme/README.md`](abnahme/README.md). **OPS-006**, **OPS-007** und neu **PAT-006** ([Etappe G](abnahme/etappe-g-betriebsreife.md); OPS-007 lokal mit `db reset --no-seed`); OPS-004 prüfen Tests und Lint, nicht ein Klickweg.

## Letzte Session

**Die Einwilligung war die Lücke zwischen zwei gebauten Dingen:** Der Mailweg (ANN-041) setzte einen „ausdrücklichen Wunsch" voraus, das Verfahren für Betroffenenrechte einen Widerruf — keins von beiden hatte einen Ort in der Akte. Jetzt hat es einen, und zwar bewusst als Vermerk und nicht als Schranke: Die Anwendung zeigt den Stand, sie sperrt den Mailweg nicht; ob sie das soll, ist Teil von ANN-093 und geht an B2. Die Behandlung selbst braucht keine Einwilligung — eine daneben wäre wegen ihrer Widerrufbarkeit die schwächere Grundlage. **Lokale Schritte:** `git pull origin claude/erste-offene-aufgabe-d5bwbn`, `pnpm dlx supabase@2.116.0 db reset`.
