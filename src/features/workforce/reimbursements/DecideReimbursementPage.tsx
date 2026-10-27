import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { EmptyState } from '@/components/ui/Feedback';
import { GefuehrterAblauf } from '@/components/ui/GefuehrterAblauf';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TextArea } from '@/components/ui/TextArea';
import { beginne, kannZurueck, weiter, zurueck, type Abfolge } from '@/components/ui/abfolge';
import { EINGABETEXTE, useTextverlustschutz } from '@/app/Textverlustschutz';
import type { CurrentUser } from '@/features/core/session/types';
import { formatEuro } from '@/lib/geld';
import { leseRueckweg, mitRueckweg } from '@/lib/rueckweg';
import {
  LOAD_ERROR,
  REIMBURSEMENTS_KEY,
  decideReimbursement,
  fetchReimbursements,
  reimbursementsKey,
  type Reimbursement,
} from './api';
import { REIMBURSEMENTS_HOME, dateOf, payPath } from './paths';
import { ReceiptRow } from './ReceiptRow';
import { electricityFormulaOf, reimbursementTitle } from './rules';

/**
 * Über eine Erstattung entscheiden (G10b, ERS-001): Genehmigen zwei Tipps
 * (öffnen, Genehmigen), Ablehnen drei und der Grund. Genehmigt heißt nicht
 * ausgezahlt - danach führt „Jetzt auszahlen“ weiter (ANN-598). Nur owner;
 * was offen ist, liefert der Server (`to_decide`).
 */

type Page = 'facts' | 'reject';

const REJECT_TEXTS = { ...EINGABETEXTE, bezeichnung: 'Grund noch nicht gesendet' };

export function DecideReimbursementPage({ user }: { user: CurrentUser }) {
  const { reimbursementId } = useParams();
  const [search] = useSearchParams();
  const returnTo = leseRueckweg(search, REIMBURSEMENTS_HOME);
  const [decided, setDecided] = useState<'approved' | 'rejected' | null>(null);
  const query = useQuery({
    queryKey: reimbursementsKey(null),
    queryFn: () => fetchReimbursements(null),
    retry: false,
  });
  // Nach dem Entscheiden steht der Antrag nicht mehr in `to_decide`; die
  // Seite behält ihn, bis sie geht.
  const [kept, setKept] = useState<Reimbursement | null>(null);
  const open = query.data?.to_decide.find((r) => r.id === reimbursementId) ?? null;
  const reimbursement = kept ?? open;

  return (
    <Abfragezustand
      abfrage={query}
      laden="Erstattung wird geladen …"
      fehler={LOAD_ERROR}
      rahmen={(zustand) => (
        <>
          <PageHeader title="Erstattung entscheiden" />
          {zustand}
        </>
      )}
    >
      {() =>
        reimbursement ? (
          <Decide
            reimbursement={reimbursement}
            decided={decided}
            returnTo={returnTo}
            user={user}
            onDecided={(status) => {
              setKept(reimbursement);
              setDecided(status);
            }}
          />
        ) : (
          <>
            <PageHeader title="Erstattung entscheiden" />
            <EmptyState
              inKarte
              title="Keine offene Erstattung"
              description="Sie ist schon entschieden oder zurückgezogen."
              aktion={<ButtonLink to={returnTo}>Zurück</ButtonLink>}
            />
          </>
        )
      }
    </Abfragezustand>
  );
}

function Decide({
  reimbursement: r,
  decided,
  returnTo,
  user,
  onDecided,
}: {
  reimbursement: Reimbursement;
  decided: 'approved' | 'rejected' | null;
  returnTo: string;
  user: CurrentUser;
  onDecided: (status: 'approved' | 'rejected') => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [flow, setFlow] = useState<Abfolge<Page>>(() => beginne<Page>('facts'));
  const [reason, setReason] = useState('');
  const name = r.name ?? 'Unbekannte Person';
  const object = `Erstattung von ${name}`;
  const timeZone = user.organizationTimeZone ?? 'Europe/Berlin';

  const back = () => {
    const previous = zurueck(flow);
    if (previous) setFlow(previous);
  };
  const { freigeben, schutz } = useTextverlustschutz({
    ungespeichert: decided === null && flow.seite === 'reject' && reason.trim() !== '',
    kompakt: true,
    texte: REJECT_TEXTS,
    schrittZurueck: decided === null && kannZurueck(flow) ? back : undefined,
  });

  const decide = useMutation({
    mutationFn: (approve: boolean) =>
      decideReimbursement({
        reimbursementId: r.id,
        approve,
        note: approve ? null : reason.trim(),
      }),
    onSuccess: async (result) => {
      freigeben();
      onDecided(result.status);
      await queryClient.invalidateQueries({ queryKey: REIMBURSEMENTS_KEY });
    },
  });

  const common = {
    objekt: object,
    schliessen: 'Schließen',
    onSchliessen: () => void navigate(returnTo),
  };

  if (decided) {
    const approved = decided === 'approved';
    return (
      <GefuehrterAblauf
        {...common}
        titel={approved ? 'Genehmigt' : 'Abgelehnt'}
        seite="done"
        abschluss
        fuss={
          <div className="flex flex-col gap-2">
            {approved ? (
              <ButtonLink className="w-full" to={mitRueckweg(payPath(r.id), returnTo)}>
                Jetzt auszahlen
              </ButtonLink>
            ) : null}
            <Button
              variant={approved ? 'secondary' : 'primary'}
              className="w-full"
              data-autofocus
              onClick={() => void navigate(returnTo)}
            >
              Fertig
            </Button>
          </div>
        }
      >
        <Statusmeldung ton="erfolg">
          {approved
            ? `Erstattung für ${name} genehmigt: ${formatEuro(r.amount_cents)}. Noch nicht ausgezahlt.`
            : `${name} sieht die Ablehnung mit Ihrem Grund.`}
        </Statusmeldung>
      </GefuehrterAblauf>
    );
  }

  if (flow.seite === 'reject') {
    return (
      <GefuehrterAblauf
        {...common}
        titel="Warum nicht?"
        seite="reject"
        onZurueck={back}
        schutz={schutz}
        fuss={
          <div className="flex flex-col gap-2">
            {decide.isError ? (
              <Statusmeldung ton="fehler">{decide.error.message}</Statusmeldung>
            ) : null}
            <Button
              className="w-full"
              disabled={reason.trim() === '' || decide.isPending}
              onClick={() => decide.mutate(false)}
            >
              {decide.isPending ? 'Wird gespeichert …' : 'Ablehnen'}
            </Button>
          </div>
        }
      >
        <TextArea
          label={`Grund – ${name} sieht ihn`}
          value={reason}
          maxLength={500}
          rows={4}
          required
          data-autofocus
          onChange={(e) => setReason(e.target.value)}
        />
      </GefuehrterAblauf>
    );
  }

  return (
    <GefuehrterAblauf
      {...common}
      titel="Erstattung genehmigen?"
      seite="facts"
      schutz={schutz}
      abschluss
      fuss={
        <div className="flex flex-col gap-2">
          {decide.isError ? (
            <Statusmeldung ton="fehler">{decide.error.message}</Statusmeldung>
          ) : null}
          <Button
            className="w-full"
            disabled={decide.isPending}
            onClick={() => decide.mutate(true)}
          >
            {decide.isPending ? 'Wird gespeichert …' : 'Genehmigen'}
          </Button>
          <Button
            variant="secondary"
            className="w-full"
            disabled={decide.isPending}
            onClick={() => {
              decide.reset();
              setFlow((f) => weiter(f, 'reject'));
            }}
          >
            Ablehnen
          </Button>
        </div>
      }
    >
      <ListRows rahmen={false} beschriftung="Erstattung">
        <ListRow
          titel={reimbursementTitle(r)}
          meta={
            electricityFormulaOf(r) ??
            `${r.receipts.length} ${r.receipts.length === 1 ? 'Beleg' : 'Belege'}`
          }
          betrag={formatEuro(r.amount_cents)}
          darunter={r.receipts.length > 0 ? <ReceiptRow receipts={r.receipts} /> : undefined}
        />
        <ListRow titel="Beantragt" meta={dateOf(r.requested_at, timeZone)} />
      </ListRows>
    </GefuehrterAblauf>
  );
}
