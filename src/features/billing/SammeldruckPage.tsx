import { useQueries } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { fetchRechnung, type Rechnungsansicht } from './api';
import { Druckfuss, Rechnungsblatt } from './InvoicePrintPage';
import { Stornoblatt } from './CancellationPrintPage';

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

function kennungen(wert: string | null): string[] {
  return [
    ...new Set(
      (wert ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter((id) => KENNUNG.test(id)),
    ),
  ];
}

export function SammeldruckPage() {
  const [suche] = useSearchParams();
  // Die Stornodokumente der Belege einer Steuerberatung folgen den Rechnungen (ANN-830).
  const auftrag = [
    ...kennungen(suche.get('rechnungen')).map((id) => ({ id, storno: false })),
    ...kennungen(suche.get('stornos')).map((id) => ({ id, storno: true })),
  ].slice(0, HOECHSTENS);
  const ids = auftrag.map((teil) => teil.id);
  const geladen = [...new Set(ids)];

  const abfragen = useQueries({
    queries: geladen.map((id) => ({
      queryKey: ['rechnung', id],
      queryFn: () => fetchRechnung(id),
      retry: false,
    })),
  });
  const blaetter = auftrag.map(({ id }) => abfragen[geladen.indexOf(id)]!);

  // Ein Storno-Blatt gibt es nur zu einer stornierten Rechnung; gezählt wird, was gedruckt wird.
  type Blatt = {
    ansicht: Rechnungsansicht;
    storno: NonNullable<Rechnungsansicht['cancellation']> | null;
  };
  const gedruckt = auftrag.flatMap(({ storno }, index): Blatt[] => {
    const ansicht = blaetter[index]?.data;
    if (!ansicht) return [];
    if (!storno) return [{ ansicht, storno: null }];
    return ansicht.cancellation ? [{ ansicht, storno: ansicht.cancellation }] : [];
  });

  const laedt = blaetter.some((b) => b.isPending);
  const fehler = blaetter.find((b) => b.isError);

  return (
    <>
      <div className="nicht-drucken mx-auto max-w-[210mm]">
        <Rueckweg standard="/abrechnung" beschriftung="Zurück zu den Rechnungen" />
      </div>
      {ids.length === 0 ? (
        <EmptyState
          inKarte
          title="Keine Rechnung zum Drucken."
          description="Der Druck startet nach einem Abrechnungslauf."
        />
      ) : laedt ? (
        <LoadingState label="Rechnungen werden geladen …" />
      ) : fehler ? (
        <ErrorState
          title="Die Rechnungen konnten nicht geladen werden."
          onErneut={() => void Promise.all(blaetter.map((b) => b.refetch()))}
        />
      ) : (
        <>
          {/* Der Knopf über den Blättern: Bei zwanzig Rechnungen stünde er
              sonst am Ende einer langen Seite (Praxis-Review M4). */}
          <Druckfuss
            oben
            beschriftung={
              gedruckt.length > 1
                ? `Alle ${gedruckt.length} drucken`
                : gedruckt[0]?.storno
                  ? 'Stornodokument drucken'
                  : 'Rechnung drucken'
            }
          />
          {gedruckt.map(({ ansicht, storno }, index) => (
            // Ab dem zweiten Blatt eine neue Seite; am Bildschirm ein Abstand.
            <div
              key={`${ansicht.id}-${storno ? 'storno' : 'rechnung'}`}
              className={index > 0 ? 'mt-8 print:mt-0 print:break-before-page' : ''}
            >
              {storno ? (
                <Stornoblatt ansicht={ansicht} storno={storno} einzeln={false} />
              ) : (
                <Rechnungsblatt ansicht={ansicht} einzeln={false} />
              )}
            </div>
          ))}
        </>
      )}
    </>
  );
}
