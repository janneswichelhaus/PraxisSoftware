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

1. **Office darf pflegen.** Als `olivia.office@praxis.invalid` anmelden,
   Organisatorisches → Mitarbeitende öffnen. Die Schaltfläche „Mitarbeiter:in
   anlegen" ist da. Auf „Anna Beispiel" tippen: „Stammdaten bearbeiten" wird angeboten.
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
   Organisatorisches → Mitarbeitende: Die Liste ist lesbar, „Mitarbeiter:in
   anlegen" fehlt, und auf
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
   Organisatorisches → Mitarbeitende → „Nina Neu": Es gibt den Abschnitt
   „Zugang" mit einem
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
8. **Die Rolle wirkt.** Als Nina ist Organisatorisches → Mitarbeitende lesbar,
   „Mitarbeiter:in anlegen" fehlt (kein `office`), und unter „Übersicht" steht
   ihr eigener Tag.
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

1. **Rollen ändern.** Als `jannes.test@praxis.invalid` → Organisatorisches →
   Mitarbeitende → „Anna Beispiel" → Abschnitt „Zugang". Die Kästchen zeigen
   den aktuellen Stand; „Rollen speichern" ist grau, solange nichts geändert
   ist.
2. **Teamleitung dazu.** „Teamleitung" ankreuzen, speichern. Im Auditlog steht
   „Rollen geändert".
3. **Es wirkt sofort.** In einem privaten Fenster als Anna anmelden: Der
   Dienstplan unter Organisatorisches → Arbeitszeiten ist jetzt bearbeitbar.
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
   eigenes Epic (`FIX-EPIC-002`); Jannes hat am 2026-09-12 entschieden, sie
   **erst nach dem Online-Schalten** zu integrieren (ANN-028, Nachtrag).
   **Seit UI-002d sagt die Oberfläche das auch** — siehe Schritt 10.
10. **Der Hinweis für die Leitung.** Als `jannes.test@praxis.invalid` → „Mein
    Konto": Ganz oben im Abschnitt „Zweiter Faktor" steht — unabhängig davon,
    ob einer eingerichtet ist —, dass die Anmeldung ihn **derzeit noch nicht
    abfragt** (UI-002d). Darunter, solange keiner eingerichtet ist, der
    Hinweis, dass dieser Zugang Zugänge, Rollen und das Auditlog verwaltet.
    Bei `olivia.office@praxis.invalid` steht derselbe Stand ohne diesen
    Zusatz.
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

14. Als `jannes.test@praxis.invalid` → Organisatorisches → Mitarbeitende →
    „Anna Beispiel" → „Kennwort zurücksetzen" → „Mail senden". Die Mail im Mailfänger zeigt
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

---

## DAT-001 — Dateien in der Akte: hinzufügen, ansehen, wer sie sieht

**Was geprüft wird:** dass eine Datei nur über den zweiphasigen Weg in die Akte
kommt (ADR-017 Punkt 7), dass die Dokumentart wirklich eine Grenze ist
(Punkt 12; seit ROL-EPIC-001 für die Praxisrollen eine Schreib-, keine
Sichtbarkeitsgrenze mehr) und dass ein Verweis nach einer Minute nicht mehr funktioniert
(Punkt 15) — die drei Zusagen, die man an Tests allein nicht sieht.

**Vorbereitung:** zwei synthetische Dateien anlegen, die keine echten Daten
enthalten — ein beliebiges PDF (etwa eine Rechnung aus dem eigenen Ordner,
umbenannt) und ein Foto. **Keine echten Patientenunterlagen**, auch nicht
zum Ausprobieren (`PROJECT_PRINCIPLES.md` §3.1).

1. **Der Scan gehört zur Verordnung.** Als `jannes.test@praxis.invalid`
   anmelden, Patient:innen → Max Mustermann → **Verordnungen**. Unter der
   laufenden Verordnung steht „Scan des Rezepts" mit „Keine Datei". Die
   Dokumentart steht fest — es gibt **keine** Auswahlliste —, und daneben der
   Satz, dass die Verwaltung sie nicht sieht.
2. **Hinzufügen.** Das PDF wählen. Der Name in der Akte ist vorbelegt und
   änderbar: auf „Rezept Schulter" ändern. „Datei hinzufügen" tippen. Danach
   steht die Datei in der Liste mit Name, Art, Größe, Datum und dem eigenen
   Namen; die Meldung nennt den Namen der Datei.
3. **Öffnen ist ein bewusster Schritt.** „Öffnen" tippen: Ein neues Fenster
   zeigt die Datei beziehungsweise lädt sie herunter. **Der Verweis lebt
   60 Sekunden** — die Adresse aus dem neuen Fenster kopieren, eine Minute
   warten und sie erneut aufrufen: Sie funktioniert nicht mehr. Das ist die
   Zusage aus ADR-017 Punkt 15 und Punkt 17, und sie ist der Grund, warum es
   keinen Teilen-Link gibt. _Auch nach FIX-015:_ Innerhalb der Minute lässt sich
   dieselbe Adresse weiter aufrufen; nur ein **neuer** Verweis braucht ein
   erneutes „Öffnen".
4. **Die Akte kennt die Datei auch.** Bereich **Dateien** öffnen: Der Scan
   steht dort ebenfalls, mit dem Vermerk „Klinisch".
5. **Eine Datei an der Person.** Im Bereich Dateien das Foto wählen, Art
   „Befund", Name „Befund Schulter". Hinzufügen. Der Hinweis unter der Auswahl
   ändert sich mit der Art: bei „Einwilligung" steht dort „auch die
   Verwaltung darf sie hinzufügen und löschen", bei „Befund" „hinzufügen und
   löschen nur Praxisinhaber:in, Therapeut:innen und Teamleitung".
6. **Die Verwaltung sieht das Klinische, pflegt es aber nicht.** _Seit
   ROL-EPIC-001 (E15) geändert — bis dahin sah office hier gar nichts._
   Abmelden, als `olivia.office@praxis.invalid` anmelden, dieselbe Akte,
   Bereich **Dateien**. Scan und Befund stehen dort und lassen sich öffnen;
   „Löschen" gibt es nur an organisatorischen Dateien, „Art korrigieren" an
   keiner. Im Bereich Verordnungen steht „Scan des Rezepts" ohne Feld zum
   Hinzufügen.
   In der Auswahl beim Hinzufügen stehen nur „Einwilligung" und „Vertrag".
7. **Die Verwaltung darf trotzdem etwas beitragen.** Als Olivia eine
   Einwilligung hinzufügen (das PDF genügt). Sie erscheint. Abmelden, als
   Jannes anmelden: Die Einwilligung steht auch dort, mit dem Vermerk
   „Organisatorisch" und Olivias Namen.
8. **Was nicht angenommen wird.** Als Jannes im Bereich Dateien eine Datei
   über 10 MB wählen: Die Meldung nennt die Größe der Datei **und** die
   Grenze, und „Datei hinzufügen" bleibt abgeschaltet. Im Dateidialog werden
   nur PDF, JPEG und PNG angeboten.
   **Bitte hier zusätzlich mit einem iPhone-Foto prüfen** (offene Folgefrage
   aus ADR-017): Kommt es als JPEG an oder als HEIC? Kommt HEIC an, erscheint
   die Meldung mit dem Hinweis auf die Einstellung „Sehr kompatibel" — und
   Jannes sagt bitte Bescheid, ob das im Alltag reicht.
9. **Das Protokoll.** Als Jannes Organisatorisches → Sicherheit öffnen. Für
   jeden Upload steht dort „Datei zur Akte hinzugefügt", für jedes Öffnen
   „Datei zum Öffnen freigegeben". **Im Eintrag steht kein Dateiname** — nur Kennung, Art und
   Zeitpunkt. Das Öffnen des Dateibereichs selbst erzeugt keinen Eintrag; das
   Öffnen der Akte ist bereits protokolliert (ADR-017 Punkt 22).
10. **Am Handy.** Die Schritte 1 bis 3 bei ~375 px Breite wiederholen: kein
    waagerechtes Scrollen, „Öffnen" und „Datei hinzufügen" mit dem Daumen
    erreichbar, das Dateifeld öffnet die Kamera-Auswahl des Geräts.

**Was hier nicht geprüft werden kann:** ob ein gelöschtes Objekt beim Anbieter
tatsächlich verschwindet (OPS-001 Prüfpunkt 3) und ob der Bucket gesichert ist
(OPS-003, ADR-017 Punkt 26). Beides ist Vorbedingung für die erste **echte**
Datei, nicht für diese Abnahme.

---

## DAT-002 — Löschen in zwei Speichern, und der Nachweis dafür

**Was geprüft wird:** dass „gelöscht" zwei Zustände sind — Zeile weg,
Objekt weg — und dass die Anwendung beide auseinanderhält, statt das eine für
das andere auszugeben (ADR-017 Punkt 25).

**Vorbereitung:** DAT-001 durchlaufen; es liegen mindestens zwei Dateien in der
Akte von Max Mustermann.

1. **Löschen fragt nach.** Als `jannes.test@praxis.invalid` in der Akte →
   Dateien auf „Löschen" tippen. Der Kasten sagt zwei Dinge: die Datei ist
   **sofort** aus der Akte, und die abgelegte Fassung wird gelöscht, sobald
   der Löschauftrag ausgeführt ist. „Endgültig löschen" tippen.
2. **Die Akte ist sofort sauber.** Die Datei steht nicht mehr in der Liste —
   auch nicht nach einem Neuladen der Seite.
3. **Der Auftrag steht.** Organisatorisches → **Aufbewahrung**.
   Unter „Offene Löschaufträge" steht eine Zeile mit dem Zeitpunkt und dem
   Vermerk „Datei liegt noch in der Ablage".
4. **Der entscheidende Schritt.** „Alle 1 ausführen und quittieren" tippen.
   Danach steht dort „Nichts offen" und die Meldung „1 Löschung abgeschlossen
   und quittiert". **Das ist keine Behauptung der Oberfläche:** Der Server
   quittiert nur, wenn die Datei tatsächlich weg ist — bliebe sie liegen,
   stünde der Auftrag noch da.
5. **Wer das darf.** Abmelden, als `anna.beispiel@praxis.invalid` anmelden:
   Organisatorisches → Aufbewahrung ist für sie nicht erreichbar. Sie kann
   in der Akte weiterhin löschen — der Auftrag landet dann bei der
   Praxisinhaberin.
6. **Die Art korrigieren.** Als Jannes in der Akte → Dateien bei einer
   organisatorischen Datei auf „Art korrigieren" tippen, „Befund" wählen. Der
   Hinweis wechselt zu „hinzufügen und löschen nur Praxisinhaber:in,
   Therapeut:innen und Teamleitung". „Art übernehmen".
7. **Und die Folge ist echt.** Abmelden, als `olivia.office@praxis.invalid`
   anmelden, dieselbe Akte → Dateien: Die Datei steht weiter da, aber ohne
   „Löschen". _Seit ROL-EPIC-001 (E15)_ ist die Art für die Praxisrollen eine
   Schreibgrenze, keine Sichtbarkeitsgrenze mehr — ein Etikett ist sie
   trotzdem nicht.
8. **Die Verwaltung korrigiert nicht.** Bei Olivia gibt es an keiner Datei
   „Art korrigieren"; an einer organisatorischen Datei gibt es „Löschen".
9. **Das Protokoll.** Als Jannes Organisatorisches → Sicherheit: „Datei gelöscht",
   „Dokumentart einer Datei korrigiert", „Löschung in der Ablage freigegeben"
   (seit FIX-015) und „Löschung in der Ablage quittiert" stehen dort. Auch hier **kein Dateiname und kein Ablageort**.
10. **Am Handy.** Schritt 1 bis 4 bei ~375 px wiederholen: Die Rückfrage passt
    ins Bild, die Schaltflächen sind mit dem Daumen erreichbar, kein
    waagerechtes Scrollen.

**Was hier nicht geprüft werden kann:** ob der Anbieter das Objekt danach
wirklich überall entfernt — Cache, Replikate, seine eigenen Sicherungen. Das
ist Prüfpunkt 3 von OPS-001 und aus der Anwendung heraus nicht feststellbar.

---

## DAT-003 — Abgleich: was in dem einen Speicher steht und im anderen nicht

**Was geprüft wird:** dass die Anwendung merkt, wenn Datenbank und Ablage
auseinanderlaufen — und zwar in beide Richtungen (ADR-017 Punkt 27). Ein
Verlust darf nicht als leere Fläche durchgehen, und ein vergessenes Objekt
nicht liegen bleiben.

**Vorbereitung:** DAT-001 und DAT-002 durchlaufen; mindestens eine Datei liegt
in der Akte von Max Mustermann.

1. **Im Normalfall ist nichts zu tun.** Als `jannes.test@praxis.invalid`
   Organisatorisches → **Aufbewahrung** öffnen. Unter „Abgleich
   der Dateiablage" steht „Beide Speicher sind deckungsgleich".
2. **Einen Verlust herstellen.** Diesen Schritt ausdrücklich nur am lokalen
   Wegwerf-Stack: Supabase Studio unter <http://127.0.0.1:54323> öffnen,
   Storage → Bucket `patientenakte`, die abgelegte Datei dort **von Hand
   löschen**. Die Zeile in der Akte bleibt damit ohne Objekt zurück.
3. **Der Abgleich meldet ihn.** Seite neu laden. Unter „Abgleich der
   Dateiablage" steht jetzt, dass zu einer Datei die abgelegte Fassung fehlt —
   mit Dateiname, Patientenname und dem Link „Akte öffnen". Der Text sagt
   ausdrücklich, dass das **ein Verlust und kein Aufräumfall** ist.
4. **Und die Akte auch.** Über „Akte öffnen" in den Bereich Dateien wechseln:
   Die Zeile trägt die rote Meldung „in der Ablage nicht auffindbar" und
   **bietet kein „Öffnen" an** — statt eines Verweises, der ins Leere liefe.
5. **Ein verwaistes Objekt herstellen.** Zurück in Studio, Storage → Bucket
   `patientenakte`: eine beliebige kleine PDF-Datei **von Hand hochladen**, in
   einen Ordner mit der Organisationskennung (der Pfad, den die vorhandenen
   Objekte zeigen). Dazu gibt es keine Zeile in der Datenbank.
6. **Der Abgleich meldet auch das.** Aufbewahrung neu laden: „1 Objekt in der
   Ablage gehört zu keiner Datei mehr."
7. **Der entscheidende Schritt.** „Zur Löschung vormerken" tippen. Die Meldung
   nennt die Zahl der angelegten Aufträge. Nach oben scrollen: Unter „Offene
   Löschaufträge" steht der neue Auftrag. „Alle ausführen und quittieren"
   tippen — danach ist unter „Abgleich" nur noch der Verlust aus Schritt 3 zu
   sehen. **Es gibt keinen zweiten Löschweg**: Auch ein verwaistes Objekt geht
   durch Auftrag und Quittung.
8. **Wer das sieht.** Abmelden, als `tim.teamleitung@praxis.invalid` anmelden:
   Organisatorisches → Aufbewahrung ist für ihn nicht erreichbar.
9. **Aufräumen.** Als Jannes die Datei aus Schritt 3 in der Akte löschen und
   den Auftrag ausführen; danach steht überall wieder „deckungsgleich".
10. **Am Handy.** Schritt 1 und 6 bei ~375 px: kein waagerechtes Scrollen,
    die Meldungen sind vollständig lesbar, „Zur Löschung vormerken" ist
    erreichbar.

**Was hier bewusst fehlt:** Der Abgleich läuft nicht von allein und meldet sich
nicht. Er wird gerechnet, wenn diese Seite geöffnet wird — die Anwendung
verschickt nichts (CAL-013). Er gehört deshalb in den monatlichen Bericht
(ADR-010 Punkt 6) und auf die Liste nach jeder Wiederherstellung
(ADR-017 Punkt 26).

---

## FIX-015 — Eine Datei verlässt die Ablage nur über den protokollierten Weg

**Was geprüft wird:** dass „Öffnen" und „ausführen und quittieren" weiter
funktionieren und dass jeder Zugriff auf eine Datei eine eigene Zeile im
Protokoll hat (BEF-004, ANN-052). Der eigentliche Umweg — die Storage-API
direkt, mit bekanntem Ablageort — lässt sich nicht klicken; ihn prüfen die
automatischen Tests unten.

**Vorbereitung:** DAT-001 Schritt 1 und 2; in der Akte von Max Mustermann
liegt mindestens eine Datei.

1. **Öffnen wie bisher.** Als `jannes.test@praxis.invalid` in der Akte →
   Dateien „Öffnen" tippen: Die Datei erscheint im neuen Fenster. Das Fenster
   innerhalb der Minute neu laden: Die Datei erscheint wieder — der Verweis
   gilt seine 60 Sekunden.
2. **Zweimal öffnen, zweimal protokolliert.** In der Akte ein zweites Mal
   „Öffnen" tippen. Organisatorisches → Sicherheit: Dort stehen **zwei** neue
   Einträge „Datei zum Öffnen freigegeben".
3. **Die Verwaltung genauso.** Als `olivia.office@praxis.invalid` eine
   klinische Datei öffnen: Sie erscheint. Wieder als Jannes steht danach ein
   weiterer Eintrag „Datei zum Öffnen freigegeben" im Protokoll.
4. **Löschen bleibt ein Schritt.** Als Jannes eine Datei löschen und unter
   Organisatorisches → Aufbewahrung „ausführen und quittieren" tippen: Es
   endet wie in DAT-002 Schritt 4. Im Protokoll steht vor „Löschung in der
   Ablage quittiert" jetzt „Löschung in der Ablage freigegeben".

**Was die Tests belegen:** Ohne „Öffnen" gibt die Storage-API weder einen
Verweis noch die Datei noch einen Eintrag in der Auflistung heraus — auch
nicht bei bekanntem Ablageort und nicht nach einem früheren Öffnen; eine Kopie
ohne „Öffnen" wird abgewiesen; `owner` entfernt das Objekt eines Löschauftrags
erst nach dessen protokollierter Ausführung, und diese Freigabe öffnet kein
Lesen. Bei laufendem lokalem Stack und
den Umgebungsvariablen aus [`../DEVELOPMENT.md`](../DEVELOPMENT.md) Schritt 6:
`pnpm test:e2e --project authenticated tests/e2e/authenticated/patient-file-access.spec.ts`.

**Was hier nicht geprüft werden kann:** ob eine spätere Version der
Storage-API anders nach der Berechtigung fragt. Deshalb steht dieser Test in
der Wiedervorlage von ANN-052 bei jedem Upgrade.

---

## OPS-006 — Auskunft nach Art. 15 und die Antwort auf ein Löschverlangen

**Was geprüft wird:** dass die Praxisleitung in der Akte beides erledigen kann —
und dass niemand sonst an die Kopie kommt. Das Verfahren dazu steht in
[`../datenschutz/betroffenenrechte.md`](../datenschutz/betroffenenrechte.md).

**Reicht ohne Mailfänger**, braucht aber die Anmeldung; in der
Cloud-Entwicklungsumgebung startet dafür kein Anmeldedienst.

1. **Der Weg hinein.** Als `jannes.test@praxis.invalid` anmelden, Akte von Max
   Mustermann → Stammdaten. Unten steht der Abschnitt „Betroffenenrechte" mit
   „Auskunft und Löschverlangen". Tippen.
2. **Nichts passiert von allein.** Die Seite zeigt zwei Abschnitte. Oben steht
   nur die Schaltfläche „Auskunft erstellen" — **keine** Daten. Das ist der
   Punkt: Jede erstellte Kopie ist ein protokollierter Export.
3. **Die Kopie.** „Auskunft erstellen" tippen. Es erscheinen die Abschnitte mit
   Anzahl — Name, Behandlungsverhältnis, Kontakt- und Stammdaten, Termine,
   Terminbenachrichtigungen —, darunter „Nicht enthalten" mit vier Punkten,
   unter ihnen das Zugriffsprotokoll.
4. **Als Datei.** „Kopie als Datei sichern" tippen. Es lädt eine Datei
   `auskunft-JJJJMMTT-xxxxxxxx.json`. Öffnen: Sie enthält Max Mustermanns
   Angaben, die Termine und den Abschnitt `nicht_enthalten`. **Im Dateinamen
   steht kein Name.**
5. **Der Export steht im Protokoll.** Organisatorisches → Sicherheit öffnen:
   Dort steht ein neuer Eintrag „Auskunft aus der Akte erteilt" mit Zeitpunkt
   und Akte.
6. **Das Löschverlangen.** Zurück auf die Seite, unterer Abschnitt: Dort steht
   „§ 630f Abs. 3 BGB — Frist läuft noch nicht" (die Versorgung von Max ist
   nicht abgeschlossen) und darunter der Entwurf der Antwort. Lesen: Er nennt
   **kein** Löschdatum, sondern sagt, dass die Frist erst mit dem Abschluss der
   Behandlung beginnt.
7. **Mit Abschluss wird daraus ein Datum.** In den Stammdaten „Versorgung
   abschließen" mit dem heutigen Tag bestätigen, zurück auf die Seite: Jetzt
   steht dort „aufzubewahren bis" mit dem Tag in zehn Jahren, und der Entwurf
   nennt denselben Tag. Danach den Abschluss wieder zurücknehmen.
8. **Niemand sonst.** Abmelden, als `anna.beispiel@praxis.invalid` anmelden,
   dieselbe Akte → Stammdaten: Der Abschnitt „Betroffenenrechte" **fehlt**. Die
   Adresse `/patienten/66666666-6666-4666-8666-000000000001/auskunft` direkt in
   die Adresszeile tippen: Es erscheint die Übersicht, nicht die Seite.
   Dasselbe als `olivia.office@praxis.invalid` und
   `tim.teamleitung@praxis.invalid`.
9. **Auf dem Telefon.** Schritt 1 bis 3 bei ~375 px wiederholen: Kein
   waagerechtes Scrollen, der Entwurf ist lesbar und kopierbar.

**Was die Tests belegen:** dass `export_patient_record` und
`patient_retention_status` jede Rolle außer `owner` abweisen, eine Akte einer
fremden Organisation mit derselben Meldung wie eine unbekannte Kennung, dass
jede Auskunft eine Auditzeile ohne Inhalte schreibt und eine abgewiesene keine,
und dass die Kopie jede Tabelle der Klasse `patientenakte` enthält — geprüft
gegen `retention_assignments`, nicht gegen eine Liste im Test
(`supabase/tests/betroffenenrechte.test.ts`).

**Was hier nicht geprüft werden kann:** ob der Entwurf rechtlich trägt. Das
gehört in die Datenschutzprüfung (B2, G14) — zusammen mit **ANN-092**, der
Frage nach dem Zugriffsprotokoll in der Auskunft.
