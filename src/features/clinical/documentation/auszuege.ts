import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ZWECK_AUSZUG, auszuegeAnfragen, auszugVerfuegbar } from '@/lib/ki/auszug';

// „Verlauf in Auszügen“ vor der Sitzung. ANN-862: Die Auszüge leben nur im Zustand der Seite und
// werden nirgends festgehalten; jeder zeigt auf seinen Eintrag, der die Quelle bleibt.

/** Aus so vielen dokumentierten Terminen höchstens, neueste zuerst (ANN-861). */
export const AUSZUG_TERMINE = 6;

/** Die Nachbildung wählt nach der Stelle, nicht nach dem Inhalt. */
export const AUSZUG_NACHBILDUNG = 'Nachbildung: je Eintrag der erste und der letzte Satz.';

/** Was die Auszüge sind und was mit den Einträgen geschieht (Datenfluss, bleibt nach L7). */
export const AUSZUG_RECHTSSATZ =
  'Sätze im Wortlaut, nicht vollständig. Die Einträge werden dafür verarbeitet und nicht gespeichert.';

export const KEIN_EINTRAG = 'Noch kein finalisierter Eintrag.';

export const KEIN_SATZ = 'Kein Satz ausgewählt.';

export const EINTRAEGE_NICHT_GELADEN = 'Einträge nicht geladen.';

/** Ein Eintrag als Quelle: hinaus gehen nur `id` und `text`, der Rest dient der Anzeige. */
export interface Auszugsquelle {
  readonly id: string;
  readonly text: string;
  /** Der Tag des Termins als Anzeigetext. */
  readonly tag: string;
  /** Wer schrieb; bei einem Nachtrag steht es dabei. */
  readonly meta: string;
  /** Der Weg zum Eintrag selbst. */
  readonly ziel: string;
}

export interface Auszugszeile {
  readonly quelle: Auszugsquelle;
  readonly saetze: readonly string[];
}

type Stand =
  | { readonly art: 'bereit' }
  | { readonly art: 'laeuft' }
  | {
      readonly art: 'gezeigt';
      /** Die Akte, zu der die Auszüge gehören. */
      readonly akteId: string;
      readonly zeilen: readonly Auszugszeile[];
      readonly nachbildung: boolean;
    };

interface Meldung {
  readonly ton: 'neutral' | 'fehler';
  readonly text: string;
}

export function useAuszuege({
  akteId,
  lade,
}: {
  akteId: string;
  /** Liest die Einträge erst, wenn die Auszüge verlangt werden - über den Lesepfad der Akte. */
  lade: () => Promise<readonly Auszugsquelle[]>;
}) {
  const [stand, setStand] = useState<Stand>({ art: 'bereit' });
  const [meldung, setMeldung] = useState<Meldung | undefined>(undefined);
  const anfrage = useRef<AbortController | null>(null);

  const gateway = useQuery({
    queryKey: ['ki', 'verfuegbar', ZWECK_AUSZUG],
    queryFn: ({ signal }) => auszugVerfuegbar(signal),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  // Wer die Seite verlässt, bricht eine laufende Anfrage ab.
  useEffect(() => () => anfrage.current?.abort(), []);

  // Auszüge gelten nur für die Akte, aus der sie stammen.
  const gezeigt = stand.art === 'gezeigt' && stand.akteId === akteId ? stand : undefined;

  return {
    /** Bietet die Seite den Weg an (Gateway eingerichtet)? */
    angeboten: gateway.data === true,
    laeuft: stand.art === 'laeuft',
    zeilen: gezeigt?.zeilen,
    nachbildung: gezeigt?.nachbildung === true,
    meldung: stand.art === 'bereit' ? meldung : undefined,

    zeigen: async () => {
      if (stand.art === 'laeuft') return;
      anfrage.current?.abort();
      const steuerung = new AbortController();
      anfrage.current = steuerung;
      setMeldung(undefined);
      setStand({ art: 'laeuft' });

      const beendet = (hinweis: Meldung) => {
        anfrage.current = null;
        setStand({ art: 'bereit' });
        setMeldung(hinweis);
      };
      // Abgebrochen oder überholt: Die Antwort gehört zu niemandem mehr.
      const ueberholt = () => steuerung.signal.aborted || anfrage.current !== steuerung;

      let quellen: readonly Auszugsquelle[];
      try {
        quellen = await lade();
      } catch {
        if (!ueberholt()) beendet({ ton: 'fehler', text: EINTRAEGE_NICHT_GELADEN });
        return;
      }
      if (ueberholt()) return;
      if (quellen.length === 0) return beendet({ ton: 'neutral', text: KEIN_EINTRAG });

      const ergebnis = await auszuegeAnfragen({
        akteId,
        eintraege: quellen,
        signal: steuerung.signal,
      });
      if (ueberholt()) return;
      if (!ergebnis.ok) return beendet({ ton: 'fehler', text: ergebnis.meldung });

      const zeilen = ergebnis.auszuege.flatMap((auszug) => {
        const quelle = quellen.find((eintrag) => eintrag.id === auszug.id);
        return quelle ? [{ quelle, saetze: auszug.saetze }] : [];
      });
      if (zeilen.length === 0) return beendet({ ton: 'neutral', text: KEIN_SATZ });
      anfrage.current = null;
      setStand({
        art: 'gezeigt',
        akteId,
        zeilen,
        nachbildung: ergebnis.quelle === 'nachbildung',
      });
    },
  };
}

export type Auszuege = ReturnType<typeof useAuszuege>;
