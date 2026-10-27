import { useCallback, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { SperreOhneNetz } from '@/features/core/auth/sitzungssperre/SperreOhneNetz';
import { AufDemGeraet } from '@/features/clinical/offline-documentation/AufDemGeraet';
import { DiensttelefonAbschnitt } from '@/features/clinical/offline-documentation/DiensttelefonAbschnitt';
import { Geraetehinweis } from '@/features/clinical/offline-documentation/Geraetehinweis';
import { PraxisAblage } from '@/features/clinical/offline-documentation/PraxisAblage';
import { praxisOhneNetz } from '@/features/clinical/offline-documentation/ohneNetz';

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
  // Die Prüfseite hat keine Sitzung; sie gilt als die des Kontos.
  const konto = useCallback(() => Promise.resolve(besitzer), [besitzer]);
  return (
    <>
      <Geraetehinweis besitzer={besitzer} />
      <PraxisAblage besitzer={besitzer} staffMemberId={null} zeitzone={zone} konto={konto} />
      {/* Derselbe Inhaltsbereich und Kopf wie in der Anwendung (AufDemGeraetPage). */}
      <main className="max-w-inhalt mx-auto w-full min-w-0 px-4 pt-4 pb-28 sm:px-6 sm:pt-6 sm:pb-10 lg:px-8 lg:pb-12">
        <PageHeader title="Auf dem Gerät" />
        <div className="max-w-spalte">
          <AufDemGeraet
            besitzer={besitzer}
            ohneVerbindung={!navigator.onLine}
            serverwege={{
              zurDokumentation: (t) => `/termine/${t}/dokumentation`,
              alsNachtrag: () => Promise.resolve(),
              inKorrektur: () => undefined,
              fassungLesen: () => Promise.resolve('Synthetisch: Fassung der Praxis, finalisiert.'),
            }}
          />
        </div>
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
