import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { GefuehrterAblauf } from '@/components/ui/GefuehrterAblauf';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { ibanInGruppen } from '@/features/billing';
import type { CurrentUser } from '@/features/core';
import { formatEuro } from '@/lib/geld';
import { leseRueckweg } from '@/lib/rueckweg';
import {
  PAYOUT_ERROR,
  REIMBURSEMENTS_KEY,
  fetchPayoutDetails,
  markPaid,
  type PayoutDetails,
} from './api';
import { REIMBURSEMENTS_HOME, dateOf } from './paths';
import { reimbursementTitle } from './rules';

/**
 * Auszahlung vermerken (G10b, ERS-001): öffnen, „Ausgezahlt“ - zwei Tipps.
 * Überwiesen wird bei der Bank; die Seite zeigt dafür Name, Betrag, die
 * volle IBAN und seit wann sie hinterlegt ist (ANN-601: nur hier, nur für
 * owner, nur zu einem genehmigten Antrag) und einen Verwendungszweck.
 */

export function PayReimbursementPage({ user }: { user: CurrentUser }) {
  const { reimbursementId } = useParams();
  const [search] = useSearchParams();
  const returnTo = leseRueckweg(search, REIMBURSEMENTS_HOME);
  const [paid, setPaid] = useState<PayoutDetails | null>(null);
  const query = useQuery({
    queryKey: [...REIMBURSEMENTS_KEY, 'payout', reimbursementId],
    queryFn: () => fetchPayoutDetails(reimbursementId!),
    enabled: !!reimbursementId && paid === null,
    retry: false,
  });

  if (paid) return <Done details={paid} returnTo={returnTo} />;
  return (
    <Abfragezustand
      abfrage={query}
      laden="Auszahlung wird geladen …"
      fehler={PAYOUT_ERROR}
      // Was der Server abweist - nicht mehr offen, nicht (mehr) da, nicht
      // erlaubt -, behebt kein neuer Versuch (Design-Review Überholung 10).
      endgueltig={{
        wenn: (failure) => failure instanceof Error && failure.message !== PAYOUT_ERROR,
        titel: query.error instanceof Error ? query.error.message : PAYOUT_ERROR,
      }}
      ausweg={
        <ButtonLink variant="secondary" className="mt-4" to={returnTo}>
          Zurück
        </ButtonLink>
      }
      rahmen={(zustand) => (
        <>
          <PageHeader title="Auszahlen" />
          {zustand}
        </>
      )}
    >
      {(details) => (
        <Pay details={details} returnTo={returnTo} user={user} onPaid={() => setPaid(details)} />
      )}
    </Abfragezustand>
  );
}

function Pay({
  details: d,
  returnTo,
  user,
  onPaid,
}: {
  details: PayoutDetails;
  returnTo: string;
  user: CurrentUser;
  onPaid: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const name = d.name ?? 'Unbekannte Person';
  const timeZone = user.organizationTimeZone ?? 'Europe/Berlin';
  const pay = useMutation({
    mutationFn: () => markPaid(d.id),
    onSuccess: async () => {
      onPaid();
      await queryClient.invalidateQueries({ queryKey: REIMBURSEMENTS_KEY });
    },
  });

  return (
    <GefuehrterAblauf
      objekt={`Erstattung von ${name}`}
      titel="Ausgezahlt?"
      schliessen="Schließen"
      onSchliessen={() => void navigate(returnTo)}
      seite="pay"
      abschluss
      fuss={
        <div className="flex flex-col gap-2">
          {pay.isError ? <Statusmeldung ton="fehler">{pay.error.message}</Statusmeldung> : null}
          <Button className="w-full" disabled={pay.isPending} onClick={() => pay.mutate()}>
            {pay.isPending ? 'Wird vermerkt …' : 'Ausgezahlt'}
          </Button>
        </div>
      }
    >
      <ListRows rahmen={false} beschriftung="Auszahlung">
        <ListRow titel={name} meta={reimbursementTitle(d)} betrag={formatEuro(d.amount_cents)} />
        {d.iban ? (
          <ListRow
            titel={<span className="tabular-nums">{ibanInGruppen(d.iban)}</span>}
            meta={
              d.account_since ? `IBAN, hinterlegt am ${dateOf(d.account_since, timeZone)}` : 'IBAN'
            }
          />
        ) : (
          <ListRow
            titel="Keine IBAN hinterlegt"
            meta={`${name} trägt sie unter „Erstattungen“ ein.`}
          />
        )}
        <ListRow titel="Verwendungszweck" meta={`Erstattung ${reimbursementTitle(d)}`} />
      </ListRows>
    </GefuehrterAblauf>
  );
}

function Done({ details: d, returnTo }: { details: PayoutDetails; returnTo: string }) {
  const navigate = useNavigate();
  const name = d.name ?? 'Unbekannte Person';
  return (
    <GefuehrterAblauf
      objekt={`Erstattung von ${name}`}
      titel="Vermerkt"
      schliessen="Schließen"
      onSchliessen={() => void navigate(returnTo)}
      seite="done"
      abschluss
      fuss={
        <Button className="w-full" data-autofocus onClick={() => void navigate(returnTo)}>
          Fertig
        </Button>
      }
    >
      <Statusmeldung ton="erfolg">
        {`Auszahlung an ${name} vermerkt: ${formatEuro(d.amount_cents)}.`}
      </Statusmeldung>
    </GefuehrterAblauf>
  );
}
