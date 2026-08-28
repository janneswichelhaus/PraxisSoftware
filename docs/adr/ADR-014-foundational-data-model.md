# ADR-014: Grundlegende Datenmodell-Entscheidungen

## Status

Angenommen

## Datum

2026-08-28

## Kontext

§14 von `PROJECT_PRINCIPLES.md` verlangt, dass das Datenmodell spätere
Erweiterungen nicht unnötig verhindert, und untersagt zugleich deren
vorzeitige Implementierung. §11 verbietet großflächige nachträgliche
Änderungen an Datenbankstrukturen ohne Auftrag.

Diese beiden Sätze sind ohne konkrete Liste beliebig auslegbar: Jede
Vorbereitung lässt sich als „vorzeitige Implementierung" kritisieren, jede
Auslassung als „Zukunft verbaut". Genau das war der offene Punkt C8.

Der sachliche Grund für eine Liste ist die Asymmetrie der Kosten. Ein
zusätzliches Feld oder ein passender Datentyp kostet zu Beginn fast nichts.
Dieselbe Änderung nachträglich einzuziehen betrifft jede Abfrage, jede
Berechtigungsregel, jeden bestehenden Datensatz und jede bereits ausgestellte
Rechnung. Umgekehrt kostet eine vorgezogene Funktion sofort Entwicklungszeit,
Testaufwand und Wartung — für einen Bedarf, den es noch nicht gibt.

Die Liste trennt deshalb strukturelle Vorbereitung von funktionaler
Vorwegnahme. [ADR-003](ADR-003-organization-location-model.md) hat diese
Trennung für `organization_id` und `location_id` bereits vorgenommen; dieser
ADR führt sie für das übrige Fundament zu Ende und sammelt die
Modellanforderungen der übrigen ADRs an einer Stelle.

## Entscheidung

### Bewusst getragene Architekturkosten ab dem ersten Datenmodell

- **UUID-basierte Primärschlüssel**
- **`organization_id`** auf fachlichen Daten, wo Mandantenzuordnung relevant
  ist
- **`location_id`**, wo Standortzuordnung fachlich relevant ist
- **zeitzonenbewusste Zeitstempel**
- **`created_at` / `created_by`**, soweit fachlich erforderlich
- **exakte numerische Geldwerte; keine Floating-Point-Berechnung für
  finanzielle Werte**
- **explizite Währung**
- **Unterstützung mehrerer Rollen pro Benutzer**
- **Trennung von Person, Patient/Mitarbeiter und Authentifizierungsaccount**
- **notwendige Struktur für spätere Vertreter-/Angehörigenzugriffe**, ohne die
  vollständige Vertreterfunktion in V1 vorzeitig zu implementieren
- **Auditfähigkeit**
- **klinische Versionierungsanforderungen** gemäß `PROJECT_PRINCIPLES.md`
- **Retention-/Deletion-Fähigkeit** gemäß
  [ADR-008](ADR-008-data-retention-and-deletion.md)
- **versionierte Leistungs-/Preisstruktur und Rechnungssnapshots** gemäß
  [ADR-009](ADR-009-private-billing-model.md)
- **RLS-fähige Datenbankarchitektur** gemäß
  [ADR-004](ADR-004-authorization-model.md)

### Nicht prophylaktisch implementiert

- SaaS-Tenant-Onboarding
- Tenant-Switching-UI
- externe Praxisabrechnung
- Abonnements
- Wearables
- komplexe Multi-Location-Funktionen
- Vektordatenbank/Embeddings
- native iOS-/Android-Anwendungen
- sonstige zukünftige Funktionen ohne konkreten Use Case

**„Zukunft nicht verbauen" bedeutet ausdrücklich nicht, zukünftige Funktionen
vorzeitig zu implementieren.**

## Konsequenzen

- Die Liste ist ab der ersten Migration verbindlich. Eine Tabelle, die eine
  zutreffende Position auslässt, ist ein Mangel und kein Sonderfall.
- UUID-Primärschlüssel entkoppeln Identität von Einfügereihenfolge. Das ist die
  Voraussetzung für die Offline-Erzeugung von Entwürfen nach
  [ADR-001](ADR-001-online-first-limited-offline.md) und verhindert zugleich,
  dass fortlaufende Zahlen Rückschlüsse auf Patientenzahlen zulassen. Es kostet
  Speicher und etwas Indexleistung; das ist hingenommen.
- Exakte Geldwerte ohne Fließkomma sind keine Stilfrage. Rundungsfehler in
  Rechnungen verletzen §13 und die Unveränderbarkeit aus ADR-009. Die explizite
  Währung ist die billigste Absicherung gegen eine später falsch
  interpretierte Zahl.
- Zeitzonenbewusste Zeitstempel sind für Termine, Touren, Fristen und
  Dokumentationszeitpunkte notwendig. Ohne sie sind Aufbewahrungsfristen aus
  ADR-008 und Behandlungsnachweise nach §4.4 nicht belastbar.
- Die Trennung von Person, Rolle als Patient oder Mitarbeiter und
  Authentifizierungsaccount ist die strukturelle Grundlage gleich mehrerer
  bereits getroffener Entscheidungen: der Mehrfachrollen aus ADR-004, der
  Trennung von Account und aufbewahrungspflichtigem Fachdatensatz aus ADR-008
  und der Trennung von Patient und Rechnungsempfänger aus ADR-009. Sie erlaubt
  außerdem den realen Fall, dass eine Person zugleich Mitarbeiterin und
  Patientin ist.
- Struktur für Vertreterzugriffe heißt: Die Beziehung zwischen handelnder
  Person und betroffenem Patienten ist modelliert, nicht implizit gleichgesetzt.
  Die Funktion selbst — Vollmachten, Freigaben, Portalzugang für Angehörige —
  bleibt offen und ist Gegenstand des noch offenen Punkts B5.
- Auditfähigkeit im Datenmodell bedeutet, dass jede auditpflichtige Aktion aus
  ADR-010 einen eindeutig referenzierbaren Gegenstand hat. Ein Auditeintrag,
  der auf nichts Stabiles zeigt, ist wertlos.
- Retention-Fähigkeit bedeutet, dass jede Entität ihrer Datenklasse zugeordnet
  ist und die fachlichen Anker der Fristen trägt. Andernfalls ist der Retention
  Schedule aus ADR-008 nicht anwendbar.
- Die Negativliste ist ebenso verbindlich wie die Positivliste. Sie schützt vor
  dem naheliegenden Fehler, „nicht verbauen" als Auftrag zum Vorbauen zu lesen.
  Insbesondere Embeddings und Vektordatenbank sind ausgeschlossen — sie wären
  eine Kopie klinischer Daten außerhalb des Berechtigungsmodells (ADR-004).
- Der Gesamtaufwand ist spürbar, aber begrenzt: Es handelt sich überwiegend um
  Felder, Datentypen und Beziehungen, nicht um Funktionen.

## Bewusst nicht Bestandteil dieser Entscheidung

- Die Wahl des Datenbanksystems, des ORM und des Migrationswerkzeugs. §3.4
  bleibt maßgeblich: keine eigene Datenbank-Engine.
- Das konkrete Schema, Tabellennamen, Normalisierungsgrad und Indizes.
- Ob `organization_id` Teil des Primärschlüssels wird — das bleibt bei ADR-003
  offen.
- Der Mechanismus der klinischen Versionierung; `PROJECT_PRINCIPLES.md` §5
  fordert Nachvollziehbarkeit, die technische Umsetzung ist weiterhin offen.
- Die konkrete Ausgestaltung der Vertreterbeziehung (offener Punkt B5).
- Der Zustandsautomat für Termine.
- Die Datentypwahl für Geldwerte im Einzelnen; verbindlich ist nur der
  Ausschluss von Fließkomma.
- Historisierungsstrategien über die von ADR-009 geforderten
  Rechnungssnapshots hinaus.

## Offene Folgefragen

- Welche Entitäten führen `location_id`, und trägt ein Patient einen Standort?
- Welcher exakte Datentyp und welche Nachkommastellen gelten für Geldwerte?
- Wie werden `created_by` und Auditbezüge behandelt, wenn der handelnde Akteur
  ein Hintergrundprozess oder das AI Gateway ist?
- Wie wird die Einhaltung der Positivliste erzwungen — Konvention,
  Migrationsprüfung, automatisierter Test (ADR-013)?
- Wie sieht die minimale Struktur für Vertreterzugriffe aus, ohne B5
  vorwegzunehmen?
- Wie werden Daten ohne Organisationsbezug behandelt, etwa Instrumenten- und
  Leistungskatalog?
- Wie werden Zeitzonen für wiederkehrende Termine und für Fristen behandelt,
  die auf Kalenderjahre abstellen (ADR-008)?
