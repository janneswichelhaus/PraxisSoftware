# Abnahme: Patientenverwaltung und Termine

Manuelle Prüfschritte der Loops PAT-002, PAT-003, CAL-001 bis CAL-006 und
STAFF-001.

> Voraussetzung ist der eingerichtete lokale Stack — Schritte 1 bis 6 in
> [`../DEVELOPMENT.md`](../DEVELOPMENT.md), Abschnitt „Lokale Abnahme".
> Anmeldedaten stehen dort unter „Testkonten".

Die Nummerierung ist aus `DEVELOPMENT.md` übernommen und dort entfallen.

---

## PAT-002 — Stammdaten bearbeiten

1. Als `olivia.office@praxis.invalid` anmelden.
2. „Patient:innen" → „Erika Beispiel" öffnen.
3. „Stammdaten bearbeiten" klicken.
4. Feld „Ort" ändern, „Änderungen speichern".
5. Der neue Ort steht in der Akte unter „Adresse".
6. Seite neu laden (F5) — der Wert steht weiterhin dort.
7. Als `jannes.test@praxis.invalid` (owner) anmelden und
   „Praxis → Sicherheit → Audit" öffnen: dort steht ein Eintrag
   `patient.updated`, ohne Stammdatenwerte.

## PAT-003 — Versorgungsstatus

Den Status dürfen `owner`, `team_lead` und `office` wechseln, `therapist`
nicht: der Wechsel nimmt eine Person aus dem laufenden Betrieb und ist damit
ein Vorgang der Praxisführung, kein Behandlungsschritt (§4.1, §4.3, §4.5).
`inactive` ist eine rein organisatorische Markierung und **kein**
Behandlungsabschluss im Sinne von ADR-008.

1. Als `olivia.office@praxis.invalid` anmelden, „Max Mustermann" öffnen.
2. „Als inaktiv markieren" klicken — es erscheint eine Rückfrage.
3. Bestätigen. Status steht auf „Inaktiv".
4. Seite neu laden — der Status bleibt „Inaktiv".
5. In der Patientenliste greift der Filter „Inaktiv".
6. „Wieder als aktiv führen" stellt den Ausgangszustand her.
7. Gegenprobe: als `anna.beispiel@praxis.invalid` (nur `therapist`) dieselbe
   Akte öffnen — die Akte ist lesbar, die Statusaktion fehlt. Das ist
   ausdrücklich **kein** Sicherheitsnachweis; verbindlich ist
   `set_patient_status`, geprüft in `pnpm test:db` und im E2E-Test
   „Autorisierung auf RPC-Ebene".

## CAL-001 — Termin anlegen

Termine dürfen `owner`, `therapist`, `team_lead` und `office` anlegen. Als
behandelnde Person zuordenbar sind nur aktive Mitarbeitende mit therapeutischer
Rolle; `olivia.office@praxis.invalid` taucht in der Auswahl deshalb nicht auf.

1. Als `olivia.office@praxis.invalid` anmelden, „Max Mustermann" öffnen.
2. „Termin anlegen" klicken. Der Patient steht als Kontext und ist nicht
   wechselbar.
3. Behandelnde Person „Anna Beispiel", Terminart „Praxis", ein Datum in der
   Zukunft, Beginn 09:00, Ende 10:00. Der Standort ist vorausgewählt, weil es
   nur einen gibt.
4. „Termin anlegen" — die Detailansicht zeigt Datum und Zeit in der Zeitzone
   der Praxis.
5. Seite neu laden (F5): der Termin steht weiterhin da.
6. Gegenprobe Überschneidung: einen zweiten Termin für dieselbe Person am
   gleichen Tag von 09:30 bis 10:30 anlegen. Er wird mit einer verständlichen
   Meldung abgewiesen.
7. Gegenprobe angrenzend: derselbe Zeitraum ab 10:00 wird angenommen — das
   Intervall ist halboffen.
8. Terminart „Hausbesuch" wählen: die Adresse wird aus den Stammdaten
   übernommen und ist nicht überschreibbar.

## CAL-002 — Kalender

1. „Kalender" in der Navigation öffnen. Die Wochenansicht zeigt sieben Tage mit
   Stundenachse; zeitgleiche Termine verschiedener Personen stehen
   nebeneinander und sind farblich unterscheidbar.
2. Zwischen „Tag" und „Woche" wechseln, mit den Pfeilen blättern, „Heute"
   nutzen. Ansicht, Datum und Filter stehen in der Adresszeile.
3. Adresszeile kopieren, neues Tab, einfügen: derselbe Stand erscheint.
4. Die Adresszeile absichtlich verstellen, etwa `?ansicht=monat&datum=2027-02-30`
   — es erscheint keine Fehlerseite, sondern die Standardansicht.
5. Nach behandelnder Person und Standort filtern.
6. Fenster auf ~375 px verschmälern (F12 → Gerätesimulation): die Woche wird zur
   gestapelten Tagesagenda, ohne horizontales Scrollen.
7. Einen Termin anklicken — die Detailansicht öffnet sich.

## CAL-003 — Bearbeiten und Absagen

1. Einen geplanten Termin öffnen, „Bearbeiten" klicken. Das Formular ist
   vorbefüllt; der Patient ist nicht änderbar.
2. Beginn und Ende ändern, speichern. Die Detailansicht zeigt die neue Zeit,
   auch nach dem Neuladen.
3. Terminart von „Praxis" auf „Hausbesuch" wechseln: die Adresse wird
   übernommen. Zurück auf „Video": Ort und Adresse verschwinden.
4. Konfliktprobe: denselben Termin in zwei Browser-Tabs zum Bearbeiten öffnen,
   im ersten speichern, danach im zweiten. Der zweite Versuch wird mit einer
   verständlichen Meldung abgewiesen; der Termin behält die erste Änderung.
5. „Termin absagen" klicken — es erscheint eine Rückfrage, die den betroffenen
   Termin benennt. Ein einzelner Klick sagt nichts ab.
6. Bestätigen: der Status steht auf „Abgesagt", Bearbeiten und Absagen sind
   verschwunden. Der Termin ist nicht gelöscht.
7. Im Kalender ist er standardmäßig ausgeblendet und über den Statusfilter
   „Alle" wieder sichtbar.
8. Der abgesagte Zeitraum lässt sich neu belegen.
9. Als `jannes.test@praxis.invalid` (owner) „Praxis → Sicherheit → Audit"
   öffnen: dort stehen `appointment.created`, `appointment.rescheduled`
   beziehungsweise `appointment.updated` und `appointment.cancelled` — ohne
   Stammdaten und ohne konkrete Terminzeiten.

## CAL-004 — Abschließen und Wiederöffnen

1. Einen geplanten Termin öffnen. Neben „Termin absagen" steht jetzt
   „Termin abschließen".
2. „Termin abschließen" klicken — ohne Rückfrage, ohne Nachfrage nach einer
   Behandlungsdokumentation. Der Status steht auf „Abgeschlossen", darunter
   erscheint „Abgeschlossen am" mit Datum und Uhrzeit in der Praxiszeitzone.
   Nirgends steht, dass etwas fehle.
3. Bearbeiten, Absagen und Abschließen sind verschwunden; stattdessen steht
   dort „Termin wieder öffnen".
4. Neu laden (F5): der Abschluss bleibt.
5. Im Kalender steht der Termin weiterhin im Tag — ohne den Filter anzufassen —
   und trägt den Vermerk „Abgeschlossen".
6. Gegenprobe belegter Zeitraum: einen zweiten Termin für dieselbe Person zur
   selben Zeit anlegen. Er wird abgewiesen. Anders als eine Absage gibt ein
   Abschluss den Zeitraum **nicht** frei.
7. „Termin wieder öffnen" klicken: der Status steht wieder auf „Bestätigt",
   „Abgeschlossen am" ist verschwunden, Bearbeiten und Absagen sind zurück.
   Der Termin lässt sich jetzt wieder verschieben.
8. Einen abgesagten Termin öffnen: dort gibt es weder „Termin abschließen"
   noch „Termin wieder öffnen".
9. Als `jannes.test@praxis.invalid` (owner) „Praxis → Sicherheit → Audit"
   öffnen: dort stehen zusätzlich `appointment.completed` und
   `appointment.reopened`. Beide bleiben stehen — auch der Abschluss, der
   wieder geöffnet wurde.

## CAL-005 — Praxisraster und Arbeitszeiten

1. Als `jannes.test@praxis.invalid` (owner) „Planung" in der Navigation öffnen.
   Oben steht das Praxisraster mit den Werten 5, 10 und 15 Minuten.
2. Auf 15 Minuten stellen und speichern. Danach einen Termin anlegen: das Feld
   „Beginn" springt in 15-Minuten-Schritten, und unter dem Feld steht das
   aktuelle Raster.
3. Gegenprobe Server: im Formular über die Tastatur `09:07` eintragen und
   speichern. Der Vorgang wird mit einem Hinweis auf das Raster abgewiesen —
   die Schrittweite des Feldes ist Bedienkomfort, verbindlich ist der Server.
4. Zurück auf „Planung": ein bestehender Termin außerhalb des Rasters bleibt im
   Kalender sichtbar und lässt sich weiter bearbeiten, solange sein Beginn
   unverändert bleibt.
5. Als `olivia.office@praxis.invalid` (office) „Planung" öffnen: das
   Praxisraster fehlt, der Wochenplan ist pflegbar.
6. Als `anna.beispiel@praxis.invalid` (therapist) „Planung" öffnen: die Zeiten
   sind sichtbar, es gibt keine Schaltfläche zum Speichern.
7. Wieder als office: beim Wochenplan „Montag" wählen, einen zweiten Block
   `13:00`–`18:00` ergänzen, speichern. Die Liste darüber zeigt beide Blöcke.
8. Gegenprobe Überschneidung: einen Block `11:00`–`14:00` ergänzen und
   speichern. Der Vorgang wird abgewiesen.
9. „Blöcke leeren" und speichern: der Wochentag steht danach auf „—", also
   ausdrücklich „an diesem Wochentag keine Termine".
10. Abweichung: unten ein Datum wählen, „An diesem Tag keine Termine" ankreuzen,
    speichern. Der Tag erscheint in der Liste darüber.
11. Einen Termin an genau diesem Tag anlegen: es erscheint die Rückfrage
    „Außerhalb der Arbeitszeit", und es wird noch nichts gespeichert. Erst
    „Termin trotzdem anlegen" legt ihn an.
12. Gegenprobe fehlende Angabe: einen Termin an einem Samstag anlegen. Auch
    hier kommt die Rückfrage — eine fehlende Arbeitszeit gilt nicht als
    „passt schon".
13. Gegenprobe Grenzen der Bestätigung: denselben Zeitraum ein zweites Mal
    bestätigen. Der Überschneidungsschutz greift weiterhin.
14. Als owner „Praxis → Sicherheit → Audit" öffnen: dort steht
    `organization.appointment_grid_changed` mit altem und neuem Minutenwert.
    Ein Minutenraster ist eine organisatorische Einstellung, kein Gesundheits-
    oder Stammdatenwert.

## CAL-006 — Kalenderdarstellung und Verschieben

1. „Kalender" öffnen, auf „Tag" wechseln. Jede behandelnde Person hat eine
   eigene Spalte; der hellere Hintergrund einer Spalte ist ihre Arbeitszeit.
2. Fenster verschmälern (F12 → Gerätesimulation, ~375 px): das Gitter selbst
   scrollt waagerecht, die Seite nicht. Zeitachse links und Spaltenköpfe oben
   bleiben dabei stehen.
3. Auf „Woche" wechseln: sieben Tagesspalten für **genau eine** Person. Die
   Auswahl „Behandelnde Person" wechselt sie; ein „Alle" gibt es dort nicht.
4. Adresszeile kopieren, neues Tab, einfügen: derselbe Stand erscheint —
   Ansicht, Datum, Person und Filter stehen darin.
5. In der Tagesansicht einen geplanten Termin mit der Maus auf eine andere
   Uhrzeit ziehen. Während des Ziehens zeigt ein gestrichelter Rahmen das Ziel
   mit der einrastenden Uhrzeit; der Beginn springt im Praxisraster, die Dauer
   bleibt gleich.
6. Loslassen: kurz steht „Der Termin wird verschoben …", und erst danach wandert
   die Kachel. Vorher hat der Server nichts zugesagt.
7. Denselben Termin in die Spalte einer anderen Person ziehen. Die
   Detailansicht zeigt danach die neue Person bei unveränderter Zeit.
8. In der Wochenansicht einen Termin auf einen anderen Tag ziehen.
9. Gegenprobe Randzeit: einen Termin unter 18:00 ziehen. Es erscheint die
   Rückfrage „Außerhalb der Arbeitszeit" mit dem Ziel im Klartext, und es wird
   noch nichts geschrieben. Erst „Trotzdem verschieben" führt es aus.
10. Gegenprobe Überschneidung: einen Termin auf einen bereits belegten Zeitraum
    derselben Person ziehen. Es kommt eine Fehlermeldung, keine Rückfrage.
11. Gegenprobe Status: einen Termin abschließen und dann ziehen — er bewegt
    sich nicht. Dasselbe bei einem abgesagten Termin.
12. Escape während des Ziehens bricht ab, ohne etwas zu schreiben.
13. Ziehen ist nie der einzige Weg: unter dem Kalender steht der Hinweis auf
    „Bearbeiten", und die Detailansicht bietet es unverändert an. Wer nur mit
    der Tastatur arbeitet, nutzt diesen Weg.

## STAFF-001 — Mitarbeiterverwaltung

Mitarbeiterdatensätze **lesen** dürfen alle Praxisrollen; **anlegen, ändern und
den Beschäftigungsstatus wechseln** darf in diesem Stand nur `owner`. Der
Schnitt folgt §4.1 („Mitarbeiter", „Personalprozesse") und ist bis zu einer
ausdrücklichen Entscheidung bewusst eng gehalten (offener Punkt E10).

**Anlegen bedeutet ausdrücklich nicht: Benutzerkonto, Einladung oder Rolle.**
Person, Mitarbeiterdatensatz und Zugang bleiben getrennte Konzepte (ADR-014).

1. Als `jannes.test@praxis.invalid` (owner) anmelden, in der Navigation
   „Organisatorisches" → „Mitarbeitende" öffnen. Die Liste zeigt die vier Mitarbeitenden aus dem Seed.
2. „Mitarbeiter:in anlegen": Vor- und Nachname sind Pflicht, alles andere ist
   freiwillig. Anlegen.
3. Die Detailansicht erscheint. In der Liste steht die neue Person mit dem
   Vermerk **„nicht für Termine zuordenbar"** — sie hat noch keinen eigenen
   Zugang mit therapeutischer Rolle.
4. Gegenprobe: einen Termin anlegen und die Auswahl „Behandelnde Person"
   öffnen. Die neue Person steht dort **nicht** (offener Punkt E11).
5. „Stammdaten bearbeiten": Diensttelefon ändern, speichern. Der neue Wert
   steht in der Detailansicht, auch nach dem Neuladen (F5).
6. „Als inaktiv führen" klicken — es erscheint eine Rückfrage. Ein einzelner
   Klick ändert nichts. Bestätigen: „Beschäftigung" steht auf „Inaktiv".
7. „Wieder als aktiv führen" stellt den Ausgangszustand her.
8. **Rückfrage bei offenen Terminen:** einen Termin in der Zukunft für „Anna
   Beispiel" anlegen. Dann „Team → Anna Beispiel → Als inaktiv führen"
   bestätigen. Der Vorgang wird **abgewiesen**; stattdessen erscheint die
   Liste der betroffenen Termine mit Datum, Zeit und Patient:in.
9. „Abbrechen": nichts hat sich geändert, der Termin steht unverändert im
   Kalender. Es wurde nichts abgesagt und nichts umgebucht.
10. Denselben Weg erneut gehen und „Trotz offener Termine deaktivieren"
    klicken. Erst jetzt ist Anna inaktiv — und der Termin steht **weiterhin**
    auf „Bestätigt".
11. Gegenprobe Serverdurchsetzung: einen **neuen** Termin für Anna anlegen. Sie
    steht nicht mehr in der Auswahl. Einen bestehenden Termin auf sie
    umzuhängen, wird ebenfalls abgewiesen.
12. Der bestehende Termin bleibt beherrschbar: er lässt sich absagen oder einer
    aktiven Person zuordnen.
13. Anna wieder aktiv setzen.
14. Gegenprobe Rollen: als `olivia.office@praxis.invalid` (office)
    „Mitarbeitende" öffnen. Die Liste ist lesbar, „Mitarbeiter:in anlegen" und der
    Statuswechsel fehlen. Das ist ausdrücklich **kein** Sicherheitsnachweis;
    verbindlich sind `create_staff_member`, `update_staff_member` und
    `set_staff_employment_status`, geprüft in `pnpm test:db` und im E2E-Test
    „Durchsetzung am Server".
15. Gegenprobe Beschäftigtendatenschutz: als office die Detailansicht von „Anna
    Beispiel" öffnen — der Abschnitt „Privat" fehlt vollständig. Als owner
    erscheint er. Die Felder werden für office **gar nicht erst geliefert**,
    nicht nur ausgeblendet (§20, §4.7).
16. Als owner „Praxis → Sicherheit → Audit" öffnen: dort stehen
    `staff_member.created`, `staff_member.updated` und
    `staff_member.status_changed` — ohne Namen, ohne Kontaktdaten und ohne
    Privatangaben. Bei einer Änderung werden nur die **Namen** der geänderten
    Felder festgehalten.
