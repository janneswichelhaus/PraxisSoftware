# ADR-007: Datenschutz-Folgenabschätzung und Datenschutzprozess
## Status
Angenommen (2026-08-28), einzige Fassung; ergänzt durch ADR-008 (Aufbewahrung, Löschung).

## Kontext
Entschieden wird (B2, §3), wann für Gesundheitsdaten (Art. 9 DSGVO) DSFA (Art. 35 DSGVO) und Nachweise
(Art. 5 Abs. 2, 24, 32 DSGVO) vorliegen müssen, ohne das Bauen anzuhalten; Plattform und KI-Assistenz
(seit 2026-09-22 im Umfang, §14) erfasst die DSFA von Anfang an. Bewusst nicht Bestandteil: Ergebnis
der Schwellwertprüfung, Methodik, Prüfer und DSB als Person oder Kanzlei, ein DSB ohne Pflicht (B2),
Fristen und Löschverfahren (B3, ADR-008), Rechtsgrundlage je Vorgang (Art. 9 Abs. 2 lit. h DSGVO mit
§ 22 BDSG oder Einwilligung) samt Einwilligungsmodell, § 203 StGB (ADR-002), der Go-live-Termin.

## Entscheidung
1. **DSFA vorab.** Vor Verarbeitung realer Patientendaten wird eine DSFA durchgeführt, unabhängig
   davon, ob die abschließende Schwellwertprüfung eine Pflicht nach Art. 35 DSGVO feststellt.
2. **Lebendes Dokument,** neu geprüft bei wesentlichen Änderungen, insbesondere: neuer KI-Anbieter,
   neue Kategorie von Gesundheitsdaten, neue Form automatisierter Auswertung, Patientenportal,
   Vertreter-/Angehörigenzugriff, wesentliche Änderung der Routing-/Standortverarbeitung, neue Form
   der Beschäftigtendatenverarbeitung, erhebliche Änderung der Hostingarchitektur.
3. **Schwellwertprüfung.** Vor Produktivstart wird eine formale Prüfung dokumentiert, ob die
   geplanten Verarbeitungsvorgänge einer DSFA nach Art. 35 DSGVO unterliegen.
4. **Datenschutzbeauftragter.** Ergibt sie eine gesetzliche DSFA-Pflicht, wird nach § 38 Abs. 1 BDSG
   unabhängig von der Mitarbeiterzahl ein Datenschutzbeauftragter benannt.
5. **Vor Produktivstart müssen mindestens vorliegen:** Verzeichnis der Verarbeitungstätigkeiten,
   dokumentierte TOM, Lösch- und Aufbewahrungskonzept, Auftragsverarbeiter-/Subprozessorenübersicht,
   Datenschutzinformationen, Verfahren für Betroffenenrechte, Data-Breach-Prozess (Art. 33/34 DSGVO).
6. **Synthetische Daten.** Entwicklungsarbeiten dürfen vor Abschluss der DSFA stattfinden, solange
   nur synthetische Daten verwendet und keine Gesundheitsdaten produktiv verarbeitet werden.

## Konsequenzen
- Die DSFA darf Architektur und Funktionsumfang verändern. Wiedervorlagen sind fest einzuplanen; ein
  KI-Provider (ADR-005) oder eine Hostingänderung (ADR-002) löst Anbieterprüfung und Wiedervorlage
  aus, die zusammen laufen sollen; die Subprozessorenübersicht nutzt den Prüfkatalog aus ADR-002.
- Betroffenenrechte und Breach-Prozess brauchen technisch Auskunft, Export, Berichtigung mit
  Nachvollziehbarkeit (§5) und eine Erkennung, die die Meldefrist von 72 Stunden (Art. 33 DSGVO)
  einhaltbar macht,
  gestützt auf Audit und Logging (ADR-004, ADR-002).

## Offene Folgefragen
- offen: B2 und die Folgefragen zu ADR-007 (OPEN_DECISIONS); Erkennung für Art. 33 DSGVO (G6).
- Wie wird die Wiedervorlage an einen Prozessschritt gekoppelt und mit der Anbieterprüfung vereint?

## Änderungshistorie
- Fassung 1 (2026-08-28): angenommen.
- Verdichtet 2026-10-27 (Aufräumen 5), Inhalt unverändert; früherer Wortlaut: `git log -p`.
