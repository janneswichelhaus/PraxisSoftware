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
   Terminstatus („Geplant", „Abgeschlossen" oder „Abgesagt") — und darunter
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
