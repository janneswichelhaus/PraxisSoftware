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

## Datum

2026-10-02

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

**7. Freigabe möglichst per Passkey.** Die erneute Freigabe läuft bevorzugt über einen Passkey
(Biometrie oder Geräte-PIN des eigenen Geräts). Rückweg ist das Kennwort, mit zweitem Faktor, wo einer
eingerichtet ist (ANN-028). Ein Passkey wird nur für das eigene Konto angenommen: Liefert die Freigabe
ein anderes Konto, ist das ein Kontowechsel und keine Freigabe. Solange der Anmeldedienst Passkeys nur
als Beta anbietet, steht ihre Nutzung hinter einem Schalter an einer Stelle. Freigeschaltet wird sie,
wenn die Providerprüfung (OPS-001) sie bestätigt (W3).

**8. Für alle Konten.** Die Sperre gilt für Praxis- und Plattformkonten (ADR-023 Punkt 17). Die beiden
Fristen sind je Kontoart eine Konstante an einer Stelle. Die Werte aus den Punkten 1 und 2 gelten für
beide, bis das Arbeitspaket etwas anderes begründet.

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

## Wahlpunkte — offen bis SEC-EPIC-001

**W1 — Inaktivitätsfrist.** (a) 30 Minuten, Vorschlag Jannes. (b) 15 Minuten. (c) Je Kontoart
verschieden. *Vorschlag (a)*, nach der Probewoche prüfen.

**W2 — Woher der Server die letzte Bedienung kennt.** (a) Ein eigener, leichter Vermerk je Sitzung, den
die Anwendung bei Bedienung höchstens einmal je Minute schreibt. (b) Der Zeitpunkt der letzten
Token-Erneuerung beim Anmeldedienst. *Vorschlag (a)*: (b) misst Netzwerkverkehr, nicht Bedienung.

**W3 — Passkeys in der Beta.** (a) Bauen hinter einem Schalter, scharf erst nach OPS-001. (b) Erst bauen,
wenn der Anbieter die Beta beendet. *Vorschlag (a)*: Rücknahme `klein`, ein Schalter.
