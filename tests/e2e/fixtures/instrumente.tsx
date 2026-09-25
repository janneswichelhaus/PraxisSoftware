import { createRoot } from 'react-dom/client';
import { InstrumentePage } from '@/features/assessments/InstrumentePage';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `instrumente.html` (FRB-010).
 *
 * Die Seite ist eine reine Leseseite ohne Server und ohne Router — gezeigt
 * wird genau das, was die Anwendung unter `/praxis/instrumente` zeigt.
 */
const wurzel = document.getElementById('wurzel');
if (!wurzel) throw new Error('Wurzelelement der Prüfseite fehlt.');

createRoot(wurzel).render(
  <div className="mx-auto max-w-5xl px-5 py-6">
    <InstrumentePage />
  </div>,
);
