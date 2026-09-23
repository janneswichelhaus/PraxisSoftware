# Status · Stand 2026-09-23 · letzte Session: Umbau U4

Livestand, sonst nichts. Die **Reihenfolge** legt [`development/ROADMAP.md`](development/ROADMAP.md)
fest (Kette in 15 Blöcken), Befunde sammelt [`development/BEFUNDE.md`](development/BEFUNDE.md),
Ideen gehören nach [`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md).

## Jetzt

**Umbau läuft** ([`development/UMBAU.md`](development/UMBAU.md)): Jannes' Entscheidungen E-1 bis E-7 vom 2026-09-23 werden in fünf Schritten eingearbeitet, nicht angehängt. U1 bis U4 sind erledigt; es fehlt U5. Seit U3 beginnt jede Session mit **`/weiter`**, **`/idee <Text>`** oder **`/sichtung`**; der Fortschritt steht nur noch in `fortschritt.json`. Fortschritt **33,7 %**.

## Danach — Umbau, dann Bauen

1. **U5 Test-Umgebung** — `/weiter`; dafür brauche ich deine Entscheidung zum Hosting (kommt in U5 mit Optionen)
2. **G6c**, sobald deine Wahl unter „Blocker" da ist, sonst **Block 1a „Handy und UX-Fundament"** (OPS-002a → UX-EPIC-002 → UX-EPIC-003)
3. **Block 2 „Kern fertig"** nach der Roadmap

## Prüfverfahren

**Die CI läuft.** Lokal: `pnpm test:db` gegen einen Wegwerf-Container (54329); **angemeldete E2E-Tests und die Deno-Laufzeit laufen in der Cloud nicht**. Stand heute: `test` **2350**; `test:db` **1871** (mit G6b, eine Migration; in U4 nicht gelaufen, weil keine Datenbank berührt ist). Keine Sichtprüfung: U4 ändert nur Dokumentation und drei Codekommentare.

## Blocker (Jannes-seitig)

- **Sichtung** (E-6): Der Rückstand steht in vier Dateien zu höchstens 15 Schritten — [Kernprozess](sichtung/kernprozess.md), [Leistungsbereiche](sichtung/leistungsbereiche.md), [Kartendienst](sichtung/kartendienst.md) (Teil am Telefon: Wegpunktlimit, `MAX_ZWISCHENZIELE` bleibt bei drei), [Betriebsreife](sichtung/betriebsreife.md). Start mit `/sichtung`; am Handy im WLAN nach [`DEVELOPMENT.md`](DEVELOPMENT.md), „Handytest im WLAN".
- **Begriffe sammeln**, die in der Anwendung stören (Stichworte oder Bildschirmfotos) — Grundlage für UX-EPIC-002.
- **G6c Schreibpfade** (Optionen in der Roadmap, Block 1): Empfehlung (a) HTTP 403 bei bestätigter Transaktion für Rollen und Konten, Legal Hold und Löschaufträge, (c) für den Rest. Ohne Antwort geht es mit Block 2 weiter.
- **Logfrist für Betriebslogs (R14 alt, jetzt R9):** (a) ADR-011 Punkt 4 senken oder (b) Ausleitungsweg. Empfehlung: nach G3. Gebraucht vor echten Daten.
- **BEF-026 / B13 (wieder offen):** Die Plattform braucht Mails an Patient:innen; Empfehlung: eigener SMTP-Anbieter, geprüft in Block 11. STAFF-004 ruht bis dahin.
- **D2/D3 aus dem FRB-Plan** vor FRB-EPIC-003; ohne Antwort gilt der Vorschlag dort.
- **Preise** für Abo und Pakete vor Block 5 (bis dahin synthetisch); **G13** (Umsatzsteuer-Status, Befreiungshinweis, Kürzel `RG`/`TR`) vor M3.
- **B8:** schriftlicher Lizenzbeleg bis M3.
- **Sieben alte Branches löschen** (freigegeben, aber aus der Cloud-Session gesperrt): `git push origin --delete claude/befunde-kalender-2026-09-18 claude/issue-42-status-fv319v claude/konsolidierung-r2 claude/nice-goldberg-kcnct0 claude/r3-analyse claude/r3-code-review-hardening-c22b8f claude/hopeful-mendel-ib440i` — ihr Inhalt steht auf `main`.
- **Ab Anfang 2027 parallel zum Bauen (E-1, 2026-09-23):** OPS-001-Unterlagen, Anfragen B1, B2, B4, Anbieterprüfungen.
- **Lokal:** `git pull`, **Node 22** (`.nvmrc`).

## Letzte Session

**Umbau U4 — Register aufgeräumt.** [`ASSUMPTIONS.md`](decisions/ASSUMPTIONS.md): tote Anker auf die Behandlungsgrundlage umgestellt, ANN-012 und ANN-037 als abgelöst verkürzt, Statuszeilen einheitlich, Prüfpaket jetzt **38** Einträge (vier Rechtsannahmen zur Steuer und Lizenz neu, ANN-064 heraus), 21 abgelaufene Wiedervorlagen auf den Stand der fertigen Abrechnungs- und Karten-Loops, ANN-025 mit §4 und B13 zusammengeführt. [`OPEN_DECISIONS.md`](decisions/OPEN_DECISIONS.md): **B13 wieder offen**, Termine gestrichen, E16 als erledigt verkürzt, falsche G-Kennungen berichtigt. BEF-004, -007, -020 erledigt; `ARBEITSBEREICHE.md` und die Köpfe der Kartendienst- und PDF-Vorlage nachgezogen. **Keine neue Annahme** — ANN-086 steht jetzt auf `entschieden (Jannes)`, weil deine Erklärung vom 2026-09-21 genau das ist. **Lokale Schritte:** `git pull origin main` nach dem Merge; keine Migration, keine neue Abhängigkeit.
