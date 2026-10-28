# ADR-019: Kartendienst — In-App-Karte, Fahrradrouting, Fahrzeiten und Navigations-Handoff
## Status
Angenommen (Jannes, 2026-09-13), Fassung 7 (2026-10-26); gibt keinen Anbieter produktiv frei.

## Kontext
§9 verlangt Routen und Fahrzeiten über einen professionellen Kartendienst, §3.5 dessen Prüfung vor
der Freischaltung. Verbindlich seit 2026-09-08 (Jannes): (1) Patient:innen und Tour auf einer
interaktiven Karte, (2) Routen zwischen Terminen, (3) Fahrzeiten in Kalender und Tour, alles in der
Software; (4) Turn-by-Turn nach genau einer bewussten Aktion, (5) erst dann in einer externen App;
(6) *abgelöst durch Abschnitt F*; (7) Datenschutz und § 203 StGB bleiben gewahrt. Nicht Bestandteil:
Planungskarte aller Adressen (`IDEA-PRX-033`), übrige Endgeräte-Richtlinie, Wortlaut von PAT-006.

## Entscheidung
Abschnitt F (Punkte 27 bis 33) entscheidet, ob und unter welchen Bedingungen es eine Führung auf dem
Gerät gibt *(Fassung 3)*; Abschnitt G (34 bis 38) ist das Gate in der Technik mit Treffern und
Schätzungen *(Fassung 5)*.

1. **Rendering im Browser mit MapLibre GL JS;** die Kartenkomponente kennt nur `MapDisplayConfig`,
   nicht den Anbieter.
2. **Marker, Nummern, Beschriftungen und Reihenfolgen zeichnet die Anwendung** als Overlays; der
   Anbieter liefert nur Kacheln und sieht davon nichts.
3. **Ein serverseitiger `LocationProvider`-Adapter** mit genau `geocode()`, `calculateRoute()` und
   `calculateMatrix()`, ohne `optimizeRoute()` (ADR-014, §11): Tourenoptimierung, Sequenzierung und
   automatische Reihenfolge sind ein eigenes Epic (§9).
4. **`NavigationHandoff`** baut nur auf Aktion die URL der Navigations-App (Punkte 20 bis 23).
5. **Vertrag:** die reine Typdatei `src/lib/location/contract.ts`, ohne generische GIS-Abstraktion,
   nur so groß, dass ein Anbieterwechsel die Oberfläche nicht berührt; ein `mock`-Adapter mit festen
   Antworten macht alles ohne Anbieter entwickel- und testbar (§3.1).
6. **Drei Datenwege, getrennt betrachtet:** (1) Kacheln aus dem Browser, (2) Geocoding, Routing und
   Matrix vom Server, (3) Handoff vom Gerät der Person; Anbieter je Weg zu kombinieren bleibt
   möglich, wird aber nicht vorgebaut.
7. **PTV Developer (PTV Logistics GmbH, Karlsruhe) ist bevorzugter Kandidat für Prototyp und
   Bewertung,** nur mit den OSM-APIs (Vector Maps, Geocoding, Routing, Matrix Routing); die
   HERE-basierten PTV-APIs werden nicht verwendet.
8. **Belegstand:** Teil 1 des Prüfdokuments `docs/decisions/providerpruefung-kartendienst.md`; der
   Free Plan dient nur dem Test.
9. **PTV ist nicht produktiv freigegeben.** Die Freigabe hängt am Vertrags-/§203-/DSFA-Gate, der
   Gate-Liste in Teil 5 des Prüfdokuments (DPA mit PTV Developer, Weisungsbindung, § 203 StGB,
   OSM-Subprozessoren, Retention und Zweitnutzung, EU-Region, Vertragsmodell, Edge Runtime,
   DSFA-Wiedervorlage; *Fassung 5:* Kachelweg, Schätzungen), für alle drei Datenwege aus Punkt 6
   (Punkte 34 bis 36). Ein negativer Punkt heißt Anbieterwechsel hinter dem Vertrag; Funktion,
   Oberfläche, Overlays und Fachlogik bleiben.
10. **Google Maps Platform wird nicht Backend** für Karte, Geocoding, Routing oder Fahrzeiten (keine
    Auftragsverarbeitung mit Weisungsbindung nach §3.5, EU-Verarbeitung nicht belegt), bleibt aber
    möglicher Handoff-Zielpunkt.
11. **Zweite Wahl,** falls das Gate scheitert, je mit eigener Prüfung nach demselben Katalog:
    MapTiler für die Karte (EU-Endpunkt im Paid Plan), HERE für Routing und Matrix; GraphHopper nur
    mit schriftlichem AVV ohne die öffentliche Speicherung bis fünf Wochen und ohne Zweitnutzung;
    TomTom nicht als Basis, solange sein JavaScript-SDK Public Preview ist.
12. **An den Kartendienst gehen keine Namen,** Patienten- oder Terminkennungen, Diagnosen,
    klinischen Informationen oder Uhrzeiten; `contract.ts` hat dafür kein Feld. Die Punkte 12 bis 19
    sind Prüfregeln im Review ab MAP-006, die Prototypen halten sie schon ein.
13. **Routing und Matrix mit Koordinaten,** nicht mit Adressen.
14. **Geocoding nur beim Anlegen oder Ändern einer Adresse,** nie beim Öffnen einer Karte; die
    Koordinate ist abgeleitetes Stammdatum der Adresse mit deren Datenklasse und Frist (ANN-016).
15. **Geocoding, Routing und Matrix laufen serverseitig** (ANN-017: Supabase Edge Function); nur die
    Kacheln (Ausschnitt, Zoom) lädt der Browser direkt, nicht über den eigenen Server. Bis zur
    dokumentierten Prüfung der Edge Runtime (OPS-001, ADR-015 Punkt 20) läuft der Adapter nur gegen
    `mock` oder mit synthetischen Koordinaten, echte Adressen erst nach positivem Ergebnis (Gate,
    Punkt 9); für ANN-017 wie ANN-025 gilt: geplant ja, freigegeben nein.
16. **Keine dauerhafte Speicherung** von Fahrzeiten, Distanzen, Matrizen oder Routing-Rohantworten:
    bei der Planung abgerufen, angezeigt, verworfen (B7). *(Fassung 7)* Die Ausnahme der Fassung 6
    zu Punkt 16 und 17 (Monatssumme am Antrag auf Ladestrom) ist entfallen; ältere Anträge behalten
    ihre Summe als Beleg.
17. **Kein Live-Tracking, keine Bewegungsverläufe, keine Auswertung je Person** (§20, B6).
18. **Logs ohne Adressen und Koordinaten** (ADR-011): Der Adapter loggt Fehlerklasse, Dauer und
    Anbieterkennung, nie Anfrage oder Antwortteile (`LocationError.message`).
19. **Schlüssel:** Der Server-Schlüssel (Geocoding, Routing, Matrix) ist ein Supabase-Secret der
    Edge Function, nie im Bundle oder Repository, je Umgebung getrennt (ADR-002 Punkt 5). Der
    Kachelschlüssel ist im Browser sichtbar und kein Secret: eigener Schlüssel nur für Kacheln mit
    Kontingent und Warnschwelle, Rotation bei Verdacht; ohne Bindung an Referrer oder Domain
    mindestens ein gesondertes Kontingent.
20. **„Navigation starten“** führt aus Tagesliste, Termin und Karte mit genau einem Tap in die
    Navigations-App des Geräts; die URL entsteht erst beim Tippen, nie gespeichert, nie automatisch
    geöffnet, nie eingebettet (Prüfregel im Review). Die In-App-Karte darf beim Öffnen der Tour
    erscheinen (Anbieter als Auftragsverarbeiter, nur Kacheln).
21. **Übergeben werden nur Ziel und Fahrradmodus:** die Koordinate, sobald sie vorliegt, sonst die
    Adresse ohne Namen (ANN-018), nie Name, Uhrzeit oder Kennung. Ein Tageslink bleibt im
    dokumentierten Limit der Ziel-App (Google Maps URLs: neun Zwischenziele, drei in mobilen
    Browsern).
22. **Ziel-Apps:** Google Maps (`travelmode=bicycling`), Apple Maps (`mode=cycling`),
    Systemnavigation (`geo:`-URI, ohne Verkehrsmittel); MAP-005 bewertet, was auf den genutzten
    Geräten verlässlich im Fahrradmodus öffnet; keine vorgebaute Nutzerpräferenz.
23. **Der Handoff ist nicht automatisch rechtlich risikofrei** (Link statt Einbettung, EuGH C-40/17
    *Fashion ID*); ob er Art. 9 DSGVO oder § 203 StGB berührt, klärt B2. Bis dahin gelten kumulativ:
    a) **Endgeräteregel** (BETRIEB-001, G14/G16, TOM): auf dienstlich genutzten Geräten kein
    angemeldetes privates Google-Konto für die Navigation, oder Web- und App-Aktivitäten und
    Standortverlauf aus; b) die **Datenschutzinformation** (PAT-006) nennt die Navigations-App und
    die Übergabe nur des Ziels ohne Namen, nur auf Aktion der Therapeutin; c) **nur auf Aktion**
    (Punkt 20).
24. **MAP-002 bis MAP-005 laufen nur mit synthetischen Tübinger Koordinaten** im kostenlosen
    PTV-Abo, ohne Aktenbezug. Abo und Schlüssel legt Jannes an, nicht der Agent; der Schlüssel liegt
    in `.env.local` oder lokalen Supabase-Secrets, nie im Repository (§3.3).
25. **MAP-006** wird mit synthetischen Adressen gebaut und abgenommen; vor dem **Scharfschalten**,
    dem ersten Lauf mit echten Patientenadressen, steht das Gate aus Punkt 9 samt Paid Plan,
    DPA-Ablage in den DSFA-Unterlagen (G14) und DSFA-Wiedervorlage (B7, G12) *(Fassung 4, §15.2)*.
    Der Umschalter auf echte Adressen ist ein eigener, benannter Schritt, bleibt zu und gehört in
    die Go-live-Vorbedingungen (ADR-007 Punkt 5).
26. **Wesentliche Änderung der Routing-/Standortverarbeitung** (ADR-007 Punkt 2): DSFA-Wiedervorlage
    je Datenweg, also Kacheln, Server-Aufrufe, Handoff und *(Fassung 3)* Führung (Punkt 33).
27. **Die Führung läuft im Browser der fahrenden Person:** Die Position aus der
    Geolocation-Schnittstelle wird dort auf die Route bezogen und angesagt, nie an die
    Praxissoftware übermittelt und nirgends gespeichert, weder im Server noch im Gerät noch in einem
    Log (ADR-011); die Praxis erfährt nie, wo jemand ist (§20). Eine Führung außerhalb der Punkte 27
    bis 33 ist ausgeschlossen, auch wenn sie technisch einfacher wäre.
28. **Nur auf Aktion, und beendbar:** Start mit „Führung starten“ durch die fahrende Person, Ende
    mit der Fahrt oder einem Abbruch, nie automatisch (Prüfregel im Review wie Punkt 20).
29. **Zum Anbieter geht eine Position nur zur Neuberechnung:** Weicht die Fahrt von der Route ab,
    geht eine Anfrage über die Edge Function (ANN-017) mit der aktuellen Koordinate als Start,
    dieselbe Datenart wie ein Wegpunkt, ohne Name, Kennung und Uhrzeit (Punkt 13); kein Dauerstrom,
    eine Neuberechnung je Abweichung, nicht je Sekunde. Rate-Limits und Kontingent des Abos werden
    vor dem Epic geprüft.
30. **Keine Auswertung, keine Historie, kein Bewegungsprofil:** keine Statistik, Fahrtenliste,
    Soll-Ist oder Leistungskennzahl, auch nicht aggregiert (§20, §18).
31. **Sicherheit vor Funktion:** Sprachausgabe und die Annahme einer Lenkerhalterung sind Bedingung
    des Epics, eine rein visuelle Führung wird nicht ausgeliefert (Endgeräte-Richtlinie BETRIEB-001,
    neben Punkt 23).
32. **Erst MAP-006, dann die Führung** als eigenes Epic, gebaut und abgenommen mit synthetischen
    Adressen, das Gate vor dem Scharfschalten (§15.2, *Fassung 4*). Der Handoff bleibt bis dahin der
    Weg, danach der Rückfallweg, wenn die Führung nicht verfügbar ist; sie ersetzt ihn nicht.
    Ansagetexte, Kartenverhalten während der Fahrt, Funklöcher (ADR-001) und die Schwelle der
    Neuberechnung regelt das Epic.
33. **Die Führung ist ein eigener Datenweg in der DSFA** (Punkt 26); B2 umfasst die wiederholte
    Übermittlung von Koordinaten während einer Fahrt zu einer Patientenadresse.
34. **Die Kacheln gehören zum Gate:** Neben Gate-Punkt 6 (EU-Region samt Kachelauslieferung) und 7
    (Bindung des Kachelschlüssels) gelten **Gate-Punkt 10:** Der DPA nennt Vector-Maps-API und
    Ressourcenhost (`vectormaps-resources.myptv.com`, BEF-021); belegt ist, was der Anbieter aus
    Kachelanfragen (IP-Adresse, Ausschnitt, Zeitpunkt, Referrer) wie lange speichert, ohne
    Zweitnutzung, und ob ein CDN außerhalb der Subprozessorliste ausliefert; **Gate-Punkt 11:**
    Belegt ist, ob und woran Matrix- und Routenantworten eine Ersatzschätzung kenntlich machen.
35. **Ein Schalter für beide Wege:** Die Karte lädt Kacheln nur, wenn die Edge Function ihren
    Schalter `LOCATION_DATA_GATE` (ANN-094) als offen meldet (`synthetic` außerhalb der Produktion
    oder `released`); sonst zeigt die Tour eine nummerierte Liste mit „Karte nicht freigegeben“,
    ohne Kachelanfrage. Die Meldung trägt nur den Zustand.
36. **Ohne Angabe gilt Produktion:** Fehlt das Secret `APP_ENVIRONMENT` (`development`, `test`,
    `production`) oder ist es unbekannt, gilt `production` und dort nur `released`; `synthetic` und
    `mock` antworten `not_configured` und loggen `gate_rejected` ohne Anfrage und Koordinate. Ein
    Test belegt beide Fälle und den fehlenden Wert; lokal und in der Test-Umgebung ist der Wert
    gesetzt (`.env.example`, Anleitung der Test-Umgebung, OPS-007).
37. **Ohne Rückfrage übernommen wird nur ein eindeutiger Treffer zur vollständigen Adresse**
    (ANN-095): Straße, Hausnummer, Postleitzahl und Ort angefragt, genau ein Treffer,
    hausnummergenau; sonst zeigt die Anwendung die Treffer und braucht „Treffer übernehmen“. Ändert
    sich die Adresse, fällt die alte Koordinate der Stammdaten; angelegte Termine behalten Anschrift
    und Koordinate (ANN-003, BEF-092).
38. **Eine Ersatzschätzung ist keine Fahrzeit:** Liefert der Anbieter statt eines Routenwerts eine
    Schätzung (Luftlinie, Ersatzwert, nicht routbarer Punkt), gibt der Adapter für die Strecke
    `null`; die Oberfläche sagt „Fahrzeit nicht verfügbar“, der Fahrpuffer gilt dort als ungeprüft
    (ANN-097), auch eine gekennzeichnete Schätzung erscheint nicht. Bis belegt ist, woran PTV sie
    kenntlich macht (Gate-Punkt 11), prüft der Adapter jedes solche Kennzeichen und gibt auch bei
    unbekanntem `null`.

## Konsequenzen
- Adressen ohne Hausnummer oder mit mehreren Treffern brauchen einen Tipp, Randlagen zeigen Lücken
  statt Fahrzeiten.
- Die Führung ist die teuerste Einzelfunktion der Etappe und erhöht die Menge der Koordinaten beim
  Anbieter, nicht ihre Art.

## Offene Folgefragen
- offen: B2 (OPEN_DECISIONS) für Punkt 23 und 33: Einwilligung oder Art. 9 Abs. 2 lit. h DSGVO mit
  § 22 BDSG, § 203 Abs. 3 StGB bei einer Adresse ohne Namen, Beschäftigtendatenschutz (§20.1).
- offen: E-24 (OPEN_DECISIONS); bei Nein braucht Abschnitt F einen zweiten, nach §3.5 geprüften
  Datenlieferanten.
- offen bei PTV (Teil 4 des Prüfdokuments): Schlüsselbindung, Matrixgröße, Rate-Limits.
- Wie wird die Endgeräteregel geprüft, ohne das Telefon zu kontrollieren (§20)? Vorschlag für
  BETRIEB-001: schriftliche Bestätigung.

## Änderungshistorie
- Fassung 1 (2026-09-08): vorgeschlagen, nie angenommen (Commit `c5c7b21`).
- Fassung 2 (2026-09-08, Jannes, angenommen 2026-09-13): In-App-Karte, PTV-Kandidat, Gate (Punkt 9).
- Fassung 3 (2026-09-22, Jannes): löst Kontext-Punkt 6 ab, Abschnitt F (§20.1).
- Fassung 4 (2026-09-22, Jannes): Gate vor dem Scharfschalten statt vor dem Bau, Umfang gleich.
- Fassung 5 (2026-10-02, Jannes): Abschnitt G (Kachel-Gate, ein Schalter, Treffer, Schätzungen).
- Fassung 6 (2026-10-17, Jannes, Variante A): Kilometer am eigenen Antrag auf Ladestrom (zu 16, 17).
- Fassung 7 (2026-10-26, Jannes): Ladestrom wie Einkauf mit Beleg, Ausnahme der Fassung 6 entfällt.
- Verdichtet 2026-10-27 (Aufräumen 5), Inhalt unverändert; früherer Wortlaut: `git log -p`.
