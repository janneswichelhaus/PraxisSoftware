# PROJECT_PRINCIPLES.md

## 1. Zweck des Projekts

Wir entwickeln eine zentrale Softwareplattform für eine privat abrechnende Physiotherapiepraxis mit starkem Fokus auf Hausbesuche und mobile Versorgung.

Die Software soll langfristig möglichst alle wesentlichen Arbeitsprozesse der Praxis in einer einzigen Benutzeroberfläche bündeln.

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

Das primäre Ziel ist der effiziente und sichere Betrieb der eigenen Physiotherapiepraxis.

Eine spätere Vermarktung an andere Praxen soll architektonisch nicht ausgeschlossen werden, ist aktuell aber kein Produktziel.


## 2. Produktprinzipien

### 2.1 Eine Plattform

Mitarbeiter und Patienten sollen möglichst nur diese eine Plattform verwenden müssen.

Externe Dienste wie Datenbankanbieter, Kartenanbieter, E-Mail-Dienste oder KI-Anbieter dürfen im Hintergrund integriert werden.

Sie sollen jedoch möglichst keine zusätzlichen Benutzeroberflächen für den Praxisalltag erforderlich machen.


### 2.2 Mobile First

Therapeut:innen arbeiten regelmäßig außerhalb der Praxis.

Alle zentralen Funktionen müssen deshalb auf Smartphones vollständig praktikabel sein.

Die Anwendung wird zunächst als responsive Web-App/PWA entwickelt.

Keine nativen iOS- oder Android-Apps in der ersten Entwicklungsphase.


### 2.3 Praxisprozesse bestimmen die Software

Technische Möglichkeiten sind kein Selbstzweck.

Vor der Implementierung wesentlicher Features sollen Zweck, Nutzer, Workflow, Daten und Berechtigungen definiert werden.

Claude darf keine grundlegenden Praxisprozesse eigenständig erfinden oder bestehende Prozesse ohne Auftrag verändern.


## 3. Datenschutz und Sicherheit

Die Anwendung verarbeitet Gesundheitsdaten und andere besonders sensible personenbezogene Daten.

Datenschutz und Informationssicherheit sind deshalb grundlegende Architekturprinzipien und keine nachträglichen Features.

### 3.1 Entwicklungsdaten

In Entwicklungs-, Test- und Demonstrationsumgebungen werden ausschließlich synthetische Daten verwendet.

Keine echten Patientendaten dürfen in:

- Claude Code
- ChatGPT
- Codex
- Gemini
- GitHub Issues
- Entwicklungslogs
- Testdaten

eingefügt werden.


### 3.2 Produktionsdaten

Produktionsdaten und Entwicklungsdaten müssen technisch getrennt sein.

Produktionszugriffe benötigen individuelle Benutzerkonten.

Gemeinsam verwendete Accounts sind nicht erlaubt.


### 3.3 Keine Secrets im Code

Passwörter, API Keys, Datenbankzugangsdaten, Tokens oder sonstige Secrets dürfen niemals hart im Quellcode stehen oder in GitHub committed werden.

Secrets werden ausschließlich über dafür geeignete Environment-/Secret-Management-Systeme verwaltet.


### 3.4 Keine selbst entwickelte Sicherheitsinfrastruktur

Nicht selbst implementieren:

- Kryptografie
- Passwort-Hashing
- Session-Security
- grundlegende Authentifizierungsverfahren
- Datenbank-Engine
- Backup-Engine

Hierfür etablierte und professionell betriebene Komponenten verwenden.


## 4. Benutzerrollen

Das System benötigt mindestens folgende Rollen:

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

Besonders kritische technische Administration soll perspektivisch von normalen Alltagsrechten getrennt werden.


### 4.2 Therapeut

Alle Therapeut:innen der Praxis dürfen grundsätzlich auf alle Patientenakten der Praxis zugreifen.

Das ist eine bewusste Produktentscheidung.

Damit sollen insbesondere ermöglicht werden:

- Vertretungen
- fachlicher Austausch
- flexible Patientenübernahme
- interdisziplinäre Rückfragen
- kurzfristige Einsatzänderungen

Ein individuelles Benutzerkonto ist trotzdem Pflicht.

Zugriffe auf Patientendaten sollen auditierbar sein.

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

Standardmäßig KEIN Zugriff auf vollständige klinische Dokumentationen.


### 4.4 Sonderfall Behandlungsnachweis

Für organisatorische Konflikte soll ein eigener datensparsamer Behandlungsnachweis existieren.

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

Das Office soll hierfür NICHT automatisch den medizinischen Inhalt der Behandlung sehen.

Falls vollständige klinische Dokumentation für einen konkreten Vorgang erforderlich ist, soll später ein fallbezogener, zeitlich begrenzter und protokollierter Zugriff ermöglicht werden.

Dieser Zugriff muss durch eine dazu berechtigte Rolle freigegeben werden.


### 4.5 Teamleitung

Teamleitung erhält alle Rechte eines Therapeuten sowie definierte organisatorische Zusatzrechte.

Mögliche Zusatzrechte:

- Urlaubsanträge bearbeiten
- Einsatzplanung
- Mitarbeiterplanung
- Rad-/Ressourcenzuteilung
- organisatorische Auswertungen

Teamleitung ist keine technische Administratorrolle.


### 4.6 Patient

Patienten dürfen ausschließlich ihre eigenen Daten sehen.

Das Patientenportal soll perspektivisch enthalten:

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

Patienten erhalten nicht automatisch Zugriff auf sämtliche internen klinischen oder organisatorischen Notizen.


## 5. Klinische Dokumentation

Behandlungsdokumentationen müssen nachvollziehbar gespeichert werden.

Eine finalisierte Dokumentation darf nicht unbemerkt überschrieben werden.

Änderungen müssen grundsätzlich nachvollziehbar bleiben.

Zu berücksichtigen sind mindestens:

- Autor
- Erstellungszeitpunkt
- Zeitpunkt späterer Änderungen
- ursprüngliche Version
- geänderte Version


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

KI darf nicht autonom:

- Diagnosen stellen
- Red Flags ausschließen
- klinisch relevante Entscheidungen treffen
- Behandlungen verbindlich verändern
- Nachrichten mit relevanten Folgen ungeprüft versenden
- Patientenakten endgültig verändern


### 6.1 AI Privacy Gateway

Produktionsdaten sollen nicht beliebig aus einzelnen Programmteilen direkt an externe KI-Anbieter gesendet werden.

Langfristig soll ein zentraler AI-Service bzw. Privacy Gateway verwendet werden.

Dieser soll kontrollieren:

- Benutzerberechtigung
- Verarbeitungszweck
- notwendige Daten
- Datenminimierung
- Pseudonymisierung
- erlaubtes KI-Modell
- Logging
- Fehlerbehandlung

Direkte Identifikatoren sollen möglichst nicht an das Sprachmodell übertragen werden, wenn sie für die Aufgabe nicht erforderlich sind.


## 7. Fragebögen

Fragebögen werden nicht lediglich als PDFs gespeichert, sondern soweit sinnvoll als strukturierte digitale Formulare modelliert.

Jeder Fragebogen benötigt eine Version.

Bereits abgeschlossene Fragebögen bleiben in der beantworteten Version erhalten.

Der initiale Anamnesebogen basiert auf dem von DIGOTOR bereitgestellten Anamnesebogen Version 8 / 07-2026.

Spätere Fragebögen und PROMs werden über eine zentrale Instrumentenbibliothek verwaltet.


### 7.1 Red Flags

Keine erfundenen automatischen Diagnosen oder proprietären „Red-Flag-Scores“.

Die Anwendung darf anhand transparenter definierter Regeln auffällige Angaben hervorheben.

Beispiel:

Tumoranamnese + aktueller unerklärlicher Gewichtsverlust

→ Warnhinweis zur klinischen Überprüfung.

Die Entscheidung trifft der Therapeut.


## 8. Terminplanung

Bestätigte Termine werden grundsätzlich als fix behandelt.

Eine automatische Optimierung darf bestätigte Patiententermine nicht ungefragt verschieben.

Patienten können:

- Terminänderungen anfragen
- mögliche Zeitfenster nennen
- vom System angebotene Alternativen auswählen

Die Terminplanung soll später berücksichtigen:

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


## 9. Routenplanung

Routen und Fahrzeiten sollen über einen professionellen Kartendienst integriert werden.

Keine eigene Routing-Engine entwickeln.

Die Anwendung soll zunächst insbesondere erkennen können:

- ob zwei Termine zeitlich erreichbar sind
- benötigte Fahrzeit
- sinnvolle Reihenfolge von Hausbesuchen
- Auswirkungen einer Terminänderung

Später kann eine automatische Tourenoptimierung ergänzt werden.


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

### Patientenkommunikation

Patientenkommunikation gehört zum jeweiligen Patienten und darf nicht mit internem Teamchat vermischt werden.

Medizinisch relevante Inhalte sollen der Patientenakte zugeordnet werden können.


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

Claude Code soll NICHT ohne expliziten Auftrag:

- wesentliche Architektur wechseln
- neue externe Anbieter einführen
- Sicherheitsmechanismen umgehen
- Datenbankstrukturen großflächig verändern
- vorhandene Features entfernen
- Produktanforderungen eigenständig ändern


## 12. Qualität

Kritische Funktionen benötigen Tests.

Besonders kritisch sind:

- Authentifizierung
- Benutzerberechtigungen
- Trennung zwischen Patientenaccounts
- Dokumentationszuordnung
- Dateizugriffe
- KI-Datenflüsse
- Rechnungsdaten

Security oder Datenschutz dürfen nicht zur schnellen Fertigstellung eines Features umgangen werden.


## 13. Fehlerbehandlung

Ein Fehler darf niemals unbemerkt:

- Patientendaten einem falschen Patienten zuordnen
- Daten anderer Patienten offenlegen
- Dokumentation verlieren
- Dokumentation überschreiben
- Rechnungen falsch zuordnen
- Zugriffsrechte erweitern

Bei unsicherem Zustand soll das System lieber eine Aktion blockieren und einen verständlichen Fehler anzeigen.


## 14. Skalierbarkeit

Die erste Version wird für eine einzelne Praxis entwickelt.

Das Datenmodell sollte spätere Erweiterungen jedoch nicht unnötig verhindern:

- weitere Mitarbeiter
- mehrere Standorte
- größere Fahrradflotten
- Online Coaching
- Abonnements
- Wearables
- spätere Vermarktung der Software

Diese Funktionen sollen aber nicht ohne konkreten Auftrag vorzeitig implementiert werden.


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
