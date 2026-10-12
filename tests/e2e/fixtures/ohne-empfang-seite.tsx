import { useState } from 'react';
import { SperreOhneNetz } from '@/features/auth/sitzungssperre/SperreOhneNetz';
import { AufDemGeraet } from '@/features/offline-documentation/AufDemGeraet';
import { DiensttelefonAbschnitt } from '@/features/offline-documentation/DiensttelefonAbschnitt';
import { Geraetehinweis } from '@/features/offline-documentation/Geraetehinweis';
import { PraxisAblage } from '@/features/offline-documentation/PraxisAblage';
import { praxisOhneNetz } from '@/features/offline-documentation/ohneNetz';

/** Die Prüfseite aus `ohne-empfang.tsx` (OFF-EPIC-001): Sperre, Gerät oder Einrichtung. */
export function Pruefseite({
  seite,
  besitzer,
  zone,
}: {
  seite: string;
  besitzer: string;
  zone: string;
}) {
  if (seite === 'geraet') return <Geraet besitzer={besitzer} zone={zone} />;
  if (seite === 'einrichtung') return <Einrichtung besitzer={besitzer} />;
  return <Sperre besitzer={besitzer} />;
}

function Sperre({ besitzer }: { besitzer: string }) {
  const [frei, setFrei] = useState(false);
  const [gesperrt, setGesperrt] = useState(0);
  const ohneNetz = praxisOhneNetz(besitzer);
  if (frei) {
    return (
      <>
        {ohneNetz.ansicht(() => {
          setFrei(false);
          setGesperrt((n) => n + 1);
        })}
      </>
    );
  }
  return (
    <SperreOhneNetz
      key={gesperrt}
      besitzer={besitzer}
      einleitung={ohneNetz.einleitung}
      onFreigegeben={() => setFrei(true)}
      onErneut={() => undefined}
    />
  );
}

function Geraet({ besitzer, zone }: { besitzer: string; zone: string }) {
  return (
    <>
      <Geraetehinweis besitzer={besitzer} />
      <PraxisAblage besitzer={besitzer} staffMemberId={null} zeitzone={zone} />
      <main className="mx-auto max-w-xl px-4 py-6">
        <h1 className="text-ink mb-4 text-2xl font-semibold">Auf dem Gerät</h1>
        <AufDemGeraet
          besitzer={besitzer}
          ohneVerbindung={!navigator.onLine}
          serverwege={{
            zurDokumentation: (t) => `/termine/${t}/dokumentation`,
            alsNachtrag: () => Promise.resolve(),
            inKorrektur: () => undefined,
          }}
        />
      </main>
    </>
  );
}

function Einrichtung({ besitzer }: { besitzer: string }) {
  return (
    <main className="mx-auto max-w-xl px-4 py-6">
      <DiensttelefonAbschnitt besitzer={besitzer} />
    </main>
  );
}
