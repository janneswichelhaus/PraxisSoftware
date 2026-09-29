import { useQuery } from '@tanstack/react-query';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Section } from '@/components/ui/Section';
import { tagePlus } from '@/features/appointments/calendar';
import { CALL_LIST_KEY, fetchCallList, stillToCall } from './call-list-api';

/**
 * „Anrufe für morgen" unter „Offene Punkte" (PRX-014): wie viele Termine noch
 * nicht mitgeteilt sind, und der Weg zur Liste. Die Liste selbst trägt
 * Rufnummern und steht deshalb auf eigener Seite.
 */
export function CallsSummary({ today }: { today: string }) {
  const morgen = tagePlus(today, 1);
  const { data, isError } = useQuery({
    queryKey: [...CALL_LIST_KEY, morgen],
    queryFn: () => fetchCallList(morgen),
    retry: false,
  });

  const offen = (data ?? []).filter(stillToCall).length;
  const gesamt = data?.length ?? 0;

  return (
    <Section
      titel="Anrufe für morgen"
      hinweis="Termine bestätigen, solange keine Erinnerung verschickt wird."
      aktion={
        <ButtonLink to={`/offen/anrufe?datum=${morgen}`} variant="secondary" groesse="kompakt">
          Anrufliste öffnen
        </ButtonLink>
      }
    >
      <p className="text-ink text-sm">
        {isError
          ? 'Die Anrufliste konnte nicht geladen werden.'
          : data === undefined
            ? 'Wird geladen …'
            : gesamt === 0
              ? 'Morgen stehen keine Behandlungstermine.'
              : offen === 0
                ? `Alle ${gesamt} Termine sind mitgeteilt.`
                : `${offen} von ${gesamt} Terminen noch nicht mitgeteilt.`}
      </p>
    </Section>
  );
}
