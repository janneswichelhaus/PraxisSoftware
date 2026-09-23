# Status · Stand 2026-09-23 · letzte Session: Umbau U5

Livestand, sonst nichts. Die **Reihenfolge** legt [`development/ROADMAP.md`](development/ROADMAP.md)
fest (Kette in 15 Blöcken), Befunde sammelt [`development/BEFUNDE.md`](development/BEFUNDE.md),
Ideen gehören nach [`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md).

## Jetzt

**Umbau fertig** ([`development/UMBAU.md`](development/UMBAU.md)): U1 bis U5 erledigt; das Hosting der Test-Umgebung ist entschieden (**B16: Uberspace**). Jetzt liegt die Einrichtung bei dir, danach baut OPS-002a die Auslieferung. Jede Session beginnt mit **`/weiter`**, **`/idee <Text>`** oder **`/sichtung`**; der Fortschritt steht nur in `fortschritt.json`. Fortschritt **33,7 %**.

## Danach — Bauen

1. **G6c**, sobald deine Wahl unter „Blocker" da ist
2. **OPS-002a Test-Umgebung**, sobald du „Konten stehen" meldest; dann UX-EPIC-002, sobald deine Begriffsliste da ist
3. Solange beides fehlt: **Block 2 „Kern fertig"** nach der Roadmap (MAP-006 zuerst) — Bauen wartet nicht (§15.2)

## Prüfverfahren

**Die CI läuft.** Lokal: `pnpm test:db` gegen einen Wegwerf-Container (54329); **angemeldete E2E-Tests und die Deno-Laufzeit laufen in der Cloud nicht**. Stand heute: `test` **2350**; `test:db` **1871** (mit G6b, eine Migration; in U4 und U5 nicht gelaufen, weil keine Datenbank berührt ist). Keine Sichtprüfung: U5 ändert nur Dokumentation.

## Blocker (Jannes-seitig)

- **Test-Umgebung einrichten** (B16: Uberspace, neu): Supabase-Testprojekt in Frankfurt, Uberspace-Konto mit AVV und Deploy-Schlüssel, sieben Secrets in der GitHub-Umgebung `test` — Schritt für Schritt in [`hosting-optionen.md`](decisions/hosting-optionen.md), „Das genaue Vorgehen", etwa eine Stunde. Danach nur „Konten stehen" melden, **keine Werte in den Chat**.
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

**Umbau U5 — Test-Umgebung, B16 entschieden: Uberspace.** Neu [`hosting-optionen.md`](decisions/hosting-optionen.md): was der Hosting-Anbieter sieht (nur statische Dateien und IP-Adressen, keine Patientendaten — später aber das Patientenverhältnis selbst), vier Optionen (Uberspace, Hetzner Webhosting, Bunny.net, Cloudflare Pages mit Access) und drei zurückgestellte, Empfehlung Uberspace, Langfrist-Einordnung, Prüfpunkte vor der Bestellung, das Vorgehen in drei Schritten. Belegtiefe nur Suchauszüge, die Anbieterseiten sind aus der Cloud gesperrt. Du hast Uberspace gewählt; das Dokument trägt jetzt die Einrichtungsanleitung mit den festen Secret-Namen für OPS-002a. **B16** in [`OPEN_DECISIONS.md`](decisions/OPEN_DECISIONS.md) entschieden; UMBAU, Roadmap (Block 1a, OPS-002a, „Bei Jannes") nachgezogen. **Keine neue Annahme** — ein neuer Anbieter ist ein Stopp, keine Annahme. **Lokale Schritte:** `git pull origin main` nach dem Merge; keine Migration, keine neue Abhängigkeit.
