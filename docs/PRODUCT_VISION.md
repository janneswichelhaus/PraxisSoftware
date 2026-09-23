# Produktbeschreibung

> **Nicht normativ** (Rang 5, `PROJECT_PRINCIPLES.md` §21). Dieses Dokument beschreibt, was das
> Produkt im Alltag ist und für wen — damit jede Aufgabe verstanden wird, bevor sie gebaut wird. Es
> begründet keinen Scope und ersetzt keine Spezifikation. Verbindlich sind `PROJECT_PRINCIPLES.md`,
> die ADRs in `docs/adr/` und die Spezifikation des jeweiligen Loops; die Reihenfolge steht in
> `development/ROADMAP.md`. Stand: Produktgespräch mit Jannes vom 2026-09-23.

## 1. Die Praxis

**Own Motion** — „Physiotherapie per Lastenrad", Tübingen. Marke und Farben:
[`../marke/README.md`](../marke/README.md). Eröffnung im **Juli 2027**, ohne Vorgängersystem und
ohne Bestandsdaten: Die Software begleitet die Praxis vom ersten Tag an.

### 1.1 Zielbetrieb

- **Keine Behandlungsräume.** Jede Behandlung ist ein Hausbesuch, jeder Weg wird mit dem Rad
  gefahren. Start und Ende eines Tages ist der Stellplatz der Räder, keine Praxisadresse.
- **Jede:r Therapeut:in hat ein eigenes Rad.** Es gibt so viele Räder wie Therapeut:innen; ein
  gesperrtes Rad ist eine echte Einschränkung des Tages.
- **Privat abgerechnet.** Gegen Verordnung (Privatrezept) oder als Selbstzahler; keine GKV
  (`PROJECT_PRINCIPLES.md` §19, [ADR-020](adr/ADR-020-treatment-basis.md)).
- **Zwei Leistungsbereiche:** Heilbehandlung und Personal Training, rechtlich getrennt, auch wenn
  es dieselbe Person ist (§1.2).
- **Später ein Standort** — in etwa drei Jahren denkbar: Büro, einige Trainingsgeräte, ein
  Kursraum. Vorbereitet ist dafür nur `location_id` ([ADR-003](adr/ADR-003-organization-location-model.md)).

Eine vorhandene Team-App aus dem Kölner Betrieb dient als Vorlage für Umfang und Ablauf des
Praxisbetriebs (Radflotte, Schlüssel, Check-Up, Pannen, Urlaub, Überstunden, Erstattungen) — nicht
für Datenmodell, Berechtigungen oder Sicherheit. Standortabhängige Inhalte daraus sind für Tübingen
nicht geprüft.

## 2. Wer damit arbeitet

| Wann          | Wer                                                                                             | Was das für die Software heißt                                                                      |
| ------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Zur Eröffnung | **Jannes** — Owner, Therapeut, Trainer und Büro in einer Person; vielleicht eine weitere Person | Alles muss für eine Person am Handy flüssig gehen; nichts setzt ein Team voraus                     |
| Bald danach   | **eine Bürokraft**, die nur im Büro arbeitet                                                    | Rolle Office: Termine, Rechnungen, Anrufe, Aufgaben; liest klinische Inhalte, schreibt keine (§4.3) |
| Mit Wachstum  | **weitere Therapeut:innen**, später auch in der Trainingsbetreuung                              | Der Owner legt ein Teammitglied an, wählt die Rolle — fertig (§4)                                   |
| Laufend       | **Patient:innen** und **Trainingskund:innen**                                                   | Eigenes Konto auf der Plattform, getrennt von Akte und Verhältnis (§4.6, §4.10)                     |

Jannes' Ziel: bald nur noch **zwei bis drei Behandlungen am Tag**, der Rest ist Organisation und
Weiterentwicklung. Organisation, Einstellungen und Überblick sind für den Owner deshalb
Kernfunktionen.

## 3. Ein Behandlungstag

1. **Am Rad.** Das Handy kommt in die Halterung. Die Oberfläche ist ruhig: der erste Weg, eine
   Vorschau auf den nächsten, was bei der Person zu beachten ist — und ob heute die
   **Behandlungsliege** mit muss, auch wenn erst der dritte Besuch sie braucht.
2. **Unterwegs.** „Navigation starten" öffnet die Navigations-App des Handys. Die Praxis erfährt die
   Position nicht (§20).
3. **Vor der Tür.** Ein Blick auf die bisherige Dokumentation, mit einem Tipp erreichbar.
4. **Bei der Person.** Den aktuellen Stand erfassen, ohne viel zu tippen: Skalen und Bausteine zum
   Antippen. Danach die Dokumentation **per Sprache**; die KI strukturiert, der Mensch prüft und
   übernimmt. Wer nicht sprechen kann, hat denselben Weg über Antippen und Text (§5, §6.3).
5. **Fotos**, wo sie helfen — für Kolleg:innen, die übernehmen, und zum Vergleich im Verlauf. Nur
   über die Kamera der Anwendung, nie über die Mediathek des Handys, und nur mit Einwilligung.
6. **Termin abschließen.** Durchgeführt, nicht angetroffen (nach Protokoll) oder „Tür geöffnet,
   keine Behandlung" — die Anwendung führt durch die Fälle (§8).
7. **Am Ende** kommt das Rad zurück an den Stellplatz.

**Die Erstaufnahme** ist bei der Eröffnung der häufigste Termin: Befund, Scores, dazu ein Foto der
Verordnung und des Anmeldebogens — oder der Befundbogen wurde vorab auf der Plattform ausgefüllt.
Was fehlt, bleibt sichtbar offen (in der Tagesansicht, im Kopf der Akte, in der Büroliste), bis es
erledigt ist. Die Felder der Verordnung schlägt die KI aus dem Foto vor; der Mensch bestätigt.

Der Anamnesebogen folgt dem DIGOTOR-Bogen Version 8 / 07-2026 als strukturiertes Formular;
Instrumente wie NRS, PSFS oder KOOS kommen aus einer Instrumentenbibliothek. Hervorgehoben wird,
was die Person angegeben hat — eine Diagnose, einen Risikoscore oder eine Empfehlung erzeugt die
Software nie (§7.1, §17).

## 4. Plattform für Patient:innen und Kund:innen

|            | Während der Behandlung                                                                                                       | Nach der Behandlung                                                                                                             | Training                                                                                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Preis**  | kostenlos, Teil der Heilbehandlung                                                                                           | **Nachsorge-Abo**, monatlich kündbar                                                                                            | im Paketpreis                                                                                                                                                     |
| **Inhalt** | Befundbogen vorab, Termine und Terminwünsche, Heimübungsplan mit Videos, Check-ins, Rechnungen und Dokumente, Einwilligungen | Heimprogramm bleibt aktiv und wird angepasst, Fortschritt, Gewohnheiten, Rückfragen mit Foto oder Video und fester Antwortfrist | Übersicht, Kalender, Einheiten, Check-ins, Fortschritt, Pläne, Aktivitäten, Assessments, Profil, Gewohnheiten, Ernährung als Protokoll, Rückfragen, Einstellungen |

- **Ein Terminwunsch ist ein Wunsch.** Einen Termin daraus macht das Büro.
- **Nach einer Kündigung** bleibt der Zugang 30 Tage lesend, der Plan ist als PDF mitzunehmen.
- **Ein Konto ist keine Akte.** Wer kein Konto will, wird trotzdem behandelt; Pläne gibt es dann als
  PDF.
- Die Ansicht der Trainingskund:innen hat ein Vorbild
  ([`product/ideen/referenz-navigation.md`](product/ideen/referenz-navigation.md)). Die Ansichten
  für Patient:innen und für die Betreuung sind **noch zu entwerfen** (DSN-001 in der Roadmap).

## 5. Geschäftsmodell

```
Heilbehandlung  ──►  Nachsorge-Abo  ──►  Personal Training
(Verordnung oder     (nach dem Ende      (Paket nach Zeitraum,
 Selbstzahler)        der Behandlung)     nicht pausierbar)
```

- **Anfangs ist das Geschäft praktisch nur Heilbehandlung.** Training buchen einzelne
  Patient:innen, die nach ihrer Verordnung weitermachen wollen.
- **Der Übergang** geschieht im Abschlussgespräch: Die Anwendung erinnert in den letzten Terminen
  daran, das Angebot ist mündlich, der Trainingsvertrag wird im eigenen Konto geschlossen — mit
  Widerrufsbelehrung und eigener Einwilligung. Aus der Akte wandert nur, was die Person freigibt.
- **Training** findet bei der Person, draußen oder per Video statt und steht in derselben
  Tagesroute. Zuerst betreut Jannes es allein, später auch andere Therapeut:innen.
- **Abgerechnet** wird alles im eigenen Rechnungswesen: je Termin bzw. Monat, eine Rechnung je
  Leistungsbereich (ADR-009). Die Steuer auf Abo und Paket klärt die Steuerberatung (B4).

## 6. KI-Assistenz

KI hilft beim Formulieren, Strukturieren und Zusammenfassen — Sprachdokumentation, Patientensprache,
Antwortentwürfe, Vorschläge aus dem Verordnungsfoto. Sie entscheidet nichts: Jedes Ergebnis ist ein
Entwurf, bis ein Mensch es übernimmt. Kein Fachmodul ruft einen KI-Anbieter direkt auf; alles läuft
über ein zentrales Gateway, das Berechtigung, Zweck und Datenminimierung prüft
([ADR-005](adr/ADR-005-provider-independent-ai.md)). Arbeitshypothese für den Anbieter, **nicht
entschieden**: Claude über AWS Bedrock in einer EU-Konfiguration; jeder Anbieter mit Zugang zu
Gesundheitsdaten wird vorher nach [ADR-002](adr/ADR-002-hosting-data-residency.md) geprüft.

## 6a. Bedienung: sechs Arbeitsbereiche

| Arbeitsbereich    | Leitfrage                                              |
| ----------------- | ------------------------------------------------------ |
| Übersicht         | Was muss ich als Nächstes tun?                         |
| Kalender          | Wer behandelt wen, wann und mit welchen Wegen?         |
| Patient:innen     | Was gehört zur Versorgung dieser Person?               |
| Kommunikation     | Mit wem muss ich etwas klären?                         |
| Organisatorisches | Welche Voraussetzungen und Anträge sind zu bearbeiten? |
| Abrechnung        | Welche Leistungen sind abzurechnen oder zu bezahlen?   |

Abgebildet in `src/app/navigation.tsx`; Stand der Bereiche in
[`development/ARBEITSBEREICHE.md`](development/ARBEITSBEREICHE.md). Wo die Trainingskund:innen in
dieser Aufteilung leben, klärt DSN-001.

Regeln der Bedienung:

- **Handy zuerst, ruhig, in der Sprache der Praxis.** Gezeigt wird, was der nächste Schritt braucht;
  Beschriftungen folgen einer Begriffsliste, nicht dem Datenmodell (§2.2).
- **Ein Vorgang, mehrere Sichten.** Übersicht und Kalender zeigen dieselben Besuche; es gibt keine
  zweite Terminliste, keinen zweiten Mitarbeiterstamm, keine zweite Akte.
- **Der Arbeitsgegenstand trägt seine Werkzeuge.** Suche, Filter und Aktionen stehen im Bereich.
- **Ein Verweis erweitert keine Berechtigung** (§4.7).

## 7. Organisation und Praxisbetrieb

- **Praxisverwaltung:** Warteliste und Terminsuche, Anrufliste, Aufgaben und Wiedervorlagen,
  Kennzahlen, Export für die Steuerberatung, Kartenzahlung beim Hausbesuch.
- **Praxisbetrieb:** Radflotte mit Schlüssel, Check-Up und Pannenablauf; Teamkommunikation in der
  Anwendung (getrennt von der Kommunikation mit Patient:innen); Urlaub, Zeitkonto, Erstattungen —
  ohne Ortung und ohne Leistungskontrolle von Beschäftigten (§20).

## 8. Grenzen

Das Produkt ist **keine** Software, die diagnostiziert, Übungen aus Befunden ableitet, Verläufe
bewertet oder Trainingsfreigaben erteilt (§17). Nicht vorgesehen sind GKV-Abrechnung, eine native
App, Wearables und ein Angebot der Software für andere Praxen (§14). Was davon an welcher Regel
scheitert: `development/ROADMAP.md`, „Nicht in V1".
