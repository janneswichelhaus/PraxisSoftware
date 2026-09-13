# ADR-011: Logging und Observability

## Status

Angenommen

## Datum

2026-08-28

## Kontext

§3.1 von `PROJECT_PRINCIPLES.md` verbietet echte Patientendaten in
Entwicklungslogs. Produktionslogs waren in der Baseline nicht adressiert,
obwohl sie in der Praxis regelmäßig Patientenbezüge enthalten: Stacktraces mit
Nutzdaten, Request-Bodies in Debug-Ausgaben, Fehlermeldungen mit Freitext.
[ADR-002](ADR-002-hosting-data-residency.md) hat die Regel gesetzt, dass
Produktionslogs keine unnötigen Patientendaten und keine medizinischen
Freitexte enthalten dürfen, ohne sie zu konkretisieren.

Hinzu kommt eine Vermischung, die in vielen Systemen Schaden anrichtet:
Betriebslogs, Sicherheitslogs und Auditlogs haben verschiedene Zwecke,
verschiedene Empfänger, verschiedene Aufbewahrungsfristen und verschiedene
Schutzbedarfe. Werden sie in einen Topf geworfen, gilt am Ende für alle die
laxeste Regel.

Externe Observability-Dienste sind der klassische stille Abfluss: Sie werden
eingebunden, weil sie Fehlersuche erleichtern, und übertragen dabei
unkontrolliert Nutzdaten an einen Dritten.

Dieser ADR schließt den offenen Punkt E5 und konkretisiert §3.6.

## Entscheidung

1. **Operational Logging, Security Logging und Audit Logging werden getrennt
   behandelt.**
2. **Operational Logs DÜRFEN NICHT enthalten:**
   - Patientennamen
   - Adressen
   - Diagnosen
   - Anamnese
   - klinischen Freitext
   - vollständige KI-Prompts oder KI-Outputs
   - Passwörter
   - Auth-Tokens
   - Cookies
   - Authorization Header
   - sonstige unnötige personenbezogene Inhalte
3. Zur technischen Korrelation werden **interne Objekt- und Request-IDs**
   verwendet.
4. **Initiale Retention:**

   | Logart | Frist |
   |---|---|
   | Operational Logs | 30 Tage |
   | Authentication-/Security-Logs | 12 Monate |
   | Audit Logs | 3 Jahre |
   | AI-Gateway-Auditmetadaten | 3 Jahre |

5. **Externe Error- und Observability-Dienste unterliegen denselben
   Datenschutz- und Hostinganforderungen wie andere Auftragsverarbeiter**
   (§3.5, ADR-002).
6. **Vor Übermittlung an externe Observability-Dienste MUSS eine zentrale
   Redaction/Sanitization stattfinden.**

## Konsequenzen

- Die drei Logarten sind getrennte Systeme mit eigenen Regeln. Ein Ereignis
  kann in mehreren auftauchen, aber nie durch Umwidmung: Ein Auditereignis
  wird nicht dadurch erzeugt, dass etwas in ein Betriebslog geschrieben wird.
- Die Verbotsliste ist bewusst konkret und damit prüfbar. Sie lässt sich als
  automatisierter Test formulieren, der gegen erzeugte Logausgaben läuft,
  statt nur als Vorsatz zu existieren.
- Korrelation über interne IDs bedeutet, dass eine Fehlersuche in der Regel
  einen zweiten Schritt braucht: Die ID muss in einem berechtigten Kontext
  aufgelöst werden. Das verlangsamt Debugging und ist der Preis dafür, dass
  Logs allein keine Patientendaten offenbaren.
- Das Verbot vollständiger KI-Prompts und -Outputs im Betriebslog trennt
  sauber von den AI-Gateway-Auditmetadaten aus ADR-005 und ADR-008: Dort wird
  nachgewiesen, dass und wofür ein Aufruf stattfand, nicht was im Einzelnen
  übertragen wurde.
- Die kurze Frist für Betriebslogs von 30 Tagen begrenzt den Schaden eines
  Fehlers in der Redaction. Sie begrenzt zugleich die Möglichkeit, seltene
  Fehler rückwirkend zu untersuchen. Das ist eine bewusste Abwägung nach §16.
- Die Fristen sind mit ADR-008 konsistent gewählt und ergänzen dessen
  Retention Schedule um die Betriebslogs, die dort nicht aufgeführt waren.
- Ein Observability-Dienst wird damit ein Auftragsverarbeiter mit vollem
  Prüfkatalog aus ADR-002, einschließlich der Eignung im Hinblick auf
  §203 StGB. Dienste, die diese Prüfung nicht bestehen, sind nicht einsetzbar,
  auch wenn sie technisch bequem wären.
- Zentrale Redaction vor der Übermittlung heißt: Es gibt genau eine Stelle,
  die Ausgaben nach außen filtert, und keine direkten Aufrufe eines SDK aus
  Fachmodulen. Das ist strukturell dieselbe Entscheidung wie beim AI Gateway
  aus ADR-005 und aus demselben Grund.
- Redaction ist nie vollständig. Sie ist die zweite Verteidigungslinie hinter
  der Regel, sensible Inhalte gar nicht erst zu loggen.

## Bewusst nicht Bestandteil dieser Entscheidung

- Die Auswahl eines Log-, Error-Tracking- oder Observability-Dienstes.
- Ob überhaupt ein externer Observability-Dienst eingesetzt wird.
- Logformat, Transport, Aggregation und Alarmierung.
- Metriken, Tracing und Performance-Monitoring als eigene Disziplin.
- Die Schwellen und Regeln für Sicherheitsalarme.
- Das Schema der Audit-Einträge; das bleibt bei
  [ADR-010](ADR-010-audit-and-privileged-access.md) offen.
- Aufbewahrung und Zugriff auf Logs der eingesetzten Infrastrukturanbieter,
  soweit diese nicht von uns konfigurierbar sind.

## Offene Folgefragen

- Wie wird die Verbotsliste automatisiert geprüft, und wann läuft diese
  Prüfung — in CI, zur Laufzeit, oder beides?
- Wie werden Stacktraces behandelt, die Nutzdaten in Variablenwerten
  transportieren?
- Wie werden interne IDs so gewählt, dass sie selbst keine Rückschlüsse
  erlauben und dennoch stabil korrelierbar bleiben?
- Wer darf Betriebs- und Sicherheitslogs lesen, und ist dieser Zugriff
  seinerseits auditpflichtig (ADR-010)? *Für das Auditlog beantwortet mit
  ADR-010 Fassung 2 (Punkt 13); für Betriebs- und Sicherheitslogs offen bis
  OPS-004.*
- **Vermerk 2026-09-13:** „Audit Logs" in Punkt 4 meint alle Auditereignisse
  aus ADR-010 Punkt 2, nicht nur Patientenakten-Zugriffe. Die Frist ist mit
  ANN-029 als eigene Datenklasse `auditlog` (drei Jahre, unabhängig von der
  Akte) verankert; ADR-008 Punkt „Patientenakten-Auditlogs 3 Jahre" ist
  damit die engere Formulierung desselben Werts.
- Wie verhält sich die Redaction zu Logs, die der Infrastrukturanbieter
  selbst erzeugt und die wir nicht filtern können?
- Wie werden Logs behandelt, die auf dem Endgerät im Offline-Betrieb entstehen
  (ADR-001)?
- Was passiert bei einem festgestellten Redaction-Fehler — greift dann der
  Data-Breach-Prozess aus ADR-007?
