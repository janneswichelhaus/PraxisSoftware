# Kernabläufe mit Tipp-Budgets

Stand 2026-10-12. Rang 6 wie alles unter `docs/product/`: **Maßstab, kein Scope.** Verbindlich
wird ein Budget erst, wenn die Arbeitsablauf-Spec eines Auftrags (`/bereich`, Rang 3) es übernimmt.
Herkunft: Jannes' Behandlungstag vom 2026-09-23 (Schritte T1–T9 in
[`../development/archiv/UMBAU.md`](../development/archiv/UMBAU.md)), die Zielwerte der früheren
Ablaufrunden ([`../development/archiv/OPTIMIERUNG.md`](../development/archiv/OPTIMIERUNG.md),
Scorecard) und der Referenzabgleich vom 2026-10-12 (Jane, Cliniko, Physitrack, appointmed, iPrax).

**Zählweise.** Bei 375 px auf synthetischen Seed-Daten. Ein **Tipp** ist eine Berührung (Knopf,
Link, Auswahl, Kästchen); getippter Text steht als „+ Text“. Ein **Wechsel** ist eine neue Route
oder App. Gemessen wird die Software per Playwright, kein Mensch (§20 bleibt unberührt). „Heute“
ist am 2026-10-12 aus Code und Prüfseiten **gezählt**, nicht gemessen; ein Ablauftest ersetzt die
Zahl, sobald es ihn gibt. „C1“: nachgezogen am 2026-10-13 nach dem Auftrag „Besuch in einem Zug“; „R2“: am 2026-10-14 nach den Restbefunden der Praxis-Prüfung; „E3“: am 2026-10-15 nach „Erstaufnahme geführt“.

| # | Ablauf (Auslöser → fertig) | Rolle, Häufigkeit | Budget | Heute | Herkunft, Vorbild |
| --- | --- | --- | --- | --- | --- |
| K1 | Tagesstart am Rad: erster Weg, Abfahrt, Liege heute | Therapie, täglich, Rad | 0 Tipps nach Entsperren | 0 | T1, T2, T4 |
| K2 | Navigation zum nächsten Besuch | Therapie, täglich, Rad | 1 Tipp, 1 Wechsel (Karte) | 1 | T3 |
| K3 | Vor der Tür: Zugang, Material, letzte Doku lesen | Therapie, täglich, Rad | ≤ 1 Tipp | 1: „Vor der Tür“ an der Karte mit Zugang, Material, letztem Eintrag (gemessen, `besuch.spec.ts`; vorher 1 und 3) – R2 | T5 |
| K4 | Patient:in anrufen, auch einen späteren Besuch | Therapie, täglich, Rad | ≤ 2 Tipps | 1 (Anrufknopf an Karte und Zeile; Zeile ohne Haken), sonst 2 – C1 | Scorecard „anrufen“ |
| K5 | Besuch nachbereiten: dokumentieren, Folgetermin, abhaken (seit B4/B7 kein Heilmittelbestätigen; Festschreiben hakt nicht ab) | Therapie, täglich | ≤ 6 Tipps + Text, 2 Wechsel | 4 + Text, 1 Wechsel; bis zur Navigation zum nächsten Besuch 6 Tipps, 2 Wechsel (Doku, Festschreiben, Folgetermin, Fertig, Abhaken an der Zeile, Navigation; gemessen, `tests/e2e/besuch.spec.ts`; vorher ≈ 12 + Text, 8 Wechsel) | T6; Jane ≈ 4 |
| K6 | Verlaufseintrag: letzten Eintrag als Entwurf übernehmen | Therapie, täglich | ≤ 3 Tipps + Text | 3 + Text: Doku, „Wie zuletzt“, Festschreiben (gemessen, `besuch.spec.ts`; vorher fehlt) – R2 | Jane, Cliniko |
| K7 | Folgetermin für die gerade behandelte Person | Therapie, täglich | ≤ 3 Tipps, keine Tastatur | 1 nach dem Festschreiben (Vorschlag „gleiche Zeit“) – C1 | Scorecard; Jane |
| K8 | Niemand öffnet bis zum Anlass fürs Ausfallhonorar (Protokoll nach ADR-018 bleibt) | Therapie, wöchentlich | ≤ 5 Tipps | 5 an der Karte (die Uhr zeigt die 15 Minuten, alle drei Haken von Hand) – C1 | Jane No-show |
| K9 | Absage am Telefon annehmen (Grund, Eingang) | Büro, wöchentlich | ≤ 4 Tipps | 4 im Kalender: Kachel, Absagen, Grund, Ja (gemessen, `kernablaeufe.spec.ts`; vorher 7) – R2 | iPrax, Jane |
| K10 | Erstaufnahme vor Ort, geführt: Verordnungsfoto, Bogen, Einwilligungen, Befund, Liege | Therapie, wöchentlich | ≤ 15 Tipps + Felder, nichts vergessen | 10 vom Terminpanel bis zur Doku, 2 Wechsel (Verordnung, Anmeldebogen, eine Einwilligung, Liege; gemessen, `kernablaeufe.spec.ts`); am Gerät je Foto 2 Tipps mehr im Kameradialog: 14; Anamnesebogen vor Ort statt vorab: 16 + Felder; vorher ≥ 25, ≥ 10 Wechsel – E3 | T7, T8 |
| K11 | Neuaufnahme am Telefon (Stammdaten, Anschrift für Hausbesuch) | Büro, wöchentlich | ≤ 8 Tipps + Felder, ≤ 90 s | 3 + Felder über „Weiter“ (gemessen, `kernablaeufe.spec.ts`; vorher ≈ 12 + 9 Felder) – E3 | Scorecard |
| K12 | Heimprogramm aus Vorlage zuweisen und mitgeben | Therapie, wöchentlich | ≤ 5 Tipps | 6 + 5 je Übung | Physitrack |
| K13 | Monatsabrechnung: alle Rechnungen eines Monats ausstellen | Büro, monatlich | ≤ 3 Tipps für den Lauf | ≈ 15 je Rechnung | appointmed |
| K14 | Offene Posten sehen, Zahlung buchen | Büro, wöchentlich | 0 Tipps bis zur Liste, ≤ 3 je Zahlung | 0 und 3 (erreicht) | Scorecard |
| K15 | Tagesabschluss: was ist heute noch offen | Therapie, täglich | 0 Tipps, ein Abschnitt | 0: „Heute noch offen“ (Doku, Haken) vor „Morgen“ – C1, B4 | T9; Scorecard |

**Regeln.**

1. Ein Auftrag `/bereich` nennt in seiner Spec die betroffenen Kernabläufe und übernimmt oder
   begründet ihr Budget; die PR nennt „vorher → nachher“.
2. Sicherheit und Recht gehen vor dem Budget: Protokolle (ADR-018), Rückfragen vor Zerstörendem,
   Einwilligungen und die MDR-Grenze (ADR-006) werden nie für einen Tipp gestrichen.
3. Ein neuer Kernablauf kommt nur mit Jannes' Auftrag dazu; die Liste bleibt bei höchstens 15.
