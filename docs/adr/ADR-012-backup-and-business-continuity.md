# ADR-012: Backup, Wiederherstellung und Betriebskontinuität

## Status

Angenommen

## Datum

2026-08-28

## Kontext

§3.4 von `PROJECT_PRINCIPLES.md` verbietet den Eigenbau einer Backup-Engine,
nennt aber keine Anforderungen. §13 verbietet den unbemerkten Verlust von
Dokumentation. §16 stellt Patientensicherheit an die Spitze — und in einem
System, das den Praxisalltag trägt, bedeutet Patientensicherheit vor allem
Verfügbarkeit und Wiederherstellbarkeit der Daten.

Zwei Risiken sind hier eng verbunden und blieben bisher unbeantwortet.

Das erste ist der Datenverlust. Ohne Zielwerte für Wiederherstellungspunkt und
Wiederherstellungszeit lässt sich keine Infrastruktur bewerten, und ein
Backup, dessen Rückspielung nie getestet wurde, ist eine Annahme, kein Backup.

Das zweite ist der Bus-Faktor. Die Praxis wird täglich von Software abhängen,
die zunächst eine Person baut und betreibt. Fällt diese Person aus, entscheidet
allein die Dokumentation darüber, ob der Betrieb weitergeführt werden kann.
Das ist nach §16 kein organisatorisches Nebenthema, sondern ein
Patientensicherheitsthema.

Dieser ADR schließt die offenen Punkte E1, E2 und E3. Er ergänzt
[ADR-008](ADR-008-data-retention-and-deletion.md), der bereits regelt, wie mit
gelöschten Daten in Backups umzugehen ist.

## Entscheidung

### Zielwerte

1. Für produktive Kerndaten gelten initial **RPO ≤ 1 Stunde** und
   **RTO ≤ 4 Stunden**.
2. Die konkrete Infrastruktur **MUSS diese Zielwerte unterstützen**, oder vor
   Produktivstart **MUSS eine neue ADR die Abweichung begründen**.

### Sicherung

3. **Produktionsdaten MÜSSEN verschlüsselt gesichert werden.**
4. Für die zentrale Datenbank **sollen Point-in-Time-Recovery beziehungsweise
   vergleichbare Managed-Backup-Funktionen** genutzt werden.
5. **Datei- und Objektspeicher benötigt eine eigenständige Backup- und
   Versionierungsstrategie.**

### Wiederherstellung

6. Ein **vollständiger Restore MUSS vor Go-live erfolgreich in einer
   isolierten Umgebung getestet werden**.
7. Danach **SOLL mindestens vierteljährlich ein dokumentierter Restore-Test**
   stattfinden.

### Betriebskontinuität

8. Der Praxisbetrieb benötigt ein **dokumentiertes Degraded-/Outage-Verfahren**.
9. Für den Arbeitstag benötigte Kerninformationen sollen so bereitgestellt
   werden können, dass **ein mehrstündiger zentraler Dienstausfall den
   Praxisbetrieb nicht vollständig verhindert**.

### Betreibbarkeit bei Bus-Faktor 1

10. Mindestens dokumentiert sein **MÜSSEN**:
    - Infrastrukturkomponenten
    - Provider
    - Domains und DNS
    - Deployment
    - Backup und Restore
    - Secret-Management
    - Benutzer- und Zugriffsverwaltung
    - Incident-Prozess
    - Datenbankmigrationen
    - E-Mail
    - Maps
    - KI
    - Monitoring
11. **Kritische Betriebsabläufe dürfen nicht ausschließlich von
    undokumentiertem Wissen des Entwicklers abhängen.**

## Konsequenzen

- RPO und RTO werden zu Auswahlkriterien der Infrastruktur, nicht zu
  nachträglichen Wünschen. Ein Anbieter, der stündliche Wiederherstellungspunkte
  nicht hergibt, scheidet aus oder erzwingt einen begründenden ADR. Damit ist
  die Bewertung aus [ADR-002](ADR-002-hosting-data-residency.md) um harte
  technische Zielwerte ergänzt.
- Ein RPO von einer Stunde bedeutet im schlimmsten Fall den Verlust einer
  Stunde Dokumentation. Das ist mit §13 vereinbar, weil es sich um einen
  Katastrophenfall handelt und nicht um den Normalbetrieb — im Normalbetrieb
  darf nichts verloren gehen. Die Offline-Warteschlange aus
  [ADR-001](ADR-001-online-first-limited-offline.md) kann diesen Verlust
  teilweise abfedern, ersetzt aber kein Backup.
- Der verpflichtende Restore-Test vor Go-live macht aus einer Annahme einen
  Nachweis. Er ist zugleich der einzige Weg, den RTO-Wert zu belegen statt zu
  behaupten.
- Der vierteljährliche Wiederholungstest ist als SOLL gefasst und dennoch der
  praktische Kern: Backups verfallen still, wenn Schema, Berechtigungen oder
  Abhängigkeiten sich ändern.
- Jeder Restore ist nach ADR-008 ein zweistufiger Vorgang — Rückspielung, dann
  Nachziehen aller zwischenzeitlich wirksam gewordenen Löschungen. Der
  Restore-Test MUSS diesen zweiten Schritt einschließen, sonst prüft er nur
  die halbe Wahrheit.
- Der eigene Backup-Weg für Objektspeicher verhindert eine häufige Lücke:
  Datenbank-Backups sichern keine Dateien. Befunde, Berichte, Belege und
  Rechnungsdokumente liegen dort und unterliegen teils zehnjährigen Fristen.
- Das Degraded-Verfahren ist ein Praxisprozess, kein Softwarefeature. Es
  verlangt jedoch, dass die Anwendung die Bereitstellung der Tagesinformationen
  unterstützt — was sich mit der begrenzten Offline-Fähigkeit aus ADR-001
  deckt und ihr einen zweiten Zweck gibt.
- Die Dokumentationsliste ist eine harte Anforderung mit dreizehn prüfbaren
  Positionen. Ihre Vollständigkeit ist auditierbar; ihre Aktualität nicht
  automatisch, weshalb sie an Änderungen der Infrastruktur gekoppelt werden
  muss.
- Der Satz zum undokumentierten Wissen verändert die Arbeitsweise: Ein manuell
  im Anbieterportal geklickter Betriebsschritt ist erst dann zulässig, wenn er
  dokumentiert ist. Das erhöht den Aufwand jeder Betriebsänderung bewusst.

## Bewusst nicht Bestandteil dieser Entscheidung

- Die Auswahl von Hosting-, Datenbank- und Objektspeicheranbieter.
- Backup-Aufbewahrungsdauer, Generationenkonzept und Ablageort der Backups.
  ADR-008 verweist auf den „definierten Backup-Lebenszyklus"; dieser ist damit
  weiterhin zu definieren.
- Georedundanz und Ausfallsicherheit im Sinne von Hochverfügbarkeit. RTO ist
  eine Wiederanlaufzeit, keine Zusage unterbrechungsfreien Betriebs.
- Der Inhalt des Degraded-Verfahrens als Praxisprozess.
- Monitoring- und Alarmierungswerkzeuge.
- Vertretungsregelung und Notfallübergabe als personelle Maßnahme.
- Die Form der Betriebsdokumentation.

## Offene Folgefragen

- Wie lange werden Backups aufbewahrt, in wie vielen Generationen, und wo
  liegen sie? Das ist die von ADR-008 vorausgesetzte Definition.
- Wer verwahrt die Zugangsdaten für den Notfall, wenn die einzige betreibende
  Person ausfällt, und wie wird dieser Zugang selbst abgesichert?
- Welche Kerninformationen genau muss das Degraded-Verfahren bereitstellen —
  Tagesplan, Adressen, Telefonnummern, offene Dokumentation?
- Wie wird der Restore-Test dokumentiert, und was gilt als bestanden?
- Wie wird sichergestellt, dass die Betriebsdokumentation bei
  Infrastrukturänderungen mitgeführt wird?
- Gilt RPO ≤ 1 Stunde auch für Objektspeicher, oder nur für die Datenbank?
- Wie verhält sich der RTO-Wert zu einem Ausfall des Identitätsanbieters oder
  eines anderen externen Dienstes, den wir nicht wiederherstellen können?
