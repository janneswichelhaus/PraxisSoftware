import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { formatDate } from '@/lib/datum';
import { formatEuro } from '@/lib/geld';
import {
  ladeRechnung,
  ladeRechnungen,
  rechnungSchluessel,
  rechnungenSchluessel,
  type Plattformzugang,
  type Rechnungsblatt,
} from './api';
import { PLATTFORM_PFAD, bereichParameter } from './pfade';
import { anJemandAnderen, grundlageZeile, positionen, zahlungsstand } from './zahlungsstand';

/**
 * „Ich → Rechnungen" (POR-013, DSN-001 D3): die eigenen Rechnungen des
 * Bereichs, sobald sie gestellt sind - auch wenn sie an jemand anderen
 * adressiert sind (ADR-023 Punkt 16). Der Zahlungsstand steht als Wort mit
 * Zeichen; eine Begleitung ohne Einwilligung bekommt vom Server nichts.
 */
export function Rechnungen({ zugang }: { zugang: Plattformzugang }) {
  const [suche] = useSearchParams();
  const bereich = bereichParameter(suche);
  const rechnungen = useQuery({
    queryKey: rechnungenSchluessel(zugang.access_id),
    queryFn: () => ladeRechnungen(zugang.access_id),
  });
  return (
    <>
      <Link
        to={`${PLATTFORM_PFAD}/ich`}
        className="text-ink-muted hover:text-ink mb-4 inline-flex min-h-11 items-center text-sm"
      >
        ← Zu „Ich“
      </Link>
      <h1 className="text-accent text-h3 font-bold">Rechnungen</h1>
      {rechnungen.isPending ? (
        <LoadingState label="Ihre Rechnungen werden geladen …" />
      ) : rechnungen.data === undefined ? (
        <ErrorState
          title="Ihre Rechnungen konnten nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => rechnungen.refetch()}
        />
      ) : rechnungen.data.length === 0 ? (
        <p className="text-ink mt-4 max-w-prose text-base leading-relaxed">
          {zugang.access_kind === 'companion'
            ? 'Rechnungen sehen Sie hier nur, wenn die Person Ihnen das erlaubt hat.'
            : 'Es liegt noch keine Rechnung vor.'}
        </p>
      ) : (
        <Section titel="Ihre Rechnungen">
          <ListRows>
            {rechnungen.data.map((r) => {
              const stand = zahlungsstand(r);
              const andere = anJemandAnderen(r);
              return (
                <ListRow
                  key={r.id}
                  to={`${PLATTFORM_PFAD}/rechnungen/${r.id}${bereich ? `?${bereich}` : ''}`}
                  zeit={formatDate(r.issued_on)}
                  titel={`Rechnung ${r.invoice_number} · ${formatEuro(r.total_cents, r.currency)}`}
                  meta={
                    [
                      andere ? `an ${andere}` : null,
                      r.cancelled ? null : `fällig am ${formatDate(r.due_on)}`,
                      r.outstanding_cents > 0 && !r.cancelled && r.paid_cents > 0
                        ? `noch offen ${formatEuro(r.outstanding_cents, r.currency)}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || undefined
                  }
                  status={<Badge ton={stand.ton}>{stand.wort}</Badge>}
                  gedaempft={r.cancelled}
                />
              );
            })}
          </ListRows>
        </Section>
      )}
    </>
  );
}

/**
 * Eine Rechnung als Blatt - der Snapshot der Praxis (ADR-009 Punkt 10):
 * Absender, Adressat, Positionen mit Behandlungstagen, Gesamtbetrag,
 * Bankverbindung. Drucken über den Browser, wie in der Praxis.
 */
export function Rechnung({ zugang }: { zugang: Plattformzugang }) {
  const { pathname } = useLocation();
  const rechnungId = pathname.slice(pathname.lastIndexOf('/') + 1);
  const [suche] = useSearchParams();
  const bereich = bereichParameter(suche);
  const zurueck = `${PLATTFORM_PFAD}/rechnungen${bereich ? `?${bereich}` : ''}`;
  const rechnung = useQuery({
    queryKey: rechnungSchluessel(zugang.access_id, rechnungId),
    queryFn: () => ladeRechnung(zugang.access_id, rechnungId),
  });
  return (
    <>
      <Link
        to={zurueck}
        className="nicht-drucken text-ink-muted hover:text-ink mb-4 inline-flex min-h-11 items-center text-sm"
      >
        ← Zu den Rechnungen
      </Link>
      {rechnung.isPending ? (
        <LoadingState label="Die Rechnung wird geladen …" />
      ) : rechnung.data === undefined ? (
        <ErrorState
          title="Die Rechnung konnte nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => rechnung.refetch()}
        />
      ) : rechnung.data === null ? (
        <ErrorState
          title="Diese Rechnung wurde nicht gefunden."
          description="Bitte sehen Sie in Ihre Rechnungsliste."
        />
      ) : (
        <Blatt rechnung={rechnung.data} />
      )}
    </>
  );
}

function Blatt({ rechnung: r }: { rechnung: Rechnungsblatt }) {
  const d = r.document;
  const stand = zahlungsstand({ ...r, overdue: false, cancelled: r.cancellation !== null });
  const absender = [
    d.issuer.legal_name,
    [d.issuer.street, d.issuer.house_number].filter(Boolean).join(' '),
    [d.issuer.postal_code, d.issuer.city].filter(Boolean).join(' '),
  ].filter((t) => t && t.length > 0);
  const adressat = [
    d.recipient.name,
    [d.recipient.street, d.recipient.house_number].filter(Boolean).join(' '),
    [d.recipient.postal_code, d.recipient.city].filter(Boolean).join(' '),
  ].filter((t) => t && t.length > 0);
  const gruppen = positionen(d.items);
  const zeitraum = d.service_period
    ? d.service_period.from === d.service_period.to
      ? formatDate(d.service_period.from)
      : `${formatDate(d.service_period.from)} bis ${formatDate(d.service_period.to)}`
    : null;

  return (
    <article className="text-ink mx-auto max-w-[210mm] wrap-anywhere">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-accent text-h3 font-bold">Rechnung {r.invoice_number}</h1>
        <Badge ton={stand.ton}>{stand.wort}</Badge>
      </div>
      {r.cancellation ? (
        <Statusmeldung ton="neutral" className="mt-3">
          Storniert am {formatDate(r.cancellation.cancelled_on)}
          {r.correction_invoice_number
            ? `, ersetzt durch die Rechnung ${r.correction_invoice_number}`
            : ''}
          . Diese Rechnung ist gegenstandslos.
        </Statusmeldung>
      ) : r.outstanding_cents > 0 ? (
        <Statusmeldung ton="neutral" className="mt-3">
          Offen sind {formatEuro(r.outstanding_cents, d.currency)}, fällig am {formatDate(r.due_on)}
          .
        </Statusmeldung>
      ) : null}
      {r.replaces_invoice_number ? (
        <p className="text-ink mt-2 text-sm">
          Korrekturrechnung zur stornierten Rechnung {r.replaces_invoice_number}.
        </p>
      ) : null}

      <dl className="mt-6 grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-ink-muted text-xs font-semibold tracking-wide uppercase">Von</dt>
          <dd className="text-base">{absender.join(', ')}</dd>
        </div>
        <div>
          <dt className="text-ink-muted text-xs font-semibold tracking-wide uppercase">An</dt>
          <dd className="text-base">{adressat.join(', ')}</dd>
        </div>
        <div>
          <dt className="text-ink-muted text-xs font-semibold tracking-wide uppercase">
            Rechnungsdatum
          </dt>
          <dd className="text-base tabular-nums">{formatDate(r.issued_on)}</dd>
        </div>
        <div>
          <dt className="text-ink-muted text-xs font-semibold tracking-wide uppercase">
            Leistungen
          </dt>
          <dd className="text-base">{zeitraum ?? 'siehe Positionen'}</dd>
        </div>
        {d.patient.date_of_birth ? (
          <div>
            <dt className="text-ink-muted text-xs font-semibold tracking-wide uppercase">
              Geburtsdatum
            </dt>
            <dd className="text-base tabular-nums">{formatDate(d.patient.date_of_birth)}</dd>
          </div>
        ) : null}
      </dl>

      <div
        className="mt-6 overflow-x-auto print:overflow-visible"
        tabIndex={0}
        role="region"
        aria-label="Leistungen, waagerecht rollbar"
      >
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-line-strong border-b text-left">
              <th scope="col" className="py-1 pr-3 font-medium">
                Leistung
              </th>
              <th scope="col" className="py-1 pr-3 text-right font-medium">
                Einzelpreis
              </th>
              <th scope="col" className="py-1 pr-3 text-right font-medium">
                Menge
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Betrag
              </th>
            </tr>
          </thead>
          <tbody>
            {gruppen.map((g, i) => (
              <tr
                key={`${g.code}-${g.unit_price_cents}-${i}`}
                className="border-line border-b align-top"
              >
                <td className="py-1 pr-3">
                  {g.label}
                  {g.item_kind === 'absence_fee' ? ' · Ausfallhonorar' : ''}
                  <span className="text-ink-muted block text-xs tabular-nums">
                    {g.tage.length === 1 ? 'Tag' : 'Tage'}:{' '}
                    {g.tage.map((t) => formatDate(t)).join(', ')}
                  </span>
                </td>
                <td className="py-1 pr-3 text-right tabular-nums">
                  {formatEuro(g.unit_price_cents, g.currency)}
                </td>
                <td className="py-1 pr-3 text-right tabular-nums">{g.menge}</td>
                <td className="py-1 text-right tabular-nums">
                  {formatEuro(g.summe_cents, g.currency)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={3} className="py-2 pr-3 text-right font-semibold">
                Gesamtbetrag
              </th>
              <td className="py-2 text-right font-semibold tabular-nums">
                {formatEuro(d.totals.total_cents, d.currency)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {(d.tax_groups ?? [])
        .filter((g) => g.exemption_reason)
        .map((g) => (
          <p key={g.tax_treatment} className="text-ink-muted mt-3 text-xs">
            {g.exemption_reason}
          </p>
        ))}

      {d.treatment_bases && d.treatment_bases.length > 0 ? (
        <Section titel="Behandlungsgrundlage" ebene={2}>
          <ul className="text-ink text-base">
            {d.treatment_bases.map((basis, i) => {
              const zeile = grundlageZeile(basis);
              return (
                <li key={`${basis.issued_on}-${i}`}>
                  {zeile.kopf}
                  {zeile.diagnose ? (
                    <span className="text-ink-muted block text-sm">{zeile.diagnose}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}

      {d.issuer.iban ? (
        <Section titel="Zahlung" ebene={2}>
          <p className="text-ink text-base">
            Bitte überweisen Sie den Betrag bis zum {formatDate(r.due_on)} auf
            {d.issuer.account_holder
              ? ` das Konto von ${d.issuer.account_holder}`
              : ' das Konto der Praxis'}
            {d.issuer.bank_name ? ` bei der ${d.issuer.bank_name}` : ''}.
          </p>
          <p className="text-ink mt-1 text-base tabular-nums">
            IBAN {d.issuer.iban.replace(/(.{4})/g, '$1 ').trim()}
            {d.issuer.bic ? ` · BIC ${d.issuer.bic}` : ''}
          </p>
          {r.paid_cents > 0 && !r.cancellation ? (
            <p className="text-ink-muted mt-1 text-sm">
              Bereits eingegangen: {formatEuro(r.paid_cents, d.currency)}.
            </p>
          ) : null}
        </Section>
      ) : null}

      <div className="nicht-drucken mt-6">
        <Button type="button" variant="secondary" onClick={() => window.print()}>
          Drucken oder als PDF sichern
        </Button>
      </div>
    </article>
  );
}
