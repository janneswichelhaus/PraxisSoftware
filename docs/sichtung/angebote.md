# Sichtung — Block 5: Angebote

Stand 2026-10-07 · entsteht mit dem ersten Oberflächen-Loop des Blocks (ANG-EPIC-001).

**Deckt ab:** ANG-EPIC-001 (Schritte 1 bis 3).
**Wo:** lokal mit `pnpm dlx supabase@2.116.0 start`, am Handy im WLAN ([`../DEVELOPMENT.md`](../DEVELOPMENT.md)), oder auf der Test-Umgebung nach dem Merge. Konten: `DEVELOPMENT.md`, „Testkonten“; dazu das Plattformkonto `erika.plattform@patient.invalid`. Der Preis des Abo-Monats (39,00 €) ist synthetisch.
**Dauer:** rund 30 Minuten.

| #   | Rolle                  | Tun                                                                                                                                                                                                                                                                                                                                             | Erwarten                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Loops        |
| --- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| 1   | owner, dann office     | Als Jannes: Erikas Akte → **Stammdaten → Verwaltung**, unter **Nachsorge-Abo** den Satz lesen; dann **Versorgung abschließen** mit dem Tag vor zehn Tagen. Als Olivia dieselbe Akte: **Abo anlegen**, Beginn auf den Tag des Abschlusses setzen, speichern. Danach **Abrechnung → Leistungskatalog**, die Preisliste 2026 ansehen.              | Vor dem Abschluss steht „Ein Abo beginnt nach der Behandlung – erst die Versorgung abschließen“ und kein Knopf (ANN-268). Danach „Läuft seit …“, „Nächster Abo-Monat ab …, 39,00 €“, **Kündigung eintragen** und **Irrtümlich angelegt**. Ein Beginn vor dem Abschluss wird im Formular abgewiesen. In der Preisliste die Position „Nachsorge-Abo (Monat)“ mit „Umsatzsteuerpflichtig“ (ANN-269); als Anna sieht man den Abschnitt in der Akte nicht.                                                                                                                    | ANG-EPIC-001 |
| 2   | office                 | **Abrechnung → Leistungen**: unter **Nachsorge-Abo** den Monat **Abo-Monat erfassen**. Dann **Abrechnung → Rechnungen**: Erikas Monat **Entwurf anlegen**, **Ausstellen**, **Rechnung drucken**, am Handy ansehen. Zum Vergleich in der Akte **Abschluss zurücknehmen** und die Leistungen neu laden; danach die Versorgung wieder abschließen. | Der Abo-Monat steht mit Zeitraum („… bis …“) und 39,00 € da; nach dem Erfassen unter „Erfasst“ ohne Termin, mit **Erfassung zurücknehmen**. Die Rechnung bündelt nach dem Monat, nicht nach einer Verordnung; auf dem Blatt „Zeitraum: … bis …“ statt Behandlungstagen und „darin enthaltene Umsatzsteuer 6,23 € (19 %)“. Läuft die Behandlung wieder, steht beim nächsten Monat „Die Behandlung läuft wieder – kein Abo-Monat, solange sie dauert“ statt des Knopfs (ANN-271).                                                                                          | ANG-EPIC-001 |
| 3   | Patientin, dann office | Am Handy als `erika.plattform@patient.invalid`, Bereich **Behandlung**: **Ich → Nachsorge-Abo → Abo ansehen oder kündigen**, **Abo kündigen**, die Seite lesen, **Abbrechen**; noch einmal **Abo kündigen → Jetzt kündigen**, **Bestätigung drucken** antippen, dann die Übersicht. Am Rechner als Olivia **Offene Punkte** und Erikas Akte.    | Vor dem Kündigen steht „Läuft seit …“ und „Nächste Monatsrechnung ab …: 39,00 €“. Die Seite „Kündigung bestätigen“ nennt das Enddatum (Ende des laufenden Abo-Monats, ANN-270); erst **Jetzt kündigen** kündigt. Danach „Kündigung eingegangen“ mit Datum und Uhrzeit, unter „Ich“ „Gekündigt, endet am …“; auf der Übersicht „Ihr Nachsorge-Abo endet am …. Sie können hier noch bis … lesen.“ (ANN-274). In Offene Punkte „Nachsorge-Abo gekündigt (1)“ mit „von der Person selbst“, in der Akte „Gekündigt am …, über die Plattform von der Person selbst“ (ANN-272). | ANG-EPIC-001 |

## Nicht in dieser Sichtung

- **Regeln und Rechte ohne Oberfläche**: Beginn nicht vor dem Abschluss, ein laufendes Abo je
  Person, nur owner und office, andere Praxis, Zusammenführen, Auskunft und Löschlauf
  (`aftercare-subscriptions.test.ts`, `retention-run.test.ts`); jeder Monat höchstens einmal, nicht
  vor dem Beginn, nicht nach dem Ende, nicht ohne Preis, nie an einem Termin, Steuer auf der Rechnung
  (`aftercare-months.test.ts`); Kündigung zum Ende des Abo-Monats, vor dem Beginn, nicht zweimal,
  rechtliche Vertretung mit und ohne Vermögenssorge, Begleitung nie, fremde Person, anderer Bereich,
  gesperrt, Praxiskonto, andere Organisation (`aftercare-cancellation.test.ts`); Lesezeit nach dem
  Abo, Training getrennt (`aftercare-platform-access.test.ts`); jede neue Funktion in
  `plattform-abschottung.test.ts`; 18 px, Ziele, axe und 200 % auf den Abo-Ansichten
  (`tests/e2e/plattform-barrierefreiheit.spec.ts`, `tests/e2e/nachsorge.spec.ts`).
- **Plan als PDF, Verlauf, Gewohnheiten und Rückfragen** der Stufe 2 kommen mit ihren Loops (UEB-,
  TRK-, ALT-, KOM-EPIC).

## Ergebnis

Gesichtet am: — · Gerät: — · Befunde: —
