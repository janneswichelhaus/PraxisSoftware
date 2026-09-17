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
6. Text ändern, „Abbrechen" klicken — es erscheint die Rückfrage des
   Navigationsschutzes (seit FIX-011), und der Text bleibt stehen. „Hier
   bleiben" führt zurück ins Feld, „Verwerfen und weitergehen" zurück zum
   Termin ohne zu speichern, „Speichern und weitergehen" sichert den Entwurf
   und geht erst danach. Ausführlich im Abschnitt **FIX-EPIC-003** am Ende
   dieser Datei.
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
11. Als owner „Organisatorisches → Sicherheit" öffnen: dort stehen
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
12. Als owner „Organisatorisches → Sicherheit" öffnen: dort stehen zusätzlich
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

> _Überholt seit ROL-EPIC-001 (E15, 2026-09-15):_ `office` sieht in der Akte
> die Behandlungsdokumentation wie die klinischen Rollen; der Nachweis steht
> nur noch als Rechnungssicht auf dem Server. Aktuelle Prüfschritte stehen im
> Abschnitt „ROL-EPIC-001" am Ende dieser Datei. Die Schritte hier bleiben als
> abgenommene Chronik von DOK-003 stehen.

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
7. Als owner „Organisatorisches → Sicherheit" öffnen: das Öffnen der Akte steht
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
5. Als owner „Organisatorisches → Sicherheit" öffnen: für jeden in der Akte
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
4. Als owner unter „Organisatorisches → Sicherheit" steht
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
   _Seit ROL-EPIC-001 sieht office dort stattdessen dieselbe Zeile wie die
   Therapeutin._
10. Als owner „Organisatorisches → Sicherheit" öffnen: der Eintrag
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
7. **Auditprobe:** als `jannes.test@praxis.invalid` (owner)
   „Organisatorisches → Sicherheit" öffnen. Je Verordnung, die eine
   therapeutische Rolle gelesen hat, steht ein Eintrag „Verordnung gelesen".
   Nach dem Besuch von Office in Schritt 6 entsteht **kein** solcher Eintrag.
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
11. **Auditprobe:** als `jannes.test@praxis.invalid` (owner)
    „Organisatorisches → Sicherheit": „Verordnung erfasst", „Verordnung
    geändert" und „Verordnung gelöscht" stehen dort, jeweils ohne Diagnosetext.
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
   „Organisatorisches → Mitarbeitende" bei einer Person, am Termin bei „Termin
   absagen" und in einer Verordnung bei „Verordnung löschen".
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
Vergangenheit und „Übersicht" ist leer — das ist dann kein Befund. Vor dem
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

**Was geprüft wird:** dass „Übersicht" alles trägt, was an der Wohnungstür
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
10. **Audit.** Als `jannes.test@praxis.invalid` unter Organisatorisches →
    Sicherheit: Es stehen Einträge „Textbaustein angelegt/geändert/gelöscht"
    mit Titel — **ohne** den Text des Bausteins.
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
   Hauptnavigation** weggehen (etwa auf „Übersicht"), nicht über „Abbrechen".
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
5. **Zwei grüne Abzeichen.** Unter „Organisatorisches → Mitarbeitende" die
   Rollenabzeichen ansehen, und in der Akte die Statusabzeichen. Akzent und
   „positiv" liegen im Farbton jetzt dicht beieinander. Prüfen: lässt sich
   trotzdem auf einen Blick unterscheiden, was ein Rollenabzeichen und was eine
   Statusmeldung ist? Die Bedeutung hängt nie an der Farbe allein — der Zustand
   steht immer als Wort daneben —, aber wenn es dich stört, ist es ein Befund.
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
7. **Im Auditlog.** Als `owner` unter „Organisatorisches → Sicherheit" die
   Einträge ansehen: „Versorgung abgeschlossen" und „Abschluss der Versorgung
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

1. **Nur für die Inhaberin.** Als `owner` anmelden, „Organisatorisches"
   öffnen. Im
   Untermenü steht neben „Sicherheit" der neue Punkt **„Aufbewahrung"**. Mit
   `therapist` oder `office` anmelden: Der Punkt fehlt, und der direkte Aufruf
   von `/praxis/sicherheit/aufbewahrung` landet auf „Übersicht".
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

---

## CAL-EPIC-003a — Terminzustände (CAL-008a bis CAL-008d, CAL-009)

Der Termin kennt jetzt die sechs Zustände aus ADR-018. Drei davon sind neu
sichtbar: **bestätigt** (hieß vorher „geplant"), **nicht angetroffen** und
**dokumentiert**. Was hier geprüft wird, ist genau das, was eine Maschine
nicht beurteilt: ob die Wörter stimmen, ob die Wege sich richtig anfühlen und
ob das Ganze am Telefon bedienbar ist.

Vorher einmal `pnpm dlx supabase db reset` — die Migrationen und `seed.sql`
haben sich geändert.

### 1. Das Wort „bestätigt" steht überall

1. Kalender → einen Termin öffnen. Erwartung: **Status: Bestätigt**. Nirgends
   steht noch „Geplant".
2. Im Kalender den Statusfilter aufklappen. Erwartung: „Alle außer
   abgesagten" (Standard), „Nur bestätigte", „Nur erledigte", „Nur nicht
   angetroffene", „Nur abgesagte", „Alle" — und jede Auswahl ändert die
   Ansicht sichtbar.
3. Akte einer Patientin → „Nächste Termine". Erwartung: ein bestätigter
   Termin trägt **kein** Abzeichen, alles andere eines mit dem Wort daneben.

### 2. Absage nur noch mit Grund

1. Einen bestätigten Termin öffnen → **Termin absagen**. Erwartung: Die
   Rückfrage enthält eine Auswahl **Absagegrund** ohne Vorbelegung und den
   Satz, dass eine Absage sich nicht zurücknehmen lässt.
2. Ohne Auswahl auf „Ja, Termin absagen". Erwartung: **„Bitte einen
   Absagegrund auswählen."** direkt am Feld, der Termin bleibt bestätigt.
3. „Patient:in hat abgesagt" wählen und bestätigen. Erwartung: Status
   **Abgesagt**, darunter die Zeile **Absagegrund: Patient:in hat abgesagt**.
4. Am abgesagten Termin: keine Aktionen mehr, auch kein „wieder öffnen".

### 3. Nicht angetroffen — ein Schritt, keine Gebührenfrage

**Seit CAL-014c geändert:** Die Pflichtauswahl „Ausfallhonorar berechnen?" ist
entfallen (ADR-018 Fassung 2 Punkt 8).

1. Einen bestätigten Termin öffnen → **Nicht angetroffen**. Erwartung: Die
   Rückfrage nennt den Termin und sagt, dass es **keine durchgeführte
   Behandlung, keine Dokumentation und keine verbrauchte Verordnungsleistung**
   ist und **keine Gebühr** entsteht. **Keine Auswahl** zum Ausfallhonorar.
2. Bestätigen. Erwartung: Status **Nicht angetroffen**, Zeile **Vermerkt am**,
   **keine** Zeile „Gebühr vorgemerkt", darunter **Termin wieder öffnen**.
3. „Termin wieder öffnen". Erwartung: zurück auf **Bestätigt**, die Zeile ist
   weg.
4. Am vermerkten Termin: **Behandlung abschließen** wird nicht angeboten —
   wo niemand angetroffen wurde, gibt es nichts zu dokumentieren.
5. Gegenprobe Verordnung: In der Akte unter **Verordnungen** steht die genutzte
   Menge unverändert. Ein Vermerk verbraucht keine Leistung.

### 4. Dokumentiert kommt von selbst

1. Einen bestätigten Termin öffnen → **Behandlung abschließen**, Text
   schreiben, abschließen. Erwartung: Der Termin steht danach auf
   **Dokumentiert**, nicht auf „Abgeschlossen".
2. Einen zweiten Termin nur über **Termin abschließen** abhaken (ohne
   Dokumentation). Erwartung: **Abgeschlossen**; in „Übersicht" steht er
   weiter unter „offen" mit dem Hinweis „Dokumentation fehlt".
3. Zu diesem Termin die Dokumentation schreiben und **finalisieren**.
   Erwartung: Ohne Neuladen springt der Status daneben auf **Dokumentiert**.
4. Am dokumentierten Termin: kein „Bearbeiten", kein „Absagen", kein „wieder
   öffnen" — stattdessen der Satz, dass in der Dokumentation korrigiert wird.
   Eine **Korrektur** in der Dokumentation ändert den Status nicht.

### 5. Tag umplanen mit Anrufliste

1. Kalender → **Tagesansicht**, oben eine behandelnde Person auswählen.
   Erwartung: Der Knopf **Tag umplanen** erscheint (ohne Personenauswahl
   nicht).
2. Draufklicken. Erwartung: Die Seite nennt Person und Tag und listet nur die
   **bestätigten** Termine; abgeschlossene und abgesagte fehlen.
3. Grund wählen → „N Termine absagen" → bestätigen. Erwartung: Die Seite
   zeigt die **Anrufliste** mit Uhrzeit, Name, Rufnummer als Wählziel und
   einem Haken „Angerufen", dazu den Hinweis, dass die Haken nicht gespeichert
   werden.
4. Auf die Rufnummer tippen. Erwartung: Das Telefon bietet den Anruf an.
5. Im Kalender nachsehen: alle Termine des Tages sind abgesagt, die Termine
   der anderen Person unverändert.

### 6. Am Handy (~375 px)

```bash
pnpm screenshots --breite=375 --konto=office /kalender
```

Erwartung: Kein waagerechtes Scrollen, „Tag umplanen" und „Termin anlegen"
brechen untereinander um, die Auswahl des Absagegrunds ist mit einem Daumen
bedienbar, jedes Tippziel mindestens 44 px.

„Ohne Befund" ist das erwartete Ergebnis. Was nicht stimmt, kommt mit einem
Satz zurück — Befunde gehen als erste Story in den nächsten Loop derselben
Spur.

---

## CAL-010a — Terminfenster von 60 Minuten

`PROJECT_PRINCIPLES.md` §8.1: Ein angebotener Behandlungstermin hat ein
Zeitfenster von **60 Minuten**, die Dokumentation eingeschlossen. Die Regel
gilt serverseitig; das Formular bietet das Ende gar nicht mehr als Feld an.

### 1. Termin anlegen

1. Als `olivia.office@praxis.invalid` anmelden, Akte „Max Mustermann" →
   **Termin anlegen**.
2. Erwartung: Statt eines Ende-Feldes steht dort „Ende —" mit dem Hinweis
   „Terminfenster: 60 Minuten, Dokumentation eingeschlossen."
3. Beginn **09:05** eintragen. Erwartung: Daneben erscheint **10:05 Uhr**.
   §8.1 lässt jeden Rasterpunkt als Beginn zu — 09:05 ist zulässig, obwohl es
   keine volle oder halbe Stunde ist.
4. Speichern und die Detailansicht ansehen: **09:05–10:05 Uhr**.

### 2. Termin verschieben

1. Denselben Termin → **Bearbeiten**, Beginn auf **14:30** setzen.
   Erwartung: Das Ende springt auf **15:30 Uhr** mit.
2. Speichern. Erwartung: Der Termin steht auf 14:30–15:30 Uhr.
3. Im Kalender denselben Termin mit dem Zeigegerät auf eine andere Zeit
   ziehen (Tagesansicht, langer Druck am Finger). Erwartung: Die Vorschau
   nennt ein Fenster von 60 Minuten, und der Termin landet dort.

### 3. Bestandstermin mit abweichender Länge

Der Seed enthält keinen solchen Termin — dafür einen von Hand anlegen:

```bash
psql "$DATABASE_URL" -c "update public.appointments
  set ends_at = starts_at + interval '45 minutes'
  where id = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001'"
```

1. Diesen Termin öffnen → **Bearbeiten**. Erwartung: Das Ende zeigt die
   **45 Minuten** an, nicht 60 — die Anwendung verlängert ihn nicht von
   selbst (§8.1, „Bestehende Termine werden nicht rückwirkend verändert").
   Darunter steht ein Hinweis mit dem Knopf **Auf 60 Minuten setzen**.
2. Nur die behandelnde Person wechseln und speichern. Erwartung: Das geht
   durch; die Länge bleibt 45 Minuten.
3. Erneut bearbeiten, nur den Beginn verschieben und speichern. Erwartung:
   Auch das geht durch, das Ende zieht mit 45 Minuten mit.
4. Erneut bearbeiten, **Auf 60 Minuten setzen** klicken und speichern.
   Erwartung: Der Termin steht danach auf 60 Minuten, der Hinweis ist weg.

### 4. Am Handy (~375 px)

```bash
pnpm screenshots --breite=375 --konto=office /patienten
```

Dann in der Akte „Termin anlegen" öffnen. Erwartung: Beginn und abgeleitetes
Ende stehen untereinander, kein waagerechtes Scrollen, das Zeitfeld ist mit
einem Daumen erreichbar.

**Zielwert:** Ein Termin entsteht mit **einer** Zeiteingabe statt zweien.

---

## CAL-007 — Terminserie aus einer Verordnung

Ziel: Aus einer Verordnung entsteht in **einem** Vorgang eine Terminserie.
Der Seed enthält dafür eine frische Folgeverordnung für Erika Beispiel
(10× Krankengymnastik, nichts genutzt).

### 1. Einstieg und Kontingent

1. Als `olivia.office@praxis.invalid` anmelden, Akte **Erika Beispiel**
   öffnen, Abschnitt „Verordnungen".
2. An der Folgeverordnung vom 08.09.2026 steht **Terminserie anlegen**.
   Erwartung: Der Link erscheint auch für `anna.beispiel@praxis.invalid`
   (therapist), aber für kein Patientenkonto.
3. Draufklicken. Erwartung: Die Seite zeigt **Verordnet 10 · Genutzt 0 ·
   Bereits verplant 0 · Offen 10** und die Frequenz „2x pro Woche"; im Feld
   „Anzahl Termine" steht **10**.

### 2. Vorschlag und Einzelabweichung

1. Behandelnde Person **Anna Beispiel**, Terminart **Hausbesuch**, erster
   Termin auf einen Montag in vier Wochen, Beginn **09:00**, Rhythmus
   **Zweimal pro Woche**, Anzahl **10**. → **Termine vorschlagen**.
2. Erwartung: Zehn Zeilen, abwechselnd Montag und Donnerstag, jeweils
   „bis 10:00 Uhr", darunter **„Alle 10 Termine sind planbar."**
3. Bei einer Zeile das Datum auf einen Tag ändern, an dem Anna schon einen
   Termin um 09:00 hat. Erwartung: Sofort der Hinweis **„Die Liste wurde
   geändert und ist noch nicht geprüft."**, und „10 Termine anlegen" ist
   nicht anklickbar.
4. **Erneut prüfen**. Erwartung: An dieser Zeile steht **„Zeitraum ist
   bereits belegt"**, darunter „1 von 10 Terminen sind so nicht planbar."
5. Die Zeile mit **Entfernen** herausnehmen → erneut prüfen. Erwartung:
   „Alle 9 Termine sind planbar.", der Knopf heißt jetzt „9 Termine anlegen".

### 3. Anlegen — alles oder nichts

1. **9 Termine anlegen**. Liegt ein Termin außerhalb der Arbeitszeit, kommt
   zuerst die Rückfrage „Serie trotzdem anlegen" — ohne sie wird nichts
   angelegt.
2. Erwartung: Rücksprung in die Akte; unter „Nächste Termine" stehen die
   ersten Termine der Serie, jeder **Bestätigt**.
3. Im Kalender (Tagesansicht, Anna) an einem der Serientage nachsehen:
   der Termin steht dort mit **60 Minuten**.
4. Zurück auf die Serienseite. Erwartung: **Bereits verplant 9 · Offen 1**;
   „Genutzt" steht weiter auf 0 — verplant ist nicht genutzt (ANN-038).
5. Einen Termin der Serie absagen (mit Grund) und die Serienseite neu laden.
   Erwartung: **Bereits verplant 8 · Offen 2** — eine Absage gibt ihren Platz
   im Kontingent wieder frei.
6. Gegenprobe „alles oder nichts": eine neue Serie über zwei Termine planen,
   von denen einer auf einen bereits belegten Zeitraum fällt, die Prüfung
   ignorieren und über die Adresszeile neu laden — der Knopf bleibt gesperrt.
   Es entsteht kein einziger Termin.

### 4. Am Handy (~375 px)

```bash
pnpm screenshots --breite=375 --konto=office /patienten
```

Dann in der Akte „Terminserie anlegen" öffnen. Erwartung: Kein waagerechtes
Scrollen; Datum, Beginn und „Entfernen" jeder Zeile brechen untereinander um
und sind mit einem Daumen erreichbar; jedes Tippziel mindestens 44 px.

**Zielwert:** Zehn Termine aus einer Verordnung in **unter einer Minute**,
statt zehnmal das Terminformular.

---

## CAL-011 — Terminzettel zum Ausdrucken

Ein Blatt für die Patient:in: „Ihre nächsten Termine". Es verlässt die Praxis,
deshalb zählt hier vor allem, was **nicht** darauf steht (ANN-039).

### 1. Einstieg und Inhalt

1. Als `olivia.office@praxis.invalid` anmelden, Akte **Erika Beispiel** öffnen
   (nach CAL-007 hat sie eine Serie). Abschnitt **Nächste Termine**.
2. Erwartung: Rechts neben der Überschrift steht **Termine mitteilen** — und
   zwar nur, wenn es überhaupt einen künftigen Termin gibt.
3. Draufklicken. Erwartung: Die Seite heißt **„Ihre nächsten Termine"** und
   ist an die Patient:in gerichtet; darunter ihr Name und je Termin Datum,
   Uhrzeit, Ort und behandelnde Person.
4. Gegenprobe Inhalt: Auf dem Zettel steht **kein** Status („Bestätigt"),
   **keine** Verordnung, **keine** Diagnose und bei einem Hausbesuch **keine
   Adresse** — dort steht „bei Ihnen zu Hause".
5. Einen Termin der Person absagen und den Zettel neu laden. Erwartung: Der
   abgesagte Termin fehlt.

### 2. Druck

1. **Terminzettel drucken** klicken (oder Strg/Cmd + P). Erwartung in der
   Druckvorschau: Kopfzeile, Navigation, der Zurück-Link und alle
   Schaltflächen fehlen; die Terminliste steht auf weißem Grund; ein Termin
   wird nicht über zwei Seiten zerrissen.
2. Erwartung: **Keine Wortmarke** auf dem Ausdruck — das ist so gewollt
   (`marke/README.md`); auf der Rechnung kommt sie mit ABR-000.

### 3. Kein SMS- und kein Messenger-Weg

Erwartung: Es gibt auf der Seite **keinen** Knopf für SMS oder Messenger.
Messenger ist nach B15 ausgeschlossen, SMS gibt es nicht. Der E-Mail-Weg
kommt mit CAL-013 und ist ein Handoff, kein Versand aus der Anwendung.

### 4. Am Handy (~375 px)

```bash
pnpm screenshots --breite=375 --konto=office /patienten
```

Dann in der Akte **Termine mitteilen** öffnen. Erwartung: Kein waagerechtes
Scrollen, die Liste bleibt lesbar, „Terminzettel drucken" ist mit einem Daumen
erreichbar.

**Zielwert:** Der Zettel entsteht mit **zwei** Taps aus der Akte, statt von
Hand geschrieben zu werden.

---

## CAL-012 — Mitteilungsvermerk am Termin

Vorbild ist die Terminliste von iPrax: Ein Zeichen hinter dem Termin sagt, ob
er der Patient:in schon mitgeteilt wurde und auf welchem Weg.

> **Die Auswahl am Termin ist die Nachhut.** Druck und E-Mail aus der
> Anwendung vermerken sich seit CAL-012 und CAL-013 von selbst; hier trägt man
> nach, was die Anwendung nicht sehen kann — das Gespräch am Tresen, den
> Anruf — und nimmt einen Vermerk zurück (ANN-040, ANN-041).

### 1. Vermerken und sehen

1. Als `olivia.office@praxis.invalid` anmelden, Akte **Max Mustermann**,
   Abschnitt **Nächste Termine**. Erwartung: Am heutigen 09:00-Termin steht
   aus dem Seed bereits das Zeichen **Telefon**; an den übrigen steht keins.
2. Einen Termin ohne Zeichen öffnen. Unten steht **Mitteilung an die
   Patient:in** mit vier Kästchen und dem Satz, dass hier von Hand
   nachgetragen und zurückgenommen wird.
3. **Telefonisch mitgeteilt** anhaken. Erwartung: „Vermerk speichern" wird
   anklickbar — vorher nicht.
4. Speichern. Erwartung: **Vermerk gespeichert.** Neu laden (F5): das Häkchen
   steht weiterhin.
5. Zurück in die Akte. Erwartung: Hinter dem Termin steht **Telefon**.
6. Zwei Wege gleichzeitig anhaken (etwa Telefon und E-Mail) und speichern.
   Erwartung: In der Akte stehen **beide** Zeichen nebeneinander.

### 2. Der Vermerk verfällt mit einer Änderung

1. Denselben Termin **bearbeiten** und den Beginn verschieben, speichern.
2. Zurück in die Akte. Erwartung: **Das Zeichen ist weg.** Die neue Zeit ist
   noch nicht mitgeteilt — genau das soll der leere Platz sagen.
3. Am Termin nachsehen: die Kästchen sind wieder leer.

### 3. Zurücknehmen

1. Einen Weg anhaken, speichern, danach das Häkchen wieder entfernen und
   erneut speichern. Erwartung: **Vermerk zurückgenommen.**, und in der Akte
   steht kein Zeichen mehr. Das ist der Fall „der Drucker ging nicht".

### 4. Terminzettel drucken vermerkt mit

1. In der Akte **Termine mitteilen** öffnen. Unter dem Knopf steht, dass die
   aufgeführten Termine dabei als ausgehändigt vermerkt werden.
2. **Terminzettel drucken** klicken und den Druckdialog abbrechen.
3. Zurück in die Akte. Erwartung: **Alle** aufgeführten Termine tragen jetzt
   das Zeichen **Zettel**.

### 5. Auditlog

Als `jannes.test@praxis.invalid` unter **Organisatorisches → Sicherheit**
nachsehen. Erwartung: Einträge **„Mitteilung an die Patient:in vermerkt"** —
je Termin einer, mit den Wegen im Kontext und ohne Inhalt.

### 6. Am Handy (~375 px)

```bash
pnpm screenshots --breite=375 --konto=office /patienten
```

Dann Akte → Termin öffnen. Erwartung: Die vier Kästchen stehen untereinander,
jedes Tippziel mindestens 44 px, kein waagerechtes Scrollen; in der Terminliste
brechen die Zeichen unter die Terminzeile um, statt sie zu quetschen.

**Zielwert:** „Ist dieser Termin schon mitgeteilt?" ist in der Akte **ohne
Klick** beantwortet.

---

## CAL-013 — Termine per E-Mail

Dieselbe Liste wie auf dem Zettel, aber als fertige Nachricht im
Mailprogramm. Der Weg ist am 2026-09-12 mit dem Nachtrag zu B15 dazugekommen.

> **Die Anwendung verschickt nichts selbst.** Sie öffnet den Entwurf in
> **Ihrem** Mailprogramm; gesendet wird dort von Ihnen. Es gibt keinen
> Dienstleister, keinen automatischen Versand und keine Massenaussendung
> (ANN-041).

### 1. Entwurf ansehen

1. Als `olivia.office@praxis.invalid` anmelden, Akte **Max Mustermann**,
   **Termine mitteilen** öffnen.
2. Unter dem Druckknopf steht **Termine per E-Mail senden**. Klicken.
3. Erwartung: Ein Kasten mit **An** (die hinterlegte Adresse), **Betreff**
   („Ihre nächsten Termine" — er nennt weder Praxis noch Fach) und dem
   **vollständigen Text**: Anrede, je Termin Datum, Uhrzeit, Ort und
   behandelnde Person, Schlusssatz zur rechtzeitigen Absage.
4. Gegenprobe Inhalt: Im Text steht **kein** Status, **keine** Verordnung,
   **keine** Diagnose und bei einem Hausbesuch **keine Adresse**.
5. Erwartung: Darunter der Hinweis, dass eine E-Mail **nicht verschlüsselt**
   ist und der Weg den **ausdrücklichen Wunsch** der Patient:in voraussetzt.

### 2. Übergabe und Vermerk

1. **E-Mail öffnen** klicken. Erwartung: Das Mailprogramm des Rechners öffnet
   einen Entwurf mit genau diesem Text — **nicht gesendet**.
2. In der Anwendung steht: Die E-Mail ist im Mailprogramm geöffnet und die
   Termine sind vermerkt; wenn Sie sie doch nicht senden, nehmen Sie den
   Vermerk am Termin zurück.
3. Den Entwurf im Mailprogramm **verwerfen** — nichts geht hinaus.
4. Zurück in die Akte. Erwartung: Alle Termine, die im Entwurf standen, tragen
   jetzt das Zeichen **E-Mail**.
5. Einen davon öffnen, **Per E-Mail mitgeteilt** abwählen, speichern.
   Erwartung: **Vermerk zurückgenommen.** — genau der Fall aus Schritt 3.

### 3. Abbrechen vermerkt nichts

1. Erneut **Termine per E-Mail senden**, dann **Abbrechen**. Erwartung: Der
   Kasten verschwindet, kein Mailprogramm, und in der Akte ändert sich kein
   Zeichen.

### 4. Ohne Adresse kein Weg

1. Akte einer Person **ohne hinterlegte E-Mail-Adresse** öffnen (im Seed etwa
   der dritte Patient) und **Termine mitteilen** aufrufen.
2. Erwartung: **Kein** Knopf für E-Mail, stattdessen der Satz, dass die
   Adresse fehlt und in den Stammdaten unter „Kontakt" steht.

### 5. Auditlog

Als `jannes.test@praxis.invalid` unter **Organisatorisches → Sicherheit**
nachsehen. Erwartung: Je Termin ein Eintrag **„Mitteilung an die Patient:in
vermerkt"**, im Kontext der Weg `email` — **kein Nachrichtentext**, keine
Adresse.

### 6. Am Handy (~375 px)

```bash
pnpm screenshots --breite=375 --konto=office /patienten
```

Dann Akte → **Termine mitteilen** → **Termine per E-Mail senden**. Erwartung:
Kein waagerechtes Scrollen, der Text bleibt lesbar, „E-Mail öffnen" und
„Abbrechen" sind beide mit einem Daumen erreichbar.

**Zielwert:** Die Termine gehen mit **drei** Taps als fertige Nachricht
hinaus, und in der Akte steht danach ohne Zutun, dass sie mitgeteilt sind.
---

## AKTE-000 bis AKTE-005: Die Patientenakte als Arbeitsplatz

Vorbedingung: angemeldet, eine Akte mit mindestens einer laufenden Verordnung
und einigen Terminen (im Seed **Max Mustermann**, für die Verordnungen auch
**Erika Beispiel**).

### 1. Der Kopf trägt, was zählt — und bleibt stehen

1. Akte öffnen. Erwartung oben: **Name**, **Geburtsdatum mit Alter**, das
   Abzeichen **In Versorgung** und die beiden Wege **Termin anlegen** und
   **Verordnung erfassen**. Keine Anschrift, keine Telefonnummern.
2. Nacheinander **Termine**, **Verordnungen**, **Behandlungsverlauf**,
   **Stammdaten** anwählen. Erwartung: Der Kopf bleibt unverändert stehen, nur
   der Inhalt darunter wechselt; die Adresse in der Zeile ändert sich mit.
3. Als `jannes.test@praxis.invalid` unter **Organisatorisches → Sicherheit**
   nachsehen. Erwartung: **Ein** Eintrag „Patientenakte geöffnet" für den
   ganzen Durchgang — nicht einer je Bereich.

### 2. Termine mit Historie

1. Bereich **Termine**. Erwartung: **Kommende Termine** und darunter
   **Vergangene Termine**, neueste zuerst — einschließlich **abgesagter**
   Termine mit ihrem Abzeichen.
2. Gibt es mehr als zwanzig vergangene Termine: **Ältere Termine anzeigen**
   lädt die nächste Seite nach.
3. **Im Kalender zeigen** antippen. Erwartung: Der Kalender öffnet den Tag des
   nächsten Termins, zeigt **nur** die Termine dieser Person und sagt das über
   dem Gitter; **Filter aufheben** bringt die übrigen zurück, **Zur Akte**
   führt zurück.

### 3. Verordnung und Termine finden einander

1. Bereich **Verordnungen** einer Person mit Serienterminen (Seed: Erika
   Beispiel). Erwartung an einer laufenden Verordnung **drei getrennte
   Zahlen**: **Leistungseinheiten** (aus den Positionen), **Termine**
   (zugeordnet und bevorstehend) und **Noch planbar**.
2. **Termine dieser Verordnung** antippen. Erwartung: die Terminliste, gefiltert,
   mit dem Hinweis „Nur die Termine einer Verordnung." und dem Weg zurück.
3. In der ungefilterten Terminliste trägt jeder Serientermin den Rückweg
   **Verordnung vom …**.
4. Eine **ausgeschöpfte** Verordnung steht unter „Ausgeschöpfte Verordnungen"
   als **eine Zeile** und klappt auf Wunsch auf. Erwartung: **kein**
   „Terminserie anlegen" daran — dort ist nichts mehr zu planen.

### 4. Stammdaten zuletzt

1. Bereich **Stammdaten**. Erwartung: Person, Kontakt, Hausbesuch und
   Versorgung — und **ganz unten** der Abschnitt **Verwaltung** mit
   „Als inaktiv markieren" und „Versorgung abschließen".
2. **Stammdaten bearbeiten**, den Ort ändern, speichern. Erwartung: zurück in
   den **Stammdaten**, der neue Wert steht da.

### 5. Am Handy (~375 px)

```bash
pnpm screenshots --breite=375 --konto=office /patienten
```

Dann die Akte öffnen. Erwartung: Der Kopf trägt beide Aktionen **nebeneinander**
in einer Zeile, die Bereichsleiste lässt sich waagerecht wischen, und die
Ausschnitte stehen gestapelt untereinander. Kein waagerechtes Scrollen der
Seite.

**Zielwert:** Was mit dieser Person zu tun ist, steht **ohne Scrollen** im
Bild; alles Seltene ist genau einen Tap entfernt.

---

## UX-012: Die Bedienabläufe zwischen den Bereichen

Eigener Auftrag von Jannes, nicht aus der Roadmap: nicht ein neuer Bereich,
sondern die Wege **zwischen** den vorhandenen. Vorbedingung: angemeldet, Seed
eingespielt.

### 1. Vom Termin in die Akte und zurück

1. Kalender öffnen, eine **Wochenansicht** einstellen, auf einen Tag blättern
   und einen Termin öffnen. Erwartung im Kopf: „Termin – **Name**", der Name
   ist ein Weg in die Akte.
2. Den Namen antippen. Erwartung: die Akte dieser Person.
3. Im Browser zurück, dann **Zurück zum Kalender** antippen. Erwartung:
   **dieselbe** Woche, **derselbe** Tag, **dieselbe** behandelnde Person —
   nicht die Vorgabeansicht von heute.
4. Dasselbe aus der **Patientensuche** heraus: suchen, Treffer öffnen,
   zurückgehen. Erwartung: Die Liste steht wieder da, wo sie war.

### 2. Anlegen aus dem laufenden Vorgang

1. Im Kalender auf eine **freie Stelle** tippen → **Termin anlegen**. Datum,
   Zeit und Person stehen oben.
2. Nach einer Person suchen, die es nicht gibt. Erwartung: der Hinweis
   **„Noch nicht in der Kartei? Patient:in anlegen"** samt der Zusage, dass
   Datum, Zeit und Person erhalten bleiben.
3. Den Weg gehen, die Person anlegen. Erwartung: Es geht **direkt** ins
   Terminformular dieser Person weiter — mit **unveränderter** Vorbelegung.
   Kein zweites „jetzt noch auswählen".
4. Denselben Weg mit **Abbrechen** beenden. Erwartung: zurück in die
   Terminanlage, Vorbelegung erhalten, **kein** neuer Datensatz.

### 3. Fehlende Adresse aus dem Formular ergänzen

1. Eine Person ohne vollständige Anschrift wählen, Termin anlegen,
   Terminart **Hausbesuch**. Erwartung: die Meldung samt Weg **„Jetzt in den
   Stammdaten ergänzen"**.
2. Den Weg gehen, Straße, Hausnummer, PLZ und Ort eintragen, speichern.
   Erwartung: zurück im **Terminformular**, die Adresse steht jetzt da, die
   übrigen Angaben sind unverändert.

### 4. Kontext und Benennung

1. Aus einer Akte **Verordnung erfassen**. Erwartung unter der Überschrift:
   **„Für <Name>."** — und der Rückweg heißt **Zurück zu den Verordnungen**.
2. Einen Termin öffnen, der abgeschlossen werden kann. Erwartung: **zwei**
   unterscheidbare Wege — **Dokumentieren und abschließen** und **Ohne
   Dokumentation abschließen**.
3. **Organisatorisches → Mitarbeitende** → eine Person öffnen. Erwartung:
   Telefonnummern wählen, E-Mail schreiben (je ein Weg, kein blosser Text) und
   — bei behandelnden Personen — **Woche im Kalender** und **Arbeitszeiten**.
   Beim Office fehlen die beiden Planungswege.

### 5. Formularfehler stehen oben und führen ins Feld

1. **Patienten → Neue:r Patient:in**, ohne eine Eingabe auf **Patient anlegen**
   tippen. Erwartung: ein roter Kasten **über** den Feldern, „Bitte prüfen Sie
   diese Angaben", darunter je Fehler eine Zeile **Feldname: Meldung**.
2. Eine Zeile antippen. Erwartung: Das genannte Feld bekommt den **Fokus** und
   rollt **mittig** ins Bild; die Meldung steht weiterhin auch am Feld.
3. Dasselbe nur mit der **Tastatur**: Nach dem Absenden liegt der Fokus im
   Kasten, ein Tabulator erreicht den ersten Eintrag, die **Eingabetaste**
   springt ins Feld.
4. Ein genanntes Feld ausfüllen. Erwartung: Der Eintrag verschwindet aus dem
   Kasten; der Kasten selbst verschwindet, sobald nichts mehr offen ist.
5. Als **Office** eine:n Mitarbeiter:in anlegen und leer absenden. Erwartung:
   Der Kasten nennt **keine** Privatangabe — der Abschnitt steht für diese
   Rolle gar nicht auf der Seite.

### 6. Suche: Fehler ist nicht „kein Treffer"

1. In der Patientensuche einen Namen eingeben, der sicher nicht existiert.
   Erwartung: **„Kein Treffer."**
2. Die Netzwerkverbindung trennen (Entwicklerwerkzeuge → Offline) und erneut
   suchen. Erwartung: eine **andere** Meldung, die von einem **Fehler** spricht
   — nicht „Kein Treffer".

### 7. Terminserie: die Prüfung gehört zum Vorschlag

1. Aus einer Verordnung eine **Terminserie** vorschlagen lassen und prüfen.
2. Einen der vorgeschlagenen Termine **ändern**. Erwartung: Das alte
   Prüfergebnis gilt nicht mehr — es wird neu geprüft, bevor angelegt werden
   kann.
3. Die Serie anlegen. Erwartung: In der Akte stehen die neuen Termine
   **sofort** — in der Übersicht, in der Terminliste und in den Zahlen der
   Verordnung. Kein Neuladen nötig.

### 8. Vorbereiten ist noch kein Mitteilen

1. An einem Termin **Terminzettel** öffnen und drucken. Erwartung: Der Vermerk
   wird **nicht** von selbst gesetzt; stattdessen fragt die Seite **„Wurde der
   Zettel ausgehändigt?"** mit **Ja, als mitgeteilt vermerken** und **Nein,
   nichts vermerken**.
2. **Nein** wählen. Erwartung: kein Vermerk am Termin.
3. Denselben Weg über **Termine mailen** gehen, das Mailprogramm öffnen und
   **Ja** wählen. Erwartung: Der Termin trägt den Mitteilungsvermerk.

### 9. Am Handy (~375 px)

```bash
pnpm screenshots --breite=375 --konto=office /patienten/neu
```

Erwartung: Der Fehlerkasten füllt die Breite, jede Zeile ist mindestens 44 px
hoch und mit dem Daumen zu treffen; kein waagerechtes Scrollen.

**Zielwert:** Kein Weg endet in einer Sackgasse. Wer abbiegt, kommt dorthin
zurück, wo er war — mit allem, was er schon eingegeben hatte.

---

## UI-002: Lesbarkeit — weiße Rahmen und eine Akte ohne Umweg

Rückmeldung von Jannes am 12.09.2026 an der laufenden Anwendung.
Vorbedingung: angemeldet als `office` oder `therapist`, im Seed
**Max Mustermann**.

### 1. Die Akte öffnet dort, wo gearbeitet wird (UI-002a)

1. Aus der Patientenliste eine Akte öffnen. Erwartung: Es erscheinen sofort
   die **Termine** — kein Zwischenschritt, keine Schaltfläche „Übersicht" in
   der Bereichsleiste. Die Adresse in der Zeile endet auf `/termine`.
2. In der Bereichsleiste stehen genau vier Ziele: **Termine**,
   **Verordnungen**, **Behandlungsverlauf**, **Stammdaten**.
3. Aus dem **Kalender** heraus über einen Termin in die Akte gehen und
   **Zurück** antippen. Erwartung: Der Kalender steht wieder so da, wie er
   war — der Rückweg überlebt das Weiterleiten in den Terminbereich.

### 2. Was vor der Tür zählt, steht im Kopf (UI-002a)

1. Bei **Max Mustermann** unter **Stammdaten** einen **Zugangshinweis**
   eintragen („Klingel defekt, bitte anrufen") und speichern.
2. Zurück in die Akte. Erwartung: Im Kopf steht unter dem Namen
   **Zugang: Klingel defekt, bitte anrufen** — sichtbar in **jedem** Bereich,
   nicht nur in den Stammdaten.
3. Den Hinweis wieder leeren. Erwartung: Die Zeile verschwindet; der Kopf
   bleibt so kompakt wie vorher. Keine leere Beschriftung.

### 3. Wichtiges steht auf Weiß (UI-002b, UI-002c)

1. Eine Akte im Bereich **Termine** öffnen. Erwartung: Kopf und Terminlisten
   stehen in **weißen Rahmen** auf der getönten Fläche; die Trennlinien liegen
   **zwischen** den Zeilen, nicht über der ersten.
2. Dasselbe prüfen auf der **Startseite** („Tagesplan des Teams"), in der
   **Patientenliste**, bei **Verordner:innen**, bei **Mitarbeitenden**, im
   **Behandlungsverlauf**, in den **Stammdaten** und am **Termin** selbst.
3. Gegenprobe — was bewusst **nicht** weiß ist: die Filterleiste über einer
   Terminliste, die Legende unter dem Kalender, Rückfragen wie „Wurde der
   Zettel ausgehändigt?" und die Kennzeichnung eines Vorschaubereichs. Sie
   erklären den Inhalt, sie sind keiner, und bleiben deshalb vertieft.
4. Ein **Formular** öffnen (Termin anlegen). Erwartung: Die Felder sind weiß
   und an ihrer **Umrandung** als Feld erkennbar — kein zusätzlicher weißer
   Kasten um das Formular herum.

### 4. Der zweite Faktor sagt, was er kann (UI-002d)

1. **Mein Konto → Zweiter Faktor**. Erwartung: Vor dem Einrichten steht, dass
   die Anmeldung den zweiten Faktor **derzeit noch nicht abfragt** und wann
   sich das ändert.
2. Abmelden und neu anmelden. Erwartung: Es wird kein Code verlangt — genau
   das, was der Hinweis ankündigt.

### 5. Am Handy (~375 px)

```bash
pnpm screenshots --breite=375 --konto=office /patienten /
```

Erwartung: Die weißen Rahmen füllen die Breite bis auf den Seitenrand, kein
waagerechtes Scrollen, jede Zeile mindestens 44 px hoch.

**Zielwert:** Wer auf eine Seite schaut, sieht auf den ersten Blick, was Inhalt
ist und was ihn erklärt — ohne lesen zu müssen.

---

## FIX-EPIC-003 — Ungespeicherte Dokumentation überlebt einen Seitenwechsel

Prüfschritte zu FIX-010 (Data Router) und FIX-011 (Navigationsschutz).
Grundlage: `PROJECT_PRINCIPLES.md` §13 und ANN-046.

Alles als `anna.beispiel@praxis.invalid` (therapist).

### 1. Das Hauptmenü nimmt den Text nicht mit

1. Einen Termin öffnen, „Dokumentation anlegen", einen Satz tippen —
   **nicht** speichern.
2. In der Seitenleiste (am Handy: in der Leiste unten) einen anderen Bereich
   antippen, etwa „Patient:innen".
3. Erwartung: Die Seite wechselt **nicht**. Stattdessen erscheint der Kasten
   „Ungespeicherte Dokumentation" mit drei Schaltflächen, und die Tastatur
   steht auf der ersten davon.
4. „Hier bleiben": Der Text steht unverändert im Feld, der Kasten ist fort.

### 2. Dieselbe Frage beim Patientenwechsel und beim Zurück

1. Wieder mit ungespeichertem Text: oben über die Suche eine andere Patient:in
   auswählen. Erwartung: derselbe Kasten.
2. „Hier bleiben", dann den **Zurück-Knopf des Browsers** drücken. Erwartung:
   derselbe Kasten, die Adresszeile bleibt auf der Dokumentation.

### 3. Speichern geht erst nach dem Speichern weiter

1. Mit ungespeichertem Text ins Hauptmenü, dann „Speichern und weitergehen".
2. Erwartung: Die Schaltfläche zeigt „Wird gespeichert …", danach erscheint
   das gewählte Ziel.
3. Zurück zum Termin: Der Eintrag steht dort als **Entwurf** — ausdrücklich
   **nicht** finalisiert und der Termin **nicht** abgeschlossen.
4. Gegenprobe auf „Behandlung abschließen": Text tippen, Hauptmenü,
   „Speichern und weitergehen". Erwartung: Der Termin bleibt `bestätigt`, die
   Dokumentation bleibt Entwurf.

### 4. Ein Fehlschlag nimmt weder Text noch Seite mit

1. Mit ungespeichertem Text die Netzverbindung des Rechners trennen
   (Flugmodus, WLAN aus).
2. Ins Hauptmenü tippen, „Speichern und weitergehen".
3. Erwartung: Die Seite bleibt stehen, der Text steht im Feld, und im Kasten
   steht die Fehlermeldung mit dem Zusatz, dass die Seite geöffnet bleibt. Die
   drei Schaltflächen stehen weiter zur Wahl.
4. Verbindung zurück, erneut „Speichern und weitergehen": Jetzt geht es
   weiter.

### 5. Keine Frage ohne Anlass

1. Eine Dokumentation öffnen und **nichts** ändern. Ins Hauptmenü tippen.
   Erwartung: kein Kasten, die Seite wechselt sofort.
2. Text tippen, „Als Entwurf speichern". Erwartung: kein Kasten — der eigene
   Rückweg zum Termin läuft durch.
3. In der Dokumentation auf „Bausteine verwalten →" tippen (mit
   ungespeichertem Text). Erwartung: Kasten. Ohne Text: kein Kasten.

### 6. Korrektur und Nachtrag

1. Einen finalisierten Eintrag öffnen, „Korrigieren", Text ändern, ins
   Hauptmenü tippen. Erwartung: Der Kasten bietet **nur** „Verwerfen und
   weitergehen" und „Hier bleiben" und erklärt, dass eine Korrektur mit dem
   Absenden Bestandteil der Akte wird.
2. Dasselbe beim **Nachtrag**. Erwartung: Hier steht „Speichern und
   weitergehen" wieder zur Verfügung — der Nachtrag beginnt als Entwurf.

### 7. Fenster schließen und neu laden

1. Mit ungespeichertem Text F5 drücken beziehungsweise den Tab schließen.
2. Erwartung: Der Browser fragt mit **seinem eigenen** Text nach. Den Wortlaut
   bestimmt der Browser; die Anwendung kann ihn nicht setzen.

### 8. Am Handy (~375 px)

```bash
pnpm screenshots --breite=375 --konto=therapist /termine/<id>/dokumentation
```

Erwartung: Der Kasten passt in die Breite, alle drei Schaltflächen sind
erreichbar und mindestens 44 px hoch, kein waagerechtes Scrollen.

**Bekannte Grenze (ANN-046):** „Abmelden" ist keine Navigation. Wer mit
ungespeichertem Text abmeldet, verliert ihn weiterhin.

---

## CAL-014 — Absage unter 24 Stunden

Prüfschritte zu CAL-014b (Datenbank) und CAL-014c (Oberfläche). Grundlage:
`PROJECT_PRINCIPLES.md` 0.8 §8, ADR-018 Fassung 2 Punkt 8, ANN-047 und
ANN-048.

> **Wichtig für diese Abnahme:** Maßgeblich ist der **Eingang** der Absage,
> nicht der Zeitpunkt der Eingabe. Für die Fälle unter der Frist braucht es
> deshalb entweder einen Termin am selben oder am nächsten Tag oder einen
> nachgetragenen Eingang.

Alles als `olivia.office@praxis.invalid` (office).

### 1. Die Rückfrage fragt nach dem Eingang

1. Einen bestätigten Termin **in einigen Tagen** öffnen → **Termin absagen**.
2. Erwartung: Unter dem Absagegrund steht **„Wann ist die Absage
   eingegangen?"** mit **„Gerade eben"** vorbelegt, darunter ein Satz, dass
   die Frist der Server rechnet und genau 24 Stunden außerhalb der Regel
   liegen.
3. „Patient:in hat abgesagt" wählen und bestätigen. Erwartung: Status
   **Abgesagt**, Zeile **Absage eingegangen** mit dem heutigen Zeitpunkt,
   **keine** Zeile „Gebühr vorgemerkt" — der Termin lag mehr als 24 Stunden
   entfernt.

### 2. Unter der Frist entsteht ein Gebührenanlass

1. Einen Termin für **morgen zu einer Uhrzeit, die weniger als 24 Stunden
   entfernt ist**, anlegen (liegt der Termin morgen früher als jetzt, ist er
   unter der Frist).
2. Absagen mit Grund **„Patient:in hat abgesagt"**, Eingang **„Gerade eben"**.
3. Erwartung: Zeile **Gebühr vorgemerkt: Absage weniger als 24 Stunden
   vorher** und darunter der Satz, dass **Höhe und Abrechnung noch ausstehen**
   — es steht **kein Betrag** da.
4. Neu laden. Erwartung: beides steht weiterhin da.

### 3. Die Praxis sagt ab — nie eine Gebühr

1. Denselben Fall wie in Schritt 2, aber mit Grund **„Praxis hat abgesagt"**.
2. Erwartung: Status **Abgesagt**, **keine** Zeile „Gebühr vorgemerkt".
3. Dasselbe mit **„Termin verlegt"** und **„Sonstiger Grund"**: ebenfalls keine
   Gebühr (ANN-047 — widersprich hier, wenn das im Alltag anders gemeint ist).

### 4. Nachträgliche Erfassung

1. Einen Termin **morgen** anlegen und absagen — diesmal **„Früher – jetzt
   erst eingetragen"** wählen.
2. Erwartung: Es erscheinen **Datum des Eingangs** und **Uhrzeit**. Das Datum
   lässt sich nicht in die Zukunft setzen.
3. Nur das Datum ausfüllen und bestätigen. Erwartung: **„Bitte Datum und
   Uhrzeit des Eingangs angeben."**, nichts passiert.
4. Datum **vorgestern**, Uhrzeit **19:30**, bestätigen. Erwartung: Zeile
   **Absage eingegangen: vorgestern, 19:30 Uhr** und **keine** Gebühr — der
   Eingang lag mehr als 24 Stunden vor dem Termin, obwohl die Eingabe heute
   passiert.
5. Gegenprobe: derselbe Ablauf mit einem Eingang **heute**, wenn der Termin
   morgen näher als 24 Stunden liegt. Erwartung: **Gebühr vorgemerkt**.

### 5. Die Grenze selbst

Die Sekunden-Genauigkeit prüft `supabase/tests/cancellation-notice.test.ts`
(genau 24 Stunden ⇒ **keine** Gebühr, eine Sekunde darunter ⇒ Gebühr, über die
Zeitumstellung hinweg). Von Hand genügt ein Fall knapp auf jeder Seite.

### 6. Nichts wird nachträglich umgedeutet

1. Einen **vor** dieser Änderung abgesagten Termin öffnen (im Seed gibt es
   einen). Erwartung: Zeile **Absage eingegangen** fehlt, **keine** Gebühr,
   der Absagegrund steht wie bisher.
2. Ein Termin, dessen Zeit ohne Zutun vorbeigegangen ist, steht weiterhin auf
   **Bestätigt** — weder abgesagt noch „nicht angetroffen".

### 7. Am Handy (~375 px)

```bash
pnpm screenshots --breite=375 --konto=office /termine/<id>
```

Erwartung: Die Rückfrage mit Grund, Eingangsauswahl und den beiden Feldern
passt in die Breite, kein waagerechtes Scrollen, jedes Feld mindestens 44 px
hoch.

---

## CAL-015 — Der Kalender als vollständiger Arbeitsablauf

Prüfschritte zu CAL-015b (Datenbank) und CAL-015c (Oberfläche). Grundlage:
`PROJECT_PRINCIPLES.md` 0.9 §8.1, ANN-049 und ANN-050.

Alles als `olivia.office@praxis.invalid` (office), sofern nicht anders
genannt.

### 1. 60 oder 45 Minuten — und nichts dazwischen

1. **Patient:innen → Max Mustermann → Termine → Termin anlegen.** Erwartung:
   Neben dem Beginn steht **Dauer** mit **60 Minuten** vorbelegt und darunter
   das abgeleitete Ende.
2. Beginn **09:05** eintragen. Erwartung: „Ende: 10:05 Uhr".
3. Dauer auf **45 Minuten** stellen. Erwartung: „Ende: 09:50 Uhr". Anlegen.
4. Den Termin öffnen → **Bearbeiten**. Erwartung: Die Dauer steht auf 45, die
   Auswahl bietet genau **zwei** Werte an.
5. Verschieben (Beginn ändern) ohne die Dauer anzufassen. Erwartung: Das Ende
   wandert mit, die Länge bleibt 45.

### 2. Ereignis eintragen

1. **Kalender → Tagesansicht → „Ereignis eintragen".**
2. Erwartung: Das Formular fragt nach **Bezeichnung**, **beteiligten
   Personen** (Ankreuzfelder, auch Olivia Office steht dabei), Ort, Datum,
   **Beginn und Ende**. Keine Patient:in, keine Verordnung, keine Dauerwahl.
3. „Teambesprechung", **Anna Beispiel** und die eigene Person ankreuzen,
   Standort wählen, **08:00 bis 08:25** eintragen — eine Länge, die ein
   Behandlungstermin nicht haben dürfte. Eintragen.
4. Erwartung: zurück im Kalender, und die Besprechung steht **in beiden
   Spalten**.
5. Gegenprobe Raster: noch einmal, diesmal mit Ende **08:22**. Erwartung: Die
   Meldung sagt, dass Beginn und Ende auf dem Praxisraster liegen müssen; es
   wird nichts eingetragen.

### 3. Ein Ereignis ist keine Behandlung

1. Die Besprechung im Kalender antippen. Erwartung: Überschrift **„Ereignis –
   Teambesprechung"**, Zeile **Ereignis**, **kein** Weg in eine Akte.
2. Erwartung: **Kein** „Dokumentieren und abschließen", **kein** „Termin
   abschließen", **kein** „Nicht angetroffen", **kein** „Folgetermin anlegen",
   **kein** Abschnitt Behandlungsdokumentation und **keine** Mitteilungswege.
3. Erwartung: **„Bearbeiten"** und **„Termin absagen"** gibt es.
4. Gegenprobe Belegung: Für **Anna Beispiel** einen Behandlungstermin zur
   selben Zeit anlegen. Erwartung: „In diesem Zeitraum hat die behandelnde
   Person bereits einen Termin."
5. Gegenprobe „Tag umplanen": In der Tagesansicht mit Personenfilter auf Anna
   **Tag umplanen** ausführen. Erwartung: Die Behandlungstermine sind abgesagt,
   die **Besprechung steht noch**.

### 4. Von der Verordnung in den Kalender und zurück

1. **Patient:innen → Max Mustermann → Verordnungen.** An einer offenen
   Verordnung steht neben „Terminserie anlegen" jetzt **„Im Kalender einen
   Platz suchen"**.
2. Antippen. Erwartung: Die **Tagesansicht** öffnet sich, über dem Gitter
   steht die Leiste „Nur die Termine von Max Mustermann", und in der Adresse
   stehen `patient=` **und** `verordnung=` — als Kennungen, ohne Namen.
3. Vor- und zurückblättern, scrollen, eine **freie Stelle antippen**.
4. Erwartung: Das Terminformular **dieser Person** öffnet sich, Datum und
   Beginn stehen schon, und es wird **nicht** nach der Patient:in gefragt.
5. **Abbrechen**. Erwartung: zurück im Kalender, an derselben Stelle, mit
   demselben Filter.
6. Noch einmal, diesmal anlegen. Danach **Akte → Verordnungen**: Der Termin
   zählt bei dieser Verordnung als **verplant** (die genutzte Menge bleibt
   unverändert — verplant ist nicht genutzt, ANN-038).
7. Gegenprobe Filter: In der Leiste **„Filter aufheben"**. Erwartung: Der
   Kalender zeigt wieder alles; der Weg über die freie Stelle führt jetzt
   wieder in die Patientensuche.

### 5. Ein Ereignis kostet nichts (CAL-016)

Die Abgrenzung, an der es um Geld geht: Ein Ereignis des Praxisbetriebs darf
unter keinen Umständen eine Ausfallgebühr auslösen — es gibt keine Patient:in,
die absagen könnte.

1. Die Besprechung öffnen → **„Termin absagen"**. Erwartung in der Rückfrage:
   Der Satz nennt die **Bezeichnung** und keinen leeren Namen; die Auswahl
   **Absagegrund** bietet **„Patient:in hat abgesagt" nicht** an; es gibt
   **keine** Frage „Wann ist die Absage eingegangen?"; unten steht, dass ein
   Ereignis **keine Ausfallgebühr** auslöst.
2. Mit „Praxis hat abgesagt" absagen. Erwartung: Am abgesagten Ereignis steht
   **keine** Zeile „Gebühr vorgemerkt".
3. **Tag umplanen** (Tagesansicht mit Personenfilter → „Tag umplanen"):
   Erwartung: In der Auswahl **Absagegrund** fehlt „Patient:in hat abgesagt"
   auch hier — der Ausfall einer behandelnden Person ist praxisbedingt.
4. Eine noch stehende Besprechung an demselben Tag: Sie steht **nicht** in der
   Liste „Diese Termine werden abgesagt" und taucht danach **nicht** in der
   Anrufliste auf.

### 6. Die Besprechung steht auch im eigenen Tagesplan (CAL-016)

1. Als `anna.beispiel@praxis.invalid` (therapist) die **Übersicht** öffnen an
   einem Tag, an dem eine Besprechung eingetragen ist.
2. Erwartung: Die Besprechung steht in der **eigenen Tagesliste** oben — mit
   ihrer Bezeichnung, ohne Namen, ohne Anschrift, und der Weg heißt
   **„Ereignis öffnen"**.
3. Erwartung: Die Zahl der **offenen** Punkte über der Liste zählt sie
   **nicht** mit — an einem Ereignis ist nichts zu erledigen.
4. Erwartung: Dieselbe Besprechung steht auch im **Tagesplan des Teams**
   darunter. Beide Listen zeigen denselben Tag.

### 7. Ein Teamereignis ist ein Vorgang (CAL-017)

Die Abgrenzung, um die es hier geht: Eine Besprechung, die bei einer Person um
9 und bei einer anderen um 10 steht, darf es nicht geben.

1. **Kalender → „Ereignis eintragen"**: „Teambesprechung", **Anna Beispiel**
   **und** Tim Teamleitung ankreuzen, Standort, 10:00 bis 10:25. Eintragen.
2. Erwartung: Die Besprechung steht in **beiden** Spalten.
3. Eine der beiden Kacheln antippen. Erwartung: Die Zeile **Beteiligte** nennt
   beide Namen und sagt, dass Bezeichnung, Zeit und Ort für alle gelten. Oben
   stehen **zwei** Wege: „Ereignis bearbeiten" und „Teilnahme ändern".
4. **„Ereignis bearbeiten"**: Bezeichnung auf „Fallbesprechung", Beginn auf
   11:00, Ende auf 11:25. Speichern. Erwartung: Zurück am Ereignis stehen der
   neue Name und die neue Zeit — und im Kalender sind **beide** Kacheln
   gewandert und heißen beide neu.
5. Gegenprobe Konflikt: Für **Tim** einen Behandlungstermin um 12:00 anlegen.
   Dann das Ereignis auf 12:00 verschieben wollen. Erwartung: Die Meldung sagt,
   dass mindestens eine beteiligte Person schon einen Termin hat, und es wurde
   **nichts** geändert — auch nicht die Zeile von Anna.
6. Gegenprobe Teilnahme: Am Ereignis **„Nur diese Teilnahme absagen"** mit
   „Praxis hat abgesagt". Erwartung: Diese eine Zeile ist abgesagt, die andere
   steht weiter. Bei den Beteiligten steht die abgesagte mit Kennzeichen.
7. **„Ereignis absagen"** an der verbliebenen Zeile: Erwartung — in der
   Auswahl fehlt „Patient:in hat abgesagt", nach der Bestätigung sind alle
   offenen Teilnahmen abgesagt und **keine** trägt „Gebühr vorgemerkt".

### 8. Konsistenz nach einer Änderung

1. Einen Termin im Kalender per **Ziehen** verschieben.
2. Ohne Neuladen prüfen: **Übersicht** (Tagesplan des Teams) und **Akte →
   Termine** zeigen die neue Zeit.
3. Die Besprechung aus Schritt 2 absagen. Erwartung: Sie verschwindet aus der
   Standardansicht des Kalenders (Filter „aktive") und steht mit dem Filter
   „abgesagt" wieder da.

### 9. Am Handy (~375 px)

```bash
pnpm screenshots --breite=375 --konto=office /termine/ereignis /kalender
```

Erwartung: Das Ereignisformular mit seinen Ankreuzfeldern passt in die Breite,
kein waagerechtes Scrollen, jede Zeile mindestens 44 px hoch.

**Zielwert:** Ein ganzer Planungsvorgang — Person wählen, Lücke suchen, Termin
anlegen — ohne die Anwendung zu verlassen und ohne dieselbe Angabe zweimal zu
machen.

## ROL-EPIC-001 — Office liest klinische Inhalte

Prüfschritte zu ROL-001 bis ROL-003. Grundlage: E15, `PROJECT_PRINCIPLES.md`
0.10 §4.3, ADR-004 Fassung 2 und ADR-010. Office liest alles, was
Therapeut:innen sehen — und schreibt davon nichts. Vorher lokal
`pnpm dlx supabase@2.116.0 db reset` (zwei neue Migrationen).

### 1. Als Therapeutin einen Eintrag anlegen

1. Als `anna.beispiel@praxis.invalid` anmelden. **Patient:innen → Max
   Mustermann → Termine**, einen Termin öffnen (oder über „Termin anlegen"
   einen anlegen), „Dokumentation anlegen", einen kurzen synthetischen Text
   eintragen, speichern und **Finalisieren**.

### 2. Office liest die Dokumentation

1. Abmelden, als `olivia.office@praxis.invalid` anmelden, dieselbe Akte →
   **Behandlungsverlauf**. Erwartung: Der Abschnitt heißt
   „Behandlungsdokumentation" und zeigt den Text aus Schritt 1 samt
   Verfasserin — ein „Behandlungsnachweis" steht dort nicht mehr.
2. Am Eintrag „Änderungsverlauf" tippen. Erwartung: Version 1 mit Inhalt.
3. Zurück, „Zum Termin". Erwartung: Der Eintrag steht am Termin — **ohne**
   „Dokumentation bearbeiten", „Finalisieren", „Korrigieren" und „Nachtrag".

### 3. Office liest Verordnung und Dateien

1. Dieselbe Akte → **Verordnungen**. Erwartung: Die laufende Verordnung zeigt
   **Diagnose** und Therapieziel, darunter „Scan des Rezepts" — **ohne** Feld
   zum Hinzufügen und ohne „Bearbeiten".
2. **Dateien**. Erwartung: Auch klinische Dateien stehen da und lassen sich
   öffnen. „Löschen" nur an Einwilligung und Vertrag, „Art korrigieren" an
   keiner Datei; zum Hinzufügen stehen nur Einwilligung und Vertrag zur Wahl.

### 4. Jeder Zugriff steht im Auditlog

1. Abmelden, als `jannes.test@praxis.invalid` anmelden, Auditansicht
   (`/praxis/sicherheit/audit`), Benutzer „Olivia Office". Erwartung: je
   gelesenem Eintrag `treatment_note.viewed`, für den Verlauf
   `treatment_note.history_viewed`, je Verordnung `prescription.viewed` und
   je geöffneter Datei `patient_file.link_issued` — ohne Inhalte.

### 5. Am Handy (~375 px)

```bash
pnpm screenshots --breite=375 --konto=office /patienten/66666666-6666-4666-8666-000000000001/verlauf /patienten/66666666-6666-4666-8666-000000000001/verordnungen
```

Erwartung: kein waagerechtes Scrollen, keine Konsolenfehler.

**Nicht Teil dieses Loops:** eine Office-Sicht auf Patientenkommunikation —
gebaut ist keine; der Teamchat ist eine Vorschau ohne Patientenbezug.

## CAL-018 — Die drei Hausbesuch-Szenarien

Prüfschritte zu CAL-018a (Datenbank) und CAL-018b (Oberfläche). Grundlage:
`PROJECT_PRINCIPLES.md` 0.11 §8 („Hausbesuch-Szenarien"), ADR-018 Fassung 3
Punkt 9, E14 und ANN-055.

> **Wichtig für diese Abnahme:** Der geführte Ablauf steht **nur am
> bestätigten Hausbesuchstermin**. Der Seed legt einen an: Berta Bestand
> (`aaaaaaaa-aaaa-4aaa-8aaa-000000000001`), heute 09:00 Uhr bei Anna Beispiel.
> Wer ihn in Schritt 2 vermerkt, öffnet ihn danach wieder, sonst fehlt er den
> folgenden Schritten.

Schritt 1 bis 3 als `anna.beispiel@praxis.invalid` (therapist).

### 1. Der Ablauf führt und nennt zu jedem Fall die Folge

1. Kalender → den Hausbesuch von heute 09:00 Uhr öffnen.
2. Erwartung: Über den Schaltflächen steht der Abschnitt **„Was ist
   passiert?"** mit vier Einträgen in dieser Reihenfolge: „Die Behandlung hat
   stattgefunden", „Tür geöffnet, Behandlung nicht durchgeführt", „Niemand hat
   geöffnet", „Die Patient:in hat vorher abgesagt". Jeder nennt seine Folge;
   nur der letzte hat keine eigene Schaltfläche, sondern verweist auf „Termin
   absagen".
3. Erwartung: „Dokumentieren und abschließen" und „Nicht angetroffen" stehen
   **nicht** doppelt in der Reihe darunter. „Ohne Dokumentation abschließen"
   und „Termin absagen" stehen weiterhin dort.

### 2. Niemand angetroffen: ohne Protokoll passiert nichts

1. „Niemand angetroffen" tippen. Erwartung: Die Rückfrage nennt die
   Ausfallgebühr und listet unter **„Protokoll vor Ort"** drei Kästchen:
   „15 Minuten vor Ort gewartet", „An der Tür geklingelt", „Telefonisch
   angerufen" — alle leer.
2. Nur die ersten beiden ankreuzen, „Ja, niemand angetroffen" tippen.
   Erwartung: **„Bitte alle drei Schritte des Protokolls bestätigen."** Der
   Termin bleibt **Bestätigt**, die Rückfrage bleibt offen, das dritte
   Kästchen ist noch da.
3. Das dritte ankreuzen und bestätigen. Erwartung: Status **Nicht
   angetroffen**, Zeile **Protokoll** („Bestätigt: 15 Minuten vor Ort
   gewartet, an der Tür geklingelt, telefonisch angerufen"), Zeile **Gebühr
   vorgemerkt: Nicht angetroffen** — **ohne Betrag**, mit dem Hinweis auf den
   fehlenden Leistungskatalog.
4. „Termin wieder öffnen" tippen. Erwartung: Status **Bestätigt**, die Zeilen
   **Protokoll** und **Gebühr vorgemerkt** sind weg.

### 3. Tür geöffnet: durchgeführt mit Pflichtvermerk, ohne Gebühr

1. Am selben Termin „Ohne Behandlung abschließen" tippen. Erwartung: Die Seite
   heißt **„Ohne Behandlung abschließen"** und trägt über dem Textfeld den
   Vermerk „Tür geöffnet, Behandlung auf Angabe der Patient:in nicht
   durchgeführt" samt Folge (gilt als durchgeführt, normale Abrechnung, keine
   Ausfallgebühr).
2. Einen Satz eintragen und „Ohne Behandlung abschließen" tippen. Erwartung:
   Zurück am Termin steht Status **Dokumentiert**, **keine** Zeile „Gebühr
   vorgemerkt", und die Behandlungsdokumentation trägt das Abzeichen **„Ohne
   Behandlung"** mit dem erklärenden Satz darunter.

### 4. In der Praxis gilt das Protokoll nicht (ANN-055)

1. Als `olivia.office@praxis.invalid` (office) den **Praxistermin** von heute
   bei Jannes Test öffnen → „Nicht angetroffen".
2. Erwartung: Die Rückfrage zeigt **keine** Protokollkästchen und sagt „Eine
   Gebühr entsteht daraus nicht". Nach dem Bestätigen: Status **Nicht
   angetroffen**, **keine** Zeile „Gebühr vorgemerkt", **keine** Zeile
   „Protokoll".

### 5. Am Handy (~375 px)

```bash
pnpm screenshots --breite=375 --konto=therapist /termine/aaaaaaaa-aaaa-4aaa-8aaa-000000000001
```

Erwartung: kein waagerechtes Scrollen, keine Konsolenfehler; die vier Einträge
stehen untereinander, die Schaltflächen sind mit dem Daumen erreichbar.

**Nicht Teil dieses Loops:** Betrag, Rechnung und Steuerkennzeichen der
Ausfallgebühr (ABR-001, ABR-003) sowie Rechnungstext und Rechtsgrundlage für
Fall 1 — die gehen mit Anfrage B4 an die Steuerberatung.
