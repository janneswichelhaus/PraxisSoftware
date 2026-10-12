import { useState } from 'react';
import { SperreOhneNetz } from '@/features/auth/sitzungssperre/SperreOhneNetz';
import { LokaleUebungen } from '@/features/platform/LokaleUebungen';

/** Die Prüfseite aus `ohne-netz.tsx`: Sperre ohne Netz, danach die lokale Ansicht. */
export function Pruefseite({ besitzer, lokal }: { besitzer: string; lokal: boolean }) {
  const [frei, setFrei] = useState(lokal);
  const [gesperrt, setGesperrt] = useState(0);
  if (frei) {
    return (
      <LokaleUebungen
        besitzer={besitzer}
        onSperren={() => {
          setFrei(false);
          setGesperrt((n) => n + 1);
        }}
      />
    );
  }
  return (
    <SperreOhneNetz
      key={gesperrt}
      besitzer={besitzer}
      onFreigegeben={() => setFrei(true)}
      onErneut={() => undefined}
    />
  );
}
