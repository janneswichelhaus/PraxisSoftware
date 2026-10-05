# Erledigte Befunde

Archiv zu [`../BEFUNDE.md`](../BEFUNDE.md): Befunde, die ein Loop geschlossen hat —
**zum Nachschlagen, ohne Rang und ohne Pflege**. Kennung und Wortlaut sind
unverändert umgezogen (2026-10-02); der Verlauf davor steht in
`git log -- docs/development/BEFUNDE.md`. Ein Befund, der wieder auftritt, bekommt
eine neue Kennung in `BEFUNDE.md` und verweist auf den alten.

---

### BEF-001 — Dokumentieren ohne Scrollen: was wirklich im Weg steht

| | |
|---|---|
| Datum | 2026-09-11 |
| Bereich | Behandlungsdokumentation (`/termine/:id/dokumentation…`), „Behandlung abschließen" |
| Quelle | Jannes, 2026-09-11; Codebefund und Messung Claude, 2026-09-11 · aus `IDEA-PRX-038`, 2026-09-12 |
| Status | erledigt in UI-Redesign Zyklus 2 (Schreibseite, PR #161); nachgemessen 2026-10-02, siehe Nachtrag unten |
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
Eingabe für eine Ablaufrunde „Übersicht" nach [`OPTIMIERUNG.md`](../OPTIMIERUNG.md)
gedacht; die Runden ruhen bis Probewoche 1 (siehe oben). Bis dahin gilt R6:
erste Story des nächsten Loops derselben Spur, mit Jannes' eigener
Beobachtung an einem echten Tag als Eingabe (§20: gemessen wird nur durch ihn
selbst) — ohne die bleibt jede Umsortierung geraten.

**Nachtrag 2026-10-02, nachgemessen.** Die Schreibseite aus UI-Redesign
Zyklus 2 (`CompleteTreatmentPage.tsx`) hat kein Untermenü, keine
Seitenbeschreibung und keinen Hinweistext mehr; Name, Datum und Uhrzeit bleiben
im Kopf, das Feld füllt die Höhe. Playwright auf der Prüfseite bei 375 × 667:
Das Feld beginnt bei **105 px** (dazu kommen in der Anwendung die 56 px der
Kopfzeile, also rund 160 statt 458), sichtbar sind **388 px** (vorher 308,
davor 254). Festgehalten in `tests/e2e/schreibseite.spec.ts`. Der Folgesatz
steht nur noch für Vorlesesoftware, das ist die Entscheidung aus ANN-200 und
mit ihr zu bestätigen; Jannes' Beobachtung an einem echten Tag bleibt die
letzte Prüfung (§20). Bausteinzeile und Skala laufen unter BEF-057 weiter.

---

### BEF-002 — Aktionen der Tageskarte neu ordnen

| | |
|---|---|
| Datum | 2026-09-11 |
| Bereich | Übersicht – Tagesliste des Hausbesuchstags (`/`), Tageskarte |
| Quelle | Jannes, 2026-09-11 (mit Screenshot); Risikoanalyse Claude · aus `IDEA-PRX-040`, 2026-09-12 |
| Status | erledigt in UX-EPIC-003 (2026-09-26) für die Reihenfolge; „Abhaken“ bleibt bei `IDEA-PRX-039` |
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

**Stand UX-EPIC-003 (2026-09-26):** Die Karte des ersten Wegs trägt die Navigation als Hauptknopf, danach „Bisherige Doku“, „Doku“ und „Behandlung abschließen“, die Rufnummern dahinter; auf den übrigen Karten bleibt der Abschluss der Hauptknopf. Das „Abhaken“ statt Abschließen hängt weiter an `IDEA-PRX-039` und ABR-002 und ist nicht Teil dieses Befunds.

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
| Status | erledigt in UI-Redesign Schritt 7 (PAT-B01, `DetailList.tsx` mit `wrap-anywhere`, Test in `bausteine.test.tsx`; PR #157) |
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
| Status | erledigt in UX-EPIC-005 (PR #154) und UI-Redesign Zyklus 3 (PR #162): Metazeile, Aktionsleiste, Kacheln statt Tabelle; alle sieben Vorgänge behalten ihren Bestätigungsschritt. Vorgabe AKTE-006 bleibt im Archiv |
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
| Status | erledigt in Docs-Session 2026-10-02: vier Posten in `fortschritt.json` (Gewicht 1, gesichtet 2026-09-28), Tabelle mit `pnpm fortschritt --schreiben` erzeugt |
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

### BEF-025 — MAP-003 fehlt im Änderungsvermerk

|         |                                                                                     |
| ------- | ----------------------------------------------------------------------------------- |
| Datum   | 2026-09-21                                                                          |
| Bereich | Werkzeugkette: Abschnitt „Änderungsvermerk" in `docs/development/ROADMAP.md`        |
| Quelle  | Loop CAL-027, beim Eintragen der eigenen Zeile                                      |
| Status | erledigt durch Umbau U3 (2026-09-24): Der Änderungsvermerk führt nur noch Planungsänderungen, Loop-Ergebnisse stehen allein in `fortschritt.json`, und Regel 6 in `scripts/docs-check.mjs` prüft sie gegen die Tabelle. Ein Gate Tabelle ↔ Vermerk wäre heute falsch; MAP-003 bleibt in der Chronik ohne eigenen Vermerk |
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

### BEF-045 — Befund aus Bausteinen: Seitenwahl je Test zu umständlich, Text unübersichtlich

|         |                                                                                                                             |
| ------- | --------------------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-26                                                                                                                  |
| Bereich | Behandlungsdokumentation: „Befund aus Bausteinen“ (`BausteinFeld`), Generator `dokumentationstext.ts`                       |
| Quelle  | Rückmeldung von Jannes am Beispiel Hüfte (lokal), therapist                                                                 |
| Status  | erledigt in FRB-EPIC-003, Nachbesserung (Branch `claude/bausteine-doku`, 2026-09-26)                                        |
| Berührt | `src/features/assessments/` (`schema.ts`, `dokumentationstext.ts`, `bausteinauswahl.ts`, `BausteinFeld.tsx`, `06-huefte.json`); ANN-118, ANN-129, ANN-130 |

**Beobachtung.** Die Ergebnisse „ohne Befund, positiv, negativ, nicht
beurteilbar“ passen nicht; an jedem Test links/rechts/beidseits zu wählen ist
mühsam, obwohl es an den Extremitäten meist um eine Seite geht. Der
übernommene Text ist unübersichtlich und nennt die Ausgangsstellung
(„Rückenlage – Flexion, rechts: ohne Befund.“).

**Erwartet.** Ergebnisse o.B., positiv, nicht getestet; eine klügere
Seitenabfrage; im Text ein Zeichen für o.B. und eins für positiv, „nicht
getestet“ ausgeschrieben, keine Ausgangsstellung, Absätze und
Aufzählungspunkte.

**Umgesetzt.** Drei Ergebnisse; die Seite einmal je Region an Extremitäten und
Kiefer, an der Wirbelsäule je Nerventest eine Zeile links und rechts
(ANN-129); ✅ und ❗ vor dem Test, „Nicht getestet“ als Sammelzeile, Gruppen
eingerückt, Techniken mit „•“, Ausgangsstellung nur beim Abhaken (ANN-130);
die Notiz öffnet sich auf Tipp.

### BEF-071 — Nach „Termin anlegen“ aus der Terminsuche steht man wieder auf der Suche, mit einer Meldung, die wie ein Fehler klingt

|         |                                                                                                                                             |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-28                                                                                                                                  |
| Bereich | Warteliste → Freie Termine suchen → Übernehmen → Terminformular                                                                             |
| Quelle  | Sichtung Praxisverwaltung, Schritt 2 (Jannes, Test-Umgebung, Android und Windows, office)                                                                |
| Status  | erledigt in UX-EPIC-004 (UX-004a) |
| Berührt | `src/features/slot-search/SlotSearchPage.tsx` (Z. 167–171, Rückweg), Terminformular (Rückweg nach dem Anlegen); PRX-003, PRX-004; ANN-136 |

**Beobachtung.** Max Mustermann steht auf der Warteliste; über **Freie Termine
suchen → Übernehmen** öffnet das Terminformular, **Termin anlegen** gelingt:
Der Termin liegt im Kalender, der Eintrag steht unter **Geschlossen** als
**Eingeplant**. Danach führt der Rückweg aber zurück auf **Freie Termine
suchen**, und dort steht „! Der Wartelisteneintrag ist nicht mehr offen;
gesucht wird ohne seine Wunschzeiten.“ Eine Bestätigung, dass der Termin
angelegt und der Eintrag eingeplant ist, fehlt. Jannes hielt es zunächst für
einen eigenen Bedienfehler.

**Erwartet.** Nach dem Anlegen aus einem Wartelisteneintrag führt der Weg
zurück zur Warteliste (oder in die Akte → Termine) mit einer Bestätigung wie
„Termin angelegt · Max Mustermann ist eingeplant“; die Suche nach einem
geschlossenen Eintrag erscheint nur, wenn man sie ausdrücklich wieder öffnet,
und sagt dann, warum.

**Vorschlag.** Erste Story des nächsten Loops der Etappe P (PRX-EPIC-002):
Rückweg des Terminformulars bei `warteliste` auf die Warteliste setzen,
Bestätigung als `Statusmeldung`; Test, dass nach dem Anlegen nicht die
Suchseite mit der Warnung erscheint.

### BEF-072 — Auf einer 30-Minuten-Kachel ist die dritte Zeile abgeschnitten

|         |   |
| ------- | - |
| Datum   | 2026-09-28 |
| Bereich | Kalender, Tagesansicht am Handy |
| Quelle  | Sichtung Kernprozess, Schritt 3 (owner) (Jannes, Test-Umgebung, Android und Windows) |
| Status  | erledigt in UX-EPIC-004 (UX-004b) |
| Berührt | Terminkachel im Kalender; CAL-EPIC-004a (freie Terminlänge); BEF-037 |

**Beobachtung.** Ein Hausbesuch von 30 Minuten (12:40–13:10) zeigt Name, Zeit mit ⟷ und darunter „Hausbesuch“ halb angeschnitten; die Kachel ist zu niedrig für drei Zeilen. Das Kennzeichen zeigt nur ⟷, ohne „30 Min.“.

**Erwartet.** Eine Zeile, die nicht ganz passt, entfällt oder wird mit … gekürzt — nie halb abgeschnitten. Bei kurzen Terminen Name und Zeit zuerst, Terminart als Kürzel oder in der Zeitzeile.


### BEF-073 — Nach einem Formular landet der Kalender in der eigenen Personenansicht statt im vorherigen Stand

|         |   |
| ------- | - |
| Datum   | 2026-09-28 |
| Bereich | Kalender → Neuer Termin / Termin bearbeiten → zurück |
| Quelle  | Sichtung Kernprozess, Schritt 3 (owner) (Jannes, Test-Umgebung, Android und Windows) |
| Status  | erledigt in UX-EPIC-004 (UX-004b) |
| Berührt | Rückweg aus Terminformular und Akte (`mitRueckweg`, `leseRueckweg`); Kalenderzustand (Ansicht, Tag, Spalten) |

**Beobachtung.** Jannes arbeitet in der Tagesansicht in Annas Spalte, legt einen Termin an bzw. ergänzt Stammdaten und landet danach „immer wieder“ in seinem persönlichen Kalender (Ansicht Jannes), nicht in der Tagesansicht mit Anna.

**Erwartet.** Der Rückweg stellt Ansicht, Tag und Personenauswahl des Kalenders so wieder her, wie sie vor dem Formular waren.


### BEF-074 — In der Monatsübersicht des Kalenders ist heute nicht markiert

|         |   |
| ------- | - |
| Datum   | 2026-09-28 |
| Bereich | Kalender → Monat oben links |
| Quelle  | Sichtung Kernprozess, Schritt 5 (owner) (Jannes, Test-Umgebung, Android und Windows) |
| Status  | erledigt in UX-EPIC-004 (UX-004b) |
| Berührt | Monatsauswahl im Kopf des Kalenders; ANN-109 |

**Beobachtung.** Im Monatsblatt, über das man den Tag wählt, ist nicht erkennbar, welcher Tag heute ist.

**Erwartet.** Heute ist im Monat hervorgehoben (Rahmen oder Punkt, nicht nur Farbe — Oberflächen-Checkliste Punkt 4); der gewählte Tag bleibt davon unterscheidbar.


### BEF-075 — Die Meldung mit „Rückgängig“ nach dem Verschieben steht oben auf der Seite, außerhalb des Sichtfelds

|         |   |
| ------- | - |
| Datum   | 2026-09-28 |
| Bereich | Kalender, Termin ziehen → Verschieben |
| Quelle  | Sichtung Kernprozess, Schritt 9 (owner) (Jannes, Test-Umgebung, Android und Windows) |
| Status  | erledigt in UX-EPIC-004 (UX-004c) |
| Berührt | Statusmeldung nach dem Verschieben; FIX-EPIC-004; BEF-079 (dieselbe Ursache möglich) |

**Beobachtung.** Nach „Verschieben“ erscheint die Meldung mit „Rückgängig“ am Anfang der Seite. Wer weiter unten im Raster arbeitet, sieht sie nicht und müsste erst nach oben scrollen.

**Erwartet.** Die Meldung erscheint im Sichtfeld, am Handy am unteren Rand über der Tableiste (wie die Leiste „Was soll hier entstehen?“), und bleibt lange genug für „Rückgängig“ stehen.


### BEF-076 — Zu viel Erklärtext auf allen Seiten; abgehakte Tests im Erstbefund bleiben aufgeklappt

|         |   |
| ------- | - |
| Datum   | 2026-09-28 |
| Bereich | übergreifend; Befund aus Bausteinen |
| Quelle  | Sichtung Kernprozess, Schritt 10 und 11 (therapist) (Jannes, Test-Umgebung, Android und Windows) |
| Status  | erledigt in UX-EPIC-004 (UX-004d) |
| Berührt | Bedienprinzip „Was nicht gebraucht wird, ist eingeklappt“ (UX-EPIC-002, Oberflächen-Checkliste Punkt 11); FRB-EPIC-003; ANN-130 |

**Beobachtung.** Auf den Seiten steht durchweg viel erklärender Text. Im Erstbefund bleibt ein abgehakter Test mit allen Optionen offen, die Seite wird dadurch sehr lang.

**Erwartet.** Erklärungen auf einen kurzen Satz, der Rest hinter „Mehr“ bzw. ⓘ zum Aufklappen. Eindeutige Symbole vor einem kurzen Wort (etwa ✅ Erledigt, ⚠️ Gebühr vorgemerkt) — nie ein Symbol allein (Punkt 4, Screenreader). Im Erstbefund klappt ein abgehakter Test auf eine Zeile mit Name und Ergebnis ein und lässt sich wieder öffnen.


### BEF-077 — Textbausteine an der Dokumentation: Verwaltung und Überschrift stören, die Beispielbausteine ersetzen Inhalt

|         |   |
| ------- | - |
| Datum   | 2026-09-28 |
| Bereich | Termin → Dokumentieren |
| Quelle  | Sichtung Kernprozess, Schritt 11 (therapist) (Jannes, Test-Umgebung, Android und Windows) |
| Status  | erledigt in UX-EPIC-004 (UX-004d) |
| Berührt | Textbausteine an der Dokumentation; IDEA-PRX-043; Organisatorisches |

**Beobachtung.** „Bausteine verwalten“ steht an der Dokumentation und kostet Platz; die Überschrift „Textbausteine:“ ist unnötig. Die vorhandenen Bausteine (etwa „Eigenübungen besprochen“) ersetzen genaue Dokumentation, statt Struktur und Tipparbeit zu erleichtern.

**Erwartet.** Verwaltung nur unter Organisatorisches; an der Dokumentation nur die Bausteine selbst, ohne Überschrift. Bausteine als Satzanfänge und Gliederung, die ergänzt werden (Jannes liefert eigene). Genaue Übungsdokumentation: IDEA-TRN-015.


### BEF-078 — Der Verlauf früherer Termine ist unübersichtlich: keine abgesetzten Kästen, überall gleicher Kontrast

|         |   |
| ------- | - |
| Datum   | 2026-09-28 |
| Bereich | Akte → Behandlungsverlauf; Übersicht → Bisherige Doku |
| Quelle  | Sichtung Kernprozess, Schritt 11 und 12 (Jannes, Test-Umgebung, Android und Windows) |
| Status  | erledigt in UX-EPIC-004 (UX-004e) |
| Berührt | Behandlungsverlauf; Tokens in `src/index.css`; UX-EPIC-003 |

**Beobachtung.** Die Dokumentation früherer Termine läuft als gleichförmiger Text; Termine sind nicht als Kästen abgesetzt, Datum, Verfasser:in und Text haben denselben Kontrast.

**Erwartet.** Je Termin eine Karte mit Kopf (Datum, Terminart, Therapeut:in) in kräftigerer Schrift und dem Text darunter; neueste zuerst; lange Texte gekürzt mit „Mehr“.


### BEF-079 — Nach einer kurzfristigen Absage ist keine Meldung „Gebühr vorgemerkt“ zu sehen

|         |   |
| ------- | - |
| Datum   | 2026-09-28 |
| Bereich | Termin → Absagen (Patient:in, weniger als 24 Stunden) |
| Quelle  | Sichtung Kernprozess, Schritt 12 (office) (Jannes, Test-Umgebung, Android und Windows) |
| Status  | erledigt in UX-EPIC-004 (UX-004c) |
| Berührt | Absagedialog und Statusmeldung; CAL-014; BEF-075 |

**Beobachtung.** Nach „Patient:in hat abgesagt“ mit Eingang „Gerade eben“ hat Jannes keinen Hinweis „Gebühr vorgemerkt“ gesehen. Die Gebühr war vorgemerkt: Paul stand in Schritt 13 unter „Zu erfassen“ mit „Absage innerhalb der Frist“.

**Erwartet.** Nach dem Absagen steht die Folge sichtbar im Sichtfeld: „Abgesagt · Gebühr vorgemerkt (weniger als 24 Stunden vorher)“. Prüfen, ob die Meldung fehlt oder nur außerhalb des Sichtfelds steht (wie BEF-075).

### BEF-080 — Das Protokoll ist unter „Organisatorisches“ nicht zu finden: Der Menüpunkt heißt „Auditlog“

|         |   |
| ------- | - |
| Datum   | 2026-09-29 |
| Bereich | Organisatorisches (owner) |
| Quelle  | Sichtung Praxisverwaltung, Schritt 5 (owner) (Jannes, Test-Umgebung, Android und Windows) |
| Status  | erledigt in UX-EPIC-004 (UX-004e) |
| Berührt | `src/app/navigation.tsx` (Menüpunkt „Auditlog“, Stichwort „Sicherheit“); Sichtungsdateien; BEF-065; ANN-137 |

**Beobachtung.** Jannes sucht als owner unter Organisatorisches den Punkt „Sicherheit“ und findet ihn nicht. Seit UXR-002 heißt er „Auditlog“; die Sichtungsdateien nannten noch „Sicherheit“ (am 2026-09-29 nachgezogen). „Auditlog“ ist Entwicklersprache.

**Erwartet.** Ein Wort, das eine Praxisleitung sucht, etwa „Protokoll“ (Begriffsliste `src/lib/begriffe.ts`), gleich in Menü, Seitentitel und Sichtung; „Auditlog“ und „Sicherheit“ bleiben als Suchwörter. Zusammen mit BEF-065 (Nachweisseiten in Projektsprache).


### BEF-081 — „Rechnung an“ und „Offene Rechnungen“ am Termin werden nicht gefunden

|         |   |
| ------- | - |
| Datum   | 2026-09-29 |
| Bereich | Termin (office) |
| Quelle  | Sichtung Praxisverwaltung, Schritt 6 (office) (Jannes, Test-Umgebung, Android und Windows) |
| Status  | erledigt in UX-EPIC-004 (UX-004e) |
| Berührt | `src/features/appointments/Abrechnungslage.tsx`, `AppointmentDetailPage.tsx`; PRX-008; ANN-139; BEF-076, BEF-078 |

**Beobachtung.** Als Olivia (office) findet Jannes am Termin von Erika die Zeilen „Rechnung an“ und „Offene Rechnungen“ nicht. Sie stehen als zwei unauffällige Zeilen zwischen den übrigen Termindaten (Art, Status, Grundlage) und erscheinen nur, wenn der Server sie für die Rolle freigibt. Jannes: „Es ist alles noch viel zu unübersichtlich und nicht intuitiv genug.“

**Erwartet.** Zuerst prüfen, ob die Zeilen für office auf der Test-Umgebung überhaupt ankommen (`billing_visible`). Dann die Abrechnungsangaben als eigener, kurzer Block „Abrechnung“ am Termin, mit Überschrift, abgesetzt von den Termindaten — Teil der Neuordnung der Terminseite (BEF-076, BEF-078).


### BEF-083 — Ein Rechnungstest wird zwischen 22 und 24 Uhr UTC rot: „morgen" in Gerätezeit, geprüft in Praxiszeit

|         |   |
| ------- | - |
| Datum   | 2026-09-30 |
| Bereich | Abrechnung, Zahlung buchen (`src/features/billing/InvoicesPage.test.tsx`) |
| Quelle  | Schlussprüfung POR-EPIC-001, `pnpm test` um 22:48 UTC; Gegenprobe mit `TZ=Europe/Berlin` grün |
| Status  | erledigt in POR-EPIC-001 (der Test rechnet „morgen" jetzt in Europe/Berlin) |
| Berührt | Test „schreibt einen Datumsfehler an das Datum, nicht an den Betrag (ABR-09, ZST-11)“, Hilfe `morgenOrtszeit` |

**Beobachtung.** Der Test setzt als Eingangstag „morgen“ in der Zeitzone des Geräts und erwartet den Fehler „nicht für die Zukunft buchen“. Die Seite prüft in der Zeitzone der Praxis (Europe/Berlin). Auf einem Gerät in UTC ist zwischen 22 und 24 Uhr das UTC-„morgen“ in Berlin schon „heute“: kein Fehler, der Test wird rot. Das betrifft die CI (UTC), wenn sie abends läuft. Die Anwendung selbst ist richtig, falsch ist nur die Hilfe im Test. Dieselbe Art Fehler haben POR-EPIC-001 in `training-protocols.test.ts` und `appointment-coverage.test.ts` behoben: Monat von heute statt Monat des Termins, rot am Monatsanfang in Berlin.

**Erwartet.** `morgenOrtszeit` rechnet „morgen“ in Europe/Berlin (`todayInTimeZone` plus ein Tag). Danach einmal mit `TZ=UTC` zu einer Uhrzeit zwischen 22 und 24 Uhr gegenprüfen.

### BEF-084 — Die Terminseite wiederholt, was die Überschrift schon sagt

|         |   |
| ------- | - |
| Datum   | 2026-09-30 |
| Bereich | Terminseite `/termine/:id` |
| Quelle  | Jannes, Durchsicht am Handy |
| Status  | erledigt in UX-EPIC-005 (UX-005a) |
| Berührt | `src/features/appointments/AppointmentDetailPage.tsx`, `AppointmentHeadline.tsx`, `Abrechnungslage.tsx`, `src/components/ui/Tile.tsx` |

**Beobachtung.** Die Tabelle unter der Überschrift nannte den Namen der Patient:in (steht schon in der Überschrift), die behandelnde Person (in der Situation klar), „Hausbesuch“ (der Regelfall) und den Status „Bestätigt“ (für die Behandelnde ohne Bedeutung). Datum und Uhrzeit standen erst in der Tabelle, die Mitteilungszeichen daneben. Alles zusammen kostete am Telefon eine Bildschirmhöhe, bevor die Anschrift kam.

**Erwartet.** Datum, Zeit und Mitteilungszeichen in der Zeile unter der Überschrift; die behandelnde Person nur an fremden Terminen (ANN-193), die Terminart nur, wenn sie vom Hausbesuch abweicht (ANN-192), der Status nur, wenn er von „Bestätigt“ abweicht. Anschrift und Navigation bleiben, als Kachel, daneben die Grundlage. Ein Praxis- oder Videotermin trägt eine farbige Kachel.

### BEF-085 — Der Block „Was ist passiert?“ am Hausbesuch steht immer offen

|         |   |
| ------- | - |
| Datum   | 2026-09-30 |
| Bereich | Terminseite `/termine/:id` (bestätigter Hausbesuch) |
| Quelle  | Jannes, Durchsicht am Handy |
| Status  | erledigt in UX-EPIC-005 (UX-005b) |
| Berührt | `src/features/appointments/HomeVisitFlow.tsx`, `AppointmentDetailPage.tsx` |

**Beobachtung.** Die drei Szenarien aus CAL-018 (Regelfall, Tür geöffnet ohne Behandlung, niemand öffnet) standen auf jeder Hausbesuchsseite ausgeklappt mit ihren Folgen — auch dann, wenn die Tür wie fast immer aufgeht. Der Regelfall stand mitten im Ausnahmeblock.

**Erwartet.** Ein Knopf „Niemand öffnet?“ neben „Dokumentieren und abschließen“; dahinter die Schrittfolge geklingelt → gewartet → angerufen mit den Rufnummern der Patient:in zum Tippen, am Ende „nicht angetroffen“ vermerken; darunter der Weg „Ohne Behandlung abschließen“. Das Protokoll bleibt serverseitig Pflicht (ADR-018 Punkt 9).

### BEF-086 — Im Kalender ist nicht zu sehen, wann jemand arbeitet

|         |   |
| ------- | - |
| Datum   | 2026-09-30 |
| Bereich | Kalender `/kalender` |
| Quelle  | Jannes, Durchsicht am Handy |
| Status  | erledigt in UX-EPIC-005 (UX-005c) |
| Berührt | `src/features/appointments/CalendarGrid.tsx`, `CalendarPage.tsx`, `calendar.ts` |

**Beobachtung.** Das Gitter war für jede Person von 07:00 bis 19:00 gleich weiß, ob sie an dem Tag arbeitet oder nicht. Die Arbeitszeit stand nur in der Planung unter Organisatorisches.

**Erwartet.** Die Zeit außerhalb der Arbeitszeit einer Person ist grau schraffiert, auch ein ganzer Tag ohne Arbeitszeit; die weiße Fläche ist die Arbeitszeit. Solange der Wochenplan nicht geladen ist, wird nichts behauptet. Die Legende erklärt die Schraffur.

### BEF-087 — „Hausbesuch“ steht auf jeder Kachel, Karte und Zeile

|         |   |
| ------- | - |
| Datum   | 2026-09-30 |
| Bereich | Kalender, Übersicht (Tageskarte, Tagesplan des Teams), Akte (Termine, Behandlungsverlauf), Mitarbeitende, Tag umplanen, Termine übertragen, Anrufliste |
| Quelle  | Claude, Durchsicht aller Terminzeilen im Auftrag von Jannes („weitere Stellen mit unnötigen Angaben“) |
| Status  | erledigt in UX-EPIC-005 (UX-005d) |
| Berührt | neun Komponenten, alle über `appointmentTypeHint` in `src/features/appointments/api.ts` |

**Beobachtung.** Neun Listen und Kacheln nannten die Terminart an jeder Zeile — bei einer Hausbesuchspraxis fast immer „Hausbesuch“. Auf der Kalenderkachel war es die dritte Zeile, auf der Tageskarte eine eigene Zeile unter dem Namen, im Teamplan „Anna Beispiel · Hausbesuch“.

**Erwartet.** Die Terminart steht nur, wenn sie abweicht (ANN-192): Praxistermin mit Standort, Videotermin. Die Zeile entfällt, wenn sie sonst nichts sagen würde.

### BEF-088 — Die Akte wiederholt ihren Kopf und erklärt sich selbst

|         |   |
| ------- | - |
| Datum   | 2026-10-01 |
| Bereich | Akte: Stammdaten, Behandlungsverlauf, Verordnungen, Befund, Dateien, Formulare |
| Quelle  | Claude, systematische Durchsicht aller Seiten im Auftrag von Jannes („solche Bereiche in der gesamten Anwendung finden“) |
| Status  | erledigt in UX-EPIC-005 (UX-005e) |
| Berührt | `PatientRecordLayout.tsx`, `PatientMasterDataPage.tsx`, `PatientRecordDocumentation.tsx`, `PatientTreatmentBasesPage.tsx`, `PatientBefundPage.tsx`, `Behandlungsliege.tsx`, `Mitnehmen.tsx`, `PatientFilesPage.tsx`, `EditPatientPage.tsx`, `NewPatientPage.tsx` |

**Beobachtung.** Der Aktenkopf steht über jedem Bereich und nennt Name, Geburtsdatum, Versorgungsstand, Zugangshinweis und Besonderheit. Die Stammdaten darunter nannten Geburtsdatum, „Status: Aktiv“, „Abschluss: Laufende Versorgung“, Zugangshinweis und Besonderheit ein zweites Mal, dazu „Kartenposition: Verortet“ als Dauerzeile, vier Gedankenstriche für leere Kontaktwege, drei Erklärsätze unter den Verwaltungsabschnitten, einen Hinweis auf Betroffenenrechte für Rollen ohne das Recht und die Fußzeile „Zugriffe … werden protokolliert“. Der Verlauf trug an jeder Karte „Abgeschlossen“ oder „Dokumentiert“, „Finalisiert“, den Namen der Behandelnden dreimal und „Zum Termin“ als eigene Zeile; die Grundlagen „Offen“ an jeder laufenden Grundlage und einen leeren Scan-Block mit Erklärsatz.

**Erwartet.** Nichts im Körper wiederholt den Kopf; ein Regelfall trägt kein Abzeichen und keine Zeile; ein leerer Wert nimmt keine Zeile; Sätze, die das System statt die Daten erklären, entfallen. Die frühere Festlegung aus PAT-05 („übrige Rollen erfahren, wer eine Anfrage bearbeitet“) ist damit zurückgenommen: Ein Satz darüber, wer etwas darf, ist kein Inhalt der Akte.

### BEF-089 — Terminformulare erklären das System auf jeder Seite

|         |   |
| ------- | - |
| Datum   | 2026-10-01 |
| Bereich | Termin anlegen (Start, Formular, Serie, Dauertermin), Termin bearbeiten, Fehlzeiten, Terminzettel, Kurzblick, Mitteilung, Dokumentation, Terminsuche |
| Quelle  | Claude, systematische Durchsicht im Auftrag von Jannes |
| Status  | erledigt in UX-EPIC-005 (UX-005g) |
| Berührt | `src/features/appointments/*Page.tsx`, `AppointmentFormFields.tsx`, `EreignisFormFields.tsx`, `Kurzblick.tsx`, `MitteilungVermerken.tsx`, `src/features/documentation/TreatmentNoteSection.tsx`, `CompleteTreatmentPage.tsx`, `src/features/slot-search/SlotSearchPage.tsx` |

**Beobachtung.** Die Startseite der Terminanlage nannte die Vorbelegung in der Beschreibung und noch einmal als Tabelle mit „Terminart: Hausbesuch“ und „noch offen“-Zeilen. Jedes Hausbesuchsformular erklärte, woher die Adresse kommt; Beginn-Felder nannten das Praxisraster; Fußzeilen erklärten Protokollierung und Datenart. Bearbeiten zeigte die Patient:in ein zweites Mal mit dem Satz, dass sie nicht wechselbar ist. Die Serie nannte „bis HH:MM“ unter jedem Vorschlag und „Fenster: 60 Minuten“. Am offenen Termin ohne Dokumentation stand „noch keine Dokumentation hinterlegt“ plus ein zweiter Knopf unter dem Hauptknopf. Die Terminsuche trug „Fahrweg passt“ und „Im Gebietstag“ an fast jeder Zeile.

**Erwartet.** Eine Zeile aus gefüllten Werten statt Tabelle; die Terminart nur bei Abweichung (ANN-192); keine Erklärabsätze und Fußzeilen; am offenen Termin kein Satz und kein zweiter Knopf, ein leerer Abschnitt entfällt; nur Abweichungen als Abzeichen.

### BEF-090 — Übersicht und Büroseiten nennen Regelfälle und erklären Überschriften

|         |   |
| ------- | - |
| Datum   | 2026-10-01 |
| Bereich | Übersicht, Tageskarte, Offene Punkte, Anrufliste, Warteliste |
| Quelle  | Claude, systematische Durchsicht im Auftrag von Jannes |
| Status  | erledigt in UX-EPIC-005 (UX-005h) |
| Berührt | `src/features/today/MyDayPage.tsx`, `Tagesliste.tsx`, `src/features/open-points/*.tsx`, `src/features/waitlist/format.ts`, `WaitlistMatches.tsx` |

**Beobachtung.** Jede offene Tageskarte trug „Steht aus“; „Liege heute: nein“ stand jeden Morgen ganz oben; der Leerzustand und der Teamplan wiederholten ihre Überschrift als Satz; die Organisationskarten erklärten ihre Links; die Zeile „Offene Punkte: …“ hatte daneben einen zweiten Link zum selben Ziel. Auf „Offene Punkte“ stand unter jeder Überschrift ein Erklärsatz, an jeder Aufgabe „Für alle im Team“, an jeder Erstaufnahme „Offen:“. Die Anrufliste trug „Offen“ an jeder Zeile unter „Anzurufen“ und „Mitgeteilt:“ unter „Schon mitgeteilt“, dazu einen dauerhaften Nachschlagetext. Die Warteliste nannte „Hausbesuch“ und „Therapeut:in egal“.

**Erwartet.** Abzeichen nur für Abweichungen; Zeilen nur, wenn sie etwas sagen; Erklärsätze zu Überschriften entfallen, Nachschlagetext zugeklappt; die Zeile „Offene Punkte“ ist selbst der Link. Nicht angefasst: der Datenschutzsatz unter „Navigation starten“ (ADR-019 Punkt 23 setzt ihn bewusst dorthin) und die beiden Kriteriensätze unter „Verordnung endet“ und „Versorgung abschließen?“, die eine Auswahlregel erklären.

### BEF-091 — Organisation, Abrechnung und Training tragen Regelfall-Abzeichen und Fußnoten

|         |   |
| ------- | - |
| Datum   | 2026-10-01 |
| Bereich | Mitarbeitende und Zugang, Rechnungen, Leistungen, Zahlung, Preisliste, Training, Mein Konto, Lastenräder, Urlaub, Zeitkonto, Erstattungen, Statistiken, Protokoll |
| Quelle  | Claude, systematische Durchsicht im Auftrag von Jannes |
| Status  | erledigt in UX-EPIC-005 (UX-005i) |
| Berührt | `src/features/{staff,billing,training,account,fleet,vacation,timeaccount,reimbursements,statistics,audit}/` |

**Beobachtung.** Die Rechnungsseite nannte den Empfänger dreimal, den Zahlungsstand zweimal, den eigenen Absender mit Bankverbindung auf jeder Rechnung und erklärte Storno und Unveränderlichkeit in sechs Sätzen; die Liste trug „Ausgestellt“ an jeder Rechnung und einen Knopf je Zeile. Die Mitarbeitenden-Seite erklärte die Trennung von Stammdaten und Zugang dreimal, zeigte „Beschäftigung: Aktiv“, „Stand: Eingerichtet“, leere Kontaktzeilen und eine siebenzeilige Admin-Anleitung. Trainingstermine trugen „Art: Hausbesuch“ und „Bestätigt“, jede Einheit „Hausbesuch · Tom“. Lastenräder wiederholten die Wochenübersicht je Rad; Urlaub listete offene Anträge mit „Beantragt“; „Mein Konto“ nannte den eigenen Namen und die Praxis als Zeilen.

**Erwartet.** Regelfälle ohne Abzeichen und Zeile, leere Werte ohne Zeile, Nachschlagetexte zugeklappt, die Rechnungsnummer als Link. Offen geblieben: Das Abzeichen „Nicht für Termine zuordenbar“ in der Mitarbeitendenliste markiert eine Rolle, kein Problem; es bleibt, weil die Liste die Rollen nicht kennt (serverseitige Änderung nötig). Die Praxiseinstellungen über dem Wochenplan (Praxisraster, automatische Finalisierung, Startort) bleiben offen, weil die Suche sie direkt anspringt.
### BEF-092 — Nach einer Adressänderung bleiben künftige Hausbesuche stumm bei der alten Adresse

|         |   |
| ------- | - |
| Datum   | 2026-10-02 |
| Bereich | Patientenakte, Stammdaten; Termine (Hausbesuch) |
| Quelle  | Jannes, Abnahme der Annahmen Block 2 (ANN-003) |
| Status  | erledigt in ABN-EPIC-001 (ABN-004, 2026-10-02) |
| Berührt | ANN-003; Adresskopie am Termin (`visit_street` …); ADR-018 |

**Beobachtung.** Ein Hausbesuch kopiert die Adresse beim Anlegen (ANN-003). Ändert die Praxis danach die Anschrift in den Stammdaten, behalten auch die **künftigen** Hausbesuche die alte Adresse, und nichts weist darauf hin.

**Erwartet.** Vergangene Termine behalten ihre damalige Adresse. Nach dem Speichern einer neuen Anschrift nennt die Akte die künftigen Hausbesuche mit abweichender Adresse und bietet an, sie gezielt zu aktualisieren (einzeln oder alle). Nichts ändert sich ohne Bestätigung, jede Änderung steht im Protokoll wie eine Terminänderung.


### BEF-093 — „Mitgeteilt“ verfällt auch bei Änderungen, die die Patient:in nicht betreffen

|         |   |
| ------- | - |
| Datum   | 2026-10-02 |
| Bereich | Termin, Mitteilungsvermerk |
| Quelle  | Jannes, Abnahme der Annahmen Block 2 (ANN-040) |
| Status  | erledigt in ABN-EPIC-001 (ABN-003, 2026-10-02) |
| Berührt | ANN-040; `appointment_notifications`, Regel `notified_at >= appointments.updated_at` in `20260912180000_appointment_notification.sql` |

**Beobachtung.** Der Vermerk gilt nur, solange `notified_at >= appointments.updated_at`. Jede Änderung am Termin hebt `updated_at`, auch Dokumentations- oder Abrechnungsstatus. Damit verfällt „Mitgeteilt“, obwohl sich für die Patient:in nichts geändert hat.

**Erwartet.** Der Vermerk verfällt nur bei Änderungen, die für die Patient:in relevant sind: Beginn und Ende, Ort bzw. Adresse, Terminart, behandelnde Person, Absage. Ein eigener Zeitstempel für die letzte relevante Änderung (per Trigger auf genau diese Spalten) ersetzt `updated_at` in der Regel. Test je relevanter und je interner Änderung.

### BEF-094 — Eine kurzfristige Verlegung durch die Patient:in ist pauschal gebührenfrei, ein Verzicht ist nicht vorgesehen

|         |   |
| ------- | - |
| Datum   | 2026-10-02 |
| Bereich | Termin absagen und verschieben, Ausfallhonorar |
| Quelle  | Jannes, Abnahme der Annahmen Block 2 (ANN-047) |
| Status  | erledigt in ABN-EPIC-001 (ABN-006, 2026-10-02) |
| Berührt | ANN-047, ANN-034; `app.is_late_cancellation()` in `20260912200000_cancellation_notice.sql`; ADR-018 Punkt 8 (Fassung 2: „nur Patientenabsage“) |

**Beobachtung.** Nur `patient_request` löst die 24-Stunden-Regel aus; „Termin verlegt“ ist immer gebührenfrei, egal wer verlegt. Einen bewussten Verzicht auf die Gebühr gibt es nicht.

**Erwartet.** Entscheidung Jannes, 2026-10-02:
- Verlegt die **Patient:in** weniger als 24 Stunden vorher, kann der ursprüngliche Termin ebenso ausfallen. Die 24-Stunden-Regel gilt dann wie bei der Absage. Dafür braucht die Verlegung die Angabe, wer sie veranlasst hat.
- Praxisveranlasste Änderungen bleiben gebührenfrei.
- Die Praxis kann im Einzelfall bewusst verzichten. Der Verzicht ist ein eigener, protokollierter Vermerk mit der Person, die verzichtet hat, kein Löschen des Anlasses.
- Nichtantreffen bleibt der eigene Gebührenanlass nach ADR-018.

Dafür braucht ADR-018 eine neue Fassung zu Punkt 8; sie entsteht mit dem Loop, der das baut.

### BEF-095 — Das Büro sieht „Doku offen“ und Dokumentationslinks nicht, obwohl es Dokumentation lesen darf

|         |   |
| ------- | - |
| Datum   | 2026-10-02 |
| Bereich | Patientenakte, Terminseite, Kalender (Terminpanel), Übersicht |
| Quelle  | Jannes, Abnahme der Annahmen Block 2 (ANN-201, ANN-202) |
| Status  | erledigt in ABN-EPIC-001 (ABN-005, 2026-10-02) |
| Berührt | ANN-201, ANN-202; ADR-004 Fassung 2 (E15: Office liest klinische Inhalte); `TreatmentNoteSection.tsx` (`faellig && darfSchreiben`), `TerminPanel.tsx`, `offenGrund` in `src/features/today/api.ts`, `list_appointments`/`list_day_plan` (`documentation_status`) |

**Beobachtung.** „Doku offen“ bzw. „Dokumentation fehlt“ hängt in der Oberfläche am **Schreibrecht**. Das Büro sieht beides nicht, ebenso wenig an fremden Terminen den Dokumentationsstatus und den Link zum Lesen. Dabei liest es nach ADR-004 Fassung 2 alle Dokumentation einschließlich Verlauf.

**Erwartet.** Ein zentrales Leserecht für Dokumentation, eine Regel für Akte, Terminansicht, Kalender und Übersicht, ohne eigene Einschränkungen je Oberfläche. Gemeint ist eine Funktion in der Datenbank und eine im Client, geprüft gegen dieselbe Rollenliste. Sichtbarkeit von Status, „Doku offen“ und Lese-Links folgt dem Leserecht. Bearbeiten und Finalisieren bleiben bei den behandelnden Rollen (ADR-016). Gilt auch für fremde Termine.

### BEF-096 — Das Kontingent zählt genutzte Termine aus der größten Leistungsmenge und verplant Nichtantreffen

|         |   |
| ------- | - |
| Datum   | 2026-10-02 |
| Bereich | Behandlungsgrundlage, Kontingent („noch 3 von 10“, gedeckt/ungedeckt), Erinnerungen, Statistik |
| Quelle  | Jannes, Abnahme der Annahmen Block 3 (ANN-042, ANN-067); Codeprüfung Claude, 2026-10-02 |
| Status  | erledigt in ABN-EPIC-001 (ABN-001, 2026-10-02) |
| Berührt | ANN-042, ANN-064, ANN-067, ANN-073; `app.treatment_basis_slot_counts` in `20260918140000_appointment_coverage.sql`; Nutzer in `20260929210000_prx_016_reminders.sql`, `20260929230000_sta_001_practice_statistics.sql` |

**Beobachtung.** Zwei Fehler in derselben Funktion:
- **Genutzt** ist `max(used_quantity)` über die Positionen der Grundlage, also eine Leistungsmenge. Werden je Termin verschiedene Heilmittel abgerechnet (Termin 1 KG, Termin 2 MT), zählt das einen genutzten Termin statt zwei.
- **Verplant und gedeckt** zählen jeden nicht abgesagten Termin, also auch einen mit „nicht angetroffen“. Ein Nichtantreffen belegt damit das Kontingent.

**Erwartet** (Jannes, 2026-10-02):
- Terminzahl und Leistungsmenge bleiben getrennte Größen (ANN-064, ANN-073).
- **Genutzt** zählt Behandlungstermine: Termine der Grundlage, die durchgeführt sind (durchgeführt, dokumentiert, abgerechnet). Mehrere Heilmittel oder eine Doppelbehandlung im selben Termin zählen einmal.
- Ausgeschöpft heißt genutzt ≥ möglich. Gebuchte Termine sind nur verplant.
- Abgesagte und nicht angetroffene Termine belegen und verbrauchen kein Kontingent; ein Ausfallhonorar bleibt davon getrennt.
- Überplanung bleibt als ungedeckt sichtbar.
- Die Leistungsmenge je Position (`used_quantity`) zählt weiter die Abrechnung (ANN-073).
- Tests mit gemischten Heilmitteln je Termin und mit Nichtantreffen.

### BEF-097 — Eine Terminübertragung lässt erfasste, nicht abgerechnete Leistungen bei der alten Grundlage

|         |   |
| ------- | - |
| Datum   | 2026-10-02 |
| Bereich | Behandlungsgrundlage, „Termine übertragen“; Leistungserfassung |
| Quelle  | Jannes, Abnahme der Annahmen Block 3 (ANN-068); Codeprüfung Claude, 2026-10-02 |
| Status  | erledigt in ABN-EPIC-001 (ABN-002, 2026-10-02) |
| Berührt | ANN-068, ANN-073; `transfer_appointments_to_treatment_basis` (`20260920106000_transfer_guard_billable_services.sql`), `billable_services` mit Verweis auf die Position |

**Beobachtung.** Die Übertragung schließt Termine mit abgerechneter Leistung aus, wie gewollt. Hat ein übertragener Termin aber schon eine **erfasste, nicht abgerechnete** Leistung, zeigt diese weiter auf die Position der alten Grundlage, und deren `used_quantity` bleibt dort verbraucht (ANN-073 hält die Wirkung bewusst an der Leistung fest). Terminzuordnung, Leistungszuordnung und Kontingentverbrauch passen danach nicht mehr zusammen.

**Erwartet.** Übertragen werden dürfen auch durchgeführte Termine, als nachvollziehbare Zuordnungskorrektur mit Auditeintrag. Abgerechnete Leistungen bleiben ausgeschlossen. Erfasste, nicht abgerechnete Leistungen ziehen in derselben Transaktion mit: Sie bekommen die passende Position der Zielgrundlage, die genutzte Menge wandert von alt nach neu. Gibt es dort keine passende Position, wird mit einem verständlichen Grund abgewiesen, statt still zu trennen. Test für alle drei Fälle.

### BEF-098 — Behandlungsrelevante Hinweise aus einer Verordnung haben keinen klinischen Ort mehr

|         |   |
| ------- | - |
| Datum   | 2026-10-02 |
| Bereich | Behandlungsgrundlage (Verordnung), klinische Projektion |
| Quelle  | Jannes, Abnahme der Annahmen Block 3 (ANN-065) |
| Status  | erledigt in ABN-EPIC-001 (ABN-007, 2026-10-02) |
| Berührt | ANN-065; `treatment_bases.prescriber_note` (klinisch, keine neue Eingabe), `treatment_bases.note` (organisatorisch); ADR-020, ADR-004 Fassung 2 |

**Beobachtung.** Seit ANN-065 schreibt das Formular nur noch „Anmerkungen“ (organisatorisch). Der klinische „Hinweis der Verordner:in“ nimmt nichts Neues an. Ein behandlungsrelevanter Hinweis aus einer neuen Verordnung (etwa „keine Belastung über 20 kg“, „Therapieziel …“) hat damit keinen klinischen Ort.

**Erwartet.** Ein klinisches Feld an der Grundlage für behandlungsrelevante Hinweise. Naheliegend ist, `prescriber_note` für neue Eingaben wieder zu öffnen, getrennt von den organisatorischen „Anmerkungen“ und klar beschriftet. Schreiben dürfen die behandelnden Rollen. Das Büro liest es wie die Therapeut:innen (ADR-004 Fassung 2), über dasselbe zentrale Leserecht wie BEF-095.

### BEF-100 — Abrechnung: Steuernummer Pflicht, Storno gesperrt durch Zahlungen, Teilzahlungen einzeln gerundet

|         |   |
| ------- | - |
| Datum   | 2026-10-02 |
| Bereich | Praxis-Stammdaten, Storno, Auswertung „Einnahmen je Leistungsart“ |
| Quelle  | Jannes, Abnahme der Annahmen Block 4 (ANN-074, ANN-079, ANN-088); Codeprüfung Claude, 2026-10-02 |
| Status  | erledigt in ABN-EPIC-001 (ABN-008, 2026-10-02) |
| Berührt | `practice_billing_profiles.tax_number not null` (`20260919130000_practice_billing_profile.sql`); Storno-Regel in `20260919170000_invoice_cancellations.sql`; Schritte `abgerundet`/`verteilt` in `list_revenue_by_service_area` |

**Beobachtung und erwartet:**
1. **Steuernummer:** Sie ist Pflicht, die USt-IdNr. optional. Erwartet ist „Steuernummer **oder** USt-IdNr.“ (§ 14 Abs. 4 Nr. 2 UStG); die IBAN bleibt Pflicht.
2. **Storno:** Eine Rechnung mit stehender Zahlung lässt sich nicht stornieren, erst müsste die Zahlung storniert werden. Ein tatsächlich eingegangener Betrag darf so nicht verschwinden. Erwartet:
   - Das Storno ist auch mit Zahlung möglich.
   - Der Betrag wird nachvollziehbar mit der Ersatzrechnung verrechnet oder als tatsächliche Rückzahlung gebucht.
   - Ein Zahlungsstorno dient nur der Korrektur einer falschen Buchung.
3. **Teilzahlungen:** Jede Zahlung wird für sich auf die Steuergruppen verteilt und gerundet. Mehrere Teilzahlungen ergeben bei vollständiger Zahlung nicht sicher genau die Gruppen der Rechnung. Erwartet:
   - kumulativ verteilen: die Summe aller Zahlungen bis einschließlich dieser verteilen, die Verteilung davor abziehen;
   - eine Rückzahlung nimmt die zugehörige Verteilung nachvollziehbar zurück;
   - Test mit drei krummen Teilzahlungen.

### BEF-115 — Plattformkonten werden per SQL aus `auth.users` gelöscht

|         |   |
| ------- | - |
| Datum   | 2026-10-02 |
| Bereich | Löschlauf, Plattformkonten |
| Quelle  | Jannes, Abnahme der Annahmen Block 9 (ANN-189) |
| Status  | erledigt in ABN-EPIC-001 (ABN-011, 2026-10-02) |
| Berührt | ANN-189; `public.apply_retention` (Schritt `auth_users`); Zugangsdienst; OPS-001 |

**Erwartet** (Jannes, 2026-10-02): Fristen wie gebaut. Der Ablauf der Einladung beendet nur einen nie eingelösten Zugang; das Konto fällt erst 30 Tage nach dem Ende **aller** seiner Zugänge (Test mit zwei Zugängen, einer endet früher). Gelöscht wird über die unterstützte Admin-API des Anmeldedienstes, etwa als Warteschlange, die der Löschlauf füllt und der Zugangsdienst abarbeitet; Löschjournal und erneutes Löschen nach einem Restore bleiben. In OPS-001 am Testprojekt prüfen.

### BEF-116 — Einwilligung zur Begleitung: Umfang nicht ausdrücklich festgehalten

|         |   |
| ------- | - |
| Datum   | 2026-10-02 |
| Bereich | Plattform, Vertretung (Begleitung) |
| Quelle  | Jannes, Abnahme der Annahmen Block 9 (ANN-206) |
| Status  | erledigt in ABN-EPIC-001 (ABN-010, 2026-10-02) |
| Berührt | ANN-206; `consent_text_version`, `consent_recorded_by/at`, `consent_earlier_messages`; `einwilligungBegleitung` in `src/lib/vertretung.ts`; B2 |

**Erwartet** (Jannes, 2026-10-02): Die Person stimmt ausdrücklich selbst zu. Der Nachweis hält fest: Fassung des Wortlauts, benannte Begleitperson, **freigegebenen Umfang** (heute nur mittelbar über die Fassung und `consent_earlier_messages`; künftig ausdrücklich je Bereich, siehe BEF-119), Zeitpunkt und bestätigende Praxiskraft. Ob das Häkchen der Praxis als Nachweis genügt oder eine Unterschrift bzw. Textform nötig ist, entscheidet die Prüfung B2; das Nachweisverfahren bleibt bis dahin an einer Stelle austauschbar.

### BEF-117 — Volljährigkeit am 29. Februar uneinheitlich gerechnet

|         |   |
| ------- | - |
| Datum   | 2026-10-02 |
| Bereich | Plattform, Altersgrenze |
| Quelle  | Jannes, Abnahme der Annahmen Block 9 (ANN-208); Codeprüfung |
| Status  | erledigt in ABN-EPIC-001 (ABN-009, 2026-10-02) |
| Berührt | ANN-190, ANN-208; `app.platform_is_minor`, `app.platform_access_ended_at`, Einladungsprüfungen in `20260930141000_por_002_platform_accesses.sql` und `20261002100000_por_005_representation.sql` |

**Befund** (Codeprüfung, 2026-10-02): Die Prüfung „minderjährig“ zieht 18 Jahre vom heutigen Tag ab und macht eine am 29. Februar geborene Person im Nichtschaltjahr richtig am 1. März volljährig. Das Ende des Sorgerechts rechnet dagegen Geburtstag plus 18 Jahre, landet auf dem 28. Februar und endet einen Tag zu früh.

**Erwartet** (Jannes, 2026-10-02): Volljährig ist man um 0 Uhr am 18. Geburtstag, bei Geburt am 29. Februar im Nichtschaltjahr am 1. März (§§ 187 Abs. 2, 188 Abs. 2 BGB), in der Zeitzone der Praxis. **Eine** Funktion liefert diesen Tag (etwa Geburtstag minus ein Tag plus 18 Jahre plus ein Tag); eigener Zugang, Vertretungsprüfung und Ende des Sorgerechts rufen sie auf. Testfälle: 29. Februar, 28. Februar, 1. März.

### BEF-118 — Wiederherstellung per Mail ohne bestätigtes Postfach möglich

|         |   |
| ------- | - |
| Datum   | 2026-10-02 |
| Bereich | Plattform, Anmeldung und Kennwort |
| Quelle  | Jannes, Abnahme der Annahmen Block 9 (ANN-191, B13) |
| Status  | erledigt in ABN-EPIC-001 (ABN-012, 2026-10-02) |
| Berührt | ANN-191; Zugangsdienst (Anlegen mit gesetztem Bestätigungsstatus); Kennwort-Wiederherstellung; ADR-023 Punkte 7 und 8; ADR-025 Punkt 7 |

**Erwartet** (Jannes, 2026-10-02): Eine Wiederherstellung per Mail gibt es für ein Plattformkonto nur, wenn das Postfach **tatsächlich** per Link bestätigt wurde; der beim Anlegen automatisch gesetzte Status zählt nicht und braucht ein eigenes Merkmal. Ohne Bestätigung gibt es einen neuen Code nach Identitätsprüfung vor Ort. Jede Adressänderung verlangt eine neue Bestätigung. Die Sperre gilt im Server **und** im Anmeldedienst (kein Wiederherstellungslink an eine unbestätigte Adresse), nicht nur in der Oberfläche; ein Test belegt das.

### BEF-119 — Vertretung: Freigabe nicht nach nachgewiesenem Aufgabenkreis

|         |   |
| ------- | - |
| Datum   | 2026-10-02 |
| Bereich | Plattform, Vertretung |
| Quelle  | Jannes, Abnahme der Annahmen Block 9 (ANN-205) |
| Status  | erledigt in ABN-EPIC-001 (ABN-010, 2026-10-02) |
| Berührt | ANN-205; `guardianship_health_scope`, `app.assert_platform_representation`, `app.platform_access_allows`; Rechnungen und Zahlungen auf der Plattform (POR-EPIC-002 ff.) |

**Erwartet** (Jannes, 2026-10-02): Ein zweites Häkchen „Aufgabenkreis umfasst Vermögenssorge“. Rechnungen und Zahlungen gibt `app.platform_access_allows` einer Vertretung nur frei, wenn der geprüfte Aufgabenbereich sie umfasst; Gesundheitssorge allein gibt keinen Abrechnungszugriff. Allgemein: Freigegeben werden nur die nachgewiesenen Bereiche, nie pauschal alles. Das gilt sinngemäß auch für eine Vorsorgevollmacht und für den Umfang einer Begleitung (BEF-116). Die Rechte stehen weiter an einer Stelle, mit Test je Bereich.

### BEF-101 — Erhebungen: Server prüft nur die Form, Korrektur ohne eigenes Datum, Tegner ohne Leseart

|         |   |
| ------- | - |
| Datum   | 2026-10-02 |
| Bereich | Befund, Fragebögen und Scores (Erhebung, Verlauf) |
| Quelle  | Jannes, Abnahme der Annahmen Block 5 (ANN-084, ANN-085, ANN-103, ANN-105) |
| Status  | erledigt in ABN-EPIC-001b (ABN-014, 2026-10-02) |
| Berührt | `src/features/assessments/definitionen/`, `antwortenSchema`; `patient_questionnaire_responses`; Verlaufsansicht im Befund |

**Erwartet** (Jannes, 2026-10-02):
1. **Serverprüfung (ANN-105):** Der Server prüft auch Instrument und Version, gültige Antwortoptionen, Wertebereiche und unzulässige Kombinationen. Er nutzt dafür dieselben Definitionsdateien wie die Anwendung, etwa als vom Build erzeugte Tabelle oder Funktion, nicht als zweite Fassung von Hand. Historische Erhebungen werden mit ihrer **ursprünglichen** Definition angezeigt und ausgewertet; ein Hinweis auf eine neuere Version genügt nicht. Ältere Versionen bleiben dafür im Release.
2. **Korrektur (ANN-103):** Eine Korrektur bleibt mit der ursprünglichen Erhebung verknüpft. Erhebungsdatum und Korrekturzeitpunkt werden getrennt geführt. Im Verlauf erscheint die Korrektur am Erhebungsdatum, nicht als zusätzliche Messung.
3. **Tegner (ANN-085):** keine Wertung „besser/schlechter“, aber der Zahlenwert mit dem Hinweis „höher = aktiver“.
4. **Versionen (ANN-084):** Eine Patch-Stelle steht nur für bedeutungserhaltende Korrekturen. Geänderter Frageninhalt, andere Antwortmöglichkeiten oder eine andere Berechnung sind fachliche Änderungen; ob die Werte vergleichbar bleiben, wird je Änderung geprüft und an der Definition vermerkt. Die Nummer allein sagt das nicht.

### BEF-102 — Ein entferntes Ereignis im Verlauf ist gelöscht statt nachvollziehbar entfernt

|         |   |
| ------- | - |
| Datum   | 2026-10-02 |
| Bereich | Befund, Verlauf (Ereignisse: Operation, Erkrankung, Pause, Medikation, Sonstiges) |
| Quelle  | Jannes, Abnahme der Annahmen Block 5 (ANN-106); Codeprüfung Claude |
| Status  | erledigt in ABN-EPIC-001b (ABN-013, 2026-10-02) |
| Berührt | ANN-106; `remove_patient_course_event` (`delete from public.patient_course_events`) in `20260926110000_frb_002e_course_events.sql` |

**Beobachtung.** „Entfernen“ löscht die Zeile. Im Auditlog steht nur, dass etwas entfernt wurde, nicht was.

**Erwartet.** Entfernen markiert das Ereignis als entfernt (wer, wann). Ursprünglicher Inhalt und Urheber bleiben in der Akte nachvollziehbar, etwa unter „Entfernte Ereignisse“. Im Verlauf erscheint es nicht mehr. Das Auditlog bleibt bei Metadaten. Die Frist folgt der Akte.

### BEF-103 — Bausteine: unbestätigte Vorschläge im Entwurf, Seitenwechsel, Ergebnis nur als Zeichen, Tippfehler

|         |   |
| ------- | - |
| Datum   | 2026-10-02 |
| Bereich | Befund aus Bausteinen (Behandlung abschließen, Dokumentation bearbeiten) |
| Quelle  | Jannes, Abnahme der Annahmen Block 5 (ANN-119, ANN-120, ANN-129, ANN-130) |
| Status  | erledigt in ABN-EPIC-001b (ABN-015, 2026-10-02) |
| Berührt | ANN-119, ANN-120, ANN-129, ANN-130; `definitionen/bausteine/*.json`; Bausteinfeld und Navigationsschutz der Dokumentation |

**Erwartet** (Jannes, 2026-10-02):
1. **Vorschläge (ANN-120):** Ein Vorschlag gelangt nur durch ausdrückliches Übernehmen in den Dokumentationsentwurf. Beim Verlassen oder Speichern wird **kein** unbestätigter Vorschlag ungesehen angehängt, auch weil der Entwurf später automatisch finalisiert werden kann. Heute geht er laut ANN-120 beim Verlassen mit. Die bisherigen Eingaben (Häkchen, Werte) bleiben trotzdem erhalten, getrennt vom Entwurf, bis die Person übernimmt oder verwirft.
2. **Seitenwechsel (ANN-129):** Beim Wechsel von „beidseits“ auf eine Seite gehen die Ergebnisse der anderen Seite nicht still verloren; sie bleiben erhalten oder es wird vorher gefragt.
3. **Ergebnis im Text (ANN-130):** Im gespeicherten Text steht „o.B.“ bzw. „positiv“ ausgeschrieben; ✅/❗ dürfen ergänzen, tragen die Bedeutung aber nicht allein.
4. **Tippfehler (ANN-119):** Offensichtliche Tippfehler der Vorlage („Supinatin“, „Relocation Tet“, „Lachmann“ und vergleichbare) werden für künftige Einträge korrigiert, als Patch-Version (BEF-101 Punkt 4). Kennungen bleiben, bestehende Dokumentation ändert sich nicht. Die drei unvollständigen Bereiche bleiben sichtbar als unvollständig gekennzeichnet; Fehlendes wird nicht selbst ergänzt (ANN-118).

### BEF-104 — Therapiebericht: Korrektur ohne Kette, Grenze von 50 Einträgen still

|         |   |
| ------- | - |
| Datum   | 2026-10-02 |
| Bereich | Therapiebericht |
| Quelle  | Jannes, Abnahme der Annahmen Block 5 (ANN-121, ANN-122); Codeprüfung Claude |
| Status  | erledigt in ABN-EPIC-001b (ABN-016, 2026-10-02) |
| Berührt | ANN-121, ANN-122; `therapy_reports` (`20260926140000_dok_005a_therapy_reports.sql`) |

**Erwartet.**
- Eine Berichtskorrektur verweist auf den ersetzten Bericht und trägt Korrekturgrund, Zeitpunkt und Verfasser:in. Heute gibt es dafür weder Verweis noch Grund.
- Der eigene Berichtstext der Therapeut:in bleibt der Kern. Wörtliche Dokumentationseinträge sind ergänzende Auszüge; so ist es gebaut, `report_text`.
- Die Grenze von 50 Einträgen ist beim Auswählen sichtbar, und ein 51. Eintrag wird mit Hinweis abgewiesen, nie still abgeschnitten.

### BEF-107 — Auskunft nach Art. 15: ohne Zugriffe und ohne die Fotos selbst

|         |   |
| ------- | - |
| Datum   | 2026-10-02 |
| Bereich | „Auskunft und Löschverlangen“ (OPS-006) |
| Quelle  | Jannes, Abnahme der Annahmen Block 6 (ANN-092, ANN-128) |
| Status  | erledigt in ABN-EPIC-001b (ABN-017, 2026-10-02) |
| Berührt | ANN-092, ANN-128; `patient_record.exported`; Auditlog-Lesepfad |

**Erwartet** (Jannes, 2026-10-02):
- **Zugriffe:** Eine umfassende Auskunft berücksichtigt auch Datum und Zweck der Zugriffe auf die Akte, aus dem Auditlog. Namen der Beschäftigten bleiben grundsätzlich weg; begründete Ausnahmen werden im Einzelfall geprüft.
- **Fotos:** Die vollständige Kopie enthält die Fotos selbst, nicht nur ihre Angaben. Noch vorhandene, gesperrte Fotos sind nicht pauschal ausgeschlossen.
- Herausgabe durch owner und Protokollierung bleiben.

### BEF-108 — Warteliste ohne Aktualitätsprüfung, Nachweis des Zusammenführens nur drei Jahre

|         |   |
| ------- | - |
| Datum   | 2026-10-02 |
| Bereich | Warteliste; Akten zusammenführen |
| Quelle  | Jannes, Abnahme der Annahmen Block 6 (ANN-133, ANN-150) |
| Status  | erledigt in ABN-EPIC-001b (ABN-018, 2026-10-02) |
| Berührt | ANN-133, ANN-150; `waitlist_entries`; `merge_patients`, Legal Hold |

**Erwartet** (Jannes, 2026-10-02):
1. **Warteliste:** Offene Einträge werden regelmäßig auf Aktualität geprüft. Etwa ein Hinweis in „Offene Punkte“, wenn ein Eintrag länger als eine festgelegte Zeit unverändert offen steht; die Zeit ist eine Konstante, als Annahme im Loop.
2. **Nachweis:** Der Nachweis des Zusammenführens bleibt so lange wie die betroffene Akte, als Vermerk an der bleibenden Akte, und stützt sich nicht allein auf das dreijährige Auditlog.
3. **Legal Hold:** Alle Gründe bestehender Legal Holds bleiben wirksam. Heute wird beim Zusammenführen die Sperre der Dublette aufgehoben, wenn die bleibende Akte schon eine hat (ANN-150). Künftig bleiben beide Gründe wirksam, etwa mehrere aktive Sperren je Akte oder beide Gründe an der einen Sperre.

### BEF-110 — Abstecher-Entwurf verfällt still, MDR-Freigabe ohne Nachweis

|         |   |
| ------- | - |
| Datum   | 2026-10-02 |
| Bereich | Verordnungsformular aus dem Kalender (Abstecher); MDR-Register |
| Quelle  | Jannes, Abnahme der Annahmen Block 7 (ANN-019, ANN-089) |
| Status  | erledigt in ABN-EPIC-001b (ABN-019, 2026-10-02) |
| Berührt | ANN-019 (`src/lib/abstecher.ts`); ANN-089 (`src/app/mdr.ts`); ADR-006; ADR-025 Punkt 4 |

**Erwartet** (Jannes, 2026-10-02):
1. **Abstecher-Entwurf (ANN-019):** Weder der Ablauf nach 30 Minuten noch eine automatische Abmeldung oder Sperre löschen Eingaben still. Der Entwurf wird geschützt gesichert, etwa serverseitig als Entwurf wie die Dokumentation oder ausdrücklich verworfen nach Rückfrage. Wiederaufnahme nur mit demselben Konto. Stimmt mit ADR-025 Punkt 4 überein.
2. **MDR-Freigabe (ANN-089):** Eine Funktion wird erst nach dokumentierter MDR-Prüfung geöffnet. Der Nachweis (wer, wann, Ergebnis, Verweis auf die Prüfung) steht am Registereintrag oder in einem eigenen Freigabevermerk; bloßes Entfernen des Eintrags genügt nicht. Vorhandene Serverzugänge solcher Funktionen werden ebenfalls gesperrt, nicht nur die Adressen der Oberfläche.

### BEF-111 — Trainingskontakt: Hausnummer im Straßenfeld, Rechnung ohne vollständige Anschrift

|         |   |
| ------- | - |
| Datum   | 2026-10-02 |
| Bereich | Training: Kontakt, Hausbesuch, Rechnung |
| Quelle  | Jannes, Abnahme der Annahmen Block 8 (ANN-177, ANN-182) |
| Status  | erledigt in ABN-EPIC-001b (ABN-020, 2026-10-02) |
| Berührt | ANN-177 (`app.split_street_and_house_number`, `app.training_visit_address`); ANN-182 (`issue_invoice`, `app.build_invoice_document`); `training_contact_details` |

**Erwartet** (Jannes, 2026-10-02):
1. **Getrennte Felder (ANN-177):** Der Trainingskontakt führt Straße und Hausnummer als zwei Felder, wie die Akte. Der Hausbesuch übernimmt sie unverändert; die Trennung am letzten Leerzeichen entfällt. Bestehende Einträge werden einmal aufgeteilt, was nicht eindeutig ist, bleibt zur Prüfung stehen.
2. **Rechnung (ANN-182):** Eine Trainingsrechnung wird ohne vollständige Empfängeranschrift (Straße, Hausnummer, PLZ, Ort) nicht ausgestellt. Die Sperre sitzt im Server (`issue_invoice`), die Oberfläche nennt, was fehlt.

### BEF-112 — Trainingsbetreuung sieht im Kalender keine belegten Zeiten

|         |   |
| ------- | - |
| Datum   | 2026-10-02 |
| Bereich | Kalender und Tagesliste der Trainingsbetreuung |
| Quelle  | Jannes, Abnahme der Annahmen Block 8 (ANN-180) |
| Status  | erledigt in ABN-EPIC-001b (ABN-021, 2026-10-02) |
| Berührt | ANN-180 (`public.list_appointments`, `app.may_read_appointment_context`); `PROJECT_PRINCIPLES.md` §4.8 (Belegung); ADR-022 Punkt 11 |

**Erwartet** (Jannes, 2026-10-02): Die Trainingsbetreuung sieht relevante belegte Zeiten (der betroffenen Mitarbeitenden und Räume) als anonyme Blöcke „belegt“, damit sie freie Zeiten erkennt, statt erst beim Speichern davon zu erfahren. Ein Block trägt nur Beginn, Ende und Person, keinen Kontext, keinen Namen, keine Adresse, keinen Zustand. Die Projektion entsteht im Server; ein Test belegt, dass keine Behandlungsdaten herauskommen.

### BEF-113 — Trainingsprotokoll: Büro liest, Nachtrag, Verwerfen mit Hinweis

|         |   |
| ------- | - |
| Datum   | 2026-10-02 |
| Bereich | Trainingsprotokoll |
| Quelle  | Jannes, Abnahme der Annahmen Block 8 (ANN-184, ANN-185, ANN-186) |
| Status  | erledigt in ABN-EPIC-001b (ABN-022, 2026-10-02) |
| Berührt | ANN-184 (`app.can_access_training_protocols`, `canWriteTrainingProtocols`); ANN-185 (`training_protocols_guard`); ANN-186 (`appointments_training_protocol_guard`, Löschjournal); `PROJECT_PRINCIPLES.md` 0.19 §4.8; ADR-021 Fassung 2 Punkt 10 |

**Erwartet** (Jannes, 2026-10-02):
1. **Büro liest (ANN-184):** Lese- und Schreibrecht getrennt. `office` liest Protokolle und ihren Zustand, auch in der Liste der Einheiten, protokolliert als `training_protocol.viewed`; Schreiben und Abschließen bleiben bei owner und Trainingsbetreuung. Scharf mit echten Daten erst, wenn die DSFA (B2) das Lesen bestätigt.
2. **Nachtrag (ANN-185):** Ein abgeschlossenes Protokoll bleibt unveränderlich. Korrekturen kommen als verknüpfter Nachtrag mit Grund, Verfasser:in und Zeitpunkt, angezeigt unter dem Text, wie in der Behandlung.
3. **Verwerfen (ANN-186):** Bevor eine Absage oder ein Nichtantreffen einen Entwurf verwirft, weist die Oberfläche auf den Verlust hin, auch dem Büro. Ein verworfener Entwurf steht im Löschjournal und taucht nach einer Wiederherstellung nicht wieder auf.

### BEF-105 — Dateien: Typ, Prüfsumme und Metadaten stützen sich auf Angaben des Browsers

|         |   |
| ------- | - |
| Datum   | 2026-10-02 |
| Bereich | Dateiablage der Akte, Patientenfotos (Upload) |
| Quelle  | Jannes, Abnahme der Annahmen Block 6 (ANN-053, ANN-125) |
| Status | erledigt in ABN-EPIC-001c (ABN-024 Spalten und Schalter, ABN-025 Edge Function `patient-file-verify`, ABN-026 sRGB; ANN-053 Fassung 2, ANN-125 Fassung 3, ANN-222); scharf mit OPS-001 |
| Berührt | ANN-053, ANN-125; ADR-017 (Bestätigung, Virenprüfung); `storage.objects.metadata`; Metadaten-Entfernung im Browser |

**Erwartet** (Jannes, 2026-10-02):
- **Dateityp:** Der Server prüft ihn am **Inhalt** der Datei (Signatur der ersten Bytes), nicht am MIME-Typ, den Speicher oder Browser angeben. Der passende Ort ist der serverseitige Schritt, den ADR-017 ohnehin für die Virenprüfung vorsieht.
- **Prüfsumme:** Die SHA-256 aus dem Browser wird als „nicht serverseitig verifiziert“ geführt, solange der Server sie nicht nachrechnet.
- **Metadaten:** Die Metadatenfreiheit eines Fotos wird zusätzlich serverseitig geprüft und gegebenenfalls nachbereinigt.
- **Darstellung:** Ausrichtung **und korrekte Farbdarstellung** bleiben erhalten. Heute entfernt das Gerät auch das Farbprofil (ANN-125); künftig wird das Bild entweder vorher nach sRGB umgerechnet oder ein sRGB-Profil bleibt.

### BEF-106 — Medizinisch notwendige Fotos fallen unter die kurzen Fristen der Foto-Arbeitshilfe

|         |   |
| ------- | - |
| Datum   | 2026-10-02 |
| Bereich | Patientenfotos, Akte, Löschlauf |
| Quelle  | Jannes, Abnahme der Annahmen Block 6 (ANN-126, ANN-127) |
| Status | erledigt in ABN-EPIC-001c (ABN-023; ANN-126, -127, -128 Fassung 3, ANN-221) |
| Berührt | ANN-126, ANN-127; ADR-017 (Punkte 37 ff., Fotos als Arbeitshilfe, Klasse `patientenfoto`); ADR-008; Legal Hold |

**Beobachtung.** Jedes Patientenfoto ist heute Arbeitshilfe auf Einwilligung: höchstens zwölf Monate, drei Monate nach dem Abschluss, ein Widerruf löscht.

**Erwartet** (Jannes, 2026-10-02):
- Medizinisch notwendige **Dokumentationsfotos** gehören zur Akte, mit deren Frist (zehn Jahre, ADR-008).
- Die kurzen Fristen und der Widerruf gelten nur für **zusätzliche, vorübergehende Foto-Arbeitshilfen**.
- Ein Widerruf hebt weder gesetzliche Aufbewahrungspflichten noch einen Legal Hold auf.
- Dafür braucht es eine Unterscheidung beim Aufnehmen, eine eigene Datenklasse und eine neue Fassung von ADR-017. Die Rechtsgrundlage der Dokumentationsfotos (Behandlung, Art. 9 Abs. 2 lit. h) geht in B2.

### BEF-109 — Kartendienst: Gate in Produktion, eindeutige Treffer, Ersatzschätzungen

|         |   |
| ------- | - |
| Datum   | 2026-10-02 |
| Bereich | Kartendienst (`location-provider`), Stammdaten (Verorten), Tour und Fahrpuffer |
| Quelle  | Jannes, Abnahme der Annahmen Block 7 (ANN-094, ANN-095, ANN-097) |
| Status | erledigt in ABN-EPIC-001c (ABN-028; ANN-094 Fassung 3, ANN-095 und ANN-097 Fassung 2) |
| Berührt | ANN-094, ANN-095, ANN-097; ADR-019 (Gate Punkt 9, Anbieterprüfung); `LOCATION_DATA_GATE`; Matrix- und Routenantworten |

**Erwartet** (Jannes, 2026-10-02):
1. **Gate (ANN-094):** Der Wert `synthetic` ist in der Produktivumgebung **technisch ausgeschlossen**, nicht nur per Konvention. Die Function erkennt die Umgebung und lehnt ihn dort ab; ein Test belegt das. Die Anbieterprüfung (ADR-019 Punkt 9, G12) deckt auch die **direkt geladenen Kartenkacheln** ab, die am Server vorbei aus dem Browser kommen.
2. **Verorten (ANN-095):** Automatisch übernommen wird nur ein **eindeutiger** Treffer zur **vollständigen** Adresse. Ändert sich die Adresse, wird die alte Koordinate der Stammdaten verworfen (prüfen, ob das heute so ist). Historische Termine behalten ihren Stand (ANN-003, BEF-092).
3. **Fahrzeit (ANN-097):** Liefert der Anbieter eine Luftlinien- oder Ersatzschätzung statt einer Routenfahrzeit, was PTV in Matrixantworten tun kann, wird sie ausdrücklich gekennzeichnet oder als „Fahrzeit nicht verfügbar“ behandelt, nie als echte Fahrzeit.

### BEF-099 — Der Preis entsteht aus den Heilmitteln statt aus einem Terminhonorar

|         |   |
| ------- | - |
| Datum   | 2026-10-02 |
| Bereich | Abrechnung: Leistungskatalog, Leistungserfassung, Rechnung; Behandlungsgrundlage |
| Quelle  | Jannes, Abnahme der Annahmen Block 4 (ANN-070, ANN-064, ANN-066, ANN-073, ANN-140) |
| Status  | erledigt in ABR-EPIC-007 (ABR-030 bis ABR-032, 2026-10-05; Rechnungsdarstellung nach B17-Entscheidung, ADR-009 Punkt 23) |
| Berührt | ADR-009 Fassung 4 Punkte 5 und 22; ADR-020; `record_billable_services`, `get_billable_service_draft`, Katalog (`service_catalog_*`), `treatment_base_items.used_quantity` |

**Beobachtung.** Heute ist jede Katalogposition ein Heilmittel mit eigenem Preis. Am Termin bestätigte Heilmittel (ANN-140) werden je Position als Leistung erfasst und berechnet. KG plus MT plus Hausbesuch ergeben damit drei Preise, und dieselbe Erfassung schreibt die Heilmittelmenge fort (ANN-073). Eine patientenbezogene Honorarvereinbarung gibt es nicht.

**Erwartet** (Jannes, 2026-10-02):
- Je durchgeführtem Behandlungstermin entsteht genau einmal das vereinbarte Terminhonorar (heute 140 € für 60 Minuten, inklusive Dokumentation und Hausbesuch).
- Die Heilmittelauswahl verändert den Preis nicht.
- Die erbrachten Heilmittel werden weiter bestätigt und schreiben die Mengen fort, aber ohne eigenen Preis.
- Tarife und patientenbezogene Honorarvereinbarungen sind versioniert mit Gültigkeitsbeginn. Maßgeblich ist die am Leistungstag geltende Vereinbarung, sonst der Tarif.
- Preisänderungen verändern keine erfasste Leistung und keine Rechnung.
- Bestehende Katalogpositionen und Abrechnungen bleiben erhalten und lesbar.
- Die Rechnungsdarstellung ist austauschbar an einer Stelle, bis B17 entschieden ist.
- Terminzahl (BEF-096), Heilmittelmenge (ANN-073) und Rechnungsbetrag müssen danach zusammenpassen; ein Test prüft alle drei an einem Fall.

### BEF-051 — Übersicht: Die Liege wird auch für Praxistermine angekündigt, und das Büro beginnt jeden Tag mit einem leeren Block

|         |                                                                                                                                                                                                                                                                                                                 |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-27                                                                                                                                                                                                                                                                                                      |
| Bereich | Übersicht (`/`): Tagesstart, Tageskarte, eigene Tagesliste und Plan des Teams                                                                                                                                                                                                                                   |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390 und 1440 px, Gegenprüfung; Review-IDs UEB-B01, UEB-07                                                                                                                                                                                                     |
| Status  | erledigt in UBK-EPIC-001 (UBK-001, 2026-10-05): Option 2 – Liege nur am Hausbesuch, Teamplan zuerst für Rollen ohne Dokumentationsrecht, Tagesroute nur mit Hausbesuch; ANN-116 und ANN-117 je Fassung 2                                                                                                                                                                                                                                                                                                           |
| Berührt | `src/features/today/tagesstart.ts` (`besucheDesTages`, `liegeHeute`), `src/features/today/tagesstart.test.ts`, `src/features/today/Tagesliste.tsx` (Z. 102–107), `src/features/today/MyDayPage.tsx` (Z. 151, 285–297, 380, 437–439), `src/features/tours/TagesrouteAufklapper.tsx` (Z. 68–70); ANN-116, ANN-117 |

**Beobachtung.**

- **Liege am Praxistermin.** Im Seed hat Jannes heute nur einen Termin in der
  Praxis (16:00, Hauptstandort). Die Übersicht sagt „Liege heute: ja, ab 1.
  Besuch (16:00 Uhr)“, die Karte „Praxis · Hauptstandort … Behandlungsliege:
  mitnehmen“. Gezählt werden alle nicht abgesagten Behandlungstermine, gezeigt
  wird das Merkmal ohne Blick auf die Terminart; die Tests decken nur
  Hausbesuche ab. An gemischten Tagen zählt „ab n. Besuch“ die Praxistermine mit
  — genau die Angabe, nach der morgens gepackt wird.
- **Büro.** Die eigene Tagesliste erscheint für jede Rolle mit
  Mitarbeiterdatensatz, auch für office. Der Code sagt selbst: „Das Büro hat
  meist keine eigenen Besuche, für es ist der Plan des Teams die Hauptsache“.
  Oben stehen trotzdem „Offen heute“ mit „Ihre Besuche mit Anschrift …“, ein
  Leerzustand „Heute ist nichts mehr offen“ — der behauptet, es habe etwas
  gegeben — und „Tagesroute auf der Karte“, das nur „Heute gibt es keinen Besuch
  mit Ort.“ lädt. Der Plan des Teams beginnt bei 1440 px erst bei rund 590 px.

**Frage an Jannes.** (1) Gilt die Liege nur für Hausbesuche, auch in der Zählung
„ab n. Besuch“? (2) Soll für Rollen ohne Dokumentationsrecht der Plan des Teams
vor der eigenen Liste stehen?

**Optionen.**

1. **Nur berichtigen:** Merkmal und Zählung nur an Hausbesuchen, mit einem Test
   für den Praxistermin; ANN-117 („Behandlungsbesuche“) auf Hausbesuche
   nachziehen. Für das Büro ohne eigene Einträge eine Zeile „Ihnen sind heute
   keine Termine zugeordnet.“ statt des Abschnitts, die Tagesroute nur mit
   mindestens einem Hausbesuch. Folge: keine neue Festlegung außer dem Wortlaut
   von ANN-117; der Teamplan rückt um den leeren Block nach oben.
2. **Wie 1, dazu für Rollen ohne Dokumentationsrecht der Plan des Teams
   zuerst.** Folge: Das Büro sieht zuerst, was es plant; die Reihenfolge der
   Übersicht hängt dann an der Rolle.

**Empfehlung.** Option 2. Die Liege gehört an den Hausbesuch — ANN-116
beschreibt sie als das, „was mitzunehmen ist“ —, und für das Büro ist der
Teamplan nach der eigenen Begründung im Code die Hauptsache. Beides mit der
ausstehenden Sichtung zu ANN-116 und ANN-117 bestätigen.

### BEF-125 — Verorten meldet zu jeder Adresse „kein Treffer“

|          |                                                                                                                                                       |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datum    | 2026-10-05                                                                                                                                            |
| Bereich  | Akte → Stammdaten „Adresse verorten“, Startort der Tour (Function `location-provider`, Aufgabe `geocode`)                                             |
| Quelle   | Jannes, Sichtung auf der Test-Umgebung mit einer echten, zufällig gewählten Anschrift                                                                  |
| Status   | erledigt in FIX-UBK-001 (2026-10-05)                                                                                                                  |
| Berührt  | `supabase/functions/location-provider/ptv.ts` (`GEOCODING_URL`, `geocodingAdresse`, `geocodingAuswerten`, `genauigkeit`); ADR-019 Punkt 37; ANN-095 |

**Beobachtung.** Trotz korrekt eingegebener Anschrift steht „Zu dieser Adresse hat der Kartendienst keinen Treffer gefunden. Bitte die Schreibweise prüfen.“

**Ursache.** Der Adapter fragte `geocoding-osm/v1/locations/by-address` mit `countryFilter` und las `locations`/`locationType` – Pfad und Felder der HERE-Variante, für die OSM-Variante nur abgeleitet und nie gegen die echte API geprüft. PTV antwortete mit 404, und 404 ist bei uns `not_found`.

**Behoben.** Nach PTVs Client `ptv-logistics/clients-geocoding-osm-api`: `places/by-address`, Land als `country`, Antwort `places` mit `referencePosition`, `formattedAddress`, `category` und `type`. Die Genauigkeit kommt aus dem OSM-Haupttag (`highway` straßengenau, Ort/Postleitzahl/Grenze ortsgenau) und, für die Hausnummer, aus der Anschrift des Treffers: hausnummergenau nur, wenn die angefragte Nummer dort wiederkehrt. Nie höher als belegt – sonst fragt die Anwendung nach (ADR-019 Punkt 37).

