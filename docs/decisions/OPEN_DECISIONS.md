# Offene Entscheidungen

Zuletzt aktualisiert: 2026-09-23 · Struktur 4.0

Was noch nicht entschieden ist, warum es offen ist und was davon abhängt.
Was ein Punkt aufhält: `docs/development/ROADMAP.md`, „Entscheidungen und Prüfungen" — **Termine gibt es keine**; die externen Anfragen gehen ab Anfang 2027 parallel zum Bauen hinaus. Die Volltexte der acht Punkte für
externe Stellen stehen in `ANFRAGEN.md`.

## Wie dieses Dokument benutzt wird

**Dieses Dokument hat keinen Rang.** Es entscheidet nichts; was hier offen ist,
gilt in keinem Dokument als entschieden, und was hier als entschieden vermerkt
ist, hat seine Fundstelle in einem ADR, in `PROJECT_PRINCIPLES.md` oder als
Vermerk mit Datum hier. Ein offener Punkt blockiert keine Aufgabe: Was eine
Aufgabe braucht, wird als begründete Annahme in `ASSUMPTIONS.md` getroffen
(§15.1); der Punkt bleibt offen und verweist auf die `ANN`-Kennung.

**`vorläufig entschieden (Jannes)`** ist der Status für Punkte, die eine externe
Stelle bestätigen soll: Jannes ist der Verantwortliche nach Art. 4 Nr. 7 DSGVO,
die externen Stellen prüfen seine Festlegung, sie treffen sie nicht für ihn. Für
das Bauen zählt der Status wie `entschieden`, für die Freigabe wie `offen` — das
Go-live-Gate (M3) verlangt, dass kein Datenschutz- oder Rechtspunkt mehr auf
`offen` oder `vorläufig entschieden` steht. Jeder solche Eintrag nennt den Preis
der Rücknahme (`klein`, `mittel`, `groß`). Nicht so entscheidbar sind B8 (eine
Auskunft, keine Entscheidung), die externe MDR-Prüfung selbst (§17, ADR-006
Punkt 7 — MUSS) und das Vorliegen der sieben Dokumente aus ADR-007 Punkt 5.

**Kennungen:** `E12`, `E13` … (ohne Bindestrich) sind offene Punkte dieses
Dokuments, `E-20` und `E-21` (mit Bindestrich) Rückfragen des Roadmap-Reviews vom
2026-09-06 — beantwortet. `E-1` bis `E-7` in `../development/UMBAU.md` sind
Jannes' Entscheidungen vom 2026-09-23, eine eigene Reihe. Erledigte Punkte behalten
Überschrift und Verweis (Volltext: Git-Historie bis `7160fd5`). Dringlichkeit:
**P1** vor dem ersten fachlichen Datenmodell des Bereichs, **P2** vor dem
Feature, **P3** später.

---

## Übersicht — alle Punkte

| Punkt | Thema | Status | Wo |
| ----- | ------------------------------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| A1 | Offline-Fähigkeit | entschieden 2026-08-28 | [ADR-001](../adr/ADR-001-online-first-limited-offline.md); Mechanismus offen, siehe F |
| A2 | Hosting, Datenstandort, Provider | entschieden 2026-08-28; **Anbieterprüfung offen** | [ADR-002](../adr/ADR-002-hosting-data-residency.md), [ADR-015](../adr/ADR-015-initial-technical-stack.md); Roadmap G3 (OPS-001); unten |
| A3 | `organization_id` / `location_id` | entschieden 2026-08-28 | [ADR-003](../adr/ADR-003-organization-location-model.md) |
| A4 | Berechtigungsmodell | entschieden 2026-08-28 | [ADR-004](../adr/ADR-004-authorization-model.md) |
| B1 | MDR / EU AI Act | Zweckbestimmung **vorläufig entschieden 2026-09-08**; **externe Prüfung offen** | [ADR-006](../adr/ADR-006-medical-device-boundary.md); Roadmap G15; Volltext: `ANFRAGEN.md` § B1 |
| B2 | DSFA, DSB, Verzeichnis, TOM, Meldeprozess | Prozess entschieden; DSB **vorläufig entschieden 2026-09-08** (ja); Schwellwertprüfung offen | [ADR-007](../adr/ADR-007-data-protection-impact-assessment.md); Roadmap G14 |
| B3 | Aufbewahrung und Löschung | entschieden; **Fristen-Validierung offen**; Umsetzung LOE-EPIC-001 fertig 2026-09-11 | [ADR-008](../adr/ADR-008-data-retention-and-deletion.md); unten (Annahmen); Roadmap LOE-EPIC-001 |
| B4 | Abrechnungsmodell | entschieden; vier Festlegungen **vorläufig entschieden 2026-09-08**; **steuerliche Validierung offen** | [ADR-009](../adr/ADR-009-private-billing-model.md); Roadmap G13; Volltext: `ANFRAGEN.md` § B4 |
| B5 | Patientenidentität, Vertretung | Rahmen **vorläufig entschieden 2026-09-08**; Verfahren **offen** (P1 für das Portal) | vor Etappe 4; Volltext: `ANFRAGEN.md` § B5 |
| B6 | Beschäftigtendaten: Touren, Leistungskontrolle | **vorläufig entschieden 2026-09-08: nein** | vor ZK-001 und MAP-006; ANN-004 überbrückt das Audit |
| B7 | Adressdaten an den Kartendienst | Handoff nicht blockiert; Karte und Fahrzeiten: **Weg C** — PTV Developer als Kandidat (ADR-019 Fassung 2, 2026-09-08); **E-20 erledigt 2026-09-13** (Fassung 2 angenommen), Gate **offen** | ADR-019, `providerpruefung-kartendienst.md` (Roadmap G12); überholte Stände im Archiv |
| B8 | Lizenzen für Fragebögen und PROMs | Nutzung **bestätigt durch Jannes 2026-09-19**; schriftlicher Beleg des Lizenzgebers bleibt offen (M3) | vor FRB-003 |
| B9 | Betreuung ohne und nach Heilbehandlung (Personal Training) | **vollständig vorläufig entschieden**: ein Unternehmen (2026-09-07), die sechs übrigen Fragen (2026-09-08); **Punkt 6 neu 2026-09-22**: Ernährung als Protokoll und Zielwert gehört zu V1 | Roadmap ALT-EPIC-002, KND-EPIC-001; Steuerteil mit B4; Volltext: `ANFRAGEN.md` § B9 |
| B10 | Automatisierte Progression: MDR-Grenze | **vorläufig entschieden 2026-09-08**; Bestätigung mit B1 | vor Etappe 9; Volltext: `ANFRAGEN.md` § B10 |
| B11 | Paketpreise, Vorauszahlung, Anreize | **neu entschieden 2026-09-22**: Training als Paket, Plattform darin enthalten; Portal-Abo der Patient:innen als Monatsrechnung | Roadmap ANG-EPIC-001/002; Steuer mit B4; Volltext: `ANFRAGEN.md` § B11 |
| B12 | Stichtag der Umstellung und Rechnungsnummernkreis | **erledigt 2026-09-06**: kein Altsystem; Nummernformat → B4 | — |
| B13 | E-Mail-Versand aus der Plattform (Konten, Patient:innen) | **wieder offen seit 2026-09-21**: Option a (nur Auth-Mails des Providers) trägt nicht (BEF-026); Empfehlung eigener SMTP-Anbieter | unten; Roadmap „Bei Jannes", R8 |
| B14 | PDF-Erzeugung für Rechnungen und Tagesplan | Druckansichten **entschieden 2026-09-06**; Rechnungs-PDF **entschieden 2026-09-19**: Weg 1 jetzt, Weg 3 nach OPS-001 | unten; [`rechnungs-pdf-optionen.md`](rechnungs-pdf-optionen.md) |
| B15 | Terminerinnerung und Online-Terminbuchung: Kanal, Anbieter | **neu entschieden 2026-09-22**: automatische Erinnerung und Online-Anfrage gehören zu V1, gebaut hinter Adapter; Anbieter offen · Terminmail aus dem eigenen Postfach gebaut (CAL-013, ANN-041) | unten |
| B16 | Hosting der Oberfläche (Test-Umgebung, später Produktion) | **entschieden 2026-09-23**: Uberspace; Konten stehen seit 2026-09-25 | unten; [`hosting-optionen.md`](hosting-optionen.md) |
| C1 | Leistungsziffern und Office | entschieden 2026-09-05 durch Jannes; **überholt durch E15 (2026-09-13)** | `PROJECT_PRINCIPLES.md` 0.4 §4.4; Umfang des Nachweises ANN-006 (mit E15 verworfen); siehe E15 |
| C2 | Klinische Inhalte in organisatorischer Kommunikation | entschieden 2026-09-05 durch Jannes; **überholt durch E15 (2026-09-13)** | `PROJECT_PRINCIPLES.md` 0.4 §10; siehe E15 |
| C3 | Fail-closed gegen Patientensicherheit, Break Glass | entschieden 2026-08-28 | [ADR-010](../adr/ADR-010-audit-and-privileged-access.md) |
| C4 | Auditlog als Kompensation | entschieden 2026-08-28 | [ADR-010](../adr/ADR-010-audit-and-privileged-access.md); Betrieb Roadmap G6 |
| C5 | Provider-Oberflächen, Admin-Trennung | entschieden 2026-08-28 | [ADR-010](../adr/ADR-010-audit-and-privileged-access.md) |
| C6 | AI Privacy Gateway: Schutzumfang und Provider | Zeitpunkt entschieden; Schutzumfang **vorläufig entschieden 2026-09-08**; Provider offen | [ADR-005](../adr/ADR-005-provider-independent-ai.md); vor Etappe 10; Volltext: `ANFRAGEN.md` § C6 |
| C7 | Sprachliche Trennung LLM / deterministische Regeln in §6, §7.1 | architektonisch entschieden; Wortlaut bei nächster Prinzipienversion | [ADR-005](../adr/ADR-005-provider-independent-ai.md); nicht planungsrelevant |
| C8 | „Nicht verbauen" gegen „nicht vorbauen" | entschieden 2026-08-28 | [ADR-014](../adr/ADR-014-foundational-data-model.md) |
| D | „finalisiert", „nachvollziehbar" | entschieden 2026-09-01 | [ADR-016](../adr/ADR-016-clinical-documentation-record.md) |
| D | „bestätigt" — Terminstatus-Automat | **erledigt 2026-09-11** — Umfang 2026-09-05, Ausgestaltung mit ADR-018 bestätigt | [ADR-018](../adr/ADR-018-appointment-states.md); `PROJECT_PRINCIPLES.md` 0.7 §8; gebaut in CAL-EPIC-003a |
| D | übrige Begriffe | erledigt | „auditierbar" → C4 · „organisatorische Patientenkommunikation" → C2 (überholt durch E15) · „Behandlungsnachweis" → C1, ANN-006 (überholt durch E15) · „Praxisinhaber vs. Admin" → C5 · „technisch getrennt" → ADR-002, Umgebungen in OPS-001 |
| D | Normativität und Nachweis | Normativität erledigt (0.2, §0); **Nachweistabelle offen** | Roadmap G14 |
| E1 | Betreibbarkeit bei Bus-Faktor 1 | entschieden 2026-08-28 | [ADR-012](../adr/ADR-012-backup-and-business-continuity.md); Dokumentation Roadmap G7 |
| E2 | Ausfallkonzept — zugleich Rückfallplan der Eröffnung | Kern **vorläufig entschieden 2026-09-08**; Ausarbeitung offen | Roadmap G10 und H4; Funktionsteil gestrichen 2026-09-22 (ANN-021); Volltext: `ANFRAGEN.md` § E2 |
| E3 | Backup, RPO/RTO, Restore-Test | entschieden 2026-08-28 | [ADR-012](../adr/ADR-012-backup-and-business-continuity.md); Roadmap G7 |
| E4 | Produktionszugriff | entschieden 2026-08-28 | [ADR-010](../adr/ADR-010-audit-and-privileged-access.md) |
| E5 | Produktions-Logs | entschieden 2026-08-28 | [ADR-011](../adr/ADR-011-logging-and-observability.md); Roadmap G6 |
| E6 | Synthetische Testdaten | erledigt: der Seed ist der Generator | `supabase/seed.sql`; Erweiterung im Loop, der sie braucht |
| E7 | CI-Gates, Branch Protection | entschieden 2026-08-28 | [ADR-013](../adr/ADR-013-ci-cd-and-release-governance.md); Freigabeprozess Roadmap G5 |
| E8 | Dateiablage | **erledigt 2026-09-12** — ADR-017 angenommen, alle acht Fragen wie empfohlen | [ADR-017](../adr/ADR-017-file-storage.md); gebaut in DAT-EPIC-001 (PR #38); **produktive** Ablage an OPS-001 (G3) und OPS-003 (G7) gebunden |
| E9 | Dokument-Governance | erledigt mit Version 0.2 (2026-08-28) | `PROJECT_PRINCIPLES.md` §21 |
| E10 | Wer schreibt Mitarbeiterdaten | **erledigt 2026-09-11** — umgesetzt in STAFF-002a | `PROJECT_PRINCIPLES.md` 0.6 §4.3/§4.5 nachgezogen; Privatangaben folgen dem Leserecht (ANN-024) |
| E11 | Wer gilt als behandelnde Person | **erledigt 2026-09-11** — Konten und Rollen entstehen in der Anwendung (STAFF-002b) | — |
| E12 | Terminfenster: Abweichung, Fahrpuffer, Warnung oder Sperre | Kernregel **entschieden 2026-09-08** (§8.1) · Punkt 1 **neu entschieden 2026-09-16**: Länge **frei**, Abweichung von 45/60 wird gekennzeichnet · Punkt 2 damit **gegenstandslos** · Punkt 3 und 4 **vorläufig entschieden 2026-09-12**, **gebaut in MAP-006** (Warnung, keine Sperre) · Punkt 3a **vorläufig beantwortet** durch ANN-097 (Live-Abruf, keine Speicherung) | `PROJECT_PRINCIPLES.md` **0.11 §8.1**; CAL-010a und CAL-015 gebaut, **CAL-020 baut die freie Länge**, CAL-010b entfallen |
| E13 | Sprachdokumentation: Anbieter, Architektur, Audio, Frist | Anforderung **entschieden 2026-09-08** (§6.3); Umsetzung **offen** | §6.3, ADR-005 Punkt 9, ADR-006 Punkt 8, ADR-016 Punkt 10; Anbieter mit C6 |
| E14 | Gebühr beim Nichtantreffen am Hausbesuch | **erledigt 2026-09-13** — Hausbesuch-Szenarien verbindlich; Absage unter 24 Stunden **entschieden 2026-09-12** und gebaut (CAL-014); **umgesetzt 2026-09-16 in CAL-018** | `PROJECT_PRINCIPLES.md` 0.10 §8, [ADR-018](../adr/ADR-018-appointment-states.md) Fassung 3; Rechnungstext Fall 1 mit B4 |
| E15 | Office sieht klinische Inhalte | **entschieden (Jannes) 2026-09-13**; umgesetzt 2026-09-15 in ROL-EPIC-001; Prüfvermerk für B2 | `PROJECT_PRINCIPLES.md` 0.10 §4.3/§4.4/§10, [ADR-004](../adr/ADR-004-authorization-model.md) Fassung 2; C1 und C2 überholt |
| E16 | Abrechnungsgrundlage neben der Verordnung (Privatrezept, Selbstzahler, weitere) | **erledigt 2026-09-16** (Jannes), gebaut in GRD-001 — Teil A: abgerechnet wird auch vor dem Ende einer Grundlage · Teil B: **eine** Klammer „Behandlungsgrundlage", die Verordnung ist eine Bauart davon | [ADR-020](../adr/ADR-020-treatment-basis.md) (angenommen 2026-09-16); unten; gebaut in GRD-001 |
| E17 | Kopfleistensuche: was sie findet, und wo die Patientensuche wohnt | **erledigt 2026-09-16**, **Fassung 2 2026-09-18** (Jannes) — Namen bleiben zusätzlich in der Leiste | unten; UX-004; `../development/archiv/CAL-EPIC-004.md` (UX-013) |
| E-20 | ADR-019 Fassung 2 bestätigen | **erledigt 2026-09-13** — angenommen; produktive Freigabe am Gate **offen** (ADR-019 Punkt 9) | unten (E-20 / E-21); [ADR-019](../adr/ADR-019-map-service.md); Gate in B7 |
| E-21 | Reihenfolge MAP-002 zu UX-EPIC-001 | **erledigt 2026-09-13** — gegenstandslos, UX-EPIC-001 seit 2026-09-11 fertig | unten (E-20 / E-21); Roadmap |

---

## Offene Punkte im Einzelnen

### A2 — Anbieterprüfung Supabase (OPS-001)

offen · P1 · §2.1, §3.5; ADR-002, ADR-015 Punkt 20, ADR-017

Hosting, Datenstandort und Provider sind entschieden (ADR-002, ADR-015); offen
ist die Ausgestaltung der Anbieterprüfung als Dokument OPS-001. Dazu gehören die
Auth-Mails des Providers als einziger Versandweg in Stufe 1 (B13), die Prüfung
der Edge Runtime (ADR-015 Punkt 20) und die fünf Prüfpunkte zum Objektspeicher
aus ADR-017. Wo: OPS-001, Roadmap G3. Annahmen: ANN-007, ANN-017, ANN-025,
ANN-027, ANN-043, ANN-044.

### B1 — MDR / EU AI Act: die Zweckbestimmung

Zweckbestimmung vorläufig entschieden · 2026-09-08 · Jannes; externe Prüfung offen

Volltext: `ANFRAGEN.md` § B1. Wo: ADR-006, §17; Roadmap G15.
Annahmen: ANN-014.

### B2 — Datenschutzbeauftragter

vorläufig entschieden · 2026-09-08 · Jannes · ja, extern beauftragt

Offen war, ob auch ohne festgestellte Pflicht ein Datenschutzbeauftragter
benannt wird; Jannes hat das bejaht. Ausschlaggebend war nicht die Pflicht (nach
Art. 37 Abs. 1 lit. c DSGVO, WP 243 und §38 Abs. 1 BDSG eher unwahrscheinlich),
sondern die Lage: Gesundheitsdaten als Kerntätigkeit, selbst entwickelte Software,
keine eigene Datenschutzexpertise. Offen bleiben Schwellwertprüfung und DSFA;
Rücknahme in der Software `klein`. Wo: ADR-007 Punkte 3 und 4, §3.7; Roadmap
G14. Annahmen: das Prüfpaket des Registers (Stand 2026-09-23: 38 Einträge),
dazu der Prüfvermerk aus E15.

### B3 — Aufbewahrung und Löschung: Fristen-Validierung

offen · P1 · §18; ADR-008; LOE-EPIC-001

Das Modell ist entschieden (Retention Schedule, Löschlauf, Legal Hold) und mit
LOE-EPIC-001 gebaut; offen ist die Validierung der Fristen durch die
Datenschutzberatung — sie geht mit B2, die Belegfristen der Rechnungen mit B4.
Wo: ADR-008; Roadmap G14. Annahmen: ANN-001, ANN-002, ANN-013, ANN-020, ANN-026,
ANN-029 bis ANN-033, ANN-035.

### B4 — Steuerliche Validierung: Fragen an die Steuerberatung

vier Festlegungen vorläufig entschieden · 2026-09-08 · Jannes; Validierung offen

Volltext: `ANFRAGEN.md` § B4. Wo: ADR-009, §19; Roadmap G13. Annahmen: ANN-035
(steuerliche Aufbewahrung des Gebührenanlasses), ANN-074, ANN-075, ANN-082,
E14 (Rechnungstext für Fall 1).

### B5 — Patientenidentität, Identitätsprüfung und Vertretung

Rahmen vorläufig entschieden · 2026-09-08 · Jannes; Verfahren offen · P1 für das Portal

Volltext: `ANFRAGEN.md` § B5. Wo: ADR-014 (minimale Struktur für
Vertreterzugriffe); Roadmap Etappe 4.

### B6 — Beschäftigtendaten: Tourendaten und Leistungskontrolle

vorläufig entschieden · 2026-09-08 · Jannes · nein

Standort-, Touren- und Arbeitszeitdaten werden nicht zur Verhaltens- oder
Leistungsbeurteilung verwendet; umgesetzt durch Aggregation statt Einzelbewegung,
kurze Löschfristen, kein Live-Tracking, keine Auswertung je Person. §26 BDSG setzt
enge Grenzen, und bei dieser Praxisgröße liefert ein „Ja" nichts Unbekanntes (§16,
§20). **§20.1 (2026-09-22) ändert daran nichts:** Eine Führung auf dem Gerät meldet
der Praxis keinen Standort. Rücknahme `mittel`. Wo: §20; Roadmap vor ZK-001 und
MAP-006 (Tagesstopps). Annahmen: ANN-004 (Arbeitszeiten bleiben aus dem Auditlog heraus).

### B7 — Übermittlung von Adressdaten an den Kartendienst

Weg C vorläufig entschieden · 2026-09-08 · Jannes (MAP-001); produktive Freigabe
am Gate offen

Google Maps Platform wird nicht Backend (kein AVV, keine belegte
EU-Verarbeitung); Kandidat ist PTV Developer mit den OSM-APIs, nicht produktiv
freigegeben. Fahrzeiten werden abgerufen und angezeigt, nicht gespeichert und nie
je Person ausgewertet — damit hängt der Punkt an B6. Vor Echtdaten steht das
neunteilige Gate aus ADR-019 Punkt 9, alle Punkte
`CONTRACT_CONFIRMATION_REQUIRED`. Wo: ADR-019 Fassung 3,
`providerpruefung-kartendienst.md`; Roadmap G12, MAP-006.
Annahmen: ANN-016, ANN-017, ANN-018. Gate vor echten Adressen, nicht vor dem Bau.

### B8 — Lizenzen für Fragebögen und PROMs

Nutzung bestätigt (Jannes) · 2026-09-19 · schriftlicher Beleg offen · P2

**Jannes hat am 2026-09-19 erklärt, die Praxis dürfe den DIGOTOR-Anamnesebogen
verwenden**; weitere Bögen sollen folgen (`IDEA-OUT-001`). Der **schriftliche
Beleg des Lizenzgebers** bleibt für M3 offen — bis dahin trägt jedes Instrument
seinen Lizenzstatus als Feld. Wo: §7; `../development/FRB-BAUSTEINE-UND-SCORES.md` (FRB-003).
Frei: FRB-001/002. Annahmen: ANN-086.

### B9 — Betreuung ohne und nach Heilbehandlung: Rechtsrahmen und Datentrennung

vorläufig entschieden · 2026-09-07/08 · Jannes; Punkt 6 neu 2026-09-22 (Ernährung in V1)

Volltext: `ANFRAGEN.md` § B9. Wo: §1; Roadmap ALT-EPIC-002. Annahmen: ANN-032
(automatische Klassifizierung hängt
an B9), ANN-014 (`MDR_REVIEW_REQUIRED` bei Bewertung).

### B10 — Automatisierte Progression: MDR-Grenze und Verantwortung

vorläufig entschieden · 2026-09-08 · Jannes; Bestätigung mit B1

Volltext: `ANFRAGEN.md` § B10. Wo: ADR-006; Roadmap Etappe 9. Annahmen: ANN-014.

### B11 — Paketpreise, Vorauszahlung und Anreize

neu entschieden · 2026-09-22 · Jannes · Pakete ja, Abo als Monatsrechnung

Volltext (Stand 2026-09-08): `ANFRAGEN.md` § B11. Wo: ADR-009, §14 in 0.16.

### B12 — Stichtag der Umstellung und Rechnungsnummernkreis

erledigt · 2026-09-06 · Jannes

Kein Altsystem; das Nummernformat geht an B4 Punkt 3. Volltext: Git-Historie.

### B13 — E-Mail-Versand aus der Plattform

wieder offen · seit 2026-09-21 (BEF-026) · P1 vor POR-EPIC-001

Am 2026-09-06 entschieden war Option a: nur die Auth-Mails des Providers, kein
zweiter Dienst. Das trägt nicht mehr: Die Providerprüfung (OPS-001) zeigt, dass
der eingebaute Versand nur an Adressen des Projektteams zustellt, und die
Plattform (E-4 in `../development/UMBAU.md`) braucht Mails an Patient:innen —
Einladung, Anmeldung, Hinweise. Offen ist die Wahl zwischen einem eigenen
SMTP-Anbieter (Empfehlung; neuer Dienstleister, Prüfung nach ADR-002 in Block
11) und keinem Mailversand. Gebaut wird bis dahin hinter einem Adapter mit
`mock`-Weg; STAFF-004 ruht. Wo: §3.5, §4, ADR-002; Roadmap R8, „Bei Jannes".
Annahmen: ANN-025, ANN-043.

### B14 — PDF-Erzeugung

Druckansichten entschieden · 2026-09-06 · Rechnungs-PDF entschieden · 2026-09-19 · Jannes

Druckansichten mit `@media print` sind gebaut — keine Abhängigkeit, kein neuer
Ausführungsort. **Entschieden am 2026-09-19** nach der Vorlage
([`rechnungs-pdf-optionen.md`](rechnungs-pdf-optionen.md)): **Weg 1
(Browser-Druck) jetzt, Weg 3 (serverseitig) nach OPS-001**; Weg 2 entfällt.
Weg 1 legt nichts an, was später im Weg stünde — er erfüllt ADR-009 Punkt 11
aber **nicht**: Aufbewahrt wird bis Weg 3 der Snapshot, nicht das verschickte
Dokument. Wo: ADR-009 Punkt 14, ADR-017. ABR-003b ist frei.

### B15 — Terminerinnerung und Online-Terminbuchung

neu entschieden · 2026-09-22 · Jannes · Erinnerung und Online-Anfrage in V1

Bis 2026-09-22 galt: keine automatische Erinnerung, die Anrufliste bleibt. Jetzt
gehören Erinnerung und Online-Anfrage zu V1 (Roadmap KOM-EPIC-003), gebaut
hinter einem Adapter und scharf erst nach der Anbieterprüfung: Jeder
automatisierte Kanal ist ein neuer Dienstleister mit einem Gesundheitsdatum
(ADR-002, DSFA-Wiedervorlage, Einwilligung nach PAT-006). E-Mail vor SMS,
Messenger ausgeschlossen. Die Terminmail aus dem eigenen Postfach — auf Klick,
ohne neuen Empfänger — ist gebaut (CAL-013). Offen: Versanddienstleister,
Einwilligung je Person. Wo: §3.5, ADR-002, ADR-007. Annahmen: ANN-039, ANN-040,
ANN-041.

### B16 — Hosting der Oberfläche

entschieden · 2026-09-23 · Jannes · Uberspace

Vorlage und Einrichtungsanleitung: [`hosting-optionen.md`](hosting-optionen.md). Rücknahmepreis
klein; volle Prüfung nach ADR-002 vor echten Daten (G5). Konten stehen seit 2026-09-25; weiter mit OPS-002a.

### C6 — AI Privacy Gateway: Schutzumfang und Provider

Schutzumfang vorläufig entschieden · 2026-09-08 · Jannes; Provider offen

Volltext: `ANFRAGEN.md` § C6. Wo: ADR-005; Roadmap Etappe 10. Dazu gehört der
Anbieter für Spracherkennung
und Transkription aus E13 Punkt 1.

### D — „bestätigt": der Terminstatus-Automat

erledigt · 2026-09-11 · ADR-018 · Umfang 2026-09-05, gebaut in CAL-EPIC-003a;
Volltext: Git-Historie bis `7160fd5`. Annahmen: ANN-034, ANN-036.

### E2 — Ausfallkonzept

Kern vorläufig entschieden · 2026-09-08 · Jannes; Ausarbeitung Jan 2027 ·
Volltext: `ANFRAGEN.md` § E2. Wo: ADR-012; Roadmap G10 und H4.

### E8 — Dateiablage

erledigt · 2026-09-12 · ADR-017 · alle acht Fragen wie empfohlen, gebaut in
DAT-EPIC-001; produktive Ablage an OPS-001 und OPS-003 gebunden. Volltext:
Git-Historie bis `7160fd5`. Annahmen: ANN-052, ANN-053.

### E10 — Wer verwaltet Mitarbeiterdatensätze

erledigt · 2026-09-11 · STAFF-002a · Privatangaben folgen dem Leserecht.
Volltext: Git-Historie. Annahmen: ANN-024.

### E11 — Wer gilt als behandelnde Person

erledigt · 2026-09-11 · STAFF-002b · Konten und Rollen entstehen in der
Anwendung. Volltext: Git-Historie. Annahmen: ANN-025, ANN-026.

### E12 — Terminfenster: Abweichung, Fahrpuffer, Warnung oder Sperre

Kernregel entschieden · 2026-09-08 (§8.1); **Punkt 1 neu entschieden
2026-09-16**; nur 3a offen · P2

Entschieden sind §8.1 (Raster, Fahrzeit zusätzlich, Bestandstermine
unverändert), **Punkt 1: die Länge ist frei** (0.11, 2026-09-16 — 60 bleibt
Vorbelegung, eine Abweichung von 45/60 wird gekennzeichnet; gebaut in CAL-020)
und die Punkte 3 und 4 (Fahrpuffer erst mit MAP-006). **Punkt 2** (Länge je
Praxis einstellbar) ist damit gegenstandslos, **ANN-037** verliert mit CAL-020
ihren Gegenstand (verworfen, abgelöst durch ANN-056). **3a** (Fahrzeit ohne Speicherung gegen
serverseitige Rundung) hat MAP-006 am 2026-09-25 vorläufig beantwortet: Live-Abruf je Prüfung,
Rundung in `app.earliest_follow_up_start`, Warnung statt Sperre; Punkt 4 wartet auf echte
Zahlen. Wo: §8.1, ADR-019 Punkt 16. Annahmen: ANN-049, ANN-056, ANN-097.

### E13 — Sprachdokumentation: Anbieter, Architektur, Audio, Frist

Anforderung entschieden · 2026-09-08 (§6.3); Umsetzung offen · P3

Offen sind fünf Punkte: Anbieter (Prüfkatalog wie jeder Verarbeitungsdienst,
gehört zu C6); Rohaudio — ob, wo, wie lange (ADR-008 kennt keine Datenklasse
dafür); Fristanker, weil eine späte Übernahme sonst einen sofort finalisierten
Entwurf erzeugt (ADR-016 Punkt 7, ANN-008); Architektur des ungeprüften
Vorschlags (ADR-016 Punkt 10); Bedienung und Einordnung. Wo: §6.3, ADR-005
Punkte 8 und 9, ADR-006 Punkt 8; C6. Blockiert nichts.

### E14 — Gebühr beim Nichtantreffen am Hausbesuch

erledigt · 2026-09-13 · Jannes; umgesetzt 2026-09-16 in CAL-018 · Tür
geöffnet ohne Behandlung → durchgeführt mit Pflichtvermerk; nicht angetroffen
nach Protokoll → Ausfallgebühr; Patientenabsage unter 24 Stunden →
Ausfallgebühr (CAL-014). Gebaut für den **Hausbesuch**; für Praxis- und
Videotermine gibt es keine Festlegung (ANN-055). Rechnungstext und
Rechtsgrundlage für Fall 1 in B4. Wo: §8, ADR-018 Fassung 3 Punkt 9, ADR-009.
Annahmen: ANN-035, ANN-047, ANN-048, ANN-055.

### E15 — Office sieht klinische Inhalte

entschieden (Jannes) · 2026-09-13; umgesetzt 2026-09-15 in ROL-EPIC-001 ·
Office liest alle klinischen Inhalte im Umfang der Therapeut:innen, schreibt
keine klinische Dokumentation, jeder Zugriff auditpflichtig; C1 und C2
überholt, ANN-006 verworfen. Prüfvermerk in B2. Wo: `PROJECT_PRINCIPLES.md`
0.10 §4.3/§4.4, ADR-004 Fassung 2. Annahmen: ANN-011.

### E16 — Abrechnungsgrundlage neben der Verordnung

erledigt · 2026-09-16 · Jannes · gebaut in GRD-001 · **Teil A:** Abgerechnet wird
auch vor dem Ende einer Grundlage — §19 und ADR-009 Punkte 3 und 4 trennen
Leistung und Rechnung bereits, eine Rechnung kann deshalb nicht die Klammer
sein. **Teil B:** Ein Termin hängt an einer **Behandlungsgrundlage**; die
Verordnung ist eine Bauart davon, der Selbstzahler die zweite, umgesetzt durch
Erweitern der vorhandenen Tabelle. Wo: [ADR-020](../adr/ADR-020-treatment-basis.md),
§19, ADR-009. Volltext: Git-Historie bis `6784a5f`.

### E17 — Kopfleistensuche: was sie findet, und wo die Patientensuche wohnt

erledigt · 2026-09-16 · **Fassung 2: 2026-09-18** · Jannes · Die Leiste sucht
**Funktionen und Bereiche** — und darunter, in einer zweiten Gruppe, weiterhin
**Namen**, serverseitig wie in UX-004. Fassung 1 hätte sie ganz verlagert; der
Schritt mehr aus einem Termin heraus entfällt damit wieder. Die Patientensuche
steht **zusätzlich** im Bereich „Patient:innen", klinische Inhalte findet die
Leiste nicht (ANN-061). Gebaut in UX-013. Wo: UX-004; `../development/archiv/CAL-EPIC-004.md`.

### E-20 / E-21 — Rückfragen aus MAP-001 (ADR-019 Fassung 2)

erledigt · 2026-09-13 · Jannes · E-20: ADR-019 Fassung 2 angenommen, produktive
Freigabe bleibt am Gate (Punkt 9, siehe B7). E-21: gegenstandslos.

---

## F. Folgefragen aus den ADRs mit Planungsrelevanz

Planungsrelevant, weil ohne sie ein Paket der Roadmap nicht abgeschlossen werden
kann; die übrigen beantworten sich im Loop, der das Thema baut.

| Frage | ADR | Beantwortet in |
| --- | --- | --- |
| Wer führt die Anbieterprüfung durch, wo wird sie dokumentiert, wie oft wiederholt? | ADR-002 | OPS-001 (G3) |
| ~~Ist externes Error-Tracking zulässig, und wie werden Redaction-Regeln erzwungen und getestet?~~ Mit OPS-004 (2026-09-22): kein externer Dienst in V1, als Gate in `src/protokollierung.test.ts`; Redaction in `src/lib/protokoll.ts` | ADR-002, ADR-011 | OPS-004 (G6) |
| Wie wird „keine Produktionsdaten in Dev/Test" technisch abgesichert? | ADR-002 | OPS-001, OPS-002 |
| Frontend-Hosting und dessen Prüfung; `service_role` nie im Browser; Nachweis der Freigabe | ADR-015, ADR-013 | B16; OPS-002a, OPS-002 (G5) |
| Schweregrade im Dependency-Scan | ADR-013 | ANN-054 (Schwelle `high`); OPS-002 (G5) |
| Backup-Lebenszyklus, Notfallzugang, Restore-Dokumentation, Degraded-Kerninformationen | ADR-012 | OPS-003 (G7), E2 (G10) |
| Schwelle „größerer Export"; Eskalation beim Report | ADR-010 | G6 (OPS-004 Rest; in ADR-004 noch OPS-005) |
| Wie werden Berechtigungsänderungen protokolliert; Umgehungsschutz des Policy-Layers | ADR-004 | STAFF-EPIC-002, G6 |
| Löschnachweis nach Restore; Legal-Hold-Rechte; Teamchat rollierend löschen | ADR-008 | ANN-033; LOE-002; TEAM-001 |
| Rechtsgrundlage je Verarbeitung und Einwilligungsmodell; Betroffenenrechte technisch | ADR-007 | PAT-006 (G8), OPS-006 (G9), G14 |
| ~~Nummernkreis, Snapshot-Felder, Storno-Kette, Empfängertypen, „überfällig" ohne Mahnwesen~~ | ADR-009 | ABR-EPIC-002a/002b (ANN-075 bis ANN-080) |
| ~~Abrechenbare Ereignisse neben Terminen; Katalog global oder je Organisation; Datentyp für Geldwerte~~ | ADR-009, ADR-003, ADR-014 | ABR-EPIC-001 (ANN-070 bis ANN-072) |
| Zeitzonen bei wiederkehrenden Terminen und Kalenderjahr-Fristen | ADR-014 | Terminserie (ANN-038), LOE-001 |
| Begründung als Pflichtfeld; Frist bei Hausbesuchen am Freitag; Azubi-Rolle | ADR-016 | ANN-008; STAFF-EPIC-002 |
| Fristanker bei später Übernahme eines KI-Vorschlags; Rohaudio; Prüfbarkeit der Inhaltstreue | ADR-016 F2, ADR-005 F2, ADR-006 F2 | E13; Anbieter mit C6 |
| Wer pflegt die Zweckbestimmung; wo wird `MDR_REVIEW_REQUIRED` geführt; Cutoff-Anzeige | ADR-006 | G12/G13; FRB-002 |
| Offline: Felder, Unsynchronisiert-Dauer, Konfliktauflösung, Geräteanforderungen, Audit offline | ADR-001 | ANN-021 (Tagesplan-Cache); eigener Offline-ADR vor einem Offline-Loop |
| Kartendienst: Anbieter, Datenweg, Vertragsgrundlage, Endgerät | ADR-002, §9, §20 | ADR-019 (G12); B7 |
| KI: Provider, Zweck → erlaubte Felder, Protokollierung, Nachweis der Freigabe | ADR-005 | C6, Etappe 10 |
| Minimale Struktur für Vertreterzugriffe | ADR-014 | B5 |

---

## Historie

Entscheidungsverlauf und ältere Fassungen: `git log --
docs/decisions/OPEN_DECISIONS.md`.
