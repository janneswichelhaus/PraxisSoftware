# ADR-003: organization_id und location_id im Datenmodell
## Status
Angenommen (2026-08-28), Fassung 1; schloss A3 in `docs/decisions/OPEN_DECISIONS.md`.

## Kontext
Vermarktung und Wachstum nicht verbauen, aber nicht vorbauen (§1, §14, §11). Bewusst nicht
Bestandteil: Mandantenfähigkeit als Produktfunktion samt organisationsübergreifender Administration,
das Isolationsmodell für echten Mehrmandantenbetrieb, standortbezogene Fachlogik, Schlüsselstrategie.

## Entscheidung
1. **`organization_id`** und, **wo fachlich sinnvoll, `location_id`** werden **von der ersten
   Datenbankarchitektur an berücksichtigt**.
2. **Version 1 wird nur für eine Organisation betrieben.**
3. **Nicht implementiert werden:** Tenant-Switching-UI, SaaS-Onboarding, SaaS-Abrechnung.
4. **Zweck** ist allein, dass das Datenmodell später nicht auf genau eine Praxis fest verdrahtet ist.

## Konsequenzen
- `organization_id` steht auf allen fachlichen Tabellen (Liste: `supabase/tests/schema.test.ts`),
  `location_id` nur bei fachlichem Standortbezug; Policies und Abfragen beziehen die Organisation
  ein; die Offenheit aus §4.2 gilt je Organisation. Die eine Organisation richtet
  `app.bootstrap_practice` ein, ohne Oberfläche für weitere; adressiert wird sie nie über globale
  Konstanten, hartkodierte Bezeichner oder implizite Singleton-Zeilen. Echter Mehrmandantenbetrieb
  bliebe ein eigenes Vorhaben mit eigener Prüfung von Isolation, Betrieb und Vertragslage.

## Offene Folgefragen
- Welche Entitäten führen `location_id`: auch Patient:innen oder nur Termine, Touren, Ressourcen?
- Wird `organization_id` Teil des Primärschlüssels oder ein indizierter Fremdschlüssel?
- Wie wird erzwungen, dass keine Tabelle die Spalte vergisst (Konvention, Migrationsprüfung, Test)?
- Wie sähe ein Backfill aus, wenn ein zweiter Standort zu bestehenden Datensätzen hinzukommt?

## Änderungshistorie
- Fassung 1 (2026-08-28): angenommen.
- Verdichtet 2026-10-27 (Aufräumen 5), Inhalt unverändert; früherer Wortlaut: `git log -p`.
