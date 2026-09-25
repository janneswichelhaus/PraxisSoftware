# Status · Stand 2026-09-25 · letzte Session: MAP-006

Livestand, sonst nichts. Die **Reihenfolge** legt [`development/ROADMAP.md`](development/ROADMAP.md)
fest (Kette in 15 Blöcken), Befunde sammelt [`development/BEFUNDE.md`](development/BEFUNDE.md),
Ideen gehören nach [`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md).

## Jetzt

**MAP-006 gebaut** (Block 2, erster Loop): Die Tagesroute liegt auf der Karte — mit synthetischen Adressen; echte erreichen den Kartendienst erst nach dem Gate (Schalter `LOCATION_DATA_GATE`, ANN-094). Pull Request offen, Zweitreview gelaufen, **Merge bei dir**. Die Test-Umgebung (B16: Uberspace) liegt weiter bei dir. Fortschritt **34,4 %**.

## Danach — Bauen

1. **G6c**, sobald deine Wahl unter „Blocker" da ist
2. **OPS-002a Test-Umgebung**, sobald du „Konten stehen" meldest; dann UX-EPIC-002, sobald deine Begriffsliste da ist
3. Solange beides fehlt: **Block 2 weiter mit FRB-EPIC-001** (Instrumentenbibliothek) — Bauen wartet nicht (§15.2)

## Prüfverfahren

**Die CI läuft.** Lokal: `pnpm test:db` gegen einen Wegwerf-Container (54329); **angemeldete E2E-Tests und die Deno-Laufzeit laufen in der Cloud nicht**. Stand heute: `test` **2361**; `test:db` **1937** (mit MAP-006, vier Migrationen); `test:e2e` ohne Anmeldung grün. Sichtprüfung der Tourenkomponenten über die Prüfseite `tests/e2e/fixtures/karte.html` bei 1280 und 375 px; die Seiten hinter der Anmeldung nur über Komponententests.

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

**MAP-006 — Tagesroute auf der Karte.** Koordinate bei der Adresse (verfällt mit jeder Adressänderung, Verorten auf Tipp in den Stammdaten, ANN-095), Startort der Touren in der Planung; `/touren` ist echt: Karte mit Nummern statt Namen (ANN-096), Route im Lastenradprofil, Fahrzeit und **Fahrpuffer nach §8.1** zwischen den Stopps (09:05–10:05 plus 12 Minuten ergibt 10:20; Warnung, keine Sperre, nichts gespeichert, ANN-097), druckbare Liste, Handoff mit Koordinate; Hinweis im Kalender (Tag mit Person) und Aufklapper in der Übersicht. Vorschau `/touren` und Prototyp `/touren/karte` entfallen. Datenschutz-Paket [`datenschutz/kartendienst.md`](datenschutz/kartendienst.md). Sichtung [Kartendienst](sichtung/kartendienst.md) auf die echte Seite umgestellt. **Lokale Schritte:** `git pull origin claude/map-006-cl59i6` (nach dem Merge `main`), `pnpm dlx supabase@2.116.0 db reset` (vier Migrationen, Seed mit Koordinaten), in `supabase/functions/.env.local` **`LOCATION_DATA_GATE=synthetic`** ergänzen — sonst meldet die Tour „Kein Kartendienst eingerichtet". Keine neue Abhängigkeit.
