import { ListRow } from '@/components/ui/ListRow';
import { WEEKDAY_NAME } from './format';
import { WEEKDAYS, blocksText, hoursText, weekMinutes, workMinutes, type Week } from './rules';

/**
 * Ein Wochenplan als Zeilen: je Wochentag die Zeiten und die Stunden, freie
 * Tage gedämpft, zuletzt die Woche. Steht in einer `Listenabschnitt`- oder
 * `ListRows`-Liste.
 */
export function WeekRows({ week }: { week: Week }) {
  return (
    <>
      {WEEKDAYS.map((day) => {
        const blocks = week[day] ?? [];
        return (
          <ListRow
            key={day}
            titel={WEEKDAY_NAME[day]}
            meta={blocksText(blocks)}
            betrag={blocks.length > 0 ? hoursText(workMinutes(blocks)) : null}
            gedaempft={blocks.length === 0}
          />
        );
      })}
      <ListRow titel="Woche" betrag={hoursText(weekMinutes(week))} />
    </>
  );
}
