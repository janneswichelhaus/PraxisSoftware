# ADR-010: Audit-Logging und privilegierter Produktionszugriff

## Status

**Angenommen** (2026-08-28).

**Fassung 2 (2026-09-13)** — begrenzte Ergänzung: Zwei eigene Folgefragen
sind beantwortet (Punkt 13: wer das Auditlog liest; Punkt 14: was bei Dateien
als Download gilt), und die Konsequenz aus ADR-004 Fassung 2 (E15: Office
liest klinische Inhalte) ist nachgetragen. Alles Übrige gilt unverändert.

## Datum

2026-08-28 · Fassung 2: 2026-09-13

## Kontext

§4.2 von `PROJECT_PRINCIPLES.md` erlaubt allen Therapeut:innen einer
Organisation den Zugriff auf alle Patientenakten dieser Organisation. Diese
bewusste Produktentscheidung entfernt die naheliegendste technische
Schutzmaßnahme. Was als Kontrolle bleibt, ist die Nachvollziehbarkeit.
[ADR-004](ADR-004-authorization-model.md) hat Audit-Logging deshalb als
verpflichtend festgelegt, ohne den Umfang zu definieren.

Genau daran hing der offene Punkt C4: Ein Auditlog ohne definierten Umfang,
ohne Aufbewahrung und ohne Unveränderbarkeit ist keine Maßnahme, sondern eine
Absichtserklärung.

Ein zweiter, oft damit vermischter Punkt ist der privilegierte technische
Zugriff. §3.2 fordert individuelle Konten für Produktionszugriffe, §4.1
verlangt die Trennung technischer Administration von Alltagsrechten. Bei einer
Praxis, in der zunächst eine Person entwickelt und betreibt, ist echte
Funktionstrennung nicht herstellbar. Die Kompensation kann deshalb nur in
Beschränkung, Begründung und Protokollierung liegen.

Der dritte Punkt ist begrifflicher Natur. „Break Glass" bezeichnet in
Gesundheitssystemen üblicherweise einen klinischen Notfallzugriff auf
gesperrte Akten. Ein solcher Mechanismus setzt voraus, dass Akten für die
behandelnde Person regulär gesperrt sind. In diesem System sind sie das nicht.

Dieser ADR schließt die offenen Punkte C3, C4, C5 und E4.

## Entscheidung

### Audit-Logging

1. Die Plattform verwendet ein **verbindliches Audit-Logging für sensible
   Aktionen**.
2. Mindestens folgende Ereignisse **MÜSSEN auditierbar sein**:
   - Öffnen einer Patientenakte in der Detailansicht
   - Zugriff auf klinische Dokumente
   - Download/Export klinischer Daten
   - Erstellung, Änderung und Finalisierung klinischer Dokumentation
   - Ausstellung, Korrektur und Stornierung von Rechnungen
   - größere Datenexporte
   - Änderungen von Rollen und Berechtigungen
   - Änderungen von Portal-/Vertreterzugriffen
   - produktive KI-Aufrufe mit Patientenkontext
   - privilegierte technische Zugriffe auf Produktionssysteme
3. Audit-Einträge enthalten **nur die zur Nachvollziehbarkeit erforderlichen
   Metadaten und keine vollständigen klinischen Inhalte**.
4. Audit-Einträge **dürfen durch den normalen Anwendungspfad nicht geändert
   oder gelöscht werden**.
5. Die initiale Aufbewahrungsfrist beträgt gemäß
   [ADR-008](ADR-008-data-retention-and-deletion.md) **drei Jahre**.
6. Ein automatisierter Audit-/Security-Report **SOLLTE monatlich**
   ungewöhnliche oder besonders sensible Vorgänge zusammenfassen.

### Kein klinischer Break Glass in V1

7. Alle Therapeut:innen einer Organisation dürfen gemäß bestehender
   Entscheidung alle Patientenakten dieser Organisation sehen. **Deshalb ist
   kein klinischer Break-Glass-Mechanismus für reguläre Patientenzugriffe in
   V1 erforderlich.**
8. **Break Glass bezeichnet in diesem Projekt ausschließlich privilegierten
   technischen Produktionszugriff für Störungs- oder Sicherheitsfälle.**

### Privilegierter Produktionszugriff

9. **Direkter Produktions-Datenbankzugriff durch Menschen ist im Normalbetrieb
   nicht erlaubt.**
10. Privilegierter Produktionszugriff **MUSS**:
    - auf einen konkreten Anlass begrenzt sein
    - individuell authentifiziert sein
    - MFA verwenden
    - begründet werden
    - auditierbar sein
    - nach Abschluss wieder entzogen beziehungsweise beendet werden
11. **Praxis-Alltagskonten und technische Infrastruktur-Admin-Konten sind
    getrennte Berechtigungsdomänen.**
12. **Coding- und KI-Entwicklungswerkzeuge erhalten niemals
    Produktionscredentials oder reale Produktionsdaten.**

### Lesen des Auditlogs und Dateien (Fassung 2, 2026-09-13)

13. **Das Auditlog liest in V1 allein die Rolle `owner`**, ausschließlich über
    die Funktion `list_audit_events` — begrenzt auf die eigene Organisation,
    mit Pagination und Filtern nach Zeitraum, Benutzer und Aktion; die Spalte
    `context` wird nicht herausgegeben. **Jeder Lesezugriff wird selbst als
    `audit_log.read` protokolliert.** Ein direktes `SELECT` auf die Tabelle
    gibt es für keine Rolle. So gebaut seit
    `supabase/migrations/20260828110100_audit_read_path.sql`; dieser Punkt
    holt die Entscheidung in den ADR nach. Der Schutz der Beschäftigten (§20)
    liegt im Zweck des Lesens (Nachweis, monatlicher Report) und darin, dass
    das Lesen selbst sichtbar ist.
14. **Bei Dateien gilt die Ausstellung eines signierten Verweises als
    Download-Ereignis** im Sinne von Punkt 2. Ob die Bytes tatsächlich geflossen
    sind, kann die Anwendung nicht feststellen
    ([ADR-017](ADR-017-file-storage.md) Punkt 21); der Verweis ist mit
    60 Sekunden so kurzlebig, dass Ausstellung und Laden praktisch
    zusammenfallen.

## Konsequenzen

- Der Ereigniskatalog macht das Auditlog prüfbar. Jedes der zehn Ereignisse
  ist ein testbarer Auslöser; §12 („Benutzerberechtigungen brauchen Tests")
  erhält damit einen konkreten Gegenstand.
- Das Öffnen einer Akte in der Detailansicht ist auditpflichtig, eine reine
  Trefferliste nicht. Das ist eine bewusste Abwägung zwischen Aussagekraft und
  Logvolumen: Der Nachweis „wer hat wessen Akte tatsächlich gelesen" bleibt
  erhalten, ohne jede Suchbewegung mitzuschreiben.
- Metadaten statt Inhalte bedeutet, dass das Auditlog selbst keine
  Zweitkopie der Patientenakte wird. Es bleibt trotzdem sensibel — es zeigt,
  wer bei wem in Behandlung ist — und unterliegt deshalb den Zugriffsregeln aus
  ADR-004.
- Unveränderbarkeit über den Anwendungspfad heißt: Die Anwendung besitzt für
  Audit-Einträge kein Update und kein Delete. Löschung findet ausschließlich
  über den Retention-Vorgang aus ADR-008 statt. Das ist eine Anforderung an
  Schema und Datenbankrechte, nicht nur an den Code.
- **Fassung 2:** Seit E15 (ADR-004 Fassung 2) liest auch Office klinische
  Inhalte. Das Auditlog ist damit für zwei Rollen die Kompensation für einen
  Zugriff ohne Need-to-know-Grenze; die Ereignisse aus Punkt 2 gelten für
  Office ohne Abstriche, und der monatliche Report (Punkt 6) gewinnt an
  Gewicht.
- Die Absage an einen klinischen Break Glass ist keine Lücke, sondern die
  logische Folge von §4.2: Ein Notfallzugriff auf etwas, das ohnehin zugänglich
  ist, wäre eine Attrappe. Sollte §4.2 später eingeschränkt werden, wird ein
  klinischer Break Glass notwendig und ist dann ein eigener ADR.
- Damit ist auch die Spannung aus §13 aufgelöst: „Im Zweifel blockieren" gilt
  für schreibende und offenlegende Vorgänge; für den lesenden Zugriff der
  behandelnden Person entsteht kein Konflikt mit der Patientensicherheit, weil
  keine Sperre existiert, die im Notfall zu überwinden wäre.
- Das Verbot des direkten Produktions-Datenbankzugriffs im Normalbetrieb hat
  handfeste Folgen für die Arbeitsweise: Datenkorrekturen laufen über
  Migrationen oder über Funktionen der Anwendung, nicht über eine Konsole.
  Das kostet im Störungsfall Zeit und ist bewusst so.
- Der Break-Glass-Vorgang braucht eine Gegenprobe. Bei Bus-Faktor 1 kann
  niemand im Haus ihn freigeben; die Kontrolle liegt deshalb in der
  nachträglichen Auswertung — dem monatlichen Report — und nicht in einer
  vorherigen Freigabe. Wird nach ADR-007 ein Datenschutzbeauftragter benannt,
  entsteht erstmals eine unabhängige Instanz für diese Auswertung.
- Die Trennung der Kontendomänen bedeutet zwei Identitäten für dieselbe
  Person. Das ist unbequem und genau der Zweck: Ein kompromittiertes
  Alltagskonto führt nicht zu Infrastrukturrechten.
- Der monatliche Report ist als SOLLTE gefasst. Er ist die einzige regelmäßige
  Auswertung des Auditlogs und damit praktisch die Bedingung dafür, dass das
  Log überhaupt eine Kontrolle ist.

## Bewusst nicht Bestandteil dieser Entscheidung

- Das konkrete Schema der Audit-Einträge und die Wahl des Speicherorts.
- ~~Wer die Audit-Logs lesen darf, und wie diese Leseberechtigung selbst
  auditiert wird.~~ Mit Fassung 2 (Punkt 13) entschieden.
- Der Inhalt und die Zustellung des monatlichen Reports sowie die Schwellen
  für „ungewöhnlich".
- Auswahl von Identitätsanbieter und MFA-Verfahren (§3.4 bleibt maßgeblich).
- Die technische Umsetzung zeitlich begrenzter Rechteerteilung.
- ~~Die Frage, ob ein fallbezogener Sonderzugriff des Office auf klinische
  Dokumentation nach §4.4 realisiert wird.~~ Mit E15 (2026-09-13)
  gegenstandslos: Office liest klinische Inhalte regulär.
- Betriebs- und Alarmierungsschwellen für Security-Ereignisse.

## Offene Folgefragen

- ~~Wer darf Audit-Logs lesen, und wie wird verhindert, dass diese
  Leseberechtigung selbst zur unbemerkten Beobachtung von Beschäftigten wird
  (§20)?~~ Beantwortet mit Fassung 2, Punkt 13: `owner`, eigener Lesepfad,
  jedes Lesen protokolliert.
- Was genau gilt als „größerer Datenexport", und ab welcher Menge?
- Wie wird die Unveränderbarkeit technisch abgesichert — durch
  Datenbankrechte, durch Append-only-Strukturen, oder durch beides?
- Wie wird ein Break-Glass-Zugriff praktisch ausgelöst und wieder entzogen,
  ohne dass der Entzug vom Wohlwollen der zugreifenden Person abhängt?
- Was passiert, wenn der monatliche Report nicht gelesen wird — gibt es eine
  Eskalation?
- ~~Wie werden Audit-Einträge behandelt, deren Bezugsdaten nach ADR-008 früher
  gelöscht werden als das Log selbst?~~ Beantwortet mit ANN-029 (eigene
  Datenklasse des Auditlogs, drei Jahre unabhängig von der Akte, LOE-EPIC-001).
- Wie werden auditpflichtige Vorgänge erfasst, die offline entstanden sind
  (ADR-001)?

## Änderungshistorie

| Fassung | Datum | Änderung |
|---|---|---|
| 1 | 2026-08-28 | Angenommen. |
| 2 | 2026-09-13 | Punkte 13 (Lesepfad: `owner`, `list_audit_events`, jedes Lesen protokolliert) und 14 (Verweisausstellung gilt als Download) ergänzen eigene Folgefragen; Konsequenz aus E15 (Office) nachgetragen; Erledigungsvermerke. Punkte 1–12 unverändert. |
