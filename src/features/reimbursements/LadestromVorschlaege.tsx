import { useQuery } from '@tanstack/react-query';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { ErrorState } from '@/components/ui/Feedback';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { Disclosure } from '@/components/ui/Card';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Section } from '@/components/ui/Section';
import { VERBINDUNG_PRUEFEN } from '@/components/ui/abfrageTexte';
import { formatEuro } from '@/lib/geld';
import { mitRueckweg } from '@/lib/rueckweg';
import { SUGGESTIONS_KEY, fetchElectricitySuggestions } from './api';
import { requestElectricityPath } from './paths';
import { hoursText, monthLong } from './rules';

/**
 * Ladestrom im Eingang (ORG-008): je abgeschlossenem Monat, für den die
 * angemeldete Person noch keinen Ladestrom beantragt hat, der fertig
 * gerechnete Betrag - geplante Arbeitsstunden × Strecke × Verbrauch × Satz,
 * gerechnet am Server. „Beantragen“ öffnet G10 an der Zusammenfassung; dort
 * bleiben der Haken „zu Hause geladen“ und das Absenden.
 *
 * Nur die eigene Person, keine Summe über alle, kein Bezug auf Touren oder
 * Kilometer aus der Planung (PROJECT_PRINCIPLES.md 20). Ohne Vorschlag steht
 * hier nichts.
 */
export function LadestromVorschlaege({ rueckweg }: { rueckweg: string }) {
  const { data, isError, refetch } = useQuery({
    queryKey: SUGGESTIONS_KEY,
    queryFn: fetchElectricitySuggestions,
    retry: false,
    staleTime: 5 * 60_000,
  });
  if (isError && !data) {
    return (
      <Section titel="Ladestrom">
        <ErrorState
          title="Der Ladestrom konnte nicht berechnet werden."
          description={VERBINDUNG_PRUEFEN}
          onErneut={() => refetch()}
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
        meta={`${hoursText(vorschlag.working_minutes)} Arbeitszeit`}
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
