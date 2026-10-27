import { useQuery } from '@tanstack/react-query';
import { ErrorState } from '@/components/ui/Feedback';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { ListRow } from '@/components/ui/ListRow';
import { Section } from '@/components/ui/Section';
import { VERBINDUNG_PRUEFEN } from '@/components/ui/abfrageTexte';
import { decidePath, payPath, reimbursementTitle } from '@/features/workforce';
import { formatEuro } from '@/lib/geld';
import { mitRueckweg } from '@/lib/rueckweg';
import { abfragen } from './eingang';

/**
 * „Erstattungen“ und „Auszuzahlen“ in Offene Punkte (ERS-001): was owner zu
 * entscheiden und was er schon genehmigt, aber noch nicht ausgezahlt hat - je
 * Antrag eine Zeile zum geführten Entscheiden bzw. Auszahlen (G10b). Ohne
 * offenen Antrag steht hier nichts; geht das Laden schief, sagt es die Gruppe
 * wie ihre Nachbarn.
 */
export function Erstattungen({ rueckweg = '/offen' }: { rueckweg?: string }) {
  const { data, isError, refetch } = useQuery(abfragen.erstattungen());
  if (isError && !data) {
    return (
      <Section titel="Erstattungen">
        <ErrorState
          title="Die Erstattungen konnten nicht geladen werden."
          description={VERBINDUNG_PRUEFEN}
          onErneut={() => refetch()}
        />
      </Section>
    );
  }
  if (!data) return null;
  return (
    <>
      {data.toDecide.length > 0 ? (
        <Listenabschnitt titel="Erstattungen" anzahl={data.toDecide.length}>
          {data.toDecide.map((r) => (
            <ListRow
              key={r.id}
              titel={r.name ?? 'Unbekannte Person'}
              meta={reimbursementTitle(r)}
              betrag={formatEuro(r.amount_cents)}
              to={mitRueckweg(decidePath(r.id), rueckweg)}
            />
          ))}
        </Listenabschnitt>
      ) : null}
      {data.toPay.length > 0 ? (
        <Listenabschnitt titel="Auszuzahlen" anzahl={data.toPay.length}>
          {data.toPay.map((r) => (
            <ListRow
              key={r.id}
              titel={r.name ?? 'Unbekannte Person'}
              meta={[reimbursementTitle(r), r.iban_masked].filter(Boolean).join(' · ')}
              betrag={formatEuro(r.amount_cents)}
              to={mitRueckweg(payPath(r.id), rueckweg)}
            />
          ))}
        </Listenabschnitt>
      ) : null}
    </>
  );
}
