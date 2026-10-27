# ADR-024: Offline-Erfassung und Benachrichtigungen — schmaler Service Worker, Dokumentation und Durchführung ohne Netz, Mitteilungen ohne Inhalt
## Status
Angenommen (Jannes, 2026-10-11), Fassung 3 (2026-10-27); löst ADR-015 Punkt 16 ab, ergänzt ADR-025
um Punkt 16 (dort Fassung 4).

## Kontext
Erfassen ohne Netz und Benachrichtigungen nach Regeln (B15) brauchen einen Service Worker, den
ADR-015 Punkt 16 ausschloss; das beantwortet auch ADR-001 Punkt 6 samt Folgefragen, ADR-023 Punkt 18
und DSN-001 Abschnitt 10. Nicht Bestandteil: Online-Terminanfrage (B15), Wahl des SMTP-Anbieters
(B13, eigener ADR), Schema und Wortlaut (SPEC nach ADR-014, Texte in `src/lib/begriffe.ts`), mehr
Offline für Praxisgeräte als Punkt 6 (eigener ADR), Gerätemanagement und Fernlöschung (erst bei mehr
Diensttelefonen, als von Hand einrichtbar), interne Teamkommunikation (§10).

## Entscheidung
Abschnitt A (Punkte 1 bis 3) Service Worker, B (4 bis 9) Offline-Erfassung, C (10 bis 18)
Benachrichtigungen.

1. **Ein eigener, schmaler Service Worker mit genau zwei Aufgaben** (W5: eine Datei, Liste aus dem
   Build-Manifest von Vite, keine neue Abhängigkeit): das Gerüst vorhalten (statische Dateien des
   Builds samt `marke/`), damit die Anwendung ohne Netz startet und sagt, was geht, und Push
   empfangen und zeigen. Er beantwortet keine Anfrage an Datenbank, Anmeldedienst oder Dateiablage
   und legt keine solche Antwort ab; generisches Caching von Anwendungs- oder Patientendaten bleibt
   ausgeschlossen. Die Liste steht an einer Stelle und enthält nur Dateien des Builds, alles andere
   geht unverändert ins Netz, nie aus dem Speicher; ein Test prüft beides.
2. **Eine neue Fassung übernimmt nie mitten in der Arbeit:** im Hintergrund geladen, gültig ab dem
   nächsten Start oder „Neu laden“; alte Gerüste fallen dabei.
3. **Das Gerüst trägt keine Personendaten,** ist für alle Konten gleich und darf auf jedem Gerät
   liegen, auch dem Praxisgerät; Daten ohne Netz regelt nur Abschnitt B.
4. **Ohne Netz geht in V1 genau zweierlei** (W1): Plattformkonten führen einen zugewiesenen Plan
   durch (abhaken, Einheit beenden, mit TRK-EPIC-001 Angaben je Durchgang), in Behandlung wie
   Training (ADR-021); Praxiskonten lesen den eigenen Tagesplan und schreiben am Termin die
   Behandlungsdokumentation als Entwurf. Alles andere nur online, vor allem was Antwort, Frist oder
   Erklärung auslöst (Rückfrage, Nachricht, Terminwunsch, Check-in, Einwilligung, Widerruf,
   Kündigung, Export; Akte, Kalender ändern, Finalisieren, Abrechnung).
5. **Gerät der Person** (W2 a: IndexedDB, keine eigene Verschlüsselung, Schutz durch Gerätesperre
   und Geräteverschlüsselung): nur der zugewiesene, laufende Plan des eigenen Zugangs mit genau den
   Feldern der Durchführung, Stand des letzten Ladens mit Verbindung, und die Warteschlange nicht
   übertragener Haken. Gelöscht wird beim Abmelden, beim Kontowechsel, nach der Übertragung
   (Warteschlange), sobald der Server Plan oder Zugang nicht mehr gelten lässt, spätestens sieben
   Tage nach dem letzten Laden mit Verbindung (eine Konstante an einer Stelle).
6. **Praxisgerät** (W1 c; Rücknahme `mittel`: ein Schalter im Ablagemodul, Entwürfe vorher
   übertragen): nur der eigene Tagesplan von heute (je Termin Uhrzeit, Terminart, Name,
   Hausbesuchsadresse, Telefon, Stand des letzten Ladens mit Verbindung; nichts sonst aus der Akte,
   kein Befund, keine Diagnose, frühere Dokumentation oder Verordnung; Feldliste im SPEC an einer
   Stelle, neue Spalte nur mit Review) und eigene, ohne Netz am Termin dieses Plans geschriebene
   Entwürfe bis zur Übertragung. a) Nur auf einem eingerichteten Diensttelefon: je Gerät aus,
   eingeschaltet unter „Mein Konto“ mit Bestätigung der Gerätevorgabe (Sperre mit Code oder
   Biometrie, Geräteverschlüsselung, aktuelles Betriebssystem, kein Privatgerät, kein geteiltes
   Gerätekonto), die die Praxis verantwortet, die Anwendung nicht prüfen kann
   (Betriebsdokumentation, ADR-012); sonst nur Text im Speicher der Seite (ANN-319); echte Daten
   erst nach der DSFA (ADR-007). b) Der Tagesplan fällt am Tagesende, beim Abmelden, Kontowechsel
   und bei gesperrtem Konto (nächster Start mit Verbindung). c) Ein Entwurf fällt nie von selbst
   (§13), erst wenn der Server ihn angenommen hat; beim Abmelden mit nicht übertragenen Entwürfen
   Zahl und Wahl, erst zu übertragen, Verwerfen nur ausdrücklich; andere Konten sehen sie nie.
   d) Keine eigene Verschlüsselung; Schutz sind Gerätevorgabe und Sperre (Punkt 9). e) Finalisiert
   wird erst nach der Übertragung, auf dem Server (ADR-001 Punkt 4, ADR-016), die Frist aus ADR-016
   Punkt 7 läuft ab Eingang; bis dahin oben „Noch nicht übertragen“ mit Zahl, auch an Folgetagen
   (§ 630f BGB). f) Kein neues Auditereignis: Der Tagesplan ist auch online kein Aktenzugriff
   (ADR-010), Lesen ohne Netz schreibt nichts, der übertragene Entwurf steht im Datenmodell wie
   jeder andere.
7. **Übertragen wird additiv und wiederholbar:** Haken, Einheit und Offline-Entwurf tragen eine beim
   Erfassen vom Gerät vergebene UUID (ADR-014); der Server legt die Zeile an oder erkennt sie wieder
   (zweimal gesendet, einmal gespeichert) und überschreibt nichts, kein Last-Write-Wins (ADR-001
   Punkt 5). Liegt am Termin schon ein Entwurf oder ist die Dokumentation finalisiert, wird nicht
   eingemischt: beide Fassungen mit den Wegen aus ANN-320 (Nachtrag-Entwurf, Korrektur, Übernehmen
   von Hand). Eine Gerätekennung gewährt nichts (ADR-023 Punkt 19, ADR-004): Trifft sie eine fremde
   Zeile, antwortet der Server wie bei einer unbekannten, ein Negativfall jedes Weges mit
   Offline-Daten.
8. **Der Server urteilt beim Eingang:** Die Zeile trägt die Gerätezeit als Angabe der Person und den
   Eingang; Zugang, Plan, Termin, Rolle und Lesefrist (ANN-305) prüft der Server beim Eingang wie
   online, nie nach der Gerätezeit. Ein abgewiesener Haken wird mit Grund gezeigt, dann verworfen;
   ein abgewiesener Entwurf bleibt, bis die Person ihn ausdrücklich verwirft oder kopiert (§13). Bis
   nichts mehr wartet, zeigt die Ansicht „auf dem Gerät“ oder „übertragen“ (ADR-001).
9. **Die Sitzungssperre gilt auch ohne Netz, freigegeben wird dann per Passkey am Gerät** (ADR-025
   Punkt 16, §3.4 zweite Ausnahme): Läuft eine Frist aus ADR-025 ab, sperrt die Anwendung wie sonst
   und zeigt nichts; ohne Netz bietet die Sperrseite die Freigabe per Passkey an. Die Zeremonie
   führt der Browser mit `userVerification: required` und einem Passkey des eigenen Kontos, die
   Anwendung prüft die Signatur mit Web Crypto gegen den öffentlichen Schlüssel, den sie bei der
   letzten Freigabe mit Netz abgelegt hat. Freigegeben werden nur die Daten auf dem Gerät (Punkte 5
   und 6), nie eine Sitzung beim Server; übertragen wird erst nach einer Freigabe mit Netz (ADR-025
   Punkt 7). Die App-PIN gibt ohne Netz nie frei (ADR-025 Punkt 11); ohne Passkey am Gerät ist ohne
   Netz nichts zu sehen, die Entwürfe bleiben gesichert. Die Fristen aus ADR-025 Punkte 1 und 2
   gelten auch hier.
10. **Die Übersicht zeigt, was zu tun ist;** eine Benachrichtigung weist nur darauf hin. Die
    Plattform bleibt ohne jede Benachrichtigung voll nutzbar (DSN-001), die Praxis hat die Offenen
    Punkte.
11. **Drei Wege hinter einem Adapter** (Grundsatz 5; `mock`, `smtp`, `webpush`): Mail als Regelweg
    für Plattformkonten (SMTP-Anbieter aus B13), Push (W3) zusätzlich je Gerät wählbar über den
    Push-Dienst des Browsers, beide bis zur Prüfung (B13, Punkt 18) nur `mock`, das lokal und im
    Test in ein von Tests gelesenes Postfach oder eine Liste zustellt; SMS nicht in V1, später nur
    mit eigenem Anbieter und ADR. Messenger (B15) und ein Benachrichtigungsdienst mit Inhalt
    (etwa ein Messaging-Anbieter, der die Texte sieht) sind ausgeschlossen.
12. **Mitarbeitende werden in der Anwendung benachrichtigt, nicht auf dem Telefon** (W4): Was die
    Praxis tun soll (neue Rückfrage, Terminwunsch, überschrittene Antwortzeit, Kündigung), steht in
    den Offenen Punkten mit Zähler; keine Mail, kein Push an Mitarbeitende, keine Lesebestätigung,
    keine Auswertung, wer wann reagiert hat (§20). *(Fassung 2)* Ausgenommen sind Rückmeldungen nach
    §20.2: Wer namentlich antwortet, gibt selbst zu erkennen, dass und in welchem Monat; eine Liste,
    wer nicht geantwortet hat, gibt es nicht. Der Hinweis auf das Barometer kommt nur in der
    Anwendung, auch als Fenster zu passenden Zeitpunkten (ANN-603), nie als Push oder Mail.
13. **Ein geschlossener Katalog, kein freier Text:** jede Art an einer Stelle mit festem Text,
    erlaubten Wegen und Angabe, ob Ruhezeiten gelten (SPEC von KOM-EPIC-003); keine Werbung, keine
    Angebote, kein Hinweis auf Abo oder Paket. Eine neue Art ist eine Katalogänderung mit Review,
    kein Text im Code einer Ansicht.
14. **Eine Benachrichtigung trägt keine Gesundheitsdaten** (`IDEA-KOM-006`): Art und höchstens Datum
    und Uhrzeit, nie Leistungsbereich, behandelnde Person, Ort, Übung, Nachrichteninhalt oder
    Betrag. Push trägt nur Katalogschlüssel und gegebenenfalls Datum und Uhrzeit, den Text setzt der
    Service Worker aus seinem Katalog, das Gerät holt nichts nach. Eine Mail hat keinen Anmeldelink
    und keine Kennung, ihr Link führt auf die Startseite (ADR-025 Punkt 10, ANN-331); kein
    Zählpixel, keine Klickverfolgung.
15. **Die Person entscheidet je Art und Weg, Abschalten kostet nichts:** anfangs alles aus,
    eingeschaltet im Einstieg nach der ersten Anmeldung (DSN-001 Abschnitt 4.3) oder unter „Ich“,
    Wahl mit Zeitpunkt am Zugang (Sicht der Praxis: ANN-344), je Zugang (Vertretung für den eigenen;
    für die vertretene Person sie selbst oder ihre rechtliche Vertretung). Ruhezeit (Vorschlag 20
    bis 8 Uhr, je Person änderbar): Was hineinfiele, kommt am nächsten Morgen oder entfällt, wenn
    sinnlos. Höchstens eine je Art und Tag und eine Zahl je Woche über alle Arten (Vorschlag zehn),
    darüber nichts, die Übersicht zeigt es trotzdem; *(Fassung 3)* die Tagebucherinnerung (ADR-027
    Punkt 12) höchstens einmal je Mahlzeit, Tag und Weg, außerhalb der Wochengrenze, und sie
    entfällt, wenn sie beim Abholen älter als zwei Stunden ist oder Uhrzeit, Tagebuch oder
    Einwilligung sich änderten (ANN-662). Kein Nachfassen. Ruhezeit, Obergrenzen und Zeitpunkt der
    Terminerinnerung sind Konstanten an einer Stelle; `owner` schaltet eine Art nur für
    alle ab, nie für eine Person ein.
16. **Versendet wird aus einem Auftragsbuch in der Datenbank:** Ein Ereignis legt einen
    Zustellauftrag an (Empfänger-Zugang, Art, Zeitpunkt, Weg, Zustand), ein Zeitplan (`pg_cron`)
    übergibt fällige dem Versand, einer serverseitigen Funktion mit SMTP-Zugangsdaten und privatem
    VAPID-Schlüssel (RFC 8292) als Secret, nie im Browser; sie läuft als Edge Function und wird wie
    der Zugangsdienst erst mit OPS-001 scharf (ADR-023 Punkt 9). Ein abgewiesener Endpunkt löscht
    die Registrierung des Geräts; Fehlschläge werden begrenzt wiederholt, dann aufgegeben.
17. **Gespeichert wird so wenig und so kurz wie möglich:** Der Zustellauftrag trägt
    Katalogschlüssel, Zeitpunkte und Zustand, keinen Text, keine Adresse als Kopie, mit kurzer Frist
    nach dem Versand (Klasse `benachrichtigung`, `retention.test.ts`). Die Push-Registrierung je
    Gerät (Endpunkt und Schlüssel des Browsers) fällt beim Abmelden auf dem Gerät, bei abgewiesenem
    Endpunkt, mit Zugang und Konto. Kein Auditereignis (ADR-010 bleibt), die Wahl steht am
    Datensatz; Betriebslogs (ADR-011) tragen Auftragskennung, Weg und Ergebnis, nie Mailadresse,
    Endpunkt oder Text.
18. **Web-Push ist ein Datenweg nach ADR-002,** vor dem Scharfschalten zu prüfen: Der Inhalt ist
    beim Push-Dienst unlesbar (RFC 8291) und ohne Gesundheitsdatum (Punkt 14); Endpunkt, Zeitpunkt,
    Größe, Absenderkennung und Verbindung des Geräts gehen an den Browserhersteller, oft in den USA,
    ein Vertrag mit der Praxis ist nicht möglich. Minderung: kurze Gültigkeit je Nachricht
    (Vorschlag 24 Stunden), Absenderkennung ohne Personenbezug, Push nur nach ausdrücklicher Wahl
    auf dem Gerät (Browserabfrage, Punkt 15). Bis B2 und DSFA (ADR-007) antworten, ist Push gebaut
    und mit `mock` getestet, aber nicht scharf (§15.2).

## Konsequenzen
- ANN-305 fällt mit TRK-EPIC-003: Ohne Verbindung wartet der Haken. Für Praxiskonten gilt dasselbe
  am Termin mit OFF-EPIC-001; ANN-319, ANN-320 (ohne Einrichtung) und ANN-015 bleiben.
- Web-Push unter iOS nur mit `display: standalone` (ab iOS 16.4), nicht mit `minimal-ui` (ANN-110).
- Keine Fernlöschung: „Alle Sitzungen beenden“ nimmt die Sitzung, nicht die Ablage; Ungesendetes
  geht mit dem Gerät verloren, daher überträgt die Anwendung bei jeder Verbindung sofort.

## Offene Folgefragen
Bis B2 und die DSFA antworten, gelten die Punkte als vorläufige Festlegung, je an einer Stelle
verankert:

- Sind Tagesplan und nicht übertragene Dokumentation auf dem Diensttelefon (Punkt 6) vertretbar?
- Genügt die Wahl (Punkt 15) für Terminerinnerungen per Mail, oder braucht es Art. 9 Abs. 2 lit. a
  DSGVO?
- Genügt Transportverschlüsselung für eine Mail ohne Gesundheitsdatum (Punkt 14, ANN-041)?
- Ist Web-Push mit den Metadaten aus Punkt 18 zulässig?

## Änderungshistorie
- Fassung 1 (2026-10-11, Jannes): W1 (c) statt (a) mit Passkey-Freigabe, W2 bis W5 wie empfohlen.
- Fassung 2 (2026-10-17, Jannes): Punkt 12 nimmt Rückmeldungen nach §20.2 aus (Prinzipien 0.27).
- Fassung 3 (2026-10-27): Punkt 15 nennt die Tagebucherinnerung aus ADR-027 Punkt 12 (war ANN-662).
- Verdichtet 2026-10-27 (Aufräumen 5), Inhalt unverändert; früherer Wortlaut: `git log -p`.
