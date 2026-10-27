# ADR-009: Privatabrechnung
## Status
Angenommen 2026-08-28 (Jannes, B4), geltend Fassung 6 (2026-10-14); Protokoll nur nach ADR-010.

## Kontext
Zu entscheiden waren Abrechnungsweg, abweichende Empfänger und GoBD-Unveränderbarkeit neben der
klinischen Versionierung (§5); seit E18 zwei Leistungsbereiche (ADR-021, ADR-022) in einem
regelbesteuerten Betrieb mit getrennter Gewinnermittlung (Abfärbung, § 15 Abs. 3 Nr. 1 EStG). Nicht
Gegenstand: Gebührenkatalog, Steuerbewertung einzelner Leistungsarten (G13), E-Rechnung, Mahnwesen
und Ausfallhonorar, Zahlungsanbieter, Bank, GoBD-Verfahrensdokumentation; Leistungsziffern sind
organisatorisch (C1).

## Entscheidung
1. **Abrechnung in der Plattform, ohne Factoring in V1** (§19).
2. **Patient und Rechnungsempfänger sind getrennte Entitäten** (§19).
3. **Abrechenbare Leistungen existieren unabhängig von Rechnungen** (§19, Punkt 21).
4. **Keine Leistung wird unbeabsichtigt mehrfach abgerechnet** (§19); das Datenmodell erzwingt es.
5. **Leistungskatalog und Preisvereinbarungen sind versioniert** (§19). *(Fassung 4)* Maßgeblich ist
   die am Leistungstag geltende Honorarvereinbarung mit der Person, nur ohne sie der allgemeine
   Tarif; eine neue Preisliste ändert keine bestehende Vereinbarung von selbst.
6. **Steuerliche Eigenschaften je Leistung bzw. Version, nie durch KI** (§19).
7. **Rechnungen haben mindestens die Zustände** Entwurf, ausgestellt, versendet, teilweise bezahlt,
   bezahlt, überfällig und korrigiert/storniert.
8. **Rechnungsnummer erst bei Ausstellung, eindeutig, nie wiederverwendet** (§19).
9. **Ausgestellte Rechnungen sind unveränderbar,** korrigiert per eigenem Dokument (§19).
10. **Beim Ausstellen entsteht ein historischer Snapshot** (§19).
11. **Das Dokument wird in seiner damaligen Form aufbewahrt** (§19, Frist: ADR-008 Punkt 5).
12. **Zahlungen sind eigene Transaktionen** (§19).
13. **Therapeutische Leistungen sollen erst nach finalisierter Doku fakturierbar sein,** ein
    Override nur begründet und protokolliert, in V1 keiner (§19).
14. **PDF-Rechnungen aus dem Snapshot, ohne strukturierte E-Rechnungen zu verbauen** (§19).
15. *(Fassung 2)* **Das Steuerkennzeichen hängt am Posten, nie am Kunden:** allein an der Leistung
    bzw. Katalogversion, nicht am Rechtsverhältnis (ADR-021), Terminkontext (ADR-022), Empfänger
    (Punkt 2) oder an der Person. Kennzeichen: steuerfreie Heilbehandlung (§ 4 Nr. 14 lit. a UStG);
    steuerpflichtig zum Regelsatz ohne Heilbehandlungszweck; steuerpflichtig ermäßigt für
    verordnungsfähige Leistungen ohne Verordnung, nur angelegt und bis zur Freigabe der
    Steuerberatung inaktiv (B4); nicht steuerbar (kein Leistungsaustausch, Ausfallhonorar). Die
    Kennzeichen sind Werte von `tax_treatment` und `tax_rate_permille` an der Katalogposition, kein
    eigenes Feld.
16. *(Fassung 2)* **Eine Rechnung trägt genau einen Leistungsbereich,** aus den Posten, nicht dem
    Empfänger; das Datenmodell erzwingt es. Die Leistung hat ihn von der Katalogposition; ein
    Widerspruch zum Terminkontext (ADR-022) wird als Erfassungsfehler abgewiesen.
17. *(Fassung 2)* **Je Leistungsbereich ein eigener Nummernkreis** je Organisation und Kalenderjahr;
    Punkt 8 gilt je Kreis, auch bei gleichzeitigen Zugriffen. Jede Nummer ist organisationsweit
    einmalig (§ 14 Abs. 4 Nr. 4 UStG), jeder Kreis lückenlos, *(Fassung 4)* das aber als Regel der
    Praxis, nicht als Pflicht aus § 14 UStG. Das Dokument zeigt seinen Kreis; Korrektur- und
    Stornodokumente nehmen die Nummer aus dem Kreis ihrer Rechnung. Form vorläufig: ANN-075.
18. *(Fassung 2)* **Der § 14c-Riegel:** An steuerfreien und nicht steuerbaren Posten steht kein
    Steuerbetrag, nicht an Zeile, Steuergruppe oder Summe, unter § 19 UStG auf der ganzen Rechnung;
    der Grund der Steuerbefreiung ist Pflichtangabe (§ 14 Abs. 4 Nr. 8 UStG) im Snapshot. Die Sperre
    wirkt vor der Ausstellung und serverseitig (`app.assert_invoice_tax_lawful`), verbindlicher
    Testfall in `pnpm test:db`; falscher Ausweis heißt Storno und Neuausstellung (Punkt 9).
19. *(Fassung 2)* **Die Plattform führt die Auswertung „Einnahmen je Leistungsart“:** Erlöse je
    Leistungsbereich, darin je Steuerkennzeichen und Satz, nur aus ausgestellten Rechnungen,
    Korrektur- und Stornodokumenten und gebuchten Zahlungen. Sie benennt ihre Grundlage (Zufluss
    oder Rechnungsstellung) und mischt beide nie in einer Zahl; welche gilt, klärt B9.
    Deterministisch, ohne KI (ADR-005), kein steuerlicher Abschluss.
20. *(Fassung 2)* **V1 macht von der Kleinbetragsrechnung (§ 33 UStDV) keinen Gebrauch:** Jede
    Rechnung trägt alle Pflichtangaben nach § 14 Abs. 4 UStG, auch unter 250 Euro.
21. *(Fassung 3)* **Wiederkehrende und vorausbezahlte Leistungen sind abrechenbare Ereignisse**
    (§19): das Nachsorge-Abo monatlich als Leistung und Rechnung in `therapy`, frühestens ab Ende
    der Behandlungsgrundlage (ADR-020), monatlich kündbar; das Trainingspaket für einen festen
    Zeitraum, nicht pausierbar, eine Leistung in `training`. Für beide gelten die Punkte 1 bis 20.
    Ihr Kennzeichen klärt B4, bis dahin eine Annahme nach §15.1 an genau einer Stelle.
22. *(Fassung 4)* **Das Behandlungshonorar ist ein Terminhonorar:** je durchgeführtem
    Behandlungstermin genau einmal das vereinbarte Sitzungshonorar (Stand 2026-10-02: 140 € je
    60 Minuten samt Dokumentation und Hausbesuch). Getrennt, nie auseinander errechnet: verordnete
    Heilmittel mit Mengen an der Grundlage (ADR-020), erbrachte Leistungen je Termin (sie schreiben
    die Mengen fort), Honorar nach Tarif oder Vereinbarung (Punkt 5). Die Heilmittelauswahl
    verändert den Preis nicht von selbst; Tarife und Vereinbarungen gelten ab einem Datum,
    Bisheriges bleibt lesbar. Das Ausfallhonorar bleibt ein eigener Anlass (ADR-018).
23. *(Fassung 5)* **Die Rechnung über Terminhonorare zeigt Einzelpositionen je Heilmittel,** weil
    die Beihilfe je Leistung erstattet (Paragraf 23 BBhV mit Anlage 9): Das Honorar wird auf die am Termin
    erfassten Heilmittel *(Fassung 6)* aufgeteilt, gewichtet nach der am Leistungstag geltenden
    Preisliste, Summe je Termin genau das Honorar; Restcents nach dem größten Bruchteil, bei
    Gleichstand an die erste Position, austauschbar an genau einer Stelle (`app.session_fee_lines`).
    Je Position Kürzel (Heilmittel-Positionsnummer), Bezeichnung, Einzelpreis, Menge und
    Behandlungstage, dazu Verordnung mit Datum, verordnender Ärzt:in und Diagnose (ICD-10, ANN-229).
    Eine Rechnung je Grundlage (Verordnung), ohne Grundlage je Kalendermonat. Kein Vergleichsbetrag
    (Kassen- oder Beihilfesatz) ohne Entscheidung.
24. *(Fassung 6)* **Der Haken ist die Leistung; abgerechnet wird nach Freigabe der Grundlage:**
    keine Heilmittelbestätigung am Termin, der Haken heißt „Leistung erbracht“. Die Leistung
    entsteht serverseitig, sobald ein Behandlungstermin mit Grundlage abgehakt und dokumentiert ist,
    gleich in welcher Reihenfolge: je Heilmittel mit Restmenge eine Einheit, dazu das Terminhonorar
    (Punkt 22); Punkte 4 und 13 gelten. Ohne Grundlage, Preisliste oder Honorar entsteht nichts,
    dann erfasst das Büro. Die Rücknahme des Hakens nimmt die Leistung mit, solange weder Rechnung
    noch Entwurf sie führt, sonst bleibt der Haken. Ist die Grundlage vollständig, schlägt die
    Anwendung die Freigabe vor, ein Tipp bestätigt (ADR-020 Punkt 9). Die Rechnung entsteht weiter
    im Büro; die Freigabe ist ihre Vorstufe, keine Bedingung.

## Konsequenzen
Ohne Factoring verlassen Abrechnungsdaten die Plattform nicht; ein Dienstleister bräuchte ADR,
Einwilligung und DSFA (ADR-007). Der Empfänger ist Adressat, kein Zugang zur Akte (B5). Klinische
Korrektur erzeugt eine Version, Rechnungskorrektur ein Dokument, nie vermischt. Nummernlose Entwürfe
lassen sich lückenlos verwerfen; Zahlungen erlauben auch Überzahlungen, der Zahlungsstand wird
gerechnet. Bei beiden Verhältnissen: getrennte Rechnungen, keine Summe über zwei Steuerregime.

## Offene Folgefragen
- Override (Punkt 13): Wer setzt ihn, wer wertet aus?
- Vorbelegung bei mehreren Heilmitteln anders, etwa nur das erste? Bisher korrigiert das Büro.
- Vergleichsbetrag und Gewichte für die Beihilfe: offen bis zum ersten Erstattungsfall (B17).
- Reicht „eine Rechnung je Verordnung“ bei langen Verordnungen, oder braucht es eine Monatsgrenze?
- Textform-Information bei Honorar über der Erstattung (§ 630c Abs. 3 BGB): Wie hilft die Plattform?
- Offen mit B4: Befreiungsgrund als Text oder Feld (ANN-082), Leistung beider Bereiche,
  Ausfallhonorar in Punkt 19, Korrektur eines falschen Kennzeichens ohne Historienbruch.

## Änderungshistorie
- Fassung 1 (2026-08-28, Jannes): Erstfassung, Punkte 1 bis 14 (B4).
- Fassung 2 (2026-09-20, Jannes, E18): Punkte 15 bis 20, Steuerkennzeichen, Nummernkreise, § 14c.
- Fassung 3 (2026-09-23, Jannes): Punkt 21, Nachsorge-Abo und Trainingspaket; Vermerk an Punkt 13.
- Fassung 4 (2026-10-02, Jannes): Punkt 22 Terminhonorar; Vereinbarung vor Tarif, Lückenlosigkeit.
- Fassung 5 (2026-10-05, Jannes, B17): Punkt 23, Positionen je Heilmittel, Rechnung je Verordnung.
- Fassung 6 (2026-10-14, Jannes, B7): Punkt 24, Haken und Freigabe; Punkt 23 „erfasste“ Heilmittel.
- Verdichtet 2026-10-27 (Aufräumen 5), Inhalt unverändert; früherer Wortlaut: `git log -p`.
