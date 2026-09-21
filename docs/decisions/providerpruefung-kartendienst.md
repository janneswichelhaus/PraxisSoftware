# Providerprüfung Kartendienst (MAP-001)

Stand: 2026-09-08 · Gehört zu ADR-019 (Fassung 2) · Prüfkatalog nach ADR-002
Punkt 3 und `PROJECT_PRINCIPLES.md` §3.5

Dieses Dokument hält fest, **was zum Kartendienst belegt ist, was nur als
Hinweis vorliegt und was vor einer produktiven Freigabe vertraglich zu
bestätigen ist.** Es trifft keine Entscheidung — die steht in ADR-019. Es ist
die Arbeitsliste für den Vertragscheck durch Jannes und die
Datenschutzberatung (B2) und wird bei jeder Verifikation fortgeschrieben.

## Belegtiefe — wie die Einträge zu lesen sind

Die Recherche vom 2026-09-08 lief aus der Cloud-Entwicklungsumgebung. Deren
Egress-Proxy sperrt **alle** Webhosts von PTV (`developer.myptv.com`,
`api.myptv.com`, `legaldocs.myptv.com`, `ptvlogistics.com`, `ptvgroup.com`),
MapTiler, GraphHopper, HERE, TomTom und den größten Teil von Google
(`developers.google.com`, `business.safety.google`, `policies.google.com`);
ebenso `web.archive.org`. Erreichbar waren `github.com` (darunter PTVs
offizielle Organisation `ptv-logistics` mit per OpenAPI generierten Clients
und Tutorials), `developer.apple.com`, `developer.android.com` und Teile von
`cloud.google.com`. Alles Übrige stammt aus **Suchmaschinen-Auszügen** der
jeweils genannten offiziellen Seite — die Seite selbst wurde nicht geöffnet,
der Wortlaut ist nicht geprüft.

| Kennzeichen                          | Bedeutung                                                                                                  |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| **belegt (Primärquelle)**            | offizielle Seite oder offizielles Repository tatsächlich abgerufen, Wortlaut zitierbar                     |
| **Hinweis (Suchauszug)**             | Auszug einer offiziellen Seite aus der Suche; Seite nicht abgerufen. Plausibel, aber nicht zitierfähig     |
| **`CONTRACT_CONFIRMATION_REQUIRED`** | nicht aus Primärquellen belegbar; vor Echtdaten gegen die geltenden Vertragsunterlagen zu verifizieren     |
| **nicht belegt**                     | keine Quelle gefunden — weder Beleg noch Gegenbeleg                                                        |

Regel aus dem Auftrag: **nicht raten.** Ein Punkt ohne Primärquelle bleibt
offen, auch wenn ein Suchauszug ihn nahelegt.

## Teil 1 — PTV Developer: die 13 Prüfpunkte

Anbieter laut Impressum-Auszügen: **PTV Logistics GmbH, Stumpfstraße 1,
76131 Karlsruhe** (Amtsgericht Mannheim HRB 745512) — Hinweis (Suchauszug);
welche PTV-Gesellschaft für einen deutschen Kunden Vertragspartner ist,
bestimmt laut Auszug eine „Country Matrix" — `CONTRACT_CONFIRMATION_REQUIRED`.

### Technik

| Nr. | Punkt                                | Ergebnis                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Belegtiefe                                                                                          |
| --- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1   | Vector Maps OSM + MapLibre           | Kacheln im Mapbox-Vector-Tile-Format unter `https://api.myptv.com/maps-osm/v1/vector-tiles/{z}/{x}/{y}` (minzoom 0, maxzoom 17); Sprites und Glyphen unter `vectormaps-resources.myptv.com`; Style `…/styles-osm/latest/standard-osm.json`. PTVs eigene Tutorials rendern mit MapLibre GL JS und übergeben den Schlüssel per `transformRequest` (Query `apiKey`) oder Header `ApiKey`. **Im Browser geprüft am 2026-09-21 (BEF-021):** Der Kopf `ApiKey` funktioniert **nur** am Kachelendpunkt `api.myptv.com` — dort beantwortet der Anbieter die CORS-Vorabanfrage und lehnt einen falschen Schlüssel mit 401 ab. `vectormaps-resources.myptv.com` beantwortet die Vorabanfrage **nicht** und liefert Style, Sprites und Glyphen ohne Schlüssel aus; eine fremde Kopfzeile blockiert dort die ganze Anfrage. Attribution „PTV Group, OpenStreetMap contributors". Die Nicht-OSM-Variante `maps/v1` läuft auf HERE-Daten. | **belegt (Primärquelle)** — `github.com/ptv-logistics/tutorials-geocoding-scenario`, `…/tutorials-vector-map-overlays-react-app`, `…/leaflet-ptv-developer`; Style-URL **im Browser bestätigt (2026-09-21)**; Attribution: Hinweis (Suchauszug) |
| 2   | Geocoding                            | Zwei APIs: **Geocoding & Places API** auf HERE-Daten (`geocoding/v1`, strukturiert `by-address`, Freitext `by-text`, rückwärts `by-position`) und **Geocoding OSM API** auf OSM-Daten (`geocoding-osm/v1/places/by-text`, auch mit getrennten Adressfeldern). Für uns relevant ist die OSM-Variante — sie hält den Datenweg frei von einem Drittanbieter. Ob HERE bei der HERE-Variante Anfragedaten erhält, sagt keine Quelle.                                                              | Endpunkte HERE-Variante: **belegt** (`clients-geocoding-api`); OSM-Variante: Hinweis (Suchauszug); Drittanbieterfluss: `CONTRACT_CONFIRMATION_REQUIRED` |
| 3   | Fahrrad-/Lastenradrouting            | Routing OSM API: Profil ist ein String aus den vordefinierten OSM-Profilen. PTVs Tutorial `tutorials-pickups-and-deliveries` verwendet **`OSM_BICYCLE`** und **`OSM_CARGO_BICYCLE`**. Antwort: `distance` [m], `travelTime` [s], `polyline` (u. a. `GEO_JSON`), Ergebnisse `LEGS`, `LEGS_POLYLINE`, `POLYLINE`. Fehlercode `ROUTING_TOO_MANY_WAYPOINTS`; Grenze laut Auszug 25 Wegpunkte und 1000 km Luftlinie bei Fahrrad.                                                                      | Profile, Antwortfelder: **belegt (Primärquelle)** — `clients-routing-osm-api`, Tutorial; Wegpunktgrenze: Hinweis (Suchauszug) |
| 4   | Fahrzeitmatrix für Fahrrad           | Matrix Routing OSM API: derselbe Profilmechanismus (Default `EUR_OSM_CAR`, OSM-Profile referenzierbar); Ergebnisse `TRAVEL_TIMES` [s], `DISTANCES` [m], Index `k = i·N + j`; alle Orte in einem Rechteck von höchstens 100 km Kantenlänge (`MATRIXROUTING_LOCATIONS_TOO_FAR_AWAY`); Höchstzahl der Relationen je Anfrage im Client nicht beziffert.                                                                                                                                              | **belegt (Primärquelle)** — `clients-matrix-routing-osm-api`; Fahrradfreigabe der Matrix ausdrücklich: Hinweis (Suchauszug); Größe: nicht belegt |
| 5   | spätere Route-/Sequenzoptimierung    | Route Optimization API und Sequence Optimization API kennen OSM-Profile („matchSideOfStreet … is disabled if an OSM profile is used"); das Tutorial schickt `OSM_BICYCLE`/`OSM_CARGO_BICYCLE` an `routeoptimization/v1/plans`. Eine eigene „OSM"-Optimierungs-API gibt es nicht.                                                                                                                                                                                                             | **belegt (Primärquelle)** — `clients-route-optimization-api`, `clients-sequence-optimization-api`, Tutorial |
| 13  | API-Key-/Credential-Modell           | Ein Schlüssel je Abo, Header `ApiKey` oder Query `apiKey`; Verwaltung über die Account API. **Keine Referrer-/Domainbindung dokumentiert** — die Browser-Tutorials legen den Schlüssel schlicht in `window.apiKey`. Folge für uns: Routing, Matrix, Geocoding **serverseitig**; für die Kacheln ein eigener Schlüssel mit Kontingent, bis die Bindungsfrage geklärt ist.                                                                                                                       | Übergabe: **belegt (Primärquelle)**; Domainbindung: **nicht belegt** → `CONTRACT_CONFIRMATION_REQUIRED` (Support-Anfrage) |

### Vertrag und Datenschutz

Kein einziges PTV-Vertragsdokument war abrufbar. **Alle Punkte 6 bis 12 sind
`CONTRACT_CONFIRMATION_REQUIRED`.** Die Spalte „Hinweis" nennt, was
Suchauszüge nahelegen — als Leseanleitung für den Vertragscheck, nicht als
Beleg.

| Nr. | Punkt                       | Hinweis (Suchauszug, ungeprüft)                                                                                                                                                                                                                                                                                                                                              | Zu verifizieren                                                                                                                                              |
| --- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 6   | DPA-Anwendbarkeit           | Ein „Data Processing Agreement PTV Cloud Services" (EN/DE) liegt unter `legaldocs.myptv.com`. Auszug der General Terms of Service: „The Parties shall enter into an agreement on order data processing according to Art. 28 GDPR in accordance with the respectively applicable template". Ein Einwilligungsdokument zählt „PTV Developer, PTV Route Optimizer, PTV Map&Guide Internet" zu den PTV Cloud Services. | Ist PTV Developer im DPA ausdrücklich erfasst? Gilt der DPA als mit dem Abo geschlossen oder braucht es eine Unterschrift? Deckt er die OSM-APIs ab?          |
| 7   | Processor-Rolle             | Auszug eines PTV-DPA: „The Customer is the controller within the meaning of Art. 4 (1) (7) GDPR, and PTV is the processor within the meaning of Art. 4 No. 8 GDPR."                                                                                                                                                                                                       | Aus welchem der beiden PTV-DPAs (EU Cloud Services vs. US) stammt der Satz? Weisungsbindung nach Art. 28 Abs. 3 lit. a — im US-Dokument steht nur „best efforts". |
| 8   | Vertraulichkeitsregel       | Auszüge: „PTV, employees of PTV and subcontractors of PTV will implement and maintain appropriate … measures for Customer's Confidential Information"; „PTV shall treat the data confidential". **Kein Treffer** für „§ 203", „Berufsgeheimnis" oder „professional secrecy" auf einer PTV-Domain.                                                                    | Genügt die Klausel für §203 Abs. 3–4 StGB (Verpflichtung der mitwirkenden Person, Hinweis auf die Strafbarkeit)? Voraussichtlich ist eine **gesonderte schriftliche Verpflichtung** anzufragen. |
| 9   | EU-Hosting                  | Auszug `developer.myptv.com`: „All data is stored and remains within the European Union". Auszug Data Privacy Statement PTV Cloud Services: Verarbeitung auf Azure durch Microsoft Ireland „only within the European Union and the European Economic Area"; „No data is transferred outside the European Union for PTV Cloud Services".                             | Azure-Region wird nirgends genannt. Gilt die Aussage für die OSM-APIs und die Kachelauslieferung (CDN)?                                                     |
| 10  | Subprozessoren              | Ein Dokument „Subprocessors PTV Cloud Services" existiert; Inhalt unbekannt. Aus dem Privacy Statement ableitbar: Microsoft Ireland Operations Ltd. (Azure). Widerspruchsverfahren: 30 Tage, sonst Sonderkündigung mit anteiliger Erstattung.                                                                                                                             | Vollständige Liste; ob HERE oder TomTom bei den **OSM**-APIs als Subprozessor auftreten (bei OSM-Daten eigentlich nicht — zu bestätigen).                   |
| 11  | Retention                   | **Keine Aussage** zur Aufbewahrung von API-Anfragen (Adressen, Koordinaten, IP, Logs) gefunden. Bekannt nur: Kundendaten 90 Tage nach Vertragsende gelöscht; Map-Matching-Tracks 7 Tage; Nutzungsdaten der Account API 60 Tage.                                                                                                                                       | Konkrete Speicherdauer von Request/Response und Logs; Zweckbindung. **Flag:** in den US-Terms steht ein Recht zur statistischen Auswertung nicht-personenbezogener Eingaben „to further improve the PTV Cloud Services" — prüfen, ob die EU-Terms das ebenfalls enthalten, und geocodierte Patientenadressen ausdrücklich ausnehmen. |
| 12  | Dev-/Test-/Prod-Vertragsmodell | FAQ-Auszug: „The free subscription is only for testing and integration purposes. If you want to roll out your application for commercial use, you need to contact us". Produktseite: Free Plan „productive use is excluded", Transaktionen „limited to five hundred per day"; FAQ nennt dagegen „100,000 transactions per month" — Widerspruch, ohne Abruf nicht auflösbar. Standard Plan „productive use for simple applications … pay-as-you-go". Je Konto genau ein Free-Abo. | Konditionen des Standard Plans; ob Paid Plans Self-Service oder Bestellformular sind; ob der DPA Teil des Paid Plans ist. **Keine Euro-Beträge** in irgendeinem Auszug. |

**Dokumente, die Jannes von einem ungeproxten Rechner laden und ablegen
sollte** (Roadmap G14, DSFA-Unterlagen):

- `https://legaldocs.myptv.com/en/myptv-legal-documents` (Index)
- Data Processing Agreement PTV Cloud Services (EN/DE)
- Subprocessors PTV Cloud Services
- Data Privacy Statement PTV Cloud Services
- General Terms and Conditions for SaaS Services (EU), General Terms of Service
- Country Matrix (Vertragspartner)
- `https://developer.myptv.com/en/terms-privacy`, `/en/help/faq-help`
- Dokumentationsseiten „OSM Profiles", „Waypoints" (Routing OSM), Matrix-FAQ
  (Größenlimit), Rate-Limit-Tabelle

## Teil 2 — Vergleich, so knapp wie für die Entscheidung nötig

Kriterien in der Reihenfolge ihres Gewichts nach §16: Datenschutzarchitektur
(Processor-Rolle, EU-Verarbeitung, Retention) vor technischer Abdeckung vor
Reife vor Preis.

| Anbieter               | Rolle / Vertrag                                                                                                                                                                                                | EU-Verarbeitung                                                                                | Retention / Zweitnutzung                                                                                                     | Karte (MapLibre)                                                                 | Fahrradrouting · Matrix                                                                                              | Reife                                                     | Belegtiefe                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------- |
| **PTV Developer**      | Processor laut DPA-Auszug; deutscher Anbieter (Karlsruhe); DPA für „PTV Cloud Services"                                                                                                                       | „All data … remains within the EU", Azure über Microsoft Ireland                                | keine Aussage gefunden; Auswertungsklausel in US-Terms                                                                       | ja, OSM-Vektorkacheln, eigene MapLibre-Tutorials                                 | `OSM_BICYCLE`, `OSM_CARGO_BICYCLE` · Matrix ja (100-km-Box) · Optimierung später möglich                              | GA; Free Plan nur Test                                    | Technik: belegt (GitHub) · Vertrag: Suchauszüge             |
| **MapTiler**           | „acts as a Data Processor" (Security-Seite); DPA-Dokument nicht auffindbar                                                                                                                                     | `api.maptiler.eu` — EU-only Request Processing **nur auf Paid Plans**; Hosting OVHcloud, Google Firebase; CH/EWR | „does not handle visitor IP addresses at any time" (Cloudflare max. 20 min)                                                   | ja — SDK erweitert MapLibre GL JS (**belegt**, GitHub)                            | Directions API **Beta** (Juli 2026), Fahrradprofil ja; Matrix und Optimierung angekündigt/„available for testing"; Lastenrad nicht belegt | Karte GA, Routing Beta                                    | Suchauszüge; SDK belegt                                     |
| **GraphHopper**        | GraphHopper GmbH, München; **kein DPA/AVV auffindbar**                                                                                                                                                         | Hetzner, Deutschland                                                                            | **jede Anfrage (Body, Header, IP, Zeit) bis zu 5 Wochen**, u. a. „to improve performance, quality and usability"              | keine eigene Karte                                                               | Profile `bike`, `ecargobike` u. a.; Matrix und Route Optimization mit denselben Profilen                               | GA                                                        | Suchauszüge                                                 |
| **HERE**               | „controller or processor, depending on the product"; Data Protection Addendum unter `legal.here.com` existiert                                                                                                | **nicht belegt**                                                                                | „Essential Data Processing"-Endpunkte: **nicht auffindbar** — weder Domains noch Aussage zur Nichtnutzung für Produktverbesserung | ja, Vector Tile API v2 mit Style-URL für MapLibre                                | Fahrrad „currently offered as a beta feature"; Matrix für Fahrrad ja; Waypoint Sequencing Fahrrad nicht belegt          | Fahrrad Beta; Base Plan mit Kreditkarte                    | Suchauszüge; zentraler Punkt nicht belegt                   |
| **TomTom**             | „Data Processing Schedule" mit SCC Modul 2/3; Geltung für Self-Service-Konten nicht belegt                                                                                                                     | „route requests through the appropriate regional servers" — keine ausdrückliche EU-Zusage       | nicht belegt                                                                                                                 | Maps SDK for JavaScript **Public Preview** (0.x, „breaking changes will occur", auf MapLibre) | `travelMode=bicycle` ja                                                                                              | SDK Public Preview, Vorgänger „Deprecated"                | Suchauszüge                                                 |
| **Google Maps Platform** | **Controller-Controller Data Protection Terms**; keine Art.-28-Bedingungen für die Maps Platform gefunden (Cloud Data Processing Addendum nennt sie nicht — **belegt**, `cloud.google.com`)                | keine EU-Datenresidenz für die Maps Platform belegt                                             | als eigener Verantwortlicher nicht weisungsgebunden                                                                          | ja                                                                               | ja                                                                                                                   | GA                                                        | 2018er-Fassung der C2C-Terms belegt; aktuelle: Suchauszüge  |

Richtigstellungen zu Google (Standardvertragsklauseln, §203): ADR-019,
„Korrekturen gegenüber Fassung 1".

## Teil 3 — Externe Navigation (Handoff-Ziele)

| Ziel                       | Was belegt ist                                                                                                                                                                                                                                                                                              | Belegtiefe                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Google Maps URLs           | `https://www.google.com/maps/dir/?api=1&destination=…&travelmode=bicycling`; Zwischenziele mit `\|` getrennt; „up to three waypoints supported on mobile browsers, and a maximum of nine waypoints supported otherwise"; Zwischenziele nicht bei `transit`. Ob `destination` Koordinaten annimmt: nicht im Auszug. | Hinweis (Suchauszug von `developers.google.com/maps/documentation/urls/get-started`) |
| Apple Maps (iOS 18.4+)     | `https://maps.apple.com/directions?destination=<lat,lon oder Adresse>&mode=cycling` — `destination` nimmt „Latitude and longitude as a comma-separated pair"; Modi `driving`, `walking`, `transit`, `cycling`. Altes Schema: `daddr` mit `dirflg` `d`/`w`/`r` — **kein Fahrrad-Flag**.                     | **belegt (Primärquelle)** — `developer.apple.com` (Unified Map URLs, Map Links) |
| Android `geo:`-URI         | `geo:lat,lon`, `geo:0,0?q=lat,lon(label)` — die Systemnavigation wählt die App; kein Verkehrsmittel-Parameter.                                                                                                                                                                                          | **belegt (Primärquelle)** — `developer.android.com/guide/components/intents-common` |

Zur früheren Zahl „20 Zwischenziele": ADR-019, „Korrekturen gegenüber Fassung 1".

## Teil 4 — Kosten- und Vertragscheckpoint

Nur, was Auszüge hergeben. **Keine Schätzungen.**

| Frage                                            | Antwort                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Was geht mit kostenlosen Dev-Zugängen?           | **PTV Free Plan:** alle Dienste zum Testen, ein Schlüssel, „testing and integration purposes" — damit MAP-002 bis MAP-005 mit synthetischen Daten. **MapTiler Free:** 100 000 Requests/Monat. **GraphHopper Free:** nur nichtkommerziell, eingeschränkte Profile. **HERE Base Plan:** Kreditkarte nötig, Free Tier vorhanden. **TomTom:** tägliches Freikontingent (50 000 Kacheln, 2 500 andere). |
| Was braucht für Produktion einen Paid Plan?      | **PTV:** ja — „productive use is excluded" im Free Plan; Standard Plan mit Pay-as-you-go. **MapTiler:** der EU-Endpunkt `api.maptiler.eu` nur auf Paid Plans. **GraphHopper:** kommerzielle Nutzung nur bezahlt. **HERE/TomTom:** Pay-as-you-go über dem Freikontingent.                                                                                    |
| Wer braucht Sales / individuellen Vertrag?       | **PTV:** für kommerziellen Rollout „contact us" (FAQ); einzelne Funktionen „must be explicitly included in your individual PTV Developer license agreement". **GraphHopper:** DPA nicht auffindbar → voraussichtlich Enterprise-Kontakt. **HERE:** DPA und etwaige „Essential"-Endpunkte: unklar, ob Self-Service. **TomTom:** Geltung des Data Processing Schedule für Self-Service-Konten unklar. **Google:** Self-Service, aber nur Controller-Controller. |
| Öffentlich bekannte Preise                       | **MapTiler:** Free 0 $, Flex 25 $/Monat (500 000 Requests), Unlimited 295 $/Monat (5 Mio.). **TomTom:** ab 0,08 $ je 1 000 Kacheln, 0,75 $ je 1 000 Geocodings (Auszug). **PTV, GraphHopper, HERE:** keine Beträge in Auszügen.                                                                                                                            |
| Keine belastbare öffentliche Preisinformation    | **PTV** (Standard Plan, Pay-as-you-go-Sätze), **GraphHopper** (Monatspreise), **HERE** (Pro-Dienst-Preise nur in Drittquellen), MapTiler-Routing („flat rate per driver, per shift", ohne Betrag).                                                                                                                                                          |

Für die Praxisgröße (eine Person, später wenige, einige Hausbesuche am Tag)
liegt der Bedarf bei Größenordnung Dutzende Routing-/Matrix-Aufrufe je Tag und
einigen tausend Kachelabrufen — deutlich unterhalb jedes genannten
Freikontingents. Ob PTVs Standard Plan dafür wirtschaftlich ist, lässt sich
ohne Preisliste nicht sagen.

## Teil 5 — Was vor Echtdaten offen bleibt (Gate-Liste)

Diese Punkte sind das **Provider-/§203-/DSFA-Gate** aus ADR-019. Keiner
blockiert MAP-002 bis MAP-005 mit synthetischen Daten. Alle blockieren
MAP-006.

1. DPA-Text liegt vor, nennt PTV Developer und die genutzten OSM-APIs
   (Punkt 6, 7).
2. Weisungsbindung nach Art. 28 Abs. 3 lit. a DSGVO im EU-DPA (Punkt 7).
3. Schriftliche Verpflichtung nach §203 Abs. 4 StGB oder eine Klausel, die die
   Datenschutzberatung (B2) als gleichwertig einstuft (Punkt 8).
4. Subprozessorliste für die OSM-APIs; Bestätigung, dass kein Drittanbieter
   Anfragedaten erhält (Punkt 10).
5. Retention von Request/Response/Logs; Ausschluss der Zweitnutzung für
   Produktverbesserung, ausdrücklich auch für „nicht personenbezogene"
   Eingaben (Punkt 11).
6. EU-Region der Verarbeitung einschließlich Kachelauslieferung (Punkt 9).
7. Vertragsmodell und Preis des Paid Plans; Bindung des Kachelschlüssels an
   die Domain oder gleichwertiger Schutz (Punkt 12, 13).
8. Providerprüfung der Supabase Edge Runtime als Laufzeit des serverseitigen
   Adapters (ADR-015 Punkt 20, OPS-001).
9. DSFA-Wiedervorlage „wesentliche Änderung der Routing-/Standortverarbeitung"
   (ADR-007 Punkt 2), Nennung in Datenschutzinformation (PAT-006) und
   Verzeichnis der Verarbeitungstätigkeiten (G14).

Fällt Punkt 1 bis 5 negativ aus, bleibt der Adapter, und der Anbieter wechselt
— das ist der Zweck des Vertrags in `src/lib/location/contract.ts`. Zweiter
Kandidat für die Karte ist MapTiler (EU-Endpunkt, Processor), für Routing
und Matrix HERE — beide mit eigener Prüfung nach diesem Katalog.
