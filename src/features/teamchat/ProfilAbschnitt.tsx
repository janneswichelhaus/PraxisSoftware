import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Farbpunkt, Personenbild } from '@/components/ui/Personenbild';
import {
  PERSONENFARBE_NAMEN,
  PERSONENFARBEN,
  type Personenfarbe,
} from '@/components/ui/personenfarben';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Wahlreihe } from '@/components/ui/Wahlreihe';
import { AVATARE_KEY, PERSONEN_KEY, fetchPersonen, waehleFarbe } from './api';
import { avatarVon, useAvatare } from './teambilder';

const WAHLEN = PERSONENFARBEN.map((farbe) => ({
  wert: farbe,
  text: PERSONENFARBE_NAMEN[farbe],
  zeichen: <Farbpunkt farbe={farbe} />,
}));

/**
 * Wie man im Teamchat aussieht (TEAM-006): das eigene Bild und die eigene
 * Farbe, gewählt nur von der Person selbst (ANN-666). Ein Tipp auf eine Farbe
 * speichert sie; darunter steht, wer sie noch trägt - doppelt ist erlaubt,
 * aber selten gewollt.
 */
export function ProfilAbschnitt({ staffMemberId, name }: { staffMemberId: string; name: string }) {
  const queryClient = useQueryClient();
  const avatare = useAvatare();
  const personen = useQuery({ queryKey: PERSONEN_KEY, queryFn: fetchPersonen, staleTime: 300_000 });
  const farbe = useMutation({
    mutationFn: waehleFarbe,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: AVATARE_KEY }),
  });

  return (
    <Section titel="Bild und Farbe im Teamchat">
      <Abfragezustand
        abfrage={avatare}
        laden="Bild und Farbe werden geladen …"
        fehler="Bild und Farbe konnten nicht geladen werden."
      >
        {(daten) => {
          const eigen = avatarVon(daten, staffMemberId);
          const gewaehlt: Personenfarbe | null = farbe.isPending
            ? farbe.variables
            : (eigen?.color ?? null);
          const auchBei = (personen.data ?? [])
            .filter((p) => avatarVon(daten, p.staff_member_id)?.color === gewaehlt)
            .map((p) => p.name);
          return (
            <div className="flex flex-col gap-4">
              <Personenbild name={name} farbe={gewaehlt} groesse="gross" />
              <Wahlreihe
                legende="Farbe"
                wahlen={WAHLEN}
                gewaehlt={gewaehlt}
                onWaehlen={(neu) => {
                  if (neu !== gewaehlt) farbe.mutate(neu);
                }}
                zusatz={
                  auchBei.length > 0 ? (
                    <p className="text-ink-muted text-sm">Auch bei {auchBei.join(', ')}</p>
                  ) : undefined
                }
              />
              {farbe.isError ? (
                <Statusmeldung ton="fehler">{farbe.error.message}</Statusmeldung>
              ) : null}
            </div>
          );
        }}
      </Abfragezustand>
    </Section>
  );
}
