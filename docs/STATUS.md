# Status · Stand 2026-09-26 · letzte Session: UX-EPIC-002 fertig (Begriffe, Navigation, BEF-033, BEF-034)

Livestand, sonst nichts. Die **Reihenfolge** legt [`development/ROADMAP.md`](development/ROADMAP.md)
fest (Kette in 15 Blöcken), Befunde sammelt [`development/BEFUNDE.md`](development/BEFUNDE.md),
Ideen gehören nach [`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md).

## Jetzt

**UX-EPIC-002 gebaut** (Block 1a): Begriffe stehen in einer Quelle (`src/lib/begriffe.ts`), ein Gate hält abgelöste Wörter fern; im Kalender heißt der Eintrag ohne Patient:in überall **„Fehlzeit"**. Die Aufbewahrungsseite zeigt „§". **Organisatorisches** öffnet auf den Mitarbeitenden, die Vorschauen stehen eingeklappt; trainer sieht „Arbeitszeiten" nicht mehr. Pull Request offen, wartet auf deinen Merge. Fortschritt **36,8 %**.

## Danach — Bauen

1. **G6c**, sobald deine Wahl unter „Blocker" da ist
2. **UX-EPIC-003** — Tagesansicht fürs Handy als Startseite (Block 1a), mit dem, was die Sichtung von UX-EPIC-002 ergibt. `/weiter UX-EPIC-003`
3. Danach Block 2 weiter mit **FRB-EPIC-003** (Befund aus Bausteinen); D2/D3 gelten ohne Antwort wie im FRB-Plan vorgeschlagen

## Prüfverfahren

**Die CI läuft.** Lokal: `pnpm test:db` gegen einen Wegwerf-Container (54329); **angemeldete E2E-Tests und die Deno-Laufzeit laufen in der Cloud nicht**. Stand heute: `test` **2527**; `test:db` **1973** (in UX-EPIC-002 nicht gelaufen, keine Datenbankänderung); `test:e2e` ohne Anmeldung: 79 grün, einer übersprungen (Zwei-Finger-Zoom nur im Handyprofil). In der Cloud braucht `login.spec.ts` die Platzhalter aus der CI (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), sonst zeigt die App den Konfigurationsfehler. Sichtprüfung der Tourenkomponenten, der Instrumente, des Befunds und des Kalenders über die Prüfseiten `tests/e2e/fixtures/karte.html`, `instrumente.html`, `befund.html`, `kalender.html` und `organisation.html` bei 1280 und 375 px; die Seiten hinter der Anmeldung nur über Komponententests.

## Blocker (Jannes-seitig)

- **Sichtung** (E-6), ab jetzt am Handy auf der Test-Umgebung (erste freie Sichtung Kalender 2026-09-26: BEF-035 bis BEF-040, Stoff für UX-EPIC-002/003): Der Rückstand steht in vier Dateien zu höchstens 15 Schritten — [Kernprozess](sichtung/kernprozess.md), [Leistungsbereiche](sichtung/leistungsbereiche.md), [Kartendienst](sichtung/kartendienst.md) (Teil am Telefon: Wegpunktlimit, `MAX_ZWISCHENZIELE` bleibt bei drei), [Betriebsreife](sichtung/betriebsreife.md). Start mit `/sichtung`; Bedienung in [`DEVELOPMENT.md`](DEVELOPMENT.md), „Test-Umgebung".
- **Kalender und Begriffe am Handy sichten** (UX-EPIC-002): Schritte 1, 2 und 7 bis 10 in [Kernprozess](sichtung/kernprozess.md) — Lupe, Kopf über dem Raster, zweiter Tipp, zwei Finger, „Jetzt", Android-Symbol, „Fehlzeit" statt „Ereignis", Organisatorisches mit eingeklappter Vorschau. Zeigt Android weiter den weißen Kreis, ist der Weg in **ANN-110** beschrieben (`minimal-ui`). Zu bestätigen: **ANN-108**, **ANN-109**, **ANN-111** (passt „Fehlzeit" auch für ein Teammeeting?) und **ANN-112** (Vorschauen eingeklappt oder ganz aus dem Menü).
- **Anamnese sichten** (neu, FRB-EPIC-002): Schritte 3 bis 5 in [Befund](sichtung/befund.md); **ANN-104** ist bestätigt (2026-09-26); für die externe Prüfung nach ADR-006 bleibt sie im Prüfpaket.
- **Bögen für NRS, PSFS und Veränderungsfrage** (ANN-099): die Vorlagen als PDF nach `quellen/scores/pdf/` — dann werden die drei auf 1.0.0 aktiviert und erscheinen im Befund und im Verlauf.
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

**UX-EPIC-002, Rest (UX-002f bis UX-002h).** Begriffe als eine Quelle mit Gate (ANN-111), „§" auf der Aufbewahrungsseite (BEF-033), Navigation nach den Bedienprinzipien und trainer ohne Arbeitszeiten (ANN-112, BEF-034); Bedienprinzipien als Punkt 11 der Oberflächen-Checkliste; neue Prüfseite `tests/e2e/fixtures/organisation.html` mit E2E-Test. Keine Migration, keine Policy, kein RPC. **Lokale Schritte:** `git pull origin claude/eloquent-gates-f37in6` (nach dem Merge `main`). Keine neue Abhängigkeit, keine Migration.
