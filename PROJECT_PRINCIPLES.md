# PROJECT_PRINCIPLES.md
## Dokumentinformation
| | |
|---|---|
| **Dokumentversion** | **0.31** |
| **Änderungsdatum** | **2026-10-27** |
| Vorversion | 0.30 (2026-10-27); 0.29 (2026-10-26); 0.28 (2026-10-18); 0.27 (2026-10-17); 0.26 (2026-10-11); 0.25 (2026-10-10); 0.24 (2026-10-10); 0.23 (2026-10-09); 0.22 (2026-10-09); 0.21 (2026-10-03); 0.20 (2026-10-02); 0.19 (2026-10-02); 0.18.1 (2026-09-30); 0.18 (2026-09-26); 0.17 (2026-09-23); 0.16 (2026-09-22); 0.15 (2026-09-22); 0.14 (2026-09-22); 0.13 (2026-09-20); 0.12.2 (2026-09-20); 0.12.1 (2026-09-20); 0.12 (2026-09-16); 0.11.2 (2026-09-17); 0.11.1 (2026-09-16); 0.11 (2026-09-16); 0.10.2 (2026-09-15); 0.10.1 (2026-09-15); 0.10 (2026-09-13); 0.9 (2026-09-12); 0.8 (2026-09-12); 0.7 (2026-09-11); 0.6 (2026-09-11); 0.5 (2026-09-08); 0.4 (2026-09-05); 0.2.2 Korrekturversion; 0.1 Baseline, unverändert im Git-Verlauf erhalten |
| Verbindliche Architekturentscheidungen | `docs/adr/` — welche gelten, Fassungen und Status stehen in `docs/adr/README.md` (§21), nicht hier |
| Offene Entscheidungen | `docs/decisions/OPEN_DECISIONS.md` — ohne Rang, siehe §21 |
| Vorläufige Annahmen | `docs/decisions/ASSUMPTIONS.md` (§15.1) |

Dieses Dokument trägt nur den geltenden Stand. Die Änderungsvermerke aller Versionen stehen in Git:
im Commit der jeweiligen Version (`git log -p PROJECT_PRINCIPLES.md`), bis 0.29 auch in der Chronik
(`git show eb43569:docs/PRINCIPLES-CHRONIK.md`).

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
Wir entwickeln eine zentrale Plattform für eine privat abrechnende Physiotherapiepraxis mit Fokus
auf Hausbesuche. Sie soll langfristig möglichst alle wesentlichen Arbeitsprozesse in einer
Oberfläche bündeln: Patientenverwaltung, Termin-, Routen- und Tourenplanung,
Behandlungsdokumentation, Befunde und Therapieberichte, Fragebögen und PROMs, Privatrechnungen,
Plattform für Patient:innen und Trainingskund:innen, Therapie- und Übungspläne, interne
Kommunikation, Mitarbeiterverwaltung, Urlaub, Arbeitszeit und Überstunden, Belege und Erstattungen,
Lastenräder mit Pannen und Wartung, KI-Assistenz. Ziel ist der effiziente, sichere Betrieb der
eigenen Praxis; sie hat keine Behandlungsräume, behandelt wird im Hausbesuch, alle Wege per Rad
(`docs/PRODUCT_VISION.md`). Eine Vermarktung an andere Praxen soll architektonisch möglich bleiben,
ist aber kein Produktziel (ADR-003).

### 1.1 Klarnamen statt Pseudonymisierung
Personen werden mit **Klarnamen** geführt, ohne pseudonymisierende Codearchitektur; Schutz geben
Zugriffskontrolle in der Datenbank, Auditpflicht und Verschlüsselung (§3, §4.7, ADR-004, ADR-010).
Zwei Datenschutzniveaus in einer Anwendung DÜRFEN NICHT entstehen, auch nicht zwischen Behandlung
und Training. Unberührt bleiben Datenminimierung gegenüber externen Diensten (§6.1, §9), Trennung
von Entwicklungs- und Produktionsdaten (§3.1, §3.2) und Pseudonymisierung in Auswertungen, wo
fachlich geboten (§20).

### 1.2 Zwei Leistungsbereiche
**Heilbehandlung** (`therapy`) und **Leistungen ohne Heilbehandlungszweck**, Personal Training und
Online Coaching (`training`), werden **nach Rechtsverhältnis getrennt, nicht nach Person** (E18):
Eine Person KANN zugleich einen Behandlungsvertrag (§ 630a BGB) und einen Dienstvertrag über
Training (§ 611 BGB) haben. Rechtsgrundlage, Datenklasse, Aufbewahrungsfrist, Dokumentationspflicht
und steuerliche Behandlung hängen am Verhältnis und DÜRFEN NICHT an der Person festgemacht werden;
das Datenmodell MUSS die Trennung erzwingen (ADR-021 Punkte 1 bis 4). „PT“ wird in keinem Dokument
dieses Projekts als Abkürzung benutzt (ADR-021 Punkt 9). Ist
unklar, wohin ein Datum, ein Termin oder eine Akte gehört, MUSS der Bereich mit höherem Schutz und
längerer Frist gelten (**strengeres Behandlungsregime**), für Schutz, Zugriff, Dokumentation und
Aufbewahrung, nicht für die Steuer: Das Steuerkennzeichen folgt der Leistung am Posten (ADR-009
Punkt 15). Zugriff je Bereich: §4.8.

## 2. Produktprinzipien
### 2.1 Eine Plattform
Mitarbeiter und Patienten SOLLTEN für den Praxisalltag nur diese Plattform brauchen; externe Dienste
DÜRFEN im Hintergrund laufen (§3.5) und SOLLTEN keine weitere Alltagsoberfläche erfordern.
Technische Administration in Anbieteroberflächen ist kein Praxisalltag, sondern eine getrennte
Berechtigungsdomäne (§4.1, §4.7).

### 2.2 Mobile First
Alle zentralen Funktionen MÜSSEN auf Smartphones vollständig praktikabel sein, auch in der Halterung
am Rad; die Oberfläche SOLLTE nur zeigen, was der nächste Schritt braucht, Beschriftungen SOLLTEN der
Sprache der Praxis folgen, nicht der des Datenmodells. Zunächst entsteht eine responsive Web-App/PWA
ohne native Apps. **Online-first** (ADR-001): Eine vollständige Patientenakte DARF NICHT generell
offline vorgehalten werden; begrenzt offline gehen insbesondere Tagesplan, minimal nötige
Hausbesuchsdaten und nicht finalisierte Entwürfe. Offline erstellte Dokumentation DARF erst nach
erfolgreicher Serversynchronisation finalisiert, klinische Dokumentation beim Synchronisieren NICHT
per Last-Write-Wins überschrieben werden.

### 2.3 Praxisprozesse bestimmen die Software
Vor wesentlichen Features MÜSSEN Zweck, Nutzer, Workflow, Daten und Berechtigungen definiert sein.
Claude DARF grundlegende Praxisprozesse NICHT eigenständig erfinden und bestehende Prozesse NICHT
ohne Auftrag ändern. Grundlegend ist ein Prozess, der den Praxisalltag über die einzelne Aufgabe
hinaus prägt (Rollen, wer behandelt, wie abgerechnet wird, welche Daten erhoben werden). Eine
Detailentscheidung im Auftrag (welche bestehende Rolle eine Aktion auslöst, welche Frist gilt, wie
ein Konfliktfall läuft) ist nicht grundlegend; fehlt sie, wird sie nach §15.1 angenommen, nicht
abgewartet.

## 3. Datenschutz und Sicherheit
Die Anwendung verarbeitet Gesundheitsdaten und andere besonders sensible personenbezogene Daten.
Datenschutz und Informationssicherheit sind grundlegende Architekturprinzipien und keine
nachträglichen Features.

### 3.1 Entwicklungsdaten
Entwicklung, Test und Demonstration nutzen nur synthetische Daten. Echte Patientendaten DÜRFEN NICHT
in Claude Code, ChatGPT, Codex, Gemini, GitHub Issues, Entwicklungslogs oder Testdaten gelangen.
**Coding- und KI-Entwicklungswerkzeuge DÜRFEN NIEMALS Produktionscredentials oder reale
Produktions-Patientendaten erhalten**, gleich welches Werkzeug, lesend wie schreibend.

### 3.2 Produktionsdaten
Produktions- und Entwicklungsdaten MÜSSEN technisch getrennt sein (getrennte Umgebungen, ADR-002);
ein Produktions-Backup DARF NICHT in Entwicklung oder Test eingespielt werden. Produktionszugriffe
MÜSSEN über individuelle Konten laufen, gemeinsame Accounts sind verboten.

### 3.3 Keine Secrets im Code
Secrets (Passwörter, API Keys, Datenbankzugänge, Tokens) DÜRFEN NIEMALS hart im Quellcode stehen
oder in GitHub committed werden; sie liegen nur im Environment-/Secret-Management.

### 3.4 Keine selbst entwickelte Sicherheitsinfrastruktur
Kryptografie, Passwort-Hashing, Session-Security, grundlegende Authentifizierung, Datenbank- und
Backup-Engine DÜRFEN NICHT selbst implementiert werden; dafür MÜSSEN etablierte, professionell
betriebene Komponenten dienen. Anmeldung, Sitzungen und Passkeys bleiben beim Anmeldedienst. Zwei
Ausnahmen, jede weitere braucht eine neue Version dieses Dokuments: die **App-PIN** (Version 0.25),
die nur eine gesperrte Sitzung auf demselben Gerät freigibt, nie anmeldet und nur in der Datenbank
mit `pgcrypto` geprüft wird (ADR-025 Punkt 11), und die **Freigabe ohne Netz per Passkey**
(Version 0.26), die nur Daten auf dem Gerät öffnet, nie eine Sitzung beim Server (ADR-025 Punkt 16,
ADR-024 Punkt 9); die App-PIN gibt ohne Netz nie frei. Selbst gebaut sind dabei allein
Fehlversuchszähler und Freigabevermerk der App-PIN und, bei der Freigabe ohne Netz, die
Entscheidung, die lokale Ansicht zu öffnen.

### 3.5 Hosting, Datenstandort und Dienstleister
Gesundheitsbezogene Produktionsdaten MÜSSEN grundsätzlich in EU/EWR-Infrastruktur gespeichert und
verarbeitet werden; US-Mutterkonzerne sind nicht ausgeschlossen, wenn Verarbeitung, Verträge und
Datenflüsse genügen. Vor Freischaltung eines Dienstleisters mit Patientendaten MÜSSEN mindestens
AVV/DPA, Eignung nach § 203 StGB, Verschlüsselung, Zugriffskontrolle, Retention und Löschung sowie
Unterauftragnehmer geprüft und dokumentiert sein; zulässig ist er nur mit Verpflichtung zur
Geheimhaltung, denn Physiotherapeut:innen sind Berufsgeheimnisträger (ADR-002).

### 3.6 Protokollierung und Logs
Produktionslogs und Fehler- oder Crash-Reporting, auch externes, MÜSSEN personenbezogene und
klinische Inhalte minimieren bzw. redigieren; medizinische Freitexte DÜRFEN NICHT hinein. Auditlogs
(§4.2) sind davon getrennt ein Nachweis mit definiertem Inhalt.

### 3.7 Datenschutzprozess
Vor der Verarbeitung realer Patientendaten MUSS der Datenschutzprozess abgeschlossen sein,
insbesondere die Datenschutz-Folgenabschätzung (DSFA) und die Unterlagen nach ADR-007 Punkt 5,
darunter der Data-Breach-Prozess nach Art. 33/34 DSGVO. Vorher DARF entwickelt werden, nur mit
synthetischen Daten und ohne produktive Verarbeitung von Gesundheitsdaten (ADR-007 Punkt 6).

## 4. Benutzerrollen
Das System benötigt mindestens folgende Rollen; ein Benutzer KANN mehrere haben, es gilt ihre
Vereinigung (ADR-004). Neue Teammitglieder SOLLTE der Praxisinhaber in der Anwendung selbst anlegen
und mit einer Rolle einbinden können, ohne technische Administration (§4.1); bis die Anwendung
eigene Mails verschickt (B13), geht das über den Anmeldedienst (ANN-025).

### 4.1 Praxisinhaber / Geschäftsführung
Umfassender Zugriff auf Patienten, klinische Daten, Kalender, Touren, Rechnungen, Mitarbeiter,
Personalprozesse, Fahrräder, Belege, Auswertungen und Praxiseinstellungen. Technische Administration
ist eine **getrennte Berechtigungsdomäne**: Ein Alltagskonto, auch das des Praxisinhabers, DARF
NICHT zu technischer Plattformadministration eskalieren können.

### 4.2 Therapeut
Alle Therapeut:innen DÜRFEN grundsätzlich alle Patientenakten ihrer Organisation einsehen (bewusste
Produktentscheidung für Vertretung und Austausch), jede mit individuellem Konto. Sie dürfen
insbesondere Akten und Stammdaten einsehen, dokumentieren, eigene Dokumentation ergänzen und
korrigieren, Befunde, Therapieberichte und -pläne erstellen, Fragebögen verwalten, Termine
bearbeiten, mit Patient:innen kommunizieren und Übungen freigeben. **Zugriffe auf Patientenakten
MÜSSEN auditierbar sein**, auch jedes Lesen klinischer Inhalte durch Office (§4.3): Diese
Nachvollziehbarkeit ist die tragende, sicherheitskritische Kompensation der Offenheit. Den Nachweis
führt das Datenmodell, das Auditlog nur, was es nicht abbildet; Katalog, Inhalt, Fristen, Leserecht
(in V1 allein der Praxisinhaber) und Auswertung bei Anlass: ADR-010 Punkte 3, 4, 13, 16, 18, 19.
Protokolle dienen ausschließlich Datenschutz und Sicherheit, nie der Leistungs- oder
Verhaltenskontrolle (§20).

### 4.3 Praxismanagement / Office
Standardmäßig organisatorisch: Stammdaten, Kontakt, Termine und Terminstatus, Rechnungen und
Zahlungsstatus, organisatorische Patientenkommunikation, Mitarbeiterorganisation, Belege soweit
nötig. **Klinisch (E15)** liest Office alle Inhalte einer Akte wie Therapeut:innen (ADR-004
Punkt 3), schreibt aber weder klinische Dokumentation noch Befunde; jeder Zugriff ist als tragende
Kompensation auditpflichtig (§4.2), die Bewertung (Need-to-know, DSFA) gehört in B2 (ADR-007). **Im
Training** liest Office alles eines Trainingsverhältnisses, auch Künftiges, und die
Übungsbibliothek, schreibt aber keine Trainingsinhalte (die bleiben bei §4.1 und §4.9); jedes Lesen
ist auditpflichtig; mit echten Daten gilt das Leserecht erst nach Bewertung in der DSFA (B2, ADR-021
Punkt 10). Ob
jemand Training gebucht hat, erfährt die Akte nicht (§4.8). **Mitarbeiterorganisation (E10):**
Office DARF Stammdaten Beschäftigter (Name, dienstliche Erreichbarkeit, Hauptstandort) anlegen und
ändern, DARF aber NICHT Rollen vergeben oder ändern, den Beschäftigungsstatus wechseln, Zugänge
einladen oder sperren (§4.1, ADR-004) und die Privatangaben nach §20 NICHT lesen oder schreiben
(`app.can_manage_staff_private_details`).

### 4.4 Sonderfall Behandlungsnachweis
Für organisatorische Konflikte MUSS ein eigener datensparsamer Behandlungsnachweis existieren: die
Sicht ohne klinischen Inhalt, die auf der Rechnung erscheint und außerhalb der Praxis gezeigt werden
kann. Office sieht darin Patient, Datum, Termin, behandelnde Person, Termin- und Behandlungsstatus,
erbrachte Leistung, Zeitpunkt der Dokumentation und ggf. Signatur oder Bestätigung; Leistungskürzel
wie „MT“ oder „KG“ sind organisatorisch (C1).

### 4.5 Teamleitung
Rechte eines Therapeuten plus definierte organisatorische Zusatzrechte, möglich: Urlaubsanträge
bearbeiten, Einsatz- und Mitarbeiterplanung, Rad- und Ressourcenzuteilung, organisatorische
Auswertungen; keine technische Administratorrolle. Mitarbeiterplanung ist nicht vergeben (E10):
Teamleitung schreibt weder Mitarbeiterstammdaten noch Rollen noch Beschäftigungsstatus; im Zweifel
restriktiver (§16).

### 4.6 Patient
Patienten DÜRFEN ausschließlich ihre eigenen Daten sehen. Account und Akte sind **getrennte
Konzepte**: Löschen oder Sperren des Accounts DARF die Akte nicht löschen, eine Akte setzt keinen
Account voraus (§18). Die Plattform hat zwei Stufen. **Während der Behandlung**, ohne Entgelt als
Teil der Heilbehandlung: Befundbogen, idealerweise vorab (§7); eigene Termine, Terminanfragen und
Änderungswünsche (Wünsche, die die Praxis bestätigt, §8); Heimübungsplan mit Übungen und Videos;
Check-ins; eigene Rechnungen und freigegebene Dokumente; Einwilligungen erteilen und widerrufen;
sichere Kommunikation mit der Praxis. **Danach als Nachsorge-Abo**, monatlich kündbar (§19): Das
Heimprogramm bleibt aktiv und wird angepasst, dazu Fortschrittsverlauf, Gewohnheiten und Rückfragen
mit Foto oder Video mit zugesagter Antwortfrist; nach Kündigung 30 Tage Lesezugriff und der Plan als
PDF, die Akte folgt unverändert §18. Gebuchte Ernährungsberatung bringt ein Ernährungstagebuch mit
Zielwerten und Gewichtsverlauf, mit eigener Einwilligung und nicht als Heilbehandlung (§4.11). Der
Heimübungsplan gehört zur Behandlung, das Gegenstück im Training ist §4.10. Interne klinische oder
organisatorische Notizen sehen Patienten nicht automatisch; ihr Abruf freigegebener Dokumente wird
nicht protokolliert, nachgewiesen ist die Freigabe (ADR-010 Punkt 22). Identität, Vertretung und
Angehörige regelt ADR-023 (Zugriff folgt dem Zugang zu einem Verhältnis, Vertretung ist ein Zugang
mit eigenem Konto: Punkte 3 und 13).

### 4.7 Durchsetzung der Berechtigungen
Berechtigungen MÜSSEN über einen zentralen Policy-/Authorization-Layer durchgesetzt werden, mit
Datenbank-RLS als Defense-in-Depth; Suche, Dateien, Exporte und KI-/RAG-Funktionen MÜSSEN dieselben
Regeln einhalten. Antworten MÜSSEN rollenabhängige Projektionen sein; geschützte Inhalte DÜRFEN
NICHT ausgeliefert und erst im Client ausgeblendet werden (ADR-004).

### 4.8 Zugriff folgt dem Verhältnis, nicht der Person
Festlegung E18, gültig über alle Rollen:

> Zugriff folgt dem Verhältnis, nicht der Person. Aus einer Rolle im Trainingsverhältnis folgt kein
> Zugriff auf Daten des Behandlungsverhältnisses derselben Person, und umgekehrt. Datenübernahme
> zwischen beiden erfolgt ausschließlich als dokumentierte Kopie auf Grundlage einer Einwilligung.

Jede Rolle MUSS ihren Leistungsbereich (§1.2) benennen: Beide hat aus sich heraus nur der
Praxisinhaber als Vertragspartner beider Verhältnisse; Office hat `therapy`, im `training`
organisatorisch (Termin, Vertragsstatus, erbrachte Leistung, Rechnung, Zahlung) und lesend alles
(§4.3, ADR-021 Punkt 10); Trainingsbetreuung und Trainingskund:innen haben `training`,
Therapeut:innen, Teamleitung und Patient:innen `therapy`, Teamleitung Trainingsdaten nur mit der
Rolle aus §4.9. Aus einer Rolle des einen Bereichs DARF NICHT auf Daten des anderen geschlossen
werden, auch nicht mittelbar über die gemeinsame Identität; die Trennung MUSS in Policies und RLS
durchgesetzt werden, nicht in der Oberfläche (ADR-021 Punkt 6). Eine Übernahme DARF NICHT als
Referenz entstehen (ADR-021 Punkt 7). Lesen von Trainingsdaten ist auditpflichtig wie das der Akte,
beide Bereiche haben das strengere § 203-Niveau (ADR-021 Punkt 8). Wer beide Rollen hat, sieht
beides; verboten ist der Schluss auf den anderen Bereich, nicht die Häufung. Bewusste Ausnahme: Die
**Belegung** im gemeinsamen Kalender bleibt über alle Kontexte sichtbar, der Inhalt nicht (ADR-022
Punkt 11).

### 4.9 Trainingsbetreuung
Betreut Trainingsverhältnisse und DARF sie anlegen, ändern und beenden, Termine im Kontext
`training` planen und bearbeiten (ADR-022), Trainingsgrundlage und -protokoll führen, Screening- und
Gesundheitsangaben mit ausdrücklicher Einwilligung erheben und einsehen (Art. 9 Abs. 2 lit. a DSGVO)
und mit Kund:innen kommunizieren. Sie DARF NICHT Akten, Befunde, Behandlungsdokumentation oder
Verordnungen einsehen, Behandlungstermine bearbeiten, Behandlungsdokumentation erzeugen oder
Trainingsfreigabe, Kontraindikation oder Abbruch von der Software ableiten lassen (§17); das
entscheidet der Mensch, dokumentiert als seine Entscheidung. Individuelles Konto, keine technische
Administratorrolle; den Code-Bezeichner wählt der SPEC des bauenden Loops (ADR-014).

### 4.10 Trainingskund:in
Gegenstück zu §4.6: Kund:innen DÜRFEN ausschließlich ihre **eigenen** Trainingsdaten sehen. Konto
und Verhältnis sind getrennt, das Verhältnis hat eine eigene Frist (ADR-021 Punkt 4); Löschen oder
Sperren des Kontos DARF es nicht löschen, und es setzt kein Konto voraus. Die Ansicht umfasst,
soweit §17 nichts ausschließt, Übersicht, Kalender, Einheiten, Check-ins, Fortschritt, Pläne,
Aktivitäten, Assessments, Profil, Gewohnheiten, Rückfragen, Einstellungen, gebuchte
Ernährungsberatung (§4.11), eigene Rechnungen und die Einwilligung nach Art. 9 Abs. 2 lit. a DSGVO
(erteilen, widerrufen); das Trainingsprotokoll, soweit freigegeben, interne Betreuungsnotizen nicht
automatisch. Die Plattform ist im Paketpreis enthalten; ein Paket gilt für einen Zeitraum und ist
nicht pausierbar (§19). **Übergang aus der Behandlung:** In den letzten Terminen einer
Behandlungsgrundlage erinnert die Anwendung die behandelnde Person an das Abschlussgespräch;
angeboten wird mündlich, geschlossen über das eigene Konto mit Widerrufsbelehrung und eigener
Einwilligung, übernommen nur ausdrücklich Freigegebenes als Kopie (§4.8); das Paket beginnt nach
Behandlungsende. Bei beiden Verhältnissen bleiben die Bereiche auch in der eigenen Sicht getrennt.
Identität und Vertretung: ADR-023.

### 4.11 Ernährungsberatung
**Zusatzleistung** zu Behandlung und Training mit eigener ausdrücklicher Einwilligung (Art. 9 Abs. 2
lit. a DSGVO), eigener Frist (§18) und eigenem Tagebuch, das die Person selbst ein- und ausschaltet
(ADR-027). Das Profil hängt an genau einem Verhältnis, ist aber weder Teil der klinischen Akte noch
Trainingsinformation: Die Leserechte nach §4.2, §4.3 und §4.8 gelten nicht, die Begleitung sieht
nichts davon. Lesen und schreiben DARF nur, wer die Fähigkeit „Ernährungsberatung“ trägt (zunächst
der Praxisinhaber), durchgesetzt in der RLS (ADR-027 Punkt 4, ADR-021 Punkt 11). Zielwerte kommen
aus offengelegten Formeln (§17) und sind durch die Beratung überschreibbar.

## 5. Klinische Dokumentation
Behandlungsdokumentation MUSS nachvollziehbar gespeichert, finalisierte Dokumentation gegen
unbemerktes Überschreiben geschützt werden, Änderungen MÜSSEN nachvollziehbar bleiben; erfasst
werden MÜSSEN mindestens Autor, Erstellungs- und Änderungszeitpunkte, ursprüngliche und geänderte
Version. Finalisiert wird serverseitig, nie offline (§2.2, ADR-001). ADR-016 konkretisiert das, ohne
es zu ersetzen: Versionierung mit vollständig abrufbarem Original je Version statt bloßem
Änderungsprotokoll, Zustände, Ergänzung und Korrektur. Text aus Diktat oder KI wird erst durch
ausdrückliche Übernahme einer Therapeut:in ein Entwurf (§6.3). Wo Sprachdokumentation angeboten
wird, MUSS derselbe Weg ohne Sprechen bestehen (Skalen und Bausteine zum Antippen oder Text).

**Fotos** (ADR-017 Abschnitte G, H, K, L): Fotos der Verordnung und von Papierbögen gehören als
Dokument in die Akte. Fotos, die das Team aufnimmt, SOLLTEN über die Kamera der Anwendung entstehen
und nicht in der Mediathek bleiben, **Fotos von Patient:innen** MÜSSEN dort entstehen. Ein Foto aus
der Dokumentation ist **Dokumentationsfoto** und Teil der Akte; andere Zwecke, auch Arbeitshilfen,
gibt es nicht mehr. Kein Foto **ersetzt einen Eintrag**: Was es zeigt, steht in Worten in der
Dokumentation, den Unterschied zweier Fotos bewertet die Therapeut:in, nicht die Anwendung (§17).
Foto und Video an einer Rückfrage sind keine Praxisfotos und kommen nicht in die Akte (ADR-017
Abschnitt L, Version 0.24). **Erstaufnahme:** Was zur Aufnahme gehört (Verordnung, Befundbogen,
Einwilligungen, Befund), SOLLTE sichtbar offen bleiben, bis es erledigt ist.

## 6. KI
KI ist ein Assistenzsystem. Sie darf insbesondere formulieren, strukturieren, zusammenfassen,
Therapieberichte und Kommunikation entwerfen, Relevantes hervorheben, Fragebögen vorschlagen,
Auffälligkeiten markieren und Termin- und Tourenoptionen vorschlagen. KI DARF NICHT autonom
Diagnosen stellen, Red Flags ausschließen, klinisch relevante Entscheidungen treffen, Behandlungen
verbindlich ändern, folgenreiche Nachrichten ungeprüft versenden oder Akten endgültig ändern;
Ergebnisse mit klinischer oder externer Wirkung sind Entwürfe bis zur menschlichen Freigabe. Der
Anbieter ist keine Architekturabhängigkeit: Die Anwendung MUSS ohne aktiven externen KI-Anbieter
vollständig funktionieren.

### 6.1 AI Privacy Gateway
Produktionsdaten DÜRFEN NICHT aus einzelnen Programmteilen direkt an KI-Anbieter gehen: **Ab dem
ersten KI-Feature MÜSSEN alle KI-Aufrufe über ein zentrales, providerunabhängiges Privacy Gateway
laufen, auch in Entwicklung und Test (dort gegen einen Mock Provider); direkte Provideraufrufe aus
Fachmodulen sind verboten.** Das Gateway MUSS Berechtigung, Zweck, notwendige Daten,
Datenminimierung, Pseudonymisierung, erlaubtes Modell, Logging und Fehlerbehandlung kontrollieren.
Direkte Identifikatoren SOLLTEN nur ans Modell gehen, wenn die Aufgabe sie erfordert;
Pseudonymisierung ersetzt bei klinischem Freitext keine Vertragszusagen (§3.5). Ein
Produktionsprovider DARF erst nach Datenschutz-, Vertrags- und Security-Prüfung freigeschaltet
werden, bis dahin gilt der Mock (ADR-005).

### 6.2 Trennung von KI und deterministischer Berechnung
LLM-Funktionen und deterministische klinische oder administrative Berechnungen MÜSSEN
architektonisch getrennt bleiben: Regelhinweise (§7.1), Rechnungsbeträge, Steuerangaben, Fristen,
Termin- und Fahrzeiten MÜSSEN deterministisch, versionierbar und testbar entstehen; ein Sprachmodell
DARF NICHT in ihrem Ergebnispfad stehen.

### 6.3 Sprachdokumentation: Diktat, Transkription und Übernahme
Unterstützt wird ein **bewusst gestartetes Nachdiktat** aus dem Termin (Smartphone, Tablet), das
transkribiert, strukturiert und geprüft wird, bevor Dokumentation daraus wird; Anbieter, Architektur
und Aufbewahrung des Audios sind offen (E13) und fallen im bauenden Loop (KI-EPIC-001). Die
Diktierfunktion der Gerätetastatur (Herstellerdienst ohne Vertrag mit der Praxis) bietet die
Anwendung nicht an. Eine Aufnahme MUSS ausdrücklich gestartet werden, fortlaufende, automatische
oder unbemerkte Aufnahme DARF es NICHT geben; Patient:in und Termin MÜSSEN eindeutig zugeordnet
sein.

Wiedergegeben wird das Gesprochene: Die KI DARF NICHT eigene klinische Schlussfolgerungen,
Bewertungen, Empfehlungen oder andere nicht gesprochene Inhalte ergänzen und DARF Gesprochenes NICHT
inhaltlich auslassen. Erhalten bleiben MÜSSEN insbesondere Zahlen, Einheiten, Körperseiten,
Verneinungen, geäußerte Unsicherheiten und die Unterscheidung von Patientenaussage und eigener
Beobachtung; Unverständliches MUSS gekennzeichnet und DARF NICHT geraten werden. Diktierte
Einschätzungen, Bewertungen und Pläne bleiben Aussagen der Therapeut:in. Transkript und Vorschlag
MÜSSEN vor der Übernahme lesbar, prüfbar und korrigierbar sein. Ein KI-Vorschlag ist kein
Dokumentationsentwurf (§5, ADR-016 Punkt 2), bis eine Therapeut:in ihn ausdrücklich übernimmt; dann
gilt er als von ihr verfasst. Die automatische Finalisierung (ADR-016 Punkt 7) DARF einen nicht
übernommenen Vorschlag NICHT erfassen, ein ungeprüfter Vorschlag DARF NICHT in die Akte, auch nicht
durch Fristablauf; wie sich diese Frist zu später Übernahme verhält, ist offen (E13).

Dienste für Spracherkennung, Diktat oder Transkription haben Zugang zu Gesundheitsdaten (§3.5), auch
ohne Sprachmodell: Sie laufen über das Gateway (§6.1), DÜRFEN NICHT direkt in ein Fachmodul
integriert werden und werden erst nach Datenschutz-, Vertrags- und Security-Prüfung freigeschaltet
(ADR-005 Punkte 8 und 9, ADR-002). Rohaudio ist Gesundheitsdatum; Ort und Frist seiner Speicherung
sind offen (E13, §18). Transkribieren und Einordnen in die Vorlage sind sprachliche Transformation
(ADR-006 Punkt 5) und zulässig; eine Funktion, die darüber hinaus klinische Einschätzung ergänzt,
ist `MDR_REVIEW_REQUIRED` (ADR-006 Punkt 6).

## 7. Fragebögen
Fragebögen werden, soweit sinnvoll, strukturiert digital modelliert, nicht nur als PDF; jeder hat
eine Version, abgeschlossene bleiben in ihrer Version erhalten. Der Anamnesebogen basiert auf
DIGOTOR Version 8 / 07-2026; Patient:innen KÖNNEN ihn vorab auf der Plattform ausfüllen (§4.6), die
Therapeut:in prüft ihn beim Termin, Papier kommt als Foto in die Akte (§5). Spätere Fragebögen und
PROMs verwaltet eine zentrale Instrumentenbibliothek.

### 7.1 Red Flags
Erfundene automatische Diagnosen oder proprietäre „Red-Flag-Scores“ DÜRFEN NICHT entstehen. Die
Anwendung DARF auffällige Angaben nach transparenten, definierten Regeln hervorheben, unverändert
oder eindeutig auf ihre Quelle zurückführbar; die Entscheidung trifft der Therapeut. Beispiel:
Tumoranamnese + aktueller unerklärlicher Gewichtsverlust → Warnhinweis zur klinischen Überprüfung.
Eine eigene klinische Bewertung als Risikoklasse, Score oder Handlungsempfehlung DARF NICHT
entstehen (§17).

## 8. Terminplanung
Bestätigte Termine sind grundsätzlich fix; eine automatische Optimierung DARF bestätigte
Patiententermine NICHT ungefragt verschieben. Patienten können Änderungen anfragen, Zeitfenster
nennen und Alternativen wählen; eine Anfrage ist ein Wunsch, Termin wird sie erst durch Bestätigung
der Praxis. Vorschläge beachten hart Patienten- und Therapeutenverfügbarkeit, Behandlungsdauer,
Fahrzeit und bestehende Termine, weich Präferenzen, kurze Wege, kompakte Touren, möglichst gleichen
Therapeuten und gleichmäßige Last.

Den Zustandsautomaten regelt ADR-018 (Punkte 1 bis 3): genau **ein** Zustand aus acht, angefragt und
vorgemerkt erst mit der Plattform (§4.6). Verbindlich: Jeder Wechsel läuft über eine Serverfunktion
mit Rollenprüfung, die am Termin festhält, wer wann wechselte (ADR-010 Punkt 15), nie frei über die
Tabelle; „dokumentiert“ und „abgerechnet“ setzt der Vorgang, dem die Tatsache gehört (Finalisierung,
Rechnungsausstellung), in derselben Transaktion; Absage und finalisierte Dokumentation sind
endgültig (neu anlegen bzw. begründete Korrektur nach §5, ohne Zustandsänderung). Abschließen geht
auch ohne Dokumentation, die Sperre sitzt an der Rechnung (§19).

**Absage unter 24 Stunden** vor dem vereinbarten Behandlungsbeginn durch die Patient:in löst eine
Ausfallgebühr aus; Eingang, Frist und Auslöser regeln ADR-018 Punkt 8 Nr. 1 bis 4 und
`app.is_late_cancellation`. Der Termin bleibt abgesagt, der Gebührenanlass ist ein Merkmal daneben.
Fehlen Höhe oder Abrechnungsweg (ABR-001, ABR-003), wird kein Betrag erfunden, sondern die offene
Festlegung benannt.

**Hausbesuch-Szenarien** (E14, ADR-018 Punkt 9): (1) Tür geöffnet, keine Behandlung auf Angabe der
Patient:in: durchgeführt, Pflichtvermerk in der Dokumentation, normal abgerechnet, keine
Ausfallgebühr. (2) Nach Protokoll (15 Minuten gewartet, geklingelt, angerufen) nicht angetroffen:
nicht wahrgenommen, Ausfallgebühr; der Vermerk DARF NICHT als Behandlung, finalisierte Dokumentation
oder verbrauchte Verordnungsleistung erscheinen. (3) Absage unter 24 Stunden: Ausfallgebühr. Die
Anwendung MUSS die behandelnde Person erklärend durch diese Fälle führen und das Protokoll aus
Fall 2 abfragen, bevor sie den Gebührenanlass setzt; Rechnungstext und Rechtsgrundlage für Fall 1
klärt B4. Außerhalb des Hausbesuchs (etwa Video) ist Nichtantreffen ein Vermerk ohne Gebühr
(ANN-055). **Zeitablauf allein erzeugt weder Absage noch Nichtantreffen** (ADR-018 Punkt 7).

### 8.1 Terminfenster, Dokumentationszeit und Fahrzeit
Angebotsregeln, keine Voreinstellung der Oberfläche, für jedes neu angelegte oder neu gesetzte
Zeitfenster eines angebotenen Termins:

- **Länge:** frei wählbar; sie MUSS mindestens einen Rasterschritt betragen, das Ende MUSS nach dem
  Beginn liegen, sonst gibt es keine Schranke. Die Dokumentation liegt im Fenster. Vorbelegung
  bleibt 60, zweite Regellänge 45 Minuten. Ein Behandlungstermin von weder 45 noch 60 Minuten MUSS
  im Kalender und in jeder Terminliste als abweichend gekennzeichnet werden, auch ohne Farbe und
  Bildschirm erfassbar; das Kennzeichen meldet, verbietet nicht, und gilt nie für Termine ohne
  Patient:in.
- **Ohne Behandlung** (Besprechungen, Teamtermine, andere Ereignisse des Praxisbetriebs): Beginn und
  Ende frei im Praxisraster, ohne Patient:in und Verordnung; sie DÜRFEN keine abrechenbare Leistung
  erzeugen (§19).
- **Dokumentationszeit:** Ein eigener Dokumentationsblock neben dem Termin DARF NICHT geplant, eine
  feste Aufteilung von Behandlung und Dokumentation im Fenster DARF NICHT vorgegeben oder erzwungen
  werden.
- **Raster:** Der Beginn KANN auf jedem Rasterpunkt liegen, die Länge beschränkt ihn NICHT auf volle
  oder halbe Stunden; die Rasterweite ist Praxiseinstellung (CAL-005).
- **Fahrzeit** kommt zwischen aufeinanderfolgenden Terminen hinzu: Der früheste Folgebeginn MUSS der
  erste Rasterpunkt auf oder nach Ende plus Fahrzeit sein; Abrunden DARF NICHT stattfinden.
- **Durchsetzung:** Raster, Fenstergrenzen und Belegung MÜSSEN serverseitig durchgesetzt und geprüft
  werden, das Formular allein genügt nicht; die Länge hat keine Serverschranke, an ihrer Stelle
  steht die Kennzeichnung. Die Rundung MUSS serverseitig gelten, sobald eine Fahrzeit vorliegt.
  Kennzeichnung, Durchsetzung und Rundung MÜSSEN test- oder auditierbar sein (§0).
- **Bestand:** Früher mit anderer Länge angelegte Termine bleiben gültig, sichtbar und bearbeitbar;
  die Anwendung DARF sie NICHT selbsttätig verlängern, verkürzen oder verschieben, eine rein
  organisatorische Änderung (Person, Terminart, Ort) DARF NICHT an der Länge scheitern. Geprüft wird
  ein Fenster, wenn es neu gesetzt wird (wie CAL-005).

Die Fahrzeit stammt aus §9 und ADR-019 und MUSS deterministisch entstehen (§6.2). Fahrpuffer und
Anzeige einer Unterschreitung baut MAP-006 nach vorläufiger Entscheidung zu E12 Punkt 3 und 4; offen
ist nur, ob die Fahrzeit für die Rundung je Prüfung abgerufen oder kurz gespeichert wird (E12
Punkt 3a).

## 9. Routenplanung
Routen und Fahrzeiten MÜSSEN über einen professionellen Kartendienst integriert werden; eine eigene
Routing-Engine DARF NICHT entstehen. Zuerst erkennt die Anwendung insbesondere Erreichbarkeit zweier
Termine, Fahrzeit, sinnvolle Reihenfolge und Auswirkungen einer Änderung; später KANN
Tourenoptimierung dazukommen. Die Tagesroute trägt Behandlungen und Training gemeinsam (ADR-022) und
zeigt beim Losfahren den ersten Weg, eine Vorschau auf den nächsten und kurze Hinweise zur Person.
Ob eine Behandlungsliege mitmuss, MUSS beim Tagesstart erkennbar sein, auch wenn erst ein späterer
Besuch sie braucht (Merkmal der Person, im Befund gesetzt). Navigiert wird mit der App des Geräts,
Führung in der Anwendung: §20.1. Der Kartendienst hat Zugang zu Patientendaten (§3.5);
Routing-Rohdaten haben eine kurze Frist (§18).

## 10. Kommunikation
Interne und externe Kommunikation werden getrennt behandelt.

### Intern
Teamchat nach Slack-Art (Channels, Direktnachrichten, Threads, Mentions, Suche, Anhänge,
Benachrichtigungen) mit rollierender Frist; dauerhaft Relevantes MUSS in den zuständigen Fachprozess
übernommen werden (§18).

### Patientenkommunikation
Sie gehört zum Patienten und DARF NICHT mit dem Teamchat vermischt werden; medizinisch Relevantes
MUSS der Akte zuordenbar sein. Sie läuft über einen gemeinsamen Kanal (C2), den Office mitliest
(§4.3); klinischen Inhalt einer Nachricht MUSS die Therapeut:in, die ihn erkennt, der Akte zuordnen.

## 11. Softwareentwicklung
Eine Codebasis ist die technische Wahrheit (Git, GitHub). Claude Code darf Code und Tests erstellen
und ändern, Refactoring vorschlagen, Design implementieren, Dokumentation erstellen, rechtliche,
datenschutzrechtliche und fachliche Fragen recherchieren und mit Quellen begründet vorschlagen sowie
Lücken von Prinzipien, ADRs und Feature-Spezifikationen durch begründete, dokumentierte Annahmen
schließen (§15.1). Claude Code DARF NICHT ohne expliziten Auftrag die Architektur wesentlich
wechseln, neue externe Anbieter einführen, Sicherheitsmechanismen umgehen, Datenbankstrukturen
großflächig ändern, Features entfernen oder Produktanforderungen ändern; eine Annahme füllt eine
Lücke, ändert keine Produktanforderung und bleibt vorläufig bis zur Bestätigung. Zusätzlich gilt
§3.1.

## 12. Qualität
Kritische Funktionen MÜSSEN Tests haben, besonders Authentifizierung, Berechtigungen, Trennung der
Patientenaccounts, Dokumentationszuordnung, Dateizugriffe, KI-Datenflüsse und Rechnungsdaten.
Security oder Datenschutz DÜRFEN NICHT für schnellere Fertigstellung umgangen werden.

## 13. Fehlerbehandlung
Ein Fehler DARF NIEMALS unbemerkt Patientendaten einem falschen Patienten zuordnen, Daten anderer
Patienten offenlegen, Dokumentation verlieren oder überschreiben, Rechnungen falsch zuordnen oder
Zugriffsrechte erweitern. Bei unsicherem Zustand SOLLTE das System schreibende und offenlegende
Aktionen mit verständlichem Fehler blockieren; Lesen am Patienten bleibt offen (§4.2). Einen
klinischen Break-Glass-Mechanismus braucht V1 nicht; „Break Glass“ meint ausschließlich
privilegierten technischen Produktionszugriff (ADR-010 Punkte 7 und 8).

## 14. Umfang und Skalierbarkeit
**Zur Eröffnung im Juli 2027 läuft das Endprodukt.** Neben der Heilbehandlung sind freigegeben:
Trainingsbereich (§1.2, §4.9, §4.10), Plattform für Patient:innen und Trainingskund:innen (§4.6,
§4.10), Nachsorge-Abo und Trainingspaket im eigenen Rechnungswesen (§19), Praxisbetrieb (Radflotte,
Teamkommunikation, Urlaub, Zeitkonto, Erstattungen) und KI-Assistenz im Rahmen von §6 und §17.
Gebaut wird nur mit konkretem Auftrag in der Reihenfolge von `docs/development/ROADMAP.md`; was ein
Verbot aus §17 berührt, entsteht auch so nicht. V1 ist für **eine** Praxis; gesperrt bleiben mehrere
Standorte als Funktion (vorbereitet nur `location_id`, ADR-003), Wearables und Gesundheits-Apps
sowie die Software als bezahlter Dienst für andere Praxen und ihre Vermarktung. Das Datenmodell
SOLLTE diese Erweiterungen und weiteres Wachstum nicht unnötig verhindern; vorbereitet wird nur, was
ADR-014 abschließend auflistet, samt Negativliste. Zukunft nicht verbauen heißt nicht, Funktionen
vorzeitig zu bauen.

## 15. Projektmanagement
Vor größeren Implementierungen Anforderungen verstehen, bestehenden Code prüfen, planen, Risiken und
Auswirkungen benennen, erst dann Code ändern; danach Tests ausführen, sicherheitsrelevante
Änderungen prüfen, Änderungen zusammenfassen, bekannte Einschränkungen nennen. Keine unnötigen
Refactorings außerhalb des Auftrags.

### 15.1 Begründete Annahmen
Eine Entscheidung, die weder dieses Dokument noch ein ADR noch die Feature-Spezifikation trifft,
wird nicht abgewartet:

1. **Recherchieren:** erst Projektdokumente, dann Primärquellen (Gesetze, Leitlinien und Kurzpapiere
   von Datenschutzkonferenz, BfDI und Landesbeauftragten, Berufsverbände), Sekundärquellen nur
   ergänzend; Unbelegtes wird als unsicher benannt.
2. **Entscheiden:** die Option, die bei Unsicherheit die Prioritäten aus §16 wahrt, im Zweifel die
   datensparsamere, restriktivere, leichter umkehrbare.
3. **Dokumentieren:** Jede Annahme MUSS in `docs/decisions/ASSUMPTIONS.md` stehen (Begründung,
   Quellen, Code-Anker, Änderungspfad); eine Annahme nur im Code oder Kopf ist ein Fehler.
4. **Reversibel verankern:** Eine Annahme SOLLTE an genau einer Stelle greifen (Policy-Funktion,
   Konfigurationswert, Konstante, Migration), die die Kennung `ANN-NNN` trägt.
5. **Validieren lassen:** Annahmen zu Datenschutz und Recht MÜSSEN vor Produktivstart im
   Datenschutzprozess (§3.7) bestätigt oder geändert werden; bis dahin sind sie vorläufig.

Eine Annahme DARF NICHT einer MUSS- oder DARF-NICHT-Anforderung dieses Dokuments oder eines ADRs
widersprechen, eine Sicherheits- oder Datenschutzmaßnahme, einen Test oder ein CI-Gate aufweichen
(§12), §3.1 bis §3.3 berühren (echte Patientendaten, Produktionscredentials, Secrets), ein
Produktionsdeployment, eine Cloud-Ressource oder einen neuen externen Anbieter einführen (§3.5, §11,
ADR-013) oder eine bestehende Entscheidung ersetzen, deren Rücknahme nach eigener Einschätzung ein
großer Umbau wäre (anderes Rollenmodell, Grundprinzip der Datenhaltung, Rechtsgrundlage der
Kernverarbeitung). Dann ist es eine Änderungsanfrage an den Projektinhaber, und die Arbeit an genau
diesem Punkt stoppt; alles andere wird angenommen, dokumentiert und im Bericht des Loops
ausdrücklich genannt.

### 15.2 Eine offene externe Klärung hält die Entwicklung nicht an
Eine ausstehende Antwort von außen (Datenschutz- oder Steuerberatung, Anbietervertrag,
Aufsichtsbehörde, Lizenzgeber) **DARF die Entwicklung NICHT blockieren**, nur das Scharfschalten.
Bauen heißt entwerfen, umsetzen, testen und abnehmen, nur mit synthetischen Daten und ohne
produktive Verarbeitung (ADR-007 Punkt 6); scharf ist, wenn echte Personendaten fließen, ein
Anbieter produktiv genutzt wird oder das System in Betrieb geht, und erst dafür gelten §3.7 und
ADR-007 Punkt 5. Spezifikation, ADR oder Ablaufbeschreibung DÜRFEN eine offene externe Klärung NICHT
zur Startbedingung eines Loops machen; sie steht als Bedingung des Scharfschaltens an genau einer
Stelle, dem Go-live-Gate (§3.7, ADR-007 Punkt 5). Ein Zuschnitt, der das Bauen an eine externe
Antwort bindet, wird neu geschnitten: synthetisch bauen, Umschalter zu. Weil späte Antworten gebaute
Annahmen widerlegen können, MUSS jede so getragene Annahme an genau einer Stelle reversibel
verankert sein (§15.1 Ziffer 4 verschärft); die Liste „Eine Annahme DARF NICHT“ wird dadurch nicht
kürzer, die Vorbedingungen des Scharfschaltens bleiben. Externe Anfragen (Datenschutzberatung mit
DSFA, Steuerberatung, Anbieterprüfungen) gehen ab Anfang 2027 parallel zum Bauen hinaus.

## 16. Priorität
Bei Konflikten gilt grundsätzlich: Patientensicherheit > Datenschutz und Informationssicherheit >
Datenintegrität > korrekte Funktion > Usability > Performance > Entwicklungsgeschwindigkeit >
zusätzliche Features.

## 17. Regulatorische Abgrenzung
V1 wird NICHT mit der Zweckbestimmung entwickelt, diagnostische oder therapeutische Entscheidungen
zu treffen oder entsprechende Empfehlungen bereitzustellen. Die Anwendung DARF
Gesundheitsinformationen erfassen, speichern, strukturieren und darstellen sowie validierte
Instrumente transparent berechnen; sie DARF in V1 keine eigenen klinischen Risikoklassifikationen,
Differentialdiagnosen, Therapieempfehlungen, Behandlungsauswahl oder automatisierten klinischen
Entscheidungen erzeugen. Generative KI dient in V1 Dokumentation, sprachlicher Transformation,
Zusammenfassung und administrativer Assistenz; sie DARF keine neue klinische Interpretation
hinzufügen, die Grundlage einer diagnostischen oder therapeutischen Entscheidung sein soll.
Features, die diese Grenze möglicherweise überschreiten, MÜSSEN als `MDR_REVIEW_REQUIRED`
klassifiziert werden und DÜRFEN vor dokumentierter regulatorischer Prüfung nicht produktiv aktiviert
werden. Vor Produktivstart MÜSSEN Zweckbestimmung und Abgrenzung zur Medical Device Software nach
den dann aktuellen MDR-/MDCG-Regeln extern geprüft werden.

**Beide Leistungsbereiche (E18):** Die Software trifft keine diagnostischen oder therapeutischen
Entscheidungen und schlägt keine vor. Der Abschnitt gilt unverändert im Training und an Terminen im
Kontext `training` (§1.2, ADR-006 Punkt 9); Training ändert die Rechtsgrundlage, nicht die
Zweckbestimmung. Drei Verbote sind in V1 **Ausschlusskriterien**, nicht nur Prüfanlass:

1. Die Anwendung DARF NICHT Übungen, Dosierung, Intensität oder Progression aus Diagnose, Befund,
   Screening-Antwort oder Verlauf vorschlagen, vorsortieren, vorfiltern oder vorbelegen.
2. Die Anwendung DARF NICHT aus Schmerzskala oder Verlauf eine Bewertung mit Handlungsempfehlung
   ableiten: kein eigener Score, keine Risikoklasse, keine Ampel, kein Schwellenwertalarm.
3. Ein Screening-Fragebogen DARF NICHT selbst eine Trainingsfreigabe, eine Kontraindikation, einen
   Abbruch oder eine Empfehlung zum Arztbesuch aussprechen.

Eine Funktion, die eines davon berührt, entsteht in V1 nicht, ist zugleich `MDR_REVIEW_REQUIRED` und
DARF auch hinter einem Schalter nicht produktiv erreichbar sein; ein Feature-Flag ersetzt die
Prüfung nicht. Es sind **Ausgabeverbote, keine Datenverbote**: Erhoben, gespeichert und angezeigt
wird, was fachlich nötig ist, nur die abgeleitete Aussage entsteht nicht; die Hervorhebung nach §7.1
bleibt (Kanten und Beispiele: ADR-006 Punkte 10 bis 12).

**Ernährung (Version 0.28):** Bedarf und Zielwerte für Energie, Makronährstoffe und Wasser aus
veröffentlichten, validierten Formeln und die übliche Trackeranzeige sind transparente Berechnung im
Sinne dieses Abschnitts, zum Zweck allgemeiner Ernährung im Alltag: Eine Diagnose oder Erkrankung
DARF NICHT Eingabe der Rechnung sein, und die Anwendung DARF keine Ernährungsempfehlung für eine
Erkrankung erzeugen (Bedingungen und Untergrenzen: ADR-006 Punkt 14).

## 18. Aufbewahrung und Löschung
Personenbezogene Daten MÜSSEN Datenklassen zugeordnet und nach einem dokumentierten Retention
Schedule verarbeitet werden: Frist, Anker und Norm je Klasse führt `public.retention_classes`,
Grundsätze und Daten ohne eigene Klasse ADR-008 (Punkte 4 bis 6). Gesetzliche Aufbewahrung geht
regulärer Löschung vor; nach Ablauf von Zweck und allen Aufbewahrungsgründen MUSS echt gelöscht
werden, dauerhaftes Soft-Delete ersetzt die gesetzlich oder datenschutzrechtlich erforderliche
endgültige Löschung NICHT. Fristen ohne unmittelbare gesetzliche Vorgabe sind interne
Initialentscheidungen und MÜSSEN vor Produktivstart im Datenschutz-/DSFA-Prozess (§3.7) validiert
werden. Ein dokumentierter Legal Hold MUSS automatische Löschung während laufender rechtlicher oder
regulatorischer Vorgänge verhindern. Backups DÜRFEN Gelöschtes bis zum Ende ihres Lebenszyklus
enthalten, das DARF NICHT regulär zugänglich sein; nach einer Wiederherstellung MÜSSEN seitdem
wirksam gewordene Löschungen erneut angewendet werden. Konten und Authentifizierungsdaten MÜSSEN
getrennt von aufbewahrungspflichtigen Fachdaten behandelt werden (§4.6).

## 19. Abrechnung
V1 rechnet privat in der Plattform ab, ohne Factoring oder externe Abrechnungsdienstleister. Patient
und Rechnungsempfänger MÜSSEN getrennte Entitäten sein. Leistungen bestehen unabhängig von
Rechnungen und entstehen aus durchgeführten Terminen oder anderen abrechenbaren Ereignissen; eine
Leistung DARF NICHT unbeabsichtigt mehrfach abgerechnet werden. Abrechenbar sind insbesondere der
dokumentierte Behandlungstermin und der Gebührenanlass (§8), im Training die vereinbarte Leistung
und das Paket (fester Zeitraum, nicht pausierbar), dazu das Nachsorge-Abo (§4.6) als monatliche
Leistung in `therapy`, monatlich kündbar, frühestens ab Ende der Behandlungsgrundlage (ADR-020),
damit nichts doppelt berechnet wird; die steuerliche Einordnung von Paket und Nachsorge-Abo klärt
B4, bis dahin gilt §15.1
(ADR-009 Punkt 21). Leistungskatalog und Preisvereinbarungen MÜSSEN versioniert sein; spätere
Preisänderungen DÜRFEN historische Leistungen und Rechnungen NICHT verändern. Steuerliche
Eigenschaften MÜSSEN explizit je Leistung bzw. Leistungsversion gespeichert sein und DÜRFEN NICHT
durch KI bestimmt werden (§6.2).

Die Rechnungsnummer entsteht erst bei Ausstellung, MUSS eindeutig sein und DARF NICHT
wiederverwendet werden. **Eine ausgestellte Rechnung ist unveränderbar;** korrigiert wird
nachvollziehbar per Korrektur- oder Stornodokument und ggf. neuer Rechnung. Beim Ausstellen MÜSSEN
alle rechnungsrelevanten Stamm- und Leistungsdaten, Preise und Steuerinformationen als historischer
Snapshot gespeichert und das Dokument in seiner damaligen Form aufbewahrt werden. Zahlungen MÜSSEN
eigene Transaktionen sein und Teil- sowie spätere Rückzahlungen ermöglichen. Therapeutische
Leistungen am Termin SOLLTEN erst nach finalisierter Dokumentation endgültig fakturierbar sein; **in
V1 gibt es keinen Override**: Behandlungstermine werden nur aus „dokumentiert“ oder einem Vorgang
mit Gebührenanlass fakturiert (ADR-018), „Tür geöffnet, keine Behandlung“ (§8) über die
Dokumentation mit Pflichtvermerk; ein künftiger Override MÜSSTE begründet und protokolliert werden.
V1 erstellt PDF-Rechnungen für private Empfänger; die Architektur DARF spätere strukturierte
E-Rechnungen NICHT verhindern (Rechnungszustände: ADR-009).

## 20. Beschäftigtendaten
Routenplanung (§9) und Arbeitszeiterfassung (§1) erzeugen Beschäftigtendaten; zusätzlich gilt der
Beschäftigtendatenschutz. **Eine permanente GPS- oder Live-Ortung von Mitarbeiter:innen findet NICHT
statt.** Tourendaten dienen Einsatz- und Routenplanung und Abrechnung, nicht der Verhaltens- oder
Leistungskontrolle.

### 20.1 Navigationsführung auf dem Gerät
Eine Führung auf dem Gerät der fahrenden Person fällt nicht unter dieses Verbot, wenn sie **alle**
Bedingungen erfüllt:

1. Die Position wird nur auf dem Gerät verarbeitet, NICHT an die Praxissoftware übermittelt und dort
   NICHT gespeichert, auch nicht im Log.
2. Die Führung beginnt nur auf ausdrückliche Aktion der fahrenden Person, endet mit der Fahrt, ist
   jederzeit abbrechbar und startet NIEMALS automatisch.
3. Zum Kartendienst geht eine Position nur zur Neuberechnung einer Route, ohne Namen, Kennung oder
   Uhrzeit.
4. Daraus entsteht keine Auswertung, keine Historie und kein Bewegungsprofil, auch nicht aggregiert.

**Der Arbeitgeber DARF daraus keinen Standort ableiten können;** eine Funktion, die das ermöglichte,
ist NICHT gedeckt, ob genutzt oder nicht. Der Abschnitt erlaubt eine Funktion und lockert keine
Grenze (ADR-019 Abschnitt F). Ob aggregierte Auswertungen zulässig sind, ist offen
(`docs/decisions/OPEN_DECISIONS.md`).

### 20.2 Rückmeldungen von Beschäftigten
Beschäftigte DÜRFEN der Praxisleitung Rückmeldung geben: im monatlichen Barometer mit Namen,
jederzeit über „Rückmeldung an die Praxisleitung“ mit oder ohne Namen. Zweck sind offene
Kommunikation und eine niedrige Hürde für Beschwerden, nicht Leistungs- oder Verhaltenskontrolle;
die Sätze oben gelten unverändert.

1. Das Barometer ist namentlich (Version 0.29), das steht vor dem Senden da; bei der Rückmeldung an
   die Praxisleitung wählt die Person **bei jeder Abgabe** mit oder ohne Namen, beides gleich
   leicht, nichts vorbelegt.
2. Die Teilnahme ist freiwillig: Wer nicht antwortet, wird NICHT gelistet und NICHT erinnert, daraus
   folgt nichts; der allen gleiche Hinweis in der Anwendung an höchstens drei Tagen im Monat
   (ANN-603) ist kein Erinnern in diesem Sinn.
3. Die Antworten sieht nur die Praxisleitung (`owner`); sie gehen in keine Bewertung, Rangfolge oder
   Personalentscheidung ein. Einen Werteverlauf je Person als Kurve oder Kennzahl gibt es NICHT;
   eine namentliche Antwort wird als einzelne Nachricht gelesen.
4. Anonyme Rückmeldungen erscheinen nur als Praxissumme, erst wenn mindestens drei Beschäftigte
   teilnehmen können und fünf Rückmeldungen vorliegen; das Barometer hat keine Schwelle, ist ab der
   ersten beschäftigten Person nutzbar und wird nach Nr. 3 einzeln gelesen.
5. Für die Antworten gilt eine eigene Datenklasse mit Frist (`rueckmeldung`, ADR-008).

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

Welche ADRs angenommen sind, welche Fassung gilt, welchen Status ein ADR hat
und woran eine produktive Freigabe hängt, steht allein in
[`docs/adr/README.md`](docs/adr/README.md). Zwei Stellen, die dasselbe
behaupten, driften auseinander; hier ist nur eine.

Änderungen an diesem Dokument erfolgen als eigener Commit mit erhöhter
Dokumentversion; der Änderungsvermerk steht in der Commit-Nachricht. **Geändert
wird der Text an seiner Stelle**: Eine neue Entscheidung ersetzt die alte, statt
als Absatz daneben zu stehen; Geschichte gehört in Git.

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
