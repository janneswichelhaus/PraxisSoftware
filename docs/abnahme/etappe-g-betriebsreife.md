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
   Adresse. Genau das wäre ohne ANN-024 gelöscht worden.
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
   ANN-025: Die Praxisplattform legt bewusst keine Konten an, weil die
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
   anlegen" fehlt (kein `office`), und unter „Übersicht" steht ihr eigener Tag.
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
   Mailfänger den Link öffnen: Die Anwendung öffnet „Neues Kennwort setzen".
   **Wichtig: in einem privaten Fenster, also abgemeldet.** Im angemeldeten
   Browser sagt dieser Schritt nichts aus — dort öffnet jede Adresse der
   Anwendung. Genau daran ist der Befund aus FIX-001 monatelang vorbeigelaufen.
   Der vollständige Ablauf steht unten unter FIX-EPIC-001.
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
9. **Er wirkt — noch nicht.** ~~Abmelden und neu anmelden: Nach dem Kennwort
   fragt die Anmeldung nach dem Einmalkennwort.~~ **Dieser Schritt beschreibt
   Verhalten, das es nicht gibt** (Befund vom 2026-09-12). Die Anmeldemaske
   ruft ausschließlich `signInWithPassword`; in `src/features/auth/` und
   `src/app/` gibt es keinen Treffer für `mfa`, `aal` oder `challenge`. Ein
   eingerichteter zweiter Faktor wird beim Anmelden **nie abgefragt** und
   schützt damit heute nichts. Zu prüfen ist deshalb nur, dass die Einrichtung
   selbst funktioniert (Schritte 7 und 8). Die Abfrage beim Anmelden ist ein
   eigenes Epic und steht als Vorschlag im Bericht zu FIX-EPIC-001.
10. **Der Hinweis für die Leitung.** Als `jannes.test@praxis.invalid` → „Mein
    Konto": Solange dort kein zweiter Faktor eingerichtet ist, steht der gelbe
    Hinweis, dass dieser Zugang Zugänge, Rollen und das Auditlog verwaltet. Bei
    `olivia.office@praxis.invalid` steht derselbe Stand **ohne** Warnton.
11. **Alle Sitzungen beenden.** Als Anna in zwei Fenstern anmelden. In einem
    „Alle Sitzungen beenden" → „Überall abmelden". Das **auslösende** Fenster
    zeigt nach einem Neuladen die Anmeldemaske. Im Auditlog steht „Alle eigenen
    Sitzungen beendet".

    Das **zweite** Fenster kann bis zu einer Stunde weiterarbeiten — sein
    Zugriffstoken bleibt bis zum Ablauf gültig, es kann sich nur nicht mehr
    verlängern (ANN-044). Das ist kein Fehler, sondern die Bauart des
    Anmeldedienstes, und die Rückfrage sagt es auch. Wer sofortige Wirkung
    braucht, prüft stattdessen Schritt 8 aus STAFF-003: Nach dem Sperren des
    Zugangs zeigt das zweite Fenster beim nächsten Laden „Dieser Zugang ist
    gesperrt." — **das** wirkt ohne Wartezeit.

12. **Kein Weg zu fremden Rechten.** Auf „Mein Konto" gibt es weder eine
    Rollenwahl noch „Zugang sperren" — auch nicht für `jannes.test`. Das eigene
    Konto ändert seine Berechtigungen nicht.
13. **Am Handy.** Schritte 1, 6 und 7 bei ~375 px Breite: Kennwortfelder, der
    QR-Code und die Rückfragen sind ohne waagerechtes Scrollen bedienbar.

## FIX-EPIC-001 — Zugang und Sitzung halten, was sie versprechen

**Was geprüft wird:** dass ein Link aus einer Mail tatsächlich ankommt, dass
kein Konto die Daten des vorigen zu sehen bekommt und dass die Oberfläche über
die Reichweite ihrer Vorgänge die Wahrheit sagt.

Diese Schritte brauchen den vollen Stack (Docker, GoTrue, Mailfänger). In der
Cloud-Entwicklungsumgebung sind sie **nicht** durchführbar — dort greifen die
Komponententests und `tests/e2e/login.spec.ts`.

**Vorbereitung, einmalig:** `pnpm dlx supabase stop && pnpm dlx supabase start`.
Die Mailvorlagen unter `supabase/templates/` und die Ziele in
`additional_redirect_urls` werden nur beim Start gelesen — ohne Neustart prüfen
Sie den alten Stand.

### Kennwort vergessen, vollständig

1. **Abgemeldet beginnen.** Ein privates Fenster öffnen. Das ist kein Beiwerk:
   Im angemeldeten Browser öffnet jede Adresse, und der Schritt sagt nichts aus.
2. **Anfordern.** Auf der Anmeldemaske „Kennwort vergessen?" →
   `anna.beispiel@praxis.invalid` → „Link anfordern".
3. **Die Mail ansehen.** Im Mailfänger (<http://127.0.0.1:54324>) liegt eine
   Mail mit dem Betreff „Neues Kennwort setzen". Der Link zeigt auf
   `/kennwort-neu?token_hash=…&type=recovery` — **nicht** auf `/auth/v1/verify`
   und **nicht** auf `/mein-konto`. Steht dort etwas anderes, wurde die Vorlage
   nicht geladen: Stack neu starten.
4. **Öffnen.** Der Link führt auf „Neues Kennwort setzen". Kurz steht „Der Link
   wird geprüft …", dann erscheint das Formular. **Bleibt die Seite im
   Ladezustand stehen, ist der Fehler aus FIX-001b zurück** — dann melden.
5. **Zu kurz geht nicht.** Acht Zeichen eingeben: „Das Kennwort braucht
   mindestens 12 Zeichen."
6. **Zwei gleiche Eingaben.** Zwei verschiedene: „Die beiden Eingaben stimmen
   nicht überein."
7. **Setzen.** Ein langes Kennwort zweimal, „Kennwort setzen": Die Bestätigung
   sagt, dass Sie auf diesem Gerät angemeldet sind und andere Geräte angemeldet
   bleiben. „Weiter zu ‚Mein Konto'" führt in die Anwendung.
8. **Es gilt wirklich.** Abmelden, mit dem **neuen** Kennwort anmelden. Im
   Auditlog steht „Eigenes Kennwort geändert" — ohne Kennwort.
9. **Der Link ist verbraucht.** Denselben Link aus der Mail noch einmal öffnen,
   wieder im privaten Fenster: „Dieser Link lässt sich nicht mehr verwenden."
   Kein Formular, und **keine Auskunft darüber, ob es das Konto gibt**.
10. **Ein erfundener Link.** `/kennwort-neu?token_hash=erfunden&type=recovery`
    aufrufen: dieselbe Meldung, wortgleich.
11. **Ohne Kennung.** `/kennwort-neu` ohne Parameter: dieselbe Meldung und der
    Knopf „Zur Anmeldung".
12. **In einem anderen Browser.** Einen frischen Link anfordern und ihn in
    einem **anderen Browser** öffnen (Firefox statt Chrome, nicht nur ein
    privates Fenster). Er muss dort genauso funktionieren.

    Das ist der Kern von ANN-043: Ein anderer Browser hat keinen
    Prüfschlüssel der anfordernden Sitzung — genau daran wäre der PKCE-Weg
    gescheitert, und genau das ist der Praxisfall „angefordert am
    Praxisrechner, geöffnet auf dem Telefon".

    **Das Telefon selbst lässt sich lokal nicht prüfen**, ohne die
    Konfiguration anzufassen: `site_url` und `additional_redirect_urls` in
    `supabase/config.toml` stehen auf `http://127.0.0.1:5173`, und diese
    Adresse erreicht ein Telefon nicht. Wer es dennoch will, setzt beide
    Werte vorübergehend auf die Netzadresse des Rechners, startet den Stack
    neu und den Entwicklungsserver mit `--host` — und stellt danach zurück.
    Der andere Browser prüft dieselbe Eigenschaft ohne diesen Umbau.

13. **Am Telefon bedienbar.** Bei ~375 px: kein waagerechtes Scrollen, beide
    Felder beschriftet, der Knopf mindestens 44 px hoch.

### Die Praxisleitung stößt es an

14. Als `jannes.test@praxis.invalid` → Praxis → Team → „Anna Beispiel" →
    „Kennwort zurücksetzen" → „Mail senden". Die Mail im Mailfänger zeigt
    ebenfalls auf `/kennwort-neu`. Der Ablauf ist derselbe wie oben. Annas
    bisheriges Kennwort funktioniert, bis sie ein neues setzt.

### Die Zugangsmail an eine Einladung

15. Eine Einladung anlegen und „Anmeldemail senden" auslösen. Die Mail trägt
    den Betreff „Zugang zur Praxisanwendung" und zeigt auf
    `/zugang?token_hash=…&type=magiclink`.
16. Im privaten Fenster öffnen: kurz „Der Link wird geprüft …", danach steht
    die Anwendung offen — bei offener Einladung auf „Zugang einrichten", sonst
    auf dem Tagesplan. Es gibt bewusst keine Zwischenseite zum Weiterklicken.
17. Denselben Link erneut öffnen, und zwar in einem **frischen privaten
    Fenster**: „Dieser Link lässt sich nicht mehr verwenden." mit dem Hinweis
    auf die Praxisleitung. In dem Fenster, das den Link gerade benutzt hat,
    besteht inzwischen eine Sitzung — dort kommt stattdessen die Rückfrage aus
    Schritt 18, und der Schritt sagt nichts über den verbrauchten Link.
18. **Nicht stillschweigend die Sitzung tauschen.** Einen frischen Zugangslink
    anfordern und ihn in einem Fenster öffnen, in dem **jemand anderes
    angemeldet** ist. Es erscheint zuerst die Rückfrage „Auf diesem Gerät ist
    bereits jemand angemeldet" mit „Trotzdem mit diesem Link anmelden" und
    „Angemeldet bleiben".

    Beides prüfen: „Angemeldet bleiben" lässt die laufende Sitzung unberührt
    und **löst den Link nicht ein** (er ist danach noch brauchbar).
    „Trotzdem" meldet als die andere Person an. Ohne diese Rückfrage gingen
    nicht gespeicherte Verordnungsentwürfe der laufenden Sitzung verloren,
    ohne dass es jemand merkt. Dasselbe gilt für `/kennwort-neu`.

19. **Ein Verbindungsfehler ist kein verbrauchter Link.** Den Supabase-Stack
    stoppen (`pnpm dlx supabase stop`) und einen Link öffnen: Es erscheint
    „Der Anmeldedienst ist gerade nicht erreichbar." mit dem Satz, dass der
    Link deswegen nicht verbraucht ist, und „Erneut versuchen" — **nicht**
    „Dieser Link lässt sich nicht mehr verwenden." Stack starten, „Erneut
    versuchen": Der Link greift.

### Kein Konto sieht die Daten des vorigen

20. **Der eigentliche Befund.** Als `jannes.test@praxis.invalid` anmelden,
    Patient:innen öffnen, sodass die Liste geladen ist.
21. Auf „Mein Konto" → „Alle Sitzungen beenden" → „Überall abmelden".
22. **Im selben Tab** als `olivia.office@praxis.invalid` anmelden und sofort
    Patient:innen öffnen. Es darf **zu keinem Zeitpunkt** ein Stand zu sehen
    sein, der zu Jannes gehörte — auch nicht für einen Lidschlag, bevor
    nachgeladen ist.
23. Dasselbe mit dem gewöhnlichen Abmelden über die Kopfzeile.
24. Dasselbe mit einer Abmeldung **in einem zweiten Tab**: Tab A zeigt die
    Patientenliste, in Tab B abmelden, in Tab A neu anmelden als jemand
    anderes. Auch hier kein alter Stand.
25. **Der Tagesplan bleibt trotzdem stehen.** Als Therapeut:in anmelden, den
    Tagesplan öffnen, das Gerät in den Flugmodus schalten und die Ansicht neu
    aufrufen: Adresse und Rufnummer stehen weiterhin da (ANN-021). Der Schutz
    aus Schritt 22 darf das nicht kaputtmachen — er greift bei einem Wechsel
    der Person, nicht bei jeder Verlängerung der Sitzung.

### Die Reichweite stimmt

26. **Abmelden meldet nicht überall ab.** Als Anna in zwei Browsern anmelden.
    In Browser A über die Kopfzeile abmelden. Browser B bleibt nach einem
    Neuladen angemeldet (ANN-045). Vorher war das nicht so, und „Mein Konto"
    versprach es trotzdem.
27. **Der Vermerk ist Vorbedingung.** Das lässt sich von Hand kaum auslösen;
    abgedeckt ist es durch `src/features/account/api.test.ts`. Zu prüfen bleibt
    der sichtbare Teil: Die Rückfrage unter „Alle Sitzungen beenden" nennt das
    Restfenster von bis zu einer Stunde und verweist auf die Sperre durch die
    Praxisleitung (ANN-044).
