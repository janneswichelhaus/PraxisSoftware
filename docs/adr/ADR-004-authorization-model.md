# ADR-004: Berechtigungsmodell

## Status

**Angenommen** (2026-08-28).

**Fassung 2 (2026-09-13)** — der Projektinhaber hat am 2026-09-13 entschieden
(E15 in `docs/decisions/OPEN_DECISIONS.md`), dass Office alle klinischen
Inhalte lesen darf, die Therapeut:innen sehen. Das **kehrt Punkt 3 um** und
fasst Punkt 4 neu; alle übrigen Punkte gelten unverändert. Die Umkehr ist
hier ausdrücklich als solche benannt (Fassungsregel in `docs/adr/README.md`);
`PROJECT_PRINCIPLES.md` §4.3/§4.4 sind mit Version 0.10 nachgezogen (§21).
Umgesetzt ist der neue Rollenschnitt mit ROL-EPIC-001 (PR #41).

## Datum

2026-08-28 · Fassung 2: 2026-09-13

## Kontext

§4 von `PROJECT_PRINCIPLES.md` beschreibt sechs Rollen mit deutlich
unterschiedlichen Sichten auf dieselben Daten. Zwei Festlegungen prägen das
Modell besonders:

§4.2 erlaubt allen Therapeut:innen der Praxis grundsätzlich den Zugriff auf
alle Patientenakten. Das ist eine bewusste Produktentscheidung zugunsten von
Vertretung, fachlichem Austausch und kurzfristigen Einsatzänderungen. Sie
entfernt zugleich die naheliegendste technische Schutzmaßnahme, die
Beschränkung auf eigene Patienten. Was bleibt, ist Nachvollziehbarkeit.

§4.3 und §4.4 verlangen eine feinere Trennung: Das Office sieht denselben
Termin wie die Therapeutin, aber nicht denselben Inhalt. Der Behandlungsnachweis
nach §4.4 ist eine eigene, datensparsame Sicht für organisatorische
Streitfälle.

§12 nennt Authentifizierung, Benutzerberechtigungen, die Trennung zwischen
Patientenaccounts, Dokumentationszuordnung, Dateizugriffe und KI-Datenflüsse
als besonders kritisch und testpflichtig. §13 verlangt, dass ein Fehler
niemals unbemerkt Daten anderer Patienten offenlegt oder Zugriffsrechte
erweitert.

Diese Entscheidung war als Punkt A4 in `docs/decisions/OPEN_DECISIONS.md`
als P0 offen.

## Entscheidung

1. **Ein Benutzer kann mehrere Rollen besitzen.**
2. **Alle Therapeut:innen einer Organisation dürfen grundsätzlich alle
   Patientenakten dieser Organisation einsehen.**
3. **Office hat lesenden Zugriff auf alle klinischen Inhalte einer
   Patientenakte im selben Umfang wie Therapeut:innen** — Diagnose und
   Verordnung einschließlich Scan, Behandlungsdokumentation mit Verlauf,
   Befunde, patientenbezogene Nachrichten. Office schreibt keine klinische
   Dokumentation. Jeder Zugriff ist auditpflichtig wie bei Therapeut:innen
   (Punkt 7, ADR-010). *(Fassung 2, E15. Fassung 1 lautete: „Office hat
   standardmäßig keinen Zugriff auf klinische Freitexte." — aufgehoben.)*
4. Für Rechnung und organisatorische Streitfälle bleibt ein **datensparsamer
   Behandlungsnachweis** als eigene Sicht ohne klinischen Inhalt bestehen.
   *(Fassung 2: Er ist keine Zugriffsgrenze mehr, sondern die Sicht, die
   außerhalb der Praxis gezeigt werden kann.)*
5. Ein **zentraler Policy-/Authorization-Layer** wird mit **Datenbank-RLS als
   Defense-in-Depth** kombiniert.
6. **Suche, Dateien, Exporte und spätere KI-/RAG-Funktionen müssen dieselben
   Berechtigungsregeln respektieren.**
7. **Audit-Logging relevanter Zugriffe und sicherheitsrelevanter Aktionen ist
   verpflichtend.**
8. Die **technische Administratorrolle wird von den normalen Praxisrollen
   getrennt**.

## Konsequenzen

- Rollen sind eine n:m-Zuordnung zu Benutzern. Die effektive Berechtigung
  ergibt sich aus der Vereinigung der Rollen, nicht aus einer einzelnen
  Hauptrolle. Das bildet die Realität ab, in der eine Person zugleich
  Inhaberin, Therapeutin und Teamleitung ist, und es passt zu §4.5, wonach
  Teamleitung die Therapeutenrechte plus definierte Zusatzrechte erhält.
- Autorisierung wird ein eigener, benannter und testbarer Baustein. Eine
  zentrale Stelle entscheidet, Fachmodule fragen nur an. Erst dadurch wird
  §12 („Benutzerberechtigungen brauchen Tests") überhaupt einlösbar; verteilte
  Einzelprüfungen sind nicht vollständig prüfbar.
- Datenbank-RLS als zweite Verteidigungslinie bedeutet, dass Datenbankzugriffe
  den handelnden Benutzerkontext mitführen müssen. Zugriffe unter einer
  allmächtigen technischen Kennung sind damit nicht vereinbar; das betrifft
  auch Hintergrundjobs, Reports und Datenmigrationen, die einen expliziten
  Kontext benötigen.
- Antworten der Anwendung sind rollenabhängige Projektionen. Es dürfen keine
  vollständigen Datensätze ausgeliefert und clientseitig ausgeblendet werden —
  das wäre nach §13 eine Offenlegung.
- Der Behandlungsnachweis ist folgerichtig eine eigene Sicht mit eigenem
  Datenumfang, kein gefilterter Auszug der klinischen Dokumentation.
- **Fassung 2:** Mit dem Lesezugriff des Office entfällt die Need-to-know-
  Trennung zwischen organisatorischer und klinischer Sicht innerhalb der
  Praxis. Das Auditlog (ADR-010) ist damit auch für Office die tragende
  Kompensation — jeder lesende Zugriff auf Dokumentation, Verordnung, Scan
  und Nachrichten wird wie bei Therapeut:innen protokolliert. Die
  datenschutzrechtliche Bewertung (Need-to-know, DSFA nach ADR-007) gehört in
  die Anfrage B2. Technisch betrifft die Umkehr die Policy-Funktionen
  `app.can_read_prescriptions()`, `app.can_read_treatment_evidence()`, die
  Projektionen `list_patient_treatment_*`, `list_patient_prescription_*`, die
  Dokumentart als Rollenschnitt in ADR-017 Punkt 12 und die Office-Sicht der
  Patientenkommunikation — gesammelt in ROL-EPIC-001.
- Suchindex, Dateiablage, Exporte und spätere Embedding-/RAG-Speicher sind
  Kopien beziehungsweise Sichten auf geschützte Daten. Sie sind der
  wahrscheinlichste Umgehungsweg des Modells und unterliegen deshalb
  ausdrücklich denselben Regeln.
- Das Audit-Log ist die tragende Kompensation für die Offenheit aus §4.2. Es
  ist damit sicherheitskritisch und nicht optional. Es enthält seinerseits
  sensible Information (wer hat wessen Akte gesehen) und ist entsprechend zu
  schützen.
- Die Trennung der technischen Administratorrolle bedeutet, dass Alltagskonten
  — auch das der Praxisinhaberin — nicht zur Plattformadministration
  eskalieren können. §4.1 verschob dies auf „perspektivisch"; die Trennung
  wird stattdessen von Beginn an vorgesehen.
- Das Modell erzeugt spürbaren Mehraufwand pro Feature: jeder neue Endpunkt,
  Report und Export braucht eine bewusste Berechtigungsentscheidung. Das ist
  nach §16 hingenommen.

## Bewusst nicht Bestandteil dieser Entscheidung

- Die Wahl eines Identity-Providers, Auth-Frameworks oder
  Session-Verfahrens. §3.4 bleibt maßgeblich: nichts davon wird selbst
  entwickelt.
- Die vollständige Rechtematrix je Rolle und Ressource.
- Umfang, Aufbewahrungsdauer, Leseberechtigung und Auswertung des Audit-Logs
  (C4 — beantwortet mit ADR-010; Leseberechtigung mit ADR-010 Fassung 2).
- Ein Break-Glass- beziehungsweise Notfallzugriffskonzept (C3 — beantwortet
  mit ADR-010: kein klinischer Break Glass in V1).
- ~~Der fallbezogene, zeitlich begrenzte und protokollierte Zugriff auf
  vollständige klinische Dokumentation nach §4.4.~~ Mit Fassung 2 entfallen
  (E15).
- Die Einordnung von Leistungsziffern als organisatorische oder klinische
  Daten (C1 — entschieden 2026-09-05, `PROJECT_PRINCIPLES.md` 0.4 §4.4; durch
  E15 überholt).
- Die Klassifikation klinischer Inhalte in der Patientenkommunikation
  (C2 — entschieden 2026-09-05, §10; die Ausnahme für Office ist durch E15
  gegenstandslos).
- Patientenidentität, Identitätsprüfung und Vertretungsvollmachten
  (B5 — Rahmen vorläufig entschieden 2026-09-08, Verfahren offen).
- Die organisatorische Besetzung der Administratorrolle.

## Offene Folgefragen

- ~~Welche Felder umfasst der Behandlungsnachweis genau, und wie verhält sich
  das zu den Leistungsangaben auf der Rechnung, die das Office ohnehin sieht
  (C1)?~~ Mit ANN-006 gebaut (DOK-003) und durch E15 überholt: Office sieht
  die Dokumentation vollständig; der Nachweis bleibt Rechnungssicht.
- Was genau gilt als auditpflichtiger Zugriff — Trefferliste, Detailansicht,
  Export, KI-Zusammenfassung? Wie lange wird aufbewahrt, wer darf lesen, und
  wer wertet regelmäßig aus (C4)? *Beantwortet mit ADR-010 (Katalog, drei
  Jahre) und ADR-010 Fassung 2 (Lesepfad); offen bleibt die Auswertung
  (monatlicher Report, OPS-005).*
- Wie wird technisch verhindert, dass ein neuer Endpunkt, ein Job oder ein
  Report den Policy-Layer umgeht?
- Wie wird das Berechtigungsmodell getestet, und welche Testarten sind
  verpflichtend (§12)?
- Wie wird die Administratorrolle betrieblich besetzt und abgesichert, solange
  nur eine Person das System betreibt (E1, E4)?
- Wie werden Berechtigungsänderungen selbst protokolliert und geprüft?
- Wie wirkt sich der Offline-Modus aus ADR-001 auf Audit und Durchsetzung aus?

## Änderungshistorie

| Fassung | Datum | Änderung |
|---|---|---|
| 1 | 2026-08-28 | Angenommen. |
| 2 | 2026-09-13 | **Umkehr von Punkt 3** (E15, Projektinhaber): Office liest alle klinischen Inhalte wie Therapeut:innen; Punkt 4 neu gefasst (Behandlungsnachweis bleibt als Rechnungssicht, keine Zugriffsgrenze); Konsequenz zur Kompensation durch das Auditlog ergänzt; Erledigungsvermerke zu C1–C4, B5. Punkte 1, 2, 5–8 unverändert. Umsetzung ROL-EPIC-001. |
