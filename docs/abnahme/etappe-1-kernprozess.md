# Abnahme: Behandlungsdokumentation

Manuelle Prüfschritte der Loops DOK-001 bis DOK-004 (Etappe 1, „Der
Kernprozess wird vollständig").

> Voraussetzung ist der eingerichtete lokale Stack — Schritte 1 bis 6 in
> [`../DEVELOPMENT.md`](../DEVELOPMENT.md), Abschnitt „Lokale Abnahme".
> Anmeldedaten stehen dort unter „Testkonten".

---

## DOK-001 — Behandlungsdokumentation als Entwurf

Dokumentieren dürfen die therapeutischen Rollen `therapist` und `team_lead`.
`owner` liest die Dokumentation (§4.1), schreibt sie aber ohne therapeutische
Rolle nicht. `office` hat weder Lese- noch Schreibzugriff (§4.3), ein
Patientenkonto ebenso wenig (§4.6).

1. Als `anna.beispiel@praxis.invalid` (therapist) anmelden und einen Termin für
   „Max Mustermann" anlegen — oder einen bestehenden öffnen.
2. Unten in der Detailansicht steht „Behandlungsdokumentation" mit dem Hinweis,
   dass noch keine hinterlegt ist. „Dokumentation anlegen" klicken.
3. Einen Text mit mehreren Absätzen eingeben und „Als Entwurf speichern".
   Die Detailansicht zeigt ihn mit dem Vermerk „Entwurf · noch nicht
   finalisiert", der verfassenden Person und dem Änderungszeitpunkt.
4. Neu laden (F5): der Entwurf steht weiterhin da, Absätze bleiben erhalten.
5. „Dokumentation bearbeiten": das Feld ist vorbefüllt. Ohne Änderung ist
   „Als Entwurf speichern" nicht anklickbar.
6. Text ändern, „Abbrechen" klicken — es erscheint eine Rückfrage, und der Text
   bleibt stehen. „Weiter bearbeiten" führt zurück ins Feld, „Ja, Bearbeitung
   verwerfen" zurück zum Termin ohne zu speichern.
7. Konfliktprobe: dieselbe Dokumentation in zwei Browser-Tabs zum Bearbeiten
   öffnen, im ersten speichern, danach im zweiten. Der zweite Versuch wird
   abgewiesen — **und der eigene Text bleibt im Feld stehen**, damit nichts
   verloren geht.
8. Gegenprobe Absage: einen anderen, abgesagten Termin öffnen. Dort steht
   „Zu einem abgesagten Termin entsteht keine Behandlungsdokumentation", und es
   gibt keine Schaltfläche.
9. Gegenprobe Office: als `olivia.office@praxis.invalid` denselben Termin
   öffnen. Der Termin ist sichtbar, der Abschnitt „Behandlungsdokumentation"
   fehlt vollständig. Das ist ausdrücklich **kein** Sicherheitsnachweis;
   verbindlich sind `get_treatment_note` und `create_treatment_note`, geprüft
   in `pnpm test:db` und im E2E-Test „Serverseitige Grenzen".
10. Gegenprobe Praxisleitung: als `jannes.test@praxis.invalid` (owner **und**
    therapist) ist beides sichtbar. Ein reiner owner-Zugang dürfte nur lesen —
    im Seed gibt es ihn nicht, geprüft wird der Fall in `pnpm test:db`.
11. Als owner „Praxis → Sicherheit → Audit" öffnen: dort stehen
    `treatment_note.created`, `treatment_note.updated` und
    `treatment_note.viewed` — ohne jeden Behandlungsinhalt. Der Lesevermerk
    entsteht bei jedem Öffnen einer vorhandenen Dokumentation.

## DOK-002 — Finalisieren, korrigieren, nachtragen

Voraussetzung: ein Termin mit einem Dokumentationsentwurf aus DOK-001.
Finalisieren, korrigieren und nachtragen dürfen dieselben Rollen wie das
Dokumentieren (`therapist`, `team_lead`). Den Änderungsverlauf darf zusätzlich
`owner` lesen, ohne selbst schreiben zu dürfen (§4.1 gegenüber §4.2).

1. Als `anna.beispiel@praxis.invalid` den Termin öffnen. Beim Entwurf steht nun
   neben „Dokumentation bearbeiten" die Schaltfläche „Finalisieren".
2. „Finalisieren" klicken: es erscheint zuerst eine Rückfrage mit dem Hinweis,
   dass der Eintrag danach Bestandteil der Akte ist. Ein einzelner Klick
   finalisiert also nichts.
3. „Ja, jetzt finalisieren" bestätigen. Der Vermerk wechselt auf „Finalisiert"
   mit Zeitpunkt und finalisierender Person. „Dokumentation bearbeiten" und
   „Finalisieren" sind verschwunden; stattdessen stehen dort „Korrigieren",
   „Änderungsverlauf" und „Nachtrag hinzufügen".
4. „Änderungsverlauf" öffnen: Version 1 trägt den Entwurfstext mit dem Vermerk
   „Bei der Finalisierung festgeschriebener Stand".
5. Zurück zum Termin, „Korrigieren". Ohne Textänderung ist „Korrektur
   speichern" nicht anklickbar. Text ändern und ohne Begründung speichern: die
   Seite verlangt eine Begründung, **ohne** den Server zu fragen.
6. Begründung eintragen und speichern. Der Termin zeigt den korrigierten Text
   und den Hinweis „2 Versionen". Im Änderungsverlauf stehen jetzt beide
   Fassungen — **der ursprüngliche Wortlaut ist unverändert vorhanden**, mit
   Begründung, Zeitpunkt und Urheber der Korrektur (§630f Abs. 1 S. 2 BGB).
7. „Nachtrag hinzufügen": die Seite zeigt oben den ursprünglichen Eintrag und
   darunter ein leeres Feld. Text eingeben und speichern. Am Termin steht der
   Nachtrag als eigener Block mit den Vermerken „Nachtrag" und „Entwurf" — der
   Ursprungseintrag bleibt unverändert.
8. Den Nachtrag ebenfalls finalisieren. Er bekommt einen eigenen
   Änderungsverlauf; ein „Nachtrag hinzufügen" gibt es an ihm nicht.
9. Konfliktprobe: denselben finalisierten Eintrag in zwei Tabs zur Korrektur
   öffnen, im ersten speichern, danach im zweiten. Der zweite Versuch wird
   abgewiesen, und der eigene Text bleibt im Feld stehen.
10. Gegenprobe Praxisleitung: als `jannes.test@praxis.invalid` ist der
    Änderungsverlauf lesbar. Ein reiner owner-Zugang dürfte korrigieren und
    nachtragen nicht — im Seed gibt es ihn nicht, geprüft wird der Fall in
    `pnpm test:db`.
11. Gegenprobe Office: als `olivia.office@praxis.invalid` fehlt der Abschnitt
    unverändert vollständig. Der direkte Aufruf einer Verlaufs-URL landet auf
    der Übersicht. Das ist ausdrücklich **kein** Sicherheitsnachweis;
    verbindlich sind die Serverfunktionen, geprüft in `pnpm test:db`.
12. Als owner „Praxis → Sicherheit → Audit" öffnen: dort stehen zusätzlich
    `treatment_note.finalized`, `treatment_note.revised`,
    `treatment_note.addendum_created` und `treatment_note.history_viewed` —
    ohne Behandlungsinhalt und **ohne die Korrekturbegründung**.

## DOK-003 — Dokumentation in der Akte, rollenabhängig projiziert

Voraussetzung: mindestens ein Termin von „Max Mustermann" mit finalisierter
Dokumentation (DOK-002) und einer mit Entwurf (DOK-001). Die Akte zeigt die
Termine, die bereits begonnen haben, sowie jeden dokumentierten Termin —
neueste zuerst. **Zukünftige Termine ohne Dokumentation stehen nur im
Kalender.** Die Verwaltung (`office`) sieht den Behandlungsnachweis nach §4.4,
die klinischen Rollen (`owner`, `therapist`, `team_lead`) die Dokumentation mit
Inhalt.

### Behandlungsnachweis (office)

1. Als `olivia.office@praxis.invalid` „Patienten" → „Max Mustermann" öffnen.
   Unter „Versorgung" steht der Abschnitt **„Behandlungsnachweis"** mit dem
   Hinweis, dass er keine Behandlungsinhalte enthält.
2. Je Termin stehen Datum, Zeitraum, Terminart, behandelnde Person und der
   Terminstatus („Bestätigt", „Abgeschlossen" oder „Abgesagt") — und darunter
   genau einer dieser Sätze: „Dokumentation finalisiert am … Uhr.",
   „Dokumentation als Entwurf vorhanden, noch nicht finalisiert." oder
   „Keine Dokumentation.". **Nirgends steht Behandlungstext, kein Verfasser,
   keine Versionszahl.**
3. „Zum Termin" führt in die Detailansicht des Termins — dort fehlt der
   Abschnitt „Behandlungsdokumentation" für office weiterhin vollständig.
4. Gegenprobe Zukunft: als office einen Termin für Max in zwei Wochen anlegen
   und zurück in die Akte gehen. Der Termin fehlt im Behandlungsnachweis, steht
   aber im Kalender. Sobald eine Therapeutin ihn dokumentiert, erscheint er.
5. Gegenprobe Absage: einen vergangenen oder dokumentierten Termin absagen.
   Er bleibt im Nachweis mit Status „Abgesagt" stehen.
6. Blättern: hat Max mehr als 20 Termine in der Akte, steht unter der Liste
   „Ältere Termine anzeigen". Ein Klick hängt die nächsten an; bei der letzten
   Seite verschwindet die Schaltfläche. Ohne so viele Termine gibt es sie nicht.
7. Als owner „Praxis → Sicherheit → Audit" öffnen: das Öffnen der Akte steht
   als `patient_record.viewed`. Für den Nachweis selbst gibt es **keinen**
   eigenen Eintrag — er enthält keinen klinischen Inhalt (ANN-006). Das ist
   ausdrücklich **kein** Sicherheitsnachweis; verbindlich ist
   `list_patient_treatment_evidence`, geprüft in `pnpm test:db`.

### Behandlungsdokumentation (owner, therapist, team_lead)

1. Als `anna.beispiel@praxis.invalid` dieselbe Akte öffnen. Statt des
   Nachweises steht dort der Abschnitt **„Behandlungsdokumentation"** — mit
   denselben Terminzeilen, aber darunter der vollständige Eintrag: Vermerk
   („Entwurf" oder „Finalisiert"), Wortlaut, Herkunftszeile („Verfasst von …",
   „Finalisiert am …") und bei finalisierten Einträgen der Link
   „Änderungsverlauf". Nachträge stehen als eigener Block mit dem Vermerk
   „Nachtrag" unter dem Haupteintrag.
2. In der Akte gibt es **keine** Schaltflächen zum Bearbeiten, Finalisieren,
   Korrigieren oder Nachtragen — das geschieht am Termin. „Zum Termin" führt
   dorthin, „Änderungsverlauf" auf die bekannte Verlaufsseite.
3. Ein Termin ohne Dokumentation steht mit „Keine Dokumentation." in der
   Liste; ein abgesagter Termin mit dem Status „Abgesagt".
4. Gegenprobe Praxisleitung: als `jannes.test@praxis.invalid` ist die
   Dokumentation ebenfalls lesbar. Ein reiner owner-Zugang dürfte sie lesen,
   ohne zu schreiben — im Seed gibt es ihn nicht, geprüft wird der Fall in
   `pnpm test:db`.
5. Als owner „Praxis → Sicherheit → Audit" öffnen: für jeden in der Akte
   gelesenen Eintrag — auch jeden Nachtrag — steht ein `treatment_note.viewed`,
   ohne Behandlungsinhalt. Für einen Termin ohne Dokumentation entsteht keiner.
   Das Öffnen der Akte selbst steht daneben als `patient_record.viewed`.
6. Gegenprobe Office: als `olivia.office@praxis.invalid` bleibt der Abschnitt
   „Behandlungsdokumentation" verschwunden; es gibt nur den Nachweis. Das ist
   ausdrücklich **kein** Sicherheitsnachweis; verbindlich ist
   `list_patient_treatment_notes`, geprüft in `pnpm test:db` und im E2E-Test
   „DOK-003: Serverseitige Grenzen".

## DOK-004 — Automatische Finalisierung nach Frist

Ein Entwurf wird nach Ablauf der Frist ohne Zutun finalisiert (ADR-016
Punkt 7). Voreinstellung: Ende des auf die Behandlung folgenden Kalendertages;
ein später angelegter Eintrag oder Nachtrag bekommt dieselbe Frist ab seiner
Anlage. Den Lauf stößt `pg_cron` alle 15 Minuten an. Im lokalen Stack ist die
Erweiterung vorhanden; ob der Job registriert ist, zeigt im SQL-Editor von
Supabase Studio (`http://127.0.0.1:54323`) die Abfrage
`select jobname, schedule from cron.job;`.

### Frist einstellen

1. Als `jannes.test@praxis.invalid` (owner) „Planung" öffnen. Unter dem
   Praxisraster steht **„Automatische Finalisierung"** mit der Auswahl „Frist",
   vorbelegt mit „Ende des Folgetages".
2. „Ende des Behandlungstages" wählen und „Frist speichern". Es erscheint
   „Die Frist ist gespeichert."; nach dem Neuladen steht der Wert weiterhin da.
3. Als `olivia.office@praxis.invalid` und als `anna.beispiel@praxis.invalid`
   „Planung" öffnen: der Abschnitt fehlt. Das ist ausdrücklich **kein**
   Sicherheitsnachweis; verbindlich ist `set_documentation_deadline`, geprüft in
   `pnpm test:db`.
4. Als owner unter „Praxis → Sicherheit → Audit" steht
   `organization.documentation_deadline_changed`.

### Automatische Finalisierung beobachten

Die Frist endet um Mitternacht — für die Abnahme wird ein Entwurf deshalb als
Testvorbereitung zurückdatiert, statt einen Tag zu warten.

5. Als `anna.beispiel@praxis.invalid` einen Termin für „Max Mustermann"
   anlegen und einen Entwurf dokumentieren (DOK-001). Die Termin-ID steht in
   der Adresszeile (`/termine/<id>`).
6. Im SQL-Editor von Supabase Studio Termin und Entwurf drei Tage
   zurückdatieren:

   ```sql
   update public.appointments
      set starts_at = starts_at - interval '3 days',
          ends_at   = ends_at   - interval '3 days'
    where id = '<id>';
   update public.treatment_notes
      set created_at = created_at - interval '3 days'
    where appointment_id = '<id>';
   ```

7. Entweder bis zu 15 Minuten warten, oder den Lauf im SQL-Editor selbst
   anstoßen: `select public.finalize_overdue_treatment_notes();` liefert `1`.
8. Den Termin in der Anwendung neu laden: der Eintrag trägt den Vermerk
   „Finalisiert" und die Zeile „Automatisch finalisiert am … nach Ablauf der
   Frist." — **ohne** eine finalisierende Person. „Korrigieren",
   „Änderungsverlauf" und „Nachtrag hinzufügen" stehen wie nach einer
   Finalisierung von Hand zur Verfügung; im Änderungsverlauf trägt Version 1
   den Entwurfstext mit der zuletzt schreibenden Person.
9. Dieselbe Zeile steht in der Akte („Patienten" → „Max Mustermann"); der
   Behandlungsnachweis für office zeigt „Dokumentation finalisiert am …".
10. Als owner „Praxis → Sicherheit → Audit" öffnen: der Eintrag
    `Behandlungsdokumentation automatisch finalisiert` nennt als Benutzer
    **„System"**. Der Filter „Benutzer" blendet ihn aus, weil er keinem Konto
    gehört.
11. Gegenprobe Frist: einen weiteren Entwurf anlegen und nur den **Termin**
    zurückdatieren, nicht den Entwurf. Der Lauf liefert `0` — der spät
    angelegte Entwurf hat seine eigene Frist ab heute.

---

## PAT-005 — Erweiterte Stammdaten und Zugangshinweis

Neu sind die Erreichbarkeit (Mobil, geschäftlich, Telefax, Einrichtung) und ein
Abschnitt „Versorgung" mit Zugangshinweis, Besonderheit, Bemerkung und fester
Therapeut:in. Die Angaben aus „Versorgung" sind **interne Angaben der Praxis**
und für ein Patientenkonto nicht sichtbar (ANN-010).

1. Als `anna.beispiel@praxis.invalid` (therapist) „Patienten" → „Max
   Mustermann" öffnen. Unter „Kontakt" steht die Mobilnummer zuoberst und ist
   ein **Anruflink**: ein Tipp darauf öffnet am Handy den Wählvorgang.
2. Darunter steht „Hausbesuch und Versorgung" mit dem Zugangshinweis
   („2. OG links …"), der Besonderheit („Hund im Flur …"), der festen
   Therapeut:in „Anna Beispiel" und der Bemerkung.
3. „Stammdaten bearbeiten": der Abschnitt „Versorgung" trägt den Hinweis, dass
   Befunde und Behandlungsverlauf in die Dokumentation gehören. Zugangshinweis
   in mehreren Zeilen ändern und speichern — die Akte zeigt die Zeilenumbrüche.
4. „Feste Therapeut:in" auf „Keine feste Zuordnung" stellen und speichern: die
   Zeile verschwindet aus der Akte. Danach wieder zuordnen.
5. Neuanlage: „Patienten" → „Neue:r Patient:in". Nur Pflichtfelder ausfüllen und
   anlegen — die Akte zeigt keinen Abschnitt „Hausbesuch und Versorgung", weil
   nichts erfasst wurde. Kein leerer Abschnitt, keine „null"-Werte.
6. **Gegenprobe Office** (`olivia.office@praxis.invalid`): dieselbe Akte zeigt
   Zugangshinweis und Besonderheit ebenfalls — Office organisiert die Termine
   und ruft an (§4.3). Bearbeiten ist möglich.
7. **Gegenprobe Patientenkonto** (`max.mustermann@patient.invalid`): die eigene
   Akte zeigt Mobilnummer und Adresse, aber **keinen** Abschnitt „Hausbesuch
   und Versorgung". Das ist ausdrücklich **kein** Sicherheitsnachweis;
   verbindlich ist die Policy `patient_care_details_select_directory_only`,
   geprüft in `pnpm test:db` („PAT-005: erweiterte Stammdaten …").
8. **Am Handy** (Browserfenster auf ~375 px): die Akte scrollt nicht seitwärts,
   der Zugangshinweis bricht um, der Anruflink ist mit dem Daumen erreichbar.
   Zielwert: Zugangshinweis ohne Scrollen sichtbar, sobald die Akte offen ist.

---

## VER-001 — Verordner:innen

1. Als `anna.beispiel@praxis.invalid` (therapist) „Patient:innen" öffnen. Der
   Bereich hat jetzt zwei Unterpunkte: „Patient:innen" und „Verordner:innen".
2. „Verordner:innen": zwei synthetische Einträge, Dr. med. Petra Probst und
   Hendrik Hausarzt, mit Praxis, Fachrichtung und Ort.
3. Suchfeld „testdorf" eintippen — nur die Hausarztpraxis bleibt stehen.
4. „Verordner:in anlegen": nur den Nachnamen ausfüllen und speichern. Das
   genügt; der Eintrag steht in der Liste.
5. **Doppelprobe:** noch einmal anlegen, mit demselben Nachnamen und derselben
   (leeren) Praxis. Es erscheint „Diese Verordner:in ist bereits erfasst." mit
   dem Hinweis, den vorhandenen Eintrag zu verwenden — kein technischer Fehler.
   Dann eine Praxis ergänzen: jetzt lässt sich der Eintrag anlegen.
6. Eine bestehende Verordner:in öffnen, das Telefax ergänzen, speichern — die
   Liste zeigt die Änderung.
7. **Gegenprobe Office** (`olivia.office@praxis.invalid`): Kartei lesen und
   pflegen ist erlaubt — sie fordert die Folgeverordnungen an.
8. **Gegenprobe Patientenkonto** (`max.mustermann@patient.invalid`): der
   Bereich „Patient:innen" fehlt vollständig, `/verordner` von Hand aufgerufen
   führt zurück auf die Startseite. Verbindlich ist die Policy
   `prescribers_select_staff_only`, geprüft in `pnpm test:db`.

---

## VER-002 — Verordnungen in der Akte, nach Jahr

1. Als `anna.beispiel@praxis.invalid` (therapist) „Max Mustermann" öffnen.
   Unter den Stammdaten und **vor** der Behandlungsdokumentation steht der
   Abschnitt „Verordnungen", gruppiert nach Jahr: 2026 mit zwei Einträgen.
2. Die Folgeverordnung vom 18.06.2026 zeigt „Krankengymnastik · 7 von 10
   genutzt · noch 3" und darunter „noch 3 von 10".
3. Die Erstverordnung vom 05.02.2026 zeigt zwei Positionen, „noch 0 von 20"
   und die Kennzeichnung **„Kontingent ausgeschöpft"**. Das ist eine
   Zustandsangabe zur Menge, ausdrücklich keine Empfehlung (ANN-014).
4. Als therapeutische Rolle stehen zusätzlich „Diagnose", „Therapieziel",
   „Hinweis der Verordner:in" und „Empfehlung der Therapeut:in zum
   Verordnungsende" da — letztere mit genau dieser Beschriftung.
5. „Erika Beispiel" öffnen: die Verordnung von 2025 steht unter der
   Jahresüberschrift **2025**.
6. **Gegenprobe Office** (`olivia.office@praxis.invalid`): dieselbe Akte zeigt
   den Abschnitt „Verordnungen" mit Verordner:in, Art, Datum, Frequenz und
   Kontingent — **ohne** Diagnose, Therapieziel, Hinweis und Empfehlung. Es
   gibt auch keine leeren Felder dafür: die Serverfunktion liefert sie nicht.
   Auch „Verordnung erfassen" fehlt. Das ist **kein** Sicherheitsnachweis;
   verbindlich sind `list_patient_prescriptions` und
   `list_patient_prescriptions_clinical`, geprüft in `pnpm test:db`.
7. **Auditprobe:** als `jannes.test@praxis.invalid` (owner) „Praxis →
   Sicherheit → Audit" öffnen. Je Verordnung, die eine therapeutische Rolle
   gelesen hat, steht ein Eintrag „Verordnung gelesen". Nach dem Besuch von
   Office in Schritt 6 entsteht **kein** solcher Eintrag.
8. **Am Handy** (~375 px): die Verordnungskarten brechen um, es wird nicht
   seitwärts gescrollt, und „noch 3 von 10" steht ohne Zoom lesbar da.

---

## VER-003 — Verordnung erfassen, ändern und löschen

Erfassen dürfen die therapeutischen Rollen `owner`, `therapist` und
`team_lead` — wer eine Verordnung abtippt, tippt die Diagnose mit (ANN-011).
`office` liest die organisatorische Sicht und hat keine Schaltfläche.

1. Als `anna.beispiel@praxis.invalid` (therapist) „Erika Beispiel" öffnen und
   im Abschnitt „Verordnungen" auf „Verordnung erfassen" klicken.
2. Ohne Eingaben speichern: es erscheinen drei Feldfehler („Verordner:in ist
   erforderlich.", „Ausstellungsdatum ist erforderlich.", „Heilmittel ist
   erforderlich.") — kein Schreibvorgang.
3. Verordner:in „Dr. med. Petra Probst" wählen, Art „Erstverordnung",
   Ausstellungsdatum **heute**, Frequenz „2x pro Woche".
4. Position 1: Heilmittel „Krankengymnastik", Verordnet 6, Genutzt 0.
   „Position hinzufügen" → Position 2: „Manuelle Therapie", Verordnet 6.
   „Position 2 entfernen" nimmt sie wieder weg; bei nur einer Position gibt es
   keinen Entfernen-Knopf.
5. **Mengenprobe:** Genutzt auf 7 setzen (mehr als verordnet). Speichern zeigt
   „Genutzt kann nicht größer sein als verordnet." — kein Schreibvorgang.
   Zurück auf 0 setzen.
6. **Datumsprobe:** Ausstellungsdatum auf ein Datum in der Zukunft setzen.
   Speichern zeigt „Das Ausstellungsdatum darf nicht in der Zukunft liegen."
   Zurück auf heute setzen.
7. Diagnose und „Empfehlung der Therapeut:in zum Verordnungsende" ausfüllen und
   speichern: die Akte zeigt die neue Verordnung im laufenden Jahr, ganz oben.
8. **Fehlende Praxis:** noch einmal „Verordnung erfassen", einige Felder und
   Positionen ausfüllen (z. B. Frequenz und Heilmittel), dann im Hinweis unter
   „Verordner:in" auf „Verordner:in anlegen" klicken. Nach dem Speichern landet
   man **wieder im Verordnungsformular** — die zuvor eingegebenen Felder und
   Positionen sind **erhalten**, und die neu angelegte Verordner:in ist bereits
   ausgewählt. Bricht man die Verordner-Anlage stattdessen mit „Abbrechen" ab,
   bleiben die Eingaben ebenso erhalten.
9. **Ändern:** bei einer Verordnung auf „Bearbeiten". „Genutzt" von 0 auf 3
   setzen und speichern: die Akte zeigt „noch 3 von 6". Erneut öffnen und eine
   Position hinzufügen — die vorhandene Position behält ihre Zahlen.
10. **Löschen:** dieselbe Verordnung öffnen, unten „Verordnung löschen". Es
    erscheint eine Rückfrage mit dem Hinweis, dass der Vorgang endgültig ist
    und für eine falsch zugeordnete Verordnung gedacht ist. „Nicht löschen"
    bricht ab, „Ja, Verordnung löschen" entfernt sie; die Akte zeigt sie nicht
    mehr.
11. **Auditprobe:** als `jannes.test@praxis.invalid` (owner) „Praxis →
    Sicherheit → Audit": „Verordnung erfasst", „Verordnung geändert" und
    „Verordnung gelöscht" stehen dort, jeweils ohne Diagnosetext.
12. **Gegenprobe Office** (`olivia.office@praxis.invalid`): in der Akte gibt es
    weder „Verordnung erfassen" noch „Bearbeiten". Das ist **kein**
    Sicherheitsnachweis; verbindlich ist `app.can_write_prescriptions()`,
    geprüft in `pnpm test:db`.
13. **Am Handy** (~375 px): Positionen stehen als eigene Blöcke untereinander,
    „Verordnet" und „Genutzt" nebeneinander, alle Tippziele mindestens 44 px.

---

## UI-000 — Fundament: Tokens, Bausteine, Druck, Verbindung

Dieser Loop hat kein eigenes Feature, sondern ändert Aussehen und Verhalten
überall ein Stück. Die Prüfschritte suchen deshalb nach **Regressionen** —
etwas, das vorher ging und jetzt nicht mehr.

1. **Kontrast.** Als `anna.beispiel@praxis.invalid` eine beliebige Akte öffnen.
   Die Rahmen der Eingabefelder sind deutlich dunkler als vorher; der Kleintext
   („Zugriffe auf Patientenakten werden protokolliert.") ist gut lesbar. Wirkt
   die Oberfläche dadurch zu schwer, ist das ein Befund — sag Bescheid, die
   Werte stehen an einer Stelle in `src/index.css`.
2. **Rückfragen.** In der Akte „Als inaktiv markieren" anklicken: es erscheint
   der Kasten. Ohne die Maus zu bewegen **Enter** drücken — der Fokus steht
   schon auf der bestätigenden Schaltfläche. Erneut öffnen und „Abbrechen":
   der Fokus springt zurück auf „Als inaktiv markieren". Dasselbe unter
   „Praxis → Mitarbeitende" bei einer Person, am Termin bei „Termin absagen"
   und in einer Verordnung bei „Verordnung löschen".
3. **Mitarbeiter mit offenen Terminen.** Eine Person deaktivieren, für die
   noch Termine geplant sind: der Kasten bleibt offen, listet die Termine und
   die Schaltfläche heißt jetzt „Trotz offener Termine deaktivieren". Ein
   zweiter Klick führt sie aus. „Abbrechen" und erneut öffnen: der Hinweis ist
   weg, die Rückfrage beginnt von vorn.
4. **Meldungen.** Netzwerk in den Entwicklerwerkzeugen abschalten und in der
   Akte den Status wechseln: die Fehlermeldung erscheint im Kasten. Sie wird
   jetzt auch von Vorlesesoftware angesagt (`role="alert"`); mit VoiceOver
   oder NVDA hörbar, sonst nicht direkt prüfbar.
5. **Verbindungsanzeige.** Netzwerk abschalten (Entwicklerwerkzeuge →
   „Offline"): über der Kopfleiste erscheint ein gelber Streifen „Keine
   Verbindung. Änderungen lassen sich gerade nicht speichern …". Netzwerk
   wieder anschalten: der Streifen verschwindet. **Achtung** (ANN-015): läuft
   das Netz, aber der Supabase-Stack nicht, bleibt der Streifen aus — die
   Anzeige kennt nur das Gerät, nicht den Server.
6. **Drucken.** Eine Akte öffnen und Strg+P (bzw. Cmd+P). In der Vorschau:
   keine Navigation, keine Kopfleiste, keine Schaltflächen, weißer Hintergrund,
   und kein Datensatz, der über den Seitenumbruch zerrissen wird.
7. **Bildschirmfotos.** In einem zweiten Terminal, mit laufendem
   Supabase-Stack (`pnpm db:start` reicht für `pnpm test:db`, für die
   Anmeldung hier aber der volle Stack aus `docs/DEVELOPMENT.md`):

   ```bash
   pnpm screenshots --konto=therapist /patienten/66666666-6666-4666-8666-000000000001 /kalender
   pnpm screenshots --konto=owner /praxis/team
   ```

   Die Bilder liegen in `.tmp/screenshots/`. Das Werkzeug meldet sich mit
   `--konto` (`owner`, `office` oder `therapist`) selbst über die echte
   Anmeldemaske am synthetischen Stack an und meldet waagerechtes Scrollen,
   Konsolenfehler **und** eine fehlgeschlagene Anmeldung; „Ohne Befund" ist
   das erwartete Ergebnis. Ohne `--konto` zeigt jede Seite hinter der
   Anmeldung nur die Anmeldemaske — das ist dann kein Befund, sondern das
   erwartete Ergebnis für einen nicht angemeldeten Aufruf; für Seiten hinter
   der Anmeldung deshalb immer `--konto` angeben.

8. **Am Handy** (~375 px): Akte, Kalender, Stammdatenformular und
   Verordnungsformular einmal durchscrollen. Nichts scrollt seitwärts, alle
   Tippziele bleiben mindestens 44 px.

---

## Vor dem Start: UX-001 bis UX-011

Die elf Abschnitte gehören zu einem Epic und prüfen sich am besten in einem
Zug — sie bauen aufeinander auf, und mehrere brauchen denselben frisch
aufgesetzten Tag. Die allgemeine Einrichtung steht in
[`../DEVELOPMENT.md`](../DEVELOPMENT.md), „Lokale Abnahme"; hier nur, was für
diesen Durchgang dazukommt.

**Der Tagesplan liegt auf dem Tag des Zurücksetzens.** Der Seed legt die
Hausbesuche relativ zu `current_date` an, nicht auf ein festes Datum. Setzt du
heute zurück und prüfst morgen weiter, liegen dieselben Termine in der
Vergangenheit und „Mein Tag" ist leer — das ist dann kein Befund. Vor dem
Durchgang deshalb einmal:

```bash
pnpm dlx supabase@2.116.0 db reset
pnpm dev
```

**Zwei Konten reichen für zehn der elf Abschnitte.**

| Konto                          | Rolle                 | Wofür in diesem Epic                                   |
| ------------------------------ | --------------------- | ------------------------------------------------------ |
| `anna.beispiel@praxis.invalid` | `therapist`           | der Hausbesuchstag selbst — die meisten Abschnitte     |
| `olivia.office@praxis.invalid` | `office`              | die Gegenproben: was eine Rolle ohne Behandlung sieht  |
| `jannes.test@praxis.invalid`   | `owner` + `therapist` | Textbausteine praxisweit, Rollen- und Auditgegenproben |

Das Kennwort steht in `DEVELOPMENT.md` unter „Testkonten".

**Was sich seit dem Bau geändert hat.** Die Anwendung trägt inzwischen die
Marke (MARKE-001) und die Kontoverwaltung aus STAFF-EPIC-002. Beides ist hier
nicht Gegenstand der Prüfung; es erklärt nur, warum Kopfzeile und Anmeldemaske
anders aussehen als in den Beschreibungen unten.

**Wohin das Ergebnis.** In die Spalte „Abnahme" der Fortschrittstabelle in
[`../development/ROADMAP.md`](../development/ROADMAP.md). Befunde gehören
nicht hierher, sondern als eigene Zeile in die Roadmap oder — wenn es eine
Ablauffrage ist — in die nächste Ablaufrunde.

---

## UX-001 — Tagesliste des Hausbesuchstags

**Was geprüft wird:** dass „Mein Tag" alles trägt, was an der Wohnungstür
gebraucht wird, und dass „offen" und „erledigt" auseinandergehen.

**Vorbereitung:** `pnpm dlx supabase db reset` — der Seed legt für **heute**
einen Hausbesuchstag von **Anna Beispiel** an (drei Hausbesuche und einen
Praxistermin bei Jannes). Anmelden als `anna.beispiel@praxis.invalid`.

1. **Offen heute.** Startseite (`/`). Ganz oben steht „Offen heute (2)": der
   ausstehende Hausbesuch um 09:00 und der um 10:30 abgeschlossene, der noch
   keine Dokumentation hat. Der zweite trägt den Grund als Text:
   „Dokumentation fehlt".
2. **Anschrift und Zugang.** Die Karte um 09:00 zeigt „Beispielstrasse 12",
   „72070 Tuebingen", darunter „Zugang: 2. OG links, Klingel …" und
   „Besonderheit: Hund im Flur …".
3. **Anrufen ist ein Tap.** Auf der Karte stehen zwei Schaltflächen „Mobil …"
   und „Telefon …". Am Handy öffnet ein Tipp darauf die Telefon-App mit der
   vorgewählten Nummer; am Rechner fragt der Browser, womit `tel:` geöffnet
   werden soll. Beides ist richtig — die Nummer darf nicht bloß dastehen.
4. **Erledigtes drängt sich nicht auf.** Unter der Liste steht der Aufklapper
   „Erledigt heute (1)". Aufklappen: der abgesagte Termin um 14:00 steht darin
   mit dem Abzeichen „Abgesagt".
5. **Zweckbindung.** Als `jannes.test@praxis.invalid` anmelden. Sein Tag
   enthält nur den Praxistermin um 16:00 — **ohne** Anschrift und **ohne**
   Zugangshinweis. Beides gibt es nur zum Hausbesuch, und zwar schon
   serverseitig: es wird gar nicht erst geliefert.
6. **Der Teamplan bleibt schlank.** Weiter unten steht „Tagesplan des Teams"
   mit allen Terminen des Tages — dort steht weiterhin **keine** Anschrift.
   Das ist Absicht (ADR-004).
7. **Die Vorschau ist zugeklappt.** Ganz unten steht „Vorschau · Betrieb, Wege
   und Team – noch nicht angebunden" als geschlossener Aufklapper. Der echte
   Teil des Tages steht davor.
8. **Am Handy** (~375 px): Startseite durchscrollen. Nichts scrollt seitwärts,
   die Karten sind einspaltig, jede Schaltfläche bleibt mindestens 44 px hoch.
   **Zielwert der Story:** Anschrift, Klingelname und eine wählbare Rufnummer
   sind ohne einen einzigen weiteren Tap sichtbar (vorher: drei Taps über
   Kalender → Termin → Akte).

---

## UX-002 — Navigation starten (Google Maps, Fahrradmodus)

**Was geprüft wird:** dass die Anfahrt ein Tap ist — und dass dabei nur die
Anschrift ohne Namen übergeben wird, erst beim Tippen.

**Voraussetzung:** derselbe Seed-Tag wie bei UX-001, angemeldet als
`anna.beispiel@praxis.invalid`.

1. **Je Besuch.** Startseite (`/`). Auf der Karte des 09:00-Besuchs steht
   „Navigation starten". Ein Tipp öffnet einen neuen Tab mit Google Maps, Ziel
   „Beispielstrasse 12, 72070 Tuebingen, DE", Verkehrsmittel Fahrrad.
2. **Der ganze Tag.** Rechts neben der Überschrift „Offen heute" steht
   „Ganzer Tag (n Stopps)". Ein Tipp öffnet Google Maps mit allen offenen
   Hausbesuchen in Terminreihenfolge: der letzte als Ziel, die davor als
   Zwischenziele.
3. **Am Termin.** `/termine/…` eines Hausbesuchs öffnen: in der Angabenliste
   steht unter „Anfahrt" dieselbe Schaltfläche. Bei einem Praxistermin steht
   dort **nichts** — es gibt kein Ziel.
4. **Nur auf Aktion (ADR-019 Punkt 20).** Auf der Startseite die
   Entwicklerwerkzeuge öffnen, Reiter „Netzwerk", Seite neu laden: **vor** dem
   Tippen geht **keine** Anfrage an `google.com`. Danach im Quelltext (Strg+U
   bzw. Untersuchen) nach `google.com` suchen: kein Treffer, solange nicht
   getippt wurde. Genau das ist der Unterschied zwischen einer Schaltfläche
   und einem Link.
5. **Was übergeben wird.** In der geöffneten Google-Maps-Adresszeile steht
   `destination=Beispielstrasse+12,+72070+Tuebingen,+DE` und
   `travelmode=bicycling` — und sonst nichts. **Kein Name, keine Uhrzeit, kein
   Zugangshinweis, keine Kennung.** Das ist die Feldliste aus ANN-018; weicht
   sie ab, ist das ein Befund.
6. **Am Handy** (~375 px): Die drei Schaltflächen der Karte (Mobil, Telefon,
   Navigation starten) brechen um, statt seitwärts zu scrollen; jede bleibt
   mindestens 44 px hoch. **Zielwert der Story:** vom Öffnen der Anwendung bis
   zur laufenden Radnavigation ein Tap.

---

## UX-003 — Folgetermin und Vorbelegung „Hausbesuch, ich, heute"

**Was geprüft wird:** dass der nächste Termin am Ende eines Besuchs nicht bei
einem leeren Formular anfängt.

1. **Vorbelegung.** Als `anna.beispiel@praxis.invalid` eine Akte öffnen und
   „Termin anlegen". Im Formular steht bereits: Terminart **Hausbesuch**,
   behandelnde Person **Anna Beispiel**, Datum **heute**. Beginn und Ende
   bleiben leer — eine erfundene Uhrzeit wäre keine Vorbelegung, sondern eine
   Behauptung.
2. **Office bekommt keine Person vorbelegt.** Als
   `olivia.office@praxis.invalid` dasselbe Formular öffnen: „Behandelnde
   Person" steht auf „Bitte wählen …". Olivia behandelt nicht und ist deshalb
   nicht zuordenbar.
3. **Folgetermin.** Einen Hausbesuch unter `/termine/…` öffnen und
   „Folgetermin anlegen" tippen. Das Formular öffnet sich mit derselben Person,
   derselben Terminart, derselben Uhrzeit und derselben Dauer — Datum **eine
   Woche später**. Alles ist änderbar; es entsteht **keine** Terminserie (die
   kommt mit CAL-007 aus dem Kontingent der Verordnung).
4. **Auch nach dem Abschluss.** Denselben Termin abschließen und die Seite neu
   laden: „Folgetermin anlegen" steht weiterhin da — genau dann wird er
   gebraucht. Bei einem **abgesagten** Termin steht er nicht da.
5. **Die Adresszeile trägt die Vorbelegung.** Nach dem Tippen auf
   „Folgetermin anlegen" steht in der Adresszeile
   `?datum=…&beginn=…&ende=…&art=…&person=…`. Die Seite neu laden: die
   Vorbelegung ist noch da. Einen Wert von Hand verstellen (etwa
   `beginn=25:00`) und neu laden: das Feld bleibt schlicht leer, ohne
   Fehlermeldung.
6. **Am Handy** (~375 px): Das Formular ist einspaltig, „Folgetermin anlegen"
   ist einhändig erreichbar. **Zielwert der Story:** vom abgeschlossenen
   Termin zum angelegten Folgetermin in **zwei** Taps (vorher: acht
   Interaktionen über drei Seiten).

---

## UX-004 — Patientensuche von jeder Seite

**Was geprüft wird:** dass von jeder Seite ein Weg in eine Akte führt — und
dass die Suche nicht dazu taugt, sich den Bestand anzusehen.

1. **Überall erreichbar.** Als `anna.beispiel@praxis.invalid` anmelden. In der
   Kopfleiste steht ein Feld „Name suchen …". Es ist auf `/`, `/kalender`,
   `/patienten` und `/termine/…` dasselbe Feld an derselben Stelle.
2. **Erst ab drei Zeichen.** „mu" tippen: darunter steht „Mindestens 3
   Zeichen." und es passiert nichts weiter. „mus" tippen: „Max Mustermann"
   erscheint, mit Geburtsdatum darunter.
3. **Umlaute sind egal.** Nacheinander „Müller", „Mueller" und „Muller"
   tippen — sofern eine Person mit Umlaut angelegt ist, findet jede Schreibweise
   sie. (Im Seed gibt es keine; dafür eine Person anlegen, etwa „Jörg Müller".)
4. **Tastatur.** Ins Feld tippen, dann Pfeil-runter: der erste Treffer wird
   hervorgehoben. Eingabetaste: die Akte öffnet sich. Escape schließt die
   Liste, ohne zu navigieren.
5. **Kein Bestandsabzug.** „%" oder „___" tippen: „Kein Treffer." Ein
   Platzhalter ist kein Suchbegriff — gesucht wird nach Zeichen, nicht nach
   einem Muster. Ein einzelner Buchstabe liefert ebenfalls nichts.
6. **Nicht in Versorgung ist gekennzeichnet.** Nach „Platzhalter" suchen: der
   Treffer trägt das Abzeichen „Nicht in Versorgung" — als Text, nicht als
   Farbe.
7. **Patientenkonto.** Als `max.mustermann@patient.invalid` anmelden: in der
   Kopfleiste steht **kein** Suchfeld. Das ist Darstellung; die Serverfunktion
   weist ein Patientenkonto ohnehin ab.
8. **Am Handy** (~375 px): Das Suchfeld steht in einer eigenen Zeile unter dem
   Praxisnamen, ist volle Breite und mindestens 44 px hoch. Die Trefferliste
   legt sich über den Inhalt und scrollt bei vielen Treffern in sich.
   **Zielwert der Story:** vom Kalender in eine beliebige Akte in **einem**
   Feld und **einem** Tap (vorher: Bereichswechsel, Liste laden, filtern,
   tippen).

---

## UX-005 — Tap auf freie Zeit im Kalender

**Was geprüft wird:** dass ein Termin dort entsteht, wo man ihn sieht — auf
der freien Stelle im Kalender.

1. **Tagesansicht.** `/kalender?ansicht=tag` öffnen. Auf eine freie Stelle in
   der Spalte einer Person tippen. Es öffnet sich „Termin anlegen" mit der
   Vorbelegung: Datum der Ansicht, die getippte Uhrzeit (auf das Praxisraster
   gerundet), **60 Minuten** Länge, Terminart Hausbesuch, die Person der
   Spalte.
2. **Person wählen.** Auf derselben Seite steht ein Suchfeld „Patient:in
   suchen". Nach Auswahl geht es in das gewohnte Terminformular — mit
   derselben Vorbelegung. Speichern: der Termin steht an der getippten Stelle.
3. **Wochenansicht.** `/kalender?ansicht=woche` öffnen und auf eine freie
   Stelle tippen: das **Datum** der Spalte wird übernommen, die Person ist die
   der Wochenansicht.
4. **Ein bestehender Termin bleibt ein Link.** Auf eine Terminkachel tippen:
   es öffnet sich wie bisher die Detailansicht, **nicht** die Terminanlage.
5. **Nach dem Ziehen kein Fehlklick.** Eine Kachel verschieben und loslassen:
   danach öffnet sich weder die Detailansicht noch die Terminanlage.
6. **Tastatur.** Über dem Kalender steht die Schaltfläche „Termin anlegen".
   Sie führt zur selben Seite, mit Datum und Person der Ansicht, aber **ohne**
   Uhrzeit — die wählt das Formular. Damit ist die Funktion ohne Zeigegerät
   erreichbar; der Tap ist die Abkürzung, nicht der einzige Weg.
7. **Die 60 Minuten sind eine Vorbelegung.** Sie lassen sich im Formular
   ändern, und der Server weist eine andere Länge **noch nicht** ab — die
   Durchsetzung nach `PROJECT_PRINCIPLES.md` §8.1 kommt mit **CAL-010a**.
8. **Am Handy** (~375 px): Der Kalender scrollt waagerecht wie bisher; ein
   Tipp auf freie Fläche funktioniert auch nach dem Scrollen und trifft die
   richtige Spalte.

---

## UX-006 — Nächste Termine in der Akte

**Was geprüft wird:** dass die Akte auch nach vorn schaut.

**Vorbereitung:** In der Akte von Max Mustermann einen Termin in der Zukunft
anlegen (etwa nächste Woche).

1. **Der Blick nach vorn.** `/patienten/…` öffnen. Zwischen „Versorgung" und
   den Verordnungen steht „Nächste Termine" mit Datum, Uhrzeit, Terminart und
   behandelnder Person. Ein Tipp darauf öffnet den Termin.
2. **Nur Künftiges.** Den Termin absagen und die Seite neu laden: er
   verschwindet aus der Liste (im Kalender bleibt er). Einen vergangenen
   Termin anlegen: er erscheint dort **nicht** — er steht im
   Behandlungsverlauf darunter.
3. **Leer heißt leer.** Bei einer Person ohne künftige Termine steht „Kein
   weiterer Termin vereinbart." als Satz, nicht als leere Fläche.
4. **Keine Anschrift.** Der Abschnitt zeigt **keine** Adresse. Die braucht der
   Blick in die Akte nicht; sie steht in der Tagesliste und am Termin
   (ADR-004).
5. **Ein Weg, nicht zwei.** Auf der Seite gibt es genau **eine** Schaltfläche
   „Termin anlegen" — oben in der Akte, und sie bleibt bei einer inaktiven
   Person aus.
6. **Patientenkonto.** Als `max.mustermann@patient.invalid` die eigene Ansicht
   öffnen: der Abschnitt erscheint nicht.
7. **Am Handy** (~375 px): Die Einträge brechen um, statt seitwärts zu
   scrollen. **Zielwert der Story:** die Frage „wann bin ich das nächste Mal
   dran?" ist in der Akte beantwortet, ohne den Kalender zu öffnen.

---

## UX-007 — Behandlung abschließen in einem Schritt

**Was geprüft wird:** dass der Abschluss eines Besuchs eine Handlung ist statt
sechs — und dass er ganz oder gar nicht passiert.

1. **Von der Tagesliste aus.** Startseite (`/`) als
   `anna.beispiel@praxis.invalid`. Auf der Karte eines offenen Besuchs steht
   „Behandlung abschließen". Ein Tipp öffnet eine Seite mit einem Textfeld.
2. **Die Folge steht vor dem Knopf.** Über den Schaltflächen steht, was
   passiert: Termin als durchgeführt, Eintrag als Version 1 festgeschrieben,
   ab dann Bestandteil der Akte. Das ersetzt die frühere Rückfrage — die kam
   erst **nach** dem Klick.
3. **Ein Schritt.** Text eingeben, „Behandlung abschließen" tippen. Danach ist
   der Termin **abgeschlossen** und die Dokumentation **finalisiert**. Zurück
   auf der Terminseite steht beides.
4. **Ganz oder gar nicht.** Das Textfeld leeren und abschließen: es erscheint
   „Die Behandlungsdokumentation darf nicht leer sein." — und der Termin ist
   **nicht** abgeschlossen. Kein halber Zustand.
5. **Der alte Weg bleibt.** Auf der Terminseite steht weiter „Termin
   abschließen" (ohne Dokumentation, ANN-005) und in der Dokumentation weiter
   „Finalisieren" mit Rückfrage. Auf der Abschlussseite gibt es zusätzlich
   „Nur als Entwurf speichern".
6. **Nachträglich dokumentieren.** Einen Termin ohne Dokumentation
   abschließen. Er steht auf der Startseite weiter unter „Offen heute" mit dem
   Grund „Dokumentation fehlt". „Behandlung abschließen" dort öffnet dieselbe
   Seite; sie sagt, dass der Termin bereits abgeschlossen ist und nur noch
   dokumentiert wird.
7. **Office.** Als `olivia.office@praxis.invalid` `/termine/…/abschluss`
   direkt aufrufen: „Nicht freigegeben". Verbindlich weist die Serverfunktion
   ab.
8. **Am Handy** (~375 px): Textfeld, Hinweis und Schaltflächen sind ohne
   seitliches Scrollen bedienbar, „Behandlung abschließen" ist einhändig
   erreichbar. **Zielwert der Story:** vom offenen Besuch zur finalisierten
   Dokumentation in **zwei** Taps plus Text (vorher: sechs Schritte über drei
   Ansichten).

---

## UX-008 — Textbausteine in der Dokumentation

**Was geprüft wird:** dass ein vorbereiteter Satz per Tap im Freitext landet —
und dass ein persönlicher Baustein wirklich persönlich ist.

**Vorbereitung:** `pnpm dlx supabase db reset` — der Seed legt zwei Bausteine
der Praxis und einen persönlichen von Anna Beispiel an.

1. **Einfügen.** Als `anna.beispiel@praxis.invalid` einen Termin öffnen und
   „Behandlung abschließen". Über dem Textfeld steht „Textbausteine:" mit drei
   Knöpfen. Auf „Hausbesuch durchgefuehrt" tippen: der Satz steht im Feld.
2. **Ergänzen statt ersetzen.** Einen eigenen Satz tippen, dann einen zweiten
   Baustein antippen: Er hängt sich mit einer Leerzeile **hinten** an. Der
   eigene Text bleibt.
3. **Nichts wird ausgefüllt.** Der eingefügte Text enthält **keine**
   Platzhalter und **keinen** Namen aus der Akte — er ist wörtlich das, was in
   der Verwaltung steht (E-9, erste Stufe).
4. **Verwalten.** „Bausteine verwalten →" oder Betrieb → Textbausteine. Die
   Seite trennt „Bausteine der Praxis" von „Meine Bausteine". Als Anna steht
   an den Praxis-Bausteinen **keine** Schaltfläche „Bearbeiten", sondern der
   Hinweis, dass die Praxisleitung sie pflegt.
5. **Eigenen anlegen.** „Baustein anlegen", Titel und Text eingeben,
   speichern. Er erscheint unter „Meine Bausteine" mit dem Abzeichen „Nur ich"
   und ab sofort in der Leiste über dem Freitext.
6. **Persönlich heißt persönlich.** Als `tim.teamleitung@praxis.invalid`
   anmelden: Annas Baustein („Manuelle Therapie") steht **weder** in seiner
   Liste **noch** in seiner Leiste. Die Bausteine der Praxis sieht er.
7. **Praxisweit nur als Praxisleitung.** Als `jannes.test@praxis.invalid`
   „Baustein anlegen": dort gibt es zusätzlich das Kästchen „Baustein der
   Praxis". Als Anna oder Tim gibt es dieses Kästchen nicht.
8. **Löschen ändert keine Akte.** Einen eigenen Baustein löschen: Die
   Rückfrage sagt ausdrücklich, dass bereits geschriebene Dokumentation
   unberührt bleibt. Eine Dokumentation, in die der Baustein eingefügt wurde,
   nachlesen: der Text steht unverändert darin.
9. **Office.** Als `olivia.office@praxis.invalid`: Der Punkt „Textbausteine"
   fehlt im Menü, und `/praxis/textbausteine` direkt aufgerufen meldet „Nicht
   freigegeben".
10. **Audit.** Als `jannes.test@praxis.invalid` unter Betrieb → Sicherheit:
    Es stehen Einträge „Textbaustein angelegt/geändert/gelöscht" mit Titel —
    **ohne** den Text des Bausteins.
11. **Am Handy** (~375 px): Die Bausteinleiste bricht um, jeder Knopf bleibt
    mindestens 44 px hoch. **Zielwert der Story:** ein wiederkehrender Satz
    kostet einen Tap statt einer halben Minute Tippen.

---

## UX-009 — Textverlust-Schutz und der Restpunkt aus VER-003

**Was geprüft wird:** dass ein geschriebener Text nicht unbemerkt verschwindet
— und dass ein aufgegebener Verordnungsentwurf nicht wieder auftaucht.

### Textverlust-Schutz

1. **Warnung vor dem Neuladen.** Einen Termin öffnen, „Behandlung
   abschließen", einen Satz tippen — **nicht** speichern. Jetzt F5 drücken:
   Der Browser fragt nach, ob die Seite wirklich verlassen werden soll. Den
   Text speichern und erneut F5: keine Nachfrage mehr.
2. **Auch beim Zurück.** Denselben Zustand herstellen und den Zurück-Knopf des
   Browsers drücken: dieselbe Nachfrage.
3. **Ohne Verbindung.** Netzwerk in den Entwicklerwerkzeugen auf „Offline"
   stellen, dann einen Satz tippen: Über den Schaltflächen erscheint „Ohne
   Verbindung lässt sich gerade nicht speichern. Der Text bleibt im Feld
   stehen …" — zusätzlich zum gelben Streifen über der Kopfleiste. Netzwerk
   wieder anschalten: Der Hinweis verschwindet, der Text steht noch da.
4. **Dasselbe in Korrektur und Nachtrag.** Beide Formulare verhalten sich
   gleich.
5. **Kein heimlicher Zwischenspeicher.** Nach einem bestätigten Neuladen ist
   der Text **weg** — das ist Absicht. Ein Entwurf, der nur im Browser läge,
   wäre nicht gespeichert, würde aber so aussehen (ADR-001, ADR-015 Punkt 16).
   Die Warnung ist der Schutz, nicht ein lokaler Speicher.

### Restpunkt aus VER-003

6. **Abstecher abbrechen über die Hauptnavigation.** Eine Verordnung erfassen
   (`/patienten/…/verordnungen/neu`), Heilmittel „Aufgegebener Versuch"
   eintragen, „Verordner:in anlegen" tippen — und dann **über die
   Hauptnavigation** weggehen (etwa auf „Mein Tag"), nicht über „Abbrechen".
7. **Neuer Versuch bleibt leer.** Innerhalb der nächsten Minuten erneut
   „Verordnung erfassen" für dieselbe Person öffnen: Das Formular ist **leer**.
   Vorher stand hier „Aufgegebener Versuch" — das war der dokumentierte
   Restpunkt.
8. **Der gewollte Weg funktioniert weiter.** Verordnung erfassen, etwas
   eintragen, „Verordner:in anlegen", dort speichern **oder** abbrechen: Die
   Eingaben stehen danach unverändert im Formular, und nach dem Speichern ist
   die neue Verordner:in ausgewählt.
9. **Sichtbar in der Adresszeile.** Beim Abstecher steht im
   `zurueck`-Parameter ein `vorgang=…`. Diese Kennung unterscheidet zwei
   Besuche derselben Seite; sie ist kein Geheimnis und trägt keine Daten.

---

## UX-010 — Langer Druck am Finger, Rückgängig nach dem Verschieben

**Was geprüft wird:** dass sich der Kalender am Telefon wieder scrollen lässt
— und dass eine versehentliche Verschiebung zurückzuholen ist.

1. **Scrollen über einem Termin (der eigentliche Befund).** Am Handy (~375 px
   oder Gerätesimulation mit Touch) `/kalender?ansicht=tag` öffnen und mit dem
   Finger **auf einer Terminkachel** nach oben wischen: Der Kalender scrollt.
   Vorher blieb er stehen und der Termin wanderte mit.
2. **Verschieben mit dem Finger.** Denselben Termin antippen und den Finger
   **liegen lassen**. Nach knapp einer halben Sekunde hebt sich die Kachel
   sichtbar hervor (Rahmen, leicht vergrößert). Erst jetzt ziehen: der Termin
   folgt dem Finger und lässt sich ablegen.
3. **Am Rechner unverändert.** Mit der Maus greift der Termin wie bisher
   sofort — dort gibt es keinen Grund zu warten.
4. **Rückgängig.** Einen Termin verschieben. Unter der Werkzeugleiste
   erscheint „Termin verschoben. Vorher: …" mit der alten Person, dem alten
   Tag und der alten Uhrzeit. „Rückgängig" tippen: Der Termin steht wieder an
   seinem Platz.
5. **Ein echter Vorgang, kein Trick.** Als `jannes.test@praxis.invalid` unter
   Betrieb → Sicherheit nachsehen: Es stehen **zwei** Einträge „Termin
   verschoben" — das Zurückholen ist selbst eine Änderung und wird als solche
   protokolliert.
6. **Der alte Platz kann belegt sein.** Termin A verschieben, dann Termin B
   auf den frei gewordenen Platz legen, dann bei A „Rückgängig": Es erscheint
   die verständliche Meldung, dass dort schon ein Termin liegt — und A bleibt,
   wo es ist.
7. **Die Leiste bleibt nicht ewig.** Nach dem Blättern auf einen anderen Tag
   ist sie verschwunden; sie bietet nichts an, was nicht mehr zu sehen ist.

---

## UX-011 — Tagesplan bleibt im Funkloch lesbar

**Was geprüft wird:** dass die Anschrift nicht vom Bildschirm verschwindet,
wenn im Treppenhaus die Verbindung abreißt — und dass daraus kein heimlicher
Offline-Modus wird.

1. **Erst laden.** Als `anna.beispiel@praxis.invalid` die Startseite öffnen und
   die Tagesliste abwarten. Anschrift und Zugangshinweis stehen da.
2. **Funkloch.** Entwicklerwerkzeuge → Netzwerk → „Offline". Dann die Liste zum
   Nachladen bringen: in einen anderen Bereich und zurück wechseln.
3. **Es bleibt stehen.** Die Karten stehen unverändert da, darüber die Meldung
   „Die Tagesliste ließ sich gerade nicht aktualisieren. Angezeigt wird der
   Stand von HH:MM Uhr – er kann veraltet sein." Zusätzlich der gelbe Streifen
   über der Kopfleiste.
4. **Ehrlich über das Alter.** Netzwerk wieder anschalten und nachladen: die
   Meldung verschwindet. Bei frischem Stand steht **nichts** über sein Alter
   da — ein dauerhaftes „Stand von …" wäre Rauschen.
5. **Kein Offline-Modus.** Immer noch offline: Die Seite **neu laden**. Jetzt
   ist die Liste weg und es erscheint die Fehlermeldung — nichts liegt auf dem
   Gerät. Das ist Absicht (ADR-001, ADR-015 Punkt 16, ANN-021): Was hier
   stehen bleibt, ist der Zwischenspeicher der laufenden Seite, mehr nicht.
6. **Abmelden räumt auf.** Wieder online, Liste laden, abmelden, mit einem
   **anderen** Konto anmelden (`tim.teamleitung@praxis.invalid`): Von Annas
   Tagesliste ist nichts zu sehen — auch nicht kurz beim Aufbau der Seite.
7. **Geschrieben wird nichts aus dem Speicher.** Offline auf „Behandlung
   abschließen" tippen und speichern: Es erscheint eine Fehlermeldung, und der
   Termin bleibt unverändert. Der Zwischenspeicher ist ausschließlich lesend.

## MARKE-001 — Marke Own Motion in der Anwendung

Kein Feature, sondern das Erscheinungsbild: Favicon, Akzentfarbe und Wortmarke.
Die Prüfschritte suchen nach zwei Dingen — ob die Marke da ist, wo sie
hingehört, und ob die neue Farbe irgendwo schlechter lesbar ist als die alte.
Verbindlich für Farben, Schutzraum, Mindestgröße und Verbote ist
[`../../marke/README.md`](../../marke/README.md).

1. **Tab und Lesezeichen.** Anwendung öffnen. Der Browser-Tab trägt das grüne
   Symbol und den Titel „Own Motion" — vorher war der Tab leer und hieß
   „Praxisplattform". Ein Lesezeichen setzen: es übernimmt beides.
   Im Symbol steht seit dem 2026-09-11 das **Monogramm „OM"** statt der
   zweizeiligen Wortmarke (deine Entscheidung, `marke/README.md`, Befund 2).
   Prüfen: Lässt sich „OM" im Tab erkennen — auch auf einem Bildschirm ohne
   hohe Auflösung, wo der Browser die 16-px-Fassung nimmt? Wenn du dort immer
   noch nur Farbe siehst, ist das ein Befund und keine Kleinigkeit: Dann
   müsste das Monogramm größer auf der Kachel sitzen.
2. **Anmeldemaske.** Abmelden. Über „Anmelden" steht jetzt die Wortmarke statt
   des Worts „PRAXISPLATTFORM". Sie ist zweizeilig, „OWN" über eingerücktem
   „MOTION", dunkelgrün auf hellem Grund. Rundum bleibt Platz — nichts drängt
   sich an sie heran.
3. **Kopfzeile.** Anmelden. Oben links steht die Wortmarke. Der Praxisname
   aus den Stammdaten steht **nicht** mehr dort — im Seed wäre das
   „Test Praxis Tuebingen" gewesen. Wenn du ihn vermisst, ist das ein Befund
   und kein Fehler: die Entscheidung steht als ANN-023 im Annahmenregister und
   ist mit wenig Aufwand umkehrbar.
4. **Akzentfarbe im Alltag.** Als `anna.beispiel@praxis.invalid` eine Akte
   öffnen. Alles, was vorher petrol war, ist jetzt dunkelgrün: der aktive
   Eintrag in der Navigation, Links, die primäre Schaltfläche, der aktive
   Reiter im Untermenü. Mit dem Mauszeiger über einen Link und über
   „Patient anlegen" fahren — beide werden **dunkler**, nicht heller. Ist der
   Unterschied für dich zu schwach zu sehen, sag Bescheid (ANN-022, eine Zeile
   in `src/index.css`).
5. **Zwei grüne Abzeichen.** Unter „Praxis → Mitarbeitende" die Rollenabzeichen
   ansehen, und in der Akte die Statusabzeichen. Akzent und „positiv" liegen
   im Farbton jetzt dicht beieinander. Prüfen: lässt sich trotzdem auf einen
   Blick unterscheiden, was ein Rollenabzeichen und was eine Statusmeldung
   ist? Die Bedeutung hängt nie an der Farbe allein — der Zustand steht immer
   als Wort daneben —, aber wenn es dich stört, ist es ein Befund.
6. **Tastatur und Fokus.** Mit Tab durch die Anmeldemaske und durch ein
   Formular in der Akte gehen. Der Fokusring ist jetzt grün und muss auf allen
   Flächen deutlich sichtbar bleiben, auch auf den grau hinterlegten.
7. **Drucken.** Eine Akte öffnen und Strg+P (bzw. Cmd+P). Die Wortmarke
   erscheint **nicht** im Ausdruck — die Kopfzeile wird beim Drucken
   ausgeblendet, wie seit UI-000. Das ist gewollt; das Logo auf Papier kommt
   mit der Rechnung (ABR-000).
8. **Die dritte Seite ohne Rahmen.** Neben Anmeldemaske und Kopfzeile gibt es
   genau eine Stelle, die die Marke tragen muss: die Seite „Zugang nicht
   vollständig eingerichtet". Sie erscheint, wenn eine Anmeldung klappt, aber
   kein Praxisprofil dahintersteht — auslösen lässt sie sich nur mit einem
   Konto ohne Profil. Wenn du sie siehst, steht die Wortmarke über dem
   Fehlertext. Zwei Komponententests halten das fest
   (`src/app/App.test.tsx`); ein eigener Prüfschritt ist deshalb nur nötig,
   falls dir die Seite im Alltag begegnet.
9. **Am Handy** (~375 px): Anmeldemaske und Kopfzeile ansehen. Die Wortmarke
   bleibt neben dem Bereichsnamen und „Abmelden" vollständig sichtbar, nichts
   scrollt seitwärts, nichts überlappt. Ohne Anmeldung geht das auch in der
   Cloudumgebung:

   ```bash
   pnpm dev                              # in einem zweiten Terminal
   pnpm screenshots --breite=375 /
   pnpm screenshots --breite=1280 /
   ```

   Für die Kopfzeile braucht es den vollen Supabase-Stack und `--konto`:

   ```bash
   pnpm screenshots --breite=375 --konto=therapist /patienten
   ```

   „Ohne Befund" ist das erwartete Ergebnis.

---

## LOE-001b — Abschluss der Versorgung

Der Vorgang, an dem die gesetzliche Aufbewahrung hängt (ADR-008, §630f Abs. 3
BGB). Er heißt bewusst **nicht** „Behandlung abschließen" — so heißt seit
UX-007 der Abschluss eines einzelnen Termins.

1. **Laufende Versorgung.** Eine Akte öffnen (`therapist`). Im Abschnitt
   „Versorgung" steht neben Beginn und Status die Zeile **„Abschluss: Laufende
   Versorgung"**. Darunter die Schaltfläche „Versorgung abschließen".
2. **Rückfrage statt Sofortwirkung.** Auf „Versorgung abschließen" tippen. Es
   passiert noch nichts: Es erscheint ein Kasten mit dem Satz, dass ab diesem
   Tag zehn Jahre Aufbewahrung laufen und die Akte danach gelöscht wird, dazu
   das Feld „Letzter Behandlungstag" mit dem heutigen Datum. „Abbrechen"
   schließt den Kasten, ohne etwas zu speichern.
3. **Zurückdatieren.** Erneut öffnen, im Feld einen Tag in der Vergangenheit
   wählen (nach dem Versorgungsbeginn der Akte), bestätigen. Die Zeile lautet
   jetzt **„Abschluss: <Datum> — Aufbewahrung bis <Jahr+10>"**.
4. **Zukunft geht nicht.** Erneut versuchen mit einem Datum in der Zukunft:
   Das Feld lässt es gar nicht erst zu (`max` = heute); wer es über die
   Tastatur erzwingt, bekommt die Fehlermeldung „… Prüfen Sie das Datum."
   und **keine** Erfolgsmeldung.
5. **Zurücknehmen.** Die Schaltfläche heißt jetzt „Abschluss zurücknehmen".
   Bestätigen — die Zeile steht wieder auf „Laufende Versorgung". Der Satz im
   Kasten sagt, dass die Frist mit einem neuen Abschluss **neu** beginnt.
6. **Rollenschnitt.** Mit `office` anmelden, dieselbe Akte öffnen: „Als
   inaktiv markieren" ist da, „Versorgung abschließen" **nicht**. Umgekehrt
   sieht `therapist` den Abschluss, aber nicht die Statusaktion. Das ist
   Absicht: Der Status ist Verwaltung, der Abschluss eine fachliche Aussage.
7. **Im Auditlog.** Als `owner` unter „Betrieb → Sicherheit" die Einträge
   ansehen: „Versorgung abgeschlossen" und „Abschluss der Versorgung
   zurückgenommen" stehen dort mit Zeitpunkt und handelnder Person.
8. **Am Handy** (~375 px): Akte öffnen, Kasten aufklappen. Das Datumsfeld und
   beide Schaltflächen bleiben vollständig sichtbar und mindestens 44 px hoch;
   nichts scrollt seitwärts.

   ```bash
   pnpm screenshots --breite=375 --konto=therapist /patienten
   ```

„Ohne Befund" ist das erwartete Ergebnis.

---

## LOE-002b — Aufbewahrung und Löschung ansehen

Die Übersicht ist die Seite, auf die die Datenschutzprüfung schaut: Was wird
wie lange aufbewahrt, was ist gerade von der Löschung ausgenommen, was wurde
gelöscht (ADR-008, ADR-007). Sie ist eine reine Lesesicht — Fristen ändern sich
über eine Migration, nicht über einen Klick.

1. **Nur für die Inhaberin.** Als `owner` anmelden, „Betrieb" öffnen. Im
   Untermenü steht neben „Sicherheit" der neue Punkt **„Aufbewahrung"**. Mit
   `therapist` oder `office` anmelden: Der Punkt fehlt, und der direkte Aufruf
   von `/praxis/sicherheit/aufbewahrung` landet auf „Mein Tag".
2. **Aufbewahrungsplan.** Zwölf Karten, je eine Datenklasse. Prüfen:
   - „Klinische Patientenakte" nennt **10 Jahre**, „ab Abschluss der
     Versorgung" und als Grundlage **Par. 630f Abs. 3 BGB**.
   - „Beschäftigtendaten" und „Verordner:innen" nennen **„Keine automatische
     Löschung"** — das ist kein Fehler, sondern der offene Punkt. Beide tragen
     ein oranges Kürzel (`ANN-030`, `ANN-013`): eine Frist, die noch niemand
     bestätigt hat.
   - Jede Karte lässt sich mit „Betroffene Tabellen (n)" aufklappen. Dort
     stehen technische Tabellennamen — absichtlich unübersetzt, weil die
     Zuordnung sonst nicht nachprüfbar wäre.
3. **Löschsperren.** Erwartung im Normalfall: „Keine laufende Löschsperre".
   Eine Pflegeoberfläche gibt es bewusst noch nicht (Komfort laut Roadmap). Wer
   den gefüllten Zustand sehen will, setzt eine Sperre am lokalen Stack von
   Hand — mit dem `owner`-Konto:

   ```sql
   select public.place_legal_hold(
     '66666666-6666-4666-8666-000000000001'::uuid, 'Testsperre, Abnahme');
   ```

   Danach zeigt der Abschnitt Name, Grund, Beginn und wer sie gesetzt hat.
   Aufheben mit `select public.release_legal_hold('<id>'::uuid);`.

4. **Löschjournal.** Erwartung: „Es wurde noch nichts gelöscht". Das ist
   richtig so — im synthetischen Bestand ist keine Versorgung abgeschlossen,
   und ohne Abschluss läuft keine Frist.
5. **Der Löschlauf, wenn du ihn sehen willst** (optional, am lokalen Stack):
   eine Akte auf „vor elf Jahren abgeschlossen" setzen und den Lauf einmal von
   Hand auslösen. Danach ist die Akte samt Terminen und Dokumentation weg, und
   das Löschjournal zeigt die Zeilen:

   ```sql
   update public.patients
      set care_started_on = current_date - interval '12 years',
          care_concluded_on = current_date - interval '11 years',
          care_concluded_at = now(),
          care_concluded_by = '11111111-1111-4111-8111-000000000001'
    where id = '66666666-6666-4666-8666-000000000003';
   select public.apply_retention();
   ```

   Anschließend `pnpm dlx supabase db reset`, damit der synthetische Bestand
   wieder vollständig ist.

6. **Am Handy** (~375 px): Die Karten stehen untereinander, die Liste der
   Löschläufe bricht auf drei Zeilen um, nichts scrollt seitwärts.

   ```bash
   pnpm screenshots --breite=375 --konto=owner /praxis/sicherheit/aufbewahrung
   ```

„Ohne Befund" ist das erwartete Ergebnis.
