import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useSearchParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { EmptyState } from '@/components/ui/Feedback';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { ListRow } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { Rueckweg } from '@/components/ui/Rueckweg';
import type { CurrentUser } from '@/features/session/types';
import { formatEuro } from '@/lib/geld';
import { mitRueckweg } from '@/lib/rueckweg';
import {
  LOAD_ERROR,
  REIMBURSEMENTS_KEY,
  fetchReimbursements,
  reimbursementsKey,
  withdrawReimbursement,
  type Overview,
  type Reimbursement,
} from './api';
import {
  ACCOUNT_PATH,
  PERSON_PARAM,
  REIMBURSEMENTS_HOME,
  REQUEST_PATH,
  dateOf,
  decidePath,
  payPath,
  personPath,
} from './paths';
import { ReceiptRow } from './ReceiptRow';
import { STATUS_LABEL, STATUS_TONE, electricityFormula, reimbursementTitle } from './rules';

/**
 * Erstattungen (ERS-001, Überholung 10).
 *
 * Eine Seite für alle Rollen; was jemand sieht, entscheidet der Server
 * (ANN-598): die eigenen Anträge mit Zustand und das Konto (IBAN maskiert,
 * ANN-601); für owner dazu, was zu entscheiden und was auszuzahlen ist; für
 * owner und Büro die Personen mit Erstattungen - je Person, ohne Summe über
 * alle (§20). Die Zeile einer Person öffnet ihre Erstattungen auf derselben
 * Route (`?person=…`).
 *
 * Beantragen, Entscheiden und Auszahlen sind geführte Abläufe auf eigenen
 * Seiten (G10, G10b). Genehmigt heißt nicht ausgezahlt: Die Zeile sagt es.
 */
export function ReimbursementsPage({ user }: { user: CurrentUser }) {
  const [search] = useSearchParams();
  const person = search.get(PERSON_PARAM);
  const notice = (useLocation().state as { meldung?: unknown } | null)?.meldung;
  const query = useQuery({
    queryKey: reimbursementsKey(person),
    queryFn: () => fetchReimbursements(person),
    retry: false,
  });
  const own = !person || person === query.data?.my_staff_member_id;
  const name = query.data?.person?.name ?? 'Unbekannte Person';
  const timeZone = user.organizationTimeZone ?? 'Europe/Berlin';

  return (
    <>
      {own ? null : (
        <Rueckweg standard={REIMBURSEMENTS_HOME} beschriftung="Zurück zu den Erstattungen" />
      )}
      <PageHeader
        title={own ? 'Erstattungen' : `Erstattungen von ${name}`}
        actions={
          own && query.data?.my_staff_member_id ? (
            <ButtonLink to={mitRueckweg(REQUEST_PATH, REIMBURSEMENTS_HOME)}>
              Erstattung beantragen
            </ButtonLink>
          ) : null
        }
      />
      {typeof notice === 'string' ? <Rueckmeldung className="mb-6">{notice}</Rueckmeldung> : null}
      <Abfragezustand
        abfrage={query}
        laden="Erstattungen werden geladen …"
        fehler={LOAD_ERROR}
        inKarte
      >
        {(state) => <Content state={state} own={own} timeZone={timeZone} />}
      </Abfragezustand>
    </>
  );
}

function Content({ state, own, timeZone }: { state: Overview; own: boolean; timeZone: string }) {
  const reimbursements = state.person?.reimbursements ?? [];
  const account = state.person?.account ?? null;

  return (
    // Abschnitt zu Abschnitt 32 px: der Abstand der Spalte, nicht dazu der
    // eigene Rand jedes Abschnitts (Design-Review Überholung 7).
    <div className="flex flex-col gap-8 [&>*]:mt-0">
      {own && state.can_decide && state.to_decide.length > 0 ? (
        <Listenabschnitt titel="Zu entscheiden" anzahl={state.to_decide.length}>
          {state.to_decide.map((r) => (
            <ListRow
              key={r.id}
              titel={r.name ?? 'Unbekannte Person'}
              meta={`${reimbursementTitle(r)} · beantragt am ${dateOf(r.requested_at, timeZone)}`}
              betrag={formatEuro(r.amount_cents)}
              to={mitRueckweg(decidePath(r.id), REIMBURSEMENTS_HOME)}
            />
          ))}
        </Listenabschnitt>
      ) : null}

      {own && state.can_decide && state.to_pay.length > 0 ? (
        <Listenabschnitt titel="Auszuzahlen" anzahl={state.to_pay.length}>
          {state.to_pay.map((r) => (
            <ListRow
              key={r.id}
              titel={r.name ?? 'Unbekannte Person'}
              meta={[reimbursementTitle(r), r.iban_masked].filter(Boolean).join(' · ')}
              betrag={formatEuro(r.amount_cents)}
              to={mitRueckweg(payPath(r.id), REIMBURSEMENTS_HOME)}
            />
          ))}
        </Listenabschnitt>
      ) : null}

      {state.person ? (
        <Listenabschnitt
          titel={own ? 'Meine Erstattungen' : 'Erstattungen'}
          anzahl={reimbursements.length}
          leer={{
            titel: 'Noch keine Erstattung',
            aktion: own ? (
              <ButtonLink variant="secondary" to={mitRueckweg(REQUEST_PATH, REIMBURSEMENTS_HOME)}>
                Erstattung beantragen
              </ButtonLink>
            ) : undefined,
          }}
        >
          {reimbursements.map((r) => (
            <ReimbursementRow key={r.id} reimbursement={r} own={own} timeZone={timeZone} />
          ))}
        </Listenabschnitt>
      ) : (
        <EmptyState
          inKarte
          title="Keine eigenen Erstattungen"
          description="Zu Ihrem Konto gibt es keinen Mitarbeiterdatensatz."
        />
      )}

      {state.person && (own || account) ? (
        <Listenabschnitt titel="Auszahlung">
          <ListRow
            titel={account ? `Auf ${account.iban_masked}` : 'Noch keine IBAN hinterlegt'}
            meta={account ? `hinterlegt am ${dateOf(account.since, timeZone)}` : undefined}
            aktion={
              own ? (
                <ButtonLink
                  variant="secondary"
                  groesse="kompakt"
                  aria-label={account ? 'Ändern: IBAN' : 'Hinterlegen: IBAN'}
                  to={mitRueckweg(ACCOUNT_PATH, REIMBURSEMENTS_HOME)}
                >
                  {account ? 'Ändern' : 'Hinterlegen'}
                </ButtonLink>
              ) : null
            }
          />
        </Listenabschnitt>
      ) : null}

      {own && state.can_read_all && state.people.length > 0 ? (
        <Listenabschnitt titel="Personen" anzahl={state.people.length}>
          {state.people.map((p) => (
            <ListRow
              key={p.staff_member_id}
              titel={p.name ?? 'Unbekannte Person'}
              meta={p.open === 0 ? 'nichts offen' : p.open === 1 ? '1 offen' : `${p.open} offen`}
              to={personPath(p.staff_member_id)}
            />
          ))}
        </Listenabschnitt>
      ) : null}
    </div>
  );
}

function ReimbursementRow({
  reimbursement: r,
  own,
  timeZone,
}: {
  reimbursement: Reimbursement;
  own: boolean;
  timeZone: string;
}) {
  const queryClient = useQueryClient();
  const withdraw = useMutation({
    mutationFn: () => withdrawReimbursement(r.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: REIMBURSEMENTS_KEY }),
  });
  const done = r.status === 'rejected' || r.status === 'withdrawn';
  const meta = [
    r.kind === 'electricity' &&
    r.working_days !== null &&
    r.energy_wh_per_day !== null &&
    r.rate_cents_per_kwh !== null
      ? electricityFormula(r.working_days, r.energy_wh_per_day, r.rate_cents_per_kwh)
      : null,
    statusLine(r, timeZone),
  ]
    .filter(Boolean)
    .join(' · ');
  const withdrawable = own && r.status === 'requested';

  return (
    <ListRow
      titel={reimbursementTitle(r)}
      meta={meta}
      betrag={formatEuro(r.amount_cents)}
      gedaempft={done}
      status={<Badge ton={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>}
      darunter={
        r.receipts.length > 0 || withdrawable ? (
          <>
            {r.receipts.length > 0 ? <ReceiptRow receipts={r.receipts} /> : null}
            {withdrawable ? (
              // Unter der Zeile in voller Breite: in der Zeile bräche die
              // Rückfrage bei 375 px (Design-Review Überholung 7).
              <BelowRow>
                <Rueckfrage
                  ausloeser="Zurückziehen"
                  ausloeserVariante="quiet"
                  ausloeserGroesse="kompakt"
                  bezeichnung="Erstattung zurückziehen"
                  bestaetigen="Ja, zurückziehen"
                  bestaetigenLaeuft="Wird zurückgezogen …"
                  fehler={withdraw.isError ? withdraw.error.message : undefined}
                  onBestaetigen={() => withdraw.mutateAsync()}
                >
                  Sie bleibt ein Jahr als zurückgezogen sichtbar.
                </Rueckfrage>
              </BelowRow>
            ) : null}
          </>
        ) : undefined
      }
    />
  );
}

/** Was mit dem Antrag geschehen ist - genehmigt heißt nicht ausgezahlt. */
function statusLine(r: Reimbursement, timeZone: string): string {
  switch (r.status) {
    case 'requested':
      return `beantragt am ${dateOf(r.requested_at, timeZone)}`;
    case 'approved':
      return r.self_entered
        ? 'selbst eingetragen, noch nicht ausgezahlt'
        : `genehmigt${r.decided_by_name ? ` von ${r.decided_by_name}` : ''}, noch nicht ausgezahlt`;
    case 'rejected':
      return `abgelehnt: ${r.decision_note ?? 'ohne Grund'}`;
    case 'withdrawn':
      return `zurückgezogen am ${dateOf(r.withdrawn_at ?? r.requested_at, timeZone)}`;
    case 'paid':
      return `ausgezahlt am ${dateOf(r.paid_at ?? r.requested_at, timeZone)}`;
  }
}

function BelowRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center justify-end gap-x-3 pb-2">{children}</div>;
}
