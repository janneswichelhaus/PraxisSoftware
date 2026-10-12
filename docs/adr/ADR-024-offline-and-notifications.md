# ADR-024: Offline-Erfassung und Benachrichtigungen — schmaler Service Worker, Dokumentation und Durchführung ohne Netz, Mitteilungen ohne Inhalt

## Status

**Angenommen** (2026-10-11, Jannes). **W1 anders als empfohlen: (c)** — „Bei Konkurrenten wie
iPrax ist eine Dokumentation ohne Empfang möglich. Ich möchte diese Funktion auch haben.“ Dazu die
Freigabe ohne Netz per Passkey (Punkt 9), auf Rückfrage gewählt. **W2 bis W5 wie empfohlen.** Die
Punkte folgen aus §2.2, §3.4, §3.5, §10, §13, §18, §20 und den ADRs 001, 002, 008, 010, 011, 015,
016, 023 und 025. Rang 1 dazu: `PROJECT_PRINCIPLES.md` 0.26, §3.4 (zweite Ausnahme). KOM-EPIC-003
kann beginnen (Roadmap Block 6), TRK-EPIC-003 und OFF-EPIC-001 folgen in Block 7.

**Löst [ADR-015](ADR-015-initial-technical-stack.md) Punkt 16 ab:** Ein Service Worker ist erlaubt,
aber nur der aus Abschnitt A. Ein generisches Offline-Caching von Anwendungs- oder Patientendaten
bleibt ausgeschlossen. Die übrigen Punkte von ADR-015 bleiben. Beantwortet
[ADR-001](ADR-001-online-first-limited-offline.md) Punkt 6 (Mechanismus) und dessen Folgefragen, den
Verweis aus [ADR-023](ADR-023-platform-access.md) Punkt 18 und DSN-001
Abschnitt 10. **Ergänzt [ADR-025](ADR-025-session-lock.md)** um die Freigabe ohne Netz (dort
Fassung 4, Punkt 16).

## Datum

2026-10-11

## Kontext

Zwei Loops brauchen etwas, das ADR-015 Punkt 16 bisher ausschließt:

- **TRK-EPIC-003** (Block 7): „Erfassen geht auch ohne Netz." Trainingsräume im Keller sind der
  Regelfall (`IDEA-TRK-008`). Die Durchführungsansicht (UEB-EPIC-003) sendet heute jeden Haken
  sofort an den Server und nimmt ihn ohne Verbindung zurück; auf dem Gerät liegt nichts (ANN-305).
- **KOM-EPIC-003** (Block 6): „Wer etwas tun soll, erfährt es — nach Regeln." Automatische
  Terminerinnerung (B15, neu entschieden 2026-09-22), E-Mail vor SMS, Messenger ausgeschlossen,
  Versand hinter einem Adapter (Grundsatz 5), Regeln nach `IDEA-KOM-006`.

**Was heute besteht** (Stand `main`, 2026-10-11):

- **Kein Service Worker.** `public/manifest.webmanifest` macht die Anwendung installierbar
  (`display: minimal-ui`, ANN-110). iOS kennt `minimal-ui` nicht und öffnet im Browser.
- **Verbindungsanzeige** allein aus `navigator.onLine` und den Ereignissen `online`/`offline`,
  ohne Ping (ANN-015, `src/app/verbindung.ts`).
- **Textverlustschutz in der Dokumentation:** Der Text bleibt im Speicher der Seite, sichert sich
  nach drei Sekunden Pause als Entwurf auf dem Server (ANN-319) und wird im Konfliktfall Nachtrag
  oder Korrektur (ANN-320). Nichts davon liegt dauerhaft im Browser; `history.state` wird bewusst
  nicht benutzt.
- **Sitzungssperre** (ADR-025): spätestens nach 60 Minuten und nach 30 Minuten ohne Bedienung.
  Freigegeben wird per Passkey oder App-PIN, und **beides prüft nur der Server** (Punkte 7, 11).
  Ohne Netz lässt sich eine gesperrte Sitzung also nicht freigeben.
- **Mails:** Ein eigener SMTP-Anbieter ist als Richtung entschieden (B13, 2026-10-10), welcher,
  prüft Block 11. Gebaut wird hinter einem Adapter mit `mock`-Weg (ADR-023 Punkt 10). Die
  Terminmail aus dem eigenen Mailprogramm ist ein Handoff (ANN-041). Mitteilungen von Terminen
  stehen als Vermerk am Termin (ANN-040).
- **Offene Punkte** zeigen der Praxis, was zu tun ist, auch eine überschrittene Antwortzeit einer
  Rückfrage (KOM-EPIC-001). Die Plattform ist ohne Benachrichtigung benutzbar (DSN-001 Abschnitt 2,
  Satz 9).
- **Serverseitige Funktionen** laufen als Edge Function. Die Edge Runtime ist für produktive
  Gesundheitsdaten nicht freigegeben (ADR-015 Punkt 20, OPS-001). `pg_cron` ist vorhanden (ANN-007).

**Web-Push** läuft immer über den Push-Dienst des Browserherstellers: Apple für Safari und iOS,
Google für Chrome und Android, Mozilla für Firefox, Microsoft für Edge. Welchen, bestimmt der
Browser der Person, nicht die Praxis. Der Inhalt einer Push-Nachricht ist Ende-zu-Ende
verschlüsselt (RFC 8291), der Absender weist sich mit einem eigenen Schlüsselpaar aus (VAPID,
RFC 8292). Der Push-Dienst sieht den Endpunkt des Geräts, Zeitpunkt, Größe und Absenderkennung,
nicht den Inhalt. Unter iOS gibt es Web-Push nur für eine Anwendung auf dem Startbildschirm mit
`display: standalone` (seit iOS 16.4).

## Entscheidung

### A. Der Service Worker

**1. Ein eigener, schmaler Service Worker mit genau zwei Aufgaben** (**W5**):

- **Das Anwendungsgerüst vorhalten:** die statischen Dateien des Builds (Einstiegsseite,
  Skripte, Stile, Schrift, `marke/`), damit die Anwendung auch ohne Netz startet und sagt, was
  geht, statt der Fehlerseite des Browsers.
- **Push empfangen und eine Mitteilung zeigen** (Abschnitt C).

Er beantwortet **keine Anfrage an die Datenbank, den Anmeldedienst oder die Dateiablage** und legt
keine solche Antwort ab. Die Liste der vorgehaltenen Dateien entsteht beim Build aus dem
Build-Verzeichnis und steht an einer Stelle; alles andere geht unverändert ins Netz. Ein Test prüft
beides: Die Liste enthält nur Dateien des Builds, und eine Anfrage an einen anderen Ursprung oder
an einen Pfad außerhalb der Liste wird nicht aus dem Speicher beantwortet.

**2. Eine neue Fassung übernimmt nie mitten in der Arbeit.** Sie wird im Hintergrund geladen und
gilt ab dem nächsten Start oder auf „Neu laden". Alte Gerüste werden beim Übernehmen gelöscht.

**3. Das Gerüst trägt keine Personendaten.** Es ist für alle Konten gleich und darf deshalb auf
jedem Gerät liegen, auch auf dem Praxisgerät. Was ohne Netz an Daten da ist, regelt allein
Abschnitt B.

### B. Offline-Erfassung

**4. Ohne Netz geht in V1 genau zweierlei** (**W1**):

- **Plattformkonten:** die **Durchführung** eines zugewiesenen Plans — Durchgänge abhaken, die
  Einheit beenden und, sobald TRK-EPIC-001 sie bringt, die Angaben je Durchgang. Für den
  Heimübungsplan in der Behandlung wie für den Plan im Training, weil Ansicht und Risiko dieselben
  sind (ADR-021: dieselbe Mechanik, getrennte Verhältnisse). Punkt 5.
- **Praxiskonten:** den eigenen **Tagesplan lesen** und am Termin die **Behandlungsdokumentation
  als Entwurf schreiben**. Punkt 6.

**Nur online** bleibt alles andere, insbesondere was eine Antwort, eine Frist oder eine Erklärung
auslöst: Rückfrage, Nachricht, Terminwunsch, Check-in, Einwilligung, Widerruf, Kündigung, Export;
in der Praxis Akte, Kalender ändern, Finalisieren, Abrechnung. Bei Erklärungen zählt der Eingang,
und ein spät übertragener Widerruf wäre ein falsches Versprechen.

**5. Was auf dem Gerät der Person liegt** (**W2**). Für die Durchführung legt die Anwendung zwei
Dinge ab:

- **den Plan der Einheit** mit genau den Feldern der Durchführungsansicht, so wie er beim letzten
  Laden mit Verbindung war;
- **die Warteschlange** der noch nicht übertragenen Haken.

Die Grenzen:

- Nur der **zugewiesene, laufende Plan** des eigenen Zugangs, keine Nachrichten, keine Termine,
  keine Rechnungen, nichts aus der Akte.
- **Gelöscht** wird beim Abmelden, beim Kontowechsel, nach erfolgreicher Übertragung (die
  Warteschlange), sobald der Server beim nächsten Laden sagt, dass Plan oder Zugang nicht mehr
  gelten, und spätestens **sieben Tage** nach dem letzten Laden mit Verbindung. Die Frist ist eine
  Konstante an einer Stelle.
- **Keine eigene Verschlüsselung.** Der Schlüssel läge auf demselben Gerät und schützte vor dem,
  der das Gerät entsperrt in der Hand hat, nicht. Schutz sind Gerätesperre und
  Geräteverschlüsselung des eigenen Telefons. Der Plan liegt der Person ohnehin als PDF vor
  (UEB-EPIC-003); was die Anwendung ablegt, ist nicht mehr als das.

**6. Was auf dem Praxisgerät liegt** (**W1 c**). Damit am Hausbesuch ohne Empfang dokumentiert
werden kann, legt die Anwendung für ein Praxiskonto zwei Dinge ab:

- **den eigenen Tagesplan von heute**: je Termin Uhrzeit, Terminart, Name, Hausbesuchsadresse und
  Telefon, so wie er beim letzten Laden mit Verbindung war. Kein Befund, keine Diagnose, keine
  frühere Dokumentation, keine Verordnung, nichts aus der Akte darüber hinaus. Die Feldliste legt
  der SPEC an genau einer Stelle fest (ADR-001: „sonst wächst sie zur Vollakte"); eine neue Spalte
  ist eine Änderung mit Review.
- **eigene Dokumentationsentwürfe**, die ohne Netz am Termin dieses Plans geschrieben wurden, bis
  sie übertragen sind.

Die Grenzen:

- **Nur auf einem eingerichteten Diensttelefon.** Die Ablage ist je Gerät aus. Eingeschaltet wird
  sie unter „Mein Konto" mit der Bestätigung der Gerätevorgabe: Gerätesperre mit Code oder
  Biometrie, Geräteverschlüsselung, aktuelles Betriebssystem, kein Privatgerät, kein geteiltes
  Gerätekonto. Die Anwendung kann das nicht prüfen; die Vorgabe steht in der
  Betriebsdokumentation (ADR-012), und die Praxis verantwortet sie. Ohne Einrichtung gilt für das
  Gerät dasselbe wie bisher: Text im Speicher der Seite (ANN-319), sonst nichts.
- **Der Tagesplan fällt am Ende des Tages**, beim Abmelden, beim Kontowechsel und sobald das
  Konto gesperrt ist (nächster Start mit Verbindung).
- **Ein Entwurf fällt nie von selbst** (§13: Dokumentation darf nicht verloren gehen). Er fällt
  erst, wenn der Server ihn angenommen hat. Wer sich mit nicht übertragenen Entwürfen abmelden
  will, bekommt die Zahl und die Wahl, erst zu übertragen; verwirft er sie, ist das ausdrücklich.
  Ein anderes Konto auf demselben Gerät sieht sie nie.
- **Keine eigene Verschlüsselung**, aus demselben Grund wie in Punkt 5. Der Schutz sind
  Gerätevorgabe und die Sperre aus Punkt 9.
- **Finalisiert wird erst nach der Übertragung** (ADR-001 Punkt 4), auf dem Server, auf dem Weg
  aus ADR-016. Die Frist der automatischen Finalisierung (ADR-016 Punkt 7) beginnt mit dem
  Eingang. Solange Entwürfe nur auf dem Gerät liegen, zeigt die Anwendung oben „Noch nicht
  übertragen" mit der Zahl, auch an den folgenden Tagen (§ 630f BGB: zeitnah).
- **Kein neues Auditereignis.** Der Tagesplan ist auch online kein Aktenzugriff im Sinne von
  ADR-010; sein Lesen ohne Netz schreibt nichts. Der übertragene Entwurf steht im Datenmodell wie
  jeder andere (ADR-010: das Datenmodell ist der Nachweis). ADR-010 bleibt unverändert.

**7. Übertragen wird additiv und wiederholbar.** Jeder Haken, jede Einheit und jeder
Offline-Entwurf trägt eine Kennung, die das Gerät beim Erfassen vergibt (UUID, ADR-014). Der Server
legt die Zeile an oder erkennt sie wieder; zweimal gesendet ist einmal gespeichert. Nichts wird
überschrieben, es gibt kein Last-Write-Wins (ADR-001 Punkt 5). Gibt es am Termin schon einen
Entwurf auf dem Server oder ist die Dokumentation dort inzwischen finalisiert, wird der
Offline-Entwurf nicht eingemischt: Die Anwendung zeigt beide Fassungen und bietet die Wege aus
ANN-320 an (Nachtrag-Entwurf, Korrektur, Übernehmen von Hand). Eine Kennung des Geräts gewährt
nichts (ADR-023 Punkt 19, ADR-004): Trifft sie eine fremde Zeile, antwortet der Server wie bei
einer unbekannten, ohne zu verraten, dass es sie gibt. Das ist ein Negativfall jedes Weges, der
Offline-Daten annimmt.

**8. Der Server urteilt beim Eingang.** Die Zeile trägt den Zeitpunkt des Geräts als Angabe der
Person und den Eingang am Server. Ob Zugang, Plan, Termin und Rolle noch gelten und die Lesefrist
noch nicht erreicht ist (ANN-305), entscheidet der Server zum Zeitpunkt des Eingangs mit denselben
Prüfungen wie online, nicht nach der Uhr des Geräts. Weist er einen Haken ab, zeigt die Ansicht das
mit dem Grund („Nicht übertragen: Der Plan gilt nicht mehr") und verwirft ihn danach. Weist er
einen Entwurf ab (Termin abgesagt, Zugriff entzogen), bleibt der Text auf dem Gerät stehen, bis die
Person ihn ausdrücklich verwirft oder kopiert; still verschwindet keine Dokumentation (§13).
Niemand glaubt gespeichert zu haben, was nur lokal liegt (ADR-001): Die Ansicht zeigt „auf dem
Gerät" oder „übertragen", bis nichts mehr wartet.

**9. Die Sitzungssperre gilt auch ohne Netz, die Freigabe geht dann per Passkey am Gerät.** Läuft
eine Frist aus ADR-025 ab, sperrt die Anwendung wie sonst und zeigt nichts. Ohne Netz bietet die
Sperrseite die **Freigabe per Passkey** an (ADR-025 Punkt 16, §3.4 zweite Ausnahme):

- Die Zeremonie führt der Browser mit `userVerification: required` und einem Passkey des
  eigenen Kontos. Die Anwendung prüft die Signatur mit Web Crypto gegen den öffentlichen
  Schlüssel, den sie bei der letzten Freigabe mit Netz abgelegt hat.
- Sie gibt **nur die Daten auf dem Gerät** frei (Punkte 5 und 6), **nie eine Sitzung beim
  Server**. Übertragen wird erst nach einer Freigabe mit Netz nach ADR-025 Punkt 7.
- Die **App-PIN gibt ohne Netz nie frei** (ADR-025 Punkt 11 bleibt). Wer keinen Passkey am Gerät
  hat, sieht ohne Netz nichts; die Entwürfe bleiben gesichert.
- Die Fristen aus ADR-025 Punkte 1 und 2 gelten auch für diese Freigabe.

### C. Benachrichtigungen

**10. Die Übersicht ist der Ort, an dem man sieht, was zu tun ist.** Für Plattformkonten bleibt
die Plattform ohne jede Benachrichtigung vollständig benutzbar (DSN-001). Für die Praxis sind es
die Offenen Punkte. Eine Benachrichtigung weist auf die Übersicht hin; sie ersetzt sie nie.

**11. Drei Wege, hinter einem Adapter** (Grundsatz 5):

| Weg | Für wen | Stand |
| --- | --- | --- |
| **E-Mail** | Plattformkonten, Regelweg | Versand über den SMTP-Anbieter aus B13; bis zu dessen Prüfung nur `mock` |
| **Push** (**W3**) | Plattformkonten, zusätzlich wählbar je Gerät | Web-Push über den Push-Dienst des Browsers; bis zur Prüfung (Punkt 18) nur `mock` |
| **SMS** | — | nicht in V1; ein späterer Weg wäre ein eigener Anbieter mit eigenem ADR (B15) |

Messenger sind ausgeschlossen (B15). Der Adapter kennt `mock`, `smtp` und `webpush`; `mock` stellt
lokal und in der Test-Umgebung in ein Postfach bzw. eine Liste zu, die die Tests lesen.

**12. Mitarbeitende werden in der Anwendung benachrichtigt, nicht auf dem Telefon** (**W4**). Was
die Praxis tun soll (neue Rückfrage, Terminwunsch, überschrittene Antwortzeit, Kündigung),
erscheint in den Offenen Punkten mit Zähler. Es gibt keine Mail und keinen Push an Mitarbeitende,
keine Lesebestätigung und keine Auswertung, wer wann reagiert hat (§20).

**13. Ein geschlossener Katalog, kein freier Text.** Jede Art von Benachrichtigung steht in einem
Katalog an einer Stelle, mit festem Text, den erlaubten Wegen und der Angabe, ob Ruhezeiten
gelten. Den Katalog legt der SPEC von KOM-EPIC-003 fest; zu erwarten sind: Erinnerung an einen
Termin, Termin von der Praxis geändert oder abgesagt, Antwort auf eine Rückfrage, Terminwunsch
beantwortet, neuer Plan, Neues in der Übersicht. **Keine Werbung**, keine Angebote, kein Hinweis
auf ein Abo oder ein Paket über diesen Weg. Eine neue Art ist eine Änderung des Katalogs mit
Review, kein Text im Code einer Ansicht.

**14. Der Inhalt einer Benachrichtigung trägt keine Gesundheitsdaten** (`IDEA-KOM-006`). Er nennt
die Art und höchstens Datum und Uhrzeit: „Erinnerung: Ihr Termin morgen um 10:00." Er nennt
nie den Leistungsbereich (Behandlung oder Training), keine behandelnde Person, keinen Ort, keine
Übung, keinen Inhalt einer Nachricht, keinen Betrag. Eine Push-Nachricht trägt nur den
Katalogschlüssel und gegebenenfalls Datum und Uhrzeit; den Text setzt der Service Worker aus
seinem eigenen Katalog. Eine Mail enthält **keinen Anmeldelink und keine Kennung**: Der Link führt
auf die Startseite, angemeldet wird wie immer (ADR-025 Punkt 10, ANN-331). Kein Zählpixel, keine
Klickverfolgung.

**15. Die Person entscheidet je Art und je Weg, und Abschalten kostet nichts.**

- **Von Anfang an aus.** Eingeschaltet wird im Einstieg nach der ersten Anmeldung (DSN-001
  Abschnitt 4.3) oder später unter „Ich". Die Wahl steht mit Zeitpunkt am Zugang.
- **Je Zugang.** Eine Vertretung wählt für ihren Zugang selbst. Ob die vertretene Person
  benachrichtigt wird, wählt sie selbst bzw. die rechtliche Vertretung für sie.
- **Ruhezeiten:** Vorschlag 20 bis 8 Uhr, je Person änderbar. Was in die Ruhezeit fiele, geht am
  nächsten Morgen oder entfällt, wenn es dann keinen Sinn mehr hat.
- **Obergrenze:** höchstens eine Benachrichtigung je Art und Tag und eine Zahl je Woche über alle
  Arten (Vorschlag zehn). Darüber geht nichts mehr hinaus; die Übersicht zeigt es trotzdem.
- **Kein Nachfassen:** Bleibt eine Reaktion aus, wird nicht erneut benachrichtigt.
- Ruhezeit, Obergrenzen und Zeitpunkt der Terminerinnerung sind Konstanten an einer Stelle.

Die Praxis (`owner`) kann eine Art für alle abschalten, nicht für eine Person einschalten.

**16. Versendet wird aus einem Auftragsbuch in der Datenbank.** Ein Ereignis legt einen
Zustellauftrag an (Empfänger-Zugang, Art, Zeitpunkt, Weg, Zustand); ein Zeitplan (`pg_cron`)
übergibt fällige Aufträge an den Versand. Der Versand ist eine serverseitige Funktion, die die
Zugangsdaten des SMTP-Anbieters und den privaten VAPID-Schlüssel als Secret hält; der Browser sieht
sie nie. Sie läuft als Edge Function und wird wie der Zugangsdienst erst mit OPS-001 scharf
(ADR-023 Punkt 9). Ein abgewiesener Endpunkt (Push-Dienst meldet „nicht mehr vorhanden") löscht
die Registrierung des Geräts. Fehlgeschlagene Zustellungen werden begrenzt wiederholt, dann
aufgegeben; die Übersicht trägt die Information ohnehin.

**17. Gespeichert wird so wenig und so kurz wie möglich.**

- **Zustellauftrag:** Katalogschlüssel, Zeitpunkte, Zustand; kein Text, keine Adresse als Kopie.
  Frist nach dem Versand kurz (Vorschlag 30 Tage), Datenklasse legt der SPEC fest; die Prüfung
  in `retention.test.ts` bindet die Tabelle.
- **Push-Registrierung je Gerät** (Endpunkt und Schlüssel des Browsers): fällt beim Abmelden auf
  diesem Gerät, bei abgewiesenem Endpunkt, mit dem Zugang und mit dem Konto.
- **Kein Auditereignis.** Benachrichtigungen stehen nicht im Auditlog; ADR-010 und sein Katalog
  bleiben unverändert. Die Wahl der Person steht am Datensatz (Punkt 15).
- **Betriebslogs** (ADR-011) tragen Auftragskennung, Weg und Ergebnis, nie Mailadresse,
  Endpunkt oder Text.

**18. Web-Push ist ein Datenweg nach ADR-002** und wird vor dem Scharfschalten geprüft. Bewertung
heute:

- **Inhalt:** beim Push-Dienst nicht lesbar (RFC 8291) und nach Punkt 14 ohnehin ohne
  Gesundheitsdatum.
- **Metadaten:** Endpunkt, Zeitpunkt, Größe, Absenderkennung und die Verbindung des Geräts gehen
  an den Hersteller des Browsers, oft mit Sitz in den USA. Ein Vertrag mit der Praxis ist nicht
  möglich, weil der Browser den Dienst wählt.
- **Minderung:** kurze Gültigkeit je Nachricht (Vorschlag 24 Stunden), Absenderkennung ohne
  Personenbezug, Push nur nach ausdrücklicher Wahl auf dem Gerät (Browserabfrage und Punkt 15).

Das ist eine Frage für die Datenschutzprüfung (B2) und die DSFA (ADR-007). Bis zur Antwort ist
Push gebaut und mit `mock` getestet, aber nicht scharf (§15.2).

## Konsequenzen

- **Zwei Loops werden frei.** KOM-EPIC-003 baut Katalog,
  Einstellungen, Auftragsbuch, Adapter und, nach W3, den Push-Weg. TRK-EPIC-003 baut Ablage,
  Warteschlange und Übertragung nach Punkt 5, dazu die Freigabe ohne Netz (Punkt 9). Den Service Worker baut der Loop, der ihn als
  Erster braucht. Beide sind kritische Änderungen nach ADR-013 Punkt 9 (externer Datenfluss,
  neue Datenklasse, Migration) und bekommen ein Zweitreview.
- **ANN-305 wird mit TRK-EPIC-003 abgelöst:** Ohne Verbindung bleibt der Haken stehen und kommt in
  die Warteschlange, statt zurückgenommen zu werden. Für Praxiskonten gilt
  dasselbe am Termin mit OFF-EPIC-001; ANN-319 und ANN-320 bleiben für Geräte ohne Einrichtung.
- **Push unter iOS braucht `standalone`.** Mit `minimal-ui` (ANN-110) öffnet iOS die Anwendung im
  Browser, und dort gibt es kein Web-Push. Wer Push für iPhones will, nimmt den Änderungspfad
  aus ANN-110 (volle Höhe, eigene Zurück-Wege, Aufwand `mittel`). Ohne das bleibt Push auf
  iPhones aus, Mail geht.
- **Ältere Menschen erreicht die Mail eher als Push.** Deshalb ist Mail der Regelweg und Push eine
  Wahl, nicht umgekehrt. Bis B13 geprüft ist, kommt außerhalb des Tests keine Benachrichtigung an.
- **Ein neuer Loop: OFF-EPIC-001** „Dokumentieren geht auch ohne Empfang" (Roadmap Block 7, nach
  TRK-EPIC-003, das Ablage, Warteschlange und die Freigabe per Passkey zuerst baut). Kritische
  Änderung nach ADR-013 Punkt 9 (Sitzungen, neue Datenklasse auf dem Gerät), mit Zweitreview.
- **Gesundheitsdaten liegen auf dem Diensttelefon.** Tagesplan mit Namen und Adressen und nicht
  übertragene Dokumentation. Das ist der Preis von W1 (c). Schutz sind Gerätevorgabe,
  Gerätesperre und die Sperre aus Punkt 9; eine Fernlöschung gibt es nicht. Geht ein Gerät mit
  nicht übertragenen Entwürfen verloren, sind diese Entwürfe verloren — die Anwendung überträgt
  deshalb bei jeder Verbindung sofort. **Mit echten Daten erst nach der DSFA** (ADR-007).
- **Die Freigabe ohne Netz ist so stark wie das Gerät.** Wer das Telefon entsperrt und Werkzeuge
  am Browser hat, käme an die Ablage auch ohne die Anwendung. Die Freigabe per Passkey schützt vor
  dem, der das liegen gelassene Telefon in der Hand hat, und gibt nie Daten des Servers frei.
- **Offline-Daten lassen sich nicht aus der Ferne löschen.** „Alle Sitzungen beenden" nimmt einem
  verlorenen Gerät die Sitzung beim Server, nicht die Ablage. Der Tagesplan fällt am Tagesende,
  der Plan der Person nach sieben Tagen, Entwürfe erst mit der Übertragung.
- **Die Datenschutzprüfung bekommt vier Fragen** (B2, DSFA): Sind Tagesplan und nicht übertragene
  Dokumentation auf dem Diensttelefon mit der Gerätevorgabe aus Punkt 6 vertretbar? Genügt die Wahl der Person (Punkt 15) für
  Terminerinnerungen per Mail, oder braucht es eine Einwilligung nach Art. 9 Abs. 2 lit. a? Genügt
  Transportverschlüsselung für eine Mail ohne Gesundheitsdatum (Punkt 14, vgl. ANN-041)? Ist Web-Push
  mit den Metadaten aus Punkt 18 zulässig? Bis dahin gelten die Punkte als vorläufige Festlegung;
  jeder wird an einer Stelle verankert, die der Loop benennt.
- **Vermerke** an ADR-015 Punkt 16 („abgelöst durch ADR-024"), an ADR-001 (Punkt 6 und
  Folgefragen) und an ADR-023 Punkt 18 sind mit der Annahme gesetzt. ANN-015 bleibt: Die
  Verbindungsanzeige fragt weiter nur `navigator.onLine`.
- **Verworfen: ein generischer Service Worker** mit Laufzeit-Caching (Workbox-Standard). Er legt
  jede Antwort ab, auch die mit Patientendaten — genau das, was ADR-015 verhindern wollte.
- **Verworfen: Benachrichtigung über einen Dienst mit Inhalt** (etwa ein Messaging-Anbieter, der
  die Texte sieht). Ein neuer Empfänger mit Gesundheitsbezug, nur damit eine Mitteilung schöner
  aussieht.
- **Verworfen: Push ohne Inhalt, das Gerät holt den Text selbst.** Der Service Worker bräuchte
  dafür eine eigene Anmeldung, und mit dem Katalog (Punkt 14) gibt es nichts zu holen.

## Bewusst nicht Bestandteil dieser Entscheidung

- **Die Online-Terminanfrage** als Funktion (B15): der SPEC von KOM-EPIC-003. Dieser ADR regelt
  nur, wie die Praxis davon erfährt (Punkt 12).
- **Die Wahl des SMTP-Anbieters**: B13, Block 11, eigener ADR nach ADR-002.
- **Das Schema**: Tabellen, Spalten, Funktionsnamen, Katalogschlüssel, Wortlaut der Texte. Das
  entscheidet der SPEC (ADR-014), die Texte stehen in `src/lib/begriffe.ts`.
- **Mehr Offline für Praxisgeräte** als Punkt 6 (Akte, frühere Dokumentation, Kalender ändern):
  ein eigener ADR.
- **Mobile-Device-Management und Fernlöschung**: erst, wenn die Praxis mehr Diensttelefone hat, als
  sie von Hand einrichtet.
- **Interne Teamkommunikation** (§10 „Intern") und ihre Benachrichtigungen.
- **SMS** und jeder andere Weg außer Mail und Push.

## Offene Folgefragen

- Wann genau geht die Terminerinnerung? Vorschlag: am Vortag um 17 Uhr, für Termine am Montag am
  Freitag. Der SPEC legt es fest, eine Konstante.
- Soll die Praxis sehen, ob eine Person Benachrichtigungen eingeschaltet hat (etwa um bei der
  Einladung zu helfen)? Vorschlag: nein in V1. Das wäre eine Auskunft über das Verhalten der
  Person, die die Praxis für ihre Arbeit nicht braucht.
- Soll der Tagesplan auch den nächsten Morgen enthalten, für den Start im Funkloch vor 8 Uhr?
  Vorschlag: nein in V1; der SPEC von OFF-EPIC-001 kann es begründen.

## Wahlpunkte — entschieden

**Jannes, 2026-10-11:** W1 (c) mit Freigabe ohne Netz per Passkey, W2 bis W5 wie empfohlen. Die
verworfenen Optionen bleiben als Rückweg stehen; die Rücknahme ist je Punkt genannt.

**W1 — Offline für Therapeut:innen in V1** (ADR-001 Punkt 3). (a) Nein: Gerüst offline, Text im
Speicher der Seite, Tagesplan auf Papier (Punkt 6). (b) Der Tagesplan des Tages lesend auf dem
Praxisgerät, sieben Tage höchstens, ohne Akte. (c) ADR-001 Punkt 3 vollständig: Tagesplan,
Hausbesuchsdaten, Dokumentationsentwürfe mit Warteschlange.
**Empfehlung (a).** (b) und (c) legen die Adressen und Namen eines ganzen Tages auf ein Diensttelefon,
für das es noch keine Gerätevorgabe gibt. Vor allem aber sperrt ADR-025 nach spätestens 60
Minuten, und ohne Netz gibt es keine Freigabe: Ein offline gehaltener Tagesplan wäre am Hausbesuch
nach der ersten Stunde ohnehin nicht zu sehen, außer man prüft die PIN auf dem Gerät und weicht
damit ADR-025 Punkt 11 auf. Rücknahme nach (b) `mittel`: Ablage nach Punkt 5 auch für Praxiskonten
plus Gerätevorgabe, eigener ADR.
*Entschieden (c), Jannes 2026-10-11: „Bei Konkurrenten wie iPrax ist eine Dokumentation ohne Empfang
möglich. Ich möchte diese Funktion auch haben.“ Auf die Rückfrage zur Sperre gewählt: Freigabe ohne
Netz per Passkey, nur für die Daten auf dem Gerät (Punkt 9; verworfen: Schreiben ohne Sehen auf der
Sperrseite, Sperre unverändert). Rücknahme nach (a) `mittel`: die Ablage für Praxiskonten
abschalten (ein Schalter im Ablagemodul), Entwürfe vorher übertragen.*

**W2 — Wo die Durchführung ohne Netz liegt.** (a) Plan der Einheit und Warteschlange auf dem
eigenen Gerät (IndexedDB), ohne eigene Verschlüsselung, sieben Tage höchstens (Punkt 5). (b) Nur
im Speicher der Seite: Wird die App beendet, sind Plan und Haken weg. (c) Wie (a), zusätzlich mit
Web Crypto verschlüsselt, Schlüssel im Browser.
**Empfehlung (a).** (b) trägt im Keller nicht: Telefone beenden Anwendungen im Hintergrund, und
dann ist die Einheit verloren (§13). (c) kostet Code und hält den Schlüssel neben den Daten; sie
schützt nur vor dem, der die Dateien ohne entsperrtes Gerät liest, und davor schützt schon die
Geräteverschlüsselung. Rücknahme nach (c) `klein`: eine Hülle um das Ablagemodul. *Entschieden (a).*

**W3 — Push in V1.** (a) Ja, als zusätzliche Wahl neben der Mail, Inhalt nach Punkt 14, scharf
nach der Prüfung aus Punkt 18. (b) Nein, nur Mail und Übersicht.
**Empfehlung (a).** Der Service Worker steht ohnehin (Abschnitt A), Push kostet keinen Vertrag, und
für Trainingskund:innen ist „Antwort da" auf dem Telefon das, was sie von einer App erwarten. Weil
Push abschaltbar bleibt und vor der Prüfung nur `mock` läuft, entsteht kein Datenweg, bevor er
bewertet ist. Rücknahme `klein`: den Weg aus dem Adapter nehmen, Registrierungen löschen.
*Entschieden (a).*

**W4 — Benachrichtigungen an Mitarbeitende.** (a) Nur in der Anwendung, in den Offenen Punkten
(Punkt 12). (b) Zusätzlich Push auf das Diensttelefon.
**Empfehlung (a).** Die Offenen Punkte zeigen schon, was fällig ist, auch die überschrittene
Antwortzeit. Push auf ein Diensttelefon macht Erreichbarkeit nach Feierabend zur stillen
Erwartung, und jede Reaktionszeit wäre eine Leistungsangabe (§20). Rücknahme `klein`: derselbe
Weg wie für Plattformkonten, mit Ruhezeiten nach Arbeitszeit. *Entschieden (a).*

**W5 — Wie der Service Worker entsteht.** (a) Eine eigene Datei mit beiden Aufgaben, die Liste der
Dateien aus dem Build-Manifest von Vite, keine neue Abhängigkeit. (b) `vite-plugin-pwa` mit
Workbox, im Modus `injectManifest`.
**Empfehlung (a).** Die Grenze aus Punkt 1 soll in einer Datei lesbar sein, die das Review ganz
sieht. Die Dateinamen tragen schon eine Prüfsumme; damit bleibt für das Vorhalten wenig zu tun.
(b) bringt eine wesentliche Abhängigkeit mit Voreinstellungen, die genau das generische Caching
sind, das Punkt 1 ausschließt. Rücknahme `klein`: Das Plugin kann die eigene Datei übernehmen.
*Entschieden (a).*
