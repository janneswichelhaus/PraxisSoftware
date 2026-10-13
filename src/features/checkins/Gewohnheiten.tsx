import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Zwischentitel } from '@/components/ui/Zwischentitel';
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
    // Eine Gruppe in der Karte „Zwischen den Terminen“, durch eine Linie
    // abgesetzt - kein eigener Kasten (Leitfaden L2).
    <section
      aria-labelledby="gewohnheiten"
      className="border-line mt-6 flex flex-col gap-3 border-t pt-4"
    >
      <Zwischentitel id="gewohnheiten">Gewohnheiten</Zwischentitel>
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
        <Disclosure summary="Beendet" anzahl={beendet.length}>
          <ul className="flex flex-col gap-1 text-sm">
            {beendet.map((g) => (
              <li key={g.id} className="text-ink-muted">
                {gewohnheitSatz(g)} · {formatDate(g.starts_on)} bis{' '}
                {formatDate(g.ended_at!.slice(0, 10))}
              </li>
            ))}
          </ul>
        </Disclosure>
      ) : null}
      {/* Was die Person sieht und was nicht geschieht - als Kleingedrucktes
          statt als Erklärsatz unter dem Titel (DESIGN.md Regel 6). */}
      <Kleingedrucktes>
        Wenige, sehr kleine Gewohnheiten, an eine bestehende Handlung gekoppelt. Die Person vermerkt
        die Tage selbst; es gibt keine Serie und keine Erinnerung.
      </Kleingedrucktes>
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
  // Wie recorded_by_kind am Check-in (Zweitreview S1).
  const vertretung = new Set(gewohnheit.marks_by_representative);
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
          ? ` · pausiert seit ${formatDate(gewohnheit.paused_at.slice(0, 10))}${
              gewohnheit.paused_by_kind === 'legal_representative' ? ' (Vertretung)' : ''
            }`
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
                ? 'bg-ink rounded-pill h-3 w-3'
                : 'border-ink-muted rounded-pill h-3 w-3 border'
            }
          >
            <span className="sr-only">
              {formatDate(t.datum)}:{' '}
              {t.vermerkt
                ? vertretung.has(t.datum)
                  ? 'vermerkt von der Vertretung'
                  : 'vermerkt'
                : 'nicht vermerkt'}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-ink-muted text-xs">
        Ein Punkt je Tag, heute rechts · gefüllt: vermerkt · leer: nicht vermerkt
        {gewohnheit.marks_by_representative.length > 0 ? ' · teils von der Vertretung' : ''}
      </p>
      {beendbar ? (
        <div>
          <Rueckfrage
            ausloeser="Beenden"
            ausloeserVariante="quiet"
            ausloeserGroesse="kompakt"
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
        <Button variant="secondary" groesse="kompakt" onClick={() => setOffen(true)}>
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
      className="max-w-formular flex flex-col gap-3"
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
      <Formularfuss>
        <Button type="submit" disabled={eintragen.isPending}>
          {eintragen.isPending ? 'Wird gespeichert …' : 'Eintragen'}
        </Button>
        <Button type="button" variant="quiet" onClick={() => setOffen(false)}>
          Abbrechen
        </Button>
      </Formularfuss>
    </form>
  );
}
