import { useQuery } from '@tanstack/react-query';
import { useLocation, useSearchParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Datenliste } from '@/components/ui/Datenliste';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { VERBINDUNG_PRUEFEN } from '@/components/ui/abfrageTexte';
import { formatDate } from '@/lib/datum';
import { formatEuro } from '@/lib/geld';
import {
  rechnungSchluessel,
  rechnungenSchluessel,
  type Plattformzugang,
  type Rechnungsblatt,
} from './api';
import { usePlattformApi } from './einsicht';
import { PLATTFORM_PFAD, bereichParameter } from './pfade';
import { anJemandAnderen, grundlageZeile, positionen, zahlungsstand } from './zahlungsstand';

/**
 * „Ich → Rechnungen" (POR-013, DSN-001 D3): die eigenen Rechnungen des
 * Bereichs, sobald sie gestellt sind - auch wenn sie an jemand anderen
 * adressiert sind (ADR-023 Punkt 16). Der Zahlungsstand steht als Wort mit
 * Zeichen; eine Begleitung ohne Einwilligung bekommt vom Server nichts.
 */
export function Rechnungen({ zugang }: { zugang: Plattformzugang }) {
  const api = usePlattformApi();
  const [suche] = useSearchParams();
  const bereich = bereichParameter(suche);
  const rechnungen = useQuery({
    queryKey: rechnungenSchluessel(zugang.access_id),
    queryFn: () => api.ladeRechnungen(zugang.access_id),
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
          titel:
            zugang.access_kind === 'companion'
              ? 'Rechnungen sehen Sie hier nur, wenn die Person Ihnen das erlaubt hat.'
              : 'Es liegt noch keine Rechnung vor.',
        }}
      >
        {(liste) => (
          <ListRows>
            {liste.map((r) => {
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
        )}
      </Abfragezustand>
    </>
  );
}

/**
 * Eine Rechnung als Blatt - der Snapshot der Praxis (ADR-009 Punkt 10):
 * Absender, Adressat, Positionen mit Behandlungstagen, Gesamtbetrag,
 * Bankverbindung. Drucken über den Browser, wie in der Praxis.
 */
export function Rechnung({ zugang }: { zugang: Plattformzugang }) {
  const api = usePlattformApi();
  const { pathname } = useLocation();
  const rechnungId = pathname.slice(pathname.lastIndexOf('/') + 1);
  const [suche] = useSearchParams();
  const bereich = bereichParameter(suche);
  const zurueck = `${PLATTFORM_PFAD}/rechnungen${bereich ? `?${bereich}` : ''}`;
  const rechnung = useQuery({
    queryKey: rechnungSchluessel(zugang.access_id, rechnungId),
    queryFn: () => api.ladeRechnung(zugang.access_id, rechnungId),
  });
  return (
    <>
      <Rueckweg standard={zurueck} beschriftung="Zu den Rechnungen" className="nicht-drucken" />
      {/* Solange das Blatt mit seinem Titel fehlt, trägt die Seite einen
          eigenen (DR-158). */}
      {rechnung.data ? null : <PageHeader title="Rechnung" />}
      {rechnung.isPending ? (
        <LoadingState label="Die Rechnung wird geladen …" />
      ) : rechnung.data === undefined ? (
        <ErrorState
          title="Die Rechnung konnte nicht geladen werden."
          description={VERBINDUNG_PRUEFEN}
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
      <PageHeader
        title={`Rechnung ${r.invoice_number}`}
        description={<Badge ton={stand.ton}>{stand.wort}</Badge>}
      />
      {r.cancellation ? (
        <Statusmeldung ton="neutral">
          Storniert am {formatDate(r.cancellation.cancelled_on)}
          {r.correction_invoice_number
            ? `, ersetzt durch die Rechnung ${r.correction_invoice_number}`
            : ''}
          . Diese Rechnung ist gegenstandslos.
        </Statusmeldung>
      ) : r.outstanding_cents > 0 ? (
        <Statusmeldung ton="neutral">
          Offen sind {formatEuro(r.outstanding_cents, d.currency)}, fällig am {formatDate(r.due_on)}
          .
        </Statusmeldung>
      ) : null}
      {r.replaces_invoice_number ? (
        <p className="text-ink mt-2 text-sm">
          Korrekturrechnung zur stornierten Rechnung {r.replaces_invoice_number}.
        </p>
      ) : null}

      <DetailList>
        <DetailRow label="Von">{absender.join(', ')}</DetailRow>
        <DetailRow label="An">{adressat.join(', ')}</DetailRow>
        <DetailRow label="Rechnungsdatum">{formatDate(r.issued_on)}</DetailRow>
        <DetailRow label="Leistungen">{zeitraum ?? 'siehe Positionen'}</DetailRow>
        {d.patient.date_of_birth ? (
          <DetailRow label="Geburtsdatum">{formatDate(d.patient.date_of_birth)}</DetailRow>
        ) : null}
      </DetailList>

      {/* Positionen als Datenliste (DESIGN.md, Regel 3): ab 1024 px in
          Spalten, darunter je Position eine Zeile mit dem Betrag rechts - bei
          18 px Schrift ohne waagerechtes Rollen. */}
      <Section titel="Positionen">
        <Datenliste
          beschriftung="Positionen der Rechnung"
          zeilen={gruppen}
          schluessel={(g) =>
            `${g.code}-${g.unit_price_cents}-${g.zeitraeume.length}-${g.tage.join()}`
          }
          spalten={[
            {
              titel: 'Leistung',
              inhalt: (g) => (
                <>
                  <span className="text-ink block font-medium">
                    {g.label}
                    {g.item_kind === 'absence_fee' ? ' · Ausfallhonorar' : ''}
                  </span>
                  <span className="text-ink-muted block text-sm tabular-nums">
                    {/* ANG-002: Ein Abo-Monat nennt seinen Zeitraum. */}
                    {g.zeitraeume.length > 0
                      ? `Zeitraum: ${g.zeitraeume
                          .map((z) => `${formatDate(z.von)} bis ${formatDate(z.bis)}`)
                          .join(', ')}`
                      : `${g.tage.length === 1 ? 'Tag' : 'Tage'}: ${g.tage
                          .map((tag) => formatDate(tag))
                          .join(', ')}`}
                  </span>
                </>
              ),
            },
            {
              titel: 'Menge × Einzelpreis',
              breite: 'max-content',
              rechts: true,
              inhalt: (g) => `${g.menge} × ${formatEuro(g.unit_price_cents, g.currency)}`,
            },
            {
              titel: 'Betrag',
              breite: 'max-content',
              rechts: true,
              telefon: 'ende',
              inhalt: (g) => formatEuro(g.summe_cents, g.currency),
            },
          ]}
        />
        <p className="border-line mt-3 flex items-baseline justify-between gap-3 border-t pt-3 font-semibold">
          <span>Gesamtbetrag</span>
          <span className="tabular-nums">{formatEuro(d.totals.total_cents, d.currency)}</span>
        </p>
      </Section>

      {(d.tax_groups ?? [])
        .filter((g) => g.exemption_reason)
        .map((g) => (
          <Kleingedrucktes key={g.tax_treatment} className="mt-3">
            {g.exemption_reason}
          </Kleingedrucktes>
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

      <div className="nicht-drucken mt-8">
        <Button type="button" variant="secondary" onClick={() => window.print()}>
          Drucken oder als PDF sichern
        </Button>
      </div>
    </article>
  );
}
