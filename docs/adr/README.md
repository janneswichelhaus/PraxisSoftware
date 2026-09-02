# Architecture Decision Records (ADR)

In diesem Ordner liegen die **Architecture Decision Records** des Projekts.

Ein ADR ist nichts Kompliziertes: Es ist eine kurze Aktennotiz zu einer
technischen Entscheidung. Es hält fest, **was** entschieden wurde, **warum**,
und **was daraus folgt** — damit in zwei Jahren noch nachvollziehbar ist,
warum etwas so gebaut wurde.

## Beispiel

> **Entscheidung:** Wir bauen online-first mit begrenztem Offline-Modus.
>
> **Warum:** Hausbesuche können Funklöcher haben, vollständige Offline-Akten
> erhöhen aber das Datenschutzrisiko.
>
> **Konsequenz:** Heutige Tour und Entwürfe offline verfügbar; vollständige
> Akte nur online.

## Aufbau eines ADR

Kurz halten. Eine Seite reicht fast immer.

- **Titel** — die Entscheidung in einem Satz
- **Status** — vorgeschlagen / angenommen / abgelöst durch ADR-XXXX
- **Datum**
- **Kontext** — welches Problem stand an, welche Rahmenbedingungen galten
- **Entscheidung** — was wir tun
- **Konsequenzen** — was daraus folgt, auch die unangenehmen Seiten;
  gegebenenfalls die verworfenen Alternativen mit einem Satz Begründung

## Dateibenennung

`ADR-NNN-kurzer-titel.md`, fortlaufend nummeriert, zum Beispiel
`ADR-001-online-first-limited-offline.md`.

## Wann ein ADR geschrieben wird

Immer dann, wenn eine Entscheidung später teuer rückgängig zu machen ist oder
wenn sich jemand fragen könnte, warum es nicht anders gemacht wurde:
Datenhaltung, Autorisierung, Auswahl externer Anbieter, Umgang mit
Patientendaten, Grundsätze der Fehlerbehandlung.

Kein ADR nötig für alltägliche Umsetzungsdetails.

## Verhältnis zu den anderen Dokumenten

- `PROJECT_PRINCIPLES.md` — die verbindlichen Produkt- und Sicherheitsprinzipien (aktuell Version 0.2)
- `docs/decisions/OPEN_DECISIONS.md` — was noch **nicht** entschieden ist
- `docs/adr/` — was entschieden wurde und warum

Der übliche Weg: Ein Punkt aus `OPEN_DECISIONS.md` wird entschieden, bekommt
hier ein ADR und wird dort als erledigt markiert. Betrifft die Entscheidung die
Prinzipien, wird `PROJECT_PRINCIPLES.md` in einem eigenen Commit nachgezogen.

## Bestehende ADRs

| ADR | Titel | Status |
|---|---|---|
| [ADR-001](ADR-001-online-first-limited-offline.md) | Online-first mit begrenzter Offline-Fähigkeit | Angenommen |
| [ADR-002](ADR-002-hosting-data-residency.md) | Hosting und Datenstandort | Angenommen |
| [ADR-003](ADR-003-organization-location-model.md) | organization_id und location_id im Datenmodell | Angenommen |
| [ADR-004](ADR-004-authorization-model.md) | Berechtigungsmodell | Angenommen |
| [ADR-005](ADR-005-provider-independent-ai.md) | Providerunabhängige KI-Anbindung | Angenommen |
| [ADR-006](ADR-006-medical-device-boundary.md) | Abgrenzung gegenüber Medical Device Software | Angenommen |
| [ADR-007](ADR-007-data-protection-impact-assessment.md) | Datenschutz-Folgenabschätzung und Datenschutzprozess | Angenommen |
| [ADR-008](ADR-008-data-retention-and-deletion.md) | Aufbewahrung und Löschung personenbezogener Daten | Angenommen |
| [ADR-009](ADR-009-private-billing-model.md) | Privatabrechnung | Angenommen |
| [ADR-010](ADR-010-audit-and-privileged-access.md) | Audit-Logging und privilegierter Produktionszugriff | Angenommen |
| [ADR-011](ADR-011-logging-and-observability.md) | Logging und Observability | Angenommen |
| [ADR-012](ADR-012-backup-and-business-continuity.md) | Backup, Wiederherstellung und Betriebskontinuität | Angenommen |
| [ADR-013](ADR-013-ci-cd-and-release-governance.md) | CI/CD und Release-Governance | Angenommen |
| [ADR-014](ADR-014-foundational-data-model.md) | Grundlegende Datenmodell-Entscheidungen | Angenommen |
| [ADR-015](ADR-015-initial-technical-stack.md) | Initialer technischer Stack | Angenommen |
| [ADR-016](ADR-016-clinical-documentation-record.md) | Klinische Dokumentation: Entwurf, Finalisierung, Änderbarkeit | Angenommen |
