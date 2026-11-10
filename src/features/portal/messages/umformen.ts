import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ZWECK_ALLTAGSSPRACHE,
  ZWECK_ENTWURF,
  textUmformen,
  umformenVerfuegbar,
  type Umformvorschlag,
  type Umformzweck,
} from '@/lib/ki/umformen';

// Antworten umformen an der Rückfrage. ANN-862: Der Vorschlag lebt nur im Zustand der Seite und
// gilt nur für den Text, aus dem er entstand; gesendet wird nie ein Vorschlag, nur das Feld.

/** Was die Nachbildung je Zweck wirklich tut - sie ist kein Sprachmodell. */
export function umformenNachbildung(zweck: Umformzweck): string {
  switch (zweck) {
    case ZWECK_ENTWURF:
      return 'Nachbildung: nur Abkürzungen ausgeschrieben.';
    case ZWECK_ALLTAGSSPRACHE:
      return 'Nachbildung: Fachwörter aus einer festen Liste erklärt.';
  }
}

/** Was mit dem Text geschieht und was nicht (Datenfluss, bleibt nach L7). */
export const UMFORMEN_RECHTSSATZ =
  'Nur dein Text wird dafür verarbeitet und nicht gespeichert; die Frage der Person geht nicht mit.';

export const NICHTS_UMZUFORMEN = 'Nichts umzuformen.';

/** Wer senden will, entscheidet zuerst über den offenen Vorschlag. */
export const VORSCHLAG_OFFEN = 'Der Vorschlag ist noch offen.';

export const VORSCHLAG_UEBERNOMMEN = 'Vorschlag übernommen.';

/** Die Beschriftung des Knopfs je Zweck. */
export function umformenKnopf(zweck: Umformzweck): string {
  switch (zweck) {
    case ZWECK_ENTWURF:
      return 'Ausformulieren';
    case ZWECK_ALLTAGSSPRACHE:
      return 'In Alltagssprache';
  }
}

const ZWECKE: readonly Umformzweck[] = [ZWECK_ENTWURF, ZWECK_ALLTAGSSPRACHE];

type Stand =
  | { readonly art: 'bereit' }
  | { readonly art: 'laeuft'; readonly zweck: Umformzweck }
  | {
      readonly art: 'vorschlag';
      readonly zweck: Umformzweck;
      readonly vorschlag: Umformvorschlag;
      /** Der Feldinhalt, aus dem der Vorschlag entstand. */
      readonly grundlage: string;
    };

interface Meldung {
  readonly ton: 'neutral' | 'fehler';
  readonly text: string;
}

export function useUmformen({ rueckfrageId, text }: { rueckfrageId: string; text: string }) {
  const [stand, setStand] = useState<Stand>({ art: 'bereit' });
  const [meldung, setMeldung] = useState<Meldung | undefined>(undefined);
  const anfrage = useRef<AbortController | null>(null);

  const entwurf = useQuery({
    queryKey: ['ki', 'verfuegbar', ZWECK_ENTWURF],
    queryFn: ({ signal }) => umformenVerfuegbar(ZWECK_ENTWURF, signal),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const alltagssprache = useQuery({
    queryKey: ['ki', 'verfuegbar', ZWECK_ALLTAGSSPRACHE],
    queryFn: ({ signal }) => umformenVerfuegbar(ZWECK_ALLTAGSSPRACHE, signal),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const verfuegbar = new Map<Umformzweck, boolean>([
    [ZWECK_ENTWURF, entwurf.data === true],
    [ZWECK_ALLTAGSSPRACHE, alltagssprache.data === true],
  ]);

  // Wer die Seite verlässt, bricht eine laufende Anfrage ab.
  useEffect(() => () => anfrage.current?.abort(), []);

  // Ein Vorschlag gilt nur für den Text, aus dem er entstand: Wird weitergetippt, ist er fort.
  const offen = stand.art === 'vorschlag' && stand.grundlage === text ? stand : undefined;
  const vorschlag = offen?.vorschlag;

  return {
    /** Die Zwecke, die der Gateway hier bedient - in der Reihenfolge der Knöpfe. */
    angeboten: ZWECKE.filter((zweck) => verfuegbar.get(zweck) === true),
    laeuft: stand.art === 'laeuft' ? stand.zweck : undefined,
    vorschlag,
    /** Wozu der offene Vorschlag entstand. */
    vorschlagZweck: offen?.zweck,
    meldung: stand.art === 'bereit' ? meldung : undefined,

    starten: async (zweck: Umformzweck) => {
      if (stand.art === 'laeuft' || text.trim() === '') return;
      anfrage.current?.abort();
      const steuerung = new AbortController();
      anfrage.current = steuerung;
      const grundlage = text;
      setMeldung(undefined);
      setStand({ art: 'laeuft', zweck });

      const ergebnis = await textUmformen({
        zweck,
        rueckfrageId,
        text: grundlage,
        signal: steuerung.signal,
      });
      // Abgebrochen oder überholt: Die Antwort gehört zu niemandem mehr.
      if (steuerung.signal.aborted || anfrage.current !== steuerung) return;
      anfrage.current = null;

      if (!ergebnis.ok) {
        setStand({ art: 'bereit' });
        setMeldung({ ton: 'fehler', text: ergebnis.meldung });
        return;
      }
      if (ergebnis.vorschlag.saetze.every((satz) => satz.unveraendert)) {
        setStand({ art: 'bereit' });
        setMeldung({ ton: 'neutral', text: NICHTS_UMZUFORMEN });
        return;
      }
      setStand({ art: 'vorschlag', zweck, vorschlag: ergebnis.vorschlag, grundlage });
    },
    verwerfen: () => {
      anfrage.current?.abort();
      anfrage.current = null;
      setMeldung(undefined);
      setStand({ art: 'bereit' });
    },
    /** Gibt den Vorschlag als Text heraus; ab da ist er Text der Person wie jeder getippte. */
    uebernehmen: (): string | null => {
      if (!vorschlag) return null;
      setStand({ art: 'bereit' });
      return vorschlag.text;
    },
  };
}

export type Umformen = ReturnType<typeof useUmformen>;
