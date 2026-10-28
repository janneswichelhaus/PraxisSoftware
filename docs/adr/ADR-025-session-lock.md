# ADR-025: Sitzungssperre — erneute Freigabe nach Frist und Inaktivität, serverseitig durchgesetzt
## Status
Angenommen in den Anforderungen (2026-10-02, Jannes), Fassung 4 (2026-10-11); W1 bis W3 entschieden
(Punkte 2, 6, 10). Löst keinen ADR ab; ergänzt ADR-023 Punkte 17 und 18 um eine Sperre, die der
Anmeldedienst allein nicht leistet.

## Kontext
Diensttelefon im Hausbesuch und Praxisrechner bleiben liegen, werden weitergegeben oder gehen
verloren; ein entsperrtes Gerät zeigte die Akten des Tages, bis sich jemand abmeldet. Sitzungen
führt der Anmeldedienst (ADR-023 Punkt 17): Sein Erneuerungstoken läuft nicht ab, seine Höchstdauer
und Inaktivitätsfrist greifen nur beim Erneuern des Tokens und nur im bezahlten Tarif.

## Entscheidung
1. **Höchstdauer: 60 Minuten.** Spätestens 60 Minuten nach der Anmeldung oder der letzten erneuten
Freigabe weist sich die Person erneut aus, auch wenn sie gearbeitet hat; ein kurzes Ausschalten des
Bildschirms oder ein Wechsel in eine andere App verlangt innerhalb dieser 60 Minuten keine
Anmeldung.
2. **Inaktivitätssperre: 30 Minuten** (W1 a, Jannes 2026-10-06; nach der Probewoche zu prüfen): Hat
die Person 30 Minuten nichts in der Anwendung bedient (Eingabe, Tipp, Klick; ein Hintergrund-Abruf
zählt nicht), sperrt sich die Anwendung, auch vor Ablauf der 60 Minuten; im Hintergrund läuft die
Frist weiter.
3. **Sperren ist nicht Abmelden:** Die Sitzung bleibt, ihre Daten nicht. Gesperrt zeigt die
Oberfläche nur die Sperrseite, ohne Namen, Akte oder Termin; zwischengespeicherte Antworten mit
Patientendaten werden aus dem Speicher der Seite entfernt; nach der Freigabe kehrt die Person an
dieselbe Stelle zurück. Das Abmelden bleibt, wie es ist (ANN-044, ANN-045).
4. **Ungespeicherte Dokumentation geht nicht verloren:** Vor der Sperre wird ein offener Text als
Entwurf gesichert (ADR-016), auf dem Weg von „Speichern" im Navigationsschutz (ANN-046); gelingt das
nicht, bleibt er im Speicher der Seite und erscheint nach der Freigabe wieder, nie unverschlüsselt
dauerhaft auf dem Gerät (ADR-001). Gibt sich bei der Freigabe ein anderes Konto aus, verfällt er wie
bei jedem Kontowechsel (`SessionProvider`).
5. **Erst prüfen, dann zeigen:** Bei jeder Rückkehr (Bildschirm an, App im Vordergrund, Fenster im
Fokus, Neuladen) prüft die Anwendung zuerst beide Fristen; abgelaufen heißt Sperrseite, bevor ein
Patientendatum sichtbar wird, auch nicht für einen Augenblick.
6. **Die Regel gilt auch im Server** (ADR-004): Die Datenbank prüft bei jeder Anfrage dieselben
Fristen an einer Stelle (`app.session_open`), für Praxiskonten in `app.current_organization_id()`,
für Plattformkonten in `app.platform_readable_access` (ADR-023 Punkt 19), sodass jede Policy,
Projektion und jeder Schreibweg die Sperre erbt; Grundlage sind die letzte Authentifizierung aus dem
Token (`amr`) und die letzte Bedienung als leichter Vermerk je Sitzung, höchstens einmal je Minute
bei Bedienung geschrieben (W2 a, `public.session_activity`). Zweite Linie sind Höchstdauer und
Inaktivität des Anmeldedienstes (bezahlter Tarif, OPS-001) und ein kürzeres `jwt_expiry`, dessen
Zielwert das Arbeitspaket festlegt; die heutigen 60 Minuten sind kein Zielwert für den
Produktivbetrieb (Jannes, 2026-10-02). Ein Test meldet ein Konto mit abgelaufener Frist an und
verlangt wie `plattform-abschottung.test.ts`: keine Zeile, jeder Aufruf abgewiesen. Sperre, Freigabe
und eine Abweisung wegen Frist schreiben nichts ins Auditlog, auch kein `denied` (ANN-115 gilt für
fehlende Rollen); die Anmeldung protokolliert der Anmeldedienst.
7. **Freigabe per Passkey, Rückweg App-PIN, kein Kennwort** *(Fassung 2)*: Die erneute Freigabe
läuft über einen Passkey des eigenen Kontos (Gesicht, Finger oder Geräte-PIN), nur wenn er nicht
klappt über die App-PIN (Punkt 11); ein Kennwort gibt es nicht (Punkt 9). Liefert die Freigabe ein
anderes Konto, ist das ein Kontowechsel, keine Freigabe.
8. **Für alle Konten:** Die Sperre gilt für Praxis- und Plattformkonten (ADR-023 Punkt 17); die
Fristen sind je Kontoart eine Konstante an einer Stelle, mit den Werten aus Punkt 1 und 2 für beide,
bis das Arbeitspaket anderes begründet.
9. **Kein Kennwort** *(Fassung 2, Punkte 9 bis 15)*: Konten haben keins, und die Anwendung fragt
keins ab, weder bei Anmeldung noch Freigabe noch beim Einlösen einer Einladung; `/kennwort-neu`
entfällt, ein Kennwort über den Anmeldedienst lehnt ein Trigger ab (ANN-330), Anmeldelinks per Mail
gibt es nur mit Anlass (ANN-331). Ausnahme sind Entwicklung und Test-Umgebung (Punkt 15).
10. **Der Passkey ist die Anmeldung** (WebAuthn beim Anmeldedienst, erster Faktor) und gibt frei,
ohne Schalter der Anwendung in jeder Umgebung, deren Anmeldedienst Passkeys anbietet (W3; Produktion
erst mit G3, in Betrieb mit M3). Eingerichtet wird er beim Einlösen der Einladung (Punkt 13);
weitere Geräte bekommen einen eigenen unter „Mein Konto" oder nutzen den des Telefons
(Schlüsselbund, am Rechner per QR-Code). Jede Zeremonie fordert die Prüfung der Person am Gerät an
(`userVerification: required`); für Punkt 6 zählt die Anmeldeart `passkey` im Claim `amr` als
Anmeldung, ein Passkey nur freigegeben (ANN-329). Biometrische Merkmale verlassen das Gerät nicht,
der Anmeldedienst hält nur den öffentlichen Schlüssel.
11. **Die App-PIN gibt frei, sie meldet nie an** (§3.4, Ausnahme): Jedes Konto legt beim Einrichten
eine fest. Sie gibt nur eine bestehende, gesperrte Sitzung auf demselben Gerät frei, nicht auf einem
neuen Gerät, nach dem Abmelden oder für ein anderes Konto. Geprüft wird sie nur in der Datenbank,
gehalten nur als bcrypt-Hash, nie im Klartext, im Log oder auf dem Gerät; Hash, Vergleich und Zufall
kommen aus `pgcrypto`, selbst gebaut sind nur Fehlversuchszähler und Freigabevermerk; der Hash fällt
mit dem Konto. Sie ist nur der Rückweg *(Fassung 3)*: Sperr- und Anmeldeseite öffnen das
Passkey-Fenster beim Erscheinen von selbst, die PIN-Eingabe steht nur auf der Sperrseite dahinter
bereit, ohne Umweg über eine Nachfrage. Keine Uhr wechselt den Weg, keine Frist begrenzt die PIN,
neu freigegeben wird trotzdem nach Punkt 1 und 2. Nach wenigen Fehlversuchen in Folge ist die
Sitzung beendet, weiter nur per Passkey. Sie darf keine triviale Folge sein (gleiche Ziffern, auf-
oder absteigende Reihe). Länge und Zahl der Fehlversuche sind Konstanten an einer Stelle, die das
Arbeitspaket festlegt (`app.pin_problem`: sechs Ziffern, `app.pin_max_attempts`: fünf). Eine
Freigabe per PIN startet die Uhr aus Punkt 1 neu wie eine Anmeldung und steht wie die letzte
Bedienung als Vermerk an der Sitzung (`public.session_unlocks`).
12. **Vergessen, verloren, neues Gerät:** PIN vergessen: Freigabe per Passkey, dann neue PIN unter
„Mein Konto". Passkey verloren oder kein Gerät mehr: neue Einladung für das bestehende Konto
(ADR-023 Punkt 10), die einen neuen Passkey einrichtet. Jede Person soll zwei Passkeys haben; „Mein
Konto" weist darauf hin, solange es einer ist. Eine gesperrte Sitzung bleibt per PIN freigebbar, bis
jemand abmeldet, „Alle Sitzungen beenden" wählt, der Zugang gesperrt wird oder die Fehlversuche
verbraucht sind; wer ein Gerät verliert, beendet deshalb sofort alle Sitzungen.
13. **Einrichtung beim Einlösen der Einladung:** Der Einladungscode meldet einmalig an
(Einmal-Anmeldung des Anmeldedienstes, `token_hash` nach ANN-043); die Seite verlangt sofort Passkey
und PIN, ohne Passkey ist die Einrichtung nicht abgeschlossen, wer abbricht, braucht eine neue
Einladung. Das gilt für Plattform- und Praxiskonten (ADR-023 Punkt 8, STAFF-005).
14. **Notzugang für den Inhaber:** Hat das einzige `owner`-Konto (Bus-Faktor 1, ADR-012) keinen
Passkey mehr, erzeugt das Infrastruktur-Admin-Konto über die Verwaltung des Anmeldedienstes eine
Einmal-Anmeldung dafür: Break Glass nach ADR-010 Punkte 8 und 10, Ablauf in der
Betriebsdokumentation (ADR-012). Vorbeugend hat `owner` mindestens zwei Passkeys.
15. **Entwicklung und Test-Umgebung:** Dort behalten Testkonten ihr Kennwort für automatisierte
Tests und den ersten Einstieg; die Anmeldeseite bietet den Weg nur, wenn `APP_ENVIRONMENT` nicht
`production` ist, und nie auf der Sperrseite; in Produktion gibt es ihn nicht, ein Test prüft das.
Auf der Test-Umgebung werden nach dem ersten Einstieg Passkey und PIN eingerichtet und wie im
Betrieb benutzt. Passkeys und Relying Party (Name, Domain, Ursprünge) werden je Umgebung
eingestellt: lokal in `supabase/config.toml`, für die Test-Umgebung im Dashboard von `praxis-test`
(Jannes), für Produktion mit G3.
16. **Ohne Netz gibt der Passkey am Gerät frei, aber nur, was auf dem Gerät liegt** *(Fassung 4;
§3.4, zweite Ausnahme)*: Gesperrt und ohne Verbindung bietet die Sperrseite die Freigabe per Passkey
an, wenn die Anwendung bei der letzten Freigabe mit Netz den öffentlichen Schlüssel eines Passkeys
des eigenen Kontos abgelegt hat; der Browser führt die Zeremonie mit `userVerification: required`,
die Signatur prüft Web Crypto gegen diesen Schlüssel, selbst gebaut ist nur die Entscheidung, die
lokale Ansicht zu öffnen. Sie öffnet nur die Ablage nach ADR-024 Punkte 5 und 6, erneuert keine
Sitzung beim Server, setzt keinen Freigabevermerk und startet die Uhr aus Punkt 1 nur für die lokale
Ansicht neu. Mit Verbindung verlangt die Anwendung vor jeder Übertragung die Freigabe nach Punkt 7.
Die App-PIN gibt ohne Netz nie frei.

## Konsequenzen
- Passkeys sind beim Anbieter Beta: Die Schnittstelle kann sich ändern, liegt hinter einem Modul,
die Bibliotheksversion steht im Lockfile; die Prüfung der Person verlangt der Anmeldedienst nur
`preferred`, ein Sicherheitsschlüssel ohne eigene PIN wäre Besitz allein (Restrisiko: OPS-001, B2).
- Restrisiken: Der Anmeldedienst kennt die Sperre nicht, mit gesperrtem Token lassen sich eigene
Passkeys löschen (Aussperren bis zur neuen Einladung, keine Übernahme); die PIN errät ein Dieb mit
Gerät und gesperrter Sitzung mit etwa 1:200 000; ohne Netz ist die Freigabe so stark wie das Gerät.

## Änderungshistorie
- Fassung 1 (2026-10-02, Jannes): Punkte 1 bis 8 aus der Abnahme von Block 1 der Annahmen, Entwürfe
gehen nicht verloren, Prüfung vor dem ersten Zeichnen; W1 (a) 30 Minuten (Jannes, 2026-10-06) und
W2 (a) entschieden, gebaut in SEC-EPIC-001 (ANN-256, ANN-257).
- Fassung 2 (2026-10-10, Jannes): Passkey als Anmeldung, App-PIN als Rückweg der Freigabe, kein
Kennwort, W3 ohne Schalter (Punkte 7, 9 bis 15; §3.4, ADR-023 Fassung 4); gegen die Empfehlung
(Geräte-PIN, Kennwort als Notfallweg) in Kenntnis der Folgen; gebaut in SEC-EPIC-002 (G22,
ANN-324 bis ANN-331).
- Fassung 3 (2026-10-11, Jannes): Punkt 11, Passkey-Fenster von selbst, PIN dahinter statt erst auf
„Passkey klappt nicht".
- Fassung 4 (2026-10-11, Jannes): Freigabe ohne Netz per Passkey, nur für die Daten auf dem Gerät
(Punkt 16, ADR-024), gebaut in TRK-EPIC-003; die App-PIN prüft weiter nur der Server.
- Verdichtet 2026-10-27 (Aufräumen 5), Inhalt unverändert; früherer Wortlaut: `git log -p`.
