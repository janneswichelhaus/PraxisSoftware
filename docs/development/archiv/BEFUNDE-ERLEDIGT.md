### BEF-046 — Ein gescheitertes Nachladen des Profils ersetzt die laufende Anwendung

|         |                                                                                                                                                                                                                                                                    |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Datum   | 2026-09-27                                                                                                                                                                                                                                                         |
| Bereich | Rahmen aller Seiten hinter der Anmeldung (`App.tsx`): Vollseite „Zugang nicht vollständig eingerichtet“                                                                                                                                                            |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390/820/1440 px, Gegenprüfung; Review-IDs AUTH-02, ZST-01, dazu NAV-12                                                                                                                                           |
| Status  | erledigt 2026-10-10 (UX-EPIC-006, UX-006b): Nachladefehler lässt die Anwendung stehen, Zeile im Rahmen mit „Erneut versuchen“; Erstladen als Vollseite mit „Erneut versuchen“; ebenso der Plattformzugang |
| Berührt | `src/app/App.tsx` (Z. 101–121), `src/features/session/useCurrentUser.ts` (`staleTime`, `retry: false`), `src/features/scheduling/SchedulingPage.tsx` (Z. 82); §13; ANN-021, ANN-044, ANN-046; Oberflächen-Checkliste Punkt 5; ADR-013 Punkt 9 (Sitzungen); BEF-070 |

**Beobachtung.** `App.tsx:104` ersetzt die Anwendung bei `isError || !user`
durch eine Vollseite, deren einziger Knopf „Abmelden“ ist. `isError` wird aber
auch wahr, wenn das Profil längst geladen ist und nur ein **Nachladen**
scheitert. Nachgeladen wird nach jedem Wieder-online, sobald das Profil älter
als fünf Minuten ist, und nach „Raster speichern“; die Anwendung selbst
wiederholt die Abfrage nicht (`retry: false`), die Datenbankbibliothek versucht
es nur kurz dreimal. Im Browser zweimal nachgestellt (therapist und office,
390 px): Nach dem Wieder-online scheitert die Profilabfrage, nach rund 7,6 s
steht „Zugang nicht vollständig eingerichtet – Profil konnte nicht geladen
werden.“ an Stelle der Übersicht. Die vorgehaltene Tagesliste (ANN-021) und ein
halb ausgefülltes Formular sind weg; der Textverlustschutz greift nicht, weil
der ganze Baum abgebaut wird. Erholt sich das Netz binnen rund 7 s, bleibt alles
stehen. Scheitert die Profilabfrage schon beim Start (Serverfehler, keine
Verbindung), erscheint dieselbe Seite mit derselben falschen Ursache (Review
NAV-12); „Abmelden“ löscht dort die Sitzung, und ohne Netz gibt es keine neue
Anmeldung.

Der Kommentar über der Sperre beruft sich auf §13. Dort ist das Blockieren aber
auf schreibende und offenlegende Vorgänge bezogen, und derselbe Abschnitt
verlangt, dass ein Fehler niemals unbemerkt Dokumentation verliert; Checkliste
Punkt 5 verlangt den Schutz ungespeicherter Eingaben „auch bei …
Sitzungsverlust“.

**Frage an Jannes.** Ist ein Profil, das schon geladen war und nur beim
Aktualisieren nicht erreichbar ist, ein unsicherer Zustand, der die ganze
Anwendung sperren muss — oder darf sie weiterlaufen, weil die Datenbank jede
Anfrage ohnehin selbst prüft?

**Optionen.**

1. **Wie heute:** Jede gescheiterte Profilabfrage sperrt. Folge: Nach einem
   Funkloch kann getippter Text verloren gehen; die Seite nennt eine falsche
   Ursache, und ihr einziger Knopf meldet im Funkloch endgültig ab.
2. **Sperren nur ohne geladenes Profil:** Beim Erstladen eine Vollseite „Die
   Anwendung konnte nicht geladen werden“ mit „Erneut versuchen“ als Hauptknopf
   und „Abmelden“ daneben; „kein Profil“ und „Zugang gesperrt“ ersetzen weiter
   sofort. Scheitert nur das Nachladen, bleibt die Anwendung stehen, oben eine
   Statusmeldung „Ihr Profil ließ sich gerade nicht aktualisieren. Eingaben
   bleiben erhalten.“ mit „Erneut versuchen“. Folge: Bis zum nächsten
   erfolgreichen Laden zeigt die Oberfläche womöglich einen älteren Rollenstand;
   Rechte und Sperre prüft die Datenbank weiter bei jeder Anfrage (ADR-004;
   ANN-044: Die Sperre wirkt sofort, weil jede Anfrage `is_active` liest).
3. **Wie 2, zusätzlich Speichern anhalten,** bis das Profil wieder geladen ist.
   Folge: Der Text bleibt im Feld, gespeichert wird erst danach — eine zweite
   Sperre neben der RLS, die kein Recht schützt, das der Server nicht schon
   schützt.

**Empfehlung.** Option 2. Was §13 blockieren will, prüft der Server bei jeder
Anfrage selbst; ein älterer Profilstand in der Oberfläche erweitert kein Recht.
Der stille Verlust getippter Dokumentation ist dagegen genau, was §13
ausschließt. Ein Loop im kritischen Pfad (Sitzungen), zusammen mit festen Sätzen
auf der Erstlade-Seite statt `error.message` und dem Profilweg aus BEF-070.
Test: Ein Nachladefehler lässt `AuthenticatedRoutes` eingehängt; „Zugang
gesperrt“ ersetzt weiter sofort.

**Entscheidung (Jannes, 2026-10-09).** Option 2: Ist das Profil geladen, läuft die Anwendung bei einem gescheiterten Nachladen weiter, mit Statusmeldung und „Erneut versuchen“; nur das Erstladen zeigt eine Vollseite mit „Erneut versuchen“. „Kein Profil“ und „Zugang gesperrt“ ersetzen weiter sofort.

*Erledigt 2026-10-10 (UX-006b):* `App.tsx` ersetzt nur noch ohne geladenes Profil; „Kein Profil“ und „Zugang gesperrt“ ersetzen weiter sofort. Die Zeile steht im Rahmen unter der Verbindungsanzeige (`src/app/Profilhinweis.tsx`, `nachladefehler.ts`), im Gerüst der Plattform unter dem Kopf (ANN-318). Die Erstlade-Seite heißt „Anwendung nicht geladen“ und zeigt einen festen Satz statt `error.message`. Tests: `App.nachladen.test.tsx`, `App.test.tsx`, `uebersicht.spec.ts` (375 und 1280 px).

### BEF-047 — Die Anmeldemaske sagt nie, warum sie erscheint, und am Praxisrechner endet keine Sitzung von selbst

|         |                                                                                                                                                                                                                                                                                                                                                                                            |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Datum   | 2026-09-27                                                                                                                                                                                                                                                                                                                                                                                 |
| Bereich | Anmeldung (jede Adresse ohne Sitzung); Sitzung auf allen Seiten, besonders am Praxisrechner                                                                                                                                                                                                                                                                                                |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390 und 1440 px, Gegenprüfung; Review-IDs AUTH-01, AUTH-03, ZST-23, AUTH-09                                                                                                                                                                                                                                                              |
| Status  | erledigt 2026-10-10 (UX-EPIC-006, UX-006c): Teil 2 (Option 2) gebaut; die Höchstdauer entfällt nach Entscheidung |
| Berührt | `src/features/auth/LoginPage.tsx` (Z. 134–138), `src/features/auth/SessionProvider.tsx` (Z. 74 ff., 85), `src/app/abmeldeschutz.ts` (Z. 23), `src/features/documentation/Textverlustschutz.tsx` (Z. 27–29), `src/lib/supabase.ts` (Z. 21), `supabase/config.toml` (kein Abschnitt `[auth.sessions]`); §3.4, §13; ANN-044, ANN-045; OPS-001; ADR-013 Punkt 9 (Authentifizierung, Sitzungen) |

**Beobachtung.**

- **Funkloch wie falsches Kennwort.** Die Anmeldeseite wertet jeden
  zurückgegebenen Fehler als falsche Eingabe. Die Anmeldebibliothek wirft bei
  Netzfehlern nicht, sie gibt einen eigenen Fehler zurück
  (`AuthRetryableFetchError`); der vorgesehene Satz „derzeit nicht erreichbar“
  erscheint deshalb nie. Im Browser mit abgebrochener Anfrage (390 px):
  „Anmeldung nicht möglich. Bitte E-Mail-Adresse und Kennwort prüfen.“ —
  wortgleich mit einem falschen Kennwort; ebenso bei „zu viele Versuche“ und bei
  leeren Feldern.
- **Fremdes Sitzungsende ohne Satz.** Endet die Sitzung von außen — Abmelden in
  einem zweiten Tab, „Alle Sitzungen beenden“ an einem anderen Gerät, abgelehnte
  Erneuerung —, zeigt die Seite dieselbe Anmeldemaske wie beim ersten Aufruf
  (mit zwei Tabs nachgestellt, office, 1440 px). Ungespeicherte Eingaben sind
  weg; der Abmeldeschutz lässt diesen Fall bewusst durch.
- **Kein Ablauf.** Die Sitzung wird dauerhaft gespeichert und von einem offenen
  Tab stündlich erneuert; eine Höchstdauer ist nicht eingestellt, Abmelden
  bleibt Handarbeit (ANN-045). Der Code kennt die Lage („Auf dem Praxisrechner
  bleibt schnell eine Sitzung stehen“, `KennwortNeuPage.tsx:55`) und behandelt
  sie nur beim Einlösen eines Links. Nur an Code und Konfiguration belegt.

**Frage an Jannes.** (1) Soll eine Sitzung nach einer Höchstdauer von selbst
enden, auch bei offenem Tab? (2) Soll die Anmeldemaske sagen, warum sie
erscheint?

**Optionen.**

1. **Wie heute.** Folge: Eine am Praxisrechner vergessene Sitzung bleibt über
   Nacht und Tage offen; wer als Nächstes kommt, dokumentiert unter fremdem
   Namen, und das Auditlog trägt die falsche Person. Im Funkloch zweifelt man am
   richtigen Kennwort und fordert womöglich eine Rücksetzmail an.
2. **Die Maske erklärt sich:** eigene Sätze für „Keine Verbindung zum
   Anmeldedienst. Ihre Angaben wurden nicht geprüft.“, „Zu viele Versuche. Bitte
   in einigen Minuten erneut versuchen.“ und nach einem Ende von außen „Ihre
   Sitzung wurde beendet. Nicht gespeicherte Eingaben sind nicht erhalten.“ —
   ohne Grund, damit nichts über eine Sperre verraten wird; unbekanntes Konto
   und falsches Kennwort bleiben ununterscheidbar. Folge: Der Verlust wird
   bemerkt; die offene Sitzung am Praxisrechner bleibt.
3. **Wie 2, dazu eine Höchstdauer über den Anmeldedienst** (`timebox` in
   `[auth.sessions]`), keine eigene Sitzungslogik (§3.4). Folge: jeden Morgen
   eine neue Anmeldung, auch am Diensthandy. Das begrenzt eine vergessene
   Sitzung auf einen Tag; gegen die Übergabe am selben Tag hilft weiter nur
   Abmelden. Eine reine Inaktivitätsgrenze genügt nicht, weil ein offener Tab
   sich selbst erneuert, und am Handy im Hintergrund würde sie tagsüber
   abmelden. Ob der Tarif `timebox` bietet, klärt OPS-001; bietet er es nicht,
   bleibt es bei 2.

**Empfehlung.** Option 3 mit etwa 14 Stunden als Startwert — länger als ein
Arbeitstag, kürzer als bis zum nächsten Morgen —, als Annahme registriert.
Beides in einem Loop im kritischen Pfad: Eine Höchstdauer ohne erklärende Maske
erzeugte genau das unerklärte Sitzungsende, das Option 2 behebt. Den Sonderfall
„Seite startet ohne Netz mit abgelaufenem Zugriffstoken“ (dann erscheint die
Maske, obwohl eine Sitzung gespeichert ist, `SessionProvider.tsx:85`) nimmt der
Loop nur mit eigenem Zweitreview mit.

**Entscheidung (Jannes, 2026-10-09).** Option 2: Die Anmeldeseite nennt die Ursache (keine Verbindung, zu viele Versuche, Sitzung von außen beendet); falsches Kennwort und unbekanntes Konto bleiben ununterscheidbar. Die Höchstdauer (Option 3) entfällt: Die vergessene Sitzung am Praxisrechner begrenzt seit SEC-EPIC-001 die Sitzungssperre nach ADR-025.

*Erledigt 2026-10-10 (UX-006c):* Eigene Sätze für keine Verbindung, Störung des Dienstes (5xx) und zu viele Versuche (`src/features/auth/anmeldefehler.ts`); falsches Kennwort, unbekanntes und unbestätigtes Konto bleiben ein Satz; leere Felder gehen nicht zum Dienst. Ein Sitzungsende von außen meldet der `SessionProvider` (`endeVonAussen`), eigene Abmeldewege setzen einen Merker (`eigeneAbmeldung.ts`); die Maske sagt es ohne Grund. Die Sperrseite nutzt dieselbe Unterscheidung. Der Sonderfall „Start ohne Netz mit abgelaufenem Zugriffstoken“ bleibt außen vor.

### BEF-070 — Unerwartete Serverantworten erscheinen als englischer Prüftext

|         |                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-27                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Bereich | Akte → Dateien und Fotos; Organisatorisches → Sicherheit → Aufbewahrung (Löschaufträge); Therapiebericht; Erhebung; Start der Anwendung (Profil)                                                                                                                                                                                                                                                                                  |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Gegenprüfung (nicht im Browser ausgelöst); Review-ID WRT-20                                                                                                                                                                                                                                                                                                                                 |
| Status  | erledigt 2026-10-10 (UX-EPIC-006, UX-006a): alle neun Wege über `antwort()`, je Modul ein Test mit verfälschter Antwort |
| Berührt | `src/lib/antwort.ts`; `src/features/files/api.ts` (Z. 141, 230, 327), `src/features/files/patientenfotos.ts` (Z. 101, 140), `src/features/files/dateien.ts` (Z. 162), `src/features/therapy-reports/api.ts` (Z. 200, 225), `src/features/assessments/api.ts` (Z. 90), `src/features/session/useCurrentUser.ts` (Z. 63); R3-023; ADR-008; ADR-013 Punkt 9 (Löschpfad, Sitzungen); Oberflächen-Checkliste Punkt 6; BEF-010, BEF-046 |

**Beobachtung.** Seit R3-023 gibt es `antwort(schema, data, satz)`: Passt eine
Serverantwort nicht zum erwarteten Schema, wirft sie einen deutschen Satz statt
des Prüffehlers, dessen Meldung englisches JSON ist
(`[{"code":"invalid_type" …`). Benutzt wird sie nur in
`features/appointments/api.ts`. Neun Wege prüfen die Antwort direkt, und ihre
Seiten zeigen die Meldung wörtlich: Datei hinzufügen und öffnen, Löschauftrag,
Foto öffnen und herausgeben, Therapiebericht anlegen und speichern, Erhebung
speichern, Profil beim Start. Das tritt nur bei einer abweichenden Antwort auf —
etwa nach einer Datenbankänderung, die eine Oberfläche nicht nachgezogen hat
(das Muster aus BEF-010). Zwei der neun Stellen liegen im Löschpfad (ADR-008)
und im Sitzungsprofil; die kleine Änderung ist damit eine kritische nach ADR-013
Punkt 9.

**Frage an Jannes.** Kein fachlicher Inhalt ist offen, nur der Weg: eigener
kleiner Loop oder je Spur, wenn ein Loop das Modul ohnehin anfasst?

**Optionen.**

1. **Je Spur mitnehmen,** wenn ein Loop Dateien, Bericht oder Erhebung anfasst.
   Folge: Bis dahin bleibt Entwicklertext im Bedienbildschirm möglich; drei
   Zweitreviews statt einem.
2. **Ein kleiner Loop für alle neun Wege** im kritischen Pfad, je Modul ein Test
   mit verfälschter Antwort (Muster `appointments/api.antwort.test.ts`); der
   Profilweg gemeinsam mit BEF-046. Folge: ein Zweitreview, danach überall ein
   deutscher Satz, der sagt, was zu tun ist.

**Empfehlung.** Option 2 — die Änderung ist klein, und der Löschpfad soll
ohnehin nicht nebenbei angefasst werden.

**Entscheidung (Jannes, 2026-10-09).** Option 2: ein kleiner Loop für alle neun Wege, gemeinsam mit BEF-046.

*Erledigt 2026-10-10 (UX-006a):* Dateien, Fotos, Löschauftrag, Therapiebericht, Erhebung und Profil prüfen ihre Antwort über `antwort()`; die Lesewege derselben Module gleich mit. Tests: `files/api.antwort.test.ts`, `therapy-reports/api.antwort.test.ts`, `assessments/api.antwort.test.ts`, `session/useCurrentUser.antwort.test.tsx`.



### BEF-138 — Abruf freigegebener Dokumente über die Plattform nicht protokollieren

|         |   |
| ------- | - |
| Datum   | 2026-10-09 |
| Bereich | Plattform, Unterlagen; Protokoll |
| Quelle  | Jannes, Abnahme der Annahmen am 2026-10-09 (ANN-249) |
| Status  | erledigt 2026-10-10 (BEF-138: ADR-010 Fassung 4 Punkt 22, ADR-023 Fassung 3, Prinzipien 0.23, Migration `20261022100000_bef_138_platform_file_retrieval.sql`) |
| Berührt | ANN-249; ADR-023 Punkt 24 („jeder Dokumentabruf“); ADR-010 Punkt 16; `PROJECT_PRINCIPLES.md` §4 (Protokollkatalog); Audit-Aktion `patient_file.downloaded` über die Plattform; Workflow `audit-katalog.yml` |

**Beobachtung.** Ruft eine Person ein freigegebenes Dokument über die Plattform ab, entsteht ein Auditeintrag `patient_file.downloaded` (wer, welches Dokument, wann).

**Erwartet** (Jannes, 2026-10-09): Dieser Abruf wird nicht protokolliert. Die Freigabe selbst und Abrufe durch Praxisrollen bleiben, wie sie sind.

Das ist eine Änderung der Protokollierung nach ADR-010: Der Loop schreibt die neuen Fassungen von ADR-023 Punkt 24, ADR-010 und des Protokollkatalogs in §4, entfernt den Eintrag in `supabase/migrations/20261010160000_por_014_platform_files.sql` per neuer Migration und passt die Tests an, die ihn heute verlangen. Der Pull Request braucht vor dem Merge das Label `freigabe-audit`, das nur Jannes setzt.

*Stand 2026-10-09 (ABN-EPIC-002):* nicht in diesem Loop gebaut – er braucht einen eigenen Branch und Pull Request, die Session durfte nur auf ihren einen Branch pushen. Nächster Einzel-Story-Loop.

*Erledigt 2026-10-10 (Einzel-Story-Loop BEF-138):* `issue_platform_file_link` schreibt keinen Eintrag `patient_file.downloaded` mehr. Eine Vertretung liest damit höchstens einmal am Tag (`platform_representation.read`, ADR-010 Punkt 22), von Jannes in der Session bestätigt. Die Aktionsmenge ist unverändert, das Label `freigabe-audit` setzt Jannes als Freigabe der Änderung.

### BEF-061 — Die Rechnungsliste endet stumm bei 100 Rechnungen, es gibt keine Suche, und am Rechner sind Rechnungen gestreckte Handy-Karten

|         |                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-27                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Bereich | Abrechnung (`/abrechnung`): Rechnungen, Offene Posten, Zahlungen, erfasste Leistungen; Rechnung und Druckblätter bei 1440 px                                                                                                                                                                                                                                                                                                             |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390 und 1440 px, Gegenprüfung; Review-IDs ABR-02, ABR-32                                                                                                                                                                                                                                                                                                                               |
| Status  | entschieden 2026-10-05 (Jannes), Option 1 und 3 — erledigt mit ABR-033/034 (2026-10-06: Suche, Filter, Monat, Weitere laden, Gesamtzahl in allen drei Listen, Spalten ab 1024 px; ANN-259) |
| Berührt | `src/features/billing/api.ts` (`list_invoices`, `list_open_items`, `list_payments` mit `p_limit: 100`), `src/features/billing/InvoicesPage.tsx` (Z. 130–134, 201, 249, 354), `src/features/billing/InvoiceDetailPage.tsx` (Z. 165), `src/features/billing/InvoicePrintPage.tsx` (Z. 78–85, 323), `list_invoices` (Migration `20260923120000_abgewiesene_lesezugriffe_rest.sql`); ANN-061; ADR-009; ADR-013 Punkt 9 (RPC, Rechnungsdaten) |

**Beobachtung.**

- **Obergrenze.** Die Liste lädt höchstens 100 Rechnungen, Entwürfe zuerst, dann
  nach Monat absteigend. Die Seite sagt nicht, dass gekürzt ist, und bietet
  weder Suche (Nummer, Name) noch Filter (Entwurf, offen, überfällig, storniert)
  noch Blättern. Eine Rechnung ist sonst nirgends erreichbar — nicht aus der
  Akte und bewusst nicht über die Kopfsuche (ANN-061). Offene Posten und
  Zahlungen enden ebenso bei 100, erfasste Leistungen bei 200. Der Hinweis unter
  „Offene Posten“ nennt die gekürzte Anzahl, aber die ungekürzte Summe. Sobald
  mehr als 100 Rechnungen bestehen — bei monatlicher Abrechnung je Person nach
  wenigen Monaten —, verschwinden die ältesten ohne Hinweis; Nachdruck, Storno
  oder das Zuordnen eines Zahlungseingangs über die Rechnungsnummer werden dann
  zur Suche von Hand oder unmöglich. Am Code belegt; der Seed hat fünf
  Rechnungen.
- **Am Rechner.** Bei 1440 px stehen Bezeichnung und Betrag rund 1 000 px
  auseinander, jede Rechnungszeile trägt einen eigenen 48-px-Knopf „Rechnung
  ansehen“, die Nummer ist kein Link (unter „Zahlungen“ schon), und unter
  „Abzurechnen“ steht die Summe mitten in der Zeile. Auf den Druckseiten stehen
  „← Zurück“ und „Rechnung drucken“ links außerhalb der Blattkante.

**Frage an Jannes.** Soll die Abrechnung eine Suche und Filter bekommen — und
bis dahin wenigstens sagen, dass die Liste gekürzt ist? Und soll sie am Rechner
als kompakte Liste erscheinen?

**Optionen.**

1. **Nur ehrlich machen:** Ist die Grenze erreicht, steht „Es werden die 100
   zuletzt abgerechneten Rechnungen gezeigt.“; unter „Offene Posten“ nur die
   Summe. Folge: reine Anzeige, sofort möglich; ältere Rechnungen bleiben
   unerreichbar.
2. **Suche und Filter auf dem Server:** Suche nach Nummer und Name, Filter nach
   Zustand und Monat, „Weitere laden“ oder Blättern, die Anzahl offener Posten
   vom Server. Folge: geänderte Lesepfade der Abrechnung, also kritischer Pfad
   mit Tests in `pnpm test:db`.
3. **Wie 2, dazu am Rechner eine Listenform:** ab 1024 px kompakte Zeilen, die
   Nummer als Link, der Betrag rechtsbündig in eigener Spalte; Rechnungsbild und
   Druckknöpfe auf Blattbreite. Folge: mehr Umbau, deutlich mehr Überblick am
   Arbeitsplatz des Büros.

**Empfehlung.** Option 1 sofort, Option 3 im nächsten Loop der Abrechnung — vor
dem ersten echten Rechnungslauf, weil die Grenze danach still erreicht wird.

### BEF-114 — Training: Paketpreise für drei oder sechs Monate

|         |   |
| ------- | - |
| Datum   | 2026-10-02 |
| Bereich | Abrechnung im Training |
| Quelle  | Jannes, Abnahme der Annahmen Block 8 (ANN-181) |
| Status  | erledigt 2026-10-07 mit ANG-EPIC-002 (ANG-005 bis ANG-007): Paket als Position der Preisliste, eine Leistung je Paket zum Beginn, Termine im Zeitraum ohne eigene Forderung; Preis, Umfang und Zahlungsweise synthetisch als ANN-275, ANN-276, ANN-279, bis Jannes sie festlegt |
| Berührt | ANN-181 (`app.appointment_is_billable`); ADR-009 Punkt 21 (Trainingspaket); ABR-EPIC-007 |

**Erwartet** (Jannes, 2026-10-02): Langfristig feste Paketpreise für drei oder sechs Monate Betreuung. Das Terminhonorar der Behandlung (140 €, ADR-009 Punkt 22) wird nicht übernommen. Bei einem Paket entsteht die Forderung aus der Paketvereinbarung; Termine im Paket erzeugen keine weitere Forderung. Preis, Leistungsumfang und Zahlungsweise legt Jannes noch fest; bis dahin bleibt es bei ANN-181 (Leistung aus dem durchgeführten Termin, für Einzelstunden). **2026-10-05:** aus ABR-EPIC-007 herausgelöst, eigener kleiner Loop, sobald die drei Angaben feststehen.

### BEF-133 — PDFs in der Anwendung anzeigen statt nur herunterladen

|         |   |
| ------- | - |
| Datum   | 2026-10-09 |
| Bereich | Akte, Dateien und Dokumente |
| Quelle  | Jannes, Abnahme der Annahmen am 2026-10-09 (ANN-223, Option a) |
| Status  | erledigt in ABN-EPIC-002 (ABN-034, 2026-10-09) |
| Berührt | ANN-223; ADR-017 Punkt 54; Content-Security-Policy der Test-Umgebung |

**Beobachtung.** „Öffnen“ zeigt heute nur JPEG und PNG; ein PDF hat nur „Herunterladen“, weil Chromium ein PDF im abgeschotteten Rahmen nicht zeigt und die CSP keinen Rahmen aus einer Objekt-URL zulässt.

**Erwartet** (Jannes, 2026-10-09): Option (a) – ein PDF öffnet in der Anwendung in einem Rahmen ohne `sandbox` aus einer Objekt-URL mit festem Typ `application/pdf`, CSP mit `frame-src blob:`; der PDF-Betrachter des Browsers läuft in eigenem Ursprung. Vermerk an ADR-017 Punkt 54 als neue Fassung. Einzel-Story-Loop.

### BEF-134 — Den Hinweis aus der Verordnung erfassen alle Praxisrollen außer der reinen Trainingsbetreuung

|         |   |
| ------- | - |
| Datum   | 2026-10-09 |
| Bereich | Akte, Behandlungsgrundlage |
| Quelle  | Jannes, Abnahme der Annahmen am 2026-10-09 (ANN-214) |
| Status  | erledigt in ABN-EPIC-002 (ABN-031, 2026-10-09) |
| Berührt | ANN-214; `treatment_bases.prescriber_note` |

**Beobachtung.** Den behandlungsrelevanten Hinweis aus der Verordnung erfassen heute nur die behandelnden Rollen in der Akte.

**Erwartet** (Jannes, 2026-10-09): Jede Praxisrolle darf ihn erfassen und ändern, auch das Büro – nur eine Person, die ausschließlich die Trainingsbetreuung hat, nicht. Der Änderungspfad steht in ANN-214 (`app.can_write_treatment_bases()`).

### BEF-135 — Fotos aus der Dokumentation ohne Rückfrage; Erinnerung an Anmeldebogen und Rezept

|         |   |
| ------- | - |
| Datum   | 2026-10-09 |
| Bereich | Akte, Fotos und Dokumente |
| Quelle  | Jannes, Abnahme der Annahmen am 2026-10-09 (ANN-221) |
| Status  | erledigt in ABN-EPIC-002 (ABN-032, 2026-10-09) |
| Berührt | ANN-221; ADR-017 (Punkt 44 und die Fotoart „Arbeitshilfe“); `src/features/files/FotosImVerlauf.tsx` |

**Beobachtung.** Vor jeder Aufnahme fragt die App „Wofür ist das Foto?“: Teil der Dokumentation (zehn Jahre) oder Arbeitshilfe mit Einwilligung (höchstens zwölf Monate).

**Erwartet** (Jannes, 2026-10-09):
- Ein Foto, das aus der Dokumentation heraus entsteht, ist immer Teil der Dokumentation; es wird nicht gefragt.
- An das Foto vom Anmeldebogen und vom Rezept erinnert die App automatisch an der passenden Stelle; dort ist der Zweck ebenfalls klar.
- Andere Zwecke gibt es nicht. Die Arbeitshilfe mit Einwilligung entfällt.

Das widerspricht ADR-017 in der heutigen Fassung (zwei Fotoarten, Wahl vor dem Kamerastart). Der Loop schreibt zuerst die neue Fassung von ADR-017 nach Jannes' Entscheidung und baut dann; bestehende Daten der Fotoart „Arbeitshilfe“ gibt es nur synthetisch.

### BEF-136 — Lückenfinder auch für 45 Minuten, 60 bevorzugt

|         |   |
| ------- | - |
| Datum   | 2026-10-09 |
| Bereich | Kalender, Lückenfinder |
| Quelle  | Jannes, Abnahme der Annahmen am 2026-10-09 (ANN-239) |
| Status  | erledigt in ABN-EPIC-002 (ABN-033, 2026-10-09) |
| Berührt | ANN-239; `useLueckenfinder` |

**Beobachtung.** Der Lückenfinder rechnet fest mit 60 Minuten Termindauer.

**Erwartet** (Jannes, 2026-10-09): 45 Minuten sind ebenfalls eine mögliche Termindauer. Bevorzugt werden immer 60 Minuten: Eine Lücke, die nur für 45 Minuten reicht, ist erkennbar als solche gekennzeichnet.

### BEF-137 — Das Büro liest alle Informationen, auch im Training

|         |   |
| ------- | - |
| Datum   | 2026-10-09 |
| Bereich | Rollen, Training, Übungen und Pläne |
| Quelle  | Jannes, Abnahme der Annahmen am 2026-10-09 (ANN-287, ANN-293, ANN-298; allgemeine Regel) |
| Status  | erledigt in ABN-EPIC-002 (ABN-030, 2026-10-09) |
| Berührt | `PROJECT_PRINCIPLES.md` §4.3 und Tabelle der Rollen je Bereich; ADR-021 Punkt 10; ADR-004; ANN-287, ANN-293, ANN-298 |

**Beobachtung.** In der Behandlung liest das Büro schon alle klinischen Inhalte (§4.3, E15). Im Training sperren die Grundsätze Gesundheits- und Screeningangaben für das Büro, bis die DSFA sie bewertet; die Übungsbibliothek, Trainingspläne und das Voraussetzungsprofil sind für das Büro nicht sichtbar.

**Erwartet** (Jannes, 2026-10-09), als Regel für alle weiteren Loops:
- Das Büro **liest** alle Informationen, auch im Training: Voraussetzungsprofil, Übungsbibliothek, Trainingspläne und was künftig hinzukommt.
- Es **schreibt** keine klinischen oder Trainingsinhalte (Pläne, Profile, Bibliothek bleiben bei den Fachrollen).
- Jeder lesende Zugriff bleibt protokolliert wie heute (§4.3, ADR-010).
- Mit echten Daten erst, wenn die DSFA es bewertet hat (Anfrage B2, ADR-007).

Die Akte erfährt weiterhin nicht, ob eine Person das Training gebucht hat (ANN-285 bestätigt). Der Loop schreibt zuerst die neue Fassung von §4.3 und ADR-021 Punkt 10 und öffnet dann RLS und Oberfläche, mit Negativfällen in `pnpm test:db` (Büro schreibt nicht).

**Nachtrag (Jannes, 2026-10-09, UX-Review).** Die Regel gilt auch für die Rückfragen im Training (ANN-311: das Büro liest alle, antwortet weiter nur bei „Termin oder Rechnung“; umgesetzt mit ABN-030 über `app.can_read_platform_message`) und für die Instrumente-Bibliothek (BEF-064, eingeplant in UX-EPIC-008). Für Daten über Beschäftigte gilt sie nicht; dort gilt BEF-066.

### BEF-139 — Das Büro antwortet im Training auch auf „Sonstiges“

|         |   |
| ------- | - |
| Datum   | 2026-10-10 |
| Bereich | Kommunikation, Training |
| Quelle  | Jannes, Abnahme ANN-311 Fassung 2 (2026-10-10) |
| Status  | erledigt in BEF-139 (2026-10-10) |
| Berührt | `app.can_answer_platform_message` (KOM-002), `supabase/tests/practice-messages.test.ts` |

**Beobachtung.** Seit BEF-137 liest das Büro im Training alle Rückfragen, antworten und erledigen darf es dort aber nur bei „Termin oder Rechnung“. In der Behandlung antwortet es auch auf „Sonstiges“.

**Entscheidung (Jannes, 2026-10-10).** Eine Regel für beide Bereiche: Das Büro antwortet im Training wie in der Behandlung auf „Termin oder Rechnung“ und „Sonstiges“, nicht auf „Übung“ und „Beschwerden“.

**Erwartet.** Der Zweig `training` in `app.can_answer_platform_message` nimmt `other` auf (eine Migration), dazu der Positiv- und der Negativfall in `practice-messages.test.ts` und die Oberfläche, falls sie die Regel spiegelt. ANN-311 Fassung 3. Einzel-Story-Loop mit `pnpm test:db`.

### BEF-055 — Am Termin schließt „Finalisieren“ einen offenen Besuch mit ab, ohne es zu sagen; dazu drei ähnliche Abschlusswege und zwei Hauptknöpfe

|         |                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-27                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Bereich | Termin (`/termine/:id`): geführter Ablauf „Was ist passiert?“, Abschnitt Behandlungsdokumentation; Schreibseiten der Dokumentation                                                                                                                                                                                                                                                                                                                                         |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390 px, Gegenprüfung; Review-IDs DOK-04, TER-02, dazu DOK-02                                                                                                                                                                                                                                                                                                                                                             |
| Status  | erledigt 2026-10-10 (UX-EPIC-007, UX-007b): Abschluss im Terminfenster vor den Zeilen, „Doku“ einziger Hauptknopf, „Nur Termin abschließen“ eingeklappt, Rollen ohne Doku-Recht „Termin abschließen“ mit Folge; am offenen Hausbesuch kein „Finalisieren“ |
| Berührt | `src/features/documentation/TreatmentNoteSection.tsx` (Z. 103–166, 224), `src/features/appointments/AppointmentDetailPage.tsx` (Z. 637–653, 770, 874, 1013–1050), `src/features/documentation/TreatmentNotePage.tsx` (Z. 168), `src/features/documentation/TreatmentNoteAddendumPage.tsx` (Z. 103), `app.mark_appointment_documented()` (Migration `20260912130000_appointment_documented.sql`); ADR-016 Punkt 4 und 7; ADR-018 Punkt 2 und 9; ANN-036; BEF-006 (AKTE-006) |

**Beobachtung.**

- **Finalisieren.** Steht zu einem Termin ein Entwurf, zeigt der Abschnitt
  „Finalisieren“ als Hauptknopf — auch am noch offenen Termin. Die Rückfrage
  sagt nur, dass der Wortlaut als Version 1 festgeschrieben wird. Die
  Finalisierung setzt den Termin aber auf „dokumentiert“ samt Abschlusszeit
  (ADR-018 Fassung 3, aus ANN-036) — derselbe Doppelschritt, den „Behandlung
  abschließen“ ausdrücklich ansagt („Mit dem Abschluss geschieht zweierlei …“).
  Am Hausbesuch umgeht das „Was ist passiert?“: „Tür geöffnet, nicht behandelt“
  (Pflichtvermerk) und „nicht angetroffen“ (Gebührenanlass) sind danach nicht
  mehr wählbar. Die Rückfrage ist eigens gebaut, der Fokus bleibt auf dem
  Auslöser. Live nachgestellt (390 px, Hausbesuch mit Entwurf). Dasselbe löst
  die automatische Finalisierung zum Fristende aus — dass es sie gibt, sagt die
  Schreibseite nicht; dort steht „Der Eintrag bleibt ein Entwurf; die
  Finalisierung ist ein eigener Schritt am Termin.“ (Review DOK-02).
- **Abschlusswege.** Am Hausbesuch sehen Behandelnde „Dokumentieren und
  abschließen“ (Hauptknopf), „Ohne Behandlung abschließen“, „Niemand
  angetroffen“, darunter „Ohne Dokumentation abschließen“ und im Doku-Abschnitt
  einen zweiten Hauptknopf („Dokumentation anlegen“ bzw. „Finalisieren“). „Ohne
  Behandlung“ und „Ohne Dokumentation“ klingen gleich und haben verschiedene
  Folgen. office und owner ohne Doku-Recht sehen die ersten beiden Szenarien
  ohne Knopf; ihr „Termin abschließen“ steht erst unter der Liste. Der geführte
  Ablauf beginnt bei 390 px erst unter der achtzeiligen Detailtabelle, bei rund
  1 000 px.

**Frage an Jannes.** (1) Darf am offenen Hausbesuch „Finalisieren“ angeboten
werden, oder führt der Weg dort immer über „Was ist passiert?“? (2) Wie heißen
und ordnen sich die Abschlusswege — als Eingabe für AKTE-006 (BEF-006)?

**Optionen.**

1. **Nur die Folge nennen:** Rückfrage-Baustein statt Eigenbau, und am offenen
   Termin der Satz „Der Termin wird dabei als durchgeführt geführt.“ Folge: Die
   Folge steht da (ADR-016 Punkt 4); am Hausbesuch bleibt der Umweg um die drei
   Szenarien möglich.
2. **Am offenen Hausbesuch kein „Finalisieren“,** stattdessen der Verweis auf
   „Was ist passiert?“ bzw. den Abschluss; an Praxisterminen wie 1. Folge: Die
   drei Szenarien aus ADR-018 Punkt 9 lassen sich am Knopf nicht mehr umgehen —
   über die automatische Finalisierung zum Fristende weiterhin.
3. **Wie 2, dazu die Abschlusswege ordnen:** ein Hauptknopf je Ansicht (der
   Doku-Abschnitt nachrangig, solange oben der Abschluss steht), „Ohne
   Dokumentation abschließen“ als „Nur Termin abschließen“ benannt und
   eingeklappt, für Rollen ohne Doku-Recht „Termin abschließen“ mit ehrlicher
   Folge im Szenario, der geführte Ablauf vor der Detailtabelle. Folge: Das ist
   der Zuschnitt aus BEF-006, jetzt mit Messwerten.

**Empfehlung.** Option 3 — den Teil aus 1 sofort, den Rest mit AKTE-006. Den
Hinweis auf die automatische Finalisierung an den Schreibseiten gleich mitnehmen
(„spätestens automatisch mit Ablauf der Dokumentationsfrist der Praxis“); ein
konkretes Datum am Eintrag bräuchte einen geänderten Lesepfad und bliebe eine
eigene Entscheidung.

**Entscheidung (Jannes, 2026-10-09).** Option 3: Am offenen Hausbesuch kein „Finalisieren“, sondern „Was ist passiert?“; je Ansicht ein Hauptknopf, „Nur Termin abschließen“ eingeklappt.

### BEF-056 — Ungesicherter Text: kein Zwischenstand ohne Verlassen, kein Ausweg im Konfliktfall, Nachtrag festschreiben nur über den Termin

|         |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-27                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Bereich | Behandlungsdokumentation (Abschluss, Entwurf, Nachtrag, Korrektur), Therapiebericht, Erhebung (`/patienten/:id/befund/erheben`)                                                                                                                                                                                                                                                                                                                                                              |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390 px, Gegenprüfung; Review-IDs DOK-06, BEF-10, DOK-07, DOK-17                                                                                                                                                                                                                                                                                                                                                                            |
| Status  | erledigt 2026-10-10 (UX-EPIC-007, UX-007a): Entwurf sichert sich nach drei Sekunden Pause von selbst (ANN-319); im Konfliktfall Übernahme als Nachtrag oder in die Korrektur (ANN-320); Nachtrag auf seiner Seite festschreiben, mit Textbausteinen und Ursprung |
| Berührt | `src/features/documentation/Textverlustschutz.tsx` (Z. 31, 112–124, 223), `src/features/documentation/api.ts` (Z. 140–174, 306), `src/features/therapy-reports/api.ts` (Z. 140), `src/features/assessments/ErhebungPage.tsx` (Z. 277–343), `src/features/documentation/TreatmentNoteAddendumPage.tsx` (Z. 91–119), `src/features/documentation/TreatmentNotePage.tsx` (Z. 147–164); ADR-001, ADR-015, ADR-016 Punkt 4, 6, 7 und 9; ANN-015, ANN-046, ANN-120; Oberflächen-Checkliste Punkt 5 |

**Beobachtung.**

- **iPhone.** Beim Neuladen und Schließen verlässt sich der Textverlustschutz
  auf `beforeunload`. Safari auf iOS zeigt dafür nach bekanntem Verhalten keine
  Rückfrage (am Gerät zu bestätigen, hier nicht prüfbar); Wegwischen der App
  oder das Verdrängen im Hintergrund beendet jede Seite still. Ein lokaler
  Zwischenspeicher ist ausgeschlossen (ANN-015, ADR-015) — der Schutz endet
  dort, wo unterwegs am meisten passiert.
- **Erhebung.** Datum, „Abschließen“ und „Als Entwurf speichern“ stehen nur nach
  der letzten Frage (Bogenhöhe 11 315 px), und beide Wege verlassen den Bogen.
  Einen Zwischenstand, ohne den Bogen zu verlassen, gibt es nicht.
- **Konfliktfall.** Die Meldungen raten „Bitte den eigenen Text sichern, die
  Ansicht neu laden …“. Neuladen verwirft den Text; „sichern“ geht am Handy nur
  über Kopieren in die Zwischenablage, die ANN-120 für Gesundheitsdaten meidet.
  Ist der Entwurf inzwischen automatisch finalisiert, lehnt der Server jedes
  Speichern ab; die Rückfrage bietet „Speichern“, das wieder scheitert, sonst
  nur „Verwerfen“. Am Code belegt, nicht nachgestellt (verlangt eine
  Datenänderung).
- **Nachtrag.** Festschreiben geht nur über den Termin: speichern, Termin
  öffnen, zum Abschnitt scrollen, „Finalisieren“, „Ja, jetzt finalisieren“. Beim
  Anlegen fehlt die Bausteinleiste, beim Bearbeiten der Ursprungseintrag. Bleibt
  ein Nachtrag liegen, wird er zum Fristende ungeprüft festgeschrieben (ADR-016
  Punkt 7).

**Frage an Jannes.** (1) Soll ein Entwurf während des Schreibens auf dem Server
gesichert werden, ohne die Seite zu verlassen — auf Knopfdruck oder von selbst?
(2) Soll der Konfliktfall den getippten Text als Nachtrag oder Korrektur
übernehmen können, und soll ein Nachtrag auf seiner eigenen Seite
festgeschrieben werden?

**Optionen.**

1. **Auf Knopfdruck:** „Zwischenstand sichern“ auf Dokumentation, Bericht und
   Erhebung, die Seite bleibt offen, mit Statusmeldung „Als Entwurf gesichert um
   10:42“ (in der Erhebung dazu „23 von 46 beantwortet“ in einer schmalen Leiste
   am unteren Rand). Folge: Verloren gehen kann nur, was nach dem letzten Tipp
   kam; am iPhone hilft es nur, wenn man daran denkt.
2. **Von selbst:** nach einer Pause im Tippen als Entwurf sichern — nur der
   eigene Text, nie ein offener Bausteinvorschlag (ANN-120) —, mit sichtbarem
   Stand. Folge: Der Schutz greift auch am iPhone; Entwürfe entstehen früher und
   laufen früher in die Frist (ADR-016 Punkt 7), es gibt mehr Auditeinträge
   (Punkt 9); ANN-046 („Speichern heißt Entwurf“) wird fortgeschrieben.
3. **Erst messen:** bis zum ersten Feldtag nichts ändern (Wiedervorlage von
   ANN-046) und am iPhone prüfen, ob `beforeunload` wirklich schweigt. Folge:
   Bis dahin bleibt der stille Verlust am iPhone möglich.

Zu (2), unabhängig davon: im Konfliktfall „Als Nachtrag übernehmen“ bzw. „In
Korrektur übernehmen“ mit dem Feldinhalt (ADR-016 Punkt 6), und „Nachtrag
festschreiben“ auf der Nachtragsseite mit dem Folgesatz über dem Knopf (Muster
ADR-016 Punkt 4). Folge: Der Text findet immer einen Weg in die Akte; beides ist
ein neuer Serverweg zur Finalisierung und deshalb nie nebenbei.

**Empfehlung.** Zu (1) Option 2, abgesichert durch die Messung aus 3: Zeigt das
iPhone die Rückfrage doch, reicht Option 1. Zu (2) beides. Ein Loop im
kritischen Pfad. Ohne Entscheidung und sofort: kein „neu laden“, solange Text im
Feld steht; beim Terminkonflikt auf „Nur als Entwurf speichern“ verweisen;
Bausteinleiste auch beim Anlegen eines Nachtrags; Ursprung beim Bearbeiten
zugeklappt. Davon getrennt, ebenfalls ohne Entscheidung: Der Therapiebericht und
mehrere Formulare haben gar keinen Schutz vor Verlust (Review ZST-02, NAV-01).

**Entscheidung (Jannes, 2026-10-09).** Zu (1) Option 2: Der eigene Text wird nach einer Pause im Tippen von selbst als Entwurf gesichert, mit sichtbarem Stand (ANN-046 wird fortgeschrieben). Zu (2) beides: Übernahme in Nachtrag oder Korrektur im Konfliktfall, Nachtrag auf seiner eigenen Seite festschreiben.

### BEF-058 — Der Fotobereich steht vor dem Behandlungsverlauf, auch ohne Einwilligung und ohne Fotos

|         |                                                                                                                                                                                                                                                                                                   |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-27                                                                                                                                                                                                                                                                                        |
| Bereich | Akte → Verlauf (`/patienten/:id/verlauf`), Einstieg „Bisherige Doku“ auf der Tageskarte der Übersicht                                                                                                                                                                                             |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390 und 820 px, Gegenprüfung; Review-IDs DAT-16, DOK-16                                                                                                                                                                                         |
| Status  | erledigt 2026-10-10 (UX-EPIC-007, UX-007c): „Fotos: keine.“ als Zeile, mit Fotos „Fotos (n)“ zum Aufklappen; „Bisherige Doku →“ springt zum Verlauf |
| Berührt | `src/features/documentation/PatientCoursePage.tsx` (Z. 17–21), `src/features/files/FotosImVerlauf.tsx` (Z. 485–563), `src/features/documentation/PatientRecordDocumentation.tsx` (Z. 159–166), `src/features/today/MyDayPage.tsx` (Z. 243); DOK-006; UX-EPIC-003; Oberflächen-Checkliste Punkt 11 |

**Beobachtung.** Die Seite stellt „Patientenfotos“ vor die Dokumentation (so
gebaut in DOK-006) und zeigt den Abschnitt immer ganz: Titel, dreizeiliger
Hinweis, Einwilligungsstand, bei null Fotos ein Leerzustand mit großem
Innenabstand und das Kleingedruckte. Ohne Einwilligung und ohne Fotos belegt er
bei 390 px rund 420 px. Mit Rückweg, Aktenkopf und Bereichsleiste beginnt der
erste Termin in einer gefüllten Akte erst bei rund 1 130 px; bei langem
Aktenkopf beginnen schon die Fotos erst bei rund 670 px. Genau hierher führt
„Bisherige Doku“ auf der Tageskarte — der Weg, der vor der Tür mit einem Tipp
zur letzten Behandlung führen soll (UX-EPIC-003).

**Frage an Jannes.** Soll der Verlauf mit den jüngsten Einträgen beginnen und
die Fotos danach oder zugeklappt zeigen?

**Optionen.**

1. **Reihenfolge bleibt, Umfang schrumpft:** ohne Fotos eine Zeile („Fotos:
   keine · Einwilligung nicht vermerkt“, bei erteilter Einwilligung „Foto
   aufnehmen“ daneben), mit Fotos „Fotos (3)“ zum Aufklappen, nach einer
   Aufnahme offen; das Kleingedruckte in den Hinweis. Folge: Die Festlegung aus
   DOK-006 bleibt, der erste Eintrag rückt um rund 350 px nach oben.
2. **Fotos unter die jüngsten Einträge.** Folge: Die Dokumentation steht nach
   einem Tipp oben; ändert die Reihenfolge aus DOK-006.
3. **„Bisherige Doku“ springt direkt zum ersten Eintrag** (Anker), die Seite
   bleibt. Folge: Nur der Weg aus der Übersicht wird kurz; wer die Akte über die
   Reiter öffnet, scrollt weiter.

**Empfehlung.** Option 1 zusammen mit dem Anker aus 3 — beides ändert keine
Festlegung, und der erste Eintrag steht bei 390 px wieder im ersten oder zweiten
Bildschirm. Nach der Umsetzung neu messen.

**Entscheidung (Jannes, 2026-10-09).** Option 1 mit dem Anker aus Option 3: ohne Fotos eine Zeile, mit Fotos „Fotos (n)“ zum Aufklappen; „Bisherige Doku“ springt zum ersten Eintrag. Seit BEF-135 gibt es keine Einwilligungsfotos mehr, die Zeile nennt deshalb keine Einwilligung.

### BEF-059 — Dateien: „Öffnen“ lädt herunter, die Art ist mit „Befund“ vorbelegt, und die vorgeschlagenen Namen unterscheiden nichts

|         |                                                                                                                                                                                                                                                                                                                                  |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-27                                                                                                                                                                                                                                                                                                                       |
| Bereich | Akte → Dateien (`/patienten/:id/dateien`); Behandlungsgrundlagen → „Scan des Rezepts“; Verlauf → Fotos                                                                                                                                                                                                                           |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390 px, Gegenprüfung; Review-IDs DAT-02, DAT-07, DAT-18                                                                                                                                                                                                                        |
| Status  | erledigt 2026-10-10 (UX-EPIC-007, UX-007d): Teil 1 über BEF-133; Dokumentart ohne Vorauswahl, Name „‹Art› vom ‹Datum›“, Fotos mit Uhrzeit |
| Berührt | `src/features/files/api.ts` (Z. 235–237), `src/features/files/Dateiliste.tsx` (Z. 64, 100, 126, 213, 362–400), `src/features/files/dokumentarten.ts` (Z. 77–78), `src/features/files/kamera.ts` (Z. 16–22), `src/features/files/FotosImVerlauf.tsx` (Z. 160, 190); ADR-017 Punkt 12, 15, 17, 19 und 40; ANN-129; ADR-013 Punkt 9 |

**Beobachtung.**

- **Öffnen.** Der Verweis wird mit dem Anzeigenamen als Downloadnamen signiert
  (ADR-017 Punkt 15), die Antwort kommt als Anhang. Am iPhone erscheint statt
  des Rezepts eine Download-Rückfrage, und die Datei liegt danach in
  „Downloads“, womöglich in iCloud Drive — genau das, was ADR-017 Punkt 40 für
  Fotos ausschließt; Punkt 19 sieht für alle Dateien die Anzeige „im eigenen
  Rahmen der Anwendung“ vor. Das Fenster öffnet sich erst nach zwei
  Serveraufrufen, mit `noopener`; ein Popup-Blocker bliebe unbemerkt, der
  Zugriff wäre trotzdem protokolliert. Der Knopf heißt „Öffnen“. Nicht ausgelöst
  (jedes Öffnen schreibt einen Auditeintrag).
- **Vorbelegte Art.** Ohne Kontext wählt das Formular die erste Art: für
  behandelnde Rollen „Befund“, für office „Einwilligung“. Wer nur die Datei
  wählt und „Datei hinzufügen“ tippt, legt sie still als Befund ab — die Art
  bestimmt, wer löschen darf, und ist nach ADR-017 eine Sichtbarkeitsgrenze;
  vorbelegt werden soll nur „aus dem Kontext“. Der artabhängige Hinweis steht
  zwischen Beschriftung und Auswahl und lässt das Feld bei jedem Wechsel
  springen (40 px bei 390 px).
- **Namen.** Der Anzeigename wird mit dem rohen Dateinamen vorbelegt (etwa
  `IMG_4711.jpg`), Kamerafotos heißen „Foto vom 27.09.2026“ — zwei Aufnahmen
  eines Tages tragen denselben Namen. Ohne Vorschaubilder (Punkt 40) ist der
  Name das einzige Merkmal; wer das richtige Foto sucht, öffnet mehrere, und
  jedes Öffnen ist ein Auditeintrag.

**Frage an Jannes.** (1) Soll „Öffnen“ eine Datei in der Anwendung zeigen statt
herunterzuladen? Das braucht eine neue Fassung von ADR-017 Punkt 15. (2) Soll
die Dokumentart ohne Vorauswahl starten? (3) Welches Namensschema?

**Optionen.**

- Zu (1):
  - **a) Download bleibt,** der Knopf heißt ehrlich „Herunterladen“. Folge:
    keine ADR-Änderung; Gesundheitsdaten landen weiter im Download-Ordner des
    Geräts.
  - **b) Anzeigen im eigenen Rahmen** wie bei Patientenfotos (in den Speicher
    der Seite laden, `no-store`, PDF und Bild), „Herunterladen“ als eigener,
    ebenso protokollierter Schritt für den Versand außerhalb der Anwendung
    (Punkt 17). Folge: neue Fassung von ADR-017 für Punkt 15; der Anzeigeweg aus
    Punkt 40 ist schon gebaut.
  - **c) Nur anzeigen, kein Download.** Folge: wie bei Fotos; ein Befund für die
    Ärzt:in ließe sich dann nur noch drucken.
- Zu (2): **a)** wie heute; **b)** leere Option „Bitte wählen …“, „Datei
  hinzufügen“ erst mit gewählter Art — wie die Seitenwahl ohne Vorauswahl
  (ANN-129). Folge von b: ein Tipp mehr, keine still falsch eingeordnete Datei.
- Zu (3): **a)** in „Dateien“ „‹Art› vom ‹Datum›“ ohne Endung vorschlagen, Fotos
  mit Uhrzeit („Foto vom 27.09.2026, 10:42“), den Verordnungsscan mit seinem
  Verordnungsdatum zeigen; **b)** die Körperregion als Pflichtangabe am Foto.
  Folge von b: aussagekräftiger, aber eine Eingabe mehr je Aufnahme.

**Empfehlung.** (1) b, (2) b, (3) a. Für (1) eine Docs-Session zu ADR-017 vor
dem nächsten Loop an den Dateien, weil es vor der ersten echten Datei geklärt
sein muss; der Rest im selben Loop. Unabhängig davon am echten iPhone prüfen, ob
das Fenster nach zwei Serveraufrufen blockiert wird. Ohne Entscheidung: an den
Namensfeldern kein Autofill, Enter löst Hinzufügen bzw. Speichern aus; der
gleichbleibende Satz „sichtbar für alle Praxisrollen“ entfällt, die artabhängige
Erläuterung steht unter der Auswahl.

**Entscheidung (Jannes, 2026-10-09).** (1) entschieden über ANN-223 (BEF-133). (2) b: Dokumentart ohne Vorauswahl, Hinzufügen erst mit gewählter Art. (3) a: Namensvorschlag „‹Art› vom ‹Datum›“, Fotos mit Uhrzeit.

### BEF-060 — Behandlungsgrundlage: Bauart mit „Erstverordnung“ vorbelegt, Karte ohne Hauptaktion, Kontakt der Verordner:innen nur im Formular

|         |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-27                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Bereich | Akte → Behandlungsgrundlagen (`/patienten/:id/verordnungen`), Grundlage erfassen und bearbeiten; Verordner:innen (`/verordner`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390 und 1440 px, Gegenprüfung; Review-IDs VER-07, DAT-17, VER-18, VER-10                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Status  | erledigt 2026-10-10 (UX-EPIC-007, UX-007e): Teil 1 in PRX-EPIC-003; Hauptaktion je Zustand, „Bearbeiten“ im Kopf, Kontaktwege der Verordner:in an Karte und Kartei, „Datei hinzufügen“ eingeklappt über der Liste |
| Berührt | `src/features/treatment-bases/api.ts` (Z. 532), `src/features/treatment-bases/TreatmentBasisFormFields.tsx` (Z. 78–93, 266–268), `src/features/treatment-bases/TreatmentBasisFormPage.tsx` (Z. 172–187), `update_treatment_basis` (Migration `20260918130000_appointment_count.sql`, Z. 498–503), `src/features/treatment-bases/PatientTreatmentBasesPage.tsx` (Z. 146, 310–361, 396–401), `src/features/files/Dateiliste.tsx` (Z. 174, 505, 527), `src/features/therapy-reports/BerichteDerVerordnung.tsx` (Z. 113), `src/features/treatment-bases/PrescribersListPage.tsx` (Z. 81–92), `src/features/treatment-bases/PrescriberFormFields.tsx` (Z. 117–144), `src/features/billing/InvoicePrintPage.tsx` (Z. 341); ADR-017 Punkt 10; ADR-020 Punkt 3 und 4; ANN-074; Oberflächen-Checkliste Punkte 8 und 11 |

**Beobachtung.**

- **Bauart.** Eine neue Grundlage ist als „Erstverordnung“ vorbelegt; das Feld
  „Art“ hat keine leere Option. Folgeverordnung oder Selbstzahler werden so ohne
  bewusste Wahl als Erstverordnung gespeichert — und die Bauart steht auf
  Rechnung und Therapiebericht. Der Wechsel auf Selbstzahler leert Verordner:in
  und Diagnose und blendet beide im selben Moment aus; beim Speichern räumt der
  Server zusätzlich Therapieziel, Verordnerhinweis und Empfehlung ab, während
  der Kasten „Aus dem Bestand“ versichert, sie „bleiben beim Speichern
  unverändert stehen“. Im Browser nachgestellt (therapist, 390 px, nichts
  gespeichert).
- **Karte.** Bis zu vier Aktionen („Terminserie anlegen“, „Im Kalender einen
  Platz suchen“, „Termine übertragen“, „Bearbeiten“) stehen als gleichrangige
  Textlinks nebeneinander, darunter „Therapiebericht schreiben“ als größter
  Knopf der Karte. An jeder laufenden Verordnung stehen ein Leerzustand und das
  volle Uploadfeld mit Hauptknopf — auch wenn schon ein Scan da ist; office
  liest dort eine Aufforderung, der es nicht folgen darf. In „Dateien“ steht das
  Uploadfeld unter der Liste, das Ergebnis erscheint oben (bei 390 px beginnt
  das Formular bei rund 1 040 px).
- **Verordner:innen.** Die Kartei zeigt Praxis, Fachrichtung und Ort; die ganze
  Zeile führt ins Bearbeitungsformular, bei 1440 px bleiben rechts rund 750 px
  leer. Telefon, Fax und E-Mail gibt es nur als Eingabefelder, nirgends `tel:`
  oder `mailto:`, und die Verordnungskarte nennt nur Name und Praxis. Wer eine
  Folgeverordnung anfordern will, schreibt die Nummer aus einem offenen Formular
  ab.

**Frage an Jannes.** (1) Soll die Bauart ohne Vorauswahl starten? (2) Welche
Aktion ist je Zustand der Verordnung die Hauptaktion? (3) Brauchen
Verordner:innen eine Leseansicht mit Kontaktwegen, auch an der Verordnungskarte?

**Optionen.**

- Zu (1): **a)** Vorbelegung bleibt — Folge: stille Erstverordnungen auf
  Rechnung und Bericht; **b)** „Bitte wählen …“ als erste Option, kein geratener
  Wert, der auf der Rechnung steht (wie ANN-074 beim Umsatzsteuerstatus) —
  Folge: ein Tipp mehr bei jeder neuen Grundlage.
- Zu (2): **a)** gleichrangig wie heute; **b)** je Zustand eine Hauptaktion —
  offen: „Terminserie anlegen“, verplant: „Termine übertragen“ —, „Bearbeiten“
  ruhig in den Kartenkopf, der Bericht als ruhige Aktion, der Scan als eine
  Zeile mit Zustand und „Scan hinzufügen“ zum Aufklappen (liegt einer vor:
  „Weiteren Scan hinzufügen“), für Rollen ohne Hinzufügen nur „Noch kein Scan.“;
  in „Dateien“ „Datei hinzufügen“ oben. Folge von b: Die laufende Karte wird am
  Handy deutlich kürzer (heute rund 1 790 px, davon rund 760 px Bericht, Scan
  und Upload); der nächste Schritt ist erkennbar.
- Zu (3): **a)** Kontaktwege in der Karteizeile als eigene Links (Telefon,
  E-Mail; Fax als Text), die Zeile führt weiter zum Bearbeiten, dazu Telefon und
  Fax an der Verordnungskarte; **b)** eine eigene Leseansicht, Bearbeiten als
  Aktion darin. Folge von b: eine Seite mehr, dafür kein Nachschlagen in einem
  offenen Formular.

**Empfehlung.** (1) b, (2) b, (3) a — sie erfüllt Checkliste Punkt 8 ohne neue
Seite. Ohne Entscheidung beim Wechsel der Bauart: Werte im Zustand behalten und
nur nicht senden, der sichtbare Satz „Verordner:in und Diagnose entfallen beim
Selbstzahler.“, der Kasten „Aus dem Bestand“ sagt „werden beim Speichern
entfernt“, und das Speichern fragt nach.

**Entscheidung (Jannes, 2026-10-09).** (2) b: je Zustand eine Hauptaktion, Bearbeiten, Bericht und Scan ruhig. (3) a: Kontaktwege der Verordner:in als Links in der Liste und an der Verordnungskarte.

### BEF-062 — Nach einem Storno führen zwei Wege zur neuen Rechnung, und nur einer behält den Bezug; Empfänger lassen sich nur anlegen

|         |                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-27                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Bereich | Abrechnung: „Abzurechnen“ (`/abrechnung`), stornierte Rechnung und Rechnungsentwurf (`/abrechnung/rechnungen/:id`), Abschnitt „Empfänger“                                                                                                                                                                                                                                                                                             |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390 px, Gegenprüfung; Review-IDs ABR-08, ABR-19                                                                                                                                                                                                                                                                                                                                     |
| Status  | erledigt 2026-10-10 (UX-EPIC-008, UX-008b und UX-008c): nach dem Storno nur „Korrekturrechnung erstellen“ mit Herkunft, Sperre im Datenmodell, je stornierter Rechnung eine eigene Korrektur (ANN-321); Empfänger bearbeitbar mit Standard, neu hinterlegter gewählt, Art ohne Vorbelegung |
| Berührt | `create_invoice_draft`, `create_correction_draft` (Migration `20260921140000_invoice_service_area.sql`, Z. 627–629), `list_invoice_candidates`, `save_invoice_recipient`; `src/features/billing/api.ts` (Z. 263, 592–594), `src/features/billing/InvoicesPage.tsx` (Z. 336–358), `src/features/billing/InvoiceDetailPage.tsx` (Z. 566, 682–733, 807); ADR-009 Punkt 9 und 10; ANN-079; BEF-018; ADR-013 Punkt 9 (Rechnungsdaten, RPC) |

**Beobachtung.**

- **Korrekturbezug.** Nach dem Storno stehen die Leistungen wieder unter
  „Abzurechnen“ mit dem gewohnten „Entwurf anlegen“ — ohne Bezug zur stornierten
  Rechnung. Nur „Korrekturrechnung erstellen“ an der stornierten Rechnung
  verknüpft (ANN-079). Wer den Weg der Startseite nimmt, bekommt eine Rechnung
  ohne den Satz „Korrekturrechnung zur stornierten Rechnung …“ auf dem Blatt;
  ein späterer Klick auf „Korrekturrechnung erstellen“ meldet „… steht bereits
  ein Entwurf. Er ist die Korrektur.“ — obwohl er nicht verknüpft ist. Die Zeile
  unter „Abzurechnen“ verrät die Herkunft nicht. Der Seed zeigt beide Wege
  zugleich. Beim Empfänger liegen dann zwei Rechnungen über dieselben Leistungen
  ohne Bezug — genau der Fall, den ADR-009 Punkt 9 vermeiden soll.
- **Empfänger.** Hinterlegte Empfänger lassen sich nur neu anlegen, nicht
  korrigieren oder entfernen, obwohl die Speicherfunktion eine Kennung annimmt.
  Einen Standardempfänger gibt es nicht, ein neu gespeicherter Empfänger ist
  danach nicht gewählt, die Art ist mit „Beihilfestelle“ vorbelegt. Bei 390 px
  bricht „Empfänger speichern“ zweizeilig im 48-px-Knopf um, und der gesperrte
  Knopf sagt nicht, was fehlt. Ein Tippfehler in der Anschrift einer
  Beihilfestelle bleibt stehen; jeden Monat ist der Empfänger je Person neu zu
  wählen.

**Frage an Jannes.** (1) Welcher Weg soll nach einem Storno zur neuen Rechnung
führen? (2) Sollen Empfänger bearbeitbar sein und einer je Person als Standard
gelten?

**Optionen.**

- Zu (1):
  - **a) Der Server verknüpft selbst:** Ein neuer Entwurf bezieht sich auf die
    stornierte Rechnung desselben Monats und Leistungsbereichs. Folge: Beide
    Wege ergeben dasselbe; die Regel muss eindeutig sein, auch bei zwei Stornos.
  - **b) Nur ein Weg:** Die Zeile unter „Abzurechnen“ nennt die Herkunft („aus
    stornierter RG-… – Korrekturrechnung erstellen“) und bietet nur diesen Weg.
    Folge: Der Bezug entsteht immer sichtbar; eine Zeile mehr Text.
- Zu (2):
  - **a) Wie heute** (nur anlegen). Folge: siehe oben.
  - **b) Bearbeiten und Standard:** Empfänger korrigieren und einen je Person
    als Standard setzen; der neu gespeicherte wird gleich gewählt. Wirkt auf
    Entwürfe, nie auf ausgestellte Rechnungen (Snapshot, ADR-009 Punkt 10).
    Folge: geänderte Rechnungsdaten, kritischer Pfad.

**Empfehlung.** (1) b — der sichtbare Weg ist leichter zu prüfen als eine
Zuordnung im Hintergrund und beantwortet genau die Wiedervorlage von ANN-079
(„ob die Praxis die Korrekturrechnung so findet“). (2) b. Beides ein Loop im
kritischen Pfad. Sofort und nur Text: die Meldung „Er ist die Korrektur.“
ehrlich machen („… ein Entwurf ohne Bezug zur stornierten Rechnung. Bitte
verwerfen und hier neu anlegen.“). Ohne Entscheidung: Knopfzeile umbrechen, die
Art ohne Vorbelegung („Bitte wählen …“), der Grund am gesperrten Knopf („Name
oder Stelle fehlt“).

**Entscheidung (Jannes, 2026-10-09).** (1) b: Nach einem Storno führt nur der sichtbare Weg „Korrekturrechnung erstellen“ mit Herkunft zur neuen Rechnung. (2) b: Empfänger bearbeitbar, einer je Person als Standard; ausgestellte Rechnungen bleiben unverändert.

### BEF-063 — „Rechnung ausstellen“ geschieht mit einem Tipp, während folgenlose Schritte nachfragen

|         |                                                                                                                                                                                                                                                                                                                                                             |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-27                                                                                                                                                                                                                                                                                                                                                  |
| Bereich | Rechnungsentwurf (`/abrechnung/rechnungen/:id`); Datenschutz der Akte (`/patienten/:id/datenschutz`), Widerruf der Fotoeinwilligung                                                                                                                                                                                                                         |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390 px, Gegenprüfung; Review-IDs ABR-15, ZST-15                                                                                                                                                                                                                                                           |
| Status  | erledigt 2026-10-10 (UX-EPIC-008, UX-008a): Rückfrage mit Empfänger, Betrag und Kreis vor dem Ausstellen, Verwerfen abgesetzt; Foto-Widerruf nennt die Zahl der Arbeitshilfen |
| Berührt | `src/features/billing/InvoiceDetailPage.tsx` (Z. 847–869), `src/features/billing/CatalogPage.tsx` (Z. 423), `src/features/datenschutz/PatientDatenschutzPage.tsx` (Z. 245, 270), `src/features/files/FotosImVerlauf.tsx` (Z. 394); ADR-009 Punkt 9; ADR-016 Punkt 4 (Muster „Folge vor dem Knopf“); ANN-127; `OPTIMIERUNG.md` (Messgrößen Z und F); BEF-064 |

**Stand nach UXR-006.** Der Foto-Widerruf fragt inzwischen nach (Review PAT-04,
umgesetzt an genau einer Stelle, `VermerkErfassen`); offen ist nur noch die
Frage zum Ausstellen der Rechnung.

**Beobachtung.** Ausstellen vergibt eine Nummer aus dem lückenlosen Kreis und
macht die Rechnung unveränderlich; korrigierbar ist sie nur per Storno mit
eigener Nummer und neuer Rechnung. Dafür genügt ein Tipp auf den Hauptknopf; die
Folge steht als Absatz davor — dasselbe Muster wie beim Abschluss der
Dokumentation (ADR-016 Punkt 4). Das folgenlose „Entwurf verwerfen“ daneben und
„In Kraft setzen“ im Katalog fragen dagegen nach; ist die Verwerfen-Rückfrage
offen, stehen ihr „Verwerfen“ und „Rechnung ausstellen“ als zwei gefüllte Knöpfe
direkt untereinander. Der Widerruf der Fotoeinwilligung löscht alle Fotos der
Person sofort (ANN-127); auch dort stehen nur ein Feldhinweis und die
Knopfbeschriftung, während das Löschen eines einzelnen Fotos mit „Endgültig
löschen“ nachfragt. Eine Festlegung, welches Muster für diese beiden gilt, gibt
es nicht. `OPTIMIERUNG.md` nennt für eine Rechnung „≤ 60 s“ und für Fehlerpfade
„Irreversibles nur mit Rückfrage“.

**Frage an Jannes.** Sollen unumkehrbare Schritte mit Außenwirkung — eine
Rechnung ausstellen, alle Fotos einer Person löschen — eine Rückfrage bekommen,
oder gilt auch hier „die Folge steht vor dem Knopf“?

**Optionen.**

1. **Folge vor dem Knopf, ein Tipp** (wie heute), als Annahme festgehalten.
   Folge: schnell; ein Fehlgriff erzeugt Storno, neue Rechnung und zwei
   Schreiben an den Empfänger bzw. löscht alle Fotos einer Person.
2. **Rückfrage im Fluss mit Kontrollwerten:** „An Beihilfestelle …, 45,00 €,
   Kreis RG. Danach unveränderlich. — Ja, Rechnung ausstellen“ bzw. „Ja,
   widerrufen und alle Fotos löschen“. Folge: ein Tipp mehr je Rechnung; die
   Rückfrage zeigt Empfänger und Betrag noch einmal — die häufigsten Fehlgriffe.
3. **Rückfrage nur beim Foto-Widerruf,** die Rechnung bleibt bei einem Tipp.
   Folge: Die Löschung ist geschützt, das Ausstellen schnell.

**Empfehlung.** Option 2 für beide. Die Rückfrage kostet einen Tipp und erspart
im Fehlerfall ein Storno mit zweiter Nummer bzw. eine unwiderrufliche Löschung;
sie zeigt dabei Empfänger und Betrag, die vorher niemand noch einmal ansieht.
Unabhängig davon „Entwurf verwerfen“ als ruhige Aktion mit Abstand, damit seine
Bestätigung nicht unter „Rechnung ausstellen“ steht. Dieselbe Frage stellt sich
beim Entziehen einer Rolle (BEF-064). Die Umsetzung ändert keinen Aufruf, liegt
aber im Ausstellungs- und Löschweg; ADR-013 Punkt 9 dabei prüfen.

**Entscheidung (Jannes, 2026-10-09).** Option 2: Rückfrage mit Kontrollwerten bei „Rechnung ausstellen“ und beim unwiderruflichen Löschen von Fotos; ebenso beim Entziehen einer Rolle (BEF-064).

### BEF-064 — Zugang und Rollen: Die Trainingsbetreuung erscheint rollenlos, Rollen wirken ohne Rückfrage, und die Praxisleitung findet die Instrumente nicht

|         |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Datum   | 2026-09-27                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Bereich | Organisatorisches → Mitarbeitende → Datensatz (`/praxis/team/:id`), Abschnitt „Zugang“; Organisatorisches → Instrumente (`/praxis/instrumente`); Befund der Akte                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390/820/1440 px, Gegenprüfung; Review-IDs ORG-09, ORG-18, BEF-19                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Status | entschieden 2026-10-09 (Jannes); eingeplant in UX-EPIC-008 |
| Berührt | `src/features/staff/StaffAccountSection.tsx` (Z. 34, 270, 290, 354–410), `src/features/staff/StaffMemberDetailPage.tsx` (Z. 149–176, 284–288), `src/app/navigation.tsx` (`betriebUnterpunkte`), `src/routes/AuthenticatedRoutes.tsx` (Z. 135, 326), `src/features/assessments/PatientBefundPage.tsx` (Z. 111), `src/features/assessments/VerlaufAbschnitt.tsx` (Z. 105); `app.assert_staff_role_keys` (Migration `20260911110000_staff_account_invitations.sql`), Migration `20260920132000_training_role.sql`; ADR-004; ADR-021; ANN-103; STAFF-001; ADR-013 Punkt 9 (Rollen, Sichtbarkeit zwischen Rollen) |

**Beobachtung.**

- **Trainingsbetreuung.** Die Rollenwahl kennt vier Kästchen (Therapeut:in,
  Teamleitung, Praxismanagement, Praxisinhaber:in). Für einen Zugang mit der
  Rolle `trainer` (im Seed ein Konto der Trainingsbetreuung) zeigt der Abschnitt
  „Stand: Eingerichtet“ und vier leere Kästchen — die tatsächliche Rolle steht
  nirgends. Hakt man eine Rolle an, geht `trainer` mit hinaus, der Server lehnt
  sie ab, und die Seite sagt nur „Der Vorgang konnte nicht ausgeführt werden.“
  Dass `trainer` hier nicht zuweisbar ist, ist gewollt: Die Rolle wird
  zuweisbar, wenn es im Trainingsbereich etwas zu bedienen gibt (E18 Schritt 7).
- **Rückfragen.** „Rollen speichern“ wirkt sofort auf den Aktenzugriff, ohne
  Rückfrage; „Kennwort zurücksetzen“, das keine Berechtigung ändert, fragt nach.
  Am eigenen Datensatz wird „Zugang sperren“ angeboten und erst nach der
  Bestätigung abgewiesen. Deaktivieren mit offenen Terminen braucht drei Tipps;
  der zweite Schritt erscheint als rote Fehlermeldung, obwohl er eine gewollte
  Bestätigung ist. Ein Häkchen weniger nimmt einer Kollegin im Hausbesuch sofort
  die Akten.
- **Instrumente.** Route und Menüpunkt hängen am Recht, Behandlungen zu
  dokumentieren (therapist, team_lead). Ein reines owner-Konto darf Fragebögen
  erheben (ANN-103), erreicht die Bibliothek mit Wortlaut und Lizenz aber gar
  nicht, auch nicht über die Adresse. office sieht am Bogen nur „Noch nicht
  erhoben.“ ohne Satz, wer erhebt.

**Frage an Jannes.** (1) Soll das Entziehen einer Rolle nachfragen — so wie
heute schon das Zurücksetzen eines Kennworts? (2) Wer soll die
Instrumente-Bibliothek sehen: alle, die erheben dürfen, oder alle Praxisrollen?

**Optionen.**

- Zu (1): **a)** keine Rückfrage wie heute — Folge: ein Fehltipp nimmt sofort
  den Aktenzugriff; **b)** Rückfrage nur beim Entziehen („… verliert damit
  sofort den Zugriff auf die Akten.“) — Folge: ein Tipp mehr, nur im
  folgenreichen Fall.
- Zu (2): **a)** alle, die erheben dürfen (owner, therapist, team_lead) — Folge:
  Die Praxisleitung findet Wortlaut und Lizenz, office nicht; **b)** alle
  Praxisrollen, weil die Bibliothek keinen Personenbezug hat — Folge: auch
  office liest die Bögen, ohne sie erheben zu dürfen.

**Empfehlung.** (1) b, (2) a. Dazu, ohne neue Festlegung, aber im kritischen
Pfad (Rollen): eine hier nicht vergebbare Rolle als Rollenabzeichen
„Trainingsbetreuung – hier nicht änderbar“ zeigen und die Kästchen für solche
Zugänge mit Erklärung sperren; am eigenen Datensatz statt „Zugang sperren“ der
Satz „Den eigenen Zugang können Sie nicht sperren.“; offene Termine beim
Deaktivieren gleich beim Öffnen laden und in einem Schritt bestätigen lassen
(die Prüfung auf dem Server aus STAFF-001 bleibt); für Leserollen am Bogen
„Erhoben wird von den behandelnden Rollen.“

**Entscheidung (Jannes, 2026-10-09).** (1) b: Rückfrage beim Entziehen einer Rolle. (2) b: Die Instrumente-Bibliothek sehen alle Praxisrollen, auch das Büro (Regel BEF-137).
