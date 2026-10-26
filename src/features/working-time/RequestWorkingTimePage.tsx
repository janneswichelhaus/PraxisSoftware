import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Card';
import { GefuehrterAblauf } from '@/components/ui/GefuehrterAblauf';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Monatsblatt } from '@/components/ui/Monatsblatt';
import { PageHeader } from '@/components/ui/PageHeader';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TextArea } from '@/components/ui/TextArea';
import { roleLabels } from '@/components/ui/roleLabels';
import {
  aendern,
  beginne,
  kannZurueck,
  weiter,
  zurueck,
  type Abfolge,
} from '@/components/ui/abfolge';
import { EINGABETEXTE, useTextverlustschutz } from '@/app/Textverlustschutz';
import type { CurrentUser } from '@/features/session/types';
import { leseRueckweg } from '@/lib/rueckweg';
import { DayEditor } from './DayEditor';
import {
  BASELINE_ERROR,
  PREVIEW_ERROR,
  REDUCTION_TEXT,
  WORKING_TIME_KEY,
  fetchBaseline,
  fetchWorkingTime,
  previewChange,
  problemSentences,
  requestChange,
  type ChangeKind,
  type WorkingTime,
} from './api';
import { blocksFromForm, formFromBlocks, type DayForm } from './dayForm';
import { WEEKDAY_NAME, changeTitle, changedWeekdays, dayText, minutesChange } from './format';
import {
  PROBLEM_SHORT,
  PROBLEM_TEXT,
  WEEKDAYS,
  blocksText,
  dayProblems,
  sameBlocks,
  weekDayProblems,
  weekMinutes,
  weekProblems,
  workMinutes,
  type Block,
  type Week,
} from './rules';
import {
  dateDayMonth,
  dateLong,
  todayInTimeZone,
  monatPlus,
  monatsBeginn,
  tagKurz,
  tagePlus,
} from '@/lib/datum';

/**
 * Arbeitszeitänderung beantragen, geführt (G8, AZ-001, Budget ≤ 8 Tipps und
 * die Zeiten): „Änderung beantragen“ → einmalig oder dauerhaft → Tag bzw.
 * ab wann → die neuen Zeiten (vorbelegt, „bisher“ daneben) → Zusammenfassung
 * mit bisher und neu, Arbeitszeit und Terminen außerhalb → Absenden.
 *
 * Was nicht geht, sagt die Seite, bevor abgesendet wird (ANN-588): weniger
 * Stunden als bisher - einmalig am Tag, dauerhaft in der Woche -, mehr als 10
 * Stunden, zu kurze Pause, mehr als 6 Stunden am Stück, weniger als 11
 * Stunden Ruhe. Die Ruhe zu den Nachbartagen kennt nur der Server; seine
 * Vorschau steht in der Zusammenfassung. Der Grund ist freiwillig und geht an
 * die Praxisleitung (ANN-590).
 *
 * owner trägt die eigene Änderung direkt ein: dieselben Seiten, der
 * Hauptknopf heißt „Änderung eintragen“.
 */

type Page =
  | { art: 'kind' }
  | { art: 'date' }
  | { art: 'times' }
  | { art: 'day'; day: (typeof WEEKDAYS)[number] }
  | { art: 'summary' };

const REQUEST_TEXTS = {
  ...EINGABETEXTE,
  bezeichnung: 'Noch nicht beantragt',
  zeile: {
    weitergehen: 'Die Änderung ist noch nicht beantragt.',
    abmelden: 'Die Änderung ist noch nicht beantragt – abmelden?',
    bleiben: 'Weiter',
  },
};

/** Wie weit voraus ein Datum reicht (Server: `app.assert_working_time_date`). */
const DAYS_AHEAD = 400;

export function RequestWorkingTimePage({ user }: { user: CurrentUser }) {
  const query = useQuery({ queryKey: WORKING_TIME_KEY, queryFn: fetchWorkingTime, retry: false });
  const today = todayInTimeZone(user.organizationTimeZone ?? 'Europe/Berlin');
  return (
    <Abfragezustand
      abfrage={query}
      laden="Arbeitszeit wird geladen …"
      fehler="Die Arbeitszeit konnte nicht geladen werden."
      rahmen={(zustand) => (
        <>
          <PageHeader title="Arbeitszeit ändern" />
          {zustand}
        </>
      )}
    >
      {(state) => <Flow state={state} today={today} />}
    </Abfragezustand>
  );
}

interface Draft {
  key: string;
  day: DayForm | null;
  week: Week;
  dayForms: Partial<Record<(typeof WEEKDAYS)[number], DayForm>>;
}

/** Ein Tag aus dem Formular - oder der bisherige, solange das Formular nichts abbildet. */
function draftBlocks(form: DayForm | null, fallback: readonly Block[]): Block[] | null {
  return form === null ? [...fallback] : blocksFromForm(form);
}

/** Wie viele Tage mit Terminen außerhalb der Abschluss einzeln nennt. */
const NAMED_DAYS = 3;

/** Ein Eintrag der Terminzeile bricht nicht in sich, nur zwischen den Einträgen. */
function unbroken(text: string): string {
  return text.replaceAll(' ', '\u00a0');
}

/**
 * „1. Dez.: 2 · 8. Dez.: 1 · 2 weitere Tage“ - je Tag die Zahl, ab dem vierten
 * Tag nur noch, wie viele es sind: Die Zeile bleibt kurz, der Abschluss rollt
 * bei 375 × 667 nicht (DESIGN.md, geführter Ablauf). Auch mit zweistelligen
 * Zahlen sind es höchstens zwei Zeilen (BEF-219).
 */
function appointmentDaysText(days: readonly { on_date: string; appointments: number }[]): string {
  const withAppointments = days.filter((d) => d.appointments > 0);
  const named = withAppointments
    .slice(0, NAMED_DAYS)
    .map((d) => unbroken(`${tagKurz(d.on_date)}: ${d.appointments}`));
  const rest = withAppointments.length - named.length;
  return [
    ...named,
    ...(rest > 0 ? [unbroken(`${rest} ${rest === 1 ? 'weiterer Tag' : 'weitere Tage'}`)] : []),
  ].join(' · ');
}

function Flow({ state, today }: { state: WorkingTime; today: string }) {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const returnTo = leseRueckweg(search, '/betrieb/arbeitszeit');
  const queryClient = useQueryClient();
  const self = state.self_entered;
  const tomorrow = tagePlus(today, 1);
  // Der Monat der Datumsseite: anfangs der von morgen, danach der des Tages.
  const [month, setMonth] = useState(() => monatsBeginn(tomorrow));

  const [flow, setFlow] = useState<Abfolge<Page>>(() => beginne<Page>({ art: 'kind' }));
  const [kind, setKind] = useState<ChangeKind | null>(null);
  const [onDate, setOnDate] = useState<string | null>(null);
  // Der Entwurf gehört zu Art und Datum; wechselt eins, beginnt er neu. Im
  // Wochenplan steht je Tag das Formular, solange es noch nicht passt.
  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState('');
  const page = flow.seite;
  const key = kind && onDate ? `${kind}:${onDate}` : null;

  const baseline = useQuery({
    queryKey: [...WORKING_TIME_KEY, 'baseline', kind, onDate],
    queryFn: () => fetchBaseline(kind!, onDate!),
    enabled: key !== null,
    retry: false,
  });
  const previous = baseline.data;
  const previousDay: Block[] =
    kind === 'once' && previous && Array.isArray(previous.previous) ? previous.previous : [];
  const previousWeek: Week =
    kind === 'permanent' && previous && !Array.isArray(previous.previous) ? previous.previous : {};

  // Der Entwurf, vorbelegt mit dem Bisherigen.
  const current =
    draft && draft.key === key
      ? draft
      : previous && key
        ? { key, day: formFromBlocks(previousDay), week: { ...previousWeek }, dayForms: {} }
        : null;

  const newDay = kind === 'once' && current ? draftBlocks(current.day, previousDay) : null;
  const newWeek = kind === 'permanent' && current ? current.week : null;
  const blocks: Block[] | Week | null = kind === 'once' ? newDay : newWeek;
  const minutes =
    kind === 'once' ? (newDay ? workMinutes(newDay) : null) : newWeek ? weekMinutes(newWeek) : null;

  // Was am Gerät dagegen spricht (die Ruhe zu den Nachbartagen kennt der Server).
  const reasons: string[] = (() => {
    if (!previous || blocks === null || minutes === null) return [];
    const problems = kind === 'once' ? dayProblems(newDay ?? []) : weekProblems(newWeek ?? {});
    const texts = problems.map((p) => PROBLEM_TEXT[p]);
    if (minutes < previous.previous_minutes) texts.unshift(REDUCTION_TEXT);
    return texts;
  })();
  const unchanged =
    !!previous &&
    (kind === 'once'
      ? newDay !== null && sameBlocks(newDay, previousDay)
      : newWeek !== null && changedWeekdays(previousWeek, newWeek).length === 0);
  const complete = blocks !== null && reasons.length === 0 && !unchanged;

  const preview = useQuery({
    queryKey: [...WORKING_TIME_KEY, 'preview', kind, onDate, JSON.stringify(blocks)],
    queryFn: () => previewChange(kind!, onDate!, blocks!),
    enabled: page.art === 'summary' && complete,
    retry: false,
  });
  const serverReasons = preview.data ? problemSentences(preview.data.problems) : [];

  const goBack = () => {
    const before = zurueck(flow);
    if (before) setFlow(before);
  };

  const { freigeben, schutz } = useTextverlustschutz({
    ungespeichert: kind !== null || message.trim() !== '',
    kompakt: true,
    texte: REQUEST_TEXTS,
    schrittZurueck: kannZurueck(flow) ? goBack : undefined,
  });

  const submit = useMutation({
    mutationFn: () =>
      requestChange({
        kind: kind!,
        onDate: onDate!,
        blocks: blocks!,
        message: message.trim() === '' ? null : message.trim(),
      }),
    onSuccess: async () => {
      freigeben();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: WORKING_TIME_KEY }),
        queryClient.invalidateQueries({ queryKey: ['working-hours'] }),
        queryClient.invalidateQueries({ queryKey: ['working-hour-exceptions'] }),
      ]);
      const what = changeTitle(kind!, onDate!);
      void navigate(returnTo, {
        state: {
          meldung: self
            ? `Änderung eingetragen: ${what}.`
            : `Änderung beantragt: ${what}. Es entscheidet: ${roleLabels.owner}.`,
        },
      });
    },
  });

  function updateDraft(change: Partial<Omit<Draft, 'key'>>) {
    if (!current) return;
    setDraft({ ...current, ...change });
  }

  /** Ein Tag, dessen Formular nicht passt oder gegen die Regeln verstößt. */
  function dayInvalid(day: (typeof WEEKDAYS)[number]): boolean {
    const form = current?.dayForms[day];
    if (!form) return false;
    const dayBlocks = blocksFromForm(form);
    return dayBlocks === null || dayProblems(dayBlocks).length > 0;
  }

  const mainButton = self ? 'Änderung eintragen' : 'Änderung beantragen';
  const step = { kind: 1, date: 2, times: 3, day: 3, summary: 4 }[page.art];
  const common = {
    objekt: mainButton,
    schliessen: 'Schließen',
    onSchliessen: () => void navigate(returnTo),
    seite: page.art === 'day' ? `day-${page.day}` : page.art,
    stand: { text: `Schritt ${step} von 4`, wert: step, von: 4 },
    onZurueck: kannZurueck(flow) ? goBack : undefined,
    schutz,
  };

  // ---------------------------------------------------------------------------
  if (page.art === 'kind') {
    return (
      <GefuehrterAblauf
        {...common}
        titel="Was möchten Sie ändern?"
        fuss={
          <div className="flex flex-col gap-2">
            {(
              [
                ['once', 'Einen Tag'],
                ['permanent', 'Den Wochenplan ab einem Datum'],
              ] as const
            ).map(([value, label], index) => (
              <Button
                key={value}
                variant="secondary"
                className="w-full"
                {...(index === 0 ? { 'data-autofocus': true } : {})}
                onClick={() => {
                  if (value !== kind) setOnDate(null);
                  setKind(value);
                  setFlow(weiter(flow, { art: 'date' }));
                }}
              >
                {label}
              </Button>
            ))}
          </div>
        }
      />
    );
  }

  // ---------------------------------------------------------------------------
  if (page.art === 'date') {
    return (
      <GefuehrterAblauf
        {...common}
        titel={kind === 'once' ? 'An welchem Tag?' : 'Ab wann?'}
        fuss={
          kind === 'permanent' ? (
            // Ein Wochenplan beginnt meist am Monatsersten: die nächsten zwei
            // als Schnellwahl, damit kein Blättern das Budget sprengt (G8 ≤ 8).
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Ab dem Monatsersten">
              {[1, 2].map((n) => {
                const first = monatPlus(monatsBeginn(today), n);
                return (
                  <Button
                    key={first}
                    variant="secondary"
                    className="w-full"
                    aria-label={`Ab ${dateLong(first)}`}
                    onClick={() => {
                      setOnDate(first);
                      setMonth(first);
                      setFlow(weiter(flow, { art: 'times' }));
                    }}
                  >
                    {`Ab ${dateDayMonth(first)}`}
                  </Button>
                );
              })}
            </div>
          ) : (
            <p className="text-ink text-sm" aria-live="polite">
              {onDate ? `Gewählt: ${dateLong(onDate)}` : 'Frühestens ab morgen.'}
            </p>
          )
        }
      >
        {/* Ein Monat je Seite mit ‹ › - die Seite rollt nicht (Design-Review
            Überholung 7). */}
        <Monatsblatt
          monat={month}
          heute={today}
          ab={tomorrow}
          bis={tagePlus(today, DAYS_AHEAD)}
          fokus={onDate?.startsWith(month.slice(0, 7)) ? onDate : undefined}
          angabe={(day) => ({ wahl: day === onDate ? 'rand' : undefined })}
          onMonat={setMonth}
          onWaehlen={(day) => {
            setOnDate(day);
            setFlow(weiter(flow, { art: 'times' }));
          }}
        />
      </GefuehrterAblauf>
    );
  }

  // ---------------------------------------------------------------------------
  if (page.art === 'times' || page.art === 'day') {
    const loading = baseline.isPending || !current;
    // Der Grund als Statusmeldung (Regel 5). Am Wochenplan kurz und mit dem
    // Tag, den seine Zeile schon nennt - sieben Tage und der Fuß passen so
    // ohne Rollen auf 375 × 667 (Design-Review Überholung 8).
    const weekPage = page.art === 'times' && kind === 'permanent';
    const problemDay =
      weekPage && newWeek
        ? WEEKDAYS.find((day) => weekDayProblems(newWeek, day).length > 0)
        : undefined;
    const reason =
      problemDay && newWeek
        ? `${WEEKDAY_NAME[problemDay]}: ${PROBLEM_SHORT[weekDayProblems(newWeek, problemDay)[0]!]}`
        : weekPage && previous && minutes !== null && minutes < previous.previous_minutes
          ? `Weniger als bisher: ${minutesChange(previous.previous_minutes, minutes)}`
          : reasons[0];
    const footer = (
      <div className="flex flex-col gap-2">
        {page.art === 'times' && previous && minutes !== null && !(weekPage && reason) ? (
          <p className="text-ink text-sm" aria-live="polite">
            {kind === 'once' ? 'Arbeitszeit' : 'In der Woche'}{' '}
            <strong>{minutesChange(previous.previous_minutes, minutes)}</strong>
            {reasons.length === 0 && unchanged ? ' · noch nichts geändert' : null}
          </p>
        ) : null}
        {page.art === 'times' && reason ? (
          <Statusmeldung ton="fehler">{reason}</Statusmeldung>
        ) : null}
        {page.art === 'day' ? (
          <Button
            className="w-full"
            disabled={!current || dayInvalid(page.day)}
            onClick={() => goBack()}
          >
            Übernehmen
          </Button>
        ) : (
          <Button
            className="w-full"
            disabled={loading || !complete}
            onClick={() => setFlow(weiter(flow, { art: 'summary' }, true))}
          >
            Weiter
          </Button>
        )}
      </div>
    );

    if (page.art === 'day') {
      const day = page.day;
      const before = previousWeek[day] ?? [];
      const dayBlocks = current?.week[day] ?? before;
      const form = current?.dayForms[day] ?? formFromBlocks(dayBlocks);
      return (
        <GefuehrterAblauf
          {...common}
          titel={`${WEEKDAY_NAME[day]}s ab ${onDate ? dateDayMonth(onDate) : ''}`}
          fuss={footer}
        >
          <div className="flex flex-col gap-4">
            <p className="text-ink-muted text-sm">Bisher: {dayText(before)}</p>
            {form ? (
              <DayEditor
                id={`tag-${day}`}
                form={form}
                previous={before}
                freeAllowed
                onChange={(next) => {
                  const nextBlocks = blocksFromForm(next);
                  // Unvollständiges bleibt im Formular stehen, bis es passt;
                  // der Wochenplan nimmt nur ganze Tage.
                  updateDraft({
                    week: { ...(current?.week ?? {}), [day]: nextBlocks ?? dayBlocks },
                    dayForms: { ...(current?.dayForms ?? {}), [day]: next },
                  });
                }}
              />
            ) : (
              <p className="text-ink text-liste">
                Dieser Tag hat mehr als eine Pause – ihn ändert die Praxisleitung in der Planung.
              </p>
            )}
          </div>
        </GefuehrterAblauf>
      );
    }

    return (
      <GefuehrterAblauf
        {...common}
        titel={
          kind === 'once'
            ? `Ihre Zeiten am ${onDate ? dateLong(onDate) : ''}`
            : `Wochenplan ab ${onDate ? dateDayMonth(onDate) : ''}`
        }
        fuss={footer}
      >
        {/* Laden, Funkloch und Abweisung der bisherigen Zeiten über den Baustein
            (Regel 8): mit „Erneut versuchen“ auf derselben Seite, Art und Tag
            bleiben stehen (Praxis-Review Überholung 8). */}
        <Abfragezustand
          abfrage={baseline}
          laden="Bisherige Zeiten werden geladen …"
          fehler={BASELINE_ERROR}
          endgueltig={{
            wenn: (error) => error instanceof Error && error.message !== BASELINE_ERROR,
            titel: baseline.error instanceof Error ? baseline.error.message : BASELINE_ERROR,
          }}
        >
          {() =>
            !current ? null : kind === 'once' ? (
              <div className="flex flex-col gap-4">
                <p className="text-ink-muted text-sm">Bisher: {dayText(previousDay)}</p>
                {current.day ? (
                  <DayEditor
                    id="tag"
                    form={current.day}
                    previous={previousDay}
                    freeAllowed={false}
                    onChange={(next) => updateDraft({ day: next })}
                  />
                ) : (
                  <p className="text-ink text-liste">
                    Dieser Tag hat mehr als eine Pause – ihn ändert die Praxisleitung in der
                    Planung.
                  </p>
                )}
              </div>
            ) : (
              <ListRows rahmen={false} beschriftung="Wochenplan">
                {WEEKDAYS.map((day) => {
                  const dayBlocks = current.week[day] ?? [];
                  const changed = !sameBlocks(dayBlocks, previousWeek[day] ?? []);
                  // Was gegen den Tag spricht, steht an seiner Zeile - auch an
                  // einem unveränderten (Praxis-Review Überholung 8).
                  const problem = weekDayProblems(current.week, day)[0];
                  return (
                    // Die ganze Zeile ist das Ziel, einzeilig und dicht: sieben
                    // Tage ohne Rollen (Design- und Praxis-Review Überholung 8).
                    <ListRow
                      key={day}
                      dicht
                      titel={`${WEEKDAY_NAME[day]} ${blocksText(dayBlocks)}`}
                      status={
                        problem ? (
                          <Badge ton="kritisch">{PROBLEM_SHORT[problem]}</Badge>
                        ) : changed ? (
                          <Badge ton="akzent">geändert</Badge>
                        ) : undefined
                      }
                      gedaempft={dayBlocks.length === 0}
                      onClick={() => setFlow(weiter(flow, { art: 'day', day }))}
                    />
                  );
                })}
              </ListRows>
            )
          }
        </Abfragezustand>
      </GefuehrterAblauf>
    );
  }

  // ---------------------------------------------------------------------------
  // Zusammenfassung
  const changedDays = kind === 'permanent' && newWeek ? changedWeekdays(previousWeek, newWeek) : [];
  // Zurück aus „Ändern“ kann die Änderung wieder unvollständig sein - dann
  // sagt der Fuß, warum der Knopf ruht, statt still zu warten.
  const localReasons = complete ? [] : reasons.length > 0 ? reasons : ['Noch nichts geändert.'];

  /**
   * Die Termine außerhalb der neuen Zeiten - erst mit der Vorschau des Servers.
   * Je Tag die Zahl; umplanen wird, wer genehmigt (Praxis-Review Überholung 8).
   * Beim Antrag sagt das die Zeile „Entscheidet“, damit beide Zeilen auch im
   * ungünstigsten Fall kurz bleiben (BEF-219).
   */
  const outsideDays = complete && preview.data ? preview.data.appointment_days : null;
  const outside = outsideDays?.reduce((sum, d) => sum + d.appointments, 0) ?? 0;
  const appointmentsRow = (days: readonly { on_date: string; appointments: number }[]) => (
    <ListRow
      titel={
        outside === 0
          ? 'Keine Termine außerhalb der neuen Zeiten'
          : `${outside} ${outside === 1 ? 'Termin' : 'Termine'} außerhalb der neuen Zeiten`
      }
      meta={
        outside === 0
          ? undefined
          : self
            ? `${appointmentDaysText(days)} · nach dem Eintragen umplanen`
            : appointmentDaysText(days)
      }
    />
  );

  return (
    <GefuehrterAblauf
      {...common}
      titel={`${mainButton}?`}
      abschluss
      fuss={
        <div className="flex flex-col gap-2">
          {submit.isError ? (
            <Statusmeldung ton="fehler">
              {submit.error instanceof Error
                ? submit.error.message
                : 'Der Antrag konnte nicht gesendet werden.'}
            </Statusmeldung>
          ) : null}
          {serverReasons.length > 0 ? (
            <Statusmeldung ton="fehler">{serverReasons.join(' ')}</Statusmeldung>
          ) : null}
          {localReasons.length > 0 ? (
            <Statusmeldung ton="fehler">{localReasons.join(' ')}</Statusmeldung>
          ) : null}
          <Button
            className="w-full"
            disabled={submit.isPending || !complete || !preview.data || serverReasons.length > 0}
            onClick={() => submit.mutate()}
          >
            {submit.isPending ? 'Wird gesendet …' : mainButton}
          </Button>
        </div>
      }
    >
      {/* Was am Gerät feststeht, bleibt mit „Ändern“ stehen; die Termine kommen mit
          der Vorschau in dieselbe Liste. Laden, Funkloch und Abweisung der
          Vorschau zeigt der Baustein darunter (Regel 8, Design-Review
          Überholung 8) - ein Fehler ist nie „keine Termine außerhalb“. */}
      <div className="flex flex-col">
        <ListRows rahmen={false} beschriftung="Änderung">
          {/* Die Stunden stehen an der Zeile des Datums - eine Zeile weniger, damit
              der Abschluss auch mit Terminen außerhalb nicht rollt. */}
          <ListRow
            titel={
              kind === 'permanent' && onDate
                ? `Wochenplan ab ${dateDayMonth(onDate)}`
                : kind && onDate
                  ? changeTitle(kind, onDate)
                  : ''
            }
            meta={
              previous && minutes !== null
                ? `${kind === 'once' ? 'Am Tag' : 'In der Woche'} ${minutesChange(
                    previous.previous_minutes,
                    minutes,
                  )}`
                : undefined
            }
            aktion={
              <Button
                variant="secondary"
                groesse="kompakt"
                aria-label="Datum ändern"
                onClick={() => setFlow(aendern(flow, { art: 'date' }))}
              >
                Ändern
              </Button>
            }
          />
          {kind === 'once' && newDay ? (
            <ListRow
              titel={blocksText(newDay)}
              meta={`bisher ${blocksText(previousDay)}`}
              aktion={
                <Button
                  variant="secondary"
                  groesse="kompakt"
                  aria-label="Zeiten ändern"
                  onClick={() => setFlow(aendern(flow, { art: 'times' }))}
                >
                  Ändern
                </Button>
              }
            />
          ) : null}
          {changedDays.map((day) => (
            <ListRow
              key={day}
              titel={`${WEEKDAY_NAME[day]} ${blocksText(newWeek?.[day] ?? [])}`}
              meta={`bisher ${blocksText(previousWeek[day] ?? [])}`}
              aktion={
                <Button
                  variant="secondary"
                  groesse="kompakt"
                  aria-label={`${WEEKDAY_NAME[day]} ändern`}
                  onClick={() => setFlow(aendern(flow, { art: 'day', day }))}
                >
                  Ändern
                </Button>
              }
            />
          ))}
          {outsideDays ? appointmentsRow(outsideDays) : null}
          <ListRow
            titel={self ? 'Sie tragen die Änderung selbst ein' : 'Entscheidet'}
            meta={
              self
                ? `Sie gilt ${kind === 'once' ? 'für den Tag' : 'ab dem Datum'} sofort.`
                : outside > 0
                  ? `${roleLabels.owner}, plant nach dem Genehmigen um`
                  : roleLabels.owner
            }
          />
        </ListRows>
        {/* Nur Laden und Fehler der Vorschau brauchen hier Abstand; sonst folgt
            „Grund angeben“ der Liste wie eine weitere Zeile (BEF-219). */}
        <div className="my-4 empty:hidden">
          {complete ? (
            <Abfragezustand
              abfrage={preview}
              laden="Termine werden geprüft …"
              fehler={PREVIEW_ERROR}
              endgueltig={{
                wenn: (error) => error instanceof Error && error.message !== PREVIEW_ERROR,
                titel: preview.error instanceof Error ? preview.error.message : PREVIEW_ERROR,
              }}
            >
              {() => null}
            </Abfragezustand>
          ) : null}
        </div>
        <Disclosure summary="Grund angeben" offen={message !== ''}>
          <TextArea
            label="Grund – für die Praxisleitung, freiwillig"
            value={message}
            maxLength={500}
            rows={3}
            onChange={(e) => setMessage(e.target.value)}
          />
        </Disclosure>
      </div>
    </GefuehrterAblauf>
  );
}
