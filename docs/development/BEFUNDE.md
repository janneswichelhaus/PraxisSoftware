# Befunde an der laufenden Anwendung

Stand: 2026-10-27

## Zweck

Hier stehen **Befunde aus Sichtungen (früher Abnahmen), Screenrecordings und Reviews an der
laufenden Anwendung** — Beobachtungen an etwas, das gebaut ist, nicht Ideen
für etwas, das fehlt. Ideen gehören in `docs/product/` (Rang 6); ein Befund
gehört hierher, weil er Gebautes korrigiert.

Die Liste ist die **Eingabe für die erste Story des nächsten Loops derselben
Spur** — so verlangt es Roadmap-Regel R6 („Befunde im Folge-Loop derselben
Spur", `ROADMAP.md`, Risiken). Sie hat **keinen Rang** in der
Dokumentenhierarchie, ist **kein Auftrag** und führt **keine zweite
Reihenfolge**: Was wann gebaut wird, steht ausschließlich in `ROADMAP.md`.
Ein Befund wird verbindlich erst im SPEC-Schritt des Loops, der ihn aufnimmt.

**Befunde gehen in Bereichsüberholungen** (seit 2026-10-12): Die offenen
Befunde eines Bereichs werden die ersten Stories seiner nächsten Überholung
(`/bereich`); andere werden gebündelt in einem Auftrag erledigt, nicht als
eigener Einzel-Story-Loop. Abläufe messen die Tipp-Budgets in
[`../product/kernablaeufe.md`](../product/kernablaeufe.md).

## Form

Jeder Befund trägt:

| Feld    | Inhalt                                                                                   |
| ------- | ---------------------------------------------------------------------------------------- |
| Titel   | `### <Bereich> — <Beobachtung>`; seit 2026-10-25 ohne neue `BEF-NNN`                     |
| Datum   | Tag der Beobachtung                                                                      |
| Bereich | Arbeitsbereich oder Seite (`ARBEITSBEREICHE.md`)                                         |
| Quelle  | Wer hat es wie gesehen: Sichtung, Screenrecording, Review, Herkunft aus dem Ideenspeicher |
| Status  | `offen` · `eingeplant in <Loop>` · `erledigt in <Loop>`                                  |

Ein behobener Befund wird mit dem Loop, der ihn geschlossen hat, hier gelöscht
(Auftrag Jannes, 2026-10-25); seinen Wortlaut hält Git. Die Erledigten bis 2026-10-27 und die
Lösungsanalyse zeigen `git show eb43569:docs/development/BEFUNDE.md` und
`git show eb43569:docs/development/archiv/`. Bestehende Kennungen bleiben, bis ihr Befund behoben
ist; neue werden nicht vergeben, und `pnpm docs:check` lässt nur die heute offenen zu (Regel D).
Messwerte (Pixel, Taps, Sekunden) sind Beobachtungen von Jannes selbst, aus dem
Code oder per Playwright auf Seed-Daten — nie aus Telemetrie und nie an
Mitarbeitenden (§20).

---

### BEF-010 — Ein gemeinsames Schema über zwei Lesepfade fällt keinem lokalen Gate auf

|         |                                                                                                                  |
| ------- | ---------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-17                                                                                                       |
| Bereich | Behandlungsdokumentation: Termin (`/termine/:id`) und Akte (`…/verlauf`)                                          |
| Quelle  | Jannes, angemeldeter E2E-Lauf zu CAL-018; der Einzelfall ist in CAL-018d behoben                                  |
| Status  | offen als Muster                                                                                                 |
| Berührt | `src/features/clinical/documentation/api.ts` (`treatmentNoteSchema`), `get_treatment_note`, `list_patient_treatment_notes` |

**Beobachtung.** Ein Eintragsschema liegt unter zwei Serverfunktionen. CAL-018 zog ein neues
Pflichtfeld nur in einer nach, und der Verlauf jeder Akte blieb leer, während sieben lokale Gates
grün waren. Das Muster ist wieder da: `get_treatment_note` liefert `reported_written_at`,
`list_patient_treatment_notes` nicht; im Browser fängt es nur `.optional()` ab.

**Richtung.** Eine Prüfung, die je Schema alle bedienenden Funktionen kennt: ein Datenbanktest, der
die Schlüssel der Rückgabe gegen eine Liste hält, oder die Regel, dass ein Schema genau einer
Funktion gehört. Sie gehört in den Loop, der das nächste Feld an ein geteiltes Schema hängt.

### BEF-028 — Querverweise zwischen Dokumenten veralten unbemerkt

|         |                                                                                            |
| ------- | ------------------------------------------------------------------------------------------ |
| Datum   | 2026-09-22                                                                                 |
| Bereich | Dokumentation: `docs/`, `PROJECT_PRINCIPLES.md`, `CLAUDE.md`                               |
| Quelle  | Frage von Jannes am 2026-09-22 („haben sich Unstimmigkeiten angesammelt?“)                 |
| Status  | Gate erledigt in G19 (Regeln A bis D in `scripts/docs-check-regeln.mjs`); offen: zwei Reste |
| Berührt | `docs/decisions/OPEN_DECISIONS.md`                                                         |

**Rest.** (1) B7 in `OPEN_DECISIONS.md` nennt „ADR-019 Fassung 2“, es gilt Fassung 6. Ohne das Wort
„Grundlage“ gilt eine ältere Fassung dem Gate als Herkunft; die Stelle gehört in die Durchsicht vor
dem B2-Paket. (2) `OPEN_DECISIONS.md` steht bei 399 von 400 Zeilen; die Grenze bremst nur, der
Inhalt muss ausziehen (Aufräumen Schritt 5).

### BEF-034 — Die Abweisung von `list_assignable_therapists` steht in keinem Protokoll

|         |                                                                                   |
| ------- | --------------------------------------------------------------------------------- |
| Datum   | 2026-09-23                                                                        |
| Bereich | Organisatorisches → Team (`/praxis/team`, `/praxis/team/:id`)                     |
| Quelle  | Aufgefallen bei der Bestandsaufnahme für G6b Teil 1                               |
| Status  | Oberfläche erledigt in UX-EPIC-002 (UX-002h, 2026-09-26); offen: Ausgang des Pfads |
| Berührt | `list_assignable_therapists`; `supabase/tests/audit.test.ts`                      |

**Rest.** Die Teamseiten fragen nur noch mit `canManageAppointments`. Die Funktion weist andere
Rollen ohne `record_denied_read` ab, und `audit.test.ts` hält diese Ausnahme fest. Offen ist, ob der
Pfad den Ausgang der übrigen Lesepfade bekommt (ADR-010, Label `freigabe-audit`) oder die Ausnahme
als bewusst geschlossen wird.

### BEF-082 — Sechzehn Lesepfade verlieren ihren Abweisungseintrag hinter PostgREST

|         |   |
| ------- | - |
| Datum   | 2026-09-30 |
| Bereich | Serverfunktionen mit protokollierter Abweisung (ADR-010, G6a/G6b) |
| Quelle  | Zweitreview TRN-EPIC-001 (Review-Subagent), Katalogabfrage in `supabase/tests/audit.test.ts` |
| Status  | offen |
| Berührt | `find_free_slots`, `find_possible_duplicates`, `get_intake_checklist`, `get_practice_statistics`, `get_practice_targets`, `list_call_list`, `list_care_without_conclusion`, `list_ending_prescriptions`, `list_open_intakes`, `list_open_prescription_scans`, `list_practice_revenue_months`, `list_tasks`, `list_top_services`, `list_waitlist_entries`, `list_waitlist_matches`, `rate_slot_travel`; Muster aus `20260923120000_abgewiesene_lesezugriffe_rest.sql` |

**Beobachtung.** Diese Funktionen sind `STABLE` und schreiben im abgewiesenen Fall über `app.record_denied_read` einen `denied`-Eintrag. PostgREST ruft `STABLE`-Funktionen in einer lesenden Transaktion auf; das INSERT scheitert dort mit 25006, der Aufrufer bekommt einen Fehler statt einer leeren Antwort, und der Versuch steht **nicht** im Protokoll. `pnpm test:db` sieht das nicht, weil es über eine direkte Verbindung ohne lesende Transaktion ruft. Für die Pfade von TRN-EPIC-001 ist es behoben; eine Katalogregel in `audit.test.ts` hält die Liste fest und lässt sie nur schrumpfen.

**Erwartet.** Eine Migration, die die sechzehn Funktionen auf `VOLATILE` stellt (`alter function … volatile`, kein Neuschreiben), danach die Liste im Test leeren. Lokal mit `supabase start` als therapist gegenprüfen, dass ein abgewiesener Aufruf 200 mit leerer Antwort liefert und im Protokoll steht.

### BEF-127 — Die Koordinaten-Constraints lassen eine Breite ohne Länge durch

|         |   |
| ------- | - |
| Datum   | 2026-10-05 |
| Bereich | Datenmodell, Kartendienst |
| Quelle  | UBK-EPIC-002, Zweitreview (Testlücke am Garagen-Constraint) |
| Status  | offen (eigenes Ticket; der Garagen-Constraint aus UBK-015 ist bereits dicht) |
| Berührt | `patient_contact_details_coordinate_check`, `appointments_visit_coordinate_check`, `locations_coordinate_check` (Migration `20260925100000_map_006a_coordinates.sql`) |

**Beobachtet:** Die drei Constraints prüfen `lat between …`, `lon between …` und `geocode_precision in (…)` ohne ausdrückliches `is not null`. Ein CHECK, der NULL ergibt, gilt als erfüllt: Eine Breite ohne Länge oder eine Genauigkeit ohne Koordinate kommt durch, sobald die Adresse vollständig ist. Geschrieben wird heute nur über die Funktionen, die beides zusammen setzen, und der Trigger verwirft die Koordinate mit der Adresse - ein Fehler entsteht deshalb erst mit einem neuen Schreibweg. **Erwartet:** Eine neue Migration ersetzt die drei Constraints durch die dichte Form aus `locations_garage_coordinate_check` (UBK-015); vorher prüft sie, dass keine Zeile die engere Regel verletzt. Ein Test je Tabelle wie in `supabase/tests/garage.test.ts`. Klein, Pfad A (Migration).

### BEF-140 — „Andere Ziel-App prüfen“ unter der Tourliste fällt weg

|         |                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------ |
| Datum   | 2026-10-10                                                                                       |
| Bereich | Tour                                                                                             |
| Quelle  | Jannes, Entscheidung zu den Löschkandidaten in `docs/design/leitfaden-schlank.md` (2026-10-10)   |
| Status  | Teile 1 und 2 erledigt am 2026-10-11; offen: Teil 3                                              |
| Berührt | `src/features/calendar/tours/Tourenliste.tsx`                                                    |

**Rest.** „Andere Ziel-App prüfen (für die Gerätebewertung)“ unter der Tourliste fällt weg, sobald
die Sichtung Kartendienst die Gerätebewertung abgeschlossen hat (`docs/sichtung/kartendienst.md`).
Außer diesem Eintrag führt kein Dokument die Bedingung.

### BEF-142 — Der Einwilligungstext der Plattform verspricht beim Widerruf „alle Fotos“

|         |   |
| ------- | - |
| Datum   | 2026-10-10 |
| Bereich | Plattform: Einwilligungen (`src/features/portal/platform/einwilligungstexte.ts`) |
| Quelle  | UX-008a, beim Prüfen des Foto-Widerrufs |
| Status  | offen |
| Berührt | `einwilligungstexte.ts` (Zweck `patient_photos`, Satz zum Widerruf); ADR-017 Punkt 46 |

**Beobachtung.** Der Satz „Die Praxis löscht dann sofort alle Fotos, die sie von Ihnen hat.“ stimmt nicht: Der Widerruf löscht die Arbeitshilfen; Dokumentationsfotos gehören zur Akte und bleiben (ADR-017 Punkt 46). In der Praxis ist der Satz mit UX-008a berichtigt.

**Frage an Jannes.** Der Text ist ein Einwilligungstext an die Person – soll er lauten „… alle Fotos, die als Arbeitshilfe entstanden sind; Fotos, die zur Behandlungsdokumentation gehören, bleiben in der Akte“? Eine Änderung braucht eine neue Fassung des Textes.

### BEF-166 — Ein Rad kennt keine Löschsperre

|         |   |
| ------- | - |
| Datum   | 2026-10-15 |
| Bereich | Radflotte (`/betrieb/flotte…`), Löschlauf |
| Quelle  | FLT-EPIC-001, Bau des Löschlaufs `app.delete_due_fleet_records` |
| Status  | offen; Bedingung vor dem Scharfschalten |
| Berührt | `supabase/migrations/20261119100000_flt_001_radflotte.sql` (Abschnitt 22); ANN-551, ANN-033; ADR-008 |

**Beobachtung.** Check-Ups, Pannen und Sperren fallen drei Jahre nach dem Ereignis von selbst; eine Löschsperre gibt es nur an der Akte (ANN-033). Ist ein Unfall mit einem Rad länger streitig, fiele der Nachweis der Pflege.

**Erwartet.** Eine Löschsperre je Rad mit Grund, gesetzt von `owner`, die der Löschlauf beachtet. Bis dahin lässt sich eine fällige Löschung nicht anhalten; die Unterlage für die Werkstatt ersetzt das nicht, sie zeigt nur offene Stellen. Bedingung vor dem Scharfschalten, Pfad A (Löschpfad).

### BEF-167 — Fotos am Rad: Ein verlorenes Objekt fällt erst beim Öffnen auf

|         |   |
| ------- | - |
| Datum   | 2026-10-15 |
| Bereich | Radflotte, Fotos am Rad |
| Quelle  | FLT-EPIC-001, Review der Fotos am Rad (Subagent) |
| Status  | offen |
| Berührt | `supabase/migrations/20261119110000_flt_002_fotos_am_rad.sql`, `src/features/fleet/Fotoreihe.tsx`; ADR-017 (Abgleich); ANN-552 |

**Beobachtung.** Die Dateien der Akte tragen nach dem Abgleich mit dem Speicher `object_missing` und sagen das in der Liste. Die Fotos am Rad kennen das Kennzeichen nicht; ein verlorenes Foto steht in der Fotoreihe wie jedes andere und meldet erst beim Öffnen einen Fehler.

**Erwartet.** Derselbe Abgleich und dasselbe Kennzeichen wie bei den Dateien der Akte; die Fotoreihe sagt, dass das Foto fehlt. Pfad A (Dateien).

### BEF-177 — Urheber und Zeitpunkt des Wochenplans stehen jeder Praxisrolle offen

|         |   |
| ------- | - |
| Datum   | 2026-10-17 |
| Bereich | Arbeitszeit, Planung (`staff_working_hours`) |
| Quelle  | Zweitreview der Überholung 8 (AZ-001) |
| Status  | offen (Vorschlag) |
| Berührt | `supabase/migrations/20260830120100_working_hours.sql` (Tabellenrecht), `src/features/calendar/scheduling/api.ts` |

**Beobachtung.** Der Wochenplan ist mit Tabellenrecht lesbar (seit CAL-005), also auch `created_by` und `created_at`. Seit den Fassungen (ANN-589) zeigt das, wer eine genehmigte dauerhafte Änderung eingetragen hat und wann – jeder Praxisrolle, solange die Fassung gilt. Die Abweichungen haben dafür seit URL-001 ein Spaltenrecht (ANN-580). **Erwartet.** Wie bei den Abweichungen nur die Spalten, die Kalender und Planung brauchen (`id`, `organization_id`, `staff_member_id`, `weekday`, `starts_at`, `ends_at`, `valid_from`, `valid_until`); Pfad A, eine Migration mit Negativtest.

### BEF-184 — Einwilligung „Ernährungsberatung“: das unterschriebene Blatt bleibt außerhalb der Anwendung

|         |   |
| ------- | - |
| Datum   | 2026-10-18 |
| Bereich | Akte und Trainingsverhältnis, Reiter Ernährung |
| Quelle  | Praxis-Review ERN-EPIC-001 |
| Status  | offen: Vorschlag (ADR-017, Dateien) |
| Berührt | `ProfilFormular.tsx`, Dateiablage der Akte |

**Beobachtung.** Das Anlegen verlangt die Einwilligung „auf Papier unterschrieben“; den Wortlaut zeigt das Formular seit dem Review, ein Foto des Blatts lässt sich aber nicht ablegen wie beim Anmeldebogen. Der Nachweis nach Art. 7 Abs. 1 liegt im Ordner. **Erwartet.** „Unterschriebenes Blatt fotografieren“ am Kästchen, abgelegt als Dokument der Akte bzw. des Verhältnisses mit der Frist der Ernährungsberatung.

### BEF-194 — Ein Lookbehind im Fragebogen lässt ältere Safari das Modul nicht laden

|         |   |
| ------- | - |
| Datum   | 2026-10-24 |
| Bereich | Plattform, Fragebogen; Praxis, Erhebungen |
| Quelle  | Design-Review 1c (PR #295), beim Beheben desselben Fehlers in `begriffe.ts` |
| Status  | offen (Vorschlag) |
| Berührt | `src/features/clinical/assessments/darstellung.ts` (Zeile 27, `split(/\s+\|(?<=-)(?=\p{L})/u)`) |

**Beobachtung.** Ein regulärer Ausdruck mit Lookbehind ist in Safari vor iOS 16.4 ein Syntaxfehler; das ganze Modul lädt dann nicht. `darstellung.ts` steht im Fragebogen der Plattform (`trennung.test.ts` lässt es zu) und in der Praxis. Schritt 1d hat dasselbe in `Dialogfenster.tsx` und `Einstieg.tsx` behoben, 1c in `begriffe.ts`. **Erwartet.** Trennen ohne Lookbehind (etwa erst an Leerraum, dann je Teil nach `-` mit angehängtem Bindestrich) und ein Test, der Lookbehinds in ausgeliefertem Code unter `src/` findet.

### BEF-195 — Der Bereichsschalter der Plattform bricht bei „Sehr groß“ mitten im Namen

|         |   |
| ------- | - |
| Datum   | 2026-10-24 |
| Bereich | Plattform, Gerüst (Kopf) |
| Quelle  | Design-Review 1e, Bildstrecke „Sehr groß“ der Begleitung (`handeln-fuer`) |
| Status  | offen (Vorschlag) |
| Berührt | `Kopf` in `src/features/portal/platform/Navigation.tsx` (Schalter unter `nav aria-label="Bereich"`) |

**Beobachtung.** Bei 375 px und „Sehr groß“ bricht im Schalter „Für Maximilian Mustermann-Langenscheidt“ zwischen „Musterman“ und „n-“, also mitten im Wort, weil die Plattform `overflow-wrap: anywhere` setzt und das Ziel halb so breit ist. **Erwartet.** Wie im Gruß nur am Bindestrich brechen (DR-114) - etwa zwei Reihen statt zwei Spalten, sobald ein Wort nicht passt, oder der Name in einer eigenen Zeile.

### BEF-201 — Plattform: „Löschen“ an einem Anhang löscht ohne Rückfrage

|         |   |
| ------- | - |
| Datum   | 2026-10-22 |
| Bereich | Plattform, Rückfragen der Praxis mit Anhängen (`/p/nachrichten/:id`) |
| Quelle  | Design-Review von Schritt 1a (#290); bestand schon vorher; aus der Sitzung „Design-Review Anwendung Lauf 1“ (archiviert 24.10.) übernommen |
| Status  | offen (Vorschlag) |
| Berührt | `src/features/portal/platform/Anhaenge.tsx` (Knopf „Löschen“); Vorbild `src/features/portal/messages/RueckfrageAnhaenge.tsx` |

**Beobachtung.** „Löschen“ steht als Zweitknopf gleichrangig neben „Ansehen“ und löscht den Anhang sofort (`onClick={() => loeschen.mutate(a.id)}`). DESIGN.md verlangt für Zerstörendes: leise am Ende, mit `Rueckfrage`; die Praxis macht es so. **Erwartet.** „Löschen“ leise ans Ende, erst nach `Rueckfrage` löschen, Wortlaut nach PLATTFORM.md („Begriffe“); am Löschpfad (RPC, Policy) nichts ändern. Komponententest für Abbrechen und Bestätigen, `nachrichten.spec.ts` grün.

### BEF-202 — E2E hinter der Anmeldung: Eine Wiederholung in der CI kann Termine des ersten Versuchs treffen

|         |   |
| ------- | - |
| Datum   | 2026-10-22 |
| Bereich | E2E hinter der Anmeldung (`tests/e2e/authenticated/*.spec.ts`) |
| Quelle  | CI-Lauf 39842106004; aus der Sitzung „Design-Review Anwendung Lauf 1“ (archiviert 24.10.) übernommen |
| Status  | offen (Vorschlag) |
| Berührt | `tests/e2e/authenticated/helpers.ts` (`tagImFenster`), `playwright.config.ts` (`retries`), 24 Spezifikationen mit `const LAUF = Date.now()` |

**Beobachtung.** Die CI wiederholt einmal. Eine wiederholte serielle Gruppe läuft in einem neuen Worker mit neuem `LAUF` und kann einen Tag treffen, den der erste Versuch in derselben Datenbank schon belegt hat; der Überschneidungsschutz weist den Termin dann zu Recht ab. #291 löst das nur für `treatment-note-finalisation.spec.ts` (Versatz je Versuch). **Erwartet.** Ein `LAUF` je Testlauf für alle Worker (etwa `E2E_LAUF`, einmal in `playwright.config.ts` gesetzt) und ein Tagesversatz je Wiederholung (`test.info().retry` × N); die Streuung für lokale Läufe und die Reserve je Fenster bleiben, kein Test wird abgeschwächt.

### BEF-212 — Lokale Ansicht: Gerätelesungen halten an, wenn das Netz während der Ansicht wegfällt

|         |   |
| ------- | - |
| Datum   | 2026-10-24 |
| Bereich | Plattform, lokale Ansicht nach der Freigabe ohne Netz (`LokaleUebungen`) |
| Quelle  | Schritt 2b (DRP-EPIC-008), beim Nachstellen von BEF-211 |
| Status  | offen (Vorschlag) |
| Berührt | `abgelegteZugaenge` und `wartendeEinheiten` in `src/features/portal/platform/LokaleUebungen.tsx` |

**Beobachtung.** Die Abfragen lesen nur das Gerät, laufen aber mit dem Standard `networkMode: 'online'` der Abfragebibliothek. Meldet das Gerät während der lokalen Ansicht „offline“ und wird eine Abfrage neu gestellt (etwa die Warteschlange nach einer Einheit), hält sie an, bis Verbindung besteht. Beim Kaltstart ohne Netz tritt es nicht auf. **Erwartet.** `networkMode: 'always'` wie in der Durchführung (BEF-211); Browsertest mit `setOffline` während der Ansicht.

### BEF-217 — Übungen: Bühne und Marken brechen bei 188 px und „Sehr groß“ zugleich mitten im Wort

|         |   |
| ------- | - |
| Datum   | 2026-10-24 |
| Bereich | Plattform, Übungen (Fenster „Übung zum Nachlesen“, Durchführung) |
| Quelle  | Selbstsichtung DRP-EPIC-009, Prüfseite `plattform-uebungen.html` bei 188 px mit „Sehr groß“ |
| Status  | offen (Vorschlag) |
| Berührt | `Buehne` (`src/components/ui/Buehne.tsx`), `Dosierungsmarken` (`src/features/portal/platform/Dosierungsmarken.tsx`) |

**Beobachtung.** Einzeln (188 px oder „Sehr groß“) bricht kein Wort ohne Strich. Beides zugleich lässt für den Namen in der Bühne etwa 118 px: „heranziehen“ (elf Buchstaben, unter der Trenngrenze von ANN-707) bricht als „heranzie|hen“, die Marke „3 Durchgänge“ als „Durchgän|ge“. **Erwartet.** Entscheiden, ob die Kombination zu den Prüfpunkten gehört; wenn ja, dort die Trenngrenze senken oder Titel und Marken kleiner setzen.

### BEF-220 — Termine: Statuszeichen und Knopf brechen mitten im Wort

|         |   |
| ------- | - |
| Datum   | 2026-10-24 |
| Bereich | Plattform, Termine (`/p/termine`) |
| Quelle  | Ist-Bilder für Briefing 3 (Prüfseite `plattform.html`, 375 px „Sehr groß“ und 188 px) |
| Status  | offen; wird mit Schritt 3 des Design-Reviews neu gefasst |
| Berührt | `src/features/portal/platform/Termine.tsx` (`Terminzeile`, `Wunschzeile`), `src/index.css` (`.plattform-schrift`: `overflow-wrap: anywhere`) |

**Beobachtung.** Bei „Sehr groß“ wird die Spalte des Zustands an der Terminzeile so schmal, dass „Änderung angefragt“ als „Änderun|g angefrag|t“ bricht. Bei 188 px (200 %) bricht der Knopf „Wunsch zurückziehen“ als „zurückzieh|en“ – ohne Strich. Ursache ist `overflow-wrap: anywhere` an der ganzen Plattform: Es gibt jedem Element eine Mindestbreite von einem Zeichen. **Erwartet.** Wie in PLATTFORM.md: Statuszeichen und Knöpfe brechen nie im Wort, nur zwischen Wörtern; ist kein Platz, rückt der Zustand unter den Titel.

### BEF-221 — Termine: der vergangene Termin nennt keine Nummer, obwohl sie vorliegt

|         |   |
| ------- | - |
| Datum   | 2026-10-24 |
| Bereich | Plattform, ein Termin (`/p/termine/:id`, vergangen oder nicht mehr änderbar) |
| Quelle  | Ist-Bilder für Briefing 3 (lokaler Stack, Erika, 375 und 1280 px) |
| Status  | offen; wird mit Schritt 3 des Design-Reviews neu gefasst (DR-133) |
| Berührt | `src/features/portal/platform/Terminaenderung.tsx` (Satz „Bei Fragen rufen Sie bitte die Praxis an.“) |

**Beobachtung.** Die Seite sagt „Dieser Termin lässt sich hier nicht mehr ändern. Bei Fragen rufen Sie bitte die Praxis an.“ – ohne Nummer und ohne Knopf. Seit N2 (#292, ANN-691) trägt der Plattformkontext die Rufnummer der Praxis (`practice_phone`), und die Türen zeigen „Praxis anrufen“ schon als Knopf (ANN-688). **Erwartet.** Mit Nummer „Praxis anrufen“ als Anruf-Link mit der Nummer im Wort, ohne Nummer ein Weg zu „Der Praxis schreiben“ – nie ein Satz, der zu einer Handlung auffordert, die die Seite nicht anbietet.

### BEF-222 — Lesefrist: der Server nimmt Terminwünsche noch an

|         |   |
| ------- | - |
| Datum   | 2026-10-24 |
| Bereich | Plattform, Termine in der Lesefrist (`read_until` gesetzt, eigener Zugang) |
| Quelle  | Handoff Termine (Briefing 3), Frage 5 |
| Status  | offen; Frage an Jannes im Handoff |
| Berührt | `app.platform_access_allows` (`request` für jeden lesbaren Zugang), `request_platform_appointment`, `request_platform_appointment_change` |

**Beobachtung.** DSN-001 D2 sagt für das Ende einer Behandlung ohne Abo „30 Tage lesend“. `app.platform_access_allows` erlaubt `request` aber jedem lesbaren Zugang, also auch in der Lesefrist; heute zeigt der Reiter dort „Termin wünschen“ wie sonst. **Erwartet.** Nach Jannes' Antwort entweder Wünschen in der Lesefrist am Server ablehnen (Pfad A, `pnpm test:db`) und in der Ansicht weglassen, oder Wünschen bewusst erlauben und D2 entsprechend fassen. Das Weglassen in der Ansicht allein ist keine Zugriffskontrolle.

### BEF-223 — Zeitumstellung: In der doppelten Stunde liegt „jetzt“ eine Stunde in der Zukunft

|         |   |
| ------- | - |
| Datum   | 2026-10-25 |
| Bereich | Termine (Absage), Plattform (Absage aus einem Wunsch), Ernährung (Erinnerungen ans Tagebuch) |
| Quelle  | CI zu #304 am 25.10. zwischen 00:00 und 01:00 UTC (7 Datenbanktests rot, auf `main` nachgestellt); Kommentar in #304 |
| Status  | offen (Vorschlag, Pfad A) |
| Berührt | `cancel_appointment`, `cancel_appointment_from_request`, `enqueue_nutrition_diary_reminders`; `nutrition-appointments.test.ts`, `platform-requests-practice.test.ts`, `nutrition-diary-reminders.test.ts` |

**Beobachtung.** Wenn die Uhr in Berlin 02:00 bis 03:00 zweimal zeigt, liest PostgreSQL eine Ortszeit aus dieser Stunde als die spätere (MEZ). Eine Absage, die mit „jetzt“ als Datum und Uhrzeit eingeht, scheitert dann mit `cancellation cannot be received in the future`, und eine Erinnerung wird erst eine Stunde später fällig. Betroffen sind die echte Nutzung und jeder Testlauf in dieser Stunde, einmal im Jahr (nächstes Mal am 31.10.2027). **Erwartet.** „Nicht in der Zukunft“ in Ortszeit vergleichen und eine doppelte Ortszeit als den früheren Zeitpunkt lesen, ebenso in den Erinnerungen; je ein Test mit einer fest übergebenen Uhrzeit aus der doppelten Stunde, unabhängig von der Uhr des Laufs.

### BEF-224 — Arbeitszeit: Während die Vorschau lädt oder scheitert, rollt der Abschluss

|         |   |
| ------- | - |
| Datum   | 2026-10-25 |
| Bereich | Betrieb, Arbeitszeit ändern (`/betrieb/arbeitszeit/beantragen`, Abschluss) |
| Quelle  | Design-Review zu BEF-219 (Hinweis H2: Laden und Fehler nicht bebildert); Messung am Cloud-Stack bei 375 × 667 |
| Status  | offen (Vorschlag) |
| Berührt | `RequestWorkingTimePage.tsx` (Abfragezustand der Vorschau), `LoadingState` und `ErrorState` in `src/components/ui/Feedback.tsx` |

**Beobachtung.** Solange die Vorschau der neuen Zeiten lädt, steht „Termine werden geprüft …“ in 100 px Höhe unter der Liste, die Seite rollt um 21 px. Scheitert sie, rollt sie mit `ErrorState` und „Erneut versuchen“ um 68 px; „Grund angeben“ liegt dann unter dem Fuß. Vor und nach BEF-219 gleich. **Erwartet.** Laden in der Größe der Terminzeile (etwa ein kompakter `LoadingState` über `Abfragezustand`) und ein Fehler, der mit „Erneut versuchen“ ohne Rollen Platz findet; Bilder beider Zustände bei 375 px im Browsertest.

### BEF-225 — Übungspläne: Ein Ablauftest misst die Höhe eines Links, während die Rückmeldung neu gezeichnet wird

|         |   |
| ------- | - |
| Datum   | 2026-10-25 |
| Bereich | Übungspläne (Praxis), `tests/e2e/plaene.spec.ts` („Ablauf Heimprogramm … mit 5 Übungen individuell“) |
| Quelle  | Browsertests zu BEF-215 und BEF-218 unter Last (paralleler Prüfsatz); allein grün |
| Status  | offen (Vorschlag) |
| Berührt | `hoehe()` in `tests/e2e/plaene.spec.ts` |

**Beobachtung.** Nach „Zuweisen“ erwartete der Test für „Als PDF oder drucken“ in der Rückmeldung mindestens 44 px und bekam 0. `hoehe()` wartet auf Sichtbarkeit und liest danach `boundingBox()`; wird die Rückmeldung dazwischen neu gezeichnet, liefert das `null`, und `?? 0` macht daraus 0 px. **Erwartet.** Die Höhe mit `expect.poll(() => hoehe(…))` abfragen statt einmal zu messen; die Grenze 44 px bleibt.

### BEF-226 — Plattform: Zwei Browsertests messen zu früh, unter Last kippen sie

|         |   |
| ------- | - |
| Datum   | 2026-10-25 |
| Bereich | Plattform, `tests/e2e/plattform.spec.ts` („… laufen bei 375/1280 px nicht über“) und `tests/e2e/plattform-uebungen.spec.ts` („Durchführung bei 188 px …, Schrift „sehr-gross““) |
| Quelle  | Browsertests zu Schritt 2d mit `pnpm test:db` und einem zweiten Prüfsatz daneben; allein 8 von 8 grün |
| Status  | offen (Vorschlag) |
| Berührt | die beiden Tests, kein Code der Anwendung |

**Beobachtung.** Unter „Dokumente“ war „Herunterladen“ nach 5 s noch nicht da, obwohl der Name der Datei stand. Die Durchführung lief bei 188 px und „Sehr groß“ einmal waagerecht über: Gemessen wird, sobald der Titel sichtbar ist - womöglich bevor die Schriftgröße des Geräts gilt. **Erwartet.** Auf das gemessene Element warten (der Knopf mit eigenem Zeitlimit, die Schrift über `data-schrift` am Wurzelelement) und erst dann messen; die Grenzen bleiben.

### Trennung — Die Prüfungen erlauben `@/lib/` pauschal, auch einen Datenzugriff dort

|         |   |
| ------- | - |
| Datum   | 2026-10-25 |
| Bereich | `src/features/portal/platform/trennung.test.ts`, `src/features/core/preview/trennung.test.ts`, `src/lib/` |
| Quelle  | Zweitreview zu Aufräumen Schritt 3 |
| Status  | offen (Vorschlag) |
| Berührt | beide Trennungsprüfungen; `src/lib/ki/gateway.ts`, `src/lib/location/funktion.ts` |

**Beobachtung.** Beide Prüfungen lassen jeden Import aus `@/lib/` durch, weil dort anbieterfreie Hilfen liegen. Zwei Module dort sprechen aber den Server an (`functions.invoke` im KI-Gateway und in der Ortsfunktion); die Vorschau sperrt nur die Ortsmodule einzeln. Läge eine Praxisabfrage unter `src/lib`, sähe keine der beiden Prüfungen einen Import aus Plattform oder Vorschau. Schritt 3 hat die Tagesliste deshalb als Modul `day-plan` angelegt statt in `src/lib` (DEVELOPMENT.md „Modulgrenzen“). **Erwartet.** Ein Test hält fest, welche Dateien unter `src/lib` `getSupabase()` benutzen dürfen, oder die Trennungsprüfungen sperren genau diese; dazu je eine Gegenprobe.

### Termine — Ein Termin wird nie `invoiced`, obwohl ADR-018 die Invariante verlangt

|         |   |
| ------- | - |
| Datum   | 2026-10-27 |
| Bereich | Abrechnung, Termine |
| Quelle  | Aufräumen 5, Teil B (ANN-081, Tiefenanalyse 5b) |
| Status  | offen (Vorschlag, Pfad A) |
| Berührt | `public.issue_invoice`, Storno; ADR-018 Abschnitt 3; ANN-081 |

**Beobachtung.** `issue_invoice` setzt nur `billable_services.status = 'invoiced'`; kein Weg setzt den Termin auf `invoiced`. ADR-018 Abschnitt 3 verlangt `status = 'invoiced'` genau dann, wenn eine ausgestellte, nicht stornierte Rechnung den Termin führt, mit Test beider Richtungen. ANN-081 beschreibt den heutigen Stand als Übergang. **Erwartet.** Ausstellung und Storno setzen den Terminstatus in derselben Transaktion, mit Test, oder ADR-018 nimmt `invoiced` am Termin zurück (Entscheidung Jannes).

### Training — `get_training_profile` protokolliert jedes Lesen

|         |   |
| ------- | - |
| Datum   | 2026-10-27 |
| Bereich | Training, Auditlog |
| Quelle  | Aufräumen 5, Teil B (ANN-287) |
| Status  | offen (Vorschlag, Pfad A) |
| Berührt | `public.get_training_profile`; `app.log_record_access`; ADR-010 Punkt 16 |

**Beobachtung.** Die Funktion schreibt `training_relationship.viewed` mit einem eigenen `insert` bei jedem Aufruf. ADR-010 Punkt 16 erlaubt höchstens einen Eintrag je Person, Verhältnis und Tag; das hält `app.log_record_access`, das alle anderen Lesewege nutzen. **Erwartet.** Eine Migration ersetzt den `insert` durch `app.log_record_access`, ein Test ruft zweimal am Tag und erwartet einen Eintrag.

### Katalogtexte — Kommentare der Datenbank versprechen Protokolle und Kennwörter, die es nicht mehr gibt

|         |   |
| ------- | - |
| Datum   | 2026-10-27 |
| Bereich | Datenbank (`COMMENT ON`) |
| Quelle  | Aufräumen 5, Teil B (Abgleich der Annahmen mit der Basis) |
| Status  | offen |
| Berührt | `set_appointment_grid`, `set_practice_target`, `list_revenue_by_staff`, `set_staff_compensation_model`, `waive_appointment_fee`, `*_training_basis`, `add_training_protocol_addendum`, `end_training_relationship`, `set_staff_member_schedulable`, `update_home_visit_addresses`, `finalize_overdue_treatment_notes`, `complete_appointment`, `record_no_show`, `get_appointment_brief`, `assign_prescription_scan`; `renew_platform_representation_code`, `redeem_platform_invitation` („Kennwort“); Tabelle `deletion_journal` („ohne eigene Frist“) |

**Beobachtung.** Die Katalogtexte nennen Auditaktionen, die seit ADR-010 Fassung 3 niemand schreibt, ein Kennwort, das es seit ADR-025 nicht gibt, und eine Frist, die ADR-012 Punkt 12 inzwischen setzt. Die Basis-Migration ist ausgeliefert und bleibt unverändert. **Erwartet.** Die nächste Migration an einer dieser Funktionen zieht deren `COMMENT ON` nach, ohne Logik zu ändern.

### Kommentare — 30 lange Kommentarblöcke nennen noch die Pfade vor dem Domänenschnitt

|         |   |
| ------- | - |
| Datum   | 2026-10-27 |
| Bereich | Kommentare im Code |
| Quelle  | Aufräumen Schritt 3b, Teil 2a |
| Status  | offen |
| Berührt | `scripts/bildstrecke/routen.mjs`, `routenquelle.mjs`, `scripts/definitionen-sql.mjs`, `katalog-sql.mjs`; `src/components/ui/Buehne.tsx`, `Reiterleiste.tsx`, `Rueckmeldung.tsx`; `src/dateinamen.test.ts`, `src/protokollierung.test.ts`; `src/features/calendar/tours/TagesrouteAufklapper.tsx`, `core/preview/trennung.test.ts`, `fleet/api.ts`, `fleet/standortvorlage.test.ts`, `nutrition/lebensmittel.ts`, `patients/akte.ts`, `portal/platform/trennung.test.ts`, `portal/platform/zeit.ts`, `privacy/datenschutz/kategorien.ts`, `training/api.ts`, `workforce/staff/rollenhinweise.ts`; `src/lib/ki/gateway.ts`, `src/lib/location/matrix.ts`, `route.ts` (zwei Blöcke), `src/lib/vertretung.ts`; `supabase/functions/location-provider/abschottung.test.ts`, `mock.ts`, `supabase/functions/patient-file-verify/video.ts`; `supabase/tests/patient-files.test.ts`, `staff-leave.test.ts` |

**Beobachtung.** Beim Umzug der Module in die 14 Domänenordner zogen Pfade in Importen, Tests, Skripten und Doku mit. In diesen Kommentarblöcken mit mehr als drei Zeilen steht noch die alte Form `src/features/<modul>/…`: Die Kommentarregel verlangt, einen angefassten Block auf drei Zeilen zu kürzen, und der Umzug sollte mechanisch bleiben. **Erwartet.** Beim nächsten Anfassen der Datei den Block kürzen und den Pfad nachziehen (`<domäne>/<modul>` nach `scripts/domaenen.mjs`).

**Dazu seit Aufräumen Schritt 5:** Neun lange Blöcke nennen Dokumente, die nur noch in Git liegen:
`src/components/ui/bausteine.test.tsx`, `src/designsystem.test.ts` (zwei Blöcke, Handoffs vom
01.10. und 05.10.), `src/features/billing/InvoicePrintPage.tsx` (`rechnungs-pdf-optionen.md`),
`InvoicesPage.test.tsx` und `Zahlungsformular.tsx` (`OPTIMIERUNG.md`),
`src/features/calendar/appointments/TermineUebertragenPage.tsx` (`CAL-EPIC-004.md`),
`src/features/patients/treatment-bases/TreatmentBasisFormFields.tsx` (`VER-EPIC-002.md`),
`src/features/clinical/assessments/schema.ts` (`score-inventar.md`). Beim Anfassen den Pfad als
`git show eb43569:<pfad>` nennen oder streichen. Ebenso `src/features/calendar/today/api.ts`: „es gibt
keinen Service Worker“ gilt seit ADR-024 nicht mehr.
