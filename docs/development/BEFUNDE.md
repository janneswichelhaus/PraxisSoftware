# Befunde an der laufenden Anwendung

Stand: 2026-09-15

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
  beim Nichtantreffen (15 Minuten, Klingeln, Anruf — Umsetzung CAL-018):
  Sie gehört also auf die Karte, nicht dahinter.
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
trägt nur ein Entfernen, kein Lesen (Zweitreview). Zuerst rot, dann grün
belegt: gegen die laufende Storage-API in
`tests/e2e/authenticated/patient-file-access.spec.ts` (Signieren, Laden,
Auflisten und Kopieren ohne Ausstellung, zweites Signieren nach erlaubtem
Öffnen, Entfernen durch `owner` ohne Ausführung, Lesen mit Löschfreigabe) und in
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
