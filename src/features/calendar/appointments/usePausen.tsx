import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchPausenlagen,
  PauseRueckfrage,
  setPausenlage,
  tagMitPausen,
  type Band,
  type Pausenlage,
} from '@/features/calendar/scheduling/pause';
import { tageslageNeuLaden } from './tageslage';
import { PausenLeiste } from './PausenLeiste';

export interface PausenAuftrag {
  staffMemberId: string;
  datum: string;
  planVonMinute: number;
  vonMinute: number;
}

const LEER: readonly Pausenlage[] = [];

/**
 * Die Pausen im Kalender (ANN-863): Lagen des Ausschnitts lesen, Arbeitszeit
 * eines Tages damit rechnen und eine Pause verschieben. Mehr als 6 Stunden am
 * Stück fragt der Server zurück; die Leiste stellt die Frage.
 */
export function usePausen(bereich: { von: string; bis: string }, aktiv: boolean) {
  const queryClient = useQueryClient();
  const [rueckfrage, setRueckfrage] = useState<{ auftrag: PausenAuftrag; text: string } | null>(
    null,
  );
  const [meldung, setMeldung] = useState<string | null>(null);

  const lagen = useQuery({
    queryKey: ['break-placements', bereich.von, bereich.bis],
    queryFn: () => fetchPausenlagen(bereich.von, bereich.bis),
    enabled: aktiv,
    retry: false,
    placeholderData: keepPreviousData,
  });
  const lagenDaten = lagen.data ?? LEER;

  const verschieben = useMutation({
    mutationFn: (auftrag: { a: PausenAuftrag; bestaetigt: boolean }) =>
      setPausenlage({ ...auftrag.a, bestaetigt: auftrag.bestaetigt }),
    onMutate: () => {
      setMeldung(null);
      setRueckfrage(null);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['break-placements'] });
      // Arbeitszeit, Lücken und Belegung des Tages hängen an der Lage der Pause.
      await tageslageNeuLaden(queryClient);
    },
    onError: (fehler, auftrag) => {
      if (fehler instanceof PauseRueckfrage) {
        setRueckfrage({ auftrag: auftrag.a, text: fehler.message });
      } else {
        setMeldung(fehler.message);
      }
    },
  });

  return {
    /** Arbeitszeit und Pausen eines Tages aus dem Plan des Tages und den geladenen Lagen. */
    arbeitstag: (person: string, tag: string, plan: readonly Band[]) =>
      tagMitPausen(
        plan,
        lagenDaten.filter((l) => l.staff_member_id === person && l.on_date === tag),
      ),
    lagenDaten,
    verschieben: (auftrag: PausenAuftrag) => verschieben.mutate({ a: auftrag, bestaetigt: false }),
    melden: setMeldung,
    leiste:
      rueckfrage || meldung ? (
        <PausenLeiste
          text={rueckfrage?.text ?? meldung ?? ''}
          frage={rueckfrage !== null}
          laeuft={verschieben.isPending}
          onTrotzdem={() => {
            if (rueckfrage) verschieben.mutate({ a: rueckfrage.auftrag, bestaetigt: true });
          }}
          onSchliessen={() => {
            setRueckfrage(null);
            setMeldung(null);
          }}
        />
      ) : null,
  };
}
