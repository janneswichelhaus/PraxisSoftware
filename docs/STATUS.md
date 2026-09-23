# Status · Stand 2026-09-23 · letzte Session: G6a

Livestand, sonst nichts. Die **Reihenfolge** legt [`development/ROADMAP.md`](development/ROADMAP.md)
fest (Kette in 15 Blöcken), Befunde sammelt [`development/BEFUNDE.md`](development/BEFUNDE.md),
Ideen gehören nach [`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md).

## Jetzt

**Roadmap 6.1 ist in Kraft.** Zur Eröffnung im Juli 2027 läuft das Endprodukt: Kern, Tagesroute, Befund, Praxisverwaltung, Training, Plattform für Patient:innen und Kund:innen mit Abo und Paketen, Praxisbetrieb, KI-Assistenz (`PROJECT_PRINCIPLES.md` 0.16 §14). Externe Prüfungen (OPS-001, B1, B2, B4) kommen **nach** dem Feature-Freeze M2. Was §17 verbietet, steht unter „Nicht in V1". Fortschritt **33,7 %** (vorher 33,3). Zuletzt **G6a gebaut**: Abgewiesene Lesezugriffe auf klinische Dokumente stehen mit `denied` im Auditlog; der Rest ist **G6b**.

## Danach — Block 1, dann Block 2

1. **G6b Abgewiesene Zugriffe, Rest** — `/feature-loop G6b Abgewiesene Zugriffe nach docs/development/ROADMAP.md, Block 1`; Teil 1 (Lesepfade) ohne Entscheidung, Teil 2 (Schreibpfade) wartet auf deine Wahl unter „Blocker"
2. **MAP-006 Tagesroute** mit Fahrpuffer (`docs/development/MAP-LOOPS.md`) — synthetische Adressen; das Gate steht vor dem Scharfschalten
3. **FRB-EPIC-001 Instrumentenbibliothek** (`docs/development/FRB-BAUSTEINE-UND-SCORES.md`)

Danach FRB-EPIC-002 → FRB-EPIC-003 → DOK-005 → PRX-EPIC-001 bis 003. **Docs-Session ADR-023 Plattformzugang** darf jederzeit dazwischen laufen und muss vor Block 4 angenommen sein. Die inhaltliche Durchsicht vor dem B2-Paket (Rest von BEF-028) gehört zum DSFA-Paket in Block 10.

## Prüfverfahren

**Die CI läuft.** Lokal: `pnpm test:db` gegen einen Wegwerf-Container (54329); **angemeldete E2E-Tests und die Deno-Laufzeit laufen in der Cloud nicht**. Stand heute: `test` **2347**; `test:db` **1835** (mit G6a, eine Migration). Keine Sichtprüfung: keine Oberfläche geändert.

## Blocker (Jannes-seitig)

- **Abnahme-Rückstand über 30 Epics — Abweichungsregel 1 greift:** Jede zweite Session ist eine Abnahme, bis weniger als fünf warten. Lokal mit `supabase start`, je Etappe am Stück ([`abnahme/README.md`](abnahme/README.md)), Aufruf „Abnahme" in der Roadmap. Zuerst **M1** (Etappe 1, [`abnahme/etappe-1-kernprozess.md`](abnahme/etappe-1-kernprozess.md)), dann Etappe L, G und T.
- **MAP-003, MAP-004, MAP-005** ([`abnahme/etappe-t-kartendienst.md`](abnahme/etappe-t-kartendienst.md)): MAP-003 Schritte 2, 3, 5 und alle fünf von MAP-004 lokal mit `[edge_runtime] enabled = true` **für den Lauf** (im Repository bleibt `false`); MAP-005 Teil A erneut prüfen (dabei MAP-002 Schritt 3), **Teil B am Telefon ruht**, bis ein Gerät da ist — `MAX_ZWISCHENZIELE` bleibt bei drei.
- **G6b Teil 2, Schreibpfade** (Optionen in der Roadmap, Block 1): Empfehlung (a) HTTP 403 bei bestätigter Transaktion für Rollen und Konten, Legal Hold und Löschaufträge, (c) für den Rest. Ohne Antwort baut G6b nur Teil 1.
- **Logfrist für Betriebslogs (R14 alt, jetzt R9):** (a) ADR-011 Punkt 4 senken oder (b) Ausleitungsweg. Empfehlung: nach G3. Gebraucht vor echten Daten.
- **BEF-026 / B13:** Die Plattform braucht Mails an Patient:innen; Empfehlung: eigener SMTP-Anbieter, geprüft in Block 11. STAFF-004 ruht bis dahin.
- **D2/D3 aus dem FRB-Plan** vor FRB-EPIC-003; ohne Antwort gilt der Vorschlag dort.
- **Preise** für Abo und Pakete vor Block 5 (bis dahin synthetisch); **G13** (Umsatzsteuer-Status, Befreiungshinweis, Kürzel `RG`/`TR`) vor M3.
- **B8:** schriftlicher Lizenzbeleg bis M3 · ungemergt liegen `claude/issue-42-status-fv319v`, `claude/r3-analyse`, `claude/r3-code-review-hardening-c22b8f`.
- **Nach M2, nicht vorher (Entscheidung 2026-09-22):** OPS-001-Unterlagen, Anfragen B1, B2, B4, Anbieterprüfungen. **R1:** Ist M2 ein halbes Jahr vor der Eröffnung nicht in Sicht, reicht die Zeit für die Prüfungen voraussichtlich nicht — §15.2 erlaubt, sie jederzeit früher zu schicken.
- **Lokal:** `git pull`, **Node 22** (`.nvmrc`).

## Auf Abnahme warten

Alles aus Etappe 1 seit CAL-EPIC-003b, dazu DAT-EPIC-001, ROL-EPIC-001, FIX-015, Etappe L (ABR-EPIC-004 bis 006, LEI-EPIC-001, CAL-EPIC-005, CAL-027), FRB-EPIC-000, MAP-002 bis MAP-005 ([Etappe T](abnahme/etappe-t-kartendienst.md)), OPS-006, OPS-007 (lokal mit `db reset --no-seed`) und PAT-006 ([Etappe G](abnahme/etappe-g-betriebsreife.md)). Gesamtliste: [`abnahme/README.md`](abnahme/README.md).

## Letzte Session

**G6a gebaut.** Die fünf Lesepfade auf Behandlungsdokumentation und klinische Behandlungsgrundlage weisen ein Konto ohne Leserolle mit null Zeilen statt einer Ausnahme ab und schreiben `denied` über `app.record_denied_read`. Die Auswahl folgt aus ADR-010 Punkt 2, **keine neue Annahme**. Gegenprobe gelaufen: ein Grant auf den Helfer und ein zurückgesetzter Pfad machen genau die drei zuständigen Tests rot. **Lokale Schritte:** `git pull origin claude/erste-offene-aufgabe-jkvhs3`, `pnpm dlx supabase@2.116.0 db reset` (neue Migration), keine neue Abhängigkeit.
