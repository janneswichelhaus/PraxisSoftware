# Test-Umgebung einrichten

Stand 2026-10-27 (OPS-002a; B16, entschieden 2026-09-23: Uberspace). Die Schritte macht Jannes,
nicht Claude: keine Cloud-Ressourcen durch Coding-Agenten (ADR-013 Punkt 7). Bedienung und was
automatisch passiert: [`../DEVELOPMENT.md`](../DEVELOPMENT.md), „Test-Umgebung“. Die Abwägung der
Anbieter liegt in Git (`git show eb43569:docs/decisions/hosting-optionen.md`).

**Zugangsdaten** gehen nur in GitHub (Schritt 4) oder in den eigenen Passwortmanager, nie in den
Chat, ins Repository oder in eine Mail. Claude braucht keinen davon.

## 1. Supabase-Testprojekt

- Neues Projekt `praxis-test`, Region Frankfurt (`eu-central-1`, ADR-015 Punkt 19), kostenloser
  Tarif; Datenbankpasswort sofort in den Passwortmanager.
- Authentication → Sign In / Providers: „Allow new users to sign up“ aus. Konten legt der Seed an.
- Nichts importieren: Migrationen und die synthetische Praxiswoche spielt der Workflow ein. Kein
  Produktivprojekt, keine echten Daten (§3.1, §3.2). Nach einer Woche ohne Nutzung pausiert das
  Projekt; im Dashboard wieder starten.

## 2. Uberspace

- Konto anlegen (der Kontoname wird Teil der Adresse), AVV nach Art. 28 DSGVO abschließen
  (`uberspace.de/dpa`) und ablegen.
- Prüfen: SSH mit Schlüssel, `.htaccess` wird ausgewertet, das Zugriffslog kürzt IP-Adressen,
  HTTPS per Let's Encrypt. Fällt ein Punkt durch, Claude Bescheid geben.
- Deploy-Schlüssel nur für diesen Zweck, ohne Passphrase:
  `ssh-keygen -t ed25519 -C deploy-praxis-test -N "" -f ~/.ssh/praxis-test-deploy`; den
  öffentlichen Teil im Dashboard eintragen. Serverschlüssel festhalten:
  `ssh-keyscan -4 <hostname> > ~/praxis-test-known-hosts`.

**Stand 2026-09-25:** Asteroid `prtest` auf Uberspace 8, Host `janus.uberspace.de`, ausgeliefert
aus `~/www/html` (`prtest.uber.space`). SSH mit Schlüssel nur über IPv4 (über IPv6 bricht die
Verbindung ab), `rsync` vorhanden, Zugriffslog mit gekürzten IP-Adressen, `.htaccess` ausgewertet.
AVV abgeschlossen (Jannes, 2026-09-25).

## 3. Adresse (optional)

Es reicht `<kontoname>.uber.space`. Eine Subdomain der Praxisdomain geht über das
Uberspace-Handbuch „Domains“ und die angezeigten A- und AAAA-Einträge; nichts hängt daran.

## 4. Secrets in GitHub

Settings → Environments → `test`, darin genau diese sieben „Environment secrets“. Das Präfix
`TESTENV_` trennt sie von `TEST_DATABASE_URL`, der lokalen Wegwerf-Datenbank von `pnpm test:db`.

| Name                        | Wert                                                                       |
| --------------------------- | -------------------------------------------------------------------------- |
| `TESTENV_SUPABASE_URL`      | Projekt-URL `https://<ref>.supabase.co`, ohne `/rest/v1/`                  |
| `TESTENV_SUPABASE_ANON_KEY` | öffentlicher Schlüssel (`anon`/`publishable`), nie `service_role`/`secret` |
| `TESTENV_DATABASE_URL`      | Verbindungsstring mit Passwort, „Session pooler“                           |
| `DEPLOY_SSH_HOST`           | Hostname des Uberspace-Servers                                             |
| `DEPLOY_SSH_USER`           | Kontoname                                                                  |
| `DEPLOY_SSH_KEY`            | ganze Datei `~/.ssh/praxis-test-deploy` (privater Teil)                    |
| `DEPLOY_KNOWN_HOSTS`        | Inhalt von `~/praxis-test-known-hosts`                                     |

Optional (ANN-100, ANN-101): `TESTENV_LOGIN_PASSWORD` (Kennwort aller Testkonten, mindestens 12
Zeichen; fehlt es, sind sie gesperrt) und `TESTENV_TUER_PASSWORD` (zweite Tür vor der Seite,
Benutzer `praxis`). Beide selbst erzeugen, nicht wiederverwenden.

**Pflicht:** Unter „Deployment branches and tags“ nur `main` zulassen. Erst das hält einen Workflow
auf einem anderen Branch, auch einen von einem Coding-Agenten, von den Secrets fern. Danach die
beiden Dateien aus Schritt 2 löschen und Claude „Konten stehen“ sagen, ohne Werte.

## 5. Kartendienst (optional)

Route und Fahrzeiten laufen auch hier, nur mit synthetischen Adressen (ADR-019 Punkt 15). Der
Serverschlüssel von PTV liegt nur im Supabase-Projekt; das Kartenbild braucht einen eigenen
Kachelschlüssel, der im Browser steht (ADR-019 Punkt 19). Ohne ihn bleibt nur das Kartenbild aus.

- Supabase → Account → Access Tokens: `praxis-test-deploy`, Rechte Edge Functions lesen und
  schreiben, Projekt lesen. Er gilt für alle Projekte des Kontos: vor einem Produktivprojekt
  widerrufen oder dieses in ein eigenes Konto.
- GitHub, Umgebung `test`: `TESTENV_SUPABASE_ACCESS_TOKEN`, mit zweitem PTV-Schlüssel dazu
  `TESTENV_PTV_TILE_API_KEY`.
- Supabase → Edge Functions → Secrets: `LOCATION_PROVIDER` = `ptv`, `PTV_API_KEY` =
  Serverschlüssel, `LOCATION_DATA_GATE` = `synthetic`, `APP_ENVIRONMENT` = `test`.
- GitHub → Actions → Test-Umgebung → Run workflow (ohne „neu aufsetzen“); danach Kalender → Touren.
