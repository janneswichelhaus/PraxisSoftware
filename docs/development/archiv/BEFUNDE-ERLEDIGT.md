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
