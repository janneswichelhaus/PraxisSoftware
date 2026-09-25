# Folge-Loops Kartendienst: MAP-006 und MAP-007

Stand: 2026-09-22 · Ergebnis von MAP-001 · **Loop-Vorgabe**: Eingabe für den
SPEC-Schritt des jeweils aufgerufenen Loops, kein eigener Rang · Reihenfolge
und Termine bestimmt `ROADMAP.md`, Etappe T.

Grundlage sind ADR-019 Fassung 4 (bestätigt 2026-09-22) und der Vertrag in
`src/lib/location/contract.ts`. Jeder Loop ist ein eigener
`/feature-loop`-Aufruf und baut nur seinen Abschnitt. Synthetische Daten,
Anbieterzugang durch Jannes, Privacy-Regeln und das Gate vor Echtdaten stehen
in ADR-019, Abschnitte C und E. Zusätzlich gilt für beide:

- Die Tübinger Teststopps kommen aus einer Konstante im Code — auch keine
  „Testadresse" aus dem Seed.
- Fehlt der PTV-Schlüssel, läuft der Loop gegen den `mock`-Adapter und meldet
  das im Bericht — er blockiert nicht.
- Die Prototypen liegen unter `src/features/tours/karte/`, bis MAP-006 sie
  anbindet. **Die Kennzeichnung „Vorschau" ist am 2026-09-22 entfallen**
  (Entscheidung von Jannes, `ARBEITSBEREICHE.md` Abschnitt 2): Ein Warnkasten
  über einer Seite, die nur er benutzt, sagte ihm nichts Neues. Was die Seite
  über **ihren Datenfluss** sagt, bleibt unverändert Pflicht — der Abschnitt
  „Der Kartendienst ist geprüft, aber nicht freigegeben" mit dem Gate aus
  ADR-019 Punkt 9 ist ein Kriterium der Sichtung und keine Entwicklungsnotiz.

Die gebauten Zuschnitte MAP-002 bis MAP-005 liegen in
[`archiv/MAP-LOOPS-ERLEDIGT.md`](archiv/MAP-LOOPS-ERLEDIGT.md).

---

## MAP-006 — Patient/Tour-Integration

**Gebaut 2026-09-25** (a bis e, mit synthetischen Adressen). Datenschutz-Paket:
[`../datenschutz/kartendienst.md`](../datenschutz/kartendienst.md). Scharfgeschaltet ist
nichts: Der Schalter `LOCATION_DATA_GATE` (ANN-094) steht vor dem Gate aus ADR-019 Punkt 9.

**Gebaut wird sofort, scharfgeschaltet erst nach dem Gate** (§15.2, ADR-019
Fassung 4). Der Loop entsteht vollständig mit **synthetischen** Adressen im
Seed — Migration, Geocoding-Pfad, Tagesroute, Fahrzeiten, Sichtung. Was am Gate
aus ADR-019 Punkt 9 hängt, ist allein der **erste Lauf mit echten
Patientenadressen**: DPA, §203-Verpflichtung, Subprozessoren, Retention,
EU-Region, Paid Plan, Prüfung der Edge Runtime, DSFA-Wiedervorlage. Dieser
Umschalter ist ein Hard Stop und gehört in die Go-live-Vorbedingungen
(ADR-007 Punkt 5) — der Baubeginn nicht.

**Ziel.** Die Tagesroute einer Therapeutin liegt auf der Karte, mit Route,
Fahrzeiten und Erreichbarkeit im Kalender — im Bau mit synthetischen
Adressen, nach dem Gate mit echten.

**Stories (Zuschnitt, im Loop zu schärfen).**

- **MAP-006a** Koordinaten bei der Adresse: Migration nach ANN-016
  (`lat`, `lon`, `geocode_precision` in den Patientenstammdaten und im
  Termin-Snapshot nach ANN-003), Geocoding **beim Adress-Upsert** über
  `geocode()` mit Bestätigung unterhalb Hausnummerngenauigkeit; RLS
  unverändert (Spalten folgen der Tabelle); Audit-Ereignis für die
  Geocodierung ohne Koordinaten im Kontext (ADR-010).
- **MAP-006b** Tagesstopps aus den Terminen des Tages (TOUR-001 Startort:
  Depot des Standorts, persönlicher Startort nur von der Person selbst, §20);
  Marker mit Nummer und lokal gerenderter Beschriftung (Vorname-Kürzel oder
  Nummer — nie Vollname auf der Karte); Karte in „Übersicht" und unter Touren;
  ersetzt die Vorschau `/touren`.
- **MAP-006c** Route und Fahrzeiten der Tagesroute; Erreichbarkeitswarnung
  im Kalender aus MAP-004; keine Speicherung; Auswirkung einer Terminänderung
  sichtbar (§9).
- **MAP-006d** Handoff je Stopp und für den Tag mit Koordinaten (ANN-018).
- **MAP-006e** Datenschutz-Paket: Nennung in PAT-006, VVT-Eintrag,
  DSFA-Wiedervorlage je Datenweg, Retention-Eintrag für die Koordinate
  (ADR-008), Sichtungsschritte auf einer echten Radrunde mit **synthetischen**
  Adressen (Roadmap Etappe T).

**Akzeptanzkriterien (Rahmen).** `pnpm test:db` für Migration und RLS;
Geocoding-Aufruf nur bei Adressänderung (Test: zweites Öffnen der Karte löst
keinen `geocode()` aus); Netzwerkprüfung wie MAP-003; Audit-Ereignisse ohne
Adressen; E2E des Tagesablaufs.

---

---

## MAP-007 — Führung auf dem Gerät

**Erst nach MAP-006** (ADR-019 Punkt 32) — vorher gibt es keine Tagesstopps,
die man führen könnte. Wie MAP-006 wird auch dieser Loop mit **synthetischen**
Adressen gebaut und abgenommen; am Gate hängt das Scharfschalten, nicht der
Baubeginn (§15.2).

**Grundlage.** ADR-019 Abschnitt F (seit Fassung 3) und `PROJECT_PRINCIPLES.md`
§20.1. Die vier Bedingungen dort sind der Zuschnitt: Position nur auf dem
Gerät, Start nur auf Aktion, Übermittlung an den Anbieter nur zur
Neuberechnung, keine Auswertung. Eine Story, die eine davon verletzt, gehört
nicht in diesen Loop, sondern in eine neue Fassung von §20 — und die
entscheidet nicht der Loop (§21).

**Ziel.** Wer eine Tour fährt, wird vom Startpunkt bis zum letzten Stopp
geführt, ohne die Anwendung zu verlassen — und ohne dass die Praxis erfährt,
wo jemand ist.

**Zuerst zu klären, sonst startet der Loop nicht.**

- **E-24:** Liefern `OSM_BICYCLE` und `OSM_CARGO_BICYCLE` Manöver mit? Ein
  Aufruf gegen die echte API beantwortet das; ohne ein Ja gibt es keine
  Ansage und damit kein Epic (ADR-019, offene Folgefragen).
- **B2** in der erweiterten Fassung: Reicht §20.1, um die Führung aus dem
  Beschäftigtendatenschutz herauszuhalten?
- Aufrufkontingent des Abos bei wiederholter Neuberechnung (PTV-Support).

**Stories (grober Zuschnitt, im Loop zu schärfen).**

- **MAP-007a** Manöver aus der Routenantwort in den Vertrag (`contract.ts`)
  und durch den Adapter — providerneutral wie alles andere dort.
- **MAP-007b** Positionsbezug im Browser: Geolocation, Bezug auf die Route,
  Erkennen einer Abweichung. Kein Server-Aufruf je Position.
- **MAP-007c** Neuberechnung bei Abweichung über die vorhandene Edge
  Function, mit der aktuellen Koordinate als Startpunkt (ADR-019 Punkt 29).
- **MAP-007d** Ansage: Sprachausgabe und Bildschirmwachhaltung. **Eine rein
  visuelle Führung wird nicht ausgeliefert** (ADR-019 Punkt 31).
- **MAP-007e** Start, Abbruch und Ende; Rückfall auf den Handoff aus MAP-005,
  wenn die Führung nicht zur Verfügung steht.
- **MAP-007f** Datenschutz-Paket: DSFA-Datenweg „Führung", Nennung in
  PAT-006, Ergänzung der Endgeräte-Richtlinie (BETRIEB-001).

**Akzeptanzkriterien (Rahmen).** Ein Test, der belegt, dass **keine** Position
an die eigene Anwendung geht außer bei einer Neuberechnung; kein
Positionswert in einem Log (ADR-011); Netzwerkprüfung wie MAP-003; Sichtung auf
einer echten Radrunde mit **synthetischen** Adressen, einschließlich Funkloch
(ADR-001) und Abbruch mitten in der Fahrt.

---

## Danach, nicht Teil dieser Loops

Tourenoptimierung ist ein eigenes Epic (ADR-019, „Bewusst nicht Bestandteil";
B6, ADR-005 Punkt 6); `optimizeRoute()` wird bis dahin nicht angelegt.
