import { Suspense, lazy, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Disclosure } from '@/components/ui/Card';
import { LoadingState } from '@/components/ui/Feedback';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Section } from '@/components/ui/Section';
import { StatusMark } from '@/components/ui/StatusMark';
import { addressCountText, postalCodeLines, unlocatedAddresses } from './addressPoints';
import { fetchActiveAddressPoints, type Territory } from './api';

const AddressPointsMap = lazy(() => import('./AddressPointsMap'));

function abRechnerbreite(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(min-width: 1024px)').matches
  );
}

/**
 * Wo die laufenden Behandlungen wohnen, zum Schneiden der Gebiete (ANN-835): Liste je Postleitzahl,
 * die Karte am Telefon zugeklappt. Der Server rundet und lässt Namen weg; nur für owner, Teamleitung, Büro.
 */
export function ActiveAddresses({ territories }: { territories: readonly Territory[] }) {
  const abfrage = useQuery({
    queryKey: ['active-address-points'],
    queryFn: fetchActiveAddressPoints,
    retry: false,
  });
  const [karteOffen, setKarteOffen] = useState(abRechnerbreite);

  return (
    <Section titel="Anschriften laufender Behandlungen">
      <Abfragezustand
        abfrage={abfrage}
        laden="Anschriften werden geladen …"
        fehler="Die Anschriften konnten nicht geladen werden."
        inKarte
        leer={{
          wenn: (punkte) => punkte.length === 0,
          titel: 'Keine laufende Behandlung mit Anschrift',
        }}
      >
        {(punkte) => {
          const ohnePunkt = unlocatedAddresses(punkte);
          return (
            <>
              <ListRows beschriftung="Anschriften nach Postleitzahl">
                {postalCodeLines(punkte, territories).map((zeile) => (
                  <ListRow
                    key={zeile.postalCode}
                    titel={zeile.postalCode}
                    meta={
                      zeile.territory === null
                        ? addressCountText(zeile.addresses)
                        : `${addressCountText(zeile.addresses)} · Gebiet ${zeile.territory}`
                    }
                    status={
                      zeile.territory === null ? (
                        <StatusMark ton="warnung">ohne Gebiet</StatusMark>
                      ) : undefined
                    }
                  />
                ))}
              </ListRows>
              {ohnePunkt > 0 ? (
                <p className="text-ink-muted mt-2 text-sm">
                  {ohnePunkt === 1
                    ? 'Eine Anschrift steht nicht auf der Karte: Sie ist nicht genau verortet.'
                    : `${ohnePunkt} Anschriften stehen nicht auf der Karte: Sie sind nicht genau verortet.`}
                </p>
              ) : null}
              <div className="mt-4">
                <Disclosure
                  kopf="label"
                  offen={karteOffen}
                  onUmschalten={setKarteOffen}
                  summary={<h3>Karte</h3>}
                >
                  {karteOffen ? (
                    <Suspense fallback={<LoadingState label="Karte wird geladen …" />}>
                      <AddressPointsMap points={punkte} />
                    </Suspense>
                  ) : null}
                </Disclosure>
              </div>
            </>
          );
        }}
      </Abfragezustand>
      <Kleingedrucktes className="mt-6">
        Punkte ohne Namen, auf etwa 100 m gerundet. Zum Kartendienst gehen nur Kartenausschnitte,
        keine Anschrift.
      </Kleingedrucktes>
    </Section>
  );
}
