import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '@/components/ui/Button';
import { Lastenrad3D } from '@/components/ui/Lastenrad3D';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `lastenrad.html`: der Baustein in einer scrollenden Seite, zum Öffnen
 * und Schließen. Mit `?unten` liegt die Bühne zuerst außerhalb des Bilds.
 */
export function Seite() {
  const unten = new URLSearchParams(window.location.search).has('unten');
  const [offen, setOffen] = useState(true);
  return (
    <main className="max-w-spalte mx-auto p-4">
      <Button type="button" variant="secondary" onClick={() => setOffen((vorher) => !vorher)}>
        {offen ? 'Ansicht schließen' : 'Ansicht öffnen'}
      </Button>
      {unten ? <div style={{ height: '200vh' }} /> : null}
      {offen ? <Lastenrad3D className="mt-4 h-64" /> : null}
      <div style={{ height: '150vh' }} />
    </main>
  );
}

const wurzel = document.getElementById('wurzel');
if (!wurzel) throw new Error('Wurzelelement der Prüfseite fehlt.');
// Wie die Anwendung im strengen Modus: Jede Wirkung läuft doppelt, auch das Freigeben.
createRoot(wurzel).render(
  <StrictMode>
    <Seite />
  </StrictMode>,
);
