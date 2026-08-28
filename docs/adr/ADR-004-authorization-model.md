# ADR-004: Berechtigungsmodell

## Status

Angenommen

## Datum

2026-08-28

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
3. **Office hat standardmäßig keinen Zugriff auf klinische Freitexte.**
4. Für organisatorische Streitfälle steht ein **datensparsamer
   Behandlungsnachweis** zur Verfügung.
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
  (offener Punkt C4).
- Ein Break-Glass- beziehungsweise Notfallzugriffskonzept (offener Punkt C3).
- Der fallbezogene, zeitlich begrenzte und protokollierte Zugriff auf
  vollständige klinische Dokumentation nach §4.4.
- Die Einordnung von Leistungsziffern als organisatorische oder klinische
  Daten (offener Punkt C1).
- Die Klassifikation klinischer Inhalte in der Patientenkommunikation
  (offener Punkt C2).
- Patientenidentität, Identitätsprüfung und Vertretungsvollmachten
  (offener Punkt B5).
- Die organisatorische Besetzung der Administratorrolle.

## Offene Folgefragen

- Welche Felder umfasst der Behandlungsnachweis genau, und wie verhält sich
  das zu den Leistungsangaben auf der Rechnung, die das Office ohnehin sieht
  (C1)?
- Was genau gilt als auditpflichtiger Zugriff — Trefferliste, Detailansicht,
  Export, KI-Zusammenfassung? Wie lange wird aufbewahrt, wer darf lesen, und
  wer wertet regelmäßig aus (C4)?
- Wie wird technisch verhindert, dass ein neuer Endpunkt, ein Job oder ein
  Report den Policy-Layer umgeht?
- Wie wird das Berechtigungsmodell getestet, und welche Testarten sind
  verpflichtend (§12)?
- Wie wird die Administratorrolle betrieblich besetzt und abgesichert, solange
  nur eine Person das System betreibt (E1, E4)?
- Wie werden Berechtigungsänderungen selbst protokolliert und geprüft?
- Wie wirkt sich der Offline-Modus aus ADR-001 auf Audit und Durchsetzung aus?
