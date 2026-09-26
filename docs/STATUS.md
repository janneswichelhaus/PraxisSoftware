# Status · Stand 2026-09-26 · letzte Session: UX-EPIC-002 Rest (BEF-041 bis BEF-044)

Livestand, sonst nichts. Die **Reihenfolge** legt [`development/ROADMAP.md`](development/ROADMAP.md)
fest (Kette in 15 Blöcken), Befunde sammelt [`development/BEFUNDE.md`](development/BEFUNDE.md),
Ideen gehören nach [`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md).

## Jetzt

**UX-EPIC-002 gebaut** (Block 1a): Chrome installiert die App wieder (`minimal-ui`), **Dauertermin** geht aus dem Kalender ohne Vorauswahl (erst Person, dann Grundlage), der Kalender reicht **randlos** bis an den Rand, die Zeile „Kalender · Touren" ist weg — **Tour** steht neben Tag und Woche. Pull Request offen, wartet auf deinen Merge; danach die Sichtung am Handy. Fortschritt **36,7 %**.

## Danach — Bauen

1. **G6c** — abgewiesene Schreibzugriffe nachweisbar, **wie empfohlen** entschieden (2026-09-26): HTTP 403 bei bestätigter Transaktion für Rollen und Konten, Legal Hold und Löschaufträge, ohne Eintrag für den Rest. `/weiter G6c`
2. **UX-EPIC-003** — Tagesansicht fürs Handy als Startseite (erster Weg, Vorschau auf den nächsten, Liege ab dem n-ten Besuch). `/weiter UX-EPIC-003`
3. Block 2 weiter mit **FRB-EPIC-003** (Befund aus Bausteinen); D2/D3 gelten ohne Antwort wie im FRB-Plan vorgeschlagen; am Ende von Block 2 neu **STA-EPIC-001 Statistiken** (fünf Kennzahlen zur Praxissteuerung, Roadmap 7.2)

## Prüfverfahren

**Die CI läuft.** Lokal: `pnpm test:db` gegen einen Wegwerf-Container (54329); **angemeldete E2E-Tests und die Deno-Laufzeit laufen in der Cloud nicht**. Stand heute: `test` **2537**; `test:db` **1973** (in UX-EPIC-002 nicht gelaufen, keine Datenbankänderung); `test:e2e` ohne Anmeldung: 83 grün, einer übersprungen (Zwei-Finger-Zoom nur im Handyprofil). In der Cloud braucht `login.spec.ts` die Platzhalter aus der CI (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), sonst zeigt die App den Konfigurationsfehler. Sichtprüfung der Tourenkomponenten, der Instrumente, des Befunds und des Kalenders über die Prüfseiten `tests/e2e/fixtures/karte.html`, `instrumente.html`, `befund.html`, `kalender.html` und `organisation.html` bei 1280 und 375 px; die Seiten hinter der Anmeldung nur über Komponententests.

## Blocker (Jannes-seitig)

- **Sichtung** (E-6), ab jetzt am Handy auf der Test-Umgebung (freie Sichtung Kalender 2026-09-26: BEF-035 bis BEF-040, zweite Runde BEF-041 bis BEF-044, Stoff für UX-EPIC-002/003): Der Rückstand steht in vier Dateien zu höchstens 15 Schritten — [Kernprozess](sichtung/kernprozess.md), [Leistungsbereiche](sichtung/leistungsbereiche.md), [Kartendienst](sichtung/kartendienst.md) (Teil am Telefon: Wegpunktlimit, `MAX_ZWISCHENZIELE` bleibt bei drei), [Betriebsreife](sichtung/betriebsreife.md). Start mit `/sichtung`; Bedienung in [`DEVELOPMENT.md`](DEVELOPMENT.md), „Test-Umgebung".
- **Kalender und Begriffe am Handy sichten** (UX-EPIC-002): Schritte 1, 2, 5 und 7 bis 10 in [Kernprozess](sichtung/kernprozess.md) — Lupe, Kopf über dem Raster, zweiter Tipp, zwei Finger, „Jetzt", Installation in Chrome mit grünem Symbol, Dauertermin ohne Vorauswahl, Kalender randlos und „Tour", „Fehlzeit" statt „Ereignis", Organisatorisches mit eingeklappter Vorschau. Zu bestätigen: **ANN-108**, **ANN-109**, **ANN-110** (`minimal-ui` oder volle Höhe mit `standalone`?), **ANN-111** (passt „Fehlzeit" auch für ein Teammeeting?), **ANN-112** (Vorschauen eingeklappt oder ganz aus dem Menü), **ANN-113** (Tour mit zwei Tipps unter „Ansicht und Filter" oder einem im Kopf?) und **ANN-114** (weitere Seiten randlos?).
- **Anamnese sichten** (neu, FRB-EPIC-002): Schritte 3 bis 5 in [Befund](sichtung/befund.md); **ANN-104** ist bestätigt (2026-09-26); für die externe Prüfung nach ADR-006 bleibt sie im Prüfpaket.
- **Bögen für NRS, PSFS und Veränderungsfrage** (ANN-099): die Vorlagen als PDF nach `quellen/scores/pdf/` — dann werden die drei auf 1.0.0 aktiviert und erscheinen im Befund und im Verlauf.
- **Logfrist für Betriebslogs (R14 alt, jetzt R9):** (a) ADR-011 Punkt 4 senken oder (b) Ausleitungsweg. Empfehlung: nach G3. Gebraucht vor echten Daten.
- **BEF-026 / B13 (wieder offen):** Die Plattform braucht Mails an Patient:innen; Empfehlung: eigener SMTP-Anbieter, geprüft in Block 11. STAFF-004 ruht bis dahin.
- **D2/D3 aus dem FRB-Plan** vor FRB-EPIC-003; ohne Antwort gilt der Vorschlag dort.
- **Preise** für Abo und Pakete vor Block 5 (bis dahin synthetisch); **G13** (Umsatzsteuer-Status, Befreiungshinweis, Kürzel `RG`/`TR`) vor M3.
- **B8:** schriftlicher Lizenzbeleg bis M3.
- **Sieben alte Branches löschen** (freigegeben, aber aus der Cloud-Session gesperrt): `git push origin --delete claude/befunde-kalender-2026-09-18 claude/issue-42-status-fv319v claude/konsolidierung-r2 claude/nice-goldberg-kcnct0 claude/r3-analyse claude/r3-code-review-hardening-c22b8f claude/hopeful-mendel-ib440i` — ihr Inhalt steht auf `main`.
- **Ab Anfang 2027 parallel zum Bauen (E-1, 2026-09-23):** OPS-001-Unterlagen, Anfragen B1, B2, B4, Anbieterprüfungen.
- **Lokal:** `git pull`, **Node 22** (`.nvmrc`).

## Letzte Session

**UX-EPIC-002, Rest (UX-002i bis UX-002l).** Web-Manifest `minimal-ui`, Chrome installiert wieder (BEF-041, ANN-110 fortgeschrieben); neue Seite `/termine/dauertermin` — Person, dann Grundlage, dann Serie (BEF-042); Kalender randlos über `RANDLOSE_SEITEN` (BEF-043, ANN-114); Zeile „Kalender · Touren" entfällt, „Tour" als dritte Ansicht (BEF-044, ANN-113). Sichtung Kernprozess in den Schritten 5, 9 und 10 ergänzt; zwei neue E2E-Fälle auf der Prüfseite `kalender.html`. Keine Migration, keine Policy, kein neuer RPC. **Lokale Schritte:** `git pull origin claude/loving-cori-fs0wq4` (nach dem Merge `main`). Keine neue Abhängigkeit, keine Migration.
