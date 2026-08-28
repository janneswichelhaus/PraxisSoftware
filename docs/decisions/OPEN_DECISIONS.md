# Offene Entscheidungen

Status: **offen** — keine der hier gelisteten Fragen ist entschieden.

Dieses Dokument sammelt die Punkte, die aus dem Architektur-Review von
`PROJECT_PRINCIPLES.md` (Stand: Baseline-Commit) hervorgegangen sind. Es
**trifft keine Entscheidungen** und ändert `PROJECT_PRINCIPLES.md` nicht. Es
hält nur fest, was offen ist, warum es offen ist und was davon abhängt.

## Wie dieses Dokument benutzt wird

1. Ein Punkt wird besprochen und entschieden.
2. Die Entscheidung wird als ADR unter `docs/adr/` festgehalten
   (siehe `docs/adr/README.md`).
3. Der Punkt wird hier auf `entschieden` gesetzt und verweist auf das ADR.
4. Wenn die Entscheidung `PROJECT_PRINCIPLES.md` betrifft, wird das Dokument
   in einem eigenen Commit nachgezogen.

Die Spalte **Blockiert** sagt, was ohne diese Entscheidung nicht sinnvoll
begonnen werden kann.

Legende Dringlichkeit:

- **P0** — muss vor dem technischen Setup entschieden sein
- **P1** — muss vor dem ersten fachlichen Datenmodell entschieden sein
- **P2** — muss vor dem betreffenden Feature entschieden sein

---

## A. Architektur-Grundentscheidungen

Diese vier legen die Architektur fest und sind später nur mit erheblichem
Umbau korrigierbar.

### A1 — Offline-Fähigkeit der mobilen Anwendung

| | |
|---|---|
| Dringlichkeit | P0 |
| Bezug | §2.2, §13, §16 |
| Status | offen |

**Frage:** Online-only, offline-fähig oder Mischform (z. B. Lesen der heutigen
Tour offline, Schreiben als lokale Queue)?

**Warum offen:** Das Dokument nennt „Mobile First" und Hausbesuche als
Kernszenario, erwähnt Offline-Betrieb aber an keiner Stelle. Funklöcher in
Wohnungen sind der Regelfall, nicht die Ausnahme.

**Blockiert:** kompletter Client-Stack; bei Offline zusätzlich
Geräteverschlüsselung, Geräte-PIN-/Biometriepflicht, BYOD-Regelung,
Remote-Wipe-Konzept und eine Konfliktauflösung, die §13 erfüllt (additiver
Merge statt last-write-wins).

---

### A2 — Hosting, Datenstandort und Providerauswahl (inkl. §203 StGB)

| | |
|---|---|
| Dringlichkeit | P0 |
| Bezug | §2.1, §3, §3.4 |
| Status | offen |

**Frage:** Welche Anbieter für Hosting, Datenbank, Objektspeicher, Mailversand,
Kartendienst, KI und Error-Tracking? EU-Verarbeitung verpflichtend?
Verschlüsselung at rest und Key-Management durch wen?

**Warum offen:** Das Dokument enthält keinerlei Aussage zu Hosting oder
Datenstandort. Physiotherapeut:innen sind Berufsgeheimnisträger nach
§203 Abs. 1 Nr. 1 StGB; die Einbindung externer Dienstleister ist nach
§203 Abs. 3 StGB möglich, erfordert aber deren vertragliche Verpflichtung zur
Geheimhaltung zusätzlich zum AVV. Anbieter, die das nicht anbieten, scheiden
faktisch aus.

**Blockiert:** gesamte Infrastrukturauswahl. Teilentscheidung mit eigener
Fallhöhe: **Error-Tracking** (Stacktraces enthalten regelmäßig Patientendaten)
— derzeit im Dokument nicht adressiert.

---

### A3 — Mandantenfähigkeit: jetzt vorbereiten oder bewusst verzichten

| | |
|---|---|
| Dringlichkeit | P0 |
| Bezug | §1, §11, §14 |
| Status | offen |

**Frage:** Werden `organization_id` / `location_id` und eine
RLS-fähige Datenbank ab der ersten Migration eingeplant — oder wird bewusst
single-tenant gebaut?

**Warum offen:** §1 („Vermarktung architektonisch nicht ausschließen") und §14
(„mehrere Standorte nicht verhindern") stehen gegen §11 („nicht ohne Auftrag
vorbauen"). Ohne Entscheidung fällt sie implizit im ersten Schema-Entwurf.

**Blockiert:** erste Migration; nachträgliches Einziehen betrifft jede Query
und jede Policy.

---

### A4 — Ort und Granularität der Autorisierung

| | |
|---|---|
| Dringlichkeit | P0 |
| Bezug | §4.2, §4.3, §4.4, §12 |
| Status | offen |

**Frage:** Ein zentraler Policy-Layer plus Datenbank-RLS als
Defense-in-Depth, oder Prüfungen im Anwendungscode? Rollen als
Mehrfachzuweisung oder eine Rolle pro Nutzer? Wie werden Suche/Volltextindex
und ein späterer Vektorstore an dieselben Regeln gebunden?

**Warum offen:** §4.3/§4.4 verlangen feld- und zweckbezogene Filterung
(Office sieht denselben Termin, aber nicht denselben Inhalt). Das schließt
APIs aus, die vollständige Entities zurückgeben — rollenabhängige
Projektionen sind ab dem ersten Endpoint nötig. Ein Suchindex oder
Embedding-Store ist eine Kopie klinischer Daten außerhalb des
Berechtigungsmodells.

**Blockiert:** API-Design, Testbarkeit der Berechtigungen nach §12.

---

## B. Fehlende Themen mit regulatorischem Bezug

### B1 — Abgrenzung MDR und EU AI Act

| | |
|---|---|
| Dringlichkeit | P0 |
| Bezug | §6, §7.1 |
| Status | offen |

**Frage:** Wo verläuft die Grenze zwischen zulässiger Hervorhebung und
entscheidungsunterstützender Funktion? Gilt „ausdrücklich kein Medizinprodukt"
als bindende Produktrestriktion?

**Warum offen:** MDR und AI Act kommen im Dokument nicht vor. Die Red-Flag-
Regel aus §7.1 und „mögliche Auffälligkeiten markieren" aus §6 berühren die
Frage der Entscheidungsunterstützung (MDCG 2019-11). Formulierung und
UI-Darstellung sind Teil der Abgrenzung.

**Blockiert:** Design der Regel-Engine und aller KI-Ausgaben im klinischen
Kontext. Eine Nicht-Medizinprodukt-Festlegung ist eine architektonische
Einschränkung, die bestimmte Features verbietet.

---

### B2 — Datenschutz-Folgenabschätzung, Art. 30, TOM, DSB, Meldeprozess

| | |
|---|---|
| Dringlichkeit | P0 |
| Bezug | §3 |
| Status | offen |

**Frage:** Ist eine DSFA nach Art. 35 DSGVO erforderlich (sehr wahrscheinlich
ja)? Wird ein Datenschutzbeauftragter benötigt? Wer erstellt Verzeichnis der
Verarbeitungstätigkeiten und TOM-Dokumentation? Wie sieht der Meldeprozess
nach Art. 33/34 aus?

**Warum offen:** Im Dokument nicht erwähnt. Das Ergebnis einer DSFA schränkt
die Architektur ein — sie nach dem Setup zu erstellen bedeutet, sie an das
bereits Gebaute anzupassen.

**Blockiert:** sinnvoll: das gesamte Setup. Praktisch der einzige Punkt, für
den externe Beratung vor dem Setup empfohlen wird.

---

### B3 — Aufbewahrungsfristen und Löschkonzept

| | |
|---|---|
| Dringlichkeit | P1 |
| Bezug | §5, §13 |
| Status | offen |

**Frage:** Welche Aufbewahrungsfrist gilt je Datenart, und wie wird gelöscht?

**Warum offen:** Das Dokument regelt Nachvollziehbarkeit und Datenverlust,
enthält aber kein Wort zu Löschung. Zu klären sind mindestens:
Patientenakte (§630f BGB, 10 Jahre), Rechnungen und Belege (§147 AO,
§257 HGB), Termine, Kommunikation, Tourendaten und Zugriffslogs (keine
gesetzliche Frist — Fristen müssen definiert werden, sonst fehlt die
rechtmäßige Speicherdauer), Verhältnis zu Art. 17 DSGVO sowie der Umgang mit
gelöschten Daten in Backups.

**Blockiert:** Pflichtfelder im Kern-Schema; nachträglich schwer einzuziehen.

---

### B4 — Abrechnungsmodell

| | |
|---|---|
| Dringlichkeit | P1 |
| Bezug | §1, §4.3 |
| Status | offen |

**Frage:** Selbst abrechnen oder über Abrechnungsdienstleister/Factoring?

**Warum offen:** „Privatrechnungen" ist eine Zeile im Dokument. Dahinter
stehen mehrere modellbestimmende Teilfragen:

- Bei Factoring ist die Übermittlung der Patientendaten nur mit ausdrücklicher
  Einwilligung zulässig — verändert das Einwilligungs-Datenmodell.
- Rechnungsempfänger ≠ Patient (Beihilfe, PKV, Betreuer, Eltern) muss ab dem
  ersten Rechnungsschema getrennt modelliert sein.
- GoBD: unveränderbare Aufzeichnung, fortlaufende Nummern (§14 UStG),
  Verfahrensdokumentation, Storno statt Korrektur — ein zweites
  Unveränderbarkeitsregime neben §5 mit anderen Regeln.
- Umsatzsteuer: Heilbehandlungen nach §4 Nr. 14a UStG befreit, Prävention,
  Selbstzahler-Training und Online-Coaching unter Umständen nicht — das
  Leistungsmodell braucht ein USt-Kennzeichen.
- Versionierter Leistungskatalog mit Gültigkeitszeiträumen; Preisänderungen
  dürfen alte Rechnungen nicht rückwirkend verändern.

**Blockiert:** Rechnungs-, Leistungs- und Terminschema.

---

### B5 — Patientenidentität, Identitätsprüfung und Vertretung

| | |
|---|---|
| Dringlichkeit | P1 |
| Bezug | §4.6 |
| Status | offen |

**Frage:** Wie authentifizieren sich Patienten, wie wird ihre Identität
geprüft, und wer darf in ihrem Namen handeln?

**Warum offen:** §4.6 setzt „ein Patient = ein Account" voraus. In der
mobilen Versorgung sind Betreuer, Bevollmächtigte, Angehörige und Eltern
Minderjähriger der Regelfall. Offen sind außerdem: Identitätssicherheit vor
Akteneinsicht (§630g BGB), Zugangsverfahren für hochbetagte Patienten, und ob
der Portalzugang der §630g-Einsicht entspricht — und wenn ja, welche Teile
der Akte sichtbar sind.

**Blockiert:** Identitäts- und Patientenstammdatenmodell, Portal-Design.

---

### B6 — Beschäftigtendaten: Tourendaten und Leistungskontrolle

| | |
|---|---|
| Dringlichkeit | P1 |
| Bezug | §1 (Routenplanung, Arbeitszeit) |
| Status | offen |

**Frage:** Werden Standort-, Touren- und Arbeitszeitdaten für
Leistungsbeurteilung verwendet — ja oder nein?

**Warum offen:** Routenplanung plus Arbeitszeiterfassung erzeugen ein
lückenloses Bewegungs- und Leistungsprofil der Therapeut:innen. §26 BDSG setzt
der Verhaltens- und Leistungskontrolle enge Grenzen. Das Dokument schützt
Patientendaten sehr sorgfältig und lässt Beschäftigtendaten unbehandelt.

**Blockiert:** Datenmodell und Aufbewahrung für Touren- und Zeitdaten; bei
„nein" ist die Begrenzung technisch umzusetzen (Aggregation, Löschfristen,
kein Live-Tracking).

---

### B7 — Übermittlung von Adressdaten an den Kartendienst

| | |
|---|---|
| Dringlichkeit | P2 |
| Bezug | §9 |
| Status | offen |

**Frage:** Werden Klarnamen/Adressen an den Kartendienst gesendet, oder nur
Koordinaten aus einem lokal gepflegten Geocoding-Cache?

**Warum offen:** Eine Patientenadresse an einen Kartenanbieter zu senden
offenbart, dass dort jemand physiotherapeutisch behandelt wird. Das ist eine
Übermittlung besonderer Kategorien personenbezogener Daten und erfordert AVV
sowie §203-Verpflichtung.

**Blockiert:** Routing-Integration.

---

### B8 — Lizenzen für Fragebögen und PROMs

| | |
|---|---|
| Dringlichkeit | P2 |
| Bezug | §7 |
| Status | offen |

**Frage:** Ist die digitale Einbettung des DIGOTOR-Anamnesebogens
(Version 8 / 07-2026) lizenzrechtlich abgedeckt? Wie werden Lizenzen je
Instrument dokumentiert?

**Warum offen:** Viele etablierte PROMs sind urheberrechtlich geschützt und
für die digitale Nutzung lizenzpflichtig.

**Blockiert:** Schema der Instrumentenbibliothek (Lizenz-/Quellenfeld je
Instrument).

---

## C. Widersprüche im Dokument, die aufzulösen sind

Diese Punkte erfordern keine Technologiewahl, sondern eine fachliche Klärung
und anschließend eine Präzisierung von `PROJECT_PRINCIPLES.md`.

| Nr. | Widerspruch | Bezug | Dringlichkeit |
|---|---|---|---|
| C1 | Office soll „erbrachte Leistung" sehen (§4.4), aber keinen medizinischen Inhalt — Leistungsziffern sind selbst klinische Information und stehen ohnehin auf der Rechnung, die Office nach §4.3 sieht. Entweder Leistungsziffern explizit als organisatorische Daten einstufen, oder getrennte Abrechnungsrepräsentation. | §4.3, §4.4 | P1 |
| C2 | „Medizinisch relevante Inhalte der Akte zuordnen" (§10) trifft auf „Office sieht organisatorische Patientenkommunikation" (§4.3). Patienten schreiben klinische Inhalte in organisatorische Threads. Offen: wer klassifiziert wann, und was passiert mit bereits erfolgter Office-Einsicht. | §4.3, §10 | P1 |
| C3 | „Im Zweifel blockieren" (§13) gegen „Patientensicherheit zuerst" (§16). Fail-closed ist für Schreiben und Offenlegen richtig, für Lesen durch die behandelnde Therapeutin am Patienten ein Sicherheitsrisiko. Ein Break-Glass-Konzept (Notfallzugriff mit Begründung, Protokollierung, Nachkontrolle) fehlt vollständig. | §13, §16 | P0 |
| C4 | „Alle Therapeut:innen sehen alle Akten" (§4.2) macht das Audit-Log zur einzigen verbleibenden Schutzmaßnahme, steht aber als schwaches „soll" da. Zu definieren: was als Zugriff zählt (Liste, Suchtreffer, Detailansicht, Export, KI-Zusammenfassung), Aufbewahrung, Leseberechtigung, Manipulationssicherheit — und wer das Log wann auswertet. In einer inhabergeführten Praxis existiert keine echte Funktionstrennung; die kompensierende Maßnahme ist zu benennen. | §4.2, §16 | P0 |
| C5 | „Eine Plattform, möglichst keine Fremd-UIs" (§2.1) gegen „keine eigene Sicherheitsinfrastruktur" (§3.4): Nutzerverwaltung, Key-Rotation, DB-Konsole und Restore laufen zwangsläufig in Provider-Oberflächen. §4.1 verschiebt die Trennung von Admin- und Alltagsrechten auf „perspektivisch" — ob der Alltags-Account zu Plattform-Admin eskalieren kann, entscheidet sich jedoch beim Setup. | §2.1, §3.4, §4.1 | P0 |
| C6 | „Langfristig soll ein AI Privacy Gateway verwendet werden" (§6.1) ist selbstaufhebend: das erste KI-Feature wird sonst daran vorbeigebaut. Zusätzlich offen: Pseudonymisierung schützt Freitext-Dokumentation kaum (der Inhalt identifiziert), der reale Schutz liegt im Vertrag (AVV, §203-Verpflichtung, kein Training auf den Daten, EU-Verarbeitung, kurze Retention). | §6.1 | P1 |
| C7 | §6 (LLM) und §7.1 (deterministische Regel-Engine) stehen unter einem Thema, sind aber verschiedene Systeme mit verschiedener Testbarkeit und Versionierbarkeit. Sprachliche und architektonische Trennung offen. | §6, §7.1 | P1 |
| C8 | „Erweiterungen nicht verhindern" (§14) gegen „nicht ohne Auftrag vorbauen" (§11) — beide jederzeit zitierbar. Aufzulösen in eine konkrete Liste: was jetzt bezahlt wird (vgl. A3, ferner UUID-PKs, Audit-Spalten, Soft-Delete, zeitzonenbewusste Zeitstempel, Decimal für Geldbeträge) und was vertagt wird. | §11, §14 | P0 |

---

## D. Begriffe, die vor der Implementierung zu definieren sind

| Begriff | Bezug | Was fehlt |
|---|---|---|
| „finalisiert" | §5 | Expliziter Abschluss-/Signaturschritt? Frist? Wer darf finalisieren? Kann eine finalisierte Doku je gelöscht werden? |
| „nachvollziehbar" | §5 | Versionierung mit abrufbarem Originalinhalt (wie §630f BGB verlangt) oder nur Änderungs-Log? Zwei verschiedene Datenmodelle. |
| „bestätigt" | §8 | Der Terminstatus-Automat fehlt vollständig (angefragt / vorgemerkt / bestätigt / abgesagt / nicht angetroffen / durchgeführt / dokumentiert / abgerechnet). Er treibt Ausfallhonorar, Behandlungsnachweis und Abrechnung. |
| „auditierbar" | §4.2 | siehe C4 |
| „organisatorische Patientenkommunikation" | §4.3 | siehe C2 |
| „Behandlungsnachweis" | §4.4 | siehe C1 |
| „Praxisinhaber" vs. technischer Admin | §4.1 | siehe C5 |
| „technisch getrennt" | §3.2 | Wie viele Umgebungen? Darf ein Prod-Backup je in Dev restauriert werden? Wer darf deployen? |

**Übergreifend:** Das Dokument mischt bindende Anforderungen und
Absichtserklärungen. „soll", „möglichst", „perspektivisch" und „langfristig"
stehen an sicherheitskritischen Stellen (§4.1, §4.2, §6.1) — also dort, wo
Verbindlichkeit gebraucht wird. Offen: Einführung einer Normativität nach
RFC-2119-Art (MUSS / SOLLTE / KANN) und Zuordnung einer Kontrolle oder eines
Tests zu jedem MUSS, damit §12 überhaupt prüfbar wird.

---

## E. Betriebs- und Prozessentscheidungen

| Nr. | Offener Punkt | Bezug | Dringlichkeit |
|---|---|---|---|
| E1 | **Bus-Faktor 1.** Die Praxis wird täglich von Software abhängen, die eine Person baut und betreibt — nach §16 ein Patientensicherheitsthema. Offen: Mindeststandard für Betreibbarkeit (Infrastruktur als Code, dokumentierter und getesteter Restore, keine undokumentierten manuellen Schritte, Zugangs- und Notfallübergabe). | §16 | P0 |
| E2 | **Ausfallkonzept.** Was macht die Praxis, wenn die Anwendung einen Tag steht (exportierter Tagesplan, Papier-Fallback)? Folgt aus §16, fehlt im Dokument. | §16 | P1 |
| E3 | **Backup.** RPO/RTO, Verschlüsselung, Ablageort, Aufbewahrung — und mindestens ein tatsächlich durchgeführter Restore-Test. §3.4 verbietet nur die Eigenentwicklung, Anforderungen fehlen. | §3.4 | P0 |
| E4 | **Produktionszugriff.** §3.2 fordert individuelle Accounts; bei einem Entwickler ist Funktionstrennung unmöglich. Offen: kompensierende Regel (kein interaktiver Prod-DB-Zugriff im Normalbetrieb, Änderungen nur über Migrationen, Break-Glass mit Protokollierung). | §3.2 | P0 |
| E5 | **Produktions-Logs.** §3.1 nennt Entwicklungslogs, aber Prod-Logs enthalten regelmäßig Patientenbezüge. Offen: PII-Redaction, Retention, Zugriffsbeschränkung — sowie die explizite Regel, dass KI-Entwicklungswerkzeuge (auch Claude Code) niemals Prod-Credentials oder Prod-Daten erhalten. | §3.1 | P0 |
| E6 | **Synthetische Testdaten.** §3.1 verbietet Echtdaten, verlangt aber keinen Generator. Ohne Generator entsteht Druck, doch Echtdaten zu verwenden. | §3.1 | P1 |
| E7 | **CI ab dem ersten Commit** mit definierten Gates: Typecheck, Lint, Tests, Migrationsprüfung, Dependency-Audit, Secret-Scanning (§3.3 ist sonst nur eine Bitte). Dazu Branch Protection auf `main`. | §3.3, §12 | P0 |
| E8 | **Dateiablage.** Belege, Fotos, Patienten-Uploads: Ablageort, Verschlüsselung, Zugriffsregeln, Virenscan bei Patienten-Uploads, signierte URLs mit kurzer Gültigkeit. §12 nennt Dateizugriffe als kritisch, das Dokument regelt sie nirgends. | §12 | P1 |
| E9 | **Dokument-Governance.** `PROJECT_PRINCIPLES.md` hat keine Version, kein Datum und keinen Änderungsprozess. Offen: Versionierung des Dokuments und die Beziehung zwischen Prinzipien und Code — vorgesehenes Bindeglied sind ADRs unter `docs/adr/`. | §11 | P1 |

---

## Vorgeschlagene Reihenfolge

Die Reihenfolge ist ein Vorschlag, keine Entscheidung.

1. **B2** (DSFA-Pflicht, DSB, Verzeichnis/TOM) und **B1** (MDR-/AI-Act-Abgrenzung)
   klären — die einzigen Punkte, für die externe Beratung vor dem Setup
   empfohlen wird.
2. **A1–A4** entscheiden und je als ADR festhalten.
3. **B3** (Löschkonzept) und **B4** (Abrechnungsmodell) entscheiden — beide
   bestimmen Pflichtfelder im Kern-Schema.
4. **C1–C8** fachlich auflösen und `PROJECT_PRINCIPLES.md` in einem eigenen
   Commit nachziehen (inkl. Normativität aus Abschnitt D).
5. **E1, E3, E4, E5, E7** festlegen — Betriebsrahmen.
6. Erst danach technisches Setup.
