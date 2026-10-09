

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
