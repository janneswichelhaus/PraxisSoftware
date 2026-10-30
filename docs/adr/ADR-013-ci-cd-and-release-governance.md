# ADR-013: CI/CD und Release-Governance
## Status
Angenommen (2026-08-28), Fassung 8 (2026-10-30); schließt E7.

## Kontext
Entschieden wird, wie §12, §3.3 und §11 ohne zweiten Reviewer automatisiert durchgesetzt werden und
ein Agent, der Code schreibt, von der Produktion getrennt bleibt. Bewusst nicht Bestandteil: Wahl
von CI-Plattform, Linter, Testframework und Scannern; Sprache, Framework, Buildsystem; Umgebungs-
und Branch-Strategie über den Schutz von `main` hinaus; Deployment-Verfahren, Rollback,
Release-Kadenz; Abdeckungsziele und Testarten; Schwellen und Fristen für Befunde der Scanner
(Schwelle `high`: ANN-054); ob und wie ein Notfall-Merge-Weg eingerichtet wird.

## Entscheidung
1. **Ab dem ersten Anwendungscode ist CI verpflichtend.**
2. **Pflichtprüfungen.** Jede Änderung MUSS vor dem Merge in `main` mindestens diese
   automatisierbaren Prüfungen bestehen: (1) Format/Lint, (2) Typecheck, (3) automatisierte Tests,
   (4) erfolgreicher Build, (5) Datenbank-/Migrationstest, sobald Datenbankmigrationen existieren,
   (6) Berechtigungs-/RLS-Tests, sobald entsprechende Policies existieren, (7) Secret Scanning, (8)
   Dependency Vulnerability Scan, (9) statische Sicherheitsanalyse, (10) Prüfung der Dokumentation
   (Fassung 3): Obergrenzen der Steuerungsdokumente, ein Anker im Code je Annahme des Registers,
   keine toten relativen Verweise. **Reine Dokumentation** (Fassungen 5 und 8): Ändert oder ergänzt
   ein Pull Request nur Markdown unter `docs/` oder im Wurzelverzeichnis, das kein Test liest, und
   löscht nichts (`scripts/nur-doku.mjs` in der Fassung des Zielbranchs), laufen im Pull Request nur
   das Format der geänderten Dateien aus (1), (7), (8), (10) und das Migrationen-Gate; Lint mit (9),
   Typecheck (2) und (3) bis (6), deren Ergebnis dort das von `main` ist, laufen nach dem Merge auf
   `main`. Im Zweifel (die Erkennung scheitert, eine Datei passt nicht) läuft alles.
3. **Der `main`-Branch wird geschützt.**
4. **Force Push auf `main` ist nicht erlaubt.**
5. **Fehlgeschlagene verpflichtende CI-Checks blockieren den regulären Merge.** Ein Notfallweg ist
   nicht eingerichtet; falls doch, ist er ein privilegierter Vorgang nach ADR-010 (Begründung, Audit).
6. **Produktionsdeployments dürfen ausschließlich aus einem definierten freigegebenen Stand erfolgen
   und benötigen eine bewusste menschliche Freigabe.**
7. **KI-Coding-Agenten dürfen nicht autonom auf Produktion deployen.**
8. **Kein künstliches verpflichtendes Zwei-Personen-Review**, da zunächst eine Person entwickelt;
   kritische Änderungen erhalten stattdessen eine dokumentierte Review-Checkliste.
9. **Kritische Änderung und Review-Checkliste** (Fassung 2). Kritisch ist eine Änderung, die eine in
   §12 als besonders kritisch genannte Funktion berührt (Wortlaut dort) oder mindestens einen dieser
   technischen Auslöser: eine Migration in `supabase/migrations/`, auch eine reine Datenmigration;
   eine RLS-Policy oder eine `SECURITY DEFINER`-Funktion; einen neuen oder geänderten RPC-Aufruf in
   `src/features/**/api.ts` (Fassung 6); Authentifizierung, Sitzungen, Rollen oder Sichtbarkeit
   zwischen Rollen; den Auditkatalog oder einen Audit-Lesepfad (ADR-010); den Retention Schedule,
   eine Datenklasse oder einen Löschpfad (ADR-008); Rechnungsdaten, Leistungen oder Zahlungen
   (ADR-009); einen externen Datenfluss oder einen Anbieter (ADR-002, ADR-005, ADR-019); ein neues
   personenbezogenes Feld oder eine neue Datenklasse. Maßgeblich ist, was der Diff berührt, nicht,
   was eine spätere Funktion einmal bräuchte. Liste und Checkliste stehen nur hier; wer sie braucht,
   verweist auf diesen Punkt, und jede Änderung daran ist eine neue Fassung dieses ADR. Wo die
   Checkliste im Ablauf sitzt, steht in `CLAUDE.md` („Arbeitsweise“, K1) und den Skills
   `feature-loop` (Abschnitt D) und `bereich` (Fassung 7). Für jede kritische Änderung wird die
   Checkliste abgearbeitet und im Abschlussbericht je Punkt mit Ergebnis genannt: ein nicht
   berührter Punkt als „entfällt“ mit Begründung; ein nicht erfüllter Punkt ist ein Befund, der
   behoben wird, keine „bekannte Einschränkung“. Nr. 1 bis 7, 9 und 10 werden vor dem
   Abschlussbericht des Loops erfüllt, Nr. 8 vor dem Merge:
   1. Jede neue oder geänderte Policy hat Negativtests in `pnpm test:db`: andere Organisation, Rolle
      ohne Recht, Patientenkonto; (Fassung 4) dazu **fremde Person** (ein Konto von Patient:in oder
      Kund:in sieht keine Daten einer anderen Person) und **anderer Leistungsbereich** (§4.8), wo
      die Policy Daten eines Bereichs trägt.
   2. Jede `SECURITY DEFINER`-Funktion setzt `search_path = ''`, prüft Rolle und Organisation selbst
      und schreibt ihren Auditeintrag in derselben Transaktion.
   3. Projektionen liefern nur die Spalten, die die Rolle nach §4 sehen darf; nichts wird
      ausgeliefert und im Client ausgeblendet (§4.7).
   4. Jede neue Tabelle hat Datenklasse und Frist (`COMMENT`, `retention_assignments`) und Löschtest.
   5. Keine Namen und keine klinischen Inhalte in URL, Logs und Audit-Kontext (ADR-011).
   6. Jede Annahme steht im Register mit Anker im Code; keine fällt in die Hard-Stop-Liste aus §15.1.
   7. Externe Datenflüsse nur nach Prüfung (ADR-002); in Dev und Test gegen Mock.
   8. Migration mit Datenumzug, Rechnungsausstellung, Nummernkreis, Löschung, neue oder geänderte
      Policy oder `SECURITY DEFINER`-Funktion: **Zweitreview in frischem Kontext vor dem Merge**, in
      derselben Session durch einen Review-Subagenten mit eigenem Kontext, der nur den Diff und
      diese Checkliste als Auftrag bekommt; ist das nicht möglich, in einer eigenen Review-Session.
      Modell und Aufwand richten sich nach `.claude/settings.json` und `CLAUDE.md` („Arbeitsweise“,
      Fassung 7). Der Pull Request wartet bis dahin auf den Merge durch den Projektinhaber
      (Fassung 3). Befunde daraus werden ein eigener Loop.
   9. Rechnungsdaten: Snapshot, Unveränderbarkeit, Storno-Kette (ADR-009).
   10. `pnpm test:db` und die vollständige Suite auf dem Endstand; angemeldete E2E-Prüfungen, wo
       Docker verfügbar ist.

## Konsequenzen
- Prüfungen und Checkliste ersetzen das fehlende Vier-Augen-Prinzip und sind keine Kür: Ein
  Abschlussbericht ohne Antwort je Punkt ist bei einer kritischen Änderung unvollständig. Die
  Auslöser gehen bewusst über §12 hinaus, sonst griffen Nr. 1, 4 und 7 nie. Die Prüfungen bleiben
  schnell und parallel (ANN-571, Fassung 5), als Betriebsziel, nicht als Ausnahme von der Pflicht.
- Secret Scanning ersetzt nicht die Rotation eines geleakten Secrets. Punkt 7 und das Verbot von
  Produktionscredentials für Entwicklungswerkzeuge (§3.1, ADR-010 Punkt 12) sind gewollt redundant.

## Offene Folgefragen
- Wie werden Befunde behandelt, für die es keine Behebung gibt?
- Wie werden freigegebener Stand (Tag, Release, Commit) und Freigabe nachgewiesen? (OPS-002)
- Wer darf die Branch-Protection-Regeln ändern, und ist das nach ADR-010 auditpflichtig?
- Wie werden Datenbankmigrationen ohne Produktionsdaten getestet (§3.1)?
- Wie bleiben die Pflichtprüfungen schnell genug, damit sie nicht umgangen werden? (teilweise:
  ANN-571, Fassung 5)

## Änderungshistorie
- Fassung 1 (2026-08-28): angenommen.
- Fassung 2 (2026-09-13, Doku-Audit): „kritische Änderung“ definiert, Review-Checkliste (Punkt 9).
- Fassung 3 (2026-09-15): Dokumentationsprüfung als zehnte Prüfung, Merge durch den Projektinhaber.
- Fassung 4 (2026-09-23): Negativfälle „fremde Person“ und „anderer Leistungsbereich“ (Punkt 9 Nr. 1).
- Fassung 5 (2026-10-16, Jannes): Pull Requests nur mit Doku ohne Tests, Build, Datenbankprüfungen.
- Fassung 6 (2026-10-27, redaktionell): RPC-Auslöser `src/features/**/api.ts` (Domänenordner).
- Fassung 7 (2026-10-27, redaktionell): Verweise in Punkt 9 auf `CLAUDE.md` und Skills.
- Fassung 8 (2026-10-30, Jannes): reine Doku ohne Lint und Typecheck, Format nur der Änderung.
- Verdichtet 2026-10-27 (Aufräumen 5), Inhalt unverändert; früherer Wortlaut: `git log -p`.
