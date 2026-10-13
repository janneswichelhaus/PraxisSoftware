import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/Feedback';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { ListRow } from '@/components/ui/ListRow';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { VERBINDUNG_PRUEFEN } from '@/components/ui/abfrageTexte';
import type { WaitlistEntry } from '@/features/waitlist/api';
import { confirmWaitlistEntry } from '@/features/waitlist/api';
import { mitRueckweg } from '@/lib/rueckweg';
import { WAITLIST_REVIEW_KEY, abfragen } from './eingang';
import { formatDay } from './format';

/**
 * „Warteliste prüfen" (ABN-018, BEF-108): offene Einträge, die seit acht
 * Wochen niemand angefasst hat (ANN-220). Ob sie noch gelten, weiß nur, wer
 * nachfragt - die Liste sagt nur, dass es Zeit dafür ist. Die Zeile führt in
 * den Eintrag (was sich geändert hat); „Noch aktuell" daneben lässt ihn, wie
 * er ist, und beginnt die Frist von vorn. Ohne fälligen Eintrag keine Gruppe.
 */
export function WaitlistReview({ timeZone }: { timeZone: string }) {
  const { data, isError, refetch } = useQuery(abfragen.warteliste());

  if (isError && !data) {
    return (
      <Section titel="Warteliste prüfen">
        <ErrorState
          title="Die Warteliste konnte nicht geladen werden."
          description={VERBINDUNG_PRUEFEN}
          onErneut={() => refetch()}
        />
      </Section>
    );
  }
  if (!data || data.length === 0) return null;

  return (
    <Listenabschnitt titel="Warteliste prüfen" anzahl={data.length}>
      {data.map((eintrag) => (
        <Zeile key={eintrag.id} eintrag={eintrag} timeZone={timeZone} />
      ))}
    </Listenabschnitt>
  );
}

function Zeile({ eintrag, timeZone }: { eintrag: WaitlistEntry; timeZone: string }) {
  const queryClient = useQueryClient();
  const bestaetigen = useMutation({
    mutationFn: () => confirmWaitlistEntry(eintrag),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WAITLIST_REVIEW_KEY }),
  });
  const name = `${eintrag.patient_given_name} ${eintrag.patient_family_name}`;

  return (
    <ListRow
      titel={`${eintrag.patient_family_name}, ${eintrag.patient_given_name}`}
      meta={
        <>
          Unverändert seit {formatDay(eintrag.updated_at, timeZone)}
          {bestaetigen.isError ? (
            <Statusmeldung ton="fehler" className="mt-1">
              {bestaetigen.error.message}
            </Statusmeldung>
          ) : null}
        </>
      }
      to={mitRueckweg(`/warteliste/${eintrag.id}/bearbeiten`, '/offen')}
      aktion={
        <Button
          type="button"
          variant="secondary"
          disabled={bestaetigen.isPending}
          onClick={() => bestaetigen.mutate()}
        >
          {bestaetigen.isPending ? 'Wird bestätigt …' : 'Noch aktuell'}
          <span className="sr-only">: {name}</span>
        </Button>
      }
    />
  );
}
