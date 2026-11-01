# Verzeichnis der Verarbeitungstätigkeiten

Entwurf, Stand 1. November 2026. Nach Art. 30 Abs. 1 DSGVO.

**Verantwortlicher:** [Name der Praxis, Anschrift, Telefon, E-Mail]
**Vertreten durch:** Jannes Wichelhaus, Inhaber
**Datenschutzbeauftragte Person:** bisher keine benannt. Unter 20 Personen wäre das nicht nötig,
aber § 38 Abs. 1 Satz 2 BDSG verlangt eine, sobald eine DSFA Pflicht ist. Das klärt die
Schwellwertprüfung.

Für alle Verarbeitungen gilt: Die Daten liegen in einer Datenbank bei Supabase in einem
Rechenzentrum in der EU. Eine Übermittlung in Drittländer ist nicht vorgesehen. Die technischen und
organisatorischen Maßnahmen stehen in `tom.md`. Die Fristen setzt die Software selbst um, sie sind
in der Datenbank hinterlegt (`README.md`, „Fristen aus der Datenbank“).

## 1. Behandlung und Dokumentation

- **Zweck:** physiotherapeutische Behandlung, auch als Hausbesuch, und ihre Dokumentation.
- **Betroffene:** Patientinnen und Patienten, Begleitpersonen, verordnende Ärztinnen und Ärzte.
- **Daten:** Stammdaten, Kontakt, Verordnung mit Diagnose, Anamnese, Befund, Fragebögen und Skalen,
  Behandlungsdokumentation, Fotos von Befunden (nur mit Einwilligung), Termine.
- **Rechtsgrundlage:** Art. 6 Abs. 1 lit. b, Art. 9 Abs. 2 lit. h DSGVO mit § 22 Abs. 1 Nr. 1
  lit. b BDSG; Dokumentationspflicht nach § 630f BGB. Fotos: Art. 9 Abs. 2 lit. a DSGVO.
- **Empfänger:** keine außerhalb der Praxis. Supabase als Auftragsverarbeiter.
- **Frist:** 10 Jahre nach Abschluss der Behandlung (§ 630f Abs. 3 BGB). Fotos 1 Jahr.

## 2. Terminplanung und Hausbesuche

- **Zweck:** Termine vergeben, Touren planen, Fahrzeiten prüfen, zum Hausbesuch navigieren.
- **Betroffene:** Patientinnen und Patienten, Mitarbeitende (wessen Tour).
- **Daten:** Termine, Anschrift des Hausbesuchs, daraus berechnete Kartenposition.
- **Rechtsgrundlage:** Art. 6 Abs. 1 lit. b DSGVO (Behandlungsvertrag).
- **Empfänger:** Kartendienst PTV als Auftragsverarbeiter; er bekommt nur Anschrift oder
  Koordinaten, nie Namen oder Uhrzeiten (Einzelheiten in `kartendienst.md`).
- **Frist:** wie die Akte; Termine ohne Behandlungsbezug 3 Jahre.

## 3. Abrechnung und Zahlungen

- **Zweck:** Rechnungen stellen, Zahlungen und Erstattungen verbuchen, Buchhaltung und Steuer.
- **Betroffene:** Patientinnen und Patienten, Rechnungsempfänger, Kundinnen und Kunden im Training.
- **Daten:** Rechnungen mit Leistungen und Diagnose der Verordnung, Zahlungen, Stornos.
- **Rechtsgrundlage:** Art. 6 Abs. 1 lit. b und c DSGVO; § 147 AO, § 14 UStG.
- **Empfänger:** Steuerberatung (Buchungsstapel im DATEV-Format ohne Namen und Diagnosen, die
  Rechnungen als Belege, ANN-829), Finanzamt bei einer Prüfung. Offen für die
  Datenschutzinformationen: Die Patienteninformation nennt die Steuerberatung noch nicht
  (Art. 13 Abs. 1 lit. e DSGVO).
- **Frist:** 8 Jahre ab Ende des Kalenderjahres (§ 147 Abs. 3 AO).

## 4. Patientenplattform

- **Zweck:** Übungen, Fragebögen, Nachrichten und Unterlagen zwischen Praxis und Patientinnen und
  Patienten.
- **Betroffene:** Patientinnen und Patienten mit Zugang, Vertretungen.
- **Daten:** Zugangsdaten, Nachrichten, ausgefüllte Bögen, Rückfragen mit Anhängen, Einwilligungen.
- **Rechtsgrundlage:** Art. 6 Abs. 1 lit. b, Art. 9 Abs. 2 lit. h DSGVO; Einwilligung, wo sie
  verlangt wird (Art. 9 Abs. 2 lit. a DSGVO).
- **Empfänger:** keine außerhalb der Praxis. Mailversand über einen noch zu prüfenden Anbieter.
- **Frist:** Zugang 3 Jahre nach Ende; Nachrichten 3 Jahre; Anhänge von Rückfragen 30 Tage.

## 5. Training und Ernährungsberatung

- **Zweck:** Personal Training und Ernährungsberatung als eigener Vertrag neben der Behandlung.
- **Betroffene:** Kundinnen und Kunden.
- **Daten:** Stammdaten, Vertrag, Trainingsprotokolle, Ernährungstagebuch, Gewicht.
- **Rechtsgrundlage:** Art. 6 Abs. 1 lit. b DSGVO; Gesundheitsangaben mit Einwilligung (Art. 9
  Abs. 2 lit. a DSGVO).
- **Empfänger:** keine außerhalb der Praxis.
- **Frist:** 3 Jahre nach Vertragsende (§ 195 BGB).

## 6. Team, Arbeitszeit und Radflotte

- **Zweck:** Zusammenarbeit im Team, Urlaub, Arbeitszeit, Auslagen, Lastenräder und Pannen.
- **Betroffene:** Mitarbeitende.
- **Daten:** Beschäftigtendaten, Teamchat, Urlaub, Arbeitszeit, Zeitkonto, Erstattungen,
  Schlüsselübergaben und Pannen der Räder.
- **Rechtsgrundlage:** Art. 6 Abs. 1 lit. b und c DSGVO (Arbeitsvertrag, § 16 Abs. 2 ArbZG,
  § 147 AO bei Erstattungen). Keine Leistungs- oder Verhaltenskontrolle.
- **Empfänger:** Steuerberatung bei Erstattungen.
- **Frist:** Teamchat 1 Jahr; Urlaub, Arbeitszeit, Radflotte 3 Jahre; Erstattungen 8 Jahre;
  Schlüsselverlauf 30 Tage.

## 7. Konten, Sicherheit und Nachweise

- **Zweck:** Anmeldung, Schutz der Daten, Nachweis von Zugriffen.
- **Betroffene:** alle Nutzerinnen und Nutzer der Software.
- **Daten:** Konten, Sitzungen, Protokoll von Zugriffen auf Gesundheitsdaten, Betriebslogs ohne
  Inhalte.
- **Rechtsgrundlage:** Art. 6 Abs. 1 lit. c DSGVO mit Art. 5 Abs. 2 und Art. 32 DSGVO.
- **Empfänger:** Supabase als Auftragsverarbeiter.
- **Frist:** Zugriffsprotokoll 3 Jahre, Leseprotokoll 1 Jahr, Sitzungsvermerke 1 Tag.

## 8. Spracheingabe in der Dokumentation (noch abgeschaltet)

- **Zweck:** Dokumentation diktieren statt tippen; der Text ist ein Entwurf, den die Therapeutin
  oder der Therapeut prüft.
- **Betroffene:** Patientinnen und Patienten, Mitarbeitende.
- **Daten:** Tonaufnahme, nur für die Umwandlung, danach verworfen.
- **Empfänger:** ein KI-Anbieter, erst nach Prüfung und Vertrag. Bis dahin läuft nichts nach außen.

## Offen

- Anschrift und Kontakt der Praxis eintragen.
- Anbieter für Mailversand und Spracheingabe, sobald geprüft.
- Ob eine datenschutzbeauftragte Person benannt werden muss (siehe oben).
