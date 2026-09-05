# Querschnittsthemen (QSN)

> Nicht normativ. Siehe [../IDEENSPEICHER.md](../IDEENSPEICHER.md).

Themen, die zu keinem einzelnen Navigationspunkt gehören, aber jeden betreffen.
Erfahrungsgemäß sind das die Dinge, die am Ende über die Benutzbarkeit
entscheiden und am Anfang niemand aufschreibt.

---

### IDEA-QSN-001 — Ein Zeitstrahl über alle Bereiche

| | |
|---|---|
| Status | bestätigt |
| Quelle | Claude, 2026-09-01 |
| Berührt | [ADR-004](../../adr/ADR-004-authorization-model.md), [ADR-010](../../adr/ADR-010-audit-and-privileged-access.md), [04 OUT](04-assessments-outcomes-fortschritt.md) |

**Idee.** Eine chronologische Ansicht je Person, die alles zusammenführt:
Termine, Dokumentation, Trainingseinheiten, Check-ins, Rückfragen,
Assessments, Planwechsel, Rechnungen.

**Warum.** Die Frage „was ist mit dieser Person seit Mai passiert" ist die
häufigste überhaupt und heute nur durch Zusammensuchen über mehrere Ansichten
beantwortbar. Ein Zeitstrahl ist außerdem die natürliche Form der
Behandlungsgeschichte.

**Vorsicht.** Ein Zeitstrahl ist eine Zusammenführung über
Berechtigungsgrenzen hinweg. Er muss dieselbe rollenabhängige Projektion
durchlaufen wie jede andere Ansicht (ADR-004): Office sieht denselben
Zeitstrahl mit anderem Inhalt, nicht denselben Inhalt mit ausgeblendeten
Zeilen.

---

### IDEA-QSN-002 — Zwei Sprachebenen im Datenmodell

| | |
|---|---|
| Status | bestätigt |
| Quelle | Claude, 2026-09-01 |
| Berührt | [01 TRN](01-trainingsplaene-und-progression.md), [04 OUT](04-assessments-outcomes-fortschritt.md) |

**Idee.** Übungen, Instrumente, Ziele und Statuswerte tragen zwei
Bezeichnungen: eine fachliche für die Praxis, eine alltagssprachliche für
Patient:innen. Nicht als nachträgliche Übersetzung, sondern als zwei Felder.

**Warum.** „Exzentrische Wadenmuskelbelastung im Einbeinstand" und „Fersen
langsam absenken, auf einem Bein" sind derselbe Inhalt für zwei
Leserschaften. Eine nachträgliche Übersetzung durch ein Sprachmodell wäre
möglich, ist aber teurer, langsamer und weniger verlässlich als zwei Felder
— und bei klinischen Begriffen nach ADR-006 heikel.

---

### IDEA-QSN-003 — Datenexport als Funktion, nicht als Anfrage

| | |
|---|---|
| Status | bestätigt |
| Quelle | Claude, 2026-09-01 |
| Berührt | [ADR-007](../../adr/ADR-007-data-protection-impact-assessment.md), [ADR-008](../../adr/ADR-008-data-retention-and-deletion.md), [00 LZK](00-lebenszyklus-und-zugang.md) |

**Idee.** Die Person kann ihre Daten selbst exportieren — maschinenlesbar und
lesbar aufbereitet.

**Warum.** ADR-007 führt „Verfahren für Betroffenenrechte" als Vorbedingung
für den Produktivstart. Ein Verfahren, das aus einer E-Mail und Handarbeit
besteht, ist bei jeder Anfrage teuer und fehleranfällig; als Funktion ist es
einmal gebaut. Zusätzlich ist es beim Offboarding
([IDEA-LZK-006](00-lebenszyklus-und-zugang.md)) ohnehin nötig.

**Vorsicht.** Ein Export ist eine Offenlegung: auditpflichtig nach ADR-010,
identitätsgeprüft (B5), rollenabhängig projiziert. Ein Exportknopf, der die
Rohdatenbank ausleitet, hebelt jede Feldbeschränkung aus.

---

### IDEA-QSN-004 — Regelwerke gegen synthetische Verläufe testen

| | |
|---|---|
| Status | bestätigt |
| Quelle | Claude, 2026-09-01 |
| Berührt | [ADR-013](../../adr/ADR-013-ci-cd-and-release-governance.md), E6, `PROJECT_PRINCIPLES.md` §12 |

**Idee.** Für jede Progressions- oder Auswertungsregel ein Satz synthetischer
Personenverläufe über mehrere Wochen mit erwartetem Ergebnis, als Testfälle in
der CI. Ändert sich das Ergebnis, muss die Änderung begründet und die
Regelversion erhöht werden.

**Warum.** `CLAUDE.md` verlangt für jede Änderung eine objektive
Verifikation. Bei einer Regel, die Trainingslasten bestimmt, ist ein Unit-Test
über eine Funktion zu wenig — der Fehler entsteht im Zusammenspiel über
Wochen. Ein fester Satz von Verläufen ist zugleich das Material, das eine
externe Prüfung sehen will, und deckt E6 (fehlender Generator für synthetische
Daten) mit ab.

---

### IDEA-QSN-005 — Alles Automatische braucht einen protokollierten Override

| | |
|---|---|
| Status | bestätigt |
| Quelle | Claude, 2026-09-01 · angeregt durch „COACH-KONTROLLE" |
| Berührt | [ADR-006](../../adr/ADR-006-medical-device-boundary.md), [ADR-009](../../adr/ADR-009-private-billing-model.md), [ADR-010](../../adr/ADR-010-audit-and-privileged-access.md) |

**Idee.** Als durchgehendes Muster: jeder automatische Ablauf, der eine Person
betrifft, ist durch die Praxis abschaltbar oder überschreibbar, und jede
Ausnahme wird protokolliert.

**Warum.** ADR-009 hat genau dieses Muster für die Fakturierung schon
entschieden (Regelfall automatisch, Override protokolliert). Es ist
gleichzeitig die praktische Antwort auf ADR-006: eine Software, deren
Automatik die Therapeutin jederzeit anhalten kann, trifft keine Entscheidung —
sie schlägt vor. Und es ist einfach guter Betrieb: der Sonderfall existiert
immer.

---

### IDEA-QSN-006 — Die Oberfläche muss für 78-Jährige funktionieren

| | |
|---|---|
| Status | bestätigt |
| Quelle | Claude, 2026-09-01 |
| Berührt | `PROJECT_PRINCIPLES.md` §2.2, B5, [ADR-015](../../adr/ADR-015-initial-technical-stack.md) |

**Idee.** Verbindliche Grundlage für alle Patientenansichten: skalierbare
Schriftgröße ohne Umbruchchaos, ausreichender Kontrast, große Berührflächen,
**Farbe nie als einziger Bedeutungsträger**, Bedienbarkeit mit Tastatur und
Screenreader, kurze Sätze, keine Fachbegriffe ohne Erklärung.

**Warum.** Die Praxis macht Hausbesuche. Ein erheblicher Teil der
Patient:innen ist hochbetagt — B5 nennt sie ausdrücklich. Eine Oberfläche, die
eine Coaching-App für 25-Jährige nachbaut, verfehlt genau die Gruppe, die
Betreuung zwischen den Terminen am dringendsten braucht. Beim Ampelmodell
([IDEA-TRN-003](01-trainingsplaene-und-progression.md)) ist die
Farbunabhängigkeit nicht nur Barrierefreiheit, sondern Patientensicherheit.

---

### IDEA-QSN-007 — Fremde Begriffe nicht ungeprüft übernehmen

| | |
|---|---|
| Status | bestätigt |
| Quelle | Claude, 2026-09-01 |
| Berührt | [referenz-navigation.md](referenz-navigation.md), [ADR-006](../../adr/ADR-006-medical-device-boundary.md) |

**Idee.** Begriffe aus Coaching- und Fitnesssoftware werden vor der Übernahme
geprüft: „Athlet", „Session", „Analyse", „Score", „Plan", „Assessment". Jeder
davon trägt in unserem Kontext eine andere Bedeutung oder eine regulatorische
Nebenwirkung.

**Warum.** ADR-006 stellt fest, dass die Zweckbestimmung auch aus Beschriftung
und Darstellung entsteht. Wörter sind hier nicht Geschmackssache. „Analyse"
verspricht eine Bewertung; „Übersicht" nicht. Das ist der billigste Weg, die
Grenze zu halten — und der teuerste, sie unbemerkt zu überschreiten.

---

### IDEA-QSN-008 — Interoperabilität als Fernziel benennen, nicht bauen

| | |
|---|---|
| Status | bestätigt |
| Quelle | Claude, 2026-09-01 |
| Berührt | [ADR-014](../../adr/ADR-014-foundational-data-model.md), `PROJECT_PRINCIPLES.md` §11 |

**Idee.** Wenn Messwerte, Fragebogenantworten und Pläne modelliert werden,
kann man sich bei der Benennung an etablierten Gesundheitsdatenstandards
orientieren — Beobachtung, Fragebogenantwort, Behandlungsplan. Kostenlos, weil
es nur Benennung ist.

**Vorsicht — ausdrücklich.** Das ist **keine** Empfehlung, einen solchen
Standard zu implementieren, eine Abbildungsschicht zu bauen oder Ressourcen
nachzubilden. Das wäre genau das prophylaktische Vorbauen, das §11 und ADR-014
untersagen. Der Nutzen liegt allein darin, später eine Exportschnittstelle
schreiben zu können, ohne das Modell umzubauen.

---

### IDEA-QSN-009 — Mandantenfähigkeit mit Branding pro Praxis

| | |
|---|---|
| Status | notiert |
| Quelle | Jannes, 2026-09-05 |
| Berührt | `PROJECT_PRINCIPLES.md` §1, [ADR-003](../../adr/ADR-003-organization-location-model.md), [ADR-015](../../adr/ADR-015-initial-technical-stack.md) |

**Idee.** Andere Praxen sollen die Software mit eigenem Logo und eigenen
Farben nutzen können — Branding pro Organisation, nicht nur ein einheitliches
Design für die eine Praxis.

**Warum.** Wunsch von Jannes für eine mögliche spätere Vermarktung an andere
Praxen. Technisch günstig vorbereitet: die Optik läuft bereits über zentrale
Design-Tokens (`src/index.css`), und `organization_id`/`location_id` sind
laut ADR-003 schon Teil des Datenmodells — allerdings ausdrücklich ohne
Tenant-Verwaltung oder Mandantenfähigkeit als Produktfunktion.

**Vorsicht — ausdrücklich.** `PROJECT_PRINCIPLES.md` §1 nennt Mandantenfähigkeit
aktuell **kein Produktziel**, und ADR-003 schließt Tenant-Switching-UI,
SaaS-Onboarding und organisationsübergreifende Administration ausdrücklich
aus. Diese Idee begründet **keine** Erweiterung des aktuellen Scopes (Rang 6,
siehe oben). Vorbauen (z. B. Branding-Spalten oder ein Theme-Provider „für
später") ist verboten, solange das nicht gebraucht wird.

**Offen.** Ob und wann Jannes Mandantenfähigkeit tatsächlich als Produktziel
verfolgen will. Erst danach: eine ausdrückliche Änderung von
`PROJECT_PRINCIPLES.md` §1 (§21), ggf. ein neuer oder ergänzter ADR-003, dann
erst eine Feature-Spezifikation.
