import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge, type Ton } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { formatDate } from '@/lib/datum';
import { formatEuro } from '@/lib/geld';
import { canManageInvoicing, type CurrentUser } from '@/features/session/types';
import {
  createEntwurf,
  empfaengerartLabels,
  fetchKandidaten,
  fetchOffenePosten,
  fetchRechnungen,
  zahlungsstandLabels,
  type Kandidat,
  type OffenerPosten,
  type Rechnung,
} from './api';
import { Zahlungsformular } from './Zahlungsformular';

/**
 * Rechnungen (ABR-003).
 *
 * Die Seite hat zwei Hälften, weil es zwei Fragen sind: **Was ist
 * abzurechnen** und **was ist abgerechnet**.
 *
 * Oben stehen die erfassten Leistungen, die auf keiner Rechnung stehen —
 * gebündelt nach Person und Kalendermonat. Ein Entwurf nimmt immer alle
 * offenen Leistungen dieses Monats auf; eine Auswahl einzelner Zeilen wäre
 * die Gelegenheit, eine Leistung zu übersehen, und genau das schließt
 * ADR-009 Punkt 4 aus.
 *
 * Unten stehen die Rechnungen. Ein Entwurf trägt keine Nummer und lässt sich
 * folgenlos verwerfen; eine ausgestellte Rechnung ist unveränderlich, und
 * ihre Korrektur läuft über Storno und Neuausstellung — die baut
 * ABR-EPIC-002b.
 *
 * **Seit ABR-004 stehen die offenen Posten ganz oben**, vor allem anderen und
 * ohne einen einzigen Tap (`OPTIMIERUNG.md`: „Offene Posten sehen: 0 Taps auf
 * der Einstiegsseite"). Gebucht wird an derselben Zeile — die Rechnung, um
 * die es geht, steht dabei im Blick.
 */

const standTon: Record<Rechnung['status'], Ton> = {
  draft: 'neutral',
  issued: 'warnung',
};

const standLabels: Record<Rechnung['status'], string> = {
  draft: 'Entwurf',
  issued: 'Ausgestellt',
};

/**
 * Der Zahlungsstand als Farbe.
 *
 * „Bezahlt" ist der ruhige Fall und bekommt deshalb keinen auffälligen Ton;
 * die Überzahlung schon — sie verlangt eine Entscheidung (zurückzahlen oder
 * stehen lassen) und darf nicht wie ein erledigter Vorgang aussehen.
 */
const zahlungsTon: Record<Rechnung['payment_state'], Ton> = {
  unpaid: 'neutral',
  partially_paid: 'warnung',
  paid: 'positiv',
  overpaid: 'warnung',
};

/** „2026-08-01" als „August 2026". */
function monatsname(iso: string): string {
  const [jahr, monat] = iso.split('-');
  const namen = [
    'Januar',
    'Februar',
    'März',
    'April',
    'Mai',
    'Juni',
    'Juli',
    'August',
    'September',
    'Oktober',
    'November',
    'Dezember',
  ];
  const index = Number(monat) - 1;
  return namen[index] === undefined ? iso : `${namen[index]} ${jahr}`;
}

export function InvoicesPage({ user }: { user: CurrentUser }) {
  const darfAusstellen = canManageInvoicing(user.roles);

  const posten = useQuery({
    queryKey: ['offene-posten'],
    queryFn: fetchOffenePosten,
    retry: false,
  });

  const kandidaten = useQuery({
    queryKey: ['rechnungs-kandidaten'],
    queryFn: fetchKandidaten,
    retry: false,
  });

  const rechnungen = useQuery({
    queryKey: ['rechnungen'],
    queryFn: fetchRechnungen,
    retry: false,
  });

  return (
    <>
      <PageHeader
        title="Rechnungen"
        description="Privatrechnungen aus erfassten Leistungen, je Person und Monat."
      />

      <Section
        titel="Offene Posten"
        hinweis={
          // Die Summe kommt vom Server und steht an jeder Zeile: Sie gilt für
          // alle offenen Posten, auch wenn die Liste gekürzt ist. Hier wird
          // deshalb nichts aufaddiert.
          posten.data && posten.data.length > 0
            ? `${posten.data.length === 1 ? 'Eine Rechnung' : `${posten.data.length} Rechnungen`} · ${formatEuro(
                posten.data[0]!.open_total_cents,
                posten.data[0]!.currency,
              )} offen`
            : 'Ausgestellte Rechnungen, auf die noch Geld fehlt.'
        }
      >
        {posten.isPending ? <LoadingState label="Offene Posten werden geladen …" /> : null}
        {posten.isError ? (
          <ErrorState
            title="Die offenen Posten konnten nicht geladen werden."
            description="Bitte später erneut versuchen."
          />
        ) : null}
        {posten.data && posten.data.length === 0 ? (
          <EmptyState title="Nichts offen" description="Jede ausgestellte Rechnung ist bezahlt." />
        ) : null}

        <ul className="flex flex-col gap-3">
          {(posten.data ?? []).map((eintrag) => (
            <li key={eintrag.id}>
              <PostenKarte
                posten={eintrag}
                darfBuchen={darfAusstellen}
                zeitzone={user.organizationTimeZone}
              />
            </li>
          ))}
        </ul>
      </Section>

      <Section
        titel="Abzurechnen"
        hinweis="Erfasste Leistungen ohne Rechnung, gebündelt nach Person und Kalendermonat. Ein Entwurf nimmt alle Leistungen des Monats auf."
      >
        {kandidaten.isPending ? <LoadingState label="Leistungen werden geladen …" /> : null}
        {kandidaten.isError ? (
          <ErrorState
            title="Die abzurechnenden Leistungen konnten nicht geladen werden."
            description="Bitte später erneut versuchen. Sind Sie noch angemeldet?"
          />
        ) : null}
        {kandidaten.data && kandidaten.data.length === 0 ? (
          <EmptyState
            title="Nichts abzurechnen"
            description="Jede erfasste Leistung steht auf einer Rechnung."
          />
        ) : null}

        <ul className="flex flex-col gap-3">
          {(kandidaten.data ?? []).map((kandidat) => (
            <li key={`${kandidat.patient_id}-${kandidat.period_month}`}>
              <KandidatenKarte kandidat={kandidat} darfAusstellen={darfAusstellen} />
            </li>
          ))}
        </ul>
      </Section>

      <Section titel="Rechnungen" rahmen>
        {rechnungen.isPending ? <LoadingState label="Rechnungen werden geladen …" /> : null}
        {rechnungen.isError ? (
          <ErrorState
            title="Die Rechnungen konnten nicht geladen werden."
            description="Bitte später erneut versuchen."
          />
        ) : null}
        {rechnungen.data && rechnungen.data.length === 0 ? (
          <EmptyState title="Noch keine Rechnung" />
        ) : null}

        <ul className="divide-line divide-y">
          {(rechnungen.data ?? []).map((rechnung) => (
            <li key={rechnung.id} className="py-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-ink text-[0.9375rem] font-medium">
                  {rechnung.invoice_number ?? 'Ohne Nummer'}
                </span>
                <Badge ton={standTon[rechnung.status]}>{standLabels[rechnung.status]}</Badge>
                <span className="text-ink-muted text-sm">
                  {monatsname(rechnung.period_month)} · {rechnung.patient_name}
                </span>
                <span className="text-ink ml-auto text-[0.9375rem] font-medium tabular-nums">
                  {formatEuro(rechnung.total_cents, rechnung.currency)}
                </span>
              </div>

              <p className="text-ink-muted mt-1 text-sm">
                An {rechnung.recipient_name}
                {rechnung.recipient_kind === 'self'
                  ? ''
                  : ` (${empfaengerartLabels[rechnung.recipient_kind] ?? 'Kostenträger'})`}
                {rechnung.issued_on ? ` · ausgestellt am ${formatDate(rechnung.issued_on)}` : null}
                {rechnung.due_on ? ` · zahlbar bis ${formatDate(rechnung.due_on)}` : null}
              </p>

              {rechnung.status === 'issued' ? (
                <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                  <Badge ton={zahlungsTon[rechnung.payment_state]}>
                    {zahlungsstandLabels[rechnung.payment_state]}
                  </Badge>
                  {rechnung.overdue ? <Badge ton="kritisch">Überfällig</Badge> : null}
                  <span className="text-ink-muted tabular-nums">
                    {formatEuro(rechnung.paid_cents, rechnung.currency)} bezahlt
                    {rechnung.outstanding_cents > 0
                      ? ` · ${formatEuro(rechnung.outstanding_cents, rechnung.currency)} offen`
                      : ''}
                    {rechnung.outstanding_cents < 0
                      ? ` · ${formatEuro(-rechnung.outstanding_cents, rechnung.currency)} zu viel`
                      : ''}
                  </span>
                </p>
              ) : null}

              <div className="mt-2">
                <ButtonLink to={`/abrechnung/rechnungen/${rechnung.id}`} variant="secondary">
                  {rechnung.status === 'draft' ? 'Entwurf öffnen' : 'Rechnung ansehen'}
                </ButtonLink>
              </div>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}

/**
 * Ein offener Posten mit dem Weg, ihn zu schließen.
 *
 * Das Formular klappt an der Zeile auf, nicht auf einer eigenen Seite: Damit
 * ist die Buchung drei Taps entfernt — aufklappen, Betrag stehen lassen oder
 * ändern, buchen — und die Rechnung, um die es geht, bleibt dabei im Blick
 * (`OPTIMIERUNG.md`, „Zahlung buchen: ≤ 3 Taps, Teilzahlung ohne Sonderweg").
 */
function PostenKarte({
  posten,
  darfBuchen,
  zeitzone,
}: {
  posten: OffenerPosten;
  darfBuchen: boolean;
  zeitzone: string | null;
}) {
  const [offen, setOffen] = useState(false);

  return (
    <div className="border-line rounded-card border p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-ink text-[0.9375rem] font-medium">{posten.invoice_number}</span>
        {posten.overdue ? <Badge ton="kritisch">Überfällig</Badge> : null}
        <span className="text-ink-muted text-sm">{posten.recipient_name}</span>
        <span className="text-ink ml-auto text-[0.9375rem] font-medium tabular-nums">
          {formatEuro(posten.outstanding_cents, posten.currency)}
        </span>
      </div>

      <p className="text-ink-muted mt-1 text-sm">
        {monatsname(posten.period_month)} · zahlbar bis {formatDate(posten.due_on)}
        {posten.paid_cents > 0
          ? ` · ${formatEuro(posten.paid_cents, posten.currency)} von ${formatEuro(
              posten.total_cents,
              posten.currency,
            )} bezahlt`
          : ''}
      </p>

      <div className="mt-2 flex flex-wrap gap-2">
        <ButtonLink to={`/abrechnung/rechnungen/${posten.id}`} variant="secondary">
          Rechnung ansehen
        </ButtonLink>
        {darfBuchen && zeitzone !== null ? (
          <Button type="button" variant="secondary" onClick={() => setOffen((wert) => !wert)}>
            {offen ? 'Abbrechen' : 'Zahlung buchen'}
          </Button>
        ) : null}
      </div>

      {offen && zeitzone !== null ? (
        <Zahlungsformular
          invoiceId={posten.id}
          offenCent={posten.outstanding_cents}
          waehrung={posten.currency}
          zeitzone={zeitzone}
          onFertig={() => setOffen(false)}
        />
      ) : null}
    </div>
  );
}

function KandidatenKarte({
  kandidat,
  darfAusstellen,
}: {
  kandidat: Kandidat;
  darfAusstellen: boolean;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const anlegen = useMutation({
    mutationFn: () => createEntwurf(kandidat.patient_id, kandidat.period_month),
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: ['rechnungs-kandidaten'] });
      await queryClient.invalidateQueries({ queryKey: ['rechnungen'] });
      await navigate(`/abrechnung/rechnungen/${id}`);
    },
  });

  return (
    <div className="border-line rounded-card border p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-ink text-[0.9375rem] font-medium">{kandidat.patient_name}</span>
        <span className="text-ink-muted text-sm">{monatsname(kandidat.period_month)}</span>
        <span className="text-ink-muted text-sm tabular-nums">
          {kandidat.service_count} {kandidat.service_count === 1 ? 'Leistung' : 'Leistungen'} ·{' '}
          {formatEuro(kandidat.total_cents, kandidat.currency)}
        </span>
        {darfAusstellen && !kandidat.has_draft ? (
          <span className="ml-auto">
            <Button type="button" onClick={() => anlegen.mutate()} disabled={anlegen.isPending}>
              {anlegen.isPending ? 'Wird angelegt …' : 'Entwurf anlegen'}
            </Button>
          </span>
        ) : null}
      </div>

      {kandidat.has_draft ? (
        <Statusmeldung className="mt-2">
          Für diesen Monat steht bereits ein Entwurf. Diese Leistungen sind später erfasst worden;
          sie kommen auf eine zweite Rechnung, sobald der Entwurf ausgestellt oder verworfen ist.
        </Statusmeldung>
      ) : null}

      {anlegen.isError ? (
        <Statusmeldung ton="fehler" className="mt-2">
          {anlegen.error.message}
        </Statusmeldung>
      ) : null}
    </div>
  );
}
