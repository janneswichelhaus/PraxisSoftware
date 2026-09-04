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
- später optional digitales Training beziehungsweise Online-Coaching nach
  Therapieende

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
- später gegebenenfalls Angehörige oder rechtliche beziehungsweise
  bevollmächtigte Vertreter:innen

**Patient, Person, Mitarbeiter und Auth-Account sind unterschiedliche
fachliche Entitäten und dürfen nicht gleichgesetzt werden.** Diese Trennung ist
kein Zielbild, sondern bereits verbindlich
([ADR-014](adr/ADR-014-foundational-data-model.md)); die Rollen und ihre
Sichtbarkeiten regelt `PROJECT_PRINCIPLES.md` §4 zusammen mit
[ADR-004](adr/ADR-004-authorization-model.md).

## 4. Patientenportal

Langfristiges Zielbild:

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

Nach Abschluss einer Therapie könnte das Portal langfristig die Grundlage für
ein optionales digitales Trainings- oder Online-Coaching-Angebot sein. Auch das
ist **nur eine Produktoption und kein freigegebener Scope**.

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
