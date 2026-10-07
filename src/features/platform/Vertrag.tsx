import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Section } from '@/components/ui/Section';
import { formatEuro } from '@/lib/geld';
import { ladeVertrag, vertragSchluessel, type Plattformzugang, type Trainingsvertrag } from './api';
import { steuerHinweis } from './paketbedingungen';
import { PLATTFORM_PFAD } from './pfade';
import { datum, uhrzeit } from './zeit';

/**
 * „Ich → Trainingsvertrag" (KND-003, ANN-288).
 *
 * Die Bestätigung des im Konto geschlossenen Vertrags, jederzeit abrufbar und
 * zum Ausdrucken oder Speichern – bis zum Mailversand (B13) der dauerhafte
 * Datenträger nach § 312f Abs. 2 BGB. Den Stand sieht, wer Rechnungen sieht;
 * das sagt der Server.
 */
export function Vertrag({ zugang }: { zugang: Plattformzugang }) {
  const vertrag = useQuery({
    queryKey: vertragSchluessel(zugang.access_id),
    queryFn: () => ladeVertrag(zugang.access_id),
  });

  return (
    <>
      <Link
        to={`${PLATTFORM_PFAD}/ich`}
        className="text-ink-muted hover:text-ink mb-4 inline-flex min-h-11 items-center text-sm print:hidden"
      >
        ← Zu „Ich“
      </Link>
      <h1 className="text-accent text-h3 font-bold">Trainingsvertrag</h1>
      {vertrag.isPending ? <LoadingState label="Ihr Vertrag wird geladen …" /> : null}
      {vertrag.isError ? (
        <div className="mt-4">
          <ErrorState
            title="Ihr Vertrag konnte nicht geladen werden."
            description="Bitte die Verbindung prüfen und erneut versuchen."
            onErneut={() => vertrag.refetch()}
          />
        </div>
      ) : null}
      {vertrag.data === null ? (
        <p className="text-ink mt-4 text-base leading-relaxed">
          Hier steht kein Vertrag, den Sie in Ihrem Konto geschlossen haben. Einen Vertrag aus der
          Praxis bekommen Sie dort.
        </p>
      ) : null}
      {vertrag.data ? <Inhalt vertrag={vertrag.data} /> : null}
    </>
  );
}

function Inhalt({ vertrag: v }: { vertrag: Trainingsvertrag }) {
  return (
    <Section titel="Ihre Buchung" rahmen>
      <p className="text-ink text-liste font-medium">{v.label}</p>
      <p className="text-ink mt-1 text-base">
        {datum(v.starts_on)} bis {datum(v.ends_on)}
      </p>
      <p className="text-ink mt-1 text-base">
        {formatEuro(v.price_cents, v.currency)}{' '}
        <span className="text-ink-muted text-sm">
          {steuerHinweis(v.vat_included, v.tax_rate_permille)}, einmal zu Beginn
        </span>
      </p>
      <p className="text-ink-muted mt-2 text-base leading-relaxed">
        Gebucht am {datum(v.concluded_at)} um {uhrzeit(v.concluded_at)} Uhr auf das Angebot vom{' '}
        {datum(v.offered_on)}. Widerrufsbelehrung und Bedingungen in der Fassung {v.wording_version}
        .
        {v.early_start_requested
          ? ' Sie haben verlangt, dass das Training vor dem Ende der Widerrufsfrist beginnt.'
          : ''}
      </p>
      <p className="text-ink-muted mt-2 text-base leading-relaxed">
        {v.released_titles.length > 0 || v.contact_released
          ? `Aus Ihrer Behandlung übernommen: ${[...v.released_titles, ...(v.contact_released ? ['Kontaktdaten'] : [])].join(', ')}.`
          : 'Aus Ihrer Behandlung wurde nichts übernommen.'}
      </p>
      <div className="mt-4 print:hidden">
        <Button variant="secondary" onClick={() => window.print()}>
          Bestätigung drucken
        </Button>
      </div>
    </Section>
  );
}
