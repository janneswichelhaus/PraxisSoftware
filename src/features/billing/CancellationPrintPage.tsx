import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Wortmarke } from '@/components/ui/Wortmarke';
import { MARKE_RECHNUNGSHOEHE } from '@/components/ui/markeRegeln';
import { formatDate } from '@/lib/datum';
import { formatEuro } from '@/lib/geld';
import { KeineStammdaten, fetchRechnung, type Rechnungsansicht } from './api';

/**
 * Das Stornodokument als Blatt zum Verschicken (ABR-003c).
 *
 * ADR-009 Punkt 9 verlangt ein **nachvollziehbares Storno- oder
 * Korrekturdokument** — und das geht an denselben Empfänger wie die Rechnung,
 * die es aufhebt. Deshalb ein eigenes Blatt mit eigener Nummer und nicht ein
 * Vermerk auf der Rechnung.
 *
 * Gebaut aus zwei Quellen, die beide feststehen: dem Snapshot der
 * ausgestellten Rechnung (ADR-009 Punkt 10) und der Stornozeile mit Nummer,
 * Tag und Grund. Eine dritte Fassung derselben Angaben gibt es nicht.
 *
 * Gedruckt wird wie die Rechnung über den Browser (B14, Weg 1): Die Datei
 * entsteht beim Nutzer, und die Anwendung sieht sie nie.
 */
export function CancellationPrintPage() {
  const { invoiceId = '' } = useParams();

  const rechnung = useQuery({
    queryKey: ['rechnung', invoiceId],
    queryFn: () => fetchRechnung(invoiceId),
    retry: false,
  });

  if (rechnung.isPending) return <LoadingState label="Stornodokument wird geladen …" />;

  if (rechnung.error instanceof KeineStammdaten) {
    return (
      <Statusmeldung ton="warnung">
        Es sind noch keine Praxis-Stammdaten erfasst. Ohne Absender lässt sich kein Stornodokument
        drucken — sie stehen unter „Praxisstammdaten".
      </Statusmeldung>
    );
  }

  if (rechnung.isError || !rechnung.data) {
    return (
      <ErrorState
        title="Das Stornodokument konnte nicht geladen werden."
        description="Bitte später erneut versuchen. Sind Sie noch angemeldet?"
      />
    );
  }

  if (!rechnung.data.cancellation) {
    return (
      <Statusmeldung ton="warnung">
        Diese Rechnung ist nicht storniert. Ein Stornodokument entsteht erst mit dem Storno — auf
        der Rechnung selbst.
      </Statusmeldung>
    );
  }

  return <Stornoblatt ansicht={rechnung.data} storno={rechnung.data.cancellation} />;
}

/**
 * Das Storno kommt als eigener Parameter und nicht aus `ansicht`: Dass es
 * existiert, hat die aufrufende Komponente bereits beantwortet — so steht es
 * auch im Typ und nicht nur in der Reihenfolge der Aufrufe.
 */
function Stornoblatt({
  ansicht,
  storno,
}: {
  ansicht: Rechnungsansicht;
  storno: NonNullable<Rechnungsansicht['cancellation']>;
}) {
  const dokument = ansicht.document;
  const absender = dokument.issuer;
  const empfaenger = dokument.recipient;

  return (
    <>
      <div className="nicht-drucken">
        <Link
          to={`/abrechnung/rechnungen/${ansicht.id}`}
          className="text-ink-muted hover:text-ink mb-4 inline-flex min-h-11 items-center text-sm"
        >
          ← Zurück zur Rechnung
        </Link>
      </div>

      <article className="text-ink mx-auto max-w-[210mm] text-[0.9375rem]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <Wortmarke hoehe={MARKE_RECHNUNGSHOEHE} fassung="schwarz" />
          <address className="text-ink-muted text-right text-sm not-italic">
            <span className="text-ink block font-medium">{absender.legal_name}</span>
            <span className="block">
              {`${absender.street} ${absender.house_number ?? ''}`.trim()}
            </span>
            <span className="block">
              {absender.postal_code} {absender.city}
            </span>
            {absender.phone ? <span className="block">{absender.phone}</span> : null}
            {absender.email ? <span className="block">{absender.email}</span> : null}
          </address>
        </div>

        <div className="mt-10 flex flex-wrap justify-between gap-8">
          <div className="min-w-[70mm]">
            <p className="text-ink-subtle border-line border-b pb-1 text-[0.6875rem]">
              {absender.legal_name} · {`${absender.street} ${absender.house_number ?? ''}`.trim()} ·{' '}
              {absender.postal_code} {absender.city}
            </p>
            <address className="mt-3 leading-relaxed not-italic">
              <span className="block">{empfaenger.name}</span>
              {empfaenger.street ? (
                <span className="block">
                  {`${empfaenger.street} ${empfaenger.house_number ?? ''}`.trim()}
                </span>
              ) : null}
              {empfaenger.postal_code || empfaenger.city ? (
                <span className="block">
                  {empfaenger.postal_code} {empfaenger.city}
                </span>
              ) : null}
            </address>
            {empfaenger.reference ? (
              <p className="text-ink-muted mt-2 text-sm">Aktenzeichen: {empfaenger.reference}</p>
            ) : null}
          </div>

          <dl className="text-sm">
            <div className="flex gap-3">
              <dt className="text-ink-muted w-40">Stornonummer</dt>
              <dd className="text-ink font-medium tabular-nums">{storno.cancellation_number}</dd>
            </div>
            <div className="mt-1 flex gap-3">
              <dt className="text-ink-muted w-40">Datum</dt>
              <dd className="tabular-nums">{formatDate(storno.cancelled_on)}</dd>
            </div>
            <div className="mt-1 flex gap-3">
              <dt className="text-ink-muted w-40">Behandelte Person</dt>
              <dd>{dokument.patient.name}</dd>
            </div>
            <div className="mt-1 flex gap-3">
              <dt className="text-ink-muted w-40">Steuernummer</dt>
              <dd className="tabular-nums">{absender.tax_number}</dd>
            </div>
          </dl>
        </div>

        <h1 className="mt-10 text-lg font-semibold">
          Stornierung der Rechnung {ansicht.invoice_number}
        </h1>

        <p className="mt-3 leading-relaxed">
          Die Rechnung {ansicht.invoice_number}
          {ansicht.issued_on ? ` vom ${formatDate(ansicht.issued_on)}` : ''} über{' '}
          {formatEuro(dokument.totals.total_cents, dokument.currency)} wird hiermit vollständig
          storniert. Sie ist damit gegenstandslos; ein Ausgleich ist zu ihr nicht mehr nötig.
        </p>

        <dl className="mt-4 text-sm">
          <dt className="text-ink-muted">Grund</dt>
          <dd className="text-ink mt-1">{storno.reason}</dd>
        </dl>

        {/* Der ausgewiesene Steuerbetrag der stornierten Rechnung gehört auf
            das Blatt: Er ist es, der beim Empfänger rückgängig zu machen ist. */}
        {dokument.totals.tax_total_cents > 0 ? (
          <p className="text-ink-muted mt-4 text-sm">
            In dem stornierten Betrag war Umsatzsteuer in Höhe von{' '}
            {formatEuro(dokument.totals.tax_total_cents, dokument.currency)} enthalten.
          </p>
        ) : null}

        {ansicht.correction_invoice_number ? (
          <p className="text-ink-muted mt-4 text-sm">
            Die Leistungen werden mit der Rechnung {ansicht.correction_invoice_number} neu
            abgerechnet.
          </p>
        ) : null}
      </article>

      <div className="nicht-drucken mt-10 flex max-w-[210mm] flex-col gap-3">
        <div>
          <Button type="button" onClick={() => window.print()}>
            Stornodokument drucken
          </Button>
        </div>
        <p className="text-ink-subtle max-w-prose text-xs leading-relaxed">
          Wie bei der Rechnung entsteht die Datei im Druckdialog auf diesem Gerät; die Anwendung
          legt sie nicht ab. Aufbewahrt wird das Storno als Datensatz mit Nummer, Tag und Grund.
        </p>
      </div>
    </>
  );
}
