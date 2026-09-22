# Status · Stand 2026-09-22 · letzte Session: OPS-004, zweiter Teil

Livestand, sonst nichts. Die **Reihenfolge** legt [`development/ROADMAP.md`](development/ROADMAP.md)
fest, Befunde sammelt [`development/BEFUNDE.md`](development/BEFUNDE.md), Ideen gehören nach
[`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md); ein Eintrag hier ist keine Einplanung.

## Jetzt

**Ein abgewiesener Blick ins Auditlog ist jetzt selbst nachweisbar, und ein externer Fehlerdienst ist ausgeschlossen, bis jemand ihn prüft.** OPS-004 (G6), zweiter Teil: `list_audit_events` und `list_deletion_runs` weisen Konten ohne `owner` mit **null Zeilen statt einer Ausnahme** ab und schreiben den Versuch mit `outcome = 'denied'` ins Auditlog — die Ausnahme hatte den Eintrag bisher mit zurückgerollt. Kein externes Error-Tracking in V1: keine Annahme, sondern Folge aus ADR-011 Punkt 5 und ADR-002, gehalten als Gate in `protokollierung.test.ts`. Die übrigen rund 80 Abweisungen stehen als **G6a** in der Roadmap. Keine neue Annahme, G6 bleibt `in_arbeit`, Fortschritt **47,8 %** unverändert.

## Danach — Reihenfolge seit 2026-09-22

1. **PAT-006 (G8)** — Datenschutzinformation und Einwilligungen; das Verfahren aus OPS-006 verweist
   an zwei Stellen darauf, und ohne Einwilligung gibt es nichts zu widerrufen
2. **E2 Ausfallkonzept (G10)** — Tagesplan mit Adressen und Telefonnummern druck- und exportierbar;
   zugleich der Rückfallplan der Eröffnung (H4)
3. **G19 Dokumentationsgate erweitern (BEF-028)** — vor der inhaltlichen Durchsicht für B2; der Rest
   von OPS-004 (Alarmierung, Security-Log 12 Monate, Art. 33) wartet auf **G3**

## Prüfverfahren

**Die CI läuft wieder** (seit PR #48). Lokal: `pnpm test:db` gegen einen Wegwerf-Container (54329); **angemeldete E2E-Tests und die Deno-Laufzeit laufen in der Cloud nicht**. Stand heute: `test` **2309** (3 neu); `test:db` **1812** (4 neu) — in dieser Session **vollständig gelaufen**, weil eine Migration dazukam. `ASSUMPTIONS.md`: **1210** Zeilen, unverändert. **Gegenproben** gelaufen (Grant auf die Hilfsfunktion, `@sentry/react`). **Keine Sichtprüfung** — die Oberfläche ist nicht berührt.

## Blocker (Jannes-seitig)

- **Logfrist für Betriebslogs entscheiden (R14)** — neu aus dieser Session, und es ist eine Wahl mit
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
- **Lokal:** `git pull`, dann `pnpm dlx supabase@2.116.0 db reset` — **eine neue Migration**. Keine neue Abhängigkeit. **Node 22** (`.nvmrc`), sonst rot.
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

Alles aus Etappe 1 seit CAL-EPIC-003b, dazu DAT-EPIC-001, ROL-EPIC-001, FIX-015, ABR-EPIC-004, LEI-EPIC-001, FRB-EPIC-000, CAL-EPIC-005 samt CAL-027, ABR-EPIC-005, ABR-EPIC-006 ([`Etappe L`](abnahme/etappe-l-leistungsbereiche.md)) und MAP-002 samt MAP-003, MAP-004 und MAP-005 ([`Etappe T`](abnahme/etappe-t-kartendienst.md)); FIX-EPIC-001, MAP-003 und MAP-004 brauchen Docker. Gesamtliste: [`abnahme/README.md`](abnahme/README.md). **OPS-006** und **OPS-007** kommen neu dazu ([Etappe G](abnahme/etappe-g-betriebsreife.md); OPS-007 lokal mit `db reset --no-seed`); **OPS-004 steht nicht dabei** — was der Loop davor gebaut hat, prüfen Tests und Lint, nicht ein Klickweg.

## Letzte Session

**Die Spalte `outcome` kannte `denied` seit August, geschrieben hat es niemand.** Der Grund war kein Versäumnis, sondern PostgreSQL: Wer mit einer Ausnahme abweist, rollt seinen eigenen Protokolleintrag mit zurück. Für die zwei Lesepfade der Praxisleitung heißt die Abweisung deshalb jetzt „null Zeilen und ein Eintrag" — gesperrt ist dasselbe, aber ein Aufruf an der Oberfläche vorbei hinterlässt eine Spur. Geschrieben wird aus einer Hilfsfunktion, die keine Anwendungsrolle aufrufen darf; sonst ließe sich das Log mit erfundenen Abweisungen füllen. **Abweichung vom Vorschlag:** Angekündigt war ANN-093 für die Error-Tracking-Entscheidung. Das Register steht auf seiner Obergrenze, und es ist keine Annahme — die Entscheidung folgt aus ADR-011 und ADR-002; sie steht jetzt als Vermerk im ADR und als Test. **Lokale Schritte:** `git pull origin claude/erste-offene-aufgabe-y7vokz`, `pnpm dlx supabase@2.116.0 db reset`.
