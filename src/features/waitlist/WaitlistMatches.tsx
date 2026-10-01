import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { appointmentTypeHint, schreibeTerminVorbelegung } from '@/features/appointments/api';
import { DAUER_PARAM } from '@/features/appointments/terminformular';
import { formatDate } from '@/lib/datum';
import { mitRueckweg } from '@/lib/rueckweg';
import { telHref } from '@/lib/telefon';
import {
  addMinutes,
  fetchWaitlistMatches,
  reasonLabels,
  windowsText,
  type FreeSlot,
  type WaitlistMatch,
} from './api';

function takeOverLink(match: WaitlistMatch, slot: FreeSlot, back: string): string {
  const params = new URLSearchParams(
    schreibeTerminVorbelegung({
      datum: slot.date,
      beginn: slot.start,
      ende: addMinutes(slot.start, match.duration_minutes),
      art: match.appointment_type,
      person: slot.staffMemberId,
    }).slice(1),
  );
  params.set(DAUER_PARAM, String(match.duration_minutes));
  if (match.treatment_basis_id) params.set('verordnung', match.treatment_basis_id);
  params.set('warteliste', match.id);
  return mitRueckweg(`/patienten/${match.patient_id}/termine/neu?${params.toString()}`, back);
}

/**
 * „Passt von der Warteliste" (PRX-004).
 *
 * Nach einer Absage und an einer freien Stelle im Kalender: die offenen
 * Einträge, deren Wunsch auf den Platz passt, mit der Nummer zum Anrufen.
 * „Übernehmen" öffnet das Terminformular vorbelegt; erst dort entsteht der
 * Termin, und der Server schließt den Eintrag in derselben Transaktion.
 * Nichts wird versendet (B15).
 */
export function WaitlistMatches({ slot, back }: { slot: FreeSlot; back: string }) {
  const { data, isError } = useQuery({
    queryKey: ['waitlist', 'matches', slot],
    queryFn: () => fetchWaitlistMatches(slot),
    retry: false,
  });

  if (isError) {
    return (
      <Statusmeldung ton="warnung" className="mt-4">
        Die Warteliste konnte nicht geprüft werden.
      </Statusmeldung>
    );
  }
  if (!data || data.length === 0) return null;

  return (
    <Section
      titel={`Passt von der Warteliste (${data.length})`}
      hinweis="Wer auf diesen Platz passt. Anrufen, dann übernehmen – der Eintrag wird mit dem Termin geschlossen."
      rahmen
    >
      <ul className="divide-line divide-y">
        {data.map((match) => {
          const numbers = [match.phone, match.phone_mobile].filter((n): n is string => Boolean(n));
          return (
            <li key={match.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-ink text-liste font-medium">
                  {match.patient_family_name}, {match.patient_given_name}
                </span>
                <Badge>{reasonLabels[match.priority_reason]}</Badge>
                {match.territory_status === 'match' ? (
                  <Badge ton="positiv">Im Gebietstag</Badge>
                ) : null}
                {match.territory_status === 'outside' ? (
                  <Badge ton="warnung">Außerhalb des Gebietstags</Badge>
                ) : null}
              </div>
              <p className="text-ink-muted text-sm">
                {[
                  // Nur eine abweichende Terminart steht dran (ANN-192).
                  appointmentTypeHint(match.appointment_type),
                  `${match.duration_minutes} Min.`,
                  windowsText(match.time_windows),
                  match.needed_by ? `bis spätestens ${formatDate(match.needed_by)}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {numbers.map((number) => (
                  <a
                    key={number}
                    href={telHref(number)}
                    className="text-accent inline-flex min-h-11 items-center text-sm underline underline-offset-2"
                  >
                    Anrufen: {number}
                  </a>
                ))}
                <ButtonLink
                  to={takeOverLink(match, slot, back)}
                  variant="secondary"
                  groesse="kompakt"
                >
                  Übernehmen
                </ButtonLink>
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
