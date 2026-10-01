import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { kartenAktionKlassen } from '@/components/ui/buttonStile';
import { Aufklappzeichen } from '@/components/ui/Card';
import { aufklappKopfKlassen } from '@/components/ui/aufklappStile';
import {
  appointmentTypeHint,
  formatLocalTimeRange,
  notificationChannelLabels,
  todayInTimeZone,
} from '@/features/appointments/api';
import { tagePlus } from '@/features/appointments/calendar';
import { formatDatum } from '@/features/preview/format';
import type { CurrentUser } from '@/features/session/types';
import { mitRueckweg } from '@/lib/rueckweg';
import { telHref } from '@/lib/telefon';
import {
  CALL_LIST_KEY,
  fetchCallList,
  recordCallOutcome,
  stillToCall,
  type CallEntry,
  type CallOutcome,
} from './call-list-api';

const TAG = /^\d{4}-\d{2}-\d{2}$/;

const outcomeLabels: Record<'not_reached' | 'voicemail', string> = {
  not_reached: 'Nicht erreicht',
  voicemail: 'Nachricht hinterlassen',
};

function CallRow({ entry, zurueck }: { entry: CallEntry; zurueck: string }) {
  const queryClient = useQueryClient();
  const vermerken = useMutation({
    mutationFn: (outcome: CallOutcome) => recordCallOutcome(entry.appointment_id, outcome),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: CALL_LIST_KEY });
    },
  });
  const nummern = [
    entry.phone ? { label: 'Tel.', nummer: entry.phone } : null,
    entry.phone_mobile ? { label: 'Mobil', nummer: entry.phone_mobile } : null,
  ].filter((n): n is { label: string; nummer: string } => n !== null);
  const mitgeteilt = !stillToCall(entry);
  const laeuft = vermerken.isPending;
  const name = `${entry.patient_given_name} ${entry.patient_family_name}`;

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-ink text-liste font-semibold tabular-nums">
          {formatLocalTimeRange(entry.starts_at, entry.ends_at, entry.organization_time_zone)}
          <span className="text-ink font-medium"> · </span>
          <Link
            to={mitRueckweg(`/patienten/${entry.patient_id}`, zurueck)}
            className="text-accent font-medium hover:underline"
          >
            {name}
          </Link>
        </p>
        {/* Der Abschnitt sagt schon „Schon mitgeteilt" bzw. „Anzurufen":
            das Abzeichen nennt nur den Weg bzw. den Ausgang; „Offen" als
            Regelfall entfällt (UX-005h). */}
        {mitgeteilt ? (
          <Badge ton="positiv">
            {entry.notified_channels.map((k) => notificationChannelLabels[k].kurz).join(', ')}
          </Badge>
        ) : entry.call_outcome ? (
          <Badge ton="warnung">
            {outcomeLabels[entry.call_outcome]}
            {entry.call_attempts && entry.call_attempts > 1 ? ` (${entry.call_attempts}×)` : ''}
          </Badge>
        ) : null}
      </div>
      <p className="text-ink-muted text-sm">
        {/* Nur eine abweichende Terminart steht dran (ANN-192). */}
        {[
          appointmentTypeHint(entry.appointment_type),
          entry.location_name,
          entry.staff_name ? `bei ${entry.staff_name}` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
        {entry.call_outcome && entry.call_recorded_by_name
          ? ` · zuletzt angerufen von ${entry.call_recorded_by_name}`
          : ''}
      </p>
      <div className="flex flex-wrap gap-2">
        {nummern.length === 0 ? (
          <span className="text-ink-muted text-sm">Keine Rufnummer hinterlegt</span>
        ) : (
          nummern.map((n) => (
            <a key={n.label} href={telHref(n.nummer)} className={kartenAktionKlassen()}>
              <span className="text-ink-muted">{n.label}</span>
              <span className="tabular-nums">{n.nummer}</span>
            </a>
          ))
        )}
      </div>
      {mitgeteilt ? null : (
        <div className="flex flex-wrap gap-2" role="group" aria-label={`Anruf bei ${name}`}>
          {/* Sekundär wie die übrigen: ein Hauptknopf je Ansicht, und die
              Liste trägt viele Zeilen (Bedienprinzipien, UX-EPIC-002). */}
          <Button
            type="button"
            variant="secondary"
            groesse="kompakt"
            disabled={laeuft}
            onClick={() => vermerken.mutate('reached')}
          >
            Erreicht, bestätigt
          </Button>
          <Button
            type="button"
            variant="secondary"
            groesse="kompakt"
            disabled={laeuft}
            onClick={() => vermerken.mutate('not_reached')}
          >
            Nicht erreicht
          </Button>
          <Button
            type="button"
            variant="secondary"
            groesse="kompakt"
            disabled={laeuft}
            onClick={() => vermerken.mutate('voicemail')}
          >
            Nachricht hinterlassen
          </Button>
          {entry.call_outcome ? (
            <Button
              type="button"
              variant="quiet"
              groesse="kompakt"
              disabled={laeuft}
              onClick={() => vermerken.mutate('cleared')}
            >
              Zurücksetzen
            </Button>
          ) : null}
        </div>
      )}
      {vermerken.isError ? (
        <Statusmeldung ton="fehler">{vermerken.error.message}</Statusmeldung>
      ) : null}
    </li>
  );
}

/**
 * Anrufliste (PRX-014): wen das Büro vor einem Tag anruft, um den Termin zu
 * bestätigen. Der Stand bleibt gespeichert - wer zu zweit telefoniert oder
 * zwischendurch etwas anderes tut, fängt nicht von vorn an.
 *
 * Wer schon mitgeteilt ist (Zettel, persönlich, telefonisch), steht unten und
 * braucht keinen Anruf. Versendet wird nichts (B15).
 */
export function CallListPage({ user }: { user: CurrentUser }) {
  const zeitzone = user.organizationTimeZone ?? 'Europe/Berlin';
  const heute = todayInTimeZone(zeitzone);
  const [suche, setSuche] = useSearchParams();
  const param = suche.get('datum');
  const datum = param && TAG.test(param) ? param : tagePlus(heute, 1);
  const hier = `/offen/anrufe?datum=${datum}`;

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: [...CALL_LIST_KEY, datum],
    queryFn: () => fetchCallList(datum),
    retry: false,
  });

  const anzurufen = (data ?? []).filter(stillToCall);
  const erledigt = (data ?? []).filter((entry) => !stillToCall(entry));

  function wechseln(tage: number) {
    setSuche({ datum: tagePlus(datum, tage) }, { replace: true });
  }

  return (
    <>
      <Rueckweg standard="/offen" beschriftung="Zurück zu den offenen Punkten" />
      <PageHeader
        title="Anrufliste"
        description={`${datum === tagePlus(heute, 1) ? 'Morgen, ' : ''}${formatDatum(datum)}`}
      />
      <div className="lg:max-w-3xl">
        <div className="mb-4 flex flex-wrap gap-2">
          <Button type="button" variant="secondary" groesse="kompakt" onClick={() => wechseln(-1)}>
            Vorheriger Tag
          </Button>
          <Button type="button" variant="secondary" groesse="kompakt" onClick={() => wechseln(1)}>
            Nächster Tag
          </Button>
        </div>

        {isPending ? <LoadingState label="Anrufliste wird geladen …" /> : null}
        {isError ? (
          <ErrorState
            title="Die Anrufliste konnte nicht geladen werden."
            description="Bitte die Verbindung prüfen und erneut versuchen."
            onErneut={() => refetch()}
          />
        ) : null}
        {data && data.length === 0 ? (
          <p className="text-ink-muted text-sm">An diesem Tag stehen keine Behandlungstermine.</p>
        ) : null}

        {anzurufen.length > 0 ? (
          <section aria-labelledby="anrufen">
            <h2
              id="anrufen"
              className="text-ink-muted tracking-label mb-2 text-xs font-semibold uppercase"
            >
              Anzurufen ({anzurufen.length})
            </h2>
            <ul className="divide-line border-line bg-surface rounded-card divide-y border px-4 sm:px-5">
              {anzurufen.map((entry) => (
                <CallRow key={entry.appointment_id} entry={entry} zurueck={hier} />
              ))}
            </ul>
          </section>
        ) : data && data.length > 0 ? (
          <Statusmeldung ton="erfolg">Alle Termine dieses Tages sind mitgeteilt.</Statusmeldung>
        ) : null}

        {erledigt.length > 0 ? (
          <section aria-labelledby="mitgeteilt" className="mt-6">
            <h2
              id="mitgeteilt"
              className="text-ink-muted tracking-label mb-2 text-xs font-semibold uppercase"
            >
              Schon mitgeteilt ({erledigt.length})
            </h2>
            <ul className="divide-line border-line bg-surface rounded-card divide-y border px-4 sm:px-5">
              {erledigt.map((entry) => (
                <CallRow key={entry.appointment_id} entry={entry} zurueck={hier} />
              ))}
            </ul>
          </section>
        ) : null}

        {/* Nachschlagetext, einmal gelernt - zugeklappt statt auf jeder
            Liste (UX-005h). */}
        <details className="group mt-8 max-w-prose">
          <summary className={`${aufklappKopfKlassen} text-ink-muted hover:text-ink text-sm`}>
            <Aufklappzeichen />
            Was wird gespeichert?
          </summary>
          <p className="text-ink-muted mt-1 text-xs leading-relaxed">
            „Erreicht, bestätigt“ vermerkt am Termin „telefonisch mitgeteilt“. „Nicht erreicht“ und
            „Nachricht hinterlassen“ gelten nur für diesen Termin und werden zwei Wochen danach
            gelöscht. Die Anwendung ruft nicht an und versendet nichts.
          </p>
        </details>
      </div>
    </>
  );
}
