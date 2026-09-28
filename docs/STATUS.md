# Status · Stand 2026-09-28 · letzte Session: PRX-EPIC-002 (Am Termin steht, was man vor der Tür wissen muss)

Livestand, sonst nichts. Die **Reihenfolge** legt [`development/ROADMAP.md`](development/ROADMAP.md)
fest (Kette in 15 Blöcken), Befunde sammelt [`development/BEFUNDE.md`](development/BEFUNDE.md),
Ideen gehören nach [`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md).

## Jetzt

**PRX-EPIC-002 gebaut (Branch `claude/weiter-44wlun`):** Am Termin steht, was man vor der Tür wissen muss.

- **Kurzblick für die Vertretung** (am Behandlungstermin, zugeklappt): Zugang, Besonderheit, Material, feste Therapeut:in, Mengen der Grundlage und der letzte Eintrag im Wortlaut; jedes Aufklappen wird protokolliert (ANN-137).
- **Material zum Mitnehmen** (Akte → Stammdaten → Material): von Hand an der Person gepflegt, nie aus Befunden abgeleitet; die Übersicht zeigt „Heute mitnehmen“ zusammengezählt und ohne Namen (ANN-138).
- **„Termin n von m“** an jedem Behandlungstermin; **Rechnung an** und **Offene Rechnungen** nur für owner und office (ANN-139).
- **Termin abhaken:** Am dokumentierten Termin bestätigt die behandelnde Person die Heilmittel, vorbelegt aus der Verordnung — nur am eigenen Termin; Zurücknehmen und Ausfallhonorar bleiben beim Büro; eine Rechnung entsteht nie (ANN-140, löst ANN-071 in dieser Frage ab).
- **BEF-055 Teil 1:** „Finalisieren“ am offenen Termin sagt, dass der Termin dabei als durchgeführt gilt.

Pull Request offen, **Zweitreview gelaufen** (kein blockierender Befund, vier weitere eingearbeitet), wartet auf deinen Merge. Fortschritt **40,8 %**.

## Danach — Bauen

1. **PRX-EPIC-003** (Nichts fällt durch), Block 2. `/weiter`
2. **STA-EPIC-001** (Statistiken)
3. **TRN-EPIC-001** (Block 3, Trainingsbereich)

## Prüfverfahren

**Stand PRX-EPIC-002 (2026-09-28, in der Cloud gelaufen):** `test` **3683** grün, `test:db` **2220** grün (neu: `appointment-brief`, `take-along`, `appointment-billing-context`, `record-at-appointment`), `test:e2e` für `termin.spec.ts` und `uebersicht.spec.ts` 24 grün (Prüfseite `tests/e2e/fixtures/termin.html`, 375 und 1280 px); `format:check`, `lint`, `typecheck`, `docs:check` und `build` grün.

**Die CI läuft.** Lokal: `pnpm test:db` gegen einen Wegwerf-Container (54329); **angemeldete E2E-Tests und die Deno-Laufzeit laufen in der Cloud nicht**. Stand heute (DOK-006, in der Cloud gelaufen): `test` **2692** (lokal unter Node 24 und Windows scheitern weiter Router-, Navigations- und Pfadtests mit derselben „AbortSignal"-Ursache; maßgeblich ist die CI mit Node 22); `test:db` **2104**, davon 46 in `patient-photos.test.ts`; `test:e2e` ohne Anmeldung: **115 grün**, einer übersprungen, darunter `fotos.spec.ts` mit der künstlichen Kamera von Chromium. In der Cloud braucht `login.spec.ts` die Platzhalter aus der CI (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), sonst zeigt die App den Konfigurationsfehler. Sichtprüfung der Tourenkomponenten, der Instrumente, des Befunds und des Kalenders über die Prüfseiten `tests/e2e/fixtures/karte.html`, `instrumente.html`, `befund.html`, `kalender.html`, `organisation.html`, `uebersicht.html` (Tagesstart, Liege in der Akte), `bausteine.html` (Befund aus Bausteinen), `bericht.html` (Therapiebericht, Formular und Blatt) und `fotos.html` (Kamera, Fotoliste, Vergleich, Metadaten) bei 1280 und 375 px; die Seiten hinter der Anmeldung nur über Komponententests.

## Blocker (Jannes-seitig)

- **Am Termin sichten** (PRX-EPIC-002): Schritte 4 bis 6 in [Praxisverwaltung](sichtung/praxisverwaltung.md). Zu bestätigen: **ANN-137** (Kurzblick zeigt auch einen Entwurf; jedes Aufklappen protokolliert), **ANN-138** (Material an der Person, am Tag ohne Namen), **ANN-139** (Behandelnde sehen keine offenen Rechnungen) und **ANN-140** (nur am eigenen Termin; Zurücknehmen und Ausfallhonorar beim Büro).

- **Warteliste und Terminsuche sichten** (PRX-EPIC-001): drei Schritte in [Praxisverwaltung](sichtung/praxisverwaltung.md). Zu bestätigen: **ANN-132** (drei Gründe statt einer Stufe), **ANN-133** (zwölf Monate nach dem Schließen), **ANN-134** (Lesen der Liste ohne Protokoll), **ANN-135** (genaue Postleitzahl, Grenze 12 Uhr, Warnung statt Sperre), **ANN-136** (dicht gepackte Vorschläge, knapper Fahrweg nur gekennzeichnet).

- **UX-Review entscheiden:** BEF-046 bis BEF-070, je Eintrag Frage, Optionen und Empfehlung. Zuerst BEF-046 (ein gescheitertes Nachladen des Profils ersetzt die App, Eingaben gehen verloren) und BEF-047 (Sitzungsende und Anmeldemaske).
- **Tagesstart am Handy sichten** (UX-EPIC-003): Schritte 10 und 12 in [Kernprozess](sichtung/kernprozess.md). Zu bestätigen: **ANN-116** (Liege als organisatorische Angabe, sichtbar auch für Office) und **ANN-117** (Zählung „ab n. Besuch“ über die Behandlungen des Tages; Plan des Teams für Behandelnde zugeklappt).
- **G6c lokal prüfen** (ANN-115, auch nach dem Merge noch offen): `pnpm dlx supabase@2.116.0 start`, als Anna (therapist) angemeldet in der Browserkonsole einen Schreibpfad aufrufen, etwa `await supabase.rpc('place_legal_hold', { p_patient_id: '66666666-6666-4666-8666-000000000001', p_reason: 'Probe' })` — erwartet `status: 403`, danach als owner unter **Organisatorisches → Sicherheit** ein Eintrag „Legal Hold gesetzt" mit Ausgang abgewiesen. Zeigt die Antwort 403, aber fehlt der Eintrag, steht der Weg in ANN-115.
- **Sichtung** (E-6), ab jetzt am Handy auf der Test-Umgebung (freie Sichtung Kalender 2026-09-26: BEF-035 bis BEF-040, zweite Runde BEF-041 bis BEF-044, Stoff für UX-EPIC-002/003): Der Rückstand steht in vier Dateien zu höchstens 15 Schritten — [Kernprozess](sichtung/kernprozess.md), [Leistungsbereiche](sichtung/leistungsbereiche.md), [Kartendienst](sichtung/kartendienst.md) (Teil am Telefon: Wegpunktlimit, `MAX_ZWISCHENZIELE` bleibt bei drei), [Betriebsreife](sichtung/betriebsreife.md). Start mit `/sichtung`; Bedienung in [`DEVELOPMENT.md`](DEVELOPMENT.md), „Test-Umgebung".
- **Kalender und Begriffe am Handy sichten** (UX-EPIC-002): Schritte 1, 2, 5 und 7 bis 10 in [Kernprozess](sichtung/kernprozess.md) — Lupe, Kopf über dem Raster, zweiter Tipp, zwei Finger, „Jetzt", Installation in Chrome mit grünem Symbol, Dauertermin ohne Vorauswahl, Kalender randlos und „Tour", „Fehlzeit" statt „Ereignis", Organisatorisches mit eingeklappter Vorschau. Zu bestätigen: **ANN-108**, **ANN-109**, **ANN-110** (`minimal-ui` oder volle Höhe mit `standalone`?), **ANN-111** (passt „Fehlzeit" auch für ein Teammeeting?), **ANN-112** (Vorschauen eingeklappt oder ganz aus dem Menü), **ANN-113** (Tour mit zwei Tipps unter „Ansicht und Filter" oder einem im Kopf?) und **ANN-114** (weitere Seiten randlos?).
- **Anamnese und Bausteine sichten** (FRB-EPIC-002/003): Schritte 3 bis 7 in [Befund](sichtung/befund.md); **ANN-104** ist bestätigt (2026-09-26). Zu bestätigen: **ANN-118** (Übertragung der Vorlage, drei Lücken offen, Seitenregel), **ANN-119** (Tippfehler bleiben stehen, auch im Text der Akte), **ANN-120** (nur der Text wird gespeichert; ein nicht übernommener Vorschlag hält Speichern und Abschluss an und geht nur beim Verlassen der Seite in den Entwurf mit), **ANN-129** (Seite einmal je Region) und **ANN-130** (Zeichen ✅/❗ und Gliederung des Texts).
- **Therapiebericht sichten** (DOK-005): Schritte 8 und 9 in [Befund](sichtung/befund.md). Zu bestätigen: **ANN-121** (Bericht gespeichert und beim Abschluss eingefroren), **ANN-122** (Auswahl nur durch dich, wörtlich, bis 50 Einträge), **ANN-123** (Briefkopf aus den Praxis-Stammdaten ohne Steuer- und Bankangaben) und — vor dem ersten echten Bericht mit der Datenschutzberatung — **ANN-124** (auf welcher Grundlage ein Bericht an die Ärzt:in gehen darf).
- **Fotos sichten** (DOK-006): Schritte 10 bis 12 in [Befund](sichtung/befund.md) — **nur einen Gegenstand fotografieren, nie eine Person**; Fotos echter Personen erst nach B2 und DSFA (ADR-017 Punkt 41). Zu bestätigen: **ANN-125** (was nach dem Entfernen der Metadaten bleibt), **ANN-126** (zwölf Monate, drei Monate nach Abschluss), **ANN-127** (Ablehnung als eigener Vermerk; Wortlaut der Fotoeinwilligung und ein Satz in der Datenschutzinformation kommen mit B2) und **ANN-128** (Herausgabe als Einzeldatei durch owner); dazu am echten Gerät: Ist ein fotografiertes Musterrezept lesbar?
- **Bögen für NRS, PSFS und Veränderungsfrage** (ANN-099): die Vorlagen als PDF nach `quellen/scores/pdf/` — dann werden die drei auf 1.0.0 aktiviert und erscheinen im Befund und im Verlauf; zugleich startet **FRB-EPIC-004** (Skalen in der Verlaufsdoku). **Bilder zu den Tests** starten FRB-EPIC-005.
- **Logfrist für Betriebslogs (R14 alt, jetzt R9):** (a) ADR-011 Punkt 4 senken oder (b) Ausleitungsweg. Empfehlung: nach G3. Gebraucht vor echten Daten.
- **BEF-026 / B13 (wieder offen):** Die Plattform braucht Mails an Patient:innen; Empfehlung: eigener SMTP-Anbieter, geprüft in Block 11. STAFF-004 ruht bis dahin.
- **D2/D3 aus dem FRB-Plan** gelten wie vorgeschlagen (ANN-118, ANN-119); die drei Lücken (Schulter „Untersuchung ACG", LWS „Behandlung", HWS „Therapie Hochzervikal") und Korrekturen jederzeit nachliefern.
- **Preise** für Abo und Pakete vor Block 5 (bis dahin synthetisch); **G13** (Umsatzsteuer-Status, Befreiungshinweis, Kürzel `RG`/`TR`) vor M3.
- **B8:** schriftlicher Lizenzbeleg bis M3.
- **Sieben alte Branches löschen** (freigegeben, aber aus der Cloud-Session gesperrt): `git push origin --delete claude/befunde-kalender-2026-09-18 claude/issue-42-status-fv319v claude/konsolidierung-r2 claude/nice-goldberg-kcnct0 claude/r3-analyse claude/r3-code-review-hardening-c22b8f claude/hopeful-mendel-ib440i` — ihr Inhalt steht auf `main`.
- **Ab Anfang 2027 parallel zum Bauen (E-1, 2026-09-23):** OPS-001-Unterlagen, Anfragen B1, B2, B4, Anbieterprüfungen.
- **Lokal:** `git pull`, **Node 22** (`.nvmrc`) — auf deinem Rechner läuft Node 24; darunter werfen die Router-Tests in jsdom „AbortSignal"-Fehler, die in der CI mit Node 22 nicht auftreten. **Zwei Sessions, ein Verzeichnis:** Am 2026-09-26 schrieb die ADR-017-Session in `PraxisSoftware` statt in `PraxisSoftware-b`; DOK-005 ist deshalb in den Worktree `PraxisSoftware-dok005` umgezogen. Nach dem Merge: `git worktree remove ../PraxisSoftware-dok005`. **Docker Desktop** startete seine Engine nicht (WSL-Distribution `docker-desktop` gestoppt) — ohne sie kein lokales `test:db`.

## Letzte Session

**PRX-EPIC-002 (PRX-005 bis PRX-009).** Vier Migrationen und eine für den Zweitreview: `get_appointment_brief` (Kurzblick mit Protokoll), `take_along_items` an `patient_care_details` mit `set_take_along_items` (Kartei, Auskunft, Tagesliste nachgezogen), `get_appointment_billing_context` mit den gemeinsamen Regeln `app.appointment_basis_position` (die Deckung fragt sie jetzt) und `app.open_invoices` (die offenen Posten lesen daraus), `app.can_record_services_for_appointment` für Vorschlag, Erfassen und `get_appointment_services`. Keine neue Tabelle, keine neue Abhängigkeit, kein neuer Anbieter. Prüfseite `tests/e2e/fixtures/termin.html` mit drei Ansichten.

**Lokale Schritte:** nach dem Merge `git pull origin main` und `pnpm dlx supabase@2.116.0 db reset` (neue Migrationen); kein `pnpm install`.
