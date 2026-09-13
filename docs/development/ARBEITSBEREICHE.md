# Arbeitsbereiche: was funktioniert, was Vorschau ist, was offen ist

Stand: 12.09.2026

Diese Liste ist die Antwort auf eine einzige Frage: **Worauf kann ich mich in
der laufenden Anwendung verlassen?** Sie ergänzt
[`../PRODUCT_VISION.md`](../PRODUCT_VISION.md) §6a um den Umsetzungsstand und
ersetzt keine Feature-Spezifikation.

**Vier Arbeitsbereiche heißen seit dem 12.09.2026 anders** (Vorgabe von
Jannes): „Mein Tag" → **Übersicht**, „Touren & Termine" → **Kalender**, „Team"
→ **Kommunikation**, „Betrieb" → **Organisatorisches**. Patient:innen und
Abrechnung blieben. Geändert hat sich allein die Beschriftung samt Symbol —
Zuschnitt, Routen und Berechtigungen sind dieselben. Oberfläche, Abnahmeschritte
und Dokumentation sind nachgezogen. Die alten Namen stehen nur noch dort, wo
sie einen Stand von damals festhalten und nicht nachträglich geändert werden:
in den Fassungseinträgen der `ROADMAP.md`, in Kommentaren bereits angewendeter
Migrationen und in dieser Notiz.

Vier Zustände:

| Zustand                  | Bedeutung                                                                     |
| ------------------------ | ----------------------------------------------------------------------------- |
| **funktional**           | Echte Anbindung an Datenbank, RLS und Audit. Nutzbar mit synthetischen Daten. |
| **Vorschau**             | Bedienbar, aber ohne Hintergrundfunktionen. Zustand nur im Arbeitsspeicher.   |
| **offen**                | Fachliche oder rechtliche Entscheidung steht aus. Die Ansicht zeigt das.      |
| **begründet abweichend** | Weicht bewusst von der Team-App-Vorlage ab. Begründung steht dabei.           |

---

## 1. Funktional

Unverändert an ihren echten Anbindungen. Der Umbau hat Einordnung und
Beschriftung geändert, nicht das Verhalten.

| Bereich                                 | Route                                                   | Anmerkung                                        |
| --------------------------------------- | ------------------------------------------------------- | ------------------------------------------------ |
| Patientenliste, Suche                   | `/patienten`                                            | RLS-gestützt, Audit auf Aktenzugriff             |
| Patient anlegen / ändern                | `/patienten/neu`, `…/bearbeiten`                        | serverseitige Prüfung in `create/update_patient` |
| Patientenakte                           | `/patienten/:id`                                        | Seit AKTE-000 (12.09.2026) ein Rahmen mit Bereichen, seit UI-002a (12.09.2026) mit **vier**: **Termine** (`…/termine`), **Verordnungen** (`…/verordnungen`), **Behandlungsverlauf** (`…/verlauf`), **Stammdaten** (`…/stammdaten`). `/patienten/:id` zeigt selbst nichts mehr, sondern führt in den ersten Bereich, den die Rolle sehen darf — für ein Patientenkonto sind das die Stammdaten. Der Bereich **Übersicht** ist entfallen: Er war ein Auszug aus den vier anderen und kostete bei jedem Aufruf einen Tap. Der Kopf trägt Name, Geburtsdatum, Status, die beiden täglichen Vorgänge und — nur wenn hinterlegt — Zugangshinweis und Besonderheit vor dem Hausbesuch (PAT-005); er bleibt beim Bereichswechsel stehen; die Akte wird einmal geladen und **einmal** als Aktenzugriff protokolliert (ADR-010). Die Formulare liegen außerhalb des Rahmens — wer tippt, sieht die Bereichsleiste nicht (UX-009) |
| Kalender Tag / Woche                    | `/kalender`                                             | Datum, Ansicht, Filter und Zoomstufe stehen in der Adresse. Das Gitter ist seit CAL-011 zoombar (40 bis 208 px je Stunde) und zeigt dabei das tatsächliche Praxisraster, nicht nur Stunden |
| Termin anlegen / ändern                 | `/patienten/:id/termine/neu`, `/termine/:id/bearbeiten` | Beginn frei im Praxisraster, Ende abgeleitet aus einer **Dauerauswahl**: seit CAL-015b sind **60 (vorbelegt) oder 45 Minuten** zulässig, eine dritte Länge weist der Server ab (§8.1 in 0.9, E12 Punkt 1). Ein Bestandstermin mit abweichender Länge bleibt gültig und verschiebbar und steht als eigener Eintrag in derselben Auswahl (ANN-037) |
| Ereignis eintragen (Besprechung, Teamtermin) | `/termine/ereignis` (aus dem Kalender)             | Termin **ohne Patient:in und ohne Verordnung**: Bezeichnung, mehrere Beteiligte, Beginn **und** Ende frei im Praxisraster (CAL-015b, ANN-049). Der Server legt je beteiligter Person eine Zeile an — alles oder nichts — und prüft Belegung und Arbeitszeit wie bei jedem Termin. Ein Ereignis lässt sich **nicht** abschließen, dokumentieren oder als „nicht angetroffen" vermerken und erzeugt damit **keine** abrechenbare Leistung (§19); „Tag umplanen" lässt es stehen |
| Terminzustände: absagen, nicht angetroffen, abschließen, wieder öffnen | `/termine/:id`                          | Sechs Zustände nach ADR-018 (CAL-008). Absage nur mit codiertem Pflichtgrund und ohne Rückweg (ANN-034) · **Absage mit Eingangszeitpunkt und 24-Stunden-Frist**: Der Eingang wird getrennt von der Eingabe erfasst („gerade eben" oder nachgetragen in Ortszeit, ANN-048), die Frist rechnet ausschließlich der Server, und nur eine Patientenabsage löst sie aus (ANN-047). Ein Gebührenanlass steht als eigene Zeile am Termin — **ohne Betrag**, denn der Leistungskatalog (ABR-001) ist nicht gebaut · „Nicht angetroffen" ist seit CAL-014c **ein Schritt ohne Gebührenentscheidung**; aus dem Vermerk entsteht keine Gebühr, und ob es eine eigene Regel dafür geben soll, ist offen (`OPEN_DECISIONS.md` E14) · „Behandlung abschließen" fasst Dokumentation, Finalisierung und Abschluss in **einem** serverseitigen Vorgang zusammen (UX-007); „Termin abschließen" ohne Dokumentation bleibt daneben (ANN-005) · **dokumentiert** setzt die Finalisierung, nicht die Oberfläche (ANN-036) · `abgerechnet` steht im Wertebereich und bekommt seinen Schreibpfad mit ABR-003 |
| Tag umplanen mit Anrufliste             | `/kalender/tag-umplanen` (aus der Tagesansicht mit Personenfilter) | Sagt alle bestätigten Termine einer Person eines Tages in **einer** Transaktion ab und zeigt danach die Anrufliste mit Wählzielen (CAL-009, `IDEA-PRX-004`). Die Anrufliste liest den bestehenden Tagesplan-Lesepfad; die Erledigt-Haken sind bewusst nicht gespeichert |
| Folgetermin, Vorbelegung „Hausbesuch, ich, heute" | `/termine/:id`, `/patienten/:id/termine/neu`   | Vorbelegung reist über die Adresszeile. Das Ende kommt aus dem Terminfenster, nicht aus der Dauer des Ausgangstermins (CAL-010a) |
| Terminserie aus einer Verordnung        | `/patienten/:id/verordnungen/:vid/serie` (aus der Akte an der Verordnung) | Anzahl aus dem offenen Kontingent, drei Rhythmen, Konfliktprüfung je Zeile serverseitig, Einzelabweichung in der Liste; alles oder nichts (CAL-007). Der Termin kennt seine Verordnung; verplant ist nicht genutzt, die genutzte Menge bleibt bis ABR-002 von Hand gepflegt (ANN-038, ANN-012) |
| Mitteilungsvermerk am Termin            | `/termine/:id` (Auswahl), Akte „Nächste Termine" (Zeichen) | Hält fest, ob und auf welchem Weg ein Termin mitgeteilt wurde: persönlich, telefonisch, Terminzettel, E-Mail. Druck und E-Mail aus der Anwendung fragen seit UX-012c **nach** und vermerken erst auf Bestätigung; die Auswahl am Termin ist die Nachhut für alles, was die Anwendung nicht sieht, und die Rücknahme (CAL-012, CAL-013, ANN-040). Der Vermerk verfällt automatisch, sobald sich der Termin ändert |
| Termine mitteilen (Zettel und E-Mail)   | `/patienten/:id/terminzettel` (aus dem Terminbereich der Akte) | Datum, Zeit, Ort und behandelnde Person der nächsten bestätigten Termine; kein Status, keine Verordnung, keine Adresse. **Druck** über die Druck-Basis (CAL-011, ANN-039) und **E-Mail als Handoff**: Die Anwendung baut den Entwurf und übergibt ihn dem Mailprogramm der Praxis, gesendet wird dort von Hand — kein Dienstleister, kein automatischer Versand (CAL-013, ANN-041, B15-Nachtrag). Beide Wege **bereiten nur vor**: Der Mitteilungsvermerk entsteht seit UX-012c erst auf die ausdrückliche Bestätigung „ausgehändigt" bzw. „gesendet" (ANN-039 und ANN-041 in Fassung 2) — vorher behauptete er eine Übergabe, die niemand gesehen hat. Der Aufruf wird als Aktenzugriff protokolliert |
| Termin anlegen aus dem Kalender          | Tap auf freie Zeit in `/kalender`, `/termine/neu`       | Zeit und Person aus der Spalte, Patient:in über die Suche (UX-005). Das 60-Minuten-Fenster ist seit CAL-010a serverseitig durchgesetzt |
| Navigation starten (Google Maps, Fahrrad) | Tagesliste `/`, `/termine/:id`                         | Übergibt nur die Anschrift ohne Namen, erst beim Tippen (ADR-019 Punkt 20, ANN-018). Apple Maps und `geo:` kommen mit MAP-005 |
| Patientensuche von jeder Seite          | Kopfleiste, überall                                     | serverseitig ab drei Zeichen, umlautunempfindlich, höchstens 25 Treffer (UX-004). Ein **Fehler** der Abfrage ist seit UX-012a von „Kein Treffer" unterscheidbar; der Treffer merkt sich den Rückweg |
| Rückwege und Abstecher zwischen den Bereichen | überall, Parameter `?zurueck=` | Seit UX-012b trägt ein Weg seinen Rückweg mit: Der Kalender gibt Ansicht, Datum, Person und Filter mit, die Patientensuche ihren Stand. Nur **interne** Pfade werden angenommen (`src/lib/rueckweg.ts`, keine Schemata, kein `//`) und **nie ein Name** in der Adresszeile (ADR-011). Abstecher — „Patient:in anlegen" aus der Terminanlage, „Adresse ergänzen" aus dem Terminformular — legen den Formularstand im Arbeitsspeicher ab und kehren mit ihm zurück (`src/lib/abstecher.ts`, ANN-019: kein `localStorage` für klinischen Freitext) |
| Formularfehler                          | alle langen Formulare                                   | Seit UX-012f steht über den Feldern eine Zusammenfassung mit `role="alert"`, die beim Erscheinen den Fokus aufnimmt (WCAG 3.3.1); jeder Eintrag führt mit Klick, Tap oder Eingabetaste ins Feld. Die Meldung am Feld bleibt daneben stehen. Die Mitarbeiterstammdaten nennen ohne Privatzugriff nur die Felder, die auf der Seite auch stehen (ANN-024) |
| Textbausteine                           | `/praxis/textbausteine`, Dokumentationsformulare        | persönlich oder praxisweit; kein Patientenbezug, keine Platzhalter, kein Sprachmodell (UX-008, ANN-020) |
| Behandlungsdokumentation                | `/termine/:id/dokumentation…`                           | Entwurf, Finalisierung, Korrektur, Nachtrag, Änderungsverlauf (DOK-001/002). Die Sprachdokumentation nach §6.3 ist **entschieden (2026-09-08), aber nicht gebaut** — eigener Auftrag, offen als E13 |
| Dokumentation in der Akte               | `/patienten/:id/verlauf`                                | rollenabhängig projiziert; Office sieht den Behandlungsnachweis ohne klinischen Inhalt (DOK-003). Bis UI-002a stand auf der Übersicht zusätzlich der **letzte** Stand, gelesen aus dem Behandlungsnachweis statt aus der klinischen Sicht; mit dem Bereich ist auch dieser Auszug entfallen (AKTE-004) |
| Verordner:innen                         | `/verordner`, `…/neu`, `…/bearbeiten`                   | Berufliche Kontaktdaten Dritter, kein Patientenbezug (VER-001, ANN-013) |
| Verordnungen in der Akte                | `/patienten/:id/verordnungen`                           | rollenabhängig projiziert; Office sieht Kontingent und Verordner:in ohne Diagnose (VER-002, ANN-011). Seit AKTE-002 getrennt nach **laufend** (ausführlich) und **ausgeschöpft** (eine aufklappbare Zeile); die Zahlen tragen ihre Einheit im Namen: **Leistungseinheiten** aus den Positionen, **Termine** von den Terminen, **Noch planbar** als das, was die Serienplanung anbietet (ANN-012, ANN-038). Die Serie steht nur an einer Verordnung, an der sich noch etwas planen lässt |
| Verordnung erfassen / ändern / löschen  | `/patienten/:id/verordnungen/neu`, `…/:id/bearbeiten`   | nur therapeutische Rollen; serverseitig in `create/update/delete_prescription` (VER-003) |
| Mitarbeiterverwaltung                   | `/praxis/team…`                                         | Liste für alle Praxisrollen; Stammdaten schreiben `owner` und `office`, Beschäftigungsstatus nur `owner` (E10, STAFF-002a). Privatdaten werden `office` weder geliefert noch von ihm geschrieben (ANN-024) |
| Zugänge und Rollen                      | `/praxis/team/:id`, Abschnitt „Zugang"                  | nur `owner`: einladen, Rollen ändern, sperren, Kennwort zurücksetzen. Das Konto selbst entsteht beim Anmeldedienst; ohne offene Einladung bleibt es zugriffslos (STAFF-002b/c, STAFF-003, ANN-025) |
| Mein Konto                              | `/mein-konto`                                           | jede angemeldete Rolle: Kennwort, zweiter Faktor (TOTP), alle Sitzungen beenden. MFA für `owner` ist empfohlen, nicht erzwungen (STAFF-004, ANN-028) |
| Arbeitszeiten und Raster                | `/praxis/planung`                                       | im Menü jetzt unter „Organisatorisches"          |
| Auditansicht                            | `/praxis/sicherheit/audit`                              | nur `owner`; kennt seit DOK-004 einen Systemakteur |
| Aufbewahrung und Löschung                | `/praxis/sicherheit/aufbewahrung`                       | nur `owner`, reine Lesesicht: Aufbewahrungsplan je Datenklasse, laufende Löschsperren, Löschjournal. Fristen ändern sich über eine Migration, nicht über die Oberfläche (LOE-002b, ADR-008). Eine Pflegeoberfläche für Löschsperren gibt es bewusst nicht (Komfort, ANN-033) |
| Abschluss der Versorgung                 | `/patienten/:id/stammdaten`, Abschnitt „Verwaltung"     | `owner`, `therapist`, `team_lead`: Abschluss festhalten und zurücknehmen. Startet die zehnjährige Aufbewahrung (§630f BGB) und ist etwas anderes als der organisatorische Status (LOE-001b, ANN-032) |
| Verbindungsanzeige und Textverlust-Schutz | überall (App-Gerüst), Dokumentationsformulare          | erscheint nur bei getrenntem Gerät; in den Dokumentationsformularen zusätzlich eine Browserwarnung vor dem Verlassen mit ungespeichertem Text und der Hinweis neben den Schaltflächen. **Kein lokaler Zwischenspeicher** (UI-000, UX-009, ANN-015). Seit FIX-011 hält der Schutz auch **jede Navigation innerhalb der Anwendung** an — Hauptmenü, Patientenwechsel, „Zurück zum Termin", Browser-Zurück — und stellt drei Wege zur Wahl: speichern und weitergehen (sichert den **Entwurf**, keine Finalisierung), verwerfen und weitergehen, hier bleiben. Ein Fehlschlag beim Speichern behält Text und Seite. Dafür ist der Router seit FIX-010 ein Data Router (`createBrowserRouter`, eine Platzhalterroute; die Routentabelle selbst ist unverändert) — ANN-046. **Nicht erfasst: „Abmelden"**, das ist keine Navigation |
| Übersicht – Tagesliste des Hausbesuchstags | `/`                                                   | „Offen heute" mit Anschrift, `tel:`-Link und Zugangshinweis aus dem eigenen Lesepfad `list_day_plan`; der Tagesplan des Teams liest weiter den Kalender und bekommt **keine** Adressen (UX-001). Die zuletzt geladene Liste bleibt bei einem Funkloch lesbar und als älterer Stand gekennzeichnet — kein Offline-Modus (UX-011, ANN-021) |
| Termine der Akte mit Historie           | `/patienten/:id/termine`                                | kommende und vergangene Termine über `list_patient_appointments`, **alle Zustände einschließlich abgesagter**, geblättert über einen Keyset-Cursor; Filter auf eine Verordnung über `?verordnung=`; jeder Serientermin nennt seine Verordnung. „Im Kalender zeigen" übergibt Patient:in und den Tag des nächsten Termins (AKTE-003) |
| Von der Verordnung in den Kalender      | Akte → Verordnungen → „Im Kalender einen Platz suchen"   | Der zweite Weg neben der Terminserie (CAL-015c, ANN-050): Tagesansicht mit Patientenfilter, Patient:in **und** Verordnung reisen im Kalenderstand mit. Ein Tap auf eine freie Stelle führt direkt in das Terminformular dieser Person — ohne zweite Suche —, der Termin kennt seine Verordnung, und „Abbrechen" kehrt an dieselbe Stelle im Kalender zurück. In der Adresse stehen Kennungen, nie ein Name (ADR-011) |
| Patientenfilter im Kalender             | `/kalender?patient=…`                                   | blendet im Gitter alles andere aus und sagt das mit einem Weg zurück in die Akte. Wirkt in der **Darstellung**, nicht im Lesepfad: Der Kalender liest den Ausschnitt ohnehin vollständig, und sichtbar ist, was die RLS liefert (AKTE-003). In der Adresse steht die Kennung, nie der Name (ADR-011) |
| Einheitliche Seitenbreite               | überall (App-Gerüst)                                    | seit UI-001 (2026-09-11) nutzt jede Seite die volle Fensterbreite. Vorher bekam allein der Kalender die breite Spalte, und das Gerüst sprang beim Wechsel. Die Lesbarkeit hängt jetzt an der Zeilenlänge (`max-w-prose` für Fließtext, `max-w-xl` für Formulare), nicht an der Seitenbreite |
| Wortmarke als Weg zur Startseite        | Kopfzeile, überall                                      | Klick auf „Own Motion" führt nach `/` |
| Marke Own Motion                        | überall (Kopfzeile, Anmeldemaske, Favicon)              | **entschieden und gebaut (2026-09-10)**: Wortmarke in Kopfzeile und Anmeldemaske, Favicon und App-Symbol, Akzent auf `#004429`. Quelle ist `marke/`, Auslieferung über byte-gleiche Kopien in `public/marke/` (`src/marke.test.ts`). Die Kopfzeile zeigt **nicht mehr** den Organisationsnamen (ANN-023). Offen bleiben: Favicon bei 16 px unlesbar, App-Symbole nur als PNG (beides `marke/README.md`, „Befunde"), Logo auf der Rechnung (ABR-000), Schrift und Radien |

## 2. Vorschau

Bedienbar mit synthetischen Daten. Jede Seite trägt oben den Hinweis
„noch keine echte Speicherung"; jede Aktion meldet, was übernommen wurde **und
was ausdrücklich nicht passiert ist**. Der Stand liegt ausschließlich im
Arbeitsspeicher der Sitzung — ein Neuladen setzt ihn zurück. Was in einer
Sitzung simuliert wurde, steht unter `/vorschau/protokoll`.

| Bereich                  | Route                         | Aus der Vorlage übernommen                                                                                                                                    |
| ------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Radflotte                | `/betrieb/flotte`             | Liste nach Depot, Suche, Status- und Tagesfilter, Wochenübersicht, Schlüsselstand, Verläufe für Schlüssel/Panne/Check-Up, Vertretungshinweis, Standortwarnung |
| Rad anlegen / bearbeiten | `/betrieb/flotte/rad/:id`     | alle Felder der Vorlage inklusive Wochenplan, Ersatzrad, Sonderstandort, Schlüsselcode                                                                        |
| Schlüsselentnahme        | `/betrieb/flotte/schluessel`  | Radauswahl, Name, Bestätigung, Verlauf                                                                                                                        |
| Fahrrad-Check-Up         | `/betrieb/flotte/checkup`     | Prüfpunkte mit drei Bewertungen und Notiz, Gesamtnotiz, Fotos, Erklärung, Unterschrift                                                                        |
| Pannenassistent          | `/betrieb/flotte/panne`       | vollständige Schrittfolge mit allen Verzweigungen, Rückweg, Zusammenfassung und den verschiedenen Abschlüssen                                                 |
| Urlaub                   | `/betrieb/urlaub`             | Antrag, Wochenübersicht, offene Anträge, Genehmigung und Ablehnung mit Unterschrift, Überschneidungswarnung, Resturlaubsanzeige                               |
| Zeitkonto                | `/betrieb/zeitkonto`          | Buchungen geleistet/abgebaut mit Datum, Grund und laufendem Saldo je Person                                                                                   |
| Erstattungen             | `/betrieb/erstattungen`       | Strom und Einkauf, IBAN, Zeitraum, Arbeitstage mit Berechnung, Positionen mit Summe, Belege, Erklärung, Unterschrift, Historie je Person                      |
| Kommunikation            | `/team`                       | eigene Anforderung: Kanäle, Direktnachrichten, Threads, Erwähnungen, Ungelesenes, Suche                                                                       |
| Touren                   | `/touren`                     | eigene Anforderung: Besuchsfolge mit unterscheidbarer Behandlungs- und Wegzeit                                                                                |
| Abrechnung               | `/abrechnung` und Unterseiten | eigene Anforderung: Rechnungen, Leistungen, Katalog, Zahlungen                                                                                                |

### Entfallen: Teamverzeichnis und Personalakte

Beide waren in diesem Umbau als Vorschau angelegt. Beim Zusammenführen mit
`main` sind sie ersatzlos entfallen: STAFF-001 liefert die
Mitarbeiterverwaltung unter `/praxis/team` **echt** — mit RLS, Audit und der
Zusicherung, dass `office` die geschützten Privatangaben gar nicht erst
ausgeliefert bekommt. Eine synthetische Personalakte daneben wäre eine zweite
Personenverwaltung gewesen, und ein Verzeichnis mit erfundenen Kontaktdaten
eine vorgetäuschte Funktion.

Was die Vorlage dort zeigte und STAFF-001 heute nicht hat — Eintrittsdatum,
Urlaubsanspruch, Resturlaub, Notfallkontakt, interne Notiz — steht als
`IDEA-QSN-010` im Ideenspeicher, nicht als Attrappe im Code.

### Was in der Vorschau technisch ausgeschlossen ist

Der Vorschaucode enthält keinen Datenbankzugriff, keinen Netzwerkaufruf und
keine Persistenz. Das ist nicht nur Absicht, sondern geprüft:
`src/features/preview/trennung.test.ts` scannt die Vorschaubereiche auf
`getSupabase`, `fetch`, `localStorage` und Vergleichbares.
`src/features/preview/ehrlichkeit.test.tsx` prüft an den heikelsten Stellen,
dass keine Erfolgsmeldung behauptet wird, die es nicht gibt.

## 3. Offen

Sichtbar platziert, aber fachlich noch nicht entschieden. Die Ansichten
benennen die offene Frage, statt sie zu verstecken.

| Offener Punkt                                             | Wo sichtbar             | Quelle                           |
| --------------------------------------------------------- | ----------------------- | -------------------------------- |
| Endgültige Fakturierung erst nach Finalisierung — die Finalisierung selbst ist entschieden und gebaut (ADR-016, DOK-002/DOK-004); offen ist die Kopplung an die Leistungserfassung (ABR-002) | Abrechnung → Leistungen | `PROJECT_PRINCIPLES.md` §19      |
| Kartendienst: Zielarchitektur und Kandidat entschieden (ADR-019 Fassung 2, 2026-09-08: MapLibre, serverseitiger Adapter, PTV Developer zur Erprobung); offen bleibt die produktive Freigabe am Vertrags-/§203-/DSFA-Gate | Touren                  | §3.5, §9, `OPEN_DECISIONS.md` B7, ADR-019, `MAP-LOOPS.md` |
| Aggregierte Auswertungen über Beschäftigte                | Zeitkonto               | §20, `OPEN_DECISIONS.md` B6      |
| Speicherfrist des Teamchats, Anhänge, klinische Zuordnung | Kommunikation           | §10, §18                         |
| Aufbewahrung und Löschung von Beschäftigtendaten          | nicht mehr sichtbar — die Vorschau-Personalakte ist entfallen; der Punkt bleibt offen (`IDEA-QSN-010`) | ADR-008                          |
| Aufbewahrung von Belegen, Bestätigung der Auszahlung      | Erstattungen            | ADR-008, ADR-009                 |
| Tübinger Werkstatt, Ruhetag, Depot, Transportoptionen     | Pannenassistent, Flotte | Standortvorlage, ungeprüft       |
| Fahrpuffer zwischen Hausbesuchen: woher die Fahrzeit kommt, Warnung oder Sperre — die Rechenregel selbst ist entschieden (§8.1: erster Rasterpunkt auf oder nach Ende plus Fahrzeit) | Kalender, Termin anlegen | §8.1, `OPEN_DECISIONS.md` E12    |

Diese Punkte blockieren die davon abhängigen **echten** Aktionen. Sie blockieren
nicht, dass ihre gekennzeichneten Ansichten schon stehen.

## 4. Begründet abweichend von der Team-App-Vorlage

| Vorlage                                                                   | Hier                                                                 | Begründung                                                                                                             |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Zugriff auf geschützte Angaben über eine PIN im Quelltext                 | Rolle des angemeldeten Kontos                                        | Eine PIN im Browser ist keine Zugriffskontrolle. Individuelle Konten sind Pflicht (§3.2, §4.7).                        |
| Eigene Mitarbeiterliste in der Radflotte für die Stammnutzer              | Auswahl aus dem gemeinsamen Mitarbeiterstamm                         | Keine zweite Personenverwaltung; Freitext ordnet ein Rad einer nicht existierenden Person zu.                          |
| Erstattung mit den Ständen „offen" und „erstattet"                        | eingereicht → genehmigt → ausgezahlt, dazu abgelehnt                 | Einreichen, Entscheiden und Auszahlen sind verschiedene Vorgänge. „Genehmigt" heißt nicht „bezahlt".                   |
| Nach jeder Urlaubsgenehmigung eine E-Mail zur Terminplansperre            | Die genehmigte Abwesenheit selbst wirkt auf Kapazität und Radplanung | Geht eine Nachricht verloren, muss die Sperre trotzdem stimmen. Doppeltes Auslösen erzeugt keine doppelte Abwesenheit. |
| Betriebliche Kontakte, Ansprechpartner, Tiefgaragen-Passwort im Quelltext | Standortvorlage mit Platzhaltern, Zugangscode gar nicht hinterlegt   | Keine Secrets im Repository (§3.3); Kölner Angaben sind für Tübingen nicht geprüft.                                    |
| Namentliche Zuständigkeit im Pannenablauf                                 | Rolle („Teamleitung")                                                | Ein Ablauf soll einen Personalwechsel überleben.                                                                       |
| E-Mail-Versand bei Check-Up-Problemen                                     | kein Versand, Hinweis auf den offenen Meldeweg                       | Ein vorgetäuschter Versand ist schlimmer als gar keiner.                                                               |
| Push-Benachrichtigung über einen externen Dienst                          | nicht übernommen                                                     | Neuer Dienstleister ohne fachliche Notwendigkeit und ohne Prüfung nach §3.5.                                           |
| Unterschrift ausschließlich als Zeichenfeld                               | zusätzlich Namenseingabe als gleichwertiger Weg                      | Ein reines Zeichenfeld ist mit Tastatur nicht bedienbar.                                                               |

## 5. Was nicht Teil dieses Umbaus war

- Kein Routingdienst, kein KI-Planer, keine automatische Tourenoptimierung.
- Keine neue Abhängigkeit, kein neues Designsystem, kein Service Worker
  ([ADR-015](../adr/ADR-015-initial-technical-stack.md)).
- Keine Datenbankmigration. Die Vorschaubereiche legen bewusst noch keine
  Tabellen und keine Schnittstellen fest ([ADR-014](../adr/ADR-014-foundational-data-model.md)).
- Keine Änderung an RLS, Audit oder Rollen.
- Die Go-live-Blocker aus `docs/DEVELOPMENT.md` bestehen unverändert fort.

## 6. Reihenfolge

Was als Nächstes gebaut wird, steht ausschließlich in
[`ROADMAP.md`](ROADMAP.md) — diese Liste führt keine zweite Reihenfolge. Die
beiden Voraussetzungen aus der früheren Liste an dieser Stelle sind erledigt:
der Mitarbeiterstamm ist echt angebunden (STAFF-001), die
Dokumentationsentscheidung ist getroffen und umgesetzt (ADR-016, DOK-001 bis
DOK-004).

Die Vorschaubereiche aus Abschnitt 2 sind seit dem 2026-09-05 in der Roadmap
als **Spur A2 „Praxisbetrieb"** eingeordnet — Urlaub, Zeitkonto, Radflotte,
Erstattungen, Teamkommunikation. Sie beginnt nach dem ersten Betriebsmonat
(M6, Stufe 2). Die Vorschau **Touren** ersetzen die Loops MAP-002 bis
MAP-006 (Etappe T, `MAP-LOOPS.md`, seit MAP-001 am 2026-09-08): Karte der
Tagesroute, Fahrradroute, Fahrzeiten, Navigations-Handoff, Tourenliste.
MAP-002 bis MAP-005 sind Prototypen mit synthetischen Daten und laufen als
**gekennzeichnete Vorschau** unter `/touren/karte`; MAP-006 bindet die echten
Termine an und ersetzt `/touren`. Bis dahin gelten drei Regeln: keine neue
Vorschau, keine Erweiterung einer Vorschau, und jede Vorschau wird in ihrem
Loop ersetzt, nicht daneben gebaut. Die Kartenprototypen sind die eine
bewusste Ausnahme von der ersten Regel — sie sind in der Roadmap eingeplant
und tragen ihre Kennzeichnung.

Ablaufkarten unter `docs/development/ablaeufe/` **messen** den Stand eines
Bereichs nach [`OPTIMIERUNG.md`](OPTIMIERUNG.md); die Reihenfolge bleibt
allein Sache der Roadmap.
