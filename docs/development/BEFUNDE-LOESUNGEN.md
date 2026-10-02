# Offene Befunde: Lösungsanalyse

Stand: 2026-10-02 · Codestand `main` 32745fa (nach PR #165) · 59 offene Befunde aus
[`BEFUNDE.md`](BEFUNDE.md)

## Zweck und Lesart

Dieses Dokument beantwortet für jeden offenen Befund drei Fragen: Was steht **heute** im Code
(viele Befunde sind vom 2026-09-27 und älter; seitdem sind UX-EPIC-005, das UI-Redesign mit den
Zyklen 1 bis 5, UXR-001 bis UXR-010 und POR-EPIC-001/-001b gemergt), welche Lösung ist die
**beste**, und was ist der **Umsetzungspfad** (Dateien, Tests, Aufwand, Pfad A oder S nach
`GRAPH-ENGINEERING-WORKFLOW.md`, offene Entscheidung). Es hat **keinen Rang**, ist kein Auftrag
und ändert keine Reihenfolge; verbindlich wird ein Befund erst im SPEC-Schritt des Loops, der ihn
aufnimmt (`ROADMAP.md`, Regel R6). Die Roadmap 7.6 hat BEF-092 bis BEF-119 bereits als
**ABN-EPIC-001** und **ABR-EPIC-007** eingeplant; diese Analyse ist die Vorarbeit für deren
SPEC-Schritt und für die Entscheidungen zu BEF-046 bis BEF-070.

Geprüft wurde am Code von `main`; die beiden verbliebenen Remote-Branches
(`claude/naechste-schritte-prioritaeten-k86na7`, `claude/qr-code-rechnungen-kostenvoranschlag-nfidry`)
tragen keine Arbeit zu diesen Befunden. Aufwand: S (Stunden), M (ein bis zwei Tage), L (mehr).

## Übersicht

| Befund  | Stand im Code                    | Empfohlene Lösung in einem Satz                                                        | Pfad | Aufw. | Bündel                | Jannes nötig?                       |
| ------- | -------------------------------- | -------------------------------------------------------------------------------------- | ---- | ----- | --------------------- | ----------------------------------- |
| BEF-001 | **im Kern erledigt** (Schreibseite) | Nachmessen (Feld bei ≈150 statt 458 px), schließen; Rest in BEF-057                | S    | S     | Docs/Schreibseite 2   | nein (ANN-200 bestätigen)           |
| BEF-005 | **erledigt** (`DetailList`)      | Status setzen                                                                          | –    | S     | Docs                  | nein                                |
| BEF-006 | **erledigt** (UX-005, Zyklus 3)  | Status setzen; alle sieben Vorgänge behalten ihre Bestätigung                         | –    | S     | Docs                  | nein                                |
| BEF-017 | trifft zu                        | Vier Posten in `fortschritt.json`, Gewicht 1, dann `pnpm fortschritt --schreiben`      | –    | S     | Docs                  | nur Gewicht (Empf.: 1 je Posten)    |
| BEF-024 | trifft zu                        | `appointmentKindSchema` importieren + Test gegen `options`                             | –    | S     | Mitnahme G21 STAFF-005 | nein                               |
| BEF-025 | durch Umbau U3 gegenstandslos    | Schließen; kein neues Gate (Regel 6 in `docs:check` deckt JSON ↔ Tabelle)             | –    | S     | Docs                  | nein                                |
| BEF-026 | entschieden, Adapter steht       | Status „entschieden“; Empfängerkreis verifizieren; Anbieter in Block 11               | A    | S     | Docs / Block 11       | Anbieterwahl erst Block 11          |
| BEF-046 | trifft zu                        | Option 2: nur Erstladefehler sperrt, Nachladefehler zeigt Hinweis, Eingaben bleiben    | A    | S–M   | Loop Sitzung          | nein (einzeilig bestätigen)         |
| BEF-047 | (a)(b) treffen zu, (c) überholt  | Option 2; **keine** Timebox, weil ADR-025 die Höchstdauer als Sperre regelt (G20)      | A    | S     | Loop Sitzung          | nein                                |
| BEF-048 | (2) erledigt, (1)(3)(4) offen    | Option 1 ohne (2): Tooltip + Bereichsname am Tablet, Untermenü in der Akte aus, Manifestfarben | S | S–M | Loop Rahmen       | nein                                |
| BEF-049 | teilweise überholt               | Option 2 angepasst: Vorschau-Bereiche nicht in die Tableiste, „Sicherheit“ als ein Punkt, Suche findet Panne | S | M | Loop Rahmen     | kurz: Raster/Frist/Startort einklappen? |
| BEF-050 | trifft zu                        | Option 1: fester Titel je Route „Seitenart – Own Motion“, Test „kein Titel aus Daten“  | S    | S     | Loop Rahmen           | nein                                |
| BEF-051 | Teil 1 zu, Teil 2 teils entschärft | Option 2: Liege nur am Hausbesuch; für office Teamplan zuerst                        | S    | S     | Loop Kalender/Übersicht | nein                              |
| BEF-052 | trifft zu                        | Option 1: Druckliste mit Anschrift und Rufnummer; Briefkopf-Projektion für Absender    | A    | M     | Loop Papier           | nein                                |
| BEF-053 | trifft zu                        | Option 1: fremde Termine als „belegt“ statt ausgeblendet; Leiste rollt Auswahl frei    | S    | S–M   | Loop Kalender/Übersicht | nein                              |
| BEF-054 | (4) erledigt, Rest offen         | Option 2 verkleinert: Tour im Kopf, Liste vor Karte, Woche schmaler, `cooperativeGestures` | S | M   | Loop Kalender/Übersicht | nein (Liste vor Karte als ANN)    |
| BEF-056 | trifft zu                        | Nachtrag auf die Schreibseite (ein RPC), Zwischenstand in der Erhebung, Konflikt → „Als Nachtrag übernehmen“; Autosave als Annahme | A | M(+M) | Schreibseite 2 | nur Autosave ja/nein (Empf.: ja, 3 s) |
| BEF-057 | Teil 1 erledigt, Teile 2/3 offen | Skala zweireihig ≥44 px, Bausteinzeile einreihig, Chipzeile ohne Sprung               | S    | S     | Schreibseite 2        | nein (ANN)                          |
| BEF-058 | trifft zu                        | Option 1 + Anker: Fotos ohne Bestand als eine Zeile, „Bisherige Doku“ springt zur Doku | S    | S     | Loop Dateien 2        | nein                                |
| BEF-059 | trifft zu                        | (1) Anzeige im eigenen Rahmen (neue Fassung ADR-017), (2) Art ohne Vorauswahl, (3) Namensschema | A | M | Docs ADR-017 → Dateien 2 | (1) ADR-Änderung                |
| BEF-061 | Kern zu; Listenform meist erledigt | `total_count` + Hinweis jetzt; Suche/Filter/Blättern vor dem ersten Rechnungslauf    | A    | S / M | ABN-EPIC-001 / eigen  | nur: Option 2 vorziehen?            |
| BEF-062 | (1) zu, (2) Server fertig, UI nicht | Kandidaten nennen die stornierte Rechnung, Server verknüpft bei genau einer Quelle; Empfänger bearbeiten/Standard | A | M+S | ABN-EPIC-001 | nein                     |
| BEF-063 | trifft zu (Rechnung)             | Option 2: Rückfrage mit Empfänger und Betrag; „Verwerfen“ als ruhige Aktion            | S    | S     | sofort                | Option 1/2/3 (Empf.: 2)             |
| BEF-064 | Trainer-Rolle erledigt, Rest zu  | (1b) Rückfrage nur beim Entziehen, (2a) Instrumente an `canWriteQuestionnaire`         | A*   | S     | Loop Organisatorisches | nein                               |
| BEF-065 | trifft zu                        | Option 2: Audit mit Stichtag, Filter in URL, „Abgewiesen“ als Abzeichen; Aufbewahrung Arbeit zuerst; MDR-Text | A | M | Loop Audit/Auskunft | E2E-Wortlaut der MDR-Sperre     |
| BEF-066 | Vorschauen unverändert           | Option 2 als Vorgabe in den Zuschnitt von FLT/URL/ZK/ERS (Block 8), kein Umbau         | –    | S     | Docs                  | nein (Option 3 beim Zuschnitt)      |
| BEF-067 | 7 von 9 Zeilen offen             | Spalte „Vorschlag“ in einem Durchgang über `ABGELOESTE_BEGRIFFE`                       | S    | M     | Loop Begriffe/Schrift | **ja**: Wort je Zeile               |
| BEF-068 | Badge erledigt, Rest zu          | Option 2: Tokens 11/14 px, Baustein „Kleingedrucktes“, Test gegen freie Werte          | S    | M     | Loop Begriffe/Schrift | **ja**: Kleingedrucktes 14 oder 12  |
| BEF-069 | trifft zu                        | Option 1: Kontur `line-strong` am gesperrten Hauptknopf, `quiet` ohne Fläche           | S    | S     | Loop Rahmen           | nein                                |
| BEF-070 | 9 Wege weiter direkt             | Option 2: `antwort()` an allen neun Wegen, Profilweg mit BEF-046                       | A    | S     | Loop Sitzung          | nein                                |
| BEF-082 | trifft unverändert zu            | Eine Migration `alter function … volatile` ×16, Testliste leeren                       | A    | S     | nächster migrierender Loop | nein                           |
| BEF-092 | trifft zu                        | Projektion „künftige Hausbesuche mit alter Adresse“ + Schreibpfad mit Bestätigung      | A    | M     | ABN-EPIC-001 Termine  | nein                                |
| BEF-093 | trifft zu (vier Stellen)         | Spalte `patient_relevant_changed_at` + Trigger auf genau die relevanten Spalten        | A    | S–M   | ABN-EPIC-001 Termine  | nein                                |
| BEF-094 | trifft zu                        | Verlegung mit Veranlasser → `fee_basis = 'late_reschedule'`; Verzicht als Vermerk + Audit; neue Fassung ADR-018 | A | L | ABN-EPIC-001 Ausfall | nein (zwei Details als ANN)    |
| BEF-095 | nur clientseitig                 | Sichtbarkeit an `canReadTreatmentNote` ↔ `app.can_read_treatment_note()`; Schreibknöpfe bleiben | A | S–M | ABN-EPIC-001 Doku  | nein (Hinweis: owner dokumentiert nicht) |
| BEF-096 | trifft voll zu                   | `used` = Termine in `completed/documented/invoiced`; `no_show` wie `cancelled`         | A    | M     | ABN-EPIC-001 Grundlage | nein                               |
| BEF-097 | trifft zu                        | Leistungen ziehen in derselben Transaktion mit (Matching über `remedy`), sonst Abweisung | A  | M     | ABN-EPIC-001 Grundlage | UI für vergangene Termine? (Empf.: ja) |
| BEF-098 | trifft zu                        | `prescriber_note` wieder öffnen, nur Verordnung, office darf nicht ändern              | A    | S–M   | ABN-EPIC-001 Doku     | nein                                |
| BEF-099 | nichts gebaut                    | Terminhonorar als Katalogart `session_fee`, `patient_fee_agreements`, Preis-Snapshot an der Leistung | A | L | ABR-EPIC-007a      | **ja**: Doppelbehandlung = 1 oder 2 Honorare |
| BEF-100 | alle drei treffen zu             | Steuernummer **oder** USt-IdNr.; Storno mit Zahlung + Verrechnungsbuchung; kumulative Verteilung | A | S+M–L+S | ABN-EPIC-001 Abrechnung | Verrechnung nur auf Korrektur oder jede Rechnung derselben Person? |
| BEF-101 | (2) weitgehend erfüllt, (1)(3)(4) offen | Definitionen als erzeugte Tabelle + Serverprüfung; Datum bei Korrektur gesperrt; Leseart; Vergleichbarkeitsmarke | A | L | ABN-EPIC-001 Befund | nein                        |
| BEF-102 | trifft zu (hartes `delete`)      | Soft Delete `removed_at/by`, Projektion „Entfernte Ereignisse“, im Export              | A    | S     | ABN-EPIC-001 Befund   | nein                                |
| BEF-103 | (1)–(4) treffen zu               | Vorschlag nie still anhängen (Rückfrage), Seitenwechsel fragt, Wort + Zeichen, Patch-Version | S | S–M | Schreibseite 2      | Häkchen serverseitig erhalten? (Empf.: später) |
| BEF-104 | Grenze meist erledigt, Kette fehlt | `supersedes_report_id` + `change_reason`; Zähler „n von 50“, 51. Haken gesperrt      | A    | M     | ABN-EPIC-001 Befund   | nein                                |
| BEF-105 | trifft zu                        | Edge Function `patient-file-verify` (Signatur, SHA-256, Metadaten) + Spalten „verifiziert“; sRGB im Client | A | L | Loop Dateien 2 | nein (Scharfschalten mit OPS-001) |
| BEF-106 | trifft zu                        | Dokumentart `dokumentationsfoto` in der Aktenklasse, Wahl vor der Aufnahme; neue Fassung ADR-017 | A | L | Docs ADR-017 → Dateien 2 | ADR-Änderung                |
| BEF-107 | trifft zu                        | Abschnitt `access_log` ohne Namen und `patient_photos` im Export                       | A    | M     | Loop Audit/Auskunft   | nein                                |
| BEF-108 | trifft zu                        | `review_due` in der Warteliste, Tabelle `patient_merge_records`, mehrere aktive Sperren je Akte | A | M | Loop Audit/Auskunft | nein (Frist als ANN)               |
| BEF-109 | (2) Koordinate erledigt, Rest zu | `APP_ENVIRONMENT` im Gate, `unique`-Treffer, Schätzungen als `null`; neue Fassung ADR-019 für Kacheln | A | M | eigen            | ADR-Änderung (Kacheln)              |
| BEF-110 | trifft zu                        | (1) Entwurf verfällt nicht still, Rückfrage; (2) Freigabevermerk im Register + `app.mdr_released()` | S / A | S | (1) G20, (2) sofort | nein                             |
| BEF-111 | trifft zu                        | Spalte `house_number` + einmalige Aufteilung nur bei Eindeutigkeit; `issue_invoice` prüft Anschrift | A | M | ABN-EPIC-001 Training | gleiche Sperre für Behandlungsrechnungen? (Empf.: ja) |
| BEF-112 | trifft zu; Räume fehlen im Modell | Projektion `list_busy_blocks` (nur Person, Beginn, Ende, verschmolzen) + Kachel „belegt“ | A | M   | nach BEF-053          | nein                                |
| BEF-113 | trifft zu                        | Lese-/Schreibrecht trennen, `training_protocol_addenda`, Rückfrage + Löschjournal beim Verwerfen | A | M | ABN-EPIC-001 Training | nein                              |
| BEF-114 | nicht modelliert                 | `training_packages` + Leistung ohne Termin; erst nach Preisfestlegung                  | A    | L     | ABR-EPIC-007b         | **ja**: Preis, Umfang, Zahlweise    |
| BEF-115 | Bedingung richtig, SQL-Löschung  | Warteschlange + Aufgabe im Zugangsdienst über die Admin-API; Test „zwei Zugänge“       | A    | M–L   | Loop Zugangsdienst    | Zeitgeber in OPS-001                |
| BEF-116 | trifft zu                        | `consent_scopes` + `consent_method`; Wortlaut nur gewählte Bereiche                    | A    | S–M   | Loop Plattform-Rechte | nein                                |
| BEF-117 | trifft zu (Klemmfehler)          | Eine Funktion `platform_adult_on` mit Klemm-Korrektur; Skizze aus dem Befund ist falsch | A   | S     | Loop Plattform-Rechte | nein                                |
| BEF-118 | trifft zu                        | Merkmal „per Link bestätigt“ + Send-Email-Hook im Zugangsdienst + SQL-Zweitlinie       | A    | M     | Loop Zugangsdienst    | Hook-Aktivierung in OPS-001         |
| BEF-119 | trifft zu                        | `representation_scopes ⊆ {health, finance}` statt zweitem Boolean; Fähigkeiten je Bereich | A | M   | Loop Plattform-Rechte | nein (B5-Hinweis)                   |

A\* = ohne Migration, aber Sichtbarkeit zwischen Rollen (ADR-013 Punkt 9), daher Zweitreview.

## Was sich erledigt hat

Sieben Befunde oder Teile davon sind durch gemergte Loops abgearbeitet, stehen aber noch auf
„offen“. Sie gehören in einer Docs-Session geschlossen, nicht gebaut:

- **BEF-001** und **BEF-057 Teil 1**: Die Schreibseite (`CompleteTreatmentPage.tsx`, Zyklus 2)
  hat kein Untermenü, keinen Hinweistext, eine einzeilig scrollende Chipzeile und ein Feld über
  die Höhe; Name, Datum und Zeit bleiben im Kopf. Rechnerisch beginnt das Feld bei 375 × 667 bei
  rund 150 px statt 458. Noch nicht gemessen: `schreibseite.spec.ts` prüft Knopf und Feldhöhe, aber
  nicht die Startposition. Der Folgesatz steht nur noch für Vorlesesoftware (`sr-only`), was der
  Befund als Aufweichung von ADR-016 Punkt 4 genannt hatte; das ist die bewusste Entscheidung aus
  ANN-200 und mit ihr zu bestätigen.
- **BEF-005**: `DetailList.tsx` setzt `min-w-0 wrap-anywhere`, mit Test und Kommentar auf den Befund.
- **BEF-006**: Die Terminseite ist umgebaut (Metazeile, Aktionsleiste, Kacheln); alle sieben
  Vorgänge haben ihre Bestätigung behalten, der Haken „Termin abschließen“ war schon vorher ohne
  Rückfrage, weil über „Wieder öffnen“ reversibel (ANN-005).
- **BEF-025**: Der Änderungsvermerk der Roadmap führt seit Umbau U3 nur Planungsänderungen; der
  dritte Pflegeort ist weg, Regel 6 in `scripts/docs-check.mjs` prüft `fortschritt.json` gegen die
  Tabelle. Ein Gate Tabelle ↔ Vermerk wäre heute falsch.
- **BEF-048 (2)**: „Abmelden“ ist seit dem Handoff 14 px grau (`abmeldeKnopf`).
- **BEF-054 (4)**: Personenfarben sind weg, die Linie an der Kachel sagt den Zustand (`statusLinie`).
- **BEF-064 Teil 1**: `trainer` steht seit TRN-003 in `WAEHLBARE_ROLLEN` und wird vom Server
  angenommen.
- **BEF-068 Teil**: `Badge` hat 28 px, 14 px, Gewicht 600 nach Handoff; die drei 12-px-Fehlertexte
  sind nicht mehr auffindbar.
- **BEF-109 (2) Satz 2/3**: Die Koordinate wird bei Adressänderung verworfen
  (`app.drop_coordinate_on_address_change`), künftige Termine werden übertragen.

## Bündel und Reihenfolge

Die Roadmap legt die Reihenfolge fest; hier steht nur, welche Befunde dieselben Dateien, Funktionen
oder Annahmen berühren und deshalb **zusammen** in einen Loop gehören. Die Zuordnung zu
ABN-EPIC-001 und ABR-EPIC-007 folgt der Roadmap 7.6.

| Bündel                                   | Befunde                                                           | Pfad | Aufwand | Vorher nötig                                     |
| ---------------------------------------- | ----------------------------------------------------------------- | ---- | ------- | ------------------------------------------------ |
| **Docs-Session Befundstand**             | 001, 005, 006, 017, 025, 026, 066 (Status, vier Posten, Vorgabe Block 8) | –  | S       | nichts                                           |
| **Docs-Session ADR-017, nächste Fassung**| 059 (1), 106                                                      | –    | S       | Jannes nimmt die Fassung an                      |
| **ABN-EPIC-001 Story Grundlage**         | 096 → 097                                                         | A    | M+M     | nichts; **vor** 099                              |
| **ABN-EPIC-001 Story Termine**           | 093 → 092                                                         | A    | S–M+M   | nichts                                           |
| **ABN-EPIC-001 Story Ausfallhonorar**    | 094 (neue Fassung ADR-018 Punkt 8 entsteht im Loop)               | A    | L       | nichts                                           |
| **ABN-EPIC-001 Story Doku-Leserecht**    | 095 → 098                                                         | A    | S–M     | nichts                                           |
| **ABN-EPIC-001 Story Befund**            | 102, 104, 101 (2)–(4); 101 (1) als eigene Story                   | A    | S+M+S / L | nichts                                          |
| **ABN-EPIC-001 Story Abrechnung**        | 100 (1), 100 (3), dann 100 (2) + 062 (1), 061 Option 1, 062 (2)   | A    | S+S+M–L+S | nichts                                          |
| **ABN-EPIC-001 Story Training**          | 111, 113                                                          | A    | M+M     | nichts                                           |
| **ABR-EPIC-007a Terminhonorar**          | 099                                                               | A    | L       | 096; Antwort zur Doppelbehandlung                |
| **ABR-EPIC-007b Trainingspaket**         | 114                                                               | A    | L       | Preis, Umfang, Zahlweise von Jannes              |
| **Loop Sitzung** (kritischer Pfad)       | 046, 047 Option 2, 070                                            | A    | S–M     | nichts; Höchstdauer bleibt bei G20 SEC-EPIC-001  |
| **Loop Rahmen**                          | 048, 050, 069, 049                                                | S    | M       | kurze Antwort zu 049 (2)                         |
| **Loop Kalender/Übersicht**              | 051, 053, 054; danach 112 (A)                                     | S→A  | M + M   | nichts                                           |
| **Loop Papier**                          | 052                                                               | A    | M       | nichts                                           |
| **Loop Schreibseite 2**                  | 056 (a)(c), 057 Rest, 103, 001-Messung; 056 (b) Autosave          | A    | M (+M)  | nichts; Autosave als Annahme                     |
| **Loop Dateien 2**                       | 059 (2)(3) sofort, 059 (1) nach ADR, 105, 106, 058                | A    | L       | Docs-Session ADR-017                             |
| **Loop Organisatorisches**               | 064, 065-Oberfläche                                               | A\*  | S+M     | Wortlaut MDR-E2E freigeben                       |
| **Loop Audit/Auskunft/Nachweis**         | 065 `list_audit_events`, 107, 108                                 | A    | M       | nichts                                           |
| **Loop Plattform-Rechte** (vor POR-EPIC-002) | 116, 119, 117                                                 | A    | M       | nichts                                           |
| **Loop Zugangsdienst**                   | 115, 118 (bauen mit `mock`, scharf nach OPS-001)                  | A    | M–L     | Zeitgeber und Hook-Aktivierung mit OPS-001       |
| **Loop Begriffe/Schrift**                | 067, 068                                                          | S    | M       | **Wort je Zeile, Kleingedrucktes 14 oder 12 px** |
| **Einzeln klein**                        | 063 (S, sofort), 082 (A, im nächsten migrierenden Loop), 110 (2) (A), 109 (A, mit ADR-019), 024 (Mitnahme G21), 110 (1) (mit G20) | | | |

## Analyse je Befund

### Rahmen, Anmeldung, Sitzung

**Nachladen des Profils ersetzt die Anwendung (BEF-046).** _Stand:_ `src/app/App.tsx:117` sperrt
bei `isError || !user` und zeigt `error?.message`; `useCurrentUser.ts` hat `staleTime` 5 min und
`retry: false`; `refetchOnReconnect` steht auf dem Default. `KeinProfilError` und
`ZugangGesperrtError` werden vorher geprüft, die Sperre greift also auch bei vorhandenem `data`
weiter. `App.test.tsx` prüft heute ausdrücklich, dass `error.message` erscheint. _Beste Lösung:_
Option 2, zusätzlich gestützt durch ADR-025 Punkt 6 (Rechte und Sperre prüft der Server bei jeder
Anfrage): Nur `isError && !user` sperrt, als `Vollseite` mit festem Satz und „Erneut versuchen“
(`refetch`) als Hauptknopf; mit `user` läuft `AuthenticatedRoutes` weiter und eine `Statusmeldung`
unter der `Verbindungsanzeige` sagt, dass das Profil gerade nicht aktualisiert wurde und Eingaben
erhalten bleiben. _Umsetzung:_ `App.tsx` (Zweig teilen), `AppShell.tsx` (Hinweis),
`useCurrentUser.ts` nur für BEF-070; Tests in `App.test.tsx` (Nachladefehler lässt Routen
eingehängt, „Zugang gesperrt“ ersetzt trotz `data`, Erstladefehler zeigt festen Satz). Pfad A
(Sitzungen), S–M. _Entscheidung:_ keine zwingende, als ANN verankerbar (Anker: der Zweig in
`App.tsx`); STATUS führt den Punkt als Jannes-Entscheidung, eine Zeile Bestätigung reicht.

**Anmeldemaske ohne Grund, keine Höchstdauer (BEF-047).** _Stand:_ (a) trifft zu:
`LoginPage.tsx:206–214` wertet jedes `signInError` als falsche Eingabe; Netzfehler kommen von
supabase-js als `error` mit `name === 'AuthRetryableFetchError'`, der `catch` ist unerreichbar. Das
Erkennungsmuster steht schon dreimal im Repo (`linkEinloesen.ts`, `account/api.ts`,
`konto-api.ts`) und im selben File für „Kennwort vergessen“. (b) trifft zu: `SessionProvider.tsx`
setzt bei fremdem Ende nur `session = null`. (c) ist **überholt**: ADR-025 (angenommen
2026-10-02, G20 SEC-EPIC-001) regelt die Höchstdauer als serverseitige **Sperre** nach 60 Minuten
plus Inaktivität, nicht als Abmelden; eine 14-Stunden-Timebox würde dort zurückgebaut. _Beste
Lösung:_ Option 2 jetzt: drei Sätze (nicht erreichbar, zu viele Versuche, Sitzung beendet) ohne
Grund, falsches Kennwort und unbekanntes Konto bleiben ununterscheidbar; `SessionProvider` merkt
sich `beendetVonAussen`; Sonderfall `getSession`-Fehler mit retryable-Name zeigt „Anmeldedienst
nicht erreichbar“. _Umsetzung:_ `LoginPage.tsx`, `SessionProvider.tsx`, `sessionContext.ts`,
gemeinsame Erkennung aus `linkEinloesen.ts` exportieren; Tests `LoginPage.test.tsx`,
`SessionProvider.test.tsx`, `Gate.test.tsx`. Pfad A (Authentifizierung), S, Zweitreview für den
Sonderfall. _Entscheidung:_ keine; Höchstdauer ist durch ADR-025 entschieden.

**Rahmen am Tablet, Abmelden, drei Ebenen über der Akte, Manifest (BEF-048).** _Stand:_ (2)
erledigt. (1) `AppShell.tsx` Seitenleiste `w-18` zwischen 640 und 1023 px, Label `sr-only
lg:not-sr-only`, kein `title`, Bereichsname nur `sm:hidden`, Hover und Auswahl beide `bg-accent`.
(3) `AppShell.tsx:386` zeigt `SubNav`, sobald `unterpunkte.length > 0`; auf `/patienten/:id`
stehen SubNav, `Rueckweg`, Kopfkarte und Aktennavigation übereinander. (4) Manifest ohne
`theme_color`/`background_color`, `index.html` ohne Meta. _Beste Lösung:_ Option 1 ohne (2):
Bereichsname in der Kopfzeile zusätzlich `sm:block lg:hidden`, `title` an den Links, Auswahl mit
Salbei-Strich links, Hover ohne Fläche; Regel `untermenueSichtbar(pathname)` in `navigation.tsx`
(false in der Akte); `theme_color` Weiß, `background_color` `#eceee8`. _Umsetzung:_ `AppShell.tsx`,
`navigation.tsx`, `manifest.webmanifest`, `index.html`, `marke.test.ts` (Manifestfelder); Tests
`AppShell.test.tsx`, `navigation.test.tsx`; Sichtprüfung mit `tests/e2e/fixtures/akte.html` bei 390
und `organisation.html` bei 820. Pfad S, S–M. _Entscheidung:_ keine, Gestaltung ohne Rechts- oder
Datenwirkung; zwei ANN.

**Menü und Untermenü (BEF-049).** _Stand:_ Teilweise überholt. Seit TRN-EPIC-001 hat owner acht
und office sieben Bereiche; die Tableiste zeigt Übersicht, Kalender, Patienten, **Training**, der
Rest liegt hinter „Mehr“. Kommunikation belegt den Tab nur noch bei therapist und team_lead (fünf
Bereiche, kein „Mehr“, damit kein Weg zu `/bereiche` und zum Vorschau-Protokoll). Der Satz auf
`BereichePage.tsx:38–41` steht unverändert. `funktionen.ts` kennt weder Flotte noch „Panne“. Das
Untermenü Organisatorisches hat für owner inzwischen **sieben** echte Punkte plus „Vorschau (4)“,
länger als zur Befundzeit. Raster, Frist und Startort stehen weiter vor dem Wochenplan; UX-EPIC-005
hat sie „bewusst gelassen (Suche springt sie an)“. _Beste Lösung:_ Option 2 angepasst:
`Arbeitsbereich.vorschau`, `tableiste()` überspringt solche Bereiche; Protokoll und Aufbewahrung
werden ein Punkt „Sicherheit“ mit Umschalter in der Seite; die Suche findet „Panne melden“,
„Schlüssel entnehmen“, „Vorschau-Protokoll“; der Satz auf `/bereiche` wird an den Stand angepasst
(keine neue Kennzeichnung, `ARBEITSBEREICHE.md` Abschnitt 2); Raster, Frist, Startort als
`Disclosure` unter den Arbeitszeiten, die per Suchanker aufgeht, so bleibt der Sprung aus der Suche.
_Umsetzung:_ `navigation.tsx`, `funktionen.ts`, `BereichePage.tsx`, `SchedulingPage.tsx`; Tests
`navigation.test.tsx` (tableiste), `Funktionssuche.test.tsx`, `tests/e2e/organisation.spec.ts`
(Sichtbarkeit statt Klick). Pfad S, M. Der Pannenweg selbst bleibt FLT-EPIC-001. _Entscheidung:_
(1) als Annahme möglich (verlängert ANN-112); (2) kurz bestätigen, weil UX-EPIC-005 die drei Karten
ausdrücklich oben gelassen hat.

**Jede Seite heißt „Own Motion“ (BEF-050).** _Stand:_ Trifft zu; einzige Titelquelle
`index.html:49`, kein `document.title` in `src/`; `seitenwechsel.ts:30` nennt den Titel als offen.
Der Fokus auf den Inhalt nach Seitenwechsel ist seit UXR-002 gebaut. `lib/rueckweg.ts` leitet
schon Beschriftungen aus Pfaden ab. _Beste Lösung:_ Option 1: statische Tabelle Route → Seitenart
in `navigation.tsx` oder daneben, Titel „Seitenart – Own Motion“, `Vollseite` setzt „Anmelden –
Own Motion“, Fallback „Own Motion“; nie aus Abfragedaten. _Umsetzung:_ `seitenwechsel.ts`,
`navigation.tsx`, `Vollseite.tsx`; Unit-Test über Beispielpfade (`/patienten/<id>` → „Akte – Own
Motion“) und ein Test, der die Tabelle als statisch festhält; E2E `toHaveTitle(/– Own Motion$/)` in
bestehenden Fixture-Specs. Pfad S, S, mit Datenschutz-Guard-Test (ADR-013 Punkt 9 Checkliste 5
sinngemäß). _Entscheidung:_ keine zwingende; Liste aus den `BEREICHE`-Labels ableiten, als ANN
festhalten, Jannes korrigiert Wortlaute in der Sichtung.

**Gesperrter Hauptknopf unsichtbar (BEF-069).** _Stand:_ Trifft zu. `buttonStile.ts:24, 56, 87`
`disabled:bg-surface-sunken disabled:text-ink-muted` ohne Rand; `canvas` und `surface-sunken` sind
identisch (oklch 94,6 %); gesperrt bis zur ersten Eingabe in `TreatmentNotePage.tsx:238`,
`TreatmentNoteAddendumPage.tsx:138`, `CompleteTreatmentPage.tsx:408`, `Rueckfrage.tsx:167/180`.
_Beste Lösung:_ Option 1 je Variante: `primary` gesperrt bekommt `border border-line-strong`
(rund 3:1 gegen die Seitenfläche), `secondary` hat den Rand schon, `quiet` gesperrt ohne Fläche,
sonst erhielte „Abbrechen“ daneben plötzlich einen Kasten. „Was fehlt“ nur dort, wo nicht
offensichtlich (Schlüsselseite). _Umsetzung:_ `buttonStile.ts`, `kontrast.test.ts` (Paar
`line-strong`/`canvas` ≥ 3:1), Sichtprüfung `tests/e2e/fixtures/schreibseite.html` bei 390. Pfad
S, S. _Entscheidung:_ keine, ANN mit Anker `buttonStile.ts`.

**Englischer Prüftext bei unerwarteter Antwort (BEF-070).** _Stand:_ Teilweise überholt, Kern
trifft zu. `antwort()` nutzen inzwischen 13 Module; die neun genannten Wege parsen weiter direkt:
`files/api.ts:141, 240, 337`, `files/patientenfotos.ts:101, 140`, `therapy-reports/api.ts:200,
225`, `assessments/api.ts:90`, `useCurrentUser.ts:63`; die Seiten zeigen die Meldung wörtlich
(`Dateiliste.tsx`, `FotosImVerlauf.tsx`, `TherapieberichtPage.tsx`, `ErhebungPage.tsx`,
`AufbewahrungPage.tsx` im Löschpfad). Darüber hinaus parsen billing, staff, retention, audit,
treatment-bases, scheduling direkt, zeigen aber meist feste Sätze; das liegt außerhalb des Befunds.
_Beste Lösung:_ Option 2 für die neun Wege; `useCurrentUser.ts:63` zusammen mit BEF-046. Kein
Lint-Gate für alle `.parse(` (über 40 Stellen, Scope-Ausweitung), höchstens als Vorschlag.
_Umsetzung:_ vier `api.ts`/`patientenfotos.ts` + `useCurrentUser.ts`; je Modul ein
`api.antwort.test.ts` nach Muster `appointments/api.antwort.test.ts`. Kein `test:db`, aber Pfad A
(Löschpfad ADR-008, Sitzungsprofil) mit Zweitreview. S. _Entscheidung:_ keine.

### Kalender, Übersicht, Termine

**Liege am Praxistermin, Büro mit leerem Block (BEF-051).** _Stand:_ Teil 1 trifft zu:
`besucheDesTages` in `tagesstart.ts` filtert `kind === 'therapy' && status !== 'cancelled'` ohne
Blick auf `appointment_type`; `liegeHeute` nimmt den ersten ausstehenden Termin mit
`treatment_table_required`; `list_day_plan` liefert das Merkmal für jeden Behandlungstermin; die
Liege-Pille in `Tagesliste.tsx:199` prüft nur das Flag; `tagesstart.test.ts` kennt nur Hausbesuche.
Teil 2 teils entschärft: Der Leerzustand heißt seit UEB-11 „Heute sind Ihnen keine Besuche
zugeordnet“, die Aufklapper sind im Zeitstrahl aufgegangen; aber `eigeneTagesliste` gilt für office
mit Mitarbeiterdatensatz, `MeinTag` steht zuerst, der `TagesrouteAufklapper` erscheint für
`isTherapyStaff` (schließt office ein). _Beste Lösung:_ Option 2, rein clientseitig: `liegeHeute`
und „ab n. Besuch“ nur über `appointment_type === 'home_visit'`, `tagesfortschritt` weiter über
alle Behandlungstermine, Pille nur am Hausbesuch; für Rollen ohne `canWriteTreatmentNote` Teamplan
vor der eigenen Liste, eigene Liste ohne Einträge als eine Zeile, Tagesroute nur mit mindestens
einem Hausbesuch mit `visit_lat`. Serverseitiges Nullen des Flags am Praxistermin wäre sauberer
(Datenminimierung), kostet eine Migration; als Folgeschritt vermerken. _Umsetzung:_
`tagesstart.ts`, `tagesstart.test.ts` (Praxistermin mit Liege = „Nein“, gemischter Tag),
`Tagesliste.tsx`, `MyDayPage.tsx` + Test (DOM-Reihenfolge für office), ANN-117 Fassung 2. Pfad S,
S. _Entscheidung:_ keine; ANN-116 und §9 tragen „nur Hausbesuch“ als Annahme.

**Gedruckte Blätter (BEF-052).** _Stand:_ `MyDayPage.tsx` hat keine Druckbehandlung; `index.css`
blendet `nav`, `button`, `.nicht-drucken` aus. Der Zeitstrahl druckt jetzt alle Termine, aber je
Zeile nur Uhrzeit, Name, Straße und Hausnummer, ohne PLZ, Ort und Rufnummer; nur die Fokuskarte
druckt Anschrift und Rufnummern; mitgedruckt werden „Termin öffnen →“, Wegbalken, Jetzt-Marke. Das
Versprechen „Anschrift, Rufnummer“ im Seitentext existiert nicht mehr. Aufnahmeblätter und
Terminzettel nennen nur den Organisationsnamen; `practice_billing_profiles` hat `phone`, `email`,
Anschrift, RLS nur owner und office; ANN-123 öffnet den Briefkopf für therapist nur eingebettet in
`app.therapy_report_dokument`, eine eigene Briefkopf-Projektion gibt es nicht; `locations` trägt
seit MAP-006a die Anschrift. _Beste Lösung:_ Option 1: (a) eine `Druckliste` nur im Druck
(`hidden print:block`, Tabelle: Uhrzeit, Name, Anschrift zweizeilig, Rufnummern als Text,
Zugangshinweis), Zeitstrahl, Teamplan, Tagesroute `print:hidden` (ANN-021: nur die eigenen Besuche
eines Tages); (b) neue Projektion `public.get_practice_letterhead()` (SECURITY DEFINER,
`app.is_staff()`, nur `legal_name`, Anschrift, `phone`, `email`, Fallback Organisationsname, nie
Steuer oder Bank), genutzt in `patienteninformation.ts` (Art. 13 Abs. 1 lit. a DSGVO) und im
Terminzettel (Absender und Standortanschrift am Praxistermin). Kein Auditereignis nötig (keine
Personendaten). _Umsetzung:_ Migration + `practice-billing-profile.test.ts` (therapist liest
Briefkopf, Spaltenliste ohne Steuer und Bank, Patientenkonto und fremde Org abgewiesen);
`billing/api.ts` oder `datenschutz/api.ts`; `AufnahmeblaetterPage`, `AppointmentSlipPage`,
`today/Druckliste.tsx` mit Tests; E2E mit `emulateMedia('print')` nach `bericht.spec.ts` (nur lokal,
Anmeldung). ANN-021 Fassung 3, ANN-123 Fassung 2. Pfad A, M. _Entscheidung:_ keine zwingende;
Anschriften auf Papier ist Jannes' Weg aus ANN-021, der Absender dieselbe Öffnung wie ANN-123,
beides mit Prüfpaket B2.

**Patientenfilter blendet aus, Leiste deckt zu (BEF-053).** _Stand:_ Beides trifft zu.
`CalendarPage.tsx:619` filtert `e.patient_id === p.patient`, Hinweis Z. 1396 „ausgeblendet“;
`calendar.ts:149` beschreibt weiter „hervorgehoben“; ANN-050 ist am 2026-10-02 bestätigt, nennt aber
selbst „hervorheben statt ausblenden“ als Änderungspfad. `AnlegenMenue.tsx` ist unverändert sticky
am Fensterrand, Gesten-Hinweis bei jedem Tipp, Fokus mit `preventScroll`, kein Nachrollen;
`kalender.spec.ts` rollt selbst. Ein Tipp auf eine Kachel öffnet seit dem Handoff das `TerminPanel`.
_Beste Lösung:_ Option 1: `GitterEintrag.darstellung: 'normal' | 'zurueckgenommen' | 'belegt'`;
fremde Einträge gedimmt mit vollem Text (ADR-004: der Ausschnitt ist ohnehin geladen), nicht
ziehbar, Tipp öffnet das Panel; Hinweistext „hervorgehoben, andere Zeiten als belegt markiert“.
Leiste: beim Öffnen prüfen, ob die Auswahl unter der Leistenoberkante liegt, und das Fenster um die
Differenz rollen; am Handy Hinweiszeilen `max-sm:hidden`, Gesten-Hinweis nur bis zur ersten Spanne.
Die Darstellung `'belegt'` ist zugleich die Kachel für BEF-112. _Umsetzung:_ `CalendarPage.tsx`,
`CalendarGrid.tsx`, `AnlegenMenue.tsx` mit Tests; `kalender.spec.ts` Tipp im unteren Drittel ohne
eigenes Scrollen; `ARBEITSBEREICHE.md` Z. 97; ANN-050 Fassung 2, ANN-108 beantwortet. Pfad S, S–M.
_Entscheidung:_ keine.

**Kalender und Tour (BEF-054).** _Stand:_ (1) „Woche | Team“ steht im Kopf, **Tour** liegt
weiter nur im Feld „Ansicht und Filter“ (`CalendarPage.tsx:1143–1157`), zwei Tipps bleiben;
Escape und Fokusrückgabe sind da; Standort und Status weiter `sm:grid-cols-2`. (2) `TourenPage.tsx`
unverändert: Kopf, drei gestapelte Felder, Karte `h-[60vh] max-h-[560px]`, dann Liste;
`Karte.tsx:149` ohne `cooperativeGestures` (MapLibre 6.10 kann es). (3) `SPALTEN_MINDESTBREITE =
'9rem'` für beide Ansichten; die Woche zeigt seit Zyklus 5 Mo–Fr, Sa/So nur mit Termin, also
772 px; bei 820 px bleibt Freitag rund 50 px angeschnitten. (4) erledigt. _Beste Lösung:_ Option 2
verkleinert: Tour-Knopf ab `sm` neben „Heute“ (Änderungspfad ANN-113); unter 640 px Liste („Ganzer
Tag“) vor der Karte, Karte 40 vh, Filter als eine Zeile mit „ändern“; ab 1024 px Karte und Liste
nebeneinander; `cooperativeGestures: true` mit deutschen `locale`-Texten, gilt über `Karte.tsx` auch
für die Tagesroute; Woche mit eigener Mindestbreite rund 7,5 rem über eine Prop, Tag bleibt 9 rem;
verwaisten Kommentar `CalendarPage.tsx:97` löschen. _Umsetzung:_ `CalendarPage.tsx`,
`CalendarGrid.tsx`, `TourenPage.tsx`, `Karte.tsx`; Tests `TourenPage.test.tsx` (Reihenfolge),
`Karte.test.tsx` (Optionen), `CalendarGrid.test.tsx`; visuell 375/820/1440; ANN-113 Fassung 2.
Pfad S, M. _Entscheidung:_ Frage 2 (Liste vor Karte) als Annahme tragen (eine `order`-Klasse), in
der Sichtung bestätigen. Nicht verifiziert: ob das Feld noch alle Anlegewege enthält.

**Adressänderung erreicht künftige Hausbesuche nicht (BEF-092).** _Stand:_ `create_appointment`
und `update_appointment` (zuletzt `20260921170000_appointment_kind_rename.sql`) übernehmen beim
Verschieben die **alten** `visit_*`; nur ein Wechsel auf `home_visit` zieht frisch aus
`patient_contact_details`. `update_patient` berührt `appointments` nicht. Nützlich: Trigger
`appointments_copy_visit_coordinate` (MAP-006a) kopiert bei Änderung der `visit_*`-Spalten die
Koordinate automatisch. ANN-003 nennt als einzigen Schreiber `create_appointment`, veraltet. _Beste
Lösung:_ Wie erwartet, ohne Automatismus: (1) Projektion
`list_home_visits_with_outdated_address(p_patient_id)` für künftige bestätigte Hausbesuche, deren
`visit_*` von den gekürzten Stammdatenfeldern abweichen (`is distinct from`), Recht
`app.can_read_appointments()`; (2) Schreibpfad `update_home_visit_addresses(p_appointment_ids)` je
Termin `for update`, Prüfung künftig/bestätigt/Hausbesuch/dieselbe Patient:in, Audit
`appointment.updated` mit `changed_fields: ['visit_address']` und `reason:
'patient_address_changed'` (kein neues Katalogereignis), Koordinate per vorhandenem Trigger; (3) UI
nach dem Speichern der Stammdaten und in Akte → Termine: „n künftige Hausbesuche nennen noch die
alte Adresse“ mit Einzel- oder Alle-Auswahl. _Umsetzung:_ Migration,
`home-visit-address-update.test.ts` (vergangene, abgesagte, Praxistermine unberührt; fremde Org,
Patientenkonto, Trainingsrolle abgewiesen; unvollständige Adresse abgewiesen; Audit; Koordinate),
`appointments/api.ts`, `PatientMasterDataPage`, `PatientAppointmentsPage`; ANN-003 Fassung 2. Pfad
A, M. Mit BEF-093 bündeln: Die Adressänderung lässt „Mitgeteilt“ dann über den Trigger verfallen.
_Entscheidung:_ keine (2026-10-02 entschieden).

**„Mitgeteilt“ verfällt bei internen Änderungen (BEF-093).** _Stand:_ Die Regel `notified_at >=
updated_at` steht an vier Stellen: `app.appointment_notification_channels()`, Sicht
`appointment_directory`, `set_appointment_notification` (zuletzt `trn_004`), Gruppen- und
Serienfunktionen (`max(a.updated_at)`). Fünf Trigger liegen auf `appointments`, keiner führt einen
Zeitstempel relevanter Änderungen. _Beste Lösung:_ Spalte
`appointments.patient_relevant_changed_at timestamptz not null default now()`, Backfill
`= updated_at` (nichts wird rückwirkend gültig); Trigger BEFORE UPDATE, wenn `starts_at`, `ends_at`,
`appointment_type`, `location_id`, `staff_member_id`, die vier `visit_*`-Spalten oder der Wechsel
auf `cancelled` sich ändern; die vier Vergleichsstellen umstellen. _Umsetzung:_ eine Migration;
`appointment-notification.test.ts` erweitern: bleibt bei `complete_appointment`,
`record_at_appointment`, Doku-Finalisierung, Rechnung; verfällt bei Verschieben, Personenwechsel,
Ortswechsel, Terminart, Länge, Absage; Serienfall. Frontend unverändert. ANN-040 Fassung 2. Pfad A,
S–M. _Entscheidung:_ keine.

**Kurzfristige Verlegung, Verzicht (BEF-094).** _Stand:_ `app.is_late_cancellation` prüft nur
`p_reason = 'patient_request'`; Verschieben läuft über `update_appointment` (`appointment.rescheduled`)
ohne Veranlasser und ohne Gebührenbezug; `fee_basis` (`late_cancellation | no_show | null`) steuert
`app.appointment_is_billable()`; eine Leistung `absence_fee` setzt ein Mensch; Verzicht gibt es
nicht; Löschschutz für Zeilen mit `fee_basis` (ANN-035). _Beste Lösung:_ zwei getrennte
Mechanismen. (a) Verlegung: `update_appointment` bekommt `p_initiated_by` (`patient | practice`,
Pflicht bei Zeitänderung) und `p_received_on/time` wie die Absage; bei `patient` und Frist auf den
**alten** Beginn wird `fee_basis = 'late_reschedule'` am verschobenen Termin gesetzt (Constraint
erweitern, erlaubt bei `confirmed`), dazu `reschedule_received_at`, `rescheduled_by_party`. Die
Alternative „Absage `moved` plus Neuanlage“ verdoppelt Zeilen und bricht Serie und Grundlage,
verworfen. (b) Verzicht: Spalten `fee_waived_at`, `fee_waived_by`, `fee_waiver_note` an
`appointments` (eine Entscheidung je Anlass), Funktion `waive_appointment_fee(p_appointment_id,
p_expected_updated_at, p_note)` für owner und office, nur ohne vorhandene `absence_fee`-Leistung;
`fee_basis` bleibt stehen, `appointment_is_billable` liefert false; neues Auditereignis
`appointment.fee_waived`. Nichtantreffen unverändert (ADR-018 Punkt 9). _Umsetzung:_ Migrationen,
`cancellation-notice.test.ts` (Verlegung unter 24 h durch Patient:in, durch Praxis, genau 24 h;
Verzicht protokolliert, nicht abrechenbar, nach Leistung abgewiesen; Rollen negativ),
`appointment-states.test.ts`, `audit.test.ts`; `EditAppointmentPage` mit Pflichtfrage „Wer hat die
Verlegung veranlasst?“, `AppointmentDetailPage` Verzicht und Vermerk, Billing-Liste. ADR-018 bekommt
im Loop eine neue Fassung zu Punkt 8 (Verlegung) und einen Punkt zum Verzicht; ANN-047 Fassung 2,
ANN-034 ergänzen. Pfad A, L. _Entscheidung:_ keine inhaltliche; zwei Details als Annahme: Verzicht
nur owner und office, Verzicht gesperrt, sobald eine Leistung erfasst ist (dann Storno-Weg).

**Trainingsbetreuung sieht keine belegten Zeiten (BEF-112).** _Stand:_ `list_appointments` und
`list_day_plan` filtern je Zeile `app.may_read_appointment_context(a.kind)`; die Belegung entsteht
allein aus der EXCLUDE-Constraint (Fehler 23P01 beim Speichern). **Räume gibt es nicht im
Datenmodell**; dieser Teil des Befunds hat keinen Gegenstand (ADR-014: nicht vorbauen). _Beste
Lösung:_ Projektion `list_busy_blocks(p_from, p_to, p_staff_member_id)` mit genau drei Spalten
(`staff_member_id, starts_at, ends_at`), SECURITY DEFINER, Eingang `app.can_read_calendar()`,
Fenster ≤ 31 Tage wie `list_appointments`; Zeilen nur aus Terminen, die der Aufrufer **nicht** als
Termin lesen darf, `status <> 'cancelled'`, beschränkt auf Mitarbeitende, die die
Trainingsbetreuung buchen kann (`app.is_assignable_trainer` plus eigene Person); überlappende und
angrenzende Zeiträume je Person mit `range_agg`/`unnest` verschmolzen, damit nicht einmal die
Terminzahl herauskommt; Praxisrollen erhalten eine leere Liste; kein Audit (Belegung ist die in
ADR-022 Punkt 11 bewusst getragene Restoffenbarung). Client: `fetchBusyBlocks`, Kachel
`darstellung: 'belegt'` aus BEF-053, nicht ziehbar, kein Panel; in der Tagesliste der
Trainingsbetreuung dieselbe Abfrage. _Umsetzung:_ Migration; `busy-blocks.test.ts` (Trainer sieht
Block zum Behandlungstermin; Schema-Assertion genau drei Spalten; abgesagter fehlt; verschmolzen;
owner und office leer; Patientenkonto, fremde Org, fremde Person abgewiesen; Fensterlimit);
`CalendarPage`, `CalendarGrid`, `MyDayPage` für Trainer; ANN-180 Fassung 2. Pfad A, M, nach
BEF-053. _Entscheidung:_ keine; „relevante Mitarbeitende“ als Annahme (eine where-Klausel).

### Dokumentation, Befund, Dateien

**Ungesicherter Text (BEF-056).** _Stand:_ Weitgehend unverändert. `Textverlustschutz.tsx`:
`beforeunload` bleibt der einzige Schutz bei Neuladen und Schließen, kein Autosave; im Konfliktfall
hält die Schreibseite jetzt das Feld samt Text (DOK-B01), aber jeder Speicherweg scheitert
serverseitig weiter, ein „Als Nachtrag übernehmen“ fehlt. `ErhebungPage.tsx:426–461`: beide Wege
rufen `zurueckZurAkte`, kein Zwischenstand ohne Verlassen, Knöpfe nach der letzten Frage.
`TreatmentNoteAddendumPage.tsx`: ohne Bausteinleiste, Ursprung voll ausgeklappt, Festschreiben nur
über `TreatmentNoteSection` am Termin. _Beste Lösung:_ in dieser Reihenfolge. (a) Sofort, ohne
Entscheidung: Nachtragsseite auf die Schreibseiten-Fläche heben (`modus: 'nachtrag'`, Ursprung als
zugeklapptes Blatt wie „Verlauf“, Chipzeile, Fußleiste „Entwurf · Festschreiben“), Festschreiben über
**eine** Serverfunktion `create_and_finalize_treatment_note_addendum` (neuer RPC, deshalb Pfad A);
Erhebung: „Zwischenstand sichern“ = `entwurfSichern` ohne `danach`, als sticky Fußleiste mit „n von
m beantwortet“. (c) Konfliktfall: `statuswechselText('finalisiert')` bekommt „Als Nachtrag
übernehmen“ statt „neu laden“. (b) Autosave nach Tipp-Pause (Option 2): nur Feldtext, nie
`bausteine.text` (passt zu BEF-103), 3 s Debounce über denselben `schreiben`-Weg, Mindestabstand 30 s
gegen das Auditvolumen (ADR-016 Punkt 9), Stand „Entwurf gesichert 10:42“ in der Fußleiste; kein
lokaler Speicher (ADR-015 Punkt 16, ANN-015). _Umsetzung:_ `CompleteTreatmentPage.tsx`,
`TreatmentNoteAddendumPage.tsx` ersetzen, `documentation/api.ts`, `format.ts`, `ErhebungPage.tsx`,
Migration; `test:db` (Rolle ohne Recht, fremde Org, kein Nachtrag auf Nachtrag, Audit in derselben
Transaktion), Unit für Debounce und Statuszeile, E2E `schreibseite.spec.ts` Nachtragsmodus.
ANN-046 fortschreiben. Pfad A, M für (a)+(c), weitere M für (b). _Entscheidung:_ nur (b) Autosave,
nach §15.1 als Annahme tragbar (Konstante `AUTOSAVE_MS`), Empfehlung ja mit 3 s und Wiedervorlage
iPhone-Test am Feldtag.

**Dokumentieren und Erheben am Handy, Rest (BEF-057).** _Stand:_ Teil 1 erledigt (siehe oben).
Chipzeile rendert während `isPending` nichts, der Sprung ist mit rund 44 px klein, aber nicht
freigehalten. Teil 2 offen: `BausteinFeld.tsx` Seitenmarke und drei Ergebnisknöpfe je Zeile; seit
BEF-076 klappt ein abgehakter Test ein, die offene Zeile bleibt am Handy zweireihig. Teil 3 offen:
`FragebogenFelder.tsx:390–404` `grid max-w-md grid-flow-col gap-0.5 sm:max-w-none`, elf Stufen
rund 29 px bei 375; ab 640 px ist die Reihe schon breit; kein Text „gewählt: 6“. _Beste Lösung:_
Option 3 für die Skala: unter 640 px `grid-cols-6` in zwei Reihen (0–5, 6–10), `min-h-11`, dazu
ein `aria-live`-Satz „gewählt: 6“. Bausteinfeld: Seitenmarke als Zeile über den Knöpfen, Knöpfe
`kompakt` mit gleicher Breite, Blockrahmen am Handy weg. Chipzeile: fester `min-h-[44px]` beim
Laden. _Umsetzung:_ `FragebogenFelder.tsx`, `BausteinFeld.tsx`, `TextbausteinLeiste.tsx`; Tests
`bausteine.spec.ts`/`instrumente.spec.ts` bei 375 px (Stufe ≥ 44 px, Testzeile eine Reihe), Unit für
den Text. Pfad S, S. _Entscheidung:_ Skala zweireihig weicht vom Papierbogen ab, als Annahme
tragbar.

**Fotobereich vor dem Verlauf (BEF-058).** _Stand:_ Trifft weiter zu. `PatientCoursePage.tsx`
rendert `<Patientenfotos>` vor `<PatientRecordDocumentation>`; `FotosImVerlauf.tsx:553–662` immer
voll (Hinweis, Einwilligungsstand, `EmptyState`, Kleingedrucktes). Zyklus 4 brachte Monatsanker
`monat-<yyyy-mm>`, aber keinen Anker auf den Dokubereich; „Bisherige Doku“ (`MyDayPage.tsx:510`,
`TerminPanel.tsx:216`) zielt auf `/verlauf` ohne Hash. _Beste Lösung:_ Option 1 + 3: ohne Fotos
eine `ListRow` „Fotos: keine · Einwilligung nicht vermerkt“ (bei Einwilligung mit „Foto
aufnehmen“), mit Fotos `Disclosure` „Fotos (3)“ (offen nach eigener Aufnahme), Kleingedrucktes in
die Disclosure; „Bisherige Doku“ springt per `#dokumentation` (`id` an der `region`,
`scrollIntoView` beim Mount wie die Monatsanker). Die Reihenfolge aus DOK-006 bleibt. _Umsetzung:_
`FotosImVerlauf.tsx`, `PatientRecordDocumentation.tsx`, `MyDayPage.tsx`, `TerminPanel.tsx`; Tests
`FotosImVerlauf.test.tsx`, `akte.spec.ts` bei 390 px (erster Eintrag im zweiten Bildschirm), Unit für
den Hash. Pfad S, S. Mit BEF-106 bündeln (gleicher Abschnitt). _Entscheidung:_ keine zwingende.

**Dateien: Öffnen, Vorbelegung, Namen (BEF-059).** _Stand:_ Trifft voll zu. `files/api.ts:242–258`
`createSignedUrl(..., { download: display_name })`, `Dateiliste.tsx:500` `window.open(...,
'noopener')`; `Dateiliste.tsx:126` `useState<Dokumentart>(arten[0]!)`; Name = roher Dateiname;
`kamera.ts` ohne Uhrzeit. Der Anzeigeweg für Fotos (`ladePatientenfoto`, `fetch no-store`,
Objekt-URL) existiert. _Beste Lösung:_ (1) b: `oeffneDatei` → Blob mit `no-store` und eine
`Dateiansicht` im eigenen Rahmen (Bild als `<img>`, PDF als `<iframe src=blob: sandbox>` oder
`<object>`, kein Fremdskript, ADR-017 Punkt 19); „Herunterladen“ als zweiter, eigener,
protokollierter Knopf; ADR-017 Punkt 15 braucht dafür eine neue Fassung („Downloadname nur beim
ausdrücklichen Herunterladen“). (2) b: leere Option „Bitte wählen …“, Knopf erst mit Art, Hinweis
unter der Auswahl. (3) a: `vorschlagsname(art, datum[, uhrzeit])`: „Befund vom 27.09.2026“, Fotos
mit Uhrzeit, Verordnungsscan mit `issued_on`; `autoComplete="off"`. _Umsetzung:_ (1) Docs-Session
vor dem Loop, danach Pfad A (geänderter Aufruf des Verweis-RPC); (2) und (3) Pfad S, sofort. Dateien
`files/api.ts`, `Dateiliste.tsx`, `dokumentarten.ts`, `kamera.ts`, `FotosImVerlauf.tsx`, neue
`Dateiansicht.tsx`; Tests `Dateiliste.test.tsx` (Knopf ohne Art inaktiv; Namen), `api.test.ts` (kein
`download` beim Anzeigen), E2E `akte.spec.ts`. M. Am echten iPhone prüfen, ob das Fenster nach zwei
Serveraufrufen blockiert wird. _Entscheidung:_ (1) ist ADR-Text, kein Annahmenfall; (2) und (3) als
Annahmen.

**Büro sieht „Doku offen“ nicht (BEF-095).** _Stand:_ Trifft zu, und zwar **nur clientseitig**.
Datenbank: `app.can_read_treatment_note()` = owner, therapist, team_lead, office
(`20260915100000_office_reads_treatment_documentation.sql`); `documentation_status` in
`list_day_plan` und `list_appointments` hängt an `app.can_read_treatment_evidence()`, dieselben vier
Rollen; das Büro **bekommt** den Stand. Der Client blendet aus: `CalendarPage.tsx:404–410` setzt
`documentation_status: null` für Nicht-Schreiber (ANN-201); `today/api.ts:155` `istOffen` verlangt
`darfDokumentieren`; `TreatmentNoteSection.tsx` `!(faellig && darfSchreiben) → null`;
`TerminPanel.tsx` `darfDoku = canWriteTreatmentNote && eigener`. Die Lese-Links hängen korrekt an
`canReadTreatmentNote`. Hinweis am Rand: `canWriteTreatmentNote` und `app.can_write_treatment_note`
sind therapist und team_lead **ohne owner**, Client und Datenbank konsistent. _Beste Lösung:_ ein
Leserecht, eine Regel: Sichtbarkeit von Status, „Doku offen“ und Lese-Links folgt
`canReadTreatmentNote` ↔ `app.can_read_treatment_note()`; Schreibknöpfe („Doku“, „Finalisieren“)
bleiben an `canWriteTreatmentNote`. Server: `documentation_status` von `can_read_treatment_evidence`
auf `can_read_treatment_note` umhängen (heute dieselbe Liste, aber eine Funktion). ANN-201 wird
revidiert: „Doku offen“ ist Information für alle Leser, Aufgabe nur für Schreiber, unterschieden
über den Ton (Warnung nur für Schreiber). _Umsetzung:_ Migration `list_day_plan`,
`list_appointments`, `list_patient_treatment_evidence`; `test:db` (`day-plan`, `appointments`:
office erhält Status, Trainingsbetreuung und Patientenkonto null); Unit `today/api.test.ts`,
`TreatmentNoteSection.test.tsx`, `TerminPanel.test.tsx`, `CalendarPage.test.tsx` je Rolle. Pfad A,
S–M. _Entscheidung:_ keine; nur der Hinweis, dass owner heute nicht dokumentieren kann.

**Klinischer Ort für Verordnungshinweise (BEF-098).** _Stand:_ Trifft zu. Das Formular schreibt
nur `note`; `treatment-bases/api.ts:719` sendet `p_note`, `prescriber_note` nur als Bestandstext.
Die Spalte `treatment_bases.prescriber_note` (≤ 2000) existiert, `create/update_treatment_basis`
tragen `p_prescriber_note` weiter; nur der Client schickt nichts. Die klinische Projektion liefert
ihn für vier Rollen. _Beste Lösung:_ `prescriber_note` wieder öffnen, nur für
`treatment_basis_kind = 'verordnung'` (ADR-020 hält klinische Felder beim Selbstzahler leer,
Constraint besteht), Label „Behandlungsrelevante Hinweise aus der Verordnung“ unter „Anmerkungen“
mit der Erläuterung, dass Anmerkungen organisatorisch sind; Bestandstext wird zum Feldwert. Da seit
PRX-010 auch office `update_treatment_basis` ruft (ANN-011), muss der Server eine Änderung von
`p_prescriber_note` durch office **abweisen** (nicht still ignorieren). Anzeige in der klinischen
Spalte der Grundlagen und in der Kontextspalte der Akte. _Umsetzung:_ `TreatmentBasisFormFields.tsx`,
`grundlagenfelder.ts`, `api.ts`, `TreatmentBasisFormPage.tsx`, `PatientTreatmentBasesPage.tsx`,
Migration `update_treatment_basis`; `test:db` `treatment-bases` (office → 42501 bei Änderung,
Selbstzahler → Constraint), Unit Formular. ANN-065 fortschreiben. Pfad A, S–M. _Entscheidung:_
keine.

**Erhebungen (BEF-101).** _Stand:_ (1) `app.assert_questionnaire_answers` (frb_002b) prüft nur
Form (Objekt, Kennungen, ≤ 64 KiB), Instrument und Version nur per Regex; Definitionen liegen als
JSON in `src/features/assessments/definitionen/` (ANN-083), **kein Tegner** im Release; nur eine
Version je Instrument, `PatientBefundPage.tsx:178` nennt „Fassung x“, rendert aber mit der
aktuellen. (2) `supersedes_response_id` und `change_reason` vorhanden; `recorded_on` wird aus der
korrigierten Erhebung vorbelegt, ist aber editierbar; `verlauf.ts` zeigt nur geltende Bögen am
`recorded_on`; Punkt 2 ist damit weitgehend erfüllt, es fehlen die Sperre des Datums und „korrigiert
am“. (3) nur eine Regel in `darstellung.ts` nötig. (4) `version` semver (ANN-084), keine
Vergleichbarkeitsmarke. _Beste Lösung:_ (1) Build-Schritt `scripts/definitionen-sql.mjs` erzeugt aus
den JSON eine Tabelle `public.questionnaire_definitions (instrument_id, version, schema jsonb)`
(Produktinhalt ohne `organization_id`, nur lesbar); `app.assert_questionnaire_answers(p_instrument,
p_version, p_answers)` prüft Items, Optionen, Wertebereiche und Kombinationen in plpgsql gegen das
jsonb; ein Test hält JSON und Tabelle deckungsgleich (Muster `klassen.ts`/`retention.test.ts`).
Alte Versionen: `definitionen/scores/<id>/<version>.json`, `ladeDefinitionen` hält alle,
Anzeige und Auswertung mit `erhebung.definition_version`. (2) `recorded_on` bei Korrektur readonly
(Server: muss gleich `v_alt.recorded_on` sein), Anzeige „Korrektur vom <created_at>“. (3)
`meta.leseart: 'höher = aktiver'` Pflicht bei Richtung `nicht_anwendbar`. (4)
`meta.vergleichbar_mit: ['1.0.0']` je Version, im Schema geprüft; der Verlauf zeichnet nur
vergleichbare Versionen in eine Reihe. _Umsetzung:_ Pfad A; L für (1), S für (2) bis (4); `test:db`
`questionnaire-responses` (falsche Option, Wert außerhalb, unbekannte Version, Datum bei Korrektur),
`schema.test.ts`, `definitionen.test.ts`, `verlauf.test.ts`. Mit BEF-103 (4) bündeln (gleicher
Versionsmechanismus). ANN-105, ANN-084 fortschreiben. _Entscheidung:_ keine; Tabelle statt Funktion
als Annahme (Anker Build-Skript).

**Verlaufsereignis hart gelöscht (BEF-102).** _Stand:_ Trifft zu: `remove_patient_course_event`
(frb_002e) `delete from public.patient_course_events`, Audit nur Metadaten; keine
`removed_*`-Spalten. _Beste Lösung:_ Soft Delete: `removed_at`, `removed_by`; die Funktion setzt
statt zu löschen (schon entfernt → P0002); `list_patient_course_events` filtert; neue Projektion
`list_removed_patient_course_events(p_patient_id)` (gleiches Leserecht, protokolliert) für „Entfernte
Ereignisse“ als `Disclosure` unter dem Verlauf; `export_patient_record` nimmt entfernte mit
Kennzeichen auf. Frist folgt der Akte (FK cascade, Klasse `patientenakte`). _Umsetzung:_ Migration,
`assessments/api.ts`, `verlauf.ts`, `VerlaufAbschnitt.tsx`; `test:db` `course-events` (Zeile bleibt,
nicht in Liste, im Export, Rolle ohne Recht). ANN-106 fortschreiben. Pfad A, S. _Entscheidung:_
keine.

**Bausteine (BEF-103).** _Stand:_ (1) `CompleteTreatmentPage.entwurfSichern` und
`TreatmentNotePage` hängen `vorschlagRef` bei „Speichern und weiter“ an (ANN-120). (2)
`seiteUmstellen` (`dokumentationstext.ts:149–167`) löscht bei beidseits → Seite die andere Seite
still. (3) `ERGEBNIS_ZEICHEN` ✅/❗ allein im Text. (4) Tippfehler in `03-schulter.json:102`,
`04-ellenbogen.json:13`, `07-knie.json:70`. _Beste Lösung:_ (1) `entwurfSichern` sichert nur
`wertRef.current`; die Rückfrage sagt „Vorschlag nicht übernommen, geht verloren“ statt still
anzuhängen. Der wörtliche Erhalt der Häkchen bräuchte ein `draft_findings jsonb` an
`treatment_notes` (Server, beim Finalisieren geleert); Empfehlung: zuerst der sichere Schritt,
`draft_findings` als Folge-Story, falls Jannes den Erhalt will. (2) `Rueckfrage` beim Seitenwechsel
(unsichtbar erhaltene Angaben wären ebenfalls „still“). (3) Textzeile „✅ o.B.“ / „❗ positiv“,
Patch-Version aller Regionen. (4) Labels korrigieren, `version` 1.0.1, README und ANN-119
fortschreiben, `status: unvollstaendig` bleibt. _Umsetzung:_ Pfad S, S–M (`draft_findings` wäre Pfad
A, M); Tests `CompleteTreatmentPage.test.tsx`, `dokumentationstext.test.ts`, `bausteine.test.ts`,
E2E `bausteine.spec.ts`. Mit BEF-056/057 bündeln. _Entscheidung:_ Häkchen serverseitig erhalten oder
Verlust mit klarer Rückfrage; Empfehlung Rückfrage zuerst.

**Therapiebericht (BEF-104).** _Stand:_ `therapy_reports` (dok_005a) ohne `supersedes_report_id`
und `change_reason`; die UI sagt nur „Eine Korrektur ist ein neuer Bericht“. Grenze größtenteils
erledigt: `zuViele` sperrt Speichern und Abschließen mit Statusmeldung, Server wirft `too many
entries`, Check `cardinality ≤ 50`; aber der 51. Haken wird gesetzt und ein Zähler fehlt. _Beste
Lösung:_ Migration `supersedes_report_id` (FK), `change_reason` (3–500), Constraint beide oder
keins, partieller Unique-Index (höchstens eine Korrektur); `create_therapy_report` prüft alter
Bericht abgeschlossen und gleiche Grundlage; Snapshot trägt `korrigiert: {report_id, reason, at,
by}`; `BerichteDerVerordnung` zeigt „Ersetzt durch Korrektur vom …“, Druckblatt „Korrigierte
Fassung“. Zähler „12 von 50“, 51. Checkbox `disabled` mit Hinweis. _Umsetzung:_ Migration,
`therapy-reports/api.ts`, `TherapieberichtPage.tsx`, `BerichteDerVerordnung.tsx`,
`Berichtsblatt.tsx`; `test:db` `therapy-reports` (nur auf abgeschlossen, Grund Pflicht,
Doppelkorrektur abgewiesen), Unit. ANN-121/122 fortschreiben. Pfad A, M. _Entscheidung:_ keine.

**Dateityp, Prüfsumme, Metadaten vom Browser (BEF-105).** _Stand:_ Trifft zu.
`confirm_patient_file_upload` (dok_006b) vergleicht Größe und `mimetype` aus
`storage.objects.metadata` mit der Ankündigung; Prüfsumme nur Regex, nie nachgerechnet; Magic-Bytes
nur im Client (`dateiInhaltAblehnungsgrund`); Metadaten-Entfernung nur im Browser (`metadaten.ts`,
entfernt auch ICC). Kamerafotos entstehen aus `canvas.toBlob('image/jpeg')` und sind sRGB ohne
Profil; das Farbproblem betrifft nur Dateiwähler-Uploads mit eingebettetem Profil. Keine Edge
Function für Dateien; ADR-017 Punkt 28: keine Virenprüfung in V1. _Beste Lösung:_ Edge Function
`patient-file-verify` (Deno, scharf erst nach OPS-001 wie `platform-access`): liest das Objekt mit
Service-Key, prüft Magic Bytes, rechnet SHA-256, prüft bei JPEG/PNG auf Restmetadaten (Port der
Erlaubnisliste aus `metadaten.ts`), schreibt `checksum_verified_at`, `content_type_verified`,
`metadata_verified` nach `patient_files`; `confirm_patient_file_upload` setzt `ready` erst nach
Verifikation oder markiert `verification: 'pending'` mit Anzeige „nicht serverseitig verifiziert“.
Bis die Runtime scharf ist: Spalten und Kennzeichen anlegen (kein neuer Anbieter, ADR-002:
Supabase-Edge ist derselbe). Farbe: im Client vor dem Entfernen per Canvas nach sRGB umrechnen
**nur wenn** ein ICC-Profil vorhanden ist, sonst byte-gleich lassen; ANN-125 fortschreiben.
_Umsetzung:_ Pfad A, L in Teilstücken: Spalten und Kennzeichen (S), Farbumrechnung im Client (S,
Test mit ICC-Testbild in `testbilder.ts`), Edge Function (M, nur lokal testbar). `test:db`
`patient-files` (ready erst nach verify; pending sichtbar). Mit BEF-059 und OPS-001 bündeln.
_Entscheidung:_ keine inhaltliche; Deployment der Function ist Stopp-Liste, bauen ja, scharfschalten
mit OPS-001.

**Dokumentationsfotos vs. Arbeitshilfe (BEF-106).** _Stand:_ Trifft zu. Eine Klasse
`patientenfoto` (12 Monate, 3 Monate nach Abschluss, Art. 9 Abs. 2 lit. a DSGVO, ANN-126);
`patient_photo_accessible` sperrt bei Widerruf, `delete_due_patient_photos` löscht; ADR-017
Punkte 35 bis 38 definieren jedes Patientenfoto als Arbeitshilfe; `prepare_patient_file_upload`
erzwingt JPEG und Einwilligung. _Beste Lösung:_ neue Dokumentart `dokumentationsfoto` (klinisch,
eigener Bucket nach Punkt 3 „ein Bucket je Datenklasse“), Klasse `patientenakte` (zehn Jahre ab
`care_concluded`, § 630f BGB, Zuordnung über `retention_assignments`), Rechtsgrundlage Art. 9
Abs. 2 lit. h DSGVO, **keine** Einwilligungsprüfung, kein Widerruf-Löschpfad, Legal Hold wie Akte;
weiter nur über den Kameradialog, Metadatenentfernung, Anzeige ohne Download. Der Kameradialog fragt
**vor** der Aufnahme: „Teil der Dokumentation (Akte, zehn Jahre)“ oder „Vorübergehende Arbeitshilfe
(zwölf Monate, auf Einwilligung)“, ohne Vorauswahl (Muster ANN-129). ADR-017 bekommt eine neue
Fassung mit drei Arten in Punkt 31, Grundlage je Art in Punkt 35, Frist je Art in Punkt 38; der
Widerruf-Satz in `Einwilligungsstand` wird angepasst. Export (BEF-107) nimmt beide mit.
_Umsetzung:_ **vorher Docs-Session ADR-017** (gemeinsam mit BEF-059); dann Pfad A, L: Migration
(document_types, `patient_file_bucket_for`, `can_write_patient_file`, `list_patient_photos` mit
`kind`), Client `dokumentarten.ts`, `patientenfotos.ts`, `Kameradialog.tsx`, `FotosImVerlauf.tsx`,
`klassen.ts`; `test:db` `patient-photos` (ohne Einwilligung erlaubt, Widerruf löscht nicht, Legal
Hold, Retention über Akte, fremde Org), `retention.test.ts`, `fotos.spec.ts`. _Entscheidung:_ ADR-Text
durch Jannes; Wortlaut im Kameradialog als Annahme; lit. h geht in B2 und blockiert nicht (§15.2).

### Abrechnung und Behandlungsgrundlage

Vorab: Der Seed enthält heute **keine Rechnungen** (`supabase/seed.sql` löscht nur); die
Seed-Aussagen in BEF-061 und BEF-062 sind veraltet. Zu ABR-EPIC-007 gibt es keine Spezifikation,
nur die Roadmap-Zeile, ADR-009 Fassung 4 Punkt 22 und B17.

**Rechnungsliste endet stumm bei 100 (BEF-061).** _Stand:_ Kern trifft zu: `billing/api.ts` ruft
`list_invoices`, `list_open_items`, `list_payments` mit `p_limit: 100`, Kandidaten 100, Leistungen
200; serverseitig `least(coalesce(p_limit,100),200)`, kein Offset, keine Suche, kein Filter, keine
Gesamtzahl; `InvoicesPage.tsx` ohne Kürzungshinweis, unter „Offene Posten“ weiter gekürzte Anzahl
neben ungekürzter Summe. **Erledigt durch UX-005i:** Nummer als `Textlink`, kein 48-px-Knopf je
Zeile, Betrag rechts, Druckknöpfe unter dem Blatt in `max-w-[210mm]`. Eine echte Spaltenform ab
1024 px gibt es nicht. _Beste Lösung:_ sofort `count(*) over ()` als `total_count` in den drei
Listen (Muster `open_total_cents`) mit dem Satz „Es werden die 100 zuletzt … gezeigt, insgesamt N“
und „N Rechnungen · Summe“ vom Server; danach `list_invoices(p_limit, p_offset, p_search, p_status,
p_month)` mit Suche nach Nummer und Name, Filter `draft | open | overdue | cancelled`, Blättern per
Offset; Spaltenform nur als kleine Nacharbeit mit Container-Query. _Umsetzung:_ Pfad A (geänderte
SECURITY-DEFINER-RPCs): Migration mit neuen Signaturen, `api.ts`-Schemata, `InvoicesPage.tsx`,
`PaymentsPage.tsx`; `invoices.test.ts`, `payments.test.ts` (Treffer, Filter, Gesamtzahl,
Abweisung). Hinweis S, Suche M. _Entscheidung:_ nur, ob Option 2 vorgezogen wird; Empfehlung
Hinweis in ABN-EPIC-001, Suche als eigene Story vor dem ersten echten Rechnungslauf.

**Korrekturbezug nach Storno, Empfänger (BEF-062).** _Stand:_ (1) trifft zu: `create_invoice_draft`
setzt kein `replaces_invoice_id`, nur `create_correction_draft`; `list_invoice_candidates` liefert
keine Herkunft; nach dem falschen Weg wirft „Korrekturrechnung erstellen“ 23505, und `api.ts:613`
übersetzt das weiterhin in „Er ist die Korrektur“. (2) nur noch halb: Der Server kann alles
(`save_invoice_recipient` mit `p_id` und `p_is_default`, Teilindex ein Standard je Patient:in,
`delete_invoice_recipient`, `create_invoice_draft` übernimmt den Standard, ANN-076); die
Oberfläche nutzt nichts davon (`InvoiceDetailPage.tsx:1047–1185`: immer `id: null`, `is_default:
false`, Art `aid_authority` vorbelegt). _Beste Lösung:_ (1) Option b sichtbar **plus** Server-Guard:
`list_invoice_candidates` liefert `cancelled_invoice_id/_number` (jüngste stornierte Rechnung mit
denselben Leistungen), die Kandidatenkarte zeigt „aus stornierter RG-… · Korrekturrechnung
erstellen“ und ruft `create_correction_draft`; `create_invoice_draft` setzt `replaces_invoice_id`
selbst, wenn **genau eine** stornierte Quelle gefunden wird, und weist bei mehreren ab; die falsche
Meldung streichen. (2) Option b nur Oberfläche: Bearbeiten, Entfernen, Standard-Häkchen, Art ohne
Vorbelegung, Neuer wird gewählt. _Umsetzung:_ (1) Pfad A, M: eine Migration,
`invoice-cancellations.test.ts`, `invoice-service-area.test.ts` (Weg A = Weg B, zwei Stornos). (2)
S: `InvoiceDetailPage.tsx` mit `p_id`/`p_is_default`, Komponententests. (1) mit BEF-100 (2) in
eine Story „Storno → Zahlung → Korrektur“. _Entscheidung:_ keine zwingende, b/b bestätigen genügt.

**„Rechnung ausstellen“ ohne Rückfrage (BEF-063).** _Stand:_ Trifft zu: `Entwurfsaktionen`
(`InvoiceDetailPage.tsx:1188–1270`) direkter `Button` mit Folgenabsatz davor, daneben „Entwurf
verwerfen“ mit `Rueckfrage`, beide in einer `flex-wrap`-Zeile. Der Foto-Teil ist seit UXR-006
erledigt. _Beste Lösung:_ Option 2: `Rueckfrage` mit Kontrollwerten aus `ansicht.document`
(Empfänger und Art, `total_cents`, Bereich als „Kreis Behandlung/Training“) und dem Satz „Danach
unveränderlich“, Bestätigung „Ja, Rechnung ausstellen“, Fehler bleibt im Kasten; „Entwurf verwerfen“
als `quiet` mit Abstand. Als ANN: Irreversibles mit Außenwirkung bekommt eine Rückfrage mit
Kontrollwerten (löst die Ausnahme von ADR-016 Punkt 4 für die Rechnung ab; gilt auch für BEF-064).
_Umsetzung:_ Pfad S (kein Aufruf ändert sich), `InvoiceDetailPage.tsx` + Test (Rückfrage zeigt
Empfänger und Betrag, Ausstellen erst nach Bestätigung); visuell bei 375 px. S. _Entscheidung:_
Option 1, 2 oder 3; Empfehlung 2. Die Trennung des Verwerfen-Knopfs geht ohne Antwort.

**Kontingent zählt `max(used_quantity)` und Nichtantreffen (BEF-096).** _Stand:_ Trifft voll zu.
`app.treatment_basis_slot_counts` (`20260918140000_appointment_coverage.sql`, einzige Definition):
`used = max(used_quantity)`; `planned`, `covered`, `uncovered` zählen `status <> 'cancelled'`, also
auch `no_show`. Dasselbe Muster in `app.appointment_is_covered`, `list_patient_treatment_basis_slots`
(`upcoming`), `prx_016_reminders.sql:86–96`, `sta_001_practice_statistics.sql:70–76`. Zustände:
`confirmed, cancelled, no_show, completed, documented, invoiced`. _Beste Lösung:_ eine Migration
(OUT-Typ bleibt, `create or replace`): `used` = Termine der Grundlage mit `status in ('completed',
'documented', 'invoiced')`, damit zählen mehrere Heilmittel und Doppelbehandlung automatisch einmal;
`planned` = `status not in ('cancelled', 'no_show')`; `appointment_is_covered`: `no_show` wie
`cancelled`; `upcoming` und `letzter` ebenso; `used_quantity` je Position unangetastet (ANN-073);
der Rückweg `no_show → completed` heilt sich, weil alles abgeleitet ist. _Umsetzung:_ Pfad A,
`test:db` zwingend; `appointment-coverage.test.ts`: T1 KG, T2 MT → `used = 2` (heute 1);
Nichtantreffen belegt und verbraucht nichts; Doppelbehandlung ein Termin → 1; Überplanung bleibt
`uncovered`; Erinnerungstest. UI-Texte unverändert. M. **Vor BEF-097 und BEF-099.** _Entscheidung:_
keine; zur Kenntnis: ein `completed` ohne Dokumentation zählt als genutzt.

**Übertragung lässt Leistungen zurück (BEF-097).** _Stand:_ Trifft zu.
`transfer_appointments_to_treatment_basis` prüft Org, Patient:in, Status und abgerechnete Leistungen,
schreibt aber nur `appointments.treatment_basis_id` und ein Audit; `billable_services.
treatment_base_item_id` bleibt, `used_quantity` der alten Position bleibt verbraucht. Die Oberfläche
(`TermineUebertragenPage.tsx:141–177`) bietet nur ungedeckte **künftige** Termine an. _Beste Lösung:_
in derselben Transaktion, Matching wie `record_billable_services` (`treatment_base_items.remedy =
service_catalog_items.remedy`): für `billable_services` mit `status = 'billable'` Zielposition mit
gleichem `remedy`, sonst Abweisung 22023 „target basis has no position for remedy %“ und nichts
geschrieben; alte Position `used_quantity -= quantity`, neue `+= quantity`, bei verletzter Grenze
verständlich abweisen; `treatment_base_item_id` umsetzen; Audit um `service_count` und Mengen je
Heilmittel ergänzen (keine Namen); Leistungen ohne Position (Ausfallhonorar) ziehen ohne
Mengenbewegung mit. Oberfläche: zugeklappte Liste „Vergangene Termine“ (durchgeführt, nicht
abgerechnet), sonst bleibt die Korrektur unerreichbar. _Umsetzung:_ Pfad A, `test:db`; Migration;
Tests abgerechnet → abgewiesen, erfasst → Position und Mengen wandern bei konstanter Summe, keine
Position → Abweisung, Kontingentgrenze; `TermineUebertragenPage.tsx` + Test. M, nach BEF-096.
_Entscheidung:_ Vergangene Termine in der Oberfläche anbieten? Empfehlung ja, zugeklappt, mit Hinweis
„Leistungen ziehen mit“.

**Terminhonorar statt Heilmittelpreise (BEF-099).** _Stand:_ nichts gebaut. Der Katalog
(`service_catalog_versions` mit `valid_from`, `published_at`) ist **bereits versioniert mit
Gültigkeitsbeginn**; `service_catalog_items(code, item_kind in ('treatment', 'absence_fee'), remedy,
unit_price_cents, tax_treatment, tax_rate_permille)`; `billable_services` ohne Preis, der Preis wird
zur Rechnungszeit aus dem unveränderlichen Katalogeintrag gelesen; `app.build_invoice_document` ist
die **eine** Darstellungsstelle. _Beste Lösung:_ mit dem Katalog, nicht daneben. Neuer `item_kind =
'session_fee'` (remedy null, `exempt_healthcare`); neue Katalogversion mit Heilmittelpositionen zu
Preis 0 (Nachweis für `used_quantity`) und einer Honorarposition 140 €; alte Versionen und Rechnungen
unverändert. Neue Tabelle `patient_fee_agreements(organization_id, patient_id, valid_from,
session_fee_cents, tax_treatment, tax_rate_permille, note, created_by …)`, unique `(patient_id,
valid_from)`, RLS wie Katalog (owner schreibt, ANN-071); Auflösung am Leistungstag: Vereinbarung mit
größtem `valid_from <= performed_on`, sonst Tarif der am Tag gültigen Katalogversion.
`billable_services` bekommt `unit_price_cents` (Snapshot bei Erfassung, Backfill aus Katalog),
`fee_agreement_id`, `line_kind` und einen Teilindex „genau eine Honorarzeile je Termin“;
`record_billable_services` legt am Behandlungstermin die Honorarzeile automatisch an; Kandidaten,
Entwurf, Korrektur, Dokument lesen `b.unit_price_cents`. Darstellung: Schalter
`app.invoice_presentation()` (`'per_session'` Vorgabe, B17 offen) in `build_invoice_document`: Zeile
„Behandlungstermin TT.MM., 60 Min“ mit Heilmitteln als Hinweistext. Test an einem Fall: zwei
Termine, T1 KG+MT, T2 KG → genutzt 2 (BEF-096), KG 2 / MT 1, Rechnung 280 €. _Umsetzung:_ Pfad A,
L: zwei bis drei Migrationen, `CatalogPage`, `ServicesPage`, Vereinbarungsfläche in der Akte; Tests
`service-catalog`, `billable-services`, `invoices`, neu `fee-agreements`. Voraussetzung BEF-096.
Vorschlag: ABR-EPIC-007 teilen in **007a Terminhonorar** (jetzt, synthetisch 140 €) und **007b
Trainingspaket** (BEF-114, nach Preisen). _Entscheidung:_ B17 vorläufig per ANN „eine Zeile mit
Heilmittelhinweis“. **Nötig:** Gilt 140 € je Termin unabhängig von der Dauer (Doppelbehandlung
120 Minuten = ein Honorar oder zwei)? Nur owner legt Vereinbarungen an? Ausfallhonorar bleibt eigene
Katalogposition (Empfehlung ja, ADR-018).

**Steuernummer, Storno mit Zahlung, Teilzahlungsrundung (BEF-100).** _Stand:_ alle drei treffen
zu. (1) `tax_number not null`, `vat_id` optional, `save_practice_billing_profile` ohne `nullif`.
(2) `cancel_invoice` wirft „void the payments of this invoice first“; der Trigger
`app.payments_need_issued_invoice` verweigert **jede** Zahlung an einer stornierten Rechnung, auch
`direction = 'refund'`; eine Rückzahlung nach Storno ist heute nicht buchbar. (3)
`list_revenue_by_service_area` verteilt und rundet je **Zahlung**. _Beste Lösung:_ (1)
`tax_number` nullable, Check `(tax_number is not null or vat_id is not null)`, `nullif` für beide,
Beschriftung „Steuernummer oder USt-IdNr.“, Dokument druckt, was vorhanden ist, IBAN bleibt
Pflicht. (2) Storno **mit** Zahlung zulassen; Eingänge bleiben an der stornierten Rechnung als „noch
zu verrechnen“; zwei neue Buchungen in `payments`: Verrechnungspaar (`refund` an der alten,
`incoming` an der neuen, gleiche Höhe, verknüpft über `counterpart_payment_id`) per RPC
`transfer_payment_credit(p_from_invoice, p_to_invoice, p_amount)` auf eine ausgestellte Rechnung
derselben Person, und die echte Rückzahlung (`refund`) an der stornierten; Trigger: an stornierter
Rechnung nur `refund` und Verrechnungsabgang; Storno-Abschnitt zeigt „x € eingegangen, y €
verrechnet, z € zurückgezahlt“; `void_payment` bleibt Korrektur einer Fehlbuchung. (3) kumulativ:
laufende Summe je Rechnung mit Vorzeichen (`sum(...) over (partition by invoice order by paid_on,
created_at, id)`), Anteil = Verteilung(kum_nach) − Verteilung(kum_vor) mit derselben
Größter-Rest-Regel, Zeitraumfilter erst auf die Differenz; Rückzahlung nimmt genau zurück.
_Umsetzung:_ Pfad A, `test:db`: (1) S `practice-billing-profile.test.ts`; (2) M–L Migration (Spalte,
Trigger, `cancel_invoice`, RPC, Audit `payment.credit_transferred`), `InvoiceDetailPage`,
Zahlungsformular, Tests `invoice-cancellations`, `payments`, mit BEF-062 (1) bündeln; (3) S–M nur
Lesefunktion, `revenue-by-service-area.test.ts` mit drei krummen Teilzahlungen (33,33 / 33,33 /
33,34 auf 100 € mit Gruppen 70/30) und Rückzahlung. _Entscheidung:_ zu (2): Verrechnung auf jede
ausgestellte Rechnung derselben Person oder nur auf die Korrektur? Empfehlung dieselbe Person,
Standard die Korrektur.

**Trainingskontakt und Trainingsrechnung (BEF-111).** _Stand:_ Trifft zu. `training_contact_details`
hat `street`, `postal_code`, `city`, keine `house_number`; UI-Feld „Straße und Hausnummer“;
`app.split_street_and_house_number` und `app.training_visit_address` trennen per Regex;
`app.build_invoice_document` schreibt `street` ungeteilt und `house_number: null`; `issue_invoice`
prüft keine Empfängeranschrift. _Beste Lösung:_ (1) Spalte `house_number`; Datenmigration einmalig
mit der vorhandenen Split-Funktion, **nur** wenn eindeutig (Hausnummer beginnt mit Ziffer, Straßenrest
endet nicht auf Einzelziffer oder Großbuchstaben wie „B 27“), sonst bleibt `street` ungeteilt; „zur
Prüfung“ ist ableitbar (`house_number is null and street ~ '\d'`) und wird auf der Kontaktseite
angezeigt, kein Flag; danach `training_visit_address` liest die Spalten, Split-Funktion droppen,
Upsert-RPC und `TrainingClientFields` mit zwei Feldern. (2) `issue_invoice` verlangt bei
`training_relationship_id` Straße, Hausnummer, PLZ, Ort, sonst 22023 „training invoice recipient
address incomplete“; `api.ts` nennt die fehlenden Felder mit Link zum Kontakt; Dokument nimmt
`house_number` auf. _Umsetzung:_ Pfad A, `test:db`; Seed anpassen (`db reset`); Tests
`training-clients.test.ts` (eindeutig, uneindeutig, ohne Nummer), `training-appointments.test.ts`,
`training-invoices.test.ts`. M. _Entscheidung:_ gleiche Sperre auch für Behandlungsrechnungen an die
Person selbst (Anschrift aus `patient_contacts`, ebenfalls ungeprüft)? Empfehlung ja, eine Prüfung
in `issue_invoice`.

**Trainingspakete (BEF-114).** _Stand:_ nicht modelliert. `app.appointment_is_billable` (trn_007):
Training `completed | documented` → Einzelstunde (ANN-181); `billable_services.appointment_id not
null`, ein Paket ohne Termin passt nicht hinein. _Beste Lösung (Skizze):_
`training_packages(training_relationship_id, catalog_item_id [item_kind 'package'], starts_on,
ends_on, price_cents Snapshot, payment_mode in ('upfront', 'monthly'), status)`; die Forderung als
`billable_services`-Zeile **ohne Termin** (`appointment_id` nullable, Check „genau eins von
appointment_id/package_id“), bei `monthly` je Monat eine Zeile (Muster Nachsorge-Abo);
`appointment_is_billable` liefert für Termine in einem aktiven Paket false,
`record_billable_services` weist mit Grund ab; Steuerkennzeichen am Posten (B4 als Annahme).
_Umsetzung:_ Pfad A, L; Tests `training-services`, `training-invoices`, neu `training-packages`. Aus
ABR-EPIC-007 herauslösen (007b), erst nach der Festlegung; bis dahin ANN-181. _Entscheidung:_ Preis
je Paket, Umfang (Einheiten je Woche, Hausbesuch inklusive?), Zahlungsweise (Vorkasse oder
Monatsraten), vorzeitiges Ende und Erstattung, Einzelstunde daneben, Steuerkennzeichen (B4).

### Rollen, Audit, Datenschutz, Plattform

**Zugang und Rollen (BEF-064).** _Stand:_ Trainer-Rolle erledigt. Offen: „Rollen speichern“ ohne
Rückfrage (`StaffAccountSection.tsx:463–468`); `BestehenderZugang` kennt den angemeldeten Benutzer
nicht und bietet am eigenen Datensatz „Zugang sperren“ an (`cannot_lock_own_account` erst danach);
Deaktivieren mit offenen Terminen zweistufig über den Fehlerpfad; Instrumente-Route und Menüpunkt
hängen an `canWriteTreatmentNote` (therapist, team_lead), obwohl `canWriteQuestionnaire` owner
einschließt (ANN-103); `PatientBefundPage.tsx:114` sagt nur „Noch nicht erhoben.“ _Beste Lösung:_
(1b) `Rueckfrage` nur, wenn `gespeichert` Rollen enthält, die in `rollen` fehlen („… verliert damit
sofort den Zugriff auf die Akten.“); (2a) Guard für Route und Menüpunkt auf `canWriteQuestionnaire`,
Textbausteine bleiben bei `canWriteTreatmentNote`; `user` an `StaffAccountSection` reichen, am
eigenen Konto der Satz statt des Knopfs; Deaktivieren: Rückfrage beim Öffnen mit Zahl der offenen
Termine aus dem bestehenden Lesepfad, ein Schritt, Serverprüfung STAFF-001 bleibt; für Leserollen am
Bogen „Erhoben wird von den behandelnden Rollen.“ _Umsetzung:_ `StaffAccountSection(.test).tsx`,
`StaffMemberDetailPage.tsx`, `navigation(.test).tsx`, `AuthenticatedRoutes.tsx`,
`PatientBefundPage.tsx`. Pfad A ohne Migration (Sichtbarkeit zwischen Rollen), kein `test:db`. S.
_Entscheidung:_ keine zwingende; 1b/2a als Annahme.

**Audit, Aufbewahrung, MDR-Sperre (BEF-065).** _Stand:_ alles trifft zu. `shortReference` kürzt auf
12 Zeichen, volle Kennung nur im `title`; Ergebnis als grauer Text; Filter in `useState`;
`list_audit_events(p_limit, p_offset)` ohne Stichtag, daher Verschiebung durch das eigene
`audit_log.read`; `AUDIT_ACTIONS` ungruppiert. UX-005i hat nur Fußnoten eingeklappt.
`AufbewahrungPage.tsx:490–537`: Plan → Löschsperren → Offene Löschaufträge → Abgleich → Journal;
„Fristen ändern sich über eine Migration“, „Kürzel ANN-NNN“, „Objektspeicher“. `MdrSperre.tsx` und
`mdr-sperre.spec.ts` unverändert. _Beste Lösung:_ Option 2. Audit: `list_audit_events` um
`p_as_of timestamptz default now()` (`occurred_at <= p_as_of`), Seite hält den Stichtag („Stand
14:03 – neu laden“); „Abgewiesen“ als kritisches `Badge`; Aktionen per `optgroup` nach
`auditSubjectLabels`; Filter in `URLSearchParams`; unter 640 px in `<details>`. Aufbewahrung: oben
Zustandsblock (Löschaufträge und Abgleich, leer als eine Zeile), dann Sperren, Plan, Journal;
„Annahme – Prüfung offen“ statt Kürzel, ADR-Verweise aufklappbar, „Programmänderung“. MDR: Haupttext
in Praxissprache, Kennung als Fußzeile; E2E prüft Kennung und neuen Satz gleich streng. Option 3
(Akte öffnen, Namen) erst mit B2, weil ADR-010 Punkt 13 berührt. _Umsetzung:_ Migration für
`list_audit_events` (Audit-Lesepfad) → Pfad A, `audit.test.ts` (Stichtag, keine Verschiebung);
`AuditLogPage.test.tsx`, `AufbewahrungPage.test.tsx`, `mdr-sperre.spec.ts` plus Fixture. M.
Audit-Teil mit BEF-107, Aufbewahrung mit BEF-108. _Entscheidung:_ nur die geänderte E2E-Textprüfung
der Sperre (harte Regel) mit genauem Wortlaut vorab freigeben.

**Vorschauen des Praxisbetriebs (BEF-066).** _Stand:_ alle vier Vorschauen unverändert, ohne
Datenbank; FLT-EPIC-001, URL-001, ZK-001, ERS-001 stehen nur als Einzeiler in der Roadmap, keine
Spezifikation im Repo. _Beste Lösung:_ Option 2 als verbindliche Vorgabe in den Zuschnitt der vier
Loops: eigene Zeile sieht jede Person; fremde Zeilen in Zeitkonto und Erstattungen nur owner; Urlaub
anderer nur Zeitraum (Grund als eigene Spalte mit Policy nur Eigentümer:in und owner); IBAN nur
maskiert in der Projektion, Vollwert nur in der Zahlungsfunktion für owner; keine Summe über
Personen (B6, §20); Räder anlegen und entfernen owner, Schlüssel, Panne, Check-Up alle; Hauptknopf
nach Rolle; alles über RLS (ADR-004); die Vorschau wird ersetzt, nicht umgebaut. _Umsetzung:_ jetzt
nur Dokumentation: knapper Vorgabenabsatz an den Block-8-Zeilen in `ROADMAP.md` als Verweis auf
BEF-066 und in `ARBEITSBEREICHE.md`. S. Die Loops später Pfad A. _Entscheidung:_ Option 2 folgt aus
§16 und kann als Annahme gelten; Option 3 (Zusatzrechte office und team_lead nach §4.3 und §4.5)
beim Zuschnitt des jeweiligen Loops.

**Auskunft nach Art. 15 (BEF-107).** _Stand:_ `public.export_patient_record` (zuletzt
`prx_014_call_list.sql:692`) liefert rund 22 Abschnitte; `patient_files` nur Metadaten, kein
Abschnitt `patient_photos`, kein `audit_log`; `nicht_enthalten` nach ANN-092; Fotos einzeln über
`patient_file.handed_out` (ANN-128). _Beste Lösung:_ (a) Abschnitt `access_log`: Zeilen aus
`audit_log` mit `subject_type = 'patient'` sowie Einträge, deren Gegenstand über die Akte auflösbar
ist (`treatment_note`, `patient_file`, `questionnaire_response` per Join), nur `occurred_at`,
`action`, `outcome`, Zweck aus dem Kontext, `actor_kind`, **kein** `actor_user_id`, kein Name; der
Einzelfall mit Namen bleibt der manuelle Weg (ANN-092). (b) Abschnitt `patient_photos` (Metadaten mit
`status`, auch gesperrte, nicht gelöschte) und im Paket eine Dateiliste; die Binärdaten über den
bestehenden, auditierten Signed-URL-Pfad je Datei, Kennungen im Kontext von
`patient_record.exported`; kein ZIP-Dienst. _Umsetzung:_ Migration (SECURITY DEFINER) → Pfad A;
`test:db` `betroffenenrechte.test.ts` (Zugriffe ohne Namen, Fotos enthalten, gesperrte enthalten,
gelöschte nicht), `patient-photos.test.ts`; UI `datenschutz/kategorien.ts`, Dateiliste. M. Mit
BEF-065 und BEF-108. _Entscheidung:_ keine; ANN-092/128 mit Wiedervorlage B2 aktualisieren.

**Warteliste, Zusammenführen, Legal Hold (BEF-108).** _Stand:_ `waitlist_entries` mit
`created_at`/`updated_at`, keine Altersgrenze, kein Wartelistenabschnitt in „Offene Punkte“;
`merge_patients` hebt die Sperre der Dublette auf, wenn die bleibende Akte eine hat (prx_017),
erzwungen durch den partiellen Unique-Index `legal_holds_active_subject_idx`; Nachweis nur
`patient.merged` im Audit (drei Jahre). _Beste Lösung:_ (1) Konstante
`app.waitlist_review_interval()` (Vorschlag acht Wochen, Annahme); `list_waitlist` liefert
`review_due` (`status = 'open' and updated_at < now() - interval`); Abschnitt „Warteliste prüfen“ in
`list_open_points` und `OpenPointsPage`; „Geprüft“ setzt `updated_at` über die vorhandene
Update-Funktion. (2) Tabelle `patient_merge_records(organization_id, target_patient_id FK cascade,
source_patient_id, merged_at, merged_by, counts jsonb)`, Lebensdauer = Akte, Anzeige als Vermerk,
Aufnahme in `export_patient_record`. (3) Partiellen Unique-Index streichen, mehrere aktive Sperren
je Akte zulassen; `under_legal_hold` bleibt `exists`; `release_legal_hold` nach Id;
`merge_patients` hängt nur um, hebt nichts auf; Löschsperren-Liste zeigt alle. _Umsetzung:_
Migrationen, Reihenfolge in `reapply_deletion_journal` → Pfad A; `test:db` `waitlist.test.ts`,
`patient-merge.test.ts`, `legal-hold.test.ts`, `retention-run.test.ts`,
`betroffenenrechte.test.ts`; UI Warteliste, Offene Punkte, Aufbewahrung. M. _Entscheidung:_ keine;
Prüffrist und „mehrere Sperren statt Grund-Feld“ als Annahmen (Empfehlung mehrere Sperren, weil wer
und wann je Grund erhalten bleibt).

**Kartendienst (BEF-109).** _Stand:_ `waehleAdapter` (`location-provider/auswahl.ts:41–51`) prüft
nur `LOCATION_DATA_GATE ∈ {synthetic, released}`, kennt keine Umgebung; `mock` umgeht das Gate;
`docs/datenschutz/kartendienst.md:79` sagt „nie zulässig“, nur Konvention. Kacheln: ADR-019
Punkte 6 und 19 behandeln sie getrennt, das Gate in Punkt 9 nennt nur PTV. Verorten:
`geocodingAuswerten` nimmt `locations[0]` ohne Blick auf die Trefferzahl; `brauchtBestaetigung`
hängt nur an `precision === 'address'`; `houseNumber` ist optional in der Anfrage. **Koordinate bei
Adressänderung wird verworfen** (erledigt). Matrix: `gefaltet` macht negative Werte `null`, keine
Kennzeichnung von Schätzungen. _Beste Lösung:_ Gate: zweites Secret `APP_ENVIRONMENT` (`development
| test | production`); `production` + `synthetic` → `null` mit Protokolleintrag `gate_rejected`;
`production` + `mock` → `null`. Kacheln: Gate-Checkliste in `kartendienst.md` um den Kachelanbieter
(Vertrag, Schlüsselbindung, Logs) ergänzen, ADR-019 in einer neuen Fassung nachziehen. Verorten:
`GeocodeResult.unique` (genau ein Treffer mit `address`-Genauigkeit **und** Hausnummer in der
Anfrage), `brauchtBestaetigung = precision !== 'address' || !unique`. Matrix: das Ergebnisfeld für
Luftlinien-Schätzung anfordern (PTV `ESTIMATED_BY_DIRECT_DISTANCE`, in der Providerprüfung zu
belegen), Zellen mit Schätzung als `null`, UI „Fahrzeit nicht verfügbar“. _Umsetzung:_ Edge Function
und `src/lib/location/contract.ts` → Pfad A (externer Datenfluss); Deno-Tests `auswahl.test.ts`,
`ptv.test.ts`, `handler.test.ts`; Vitest `geocode.test.ts`, `AdresseVerorten`; Docs. M.
_Entscheidung:_ die neue Fassung von ADR-019 (Kacheln im Gate) durch Jannes; Rest als Annahmen
(ANN-094/095/097 fortschreiben).

**Abstecher-Entwurf, MDR-Freigabe (BEF-110).** _Stand:_ `src/lib/abstecher.ts`: In-Memory-Map,
`MAX_ALTER_MS` 30 Minuten, `abstecherAnsehen` gibt bei Ablauf still `undefined`;
`alleAbstecherVerwerfen` bei Abmeldung. `src/app/mdr.ts`: Einträge `{id, bezeichnung, grundlage,
keineAusgabe, pfade}`, `REGULATORISCHE_PRUEFUNG: null`, Öffnen = Eintrag entfernen; keine
Serverfunktionen für die gesperrten Pfade (nichts gebaut). _Beste Lösung:_ (1) Verfall nicht mehr
still: Der Entwurf bleibt, bis die Person entscheidet; ab 30 Minuten zeigt die Rückkehr „Entwurf
von 14:03 wiederherstellen / verwerfen“; Abmelden mit Entwürfen fragt nach, außer bei erzwungener
Beendigung; Bindung an `user.id` bleibt. Die Sperre aus ADR-025 lässt den Tab stehen,
In-Memory-Entwürfe überleben sie. Ein serverseitiger Entwurf kommt, wenn SEC-EPIC-001 den
Entwurfspfad baut; dann Abstecher daran hängen. (2) `MdrEintrag.freigabe?: {geprueftVon,
geprueftAm, ergebnis, verweis}`; `mdrSperre` ignoriert freigegebene Einträge, der Eintrag bleibt im
Register; `mdr.test.ts` verlangt alle vier Felder; Server: `app.mdr_released(feature_id) returns
boolean` (heute konstant `false`), jede künftige RPC eines klassifizierten Bereichs ruft sie;
`test:db` prüft `false` für alle Ids. _Umsetzung:_ (1) `abstecher.ts`, Formulare, SessionProvider,
Pfad S, S, mit G20 bündeln; (2) `mdr.ts`, `mdr.test.ts`, Migration, Pfad A, S, sofort möglich.
_Entscheidung:_ keine; ANN-019 fortschreiben.

**Trainingsprotokoll (BEF-113).** _Stand:_ `app.can_access_training_protocols()` = owner, trainer,
eine Funktion für Lesen und Schreiben (trn_009), RLS und alle RPCs hängen daran;
`canWriteTrainingProtocols` ebenso; `TrainingClientPage.tsx:190` blendet die Einheiten für office
aus. `training_protocols_guard` verbietet jede Änderung nach `final`, keine Nachtragstabelle.
`appointments_training_protocol_guard` löscht den Entwurf bei Absage oder Nichtantreffen mit Audit
`training_protocol.discarded`, **ohne** Löschjournal; die Absage-UI warnt nicht. _Beste Lösung:_ (1)
`app.can_read_training_protocols()` (owner, trainer, office) für Select-Policy, `get_`, `list_`;
`app.can_write_training_protocols()` (owner, trainer) für `save_`, `finalize_`;
`canReadTrainingProtocols` im Client; `training_protocol.viewed` bleibt; „scharf erst mit DSFA“ ist
mit synthetischen Daten kein Baugate (§15.2), im Register vermerken. (2)
`training_protocol_addenda(organization_id, protocol_id, reason, text, author, created_at)`, nur an
`final`, unveränderlich, RPC `add_training_protocol_addendum`, Audit
`training_protocol.addendum_created`, Anzeige unter dem Text wie am Behandlungseintrag. (3) Die
Terminzeile liefert `protocol_status` (Zustand, kein Inhalt); Rückfrage beim Absagen „Ein
Protokollentwurf geht dabei verloren.“; der Guard schreibt eine Journalzeile (Klasse
`trainingsverhaeltnis`, `due_at = now()`), damit `reapply_deletion_journal` den Entwurf nach einem
Restore erneut entfernt. _Umsetzung:_ Migration → Pfad A; `test:db` `training-protocols.test.ts`,
`rls.test.ts`, `retention-run.test.ts`, `abgewiesene-lesepfade.test.ts`; Vitest Trainingsseiten. M.
_Entscheidung:_ keine; Datenklasse des verworfenen Entwurfs als Annahme.

**Plattformkonten per SQL gelöscht (BEF-115).** _Stand:_ `app.delete_due_platform_accounts`
(por_002) löscht `auth.users` direkt im pg_cron-Lauf; die Bedingung ist bereits richtig
(`bool_and(ended_at is not null)` über alle Zugänge, dann `max(ended_at) + 30 Tage`); Journal
`auth_users`; `reapply_deletion_journal` löscht erneut per SQL; der Zugangsdienst hat schon
`kontoEntfernen` über die Admin-API (`platform-access/anmeldedienst.ts:229`); der Test „zwei Zugänge,
einer endet früher“ fehlt. _Beste Lösung:_ Warteschlange `platform_account_deletions(account_user_id
PK, organization_id, due_at, enqueued_at, run_id, attempts, last_error, completed_at)`; der Lauf trägt
ein statt zu löschen; der Zugangsdienst bekommt die Aufgabe `konten-loeschen` (service_role), liest
offene Zeilen per RPC, ruft `DELETE /auth/v1/admin/users/:id`, meldet zurück → Journalzeile;
`reapply_deletion_journal` reiht `auth_users`-Ids erneut ein. Auslöser: pg_net ist durch ANN-017
ausgeschlossen, daher externer Zeitgeber (OPS-001) plus Knopf „Jetzt abarbeiten“ für owner in der
Aufbewahrung. _Umsetzung:_ Migration und Edge Function → Pfad A; `test:db`
`platform-accesses.test.ts` (zwei Zugänge), `retention-run.test.ts`; Deno `handler.test.ts`,
`anmeldedienst.test.ts`. M–L. Mit BEF-118 und OPS-001. _Entscheidung:_ der Zeitgeber für die Function
ist Deployment, Stopp-Liste, mit Jannes in OPS-001; Warteschlange und Function sind baubar.

**Einwilligung zur Begleitung (BEF-116).** _Stand:_ `platform_accesses` trägt
`consent_text_version`, `consent_recorded_by/at`, `consent_earlier_messages` (por_005); der Wortlaut
`einwilligungBegleitung` in `src/lib/vertretung.ts:55–80` nennt den Umfang fest; die Rechte der
Begleitung stehen fest in `app.platform_access_allows` (por_006); kein Feld für den freigegebenen
Umfang, keins für das Nachweisverfahren. _Beste Lösung:_ `consent_scopes text[]` (etwa
`appointments`, `invoices`, `documents`, `messages`), für `companion` nicht leer;
`einwilligungBegleitung(scopes)` listet nur die gewählten Bereiche, neue Fassungskennung;
`platform_access_allows` prüft bei `companion` die Fähigkeit gegen den Scope. Nachweisverfahren
austauschbar an einer Stelle: `consent_method text check (in ('practice_device'))`, B2 kann
`signature` oder `text_form` ergänzen. _Umsetzung:_ Migration → Pfad A; `test:db`
`platform-representation.test.ts`, `platform-acting-for.test.ts`,
`platform-own-representatives.test.ts`; Vitest `vertretung.test`, `Vertretungen.tsx`. S–M. **Mit
BEF-119 bündeln** (gleiche Funktionen). _Entscheidung:_ keine; Bereichsliste als Annahme,
Nachweismethode an B2.

**Volljährigkeit am 29. Februar (BEF-117).** _Stand:_ drei Rechnungen: `app.platform_is_minor` =
`dob > heute(tz) − 18 Jahre` (por_005:162–170, korrekt); `app.platform_access_ended_at` =
`dob + make_interval(years => 18)` (por_005:197–199): Postgres klemmt 2008-02-29 + 18 Jahre auf
**2026-02-28**, ein Tag zu früh; `invite_platform_access` rechnet zusätzlich in **UTC** statt
Praxiszeitzone (por_002:713–714). _Beste Lösung:_ eine Funktion `app.platform_adult_on(p_dob date)
returns date`: `v := p_dob + make_interval(years => app.platform_min_age_years()); return case when
extract(day from v) <> extract(day from p_dob) then v + 1 else v end`. **Die Skizze im Befund („minus
ein Tag plus 18 Jahre plus ein Tag“) ist falsch** für am 1. März Geborene mit Schaltjahr im Zieljahr
(2010-03-01 → 2028-02-29); die Klemm-Korrektur deckt alle Fälle: 29.02.2008 → 01.03.2026,
28.02.2008 → 28.02.2026, 01.03.2008 → 01.03.2026, 01.03.2010 → 01.03.2028. Dann `platform_is_minor
:= heute(tz) < platform_adult_on(dob)`, `ended_at := platform_adult_on(dob)::timestamp at time zone
tz`, Einladung über `platform_is_minor` mit `o.time_zone`. _Umsetzung:_ eine Migration → Pfad A;
`test:db` `platform-representation.test.ts` (Sorgerecht-Ende) und `platform-accesses.test.ts`
(Einladung) mit den vier Datumsfällen. S. _Entscheidung:_ keine; Formelkorrektur im Bericht nennen,
ANN-208 fortschreiben.

**Wiederherstellung ohne bestätigtes Postfach (BEF-118).** _Stand:_ `kontoAnlegen` setzt
`email_confirm: true` (`anmeldedienst.ts:171–176`), Marke nur `app_metadata.platform_account`;
„Kennwort vergessen“ → `resetPasswordForEmail` ohne Unterscheidung Praxis und Plattform; GoTrue
schickt an jede bestätigte Adresse (Übernahmeweg aus ANN-191); vor Ort gibt es „Neues Kennwort (vor
Ort)“; kein Merkmal „per Link bestätigt“, keine Prüfung bei Adressänderung; Mailweg `mock`. _Beste
Lösung:_ Merkmal `app_metadata.email_verified_by_link` (beim Anlegen `false`); Durchsetzung im
Anmeldedienst über den **Send-Email-Auth-Hook** (zugleich der Mail-Adapter aus ADR-023 Punkt 10):
Aktion `recovery` für `platform_account = true` ohne Merkmal → nicht versenden, Protokoll
`platform_access.recovery_refused`; eine Bestätigung über Link setzt das Merkmal, eine Adressänderung
setzt es zurück (Secure Email Change). Zweite Linie: `app.platform_recovery_allowed(user_id)` in
SQL, vom Hook per RPC gefragt und per `test:db` belegt. Hook als weitere Aufgabe in
`supabase/functions/platform-access` (shared secret). Ohne Merkmal bleibt der Weg vor Ort.
_Umsetzung:_ Edge Function und Migration → Pfad A; Deno `handler.test.ts`, `anmeldedienst.test.ts`;
`test:db` `platform-accesses.test.ts`. M. Mit BEF-115 und OPS-001. _Entscheidung:_ Aktivierung des
Hooks ist Konfiguration des Anmeldedienstes (G3/OPS-001, Stopp-Liste); bauen mit `mock` jetzt.

**Vertretung nach Aufgabenkreis (BEF-119).** _Stand:_ nur `guardianship_health_scope boolean`, bei
`guardianship` Pflicht `true` (por_005); `app.platform_access_allows` kennt `read, request, message,
consent, export, manage_companions`, keine Abrechnungsfähigkeit; Rechnungen und Zahlungen auf der
Plattform sind nicht gebaut (POR-EPIC-002 ff.); die rechtliche Vertretung erhält pauschal alles.
_Beste Lösung:_ statt eines zweiten Booleans `representation_scopes text[] ⊆ {health, finance}` für
`guardianship` **und** `power_of_attorney` (eine Vorsorgevollmacht umfasst ebenfalls getrennte
Bereiche); `custody` = beide implizit; `self` = alle. Fähigkeiten erweitern: `read_invoices`, `pay`
erfordern `finance`; `read`, `request`, `message`, `consent` erfordern `health`; `companion` nach
`consent_scopes` (BEF-116). Constraint: mindestens ein Bereich; Art und Nachweis bleiben
unveränderlich (ANN-205). Test-Matrix Art × Grundlage × Bereich × Fähigkeit; UI zwei Häkchen in
`Vertretungen.tsx`. _Umsetzung:_ Migration → Pfad A; `test:db` `platform-representation.test.ts`,
`platform-acting-for.test.ts`, `platform-context.test.ts`; Vitest. M. Mit BEF-116 in einen Loop, vor
POR-EPIC-002. _Entscheidung:_ keine zwingende. Hinweis: Rechnungen enthalten Leistungen und damit
Gesundheitsangaben (ADR-009); ob eine reine Vermögensbetreuung Rechnungsinhalte sehen darf, gehört zu
B5; bis dahin Annahme „ja, weil für die Vermögenssorge nötig“, an einer Stelle umkehrbar.

### Werkzeugkette, Begriffe, Schrift, Kleines

**Vier fertige Loops fehlen im Fortschrittsmodell (BEF-017).** _Stand:_ Trifft weiter zu. In
`fortschritt.json` Block A (25 Posten) fehlen CAL-EPIC-004b, CAL-EPIC-004c, UX-013 und GRD-001; die
Prosa „Gebaut“ in der Roadmap nennt alle vier; die Formel in `scripts/fortschritt.mjs:73–82`
ignoriert sie, Block A ist zu niedrig. _Beste Lösung:_ vier Posten hinter `cal-epic-004a`, Gewicht
1 wie die Nachbarn, Status „gesichtet“ (Kernprozess-Sichtung 2026-09-28), `fertig_am` 2026-09-18,
Nachweis aus der Chronik; danach `pnpm fortschritt --schreiben` und `pnpm docs:check`. _Umsetzung:_
Docs-Session, S. _Entscheidung:_ einzeln oder gebündelt, welches Gewicht; Empfehlung einzeln,
Gewicht 1.

**Terminkontext in zwei Schemata (BEF-024).** _Stand:_ Trifft zu. `src/features/staff/api.ts:227`
`kind: z.enum(['therapy', 'internal', 'training'])`; `appointmentKindSchema`
(`appointments/api.ts:178`) wird dort nicht importiert. _Beste Lösung:_ `kind: appointmentKindSchema`
(kein Zirkelimport, vorher kurz prüfen) plus Unit-Test, der `FutureAppointment['kind']` gegen
`appointmentKindSchema.options` hält. _Umsetzung:_ Mitnahme im nächsten Loop, der `features/staff`
anfasst: **G21 STAFF-005**. S. _Entscheidung:_ keine.

**B13 und der eingebaute Mailversand (BEF-026).** _Stand:_ entschieden und verankert:
`OPEN_DECISIONS.md` B13 „wieder offen, Empfehlung eigener SMTP-Anbieter, Prüfung nach ADR-002 in
Block 11, gebaut hinter Adapter mit `mock`-Weg, STAFF-004 ruht“; Providerprüfung Teil 3 hält die drei
Auszüge fest, der Empfängerkreis ist **nicht** von einem ungeproxten Rechner verifiziert; Roadmap
R8, G21 STAFF-005 (Einladung per QR oder Mail, löst ANN-025 ab). Die Edge Function **existiert**:
`supabase/functions/platform-access/versand.ts`, Adapter mit genau einem Weg `mock` (Mailpit),
alles andere „nicht eingerichtet, nie stillschweigend mock“; ADR-023 Punkte 9 und 10 beschreiben
Zugangsdienst und Adapter. _Beste Lösung:_ Befund auf „entschieden, Verankerung steht“; offen bleiben
(1) Empfängerkreis in Teil 9 der Providerprüfung verifizieren, (2) Anbieterprüfung nach ADR-002 in
Block 11, dann zweiter Adapter in `versand.ts` plus ADR, der den B13-Teil ablöst. _Umsetzung:_ jetzt
nur Docs (S). Der Anbieter-Loop ist Pfad A (neuer Anbieter = Stopp-Kriterium). _Entscheidung:_
Anbieterwahl mit EU-Standort erst in Block 11.

**Begriffe (BEF-067).** _Stand (grep über `src/`):_ (1) Serie weiter gemischt („Terminserie
anlegen“ `PatientTreatmentBasesPage.tsx:336`, `DauerterminStartPage.tsx:197`,
`CalendarPage.tsx:833`, `appointments/api.ts:1828`), offen. (2) Länge: „Dauer“ als Feld, „Andere
Länge …“, „Länge in Minuten“, „Länge weicht ab“, offen. (3) Fehlzeit-Beispiele über
`BEGRIFFE.fehlzeitBeispiele`, erledigt bis auf die ANN-111-Frage. (4) „Tag umplanen“ bestätigt,
erledigt. (5) „Steht aus“ in der Tageskarte, `appointments/api.ts:62` weiter „Bestätigt“ in
Teilnehmerlisten, teilweise. (6) Titel „Neue:r …“ unverändert, offen. (7) „Anmeldemail senden“,
Betreff „Zugang zur Praxisanwendung“ (`config.toml:104`), „Anmeldemaske“ in `KennwortNeuPage.tsx:200`,
offen. (8) Filter „Aktiv/Inaktiv“ (`PatientsListPage.tsx`), „Als inaktiv markieren“; das Etikett im
Kopf und die „Praxis:“-Zeile sind weg, teilweise. (9) `truncate` „Vorname Nachname“ bleibt, offen.
_Beste Lösung:_ Spalte „Vorschlag“ des Befunds; je Zeile ein Eintrag in `ABGELOESTE_BEGRIFFE`
(`begriffe.ts:130 ff.`, ggf. `nurIn`), so hält `begriffe.test.ts` die Stellen fern; Betreff in
`config.toml` mitziehen. _Umsetzung:_ Pfad S, ein UI-Loop, M (rund 15 Dateien, Wortlaut-Tests
ziehen mit, ANN-111 fortschreiben). _Entscheidung:_ **ja**, das Wort je Zeile 1, 2, 5, 6, 7, 8, 9.

**Schrift (BEF-068).** _Stand:_ `Badge` erledigt. Unter 12 px ohne Token: Tableiste
`AppShell.tsx:70` 11 px („bleibt bei 11 px, ANN-111“), Stundenachse `CalendarGrid.tsx:627` 11 px,
halbe Stunde Z. 641 10 px (Abschwächung weg), SubNav-Vorschauzeichen 11 px, `Funktionssuche.tsx:308`
„Strg K“ 11 px, `Zeitstrahl.tsx:69` 10 px (nur ✓/× im Punkt), Statistik-Achsen `grafiken.tsx:124,
199` 11 px (neu seit STA-EPIC-001), `Messreihenbild.tsx:37` `SCHRIFT = 13` in Bildeinheiten; kein
Token in `index.css`. 12 px: 96 `text-xs`-Stellen (79 mit `text-ink-muted`), `Vollseite.tsx:23`
hält Kleingedrucktes als Prop („14 oder 12 entscheidet Jannes, TOK-04“), Zwei-Faktor-Geheimnis
`MeinKontoPage.tsx:294` 12 px; die drei 12-px-Fehlertexte sind erledigt. _Beste Lösung:_ Option 2:
Tokens `--text-etikett` (11 px für Tableiste, kbd, Vorschauzeichen, Achsen) und
`--text-kleingedruckt` (14 px) in `index.css`; Baustein `Kleingedrucktes` aus `Vollseite` nach
`components/ui`; Kalenderzeilen auf 12 px nur zusammen mit KAL-23; ein Test, der freie
`text-[…]`-Werte unter 12 px verbietet (analog `begriffe.test.ts`). Sofort ohne Entscheidung: das
Geheimnis in 14 px Festbreite. _Umsetzung:_ Pfad S, M (Token und Baustein S, 96 Stellen M, Sichtung
375/820/1440). _Entscheidung:_ **ja**, Kleingedrucktes 14 oder 12 px (TOK-04), und ob „kein Text
unter 12 px“ mit Ausnahme Tableiste, Tastenhinweis, Achsen als Regel gilt.

**Sechzehn STABLE-Lesepfade (BEF-082).** _Stand:_ Trifft unverändert zu. Alle 16 Funktionen sind in
ihrer letzten Definition `stable`, kein `alter function … volatile` existiert; die Katalogregel steht
in `supabase/tests/audit.test.ts:305–336` und erwartet exakt die 16 Namen („die Liste darf nur
schrumpfen“). Die TRN-EPIC-001-Fassung legt die Funktionen direkt `volatile` an (`trn_005:282`,
`trn_006`, `trn_009`); das ältere Muster `20260923120000_abgewiesene_lesezugriffe_rest.sql:25`
beschreibt dasselbe für G6b. _Beste Lösung:_ eine Migration mit 16 × `alter function
public.<name>(<signatur>) volatile;` (kein Neuschreiben, Grants bleiben), Kopfkommentar mit ADR-010
und BEF-082; Signaturen aus `pg_get_function_identity_arguments`; die Liste im Test leeren.
_Umsetzung:_ Pfad A, S, ein Commit; `pnpm db:start && export TEST_DATABASE_URL=… && pnpm test:db` in
einem Aufruf; die PostgREST-Gegenprobe (200, leer, `denied`-Eintrag) nur lokal mit `supabase start`
als Schritt für Jannes im Bericht. Bündelbar mit dem nächsten migrierenden Loop. _Entscheidung:_
keine; Korrektur eines bestehenden Gates, keine Aufweichung.

## Offene Entscheidungen von Jannes, gesammelt

Nur das, was nach §15.1 **nicht** als Annahme getragen werden kann oder was Jannes ausdrücklich
vorbehalten hat. Alles andere oben ist als Annahme mit Anker baubar.

1. **ADR-Texte** (nur Jannes ändert ADRs): neue Fassung von ADR-017 (Anzeige statt Download,
   Dokumentationsfotos; BEF-059, BEF-106), neue Fassung von ADR-018 Punkt 8 (Verlegung und
   Verzicht; BEF-094, entsteht im Loop), neue Fassung von ADR-019 (Kacheln im Gate; BEF-109).
2. **Wortwahl:** BEF-067 das Wort je Zeile; BEF-068 Kleingedrucktes 14 oder 12 px; BEF-065 der
   genaue Wortlaut der MDR-Sperrseite, weil der E2E-Test eine Sperrprüfung ist.
3. **Abrechnung:** BEF-099 Doppelbehandlung ein oder zwei Honorare, Vereinbarungen nur durch owner;
   BEF-100 Verrechnung nur auf die Korrektur oder jede Rechnung derselben Person; BEF-114 Preis,
   Umfang, Zahlungsweise der Pakete; BEF-061 Suche vorziehen oder nicht.
4. **Kleine Bestätigungen:** BEF-046 Option 2; BEF-049 Raster, Frist, Startort einklappen; BEF-063
   Rückfrage beim Ausstellen; BEF-056 Autosave; BEF-097 vergangene Termine in der Übertragung;
   BEF-111 Anschriftssperre auch für Behandlungsrechnungen; BEF-017 Gewicht der vier Posten.
5. **Mit OPS-001 (Stopp-Liste, Deployment):** Zeitgeber für den Zugangsdienst (BEF-115), Aktivierung
   des Auth-Hooks (BEF-118), Scharfschalten der Datei-Verifikation (BEF-105), Anbieterwahl Mail
   (BEF-026, Block 11).
