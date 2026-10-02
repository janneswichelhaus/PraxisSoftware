import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { confirmWaitlistEntry, fetchWaitlist, type WaitlistEntry } from '@/features/waitlist/api';
import { mitRueckweg } from '@/lib/rueckweg';
import { formatDay } from './format';

export const WAITLIST_REVIEW_KEY = ['open-points', 'waitlist-review'] as const;

/**
 * „Warteliste prüfen" (ABN-018, BEF-108): offene Einträge, die seit acht
 * Wochen niemand angefasst hat (ANN-220). Ob sie noch gelten, weiß nur, wer
 * nachfragt - die Liste sagt nur, dass es Zeit dafür ist. „Noch aktuell"
 * lässt den Eintrag, wie er ist, und beginnt die Frist von vorn; was sich
 * geändert hat, geht über „Bearbeiten".
 */
export function WaitlistReview({ timeZone }: { timeZone: string }) {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: WAITLIST_REVIEW_KEY,
    queryFn: () => fetchWaitlist('open'),
    retry: false,
    select: (eintraege) => eintraege.filter((e) => e.review_due),
  });

  return (
    <Section
      titel={data && data.length > 0 ? `Warteliste prüfen (${data.length})` : 'Warteliste prüfen'}
    >
      {isPending ? <LoadingState label="Warteliste wird geladen …" /> : null}
      {isError ? (
        <ErrorState
          title="Die Warteliste konnte nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => refetch()}
        />
      ) : null}
      {data && data.length === 0 ? (
        <p className="text-ink-muted text-sm">Kein Eintrag wartet auf eine Prüfung.</p>
      ) : null}
      {data && data.length > 0 ? (
        <ul className="divide-line border-line bg-surface rounded-card divide-y border px-4 sm:px-5">
          {data.map((eintrag) => (
            <Zeile key={eintrag.id} eintrag={eintrag} timeZone={timeZone} />
          ))}
        </ul>
      ) : null}
    </Section>
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
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0 wrap-anywhere">
        <p className="text-ink text-liste font-medium">
          {eintrag.patient_family_name}, {eintrag.patient_given_name}
        </p>
        <p className="text-ink-muted text-sm">
          Unverändert seit {formatDay(eintrag.updated_at, timeZone)}
        </p>
        {bestaetigen.isError ? (
          <Statusmeldung ton="fehler" className="mt-1">
            {bestaetigen.error.message}
          </Statusmeldung>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          groesse="kompakt"
          disabled={bestaetigen.isPending}
          onClick={() => bestaetigen.mutate()}
        >
          {bestaetigen.isPending ? 'Wird bestätigt …' : 'Noch aktuell'}
          <span className="sr-only">: {name}</span>
        </Button>
        <ButtonLink
          to={mitRueckweg(`/warteliste/${eintrag.id}/bearbeiten`, '/offen')}
          variant="quiet"
          groesse="kompakt"
        >
          Bearbeiten
          <span className="sr-only">: {name}</span>
        </ButtonLink>
      </div>
    </li>
  );
}
