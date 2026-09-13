# Referenz: Funktionen vergleichbarer Praxisprogramme

> Nicht normativ. Siehe [../IDEENSPEICHER.md](../IDEENSPEICHER.md). Rang 6 —
> diese Datei begründet **keinen** Scope. Sie beantwortet je Bruchstelle „wie
> lösen es andere", nie „was fehlt uns" (`docs/development/OPTIMIERUNG.md`,
> Abschnitt 13).

Stand der Recherche: 2026-09-05/06. Auftrag von Jannes: Welche Funktionen
haben iPrax, THEORG, thevea und vergleichbare Terminierungsprogramme, die bei
uns fehlen — so detailliert wie möglich. Die Spalte „Bei uns" trägt den Stand
vom **2026-09-13** nach `../../development/ARBEITSBEREICHE.md`; sie sagt, was
ist, nicht, was wann kommt. **Die Reihenfolge steht allein in
`../../development/ROADMAP.md`.**

## Wie recherchiert wurde, und was das bedeutet

- **Produkte:** iPrax (iPrax Systems), THEORG mit THEORG 2GO, Klemmbrett und
  TheraConnect (SOVDWAER), thevea mit Scan-App (thevea GmbH, opta data),
  appointmed (appointmed GmbH), Optica Viva (PRAXINO/Optica), MD Therapie
  (MEDIFOX DAN), dazu Streiflichter auf Starke Praxis (buchner), azh TiM,
  NOVENTI Ora, PraxWin, henara, tinana, cituro, tomedo, Lemniscus.
- **Umfang:** 588 belegte Einzelfunktionen (iPrax 97, THEORG 112, thevea 105,
  appointmed 114, Optica und weitere 111, Querschnitt Hausbesuch/Mobil 49),
  dazu 60 Prüfkriterien von Vergleichsportalen, 56 Nutzererwartungen und 18
  Schmerzpunkte aus Foren und Bewertungen. Diese Datei führt je Funktion ein
  bis zwei Belege; eine vollständige Rohdatensammlung liegt nicht im
  Repository.
- **Nachrecherche:** Jannes hat am 2026-09-06 entschieden, vorerst keine
  Nachrecherche mit Bildschirmfotos zu beauftragen (E-14). Einträge, die als
  „nicht belegt" markiert sind, bleiben so stehen.
- **Quellenart, ehrlich:** Der Egress-Proxy der Cloud-Umgebung blockiert alle
  Hersteller-, App-Store-, Hilfecenter- und Vergleichsseiten. Gearbeitet wurde
  deshalb ausschließlich mit der Websuche, die je Treffer die URL und eine
  Zusammenfassung des Seiteninhalts liefert. **Keine Seite wurde direkt
  gelesen, kein Bildschirmfoto angesehen.** Was über Oberflächen gesagt wird,
  stammt aus Herstellertexten, App-Store-Beschreibungen, Hilfeartikeln und
  Testberichten. Konfidenz je Funktion: `hoch` = Herstellerseite, Handbuch,
  App-Store; `mittel` = Vergleichsportal, Presse; `niedrig` = Forum oder
  unklar. Das Suchkontingent der Session (200 Anfragen) war vor Abschluss
  erschöpft; bei THEORG, thevea und Optica fehlen deshalb einzelne Details
  (Handbuchkapitel, Rechtemodell, Rechnungslayout).
- **Wer prüfen will:** URL auf einem Rechner ohne Proxy öffnen. Eine
  Nachrecherche mit Screenshots ist als Entscheidung im Review genannt.

## Die Produkte im Überblick

| Produkt | Hersteller, Plattform | Positionierung | Mobil und Hausbesuch | Preis (Quelle, ungeprüft) |
| --- | --- | --- | --- | --- |
| **iPrax** | iPrax Systems; native Apps für Mac, iPad, iPhone; kein Web, kein Windows | Heilmittelpraxen im Apple-Ökosystem, bis 20 Therapeut:innen | **Offline-first** mit Hintergrund-Synchronisation; Termine, Rezepte, Patientendaten beim Hausbesuch; SumUp vor Ort | einmalig ab 699 € plus ab 49 €/Monat; Forum: ca. 800 € und 150 €/Monat |
| **THEORG** | SOVDWAER; Windows-Desktop (lokal oder Cloud-Hosting), Apps 2GO, Klemmbrett, TheraConnect | Gewachsener Vollsystem-Monolith, stark GKV-geprägt, über 17 000 Praxen | 2GO ohne lokale Daten (kein Offline), Terminplan bearbeiten, Doku mit Fotos, Navigation zum Hausbesuch | nur auf Anfrage; Forum: ca. 270 €/Monat bei 14 Spalten und Modulen |
| **thevea** | thevea GmbH (opta data); Browser, Apps iOS/Android, Scan-App | Moderne Cloud-Lösung, verordnungszentriert, GKV über Abrechnungsstelle | Offline nur lesender Kalender; Diktat in der App; Therapieform „Hausbesuch" | Starter 39,90 · Basis 69,90 · Plus 99,90 € netto/Monat |
| **appointmed** | appointmed GmbH (Wien); Browser, Apps iOS/Android | Terminlogik und Privatabrechnung, DE/AT, Wahltherapeut:innen | kein Offline belegt; „Hotspot reicht"; SumUp unterwegs; Face ID | MINI 45 €, BASIC 85 €/Benutzer/Monat; SMS 0,13 € |
| **Optica Viva** | PRAXINO (Optica); Web-App im Browser | Cloud-System des Abrechnungszentrums, TI, Mahnwesen | Browser auf Smartphone, kein Offline belegt | Inhaberlizenz 38 €/Monat, weitere je Rolle |
| **MD Therapie** | MEDIFOX DAN; Browser, PraxisPad, Smartphone-App | Cloud für Teams und Ketten | Fahrzeiten beim Planen, Karte mit Patientenstandorten, KI-Tourenplanung, Navigation | auf Anfrage, 24 Monate Laufzeit |

Nutzerkritik, die wiederkehrt: schwer erreichbarer Support (THEORG, NOVENTI/
azh), Abstürze und Instabilität (thevea 2025/26), altbackene Oberflächen
(Starke Praxis), hoher Einrichtungsaufwand (THEORG), schleichende
Zusatzkosten (buchner), Bindung an ein Abrechnungszentrum (thevea), mobile Apps
„super unpraktisch" zum Verschieben und Rezeptanlegen (THEORG 2GO), fehlende
Online-Buchung (iPrax, seit Jahren gewünscht). Nutzerlob: Support mit
Praxishintergrund und Live-Chat (thevea, appointmed), Offline beim Hausbesuch
(iPrax), Bedienung ohne Ballast.

## Legende der Spalte „Bei uns"

`vorhanden (<ID>)` — funktional angebunden, Kennung der Story
(`ARBEITSBEREICHE.md`) · `Vorschau` — nur Arbeitsspeicher · `geplant <ID>` —
als Zeile in `ROADMAP.md`; **wann**, sagt nur die Roadmap · `IDEA-…` — im
Ideenspeicher · `fehlt` — nirgends · `n. r.` — nicht relevant für eine Praxis
ohne Räume und ohne GKV-Abrechnung.

Spalte „Einordnung", ohne Reihenfolge: **Idee** (Ideenspeicher, kein Termin),
**Entscheidung** (Spur B, mit Kennung), **außerhalb** (Prinzipien, ADRs oder
Zielbetrieb schließen es aus), **Vorsprung** (wir haben es, viele Wettbewerber
nicht), **Komfort** (Roadmap-Kategorie neben Kern), **—** (nichts davon).

---

## 1. Terminplanung

| Funktion | Bei wem (Beleg) | Bei uns | Einordnung |
| --- | --- | --- | --- |
| Terminserie aus der Verordnung, Serie mit Intervall in einem Schritt, Dauertermine; Automatik berücksichtigt Urlaub | Standard: iPrax, THEORG, thevea, appointmed, Optica, MD ([appointmed](https://intercom.help/appointmed/de/articles/2681779-serientermine-und-terminserien-erstellen-bearbeiten-loschen), [THEORG](https://sovdwaer.de/terminplan)) | vorhanden (CAL-007): Serie aus der Verordnung in einem Vorgang, Anzahl aus dem Kontingent, drei Rhythmen, Konfliktprüfung je Zeile, Einzelabweichung; Dauertermine ohne Verordnung und Urlaubsautomatik fehlen | — |
| Automatische Terminsuche: freier Slot nach Person, Dauer, Wunschzeit; thevea „Termine planen" trägt eine ganze Verordnung ein | Standard: iPrax, THEORG, thevea, appointmed, MD, Optica ([thevea](https://support.thevea.de/hc/de/articles/7405528194461-Freie-Termine-finden-mit-Hilfe-der-Funktion-Termine-planen)) | fehlt; stattdessen der Kalender als Suchfläche mit ausgewählter Person oder Verordnung (CAL-015c) | Idee `IDEA-PRX-008` |
| Warteliste mit Wochentag-/Tageszeitpräferenz, Dringlichkeit; bei Absage passende Einträge, Anruf aus der App, Nachrücken | Standard: iPrax, THEORG, thevea, appointmed, Optica, MD, henara ([iPrax](https://www.iprax-systems.com/praxissoftware/physiotherapie-software.html)) | fehlt | Idee `IDEA-PRX-003`; Nachrücken automatisch: Entscheidung B15 (nein) |
| Folgetermin ohne Neuauswahl („Weiterer Termin"), Anlegen per Tap auf freie Zeit, Kopieren, Drag & Drop | iPrax ([App Store](https://apps.apple.com/de/app/iprax/id529795949)), thevea | vorhanden: Folgetermin mit Vorbelegung (UX-003), Tap auf freie Zeit (UX-005), Ziehen mit langem Druck und Rückgängig (UX-010); Kopieren fehlt | — |
| Kollisions-, Abstands- und Frequenzprüfung beim Anlegen; Qualifikation und Zeit je Therapeut:in | THEORG ([Terminplan](https://sovdwaer.de/terminplan)), appointmed, iPrax | Überschneidung und Arbeitszeit vorhanden (CAL-005); Terminlänge 60 oder 45 Minuten serverseitig (CAL-010a, CAL-015b); Fahrpuffer geplant MAP-006 (E12 Punkt 3/4: nur aus dem Kartendienst); Qualifikation fehlt | — |
| Fahrzeiten zwischen Hausbesuchen automatisch einplanen, Karte mit Patientenstandorten | MD Therapie ([Physiotherapie](https://www.medifoxdan.de/software-therapeuten/fachbereiche/physiotherapie)); bei iPrax, THEORG, appointmed nicht belegt | Vorschau Touren; geplant MAP-002 bis MAP-006 (ADR-019 Fassung 2, E-20 angenommen 2026-09-13); produktive Freigabe am Vertrags-/§203-/DSFA-Gate | Entscheidung B7 → ADR-019 (Gate) |
| Terminstatus mit Absage, Absagegrund, Information an die Person (SMS/E-Mail) | appointmed ([Absage-SMS](https://intercom.help/appointmed/de/articles/3302368-information-uber-abgesagte-geanderte-termine-via-sms)), Optica, thevea | vorhanden: sechs Zustände nach ADR-018, Absage nur mit codiertem Pflichtgrund (CAL-008); Information an die Person nur als E-Mail-Entwurf im Praxispostfach auf Klick (CAL-013), keine automatische Nachricht, keine SMS | Entscheidung B15 (keine automatische Benachrichtigung; Messenger ausgeschlossen) |
| No-show-Status und Ausfallhonorar | iPrax (Ausfallhonorar-Rechnung); bei appointmed nicht belegt; thevea nur Vorlagen | vorhanden: „nicht angetroffen" (CAL-008, CAL-014c); Gebührenanlass bei Patientenabsage unter 24 Stunden serverseitig aus dem Eingang (CAL-014), ohne Betrag bis ABR-001; Gebühr beim Nichtantreffen nach Protokoll entschieden (E14, 2026-09-13), Umsetzung CAL-018 | — |
| Terminzettel oder Terminübersicht je Person drucken, per E-Mail oder SMS senden; Tages-/Tourenliste je Mitarbeiter:in drucken | THEORG, appointmed ([Terminübersicht](https://intercom.help/appointmed/de/articles/3064727-terminubersicht-fur-einen-patienten-drucken-senden)), iPrax, Optica | vorhanden: Terminzettel je Person als Druck (CAL-011) und als E-Mail-Entwurf im Praxispostfach (CAL-013), Mitteilungsvermerk am Termin (CAL-012); SMS nein (B15); Tages-/Tourenliste geplant E2 und MAP-006 | Idee `IDEA-PRX-006` (PDF, Tourenliste) |
| Farbcodierung je Leistung, Therapieform, Person; freie Termine hervorgehoben; Hausbesuch als Farbe | appointmed, thevea ([Kalender](https://support.thevea.de/hc/de/articles/7405107580317-Terminkalender-in-thevea-Alles-was-du-wissen-musst)), iPrax, THEORG | nur Status als Text | Komfort, UI-001, Idee `IDEA-PRX-021` |
| Ansichten Tag, Woche je Person, Monat mit Termindichte; Öffnungszeiten grau, individuelle Verfügbarkeit überschreibt sie; Raster bis 5 Minuten | iPrax, appointmed ([Öffnungszeiten](https://intercom.help/appointmed/de/articles/2635040-offnungszeiten)), thevea 25-Minuten-Takt | Tag und Woche vorhanden, Arbeitszeiten je Person vorhanden, Raster 5/10/15 Minuten (CAL-005), Gitter zoombar (CAL-011), Patientenfilter (AKTE-003); Monat fehlt | Komfort |
| Abwesenheiten (Urlaub, Krankheit, Fortbildung) blockieren den Kalender | thevea, appointmed, iPrax | Ausnahmen je Person vorhanden (CAL-005); Urlaub Vorschau, geplant URL-001 (Spur A2) | — |
| Änderungsprotokoll je Termin sichtbar | thevea (Plus) | Änderungen serverseitig protokolliert (CAL-003), Audit | Vorsprung |
| Räume, Geräte, Fahrzeuge als Ressourcen mit Doppelbelegungsschutz | alle | n. r. (keine Räume); Rad als Ressource geplant FLT-EPIC-001 (Spur A2) | — |
| Gruppentermine, Passivleistungen, Kurse | THEORG, thevea, iPrax | n. r. für Patient:innen; Ereignisse des Praxisbetriebs ohne Patient:in (Besprechung, Teamtermin) vorhanden (CAL-015b, CAL-017) | außerhalb |
| Online-Terminvergabe oder -anfrage, die die Praxis bestätigt; Patienten-App (TheraConnect) | Standard: THEORG, thevea (od bookings), appointmed, Optica, MD, tinana, cituro; **nicht** iPrax | fehlt; Portal (Etappe 4) | Entscheidung B15 (setzt Portal und B5 voraus) |

## 2. Patientenverwaltung

| Funktion | Bei wem (Beleg) | Bei uns | Einordnung |
| --- | --- | --- | --- |
| Abweichender Rechnungsempfänger (Angehörige, Betreuung, Beihilfe); beide auf der Rechnung; verknüpfte Kontakte je Patient:in | THEORG, appointmed ([verknüpfte Kontakte](https://intercom.help/appointmed/de/articles/2954273-interne-notizen-aufgaben-verknupfte-kontakte)), thevea | fehlt; geplant ABR-003a | Idee `IDEA-PRX-010` |
| Ärzte-/Verordnerkartei, Gemeinschaftspraxen, Arztdatenbank für Berichte | THEORG, thevea ([Arztverwaltung](https://support.thevea.de/hc/de/articles/19514624635549-Arztverwaltung)), Optica, iPrax | vorhanden (VER-001): Verordner:innen mit beruflichen Kontaktdaten, kein Patientenbezug; Gemeinschaftspraxen und Berichtsvorlagen fehlen | — |
| Interne Notiz getrennt von der Dokumentation; Besonderheiten; Patientenstatus | appointmed, thevea, iPrax | vorhanden: Status, Zugangshinweis und Besonderheit vor dem Hausbesuch (PAT-005) — im Kopf der Akte (UI-002a) und in der Tagesliste (UX-001); eine interne Notiz neben der Dokumentation fehlt | — |
| Akte als Gesamtübersicht: Stammdaten, Verordnungen, Termine, Rechnungen, Doku, Dateien, gesendete Nachrichten | thevea ([Patientenverwaltung](https://support.thevea.de/hc/de/articles/30365867196829-Patientenverwaltung-in-thevea-Alles-was-du-wissen-musst)), iPrax (fünf Bereiche) | vorhanden: Akte mit fünf Bereichen — Termine mit Historie und allen Zuständen, Verordnungen (laufend/ausgeschöpft), Behandlungsverlauf, Dateien, Stammdaten (AKTE-000 bis AKTE-005, VER-002, DAT-001); Rechnungen und gesendete Nachrichten fehlen, Mitteilungsvermerk je Termin vorhanden (CAL-012) | Idee `IDEA-QSN-001` (Zeitstrahl) |
| Dublettenprüfung und Zusammenführen | thevea ([Zusammenführen](https://support.thevea.de/hc/de/articles/19361932692125-Wie-kann-ich-Patienten-zusammenf%C3%BChren)) | fehlt | Idee `IDEA-PRX-018` |
| Patient:innen löschen oder inaktiv setzen | thevea | vorhanden: Status; Abschluss der Versorgung als Fristanker (LOE-001b), Retention Schedule, Löschlauf mit Journal, Legal Hold (LOE-EPIC-001, ADR-008) | Vorsprung |
| Import bestehender Stammdaten aus CSV/XLS; Wechselservice | iPrax ([FAQ](https://www.iprax-systems.com/praxissoftware/iprax_faq.html)), thevea, Optica | entfällt: kein Altsystem, die Praxis eröffnet am 01.07.2027 (Jannes, 2026-09-06) | — |
| Anmeldeformular zur Selbsteingabe per Link, SMS, QR-Code oder Tablet | appointmed ([Anmeldeformular](https://intercom.help/appointmed/de/articles/10751938-anmeldeformular-datenaktualisierung-fur-patienten)) | fehlt; Intake mit dem Portal (Etappe 4) | — |
| Direktkontakt: Tap auf Nummer oder E-Mail öffnet Telefon oder Mail | iPrax | vorhanden: `tel:`-Link in der Tagesliste und am Termin (UX-001); Mail nur als Terminzettel-Entwurf (CAL-013) | — |
| Aufgaben und Wiedervorlagen mit Patientenbezug, Fälligkeit, Zuweisung | appointmed ([Aufgaben](https://intercom.help/appointmed/de/articles/2785534-aufgaben-erstellen-erledigen-zuweisen-und-loschen)), MD | fehlt | Idee `IDEA-PRX-019` |
| Selektionen von Patientengruppen für Marketing und Erinnerungen; Serienbriefe | THEORG | fehlt | außerhalb (HWG, `IDEA-ANG-002` verworfen) |
| eGK einlesen, Versichertenstammdaten, Kostenträgerkartei, Zuzahlungsbefreiung | THEORG, iPrax, Optica | n. r. | außerhalb (GKV) |
| Patientenliste als CSV, kompletter Verlauf je Person exportierbar (DSGVO) | appointmed, Optica | fehlt; geplant OPS-006 (G9) | — |

## 3. Verordnung

| Funktion | Bei wem (Beleg) | Bei uns | Einordnung |
| --- | --- | --- | --- |
| Privatverordnung als Grundlage der Privatrechnung; Rezepttypen GKV, BG, Privat, Selbstzahler; Vorlage nachträglich ändern | thevea ([Privatverordnung](https://support.thevea.de/hc/de/articles/9205787402141-Wie-lege-ich-eine-Privatverordnung-an)), iPrax, THEORG | vorhanden (VER-001 bis VER-003): erfassen, ändern, löschen, nur therapeutische Rollen; Office sieht Kontingent und Verordner:in ohne Diagnose (ANN-011); Rezepttypen n. r. (nur privat) | — |
| Termin an Verordnung geknüpft mit Zähler (8/10), Terminblatt je Rezept, Kontingent automatisch verbraucht | thevea ([Verknüpfung](https://support.thevea.de/hc/de/articles/7404630950173-Wie-kann-ich-Termine-nachtr%C3%A4glich-mit-einer-Verordnung-verkn%C3%BCpfen)), THEORG | teilweise: der Termin kennt seine Verordnung (CAL-007), die Akte zeigt Leistungseinheiten, Termine und „noch planbar" (AKTE-002, ANN-038); Verbrauch bei der Leistungserfassung geplant ABR-002; Zähler am Termin fehlt | Idee `IDEA-PRX-009` |
| Rezepthistorie je Person, nach Jahr | iPrax | vorhanden: laufend und ausgeschöpft getrennt (VER-002, AKTE-002); Gliederung nach Jahr fehlt | — |
| Verordnung per Kamera erfassen: OCR, KI-Texterkennung, Prüfung, unsichere Felder markiert; Barcode am Smartphone beim Hausbesuch | thevea Scan-App ([Scan-App](https://thevea.de/scan-app/)), iPrax Clever-Scan, THEORG 2GO, MD, Optica | Scan als Anhang an der Verordnung vorhanden (VER-004; klinisch, für `office` unsichtbar); Erkennung fehlt, wäre ein KI-Pfad nach ADR-005 | Idee `IDEA-PRX-023` |
| Empfehlung oder Prognose zum Verordnungsende, Verordnungswertprognose | thevea (Prognose) | vorhanden: Empfehlung der Therapeutin an der Verordnung (VER-001, ANN-014); Prognose nein (ADR-006 Punkt 4) | — |
| Fristen- und Frequenzprüfung nach Heilmittelrichtlinie, Heilmittelkatalog, Blankoverordnung, Rahmenverträge, Teilabrechnung | alle GKV-Systeme | n. r. | außerhalb (GKV, ADR-009) |
| Rezeptanlage offline beim Hausbesuch | iPrax | fehlt; ADR-001 begrenzt Offline auf Tagesplan und Entwürfe | außerhalb V1 (ADR-001) |

## 4. Dokumentation und Befund

| Funktion | Bei wem (Beleg) | Bei uns | Einordnung |
| --- | --- | --- | --- |
| Textbausteine, persönlich und vorgefertigt, per Drag & Drop; Variablen aus der Akte | Standard: iPrax, thevea ([Textbausteine](https://support.thevea.de/hc/de/articles/25832498722717-Wie-kann-ich-Textbausteine-hinzuf%C3%BCgen-und-verwenden)), THEORG, Optica, MD | vorhanden: persönlich und praxisweit, per Tap (UX-008, ANN-020); keine Platzhalter aus der Akte, kein Drag & Drop | — |
| Körperschema (Body Chart) mit Markern; iPrax 3D-Modell in zehn Schichten; Winkelmessung Neutral-Null; Messreihen | appointmed ([Bodychart](https://intercom.help/appointmed/de/articles/2991775-bodychart)), THEORG, Optica, MD, iPrax | fehlt; Befund geplant FRB-EPIC-001/002 (Etappe 2) | Idee `IDEA-PRX-027` |
| Fotos, Videos, Dateien an Termin oder Doku; Quick-Scan vom Smartphone | iPrax, thevea, MD, appointmed, Optica | vorhanden an der Akte: Dateien mit Dokumentart als Rollenschnitt, signierte Verweise mit 60 Sekunden, zweistufige Löschung, Abgleich (DAT-001 bis DAT-003, ADR-017); an Termin oder Doku nicht, kein Quick-Scan, kein Upload durch Patient:innen | Idee `IDEA-KOM-003` (Foto mit eigener Einwilligung) |
| Diktat und Spracheingabe (Systemdiktat, Siri); Nutzerkritik: Fachwörter | iPrax, thevea ([Diktat](https://support.thevea.de/hc/de/articles/33072824460445-Diktieren-von-Berichten-Dokumentationen-und-Anamneseb%C3%B6gen-in-der-thevea-App)), MD, THEORG 2GO, buchner | fehlt; als Sprachdokumentation entschieden (`PROJECT_PRINCIPLES.md` §6.3, 2026-09-08), Umsetzung eigener Auftrag; Systemdiktat gehört in die Endgeräte-Richtlinie (G14/G16) | Entscheidung E13 |
| Dokumentation je Termin automatisch angelegt, chronologisch; Doku direkt aus dem Terminplan | iPrax, MD | vorhanden: „Behandlung abschließen" in einem Schritt aus Tagesliste und Termin (UX-007); nicht automatisch angelegt | — |
| Versionierte, historisierte Einträge; nachträgliche Änderung nachvollziehbar | Optica (seit 7.0); bei appointmed nicht belegt | vorhanden (DOK-002 Korrektur, Nachtrag, Verlauf; DOK-004 Finalisierung) | Vorsprung |
| Therapiebericht mit Vorlagen, vorbefüllten Arzt- und Patientendaten, Versand; Patientenbrief mit Briefkopf | thevea, Optica, THEORG, appointmed | fehlt; geplant DOK-005 (Etappe 2) | — |
| Anamnesebogen, Befund-/Assessment-Notizen, Verlaufsvisualisierung | thevea, Optica, Starke Praxis | fehlt; geplant FRB-EPIC-001/002 (Etappe 2) | — |
| Dokumentation mobil beim Hausbesuch, alle Geräte | alle | vorhanden (mobile-first); Textverlust-Schutz bei Verbindungsverlust, interner Navigation und beim Abmelden (UX-009, FIX-EPIC-003, FIX-014) | Vorsprung |
| Rollen: wer sieht Doku und Dateien (Manager alle, Selbstständige eigene) | appointmed | vorhanden, feiner (RLS, Dokumentart als Rollenschnitt bei Dateien); heute Office ohne klinischen Inhalt — mit E15 (2026-09-13) bekommt Office lesenden Zugriff wie Therapeut:innen, Umsetzung ROL-EPIC-001 | Vorsprung |

## 5. Abrechnung

| Funktion | Bei wem (Beleg) | Bei uns | Einordnung |
| --- | --- | --- | --- |
| Privat- und Selbstzahlerrechnung aus Terminen; Leistungsübersicht unverrechneter Leistungen; Sammelrechnung, auch aus bar quittierten Terminen | Standard: iPrax, thevea, appointmed ([Sammelrechnung](https://intercom.help/appointmed/de/articles/3072767-sammelrechnung-aus-bestehenden-leistungen-erstellen)), THEORG, Optica, MD | Vorschau; geplant ABR-EPIC-001/002 | Idee `IDEA-PRX-013` (Sammelrechnung) |
| „Rechnung legen": fortlaufende Nummer, danach unveränderbar, Storno mit Kennzeichen; Nummernformat und nächste Nummer einstellbar; Zahlungsziel 0 = „sofort" | appointmed ([Rechnung legen](https://intercom.help/appointmed/de/articles/3096748-rechnungs-editor-rechnungsansicht-rechnungsmerkmale)), thevea | geplant ABR-003 nach ADR-009; Nummernkreis `RG-JJJJ-NNNN` entschieden (B4, 2026-09-08), Bestätigung der Steuerberatung steht aus | — |
| Rechnungsstatus offen/fällig/bezahlt/storniert, Offene-Posten-Verwaltung, Zahlungseingangsübersicht, Teilzahlung | THEORG, thevea, Optica, appointmed | Vorschau; geplant ABR-004 | — |
| Zahlungserinnerung und Mahnung, bis drei Stufen mit Fristen und Gebühren; Versand per E-Mail; Abrechnungszentrum übernimmt Mahnwesen | Standard: THEORG, thevea ([Mahnwesen](https://support.thevea.de/hc/de/articles/29571089058845-Abrechnung-mit-thevea-Alles-was-du-wissen-musst)), Optica, MD, iPrax; bei appointmed nicht belegt | fehlt; Zahlungserinnerung als Dokument geplant ABR-EPIC-002b (E-9); Mahnstufen ABR-005 nach Praxiserfahrung | Idee `IDEA-PRX-012` |
| Ausfallrechnung für nicht wahrgenommene Termine | iPrax; thevea Vorlagen und Ratgeber | Gebührenanlass am Termin vorhanden (CAL-014; E14 für das Nichtantreffen, CAL-018); Betrag und Rechnung geplant ABR-001 und ABR-003 | — |
| Leistungskatalog mit Preis, Dauer, Farbe, Steuersatz je Leistung; Privatpreislisten; Beihilfe wie Privat | appointmed, MD, thevea, THEORG | Vorschau; geplant ABR-001 versioniert, Steuerkennzeichen je Position (B4) | — |
| Rechnung mit Patient:in und abweichendem Empfänger, Verordnungsbezug als Nachweis für PKV/Beihilfe | appointmed, thevea, THEORG | geplant ABR-003 | — |
| Unterschrift oder Stempel als Bild auf der Rechnung; Bankverbindung und Merkmale je Rechnung überschreibbar | appointmed | geplant ABR-000 Stammdaten | Akzeptanzhinweis ABR-003 |
| Kartenzahlung SumUp mit Betragsübergabe, auch beim Hausbesuch; Zahlung automatisch der Rechnung zugeordnet | iPrax ([SumUp](https://www.iprax-systems.com/praxissoftware/physiotherapie-software.html)), thevea, appointmed | fehlt | Idee `IDEA-PRX-022`, ADR-002 |
| Kassenbuch mit TSE/DSFinV-K, Quittungen, Tages-/Monatsabschluss | iPrax, THEORG, Optica, thevea, appointmed (AT) | fehlt | nur bei Barzahlung |
| DATEV- oder CSV-Export von Rechnungen und Zahlungen; EÜR-Modul | thevea ([DATEV](https://support.thevea.de/hc/de/articles/32203651546653-Wie-kann-ich-meine-Daten-f%C3%BCr-DATEV-exportieren)), Optica, THEORG, appointmed (CSV) | fehlt; minimal denkbar in ABR-EPIC-003 | Idee `IDEA-PRX-026`, Entscheidung B4 |
| E-Rechnung (XRechnung/ZUGFeRD) | bei keinem Produkt belegt | fehlt | außerhalb V1 (B2C; §19) |
| GKV-Abrechnung, Zuzahlung, Abrechnungszentrum, Preislistenservice, Blankoverordnung | alle GKV-Systeme | n. r. | außerhalb |
| Gutscheine, Kurse, Rehasport, Provisionen, Mandanten mit mehreren IK | iPrax, THEORG | n. r. | außerhalb; Pakete zurückgestellt (`IDEA-ANG-001`, B11) |

## 6. Patientenkommunikation

| Funktion | Bei wem (Beleg) | Bei uns | Einordnung |
| --- | --- | --- | --- |
| Terminerinnerung 24 h vorher per SMS oder E-Mail, je Person aktivierbar, Einwilligung dokumentiert; E-Mail kostenlos, SMS gegen Gebühr; Zusatztext je Behandlung | Standard: iPrax, THEORG, thevea, appointmed ([SMS](https://intercom.help/appointmed/de/articles/2931444-terminerinnerung-via-sms)), Optica, MD, henara | keine automatische Erinnerung (B15, 2026-09-08: „die Anrufliste bleibt"; falls je, E-Mail vor SMS, Messenger ausgeschlossen); Terminmail auf Klick aus dem Praxispostfach vorhanden (CAL-013, ANN-041); Einwilligung je Person geplant PAT-006 | Entscheidung B15; Idee `IDEA-PRX-005` |
| Terminbestätigung bei Anlage, Absage- und Änderungs-SMS; Benachrichtigung bei Therapeutenausfall | appointmed, THEORG, thevea, Optica | keine automatische Nachricht (B15); bei Ausfall „Tag umplanen" mit Anrufliste (CAL-009) | Entscheidung B15 |
| Online-Buchung als Anfrage mit Freigabe, Vorlauf, Buchungshorizont, buchbare Leistungen je Person; Buchungslink für Website | appointmed ([Online-Buchung](https://intercom.help/appointmed/de/articles/3311065-online-buchung-aktivieren-allgemeine-einstellungen)), thevea, Optica, MD | fehlt; Portal (Etappe 4) | Entscheidung B15 (setzt Portal und B5 voraus) |
| Patienten-App: Termine sehen, buchen, absagen; Nachrichten; Praxisprofil; Navigation | THEORG TheraConnect ([TheraConnect](https://sovdwaer.de/theraconnect)); thevea und Optica: **kein** Portal | fehlt; Portal (Etappe 4) mit deutlich mehr Umfang | — |
| Sicherer Dateiversand mit SMS-Code; Nachrichtenhistorie in der Akte | appointmed, thevea | fehlt; Kommunikation (Etappe 6); kein Teilen-Link für Dateien (ADR-017) | Idee `IDEA-KOM-*` |
| Videotherapie integriert (Zava, WebPRAX) | thevea, Optica, appointmed | Terminart „Video" im Modell; kein Dienst | ADR-002 |
| DSGVO-Zustimmung per E-Mail-Button oder Unterschrift; Einwilligung für Erinnerungsdienst | appointmed ([DSGVO](https://intercom.help/appointmed/de/articles/2954274-datenschutz-bestimmung-dsgvo-zustimmung-datenaktualisierung)), THEORG | fehlt; geplant PAT-006 (G8), Papier mit Vermerk, keine Unterschrift in der Anwendung (E-13) | — |
| KIM-Kommunikation mit Arztpraxen | iPrax, thevea, Optica | fehlt | außerhalb bis Entscheidung (TI) |

## 7. Mobil und Hausbesuch

| Funktion | Bei wem (Beleg) | Bei uns | Einordnung |
| --- | --- | --- | --- |
| Offline-first mit Hintergrund-Synchronisation (fast alles offline) | iPrax ([FAQ](https://www.iprax-systems.com/praxissoftware/iprax_faq.html)) | fehlt; ADR-001 erlaubt nur Tagesplan und Entwürfe | außerhalb V1 (ADR-001) |
| Offline-Kalender nur lesend (letzter und nächster Monat auf dem Gerät) | thevea ([Offline-Kalender](https://support.thevea.de/hc/de/articles/23655501771805-Offline-Terminkalender-nutzen)) | im Ansatz vorhanden: die zuletzt geladene Tagesliste bleibt im Funkloch lesbar, als älterer Stand gekennzeichnet (UX-011, ANN-021); kein Offline-Modus, kein Service Worker | — |
| Kein Offline, keine lokalen Daten („Remote-Desktop"); Nutzerkritik: Logout vergessen | THEORG 2GO ([2GO](https://sovdwaer.de/theorg-2go)), appointmed, Optica | wie wir, bis auf die lesbare Tagesliste; „Alle Sitzungen beenden" vorhanden (STAFF-004) | — |
| Navigation zum Hausbesuch: Adresse an die Karten-App übergeben | THEORG 2GO, MD, TheraConnect | vorhanden: Handoff an Google Maps mit Anschrift ohne Namen, Fahrradmodus, nur auf Tap (UX-002, ADR-019 Punkt 20, ANN-018); Apple Maps und `geo:` geplant MAP-005 | — |
| Termine unterwegs verschieben und anlegen (Nutzerkritik 2GO: „super unpraktisch") | alle Apps | vorhanden: langer Druck am Finger mit Rückgängig-Leiste (UX-010), Tap auf freie Zeit (UX-005), Folgetermin (UX-003) | — |
| Hausbesuchspauschale als Position; Hausbesuch als Therapieform | thevea, THEORG | Terminart vorhanden; Position geplant ABR-001 | — |
| Foto aufnehmen und hochladen aus der App; Quick-Scan ohne Login | thevea, appointmed | Datei-Upload aus dem Browser vorhanden, auch vom Telefon (DAT-001); Quick-Scan ohne Login nicht | — |
| Biometrischer Login (Face ID); Sitzungsschutz auf dem Handy | appointmed; Nutzerforderung | Face ID fehlt; „Alle Sitzungen beenden" vorhanden (STAFF-004); zweiter Faktor (TOTP) einrichtbar, beim Anmelden noch nicht abgefragt (ANN-028, FIX-EPIC-002 nach dem Online-Schalten); Endgeräte-Richtlinie geplant G14/G16 | — |
| Kartenzahlung unterwegs | iPrax, appointmed, thevea | fehlt | Idee `IDEA-PRX-022` |
| KI-Tourenplanung, Karte mit Standorten | MD Therapie | Vorschau Touren; Karte, Route und Fahrzeiten geplant MAP-002 bis MAP-006 (ADR-019); keine KI-Planung, keine Optimierung, keine Verschiebung bestätigter Termine (§8) | Entscheidung B7 → ADR-019 (Gate) |

## 8. Personal und Betrieb

| Funktion | Bei wem (Beleg) | Bei uns | Einordnung |
| --- | --- | --- | --- |
| Mitarbeitende mit Arbeitszeiten, Pausen, Abwesenheiten; inaktiv statt löschen | thevea ([Mitarbeiter](https://support.thevea.de/hc/de/articles/9982187615901-Mitarbeiterverwaltung-Mitarbeiter-anlegen-Arbeitszeiten-und-Abwesenheiten-verwalten)), appointmed, iPrax | vorhanden (STAFF-001, CAL-005); Zugänge einladen, Rollen ändern, sperren, Kennwort zurücksetzen (STAFF-EPIC-002) | Vorsprung |
| Urlaubs- und Fortbildungsplanung, Überstundenkonto, Arbeitszeiterfassung (Transponder), Monatsabrechnung | THEORG Modul ([Arbeitszeit](https://sovdwaer.de/arbeitszeitverwaltung)), Optica Modul; thevea: keine minutengenaue Erfassung; iPrax: bewusst nicht | Vorschau; geplant URL-001, ZK-001 (Spur A2) | Entscheidung B6 (2026-09-08): keine Auswertung je Person |
| Rollen: Manager, Angestellte, Selbstständige (appointmed); Admin/Mitarbeiter (thevea); Lizenz je Rolle (Optica) | appointmed ([Rollen](https://intercom.help/appointmed/de/articles/4544292-benutzerrollen)), thevea | vorhanden, vier Rollen mit RLS; MFA (TOTP) einrichtbar (STAFF-004) | Vorsprung |
| Aufgaben mit Fälligkeit, Zuweisung, Erledigungs-Benachrichtigung; überfällige als Badge | appointmed | fehlt | Idee `IDEA-PRX-019` |
| Qualifikationen je Mitarbeiter:in für die Terminvergabe | Optica, THEORG | fehlt | Idee (Nachbarschaft `IDEA-QSN-010`) |
| Provisionen, mehrere Standorte, Mandanten | THEORG, Optica, MD | n. r.; ADR-003 | außerhalb |
| Schulung, Webinare, Help-Center mit 500 Artikeln, Live-Chat, Einrichtungs-Checkliste | THEORG, iPrax, appointmed, thevea | Kurzanleitung „erster Tag" geplant H2; Abnahmeschritte in `docs/abnahme/` | Betrieb, kein Feature |

## 9. Auswertung

| Funktion | Bei wem (Beleg) | Bei uns | Einordnung |
| --- | --- | --- | --- |
| Kennzahlen: Umsatz, Auslastung, Behandlungszahlen, offene Posten, Zeitraumvergleich, Diagramme, CSV-Export | Standard: iPrax ([FAQ](https://www.iprax-systems.com/praxissoftware/iprax_faq.html)), THEORG, thevea, Optica, MD, Starke Praxis | fehlt | Idee `IDEA-PRX-025`; §20 bei Personenbezug |
| Umsatz je Mitarbeiter:in, Zuweiserstatistik | thevea, THEORG, Optica | fehlt | Entscheidung B6 (2026-09-08): keine Auswertung je Person, nur Praxissummen |
| Automatische Tages-/Monatsberichte per E-Mail | appointmed | fehlt | Idee |

## 10. Dokumente, Vorlagen, Unterschrift

| Funktion | Bei wem (Beleg) | Bei uns | Einordnung |
| --- | --- | --- | --- |
| Eigene PDF-Vorlagen (Behandlungsvertrag, Datenschutz, Anamnese) hochladen, digital ausfüllen, auf dem Gerät unterschreiben; Klemmbrett-Tablet | iPrax ([Vorlagen](https://www.iprax-systems.com/praxissoftware/physiotherapie-software.html)), THEORG Klemmbrett, thevea (Signatur seit 06/2026) | keine Unterschrift in der Anwendung; Papier mit Vermerk, geplant PAT-006; unterschriebene Verträge als Datei ablegbar (DAT-001, organisatorische Dokumentart) | Entscheidung E-13 (`IDEA-PRX-015` verworfen) |
| Über 100 Mustertexte, eigene Vorlagen mit Platzhaltern aus Karteien, Blitzdruck | THEORG ([weitere Funktionen](https://sovdwaer.de/weitere-funktionen)), thevea Word-Vorlagen | fehlt; mit DOK-005 (Etappe 2) | — |
| Dateiablage am Patienten (Befunde, Verträge, Scans; 10 MB, PDF/JPG) | alle | vorhanden (DAT-001 bis DAT-003, ADR-017): PDF/JPEG/PNG bis 10 MB, Dokumentart als Rollenschnitt, signierte Verweise 60 Sekunden, zweistufige Löschung mit Quittung, Abgleich; keine Virenprüfung in V1 (Pflicht ab dem ersten Upload von außen) | — |
| Formulargenerator für eigene Bögen | Optica Omnia | fehlt; geplant FRB-001 (Etappe 2) | — |
| Vorlagen für Ausfallrechnung und Ausfallhonorar-Information (§ 615 BGB, 24-Stunden-Regel) | thevea Ratgeber ([Ausfallhonorar](https://thevea.de/praxis-wissen/ausfallhonorar-ausfallrechnung-vorlage/)) | 24-Stunden-Regel vorhanden (CAL-014); Textvorlage geplant PAT-006, Rechnung ABR | — |

## 11. System und Sicherheit

| Funktion | Bei wem (Beleg) | Bei uns | Einordnung |
| --- | --- | --- | --- |
| Hosting in Deutschland/EU, ISO-27001-Rechenzentrum, AVV, Verschlüsselung, Backups durch den Anbieter, § 203 | thevea ([Datenschutz](https://support.thevea.de/hc/de/articles/17657664736669-Datenschutz-und-Datenverarbeitung-bei-thevea)), Optica, appointmed, iPrax | geplant OPS-001 Providerprüfung (G3), OPS-003 (G7) | — |
| Rollenbasierte Rechte (zwei- bis dreistufig); 2FA nirgends belegt | thevea, appointmed | vier Rollen, RLS; MFA (TOTP) einrichtbar für jede Rolle (STAFF-004), beim Anmelden noch nicht abgefragt (ANN-028) | Vorsprung |
| Audit-Log (Prüfkriterium der Portale); Versionierung der Dokumentation | Optica; sonst kaum belegt | vorhanden (ADR-010, DOK); Auditansicht für `owner` | Vorsprung |
| Datenexport für Auskunft und Wechsel; kein Vendor-Lock-in | appointmed, Optica, iPrax | geplant OPS-006 (G9) | — |
| Automatische Updates alle zwei Wochen ohne Unterbrechung, Release-Notes-Portal | appointmed, thevea, Optica | geplant BETRIEB-001 Release-Takt (G16) | — |
| Verschlüsselung mit individuellem Praxisschlüssel | Optica | nicht vorgesehen | Idee, nur mit ADR |
| Telematikinfrastruktur, KIM | iPrax, thevea, Optica, MD, PraxWin | nicht vorgesehen | außerhalb bis Entscheidung |

## 12. Bedienung

| Funktion | Bei wem (Beleg) | Bei uns | Einordnung |
| --- | --- | --- | --- |
| Globale Suche; Schnellanlegen „Neu →" (Termin, Patient, Rechnung); Tastenkürzel | thevea, appointmed, THEORG | vorhanden: Patientensuche von jeder Seite, serverseitig ab drei Zeichen (UX-004); „Neu"-Menü und Tastenkürzel fehlen | Idee `IDEA-PRX-020` (Rest) |
| Wiedervorlage-Badge im Hauptmenü, Kalender als Startansicht | appointmed | „Übersicht" als Start mit „Offen heute" (UX-001); Badge im Menü fehlt | — |
| Intuitive Bedienung ohne Ballast — häufigste Nutzererwartung und häufigster Wechselgrund | Foren, Bewertungen | Maßstab in `OPTIMIERUNG.md` | Verfahren |
| Kalender-Abo (iCal) nur lesend für Apple/Google/Outlook | appointmed ([Kalender-Abo](https://intercom.help/appointmed/de/articles/2619676-verknupfe-deinen-appointmed-kalender-mit-google-kalender)) | fehlt | Idee mit Bedenken `IDEA-PRX-024` (`IDEA-ORG-004`) |

## 13. Schnittstellen

| Funktion | Bei wem (Beleg) | Bei uns | Einordnung |
| --- | --- | --- | --- |
| DATEV/Lexware-Export, CSV für Steuerberatung | THEORG, thevea, Optica, appointmed | fehlt | Idee `IDEA-PRX-026`, Entscheidung B4 |
| SumUp-Kartenterminal mit Sonderkonditionen | iPrax, thevea, appointmed | fehlt | Idee `IDEA-PRX-022` |
| Doctolib-Konnektor, externe Buchungsdienste, Buchungs-Widget | THEORG (Drittanbieter), tinana, thevea od bookings | fehlt | Entscheidung B15 |
| Videodienst-Integration (Zava, WebPRAX) | thevea, Optica | fehlt | ADR-002 |
| Anbindung an Trainings- und Testsoftware (THEDEX, Lanista, medo.check) | THEORG | fehlt; eigene Übungspläne geplant (Etappe 3) | Idee `IDEA-QSN-008` |
| Patientendaten-Import bei Softwarewechsel | thevea, iPrax, Optica | entfällt: kein Altsystem, die Praxis eröffnet am 01.07.2027 (Jannes, 2026-09-06) | — |
| TI, KIM, eGK, Abrechnungszentren | alle GKV-Systeme | n. r. | außerhalb |

---

## Was die Vergleichsportale prüfen

Kriterienkataloge (physiosoftware-vergleich.de, meinepraxisdigital.de, alloq,
invofy, medi-one, Capterra): Funktionsumfang · Bedienbarkeit und Onboarding ·
Abrechnung (GKV, Abrechnungszentrum, TI) · Preis und Preistransparenz (nur 6
von 31 Systemen nennen Preise) · Support-Qualität · Datenschutz (DSGVO, AVV,
EU-/DE-Hosting, Verschlüsselung, Zugriffsrechte, Audit-Log, Backups) · moderne
Technologie (Cloud, mobil, Schnittstellen, KI) · Entwicklungsaktivität ·
Datenimport beim Wechsel (4 bis 8 Wochen, Probekonvertierung).

Für eine Privatpraxis ohne GKV, so mehrere Vergleiche, genügt „eine schlanke
Cloud-Lösung mit terminbasierter Privatabrechnung, Zahlungsstatus und
DATEV-Export" ([alloq](https://alloq.digital/de/blog/software-physiotherapie-praxis-vergleich/),
[medizinio](https://medizinio.de/software/praxis/privatpraxis)).

## Funktionen anderer Systeme ohne Entsprechung — keine Reihenfolge, kein Scope

Stand 2026-09-13. Die Liste sagt, was bei drei oder mehr Wettbewerbern steht
und bei uns weder gebaut noch als Zeile in der Roadmap ist. Sie ist eine
Bestandsaufnahme, keine Wunschliste: Was davon je kommt, entscheidet Jannes
je Feature; die Reihenfolge steht allein in `../../development/ROADMAP.md`.

- Warteliste mit Zeitfenstern und Nachrücken (`IDEA-PRX-003`)
- Automatische Terminsuche (`IDEA-PRX-008`)
- Terminerinnerung mit Einwilligung — nach B15 bewusst nicht (Anrufliste,
  `IDEA-PRX-005`)
- Kennzahlen für die Praxisführung (`IDEA-PRX-025`; je Person: B6, nein)
- Rechnungsempfänger-Stammdaten und verknüpfte Kontakte (`IDEA-PRX-010`)
- Sammelrechnung mit Behandlungsnachweis (`IDEA-PRX-013`)
- Aufgaben und Wiedervorlagen mit Patientenbezug (`IDEA-PRX-019`)
- Dublettenprüfung und Zusammenführen (`IDEA-PRX-018`)
- Farbcodierung im Kalender, Monatsansicht (`IDEA-PRX-021`, Komfort)
- Körperschema im Befund (`IDEA-PRX-027`)
- Kartenzahlung und Kassenbuch (`IDEA-PRX-022`)
- Export für die Steuerberatung (`IDEA-PRX-026`, B4)
- Online-Terminbuchung und Patienten-App (Portal; B15, B5)
- Qualifikationen je Mitarbeiter:in für die Terminvergabe

Bereits geschlossen seit der Recherche vom 2026-09-06: Terminserie,
Folgetermin, Terminzustände mit Absagegrund und Ausfallgebühr, Terminzettel
mit Druck und E-Mail-Entwurf, Direktkontakt per `tel:`, Verordnungen und
Verordner:innen, Textbausteine, Dateiablage mit Verordnungsscan, MFA
einrichtbar, Abschluss der Versorgung mit Löschlauf, Navigations-Handoff,
Tagesliste im Funkloch lesbar.

**Kein Wettbewerber** hat ein Portal mit Intake und Übungsplänen, eine
Betreuungsplattform nach Therapieende oder ein Rollen- und Auditmodell wie
unseres; iPrax ist mit Offline-first und thevea mit dem lesenden
Offline-Kalender die einzigen, die den Funkloch-Fall lösen. Was die
Wettbewerber am meisten Kritik einbringt — schwer erreichbarer Support,
Instabilität, hoher Einrichtungsaufwand, altbackene Oberflächen, mobile Apps
ohne echten Nutzen — ist zugleich die Liste dessen, was `OPTIMIERUNG.md`
misst.

Zuletzt aktualisiert: 2026-09-13 (Spalte „Bei uns" nach
`ARBEITSBEREICHE.md`; Stufen-Legende und Reihenfolgeangaben entfernt; Liste
„ohne Entsprechung" ohne Reihenfolge; SMS/Messenger nach B15, Auswertung je
Person nach B6). Vorherige Aktualisierung: 2026-09-06.
