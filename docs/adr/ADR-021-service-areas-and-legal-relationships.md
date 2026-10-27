# ADR-021: Leistungsbereiche und Rechtsverhältnisse — Behandlung und Training getrennt
## Status
Angenommen 2026-09-20 (Jannes, E18), geltend Fassung 4 (2026-10-18); Protokoll nur nach ADR-010.

## Kontext
Behandlung und Training teilen eine Anwendung; Training ist keine Heilbehandlung, und eine Person
kann Behandlungs- (§ 630a BGB) und Trainingsvertrag (§ 611 BGB) zugleich haben (E18, §1.2). Nicht
Gegenstand: Terminkontext (ADR-022), Steuer (ADR-009), MDR (ADR-006), Trainingsrolle (§4.9),
Trainingsbereich (E18 Abschnitt 6), Schema (ADR-014), Einwilligungsverwaltung (ADR-007).

## Entscheidung
1. **Getrennt wird nach Rechtsverhältnis, nicht nach Person.** Eine Person kann beide Verhältnisse
   zugleich haben; das Datenmodell **erzwingt** die Trennung, es bildet sie nicht nur ab.
2. **Das Trainingsverhältnis entsteht additiv neben dem Behandlungsverhältnis:** `patients` ist das
   Behandlungsverhältnis und wird nicht aufgeteilt; daneben steht `training_relationships`,
   `persons` bleibt unverändert. Die Bereiche heißen `therapy` und `training`.
3. **Die einzige Verbindung zwischen beiden Verhältnissen ist `person_id`:** keine Fremdschlüssel
   zwischen den Verhältnistabellen und keiner zwischen ihren Fachdaten.
4. **Rechtsgrundlage, Datenklasse und Frist hängen am Verhältnis:** Behandlung Art. 9 Abs. 2 lit. h
   DSGVO i. V. m. § 630f BGB, zehn Jahre ab Abschluss (ADR-008); Training Art. 6 Abs. 1 lit. b DSGVO
   für Vertragsdaten und ausdrückliche Einwilligung nach Art. 9 Abs. 2 lit. a DSGVO für Screening
   und Gesundheitsangaben (lit. h trägt nicht), drei Jahre ab Vertragsende (§ 195 BGB), Screening
   früher; `persons` folgt dem längsten Verhältnis. Training hat eine eigene Datenklasse und den
   Anker `contract_ended_on`, rücknehmbar wie `care_concluded_on`; ohne Anker läuft keine Frist.
5. **Erste harte Regel: Fachdaten hängen immer an einem Verhältnis, nie direkt an `persons`;** eine
   Tabelle, die nur `person_id` trägt und Fachliches enthält, ist ein Mangel, kein Sonderfall.
6. **Zweite harte Regel: kein Durchgriff.** Wer nur die Trainingsrolle hat, sieht keine Befunde, und
   umgekehrt; durchgesetzt per RLS, nicht in der Oberfläche (ADR-004 Punkt 5). Der offene
   Aktenzugriff aller Therapeut:innen (§4.2, ADR-004 Punkt 2) gilt nur in der Behandlung.
7. **Dritte harte Regel: Befunddaten nur als dokumentierte Kopie ins Training**, mit Einwilligung,
   nie als Referenz (Art. 5 Abs. 1 lit. b DSGVO); die Kopie ist ein Trainingsdatum mit dessen Frist.
8. **Für beide Bereiche gilt einheitlich das strengere § 203-Niveau** (§ 203 Abs. 1 Nr. 1 StGB): Für
   reine Trainingsdaten greift § 203 StGB nicht, aber Screening-Daten machen die Grenze im Betrieb
   unscharf. Es gilt ein Niveau, das höhere, für Zugriffsschutz, Auditpflicht (ADR-010) und
   Dienstleister, die nach § 203 Abs. 3 StGB zusätzlich zum AVV zur Geheimhaltung verpflichtet
   werden (ADR-002). Für Klarnamen gilt §1.1: keine zwei Datenschutzniveaus in einer Anwendung.
9. **Sprachregelung für alle Folgedokumente:** „PT“ wird nicht als Abkürzung benutzt; es heißt
   Physiotherapie oder Personal Training.
10. **Das Büro liest im Training alles, schreibt aber nichts Fachliches** (Fassung 3): Es ist dort
    organisatorisch tätig (§4.3, §4.8) und liest alle Informationen eines Trainingsverhältnisses
    (Protokoll und Zustand, Voraussetzungsprofil mit freigegebenen Angaben aus der Behandlung,
    Screening- und Gesundheitsangaben, Pläne und Einheiten, Rückfragen), auch künftige, und die
    Übungsbibliothek; Trainingsinhalte schreiben, abschließen und nachtragen nur Inhaber:in und
    Trainingsbetreuung, Organisatorisches (Termin, Vertrag, Rechnung) das Büro wie bisher. Jedes
    Lesen ist auditpflichtig nach Punkt 8, mit den Aktionen aus ADR-010. Mit echten Daten gilt das
    Leserecht erst nach der DSFA (B2, ADR-007), bis dahin nur synthetisch. Kein Durchgriff
    (Punkt 6): Das Büro hat Rollen in beiden Bereichen und liest im Trainingsverhältnis.
11. **Das Ernährungsprofil ist von Punkt 10 ausgenommen** (Fassung 4): Es hängt an einem Verhältnis
    (ADR-027), gehört aber nicht zu dessen offenem Lesen; lesen und schreiben nur, wer die Fähigkeit
    „Ernährungsberatung“ trägt (zunächst `owner`), weder Büro noch Trainingsbetreuung noch
    Therapeut:innen der Akte. Eigene Einwilligung und Datenklasse (ADR-008); Punkt 3 gilt auch hier.

## Konsequenzen
Die Trainingstabellen tragen das Fundament aus ADR-003 und ADR-014 mit RLS ab der ersten Migration
(ADR-004). Das Ende eines Verhältnisses beendet das andere nicht; die Identität fällt mit dem
letzten Verhältnis, deshalb prüft der Löschlauf (`app.delete_patient_record`) auch das
Trainingsverhältnis. `retention.test.ts` macht `pnpm test:db` rot, wenn einer Tabelle die
Datenklasse fehlt (Punkt 4). Jede Abfrage, Policy und Projektion nennt ihr Verhältnis (§16).

## Offene Folgefragen
- Wie lange genau ist „Screening früher“? Interne Initialentscheidung im DSFA-Prozess (B2, ADR-008).
- Wie wird die Einwilligung erfasst, belegt, widerrufen, und was wird aus Kopien (Punkt 7)? (B2)
- Ist das einheitliche § 203-Niveau Schutzverschärfung, keine Erweiterung der Zweckbindung? (B2)
- Bindet ein Legal Hold der Behandlung (ADR-008 Punkt 7) die gemeinsame `persons`-Zeile mit?
- Wie wird die erste harte Regel erzwungen: Konvention, Migrationsprüfung oder Test (wie ADR-014)?

## Änderungshistorie
- Fassung 1 (2026-09-20, Jannes): Trennung nach Rechtsverhältnis, drei harte Regeln, § 203-Niveau.
- Fassung 2 (2026-10-02, Jannes, ANN-184): Punkt 10, Büro liest Trainingsprotokolle, schreibt nicht.
- Fassung 3 (2026-10-09, Jannes, BEF-137): Büro liest im Training alles, schreibt nichts Fachliches.
- Fassung 4 (2026-10-18, Jannes): Punkt 11, Ernährungsprofil davon ausgenommen (ADR-027).
- Verdichtet 2026-10-27 (Aufräumen 5), Inhalt unverändert; früherer Wortlaut: `git log -p`.
