# Erledigte Zuschnitte MAP-002 bis MAP-005

Aus [`../MAP-LOOPS.md`](../MAP-LOOPS.md) ausgelagert im Umbau U3 (2026-09-23). Alle vier Loops sind gebaut
(2026-09-21/22); gesichtet werden sie nach [`../../sichtung/kartendienst.md`](../../sichtung/kartendienst.md).
Der Text ist unverändert und wird nicht mehr gepflegt.

---

## MAP-002 — In-App-Kartenprototyp

**Ziel.** Eine interaktive Karte mit PTV-Vektorkacheln und nummerierten
Teststopps läuft innerhalb der Anwendung, auf dem Desktop und bei 375 px.

**Stories.**

- **MAP-002a** Kartenkomponente: `maplibre-gl` als Abhängigkeit; Komponente
  `Karte` unter `src/features/tours/karte/`, die nur `MapDisplayConfig` und
  `MapOverlayStop[]` kennt; PTV-Adapter für `MapDisplayConfig`
  (Style `standard-osm`, Schlüssel per `transformRequest` als Header
  `ApiKey`; Attribution sichtbar). Kachelschlüssel aus
  `VITE_PTV_TILE_API_KEY` über `src/lib/env.ts` — optional; fehlt er, zeigt
  die Komponente den Hinweis „Kartenkacheln nicht konfiguriert" statt einer
  Karte.
- **MAP-002b** Overlays: sechs bis acht feste, nummerierte Tübinger
  Koordinaten (synthetisch, als Konstante mit Kommentar); Marker und Nummern
  als eigene Layer der Anwendung, keine Provider-Marker; Fit-Bounds auf alle
  Stopps beim Laden; Pan und Zoom; Tastaturbedienung und Fokus nach
  `docs/abnahme/README.md`.
- **MAP-002c** Vorschauseite `/touren/karte` hinter der Anmeldung,
  gekennzeichnet als Vorschau ohne Patientendaten; Eintrag in
  `ARBEITSBEREICHE.md`; Abnahmeschritte in `docs/abnahme/`.

**Akzeptanzkriterien (prüfbar).**

1. Komponententest: die Komponente rendert mit `mock`-Konfiguration und
   zeigt für n Stopps n Marker mit den Nummern 1…n (Testing Library, MapLibre
   in jsdom gestubbt).
2. Komponententest: ohne Kachelschlüssel erscheint der Konfigurationshinweis,
   und es geht **keine** Anfrage an `api.myptv.com` (fetch-Spy).
3. Typprüfung: die Komponente importiert nichts aus einem PTV-Modul — nur
   aus `contract.ts` (ESLint `no-restricted-imports` für
   `src/features/**` gegen `**/ptv*`).
4. Visuell (Playwright, Chromium, mit Schlüssel nur lokal): Karte mit
   Kacheln, alle Stopps im Bild, bei 1280 px und 375 px; Bildschirmfotos im
   Bericht.
5. Netzwerkprüfung (Playwright): Requests an den Anbieter enthalten nur
   Kachelkoordinaten `{z}/{x}/{y}`, Style, Sprites, Glyphen — keine
   Stoppkoordinaten, keine Labels.
6. `pnpm lint`, `typecheck`, `test`, `format:check`, `audit`, `scan:secrets`
   grün; `pnpm build` grün, Bundle-Zuwachs im Bericht genannt.

**Datenschutz.** Einziger Anbieterkontakt sind Kachelanfragen mit
Kartenausschnitt. Kein Termin, kein Patient, keine Adresse. Log der
Kartenkomponente: keine Koordinaten.

**Offen, im Loop zu klären und zu berichten:** ob der PTV-Schlüssel auf
Referrer/Domain beschränkbar ist (Support-Antwort von Jannes); Bundle-Größe
von `maplibre-gl` und ob die Karte als eigener Chunk erst auf der Tourenseite
lädt.

---

## MAP-003 — Fahrradrouting-Prototyp

**Ziel.** Eine Route zwischen den Teststopps wird serverseitig bei PTV
berechnet, als Linie auf derselben Karte gezeichnet, mit Distanz und Fahrzeit
angezeigt — und nichts davon gespeichert.

**Stories.**

- **MAP-003a** Edge Function `supabase/functions/location-provider/` mit dem
  `LocationProvider`-Vertrag; PTV-Adapter für `calculateRoute()` (Routing OSM
  API, Profil `OSM_BICYCLE`, Ergebnis `POLYLINE` als GeoJSON, Fehlerklassen
  nach `LocationErrorCode`, Timeout 10 s); `mock`-Adapter mit fester
  Antwort; Auswahl über Secret `LOCATION_PROVIDER=ptv|mock`; Server-Schlüssel
  `PTV_API_KEY` als Supabase-Secret. Aufruf nur mit gültiger Sitzung
  (JWT-Prüfung in der Function). Logging: Anbieterkennung, Fehlerklasse,
  Dauer — keine Koordinaten (ANN-017).
- **MAP-003b** Client: `useRoute(waypoints, profile)` über TanStack Query mit
  `staleTime` für die Sitzung und `gcTime` kurz, ohne Persistenz; Linie als
  eigener Layer auf der Karte; Distanz und Fahrzeit je Abschnitt und gesamt in
  der Vorschauseite; Zustände „lädt", „Zeitüberschreitung",
  „Anbieter nicht erreichbar", „nicht konfiguriert" mit verständlichem Text
  und Wiederholen-Schaltfläche.
- **MAP-003c** Profilbewertung: `OSM_CARGO_BICYCLE` gegen `OSM_BICYCLE` auf
  denselben Stopps; Unterschiede in Distanz/Fahrzeit im Bericht; Entscheidung,
  welches Profil `cargo_bicycle` im Vertrag abbildet, als Vorschlag an Jannes
  (kein Vorbau einer Einstellung).

**Akzeptanzkriterien.**

1. Unit-Test des PTV-Adapters mit gemocktem `fetch`: Anfrage enthält nur
   Koordinaten und Profil; Antwort wird korrekt in `RouteResult` übersetzt;
   Fehler 401/429/5xx/Timeout werden auf die richtigen `LocationErrorCode`
   abgebildet; `message` enthält keine Zahl aus der Anfrage (Regex-Test).
2. Unit-Test: die Function lehnt Aufrufe ohne gültige Sitzung mit 401 ab.
3. Komponententest: alle vier Fehlerzustände sind sichtbar und benannt.
4. Kein Schreibzugriff auf die Datenbank aus der Function
   (Code-Review-Kriterium; Test: `supabase` in der Function nur für Auth).
5. Netzwerkprüfung (Playwright, lokal): der Browser ruft nur die eigene
   Function auf, nie `api.myptv.com` außer für Kacheln.
6. Visuell: Linie liegt auf Straßen zwischen den Stopps; Distanz und Zeit
   plausibel; 375 px.
7. `pnpm test:db` unverändert grün (keine Migration) · übrige Checks grün.

**Datenschutz.** Koordinaten synthetisch. Kein Speichern. Kein Log mit
Koordinaten. Der Vorbehalt aus ADR-015 Punkt 20 für die Edge Runtime bleibt
im Bericht genannt.

**Einschränkung der Umgebung.** In der Cloud-Umgebung ist die Function nur
mit Unit-Tests prüfbar; der Lauf gegen PTV geschieht lokal bei Jannes und
in `e2e-supabase`.

---

## MAP-004 — Fahrzeitmatrix

**Ziel.** Für mehrere Teststopps liefert der Adapter eine Fahrzeitmatrix, aus
der die Anwendung deterministisch ableitet, ob zwei Termine erreichbar wären —
providerunabhängig und ohne Speicherung.

**Stories.**

- **MAP-004a** `calculateMatrix()` im PTV-Adapter (Matrix Routing OSM API,
  `TRAVEL_TIMES` und `DISTANCES`, Prüfung der 100-km-Box vor dem Aufruf,
  Fehlerklassen) und im `mock`-Adapter.
- **MAP-004b** Domänenfunktion `erreichbarkeit(prev, next, fahrzeit, puffer)`
  in `src/features/scheduling/` — reine Funktion, deterministisch (§6.2,
  ADR-005 Punkt 6), mit Tests; sie kennt keinen Anbieter, nur Sekunden.
- **MAP-004c** Vorschauseite: Matrix der Teststopps als Tabelle, Fahrzeit je
  Paar, Markierung „nicht erreichbar" bei einem konstruierten Terminraster;
  nichts wird gespeichert.

**Akzeptanzkriterien.**

1. Adapter-Unit-Test: Indexübersetzung `k = i·N + j` korrekt; `null` bei
   unerreichbaren Paaren; Box-Prüfung liefert `invalid_request` ohne Aufruf.
2. Domänentests: Erreichbarkeit mit Grenzfällen (genau passend, Puffer,
   fehlende Fahrzeit → „unbekannt", nie „erreichbar").
3. Kein Schreibzugriff auf die Datenbank; keine neue Tabelle, keine Spalte.
4. Visuell auf Desktop und 375 px.

**Datenschutz.** Wie MAP-003. Die Erreichbarkeitsregel ist eine Warnung, kein
Verbot, und wertet nichts je Person aus (B6).

---

## MAP-005 — Navigations-Handoff

**Ziel.** Auf dem Telefon führt ein prominenter Knopf „Navigation starten"
mit genau einem Tap in die Navigations-App — mit Zielkoordinate, ohne
automatische Verbindung.

**Stories.**

- **MAP-005a** `NavigationHandoff`-Implementierung: eine Funktion
  `buildNavigationUrl(target, app)` (trägt ANN-018) für Google Maps, Apple
  Maps und `geo:`; Tests je Format; Feldliste-Test: die URL enthält nur Ziel
  und Modus.
- **MAP-005b** Knopf auf der Vorschauseite je Teststopp und für den Tag
  (Zwischenziele innerhalb des Limits, sonst Abschnitte); `href` wird erst im
  Tap-Handler gesetzt (kein vorgebautes `<a href>` mit Ziel); `rel="noopener"`;
  keine automatische Öffnung.
- **MAP-005c** Gerätebewertung durch Jannes nach Abnahmeschritten: Android
  (Google Maps, Systemnavigation), iOS (Apple Maps, Google Maps) — öffnet der
  Fahrradmodus? Landet ein Koordinatenziel verständlich? Ergebnis als
  Empfehlung für die Standard-Ziel-App im Bericht; **keine** Präferenz-
  einstellung vorbauen.

**Akzeptanzkriterien.**

1. Unit-Tests: alle drei Formate; Wegpunktlimit 9/3 erzwungen (Konstante mit
   Quelle, in diesem Loop gegen die Google-Dokumentation verifiziert und im
   Prüfdokument nachgetragen); URL enthält keine der Zeichenketten aus einer
   Liste verbotener Felder (Name, Uhrzeit, Kennung).
2. Komponententest: ohne Tap wird keine URL gebaut (Spy auf die Funktion).
3. axe ohne Verstöße; Knopf mindestens 44 px hoch bei 375 px.
4. Abnahmeschritte in `docs/abnahme/` für die Gerätebewertung.

**Datenschutz.** ADR-019 Punkte 20 bis 23; der Bericht belegt die drei
Bedingungen dort.

---
