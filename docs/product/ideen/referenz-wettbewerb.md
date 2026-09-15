# Referenz: Funktionen vergleichbarer Praxisprogramme

> Nicht normativ. Siehe [../IDEENSPEICHER.md](../IDEENSPEICHER.md). Rang 6 —
> diese Datei begründet **keinen** Scope. Sie beantwortet je Bruchstelle „wie
> lösen es andere", nie „was fehlt uns" (`docs/development/OPTIMIERUNG.md`,
> Abschnitt 13).

Stand der Recherche: 2026-09-05/06. Auftrag von Jannes: Welche Funktionen
haben iPrax, THEORG, thevea und vergleichbare Terminierungsprogramme — so
detailliert wie möglich. Was davon bei uns gebaut ist, steht in
`../../development/ARBEITSBEREICHE.md`; die Reihenfolge allein in
`../../development/ROADMAP.md`.

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


## Legende

Spalte „Einordnung", ohne Reihenfolge: **Idee** (Ideenspeicher, kein Termin),
**Entscheidung** (Spur B, mit Kennung), **außerhalb** (Prinzipien, ADRs oder
Zielbetrieb schließen es aus), **Vorsprung** (wir haben es, viele Wettbewerber
nicht), **Komfort** (Roadmap-Kategorie neben Kern), **—** (nichts davon).

---

## 1. Terminplanung

| Funktion | Bei wem (Beleg) | Einordnung |
| --- | --- | --- |
| Terminserie aus der Verordnung, Serie mit Intervall in einem Schritt, Dauertermine; Automatik berücksichtigt Urlaub | Standard: iPrax, THEORG, thevea, appointmed, Optica, MD ([appointmed](https://intercom.help/appointmed/de/articles/2681779-serientermine-und-terminserien-erstellen-bearbeiten-loschen), [THEORG](https://sovdwaer.de/terminplan)) | — |
| Automatische Terminsuche: freier Slot nach Person, Dauer, Wunschzeit; thevea „Termine planen" trägt eine ganze Verordnung ein | Standard: iPrax, THEORG, thevea, appointmed, MD, Optica ([thevea](https://support.thevea.de/hc/de/articles/7405528194461-Freie-Termine-finden-mit-Hilfe-der-Funktion-Termine-planen)) | Idee `IDEA-PRX-008` |
| Warteliste mit Wochentag-/Tageszeitpräferenz, Dringlichkeit; bei Absage passende Einträge, Anruf aus der App, Nachrücken | Standard: iPrax, THEORG, thevea, appointmed, Optica, MD, henara ([iPrax](https://www.iprax-systems.com/praxissoftware/physiotherapie-software.html)) | Idee `IDEA-PRX-003`; Nachrücken automatisch: Entscheidung B15 (nein) |
| Folgetermin ohne Neuauswahl („Weiterer Termin"), Anlegen per Tap auf freie Zeit, Kopieren, Drag & Drop | iPrax ([App Store](https://apps.apple.com/de/app/iprax/id529795949)), thevea | — |
| Kollisions-, Abstands- und Frequenzprüfung beim Anlegen; Qualifikation und Zeit je Therapeut:in | THEORG ([Terminplan](https://sovdwaer.de/terminplan)), appointmed, iPrax | — |
| Fahrzeiten zwischen Hausbesuchen automatisch einplanen, Karte mit Patientenstandorten | MD Therapie ([Physiotherapie](https://www.medifoxdan.de/software-therapeuten/fachbereiche/physiotherapie)); bei iPrax, THEORG, appointmed nicht belegt | Entscheidung B7 → ADR-019 (Gate) |
| Terminstatus mit Absage, Absagegrund, Information an die Person (SMS/E-Mail) | appointmed ([Absage-SMS](https://intercom.help/appointmed/de/articles/3302368-information-uber-abgesagte-geanderte-termine-via-sms)), Optica, thevea | Entscheidung B15 (keine automatische Benachrichtigung; Messenger ausgeschlossen) |
| No-show-Status und Ausfallhonorar | iPrax (Ausfallhonorar-Rechnung); bei appointmed nicht belegt; thevea nur Vorlagen | — |
| Terminzettel oder Terminübersicht je Person drucken, per E-Mail oder SMS senden; Tages-/Tourenliste je Mitarbeiter:in drucken | THEORG, appointmed ([Terminübersicht](https://intercom.help/appointmed/de/articles/3064727-terminubersicht-fur-einen-patienten-drucken-senden)), iPrax, Optica | Idee `IDEA-PRX-006` (PDF, Tourenliste) |
| Farbcodierung je Leistung, Therapieform, Person; freie Termine hervorgehoben; Hausbesuch als Farbe | appointmed, thevea ([Kalender](https://support.thevea.de/hc/de/articles/7405107580317-Terminkalender-in-thevea-Alles-was-du-wissen-musst)), iPrax, THEORG | Komfort, UI-001, Idee `IDEA-PRX-021` |
| Ansichten Tag, Woche je Person, Monat mit Termindichte; Öffnungszeiten grau, individuelle Verfügbarkeit überschreibt sie; Raster bis 5 Minuten | iPrax, appointmed ([Öffnungszeiten](https://intercom.help/appointmed/de/articles/2635040-offnungszeiten)), thevea 25-Minuten-Takt | Komfort |
| Abwesenheiten (Urlaub, Krankheit, Fortbildung) blockieren den Kalender | thevea, appointmed, iPrax | — |
| Änderungsprotokoll je Termin sichtbar | thevea (Plus) | Vorsprung |
| Räume, Geräte, Fahrzeuge als Ressourcen mit Doppelbelegungsschutz | alle | — |
| Gruppentermine, Passivleistungen, Kurse | THEORG, thevea, iPrax | außerhalb |
| Online-Terminvergabe oder -anfrage, die die Praxis bestätigt; Patienten-App (TheraConnect) | Standard: THEORG, thevea (od bookings), appointmed, Optica, MD, tinana, cituro; **nicht** iPrax | Entscheidung B15 (setzt Portal und B5 voraus) |

## 2. Patientenverwaltung

| Funktion | Bei wem (Beleg) | Einordnung |
| --- | --- | --- |
| Abweichender Rechnungsempfänger (Angehörige, Betreuung, Beihilfe); beide auf der Rechnung; verknüpfte Kontakte je Patient:in | THEORG, appointmed ([verknüpfte Kontakte](https://intercom.help/appointmed/de/articles/2954273-interne-notizen-aufgaben-verknupfte-kontakte)), thevea | Idee `IDEA-PRX-010` |
| Ärzte-/Verordnerkartei, Gemeinschaftspraxen, Arztdatenbank für Berichte | THEORG, thevea ([Arztverwaltung](https://support.thevea.de/hc/de/articles/19514624635549-Arztverwaltung)), Optica, iPrax | — |
| Interne Notiz getrennt von der Dokumentation; Besonderheiten; Patientenstatus | appointmed, thevea, iPrax | — |
| Akte als Gesamtübersicht: Stammdaten, Verordnungen, Termine, Rechnungen, Doku, Dateien, gesendete Nachrichten | thevea ([Patientenverwaltung](https://support.thevea.de/hc/de/articles/30365867196829-Patientenverwaltung-in-thevea-Alles-was-du-wissen-musst)), iPrax (fünf Bereiche) | Idee `IDEA-QSN-001` (Zeitstrahl) |
| Dublettenprüfung und Zusammenführen | thevea ([Zusammenführen](https://support.thevea.de/hc/de/articles/19361932692125-Wie-kann-ich-Patienten-zusammenf%C3%BChren)) | Idee `IDEA-PRX-018` |
| Patient:innen löschen oder inaktiv setzen | thevea | Vorsprung |
| Import bestehender Stammdaten aus CSV/XLS; Wechselservice | iPrax ([FAQ](https://www.iprax-systems.com/praxissoftware/iprax_faq.html)), thevea, Optica | — |
| Anmeldeformular zur Selbsteingabe per Link, SMS, QR-Code oder Tablet | appointmed ([Anmeldeformular](https://intercom.help/appointmed/de/articles/10751938-anmeldeformular-datenaktualisierung-fur-patienten)) | — |
| Direktkontakt: Tap auf Nummer oder E-Mail öffnet Telefon oder Mail | iPrax | — |
| Aufgaben und Wiedervorlagen mit Patientenbezug, Fälligkeit, Zuweisung | appointmed ([Aufgaben](https://intercom.help/appointmed/de/articles/2785534-aufgaben-erstellen-erledigen-zuweisen-und-loschen)), MD | Idee `IDEA-PRX-019` |
| Selektionen von Patientengruppen für Marketing und Erinnerungen; Serienbriefe | THEORG | außerhalb (HWG, `IDEA-ANG-002` verworfen) |
| eGK einlesen, Versichertenstammdaten, Kostenträgerkartei, Zuzahlungsbefreiung | THEORG, iPrax, Optica | außerhalb (GKV) |
| Patientenliste als CSV, kompletter Verlauf je Person exportierbar (DSGVO) | appointmed, Optica | — |

## 3. Verordnung

| Funktion | Bei wem (Beleg) | Einordnung |
| --- | --- | --- |
| Privatverordnung als Grundlage der Privatrechnung; Rezepttypen GKV, BG, Privat, Selbstzahler; Vorlage nachträglich ändern | thevea ([Privatverordnung](https://support.thevea.de/hc/de/articles/9205787402141-Wie-lege-ich-eine-Privatverordnung-an)), iPrax, THEORG | — |
| Termin an Verordnung geknüpft mit Zähler (8/10), Terminblatt je Rezept, Kontingent automatisch verbraucht | thevea ([Verknüpfung](https://support.thevea.de/hc/de/articles/7404630950173-Wie-kann-ich-Termine-nachtr%C3%A4glich-mit-einer-Verordnung-verkn%C3%BCpfen)), THEORG | Idee `IDEA-PRX-009` |
| Rezepthistorie je Person, nach Jahr | iPrax | — |
| Verordnung per Kamera erfassen: OCR, KI-Texterkennung, Prüfung, unsichere Felder markiert; Barcode am Smartphone beim Hausbesuch | thevea Scan-App ([Scan-App](https://thevea.de/scan-app/)), iPrax Clever-Scan, THEORG 2GO, MD, Optica | Idee `IDEA-PRX-023` |
| Empfehlung oder Prognose zum Verordnungsende, Verordnungswertprognose | thevea (Prognose) | — |
| Fristen- und Frequenzprüfung nach Heilmittelrichtlinie, Heilmittelkatalog, Blankoverordnung, Rahmenverträge, Teilabrechnung | alle GKV-Systeme | außerhalb (GKV, ADR-009) |
| Rezeptanlage offline beim Hausbesuch | iPrax | außerhalb V1 (ADR-001) |

## 4. Dokumentation und Befund

| Funktion | Bei wem (Beleg) | Einordnung |
| --- | --- | --- |
| Textbausteine, persönlich und vorgefertigt, per Drag & Drop; Variablen aus der Akte | Standard: iPrax, thevea ([Textbausteine](https://support.thevea.de/hc/de/articles/25832498722717-Wie-kann-ich-Textbausteine-hinzuf%C3%BCgen-und-verwenden)), THEORG, Optica, MD | — |
| Körperschema (Body Chart) mit Markern; iPrax 3D-Modell in zehn Schichten; Winkelmessung Neutral-Null; Messreihen | appointmed ([Bodychart](https://intercom.help/appointmed/de/articles/2991775-bodychart)), THEORG, Optica, MD, iPrax | Idee `IDEA-PRX-027` |
| Fotos, Videos, Dateien an Termin oder Doku; Quick-Scan vom Smartphone | iPrax, thevea, MD, appointmed, Optica | Idee `IDEA-KOM-003` (Foto mit eigener Einwilligung) |
| Diktat und Spracheingabe (Systemdiktat, Siri); Nutzerkritik: Fachwörter | iPrax, thevea ([Diktat](https://support.thevea.de/hc/de/articles/33072824460445-Diktieren-von-Berichten-Dokumentationen-und-Anamneseb%C3%B6gen-in-der-thevea-App)), MD, THEORG 2GO, buchner | Entscheidung E13 |
| Dokumentation je Termin automatisch angelegt, chronologisch; Doku direkt aus dem Terminplan | iPrax, MD | — |
| Versionierte, historisierte Einträge; nachträgliche Änderung nachvollziehbar | Optica (seit 7.0); bei appointmed nicht belegt | Vorsprung |
| Therapiebericht mit Vorlagen, vorbefüllten Arzt- und Patientendaten, Versand; Patientenbrief mit Briefkopf | thevea, Optica, THEORG, appointmed | — |
| Anamnesebogen, Befund-/Assessment-Notizen, Verlaufsvisualisierung | thevea, Optica, Starke Praxis | — |
| Dokumentation mobil beim Hausbesuch, alle Geräte | alle | Vorsprung |
| Rollen: wer sieht Doku und Dateien (Manager alle, Selbstständige eigene) | appointmed | Vorsprung |

## 5. Abrechnung

| Funktion | Bei wem (Beleg) | Einordnung |
| --- | --- | --- |
| Privat- und Selbstzahlerrechnung aus Terminen; Leistungsübersicht unverrechneter Leistungen; Sammelrechnung, auch aus bar quittierten Terminen | Standard: iPrax, thevea, appointmed ([Sammelrechnung](https://intercom.help/appointmed/de/articles/3072767-sammelrechnung-aus-bestehenden-leistungen-erstellen)), THEORG, Optica, MD | Idee `IDEA-PRX-013` (Sammelrechnung) |
| „Rechnung legen": fortlaufende Nummer, danach unveränderbar, Storno mit Kennzeichen; Nummernformat und nächste Nummer einstellbar; Zahlungsziel 0 = „sofort" | appointmed ([Rechnung legen](https://intercom.help/appointmed/de/articles/3096748-rechnungs-editor-rechnungsansicht-rechnungsmerkmale)), thevea | — |
| Rechnungsstatus offen/fällig/bezahlt/storniert, Offene-Posten-Verwaltung, Zahlungseingangsübersicht, Teilzahlung | THEORG, thevea, Optica, appointmed | — |
| Zahlungserinnerung und Mahnung, bis drei Stufen mit Fristen und Gebühren; Versand per E-Mail; Abrechnungszentrum übernimmt Mahnwesen | Standard: THEORG, thevea ([Mahnwesen](https://support.thevea.de/hc/de/articles/29571089058845-Abrechnung-mit-thevea-Alles-was-du-wissen-musst)), Optica, MD, iPrax; bei appointmed nicht belegt | Idee `IDEA-PRX-012` |
| Ausfallrechnung für nicht wahrgenommene Termine | iPrax; thevea Vorlagen und Ratgeber | — |
| Leistungskatalog mit Preis, Dauer, Farbe, Steuersatz je Leistung; Privatpreislisten; Beihilfe wie Privat | appointmed, MD, thevea, THEORG | — |
| Rechnung mit Patient:in und abweichendem Empfänger, Verordnungsbezug als Nachweis für PKV/Beihilfe | appointmed, thevea, THEORG | — |
| Unterschrift oder Stempel als Bild auf der Rechnung; Bankverbindung und Merkmale je Rechnung überschreibbar | appointmed | Akzeptanzhinweis ABR-003 |
| Kartenzahlung SumUp mit Betragsübergabe, auch beim Hausbesuch; Zahlung automatisch der Rechnung zugeordnet | iPrax ([SumUp](https://www.iprax-systems.com/praxissoftware/physiotherapie-software.html)), thevea, appointmed | Idee `IDEA-PRX-022`, ADR-002 |
| Kassenbuch mit TSE/DSFinV-K, Quittungen, Tages-/Monatsabschluss | iPrax, THEORG, Optica, thevea, appointmed (AT) | nur bei Barzahlung |
| DATEV- oder CSV-Export von Rechnungen und Zahlungen; EÜR-Modul | thevea ([DATEV](https://support.thevea.de/hc/de/articles/32203651546653-Wie-kann-ich-meine-Daten-f%C3%BCr-DATEV-exportieren)), Optica, THEORG, appointmed (CSV) | Idee `IDEA-PRX-026`, Entscheidung B4 |
| E-Rechnung (XRechnung/ZUGFeRD) | bei keinem Produkt belegt | außerhalb V1 (B2C; §19) |
| GKV-Abrechnung, Zuzahlung, Abrechnungszentrum, Preislistenservice, Blankoverordnung | alle GKV-Systeme | außerhalb |
| Gutscheine, Kurse, Rehasport, Provisionen, Mandanten mit mehreren IK | iPrax, THEORG | außerhalb; Pakete zurückgestellt (`IDEA-ANG-001`, B11) |

## 6. Patientenkommunikation

| Funktion | Bei wem (Beleg) | Einordnung |
| --- | --- | --- |
| Terminerinnerung 24 h vorher per SMS oder E-Mail, je Person aktivierbar, Einwilligung dokumentiert; E-Mail kostenlos, SMS gegen Gebühr; Zusatztext je Behandlung | Standard: iPrax, THEORG, thevea, appointmed ([SMS](https://intercom.help/appointmed/de/articles/2931444-terminerinnerung-via-sms)), Optica, MD, henara | Entscheidung B15; Idee `IDEA-PRX-005` |
| Terminbestätigung bei Anlage, Absage- und Änderungs-SMS; Benachrichtigung bei Therapeutenausfall | appointmed, THEORG, thevea, Optica | Entscheidung B15 |
| Online-Buchung als Anfrage mit Freigabe, Vorlauf, Buchungshorizont, buchbare Leistungen je Person; Buchungslink für Website | appointmed ([Online-Buchung](https://intercom.help/appointmed/de/articles/3311065-online-buchung-aktivieren-allgemeine-einstellungen)), thevea, Optica, MD | Entscheidung B15 (setzt Portal und B5 voraus) |
| Patienten-App: Termine sehen, buchen, absagen; Nachrichten; Praxisprofil; Navigation | THEORG TheraConnect ([TheraConnect](https://sovdwaer.de/theraconnect)); thevea und Optica: **kein** Portal | — |
| Sicherer Dateiversand mit SMS-Code; Nachrichtenhistorie in der Akte | appointmed, thevea | Idee `IDEA-KOM-*` |
| Videotherapie integriert (Zava, WebPRAX) | thevea, Optica, appointmed | ADR-002 |
| DSGVO-Zustimmung per E-Mail-Button oder Unterschrift; Einwilligung für Erinnerungsdienst | appointmed ([DSGVO](https://intercom.help/appointmed/de/articles/2954274-datenschutz-bestimmung-dsgvo-zustimmung-datenaktualisierung)), THEORG | — |
| KIM-Kommunikation mit Arztpraxen | iPrax, thevea, Optica | außerhalb bis Entscheidung (TI) |

## 7. Mobil und Hausbesuch

| Funktion | Bei wem (Beleg) | Einordnung |
| --- | --- | --- |
| Offline-first mit Hintergrund-Synchronisation (fast alles offline) | iPrax ([FAQ](https://www.iprax-systems.com/praxissoftware/iprax_faq.html)) | außerhalb V1 (ADR-001) |
| Offline-Kalender nur lesend (letzter und nächster Monat auf dem Gerät) | thevea ([Offline-Kalender](https://support.thevea.de/hc/de/articles/23655501771805-Offline-Terminkalender-nutzen)) | — |
| Kein Offline, keine lokalen Daten („Remote-Desktop"); Nutzerkritik: Logout vergessen | THEORG 2GO ([2GO](https://sovdwaer.de/theorg-2go)), appointmed, Optica | — |
| Navigation zum Hausbesuch: Adresse an die Karten-App übergeben | THEORG 2GO, MD, TheraConnect | — |
| Termine unterwegs verschieben und anlegen (Nutzerkritik 2GO: „super unpraktisch") | alle Apps | — |
| Hausbesuchspauschale als Position; Hausbesuch als Therapieform | thevea, THEORG | — |
| Foto aufnehmen und hochladen aus der App; Quick-Scan ohne Login | thevea, appointmed | — |
| Biometrischer Login (Face ID); Sitzungsschutz auf dem Handy | appointmed; Nutzerforderung | — |
| Kartenzahlung unterwegs | iPrax, appointmed, thevea | Idee `IDEA-PRX-022` |
| KI-Tourenplanung, Karte mit Standorten | MD Therapie | Entscheidung B7 → ADR-019 (Gate) |

## 8. Personal und Betrieb

| Funktion | Bei wem (Beleg) | Einordnung |
| --- | --- | --- |
| Mitarbeitende mit Arbeitszeiten, Pausen, Abwesenheiten; inaktiv statt löschen | thevea ([Mitarbeiter](https://support.thevea.de/hc/de/articles/9982187615901-Mitarbeiterverwaltung-Mitarbeiter-anlegen-Arbeitszeiten-und-Abwesenheiten-verwalten)), appointmed, iPrax | Vorsprung |
| Urlaubs- und Fortbildungsplanung, Überstundenkonto, Arbeitszeiterfassung (Transponder), Monatsabrechnung | THEORG Modul ([Arbeitszeit](https://sovdwaer.de/arbeitszeitverwaltung)), Optica Modul; thevea: keine minutengenaue Erfassung; iPrax: bewusst nicht | Entscheidung B6 (2026-09-08): keine Auswertung je Person |
| Rollen: Manager, Angestellte, Selbstständige (appointmed); Admin/Mitarbeiter (thevea); Lizenz je Rolle (Optica) | appointmed ([Rollen](https://intercom.help/appointmed/de/articles/4544292-benutzerrollen)), thevea | Vorsprung |
| Aufgaben mit Fälligkeit, Zuweisung, Erledigungs-Benachrichtigung; überfällige als Badge | appointmed | Idee `IDEA-PRX-019` |
| Qualifikationen je Mitarbeiter:in für die Terminvergabe | Optica, THEORG | Idee (Nachbarschaft `IDEA-QSN-010`) |
| Provisionen, mehrere Standorte, Mandanten | THEORG, Optica, MD | außerhalb |
| Schulung, Webinare, Help-Center mit 500 Artikeln, Live-Chat, Einrichtungs-Checkliste | THEORG, iPrax, appointmed, thevea | Betrieb, kein Feature |

## 9. Auswertung

| Funktion | Bei wem (Beleg) | Einordnung |
| --- | --- | --- |
| Kennzahlen: Umsatz, Auslastung, Behandlungszahlen, offene Posten, Zeitraumvergleich, Diagramme, CSV-Export | Standard: iPrax ([FAQ](https://www.iprax-systems.com/praxissoftware/iprax_faq.html)), THEORG, thevea, Optica, MD, Starke Praxis | Idee `IDEA-PRX-025`; §20 bei Personenbezug |
| Umsatz je Mitarbeiter:in, Zuweiserstatistik | thevea, THEORG, Optica | Entscheidung B6 (2026-09-08): keine Auswertung je Person, nur Praxissummen |
| Automatische Tages-/Monatsberichte per E-Mail | appointmed | Idee |

## 10. Dokumente, Vorlagen, Unterschrift

| Funktion | Bei wem (Beleg) | Einordnung |
| --- | --- | --- |
| Eigene PDF-Vorlagen (Behandlungsvertrag, Datenschutz, Anamnese) hochladen, digital ausfüllen, auf dem Gerät unterschreiben; Klemmbrett-Tablet | iPrax ([Vorlagen](https://www.iprax-systems.com/praxissoftware/physiotherapie-software.html)), THEORG Klemmbrett, thevea (Signatur seit 06/2026) | Entscheidung E-13 (`IDEA-PRX-015` verworfen) |
| Über 100 Mustertexte, eigene Vorlagen mit Platzhaltern aus Karteien, Blitzdruck | THEORG ([weitere Funktionen](https://sovdwaer.de/weitere-funktionen)), thevea Word-Vorlagen | — |
| Dateiablage am Patienten (Befunde, Verträge, Scans; 10 MB, PDF/JPG) | alle | — |
| Formulargenerator für eigene Bögen | Optica Omnia | — |
| Vorlagen für Ausfallrechnung und Ausfallhonorar-Information (§ 615 BGB, 24-Stunden-Regel) | thevea Ratgeber ([Ausfallhonorar](https://thevea.de/praxis-wissen/ausfallhonorar-ausfallrechnung-vorlage/)) | — |

## 11. System und Sicherheit

| Funktion | Bei wem (Beleg) | Einordnung |
| --- | --- | --- |
| Hosting in Deutschland/EU, ISO-27001-Rechenzentrum, AVV, Verschlüsselung, Backups durch den Anbieter, § 203 | thevea ([Datenschutz](https://support.thevea.de/hc/de/articles/17657664736669-Datenschutz-und-Datenverarbeitung-bei-thevea)), Optica, appointmed, iPrax | — |
| Rollenbasierte Rechte (zwei- bis dreistufig); 2FA nirgends belegt | thevea, appointmed | Vorsprung |
| Audit-Log (Prüfkriterium der Portale); Versionierung der Dokumentation | Optica; sonst kaum belegt | Vorsprung |
| Datenexport für Auskunft und Wechsel; kein Vendor-Lock-in | appointmed, Optica, iPrax | — |
| Automatische Updates alle zwei Wochen ohne Unterbrechung, Release-Notes-Portal | appointmed, thevea, Optica | — |
| Verschlüsselung mit individuellem Praxisschlüssel | Optica | Idee, nur mit ADR |
| Telematikinfrastruktur, KIM | iPrax, thevea, Optica, MD, PraxWin | außerhalb bis Entscheidung |

## 12. Bedienung

| Funktion | Bei wem (Beleg) | Einordnung |
| --- | --- | --- |
| Globale Suche; Schnellanlegen „Neu →" (Termin, Patient, Rechnung); Tastenkürzel | thevea, appointmed, THEORG | Idee `IDEA-PRX-020` (Rest) |
| Wiedervorlage-Badge im Hauptmenü, Kalender als Startansicht | appointmed | — |
| Intuitive Bedienung ohne Ballast — häufigste Nutzererwartung und häufigster Wechselgrund | Foren, Bewertungen | Verfahren |
| Kalender-Abo (iCal) nur lesend für Apple/Google/Outlook | appointmed ([Kalender-Abo](https://intercom.help/appointmed/de/articles/2619676-verknupfe-deinen-appointmed-kalender-mit-google-kalender)) | Idee mit Bedenken `IDEA-PRX-024` (`IDEA-ORG-004`) |

## 13. Schnittstellen

| Funktion | Bei wem (Beleg) | Einordnung |
| --- | --- | --- |
| DATEV/Lexware-Export, CSV für Steuerberatung | THEORG, thevea, Optica, appointmed | Idee `IDEA-PRX-026`, Entscheidung B4 |
| SumUp-Kartenterminal mit Sonderkonditionen | iPrax, thevea, appointmed | Idee `IDEA-PRX-022` |
| Doctolib-Konnektor, externe Buchungsdienste, Buchungs-Widget | THEORG (Drittanbieter), tinana, thevea od bookings | Entscheidung B15 |
| Videodienst-Integration (Zava, WebPRAX) | thevea, Optica | ADR-002 |
| Anbindung an Trainings- und Testsoftware (THEDEX, Lanista, medo.check) | THEORG | Idee `IDEA-QSN-008` |
| Patientendaten-Import bei Softwarewechsel | thevea, iPrax, Optica | — |
| TI, KIM, eGK, Abrechnungszentren | alle GKV-Systeme | außerhalb |

---

## Wo wir anders sind

**Kein Wettbewerber** hat ein Portal mit Intake und Übungsplänen, eine
Betreuungsplattform nach Therapieende oder ein Rollen- und Auditmodell wie
unseres; iPrax (Offline-first) und thevea (lesender Offline-Kalender) lösen als
einzige den Funkloch-Fall.

Zuletzt aktualisiert: 2026-09-14 (Konsolidierung R2: Spalte „Bei uns", Preise, Portalkriterien
und Liste „ohne Entsprechung" entfernt). Ältere Stände: `git log -- docs/product/ideen/`.