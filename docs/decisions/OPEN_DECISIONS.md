# Offene Entscheidungen

Zuletzt aktualisiert: 2026-09-16 · Struktur 4.0

Was noch nicht entschieden ist, warum es offen ist und was davon abhängt.
Was ein Punkt aufhält: `docs/development/ROADMAP.md`, Spur B — **Termine gibt es keine** (5.37). Die Volltexte der acht Punkte für
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
Dokuments, `E-1` bis `E-21` (mit Bindestrich) die Rückfragen des Roadmap-Reviews
vom 2026-09-06 — alle beantwortet; nicht umnummeriert. Erledigte Punkte behalten
Überschrift und Verweis (Volltext: Git-Historie bis `7160fd5`). Dringlichkeit:
**P1** vor dem ersten fachlichen Datenmodell des Bereichs, **P2** vor dem
Feature, **P3** später.

---

## Übersicht — alle Punkte

| Punkt | Thema | Status | Wo |
| ----- | ------------------------------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| A1 | Offline-Fähigkeit | entschieden 2026-08-28 | [ADR-001](../adr/ADR-001-online-first-limited-offline.md); Mechanismus offen, siehe F |
| A2 | Hosting, Datenstandort, Provider | entschieden 2026-08-28; **Anbieterprüfung offen** | [ADR-002](../adr/ADR-002-hosting-data-residency.md), [ADR-015](../adr/ADR-015-initial-technical-stack.md); Roadmap OPS-001; unten |
| A3 | `organization_id` / `location_id` | entschieden 2026-08-28 | [ADR-003](../adr/ADR-003-organization-location-model.md) |
| A4 | Berechtigungsmodell | entschieden 2026-08-28 | [ADR-004](../adr/ADR-004-authorization-model.md) |
| B1 | MDR / EU AI Act | Zweckbestimmung **vorläufig entschieden 2026-09-08**; **externe Prüfung offen** | [ADR-006](../adr/ADR-006-medical-device-boundary.md); Roadmap G15, Feb 2027; Volltext: `ANFRAGEN.md` § B1 |
| B2 | DSFA, DSB, Verzeichnis, TOM, Meldeprozess | Prozess entschieden; DSB **vorläufig entschieden 2026-09-08** (ja); Schwellwertprüfung offen | [ADR-007](../adr/ADR-007-data-protection-impact-assessment.md); Roadmap G14 |
| B3 | Aufbewahrung und Löschung | entschieden; **Fristen-Validierung offen**; Umsetzung LOE-EPIC-001 fertig 2026-09-11 | [ADR-008](../adr/ADR-008-data-retention-and-deletion.md); unten (Annahmen); Roadmap LOE-EPIC-001 |
| B4 | Abrechnungsmodell | entschieden; vier Festlegungen **vorläufig entschieden 2026-09-08**; **steuerliche Validierung offen** | [ADR-009](../adr/ADR-009-private-billing-model.md); Roadmap G13, Nov 2026; Volltext: `ANFRAGEN.md` § B4 |
| B5 | Patientenidentität, Vertretung | Rahmen **vorläufig entschieden 2026-09-08**; Verfahren **offen** (P1 für das Portal) | vor Etappe 4; Volltext: `ANFRAGEN.md` § B5 |
| B6 | Beschäftigtendaten: Touren, Leistungskontrolle | **vorläufig entschieden 2026-09-08: nein** | vor ZK-001, TOUR-001; ANN-004 überbrückt das Audit |
| B7 | Adressdaten an den Kartendienst | Handoff nicht blockiert; Karte und Fahrzeiten: **Weg C** — PTV Developer als Kandidat (ADR-019 Fassung 2, 2026-09-08); **E-20 erledigt 2026-09-13** (Fassung 2 angenommen), Gate **offen** | ADR-019, `providerpruefung-kartendienst.md` (Roadmap G12); überholte Stände im Archiv |
| B8 | Lizenzen für Fragebögen und PROMs | Nutzung **bestätigt durch Jannes 2026-09-19**; schriftlicher Beleg des Lizenzgebers bleibt offen (M3) | vor FRB-003 |
| B9 | Betreuung ohne und nach Heilbehandlung (Personal Training) | **vollständig vorläufig entschieden**: ein Unternehmen (2026-09-07), die sechs übrigen Fragen (2026-09-08) | vor Etappe 8; Steuerteil mit B4; Volltext: `ANFRAGEN.md` § B9 |
| B10 | Automatisierte Progression: MDR-Grenze | **vorläufig entschieden 2026-09-08**; Bestätigung mit B1 | vor Etappe 9; Volltext: `ANFRAGEN.md` § B10 |
| B11 | Paketpreise, Vorauszahlung, Anreize | **vorläufig entschieden 2026-09-08**: vorerst nicht anbieten | vor Etappe 8; Volltext: `ANFRAGEN.md` § B11 |
| B12 | Stichtag der Umstellung und Rechnungsnummernkreis | **erledigt 2026-09-06**: kein Altsystem; Nummernformat → B4 | — |
| B13 | E-Mail-Versand aus der Plattform (Einladung, Passwort) | **entschieden 2026-09-06** durch Jannes (Option a); Auth-Mails Teil von OPS-001 (A2) | Roadmap G2, G3 |
| B14 | PDF-Erzeugung für Rechnungen und Tagesplan | Druckansichten **entschieden 2026-09-06**; Rechnungs-PDF **entschieden 2026-09-19**: Weg 1 jetzt, Weg 3 nach OPS-001 | unten; [`rechnungs-pdf-optionen.md`](rechnungs-pdf-optionen.md) |
| B15 | Terminerinnerung und Online-Terminbuchung: Kanal, Anbieter | **vorläufig entschieden 2026-09-08**: keine automatische Erinnerung · **Nachtrag 2026-09-12**: Terminmail aus dem eigenen Postfach ist vorgesehen und gebaut (CAL-013, ANN-041) | unten |
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
| E2 | Ausfallkonzept — zugleich Rückfallplan der Eröffnung | Kern **vorläufig entschieden 2026-09-08**; Ausarbeitung Jan 2027 | Roadmap G10 und H4, Jan 2027; Volltext: `ANFRAGEN.md` § E2 |
| E3 | Backup, RPO/RTO, Restore-Test | entschieden 2026-08-28 | [ADR-012](../adr/ADR-012-backup-and-business-continuity.md); Roadmap G7 |
| E4 | Produktionszugriff | entschieden 2026-08-28 | [ADR-010](../adr/ADR-010-audit-and-privileged-access.md) |
| E5 | Produktions-Logs | entschieden 2026-08-28 | [ADR-011](../adr/ADR-011-logging-and-observability.md); Roadmap G6 |
| E6 | Synthetische Testdaten | erledigt: der Seed ist der Generator | `supabase/seed.sql`; Erweiterung im Loop, der sie braucht |
| E7 | CI-Gates, Branch Protection | entschieden 2026-08-28 | [ADR-013](../adr/ADR-013-ci-cd-and-release-governance.md); Freigabeprozess Roadmap G5 |
| E8 | Dateiablage | **erledigt 2026-09-12** — ADR-017 angenommen, alle acht Fragen wie empfohlen | [ADR-017](../adr/ADR-017-file-storage.md); gebaut in DAT-EPIC-001 (PR #38); **produktive** Ablage an OPS-001 (G3) und OPS-003 (G7) gebunden |
| E9 | Dokument-Governance | erledigt mit Version 0.2 (2026-08-28) | `PROJECT_PRINCIPLES.md` §21 |
| E10 | Wer schreibt Mitarbeiterdaten | **erledigt 2026-09-11** — umgesetzt in STAFF-002a | `PROJECT_PRINCIPLES.md` 0.6 §4.3/§4.5 nachgezogen; Privatangaben folgen dem Leserecht (ANN-024) |
| E11 | Wer gilt als behandelnde Person | **erledigt 2026-09-11** — Konten und Rollen entstehen in der Anwendung (STAFF-002b) | — |
| E12 | Terminfenster: Abweichung, Fahrpuffer, Warnung oder Sperre | Kernregel **entschieden 2026-09-08** (§8.1) · Punkt 1 **neu entschieden 2026-09-16**: Länge **frei**, Abweichung von 45/60 wird gekennzeichnet · Punkt 2 damit **gegenstandslos** · Punkt 3 und 4 **vorläufig entschieden 2026-09-12** (Fahrpuffer erst mit MAP-006) · **offen: nur Punkt 3a** | `PROJECT_PRINCIPLES.md` **0.11 §8.1**; CAL-010a und CAL-015 gebaut, **CAL-020 baut die freie Länge**, CAL-010b entfallen |
| E13 | Sprachdokumentation: Anbieter, Architektur, Audio, Frist | Anforderung **entschieden 2026-09-08** (§6.3); Umsetzung **offen** | §6.3, ADR-005 Punkt 9, ADR-006 Punkt 8, ADR-016 Punkt 10; Anbieter mit C6 |
| E14 | Gebühr beim Nichtantreffen am Hausbesuch | **erledigt 2026-09-13** — Hausbesuch-Szenarien verbindlich; Absage unter 24 Stunden **entschieden 2026-09-12** und gebaut (CAL-014); **umgesetzt 2026-09-16 in CAL-018** | `PROJECT_PRINCIPLES.md` 0.10 §8, [ADR-018](../adr/ADR-018-appointment-states.md) Fassung 3; Rechnungstext Fall 1 mit B4 |
| E15 | Office sieht klinische Inhalte | **entschieden (Jannes) 2026-09-13**; umgesetzt 2026-09-15 in ROL-EPIC-001; Prüfvermerk für B2 | `PROJECT_PRINCIPLES.md` 0.10 §4.3/§4.4/§10, [ADR-004](../adr/ADR-004-authorization-model.md) Fassung 2; C1 und C2 überholt |
| E16 | Abrechnungsgrundlage neben der Verordnung (Privatrezept, Selbstzahler, weitere) | **erledigt 2026-09-16** (Jannes) — Teil A: abgerechnet wird auch vor dem Ende einer Grundlage · Teil B: **eine** Klammer „Behandlungsgrundlage", die Verordnung ist eine Bauart davon | [ADR-020](../adr/ADR-020-treatment-basis.md) (angenommen 2026-09-16); unten; gebaut in GRD-001 |
| E17 | Kopfleistensuche: was sie findet, und wo die Patientensuche wohnt | **erledigt 2026-09-16**, **Fassung 2 2026-09-18** (Jannes) — Namen bleiben zusätzlich in der Leiste | unten; UX-004; `../development/CAL-EPIC-004.md` (UX-013) |
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
G14. Annahmen: das Prüfpaket des Registers (Stand 2026-09-14: 29 Einträge),
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

Volltext: `ANFRAGEN.md` § B4. Wo: ADR-009, §19; Roadmap G15. Annahmen: ANN-035
(steuerliche Aufbewahrung des Gebührenanlasses), E14 (Rechnungstext für Fall 1).

### B5 — Patientenidentität, Identitätsprüfung und Vertretung

Rahmen vorläufig entschieden · 2026-09-08 · Jannes; Verfahren offen · P1 für das Portal

Volltext: `ANFRAGEN.md` § B5. Wo: ADR-014 (minimale Struktur für
Vertreterzugriffe); Roadmap Etappe 4.

### B6 — Beschäftigtendaten: Tourendaten und Leistungskontrolle

vorläufig entschieden · 2026-09-08 · Jannes · nein

Standort-, Touren- und Arbeitszeitdaten werden nicht zur Verhaltens- oder
Leistungsbeurteilung verwendet; die Begrenzung wird technisch umgesetzt
(Aggregation statt Einzelbewegung, kurze Löschfristen, kein Live-Tracking, keine
Auswertung je Person). §26 BDSG setzt der Leistungskontrolle enge Grenzen, und
bei dieser Praxisgröße liefert ein „Ja" nichts Unbekanntes (§16, §20). Rücknahme
`mittel`. Wo: §20; Roadmap vor ZK-001 und TOUR-001. Annahmen: ANN-004
(Arbeitszeiten bleiben aus dem Auditlog heraus).

### B7 — Übermittlung von Adressdaten an den Kartendienst

Weg C vorläufig entschieden · 2026-09-08 · Jannes (MAP-001); produktive Freigabe
am Gate offen

Google Maps Platform wird nicht Backend (kein AVV, keine belegte
EU-Verarbeitung); Kandidat ist PTV Developer mit den OSM-APIs, nicht produktiv
freigegeben. Fahrzeiten werden abgerufen und angezeigt, nicht gespeichert und nie
je Person ausgewertet — damit hängt der Punkt an B6. Vor Echtdaten steht das
neunteilige Gate aus ADR-019 Punkt 9, alle Punkte
`CONTRACT_CONFIRMATION_REQUIRED`. Wo: ADR-019 Fassung 2,
`providerpruefung-kartendienst.md`; Roadmap G12, MAP-006.
Annahmen: ANN-016, ANN-017, ANN-018. Blockiert nur MAP-006 (echte Adressen).

### B8 — Lizenzen für Fragebögen und PROMs

Nutzung bestätigt (Jannes) · 2026-09-19 · schriftlicher Beleg offen · P2

**Jannes hat am 2026-09-19 erklärt, die Praxis dürfe den DIGOTOR-Anamnesebogen
verwenden**; weitere Bögen sollen folgen (`IDEA-OUT-001`). Der **schriftliche
Beleg des Lizenzgebers** bleibt für M3 offen — bis dahin trägt jedes Instrument
seinen Lizenzstatus als Feld. Wo: §7; Roadmap FRB-003. Frei: FRB-001/002.

### B9 — Betreuung ohne und nach Heilbehandlung: Rechtsrahmen und Datentrennung

vollständig vorläufig entschieden · 2026-09-07 und 2026-09-08 · Jannes

Volltext: `ANFRAGEN.md` § B9. Wo: §1; Roadmap Etappe 8. Annahmen: ANN-032
(automatische Klassifizierung hängt
an B9), ANN-014 (`MDR_REVIEW_REQUIRED` bei Bewertung).

### B10 — Automatisierte Progression: MDR-Grenze und Verantwortung

vorläufig entschieden · 2026-09-08 · Jannes; Bestätigung mit B1

Volltext: `ANFRAGEN.md` § B10. Wo: ADR-006; Roadmap Etappe 9. Annahmen: ANN-014.

### B11 — Paketpreise, Vorauszahlung und Anreize

vorläufig entschieden · 2026-09-08 · Jannes · vorerst nicht anbieten

Volltext: `ANFRAGEN.md` § B11. Wo: ADR-009; Roadmap Etappe 8.

### B12 — Stichtag der Umstellung und Rechnungsnummernkreis

erledigt · 2026-09-06 · Jannes

Kein Altsystem; das Nummernformat geht an B4 Punkt 3. Volltext: Git-Historie.

### B13 — E-Mail-Versand aus der Plattform

entschieden · 2026-09-06 · Jannes · Option a

Nur die Auth-Mails des Providers, kein zweiter Dienst; Teil von OPS-001 (A2).
Volltext: Git-Historie bis `7160fd5`. Annahmen: ANN-025, ANN-043.

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

vorläufig entschieden · 2026-09-08 · Jannes · keine automatische Erinnerung;
Nachtrag 2026-09-12

In Stufe 1 und 2 keine automatische Terminerinnerung, die Anrufliste bleibt:
Jeder automatisierte Kanal wäre ein neuer Dienstleister mit einem
Gesundheitsdatum und löste Prüfung nach ADR-002, DSFA-Wiedervorlage und
Einwilligung aus (PAT-006); falls doch, dann E-Mail vor SMS, Messenger
ausgeschlossen. Der Nachtrag vom 2026-09-12 trennt davon die Terminmail aus dem
eigenen Postfach — auf Klick, gebaut als CAL-013, ohne neuen Empfänger. Offen
bleiben automatische Erinnerung, Versanddienstleister, SMS, Online-Buchung und
die Einwilligung je Patient:in. Wo: §3.5, ADR-002, ADR-007; Roadmap Stufe 2,
PAT-006. Annahmen: ANN-039, ANN-040, ANN-041.

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
ihren Gegenstand. Offen bleibt **3a**: ADR-019 Punkt 16 sieht keine
Speicherung von Fahrzeiten vor, §8.1 verlangt die serverseitige Rundungsregel,
sobald eine vorliegt — Live-Abruf je Prüfung oder kurze Speicherung. Wo: §8.1,
ADR-019 Punkt 16; Roadmap MAP-006, CAL-EPIC-004. Annahmen: ANN-037,
ANN-049.

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

Teil A entschieden 2026-09-16 · Teil B offen · P1 vor VER-EPIC-002 und
ABR-EPIC-001

Termine sollen in der Akte **je Abrechnungsgrundlage** gruppiert erscheinen —
Verordnung, Privatrezept, Selbstzahler „oder in Zukunft andere Methoden".
Heute kennt das Modell eine Klammer: `prescriptions`.

**Teil A — Abrechnungszeitpunkt (Jannes, 2026-09-16):** Abgerechnet wird auch
**vor** dem Ende einer Verordnung — vier von zehn Terminen jetzt, der Rest
später —, und bei Selbstzahlern genauso. Das ist keine Änderung: §19 und
ADR-009 Punkte 3 und 4 trennen Leistung und Rechnung bereits, jede Leistung
wird höchstens einmal abgerechnet, und fakturiert wird je Leistung aus
`documented`. **Folge für Teil B:** Eine Rechnung kann die Klammer **nicht**
sein — zu einem Behandlungsblock gehören dann mehrere.

**Teil B entschieden 2026-09-16 (Jannes):** Ein Termin hängt an einer
**Behandlungsgrundlage**; die Verordnung ist eine Bauart davon, der
Selbstzahler die zweite. Umgesetzt wird das durch **Erweitern** der
vorhandenen Tabelle — Umbenennung, dritter Wert `self_pay`, `prescriber_id`
nur für Verordnungen —, nicht durch eine zweite Tabelle. Ausgearbeitet in
**[ADR-020](../adr/ADR-020-treatment-basis.md)** (angenommen 2026-09-16,
`PROJECT_PRINCIPLES.md` 0.11.1 §21); gebaut in **GRD-001** vor VER-EPIC-002. Wo: §19, §13, ADR-009,
ADR-014; `../development/CAL-EPIC-004.md`, VER-EPIC-002.

### E17 — Kopfleistensuche: was sie findet, und wo die Patientensuche wohnt

erledigt · 2026-09-16 · **Fassung 2: 2026-09-18** · Jannes · Die Leiste sucht
**Funktionen und Bereiche** — und darunter, in einer zweiten Gruppe, weiterhin
**Namen**, serverseitig wie in UX-004. Fassung 1 hätte sie ganz verlagert; der
Schritt mehr aus einem Termin heraus entfällt damit wieder. Die Patientensuche
steht **zusätzlich** im Bereich „Patient:innen", klinische Inhalte findet die
Leiste nicht (ANN-061). Gebaut in UX-013. Wo: UX-004; `../development/CAL-EPIC-004.md`.

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
| Ist externes Error-Tracking zulässig, und wie werden Redaction-Regeln erzwungen und getestet? | ADR-002, ADR-011 | OPS-004 (G8) |
| Wie wird „keine Produktionsdaten in Dev/Test" technisch abgesichert? | ADR-002 | OPS-001, OPS-002 |
| Frontend-Hosting und dessen Prüfung; `service_role` nie im Browser; Nachweis der Freigabe | ADR-015, ADR-013 | OPS-002 (G5) |
| Schweregrade im Dependency-Scan | ADR-013 | ANN-054 (Schwelle `high`); OPS-002 (G5) |
| Backup-Lebenszyklus, Notfallzugang, Restore-Dokumentation, Degraded-Kerninformationen | ADR-012 | OPS-003 (G7), E2 (G11) |
| Schwelle „größerer Export"; Eskalation beim Report | ADR-010 | OPS-005 (G6) |
| Wie werden Berechtigungsänderungen protokolliert; Umgehungsschutz des Policy-Layers | ADR-004 | STAFF-EPIC-002, OPS-005 |
| Löschnachweis nach Restore; Legal-Hold-Rechte; Teamchat rollierend löschen | ADR-008 | ANN-033; LOE-002; TEAM-001 |
| Rechtsgrundlage je Verarbeitung und Einwilligungsmodell; Betroffenenrechte technisch | ADR-007 | PAT-006 (G9), OPS-006 (G10), G12 |
| Nummernkreis, Snapshot-Felder, Storno-Kette, Empfängertypen, „überfällig" ohne Mahnwesen | ADR-009 | ABR-EPIC-002 |
| Abrechenbare Ereignisse neben Terminen; Katalog global oder je Organisation; Datentyp für Geldwerte | ADR-009, ADR-003, ADR-014 | ABR-001 |
| Zeitzonen bei wiederkehrenden Terminen und Kalenderjahr-Fristen | ADR-014 | CAL-007, LOE-001 |
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
