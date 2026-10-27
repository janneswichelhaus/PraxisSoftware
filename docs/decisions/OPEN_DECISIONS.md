# Offene Entscheidungen
Zuletzt aktualisiert: 2026-10-27 · Struktur 5.0

Was offen ist, warum, und was daran hängt. **Ohne Rang** (§21): Entschiedenes steht mit Fundstelle
in ADR, Prinzipien oder Annahmenregister. Ein offener Punkt blockiert kein Bauen (§15.2); was eine
Aufgabe braucht, wird als `ANN-NNN` getroffen (§15.1). Wortlaut der Anfragen:
[`ANFRAGEN.md`](ANFRAGEN.md); Unterlagen der Datenschutzprüfung:
[`../datenschutz/README.md`](../datenschutz/README.md). Stand bis 2026-10-27 mit allen
Begründungen: `git show 9452575:docs/decisions/OPEN_DECISIONS.md`.

**`vorläufig entschieden (Jannes)`**: Eine externe Stelle prüft Jannes' Festlegung (Verantwortlicher
nach Art. 4 Nr. 7 DSGVO), sie trifft sie nicht. Fürs Bauen zählt das wie `entschieden`, für die
Freigabe wie `offen`: Das Go-live-Gate (M3) verlangt, dass kein Datenschutz- oder Rechtspunkt mehr
`offen` oder `vorläufig entschieden` ist; jeder nennt den Preis der Rücknahme (`klein`, `mittel`,
`groß`). So nicht entscheidbar sind B8 (eine Auskunft), die externe MDR-Prüfung (§17, ADR-006
Punkt 7, MUSS) und die sieben Unterlagen aus ADR-007 Punkt 5.

**Kennungen** werden nie neu vergeben: `E12` sind Punkte dieses Dokuments, `E-20`/`E-21`
Rückfragen zu ADR-019, `E-1` bis `E-7` Jannes' Entscheidungen vom 2026-09-23
(`git show eb43569:docs/development/archiv/UMBAU.md`). Dringlichkeit: **P1** vor dem ersten
fachlichen Datenmodell des Bereichs, **P2** vor dem Feature, **P3** später.

## Offene Punkte
- **A2 — Anbieterprüfung Supabase (OPS-001)** · offen · P1 · Anbieter entschieden (ADR-002,
  ADR-015; ANN-007, ANN-025, ANN-043, ANN-044), die Prüfung nach ADR-002 Punkt 3 nicht bestanden:
  zwölf Gate-Punkte in Teil 8 von [`providerpruefung-supabase.md`](providerpruefung-supabase.md), G3.
- **B1 — MDR / EU AI Act: Zweckbestimmung** · vorläufig entschieden 2026-09-08 (Jannes) · externe
  Prüfung offen (§17, ADR-006 Punkt 7, G15) mit B10, Cut-off-Anzeige und Pflege der Zweckbestimmung
  (ADR-006, Folgefragen); bis dahin bleibt `MDR_REVIEW_REQUIRED` gesperrt (`src/app/mdr.ts`). ANN-014.
- **B2 — DSFA, Datenschutzbeauftragter, VVT, TOM, Meldeprozess** · Prozess entschieden (ADR-007) ·
  DSB vorläufig entschieden 2026-09-08 (Jannes): ja, extern, auch ohne Pflicht nach Art. 37 DSGVO
  und §38 Abs. 1 BDSG, weil Gesundheitsdaten die Kerntätigkeit sind; Rücknahme `klein` · offen:
  Schwellwertprüfung, DSFA, Unterlagen aus ADR-007 Punkt 5, Nachweistabelle MUSS → Test (D); G14.
- **B3 — Fristen der Aufbewahrung** · Modell entschieden (ADR-008), gebaut in LOE-EPIC-001 · offen:
  Validierung mit B2, Belegfristen mit B4. Fristen stehen nur in `public.retention_classes`, jede
  interne mit ihrer Annahme im `assumption_key` (Abfrage im Index der Datenschutzprüfung); ANN-001.
- **B4 — Steuerliche Validierung** · vier Festlegungen vorläufig entschieden 2026-09-08 (Jannes) ·
  Fragen 1 bis 7 an die Steuerberatung offen ([`ANFRAGEN.md`](ANFRAGEN.md) B4; ADR-009, §19, G13).
  ANN-035, ANN-074, ANN-075, ANN-082, ANN-088; Rechnungstext für Fall 1 aus E14.
- **B5 — Patientenidentität und Vertretung** · Rahmen vorläufig entschieden 2026-09-08, Verfahren
  2026-09-30 (Jannes) in ADR-023 Abschnitt C, vorläufig bis zur Antwort · rechtliche Bestätigung
  offen ([`ANFRAGEN.md`](ANFRAGEN.md) B5) · P1 für die Plattform.
- **B7 — Adressdaten an den Kartendienst** · Weg C vorläufig entschieden 2026-09-08 (Jannes): PTV
  Developer mit OSM-APIs als Kandidat, kein Google-Backend (ADR-019) · offen: Gate aus ADR-019
  Punkt 9 vor echten Adressen ([`providerpruefung-kartendienst.md`](providerpruefung-kartendienst.md)
  Teil 5, G12). Fahrzeiten nie gespeichert oder je Person ausgewertet (§20). ANN-016 bis ANN-018.
- **B8 — Lizenzen für Fragebögen und PROMs** · Nutzung erklärt von Jannes (2026-09-19, 2026-09-21
  für alle Vorlagen in `quellen/scores/pdf/`) · offen bis M3: schriftlicher Beleg des Lizenzgebers;
  bis dahin trägt jedes Instrument seinen Lizenzstatus (ANN-086).
- **B9 — Betreuung ohne und nach Heilbehandlung** · vorläufig entschieden 2026-09-07/08 (Jannes):
  ein Unternehmen, Training getrennt von der Akte (ADR-021), Ernährung nach ADR-027 · offen: Steuer
  mit B4, Datenschutz mit B2, Berufsrecht der Ernährung ([`ANFRAGEN.md`](ANFRAGEN.md) B9).
- **B10 — Automatisierte Progression** · vorläufig entschieden 2026-09-08 (Jannes): in V1
  ausgeschlossen, jeder Schritt von der Therapeut:in bestätigt, keine Ampel (§17, ADR-006 Punkt 10)
  · Bestätigung mit B1 ([`ANFRAGEN.md`](ANFRAGEN.md) B10). ANN-014.
- **C6 — AI Privacy Gateway** · Gateway entschieden (ADR-005); Schutzumfang vorläufig entschieden
  2026-09-08 (Jannes): fünf Vertragszusagen statt Pseudonymisierung ([`ANFRAGEN.md`](ANFRAGEN.md)
  C6) · offen: Anbieter, Modell, Spracherkennung (E13), Zweck → Felder, Protokoll, Freigabenachweis.
- **E2 — Ausfallkonzept**, zugleich Rückfallplan der Eröffnung (ADR-012 Punkte 8 und 9; G10, H4) ·
  Kern vorläufig entschieden 2026-09-08 (Jannes): Tagesliste morgens geöffnet oder gedruckt, ohne
  Export (ANN-021); Dokumentation auf Papier, Nachtrag binnen 24 Stunden mit Begründung „Ausfall“
  (ADR-016); Rechnungen ruhen, keine Nummer von Hand (§14 UStG). Abbruch bei Datenverlust,
  Falschzuordnung oder mehr als einem Tag · offen: Betriebsdokument (eine Seite) · P1 vor Go-live.
- **E13 — Sprachdokumentation** · Anforderung entschieden (§6.3), im Mock-Betrieb überbrückt durch
  ANN-520 · offen, blockiert nichts (P3): Anbieter (C6), Rohaudio im Betrieb (keine Datenklasse in
  ADR-008), Fristanker bei später Übernahme (ADR-016 Punkt 7, ANN-008), Inhaltstreue und Architektur
  des Vorschlags (ADR-016 Punkt 10), Bedienung; ADR-005 Punkt 9, ADR-006 Punkt 8.

## Externe Prüfungen
Gehen ab Anfang 2027 hinaus, parallel zum Bauen, sobald ihre Unterlagen stehen (E-1); was danach
noch gebaut wird, folgt als Nachtrag. Bis zur Antwort trägt jeweils die genannte Festlegung.

| Punkt | Gegenstand | Wer | Bis dahin trägt |
| --- | --- | --- | --- |
| OPS-001 | Supabase: zwölf Gate-Punkte, Objektspeicher, Edge Runtime | Jannes, Support | [`providerpruefung-supabase.md`](providerpruefung-supabase.md) |
| B2 | DSFA-Schwellwert, DSB, DSFA über den ganzen Umfang; E15, Einwilligung im Training, Office-Sicht (§4.8), Screening-Frist, Handoff und Führung (ADR-019 Punkt 23, §20.1), Plattform, Ernährung, Fotos von Patient:innen, Zweckbindung der Erinnerung an das Abschlussgespräch (§4.10) | externe Datenschutzberatung | vorläufige Festlegungen und Register; Unterlagen: [`../datenschutz/README.md`](../datenschutz/README.md) |
| B1 | Zweckbestimmung, MDR-Abgrenzung, EU AI Act; B10 mit | externe Prüfstelle | ADR-006, §17, Register `src/app/mdr.ts` |
| B4 | Steuer: Leistungsarten, § 19 UStG, Nummernkreise, ermäßigter Satz, Nachsorge-Abo, Pakete nach Zeitraum, E14 Fall 1, Belegfristen, Gewinnermittlung (B9, ANN-088) | Steuerberatung | ANN-074/075/082/088 |
| B3 | Validierung der Fristen (ANN-001) | im DSFA-Prozess | ANN-001 |
| B5 | Identität und Vertretung im Portal | Jannes, ggf. Beratung | ADR-023 |
| B8 | schriftlicher Lizenzbeleg | Lizenzgeber | Jannes' Bestätigung vom 2026-09-21 |
| B9 | Ernährungsberatung berufsrechtlich (auch bei Patient:innen, ADR-027), Betreuung ohne Heilbehandlung | Beratung | Festlegungen in [`ANFRAGEN.md`](ANFRAGEN.md) B9, ADR-021, ADR-027 |
| Anbieter | PTV (Gate ADR-019), SMTP (B13, BEF-026), SMS (B15), KI (C6, ADR-005), Zahlungsdienst (falls Kartenzahlung), Frontend-Hosting (G5) | Jannes mit Claude-Dokument | `mock`-Adapter; jeder Anbieter bleibt abschaltbar |

## Folgefragen aus den ADRs
Planungsrelevant, weil ohne sie ein Paket der Roadmap nicht fertig wird; beantwortete: Git (oben).

| Frage | ADR | Beantwortet in |
| --- | --- | --- |
| Wer führt die Anbieterprüfung durch, wo wird sie dokumentiert, wie oft wiederholt? | ADR-002 | OPS-001 (G3) |
| Wie wird „keine Produktionsdaten in Dev/Test“ technisch abgesichert? | ADR-002 | OPS-001, OPS-002 |
| Frontend-Hosting und dessen Prüfung; `service_role` nie im Browser; Nachweis der Freigabe | ADR-015, ADR-013 | B16; OPS-002a, OPS-002 (G5) |
| Schweregrade im Dependency-Scan | ADR-013 | ANN-054 (Schwelle `high`); OPS-002 (G5) |
| Backup-Lebenszyklus, Notfallzugang, Restore-Dokumentation, Degraded-Kerninformationen | ADR-012 | OPS-003 (G7), E2 (G10) |
| Wie werden Berechtigungsänderungen protokolliert; Umgehungsschutz des Policy-Layers | ADR-004 | STAFF-EPIC-002, G6 |
| Löschnachweis nach Restore; Legal-Hold-Rechte; Teamchat rollierend löschen | ADR-008 | ANN-033; LOE-002; TEAM-001 |
| Rechtsgrundlage je Verarbeitung und Einwilligungsmodell; Betroffenenrechte technisch | ADR-007 | PAT-006 (G8), OPS-006 (G9), G14 |
| Zeitzonen bei wiederkehrenden Terminen und Kalenderjahr-Fristen | ADR-014 | Terminserie (ANN-038), LOE-001 |
| Begründung als Pflichtfeld; Frist bei Hausbesuchen am Freitag; Azubi-Rolle | ADR-016 | ANN-008; STAFF-EPIC-002 |
| Offline: Felder, Unsynchronisiert-Dauer, Konfliktauflösung, Geräteanforderungen, Audit offline | ADR-001 | ANN-021; ADR-024 |
| Kartendienst: Anbieter, Datenweg, Vertragsgrundlage, Endgerät | ADR-002, §9, §20 | ADR-019 (G12); B7 |
| Liefern `OSM_BICYCLE` und `OSM_CARGO_BICYCLE` Manöver? (E-24) | ADR-019 | ein Aufruf vor MAP-007 (Roadmap) |

## Entschieden oder erledigt
| Punkt | Entscheidung | Fundstelle |
| --- | --- | --- |
| A1 | Online-first mit begrenzter Offline-Fähigkeit (2026-08-28) | ADR-001, ADR-024 |
| A3 | `organization_id` und `location_id` (2026-08-28) | ADR-003 |
| A4 | Berechtigungsmodell (2026-08-28) | ADR-004 |
| B6 | Umsatz je Person ja; Orts-, Touren- und Arbeitszeitdaten nie zur Leistungskontrolle (2026-09-29); Rechtsgrundlage und Information der Beschäftigten im Prüfpaket | §20; ANN-156, ANN-157 |
| B11 | Training als Paket nach Zeitraum, Plattform im Preis; Nachsorge-Abo als Monatsrechnung (2026-09-22/23); kein Rabatt für Bewertungen; Steuer in B4 Frage 6 | ADR-009 Punkt 21 |
| B12 | Kein Altsystem, Nummernkreis ab der ersten Rechnung (2026-09-06); Format in B4 Frage 3 | ADR-009 Punkt 8 |
| B13 | Eigener SMTP-Anbieter (2026-10-10), bis dahin Adapter mit `mock`, STAFF-004 ruht; welcher, klärt die Anbieterprüfung | ADR-002; BEF-026; ANN-025, ANN-043 |
| B14 | Druckansichten mit `@media print` (2026-09-06); Rechnungs-PDF: Weg 1 Browserdruck jetzt, Weg 3 serverseitig nach OPS-001 (2026-09-19); bis dahin wird der Snapshot aufbewahrt, nicht das Dokument | ADR-009 Punkte 11 und 14; `git show eb43569:docs/decisions/rechnungs-pdf-optionen.md` |
| B15 | Erinnerung und Online-Anfrage in V1 hinter Adapter, scharf nach der Anbieterprüfung; E-Mail vor SMS, kein Messenger (2026-09-22); offen: Anbieter, Einwilligung je Person | §3.5, ADR-002, ADR-007; ANN-039, ANN-040, ANN-041 |
| B16 | Oberfläche auf Uberspace (2026-09-23), Konten seit 2026-09-25; Prüfung nach ADR-002 vor echten Daten (G5) | [`../betrieb/test-umgebung.md`](../betrieb/test-umgebung.md) |
| B17 | Terminhonorar als Einzelpositionen je Heilmittel, anteilig nach Preisen, eine Rechnung je Verordnung (2026-10-05); Vergleichsbetrag offen bis zum ersten Erstattungsfall | ADR-009 Punkte 22 und 23; ANN-233 |
| C1 | Leistungsziffern und Office (2026-09-05), überholt durch E15 | §4.4; ANN-006 |
| C2 | Klinische Inhalte in organisatorischer Kommunikation (2026-09-05), überholt durch E15 | §10 |
| C3 | Fail-closed gegen Patientensicherheit, Break Glass (2026-08-28) | ADR-010 |
| C4 | Auditlog als Kompensation (2026-08-28) | ADR-010; Roadmap G6 |
| C5 | Provider-Oberflächen, Admin-Trennung (2026-08-28) | ADR-010 |
| C7 | LLM und deterministische Regeln getrennt; Wortlaut in §6 und §7.1 bei der nächsten Prinzipienversion | ADR-005 Punkt 6 |
| C8 | „Nicht verbauen“ gegen „nicht vorbauen“ (2026-08-28) | ADR-014 |
| D | Begriffe: „finalisiert“, „nachvollziehbar“ (2026-09-01), „bestätigt“ als Terminzustand (2026-09-11); „auditierbar“ → C4, „organisatorische Patientenkommunikation“ → C2, „Behandlungsnachweis“ → C1, „Praxisinhaber vs. Admin“ → C5, „technisch getrennt“ → ADR-002 | ADR-016, ADR-018; ANN-034, ANN-036 |
| D | Normativität (Version 0.2); die Nachweistabelle MUSS → Test ist offen mit B2 | §0; Roadmap G14 |
| E1 | Betreibbarkeit bei Bus-Faktor 1 (2026-08-28) | ADR-012; Roadmap G7 |
| E3 | Backup, RPO/RTO, Restore-Test (2026-08-28) | ADR-012; Roadmap G7 |
| E4 | Produktionszugriff (2026-08-28) | ADR-010 |
| E5 | Produktions-Logs (2026-08-28) | ADR-011; Roadmap G6 |
| E6 | Synthetische Testdaten: Der Seed ist der Generator | `supabase/seed.sql` |
| E7 | CI-Gates, Branch Protection (2026-08-28) | ADR-013; Roadmap G5 |
| E8 | Dateiablage, alle acht Fragen wie empfohlen (2026-09-12); produktiv an OPS-001 und OPS-003 gebunden | ADR-017; ANN-052, ANN-053 |
| E9 | Dokument-Governance (2026-08-28) | §21 |
| E10 | Mitarbeiterdaten: Privatangaben folgen dem Leserecht (2026-09-11, STAFF-002a) | §4.3, §4.5; ANN-024 |
| E11 | Behandelnde Person: Konten und Rollen entstehen in der Anwendung (2026-09-11, STAFF-002b) | ANN-025, ANN-026 |
| E12 | Terminfenster: Raster (§8.1), Länge frei mit Kennzeichen bei Abweichung von 45/60 (2026-09-16, CAL-020), Fahrpuffer warnt und sperrt nie, Fahrzeit live (MAP-006); offen: Punkt 4 wartet auf echte Zahlen | §8.1, ADR-019 Punkt 16; ANN-049, ANN-056, ANN-097 |
| E14 | Hausbesuch: Tür geöffnet ohne Behandlung → durchgeführt mit Vermerk; nicht angetroffen nach Protokoll und Absage unter 24 Stunden → Ausfallgebühr (2026-09-13); Rechnungstext für Fall 1 mit B4 | §8, ADR-018 Punkt 9; ANN-035, ANN-047, ANN-048, ANN-055 |
| E15 | Office liest klinische Inhalte im Umfang der Therapeut:innen, schreibt keine Dokumentation, jeder Zugriff auditpflichtig (2026-09-13); Prüfvermerk für B2 | §4.3, §4.4, §10; ADR-004 Punkt 3; ANN-011 |
| E16 | Eine Klammer „Behandlungsgrundlage“, Verordnung und Selbstzahler als Bauarten; abgerechnet auch vor ihrem Ende (2026-09-16) | ADR-020; §19 |
| E17 | Kopfleiste sucht Funktionen, darunter Namen, nie klinische Inhalte; Patientensuche zusätzlich im Bereich (2026-09-18) | ANN-061; `git show eb43569:docs/development/archiv/CAL-EPIC-004.md` |
| E-20 | ADR-019 Fassung 2 angenommen (2026-09-13); produktive Freigabe am Gate (B7) | ADR-019 Punkt 9 |
| E-21 | Reihenfolge MAP-002 zu UX-EPIC-001: gegenstandslos (2026-09-13) | Roadmap |
