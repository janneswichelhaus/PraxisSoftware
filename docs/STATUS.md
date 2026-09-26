# Status · Stand 2026-09-26 · letzte Session: UX-EPIC-003 (Tagesstart am Handy)

Livestand, sonst nichts. Die **Reihenfolge** legt [`development/ROADMAP.md`](development/ROADMAP.md)
fest (Kette in 15 Blöcken), Befunde sammelt [`development/BEFUNDE.md`](development/BEFUNDE.md),
Ideen gehören nach [`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md).

## Jetzt

**UX-EPIC-003 gebaut** (Block 1a ist damit gebaut): Die Übersicht beginnt am Handy mit **„Liege heute: ja, ab 2. Besuch (10:00 Uhr)"** oder „nein", dem ersten Weg mit „Navigation starten" als Hauptknopf und „Bisherige Doku" (ein Tipp in den Verlauf), darunter eine Vorschau auf den Besuch danach; der Rest ist zugeklappt. Die Liege ist ein Merkmal der Person, gesetzt in der Akte unter Stammdaten → „Hausbesuch und Versorgung". Pull Request offen, wartet auf deinen Merge (Zweitreview gelaufen, nichts blockierend). Fortschritt **38,1 %**.

## Danach — Bauen

1. Block 2 weiter mit **FRB-EPIC-003** (Befund aus Bausteinen, darin das Liege-Merkmal im Befund); D2/D3 gelten ohne Antwort wie im FRB-Plan vorgeschlagen. `/weiter FRB-EPIC-003`
2. **DOK-005**, danach **DOK-006** (Fotos in der Akte) in der Reihenfolge der Roadmap, Block 2.
3. Am Ende von Block 2 neu **STA-EPIC-001 Statistiken** (fünf Kennzahlen zur Praxissteuerung, Roadmap 7.2)

## Prüfverfahren

**Die CI läuft.** Lokal: `pnpm test:db` gegen einen Wegwerf-Container (54329); **angemeldete E2E-Tests und die Deno-Laufzeit laufen in der Cloud nicht**. Stand heute: `test` **2565**; `test:db` **2035** (UX-EPIC-003); `test:e2e` ohne Anmeldung: 89 grün, einer übersprungen (Zwei-Finger-Zoom nur im Handyprofil). In der Cloud braucht `login.spec.ts` die Platzhalter aus der CI (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), sonst zeigt die App den Konfigurationsfehler. Sichtprüfung der Tourenkomponenten, der Instrumente, des Befunds und des Kalenders über die Prüfseiten `tests/e2e/fixtures/karte.html`, `instrumente.html`, `befund.html`, `kalender.html`, `organisation.html` und `uebersicht.html` (Tagesstart, Liege in der Akte) bei 1280 und 375 px; die Seiten hinter der Anmeldung nur über Komponententests.

## Blocker (Jannes-seitig)

- **Tagesstart am Handy sichten** (UX-EPIC-003): Schritte 10 und 12 in [Kernprozess](sichtung/kernprozess.md). Zu bestätigen: **ANN-116** (Liege als organisatorische Angabe, sichtbar auch für Office) und **ANN-117** (Zählung „ab n. Besuch“ über die Behandlungen des Tages; Plan des Teams für Behandelnde zugeklappt).
- **G6c lokal prüfen** (ANN-115, auch nach dem Merge noch offen): `pnpm dlx supabase@2.116.0 start`, als Anna (therapist) angemeldet in der Browserkonsole einen Schreibpfad aufrufen, etwa `await supabase.rpc('place_legal_hold', { p_patient_id: '66666666-6666-4666-8666-000000000001', p_reason: 'Probe' })` — erwartet `status: 403`, danach als owner unter **Organisatorisches → Sicherheit** ein Eintrag „Legal Hold gesetzt" mit Ausgang abgewiesen. Zeigt die Antwort 403, aber fehlt der Eintrag, steht der Weg in ANN-115.
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

**UX-EPIC-003 (UX-003a, UX-003c).** Neue Spalte `patient_care_details.treatment_table_required` mit eigenem Schreibpfad `set_treatment_table_required` (Rollen wie `update_patient`, Audit `patient.updated` mit Feldnamen); Kartei, Auskunft nach Art. 15 und `list_day_plan` tragen das Merkmal, die Tagesliste nur am Behandlungstermin (ADR-022 Punkt 11). Übersicht mit Tagesstart (`src/features/today/tagesstart.ts`), neue Prüfseite `tests/e2e/fixtures/uebersicht.html` mit `uebersicht.spec.ts`. BEF-002 erledigt für die Reihenfolge. Seed: Max braucht die Liege. **Lokale Schritte:** `git pull origin claude/ux-epic-003-6n2fp8` (nach dem Merge `main`), dann `pnpm dlx supabase@2.116.0 db reset` (neue Migration, geänderter Seed). Keine neue Abhängigkeit.
