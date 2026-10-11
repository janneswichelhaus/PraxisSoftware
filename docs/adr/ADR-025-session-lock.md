# ADR-025: Sitzungssperre — erneute Freigabe nach Frist und Inaktivität, serverseitig durchgesetzt

## Status

**Angenommen in den Anforderungen** (Jannes, 2026-10-02): Die Punkte 1 bis 8 sind seine Vorgabe aus der
Abnahme von Block 1 der Annahmen. **Offen sind die Wahlpunkte W1 bis W3** am Ende. Sie werden im
Arbeitspaket **SEC-EPIC-001** entschieden, das vor dem Produktivstart gebaut wird (Roadmap, Etappe G,
Zeile G20; Kriterium von M3). Löst keinen ADR ab. Ergänzt ADR-023 Punkte 17 und 18 (Sitzungen für alle
Konten gleich) um eine Sperre, die der Anmeldedienst allein nicht leistet. ADR-024 ist für Offline und
Benachrichtigungen vergeben.

**Stand 2026-10-06 (SEC-EPIC-001):** W1 (a) entschieden — Jannes: „Wichtiger ist, dass Nutzer nach
30/60 min automatisch ausgeloggt werden.“ W2 (a) gebaut (ANN-256). Punkte 1 bis 6 und 8 sind gebaut;
Punkt 7 mit dem Kennwort als Weg, der Passkey (W3) bleibt offen bis OPS-001 (ANN-257). Ein kürzeres
`jwt_expiry` ist nicht gesetzt: Die Sperre hängt nicht daran.

**Fassung 2 (2026-10-10, Jannes): Anmeldung ohne Kennwort.** Im Alltag Passkey, als Rückweg eine
eigene App-PIN, **kein Kennwort**, weder bei der Freigabe noch bei der Anmeldung. Damit ist **W3
entschieden**: gebaut ohne Schalter und eingeschaltet, sobald der Anmeldedienst einer Umgebung
Passkeys anbietet. Geändert ist **Punkt 7**, neu sind die **Punkte 9 bis 15** und die Folgen unter
„Konsequenzen“. Rang 1 dazu: `PROJECT_PRINCIPLES.md` 0.25, §3.4 (Ausnahme für die App-PIN); dazu
ADR-023 Fassung 4. **Gebaut in SEC-EPIC-002** (Roadmap G22, 2026-10-10; ANN-324 bis ANN-331). Empfohlen waren die Geräte-PIN
über den Passkey und das Kennwort als Notfallweg; Jannes hat das in Kenntnis der Folgen verworfen.

**Fassung 3 (2026-10-11, Jannes): Passkey von selbst, PIN dahinter.** Geändert ist nur Punkt 11,
dritter Spiegelstrich: Die Sperrseite öffnet das Passkey-Fenster beim Erscheinen von selbst, die
PIN-Eingabe steht dahinter bereit statt erst auf „Passkey klappt nicht“. Die Anmeldeseite öffnet das
Passkey-Fenster ebenso von selbst; eine PIN steht dort nicht, weil sie nie anmeldet. Sicherheitlich
ändert sich nichts: Die PIN war schon vorher einen Tipp entfernt.

## Datum

2026-10-02 · Fassung 2: 2026-10-10 · Fassung 3: 2026-10-11

## Kontext

Die Anwendung läuft am Diensttelefon im Hausbesuch und am Praxisrechner im Büro. Beide Geräte bleiben
liegen, werden weitergegeben oder gehen verloren. Heute gilt (Stand `main`):

- **Sitzungen führt der Anmeldedienst** (ADR-015 Punkt 8, ADR-023 Punkt 17). Ein Zugriffstoken gilt
  `jwt_expiry` = 3600 Sekunden (`supabase/config.toml`), das Erneuerungstoken läuft nicht ab und wird bei
  jeder Erneuerung getauscht. Wer einmal angemeldet ist, bleibt es, bis er sich abmeldet.
- **Abmelden** beendet nur das eigene Gerät (ANN-045); **„Alle Sitzungen beenden"** nimmt allen Geräten
  die Erneuerung, ein ausgestelltes Zugriffstoken bleibt aber bis zu seinem Ablauf gültig (ANN-044).
- **Sofort wirkt nur die Sperre des Zugangs**, weil die Datenbank bei jeder Anfrage
  `user_profiles.is_active` liest (ANN-044) bzw. den Zustand des Plattformzugangs (ADR-023 Punkt 18).
- **Der Anmeldedienst kennt** eine Höchstdauer der Sitzung (*time-box*) und eine Inaktivitätsfrist.
  Beide gelten erst beim **Erneuern** des Tokens, nicht bei jeder Anfrage, und nur ab dem bezahlten Tarif.
  Ein ausgestelltes Zugriffstoken bleibt bis `jwt_expiry` gültig.
- **Passkeys** (WebAuthn: Gesichtserkennung, Fingerabdruck oder Geräte-PIN) bietet der Anmeldedienst
  seit Juni 2026 als **Beta** an. Sie sind eine Anmeldung als erster Faktor, kein zweiter Faktor. Das
  Client-SDK verlangt dafür ausdrücklich `auth.experimental.passkey: true`, und das API kann sich während
  der Beta ändern. Eingerichtet werden sie im Dashboard (Relying Party: Name, Domain, bis zu fünf
  Ursprünge). Lokal mit `supabase start` gab es einen Fehler bei der Übergabe der Einstellungen, der
  inzwischen behoben ist. Mit Passwortmanagern von Drittanbietern ist die Registrierung teils
  gescheitert, mit den Authentifikatoren des Geräts nicht.

Ein liegen gelassenes, entsperrtes Telefon zeigt also heute die Akten des ganzen Tages, so lange, bis
jemand sich abmeldet.

## Entscheidung

**1. Höchstdauer: 60 Minuten.** Spätestens 60 Minuten nach der Anmeldung oder der letzten erneuten
Freigabe muss sich die Person erneut ausweisen. Das gilt unabhängig davon, ob sie in dieser Zeit
gearbeitet hat. Ein kurzes Ausschalten des Bildschirms oder ein Wechsel in eine andere App verlangt
**innerhalb** dieser 60 Minuten keine Anmeldung.

**2. Inaktivitätssperre: Vorschlag 30 Minuten** (W1). Hat die Person 30 Minuten lang nichts in der
Anwendung bedient, sperrt sie sich, auch wenn die 60 Minuten noch nicht um sind. Bedienen heißt eine
Eingabe, ein Tipp oder ein Klick in der Anwendung. Ein Hintergrund-Abruf zählt nicht. Im Hintergrund
läuft die Frist weiter.

**3. Sperren ist nicht Abmelden.** Die Sitzung bleibt bestehen, ihre Daten nicht. Gesperrt heißt:
- Die Oberfläche zeigt nur die Sperrseite, ohne Namen, Akte oder Termin.
- Zwischengespeicherte Antworten mit Patientendaten werden aus dem Speicher der Seite entfernt.
- Nach der Freigabe kehrt die Person an dieselbe Stelle zurück.

Die Regeln zum Abmelden bleiben, wie sie sind (ANN-044, ANN-045).

**4. Ungespeicherte Dokumentation geht nicht verloren.** Vor der Sperre wird ein offener Text als
**Entwurf** gesichert (ADR-016), auf demselben Weg wie „Speichern" im Navigationsschutz (ANN-046). Gelingt
das nicht, etwa im Funkloch, bleibt der Text im Speicher der Seite und erscheint nach der Freigabe wieder.
Unverschlüsselt dauerhaft auf dem Gerät abgelegt wird er nie (ADR-001). Gibt sich bei der Freigabe ein
**anderes** Konto aus, verfällt der Text wie bei jedem Kontowechsel (`SessionProvider`).

**5. Erst prüfen, dann zeigen.** Bei jeder Rückkehr zur Anwendung (Bildschirm an, App im Vordergrund,
Fenster im Fokus, Neuladen) prüft die Anwendung zuerst beide Fristen. Erst danach zeichnet sie Inhalte.
Abgelaufen heißt: Sperrseite, bevor ein Patientendatum sichtbar wird, auch nicht für einen Augenblick.

**6. Die Regel gilt auch im Server.** Die Oberfläche allein schützt nicht (ADR-004). Die Datenbank prüft
bei jeder Anfrage dieselben Fristen an einer Stelle:
- für Praxiskonten dort, wo heute `is_active` gelesen wird (`app.current_organization_id()`),
- für Plattformkonten in `app.platform_readable_access` (ADR-023 Punkt 19).

Damit erbt jede Policy, jede Projektion und jeder Schreibweg die Sperre. Grundlage ist der Zeitpunkt der
letzten Authentifizierung aus dem Token (`amr`) und eine serverseitig gemerkte letzte Bedienung (W2). Die
Einstellungen des Anmeldedienstes (Höchstdauer, Inaktivität) und ein kürzeres `jwt_expiry` kommen als
zweite Linie hinzu. Ein Test meldet ein Konto mit abgelaufener Frist an und verlangt wie in
`plattform-abschottung.test.ts`: keine Zeile, jeder Aufruf abgewiesen.

**7. Freigabe per Passkey, Rückweg App-PIN, kein Kennwort** *(Fassung 2)*. Die erneute Freigabe
läuft über einen Passkey des eigenen Kontos (Gesicht, Finger oder Geräte-PIN). Rückweg ist die
App-PIN (Punkt 11), nur wenn der Passkey nicht klappt. Ein Kennwort gibt es nicht (Punkt 9). Ein Passkey wird nur für das eigene Konto
angenommen: Liefert die Freigabe ein anderes Konto, ist das ein Kontowechsel und keine Freigabe.
*Fassung 1: „Rückweg ist das Kennwort, mit zweitem Faktor, wo einer eingerichtet ist (ANN-028). […]
Solange der Anmeldedienst Passkeys nur als Beta anbietet, steht ihre Nutzung hinter einem Schalter an
einer Stelle. Freigeschaltet wird sie, wenn die Providerprüfung (OPS-001) sie bestätigt (W3).“*

**8. Für alle Konten.** Die Sperre gilt für Praxis- und Plattformkonten (ADR-023 Punkt 17). Die beiden
Fristen sind je Kontoart eine Konstante an einer Stelle. Die Werte aus den Punkten 1 und 2 gelten für
beide, bis das Arbeitspaket etwas anderes begründet.

### Anmeldung ohne Kennwort (Fassung 2)

**9. Kein Kennwort.** Konten haben kein Kennwort, und die Anwendung fragt keins ab: nicht bei der
Anmeldung, nicht bei der Freigabe, nicht beim Einlösen einer Einladung. `/kennwort-neu` entfällt.
Einzige Ausnahme sind Entwicklung und Test-Umgebung (Punkt 15).

**10. Der Passkey ist die Anmeldung.** Ein Passkey beim Anmeldedienst (WebAuthn, erster Faktor) meldet
an und gibt frei. Eingerichtet wird er beim Einlösen der Einladung (Punkt 13). Weitere Geräte bekommen
einen eigenen Passkey unter „Mein Konto“, oder sie nutzen den des Telefons: über den Schlüsselbund des
Geräts oder am Rechner per QR-Code vom Telefon. Die Anwendung fordert bei jeder Zeremonie die Prüfung
der Person am Gerät an (`userVerification: required`). Für die Fristen nach Punkt 6 zählt die
Anmeldeart `passkey` im Claim `amr` als Anmeldung.

**11. Die App-PIN gibt frei, sie meldet nie an.** Jedes Konto legt beim Einrichten eine PIN fest. Sie:

- gibt nur eine **bestehende, gesperrte Sitzung auf demselben Gerät** frei. Auf einem neuen Gerät,
  nach dem Abmelden und für ein anderes Konto gilt sie nicht;
- wird nur in der Datenbank geprüft und dort nur als bcrypt-Hash aus `pgcrypto` gehalten (§3.4,
  Ausnahme). Nie im Klartext, nie im Log, nie auf dem Gerät;
- ist **nur der Rückweg** *(Fassung 3)*: Die Sperrseite öffnet beim Erscheinen das Passkey-Fenster
  von selbst; die PIN-Eingabe steht dahinter bereit, ohne Umweg über eine Nachfrage (Jannes,
  2026-10-11). Keine Uhr wechselt den Weg und keine Frist begrenzt die PIN. Neu freigegeben wird
  trotzdem immer, nach den Punkten 1 und 2. *Fassung 2: „Die Sperrseite bietet immer zuerst den
  Passkey, die PIN erst auf ‚Passkey klappt nicht‘.“*;
- ist nach wenigen Fehlversuchen in Folge verbraucht: Die Sitzung wird beendet, weiter geht es nur per
  Passkey;
- darf keine triviale Folge sein (gleiche Ziffern, auf- oder absteigende Reihe).

Länge und Zahl der Fehlversuche sind Konstanten an einer Stelle; das Arbeitspaket legt sie fest
(Vorschlag: sechs Ziffern, fünf Fehlversuche). Eine Freigabe per PIN startet die Uhr
aus Punkt 1 neu wie eine Anmeldung. Sie steht als Vermerk an der Sitzung, wie die letzte Bedienung (W2).

**12. Vergessen, verloren, neues Gerät.** PIN vergessen: Freigabe per Passkey, dann eine neue PIN
unter „Mein Konto“. Passkey verloren oder kein Gerät mehr: **neue Einladung** für das bestehende Konto
(ADR-023 Punkt 10), so wie bisher beim vergessenen Kennwort; sie richtet einen neuen Passkey ein.
Jede Person soll zwei Passkeys haben, etwa Telefon und Rechner. „Mein Konto“ weist darauf hin, solange
es nur einer ist.

**13. Einrichtung beim Einlösen der Einladung.** Der Einladungscode meldet einmalig an
(Einmal-Anmeldung des Anmeldedienstes, `token_hash` nach ANN-043). Die Seite verlangt sofort Passkey
und PIN; ohne Passkey ist die Einrichtung nicht abgeschlossen. Wer abbricht, braucht eine neue
Einladung. Das gilt für Plattform- und Praxiskonten (ADR-023 Punkt 8, STAFF-005).

**14. Notzugang für den Inhaber.** Für das einzige `owner`-Konto gibt es niemanden, der neu einlädt
(Bus-Faktor 1, ADR-012). Hat es keinen Passkey mehr, erzeugt das Infrastruktur-Admin-Konto über die
Verwaltung des Anmeldedienstes eine Einmal-Anmeldung für dieses Konto. Das ist Break Glass nach
ADR-010 Punkte 8 und 10: Anlass, MFA, Begründung, Ende. Der Ablauf steht in der
Betriebsdokumentation (ADR-012). Vorbeugend hat `owner` mindestens zwei Passkeys.

**15. Entwicklung und Test-Umgebung.** Lokal und in der Test-Umgebung behalten die Testkonten ihr
Kennwort, damit automatisierte Tests und der erste Einstieg ohne Passkey möglich sind. Die Anmeldeseite
bietet diesen Weg nur, wenn `APP_ENVIRONMENT` nicht `production` ist, und nie auf der Sperrseite. In
Produktion gibt es ihn nicht; ein Test prüft das. Auf der Test-Umgebung werden nach dem ersten
Einstieg Passkey und PIN eingerichtet und wie im Betrieb benutzt.

## Konsequenzen

- **Ein eigenes Arbeitspaket vor dem Produktivstart:** SEC-EPIC-001 (Roadmap G20, Kriterium von M3).
  Es ist eine kritische Änderung nach ADR-013 Punkt 9 (Authentifizierung, Zugriffsregeln) mit
  Zweitreview.
- **Der Anmeldedienst muss mitspielen.** Höchstdauer und Inaktivität stehen im Anbieter erst ab dem
  bezahlten Tarif. Das gehört in OPS-001. Die Durchsetzung nach Punkt 6 hängt nicht daran, sie liegt in
  der eigenen Datenbank.
- **Ein kürzeres `jwt_expiry` verkleinert das Restfenster aus ANN-044.** Den Zielwert legt das
  Arbeitspaket fest; die 60 Minuten von heute sind kein Zielwert für den Produktivbetrieb (Jannes,
  2026-10-02).
- **Häufigere Anmeldung kostet Zeit am Hausbesuch.** Das ist der Grund für Punkt 7: Ein Passkey ist ein
  Blick oder ein Finger, kein Kennwort auf dem Telefon.
- **Nicht protokolliert:** Sperre und Freigabe sind keine Auditereignisse; die Anmeldung selbst steht im
  Protokoll des Anmeldedienstes. Ein abgewiesener Datenzugriff wegen abgelaufener Frist ist kein
  Berechtigungsfehler und schreibt keinen `denied`-Eintrag (ANN-115 gilt für fehlende Rollen).

**Aus Fassung 2:**

- **Eigenbau in engen Grenzen.** Die App-PIN ist das einzige selbst gebaute Prüfverfahren (§3.4,
  Ausnahme). Hash, Vergleich und Zufall kommen aus `pgcrypto`; selbst gebaut sind Fehlversuchszähler
  und Freigabevermerk. Kritische Änderung nach ADR-013 Punkt 9, mit Zweitreview.
- **Schwächer als ein Kennwort, begrenzt durch den Zähler.** Bei sechs Ziffern und fünf Versuchen je
  Passkey-Anmeldung trifft ein Dieb mit dem Gerät und einer gesperrten Sitzung mit etwa 1 zu 200 000.
  Ohne Gerät gibt es keine Sitzung und damit keinen Versuch.
- **Ohne PIN-Frist lebt eine Sitzung, bis sie endet.** Ein liegen gelassenes Gerät bleibt per PIN
  freigebbar, bis jemand abmeldet, „Alle Sitzungen beenden“ wählt, der Zugang gesperrt wird oder die
  Fehlversuche verbraucht sind. Wer ein Gerät verliert, beendet deshalb sofort alle Sitzungen.
- **Beta beim Anbieter.** Die Passkey-Schnittstelle kann sich ändern. Sie liegt hinter einem Modul der
  Anwendung, die Version der Bibliothek steht im Lockfile. Der Anmeldedienst verlangt die Prüfung der
  Person am Gerät nur bevorzugt (`preferred`). Die Anwendung fordert sie an, durchsetzen kann der
  Server es heute nicht. Ein Sicherheitsschlüssel ohne eigene PIN wäre damit Besitz allein:
  Restrisiko für OPS-001 und die Datenschutzprüfung.
- **Ohne Gerät mit Passkey kein eigenes Konto**, wie heute ohne Mailadresse (ADR-023 Punkt 7).
  Versorgt wird dann über eine Vertretung oder mit PDF.
- **Einstellungen je Umgebung.** Passkeys einschalten, Relying Party mit Name, Domain und Ursprüngen:
  lokal in `supabase/config.toml`, für die Test-Umgebung im Dashboard von `praxis-test` (Jannes), für
  Produktion mit G3.
- **Der Anmeldedienst kennt die Sperre nicht** (Zweitreview SEC-EPIC-002). Mit einem gesperrten Token
  ließe sich dort ein Passkey anlegen oder ein Kennwort setzen. Deshalb zählt ein Passkey nur
  freigegeben (ANN-329), und ein Kennwort über den Anmeldedienst lehnt ein Trigger ab (ANN-330);
  Anmeldelinks per Mail gibt es nur mit Anlass (ANN-331). Restlücke: Mit einem gesperrten Token lassen
  sich eigene Passkeys beim Anmeldedienst löschen - keine Übernahme, aber ein Aussperren bis zur
  neuen Einladung.
- **Für die Datenschutzprüfung.** Biometrische Merkmale verlassen das Gerät nicht. Der Anmeldedienst
  speichert nur den öffentlichen Schlüssel. Der PIN-Hash ist ein neues Datum am Konto und fällt mit
  ihm.

## Wahlpunkte — entschieden

**W1 — Inaktivitätsfrist.** (a) 30 Minuten, Vorschlag Jannes. (b) 15 Minuten. (c) Je Kontoart
verschieden. *Vorschlag (a)*, nach der Probewoche prüfen.

**W2 — Woher der Server die letzte Bedienung kennt.** (a) Ein eigener, leichter Vermerk je Sitzung, den
die Anwendung bei Bedienung höchstens einmal je Minute schreibt. (b) Der Zeitpunkt der letzten
Token-Erneuerung beim Anmeldedienst. *Vorschlag (a)*: (b) misst Netzwerkverkehr, nicht Bedienung.

**W3 — Passkeys in der Beta.** (a) Bauen hinter einem Schalter, scharf erst nach OPS-001. (b) Erst bauen,
wenn der Anbieter die Beta beendet. *Vorschlag (a)*: Rücknahme `klein`, ein Schalter.
*Entschieden mit Fassung 2 (Jannes, 2026-10-10): weder (a) noch (b). Gebaut ohne Schalter, eingeschaltet
in jeder Umgebung, deren Anmeldedienst Passkeys anbietet. Die Produktion entsteht erst mit G3 und geht
erst mit M3 in Betrieb; bis dahin läuft der Passkey auf der Test-Umgebung mit synthetischen Daten.*
