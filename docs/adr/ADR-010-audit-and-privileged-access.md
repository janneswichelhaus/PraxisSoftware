# ADR-010: Audit-Logging und privilegierter Produktionszugriff

## Status

**Angenommen** (2026-08-28).

**Fassung 2 (2026-09-13)** — begrenzte Ergänzung: Zwei eigene Folgefragen
sind beantwortet (Punkt 13: wer das Auditlog liest; Punkt 14: was bei Dateien
als Download gilt), und die Konsequenz aus ADR-004 Fassung 2 (E15: Office
liest klinische Inhalte) ist nachgetragen. Alles Übrige gilt unverändert.

**Fassung 3 (2026-10-03, LOG-EPIC-001)** — Umkehr der Punkte 2, 6, 13 und 14
durch den Projektinhaber: Protokolliert wird nur noch, was das Datenmodell
nicht abbildet (Punkte 15 bis 21). Der alte Wortlaut bleibt durchgestrichen
lesbar. Punkte 1, 3 bis 5 und 7 bis 12 gelten unverändert.

**Fassung 4 (2026-10-09, BEF-138)** — Entscheidung des Projektinhabers in der
Abnahme der Annahmen (ANN-249): Der Abruf eines freigegebenen Dokuments durch
die Person über die Plattform wird nicht protokolliert (neu Punkt 22, Punkt 16
eingeschränkt). Die Menge der Aktionen bleibt gleich; alles Übrige gilt
unverändert.

## Datum

2026-08-28 · Fassung 2: 2026-09-13 · Fassung 3: 2026-10-03 · Fassung 4: 2026-10-09

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
2. ~~Mindestens folgende Ereignisse **MÜSSEN auditierbar sein**: Öffnen einer
   Patientenakte in der Detailansicht; Zugriff auf klinische Dokumente;
   Download/Export klinischer Daten; Erstellung, Änderung und Finalisierung
   klinischer Dokumentation; Ausstellung, Korrektur und Stornierung von
   Rechnungen; größere Datenexporte; Änderungen von Rollen und Berechtigungen;
   Änderungen von Portal-/Vertreterzugriffen; produktive KI-Aufrufe mit
   Patientenkontext; privilegierte technische Zugriffe auf
   Produktionssysteme.~~ *Umgekehrt mit Fassung 3: Den Katalog legt Punkt 16
   abschließend fest; Erstellen, Ändern, Finalisieren und Rechnungsvorgänge
   weist das Datenmodell nach (Punkt 15).*
3. Audit-Einträge enthalten **nur die zur Nachvollziehbarkeit erforderlichen
   Metadaten und keine vollständigen klinischen Inhalte**.
4. Audit-Einträge **dürfen durch den normalen Anwendungspfad nicht geändert
   oder gelöscht werden**.
5. Die initiale Aufbewahrungsfrist beträgt gemäß
   [ADR-008](ADR-008-data-retention-and-deletion.md) **drei Jahre**.
6. ~~Ein automatisierter Audit-/Security-Report **SOLLTE monatlich**
   ungewöhnliche oder besonders sensible Vorgänge zusammenfassen.~~
   *Umgekehrt mit Fassung 3: Ausgewertet wird bei Anlass (Punkt 19).*

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
    `context` wird nicht herausgegeben (Fassung 3: außer Operation und Zähler
    einer Abweisung). ~~**Jeder Lesezugriff wird selbst als `audit_log.read`
    protokolliert.**~~ *Umgekehrt mit Fassung 3: Das Lesen des Protokolls wird
    nicht protokolliert; der Schutz der Beschäftigten liegt in der
    Zweckbindung (Punkt 20).* Ein direktes `SELECT` auf die Tabelle gibt es für
    keine Rolle.
14. ~~**Bei Dateien gilt die Ausstellung eines signierten Verweises als
    Download-Ereignis** im Sinne von Punkt 2.~~ *Umgekehrt mit Fassung 3:
    Protokolliert wird nur das Herunterladen (`patient_file.downloaded`), nicht
    das Anzeigen ([ADR-017](ADR-017-file-storage.md) Punkt 55).*

### Protokollierung auf das Mindestmaß (Fassung 3, 2026-10-03)

15. **Leitprinzip: Das Datenmodell ist die Nachweisführung.** Wer was wann
    angelegt, geändert, finalisiert, ausgestellt, storniert oder abgesagt hat,
    zeigen die Spalten der Fachtabellen (`created_by`, `finalized_by`,
    `issued_by`, `cancelled_by`, die Versionstabelle der Dokumentation nach
    [ADR-016](ADR-016-clinical-documentation-record.md)). Das Auditlog hält
    nur, was das Datenmodell nicht abbildet.
16. **Abschließender Katalog** (`supabase/audit-aktionen.txt`, 26 Aktionen):
    - Akte geöffnet: höchstens ein Eintrag je Person, Akte und Kalendertag der
      Praxis (`patient_record.viewed`); ebenso für Trainingskund:innen
      (`training_relationship.viewed`).
    - Datei heruntergeladen (`patient_file.downloaded`), durch ein
      Praxiskonto; der Abruf über die Plattform nicht (Punkt 22, Fassung 4).
    - Exporte: Auskunft nach Art. 15 DSGVO, Therapiebericht drucken oder
      exportieren, Foto an die Person herausgeben.
    - Portal: Vertretung liest (einmal je Tag und Akte); Zugang eingeladen,
      aktiviert, gesperrt, entsperrt, entzogen.
    - Konten und Rechte: `staff_account.*`, `account.*`,
      `organization.bootstrapped`.
    - Abgewiesene Zugriffe (`access.denied`), gleichartige innerhalb von zehn
      Minuten mit Zähler in einem Eintrag.
    - Löschlauf: `retention.applied` als Zusammenfassung je Lauf.
17. **Neue Protokollierung nur mit Änderung dieses ADR und ausdrücklicher
    Freigabe des Projektinhabers.** Die CI weist eine geänderte Aktionsmenge
    ohne das Label `freigabe-audit` ab, das nur er setzt.
18. **Fristen:** Lese- und Sicherheitsereignisse zwölf Monate, alle übrigen
    Einträge drei Jahre ([ADR-011](ADR-011-logging-and-observability.md)
    Punkt 4, [ADR-008](ADR-008-data-retention-and-deletion.md)). Ein Legal Hold
    hält jeden Eintrag seiner Akte. Kein Freitext im Kontext.
19. **Auswertung bei Anlass:** bei Verdacht, Beschwerde oder Auskunftsersuchen
    — nicht regelmäßig, nicht als Report.
20. **Zweckbindung:** Protokolle dienen ausschließlich Datenschutz und
    Sicherheit, nie der Leistungs- oder Verhaltenskontrolle von Mitarbeitenden
    ([PROJECT_PRINCIPLES.md](../../PROJECT_PRINCIPLES.md) §20).
21. **Risikoabwägung nach Art. 32 DSGVO.** Die Praxis ist klein, die Rollen
    sind wenige und bekannt, das Protokoll liest allein der Inhaber. Die Akte
    ist unveränderlich: Ein finalisierter Eintrag wird nur über eine neue
    Version mit Urheber und Zeitpunkt korrigiert (§ 630f BGB), Rechnungen nur
    über ein Storno. Damit beweist das Datenmodell jeden Schreibvorgang; ein
    zweiter Nachweis im Log brächte keine zusätzliche Sicherheit, aber ein
    zweites Verzeichnis darüber, wer wann was getan hat. Für das Lesen genügt
    die Aussage, wer an welchem Tag in welcher Akte war — sie beantwortet
    Auskunftsersuchen (Art. 15) und Verdachtsfälle; die Zeile je Datensatz
    erzeugte Hunderte Einträge am Tag ohne Mehrwert. Abweisungen und
    Kontoereignisse bleiben, weil nur sie Angriffe und Fehlbedienung sichtbar
    machen. Weniger Protokoll senkt zugleich das Risiko des Protokolls selbst
    (Art. 5 Abs. 1 lit. c DSGVO).

### Abruf über die Plattform (Fassung 4, 2026-10-09)

22. **Ruft die Person ein freigegebenes Dokument über die Plattform ab,
    entsteht dafür kein eigener Auditeintrag.** Nachgewiesen ist, was die
    Praxis getan hat: Wer welches Dokument wann freigegeben hat, steht am
    Datensatz (`released_at`, `released_by`; Punkt 15). Der Abruf gibt der
    Person nur, was die Praxis ihr ausdrücklich zugedacht hat; ein Eintrag
    zeigte nur, dass jemand den eigenen Arztbrief gelesen hat. Das ist
    dieselbe Abwägung, mit der [ADR-023](ADR-023-platform-access.md) Punkt 24
    das eigene Lesen nicht protokolliert (Art. 5 Abs. 1 lit. c DSGVO). Ruft
    eine **Vertretung** ab, bleibt es beim Eintrag „Vertretung liest" aus
    Punkt 16, höchstens einmal je Tag und Akte: Der Abruf zählt als Lesen,
    nicht als Herunterladen. Das Herunterladen durch ein Praxiskonto bleibt
    `patient_file.downloaded`.

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
  Office ohne Abstriche. *Fassung 3: Die Ereignisse sind die aus Punkt 16;
  der monatliche Report entfällt.*
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
  nachträglichen Auswertung — seit Fassung 3 bei Anlass (Punkt 19) — und
  nicht in einer vorherigen Freigabe. Wird nach ADR-007 ein Datenschutzbeauftragter benannt,
  entsteht erstmals eine unabhängige Instanz für diese Auswertung.
- Die Trennung der Kontendomänen bedeutet zwei Identitäten für dieselbe
  Person. Das ist unbequem und genau der Zweck: Ein kompromittiertes
  Alltagskonto führt nicht zu Infrastrukturrechten.
- ~~Der monatliche Report ist als SOLLTE gefasst.~~ *Fassung 3: Es gibt keine
  regelmäßige Auswertung. Die Kontrolle liegt in der Nachweisführung des
  Datenmodells und in der Auswertung bei Anlass (Punkte 15, 19).*
- **Fassung 3:** Der Katalog schrumpft von 169 auf 26 Aktionen, die Einträge
  eines Behandlungstags von mehreren Hundert auf wenige Dutzend. Lücken im
  Datenmodell sind minimal geschlossen (`appointments.reopened_by`,
  `storage_deletion_orders.ordered_by`, Zweifel am Zugang nach
  [ADR-023](ADR-023-platform-access.md) Punkt 13); die übrigen sind bewusst
  hingenommen (ANN-230).
- **Fassung 4:** Ob eine Person ein freigegebenes Dokument tatsächlich
  abgerufen hat, beantwortet das Protokoll nicht mehr. Wer das wissen muss,
  etwa im Streit, ob ein Bericht angekommen ist, fragt die Person; die
  Freigabe selbst ist am Datensatz nachgewiesen.

## Bewusst nicht Bestandteil dieser Entscheidung

- Das konkrete Schema der Audit-Einträge und die Wahl des Speicherorts.
- ~~Wer die Audit-Logs lesen darf, und wie diese Leseberechtigung selbst
  auditiert wird.~~ Mit Fassung 2 (Punkt 13) entschieden.
- ~~Der Inhalt und die Zustellung des monatlichen Reports sowie die Schwellen
  für „ungewöhnlich".~~ *Mit Fassung 3 gegenstandslos (Punkt 19).*
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
- ~~Was genau gilt als „größerer Datenexport", und ab welcher Menge?~~
  *Beantwortet mit Fassung 3, Punkt 16: die drei benannten Exporte.*
- Wie wird die Unveränderbarkeit technisch abgesichert — durch
  Datenbankrechte, durch Append-only-Strukturen, oder durch beides?
- Wie wird ein Break-Glass-Zugriff praktisch ausgelöst und wieder entzogen,
  ohne dass der Entzug vom Wohlwollen der zugreifenden Person abhängt?
- ~~Was passiert, wenn der monatliche Report nicht gelesen wird — gibt es eine
  Eskalation?~~ *Mit Fassung 3 gegenstandslos.*
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
| 3 | 2026-10-03 | LOG-EPIC-001, Entscheidung des Projektinhabers: Umkehr der Punkte 2 (Katalog), 6 (Monatsreport), 13 (Lesen des Protokolls protokolliert) und 14 (Verweis gilt als Download); neu Punkte 15–21 (Leitprinzip, Katalog, Freigabe, Fristen, Auswertung bei Anlass, Zweckbindung, Art.-32-Abwägung). Punkte 1, 3–5, 7–12 unverändert. |
| 4 | 2026-10-09 | BEF-138, Entscheidung des Projektinhabers in der Abnahme vom 2026-10-09 (ANN-249): neu Punkt 22, der Abruf eines freigegebenen Dokuments über die Plattform wird nicht protokolliert; eine Vertretung bleibt beim täglichen Eintrag „Vertretung liest"; Punkt 16 entsprechend eingeschränkt. Aktionsmenge unverändert. |
