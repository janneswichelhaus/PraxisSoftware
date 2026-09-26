# Status · Stand 2026-09-25 · letzte Session: OPS-002a

Livestand, sonst nichts. Die **Reihenfolge** legt [`development/ROADMAP.md`](development/ROADMAP.md)
fest (Kette in 15 Blöcken), Befunde sammelt [`development/BEFUNDE.md`](development/BEFUNDE.md),
Ideen gehören nach [`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md).

## Jetzt

**OPS-002a in Betrieb** (Block 1a, erster Loop): Die Test-Umgebung läuft — `https://prtest.uber.space`, zweite Tür (`praxis`), Anmeldung mit den Testkonten und `TESTENV_LOGIN_PASSWORD`; Jannes ist am 2026-09-25 am Handy drin. Nach jeder grünen CI auf `main` liefert `.github/workflows/test-umgebung.yml` aus; Seed und Praxiswoche nur auf Knopfdruck. Erster Betrieb brauchte drei Korrekturen (#114 Kennwortdatei im Webordner, #115 eine SSH-Verbindung, #116 Projekt-URL ohne Pfad). Fortschritt **35,3 %**.

## Danach — Bauen

1. **G6c**, sobald deine Wahl unter „Blocker" da ist
2. **UX-EPIC-002**, sobald deine Begriffsliste da ist — am besten am Handy auf der Test-Umgebung gesammelt
3. Solange beides fehlt: **Block 2 weiter mit FRB-EPIC-002** (Anamnese und Verlauf in der Akte) — Bauen wartet nicht (§15.2)

## Prüfverfahren

**Die CI läuft.** Lokal: `pnpm test:db` gegen einen Wegwerf-Container (54329); **angemeldete E2E-Tests und die Deno-Laufzeit laufen in der Cloud nicht**. Stand heute: `test` **2412**; `test:db` **1946** (neu: Neu-Aufsetzen der Test-Umgebung, OPS-002a); `test:e2e` ohne Anmeldung: Prüfseiten grün, `login.spec.ts` in der Cloud rot — auf `main` identisch. Sichtprüfung der Tourenkomponenten und der Instrumente über die Prüfseiten `tests/e2e/fixtures/karte.html` und `instrumente.html` bei 1280 und 375 px; die Seiten hinter der Anmeldung nur über Komponententests.

## Blocker (Jannes-seitig)

- **Sichtung** (E-6), ab jetzt am Handy auf der Test-Umgebung: Der Rückstand steht in vier Dateien zu höchstens 15 Schritten — [Kernprozess](sichtung/kernprozess.md), [Leistungsbereiche](sichtung/leistungsbereiche.md), [Kartendienst](sichtung/kartendienst.md) (Teil am Telefon: Wegpunktlimit, `MAX_ZWISCHENZIELE` bleibt bei drei), [Betriebsreife](sichtung/betriebsreife.md). Start mit `/sichtung`; Bedienung in [`DEVELOPMENT.md`](DEVELOPMENT.md), „Test-Umgebung".
- **Bögen für NRS, PSFS und Veränderungsfrage** (neu, ANN-099): die Vorlagen, die die Praxis nutzt, als PDF nach `quellen/scores/pdf/` — dann wird der Wortlaut dagegen gehalten und die drei auf Version 1.0.0 aktiviert. Nicht dringend: Erhoben wird erst mit FRB-EPIC-002.
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

**OPS-002a — Test-Umgebung.** Workflow `test-umgebung.yml` (nach grüner CI auf `main` und von Hand): Secrets prüfen (kein `service_role` im Bundle), `supabase db push`, Seed plus Praxiswoche nur auf Knopfdruck oder gegen ein leeres Projekt, in **einer** Transaktion mit dem Kennwort aus dem Secret, sonst gesperrt (ANN-100); `.htaccess` mit Kopfzeilen, CSP, `noindex` und optionaler zweiter Tür, Upload per `rsync` über IPv4, danach Prüfung der ausgelieferten Seite (ANN-101). Lokal geprüft: `db push` gegen die Wegwerf-Datenbank, CSP an der gebauten Anwendung; **nicht gelaufen:** der Weg zu Uberspace und Supabase (aus der Cloud gesperrt). **Lokale Schritte:** `git pull origin claude/nifty-edison-h316eu` (nach dem Merge `main`). Keine Migration, keine neue Abhängigkeit.
