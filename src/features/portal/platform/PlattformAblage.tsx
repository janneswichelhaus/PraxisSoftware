import { useEffect, useMemo, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  DurchfuehrungKontext,
  uebertragen,
  usePlaeneAblegen,
  type Durchfuehrungstraeger,
} from './ablage';
import { plaeneSchluessel, type Plattformzugang } from './api';
import { schluesselAblegen } from '@/features/core/auth/freigabeOhneNetz';

/** Der Anfang der Schlüssel aller Planabfragen, gleich welcher Zugang. */
const PLAENE = plaeneSchluessel('')[0];

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
 *     jedem Haken („bei jeder Verbindung sofort", ADR-024 Konsequenzen) -
 *     und lädt danach die Pläne neu, wenn etwas angekommen ist: Der Server
 *     kennt die Einheit dann beendet, die Vorschau rechnet nicht mit dem
 *     alten Stand weiter (BEF-218);
 *   * legt die Schlüssel der eigenen Passkeys für die Freigabe ohne Netz ab
 *     (TRK-009, ADR-025 Punkt 16: „bei der letzten Freigabe mit Netz").
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
    void schluesselAblegen(besitzer);
  }, [besitzer]);

  const queryClient = useQueryClient();
  useEffect(() => {
    const los = () =>
      void uebertragen(besitzer)
        .then((ergebnis) => {
          if (ergebnis.angekommen.length > 0) {
            void queryClient.invalidateQueries({ queryKey: [PLAENE] });
          }
        })
        .catch(() => undefined);
    los();
    window.addEventListener('online', los);
    return () => window.removeEventListener('online', los);
  }, [besitzer, queryClient]);

  const traeger = useMemo<Durchfuehrungstraeger>(
    () => ({ besitzer, anstossen: () => uebertragen(besitzer) }),
    [besitzer],
  );
  return <DurchfuehrungKontext.Provider value={traeger}>{children}</DurchfuehrungKontext.Provider>;
}
