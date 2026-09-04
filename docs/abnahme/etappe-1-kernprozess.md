# Abnahme: Behandlungsdokumentation

Manuelle Prüfschritte der Loops DOK-001 und DOK-002 (Etappe 1, „Der
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
