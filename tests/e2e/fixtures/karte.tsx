import { createRoot } from 'react-dom/client';
import { Karte } from '@/features/tours/karte/Karte';
import { NavigationHandoff } from '@/features/tours/karte/NavigationHandoff';
import { Routenangaben } from '@/features/tours/karte/Routenangaben';
import { TESTSTOPPS } from '@/features/tours/karte/teststopps';
import type { MapDisplayConfig } from '@/lib/location/contract';
import type { Routenergebnis } from '@/lib/location/route';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `karte.html`.
 *
 * Gerendert wird dieselbe Komponente wie in der Anwendung, mit denselben
 * Stopps - nur die Anzeigekonfiguration kommt von hier statt vom Adapter.
 */

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
const route = parameter.has('route') ? TESTSTOPPS.map((stopp) => stopp.position) : undefined;

/**
 * Die Angaben zur Route, wie sie die Nachbildung liefert.
 *
 * Auch das ist eine Prüffrage im Browser: `/touren/karte` liegt hinter der
 * Anmeldung, und in der Cloud-Entwicklungsumgebung läuft kein GoTrue. Ohne
 * diesen Block ließe sich die neue Anzeige nirgends in einem echten Browser
 * ansehen — schon gar nicht bei 375 px.
 */
const angaben: Routenergebnis = {
  ok: true,
  value: {
    quelle: 'nachbildung',
    route: {
      distanceMeters: 12_449,
      durationSeconds: 2988,
      legs: TESTSTOPPS.slice(1).map((_, nummer) => ({
        distanceMeters: 1500 + nummer * 120,
        durationSeconds: 360 + nummer * 30,
      })),
      geometry: route ?? [],
    },
  },
};

const wurzel = document.getElementById('wurzel');
if (!wurzel) throw new Error('Wurzelelement der Prüfseite fehlt.');

createRoot(wurzel).render(
  <>
    <Karte
      config={config}
      stopps={TESTSTOPPS}
      beschriftung={`Karte mit ${TESTSTOPPS.length} synthetischen Teststopps in Tübingen`}
      route={route}
    />
    {route === undefined ? null : (
      <Routenangaben
        laedt={false}
        ergebnis={angaben}
        lastenrad={undefined}
        erneutVersuchen={() => {}}
      />
    )}
    {/*
      Mit `?handoff=1` steht der Navigations-Handoff darunter (MAP-005b).

      Die Prüffragen dazu beantwortet kein jsdom: ob ein Tippziel wirklich
      44 px hoch ist, weiß nur ein Browser, der die Klassen auch anwendet.
      Was beim Tippen entsteht, fängt die Prüfung mit einem eigenen
      `window.open` ab — geöffnet wird in diesem Lauf nichts.
    */}
    {parameter.has('handoff') ? <NavigationHandoff stopps={TESTSTOPPS} /> : null}
  </>,
);
