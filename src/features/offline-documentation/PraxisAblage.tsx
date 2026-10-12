import { useEffect } from 'react';
import { schluesselAblegen } from '@/features/auth/freigabeOhneNetz';
import { useEinrichtung } from './servicePhone';
import { useTagesplanAblegen } from './tagesplan';
import { entwuerfeUebertragen, uebertragungAnmelden } from './entwuerfe';

/**
 * Die Ablage auf dem Diensttelefon in offener Sitzung (OFF-EPIC-001, ADR-024
 * Punkte 6 und 7).
 *
 * Steht innerhalb der Sitzungssperre und nur dort, wie `PlattformAblage`:
 * Übertragen wird nur mit einer Sitzung, die der Server gerade als offen
 * bestätigt hat (ADR-025 Punkt 16). Sie
 *
 *   * legt auf einem eingerichteten Gerät den eigenen Tagesplan von heute und
 *     die Schlüssel der eigenen Passkeys für die Freigabe ohne Netz ab;
 *   * überträgt, was an Entwürfen wartet: beim Öffnen, bei jedem
 *     Wieder-online und nach dem Schließen eines Schreibfelds („bei jeder
 *     Verbindung sofort", ADR-024 Konsequenzen) - auch, wenn das Gerät
 *     inzwischen ausgeschaltet ist; Entwürfe fallen nie mit der Einrichtung.
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

  useEffect(() => {
    const los = () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      void entwuerfeUebertragen(besitzer).catch(() => undefined);
    };
    const abmelden = uebertragungAnmelden(los);
    los();
    window.addEventListener('online', los);
    return () => {
      abmelden();
      window.removeEventListener('online', los);
    };
  }, [besitzer]);

  return null;
}
