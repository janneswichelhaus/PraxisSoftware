# Offene Entscheidungen

Zuletzt aktualisiert: 2026-09-06 · Struktur 2.0

Dieses Dokument hält fest, **was noch nicht entschieden ist**, warum es offen
ist und was davon abhängt. Es trifft keine Entscheidungen und ändert
`PROJECT_PRINCIPLES.md` nicht. Die Termine, bis wann ein Punkt entschieden sein
muss, stehen in `docs/development/ROADMAP.md`, Spur B.

**Stand:** Alle Architektur-Grundentscheidungen sind getroffen (ADR-001 bis
ADR-016). Offen sind die externen Validierungen vor dem Produktivbetrieb (B1
bis B4), sieben fachliche Punkte für spätere Etappen (B5 bis B11; B7 und B9
seit dem 2026-09-06 teilweise entschieden beziehungsweise erweitert), zwei
Dienstleisterfragen aus dem Review vom 2026-09-06 (B14 teilweise, B15), die
Providerfrage der KI (C6), zwei Betriebsfragen (E2, E10) und die
Ausgestaltung des Terminstatus-Automaten (ADR-018). B12 und B13 sind am
2026-09-06 erledigt beziehungsweise entschieden worden; B7 ist seit demselben
Tag bis auf die Fahrzeiten entschieden. Die fünf Rückfragen E-15 bis E-19 hat
Jannes am 2026-09-06 beantwortet (Historie; Wortlaut in
`docs/development/ROADMAP.md`, „Antworten E-15 bis E-19"). Alles andere ist
entschieden — die Historie steht am Ende.

## Wie dieses Dokument benutzt wird

Ein offener Punkt blockiert keine Aufgabe. Braucht eine Aufgabe eine
Festlegung, die hier offen ist, wird sie als begründete Annahme in
`ASSUMPTIONS.md` getroffen (`PROJECT_PRINCIPLES.md` §15.1). Der Punkt bleibt
hier offen und verweist auf die `ANN`-Kennung, bis er entschieden ist.

1. Ein Punkt wird besprochen und entschieden.
2. Die Entscheidung wird als ADR unter `docs/adr/` festgehalten, wenn sie
   teuer rückgängig zu machen wäre (`docs/adr/README.md`); sonst genügt der
   Vermerk hier mit Datum.
3. Der Punkt wird in der Übersicht auf `entschieden` gesetzt und verweist auf
   das ADR oder den Vermerk.
4. Betrifft die Entscheidung `PROJECT_PRINCIPLES.md`, wird das Dokument in
   einem eigenen Commit mit neuer Version nachgezogen (§21).

Dringlichkeit: **P0** vor dem technischen Setup (alle erledigt) · **P1** vor
dem ersten fachlichen Datenmodell des Bereichs · **P2** vor dem betreffenden
Feature.

---

## Übersicht — alle Punkte

| Punkt | Thema                                                        | Status                                                        | Wo                                                                                                            |
| ----- | ------------------------------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| A1    | Offline-Fähigkeit                                            | entschieden 2026-08-28                                        | [ADR-001](../adr/ADR-001-online-first-limited-offline.md); Mechanismus offen, siehe F                        |
| A2    | Hosting, Datenstandort, Provider                             | entschieden 2026-08-28; **Anbieterprüfung offen**             | [ADR-002](../adr/ADR-002-hosting-data-residency.md), [ADR-015](../adr/ADR-015-initial-technical-stack.md); Roadmap OPS-001 |
| A3    | `organization_id` / `location_id`                            | entschieden 2026-08-28                                        | [ADR-003](../adr/ADR-003-organization-location-model.md)                                                      |
| A4    | Berechtigungsmodell                                          | entschieden 2026-08-28                                        | [ADR-004](../adr/ADR-004-authorization-model.md)                                                              |
| B1    | MDR / EU AI Act                                              | architektonisch entschieden; **externe Prüfung offen**        | [ADR-006](../adr/ADR-006-medical-device-boundary.md); Roadmap G13, Feb 2027                                   |
| B2    | DSFA, DSB, Verzeichnis, TOM, Meldeprozess                    | Prozess entschieden; **Schwellwertprüfung und DSB offen**     | [ADR-007](../adr/ADR-007-data-protection-impact-assessment.md); Roadmap G12                                   |
| B3    | Aufbewahrung und Löschung                                    | entschieden; **Fristen-Validierung offen**, Umsetzung LOE     | [ADR-008](../adr/ADR-008-data-retention-and-deletion.md), ANN-001, ANN-002; Roadmap LOE-EPIC-001              |
| B4    | Abrechnungsmodell                                            | entschieden; **steuerliche Validierung offen**, Fragenliste unten (erweitert 2026-09-06) | [ADR-009](../adr/ADR-009-private-billing-model.md); Roadmap G13, Nov 2026                          |
| B5    | Patientenidentität, Vertretung                               | **offen** (P1 für das Portal)                                 | unten; vor Etappe 4                                                                                           |
| B6    | Beschäftigtendaten: Touren, Leistungskontrolle               | **offen** (P1 für Zeitkonto und Touren)                       | unten; vor ZK-001, TOUR-001; ANN-004 überbrückt das Audit                                                     |
| B7    | Adressdaten an den Kartendienst                              | **entschieden 2026-09-06** (Google-Maps-Link und Karte über Embed API, genehmigt); Fahrzeiten **offen** (P2 für TOUR-EPIC-001b) | unten; ADR-019 (Roadmap G12)                                                    |
| B8    | Lizenzen für Fragebögen und PROMs                            | **offen** (P2)                                                | unten; vor FRB-003                                                                                            |
| B9    | Betreuung ohne und nach Heilbehandlung (Personal Training)   | **offen** (P2), erweitert 2026-09-06                          | unten; vor Etappe 8; Steuerteil mit B4                                                                        |
| B10   | Automatisierte Progression: MDR-Grenze                       | **offen** (P2)                                                | unten; vor Etappe 9                                                                                           |
| B11   | Paketpreise, Vorauszahlung, Anreize                          | **offen** (P2)                                                | unten; vor Etappe 8                                                                                           |
| B12   | Stichtag der Umstellung und Rechnungsnummernkreis            | **erledigt 2026-09-06**: kein Altsystem; Nummernformat → B4   | unten                                                                                                         |
| B13   | E-Mail-Versand aus der Plattform (Einladung, Passwort)       | **entschieden 2026-09-06** durch Jannes (Option a)            | unten; Roadmap G2, G3                                                                                         |
| B14   | PDF-Erzeugung für Rechnungen und Tagesplan                   | Druckansichten **entschieden 2026-09-06**; Rechnungs-PDF **offen** (P1 für ABR-EPIC-002b) | unten; Roadmap ABR-EPIC-002a, Nov 2026                                                            |
| B15   | Terminerinnerung und Online-Terminbuchung: Kanal, Anbieter   | **offen** (P2, Stufe 2 nach der Eröffnung); Anfrage mit B2    | unten                                                                                                         |
| C1    | Leistungsziffern und Office                                  | entschieden 2026-09-05 durch Jannes                           | `PROJECT_PRINCIPLES.md` 0.4 §4.4; Umfang des Nachweises ANN-006                                               |
| C2    | Klinische Inhalte in organisatorischer Kommunikation         | entschieden 2026-09-05 durch Jannes                           | `PROJECT_PRINCIPLES.md` 0.4 §10                                                                               |
| C3    | Fail-closed gegen Patientensicherheit, Break Glass           | entschieden 2026-08-28                                        | [ADR-010](../adr/ADR-010-audit-and-privileged-access.md)                                                      |
| C4    | Auditlog als Kompensation                                    | entschieden 2026-08-28                                        | [ADR-010](../adr/ADR-010-audit-and-privileged-access.md); Betrieb Roadmap G6                                  |
| C5    | Provider-Oberflächen, Admin-Trennung                         | entschieden 2026-08-28                                        | [ADR-010](../adr/ADR-010-audit-and-privileged-access.md)                                                      |
| C6    | AI Privacy Gateway: Schutzumfang und Provider                | Zeitpunkt entschieden; **Schutzumfang und Provider offen**    | [ADR-005](../adr/ADR-005-provider-independent-ai.md); unten; vor Etappe 10                                    |
| C7    | Sprachliche Trennung LLM / deterministische Regeln in §6, §7.1 | architektonisch entschieden; Wortlaut bei nächster Prinzipienversion | [ADR-005](../adr/ADR-005-provider-independent-ai.md); nicht planungsrelevant                             |
| C8    | „Nicht verbauen" gegen „nicht vorbauen"                      | entschieden 2026-08-28                                        | [ADR-014](../adr/ADR-014-foundational-data-model.md)                                                          |
| D     | „finalisiert", „nachvollziehbar"                             | entschieden 2026-09-01                                        | [ADR-016](../adr/ADR-016-clinical-documentation-record.md)                                                    |
| D     | „bestätigt" — Terminstatus-Automat                           | **Umfang entschieden 2026-09-05; ADR-018 ausstehend**         | unten; Roadmap CAL-EPIC-003, Okt 2026; bis dahin ANN-005                                                      |
| D     | übrige Begriffe                                              | erledigt                                                      | „auditierbar" → C4 · „organisatorische Patientenkommunikation" → C2 · „Behandlungsnachweis" → C1, ANN-006 · „Praxisinhaber vs. Admin" → C5 · „technisch getrennt" → ADR-002, Umgebungen in OPS-001 |
| D     | Normativität und Nachweis                                    | Normativität erledigt (0.2, §0); **Nachweistabelle offen**    | Roadmap G12                                                                                                   |
| E1    | Betreibbarkeit bei Bus-Faktor 1                              | entschieden 2026-08-28                                        | [ADR-012](../adr/ADR-012-backup-and-business-continuity.md); Dokumentation Roadmap G7                         |
| E2    | Ausfallkonzept — zugleich Rückfallplan der Eröffnung         | **offen** (P1 vor Go-live)                                    | unten; Roadmap G10 und H4, Jan 2027                                                                           |
| E3    | Backup, RPO/RTO, Restore-Test                                | entschieden 2026-08-28                                        | [ADR-012](../adr/ADR-012-backup-and-business-continuity.md); Roadmap G7                                       |
| E4    | Produktionszugriff                                           | entschieden 2026-08-28                                        | [ADR-010](../adr/ADR-010-audit-and-privileged-access.md)                                                      |
| E5    | Produktions-Logs                                             | entschieden 2026-08-28                                        | [ADR-011](../adr/ADR-011-logging-and-observability.md); Roadmap G8                                            |
| E6    | Synthetische Testdaten                                       | erledigt: der Seed ist der Generator                          | `supabase/seed.sql`; Erweiterung im Loop, der sie braucht                                                     |
| E7    | CI-Gates, Branch Protection                                  | entschieden 2026-08-28                                        | [ADR-013](../adr/ADR-013-ci-cd-and-release-governance.md); Freigabeprozess Roadmap G5                         |
| E8    | Dateiablage                                                  | **in Arbeit: ADR-017**, beauftragt 2026-09-05                 | Roadmap G1, Sep 2026                                                                                          |
| E9    | Dokument-Governance                                          | erledigt mit Version 0.2 (2026-08-28)                         | `PROJECT_PRINCIPLES.md` §21                                                                                   |
| E10   | Wer schreibt Mitarbeiterdaten                                | **offen** (P2)                                                | unten; vor STAFF-EPIC-002; bis dahin `owner`                                                                  |
| E11   | Wer gilt als behandelnde Person                              | erledigt sich mit STAFF-EPIC-002 (Konten in der Anwendung, entschieden 2026-09-05) | unten                                                                                    |

---

## Offene Punkte im Einzelnen

### B4 — Steuerliche Validierung: Fragen an die Steuerberatung

| | |
|---|---|
| Dringlichkeit | P1 — als Annahme vor ABR-EPIC-001, bestätigt vor der ersten ausgestellten Rechnung (ABR-EPIC-002a) |
| Bezug | §19; ADR-009 Punkte 5, 6 und 8; GoBD; B9, B11 |

Das Abrechnungsmodell ist entschieden (ADR-009). Offen ist die steuerliche
Validierung; die Liste wurde am 2026-09-06 um die Punkte erweitert, die aus
der Eröffnung ohne Vorgängersystem und aus dem Personal Training folgen. Sie
geht mit der Anfrage B4 im September an die Steuerberatung:

1. **Leistungsarten und Umsatzsteuer:** Welche Katalogpositionen sind nach
   §4 Nr. 14a UStG befreit (Heilbehandlung auf Verordnung), welche nicht
   (Prävention, Selbstzahler ohne Verordnung, Personal Training)? Wie werden
   gemischte Fälle abgerechnet — getrennte Rechnungen oder eine Rechnung mit
   zwei Steuersätzen?
2. **Kleinunternehmerregelung (§19 UStG) im Eröffnungsjahr:** Nimmt die
   Praxis sie für die steuerpflichtigen Umsätze in Anspruch? Das bestimmt den
   Umsatzsteuer-Status in den Praxisstammdaten (ABR-000) und den Hinweistext
   auf der Rechnung.
3. **Nummernkreis:** Die Praxis eröffnet am 01.07.2027 ohne Vorgängersystem;
   der Nummernkreis beginnt mit der ersten Rechnung. Welches Format (fortlaufend
   je Jahr, mit Jahrespräfix) und welche Anforderungen an Lückenlosigkeit und
   Dokumentation gelten?
4. **Belegfristen und Belegarten** (B3): Rechnungen, Storno- und
   Korrekturdokumente, Zahlungsbelege, Erstattungsbelege.
5. **Export für die Steuerberatung:** gewünschtes Format (CSV, DATEV) für
   Rechnungen und Zahlungen (`IDEA-PRX-026`).
6. **Personal Training** (B9, B11): Umsatzsteuer, Anzahlungen und Pakete,
   getrennte oder gemeinsame Rechnungsstellung mit der Praxis.

Nicht mehr Teil der Anfrage: eine Behandlungsbestätigung oder Unterschrift je
Termin — Jannes hat am 2026-09-06 entschieden, dass keine benötigt wird
(`IDEA-PRX-015`, verworfen).

**Blockiert:** nichts; bis zur Antwort gelten Annahmen in ABR-EPIC-001 und
ABR-EPIC-002a (Registereinträge).

### B5 — Patientenidentität, Identitätsprüfung und Vertretung

| | |
|---|---|
| Dringlichkeit | P1 für das Portal (Etappe 4) |
| Bezug | §4.6 |

**Frage:** Wie authentifizieren sich Patient:innen, wie wird ihre Identität
geprüft, und wer darf in ihrem Namen handeln?

**Warum offen:** §4.6 setzt „ein Patient = ein Account" voraus. In der mobilen
Versorgung sind Betreuer:innen, Bevollmächtigte, Angehörige und Eltern
Minderjähriger der Regelfall. Offen sind außerdem: Identitätssicherheit vor
Akteneinsicht (§630g BGB), Zugangsverfahren für hochbetagte Patient:innen, und
ob der Portalzugang der §630g-Einsicht entspricht — und wenn ja, welche Teile
der Akte sichtbar sind.

**Blockiert:** Identitäts- und Patientenstammdatenmodell für das Portal,
Portal-Design. **Nicht blockiert:** Rechnungsempfänger ≠ Patient:in (ADR-009
regelt den Adressaten der Rechnung, nicht den Zugriff auf die Akte).

### B6 — Beschäftigtendaten: Tourendaten und Leistungskontrolle

| | |
|---|---|
| Dringlichkeit | P1 für Zeitkonto und Touren |
| Bezug | §1, §20 |

**Frage:** Werden Standort-, Touren- und Arbeitszeitdaten für
Leistungsbeurteilung verwendet — ja oder nein?

**Warum offen:** Routenplanung plus Arbeitszeiterfassung erzeugen ein
lückenloses Bewegungs- und Leistungsprofil der Therapeut:innen. §26 BDSG setzt
der Verhaltens- und Leistungskontrolle enge Grenzen. §20 verbietet bereits
Live-Ortung und nennt Auswertungen als offen.

**Blockiert:** Datenmodell und Aufbewahrung für Touren- und Zeitdaten; bei
„nein" ist die Begrenzung technisch umzusetzen (Aggregation, Löschfristen,
kein Live-Tracking). ANN-004 hält Arbeitszeiten bereits aus dem Auditlog heraus.

### B7 — Übermittlung von Adressdaten an den Kartendienst

| | |
|---|---|
| Dringlichkeit | Link und Karte entschieden; Fahrzeiten P2 für TOUR-EPIC-001b |
| Bezug | §9, §18, §20, §3.5; ADR-002, ADR-007 Punkt 2 |

**Entschieden am 2026-09-06 durch Jannes:** Der Kartendienst ist **Google
Maps**. Aus der Anwendung führt immer ein Link zur Navigation in Google Maps
— je Termin und für den ganzen Tag. Die Übermittlung der Adresse für die
Navigation ist datenschutzrechtlich genehmigt; die Entscheidung steht fest.
Umsetzung: Link in UX-EPIC-001 (Adresse ohne Namen, ohne Uhrzeit,
Fahrradmodus; URL-Format und Feldliste als `ANN`), Dokumentation der
Vertrags- und Datenschutzseite in ADR-019 (Roadmap G12), Nennung in der
Datenschutzinformation (PAT-006), DSFA-Wiedervorlage nach ADR-007 Punkt 2
(„wesentliche Änderung der Routing-/Standortverarbeitung").

**Entschieden am 2026-09-06 durch Jannes (E-16) — Datenweg der In-App-Karte:**
Die Karte der Tagesroute läuft über die **Google Maps Embed API** im
eingebetteten Rahmen — derselbe Anbieter wie der Link. Beim Öffnen gehen alle
Adressen eines Tages in einer Anfrage an den Dienst; die zuständige
Datenschutz-Fachkraft hat diesen Weg genehmigt (laut Jannes). Die Genehmigung
wird schriftlich zu den DSFA-Unterlagen gelegt (Roadmap G14, M0). Festgelegt
damit: Karte nur auf ausdrückliche Aktion, nie beim Öffnen einer Seite;
Adressen ohne Namen und ohne Uhrzeit; Schlüssel an die Domain gebunden; kein
Standort der Person, kein Verlauf, keine Speicherung von Routing-Rohdaten
(§18, §20). ADR-019 hält Vertragsgrundlage der Google Maps Platform,
Prüfkatalog aus ADR-002 und Schlüsselverwaltung fest; die Höchstzahl der
Zwischenziele je Anfrage kommt aus der Anbieterdokumentation.

**Noch offen — Fahrzeiten** (TOUR-EPIC-001b): ob Fahrzeiten je Weg aus dem
Dienst abgerufen und kurz gespeichert werden dürfen (§18) und wie sie von
jeder Auswertung je Person getrennt bleiben (B6).

**Endgerät:** Der Link öffnet die Google-Maps-App oder den Browser auf dem
Telefon der Therapeutin. Ein dort angemeldetes privates Google-Konto speichert
Suchen und Wege. Die Endgeräte-Richtlinie (Roadmap G14, BETRIEB-001) regelt
Konto und Verlauf; das ist Teil von ADR-019.

**Blockiert:** nur noch die Fahrzeiten (TOUR-EPIC-001b). **Nicht blockiert:**
der Navigationslink, die In-App-Karte (TOUR-002, nach ADR-019), die
Tourenliste, der Fahrpuffer als Praxisregel (CAL-010).

### B8 — Lizenzen für Fragebögen und PROMs

| | |
|---|---|
| Dringlichkeit | P2 |
| Bezug | §7 |

**Frage:** Ist die digitale Einbettung des DIGOTOR-Anamnesebogens (Version 8 /
07-2026) lizenzrechtlich abgedeckt? Wie werden Lizenzen je Instrument
dokumentiert?

**Warum offen:** Viele etablierte PROMs sind urheberrechtlich geschützt und
für die digitale Nutzung lizenzpflichtig.

**Blockiert:** FRB-003 (Anamnesebogen). **Nicht blockiert:** FRB-001 und
FRB-002 — die Bibliothek trägt ein Lizenzfeld, und die freien Instrumente (NRS,
patientenspezifische Funktionsskala, globale Veränderungsfrage) brauchen keine
Lizenz.

### B9 — Betreuung ohne und nach Heilbehandlung: Rechtsrahmen und Datentrennung

| | |
|---|---|
| Dringlichkeit | P2 — vor dem ersten Feature außerhalb der Heilbehandlung; Steuerteil mit B4 im September anfragen |
| Bezug | §1, §14, §18, §19; ADR-008, ADR-009; `IDEA-LZK-002`, `IDEA-LZK-008` |

**Frage:** Was gilt, wenn eine Person nach Ablauf des Rezepts freiwillig
weiterbetreut wird — und was gilt für Kund:innen des Personal Trainings, die
nie in Heilbehandlung waren?

**Warum offen:** Jannes hat am 2026-09-01 als langfristiges Ziel benannt,
frühere Patient:innen nach abgeschlossenem Rezept weiter zu coachen, und am
2026-09-06 ergänzt, dass die Plattform auch für die Kund:innen seines
Personal Trainings gedacht ist — ohne vorherige Heilbehandlung. Damit ist der
Übergang nicht mehr der einzige Fall: es gibt einen zweiten Eintrittsweg ohne
Verordnung, ohne Behandlungsvertrag und ohne Akte. Für ihn gelten dieselben
Fragen von Anfang an, dazu: ob Personal Training in derselben Praxis oder in
einem eigenen Betrieb läuft (Rechnungen, Umsatzsteuer, Verträge — Frage an
die Steuerberatung mit B4). Entschieden am 2026-09-06 (E-17): Das Personal
Training beginnt ebenfalls am 01.07.2027, es gibt keine Bestandsdaten; die
Plattform dafür ist Stufe 3 nach dem ersten Betriebsmonat; bis dahin werden
Kund:innen nicht als Patient:innen angelegt; `PROJECT_PRINCIPLES.md` §1 wird
nach §21 ergänzt, wenn Stufe 3 beginnt. Beim Übergang und beim Eintritt ohne
Behandlung ändern sich mehrere Dinge gleichzeitig:

- **Vertragsart:** Behandlungsvertrag (§630a BGB) gegenüber Dienstvertrag.
- **Dokumentationspflicht:** §630f BGB gilt für die Heilbehandlung, nicht für
  Training.
- **Aufbewahrung:** ADR-008 knüpft 10 Jahre an den „Abschluss der Behandlung";
  für Trainingsdaten fehlt die Frist.
- **Umsatzsteuer:** Heilbehandlung nach §4 Nr. 14a UStG regelmäßig befreit,
  Prävention und Selbstzahler-Training regelmäßig nicht.
- **DSGVO-Rechtsgrundlage:** Art. 9 Abs. 2 lit. h gegenüber Einwilligung nach
  lit. a, mit Widerruf.
- **Zweckbindung:** Welche Daten dürfen aus der Akte in den Trainingskontext,
  und was passiert in der Gegenrichtung?
- **Berufsrecht:** Reicht die physiotherapeutische Qualifikation, insbesondere
  bei Ernährung (`IDEA-ALT-005`)?

**Blockiert:** Etappe 8 vollständig und das Datenmodell der Betreuungsepisode
(`IDEA-LZK-002`, `IDEA-LZK-003`, `IDEA-LZK-008`); die automatische
Klassifizierung aus `IDEA-LZK-007`; jede Funktion für Kund:innen ohne
Heilbehandlung (Stufe 3). **Nicht blockiert:** die Empfehlung der Therapeutin
zum Verordnungsende als Teil der Verordnung (VER-001); die
Umsatzsteuer-Felder je Katalogposition, die ADR-009 Punkt 6 ohnehin verlangt.

### B10 — Automatisierte Progression: MDR-Grenze und Verantwortung

| | |
|---|---|
| Dringlichkeit | P2 — vor dem ersten Progressionsfeature |
| Bezug | §6, §7.1, §16, §17; ADR-005, ADR-006 |

**Frage:** Darf die Plattform die Belastung eines Trainingsplans selbsttätig
anpassen — und wenn ja, unter welchen Bedingungen?

**Warum offen:** ADR-006 Punkt 4 schließt für V1 Therapieempfehlungen und
automatisierte klinische Entscheidungen aus; Punkt 2 erlaubt transparente
Berechnungen validierter Instrumente. Eine Progressionsregel liegt dazwischen:
Reicht die Freigabe des Regelwerks je Plan durch die Therapeutin, oder braucht
jeder Schritt eine Bestätigung? Ist ein Ampelmodell mit therapeutisch gesetzten
Schwellen eine eigene Risikoklassifikation? Gilt für die Weiterbetreuung (B9)
ein anderer Maßstab?

**Blockiert:** Etappe 9 vollständig. Bis zur Entscheidung ist jedes solche
Feature `MDR_REVIEW_REQUIRED` und produktiv nicht erreichbar. Die Frage gehört
an die externe Prüfung aus B1, nicht in einen Loop. Ausarbeitung:
`docs/product/ideen/01-trainingsplaene-und-progression.md` (nicht normativ).

### B11 — Paketpreise, Vorauszahlung und Anreize

| | |
|---|---|
| Dringlichkeit | P2 — vor dem ersten Paket- oder Rabattfeature |
| Bezug | §19; ADR-009, B4, B9 |

**Frage:** Wie werden vorausbezahlte Betreuungspakete abgebildet, und welche
Rabatt- und Anreizformen sind zulässig?

**Warum offen:** Ein Paket ist eine Vorauszahlung auf noch nicht erbrachte
Leistungen — ein Vorgang, den ADR-009 nicht kennt: Guthabenführung gegen
Leistungen, Steuerzeitpunkt bei Vereinnahmung, keine gemischten Pakete aus
befreiter und steuerpflichtiger Leistung, Laufzeit und Verfall, Rückfall in die
Heilbehandlung, GoBD für das Guthabenkonto, Preisversionierung. Zum
Bewertungsanreiz (Rabatt für eine Google-Bewertung) steht die Einordnung in
`IDEA-ANG-002` mit dem Ergebnis, davon abzuraten — eine Empfehlung, keine
Entscheidung; wenn er trotzdem kommen soll, vorher wettbewerbs- und
heilmittelwerberechtliche Beratung.

**Blockiert:** Paketverkauf, Guthaben, Rabattlogik, Preisdarstellung im Portal.
**Nicht blockiert:** die reguläre Einzelleistungsabrechnung nach ADR-009.

### B12 — Stichtag der Umstellung und Rechnungsnummernkreis

| | |
|---|---|
| Dringlichkeit | erledigt |
| Bezug | §19; ADR-009 (Folgefrage Nummernkreis); GoBD |

**Erledigt am 2026-09-06 durch Jannes:** Es gibt kein altes Werkzeug. Die
Praxis nimmt den Betrieb am 01.07.2027 erstmals auf — ohne
Bestandspatient:innen, ohne laufende Verordnungen, ohne offene Rechnungen,
ohne bisherigen Nummernkreis. Damit entfallen Stichtag, Bestandsdatenübernahme
(MIG-000, MIG-001) und Parallelbetrieb. Der Nummernkreis beginnt mit der
ersten ausgestellten Rechnung; sein **Format** ist eine Frage an die
Steuerberatung und steht jetzt unter B4 (Punkt 3), bis dahin Annahme in
ABR-EPIC-002a.

### B13 — E-Mail-Versand aus der Plattform

| | |
|---|---|
| Dringlichkeit | P1 — vor STAFF-EPIC-002 |
| Bezug | §2.1, §3.5; ADR-002; ADR-012 Punkt 10 |

**Frage:** Über welchen Anbieter versendet die Plattform Transaktions-E-Mails
(Einladung eines Zugangs, Passwort zurücksetzen, später Rechnungsversand)?
Braucht das eine Prüfung nach ADR-002 und einen AVV, oder bleibt die Praxis in
Stufe 1 ohne Versand aus der Plattform (Einladung über die Provider-Oberfläche,
Rechnungsversand aus dem Praxispostfach)?

**Entschieden am 2026-09-06 durch Jannes (Option a der Entscheidung E-4):**
In Stufe 1 versendet die Plattform ausschließlich die **Auth-Mails des
geprüften Providers** — Einladung eines Zugangs, Passwort zurücksetzen. Sie
sind Teil der Providerprüfung OPS-001 (Roadmap G3); ein zweiter Dienstleister
kommt nicht hinzu. Rechnungen und alle anderen Nachrichten an Patient:innen
gehen aus dem Praxispostfach, außerhalb der Plattform; der Rechnungszustand
„versendet" wird von Hand gesetzt. Ein eigener E-Mail-Dienst mit AVV (Option b)
bleibt für Stufe 2 möglich und wäre eine neue Prüfung nach ADR-002.

**Warum das reicht:** Ein E-Mail-Dienst wäre ein neuer Dienstleister mit
Zugang zu personenbezogenen Daten (mindestens Adresse und Rolle der
Mitarbeitenden). Die Auth-Mails laufen beim Provider, der ohnehin geprüft wird.

**Blockiert:** nichts mehr; STAFF-EPIC-002 mit STAFF-004 läuft im Oktober,
sobald OPS-001 die Auth-Mails einschließt.

### B14 — PDF-Erzeugung

| | |
|---|---|
| Dringlichkeit | P1 — vor ABR-EPIC-002b und der Tagesplan-Funktion (E2) |
| Bezug | §19; ADR-009 Punkt 14; ADR-015; `CLAUDE.md` (Abhängigkeiten) |

**Frage:** Wie entsteht das Rechnungsdokument — Browser-Druck aus einer
Druckansicht, eine PDF-Bibliothek im Browser oder eine serverseitige Funktion?
Wo läuft die Erzeugung, welche Abhängigkeit kommt dazu, wie wird das Dokument
unveränderbar abgelegt (ADR-017)?

**Teilweise entschieden am 2026-09-06 durch Jannes (E-5):** Druckansichten
mit `@media print` für Tagesplan, Terminzettel und Tourenliste kommen sofort
(UI-000 Druck-Basis) — keine Abhängigkeit, kein neuer Ausführungsort. Für die
unveränderbare Rechnung legt der Loop ABR-EPIC-002a die Optionen mit Aufwand
vor (Browser-Druck in PDF, Bibliothek im Browser, serverseitige Funktion);
Jannes entscheidet dann, im November 2026.

**Warum der Rest offen bleibt:** Eine wesentliche Abhängigkeit oder ein neuer
Ausführungsort ist nach §15.1 ein Stopp, nicht eine Annahme.

**Blockiert:** ABR-003b. **Nicht blockiert:** Tagesplan drucken, Terminzettel,
Tourenliste.

### B15 — Terminerinnerung und Online-Terminbuchung

| | |
|---|---|
| Dringlichkeit | P2 — Stufe 2 |
| Bezug | §2.1, §3.5, §8, §10; ADR-002; ADR-007 |

**Frage:** Über welchen Kanal erinnert die Praxis an Termine (SMS, E-Mail,
Messenger, Anruf) und mit welchem Anbieter; welche Einwilligung braucht das
(PAT-006); soll es eine Online-Terminanfrage geben, und wenn ja, im Portal
(Etappe 4) oder davor?

**Warum offen:** Die Wettbewerbsanalyse vom 2026-09-06 zeigt Terminerinnerung
und Online-Buchung als Marktstandard. Beides ist ein neuer Dienstleister mit
Gesundheitsdaten (dass jemand einen Physiotherapietermin hat) und braucht
Prüfung nach ADR-002 und eine Einwilligung. Für Stufe 1 bleibt die Anrufliste
der Weg (`IDEA-PRX-005`).

**Termin (E-9, 2026-09-06):** Stufe 2 nach der Eröffnung. Die Frage geht mit
der Anfrage B2 im September an die Datenschutzberatung; Entscheidung bis M6
(31.07.2027), erster Loop danach.

**Blockiert:** jede Erinnerungs- oder Buchungsfunktion. **Nicht blockiert:**
Anrufliste, Terminzettel als PDF.

### C6 — AI Privacy Gateway: Schutzumfang und Provider

| | |
|---|---|
| Dringlichkeit | P1 für das erste KI-Feature (Etappe 10) |
| Bezug | §6.1; ADR-005 |

**Frage:** Welchen Schutz leistet Pseudonymisierung bei klinischem Freitext,
dessen Inhalt die Person identifiziert — und welche vertraglichen Zusagen
(keine Nutzung zu Trainingszwecken, EU-Verarbeitung, kurze Aufbewahrung,
§203-Verpflichtung) treten an ihre Stelle? Welcher Anbieter, welches Modell?

**Warum offen:** ADR-005 hat den Zeitpunkt entschieden (Gateway ab dem ersten
Feature, kein direkter Provideraufruf), nicht den Schutzumfang. Die
Produktionshypothese in `PRODUCT_VISION.md` §6 ist eine Arbeitshypothese.

**Blockiert:** Etappe 10. Die Freischaltung eines Providers löst die Prüfung
nach ADR-002 und eine DSFA-Wiedervorlage aus (ADR-007).

### D — „bestätigt": der Terminstatus-Automat

| | |
|---|---|
| Dringlichkeit | P1 — vor der Leistungserfassung (ABR-002) |
| Bezug | §8; ADR-009 (Ausfallhonorar, „durchgeführt" als abrechenbares Ereignis) |

**Entschieden am 2026-09-05 durch Jannes — Umfang:** der vollständige
Zustandsautomat: angefragt · vorgemerkt · bestätigt · abgesagt · nicht
angetroffen · durchgeführt · dokumentiert · abgerechnet. Nicht die
Minimalvariante (nur „nicht angetroffen").

**Noch offen — Ausgestaltung, als ADR-018 in CAL-EPIC-003:** Übergänge und wer
sie auslöst; Migration der heutigen Status (geplant, abgesagt, abgeschlossen);
ob „angefragt" und „vorgemerkt" vor dem Portal überhaupt erreichbar sind oder
nur vorgesehen werden; „dokumentiert" aus der Finalisierung (ADR-016) und
„abgerechnet" aus ABR-003 abgeleitet oder gesetzt; Ausfallhonorar als
Kennzeichen an „nicht angetroffen"; Terminserien (CAL-007) und ihr Verhältnis
zum Status je Termin. Bis ADR-018 vorliegt, gilt ANN-005 (Abschluss ohne
Dokumentationspflicht). Danach ist `PROJECT_PRINCIPLES.md` §8 nachzuziehen
(§21).

### E2 — Ausfallkonzept

| | |
|---|---|
| Dringlichkeit | P1 vor Go-live |
| Bezug | §16; ADR-012 Punkte 8 und 9 |

**Frage:** Was macht die Praxis, wenn die Anwendung einen Tag steht —
exportierter Tagesplan, Papier-Fallback, Erreichbarkeit der Patient:innen?

**Warum offen:** ADR-012 verlangt ein dokumentiertes Degraded-Verfahren und
dass Kerninformationen des Arbeitstags auch bei einem mehrstündigen Ausfall
verfügbar sind, lässt den Inhalt aber offen. Das ist ein Praxisprozess mit
einer Minimalfunktion der Software (Tagesplan druck- und exportierbar).

**Seit dem 2026-09-06 zusätzlich:** Weil es kein Altsystem gibt, ist dieser
Papierprozess auch der Rückfallplan der Eröffnung (Roadmap H4) — Tagesplan mit
Adressen und Telefonnummern, Dokumentation auf Papier mit Nachtrag, Rechnung
von Hand mit fortlaufender Nummer.

**Blockiert:** Go-live-Abnahme (Roadmap G10, G18).

### E10 — Wer verwaltet Mitarbeiterdatensätze

| | |
|---|---|
| Dringlichkeit | P2 — vor STAFF-EPIC-002 |
| Bezug | §4.1, §4.3, §4.5 |

**Frage:** Dürfen neben `owner` auch Office („Mitarbeiterorganisation", §4.3)
und Teamleitung („Mitarbeiterplanung" als mögliches Zusatzrecht, §4.5)
Mitarbeiterdaten anlegen, ändern und den Beschäftigungsstatus wechseln?

**Warum offen:** Für den schreibenden Zugriff liegt nur für den Praxisinhaber
eine verbindliche Aussage vor. STAFF-001 folgt bis zur Entscheidung §13 („im
Zweifel blockieren"): Schreiben nur `owner`, Lesen für alle Praxisrollen.

**Blockiert:** nichts; STAFF-EPIC-002 übernimmt bis zur Entscheidung dieselbe
Annahme für Konten und Rollen.

### E11 — Wer gilt als behandelnde Person

| | |
|---|---|
| Dringlichkeit | P2 |
| Bezug | §4.2, ADR-014 |

**Stand:** Zuordenbar für Termine ist, wer aktiv beschäftigt ist **und** einen
eigenen aktiven Zugang mit therapeutischer Rolle besitzt (aus CAL-001). Eine
neu angelegte Therapeutin ohne Zugang kann deshalb weder eingeplant werden
noch Arbeitszeiten erhalten.

**Erledigt sich mit STAFF-EPIC-002** (entschieden 2026-09-05: Konten und
Rollen werden in der Anwendung verwaltet): Wer einen Mitarbeiterdatensatz
anlegt, lädt in derselben Oberfläche den Zugang ein und vergibt die Rolle. Die
Kopplung an den Zugang bleibt damit bewusst bestehen — ein Konto ist nach §4.2
ohnehin Pflicht. Sollte sich das im Praxisbetrieb als hinderlich erweisen
(Vertretung ohne Konto), wird der Punkt wieder geöffnet.

---

## F. Folgefragen aus den ADRs mit Planungsrelevanz

Jeder ADR führt „Offene Folgefragen". Die meisten beantworten sich im Loop, der
das Thema baut. Die folgenden sind planungsrelevant, weil ohne sie ein Paket
aus der Roadmap nicht abgeschlossen werden kann.

| Frage                                                                                                          | ADR              | Beantwortet in                                    |
| -------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------- |
| Wer führt die Anbieterprüfung durch, wo wird sie dokumentiert, wie oft wiederholt?                             | ADR-002          | OPS-001 (Roadmap G3)                              |
| Ist externes Error-Tracking zulässig, und wie werden Redaction-Regeln erzwungen und getestet?                  | ADR-002, ADR-011 | OPS-004 (G8)                                      |
| Wie wird „keine Produktionsdaten in Dev/Test" technisch abgesichert?                                           | ADR-002          | OPS-001, OPS-002                                  |
| Frontend-Hosting und dessen Prüfung; `service_role` nie im Browser; freigegebener Stand, Nachweis der Freigabe | ADR-015, ADR-013 | OPS-002 (G5)                                      |
| Kritische Änderung, Review-Checkliste, Schweregrade im Dependency-Scan                                         | ADR-013          | OPS-002 (G5)                                      |
| Backup-Lebenszyklus, Notfallzugang, Restore-Dokumentation, Degraded-Kerninformationen                          | ADR-012          | OPS-003 (G7), E2 (G11)                            |
| Wer liest Auditlogs; Schwelle „größerer Export"; Eskalation beim Report; Audit gelöschter Bezugsdaten          | ADR-010          | OPS-005 (G6), LOE-002                             |
| Wie werden Berechtigungsänderungen protokolliert; Umgehungsschutz des Policy-Layers                            | ADR-004          | STAFF-EPIC-002 (Rollenänderungen), OPS-005        |
| „Abschluss der Behandlung": manuell, durch Zeitablauf, oder beides                                             | ADR-008          | LOE-001 als Annahme; Anker Verordnungsende (VER-001) |
| Löschnachweis nach Restore; Legal-Hold-Rechte; Teamchat rollierend löschen; Dateien in mehreren Kontexten      | ADR-008          | LOE-002, TEAM-001, ADR-017                        |
| Rechtsgrundlage je Verarbeitung und Einwilligungsmodell; Betroffenenrechte technisch; Wiedervorlage koppeln     | ADR-007          | PAT-006 (G9), OPS-006 (G10), G12; Skill-Schritt A prüft die acht Ereignisse |
| Nummernkreis, Snapshot-Felder, Storno-Kette, Empfängertypen, Override-Rechte, „überfällig" ohne Mahnwesen       | ADR-009          | ABR-EPIC-002                                      |
| Abrechenbare Ereignisse neben Terminen; Katalog global oder je Organisation; Datentyp für Geldwerte            | ADR-009, ADR-003, ADR-014 | ABR-001 (Annahme: nur Termine in V1)      |
| Zeitzonen bei wiederkehrenden Terminen und Kalenderjahr-Fristen                                                | ADR-014          | CAL-007, LOE-001                                  |
| Speicherort und Retention von Dateien                                                                          | ADR-015, ADR-008 | ADR-017 (G1)                                      |
| Begründung als Pflichtfeld; Frist bei Hausbesuchen am Freitag; Azubi-Rolle                                     | ADR-016          | ANN-008 nach Praxiserfahrung; Rolle in STAFF-EPIC-002 |
| Wer pflegt die Zweckbestimmung; wo wird `MDR_REVIEW_REQUIRED` geführt; Cutoff-Anzeige als Klassifikation?      | ADR-006          | G12/G13 (Dokument); FRB-002 (Cutoff, bis dahin nicht anzeigen) |
| Offline: Felder, Unsynchronisiert-Dauer, Konfliktauflösung, Geräteanforderungen, Audit offline                 | ADR-001          | Tagesplan-Cache lesend als `ANN` in UX-EPIC-001 (E-12); vollständiger Offline-ADR vor einem späteren Offline-Loop |
| Kartendienst: Anbieter, Datenweg, Vertragsgrundlage, Endgerät                                                  | ADR-002, §9, §20 | ADR-019 (Roadmap G12); B7                          |
| KI: Provider, Zweck → erlaubte Felder, Protokollierung, Nachweis der Freigabe                                  | ADR-005          | C6, Etappe 10                                     |
| Minimale Struktur für Vertreterzugriffe                                                                        | ADR-014          | B5                                                |

---

## Historie

- **2026-08-28:** Baseline-Review von `PROJECT_PRINCIPLES.md` 0.1 mit den
  Punkten A1 bis A4, B1 bis B8, C1 bis C8, D, E1 bis E9. Am selben Tag
  entschieden: A1 bis A4, B1 bis B4 (architektonisch), C3, C4, C5, C8, E1, E3,
  E4, E5, E7 — ADR-001 bis ADR-014; ADR-015 legt den Stack fest. Prinzipien
  0.2 führen Normativität (§0) und Governance (§21) ein.
- **2026-09-01:** ADR-016 entscheidet „finalisiert" und „nachvollziehbar".
  B9, B10, B11 kommen aus dem Brainstorming zur Betreuungsplattform hinzu.
- **2026-09-04:** E10 und E11 aus STAFF-001; Prinzipien 0.3 (§15.1 Annahmen).
- **2026-09-05:** C1 und C2 durch Jannes entschieden (Prinzipien 0.4). Im
  Planungsreview: Terminstatus-Automat vollständig (ADR-018 ausstehend),
  Dateiablage als ADR-017 beauftragt, Konten in der Anwendung (E11),
  Zieltermin Q1 2027, Verordnungen vor Abrechnung, Vorschaubereiche bleiben.
  Dieses Dokument auf Struktur 2.0 verschlankt; die Volltexte der
  entschiedenen Punkte stehen in der Git-Historie bis Commit `23d71e5`.
- **2026-09-06:** B12 bis B15 aus dem Roadmap-Review und der
  Wettbewerbsanalyse (Review in der Git-Historie, Commit `7ab6f71`):
  Stichtag und Nummernkreis, E-Mail-Versand, PDF-Erzeugung, Terminerinnerung.
- **2026-09-06, Antworten von Jannes auf die Entscheidungen E-1 bis E-14 des
  Reviews:** E-1 Roadmap 2.1 als Rahmen · E-2 UI-000 und UX-EPIC-001 direkt
  nach VER-EPIC-001 · E-3 Loops geteilt (ADR-018 als Docs-Session, CAL-EPIC-003
  a/b, ABR-EPIC-002 a/b, ABR-EPIC-003) · E-4 E-Mail nur über die Auth-Mails des
  Providers (B13 entschieden) · E-5 Druckansichten sofort, Rechnungs-PDF in
  ABR-EPIC-002a entscheiden (B14 teilweise) · E-6 STAFF-EPIC-002 mit STAFF-004
  im Oktober · E-7 **kein altes Werkzeug — die Praxis eröffnet am 01.07.2027**;
  Stabilisierung ist der erste Betriebsmonat, kein Parallelbetrieb (B12
  erledigt) · E-8 axe als Dev-Abhängigkeit · E-9 Textbausteine und
  Zahlungserinnerung in Stufe 1, Warteliste und Terminerinnerung in Stufe 2
  (B15 mit B2 anfragen) · E-10 Wochenupdate-Prompt umgestellt · E-11
  Optimierungsrunden mit Zusatzkriterium im Gate · E-12 Tagesplan-Cache als
  Story in UX-EPIC-001 · E-13 **keine Unterschrift und keine
  Behandlungsbestätigung nötig** (`IDEA-PRX-015` verworfen) · E-14 vorerst keine
  Nachrecherche. Dazu drei Vorgaben: Navigation über **Google Maps** ist
  entschieden und datenschutzrechtlich genehmigt (B7 teilweise, ADR-019); eine
  **Karte der Tagesroute** gehört zum Lastenrad-Hausbesuchskonzept
  (TOUR-EPIC-001a); eine **Plattform für Patient:innen und
  Personal-Training-Kund:innen** gehört zum Zielbild (B9 erweitert,
  `IDEA-LZK-008`, Stufe 3).
- **2026-09-06, Antworten von Jannes auf die Rückfragen E-15 bis E-19:** E-15
  **die Reihenfolge der Umsetzung ist verbindlich, der Kalender nachrangig**;
  Themen dürfen früher kommen (Roadmap „Sessions starten") · E-16 In-App-Karte
  über die **Google Maps Embed API**, die zuständige Datenschutz-Fachkraft
  hat genehmigt (B7 entschieden bis auf die Fahrzeiten) · E-17 Personal
  Training beginnt ebenfalls am 01.07.2027, keine Bestandsdaten; Stufe 3 nach
  M6, §1 der Prinzipien wird dann ergänzt · E-18 der Referenz-Screenshot ist
  ein fremdes Produkt; Jannes will dessen Funktionsumfang nachbauen · E-19
  Reihenfolge der Stufe 3 wie vorgeschlagen.
