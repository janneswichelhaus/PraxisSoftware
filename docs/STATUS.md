# Status · Stand 2026-09-26 · letzte Session: FRB-EPIC-003 (Befund aus Bausteinen)

Livestand, sonst nichts. Die **Reihenfolge** legt [`development/ROADMAP.md`](development/ROADMAP.md)
fest (Kette in 15 Blöcken), Befunde sammelt [`development/BEFUNDE.md`](development/BEFUNDE.md),
Ideen gehören nach [`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md).

## Jetzt

**FRB-EPIC-003 gebaut:** In **Behandlung abschließen** und **Dokumentation bearbeiten** steht unter dem Textfeld zugeklappt **„Befund aus Bausteinen"** — Region wählen, Block aufklappen, Ergebnis antippen (zweiter Tipp hebt auf), Seite, Messwert und Notiz; darunter der fertige Text als Vorschlag, ein Tipp übernimmt ihn in den Eintrag. Die neun Regionen stehen wörtlich aus deiner MT-Vorlage, drei Lücken sind als „Vorlage unvollständig" markiert. Die Behandlungsliege steht jetzt auch oben im **Befund** der Akte. Bilder und Skalen sind als FRB-EPIC-005 und FRB-EPIC-004 ausgegliedert (deine Wahl). Pull Request offen, wartet auf deinen Merge. Fortschritt **38,7 %**.

## Danach — Bauen

1. Block 2 weiter mit **DOK-005** Therapiebericht an die Verordner:in. `/weiter`
2. **DOK-006** Fotos in der Akte (zuerst neue Fassung von ADR-017).
3. **PRX-EPIC-001** in der Reihenfolge der Roadmap, Block 2.

## Prüfverfahren

**Die CI läuft.** Lokal: `pnpm test:db` gegen einen Wegwerf-Container (54329); **angemeldete E2E-Tests und die Deno-Laufzeit laufen in der Cloud nicht**. Stand heute: `test` **2565**; `test:db` **2035** (UX-EPIC-003); `test:e2e` ohne Anmeldung: 89 grün, einer übersprungen (Zwei-Finger-Zoom nur im Handyprofil). In der Cloud braucht `login.spec.ts` die Platzhalter aus der CI (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), sonst zeigt die App den Konfigurationsfehler. Sichtprüfung der Tourenkomponenten, der Instrumente, des Befunds und des Kalenders über die Prüfseiten `tests/e2e/fixtures/karte.html`, `instrumente.html`, `befund.html`, `kalender.html`, `organisation.html` und `uebersicht.html` (Tagesstart, Liege in der Akte) bei 1280 und 375 px; die Seiten hinter der Anmeldung nur über Komponententests.

## Blocker (Jannes-seitig)

- **Tagesstart am Handy sichten** (UX-EPIC-003): Schritte 10 und 12 in [Kernprozess](sichtung/kernprozess.md). Zu bestätigen: **ANN-116** (Liege als organisatorische Angabe, sichtbar auch für Office) und **ANN-117** (Zählung „ab n. Besuch“ über die Behandlungen des Tages; Plan des Teams für Behandelnde zugeklappt).
- **G6c lokal prüfen** (ANN-115, auch nach dem Merge noch offen): `pnpm dlx supabase@2.116.0 start`, als Anna (therapist) angemeldet in der Browserkonsole einen Schreibpfad aufrufen, etwa `await supabase.rpc('place_legal_hold', { p_patient_id: '66666666-6666-4666-8666-000000000001', p_reason: 'Probe' })` — erwartet `status: 403`, danach als owner unter **Organisatorisches → Sicherheit** ein Eintrag „Legal Hold gesetzt" mit Ausgang abgewiesen. Zeigt die Antwort 403, aber fehlt der Eintrag, steht der Weg in ANN-115.
- **Sichtung** (E-6), ab jetzt am Handy auf der Test-Umgebung (freie Sichtung Kalender 2026-09-26: BEF-035 bis BEF-040, zweite Runde BEF-041 bis BEF-044, Stoff für UX-EPIC-002/003): Der Rückstand steht in vier Dateien zu höchstens 15 Schritten — [Kernprozess](sichtung/kernprozess.md), [Leistungsbereiche](sichtung/leistungsbereiche.md), [Kartendienst](sichtung/kartendienst.md) (Teil am Telefon: Wegpunktlimit, `MAX_ZWISCHENZIELE` bleibt bei drei), [Betriebsreife](sichtung/betriebsreife.md). Start mit `/sichtung`; Bedienung in [`DEVELOPMENT.md`](DEVELOPMENT.md), „Test-Umgebung".
- **Kalender und Begriffe am Handy sichten** (UX-EPIC-002): Schritte 1, 2, 5 und 7 bis 10 in [Kernprozess](sichtung/kernprozess.md) — Lupe, Kopf über dem Raster, zweiter Tipp, zwei Finger, „Jetzt", Installation in Chrome mit grünem Symbol, Dauertermin ohne Vorauswahl, Kalender randlos und „Tour", „Fehlzeit" statt „Ereignis", Organisatorisches mit eingeklappter Vorschau. Zu bestätigen: **ANN-108**, **ANN-109**, **ANN-110** (`minimal-ui` oder volle Höhe mit `standalone`?), **ANN-111** (passt „Fehlzeit" auch für ein Teammeeting?), **ANN-112** (Vorschauen eingeklappt oder ganz aus dem Menü), **ANN-113** (Tour mit zwei Tipps unter „Ansicht und Filter" oder einem im Kopf?) und **ANN-114** (weitere Seiten randlos?).
- **Anamnese und Bausteine sichten** (FRB-EPIC-002/003): Schritte 3 bis 7 in [Befund](sichtung/befund.md); **ANN-104** ist bestätigt (2026-09-26). Zu bestätigen: **ANN-118** (Übertragung der Vorlage, drei Lücken offen, Seitenregel), **ANN-119** (Tippfehler bleiben stehen, auch im Text der Akte) und **ANN-120** (nur der Text wird gespeichert; ein nicht übernommener Vorschlag hält Speichern und Abschluss an und geht nur beim Verlassen der Seite in den Entwurf mit).
- **Bögen für NRS, PSFS und Veränderungsfrage** (ANN-099): die Vorlagen als PDF nach `quellen/scores/pdf/` — dann werden die drei auf 1.0.0 aktiviert und erscheinen im Befund und im Verlauf; zugleich startet **FRB-EPIC-004** (Skalen in der Verlaufsdoku). **Bilder zu den Tests** starten FRB-EPIC-005.
- **Logfrist für Betriebslogs (R14 alt, jetzt R9):** (a) ADR-011 Punkt 4 senken oder (b) Ausleitungsweg. Empfehlung: nach G3. Gebraucht vor echten Daten.
- **BEF-026 / B13 (wieder offen):** Die Plattform braucht Mails an Patient:innen; Empfehlung: eigener SMTP-Anbieter, geprüft in Block 11. STAFF-004 ruht bis dahin.
- **D2/D3 aus dem FRB-Plan** gelten wie vorgeschlagen (ANN-118, ANN-119); die drei Lücken (Schulter „Untersuchung ACG", LWS „Behandlung", HWS „Therapie Hochzervikal") und Korrekturen jederzeit nachliefern.
- **Preise** für Abo und Pakete vor Block 5 (bis dahin synthetisch); **G13** (Umsatzsteuer-Status, Befreiungshinweis, Kürzel `RG`/`TR`) vor M3.
- **B8:** schriftlicher Lizenzbeleg bis M3.
- **Sieben alte Branches löschen** (freigegeben, aber aus der Cloud-Session gesperrt): `git push origin --delete claude/befunde-kalender-2026-09-18 claude/issue-42-status-fv319v claude/konsolidierung-r2 claude/nice-goldberg-kcnct0 claude/r3-analyse claude/r3-code-review-hardening-c22b8f claude/hopeful-mendel-ib440i` — ihr Inhalt steht auf `main`.
- **Ab Anfang 2027 parallel zum Bauen (E-1, 2026-09-23):** OPS-001-Unterlagen, Anfragen B1, B2, B4, Anbieterprüfungen.
- **Lokal:** `git pull`, **Node 22** (`.nvmrc`) — auf deinem Rechner läuft Node 24; darunter werfen die Router-Tests in jsdom „AbortSignal"-Fehler, die in der CI mit Node 22 nicht auftreten. Dein lokales `main` stand bis heute bei #106; `/weiter` fehlte deshalb.

## Letzte Session

**FRB-EPIC-003 (FRB-003a bis c).** Neun Regionsdateien unter `src/features/assessments/definitionen/bausteine/` mit Zähl- und Wortlauttest (`bausteine.test.ts`); `blockSchema` lässt „unvollständig" jetzt auch an einem Block mit Items zu (ANN-118). Generator `dokumentationstext.ts`, Zustand `bausteinauswahl.ts`, Oberfläche `BausteinFeld.tsx`, eingebunden in `CompleteTreatmentPage` und `TreatmentNotePage` (ANN-120); Liege im Befund über den vorhandenen Schreibpfad. Neue Prüfseite `tests/e2e/fixtures/bausteine.html` mit `bausteine.spec.ts`. Keine Migration, keine neue Abhängigkeit, kein neuer RPC. **Lokale Schritte:** `git pull origin claude/frb-epic-003` (nach dem Merge `main`); kein `db reset` nötig.
