import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { GefuehrterAblauf } from '@/components/ui/GefuehrterAblauf';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Monatsblatt } from '@/components/ui/Monatsblatt';
import { PageHeader } from '@/components/ui/PageHeader';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TextArea } from '@/components/ui/TextArea';
import {
  aendern,
  beginne,
  kannZurueck,
  weiter,
  zurueck,
  type Abfolge,
} from '@/components/ui/abfolge';
import { monatsBeginn, tagePlus } from '@/features/appointments/calendar';
import { todayInTimeZone } from '@/features/appointments/api';
import { DaysToReschedule } from '@/features/appointments/DaysToReschedule';
import { EINGABETEXTE, useTextverlustschutz } from '@/features/documentation/Textverlustschutz';
import { isOwner, type CurrentUser } from '@/features/session/types';
import { blocksText } from '@/features/working-time/rules';
import { leseRueckweg } from '@/lib/rueckweg';
import {
  PREVIEW_ERROR,
  TIME_ACCOUNT_KEY,
  fetchTimeAccount,
  previewEntry,
  problemSentences,
  recordEntry,
  timeAccountKey,
  type EntryPreview,
  type Recorded,
  type TimeAccount,
} from './api';
import {
  KIND_TITLE,
  dateWindow,
  overtimeChoices,
  parseHours,
  signedHours,
  timeOffChoices,
  type EntryKind,
} from './rules';
import { PERSON_PARAM, entryDate, personPath } from './paths';

/**
 * Ins Zeitkonto eintragen, geführt (G9, ZK-001, Budget ≤ 6 Tipps):
 * „Eintragen“ → Mehrarbeit oder Freizeitausgleich → Tag → Zeiten aus der
 * Schnellwahl (Mehrarbeit ab Dienstende, Freizeitausgleich am Plan des Tages)
 * oder von Hand → Zusammenfassung mit Saldo danach → Eintragen. Ein Eintrag
 * gilt sofort (ANN-593); der Grund ist freiwillig.
 *
 * owner und Büro tragen auf dieselbe Weise für andere ein (`?person=…`) und
 * buchen dort auch Korrekturen - Stunden mit Grund, ohne Lage; im eigenen
 * Konto bucht nur owner eine Korrektur (ANN-594). Was nicht geht, sagt die
 * Vorschau des Servers, bevor eingetragen wird.
 */

type Page = 'kind' | 'date' | 'times' | 'summary' | 'done';

const RECORD_TEXTS = {
  ...EINGABETEXTE,
  bezeichnung: 'Noch nicht eingetragen',
  zeile: {
    weitergehen: 'Der Eintrag ist noch nicht gespeichert.',
    abmelden: 'Der Eintrag ist noch nicht gespeichert – abmelden?',
    bleiben: 'Weiter',
  },
};

export function RecordTimeAccountPage({ user }: { user: CurrentUser }) {
  const [search] = useSearchParams();
  const person = search.get(PERSON_PARAM);
  const query = useQuery({
    queryKey: timeAccountKey(person),
    queryFn: () => fetchTimeAccount(person),
    retry: false,
  });
  const today = todayInTimeZone(user.organizationTimeZone ?? 'Europe/Berlin');
  return (
    <Abfragezustand
      abfrage={query}
      laden="Zeitkonto wird geladen …"
      fehler="Das Zeitkonto konnte nicht geladen werden."
      rahmen={(zustand) => (
        <>
          <PageHeader title="Ins Zeitkonto eintragen" />
          {zustand}
        </>
      )}
    >
      {(state) => <Flow state={state} person={person} today={today} user={user} />}
    </Abfragezustand>
  );
}

function Flow({
  state,
  person,
  today,
  user,
}: {
  state: TimeAccount;
  person: string | null;
  today: string;
  user: CurrentUser;
}) {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const queryClient = useQueryClient();
  const account = state.account;
  const own = !person || person === state.my_staff_member_id;
  const returnTo = leseRueckweg(search, personPath(own ? null : person));
  const staffMemberId = own ? null : person;
  const name = account?.name ?? 'Unbekannte Person';
  // Korrekturen: für andere owner und Büro, im eigenen Konto nur owner.
  const corrections = state.can_book_others && (!own || isOwner(user.roles));

  const [flow, setFlow] = useState<Abfolge<Page>>(() => beginne<Page>('kind'));
  const [kind, setKind] = useState<EntryKind | null>(null);
  const [onDate, setOnDate] = useState<string | null>(null);
  // Der Monat der Datumsseite: ein Monat je Seite, ‹ › blättert (Design-Review
  // Überholung 7).
  const [month, setMonth] = useState(() => monatsBeginn(today));
  const [von, setVon] = useState('');
  const [bis, setBis] = useState('');
  const [hours, setHours] = useState('');
  const [note, setNote] = useState('');
  const [result, setResult] = useState<Recorded | null>(null);
  const page = result ? 'done' : flow.seite;
  const minutes = kind === 'correction' ? parseHours(hours) : null;
  const timesSet = kind === 'correction' ? minutes !== null : von !== '' && bis !== '';

  // Der Tag: Plan, Abweichung, Urlaub - für die Schnellwahl.
  const day = useQuery({
    queryKey: [...TIME_ACCOUNT_KEY, 'day', staffMemberId, kind, onDate],
    queryFn: () =>
      previewEntry({
        staffMemberId,
        kind: kind!,
        onDate: onDate!,
        von: null,
        bis: null,
        minutes: null,
      }),
    enabled: kind !== null && kind !== 'correction' && onDate !== null,
    retry: false,
  });
  // Ohne Blöcke (eine andere Person vor heute) keine Schnellwahl, nur von Hand.
  const blocks = day.data?.day?.blocks ?? null;
  const choices =
    blocks === null
      ? []
      : kind === 'overtime'
        ? overtimeChoices(blocks)
        : kind === 'time_off'
          ? timeOffChoices(blocks)
          : [];

  // Was der Eintrag ergäbe: Minuten, Saldo danach, Gründe, Termine.
  const preview = useQuery({
    queryKey: [...TIME_ACCOUNT_KEY, 'preview', staffMemberId, kind, onDate, von, bis, minutes],
    queryFn: () =>
      previewEntry({
        staffMemberId,
        kind: kind!,
        onDate: onDate!,
        von: kind === 'correction' ? null : von,
        bis: kind === 'correction' ? null : bis,
        minutes,
      }),
    enabled: page === 'summary' && kind !== null && onDate !== null && timesSet,
    retry: false,
  });
  const reasons = preview.data && kind ? problemSentences(preview.data.problems, kind) : [];

  const goBack = () => {
    const before = zurueck(flow);
    if (before) setFlow(before);
  };

  const { freigeben, schutz } = useTextverlustschutz({
    ungespeichert: page !== 'done' && (kind !== null || note.trim() !== ''),
    kompakt: true,
    texte: RECORD_TEXTS,
    schrittZurueck: page !== 'done' && kannZurueck(flow) ? goBack : undefined,
  });

  const what = kind ? KIND_TITLE[kind] : '';
  const when = onDate ? entryDate(onDate) : '';
  const range = kind === 'correction' ? null : `${von}–${bis}`;

  const submit = useMutation({
    mutationFn: () =>
      recordEntry({
        staffMemberId,
        kind: kind!,
        onDate: onDate!,
        von: kind === 'correction' ? null : von,
        bis: kind === 'correction' ? null : bis,
        minutes,
        note: note.trim() === '' ? null : note.trim(),
      }),
    onSuccess: async (answer) => {
      freigeben();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: TIME_ACCOUNT_KEY }),
        queryClient.invalidateQueries({ queryKey: ['working-hour-exceptions'] }),
      ]);
      if (kind === 'time_off' && answer.appointments > 0) {
        setResult(answer);
        return;
      }
      void navigate(returnTo, {
        state: {
          meldung: `Eingetragen: ${what} ${when}${range ? `, ${range}` : ''} (${signedHours(
            answer.minutes,
          )}). Saldo ${signedHours(answer.balance_minutes)}`,
        },
      });
    },
  });

  const span = kind ? dateWindow(kind, today) : null;

  const objekt = own ? 'Ins Zeitkonto eintragen' : `Zeitkonto von ${name}`;
  const step = { kind: 1, date: 2, times: 3, summary: 4, done: 4 }[page];
  const common = {
    objekt,
    schliessen: 'Schließen',
    onSchliessen: () => void navigate(returnTo),
    seite: page,
    stand: { text: `Schritt ${step} von 4`, wert: step, von: 4 },
    onZurueck: page !== 'done' && kannZurueck(flow) ? goBack : undefined,
    schutz,
  };

  // ---------------------------------------------------------------------------
  if (page === 'done' && result) {
    return (
      <GefuehrterAblauf
        {...common}
        titel="Eingetragen"
        abschluss
        fuss={
          <Button className="w-full" data-autofocus onClick={() => void navigate(returnTo)}>
            Fertig
          </Button>
        }
      >
        <div className="flex flex-col gap-6">
          <Statusmeldung ton="erfolg">
            {`${what} ${when}, ${range} (${signedHours(result.minutes)}). Saldo ${signedHours(
              result.balance_minutes,
            )}`}
          </Statusmeldung>
          <DaysToReschedule
            staffMemberId={account?.staff_member_id ?? ''}
            days={onDate ? [{ on_date: onDate, appointments: result.appointments }] : []}
            user={user}
            returnTo={returnTo}
          />
        </div>
      </GefuehrterAblauf>
    );
  }

  // ---------------------------------------------------------------------------
  if (page === 'kind') {
    const kinds: [EntryKind, string][] = [
      ['overtime', 'Mehrarbeit'],
      ['time_off', 'Freizeitausgleich'],
      ...(corrections ? ([['correction', 'Korrektur']] as [EntryKind, string][]) : []),
    ];
    return (
      <GefuehrterAblauf
        {...common}
        titel={own ? 'Was tragen Sie ein?' : `Was tragen Sie für ${name} ein?`}
        fuss={
          <div className="flex flex-col gap-2">
            {kinds.map(([value, label], index) => (
              <Button
                key={value}
                variant="secondary"
                className="w-full"
                {...(index === 0 ? { 'data-autofocus': true } : {})}
                onClick={() => {
                  if (value !== kind) {
                    setOnDate(value === 'correction' ? today : null);
                    setVon('');
                    setBis('');
                  }
                  setKind(value);
                  setFlow(weiter(flow, value === 'correction' ? 'times' : 'date'));
                }}
              >
                {label}
              </Button>
            ))}
          </div>
        }
      >
        <p className="text-ink text-liste">
          Ein Eintrag gilt sofort und zählt im Saldo
          {account ? ` – jetzt ${signedHours(account.balance_minutes)}` : ''}.
        </p>
      </GefuehrterAblauf>
    );
  }

  // ---------------------------------------------------------------------------
  if (page === 'date' && span) {
    const choose = (value: string) => {
      if (value !== onDate) {
        setVon('');
        setBis('');
      }
      setOnDate(value);
      setFlow(weiter(flow, 'times'));
    };
    return (
      <GefuehrterAblauf
        {...common}
        titel="An welchem Tag?"
        fuss={
          kind === 'overtime' ? (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" className="w-full" onClick={() => choose(today)}>
                Heute
              </Button>
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => choose(tagePlus(today, -1))}
              >
                Gestern
              </Button>
            </div>
          ) : (
            <p className="text-ink text-sm" aria-live="polite">
              {onDate ? `Gewählt: ${entryDate(onDate)}` : 'Ein Tag nach Ihrem Wochenplan.'}
            </p>
          )
        }
      >
        <Monatsblatt
          monat={month}
          heute={today}
          ab={span.from}
          bis={span.to}
          fokus={onDate?.startsWith(month.slice(0, 7)) ? onDate : undefined}
          angabe={(value) => ({ wahl: value === onDate ? 'rand' : undefined })}
          onWaehlen={choose}
          onMonat={setMonth}
        />
      </GefuehrterAblauf>
    );
  }

  // ---------------------------------------------------------------------------
  if (page === 'times') {
    if (kind === 'correction') {
      return (
        <GefuehrterAblauf
          {...common}
          titel="Wie viele Stunden?"
          fuss={
            <Button
              className="w-full"
              disabled={minutes === null || note.trim() === ''}
              onClick={() => setFlow(weiter(flow, 'summary', true))}
            >
              Weiter
            </Button>
          }
        >
          <div className="flex flex-col gap-4">
            <Field
              label="Stunden – mit Minus, wenn sie abgehen"
              placeholder="z. B. 12:30 oder -2:00"
              inputMode="text"
              value={hours}
              data-autofocus
              onChange={(e) => setHours(e.target.value)}
            />
            <TextArea
              label="Grund – Pflicht bei einer Korrektur"
              value={note}
              maxLength={500}
              rows={3}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </GefuehrterAblauf>
      );
    }

    const pick = (choice: { von: string; bis: string }) => {
      setVon(choice.von);
      setBis(choice.bis);
      setFlow(weiter(flow, 'summary', true));
    };
    const dayReason =
      day.data && kind ? (problemSentences(day.data.problems, kind)[0] ?? null) : null;
    return (
      <GefuehrterAblauf
        {...common}
        titel={kind === 'overtime' ? 'Von wann bis wann?' : 'Welche Zeit nehmen Sie frei?'}
        fuss={
          <div className="flex flex-col gap-2">
            {day.isError ? (
              <Statusmeldung ton="fehler">
                {day.error instanceof Error
                  ? day.error.message
                  : 'Der Tag konnte nicht geladen werden.'}
              </Statusmeldung>
            ) : null}
            {dayReason ? <Statusmeldung ton="fehler">{dayReason}</Statusmeldung> : null}
            <Button
              className="w-full"
              disabled={!timesSet || dayReason !== null}
              onClick={() => setFlow(weiter(flow, 'summary', true))}
            >
              Weiter
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-ink-muted text-sm">
            {when}
            {day.isPending
              ? ' · Tag wird geladen …'
              : blocks !== null
                ? ` · Plan: ${blocksText(blocks)}`
                : ''}
          </p>
          {choices.length > 0 && dayReason === null ? (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Schnellwahl">
              {choices.map((choice) => (
                <Button
                  key={choice.label}
                  variant="secondary"
                  groesse="kompakt"
                  aria-label={`${choice.label}: ${choice.von}–${choice.bis}`}
                  onClick={() => pick(choice)}
                >
                  {choice.label}
                </Button>
              ))}
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Beginn"
              type="time"
              step={300}
              value={von}
              onChange={(e) => setVon(e.target.value)}
            />
            <Field
              label="Ende"
              type="time"
              step={300}
              value={bis}
              onChange={(e) => setBis(e.target.value)}
            />
          </div>
        </div>
      </GefuehrterAblauf>
    );
  }

  // ---------------------------------------------------------------------------
  // Zusammenfassung
  /** Die Zeilen der Zusammenfassung - erst mit der Vorschau des Servers. */
  const summary = (data: EntryPreview) => {
    const after = data.balance_after;
    const appointments = data.appointments ?? 0;
    return (
      <div className="flex flex-col gap-4">
        <ListRows rahmen={false} beschriftung="Eintrag">
          <ListRow
            titel={`${what} · ${when}`}
            aktion={
              kind === 'correction' ? null : (
                <Button
                  variant="secondary"
                  groesse="kompakt"
                  aria-label="Tag ändern"
                  onClick={() => setFlow(aendern(flow, 'date'))}
                >
                  Ändern
                </Button>
              )
            }
          />
          <ListRow
            titel={
              kind === 'correction'
                ? minutes === null
                  ? ''
                  : signedHours(minutes)
                : `${range}${data.minutes != null ? ` · ${signedHours(data.minutes)}` : ''}`
            }
            aktion={
              <Button
                variant="secondary"
                groesse="kompakt"
                aria-label={kind === 'correction' ? 'Stunden ändern' : 'Zeiten ändern'}
                onClick={() => setFlow(aendern(flow, 'times'))}
              >
                Ändern
              </Button>
            }
          />
          <ListRow
            titel={after == null ? 'Saldo danach –' : `Saldo danach ${signedHours(after)}`}
          />
          {kind === 'time_off' ? (
            <ListRow
              titel={
                appointments === 0
                  ? 'Keine Termine in der freien Zeit'
                  : `${appointments} ${appointments === 1 ? 'Termin' : 'Termine'} in der freien Zeit`
              }
              meta={appointments === 0 ? undefined : 'Danach umplanen'}
            />
          ) : null}
          {kind === 'correction' && note.trim() !== '' ? (
            <ListRow titel="Grund" meta={note.trim()} />
          ) : null}
        </ListRows>
        {kind === 'correction' ? null : (
          <Disclosure summary="Grund angeben" offen={note !== ''}>
            <TextArea
              label="Grund – freiwillig"
              value={note}
              maxLength={500}
              rows={3}
              onChange={(e) => setNote(e.target.value)}
            />
          </Disclosure>
        )}
      </div>
    );
  };

  return (
    <GefuehrterAblauf
      {...common}
      titel="Eintragen?"
      abschluss
      fuss={
        <div className="flex flex-col gap-2">
          {submit.isError ? (
            <Statusmeldung ton="fehler">
              {submit.error instanceof Error
                ? submit.error.message
                : 'Der Eintrag konnte nicht gespeichert werden.'}
            </Statusmeldung>
          ) : null}
          {reasons.length > 0 ? (
            <Statusmeldung ton="fehler">{reasons.join(' ')}</Statusmeldung>
          ) : null}
          <Button
            className="w-full"
            disabled={submit.isPending || !preview.data || reasons.length > 0}
            onClick={() => submit.mutate()}
          >
            {submit.isPending ? 'Wird eingetragen …' : 'Eintragen'}
          </Button>
        </div>
      }
    >
      {/* Laden, Funkloch und Abweisung der Vorschau über den Baustein (Regel 8):
          ein Fehler ist nie „keine Termine“ oder ein leerer Saldo. */}
      <Abfragezustand
        abfrage={preview}
        laden="Saldo wird berechnet …"
        fehler={PREVIEW_ERROR}
        endgueltig={{
          wenn: (error) => error instanceof Error && error.message !== PREVIEW_ERROR,
          titel: preview.error instanceof Error ? preview.error.message : PREVIEW_ERROR,
        }}
      >
        {(data) => summary(data)}
      </Abfragezustand>
    </GefuehrterAblauf>
  );
}
