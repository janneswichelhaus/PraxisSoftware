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
