# Providerprüfung Kartendienst (MAP-001)
Stand: 2026-10-14 · gehört zu [ADR-019](../adr/ADR-019-map-service.md) · Katalog nach ADR-002 Punkt 3

Arbeitsliste für den Vertragscheck durch Jannes und für B2; entschieden wird in ADR-019. Die Webhosts
der Anbieter sind aus der Entwicklungsumgebung gesperrt: **belegt** heißt abgerufen (PTVs Clients auf
GitHub, Apple, Android, eigener Test mit Browser oder Schlüssel) oder schriftlich vom Anbieter,
**Hinweis** heißt Suchauszug, Vertragliches ist `CONTRACT_CONFIRMATION_REQUIRED`; nicht raten.
Recherchegang, Vergleich, Quellen: `git show 9452575:docs/decisions/providerpruefung-kartendienst.md`.

## Teil 1 — PTV Developer (PTV Logistics GmbH, Karlsruhe): die 13 Prüfpunkte
| Nr. | Punkt | Befund | Belegtiefe |
| --- | --- | --- | --- |
| 1 | Karte (Vector Maps OSM, MapLibre) | Kacheln `https://api.myptv.com/maps-osm/v1/vector-tiles/{z}/{x}/{y}` (Zoom 0 bis 17), Style `https://vectormaps-resources.myptv.com/styles-osm/latest/standard-osm.json`; Kopf `ApiKey` nur am Kachelendpunkt, der Ressourcenhost liefert Style, Sprites und Glyphen ohne Schlüssel und ohne CORS-Vorabanfrage, eine fremde Kopfzeile blockiert dort die Anfrage (BEF-021); der Style bringt seine Quellenangabe mit (BEF-022); `maps/v1` liefe auf HERE-Daten | belegt (GitHub, Browser 2026-09-21); Attribution „PTV Group, OpenStreetMap contributors“: Hinweis |
| 2 | Geocoding | `geocoding-osm/v1` auf OSM-Daten hält den Datenweg frei von Dritten; `geocoding/v1` läuft auf HERE-Daten | HERE-Variante belegt, OSM Hinweis |
| 3 | Fahrrad- und Lastenradrouting | `api.myptv.com/routing-osm/v1/routes` mit `OSM_BICYCLE`, `OSM_CARGO_BICYCLE`; `results` als Liste (`POLYLINE,LEGS`), `distance` [m], `travelTime` [s], `polyline` als GeoJSON-Zeichenkette; `routing/v1` rechnet auf HERE-Daten (BEF-023); höchstens 25 Wegpunkte (sonst `ROUTING_TOO_MANY_WAYPOINTS`) und beim Fahrrad 1000 km Luftlinie | belegt (Schlüssel, 2026-09-21); Grenzen: Hinweis |
| 4 | Fahrzeitmatrix | Matrix Routing OSM: `TRAVEL_TIMES` [s], `DISTANCES` [m], Index `k = i·N + j`; alle Orte in einem Rechteck von 100 km Kantenlänge, sonst `MATRIXROUTING_LOCATIONS_TOO_FAR_AWAY` | belegt (Client); Fahrrad Hinweis; Relationen je Anfrage nicht belegt |
| 5 | spätere Optimierung | Route und Sequence Optimization kennen die OSM-Profile | belegt |
| 6–12 | Vertrag und Datenschutz | Stand nach dem AVV: Teil 4b und Teil 5; Vertragspartner nach „Country Matrix“ | `CONTRACT_CONFIRMATION_REQUIRED` |
| 13 | Schlüssel | einer je Abo, `ApiKey` oder `apiKey`; keine Domainbindung dokumentiert, deshalb Routing, Matrix und Geocoding nur serverseitig | Bindung: `CONTRACT_CONFIRMATION_REQUIRED` |

## Teil 3 — Externe Navigation
| Ziel | Befund | Belegtiefe |
| --- | --- | --- |
| Google Maps URLs | `https://www.google.com/maps/dir/?api=1&destination=…&travelmode=bicycling`; Zwischenziele mit `\|`, drei im mobilen Browser, sonst neun; Wegpunkt als Ort, Adresse oder Koordinate; höchstens 2 048 Zeichen | Hinweis, Seite gesperrt (zuletzt 2026-09-22) |
| Apple Maps (iOS 18.4+) | `https://maps.apple.com/directions?destination=…&mode=cycling`; Zwischenziele als wiederholtes `waypoint`, ohne Höchstzahl | belegt (2026-09-22) |
| Android `geo:` | `geo:lat,lon`, `geo:0,0?q=…`; die Systemnavigation wählt die App, kein Verkehrsmittel | belegt (2026-09-22) |

Bis die Neun am Gerät bestätigt ist (MAP-005, Schritt 4), gilt in `src/lib/location/navigation.ts`
für jede Ziel-App die kleinere Zahl, drei Zwischenziele; neun im mobilen Browser verlöre Stopps still.

## Teil 4 und 4a — Kosten, Rückmeldung von PTV (2026-09-21)
Der Bedarf liegt unter jedem Freikontingent. PTV schrieb: Betrieb nur im Standard Plan, frei bis
50 000 Transaktionen je Account; Domainbindung, Matrixgröße, Rate-Limits, §203 StGB, Subprozessoren,
Retention, EU-Region unbeantwortet. **Schlüssel (Jannes, 2026-09-21):** Bis PTV einen zweiten
bestätigt, nutzt MAP-003 auch serverseitig den Kachelschlüssel, befristet abweichend von ADR-019
Punkt 19 (nur synthetische Koordinaten); **die Trennung ist Vorbedingung des Betriebs** (Gate 7).

## Teil 4b — AVV von PTV (Version 2.0.0 vom 05.11.2025, vorliegend seit 2026-10-14)
Zweimal geprüft (Art. 28 DSGVO, §203 StGB), Vorarbeit für B2, keine Rechtsberatung. Teil des
Hauptvertrags, Abschluss per Checkbox (Ziff. 2), PTV Auftragsverarbeiter (5, 8.2); die Pflichtinhalte
nach Art. 28 Abs. 3 lit. a bis h sind formal enthalten (4.1 bis 4.7, 6, 7, 8.4, 9.3).

**Lücken:** (1) Er gilt nur für Daten, die für PTV personenbezogen sind; „reine Adressdaten ohne
Namen“, die der Adapter schickt, nennt er als möglicherweise anonym. (2) Keine besonderen Kategorien,
obwohl Wohnkoordinaten im Konto einer Physiotherapiepraxis Gesundheitsdaten sind (EuGH C-184/20,
C-21/23). (3) Keine Speicherdauer für Anfragen und Protokolle. (4) Eigene Zwecke nur mittelbar
ausgeschlossen. (5) Keine Zusage „nur EU/EWR“ (8.5). (6) Kein Bezug auf §203 StGB. (7) PTV Developer,
OSM-APIs und Kachelweg ungenannt. 1 bis 5 und 7 schließt eine Ergänzung nach 9.3, 6 eine Erklärung
von PTV (Bitkom-Muster 2018, LÄK Thüringen); die Anfrage liegt bei Jannes und **ruht bis 2027**.

**Offen für B2:** Sind namenlose Koordinaten im Konto der Praxis schon ein fremdes Geheimnis (bis
dahin vorsorglich der volle Weg nach §203 Abs. 3 Satz 2 und Abs. 4 StGB)? Ersetzt eine Weisung die
Festlegung nach Art. 28 Abs. 3 Satz 1 DSGVO? Strafbarkeit bei Beschäftigten in Irland,
Haftungsobergrenze (9.2). **Abzulegen (G14):** AVV, Checkbox-Nachweis mit Datum,
Unterverarbeiterliste und TOM zum Abschlusstag, die Antwort von PTV; von einem ungeproxten Rechner
dazu Datenschutzerklärung, Country Matrix und Bedingungen (`legaldocs.myptv.com`), FAQ und die Seiten
zu OSM-Profilen, Wegpunkten, Matrixgröße und Rate-Limits (`developer.myptv.com`).

## Teil 5 — Gate-Liste vor Echtdaten
Das Vertrags-/§203-/DSFA-Gate aus ADR-019 Punkt 9: Keiner der Punkte blockiert MAP-002 bis MAP-005
mit synthetischen Daten, alle blockieren MAP-006. Fällt einer der Punkte 1 bis 5 negativ aus, wechselt
hinter `src/lib/location/contract.ts` der Anbieter: MapTiler (Karte), HERE (Routing, Matrix).

| Nr. | Gate-Punkt | Stand nach dem AVV |
| --- | --- | --- |
| 1 | DPA-Text liegt vor und nennt PTV Developer und die genutzten OSM-APIs (Punkte 6, 7) | teilweise: Geltung für PTV Developer, die OSM-APIs und das Konto offen |
| 2 | Weisungsbindung nach Art. 28 Abs. 3 lit. a DSGVO (Punkt 7) | erfüllt (4.1), außer bei Übermittlung in Drittländer |
| 3 | Schriftliche Verpflichtung nach §203 Abs. 4 StGB oder eine Klausel, die B2 als gleichwertig einstuft (Punkt 8) | offen, Ergänzung angefragt |
| 4 | Subprozessorliste für die OSM-APIs; kein Drittanbieter erhält Anfragedaten (Punkt 10) | Verfahren erfüllt (7.1, 7.2); Liste offen, laut Auszug Microsoft Ireland (Azure), colpari, Intercom |
| 5 | Retention von Anfrage, Antwort und Logs; keine Zweitnutzung, ausdrücklich auch nicht „nicht personenbezogener“ Eingaben (Punkt 11) | offen; bekannt nur 90 Tage nach Vertragsende, US-Terms erlauben statistische Auswertung |
| 6 | EU-Region der Verarbeitung samt Kachelauslieferung (Punkt 9) | offen: „nur EU“ steht nur in Datenschutzerklärungen |
| 7 | Vertragsmodell und Preis des Paid Plans; Kachelschlüssel an die Domain gebunden oder gleichwertig geschützt (Punkte 12, 13) | Abschluss per Checkbox mit dem Standard Plan; Bindung offen; mit hinterlegter Kreditkarte kostet ein Missbrauch Geld, die Begründung aus Teil 4a trägt dann nicht mehr |
| 8 | Providerprüfung der Supabase Edge Runtime als Laufzeit des Adapters (ADR-015 Punkt 20, OPS-001) | offen, nicht vom AVV berührt |
| 9 | DSFA-Wiedervorlage (ADR-007 Punkt 2), Datenschutzinformation (PAT-006) und Verzeichnis der Verarbeitungstätigkeiten (G14) | offen, nicht vom AVV berührt |
| 10 | Kachelweg (ADR-019 Punkt 34): DPA nennt Vector-Maps-API und Ressourcenhost (BEF-021); belegt ist, was der Anbieter aus Kachelanfragen speichert (IP, Ausschnitt, Referrer), wie lange, ohne Zweitnutzung, und ob ein CDN außerhalb der Liste ausliefert | offen |
| 11 | Schätzungen (ADR-019 Punkt 38): belegt ist, ob und woran Matrix- und Routenantworten eine Ersatzschätzung kenntlich machen | offen, nicht vom AVV berührt |
