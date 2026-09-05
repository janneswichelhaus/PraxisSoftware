# Roadmap

Version 2.0 · Stand 2026-09-05

Reihenfolge der Umsetzung. Beantwortet die Frage **„was als Nächstes"** — und
sonst nichts.

## Was dieses Dokument ist und was nicht

- **Es legt die Reihenfolge fest, nie den Scope.** Was ein Eintrag konkret
  umfasst, entsteht erst im SPEC-Schritt des Loops.
- **Es ist kein Auftrag.** Gebaut wird, was Jannes mit `/feature-loop`
  beauftragt. Ein Eintrag hier startet nichts von allein.
- **Es überschreibt nichts.** `PROJECT_PRINCIPLES.md`, die ADRs und
  `docs/decisions/OPEN_DECISIONS.md` gelten unverändert. Fehlt einem Eintrag
  eine Voraussetzung aus Spur B, gilt `PROJECT_PRINCIPLES.md` §15.1: reversibel
  überbrückbar → als Annahme registrieren und bauen; Hard-Stop-Liste → melden
  und nur den abhängigen Teil nicht beginnen.
- Die fachlichen Inhalte dahinter stehen im Ideenspeicher (`docs/product/`,
  nicht normativ). Verweise wie `IDEA-TRN-005` zeigen dorthin.
- Was in der Anwendung echt angebunden ist und was gekennzeichnete Vorschau,
  steht in [`ARBEITSBEREICHE.md`](ARBEITSBEREICHE.md).

Jeder Loop liest dieses Dokument zuerst und stellt am Ende die
Fortschrittstabelle und den Abschnitt „Nächster Loop" nach. Das ersetzt das
Wiederherleiten des Projektstands in jeder Session.

---

## Nächster Loop

```
/feature-loop VER-EPIC-001 Verordnungen: PAT-005, VER-001 bis VER-003
```

- **Ersatz**, falls VER-EPIC-001 blockiert ist: `LOE-EPIC-001`.
- **Parallel als Docs-Session** (kein Code): `ADR-017 Dateiablage` — muss vor
  `DAT-EPIC-001` vorliegen, spätestens Ende Oktober.
- **Jannes-seitig diese Woche:** Anfragen für die drei externen Prüfungen
  anstoßen — Datenschutzberatung (B2), MDR-Prüfstelle (B1), Steuerberatung
  (B4). Sie haben den längsten Vorlauf; ohne sie fällt der Zieltermin.

Nach jedem abgeschlossenen Loop wird dieser Abschnitt auf den nächsten Eintrag
gestellt (Skill-Schritt I).

---

## Ziel: Produktivbetrieb Ende März 2027

Entschieden von Jannes am 2026-09-05: Die Praxis arbeitet **ab Q1 2027** real
mit der Software. Stichtag für die Planung ist der **31.03.2027**.

**Go-live-Umfang (Stufe 1):** Patient:innen · Verordnungen · Termine mit
Serien und Zustandsautomat · Behandlungsdokumentation · Leistungen, Rechnung,
Zahlung · Mitarbeitende mit Konten und Rollen · Auditlog · Löschung und
Retention · alles aus Etappe G (Betriebsreife).

**Nicht Teil des Go-live (Stufe 2, ab Q2 2027):** Anamnese und Fragebögen
(Etappe 2), Übungspläne (Etappe 3), der gesamte Praxisbetrieb aus Spur A2
(Urlaub, Zeitkonto, Radflotte, Erstattungen, Teamchat, Touren), Portal und
alles danach. Die Vorschaubereiche bleiben bis dahin gekennzeichnete
Vorschau.

### Rückwärtsplan

| Monat    | Spur A1 Kernprozess                 | Spur A3 Betriebsreife                                  | Spur B (Jannes, extern)                                                 |
| -------- | ----------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------- |
| Sep 2026 | VER-EPIC-001                        | ADR-017 (Docs)                                         | Anfragen B2, B1, B4 anstoßen                                            |
| Okt 2026 | LOE-EPIC-001 · CAL-EPIC-003         | STAFF-EPIC-002                                         | Providerprüfung Supabase dokumentieren (mit Claude)                     |
| Nov 2026 | ABR-EPIC-001                        | OPS-001 Cloudprojekt und Umgebungen · DAT-EPIC-001     | B4 Ergebnis Steuerberatung                                              |
| Dez 2026 | ABR-EPIC-002                        | OPS-002 Deployment · OPS-005 Audit-Betrieb             | B2 Ergebnis: Schwellwertprüfung, DSB-Entscheidung                       |
| Jan 2027 | Befunde aus der Abnahme             | OPS-003 Backup/Restore · OPS-004 Logging · PAT-006 · OPS-006 · E2 | DSFA-Entwurf, Verzeichnis der Verarbeitungstätigkeiten, TOM     |
| Feb 2027 | —                                   | UI-001 Feindesign · Betriebsdokumentation              | B1 Ergebnis MDR-Prüfung · B3 Fristen validiert · DSFA abgeschlossen     |
| Mär 2027 | —                                   | Go-live-Abnahme, Restore-Test wiederholt               | Go-live-Gate (ADR-007, sieben Vorbedingungen)                           |

**Ehrliche Einschätzung:** Das sind rund 23 Loops in 29 Wochen, also knapp
ein Loop pro Woche ohne Ausfall — **ohne Puffer.** Regel für die Abweichung:
Ist `ABR-EPIC-002` am 31.12.2026 nicht abgehakt oder liegt ein Ergebnis aus
B1/B2 im Februar noch nicht vor, wird der **Termin** auf Q2 2027 gesetzt, nicht
der Umfang gekürzt. Patientensicherheit und Datenschutz gehen vor
Entwicklungsgeschwindigkeit (`PROJECT_PRINCIPLES.md` §16).

---

## Drei Spuren zum Bauen, eine zum Entscheiden

| Spur   | Inhalt                                                        | Wer                       |
| ------ | ------------------------------------------------------------- | ------------------------- |
| **A1** | Kernprozess: Klinik und Abrechnung                            | Claude, Feature-Loops     |
| **A2** | Praxisbetrieb: Urlaub, Zeitkonto, Flotte, Erstattungen, Team, Touren | Claude, nach Go-live |
| **A3** | Betriebsreife (Etappe G): alles, was der Produktivbetrieb braucht | Claude und Jannes      |
| **B**  | Entscheiden: offene Punkte mit Fälligkeit                     | Jannes, teils extern      |

**Takt:** Spur A1 hat Vorrang, bis Etappe 1 fertig ist. Spur A3 läuft
parallel dort, wo Jannes-seitige Vorlaufarbeit nötig ist (Providerprüfung,
externe Prüfungen); ab Dezember wechseln A1 und A3 ab. Spur A2 beginnt nach dem
Go-live — Ausnahme Urlaub, falls A1 und A3 vor dem Plan liegen. Ein Loop pro
Woche ist das Maß; zwei sind gut, drei bedeuten zu kleine Schnitte.

---

## Spur A1 — Kernprozess

### Etappe 1 — Der Kernprozess wird vollständig (bis Dezember 2026)

**Warum zuerst:** Verordnung → Termin → Dokumentation → Leistung → Rechnung
ist die Kette, auf der eine Praxis läuft. ADR-009 verlangt, dass erst nach
finalisierter Dokumentation fakturiert wird; die Verordnung liefert der
Rechnung Verordnungsdatum, Diagnose und Verordner:in und dem Kalender das
Kontingent — deshalb steht sie vorn (entschieden 2026-09-05).

| Loop (Epic)      | Stories                                                                                                                                                                                                                                                                                                                         | Voraussetzung                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| ~~DOK-EPIC~~     | DOK-001 bis DOK-004                                                                                                                                                                                                                                                                                                             | **fertig** (PR #5, PR #9)                                        |
| **VER-EPIC-001** | **PAT-005** Stammdaten ergänzen: Telefon (Geschäftlich), Mobil, Telefax, Einrichtung, Besonderheit, Bemerkung, feste Therapeut:in · **VER-001** Datenmodell Verordnung: Datum, Diagnose, Verordner:in als eigene Stammdaten (`prescribers`), Heilmittel-Positionen mit verordneter/genutzter Menge, Doppelbehandlung, Erst-/Folgeverordnung, Pauschalen als Flags, Bemerkung, Empfehlung zum Verordnungsende (weitere Verordnung sinnvoll / keine weitere Therapie / offen) · **VER-002** Verordnungen je Patient:in, nach Jahr, mit Vorschau · **VER-003** anlegen und bearbeiten | —                                                                |
| **LOE-EPIC-001** | **LOE-001** Datenklassen und Retention Schedule als Konfiguration an genau einer Stelle (ANN-001), „Abschluss der Behandlung" als fachlicher Anker, Legal Hold mit Beginn, Grund, Person, Ende · **LOE-002** Löschvorgang mit Nachweis, Auditbezug, Wiederanwendung nach Restore, alle Versionen eines Eintrags; `pnpm test:db` deckt jede Datenklasse ab | ANN-001, ANN-002; Löschung erfasst auch Verordnungen              |
| **CAL-EPIC-003** | **ADR-018** Terminzustände (erste Story, Docs): angefragt, vorgemerkt, bestätigt, abgesagt, nicht angetroffen, durchgeführt, dokumentiert, abgerechnet — Übergänge, wer sie auslöst, Migration der heutigen Status · **CAL-007** Terminserie aus der Verordnung: Anzahl aus dem Kontingent, fester Rhythmus, Konfliktprüfung je Termin, Einzelabweichung · **CAL-008** Zustandsautomat in Datenbank, Kalender und Detailansicht; „nicht angetroffen" mit Ausfallhonorar-Kennzeichen; „dokumentiert" aus der Finalisierung; Auditkatalog ergänzt | Umfang von Jannes entschieden 2026-09-05 (vollständiger Automat) |
| **ABR-EPIC-001** | **ABR-000** Praxis-Stammdaten für Rechnungen: Anschrift, Bankverbindung, Steuernummer/USt-IdNr., Logo (`owner`) · **ABR-001** Leistungskatalog versioniert mit Steuerkennzeichen je Version, Gültigkeitszeitraum · **ABR-002** Leistungserfassung am durchgeführten Termin, Kopplung an finalisierte Dokumentation mit begründetem, protokolliertem Override; Leistungskürzel im Behandlungsnachweis (C1, ANN-006) | B4 als Annahme, bis die Steuerberatung bestätigt                  |
| **ABR-EPIC-002** | **ABR-003** Rechnung: Rechnungsempfänger ≠ Patient:in (Beihilfe, PKV, Betreuung, Eltern), Zustände nach ADR-009 Punkt 7, Nummer erst bei Ausstellung, Snapshot inklusive Verordnungsbezug, PDF, Storno- und Korrekturdokument · **ABR-004** Zahlungen als Transaktionen, Teil- und Rückzahlung, offene Posten                                       | ABR-EPIC-001                                                     |

**Bewusst nicht Teil von Etappe 1:** Mahnwesen und Zahlungserinnerungen
(ABR-005, nach Praxiserfahrung) · Kostenträger, Versichertennummer, Zuzahlung
(GKV — Version 1 bleibt Privatabrechnung, ADR-009) · E-Rechnung · Kassenbuch,
TSE, Kartenzahlung · Factoring · automatischer Verbrauch des
Heilmittel-Kontingents durch Leistungen (kommt mit ABR-002 in Sicht, wird dort
entschieden).

### Etappe 2 — Anamnese, Verlauf, Bericht (Stufe 2)

**Warum hier:** Der strukturierte Erstbefund ist der zweitgrößte Zeitfresser
nach der Dokumentation und die Datengrundlage für alles Spätere.

| Loop         | Stories                                                                                                                                       | Voraussetzung   |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| FRB-EPIC-001 | **FRB-001** Instrumentenbibliothek, versioniert, mit Lizenzfeld (`IDEA-OUT-001`) · **FRB-002** freie Instrumente: NRS, patientenspezifische Funktionsskala (`IDEA-OUT-003`, `IDEA-OUT-004`) | —               |
| FRB-EPIC-002 | **FRB-003** Anamnesebogen nach §7, in der Praxis ausfüllbar · **FRB-004** Verlaufsdarstellung mit Ereignismarkierungen, ohne Bewertung (`IDEA-OUT-005`) | FRB-EPIC-001, **B8** |
| DOK-005      | Therapiebericht an die Verordner:in aus Befund und Verlauf (`PROJECT_PRINCIPLES.md` §4.2)                                                    | FRB-EPIC-002    |

### Etappe 3 — Übungspläne innerhalb der Therapie (Stufe 2)

Ein Heimprogramm, das die Therapeutin zusammenstellt und die Software nur
darstellt und ausgibt — Erfassen, Speichern, Strukturieren, Darstellen
(ADR-006 Punkt 2). **Keine automatische Anpassung**, keine Progression, kein
Vorschlag; B10 ist hier noch nicht nötig.

| Loop         | Stories                                                                                                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UEB-EPIC-001 | **UEB-001** Übungsbibliothek: Übung und Variante getrennt, Achsen und Nachbarschaften, zwei Sprachebenen (`IDEA-TRN-005`, `IDEA-QSN-002`) · **UEB-002** Plan zusammenstellen, zuweisen, Schnappschuss (`IDEA-TRN-011`) |
| UEB-EPIC-002 | **UEB-003** Plan als PDF — voller Nutzen ohne Portal · **UEB-004** Planlaufzeit und Wiedervorlage (`IDEA-ORG-006`)                                                              |

### Fernplan — Etappen 4 bis 10

Ab hier wird die Reihenfolge gröber. Was in Etappe 6 steht, wird vor Etappe 5
noch einmal überprüft — Pläne, die zwölf Monate voraus genau sind, sind
erfunden.

| Etappe | Inhalt                                                                                                                                                                                                                                | Voraussetzung                           |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| 4      | **Portalfundament:** Zugang getrennt vom Praxiszugang (Account ≠ Akte, §4.6) · Termine ansehen · Intake vor dem Erstkontakt (größter Einzelnutzen) · Dokumente und Rechnungen · Einwilligungsverwaltung auf PAT-006 aufbauend · Datenexport (`IDEA-QSN-003`) · Onboarding mit Überspringen (`IDEA-LZK-005`) · Barrierefreiheit als Abnahmekriterium (`IDEA-QSN-006`) | **B5**                                  |
| 5      | **Tracking und Check-ins:** Einheit protokollieren (`IDEA-TRK-001`) · Check-in mit Takt (`IDEA-TRK-004`) · Bewegungssicherheit (`IDEA-TRK-003`) · Auslassquote (`IDEA-OUT-006`) · Offline-Erfassung (`IDEA-TRK-008`) · Benachrichtigungen mit Regeln (`IDEA-KOM-006`). Erfassen und darstellen, **nicht** auswerten. | Etappe 4                                |
| 6      | **Kommunikation:** strukturierte Rückfragen (`IDEA-KOM-001`) · Notfallabgrenzung (`IDEA-KOM-002`) · Foto/Video mit eigener Einwilligung, kurzer Frist, Metadatenentfernung (`IDEA-KOM-003`) · Zuordnung zur Akte (`IDEA-KOM-007`)                                        | ADR-017, C2 (erledigt)                  |
| 7      | **Zeitstrahl und Sitzungsvorbereitung:** `IDEA-QSN-001`, `IDEA-ORG-005`, `IDEA-ORG-001`                                                                                                                                                | genug Inhalt aus 2 bis 6                |
| 8      | **Weiterbetreuung nach Therapieende:** Betreuungsepisode (`IDEA-LZK-002`), Zweckbindung (`IDEA-LZK-003`), Klientenprofil (`IDEA-LZK-004`), Pakete und Guthaben (`IDEA-ANG-001`), Rückfall (`IDEA-ANG-003`), Preise (`IDEA-ANG-004`), Offboarding (`IDEA-LZK-006`). Hier wird aus der Praxissoftware eine Betreuungsplattform. | **B9**, **B11**                         |
| 9      | **Progression:** versioniertes deterministisches Regelwerk (`IDEA-TRN-002`), Schattenbetrieb (`IDEA-TRN-012`), Regeltests (`IDEA-QSN-004`), mehrdimensional (`IDEA-TRN-004`), doppelte Progression (`IDEA-TRN-007`), Ampel (`IDEA-TRN-003`), Adhärenz (`IDEA-TRN-009`), Wiedereinstieg (`IDEA-TRN-010`). Bis B10 entschieden ist: `MDR_REVIEW_REQUIRED`, produktiv nicht erreichbar. | **B10** und externe Prüfung aus **B1**  |
| 10     | **KI-Assistenz:** zuerst der zentrale Pfad (`IDEA-KI-001`), dann Freitext strukturieren, Patientensprache, Antwortentwürfe — mit Quellenbindung (`IDEA-KI-003`) und menschlicher Freigabe                                                                            | Etappen 1 bis 3, ADR-005-Gateway, **C6** |

---

## Spur A2 — Praxisbetrieb (Stufe 2, nach Go-live)

Die Vorschaubereiche aus [`ARBEITSBEREICHE.md`](ARBEITSBEREICHE.md) bleiben
bis zu ihrem Loop stehen (entschieden 2026-09-05). Drei Regeln: **keine neue
Vorschau**, **keine Erweiterung einer Vorschau**, und jede Vorschau wird in
ihrem Loop **ersetzt**, nicht daneben gebaut.

| Reihenfolge | Loop                                                                                                     | Ersetzt Vorschau            | Voraussetzung                                                                 |
| ----------- | -------------------------------------------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------- |
| 1           | **URL-001** Urlaub: Antrag, Genehmigung durch Teamleitung/Inhaber, Abwesenheit wirkt auf Kalender und Kapazität | `/betrieb/urlaub`     | Urlaubsanspruch am Mitarbeiterdatensatz (`IDEA-QSN-010`) — Teil des Loops     |
| 2           | **ZK-001** Zeitkonto: Buchungen, Saldo je Person, keine Auswertung über Beschäftigte hinweg              | `/betrieb/zeitkonto`        | **B6** als Annahme (keine Leistungskontrolle, §20)                             |
| 3           | **FLT-EPIC-001** Radflotte: FLT-001 Räder, Depot, Schlüssel · FLT-002 Check-Up · FLT-003 Pannenassistent | `/betrieb/flotte…`          | Standortvorlage für Tübingen prüfen; Rad als Planungsressource des Kalenders  |
| 4           | **ERS-001** Erstattungen: eingereicht → genehmigt → ausgezahlt, Belege als Dateien                       | `/betrieb/erstattungen`     | ADR-017; steuerliche Belegaufbewahrung (B4)                                    |
| 5           | **TEAM-001** Teamkommunikation: Kanäle, Direktnachrichten, Threads, rollierende Speicherfrist (ANN-001), Anhänge nach ADR-017 | `/team`     | ADR-017                                                                       |
| 6           | **TOUR-001** Touren: Reihenfolge der Hausbesuche, Fahrzeit, Erreichbarkeit zweier Termine (§9)           | `/touren`                   | **B7** Kartendienst und dessen Prüfung nach ADR-002; DSFA-Wiedervorlage        |

---

## Spur A3 — Etappe G: Betriebsreife (vor Go-live)

Alles, was der Produktivbetrieb mit echten Daten braucht und was kein
Feature ist. Die ADRs verlangen es seit dem 2026-08-28; hier bekommt es
Reihenfolge, Verantwortliche und Termin.

| #   | Paket                                        | Inhalt                                                                                                                                                                                                                                             | Wer                          | Termin   |
| --- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | -------- |
| G1  | **ADR-017 Dateiablage**                      | Supabase Storage nach ADR-015 Punkt 10, signierte Verweise mit kurzer Gültigkeit, Datenklasse und Retention nach ADR-008, Zugriff nach ADR-004, Audit nach ADR-010, Virenprüfung erst bei Patienten-Uploads. Schließt E8.                            | Claude (Docs)                | Sep 2026 |
| G2  | **STAFF-EPIC-002 Konten und Rollen**         | STAFF-002 Zugang einladen, Rolle vergeben und ändern (auditiert) · STAFF-003 sperren, Passwort zurücksetzen, MFA für `owner`. Löst E11; E10 bis zur Entscheidung als Annahme (`owner`).                                                             | Claude                       | Okt 2026 |
| G3  | **OPS-001 Providerprüfung und Cloudprojekt** | Prüfkatalog aus ADR-002 für Supabase dokumentieren (AVV, §203, Verschlüsselung, Zugriff, Retention, Unterauftragnehmer, RPO/RTO nach ADR-012); bei positivem Ergebnis Cloudprojekt in EU-Region und Umgebungen Dev/Test/Prod (§3.2). **Keine Cloud-Ressource durch einen Agenten** (ADR-013). | Claude (Dokument), Jannes (Anlage) | Nov 2026 |
| G4  | **DAT-EPIC-001 Dateiablage**                 | DAT-001 Ablage-Grundlage: Bucket, Berechtigungen, signierte Verweise, Datenklasse, Audit · VER-004 Scan-Anhang je Verordnung                                                                                                                       | Claude                       | Nov 2026 |
| G5  | **OPS-002 Deployment und Freigabe**          | Frontend-Hosting mit Prüfung nach ADR-002; Release aus einem Tag mit menschlicher Freigabe; Migrationen gegen Produktion nur über die Pipeline; Rollback; `service_role` nie im Browser (CI-Prüfung); Review-Checkliste für kritische Änderungen (ADR-013). | Claude (Pipeline), Jannes (Freigabe) | Dez 2026 |
| G6  | **OPS-005 Audit-Betrieb**                    | Monatlicher Audit-/Security-Report (ADR-010), abgewiesene Zugriffe protokollieren (`DEVELOPMENT.md`, Einschränkung 6), Leserecht der Auditlogs dokumentiert (`owner`), Berechtigungsänderungen im Audit.                                           | Claude                       | Dez 2026 |
| G7  | **OPS-003 Backup und Restore-Test**          | PITR aktiv, Backup-Lebenszyklus definiert (Aufbewahrung, Generationen, Ort), Restore-Test in isolierter Umgebung **inklusive Nachziehen der Löschungen** (ADR-008, LOE-002), Notfallzugang verwahrt, Betriebsdokumentation mit den dreizehn Positionen aus ADR-012. | Jannes und Claude            | Jan 2027 |
| G8  | **OPS-004 Logging, Redaction, Monitoring**   | Verbotsliste aus ADR-011 automatisiert geprüft, Entscheidung zu externem Error-Tracking (ADR-002 Folgefrage), Alarmierung, Security-Log mit 12 Monaten, Erkennung für den Breach-Prozess (Art. 33).                                                | Claude                       | Jan 2027 |
| G9  | **PAT-006 Datenschutzinformation und Einwilligungen** | „Datenschutzinformation ausgehändigt am" in der Akte, Hinweis auf Behandlungsvertrag, minimale Einwilligungsstruktur je Zweck mit Widerruf — die Grundlage für Kartendienst, Foto/Video und Portal. Rechtsgrundlagen je Verarbeitung als Annahme, bis die DSFA sie bestätigt. | Claude                       | Jan 2027 |
| G10 | **OPS-006 Betroffenenrechte**                | Auskunft und Kopie (Art. 15), Export (Art. 20), begründete Ablehnung eines Löschverlangens bei Aufbewahrungspflicht (ADR-008) — als `owner`-Funktion, auditiert.                                                                                   | Claude                       | Jan 2027 |
| G11 | **E2 Ausfallkonzept und Degraded-Verfahren** | Tagesplan mit Adressen und Telefonnummern druck- und exportierbar als Minimalfunktion; Praxisprozess für einen Tag ohne Anwendung (ADR-012).                                                                                                       | Claude (Funktion), Jannes (Prozess) | Jan 2027 |
| G12 | **DSFA-Paket**                               | Schwellwertprüfung und DSB-Entscheidung (B2), Verzeichnis der Verarbeitungstätigkeiten, TOM, Löschkonzept (aus LOE), Subprozessorenübersicht (aus G3), Datenschutzinformationen (G9), Verfahren für Betroffenenrechte (G10), Data-Breach-Prozess; Nachweistabelle MUSS-Anforderung → Test/Policy/Prüfschritt; Zweckbestimmung als Dokument (ADR-006). Claude liefert Entwürfe, die externe Prüfung entscheidet. | Jannes, externe Prüfung      | Feb 2027 |
| G13 | **B1 Regulatorische Prüfung**                | Externe Bestätigung der Zweckbestimmung und MDR-Abgrenzung (ADR-006), Einordnung nach EU AI Act.                                                                                                                                                   | Jannes, extern               | Feb 2027 |
| G14 | **UI-001 Feindesign, Politur, Barrierefreiheit** | Einheitliches Design über die zentralen Design-Tokens (`src/index.css`), Barrierefreiheit in der Abnahme-Checkliste (`IDEA-QSN-006`), PWA-Manifest ohne Service Worker (§2.2, ADR-015). **Nicht:** Branding je Praxis (`IDEA-QSN-009`, setzt §1-Änderung voraus). | Claude                       | Feb 2027 |
| G15 | **Go-live-Abnahme**                          | Sieben Vorbedingungen aus ADR-007 vollständig · Restore-Test bestanden · alle Annahmen der Kategorien Datenschutz und Recht bestätigt oder geändert (`ASSUMPTIONS.md`) · Branch Protection und Secret Scanning aktiv (`DEVELOPMENT.md`, manuelle Schritte) · CI grün · Abnahmeschritte aus `docs/abnahme/` durchlaufen. | Jannes                       | Mär 2027 |

Der Generator für synthetische Daten (E6) ist bewusst nicht dabei: der Seed
ist der Generator. Reicht er für eine Vorführung oder für Regeltests nicht,
wird er erweitert — im Loop, der ihn braucht.

**Kleine Wartung** (ohne eigenen Loop, bei Gelegenheit): `supabase/config.toml`
Abschnitt `[inbucket]` nach `[local_smtp]` umbenennen — die CLI 2.116 warnt,
läuft aber; lokal mit `supabase stop` und `start` prüfen, in der Cloudumgebung
geht das nicht.

---

## Spur B — Entscheiden

Offene Punkte aus `docs/decisions/OPEN_DECISIONS.md` mit Fälligkeit, rückwärts
vom Zieltermin. **Ein Loop kann keine davon ersetzen**, er kann sie nach §15.1
überbrücken; die Entscheidung bleibt bei Jannes und der externen Prüfung.

| Punkt                                  | Was zu entscheiden ist                                                                                        | Wer                                | Fällig vor                | Termin       |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------- | ------------ |
| **E8 → ADR-017**                       | Dateiablage: Ort, Zugriff, signierte Verweise, Retention, Virenprüfung                                        | Claude schreibt, Jannes bestätigt  | DAT-EPIC-001, ERS-001, Etappe 6 | Sep 2026 |
| **D „bestätigt" → ADR-018**            | Terminzustände im Detail; Umfang (vollständiger Automat) am 2026-09-05 entschieden                            | Claude im CAL-EPIC-003             | CAL-008                   | Okt 2026     |
| **B4**                                 | Steuerliche Validierung: Leistungsarten, Umsatzsteuer, Belegfristen (bis dahin Annahme in ABR-001)            | Steuerberatung                     | Produktivstart; Termin wegen ABR früh | Nov 2026 |
| **Providerprüfung Supabase**           | Prüfkatalog ADR-002 dokumentiert und bestanden — sonst Alternative                                            | Jannes mit Claude-Dokument         | OPS-001                   | Nov 2026     |
| **E10**                                | Wer darf Mitarbeiterdaten schreiben: nur `owner`, auch Office, auch Teamleitung? (bis dahin Annahme `owner`)  | Jannes                             | STAFF-EPIC-002            | Okt 2026     |
| **B2**                                 | DSFA-Schwellwertprüfung und Entscheidung über einen Datenschutzbeauftragten; danach DSFA                       | externe Datenschutzberatung        | Go-live                   | Anfrage Sep, Ergebnis Dez 2026, DSFA Feb 2027 |
| **B1**                                 | Externe Prüfung der Zweckbestimmung und MDR-Abgrenzung, EU AI Act                                             | externe Prüfstelle                 | Go-live                   | Anfrage Sep, Ergebnis Feb 2027 |
| **B3**                                 | Validierung der internen Fristen (ANN-001), Belegarten                                                        | im DSFA-Prozess                    | Go-live                   | Feb 2027     |
| **E2**                                 | Ausfallkonzept als Praxisprozess                                                                              | Jannes mit Claude                  | Go-live                   | Jan 2027     |
| **B6**                                 | Beschäftigtendaten: aggregierte Auswertungen ja oder nein (§20)                                               | Jannes, ggf. Beratung              | ZK-001, TOUR-001          | Stufe 2      |
| **B7**                                 | Kartendienst: Adressen oder nur Koordinaten, Anbieter, AVV/§203                                               | Jannes und Prüfung nach ADR-002    | TOUR-001                  | Stufe 2      |
| **B8**                                 | Lizenzstatus DIGOTOR-Bogen und weiterer Instrumente                                                           | Jannes, Lizenzgeber                | FRB-003                   | Stufe 2      |
| **B5**                                 | Patientenidentität, Vertretung, Zugang für Hochbetagte, §630g                                                 | Jannes, ggf. Beratung              | Etappe 4                  | Stufe 2      |
| **B9**                                 | Betreuung nach Therapieende: Vertrag, Steuer, Aufbewahrung, Zweckbindung, Berufsrecht                          | Steuerberatung und Datenschutz     | Etappe 8                  | Beratung 2027 anstoßen |
| **B11**                                | Paketpreise, Guthaben, Verfall, Rabatte                                                                       | Jannes und Steuerberatung          | Etappe 8                  | mit B9       |
| **B10**                                | Automatisierte Progression: MDR-Grenze                                                                        | externe regulatorische Prüfung     | Etappe 9                  | mit B1 anfragen |
| **C6**                                 | KI: Schutzumfang (Pseudonymisierung gegenüber Vertrag) und Provider                                           | Jannes und Prüfung nach ADR-002/005 | Etappe 10                | Stufe 2      |

Erledigt: A1 bis A4, B1 bis B4 architektonisch, C1 bis C5, C8, D
„finalisiert"/„nachvollziehbar", E1, E3 bis E5, E7, E9, E11 (mit STAFF-002).
Die planungsrelevanten Folgefragen der ADRs stehen in `OPEN_DECISIONS.md`,
Abschnitt F, jeweils mit dem Paket, das sie beantwortet.

---

## Credit-Budget

Jeder Loop ist eine Session und kostet. Diese Regeln halten die Kosten
niedrig, ohne die Qualität zu senken.

**Sitzungszuschnitt**

1. **Ein Loop = eine Session = ein Epic aus mehreren Stories.** Je Story ein
   Commit und die eng betroffenen Checks, kein Zwischenstopp. Danach Session
   beenden, nicht weiterplaudern.
2. **Stories so schneiden, dass jeder Diff am Stück lesbar bleibt.** Die
   vollständige Testsuite läuft einmal am Ende des Epics.
3. **Neues Thema = neue Session.** Rückfragen zum laufenden Loop in derselben.

**Leseverhalten**

4. **Diese Roadmap zuerst lesen**, dann den Abschnitt „Nächster Loop".
5. **Höchstens zwei ADRs vollständig** je Loop, nach dem Index in `CLAUDE.md`.
6. **Höchstens eine Ideenspeicher-Datei** je Loop, nach dem Index in
   `IDEENSPEICHER.md`.
7. **Keine Subagenten** außer bei echt breiter Suche über viele Dateien.

**Verifikation**

8. Während der Entwicklung nur die eng betroffenen Checks; die vollständige
   Runde **einmal** am Ende (Skill-Schritt H).
9. Keine identischen teuren Läufe ohne Änderung dazwischen.
10. `pnpm test:db` läuft auch in der Cloudumgebung und ist bei Migrationen und
    Policies das wichtigste Gate — nicht überspringen. Der SessionStart-Hook
    installiert die Abhängigkeiten vorab.

**Rhythmus**

11. **Ein Loop pro Woche** ist das Maß für den Zieltermin; zwei sind machbar,
    wenn die Schnitte klein sind.
12. Die wöchentliche Planungssession ist **absichtlich klein**: sie liest
    diese Datei und das Git-Log, sonst nichts.

**Faustregel:** Wenn eine Session anfängt, das Projekt zu erkunden statt zu
arbeiten, fehlt ein Eintrag in dieser Roadmap. Dann diesen ergänzen — das ist
billiger als die Erkundung zu wiederholen.

### Modell und Aufwand je Aufgabe

Modell und Aufwandsstufe werden **zu Sitzungsbeginn** gewählt und danach nicht
mehr gewechselt: der Prompt-Cache ist modellgebunden, ein Wechsel mitten im
Loop wirft ihn weg.

| Aufgabe                                                     | Modell    | Aufwand  |
| ----------------------------------------------------------- | --------- | -------- |
| Migration, RLS-Policy, RPC, Berechtigungen                  | Opus 5    | `xhigh`  |
| Architekturentscheidung, ADR, Sicherheitsreview eines Diffs | Opus 5    | `xhigh`  |
| Löschung und Retention (LOE-EPIC-001)                       | Opus 5    | `max`    |
| Fachlogik ohne bestehendes Muster                           | Opus 5    | `high`   |
| UI-Seite nach dem Muster vorhandener Seiten                 | Sonnet 5  | `medium` |
| Tests zu bereits geschriebenem Code ergänzen                | Sonnet 5  | `medium` |
| Formulierung, Doku, Roadmap nachstellen, Commit-Nachricht   | Sonnet 5  | `low`    |
| Wöchentliche Planungssession                                | Haiku 4.5 | —        |

- **`max` für Löschung und Retention:** eine falsch gebaute Löschung ist der
  einzige Fehler, der sich nicht reparieren lässt.
- **`xhigh` für alles Datenbanknahe:** Migrationen und Policies sind schwer
  rückgängig zu machen.
- **Haiku für das Wochenupdate:** zwei Dateien lesen, zehn Zeilen schreiben.
- **Fast Mode (`/fast`) verdoppelt den Preis je Token** — nicht für Loops, die
  im Hintergrund laufen.

---

## Wochenupdate

Auftrag für die wöchentliche Planungssession. Sie **baut nichts.**

1. `git log --oneline -20` und diese Datei lesen. Sonst nichts.
2. Feststellen, welche Loops seit dem letzten Update abgehakt wurden
   (Fortschrittstabelle gegen das Git-Log).
3. Den Abschnitt „Nächster Loop" wiedergeben und prüfen, ob seine
   Voraussetzung aus Spur B vorliegt; sonst den Ersatz nennen.
4. Prüfen, ob ein Termin aus Spur B oder aus dem Rückwärtsplan fällig oder
   überschritten ist, und ihn benennen — mit dem Hinweis, dass ein Loop ihn
   nicht ersetzen kann.
5. Antwort in höchstens zehn Zeilen: _diese Woche ansteht · das braucht
   Jannes zu entscheiden · das hängt · Termin-Check gegen den 31.03.2027_.

Kein Codelesen, keine Analyse, keine Vorschläge über den nächsten Loop hinaus.
Die eingerichtete Routine (montags 07:50 Uhr) ist in `docs/DEVELOPMENT.md`
beschrieben.

---

## Fortschritt

Abgehakt wird hier, mit Datum und Commit. Ein Loop gilt als fertig, wenn
Skill-Schritt I durchlaufen ist.

| Loop                | Status | Datum          | Commit                     |
| ------------------- | ------ | -------------- | -------------------------- |
| PAT-001 bis PAT-004 | fertig | vor 2026-09-01 | PAT-004: Merge PR #1       |
| CAL-001 bis CAL-006 | fertig | vor 2026-09-01 | —                          |
| STAFF-001           | fertig | 2026-08-30     | `e70775a`, `ca907e9`       |
| DOK-001             | fertig | 2026-09-01     | `7e18906`, Merge PR #5     |
| DOK-002             | fertig | 2026-09-02     | `491a0c0`, Merge PR #5     |
| DOK-003             | fertig | 2026-09-05     | `21d85dd`, `f565124`       |
| DOK-004             | fertig | 2026-09-05     | `e931068`, `960f34f`       |
| Planungsreview und Roadmap 2.0 | fertig | 2026-09-05 | Branch `claude/project-structure-review-5ule84` |

Zuletzt aktualisiert: 2026-09-05
