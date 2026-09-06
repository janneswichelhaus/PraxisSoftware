# Offene Entscheidungen

Zuletzt aktualisiert: 2026-09-06 · Struktur 2.0

Dieses Dokument hält fest, **was noch nicht entschieden ist**, warum es offen
ist und was davon abhängt. Es trifft keine Entscheidungen und ändert
`PROJECT_PRINCIPLES.md` nicht. Die Termine, bis wann ein Punkt entschieden sein
muss, stehen in `docs/development/ROADMAP.md`, Spur B.

**Stand:** Alle Architektur-Grundentscheidungen sind getroffen (ADR-001 bis
ADR-016). Offen sind die externen Validierungen vor dem Produktivbetrieb (B1
bis B4), sieben fachliche Punkte für spätere Etappen (B5 bis B11), vier
Einführungs- und Dienstleisterfragen aus dem Review vom 2026-09-06 (B12 bis
B15), die Providerfrage der KI (C6), zwei Betriebsfragen (E2, E10) und die
Ausgestaltung des Terminstatus-Automaten (ADR-018). Alles andere ist
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
| B4    | Abrechnungsmodell                                            | entschieden; **steuerliche Validierung offen**                | [ADR-009](../adr/ADR-009-private-billing-model.md); Roadmap Nov 2026                                          |
| B5    | Patientenidentität, Vertretung                               | **offen** (P1 für das Portal)                                 | unten; vor Etappe 4                                                                                           |
| B6    | Beschäftigtendaten: Touren, Leistungskontrolle               | **offen** (P1 für Zeitkonto und Touren)                       | unten; vor ZK-001, TOUR-001; ANN-004 überbrückt das Audit                                                     |
| B7    | Adressdaten an den Kartendienst                              | **offen** (P2)                                                | unten; vor TOUR-001                                                                                           |
| B8    | Lizenzen für Fragebögen und PROMs                            | **offen** (P2)                                                | unten; vor FRB-003                                                                                            |
| B9    | Betreuung nach Therapieende                                  | **offen** (P2)                                                | unten; vor Etappe 8                                                                                           |
| B10   | Automatisierte Progression: MDR-Grenze                       | **offen** (P2)                                                | unten; vor Etappe 9                                                                                           |
| B11   | Paketpreise, Vorauszahlung, Anreize                          | **offen** (P2)                                                | unten; vor Etappe 8                                                                                           |
| B12   | Stichtag der Umstellung und Rechnungsnummernkreis            | **offen** (P1 für ABR-EPIC-002a und MIG-001)                  | unten; Review 2026-09-06                                                                                      |
| B13   | E-Mail-Versand aus der Plattform (Einladung, Passwort)       | **offen** (P1 für STAFF-EPIC-002)                             | unten; Review 2026-09-06                                                                                      |
| B14   | PDF-Erzeugung für Rechnungen und Tagesplan                   | **offen** (P1 für ABR-EPIC-002b, E2)                          | unten; Review 2026-09-06                                                                                      |
| B15   | Terminerinnerung und Online-Terminbuchung: Kanal, Anbieter   | **offen** (P2, Stufe 2)                                       | unten; Review 2026-09-06                                                                                      |
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
| E2    | Ausfallkonzept                                               | **offen** (P1 vor Go-live)                                    | unten; Roadmap G11, Jan 2027                                                                                  |
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
| Dringlichkeit | P2 |
| Bezug | §9 |

**Frage:** Werden Klarnamen und Adressen an den Kartendienst gesendet, oder
nur Koordinaten aus einem lokal gepflegten Geocoding-Cache?

**Warum offen:** Eine Patientenadresse an einen Kartenanbieter zu senden
offenbart, dass dort jemand physiotherapeutisch behandelt wird. Das ist eine
Übermittlung besonderer Kategorien personenbezogener Daten und erfordert AVV,
§203-Verpflichtung, Prüfung nach ADR-002 und eine DSFA-Wiedervorlage (ADR-007).

**Blockiert:** TOUR-001, jede Routing-Integration.

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

### B9 — Betreuung nach Therapieende: Rechtsrahmen und Datentrennung

| | |
|---|---|
| Dringlichkeit | P2 — vor dem ersten Feature außerhalb der Heilbehandlung |
| Bezug | §1, §18, §19; ADR-008, ADR-009 |

**Frage:** Was gilt, wenn eine Person nach Ablauf des Rezepts freiwillig
weiterbetreut wird — online oder in der Praxis?

**Warum offen:** Jannes hat am 2026-09-01 als langfristiges Ziel benannt,
frühere Patient:innen nach abgeschlossenem Rezept weiter zu coachen. Beim
Übergang ändern sich mehrere Dinge gleichzeitig:

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
(`IDEA-LZK-002`, `IDEA-LZK-003`); die automatische Klassifizierung aus
`IDEA-LZK-007`. **Nicht blockiert:** die Empfehlung der Therapeutin zum
Verordnungsende als Teil der Verordnung (VER-001).

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
| Dringlichkeit | P1 — vor der ersten ausgestellten Rechnung (ABR-EPIC-002a) und der Bestandsdatenübernahme (MIG-001) |
| Bezug | §19; ADR-009 (Folgefrage Nummernkreis); GoBD |

**Frage:** Werden die bisherigen Rechnungsnummern fortgeführt oder beginnt zum
Stichtag ein neuer, dokumentierter Nummernkreis? Welche Vorgänge bleiben im
bisherigen Werkzeug (Rechnungen vor dem Stichtag, offene Posten als Saldo), und
wie lange bleibt es für die Restfrist lesbar?

**Warum offen:** Das Review vom 2026-09-06 hat festgestellt, dass die Planung
keine Bestandsdatenübernahme kannte. Ohne Stichtagsregel gibt es zwei
Nummernkreise oder eine Lücke — beides ist nach GoBD erklärungsbedürftig.
Aufgenommen im Review 2026-09-06 (Delivery-Befund 14).

**Blockiert:** MIG-001, die Nummernvergabe in ABR-003. **Nicht blockiert:**
alles davor; bis zur Entscheidung Annahme „neuer Kreis ab Stichtag".

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

**Warum offen:** Ein E-Mail-Dienst ist ein neuer Dienstleister mit Zugang zu
personenbezogenen Daten (mindestens Adresse und Rolle der Mitarbeitenden). Die
Roadmap 2.0 nannte ihn nicht. Aufgenommen im Review 2026-09-06 (Delivery-Befund
10).

**Blockiert:** STAFF-004 (Passwort vergessen als Selbstbedienung) und den
Rechnungszustand „versendet". **Nicht blockiert:** STAFF-002/003 mit Einladung
über die Provider-Oberfläche als Übergang.

### B14 — PDF-Erzeugung

| | |
|---|---|
| Dringlichkeit | P1 — vor ABR-EPIC-002b und der Tagesplan-Funktion (E2) |
| Bezug | §19; ADR-009 Punkt 14; ADR-015; `CLAUDE.md` (Abhängigkeiten) |

**Frage:** Wie entsteht das Rechnungsdokument — Browser-Druck aus einer
Druckansicht, eine PDF-Bibliothek im Browser oder eine serverseitige Funktion?
Wo läuft die Erzeugung, welche Abhängigkeit kommt dazu, wie wird das Dokument
unveränderbar abgelegt (ADR-017)?

**Warum offen:** Eine wesentliche Abhängigkeit oder ein neuer Ausführungsort
ist nach §15.1 ein Stopp, nicht eine Annahme. Aufgenommen im Review 2026-09-06
(Delivery-Befund 5). Empfehlung im Review: Druckansicht mit `@media print` für
Tagesplan und Terminzettel sofort (keine Abhängigkeit); für die
unveränderbare Rechnung die Optionen mit Aufwand im Loop ABR-EPIC-002a
vorlegen.

**Blockiert:** ABR-003b. **Nicht blockiert:** Tagesplan drucken, Terminzettel.

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

**Blockiert:** Go-live-Abnahme (Roadmap G11, G15).

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
| Offline: Felder, Unsynchronisiert-Dauer, Konfliktauflösung, Geräteanforderungen, Audit offline                 | ADR-001          | eigener ADR vor dem Offline-Loop (nach TOUR-001)  |
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
  Wettbewerbsanalyse (`docs/development/ROADMAP-REVIEW-2026-09-06.md`):
  Stichtag und Nummernkreis, E-Mail-Versand, PDF-Erzeugung, Terminerinnerung.
