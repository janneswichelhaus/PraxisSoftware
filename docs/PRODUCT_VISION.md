# Produktbeschreibung

> **Nicht normativ** (Rang 5, `PROJECT_PRINCIPLES.md` §21): wie das Produkt im Alltag aussieht und
> für wen, damit jede Aufgabe verstanden wird, bevor sie gebaut wird; kein Scope, keine
> Spezifikation. Verbindlich sind Prinzipien, ADRs und die Spezifikation des Loops, die Reihenfolge
> steht in `development/ROADMAP.md`. Stand: Produktgespräch mit Jannes vom 2026-09-23.

## 1. Die Praxis

**Own Motion** — „Physiotherapie per Lastenrad“, Tübingen; Eröffnung im **Juli 2027**, ohne
Vorgängersystem und Bestandsdaten (Marke: [`../marke/README.md`](../marke/README.md)). **Keine
Behandlungsräume:** Jede Behandlung ist ein Hausbesuch, jeder Weg wird geradelt, Start und Ende ist
der Stellplatz der Räder; jede:r Therapeut:in hat ein eigenes Rad. **Privat abgerechnet** gegen
Verordnung (Privatrezept) oder als Selbstzahler, keine GKV (§19,
[ADR-020](adr/ADR-020-treatment-basis.md)). **Zwei Leistungsbereiche**, Heilbehandlung und Personal
Training, rechtlich getrennt, auch bei derselben Person (§1.2). **Später ein Standort**, vorbereitet
ist nur `location_id` ([ADR-003](adr/ADR-003-organization-location-model.md)). Eine Team-App aus
Köln ist Vorlage für Umfang und Ablauf des Praxisbetriebs, nicht für Datenmodell, Rechte oder
Sicherheit.

## 2. Wer damit arbeitet

- **Zur Eröffnung** Jannes als Owner, Therapeut, Trainer und Büro: alles für eine Person am Handy.
- **Bald danach** eine Bürokraft (Office): Termine, Rechnungen, Anrufe, Aufgaben; liest klinisch (§4.3).
- **Mit Wachstum** weitere Therapeut:innen, später im Training: anlegen, Rolle wählen, fertig (§4).
- **Laufend** Patient:innen und Trainingskund:innen, je mit eigenem Konto auf der Plattform (§4.6).

Jannes' Ziel: bald nur **zwei bis drei Behandlungen am Tag**; Organisation und Überblick sind Kern.

## 3. Ein Behandlungstag

1. **Am Rad** in der Halterung: erster Weg, der nächste, was zu beachten ist, ob die **Liege** mit muss.
2. **Unterwegs.** „Navigation starten“ öffnet die Navigations-App; die Praxis erfährt die Position
   nicht (§20). **Vor der Tür** ist die bisherige Dokumentation einen Tipp entfernt.
3. **Bei der Person.** Skalen und Bausteine zum Antippen, dann die Dokumentation **per Sprache**:
   Die KI strukturiert, der Mensch prüft und übernimmt; ohne Sprache derselbe Weg über Antippen und
   Text (§5, §6.3). Fotos nur über die Kamera der Anwendung.
4. **Termin abschließen:** durchgeführt, nicht angetroffen (nach Protokoll) oder „Tür geöffnet,
   keine Behandlung“ (§8). Am Ende kommt das Rad zurück an den Stellplatz.

**Die Erstaufnahme** ist zur Eröffnung der häufigste Termin (Befund, Scores, Fotos von Verordnung
und Anmeldebogen oder der Befundbogen vorab über die Plattform); was fehlt, bleibt sichtbar offen.
Hervorgehoben wird, was die Person angegeben hat; eine Diagnose, einen Risikoscore oder eine
Empfehlung erzeugt die Software nie (§7.1, §17).

## 4. Plattform für Patient:innen und Kund:innen

- **Während der Behandlung** (kostenlos): Befundbogen vorab, Termine und Terminwünsche,
  Heimübungsplan, Check-ins, Rechnungen und Dokumente, Einwilligungen.
- **Danach** (**Nachsorge-Abo**, monatlich kündbar): Heimprogramm, Fortschritt, Gewohnheiten,
  Rückfragen mit Foto oder Video und fester Antwortfrist.
- **Training** (im Paketpreis): Einheiten, Check-ins, Fortschritt, Pläne, Assessments,
  Gewohnheiten, Ernährungstagebuch als Zusatzleistung (ADR-027), Rückfragen.
- Ein Terminwunsch ist ein Wunsch, den Termin macht das Büro; nach einer Kündigung 30 Tage lesend;
  ein Konto ist keine Akte, ohne Konto gibt es Pläne als PDF. Ansichten: DSN-001
  (`git show 9452575:docs/development/PLATTFORM-ANSICHTEN.md`); Vorbild fürs Training:
  `git show 9452575:docs/product/ideen/referenz-navigation.md`.

## 5. Geschäftsmodell

```
Heilbehandlung  ──►  Nachsorge-Abo  ──►  Personal Training
(Verordnung oder     (nach dem Ende      (Paket nach Zeitraum,
 Selbstzahler)        der Behandlung)     nicht pausierbar)
```

Anfangs ist das Geschäft praktisch nur Heilbehandlung. Der Übergang geschieht im Abschlussgespräch;
den Trainingsvertrag schließt die Person im eigenen Konto, mit Widerrufsbelehrung und eigener
Einwilligung, aus der Akte wandert nur, was sie freigibt. Eine Rechnung je Leistungsbereich
(ADR-009); die Steuer auf Abo und Paket klärt die Steuerberatung (B4).

## 6. KI-Assistenz

KI hilft beim Formulieren, Strukturieren und Zusammenfassen (Sprachdokumentation, Antwortentwürfe,
Vorschläge aus dem Verordnungsfoto) und entscheidet nichts: Jedes Ergebnis ist ein Entwurf, bis ein
Mensch es übernimmt; alles läuft über ein zentrales Gateway (ADR-005). Der Anbieter ist **nicht
entschieden** (Arbeitshypothese: Claude über AWS Bedrock in der EU, geprüft nach ADR-002).

## 6a. Bedienung: sechs Arbeitsbereiche

**Übersicht** (Was muss ich als Nächstes tun?), **Kalender** (Wer behandelt wen, wann, mit welchen
Wegen?), **Patient:innen** (Was gehört zur Versorgung?), **Kommunikation** (Mit wem ist etwas zu
klären?), **Organisatorisches** (Welche Voraussetzungen und Anträge?), **Abrechnung** (Was ist
abzurechnen oder zu bezahlen?); dazu **Training**. Abgebildet in `src/app/navigation.tsx`, Stand in
[`development/ARBEITSBEREICHE.md`](development/ARBEITSBEREICHE.md). Regeln: Handy zuerst, ruhig, in
der Sprache der Praxis (§2.2); ein Vorgang, mehrere Sichten, keine zweite Terminliste, Akte oder
Mitarbeiterliste; der Arbeitsgegenstand trägt seine Werkzeuge; ein Verweis erweitert keine
Berechtigung (§4.7).

## 7. Organisation und Praxisbetrieb

Warteliste und Terminsuche, Anrufliste, Aufgaben, Kennzahlen, Export für die Steuerberatung;
Radflotte mit Schlüssel, Check-Up und Pannen; Teamkommunikation getrennt von der mit Patient:innen;
Urlaub, Zeitkonto, Erstattungen — ohne Ortung und ohne Leistungskontrolle von Beschäftigten (§20).

## 8. Grenzen

Das Produkt ist **keine** Software, die diagnostiziert, Übungen aus Befunden ableitet, Verläufe
bewertet oder Trainingsfreigaben erteilt (§17). Nicht vorgesehen sind GKV-Abrechnung, eine native
App, Wearables und ein Angebot für andere Praxen (§14, `development/ROADMAP.md`, „Nicht in V1“).
