import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '@/components/ui/Button';
import { Barcodedialog } from '@/features/nutrition/Barcodedialog';
import '@/index.css';

// Einstieg der Prüfseite aus `barcode.html`: ein Knopf öffnet den Dialog, die gelesene Nummer
// steht danach auf der Seite. Es gibt keinen Server und nichts wird gespeichert.
export function Seite() {
  const [offen, setOffen] = useState(false);
  const [nummer, setNummer] = useState<string | null>(null);
  return (
    <main className="plattform-schrift max-w-spalte mx-auto flex flex-col gap-4 p-5">
      <Button type="button" onClick={() => setOffen(true)}>
        Barcode scannen
      </Button>
      <p role="status">{nummer ? `Gelesen: ${nummer}` : 'Noch nichts gelesen.'}</p>
      {offen ? (
        <Barcodedialog
          onNummer={(code) => {
            setNummer(code);
            setOffen(false);
          }}
          onSchliessen={() => setOffen(false)}
        />
      ) : null}
    </main>
  );
}

createRoot(document.getElementById('wurzel')!).render(<Seite />);
