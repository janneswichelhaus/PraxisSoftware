# ADR-008: Aufbewahrung und Löschung personenbezogener Daten

## Status

Angenommen

## Datum

2026-08-28

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
| Patientenakten-Auditlogs | initial 3 Jahre | interne Initialentscheidung |
| Normale Authentifizierungs- und Securitylogs | initial 12 Monate | interne Initialentscheidung |
| Interner Teamchat | initial rollierend 12 Monate; dauerhaft relevante Inhalte MÜSSEN in den dafür vorgesehenen Fachprozess übernommen werden | interne Initialentscheidung |

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
  gesamte klinische Retention.
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
- Der Backup-Lebenszyklus selbst — Aufbewahrung, RPO und RTO bleiben offener
  Punkt E3.
- Die abschließende steuerrechtliche Bewertung der Belegarten und Fristen.
- Die Rechtsgrundlagen je Verarbeitungsvorgang und ein Einwilligungsmodell;
  das bleibt bei ADR-007 offen.
- Ob und wie anonymisierte Daten nach Fristablauf für Auswertungen erhalten
  bleiben.
- Die Definition des „Abschlusses der Behandlung" als fachlicher Vorgang.
- Änderungen an der Versionierung klinischer Dokumentation nach §5.

## Offene Folgefragen

- Wie wird „Abschluss der Behandlung" fachlich definiert und im System
  gesetzt — manuell, durch Zeitablauf, oder beides?
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
  relevante Inhalte verloren gehen (§10, §13)?
- Welche Fristen ändern sich nach der Validierung im DSFA-Prozess, und wie
  wird diese Änderung nachgezogen?
- Wie werden Dateien und Anhänge behandelt, die in mehreren Kontexten
  referenziert sind?
