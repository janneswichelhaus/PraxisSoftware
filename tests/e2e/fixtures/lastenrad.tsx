import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '@/components/ui/Button';
import { Lastenrad3D } from '@/components/ui/Lastenrad3D';
import type { Auswahl } from '@/components/ui/lastenrad3d/auswahl';
import { bauteilVonTeil } from '@/features/fleet/radteile';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `lastenrad.html`: der Baustein in einer scrollenden Seite, zum Öffnen
 * und Schließen. Mit `?unten` liegt die Bühne zuerst außerhalb des Bilds; `?auswahl` wählt am Rad,
 * `?direkt` dasselbe ohne den Baustein, mit dem treffbaren Punkt je Bauteil für die Prüfung.
 */
const suche = new URLSearchParams(window.location.search);
const waehlbar = (suche.get('auswahl') ?? suche.get('direkt') ?? '').split(',').filter(Boolean);

export function Seite() {
  const unten = suche.has('unten');
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

/** Was ein Tipp meldet: das getroffene Bauteil als Text, alle unter dem Finger als Merkmal. */
function Gewaehlt({ gruppen }: { gruppen: readonly string[] }) {
  return (
    <p>
      Gewählt: <output data-finger={gruppen.join(',')}>{gruppen[0] ?? 'nichts'}</output>
    </p>
  );
}

/** Der Baustein mit Auswahl: Das gewählte Bauteil steht als Text darunter und trägt die Marke. */
export function Wahlseite() {
  const [gruppen, setGruppen] = useState<readonly string[]>([]);
  const [gewaehlt = ''] = gruppen;
  return (
    <main className="max-w-spalte mx-auto p-4">
      <Lastenrad3D
        className="h-64"
        label="Lastenrad zum Antippen eines Bauteils"
        auswahl={{
          gruppeVon: bauteilVonTeil,
          waehlbar: waehlbar.length > 0 ? waehlbar : undefined,
          marken: gewaehlt ? [{ gruppe: gewaehlt, ton: 'kritisch' }] : [],
          onWahl: setGruppen,
        }}
      />
      <Gewaehlt gruppen={gruppen} />
    </main>
  );
}

/** Ansicht und Auswahl ohne den Baustein: gibt der Prüfung den Punkt, an dem ein Tipp trifft. */
export function Direktseite() {
  const buehne = useRef<HTMLDivElement>(null);
  const [gruppen, setGruppen] = useState<readonly string[]>([]);
  const [bereit, setBereit] = useState(false);
  useEffect(() => {
    const container = buehne.current;
    if (!container) return undefined;
    let aufraeumen = () => {};
    let verlassen = false;
    void Promise.all([
      import('@/components/ui/lastenrad3d/viewer'),
      import('@/components/ui/lastenrad3d/auswahl'),
    ]).then(async ([{ mountLastenrad }, { richteAuswahlEin }]) => {
      const ansicht = await mountLastenrad(container, {
        zoom: false,
        merge: false,
        autoRotate: false,
      });
      const wahl = richteAuswahlEin(ansicht, container, bauteilVonTeil, setGruppen);
      aufraeumen = () => {
        wahl.dispose();
        ansicht.dispose();
      };
      if (verlassen) {
        aufraeumen();
        return;
      }
      wahl.setze({ waehlbar: waehlbar.length > 0 ? waehlbar : null, marken: [] });
      (window as unknown as { __wahl: Auswahl }).__wahl = wahl;
      setBereit(true);
    });
    return () => {
      verlassen = true;
      aufraeumen();
    };
  }, []);
  return (
    <main className="max-w-spalte mx-auto p-4">
      <div ref={buehne} className="bg-radbuehne rounded-image h-64 overflow-hidden" />
      <Gewaehlt gruppen={gruppen} />
      {bereit ? <p>Auswahl bereit</p> : null}
    </main>
  );
}

const wurzel = document.getElementById('wurzel');
if (!wurzel) throw new Error('Wurzelelement der Prüfseite fehlt.');
// Wie die Anwendung im strengen Modus: Jede Wirkung läuft doppelt, auch das Freigeben.
createRoot(wurzel).render(
  <StrictMode>
    {suche.has('direkt') ? <Direktseite /> : suche.has('auswahl') ? <Wahlseite /> : <Seite />}
  </StrictMode>,
);
