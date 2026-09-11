# PROJECT_PRINCIPLES.md

## Dokumentinformation

| | |
|---|---|
| **Dokumentversion** | **0.7** |
| **Änderungsdatum** | **2026-09-11** |
| Vorversion | 0.6 (2026-09-11); 0.5 (2026-09-08); 0.4 (2026-09-05); 0.2.2 Korrekturversion; 0.1 Baseline, unverändert im Git-Verlauf erhalten |
| Verbindliche Architekturentscheidungen | ADR-001 bis ADR-016 und ADR-018, siehe `docs/adr/` |
| Offene Entscheidungen | `docs/decisions/OPEN_DECISIONS.md` |
| Vorläufige Annahmen | `docs/decisions/ASSUMPTIONS.md` (§15.1) |

### Änderungsvermerk 0.7

**ADR-018** (Zustandsautomat des Termins) ist am 2026-09-11 vom Projektinhaber
angenommen worden — alle sieben Bestätigungsfragen wie empfohlen. Anlass für
diese Version: §8 führte den Zustandsautomaten bis dahin ausdrücklich als
offenen Punkt; §21 verlangt, dass eine so geänderte Prinzipienaussage in einer
neuen Version nachgezogen wird.

- **§8 geändert:** Der Satz „Der Zustandsautomat des Termins ist noch nicht
  definiert …" entfällt. An seine Stelle treten die acht Zustände, der Hinweis,
  dass „angefragt" und „vorgemerkt" beschrieben, aber nicht gebaut sind, und
  drei verbindliche Aussagen: jeder Wechsel über eine Serverfunktion mit
  Rollenprüfung und Auditeintrag; „dokumentiert" und „abgerechnet" setzt der
  Vorgang, dem die Tatsache gehört; Absage und finalisierte Dokumentation ohne
  Rückweg.
- **§19 bekommt seinen technischen Anker,** ohne selbst geändert zu werden:
  „Fakturierung erst nach finalisierter Dokumentation" ist ab jetzt prüfbar als
  „aus `documented` oder aus `no_show` mit Ausfallhonorar". Der Abschluss eines
  Termins verlangt weiterhin keine Dokumentation (ANN-005 bleibt in Kraft).
- **§21 ergänzt:** ADR-018 steht in der Tabelle der angenommenen ADRs.
- **Unverändert:** §8.1 (Terminfenster), §6 und §6.3, §4 und der Rollenschnitt.
  ADR-018 legt Zustände und Übergänge fest, keine Rechte.

Nicht gebaut: Die Umsetzung ist CAL-EPIC-003a. Bis dahin kennt die Anwendung
die drei bisherigen Werte; diese Version entscheidet, sie beschreibt keinen
erreichten Stand.

### Änderungsvermerk 0.6

Die Entscheidung **E10** des Projektinhabers vom 2026-09-08 wird verbindlich.
Anlass: Sie war bis dahin nur in `docs/decisions/OPEN_DECISIONS.md` festgehalten;
§21 verlangt, dass eine geänderte Prinzipienaussage in einer neuen Version
nachgezogen wird, sobald die Aufteilung im Code steht und getestet ist
(STAFF-002a).

- **§4.3 präzisiert:** „Mitarbeiterorganisation" ist für das Office ein
  **schreibendes** Recht auf die **Stammdaten** einer beschäftigten Person —
  Name, dienstliche Erreichbarkeit, Hauptstandort. Nicht dazu gehören
  Rollenvergabe, Beschäftigungsstatus und die Privatangaben nach §20.
- **§4.5 präzisiert:** „Mitarbeiterplanung" bleibt für die Teamleitung ein
  **mögliches**, nicht vergebenes Zusatzrecht. Sie schreibt weder Stammdaten
  noch Rollen noch den Beschäftigungsstatus.
- **§4.1 unverändert:** Rollenvergabe und Beschäftigungsstatus bleiben beim
  Praxisinhaber. Eine Rolle zu vergeben ist Berechtigungsvergabe und damit
  eine Sicherheitsentscheidung nach ADR-004.

### Änderungsvermerk 0.5

Zwei Produktentscheidungen des Projektinhabers vom 2026-09-08 werden
verbindlich. Anlass: Jannes hat beide selbst getroffen und zur Aufnahme in die
verbindlichen Dokumente beauftragt.

- **Neu §8.1 „Terminfenster, Dokumentationszeit und Fahrzeit":** ein
  angebotener Behandlungstermin dauert 60 Minuten einschließlich
  Dokumentation, ohne eigenen Dokumentationsblock und ohne feste Aufteilung;
  der Beginn bleibt frei auf dem Praxisraster (heute 5 Minuten); eine Fahrzeit
  kommt zwischen den Terminfenstern hinzu, und der früheste Folgetermin liegt
  auf dem ersten Rasterpunkt auf oder nach Ende plus Fahrzeit (aufrunden, nie
  abrunden).
  Es ist eine **Angebotsregel mit serverseitiger Durchsetzung**, keine
  Voreinstellung der Oberfläche. Bestehende Termine bleiben unverändert.
- **Neu §6.3 „Sprachdokumentation: Diktat, Transkription und Übernahme":**
  bewusst gestartetes Nachdiktat aus dem Termin, inhaltstreue Transkription
  und Strukturierung ohne eigene klinische Ergänzung und ohne inhaltliche
  Auslassung, Kennzeichnung unverständlicher Stellen, Prüfung und Korrektur
  vor der Übernahme. Ein KI-Vorschlag ist **kein Dokumentationsentwurf**; die
  automatische Finalisierung nach ADR-016 Punkt 7 DARF ihn NICHT erfassen.
- §5 verweist auf §6.3; §8 verweist auf §8.1; §21 führt die geänderten ADRs
  nach (ADR-005 Fassung 2, ADR-006 Fassung 2, ADR-016 Fassung 2).
- Beide Abschnitte halten die Anforderung fest und sind **kein
  Implementierungsauftrag**. Was an ihnen nicht entschieden ist, steht als
  E12 und E13 in `docs/decisions/OPEN_DECISIONS.md`.
- Keine Anforderung aus §3, §12, §13 oder §16 wurde geändert oder
  abgeschwächt. §6, §7.1 und die Liste der Constraints in §8 sind unverändert.

### Änderungsvermerk 0.4

C1 und C2 entschieden. Anlass: Jannes hat beide in
`docs/decisions/OPEN_DECISIONS.md` Abschnitt C geführten Widersprüche
aufgelöst (2026-09-05):

- §4.4 legt fest, dass Leistungskürzel (z. B. „MT", „KG") als organisatorische
  Information gelten und dem Office wie die übrige Rechnung zugänglich
  bleiben; der Diagnosetext bleibt klinisch und gesperrt.
- §10 legt fest, dass Patientenkommunikation über einen gemeinsamen Kanal
  läuft; erkennt eine Therapeutin nachträglich klinischen Inhalt, ordnet sie
  ihn der Akte zu. Dass das Office eine solche Nachricht bis zur Zuordnung
  gelesen haben kann, ist eine akzeptierte, dokumentierte Ausnahme, kein
  Fehler.

Keine Anforderung aus §3, §12, §13 oder §16 wurde geändert oder abgeschwächt.

### Änderungsvermerk 0.3

Arbeitsweise bei fehlenden Entscheidungen. Anlass: Der Projektinhaber hat
festgestellt, dass die Regel „nicht eigenständig entscheiden, stoppen und
vorlegen" die Entwicklung blockiert, weil er insbesondere datenschutz- und
rechtsbezogene Detailfragen selbst nicht beantworten kann. Eine
Datenschutzprüfung steht bevor; das Produkt muss deren Ergebnis aufnehmen
können, ohne dass die Entwicklung bis dahin wartet.

- Neu §15.1 „Begründete Annahmen": Fehlt eine Entscheidung, wird recherchiert,
  nach bestem Wissen entschieden, die Annahme im Annahmenregister
  (`docs/decisions/ASSUMPTIONS.md`) dokumentiert und reversibel verankert.
  Datenschutz- und rechtsbezogene Annahmen MÜSSEN vor Produktivstart
  validiert werden. §15.1 nennt abschließend, was keine Annahme sein darf.
- §2.3 präzisiert: Detailentscheidungen innerhalb einer beauftragten Aufgabe
  sind keine „grundlegenden Praxisprozesse" und werden nach §15.1 getroffen.
- §11 nennt Recherche und das Schließen von Lücken durch dokumentierte
  Annahmen als zulässige Tätigkeiten; die Verbotsliste ist unverändert.
- §21 nimmt das Annahmenregister in die Dokumentenordnung auf, regelt den
  Umgang mit einem entdeckten Widerspruch bis zu seiner Auflösung und führt
  ADR-015 und ADR-016 in der Tabelle nach.
- Keine Anforderung aus §3 (Datenschutz und Sicherheit), §12, §13 oder §16
  wurde geändert oder abgeschwächt.

### Änderungsvermerk 0.2.2

Korrekturversion. Sie behebt ausschließlich eine Aussage, die durch ADR-016
überholt ist, und ändert keine Anforderung:

- §5 bezeichnete den Mechanismus der Nachvollziehbarkeit — Versionierung
  gegenüber Änderungsprotokoll — als offen. ADR-016 hat ihn am 2026-09-01
  entschieden; `docs/decisions/OPEN_DECISIONS.md` Abschnitt D führt ihn
  seither nicht mehr als offen. Die MUSS-Anforderungen aus §5 bleiben
  unverändert — ADR-016 erfüllt sie und erweitert sie nicht.

### Änderungsvermerk 0.2.1

Korrekturversion. Sie behebt ausschließlich Widersprüche, die durch ADR-010 bis
ADR-014 entstanden sind, und enthält keine stilistischen Änderungen:

- §4.2 bezeichnete Umfang und Aufbewahrung des Auditlogs als offen; das ist
  seit ADR-010 falsch.
- §13 bezeichnete ein Notfallzugriffskonzept als offen; ADR-010 stellt fest,
  dass ein klinischer Break Glass in V1 nicht erforderlich ist.
- §14 beschränkte die strukturelle Vorbereitung auf ADR-003; ADR-014 legt eine
  umfassendere verbindliche Liste fest.
- §21 führte die zitierten ADRs nicht auf.

### Änderungsvermerk 0.2

- Normative Begriffe eingeführt (§0). Sicherheitskritische Formulierungen wie
  „langfristig", „perspektivisch", „möglichst" und „soll" wurden durch
  eindeutige normative Aussagen ersetzt, soweit eine Entscheidung vorliegt.
- Die angenommenen Architekturentscheidungen ADR-001 bis ADR-009 wurden auf
  Prinzipienebene konsolidiert. Details, die im jeweiligen ADR vollständig
  geregelt sind, werden hier nicht wiederholt, sondern verlinkt.
- Neue Abschnitte: §17 Regulatorische Abgrenzung, §18 Aufbewahrung und
  Löschung, §19 Abrechnung, §20 Beschäftigtendaten, §21 Governance.
- Die Nummerierung der Abschnitte §1 bis §16 ist unverändert, damit bestehende
  Verweise aus den ADRs gültig bleiben.
- Es wurde keine Anforderung der Baseline entfernt. Offene Punkte sind als
  offen gekennzeichnet und nicht durch Formulierung geschlossen worden.


## 0. Normative Begriffe

Dieses Dokument verwendet folgende Begriffe in fest definierter Bedeutung:

- **MUSS** / **MÜSSEN** — verbindlich. Eine Abweichung ist ein Fehler.
- **DARF NICHT** / **DÜRFEN NICHT** — verbindliches Verbot.
- **SOLLTE** — verbindliche Absicht. Eine Abweichung ist zulässig, MUSS aber
  begründet und dokumentiert werden, in der Regel als ADR.
- **KANN** — zulässige Möglichkeit ohne Verpflichtung.

Jede MUSS- und DARF-NICHT-Anforderung MUSS test- oder auditierbar sein. Lässt
sich eine solche Anforderung nicht prüfen, ist entweder die Anforderung oder
die Umsetzung unvollständig.

Text ohne diese Begriffe ist beschreibend und begründend, nicht normativ.

Bei Konflikten zwischen Anforderungen gilt die Prioritätenordnung aus §16.
Das Verhältnis dieses Dokuments zu den ADRs regelt §21.


## 1. Zweck des Projekts

Wir entwickeln eine zentrale Softwareplattform für eine privat abrechnende
Physiotherapiepraxis mit starkem Fokus auf Hausbesuche und mobile Versorgung.

Die Software soll langfristig möglichst alle wesentlichen Arbeitsprozesse der
Praxis in einer einzigen Benutzeroberfläche bündeln.

Dazu gehören insbesondere:

- Patientenverwaltung
- Terminplanung
- Routen- und Tourenplanung
- Behandlungsdokumentation
- Befunde und Therapieberichte
- Fragebögen und Patient Reported Outcome Measures
- Privatrechnungen
- Patientenportal
- Therapie- und Übungspläne
- interne Kommunikation
- Mitarbeiterverwaltung
- Urlaub
- Arbeitszeit und Überstunden
- Belege und Erstattungen
- Lastenrad-/Fahrradverwaltung
- Pannen und Wartung
- KI-gestützte Assistenz

Das primäre Ziel ist der effiziente und sichere Betrieb der eigenen
Physiotherapiepraxis.

Eine spätere Vermarktung an andere Praxen soll architektonisch nicht
ausgeschlossen werden, ist aktuell aber kein Produktziel. Die dafür
vorgesehene, bewusst minimale Vorbereitung im Datenmodell regelt
[ADR-003](docs/adr/ADR-003-organization-location-model.md).


## 2. Produktprinzipien

### 2.1 Eine Plattform

Mitarbeiter und Patienten SOLLTEN für den Praxisalltag ausschließlich diese
eine Plattform verwenden müssen.

Externe Dienste wie Datenbankanbieter, Kartenanbieter, E-Mail-Dienste oder
KI-Anbieter DÜRFEN im Hintergrund integriert werden. Die dafür geltenden
Anforderungen regelt §3.5.

Sie SOLLTEN keine zusätzlichen Benutzeroberflächen für den Praxisalltag
erforderlich machen.

Davon ausgenommen ist die technische Administration: Nutzerverwaltung,
Schlüsselverwaltung, Datenbank- und Backup-Administration finden
notwendigerweise teilweise in den Oberflächen der eingesetzten Anbieter statt.
Diese Tätigkeiten gehören nicht zum Praxisalltag und sind nach §4.1 und §4.7
eine getrennte Berechtigungsdomäne.

### 2.2 Mobile First

Therapeut:innen arbeiten regelmäßig außerhalb der Praxis.

Alle zentralen Funktionen MÜSSEN auf Smartphones vollständig praktikabel sein.

Die Anwendung wird zunächst als responsive Web-App/PWA entwickelt.

In der ersten Entwicklungsphase werden keine nativen iOS- oder Android-Apps
entwickelt.

Die Anwendung ist **online-first**. Eine vollständige Patientenakte DARF NICHT
generell offline vorgehalten werden. Eine begrenzte Offline-Fähigkeit ist
architektonisch vorgesehen, insbesondere für Tagesplan, minimal notwendige
Hausbesuchsdaten und nicht finalisierte Dokumentationsentwürfe. Offline
erstellte Dokumentation DARF erst nach erfolgreicher Serversynchronisation
finalisiert werden. Die Synchronisation DARF klinische Dokumentation NICHT
über ein einfaches Last-Write-Wins-Modell überschreiben. Einzelheiten:
[ADR-001](docs/adr/ADR-001-online-first-limited-offline.md).

### 2.3 Praxisprozesse bestimmen die Software

Technische Möglichkeiten sind kein Selbstzweck.

Vor der Implementierung wesentlicher Features MÜSSEN Zweck, Nutzer, Workflow,
Daten und Berechtigungen definiert werden.

Claude DARF keine grundlegenden Praxisprozesse eigenständig erfinden oder
bestehende Prozesse ohne Auftrag verändern.

Grundlegend ist ein Prozess, der den Praxisalltag über die einzelne Aufgabe
hinaus prägt: welche Rollen es gibt, wer behandelt, wie abgerechnet wird,
welche Daten die Praxis überhaupt erhebt. Eine Detailentscheidung innerhalb
einer beauftragten Aufgabe — welche der bestehenden Rollen eine Aktion
auslösen darf, welche Frist ein Datensatz erhält, wie ein Konfliktfall
behandelt wird — ist es nicht. Fehlt sie, wird sie nach §15.1 als begründete
Annahme getroffen und dokumentiert, nicht abgewartet.


## 3. Datenschutz und Sicherheit

Die Anwendung verarbeitet Gesundheitsdaten und andere besonders sensible
personenbezogene Daten.

Datenschutz und Informationssicherheit sind grundlegende Architekturprinzipien
und keine nachträglichen Features.

### 3.1 Entwicklungsdaten

In Entwicklungs-, Test- und Demonstrationsumgebungen werden ausschließlich
synthetische Daten verwendet.

Echte Patientendaten DÜRFEN NICHT in folgende Ziele eingefügt werden:

- Claude Code
- ChatGPT
- Codex
- Gemini
- GitHub Issues
- Entwicklungslogs
- Testdaten

Darüber hinaus gilt: **Coding- und KI-Entwicklungswerkzeuge DÜRFEN NIEMALS
Produktionscredentials oder reale Produktions-Patientendaten erhalten.** Das
gilt unabhängig vom Werkzeug und unabhängig davon, ob der Zugriff lesend oder
schreibend wäre.

### 3.2 Produktionsdaten

Produktionsdaten und Entwicklungsdaten MÜSSEN technisch getrennt sein.

Dev, Test und Produktion sind getrennte Umgebungen
([ADR-002](docs/adr/ADR-002-hosting-data-residency.md)). Ein
Produktions-Backup DARF NICHT in eine Entwicklungs- oder Testumgebung
eingespielt werden.

Produktionszugriffe MÜSSEN über individuelle Benutzerkonten erfolgen.

Gemeinsam verwendete Accounts sind nicht erlaubt.

### 3.3 Keine Secrets im Code

Passwörter, API Keys, Datenbankzugangsdaten, Tokens oder sonstige Secrets
DÜRFEN NIEMALS hart im Quellcode stehen oder in GitHub committed werden.

Secrets werden ausschließlich über dafür geeignete
Environment-/Secret-Management-Systeme verwaltet.

### 3.4 Keine selbst entwickelte Sicherheitsinfrastruktur

Folgendes DARF NICHT selbst implementiert werden:

- Kryptografie
- Passwort-Hashing
- Session-Security
- grundlegende Authentifizierungsverfahren
- Datenbank-Engine
- Backup-Engine

Hierfür MÜSSEN etablierte und professionell betriebene Komponenten verwendet
werden.

### 3.5 Hosting, Datenstandort und Dienstleister

Gesundheitsbezogene Produktionsdaten MÜSSEN grundsätzlich in EU/EWR-
Infrastruktur gespeichert und verarbeitet werden.

US-amerikanische Mutterunternehmen sind nicht grundsätzlich ausgeschlossen,
wenn konkrete Verarbeitung, Verträge und Datenflüsse die Anforderungen
erfüllen.

Für jeden Dienstleister mit Zugang zu Patientendaten MÜSSEN vor Freischaltung
mindestens geprüft und dokumentiert werden: AVV/DPA, Eignung im Hinblick auf
§203 StGB, Verschlüsselung, Zugriffskontrolle, Retention und Löschung sowie
Unterauftragnehmer.

Physiotherapeut:innen sind Berufsgeheimnisträger. Die Einbindung externer
Dienstleister ist zulässig, setzt aber deren Verpflichtung zur Geheimhaltung
voraus.

Einzelheiten: [ADR-002](docs/adr/ADR-002-hosting-data-residency.md).

### 3.6 Protokollierung und Logs

Produktionslogs MÜSSEN personenbezogene und klinische Inhalte minimieren
beziehungsweise redigieren. Medizinische Freitexte DÜRFEN NICHT in
Produktionslogs geschrieben werden.

Dasselbe gilt für Fehler- und Crash-Reporting einschließlich externer Dienste.

Diese Anforderung ist von der fachlichen Auditierbarkeit nach §4.2 zu
unterscheiden: Auditlogs sind ein bewusst geführter Nachweis mit definiertem
Inhalt, Betriebslogs sind es nicht.

### 3.7 Datenschutzprozess

Vor der Verarbeitung realer Patientendaten MUSS der definierte
Datenschutzprozess abgeschlossen sein. Dazu gehören insbesondere eine
Datenschutz-Folgenabschätzung, das Verzeichnis der Verarbeitungstätigkeiten,
dokumentierte technische und organisatorische Maßnahmen, das Lösch- und
Aufbewahrungskonzept, die Auftragsverarbeiter- und Subprozessorenübersicht,
Datenschutzinformationen, ein Verfahren für Betroffenenrechte sowie ein
Data-Breach-Prozess nach Art. 33/34 DSGVO.

Entwicklungsarbeiten DÜRFEN vor Abschluss dieses Prozesses stattfinden,
solange ausschließlich synthetische Daten verwendet werden und keine
produktive Verarbeitung personenbezogener Gesundheitsdaten erfolgt.

Einzelheiten und die Wiedervorlagepflichten:
[ADR-007](docs/adr/ADR-007-data-protection-impact-assessment.md).


## 4. Benutzerrollen

Das System benötigt mindestens folgende Rollen.

Ein Benutzer KANN mehrere Rollen besitzen; die effektive Berechtigung ergibt
sich aus der Vereinigung der zugewiesenen Rollen
([ADR-004](docs/adr/ADR-004-authorization-model.md)).

### 4.1 Praxisinhaber / Geschäftsführung

Umfassender Zugriff auf:

- Patienten
- klinische Daten
- Kalender
- Touren
- Rechnungen
- Mitarbeiter
- Personalprozesse
- Fahrräder
- Belege
- Auswertungen
- Praxiseinstellungen

**Technische Administration und Alltags-Praxisrolle sind getrennte
Berechtigungsdomänen.** Ein Alltagskonto — auch das der Praxisinhaberin oder
des Praxisinhabers — DARF NICHT zu technischer Plattformadministration
eskalieren können.

### 4.2 Therapeut

Alle Therapeut:innen einer Organisation DÜRFEN grundsätzlich alle
Patientenakten dieser Organisation einsehen.

Das ist eine bewusste Produktentscheidung.

Damit sollen insbesondere ermöglicht werden:

- Vertretungen
- fachlicher Austausch
- flexible Patientenübernahme
- interdisziplinäre Rückfragen
- kurzfristige Einsatzänderungen

Ein individuelles Benutzerkonto ist Pflicht.

**Zugriffe auf Patientenakten MÜSSEN auditierbar sein.** Da die bewusste
Offenheit dieser Rolle die naheliegende technische Beschränkung entfernt, ist
das Auditlog die tragende Kompensationsmaßnahme und damit
sicherheitskritisch. Der Katalog auditpflichtiger Ereignisse, die Beschränkung
auf Metadaten ohne klinische Inhalte, die Unveränderbarkeit über den
Anwendungspfad, die Aufbewahrungsfrist und der monatliche Audit-/Security-Report
sind in [ADR-010](docs/adr/ADR-010-audit-and-privileged-access.md) geregelt. Wer
Auditlogs lesen darf, ist dort als offene Folgefrage geführt.

Therapeut:innen dürfen insbesondere:

- Patientenstammdaten einsehen
- Behandlungsakten einsehen
- Dokumentationen erstellen
- eigene Dokumentationen ergänzen/korrigieren
- Befunde erstellen
- Therapieberichte erstellen
- Fragebögen verwalten
- Therapiepläne erstellen
- Termine bearbeiten
- Patientenkommunikation durchführen
- Übungen freigeben

### 4.3 Praxismanagement / Office

Standardmäßig Zugriff auf organisatorische Informationen:

- Patientenstammdaten
- Kontaktinformationen
- Termine
- Terminstatus
- Rechnungen
- Zahlungsstatus
- organisatorische Patientenkommunikation
- Mitarbeiterorganisation
- Belege, soweit erforderlich

**Office hat standardmäßig KEINEN Zugriff auf klinischen Freitext und keinen
Zugriff auf vollständige klinische Dokumentationen.**

**Mitarbeiterorganisation (entschieden 2026-09-08, E10).** Office DARF die
**Stammdaten** einer beschäftigten Person anlegen und ändern: Name, dienstliche
Erreichbarkeit, Hauptstandort. Liefe jede Adressänderung über den
Praxisinhaber, wäre er das Nadelöhr — bei Bus-Faktor 1 ein reales
Betriebsrisiko ([ADR-012](docs/adr/ADR-012-backup-recovery-and-continuity.md)).

Office DARF NICHT:

- Rollen vergeben oder ändern (§4.1, ADR-004)
- den Beschäftigungsstatus wechseln (§4.1)
- Zugänge einladen oder sperren (§4.1, ADR-004)
- die Privatangaben nach §20 lesen oder schreiben

Die Privatangaben sind bewusst beidseitig ausgenommen: Ein Schreibrecht ohne
Leserecht würde bedeuten, dass ein Formular sie leer anzeigt und beim Speichern
löscht. Schreib- und Leserecht bleiben hier deckungsgleich.

Vorgesehen bleiben ein organisatorischer Behandlungsnachweis (§4.4) und später
kontrollierte Sonderfreigaben (§4.4).

### 4.4 Sonderfall Behandlungsnachweis

Für organisatorische Konflikte MUSS ein eigener datensparsamer
Behandlungsnachweis existieren.

Beispiel:

Ein Patient behauptet, am 14.08. sei kein Therapeut erschienen.

Das Office darf dafür sehen:

- Patient
- Datum
- Termin
- behandelnde Person
- Termin-/Behandlungsstatus
- erbrachte Leistung
- Zeitpunkt der Dokumentation
- gegebenenfalls Signatur/Bestätigung der Behandlung

Das Office DARF hierfür NICHT automatisch den medizinischen Inhalt der
Behandlung sehen.

Falls vollständige klinische Dokumentation für einen konkreten Vorgang
erforderlich ist, ist ein fallbezogener, zeitlich begrenzter und
protokollierter Zugriff vorgesehen.

Dieser Zugriff MUSS durch eine dazu berechtigte Rolle freigegeben werden.

**Entschieden am 2026-09-05:** Leistungskürzel (z. B. „MT", „KG") gelten als
organisatorische Information. Das Office darf sie wie die übrige Rechnung
sehen. Der Diagnosetext bleibt davon unberührt klinisch und gesperrt.

### 4.5 Teamleitung

Teamleitung erhält alle Rechte eines Therapeuten sowie definierte
organisatorische Zusatzrechte.

Mögliche Zusatzrechte:

- Urlaubsanträge bearbeiten
- Einsatzplanung
- Mitarbeiterplanung
- Rad-/Ressourcenzuteilung
- organisatorische Auswertungen

Teamleitung ist keine technische Administratorrolle.

**„Mitarbeiterplanung" bleibt ein mögliches, nicht vergebenes Zusatzrecht**
(entschieden 2026-09-08, E10). Teamleitung schreibt weder Mitarbeiterstammdaten
noch Rollen noch den Beschäftigungsstatus. §16 gilt: im Zweifel restriktiver;
später zu öffnen ist billig.

### 4.6 Patient

Patienten DÜRFEN ausschließlich ihre eigenen Daten sehen.

**Patientenaccount und medizinische Akte sind getrennte Konzepte.** Ein
Benutzerkonto ist ein Zugangsmittel; die Akte ist ein fachlicher,
aufbewahrungspflichtiger Datenbestand. Das Löschen oder Sperren eines
Patientenaccounts DARF die Akte nicht löschen, und das Bestehen einer Akte
setzt keinen Account voraus (§18,
[ADR-008](docs/adr/ADR-008-data-retention-and-deletion.md)).

Für das Patientenportal sind vorgesehen:

- eigene Termine
- Terminanfragen und Änderungswünsche
- Fragebögen
- Therapieziele
- Therapie-/Trainingsplan
- Übungen
- freigegebene Outcome-Daten
- Trainings-/Hausaufgaben-Tracking
- eigene Rechnungen
- freigegebene Dokumente
- sichere Kommunikation mit der Praxis

Patienten erhalten nicht automatisch Zugriff auf sämtliche internen klinischen
oder organisatorischen Notizen.

Identitätsprüfung von Patienten sowie Vertretungs- und Angehörigenzugriff sind
noch nicht entschieden und in `docs/decisions/OPEN_DECISIONS.md` als offener
Punkt geführt.

### 4.7 Durchsetzung der Berechtigungen

Berechtigungen MÜSSEN über einen zentralen Policy-/Authorization-Layer
durchgesetzt werden, kombiniert mit Datenbank-RLS als Defense-in-Depth.

Suche, Dateien, Exporte und spätere KI-/RAG-Funktionen MÜSSEN dieselben
Berechtigungsregeln respektieren.

Antworten der Anwendung MÜSSEN rollenabhängige Projektionen sein. Geschützte
Inhalte DÜRFEN NICHT ausgeliefert und erst im Client ausgeblendet werden.

Einzelheiten: [ADR-004](docs/adr/ADR-004-authorization-model.md).


## 5. Klinische Dokumentation

Behandlungsdokumentationen MÜSSEN nachvollziehbar gespeichert werden.

Eine finalisierte Dokumentation MUSS gegen unbemerktes Überschreiben
geschützt sein.

Änderungen MÜSSEN nachvollziehbar bleiben.

Erfasst werden MÜSSEN mindestens:

- Autor
- Erstellungszeitpunkt
- Zeitpunkt späterer Änderungen
- ursprüngliche Version
- geänderte Version

Die Finalisierung ist ein serverseitiger Vorgang und offline nicht möglich
(§2.2, [ADR-001](docs/adr/ADR-001-online-first-limited-offline.md)).

Der konkrete technische Mechanismus der Nachvollziehbarkeit ist mit
[ADR-016](docs/adr/ADR-016-clinical-documentation-record.md) entschieden:
Versionierung mit vollständig abrufbarem Originalinhalt je Version, nicht ein
bloßes Änderungsprotokoll. Was ADR-016 darüber hinaus regelt — Zustände,
Finalisierung, Ergänzung gegenüber Korrektur — konkretisiert diesen Abschnitt
und ersetzt ihn nicht.

Entsteht ein Dokumentationstext aus einem Diktat oder einer anderen
KI-Verarbeitung, gilt zusätzlich §6.3. Ein solcher Vorschlag ist kein Entwurf
im Sinne dieses Abschnitts, bevor eine Therapeut:in ihn ausdrücklich
übernommen hat.


## 6. KI

KI ist ein Assistenzsystem.

KI darf insbesondere:

- Dokumentationen formulieren
- Texte strukturieren
- Behandlungsverläufe zusammenfassen
- Therapieberichte entwerfen
- Kommunikationsentwürfe erstellen
- relevante Informationen hervorheben
- Fragebögen vorschlagen
- mögliche Auffälligkeiten markieren
- Termin- und Tourenoptionen vorschlagen

KI DARF NICHT autonom:

- Diagnosen stellen
- Red Flags ausschließen
- klinisch relevante Entscheidungen treffen
- Behandlungen verbindlich verändern
- Nachrichten mit relevanten Folgen ungeprüft versenden
- Patientenakten endgültig verändern

KI-Ergebnisse mit klinischer oder externer Wirkung sind Entwürfe bis zur
menschlichen Freigabe.

Der konkrete KI-Anbieter ist keine Architekturabhängigkeit. Die Anwendung MUSS
vollständig ohne aktiven externen KI-Anbieter funktionieren.

### 6.1 AI Privacy Gateway

Produktionsdaten DÜRFEN NICHT aus einzelnen Programmteilen direkt an externe
KI-Anbieter gesendet werden.

**Ab dem ersten produktiven KI-Feature MÜSSEN alle KI-Aufrufe über einen
zentralen, providerunabhängigen AI-Service beziehungsweise ein Privacy Gateway
laufen. Direkte Provideraufrufe aus Fachmodulen sind nicht erlaubt.**

Der Gateway ist ab dem ersten KI-Feature die einzige Schnittstelle nach
außen — auch in Entwicklung und Test, dort gegen einen Mock Provider. Die
MUSS-Verbindlichkeit für den Produktivbetrieb gilt spätestens ab dem ersten
produktiven KI-Feature.

Der Gateway MUSS kontrollieren:

- Benutzerberechtigung
- Verarbeitungszweck
- notwendige Daten
- Datenminimierung
- Pseudonymisierung
- erlaubtes KI-Modell
- Logging
- Fehlerbehandlung

Direkte Identifikatoren SOLLTEN nicht an das Sprachmodell übertragen werden,
wenn sie für die Aufgabe nicht erforderlich sind. Pseudonymisierung allein
ersetzt bei klinischem Freitext keine vertraglichen Zusagen; die Anforderungen
an den Anbieter regelt §3.5.

Ein Produktionsprovider DARF erst nach Datenschutz-, Vertrags- und
Security-Prüfung freigeschaltet werden. Bis zur Providerentscheidung wird ein
Mock Provider verwendet.

Einzelheiten: [ADR-005](docs/adr/ADR-005-provider-independent-ai.md).

### 6.2 Trennung von KI und deterministischer Berechnung

LLM-Funktionen und deterministische klinische oder administrative Berechnungen
MÜSSEN architektonisch getrennt bleiben.

Regelbasierte Hinweise (§7.1), Rechnungsbeträge, Steuerinformationen, Fristen
sowie Termin- und Fahrzeitberechnungen MÜSSEN deterministisch, versionierbar
und testbar entstehen. Ein Sprachmodell DARF NICHT im Ergebnispfad dieser
Werte stehen.

### 6.3 Sprachdokumentation: Diktat, Transkription und Übernahme

Der Projektinhaber hat am 2026-09-08 entschieden, dass die Anwendung ein
**bewusst gestartetes Nachdiktat** aus dem zugehörigen Termin heraus
unterstützen soll — auf Smartphone oder Tablet gesprochen, transkribiert,
strukturiert und geprüft, bevor daraus Dokumentation wird. Dieser Abschnitt
hält die Anforderung fest. Er ist **kein Implementierungsauftrag**:
Anbieterwahl, Architektur, Aufbewahrung des Audios und der Zeitpunkt der
Umsetzung bleiben einem eigenen Auftrag vorbehalten
(`docs/decisions/OPEN_DECISIONS.md` E13).

**Start und Zuordnung.** Eine Aufnahme MUSS ausdrücklich gestartet werden. Eine
fortlaufende, automatische oder unbemerkte Aufnahme DARF es NICHT geben.
Patient:in und Termin MÜSSEN der Aufnahme eindeutig zugeordnet sein.

**Inhaltstreue.** Transkription und Strukturierung geben wieder, was gesprochen
wurde. Die KI DARF NICHT

- eigene klinische Schlussfolgerungen, Bewertungen, Empfehlungen oder sonstige
  Inhalte ergänzen, die nicht gesprochen wurden;
- gesprochene Inhalte inhaltlich auslassen.

Erhalten bleiben MÜSSEN insbesondere Zahlen, Einheiten, Körperseiten,
Verneinungen, geäußerte Unsicherheiten sowie die Unterscheidung zwischen einer
Aussage der Patient:in und einer eigenen Beobachtung. Unverständliche Stellen
MÜSSEN als solche gekennzeichnet werden; sie DÜRFEN NICHT geraten werden.

Ausdrücklich diktierte Einschätzungen, Bewertungen und Pläne bleiben erhalten.
Sie sind Aussagen der Therapeut:in und keine Ergänzung der KI; das Verbot oben
betrifft sie nicht.

**Prüfung und Übernahme.** Transkript und strukturierter Vorschlag MÜSSEN vor
der Übernahme lesbar, prüfbar und korrigierbar sein. Ein KI-Vorschlag ist
**kein Dokumentationsentwurf** im Sinne von §5 und
[ADR-016](docs/adr/ADR-016-clinical-documentation-record.md) Punkt 2. Erst eine
ausdrückliche Übernahme durch eine:n Therapeut:in macht daraus einen Entwurf;
ab diesem Schritt gilt der Text als von dieser Person verfasst.

**Die automatische Finalisierung nach ADR-016 Punkt 7 DARF einen nicht
übernommenen KI-Vorschlag NICHT erfassen.** Ein ungeprüfter Vorschlag DARF
NICHT Bestandteil der Akte werden, auch nicht durch Fristablauf. Wie sich die
Frist aus ADR-016 Punkt 7 zu einer späten Übernahme verhält, ist nicht
entschieden (E13).

**Anbieter.** Ein Dienst für Spracherkennung, Diktat oder Transkription ist ein
Verarbeitungsdienst mit Zugang zu Gesundheitsdaten im Sinne von §3.5 — auch
dann, wenn er kein Sprachmodell im engeren Sinne ist. Er läuft über den
zentralen Gateway nach §6.1 und DARF NICHT als Direktintegration in ein
Fachmodul entstehen. Freigeschaltet wird er erst nach Datenschutz-, Vertrags-
und Security-Prüfung ([ADR-005](docs/adr/ADR-005-provider-independent-ai.md)
Punkte 8 und 9, ADR-002). Rohaudio ist selbst ein Gesundheitsdatum; Ort und
Frist seiner Speicherung sind nicht entschieden (E13, §18).

**Regulatorische Grenze.** Transkribieren und Einordnen in die
Dokumentationsvorlage sind sprachliche Transformation im Sinne von
[ADR-006](docs/adr/ADR-006-medical-device-boundary.md) Punkt 5 und bleiben
zulässig. Eine Funktion, die darüber hinaus eine klinische Einschätzung
ergänzt, verlässt diese Grenze und ist nach ADR-006 Punkt 6
`MDR_REVIEW_REQUIRED`.


## 7. Fragebögen

Fragebögen werden nicht lediglich als PDFs gespeichert, sondern soweit
sinnvoll als strukturierte digitale Formulare modelliert.

Jeder Fragebogen benötigt eine Version.

Bereits abgeschlossene Fragebögen bleiben in der beantworteten Version
erhalten.

Der initiale Anamnesebogen basiert auf dem von DIGOTOR bereitgestellten
Anamnesebogen Version 8 / 07-2026.

Spätere Fragebögen und PROMs werden über eine zentrale Instrumentenbibliothek
verwaltet.

### 7.1 Red Flags

Es DÜRFEN keine erfundenen automatischen Diagnosen oder proprietären
„Red-Flag-Scores" erzeugt werden.

Die Anwendung DARF anhand transparenter definierter Regeln auffällige Angaben
hervorheben.

Beispiel:

Tumoranamnese + aktueller unerklärlicher Gewichtsverlust

→ Warnhinweis zur klinischen Überprüfung.

Die Entscheidung trifft der Therapeut.

Hervorgehoben werden DÜRFEN Patientenangaben unverändert beziehungsweise
eindeutig auf ihre Quelle zurückführbar. Eine eigene klinische Bewertung
dieser Angaben in Form einer Risikoklasse, eines Scores oder einer
Handlungsempfehlung DARF NICHT erzeugt werden (§17).


## 8. Terminplanung

Bestätigte Termine werden grundsätzlich als fix behandelt.

Eine automatische Optimierung DARF bestätigte Patiententermine NICHT ungefragt
verschieben.

Patienten können:

- Terminänderungen anfragen
- mögliche Zeitfenster nennen
- vom System angebotene Alternativen auswählen

Die Terminplanung berücksichtigt in einer späteren Ausbaustufe:

Harte Constraints:

- Patientenverfügbarkeit
- Therapeutenverfügbarkeit
- Behandlungsdauer
- Fahrzeit
- bestehende Termine

Weiche Constraints:

- Patientenpräferenzen
- kurze Fahrwege
- kompakte Touren
- möglichst gleicher Therapeut
- gleichmäßige Arbeitsbelastung

Der Zustandsautomat des Termins ist mit **ADR-018** entschieden (2026-09-11).
Ein Termin trägt genau **einen** Zustand aus dieser Liste: angefragt,
vorgemerkt, bestätigt, abgesagt, nicht angetroffen, durchgeführt, dokumentiert,
abgerechnet. **Angefragt** und **vorgemerkt** sind beschrieben, aber nicht
gebaut — ohne Patientenportal gibt es niemanden, der einen Termin anfragt.

Drei Aussagen sind dabei verbindlich:

- **Jeder Zustandswechsel läuft über eine Serverfunktion mit eigener
  Rollenprüfung und eigenem Auditeintrag.** Es gibt keinen freien
  Statuswechsel über die Tabelle.
- **Dokumentiert und abgerechnet setzt der Vorgang, dem die Tatsache gehört** —
  die Finalisierung der Dokumentation beziehungsweise die Ausstellung der
  Rechnung, in derselben Transaktion. Damit bekommt §19 seinen technischen
  Anker: Fakturiert wird aus „dokumentiert" oder aus „nicht angetroffen" mit
  Ausfallhonorar-Kennzeichen. Ein Termin lässt sich weiterhin **ohne**
  Dokumentation abschließen; die Sperre sitzt an der Rechnung, nicht am
  Abschluss.
- **Eine Absage ist endgültig, eine finalisierte Dokumentation ebenso.** Ein
  versehentlich abgesagter Termin wird neu angelegt; ein Irrtum in der
  Dokumentation wird als Korrektur mit Begründung behoben (§6, ADR-016) und
  ändert den Terminzustand nicht.

Übergänge im Einzelnen, Auslöser, Rollen und die Migration der heutigen Werte:
ADR-018.

Länge eines angebotenen Termins, Dokumentationszeit und der Abstand zum
Folgetermin sind mit §8.1 entschieden.

### 8.1 Terminfenster, Dokumentationszeit und Fahrzeit

Diese Festlegungen hat der Projektinhaber am 2026-09-08 getroffen. Sie gelten
für Termine, die die Anwendung **anbietet** — für jedes neu angelegte und jedes
neu gesetzte Zeitfenster.

Ein angebotener Behandlungstermin MUSS ein Zeitfenster von **60 Minuten**
haben. Die Dokumentation der Behandlung ist darin enthalten.

Ein eigener Dokumentationsblock neben dem Termin DARF NICHT geplant werden. Die
Anwendung DARF NICHT eine feste Aufteilung zwischen Behandlung und
Dokumentation innerhalb der 60 Minuten vorgeben oder erzwingen; wie die
Therapeut:in das Fenster aufteilt, ist ihre Sache.

Der Beginn eines Termins KANN auf jedem Punkt des Praxisrasters liegen. Die
feste Länge beschränkt ihn NICHT auf volle oder halbe Stunden: bei dem heute
eingestellten 5-Minuten-Raster bleiben 09:05, 09:10 und 09:15 zulässig. Welche
Rasterweite gilt, ist eine Einstellung der Praxis und bleibt es (CAL-005).

Ist zwischen zwei aufeinanderfolgenden Terminen eine Fahrzeit zurückzulegen,
kommt sie **zusätzlich** zum Terminfenster. Der früheste zulässige Beginn des
Folgetermins MUSS dann der erste Rasterpunkt **auf oder nach** dem Ende des
vorangehenden Termins zuzüglich der Fahrzeit sein. Auf das Raster wird
**aufgerundet**; ein Abrunden DARF NICHT stattfinden, weil es die Fahrzeit
verkürzen würde.

> **Beispiel** bei 5-Minuten-Raster: Termin 09:05–10:05, danach 12 Minuten
> Fahrzeit. Ende plus Fahrzeit ist 10:17. Der früheste Folgetermin beginnt um
> **10:20** — nicht um 10:15.

Diese Regeln sind **Angebotsregeln**, keine Voreinstellung der Oberfläche. Die
Länge des Zeitfensters MUSS serverseitig durchgesetzt und geprüft werden; eine
Vorbelegung im Formular allein erfüllt sie nicht. Die Rundungsregel MUSS
serverseitig gelten, sobald eine Fahrzeit vorliegt — woher sie kommt und was
bei Unterschreitung geschieht, ist noch nicht entschieden (siehe unten). Wie
jede MUSS-Anforderung MÜSSEN beide test- oder auditierbar sein (§0).

**Bestehende Termine werden nicht rückwirkend verändert.** Ein Termin, der vor
dieser Festlegung mit einer anderen Länge angelegt wurde, bleibt gültig,
sichtbar und bearbeitbar. Die Anwendung DARF ihn NICHT selbsttätig verlängern,
verkürzen oder verschieben, und eine rein organisatorische Änderung an ihm
(behandelnde Person, Terminart, Ort) DARF NICHT an der Länge scheitern. Geprüft
wird das Zeitfenster, wenn es neu gesetzt wird. Das ist dieselbe Abgrenzung,
die für das Raster schon gilt (CAL-005).

Woher eine Fahrzeit stammt, regelt §9 und
[ADR-019](docs/adr/ADR-019-map-service.md). Sie MUSS in jedem Fall
deterministisch entstehen; ein Sprachmodell DARF NICHT in ihrem Ergebnispfad
stehen (§6.2).

Nicht entschieden und deshalb **nicht** Bestandteil dieses Abschnitts sind: ein
pauschaler Mindestabstand zwischen Hausbesuchen, von Hand gepflegte
Fahrminuten, die Frage Warnung oder Sperre bei Unterschreitung und die Frage,
ob eine begründete Abweichung von den 60 Minuten möglich sein soll und wie sie
protokolliert würde. Sie stehen als E12 in
`docs/decisions/OPEN_DECISIONS.md`.


## 9. Routenplanung

Routen und Fahrzeiten MÜSSEN über einen professionellen Kartendienst
integriert werden.

Es DARF keine eigene Routing-Engine entwickelt werden.

In der ersten Ausbaustufe erkennt die Anwendung insbesondere:

- ob zwei Termine zeitlich erreichbar sind
- benötigte Fahrzeit
- sinnvolle Reihenfolge von Hausbesuchen
- Auswirkungen einer Terminänderung

Später KANN eine automatische Tourenoptimierung ergänzt werden.

Ein Kartendienst ist ein Dienstleister mit Zugang zu Patientendaten im Sinne
von §3.5, da eine Adresse in Verbindung mit einem Behandlungstermin
personenbezogen ist.

Routing-Rohdaten unterliegen einer kurzen Speicherfrist (§18).


## 10. Kommunikation

Interne und externe Kommunikation werden getrennt behandelt.

### Intern

Slack-artige Teamkommunikation mit:

- Channels
- Direktnachrichten
- Threads
- Mentions
- Suche
- Anhängen
- Benachrichtigungen

Der interne Teamchat unterliegt einer rollierenden Speicherfrist. Dauerhaft
relevante Inhalte MÜSSEN in den dafür vorgesehenen Fachprozess übernommen
werden (§18).

### Patientenkommunikation

Patientenkommunikation gehört zum jeweiligen Patienten und DARF NICHT mit
internem Teamchat vermischt werden.

Medizinisch relevante Inhalte MÜSSEN der Patientenakte zugeordnet werden
können.

**Entschieden am 2026-09-05:** Patientenkommunikation läuft über einen
gemeinsamen Kanal. Erkennt eine Therapeutin nachträglich klinischen Inhalt in
einer Nachricht, ordnet sie ihn der Patientenakte zu. Dass das Office eine
solche Nachricht bis zu dieser Zuordnung im organisatorischen Kanal nach §4.3
gelesen haben kann, ist eine akzeptierte, dokumentierte Ausnahme — kein
Fehler und kein Grund, den Kanal vorab aufzuteilen.


## 11. Softwareentwicklung

Eine Codebasis ist die technische Wahrheit.

Der Code wird mit Git versioniert und in GitHub verwaltet.

Claude Code darf:

- Code erstellen
- Code verändern
- Tests erstellen
- Refactoring vorschlagen
- Design implementieren
- Dokumentation erstellen
- rechtliche, datenschutzrechtliche und fachliche Fragen recherchieren und
  einen begründeten Vorschlag mit Quellen erarbeiten
- Lücken der Prinzipien, ADRs und Feature-Spezifikationen durch begründete,
  dokumentierte Annahmen schließen (§15.1)

Claude Code DARF NICHT ohne expliziten Auftrag:

- wesentliche Architektur wechseln
- neue externe Anbieter einführen
- Sicherheitsmechanismen umgehen
- Datenbankstrukturen großflächig verändern
- vorhandene Features entfernen
- Produktanforderungen eigenständig ändern

Eine Annahme nach §15.1 ändert keine Produktanforderung. Sie füllt eine Lücke,
die Prinzipien, ADRs und Feature-Spezifikation lassen, und bleibt vorläufig,
bis sie bestätigt ist.

Für Coding- und KI-Entwicklungswerkzeuge gilt zusätzlich die Regel aus §3.1.


## 12. Qualität

Kritische Funktionen MÜSSEN Tests haben.

Besonders kritisch sind:

- Authentifizierung
- Benutzerberechtigungen
- Trennung zwischen Patientenaccounts
- Dokumentationszuordnung
- Dateizugriffe
- KI-Datenflüsse
- Rechnungsdaten

Security oder Datenschutz DÜRFEN NICHT zur schnellen Fertigstellung eines
Features umgangen werden.


## 13. Fehlerbehandlung

Ein Fehler DARF NIEMALS unbemerkt:

- Patientendaten einem falschen Patienten zuordnen
- Daten anderer Patienten offenlegen
- Dokumentation verlieren
- Dokumentation überschreiben
- Rechnungen falsch zuordnen
- Zugriffsrechte erweitern

Bei unsicherem Zustand SOLLTE das System eine Aktion blockieren und einen
verständlichen Fehler anzeigen.

Dieses Blockieren bezieht sich auf schreibende und offenlegende Vorgänge. Für
den lesenden Zugriff der behandelnden Person am Patienten entsteht kein
Konflikt mit der Patientensicherheit, weil nach §4.2 keine Sperre besteht, die
im Notfall zu überwinden wäre. Ein klinischer Break-Glass-Mechanismus ist
deshalb in V1 nicht erforderlich; „Break Glass" bezeichnet ausschließlich
privilegierten technischen Produktionszugriff
([ADR-010](docs/adr/ADR-010-audit-and-privileged-access.md)).


## 14. Skalierbarkeit

Die erste Version wird für eine einzelne Praxis entwickelt.

Das Datenmodell SOLLTE spätere Erweiterungen nicht unnötig verhindern:

- weitere Mitarbeiter
- mehrere Standorte
- größere Fahrradflotten
- Online Coaching
- Abonnements
- Wearables
- spätere Vermarktung der Software

Diese Funktionen DÜRFEN NICHT ohne konkreten Auftrag vorzeitig implementiert
werden.

Umgesetzt wird davon ausschließlich die strukturelle Vorbereitung, die
[ADR-014](docs/adr/ADR-014-foundational-data-model.md) abschließend auflistet —
darunter `organization_id` und, wo fachlich sinnvoll, `location_id` ab der
ersten Datenbankarchitektur nach
[ADR-003](docs/adr/ADR-003-organization-location-model.md). ADR-014 führt
zugleich die verbindliche Negativliste dessen, was NICHT prophylaktisch
implementiert wird; dazu gehören Tenant-Switching-UI, SaaS-Onboarding,
SaaS-Abrechnung, Abonnements, Wearables, Vektordatenbank/Embeddings und native
Apps. „Zukunft nicht verbauen" bedeutet ausdrücklich nicht, zukünftige
Funktionen vorzeitig zu implementieren.


## 15. Projektmanagement

Vor jeder größeren Implementierung:

1. Anforderungen verstehen.
2. Bestehenden Code prüfen.
3. Implementierungsplan erstellen.
4. Risiken und Auswirkungen identifizieren.
5. Erst danach Code verändern.

Nach Implementierung:

1. Tests ausführen.
2. sicherheitsrelevante Änderungen prüfen.
3. Änderungen zusammenfassen.
4. bekannte Einschränkungen nennen.

Keine unnötigen Refactorings außerhalb des beauftragten Bereichs.

### 15.1 Begründete Annahmen

Fehlt bei einer Aufgabe eine Entscheidung, die weder dieses Dokument noch ein
ADR noch die Feature-Spezifikation trifft, wird sie nicht abgewartet. Es gilt:

1. **Recherchieren.** Zuerst die bestehenden Dokumente dieses Projekts, dann
   Primärquellen: Gesetzestext (insbesondere DSGVO, BDSG, BGB, StGB, AO, HGB,
   UStG), Leitlinien und Kurzpapiere der Aufsichtsbehörden
   (Datenschutzkonferenz, BfDI, Landesbeauftragte), Veröffentlichungen der
   Berufsverbände. Sekundärquellen nur ergänzend. Was sich nicht belegen
   lässt, wird als unsicher benannt, nicht als sicher dargestellt.
2. **Entscheiden.** Nach bestem Wissen die Option wählen, die bei
   Unsicherheit die Prioritätenordnung aus §16 wahrt: im Zweifel die
   datensparsamere, die restriktivere und die leichter umkehrbare.
3. **Dokumentieren.** Jede Annahme MUSS im Annahmenregister
   `docs/decisions/ASSUMPTIONS.md` stehen — mit Begründung und Quellen,
   Verankerung im Code und Änderungspfad. Eine Annahme, die nur im Code oder
   nur im Kopf existiert, ist ein Fehler.
4. **Reversibel verankern.** Eine Annahme SOLLTE an genau einer Stelle
   greifen — Policy-Funktion, Konfigurationswert, Konstante, eine Migration —
   und diese Stelle trägt die Kennung `ANN-NNN`. So bleibt die spätere
   Änderung eine begrenzte Änderung.
5. **Validieren lassen.** Annahmen der Kategorien Datenschutz und Recht
   MÜSSEN vor Produktivstart im Datenschutzprozess nach §3.7 bestätigt oder
   geändert werden. Bis dahin sind sie vorläufig — nicht falsch, aber auch
   nicht entschieden.

Eine Annahme DARF NICHT:

- einer MUSS- oder DARF-NICHT-Anforderung dieses Dokuments oder eines ADRs
  widersprechen;
- eine Sicherheits- oder Datenschutzmaßnahme, einen Test oder ein CI-Gate
  aufweichen (§12);
- die Regeln aus §3.1 bis §3.3 berühren — echte Patientendaten,
  Produktionscredentials, Secrets;
- ein Produktionsdeployment, eine Cloud-Ressource oder einen neuen externen
  Anbieter einführen (§3.5, §11, ADR-013);
- eine bestehende Entscheidung ersetzen, deren Rücknahme nach eigener
  Einschätzung einen großen Umbau bedeuten würde — ein anderes Rollenmodell,
  ein anderes Grundprinzip der Datenhaltung, eine andere Rechtsgrundlage für
  die Kernverarbeitung.

Was in diese Liste fällt, ist keine Annahme, sondern eine Änderungsanfrage an
den Projektinhaber, und die Arbeit an genau diesem Punkt stoppt. Alles andere
wird angenommen, dokumentiert und im Bericht des Loops ausdrücklich genannt.


## 16. Priorität

Bei Konflikten gilt grundsätzlich:

Patientensicherheit
>
Datenschutz und Informationssicherheit
>
Datenintegrität
>
korrekte Funktion
>
Usability
>
Performance
>
Entwicklungsgeschwindigkeit
>
zusätzliche Features


## 17. Regulatorische Abgrenzung

Die erste Produktversion wird NICHT mit der Zweckbestimmung entwickelt,
diagnostische oder therapeutische Entscheidungen zu treffen oder entsprechende
Empfehlungen bereitzustellen.

Die Anwendung DARF Gesundheitsinformationen erfassen, speichern, strukturieren
und darstellen sowie transparente mathematische Berechnungen validierter
Instrumente durchführen.

Die Anwendung DARF in V1 keine eigenen klinischen Risikoklassifikationen,
Differentialdiagnosen, Therapieempfehlungen, Behandlungsauswahl oder
automatisierten klinischen Entscheidungen erzeugen.

Generative KI wird in V1 für Dokumentation, sprachliche Transformation,
Zusammenfassung und administrative Assistenz eingesetzt. Sie DARF keine neue
klinische Interpretation hinzufügen, die als Grundlage einer diagnostischen
oder therapeutischen Entscheidung bestimmt ist.

Features, die diese Grenze möglicherweise überschreiten, MÜSSEN als
`MDR_REVIEW_REQUIRED` klassifiziert werden und DÜRFEN vor einer dokumentierten
regulatorischen Prüfung nicht produktiv aktiviert werden.

Vor Produktivstart MÜSSEN Zweckbestimmung und Abgrenzung gegenüber Medical
Device Software anhand der dann aktuellen MDR-/MDCG-Regeln extern überprüft
werden.

Einzelheiten: [ADR-006](docs/adr/ADR-006-medical-device-boundary.md).


## 18. Aufbewahrung und Löschung

Personenbezogene Daten MÜSSEN Datenklassen zugeordnet und entsprechend eines
dokumentierten Retention Schedules verarbeitet werden.

Gesetzliche Aufbewahrungspflichten haben Vorrang vor regulärer Löschung.

Nach Ablauf des jeweiligen Zwecks und aller Aufbewahrungsgründe MUSS eine
echte Löschung erfolgen. **Ein dauerhaftes Soft-Delete ersetzt die gesetzlich
beziehungsweise datenschutzrechtlich erforderliche endgültige Löschung
NICHT.**

Klinische Behandlungsunterlagen werden grundsätzlich zehn Jahre nach Abschluss
der Behandlung aufbewahrt. Steuerlich relevante Rechnungen und Buchungsbelege
folgen der jeweils geltenden steuerrechtlichen Aufbewahrungsfrist. Operative
Daten wie Routinginformationen, kurzfristige KI-Entwürfe und Terminanfragen
erhalten deutlich kürzere Speicherfristen.

Ein dokumentierter Legal-Hold-Mechanismus MUSS die automatische Löschung
während laufender rechtlicher oder regulatorischer Vorgänge verhindern.

Backups DÜRFEN gelöschte Daten bis zum Ende des definierten
Backup-Lebenszyklus enthalten; solche Daten DÜRFEN NICHT regulär zugänglich
sein. Nach einer Wiederherstellung MÜSSEN seit Backup-Erstellung wirksam
gewordene Löschungen erneut angewendet werden.

Accounts und Authentifizierungsdaten MÜSSEN getrennt von
aufbewahrungspflichtigen fachlichen Datensätzen behandelt werden (§4.6).

Der vollständige initiale Retention Schedule steht in
[ADR-008](docs/adr/ADR-008-data-retention-and-deletion.md). Fristen ohne
unmittelbare gesetzliche Vorgabe sind interne Initialentscheidungen und MÜSSEN
vor Produktivstart im Datenschutz-/DSFA-Prozess (§3.7) validiert werden.


## 19. Abrechnung

Die erste Produktversion führt die Privatabrechnung innerhalb der Plattform
durch. Factoring beziehungsweise externe Abrechnungsdienstleister sind nicht
Bestandteil von V1.

Patient und Rechnungsempfänger MÜSSEN als getrennte Entitäten modelliert
werden.

Abrechenbare Leistungen existieren unabhängig von Rechnungen und werden aus
durchgeführten Terminen beziehungsweise anderen abrechenbaren Ereignissen
erzeugt. Eine Leistung DARF NICHT unbeabsichtigt mehrfach abgerechnet werden.

Leistungskatalog und Preisvereinbarungen MÜSSEN versioniert werden.
Historische Leistungen und Rechnungen DÜRFEN durch spätere Preisänderungen
NICHT verändert werden.

Steuerliche Eigenschaften MÜSSEN explizit pro Leistung beziehungsweise
Leistungsversion gespeichert werden und DÜRFEN NICHT durch KI bestimmt werden
(§6.2).

Eine Rechnungsnummer wird erst bei Ausstellung vergeben. Die Vergabe MUSS
eindeutig erfolgen, und eine einmal vergebene Nummer DARF NICHT
wiederverwendet werden.

**Eine ausgestellte Rechnung ist unveränderbar.** Korrekturen erfolgen durch
nachvollziehbare Korrektur-/Stornodokumente und gegebenenfalls eine neue
Rechnung.

Beim Ausstellen MÜSSEN alle rechnungsrelevanten Stammdaten, Leistungsdaten,
Preise und Steuerinformationen als historischer Snapshot gespeichert werden.
Das ausgestellte Rechnungsdokument MUSS in seiner damaligen Form aufbewahrt
werden.

Zahlungen MÜSSEN als eigene Transaktionen modelliert werden und Teilzahlungen
sowie spätere Rückzahlungen ermöglichen.

Therapeutische Leistungen SOLLTEN erst endgültig fakturiert werden können,
wenn die zugehörige Dokumentation finalisiert ist. Berechtigte Overrides
MÜSSEN begründet und protokolliert werden.

V1 unterstützt PDF-Rechnungen für private Rechnungsempfänger. Die Architektur
DARF spätere strukturierte E-Rechnungen NICHT verhindern.

Einzelheiten einschließlich der Rechnungszustände:
[ADR-009](docs/adr/ADR-009-private-billing-model.md).


## 20. Beschäftigtendaten

Routenplanung (§9) und Arbeitszeiterfassung (§1) erzeugen Daten über
Beschäftigte. Diese sind personenbezogene Daten und unterliegen zusätzlich den
Grenzen des Beschäftigtendatenschutzes.

**Eine permanente GPS- oder Live-Ortung von Mitarbeiter:innen findet NICHT
statt.**

Tourendaten dienen der Einsatz- und Routenplanung sowie der Abrechnung, nicht
der Verhaltens- oder Leistungskontrolle.

Routing-Rohdaten unterliegen einer kurzen Speicherfrist (§18).

Ob und in welcher Form aggregierte Auswertungen zulässig sind, ist noch nicht
abschließend entschieden und in `docs/decisions/OPEN_DECISIONS.md` als offener
Punkt geführt.


## 21. Governance dieses Dokuments

Dieses Dokument beschreibt die verbindlichen Produkt-, Sicherheits- und
Datenschutzprinzipien.

Es steht in folgendem Verhältnis zu den übrigen Dokumenten:

- `PROJECT_PRINCIPLES.md` — die Prinzipien. Verbindlich, versioniert.
- `docs/adr/` — Architecture Decision Records. Getroffene Entscheidungen mit
  Kontext, Konsequenzen und offenen Folgefragen.
- `docs/decisions/OPEN_DECISIONS.md` — was noch nicht entschieden ist.
- `docs/decisions/ASSUMPTIONS.md` — begründete, vorläufige Annahmen nach
  §15.1. Sie stehen unterhalb der ADRs und der Feature-Spezifikationen,
  schließen deren Lücken und überschreiben nichts. Eine bestätigte Annahme,
  deren Rücknahme teuer wäre, wird ADR.

Widerspricht ein ADR diesem Dokument, ist das ein Fehler und MUSS aufgelöst
werden. Bis zur Auflösung gilt die Aussage dieses Dokuments; wer den
Widerspruch bemerkt, hält ihn im Annahmenregister fest und meldet ihn im
Bericht. Wird durch einen ADR eine Prinzipienaussage geändert, MUSS dieses
Dokument in einer neuen Version nachgezogen werden.

Angenommene ADRs zum Stand dieser Version:

| ADR | Gegenstand | Konsolidiert in |
|---|---|---|
| ADR-001 | Online-first mit begrenzter Offline-Fähigkeit | §2.2, §5 |
| ADR-002 | Hosting und Datenstandort | §3.2, §3.5, §3.6 |
| ADR-003 | `organization_id` und `location_id` | §1, §14 |
| ADR-004 | Berechtigungsmodell | §4 |
| ADR-005 | Providerunabhängige KI-Anbindung (Fassung 2) | §6, §6.1, §6.2, §6.3 |
| ADR-006 | Abgrenzung gegenüber Medical Device Software (Fassung 2) | §7.1, §17, §6.3 |
| ADR-007 | Datenschutz-Folgenabschätzung und Datenschutzprozess | §3.7 |
| ADR-008 | Aufbewahrung und Löschung | §4.6, §10, §18 |
| ADR-009 | Privatabrechnung | §19 |
| ADR-010 | Audit-Logging und privilegierter Produktionszugriff | §3.1, §4.1, §4.2, §13 |
| ADR-011 | Logging und Observability | §3.6 |
| ADR-012 | Backup, Wiederherstellung und Betriebskontinuität | §3.4, §13 |
| ADR-013 | CI/CD und Release-Governance | §11, §12 |
| ADR-014 | Grundlegende Datenmodell-Entscheidungen | §14 |
| ADR-015 | Initialer technischer Stack | §2.1, §2.2, §3.4 |
| ADR-016 | Klinische Dokumentation: Entwurf, Finalisierung, Änderbarkeit (Fassung 2) | §5, §6.3 |
| ADR-018 | Zustandsautomat des Termins | §8 |

Änderungen an diesem Dokument erfolgen als eigener Commit mit erhöhter
Dokumentversion und ergänztem Änderungsvermerk.

Zwei Abschnitte dieses Dokuments halten eine Entscheidung fest, für die es
keinen eigenen ADR gibt: §8.1 (Terminfenster) und §6.3 (Sprachdokumentation).
Beide lösen kein Architekturproblem, sondern halten eine Produktentscheidung
des Projektinhabers fest. Was daran technisch zu entscheiden war, steht in
ADR-005, ADR-006 und ADR-016; was daran offen geblieben ist, in
`docs/decisions/OPEN_DECISIONS.md` E12 und E13.
