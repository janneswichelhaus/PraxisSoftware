# Befunde an der laufenden Anwendung

Stand: 2026-09-26

## Zweck

Hier stehen **Befunde aus Sichtungen (früher Abnahmen), Screenrecordings und Reviews an der
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
| Quelle  | Wer hat es wie gesehen: Sichtung, Screenrecording, Review, Herkunft aus dem Ideenspeicher |
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

**Stand MAP-006 (2026-09-25):** Die Karte steht jetzt in der Anwendung (Touren
und als Aufklapper in der Übersicht). „Navigation starten" bleibt trotzdem auf
der Tageskarte — es ist der Weg zur Turn-by-Turn-Führung, bis MAP-007 sie
baut, und übergibt seit MAP-006d die Kartenposition statt der Anschrift. Die
Umordnung der Aktionen bleibt offen.

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
| Status    | erledigt in FIX-015 (PR #42, 2026-09-15)                                                          |
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
(`docs/sichtung/README.md`, Punkt 1).

**Richtung.** Langes Wort im Wert einer Detailzeile umbrechen
(`overflow-wrap`) — eine Stelle im Baustein, kein Umbau.

### BEF-006 — Die Termin-Detailseite trägt sieben Vorgänge und zeigt eine Tabelle

|         |                                                                                               |
| ------- | --------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-16                                                                                    |
| Bereich | Termin (`/termine/:id`)                                                                       |
| Quelle  | Jannes, 2026-09-16, im Vergleich mit iPrax (`../product/ideen/referenz-iprax.md`)              |
| Status  | offen — Vorgabe in [`CAL-EPIC-004.md`](archiv/CAL-EPIC-004.md), AKTE-006                              |
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
| Status  | erledigt in CAL-EPIC-004c (AKTE-006, 2026-09-18) — gruppiert je Behandlungsgrundlage (ANN-069) |
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

---

### BEF-019 — Auf der Rechnung fehlt der Grund der Steuerbefreiung

|         |                                                                                                     |
| ------- | --------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-20                                                                                          |
| Bereich | Abrechnung: Rechnungsdokument (`/abrechnung/rechnungen/:id`, Druckbild)                             |
| Quelle  | Codebefund Claude, 2026-09-20, bei der Entscheidungsarbeit zu ADR-009 Fassung 2 (E18 Schritt 4)     |
| Status  | erledigt in ABR-EPIC-004 (ABR-006/ABR-007, 2026-09-20)                                              |
| Berührt | `app.build_invoice_document` in `20260919150000_invoices.sql`, `InvoicePrintPage.tsx`; ADR-009 Punkt 18 (Fassung 2, angenommen am 2026-09-20); ANN-074 |

**Beobachtung.** Das Rechnungsdokument weist steuerfreie Posten als eigene
Steuergruppe aus und rechnet an ihnen richtig **keine** Umsatzsteuer heraus.
Den **Grund** der Steuerbefreiung nennt es nicht — weder im Snapshot noch im
Ausdruck. Für die Kleinunternehmerregelung steht der Hinweis auf § 19 UStG
da; für die steuerfreie Heilbehandlung nach § 4 Nr. 14 lit. a UStG steht
nichts.

**Warum das zählt.** Es ist keine Schönheitsfrage, sondern eine
**Pflichtangabe**: § 14 Abs. 4 Nr. 8 UStG verlangt bei einer steuerfreien
Leistung den Hinweis auf die Steuerbefreiung. Sie fehlt damit auf jeder
Rechnung, die eine Heilbehandlung enthält — also auf praktisch jeder. Weil
eine ausgestellte Rechnung unveränderbar ist (ADR-009 Punkt 9), lässt sich
das später nicht nachtragen: Jede so ausgestellte Rechnung müsste storniert
und neu ausgestellt werden. Produktiv ist noch keine ausgestellt (B12), der
Befund ist deshalb heute billig und nach dem ersten echten Rechnungslauf
teuer.

**Richtung.** Der Hinweis gehört an dieselbe Stelle wie der Satz zu § 19
UStG: in das Dokument aus `app.build_invoice_document`, damit er im Snapshot
steht und nicht nur in der Darstellung. Offen ist, ob er als fester Text je
Kennzeichen entsteht oder als Feld an der Katalogposition — das Zweite
erlaubt verschiedene Befreiungstatbestände, das Erste verhindert einen
falschen; ADR-009 Fassung 2 führt die Frage als offene Folgefrage. Gehört in
den Loop, der den § 14c-Riegel baut (Punkt 18), und wird mit ihm getestet.

**So gebaut (2026-09-20).** Als **fester Text je Kennzeichen**
(`app.tax_exemption_reason`, **ANN-082**): Ein Feld an der Katalogposition
wäre eine zweite Wahrheit neben `tax_treatment`, und diese Praxis führt genau
einen Befreiungstatbestand. Der Satz entsteht in
`app.build_invoice_document`, steht damit im Snapshot (`schema_version` 2)
und wird auf Blatt und Rechnungsansicht nur angezeigt. Der § 14c-Riegel aus
ABR-007 erzwingt ihn: Ohne Grund lässt sich eine Rechnung mit steuerfreiem
Posten nicht ausstellen. Offen bleibt allein der **Wortlaut** — er hängt an
einer Funktion und ändert sich mit der Antwort aus B4 an genau dieser Stelle.

### BEF-020 — Zwei fertige Loops fehlen in der Tabelle der fertigen Loops

|         |                                                                                     |
| ------- | ----------------------------------------------------------------------------------- |
| Datum   | 2026-09-21                                                                          |
| Bereich | Werkzeugkette: Abschnitt „Fortschritt" in `docs/development/ROADMAP.md`             |
| Quelle  | Loop CAL-EPIC-005, beim Nachtragen der eigenen Zeile                                |
| Status  | erledigt in Umbau U3 (2026-09-23) — die Tabelle wird aus `fortschritt.json` erzeugt  |
| Berührt | Die Tabelle; `fortschritt.json` führt beide Posten korrekt                          |

**Beobachtung.** **LEI-EPIC-001** (fertig 2026-09-20) und **FRB-EPIC-000**
(fertig 2026-09-21) haben keine Zeile in der Tabelle der fertigen Loops. In
`fortschritt.json` stehen beide.

**Warum das zählt.** Das ist die Gegenrichtung zu **BEF-017**, und zusammen
machen die beiden die Probe unmöglich: Modell und Tabelle weichen in beide
Richtungen voneinander ab, und wer sie vergleicht, weiß bei keiner Abweichung
mehr, welche Seite stimmt. Einzeln ist jede Lücke harmlos, gemeinsam sind sie
der Grund, die Zahl nicht mehr zu glauben.

**Richtung.** Zwei Zeilen nachtragen, zusammen mit den vier Posten aus
BEF-017 — eine Docs-Session, kein Feature-Loop. Dass beide Befunde dieselbe
Sitzung brauchen, ist der eigentliche Hinweis: Skill-Schritt I pflegt heute
zwei Orte, die nichts gegeneinander prüft.

### BEF-021 — Die Karte bleibt grau und sagt nicht, warum

|         |                                                                                                     |
| ------- | --------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-21                                                                                          |
| Bereich | Kalender: Kartenprototyp (`/touren/karte`, Vorschau)                                                |
| Quelle  | Abnahme durch Jannes, 2026-09-21, erster lokaler Lauf mit echtem Kachelschlüssel                    |
| Status  | erledigt in MAP-002 (Nachtrag, 2026-09-21)                                                          |
| Berührt | `src/lib/location/ptv-display.ts`, `src/features/tours/karte/Karte.tsx`; ADR-019 Punkt 19           |

**Beobachtung.** Mit gültigem Schlüssel in `.env.local` lud die Karte, die acht
Marker standen an ihren Plätzen — der Hintergrund blieb aber grau. In der
Konsole: `AJAXError: Failed to fetch (0)` auf den Style, dahinter
„Response to preflight request doesn't pass access control check: No
'Access-Control-Allow-Origin' header is present".

**Ursache.** Der Adapter hängte den Schlüssel als Kopfzeile `ApiKey` an
**beide** Hosts des Anbieters. Eine fremde Kopfzeile macht aus einer
einfachen Anfrage eine, die der Browser vorher per `OPTIONS` genehmigen
lässt; `vectormaps-resources.myptv.com` beantwortet diese Vorabanfrage nicht.
Style, Sprites und Glyphen liegen dort **ohne** Schlüssel bereit — geprüft
wird er allein am Kachelendpunkt `api.myptv.com`, und der beantwortet die
Vorabanfrage und lehnt nur einen falschen Schlüssel ab (401).

**Warum das zählt.** Zweimal, aus verschiedenen Gründen. Erstens war die
Konfiguration falsch, ohne dass eine Prüfung es merkte: Der Fehler steckte im
Zusammenspiel zweier Hosts mit einem Browser — nichts davon gibt es in jsdom,
und die Browserprüfung lief gegen einen Style ohne Netz. Zweitens, und
schwerer: **Die Seite schwieg dazu.** Marker aus der Anwendung standen
sichtbar da, also sah die Seite aus, als funktioniere sie. Eine Oberfläche,
die einen Fehlschlag wie einen Erfolg aussehen lässt, ist genau das, was
`PROJECT_PRINCIPLES.md` §9 verbietet.

**So behoben (2026-09-21).** Der Schlüssel geht nur noch an `api.myptv.com`;
der Auslieferungsserver bekommt keine Kopfzeile. Zwei Tests halten das fest,
einer davon ausdrücklich für den Style. Dazu wertet die Kartenkomponente jetzt
das `error`-Ereignis von MapLibre aus und zeigt „Kartenmaterial konnte nicht
geladen werden" — die Meldung des Renderers selbst bleibt draußen, sie trägt
Anbieteradressen (ADR-011). Eine Browserprüfung öffnet die Prüfseite mit einem
absichtlich kaputten Style und erwartet den Hinweis.

### BEF-022 — Die Quellenangabe steht doppelt auf der Karte

|         |                                                                                                     |
| ------- | --------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-21                                                                                          |
| Bereich | Kalender: Kartenprototyp (`/touren/karte`, Vorschau)                                                |
| Quelle  | Abnahme durch Jannes, 2026-09-21, Bildschirmfoto der laufenden Karte                                |
| Status  | erledigt in MAP-002 (Nachtrag, 2026-09-21)                                                          |
| Berührt | `src/features/tours/karte/Karte.tsx`; ADR-019 Punkt 1, `MapDisplayConfig.attribution`               |

**Beobachtung.** Unten rechts auf der Karte stand dieselbe Aussage zweimal:
„© PTV Group, © OpenStreetMap-Mitwirkende" (die Angabe aus dem Adapter) und
direkt dahinter „©2026, PTV Logistics, OpenStreetMap contributors" (die
Angabe, die der Style des Anbieters selbst mitbringt).

**Warum das zählt.** Rechtlich ist Doppelnennung unschädlich — die
Lizenzbedingung verlangt Sichtbarkeit, nicht Sparsamkeit. Sichtbar wird aber
ein Denkfehler: Die Komponente setzte ihre Angabe **immer**, ohne zu fragen,
ob schon eine da ist. Die naheliegende Abhilfe wäre die falsche: Lässt man
die eigene Angabe einfach weg, steht bei einem Anbieter **ohne** Angabe im
Style am Ende gar keine Quelle auf der Karte — und das verletzt die Lizenz
wirklich.

**So behoben (2026-09-21).** Die Karte entsteht ohne Quellenangabe; nach dem
Laden des Styles wird gefragt, nicht angenommen. Nennt eine **benutzte**
Quelle des Styles ihre Herkunft, zeigt das Bedienelement diese; nennt keine
sie, tritt `config.attribution` an ihre Stelle. Dass „benutzt" dazugehört,
hat erst der Browser gezeigt: MapLibre zeigt die Angabe einer Quelle, auf die
keine Ebene verweist, überhaupt nicht an — eine solche Quelle als Beleg zu
werten hätte die eigene Angabe stillgelegt und die Karte ohne Quelle
hinterlassen. Vier Tests halten beide Richtungen fest, einer davon im
Browser gegen einen Style, der seine Quelle selbst nennt.

### BEF-023 — Die Abfrageparameter der Routing-API sind abgeleitet, nicht belegt

|         |                                                                                                     |
| ------- | --------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-21                                                                                          |
| Bereich | Kalender: Kartenprototyp (`/touren/karte`, Vorschau), Edge Function `location-provider`              |
| Quelle  | MAP-003a, Bau des PTV-Adapters                                                                       |
| Status  | erledigt (2026-09-21, gegen die echte API geprüft)                                                    |
| Berührt | `supabase/functions/location-provider/ptv.ts`; ADR-019 Punkt 7; `providerpruefung-kartendienst.md`   |

**Beobachtung.** Profilnamen (`OSM_BICYCLE`, `OSM_CARGO_BICYCLE`) und
Antwortfelder (`distance`, `travelTime`, `legs`, `polyline`) sind aus den
offiziellen Clients des Anbieters belegt. Die **Schreibweise der
Abfrageparameter** — `waypoints` je Punkt, `results`, `polylineFormat` — ist
daraus abgeleitet: Die Webhosts des Anbieters sind aus der
Cloud-Entwicklungsumgebung gesperrt, die Dokumentation also nicht einsehbar.

**Warum das zählt.** Ein falscher Parametername kostet keine Daten und keine
Sicherheit, aber den ersten Lauf: Der Anbieter antwortet mit 400 oder mit
einer Antwort ohne GeoJSON, und wer das nicht erwartet, sucht den Fehler in
der eigenen Kette. Dieselbe Erfahrung steht hinter BEF-021 bei den Kacheln.

**Was dagegen stand.** Der Adapter meldet genau diese Fälle als eigene
Fehlerklasse mit lesbarer Meldung (`ptv: HTTP 400`, `ptv: Antwort ohne
GeoJSON-Polylinie`) statt eine halbe Route zu zeichnen, und die ganze
Schreibweise steht in **einer** Funktion.

**So behoben (2026-09-21).** Jannes hat die Anfrage mit seinem Schlüssel
gegen die echte API laufen lassen. Sie war an drei Stellen falsch, und alle
drei sagte der Anbieter selbst:

1. **Der Pfad.** `OSM_BICYCLE` gibt es auf `routing/v1` nicht
   (`ROUTING_PROFILE_NOT_FOUND`); die OSM-Welt liegt unter
   **`routing-osm/v1`**, so wie die Kacheln unter `maps-osm/v1`.
2. **`results`** darf nicht zweimal vorkommen (`GENERAL_DUPLICATE_PARAMETER`),
   sondern ist eine Liste: `results=POLYLINE,LEGS`.
3. **`polylineFormat`** kennt die API nicht (`GENERAL_UNRECOGNIZED_PARAMETER`).
   GeoJSON ist der Vorgabewert — aber als **Zeichenkette** im Feld `polyline`,
   nicht als Objekt; der Adapter liest sie jetzt ein zweites Mal.

**Der Pfad ist dabei die eigentliche Lehre.** `routing/v1` antwortet mit dem
Profil `BICYCLE` klaglos — und rechnet auf HERE-Daten. Der falsche Pfad wäre
also nicht aufgefallen, sondern hätte funktioniert und dabei einen zweiten
Datenlieferanten in den Datenweg geholt, den ADR-019 Punkt 7 ausschließt. Ein
Test hält die Adresse deshalb jetzt fest.

### BEF-024 — Der Terminkontext steht in zwei Schemata

|         |                                                                                  |
| ------- | -------------------------------------------------------------------------------- |
| Datum   | 2026-09-21                                                                       |
| Bereich | Oberfläche: `src/features/appointments/api.ts`, `src/features/staff/api.ts`      |
| Quelle  | Loop CAL-027, beim Umbenennen der Bestandswerte                                  |
| Status  | offen                                                                            |
| Berührt | `futureAppointmentSchema`; nichts an der Datenbank                               |

**Beobachtung.** `appointmentKindSchema` ist als eine Quelle angelegt und wird
von den Terminschemata benutzt. `futureAppointmentSchema` in `features/staff`
zählt dieselben drei Werte stattdessen ein zweites Mal auf, statt sie zu
importieren.

**Warum das zählt.** CAL-027 hat beide Stellen anfassen müssen, und die zweite
fiel nur auf, weil ein `grep` sie fand — kein Gate hätte sie gemeldet. Ein
vierter Kontext (oder eine weitere Umbenennung) trifft dieselbe Lücke, und
dann steht in der Verwaltung der Zugänge ein Schema, das den neuen Wert
verwirft, während der Kalender ihn kennt: eine Zod-Ausnahme in einer Liste,
die mit dem Kontext gar nichts vorhat.

**Richtung.** `appointmentKindSchema` importieren statt aufzählen — eine
Zeile, gehört in den nächsten Loop, der `features/staff` ohnehin anfasst. Als
eigener Auftrag lohnt sie nicht.

### BEF-025 — MAP-003 fehlt im Änderungsvermerk

|         |                                                                                     |
| ------- | ----------------------------------------------------------------------------------- |
| Datum   | 2026-09-21                                                                          |
| Bereich | Werkzeugkette: Abschnitt „Änderungsvermerk" in `docs/development/ROADMAP.md`        |
| Quelle  | Loop CAL-027, beim Eintragen der eigenen Zeile                                      |
| Status  | offen                                                                               |
| Berührt | Den Vermerk; Fortschrittstabelle und `fortschritt.json` führen MAP-003 korrekt       |

**Beobachtung.** **MAP-003** (fertig 2026-09-21) hat eine Zeile in der Tabelle
der fertigen Loops, aber **keine** im Änderungsvermerk: Die Zählung springt von
5.38 (`MDR_REVIEW_REQUIRED`) zur nächsten Sitzung, MAP-002 steht als 5.33 da.

**Warum das zählt.** Das ist dieselbe Drift wie **BEF-017** und **BEF-020**,
nur an der dritten Stelle. Skill-Schritt I pflegt inzwischen drei Orte —
Fortschrittstabelle, `fortschritt.json` und Änderungsvermerk —, und nichts
prüft sie gegeneinander. Der Vermerk ist dabei der einzige Ort, an dem steht,
**warum** ein Loop so ausgegangen ist; wer ihn später liest, findet zu MAP-003
nur das Ergebnis und nicht die Begründung.

**Richtung.** Mit BEF-017 und BEF-020 in derselben Docs-Session nachtragen.
Die eigentliche Antwort ist aber nicht das Nachtragen, sondern ein Gate: Ein
Loop in der Fortschrittstabelle ohne Zeile im Vermerk (und umgekehrt) ist
maschinell prüfbar und gehörte in `pnpm docs:check`.

### BEF-026 — B13 ist mit dem eingebauten Mailversand nicht einlösbar

|         |                                                                                       |
| ------- | ------------------------------------------------------------------------------------- |
| Datum   | 2026-09-21                                                                            |
| Bereich | Zugänge und Rollen (`/team…`), Passwort vergessen · STAFF-004, Roadmap G2             |
| Quelle  | Loop OPS-001, Providerprüfung ([`../decisions/providerpruefung-supabase.md`](../decisions/providerpruefung-supabase.md), Teil 3) |
| Status  | offen                                                                                 |
| Berührt | B13 · STAFF-004 · `ANN-025` · Roadmap G2 und G3 · Gate-Punkt 11 der Providerprüfung   |

**Beobachtung.** B13 ist am 2026-09-06 entschieden: nur die Auth-Mails des
Providers, kein zweiter Dienst. Die Providerprüfung findet dazu drei Auszüge,
die zusammen etwas anderes sagen als die Entscheidung: Der eingebaute
SMTP-Server ist „not meant for production use", er sendet **2 Mails je
Stunde**, und ohne eigenen SMTP-Server stellt Supabase Auth **nur an
vorautorisierte Adressen** zu — an das Team des Projekts. Eine angestellte
Person, die kein Mitglied des Supabase-Projekts ist, bekäme danach weder eine
Einladung noch eine Mail zum Zurücksetzen des Passworts.

**Warum das zählt.** STAFF-004 („Passwort vergessen als Selbstbedienung")
steht in Roadmap G2 und setzt genau diesen Versandweg voraus. Trifft der
Auszug zu, gibt es zwei Wege und keinen dritten: ein eigener SMTP-Anbieter —
dann ein zweiter Auftragsverarbeiter mit eigener Prüfung, eigenem ADR und
Rücknahme von B13 — oder kein Mailversand, also der Handgriff in der Praxis,
den `ANN-025` für die Anlage von Konten schon beschreibt. Beides ist eine
Entscheidung von Jannes, keine des Loops.

**Richtung.** Zuerst den **Empfängerkreis verifizieren**
(`supabase.com/docs/guides/auth/auth-smtp`, von einem ungeproxten Rechner) —
an ihm allein hängt, ob überhaupt etwas zu entscheiden ist. Fällt er so aus,
geht B13 als Vorlage mit zwei Optionen zurück an Jannes, zusammen mit den
übrigen Punkten der Providerprüfung. Vor dieser Klärung baut niemand an
STAFF-004.

### BEF-027 — Die Oberfläche zeigte auf den Kartendienst, wenn es die eigene Sitzung war

|         |                                                                                                       |
| ------- | ----------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-22                                                                                            |
| Bereich | Kalender: Kartenprototyp (`/touren/karte`), Edge Function `location-provider`, `src/lib/location/route.ts` |
| Quelle  | Abnahme MAP-003 durch Jannes, erster Lauf mit laufender Function                                      |
| Status  | erledigt (2026-09-22)                                                                                 |
| Berührt | `LocationErrorCode`; `sitzung.ts`, `handler.ts`, `route.ts`, `Routenangaben.tsx`                       |

**Beobachtung.** Auf der Seite stand **„Kartendienst weist den Serverschlüssel
ab"** — während der Kartendienst nie gefragt worden war. Derselbe Schlüssel
lieferte im selben Moment aus derselben Datei eine Route (`curl`, HTTP 200),
und im Log der Function stand keine einzige Zeile, weil es keinen
Anbieteraufruf gab. Eine Stunde davor hatte dieselbe Seite **„Kartendienst
nicht erreichbar"** gemeldet, als in Wahrheit das lokale Gateway mit
`503 name resolution failed` antwortete: Die Laufzeit lief nicht.

**Die Ursache, zweimal dieselbe.** Die Fehlerklasse `unauthorized` trug zwei
Bedeutungen — „der Anbieter lehnt unseren Serverschlüssel ab" und „die
Sitzungsprüfung hat nicht geöffnet". Die Function unterschied beide **im
HTTP-Status** (401 gegen 502), der Client las aber nur die Klasse aus dem
Körper. Und jede Antwort, die **nicht** aus dieser Function stammte, fiel im
Client in den Sammelfall `unavailable` — also ebenfalls in einen Text über den
Kartendienst.

**Warum das zählt.** Ein falscher Schuldiger kostet nicht nur Zeit, er kostet
die richtige Handlung: „Anbieter nicht erreichbar" heißt warten, „eigene
Funktion läuft nicht" heißt starten, „Sitzung abgelaufen" heißt neu anmelden.
Im Betrieb einer Praxis ist das der Unterschied zwischen „später noch einmal"
und „jetzt etwas tun". Dieselbe Überlegung hatte ANN-090 für „nicht
eingerichtet" schon einmal angestellt — nur eine Schicht höher.

**So behoben (2026-09-22).** Zwei neue Fehlerklassen und eine Regel:

1. **`session_invalid`** — die abgewiesene Sitzung. `unauthorized` gehört
   seitdem allein dem Anbieter.
2. **`function_unavailable`** — die Antwort kam nicht aus dieser Function.
   Vergibt nur der Client, und zwar nach dem HTTP-Status: 401 und 403 sind
   die Plattform vor unserem Code, alles andere heißt „nicht erreicht".
3. Die Sitzungsprüfung gibt jetzt **drei** Ergebnisse statt `true`/`false`:
   gültig, abgelehnt, **nicht prüfbar** — Letzteres mit Grund und benannter
   Variable (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) oder mit dem Hinweis, dass
   der Anmeldedienst nicht antwortet. Ein Ausfall des Anmeldedienstes gilt
   ausdrücklich **nicht** als abgelaufene Sitzung. Durchgelassen wird
   weiterhin nur „gültig" — fail closed bleibt, das Schweigen nicht.
4. Der Betriebsfehler „nicht prüfbar" steht im Log (Anbieterkennung
   `sitzung`), die abgelehnte Sitzung weiterhin nicht: Sie ist ein normaler
   Zugriffsfall und kein Zähler über Personen.

Sieben neue Tests halten die Zuordnung fest, darunter die Gegenprobe, dass
kein Text über den Kartendienst erscheint, wenn es die Sitzung war.

---

### BEF-028 — Querverweise zwischen Dokumenten veralten unbemerkt

| | |
|---|---|
| Datum | 2026-09-22 |
| Bereich | Dokumentation (kein Anwendungsbereich): `docs/`, `PROJECT_PRINCIPLES.md`, `CLAUDE.md` |
| Quelle | Frage von Jannes am 2026-09-22 („haben sich Unstimmigkeiten angesammelt?"), belegt mit `grep` über 76 Markdown-Dateien |
| Status | erledigt in G19 (2026-09-22) — Gate erweitert; Nebenbefund Obergrenzen offen |
| Berührt | `scripts/docs-check.mjs`; §21 (Rangfolge), ADR-013 (CI-Gates); BEF-026/BEF-027 (Nummernkollision) |

**Beobachtung.** Dokumente behaupten etwas über andere Dokumente, und diese
Behauptungen veralten, ohne dass es auffällt. Vier Belege vom selben Tag, als
ADR-019 auf Fassung 4 stand:

| Datei | sagt |
| --- | --- |
| `MAP-LOOPS.md` | „Grundlage sind ADR-019 **Fassung 3**" |
| `ARBEITSBEREICHE.md` | „ADR-019 **Fassung 2**, angenommen 2026-09-13" |
| `abnahme/etappe-t-kartendienst.md` | „Grundlage: ADR-019 **Fassung 2**" |
| `OPEN_DECISIONS.md`, B7 | „**Fassung 2**, 2026-09-08" |

**Der erste Eintrag ist der wichtigste**: Er entstand am Morgen desselben
Tages und war zwei Stunden später überholt — geschrieben von derselben
Sitzung, die auch Fassung 4 verfasst hat. Das ist kein Nachlässigkeitsproblem,
das eine Aufräumaktion löst: Niemand hält die Querverweise von 76 Dateien im
Kopf, und eine Aufräumaktion stellt denselben Zustand nur einmal wieder her.

**Zwei weitere Formen desselben Musters.**

1. **Nummernkollision.** Am 2026-09-22 vergaben zwei parallele Sitzungen
   **BEF-026** doppelt; gefunden wurde es von Hand. Heute sind `ANN-`, `BEF-`
   und `IDEA-`-Nummern eindeutig — geprüft, aber durch Glück, nicht durch ein
   Gate.
2. **Normative Drift.** ADR-007 Punkt 6 erlaubt seit dem 2026-09-05
   Entwicklung vor der DSFA. Drei später geschriebene Stellen machten daraus
   trotzdem Startbedingungen einzelner Loops (ADR-019 Punkt 25 und 32,
   `MAP-LOOPS.md`, `OPEN_DECISIONS.md` B7). Der Widerspruch bestand
   **17 Tage** und fiel erst auf, als Jannes danach fragte. Behoben mit
   §15.2 (Version 0.15) und ADR-019 Fassung 4.

**Was das Gate heute prüft und was nicht.** `docs:check` prüft
Zeilenobergrenzen, Register-Anker und Links. Es prüft **nicht, ob eine
Aussage über ein anderes Dokument noch stimmt** — genau die Klasse, die hier
verrottet.

**Nebenbefund: drei von drei festen Obergrenzen sind voll** — `CLAUDE.md`
150/150, `STATUS.md` 60/60, `OPEN_DECISIONS.md` 400/400. (Die 1186 bei
`ASSUMPTIONS.md` zählen nicht: Diese Grenze wandert mit der Zahl der Einträge
und ist konstruktionsbedingt immer voll.) Jede Eintragung verdrängt seitdem
eine andere, und die Auswahl fällt unter Zeitdruck — am 2026-09-22 dreimal in
einer Sitzung. Das ist die Stelle, an der Genauigkeit verloren geht; entweder
steigen die Grenzen bewusst, oder Inhalt zieht tatsächlich aus.

**Vorschlag (kein Auftrag).** Nicht aufräumen, sondern messbar machen: das
Dokumentationsgate um die maschinell prüfbaren Fälle erweitern — Verweise auf
eine ADR-Fassung und auf eine Version von `PROJECT_PRINCIPLES.md` gegen den
tatsächlichen Stand, `§NN`-Verweise gegen vorhandene Abschnitte, Eindeutigkeit
der Registernummern. Historische Nennungen in Änderungsvermerken müssen dabei
erlaubt bleiben, sonst prüft das Gate die Vergangenheit falsch.

**Die inhaltliche Durchsicht ist davon getrennt** und hat ihren Zeitpunkt:
**vor dem B2-Paket**. Widersprüchliche Unterlagen erzeugen eine schlechtere
Auskunft der Datenschutzberatung, und diese Auskunft ist teuer. Vorher kosten
Widersprüche wenig — kein Nutzer, kein Produktivbetrieb, alles umkehrbar.

**Umgesetzt in G19.** `docs:check` prüft jetzt, dass genannte ADR-Fassungen,
Versionen und `§`-Abschnitte der Prinzipien existieren, dass eine als
„Grundlage“ genannte Fassung die geltende ist, und dass jede `ANN-`/`BEF-`/
`IDEA-`-Kennung einmal als Überschrift steht; Änderungsvermerke sind
ausgenommen (`scripts/docs-check-regeln.mjs`). Neun veraltete Grundlagen
korrigiert. **Grenze:** Ohne das Wort „Grundlage“ gilt eine ältere Fassung als
Herkunft — die Belege aus `ARBEITSBEREICHE.md` und `OPEN_DECISIONS.md` B7
fängt das Gate deshalb nicht; sie gehören in die Durchsicht vor B2.

### BEF-029 — Unsichtbare Beschriftungen ziehen die ganze Seite in die Breite

|         |                                                                                      |
| ------- | ------------------------------------------------------------------------------------ |
| Datum   | 2026-09-22                                                                           |
| Bereich | Kalender: Kartenprototyp (`/touren/karte`), Fahrzeitmatrix                           |
| Quelle  | Sichtprüfung im Loop MAP-004 (Chromium, 375 px), vor dem ersten Commit der Komponente |
| Status  | erledigt in MAP-004                                                                  |
| Berührt | `src/features/tours/karte/Fahrzeitmatrix.tsx`; Muster `overflow-x-auto` + `sr-only`  |

**Beobachtung.** Die 8 × 8-Tabelle liegt in einem Behälter mit
`overflow-x-auto`, damit bei 375 px **die Tabelle** scrollt und nicht die
Seite. Gemessen scrollte trotzdem die ganze Seite: `documentElement.scrollWidth`
war 515 statt 375, und `window.scrollTo(500, 0)` verschob sie tatsächlich.

**Die Ursache.** Jede Zelle trägt eine `sr-only`-Beschriftung („von 3 nach 1,
nicht erreichbar"), und `sr-only` ist `position: absolute`. Der Scrollbehälter
war `position: static` und damit **nicht** ihr Bezugsrahmen: Alle 64 Spannen
hingen am Wurzelelement, entkamen dem Überlauf und verbreiterten die Seite.
Ein `relative` am Behälter schließt sie ein — gemessen 375 von 375.

**Warum das zählt, über diese Tabelle hinaus.** Das Muster „breite Tabelle im
Scrollbehälter" steht schon an mehreren Stellen (`VacationPage`,
`CalendarGrid`, `FleetPage`). Dort fällt es bisher nicht auf, weil deren Zellen
keine unsichtbaren Beschriftungen tragen. Wer eine hinzufügt — und für
Nicht-Farb-Bedeutung ist genau das der richtige Weg —, holt sich denselben
Effekt. Zwei Zeilen im Test hätten ihn nicht gefunden: Es ist kein
DOM-Zustand, sondern eine Layoutmessung im echten Browser.

**Zweiter Fund aus demselben Lauf, gleich mit erledigt:** Eine `<caption>` ist
so breit wie ihre Tabelle. Bei 32 rem Mindestbreite war der Satz auf dem
Telefon abgeschnitten statt umgebrochen; er steht jetzt als Absatz **vor** der
Tabelle und hängt über `aria-describedby` an ihr.

### BEF-030 — Ein `geo:`-Verweis im neuen Tab kommt nirgends an

|         |                                                                                    |
| ------- | ---------------------------------------------------------------------------------- |
| Datum   | 2026-09-22                                                                         |
| Bereich | Kalender: Kartenprototyp (`/touren/karte`), Navigations-Handoff                     |
| Quelle  | Abnahme MAP-005 Teil A durch Jannes (Laptop, Chromium)                              |
| Status  | erledigt in MAP-005 (Nachtrag)                                                     |
| Berührt | `src/lib/location/navigation.ts` (`navigationOeffnen`)                              |

**Beobachtung.** „`geo:48.5216,9.0576` kommt nirgends an. Leerer Screen."

**Die Ursache.** `navigationOeffnen` hat jede URL mit
`window.open(url, '_blank')` geöffnet. Für `http(s)` ist das richtig. Für ein
Schema, das **kein Programm übernimmt**, öffnet der Browser trotzdem erst den
Tab und stellt dann fest, dass niemand zuständig ist — zurück bleibt ein
leerer Tab. Am Laptop gibt es keine Navigations-App, also passiert genau das;
auf dem Telefon wäre es je nach System dasselbe Bild.

**Die Behebung.** Der Handoff baut jetzt im Klickhandler einen Verweis
(`<a>` mit `rel="noopener noreferrer"`), klickt ihn und entfernt ihn wieder.
Nur `http(s)` bekommt `target="_blank"`. Ein `geo:`-Verweis läuft damit im
selben Fenster: Wo ein Programm zuständig ist, übernimmt es; wo keins
zuständig ist, bleibt die Seite stehen. **Kein leerer Tab, und keine
vorgetäuschte Übergabe.**

**Was dabei nicht verloren geht.** Die Regel „erst beim Tippen, nie
automatisch" (ADR-019 Punkt 20) gilt unverändert: Das Element entsteht im
Klickhandler und lebt genau so lange wie der Klick. Ein `<a href>` im
gerenderten Quelltext gibt es weiterhin nicht, und die Prüfungen dafür stehen
in `navigation.test.ts`, `NavigationHandoff.test.tsx` und `karte.spec.ts`.

**Offen bleibt der Teil, den nur ein Telefon beantwortet:** ob eine
Navigations-App den Verweis dort annimmt und im Fahrradmodus öffnet
(MAP-005c, Teil B der Abnahme).

### BEF-031 — Die Fahrzeitmatrix beantwortet die Frage nicht, die gestellt wird

|         |                                                                                    |
| ------- | ---------------------------------------------------------------------------------- |
| Datum   | 2026-09-22                                                                         |
| Bereich | Kalender: Kartenprototyp (`/touren/karte`), Fahrzeitmatrix                          |
| Quelle  | Abnahme MAP-004/MAP-005 durch Jannes (Laptop)                                       |
| Status  | erledigt in MAP-005 (Nachtrag)                                                     |
| Berührt | `src/features/tours/karte/Fahrzeitmatrix.tsx`                                      |

**Beobachtung.** „Ich verstehe diese Tabelle nicht."

**Die Ursache liegt nicht an der Tabelle, sondern an der Frage.** Die 8 × 8-Matrix
beantwortet „Wie lange fahre ich von jedem Stopp zu jedem anderen?". Im Alltag
gibt es diese Frage nicht. Es gibt: **„Komme ich von hier zum nächsten
Termin?"** — und deren Antwort steht in der Matrix nur auf der Nebendiagonale,
also in sieben von 64 Zellen, die man erst durch Kreuzen von Zeile und Spalte
findet. Die Tabelle war als **Beleg** gebaut („der Anbieter rechnet jedes
Paar") und ist als Beleg richtig; sie stand nur an der Stelle, an der eine
Arbeitsansicht stehen muss.

**Die Behebung.** Zuerst steht jetzt **der Tag in Folge**: je Übergang eine
Zeile mit Uhrzeiten, Fahrzeit und dem Rest, der bleibt oder fehlt („passt,
5 Min. übrig", „× 1 Min. zu wenig"). Die vollständige Matrix bleibt, aber
weggeklappt hinter „Alle Paare als Tabelle" — sie beantwortet die Frage, was
eine **andere Reihenfolge** kostete, und die stellt sich seltener.

**Den Befund liefert weiterhin `erreichbarkeit()`** aus dem Fachmodul; die
Minuten daneben sind eine Differenz derselben Zahlen und keine zweite Regel.
Wo die Regel schweigt (`unbekannt`), steht auch in der Tagesfolge keine Zahl.

### BEF-032 — Neunzehn Bedienelemente für eine Handlung aus einem Tap

|         |                                                                                    |
| ------- | ---------------------------------------------------------------------------------- |
| Datum   | 2026-09-22                                                                         |
| Bereich | Kalender: Kartenprototyp (`/touren/karte`), Navigations-Handoff                     |
| Quelle  | Abnahme MAP-005 Teil A durch Jannes (Laptop)                                        |
| Status  | erledigt in MAP-005 (Nachtrag)                                                     |
| Berührt | `src/features/tours/karte/NavigationHandoff.tsx`, `KartePage.tsx`                  |

**Beobachtung.** „Die Seite ist generell zu unübersichtlich. Die Therapeuten
brauchen möglichst einfache Arbeitsschritte. So viel Auswahl ist unnötig."

**Die Ursache.** Der Abschnitt „Die Navigation" stellte nebeneinander: drei
Ziel-Apps zur Wahl, acht Stopp-Knöpfe und — bei der Systemnavigation — acht
gleich aussehende Tagesabschnitte. Neunzehn Bedienelemente für eine Handlung,
die aus einem Tap besteht. Dazu kam die Stoppliste ein zweites Mal weiter
unten, sodass dieselben acht Punkte zweimal auf der Seite standen.

**Die Behebung.** Der Knopf steht jetzt **an seinem Stopp**, in der Liste, die
es ohnehin gab — eine Zeile, eine Aktion; die zweite Liste ist entfallen. Der
Tagesknopf steht darüber, wo er im Ablauf hingehört. Die Ziel-App liegt
weggeklappt hinter „Andere Ziel-App prüfen (für die Gerätebewertung)": Sie ist
ein Prüfinstrument und kein Arbeitsschritt. Für die Systemnavigation steht
statt acht Knöpfen ein Satz, der den Grund nennt.

**Was der Befund über den Prototyp hinaus sagt.** Eine Vorschauseite sammelt
leicht alles an, was ein Loop belegen will — und wird damit zur Werkbank des
Bauenden statt zur Ansicht der Arbeitenden. Für die echte Tagesliste gilt das
nicht: Dort steht je Termin **ein** Knopf „Navigation starten"
(`src/features/appointments/NavigationStarten.tsx`, seit UX-002). Mit MAP-006
ersetzt sie diesen Prototyp; bis dahin gilt für die Vorschau dieselbe Regel
wie für sie.

### BEF-033 — Die Aufbewahrungsseite zeigt „Par." statt „§"

|         |                                                                                    |
| ------- | ---------------------------------------------------------------------------------- |
| Datum   | 2026-09-22                                                                         |
| Bereich | Organisatorisches → Sicherheit → Aufbewahrung (`/praxis/sicherheit/aufbewahrung`)   |
| Quelle  | Aufgefallen beim Bau von OPS-006                                                    |
| Status  | erledigt in UX-EPIC-002 (UX-002g, 2026-09-26)                                     |
| Berührt | `src/features/retention/AufbewahrungPage.tsx`                                      |

**Beobachtung.** In der Spalte „Grundlage" steht `Par. 630f Abs. 3 BGB` statt
`§ 630f Abs. 3 BGB` — für jede Datenklasse mit gesetzlicher Fundstelle.

**Die Ursache.** Die SQL-Dateien bleiben frei von Sonderzeichen (Migration
`20260911150000_retention_schedule.sql`), deshalb trägt `legal_reference` in
der Datenbank `Par.`. Die Seite gibt den Wert unverändert aus.

**Der Weg.** OPS-006 hat dafür `paragraf()` in
`src/features/datenschutz/vorlage.ts` — ein Antwortschreiben an eine Patientin
kann nicht „Par." sagen. Die Aufbewahrungsseite könnte dieselbe Funktion
nutzen; das wäre eine Zeile. Bewusst **nicht** in OPS-006 mitgemacht: Es ist
ein Refactoring außerhalb der berührten Module (CLAUDE.md, „Harte Regeln").
Passt in den nächsten Loop, der die Seite ohnehin anfasst.

### BEF-034 — Die Teamseiten fragen für trainer die zuordenbaren Personen ab

|         |                                                                                     |
| ------- | ----------------------------------------------------------------------------------- |
| Datum   | 2026-09-23                                                                          |
| Bereich | Organisatorisches → Team (`/praxis/team`, `/praxis/team/:id`)                       |
| Quelle  | Aufgefallen bei der Bestandsaufnahme für G6b Teil 1                                 |
| Status  | erledigt in UX-EPIC-002 (UX-002h, 2026-09-26); Ausgang des Lesepfads in G6b bleibt offen |
| Berührt | `src/features/staff/StaffListPage.tsx`, `src/features/staff/StaffMemberDetailPage.tsx` |

**Beobachtung.** Beide Seiten laden `list_assignable_therapists` ohne
Rollenbedingung. Für ein trainer-Konto weist die Datenbank den Aufruf ab; die
Spalte „zuordenbar" bleibt leer, die Seite lädt sonst.

**Folge für G6b.** Der Pfad behält deshalb die Ausnahme: Die Oberfläche ruft
ihn für die abgewiesene Rolle auf, ein `denied`-Eintrag stünde bei jedem
Seitenaufruf im Auditlog. **Der Weg:** `enabled: canManageAppointments(roles)`
an beiden Abfragen; danach kann der Pfad denselben Ausgang bekommen wie die
übrigen Lesepfade. Dazu, gleich gefunden: Das Menü zeigt trainer
„Arbeitszeiten" (`navigation.tsx`), die Route leitet ohne Aufruf auf `/` um.

### BEF-035 — Das Anlegen-Menü verdeckt die Spalte unter der Auswahl

|         |                                                                                   |
| ------- | --------------------------------------------------------------------------------- |
| Datum   | 2026-09-26                                                                        |
| Bereich | Kalender (`/kalender`), Anlegen aus dem Raster (CAL-019)                           |
| Quelle  | Freie Sichtung Kalender durch Jannes am Handy (Test-Umgebung), therapist          |
| Status  | erledigt in UX-EPIC-002 (UX-002b, 2026-09-26) |
| Berührt | `src/features/appointments/CalendarGrid.tsx` (Anlegen-Menü an der Auswahl); ANN-058 |

**Beobachtung.** Nach einem Tipp auf ein leeres Feld (im Bild 08:50) öffnet das
Menü *Neuer Termin · Dauertermin · Fehlzeit · Dauerfehlzeit · Abbrechen*
direkt **unter** der Auswahl und deckt die folgenden Zeitfelder derselben
Spalte zu — im Bild von 08:55 bis nach 10:30.

**Erwartet.** Die Spalte unter der Auswahl bleibt frei. Ein zweiter Tipp auf ein
späteres Feld derselben Spalte (etwa 40 Minuten weiter) wählt **die ganze
Spanne** dazwischen für den nächsten Eintrag — Aufziehen durch zwei Tipps statt
durch Ziehen. Erst danach wird die Art gewählt.

**Ursache im Code.** Das Menü sitzt absichtlich im Gitter, 4 px unter der
Auswahl (`kastenOben`), damit die gewählte Zeit sichtbar bleibt (ANN-058). Dass
es dabei die Fläche belegt, auf der die Spanne weitergehen würde, war nicht
bedacht. Eine Spanne entsteht heute nur durch Ziehen.

**Hinweis.** Der Eintrag *Dauertermin* verweist auf „Suche oben" — das hängt an
BEF-039 und muss mit ihm zusammen geändert werden.

### BEF-036 — Ein zweiter Tipp auf dieselbe Einzelauswahl hebt sie nicht auf

|         |                                                                          |
| ------- | ------------------------------------------------------------------------ |
| Datum   | 2026-09-26                                                               |
| Bereich | Kalender (`/kalender`), Anlegen aus dem Raster (CAL-019)                  |
| Quelle  | Freie Sichtung Kalender durch Jannes am Handy (Test-Umgebung), therapist |
| Status  | erledigt in UX-EPIC-002 (UX-002b, 2026-09-26) |
| Berührt | `src/features/appointments/CalendarGrid.tsx`, `CalendarPage.tsx`         |

**Beobachtung.** Eine Auswahl aus einem einzelnen Feld lässt sich nur über
*Abbrechen* im Menü aufheben.

**Erwartet.** Ist genau ein Feld ausgewählt, hebt ein zweiter Tipp auf **dasselbe**
Feld die Auswahl auf — gleichbedeutend mit *Abbrechen*. Zusammen mit BEF-035
gilt: zweiter Tipp auf dasselbe Feld = aufheben, auf ein anderes Feld derselben
Spalte = Spanne bis dorthin.

### BEF-037 — Die Uhrzeit sitzt nicht im Rahmen der Auswahl

|         |                                                                          |
| ------- | ------------------------------------------------------------------------ |
| Datum   | 2026-09-26                                                               |
| Bereich | Kalender (`/kalender`), Auswahl im Raster                                |
| Quelle  | Freie Sichtung Kalender durch Jannes am Handy (Test-Umgebung), therapist |
| Status  | erledigt in UX-EPIC-002 (UX-002a, 2026-09-26) |
| Berührt | `src/features/appointments/CalendarGrid.tsx` (`auswahl-flaeche`)         |

**Beobachtung.** Bei einem ausgewählten 5-Minuten-Feld steht „08:50" nicht
innerhalb des grünen Rahmens, sondern läuft über die untere Rahmenlinie.

**Ursache im Code.** Die Auswahlfläche ist bei einem Feld mindestens 16 px hoch,
trägt aber 2 px Rahmen, 4 px Innenabstand oben und unten und eine Textzeile von
16 px — der Inhalt braucht rund 28 px. Dieselbe Rechnung gilt für die gestrichelte
Vorschau beim Verschieben.

### BEF-038 — Im Kalender lässt sich nicht mit zwei Fingern zoomen

|         |                                                                          |
| ------- | ------------------------------------------------------------------------ |
| Datum   | 2026-09-26                                                               |
| Bereich | Kalender (`/kalender`), Raster                                           |
| Quelle  | Freie Sichtung Kalender durch Jannes am Handy (Test-Umgebung), therapist |
| Status  | erledigt in UX-EPIC-002 (UX-002c, 2026-09-26) |
| Berührt | `src/features/appointments/CalendarGrid.tsx` (`touchAction`); Raster `−`/`+` |

**Beobachtung.** Am Smartphone ist Zoomen mit zwei Fingern im Kalender nicht möglich.

**Ursache im Code.** Das Gitter setzt `touch-action: pan-x pan-y`, damit eine
begonnene Geste auf einer Kachel nicht vom Browser übernommen wird. Diese
Angabe lässt nur Wischen zu und schließt das Zoomen mit zwei Fingern ausdrücklich aus.

**Geklärt (Jannes, 2026-09-26).** Gemeint ist das **Raster**, nicht die Seite:
zwei Finger auseinander wirken wie `+`, zusammen wie `−` (Stundenhöhe, 5- bis
30-Minuten-Raster). Das Verschieben von Kacheln per Ziehen darf dabei nicht
brechen.

### BEF-039 — Über dem Kalender steht zu viel; oben reichen Monat, Name, Woche und „Jetzt"

|         |                                                                                          |
| ------- | ---------------------------------------------------------------------------------------- |
| Datum   | 2026-09-26                                                                               |
| Bereich | Kalender (`/kalender`), Kopfbereich; App-Kopfzeile mit Suche                              |
| Quelle  | Freie Sichtung Kalender durch Jannes am Handy (Test-Umgebung), therapist; Vergleich iPrax (`docs/product/ideen/referenz-iprax.md`) |
| Status  | erledigt in UX-EPIC-002 (UX-002d, 2026-09-26) |
| Berührt | `src/features/appointments/CalendarPage.tsx`, App-Kopfzeile und Suche; BEF-001, BEF-032 |

**Beobachtung.** Bei 375 px füllen Suchfeld, Unterreiter *Kalender · Touren*,
Seitentitel mit Zeitraum, drei Anlegen-Knöpfe (*Termin anlegen, Ereignis
eintragen, Dauerfehlzeit eintragen*), *Tag/Woche*, *← Heute →*, Raster
*− 5-Minuten-Raster +*, *Behandelnde Person*, *Standort* und darunter *Status*
den ganzen ersten Bildschirm; das Raster beginnt erst nach dem Scrollen.

**Erwartet.**
- Die Suche wird zur **Lupe links neben „Konto"**, die bei Tipp ein Feld öffnet.
- Über dem Raster steht nur noch: links ein **Monatskalender zum Aufklappen**,
  rechts ein Knopf, der **zum aktuellen Zeitpunkt springt**, dazwischen der
  **Name der behandelnden Person** und die **Kalenderwoche**.
- Alles, was heute darüber steht, ist **direkt am Raster** erreichbar —
  Anlegen über das Raster (BEF-035), die übrigen Einstellungen dort, wo sie
  gebraucht werden.

**Hinweis.** Das ist der Kern von UX-EPIC-002/003 und keine Einzelkorrektur; der
Loop entscheidet, wohin Person, Standort, Status, Tag/Woche und Raster wandern.
BEF-001 (Kopfzeile, Untermenü, Seitentitel fressen Höhe) zeigt dieselbe Ursache
an der Dokumentation.

### BEF-040 — Das Startsymbol unter Android steht in einem weißen Kreis

|         |                                                                          |
| ------- | ------------------------------------------------------------------------ |
| Datum   | 2026-09-26                                                               |
| Bereich | Startbildschirm-Symbol (Android, „Zum Startbildschirm hinzufügen")        |
| Quelle  | Freie Sichtung durch Jannes am Android-Handy (Test-Umgebung)             |
| Status  | erledigt in UX-EPIC-002 (UX-002e, 2026-09-26) |
| Berührt | `index.html`, `marke/` (einzige Quelle), `public/marke/`, `src/marke.test.ts` |

**Beobachtung.** Das Symbol ist rechteckig; Android legt deshalb einen weißen
Kreis darum.

**Erwartet.** Nur die Schrift auf grünem Grund, vollflächig, ohne weißen Rand.

**Ursache im Code.** Es gibt kein Web-Manifest; Android nimmt das
`apple-touch-icon` (`own-motion-app-1024.png`) und setzt es, weil es nicht als
`maskable` gekennzeichnet ist, verkleinert auf einen weißen Kreis.

**Weg.** Ein Manifest (ohne Service Worker, ADR-015 Punkt 16) mit einem Symbol
`purpose: "maskable"`: grüner Grund bis an den Rand, die Schrift im inneren
Schutzbereich. Die Datei muss nach `marke/README.md` **in `marke/` entstehen** —
keine zweite Fassung neben der Marke, kein Umfärben; die Kopie in
`public/marke/` hält `src/marke.test.ts` fest.

**Umgesetzt (UX-002e).** Nachgemessen ist das 1024er Master selbst
maskierbar: vollflächig Tiefgrün, die Wortmarke im Schutzkreis. Das Manifest
nennt deshalb dieselbe Datei, eine neue entsteht nicht (ANN-110,
`marke/README.md`).

### BEF-041 — Chrome bietet die Installation nicht mehr an

|         |                                                                                    |
| ------- | ---------------------------------------------------------------------------------- |
| Datum   | 2026-09-26                                                                         |
| Bereich | Web-Manifest, Installation als App (Chrome)                                        |
| Quelle  | Freie Sichtung durch Jannes (Test-Umgebung), nach UX-002e                          |
| Status  | erledigt in UX-EPIC-002 (UX-002i, 2026-09-26)                                      |
| Berührt | `public/manifest.webmanifest` (`display`); ANN-110; BEF-040                        |

**Beobachtung.** Über Chrome lässt sich die Anwendung nicht mehr installieren;
vor UX-002e ging das.

**Ursache im Code.** Seit UX-002e gibt es ein Web-Manifest, und es sagt
`"display": "browser"`. Damit erklärt die Seite selbst, dass sie im Browser-Tab
laufen will — Chrome wertet sie deshalb als **nicht installierbar** und bietet
höchstens eine Verknüpfung an, die im Tab öffnet. Ohne Manifest hatte Chrome
die Seite vorher auf eigene Faust als App installiert. ANN-110 nennt genau
diese Folge unter „Unsicher" und den Weg im Änderungspfad.

**Erwartet.** Chrome (Desktop und Android) bietet „App installieren" an; die
App öffnet im eigenen Fenster mit dem maskierbaren Symbol (BEF-040 bleibt
gelöst).

**Weg.** `display` auf `standalone` oder `minimal-ui` — beides macht die Seite
für Chrome ohne Service Worker installierbar (ADR-015 Punkt 16 bleibt
unberührt). `standalone` gibt am Handy die volle Höhe, verlangt aber eigene
Zurück-Wege in der Oberfläche und öffnet auch unter iOS ab dem
Startbildschirm ohne Browserleiste; `minimal-ui` behält Zurück und Neu laden
in einer schmalen Leiste (Chrome), iOS bleibt beim Browser. Der Loop
entscheidet und schreibt ANN-110 fort.

**Umgesetzt (UX-002i).** `display` ist `minimal-ui`: installierbar ohne Service
Worker, mit schmaler Leiste für Zurück und Neu laden; iOS bleibt beim Browser
(ANN-110 fortgeschrieben).

### BEF-042 — Ein Dauertermin verlangt erst eine Patient:in, ein neuer Termin nicht

|         |                                                                                       |
| ------- | ------------------------------------------------------------------------------------- |
| Datum   | 2026-09-26                                                                            |
| Bereich | Kalender (`/kalender`), Anlegen aus dem Raster (CAL-019), Terminserie (CAL-007)        |
| Quelle  | Freie Sichtung Kalender durch Jannes (Test-Umgebung), therapist                       |
| Status  | erledigt in UX-EPIC-002 (UX-002j, 2026-09-26)                                         |
| Berührt | `src/features/appointments/CalendarPage.tsx` (Eintrag `dauertermin`), `AppointmentSeriesPage.tsx`, Route `/patienten/:patientId/verordnungen/:grundlageId/serie`; ADR-018, ADR-020 |

**Beobachtung.** Im Anlegen-Menü ist *Dauertermin* ausgegraut, solange der
Kalender nicht auf eine Patient:in gefiltert ist („Zuerst die Patient:in
wählen"). *Neuer Termin* geht dagegen ohne Vorauswahl — die Patient:in wird
im Formular gesucht.

**Erwartet.** Beide Wege gleich: Zeit im Raster markieren, *Dauertermin*
wählen, **dann** die Patient:in suchen (und, wenn sie mehrere hat, die
Grundlage), dann Rhythmus und Anzahl wie bisher.

**Ursache im Code.** Die Terminserie hängt an der Adresse einer
Behandlungsgrundlage (`/patienten/…/verordnungen/…/serie`), weil deren
Kontingent die Anzahl vorgibt (CAL-007). Einen Einstieg ohne Patient:in gibt
es nicht; der Kalender graut den Eintrag deshalb aus.

**Hinweis.** Fachlich bleibt die Serie an einer Grundlage (ADR-020); nur die
Reihenfolge der Fragen ändert sich — ein vorgeschalteter Schritt „für wen,
aus welcher Grundlage?" mit Tag und Beginn aus der Markierung. Hat die
Person genau eine offene Grundlage, entfällt die zweite Frage.

**Umgesetzt (UX-002j).** Neue Seite `/termine/dauertermin`: erst die Patient:in,
dann die Grundlage; bei genau einer offenen (oder nur einer) geht es direkt
in die Serie. Verplante und ausgeschöpfte stehen eingeklappt darunter. Ist
der Kalender auf Patient:in und Grundlage gefiltert, führt der Eintrag wie
bisher direkt in die Serie.

### BEF-043 — Der Kalender steckt in einem Kasten und lässt Rand frei

|         |                                                                                      |
| ------- | ------------------------------------------------------------------------------------ |
| Datum   | 2026-09-26                                                                           |
| Bereich | Kalender (`/kalender`); Seitenrahmen aller Bereiche                                   |
| Quelle  | Freie Sichtung Kalender durch Jannes (Test-Umgebung), therapist                      |
| Status  | erledigt in UX-EPIC-002 (UX-002k, 2026-09-26)                                        |
| Berührt | `src/app/AppShell.tsx` (`<main>`: `max-w-inhalt`, `px-5 sm:px-8`, `py-8`), `src/features/appointments/CalendarGrid.tsx` (Rahmen `rounded-card border mt-4`); BEF-001, BEF-039 |

**Beobachtung.** Das Raster sitzt als umrandete Karte in der Inhaltsfläche,
die auf 1200 px gekappt und mittig gestellt ist, mit Innenabstand rundherum.
Links und rechts bleibt Fläche ungenutzt, am breiten Bildschirm viel davon.

**Erwartet.** Der Kalender reicht **vom linken bis zum rechten Rand** der
Fläche neben der Seitenleiste, ohne eigenen Kasten — so wenig verschenkter
Platz wie möglich, ohne dass es vollgestopft wirkt. Allgemein stört Jannes
ungenutzter oder schlecht genutzter Raum; der Loop sieht die übrigen Bereiche
mit derselben Frage durch.

**Ursache im Code.** Der Rahmen in `AppShell` gilt für jede Seite gleich
(DS-001: 1200 px, damit Listenzeilen nicht auseinanderlaufen). Für ein Raster
ist die Kappung falsch — die Begründung dort nennt Listen, nicht Gitter.

**Hinweis.** Die Kappung für Listen und Fließtext kann bleiben; der Kalender
(und später andere Flächen-Ansichten wie die Karte) braucht eine
randlose Variante des Rahmens. Bildschirmfotos bei 1280, 1920 und 375 px.

**Umgesetzt (UX-002k).** Der Kalender reicht bis an den Rand der Fläche, ohne
Kasten (`RANDLOSE_SEITEN`, ANN-114); die übrigen Seiten sind Listen, Formulare
oder Text und behalten die Kappung.

### BEF-044 — Die Zeile „Kalender · Touren" kostet Höhe; Touren gehört in den Kalender

|         |                                                                                      |
| ------- | ------------------------------------------------------------------------------------ |
| Datum   | 2026-09-26                                                                           |
| Bereich | Arbeitsbereich Kalender: Unterreiter (`SubNav`), Touren (`/touren`)                   |
| Quelle  | Freie Sichtung Kalender durch Jannes (Test-Umgebung), therapist                      |
| Status  | erledigt in UX-EPIC-002 (UX-002l, 2026-09-26)                                        |
| Berührt | `src/app/navigation.tsx` (`unterpunkte` von `termine`), `src/app/AppShell.tsx` (`SubNav`, `py-8`), `src/features/tours/TourenPage.tsx`; BEF-001, BEF-039 |

**Beobachtung.** Zwischen Kopfzeile und dem Raster steht eine eigene Zeile
mit *Kalender · Touren*, darüber viel Abstand (`py-8` des Rahmens). Dass man
im Kalender ist, zeigen Seitenleiste bzw. untere Leiste ohnehin.

**Erwartet.** Die Zeile entfällt. Touren wird **im Kalender** erreichbar —
etwa als dritte Ansicht neben Tag und Woche („Tour" des gezeigten Tages und
der gewählten Person) oder als Knopf am Tageskopf, der die Tourenliste mit
Karte für diesen Tag öffnet. Der Abstand unter der Kopfzeile schrumpft auf
das Nötige.

**Hinweis.** Die Tourenseite hat heute dieselben Fragen wie der Kalender —
Tag und Person —, deshalb liegt die Ansicht dort nahe. `/touren` bleibt als
Adresse erhalten (Verweise aus der Übersicht). Ob die Zeile bei anderen
Bereichen (Patient:innen, Team, Betrieb) ebenfalls wegfallen kann, prüft
derselbe Loop — BEF-001 beschreibt dieselbe Ursache an der Dokumentation.

**Umgesetzt (UX-002l).** Die Zeile entfällt; „Tour" steht neben Tag und Woche
unter „Ansicht und Filter" und nimmt Tag und Person mit (ANN-113). Die
Zeilen der Bereiche Patient:innen und Organisatorisches bleiben, weil ihre
Ziele sonst nicht erreichbar wären. Der Abstand unter der Kopfzeile ist
überall kleiner.
