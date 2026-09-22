# ADR-019: Kartendienst — In-App-Karte, Fahrradrouting, Fahrzeiten und Navigations-Handoff

## Status

**Angenommen, Fassung 3** — von Jannes am 2026-09-22 bestätigt.
Die Annahme gilt der Zielarchitektur, dem Kandidaten und dem Gate; **produktiv
freigeschaltet ist damit nichts** — die Freigabe echter Adressen an einen
Anbieter bleibt am Gate aus Punkt 9 (Vertrag, §203, DSFA).

Fassung 3 ändert **einen** Satz der Zielsetzung und fügt **einen** Abschnitt
hinzu. Sie löst Punkt 6 des Kontexts ab („Eine eigene Turn-by-Turn-Engine ist
nicht Ziel") und ergänzt **Abschnitt F — Führung auf dem Gerät**. Alles andere
gilt unverändert weiter: die Zielarchitektur (A), der Anbieter (B), die
Datenflussregeln (C), der Handoff (D) und das Gate (E). Der Handoff entfällt
**nicht**; er bleibt der Weg, solange keine Führung gebaut ist, und der
Rückfallweg, wenn eine Führung nicht zur Verfügung steht.

Anlass war eine Nachfrage von Jannes am 2026-09-22 und ihre Beantwortung: PTV
liefert die Manöverdaten, aber **keine** Führung, die wir als
Auftragsverarbeiter einkaufen könnten (Einzelheiten in Abschnitt F). Wer die
Führung ohnehin selbst baut, baut sie im Browser — und dann muss die Position
das Gerät nie verlassen. Diese Erkenntnis hat die Entscheidung geformt, nicht
umgekehrt: §20 wird dafür nicht aufgeweicht, sondern präzisiert
(`PROJECT_PRINCIPLES.md` 0.14).

Fassung 2 ersetzt die Fassung 1 vom selben Tag (Commit `c5c7b21`) vollständig.
Eine neue ADR-Nummer war nach der Governance nicht nötig: „abgelöst durch
ADR-XXX" gilt für **angenommene** ADRs (`docs/adr/README.md`); Fassung 1 war
vorgeschlagen, nie angenommen, nie auf `main` und von Jannes nicht bestätigt.
Sie bleibt in der Git-Historie nachlesbar. Was an ihr sachlich falsch oder zu
stark war, ist unten im Abschnitt „Korrekturen gegenüber Fassung 1" benannt.

Dieser ADR **schaltet keinen Anbieter produktiv frei.** Er legt die
Zielarchitektur, den bevorzugten Kandidaten für Prototyp und Bewertung und das
Gate fest, das vor Echtdaten zu passieren ist.

## Datum

2026-09-08 (Fassung 2; Fassung 1 vom selben Tag) · angenommen 2026-09-13 ·
**Fassung 3 vom 2026-09-22, angenommen am selben Tag**

## Kontext

§9 verlangt, dass **Routen und Fahrzeiten über einen professionellen
Kartendienst integriert werden** — als MUSS — und verbietet eine eigene
Routing-Engine. Zugleich ordnet §9 den Kartendienst als Dienstleister mit
Zugang zu Patientendaten ein, für den §3.5 vor Freischaltung AVV, Eignung im
Hinblick auf §203 StGB, Verschlüsselung, Zugriffskontrolle, Retention und
Unterauftragnehmer verlangt.

Am 2026-09-08 hat Jannes das Produktziel geschärft: **Convenience hat hohe
Priorität.** Die Annahme aus Fassung 1, die In-App-Karte sei ein verzichtbares
Komfortfeature („Weg B"), ist damit überholt — und sie stand ohnehin quer zu §9,
das Fahrzeiten und Erreichbarkeit als Funktion der ersten Ausbaustufe nennt.
Verbindlich ist jetzt dieses Nutzererlebnis:

1. Therapeut:innen sehen ihre Patient:innen und ihre Tour auf einer
   interaktiven Karte **innerhalb** der Praxissoftware.
2. Routen zwischen Terminen werden innerhalb der Praxissoftware dargestellt.
3. Fahrzeiten erscheinen direkt in Kalender und Tour.
4. Für echte Turn-by-Turn-Navigation genügt **genau eine** bewusste
   Nutzeraktion („Navigation starten").
5. Erst dann öffnet sich eine externe Navigations-App.
6. ~~Eine eigene Turn-by-Turn-Engine ist **nicht** Ziel.~~ **Abgelöst durch
   Fassung 3 (2026-09-22), Abschnitt F.** Eine Führung auf dem Gerät **ist**
   Ziel — unter den Bedingungen aus §20 und erst nach MAP-006. Punkt 4 und 5
   bleiben: Der Handoff in eine externe App ist weiterhin der Weg, solange
   keine Führung gebaut ist, und der Rückfallweg, wenn sie nicht zur
   Verfügung steht.
7. Datenschutz und §203 werden für Convenience nicht umgangen — stattdessen
   wird ein Anbieter gewählt, der die Architektur erfüllt.

Fassung 1 hatte für die In-App-Karte einen Widerspruch zu §3.5 festgestellt:
Google verarbeitet auf der Maps Platform als eigener Verantwortlicher, ein AVV
wird nicht angeboten. Dieser Befund bleibt richtig. Die Folgerung ändert sich:
Nicht die Karte entfällt, sondern der Anbieter wechselt — das war in Fassung 1
„Weg C". Fassung 2 geht diesen Weg.

Die Recherche zu den Anbietern steht mit Belegtiefe in
`docs/decisions/providerpruefung-kartendienst.md`. Wesentliche Einschränkung:
Aus der Cloud-Entwicklungsumgebung waren die Webseiten von PTV, MapTiler,
GraphHopper, HERE, TomTom und weitgehend Google gesperrt; belastbar sind PTVs
offizielle GitHub-Clients und -Tutorials, Apples und Androids
Entwicklerdokumentation und Teile von `cloud.google.com`. Vertragsaussagen
konnten **nicht** verifiziert werden und sind durchgehend als
`CONTRACT_CONFIRMATION_REQUIRED` markiert.

## Entscheidung

### A. Zielarchitektur

1. **Rendering im Browser mit MapLibre GL JS.** Die Kartenkomponente kennt
   nur `MapDisplayConfig` (Style-URL, Attribution, Autorisierungs-Hook), nicht
   den Anbieter. MapLibre ist Open Source und rendert Vektorkacheln jedes
   Anbieters, der das Mapbox-Vector-Tile-Format liefert — das hält die
   Oberfläche vom Kartenanbieter unabhängig.
2. **Marker, Nummern, Beschriftungen und Reihenfolgen entstehen in der
   Anwendung** als eigene Overlays. Der Anbieter liefert Kacheln und sieht
   nichts von dem, was darauf gezeichnet wird.
3. **Ein serverseitiger `LocationProvider`-Adapter** mit genau drei
   Aufrufen: `geocode()`, `calculateRoute()`, `calculateMatrix()`.
   `optimizeRoute()` wird **nicht** angelegt (ADR-014, §11) — die
   Tourenoptimierung ist ein eigenes Epic nach §9 „später KANN".
4. **`NavigationHandoff`** baut auf ausdrückliche Aktion eine URL für die
   Navigations-App des Geräts (Google Maps, Apple Maps oder die
   Systemnavigation) und übergibt nur das Ziel.
5. Der Vertrag steht als reine Typdatei in `src/lib/location/contract.ts`.
   Er ist bewusst klein: keine generische GIS-Abstraktion, nur so viel, dass
   ein Anbieterwechsel die Oberfläche nicht berührt. Ein `mock`-Adapter mit
   festen Antworten macht alles ohne Anbieter entwickel- und testbar (§3.1).
6. **Die drei Datenwege bleiben getrennt betrachtet**, weil sie
   datenschutzrechtlich verschieden liegen: (1) Kacheln aus dem Browser,
   (2) Geocoding/Routing/Matrix vom Server, (3) der Handoff vom Gerät der
   Person. Eine spätere Kombination — Kacheln von MapTiler, Routing von PTV —
   bleibt über `MapDisplayConfig` und `LocationProvider` möglich und wird
   **nicht** vorgebaut.

### B. Anbieter

7. **PTV Developer (PTV Logistics GmbH, Karlsruhe) ist der bevorzugte
   Kandidat für Prototyp und Bewertung** (`preferred candidate for
   prototype/evaluation`). Genutzt werden ausschließlich die **OSM-APIs**:
   Vector Maps OSM, Geocoding OSM, Routing OSM, Matrix Routing OSM. Grund:
   OSM-Daten halten den Datenweg frei von HERE oder TomTom als Datenlieferant;
   die HERE-basierten PTV-APIs werden nicht verwendet.
8. Belegt aus PTVs offiziellen Repositories: Vektorkacheln mit
   MapLibre-Tutorials; Fahrradprofile `OSM_BICYCLE` und `OSM_CARGO_BICYCLE`
   für Routing, Matrix und spätere Optimierung; Antworten mit Distanz,
   Fahrzeit und GeoJSON-Polyline; Schlüssel als Header `ApiKey`. Belegt aus
   Auszügen, nicht aus Dokumenten: Processor-Rolle, EU-Verarbeitung, DPA für
   „PTV Cloud Services", Free Plan nur zum Testen.
9. **PTV ist nicht produktiv freigegeben.** Die Freigabe ist an das
   **Vertrags-/§203-/DSFA-Gate** gebunden — die neun Punkte in Teil 5 des
   Prüfdokuments, darunter DPA-Text mit Nennung von PTV Developer,
   Weisungsbindung, §203-Verpflichtung, Subprozessoren der OSM-APIs, Retention
   und Zweitnutzung, EU-Region, Vertragsmodell, Prüfung der Edge Runtime,
   DSFA-Wiedervorlage. Ein einziger negativer Punkt heißt: Anbieterwechsel
   hinter dem Vertrag, nicht Verzicht auf die Funktion.
10. **Google Maps Platform wird nicht Backend** für Karte, Geocoding, Routing
    oder Fahrzeiten: Controller-Controller-Bedingungen ohne
    Auftragsverarbeitung erfüllen §3.5 nicht, und eine EU-Verarbeitung ist
    nicht belegt. **Google Maps bleibt möglicher Handoff-Zielpunkt** (Teil D).
11. Zweite Wahl, falls das Gate scheitert: **MapTiler** für die Karte
    (EU-Endpunkt auf Paid Plans, Processor-Selbstauskunft, MapLibre-nativ),
    **HERE** für Routing und Matrix — jeweils mit eigener Prüfung nach
    demselben Katalog. **GraphHopper** nur, wenn ein AVV mit abweichender
    Retention und ohne Zweitnutzung schriftlich vorliegt (öffentlich: jede
    Anfrage bis zu fünf Wochen gespeichert und zur Produktverbesserung
    genutzt). **TomTom** nicht als Basis, solange das JavaScript-SDK Public
    Preview ist.

### C. Privacy by Design — Regeln für den produktiven Datenfluss

Diese Regeln sind **Prüfregeln im Review**, keine Gestaltungsempfehlung. Sie
gelten ab MAP-006; die Prototypen halten sie bereits ein, damit nichts
zurückzubauen ist.

12. An den Kartendienst gehen **keine Namen, keine Patienten- oder
    Terminkennungen, keine Diagnosen, keine klinischen Informationen, keine
    Uhrzeiten**. Der Vertrag in `contract.ts` hat für nichts davon ein Feld.
13. **Routing und Matrix mit Koordinaten**, nicht mit Adressen.
14. **Geocoding nur beim Anlegen oder Ändern einer Adresse**, nie beim
    Öffnen einer Karte; die Koordinate wird als abgeleitetes Stammdatum bei
    der Adresse gespeichert und teilt deren Datenklasse und Frist
    (**ANN-016**).
15. **Geocoding, Routing und Matrix laufen serverseitig** (**ANN-017**:
    Supabase Edge Function), damit der Server-Schlüssel und die
    Browser-Metadaten der Person nicht beim Anbieter landen. Die Kacheln
    lädt der Browser direkt — das ist der einzige Browser-Kontakt zum
    Anbieter und trägt nur Kartenausschnitt und Zoom.
    **Edge Runtime:** ADR-015 Punkt 20 gibt Supabase Edge Functions nicht
    automatisch für Gesundheitsdaten frei, und ADR-017 Punkt 25 verzichtet
    aus demselben Grund bewusst auf sie. Für diesen Datenweg gilt deshalb:
    Der Adapter läuft bis zur dokumentierten Prüfung der Edge Runtime in
    OPS-001 ausschließlich gegen den `mock`-Adapter oder mit synthetischen
    Koordinaten (MAP-002 bis MAP-005); echte Adressen erreichen ihn erst
    nach positivem Ergebnis (Gate, Punkt 9). ANN-017 (Adapter als Edge
    Function) und ANN-025 (keine Edge Function für die Kontoanlage) sind
    zwei Lesarten derselben Regel: geplant ja, freigegeben nein.
16. **Keine dauerhafte Speicherung** von Fahrzeiten, Distanzen, Matrizen oder
    Routing-Rohantworten. Sie werden im Moment der Planung abgerufen,
    angezeigt und verworfen (entschieden 2026-09-08, B7). §9 und §18 werden
    damit strenger erfüllt als gefordert: es entstehen keine Routing-Rohdaten.
17. **Kein Live-Tracking, keine Bewegungsverläufe, keine Auswertung je
    Person** (§20, B6). Ohne gespeicherte Fahrzeit gibt es nichts, woraus sich
    ein Leistungsprofil bilden ließe.
18. **Logs enthalten keine Adressen und keine Koordinaten** (ADR-011). Der
    Adapter loggt Fehlerklasse, Dauer und Anbieterkennung, nie die Anfrage
    oder Teile der Antwort. `LocationError.message` ist dafür gebaut.
19. **Schlüsselverwaltung.** Der **Server-Schlüssel** für Geocoding, Routing
    und Matrix ist ein Secret: Supabase-Secret der Edge Function, nie im
    Bundle, nie im Repository, je Umgebung getrennt (ADR-002 Punkt 5). Der
    **Kachelschlüssel** ist im Browser sichtbar und deshalb kein Secret,
    sondern eine Abrechnungskennung mit Missbrauchsrisiko: eigener Schlüssel
    nur für Kacheln, Kontingent und Warnschwelle, Rotation bei Verdacht.
    **Ob PTV Schlüssel an Referrer oder Domain binden kann, ist nicht belegt**
    — Frage an den Support vor MAP-006; ohne Bindung ist ein gesondertes
    Kontingent die Mindestmaßnahme.

### D. Navigations-Handoff

20. Aus Tagesliste, Termin und Karte führt „Navigation starten" mit **genau
    einem Tap** in die Navigations-App des Geräts. Die URL wird **erst beim
    Tippen** gebaut, nie gespeichert, nie automatisch geöffnet, nie als
    eingebetteter Rahmen geladen. Diese Regel trägt die datenschutzrechtliche
    Einordnung des Handoffs und ist eine Prüfregel im Review.
21. Übergeben wird **nur das Ziel** und der Fahrradmodus: die Koordinate,
    sobald sie vorliegt; bis dahin die Adresse ohne Namen (**ANN-018**, dort
    auch URL-Format und Feldliste). Kein Name, keine Uhrzeit, keine Kennung.
    Ein Tageslink mit mehreren Zielen bleibt innerhalb des dokumentierten
    Limits der Ziel-App — Google Maps URLs: neun Zwischenziele, drei in
    mobilen Browsern (Suchauszug, in MAP-005 zu verifizieren).
22. **Ziel-Apps:** Google Maps (`travelmode=bicycling`), Apple Maps
    (`maps.apple.com/directions?…&mode=cycling`, belegt) und die
    Systemnavigation (`geo:`-URI, ohne Verkehrsmittel). MAP-005 bewertet, was
    auf den tatsächlich genutzten Geräten zuverlässig im Fahrradmodus öffnet.
    Eine Nutzerpräferenz wird **nicht** vorgebaut.
23. **Der Handoff ist nicht automatisch rechtlich risikofrei.** Die
    Anwendung übermittelt nichts; die Verbindung baut das Gerät der Person
    nach ihrem Tippen auf, und die Praxis stellt ein Werkzeug bereit
    (Abgrenzung nach EuGH C-40/17, *Fashion ID*: eingebettete Drittinhalte
    machen mitverantwortlich, ein gesetzter Link nicht). Dennoch erfährt der
    Betreiber der Navigations-App eine Adresse von einem Gerät, das ein
    Physiotherapiebetrieb nutzt. Ob das Art. 9 DSGVO oder §203 StGB berührt,
    ist eine Rechtsfrage an die Datenschutzberatung (**B2**), nicht in diesem
    ADR entschieden. Bis dahin gelten drei Bedingungen kumulativ:
    - **Endgeräteregel:** auf dienstlich genutzten Geräten kein angemeldetes
      privates Google-Konto für die Navigation, oder Web- und
      App-Aktivitäten sowie Standortverlauf deaktiviert. Gehört in die
      Endgeräte-Richtlinie (BETRIEB-001, Roadmap G14/G16) und in die TOM.
    - **Datenschutzinformation** (PAT-006): nennt, dass für die Anfahrt eine
      Navigations-App genutzt wird, dass nur das Ziel ohne Namen übergeben
      wird und dass die Übergabe erst auf Aktion der Therapeutin erfolgt.
    - **Nur auf Aktion, nie automatisch** (Punkt 20).

### E. Prototypen und Gate

24. **MAP-002 bis MAP-005 laufen ausschließlich mit synthetischen Tübinger
    Koordinaten** unter dem kostenlosen PTV-Developer-Abo („testing and
    integration purposes"). Kein Patientendatum, keine echte Adresse, kein
    Bezug zu einer Akte. Das Free-Abo und den Schlüssel legt **Jannes** an,
    nicht der Agent; der Schlüssel liegt in `.env.local` beziehungsweise in
    lokalen Supabase-Secrets und nie im Repository (§3.3).
25. **MAP-006** (echte Adressen, Geocoding bei Adressänderung, Tagesroute,
    Fahrzeiten im Kalender) beginnt **erst nach** dem Gate aus Punkt 9 —
    einschließlich Paid Plan, DPA-Ablage in den DSFA-Unterlagen (G14) und
    DSFA-Wiedervorlage.
26. Die Einführung ist eine „wesentliche Änderung der
    Routing-/Standortverarbeitung" nach ADR-007 Punkt 2. Die
    DSFA-Wiedervorlage erfolgt je Datenweg: Kacheln, Server-Aufrufe, Handoff
    — **mit Fassung 3 zusätzlich: Führung** (Punkt 33).

### F. Führung auf dem Gerät (Fassung 3)

**Warum überhaupt selbst.** Die Frage war, ob eine Führung beim Anbieter
einzukaufen ist. Antwort: nein, in beide Richtungen.

- Die **Routing API liefert Manöver** entlang der Route („events … like
  maneuvers"). Das Material für eine Führung gibt es.
- **„Guided Navigation"** der Routing API übergibt eine berechnete Route an
  **PTV Navigator**, die eigene App des Anbieters. Das ist ein Handoff wie
  Abschnitt D, nur an eine andere Ziel-App — architektonisch nichts Neues.
- Das einbettbare SDK von **PTV Navigator G2** ist ein **natives Android-/
  iOS-Produkt für Lkw**. §2.2 und ADR-015 legen eine responsive Web-App
  **ohne native Apps** fest; ein Radprofil ist für das Produkt nicht belegt.
  Dieser Weg ist damit zweifach verschlossen.

**Belegtiefe:** `developer.myptv.com` war aus der Cloud-Umgebung gesperrt
(derselbe Egress-Proxy wie in Fassung 2). Die drei Punkte stammen aus
Suchtreffern und Produktseiten, **nicht** aus der API-Referenz. Ob die
OSM-Radprofile Manöver mitliefern, ist damit **nicht belegt** und vor dem
Epic mit einem Aufruf gegen die echte API zu klären (offene Folgefrage E-24).

**Daraus folgt der Zuschnitt.** Wer die Führung selbst baut, baut sie im
Browser — und dann muss die Position das Gerät nie verlassen. Das ist keine
Sparmaßnahme, sondern der Grund, warum diese Entscheidung überhaupt tragbar
ist.

27. **Die Führung läuft im Browser der fahrenden Person.** Die Position kommt
    aus der Geolocation-Schnittstelle des Geräts, wird dort auf die Route
    bezogen und dort angesagt. Sie wird **nicht** an die Praxissoftware
    übermittelt und **nicht** gespeichert — weder im Server, noch im Gerät,
    noch in einem Log (ADR-011). Die Praxis erfährt zu keinem Zeitpunkt, wo
    jemand ist; §20 bleibt dadurch gewahrt, nicht aufgeweicht.
28. **Nur auf Aktion, und beendbar.** Die Führung beginnt mit „Führung
    starten" durch die fahrende Person, endet mit der Fahrt oder mit einem
    Abbruch und startet nie automatisch. Diese Regel trägt die
    datenschutzrechtliche Einordnung und ist eine Prüfregel im Review — wie
    Punkt 20 für den Handoff.
29. **Zum Anbieter geht eine Position nur zur Neuberechnung.** Weicht die
    Fahrt von der Route ab, geht eine neue Anfrage über die Edge Function
    (ANN-017) an den Anbieter, mit der aktuellen Koordinate als Startpunkt.
    Das ist **dieselbe Datenart wie ein Wegpunkt heute** — kein Name, keine
    Kennung, keine Uhrzeit (Punkt 13). Kein Dauerstrom: Eine Neuberechnung je
    Abweichung, nicht je Sekunde.
30. **Keine Auswertung, keine Historie, kein Bewegungsprofil.** Aus einer
    Führung entsteht keine Statistik, keine Fahrtenliste, kein Soll-Ist und
    keine Leistungskennzahl — auch nicht aggregiert (§20, §18).
31. **Sicherheit vor Funktion.** Eine Führung, die aufs Telefon schauen lässt,
    während jemand fährt, ist ein Sicherheitsproblem. Sprachausgabe und die
    Annahme einer Lenkerhalterung sind **Bedingung** des Epics, nicht Kür;
    eine rein visuelle Führung wird nicht ausgeliefert. Gehört in die
    Endgeräte-Richtlinie (BETRIEB-001) neben die Navigationsregel aus
    Punkt 23.
32. **Reihenfolge: erst MAP-006, dann die Führung.** Ohne echte Tagesstopps
    gibt es nichts zu führen, und ohne das Gate aus Punkt 9 keine echten
    Adressen. Das Epic beginnt damit **nach** MAP-006 und nach dem Gate; der
    Handoff aus Abschnitt D bleibt bis dahin der Weg.
33. **Die Führung ist ein eigener Datenweg in der DSFA** (Punkt 26), und
    **B2** wird um sie erweitert: Die Rechtsfrage ist nicht mehr nur die
    einmalige Übergabe einer Adresse, sondern eine wiederholte Übermittlung
    von Koordinaten während einer Fahrt zu einer Patientenadresse.

## Prüfung nach ADR-002 Punkt 3 / §3.5 — Stand

Der vollständige Katalog mit Belegtiefe und Zitaten steht in
`docs/decisions/providerpruefung-kartendienst.md`. Zusammenfassung für PTV
Developer:

| Kriterium               | Stand 2026-09-08                                                                                                                                          |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AVV / DPA               | `CONTRACT_CONFIRMATION_REQUIRED` — DPA „PTV Cloud Services" existiert laut Auszügen; Geltung für PTV Developer und die OSM-APIs ungeprüft                     |
| §203 StGB               | `CONTRACT_CONFIRMATION_REQUIRED` — Vertraulichkeitsklausel laut Auszug vorhanden; **kein** Treffer für §203/Berufsgeheimnis; gesonderte Verpflichtung anfragen |
| Verschlüsselung         | Transport TLS (API-Endpunkte nur `https`, belegt aus den Clients)                                                                                          |
| Zugriffskontrolle       | unsererseits: Server-Schlüssel als Secret, Kachelschlüssel mit Kontingent; anbieterseitig: `CONTRACT_CONFIRMATION_REQUIRED` (TOM-Dokument)                  |
| Retention und Löschung  | `CONTRACT_CONFIRMATION_REQUIRED` — keine Aussage zu Request/Response/Logs gefunden; Zweitnutzungsklausel in US-Terms zu prüfen                             |
| Unterauftragnehmer      | `CONTRACT_CONFIRMATION_REQUIRED` — Liste existiert; Microsoft Ireland (Azure) ableitbar; Drittanbieter bei OSM-APIs zu bestätigen                          |
| Datenstandort           | `CONTRACT_CONFIRMATION_REQUIRED` — „remains within the EU" laut Auszug; Region nicht genannt                                                              |

Kein Kriterium ist negativ belegt; keines ist positiv belegt. Das ist der
Grund für „bevorzugter Kandidat", nicht „freigegeben".

## Korrekturen gegenüber Fassung 1

- **„Die Karte ist Komfort, kein Kernprozess."** Gestrichen. §9 nennt
  Fahrzeit und Erreichbarkeit als Funktion der ersten Ausbaustufe, und Jannes
  hat die integrierte Karte am 2026-09-08 zum Produktziel erklärt.
- **„20 Zwischenziele."** Falsch zugeordnet: Die Zahl stammt aus dem Umfeld
  der Directions **API**. Für Google Maps **URLs** nennt die Dokumentation
  neun Zwischenziele, drei in mobilen Browsern (Suchauszug). PTVs Routing
  OSM API hat ein eigenes Limit (25 Wegpunkte laut Auszug). Drei verschiedene
  Grenzen, die nicht vermischt werden.
- **„Standardvertragsklauseln setzen einen Vertrag voraus, den es hier nicht
  gibt."** Falsch. Googles Controller-Controller-Bedingungen **enthalten**
  die EU-Standardvertragsklauseln Controller-to-Controller (Modul 1), und
  Google LLC ist unter dem Data Privacy Framework zertifiziert. Was fehlt,
  ist die Auftragsverarbeitung (Art. 28, Modul 2) — nicht die
  Übermittlungsgrundlage. Die Lage des DPF (Rechtsmittel C-703/25 P) bleibt
  ein Risiko, aber kein Argument, das die Entscheidung trägt.
- **„§203: nicht konstruierbar."** Zu stark. Ob eine Übermittlung an einen
  eigenen Verantwortlichen unter §203 Abs. 3 StGB fällt und ob eine Adresse
  ohne Namen ein Geheimnis ist, sind Rechtsfragen für B2. Der ADR stellt nur
  fest: Ohne Weisungsbindung lässt sich die von §3.5 verlangte Eignung nicht
  dokumentieren — das genügt, um Google als Backend auszuschließen.
- **„Der Navigationslink ist frei."** Zu stark. Er ist **nicht blockiert**
  und bleibt für UX-EPIC-001 baubar, aber er ist nicht automatisch
  risikofrei (Punkt 23). Die drei Bedingungen gelten kumulativ, und B2 wird
  gefragt.
- **Empfehlung „Weg B".** Ersetzt durch Weg C mit PTV als Kandidat.

## Konsequenzen

- **UX-EPIC-001 baut den Navigationslink** nach Punkt 20 bis 23 und ANN-018
  — mit Adresse ohne Namen, weil Koordinaten erst mit MAP-006 vorliegen.
- **TOUR-EPIC-001a/b werden durch MAP-002 bis MAP-006 ersetzt** (Roadmap
  Etappe T, Spezifikation in `docs/development/MAP-LOOPS.md`). Die Google
  Maps Embed API entfällt; E-16 ist damit überholt und wird Jannes als
  Änderungsfrage vorgelegt.
- Vor MAP-002 braucht es einen manuellen Schritt von Jannes: kostenloses
  PTV-Developer-Abo anlegen, Schlüssel in `.env.local` ablegen. Ohne diesen
  Schritt läuft MAP-002 gegen den `mock`-Adapter und zeigt keine echten
  Kacheln.
- Vor MAP-006 braucht es den Vertragscheck (Teil 5 des Prüfdokuments), den
  Paid Plan und die DSFA-Wiedervorlage. Das ist Spur-B-Arbeit mit Termin in
  der Roadmap (B7, G12).
- Der Adapter kostet eine Edge Function und deren Prüfung nach ADR-015
  Punkt 20. Das ist der Preis dafür, dass kein Schlüssel und keine
  Browser-Metadaten beim Anbieter landen.
- Die Kachelanfragen sind der einzige direkte Browser-Kontakt zum Anbieter.
  Sie tragen Kartenausschnitt und Zoom, also mittelbar, wo gearbeitet wird.
  Das ist im DSFA-Teil „Kacheln" zu bewerten; die Alternative — Kacheln durch
  den eigenen Server zu schleusen — ist bei einer Ein-Personen-Praxis
  unverhältnismäßig und wird nicht gebaut.
- Die Regel „nur auf Aktion" gilt für den Handoff, **nicht** für die In-App-
  Karte: Die Karte darf beim Öffnen der Tour erscheinen, weil ihr Anbieter
  Auftragsverarbeiter sein wird. Was sie beim Laden überträgt, sind Kacheln,
  keine Adressen.
- Fällt PTV am Gate durch, wechselt der Anbieter hinter `contract.ts`. Die
  Oberfläche, die Overlays und die Fachlogik bleiben.
- **Die Führung (Fassung 3) ist ein eigenes Epic nach MAP-006** und die
  teuerste Einzelfunktion der Etappe: Positionsbezug auf die Route,
  Neuberechnung bei Abweichung, Sprachausgabe, Bildschirmwachhaltung,
  Akkuverhalten, Genauigkeit in der Stadt. Sie ist **kein** Zusatz zu
  MAP-005, und sie ersetzt den Handoff nicht.
- **Die Führung erhöht die Menge der Koordinaten beim Anbieter, nicht ihre
  Art.** Für den Vertragscheck heißt das: Dieselben Kriterien wie in der
  Tabelle unten, aber mit mehr Aufrufen je Fahrt — Rate-Limits und Kontingent
  des Abos sind vor dem Epic zu prüfen.
- **§20 ist mit Version 0.14 präziser, nicht schwächer.** Wo vorher ein Satz
  stand, stehen jetzt vier kumulative Bedingungen und ein ausdrückliches
  DARF-NICHT für den Arbeitgeber. Eine Führung, die davon abweicht, ist nicht
  von diesem ADR gedeckt — auch dann nicht, wenn sie technisch einfacher
  wäre.

## Bewusst nicht Bestandteil dieser Entscheidung

- Die produktive Freigabe von PTV Developer oder eines anderen Anbieters.
- Tourenoptimierung, Sequenzierung, automatische Reihenfolgebildung (eigenes
  Epic nach §9 „später KANN").
- Die Auswahl der Navigations-App je Person (Präferenz) — MAP-005 bewertet,
  baut aber keine Einstellung vor.
- Die Planungskarte aller aktiven Adressen (`IDEA-PRX-033`) — eigene
  Prüfung, nicht Teil dieses Datenwegs.
- Der Inhalt der Endgeräte-Richtlinie über die Navigationsregel hinaus.
- Der Wortlaut der Datenschutzinformation (PAT-006).
- **Der Zuschnitt des Führungs-Epics** (Fassung 3): Abschnitt F entscheidet
  **ob** und **unter welchen Bedingungen**, nicht wie. Ansagetexte,
  Kartenverhalten während der Fahrt, Umgang mit Funklöchern (ADR-001) und die
  Frage, ab welcher Abweichung neu gerechnet wird, gehören in das Epic.
- **Eine Führung außerhalb der Bedingungen aus §20** — etwa mit Positionen
  auf dem Server, einer Fahrtenhistorie oder einer Auswertung. Das ist kein
  offener Punkt, sondern ausgeschlossen.

## Offene Folgefragen

- ~~**E-20 (an Jannes):** Fassung 2 bestätigen?~~ **Bestätigt am 2026-09-13.**
  Die Google Maps Embed API aus E-16 entfällt; PTV Developer ist Kandidat für
  die Prototypen.
- ~~**E-21 (an Jannes):** Reihenfolge — MAP-002 vor oder nach UX-EPIC-001?~~
  Gegenstandslos: UX-EPIC-001 ist seit 2026-09-11 fertig; MAP-002 startet,
  sobald der PTV-Schlüssel vorliegt.
- **B2:** Handoff und §203/Art. 9 (Punkt 23); Einwilligung oder Art. 9 Abs. 2
  lit. h in Verbindung mit §22 BDSG. **Mit Fassung 3 erweitert** (Punkt 33):
  dieselbe Frage für eine wiederholte Übermittlung von Koordinaten während
  der Fahrt — und die Gegenfrage, ob die vier Bedingungen aus §20 ausreichen,
  um die Führung aus dem Beschäftigtendatenschutz herauszuhalten.
- **PTV-Support (Jannes):** Referrer-/Domainbindung von Schlüsseln; Höchstzahl
  der Relationen je Matrix-Anfrage; Rate-Limits der OSM-APIs im Free Plan.
  **Mit Fassung 3:** Aufrufkontingent bei wiederholter Neuberechnung.
- **E-24 (technisch, vor dem Führungs-Epic):** Liefern die OSM-Radprofile
  (`OSM_BICYCLE`, `OSM_CARGO_BICYCLE`) Manöver mit? Mit einem Aufruf gegen die
  echte API zu klären — aus der Cloud-Umgebung nicht möglich, weil
  `developer.myptv.com` gesperrt ist und der Schlüssel bei Jannes liegt.
  Fällt die Antwort negativ aus, ist Abschnitt F ohne einen zweiten
  Datenlieferanten nicht umsetzbar, und das wäre ein neuer Anbieter mit
  eigener Prüfung nach §3.5.
- Wie wird die Endgeräteregel überprüft, ohne das Telefon zu kontrollieren
  (§20)? Vorschlag für BETRIEB-001: schriftliche Bestätigung.

## Quellen der Recherche vom 2026-09-08

Belegtiefe je Quelle im Prüfdokument. Primärquellen (abgerufen):
`github.com/ptv-logistics` — `tutorials-geocoding-scenario`,
`tutorials-vector-map-overlays-react-app`, `tutorials-pickups-and-deliveries`,
`leaflet-ptv-developer`, `clients-routing-osm-api`,
`clients-matrix-routing-osm-api`, `clients-geocoding-api`,
`clients-route-optimization-api`, `clients-sequence-optimization-api`;
`github.com/maptiler/maptiler-sdk-js`; `developer.apple.com` (Unified Map
URLs, Map Links); `developer.android.com` (Common Intents);
`cloud.google.com` (Cloud Data Processing Addendum; archivierte
Controller-Terms 2018). Suchauszüge offizieller Seiten: `developer.myptv.com`,
`legaldocs.myptv.com`, `ptvlogistics.com`, `docs.maptiler.com`,
`maptiler.com`, `graphhopper.com`, `here.com`, `developer.tomtom.com`,
`developers.google.com`, `business.safety.google`, `policies.google.com`.
Rechtsprechung: EuGH C-40/17 *Fashion ID*; EuG T-553/23 *Latombe*; EuGH
C-703/25 P (anhängig).

**Rechtsberatung ersetzt das nicht.** Die Einordnung stammt aus einer
Dokumentenrecherche; sie geht mit B2 an die Datenschutzberatung.
