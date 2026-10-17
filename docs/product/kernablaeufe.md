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
Zahl, sobald es ihn gibt. „C1“: nachgezogen am 2026-10-13 nach dem Auftrag „Besuch in einem Zug“; „R2“: am 2026-10-14 nach den Restbefunden der Praxis-Prüfung; „E3“: am 2026-10-15 nach „Erstaufnahme geführt“; „M4“: am 2026-10-15 nach „Monatsabrechnung in einem Lauf“.

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
| K12 | Heimprogramm aus Vorlage zuweisen und mitgeben | Therapie, wöchentlich | ≤ 5 Tipps | 5 aus mitgelieferter oder eigener Vorlage: Neuer Plan, Vorlage, hinzufügen, Zuweisen, Zuweisen (gemessen, `plaene.spec.ts`); Plan als Vorlage speichern 2 bis 3 – vorher 6 + 5 je Übung | Physitrack |
| K13 | Monatsabrechnung: alle Rechnungen eines Monats ausstellen | Büro, monatlich | ≤ 3 Tipps für den Lauf | 3 für alle fertigen Rechnungen: Lauf starten, ausstellen, Ja; danach „Alle drucken“ (gemessen, `abrechnungslauf.spec.ts`; vorher ≈ 15 je Rechnung) – M4 | appointmed |
| K14 | Offene Posten sehen, Zahlung buchen | Büro, wöchentlich | 0 Tipps bis zur Liste, ≤ 3 je Zahlung | 0; gesammelt 2 + 1 je Posten: „Mehrere buchen“, Haken, buchen (gemessen, `abrechnungslauf.spec.ts`); einzeln 2 an der Zeile (gezählt); vorher 3 je Zahlung – M4 | Scorecard |
| K15 | Tagesabschluss: was ist heute noch offen | Therapie, täglich | 0 Tipps, ein Abschnitt | 0: „Heute noch offen“ (Doku, Haken) vor „Morgen“ – C1, B4 | T9; Scorecard |

**Regeln.**

1. Ein Auftrag `/bereich` nennt in seiner Spec die betroffenen Kernabläufe und übernimmt oder
   begründet ihr Budget; die PR nennt „vorher → nachher“.
2. Sicherheit und Recht gehen vor dem Budget: Protokolle (ADR-018), Rückfragen vor Zerstörendem,
   Einwilligungen und die MDR-Grenze (ADR-006) werden nie für einen Tipp gestrichen.
3. Ein neuer Kernablauf kommt nur mit Jannes' Auftrag dazu; die Liste bleibt bei höchstens 15.

## Geführte Abläufe und Anträge (G1–G10)

Auftrag Jannes 2026-10-16, ausgeführt in den Bereichsüberholungen 6 bis 10; Abläufe in
[`gefuehrte-ablaeufe-und-antraege.md`](gefuehrte-ablaeufe-und-antraege.md). Seltene Abläufe, deshalb
eine eigene Liste neben den höchstens 15 Kernabläufen (Regel 3). Gezählt wie oben; **Maßstab neben
den Tipps: kein Scrollen bei 375 px** auf keiner Seite des Ablaufs. „Heute“ für G1 bis G6 nach Überholung 6.

| # | Ablauf (Auslöser → fertig) | Rolle, Häufigkeit | Budget | Heute |
| --- | --- | --- | --- | --- |
| G1 | Niemand öffnet → Ausfallhonorar vermerkt (= K8) | Therapie, wöchentlich | ≤ 5 Tipps | 4, geführt: geklingelt → angerufen → gewartet (Uhr) |
| G2 | Tag umplanen: Grund → Termine absagen → alle angerufen | Büro, selten | ≤ 4 + 2 je Person | ab Kalender 5 bis abgesagt (mit „Ansicht und Filter“, +1 je Abwahl), 1 je Person, geführt |
| G3 | Panne am Rad → Abschlussart | Therapie, selten | Schrittzahl wie heute | wie vorher (7 + Text, 11 + Text), im Fenster mit 3D-Rad |
| G4 | Schlüssel übergeben | Therapie, Büro, wöchentlich | ≤ 3 Tipps | 3, auch von Hand zu Hand in einem Vorgang (mit Rad 2) |
| G5 | Neue:n Mitarbeiter:in einrichten bis Einladung | Büro, selten | ≤ 8 Tipps + Felder, ein Ablauf | owner 8 + 3 Felder, office 4, ein Ablauf |
| G6 | Plattform: Termin ändern oder absagen | Patient:in, selten | ≤ 6 Tipps + Text | Absagen 4, Ändern 6 + Text, im Fenster in 18 px |
| G7 | Urlaub beantragen | Alle, selten | ≤ 6 Tipps | 5: Einstieg, Monat, erster Tag, letzter Tag (oder Dauer), Absenden; über das Monatsende 6; Entscheiden 2 (Ablehnen 3 + Grund) |
| G8 | Arbeitszeitänderung beantragen (einmalig oder dauerhaft) | Alle, selten | ≤ 8 Tipps + Zeiten | einmalig 5 + Zeiten (+1 je Monat voraus), dauerhaft 7 + Zeiten ab einem Monatsersten (+2 je weiterer Tag); Entscheiden 2 (Ablehnen 3 + Grund) |
| G9 | Zeitkonto: Mehrarbeit oder Freizeitausgleich eintragen | Alle, monatlich | ≤ 6 Tipps | Mehrarbeit 5: Einstieg, Art, Heute, Schnellwahl ab Dienstende, Eintragen; Freizeitausgleich 5 (+1 je Monat voraus); Zurückweisen 3 + Grund |
| G10 | Erstattung beantragen (Strom oder Einkauf mit Beleg) | Alle, monatlich | ≤ 7 Tipps + Betrag | Vorschau: Formular, ≈ 8 Felder |
