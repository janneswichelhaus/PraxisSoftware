# ADR-012: Backup, Wiederherstellung und Betriebskontinuität
## Status
Angenommen (2026-08-28), Fassung 2 (2026-10-03); schließt E1 und E3, ergänzt ADR-008.

## Kontext
Entschieden werden Zielwerte für Datenverlust und Wiederanlauf und der Betrieb bei Bus-Faktor 1 (§3.4,
§13, §16); E2 (Ausfallkonzept) bleibt offen. Bewusst nicht Bestandteil: Anbieterwahl, Generationen und
Ablageort der Backups, Georedundanz und Hochverfügbarkeit (RTO ist eine Wiederanlaufzeit, keine Zusage
unterbrechungsfreien Betriebs), Inhalt des Degraded-Verfahrens, Monitoring- und Alarmierungswerkzeuge,
Vertretung und Notfallübergabe als personelle Maßnahme, Form der Betriebsdokumentation.

## Entscheidung
1. **Zielwerte.** Für produktive Kerndaten gelten initial RPO ≤ 1 Stunde und RTO ≤ 4 Stunden.
2. **Infrastruktur.** Die konkrete Infrastruktur MUSS diese Zielwerte unterstützen, oder vor
   Produktivstart MUSS eine neue ADR die Abweichung begründen.
3. **Produktionsdaten MÜSSEN verschlüsselt gesichert werden.**
4. **Zentrale Datenbank:** PITR oder vergleichbare Managed-Backup-Funktionen sollen genutzt werden.
5. **Datei- und Objektspeicher benötigt eine eigenständige Backup- und Versionierungsstrategie;**
   das RPO gilt auch für Dateien (ADR-017 Punkt 26, OPS-003).
6. **Vor Go-live MUSS ein vollständiger Restore in isolierter Umgebung erfolgreich getestet werden.**
7. **Danach SOLL mindestens vierteljährlich ein dokumentierter Restore-Test stattfinden.**
8. **Der Praxisbetrieb benötigt ein dokumentiertes Degraded-/Outage-Verfahren,** einen
   Praxisprozess; die Anwendung unterstützt die Bereitstellung der Tagesinformationen (ADR-001).
9. **Kerninformationen** für den Arbeitstag sollen so bereitgestellt werden können, dass ein
   mehrstündiger zentraler Dienstausfall den Praxisbetrieb nicht vollständig verhindert.
10. **Dokumentiert sein MÜSSEN mindestens:** Infrastrukturkomponenten, Provider, Domains und DNS,
    Deployment, Backup und Restore, Secret-Management, Benutzer- und Zugriffsverwaltung,
    Incident-Prozess, Datenbankmigrationen, E-Mail, Maps, KI, Monitoring; sie wird mit jeder
    Infrastrukturänderung nachgeführt.
11. **Kritische Betriebsabläufe dürfen nicht nur von undokumentiertem Wissen des Entwicklers
    abhängen:** Ein Betriebsschritt im Anbieterportal ist erst zulässig, wenn er dokumentiert ist.
12. **Backups werden 30 Tage aufbewahrt** (Fassung 2). Das Löschjournal, mit dem Löschungen nach
    einem Restore nachgezogen werden (ADR-008 Punkt 8), lebt deshalb 60 Tage, Backupfrist plus 30
    Tage Puffer; ein längerer Backup-Lebenszyklus verlangt zuerst eine längere Journalfrist.

## Konsequenzen
- Im Katastrophenfall kann eine Stunde Dokumentation verloren gehen, im Normalbetrieb nichts (§13);
  die Offline-Warteschlange (ADR-001) federt ab, ersetzt aber kein Backup. Erst der Restore-Test
  belegt das RTO; er MUSS das Nachziehen der Löschungen einschließen (ADR-008 Punkt 8).

## Offene Folgefragen
- offen (OPEN_DECISIONS): Generationen, Ablageort, Notfallzugang, Restore-Test (OPS-003); E2 (G10).
- Wie wird die Betriebsdokumentation bei Infrastrukturänderungen mitgeführt?
- Wie verhält sich das RTO zum Ausfall des Identitätsanbieters oder eines anderen externen Dienstes?

## Änderungshistorie
- Fassung 1 (2026-08-28): angenommen.
- Fassung 2 (2026-10-03, Jannes, LOG-EPIC-001): Punkt 12, Backups 30 Tage, Löschjournal 60 Tage.
- Verdichtet 2026-10-27 (Aufräumen 5), Inhalt unverändert; früherer Wortlaut: `git log -p`.
