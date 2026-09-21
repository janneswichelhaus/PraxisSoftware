import { createRoot } from 'react-dom/client';
import { Karte } from '@/features/tours/karte/Karte';
import { TESTSTOPPS } from '@/features/tours/karte/teststopps';
import type { MapDisplayConfig } from '@/lib/location/contract';
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
 * Mit `?fehler=1` zeigt die Prüfseite den Fall, der MAP-002 im echten Betrieb
 * eingeholt hat: Der Style kommt nicht an (BEF-021).
 *
 * Die Adresse liegt im eigenen Ursprung und läuft ins Leere - kein Anbieter
 * wird dafür gebraucht, und der Lauf bleibt ohne Netz.
 */
const styleAdresse = new URLSearchParams(location.search).has('fehler')
  ? '/tests/e2e/fixtures/diesen-style-gibt-es-nicht.json'
  : URL.createObjectURL(new Blob([JSON.stringify(styleOhneNetz)], { type: 'application/json' }));

const config: MapDisplayConfig = {
  styleUrl: styleAdresse,
  attribution: '© Prüfstyle ohne Netz',
  minZoom: 0,
  maxZoom: 17,
};

const wurzel = document.getElementById('wurzel');
if (!wurzel) throw new Error('Wurzelelement der Prüfseite fehlt.');

createRoot(wurzel).render(
  <Karte
    config={config}
    stopps={TESTSTOPPS}
    beschriftung={`Karte mit ${TESTSTOPPS.length} synthetischen Teststopps in Tübingen`}
  />,
);
