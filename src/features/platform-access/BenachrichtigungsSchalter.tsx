import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Checkbox } from '@/components/ui/Checkbox';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { BENACHRICHTIGUNGEN, BENACHRICHTIGUNGSARTEN } from '@/lib/begriffe';
import { ladeAbgeschalteteArten, SCHALTER_SCHLUESSEL, schalteArt } from './benachrichtigungen-api';

/**
 * Benachrichtigungen an Patient:innen und Kund:innen (KOM-011, ADR-024
 * Punkt 15): Die Praxis kann eine Art für alle abschalten, nie für eine
 * Person einschalten. Ob jemand Benachrichtigungen gewählt hat, steht hier
 * bewusst nicht (ANN-344). Nur owner; verbindlich prüft der Server.
 *
 * Mitarbeitende werden nicht benachrichtigt (Punkt 12): Was die Praxis tun
 * soll, steht in den Offenen Punkten.
 */
export function BenachrichtigungsSchalter() {
  const queryClient = useQueryClient();
  const abgeschaltet = useQuery({
    queryKey: SCHALTER_SCHLUESSEL,
    queryFn: ladeAbgeschalteteArten,
    retry: false,
  });
  const schalten = useMutation({
    mutationFn: ({ art, an }: { art: (typeof BENACHRICHTIGUNGSARTEN)[number]; an: boolean }) =>
      schalteArt(art, an),
    onSettled: () => queryClient.invalidateQueries({ queryKey: SCHALTER_SCHLUESSEL }),
  });

  return (
    <Section
      titel="Benachrichtigungen an Patient:innen und Kund:innen"
      hinweis="Jede Person wählt selbst, ob und wie sie benachrichtigt wird. Hier schalten Sie eine Art für alle ab. Einschalten für eine Person kann die Praxis nicht."
    >
      {abgeschaltet.isPending ? (
        <LoadingState label="Wird geladen …" />
      ) : abgeschaltet.isError ? (
        <ErrorState title={abgeschaltet.error.message} />
      ) : (
        <div className="flex flex-col gap-1">
          {BENACHRICHTIGUNGSARTEN.map((art) => (
            <Checkbox
              key={art}
              label={BENACHRICHTIGUNGEN[art].name}
              hint={`„${BENACHRICHTIGUNGEN[art].text.replace('{datum}', '…').replace('{uhrzeit}', '…')}“`}
              checked={!abgeschaltet.data.includes(art)}
              disabled={schalten.isPending}
              onChange={(e) => schalten.mutate({ art, an: e.target.checked })}
            />
          ))}
        </div>
      )}
      {schalten.isError ? (
        <Statusmeldung ton="fehler" className="mt-2">
          {schalten.error.message}
        </Statusmeldung>
      ) : null}
    </Section>
  );
}
