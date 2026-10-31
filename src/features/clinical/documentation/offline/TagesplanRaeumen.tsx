import { useEffect } from 'react';
import { tagesplanVerwerfen } from './tagesplan';

/**
 * Steht in offener Sitzung, wenn das Konto nicht (mehr) dokumentieren darf
 * (BEF-150): Fällt nur das Dokumentationsrecht weg und der Zugang bleibt,
 * räumt sie den Tagesplan vom Gerät, statt ihn bis Tagesende liegen zu
 * lassen. Ohne abgelegten Plan tut sie nichts.
 */
export function TagesplanRaeumen({ besitzer }: { besitzer: string }) {
  useEffect(() => {
    void tagesplanVerwerfen(besitzer).catch(() => undefined);
  }, [besitzer]);
  return null;
}
