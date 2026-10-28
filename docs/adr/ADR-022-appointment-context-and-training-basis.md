# ADR-022: Terminkontext und Trainingsgrundlage — ein Kalender, ein Kontext je Termin
## Status
Angenommen 2026-09-20 (Jannes, E18 Schritt 2), löst ADR-020 nicht ab; Protokoll nur nach ADR-010.

## Kontext
Trainingstermine gehören in den Kalender; E18 Abschnitt 2 verlangt drei Kontexte. Nicht Gegenstand:
Schema (ADR-014), Trainingsbereich (E18 Abschnitt 6), Steuer, Nummernkreise und ob eine
Trainingsrechnung `documented` voraussetzt (ADR-009, §19), MDR (ADR-006), Trainingsrolle (§4.9).

## Entscheidung
1. **Ein Kalender, eine Terminentität:** Behandlungs-, Trainingstermin und internes Ereignis stehen
   in derselben Tabelle, damit die EXCLUDE-Constraint jede Doppelbuchung verhindert (ANN-049).
2. **Der Kontext ist die vorhandene Terminart, kein zweites Feld:** `kind` ist `therapy`, `training`
   oder `internal`; ein Termin hängt an genau einem Rechtsverhältnis oder an keinem.
3. **Der Kontext entscheidet das Verhältnis:** je Kontext genau eines von `patient_id` und
   `training_relationship_id`, intern keines (`appointments_kind_fields`, ADR-021 Punkt 3).
4. **Ein Trainingstermin hängt nie an der Behandlungsgrundlage:** `treatment_basis_id` bleibt
   außerhalb von `therapy` leer (dieselbe Constraint; ADR-020 Punkt 4, ADR-021 Punkt 5).
5. **Die Trainingsgrundlage (`training_bases`) ist eine eigene Klammer, keine dritte Bauart:** am
   Trainingsverhältnis, ohne klinische Felder; ADR-020 gilt nur für `therapy`. Pflicht ist das
   Verhältnis, nicht die Klammer (ADR-014): Einzelstunden ohne vereinbarte Anzahl bleiben möglich.
6. **Keine Behandlungsdokumentation am Trainingstermin:** Die Datenbank lässt ADR-016-Einträge nur
   am Behandlungstermin zu; die automatische Finalisierung (ADR-016 Punkt 7) erreicht ihn nie.
7. **Das Trainingsprotokoll ist ein Fachdatum des Trainingsverhältnisses**, nicht von `persons` oder
   Behandlungstermin (ADR-021 Punkt 5), kein Eintrag nach ADR-016: eigene Datenklasse und Frist
   (ADR-021 Punkt 4), keine Versionspflicht aus § 630f BGB; Akteninhalte nur nach ADR-021 Punkt 7.
8. **Ein Zustandsautomat, Invariante je Kontext:** ADR-018 gilt für `therapy` und `training`, intern
   ohne Abschluss, Doku und Nichtantreffen; `documented` heißt bei `therapy`
   finalisierte Behandlungsdokumentation, bei `training` abgeschlossenes Trainingsprotokoll (ADR-018
   Punkt 3, beide Richtungen).
9. **Der Kanal bleibt eine eigene Dimension:** `appointment_type` sagt, wo und worüber, der Kontext,
   was und für wen; intern kein Hausbesuch, im Training alle drei Kanäle.
10. **Der Kontext steht mit dem Anlegen fest:** kein freier Wechsel über die Tabelle (wie beim
    Status, ADR-018 Punkt 2); ein falsch angelegter Termin wird abgesagt und neu angelegt.
11. **Kein Durchgriff außer der Belegung:** Die Policies filtern nach Kontext; wer nur die
    Trainingsrolle hat, liest keinen Behandlungstermin, weder Person noch Titel noch Grundlage
    (ADR-021 Punkt 6). Die EXCLUDE-Constraint wirkt über alle Kontexte und verrät, bewusst
    hingenommen, nur Zeit und Mitarbeitende, nie den fremden Termin; Schreibpfade melden nur
    „belegt“ (Negativfall in `pnpm test:db`).

## Konsequenzen
Gelöscht wird je Zeile am Kontext, nicht je Tabelle (`retention_assignments`). Jede Abfrage nennt
ihren Kontext; Trainingstermine folgen denselben Protokollregeln wie Behandlungstermine (ADR-010).

## Offene Folgefragen
- Eigener Weg für einen vor dem Termin falsch gesetzten Kontext? Absagen sind endgültig (ADR-018).
- Gebührenanlass im Training? Vorerst keiner, eine eigene Entscheidung steht aus (ANN-178).

## Änderungshistorie
- Fassung 1 (2026-09-20, Jannes, E18 Schritt 2): eine Spalte, drei Kontexte, je Kontext ein
  Verhältnis, Trainingsgrundlage ohne klinische Felder, keine Behandlungsdoku am Trainingstermin.
- Verdichtet 2026-10-27 (Aufräumen 5), Inhalt unverändert; früherer Wortlaut: `git log -p`.
