# ADR-011: Logging und Observability
## Status
Angenommen (2026-08-28), Fassung 2 (2026-10-03); schließt E5, konkretisiert §3.6.

## Kontext
Entschieden wird, was Betriebs-, Sicherheits- und Auditlogs enthalten und wie lange; §3.1 und
ADR-002 regeln das nur allgemein, externe Observability-Dienste sind ein stiller Abfluss. Bewusst
nicht Bestandteil: Wahl und Einsatz eines externen Dienstes (in V1 keiner, OPS-004, gehalten von
`src/protokollierung.test.ts`; sonst Prüfung nach ADR-002), Logformat, Transport, Aggregation,
Alarmierung, Metriken, Tracing, Performance-Monitoring, Schwellen für Sicherheitsalarme, Schema der
Audit-Einträge (ADR-010), nicht konfigurierbare Logs der Infrastrukturanbieter.

## Entscheidung
1. **Operational Logging, Security Logging und Audit Logging werden getrennt behandelt.**
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
3. **Korrelation** über interne Objekt- und Request-IDs, aufgelöst nur in einem berechtigten Kontext.
4. **Initiale Retention** (Audit Logs: alle Ereignisse aus ADR-010, Klassen unabhängig von der Akte,
   ANN-029):

   | Logart | Frist |
   |---|---|
   | Operational Logs | 30 Tage |
   | Authentication-/Security-Logs | 12 Monate |
   | Audit Logs: Lese- und Sicherheitsereignisse (Fassung 2) | 12 Monate |
   | Audit Logs: übrige Einträge | 3 Jahre |
   | AI-Gateway-Auditmetadaten | 3 Jahre |
5. **Externe Error- und Observability-Dienste unterliegen denselben Datenschutz- und
   Hostinganforderungen wie andere Auftragsverarbeiter** (§3.5, ADR-002, auch § 203 StGB); ohne
   bestandene Prüfung nicht einsetzbar.
6. **Vor Übermittlung an externe Observability-Dienste MUSS eine zentrale Redaction/Sanitization
   stattfinden:** Genau eine Stelle filtert nach außen, `src/lib/protokoll.ts`, kein SDK-Aufruf aus
   Fachmodulen; sie lässt per Erlaubnisliste nur feste Bezeichner aus dem Quelltext, interne UUIDs
   und endliche Zahlen durch (OPS-004). In CI liest `src/lib/protokoll.test.ts` Punkt 2 aus diesem
   Dokument und prüft jeden Eintrag synthetisch, `src/protokollierung.test.ts` hält die erklärten
   Ausgänge fest.

## Konsequenzen
- Ein Ereignis kann in mehreren Logarten stehen, nie durch Umwidmung: Ein Eintrag im Betriebslog
  erzeugt kein Auditereignis. AI-Gateway-Auditmetadaten (ADR-005, ADR-008) belegen, dass und wofür
  ein Aufruf stattfand, nicht was übertragen wurde. Redaction ist nie vollständig, nur die zweite
  Verteidigungslinie hinter der Regel, sensible Inhalte gar nicht erst zu loggen.

## Offene Folgefragen
- Wie wird gesichert, dass sensible Inhalte gar nicht erst übergeben werden (was kein Filter kann)?
- Wie werden Stacktraces behandelt, die Nutzdaten in Variablenwerten tragen?
- Wie bleiben interne IDs ohne Rückschluss und trotzdem stabil korrelierbar?
- Wer darf Betriebs- und Sicherheitslogs lesen, und ist das auditpflichtig? (OPS-004, G6)
- Wie verhält sich die Redaction zu Logs, die der Infrastrukturanbieter selbst erzeugt?
- Wie werden Logs behandelt, die auf dem Endgerät im Offline-Betrieb entstehen (ADR-001)?
- Greift bei einem festgestellten Redaction-Fehler der Data-Breach-Prozess aus ADR-007?

## Änderungshistorie
- Fassung 1 (2026-08-28): angenommen.
- Fassung 2 (2026-10-03, LOG-EPIC-001): Punkt 4, Lese- und Sicherheitsereignisse 12 Monate.
- Verdichtet 2026-10-27 (Aufräumen 5), Inhalt unverändert; früherer Wortlaut: `git log -p`.
