import { ButtonLink } from '@/components/ui/ButtonLink';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Zwischentitel } from '@/components/ui/Zwischentitel';
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
 * genehmigtem oder selbst eingetragenem Urlaub (URL-001, ANN-578). Abgesagt
 * wird hier nichts: Wer Termine verwaltet, kommt je Tag mit „Tag umplanen“
 * (G2) zu den Terminen der Person; zurück geht es dorthin, woher das
 * Entscheiden kam - der Antrag selbst ist danach nicht mehr offen.
 *
 * Steht im Fenster eines geführten Ablaufs: deshalb ein Zwischentitel und
 * eine Liste ohne Rahmen, kein Kasten im Kasten (DESIGN.md Regel 2).
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
  const canPlan = canManageAppointments(user.roles);
  return (
    <div>
      <Zwischentitel>{`Termine umplanen (${count})`}</Zwischentitel>
      <ListRows rahmen={false} beschriftung="Termine umplanen">
        {days.map((day) => {
          const label = DAY.format(new Date(`${day.on_date}T00:00:00Z`));
          return (
            <ListRow
              key={day.on_date}
              titel={label}
              meta={day.appointments === 1 ? '1 Termin' : `${day.appointments} Termine`}
              aktion={
                canPlan ? (
                  <ButtonLink
                    variant="secondary"
                    groesse="kompakt"
                    aria-label={`${label} umplanen`}
                    to={mitRueckweg(
                      `/kalender/tag-umplanen?person=${staffMemberId}&datum=${day.on_date}`,
                      returnTo,
                    )}
                  >
                    Tag umplanen
                  </ButtonLink>
                ) : undefined
              }
            />
          );
        })}
      </ListRows>
    </div>
  );
}
