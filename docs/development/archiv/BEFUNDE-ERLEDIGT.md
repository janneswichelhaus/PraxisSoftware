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

### BEF-052 — Gedruckte Blätter: Die Übersicht druckt ohne Rufnummern und spätere Besuche; Aufnahmeblätter und Terminzettel tragen keinen Absender

|         |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-27                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Bereich | Übersicht (`/`, Browserdruck als Papierweg); Aufnahmeblätter (`/patienten/:id/aufnahmeblaetter`); Terminzettel (`/patienten/:id/terminzettel`)                                                                                                                                                                                                                                                                                                                                                                                                 |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390 und 1440 px, Gegenprüfung; Review-IDs UEB-01, UEB-09, TER-19                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Status  | erledigt 2026-10-10 (UX-EPIC-009, UX-009a): Übersicht druckt jeden eigenen Termin mit Anschrift, Zugang und Rufnummer (ANN-021 Fassung 3); Absender auf Aufnahmeblatt und Terminzettel über `get_practice_sender` (ANN-323), Standortanschrift am Praxistermin; Drucktests je Blatt |
| Berührt | `src/index.css` (Druck-Basis, Z. 255–260), `src/features/today/MyDayPage.tsx` (Z. 326–347, 461–464), `src/features/today/Tagesliste.tsx` (Z. 118), `src/components/ui/buttonStile.ts` (Z. 53), `src/features/datenschutz/AufnahmeblaetterPage.tsx` (Z. 25–53), `src/features/datenschutz/patienteninformation.ts` (Z. 37), `src/features/appointments/AppointmentSlipPage.tsx` (Z. 39–42, 144–152), `tests/e2e/bericht.spec.ts` (Muster für einen Drucktest); ANN-021, ANN-039, ANN-041, ANN-123; ADR-012 Punkt 8 und 9; `marke/README.md`; B2 |

**Beobachtung.**

- **Übersicht als Papierweg.** ANN-021 macht den Browserdruck der Übersicht zum
  Papierweg für den Ausfall (ADR-012 Punkt 9). Die Druck-Basis blendet
  Kopfbereiche und Knöpfe aus. Datum und Name druckt der Seitenkopf seit UXR-001
  mit; es fehlen aber jede Rufnummer (sie ist ein Kartenknopf) und jeder
  Besuch ab dem dritten (er steht im zugeklappten „Weitere offene heute“); dafür
  stehen „Termin öffnen →“ und leere Aufklapper-Überschriften darauf. Belegt mit
  einem PDF aus der laufenden Anwendung (therapist, 390 px): keine der fünf
  Rufnummern, ein Besuch fehlt. Der Hinweis auf der Seite verspricht weiter
  „Anschrift, Rufnummer“.
- **Aufnahmeblätter.** Das Blatt für Patient:innen nennt als Praxis nur den
  Organisationsnamen und bittet, sich „persönlich, telefonisch oder schriftlich“
  an die Praxis zu wenden — Anschrift, Telefon und E-Mail stehen nicht darauf.
  Art. 13 Abs. 1 lit. a DSGVO verlangt die Kontaktdaten des Verantwortlichen.
- **Terminzettel.** Name, Termine und „Bitte sagen Sie einen Termin rechtzeitig
  ab …“ — Praxis und Telefon fehlen, Praxistermine nennen nur den internen
  Standortnamen. Eine zu späte Absage kann ein Ausfallhonorar auslösen. Der
  Kommentar im Code vertröstet auf die Praxis-Stammdaten aus ABR-000; die gibt
  es inzwischen, mit Feld Telefon.

**Frage an Jannes.** (1) Was muss auf dem Papier der Übersicht stehen, damit es
im Ausfall trägt — alle eigenen Besuche mit Anschrift und Rufnummer? (2) Sollen
Aufnahmeblätter und Terminzettel einen Absender aus den Praxis-Stammdaten
tragen, auch wenn therapist sie druckt?

**Optionen.**

1. **Vollständig:** Datum und Name als eigene Druckzeile, Rufnummern zusätzlich
   als Text, „Weitere offene heute“ beim Drucken aufgeklappt, Links und leere
   Überschriften weg. Auf beiden Patientenblättern ein Absender (Name,
   Anschrift, Telefon, E-Mail; beim Praxistermin die Standortanschrift) über
   eine Projektion nach dem Muster ANN-123, ohne Wortmarke. Folge: Das Papier
   trägt im Ausfall und nennt den Verantwortlichen; therapist liest über die
   Projektion die Briefkopffelder — dieselbe Öffnung wie beim Bericht (ANN-123),
   Teil der Prüfung B2; Projektion und Rollenschnitt gehen durch den kritischen
   Pfad.
2. **Übersicht knapp:** Datum, Uhrzeit, Name und Rufnummer, aber keine
   Anschriften — ANN-021 nennt ein Papier mit den Anschriften eines Tages einen
   Datenabfluss ohne Löschfrist. Absender wie 1. Folge: weniger auf Papier; im
   Ausfall fehlt die Anschrift, die man für den Weg braucht.
3. **Druck als ungeeignet kennzeichnen** und den Papierweg neu lösen. Folge:
   ADR-012 Punkt 9 ist dann wieder offen.

**Empfehlung.** Option 1, mit einem Drucktest je Blatt. Ein Blatt ohne Rufnummer
und Anschrift hilft im Ausfall nicht, und es enthält nur die eigenen Besuche
eines Tages — dieselben Angaben, die ohnehin auf dem Handy stehen. ANN-021 wird
damit fortgeschrieben: Die Anschriften stehen dann ausdrücklich auf dem Papier.

**Entscheidung (Jannes, 2026-10-09).** Option 1: Die Übersicht druckt alle eigenen Besuche des Tages mit Anschrift und Rufnummer (ANN-021 wird fortgeschrieben); Aufnahmeblatt und Terminzettel tragen einen Absender aus den Praxis-Stammdaten.

### BEF-065 — Audit, Aufbewahrung und MDR-Sperre: Die Nachweisseiten sprechen Projektsprache und stellen die Arbeit nach hinten

|         |                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-27                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Bereich | Organisatorisches → Sicherheit → Audit (`/praxis/sicherheit/audit`) und Aufbewahrung (`/praxis/sicherheit/aufbewahrung`); MDR-Sperrseite (reservierte Adressen, etwa `/training/ki-analyse`)                                                                                                                                                                                                                                                               |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390 und 1440 px, Gegenprüfung; Review-IDs ORG-13, ORG-19, ORG-23, ORG-B02, NAV-23                                                                                                                                                                                                                                                                                                                        |
| Status  | erledigt 2026-10-10 (UX-EPIC-009, UX-009b): Protokoll mit Filtern in der Adresse, am Handy eingeklappt, Aktionen gruppiert, „Abgewiesen“ als kritisches Abzeichen, fester Stand ab Seite 2; Aufbewahrung beginnt mit „Zu tun“, Annahme-Etikett in Praxissprache, „Grundlagen“ zugeklappt; MDR-Sperre in Praxissprache, Kennung als Fußzeile |
| Berührt | `src/features/audit/AuditLogPage.tsx` (Z. 50–83, 164–207), `src/features/audit/api.ts` (Z. 97), `list_audit_events` (Migration `20260922120000_abgewiesene_zugriffe.sql`, Z. 256), `src/features/retention/AufbewahrungPage.tsx` (Z. 72, 231–421), `src/features/retention/klassen.ts`, `src/app/MdrSperre.tsx` (Z. 24–33), `tests/e2e/mdr-sperre.spec.ts` (Z. 21–25); ADR-006; ADR-008; ADR-010 Punkt 3 und 13; ANN-089; ADR-013 Punkt 9 (Audit-Lesepfad) |

**Beobachtung.**

- **Audit.** Der Gegenstand einer Zeile steht als „…“ plus die letzten
  12 Zeichen der Kennung; die volle Kennung nur im Tooltip — am Handy nicht
  erreichbar und nirgends verlinkt. „Abgewiesen“ steht in derselben grauen
  14-px-Zeile wie „Erfolgreich“. Der Aktionsfilter bietet 118 Einträge in
  technischer Reihenfolge. Jede Seite ist eine neue Abfrage ohne Platzhalter,
  Liste und Blätterleiste verschwinden kurz; weil jeder Lesevorgang selbst
  „Auditlog gelesen“ oben ins Log schreibt (ADR-010 Punkt 13), rückt beim
  Weiterblättern alles um eins, der letzte Eintrag der Vorseite erscheint
  erneut. Filter stehen nicht in der Adresse und gehen beim Neuladen verloren;
  am Handy stehen alle vier offen über der Liste (rund 330 px). Die Kernfrage —
  wer hat wessen Akte geöffnet — lässt sich aus der Liste nicht beantworten, und
  abgewiesene Zugriffe gehen in der Masse unter.
- **Aufbewahrung.** Datenklassen tragen die Annahmenkennung als Etikett
  („ANN-126“), Texte verweisen auf ADRs, sprechen von „Objektspeicher“ und
  „Fristen ändern sich über eine Migration“. Offene Löschaufträge und der
  Abgleich der Dateiablage — die einzigen Arbeitsaufgaben der Seite — beginnen
  erst nach 15 Planungskarten: bei 390 px nach 5 460 px (Seitenhöhe 6 498 px),
  bei 1440 px nach 2 305 px.
- **MDR-Sperre.** „Sie ist als MDR_REVIEW_REQUIRED klassifiziert.“ und „Ein
  Feature-Flag ersetzt diese Prüfung nicht …“. Der E2E-Test hält beide Sätze
  fest, die Kennung bewusst (auffindbar für ADR-006 und das Register).
  Erreichbar nur über reservierte Adressen.

**Frage an Jannes.** An wen richten sich diese Seiten — an die Praxisleitung im
Alltag oder an eine Prüfer:in? Und soll das Audit zu einer Zeile die Akte oder
den Termin öffnen können?

**Optionen.**

1. **Für Prüfer:innen lassen** (Kürzel, Verweise und Reihenfolge wie heute).
   Folge: nachvollziehbar für die Prüfung; die Praxisleitung übersieht am Handy
   offene Löschaufträge und abgewiesene Zugriffe.
2. **Für die Praxisleitung schreiben, den Nachweis als Zusatz:** Aufbewahrung
   oben mit einem Zustandsblock (offene Aufträge und Abgleich, leer als eine
   Zeile „Nichts offen, beide Speicher deckungsgleich“), danach Löschsperren,
   Plan und Journal; das Etikett „Annahme – Prüfung offen“ mit der Kennung als
   Zusatz, ADR-Verweise in einer aufklappbaren „Grundlagen“-Zeile,
   „Programmänderung“ statt „Migration“. Audit: „Abgewiesen“ als kritisches
   Abzeichen, Aktionen gruppiert, Filter in der Adresse und am Handy
   eingeklappt, Blättern auf einem festen Zeitpunkt („Stand 14:03 – neu laden“).
   MDR-Seite: Haupttext in Praxissprache („Diese Funktion bleibt gesperrt, bis
   eine Prüfung nach dem Medizinprodukterecht dokumentiert ist.“), die Kennung
   als Fußzeile; der E2E-Test prüft weiter die Kennung und den neuen Satz statt
   „Feature-Flag“, gleich streng. Folge: dieselben Angaben, andere Reihenfolge
   und Sprache; der feste Zeitpunkt ändert den Aufruf des Audit-Lesepfads
   (kritischer Pfad), und der geänderte E2E-Text braucht deine Freigabe, weil er
   eine Sperrprüfung betrifft.
3. **Wie 2, dazu je Auditzeile „Akte öffnen“ bzw. Namen statt Kennung.** Folge:
   Die Kernfrage ist mit einem Tipp beantwortet; Namen im Audit-Lesepfad oder
   ein Sprung in die Akte ändern aber den Lesepfad nach ADR-010 Punkt 13 — und
   jeder Sprung ist selbst ein Aktenzugriff.

**Empfehlung.** Option 2. Sie macht die Arbeit sichtbar, ohne den Nachweis zu
verlieren. Option 3 erst mit der Datenschutzprüfung (B2), weil sie ADR-010
berührt.

**Entscheidung (Jannes, 2026-10-09).** Option 2: Die Nachweisseiten sind für die Praxisleitung im Alltag geschrieben, der Nachweis steht als Zusatz. Den geänderten Satz im E2E-Test der MDR-Sperre (gleich streng, Kennung bleibt geprüft) gibt Jannes hiermit frei.

### BEF-067 — Begriffe: Dieselbe Sache heißt an verschiedenen Stellen verschieden

|         |                                                                                                                                                                     |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-27                                                                                                                                                          |
| Bereich | Querschnitt: Kalender, Termin, Übersicht, Akte, Patient:innen, Anmeldung, Mein Konto, Anlegeseiten                                                                  |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390 und 1440 px, Gegenprüfung; Review-IDs WRT-04, WRT-05, WRT-18, KAL-28, UEB-14, AUTH-14, NAV-21, PAT-06, PAT-10 |
| Status  | erledigt 2026-10-10 (UX-EPIC-009, UX-009c): alle neun Zeilen nach Spalte „Vorschlag“, abgelöste Wörter in `begriffe.ts` (ANN-111) |
| Berührt | `src/lib/begriffe.ts`, `src/lib/begriffe.test.ts`; Fundstellen je Zeile unten; ANN-002, ANN-023, ANN-025, ANN-032, ANN-111; BEF-035; Oberflächen-Checkliste Punkt 9 |

**Beobachtung.** Checkliste Punkt 9 verlangt „gleiche Sache, gleiches Wort“,
ANN-111 führt die Begriffe an einer Stelle. Neun Stellen weichen ab:

| Sache                                  | heute                                                                                                                                                                                                       | Fundstellen                                                                                                                                              |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Serie von Terminen aus einer Grundlage | „Dauertermin“ (Kalender, `begriffe.ts`), „Terminserie“ (Serienseite, Akte, Fehlermeldung)                                                                                                                   | `CalendarPage.tsx:657`, `DauerterminStartPage.tsx:153`, `AppointmentSeriesPage.tsx:291`, `PatientTreatmentBasesPage.tsx:319`                             |
| Länge eines Termins                    | „Dauer“ (Feld), „Andere Länge …“, „Länge in Minuten“, „Fenster“, „Terminfenster“, „Länge weicht ab“                                                                                                         | `AppointmentFormFields.tsx:259–283`, `AppointmentSeriesPage.tsx:392–393`, `appointments/api.ts:546, 1363`                                                |
| Eintrag ohne Patient:in                | „Fehlzeit“, beschrieben als „Besprechung, Teamtermin“, mit der Rückfrage „Außerhalb der Arbeitszeit“                                                                                                        | `NewEventPage.tsx:159`, `EreignisFormFields.tsx:148–151`                                                                                                 |
| alle Termine eines Tages absagen       | „Tag umplanen“; der Knopf dahinter heißt „2 Termine absagen“                                                                                                                                                | `TagUmplanenPage.tsx:193, 266`                                                                                                                           |
| bestätigter, noch offener Termin       | Tageskarte „Steht aus“, Terminseite „Status: Bestätigt“; in der Akte steht ein vergangener, offener Termin ohne Zustandswort                                                                                | `today/api.ts:195`, `AppointmentDetailPage.tsx:922`                                                                                                      |
| Titel der Anlegeseiten                 | drei Nomen („Neue:r Patient:in“, „Neue:r Mitarbeiter:in“, „Neue:r Verordner:in“), sonst Verben („Termin anlegen“ …)                                                                                         | `NewPatientPage.tsx:103`, `NewStaffMemberPage.tsx:83`, `PrescriberFormPage.tsx:105`                                                                      |
| Anmeldung mit E-Mail und Kennwort      | „Konto“ und „Zugang“ im selben Absatz; die Mail heißt „Zugangsmail“, am Knopf „Anmeldemail senden“, im Betreff „Zugang zur Praxisanwendung“; „Anmeldemaske“                                                 | `LoginPage.tsx:193`, `ZugangEinrichtenPage.tsx:49`, `ZugangPage.tsx:113`, `StaffAccountSection.tsx:218`, `supabase/config.toml:100`, `MeinKontoPage.tsx` |
| Versorgungsstatus                      | „Aktiv/Inaktiv“, „inaktiv“, „Nicht in Versorgung“, „In Versorgung“/„Nicht in laufender Versorgung“; eine abgeschlossene, aktive Person trägt zugleich „✓ In Versorgung“ und „Versorgung abgeschlossen am …“ | `PatientRecordLayout.tsx:152–160`, `PatientMasterDataPage.tsx:311–320`, `PatientsListPage.tsx:118, 160`, `Patientensuche.tsx:35`                         |
| Name in der Patientenliste             | sortiert nach Nachname, angezeigt „Vorname Nachname“; am Handy wird zuerst der Nachname gekürzt                                                                                                             | `patients/api.ts:101, 185`, `PatientsListPage.tsx:147–150`                                                                                               |

**Frage an Jannes.** Welches Wort gilt je Zeile? Es steht danach in
`begriffe.ts`, und der Test hält die übrigen Stellen fern.

**Optionen.** Je Zeile ein Vorschlag und eine Alternative:

| Sache                   | Vorschlag                                                                                                                                                                                        | Alternative                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Serie                   | „Dauertermin“ überall, auch in Titel, Knopf und Fehlermeldung; „Serie“ bleibt das Wort für die Vorkommen („Ganze Serie absagen“)                                                                 | „Terminserie“ überall, dann auch im Kalender                                                                             |
| Länge                   | „Dauer“ überall („Andere Dauer …“, „Dauer in Minuten“, „Dauer: 60 Minuten, Dokumentation eingeschlossen“, „Dauer weicht ab“); die Begriffe aus §8.1 bleiben im Code                              | „Länge“ überall, auch am Feld                                                                                            |
| Eintrag ohne Patient:in | „Fehlzeit“ bleibt, bis du die offene Frage aus ANN-111 in der Sichtung beantwortet hast; die Beispiele im Formular an `BEGRIFFE.fehlzeit` festhalten                                             | ein Wort, das Arbeitszeit einschließt (etwa „Blockzeit“) — nicht „Praxistermin“, so heißt schon der Termin in der Praxis |
| Tag absagen             | „Tag umplanen“ bleibt (von dir am 2026-09-26 bestätigt)                                                                                                                                          | „Tag absagen“                                                                                                            |
| offener Termin          | „Steht aus“ überall, neutral, auch in der Akte für vergangene, noch offene Termine                                                                                                               | „Bestätigt“ überall                                                                                                      |
| Titel                   | Verben überall: „Patient:in anlegen“, „Mitarbeiter:in anlegen“, „Verordner:in anlegen“; die Anlegen-Leiste behält deine Nomen („Neuer Termin · Dauertermin · Fehlzeit · Dauerfehlzeit“, BEF-035) | Nomen überall                                                                                                            |
| Konto/Zugang            | „Konto“ = Anmeldung mit E-Mail und Kennwort, „Zugang“ = Freischaltung durch die Praxis (ANN-025); eine Mail, ein Wort: „Anmeldemail“, auch im Betreff; „Anmeldeseite“ statt „Anmeldemaske“       | ein Wort für beides                                                                                                      |
| Versorgungsstatus       | „in Versorgung“ / „nicht in Versorgung“ in Filter, Liste, Suche, Stammdaten und Knopf; „abgeschlossen“ nur für den Abschluss; ist der Abschluss gesetzt, zeigt der Kopf nur ihn                  | „aktiv“ / „inaktiv“                                                                                                      |
| Name in Listen          | „Nachname, Vorname“ mit hervorgehobenem Nachnamen, Sortierung bleibt                                                                                                                             | Anzeige bleibt, Sortierung nach Vorname                                                                                  |

Folge in jedem Fall: ein Durchgang durch die Fundstellen, ANN-111 wird
fortgeschrieben; Wortlaut-Tests ziehen mit.

**Empfehlung.** Die Spalte „Vorschlag“ in einem Durchgang. Ohne Entscheidung
sofort: die Zeile „Praxis: …“ auf „Mein Konto“ streichen (ANN-023 zeigt den
Organisationsnamen nicht an), „Laufende Versorgung“ in den Stammdaten durch
„nicht abgeschlossen“ ersetzen, Gedankenstrich statt Bindestrich, Namen in der
Patientenliste umbrechen statt kürzen.

**Entscheidung (Jannes, 2026-10-09).** Spalte „Vorschlag“ in allen Zeilen: „Dauertermin“, „Dauer“, „Fehlzeit“ bleibt, „Tag umplanen“ bleibt, „Steht aus“, Verben in Titeln, Konto/Zugang mit „Anmeldemail“ und „Anmeldeseite“, „in Versorgung“, „Nachname, Vorname“.

### BEF-141 — Rechnungsliste, offene Posten und Zahlungen zeigen bei ausgestellten Rechnungen den heutigen Empfängernamen

|         |   |
| ------- | - |
| Datum   | 2026-10-10 |
| Bereich | Abrechnung: Rechnungsliste, offene Posten, Zahlungen, Suche |
| Quelle  | Zweitreview UX-EPIC-008 (S3) |
| Status  | erledigt in BEF-141 (2026-10-11) |
| Berührt | `list_invoices`, `list_open_items`, `list_payments` (`supabase/migrations/20261012110000_abr_033_rechnungsliste_suche.sql`); ADR-009 Punkt 10 |

**Beobachtung.** Seit UX-008c lassen sich Empfänger bearbeiten. Das Blatt und die Zahlungserinnerung lesen den Snapshot und bleiben gleich; die drei Listen und die Suche lesen den Namen aber live aus `invoice_recipients` und zeigen bei ausgestellten und stornierten Rechnungen den geänderten Namen.

**Erwartet.** Einzel-Story-Loop im kritischen Pfad: Für `status = 'issued'` den Empfänger aus `snapshot -> 'recipient'` lesen, die Suche ebenso; Datenbanktest „Empfänger geändert, Liste zeigt den alten Namen“. Bis dahin sagt die Oberfläche nur, dass das Blatt bleibt.

**Umsetzung (2026-10-11).** Migration `20261027100000_bef_141_empfaenger_aus_snapshot.sql`: `app.invoice_recipient_name` liest bei ausgestellten Rechnungen Name (und in der Rechnungsliste die Art) aus dem Snapshot; die drei Listen und die Suche nutzen sie. Der Name der Person bleibt der heutige (ANN-339). Test in `supabase/tests/invoices.test.ts`, Gegenprobe ohne Migration rot; der Hinweis am Empfängerformular sagt jetzt, dass auch die Listen den alten Empfänger behalten.

### BEF-129 — Ein widerrufener Trainingsvertrag fällt nach 14 Tagen aus Offene Punkte, auch wenn nichts abgewickelt ist

|         |   |
| ------- | - |
| Datum   | 2026-10-07 |
| Bereich | Training, Angebote |
| Quelle  | Zweitreview KND-EPIC-001 (Hinweis H5), am Code belegt |
| Status  | erledigt 2026-10-11 (BEF-129, Einzel-Story-Loop) |
| Berührt | `public.list_platform_training_withdrawals` in `supabase/migrations/20261016140000_knd_004_training_withdrawal.sql`; ANN-290 |

**Beobachtung.** Nach einem Widerruf bleiben Paket, Leistung und Zugang zum Training bestehen (ANN-290). Offene Punkte zeigt den Widerruf 14 Tage lang; danach steht er nur noch am Trainingsverhältnis („Bitte Paket und Zahlung abwickeln“). Wird er übersehen, kann das Paket trotz Widerruf abgerechnet werden.

**Erwartet.** Jannes entscheidet, ob ein Widerruf in Offene Punkte bleibt, bis das Paket entfernt oder storniert ist (Bedingung statt 14 Tage), oder ob der Monatsentwurf des Trainings ein Paket mit Widerruf sperrt. Einzel-Story-Loop.

**Umsetzung (2026-10-11).** Bedingung statt 14 Tage – der Widerruf bleibt, bis das Paket entfernt ist, mindestens 14 Tage; jede Zeile sagt, ob das Paket noch besteht (ANN-341, Migration `20261028100000`).

### BEF-128 — Ein Abo-Monat lässt sich nach einem Storno nicht zurücknehmen

|         |   |
| ------- | - |
| Datum   | 2026-10-07 |
| Bereich | Abrechnung, Nachsorge-Abo |
| Quelle  | Zweitreview ANG-EPIC-002 (derselbe Fehler am Trainingspaket, dort behoben), am Code belegt |
| Status  | erledigt 2026-10-11 (BEF-128, Einzel-Story-Loop) |
| Berührt | `public.delete_aftercare_month` in `supabase/migrations/20261014110000_ang_002_aftercare_months.sql`; ANN-270 |

**Beobachtung.** Nach einem Storno ist die Rechnungszeile freigegeben (`released_at`), zeigt aber weiter mit RESTRICT auf die Leistung. `delete_aftercare_month` löscht die Leistung, ohne die freigegebenen Zeilen vorher zu entfernen, und scheitert mit `invoice_items_billable_service_id_fkey`; die Oberfläche zeigt „Die Erfassung konnte nicht zurückgenommen werden.“

**Erwartet.** Wie in `delete_billable_services` und `delete_training_package`: freigegebene Zeilen der Leistung zuerst löschen, dazu ein Test „Storno → Zurücknehmen“ in `aftercare-months.test.ts`. Einzel-Story-Loop.

**Umsetzung (2026-10-11).** `delete_aftercare_month` löscht freigegebene Rechnungszeilen mit der Leistung, wie die beiden Vorbilder; Entwurf, ausgestellte und Korrekturrechnung halten den Monat weiter fest (Migration `20261029100000`, zwei Tests in `aftercare-months.test.ts`, Gegenprobe ohne Migration rot).

### BEF-131 — Terminwünsche der Plattform fallen beim Zusammenführen mit der Dublette

|         |   |
| ------- | - |
| Datum   | 2026-10-09 |
| Bereich | Plattform, Dubletten |
| Quelle  | KOM-EPIC-001, Prüfung von `merge_patients` beim Einbau der Rückfragen |
| Status  | erledigt 2026-10-11 (BEF-131, Einzel-Story-Loop) |
| Berührt | `public.merge_patients`, `public.platform_appointment_requests` (POR-009) |

**Beobachtung.** `merge_patients` löscht die Akte der Dublette; `platform_appointment_requests` hängt mit `on delete cascade` an ihr und wird nicht umgehängt. Ein offener oder beantworteter Terminwunsch der Dublette fällt damit beim Zusammenführen still weg. Die Rückfragen (KOM-004) ziehen seit diesem Loop mit; die Terminwünsche wurden bewusst nicht mitgeändert (kein Umbau außerhalb des Auftrags).

**Erwartet.** Eine Zeile in `merge_patients` (`update … set patient_id, relationship_id`) und ein Test in `patient-merge.test.ts`. Einzel-Story-Loop.

**Umsetzung (2026-10-11).** `merge_patients` hängt offene wie beantwortete Terminwünsche an die bleibende Akte um (`patient_id`, `relationship_id`), sonst bleibt der Wunsch unverändert; das Büro sieht ihn unter der bleibenden Akte (Migration `20261030100000`, ein Test in `patient-merge.test.ts`, Gegenprobe ohne Migration rot). Der Zugang der Dublette bleibt BEF-132.

### BEF-132 — Plattformzugang an der Dublette: Rückfragen ziehen um, der Zugang nicht

|         |   |
| ------- | - |
| Datum   | 2026-10-09 |
| Bereich | Plattform, Dubletten |
| Quelle  | Zweitreview KOM-EPIC-001 (H2, H5) |
| Status  | erledigt 2026-10-11 (BEF-132, Einzel-Story-Loop) |
| Berührt | `app.patient_merge_plan`, `public.merge_patients`, `public.add_platform_message_entry`, `public.answer_platform_message` |

**Beobachtung.** Hat die Dublette einen Plattformzugang, ziehen ihre Rückfragen zur bleibenden Akte, der Zugang aber endet mit der Dublette – die Person sieht die Antwort auf ihre Frage nicht mehr. `patient_merge_plan` kennt keinen Sperrgrund dafür, und `counts` nennt die Rückfragen nicht. Daneben (H5): Erledigen und Nachtragen zur selben Zeit enden statt mit 22023 mit dem Constraint-Fehler 23514 – keine Daten gehen verloren, nur die Meldung ist unschön.

**Erwartet.** Sperrgrund `source_has_platform_access` (die Praxis klärt den Zugang vorher, wie ANN-149) und `platform_messages` in `counts`, ebenso `platform_appointment_requests` (ziehen seit BEF-131 mit, Zweitreview BEF-131 H4); für H5 eine Zeilensperre vor der Zustandsprüfung. Einzel-Story-Loop mit Zweitreview.

**Umsetzung (2026-10-11).** `app.patient_merge_plan` sperrt mit `source_has_platform_access`, solange an der Dublette ein Zugang hängt, der nicht entzogen ist (ANN-149, Ergänzung f), und zählt `platform_messages` und `platform_appointment_requests`; beide Zahlen stehen damit auch im Vermerk. `add_platform_message_entry` und `answer_platform_message` sperren die Zeile vor der Zustandsprüfung, nach dem Zweitreview ebenso `confirm_message_attachment_upload`; ein gleichzeitiges Erledigen endet mit 22023 (Migration `20261031100000`, Tests in `patient-merge.test.ts`, `practice-messages.test.ts` und `message-attachments.test.ts`, Helfer `helpers/gleichzeitig.ts`, Gegenprobe ohne Migration rot mit 23514). Die Vorschau nennt Sperre und Zahlen (`zusammenfuehren.ts`, Prüfseite `dublette.html?sperre=plattform`).

### BEF-143 — Nach dem Zurücknehmen nennt eine stornierte Rechnung weniger Positionen, als sie ausweist

|         |   |
| ------- | - |
| Datum   | 2026-10-11 |
| Bereich | Abrechnung: Rechnungsliste, Storno |
| Quelle  | Zweitreview BEF-128 (Hinweis H2), am Code belegt |
| Status  | erledigt 2026-10-11 (BEF-143, Einzel-Story-Loop) |
| Berührt | `public.list_invoices` (`item_count` in `supabase/migrations/20261027100000_bef_141_empfaenger_aus_snapshot.sql`); `delete_billable_services`, `delete_training_package`, `delete_aftercare_month`; `create_correction_draft` |

**Beobachtung.** Wird eine Leistung nach einem Storno zurückgenommen, fällt ihre freigegebene Rechnungszeile mit ihr (seit ABR-003c, ANG-006 und BEF-128). `list_invoices` zählt die Positionen aber live über `invoice_items`; die stornierte Rechnung zeigt dann weniger oder null Positionen, der Betrag kommt weiter aus dem Snapshot. War es die einzige Leistung, bleibt das Storno ohne Korrektur „offen“, und `create_correction_draft` meldet „no billable services“.

**Erwartet.** Die Zahl der Positionen ausgestellter Rechnungen aus dem Snapshot lesen (wie den Empfänger seit BEF-141), und ein Storno ohne verbleibende Leistung nicht mehr als wartende Korrektur führen. Einzel-Story-Loop.

**Umsetzung (2026-10-11).** `list_invoices` zählt an ausgestellten Rechnungen (storniert eingeschlossen) die Positionen aus `snapshot -> 'items'`, der Entwurf weiter live. Die Auswahl der Korrektur steht unverändert in `app.correction_draft_services`; `get_invoice` liefert daraus `correction_pending` – wahr nur, wenn die stornierte Rechnung keine Korrektur hat und die Korrektur eine Zeile hätte. Die Detailseite bietet „Korrekturrechnung erstellen“ nur dann an und sagt sonst „Von ihren Leistungen ist keine mehr abzurechnen – eine Korrekturrechnung braucht es nicht.“ Kommt eine Leistung derselben Klammer nach, wartet das Storno wieder (ANN-077). Migration `20261101100000`, sechs Tests in `invoice-cancellations.test.ts` (Gegenprobe ohne Migration rot), Prüfseite `terminhonorar.html?seite=storniert`, Sichtung [UX-Review](../../sichtung/ux-review.md) Schritt 11.

### BEF-144 — Die Auskunft aus der Akte nennt keine Terminwünsche der Plattform

|         |   |
| ------- | - |
| Datum   | 2026-10-11 |
| Bereich | Datenschutz: Auskunft (Art. 15), Plattform |
| Quelle  | Zweitreview BEF-131 (Hinweis H5), am Code belegt |
| Status  | erledigt in BEF-144 (2026-10-11) |
| Berührt | `public.export_patient_record` (zuletzt `supabase/migrations/20261020120000_kom_004_messages_in_record.sql`), `public.platform_appointment_requests` (POR-009) |

**Beobachtung.** `export_patient_record` liefert seit KOM-004 die Rückfragen der Plattform, aber keine Terminwünsche (`platform_appointment_requests`). Die Auskunft über die Plattform (`platform_export`) nennt sie; die Auskunft, die die Praxis aus der Akte zieht, nicht. Vorbestehend, nicht durch BEF-131 entstanden.

**Erwartet.** `platform_appointment_requests` der Akte in `export_patient_record` (Tage, Tageszeiten, Notiz, Zustand, Antwort), ein Test in der Auskunftsdatei. Einzel-Story-Loop.

**Umsetzung (2026-10-11).** `export_patient_record` liefert den Abschnitt `platform_appointment_requests`: offene und beantwortete Wünsche der Akte mit Art, Termin, Tagen, Tageszeiten, Notiz, Zustand, Zeitpunkten, Antwort und Ergebnistermin, dazu wer gewünscht hat (Person oder Vertretung mit Namen, wie die Praxisliste aus POR-011); keine Kennung von Wunsch, Zugang oder Konto, Wünsche eines Trainingsverhältnisses nicht (ADR-021). Beschriftung in `src/features/datenschutz/kategorien.ts`, Test in `betroffenenrechte.test.ts`, Migration `20261102100000`, Gegenprobe ohne Migration rot. Daneben (Hinweis Zweitreview BEF-132): `close_platform_message_by_practice` und `close_platform_message` sperren den Vorgang vor der Zustandsprüfung; ein zweites gleichzeitiges Erledigen endet mit 22023, der erste Vermerk bleibt (Migration `20261102110000`, zwei Tests in `practice-messages.test.ts`, Gegenprobe rot). Der Vollständigkeitstest der Auskunft sah die Lücke nicht – BEF-145.

### BEF-145 — Der Vollständigkeitstest der Auskunft sieht nur zwei Datenklassen

|         |   |
| ------- | - |
| Datum   | 2026-10-11 |
| Bereich | Datenschutz: Auskunft (Art. 15) |
| Quelle  | Zweitreview BEF-144 (Hinweis H1), am Code belegt |
| Status  | erledigt in BEF-145 (2026-10-11) |
| Berührt | `supabase/tests/betroffenenrechte.test.ts` („enthaelt jede Tabelle der Akte aus dem Aufbewahrungsplan“), `public.retention_assignments`, `public.export_patient_record` |

**Beobachtung.** Der Test hält die Auskunft nur gegen die Tabellen der Klassen `patientenakte` und `personenstammdaten`. `platform_appointment_requests` trägt die Klasse `terminwunsch` und fehlte deshalb unbemerkt in der Kopie (BEF-144); eine künftige patientenbezogene Tabelle mit eigener Klasse fiele wieder durch.

**Erwartet.** Der Test nimmt jede Tabelle des Aufbewahrungsplans, die eine `patient_id` trägt, gleich welcher Klasse; was bewusst fehlt, steht mit Grund in `BEWUSST_AUSSEN`. Nur Test, ein Einzel-Story-Loop; zeigt er weitere Lücken, kommen sie in denselben Loop.

**Umsetzung (2026-10-11).** Der Test nimmt jetzt jede Tabelle des Aufbewahrungsplans mit `patient_id`, gleich welcher Klasse, dazu wie bisher `patientenakte` und `personenstammdaten`; eine Tabelle, die unter anderem Namen in der Kopie steht, nennt `ABSCHNITT_FUER` (`patient_fee_agreements` als `fee_agreements`). Er fand eine echte Lücke: `platform_accesses` (Klasse `plattformzugang`). `export_patient_record` liefert dazu den Abschnitt `platform_accesses` – Art, Vertretung mit Name, Grundlage, Nachweisarten und Umfang, Einwilligung zur Begleitung, Zustand mit Zeitpunkten und Grund, Einstieg; keine Kennung von Zugang, Konto, Verhältnis oder Praxiskonto (ANN-342). Migration `20261103100000`, Beschriftung in `src/features/datenschutz/kategorien.ts`, Test in `betroffenenrechte.test.ts`, Gegenprobe ohne Migration rot. Zweitreview: kein Blocker; S1 (Testfall rechtliche Vertretung mit Zweifelvermerk und beendetem Zugang) eingebaut; H6 als BEF-146 geführt.

### BEF-151 — Akte und Patientenliste: „Nicht in Versorgung“, Karteileichen und Zahlungsstand

|         |   |
| ------- | - |
| Datum   | 2026-10-14 |
| Bereich | Patient:innen und Akte |
| Quelle  | Jannes, Durchsicht am Rechner (Befund B1) |
| Status  | erledigt in PR #241 (gemergt 2026-10-15) |
| Berührt | `patients.status`, `set_patient_status`, Patientenliste, Akte „Verordnungen“, Offene Punkte, Fristanker (ADR-008) |

**Beobachtung.** „Nicht in Versorgung“ pflegt niemand und sperrt nur Termine. Karteileichen – eine offene Verordnung, der Termine fehlen oder die abzurechnen ist – sieht man nirgends; was abgerechnet, bezahlt und zu mahnen ist, steht verstreut. Ohne den Status braucht die Aufbewahrung trotzdem ein Ankerdatum.

**Erwartet.** Status entfernen (ANN-510); Liste und Akte zeigen Stand der Verordnungen, Rechnungen, Zahlungen und fällige Mahnungen (ANN-514, ANN-516); Fristanker aus letzter Behandlung oder Leistung (ADR-008 Fassung 3, ANN-511).

**Umsetzung (2026-10-14).** PR #241: Status entfernt (ANN-510); Liste und Akte zeigen den Stand der Verordnungen, für owner und office auch Offenes, Überfälliges und „Zu mahnen“ (ANN-514, ANN-516); Fristanker ist die letzte Behandlung (ADR-008 Fassung 3, ANN-511), Akten ohne Behandlung legt „Offen“ nach sechs Monaten vor.

### BEF-152 — Fahrzeit passt nicht: kein Weg, den Termin zu verschieben

|         |   |
| ------- | - |
| Datum   | 2026-10-14 |
| Bereich | Kalender, Termine, Warteliste |
| Quelle  | Jannes, Durchsicht am Rechner (Befund B2, Bild 1) |
| Status  | erledigt in PR #244 (gemergt 2026-10-15) |
| Berührt | Hinweis „Fahrzeit zu knapp/zu lang“ am Termin |

**Beobachtung.** Beim Anlegen nennt „Anfahrt zu knapp“ den frühesten Beginn, bietet aber keinen Weg dorthin; ebenso bei zu langer Fahrt oder Rückfahrt.

**Erwartet.** Ein optionaler Knopf „Auf 16:25 verschieben“ auf die früheste passende Zeit im 5-Minuten-Raster; zur ursprünglichen Zeit anlegen bleibt möglich.

**Umsetzung (2026-10-14).** PR #244: „Passt es?“ bietet „Auf … verschieben“ oder „vorziehen“ auf die früheste passende Zeit im Raster an, nur wenn die Gegenseite dann noch passt; der Server prüft nach dem Tipp neu (ANN-530).

### BEF-154 — Festschreiben hakt den Termin ab

|         |   |
| ------- | - |
| Datum   | 2026-10-14 |
| Bereich | Übersicht (Tag); Kalender, Termine, Warteliste; Dokumentation |
| Quelle  | Jannes, Durchsicht am Rechner (Befund B4) |
| Status  | erledigt in PR #241 (gemergt 2026-10-15) |
| Berührt | `complete_treatment`, `app.mark_appointment_documented`, `reopen_appointment`, Tagesliste, Terminfenster |

**Beobachtung.** Die festgeschriebene Doku hakt den Termin mit ab; zurücknehmen geht nur kurz nach dem Haken und nicht an einem dokumentierten Termin.

**Erwartet.** Dokumentieren und Abhaken getrennt; abgehakt wird in Übersicht oder Kalender, jederzeit rücknehmbar (ADR-018 Fassung 5, ANN-512).

**Umsetzung (2026-10-14).** PR #241: Der Haken ist ein Merkmal neben dem Zustand, Festschreiben hakt nicht ab; „Abhaken“ und „Haken zurücknehmen“ an der Zeile und im Terminfenster, solange die Verordnung nicht in der Abrechnung steht (ADR-018 Fassung 5, ANN-512).

### BEF-155 — Mitgelieferte Textbausteine bis auf den Befund

|         |   |
| ------- | - |
| Datum   | 2026-10-14 |
| Bereich | Dokumentation |
| Quelle  | Jannes, Durchsicht am Rechner (Befund B5) |
| Status  | erledigt in PR #244 (gemergt 2026-10-15) |
| Berührt | Startinhalte der Textbausteine |

**Beobachtung.** Die mitgelieferten Bausteine passen nicht zum Alltag der einzelnen Therapeut:in.

**Erwartet.** Der Baustein zum Befund bleibt; die übrigen mitgelieferten werden nicht mehr eingeblendet, jede Therapeut:in legt sich eigene an.

**Umsetzung (2026-10-14).** PR #244: Die Leiste zeigt „Wie zuletzt“, „+ Befund“ und nur eigene Bausteine; die Bausteine der Praxis sieht nur owner, eingeklappt (ANN-531).

### BEF-156 — Kein Fahrtbalken nach einem abgehakten Termin

|         |   |
| ------- | - |
| Datum   | 2026-10-14 |
| Bereich | Übersicht (Tag) |
| Quelle  | Jannes, Durchsicht am Rechner (Befund B6, Bild 2) |
| Status  | erledigt in PR #244 (gemergt 2026-10-15); ANN-532 von Jannes bestätigt |
| Berührt | Zeitstrahl der Tagesübersicht |

**Beobachtung.** Nach einem abgehakten Termin fehlt der Fahrtbalken zum nächsten Termin; an der Karte des nächsten Wegs steht nur die Fahrzeit als Text (Bild 2).

**Erwartet.** Der Balken steht auch dort.

**Umsetzung (2026-10-14).** PR #244: Der Wegbalken steht an der Karte des nächsten Wegs und an der aufgeklappten Zeile; ist das Ende davor vorbei, rechnet er ab jetzt wie die Kachel „Abfahrt“ (ANN-532).

### BEF-157 — Heilmittel abhaken am Termin; keine Freigabe zur Abrechnung

|         |   |
| ------- | - |
| Datum   | 2026-10-14 |
| Bereich | Kalender, Termine, Warteliste; Dokumentation; Abrechnung, Statistiken |
| Quelle  | Jannes, Durchsicht am Rechner (Befund B7) |
| Status  | erledigt in PR #241 (gemergt 2026-10-15); Nachträge bleiben nach der Freigabe gesperrt (ANN-515 bestätigt) |
| Berührt | `HeilmittelBestaetigen`, `billable_services`, `treatment_bases`, Sperre der Doku |

**Beobachtung.** Am Termin werden Heilmittel abgehakt, obwohl der Haken am Termin schon sagt, dass behandelt wurde; was erbracht ist und wann eine Verordnung abzurechnen ist, steht nirgends.

**Erwartet.** Leistung zeigen statt abhaken („2. von 10 Terminen · KG“ oder ohne Verordnung der Betrag); der Haken heißt erbracht; ist die Verordnung vollständig, mit einem Tipp in die Abrechnung stellen, danach Doku, Zeit und Terminzahl gesperrt (ADR-009 Fassung 6, ANN-513 bis ANN-515).

**Umsetzung (2026-10-14).** PR #241: Leistung statt Heilmittel-Haken; Haken und festgeschriebene Doku erfassen die Leistung (ANN-513); „In die Abrechnung stellen“ mit einem Tipp, danach sperrt der Server Doku, Zeit und Terminzahl bis zum Zurückholen, auch gegen gleichzeitige Schreibvorgänge (ADR-009 Fassung 6, ANN-514, ANN-515).

### BEF-158 — Folgetermin: nicht rücknehmbar, ohne Kontext, mit unmöglichen Vorschlägen

|         |   |
| ------- | - |
| Datum   | 2026-10-14 |
| Bereich | Kalender, Termine, Warteliste |
| Quelle  | Jannes, Durchsicht am Rechner (Befund B8) |
| Status  | erledigt in PR #244 (gemergt 2026-10-15); ANN-534 von Jannes bestätigt |
| Berührt | Folgetermin nach dem Haken |

**Beobachtung.** Ein angelegter Folgetermin lässt sich nicht zurücknehmen; Therapeut:in, Nachbartermine, Dauer und Fahrzeit stehen nicht dabei, und es werden Zeiten vorgeschlagen, die nicht gehen.

**Erwartet.** Rücknehmbar, mit Therapeut:in, Nachbarn, Dauer und Passung der Fahrt; Unmögliches wird nicht vorgeschlagen.

**Umsetzung (2026-10-14).** PR #244: Vorschläge als Zeilen mit Therapeut:in, Nachbarn, Dauer und Passung der Wege (ANN-535); 15 Minuten „Rückgängig“, das den Termin löscht oder – sieht die Person ihre Termine auf der Plattform – nach Rückfrage absagt (ANN-534).

### BEF-159 — Übungsplan zu umständlich

|         |   |
| ------- | - |
| Datum   | 2026-10-14 |
| Bereich | Training und Übungen |
| Quelle  | Jannes, Durchsicht am Rechner (Befund B9, Bild 3) |
| Status  | erledigt in PR #244 (gemergt 2026-10-15); ANN-536 von Jannes bestätigt |
| Berührt | Übungsplan anlegen und bearbeiten |

**Beobachtung.** Den aktuellen Plan zu erstellen kostet zu viele Klicks; „pro Woche“ ist nicht zu finden, und aus Vorlage und Katalog kamen plötzlich zehn Übungen auf einmal statt einzeln wählbarer (Bild 3).

**Erwartet.** Mit wenig Klicks, einzeln wählbare Übungen, Häufigkeit pro Woche; bei Therapeutenwechsel sichtbar, auf welchem Stand der Plan ist; Änderungen erscheinen als aktualisierter Plan auf der Plattform, und der Plan nützt auch ohne Plattform.

**Umsetzung (2026-10-14).** PR #244: Eine Übungsliste, die Vorlage als Vorschau mit einzeln wählbaren Übungen, Häufigkeit im Entwurf, Fassung und Stand im Kopf und auf der Plattform (ANN-537, ANN-538); Fehlendes übernimmt nur owner aus dem Katalog (ANN-536).

### BEF-160 — Patientenliste nur über die Suche ab drei Zeichen

|         |   |
| ------- | - |
| Datum   | 2026-10-14 |
| Bereich | Patient:innen und Akte; Kalender, Termine, Warteliste |
| Quelle  | Jannes, Durchsicht am Rechner (Befund B10) |
| Status  | erledigt in PR #241 (gemergt 2026-10-15) |
| Berührt | Patientenliste, Wahl der Person für Termin und Dauertermin |

**Beobachtung.** Wer eine Person sucht, muss drei Zeichen tippen; sortieren oder filtern geht nicht.

**Erwartet.** Liste filterbar und sortierbar (zuletzt behandelt, offene Verordnung, A–Z), Rechte und RLS unverändert (ANN-517).

**Umsetzung (2026-10-14).** PR #241: Die Liste steht sofort, Suche ab dem ersten Zeichen, Sortieren und Auswahl in der Filterleiste; dieselbe Liste beim Neuen Termin und beim Dauertermin (ANN-517).

### BEF-161 — Die Praxis sieht nicht, was die Person auf der Plattform sieht

|         |   |
| ------- | - |
| Datum   | 2026-10-14 |
| Bereich | Plattform (Patient:innen, Kund:innen) |
| Quelle  | Jannes, Durchsicht am Rechner (Befund B11) |
| Status  | erledigt in PR #242 (gemergt 2026-10-15) |
| Berührt | Akte „Plattform“, `/p` |

**Beobachtung.** Was eine Person auf der Plattform sieht, kann die Praxis nicht nachvollziehen.

**Erwartet.** Eine nur lesende Einsicht in die Plattform der Person (ADR-023, Pfad A).

**Umsetzung (2026-10-14).** PR #242: owner sieht über „So sieht ‹Vorname› die Plattform“ die Plattform der Person nur lesend, über eine feste Liste lesender Projektionen, protokolliert wie das Öffnen der Akte (ADR-023 Fassung 5, ANN-525 bis ANN-529).

### BEF-162 — „Ausfall“ nur über Umwege

|         |   |
| ------- | - |
| Datum   | 2026-10-14 |
| Bereich | Übersicht (Tag) |
| Quelle  | Jannes, Durchsicht am Rechner (Befund B12) |
| Status  | erledigt in PR #244 (gemergt 2026-10-15) |
| Berührt | Zeilen der Tagesliste |

**Beobachtung.** „Niemand öffnet?“ steht nur am nächsten Weg, nicht an den übrigen Patientenzeilen.

**Erwartet.** An jeder Patientenzeile ein Knopf „Ausfall“, der durch das Protokoll nach ADR-018 Punkt 9 führt.

**Umsetzung (2026-10-14).** PR #244: „Ausfall“ an jeder begonnenen Behandlung ohne Doku in Zeitstrahl, Karten, „Heute noch offen“ und „Nachzuholen“ (ANN-533).

### BEF-163 — Alles auch am Telefon

|         |   |
| ------- | - |
| Datum   | 2026-10-14 |
| Bereich | alle berührten Bereiche |
| Quelle  | Jannes, Durchsicht am Rechner (Befund B13) |
| Status  | erledigt in PR #241 bis #244 (gemergt 2026-10-15; Bildpaare 375 und 1280 px im Bericht) |
| Berührt | jede Änderung aus BEF-151 bis BEF-162 |

**Beobachtung.** Die Durchsicht lief am Rechner; das Hauptgerät ist das Telefon.

**Erwartet.** Jede Änderung funktioniert bei 375 px (Bildstrecke 375 und 1280 px je Befund).

**Umsetzung (2026-10-14).** PR #241 bis #244: jede Änderung bei 375 px gebaut und angesehen; Bildpaare 375 und 1280 px je Befund im Bericht.

### BEF-164 — Zwei DB-Tests rechnen „heute“ in UTC und werden zwischen 0 und 2 Uhr Berliner Zeit rot

|         |   |
| ------- | - |
| Datum   | 2026-10-14 |
| Bereich | Prüfverfahren |
| Quelle  | CI an #241 und #243 („Migrationen und RLS-Tests“, Teil 1/4 und 2/4) um 0:02 bis 0:06 Uhr Berliner Zeit (22:02 bis 22:06 UTC); auf `main` zur selben Uhrzeit nachgestellt |
| Status  | erledigt in PR #245 |
| Berührt | `supabase/tests/progress-events.test.ts`, `supabase/tests/message-attachments.test.ts` |

**Beobachtung.** „nennt die Tage durchgeführter Termine“ erwartet Tinas Seed-Stunde von vorgestern am Praxistag minus zwei. Der Seed setzt „heute“ beim Aufbau aber mit dem UTC-Datum, und das liegt zwischen 0 und 2 Uhr Berliner Zeit einen Tag hinter dem Praxistag: geliefert `2026-10-12`, erwartet `2026-10-13`. Dahinter lag verdeckt dieselbe Abweichung bei Erikas Hausbesuch „heute“. „… Widerruf vom Papier …“ trägt den Widerruf mit `tagInTagen(0)` (UTC) ein, die Einwilligung auf der Plattform aber mit dem Praxistag – „withdrawal before consent“. Wie BEF-130: Der Code ist richtig, die Erwartung nicht.

**Erwartet.** Beide Tests rechnen mit dem Tag der Praxis; keine Prüfung wird schwächer.

**Umsetzung (2026-10-15).** `progress-events` liest den erwarteten Tag aus den Seed-Terminen selbst (`tagDesTermins`, in der Zeitzone der Praxis), `message-attachments` vermerkt den Widerruf mit `praxistag(0)`. Nachgestellt mit verschobener Uhr (libfaketime; Datenbank und Tests auf 0:20 Uhr Berliner Zeit): auf `main` beide rot mit den Meldungen aus der CI, mit der Korrektur 43 von 43 grün. Den Seed auf den Praxistag umzustellen, wie im Kommentar an #241 vorgeschlagen, reichte nicht: Ein Lauf über Mitternacht trennt den Aufbau des Seeds und den Test ohnehin.

### BEF-149 — „Check-in ausgeblieben“ fehlt in der Übersicht der Praxis

|         |   |
| ------- | - |
| Datum   | 2026-10-12 |
| Bereich | Plattform: Check-in (TRK-EPIC-001) |
| Quelle  | Zuschnitt TRK-EPIC-001, DSN-001 Abschnitt 6 und D5 |
| Status  | verworfen (Jannes, 2026-10-15) |
| Berührt | Übersicht der Praxis (Offene Punkte), `app.checkin_due_on` |

**Beobachtung.** DSN-001 nennt „Check-in ausgeblieben“ als organisatorischen Punkt in der Übersicht der zuständigen Person („seit 10 Tagen kein Check-in“). TRK-EPIC-001 zeigt Fälligkeit und „fällig seit …“ nur im Abschnitt „Zwischen den Terminen“ an Akte und Trainingsverhältnis; eine Liste über alle Personen gibt es nicht.

**Erwartet.** Entscheiden, ob der Punkt gebraucht wird; wenn ja, Einzel-Story-Loop: Zahl der Verhältnisse, deren Check-in seit mindestens einem Takt fällig ist, je Bereich in Offene Punkte – organisatorisch, ohne Wert und ohne Bewertung (ADR-006 Punkt 11).

**Entscheidung (2026-10-15).** Jannes: „Nein“ – keine Liste „Check-in ausgeblieben“ in der Übersicht. Die Fälligkeit bleibt an Akte und Trainingsverhältnis.

### BEF-165 — Der Hinweis nach § 19 UStG steht nicht im Schnappschuss der Rechnung

|         |   |
| ------- | - |
| Datum   | 2026-10-15 |
| Bereich | Abrechnung: Rechnung, Ausdruck |
| Quelle  | Zweitreview zur PR vom 2026-10-15 (Checkliste Punkt 9, Rechnungsdaten) |
| Status  | erledigt 2026-10-15 (Bereichsüberholung 4, Migration `abr_040_monatslauf`): `app.small_business_notice()` schreibt den Hinweis beim Ausstellen ins Dokument (`issuer.small_business_notice`, `schema_version` 6); Ansicht und Blatt zeigen ihn aus dem Dokument, ältere Snapshots über `src/features/billing/hinweise.ts`; ANN-541 verankert dort |
| Berührt | `KLEINUNTERNEHMER_HINWEIS` in `src/features/billing/api.ts`, `InvoiceDetailPage.tsx`, `InvoicePrintPage.tsx`, `app.build_invoice_document` |

**Beobachtung.** Ob der Hinweis erscheint, entscheidet `issuer.small_business` aus dem Schnappschuss. Den Wortlaut setzt aber der Client. Eine neue Formulierung (zuletzt ANN-541) ändert damit auch das Bild schon ausgestellter Rechnungen. Der Befreiungsgrund nach § 4 Nr. 14 steht dagegen im Schnappschuss (ANN-082). Heute ohne Folge: Echte Rechnungen gibt es noch nicht.

**Erwartet.** Vor dem ersten echten Rechnungslauf, zusammen mit der Antwort aus B4: Den Hinweis beim Ausstellen ins Dokument schreiben (wie `exemption_reason`), `schema_version` erhöhen, nur aus dem Dokument anzeigen.

### BEF-049 — Menü und Untermenü: Die Vorschau „Kommunikation“ belegt einen Tab, Organisatorisches ist am Handy zu lang, „Arbeitszeiten“ beginnt mit Einstellungen

|         |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-27                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Bereich | Tableiste (unter 640 px), Alle Bereiche (`/bereiche`), Kopfsuche, Kommunikation (`/team`), Untermenü Organisatorisches, Arbeitszeiten (`/praxis/planung`), Radflotte (Vorschau)                                                                                                                                                                                                                                                                                                           |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390/820/1440 px, Gegenprüfung; Review-IDs NAV-07, VOR-04, VOR-09, ORG-08, ORG-06                                                                                                                                                                                                                                                                                                                                                        |
| Status  | entschieden 2026-10-05 (Jannes), Option 2; gebaut in RAH-EPIC-001 (2026-10-06): Tableiste nach Reife (ANN-244), Satz auf `/bereiche`, Vorschau-Protokoll in der Suche, „Sicherheit und Aufbewahrung“ als ein Punkt mit Reitern, Verlauf am scrollbaren Rand, „Praxiseinstellungen“ eingeklappt unter den Arbeitszeiten. Rest erledigt in FLT-EPIC-001 (2026-10-15): „Panne melden“, „Fahrrad-Check-Up“ und „Schlüssel eintragen“ als Vorgänge in der Suche, Panne mit einem Tipp aus der Radflotte |
| Berührt | `src/app/navigation.tsx` (`betriebUnterpunkte`, `tableiste`), `src/app/BereichePage.tsx` (Z. 38–41), `src/app/funktionen.ts` (Z. 245–266), `src/components/ui/SubNav.tsx` (Z. 40–58), `src/features/scheduling/SchedulingPage.tsx` (Z. 122, 211, 580–603), `src/features/staff/StaffMemberDetailPage.tsx` (Z. 259–264), `tests/e2e/organisation.spec.ts` (Z. 26–28); ANN-111, ANN-112; Festlegung vom 2026-09-22 (keine neuen Vorschau-Kennzeichnungen, `ARBEITSBEREICHE.md` Abschnitt 2) |

**Beobachtung.**

- **Tableiste und Kennzeichnung.** Die Tableiste nimmt bei mehr als fünf
  Bereichen die ersten vier — für owner und office Übersicht, Kalender,
  Patienten, Nachrichten; Abrechnung und Organisatorisches liegen hinter „Mehr“.
  „Kommunikation“ ist ganz Vorschau (Teamchat ohne Versand) und trägt weder in
  Seitenleiste, Tableiste noch Kopfsuche ein Vorschau-Zeichen; die Seite sagt es
  nur im Knopf „In die Vorschau schreiben“. `/bereiche` behauptet: „Bereiche
  ohne fertige Hintergrundfunktionen sind als Vorschau gekennzeichnet.“ — die
  Liste darüber kennzeichnet keinen. Der einzige Weg zum Vorschau-Protokoll
  steht dort; therapist und team_lead haben keinen „Mehr“-Eintrag, und ab 640 px
  führt kein Menü hin.
- **Untermenü Organisatorisches.** owner hat sechs Punkte plus „Vorschau (4)“;
  bei 390 px sind nur Mitarbeitende, Arbeitszeiten und Textbausteine ganz zu
  sehen, der Rest liegt rechts außerhalb, ohne Verlauf oder Pfeil — auf den
  Sicherheitsseiten auch der aktive Punkt selbst. Das beantwortet die offene
  Frage aus ANN-112 mit einer Messung: Auch eingeklappt ist die Leiste für owner
  zu lang.
- **Pannenweg.** „Panne melden“ liegt vier (therapist) bzw. fünf Tipps (owner,
  office) tief; die Kopfsuche findet „Panne“ nicht.
- **Arbeitszeiten.** Für owner stehen Praxisraster, Frist der automatischen
  Finalisierung und Startort der Touren als offene Karten mit eigenen
  Hauptknöpfen vor den Arbeitszeiten; „Behandelnde Person“ beginnt bei 1 610 px
  (390), 1 361 px (820) und 1 314 px (1440). Der Weg „Arbeitszeiten“ aus dem
  Mitarbeiterdatensatz landet beim Minutenraster, und die Dokumentationsfrist
  sucht unter „Arbeitszeiten“ niemand.

**Frage an Jannes.** (1) Wie weit sollen Vorschauen aus der Navigation
zurücktreten — bis ganz aus dem Menü (die offene Frage aus ANN-112)? (2) Wohin
gehören Raster, Frist und Startort?

**Optionen.**

1. **Nur berichtigen:** den Satz auf `/bereiche` an den Stand anpassen (etwa
   „Vorschauen — im Untermenü so bezeichnet — und die Kommunikation speichern
   nichts; was dort simuliert wurde, steht im Vorschau-Protokoll.“), von dort
   und aus der Suche ein Weg zum Vorschau-Protokoll für alle Rollen;
   Arbeitszeiten zuerst, Raster, Frist und Startort darunter eingeklappt als
   „Praxiseinstellungen“. Folge: kleinste Änderung; ein Daumenziel führt weiter
   in einen Chat ohne Versand, das Untermenü bleibt am Handy zu lang.
2. **Wie 1, dazu Reife vor Reihenfolge:** Die Tableiste überspringt Bereiche,
   die ganz Vorschau sind — owner und office sehen Übersicht, Kalender,
   Patienten, Abrechnung, Mehr; Sicherheit und Aufbewahrung werden ein Punkt;
   „Panne melden“ und „Schlüssel entnehmen“ findet die Suche als Vorgänge.
   Folge: Abrechnung mit einem Tipp, ein kürzeres Untermenü; die sechs Bereiche
   und ihre Reihenfolge in der Seitenleiste bleiben, und es entsteht keine neue
   Vorschau-Kennzeichnung.
3. **Vorschauen ganz aus dem Menü,** erreichbar nur über „Alle Bereiche“ und die
   Suche. Folge: das kürzeste Menü; wer eine Vorschau zeigen will, muss sie
   suchen.

**Empfehlung.** Option 2, Raster, Frist und Startort eingeklappt unter den
Arbeitszeiten (kein neuer Menüpunkt, das Untermenü soll kürzer werden). Ein
Vorschau-Zeichen an „Kommunikation“ empfiehlt dieser Befund bewusst nicht: Nach
deiner Festlegung vom 2026-09-22 entsteht eine Kennzeichnung nicht neu
(`ARBEITSBEREICHE.md` Abschnitt 2); der Satz auf `/bereiche` wird deshalb an den
Stand angepasst, nicht die Bereiche an den Satz. Den aktiven Punkt rollt das
Untermenü seit UXR-001 ins Bild (Review VOR-05, UIK-10); ohne Entscheidung
offen bleibt ein Verlauf am scrollbaren Rand; die E2E-Prüfung soll Sichtbarkeit prüfen statt
zu klicken. Den Pannenweg mit einem Tipp von der Übersicht baut FLT-EPIC-001.

### BEF-169 — Ein Folgetermintest hängt am Datum des Laufs (Zeitumstellung)

|         |   |
| ------- | - |
| Datum   | 2026-10-15 |
| Bereich | Tests, Termine |
| Quelle  | FLT-EPIC-001, voller Lauf von `pnpm test` um 23:41 Uhr UTC |
| Status  | erledigt in FLT-EPIC-001 (Uhrzeit vor Ort statt fester UTC-Zeit im Test) |
| Berührt | `src/features/appointments/FolgeterminVorschlaege.test.tsx` („nennt einen schon geplanten nächsten Termin mit Therapeut:in“, ANN-477) |

**Beobachtung.** Der Test legt den Termin auf „heute + 2“ um 08:00 UTC und den nächsten eine Woche später ebenfalls um 08:00 UTC. Liegt die Zeitumstellung am 25.10. dazwischen, zeigt die Seite 09:00 statt 10:00 Uhr; vom 16. bis 22.10. (Berliner Tag) ist der Test deshalb rot, auf `main` ebenso. **Erwartet:** Der zweite Termin steht zur selben Uhrzeit vor Ort (`zeitpunktIn`), wie in den übrigen Tests der Datei. Behoben im selben PR, weil die CI sonst eine Woche rot ist.

### BEF-172 — Nach einer Auslieferung lädt eine offene Seite das 3D-Rad nicht und schiebt es auf den Browser

|         |   |
| ------- | - |
| Datum   | 2026-10-16 |
| Bereich | Radflotte (3D-Rad); Auslieferung der Test-Umgebung (OPS-002a) |
| Quelle  | Jannes in der Test-Umgebung nach #254 („Das 3D-Modell lässt sich in diesem Browser nicht anzeigen“); nachgestellt mit den Builds von #253 und #254 |
| Status  | erledigt in FLT-005/006 (Meldung getrennt, „Neu laden“) und ANN-563 (alte Dateien bleiben 7 Tage) |
| Berührt | `src/features/fleet/bike3d/BikeModel3D.tsx`; Schritt „Hochladen“ in `.github/workflows/test-umgebung.yml`; ADR-024 Punkt 2 |

**Beobachtung.** Das 3D-Modul ist eine eigene Datei, deren Name sich mit jedem Build ändert (`viewer-DegDh5Fw.js` mit #253, `viewer-BNuvwWZ3.js` mit #254, obwohl #254 die Radflotte nicht berührte). Die Auslieferung löschte die alte sofort (`rsync --delete`); eine vorher geöffnete Seite fand sie nicht mehr, und die Seite meldete jeden Fehler gleich: Der Browser könne kein 3D. Karte und Werkstattbilder träfe es ebenso. **Erwartet:** Offene Seiten laden ihre Teile weiter; scheitert das Laden doch, steht „ließ sich nicht laden“ mit „Neu laden“ da, und nur ohne WebGL nennt die Seite den Browser.
