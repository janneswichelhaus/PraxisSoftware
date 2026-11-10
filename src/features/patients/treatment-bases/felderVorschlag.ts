import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ZWECK_VERORDNUNG,
  felderVerfuegbar,
  felderVorschlagen,
  scanTauglich,
  type Fundstelle,
} from '@/lib/ki/verordnung';

// „Felder vorschlagen“ im Fenster „Daten übertragen“. ANN-862: Der Vorschlag lebt nur im Zustand
// des Fensters; eingetragen wird erst mit „Übernehmen“, gespeichert erst mit „Speichern“.

/** Die Nachbildung liest das Foto nicht. */
export const FELDER_NACHBILDUNG = 'Nachbildung: fester Beispieltext, das Foto wird nicht gelesen.';

/** Was mit dem Foto geschieht und was nicht (Datenfluss, bleibt nach L7). */
export const FELDER_RECHTSSATZ =
  'Werte im Wortlaut vom Foto, nur in leere Felder. Für den Vorschlag wird das Foto nur gelesen; es bleibt keine Kopie.';

/** Wer speichern will, entscheidet zuerst über den offenen Vorschlag. */
export const VORSCHLAG_NICHT_UEBERNOMMEN = 'Der Vorschlag steht noch nicht in den Feldern.';

export const NICHTS_GEFUNDEN = 'Auf dem Foto nichts gefunden.';

type Stand =
  | { readonly art: 'bereit' }
  | { readonly art: 'laeuft' }
  | {
      readonly art: 'vorschlag';
      readonly fundstellen: readonly Fundstelle[];
      readonly nachbildung: boolean;
      /** Das Foto, aus dem der Vorschlag entstand. */
      readonly bild: Blob;
    };

interface Meldung {
  readonly ton: 'neutral' | 'fehler' | 'erfolg';
  readonly text: string;
}

export function useFelderVorschlag({ dateiId, bild }: { dateiId: string; bild: Blob | null }) {
  const [stand, setStand] = useState<Stand>({ art: 'bereit' });
  const [meldung, setMeldung] = useState<Meldung | undefined>(undefined);
  const anfrage = useRef<AbortController | null>(null);

  const gateway = useQuery({
    queryKey: ['ki', 'verfuegbar', ZWECK_VERORDNUNG],
    queryFn: ({ signal }) => felderVerfuegbar(signal),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  // Wer das Fenster schließt, bricht eine laufende Anfrage ab.
  useEffect(() => () => anfrage.current?.abort(), []);

  // Ein Vorschlag gilt nur für das Foto, aus dem er entstand.
  const offen = stand.art === 'vorschlag' && stand.bild === bild ? stand : undefined;

  return {
    /** Bietet das Fenster den Weg an (Gateway eingerichtet, Foto geladen und tauglich)? */
    angeboten: gateway.data === true && bild !== null && scanTauglich(bild),
    laeuft: stand.art === 'laeuft',
    fundstellen: offen?.fundstellen,
    nachbildung: offen?.nachbildung === true,
    meldung: stand.art === 'bereit' ? meldung : undefined,

    starten: async () => {
      if (stand.art === 'laeuft' || bild === null) return;
      anfrage.current?.abort();
      const steuerung = new AbortController();
      anfrage.current = steuerung;
      setMeldung(undefined);
      setStand({ art: 'laeuft' });

      const ergebnis = await felderVorschlagen({ dateiId, bild, signal: steuerung.signal });
      // Abgebrochen oder überholt: Die Antwort gehört zu niemandem mehr.
      if (steuerung.signal.aborted || anfrage.current !== steuerung) return;
      anfrage.current = null;

      if (!ergebnis.ok) {
        setStand({ art: 'bereit' });
        setMeldung({ ton: 'fehler', text: ergebnis.meldung });
        return;
      }
      if (ergebnis.fundstellen.length === 0) {
        setStand({ art: 'bereit' });
        setMeldung({ ton: 'neutral', text: NICHTS_GEFUNDEN });
        return;
      }
      setStand({
        art: 'vorschlag',
        fundstellen: ergebnis.fundstellen,
        nachbildung: ergebnis.quelle === 'nachbildung',
        bild,
      });
    },
    verwerfen: () => {
      anfrage.current?.abort();
      anfrage.current = null;
      setMeldung(undefined);
      setStand({ art: 'bereit' });
    },
    /** Nach dem Übernehmen ist der Vorschlag erledigt; die Meldung sagt, was geschah. */
    erledigt: (text: string) => {
      setStand({ art: 'bereit' });
      setMeldung({ ton: 'erfolg', text });
    },
  };
}

export type FelderVorschlag = ReturnType<typeof useFelderVorschlag>;
