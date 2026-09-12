# Referenz: Funktionen vergleichbarer Praxisprogramme

> Nicht normativ. Siehe [../IDEENSPEICHER.md](../IDEENSPEICHER.md). Rang 6 —
> diese Datei begründet **keinen** Scope. Sie beantwortet je Bruchstelle „wie
> lösen es andere", nie „was fehlt uns" (`docs/development/OPTIMIERUNG.md`,
> Abschnitt 13).

Stand der Recherche: 2026-09-05/06. Auftrag von Jannes: Welche Funktionen
haben iPrax, THEORG, thevea und vergleichbare Terminierungsprogramme, die bei
uns fehlen — so detailliert wie möglich.

## Wie recherchiert wurde, und was das bedeutet

- **Produkte:** iPrax (iPrax Systems), THEORG mit THEORG 2GO, Klemmbrett und
  TheraConnect (SOVDWAER), thevea mit Scan-App (thevea GmbH, opta data),
  appointmed (appointmed GmbH), Optica Viva (PRAXINO/Optica), MD Therapie
  (MEDIFOX DAN), dazu Streiflichter auf Starke Praxis (buchner), azh TiM,
  NOVENTI Ora, PraxWin, henara, tinana, cituro, tomedo, Lemniscus.
- **Umfang:** 588 belegte Einzelfunktionen (iPrax 97, THEORG 112, thevea 105,
  appointmed 114, Optica und weitere 111, Querschnitt Hausbesuch/Mobil 49),
  dazu 60 Prüfkriterien von Vergleichsportalen, 56 Nutzererwartungen und 18
  Schmerzpunkte aus Foren und Bewertungen. Die Rohdaten mit allen URLs liegen
  im Arbeitsverzeichnis der Session; diese Datei führt je Funktion ein bis zwei
  Belege.
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

`vorhanden` — funktional angebunden · `Vorschau` — nur Arbeitsspeicher ·
`geplant <ID>` — in Roadmap 2.0 · `Entwurf <ID>` — im Entwurf 2.1 ·
`IDEA-…` — im Ideenspeicher · `fehlt` — nirgends · `n. r.` — nicht relevant
für eine Praxis ohne Räume und ohne GKV-Abrechnung.

Spalte „Einordnung": **Stufe 1** (vor Go-live), **Stufe 2**, **Idee**
(Ideenspeicher, kein Termin), **Entscheidung** (Spur B), **außerhalb**
(Prinzipien oder Zielbetrieb schließen es aus), **Vorsprung** (wir haben
es, viele Wettbewerber nicht).

---

## 1. Terminplanung

| Funktion | Bei wem (Beleg) | Bei uns | Einordnung |
| --- | --- | --- | --- |
| Terminserie aus der Verordnung, Serie mit Intervall in einem Schritt, Dauertermine; Automatik berücksichtigt Urlaub | Standard: iPrax, THEORG, thevea, appointmed, Optica, MD ([appointmed](https://intercom.help/appointmed/de/articles/2681779-serientermine-und-terminserien-erstellen-bearbeiten-loschen), [THEORG](https://sovdwaer.de/terminplan)) | fehlt; geplant CAL-007 | Stufe 1 |
| Automatische Terminsuche: freier Slot nach Person, Dauer, Wunschzeit; thevea „Termine planen" trägt eine ganze Verordnung ein | Standard: iPrax, THEORG, thevea, appointmed, MD, Optica ([thevea](https://support.thevea.de/hc/de/articles/7405528194461-Freie-Termine-finden-mit-Hilfe-der-Funktion-Termine-planen)) | fehlt; CAL-007 prüft nur Konflikte | Stufe 2, `IDEA-PRX-008` |
| Warteliste mit Wochentag-/Tageszeitpräferenz, Dringlichkeit; bei Absage passende Einträge, Anruf aus der App, Nachrücken | Standard: iPrax, THEORG, thevea, appointmed, Optica, MD, henara ([iPrax](https://www.iprax-systems.com/praxissoftware/physiotherapie-software.html)) | fehlt | Stufe 2, `IDEA-PRX-003`, Entscheidung |
| Folgetermin ohne Neuauswahl („Weiterer Termin"), Anlegen per Tap auf freie Zeit, Kopieren, Drag & Drop | iPrax ([App Store](https://apps.apple.com/de/app/iprax/id529795949)), thevea | nur aus der Akte; Entwurf UX-EPIC-001 | Stufe 1 |
| Kollisions-, Abstands- und Frequenzprüfung beim Anlegen; Qualifikation und Zeit je Therapeut:in | THEORG ([Terminplan](https://sovdwaer.de/terminplan)), appointmed, iPrax | Überschneidung und Arbeitszeit vorhanden; Fahrpuffer fehlt → Entwurf CAL-010b | Stufe 1 |
| Fahrzeiten zwischen Hausbesuchen automatisch einplanen, Karte mit Patientenstandorten | MD Therapie ([Physiotherapie](https://www.medifoxdan.de/software-therapeuten/fachbereiche/physiotherapie)); bei iPrax, THEORG, appointmed nicht belegt | Vorschau Touren; TOUR-001 nach B7 | Stufe 2; Regelpuffer Stufe 1 |
| Terminstatus mit Absage, Absagegrund, Information an die Person (SMS/E-Mail) | appointmed ([Absage-SMS](https://intercom.help/appointmed/de/articles/3302368-information-uber-abgesagte-geanderte-termine-via-sms)), Optica, thevea | abgesagt ohne Grund; geplant CAL-008 (ADR-018) | Stufe 1; Benachrichtigung B15 |
| No-show-Status und Ausfallhonorar | iPrax (Ausfallhonorar-Rechnung); bei appointmed nicht belegt; thevea nur Vorlagen | fehlt; geplant CAL-008 + ABR-001 | Stufe 1 |
| Terminzettel oder Terminübersicht je Person drucken, per E-Mail oder SMS senden; Tages-/Tourenliste je Mitarbeiter:in drucken | THEORG, appointmed ([Terminübersicht](https://intercom.help/appointmed/de/articles/3064727-terminubersicht-fur-einen-patienten-drucken-senden)), iPrax, Optica | fehlt; Entwurf CAL-EPIC-003b, E2 | Stufe 1, `IDEA-PRX-006` |
| Farbcodierung je Leistung, Therapieform, Person; freie Termine hervorgehoben; Hausbesuch als Farbe | appointmed, thevea ([Kalender](https://support.thevea.de/hc/de/articles/7405107580317-Terminkalender-in-thevea-Alles-was-du-wissen-musst)), iPrax, THEORG | nur Status als Text | Komfort, UI-001, `IDEA-PRX-021` |
| Ansichten Tag, Woche je Person, Monat mit Termindichte; Öffnungszeiten grau, individuelle Verfügbarkeit überschreibt sie; Raster bis 5 Minuten | iPrax, appointmed ([Öffnungszeiten](https://intercom.help/appointmed/de/articles/2635040-offnungszeiten)), thevea 25-Minuten-Takt | Tag und Woche vorhanden, Arbeitszeiten je Person vorhanden; Monat fehlt | Komfort |
| Abwesenheiten (Urlaub, Krankheit, Fortbildung) blockieren den Kalender | thevea, appointmed, iPrax | Ausnahmen je Person vorhanden (CAL-005); Urlaub Vorschau → URL-001 | Stufe 2 |
| Änderungsprotokoll je Termin sichtbar | thevea (Plus) | Änderungen serverseitig protokolliert (CAL-003), Audit | Vorsprung |
| Räume, Geräte, Fahrzeuge als Ressourcen mit Doppelbelegungsschutz | alle | n. r. (keine Räume); Rad als Ressource → FLT-EPIC-001 | Stufe 2 |
| Gruppentermine, Passivleistungen, Kurse | THEORG, thevea, iPrax | n. r. | außerhalb |
| Online-Terminvergabe oder -anfrage, die die Praxis bestätigt; Patienten-App (TheraConnect) | Standard: THEORG, thevea (od bookings), appointmed, Optica, MD, tinana, cituro; **nicht** iPrax | fehlt; Etappe 4 Portal | Stufe 2, B15 |

## 2. Patientenverwaltung

| Funktion | Bei wem (Beleg) | Bei uns | Einordnung |
| --- | --- | --- | --- |
| Abweichender Rechnungsempfänger (Angehörige, Betreuung, Beihilfe); beide auf der Rechnung; verknüpfte Kontakte je Patient:in | THEORG, appointmed ([verknüpfte Kontakte](https://intercom.help/appointmed/de/articles/2954273-interne-notizen-aufgaben-verknupfte-kontakte)), thevea | fehlt; Entwurf ABR-003a | Stufe 1, `IDEA-PRX-010` |
| Ärzte-/Verordnerkartei, Gemeinschaftspraxen, Arztdatenbank für Berichte | THEORG, thevea ([Arztverwaltung](https://support.thevea.de/hc/de/articles/19514624635549-Arztverwaltung)), Optica, iPrax | fehlt; geplant VER-001 `prescribers` | Stufe 1 |
| Interne Notiz getrennt von der Dokumentation; Besonderheiten; Patientenstatus | appointmed, thevea, iPrax | Status vorhanden; Bemerkung und Besonderheit geplant PAT-005 | Stufe 1; Zugangshinweis `IDEA-PRX-001` |
| Akte als Gesamtübersicht: Stammdaten, Verordnungen, Termine, Rechnungen, Doku, Dateien, gesendete Nachrichten | thevea ([Patientenverwaltung](https://support.thevea.de/hc/de/articles/30365867196829-Patientenverwaltung-in-thevea-Alles-was-du-wissen-musst)), iPrax (fünf Bereiche) | Akte ohne künftige Termine, ohne Verordnungen; Entwurf UX-EPIC-001, VER-002; `IDEA-QSN-001` Zeitstrahl | Stufe 1 |
| Dublettenprüfung und Zusammenführen | thevea ([Zusammenführen](https://support.thevea.de/hc/de/articles/19361932692125-Wie-kann-ich-Patienten-zusammenf%C3%BChren)) | fehlt | Idee `IDEA-PRX-018` |
| Patient:innen löschen oder inaktiv setzen | thevea | Status vorhanden; Löschung geplant LOE-EPIC-001 | Stufe 1 |
| Import bestehender Stammdaten aus CSV/XLS; Wechselservice | iPrax ([FAQ](https://www.iprax-systems.com/praxissoftware/iprax_faq.html)), thevea, Optica | entfällt: kein Altsystem, die Praxis eröffnet am 01.07.2027 (Jannes, 2026-09-06) | — |
| Anmeldeformular zur Selbsteingabe per Link, SMS, QR-Code oder Tablet | appointmed ([Anmeldeformular](https://intercom.help/appointmed/de/articles/10751938-anmeldeformular-datenaktualisierung-fur-patienten)) | fehlt; Etappe 4 Intake | Stufe 2 |
| Direktkontakt: Tap auf Nummer oder E-Mail öffnet Telefon oder Mail | iPrax | fehlt (`tel:` nirgends); Entwurf UX-EPIC-001 | Stufe 1 |
| Aufgaben und Wiedervorlagen mit Patientenbezug, Fälligkeit, Zuweisung | appointmed ([Aufgaben](https://intercom.help/appointmed/de/articles/2785534-aufgaben-erstellen-erledigen-zuweisen-und-loschen)), MD | fehlt | Idee `IDEA-PRX-019` |
| Selektionen von Patientengruppen für Marketing und Erinnerungen; Serienbriefe | THEORG | fehlt | außerhalb (HWG, `IDEA-ANG-002`) |
| eGK einlesen, Versichertenstammdaten, Kostenträgerkartei, Zuzahlungsbefreiung | THEORG, iPrax, Optica | n. r. | außerhalb (GKV) |
| Patientenliste als CSV, kompletter Verlauf je Person exportierbar (DSGVO) | appointmed, Optica | fehlt; geplant OPS-006 | Stufe 1 minimal |

## 3. Verordnung

| Funktion | Bei wem (Beleg) | Bei uns | Einordnung |
| --- | --- | --- | --- |
| Privatverordnung als Grundlage der Privatrechnung; Rezepttypen GKV, BG, Privat, Selbstzahler; Vorlage nachträglich ändern | thevea ([Privatverordnung](https://support.thevea.de/hc/de/articles/9205787402141-Wie-lege-ich-eine-Privatverordnung-an)), iPrax, THEORG | fehlt; geplant VER-001 | Stufe 1 |
| Termin an Verordnung geknüpft mit Zähler (8/10), Terminblatt je Rezept, Kontingent automatisch verbraucht | thevea ([Verknüpfung](https://support.thevea.de/hc/de/articles/7404630950173-Wie-kann-ich-Termine-nachtr%C3%A4glich-mit-einer-Verordnung-verkn%C3%BCpfen)), THEORG | fehlt; CAL-007 und ABR-002 (Verbrauch dort zu entscheiden) | Stufe 1, `IDEA-PRX-009` |
| Rezepthistorie je Person, nach Jahr | iPrax | fehlt; geplant VER-002 | Stufe 1 |
| Verordnung per Kamera erfassen: OCR, KI-Texterkennung, Prüfung, unsichere Felder markiert; Barcode am Smartphone beim Hausbesuch | thevea Scan-App ([Scan-App](https://thevea.de/scan-app/)), iPrax Clever-Scan, THEORG 2GO, MD, Optica | fehlt; Scan als Anhang geplant VER-004 (DAT); Erkennung → ADR-005 | Stufe 2, `IDEA-PRX-023` |
| Empfehlung oder Prognose zum Verordnungsende, Verordnungswertprognose | thevea (Prognose) | Empfehlung geplant VER-001 | Stufe 1 |
| Fristen- und Frequenzprüfung nach Heilmittelrichtlinie, Heilmittelkatalog, Blankoverordnung, Rahmenverträge, Teilabrechnung | alle GKV-Systeme | n. r. | außerhalb (GKV, ADR-009) |
| Rezeptanlage offline beim Hausbesuch | iPrax | fehlt; ADR-001 begrenzt | Stufe 2 |

## 4. Dokumentation und Befund

| Funktion | Bei wem (Beleg) | Bei uns | Einordnung |
| --- | --- | --- | --- |
| Textbausteine, persönlich und vorgefertigt, per Drag & Drop; Variablen aus der Akte | Standard: iPrax, thevea ([Textbausteine](https://support.thevea.de/hc/de/articles/25832498722717-Wie-kann-ich-Textbausteine-hinzuf%C3%BCgen-und-verwenden)), THEORG, Optica, MD | fehlt (Freitext) | Stufe 1 klein oder Stufe 2, `IDEA-PRX-011`, Entscheidung |
| Körperschema (Body Chart) mit Markern; iPrax 3D-Modell in zehn Schichten; Winkelmessung Neutral-Null; Messreihen | appointmed ([Bodychart](https://intercom.help/appointmed/de/articles/2991775-bodychart)), THEORG, Optica, MD, iPrax | fehlt; Etappe 2 (Befund, FRB) | Stufe 2, `IDEA-PRX-027` |
| Fotos, Videos, Dateien an Termin oder Doku; Quick-Scan vom Smartphone | iPrax, thevea, MD, appointmed, Optica | fehlt; Grundlage DAT-EPIC-001; Foto mit eigener Einwilligung `IDEA-KOM-003` | Stufe 2 |
| Diktat und Spracheingabe (Systemdiktat, Siri); Nutzerkritik: Fachwörter | iPrax, thevea ([Diktat](https://support.thevea.de/hc/de/articles/33072824460445-Diktieren-von-Berichten-Dokumentationen-und-Anamneseb%C3%B6gen-in-der-thevea-App)), MD, THEORG 2GO, buchner | fehlt; Vision §6: eigener Datenfluss | Stufe 2, `IDEA-PRX-028` |
| Dokumentation je Termin automatisch angelegt, chronologisch; Doku direkt aus dem Terminplan | iPrax, MD | manuell „Dokumentation anlegen"; Entwurf UX-EPIC-001 „Behandlung abschließen" | Stufe 1 |
| Versionierte, historisierte Einträge; nachträgliche Änderung nachvollziehbar | Optica (seit 7.0); bei appointmed nicht belegt | vorhanden (DOK-002 Korrektur, Nachtrag, Verlauf; DOK-004 Finalisierung) | Vorsprung |
| Therapiebericht mit Vorlagen, vorbefüllten Arzt- und Patientendaten, Versand; Patientenbrief mit Briefkopf | thevea, Optica, THEORG, appointmed | fehlt; geplant DOK-005 | Stufe 2 |
| Anamnesebogen, Befund-/Assessment-Notizen, Verlaufsvisualisierung | thevea, Optica, Starke Praxis | fehlt; geplant FRB-EPIC-001/002 | Stufe 2 |
| Dokumentation mobil beim Hausbesuch, alle Geräte | alle | vorhanden (mobile-first); Textverlust-Schutz fehlt → UX-EPIC-001 | Vorsprung mit Lücke |
| Rollen: wer sieht Doku und Dateien (Manager alle, Selbstständige eigene) | appointmed | vorhanden, feiner (RLS, Office ohne klinischen Inhalt) | Vorsprung |

## 5. Abrechnung

| Funktion | Bei wem (Beleg) | Bei uns | Einordnung |
| --- | --- | --- | --- |
| Privat- und Selbstzahlerrechnung aus Terminen; Leistungsübersicht unverrechneter Leistungen; Sammelrechnung, auch aus bar quittierten Terminen | Standard: iPrax, thevea, appointmed ([Sammelrechnung](https://intercom.help/appointmed/de/articles/3072767-sammelrechnung-aus-bestehenden-leistungen-erstellen)), THEORG, Optica, MD | Vorschau; geplant ABR-EPIC-001/002 | Stufe 1, Sammelrechnung `IDEA-PRX-013` |
| „Rechnung legen": fortlaufende Nummer, danach unveränderbar, Storno mit Kennzeichen; Nummernformat und nächste Nummer einstellbar; Zahlungsziel 0 = „sofort" | appointmed ([Rechnung legen](https://intercom.help/appointmed/de/articles/3096748-rechnungs-editor-rechnungsansicht-rechnungsmerkmale)), thevea | geplant ABR-003 nach ADR-009; Nummernkreis B12 | Stufe 1 |
| Rechnungsstatus offen/fällig/bezahlt/storniert, Offene-Posten-Verwaltung, Zahlungseingangsübersicht, Teilzahlung | THEORG, thevea, Optica, appointmed | Vorschau; geplant ABR-004 | Stufe 1 |
| Zahlungserinnerung und Mahnung, bis drei Stufen mit Fristen und Gebühren; Versand per E-Mail; Abrechnungszentrum übernimmt Mahnwesen | Standard: THEORG, thevea ([Mahnwesen](https://support.thevea.de/hc/de/articles/29571089058845-Abrechnung-mit-thevea-Alles-was-du-wissen-musst)), Optica, MD, iPrax; bei appointmed nicht belegt | fehlt; bewusst nicht Stufe 1 (ABR-005) | Stufe 2; Erinnerung als Dokument `IDEA-PRX-012`, Entscheidung |
| Ausfallrechnung für nicht wahrgenommene Termine | iPrax; thevea Vorlagen und Ratgeber | fehlt; CAL-008 Kennzeichen + ABR-001 Position | Stufe 1 |
| Leistungskatalog mit Preis, Dauer, Farbe, Steuersatz je Leistung; Privatpreislisten; Beihilfe wie Privat | appointmed, MD, thevea, THEORG | Vorschau; geplant ABR-001 versioniert | Stufe 1 |
| Rechnung mit Patient:in und abweichendem Empfänger, Verordnungsbezug als Nachweis für PKV/Beihilfe | appointmed, thevea, THEORG | geplant ABR-003 | Stufe 1 |
| Unterschrift oder Stempel als Bild auf der Rechnung; Bankverbindung und Merkmale je Rechnung überschreibbar | appointmed | ABR-000 Stammdaten | Akzeptanzhinweis ABR-003 |
| Kartenzahlung SumUp mit Betragsübergabe, auch beim Hausbesuch; Zahlung automatisch der Rechnung zugeordnet | iPrax ([SumUp](https://www.iprax-systems.com/praxissoftware/physiotherapie-software.html)), thevea, appointmed | fehlt; bewusst nicht Stufe 1 | Stufe 2, `IDEA-PRX-022`, ADR-002 |
| Kassenbuch mit TSE/DSFinV-K, Quittungen, Tages-/Monatsabschluss | iPrax, THEORG, Optica, thevea, appointmed (AT) | fehlt; bewusst nicht Stufe 1 | Stufe 2, nur bei Barzahlung |
| DATEV- oder CSV-Export von Rechnungen und Zahlungen; EÜR-Modul | thevea ([DATEV](https://support.thevea.de/hc/de/articles/32203651546653-Wie-kann-ich-meine-Daten-f%C3%BCr-DATEV-exportieren)), Optica, THEORG, appointmed (CSV) | fehlt | Stufe 2 oder minimal in ABR-EPIC-003, `IDEA-PRX-026`, B4 |
| E-Rechnung (XRechnung/ZUGFeRD) | bei keinem Produkt belegt | fehlt | außerhalb V1 (B2C; §19) |
| GKV-Abrechnung, Zuzahlung, Abrechnungszentrum, Preislistenservice, Blankoverordnung | alle GKV-Systeme | n. r. | außerhalb |
| Gutscheine, Kurse, Rehasport, Provisionen, Mandanten mit mehreren IK | iPrax, THEORG | n. r. | außerhalb; Pakete `IDEA-ANG-001` (B11) |

## 6. Patientenkommunikation

| Funktion | Bei wem (Beleg) | Bei uns | Einordnung |
| --- | --- | --- | --- |
| Terminerinnerung 24 h vorher per SMS oder E-Mail, je Person aktivierbar, Einwilligung dokumentiert; E-Mail kostenlos, SMS gegen Gebühr; Zusatztext je Behandlung | Standard: iPrax, THEORG, thevea, appointmed ([SMS](https://intercom.help/appointmed/de/articles/2931444-terminerinnerung-via-sms)), Optica, MD, henara | fehlt; keine Benachrichtigung im Code | Stufe 2, B15; Stufe 1 Anrufliste `IDEA-PRX-005` |
| Terminbestätigung bei Anlage, Absage- und Änderungs-SMS; Benachrichtigung bei Therapeutenausfall | appointmed, THEORG, thevea, Optica | fehlt | Stufe 2, B15 |
| Online-Buchung als Anfrage mit Freigabe, Vorlauf, Buchungshorizont, buchbare Leistungen je Person; Buchungslink für Website | appointmed ([Online-Buchung](https://intercom.help/appointmed/de/articles/3311065-online-buchung-aktivieren-allgemeine-einstellungen)), thevea, Optica, MD | fehlt; Etappe 4 | Stufe 2 |
| Patienten-App: Termine sehen, buchen, absagen; Nachrichten; Praxisprofil; Navigation | THEORG TheraConnect ([TheraConnect](https://sovdwaer.de/theraconnect)); thevea und Optica: **kein** Portal | fehlt; Etappe 4 Portal mit deutlich mehr Umfang | Stufe 2 |
| Sicherer Dateiversand mit SMS-Code; Nachrichtenhistorie in der Akte | appointmed, thevea | fehlt; Etappe 6 (`IDEA-KOM-*`) | Stufe 2 |
| Videotherapie integriert (Zava, WebPRAX) | thevea, Optica, appointmed | Terminart „Video" im Modell; kein Dienst | Stufe 2, ADR-002 |
| DSGVO-Zustimmung per E-Mail-Button oder Unterschrift; Einwilligung für Erinnerungsdienst | appointmed ([DSGVO](https://intercom.help/appointmed/de/articles/2954274-datenschutz-bestimmung-dsgvo-zustimmung-datenaktualisierung)), THEORG | fehlt; geplant PAT-006 | Stufe 1 |
| KIM-Kommunikation mit Arztpraxen | iPrax, thevea, Optica | fehlt | außerhalb bis Entscheidung (TI) |

## 7. Mobil und Hausbesuch

| Funktion | Bei wem (Beleg) | Bei uns | Einordnung |
| --- | --- | --- | --- |
| Offline-first mit Hintergrund-Synchronisation (fast alles offline) | iPrax ([FAQ](https://www.iprax-systems.com/praxissoftware/iprax_faq.html)) | fehlt; ADR-001 erlaubt nur Tagesplan und Entwürfe | Stufe 2 |
| Offline-Kalender nur lesend (letzter und nächster Monat auf dem Gerät) | thevea ([Offline-Kalender](https://support.thevea.de/hc/de/articles/23655501771805-Offline-Terminkalender-nutzen)) | fehlt | Entscheidung, `IDEA-PRX-014` |
| Kein Offline, keine lokalen Daten („Remote-Desktop"); Nutzerkritik: Logout vergessen | THEORG 2GO ([2GO](https://sovdwaer.de/theorg-2go)), appointmed, Optica | wie wir heute | — |
| Navigation zum Hausbesuch: Adresse an die Karten-App übergeben | THEORG 2GO, MD, TheraConnect | fehlt; Entwurf UX-EPIC-001 (`geo:`-Link ohne Namen, `ANN`) | Stufe 1 |
| Termine unterwegs verschieben und anlegen (Nutzerkritik 2GO: „super unpraktisch") | alle Apps | Ziehen mobil riskant (P-06); Entwurf UX-EPIC-001 | Stufe 1 |
| Hausbesuchspauschale als Position; Hausbesuch als Therapieform | thevea, THEORG | fehlt; ABR-001 Position; Terminart vorhanden | Stufe 1 |
| Foto aufnehmen und hochladen aus der App; Quick-Scan ohne Login | thevea, appointmed | fehlt; DAT-EPIC-001 | Stufe 2 |
| Biometrischer Login (Face ID); Sitzungsschutz auf dem Handy | appointmed; Nutzerforderung | fehlt; Entwurf STAFF-004 „Sitzungen beenden", Endgeräte-Richtlinie | Stufe 1 |
| Kartenzahlung unterwegs | iPrax, appointmed, thevea | fehlt | Stufe 2 |
| KI-Tourenplanung, Karte mit Standorten | MD Therapie | Vorschau Touren; TOUR-001 (B7) | Stufe 2 |

## 8. Personal und Betrieb

| Funktion | Bei wem (Beleg) | Bei uns | Einordnung |
| --- | --- | --- | --- |
| Mitarbeitende mit Arbeitszeiten, Pausen, Abwesenheiten; inaktiv statt löschen | thevea ([Mitarbeiter](https://support.thevea.de/hc/de/articles/9982187615901-Mitarbeiterverwaltung-Mitarbeiter-anlegen-Arbeitszeiten-und-Abwesenheiten-verwalten)), appointmed, iPrax | vorhanden (STAFF-001, CAL-005) | Vorsprung |
| Urlaubs- und Fortbildungsplanung, Überstundenkonto, Arbeitszeiterfassung (Transponder), Monatsabrechnung | THEORG Modul ([Arbeitszeit](https://sovdwaer.de/arbeitszeitverwaltung)), Optica Modul; thevea: keine minutengenaue Erfassung; iPrax: bewusst nicht | Vorschau; URL-001, ZK-001 (B6) | Stufe 2 |
| Rollen: Manager, Angestellte, Selbstständige (appointmed); Admin/Mitarbeiter (thevea); Lizenz je Rolle (Optica) | appointmed ([Rollen](https://intercom.help/appointmed/de/articles/4544292-benutzerrollen)), thevea | vorhanden, vier Rollen mit RLS | Vorsprung |
| Aufgaben mit Fälligkeit, Zuweisung, Erledigungs-Benachrichtigung; überfällige als Badge | appointmed | fehlt | Idee `IDEA-PRX-019` |
| Qualifikationen je Mitarbeiter:in für die Terminvergabe | Optica, THEORG | fehlt | Idee (später, `IDEA-QSN-010` Nachbarschaft) |
| Provisionen, mehrere Standorte, Mandanten | THEORG, Optica, MD | n. r.; ADR-003 | außerhalb |
| Schulung, Webinare, Help-Center mit 500 Artikeln, Live-Chat, Einrichtungs-Checkliste | THEORG, iPrax, appointmed, thevea | Kurzanleitung „erster Tag" (Entwurf H2), `docs/abnahme/` | Betrieb, kein Feature |

## 9. Auswertung

| Funktion | Bei wem (Beleg) | Bei uns | Einordnung |
| --- | --- | --- | --- |
| Kennzahlen: Umsatz, Auslastung, Behandlungszahlen, offene Posten, Zeitraumvergleich, Diagramme, CSV-Export | Standard: iPrax ([FAQ](https://www.iprax-systems.com/praxissoftware/iprax_faq.html)), THEORG, thevea, Optica, MD, Starke Praxis | fehlt | Stufe 2, `IDEA-PRX-025`; §20 bei Personenbezug |
| Umsatz je Mitarbeiter:in, Zuweiserstatistik | thevea, THEORG, Optica | fehlt | Stufe 2, B6 |
| Automatische Tages-/Monatsberichte per E-Mail | appointmed | fehlt | Idee |

## 10. Dokumente, Vorlagen, Unterschrift

| Funktion | Bei wem (Beleg) | Bei uns | Einordnung |
| --- | --- | --- | --- |
| Eigene PDF-Vorlagen (Behandlungsvertrag, Datenschutz, Anamnese) hochladen, digital ausfüllen, auf dem Gerät unterschreiben; Klemmbrett-Tablet | iPrax ([Vorlagen](https://www.iprax-systems.com/praxissoftware/physiotherapie-software.html)), THEORG Klemmbrett, thevea (Signatur seit 06/2026) | fehlt; PAT-006 als Vermerk | Entscheidung, `IDEA-PRX-015` |
| Über 100 Mustertexte, eigene Vorlagen mit Platzhaltern aus Karteien, Blitzdruck | THEORG ([weitere Funktionen](https://sovdwaer.de/weitere-funktionen)), thevea Word-Vorlagen | fehlt | Stufe 2 (mit DOK-005) |
| Dateiablage am Patienten (Befunde, Verträge, Scans; 10 MB, PDF/JPG) | alle | fehlt; ADR-017, DAT-EPIC-001 | Stufe 1 (Verordnungsscan), Rest Stufe 2 |
| Formulargenerator für eigene Bögen | Optica Omnia | fehlt; FRB-001 | Stufe 2 |
| Vorlagen für Ausfallrechnung und Ausfallhonorar-Information (§ 615 BGB, 24-Stunden-Regel) | thevea Ratgeber ([Ausfallhonorar](https://thevea.de/praxis-wissen/ausfallhonorar-ausfallrechnung-vorlage/)) | fehlt; PAT-006 Text, CAL-008 | Stufe 1 |

## 11. System und Sicherheit

| Funktion | Bei wem (Beleg) | Bei uns | Einordnung |
| --- | --- | --- | --- |
| Hosting in Deutschland/EU, ISO-27001-Rechenzentrum, AVV, Verschlüsselung, Backups durch den Anbieter, § 203 | thevea ([Datenschutz](https://support.thevea.de/hc/de/articles/17657664736669-Datenschutz-und-Datenverarbeitung-bei-thevea)), Optica, appointmed, iPrax | OPS-001 Providerprüfung, OPS-003 | Stufe 1 (Etappe G) |
| Rollenbasierte Rechte (zwei- bis dreistufig); 2FA nirgends belegt | thevea, appointmed | vier Rollen, RLS, MFA für `owner` geplant | Vorsprung |
| Audit-Log (Prüfkriterium der Portale); Versionierung der Dokumentation | Optica; sonst kaum belegt | vorhanden (ADR-010, DOK) | Vorsprung |
| Datenexport für Auskunft und Wechsel; kein Vendor-Lock-in | appointmed, Optica, iPrax | geplant OPS-006 | Stufe 1 minimal |
| Automatische Updates alle zwei Wochen ohne Unterbrechung, Release-Notes-Portal | appointmed, thevea, Optica | Entwurf BETRIEB-001 Release-Takt | Stufe 1 (Betrieb) |
| Verschlüsselung mit individuellem Praxisschlüssel | Optica | nicht vorgesehen | Idee, nur mit ADR |
| Telematikinfrastruktur, KIM | iPrax, thevea, Optica, MD, PraxWin | nicht vorgesehen | außerhalb bis Entscheidung |

## 12. Bedienung

| Funktion | Bei wem (Beleg) | Bei uns | Einordnung |
| --- | --- | --- | --- |
| Globale Suche; Schnellanlegen „Neu →" (Termin, Patient, Rechnung); Tastenkürzel | thevea, appointmed, THEORG | Suche nur in der Patientenliste; Entwurf UX-EPIC-001 | Stufe 1, `IDEA-PRX-020` |
| Wiedervorlage-Badge im Hauptmenü, Kalender als Startansicht | appointmed | „Übersicht" als Start; „Offen heute" Entwurf UX-EPIC-001 | Stufe 1 |
| Intuitive Bedienung ohne Ballast — häufigste Nutzererwartung und häufigster Wechselgrund | Foren, Bewertungen | Maßstab in `OPTIMIERUNG.md` | Verfahren |
| Kalender-Abo (iCal) nur lesend für Apple/Google/Outlook | appointmed ([Kalender-Abo](https://intercom.help/appointmed/de/articles/2619676-verknupfe-deinen-appointmed-kalender-mit-google-kalender)) | fehlt | Idee mit Bedenken `IDEA-PRX-024` (`IDEA-ORG-004`) |

## 13. Schnittstellen

| Funktion | Bei wem (Beleg) | Bei uns | Einordnung |
| --- | --- | --- | --- |
| DATEV/Lexware-Export, CSV für Steuerberatung | THEORG, thevea, Optica, appointmed | fehlt | `IDEA-PRX-026`, B4 |
| SumUp-Kartenterminal mit Sonderkonditionen | iPrax, thevea, appointmed | fehlt | `IDEA-PRX-022` |
| Doctolib-Konnektor, externe Buchungsdienste, Buchungs-Widget | THEORG (Drittanbieter), tinana, thevea od bookings | fehlt | Stufe 2, B15 |
| Videodienst-Integration (Zava, WebPRAX) | thevea, Optica | fehlt | Stufe 2 |
| Anbindung an Trainings- und Testsoftware (THEDEX, Lanista, medo.check) | THEORG | fehlt; eigene Übungspläne Etappe 3 | Stufe 2, `IDEA-QSN-008` |
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

## Was daraus für uns folgt — in einem Absatz

Die Kette Verordnung → Serie → Zustände → Leistung → Rechnung → Zahlung, die
Roadmap 2.0 bis Dezember schließt, ist bei allen sechs Systemen Standard;
dort holen wir Parität nach, nicht Vorsprung. **Wirklich neu** gegenüber der
Planung sind vier Dinge, die bei drei oder mehr Wettbewerbern stehen und
nirgends bei uns: Warteliste mit Nachrücken, Terminerinnerung mit
Einwilligung, Textbausteine in der Dokumentation, und Kennzahlen für die
Praxisführung — dazu die Kleinigkeiten, die der Alltag braucht (Terminzettel,
Folgetermin, Direktkontakt, Rechnungsempfänger, Sammelrechnung, Import). **Kein
Wettbewerber** hat ein Portal mit Intake und Übungsplänen (Etappe 4/5), eine
Betreuungsplattform nach Therapieende (Etappe 8) oder ein Rollen- und
Auditmodell wie unseres; iPrax ist mit Offline-first und thevea mit dem
lesenden Offline-Kalender die einzigen, die den Funkloch-Fall lösen. Was die
Wettbewerber am meisten Kritik einbringt — schwer erreichbarer Support,
Instabilität, hoher Einrichtungsaufwand, altbackene Oberflächen, mobile Apps
ohne echten Nutzen — ist zugleich die Liste dessen, was `OPTIMIERUNG.md`
misst.

Zuletzt aktualisiert: 2026-09-06
