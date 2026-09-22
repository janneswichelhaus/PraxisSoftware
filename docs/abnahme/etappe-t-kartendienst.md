# Abnahme — Etappe T: Kartendienst

Prüfschritte der Loops aus **Etappe T**
([`../development/ROADMAP.md`](../development/ROADMAP.md), Spezifikation in
[`../development/MAP-LOOPS.md`](../development/MAP-LOOPS.md)). Voraussetzung
und Aufbau stehen in [`README.md`](README.md).

## MAP-002 — In-App-Kartenprototyp

Prüfschritte zu **MAP-002a/b/c**. Grundlage: ADR-019 Fassung 2, Punkt 1, 12,
15, 19 und 24.

**Dieser Loop bringt keine Migration und keinen geänderten Seed**, aber eine
**neue Abhängigkeit**: vorher `git pull origin main`, dann `pnpm install`.

**Ein Schritt, der nur bei Jannes geht:** Der Kachelschlüssel aus dem
kostenlosen PTV-Developer-Abo gehört in die lokale, ungetrackte `.env.local`:

```
VITE_PTV_TILE_API_KEY=<Schlüssel aus dem PTV-Konto>
```

Danach `pnpm dev` **neu starten** — Vite liest `.env.local` beim Start. Ohne
Schlüssel ist die Prüfung nicht wertlos: Dann muss Schritt 1 den Hinweis
zeigen und Schritt 4 **keine** Anfrage finden.

Alles als `anna.beispiel@praxis.invalid` (therapist) oder
`jannes.test@praxis.invalid` (owner).

### 1. Die Karte liegt in der Anwendung

1. **Kalender → Touren** öffnen, dann **„Kartenprototyp mit Teststopps
   öffnen"**. Erwartung: `/touren/karte` mit dem Vorschauhinweis über der
   Karte. Beim ersten Öffnen lädt die Karte spürbar nach — sie ist ein
   eigener Abschnitt und kommt erst hier, nicht beim Anmelden.
2. **Mit Schlüssel:** Kartenmaterial mit Straßen und Namen, darauf acht
   dunkelgrüne Kreise mit den Nummern 1 bis 8, alle im Bild. Unten rechts
   steht die Quellenangabe „© PTV Group, © OpenStreetMap-Mitwirkende".
   **Ohne Schlüssel:** an derselben Stelle der Kasten „Kartenkacheln nicht
   konfiguriert" — kein leeres graues Feld, keine Fehlermeldung.
3. Unter der Karte stehen dieselben acht Stopps als Liste mit ihren
   Koordinaten. Erwartung: Die Liste ist der zweite Weg zu denselben Punkten —
   wer die Karte nicht sehen oder nicht bedienen kann, bekommt hier dasselbe.

### 2. Bedienung, auch am Telefon

1. Ziehen, zoomen mit Mausrad oder zwei Fingern, die Knöpfe **+** und **−**
   benutzen. Erwartung: Die Marker bleiben auf ihren Punkten.
2. Fenster auf **375 px** stellen (oder am Telefon öffnen). Erwartung: Kein
   waagerechtes Scrollen, alle acht Stopps im Bild, die Zoomknöpfe mindestens
   44 px hoch und mit dem Daumen zu treffen.
3. Nur mit der **Tastatur**: mit Tab bis zu den Zoomknöpfen, mit Enter
   auslösen; dann in die Karte tabben und mit den Pfeiltasten verschieben.
   Erwartung: Der Fokus ist sichtbar, beides reagiert.

### 3. Was die Seite über sich selbst sagt

1. Erwartung: Der Vorschauhinweis nennt die Punkte „erfunden" und sagt, dass
   kein Termin und keine Person dahintersteht.
2. Erwartung: Unter der Karte steht der Kasten „Der Kartendienst ist geprüft,
   aber nicht freigegeben" mit dem Gate aus ADR-019. **Wenn dieser Kasten
   fehlt, ist die Abnahme nicht bestanden** — die Seite darf nicht aussehen
   wie eine fertige Anbindung.

### 4. Was zum Anbieter geht (die eigentliche Prüfung)

1. Entwicklerwerkzeuge → **Netzwerk**, Filter `myptv`, Seite neu laden.
2. **Mit Schlüssel** erwartet: Anfragen an `vectormaps-resources.myptv.com`
   (Style, Sprites, Glyphen) und an `api.myptv.com/maps-osm/v1/vector-tiles/…`
   mit Zahlen für Zoom, Spalte und Zeile. **Nicht** erwartet: eine
   Koordinate aus der Stoppliste, die Zeichen „48.5" oder „9.0" in einer
   Adresse, ein Name, eine Terminkennung, die Zeichenkette `apiKey=` in der
   Adresszeile einer Anfrage.
3. Eine Kachelanfrage anklicken → **Kopfzeilen**. Erwartung: Der Schlüssel
   steht als `ApiKey` im Kopf der Anfrage, nicht in der Adresse.
4. **Ohne Schlüssel** erwartet: **keine einzige** Anfrage an einen
   `myptv.com`-Host.

### 5. Der Rest der Anwendung bleibt unberührt

1. Kalender, Patientenakte und Abrechnung öffnen. Erwartung: unverändert; im
   Netzwerkfenster keine Kachelanfrage. Die Karte lädt nur auf ihrer eigenen
   Seite.

**Bekannte Grenze dieser Abnahme:** Sie prüft die Anzeige, nicht die
Rechtslage. Echte Adressen erreichen den Kartendienst erst nach dem Gate aus
ADR-019 Punkt 9 (Vertrag, § 203 StGB, DSFA) — bis dahin bleibt es bei
erfundenen Koordinaten.

## MAP-003 — Fahrradrouting-Prototyp

Prüfschritte zu **MAP-003a/b/c**. Grundlage: ADR-019 Fassung 2, Punkt 7, 13,
15, 16, 18 und 24; ANN-017 und ANN-090.

**Dieser Loop bringt keine Migration, keinen geänderten Seed und keine neue
Abhängigkeit**: `git pull origin main` genügt.

**Drei Schritte, die nur bei Jannes gehen** — in der Cloud-Umgebung läuft
weder Docker noch die Deno-Laufzeit:

1. In `supabase/config.toml` für diesen Lauf `[edge_runtime] enabled = true`
   setzen. **Die Zeile bleibt im Repository auf `false`**: Die Laufzeit ist
   nach ADR-015 Punkt 20 nicht freigegeben, und was hier läuft, läuft mit
   synthetischen Koordinaten (ADR-019 Punkt 15). Nach der Abnahme
   zurückstellen.
2. Eine ungetrackte `supabase/functions/.env.local` anlegen — `.env.*` ist in
   `.gitignore`:

   ```
   LOCATION_PROVIDER=ptv
   PTV_API_KEY=<derselbe Schlüssel wie für die Kacheln, Entscheidung 2026-09-21>
   ```

3. `pnpm dlx supabase@2.116.0 start`, dann in einem zweiten Terminal
   `pnpm dlx supabase@2.116.0 functions serve --env-file supabase/functions/.env.local`.

Alles als `anna.beispiel@praxis.invalid` (therapist) oder
`jannes.test@praxis.invalid` (owner).

### 1. Die Route liegt auf der Karte

1. **Kalender → Touren → „Kartenprototyp mit Teststopps öffnen"**. Erwartung:
   unter der Karte der Abschnitt **„Die Route"**, zuerst „Route wird berechnet
   …", dann Strecke und Fahrzeit.
2. Erwartung: eine durchgehende dunkelgrüne Linie zwischen den acht Markern,
   und zwar **auf Straßen** — nicht quer über Häuser. Genau das unterscheidet
   die echte Antwort von der Nachbildung.
3. Erwartung: „Je Abschnitt" listet sieben Zeilen (1 → 2 bis 7 → 8), die
   Summe der Abschnitte passt ungefähr zur Gesamtangabe.
4. Mit `LOCATION_PROVIDER=mock` erneut: Erwartung: Luftlinien statt Straßen
   **und** der Hinweis „Nachbildung ohne Kartendienst" darüber. **Fehlt der
   Hinweis, ist die Abnahme nicht bestanden.**

### 2. Die Zustände, die eine Praxis unterscheiden muss

**Die Prüffrage ist nicht „steht da ein Fehler", sondern „zeigt er auf den
Richtigen"** — das war der Fund BEF-027 aus dem ersten Lauf. Jeder Zustand
nennt eine andere Abhilfe, und ein falscher Schuldiger schickt die Suche an
die falsche Stelle.

1. `LOCATION_PROVIDER` aus der Datei nehmen, `functions serve` neu starten,
   Seite neu laden. Erwartung: „Kein Kartendienst eingerichtet" mit den zwei
   Secret-Namen — **keine** Meldung über einen Ausfall des Anbieters
   (ANN-090).
2. `functions serve` beenden, Seite neu laden. Erwartung: **„Routenfunktion
   antwortet nicht"** — nicht „Kartendienst nicht erreichbar". Die Stopps
   stehen weiter auf Karte und Liste.
3. In beiden Fällen: **„Erneut versuchen"** anklicken. Erwartung: Der Versuch
   läuft erkennbar neu; nach dem Start der Function kommt die Route.
4. Einen falschen `PTV_API_KEY` eintragen. Erwartung: „Kartendienst weist den
   Serverschlüssel ab" — und im `serve`-Fenster **eine** Logzeile
   (`ptv unauthorized nach … ms`). Ohne diese Zeile war der Anbieter nicht im
   Spiel, und die Meldung wäre falsch.
5. Abmelden und die Seite offen lassen (oder den Token verfallen lassen).
   Erwartung: **„Anmeldung gilt nicht mehr"** — nicht der Kartendienst,
   nicht der Serverschlüssel.
6. Fehlt der Function `SUPABASE_URL` oder `SUPABASE_ANON_KEY`, erwartet:
   „Kein Kartendienst eingerichtet" mit der **benannten Variable** in der
   Meldung und einer Logzeile mit der Kennung `sitzung`.

### 3. Was zum Anbieter geht (die eigentliche Prüfung)

1. Entwicklerwerkzeuge → **Netzwerk**, Seite neu laden, Filter `myptv`.
   Erwartung: **nur Kachel-, Style-, Sprite- und Glyphenanfragen**. Eine
   Routing-Anfrage aus dem Browser an `api.myptv.com/routing/…` wäre ein
   Fehler — sie muss vom Server kommen.
2. Filter auf `functions/v1`. Erwartung: **ein** `POST` auf
   `…/functions/v1/location-provider` je Profil, im Rumpf ausschließlich
   `waypoints`, `profile` und — seit MAP-004 — `aufgabe: "route"`. Kein Name,
   keine Terminkennung, keine Uhrzeit.
3. Die Antwort ansehen. Erwartung: Kopfzeile `Cache-Control: no-store`.
4. Im Terminal von `functions serve`: Erwartung: Bei einem Fehler **eine**
   Zeile mit Anbieterkennung, Fehlerklasse und Dauer — **keine Koordinate**,
   keine Adresse, kein Schlüssel (ADR-011, ADR-019 Punkt 18).
5. Abmelden, dann `…/functions/v1/location-provider` ohne Sitzung aufrufen
   (zweites Browserfenster oder `curl -X POST`). Erwartung: **401**, und im
   Terminal keine Anbieteranfrage.

### 4. Die Profilfrage (MAP-003c) — **entschieden am 2026-09-22**

Gemessen über die volle Runde mit acht Stopps:

| Profil        | Strecke     | Fahrzeit                              |
| ------------- | ----------- | ------------------------------------- |
| Fahrrad       | 25,4 km     | 1 Std. 19 Min.                        |
| **Lastenrad** | **26,2 km** | **1 Std. 19 Min.** (+770 m · +1 Min.) |

**Jannes hat das Lastenradprofil gewählt.** Die Zahlen haben es nicht
entschieden — sie liegen drei Prozent und eine Minute auseinander und tragen
keine Planung. Entschieden hat das Rad, das gefahren wird. Die 770 Meter
Umweg sind dabei eher ein Argument dafür als dagegen: Sie deuten darauf hin,
dass das Profil eine Stelle umfährt, die es dem Fahrrad zumutet — geprüft ist
das nicht, es ist die naheliegende Erklärung. Und der Fehler wäre in dieser
Richtung billiger: Eine Minute mehr kostet nichts, eine Stelle, an der das
Rad nicht durchkommt, kostet auf der Straße.

Was das **nicht** heißt: keine Einstellung, kein Schalter, und der
Kartenprototyp fragt weiterhin beide Profile ab — der Vergleich ist sein
Zweck. Die Wahl hängt an genau einer Stelle: dem Kommentar zu
`TravelProfile` in `src/lib/location/contract.ts`. Wo eine Tourenplanung
später **ein** Profil braucht (zuerst **MAP-004**), ist es dieses.

### 5. Telefon und Rest der Anwendung

1. Fenster auf **375 px**. Erwartung: Linie sichtbar, Abschnittsliste lesbar,
   kein waagerechtes Scrollen, „Erneut versuchen" mit dem Daumen zu treffen.
2. Kalender, Akte, Abrechnung öffnen. Erwartung: unverändert, keine Anfrage
   an `functions/v1`.

**Zur Schreibweise der Abfrage (BEF-023, erledigt am 2026-09-21):** Sie ist
inzwischen mit dem Schlüssel gegen die echte API geprüft und korrigiert —
Pfad `routing-osm/v1/routes`, `results=POLYLINE,LEGS` als Liste, kein
`polylineFormat`, und die Polylinie kommt als Zeichenkette. Antwortet PTV
trotzdem mit 400, steht die Ursache im Antwortkörper unter `causes`; sie
gehört dann hierher und in
[`../development/BEFUNDE.md`](../development/BEFUNDE.md). Korrigiert wird
`supabase/functions/location-provider/ptv.ts` und sonst nichts.

---

## MAP-004 — Fahrzeitmatrix

Prüfschritte zu **MAP-004a/b/c**. Grundlage: ADR-019 Fassung 3, Punkt 12, 13,
15, 16, 19 und 24; die Erreichbarkeitsregel zusätzlich `PROJECT_PRINCIPLES.md`
§6.2 und ADR-005 Punkt 6.

**Dieser Loop bringt keine Migration, keinen geänderten Seed und keine neue
Abhängigkeit**: `git pull origin claude/erste-offene-aufgabe-9x6r1d` genügt.
Aufbau wie bei MAP-003 — `[edge_runtime] enabled = true` nur für den Lauf,
`supabase/functions/.env.local`, `functions serve`.

### 1. Der wichtigste Schritt: Stimmt die Anfrage überhaupt?

**Die Schreibweise der Matrix-Anfrage ist nicht belegt.** Sie ist aus dem
offiziellen Client abgeleitet, weil `api.myptv.com` aus der Cloud-Umgebung
gesperrt ist und der Schlüssel bei Jannes liegt — dieselbe Lage wie bei der
Route vor **BEF-023**, und dort war sie an drei Stellen falsch. Dieser Schritt
ist deshalb der erste.

1. Seite `/touren/karte` öffnen. Erwartung: unter der Route der Abschnitt
   **„Die Fahrzeiten"** mit einer 8 × 8-Tabelle voller Minutenangaben.
2. Kommt stattdessen **„Kartendienst nicht erreichbar"** oder **„Anfrage nicht
   gültig"**: Im `serve`-Fenster steht die Fehlerklasse, im Netzwerkfenster die
   Antwort des Anbieters unter `causes`. Beides gehört in
   [`../development/BEFUNDE.md`](../development/BEFUNDE.md) und hierher.
   Korrigiert wird `supabase/functions/location-provider/ptv.ts` und sonst
   nichts — Pfad, Parameter oder Feldnamen, je nachdem, was dort steht.
3. Erwartung: Die Werte sind plausibel — Tübinger Stadtgebiet, also wenige
   Minuten je Paar, die Diagonale ein Punkt („derselbe Stopp") und keine Zelle
   mit einer Stunde.
4. Mit `LOCATION_PROVIDER=mock` erneut: Erwartung: Werte **und** der Hinweis
   „Nachbildung ohne Kartendienst" darüber. Fehlt er, ist die Abnahme nicht
   bestanden.

### 2. Was zum Anbieter geht

1. Entwicklerwerkzeuge → **Netzwerk**, Filter `functions/v1`. Erwartung:
   **ein** `POST` für die Matrix, im Rumpf ausschließlich `aufgabe: "matrix"`,
   `origins`, `destinations` und `profile` — je Punkt nur `lat` und `lon`.
   Kein Name, keine Terminkennung, keine Uhrzeit; das Terminraster bleibt hier.
2. Erwartung: `profile` ist `cargo_bicycle`, und es gibt **keinen** zweiten
   Abruf zum Vergleich. Die Route fragt weiter beide Profile ab, die Matrix
   nur das gewählte.
3. Filter `myptv`. Erwartung: weiterhin **nur** Kacheln, Style, Sprites,
   Glyphen. Eine Matrixanfrage aus dem Browser wäre ein Fehler.
4. Antwort ansehen. Erwartung: `Cache-Control: no-store`.
5. Im `serve`-Fenster bei einem Fehler: **eine** Zeile mit Anbieterkennung,
   Klasse und Dauer — keine Koordinate (ADR-011).

### 3. Die Markierung sagt das Richtige

1. Erwartung: Unterhalb der Diagonale ist fast alles markiert — rückwärts
   durch den Tag hat der nächste Termin schon begonnen. Der Satz über der
   Tabelle sagt genau das.
2. Erwartung: Oberhalb der Diagonale ist ein Teil markiert und ein Teil nicht.
   Nachrechnen an einer Zelle: Nachbarstopps haben 15 Minuten Lücke, davon
   5 Minuten Puffer — 10 Minuten Fahrt passen, 11 nicht.
3. Erwartung: Jede markierte Zelle trägt ein **×** neben der Zahl. Die
   Bedeutung darf nicht allein an der Farbe hängen.
4. Erwartung: Der Text unter der Tabelle nennt das Raster „erfunden" und sagt,
   dass nichts gespeichert wird.

### 4. Telefon und Tastatur

1. Fenster auf **375 px**. Erwartung: Die **Tabelle** scrollt seitwärts, die
   **Seite nicht**. Genau das war im Loop der erste Befund; wer hier doch die
   ganze Seite verschieben kann, hat einen Rückfall gefunden.
2. Erwartung: Der Satz über der Tabelle bricht um und ist vollständig lesbar.
3. Mit der **Tastatur** in die Tabelle tabben und mit den Pfeiltasten
   scrollen. Erwartung: Der Fokus ist sichtbar, die Tabelle bewegt sich.
4. Mit einer Vorlesesoftware (VoiceOver, NVDA) über eine markierte Zelle:
   Erwartung: „… von 3 nach 1, nicht erreichbar" — Zahl **und** Befund.

### 5. Nichts ist geblieben

1. Seite neu laden. Erwartung: Die Matrix wird neu geholt; es gibt keinen
   Zwischenstand aus dem letzten Besuch.
2. `localStorage` und `sessionStorage` in den Entwicklerwerkzeugen ansehen.
   Erwartung: kein Eintrag mit Fahrzeiten, Koordinaten oder Matrix.
3. In der Datenbank (Studio) nach einer neuen Tabelle oder Spalte suchen.
   Erwartung: keine — dieser Loop hat keine Migration.
