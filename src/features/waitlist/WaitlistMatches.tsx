import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { ListRows } from '@/components/ui/ListRow';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Textlink } from '@/components/ui/Textlink';
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
import { Arbeitszeile } from './Arbeitszeile';
import { appointmentTypeHint, schreibeTerminVorbelegung, DAUER_PARAM } from '@/lib/termin';

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
      // Die Folge des Übernehmens - der Eintrag schließt mit dem Termin -
      // ist eine Aussage über den Datenfluss und bleibt (PRX-004).
      hinweis="Anrufen, dann übernehmen – der Eintrag wird mit dem Termin geschlossen."
    >
      <ListRows>
        {data.map((match) => {
          const numbers = [match.phone, match.phone_mobile].filter((n): n is string => Boolean(n));
          return (
            <Arbeitszeile
              key={match.id}
              titel={`${match.patient_family_name}, ${match.patient_given_name}`}
              status={
                <>
                  <Badge>{reasonLabels[match.priority_reason]}</Badge>
                  {match.territory_status === 'match' ? (
                    <Badge ton="positiv">Im Gebietstag</Badge>
                  ) : null}
                  {match.territory_status === 'outside' ? (
                    <Badge ton="warnung">Außerhalb des Gebietstags</Badge>
                  ) : null}
                </>
              }
              meta={[
                // Nur eine abweichende Terminart steht dran (ANN-192).
                appointmentTypeHint(match.appointment_type),
                `${match.duration_minutes} Min.`,
                windowsText(match.time_windows),
                match.needed_by ? `bis spätestens ${formatDate(match.needed_by)}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              aktionen={
                <>
                  {numbers.map((number) => (
                    <Textlink key={number} href={telHref(number)} alleinstehend className="text-sm">
                      Anrufen: {number}
                    </Textlink>
                  ))}
                  <ButtonLink to={takeOverLink(match, slot, back)} variant="secondary">
                    Übernehmen
                  </ButtonLink>
                </>
              }
            />
          );
        })}
      </ListRows>
    </Section>
  );
}
