# PROJECT_PRINCIPLES.md

## Dokumentinformation

| | |
|---|---|
| **Dokumentversion** | **0.17** |
| **Änderungsdatum** | **2026-09-23** |
| Vorversion | 0.16 (2026-09-22); 0.15 (2026-09-22); 0.14 (2026-09-22); 0.13 (2026-09-20); 0.12.2 (2026-09-20); 0.12.1 (2026-09-20); 0.12 (2026-09-16); 0.11.2 (2026-09-17); 0.11.1 (2026-09-16); 0.11 (2026-09-16); 0.10.2 (2026-09-15); 0.10.1 (2026-09-15); 0.10 (2026-09-13); 0.9 (2026-09-12); 0.8 (2026-09-12); 0.7 (2026-09-11); 0.6 (2026-09-11); 0.5 (2026-09-08); 0.4 (2026-09-05); 0.2.2 Korrekturversion; 0.1 Baseline, unverändert im Git-Verlauf erhalten |
| Verbindliche Architekturentscheidungen | ADR-001 bis ADR-022, siehe `docs/adr/` — Fassungen und Status stehen dort, nicht hier; ADR-023 (Plattformzugang) ist vorgesehen |
| Offene Entscheidungen | `docs/decisions/OPEN_DECISIONS.md` — ohne Rang, siehe §21 |
| Vorläufige Annahmen | `docs/decisions/ASSUMPTIONS.md` (§15.1) |

Dieses Dokument trägt nur den geltenden Stand. Die Änderungsvermerke aller
Versionen stehen in [`docs/PRINCIPLES-CHRONIK.md`](docs/PRINCIPLES-CHRONIK.md).

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
- Plattform für Patient:innen und Trainingskund:innen
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
Physiotherapiepraxis. Sie hat keine Behandlungsräume: Behandelt wird im
Hausbesuch, alle Wege werden mit dem Rad zurückgelegt. Wie das Produkt im
Alltag aussieht, beschreibt [`docs/PRODUCT_VISION.md`](docs/PRODUCT_VISION.md).

Eine spätere Vermarktung an andere Praxen soll architektonisch nicht
ausgeschlossen werden, ist aktuell aber kein Produktziel. Die dafür
vorgesehene, bewusst minimale Vorbereitung im Datenmodell regelt
[ADR-003](docs/adr/ADR-003-organization-location-model.md).

### 1.1 Klarnamen statt Pseudonymisierung

Festgelegt vom Projektinhaber am 2026-09-17.

Personen werden in der Anwendung mit **Klarnamen** geführt. Eine
pseudonymisierende Codearchitektur wird **nicht** eingeführt. Das Schutzniveau
liefern Zugriffskontrolle in der Datenbank, Auditpflicht und Verschlüsselung
(§3, §4.7, [ADR-004](docs/adr/ADR-004-authorization-model.md),
[ADR-010](docs/adr/ADR-010-audit-and-privileged-access.md)).

Begründung: In einer Praxis, in der der Inhaber selbst behandelt, schützt eine
Pseudonymisierung kaum — die Zuordnung ist ohnehin bekannt und muss jederzeit
herstellbar sein —, erschwert aber Terminorganisation, Abrechnung und
Kommunikation erheblich.

**Das Schutzniveau ist für alle Personen dasselbe**, unabhängig davon, ob sie
in einem Behandlungs- oder in einem Trainingsverhältnis stehen. Zwei
Datenschutzniveaus in einer Anwendung DÜRFEN NICHT entstehen.

Unberührt bleiben: die Datenminimierung gegenüber externen Diensten (§6.1,
§9), die Trennung von Entwicklungs- und Produktionsdaten (§3.1, §3.2) und die
Pseudonymisierung in Auswertungen, wo sie fachlich ohnehin geboten ist (§20).

### 1.2 Zwei Leistungsbereiche

Festgelegt vom Projektinhaber am 2026-09-17 (E18), unterlegt durch
[ADR-021](docs/adr/ADR-021-service-areas-and-legal-relationships.md),
[ADR-022](docs/adr/ADR-022-appointment-context-and-training-basis.md),
[ADR-006](docs/adr/ADR-006-medical-device-boundary.md) und
[ADR-009](docs/adr/ADR-009-private-billing-model.md).

Die Software deckt **zwei Leistungsbereiche** ab: die **Heilbehandlung** mit
therapeutischem Zweck und **Leistungen ohne Heilbehandlungszweck** — Personal
Training und Online Coaching. Im Code und im Datenmodell heißen die beiden
Bereiche `therapy` und `training`.

**Getrennt wird nach Rechtsverhältnis, nicht nach Person.** Eine Person KANN
gleichzeitig einen Behandlungsvertrag (§ 630a BGB) und einen Dienstvertrag über
Training (§ 611 BGB) haben. Rechtsgrundlage, Datenklasse, Aufbewahrungsfrist,
Dokumentationspflicht und steuerliche Behandlung hängen am **Verhältnis**; sie
DÜRFEN NICHT an der Person festgemacht werden. Das Datenmodell MUSS diese
Trennung erzwingen — sie abzubilden genügt nicht (ADR-021 Punkte 1 bis 3).

**Im Zweifel gilt das strengere Behandlungsregime.** Ist nicht eindeutig, zu
welchem Bereich ein Datum, ein Termin oder eine Akte gehört, MUSS der Bereich
mit dem höheren Schutz und der längeren Frist gelten. Das ist dieselbe Richtung
wie §16 und schützt die Zweckbindung, nicht die Bequemlichkeit.

Diese Zweifelsregel gilt für Schutzniveau, Zugriff, Dokumentation und
Aufbewahrung. Sie gilt **nicht** für die steuerliche Einordnung: Das
Steuerkennzeichen hängt nach ADR-009 Punkt 15 am **Posten** und folgt der
erbrachten Leistung. Ein im Zweifel gewähltes „steuerfrei" wäre dort keine
Vorsicht, sondern eine falsche Angabe.

Sprachregelung, verbindlich für alle Dokumente dieses Projekts: „PT" wird NICHT
als Abkürzung benutzt. Es heißt **Physiotherapie** oder **Personal Training**,
ausgeschrieben (ADR-021 Punkt 9).

Training findet bei den Kund:innen, draußen oder per Video statt und steht im
selben Kalender und in derselben Tagesroute wie die Behandlung (ADR-022).
Anfangs wird es vor allem von Patient:innen gebucht, deren Verordnung endet
(§4.10). Wie der Zugriff dem Bereich folgt, steht in §4.8; die Zweckbestimmung
gilt in beiden Bereichen unverändert (§17).


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

Therapeut:innen arbeiten unterwegs; das Smartphone steckt in der Halterung am
Rad.

Alle zentralen Funktionen MÜSSEN auf Smartphones vollständig praktikabel sein.
Die Oberfläche SOLLTE zeigen, was für den nächsten Schritt gebraucht wird, und
nicht mehr; ihre Beschriftungen SOLLTEN der Sprache der Praxis folgen, nicht
der des Datenmodells.

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

Die Praxis wächst von einer Person aus: Zur Eröffnung arbeitet vor allem der
Praxisinhaber mit der Anwendung und übernimmt auch das Büro. Ein neues
Teammitglied SOLLTE der Praxisinhaber in der Anwendung selbst anlegen und mit
einer Rolle einbinden können, ohne technische Administration (§4.1). Heute
entsteht das Konto noch über den Anmeldedienst (ANN-025), weil die Anwendung
keine eigenen Mails verschickt (B13).

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
sind in [ADR-010](docs/adr/ADR-010-audit-and-privileged-access.md) geregelt.
Lesen darf das Auditlog in V1 allein der Praxisinhaber, über einen eigenen,
selbst auditierten Lesepfad (ADR-010). Dieselbe Auditpflicht gilt
für jeden lesenden Zugriff des Office auf klinische Inhalte (§4.3).

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

**Klinische Inhalte (E15).** Office hat lesenden
Zugriff auf alle klinischen Inhalte einer Patientenakte im selben Umfang wie
Therapeut:innen: Diagnose und Verordnung einschließlich Scan,
Behandlungsdokumentation mit Verlauf, Befunde, patientenbezogene Nachrichten.
Office schreibt keine klinische Dokumentation und keine Befunde. Jeder Zugriff
ist auditpflichtig wie bei Therapeut:innen (§4.2, ADR-010); das Auditlog ist
damit auch für diese Rolle die tragende Kompensationsmaßnahme. Die
datenschutzrechtliche Bewertung dieser Öffnung (Need-to-know, DSFA) gehört in
die Anfrage B2 ([ADR-007](docs/adr/ADR-007-data-protection-impact-assessment.md)).

**Mitarbeiterorganisation (E10).** Office DARF die
**Stammdaten** einer beschäftigten Person anlegen und ändern: Name, dienstliche
Erreichbarkeit, Hauptstandort. Liefe jede Adressänderung über den
Praxisinhaber, wäre er das Nadelöhr — bei Bus-Faktor 1 ein reales
Betriebsrisiko ([ADR-012](docs/adr/ADR-012-backup-and-business-continuity.md)).

Office DARF NICHT:

- Rollen vergeben oder ändern (§4.1, ADR-004)
- den Beschäftigungsstatus wechseln (§4.1)
- Zugänge einladen oder sperren (§4.1, ADR-004)
- die Privatangaben nach §20 lesen oder schreiben

Die Privatangaben sind bewusst beidseitig ausgenommen: Ein Schreibrecht ohne
Leserecht würde bedeuten, dass ein Formular sie leer anzeigt und beim Speichern
löscht. Schreib- und Leserecht bleiben hier deckungsgleich.

Der Behandlungsnachweis nach §4.4 bleibt als datensparsame Sicht für Rechnung
und organisatorische Konflikte bestehen.

### 4.4 Sonderfall Behandlungsnachweis

Für organisatorische Konflikte MUSS ein eigener datensparsamer
Behandlungsnachweis existieren: die Sicht ohne klinischen Inhalt, die auf der
Rechnung erscheint und außerhalb der Praxis gezeigt werden kann.

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

Der Nachweis trägt keinen klinischen Inhalt. Leistungskürzel (z. B. „MT",
„KG") gelten als organisatorische Information (C1).

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
(E10). Teamleitung schreibt weder Mitarbeiterstammdaten
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

Die Plattform hat für Patient:innen zwei Stufen (Entscheidung des
Projektinhabers vom 2026-09-23):

**Während der Behandlung — ohne Entgelt, als Teil der Heilbehandlung:**

- Befundbogen, idealerweise vorab ausgefüllt (§7)
- eigene Termine; Terminanfragen und Änderungswünsche — eine Anfrage ist ein
  **Wunsch**, den die Praxis bestätigt, kein gebuchter Termin (§8)
- Heimübungsplan mit Übungen und Videos
- Check-ins zwischen den Terminen
- eigene Rechnungen und freigegebene Dokumente
- Erteilen und Widerrufen von Einwilligungen
- sichere Kommunikation mit der Praxis

**Nach dem Ende der Behandlung — Nachsorge-Abo:** Eine monatlich kündbare
Leistung der Praxis (§19). Das Heimprogramm bleibt aktiv und wird angepasst;
dazu kommen Fortschrittsverlauf, Gewohnheiten und Rückfragen mit Foto oder
Video mit einer zugesagten Antwortfrist. Nach einer Kündigung bleibt der
Zugriff 30 Tage lesend, und der Plan ist als PDF mitzunehmen; die Akte folgt
unverändert §18.

Der Heimübungsplan gehört zur **Behandlung**. Das Trainingsverhältnis nach
§1.2 ist etwas anderes; sein Gegenstück zu dieser Ziffer steht in §4.10. Wie
die Ansicht der Patient:innen im Einzelnen aussieht, ist noch nicht entworfen;
das geschieht vor dem ersten Loop der Plattform.

Patienten erhalten nicht automatisch Zugriff auf sämtliche internen klinischen
oder organisatorischen Notizen. Identitätsprüfung sowie Vertretungs- und
Angehörigenzugriff regelt ADR-023, bevor die Plattform gebaut wird.

### 4.7 Durchsetzung der Berechtigungen

Berechtigungen MÜSSEN über einen zentralen Policy-/Authorization-Layer
durchgesetzt werden, kombiniert mit Datenbank-RLS als Defense-in-Depth.

Suche, Dateien, Exporte und spätere KI-/RAG-Funktionen MÜSSEN dieselben
Berechtigungsregeln respektieren.

Antworten der Anwendung MÜSSEN rollenabhängige Projektionen sein. Geschützte
Inhalte DÜRFEN NICHT ausgeliefert und erst im Client ausgeblendet werden.

Einzelheiten: [ADR-004](docs/adr/ADR-004-authorization-model.md).

### 4.8 Zugriff folgt dem Verhältnis, nicht der Person

Wortlaut der Festlegung vom 2026-09-17 (E18). Diese Ziffer gilt **über alle
Rollen hinweg** und gehört deshalb in keine einzelne.

> Zugriff folgt dem Verhältnis, nicht der Person. Aus einer Rolle im
> Trainingsverhältnis folgt kein Zugriff auf Daten des
> Behandlungsverhältnisses derselben Person, und umgekehrt. Datenübernahme
> zwischen beiden erfolgt ausschließlich als dokumentierte Kopie auf Grundlage
> einer Einwilligung.

Daraus folgt verbindlich:

- Jede Rolle MUSS benennen, in welchem Leistungsbereich nach §1.2 sie gilt.
- Aus einer Rolle des einen Bereichs DARF NICHT auf Daten des anderen
  geschlossen werden — auch nicht mittelbar über die gemeinsame Identität.
- Die Trennung MUSS in den Policies und in der Datenbank-RLS durchgesetzt
  werden, nicht in der Oberfläche (§4.7, ADR-021 Punkt 6).
- Eine Übernahme von Daten aus der Behandlung in das Training MUSS eine
  dokumentierte Kopie mit Einwilligung sein und DARF NICHT als Referenz
  entstehen (ADR-021 Punkt 7).
- Lesende Zugriffe auf Trainingsdaten sind **auditpflichtig wie die auf die
  Akte** (§4.2, ADR-010). Für beide Bereiche gilt einheitlich das strengere
  § 203-Niveau (ADR-021 Punkt 8).

Das Rollenprinzip aus der Einleitung dieses Abschnitts bleibt unberührt: Wer
beide Rollen hat, sieht beides. Verboten ist der **Schluss** von einer Rolle
auf den jeweils anderen Bereich, nicht die Häufung zweier Rollen an einer
Person.

Eine Ausnahme ist bewusst bezahlt: die **Belegung** im gemeinsamen Kalender.
Dass ein Zeitraum belegt ist, bleibt über alle Kontexte hinweg sichtbar — sonst
sind Doppelbuchungen nicht zu verhindern, und es entstünden zwei Kalender
(ADR-022). Sichtbar ist die Belegung, nicht der Inhalt des Termins.

Für die vorhandenen Rollen gilt damit:

| Rolle | gilt im Bereich | Anmerkung |
|---|---|---|
| §4.1 Praxisinhaber | `therapy` und `training` | Vertragspartner beider Verhältnisse; die einzige Rolle, die beide Bereiche aus sich heraus trägt |
| §4.2 Therapeut | `therapy` | Der offene Zugriff auf alle Patientenakten gilt **innerhalb** der Behandlung und begründet keinen Zugriff auf Trainingsdaten |
| §4.3 Office | `therapy`; im `training` nur organisatorisch | Termin, Vertragsstatus, erbrachte Leistung, Rechnung, Zahlung. Screening- und Gesundheitsangaben des Trainings sind für Office **gesperrt**, bis die DSFA sie bewertet (Anfrage B2, ADR-007) — §16: im Zweifel restriktiver, später zu öffnen ist billig |
| §4.5 Teamleitung | wie §4.2, dazu die organisatorischen Zusatzrechte | keine Trainingsdaten, solange ihr nicht zusätzlich §4.9 zugewiesen ist |
| §4.6 Patient | `therapy` | eigene Daten des Behandlungsverhältnisses |
| §4.9 Trainingsbetreuung | `training` | die Rolle, die diese Ziffer auf der Trainingsseite besetzt |
| §4.10 Trainingskund:in | `training` | eigene Daten des Trainingsverhältnisses |

### 4.9 Trainingsbetreuung

Diese Rolle betreut Trainingsverhältnisse. Ohne sie bliebe §4.8 eine Grenze,
hinter der niemand steht (ADR-021, Konsequenzen).

Trainingsbetreuung DARF:

- Trainingsverhältnisse anlegen, ändern und beenden
- Termine im Kontext `training` planen und bearbeiten (ADR-022)
- Trainingsgrundlage und Trainingsprotokoll führen
- Screening- und Gesundheitsangaben des Trainings erheben und einsehen, soweit
  eine ausdrückliche Einwilligung vorliegt (Art. 9 Abs. 2 lit. a DSGVO)
- mit Kund:innen des Trainings kommunizieren

Trainingsbetreuung DARF NICHT:

- Patientenakten, Befunde, Behandlungsdokumentation oder Verordnungen einsehen
- Behandlungstermine bearbeiten oder Behandlungsdokumentation erzeugen
- eine Trainingsfreigabe, eine Kontraindikation oder einen Abbruch von der
  Software ableiten lassen (§17) — diese Entscheidung trifft der Mensch und
  wird als seine dokumentiert

Ein individuelles Benutzerkonto ist Pflicht; Trainingsbetreuung ist keine
technische Administratorrolle. Den **Bezeichner** der Rolle im Code entscheidet
der SPEC des Loops, der sie baut ([ADR-014](docs/adr/ADR-014-foundational-data-model.md));
dieses Dokument legt ihren Schnitt fest, nicht ihren Schlüssel.

### 4.10 Trainingskund:in

Das Gegenstück zu §4.6 für den zweiten Leistungsbereich.

Kund:innen des Trainings DÜRFEN ausschließlich ihre **eigenen** Daten des
Trainingsverhältnisses sehen.

**Konto und Verhältnis sind getrennte Konzepte**, wie in §4.6: Ein
Benutzerkonto ist ein Zugangsmittel; das Trainingsverhältnis ist ein
fachlicher Datenbestand mit eigener Frist — drei Jahre ab Vertragsende,
Screening früher (ADR-021 Punkt 4, §18). Das Löschen oder Sperren eines Kontos
DARF das Verhältnis nicht löschen, und das Bestehen eines Verhältnisses setzt
kein Konto voraus.

Die Ansicht der Trainingskund:innen umfasst, soweit §17 nichts davon
ausschließt (Vorbild war
[`docs/product/ideen/referenz-navigation.md`](docs/product/ideen/referenz-navigation.md)):
Übersicht, Kalender, Einheiten, Check-ins,
Fortschritt, Pläne, Aktivitäten, Assessments, Profil, Gewohnheiten, Ernährung
als Protokoll und Zielwert, Rückfragen, Einstellungen. Dazu gehören eigene
Rechnungen und das Erteilen und Widerrufen der Einwilligung nach Art. 9 Abs. 2
lit. a DSGVO. Das Trainingsprotokoll sehen Kund:innen, soweit es freigegeben
ist; interne Notizen der Betreuung sind nicht automatisch sichtbar. Die Plattform ist im Paketpreis enthalten; ein Paket gilt für
einen Zeitraum und ist nicht pausierbar (§19).

**Übergang aus der Behandlung** (Entscheidung vom 2026-09-23): In den letzten
Terminen einer Behandlungsgrundlage erinnert die Anwendung die behandelnde Person an das
Abschlussgespräch. Angeboten wird mündlich; geschlossen wird der
Trainingsvertrag über das eigene Konto, mit Widerrufsbelehrung und eigener
Einwilligung. Aus der Akte wird nur übernommen, was die Person ausdrücklich
freigibt, als Kopie nach §4.8. Das Paket beginnt nach dem Ende der Behandlung.

Hat eine Person beide Verhältnisse, bleiben die Bereiche auch in ihrer eigenen
Sicht getrennt; ein gemeinsamer Bestand entsteht nicht (§4.8). Identitätsprüfung
und Vertretung regelt ADR-023 wie in §4.6.


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
übernommen hat. Wo die Anwendung Sprachdokumentation anbietet, MUSS es
denselben Weg auch ohne Sprechen geben — über Skalen und Bausteine zum
Antippen oder über Text.

**Fotos.** Fotos der Verordnung und von Papierbögen gehören als Dokument in die
Akte ([ADR-017](docs/adr/ADR-017-file-storage.md)). Fotos, die das Praxisteam
aufnimmt, SOLLTEN über die Kamera der Anwendung entstehen und nicht in der
Mediathek des Geräts liegen bleiben. **Fotos von Patient:innen** sind in V1
vorgesehen, aber noch nicht freigegeben (ADR-017 Punkt 30): Sie setzen eine
eigene Einwilligung voraus, und Frist und Umgang mit Aufnahmemetadaten
entscheidet der Loop, der sie baut.

**Erstaufnahme.** Was zur Aufnahme einer neuen Person gehört — Verordnung,
Befundbogen, Einwilligungen, Befund —, SOLLTE die Anwendung sichtbar offen
halten, bis es erledigt ist, damit es auch im Team nicht vergessen wird.


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

**Ab dem ersten KI-Feature MÜSSEN alle KI-Aufrufe über einen zentralen,
providerunabhängigen AI-Service beziehungsweise ein Privacy Gateway laufen —
auch in Entwicklung und Test, dort gegen einen Mock Provider. Direkte
Provideraufrufe aus Fachmodulen sind nicht erlaubt.**

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

Die Anwendung unterstützt ein **bewusst gestartetes Nachdiktat** aus dem
zugehörigen Termin heraus — auf Smartphone oder Tablet gesprochen,
transkribiert, strukturiert und geprüft, bevor daraus Dokumentation wird
(Entscheidung vom 2026-09-08). Anbieter, Architektur und Aufbewahrung des
Audios sind offen (`docs/decisions/OPEN_DECISIONS.md` E13) und werden im Loop
entschieden, der die Funktion baut (KI-EPIC-001). Die Diktierfunktion der Geräte-Tastatur
ist ein Dienst des Geräteherstellers ohne Vertrag mit der Praxis; die
Anwendung bietet sie nicht als Weg der Sprachdokumentation an.

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
Anamnesebogen Version 8 / 07-2026. Patient:innen KÖNNEN ihn vorab über die
Plattform ausfüllen (§4.6); die Therapeut:in prüft ihn beim Termin. Liegt er
nur auf Papier vor, wird er als Foto in der Akte abgelegt (§5).

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

Eine solche Anfrage ist ein Wunsch; einen Termin daraus macht erst die
Bestätigung der Praxis.

Terminvorschläge der Anwendung berücksichtigen:

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
abgerechnet. **Angefragt** und **vorgemerkt** werden mit der Plattform
erreichbar (§4.6).

Drei Aussagen sind dabei verbindlich:

- **Jeder Zustandswechsel läuft über eine Serverfunktion mit eigener
  Rollenprüfung und eigenem Auditeintrag.** Es gibt keinen freien
  Statuswechsel über die Tabelle.
- **Dokumentiert und abgerechnet setzt der Vorgang, dem die Tatsache gehört** —
  die Finalisierung der Dokumentation beziehungsweise die Ausstellung der
  Rechnung, in derselben Transaktion. Damit bekommt §19 seinen technischen
  Anker: Ein Behandlungstermin wird aus „dokumentiert" oder aus „nicht
  angetroffen" mit Ausfallhonorar-Kennzeichen fakturiert. Ein Termin lässt sich weiterhin **ohne**
  Dokumentation abschließen; die Sperre sitzt an der Rechnung, nicht am
  Abschluss.
- **Eine Absage ist endgültig, eine finalisierte Dokumentation ebenso.** Ein
  versehentlich abgesagter Termin wird neu angelegt; ein Irrtum in der
  Dokumentation wird als Korrektur mit Begründung behoben (§5, ADR-016) und
  ändert den Terminzustand nicht.

Übergänge im Einzelnen, Auslöser, Rollen und die Migration der heutigen Werte:
ADR-018.

**Absage unter 24 Stunden und Nichtantreffen** (ausgeführt in ADR-018
Punkt 8):

Eine Absage durch die Patient:in **weniger als 24 Stunden vor dem vereinbarten
Behandlungsbeginn** löst eine Ausfallgebühr aus. Vier Aussagen dazu sind
verbindlich:

- Der **Eingang** der Absage MUSS getrennt vom Zeitpunkt ihrer Eingabe
  festgehalten werden. Maßgeblich ist der Eingang: Wann das Büro dazu kommt,
  ihn einzutragen, DARF über eine Forderung NICHT entscheiden.
- Die Frist MUSS **serverseitig** aus diesem Eingang und dem vereinbarten
  Beginn gerechnet werden. Eine im Browser gerechnete Frist erfüllt das nicht.
- **Genau 24 Stunden liegen außerhalb der Regel.** Die Gebühr entsteht bei
  *weniger als* 24 Stunden.
- Eine **praxisbedingte** Absage löst die Regel NICHT aus.

Der Termin bleibt als abgesagt erkennbar; der Gebührenanlass ist ein Merkmal
daneben und kein eigener Zustand. Höhe und Abrechnungsweg gehören zum
Leistungskatalog (ABR-001) und zur Rechnung (ABR-003); fehlen sie, wird **kein
Betrag erfunden**, sondern die ausstehende Festlegung benannt.

**Hausbesuch-Szenarien** (E14, ausgeführt in ADR-018 Punkt 9):

1. **Tür geöffnet, Behandlung findet nicht statt.** Wird die Tür geöffnet und
   die Behandlung auf Angabe der Patient:in nicht durchgeführt, gilt der Termin
   als **durchgeführt**. Die behandelnde Person hält das mit einem
   Pflichtvermerk in der Behandlungsdokumentation fest; der Termin wird normal
   abgerechnet, eine Ausfallgebühr entsteht nicht.
2. **Nicht angetroffen.** Wird die Person nach dem Protokoll — 15 Minuten
   gewartet, an der Tür geklingelt, telefonisch angerufen — nicht angetroffen,
   gilt der Termin als **nicht wahrgenommen** und löst eine Ausfallgebühr aus.
   Der Vermerk DARF NICHT als durchgeführte Behandlung, als finalisierte
   Behandlungsdokumentation oder als verbrauchte Verordnungsleistung
   erscheinen.
3. **Absage unter 24 Stunden** löst eine Ausfallgebühr aus (oben).

Die Anwendung MUSS die behandelnde Person erklärend durch diese Szenarien
führen und das Protokoll aus Fall 2 abfragen, bevor sie den Gebührenanlass
setzt. Höhe und Abrechnungsweg gehören zum Leistungskatalog (ABR-001);
Rechnungstext und Rechtsgrundlage für Fall 1 gehen als Festlegung in die
Anfrage B4 (`docs/decisions/OPEN_DECISIONS.md`, E14). Für Termine außerhalb
des Hausbesuchs, etwa per Video, ist Nichtantreffen ein Vermerk ohne Gebühr
(ANN-055).

**Zeitablauf allein erzeugt weder eine Absage noch ein Nichtantreffen**
(ADR-018 Punkt 7). Was stattgefunden hat, weiß nur die behandelnde Person.

Länge eines angebotenen Termins, Dokumentationszeit und der Abstand zum
Folgetermin sind mit §8.1 entschieden.

### 8.1 Terminfenster, Dokumentationszeit und Fahrzeit

Diese Festlegungen gelten für Termine, die die Anwendung **anbietet** — für
jedes neu angelegte und jedes neu gesetzte Zeitfenster.

Die Länge eines Behandlungstermins ist **frei wählbar**. Sie MUSS mindestens einen Rasterschritt betragen, und das Ende
MUSS nach dem Beginn liegen; eine weitere Beschränkung der Länge gibt es
nicht. Die Dokumentation der Behandlung ist im Zeitfenster enthalten.
**60 Minuten bleiben die Vorbelegung**, 45 Minuten bleiben die zweite
Regellänge.

Ein Behandlungstermin, dessen Länge **weder 45 noch 60 Minuten** beträgt, MUSS
in der Terminanzeige als abweichend **gekennzeichnet** werden — im Kalender
und in jeder Terminliste, und in einer Form, die auch ohne Farbe und ohne
Bildschirm erfassbar ist. Das Kennzeichen meldet, es verbietet nicht. Es gilt
**nur für Behandlungstermine**; Termine ohne Patient:in tragen es nie. Die
Kennzeichnung ist, wie jede MUSS-Anforderung, test- oder auditierbar (§0).

Termine, die **keine Behandlung** sind — Besprechungen, Teamtermine und andere
Ereignisse des Praxisbetriebs —, fallen nicht unter diese Regel. Ihr Beginn und
ihr Ende sind innerhalb des Praxisrasters frei wählbar. Sie haben weder
Patient:in noch Verordnung, und sie DÜRFEN keine abrechenbare Leistung
erzeugen (§19).

Ein eigener Dokumentationsblock neben dem Termin DARF NICHT geplant werden. Die
Anwendung DARF NICHT eine feste Aufteilung zwischen Behandlung und
Dokumentation innerhalb des Zeitfensters vorgeben oder erzwingen; wie die
Therapeut:in das Fenster aufteilt, ist ihre Sache.

Der Beginn eines Termins KANN auf jedem Punkt des Praxisrasters liegen. Die
Länge beschränkt ihn NICHT auf volle oder halbe Stunden: bei dem heute
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

Diese Regeln sind **Angebotsregeln**, keine Voreinstellung der Oberfläche.
Raster, Fenstergrenzen und Belegung MÜSSEN serverseitig durchgesetzt und
geprüft werden; eine Prüfung im Formular allein erfüllt sie nicht. Für die
**Länge** gibt es keine serverseitige Schranke; an ihre Stelle tritt die
Kennzeichnungspflicht oben. Die Rundungsregel MUSS serverseitig gelten, sobald
eine Fahrzeit vorliegt. Wie jede MUSS-Anforderung MÜSSEN beide test- oder
auditierbar sein (§0).

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

Woher eine Fahrzeit kommt, regelt ADR-019. Fahrpuffer und Anzeige einer
Unterschreitung baut MAP-006 nach der vorläufigen Entscheidung zu E12 Punkt 3
und 4. Offen ist nur, ob eine Fahrzeit für die Rundungsregel je Prüfung
abgerufen oder kurz gespeichert wird (E12 Punkt 3a in
`docs/decisions/OPEN_DECISIONS.md`).


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

Die Tagesroute trägt Behandlungen und Trainingstermine gemeinsam (ADR-022).
Beim Losfahren zeigt sie den ersten Weg, eine Vorschau auf den nächsten und
kurze Hinweise zur Person. Ob an diesem Tag eine **Behandlungsliege**
mitzunehmen ist, MUSS beim Tagesstart erkennbar sein — auch wenn erst ein
späterer Besuch sie braucht; der Bedarf ist ein Merkmal der Person und wird im
Befund gesetzt. Die Navigation übernimmt die Navigations-App des Geräts; eine
Führung in der Anwendung regelt §20.1.

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

Patientenkommunikation läuft über einen gemeinsamen Kanal (C2); Office liest
ihn nach §4.3 mit. Erkennt eine Therapeut:in klinischen Inhalt in einer
Nachricht, MUSS sie ihn der Patientenakte zuordnen.


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


## 14. Umfang und Skalierbarkeit

**Zur Eröffnung im Juli 2027 läuft das Endprodukt** (Auftrag des
Projektinhabers vom 2026-09-22). Freigegeben sind neben dem Kernprozess der
Heilbehandlung:

- der **Trainingsbereich** in der Sicht der Betreuung und der Kund:innen (§1.2,
  §4.9, §4.10);
- die **Plattform für Patient:innen und Trainingskund:innen** (§4.6, §4.10);
- das **Nachsorge-Abo** der Patient:innen nach dem Ende der Behandlung und das
  **Trainingspaket** nach Zeitraum, beide im eigenen Rechnungswesen (§19);
- Praxisbetrieb (Radflotte, Teamkommunikation, Urlaub, Zeitkonto,
  Erstattungen) und KI-Assistenz innerhalb von §6 und §17.

Was gebaut wird, entsteht nur mit konkretem Auftrag; die Reihenfolge legt
`docs/development/ROADMAP.md` fest. Die Freigabe ändert nichts an §17: Was
eines der drei Verbote berührt, entsteht auch in diesem Umfang nicht.

Die erste Version wird für **eine** Praxis entwickelt. Gesperrt bleiben:

- mehrere Standorte als Funktion — ein späterer Standort mit Büro,
  Trainingsgeräten und Kursraum ist denkbar, vorbereitet ist dafür nur
  `location_id` ([ADR-003](docs/adr/ADR-003-organization-location-model.md));
- Wearables und Gesundheits-Apps;
- die Software als bezahlter Dienst für andere Praxen und ihre Vermarktung.

Das Datenmodell SOLLTE diese Erweiterungen und weiteres Wachstum — mehr
Mitarbeitende, mehr Räder — nicht unnötig verhindern. Umgesetzt wird dafür
ausschließlich die strukturelle Vorbereitung, die
[ADR-014](docs/adr/ADR-014-foundational-data-model.md) abschließend auflistet;
ADR-014 führt zugleich die Negativliste dessen, was NICHT prophylaktisch
implementiert wird. „Zukunft nicht verbauen" bedeutet ausdrücklich nicht,
zukünftige Funktionen vorzeitig zu implementieren.


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

### 15.2 Eine offene externe Klärung hält die Entwicklung nicht an

Eine ausstehende Antwort von außen — Datenschutzberatung, Steuerberatung,
Anbietervertrag, Aufsichtsbehörde, Lizenzgeber — **DARF die Entwicklung NICHT
blockieren.** Sie blockiert das **Scharfschalten**, nicht das Bauen. Beides
ist zu trennen:

- **Bauen** heißt: Funktion entwerfen, umsetzen, testen und abnehmen — mit
  **ausschließlich synthetischen Daten**, ohne produktive Verarbeitung
  (ADR-007 Punkt 6, der das seit jeher erlaubt).
- **Scharfschalten** heißt: echte Personendaten fließen, ein Anbieter wird
  produktiv genutzt, das System geht in Betrieb. Erst hier greifen die
  Vorbedingungen aus §3.7 und ADR-007 Punkt 5.

Eine Feature-Spezifikation, ein ADR oder eine Ablaufbeschreibung DARF eine
offene externe Klärung deshalb **NICHT zur Startbedingung eines Loops**
machen. Sie wird zur Bedingung des Scharfschaltens und steht dort an genau
einer Stelle: dem Go-live-Gate (§3.7, ADR-007 Punkt 5). Ein Zuschnitt, der
das Bauen an eine externe Antwort bindet, ist neu zu schneiden — die Funktion
entsteht mit synthetischen Daten, der Umschalter bleibt zu.

Der Preis dafür wird ausdrücklich in Kauf genommen: Eine späte Antwort kann
eine gebaute Annahme widerlegen. Deshalb gilt Ziffer 4 hier verschärft —
**jede so getragene Annahme MUSS an genau einer Stelle reversibel verankert
sein**, damit die Korrektur eine begrenzte Änderung bleibt und kein Umbau.

Die Liste aus §15.1 („Eine Annahme DARF NICHT") wird durch §15.2 **nicht**
kürzer, und die Vorbedingungen des Scharfschaltens entfallen nicht.

Damit die Antworten vor der Eröffnung vorliegen können, gehen die externen
Anfragen (Datenschutzberatung mit DSFA, Steuerberatung, Anbieterprüfungen)
**ab Anfang 2027 parallel zum Bauen** hinaus, nicht erst nach dessen Ende
(Entscheidung des Projektinhabers vom 2026-09-23).


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

**Über beide Leistungsbereiche (E18):** Die Software trifft keine
diagnostischen oder therapeutischen Entscheidungen und schlägt keine vor.

Dieser Abschnitt gilt unverändert im Trainingsverhältnis und an Terminen im
Kontext `training` (§1.2, ADR-006 Punkt 9). Dass Training keine
Heilbehandlung ist, macht die Grenze nicht weiter — erhoben werden auch dort
Gesundheitsangaben; es ändert sich die Rechtsgrundlage, nicht die
Zweckbestimmung.

Daraus folgen drei Verbote. Sie sind in V1 **Ausschlusskriterien**, nicht nur
ein Prüfanlass:

1. Die Anwendung DARF NICHT Übungen, Dosierung, Intensität oder Progression aus
   Diagnose, Befund, Screening-Antwort oder Verlauf vorschlagen, vorsortieren,
   vorfiltern oder vorbelegen.
2. Die Anwendung DARF NICHT aus Schmerzskala oder Verlauf eine Bewertung mit
   Handlungsempfehlung ableiten — kein eigener Score, keine Risikoklasse, keine
   Ampel, kein Schwellenwertalarm.
3. Ein Screening-Fragebogen DARF NICHT selbst eine Trainingsfreigabe, eine
   Kontraindikation, einen Abbruch oder eine Empfehlung zum Arztbesuch
   aussprechen.

Eine Funktion, die eines dieser Verbote berührt, entsteht in V1 nicht. Sie ist
zugleich nach der Regel oben `MDR_REVIEW_REQUIRED` und DARF auch hinter einem
Schalter nicht produktiv erreichbar sein; **ein Feature-Flag ersetzt die
Prüfung nicht.**

Die Verbote sind **Ausgabeverbote, keine Datenverbote**: Erhoben, gespeichert
und angezeigt wird, was fachlich gebraucht wird — es entsteht nur die
abgeleitete Aussage nicht. Die Hervorhebung nach §7.1 bleibt unberührt; der
Unterschied ist der zwischen „NRS 8, Angabe vom 12.03." und „Schmerz
verschlechtert". Wo genau die Kante jedes Verbots verläuft, steht in ADR-006
Punkte 10 bis 12 — dieses Dokument nennt das Verbot, nicht seine
Auslegung.

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

Abrechenbare Ereignisse sind insbesondere:

- in der **Heilbehandlung** der dokumentierte Termin und der Gebührenanlass
  nach §8;
- im **Training** die vereinbarte Trainingsleistung und das **Paket**, das für
  einen festen Zeitraum gilt und nicht pausiert werden kann;
- das **Nachsorge-Abo** nach §4.6 als wiederkehrende Leistung des Bereichs
  `therapy` mit Monatsrechnung, monatlich kündbar; es beginnt frühestens mit
  dem Ende der Behandlungsgrundlage (Verordnung oder Selbstzahlervereinbarung,
  ADR-020), damit während der Behandlung nichts doppelt berechnet wird.

Die steuerliche Einordnung von Paket und Nachsorge-Abo ist Gegenstand der
Anfrage an die Steuerberatung (B4); bis dahin gilt §15.1.

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

Therapeutische Leistungen am Termin SOLLTEN erst endgültig fakturiert werden
können, wenn die zugehörige Dokumentation finalisiert ist. **In V1 gibt es
keinen Override:** Ein Behandlungstermin wird ausschließlich aus „dokumentiert"
oder aus einem Vorgang mit Gebührenanlass fakturiert (ADR-018). Der Fall „Tür geöffnet, keine
Behandlung" (§8) läuft über die Dokumentation mit Pflichtvermerk und damit
über denselben Weg. Würde ein Override eingeführt, MÜSSTE er begründet und
protokolliert werden.

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

### 20.1 Navigationsführung auf dem Gerät

Eine Navigationsführung auf dem Gerät der fahrenden Person ist von dem Verbot
oben nicht erfasst, solange sie **alle** folgenden Bedingungen erfüllt:

1. Die Position wird **ausschließlich auf dem Gerät** verarbeitet. Sie wird
   NICHT an die Praxissoftware übermittelt und dort NICHT gespeichert — auch
   nicht in einem Log.
2. Die Führung beginnt **nur auf ausdrückliche Aktion** der fahrenden Person,
   endet mit der Fahrt und ist jederzeit abbrechbar. Sie startet NIEMALS
   automatisch.
3. An den Kartendienst geht eine Position **nur** zur Neuberechnung einer
   Route, ohne Namen, Kennung oder Uhrzeit — dieselbe Datenart wie ein
   Wegpunkt bei der Routenberechnung.
4. Aus diesen Daten entsteht **keine Auswertung, keine Historie und kein
   Bewegungsprofil**, auch nicht in aggregierter Form.

**Der Arbeitgeber DARF aus einer solchen Funktion keinen Standort ableiten
können.** Eine Funktion, die das ermöglichte, ist von diesem Abschnitt NICHT
gedeckt — unabhängig davon, ob von der Möglichkeit Gebrauch gemacht wird.

Dieser Abschnitt erlaubt eine Funktion und lockert keine Grenze: Der Satz
oben gilt unverändert. Umsetzung und Bedingungen im Einzelnen:
[ADR-019](docs/adr/ADR-019-map-service.md) Abschnitt F.

Routing-Rohdaten unterliegen einer kurzen Speicherfrist (§18).

Ob und in welcher Form aggregierte Auswertungen zulässig sind, ist noch nicht
abschließend entschieden und in `docs/decisions/OPEN_DECISIONS.md` als offener
Punkt geführt.


## 21. Governance dieses Dokuments

Dieses Dokument beschreibt die verbindlichen Produkt-, Sicherheits- und
Datenschutzprinzipien.

### Rangfolge bei Konflikten

Widersprechen sich zwei Dokumente, gilt das mit dem kleineren Rang. Die
Rangfolge ist abschließend; sie steht hier und wird nur hier geändert.

| Rang | Dokument | Geltung |
|---|---|---|
| 1 | `PROJECT_PRINCIPLES.md` | verbindlich, versioniert |
| 2 | geltende ADRs in `docs/adr/` | verbindlich; ein ADR überschreibt Rang 1 nicht |
| 3 | die Feature-Spezifikation des laufenden Loops | verbindlich für diesen Loop |
| 4 | `docs/decisions/ASSUMPTIONS.md` | vorläufig (§15.1); füllt Lücken, überschreibt nie |
| 5 | `docs/PRODUCT_VISION.md` | nicht normativ |
| 6 | `docs/product/` (Ideenspeicher) | nicht normativ; begründet **niemals** Scope |

Ohne Rang, weil sie nichts entscheiden: `docs/decisions/OPEN_DECISIONS.md` —
was dort offen ist, gilt in keinem Dokument als entschieden, und was dort als
entschieden vermerkt ist, hat seine Fundstelle in einem ADR, in diesem
Dokument oder als datierter Vermerk dort; ein offener Punkt blockiert keine
Aufgabe. Ebenfalls ohne Rang: `docs/development/` (Roadmap, Befunde,
Arbeitsbereiche) und `docs/STATUS.md` — sie ordnen die Reihenfolge, nicht den
Inhalt.

Eine bestätigte Annahme aus Rang 4, deren Rücknahme teuer wäre, wird ADR und
steigt damit auf Rang 2.

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
| ADR-005 | Providerunabhängige KI-Anbindung | §6, §6.1, §6.2, §6.3 |
| ADR-006 | Abgrenzung gegenüber Medical Device Software | §7.1, §17, §6.3 |
| ADR-007 | Datenschutz-Folgenabschätzung und Datenschutzprozess | §3.7 |
| ADR-008 | Aufbewahrung und Löschung | §4.6, §10, §18 |
| ADR-009 | Privatabrechnung | §4.6, §19 |
| ADR-010 | Audit-Logging und privilegierter Produktionszugriff | §3.1, §4.1, §4.2, §13 |
| ADR-011 | Logging und Observability | §3.6 |
| ADR-012 | Backup, Wiederherstellung und Betriebskontinuität | §3.4, §13 |
| ADR-013 | CI/CD und Release-Governance | §11, §12 |
| ADR-014 | Grundlegende Datenmodell-Entscheidungen | §14 |
| ADR-015 | Initialer technischer Stack | §2.1, §2.2, §3.4 |
| ADR-016 | Klinische Dokumentation: Entwurf, Finalisierung, Änderbarkeit | §5, §6.3 |
| ADR-017 | Dateiablage | §4.7, §5, §12, §18 |
| ADR-018 | Zustandsautomat des Termins | §8, §19 |
| ADR-019 | Kartendienst: Karte, Fahrradrouting, Fahrzeiten, Navigations-Handoff | §8.1, §9, §20 |
| ADR-020 | Behandlungsgrundlage: Verordnung und Selbstzahler unter einer Klammer | §14, §19 |
| ADR-021 | Leistungsbereiche und Rechtsverhältnisse: Behandlung und Training getrennt | §1.1, §1.2, §4, §14, §18 |
| ADR-022 | Terminkontext und Trainingsgrundlage: ein Kalender, ein Kontext je Termin | §1.2, §4, §5, §8, §9, §18 |

Die Tabelle nennt, **welcher ADR welchen Paragraphen trägt** — sonst nichts.
Welche Fassung gilt, welchen Status ein ADR hat und woran eine produktive
Freigabe hängt, steht allein in [`docs/adr/README.md`](docs/adr/README.md).
Zwei Stellen, die dasselbe behaupten, driften auseinander; hier ist nur eine.

Änderungen an diesem Dokument erfolgen als eigener Commit mit erhöhter
Dokumentversion und einem Änderungsvermerk in
[`docs/PRINCIPLES-CHRONIK.md`](docs/PRINCIPLES-CHRONIK.md). **Geändert wird
der Text an seiner Stelle**: Eine neue Entscheidung ersetzt die alte, statt als
Absatz daneben zu stehen; Geschichte gehört in die Chronik.

Zwei Abschnitte dieses Dokuments halten eine Entscheidung fest, für die es
keinen eigenen ADR gibt: §8.1 (Terminfenster) und §6.3 (Sprachdokumentation).
Beide lösen kein Architekturproblem, sondern halten eine Produktentscheidung
des Projektinhabers fest. Was daran technisch zu entscheiden war, steht in
ADR-005, ADR-006 und ADR-016; was daran offen geblieben ist, in
`docs/decisions/OPEN_DECISIONS.md` E12 und E13. Die Hausbesuch-Szenarien in
§8, der Rollenschnitt in §4.3, die Plattformstufen in §4.6 und §4.10 und die
Tagesroute in §9 sind ebenfalls Produktentscheidungen; ihr technischer Teil
steht in ADR-018, ADR-004, ADR-009 und ADR-019 oder entsteht im Loop. Dasselbe
gilt für den Rollenschnitt des zweiten Leistungsbereichs in §4.8 bis §4.10:
Die Trennung entscheidet ADR-021, die Durchsetzung ADR-004; wer im Training
was sieht, ist eine Produktentscheidung und steht hier.
