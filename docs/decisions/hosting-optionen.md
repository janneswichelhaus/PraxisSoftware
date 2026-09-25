# B16 — Optionen für das Hosting der Oberfläche

Vorlage aus Umbau U5, 2026-09-23. **Entschieden am 2026-09-23** (Jannes, B16 in
[`OPEN_DECISIONS.md`](OPEN_DECISIONS.md)): **Uberspace.** Das Dokument hat
keinen Rang; es bleibt als Begründung der Wahl und als Anleitung für die
Einrichtung stehen (Teil „Das genaue Vorgehen").

## Worum es geht

OPS-002a (Roadmap, Block 1a) soll Jannes die Anwendung auf dem eigenen Handy
öffnen lassen, von überall: ein Supabase-Projekt in der EU mit nur
synthetischen Daten, eine eigene Domain, Zugang geschützt, Deployment aus
`main` nur dorthin. Supabase ist geprüft
([`providerpruefung-supabase.md`](providerpruefung-supabase.md)); offen ist,
**wer die Oberfläche ausliefert**. ADR-015 hat das Frontend-Hosting bewusst
offen gelassen, ADR-002 verlangt für jeden neuen Dienstleister eine Prüfung,
und ein neuer Anbieter ist nach §15.1 ein Stopp — deshalb diese Vorlage statt
einer Annahme.

## Was der Anbieter sieht — und was nicht

Die Anwendung ist nach `pnpm build` ein Ordner statischer Dateien (`dist/`:
HTML, JavaScript, CSS, Marke). Der Browser lädt sie einmal vom Hosting und
spricht danach **direkt mit Supabase**; kein Datenbankaufruf, keine Anmeldung
und keine Datei läuft über den Hosting-Anbieter. Er sieht je Aufruf nur
IP-Adresse, Browserkennung, Uhrzeit und den Pfad einer statischen Datei.

- **Test-Umgebung:** Nur Jannes, nur synthetische Daten. Personenbezogen ist
  allein Jannes' eigene IP-Adresse. Die Prüfung nach ADR-002 Punkt 3 fällt
  entsprechend klein aus.
- **Später, mit Patient:innen auf der Plattform (Block 4):** Schon die Tatsache,
  dass jemand das Portal einer Physiotherapiepraxis öffnet, kann ein nach
  §203 StGB geschütztes Geheimnis sein — das Patientenverhältnis selbst. Dann
  greift die volle Prüfung wie bei Supabase, einschließlich der Verpflichtung
  nach §203 Abs. 4. **Ein Anbieter, der dort besteht, erspart später einen
  Wechsel.** Das ist das stärkste Argument der Vorlage.
- **Der Rücknahmepreis ist klein:** ein Ordner, ein CI-Schritt, ein DNS-Eintrag.
  Ein Wechsel kostet eine Session, keinen Umbau.

**Zugang geschützt** heißt zweierlei. Die eigentliche Sperre ist Supabase Auth
im Testprojekt: Selbstregistrierung aus, Konten legt nur der Owner an; die
Daten schützen RLS und Policies wie lokal. Ein Schutz vor der Oberfläche
(Passwort am Hosting) ist eine **zweite Tür**: Er hält Suchmaschinen und
Zufallsbesuche fern, sichert aber keine Daten — die Schnittstelle von Supabase
ist auch ohne ihn erreichbar. Er ist erwünscht, nicht tragend.

## Belegtiefe

Wie bei den bisherigen Prüfungen: Die Anbieterseiten sind aus der
Cloud-Entwicklungsumgebung gesperrt (`EGRESS_BLOCKED`, geprüft 2026-09-23 für
bunny.net, hetzner.com, cloudflare.com, netlify.com). **Alles unten ist
Hinweis aus Suchauszügen oder Drittquellen**, nichts ist am Vertragstext
geprüft. Vor der Bestellung liest Jannes AVV und Preisliste selbst; Teil
„Vor der Bestellung prüfen" nennt die Punkte.

## Die Optionen

### Option 1 — Uberspace (Empfehlung, gewählt)

Uberspace, deutscher Anbieter von Webhosting für Entwickler:innen, mit eigener
Infrastruktur in Deutschland (Hinweis, Drittquelle).

- **Datenstandort und Vertrag:** deutsches Unternehmen, eigene Infrastruktur in
  Deutschland, AVV nach Art. 28 DSGVO (`uberspace.de/dpa`, Hinweis, Suchauszug).
- **Logs:** Auf Uberspace 8 schreibt der vordere Webserver (Caddy) ein
  Zugriffslog, **IP-Adressen gekürzt** (`a.b.0.0`); ein Befehl zum Abschalten
  fehlt in U8 (beides **geprüft am Konto**, 2026-09-25). Die frühere Angabe
  „standardmäßig aus" stammte von Uberspace 7. Gekürzte Adressen machen aus dem
  Aufruf des Portals kaum noch eine Spur zu einer Person; **vor echten Daten**
  bei Uberspace erfragen: Aufbewahrungsfrist des Logs, Abschaltung je Asteroid.
- **Zugang geschützt:** `.htaccess` ist nutzbar (Hinweis) — Passwort, Umleitung
  aller Pfade auf `index.html`, Sicherheitskopfzeilen.
- **Deployment:** **SSH in jedem Konto**, `rsync` vorhanden (geprüft am Konto) —
  GitHub Actions lädt `dist/` per `rsync` hoch, ein Schlüssel nur für diesen
  Zweck. SSH gelingt über **IPv4**; über IPv6 bricht die Verbindung ab
  (2026-09-25), die Auslieferung erzwingt deshalb IPv4.
- **Kosten:** „zahl, was du willst", erwünscht mindestens 5 € im Monat (Hinweis,
  Drittquelle).
- **Preis:** kleiner Anbieter, geteilte Server, kein Auslieferungsnetz. Für eine
  Praxis in einer Stadt unerheblich; der Bus-Faktor des Anbieters ist bei einem
  Ordner statischer Dateien kein Risiko — ein Umzug dauert eine Session.

### Option 2 — Hetzner Webhosting

Hetzner Online GmbH, Gunzenhausen; Rechenzentren in Nürnberg, Falkenstein und
Helsinki. Klassisches Webhosting: Dateien hochladen, fertig.

- **Datenstandort und Vertrag:** deutsche Gesellschaft, Rechenzentren in der
  EU, AVV im Kundenbereich (Hinweis, Suchauszug). Keine Drittlandfrage, eine
  kurze Kette von Unterauftragnehmern zu erwarten.
- **Zugang geschützt:** Passwortschutz per `.htaccess` ist Standard bei
  Apache-Webhosting; dieselbe Datei leitet alle Pfade auf `index.html` (die
  Anwendung hat eigene Routen) und setzt Sicherheitskopfzeilen. **Nicht
  belegt** für die neuen Tarife — vor der Bestellung prüfen.
- **Deployment:** GitHub Actions lädt `dist/` hoch. SSH gibt es laut Auszug
  **erst ab Tarif L**; ob die kleineren Tarife SFTP oder FTPS bieten, ist nicht
  belegt. Ein Zugang nur für den Webspace der Test-Umgebung, als Secret in
  GitHub — kein Produktionszugang, kein Zugang für Claude.
- **Kosten:** ab 1,90 € brutto im Monat (Tarif S, Hinweis, Suchauszug); mit
  SSH mehr.
- **Preis:** kein weltweites Auslieferungsnetz — für eine Praxis in einer Stadt
  unerheblich. Weniger Komfort als die Plattformen unten: keine
  Vorschau-Umgebungen je Pull Request (brauchen wir nicht, §3.2).
- **Später Produktion:** gut prüfbar — deutsche Gesellschaft, klassischer AVV,
  großer Anbieter mit eigenen Rechenzentren. Zugriffslogs mit IP-Adressen sind
  bei Webhosting üblich; Frist und Kürzung vor der Bestellung klären.

### Option 3 — Bunny.net (Storage und CDN)

BunnyWay d.o.o., Ljubljana (Slowenien). Speicher-Zone mit Auslieferungsnetz;
Anleitungen für Einzelseiten-Anwendungen vorhanden (Hinweis, Suchauszug).

- **Datenstandort und Vertrag:** EU-Gesellschaft, Speicherzonen in der EU,
  Auslieferung per „Routing Filter" auf europäische Standorte begrenzbar, AVV
  angeboten (Hinweis, Drittquellen).
- **Zugang geschützt:** Token-Authentifizierung ist eingebaut, aber für
  signierte Verweise gedacht, nicht für ein Passwort vor der Seite. Ein
  Passwort ist laut Drittquelle über Edge-Regeln oder Edge-Scripting
  herstellbar — **nicht belegt**, und Edge-Scripting wäre eigener Code auf
  einer weiteren Laufzeit.
- **Deployment:** Upload per API aus GitHub Actions, Cache-Leerung danach.
- **Kosten:** nutzungsabhängig, Größenordnung ein bis zwei Euro im Monat
  (nicht belegt, Mindestumsatz prüfen).
- **Später Produktion:** gut geeignet, wenn die Auslieferung schnell sein soll;
  die zweite Tür ist hier umständlicher als bei Option 1 und 2.

### Option 4 — Cloudflare Pages mit Cloudflare Access

Cloudflare, Inc. (USA). Statisches Hosting mit weltweitem Netz; Access schützt
die Seite mit Einmalcode per Mail.

- **Zugang geschützt:** die beste zweite Tür der Vorlage — Access ist laut
  Auszug bis 50 Personen kostenlos, ohne Kreditkarte.
- **Deployment:** eingebaut für GitHub, am wenigsten eigene Arbeit.
- **Kosten:** 0 €.
- **Datenstandort und Vertrag:** AVV als Teil der Selbstbedienungsbedingungen
  (Hinweis). US-Gesellschaft, Verarbeitung weltweit; die Begrenzung auf die EU
  (Data Localization Suite) ist ein Enterprise-Angebot (Hinweis). Nach ADR-002
  Punkt 2 kein Ausschluss, aber dieselbe schwere Prüfung wie bei Supabase —
  und Access verarbeitet zusätzlich Mailadressen der Anmeldenden. Cloudflare
  steht ohnehin in der Kette von Supabase (Unterauftragnehmer, Hinweis).
- **Später Produktion:** für das Portal der Patient:innen die schwierigste
  Option; ein Wechsel vor Block 4 wäre wahrscheinlich.

### Weitere EU-Anbieter, betrachtet und zurückgestellt

- **ALL-INKL.COM** (Friedersdorf): deutsch, AVV im Kundenbereich, `.htaccess`;
  SSH erst ab Premium (9,95 €), Privat 4,95 € ohne SSH (Hinweis). Gleichwertig
  zu Hetzner, teurer.
- **statichost.eu** (Stockholm): rein europäischer Stapel, baut direkt aus Git,
  keine personenbezogenen Daten in Logs (Hinweis). Passwortschutz nur im
  Premium-Tarif, Preis auf Anfrage. Beobachten, falls Uberspace und Hetzner
  ausfallen.
- **IONOS, Strato, netcup** und ähnliche Massenhoster: technisch gleichwertig,
  kein Vorteil gegenüber Option 1 und 2; nicht einzeln recherchiert.

### Nicht empfohlen

- **Netlify, Vercel:** US-Gesellschaften ohne einfache EU-Begrenzung; der
  Passwortschutz kostet laut Auszug rund 20 US-Dollar im Monat (Netlify im
  Pro-Tarif, Vercel je Projekt). Alles, was Option 3 hat, teurer.
- **GitHub Pages:** kein Zugangsschutz ohne Enterprise-Tarif.
- **Eigener Server (VPS):** Betrieb eines eigenen Webservers widerspricht §3.4
  (kein Eigenbau von Betriebsinfrastruktur).
- **Supabase Storage als Webserver:** liefert HTML aus Sicherheitsgründen nicht
  als Webseite aus (Hinweis); kein Weg.

## Empfehlung

**Option 1, Uberspace.** Begründung: SSH in jedem Konto macht das automatische
Ausliefern einfach, und die Zugriffslogs kürzen IP-Adressen, sodass beim Anbieter
kaum eine Spur zu einer Person entsteht. **Fällt
Uberspace an einem Punkt unten durch, Option 2 (Hetzner).** Option 4 nur, wenn
die Test-Umgebung ausdrücklich eine Wegwerf-Lösung bis Block 4 sein soll.

## Langfristig — ist das die richtige Wahl?

Für die Test-Umgebung ja, für die Produktion **wahrscheinlich**, und das ist
genug, weil der Rücknahmepreis klein bleibt:

- Die Oberfläche bleibt ein Ordner statischer Dateien, solange ADR-015 gilt
  (kein Next.js, kein Server-Rendering). Jedes Webhosting kann das; es gibt
  keine Bindung an Funktionen des Anbieters.
- Die schwere Last trägt Supabase (Daten, Anmeldung, Dateien); dort liegt die
  eigentliche Langfrist-Entscheidung (OPS-001, A2), nicht hier.
- Vor echten Daten (G5, M3) wird der gewählte Anbieter vollständig nach ADR-002
  geprüft, einschließlich §203 Abs. 4. Besteht er nicht, zieht die Oberfläche
  um — eine Session, kein Umbau.
- Was die Wahl ändern würde: ein Offline-Modus mit Service Worker (ADR-001,
  ADR-024) ändert nichts am Hosting; Server-Rendering oder eigene Serverlogik
  neben Supabase würde es — beides ist heute ausgeschlossen.

## Das genaue Vorgehen

Drei Schritte. **Schritt 1 ist erledigt:** Jannes hat am 2026-09-23 Uberspace
gewählt. **Schritt 2 macht Jannes** (keine Cloud-Ressourcen durch Claude,
ADR-013 Punkt 7), **Schritt 3 Claude** mit `/weiter`.

**Die eine Regel für alle Zugangsdaten:** Passwörter, Schlüssel und
Verbindungsstrings gehen **nur** in GitHub (Schritt 2d) oder in den eigenen
Passwortmanager — **nie in den Chat, nie ins Repository, nie in eine Mail.**
Claude braucht keinen einzigen davon.

### Schritt 2a — Supabase-Testprojekt (etwa 15 Minuten)

1. Im Supabase-Dashboard ein **neues Projekt** anlegen: Name `praxis-test`,
   Region **Frankfurt** (`eu-central-1`, ADR-015 Punkt 19), kostenloser
   Tarif. Das Datenbankpasswort erzeugen lassen und **sofort in den
   Passwortmanager**.
2. **Authentication → Sign In / Providers:** „Allow new users to sign up"
   **aus**. Konten legt später allein der Seed von OPS-002a an; jetzt keine
   Nutzer anlegen.
3. Nichts importieren, nichts hochladen — das Projekt bleibt leer, bis
   OPS-002a Migrationen und die synthetische Praxiswoche einspielt. Kein
   Produktivprojekt, keine echten Daten (§3.1, §3.2).
4. Hinnehmbar: Im kostenlosen Tarif pausiert das Projekt laut Auszug nach einer
   Woche ohne Nutzung; im Dashboard wieder starten.

### Schritt 2b — Uberspace (etwa 20 Minuten)

1. Konto bei Uberspace anlegen; der **Kontoname** wird Teil der Adresse. Die
   Testphase ist laut Auszug kostenlos, danach „zahl, was du willst".
2. **AVV** nach Art. 28 DSGVO abschließen (`uberspace.de/dpa`) und ablegen.
3. **Prüfen, bevor es weitergeht** — fällt einer der Punkte durch, zurück zu
   Option 2 (Hetzner) und Claude Bescheid geben:
   - SSH-Anmeldung mit Schlüssel möglich;
   - `.htaccess` wird ausgewertet (Uberspace-Handbuch, Abschnitt Web);
   - Zugriffslog kürzt IP-Adressen (`tail -n 1 ~/logs/caddy/access.log`, selbst
     ansehen, nicht weitergeben);
   - HTTPS für die Adresse der Test-Umgebung (Let's Encrypt).
4. **Deploy-Schlüssel** auf dem eigenen Rechner erzeugen, nur für diesen
   Zweck, ohne Passphrase (GitHub muss ihn allein benutzen können):

   ```bash
   ssh-keygen -t ed25519 -C deploy-praxis-test -N "" -f ~/.ssh/praxis-test-deploy
   ```

   Den **öffentlichen** Teil (`~/.ssh/praxis-test-deploy.pub`) im
   Uberspace-Dashboard unter den SSH-Schlüsseln eintragen. Den privaten Teil
   braucht nur Schritt 2d.
5. Den **Serverschlüssel** festhalten, damit GitHub nur mit dem echten Server
   spricht (Hostname aus dem Dashboard):

   ```bash
   ssh-keyscan -4 <hostname> > ~/praxis-test-known-hosts
   ```

**Stand am Konto (2026-09-25):** Asteroid `prtest` auf Uberspace 8, Host
`janus.uberspace.de`; ausgeliefert wird aus `~/www/html` (erreichbar unter
`prtest.uber.space`). SSH mit Schlüssel über IPv4, Fingerabdruck geprüft;
`rsync` vorhanden; Zugriffslog mit gekürzten IP-Adressen. Offen: `.htaccess`
(prüft OPS-002a), AVV.

### Schritt 2c — Adresse (optional, etwa 10 Minuten)

Für den Anfang reicht die Adresse, die Uberspace dem Konto gibt
(`<kontoname>.uber.space`). Eine **Subdomain der Praxisdomain** (etwa
`test.` davor) ist schöner, aber nicht nötig: im Uberspace-Handbuch
„Domains" die Subdomain hinzufügen und die angezeigten DNS-Einträge (A und
AAAA) bei der Stelle eintragen, die die Praxisdomain verwaltet. Das kann auch
später geschehen; OPS-002a hängt nicht daran.

### Schritt 2d — Secrets in GitHub (etwa 10 Minuten)

Im Repository **Settings → Environments → New environment** mit dem Namen
**`test`** anlegen; darin unter „Environment secrets" genau diese sieben
Einträge. Die Namen sind fest — OPS-002a liest nur sie. Das Präfix `TESTENV_`
ist Absicht: `TEST_DATABASE_URL` heißt schon die lokale Wegwerf-Datenbank von
`pnpm test:db`, und die Test-Umgebung darf nie mit ihr verwechselt werden.

| Name                     | Wert                                                                                    | Woher                                            |
| ------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `TESTENV_SUPABASE_URL`   | Projekt-URL (`https://….supabase.co`)                                                   | Supabase → Project Settings → API                |
| `TESTENV_SUPABASE_ANON_KEY` | öffentlicher Schlüssel (`anon` oder `publishable`) — **nie** `service_role` / `secret` | Supabase → Project Settings → API Keys           |
| `TESTENV_DATABASE_URL`   | Verbindungsstring mit Passwort, „Session pooler"                                        | Supabase → Connect                               |
| `DEPLOY_SSH_HOST`        | Hostname des Uberspace-Servers                                                          | Uberspace-Dashboard                              |
| `DEPLOY_SSH_USER`        | Kontoname                                                                               | Uberspace-Dashboard                              |
| `DEPLOY_SSH_KEY`         | Inhalt von `~/.ssh/praxis-test-deploy` (privater Teil, ganze Datei)                     | Schritt 2b.4                                     |
| `DEPLOY_KNOWN_HOSTS`     | Inhalt von `~/praxis-test-known-hosts`                                                  | Schritt 2b.5                                     |

**Zwei optionale Secrets** in derselben Umgebung (Jannes, 2026-09-25: 1a, 2a;
ANN-100, ANN-101):

| Name                     | Wert                                                                        |
| ------------------------ | --------------------------------------------------------------------------- |
| `TESTENV_LOGIN_PASSWORD` | Kennwort für alle Testkonten, mindestens 12 Zeichen; fehlt es, sind sie gesperrt |
| `TESTENV_TUER_PASSWORD`  | Kennwort der zweiten Tür vor der Seite (Benutzer `praxis`); fehlt es, keine Tür |

Beide selbst erzeugen (Passwortmanager), nicht wiederverwenden.

**Branch-Beschränkung (Pflicht):** In derselben Umgebung unter „Deployment
branches and tags" **„Selected branches and tags"** wählen und nur `main`
eintragen. Erst das hält einen Workflow auf einem anderen Branch — auch einen,
den ein Coding-Agent pusht — von den Secrets fern; der Workflow selbst kann das
nicht erzwingen (Zweitreview OPS-002a).

Danach die beiden Dateien aus Schritt 2b auf dem eigenen Rechner löschen
(`rm ~/.ssh/praxis-test-deploy ~/praxis-test-known-hosts`) — der Schlüssel
lebt nur noch in GitHub, ein neuer ist in einer Minute erzeugt. Dann Claude
sagen: **„Konten stehen"** (ohne Werte).

### Schritt 3 — Claude baut OPS-002a (gebaut 2026-09-25)

Gebaut als `.github/workflows/test-umgebung.yml`; Bedienung in
[`DEVELOPMENT.md`](../DEVELOPMENT.md), „Test-Umgebung". Ob Uberspace 8 die
`.htaccess` auswertet, zeigt der erste Lauf: Der Schritt „Ausgelieferte Seite
pruefen" wird sonst rot.

Ursprünglicher Auftrag:

Ein Auslieferungsschritt in der CI, Umgebung `test`, der nach grüner CI auf `main` nur in die
Test-Umgebung ausliefert; Konfiguration über `VITE_`-Variablen, `service_role`
nie im Browser (ADR-015, Folgefrage); Migrationen und der Seed einer
synthetischen Praxiswoche gegen das Testprojekt; `noindex`,
Sicherheitskopfzeilen und die zweite Tür (`.htaccess`); fehlen die Secrets,
überspringt der Schritt die Auslieferung, statt rot zu werden. Danach öffnest du die
Anwendung am Handy und beginnst die Sichtung dort. Die Produktion bleibt G5
vorbehalten, mit menschlicher Freigabe (ADR-013 Punkt 6).
