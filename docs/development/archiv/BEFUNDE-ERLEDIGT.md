

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
