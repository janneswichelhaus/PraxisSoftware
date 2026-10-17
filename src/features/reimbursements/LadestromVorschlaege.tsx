import { useQuery } from '@tanstack/react-query';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { Disclosure } from '@/components/ui/Card';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Listenfehler } from '@/components/ui/Rueckmeldung';
import { Section } from '@/components/ui/Section';
import { formatEuro } from '@/lib/geld';
import { mitRueckweg } from '@/lib/rueckweg';
import { SUGGESTIONS_KEY, fetchElectricitySuggestions } from './api';
import { requestElectricityPath } from './paths';
import { hoursText, monthLong } from './rules';

/**
 * Ladestrom im Eingang (ORG-008): je abgeschlossenem Monat, für den die
 * angemeldete Person noch keinen Ladestrom beantragt hat, ein geschätzter
 * Betrag - geplante Arbeitsstunden × Strecke je Stunde × Verbrauch × Satz,
 * gerechnet am Server. „Beantragen“ öffnet G10 an der Zusammenfassung; dort
 * rechnet der Server den Betrag aus den Kilometern der geplanten Touren
 * (BEF-181) und bleiben der Haken „zu Hause geladen“ und das Absenden.
 *
 * Hier werden keine Touren gerechnet: Zwölf Monate je Öffnen des Eingangs
 * wären hunderte Routen beim Kartendienst. Nur die eigene Person, keine
 * Summe über alle (PROJECT_PRINCIPLES.md 20). Ohne Vorschlag steht hier
 * nichts.
 */
export function LadestromVorschlaege({ rueckweg }: { rueckweg: string }) {
  const { data, isError, refetch } = useQuery({
    queryKey: SUGGESTIONS_KEY,
    queryFn: fetchElectricitySuggestions,
    retry: false,
    staleTime: 5 * 60_000,
  });
  // Ein Vorschlag ist kein Alarm (Praxis-Review ORG-008): Ohne Netz steht
  // eine leise Zeile mit „Erneut versuchen“ da, kein roter Kasten.
  if (isError && !data) {
    return (
      <Section titel="Ladestrom">
        <Listenfehler
          text="Der Ladestrom ließ sich gerade nicht berechnen."
          onErneut={() => void refetch()}
        />
      </Section>
    );
  }
  if (!data || data.length === 0) return null;
  // Der jüngste Monat steht offen da, die übrigen eingeklappt: Bis zu zwölf
  // Zeilen drückten sonst alles andere im Eingang aus dem Bild (Sichtung
  // ORG-008, 375 px).
  const [neuester, ...weitere] = data;
  const zeile = (vorschlag: (typeof data)[number]) => {
    const titel = `Ladestrom ${monthLong(vorschlag.month)}`;
    return (
      <ListRow
        key={vorschlag.month}
        titel={titel}
        meta={`Schätzung nach ${hoursText(vorschlag.working_minutes)} Arbeitszeit`}
        betrag={formatEuro(vorschlag.amount_cents)}
        aktion={
          <ButtonLink
            variant="secondary"
            groesse="kompakt"
            // Der Name beginnt mit dem sichtbaren Wort (WCAG 2.5.3).
            aria-label={`Beantragen: ${titel}`}
            to={mitRueckweg(requestElectricityPath(vorschlag.month), rueckweg)}
          >
            Beantragen
          </ButtonLink>
        }
      />
    );
  };
  return (
    <Listenabschnitt
      titel="Ladestrom"
      anzahl={data.length}
      mehr={
        weitere.length > 0 ? (
          <Disclosure summary="Weitere Monate" anzahl={weitere.length}>
            <ListRows>{weitere.map(zeile)}</ListRows>
          </Disclosure>
        ) : undefined
      }
    >
      {neuester ? zeile(neuester) : null}
    </Listenabschnitt>
  );
}
