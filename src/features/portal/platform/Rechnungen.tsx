import { useQuery } from '@tanstack/react-query';
import { useLocation, useSearchParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { Kopierzeile } from '@/components/ui/Kopierzeile';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { formatDate } from '@/lib/datum';
import { formatEuro } from '@/lib/geld';
import {
  rechnungSchluessel,
  rechnungenSchluessel,
  ladeRechnung,
  ladeRechnungen,
  type Plattformzugang,
  type Rechnungsblatt,
  type Rechnungszeile,
} from './api';
import { useRechner } from './geruestbreite';
import { PLATTFORM_PFAD, bereichParameter } from './pfade';
import {
  anJemandAnderen,
  grundlageZeile,
  positionen,
  ueberfaellig,
  zahlungsstand,
} from './zahlungsstand';
import { kalendertag } from './zeit';

/**
 * Die eigenen Rechnungen des Bereichs, sobald gestellt, auch an jemand anderen (ADR-023 Punkt 16);
 * eine Begleitung ohne Einwilligung bekommt vom Server nichts.
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
      <Rueckweg standard={`${PLATTFORM_PFAD}/ich`} beschriftung="Ich" />
      <PageHeader title="Rechnungen" />
      <Abfragezustand
        abfrage={rechnungen}
        laden="Ihre Rechnungen werden geladen …"
        fehler="Ihre Rechnungen konnten nicht geladen werden."
        inKarte
        leer={{
          wenn: (liste) => liste.length === 0,
          ...(zugang.access_kind === 'companion'
            ? {
                titel: 'Keine Rechnungen',
                beschreibung:
                  'Rechnungen sehen Sie hier nur, wenn die Person Ihnen das erlaubt hat.',
              }
            : {
                titel: 'Noch keine Rechnung',
                beschreibung: 'Stellt Ihnen die Praxis eine Rechnung, finden Sie sie hier.',
              }),
          markenform: true,
        }}
      >
        {(liste) => <Rechnungsliste liste={liste} bereich={bereich} />}
      </Abfragezustand>
    </>
  );
}

function Rechnungsliste({
  liste,
  bereich,
  offenId,
}: {
  liste: readonly Rechnungszeile[];
  bereich: string | null;
  offenId?: string;
}) {
  return (
    <ListRows beschriftung="Ihre Rechnungen">
      {liste.map((r) => {
        const stand = zahlungsstand(r);
        const andere = anJemandAnderen(r);
        const zweite = [
          andere ? `an ${andere}` : null,
          r.cancelled
            ? r.cancelled_on
              ? `storniert am ${formatDate(r.cancelled_on)}`
              : null
            : r.outstanding_cents > 0
              ? `fällig am ${formatDate(r.due_on)}`
              : null,
          r.outstanding_cents > 0 && !r.cancelled && r.paid_cents > 0
            ? `noch offen ${formatEuro(r.outstanding_cents, r.currency)}`
            : null,
        ].filter(Boolean);
        return (
          <ListRow
            key={r.id}
            to={`${PLATTFORM_PFAD}/rechnungen/${r.id}${bereich ? `?${bereich}` : ''}`}
            titel={`Rechnung vom ${formatDate(r.issued_on)}`}
            meta={
              <>
                <span className="block">Nr. {r.invoice_number}</span>
                {zweite.length > 0 ? <span className="block">{zweite.join(' · ')}</span> : null}
              </>
            }
            betrag={formatEuro(r.total_cents, r.currency)}
            status={
              <Badge ton={stand.ton} eigenesZeichen={stand.zeichen}>
                {stand.wort}
              </Badge>
            }
            gedaempft={r.cancelled}
            aktiv={r.id === offenId}
          />
        );
      })}
    </ListRows>
  );
}

/**
 * Eine Rechnung als Blatt aus dem Snapshot der Praxis (ADR-009 Punkt 10); Aufbau nach ANN-855.
 * Gedruckt wird über den Browser, wie in der Praxis.
 */
export function Rechnung({ zugang }: { zugang: Plattformzugang }) {
  const { pathname } = useLocation();
  const rechnungId = pathname.slice(pathname.lastIndexOf('/') + 1);
  const [suche] = useSearchParams();
  const bereich = bereichParameter(suche);
  const rechner = useRechner();
  const zurueck = `${PLATTFORM_PFAD}/rechnungen${bereich ? `?${bereich}` : ''}`;
  const rechnung = useQuery({
    queryKey: rechnungSchluessel(zugang.access_id, rechnungId),
    queryFn: () => ladeRechnung(zugang.access_id, rechnungId),
  });
  // Dieselbe Liste wie auf der Seite davor (meist schon geladen): Sie trägt
  // „überfällig“ vom Server und steht am Rechner links.
  const liste = useQuery({
    queryKey: rechnungenSchluessel(zugang.access_id),
    queryFn: () => ladeRechnungen(zugang.access_id),
  });
  const zeile = liste.data?.find((r) => r.id === rechnungId);

  const blatt = (
    <>
      {/* Solange das Blatt mit seinem Titel fehlt, trägt die Seite einen
          eigenen (DR-158). */}
      {rechnung.data ? null : <PageHeader title="Rechnung" />}
      {rechnung.isPending ? (
        <LoadingState label="Die Rechnung wird geladen …" />
      ) : rechnung.data === undefined ? (
        <ErrorState
          title="Die Rechnung konnte nicht geladen werden."
          onErneut={() => rechnung.refetch()}
        />
      ) : rechnung.data === null ? (
        <EmptyState
          markenform
          title="Diese Rechnung gibt es hier nicht."
          description="Ihre Rechnungen finden Sie in der Liste."
        />
      ) : (
        <Blatt rechnung={rechnung.data} ueberfaelligLaut={zeile?.overdue} />
      )}
    </>
  );

  if (!rechner || !liste.data || liste.data.length === 0) {
    return (
      <>
        <Rueckweg standard={zurueck} beschriftung="Zu den Rechnungen" className="nicht-drucken" />
        {blatt}
      </>
    );
  }
  return (
    // Im Baum zuerst das Blatt mit seiner h1, die Liste steht nur sichtbar links (wie ANN-852).
    <div className="grid grid-cols-[minmax(0,22rem)_minmax(0,1fr)] gap-12 print:block">
      <div className="max-w-spalte col-start-2 row-start-1 min-w-0">{blatt}</div>
      <nav aria-label="Ihre Rechnungen" className="nicht-drucken col-start-1 row-start-1">
        <Rechnungsliste liste={liste.data} bereich={bereich} offenId={rechnungId} />
      </nav>
    </div>
  );
}

function Blatt({
  rechnung: r,
  ueberfaelligLaut,
}: {
  rechnung: Rechnungsblatt;
  /** Aus der Liste des Servers; fehlt sie, zählt der Kalendertag. */
  ueberfaelligLaut: boolean | undefined;
}) {
  const d = r.document;
  const storniert = r.cancellation !== null;
  const zuSpaet =
    ueberfaelligLaut ??
    ueberfaellig(
      { due_on: r.due_on, outstanding_cents: r.outstanding_cents, cancelled: storniert },
      kalendertag(new Date()),
    );
  const stand = zahlungsstand({ ...r, overdue: zuSpaet, cancelled: storniert });
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
  const andere = anJemandAnderen({
    recipient_kind: d.recipient.kind,
    recipient_name: d.recipient.name,
  });
  const gruppen = positionen(d.items);
  const zeitraum = d.service_period
    ? d.service_period.from === d.service_period.to
      ? formatDate(d.service_period.from)
      : `${formatDate(d.service_period.from)} bis ${formatDate(d.service_period.to)}`
    : null;
  const offen = !storniert && r.outstanding_cents > 0;
  const teilweise = offen && r.paid_cents > 0;

  return (
    <article className="text-ink mx-auto max-w-[210mm] wrap-anywhere">
      <PageHeader title={`Rechnung ${r.invoice_number}`} />

      {/* Der Betrag zuerst: groß, mit Zustand und Fälligkeit. */}
      <section aria-label="Betrag" className="flex flex-col items-start gap-2">
        <Badge ton={stand.ton} eigenesZeichen={stand.zeichen}>
          {stand.wort}
        </Badge>
        <p
          className={`text-gruss [[data-rechner]_&]:text-gruss-rechner tabular-nums ${
            storniert ? 'text-ink-muted line-through' : 'text-ink'
          }`}
        >
          {formatEuro(teilweise ? r.outstanding_cents : d.totals.total_cents, d.currency)}
        </p>
        <p className="text-ink text-base">
          {storniert
            ? `Storniert am ${formatDate(r.cancellation!.cancelled_on)}`
            : teilweise
              ? `Noch offen von ${formatEuro(d.totals.total_cents, d.currency)}, fällig am ${formatDate(r.due_on)}`
              : offen
                ? `Fällig am ${formatDate(r.due_on)}`
                : `Rechnung vom ${formatDate(r.issued_on)}`}
          {andere ? <span className="text-ink-muted block">an {andere}</span> : null}
        </p>
      </section>

      {r.cancellation ? (
        <Statusmeldung ton="neutral" className="mt-4">
          {r.correction_invoice_number
            ? `Ersetzt durch die Rechnung ${r.correction_invoice_number}. `
            : ''}
          Diese Rechnung ist gegenstandslos.
        </Statusmeldung>
      ) : null}
      {r.replaces_invoice_number ? (
        <p className="text-ink-muted mt-3 text-base">
          Korrekturrechnung zur stornierten Rechnung {r.replaces_invoice_number}.
        </p>
      ) : null}

      {d.issuer.iban && offen ? (
        <Section titel="So bezahlen Sie" rahmen>
          <p className="text-ink text-base">
            Bitte überweisen Sie bis zum {formatDate(r.due_on)}
            {d.issuer.account_holder
              ? ` an ${d.issuer.account_holder}`
              : ` an ${d.issuer.legal_name}`}
            {d.issuer.bank_name ? ` bei der ${d.issuer.bank_name}` : ''}.
          </p>
          <div className="mt-4">
            <Kopierzeile
              etikett="IBAN"
              wert={d.issuer.iban}
              anzeige={d.issuer.iban.replace(/(.{4})/g, '$1 ').trim()}
            />
            <Kopierzeile etikett="Verwendungszweck" wert={r.invoice_number} />
            <Kopierzeile
              etikett="Betrag"
              wert={formatEuro(r.outstanding_cents, d.currency).replace(/\s?€$/, '')}
              anzeige={formatEuro(r.outstanding_cents, d.currency)}
            />
          </div>
          {d.issuer.bic ? (
            <p className="text-ink-muted mt-1 text-sm tabular-nums">BIC {d.issuer.bic}</p>
          ) : null}
          {r.paid_cents > 0 ? (
            <p className="text-ink-muted mt-1 text-sm">
              Bereits eingegangen: {formatEuro(r.paid_cents, d.currency)}.
            </p>
          ) : null}
        </Section>
      ) : null}

      <Section titel="Positionen" rahmen>
        <ul aria-label="Positionen der Rechnung">
          {gruppen.map((g) => (
            <li
              key={`${g.code}-${g.unit_price_cents}-${g.zeitraeume.length}-${g.tage.join()}`}
              className="border-line border-t py-3 first:border-t-0 first:pt-0"
            >
              <p className="text-ink text-base font-semibold">
                {g.label}
                {g.item_kind === 'absence_fee' ? ' · Ausfallhonorar' : ''}
              </p>
              <p className="text-ink-muted text-sm tabular-nums">
                {/* Ein Abo-Monat nennt seinen Zeitraum. */}
                {g.zeitraeume.length > 0
                  ? `Zeitraum: ${g.zeitraeume
                      .map((z) => `${formatDate(z.von)} bis ${formatDate(z.bis)}`)
                      .join(', ')}`
                  : `${g.tage.length === 1 ? 'Tag' : 'Tage'}: ${g.tage
                      .map((tag) => formatDate(tag))
                      .join(', ')}`}
              </p>
              {/* Menge links, Betrag rechts in einer Zeile. */}
              <p className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 tabular-nums">
                <span className="text-ink-muted text-base">
                  <span className="sr-only">Menge × Einzelpreis: </span>
                  {g.menge} × {formatEuro(g.unit_price_cents, g.currency)}
                </span>
                <span className="text-ink text-liste ml-auto font-semibold">
                  <span className="sr-only">Betrag: </span>
                  {formatEuro(g.summe_cents, g.currency)}
                </span>
              </p>
            </li>
          ))}
        </ul>
        <p className="border-line mt-1 flex items-baseline justify-between gap-3 border-t pt-3 font-semibold">
          <span>Gesamtbetrag</span>
          <span className="text-liste tabular-nums">
            {formatEuro(d.totals.total_cents, d.currency)}
          </span>
        </p>
      </Section>

      {(d.tax_groups ?? [])
        .filter((g) => g.exemption_reason)
        .map((g) => (
          <Kleingedrucktes key={g.tax_treatment} className="mt-3">
            {g.exemption_reason}
          </Kleingedrucktes>
        ))}

      <Section titel="Angaben auf der Rechnung">
        <DetailList>
          <DetailRow label="Von">{absender.join(', ')}</DetailRow>
          <DetailRow label="An">{adressat.join(', ')}</DetailRow>
          <DetailRow label="Rechnungsdatum">{formatDate(r.issued_on)}</DetailRow>
          <DetailRow label="Leistungen">{zeitraum ?? 'siehe Positionen'}</DetailRow>
          {d.patient.date_of_birth ? (
            <DetailRow label="Geburtsdatum">{formatDate(d.patient.date_of_birth)}</DetailRow>
          ) : null}
        </DetailList>
      </Section>

      {d.treatment_bases && d.treatment_bases.length > 0 ? (
        <Section titel="Behandlungsgrundlage">
          <ul className="text-ink text-base">
            {d.treatment_bases.map((basis, i) => {
              const z = grundlageZeile(basis);
              return (
                <li key={`${basis.issued_on}-${i}`}>
                  {z.kopf}
                  {z.diagnose ? (
                    <span className="text-ink-muted block text-sm">{z.diagnose}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}

      {d.issuer.iban && !offen ? (
        <Kleingedrucktes className="mt-8 tabular-nums">
          Bankverbindung: IBAN {d.issuer.iban.replace(/(.{4})/g, '$1 ').trim()}
          {d.issuer.bic ? ` · BIC ${d.issuer.bic}` : ''}
          {r.paid_cents > 0 && !storniert
            ? ` · Eingegangen: ${formatEuro(r.paid_cents, d.currency)}`
            : ''}
        </Kleingedrucktes>
      ) : null}

      <div className="nicht-drucken mt-8">
        <Button type="button" variant="secondary" onClick={() => window.print()}>
          Drucken oder als PDF sichern
        </Button>
      </div>
    </article>
  );
}
