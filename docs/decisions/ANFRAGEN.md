# Anfragen an externe Stellen

Die Volltexte der Punkte, die eine externe Stelle beantwortet — unverändert aus
`OPEN_DECISIONS.md` übernommen (R2-F01, 2026-09-14). Sie sind die Vorlage für
die Anfrage: Frage, Stand, vorläufige Festlegung und Preis der Rücknahme.

Dieses Dokument **entscheidet nichts** und hat wie `OPEN_DECISIONS.md` keinen
Rang. Status und Fälligkeit jedes Punktes stehen in der Übersicht von
`OPEN_DECISIONS.md`; der dortige Stub verweist hierher.

## B1 — MDR / EU AI Act: die Zweckbestimmung

Anfrage an die regulatorische Prüfung (MDR, EU AI Act). Stand und Fälligkeit: `OPEN_DECISIONS.md`, Punkt B1.

| | |
|---|---|
| Dringlichkeit | P1 — Text vor der Anfrage (Sep), Prüfergebnis vor M3 |
| Bezug | §17; ADR-006 Punkt 7 |

**Frage:** Mit welchem Wortlaut beschreibt die Praxis die Zweckbestimmung der
Software? Die externe Prüfung braucht einen Text, den sie prüfen kann.

**Vorläufig entschieden am 2026-09-08 durch Jannes** — dieser Wortlaut geht in
die Anfrage:

> Die Software dient der Organisation, Dokumentation und Abrechnung
> physiotherapeutischer Leistungen einer privat abrechnenden Praxis. Sie
> erfasst, speichert, strukturiert und stellt Gesundheitsinformationen dar und
> führt transparente mathematische Berechnungen validierter Instrumente durch.
>
> Sie ist **nicht** dazu bestimmt, diagnostische oder therapeutische
> Entscheidungen zu treffen, Therapieempfehlungen zu geben, klinische
> Risikoklassifikationen oder Differentialdiagnosen zu erzeugen oder klinische
> Entscheidungen zu automatisieren. Eingesetzte generative KI dient der
> Dokumentation, sprachlichen Umformung, Zusammenfassung und administrativen
> Assistenz und fügt keine klinische Interpretation hinzu.
>
> Alle klinischen Entscheidungen trifft die behandelnde Therapeutin.

Der zweite Absatz benennt die Ausschlüsse positiv, statt sie offenzulassen —
daran entscheidet sich die MDR-Einordnung.

**Weiterhin offen und nicht ersetzbar:** die externe Prüfung selbst (§17,
ADR-006 Punkt 7). Sie prüft diesen Text; sie entfällt nicht dadurch, dass er
vorliegt.

**Rücknahme:** heute `klein` (ein Dokument). Zieht die Prüfung die Abgrenzung
anders, betrifft das Features, nicht Text — deshalb jetzt festlegen und prüfen
lassen, nicht umgekehrt.

**Blockiert:** nichts mehr für die Anfrage. Weiterhin gesperrt bleibt jedes
Feature mit `MDR_REVIEW_REQUIRED` (B10).

**Annahmen:** ANN-014 („Empfehlung zum Verordnungsende" ist eine erfasste
Angabe, keine Systemempfehlung).

## B4 — Steuerliche Validierung: Fragen an die Steuerberatung

Anfrage an die Steuerberatung. Stand und Fälligkeit: `OPEN_DECISIONS.md`, Punkt B4.

| | |
|---|---|
| Dringlichkeit | P1 — als Annahme vor ABR-EPIC-001, bestätigt vor der ersten ausgestellten Rechnung (ABR-EPIC-002a) |
| Bezug | §19; ADR-009 Punkte 5, 6 und 8; GoBD; B9, B11 |

Das Abrechnungsmodell ist entschieden (ADR-009). Offen ist die steuerliche
Validierung; die Liste wurde am 2026-09-06 um die Punkte erweitert, die aus
der Eröffnung ohne Vorgängersystem und aus dem Personal Training folgen. Sie
geht mit der Anfrage B4 im September an die Steuerberatung:

**Vorläufig entschieden am 2026-09-08 durch Jannes** — vier Festlegungen, die
als Vorlage in die Anfrage gehen und die Rechnung in ABR-EPIC-001/002a
bestimmen:

1. **Steuerkennzeichen je Katalogposition** (ADR-009 Punkt 6 verlangt es
   ohnehin): Voreinstellung **befreit nach §4 Nr. 14a UStG** für Heilbehandlung
   auf Verordnung, **steuerpflichtig** für Prävention, Selbstzahler ohne
   Verordnung und Personal Training. Gemischte Fälle: **getrennte Rechnungen**,
   nicht eine Rechnung mit zwei Steuersätzen. Rücknahme `klein`.
2. **Kleinunternehmerregelung nach §19 UStG: in Anspruch nehmen**, solange der
   Personal-Training-Umsatz unter der geltenden Grenze bleibt. Der aufgegebene
   Vorsteuerabzug nützt im Heilbehandlungsteil ohnehin nichts — §15 Abs. 2 Nr. 1
   UStG schließt ihn für steuerfreie Umsätze aus; es bliebe nur der
   Trainingsanteil, dem die gesamte Umsatzsteuer-Mechanik gegenübersteht. Für
   die Software: **ein** Umsatzsteuer-Status, **ein** Hinweistext, keine zwei
   Steuersätze. Rücknahme `mittel` (ein Statuswechsel mitten im Jahr zieht sich
   durch Rechnungsvorlage und Katalog). **Unsicher und ausdrücklich zu fragen:**
   die für 2027 geltende Grenze (§19 wurde zum 01.01.2025 geändert) und ob der
   Gesamtumsatz nach §19 Abs. 3 UStG die befreiten Heilbehandlungsumsätze
   vollständig herausnimmt.
3. **Nummernkreis `RG-JJJJ-NNNN`**, je Kalenderjahr neu bei `0001`, lückenlos,
   Nummer erst bei Ausstellung (ADR-009). §14 Abs. 4 Nr. 4 UStG verlangt eine
   einmalig vergebene fortlaufende Nummer; das Jahrespräfix macht eine Lücke
   sofort sichtbar. Rücknahme `klein` **vor** der ersten Rechnung, danach
   faktisch `groß` — also vor dem 01.07.2027 festzurren.
4. **Belegfristen: die gesetzlichen übernehmen** (§147 AO, §257 HGB) und als
   **eigene Datenklasse** im Retention Schedule führen, getrennt von der
   Patientenakte. Rechnungen folgen der Steuerfrist, klinische Unterlagen der
   Behandlungsfrist — zwei Uhren, nicht eine. Rücknahme `klein`.

**Weiterhin offen:** die steuerliche Validierung dieser vier Punkte. Sie sind
Vorlage, nicht Beratung.

**Vorgabe statt Frage (2026-09-07, B9):** Heilbehandlung und Personal Training
laufen über **ein** Unternehmen. Die Fragen 1 und 2 sind entsprechend als
Festlegung formuliert und nicht mehr ergebnisoffen.

1. **Leistungsarten und Umsatzsteuer:** Welche Katalogpositionen sind nach
   §4 Nr. 14a UStG befreit (Heilbehandlung auf Verordnung), welche nicht
   (Prävention, Selbstzahler ohne Verordnung, Personal Training)? Wie werden
   gemischte Fälle abgerechnet — getrennte Rechnungen oder eine Rechnung mit
   zwei Steuersätzen? Beides fällt in **einem** Unternehmen an, nicht in zwei.
2. **Kleinunternehmerregelung (§19 UStG) im Eröffnungsjahr:** Nimmt die
   Praxis sie für die steuerpflichtigen Umsätze in Anspruch? Das bestimmt den
   Umsatzsteuer-Status in den Praxisstammdaten (ABR-000) und den Hinweistext
   auf der Rechnung. Bitte dabei bestätigen, wie der Gesamtumsatz nach
   §19 Abs. 3 UStG zu bilden ist, wenn die befreiten Heilbehandlungsumsätze
   herausfallen und im Wesentlichen das Personal Training gegen die Grenze
   zählt — und ab wann das die Regelbesteuerung auslöst.
3. **Nummernkreis:** Die Praxis eröffnet am 01.07.2027 ohne Vorgängersystem;
   der Nummernkreis beginnt mit der ersten Rechnung. Welches Format (fortlaufend
   je Jahr, mit Jahrespräfix) und welche Anforderungen an Lückenlosigkeit und
   Dokumentation gelten?
4. **Belegfristen und Belegarten** (B3): Rechnungen, Storno- und
   Korrekturdokumente, Zahlungsbelege, Erstattungsbelege.
5. **Export für die Steuerberatung:** gewünschtes Format (CSV, DATEV) für
   Rechnungen und Zahlungen (`IDEA-PRX-026`).
6. **Personal Training** (B9, B11): Umsatzsteuer, Anzahlungen und Pakete,
   getrennte oder gemeinsame Rechnungsstellung mit der Praxis.

Nicht mehr Teil der Anfrage: eine Behandlungsbestätigung oder Unterschrift je
Termin — Jannes hat am 2026-09-06 entschieden, dass keine benötigt wird
(`IDEA-PRX-015`, verworfen).

**Blockiert:** nichts; bis zur Antwort gelten Annahmen in ABR-EPIC-001 und
ABR-EPIC-002a (Registereinträge).

## B5 — Patientenidentität, Identitätsprüfung und Vertretung

Anfrage an die Datenschutz- und Rechtsberatung, mit dem Portal fällig. Stand und Fälligkeit: `OPEN_DECISIONS.md`, Punkt B5.

| | |
|---|---|
| Dringlichkeit | P1 für das Portal (Etappe 4) |
| Bezug | §4.6 |

**Frage:** Wie authentifizieren sich Patient:innen, wie wird ihre Identität
geprüft, und wer darf in ihrem Namen handeln?

**Warum offen:** §4.6 setzt „ein Patient = ein Account" voraus. In der mobilen
Versorgung sind Betreuer:innen, Bevollmächtigte, Angehörige und Eltern
Minderjähriger der Regelfall. Offen sind außerdem: Identitätssicherheit vor
Akteneinsicht (§630g BGB), Zugangsverfahren für hochbetagte Patient:innen, und
ob der Portalzugang der §630g-Einsicht entspricht — und wenn ja, welche Teile
der Akte sichtbar sind.

**Vorläufig entschieden am 2026-09-08 durch Jannes — der Rahmen, nicht das
Verfahren:**

1. **Ein Konto gehört einer Person.** Vertretung — Angehörige, Betreuung,
   Eltern Minderjähriger — wird als **eigene Beziehung** modelliert: eigenes
   Konto, ausdrücklich erteilter Zugriff, im Auditlog unterscheidbar.
   **Niemals durch Weitergabe der Zugangsdaten.** Sobald Angehörige das
   Patientenkonto mitbenutzen, ist jede Zurechnung im Auditlog wertlos — und
   das Auditlog ist nach ADR-010 die Kompensation für erhebliche
   Zugriffsrechte.
2. **Der Portalzugang ist nicht automatisch die Einsicht nach §630g BGB.** Die
   Einsicht erfolgt auf Antrag, mit dokumentierter Identitätsprüfung und
   dokumentiertem Umfang. Welche Teile der Akte im Portal sichtbar sind, ist
   davon getrennt zu entscheiden.

**Rücknahme:** Rahmensatz 1 später einzuziehen wäre `groß` (Auditlog und
Zugriffsmodell) — deshalb jetzt, obwohl das Portal weit weg ist. Der Aufwand
war bei der Entscheidung benannt (§15.1 Punkt 4). Alles Übrige `klein`, weil
noch nichts existiert.

**Weiterhin offen:** das Verfahren selbst — Zugangsverfahren, Identitätsprüfung
vor Akteneinsicht, Zugang für hochbetagte Patient:innen.

**Blockiert:** Identitäts- und Patientenstammdatenmodell für das Portal,
Portal-Design. **Nicht blockiert:** Rechnungsempfänger ≠ Patient:in (ADR-009
regelt den Adressaten der Rechnung, nicht den Zugriff auf die Akte).

## B9 — Betreuung ohne und nach Heilbehandlung: Rechtsrahmen und Datentrennung

Anfrage an Steuerberatung und Rechtsberatung zur Betreuung ohne Heilbehandlung. Stand und Fälligkeit: `OPEN_DECISIONS.md`, Punkt B9.

| | |
|---|---|
| Dringlichkeit | P2 — vor dem ersten Feature außerhalb der Heilbehandlung; Steuerteil mit B4 im September anfragen |
| Bezug | §1, §14, §18, §19; ADR-008, ADR-009; `IDEA-LZK-002`, `IDEA-LZK-008` |

**Frage:** Was gilt, wenn eine Person nach Ablauf des Rezepts freiwillig
weiterbetreut wird — und was gilt für Kund:innen des Personal Trainings, die
nie in Heilbehandlung waren?

**Warum offen:** Jannes hat am 2026-09-01 als langfristiges Ziel benannt,
frühere Patient:innen nach abgeschlossenem Rezept weiter zu coachen, und am
2026-09-06 ergänzt, dass die Plattform auch für die Kund:innen seines
Personal Trainings gedacht ist — ohne vorherige Heilbehandlung. Damit ist der
Übergang nicht mehr der einzige Fall: es gibt einen zweiten Eintrittsweg ohne
Verordnung, ohne Behandlungsvertrag und ohne Akte. Für ihn gelten dieselben
Fragen von Anfang an. Entschieden am 2026-09-06 (E-17): Das Personal
Training beginnt ebenfalls am 01.07.2027, es gibt keine Bestandsdaten; die
Plattform dafür ist Stufe 3 nach dem ersten Betriebsmonat; bis dahin werden
Kund:innen nicht als Patient:innen angelegt; `PROJECT_PRINCIPLES.md` §1 wird
nach §21 ergänzt, wenn Stufe 3 beginnt.

**Vorläufig entschieden am 2026-09-07 durch Jannes — ein Unternehmen:**
Patient:innen der Heilbehandlung und Kund:innen des Personal Trainings werden
**über dasselbe Unternehmen** betreut. Es gibt keinen zweiten Betrieb, keine
zweite Praxis und in der Plattform keine zweite Organisation — eine
`organization_id` nach ADR-003 für beides. Damit ist die Teilfrage „derselbe
Betrieb oder ein eigener?" beantwortet; sie geht als **Festlegung** in die
Anfrage B4, nicht mehr als Frage.

*Was daran hängt (Recherche zur Vorlage für B4, von der Steuerberatung zu
bestätigen):* Nach §2 Abs. 1 Satz 2 UStG umfasst das Unternehmen die gesamte
gewerbliche und berufliche Tätigkeit **einer** Person — als Einzelunternehmer
wäre Jannes umsatzsteuerlich ohnehin ein Unternehmer, auch mit zwei
Tätigkeiten; getrennte Unternehmen entstünden erst über eine eigene
Rechtsform. Die Entscheidung bestätigt damit im Wesentlichen die Rechtslage
und ist entsprechend risikoarm. Ihr Preis liegt bei §19 UStG: der Gesamtumsatz
wird für das eine Unternehmen gebildet, wobei die nach §4 Nr. 14 steuerfreien
Heilbehandlungsumsätze nach §19 Abs. 3 UStG herausfallen. Für die
Kleinunternehmergrenze zählt also im Kern der Personal-Training-Umsatz — er
kann die Praxis in die Regelbesteuerung führen. **Unsicher bleibt** die
Behandlung gemischter Fälle auf einer Rechnung; das ist Frage 1 von B4.

*Was die Entscheidung ausdrücklich **nicht** entscheidet:* Vertragsart,
Dokumentationspflicht nach §630f BGB, Aufbewahrungsfrist, Rechtsgrundlage nach
Art. 9 DSGVO und die Zweckbindung bleiben je Betreuungsverhältnis getrennt zu
beantworten — die Liste unten gilt unverändert. Ein Unternehmen macht die
**Zweckbindung sogar schärfer**, nicht lockerer: weil es keinen zweiten
Verantwortlichen und keine zweite Organisation mehr gibt, an denen sich die
Trennung von Akte und Trainingskontext organisatorisch festmachen ließe, muss
sie in Stufe 3 **technisch** entstehen — eigene Tabellen, eigene Rollenprüfung,
eigene Policies (ADR-004). Das ist der Punkt, den die Datenschutzberatung in
B2 sehen muss.

*Rücknahme:* Solange Stufe 3 nicht gebaut ist, kostet ein Widerspruch der
Steuerberatung in der Software **nichts** — es gibt keine Verankerung im Code,
nur diesen Vermerk. Ab Stufe 3 wäre die Trennung in zwei Organisationen ein
Datenumzug, Aufwand `groß`; das ist der Grund, die Antwort aus B4 **vor**
Stufe 3 zu haben, nicht danach.

Beim Übergang und beim Eintritt ohne
Behandlung ändern sich mehrere Dinge gleichzeitig:

- **Vertragsart:** Behandlungsvertrag (§630a BGB) gegenüber Dienstvertrag.
- **Dokumentationspflicht:** §630f BGB gilt für die Heilbehandlung, nicht für
  Training.
- **Aufbewahrung:** ADR-008 knüpft 10 Jahre an den „Abschluss der Behandlung";
  für Trainingsdaten fehlt die Frist.
- **Umsatzsteuer:** Heilbehandlung nach §4 Nr. 14a UStG regelmäßig befreit,
  Prävention und Selbstzahler-Training regelmäßig nicht.
- **DSGVO-Rechtsgrundlage:** Art. 9 Abs. 2 lit. h gegenüber Einwilligung nach
  lit. a, mit Widerruf.
- **Zweckbindung:** Welche Daten dürfen aus der Akte in den Trainingskontext,
  und was passiert in der Gegenrichtung?
- **Berufsrecht:** Reicht die physiotherapeutische Qualifikation, insbesondere
  bei Ernährung (`IDEA-ALT-005`)?

**Vorläufig entschieden am 2026-09-08 durch Jannes — die sechs verbliebenen
Fragen:**

1. **Vertragsart:** Dienstvertrag (§611 BGB) für Training, Behandlungsvertrag
   (§630a BGB) nur bei Heilbehandlung. Keine Mischform. Rücknahme `klein`.
2. **Dokumentationspflicht:** §630f BGB gilt fürs Training nicht. Es wird
   trotzdem dokumentiert, aber in **eigener Struktur** — nie in der
   Patientenakte. Wer nie in Heilbehandlung war, bekommt keine Akte. Rücknahme
   `groß`, wenn erst gemeinsam gespeichert und später getrennt würde; deshalb
   von Anfang an getrennt.
3. **Aufbewahrung:** Trainingsdaten **nicht** zehn Jahre, sondern **drei Jahre
   nach Ende der Betreuung**, angelehnt an die Regelverjährung (§§195, 199
   BGB) — der Zeitraum, in dem noch Ansprüche aus dem Vertrag entstehen können.
   Rechnungen und Buchungsbelege laufen davon getrennt auf der Steuerfrist
   (B4 Punkt 4). Rücknahme `klein`, solange Punkt 2 steht.
4. **Rechtsgrundlage:** für Gesundheitsdaten im Training **Einwilligung nach
   Art. 9 Abs. 2 lit. a DSGVO** mit Widerruf, für Vertrags- und
   Abrechnungsdaten Art. 6 Abs. 1 lit. b. **Nicht** lit. h — der trägt die
   Heilbehandlung, und Training ist keine. Rücknahme `mittel` (ein
   Einwilligungsmodell im Datenmodell).
5. **Zweckbindung:** **kein automatischer Fluss, in keine Richtung.** Aus der
   Akte ins Training nur auf ausdrückliche Einwilligung und als **Kopie mit
   Herkunftsvermerk**, nie als Verweis. Vom Training in die Akte gar nicht,
   solange keine Heilbehandlung läuft. Weil es nur **ein** Unternehmen und eine
   `organization_id` gibt, muss diese Trennung **technisch** entstehen — eigene
   Tabellen, eigene Rollenprüfung, eigene Policies nach ADR-004; an zwei
   Betrieben kann sie sich nicht mehr festmachen. Rücknahme **`groß`** — der
   Aufwand war bei der Entscheidung benannt (§15.1 Punkt 4). Dieser Punkt geht
   ausdrücklich mit an die Datenschutzberatung (B2).
6. **Berufsrecht Ernährung:** **vorerst nicht anbieten.** Ernährungsberatung ist
   nicht Teil der Ausbildung nach dem Masseur- und Physiotherapeutengesetz; die
   Abgrenzung zwischen zulässiger allgemeiner Information und beratender
   Tätigkeit ist heikel und wettbewerbsrechtlich angreifbar. Wollte die Praxis
   es anbieten, wäre das eine eigene Qualifikation plus eine Frage an den
   Berufsverband — keine Softwarefrage. Rücknahme `klein`, es wird nichts
   gebaut.

**Weiterhin offen:** die steuerliche Validierung (mit B4) und die
datenschutzrechtliche Bestätigung, insbesondere von Punkt 4 und Punkt 5 (mit
B2).

**Dazugekommen am 2026-09-20 (mit B2):** Darf das **Praxismanagement/Office**
die Screening- und Gesundheitsangaben des Trainings lesen? Für die
Behandlungsakte ist das seit E15 bejaht (§4.3, Need-to-know-Bewertung offen);
für das Training ist es **vorerst verneint** — Office sieht dort nur
Organisatorisches (Termin, Vertragsstatus, erbrachte Leistung, Rechnung,
Zahlung), `PROJECT_PRINCIPLES.md` §4.8 seit Version 0.13. Gewählt ist die
restriktive Seite nach §16, weil die Angaben auf einer **Einwilligung** ruhen
(Punkt 4) und nicht auf lit. h; eine Öffnung wäre eine Zweckerweiterung. Zu
bestätigen ist, ob das so bleibt oder ob die Abrechnung sie fallweise braucht.
Rücknahme `klein` in der Software (eine Policy, eine Korrekturversion an
Rang 1), aber nicht rückwirkend in der Bewertung.

**Blockiert:** Etappe 8 vollständig und das Datenmodell der Betreuungsepisode
(`IDEA-LZK-002`, `IDEA-LZK-003`, `IDEA-LZK-008`); die automatische
Klassifizierung aus `IDEA-LZK-007`; jede Funktion für Kund:innen ohne
Heilbehandlung (Stufe 3). **Nicht blockiert:** die Empfehlung der Therapeutin
zum Verordnungsende als Teil der Verordnung (VER-001); die
Umsatzsteuer-Felder je Katalogposition, die ADR-009 Punkt 6 ohnehin verlangt.

**Annahmen:** ANN-002 (`inactive` ist kein Behandlungsabschluss), ANN-014
(Empfehlung zum Verordnungsende), ANN-032 („Abschluss der Versorgung" als
Fristanker).

## B10 — Automatisierte Progression: MDR-Grenze und Verantwortung

Anfrage an die regulatorische Prüfung, gemeinsam mit B1. Stand und Fälligkeit: `OPEN_DECISIONS.md`, Punkt B10.

| | |
|---|---|
| Dringlichkeit | P2 — vor dem ersten Progressionsfeature |
| Bezug | §6, §7.1, §16, §17; ADR-005, ADR-006 |

**Frage:** Darf die Plattform die Belastung eines Trainingsplans selbsttätig
anpassen — und wenn ja, unter welchen Bedingungen?

**Warum offen:** ADR-006 Punkt 4 schließt für V1 Therapieempfehlungen und
automatisierte klinische Entscheidungen aus; Punkt 2 erlaubt transparente
Berechnungen validierter Instrumente. Eine Progressionsregel liegt dazwischen:
Reicht die Freigabe des Regelwerks je Plan durch die Therapeutin, oder braucht
jeder Schritt eine Bestätigung? Ist ein Ampelmodell mit therapeutisch gesetzten
Schwellen eine eigene Risikoklassifikation? Gilt für die Weiterbetreuung (B9)
ein anderer Maßstab?

**Vorläufig entschieden am 2026-09-08 durch Jannes: für V1 ausgeschlossen.**
Ein Regelwerk je Plan wird von der Therapeutin freigegeben, und **jeder
einzelne Progressionsschritt braucht ihre Bestätigung**, bevor er beim
Patienten ankommt. Damit bleibt die Anwendung auf der Seite von ADR-006 Punkt 2
(transparente Berechnung) und verletzt Punkt 4 nicht.

**Ein Ampelmodell wird auch mit therapeutisch gesetzten Schwellen nicht
gebaut** — eine Ampel *ist* eine Risikoklassifikation, unabhängig davon, woher
die Schwellen kommen; §17 schließt das für V1 aus. Diese Frage geht
ausdrücklich mit an die B1-Prüfung.

**Rücknahme:** heute `klein` (es wird nichts gebaut). In die andere Richtung
`groß`: ein Feature jenseits der Grenze ist `MDR_REVIEW_REQUIRED`, produktiv
gesperrt und braucht eine eigene Prüfung.

**Blockiert:** Etappe 9 vollständig. Bis zur Entscheidung ist jedes solche
Feature `MDR_REVIEW_REQUIRED` und produktiv nicht erreichbar. Die Frage gehört
an die externe Prüfung aus B1, nicht in einen Loop. Ausarbeitung:
`docs/product/ideen/01-trainingsplaene-und-progression.md` (nicht normativ).

## B11 — Paketpreise, Vorauszahlung und Anreize

Anfrage an die Steuerberatung, gemeinsam mit B4. Stand und Fälligkeit: `OPEN_DECISIONS.md`, Punkt B11.

| | |
|---|---|
| Dringlichkeit | P2 — vor dem ersten Paket- oder Rabattfeature |
| Bezug | §19; ADR-009, B4, B9 |

**Frage:** Wie werden vorausbezahlte Betreuungspakete abgebildet, und welche
Rabatt- und Anreizformen sind zulässig?

**Warum offen:** Ein Paket ist eine Vorauszahlung auf noch nicht erbrachte
Leistungen — ein Vorgang, den ADR-009 nicht kennt: Guthabenführung gegen
Leistungen, Steuerzeitpunkt bei Vereinnahmung, keine gemischten Pakete aus
befreiter und steuerpflichtiger Leistung, Laufzeit und Verfall, Rückfall in die
Heilbehandlung, GoBD für das Guthabenkonto, Preisversionierung. Zum
Bewertungsanreiz (Rabatt für eine Google-Bewertung) steht die Einordnung in
`IDEA-ANG-002` mit dem Ergebnis, davon abzuraten — eine Empfehlung, keine
Entscheidung; wenn er trotzdem kommen soll, vorher wettbewerbs- und
heilmittelwerberechtliche Beratung.

**Vorläufig entschieden am 2026-09-08 durch Jannes — zwei getrennte Antworten:**

- **Pakete: vorerst nicht anbieten**, bis B4 zurück ist. Eine Vorauszahlung ist
  kein Preismodell, sondern ein **Guthabenkonto**: Steuerentstehung bereits bei
  Vereinnahmung (§13 Abs. 1 Nr. 1 lit. a Satz 4 UStG), GoBD-Pflichten für das
  Guthaben, Verfall und Laufzeit, keine gemischten Pakete aus befreiter und
  steuerpflichtiger Leistung. Das ist Buchhaltungsmechanik, die ADR-009 nicht
  kennt — teuer nachzurüsten, wenn man sie falsch anfängt.
- **Rabatt für eine Google-Bewertung: nein.** `IDEA-ANG-002` rät bereits ab.
  Gekaufte Bewertungen sind wettbewerbsrechtlich angreifbar (UWG), im
  Heilbereich kommt das HWG dazu, und eine bezahlte Bewertung ist ihr Geld
  nicht wert. Falls doch gewünscht: vorher anwaltlich prüfen lassen, nicht als
  Annahme.

**Rücknahme:** `klein`, es wird nichts gebaut.

**Blockiert:** Paketverkauf, Guthaben, Rabattlogik, Preisdarstellung im Portal.
**Nicht blockiert:** die reguläre Einzelleistungsabrechnung nach ADR-009.

## C6 — AI Privacy Gateway: Schutzumfang und Provider

Anfrage zur KI-Anbindung, Etappe 10. Stand und Fälligkeit: `OPEN_DECISIONS.md`, Punkt C6.

| | |
|---|---|
| Dringlichkeit | P1 für das erste KI-Feature (Etappe 10) |
| Bezug | §6.1; ADR-005 |

**Frage:** Welchen Schutz leistet Pseudonymisierung bei klinischem Freitext,
dessen Inhalt die Person identifiziert — und welche vertraglichen Zusagen
(keine Nutzung zu Trainingszwecken, EU-Verarbeitung, kurze Aufbewahrung,
§203-Verpflichtung) treten an ihre Stelle? Welcher Anbieter, welches Modell?

**Warum offen:** ADR-005 hat den Zeitpunkt entschieden (Gateway ab dem ersten
Feature, kein direkter Provideraufruf), nicht den Schutzumfang. Die
Produktionshypothese in `PRODUCT_VISION.md` §6 ist eine Arbeitshypothese.

**Vorläufig entschieden am 2026-09-08 durch Jannes — der Schutzumfang, nicht
der Anbieter.**

**Pseudonymisierung ist bei klinischem Freitext kein wirksamer Schutz.** Ein
Befundtext identifiziert die Person über den Inhalt — Diagnose, Beruf,
Wohnsituation, Verlauf — auch ohne Namen. Die Last tragen deshalb die
**Vertragszusagen**. Ein Anbieter kommt nur in Frage, wenn **alle fünf**
vorliegen:

- Verarbeitung ausschließlich in der EU,
- **keine Nutzung der Eingaben zu Trainingszwecken**, vertraglich zugesichert,
- keine oder sehr kurze Aufbewahrung („zero retention"),
- Auftragsverarbeitungsvertrag nach Art. 28 DSGVO,
- Verpflichtung der Beschäftigten des Anbieters nach §203 StGB.

**Weiterhin offen: der Anbieter.** Die Auswahl kommt mit Etappe 10 und läuft
durch die Prüfung nach ADR-002. Rücknahme heute `klein`, weil nichts
angebunden ist.

**Blockiert:** Etappe 10. Die Freischaltung eines Providers löst die Prüfung
nach ADR-002 und eine DSFA-Wiedervorlage aus (ADR-007).

## E2 — Ausfallkonzept

Vorlage für das Ausfallkonzept der Praxis. Stand und Fälligkeit: `OPEN_DECISIONS.md`, Punkt E2.

| | |
|---|---|
| Dringlichkeit | P1 vor Go-live |
| Bezug | §16; ADR-012 Punkte 8 und 9 |

**Frage:** Was macht die Praxis, wenn die Anwendung einen Tag steht —
exportierter Tagesplan, Papier-Fallback, Erreichbarkeit der Patient:innen?

**Warum offen:** ADR-012 verlangt ein dokumentiertes Degraded-Verfahren und
dass Kerninformationen des Arbeitstags auch bei einem mehrstündigen Ausfall
verfügbar sind, lässt den Inhalt aber offen. Das ist ein Praxisprozess mit
einer Minimalfunktion der Software (Tagesplan druck- und exportierbar).

**Seit dem 2026-09-06 zusätzlich:** Weil es kein Altsystem gibt, ist dieser
Papierprozess auch der Rückfallplan der Eröffnung (Roadmap H4) — Tagesplan mit
Adressen und Telefonnummern, Dokumentation auf Papier mit Nachtrag, Rechnung
von Hand mit fortlaufender Nummer.

**Vorläufig entschieden am 2026-09-08 durch Jannes — der Kern in drei Sätzen:**

1. **Der Tagesplan liegt jeden Morgen auf Papier oder als PDF auf dem Telefon**,
   mit Adressen und Telefonnummern. Die Druckansicht dafür existiert seit
   UI-000 — das ist die einzige Stelle, an der die Software etwas beitragen
   muss.
2. **Dokumentation auf Papier, Nachtrag binnen 24 Stunden** nach ADR-016 mit
   Begründung „Ausfall". Kein Warten bis zur Wiederherstellung.
3. **Rechnungen ruhen.** **Keine** handschriftliche Rechnung aus dem
   Nummernkreis, solange die Software steht; sie werden nachgeholt. Eine von
   Hand vergebene Nummer, die das System nicht kennt, reißt genau die Lücke,
   die §14 UStG nicht haben will — eine Behandlung lässt sich
   nachdokumentieren, eine Nummernlücke nicht heilen.

Punkt 3 **weicht vom bisherigen Rückfallplan ab** (Roadmap H4: „Rechnung von
Hand mit fortlaufender Nummer aus dem Nummernkreis"); H4 ist entsprechend
nachgezogen.

**Abbruchkriterien** (wann der Papierprozess endet und abgesagt wird):
Datenverlust, eine Falschzuordnung, oder mehr als ein Tag Ausfall.

**Weiterhin offen:** die Ausarbeitung als Betriebsdokument (Januar 2027, mit
Claude) und die Funktion „Tagesplan exportierbar" (Roadmap, Dezember).

**Blockiert:** Go-live-Abnahme (Roadmap G10, G18).
