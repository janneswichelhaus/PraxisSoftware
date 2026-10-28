# ADR-014: Grundlegende Datenmodell-Entscheidungen
## Status
Angenommen (2026-08-28), geltend Fassung 2 (2026-09-23, Jannes): Umkehr bei „Abonnements“.

## Kontext
Was „nicht verbauen“ und „nicht vorbauen“ (§14, §11) konkret heißen (C8). Bewusst nicht Bestandteil:
Werkzeuge (ADR-015), das konkrete Schema samt Namen, Normalisierung und Indizes, Primärschlüssel mit
`organization_id` (ADR-003), Versionierung (ADR-016), Vertretung (ADR-023), Terminzustände (ADR-018),
der Geld-Datentyp im Einzelnen (verbindlich nur: kein Fließkomma) und Historisierung über die
Rechnungssnapshots (ADR-009) hinaus.

## Entscheidung
- **Positivliste, ab dem ersten Datenmodell bewusst getragene Architekturkosten:**
  UUID-Primärschlüssel; `organization_id` auf fachlichen Daten, wo Mandantenzuordnung relevant ist,
  `location_id`, wo Standortzuordnung fachlich relevant ist (ADR-003 Punkt 1); zeitzonenbewusste
  Zeitstempel; `created_at`/`created_by`, soweit fachlich erforderlich; exakte numerische Geldwerte
  ohne Fließkommaberechnung, mit expliziter Währung; mehrere Rollen pro Benutzer; Trennung von
  Person, Patient/Mitarbeiter und Authentifizierungsaccount; Struktur für spätere Vertreter- und
  Angehörigenzugriffe (handelnde und betroffene Person getrennt modelliert), ohne die vollständige
  Vertreterfunktion in V1 vorzubauen; Auditfähigkeit (eindeutig referenzierbarer Gegenstand je
  auditpflichtiger Aktion, ADR-010); Retention-/Deletion-Fähigkeit nach ADR-008 (Datenklasse und
  Fristanker je Entität); klinische Versionierung nach §5; versionierte Leistungs- und Preisstruktur
  mit Rechnungssnapshots (ADR-009); RLS-fähige Datenbankarchitektur (ADR-004).
- **Negativliste, nicht prophylaktisch implementiert:** SaaS-Tenant-Onboarding, Tenant-Switching-UI,
  externe Praxisabrechnung, Abonnements als Abrechnungsmodell der Software für andere Praxen
  (Fassung 2; das Nachsorge-Abo der Patient:innen ist als Leistung der Praxis freigegeben, §14, §19),
  Wearables, komplexe Multi-Location-Funktionen, Vektordatenbank/Embeddings, native
  iOS-/Android-Anwendungen, sonstige zukünftige Funktionen ohne konkreten Use Case.
- **„Zukunft nicht verbauen“ bedeutet ausdrücklich nicht, zukünftige Funktionen vorzeitig zu
  implementieren.**

## Konsequenzen
- Beide Listen sind ab der ersten Migration verbindlich: Eine Tabelle, die eine zutreffende Position
  auslässt, ist ein Mangel und kein Sonderfall.

## Offene Folgefragen
- Welche Entitäten führen `location_id`, und trägt ein Patient einen Standort?
- Wie werden `created_by` und Auditbezüge behandelt, wenn Hintergrundprozess oder AI Gateway handeln?
- Wie wird die Positivliste erzwungen: Konvention, Migrationsprüfung, automatisierter Test (ADR-013)?
- offen: Zeitzonen bei wiederkehrenden Terminen und Kalenderjahr-Fristen (OPEN_DECISIONS).

## Änderungshistorie
- Fassung 1 (2026-08-28): angenommen.
- Fassung 2 (2026-09-23, Jannes): Umkehr, „Abonnements“ meint nur das Abrechnungsmodell der Software.
- Verdichtet 2026-10-27 (Aufräumen 5), Inhalt unverändert; früherer Wortlaut: `git log -p`.
