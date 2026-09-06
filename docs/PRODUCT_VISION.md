# Produktvision

> **Dieses Dokument ist nicht normativ.**
>
> Es beschreibt das langfristige Zielbild und hilft, lokale Produkt- und
> Architekturentscheidungen einzuordnen. Es ist **kein Implementierungsauftrag**,
> **keine Feature-Spezifikation** und **keine Freigabe** der beschriebenen
> Funktionen. Aus diesem Dokument darf **niemals** eine Erweiterung eines
> aktuellen Feature-Scopes abgeleitet werden.
>
> Verbindlich sind ausschließlich `PROJECT_PRINCIPLES.md`, die angenommenen
> ADRs in `docs/adr/` und die jeweils konkrete Feature-Spezifikation.

## Dokumentenhierarchie

| Rang | Dokument                       | Rolle                                                             |
| ---- | ------------------------------ | ----------------------------------------------------------------- |
| 1    | `../PROJECT_PRINCIPLES.md`     | Produkt-, Sicherheits- und Datenschutzprinzipien. Verbindlich.    |
| 2    | `adr/`                         | Angenommene Architekturentscheidungen. Verbindlich.               |
| 3    | konkrete Feature-Spezifikation | Legt den Scope einer Aufgabe fest. Verbindlich für diese Aufgabe. |
| 4    | `decisions/ASSUMPTIONS.md`     | Begründete, vorläufige Annahmen. Gelten bis zur Bestätigung.      |
| 5    | **dieses Dokument**            | Orientierung. **Nicht normativ.**                                 |
| 6    | `product/IDEENSPEICHER.md`     | Ideen und Rohmaterial. **Nicht normativ.**                        |

Widerspricht dieses Dokument einem der Ränge 1 bis 4, gilt der höhere Rang —
ohne Diskussion und ohne Auslegung zugunsten der Vision.

Der Ideenspeicher auf Rang 6 steht noch unter diesem Dokument. Er sammelt, was
Jannes sich für die Plattform vorstellt, bevor daraus überhaupt ein Zielbild
geworden ist. Er entscheidet nichts und begründet nichts.

Widerspricht ein ADR den Prinzipien, ist das ein Fehler und wird gemeldet,
nicht stillschweigend aufgelöst (`PROJECT_PRINCIPLES.md` §21).

Was noch **nicht** entschieden ist, steht in `decisions/OPEN_DECISIONS.md`.
Dieses Dokument entscheidet nichts davon.

---

## 1. Produktzweck

Eine zentrale Softwareplattform für eine privat abrechnende
Physiotherapiepraxis mit starkem Hausbesuchs- und Mobile-Fokus.

Das Produkt wird zunächst **ausschließlich für die eigene Praxis** entwickelt.

Eine spätere Erweiterung auf mehrere Standorte, mehrere Organisationen oder
andere Praxen soll architektonisch nicht unnötig verbaut werden. Daraus
entsteht **kein Auftrag**, ein generisches SaaS-Produkt oder zusätzliche
Mandantenfunktionen zu bauen. Wie weit die Vorbereitung konkret reicht, regelt
abschließend [ADR-003](adr/ADR-003-organization-location-model.md) und
[ADR-014](adr/ADR-014-foundational-data-model.md).

### 1.1 Zielbetrieb

Präzisierung vom 31.08.2026. Sie ersetzt das frühere, weitere Bild einer
allgemeinen Praxis mit Hausbesuchsoption:

Die Praxis hat **keine Behandlungsräume**. Alle regulären Behandlungen sind
Hausbesuche, und alle Wege werden **mit dem Fahrrad** zurückgelegt. Start- und
Endpunkt eines Arbeitstags sind ein Raddepot oder ein persönlicher Startort,
nicht eine Praxisadresse. Ein Raddepot ist ein betrieblicher Ort, kein
Behandlungsraum.

Daraus folgt für die Vision:

- **Raumplanung ist kein Zielumfang.** Was in anderen Praxissystemen die
  Raumbelegung ist, ist hier die Fahrradflotte.
- **Die Fahrradflotte ist eine Planungsressource.** Ein fehlendes oder
  gesperrtes Rad ist eine echte betriebliche Einschränkung.
- **GKV-Abrechnung ist kein Zielumfang.** Abgerechnet wird privat
  (`PROJECT_PRINCIPLES.md` §19, [ADR-009](adr/ADR-009-private-billing-model.md)).
- **Personal-, Flotten- und Kommunikationsabläufe gehören zum Produkt**, nicht
  in eine zweite Anwendung daneben.

Als konkrete Funktions- und Ablaufvorlage für die betrieblichen Abläufe dient
eine vorhandene Team-App der Praxis (Radflotte, Schlüssel, Check-Up,
Pannenablauf, Mitarbeiterliste, Urlaub, Überstunden, Erstattungen). Sie ist
eine Vorlage für Umfang und Ablauf, **keine Vorlage für Datenmodell,
Berechtigungen oder Sicherheitsmechanismen** — deren Anforderungen stehen
unverändert in `PROJECT_PRINCIPLES.md` §3 und §4.

Standortabhängige Inhalte dieser Vorlage stammen aus dem Kölner Betrieb und
sind für Tübingen **nicht geprüft**. Sie werden als austauschbare
Standortvorlage geführt und dürfen nicht als freigegebene Betriebsanweisung
erscheinen.

Präzisierung vom 06.09.2026 (Jannes):

- **Die Praxis nimmt den Betrieb am 01.07.2027 auf.** Es gibt kein
  Vorgängersystem und keine Bestandsdaten; die Software begleitet die Praxis
  vom ersten Tag an (`development/ROADMAP.md`, Meilensteine M4 bis M6).
- **Navigation zu Hausbesuchen läuft über Google Maps.** Aus der Anwendung
  führt immer ein Link zur Navigation; die Übermittlung der Adresse dafür ist
  entschieden und datenschutzrechtlich freigegeben. Eine Karte der gesamten
  Tagesroute — alle Wege auf einmal oder ein einzelner Weg als Vorschau —
  gehört zum Zielbild des Lastenrad-Hausbesuchskonzepts
  (`product/ideen/10-praxisverwaltung.md`, `IDEA-PRX-029` und `-030`; der
  Datenweg der Karte ist offen, `decisions/OPEN_DECISIONS.md` B7).
- **Die Praxissoftware ist nur ein Teilbereich.** Dazu kommt eine Plattform
  für Patient:innen und für die Kund:innen von Jannes' Personal Training
  (§4).

## 2. Langfristige Funktionsbereiche

Das langfristige Zielbild umfasst:

- Patientenverwaltung
- Patientenportal
- digitaler Intake und strukturierte Anamnese
- PROMs und Outcome Tracking
- Kalender
- Terminverfügbarkeiten
- Routen- und Tourenplanung für Hausbesuche
- klinische Dokumentation
- KI-gestützte Dokumentationsentwürfe und Assistenz
- Therapie- und Übungspläne
- Privatrechnungen
- sichere Patientenkommunikation
- interne Slack-artige Teamkommunikation
- Mitarbeiterverwaltung
- Urlaub
- Arbeitszeit und Überstunden
- Erstattungen und Belege
- Fahrradflotte, Wartung und Pannenmanagement
- Plattform für Patient:innen und für Kund:innen des Personal Trainings:
  Trainingspläne, Check-ins, Fortschritt, Assessments, Gewohnheiten,
  Ernährungsprotokoll, Chat (Präzisierung vom 06.09.2026; Themenliste in
  `product/ideen/referenz-navigation.md`)

**Diese Liste ist eine langfristige Orientierung.** Sie trifft keine Aussage
über Reihenfolge, Priorität oder bereits freigegebenen Scope. Kein Eintrag
darauf ist beauftragt, solange er nicht in einer konkreten
Feature-Spezifikation steht.

## 3. Zentrale Nutzergruppen

- Praxisinhaber beziehungsweise Owner
- Therapeut:innen
- Team Leads
- Office beziehungsweise Verwaltung
- Patient:innen
- Kund:innen des Personal Trainings — ohne Heilbehandlung, mit eigenem
  Vertrag, eigener Rechtsgrundlage, Umsatzsteuer und Aufbewahrungsfrist
  (`decisions/OPEN_DECISIONS.md` B9; Präzisierung vom 06.09.2026)
- später gegebenenfalls Angehörige oder rechtliche beziehungsweise
  bevollmächtigte Vertreter:innen

**Patient, Person, Mitarbeiter und Auth-Account sind unterschiedliche
fachliche Entitäten und dürfen nicht gleichgesetzt werden.** Diese Trennung ist
kein Zielbild, sondern bereits verbindlich
([ADR-014](adr/ADR-014-foundational-data-model.md)); die Rollen und ihre
Sichtbarkeiten regelt `PROJECT_PRINCIPLES.md` §4 zusammen mit
[ADR-004](adr/ADR-004-authorization-model.md).

## 4. Plattform für Patient:innen und Kund:innen

Langfristiges Zielbild für Patient:innen:

- eigener Login
- Termine
- Terminänderungswünsche
- Fragebögen
- Therapieziele
- Übungen
- Videos
- Hausaufgaben
- Tracking
- Outcomes
- Rechnungen
- Dokumente
- sichere Kommunikation

**Ein Patient benötigt nicht automatisch einen Portalaccount.** Account und
Akte sind getrennte Konzepte (`PROJECT_PRINCIPLES.md` §4.6).

Später müssen gegebenenfalls auch Angehörige oder Vertreter Zugriff erhalten
können. Daraus ist **aktuell keine Implementierung abzuleiten**; die
zugehörigen Fragen zu Identitätsprüfung und Vertretung sind in
`decisions/OPEN_DECISIONS.md` als offen geführt.

Dieselbe Plattform ist das Zielbild für die **Kund:innen des Personal
Trainings** — nach Abschluss einer Therapie und auch ohne vorherige
Heilbehandlung (Präzisierung vom 06.09.2026): Trainingspläne, Check-ins,
Fortschritt, Assessments, Gewohnheiten, Ernährungsprotokoll, Chat. Für sie
gelten ein anderer Vertrag, eine andere Rechtsgrundlage, Umsatzsteuer und
Aufbewahrung (`decisions/OPEN_DECISIONS.md` B9); `PROJECT_PRINCIPLES.md` §1
nennt bisher nur die Physiotherapiepraxis und wäre nach §21 zu ergänzen.
Reihenfolge und Voraussetzungen stehen in `development/ROADMAP.md`, Stufe 3.
Auch das ist **nur eine Produktoption und kein freigegebener Scope**.

## 5. Digitaler Intake und Assessments

Der DIGOTOR-Anamnesebogen Version 8 / 07-2026 soll langfristig als
**strukturiertes digitales Formular** umgesetzt werden — nicht als PDF-Ablage
(`PROJECT_PRINCIPLES.md` §7).

Inhaltlich unter anderem:

Lokalisation · NRS · Symptomverhalten · Verlauf · Funktion · neurologische
Symptome · systemische Angaben · Begleiterkrankungen · Medikamente · Aktivität
· Krafttraining · Schlaf · Stress · bisherige Diagnostik · Patientenziele

Spezifische Instrumente wie RIS, KOOS und weitere PROMs sollen später über eine
**Instrumentenbibliothek** ergänzt werden können. Lizenz- und
Nutzungsfragen einzelner Instrumente sind offen und in
`decisions/OPEN_DECISIONS.md` geführt.

Es dürfen **keine proprietären oder fachlich nicht validierten
Red-Flag-Scores** erfunden werden.

Patientenangaben dürfen transparent hervorgehoben und für Behandelnde
aufbereitet werden. Das System leitet daraus **keine autonome Diagnose und
keine klinische Entscheidung** ab. Die verbindliche Grenze zieht
[ADR-006](adr/ADR-006-medical-device-boundary.md).

## 6. KI-Zielbild

**Aktuell ist keine produktive KI-Funktion implementiert.**

Langfristiges Grundmodell:

```
App
  → zentraler AI Privacy Gateway
      → Berechtigungsprüfung
      → Zweckprüfung
      → Datenminimierung
      → zugelassener Provider
  → Ergebnis
  → menschliche Prüfung
```

**Kein fachliches Modul ruft einen LLM-Provider direkt auf**
([ADR-005](adr/ADR-005-provider-independent-ai.md)).

KI unterstützt zunächst bei Entwürfen, Zusammenfassungen und
Assistenzaufgaben. Klinische Verantwortung und Freigabe verbleiben beim
Menschen.

Aktuell favorisierte, **nicht abschließend beschlossene**
Produktionshypothese: Claude über AWS Bedrock in einer geeigneten
EU-Konfiguration.

**Die konkrete Providerentscheidung bleibt offen.** ADR-005 hält sie
ausdrücklich offen, und jeder Anbieter mit Zugang zu Patientendaten
durchläuft vorher die dokumentierte Prüfung nach
[ADR-002](adr/ADR-002-hosting-data-residency.md). Diese Zeile ist eine
Arbeitshypothese, keine Vorentscheidung.

Diktat und Speech-to-Text sind später als **eigener Datenfluss mit
Gesundheitsdaten** gesondert zu bewerten.

## 6a. Bedienmodell: sechs Arbeitsbereiche

Die Funktionsbereiche aus §2 sagen, _was_ die Plattform können soll. Dieses
Kapitel sagt, _wo_ eine Person ihre Aufgabe beginnt. Die Aufteilung ist
umgesetzt und in `src/app/navigation.tsx` abgebildet; sie ist die
Ausgangsstruktur und keine unveränderliche Festlegung.

| Arbeitsbereich   | Leitfrage                                              |
| ---------------- | ------------------------------------------------------ |
| Mein Tag         | Was muss ich als Nächstes tun?                         |
| Touren & Termine | Wer behandelt wen, wann und mit welchen Wegen?         |
| Patient:innen    | Was gehört zur Versorgung dieser Person?               |
| Team             | Mit wem muss ich etwas klären?                         |
| Betrieb          | Welche Voraussetzungen und Anträge sind zu bearbeiten? |
| Abrechnung       | Welche Leistungen sind abzurechnen oder zu bezahlen?   |

Regeln, die sich daraus ergeben haben:

- **Ein Vorgang, mehrere Sichten.** „Mein Tag" und „Touren & Termine"
  betrachten dieselben Besuche wie der Kalender. Es entsteht keine zweite
  Terminliste, kein zweiter Mitarbeiterstamm und keine zweite Patientenakte.
- **Der Arbeitsgegenstand trägt seine Werkzeuge.** Suche, Filter und Aktionen
  stehen im jeweiligen Bereich, nicht in der globalen Navigation.
- **Öffentliche und geschützte Sicht sind getrennt.** Dieselbe Person, aber
  nicht dieselben Angaben: Dienstkontakt für alle Praxisrollen, Privatangaben
  nur für die Praxisleitung — und für andere Rollen gar nicht erst
  ausgeliefert (`PROJECT_PRINCIPLES.md` §20, STAFF-001).
- **Ein Verweis erweitert keine Berechtigung.** Ein Link aus einem Gespräch auf
  einen Vorgang gibt keinen zusätzlichen Zugriff (`PROJECT_PRINCIPLES.md` §4.7).

Welche Bereiche bereits angebunden sind und welche als gekennzeichnete Vorschau
laufen, steht in
[`development/ARBEITSBEREICHE.md`](development/ARBEITSBEREICHE.md).

## 7. Produkt- und Architekturprinzipien

Für die Vision besonders relevante Leitlinien. **Verbindliche Details stehen in
`PROJECT_PRINCIPLES.md` und den angenommenen ADRs** — die folgende Liste
definiert nichts neu und ersetzt nichts.

- modularer Monolith
- Online-first
- begrenzter späterer Offline-Modus, nur für konkret definierte Anwendungsfälle
- Mobile-Nutzung als zentraler Nutzungskontext
- Datenschutz und Mandantentrennung von Beginn an
- zentrale Autorisierung in Verbindung mit PostgreSQL Row Level Security
- Auditierbarkeit privilegierter und relevanter fachlicher Aktionen
- EU-/EWR-Verarbeitung bevorzugt — die verbindliche, strengere Fassung steht in
  `PROJECT_PRINCIPLES.md` §3.5 und ADR-002
- menschengeprüfte KI-Ausgaben
- keine unnötige frühzeitige Infrastrukturkomplexität
- keine echten Patientendaten in Entwicklung und Tests
- synthetische Testdaten

## 8. Nicht-Ziele dieses Dokuments

Dieses Dokument ist ausdrücklich **nicht**:

- ein vollständiger Implementierungsplan
- eine Roadmap mit zugesagten Terminen
- eine Freigabe aller beschriebenen Funktionen
- eine Feature-Spezifikation
- eine Erlaubnis für Scope-Erweiterungen
- eine Grundlage, Sicherheits- oder Datenschutzanforderungen zu umgehen
- eine Festlegung auf einen KI-Provider
- ein Auftrag zur Entwicklung einer nativen Mobile-App
- ein Auftrag zur Einführung von Microservices oder Kubernetes
- eine Vorwegnahme eines generischen SaaS-Produkts

---

Für eine konkrete Aufgabe gilt ausschließlich deren Feature-Spezifikation im
Rahmen von `PROJECT_PRINCIPLES.md` und den ADRs. Dieses Dokument erklärt, wohin
es langfristig gehen soll — nicht, was als Nächstes gebaut wird.
