# ADR-007: Datenschutz-Folgenabschätzung und Datenschutzprozess

## Status

Angenommen

## Datum

2026-08-28

## Kontext

§3 von `PROJECT_PRINCIPLES.md` erklärt Datenschutz und Informationssicherheit
zu grundlegenden Architekturprinzipien und ausdrücklich nicht zu nachträglichen
Features. §3.1 verbietet echte Patientendaten in Entwicklungs-, Test- und
Demonstrationsumgebungen, §3.2 fordert die technische Trennung von Produktions-
und Entwicklungsdaten.

Die Plattform verarbeitet besondere Kategorien personenbezogener Daten nach
Art. 9 DSGVO, und zwar in erheblicher Breite: klinische Dokumentation,
Fragebögen und PROMs, Kommunikation, Standort- und Tourendaten, Abrechnung,
Beschäftigtendaten sowie perspektivisch ein Patientenportal und
KI-gestützte Verarbeitung. *Plattform und KI-Assistenz gehören seit dem
2026-09-22 zum Umfang der Eröffnung (`PROJECT_PRINCIPLES.md` §14); die DSFA
betrachtet sie deshalb von Anfang an.*

Eine Datenschutz-Folgenabschätzung nach Art. 35 DSGVO ist kein Dokument, das
man am Ende schreibt. Ihr Ergebnis kann die Architektur einschränken. Wird sie
nach dem technischen Setup erstellt, beschreibt sie nur noch das bereits
Gebaute, statt es zu formen. Dasselbe gilt für die begleitenden Nachweise:
Verzeichnis der Verarbeitungstätigkeiten, technische und organisatorische
Maßnahmen, Lösch- und Aufbewahrungskonzept.

Zugleich soll die Entwicklung nicht stillstehen, während diese Arbeiten laufen.

Diese Entscheidung war als Punkt B2 in `docs/decisions/OPEN_DECISIONS.md`
als P0 offen.

## Entscheidung

1. Für die Plattform wird **vor Verarbeitung realer Patientendaten eine
   Datenschutz-Folgenabschätzung durchgeführt** — unabhängig davon, ob die
   abschließende rechtliche Schwellwertprüfung eine gesetzliche Pflicht nach
   Art. 35 DSGVO feststellt.
2. Die DSFA wird als **lebendes Dokument** geführt und bei wesentlichen
   Änderungen erneut überprüft. Wesentliche Änderungen sind insbesondere:
   - neuer KI-Anbieter,
   - neue Kategorie von Gesundheitsdaten,
   - neue Form automatisierter Auswertung,
   - Patientenportal,
   - Vertreter-/Angehörigenzugriff,
   - wesentliche Änderung der Routing-/Standortverarbeitung,
   - neue Form der Beschäftigtendatenverarbeitung,
   - erhebliche Änderung der Hostingarchitektur.
3. **Vor Produktivstart wird eine formale Prüfung dokumentiert**, ob die
   geplanten Verarbeitungsvorgänge einer DSFA gemäß Art. 35 DSGVO unterliegen.
4. Ergibt diese Prüfung eine gesetzliche DSFA-Pflicht, wird **gemäß §38 Abs. 1
   BDSG unabhängig von der Mitarbeiterzahl ein Datenschutzbeauftragter
   benannt**.
5. **Vor Produktivstart müssen mindestens vorliegen:**
   - Verzeichnis der Verarbeitungstätigkeiten,
   - dokumentierte technische und organisatorische Maßnahmen,
   - Lösch- und Aufbewahrungskonzept,
   - Auftragsverarbeiter-/Subprozessorenübersicht,
   - Datenschutzinformationen,
   - Verfahren für Betroffenenrechte,
   - Data-Breach-Prozess nach Art. 33/34 DSGVO.
6. **Entwicklungsarbeiten dürfen bereits vor Abschluss der DSFA stattfinden**,
   solange ausschließlich synthetische Daten verwendet werden und keine
   produktive Verarbeitung personenbezogener Gesundheitsdaten erfolgt.

## Konsequenzen

- Die DSFA wird ein Meilenstein vor der ersten realen Datenverarbeitung, kein
  Abschlussdokument. Ihr Ergebnis darf Architektur und Funktionsumfang
  verändern — genau dafür steht sie an dieser Stelle.
- Der Verzicht darauf, die Schwelle des Art. 35 auszureizen, spart eine
  Grundsatzdiskussion und liefert die Struktur ohnehin: Risikobetrachtung,
  Maßnahmenkatalog und Nachweisfähigkeit werden für Art. 5 Abs. 2, Art. 24 und
  Art. 32 DSGVO in jedem Fall gebraucht.
- Die acht Änderungsereignisse sind kein theoretischer Katalog. Mehrere davon
  sind bereits vorgesehen: das Patientenportal (§4.6), die Routenplanung (§9),
  die Arbeitszeiterfassung (§1) und die KI-Anbindung (§6). Die
  Wiedervorlagen der DSFA sind daher fest einzuplanen.
- Die Verzahnung mit den bestehenden ADRs ist eng: Die Freischaltung eines
  KI-Providers nach ADR-005 und eine Änderung der Hostingarchitektur nach
  ADR-002 lösen sowohl die dortige Anbieterprüfung als auch eine
  DSFA-Wiedervorlage aus. Beide Prüfungen sollten zusammen geführt werden,
  statt getrennt zu laufen.
- Wird ein Datenschutzbeauftragter benannt, entstehen laufende Kosten und eine
  Rolle mit eigenen Einsichts- und Prüfrechten. Das wirkt sich positiv auf
  den offenen Punkt C4 aus: In einer inhabergeführten Praxis gibt es sonst
  keine unabhängige Instanz, die die Auswertung des Audit-Logs übernehmen
  könnte.
- Die sieben Vorbedingungen machen den Produktivstart zu einem definierten
  Gate mit prüfbarer Liste statt zu einem Datum. Ohne vollständige Liste kein
  realer Patientendatenbetrieb.
- Das Lösch- und Aufbewahrungskonzept bleibt inhaltlich offen (Punkt B3), hat
  aber jetzt eine verbindliche Frist. *(Inzwischen: ADR-008 vom selben Tag,
  gebaut mit LOE-EPIC-001; die Validierung der Fristen bleibt Teil der DSFA.)* Dasselbe gilt für die
  Subprozessorenübersicht, die auf dem Prüfkatalog aus ADR-002 aufsetzt.
- Betroffenenrechte und Data-Breach-Prozess sind organisatorische Verfahren,
  brauchen aber technische Grundlagen: Auskunft und Export, Berichtigung unter
  Wahrung der Nachvollziehbarkeit nach §5, sowie eine Erkennungsfähigkeit, die
  die 72-Stunden-Frist überhaupt einhaltbar macht. Letztere stützt sich auf
  das Audit- und Logging-Modell aus ADR-004 und ADR-002.
- Die Entwicklung läuft weiter. Voraussetzung ist, dass synthetische Testdaten
  früh verfügbar sind — der offene Punkt E6 wird dadurch dringlicher, weil er
  sonst zum Anreiz wird, doch Echtdaten zu verwenden.

## Bewusst nicht Bestandteil dieser Entscheidung

- Das Ergebnis der Schwellwertprüfung. Es wird durch diesen ADR ausdrücklich
  nicht vorweggenommen.
- Die Methodik der DSFA und die Benennung einer konkreten Person oder Kanzlei
  als Prüfer oder Datenschutzbeauftragter.
- Die Frage, ob auch ohne festgestellte gesetzliche Pflicht ein
  Datenschutzbeauftragter benannt wird.
- Die inhaltlichen Aufbewahrungsfristen und das Löschverfahren selbst
  (offener Punkt B3); dieser ADR setzt nur die Frist für deren Vorliegen.
- Die Rechtsgrundlagen je Verarbeitungsvorgang (Art. 9 Abs. 2 lit. h DSGVO in
  Verbindung mit §22 BDSG gegenüber Einwilligung) und ein daraus folgendes
  Einwilligungsmodell im Datenmodell.
- Die Anforderungen aus §203 StGB; diese regelt ADR-002.
- Ein Termin für den Produktivstart.

## Offene Folgefragen

- Wer führt DSFA und Schwellwertprüfung durch, und nach welcher Methodik?
- Auf welche Rechtsgrundlage stützt sich welcher Verarbeitungsvorgang, und wo
  wird deshalb ein Einwilligungs- und Widerrufsmodell im Datenmodell benötigt?
- Wer pflegt das Verzeichnis der Verarbeitungstätigkeiten, in welchem Format,
  und wie bleibt es mit der Architektur synchron?
- An welchen Prozessschritt wird die Wiedervorlage gekoppelt, damit eine der
  acht Änderungen nicht unbemerkt in Produktion geht?
- Wird ein Datenschutzbeauftragter auch dann benannt, wenn keine gesetzliche
  Pflicht festgestellt wird?
- Wie werden Betroffenenrechte technisch bedient — insbesondere Auskunft und
  Kopie über das Patientenportal, auch im Verhältnis zu §630g BGB?
- Welche Erkennungs- und Alarmierungsmittel braucht der Data-Breach-Prozess,
  um die Frist aus Art. 33 DSGVO einhalten zu können?
- Wie wird das Produktivstart-Gate abgenommen und die Vollständigkeit der
  sieben Vorbedingungen dokumentiert?
- Wie werden die DSFA-Wiedervorlage und die Anbieterprüfung aus ADR-002 zu
  einem gemeinsamen Vorgang zusammengeführt?
