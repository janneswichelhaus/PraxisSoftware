# ADR-005: Providerunabhängige KI-Anbindung

## Status

Angenommen — **Fassung 2** (2026-09-08).

Fassung 2 ergänzt Punkt 9 und beantwortet damit eine der offenen Folgefragen
der Fassung 1. Die Punkte 1 bis 8 sind unverändert; Einzelheiten unten in der
Änderungshistorie.

## Datum

2026-08-28 (Fassung 1); 2026-09-08 (Fassung 2)

## Kontext

§6 von `PROJECT_PRINCIPLES.md` beschreibt KI als Assistenzsystem mit einer
klaren Negativliste: keine autonomen Diagnosen, kein Ausschluss von Red Flags,
keine klinisch relevanten Entscheidungen, keine endgültigen Änderungen an
Patientenakten, kein ungeprüfter Versand folgenreicher Nachrichten.

§6.1 fordert einen zentralen AI-Service beziehungsweise ein Privacy Gateway,
das Berechtigung, Verarbeitungszweck, notwendige Daten, Datenminimierung,
Pseudonymisierung, erlaubtes Modell, Logging und Fehlerbehandlung
kontrolliert — allerdings „langfristig". Diese Formulierung ist praktisch
selbstaufhebend: Wird das erste KI-Feature ohne Gateway gebaut, entsteht ein
direkter Providerzugriff aus einem Fachmodul, der anschließend nicht mehr
zurückgebaut wird.

§7.1 verlangt für Red Flags transparente, definierte Regeln statt erfundener
Scores. Das ist eine deterministische Regel-Engine und kein Sprachmodell —
im Dokument stehen beide unter verwandten Themen und werden leicht vermischt.

Der KI-Markt bewegt sich schneller als diese Anwendung. Eine harte Bindung an
einen Anbieter wäre zugleich ein Datenschutz-, ein Verfügbarkeits- und ein
Kostenrisiko. §12 nennt KI-Datenflüsse ausdrücklich als besonders kritisch.

Diese Entscheidung schließt an ADR-002 an: ein KI-Anbieter mit Zugang zu
Patientendaten ist ein Dienstleister im Sinne jener Prüfpflichten.

## Entscheidung

1. Der **konkrete KI-Anbieter ist keine Architekturabhängigkeit**.
2. Die Anwendung **muss vollständig ohne aktiven externen KI-Anbieter
   funktionieren**.
3. **Alle KI-Aufrufe laufen vom ersten KI-Feature an über eine zentrale,
   providerunabhängige AI-Gateway-Schnittstelle.**
4. **Direkte Provideraufrufe aus Fachmodulen sind nicht erlaubt.**
5. Bis zur Providerentscheidung wird ein **Mock Provider** verwendet.
6. **LLM-Funktionen und deterministische klinische oder administrative
   Berechnungen bleiben architektonisch getrennt.**
7. **KI-Ergebnisse mit klinischer oder externer Wirkung sind grundsätzlich
   Entwürfe bis zur menschlichen Freigabe.**
8. Ein **Produktionsprovider wird erst nach Datenschutz-, Vertrags- und
   Security-Prüfung freigeschaltet**.
9. **Die Providerunabhängigkeit gilt auch für Verarbeitungsdienste, die keine
   Sprachmodelle sind** (Fassung 2) — insbesondere Spracherkennung, Diktat und
   Transkription. Ein solcher Dienst mit Zugang zu Gesundheitsdaten läuft über
   dieselbe Gateway-Schnittstelle und dieselbe Freischaltung wie ein
   LLM-Anbieter; die Punkte 3, 4, 5 und 8 gelten unverändert für ihn. Das
   beantwortet die entsprechende Folgefrage unten.

## Konsequenzen

- Die Anwendung hat keine harte Abhängigkeit zu einem KI-Anbieter. Ausfall,
  Preisänderung oder Wechsel betreffen nur Assistenzfunktionen, nie den
  Kernbetrieb der Praxis. Das ist die direkte Umsetzung von §16, wonach
  korrekte Funktion über zusätzlichen Features steht.
- Es gibt genau eine Stelle, an der Daten die Anwendung Richtung KI verlassen.
  Nur dort lassen sich die Kontrollen aus §6.1 — Berechtigung, Zweckbindung,
  Datenminimierung, Modellwahl, Logging, Fehlerbehandlung — überhaupt
  durchsetzen und nach §12 testen.
- Fachmodule sprechen ein internes, providerneutrales Format. Provider-
  spezifische Eigenheiten liegen hinter der Schnittstelle und dürfen nicht in
  die Fachlogik durchschlagen.
- Der Mock Provider macht KI-Features von Beginn an entwickel- und testbar,
  ohne dass Daten nach außen gehen. Das stützt §3.1, wonach in Entwicklung und
  Test ausschließlich synthetische Daten verwendet werden.
- Die Trennung von LLM und Determinismus bedeutet: Red-Flag-Regeln nach §7.1,
  Rechnungsbeträge, Fristen sowie Termin- und Fahrzeitberechnungen entstehen
  deterministisch, versionierbar und testbar. Ein Sprachmodell steht nicht im
  Ergebnispfad dieser Werte, auch nicht mittelbar.
- Der Entwurfscharakter aller wirksamen KI-Ergebnisse verlangt ein
  Zustandsmodell: ein KI-Vorschlag ist erkennbar unfreigegeben, und die
  menschliche Freigabe wird als eigener, nachvollziehbarer Vorgang
  festgehalten. Das greift in die Versionierung nach §5.
- Die Freischaltung eines Produktionsproviders ist ein eigener dokumentierter
  Vorgang und folgt dem Prüfkatalog aus ADR-002. Ein KI-Anbieter mit Zugang zu
  Patientendaten ist zudem eine mitwirkende Person im Sinne von §203 StGB.
- Die Indirektion kostet Aufwand und verzichtet auf provider-spezifische
  Bequemlichkeiten. Das ist bewusst in Kauf genommen.
- Der Gateway ist selbst sicherheitskritisch — §12 nennt KI-Datenflüsse
  ausdrücklich — und braucht eigene Tests.

## Bewusst nicht Bestandteil dieser Entscheidung

- **Die Auswahl eines KI-Anbieters und eines Modells. Diese Frage bleibt
  ausdrücklich offen.**
- Die Frage, ob Modelle extern bezogen oder selbst betrieben werden.
- Umfang und Verfahren der Pseudonymisierung und Datenminimierung im Gateway
  (berührt den offenen Punkt C6).
- Welche KI-Features gebaut werden und in welcher Reihenfolge.
- Die Abgrenzung zu MDR und EU AI Act (B1 — die MDR-Abgrenzung ist mit ADR-006
  entschieden, die Einordnung nach EU AI Act und die externe Prüfung bleiben
  offen). Dieser ADR regelt die technische Anbindung, nicht die regulatorische
  Einordnung der Funktionen.
- Die Entscheidung über Embedding-/RAG-Speicher als solchen; ihre Bindung an
  das Berechtigungsmodell regelt ADR-004.
- Kosten, Kontingente und Ratenbegrenzung.

## Offene Folgefragen

- Welcher Anbieter, welches Modell, und auf Basis welcher Kriterien?
- Welche Prüfschritte umfasst die Freischaltung genau, und wer gibt sie frei?
- Welche Daten dürfen je Verarbeitungszweck übergeben werden — es braucht eine
  Zuordnung von Zweck zu erlaubten Datenfeldern.
- Wie belastbar ist Pseudonymisierung bei klinischem Freitext, dessen Inhalt
  die Person mittelbar identifiziert, und welche vertraglichen Zusagen
  (keine Nutzung zu Trainingszwecken, Verarbeitungsort, Aufbewahrung beim
  Anbieter) treten an ihre Stelle (C6)?
- Wie werden KI-Aufrufe protokolliert, ohne dass das Protokoll selbst zum
  Datenrisiko wird?
- Wie wird die menschliche Freigabe nachgewiesen, versioniert und im Audit
  sichtbar (§5, ADR-004)?
- Wie wird technisch verhindert, dass ein Fachmodul den Gateway umgeht?
- **Beantwortet mit Fassung 2, Punkt 9:** Gilt die Providerunabhängigkeit auch
  für Nicht-LLM-Funktionen wie Spracherkennung oder Diktat? **Ja.** Offen
  bleibt, welcher Anbieter — das gehört zu C6 und E13.
- Wo liegt Rohaudio einer Sprachaufnahme, wie lange, und geht es überhaupt
  durch den Gateway oder nur der daraus entstandene Text (E13, §18)?

## Änderungshistorie

| Fassung | Datum      | Änderung                                                                                                                                                                                                                                              |
| ------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1       | 2026-08-28 | Erstfassung, angenommen.                                                                                                                                                                                                                              |
| 2       | 2026-09-08 | **Punkt 9 ergänzt:** die Providerunabhängigkeit gilt auch für Nicht-LLM-Verarbeitungsdienste wie Spracherkennung, Diktat und Transkription; die zugehörige offene Folgefrage ist damit beantwortet, eine neue zum Rohaudio kommt hinzu. Anlass: Entscheidung von Jannes zur Sprachdokumentation, verbindlich in `PROJECT_PRINCIPLES.md` §6.3 (Version 0.5). Die Punkte 1 bis 8 sind unverändert. |
