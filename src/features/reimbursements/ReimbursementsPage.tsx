import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { EmptyState } from '@/components/ui/Feedback';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { ListRow } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { Rueckweg } from '@/components/ui/Rueckweg';
import type { CurrentUser } from '@/features/session/types';
import { formatEuro } from '@/lib/geld';
import { useMeldungAusVerlauf } from '@/lib/meldung';
import { mitRueckweg } from '@/lib/rueckweg';
import {
  LOAD_ERROR,
  REIMBURSEMENTS_KEY,
  fetchReimbursements,
  reimbursementsKey,
  withdrawReimbursement,
  type Overview,
  type PersonReimbursement,
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
import { BelowRow } from './BelowRow';
import { ReceiptRow } from './ReceiptRow';
import {
  STATUS_LABEL,
  STATUS_SIGN,
  STATUS_TONE,
  electricityFormulaOf,
  reimbursementTitle,
} from './rules';

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
  // Die Bestätigung einmal - nach Neuladen oder „Zurück“ nicht wieder (Überholung 9).
  const { meldung: notice } = useMeldungAusVerlauf();
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
      {notice ? (
        <Rueckmeldung key={notice.schluessel} className="mb-6">
          {notice.text}
        </Rueckmeldung>
      ) : null}
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
      {/* ANN-616: Beim Büro fehlt der Betrag eines Antrags aus Touren - er
          verriete die Kilometer. Einmal am Ende statt in jeder Zeile
          (Design-Review, Regel 6). */}
      {reimbursements.some((r) => r.amount_cents === null) ? (
        <Kleingedrucktes>
          Beim Ladestrom aus den geplanten Touren sehen den Betrag nur die Person selbst und wer
          entscheidet.
        </Kleingedrucktes>
      ) : null}
    </div>
  );
}

function ReimbursementRow({
  reimbursement: r,
  own,
  timeZone,
}: {
  reimbursement: PersonReimbursement;
  own: boolean;
  timeZone: string;
}) {
  const queryClient = useQueryClient();
  const withdraw = useMutation({
    mutationFn: () => withdrawReimbursement(r.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: REIMBURSEMENTS_KEY }),
  });
  const done = r.status === 'rejected' || r.status === 'withdrawn';
  const meta = [electricityFormulaOf(r), statusLine(r, timeZone)].filter(Boolean).join(' · ');
  const withdrawable = own && r.status === 'requested';

  return (
    <ListRow
      titel={reimbursementTitle(r)}
      meta={meta}
      betrag={r.amount_cents === null ? undefined : formatEuro(r.amount_cents)}
      gedaempft={done}
      status={
        <Badge ton={STATUS_TONE[r.status]} eigenesZeichen={STATUS_SIGN[r.status]}>
          {STATUS_LABEL[r.status]}
        </Badge>
      }
      darunter={
        r.receipts.length > 0 || withdrawable ? (
          <>
            {r.receipts.length > 0 ? <ReceiptRow receipts={r.receipts} /> : null}
            {withdrawable ? (
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

/**
 * Was mit dem Antrag geschehen ist und wann - genehmigt heißt nicht
 * ausgezahlt. Das Datum des Antrags bleibt neben dem der Entscheidung stehen
 * (Design-Review Überholung 10).
 */
function statusLine(r: PersonReimbursement, timeZone: string): string {
  const requested = dateOf(r.requested_at, timeZone);
  const on = (timestamp: string | null) => dateOf(timestamp ?? r.requested_at, timeZone);
  switch (r.status) {
    case 'requested':
      return `beantragt am ${requested}`;
    case 'approved':
      return r.self_entered
        ? `selbst eingetragen am ${requested}, noch nicht ausgezahlt`
        : `beantragt am ${requested} · genehmigt am ${on(r.decided_at)}${
            r.decided_by_name ? ` von ${r.decided_by_name}` : ''
          }, noch nicht ausgezahlt`;
    case 'rejected':
      return `beantragt am ${requested} · abgelehnt am ${on(r.decided_at)}: ${
        r.decision_note ?? 'ohne Grund'
      }`;
    case 'withdrawn':
      return `beantragt am ${requested} · zurückgezogen am ${on(r.withdrawn_at)}`;
    case 'paid':
      return `beantragt am ${requested} · ausgezahlt am ${on(r.paid_at)}`;
  }
}
