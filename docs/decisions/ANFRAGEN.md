# Anfragen an externe Stellen
Die Volltexte der offenen Anfragen: Frage, vorläufige Festlegung als Vorlage, Preis der Rücknahme
und was offen bleibt. **Verschickt wird ab Anfang 2027, parallel zum Bauen** (Jannes, 2026-09-23,
§15.2). Das Dokument **entscheidet nichts** und hat keinen Rang; Stand und Fälligkeit stehen in
[`OPEN_DECISIONS.md`](OPEN_DECISIONS.md) („Offene Punkte“, „Externe Prüfungen“). Stand bis
2026-10-27 mit allen Herleitungen: `git show 9452575:docs/decisions/ANFRAGEN.md`.

## B1 — MDR / EU AI Act: die Zweckbestimmung
An die regulatorische Prüfung, mit B10 · P1, Ergebnis vor M3 · §17; ADR-006 Punkt 7 · Umfang: der
ganze V1-Umfang in beiden Leistungsbereichen (ADR-006 Punkt 9; Roadmap G15).

**Frage:** Mit welchem Wortlaut beschreibt die Praxis die Zweckbestimmung der Software, und trägt er
die Abgrenzung gegenüber Medical Device Software und die Einordnung nach EU AI Act?

**Vorläufig entschieden am 2026-09-08 durch Jannes** — dieser Wortlaut geht in die Anfrage:

> Die Software dient der Organisation, Dokumentation und Abrechnung physiotherapeutischer Leistungen
> einer privat abrechnenden Praxis. Sie erfasst, speichert, strukturiert und stellt
> Gesundheitsinformationen dar und führt transparente mathematische Berechnungen validierter
> Instrumente durch.
>
> Sie ist **nicht** dazu bestimmt, diagnostische oder therapeutische Entscheidungen zu treffen,
> Therapieempfehlungen zu geben, klinische Risikoklassifikationen oder Differentialdiagnosen zu
> erzeugen oder klinische Entscheidungen zu automatisieren. Eingesetzte generative KI dient der
> Dokumentation, sprachlichen Umformung, Zusammenfassung und administrativen Assistenz und fügt
> keine klinische Interpretation hinzu.
>
> Alle klinischen Entscheidungen trifft die behandelnde Therapeutin.

Der zweite Absatz benennt die Ausschlüsse positiv, statt sie offenzulassen; daran entscheidet sich
die Einordnung. **Mitzuprüfen:** B10 (unten); ob ein veröffentlichter Cut-off oder MCID neben dem
eigenen Wert schon eine Klassifikation nach ADR-006 Punkt 4 ist (`IDEA-OUT-002`, bis dahin nicht
gebaut); Transparenzpflichten nach EU AI Act gegenüber Patient:innen und Beschäftigten (ADR-006,
Folgefragen). **Nicht ersetzbar** ist die Prüfung selbst; sie entfällt nicht, weil der Text vorliegt.
**Rücknahme:** heute `klein` (ein Dokument); zieht die Prüfung die Grenze anders, betrifft das
Features. Bis dahin bleibt jedes Feature mit `MDR_REVIEW_REQUIRED` gesperrt (`src/app/mdr.ts`).
Annahme: ANN-014.

## B2 — Datenschutz: DSFA und Prüfpaket
An die externe Datenschutzberatung · P1, Ergebnis vor M3 · ADR-007, §3.7; Roadmap G14. Die Anfrage
ist das Prüfpaket: Unterlagen, Reihenfolge und Einzelfragen im Index
[`../datenschutz/README.md`](../datenschutz/README.md), der Gegenstand in `OPEN_DECISIONS.md`
(„Externe Prüfungen“, Zeile B2). Mit B2 gehen die Datenschutzfragen aus B3, B5, B7 und B9.

## B3 — Fristen der Aufbewahrung
Mit B2 an die Datenschutzberatung, die Belegfristen mit B4 · ADR-008, §18. Zu validieren ist jede
Frist in `public.retention_classes`; die Liste kommt aus der Datenbank (Abfrage im Index unter B2),
die Begründung einer internen Frist aus ihrer Annahme in `assumption_key` und aus ANN-001.

## B4 — Steuerliche Validierung: Fragen an die Steuerberatung
An die Steuerberatung, mit B9 und B11 · P1, bestätigt vor der ersten ausgestellten Rechnung · §19;
ADR-009 Punkte 5, 6, 8, 15 und 21; GoBD. Das Abrechnungsmodell ist entschieden (ADR-009). **Vorlage
zu den Fragen 1 bis 4** sind vier Festlegungen, vorläufig entschieden am 2026-09-08 durch Jannes;
**Festlegung statt Frage** (2026-09-07, B9): Heilbehandlung und Personal Training laufen über
**ein** Unternehmen.

1. **Leistungsarten.** Vorlage: Steuerkennzeichen am Posten (ADR-009 Punkt 15), befreit nach §4
   Nr. 14a UStG für Heilbehandlung auf Verordnung, steuerpflichtig für Prävention, Selbstzahler ohne
   Verordnung und Personal Training, gemischte Fälle in **getrennten Rechnungen**; Rücknahme
   `klein`. Frage: Welche Katalogpositionen sind befreit, welche nicht, und wann gilt der ermäßigte
   Satz?
2. **§19 UStG im Eröffnungsjahr.** Vorlage: die Kleinunternehmerregelung in Anspruch nehmen, solange
   der Umsatz des Personal Trainings unter der Grenze bleibt; ein Umsatzsteuer-Status, ein
   Hinweistext; der Vorsteuerabzug nützt im befreiten Teil nichts (§15 Abs. 2 Nr. 1 UStG);
   Rücknahme `mittel`. Frage: die für 2027 geltende Grenze (§19 UStG wurde zum 01.01.2025 geändert);
   bildet sich der Gesamtumsatz nach §19 Abs. 3 UStG ohne die befreiten Heilbehandlungsumsätze, so
   dass im Kern das Personal Training zählt, und ab wann löst das die Regelbesteuerung aus?
3. **Nummernkreise.** Vorlage: je Leistungsbereich `Kürzel-JJJJ-NNNN` (`RG`, `TR`), je Jahr ab `0001`,
   lückenlos, vergeben bei Ausstellung (§14 Abs. 4 Nr. 4 UStG; ADR-009 Punkt 8, ANN-075); Rücknahme
   `klein` vor der ersten Rechnung, danach faktisch `groß`. Frage: Genügt das bei der Eröffnung im
   Juli 2027 ohne Vorgängersystem an Format, Lückenlosigkeit und Dokumentation?
4. **Belegfristen und Belegarten** (B3). Vorlage: die gesetzlichen (§147 AO, §257 HGB) als eigene
   Datenklasse, getrennt von der Akte, zwei Uhren statt einer; Rücknahme `klein`. Frage: für
   Rechnungen, Storno- und Korrekturdokumente, Zahlungs- und Erstattungsbelege?
5. **Export für die Steuerberatung:** gewünschtes Format (CSV, DATEV) für Rechnungen und Zahlungen
   (`IDEA-PRX-026`).
6. **Personal Training und Pakete** (B9, B11): Ein Paket gilt für einen festen Zeitraum, ist nicht
   pausierbar und enthält die Plattform (ADR-009 Punkt 21). Entsteht die Steuer bei Vereinnahmung
   (§13 Abs. 1 Nr. 1 lit. a Satz 4 UStG)? Was verlangt die GoBD für das Guthaben? Wie ist ein Paket
   zu behandeln, das bei einem Rückfall in die Heilbehandlung weiterläuft oder anteilig erstattet
   wird (`IDEA-ANG-003`)? Getrennte oder gemeinsame Rechnung mit der Praxis?
7. **Nachsorge-Abo** (2026-09-23): Nach dem Ende der Behandlung nutzen Patient:innen die Plattform
   monatlich kündbar weiter (Heimprogramm, Anpassung durch die Therapeutin, Rückfragen mit
   Antwortfrist); während der Behandlung ist sie kostenlos. Steuerfreie Heilbehandlung nach §4
   Nr. 14a UStG, steuerpflichtige sonstige Leistung oder digitales Produkt? Vorlage: Kennzeichen am
   Posten, bis zur Antwort als Annahme.
8. **Weiteres:** Rechnungstext und Rechtsgrundlage, wenn die Tür geöffnet wird, aber nicht behandelt
   werden kann (E14 Fall 1, §8); Wortlaut der Befreiungshinweise (ANN-082); Wahl der
   Gewinnermittlungsart (B9, ANN-088).

Nicht mehr gefragt: eine Behandlungsbestätigung je Termin (Jannes 2026-09-06, `IDEA-PRX-015`
verworfen). **Blockiert:** nichts; bis zur Antwort tragen ANN-074, ANN-075, ANN-082 und ANN-088.

## B5 — Patientenidentität, Identitätsprüfung und Vertretung
An die Datenschutz- und Rechtsberatung · P1 für die Plattform · §4.6; ADR-023 Abschnitt C.

**Vorläufig entschieden am 2026-09-08 durch Jannes, der Rahmen:** (1) Ein Konto gehört einer
Person. Vertretung ist eine eigene Beziehung mit eigenem Konto und ausdrücklich erteiltem Zugriff,
im Auditlog unterscheidbar, **nie** durch weitergegebene Zugangsdaten. Rücknahme `groß` (Auditlog
und Zugriffsmodell). (2) Der Portalzugang ist nicht die Einsicht nach §630g BGB; die läuft auf
Antrag mit dokumentierter Identitätsprüfung und dokumentiertem Umfang. **Das Verfahren** steht seit
2026-09-30 in ADR-023 Punkte 11 bis 16 und gilt vorläufig bis zur Antwort: Übergabe vor Ort oder
Mail an die von der Person bestätigte Adresse, Vertretung als rechtliche Vertretung oder Begleitung,
kein eigenes Konto unter 18.

**Fragen:** (1) Genügen Übergabe vor Ort und Mail an die bestätigte Adresse als Identitätsprüfung,
auch bei hochbetagten Patient:innen? (2) Trägt die Zustimmung zur Begleitung als Einwilligung nach
Art. 9 Abs. 2 lit. a DSGVO zugleich die Entbindung von der Schweigepflicht? (3) Ist die Frist der
Zugangsdaten tragfähig (ADR-023 Punkt 5)? (4) Wie prüft die Praxis den Aufgabenkreis einer Betreuung?

## B8 — Lizenzen für Fragebögen und PROMs
An den Lizenzgeber der Instrumente · vor M3 · §7; ANN-086. Jannes hat die Nutzung erklärt
(2026-09-19, für alle Vorlagen in `quellen/scores/pdf/` am 2026-09-21; siehe
[`quellen/README.md`](../../quellen/README.md)). **Erbeten** wird der schriftliche Beleg; bis dahin
trägt jedes Instrument seinen Lizenzstatus, die Erklärung trägt das Bauen, nicht die Freigabe.

## B9 — Betreuung ohne und nach Heilbehandlung: Rechtsrahmen und Datentrennung
An Steuer- und Rechtsberatung, der Datenschutzteil mit B2 · P2, mit B4 ab Anfang 2027 · §1, §14,
§18, §19; ADR-021, ADR-027.

**Frage:** Was gilt für die Weiterbetreuung nach dem Rezept und für Kund:innen des Personal
Trainings ohne Heilbehandlung (kein Rezept, kein Behandlungsvertrag, keine Akte)? Die Plattform
gehört zur Eröffnung (§1.2, §14), der Übergang läuft über das Abschlussgespräch und einen eigenen
Trainingsvertrag im Konto (§4.10). Zu prüfen ist die **Zweckbindung** der Erinnerung an das
Abschlussgespräch: Sie nutzt ein Datum der Behandlung für ein Angebot außerhalb der Heilbehandlung.

**Vorläufig entschieden durch Jannes**, am 2026-09-07: **ein Unternehmen**, eine `organization_id`
(ADR-003); nach §2 Abs. 1 Satz 2 UStG ohnehin die Rechtslage, der Preis liegt bei §19 UStG (B4
Frage 2). Die Trennung von Akte und Training muss deshalb technisch entstehen (ADR-021, ADR-004);
zwei Organisationen wären ein Datenumzug, `groß`. Am 2026-09-08:

1. **Vertragsart:** Dienstvertrag (§611 BGB) für Training, Behandlungsvertrag (§630a BGB) nur bei
   Heilbehandlung, keine Mischform. Rücknahme `klein`.
2. **Dokumentation:** §630f BGB gilt fürs Training nicht; dokumentiert wird in eigener Struktur, nie
   in der Akte (ADR-021 Punkte 1 bis 5). Rücknahme `groß`, deshalb von Anfang an getrennt.
3. **Aufbewahrung:** drei Jahre nach Ende der Betreuung (§§ 195, 199 BGB), Belege auf der
   Steuerfrist (B4 Frage 4; ADR-021 Punkt 4, ANN-183). Rücknahme `klein`.
4. **Rechtsgrundlage:** Einwilligung nach Art. 9 Abs. 2 lit. a DSGVO für Gesundheitsdaten im
   Training, Art. 6 Abs. 1 lit. b für Vertrag und Abrechnung, nicht lit. h. Rücknahme `mittel`.
5. **Zweckbindung:** kein automatischer Fluss; aus der Akte ins Training nur mit Einwilligung als
   Kopie mit Herkunftsvermerk, nie als Verweis (ADR-021 Punkt 7); vom Training in die Akte gar
   nicht, solange keine Heilbehandlung läuft. Rücknahme `groß`.
6. **Ernährung:** abgelöst durch ADR-027 (2026-10-18), Beratung durch Jannes als Zusatz zu
   Behandlung und Training. Zu prüfen: die Grenze zur Diättherapie bei Erkrankung
   (Diätassistentengesetz) und ob die Qualifikation reicht (`IDEA-ALT-005`).

**Weiterhin offen:** die steuerliche Validierung (mit B4); die datenschutzrechtliche Bestätigung,
vor allem von 4 und 5 und des Leserechts des Büros im Training (ADR-021 Punkt 10, ANN-184), mit B2;
das Berufsrecht zu 6. **Blockiert:** nichts (§15.2); scharfgeschaltet wird nach der Antwort.

## B10 — Automatisierte Progression: MDR-Grenze und Verantwortung
An die regulatorische Prüfung, mit B1 · P2, vor dem ersten Progressionsfeature · §6, §7.1, §16, §17;
ADR-005, ADR-006.

**Frage:** Darf die Plattform die Belastung eines Trainingsplans selbsttätig anpassen? Reicht die
Freigabe eines Regelwerks je Plan, ist ein Ampelmodell mit therapeutisch gesetzten Schwellen eine
Risikoklassifikation, und gilt für die Weiterbetreuung (B9) ein anderer Maßstab?

**Vorläufig entschieden am 2026-09-08 durch Jannes: für V1 ausgeschlossen.** Ein Regelwerk je Plan
gibt die Therapeut:in frei, und **jeder einzelne Progressionsschritt braucht ihre Bestätigung**, bevor
er bei der Person ankommt; so bleibt es bei ADR-006 Punkt 2 und verletzt Punkt 4 nicht. **Eine Ampel
wird auch mit therapeutisch gesetzten Schwellen nicht gebaut**: Sie ist eine Risikoklassifikation
(§17). Rücknahme heute `klein`; in die andere Richtung `groß`, ein solches Feature ist
`MDR_REVIEW_REQUIRED` und produktiv gesperrt (ADR-006 Punkt 10, `src/app/mdr.ts`). Ideen:
`IDEA-TRN-001` bis `IDEA-TRN-003` im [Ideenspeicher](../product/IDEENSPEICHER.md).

## C6 — KI-Anbieter: Schutzumfang und Vertragszusagen
Vorlage für die Auswahl des KI-Anbieters, P1 für das erste KI-Feature (Etappe 10) · §6.1; ADR-005.

**Frage:** Welchen Schutz leistet Pseudonymisierung bei klinischem Freitext, dessen Inhalt die Person
identifiziert, welche Vertragszusagen treten an ihre Stelle, und welcher Anbieter, welches Modell?

**Vorläufig entschieden am 2026-09-08 durch Jannes, der Schutzumfang:** Pseudonymisierung ist bei
klinischem Freitext kein wirksamer Schutz; ein Befundtext identifiziert die Person über Diagnose,
Beruf, Wohnsituation und Verlauf. Die Last tragen Vertragszusagen. In Frage kommt nur ein Anbieter
mit **allen fünf**: Verarbeitung ausschließlich in der EU · keine Nutzung der Eingaben zu
Trainingszwecken, vertraglich zugesichert · keine oder sehr kurze Aufbewahrung · AVV nach Art. 28
DSGVO · Verpflichtung seiner Beschäftigten nach §203 StGB. Rücknahme heute `klein`, nichts ist
angebunden.

**Weiterhin offen:** der Anbieter, auch für Spracherkennung und Transkription (E13). Die Auswahl läuft
durch die Prüfung nach ADR-002, die Freischaltung löst eine DSFA-Wiedervorlage aus (ADR-007).

## Beantwortet oder umgezogen
- **B11** Paketpreise, Vorauszahlung, Anreize: entschieden 2026-09-22/23 (ADR-009 Punkt 21), Steuer
  in B4 Frage 6. Rabatt für eine Bewertung: nein; falls doch gewünscht, vorher anwaltlich prüfen
  lassen, nicht als Annahme (`IDEA-ANG-002`).
- **E2** Ausfallkonzept: keine Anfrage nach außen; Kern und Ausarbeitung in `OPEN_DECISIONS.md`, E2.
