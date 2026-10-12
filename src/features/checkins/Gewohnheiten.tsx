import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { formatDate } from '@/lib/datum';
import { GEWOHNHEIT_TEXT_MAX, gewohnheitSatz, tagesreihe } from '@/lib/gewohnheiten';
import {
  checkinsKey,
  gewohnheitBeenden,
  gewohnheitEintragen,
  type CheckinDaten,
  type PraxisGewohnheit,
  type Verhaeltnisart,
} from './api';

/** So viele Tage zeigt die Praxis je Gewohnheit (ANN-370). */
const TAGE_IN_DER_PRAXIS = 28;

/**
 * Gewohnheiten in „Zwischen den Terminen“ (ALT-003, IDEA-ALT-002): mit der
 * Person vereinbart, mit Auslöser statt als Vorsatz, und die Tage, an denen
 * sie sie vermerkt hat.
 *
 * Keine Serie, keine Quote, keine Farbe als Urteil (ADR-006 Punkt 11): Die
 * Tage stehen als Punkte nebeneinander; ein leerer Punkt heißt nur „nicht
 * vermerkt“. Pausiert ist ein Zustand der Person, kein Abbruch.
 */
export function Gewohnheiten({
  art,
  verhaeltnisId,
  daten,
}: {
  art: Verhaeltnisart;
  verhaeltnisId: string;
  daten: CheckinDaten;
}) {
  const laufend = daten.habits.filter((g) => g.ended_at === null);
  const beendet = daten.habits.filter((g) => g.ended_at !== null);
  return (
    <section aria-labelledby="gewohnheiten" className="mt-6 flex flex-col gap-3">
      <h3 id="gewohnheiten" className="text-ink text-base font-semibold">
        Gewohnheiten
      </h3>
      <p className="text-ink-muted max-w-prose text-sm">
        Wenige, sehr kleine Gewohnheiten, an eine bestehende Handlung gekoppelt. Die Person vermerkt
        die Tage selbst; es gibt keine Serie und keine Erinnerung.
      </p>
      {laufend.length === 0 ? (
        <p className="text-ink-muted text-sm">Keine Gewohnheit vereinbart.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {laufend.map((g) => (
            <Eintrag
              key={g.id}
              gewohnheit={g}
              heute={daten.today}
              art={art}
              verhaeltnisId={verhaeltnisId}
              beendbar={daten.can_write}
            />
          ))}
        </ul>
      )}
      {daten.habits_writable && laufend.length < daten.habits_max ? (
        <Eintragen art={art} verhaeltnisId={verhaeltnisId} />
      ) : daten.habits_writable ? (
        <p className="text-ink-muted text-sm">
          Es laufen {daten.habits_max} Gewohnheiten – mehr werden es nicht, damit sie klein bleiben.
        </p>
      ) : null}
      {beendet.length > 0 ? (
        <details className="text-sm">
          <summary className="text-ink cursor-pointer py-2">Beendet ({beendet.length})</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {beendet.map((g) => (
              <li key={g.id} className="text-ink-muted">
                {gewohnheitSatz(g)} · {formatDate(g.starts_on)} bis{' '}
                {formatDate(g.ended_at!.slice(0, 10))}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function Eintrag({
  gewohnheit,
  heute,
  art,
  verhaeltnisId,
  beendbar,
}: {
  gewohnheit: PraxisGewohnheit;
  heute: string;
  art: Verhaeltnisart;
  verhaeltnisId: string;
  beendbar: boolean;
}) {
  const queryClient = useQueryClient();
  const [fehler, setFehler] = useState<string | undefined>(undefined);
  // Vor dem Eintragen gibt es nichts zu vermerken - diese Tage fehlen.
  const reihe = tagesreihe(
    heute,
    TAGE_IN_DER_PRAXIS,
    gewohnheit.marks,
    gewohnheit.starts_on,
  ).filter((t) => !t.vorBeginn);
  return (
    <li className="flex flex-col gap-2">
      <p className="text-ink">
        <span className="font-semibold">{gewohnheit.cue}:</span> {gewohnheit.action}
        {gewohnheit.place ? <span className="text-ink-muted"> · {gewohnheit.place}</span> : null}
      </p>
      <p className="text-ink-muted text-sm">
        Seit {formatDate(gewohnheit.starts_on)}
        {gewohnheit.paused && gewohnheit.paused_at
          ? ` · pausiert seit ${formatDate(gewohnheit.paused_at.slice(0, 10))}`
          : ''}
      </p>
      {/* ANN-370: Punkte je Tag, kein Zählwerk, keine Serie. */}
      <ol
        aria-label={`Tage bis heute, höchstens ${TAGE_IN_DER_PRAXIS}`}
        className="flex flex-wrap gap-1"
      >
        {reihe.map((t) => (
          <li
            key={t.datum}
            title={formatDate(t.datum)}
            className={
              t.vermerkt
                ? 'bg-ink h-3 w-3 rounded-full'
                : 'border-ink-muted h-3 w-3 rounded-full border'
            }
          >
            <span className="sr-only">
              {formatDate(t.datum)}: {t.vermerkt ? 'vermerkt' : 'nicht vermerkt'}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-ink-muted text-xs">
        Ein Punkt je Tag, heute rechts · gefüllt: vermerkt · leer: nicht vermerkt
      </p>
      {beendbar ? (
        <div>
          <Rueckfrage
            ausloeser="Beenden"
            ausloeserVariante="quiet"
            bezeichnung={`Gewohnheit „${gewohnheit.action}“ beenden`}
            bestaetigen="Gewohnheit beenden"
            bestaetigenLaeuft="Wird beendet …"
            fehler={fehler}
            onAbbrechen={() => setFehler(undefined)}
            onBestaetigen={async () => {
              setFehler(undefined);
              await gewohnheitBeenden(gewohnheit.id).catch((grund: Error) => {
                setFehler(grund.message);
                throw grund;
              });
              await queryClient.invalidateQueries({ queryKey: checkinsKey(art, verhaeltnisId) });
            }}
          >
            Die Person sieht die Gewohnheit nicht mehr. Die vermerkten Tage bleiben hier stehen.
          </Rueckfrage>
        </div>
      ) : null}
    </li>
  );
}

function Eintragen({ art, verhaeltnisId }: { art: Verhaeltnisart; verhaeltnisId: string }) {
  const queryClient = useQueryClient();
  const [offen, setOffen] = useState(false);
  const [was, setWas] = useState('');
  const [ausloeser, setAusloeser] = useState('');
  const [wo, setWo] = useState('');
  const [fehler, setFehler] = useState<{
    was?: string | undefined;
    ausloeser?: string | undefined;
  }>({});
  const eintragen = useMutation({
    mutationFn: () => gewohnheitEintragen({ art, verhaeltnisId, was, ausloeser, wo }),
    onSuccess: async () => {
      setWas('');
      setAusloeser('');
      setWo('');
      setOffen(false);
      await queryClient.invalidateQueries({ queryKey: checkinsKey(art, verhaeltnisId) });
    },
  });

  if (!offen) {
    return (
      <div>
        <Button variant="secondary" onClick={() => setOffen(true)}>
          Gewohnheit eintragen
        </Button>
      </div>
    );
  }

  function absenden(event: FormEvent) {
    event.preventDefault();
    if (eintragen.isPending) return;
    const neu = {
      ...(ausloeser.trim() === '' ? { ausloeser: 'Bitte den Auslöser angeben.' } : {}),
      ...(was.trim() === '' ? { was: 'Bitte angeben, was die Person tut.' } : {}),
    };
    setFehler(neu);
    if (neu.was || neu.ausloeser) return;
    eintragen.mutate();
  }

  return (
    <form
      onSubmit={absenden}
      noValidate
      aria-label="Gewohnheit eintragen"
      className="flex max-w-xl flex-col gap-3"
    >
      <Field
        label="Wann – nach welcher Handlung?"
        hint="Eine bestehende Handlung als Auslöser, etwa „Nach dem Zähneputzen“."
        maxLength={GEWOHNHEIT_TEXT_MAX}
        value={ausloeser}
        required
        error={fehler.ausloeser}
        onChange={(e) => {
          setAusloeser(e.target.value);
          setFehler((bisher) => ({ ...bisher, ausloeser: undefined }));
        }}
      />
      <Field
        label="Was – sehr klein und konkret"
        hint="Etwa „zwei Minuten Mobilität“ oder „eine Treppe statt Aufzug“."
        maxLength={GEWOHNHEIT_TEXT_MAX}
        value={was}
        required
        error={fehler.was}
        onChange={(e) => {
          setWas(e.target.value);
          setFehler((bisher) => ({ ...bisher, was: undefined }));
        }}
      />
      <Field
        label="Wo (optional)"
        maxLength={GEWOHNHEIT_TEXT_MAX}
        value={wo}
        onChange={(e) => setWo(e.target.value)}
      />
      {eintragen.isError ? (
        <Statusmeldung ton="fehler">{eintragen.error.message}</Statusmeldung>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" disabled={eintragen.isPending}>
          {eintragen.isPending ? 'Wird gespeichert …' : 'Eintragen'}
        </Button>
        <Button type="button" variant="quiet" onClick={() => setOffen(false)}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}
