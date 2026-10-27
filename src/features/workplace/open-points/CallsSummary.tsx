import { useQuery } from '@tanstack/react-query';
import { ErrorState } from '@/components/ui/Feedback';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { ListRow } from '@/components/ui/ListRow';
import { Section } from '@/components/ui/Section';
import { VERBINDUNG_PRUEFEN } from '@/components/ui/abfrageTexte';
import { stillToCall } from './call-list-api';
import { abfragen } from './eingang';
import { tagePlus } from '@/lib/datum';

/**
 * „Anrufe für morgen" unter „Offene Punkte" (PRX-014): wie viele Termine noch
 * nicht mitgeteilt sind, als eine Zeile, die zur Liste führt. Die Liste selbst
 * trägt Rufnummern und steht deshalb auf eigener Seite. Ist niemand mehr
 * anzurufen, keine Gruppe - den Weg zur Liste hat die Seite dann am Ende.
 */
export function CallsSummary({ today }: { today: string }) {
  const morgen = tagePlus(today, 1);
  const { data, isError, refetch } = useQuery(abfragen.anrufe(morgen));

  if (isError && !data) {
    return (
      <Section titel="Anrufe für morgen">
        <ErrorState
          title="Die Anrufliste konnte nicht geladen werden."
          description={VERBINDUNG_PRUEFEN}
          onErneut={() => refetch()}
        />
      </Section>
    );
  }
  const offen = (data ?? []).filter(stillToCall).length;
  if (offen === 0) return null;

  return (
    <Listenabschnitt titel="Anrufe für morgen" anzahl={offen}>
      <ListRow
        titel="Anrufliste für morgen"
        meta={`${offen} von ${data?.length ?? 0} Terminen noch nicht mitgeteilt.`}
        to={`/offen/anrufe?datum=${morgen}`}
      />
    </Listenabschnitt>
  );
}
