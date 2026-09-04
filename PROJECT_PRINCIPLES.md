# PROJECT_PRINCIPLES.md

## Dokumentinformation

| | |
|---|---|
| **Dokumentversion** | **0.2.2** |
| **Änderungsdatum** | **2026-09-02** |
| Vorversion | 0.1 (Baseline, unverändert im Git-Verlauf erhalten) |
| Verbindliche Architekturentscheidungen | ADR-001 bis ADR-016, siehe `docs/adr/` |
| Offene Entscheidungen | `docs/decisions/OPEN_DECISIONS.md` |

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

Ob die Angabe „erbrachte Leistung" als organisatorische oder als klinische
Information einzustufen ist, ist noch nicht entschieden und in
`docs/decisions/OPEN_DECISIONS.md` als offener Punkt geführt.

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

Der Zustandsautomat des Termins ist noch nicht definiert und in
`docs/decisions/OPEN_DECISIONS.md` als offener Punkt geführt.


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

Wie klinische Inhalte innerhalb der Patientenkommunikation klassifiziert
werden und wie sich das zum Office-Zugriff nach §4.3 verhält, ist noch nicht
entschieden und in `docs/decisions/OPEN_DECISIONS.md` als offener Punkt
geführt.


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

Claude Code DARF NICHT ohne expliziten Auftrag:

- wesentliche Architektur wechseln
- neue externe Anbieter einführen
- Sicherheitsmechanismen umgehen
- Datenbankstrukturen großflächig verändern
- vorhandene Features entfernen
- Produktanforderungen eigenständig ändern

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

Widerspricht ein ADR diesem Dokument, ist das ein Fehler und MUSS aufgelöst
werden. Wird durch einen ADR eine Prinzipienaussage geändert, MUSS dieses
Dokument in einer neuen Version nachgezogen werden.

Angenommene ADRs zum Stand dieser Version:

| ADR | Gegenstand | Konsolidiert in |
|---|---|---|
| ADR-001 | Online-first mit begrenzter Offline-Fähigkeit | §2.2, §5 |
| ADR-002 | Hosting und Datenstandort | §3.2, §3.5, §3.6 |
| ADR-003 | `organization_id` und `location_id` | §1, §14 |
| ADR-004 | Berechtigungsmodell | §4 |
| ADR-005 | Providerunabhängige KI-Anbindung | §6, §6.1, §6.2 |
| ADR-006 | Abgrenzung gegenüber Medical Device Software | §7.1, §17 |
| ADR-007 | Datenschutz-Folgenabschätzung und Datenschutzprozess | §3.7 |
| ADR-008 | Aufbewahrung und Löschung | §4.6, §10, §18 |
| ADR-009 | Privatabrechnung | §19 |
| ADR-010 | Audit-Logging und privilegierter Produktionszugriff | §3.1, §4.1, §4.2, §13 |
| ADR-011 | Logging und Observability | §3.6 |
| ADR-012 | Backup, Wiederherstellung und Betriebskontinuität | §3.4, §13 |
| ADR-013 | CI/CD und Release-Governance | §11, §12 |
| ADR-014 | Grundlegende Datenmodell-Entscheidungen | §14 |

Änderungen an diesem Dokument erfolgen als eigener Commit mit erhöhter
Dokumentversion und ergänztem Änderungsvermerk.
