# ADR-008: Aufbewahrung und Löschung personenbezogener Daten

## Status

Angenommen — **Fassung 7** (2026-10-26): Register der Querschnittsfunktionen (Punkt 13).
Fassung 6 (2026-10-18): Datenklasse „Ernährungsberatung“
(ADR-027), 3 Jahre nach dem Ende des Profils. Fassung 5 (2026-10-17): Die rollierende Löschung des
Teamchats (Punkt 12 neu). Fassung 4 (2026-10-17): Rückmeldungen von Beschäftigten
(§20.2) als eigene Datenklasse im Retention Schedule. Fassung 3 (2026-10-14): Der Fristanker der klinischen
Akte (Punkt 11 neu, Befund B1). Fassung 2 (2026-10-03): Die Fristen des
Auditlogs, des Löschjournals und der Löschaufträge im Retention Schedule
(LOG-EPIC-001). Alles Übrige gilt unverändert.

## Datum

2026-08-28 · Fassung 2: 2026-10-03 · Fassung 3: 2026-10-14 · Fassung 4: 2026-10-17 · Fassung 5: 2026-10-17 ·
Fassung 7: 2026-10-26

## Kontext

`PROJECT_PRINCIPLES.md` regelt in §5 die Nachvollziehbarkeit klinischer
Dokumentation und verbietet in §13, Dokumentation zu verlieren oder zu
überschreiben. Eine Aussage zur Löschung enthält die Baseline nicht.

Damit fehlte bislang die Gegenrichtung: Ohne definierte Speicherdauer gibt es
keine rechtmäßige Aufbewahrung, kein belastbares Löschkonzept und keine
Grundlage für die Nachweise, die ADR-007 vor Produktivstart verlangt.

Die Anforderungen sind gegenläufig. §630f BGB verlangt die Aufbewahrung der
Patientenakte, das Steuerrecht die Aufbewahrung von Rechnungen und
Buchungsbelegen, Art. 17 DSGVO gewährt ein Löschrecht, und Art. 5 Abs. 1
lit. e DSGVO verlangt Speicherbegrenzung. Diese Konflikte lassen sich nicht
pro Feature entscheiden, sondern nur über eine Zuordnung von Datenklassen zu
Fristen.

Hinzu kommt ein technischer Punkt, der leicht übersehen wird: Backups
enthalten gelöschte Daten weiter. Ohne Regel für Wiederherstellungen kehren
gelöschte Daten unbemerkt in den produktiven Bestand zurück.

Diese Entscheidung war als Punkt B3 in `docs/decisions/OPEN_DECISIONS.md`
offen. ADR-007 setzt ihr eine Frist: Das Lösch- und Aufbewahrungskonzept
gehört zu den Vorbedingungen des Produktivstarts.

## Entscheidung

1. Personenbezogene Daten werden **Datenklassen** zugeordnet und entsprechend
   eines **dokumentierten Retention Schedules** verarbeitet.
2. **Gesetzliche Aufbewahrungspflichten haben Vorrang vor regulärer
   Löschung.**
3. Nach Ablauf des jeweiligen Zwecks und aller Aufbewahrungsgründe **MUSS eine
   echte Löschung erfolgen**.
4. **Klinische Behandlungsunterlagen** werden grundsätzlich **zehn Jahre nach
   Abschluss der Behandlung** aufbewahrt.
5. **Steuerlich relevante Rechnungen und Buchungsbelege** folgen der jeweils
   geltenden steuerrechtlichen Aufbewahrungsfrist.
6. **Operative Daten** wie Routinginformationen, kurzfristige KI-Entwürfe und
   Terminanfragen erhalten **deutlich kürzere Speicherfristen**.
7. Ein dokumentierter **Legal-Hold-Mechanismus** verhindert automatische
   Löschung während laufender rechtlicher oder regulatorischer Vorgänge.
8. **Backups** dürfen gelöschte Daten bis zum Ende des definierten
   Backup-Lebenszyklus enthalten; solche Daten **dürfen nicht regulär
   zugänglich sein**. Nach einer Wiederherstellung **MÜSSEN seit
   Backup-Erstellung wirksam gewordene Löschungen erneut angewendet werden**.
9. **Accounts und Authentifizierungsdaten** werden **getrennt von
   aufbewahrungspflichtigen fachlichen Datensätzen** behandelt.
10. **Kein dauerhaftes Soft-Delete ersetzt die gesetzlich beziehungsweise
    datenschutzrechtlich erforderliche endgültige Löschung.**
11. *(Fassung 3)* **Der „Abschluss der Behandlung" aus Punkt 4 ist der
    späteste Tag aus letzter Behandlung, letzter Leistung und ausdrücklichem
    Abschluss.** Als Behandlung zählt ein Behandlungstermin, der abgehakt,
    dokumentiert, abgerechnet oder als nicht angetroffen vermerkt ist; als
    Leistung eine erfasste abrechenbare Leistung. Der ausdrückliche Abschluss
    der Versorgung bleibt möglich und zählt, wenn er später liegt. Steht ein
    Behandlungstermin bevor, läuft keine Frist; ohne jede Behandlung auch
    nicht. Rechnungen sind kein Teil des Ankers: Sie halten über ihre eigene
    Frist (Punkt 5). Der Projektinhaber hat festgelegt, dass die Frist ein
    Datum auch ohne ausdrücklichen Abschluss braucht (B1); Umsetzung ANN-511.
12. *(Fassung 5)* **Der Teamchat wird je Nachricht gelöscht**, zwölf Monate
    ab ihrem Tag, endgültig und mit Eintrag im Löschjournal. Eine neue
    Antwort verlängert keine ältere Nachricht. Hängen an einer fälligen
    Ausgangsnachricht noch laufende Antworten, fallen Text, Verfasser:in und
    Erwähnungen; die Zeile bleibt ohne Inhalt als Anker des Threads, bis die
    letzte Antwort fällt. Ein solcher Anker ist kein Soft-Delete (Punkt 10),
    weil nichts Personenbezogenes mehr darin steht. Was dauerhaft gelten
    soll, gehört in den Fachprozess (§10); Umsetzung ANN-610.
13. *(Fassung 7)* **Jede Tabelle steht im Register der Querschnittsfunktionen**
    (`public.data_registry`) mit ihrem Personenbezug und den Entscheidungen zu
    Auskunft, Löschjournal und Zusammenführen; die Aufbewahrung zeigt per
    Fremdschlüssel darauf. Eine Ausnahme trägt ihre Begründung. Ein Test wird
    rot, wenn eine Tabelle fehlt oder eine Entscheidung unbegründet ist
    (Umsetzung ANN-751). Eine Tabelle mit eigenem Journal schreibt es bei
    jeder gelöschten Zeile selbst, gleich auf welchem Weg sie fällt; so trägt
    Punkt 8 auch Löschwege, die erst später entstehen (Umsetzung ANN-752).

### Initialer Retention Schedule

| Datenklasse | Frist | Charakter |
|---|---|---|
| Klinische Patientenakte | 10 Jahre nach Behandlungsabschluss | gesetzlich geprägt |
| Klinisch relevante Anamnese, PROMs, Therapiepläne, Kommunikation | wie Patientenakte | gesetzlich geprägt |
| Ausgestellte Rechnungen und Buchungsbelege | gesetzliche steuerliche Aufbewahrungsfrist, aktuell grundsätzlich 8 Jahre | gesetzlich |
| Durchgeführte Behandlungstermine | entsprechend klinischem beziehungsweise abrechnungsbezogenem Nachweis | gesetzlich geprägt |
| Abgesagte Termine und No-shows ohne Rechnung | 3 Jahre ab Ende des Kalenderjahres | interne Initialentscheidung |
| Organisatorische Patientenkommunikation | 3 Jahre ab Ende des relevanten Kalenderjahres nach Abschluss des Vorgangs | interne Initialentscheidung |
| Terminanfragen ohne Behandlungsverhältnis | 12 Monate nach letztem Kontakt | interne Initialentscheidung |
| Routing-Rohdaten | maximal 30 Tage | interne Initialentscheidung |
| Nicht angenommene KI-Entwürfe | maximal 7 Tage | interne Initialentscheidung |
| Angenommene KI-Inhalte | Retention des Zieldokuments | abgeleitet |
| AI-Gateway-Auditmetadaten | initial 3 Jahre, ohne vollständige Prompts und Outputs | interne Initialentscheidung |
| Auditlog: Lese- und Sicherheitsereignisse (Fassung 2) | 12 Monate | interne Entscheidung |
| Auditlog: übrige Einträge (Fassung 2) | 3 Jahre | interne Entscheidung |
| Normale Authentifizierungs- und Securitylogs | initial 12 Monate | interne Initialentscheidung |
| Löschjournal (Fassung 2) | 60 Tage ab der Löschung (Backups 30 Tage, ADR-012) | abgeleitet |
| Quittierte Löschaufträge der Ablage (Fassung 2) | 3 Jahre ab der Quittung; offene nie | interne Entscheidung |
| Interner Teamchat (Fassung 5: Punkt 12) | initial rollierend 12 Monate je Nachricht ab ihrem Tag; dauerhaft relevante Inhalte MÜSSEN in den dafür vorgesehenen Fachprozess übernommen werden | interne Initialentscheidung |
| Rückmeldungen von Beschäftigten (Fassung 4, §20.2) | 12 Monate ab Ende des Monats der Abgabe; endgültig gelöscht, kein Soft-Delete | interne Entscheidung |
| Ernährungsberatung (Fassung 6, ADR-027): Profil, Tagebuch, Gewicht, eigene Lebensmittel und Rezepte der Person | 3 Jahre nach dem Ende des Profils; fällt das Verhältnis früher, mit ihm | interne Initialentscheidung |

**Fristen ohne unmittelbare gesetzliche Vorgabe sind interne
Initialentscheidungen und müssen vor Produktivstart im
Datenschutz-/DSFA-Prozess validiert werden.**

Registriert als ANN-001 in `docs/decisions/ASSUMPTIONS.md`; dort stehen
Verankerung im Code und Änderungspfad.

## Konsequenzen

- Jede fachliche Entität wird einer Datenklasse zugeordnet. Diese Zuordnung
  ist Teil des Datenmodells und nicht eine nachgelagerte Betriebsaufgabe; ohne
  sie ist keine Frist anwendbar.
- Das Datenmodell benötigt die fachlichen Anker, auf die sich die Fristen
  beziehen — insbesondere einen definierten „Abschluss der Behandlung". Dieser
  Zeitpunkt ist bisher nirgends definiert und wird zur Voraussetzung für die
  gesamte klinische Retention. *(Seit LOE-001b definiert: der ausdrückliche,
  rücknehmbare Vorgang „Abschluss der Versorgung", `care_concluded_on`,
  ANN-032.)*
- Löschung ist ein aktiver, wiederkehrender Vorgang mit eigener Protokollierung
  und nicht die Abwesenheit eines Zugriffs. Sie muss selbst nachweisbar sein.
- Der Vorrang gesetzlicher Aufbewahrung bedeutet, dass ein Löschverlangen nach
  Art. 17 DSGVO die Patientenakte in der Regel nicht erfasst. Das Verfahren für
  Betroffenenrechte aus ADR-007 muss diese Ablehnung begründet ausgeben können.
- Legal Hold ist ein expliziter Zustand mit Beginn, Grund, verantwortlicher
  Person und Ende. Er setzt die automatische Löschung aus, nicht die
  Zugriffsregeln aus ADR-004.
- Die Backup-Regel hat eine unbequeme Folge: Jede Wiederherstellung ist ein
  zweistufiger Vorgang — Restore, dann Nachziehen aller zwischenzeitlich
  wirksamen Löschungen. Das setzt voraus, dass wirksame Löschungen als
  nachvollziehbare Liste vorliegen, die den Restore überlebt. Ein reiner
  „Datensatz ist weg"-Ansatz genügt dafür nicht.
- Die Trennung von Account und Fachdatensatz erlaubt, ein Benutzerkonto zu
  löschen oder zu sperren, während aufbewahrungspflichtige Dokumentation
  bestehen bleibt. Das greift unmittelbar in ADR-004 und in das
  Patientenportal: Der Patientenaccount ist nicht die Akte.
- Das Verbot des dauerhaften Soft-Delete schließt aus, Löschung durch ein
  Flag zu simulieren. Soft-Delete bleibt als Zwischenzustand zulässig, nicht
  als Endzustand.
- Die kurzen operativen Fristen sind eine Datenminimierungsmaßnahme mit
  Nebenwirkung: Routing-Rohdaten von mehr als 30 Tagen stehen für spätere
  Auswertungen nicht zur Verfügung. Das ist bewusst so und stützt zugleich die
  Grenze zur Beschäftigtenüberwachung.
- Der Retention Schedule ist ein gepflegtes Dokument. Eine neue Datenklasse
  ohne Fristzuordnung ist ein Mangel, nicht ein Sonderfall.

## Bewusst nicht Bestandteil dieser Entscheidung

- Die technische Umsetzung von Löschung, Anonymisierung und Legal Hold.
- Der Backup-Lebenszyklus selbst — Aufbewahrung, RPO und RTO (E3 — beantwortet
  mit ADR-012).
- Die abschließende steuerrechtliche Bewertung der Belegarten und Fristen.
- Die Rechtsgrundlagen je Verarbeitungsvorgang und ein Einwilligungsmodell;
  das bleibt bei ADR-007 offen.
- Ob und wie anonymisierte Daten nach Fristablauf für Auswertungen erhalten
  bleiben.
- Die Definition des „Abschlusses der Behandlung" als fachlicher Vorgang.
  *Beantwortet mit Punkt 11 (Fassung 3).*
- Änderungen an der Versionierung klinischer Dokumentation nach §5.

## Offene Folgefragen

- ~~Wie wird „Abschluss der Behandlung" fachlich definiert und im System
  gesetzt — manuell, durch Zeitablauf, oder beides?~~ *Beantwortet mit
  Punkt 11 (Fassung 3): beides — aus der letzten Behandlung, ein
  ausdrücklicher Abschluss zählt, wenn er später liegt.*
- Wie werden wirksame Löschungen so protokolliert, dass sie nach einem Restore
  erneut angewendet werden können, ohne selbst zum Personendatenbestand zu
  werden?
- Wer darf einen Legal Hold setzen und aufheben, und wie wird das protokolliert?
- Wie wird eine Löschung nachgewiesen, wenn der gelöschte Datensatz
  definitionsgemäß nicht mehr existiert?
- Wie verhalten sich Auditlogs zur Löschung der Daten, auf die sie sich
  beziehen — insbesondere bei einer Aufbewahrung von 3 Jahren gegenüber 10
  Jahren Patientenakte?
- Wie wird der interne Teamchat rollierend gelöscht, ohne dass fachlich
  relevante Inhalte verloren gehen (§10, §13)? *Beantwortet mit Punkt 12
  (Fassung 5): je Nachricht; was bleiben soll, gehört in den Fachprozess.*
- Welche Fristen ändern sich nach der Validierung im DSFA-Prozess, und wie
  wird diese Änderung nachgezogen?
- Wie werden Dateien und Anhänge behandelt, die in mehreren Kontexten
  referenziert sind? *Beantwortet mit ADR-017 Punkt 10 (eine Datei, ein
  Bezugsdatensatz; Frist vom Bezugsdatensatz geerbt).*

## Änderungshistorie

| Fassung | Datum | Änderung |
|---|---|---|
| 1 | 2026-08-28 | Angenommen. |
| 2 | 2026-10-03 | Retention Schedule (LOG-EPIC-001): Auditlog in zwei Fristen (12 Monate Lesen und Sicherheit, 3 Jahre übrige), Löschjournal 60 Tage, quittierte Löschaufträge 3 Jahre; ein Legal Hold hält jeden Auditeintrag seiner Akte ([ADR-010](ADR-010-audit-and-privileged-access.md) Fassung 3). Übrige Punkte unverändert. |
| 3 | 2026-10-14 | Punkt 11 neu (B1): Fristanker der klinischen Akte aus letzter Behandlung, letzter Leistung und ausdrücklichem Abschluss; keine Frist, solange ein Behandlungstermin bevorsteht. Beantwortet die Folgefrage zum „Abschluss der Behandlung". Übrige Punkte unverändert. |
| 4 | 2026-10-17 | Datenklasse „Rückmeldungen von Beschäftigten“ (ORG-006, §20.2, ANN-607): 12 Monate ab Ende des Monats der Abgabe. Übrige Punkte unverändert. |
| 5 | 2026-10-17 | Punkt 12 neu (TEAM-001, ANN-610): rollierende Löschung des Teamchats je Nachricht; Anker ohne Inhalt im Thread; beantwortet die Folgefrage dazu. Übrige Punkte unverändert. |
| 6 | 2026-10-18 | Datenklasse „Ernährungsberatung“ (ADR-027): 3 Jahre nach dem Ende des Profils, Anker am Profil, unabhängig von der Frist des Verhältnisses. Übrige Punkte unverändert. |
| 7 | 2026-10-26 | Punkt 13 neu (Aufräumen Schritt 4, Jannes 2026-10-26): Register der Querschnittsfunktionen mit Vollständigkeitstest; Löschjournal je gelöschter Zeile über einen Auslöser (Fehler 2 der Tiefenanalyse). Übrige Punkte unverändert. |
