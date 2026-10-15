import { useQueries } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { fetchRechnung } from './api';
import { Druckfuss, Rechnungsblatt } from './InvoicePrintPage';

/**
 * Die Rechnungen eines Laufs in einem Druckauftrag (K13): ein Blatt je
 * Rechnung, jedes auf einer neuen Seite, ein Knopf für alle.
 *
 * Dieselbe Technik wie das einzelne Blatt (B14 Weg 1): Die Praxis druckt über
 * den Browser nach Papier oder PDF, die Quelle ist der Snapshot jeder
 * Rechnung. Die Adresse trägt nur Kennungen, keine Namen (ADR-011).
 */

/** So viele Blätter nimmt ein Druckauftrag; der Lauf bleibt darunter. */
const HOECHSTENS = 100;
const KENNUNG = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function SammeldruckPage() {
  const [suche] = useSearchParams();
  const ids = [
    ...new Set(
      (suche.get('rechnungen') ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter((id) => KENNUNG.test(id)),
    ),
  ].slice(0, HOECHSTENS);

  const blaetter = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['rechnung', id],
      queryFn: () => fetchRechnung(id),
      retry: false,
    })),
  });

  const laedt = blaetter.some((b) => b.isPending);
  const fehler = blaetter.find((b) => b.isError);

  return (
    <>
      <div className="nicht-drucken mx-auto max-w-[210mm]">
        <Rueckweg standard="/abrechnung" beschriftung="Zurück zu den Rechnungen" />
      </div>
      {ids.length === 0 ? (
        <ErrorState
          title="Keine Rechnung zum Drucken."
          description="Der Druck startet nach einem Abrechnungslauf."
        />
      ) : laedt ? (
        <LoadingState label="Rechnungen werden geladen …" />
      ) : fehler ? (
        <ErrorState
          title="Die Rechnungen konnten nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => void Promise.all(blaetter.map((b) => b.refetch()))}
        />
      ) : (
        <>
          {blaetter.map((blatt, index) =>
            blatt.data ? (
              // Ab dem zweiten Blatt eine neue Seite; am Bildschirm ein Abstand.
              <div
                key={blatt.data.id}
                className={index > 0 ? 'mt-8 print:mt-0 print:break-before-page' : ''}
              >
                <Rechnungsblatt ansicht={blatt.data} einzeln={false} />
              </div>
            ) : null,
          )}
          <Druckfuss
            beschriftung={ids.length === 1 ? 'Rechnung drucken' : `Alle ${ids.length} drucken`}
          />
        </>
      )}
    </>
  );
}
