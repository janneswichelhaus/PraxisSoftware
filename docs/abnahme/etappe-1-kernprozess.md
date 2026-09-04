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
