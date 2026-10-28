# Befunde an der laufenden Anwendung
Stand 2026-10-28. **Befunde aus Sichtungen, Screenrecordings und Reviews an der laufenden
Anwendung**: Beobachtungen an Gebautem, keine Ideen (die gehören nach `docs/product/`). Die Liste
ist die **Eingabe für die erste Story des nächsten Loops derselben Spur** (Roadmap-Regel R6), seit
2026-10-12 der nächsten Überholung des Bereichs (`/bereich`), sonst gebündelt in einem Auftrag. Sie
hat **keinen Rang**, ist **kein Auftrag** und führt **keine zweite Reihenfolge** (die steht in
`ROADMAP.md`); verbindlich wird ein Befund erst im SPEC-Schritt des Loops, der ihn aufnimmt.

**Form.** `### <Bereich> — <Beobachtung>`, darunter Datum · Bereich · Quelle · Status (`offen`,
`eingeplant in <Loop>`, `erledigt in <Loop>`) · Berührt, dann **Beobachtung.** und **Erwartet.**
(Teilerledigtes: **Rest.**), höchstens zehn Zeilen. Seit 2026-10-25 keine neuen `BEF-NNN`;
bestehende bleiben bis zur Behebung, `pnpm docs:check` lässt nur die offenen zu (Regel D). Behobene
löscht ihr Loop; Wortlaut bis 2026-10-27: `git show 9452575:docs/development/BEFUNDE.md`, Erledigte:
`git show eb43569:docs/development/archiv/`. Messwerte, auch für die Tipp-Budgets in
[`../product/kernablaeufe.md`](../product/kernablaeufe.md), stammen von Jannes, aus dem Code oder
per Playwright auf Seed-Daten, nie aus Telemetrie und nie an Mitarbeitenden (§20).

### BEF-010 — Ein gemeinsames Schema über zwei Lesepfade fällt keinem lokalen Gate auf
2026-09-17 · Doku an Termin und Akte · E2E-Lauf CAL-018 (CAL-018d behoben) · offen als Muster\
**Beobachtung.** Ein Eintragsschema (`treatmentNoteSchema`) liegt unter zwei Serverfunktionen;
CAL-018 zog ein Pflichtfeld nur in einer nach, der Verlauf blieb leer, sieben Gates grün. Wieder da:
`get_treatment_note` liefert `reported_written_at`, `list_patient_treatment_notes` nicht, nur
`.optional()` fängt es ab. **Erwartet.** Eine Prüfung, die je Schema alle bedienenden Funktionen
kennt (Test der Rückgabeschlüssel oder ein Schema je Funktion), im Loop des nächsten geteilten
Felds.

### BEF-034 — Die Abweisung von `list_assignable_therapists` steht in keinem Protokoll
2026-09-23 · Team (`/praxis/team`) · Bestandsaufnahme G6b · Oberfläche erledigt in UX-002h; offen:
Ausgang des Pfads · `audit.test.ts`\
**Rest.** Die Teamseiten fragen nur noch mit `canManageAppointments`; die Funktion weist andere
Rollen ohne `record_denied_read` ab, `audit.test.ts` hält die Ausnahme fest. Offen: den Ausgang der
übrigen Lesepfade (ADR-010, Label `freigabe-audit`) oder die Ausnahme bewusst schließen.

### BEF-082 — Sechzehn Lesepfade verlieren ihren Abweisungseintrag hinter PostgREST
2026-09-30 · Lesepfade mit Abweisungseintrag (ADR-010) · Zweitreview TRN-EPIC-001 · offen\
**Beobachtung.** Die `STABLE`-Funktionen der Liste in `audit.test.ts` (heute 15, etwa
`find_free_slots`) schreiben abgewiesen über `app.record_denied_read`; PostgREST ruft sie lesend,
das INSERT scheitert mit 25006: Fehler statt leerer Antwort, kein Eintrag. `pnpm test:db` sieht es
nicht. **Erwartet.** Migration `alter function … volatile`, dann die Liste leeren; lokal als
therapist: abgewiesen 200 mit leerer Antwort und Eintrag.

### BEF-127 — Die Koordinaten-Constraints lassen eine Breite ohne Länge durch
2026-10-05 · Datenmodell, Kartendienst · Zweitreview UBK-EPIC-002 · offen (eigenes Ticket)\
**Beobachtung.** Die `*_coordinate_check` an Kontakt, Hausbesuch und Standort prüfen `lat`, `lon`,
`geocode_precision` ohne `is not null`; ein CHECK mit NULL gilt als erfüllt. Heute setzen nur
Funktionen beides, der Fehler kommt mit einem neuen Schreibweg. **Erwartet.** Migration in der
dichten Form von `locations_garage_coordinate_check`, vorher Bestand prüfen; je Tabelle ein Test wie
`garage.test.ts`. Klein, Pfad A.

### BEF-140 — „Andere Ziel-App prüfen“ unter der Tourliste fällt weg
2026-10-10 · Tour · Jannes, Löschkandidaten im Leitfaden · Teile 1 und 2 erledigt am 2026-10-11;
offen: Teil 3 · `Tourenliste.tsx`\
**Rest.** „Andere Ziel-App prüfen (für die Gerätebewertung)“ fällt weg, sobald die Gerätebewertung
abgeschlossen ist (Punkt S-3 der Sichtliste in `docs/sichtung/README.md`).

### BEF-142 — Der Einwilligungstext der Plattform verspricht beim Widerruf „alle Fotos“
2026-10-10 · Plattform, Einwilligungen · UX-008a · offen · `einwilligungstexte.ts`; ADR-017 Punkt 46\
**Beobachtung.** „Die Praxis löscht dann sofort alle Fotos, die sie von Ihnen hat.“ stimmt nicht:
Der Widerruf löscht Arbeitshilfen, Dokumentationsfotos bleiben in der Akte (Praxis berichtigt).
**Frage an Jannes.** „… alle Fotos, die als Arbeitshilfe entstanden sind; Fotos der
Behandlungsdokumentation bleiben in der Akte“? Das braucht eine neue Fassung des Textes.

### BEF-166 — Ein Rad kennt keine Löschsperre
2026-10-15 · Radflotte, Löschlauf · FLT-EPIC-001 · offen; Bedingung vor dem Scharfschalten · ANN-551\
**Beobachtung.** Check-Ups, Pannen und Sperren fallen nach drei Jahren; eine Löschsperre gibt es nur
an der Akte (ANN-033). Ist ein Unfall länger streitig, fiele der Nachweis der Pflege. **Erwartet.**
Löschsperre je Rad mit Grund, gesetzt von `owner`, beachtet von `app.delete_due_fleet_records`; die
Werkstatt-Unterlage ersetzt sie nicht. Pfad A (ADR-008).

### BEF-167 — Fotos am Rad: Ein verlorenes Objekt fällt erst beim Öffnen auf
2026-10-15 · Radflotte · FLT-EPIC-001, Review · offen · `fleet/Fotoreihe.tsx`; ADR-017; ANN-552\
**Beobachtung.** Dateien der Akte tragen nach dem Abgleich `object_missing` und sagen es; Fotos am
Rad kennen das Kennzeichen nicht und melden den Verlust erst beim Öffnen. **Erwartet.** Derselbe
Abgleich und dasselbe Kennzeichen; die Fotoreihe sagt, dass das Foto fehlt. Pfad A.

### BEF-177 — Urheber und Zeitpunkt des Wochenplans stehen jeder Praxisrolle offen
2026-10-17 · Arbeitszeit · Zweitreview AZ-001 · offen (Vorschlag) · `staff_working_hours`\
**Beobachtung.** Mit dem Tabellenrecht liest jede Praxisrolle auch `created_by` und `created_at`,
seit den Fassungen (ANN-589) also, wer eine dauerhafte Änderung wann eintrug; Abweichungen haben ein
Spaltenrecht (ANN-580). **Erwartet.** Nur `id`, `organization_id`, `staff_member_id`, `weekday`,
`starts_at`, `ends_at`, `valid_from`, `valid_until`; Pfad A, Migration mit Negativtest.

### BEF-184 — Einwilligung „Ernährungsberatung“: das unterschriebene Blatt bleibt außerhalb der Anwendung
2026-10-18 · Ernährung · Praxis-Review ERN-EPIC-001 · offen: Vorschlag (ADR-017) ·
`ProfilFormular.tsx`\
**Beobachtung.** Das Anlegen verlangt die Einwilligung „auf Papier unterschrieben“; ein Foto des
Blatts lässt sich nicht ablegen wie beim Anmeldebogen, der Nachweis (Art. 7 Abs. 1) liegt im Ordner.
**Erwartet.** „Unterschriebenes Blatt fotografieren“ am Kästchen, abgelegt an Akte bzw. Verhältnis
mit der Frist der Ernährungsberatung.

### BEF-194 — Ein Lookbehind im Fragebogen lässt ältere Safari das Modul nicht laden
2026-10-24 · Fragebogen, Erhebungen · Review 1c (#295) · offen (Vorschlag) · `darstellung.ts`, Z. 27\
**Beobachtung.** Ein Lookbehind ist in Safari vor iOS 16.4 ein Syntaxfehler, das Modul lädt nicht;
in `begriffe.ts`, `Dialogfenster.tsx` und `Einstieg.tsx` ist das schon behoben. **Erwartet.**
Trennen ohne Lookbehind (erst an Leerraum, dann je Teil nach `-`) und ein Test, der Lookbehinds im
ausgelieferten Code unter `src/` findet.

### BEF-195 — Der Bereichsschalter der Plattform bricht bei „Sehr groß“ mitten im Namen
2026-10-24 · Plattform, Gerüst · Design-Review 1e · offen (Vorschlag) · `Kopf` in `Navigation.tsx`\
**Beobachtung.** Bei 375 px und „Sehr groß“ bricht „Für Maximilian Mustermann-Langenscheidt“ als
„Musterman|n-“: `overflow-wrap: anywhere`, das Ziel ist halb so breit. **Erwartet.** Nur am
Bindestrich brechen wie im Gruß (DR-114): zwei Reihen statt zwei Spalten oder der Name in eigener
Zeile.

### BEF-201 — Plattform: „Löschen“ an einem Anhang löscht ohne Rückfrage
2026-10-22 · Plattform, Rückfragen · Design-Review 1a (#290) · offen (Vorschlag) · `Anhaenge.tsx`,
Vorbild `RueckfrageAnhaenge.tsx`\
**Beobachtung.** „Löschen“ steht gleichrangig neben „Ansehen“ und löscht sofort; DESIGN.md verlangt
Zerstörendes leise am Ende mit `Rueckfrage`. **Erwartet.** So umbauen, Wortlaut nach PLATTFORM.md,
Löschpfad unverändert; Komponententest für Abbrechen und Bestätigen, `nachrichten.spec.ts` grün.

### BEF-202 — E2E hinter der Anmeldung: Eine Wiederholung in der CI kann Termine des ersten Versuchs treffen
2026-10-22 · `tests/e2e/authenticated/` · CI-Lauf 39842106004 · offen (Vorschlag) · `tagImFenster`\
**Beobachtung.** Eine wiederholte serielle Gruppe läuft mit neuem `LAUF = Date.now()` (24
Spezifikationen) und kann den Tag des ersten Versuchs treffen; der Überschneidungsschutz weist zu
Recht ab (#291 nur für eine Datei). **Erwartet.** Ein `LAUF` je Testlauf für alle Worker (`E2E_LAUF`
neben `retries` in `playwright.config.ts`), ein Tagesversatz je Wiederholung (`test.info().retry` ×
N); Streuung und Reserve bleiben.

### BEF-212 — Lokale Ansicht: Gerätelesungen halten an, wenn das Netz während der Ansicht wegfällt
2026-10-24 · Plattform ohne Netz · DRP-EPIC-008 (BEF-211) · offen (Vorschlag) · `LokaleUebungen.tsx`\
**Beobachtung.** `abgelegteZugaenge` und `wartendeEinheiten` lesen nur das Gerät, laufen aber mit
`networkMode: 'online'`: Fällt das Netz weg, hält eine neue Abfrage an (Kaltstart nicht).
**Erwartet.** `networkMode: 'always'` wie in der Durchführung; Browsertest mit `setOffline`.

### BEF-217 — Übungen: Bühne und Marken brechen bei 188 px und „Sehr groß“ zugleich mitten im Wort
2026-10-24 · Plattform, Übungen · Selbstsichtung DRP-EPIC-009 · offen (Vorschlag) · `Buehne.tsx`,
`Dosierungsmarken.tsx`\
**Beobachtung.** Einzeln bricht kein Wort ohne Strich; beides zugleich lässt dem Namen 118 px:
„heranzie|hen“ (unter der Trenngrenze von ANN-707), „Durchgän|ge“. **Erwartet.** Entscheiden, ob das
ein Prüfpunkt ist; wenn ja, Trenngrenze senken oder Titel und Marken kleiner.

### BEF-220 — Termine: Statuszeichen und Knopf brechen mitten im Wort
2026-10-24 · Plattform, Termine · Briefing 3 · eingeplant in Schritt 3b; die Bausteine sind mit 3a
erledigt (ANN-765) · `Termine.tsx`\
**Rest.** Statuszeichen, Knöpfe und die neue `Terminzeile` brechen nur zwischen Wörtern, der Zustand
rückt ohne Platz unter den Titel. Die Liste in `Termine.tsx` zeigt noch ihre eigene Zeile; sie
wechselt mit 3b zur `Terminzeile`.

### BEF-221 — Termine: der vergangene Termin nennt keine Nummer, obwohl sie vorliegt
2026-10-24 · Plattform, ein Termin · Briefing 3 · offen (Schritt 3, DR-133) · `Terminaenderung.tsx`\
**Beobachtung.** „Bei Fragen rufen Sie bitte die Praxis an.“ ohne Nummer und Knopf, obwohl der
Kontext `practice_phone` trägt (ANN-691) und die Türen „Praxis anrufen“ zeigen (ANN-688).
**Erwartet.** Mit Nummer „Praxis anrufen“ als Anruf-Link, sonst „Der Praxis schreiben“; nie ein
Satz, der eine Handlung verlangt, die die Seite nicht anbietet.

### BEF-222 — Lesefrist: der Server nimmt Terminwünsche noch an
2026-10-24 · Plattform, Lesefrist · Handoff Termine, Frage 5 · offen; Frage an Jannes\
**Beobachtung.** DSN-001 D2 sagt „30 Tage lesend“, `app.platform_access_allows` erlaubt `request`
aber jedem lesbaren Zugang (`request_platform_appointment`, `…_change`); der Reiter zeigt „Termin
wünschen“. **Erwartet.** Nach Jannes' Antwort am Server ablehnen (Pfad A) und in der Ansicht
weglassen, oder bewusst erlauben und D2 so fassen.

### BEF-223 — Zeitumstellung: In der doppelten Stunde liegt „jetzt“ eine Stunde in der Zukunft
2026-10-25 · Absage, Absagewunsch, Tagebuch-Erinnerungen · CI zu #304 · offen (Vorschlag, Pfad A)\
**Beobachtung.** Zeigt Berlin 02:00 bis 03:00 zweimal, liest PostgreSQL die spätere Stunde:
`cancel_appointment(_from_request)` mit „jetzt“ scheitert an
`cancellation cannot be received in the future`, `enqueue_nutrition_diary_reminders` erinnert eine
Stunde zu spät; einmal im Jahr, auch im Testlauf. **Erwartet.** In Ortszeit vergleichen, eine
doppelte Ortszeit als die frühere lesen; je ein Test mit fester Uhrzeit aus dieser Stunde.

### BEF-224 — Arbeitszeit: Während die Vorschau lädt oder scheitert, rollt der Abschluss
2026-10-25 · Arbeitszeit ändern · Design-Review zu BEF-219 · offen (Vorschlag) ·
`RequestWorkingTimePage.tsx`\
**Beobachtung.** Bei 375 × 667 rollt die Seite beim Laden („Termine werden geprüft …“, 100 px) um
21 px, beim Fehler um 68 px; „Grund angeben“ liegt dann unter dem Fuß. **Erwartet.** Laden in der
Größe der Terminzeile, Fehler mit „Erneut versuchen“ ohne Rollen; Bilder beider Zustände bei 375 px.

### BEF-225 — Übungspläne: Ein Ablauftest misst die Höhe eines Links, während die Rückmeldung neu gezeichnet wird
2026-10-25 · `tests/e2e/plaene.spec.ts` · Browsertests unter Last · offen (Vorschlag) · `hoehe()`\
**Beobachtung.** Für „Als PDF oder drucken“ kamen 0 statt mindestens 44 px: `boundingBox()` liefert
beim Neuzeichnen `null`, `?? 0` macht 0 daraus. **Erwartet.** Mit `expect.poll(() => hoehe(…))`
abfragen; die Grenze 44 px bleibt.

### BEF-226 — Plattform: Zwei Browsertests messen zu früh, unter Last kippen sie
2026-10-25 · `plattform.spec.ts`, `plattform-uebungen.spec.ts` · Schritt 2d · offen (Vorschlag)\
**Beobachtung.** „Herunterladen“ fehlte nach 5 s, obwohl der Dateiname stand; die Durchführung lief
bei 188 px und „Sehr groß“ einmal über: gemessen, bevor die Schriftgröße des Geräts gilt.
**Erwartet.** Auf das gemessene Element warten (eigenes Zeitlimit, `data-schrift` am Wurzelelement);
Grenzen bleiben.

### Bildstrecke — Nach der Anmeldung bleibt der Zähler offener Anfragen über null
2026-10-28 · `scripts/bildstrecke.mjs` · Vorher-Bilder zu Schritt 3a · offen (Vorschlag) · `netzruhe`\
**Beobachtung.** Zwei Anfragen der Anmeldung (`own_offline_passkeys`) und das Monogramm brechen beim
ersten `goto` ab und melden mit dem Lesewächter (`context.route`) weder Ende noch Abbruch. Danach
läuft jeder Wechsel in der Anwendung in „keine Netzruhe nach 20 s“: 34 von 78 Bildern der Plattform,
die Bilder selbst vollständig; mit `--neu-laden` keines. **Erwartet.** Den Zähler nach jedem `goto`
auf null setzen oder offene Anfragen je Dokument führen; Gegenprobe mit `--nur=plattform`.

### Trennung — Die Prüfungen erlauben `@/lib/` pauschal, auch einen Datenzugriff dort
2026-10-25 · beide `trennung.test.ts` · Zweitreview Aufräumen 3 · offen (Vorschlag)\
**Beobachtung.** Beide lassen jeden Import aus `@/lib/` durch; zwei Module dort (`ki/gateway.ts`,
`location/funktion.ts`) rufen den Server, die Vorschau sperrt nur die Ortsmodule. Eine Praxisabfrage
unter `src/lib` sähe keine Prüfung. **Erwartet.** Ein Test hält fest, welche Dateien unter `src/lib`
`getSupabase()` benutzen dürfen, oder die Prüfungen sperren genau diese; je eine Gegenprobe.

### Termine — Ein Termin wird nie `invoiced`, obwohl ADR-018 die Invariante verlangt
2026-10-27 · Abrechnung, Termine · Aufräumen 5, Teil B (ANN-081) · offen (Vorschlag, Pfad A)\
**Beobachtung.** `public.issue_invoice` setzt nur `billable_services.status`, das Storno nichts am
Termin; ADR-018 Abschnitt 3 verlangt `invoiced` am Termin genau dann, wenn eine ausgestellte, nicht
stornierte Rechnung ihn führt (Test beider Richtungen). **Erwartet.** Ausstellung und Storno setzen
den Terminstatus in derselben Transaktion, mit Test, oder ADR-018 nimmt `invoiced` zurück
(Entscheidung Jannes).

### Training — `get_training_profile` protokolliert jedes Lesen
2026-10-27 · Training, Auditlog · Aufräumen 5, Teil B (ANN-287) · offen (Vorschlag, Pfad A)\
**Beobachtung.** Sie schreibt `training_relationship.viewed` mit eigenem `insert` bei jedem Aufruf;
ADR-010 Punkt 16 erlaubt einen Eintrag je Person, Verhältnis und Tag (`app.log_record_access`).
**Erwartet.** Migration mit `app.log_record_access`; ein Test ruft zweimal am Tag und erwartet einen
Eintrag.

### Katalogtexte — Kommentare der Datenbank versprechen Protokolle und Kennwörter, die es nicht mehr gibt
2026-10-27 · `COMMENT ON` · Aufräumen 5, Teil B · offen · `set_appointment_grid`,
`set_practice_target`, `list_revenue_by_staff`, `set_staff_compensation_model`,
`waive_appointment_fee`, `*_training_basis`, `add_training_protocol_addendum`,
`end_training_relationship`, `set_staff_member_schedulable`, `update_home_visit_addresses`,
`finalize_overdue_treatment_notes`, `complete_appointment`, `record_no_show`, `get_appointment_brief`,
`assign_prescription_scan`, `place_legal_hold`, `list_patient_treatment_notes`; Kennwort in
`renew_platform_representation_code`, `redeem_platform_invitation`; Frist von `deletion_journal`\
**Beobachtung.** Auditaktionen, die seit ADR-010 Fassung 3 niemand schreibt, ein Kennwort (seit
ADR-025 nicht mehr), eine Frist (setzt ADR-012 Punkt 12). **Erwartet.** Die nächste Migration an
der Funktion zieht ihr `COMMENT ON` nach, ohne Logik zu ändern; die Basis bleibt.

### Kommentare — 30 lange Kommentarblöcke nennen noch die Pfade vor dem Domänenschnitt
2026-10-27 · Kommentare in `scripts/`, `src/`, `supabase/` · Aufräumen 3b, Teil 2a · offen\
**Beobachtung.** 30 Blöcke über drei Zeilen nennen noch `src/features/<modul>/…`, neun Dokumente
nur in Git (Handoffs, `OPTIMIERUNG.md`, `score-inventar.md` u. a.; Liste beider:
`git show 9452575:docs/development/BEFUNDE.md`). „Kein Service Worker“ (ADR-015 Punkt 16, seit
ADR-024 überholt) steht in `app/Verbindungsanzeige.tsx`, `calendar/today/api.ts`,
`clinical/assessments/api.ts`, `clinical/documentation/api.ts` und im Testtitel in `marke.test.ts`.
**Erwartet.** Beim nächsten Anfassen auf drei Zeilen kürzen, den Pfad nach `scripts/domaenen.mjs`
nachziehen, Abgelegtes als `git show <commit>:<pfad>` nennen oder streichen.

### Doku — ADR-Wortlaut widerspricht Code, anderen ADRs oder den Prinzipien
2026-10-27 · ADRs, Prinzipien · Aufräumen 5, Teil C (Gegenlesen) · offen, Entscheidung Jannes\
**Beobachtung.** Beim Verdichten blieb der Wortlaut, auch wo er schon vorher nicht stimmte: ADR-017
Punkt 25 (Monatsbericht, ADR-010 Punkt 6 entfallen); ADR-024 Punkt 15 (je Art) gegen
`app.notification_rule` (je Weg); ADR-025 Punkt 4 ohne Ausnahme für ADR-024 Punkt 6; ADR-023 Punkt 1
(einzige Ausnahme, §3.4 kennt zwei), 5 (`user_profiles`), 13 (Vertretung gegen `finance_scope`);
ADR-025 Punkt 8 (Konstante je Kontoart); ADR-004 (Konsequenzen, keine allmächtige Kennung) gegen
`service_role` in drei Functions; ADR-020 Punkt 5 und 8; ADR-018 Punkt 1 (`requested`, `tentative`);
ADR-008 Punkt 1 gegen `retention_classes.basis`; ADR-027 Punkt 22 gegen `PAL_STUFEN`; §1.2 und §7.1
gegen ADR-009 Punkt 15 und ADR-006. **Erwartet.** Je ADR eine Fassung und eine neue Version der
Prinzipien nach Jannes' Entscheidung.

### Aufräumen — Das Terminformular steht fünfmal im Code
2026-10-27 · Kalender, Training · /aufraeumen 2026-10-27 · offen (Vorschlag) · `NewEventPage`,
`NewEventSeriesPage`, `NewAppointmentPage`, `EditAppointmentPage`, `TrainingTerminFormular`\
**Beobachtung.** Die vier größten Doppelungen im Programm (92, 60, 32 und 32 Zeilen) sind dasselbe
Formular. **Erwartet.** Ein gemeinsames Terminformular mit Varianten; geschätzt −250 Zeilen,
doppelte Zeilen 2,6 → 2,3 %. Aufwand mittel, Standardweg, Risiko Kalender-E2E; nach Schritt 3 des
Design-Reviews.

### Aufräumen — Die Akte und ihre Untermodule hängen gegenseitig voneinander ab
2026-10-27 · Patienten · /aufraeumen 2026-10-27 · offen (Vorschlag) · `patients` mit
`treatment-bases`, `files`, `intake`, `billing`\
**Beobachtung.** Vier der acht gegenseitigen Abhängigkeiten laufen über `patients`: Die Akte bindet
Unterseiten ein, die Unterseiten holen Hilfen (`akte.ts`, `api.ts`) aus der Akte. **Erwartet.** Die
geteilten Hilfen in ein Blattmodul, das nichts einbindet; gegenseitige Abhängigkeiten 8 → 4,
kleinerer Ring. Aufwand klein bis mittel, Standardweg, Risiko gering (nur Importe).

### Aufräumen — `portal/platform/api.ts` hat 2.240 Zeilen
2026-10-27 · Plattform · /aufraeumen 2026-10-27 · offen (Vorschlag) · `src/features/portal/platform/api.ts`\
**Beobachtung.** Die größte Programmdatei bündelt Ich, Termine, Wünsche, Befundbogen, Rechnungen,
Dokumente und Einwilligungen; jeder Schritt des Design-Reviews ändert sie. **Erwartet.** Je Bereich
eine Datei hinter derselben Schnittstelle, ohne Verhaltensänderung; weniger Konflikte paralleler
Arbeit, eine Datei über 500 Zeilen weniger. Aufwand klein, Standardweg, Risiko gering.
