import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { MdrSperre } from '@/app/MdrSperre';
import { MDR_REVIEW_REQUIRED } from '@/app/mdr';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `mdr-sperre.html`.
 *
 * Gezeigt wird die Sperre eines Eintrags **mit** reservierter Adresse — denn
 * nur die erscheint überhaupt jemandem auf dem Bildschirm. Welcher es ist,
 * steht nicht hier: Der erste mit Pfad ist es. Damit prüft die Seite, was im
 * Register steht, und nicht, was jemand hier hineingeschrieben hat.
 *
 * `MemoryRouter` reicht: Die Seite trägt einen Link zur Übersicht und sonst
 * nichts, was den Data Router der Anwendung bräuchte.
 */
const eintrag = MDR_REVIEW_REQUIRED.find((kandidat) => kandidat.pfade.length > 0);
if (!eintrag) throw new Error('Kein MDR-Eintrag mit reservierter Adresse im Register.');

const wurzel = document.getElementById('wurzel');
if (!wurzel) throw new Error('Wurzelelement der Prüfseite fehlt.');

createRoot(wurzel).render(
  <MemoryRouter>
    <div className="mx-auto max-w-5xl px-5 py-6">
      <MdrSperre eintrag={eintrag} />
    </div>
  </MemoryRouter>,
);
