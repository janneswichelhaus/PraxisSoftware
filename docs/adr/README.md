# Architecture Decision Records (ADR)
Ein ADR hält eine technische Entscheidung fest: was entschieden wurde, warum und was daraus
folgt. Rang 2 nach `PROJECT_PRINCIPLES.md` (§21); ein ADR überschreibt die Prinzipien nicht.

## Wann ein ADR
Wenn eine Entscheidung später teuer rückgängig zu machen ist oder jemand fragen könnte, warum
es nicht anders gemacht wurde: Datenhaltung, Autorisierung, externe Anbieter, Umgang mit
Patientendaten, Grundsätze der Fehlerbehandlung. Kein ADR für Umsetzungsdetails. Der übliche
Weg: offener Punkt in `docs/decisions/OPEN_DECISIONS.md` → ADR → dort als erledigt vermerkt;
eine bestätigte Annahme aus `docs/decisions/ASSUMPTIONS.md` mit teurer Rücknahme geht denselben
Weg und behält dort einen Verweis auf das ADR.

## Aufbau
`ADR-NNN-kurzer-titel.md`, fortlaufend nummeriert. **Status** in höchstens drei Zeilen
(vorgeschlagen, angenommen, abgelehnt oder abgelöst durch ADR-NNN; Datum; wer; geltende
Fassung), **Kontext** in höchstens 15 Zeilen, **Entscheidung** als nummerierte Punkte mit fettem
Kurztitel (die Nummern sind stabil, Code und Dokumente zitieren sie), **Konsequenzen** in
höchstens 15 Zeilen, **Offene Folgefragen** nur, solange sie offen sind, und am Ende die
**Änderungshistorie** mit einer Zeile je Fassung. Ein ADR zitiert, statt zu wiederholen: Was in
den Prinzipien, einem anderen ADR oder der Datenbank steht, nennt er beim Namen.

## Fassungen
Ein angenommener ADR wird inhaltlich nicht umgeschrieben. Eine Ergänzung oder Präzisierung, die
die bisherigen Punkte unberührt lässt, oder die Antwort auf eine eigene offene Folgefrage ist
eine **neue Fassung**: Statuszeile, `(Fassung N)` an den neuen Stellen, eine Zeile in der
Änderungshistorie. Wird eine Aussage zurückgenommen oder umgekehrt, ist das ein neuer ADR mit
„abgelöst durch ADR-NNN“ am alten. **Ausnahme** (2026-09-13): Kehrt der Projektinhaber einen
einzelnen Punkt ausdrücklich um und bleiben die übrigen unberührt, DARF das eine neue Fassung
sein, wenn Status und Änderungshistorie die Umkehr benennen. Berührt eine Fassung die
Prinzipien, folgt `PROJECT_PRINCIPLES.md` in einem eigenen Commit mit neuer Version (§21). Wird
ein offener Punkt anderswo entschieden, bekommt er einen kursiven Erledigungsvermerk.

**Verdichtung** (2026-10-27, Aufräumen 5, Auftrag Jannes): Ein ADR DARF ohne neue Fassung
kürzer gefasst werden, wenn sich kein Inhalt ändert, alle Punktnummern und Fassungen bleiben und
die Änderungshistorie das vermerkt. Frühere und durchgestrichene Wortlaute stehen dann in Git
(`git log -p -- docs/adr/<datei>`). Das Gate begrenzt jede ADR-Datei auf 16 KB (ADR-017 40 KB,
ADR-023 18 KB, `DATEIGRENZEN`).

## Bestehende ADRs
Die Statusspalte nennt die geltende Fassung (Quelle des Gates); was jede Fassung änderte, steht
in der Änderungshistorie des ADR.

| ADR | Titel | Status |
|---|---|---|
| [ADR-001](ADR-001-online-first-limited-offline.md) | Online-first mit begrenzter Offline-Fähigkeit | Angenommen |
| [ADR-002](ADR-002-hosting-data-residency.md) | Hosting und Datenstandort | Angenommen |
| [ADR-003](ADR-003-organization-location-model.md) | organization_id und location_id im Datenmodell | Angenommen |
| [ADR-004](ADR-004-authorization-model.md) | Berechtigungsmodell | Angenommen, Fassung 2 (2026-09-13) |
| [ADR-005](ADR-005-provider-independent-ai.md) | Providerunabhängige KI-Anbindung | Angenommen, Fassung 2 (2026-09-08) |
| [ADR-006](ADR-006-medical-device-boundary.md) | Abgrenzung gegenüber Medical Device Software | Angenommen, Fassung 4 (2026-10-18) |
| [ADR-007](ADR-007-data-protection-impact-assessment.md) | Datenschutz-Folgenabschätzung und Datenschutzprozess | Angenommen |
| [ADR-008](ADR-008-data-retention-and-deletion.md) | Aufbewahrung und Löschung personenbezogener Daten | Angenommen, Fassung 7 (2026-10-26) |
| [ADR-009](ADR-009-private-billing-model.md) | Privatabrechnung | Angenommen, Fassung 6 (2026-10-14) |
| [ADR-010](ADR-010-audit-and-privileged-access.md) | Audit-Logging und privilegierter Produktionszugriff | Angenommen, Fassung 5 (2026-10-20) |
| [ADR-011](ADR-011-logging-and-observability.md) | Logging und Observability | Angenommen, Fassung 2 (2026-10-03) |
| [ADR-012](ADR-012-backup-and-business-continuity.md) | Backup, Wiederherstellung und Betriebskontinuität | Angenommen, Fassung 2 (2026-10-03) |
| [ADR-013](ADR-013-ci-cd-and-release-governance.md) | CI/CD und Release-Governance | Angenommen, Fassung 9 (2026-10-31) |
| [ADR-014](ADR-014-foundational-data-model.md) | Grundlegende Datenmodell-Entscheidungen | Angenommen, Fassung 2 (2026-09-23) |
| [ADR-015](ADR-015-initial-technical-stack.md) | Initialer technischer Stack | Angenommen; Punkt 16 abgelöst durch ADR-024 (2026-10-11) |
| [ADR-016](ADR-016-clinical-documentation-record.md) | Klinische Dokumentation: Entwurf, Finalisierung, Änderbarkeit | Angenommen, Fassung 4 (2026-10-14) |
| [ADR-017](ADR-017-file-storage.md) | Dateiablage: Ort, Zugriff, kurzlebige Verweise, Aufbewahrung, Virenprüfung | Angenommen bis Fassung 12 (2026-10-20), Fassung 9 vorgeschlagen |
| [ADR-018](ADR-018-appointment-states.md) | Zustandsautomat des Termins | Angenommen, Fassung 5 (2026-10-14) |
| [ADR-019](ADR-019-map-service.md) | Kartendienst: In-App-Karte, Fahrradrouting, Fahrzeiten, Navigations-Handoff | Angenommen, Fassung 7 (2026-10-26) |
| [ADR-020](ADR-020-treatment-basis.md) | Behandlungsgrundlage: Verordnung und Selbstzahler unter einer Klammer | Angenommen, Fassung 2 (2026-10-14) |
| [ADR-021](ADR-021-service-areas-and-legal-relationships.md) | Leistungsbereiche und Rechtsverhältnisse: Behandlung und Training getrennt | Angenommen, Fassung 4 (2026-10-18) |
| [ADR-022](ADR-022-appointment-context-and-training-basis.md) | Terminkontext und Trainingsgrundlage: ein Kalender, ein Kontext je Termin | Angenommen (2026-09-20) |
| [ADR-023](ADR-023-platform-access.md) | Plattformzugang: Konto je Person, Zugang je Verhältnis, Vertretung als eigene Beziehung | Angenommen, Fassung 8 (2026-10-27) |
| [ADR-024](ADR-024-offline-and-notifications.md) | Offline-Erfassung und Benachrichtigungen: schmaler Service Worker, Dokumentation und Durchführung ohne Netz, Mitteilungen ohne Inhalt | Angenommen, Fassung 3 (2026-10-27) |
| [ADR-025](ADR-025-session-lock.md) | Sitzungssperre: erneute Freigabe nach 60 Minuten und nach Inaktivität, serverseitig durchgesetzt | Angenommen, Fassung 4 (2026-10-11) |
| [ADR-026](ADR-026-malware-scanning.md) | Virenprüfung der Anhänge von außen: Prüfdienst in Deutschland, Prüfung vor `ready`, Ausfall heißt kein `ready` | Abgelehnt (2026-10-15) |
| [ADR-027](ADR-027-nutrition-counselling.md) | Ernährungsberatung als Zusatz zu Behandlung und Training, mit klassischem Ernährungstagebuch | Angenommen (2026-10-18) |
