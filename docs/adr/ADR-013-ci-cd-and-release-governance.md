# ADR-013: CI/CD und Release-Governance

## Status

Angenommen

## Datum

2026-08-28

## Kontext

§12 von `PROJECT_PRINCIPLES.md` verlangt Tests für kritische Funktionen und
verbietet, Security oder Datenschutz zur schnellen Fertigstellung zu umgehen.
§3.3 verbietet Secrets im Code. §11 begrenzt, was Claude Code ohne expliziten
Auftrag tun darf. Keine dieser Anforderungen ist ohne automatisierte
Durchsetzung belastbar: Eine Regel, die nur im Kopf existiert, wird unter
Zeitdruck gebrochen.

Das gilt besonders bei einer Ein-Personen-Entwicklung. Der übliche
Schutzmechanismus — das Review durch eine zweite Person — steht nicht zur
Verfügung. Ein verpflichtendes Zwei-Personen-Review künstlich einzuführen,
indem dieselbe Person zweimal auf denselben Code schaut, erzeugt Bürokratie
ohne Schutzwirkung. Die Kontrolle muss deshalb aus der Automatisierung kommen.

Ein zweiter Punkt betrifft KI-gestützte Entwicklung. Ein Agent, der Code
schreiben darf, darf nicht denselben Weg bis in die Produktion gehen können.
Die Trennung zwischen „Änderung vorschlagen" und „Änderung produktiv setzen"
ist die entscheidende Grenze.

Der Zeitpunkt ist hier wesentlich: CI nachträglich einzuführen bedeutet, eine
gewachsene Codebasis gegen neu eingeschaltete Prüfungen zu sanieren. Ab dem
ersten Commit ist es beinahe kostenlos.

Dieser ADR schließt den offenen Punkt E7.

## Entscheidung

1. **Ab dem ersten Anwendungscode ist CI verpflichtend.**
2. Jede Änderung vor Merge in `main` **MUSS mindestens folgende
   automatisierbaren Prüfungen bestehen**:
   - Format/Lint
   - Typecheck
   - automatisierte Tests
   - erfolgreicher Build
   - Datenbank-/Migrationstest, sobald Datenbankmigrationen existieren
   - Berechtigungs-/RLS-Tests, sobald entsprechende Policies existieren
   - Secret Scanning
   - Dependency Vulnerability Scan
   - statische Sicherheitsanalyse
3. Der **`main`-Branch wird geschützt**.
4. **Force Push auf `main` ist nicht erlaubt.**
5. **Fehlgeschlagene verpflichtende CI-Checks blockieren den regulären Merge.**
6. **Produktionsdeployments dürfen ausschließlich aus einem definierten
   freigegebenen Stand erfolgen und benötigen eine bewusste menschliche
   Freigabe.**
7. **KI-Coding-Agenten dürfen nicht autonom auf Produktion deployen.**
8. Da das Projekt zunächst von einer Person entwickelt wird, ist **kein
   künstliches verpflichtendes Zwei-Personen-Review erforderlich**. Kritische
   Änderungen erhalten stattdessen eine **dokumentierte Review-Checkliste**.

## Konsequenzen

- Die neun Prüfungen sind der automatisierte Ersatz für das fehlende
  Vier-Augen-Prinzip. Sie sind der Grund, warum auf ein künstliches Review
  verzichtet werden kann, und deshalb keine Kür.
- Zwei Prüfungen sind bedingt formuliert und werden mit dem Projekt scharf:
  Migrationstests, sobald Migrationen existieren, und Berechtigungs-/RLS-Tests,
  sobald Policies existieren. Letztere sind die konkrete Einlösung der
  Testpflicht aus §12 und die Absicherung des Modells aus
  [ADR-004](ADR-004-authorization-model.md).
- Secret Scanning macht §3.3 durchsetzbar statt appellativ. Es wirkt
  präventiv, ersetzt aber nicht die Rotation eines dennoch geleakten Secrets.
- Der Schutz von `main` und das Force-Push-Verbot sichern die
  Nachvollziehbarkeit der Historie. Das ist die Voraussetzung dafür, dass
  „eine Codebasis ist die technische Wahrheit" (§11) auch rückblickend gilt.
- Die bewusste menschliche Freigabe für Produktionsdeployments ist die
  Trennlinie zwischen Entwicklung und Betrieb. Zusammen mit
  [ADR-010](ADR-010-audit-and-privileged-access.md) ergibt sich ein klares
  Bild: Ein Agent darf Code vorschlagen, ein Mensch entscheidet über
  Produktion, und privilegierter Produktionszugriff ist ein eigener,
  auditierter Vorgang.
- Das Verbot autonomer Agent-Deployments ist zusammen mit dem Verbot von
  Produktionscredentials für Entwicklungswerkzeuge (§3.1, ADR-010) redundant
  abgesichert. Diese Redundanz ist gewollt.
- Die Review-Checkliste für kritische Änderungen ist der ehrliche Ersatz für
  das nicht herstellbare Vier-Augen-Prinzip. Ihr Wert hängt daran, dass sie
  benannt, versioniert und tatsächlich abgearbeitet wird; andernfalls ist sie
  wirkungsloser als gar keine Regel.
- „Kritische Änderung" ist noch nicht definiert. Bis dahin bleibt §12 der
  Maßstab: Authentifizierung, Berechtigungen, Trennung zwischen
  Patientenaccounts, Dokumentationszuordnung, Dateizugriffe, KI-Datenflüsse und
  Rechnungsdaten.
- Neun Pflichtprüfungen kosten Laufzeit bei jeder Änderung. Langsame CI
  verführt zum Umgehen; die Prüfungen sollten deshalb schnell und parallel
  gehalten werden. Das ist ein Betriebsziel, keine Ausnahme von der Pflicht.
- Der Wortlaut „blockieren den **regulären** Merge" lässt einen Notfallweg zu.
  Ein solcher Weg ist damit nicht eingerichtet; falls er eingerichtet wird,
  ist er nach ADR-010 ein privilegierter Vorgang mit Begründung und Audit.

## Bewusst nicht Bestandteil dieser Entscheidung

- Die Wahl von CI-Plattform, Werkzeugen, Linter, Testframework und Scannern.
- Programmiersprache, Framework und Buildsystem.
- Umgebungs- und Branch-Strategie über den Schutz von `main` hinaus.
- Deployment-Verfahren, Rollback-Strategie und Release-Kadenz.
- Testabdeckungsziele und Testarten im Einzelnen.
- Die Definition von „kritischer Änderung" und der Inhalt der
  Review-Checkliste.
- Der Umgang mit Befunden der Scanner, insbesondere Schwellen und Fristen für
  Schwachstellen in Abhängigkeiten.
- Ob und wie ein Notfall-Merge-Weg eingerichtet wird.

## Offene Folgefragen

- Was gilt als „kritische Änderung", und wie sieht die Review-Checkliste aus?
- Welche Schweregrade eines Dependency-Scans blockieren einen Merge, und
  welche werden nur berichtet?
- Wie werden Befunde behandelt, für die es keine Behebung gibt?
- Wie wird der „definierte freigegebene Stand" für ein Produktionsdeployment
  technisch dargestellt — Tag, Release, geprüfter Commit?
- Wie wird die menschliche Freigabe nachgewiesen und aufbewahrt?
- Wie werden die verpflichtenden Prüfungen schnell genug gehalten, damit sie
  nicht umgangen werden?
- Wer darf die Branch-Protection-Regeln ändern, und ist diese Änderung nach
  ADR-010 auditpflichtig?
- Wie werden Datenbankmigrationen getestet, ohne Produktionsdaten zu
  verwenden (§3.1)?
