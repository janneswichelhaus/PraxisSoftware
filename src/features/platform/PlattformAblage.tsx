import { useEffect, useMemo, type ReactNode } from 'react';
import {
  DurchfuehrungKontext,
  uebertragen,
  usePlaeneAblegen,
  type Durchfuehrungstraeger,
} from './ablage';
import type { Plattformzugang } from './api';

/**
 * Die Ablage auf dem Gerät in offener Sitzung (TRK-008, ADR-024 Punkte 5
 * und 7).
 *
 * Steht innerhalb der Sitzungssperre und nur dort: Übertragen wird nur mit
 * einer Sitzung, die der Server gerade als offen bestätigt hat (ADR-025
 * Punkt 16). Sie
 *
 *   * legt jede geladene Antwort „Ihre Übungen" ab und lässt Pläne nicht mehr
 *     lesbarer Zugänge fallen;
 *   * überträgt, was wartet: beim Öffnen, bei jedem Wieder-online und nach
 *     jedem Haken („bei jeder Verbindung sofort", ADR-024 Konsequenzen).
 */
export function PlattformAblage({
  besitzer,
  zugaenge,
  children,
}: {
  besitzer: string;
  zugaenge: Plattformzugang[];
  children: ReactNode;
}) {
  const lesbar = useMemo(() => zugaenge.filter((z) => z.readable), [zugaenge]);
  usePlaeneAblegen(besitzer, lesbar);

  useEffect(() => {
    const los = () => void uebertragen(besitzer).catch(() => undefined);
    los();
    window.addEventListener('online', los);
    return () => window.removeEventListener('online', los);
  }, [besitzer]);

  const traeger = useMemo<Durchfuehrungstraeger>(
    () => ({ besitzer, anstossen: () => uebertragen(besitzer) }),
    [besitzer],
  );
  return <DurchfuehrungKontext.Provider value={traeger}>{children}</DurchfuehrungKontext.Provider>;
}
