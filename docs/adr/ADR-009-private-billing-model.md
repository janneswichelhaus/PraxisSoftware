# ADR-009: Privatabrechnung

## Status

Angenommen

## Datum

2026-08-28

## Kontext

§1 von `PROJECT_PRINCIPLES.md` nennt Privatrechnungen als einen der
Kernprozesse, §4.3 gibt dem Office Zugriff auf Rechnungen und Zahlungsstatus,
§12 zählt Rechnungsdaten zu den besonders kritischen Funktionen und §13
verbietet, Rechnungen unbemerkt falsch zuzuordnen. Mehr steht in der Baseline
nicht.

Dahinter liegen mehrere Entscheidungen, die das Datenmodell festlegen. Ob die
Praxis selbst abrechnet oder über einen Abrechnungsdienstleister, ändert die
Anforderungen an Einwilligungen und Datenflüsse grundlegend. Rechnungsempfänger
sind bei Beihilfe, privater Versicherung, Betreuung oder minderjährigen
Patienten regelmäßig nicht die Patienten selbst. Und die Abrechnung unterliegt
mit den GoBD-Anforderungen einem eigenen Unveränderbarkeitsregime, das neben
der klinischen Versionierung aus §5 steht und anderen Regeln folgt: dort
Korrektur mit Historie, hier Storno und Neuausstellung.

Hinzu kommt eine fachliche Kopplung, die in der Praxis regelmäßig
auseinanderläuft: Eine Leistung entsteht am Termin, eine Rechnung entsteht
später und fasst mehrere Leistungen zusammen. Werden beide nicht getrennt
modelliert, entstehen Doppelabrechnungen oder nicht abgerechnete Leistungen.

Diese Entscheidung war als Punkt B4 in `docs/decisions/OPEN_DECISIONS.md`
offen.

## Entscheidung

1. Die erste Produktversion **führt die Privatabrechnung innerhalb der
   Plattform durch**. **Factoring beziehungsweise externe
   Abrechnungsdienstleister sind nicht Bestandteil von V1.**
2. **Patient und Rechnungsempfänger werden als getrennte Entitäten
   modelliert.**
3. **Abrechenbare Leistungen existieren unabhängig von Rechnungen** und werden
   aus durchgeführten Terminen beziehungsweise anderen abrechenbaren
   Ereignissen erzeugt.
4. **Eine Leistung darf nicht unbeabsichtigt mehrfach abgerechnet werden.**
5. **Leistungskatalog und Preisvereinbarungen werden versioniert.**
   Historische Leistungen und Rechnungen dürfen durch spätere Preisänderungen
   nicht verändert werden.
6. **Steuerliche Eigenschaften werden explizit pro Leistung beziehungsweise
   Leistungsversion gespeichert und nicht durch KI bestimmt.**
7. Rechnungen besitzen mindestens die Zustände **Entwurf, ausgestellt,
   versendet, teilweise bezahlt, bezahlt, überfällig und
   korrigiert/storniert**.
8. Eine **Rechnungsnummer wird erst bei Ausstellung vergeben**. Die Vergabe
   **MUSS eindeutig erfolgen**, und eine einmal vergebene Nummer **darf nicht
   wiederverwendet werden**.
9. Eine **ausgestellte Rechnung ist unveränderbar**. Korrekturen erfolgen
   durch nachvollziehbare **Korrektur-/Stornodokumente** und gegebenenfalls
   eine neue Rechnung.
10. **Beim Ausstellen werden alle rechnungsrelevanten Stammdaten,
    Leistungsdaten, Preise und Steuerinformationen als historischer Snapshot
    gespeichert.**
11. Das **ausgestellte Rechnungsdokument wird in seiner damaligen Form
    aufbewahrt**.
12. **Zahlungen werden als eigene Transaktionen modelliert** und ermöglichen
    **Teilzahlungen sowie spätere Rückzahlungen**.
13. Therapeutische Leistungen **sollen grundsätzlich erst endgültig fakturiert
    werden können, wenn die zugehörige Dokumentation finalisiert ist**.
    **Berechtigte Overrides müssen begründet und protokolliert werden.**
14. V1 unterstützt **PDF-Rechnungen für private Rechnungsempfänger**. Die
    Architektur **darf spätere strukturierte E-Rechnungen nicht verhindern**.

## Konsequenzen

- Ohne Factoring in V1 verlassen Patientendaten die Plattform nicht zu
  Abrechnungszwecken. Die sonst nötige ausdrückliche Einwilligung für die
  Übermittlung an einen Abrechnungsdienstleister entfällt in V1; ein späterer
  Wechsel wäre ein eigener ADR mit eigener Einwilligungs- und
  DSFA-Betrachtung (ADR-007 nennt neue Datenflüsse als Wiedervorlagegrund).
- Die Trennung von Patient und Rechnungsempfänger ist die Voraussetzung für
  Beihilfe, private Versicherung, Betreuung und minderjährige Patienten. Sie
  greift in den offenen Punkt B5 (Vertretung und Angehörigenzugriff), ohne ihn
  zu entscheiden: Hier geht es um den Adressaten der Rechnung, nicht um
  Zugriffsrechte auf die Akte.
- Leistung und Rechnung sind getrennte Lebenszyklen. Eine Leistung trägt einen
  eigenen Abrechnungsstatus; die Regel gegen unbeabsichtigte Mehrfachabrechnung
  wird damit zu einer prüfbaren Invariante des Datenmodells und nicht zu einer
  Sorgfaltsfrage im Bedienablauf. Das ist die direkte Umsetzung von §13.
- Versionierte Kataloge und Preise bedeuten, dass eine Leistung auf eine
  Katalogversion verweist und nicht auf einen aktuellen Preis. Preispflege
  wird dadurch aufwendiger und historisch korrekt.
- Steuerliche Eigenschaften je Leistungsversion sind eine bewusste Absage an
  eine globale Steuerlogik: Heilbehandlungen und nicht befreite Angebote wie
  Prävention oder Selbstzahler-Training können nebeneinander existieren. Der
  ausdrückliche Ausschluss von KI an dieser Stelle folgt der Trennung aus
  ADR-005 und der Abgrenzung aus ADR-006.
- Der Zustandsautomat der Rechnung ist normativ. Das schließt die bisher
  fehlende Modellierung der Rechnungsseite; der Terminstatus bleibt davon
  unberührt und weiterhin offen.
- Nummernvergabe erst bei Ausstellung heißt, dass Entwürfe keine Nummer tragen
  und beliebig verworfen werden können, ohne Lücken zu erzeugen. Die Eindeutigkeit
  und Nichtwiederverwendung ist unter gleichzeitigen Zugriffen sicherzustellen.
- Unveränderbarkeit plus Snapshot bedeutet: Eine Rechnung ist nach Ausstellung
  von späteren Änderungen an Stammdaten, Preisen und Katalog unabhängig. Damit
  entsteht bewusst Datenredundanz — sie ist hier Zweck und nicht Fehler.
- Neben der klinischen Versionierung aus §5 existiert damit ein zweites
  Unveränderbarkeitsregime mit anderer Korrekturlogik. Beide dürfen nicht
  vermischt werden: klinische Korrektur erzeugt eine neue Version, eine
  Rechnungskorrektur erzeugt ein eigenes Dokument.
- Die Aufbewahrung des ausgestellten Dokuments in seiner damaligen Form
  verbindet diesen ADR mit ADR-008: Rechnungen und Buchungsbelege folgen der
  steuerlichen Frist, nicht der Frist der Patientenakte.
- Zahlungen als eigene Transaktionen erlauben Teilzahlungen, Überzahlungen und
  Rückzahlungen, ohne den Rechnungsdatensatz zu verändern. Der Zahlungsstatus
  ist damit abgeleitet, nicht gesetzt.
- Die Kopplung von Fakturierung an finalisierte Dokumentation verbindet
  Abrechnung und klinische Doku. Sie kann im Alltag stören — deshalb der
  begründete und protokollierte Override, der Teil des Audit-Umfangs aus
  ADR-004 wird. Zugleich hängt sie an ADR-001: Finalisierung ist ein
  serverseitiger Vorgang und offline nicht möglich.
- PDF in V1 mit offener Tür zur E-Rechnung heißt praktisch, dass die
  Rechnungsdaten strukturiert vorliegen müssen und das PDF eine Darstellung
  ist — nicht die einzige Quelle.

## Bewusst nicht Bestandteil dieser Entscheidung

- Die Auswahl eines Leistungs- und Gebührenkatalogs sowie dessen Inhalte.
- Die abschließende steuerrechtliche Bewertung einzelner Leistungsarten und
  die Umsatzsteuerbehandlung im Einzelfall.
- Das Format und der Zeitpunkt einer späteren strukturierten E-Rechnung.
- Mahnwesen, Ausfallhonorar und Zahlungserinnerungen.
- Zahlungsanbieter, Bankanbindung, Kontoauszugsabgleich.
- Der Terminstatus-Automat (weiterhin offener Punkt in Abschnitt D).
- Die Einordnung von Leistungsziffern als organisatorische oder klinische
  Daten (offener Punkt C1) und damit der genaue Umfang des
  Behandlungsnachweises.
- Vertretungs- und Vollmachtsregelungen für den Zugriff auf Daten
  (offener Punkt B5).
- Die Verfahrensdokumentation nach GoBD als Dokument.

## Offene Folgefragen

- Welche abrechenbaren Ereignisse gibt es neben durchgeführten Terminen?
- Wie wird die Nichtwiederverwendung von Rechnungsnummern unter gleichzeitigen
  Zugriffen und bei fehlgeschlagenen Ausstellungsvorgängen technisch
  garantiert?
- Wie wird ein Nummernkreis geführt — pro Organisation, pro Jahr, fortlaufend?
- Wer darf einen Override der Fakturierungssperre setzen, und wie wird er
  ausgewertet?
- Wie verhält sich der Rechnungszustand „überfällig" zu Zahlungszielen und
  Mahnwesen, das hier nicht entschieden wird?
- Welche Felder umfasst der Snapshot genau, und wie wird er gegen spätere
  Schemaänderungen robust gehalten?
- Wie wird eine Storno- und Korrekturkette dargestellt, wenn mehrfach
  korrigiert wird?
- Wie werden Rechnungen an Beihilfestellen und private Versicherer
  adressiert, und benötigt das eigene Empfängertypen?
- Wie greifen Zugriffsrechte des Office (§4.3) auf Rechnungen mit
  Leistungsangaben, solange C1 nicht entschieden ist?
