import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { mitRueckweg, RUECKWEG_PARAM } from '@/lib/rueckweg';
import { canManageAppointments, type CurrentUser } from '@/features/session/types';
import { EreignisArbeitszeitRueckfrage, EreignisFormFields } from './EreignisFormFields';
import {
  appointmentStatusLabels,
  appointmentToFormValues,
  ereignisFormSchema,
  fetchAppointment,
  fetchEventParticipants,
  fetchEventSeries,
  fetchLocations,
  istAusserhalbArbeitszeit,
  updateAppointmentEvent,
  updateEventSeries,
  type EreignisFormValues,
} from './api';
import { formatDate } from '@/lib/datum';

/**
 * Das ganze Ereignis bearbeiten (CAL-017).
 *
 * Eine Besprechung steht in mehreren Kalendern, ist aber **ein** Vorgang.
 * Bezeichnung, Tag, Zeit, Länge, Art und Ort gelten für alle Beteiligten
 * zugleich; geändert werden sie deshalb hier und in einer einzigen
 * Transaktion. Der Server weist eine Verschiebung einer einzelnen Zeile ab —
 * eine Besprechung, die bei Anna um 9 und bei Tim um 10 steht, gibt es nicht.
 *
 * **Was hier nicht geändert wird: wer teilnimmt.** Das ist eine Teilnahme und
 * kein Ereignis, und die Unterscheidung soll sichtbar bleiben. Wer eine
 * Teilnahme austauschen oder absagen will, tut das am einzelnen Termin; die
 * Liste unten führt den Weg dorthin.
 *
 * **Gehört das Ereignis zu einer Dauerfehlzeit (CAL-021)**, kommt eine dritte
 * Unterscheidung dazu, und sie steht ausdrücklich zur Wahl: dieses Vorkommen
 * oder die ganze Serie. Vorbelegt ist das Vorkommen — die kleinere Wirkung
 * ist die, die man versehentlich auslösen darf.
 */
type Feld = keyof EreignisFormValues;

export function EditEventPage({ user }: { user: CurrentUser }) {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const navigate = useNavigate();
  const [suche] = useSearchParams();
  const rueckweg = suche.get(RUECKWEG_PARAM);
  const queryClient = useQueryClient();

  const [werte, setWerte] = useState<EreignisFormValues | null>(null);
  const [fehler, setFehler] = useState<Partial<Record<Feld, string>>>({});
  const [umfang, setUmfang] = useState<'vorkommen' | 'serie'>('vorkommen');

  const termin = useQuery({
    queryKey: ['appointment', appointmentId],
    queryFn: () => fetchAppointment(appointmentId!),
    enabled: Boolean(appointmentId),
    retry: false,
  });

  const gruppeId = termin.data?.event_group_id ?? null;

  const beteiligte = useQuery({
    queryKey: ['event-participants', gruppeId],
    queryFn: () => fetchEventParticipants(gruppeId!),
    enabled: Boolean(gruppeId),
    retry: false,
  });

  const serieId = termin.data?.event_series_id ?? null;

  const serie = useQuery({
    queryKey: ['event-series', serieId],
    queryFn: () => fetchEventSeries(serieId!),
    enabled: Boolean(serieId),
    retry: false,
  });

  const standorte = useQuery({ queryKey: ['locations'], queryFn: fetchLocations, retry: false });

  // Einmal vorbelegen, nicht bei jedem Rendern: Sonst nähme ein Neuladen im
  // Hintergrund die halb getippte Änderung mit.
  useEffect(() => {
    const daten = termin.data;
    if (!daten || werte) return;
    // Dieselbe Umrechnung wie beim Termin - Ortszeit der Praxis, nicht die des
    // Geräts.
    const felder = appointmentToFormValues(daten);
    setWerte({
      title: daten.title ?? '',
      staff_member_ids: [],
      appointment_type: daten.appointment_type === 'video' ? 'video' : 'practice',
      date: felder.date,
      start_time: felder.start_time,
      end_time: felder.end_time,
      location_id: daten.location_id ?? '',
    });
  }, [termin.data, werte]);

  const mutation = useMutation({
    mutationFn: (eingabe: { werte: EreignisFormValues; bestaetigt: boolean }) =>
      umfang === 'serie'
        ? updateEventSeries(
            serieId!,
            serie.data?.[0]?.series_updated_at ?? '',
            eingabe.werte,
            eingabe.bestaetigt,
          )
        : updateAppointmentEvent(
            gruppeId!,
            beteiligte.data?.[0]?.group_updated_at ?? '',
            eingabe.werte,
            eingabe.bestaetigt,
          ),
    onSuccess: async () => {
      // Alle Zeilen sind gewandert - Kalender, Tagesplan und jede einzelne
      // Detailansicht zeigen sonst weiter den alten Stand.
      await queryClient.invalidateQueries({ queryKey: ['appointment'] });
      await queryClient.invalidateQueries({ queryKey: ['event-participants'] });
      await queryClient.invalidateQueries({ queryKey: ['event-series'] });
      await queryClient.invalidateQueries({ queryKey: ['appointments'] });
      await queryClient.invalidateQueries({ queryKey: ['day-plan'] });
      void navigate(mitRueckweg(`/termine/${appointmentId}`, rueckweg), { replace: true });
    },
  });

  function setzen<F extends Feld>(feld: F, wert: EreignisFormValues[F]) {
    setWerte((bisher) => (bisher ? { ...bisher, [feld]: wert } : bisher));
    if (fehler[feld]) setFehler((bisher) => ({ ...bisher, [feld]: undefined }));
    if (mutation.isError) mutation.reset();
  }

  function geprueft(): EreignisFormValues | null {
    if (!werte) return null;
    // Die Beteiligten stehen hier nicht zur Wahl; das Schema verlangt sie
    // trotzdem, also bekommt es die vorhandenen.
    const ergebnis = ereignisFormSchema.safeParse({
      ...werte,
      staff_member_ids: (beteiligte.data ?? []).map((b) => b.staff_member_id),
    });
    if (!ergebnis.success) {
      const gesammelt: Partial<Record<Feld, string>> = {};
      for (const problem of ergebnis.error.issues) {
        const feld = problem.path[0] as Feld | undefined;
        if (feld && !gesammelt[feld]) gesammelt[feld] = problem.message;
      }
      setFehler(gesammelt);
      return null;
    }
    setFehler({});
    return ergebnis.data;
  }

  if (!canManageAppointments(user.roles)) {
    return (
      <ErrorState
        title="Nicht freigegeben"
        description="Ereignisse bearbeiten dürfen die Rollen der Terminverwaltung."
      />
    );
  }

  if (termin.isPending || standorte.isPending) {
    return <LoadingState label="Ereignis wird geladen …" />;
  }

  if (termin.isError || !termin.data) {
    return (
      <ErrorState
        title="Nicht gefunden"
        description="Dieses Ereignis existiert nicht oder ist für Ihren Zugang nicht freigegeben."
      />
    );
  }

  const daten = termin.data;
  const zurueck = mitRueckweg(`/termine/${daten.id}`, rueckweg);

  if (daten.kind !== 'event' || !gruppeId) {
    return (
      <>
        <Link
          to={zurueck}
          className="text-ink-muted hover:text-ink mb-4 inline-flex min-h-11 items-center text-sm"
        >
          ← Zurück zum Termin
        </Link>
        <ErrorState
          title="Kein Ereignis"
          description={
            'Dieser Weg gilt für Ereignisse des Praxisbetriebs. Ein Behandlungstermin wird über „Bearbeiten" geändert.'
          }
        />
      </>
    );
  }

  if (daten.status !== 'confirmed') {
    return (
      <>
        <Link
          to={zurueck}
          className="text-ink-muted hover:text-ink mb-4 inline-flex min-h-11 items-center text-sm"
        >
          ← Zurück zum Ereignis
        </Link>
        <ErrorState
          title="Abgesagte Ereignisse werden nicht bearbeitet"
          description="Das Ereignis bleibt zur Nachvollziehbarkeit erhalten. Für einen neuen Zeitraum bitte ein neues Ereignis eintragen."
        />
      </>
    );
  }

  const ausserhalb = mutation.isError && istAusserhalbArbeitszeit(mutation.error);
  const serienVorkommen = serie.data ?? [];

  return (
    <>
      <Link
        to={zurueck}
        className="text-ink-muted hover:text-ink mb-4 inline-flex min-h-11 items-center text-sm"
      >
        ← Zurück zum Ereignis
      </Link>

      <PageHeader
        title={serieId ? 'Fehlzeit bearbeiten' : 'Ereignis bearbeiten'}
        description={
          serieId
            ? 'Bezeichnung, Zeit und Ort gelten für alle Beteiligten. Diese Fehlzeit gehört zu einer Dauerfehlzeit – der Umfang der Änderung steht unten zur Wahl.'
            : 'Bezeichnung, Zeit und Ort gelten für alle Beteiligten. Mit * markierte Felder sind erforderlich.'
        }
      />

      {werte ? (
        <form
          noValidate
          className="max-w-xl"
          onSubmit={(event) => {
            event.preventDefault();
            if (mutation.isPending) return;
            const geprueftesFormular = geprueft();
            if (geprueftesFormular) {
              mutation.mutate({ werte: geprueftesFormular, bestaetigt: false });
            }
          }}
        >
          <EreignisFormFields
            werte={werte}
            fehler={fehler}
            onChange={setzen}
            standorte={standorte.data ?? []}
            zeitzone={user.organizationTimeZone}
            rasterMinuten={user.appointmentGridMinutes}
            beteiligte={
              <div className="border-line bg-surface-sunken rounded-card border p-4">
                <p className="text-ink-muted text-sm">Beteiligte</p>
                {beteiligte.isPending ? (
                  <p className="text-ink-subtle mt-2 text-sm">Wird geladen …</p>
                ) : (
                  <ul className="mt-2 flex flex-col gap-1">
                    {(beteiligte.data ?? []).map((person) => (
                      <li
                        key={person.appointment_id}
                        className="text-ink flex flex-wrap items-center gap-2 text-[0.9375rem]"
                      >
                        <span>{person.display_name}</span>
                        {person.status === 'confirmed' ? null : (
                          <Badge ton="kritisch">{appointmentStatusLabels[person.status]}</Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-ink-subtle mt-3 text-xs leading-relaxed">
                  Wer teilnimmt, wird hier nicht geändert: Das ist eine einzelne Teilnahme und kein
                  Ereignis. Sie lässt sich am jeweiligen Termin austauschen oder absagen &ndash; das
                  Ereignis findet dann ohne diese Person statt.
                </p>
              </div>
            }
          />

          {/* Dieses Vorkommen oder die ganze Serie (CAL-021) - ausdrücklich
              beschriftet, wie schon „Ereignis bearbeiten" gegen „Teilnahme
              ändern". Vorbelegt ist das Vorkommen. */}
          {serieId && serienVorkommen.length > 0 ? (
            <fieldset className="border-line bg-surface-sunken rounded-card mt-6 border p-4">
              <legend className="text-ink px-1 text-sm font-medium">Umfang der Änderung</legend>
              <div className="mt-2 flex flex-col gap-3">
                <label className="flex cursor-pointer gap-3 text-[0.9375rem]">
                  <input
                    type="radio"
                    name="umfang"
                    className="mt-1"
                    checked={umfang === 'vorkommen'}
                    onChange={() => setUmfang('vorkommen')}
                  />
                  <span>
                    <span className="text-ink block font-medium">Nur diese Fehlzeit</span>
                    <span className="text-ink-muted block text-sm">
                      Am {formatDate(werte.date)}. Die übrigen Vorkommen der Serie bleiben, wie sie
                      sind.
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer gap-3 text-[0.9375rem]">
                  <input
                    type="radio"
                    name="umfang"
                    className="mt-1"
                    checked={umfang === 'serie'}
                    onChange={() => setUmfang('serie')}
                  />
                  <span>
                    <span className="text-ink block font-medium">Die ganze Serie</span>
                    <span className="text-ink-muted block text-sm">
                      Alle noch nicht begonnenen Vorkommen (von {serienVorkommen.length}). Die Tage
                      bleiben – geändert werden Bezeichnung, Uhrzeit, Länge, Art und Ort.
                    </span>
                  </span>
                </label>
              </div>
            </fieldset>
          ) : null}

          {ausserhalb ? (
            <EreignisArbeitszeitRueckfrage
              beschriftung="Trotzdem ändern"
              laeuft={mutation.isPending}
              onBestaetigen={() => {
                const geprueftesFormular = geprueft();
                if (geprueftesFormular) {
                  mutation.mutate({ werte: geprueftesFormular, bestaetigt: true });
                }
              }}
              onAbbrechen={() => mutation.reset()}
            />
          ) : null}

          {mutation.isError && !ausserhalb ? (
            <Statusmeldung ton="fehler" className="mt-5">
              {mutation.error.message}
            </Statusmeldung>
          ) : null}

          <div className="mt-8 flex flex-wrap gap-3">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending
                ? 'Wird geändert …'
                : umfang === 'serie'
                  ? 'Ganze Serie ändern'
                  : 'Änderungen speichern'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => void navigate(zurueck)}>
              Abbrechen
            </Button>
          </div>
        </form>
      ) : null}
    </>
  );
}
