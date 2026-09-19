import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Wortmarke } from '@/components/ui/Wortmarke';
import { MARKE_RECHNUNGSHOEHE } from '@/components/ui/markeRegeln';
import { formatDate } from '@/lib/datum';
import { formatEuro } from '@/lib/geld';
import { fetchErinnerung, type Erinnerungsdokument } from './api';

/**
 * Die Zahlungserinnerung als Blatt (ABR-003d, `IDEA-PRX-012`).
 *
 * **Ohne Stufe, ohne Gebühr, ohne Zinsen.** Das Blatt heißt
 * „Zahlungserinnerung" und nicht „1. Mahnung": Eine Stufe ist eine
 * Rechtsfolge mit eigenen Voraussetzungen, und die entscheidet ABR-005 nach
 * Praxiserfahrung — nicht dieses Dokument.
 *
 * Alle Zahlen stehen fest: Der offene Betrag ist der vom Tag der Ausstellung
 * (ANN-080), Absender und Empfänger kommen aus dem Snapshot der Rechnung
 * (ADR-009 Punkt 10). Ein Beleg, dessen Zahlen sich beim nächsten Aufruf
 * ändern, wäre keiner — deshalb liest diese Seite nichts nach.
 */
export function ReminderPrintPage() {
  const { reminderId = '' } = useParams();

  const erinnerung = useQuery({
    queryKey: ['zahlungserinnerung', reminderId],
    queryFn: () => fetchErinnerung(reminderId),
    retry: false,
  });

  if (erinnerung.isPending) return <LoadingState label="Zahlungserinnerung wird geladen …" />;

  if (erinnerung.isError || !erinnerung.data) {
    return (
      <ErrorState
        title="Die Zahlungserinnerung konnte nicht geladen werden."
        description="Bitte später erneut versuchen. Sind Sie noch angemeldet?"
      />
    );
  }

  return <Erinnerungsblatt erinnerung={erinnerung.data} />;
}

function Erinnerungsblatt({ erinnerung }: { erinnerung: Erinnerungsdokument }) {
  const dokument = erinnerung.document;
  const absender = dokument.issuer;
  const empfaenger = dokument.recipient;

  return (
    <>
      <div className="nicht-drucken">
        <Link
          to={`/abrechnung/rechnungen/${erinnerung.invoice_id}`}
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
              <dt className="text-ink-muted w-40">Rechnungsnummer</dt>
              <dd className="text-ink font-medium tabular-nums">{erinnerung.invoice_number}</dd>
            </div>
            <div className="mt-1 flex gap-3">
              <dt className="text-ink-muted w-40">Rechnungsdatum</dt>
              <dd className="tabular-nums">{formatDate(erinnerung.issued_on)}</dd>
            </div>
            <div className="mt-1 flex gap-3">
              <dt className="text-ink-muted w-40">Datum</dt>
              <dd className="tabular-nums">{formatDate(erinnerung.reminder_on)}</dd>
            </div>
            <div className="mt-1 flex gap-3">
              <dt className="text-ink-muted w-40">Behandelte Person</dt>
              <dd>{dokument.patient.name}</dd>
            </div>
          </dl>
        </div>

        <h1 className="mt-10 text-lg font-semibold">Zahlungserinnerung</h1>

        <p className="mt-3 leading-relaxed">
          Unsere Rechnung {erinnerung.invoice_number} vom {formatDate(erinnerung.issued_on)} war am{' '}
          {formatDate(erinnerung.invoice_due_on)} fällig. Nach unseren Unterlagen ist davon ein
          Betrag von {formatEuro(erinnerung.outstanding_cents, erinnerung.currency)} offen.
        </p>

        <p className="mt-3 leading-relaxed">
          Bitte gleichen Sie den offenen Betrag bis zum {formatDate(erinnerung.due_on)} aus. Hat
          sich Ihre Zahlung mit diesem Schreiben gekreuzt, betrachten Sie es bitte als
          gegenstandslos.
        </p>

        <div className="border-line mt-6 flex justify-between border-t pt-3">
          <span className="font-semibold">Offener Betrag</span>
          <span className="font-semibold tabular-nums">
            {formatEuro(erinnerung.outstanding_cents, erinnerung.currency)}
          </span>
        </div>

        <section className="mt-6">
          <h2 className="text-sm font-semibold">Zahlung</h2>
          <p className="text-ink-muted mt-1 text-sm">
            {absender.account_holder ?? absender.legal_name} · IBAN {absender.iban}
            {absender.bic ? ` · BIC ${absender.bic}` : ''}
            {absender.bank_name ? ` · ${absender.bank_name}` : ''}
          </p>
          <p className="text-ink-muted mt-1 text-sm">
            Bitte geben Sie als Verwendungszweck die Rechnungsnummer {erinnerung.invoice_number} an.
          </p>
        </section>
      </article>

      <div className="nicht-drucken mt-10 flex max-w-[210mm] flex-col gap-3">
        <div>
          <Button type="button" onClick={() => window.print()}>
            Zahlungserinnerung drucken
          </Button>
        </div>
        <p className="text-ink-subtle max-w-prose text-xs leading-relaxed">
          Keine Mahnung, keine Stufe, keine Gebühr: Dieses Blatt erinnert an eine fällige Rechnung.
          Der Betrag darauf ist der vom Tag der Ausstellung und ändert sich nicht mehr — eine
          spätere Zahlung steht an der Rechnung.
        </p>
      </div>
    </>
  );
}
