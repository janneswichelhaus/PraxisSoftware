# Abnahme — Etappe G: Betriebsreife

Manuelle Prüfschritte der Loops aus Spur A3 (`docs/development/ROADMAP.md`,
Abschnitt „Etappe G"). Voraussetzung und Aufbau: [README.md](README.md).

**Für diese Etappe zusätzlich nötig:** der volle Supabase-Stack mit
Anmeldedienst und Mailfänger. `pnpm dlx supabase start`, dann liegt der
Mailfänger unter <http://127.0.0.1:54324>. Ohne ihn sind die Schritte mit
Einladungs- und Kennwortmails nicht durchführbar — in der
Cloud-Entwicklungsumgebung greifen dort `pnpm test:db` und die
Komponententests.

---

## STAFF-002a — Wer darf Mitarbeiterdaten pflegen

**Was geprüft wird:** dass die Dreiteilung aus E10 in der Oberfläche ankommt —
und dass das Praxismanagement die Privatanschrift einer Kollegin weder sieht
noch versehentlich löscht.

1. **Office darf pflegen.** Als `olivia.office@praxis.invalid` anmelden, Praxis
   → Team öffnen. Die Schaltfläche „Mitarbeiter:in anlegen" ist da. Auf „Anna
   Beispiel" tippen: „Stammdaten bearbeiten" wird angeboten.
2. **Aber nicht alles.** Auf demselben Datensatz gibt es **keine** Schaltfläche
   „Als inaktiv führen" und **keinen** Abschnitt „Zugang". Beides bleibt bei der
   Praxisinhaberin.
3. **Privat bleibt privat.** „Stammdaten bearbeiten" öffnen: Es gibt die
   Abschnitte „Person" und „Dienstlich", **keinen** Abschnitt „Privat".
   Stattdessen steht dort der Satz, dass die Privatangaben ausschließlich die
   Praxisinhaberin pflegt.
4. **Der entscheidende Schritt.** Diensttelefon ändern und speichern.
5. **Nichts verloren.** Abmelden, als `jannes.test@praxis.invalid` anmelden,
   denselben Datensatz öffnen: Das neue Diensttelefon steht da — und der
   Abschnitt „Privat" trägt unverändert Geburtsdatum, private E-Mail und
   Adresse. Genau das wäre ohne ANN-022 gelöscht worden.
6. **Therapie pflegt nicht.** Als `anna.beispiel@praxis.invalid` anmelden,
   Praxis → Team: Die Liste ist lesbar, „Mitarbeiter:in anlegen" fehlt, und auf
   einem Datensatz gibt es weder „Stammdaten bearbeiten" noch „Zugang". Dasselbe
   gilt für `tim.teamleitung@praxis.invalid`.
7. **Am Handy.** Schritt 3 bei ~375 px Breite wiederholen: Das Formular ist
   ohne waagerechtes Scrollen bedienbar, „Änderungen speichern" mit dem Daumen
   erreichbar.

## STAFF-002b — Zugang einladen und annehmen

**Was geprüft wird:** dass ein Zugang vollständig in der Anwendung entsteht —
und dass ein Konto ohne Einladung nichts sieht.

Ausgangslage: **Nina Neu** steht im Seed als Mitarbeiterin **ohne** Zugang.
Nach einer Änderung an `supabase/seed.sql` zuerst `pnpm dlx supabase db reset`.

1. **Nur die Praxisinhaberin.** Als `jannes.test@praxis.invalid` anmelden,
   Praxis → Team → „Nina Neu": Es gibt den Abschnitt „Zugang" mit einem
   Einladungsformular. Die E-Mail-Adresse ist aus der dienstlichen Adresse
   vorbelegt, **keine** Rolle ist angekreuzt.
2. **Ohne Rolle geht es nicht.** Direkt auf „Zugang einladen" tippen: Es
   erscheint „Bitte mindestens eine Rolle wählen." Nichts wurde gesendet.
3. **Einladen.** „Therapeut:in" ankreuzen, „Zugang einladen". Der Abschnitt
   zeigt jetzt die Adresse, die vorgesehene Rolle, „Offen bis <Datum>"
   (14 Tage) und den Kasten „Nächster Schritt".
4. **Im Auditlog.** Betrieb → Sicherheit: Es steht „Zugang eingeladen" mit
   Bezug auf den Mitarbeiterdatensatz — und die E-Mail-Adresse steht **nicht**
   darin.
5. **Das Konto beim Anmeldedienst anlegen.** Das ist der manuelle Schritt aus
   ANN-023: Die Praxisplattform legt bewusst keine Konten an, weil die
   Selbstregistrierung abgeschaltet ist. In Supabase Studio
   (<http://127.0.0.1:54323>) → Authentication → Users → „Add user" →
   „Send invitation" für `nina.neu@praxis.invalid`. Zur Gegenprobe vorher in
   der Anwendung auf „Anmeldemail senden" tippen: Es erscheint der Hinweis,
   dass es noch kein Konto gibt — **keine** Fehlermeldung, und die Einladung
   bleibt offen.
6. **Die Mail ist da.** <http://127.0.0.1:54324> öffnen: Es liegt eine Mail an
   `nina.neu@praxis.invalid` mit einem Anmeldelink.
7. **Annehmen.** In einem privaten Fenster den Link aus der Mail öffnen und ein
   Kennwort setzen. Es erscheint „Zugang einrichten". Auf „Einladung annehmen"
   tippen: Die Anwendung öffnet sich als Nina Neu.
8. **Die Rolle wirkt.** Als Nina ist Praxis → Team lesbar, „Mitarbeiter:in
   anlegen" fehlt (kein `office`), und unter „Mein Tag" steht ihr eigener Tag.
9. **Der Nachweis.** Zurück als `jannes.test@praxis.invalid`: Der Abschnitt
   „Zugang" bei Nina zeigt jetzt „Eingerichtet" und die Rolle. Im Auditlog steht
   zusätzlich „Einladung angenommen" — mit **Nina** als handelnder Person, nicht
   mit Jannes.
10. **Jetzt ist sie einplanbar.** Kalender → Termin anlegen: „Nina Neu" steht in
    der Auswahl der behandelnden Personen. Vorher stand sie dort nicht.
11. **Ein Konto ohne Einladung bleibt leer.** In Supabase Studio ein Konto für
    eine Adresse anlegen, zu der **keine** Einladung existiert, und sich damit
    anmelden: Es erscheint „Zugang einrichten", und „Einladung annehmen" meldet
    „Für diesen Zugang liegt keine offene Einladung vor." — ohne Auskunft
    darüber, ob es die Adresse in der Praxis gibt. Das Konto sieht nichts.
12. **Zurücknehmen.** Als Jannes unter „Mitarbeiter:in anlegen" eine weitere
    Person anlegen und einladen, dann „Einladung zurücknehmen" und bestätigen.
    Der Abschnitt zeigt wieder das Formular; im Auditlog steht „Einladung
    zurückgenommen".
13. **Am Handy.** Schritt 1 bis 3 bei ~375 px Breite: Die Rollenliste ist ohne
    waagerechtes Scrollen bedienbar, jedes Kontrollkästchen samt Beschriftung
    ist mindestens 44 px hoch antippbar.

## STAFF-002c und STAFF-003 — Rollen, Sperre, Kennwort zurücksetzen

**Was geprüft wird:** dass die Praxisleitung einen bestehenden Zugang steuern
kann — und dass sie sich dabei nicht selbst aussperrt.

1. **Rollen ändern.** Als `jannes.test@praxis.invalid` → Praxis → Team → „Anna
   Beispiel" → Abschnitt „Zugang". Die Kästchen zeigen den aktuellen Stand;
   „Rollen speichern" ist grau, solange nichts geändert ist.
2. **Teamleitung dazu.** „Teamleitung" ankreuzen, speichern. Im Auditlog steht
   „Rollen geändert".
3. **Es wirkt sofort.** In einem privaten Fenster als Anna anmelden: Der
   Dienstplan unter Praxis → Planung ist jetzt bearbeitbar.
4. **Verwerfen funktioniert.** Ein Kästchen ändern, „Verwerfen": Der alte Stand
   steht wieder da, ohne dass etwas gespeichert wurde.
5. **Keine leere Rolle.** Alle Kästchen abwählen: „Rollen speichern" ist grau,
   und darunter steht, dass ein Zugang mindestens eine Rolle braucht.
6. **Der Aussperrschutz.** Auf dem eigenen Datensatz („Jannes Test") das
   Kästchen „Praxisinhaber" abwählen und speichern: Es erscheint die Erklärung,
   dass die letzte aktive Praxisinhaberin ihre Rolle behält. Nichts wurde
   geändert.
7. **Nicht selbst sperren.** Auf demselben Datensatz „Zugang sperren" →
   „Sperren": Es erscheint „Der eigene Zugang lässt sich nicht sperren."
8. **Sperren.** Bei „Anna Beispiel" „Zugang sperren" → „Sperren". Der Abschnitt
   zeigt „Gesperrt".
9. **Die Sperre greift wirklich.** Im privaten Fenster die Seite neu laden (Anna
   ist dort noch angemeldet): Es erscheint „Dieser Zugang ist gesperrt." — keine
   leere Anwendung, keine Patientenliste.
10. **Der Beschäftigungsstatus bleibt.** Auf demselben Datensatz steht unter
    „Dienstlich" weiterhin „Beschäftigung: Aktiv". Sperre und Beschäftigung sind
    getrennt.
11. **Entsperren.** „Zugang entsperren" → „Entsperren". Anna kommt nach einem
    Neuladen wieder hinein. Im Auditlog stehen „Zugang gesperrt" und „Zugang
    entsperrt" getrennt.
12. **Kennwort zurücksetzen.** Bei Anna „Kennwort zurücksetzen" → „Mail
    senden". Im Mailfänger (<http://127.0.0.1:54324>) liegt eine Mail an Anna;
    im Auditlog steht „Kennwort zurücksetzen angestoßen" — **ohne** die Adresse.
    Annas bisheriges Kennwort funktioniert weiterhin.

## STAFF-004 — Selbstbedienung: Kennwort, zweiter Faktor, Sitzungen

**Was geprüft wird:** dass jede Person ihr Konto ohne die Praxisleitung
absichern kann — und dass „alle Sitzungen beenden" wirklich alle meint.

1. **Der Weg dorthin.** Als `anna.beispiel@praxis.invalid` anmelden. Oben rechts
   steht der eigene Name als Link; er führt auf „Mein Konto". Auf dem Telefon
   heißt er „Konto".
2. **Kennwort vergessen, ohne Konto-Orakel.** Abmelden. Auf der Anmeldemaske
   eine **erfundene** Adresse eintippen und „Kennwort vergessen?" → „Link
   anfordern": Die Bestätigung lautet „Falls für diese Adresse ein Zugang
   besteht …" — sie verrät nicht, ob es das Konto gibt. Dieselbe Meldung
   erscheint für eine echte Adresse.
3. **Der Link führt zum Ziel.** Für `anna.beispiel@praxis.invalid` anfordern, im
   Mailfänger den Link öffnen: Die Anwendung öffnet „Mein Konto".
4. **Zu kurz geht nicht.** Dort ein Kennwort mit 8 Zeichen eingeben: „Das
   Kennwort braucht mindestens 12 Zeichen."
5. **Zwei gleiche Eingaben.** Zwei verschiedene Eingaben: „Die beiden Eingaben
   stimmen nicht überein."
6. **Ändern.** Ein langes Kennwort zweimal eingeben, „Kennwort ändern": Die
   Bestätigung sagt zugleich, dass angemeldete Geräte angemeldet bleiben. Im
   Auditlog steht „Eigenes Kennwort geändert" — ohne Kennwort.
7. **Zweiter Faktor.** „Zweiten Faktor einrichten": Ein QR-Code erscheint, dazu
   die Zeichenfolge zum Abtippen. Mit einer Authenticator-App scannen, den
   sechsstelligen Code eintragen, „Einrichtung abschließen".
8. **Ein falscher Code wird abgewiesen.** Vorher einmal `000000` eintragen: „Der
   Code wurde nicht angenommen."
9. **Er wirkt.** Abmelden und neu anmelden: Nach dem Kennwort fragt die
   Anmeldung nach dem Einmalkennwort.
10. **Der Hinweis für die Leitung.** Als `jannes.test@praxis.invalid` → „Mein
    Konto": Solange dort kein zweiter Faktor eingerichtet ist, steht der gelbe
    Hinweis, dass dieser Zugang Zugänge, Rollen und das Auditlog verwaltet. Bei
    `olivia.office@praxis.invalid` steht derselbe Stand **ohne** Warnton.
11. **Alle Sitzungen beenden.** Als Anna in zwei Fenstern anmelden. In einem
    „Alle Sitzungen beenden" → „Überall abmelden". Beide Fenster zeigen nach
    einem Neuladen die Anmeldemaske. Im Auditlog steht „Alle eigenen Sitzungen
    beendet".
12. **Kein Weg zu fremden Rechten.** Auf „Mein Konto" gibt es weder eine
    Rollenwahl noch „Zugang sperren" — auch nicht für `jannes.test`. Das eigene
    Konto ändert seine Berechtigungen nicht.
13. **Am Handy.** Schritte 1, 6 und 7 bei ~375 px Breite: Kennwortfelder, der
    QR-Code und die Rückfragen sind ohne waagerechtes Scrollen bedienbar.
