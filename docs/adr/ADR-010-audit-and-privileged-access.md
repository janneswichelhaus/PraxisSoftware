# ADR-010: Audit-Logging und privilegierter Produktionszugriff
## Status
Angenommen (2026-08-28), Fassung 5 (2026-10-20); Fassung 3 kehrte die Punkte 2, 6, 13, 14 um.

## Kontext
Offen waren C3, C4, C5, E4. §4.2 lässt alle Therapeut:innen einer Organisation alle Akten der
Organisation sehen; als Kontrolle bleibt die Nachvollziehbarkeit, die ADR-004 verlangt, ohne ihren
Umfang zu bestimmen. §3.2 und §4.1 verlangen individuelle Produktionskonten und getrennte
Administration; entwickelt und betreibt eine Person, bleiben nur Beschränkung, Begründung und
Protokollierung. Bewusst nicht Bestandteil: Schema und Speicherort der Einträge, Identitätsanbieter
und MFA-Verfahren (§3.4), Umsetzung zeitlich begrenzter Rechte, Betriebs- und Alarmierungsschwellen
für Security-Ereignisse.

## Entscheidung
1. **Pflicht.** Die Plattform verwendet ein verbindliches Audit-Logging für sensible Aktionen.
2. *Entfallen (Fassung 3):* der Mindestkatalog; es gilt Punkt 16, Schreibvorgänge belegt Punkt 15.
3. **Nur Metadaten.** Audit-Einträge enthalten nur die zur Nachvollziehbarkeit erforderlichen
   Metadaten und keine vollständigen klinischen Inhalte.
4. **Unveränderbar.** Audit-Einträge dürfen durch den normalen Anwendungspfad nicht geändert oder
   gelöscht werden: Die Anwendung hat dafür kein Update und kein Delete, gelöscht wird nur im
   Löschlauf (ADR-008); das ist eine Anforderung an Schema und Datenbankrechte, nicht nur an den Code.
5. **Frist.** Die initiale Aufbewahrungsfrist beträgt gemäß ADR-008 drei Jahre.
6. *Entfallen (Fassung 3):* der monatliche Audit-/Security-Report; Auswertung bei Anlass (Punkt 19).
7. **Kein klinischer Break Glass in V1:** Alle Therapeut:innen einer Organisation dürfen alle
   Patientenakten der Organisation sehen (§4.2), für reguläre Patientenzugriffe braucht es ihn daher
   nicht.
8. **Break Glass** bezeichnet in diesem Projekt ausschließlich privilegierten technischen
   Produktionszugriff für Störungs- oder Sicherheitsfälle.
9. **Direkter Produktions-Datenbankzugriff durch Menschen ist im Normalbetrieb nicht erlaubt;**
   Datenkorrekturen laufen über Migrationen oder Funktionen der Anwendung, nicht über eine Konsole.
10. **Privilegierter Produktionszugriff MUSS** anlassbezogen begrenzt, individuell authentifiziert,
    mit MFA, begründet und auditierbar sein und nach Abschluss entzogen oder beendet werden; bei
    Bus-Faktor 1 wird er nachträglich bei Anlass ausgewertet (Punkt 19), nicht vorher freigegeben.
11. **Praxis-Alltagskonten und technische Infrastruktur-Admin-Konten sind getrennte
    Berechtigungsdomänen,** also zwei Identitäten derselben Person.
12. **Coding- und KI-Entwicklungswerkzeuge erhalten niemals Produktionscredentials oder -daten.**
13. **Lesen des Auditlogs** (Fassung 2). In V1 liest allein die Rolle `owner`, nur über
    `list_audit_events` (eigene Organisation, Pagination, Filter nach Zeitraum, Benutzer und Aktion)
    und ohne die Spalte `context` außer Operation und Zähler einer Abweisung (Fassung 3). Das Lesen
    wird nicht protokolliert (Umkehr, Fassung 3); die Beschäftigten schützt die Zweckbindung
    (Punkt 20). Keine Rolle liest die Tabelle direkt per `SELECT`.
14. **Dateien** (Fassung 2, Umkehr in Fassung 3): Protokolliert wird das Herunterladen
    (`patient_file.downloaded`), nicht das Anzeigen (ADR-017 Punkt 55) oder ein signierter Verweis.
15. **Das Datenmodell ist die Nachweisführung** (Fassung 3, ebenso 16 bis 21). Wer was wann angelegt,
    geändert, finalisiert, ausgestellt, storniert oder abgesagt hat, zeigen die Fachtabellen
    (`created_by`, `finalized_by`, `issued_by`, `cancelled_by`, Versionstabelle nach ADR-016); das
    Auditlog hält nur, was das Datenmodell nicht abbildet, übrige Lücken sind hingenommen (ANN-230).
16. **Abschließender Katalog** (`supabase/audit-aktionen.txt`, 27 Aktionen; Fassung 5): Akte
    geöffnet (Detailansicht, nicht Trefferliste), höchstens einmal je Person, Akte und Kalendertag
    der Praxis (`patient_record.viewed`, `training_relationship.viewed`); Datei durch ein
    Praxiskonto heruntergeladen (`patient_file.downloaded`), nicht der Abruf über die Plattform
    (Punkt 22, Fassung 4); Exporte: Auskunft nach Art. 15 DSGVO, Therapiebericht drucken oder
    exportieren, Foto an die Person herausgeben, Foto oder Video an einer Rückfrage (Fassung 5,
    ADR-017 Punkt 96); Portal: Vertretung liest (einmal je Tag und Akte), Zugang eingeladen,
    aktiviert, gesperrt, entsperrt, entzogen; Konten und Rechte (`staff_account.*`, `account.*`,
    `organization.bootstrapped`); abgewiesene Zugriffe (`access.denied`), gleichartige binnen zehn
    Minuten in einem Eintrag mit Zähler; Löschlauf (`retention.applied`) je Lauf zusammengefasst.
17. **Neue Protokollierung nur mit ADR-010-Änderung und ausdrücklicher Freigabe des Projektinhabers.**
    Die CI lehnt Katalogänderungen ohne Label `freigabe-audit` ab, das nur er setzt.
18. **Fristen:** Lese- und Sicherheitsereignisse zwölf Monate, übrige drei Jahre, unabhängig von der
    Akte (ADR-011 Punkt 4, ADR-008, ANN-029); ein Legal Hold hält jeden Eintrag seiner Akte. Kein
    Freitext im Kontext.
19. **Auswertung bei Anlass:** Verdacht, Beschwerde, Auskunftsersuchen; nicht regelmäßig, kein Report.
20. **Zweckbindung:** Protokolle dienen ausschließlich Datenschutz und Sicherheit, nie der
    Leistungs- oder Verhaltenskontrolle von Mitarbeitenden (§20).
21. **Risikoabwägung nach Art. 32 DSGVO.** Die Praxis ist klein, die Rollen wenige und bekannt, das
    Protokoll liest allein der Inhaber. Die Akte ist unveränderlich (Korrektur nur als neue Version
    mit Urheber und Zeitpunkt, § 630f BGB; Rechnungen nur per Storno), also beweist das Datenmodell
    jeden Schreibvorgang. Für das Lesen genügt, wer an welchem Tag in welcher Akte war
    (Art. 15 DSGVO, Verdachtsfälle). Abweisungen und Kontoereignisse bleiben: Nur sie zeigen Angriffe
    und Fehlbedienung. Weniger Protokoll senkt dessen eigenes Risiko (Art. 5 Abs. 1 lit. c DSGVO).
22. **Abruf über die Plattform** (Fassung 4). Ruft die Person ein freigegebenes Dokument ab,
    entsteht kein eigener Auditeintrag; nachgewiesen ist die Freigabe am Datensatz (`released_at`,
    `released_by`; Punkt 15), wie ADR-023 Punkt 24 das eigene Lesen nicht protokolliert (Art. 5
    Abs. 1 lit. c DSGVO). Ruft eine Vertretung ab, bleibt es beim Eintrag „Vertretung liest“
    (Punkt 16), höchstens einmal je Person, Akte und Tag; er zählt als Lesen, nicht als
    Herunterladen, mit der Frist der Leseereignisse (Punkt 18).

## Konsequenzen
- Das Auditlog ist keine Zweitkopie der Akte, aber sensibel (wer ist bei wem in Behandlung) und
  unterliegt ADR-004; seit E15 liest Office klinische Inhalte, der Katalog gilt für Office ganz.
- Wird §4.2 eingeschränkt, braucht es einen klinischen Break Glass als eigenen ADR (Blockieren im
  Zweifel: §13). Offline entsteht kein neues Auditereignis (ADR-024 Punkt 6). Ein
  Datenschutzbeauftragter nach ADR-007 wäre die erste unabhängige Instanz für die Auswertung.

## Offene Folgefragen
- Wird die Unveränderbarkeit durch Datenbankrechte, Append-only-Strukturen oder beides abgesichert?
- Wie wird Break Glass ausgelöst und entzogen, ohne vom Wohlwollen der zugreifenden Person abzuhängen?

## Änderungshistorie
- Fassung 1 (2026-08-28): angenommen.
- Fassung 2 (2026-09-13, E15): Punkte 13 (Lesepfad) und 14 (Dateien); Office liest klinische Inhalte.
- Fassung 3 (2026-10-03, Jannes, LOG-EPIC-001): Umkehr der Punkte 2, 6, 13, 14; Datenmodell als
  Nachweis, abschließender Katalog von 26 Aktionen, Auswertung bei Anlass (Punkte 15 bis 21).
- Fassung 4 (2026-10-09, Jannes, BEF-138): Punkt 22, Abruf über die Plattform ohne Protokoll.
- Fassung 5 (2026-10-20, Jannes, BEF-188): Anhang einer Rückfrage als 27. Aktion (`freigabe-audit`).
- Verdichtet 2026-10-27 (Aufräumen 5), Inhalt unverändert; früherer Wortlaut: `git log -p`.
