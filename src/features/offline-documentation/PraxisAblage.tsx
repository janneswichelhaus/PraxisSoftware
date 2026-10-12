import { useEffect } from 'react';
import { schluesselAblegen } from '@/features/auth/freigabeOhneNetz';
import { useEinrichtung } from './servicePhone';
import { useTagesplanAblegen } from './tagesplan';

/**
 * Die Ablage auf dem Diensttelefon in offener Sitzung (OFF-EPIC-001, ADR-024
 * Punkt 6).
 *
 * Steht innerhalb der Sitzungssperre und nur dort, wie `PlattformAblage`. Auf
 * einem eingerichteten Gerät legt sie den eigenen Tagesplan von heute und die
 * Schlüssel der eigenen Passkeys für die Freigabe ohne Netz ab (ADR-025
 * Punkt 16). Ohne Einrichtung tut sie nichts.
 */
export function PraxisAblage({
  besitzer,
  staffMemberId,
  zeitzone,
}: {
  besitzer: string;
  staffMemberId: string | null;
  zeitzone: string;
}) {
  const eingerichtet = Boolean(useEinrichtung(besitzer));
  useTagesplanAblegen(besitzer, eingerichtet ? staffMemberId : null, zeitzone);

  useEffect(() => {
    if (eingerichtet) void schluesselAblegen(besitzer);
  }, [besitzer, eingerichtet]);

  return null;
}
