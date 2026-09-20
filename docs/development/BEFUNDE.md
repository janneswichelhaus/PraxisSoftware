# Befunde an der laufenden Anwendung

Stand: 2026-09-19

## Zweck

Hier stehen **Befunde aus Abnahmen, Screenrecordings und Reviews an der
laufenden Anwendung** — Beobachtungen an etwas, das gebaut ist, nicht Ideen
für etwas, das fehlt. Ideen gehören in `docs/product/` (Rang 6); ein Befund
gehört hierher, weil er Gebautes korrigiert.

Die Liste ist die **Eingabe für die erste Story des nächsten Loops derselben
Spur** — so verlangt es Roadmap-Regel R6 („Befunde im Folge-Loop derselben
Spur", `ROADMAP.md`, Risiken). Sie hat **keinen Rang** in der
Dokumentenhierarchie, ist **kein Auftrag** und führt **keine zweite
Reihenfolge**: Was wann gebaut wird, steht ausschließlich in `ROADMAP.md`.
Ein Befund wird verbindlich erst im SPEC-Schritt des Loops, der ihn aufnimmt.

**Ablaufrunden ruhen.** Die Ablaufrunden nach [`OPTIMIERUNG.md`](OPTIMIERUNG.md)
sind bis Probewoche 1 (Roadmap H1, Feb 2027) eingefroren — Entscheidung von
Jannes vom 2026-09-13. Bis dahin werden Befunde nicht in Ablaufkarten
gemessen, sondern **hier gesammelt** und über R6 in die Loops gegeben. Was
eine Ablaufrunde später messen soll, bleibt hier als Befund stehen, bis die
Runden wieder aufgenommen werden.

## Form

Jeder Befund trägt:

| Feld    | Inhalt                                                                                   |
| ------- | ---------------------------------------------------------------------------------------- |
| Kennung | `BEF-NNN`, fortlaufend, nie wiederverwendet, nie umnummeriert                           |
| Datum   | Tag der Beobachtung                                                                      |
| Bereich | Arbeitsbereich oder Seite (`ARBEITSBEREICHE.md`)                                         |
| Quelle  | Wer hat es wie gesehen: Abnahme, Screenrecording, Review, Herkunft aus dem Ideenspeicher |
| Status  | `offen` · `eingeplant in <Loop>` · `erledigt in <Loop>`                                  |

Ein erledigter Befund bleibt stehen, mit dem Loop, der ihn geschlossen hat.
Messwerte (Pixel, Taps, Sekunden) sind Beobachtungen von Jannes selbst oder
aus dem Code — nie aus Telemetrie und nie an Mitarbeitenden (§20).

---

### BEF-001 — Dokumentieren ohne Scrollen: was wirklich im Weg steht

| | |
|---|---|
| Datum | 2026-09-11 |
| Bereich | Behandlungsdokumentation (`/termine/:id/dokumentation…`), „Behandlung abschließen" |
| Quelle | Jannes, 2026-09-11; Codebefund und Messung Claude, 2026-09-11 · aus `IDEA-PRX-038`, 2026-09-12 |
| Status | offen |
| Berührt | §8.1; ADR-016; UX-007, UX-009, DOK-001/002; `ANN-015`, `ANN-019`; ABR-002 |

**Beobachtung.** Die Textfelder der Dokumentation sollen ohne Scrollen sichtbar
sein; womöglich helfen Unterseiten, damit das Auge nicht an Unwichtigem hängen
bleibt.

**Befund aus dem Code (2026-09-11), bevor irgendetwas gebaut wird.** Die
beiden Dokumentationsseiten sind **nicht** schlecht sortiert.
`CompleteTreatmentPage` und `TreatmentNotePage` stellen das Textfeld an die
zweite Stelle, direkt hinter die Textbausteinleiste. Wer hier „Feld nach oben"
baut, baut etwas, das schon so ist. Das Scrollen kommt aus zwei anderen
Richtungen:

1. **Das Gerüst über dem Feld.** Auf einem 375 × 667-Telefon stehen vor dem
   Feld: Kopfzeile (56), Untermenü, Seitentitel mit Beschreibung,
   Textbausteinleiste. Das sind grob 250 von 667 Punkten, bevor die erste
   Zeile kommt. Seit DS-001 ist der Seitentitel 32 px statt 22 — der Befund
   hat sich also gerade **verschärft**, nicht entspannt.
2. **Der Weg dorthin.** Aus der Akte heraus liegt die Dokumentation hinter
   Person, Kontakt, Hausbesuch und Versorgung. Der kurze Weg ist der über
   „Übersicht" → „Behandlung abschließen"; wer ihn nicht kennt, scrollt.

**Potenziale.**

- Ein eigener Schreibmodus: Feld, Textbausteine, eine Aktion. Kein Untermenü,
  keine Seitenbeschreibung, Titel einzeilig. Das ist der größte Hebel und
  ändert an der Fachlogik nichts.
- Fokus auf das Feld beim Öffnen — spart den ersten Tipp.
- Unterseiten je Schritt (Doku → Heilmittel → Abschluss), wenn der Abschluss
  ohnehin mehr entscheidet als heute (siehe `IDEA-PRX-039`).

**Risiken — und eines davon ist ein Stopp.**

- **Die Patientenidentität darf nicht verschwinden.** Der Seitentitel trägt
  heute Name, Datum und Uhrzeit. Wer ihn wegkürzt, um Platz zu gewinnen,
  nimmt die einzige Kontrolle gegen die Falschzuordnung heraus — und
  „Datenverlust/Falschzuordnung" ist genau die Befundklasse, an der M6
  hängt. Platz sparen ja, Identität nein.
- **Unterseiten vervielfachen die Stellen, an denen Text verloren geht.**
  Es gibt bewusst keinen lokalen Zwischenspeicher (`ANN-015`); der Entwurf
  liegt serverseitig. Der bekannte Restpunkt aus VER-003 — Entwurf bleibt beim
  Verlassen über die Hauptnavigation liegen statt verworfen zu werden — ist
  genau dieser Fehlerklasse. Jede zusätzliche Seite ist eine zusätzliche
  Gelegenheit dafür.
- **ADR-016 Punkt 4 und 5 verbieten, die Folge zu verstecken.** Der Text
  „Mit dem Abschluss geschieht zweierlei …" steht heute absichtlich **vor**
  der Schaltfläche, nicht in einer Rückfrage danach. Auf eine andere
  Unterseite geschoben wäre das eine Aufweichung, kein Feinschliff.
- **§8.1 gibt 60 Minuten einschließlich Dokumentation.** Ein Assistent mit
  vier Schritten kostet Tipps und schafft vier Stellen zum Steckenbleiben.
  Mehr Seiten sind nur dann besser, wenn jede Seite eine Entscheidung
  abnimmt — nicht, wenn sie nur aufteilt.
- Mehr Routen heißen mehr Routen-Wächter und mehr RLS-Fläche (ADR-004).

**Gemessen am 2026-09-11, nach dem ersten kleinen Schritt.** Der Seitentitel
der Dokumentationsseiten ist jetzt kompakt (`PageHeader kompakt`). Auf
375 × 667 beginnt das Textfeld damit bei **359 statt 413 Punkten**, sichtbar
sind **308 statt 254**. Das sind 54 Punkte und ein Fünftel mehr Feld — und es
**löst den Befund nicht**: das Feld startet weiter über der Hälfte des
Schirms. Die verbleibende Höhe steckt in der Kopfzeile (56), im Untermenü
„Kalender · Touren" — das beim Schreiben nichts beiträgt — und in der
Polsterung des Inhalts. Der nächstgrößere Hebel ist damit benannt und
gemessen, nicht vermutet.

**Nachtrag zur Lage seit dem 2026-09-12.** Der Weg aus der Akte hat sich mit
AKTE-000 bis AKTE-005 und UI-002a geändert (Rahmen mit Bereichen, „Übersicht"
der Akte entfallen); der Textverlust-Schutz greift seit FIX-EPIC-003 und
FIX-014 auch bei interner Navigation und beim Abmelden. Die Messung oben ist
vom 2026-09-11 und **nicht** nachgemessen — wer den Befund aufnimmt, misst
zuerst neu.

**Wie es weitergehen sollte.** Nicht als freier Umbau. Ursprünglich als
Eingabe für eine Ablaufrunde „Übersicht" nach [`OPTIMIERUNG.md`](OPTIMIERUNG.md)
gedacht; die Runden ruhen bis Probewoche 1 (siehe oben). Bis dahin gilt R6:
erste Story des nächsten Loops derselben Spur, mit Jannes' eigener
Beobachtung an einem echten Tag als Eingabe (§20: gemessen wird nur durch ihn
selbst) — ohne die bleibt jede Umsortierung geraten.

---

### BEF-002 — Aktionen der Tageskarte neu ordnen

| | |
|---|---|
| Datum | 2026-09-11 |
| Bereich | Übersicht – Tagesliste des Hausbesuchstags (`/`), Tageskarte |
| Quelle | Jannes, 2026-09-11 (mit Screenshot); Risikoanalyse Claude · aus `IDEA-PRX-040`, 2026-09-12 |
| Status | offen |
| Berührt | UX-001, UX-007; ADR-019; MAP-005, MAP-006; `IDEA-PRX-039` |

**Beobachtung.** Die Reihenfolge der Aktionen auf der Tageskarte stimmt nicht:
die Telefonnummern stehen vorn, obwohl sie selten gebraucht werden. Gewünscht
sind stattdessen ein eigenes Feld **„Doku"**, ein Abhaken statt „Behandlung
abschließen" (siehe `IDEA-PRX-039`), und „Navigation starten" braucht es hier
womöglich gar nicht mehr, sobald die Karte in der Anwendung steht.

**Potenziale.**

- „Doku" als eigene Aktion macht den häufigsten Weg zum kürzesten und zahlt
  direkt auf BEF-001 ein.
- Weniger Schaltflächen nebeneinander heißt größere Ziele auf dem Telefon.

**Risiken.**

- **Die Rufnummer ist die Rettung des gescheiterten Besuchs.** Wenn niemand
  öffnet, ist sie die einzige Handlung, die den Termin noch rettet — und
  genau dann steht man im Hausflur, mit Handschuhen. Nach hinten ja,
  weggeklappt nein. Ihre heutige Stelle stammt aus UX-001, nicht aus
  Zufall. Seit E14 (2026-09-13) ist die Rufnummer zudem Teil des Protokolls
  beim Nichtantreffen (15 Minuten, Klingeln, Anruf — gebaut mit CAL-018,
  2026-09-16): Die Rückfrage am Termin verlangt die Bestätigung „telefonisch
  angerufen", und wer sie geben soll, braucht die Nummer davor. Sie gehört
  also auf die Karte, nicht dahinter.
- **„Navigation starten" darf erst weichen, wenn die Karte wirklich da ist.**
  Der Handoff ist heute der einzige Weg zur Route. Die Karte kommt mit
  MAP-005/MAP-006 und hängt an ADR-019 — und dessen produktive Freigabe
  steht am Vertrags-, §203- und DSFA-Gate. Die Aktion vorher zu entfernen
  hieße, einen funktionierenden Weg gegen einen geplanten zu tauschen.

**Wie es weitergehen sollte.** Ursprünglich als Eingabe für die Ablaufrunde
„Übersicht" gedacht; die Runden ruhen bis Probewoche 1. Bis dahin gilt R6.
Das „Abhaken" hängt fachlich an `IDEA-PRX-039` und damit an ABR-002 — der
Befund allein ordnet Schaltflächen, er ändert keinen Vorgang.

### BEF-003 — `appointment-series.test.ts` ist vom Wochentag abhängig und wird an manchen Tagen rot

| | |
|---|---|
| Datum | 2026-09-15 |
| Bereich | Gate `pnpm test:db` — `supabase/tests/appointment-series.test.ts`, Abschnitt „Konfliktpruefung" |
| Quelle | Gruppe-5-Lauf der Konsolidierung R2; auf dem Stand vor und nach der Gruppe identisch reproduziert |
| Status | behoben in R2 (Nachtrag 5c, R2-040) |
| Berührt | CAL-007; ADR-013 (Pflichtprüfung „Migrationen und RLS-Policies") |

**Beobachtung.** Drei Tests des Abschnitts „Konfliktpruefung" schlagen fehl,
wenn `heute + 40 Tage` auf ein Wochenende fällt. Am 2026-09-15 ist das der
Fall: 25.10., 01.11. und 08.11.2026 sind alles Sonntage, und
`check_appointment_series` meldet zu Recht `outside_working_hours` statt des
erwarteten `null`/`overlap`/`duplicate`. Die Hilfsfunktion `woechentlich`
rechnet in Kalendertagen (`tagInTagen(40 + i * 7)`), während die übrigen
Abschnitte derselben Datei mit `werktagVersatz` ausdrücklich auf einen Werktag
gehen. Der Befund ist **nicht** durch die Konsolidierung entstanden: Weder die
Testdatei noch eine Migration ist auf dem Branch angefasst worden, und der Lauf
gegen den Stand davor zeigt dieselben drei Fehlschläge.

**Warum das zählt.** `pnpm test:db` ist eine Pflichtprüfung nach ADR-013. Ein
Gate, das an rund zwei von sieben Tagen ohne Zutun rot ist, lehrt genau das
Gegenteil dessen, wofür es da ist — und lädt dazu ein, ein rotes Gate als
„gehört so" zu lesen.

**Behoben.** Nicht über R6, sondern sofort als **R2-040** — ein Gate, das an
zwei von sieben Tagen ohne Zutun rot ist, hätte sonst den Pull Request dieser
Runde blockiert. `woechentlich` nimmt jetzt den ersten Werktag ab dem Versatz
als Startpunkt; der Wochenabstand hält alle weiteren auf demselben Wochentag.
Geändert ist ausschließlich die Testdatei — keine Migration, keine Policy, und
`check_appointment_slots` selbst bleibt unberührt. Die drei Tests, die
`outside_working_hours` ausdrücklich prüfen, rechnen weiter mit rohen
Kalendertagen: Ein Beginn um 05:00 liegt an jedem Wochentag außerhalb.
Beleg: `pnpm test:db` 1 311 von 1 311 grün (2026-09-15).

### BEF-004 — Dateien lassen sich am Auditeintrag vorbei laden

|           |                                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------- |
| Datum     | 2026-09-15                                                                                        |
| Bereich   | Dateien in der Akte, Verordnungsscan — `storage.objects`, `issue_patient_file_link`               |
| Quelle    | Zweitreview in frischem Kontext zu ROL-EPIC-001 (ADR-013 Punkt 9 Nr. 8), am Code bestätigt        |
| Status    | behoben in FIX-015, noch nicht gemergt (PR #42, gestapelt auf PR #41)        |
| Berührt   | DAT-001, ROL-002; ADR-010 Punkt 2 und 14, ADR-017 Punkt 20; ANN-052                               |

**Beobachtung.** Der Objektschlüssel einer Datei ist
`organization_id/(prescription_id oder patient_id)/id` (Spalte `object_key` in
`supabase/migrations/20260913110000_patient_files.sql`). Alle drei Teile kennt
jede Rolle, die die Dateiliste lesen darf — `list_patient_files` liefert die
Datei-`id`. Die SELECT-Policy auf `storage.objects` lässt das Objekt für diese
Rollen zu. Wer die Storage-API direkt anspricht (`createSignedUrl`, `download`,
`list`), lädt eine Datei also, ohne dass `patient_file.link_issued` entsteht.
Die Begründung von ANN-052 („drei zufällige UUID … praktisch unumgehbar")
trägt deshalb nicht: zufällig ja, dem Lesenden aber bekannt.

**Warum das zählt.** Der Weg besteht seit DAT-001 für die therapeutischen
Rollen; seit ROL-002 (E15) gilt er auch für `office` und klinische Dateien.
Nach ADR-004 Fassung 2 ist das Auditlog für `office` die tragende Kompensation
des Lesezugriffs. Der Umweg braucht Absicht und API-Kenntnis, aber kein
zusätzliches Recht.

**Richtung (nicht entschieden).** Ein Zufallsanteil im Schlüssel, der den
Server nur über `issue_patient_file_link` verlässt, oder die serverseitige
Ausstellung nach Freigabe der Edge Runtime (ANN-052, Änderungspfad). Eigener
Loop nach ADR-013 Punkt 9 Nr. 8, vor der ersten echten Datei (OPS-001).

**Behoben (FIX-015, 2026-09-15).** Kein Zufallsanteil — der hätte am Schlüssel,
den ein erstes Öffnen ohnehin preisgibt, nichts geändert. Stattdessen verlangt
die RLS auf `storage.objects` eine **einmalige Freigabe** der anfragenden
Person, die nur `issue_patient_file_link` (mit `patient_file.link_issued`) oder
`claim_storage_deletion_order` (neu mit `storage_deletion.claimed`) anlegt; sie
gilt 30 Sekunden und wird beim ersten Zugriff verbraucht; die Löschfreigabe
trägt nur ein Entfernen, kein Lesen. Das kam aus dem Zweitreview und hat keinen
eigenen roten Lauf: `7787ec5` prüfte das Lesen mit Löschfreigabe noch als
erlaubt, `f8676f9` verlangt das Gegenteil. Die Umgehungswege sind zuerst rot,
dann grün belegt: gegen die laufende Storage-API in
`tests/e2e/authenticated/patient-file-access.spec.ts` (Signieren, Laden,
Auflisten und Kopieren ohne Ausstellung, zweites Signieren nach erlaubtem
Öffnen, Entfernen durch `owner` ohne Ausführung) und in
`supabase/tests/patient-file-access.test.ts`. Ein ausgestellter Verweis bleibt
60 Sekunden nutzbar. Migration `20260915120000_patient_file_access_grants.sql`,
ANN-052 Fassung 2.

### BEF-005 — Lange Wörter sprengen die Verordnungskarte bei 1024 px

|         |                                                                                               |
| ------- | --------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-15                                                                                    |
| Bereich | Verordnungen in der Akte (`/patienten/:id/verordnungen`), Detailzeilen der laufenden Verordnung |
| Quelle  | Sichtprüfung zu ROL-EPIC-001: `pnpm screenshots --breite=1024` als office und als therapist   |
| Status  | offen                                                                                         |
| Berührt | VER-002, AKTE-002; `DetailRow` in `src/components/ui`                                         |

**Beobachtung.** Bei 1024 px meldet das Werkzeug waagerechtes Scrollen um
8 px: Ein langes Wort in der Diagnose („Bewegungseinschraenkung") läuft über
den rechten Rand der zweispaltigen Verordnungskarte. Bei 375 px tritt es nicht
auf. Therapeut:innen sehen das seit VER-002; seit ROL-002 sieht es auch
`office`.

**Warum das zählt.** Diagnosen bestehen oft aus langen Komposita; eine Seite,
die dann seitlich scrollt, widerspricht der Oberflächen-Checkliste
(`docs/abnahme/README.md`, Punkt 1).

**Richtung.** Langes Wort im Wert einer Detailzeile umbrechen
(`overflow-wrap`) — eine Stelle im Baustein, kein Umbau.

### BEF-006 — Die Termin-Detailseite trägt sieben Vorgänge und zeigt eine Tabelle

|         |                                                                                               |
| ------- | --------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-16                                                                                    |
| Bereich | Termin (`/termine/:id`)                                                                       |
| Quelle  | Jannes, 2026-09-16, im Vergleich mit iPrax (`../product/ideen/referenz-iprax.md`)              |
| Status  | offen — Vorgabe in [`CAL-EPIC-004.md`](CAL-EPIC-004.md), AKTE-006                              |
| Berührt | CAL-008, CAL-014, CAL-012/013, UX-007, DOK-001/002, ADR-018; `AppointmentDetailPage.tsx`      |

**Beobachtung.** „Die Ansicht eines speziellen Termins mag ich nicht." Die
Seite zeigt Patient:in, behandelnde Person, Art, Status, Datum und Zeit als
Feldtabelle — im Vergleichsprodukt ist derselbe Termin ein kleiner Dialog im
Kalender, und die Person steht im Mittelpunkt, nicht der Termin.

**Warum das nicht nur Geschmack ist.** An der Seite hängen sieben Vorgänge:
Absage mit codiertem Grund und Eingangszeitpunkt, „nicht angetroffen",
„Behandlung abschließen", „Termin abschließen", Dokumentation,
Mitteilungsvermerk, Navigations-Handoff. Wer die Seite umbaut, entscheidet
über deren Ort — nicht über eine Tabelle.

**Richtung.** AKTE-006 in CAL-EPIC-004: erst festlegen, wohin die sieben
Vorgänge gehen, dann die Darstellung. Kein Vorgang darf dabei einen
Bestätigungsschritt verlieren (ADR-018, §8).

### BEF-007 — Termine der Akte stehen flach, die Verordnung ist nur ein Filter

|         |                                                                                               |
| ------- | --------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-16                                                                                    |
| Bereich | Termine in der Akte (`/patienten/:id/termine`)                                                 |
| Quelle  | Jannes, 2026-09-16                                                                            |
| Status  | offen — Vorgabe in [`CAL-EPIC-004.md`](CAL-EPIC-004.md), AKTE-006                              |
| Berührt | AKTE-003, CAL-007, VER-002; `PatientAppointmentsPage.tsx`, `list_patient_appointments`         |

**Beobachtung.** Termine sollen „immer verordnungsbezogen" erscheinen: fünf
Termine zur laufenden Verordnung, drei zur nächsten, jede mit ihrer eigenen
Überschrift. Heute ist die Liste chronologisch; die Verordnung steht als
Angabe an der Zeile und als Filter in der Adresse (`?verordnung=`), aber sie
gliedert nicht.

**Warum das zählt.** Die Verordnung ist die Klammer, in der die Praxis plant —
und künftig nicht die einzige (E16). Eine flache Liste zwingt zum Zählen von
Hand, genau dort, wo die Deckung entscheidet, ob ein Termin abrechenbar ist.

### BEF-008 — Das Ziehen im Kalender schreibt ohne Rückfrage

|         |                                                                                               |
| ------- | --------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-16                                                                                    |
| Bereich | Kalender (`/kalender`), Ziehen einer Terminkachel                                              |
| Quelle  | Jannes, 2026-09-16                                                                            |
| Status  | erledigt in CAL-EPIC-004a (CAL-023, 2026-09-18)                                                |
| Berührt | CAL-006, UX-010, CAL-003; `CalendarPage.tsx` (`ablegen`), `useTerminZiehen.ts`                 |

**Beobachtung.** Das Loslassen schreibt sofort. Eine Rückfrage erscheint nur,
wenn die Zielzeit außerhalb der Arbeitszeit liegt; danach steht die
Rückgängig-Leiste. Gewünscht ist eine Rückfrage **immer** — auch wenn am Ziel
eine Lücke ist.

**Warum das zählt.** Am Finger beginnt das Verschieben nach einem langen Druck
(UX-010); wer scrollen wollte und zu lange gedrückt hat, verschiebt heute
einen Termin, ohne gefragt zu werden. Ein verschobener Termin ist ein Anruf
bei einer Patient:in.

**Richtung.** CAL-023: eine Rückfrage mit alter und neuer Zeit, die den
Arbeitszeit-Hinweis mitnimmt statt ihn als zweiten Dialog zu zeigen. Die
Rückgängig-Leiste bleibt (Festlegung von Jannes).

### BEF-009 — `staff-workflows` deaktiviert Anna Beispiel und zieht sie den parallel laufenden Dateien weg

|         |                                                                                               |
| ------- | --------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-17                                                                                    |
| Bereich | Testbestand, `tests/e2e/authenticated/`                                                        |
| Quelle  | Jannes, angemeldeter E2E-Lauf zu CAL-018 (der erste, den die Cloud-Umgebung nicht leisten kann) |
| Status  | erledigt in R3 G3 (R3-027, 2026-09-20) — der angemeldete Lauf ist seriell                      |
| Berührt | `staff-workflows.spec.ts` (`annaReaktivieren`), `helpers.ts` (`terminUeberOberflaeche`), jede Datei, die ein Terminformular ausfüllt |

**Beobachtung.** Im parallelen Lauf scheiterten `scheduling-workflows` und
`treatment-note-finalisation` beide mit „did not find some options" beim Feld
**Behandelnde Person**. Im seriellen Lauf (`--workers=1`) waren beide grün.
Ursache: `staff-workflows.spec.ts` deaktiviert Anna Beispiel als Teil seines
Ablaufs und reaktiviert sie erst danach; wer in diesem Fenster ein
Terminformular öffnet, findet sie nicht in der Auswahl.

**Warum das zählt.** Der Fehlschlag sieht aus wie ein Fehler in der geprüften
Funktion und ist keiner — er kostet bei jeder Analyse Zeit und lenkt vom
echten Befund ab. Genau das ist heute passiert: Er hat die Suche nach BEF-010
zweimal in die falsche Richtung geschickt. In der CI fällt es kaum auf, weil
`retries: 1` den zweiten Versuch grün sieht; lokal gilt `retries: 0`.

**Richtung.** Die Datei arbeitet mit einer **eigenen** Mitarbeiterin statt mit
der geseedeten Anna — dieselbe Trennung, die die Tagesfenster für Termine
schon leisten. Zweite Möglichkeit: das Deaktivieren in eine eigene, seriell
laufende Projektgruppe legen. Der erste Weg ist billiger und robuster.

**Erledigt (R3-027, 2026-09-20).** Vorerst der zweite Weg, weil er ohne
Supabase-Stack belegbar ist: `workers: 1`, sobald `E2E_SUPABASE_*` gesetzt
sind — also genau im Lauf `--project authenticated`. `fullyParallel: false`
am Projekt reichte nicht, es ordnet nur die Tests innerhalb einer Datei. Der
nicht angemeldete Lauf bleibt parallel. Die eigene Mitarbeiterin bleibt der
bessere Weg und wäre eine eigene, kleine Aufgabe; sie würde `workers: 1`
wieder entbehrlich machen.

### BEF-010 — Ein gemeinsames Schema über zwei Lesepfade fällt keinem lokalen Gate auf

|         |                                                                                               |
| ------- | --------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-17                                                                                    |
| Bereich | Behandlungsdokumentation: Termin (`/termine/:id`) und Akte (`…/verlauf`)                       |
| Quelle  | Jannes, angemeldeter E2E-Lauf zu CAL-018; behoben in CAL-018d                                  |
| Status  | erledigt für den Einzelfall (CAL-018d), offen als Muster                                       |
| Berührt | `src/features/documentation/api.ts` (`treatmentNoteSchema`), `get_treatment_note`, `list_patient_treatment_notes` |

**Beobachtung.** CAL-018 machte `visit_without_treatment` zum Pflichtfeld des
Eintragsschemas. Dieses Schema liegt unter **zwei** Serverfunktionen;
nachgezogen war nur eine. Die Akte bekam Einträge ohne das Feld, die Prüfung
im Browser wies die ganze Seite ab, und der Behandlungsverlauf blieb leer —
in jeder Akte mit Dokumentation, nicht nur im Test.

**Warum das zählt.** Sieben lokale Gates waren grün. Die Komponententests
reichen ihre Einträge als **getippte Vorgabe** herein, und genau dort wurde
das Feld ergänzt: Der Typ stimmte, die Wirklichkeit nicht. Sichtbar wurde es
erst, wo echte Daten durch den echten Lesepfad laufen — und dieser Lauf ist in
der Cloud-Umgebung nicht möglich. Das Muster wiederholt sich bei jedem
weiteren Feld an jedem Schema, das mehr als eine Funktion bedient.

**Richtung.** Für den Einzelfall genügt der Datenbanktest aus CAL-018d, der
beide Lesepfade in einem Fall zusammenhält. Als Muster fehlt eine Prüfung, die
je Schema alle bedienenden Funktionen kennt — denkbar als Datenbanktest, der
die Schlüssel der Rückgabe gegen eine Liste hält, oder als Regel, dass ein
Schema genau einer Funktion gehört und die zweite Sicht ihr eigenes bekommt.
Entschieden ist das nicht; es gehört in den Loop, der das nächste Feld an ein
geteiltes Schema hängt.

### BEF-011 — Rund 60 Komponententests scheitern unter Node 24 an der Navigation in jsdom

|         |                                                                                               |
| ------- | --------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-18                                                                                    |
| Bereich | Werkzeugkette: `pnpm test` unter Windows mit Node 24.20                                       |
| Quelle  | Loop CAL-EPIC-004a, lokaler Testlauf; auf `main` genauso rot                                  |
| Status  | erledigt in R3 G3 (R3-049, 2026-09-20) — Node 22 ist festgenagelt                             |
| Berührt | Neun Testdateien, voran `CalendarPage.test.tsx` (12) und `AuthenticatedRoutes.test.tsx` (29) — alle Fälle, die navigieren |

**Beobachtung.** Jeder Komponententest, der navigiert (Blättern, Filter,
Zoomstufe, Routenwechsel), bricht mit `RequestInit: Expected signal … to be an
instance of AbortSignal` ab — react-router 7 baut bei der Navigation ein
`Request` mit dem `AbortSignal` von jsdom, das Node 24 nicht mehr als seines
erkennt. `package.json` verlangte nur `node >=22`; die CI läuft mit 22.

**Warum das zählt.** Ein Gate, das lokal rot ist, ohne dass Code betroffen
wäre, wird übersprungen — und dann auch, wenn es einen echten Fehler hätte.

**Richtung.** Entweder die Node-Version festnageln (`.nvmrc`, `engines` auf
`22.x`) oder in der Testumgebung `AbortSignal`/`Request` von jsdom durch die
von Node ersetzen. Kleine Wartung, kein eigener Loop.

**Erledigt (R3-049, 2026-09-20).** Der erste Weg: `engines` steht auf `22.x`,
`.nvmrc` nennt `22`, und `src/werkzeugkette.test.ts` hält beides mit
`NODE_VERSION` aus der CI zusammen. Unter Node 24 meldet `pnpm install` jetzt
die falsche Fassung, statt sie stillschweigend zu benutzen; die Ursache in
jsdom bleibt unberührt.

### BEF-012 — Ein Termin lässt sich nicht in die Vergangenheit verschieben

|         |                                                                                               |
| ------- | --------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-18                                                                                    |
| Bereich | Kalender (`/kalender`), Termin bearbeiten                                                     |
| Quelle  | Jannes, Bedienung nach dem Merge von CAL-EPIC-004a                                            |
| Status  | erledigt in FIX-EPIC-004 (FIX-019, 2026-09-18) — ANN-057 |
| Berührt | `create_appointment`, `update_appointment` („appointment date is in the past", seit CAL-003), `CalendarPage.tsx`, `EditAppointmentPage.tsx` |

**Beobachtung.** Der Server weist jeden Tag vor dem heutigen ab — beim Anlegen
wie beim Verschieben. Wer einen Termin nachträgt oder auf gestern zurücklegt
(„fand doch schon statt"), kommt nicht durch.

**Warum das zählt.** Keine Leitplanke verlangt die Sperre; sie stammt aus
CAL-003 als Schutz vor Tippfehlern. Im Praxisalltag ist ein rückdatierter
Termin ein normaler Fall, und das Nachtragen gehört zur Dokumentation.

**Richtung.** Sperre durch einen Hinweis ersetzen — in derselben Rückfrage
wie der Arbeitszeit-Hinweis (CAL-023, kein zweiter Kasten), mit dem Muster
`bestaetigt` aus CAL-005; Grenze und Auditvermerk als Annahme festhalten.
Migration und `test:db`.

### BEF-013 — Die Rückfrage beim Ziehen reißt aus dem Kalender heraus

|         |                                                                                               |
| ------- | --------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-18                                                                                    |
| Bereich | Kalender, Ziehen einer Terminkachel (CAL-023)                                                 |
| Quelle  | Jannes, Bedienung am Desktop                                                                  |
| Status  | erledigt in FIX-EPIC-004 (FIX-017, 2026-09-18) |
| Berührt | `VerschiebenRueckfrage.tsx`, `CalendarPage.tsx`, `CalendarGrid.tsx`, `useTerminZiehen.ts`     |

**Beobachtung.** Nach dem Loslassen springt die Seite zum Kasten über dem
Gitter (der Fokus holt ihn heran); die Kachel selbst bleibt am alten Platz,
und wer verschieben will, sieht das Ziel nicht mehr.

**Warum das zählt.** Die Rückfrage ist richtig (BEF-008), ihr Ort nicht. Was
verschoben wird, muss dort sichtbar sein, wo es passiert.

**Richtung.** Rückfrage **im Gitter**: der alte Platz als Umriss, der neue
als volle Kachel, beide deutlich unterscheidbar, Bestätigen und Abbrechen
unmittelbar an der neuen Kachel; kein Sprung nach oben. Der Arbeitszeit- und
der Vergangenheits-Hinweis (BEF-012) stehen daran. Tastatur und Vorlesen
bleiben: der Kasten muss auch ohne Zeiger erreichbar sein.

### BEF-014 — Ziehen über den sichtbaren Ausschnitt hinaus ist nicht möglich

|         |                                                                                               |
| ------- | --------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-18                                                                                    |
| Bereich | Kalender, Ziehen (CAL-006, UX-010)                                                            |
| Quelle  | Jannes                                                                                        |
| Status  | erledigt in FIX-EPIC-004 (FIX-018, 2026-09-18); „Verschieben nach …" nicht gebaut, Bearbeiten bleibt der Weg ohne Zeiger |
| Berührt | `useTerminZiehen.ts` (ein `scroll` bricht das Ziehen ab), `CalendarPage.tsx` (Bereich, Blättern) |

**Beobachtung.** Während des Ziehens lässt sich weder scrollen noch blättern:
Jeder Bildlauf beendet die Geste (bewusst so gebaut, damit am Finger Scrollen
nicht verschiebt). Ein Termin kann damit nur innerhalb des sichtbaren
Ausschnitts wandern — nicht in eine andere Woche, nicht auf einen Tag weit
unten.

**Warum das zählt.** Verschieben um Tage und Wochen ist der Regelfall
(Urlaub, Krankheit, Serienverschiebung), nicht die Ausnahme.

**Richtung.** Während des Ziehens am Rand automatisch scrollen (senkrecht
im Gitter) und über die Blätter-Schaltflächen oder eine Randzone in die
nächste Woche/den nächsten Tag wechseln, ohne die Geste zu verlieren; am
Finger bleibt der lange Druck die Abgrenzung zum Scrollen. Alternativ oder
zusätzlich: „Verschieben nach …" mit Datumsfeld aus der Kachel — das ist der
Weg ohne Zeigegerät, den es ohnehin braucht.

### BEF-015 — Einzelne Termine lassen sich nicht ziehen

|         |                                                                                               |
| ------- | --------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-18                                                                                    |
| Bereich | Kalender, Ziehen                                                                              |
| Quelle  | Jannes; Ursache noch nicht bestätigt                                                          |
| Status  | erledigt in FIX-EPIC-004 (FIX-017, 2026-09-18) |
| Berührt | `CalendarPage.tsx` (`ziehbarErlaubt`, `ziehbar: status === 'confirmed'`)                     |

**Beobachtung.** Manche Termine reagieren nicht auf Ziehen. Zwei Ursachen
sind im Code angelegt: (1) Solange eine Rückfrage aus CAL-023 offen ist —
auch außerhalb des sichtbaren Bereichs —, ist das Ziehen für alle Kacheln
gesperrt; wer nach dem Sprung nach oben zurückscrollt, ohne zu antworten,
kann nichts mehr ziehen. (2) Abgeschlossene, nicht angetroffene und
abgesagte Termine sind nach ADR-018 bewusst nicht ziehbar.

**Warum das zählt.** Fall 1 ist ein Fehler aus CAL-023 und fällt mit BEF-013
weg, wenn die Rückfrage an der Kachel steht. Fall 2 braucht eine sichtbare
Erklärung statt einer stummen Kachel.

**Richtung.** Mit BEF-013 beheben; für Fall 2 ein kurzer Hinweis im Tooltip
der Kachel („Abgeschlossen — zum Verschieben erst wieder öffnen"). Zu klären
mit Jannes, welche Termine betroffen waren.

### BEF-016 — Rückfragen am Seitenanfang bleiben unsichtbar; nach dem Anlegen fehlt der Rückweg

|         |                                                                                               |
| ------- | --------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-18                                                                                    |
| Bereich | Terminanlage (`/patienten/:id/termine/neu`), grundsätzlich jede Rückfrage über dem Formular    |
| Quelle  | Jannes, zwei Bildschirmfotos (Desktop)                                                        |
| Status  | erledigt in FIX-EPIC-004 (FIX-016, 2026-09-18) — ANN-058 |
| Berührt | `NewAppointmentPage.tsx`, `EditAppointmentPage.tsx`, `components/ui/Rueckfrage.tsx`, `lib/rueckweg.ts`, alle Seiten mit dem Muster „trotzdem anlegen" |

**Beobachtung.** „Termin anlegen" am Ende eines langen Formulars zeigt die
Arbeitszeit-Rückfrage oben über dem Formular — außerhalb des Sichtfelds;
scheinbar passiert nichts. Nach „Termin trotzdem anlegen" landet man in der
Terminansicht, nicht dort, wo man herkam (hier: Tap auf freie Zeit im
Kalender, UX-005).

**Warum das zählt.** Ein Hinweis, den man nicht sieht, ist keiner (UI-000).
Der Rückweg ist für jede Seite versprochen (UX-012), hier fehlt er nach dem
Erfolg.

**Richtung.** Festlegung von Jannes: Solche Rückfragen erscheinen **immer
als Fenster über dem aktuellen Inhalt** (modal, mit Fokusfang, Escape und
Rückkehr des Fokus) — das ist eine Abkehr von UI-000 („kein modaler Dialog")
und braucht eine kurze Anpassung dort, dann gilt sie für alle Rückfragen des
Musters. Nach dem Anlegen zurück zum Aufrufer (`zurueck`-Parameter aus
UX-012), der neue Termin im Kalender hervorgehoben.

### BEF-017 — Vier fertige Loops fehlen im Fortschrittsmodell

|         |                                                                                                     |
| ------- | --------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-19                                                                                          |
| Bereich | Werkzeugkette: `docs/development/fortschritt.json`, `pnpm fortschritt`                              |
| Quelle  | Loop ABR-EPIC-001, beim Nachstellen des Modells                                                     |
| Status  | offen                                                                                               |
| Berührt | Block A; die Tabelle der fertigen Loops in `ROADMAP.md` nennt sie, das Modell nicht                 |

**Beobachtung.** `fortschritt.json` führt in Block A keine Posten für
**CAL-EPIC-004b**, **CAL-EPIC-004c**, **UX-013** und **GRD-001**, obwohl alle
vier in der Tabelle der fertigen Loops stehen. Der Block zählt sie deshalb
nicht mit.

**Warum das zählt.** Der Stand ist damit zu niedrig, nicht zu hoch — das ist
die harmlosere Richtung, aber es macht die Zahl unbrauchbar: Wer sie mit der
Tabelle vergleicht, findet eine Abweichung und weiß nicht, welche Seite stimmt.

**Richtung.** Vier Posten mit Gewicht ergänzen. Das ist eine Roadmap-Frage
(Gewichte sind Planung, nicht Code) und gehört deshalb in eine Docs-Session
oder an den Anfang des nächsten Loops, nicht in einen Feature-Loop.

### BEF-018 — Ein Monat mit Entwurf führt nicht zu seinem Entwurf

|         |                                                                                                     |
| ------- | --------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-19                                                                                          |
| Bereich | Abrechnung: `/abrechnung`, Abschnitt „Abzurechnen"                                                   |
| Quelle  | Loop ABR-EPIC-002a, Sichtprüfung bei 375 und 1280 px                                                 |
| Status  | erledigt in ABR-EPIC-002b (ABR-003c, 2026-09-19)                                                    |
| Berührt | `list_invoice_candidates` (liefert `has_draft`, aber keine Kennung), `InvoicesPage.tsx`             |

**Beobachtung.** Sind zu einer Person und einem Monat später weitere
Leistungen erfasst worden, während schon ein Entwurf steht, sagt die Zeile das
richtig — aber sie führt nicht zu diesem Entwurf. Wer ihn öffnen will, sucht
ihn in der Liste darunter.

**Warum das zählt.** Es ist der einzige Fall, in dem die Seite auf etwas
verweist, das sie nicht anbietet. Der Weg ist kurz, aber er ist ein Suchen
statt eines Klicks — und genau an dieser Stelle steht die Frage „und was ist
jetzt mit den nachgereichten Leistungen?".

**Richtung.** `list_invoice_candidates` gibt die Kennung des Entwurfs mit
zurück, die Zeile verlinkt darauf. Kleiner Eingriff, gehört in den Loop, der
den Bereich das nächste Mal anfasst (ABR-EPIC-002b).

**So gebaut (2026-09-19).** Die Funktion bündelt jetzt erst und sucht den
Entwurf danach in einem eigenen Schritt; `has_draft` und `draft_id` kommen
damit aus derselben Abfrage und können nicht auseinanderlaufen. Die Zeile
trägt den Weg „Zum Entwurf".
