# Status · Stand 2026-09-28 · letzte Session: PRX-EPIC-001 (Warteliste, Terminsuche, Gebietstage)

Livestand, sonst nichts. Die **Reihenfolge** legt [`development/ROADMAP.md`](development/ROADMAP.md)
fest (Kette in 15 Blöcken), Befunde sammelt [`development/BEFUNDE.md`](development/BEFUNDE.md),
Ideen gehören nach [`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md).

## Jetzt

**PRX-EPIC-001 gebaut (Branch `claude/tender-carson-vhe941`):** Ein freier Platz findet eine Patientin.

- **Warteliste** (Kalender → Ansicht und Filter, Funktionssuche, Akte → Termine): Wunschzeiten, Dauer, Terminart, Wunsch-Therapeut:in, Grundlage und ein **organisatorischer** Grund — Wunsch der Person, Verordnung endet, Vorgabe der Praxis — mit „bis spätestens“ (ANN-132); Anrufen per Tipp. Geschlossene Einträge fallen nach zwölf Monaten (ANN-133).
- **Gebietstage** (Organisatorisches → Gebietstage): Postleitzahlen je Gebiet mit Tagen und Tageshälften. Beim Hausbesuch warnen Anlegen, Bearbeiten und Serie „außerhalb des Gebietstags“, sperren aber nicht (ANN-135).
- **Freie Termine suchen** (am Eintrag, an der Verordnung, in der Akte): Vorschläge aus Arbeitszeit und Belegung von Therapeut:in **und** Patient:in, Gebietstag vorn, Fahrweg der ersten zehn live geprüft und nur gekennzeichnet (ANN-136). „Übernehmen“ öffnet das Terminformular — reserviert wird nichts.
- **Nachrücken:** Nach einer Absage und an einer freien Stelle im Kalender steht „Passt von der Warteliste“; Termin und Schließen des Eintrags in einer Transaktion. Versendet wird nichts (B15).

Pull Request offen, **Zweitreview gelaufen** (ein blockierender Befund — Trainingstermin als Nachbar in der Suche — und drei weitere eingearbeitet), wartet auf deinen Merge. Fortschritt **40,1 %**.

## Danach — Bauen

1. **PRX-EPIC-002** (Am Termin steht, was man vor der Tür wissen muss), Block 2. `/weiter`
2. **PRX-EPIC-003** (Nichts fällt durch)
3. **STA-EPIC-001** (Statistiken)

## Prüfverfahren

**Stand PRX-EPIC-001 (2026-09-28, in der Cloud gelaufen):** `test` **3652** grün, `test:db` **2167** grün (neu: `waitlist`, `territories`, `slot-search`, `waitlist-matches`), `test:e2e` für `warteliste.spec.ts` 16 grün (Prüfseite `tests/e2e/fixtures/warteliste.html`, 1280 und 375 px); `format:check`, `lint`, `typecheck`, `docs:check` und `build` grün.

**Die CI läuft.** Lokal: `pnpm test:db` gegen einen Wegwerf-Container (54329); **angemeldete E2E-Tests und die Deno-Laufzeit laufen in der Cloud nicht**. Stand heute (DOK-006, in der Cloud gelaufen): `test` **2692** (lokal unter Node 24 und Windows scheitern weiter Router-, Navigations- und Pfadtests mit derselben „AbortSignal"-Ursache; maßgeblich ist die CI mit Node 22); `test:db` **2104**, davon 46 in `patient-photos.test.ts`; `test:e2e` ohne Anmeldung: **115 grün**, einer übersprungen, darunter `fotos.spec.ts` mit der künstlichen Kamera von Chromium. In der Cloud braucht `login.spec.ts` die Platzhalter aus der CI (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), sonst zeigt die App den Konfigurationsfehler. Sichtprüfung der Tourenkomponenten, der Instrumente, des Befunds und des Kalenders über die Prüfseiten `tests/e2e/fixtures/karte.html`, `instrumente.html`, `befund.html`, `kalender.html`, `organisation.html`, `uebersicht.html` (Tagesstart, Liege in der Akte), `bausteine.html` (Befund aus Bausteinen), `bericht.html` (Therapiebericht, Formular und Blatt) und `fotos.html` (Kamera, Fotoliste, Vergleich, Metadaten) bei 1280 und 375 px; die Seiten hinter der Anmeldung nur über Komponententests.

## Blocker (Jannes-seitig)

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

**PRX-EPIC-001 (PRX-001 bis PRX-004).** Vier Migrationen und eine für den Zweitreview: `waitlist_entries` mit eigener Datenklasse `warteliste`, `territories` und `territory_postal_codes` (Betriebsdaten), die Suche `find_free_slots` und `rate_slot_travel` ohne Tabelle, das Nachrücken `list_waitlist_matches` und `create_appointment_from_waitlist`. Auskunft nach Art. 15, Löschlauf und Wiederanwendung nach Restore sind nachgezogen. Keine neue Abhängigkeit, kein neuer Anbieter; die Fahrzeit nutzt die vorhandene Matrix beim eigenen Kartendienst (Gate unverändert). Prüfseite `tests/e2e/fixtures/warteliste.html` mit fünf Ansichten.

**Lokale Schritte:** nach dem Merge `git pull origin main` und `pnpm dlx supabase@2.116.0 db reset` (neue Migrationen); kein `pnpm install`.
