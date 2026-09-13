# ADR-013: CI/CD und Release-Governance

## Status

**Angenommen** (2026-08-28).

**Fassung 2 (2026-09-13)** — Punkt 9 definiert „kritische Änderung" und legt
die Review-Checkliste fest, die Punkt 8 seit Fassung 1 verlangt. Alle übrigen
Punkte gelten unverändert.

## Datum

2026-08-28 · Fassung 2: 2026-09-13

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
9. **Kritische Änderung und Review-Checkliste** (Fassung 2). Eine Änderung
   ist **kritisch**, wenn sie eine der in `PROJECT_PRINCIPLES.md` §12 als
   besonders kritisch genannten Funktionen berührt (Wortlaut dort) oder
   mindestens einen dieser technischen Auslöser:
   - eine Migration in `supabase/migrations/`, auch eine reine Datenmigration
   - eine RLS-Policy oder eine `SECURITY DEFINER`-Funktion
   - einen neuen oder geänderten RPC-Aufruf in `src/features/*/api.ts`
   - Authentifizierung, Sitzungen, Rollen oder Sichtbarkeit zwischen Rollen
   - den Auditkatalog oder einen Audit-Lesepfad (ADR-010)
   - den Retention Schedule, eine Datenklasse oder einen Löschpfad (ADR-008)
   - Rechnungsdaten, Leistungen oder Zahlungen (ADR-009)
   - einen externen Datenfluss oder einen Anbieter (ADR-002, ADR-005, ADR-019)
   - ein neues personenbezogenes Feld oder eine neue Datenklasse

   Maßgeblich ist, was der Diff der Änderung berührt — nicht, was eine
   spätere Funktion einmal bräuchte. Diese Liste steht nur hier; wer sie
   anderswo braucht, verweist auf diesen Punkt.

   Für jede kritische Änderung wird die folgende Checkliste abgearbeitet und
   im Abschlussbericht je Punkt mit Ergebnis genannt. Ein Punkt, dessen
   Gegenstand die Änderung nicht berührt, wird als „entfällt" mit Begründung
   genannt; ein nicht erfüllter Punkt ist ein Befund, der behoben wird, keine
   „bekannte Einschränkung". Die Punkte 1 bis 7, 9 und 10 werden vor dem
   Abschlussbericht des Loops erfüllt, Punkt 8 **vor dem Merge**:
   1. Jede neue oder geänderte Policy hat Negativtests in `pnpm test:db`:
      andere Organisation, Rolle ohne Recht, Patientenkonto.
   2. Jede `SECURITY DEFINER`-Funktion setzt `search_path = ''`, prüft Rolle
      und Organisation selbst und schreibt ihren Auditeintrag in derselben
      Transaktion.
   3. Projektionen liefern nur die Spalten, die die Rolle nach §4 sehen darf;
      nichts wird ausgeliefert und im Client ausgeblendet (§4.7).
   4. Jede neue Tabelle trägt Datenklasse und Frist (`COMMENT`,
      `retention_assignments`) und einen Löschtest.
   5. Keine Namen und keine klinischen Inhalte in URL, Logs und
      Audit-Kontext ([ADR-011](ADR-011-logging-and-observability.md)).
   6. Jede Annahme steht im Register und trägt ihren Anker im Code; keine
      fällt in die Hard-Stop-Liste aus §15.1.
   7. Externe Datenflüsse nur nach Prüfung
      ([ADR-002](ADR-002-hosting-data-residency.md)); in Dev und Test gegen
      Mock.
   8. Migration mit Datenumzug, Rechnungsausstellung, Nummernkreis, Löschung,
      neue oder geänderte Policy oder `SECURITY DEFINER`-Funktion:
      **Zweitreview in frischem Kontext vor dem Merge** — in derselben
      Session durch einen Review-Subagenten mit eigenem Kontext, der nur den
      Diff und diese Checkliste als Auftrag bekommt; ist das nicht möglich,
      in einer eigenen Review-Session (Opus 5 `xhigh`), und der Pull Request
      wird bis dahin ohne Auto-Merge geführt. Befunde daraus werden ein
      eigener Loop.
   9. Rechnungsdaten: Snapshot, Unveränderbarkeit, Storno-Kette
      ([ADR-009](ADR-009-private-billing-model.md)).
   10. `pnpm test:db` und die vollständige Suite auf dem Endstand; angemeldete
       E2E-Prüfungen, wo Docker verfügbar ist.

   Wo die Checkliste im Ablauf sitzt (Gate A4, Zweitreview A5), steht in
   `docs/development/GRAPH-ENGINEERING-WORKFLOW.md`; die Punkte selbst stehen
   nur hier. Eine Änderung an der Liste ist eine neue Fassung dieses ADR.

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
- ~~„Kritische Änderung" ist noch nicht definiert. Bis dahin bleibt §12 der
  Maßstab: Authentifizierung, Berechtigungen, Trennung zwischen
  Patientenaccounts, Dokumentationszuordnung, Dateizugriffe, KI-Datenflüsse und
  Rechnungsdaten.~~ *Beantwortet mit Punkt 9 (Fassung 2): §12 bleibt der Kern
  und ist um die technischen Auslöser ergänzt — bewusst weiter als die reine
  §12-Liste, weil die Punkte 1, 4 und 7 der Checkliste sonst nie greifen
  würden.*
- Die Checkliste in Punkt 9 ist bewusst eine Liste und kein Werkzeug. Ihre
  Wirkung hängt daran, dass der Abschlussbericht jedes Loops sie je Punkt
  beantwortet — ein Bericht ohne diese Antworten ist bei einer kritischen
  Änderung unvollständig. OPS-002 verankert sie später in der Pipeline; bis
  dahin ist Skill-Schritt F die Stelle, an der sie abgearbeitet wird.
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
- ~~Die Definition von „kritischer Änderung" und der Inhalt der
  Review-Checkliste.~~ *Seit Fassung 2 Bestandteil (Punkt 9).*
- Der Umgang mit Befunden der Scanner, insbesondere Schwellen und Fristen für
  Schwachstellen in Abhängigkeiten.
- Ob und wie ein Notfall-Merge-Weg eingerichtet wird.

## Offene Folgefragen

- ~~Was gilt als „kritische Änderung", und wie sieht die Review-Checkliste
  aus?~~ *Beantwortet mit Punkt 9 (Fassung 2, 2026-09-13).*
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

## Änderungshistorie

| Fassung | Datum | Änderung |
|---|---|---|
| 1 | 2026-08-28 | Angenommen. |
| 2 | 2026-09-13 | Punkt 9 neu: Definition „kritische Änderung" (§12 plus technische Auslöser) und die zehn Punkte der Review-Checkliste, die Punkt 8 seit Fassung 1 verlangt; Nr. 8 verlangt den Zweitreview in frischem Kontext vor dem Merge. Erledigungsvermerke in Konsequenzen, Abgrenzung und Folgefragen. Punkte 1 bis 8 unverändert. Anlass: Docs-Session „Dokumentations-Audit", Graph-Engineering-Workflow. |
