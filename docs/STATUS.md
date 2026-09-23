# Status · Stand 2026-09-23 · letzte Session: Umbau U3

Livestand, sonst nichts. Die **Reihenfolge** legt [`development/ROADMAP.md`](development/ROADMAP.md)
fest (Kette in 15 Blöcken), Befunde sammelt [`development/BEFUNDE.md`](development/BEFUNDE.md),
Ideen gehören nach [`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md).

## Jetzt

**Umbau läuft** ([`development/UMBAU.md`](development/UMBAU.md)): Jannes' Entscheidungen E-1 bis E-7 vom 2026-09-23 werden in fünf Schritten eingearbeitet, nicht angehängt. U1 bis U3 sind erledigt. Seit U3 beginnt jede Session mit **`/weiter`**, **`/idee <Text>`** oder **`/sichtung`**; der Fortschritt steht nur noch in `fortschritt.json`. Fortschritt **33,7 %**.

## Danach — Umbau, dann Bauen

1. **U4 Register** — `/weiter`
2. **U5 Test-Umgebung** — dafür brauche ich deine Entscheidung zum Hosting (kommt in U5 mit Optionen)
3. **G6c**, sobald deine Wahl unter „Blocker" da ist, sonst **Block 1a „Handy und UX-Fundament"** (OPS-002a → UX-EPIC-002 → UX-EPIC-003)

## Prüfverfahren

**Die CI läuft.** Lokal: `pnpm test:db` gegen einen Wegwerf-Container (54329); **angemeldete E2E-Tests und die Deno-Laufzeit laufen in der Cloud nicht**. Stand heute: `test` **2347**; `test:db` **1871** (mit G6b, eine Migration). Keine Sichtprüfung: Geändert sind nur zehn neue Einträge im Aktionsfilter des Auditlogs, und die Seite liegt hinter der Anmeldung.

## Blocker (Jannes-seitig)

- **Sichtung** (E-6): Der Rückstand steht in vier Dateien zu höchstens 15 Schritten — [Kernprozess](sichtung/kernprozess.md), [Leistungsbereiche](sichtung/leistungsbereiche.md), [Kartendienst](sichtung/kartendienst.md) (Teil am Telefon: Wegpunktlimit, `MAX_ZWISCHENZIELE` bleibt bei drei), [Betriebsreife](sichtung/betriebsreife.md). Start mit `/sichtung`; am Handy im WLAN nach [`DEVELOPMENT.md`](DEVELOPMENT.md), „Handytest im WLAN".
- **Begriffe sammeln**, die in der Anwendung stören (Stichworte oder Bildschirmfotos) — Grundlage für UX-EPIC-002.
- **G6c Schreibpfade** (Optionen in der Roadmap, Block 1): Empfehlung (a) HTTP 403 bei bestätigter Transaktion für Rollen und Konten, Legal Hold und Löschaufträge, (c) für den Rest. Ohne Antwort geht es mit Block 2 weiter.
- **Logfrist für Betriebslogs (R14 alt, jetzt R9):** (a) ADR-011 Punkt 4 senken oder (b) Ausleitungsweg. Empfehlung: nach G3. Gebraucht vor echten Daten.
- **BEF-026 / B13:** Die Plattform braucht Mails an Patient:innen; Empfehlung: eigener SMTP-Anbieter, geprüft in Block 11. STAFF-004 ruht bis dahin.
- **D2/D3 aus dem FRB-Plan** vor FRB-EPIC-003; ohne Antwort gilt der Vorschlag dort.
- **Preise** für Abo und Pakete vor Block 5 (bis dahin synthetisch); **G13** (Umsatzsteuer-Status, Befreiungshinweis, Kürzel `RG`/`TR`) vor M3.
- **B8:** schriftlicher Lizenzbeleg bis M3.
- **Sieben alte Branches löschen** (freigegeben, aber aus der Cloud-Session gesperrt): `git push origin --delete claude/befunde-kalender-2026-09-18 claude/issue-42-status-fv319v claude/konsolidierung-r2 claude/nice-goldberg-kcnct0 claude/r3-analyse claude/r3-code-review-hardening-c22b8f claude/hopeful-mendel-ib440i` — ihr Inhalt steht auf `main`.
- **Ab Anfang 2027 parallel zum Bauen (E-1, 2026-09-23):** OPS-001-Unterlagen, Anfragen B1, B2, B4, Anbieterprüfungen.
- **Lokal:** `git pull`, **Node 22** (`.nvmrc`).

## Letzte Session

**Umbau U3 — Ablauf schlank.** Skills `/weiter` (eine Leseregel: STATUS, Zeile der Aufgabe, benannte ADRs), `/idee`, `/sichtung`; [`development/SESSION-START.md`](development/SESSION-START.md) ist ein Satz. **Sichtung statt Abnahme:** [`sichtung/`](sichtung/README.md) mit vier Dateien, die alten Abnahmeschritte und erledigte Pläne (CAL-EPIC-004, VER-EPIC-002, E18, MAP-002 bis 005) im [Archiv](development/archiv/README.md). **Fortschritt:** `fortschritt.json` ist die einzige Quelle, `pnpm fortschritt --schreiben` erzeugt die Roadmap-Tabelle, `docs:check` prüft sie; Stufe `abgenommen` heißt `gesichtet`. `docs:check` begrenzt das Annahmenregister je Eintrag (14 Zeilen) statt als Summe. [`DEVELOPMENT.md`](DEVELOPMENT.md): Handytest im WLAN. **Wochenroutine abgeschaltet**; die verworfene Idee `IDEA-QSN-011` (Patientennummer) aus einem alten Branch in den Ideenspeicher übernommen. **Keine neue Annahme.** **Lokale Schritte:** `git pull origin main` nach dem Merge; keine Migration, keine neue Abhängigkeit.
