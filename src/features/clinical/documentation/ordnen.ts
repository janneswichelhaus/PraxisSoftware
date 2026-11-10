import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ZWECK_ORDNEN,
  ordnenVerfuegbar,
  textOrdnen,
  type Ordnungsvorschlag,
} from '@/lib/ki/ordnen';

// „Ordnen“ auf der Schreibseite. ANN-862: Der Vorschlag lebt nur im Zustand dieser Seite und
// gilt nur für den Text, aus dem er entstand; erst „Übernehmen“ setzt ihn ins Feld.

/** Die Nachbildung ordnet den echten Text, aber ohne Sprachmodell. */
export const ORDNEN_NACHBILDUNG = 'Nachbildung: geordnet nach festen Signalwörtern.';

/** Was mit dem Text geschieht und was nicht (Datenfluss, bleibt nach L7). */
export const ORDNEN_RECHTSSATZ =
  'Dieselben Sätze, nur umgestellt. Der Text wird dafür verarbeitet und nicht gespeichert.';

export const SCHON_GEORDNET = 'Schon geordnet.';

/** Die Meldung unter dem Feld nach der Übernahme. */
export const GEORDNET_MELDUNG = 'Text geordnet.';

type Stand =
  | { readonly art: 'bereit' }
  | { readonly art: 'laeuft' }
  | {
      readonly art: 'vorschlag';
      readonly vorschlag: Ordnungsvorschlag;
      /** Der Feldinhalt, aus dem der Vorschlag entstand. */
      readonly grundlage: string;
    };

interface Meldung {
  readonly ton: 'neutral' | 'fehler';
  readonly text: string;
}

export function useOrdnen({
  terminId,
  aktiv,
  text,
}: {
  terminId: string;
  aktiv: boolean;
  /** Der Text, wie er gerade im Feld steht. */
  text: string;
}) {
  const [stand, setStand] = useState<Stand>({ art: 'bereit' });
  const [meldung, setMeldung] = useState<Meldung | undefined>(undefined);
  const anfrage = useRef<AbortController | null>(null);

  const gateway = useQuery({
    queryKey: ['ki', 'verfuegbar', ZWECK_ORDNEN],
    queryFn: ({ signal }) => ordnenVerfuegbar(signal),
    enabled: aktiv,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  // Wer die Seite verlässt, bricht eine laufende Anfrage ab.
  useEffect(() => () => anfrage.current?.abort(), []);

  // Ein Vorschlag gilt nur für den Text, aus dem er entstand: Wird weitergetippt, ist er fort.
  const vorschlag =
    stand.art === 'vorschlag' && stand.grundlage === text ? stand.vorschlag : undefined;

  return {
    /** Bietet die Seite den Weg an (Gateway eingerichtet)? */
    angeboten: aktiv && gateway.data === true,
    laeuft: stand.art === 'laeuft',
    vorschlag,
    meldung: stand.art === 'bereit' ? meldung : undefined,

    starten: async () => {
      if (stand.art === 'laeuft' || text.trim() === '') return;
      anfrage.current?.abort();
      const steuerung = new AbortController();
      anfrage.current = steuerung;
      const grundlage = text;
      setMeldung(undefined);
      setStand({ art: 'laeuft' });

      const ergebnis = await textOrdnen({ terminId, text: grundlage, signal: steuerung.signal });
      // Abgebrochen oder überholt: Die Antwort gehört zu niemandem mehr.
      if (steuerung.signal.aborted || anfrage.current !== steuerung) return;
      anfrage.current = null;

      if (!ergebnis.ok) {
        setStand({ art: 'bereit' });
        setMeldung({ ton: 'fehler', text: ergebnis.meldung });
        return;
      }
      if (ergebnis.vorschlag.text === grundlage.trim()) {
        setStand({ art: 'bereit' });
        setMeldung({ ton: 'neutral', text: SCHON_GEORDNET });
        return;
      }
      setStand({ art: 'vorschlag', vorschlag: ergebnis.vorschlag, grundlage });
    },
    verwerfen: () => {
      anfrage.current?.abort();
      anfrage.current = null;
      setMeldung(undefined);
      setStand({ art: 'bereit' });
    },
    /** Gibt den geordneten Text heraus; ab da ist er Text der Person wie jeder getippte. */
    uebernehmen: (): string | null => {
      if (!vorschlag) return null;
      setStand({ art: 'bereit' });
      return vorschlag.text;
    },
  };
}

export type Ordnen = ReturnType<typeof useOrdnen>;
