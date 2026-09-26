# Status · Stand 2026-09-26 · letzte Session: UX-EPIC-002 (BEF-035 bis BEF-040)

Livestand, sonst nichts. Die **Reihenfolge** legt [`development/ROADMAP.md`](development/ROADMAP.md)
fest (Kette in 15 Blöcken), Befunde sammelt [`development/BEFUNDE.md`](development/BEFUNDE.md),
Ideen gehören nach [`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md).

## Jetzt

**UX-EPIC-002, erste Stories gebaut** (Block 1a, BEF-035 bis BEF-040): Über dem Kalender nur noch Monat, Person mit Kalenderwoche und „Jetzt"; Ansicht, Zoom und Filter liegen in der Ecke des Rasters; die Anlegen-Leiste steht unten, ein zweiter Tipp hebt auf oder zieht die Spanne auf; zwei Finger zoomen das Raster; am Handy ist die Suche eine Lupe; das Android-Symbol kommt aus einem Web-Manifest. Pull Request offen, wartet auf deinen Merge. Fortschritt **36,4 %**.

## Danach — Bauen

1. **G6c**, sobald deine Wahl unter „Blocker" da ist
2. **UX-EPIC-002, Rest** — Begriffe als eine Quelle im Code, Navigation und Arbeitsbereiche nach den Bedienprinzipien; mit dem, was die Sichtung von BEF-035 bis BEF-040 ergibt; erste Stories **BEF-041 bis BEF-044** (Chrome-Installation, Dauertermin ohne Vorauswahl, Kalender randlos, Touren in den Kalender statt eigener Zeile). `/weiter UX-EPIC-002`
3. Danach Block 2 weiter mit **FRB-EPIC-003**; am Ende von Block 2 neu **STA-EPIC-001 Statistiken** (fünf Kennzahlen zur Praxissteuerung, Roadmap 7.2) (Befund aus Bausteinen); D2/D3 gelten ohne Antwort wie im FRB-Plan vorgeschlagen

## Prüfverfahren

**Die CI läuft.** Lokal: `pnpm test:db` gegen einen Wegwerf-Container (54329); **angemeldete E2E-Tests und die Deno-Laufzeit laufen in der Cloud nicht**. Stand heute: `test` **2514**; `test:db` **1973** (in UX-EPIC-002 nicht gelaufen, keine Datenbankänderung); `test:e2e` ohne Anmeldung: 45 grün, einer übersprungen (Zwei-Finger-Zoom nur im Handyprofil), auch `login.spec.ts`. Sichtprüfung der Tourenkomponenten, der Instrumente, des Befunds und des Kalenders über die Prüfseiten `tests/e2e/fixtures/karte.html`, `instrumente.html`, `befund.html` und `kalender.html` bei 1280 und 375 px; die Seiten hinter der Anmeldung nur über Komponententests.

## Blocker (Jannes-seitig)

- **Sichtung** (E-6), ab jetzt am Handy auf der Test-Umgebung (freie Sichtung Kalender 2026-09-26: BEF-035 bis BEF-040, zweite Runde BEF-041 bis BEF-044, Stoff für UX-EPIC-002/003): Der Rückstand steht in vier Dateien zu höchstens 15 Schritten — [Kernprozess](sichtung/kernprozess.md), [Leistungsbereiche](sichtung/leistungsbereiche.md), [Kartendienst](sichtung/kartendienst.md) (Teil am Telefon: Wegpunktlimit, `MAX_ZWISCHENZIELE` bleibt bei drei), [Betriebsreife](sichtung/betriebsreife.md). Start mit `/sichtung`; Bedienung in [`DEVELOPMENT.md`](DEVELOPMENT.md), „Test-Umgebung".
- **Kalender am Handy sichten** (neu, UX-EPIC-002): Schritte 1, 2, 9 und 10 in [Kernprozess](sichtung/kernprozess.md) — Lupe, Kopf über dem Raster, zweiter Tipp, zwei Finger, „Jetzt", Android-Symbol (Seite neu zum Startbildschirm hinzufügen). Zeigt Android weiter den weißen Kreis, ist der Weg in **ANN-110** beschrieben (`minimal-ui`). Zu bestätigen: **ANN-108** (Leiste unten, Spanne aus zwei Tipps) und **ANN-109** (was oben steht, was in die Ecke wandert).
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

**UX-EPIC-002, erste Stories (BEF-035 bis BEF-040).** Fünf Stories: Uhrzeit im Rahmen der Auswahl (UX-002a), Anlegen-Leiste unten und zweiter Tipp (UX-002b, ANN-108), Zoomen mit zwei Fingern (UX-002c), Kopf über dem Raster mit Monatskalender, Person und KW, „Jetzt" mit Linie, Ecke für Ansicht und Filter, Lupe (UX-002d, ANN-109), Web-Manifest mit dem Master als maskierbarem Symbol (UX-002e, ANN-110). Keine Migration, keine Policy, kein RPC. Neue Prüfseite `tests/e2e/fixtures/kalender.html` mit E2E-Test. **Lokale Schritte:** `git pull origin claude/feature-loop-bef-035-040-6mkpai` (nach dem Merge `main`). Keine neue Abhängigkeit, keine Migration.
