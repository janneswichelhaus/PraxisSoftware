import { ButtonLink } from '@/components/ui/ButtonLink';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Zwischentitel } from '@/components/ui/Zwischentitel';
import { canManageAppointments, type CurrentUser } from '@/features/core';
import { mitRueckweg } from '@/lib/rueckweg';
import { tagUmplanenAdresse, type Zeitspanne } from './tagumplanen';

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
 * (G2) zu den Terminen der Person; zurück geht es auf die Seite „Termine im
 * Urlaub“, die die übrigen Tage neu zählt (Praxis-Review Überholung 7).
 *
 * Ändert sich nur ein Teil des Tages (Arbeitszeit, Freizeitausgleich), trägt
 * der Tag die Zeiten, in denen Termine bleiben können (`zeiten`): „Tag
 * umplanen“ wählt dann nur die Termine außerhalb vor, nicht den ganzen Tag
 * (Praxis-Review Überholung 9).
 *
 * Im Fenster eines geführten Ablaufs ein Zwischentitel und eine Liste ohne
 * Rahmen, kein Kasten im Kasten (DESIGN.md Regel 2); auf einer Seite
 * (`aufSeite`) ein Listenabschnitt.
 */
export function DaysToReschedule({
  staffMemberId,
  days,
  user,
  returnTo,
  aufSeite = false,
}: {
  staffMemberId: string;
  days: readonly {
    on_date: string;
    appointments: number;
    zeiten?: readonly Zeitspanne[];
  }[];
  user: CurrentUser;
  returnTo: string;
  aufSeite?: boolean;
}) {
  if (days.length === 0) return null;
  const count = days.reduce((sum, day) => sum + day.appointments, 0);
  const canPlan = canManageAppointments(user.roles);
  const rows = days.map((day) => {
    const label = DAY.format(new Date(`${day.on_date}T00:00:00Z`));
    return (
      <ListRow
        key={day.on_date}
        titel={label}
        meta={day.appointments === 1 ? '1 Termin' : `${day.appointments} Termine`}
        aktion={
          canPlan ? (
            // Der Name beginnt mit dem sichtbaren Wort (WCAG 2.5.3, UEB-10).
            <ButtonLink
              variant="secondary"
              groesse="kompakt"
              aria-label={`Tag umplanen: ${label}`}
              to={mitRueckweg(tagUmplanenAdresse(staffMemberId, day.on_date, day.zeiten), returnTo)}
            >
              Tag umplanen
            </ButtonLink>
          ) : undefined
        }
      />
    );
  });
  if (aufSeite) {
    return (
      <Listenabschnitt titel="Termine umplanen" anzahl={count}>
        {rows}
      </Listenabschnitt>
    );
  }
  return (
    <div>
      <Zwischentitel>{`Termine umplanen (${count})`}</Zwischentitel>
      <ListRows rahmen={false} beschriftung="Termine umplanen">
        {rows}
      </ListRows>
    </div>
  );
}
