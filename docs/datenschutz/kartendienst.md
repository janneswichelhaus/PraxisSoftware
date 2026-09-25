# Datenschutz-Paket Kartendienst (MAP-006e)

Stand: 2026-09-25 · Gebaut mit MAP-006 · Verantwortlich: Praxisleitung (`owner`)

Zuarbeit zu den Vorbedingungen des Produktivstarts aus
[ADR-007](../adr/ADR-007-data-protection-impact-assessment.md) Punkt 5 für den Datenweg des
Kartendienstes ([ADR-019](../adr/ADR-019-map-service.md)). Das Dokument sagt, **was die Software
seit MAP-006 mit Adressen und Koordinaten tut** — als Vorlage für Verarbeitungsverzeichnis,
DSFA-Wiedervorlage und Lösch-/Aufbewahrungskonzept. Es ist kein Rechtsgutachten; die Bewertung
gehört in die Datenschutzprüfung (B2, G14).

**Gebaut und abgenommen wird mit synthetischen Adressen.** Echte Patientenadressen erreichen den
Kartendienst erst nach dem Gate aus ADR-019 Punkt 9 — technisch verriegelt durch den Schalter
`LOCATION_DATA_GATE` (ANN-094, unten).

## Eintrag für das Verzeichnis der Verarbeitungstätigkeiten

| Feld                 | Inhalt                                                                                                                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bezeichnung          | Tourenplanung der Hausbesuche: Kartenposition der Adresse, Tagesroute, Fahrzeit, Navigation                                                                                                                                                             |
| Zweck                | Hausbesuche erreichen; prüfen, ob zwei Termine mit der Fahrzeit vereinbar sind (§8.1, §9)                                                                                                                                                               |
| Betroffene           | Patient:innen mit Hausbesuch; mittelbar Therapeut:innen (wessen Tour)                                                                                                                                                                                   |
| Datenkategorien      | Anschrift (Straße, Hausnummer, PLZ, Ort) und daraus abgeleitete Koordinate mit Genauigkeit (ANN-016); Termine des Tages (Zeit, Reihenfolge) nur innerhalb der Anwendung                                                                                 |
| Empfänger            | Kartendienst (Kandidat PTV Developer, Auftragsverarbeitung nach Gate): beim Geocoding die Anschrift ohne Namen, bei Route und Matrix nur Koordinaten; Navigations-App des Geräts beim Handoff: nur die Koordinate bzw. Anschrift ohne Namen, auf Tippen |
| Nicht übermittelt    | Namen, Patienten- und Terminkennungen, Uhrzeiten, Diagnosen, Zugangshinweise (ADR-019 Punkt 12)                                                                                                                                                         |
| Speicherung          | Koordinate bei der Adresse und im Hausbesuchs-Snapshot; **keine** Fahrzeiten, Routen oder Rohantworten (ADR-019 Punkt 16)                                                                                                                               |
| Frist                | Koordinate wie die Adresse, die sie trägt (unten)                                                                                                                                                                                                       |
| Technische Maßnahmen | Aufrufe nur über die eigene Edge Function mit Sitzungsprüfung; Serverschlüssel als Secret; Logs ohne Adresse und Koordinate (ADR-011); Schalter `LOCATION_DATA_GATE`; Audit `patient.address_geocoded` ohne Koordinate                                  |

## DSFA-Wiedervorlage je Datenweg (ADR-019 Punkt 26)

MAP-006 ist eine wesentliche Änderung der Routing-/Standortverarbeitung (ADR-007 Punkt 2). Die
Wiedervorlage betrachtet vier Wege getrennt:

1. **Kacheln aus dem Browser.** Unverändert seit MAP-002: Kartenausschnitt und Zoom, mittelbar
   also, wo gearbeitet wird. Neu ist nur, dass die Tour **echte** Stopps zeigt — die Kachelanfrage
   selbst trägt weiterhin keinen Stopp.
2. **Geocoding vom Server (neu).** Die Anschrift geht **einmal je Änderung** an den Anbieter, auf
   ausdrückliche Handlung („Adresse verorten", ANN-095), nie beim Öffnen einer Karte. Die
   Anschrift steht dabei in der Anfrageadresse beim Anbieter (Endpunkt nur mit `GET`); in eigenen
   Logs steht sie nie. Zu klären: Retention der Anfrage beim Anbieter (Prüfdokument, Teil 5).
3. **Route und Fahrzeit vom Server.** Koordinaten der Stopps in Fahrtreihenfolge, bei jedem Öffnen
   der Tour und bei jeder Kalenderprüfung mit Personenfilter. Fahrzeiten werden im Browser
   angezeigt und über `check_travel_buffers` geprüft, **nicht gespeichert** (ANN-097).
4. **Handoff vom Gerät.** Seit MAP-006d die Koordinate statt der Anschrift (ANN-018); B2 bleibt
   offen (ADR-019 Punkt 23).

Beschäftigtendatenschutz (§20): Es entsteht keine Fahrtenhistorie, keine gespeicherte Fahrzeit,
keine Auswertung je Person. Der Startort ist die Praxis oder der erste Besuch; ein persönlicher
Startort ist bewusst nicht gebaut (ANN-096).

## Aufbewahrung (ADR-008)

| Daten                                   | Datenklasse und Frist                                                                              |
| --------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Koordinate an `patient_contact_details` | wie die Adresse: Patientenakte; verfällt zusätzlich bei jeder Adressänderung (Trigger)             |
| Koordinate im Termin (`visit_lat/lon`)  | wie der Termin (ANN-003); bei abgesagten Terminen dieselbe offene Frage wie für die Adresse selbst |
| Koordinate des Standorts                | Betriebsdatum der Praxis, keine Personenangabe                                                     |
| Routing-Rohdaten (ADR-008, 30 Tage)     | **leer** — es wird nichts gespeichert                                                              |

Die Koordinate liegt in bestehenden Tabellen; der Retention Schedule ordnet Tabellen zu und
braucht deshalb keinen neuen Eintrag. Die Auskunft nach Art. 15 enthält die Koordinate.

## Go-live-Vorbedingung: der Schalter `LOCATION_DATA_GATE` (ANN-094)

Ohne den Wert `synthetic` oder `released` antwortet die Function mit „nicht eingerichtet", auch
wenn ein Schlüssel vorliegt. Für die Produktion gilt:

- `released` wird erst gesetzt, wenn alle neun Punkte des Gates aus ADR-019 Punkt 9 positiv
  abgeschlossen und in den DSFA-Unterlagen abgelegt sind (Vertrag mit Nennung der OSM-APIs,
  §203-Verpflichtung, Subprozessoren, Retention und Zweitnutzung, EU-Region, Paid Plan, Prüfung
  der Edge Runtime nach OPS-001, DSFA-Wiedervorlage).
- `synthetic` ist in einer Umgebung mit echten Daten **nie** zulässig.
- Wer den Schalter setzt, vermerkt Datum und Grundlage in den DSFA-Unterlagen.

## Datenschutzinformation (PAT-006)

Der Abschnitt „Hausbesuche und Kartendienst" in `src/features/datenschutz/patienteninformation.ts`
nennt Adresse beziehungsweise Kartenposition, schließt Name, Termine, Uhrzeiten und
Gesundheitsangaben aus und sagt, dass Fahrzeiten nicht gespeichert werden. Seit MAP-006 ergänzt
er, dass die Kartenposition mit der Adresse gespeichert und mit ihr gelöscht wird. Der Wortlaut
bleibt Entwurf bis B2.
