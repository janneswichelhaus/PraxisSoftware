import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { ListRow } from '@/components/ui/ListRow';
import { canManageAppointments, type CurrentUser } from '@/features/session/types';
import { mitRueckweg } from '@/lib/rueckweg';

/** „Dienstag, 3. November“ - der Tag, der umzuplanen ist. */
const DAY = new Intl.DateTimeFormat('de-DE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

/**
 * Die Tage mit Terminen, die nach einer Entscheidung umzuplanen sind - nach
 * genehmigtem Urlaub (URL-001, ANN-578) und nach einer Arbeitszeitänderung
 * (AZ-001, ANN-590). Abgesagt wird hier nichts: Jeder Tag führt, wer Termine
 * verwaltet, zu „Tag umplanen“ (G2) für die Person; zurück geht es dorthin,
 * woher das Entscheiden kam - der Antrag selbst ist danach nicht mehr offen.
 */
export function DaysToReschedule({
  staffMemberId,
  days,
  user,
  returnTo,
}: {
  staffMemberId: string;
  days: readonly { on_date: string; appointments: number }[];
  user: CurrentUser;
  returnTo: string;
}) {
  if (days.length === 0) return null;
  const count = days.reduce((sum, day) => sum + day.appointments, 0);
  return (
    <Listenabschnitt titel="Termine umplanen" anzahl={count} ebene={3}>
      {days.map((day) => (
        <ListRow
          key={day.on_date}
          titel={DAY.format(new Date(`${day.on_date}T00:00:00Z`))}
          meta={day.appointments === 1 ? '1 Termin' : `${day.appointments} Termine`}
          {...(canManageAppointments(user.roles)
            ? {
                to: mitRueckweg(
                  `/kalender/tag-umplanen?person=${staffMemberId}&datum=${day.on_date}`,
                  returnTo,
                ),
              }
            : {})}
        />
      ))}
    </Listenabschnitt>
  );
}
