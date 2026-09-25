import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { Karte } from '@/features/tours/karte/Karte';
import { Fahrtabschnitt, Routenzusammenfassung } from '@/features/tours/Fahrten';
import { Tourenliste } from '@/features/tours/Tourenliste';
import { kartenmarker, type Stopp } from '@/features/tours/tagesroute';
import type { DayPlanEntry } from '@/features/today/api';
import type { Coordinate, MapDisplayConfig } from '@/lib/location/contract';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `karte.html`.
 *
 * Gerendert werden dieselben Komponenten wie auf der Tourenseite (MAP-006b) —
 * Karte und Tourenliste —, mit acht erfundenen Stopps in Tübingen statt der
 * Termine eines Tages. Die Tourenseite selbst liegt hinter der Anmeldung, und
 * in der Cloud-Entwicklungsumgebung läuft kein GoTrue; ohne diese Seite ließe
 * sich keine der Komponenten in einem echten Browser ansehen, schon gar nicht
 * bei 375 px. Nur die Anzeigekonfiguration kommt von hier statt vom Adapter.
 */

/** Acht erfundene Punkte im Stadtgebiet von Tübingen, ohne Bezug zu einer Adresse. */
const PUNKTE: readonly Coordinate[] = [
  { lat: 48.5216, lon: 9.0576 },
  { lat: 48.5305, lon: 9.049 },
  { lat: 48.5164, lon: 9.0349 },
  { lat: 48.5092, lon: 9.0655 },
  { lat: 48.5241, lon: 9.0762 },
  { lat: 48.5387, lon: 9.0668 },
  { lat: 48.5024, lon: 9.0411 },
  { lat: 48.5145, lon: 9.0908 },
];

/** Ein erfundener Termin je Punkt, 45 Minuten Takt ab 8 Uhr. */
function termin(index: number): DayPlanEntry {
  const beginn = new Date(Date.UTC(2026, 8, 10, 6, index * 45));
  const ende = new Date(beginn.getTime() + 30 * 60_000);
  return {
    id: `t${index + 1}`,
    patient_id: `p${index + 1}`,
    staff_member_id: 's',
    appointment_type: 'home_visit',
    kind: 'therapy',
    title: null,
    status: 'confirmed',
    starts_at: beginn.toISOString(),
    ends_at: ende.toISOString(),
    patient_given_name: 'Test',
    patient_family_name: `Stopp ${index + 1}`,
    location_name: null,
    visit_street: 'Prüfweg',
    visit_house_number: String(index + 1),
    visit_postal_code: '72070',
    visit_city: 'Tübingen',
    patient_phone: null,
    patient_phone_mobile: null,
    home_visit_access_note: null,
    special_note: null,
    documentation_status: null,
    organization_time_zone: 'Europe/Berlin',
  };
}

const STOPPS: Stopp[] = PUNKTE.map((position, index) => ({
  nummer: index + 1,
  termin: termin(index),
  position,
  genauigkeit: 'address',
}));

const MARKER = kartenmarker(null, STOPPS);

/**
 * Ein gültiger MapLibre-Style ohne eine einzige Netzanfrage.
 *
 * Kein `sources`, keine Glyphen, keine Sprites: nur eine Hintergrundfläche.
 * Der Style entsteht als `blob:`-Adresse im Browser, damit die Prüfung
 * beweisen kann, was sie behauptet - **während des Laufs verlässt keine
 * einzige Anfrage den Ursprung.** Mit einer echten Kachel-URL wäre derselbe
 * Test eine Anbieterprüfung und kein Renderer-Nachweis.
 */
const styleOhneNetz = {
  version: 8,
  sources: {},
  layers: [{ id: 'hintergrund', type: 'background', paint: { 'background-color': '#e6ece4' } }],
};

/**
 * Derselbe Style, aber mit eigener Quellenangabe - wie ihn ein Anbieter
 * liefert (BEF-022).
 *
 * Die Quelle trägt keine Daten und lädt nichts; sie existiert allein, damit
 * MapLibre eine Quellenangabe zu zeigen hat.
 */
const styleMitQuelle = {
  ...styleOhneNetz,
  sources: {
    probe: {
      type: 'geojson',
      attribution: '© Quelle aus dem Style',
      data: { type: 'FeatureCollection', features: [] },
    },
  },
  layers: [
    ...styleOhneNetz.layers,
    // Die Ebene zeichnet nichts - die Quelle ist leer. Sie muss trotzdem da
    // sein: MapLibre zeigt die Angabe einer Quelle nur, wenn eine Ebene sie
    // benutzt.
    { id: 'probe', type: 'circle', source: 'probe' },
  ],
};

const parameter = new URLSearchParams(location.search);

/**
 * Mit `?fehler=1` zeigt die Prüfseite den Fall, der MAP-002 im echten Betrieb
 * eingeholt hat: Der Style kommt nicht an (BEF-021). Mit `?quelle=1` den
 * Fall, in dem der Style seine Quellenangabe selbst mitbringt (BEF-022).
 *
 * Die Fehleradresse liegt im eigenen Ursprung und läuft ins Leere - kein
 * Anbieter wird dafür gebraucht, und der Lauf bleibt ohne Netz.
 */
const styleAdresse = parameter.has('fehler')
  ? '/tests/e2e/fixtures/diesen-style-gibt-es-nicht.json'
  : URL.createObjectURL(
      new Blob([JSON.stringify(parameter.has('quelle') ? styleMitQuelle : styleOhneNetz)], {
        type: 'application/json',
      }),
    );

const config: MapDisplayConfig = {
  styleUrl: styleAdresse,
  attribution: '© Prüfstyle ohne Netz',
  minZoom: 0,
  maxZoom: 17,
};

/**
 * Mit `?route=1` liegt zusätzlich eine Linie auf der Karte (MAP-003b).
 *
 * Der Linienzug sind die Stopps selbst: Ohne Anbieter gibt es hier keine
 * gefahrene Strecke, und eine erfundene Kurve wäre für die Prüffrage nichts
 * wert. Gefragt ist, ob MapLibre die Ebene annimmt und zeichnet — nicht, ob
 * der Weg durch die Stadt stimmt.
 */
const route = parameter.has('route') ? PUNKTE : undefined;

const wurzel = document.getElementById('wurzel');
if (!wurzel) throw new Error('Wurzelelement der Prüfseite fehlt.');

createRoot(wurzel).render(
  <MemoryRouter>
    <Karte
      config={config}
      stopps={MARKER}
      beschriftung={`Karte mit ${MARKER.length} Teststopps in Tübingen`}
      route={route}
    />
    {/*
      Mit `?handoff=1` steht die Tourenliste mit dem Navigations-Handoff
      darunter (MAP-005b, seit MAP-006 die echte Liste der Tourenseite).

      Die Prüffragen dazu beantwortet kein jsdom: ob ein Tippziel wirklich
      44 px hoch ist, weiß nur ein Browser, der die Klassen auch anwendet.
      Was beim Tippen entsteht, fängt die Prüfung mit einem eigenen Sammler
      ab — geöffnet wird in diesem Lauf nichts.
    */}
    {parameter.has('handoff') ? (
      <Tourenliste stopps={STOPPS} zeitzone="Europe/Berlin" startGewaehlt={false} />
    ) : null}
    {/*
      Mit `?fahrten=1` die Tourenliste mit Fahrzeit und Fahrpuffer zwischen den
      Stopps (MAP-006c) - erfundene Prüfergebnisse, darunter ein zu knapper
      Übergang, damit Warnung und Normalfall nebeneinander zu sehen sind.
    */}
    {parameter.has('fahrten') ? (
      <>
        <Routenzusammenfassung
          laedt={false}
          ergebnis={{
            ok: true,
            value: {
              quelle: 'nachbildung',
              route: { distanceMeters: 12_449, durationSeconds: 2988, legs: [], geometry: [] },
            },
          }}
          erneutVersuchen={() => {}}
        />
        <Tourenliste
          stopps={STOPPS}
          zeitzone="Europe/Berlin"
          startGewaehlt
          zwischen={(index) => (
            <Fahrtabschnitt
              sekunden={index === 3 ? null : 420 + index * 60}
              pruefung={
                index === 3
                  ? null
                  : {
                      from_appointment_id: STOPPS[index]!.termin.id,
                      to_appointment_id: STOPPS[index + 1]!.termin.id,
                      travel_seconds: 420 + index * 60,
                      earliest_start: STOPPS[index + 1]!.termin.starts_at,
                      shortfall_minutes: index === 5 ? 7 : 0,
                    }
              }
              zeitzone="Europe/Berlin"
            />
          )}
        />
      </>
    ) : null}
  </MemoryRouter>,
);
