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
import { EINGABETEXTE, useTextverlustschutz } from '@/features/documentation/Textverlustschutz';
import { leseRueckweg } from '@/lib/rueckweg';
import {
  TIME_ACCOUNT_KEY,
  fetchTimeAccount,
  rejectEntry,
  timeAccountKey,
  type Entry,
  type Rejected,
} from './api';
import { KIND_TITLE, signedHours } from './rules';
import { PERSON_PARAM, entryDate, personPath } from './paths';

/**
 * Einen Eintrag zurückweisen (G9b, ZK-001, Budget 3 Tipps und der Grund):
 * Zeile „Zurückweisen“ → der Eintrag mit allem, was ihn ausmacht →
 * „Zurückweisen“ → Grund → „Zurückweisen“. Nur owner, nie im eigenen Konto
 * (ANN-594); das entscheidet der Server. Der Eintrag bleibt für die Person
 * sichtbar und zählt nicht mehr; ein Freizeitausgleich gibt die Zeit wieder
 * als Arbeitszeit frei (ANN-595).
 */

type Page = 'details' | 'reason';

const REJECT_TEXTS = {
  ...EINGABETEXTE,
  bezeichnung: 'Noch nicht zurückgewiesen',
  zeile: {
    weitergehen: 'Der Eintrag ist noch nicht zurückgewiesen.',
    abmelden: 'Der Eintrag ist noch nicht zurückgewiesen – abmelden?',
    bleiben: 'Weiter',
  },
};

export function RejectTimeAccountEntryPage() {
  const { entryId } = useParams();
  const [search] = useSearchParams();
  const person = search.get(PERSON_PARAM);
  const returnTo = leseRueckweg(search, personPath(person));
  const query = useQuery({
    queryKey: timeAccountKey(person),
    queryFn: () => fetchTimeAccount(person),
    retry: false,
  });
  // Das Ergebnis bleibt stehen, auch wenn der Eintrag nach dem Neuladen
  // nicht mehr zurückzuweisen ist.
  const [done, setDone] = useState<{ entry: Entry; name: string; result: Rejected } | null>(null);

  if (done) {
    return <Done entry={done.entry} name={done.name} result={done.result} returnTo={returnTo} />;
  }

  return (
    <Abfragezustand
      abfrage={query}
      laden="Eintrag wird geladen …"
      fehler="Der Eintrag konnte nicht geladen werden."
      rahmen={(zustand) => (
        <>
          <PageHeader title="Eintrag zurückweisen" />
          {zustand}
        </>
      )}
    >
      {(state) => {
        const entry = state.account?.entries.find((e) => e.id === entryId && e.can_reject);
        const name = state.account?.name ?? 'Unbekannte Person';
        if (!entry) {
          return (
            <>
              <PageHeader title="Eintrag zurückweisen" />
              <EmptyState
                inKarte
                title="Nichts mehr zurückzuweisen"
                description="Der Eintrag ist schon zurückgewiesen oder zurückgenommen."
              />
              <div className="mt-4">
                <ButtonLink to={returnTo} variant="secondary">
                  Zurück
                </ButtonLink>
              </div>
            </>
          );
        }
        return (
          <Flow
            entry={entry}
            name={name}
            returnTo={returnTo}
            onDone={(result) => setDone({ entry, name, result })}
          />
        );
      }}
    </Abfragezustand>
  );
}

function entryText(entry: Entry): string {
  const range = entry.starts_at && entry.ends_at ? `, ${entry.starts_at}–${entry.ends_at}` : '';
  return `${KIND_TITLE[entry.kind]} ${entryDate(entry.on_date)}${range}`;
}

function Done({
  entry,
  name,
  result,
  returnTo,
}: {
  entry: Entry;
  name: string;
  result: Rejected;
  returnTo: string;
}) {
  const navigate = useNavigate();
  return (
    <GefuehrterAblauf
      titel="Zurückgewiesen"
      objekt={`Zeitkonto von ${name}`}
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
        {`${entryText(entry)} zählt nicht mehr. ${name} sieht Ihren Grund.${
          result.freed ? ' Die Zeit ist wieder Arbeitszeit.' : ''
        }`}
      </Statusmeldung>
    </GefuehrterAblauf>
  );
}

function Flow({
  entry,
  name,
  returnTo,
  onDone,
}: {
  entry: Entry;
  name: string;
  returnTo: string;
  onDone: (result: Rejected) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [flow, setFlow] = useState<Abfolge<Page>>(() => beginne<Page>('details'));
  const [reason, setReason] = useState('');
  const page = flow.seite;

  const goBack = () => {
    const before = zurueck(flow);
    if (before) setFlow(before);
  };

  const { freigeben, schutz } = useTextverlustschutz({
    ungespeichert: page === 'reason' && reason.trim() !== '',
    kompakt: true,
    texte: REJECT_TEXTS,
    schrittZurueck: kannZurueck(flow) ? goBack : undefined,
  });

  const reject = useMutation({
    mutationFn: () => rejectEntry({ entryId: entry.id, note: reason.trim() }),
    onSuccess: async (answer) => {
      freigeben();
      onDone(answer);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: TIME_ACCOUNT_KEY }),
        queryClient.invalidateQueries({ queryKey: ['working-hour-exceptions'] }),
      ]);
    },
  });

  const object = `Zeitkonto von ${name}`;
  const error = reject.isError ? (
    <Statusmeldung ton="fehler">
      {reject.error instanceof Error
        ? reject.error.message
        : 'Die Zurückweisung konnte nicht gespeichert werden.'}
    </Statusmeldung>
  ) : null;

  if (page === 'reason') {
    return (
      <GefuehrterAblauf
        titel="Warum nicht?"
        objekt={object}
        schliessen="Schließen"
        onSchliessen={() => void navigate(returnTo)}
        seite="reason"
        onZurueck={goBack}
        schutz={schutz}
        fuss={
          <div className="flex flex-col gap-2">
            {error}
            <Button
              className="w-full"
              disabled={reason.trim() === '' || reject.isPending}
              onClick={() => reject.mutate()}
            >
              {reject.isPending ? 'Wird gespeichert …' : 'Zurückweisen'}
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
      titel="Eintrag zurückweisen?"
      objekt={object}
      schliessen="Schließen"
      onSchliessen={() => void navigate(returnTo)}
      seite="details"
      schutz={schutz}
      abschluss
      fuss={
        <Button className="w-full" onClick={() => setFlow(weiter(flow, 'reason'))}>
          Zurückweisen
        </Button>
      }
    >
      <ListRows rahmen={false} beschriftung="Eintrag">
        <ListRow titel={entryText(entry)} betrag={signedHours(entry.minutes)} />
        {entry.note ? <ListRow titel="Grund" meta={entry.note} /> : null}
        {entry.entered_by_name ? (
          <ListRow titel="Eingetragen von" meta={entry.entered_by_name} />
        ) : null}
        {entry.kind === 'time_off' ? (
          <ListRow titel="Die freie Zeit wird wieder Arbeitszeit" />
        ) : null}
      </ListRows>
    </GefuehrterAblauf>
  );
}
