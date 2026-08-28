# ADR-003: organization_id und location_id im Datenmodell

## Status

Angenommen

## Datum

2026-08-28

## Kontext

§1 von `PROJECT_PRINCIPLES.md` hält fest, dass eine spätere Vermarktung an
andere Praxen architektonisch nicht ausgeschlossen werden soll, aktuell aber
kein Produktziel ist. §14 verlangt, dass das Datenmodell spätere
Erweiterungen — weitere Mitarbeiter, mehrere Standorte — nicht unnötig
verhindert, und untersagt zugleich deren vorzeitige Implementierung. §11
verbietet, ohne expliziten Auftrag wesentliche Architektur zu wechseln oder
Datenbankstrukturen großflächig zu verändern.

Diese Prinzipien sind in der Praxis gegenläufig: Wer nichts vorbereitet,
verdrahtet die Anwendung implizit auf genau eine Praxis; wer Mandantenfähigkeit
ausbaut, implementiert ein Produktziel, das es nicht gibt. Ohne bewusste
Entscheidung fällt sie beim ersten Schema-Entwurf nebenbei.

Der Unterschied im Aufwand ist asymmetrisch: ein Fremdschlüssel je Tabelle
kostet zu Beginn wenig, das nachträgliche Einziehen betrifft jede Abfrage,
jede Berechtigungsregel und jeden Datensatz.

Diese Entscheidung war als Punkt A3 in `docs/decisions/OPEN_DECISIONS.md`
als P0 offen.

## Entscheidung

1. **`organization_id`** und, **wo fachlich sinnvoll, `location_id`** werden
   **von der ersten Datenbankarchitektur an berücksichtigt**.
2. **Version 1 wird nur für eine Organisation betrieben.**
3. **Nicht implementiert werden**: Tenant-Switching-UI, SaaS-Onboarding,
   SaaS-Abrechnung.
4. Die Struktur soll ausschließlich verhindern, dass das Datenmodell später
   auf genau eine Praxis fest verdrahtet ist.

## Konsequenzen

- Fachliche Tabellen führen `organization_id` ab der ersten Migration.
  `location_id` wird dort geführt, wo ein Standortbezug fachlich trägt — es
  wird nicht flächendeckend erzwungen.
- Berechtigungsregeln und Abfragen beziehen die Organisation ein. Das greift
  unmittelbar in ADR-004: Datenbank-Policies können auf `organization_id`
  aufsetzen, und die in §4.2 gewollte Offenheit gilt ausdrücklich für alle
  Akten *der Organisation*, nicht global.
- In Version 1 existiert genau eine Organisation. Sie wird beim Einrichten der
  Umgebung angelegt; es gibt keine Oberfläche, um weitere zu erzeugen.
- Es entsteht laufender Mehraufwand ohne unmittelbaren Nutzen: zusätzliche
  Spalten, Indizes, Testfixtures und Migrationsdisziplin. Dieser Aufwand wird
  bewusst getragen.
- Die Anwendung darf die Organisation nicht über globale Konstanten,
  hartkodierte Bezeichner oder implizite Singleton-Zeilen adressieren, sonst
  ist der Zweck der Entscheidung verfehlt.
- Diese Entscheidung schafft keine Mandantenfähigkeit. Ein echter
  Mehrmandantenbetrieb bliebe ein eigenes Vorhaben mit eigener Prüfung von
  Isolation, Betrieb und Vertragslage.

## Bewusst nicht Bestandteil dieser Entscheidung

- Mandantenfähigkeit als Produktfunktion: kein Tenant-Switching, kein
  Self-Service-Onboarding, keine SaaS-Abrechnung, keine
  organisationsübergreifende Administration.
- Das Isolationsmodell für einen späteren echten Mehrmandantenbetrieb
  (gemeinsames Schema, Schema je Mandant, Datenbank je Mandant).
- Standortbezogene Fachlogik wie Öffnungszeiten, standortabhängige Preise oder
  standortübergreifende Vertretungsregelungen.
- Die Frage der späteren Vermarktung selbst — §1 bleibt unverändert: kein
  aktuelles Produktziel.
- Schlüsselstrategie und Datentypen für Primärschlüssel im Allgemeinen.

## Offene Folgefragen

- Welche Entitäten führen `location_id`? Insbesondere: hat ein Patient einen
  Standort, oder tragen nur Termine, Touren und Ressourcen einen?
- Wie werden Daten ohne klaren Organisationsbezug behandelt — etwa
  Instrumentenbibliothek (§7) und Leistungskatalog: global oder je
  Organisation?
- Wird `organization_id` Teil des Primärschlüssels oder ein indizierter
  Fremdschlüssel?
- Wie wird die Einhaltung erzwungen, damit keine Tabelle die Spalte vergisst
  (Konvention, Migrationsprüfung, Test)?
- Wie sähe eine Backfill-Strategie aus, wenn ein zweiter Standort zu
  bestehenden Datensätzen hinzukommt?
- Gilt die Regel auch für Audit-Logs und Dateimetadaten?
