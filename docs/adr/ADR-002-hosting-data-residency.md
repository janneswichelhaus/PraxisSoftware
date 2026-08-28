# ADR-002: Hosting und Datenstandort

## Status

Angenommen

## Datum

2026-08-28

## Kontext

Die Anwendung verarbeitet Gesundheitsdaten. §3 von `PROJECT_PRINCIPLES.md`
erklärt Datenschutz und Informationssicherheit zu Architekturprinzipien, §3.4
verbietet den Eigenbau von Sicherheits- und Betriebsinfrastruktur, §2.1
erlaubt ausdrücklich die Einbindung externer Dienste im Hintergrund.

Physiotherapeut:innen sind Berufsgeheimnisträger nach §203 Abs. 1 Nr. 1 StGB.
Die Einbindung externer Dienstleister („sonstige mitwirkende Personen") ist
nach §203 Abs. 3 StGB möglich, setzt aber deren Verpflichtung zur
Geheimhaltung voraus — zusätzlich zum Auftragsverarbeitungsvertrag nach
Art. 28 DSGVO. Die Providerauswahl ist damit nicht nur eine
Datenschutz-, sondern auch eine strafrechtlich relevante Frage.

§3.2 fordert die technische Trennung von Produktions- und Entwicklungsdaten,
§3.1 verbietet echte Patientendaten in Entwicklungs- und Testumgebungen sowie
in Entwicklungslogs. Produktionslogs sind dort nicht adressiert, enthalten in
der Praxis aber regelmäßig Patientenbezüge.

Diese Entscheidung war als Punkt A2 in `docs/decisions/OPEN_DECISIONS.md`
als P0 offen.

## Entscheidung

1. Gesundheitsbezogene **Produktionsdaten werden grundsätzlich in EU/EWR-
   Infrastruktur gespeichert und verarbeitet**.
2. **US-amerikanische Mutterunternehmen sind nicht grundsätzlich
   ausgeschlossen**, sofern die konkrete Verarbeitung, die Verträge und die
   tatsächlichen Datenflüsse unsere Anforderungen erfüllen.
3. Für jeden Dienstleister mit Zugang zu Patientendaten sind insbesondere zu
   prüfen und zu dokumentieren:
   - AVV / DPA,
   - Eignung im Hinblick auf §203 StGB,
   - Verschlüsselung,
   - Zugriffskontrolle,
   - Retention und Löschung,
   - Unterauftragnehmer.
4. **Dieser ADR legt keinen konkreten Cloudanbieter fest.**
5. **Dev, Test und Produktion sind getrennte Umgebungen.**
6. **Produktionslogs dürfen keine unnötigen Patientendaten und keine
   medizinischen Freitexte enthalten.**

## Konsequenzen

- Die Auswahl eines Anbieters wird ein dokumentierter Prüfvorgang mit
  festem Kriterienkatalog, kein Nebenbei-Entscheid. Ohne abgeschlossene und
  festgehaltene Prüfung erhält kein Dienst Zugang zu Patientendaten.
- Jeder neue externe Dienst mit Patientendatenkontakt ist eine eigene
  Architekturentscheidung und erhält ein eigenes ADR. Das entspricht §11,
  wonach neue externe Anbieter nicht ohne expliziten Auftrag eingeführt
  werden.
- Der Prüfmaßstab ist die tatsächliche Verarbeitung, nicht der Firmensitz.
  Bei Anbietern mit US-Mutterunternehmen müssen Verarbeitungsort,
  Supportzugriffe und Unterauftragnehmerketten konkret bewertet werden — die
  Zulässigkeit ergibt sich aus dem Ergebnis dieser Bewertung, nicht aus einer
  pauschalen Einordnung in die eine oder andere Richtung.
- Unterauftragnehmerketten müssen nachvollziehbar bleiben. Anbieter, die
  Unterauftragnehmer einseitig und ohne Vorankündigung austauschen, sind
  dadurch schwerer prüfbar.
- Drei Umgebungen bedeuten getrennte Datenbanken, getrennte Konfiguration und
  getrennte Secrets sowie entsprechende Betriebs- und Kostenaufwände. Ein
  Produktions-Backup darf nicht in Dev oder Test eingespielt werden; für
  Entwicklung und Test werden synthetische Daten benötigt (§3.1).
- Log-Hygiene wird zur Querschnittsanforderung: strukturierte Logs mit
  bewusst ausgewählten Feldern statt Freitext-Dumps, Redaction von
  Patientenbezügen, und dieselbe Regel für Fehler- und Crash-Reporting. Ein
  Error-Tracking-Dienst, der ungefilterte Stacktraces mit Nutzdaten
  entgegennimmt, ist mit dieser Entscheidung nicht vereinbar.
- Die EU/EWR-Vorgabe schränkt die Anbieterauswahl real ein und kann einzelne
  Dienste ausschließen oder verteuern. Das ist nach §16 hingenommen.

## Bewusst nicht Bestandteil dieser Entscheidung

- Die Auswahl konkreter Anbieter für Hosting, Datenbank, Objektspeicher,
  Mailversand, Kartendienst, KI oder Error-Tracking.
- Region, Rechenzentrum oder Verfügbarkeitszonen.
- Verschlüsselungsverfahren und Key-Management-Architektur.
- Backup-Strategie, RPO und RTO (offener Punkt E3).
- Die Frage nach Datenschutz-Folgenabschätzung, Datenschutzbeauftragtem,
  Verzeichnis der Verarbeitungstätigkeiten und TOM-Dokumentation
  (offener Punkt B2).
- Aufbewahrungsfristen und Löschkonzept für die Fachdaten
  (offener Punkt B3).
- Anzahl der Umgebungen über Dev/Test/Prod hinaus sowie Deploy-Berechtigungen
  (offener Punkt E4).
- Kosten und Budgetrahmen.

## Offene Folgefragen

- Wer führt die Anbieterprüfung durch, und wo wird das Prüfergebnis
  dokumentiert?
- Ist eine schriftliche Verpflichtung nach §203 Abs. 4 StGB harte
  Voraussetzung, oder gibt es begründete Ausnahmen für Dienste ohne
  faktischen Datenzugriff?
- Wie wird mit Anbietern umgegangen, die Unterauftragnehmer einseitig ändern
  dürfen?
- Ist ein externes Error-Tracking überhaupt zulässig, und in welchem Umfang?
- Wie werden Redaction-Regeln technisch erzwungen und getestet? §12 nennt
  KI-Datenflüsse und Dateizugriffe als kritisch — Logging gehört
  sinngemäß dazu.
- Wie wird die Regel „keine Produktionsdaten in Dev/Test" technisch
  abgesichert und nicht nur organisatorisch vereinbart?
- Wie oft wird die Anbieterprüfung wiederholt?
