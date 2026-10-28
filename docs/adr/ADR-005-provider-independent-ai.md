# ADR-005: Providerunabhängige KI-Anbindung
## Status
Angenommen (2026-08-28), geltend Fassung 2 (2026-09-08, Jannes): Punkt 9 ergänzt.

## Kontext
Wie KI angebunden wird (§6, §6.1). Bewusst nicht Bestandteil: Anbieter und Modell (ausdrücklich
offen), Fremdbezug oder Eigenbetrieb, Pseudonymisierung und Datenminimierung (C6), Featureauswahl,
regulatorische Einordnung (B1, ADR-006), RAG-Speicher (ADR-004), Kosten und Kontingente.

## Entscheidung
1. **Der konkrete KI-Anbieter ist keine Architekturabhängigkeit.**
2. **Die Anwendung muss vollständig ohne aktiven externen KI-Anbieter funktionieren.**
3. **Alle KI-Aufrufe laufen vom ersten KI-Feature an über eine zentrale, providerunabhängige
   AI-Gateway-Schnittstelle.**
4. **Direkte Provideraufrufe aus Fachmodulen sind nicht erlaubt.**
5. **Bis zur Providerentscheidung wird ein Mock Provider verwendet.**
6. **LLM-Funktionen und deterministische klinische oder administrative Berechnungen bleiben
   architektonisch getrennt;** kein Sprachmodell im Ergebnispfad (§6.2), auch nicht mittelbar.
7. **KI-Ergebnisse mit klinischer oder externer Wirkung sind grundsätzlich Entwürfe bis zur
   menschlichen Freigabe.**
8. **Ein Produktionsprovider wird erst nach Datenschutz-, Vertrags- und Security-Prüfung
   freigeschaltet,** dokumentiert nach ADR-002 Punkt 3; mit Zugang zu Patientendaten ist er
   mitwirkende Person (§ 203 StGB).
9. **Die Providerunabhängigkeit gilt auch für Dienste ohne Sprachmodell** (Fassung 2), insbesondere
   Spracherkennung, Diktat und Transkription. Mit Zugang zu Gesundheitsdaten laufen sie über
   denselben Gateway und dieselbe Freischaltung wie ein LLM-Anbieter (Punkte 3, 4, 5, 8 gelten).

## Konsequenzen
- Fachmodule sprechen ein providerneutrales Format; Eigenheiten eines Anbieters schlagen nicht in die
  Fachlogik durch. Der Gateway ist sicherheitskritisch und hat eigene Tests (§12). Ein KI-Vorschlag
  ist erkennbar unfreigegeben, die Freigabe ein eigener, nachvollziehbarer Vorgang (§5).

## Offene Folgefragen
- offen: C6 (OPEN_DECISIONS): Anbieter, Modell, Felder je Zweck, Protokoll, Freigabenachweis.
- offen: E13 (OPEN_DECISIONS): Ort und Frist des Rohaudios; geht es oder nur Text an den Gateway?
- Wie wird technisch verhindert, dass ein Fachmodul den Gateway umgeht?

## Änderungshistorie
- Fassung 1 (2026-08-28): angenommen.
- Fassung 2 (2026-09-08, Jannes): Punkt 9 ergänzt, Anlass die Sprachdokumentation (§6.3).
- Verdichtet 2026-10-27 (Aufräumen 5), Inhalt unverändert; früherer Wortlaut: `git log -p`.
