# ADR-022: Terminkontext und Trainingsgrundlage — ein Kalender, ein Kontext je Termin

## Status

**Vorgeschlagen** — Entscheidungsarbeit nach den Festlegungen des Projektinhabers vom 2026-09-17
(E18, Abschnitt 2 in
[`../development/E18-LEISTUNGSBEREICHE.md`](../development/E18-LEISTUNGSBEREICHE.md)).

Dieser ADR ist **Schritt 2 von sieben** aus E18 und setzt
[ADR-021](ADR-021-service-areas-and-legal-relationships.md) fort. Er **löst
[ADR-020](ADR-020-treatment-basis.md) nicht ab** und ändert keinen seiner acht Punkte: Er steht
daneben und zieht die Grenze. Mit der Annahme durch den Projektinhaber wandert er in den Index in
`CLAUDE.md`, in die Tabelle in [`README.md`](README.md) und in die Tabelle in
`PROJECT_PRINCIPLES.md` §21; bis dahin beginnt Schritt 3 nicht.

## Datum

2026-09-20

## Kontext

Der Kalender ist **eine** Tabelle: `public.appointments`. Sie trägt seit CAL-015b eine Terminart
`kind` mit den Werten `treatment` und `event` — ein Ereignis des Praxisbetriebs (Besprechung,
Pause, Fehlzeit) hat keine Patient:in, keine Behandlungsgrundlage und keine Längenregel, dafür
einen Titel; vier Constraints halten die Fallunterscheidung schemaseitig zusammen, und ein
Ereignis kann ausdrücklich **nicht** abgeschlossen, dokumentiert oder als „nicht angetroffen"
vermerkt werden (`supabase/migrations/20260912210000_appointment_events.sql`, **ANN-049**). Daneben
steht `appointment_type` mit `home_visit`, `practice` und `video` — wo und worüber der Termin
stattfindet. Die Behandlungsgrundlage hängt seit GRD-001 als `treatment_basis_id` am Termin
(ADR-020), der Zustand folgt [ADR-018](ADR-018-appointment-states.md), und eine
EXCLUDE-Constraint über Zeitraum und Mitarbeitende verhindert Doppelbuchungen.

Dass Ereignis und Behandlung in derselben Tabelle stehen, ist kein Zufall, sondern der Grund für
den einen Kalender: Die EXCLUDE-Constraint wirkt **nur innerhalb einer Tabelle**. Eine zweite
Tabelle hätte die Belegungsprüfung in Anwendungscode verlagert und damit genau den Schutz
aufgegeben, um den es geht (ANN-049).

[ADR-021](ADR-021-service-areas-and-legal-relationships.md) hat am 2026-09-20 das zweite
Rechtsverhältnis entschieden: Training ist keine Heilbehandlung, das Trainingsverhältnis entsteht
additiv neben `patients`, und die einzige Verbindung ist `person_id`. **Einen Platz im Kalender hat
ein Trainingstermin damit noch nicht**: Die einzige personenseitige Verknüpfung am Termin ist
`patient_id`, und die Behandlungsgrundlage ist eine klinische Tabelle.

E18 Abschnitt 2 verlangt dafür einen Terminkontext mit `therapy`, `training` und `internal`. Eine
Feststellung gehört davor: **`internal` gibt es bereits** — es heißt heute `kind = 'event'`. Wer
daneben eine zweite Spalte einzieht, bekommt zwei Wahrheiten über denselben Termin, die einander
widersprechen können (`kind = 'event'` bei `context = 'therapy'`), und genau die zweite
Implementierung neben einer vorhandenen, die
[`ARBEITSBEREICHE.md`](../development/ARBEITSBEREICHE.md) verhindern soll.

Die Entscheidung fällt jetzt, weil der Kalender die meistgelesene Sicht der Anwendung ist: Jede
Abfrage, jede Policy und jede Projektion, die heute „Termin" mit „Behandlung" gleichsetzt, muss
später einzeln angefasst werden. Die Datenbank trägt bis heute ausschließlich synthetische Daten.

## Entscheidung

**1. Ein Kalender, eine Terminentität.** Behandlungstermin, Trainingstermin und internes Ereignis
stehen in derselben Tabelle. Zwei Terminentitäten hießen zwei Kalender, zwei Belegungsprüfungen und
eine Doppelbuchung, die niemand verhindert — die Begründung von ANN-049 trägt für den dritten
Kontext unverändert.

**2. Der Kontext ist eine Eigenschaft des Termins — und zwar die vorhandene.** Es entsteht **kein
zweites Feld** neben der Terminart; die vorhandene Spalte bekommt den dritten Wert. Die drei Werte
sind fachlich vollständig und schließen einander aus: Ein Termin hängt an genau einem
Rechtsverhältnis oder an keinem. Für die Bezeichner gilt die Sprachregelung aus ADR-021 Punkt 9 —
die Bereiche heißen `therapy` und `training`; ob dafür die Bestandswerte `treatment` und `event`
umbenannt werden, entscheidet der SPEC (ADR-014: das konkrete Schema ist nicht Gegenstand eines
ADR). Entschieden ist hier: **eine Spalte, drei Kontexte, kein zweites Feld.**

**3. Der Kontext entscheidet, an welchem Verhältnis der Termin hängt.** Neben der vorhandenen
Verknüpfung auf `patients` tritt eine zweite, nullbare auf das Trainingsverhältnis. Eine Constraint
erzwingt je Kontext **genau eine** davon und bei einem internen Termin **keine**. Schemaseitig
unmöglich sind damit: ein Behandlungstermin ohne Patient:in, ein Trainingstermin mit Patient:in,
ein Termin, der **beide** Verhältnisse trägt, und ein interner Termin mit einem Gegenüber. Das ist
ADR-021 Punkt 3 am Kalender: Die gemeinsame Identität ist der einzige geteilte Punkt, nicht der
Termin.

**4. Ein Trainingstermin hängt nie an der Behandlungsgrundlage.** `treatment_basis_id` bleibt
außerhalb von `therapy` leer, geprüft in derselben Constraint. Die Behandlungsgrundlage steht in
der Datenklasse „klinische Patientenakte" mit zehn Jahren Aufbewahrung und verweist auf `patients`
(ADR-020 Punkt 4); ein Trainingstermin, der auf sie zeigt, trüge Training in die Patientenakte und
bräche ADR-021 Punkt 5.

**5. Die Trainingsgrundlage ist eine eigene Klammer, keine dritte Bauart der
Behandlungsgrundlage.** ADR-020 hat die zweite Tabelle mit gutem Grund verworfen — aber dieses
Argument läuft **innerhalb eines Rechtsverhältnisses**: Verordnung und Selbstzahler teilen
Datenklasse, Frist, Rollenschnitt und Planungsmechanik. Hier ist keines der vier gleich. ADR-020
bleibt unverändert und gilt fortan ausdrücklich für `therapy`. Die Trainingsgrundlage wird analog
gebaut — Verweis auf das Trainingsverhältnis, Beginn, vereinbarte Anzahl, Status — und trägt
**keine klinischen Felder**: keine Diagnose, keine Leitsymptomatik, kein Therapieziel, keine
Verordner:in. **Pflicht ist das Verhältnis, nicht die Klammer:** Eine Einzelstunde ohne vereinbarte
Anzahl bleibt möglich, und eine Klammer auf Vorrat wird nicht verlangt (ADR-014).

**6. Ein Trainingstermin erzeugt keine Behandlungsdokumentation — und kann keine erzeugen.** Die
Dokumentationspflicht aus § 630f BGB gilt für die Behandlung. Ein Dokumentationseintrag nach
[ADR-016](ADR-016-clinical-documentation-record.md) entsteht nur am Behandlungstermin;
durchgesetzt wird das in der Datenbank, nicht in der Oberfläche (ADR-004 Punkt 5, ADR-021
Punkt 6). Die **automatische Finalisierung** nach ADR-016 Punkt 7 erreicht einen Trainingstermin
unter keinen Umständen. Der Riegel ist nicht neu: Ein Ereignis kann heute schon nicht dokumentiert
werden (CAL-015b) — er bekommt einen dritten Zweig.

**7. Das Trainingsprotokoll ist ein Fachdatum des Trainingsverhältnisses.** Es hängt am Verhältnis,
nicht an `persons` und nicht am Behandlungstermin (ADR-021 Punkt 5), und es ist **kein Eintrag im
Sinne von ADR-016**: eigene Datenklasse, eigene Frist (ADR-021 Punkt 4), keine Versionspflicht aus
§ 630f. Für Inhalte aus der Akte gilt ADR-021 Punkt 7 unverändert — dokumentierte Kopie mit
Einwilligung, nie Referenz. Was ein Protokoll enthält und wie es bedient wird, gehört in den
Trainingsbereich (E18 Abschnitt 6); hier steht allein, **woran es hängt und was es nicht ist**.

**8. Der Zustandsautomat bleibt einer; seine Invariante wird je Kontext gelesen.** ADR-018 gilt für
`therapy` und `training` gleichermaßen und unverändert; ein interner Termin bleibt wie heute ohne
Abschluss, ohne Dokumentation und ohne Nichtantreffen. ADR-018 Punkt 3 bindet `documented` an die
Existenz einer finalisierten Dokumentation — gelesen **je Kontext**: die Behandlungsdokumentation
bei `therapy`, das Trainingsprotokoll bei `training`. Solange es kein Trainingsprotokoll gibt, ist
`documented` am Trainingstermin nicht erreichbar. Das ist kein Mangel, sondern die Folge daraus,
dass der Trainingsbereich noch nicht gebaut ist; ein Zustand, den niemand setzen kann, wird nicht
vorgebaut (ADR-014, ADR-018 Punkt 1).

**9. Der Kanal bleibt eine eigene Dimension.** `appointment_type` sagt **wo und worüber**, der
Kontext sagt **was und für wen**. Online Coaching ist ein Trainingstermin über Video, Personal
Training zu Hause ein Trainingstermin als Hausbesuch, und eine Videosprechstunde in der
Physiotherapie bleibt ein Behandlungstermin — deshalb reicht `video` als Unterscheidung nicht (E18
Abschnitt 2, erster Satz). Die heutige Einschränkung „kein Hausbesuch bei einem internen Termin"
bleibt; für `training` sind alle drei Kanäle zulässig.

**10. Der Kontext steht mit dem Anlegen fest.** Es gibt **keinen freien Wechsel über die Tabelle** —
dieselbe Regel wie für den Status (ADR-018 Punkt 2). Ein Kontextwechsel wäre ein Wechsel des
Rechtsverhältnisses, der Rechtsgrundlage, der Aufbewahrungsfrist und der Rolle, die den Termin
sehen darf; ein falsch angelegter Termin wird abgesagt und neu angelegt.

**11. Über den gemeinsamen Kalender gibt es keinen Durchgriff — bis auf die Belegung.** Die
Policies auf dem Kalender filtern **nach Kontext**: Wer nur die Trainingsrolle hat, liest keinen
Behandlungstermin — weder Person noch Titel noch Grundlage (ADR-021 Punkt 6). Was er erfährt, ist
die **Belegung**: Die EXCLUDE-Constraint wirkt über alle Kontexte, sonst wäre der eine Kalender
keiner. Diese Restoffenbarung ist der Preis des gemeinsamen Kalenders und wird bewusst bezahlt; sie
nennt Zeit und Mitarbeitende, nie den fremden Termin. Die Belegungsmeldung der Schreibpfade sagt
„belegt" und nichts darüber hinaus — das gehört als Negativfall in `pnpm test:db`.

## Konsequenzen

- **Der Löschlauf bekommt ein Problem, das ADR-021 noch nicht hatte: zwei Fristen in einer
  Tabelle.** Der Retention Schedule ordnet **Tabellen** einer Datenklasse zu, und
  `supabase/tests/retention.test.ts` prüft diese Zuordnung gegen `pg_tables`. Ein Kalender mit drei
  Kontexten trägt Zeilen aus der Patientenakte (zehn Jahre) neben Zeilen des Trainingsverhältnisses
  (drei Jahre) und neben Betriebsdaten ohne Personenbezug. Gelöscht wird deshalb **je Zeile am
  Kontext**, nicht je Tabelle; wie die Zuordnung das abbildet, entscheidet der Loop mit ADR-008 —
  aber dass sie es abbilden muss, steht hier. Das ist die konkreteste Folge dieser Entscheidung.
- **Die vier Constraints aus CAL-015b werden zu Constraints über drei Zweige.** Die Stelle ist
  bekannt und die Arbeit mechanisch; der Preis der einen Tabelle ist und bleibt die
  Fallunterscheidung in den Schreibpfaden (ANN-049). Sie wächst um ein Drittel, nicht um eine
  Dimension — das ist der Unterschied zu einem zweiten Feld.
- **Jede Kalenderabfrage, jede Tagesliste und jede Projektion muss sich entscheiden**, welchen
  Kontext sie meint. Wo heute „Termin" steht und „Behandlung" gemeint ist, wird der Kontext zur
  Pflichtangabe. Das ist derselbe Mehraufwand je Feature, den ADR-021 für die Verhältnisse
  hingenommen hat.
- **Lesende Zugriffe auf Trainingstermine sind auditpflichtig wie die auf Behandlungstermine** —
  Folge des einheitlichen § 203-Niveaus (ADR-021 Punkt 8, ADR-010). Der Kontext ist dabei ein
  Metadatum des Ereignisses und keine Inhaltsangabe; Auditzeilen werden nie umgeschrieben, und die
  bestehenden Werte bleiben gültig.
- **Die Bestandszeilen sind eindeutig und werden nicht umgedeutet.** Jeder heutige Termin ist
  entweder Behandlung oder Ereignis — einen dritten Fall konnte es nie geben, `patient_id` war bis
  CAL-015b `not null`. Es gibt nichts zu raten und nichts nachzutragen (§13).
- **Die Filterregel aus Punkt 11 ist vorhanden, aber unbesetzt.** Es gibt heute keine
  Trainingsrolle (`roleKeySchema` in `src/features/session/types.ts` führt ausschließlich
  Behandlungsrollen); sie kommt mit dem Nachzug an §4 (E18 Schritt 5). Bis dahin ist die Grenze in
  den Policies gezogen, aber niemand steht auf der anderen Seite — dieselbe Lage wie bei ADR-021
  Punkt 6.
- **Verworfen: ein zweites Feld `context` neben der Terminart.** Zwei Spalten über dieselbe Sache
  sind zwei Wahrheiten, sobald eine von beiden falsch gesetzt wird, und jede Abfrage müsste beide
  lesen. Die Widerspruchsfreiheit ließe sich nur mit einer weiteren Constraint erkaufen, die die
  eine Spalte aus der anderen ableitet — dann ist die zweite Spalte überflüssig.
- **Verworfen: eine eigene Tabelle für Trainingstermine.** Damit fielen der eine Kalender und der
  Überschneidungsschutz; die Doppelbuchung zwischen Behandlung und Training wäre möglich, und genau
  sie trifft im Alltag dieselbe Person zur selben Stunde.
- **Verworfen: eine dritte Bauart in der Behandlungsgrundlage.** Sie wäre billig zu bauen und würde
  Rechtsgrundlage, Datenklasse und Frist wieder an derselben Zeile zusammenführen — derselbe
  Fehler, den ADR-021 für das Verhältnis bereits verworfen hat.
- **Verworfen: die Unterscheidung über den Kanal.** `video` trennt Physiotherapie und Coaching nicht
  (es gibt beides online und beides vor Ort) und trägt weder Rechtsgrundlage noch Frist.

## Bewusst nicht Bestandteil dieser Entscheidung

- **Das konkrete Schema**: Spalten-, Wert- und Constraint-Bezeichner, Indizes, und ob die
  Bestandswerte umbenannt werden. Das entscheidet der SPEC des Loops (ADR-014).
- **Der Trainingsbereich selbst** und das Trainingsprotokoll als Funktion — Inhalt, Vorlagen,
  Bedienung, Sicht der Kund:innen (E18 Abschnitt 6).
- **Steuerkennzeichen, getrennte Nummernkreise und der § 14c-Riegel** — neue Fassung von ADR-009
  (E18 Schritt 4). Dazu gehört auch die Frage, ob eine Trainingsrechnung `documented` voraussetzt;
  §19 bindet die Fakturierung an die finalisierte **Behandlungs**dokumentation.
- **Die drei Feature-Verbote an der MDR-Grenze** — neue Fassung von ADR-006 (E18 Schritt 3).
- **Die Trainingsrolle und der Nachzug an §1, §4 und §14** — `PROJECT_PRINCIPLES.md` in neuer
  Version (E18 Schritt 5, §21).
- **Keine Änderung an ADR-018 und ADR-020.** Der Zustandsautomat und die Behandlungsgrundlage
  gelten unverändert; dieser ADR sagt, für welche Kontexte sie gelten.
- **Kein Code, keine Migration.** Dieser ADR ist Entscheidungsarbeit.

## Offene Folgefragen

- Wie bildet der Retention Schedule **zwei Fristen in einer Tabelle** ab — eine Zuordnung je
  Kontext, oder eine Datenklasse „Kalender" mit einer Regel, die den Kontext liest? Gehört in den
  Loop, der die Tabelle anfasst, und muss `retention.test.ts` bestehen (ADR-008).
- Wählt der SPEC die **Umbenennung** der Bestandswerte auf `therapy` und `internal`? Sie ist jetzt
  mechanisch und wird mit jedem Loop teurer, der den alten Wert in eine neue Abfrage schreibt —
  dieselbe Abwägung wie `scheduled → confirmed` in ADR-018 Punkt 6.
- Entsteht der **Gebührenanlass** aus ADR-018 Punkt 8 (Absage unter 24 Stunden) auch im
  Dienstvertrag über Training? Das ist eine Vertrags- und AGB-Frage des Projektinhabers, keine des
  Datenmodells; bis sie beantwortet ist, gilt die Regel unverändert für die Behandlung.
- Braucht die **Korrektur eines falsch gesetzten Kontexts** vor dem Termin einen eigenen Weg? Punkt
  10 verweist auf Absage und Neuanlage, und eine Absage ist nach ADR-018 endgültig — im Bestand
  stünde dann eine Absage, die nie kommuniziert wurde.
- Sieht die spätere Trainingsrolle **interne Termine**? Blocker und Pausen sind Betriebsdaten ohne
  Personenbezug; die Antwort gehört zum Rollenschnitt in E18 Schritt 5.
- Trägt ein Trainingstermin als Hausbesuch einen **Adress-Snapshot** wie der Behandlungstermin
  (ANN-003), und aus welcher Quelle? Die Anschrift steht an `persons`, erreichbar über das
  Trainingsverhältnis — die Kopie bleibt eine Kopie.

## Änderungshistorie

| Fassung | Datum      | Änderung                                                                              |
| ------- | ---------- | ------------------------------------------------------------------------------------- |
| 1       | 2026-09-20 | Erstfassung, vorgeschlagen nach E18 (Projektinhaber, 2026-09-17); Schritt 2 von sieben. |
