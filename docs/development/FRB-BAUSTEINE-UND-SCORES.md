# FRB — Untersuchungsbausteine und Scores: Plan der Integration

Stand 2026-09-21 · **Loop-Vorgabe**: Eingabe für den SPEC-Schritt, kein eigener
Rang · **kein Code, keine Migration** — in dieser Session wurden nur die
Quellen abgelegt und dieser Plan geschrieben

Quelle ist der Arbeitsauftrag von Jannes vom 2026-09-21, wörtlich abgelegt als
[`../../quellen/ARBEITSAUFTRAG_Bausteine-und-Scores.md`](../../quellen/ARBEITSAUFTRAG_Bausteine-und-Scores.md).
Das Material selbst liegt in [`../../quellen/README.md`](../../quellen/README.md).
Dieses Dokument ersetzt keinen Schritt des
[Feature-Loops](GRAPH-ENGINEERING-WORKFLOW.md), keinen ADR und keine Zeile der
[ROADMAP.md](ROADMAP.md) — es sagt, in welcher Reihenfolge welche Loops was
bauen, woran sie gemessen werden und was vorher entschieden sein muss.

## 1. Was vorliegt

| Inhalt                        | Umfang                                                                         | Quelle                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| MT-Untersuchungsbausteine     | 9 Regionen, Basis- und weiterführende Untersuchung, Spezialblöcke, Therapie     | [`bausteine/mt-untersuchung-quelldaten.md`](../../quellen/bausteine/mt-untersuchung-quelldaten.md)         |
| Scores (PROMs)                | 18 Instrumente (14 davon Priorität A), zusammen 311 bezifferte Items          | [`scores/score-inventar.md`](../../quellen/scores/score-inventar.md), 18 PDFs im Repository                |
| Eckdaten und Rechenvorschrift | je Score: Items, Antwortformat, Wertebereich, Richtung, Subskalen, MCID/MDC      | Blätter **Inventar** und **Scoring** der Tabelle                                                          |
| Itemtexte                     | **nur in den PDFs**                                                             | `quellen/scores/pdf/`, dazu die Extrakte in `quellen/scores/pdf-text/`                                     |

Die MT-Bausteine haben in der Roadmap **noch keine Zeile**; sie sind neuer
Umfang aus dem Arbeitsauftrag. Die 18 Scores füllen **FRB-001**
(Instrumentenbibliothek) und **FRB-003** (Anamnesebogen) der Etappe 2 mit
Inhalt. Beides gehört fachlich zum strukturierten Erstbefund, den die Roadmap
als „zweitgrößten Zeitfresser nach der Dokumentation" führt.

## 2. Leitprinzip

**Der Code kennt kein einziges Instrument namentlich — er kennt nur das
Schema.** Ein neuer Test oder Score ist eine Datei, kein Commit an einer
Komponente. Das ist die Vorgabe des Arbeitsauftrags und deckt sich mit
[ADR-014](../adr/ADR-014-foundational-data-model.md): keine Spalte und kein
Zweig für einen Einzelfall.

Drei Zusicherungen hängen daran und gelten in jeder Phase:

1. **Jede Definition hat eine `version`; jedes gespeicherte Ergebnis speichert
   die verwendete `definition_version` mit.** Ohne das bricht jeder Verlauf,
   sobald ein Item korrigiert wird — und korrigiert wird, siehe D3 und D4.
2. **IDs sind stabil** (snake_case, sprechend, `knie_lachmann_test`). Ein
   geändertes Label ändert die ID nicht. Eine ID, die einmal in einem Ergebnis
   steht, verschwindet nie.
3. **Der Wortlaut ist unantastbar** — samt der Tippfehler der Vorlage. Die
   Begründung steht in [`../../quellen/README.md`](../../quellen/README.md),
   Regel 1, und ist bei den Scores keine Formsache: eine geänderte
   Formulierung hebt die Vergleichbarkeit mit den Normwerten auf.

## 3. Die MDR-Grenze — was gebaut werden darf und was nicht

Das ist der Teil, den der Arbeitsauftrag nicht regelt und der über den
Zuschnitt entscheidet. Maßgeblich ist
[ADR-006](../adr/ADR-006-medical-device-boundary.md) Fassung 3.

| Funktion                                                                   | Erlaubt?                                                       |
| -------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Test abhaken, Ergebnis und Messwert erfassen, Dokumentationstext erzeugen   | **ja** — Punkt 2, Erfassen und Strukturieren                   |
| Summe, Prozentwert, Subskala nach veröffentlichter Rechenvorschrift rechnen | **ja** — Punkt 2, „transparente mathematische Berechnungen"     |
| Rohwert und Subskalenwerte im Verlauf über die Zeit zeigen                  | **ja** — Punkt 2 und 11 Satz 1                                 |
| Antwort des Patienten unverändert und mit Quelle hervorheben                | **ja** — Punkt 3, §7.1, Regel muss offenliegen                 |
| Cut-off, Risikoklasse, MCID oder „Verschlechterung" **anzeigen**            | **nein** — Punkt 11, bis B1 entschieden ist                    |
| Aus Red Flags oder Screening eine Empfehlung ableiten                       | **nein** — Punkt 12, Ausschlusskriterium nach Punkt 13         |

Abschnitt 3 ist zugleich Material für die Sitzung „**`MDR_REVIEW_REQUIRED`
verorten**", die [`../STATUS.md`](../STATUS.md) als eigene Aufgabe führt: Die
Anzeige von Cut-off und MCID ist ein konkreter Kandidat, und die drei Verbote
aus ADR-006 Fassung 3 treffen hier zum ersten Mal auf ein Feature mit Inhalt.

Daraus vier Festlegungen für den Zuschnitt:

- **Speichern ja, anzeigen später.** `cutoffs`, `mcid` und `mdc` gehören in die
  Definition — sie stehen im Inventar, und was jetzt nicht mitkommt, ist
  später neu zu recherchieren. Ihre **Darstellung** ist ein eigenes Feature und
  nach ADR-006 Punkt 6 als `MDR_REVIEW_REQUIRED` zu kennzeichnen. Die offene
  Frage dahinter führt ADR-006 als Folgefrage und
  [`../product/ideen/04-assessments-outcomes-fortschritt.md`](../product/ideen/04-assessments-outcomes-fortschritt.md)
  als `IDEA-OUT-002`: Ist die Anzeige eines **veröffentlichten** Schwellenwerts
  neben dem eigenen Ergebnis schon eine Klassifikation? Beantworten kann sie nur
  die externe Prüfung nach ADR-006 Punkt 7, also die Anfrage **B1** in
  [`../decisions/ANFRAGEN.md`](../decisions/ANFRAGEN.md). Solange sie offen ist,
  wird die Anzeige nicht gebaut.
- **STarT Back und PHQ-4 sind Sonderfälle.** Ihr Zweck *ist* eine
  Risikoklasse beziehungsweise ein „positives Screening". Rechnen und Rohwert
  zeigen ist von Punkt 2 gedeckt, die Klassenbezeichnung ist von Punkt 11
  erfasst. Beide kommen als Definition und Rohwert, die Einordnung bleibt aus
  der Oberfläche. Das ist keine Lücke, sondern der konservative Zweig, den
  Punkt 13 verlangt.
- **Der Anamnesebogen ist reine Erfassung.** 39 Fragen, kein Summenscore. Die
  Red-Flag-Fragen werden erhoben und vollständig gezeigt; eine abgeleitete
  Warnung oder ein Hinweis auf einen Arztbesuch entsteht nicht (Punkt 12).
- **Die MT-Bausteine sind MDR-unkritisch.** `positiv`/`negativ` ist der Befund
  der Therapeutin, den sie selbst einträgt; der Dokumentationstext ist
  deterministische Textmontage, keine generative KI und damit auch kein Fall
  von Punkt 5 oder ADR-016 Punkt 10. Deshalb stehen sie im Plan vorn: fachlich
  wertvoll, regulatorisch ruhig.

## 4. Wo die Dinge im Repository landen

Modularer Monolith nach [ADR-015](../adr/ADR-015-initial-technical-stack.md),
fachlich geschnitten:

```
src/features/assessments/
  schema.ts                  Zod-Schema beider Datenmodelle + Validator
  definitionen/
    bausteine/<region>.json  9 Dateien, eine je Region
    scores/<score-id>.json   18 Dateien, eine je Instrument
  dokumentationstext.ts      Generator Block -> Absatz
  <Komponenten>              Renderer, Prototyp
```

`zod` ist schon Abhängigkeit — **keine neue Dependency** für Schema oder
Validierung. Für den Druck gilt derselbe Weg wie bei Tagesplan, Terminzettel
und Tourenliste: eine `@media print`-Fassung, keine PDF-Bibliothek
(vergleiche [`../decisions/rechnungs-pdf-optionen.md`](../decisions/rechnungs-pdf-optionen.md),
Weg 1). Vor Arbeit an einem Vorschaubereich gilt
[ARBEITSBEREICHE.md](ARBEITSBEREICHE.md).

**Definitionen als Dateien, Ergebnisse in der Datenbank.** Die Bibliothek ist
Produktinhalt, für alle Mandanten gleich und Teil des Releases — nur so ist
`definition_version` überhaupt etwas Festes. Ergebnisse sind Gesundheitsdaten
und brauchen `organization_id`, RLS und eine Löschfrist. Der genaue Schnitt der
Tabellen ist Sache des SPEC-Schritts im jeweiligen Loop, nicht dieses Plans.

Drei Dinge, die dabei niemand übersehen darf:

- **Das Rechtsverhältnis hängt am Ergebnis, nicht am Instrument.** Ein
  Fragebogen, den eine Trainingskundin ausfüllt, steht auf
  Art. 9 Abs. 2 lit. a DSGVO (ausdrückliche Einwilligung) und hat nach
  [ADR-021](../adr/ADR-021-service-areas-and-legal-relationships.md) eine
  **andere Löschfrist** als derselbe Fragebogen einer Patientin (lit. h, zehn
  Jahre). Die Ergebniszeile trägt den Kontext nach
  [ADR-022](../adr/ADR-022-appointment-context-and-training-basis.md). Die
  Struktur dafür steht seit **LEI-EPIC-001** (Roadmap 5.28): `patients` und
  `training_relationships` stehen nebeneinander, verbunden allein über
  `person_id`, und `retention_classes` führt `patientenakte` und
  `trainingsverhaeltnis` als getrennte Klassen. Ein gemeinsamer Fremdschlüssel
  auf `patients` wäre der Fehler, der diese Trennung wieder einreißt.
  **Die Frist für Gesundheitsangaben im Training ist offen** — LEI-EPIC-001 hat
  sie bewusst offengelassen und B2 beantwortet sie. P6 braucht sie und erfindet
  sie nicht ([ADR-008](../adr/ADR-008-data-retention-and-deletion.md)).
- **Der bearbeitete Text darf nicht überschrieben werden.** Der erzeugte
  Dokumentationstext ist ein Vorschlag; sobald die Therapeutin ihn übernimmt,
  ist er ein Eintrag nach
  [ADR-016](../adr/ADR-016-clinical-documentation-record.md) — `Entwurf`, dann
  `finalisiert`, danach jede Änderung eine neue Version. Ein erneuter Klick auf
  einen Test erzeugt den Text **neu**, ersetzt aber nichts Finalisiertes.
- **Der Patientenlink ist ein eigener Loop.** „Digital ausfüllbar durch den
  Patienten" heißt: Zugang ohne Praxisanmeldung zu einem Gesundheitsfragebogen.
  Das berührt [ADR-004](../adr/ADR-004-authorization-model.md) und **B5**
  (Patientenidentität) und gehört nicht in den Prototyp.

## 5. Phasen

Reihenfolge wie im Arbeitsauftrag §6, mit den Gates dieses Repositories. Die
Loop-Kennungen sind **Vorschläge** — echt werden sie, wenn die Roadmap sie
aufnimmt. Jede Phase endet mit Bericht und Stopp; die nächste beginnt nicht von
allein.

| Phase                                     | Was entsteht                                                                                                                         | Objektive Abnahme                                                                                                                                  | Pfad (K1)                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| **P0** — erledigt 2026-09-21              | Quellen abgelegt, Register mit Prüfsummen, dieser Plan                                                                               | `pnpm test` (`src/quellen.test.ts`), `pnpm docs:check`                                                                                             | unkritisch                      |
| **P1** — Schema und Validator             | `schema.ts` für beide Datenmodelle, Validator, keine Oberfläche, keine Datenbank                                                      | Validator weist eine Definition ohne `version`, mit doppelter ID und mit unbekanntem `result_type` zurück — je ein Test                             | unkritisch                      |
| **P2** — Bausteine als Daten              | 9 Regionen aus der Quelldatei, vier Blöcke als `"status": "unvollstaendig"`                                                           | **Zähltest gegen die Tabelle im Arbeitsauftrag §2** — Items je Block exakt; Abweichung ist ein Fehler, keine Rundung                                | unkritisch                      |
| **P3** — Renderer, Text, Prototyp         | Region wählen, Blöcke aufklappen, abhaken, Live-Vorschau des Dokumentationstexts mit Kopier-Schaltfläche                              | Generator-Tests: `nicht_durchgefuehrt` erscheint nicht, Reihenfolge = Definition, leerer Block ohne Überschrift, Format `<Label><, Seite>: …`; 375 px | **S** ohne Persistenz, sonst **A** |
| **P4** — Scores: VISA-A und KOOS          | zwei Definitionen mit Itemtexten, Rechenvorschrift, Referenzfall                                                                      | Referenzfall je Score; **expliziter Test zur Gegenläufigkeit KOOS/HOOS**; KOOS-Missing-Value-Regeln                                                 | **A** ab Persistenz             |
| **P5** — die übrigen 16                   | Definitionen inkl. Anamnesebogen (39 Fragen)                                                                                         | Itemzahlen wie im Arbeitsauftrag §3; je Score ein Referenzfall; FABQ zeigt 16, wertet 11                                                            | **A**                           |
| **P6** — Erheben, Speichern, Verlauf      | Ergebnisse je Bereich, Verlaufsdarstellung ohne Bewertung, Druckfassung                                                              | `pnpm test:db` mit Negativtests nach ADR-013 Punkt 9, Löschpfad je Bereich, Auditeintrag                                                            | **A**, Review-Checkliste        |

**Ein Referenzfall gehört zur Definition, nicht in eine Schlussphase.** Ein
Score ohne bekannte Antwortkombination und erwarteten Wert ist nicht fertig —
er ist unbelegt. Der Arbeitsauftrag sagt dasselbe („Grün heißt erst grün, wenn
der stimmt"); hier steht es als Bedingung je Datei statt als eigener Schritt.

### Was P4 und P5 praktisch heißt

Alle 18 PDFs haben eine brauchbare Textebene; `pdftotext -layout -enc UTF-8`
liefert Itemtexte, die sich übernehmen lassen — die Extrakte liegen in
`quellen/scores/pdf-text/`. Zwei Fallen sind belegt:

- **Die Zuordnung Option zu Punktwert verrutscht.** Beim VISA-A stehen in
  Frage 7 die Punktwerte 0, 4, 7 und 10 versetzt neben den vier Aussagen. Die
  Punktzuordnung ist deshalb **am PDF zu sichten**, nicht aus dem Extrakt zu
  übernehmen. Das gilt für jeden Score mit tabellarischem Antwortraster.
- **Die Vorlage widerspricht sich beim HOOS.** Das PDF nennt 39 Items und
  156 Punkte, die Originalversion hat 40. Das ist D4 und wird nicht durch die
  wahrscheinlichere Zahl entschieden.

## 6. Was vorher entschieden sein muss

| ID     | Frage                                                                                                                                                              | Wer      | Blockiert   |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ----------- |
| ~~**D1**~~ | ~~Dürfen die 18 PDFs und die **Itemtexte** in ein **öffentliches** Repository?~~ **Entschieden am 2026-09-21: ja.** Jannes hat die Frage samt dem Unterschied zwischen Nutzung und Weiterveröffentlichung vorgelegt bekommen und sie so entschieden. PDFs und Extrakte liegen seit demselben Tag im Repository; die Definitionen dürfen ihre Itemtexte tragen. Begründung und die Folge — eine Rücknahme braucht einen Umbau der Historie — in [`../../quellen/README.md`](../../quellen/README.md) | Jannes   | nichts mehr |
| **D2** | Vier unvollständige Blöcke der MT-Vorlage — offen lassen (Vorschlag) oder nachliefern: Schulter „Untersuchung ACG", LWS „Untersuchung SIG", LWS „Behandlung", HWS „Therapie Hochzervikal" | Jannes   | P2 (nicht blockierend: sie werden als offen angelegt) |
| **D3** | Tippfehler der Vorlage stehen lassen (Vorschlag) oder korrigieren: „Relocation Tet", „Supinatin", „Lachmann", „Painfull Arc Sign", „Traininigs"                     | Jannes   | P2          |
| **D4** | HOOS: 39 Items laut PDF oder 40 laut Original                                                                                                                      | Jannes   | P5          |
| **D5** | TSK-GV: das PDF weist keine Punktwerte aus. Standardvergabe 1–4 annehmen oder aus der Primärliteratur belegen                                                       | Jannes   | P5          |
| **D6** | Umgang mit unbeantworteten Items, wo die Vorlage „im PDF nicht geregelt" sagt (ODI, RMDQ, NDI, FABQ, PCS und weitere) — je Score festlegen, nicht global raten       | Jannes   | P4, P5      |
| **B1** | Darf ein **veröffentlichter** Cut-off oder MCID neben dem eigenen Wert stehen? Gehört in die externe Prüfung nach ADR-006 Punkt 7, nicht in einen Loop             | extern   | nur die Anzeige, keine Phase |
| **B8** | Lizenzbeleg. Jannes hat am 2026-09-21 erklärt, es gebe keine Lizenzierung und alle Inhalte dürften integriert werden; der schriftliche Beleg des Lizenzgebers fehlt weiter | Jannes, Lizenzgeber | nichts vor M3 |

**Damit blockiert keine Entscheidung mehr.** D1 war die einzige, die
vorgezogen werden musste, weil ein gepushter Blob und ein veröffentlichter
Itemtext nicht zurückzunehmen sind; sie ist entschieden. D2 bis D6 werden nach
`PROJECT_PRINCIPLES.md` §15.1 im jeweiligen Loop als Annahme entschieden,
reversibel an genau einer Stelle verankert und als `ANN-NNN` registriert — der
Vorschlag steht jeweils schon in der Spalte.

**In dieser Session wurde keine Annahme registriert.** `pnpm docs:check`
verlangt für jeden `ANN-NNN` einen Anker in `src/`, `supabase/migrations/` oder
`.github/workflows/` — ohne Code gibt es keinen Anker. Die Annahmen entstehen
mit dem Loop, der sie braucht.

## 7. Ausdrücklich nicht Teil dieses Plans

1. Testbezeichnungen oder Itemtexte umformulieren, ergänzen oder stillschweigend
   korrigieren.
2. Scores, Item-Reihenfolgen oder Antwortoptionen aus dem Modellwissen
   rekonstruieren, statt sie aus den PDFs zu lesen.
3. Fehlende Werte — MCID, Missing-Value-Regel, ACG-Block — mit plausiblen
   Annahmen füllen.
4. Scoring-Logik in eine Komponente schreiben, statt sie aus der Definition zu
   lesen.
5. Jede Anzeige, die aus einem Wert eine Bewertung macht (Abschnitt 3).
6. Der Patientenlink und der Therapiebericht. Beides hat eigene
   Voraussetzungen; **DOK-005** steht in der Roadmap hinter FRB-EPIC-002.
