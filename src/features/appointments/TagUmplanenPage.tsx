import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Section } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Card, CardGrid } from '@/components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { canManageAppointments, type CurrentUser } from '@/features/session/types';
import { fetchDayPlan, rufnummern, type DayPlanEntry } from '@/features/today/api';
import { Laengenzeichen } from './Laengenzeichen';
import { istIsoDatum } from './calendar';
import {
  appointmentStatusLabels,
  appointmentTypeLabels,
  cancellationReasonLabels,
  cancellationReasonSchema,
  cancelStaffDay,
  fetchAssignableTherapists,
  formatLocalDate,
  formatLocalTimeRange,
  type CancellationReason,
} from './api';

/**
 * Tag umplanen mit Anrufliste (CAL-009, IDEA-PRX-004).
 *
 * Der Anlass ist ein Ausfall am Morgen — ein Platten, ein krankes Kind. Sechs
 * Haushalte ohne Wartezimmer müssen abgesagt und angerufen werden, und beides
 * gehört auf eine Seite: erst absagen, dann der Reihe nach telefonieren.
 *
 * Zwei Dinge sind bewusst so und nicht anders:
 *
 *   * Die Absage ist **ein** Vorgang und läuft serverseitig alles-oder-nichts
 *     (`cancel_staff_day`). Ein halb umgeplanter Tag wäre schlimmer als ein
 *     gescheiterter Versuch.
 *   * Die Anrufliste liest den **bestehenden** Tagesplan-Lesepfad
 *     (`list_day_plan`, UX-001). Kein zweiter Weg zu denselben Rufnummern.
 *
 * Die Erledigt-Haken stehen nur im Arbeitsspeicher dieser Seite. Sie sind eine
 * Gedächtnisstütze für die nächste Viertelstunde, kein gespeicherter Zustand —
 * und die Seite sagt das auch.
 */

const UUID_MUSTER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** „1 Termin", aber „2 Termine" — eine Schaltfläche darf nicht falsch klingen. */
function terminWort(anzahl: number): string {
  return anzahl === 1 ? 'Termin' : 'Termine';
}

/**
 * Was „Tag umplanen" absagt.
 *
 * Nur Behandlungstermine: `cancel_staff_day` lässt Ereignisse des
 * Praxisbetriebs seit CAL-015b ausdrücklich stehen. Stünde eine Teambesprechung
 * in dieser Liste, versprächen Zählung und Vorschau eine Absage, die gar nicht
 * käme — und die Anrufliste danach hätte einen Eintrag ohne Rufnummer
 * (CAL-016).
 */
function istBetroffen(termin: DayPlanEntry): boolean {
  return termin.status === 'confirmed' && termin.kind === 'treatment';
}

/**
 * Wer nach dem Umplanen angerufen wird.
 *
 * Ein Ereignis hat niemanden, den man anrufen könnte - und es war gar nicht
 * abgesagt worden (CAL-016).
 */
function istAnzurufen(termin: DayPlanEntry): boolean {
  return termin.status === 'cancelled' && termin.kind === 'treatment';
}

function Anrufkarte({
  termin,
  erledigt,
  onErledigt,
}: {
  termin: DayPlanEntry;
  erledigt: boolean;
  onErledigt: (wert: boolean) => void;
}) {
  const zone = termin.organization_time_zone;
  const nummern = rufnummern(termin);

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-ink flex flex-wrap items-center gap-x-2 text-[0.9375rem] font-semibold tabular-nums">
          {formatLocalTimeRange(termin.starts_at, termin.ends_at, zone)}
          {/* §8.1: abweichende Länge gekennzeichnet (CAL-020). */}
          <Laengenzeichen termin={termin} />
        </p>
        <span className="text-ink-subtle text-xs">{appointmentStatusLabels[termin.status]}</span>
      </div>

      <p className="text-ink mt-1 text-[1.0625rem] font-medium">
        <Link to={`/patienten/${termin.patient_id}`} className="hover:text-accent hover:underline">
          {termin.patient_given_name} {termin.patient_family_name}
        </Link>
      </p>

      {nummern.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1">
          {nummern.map((nummer) => (
            <li key={nummer.href}>
              <a
                href={nummer.href}
                className="text-accent inline-flex min-h-11 items-center text-[0.9375rem] hover:underline"
              >
                {nummer.label}: {nummer.anzeige}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-subtle mt-2 text-sm">Keine Rufnummer hinterlegt.</p>
      )}

      <label className="text-ink mt-3 inline-flex min-h-11 items-center gap-2 text-[0.9375rem]">
        <input
          type="checkbox"
          checked={erledigt}
          onChange={(e) => onErledigt(e.target.checked)}
          className="border-line-strong text-accent size-5 rounded"
        />
        Angerufen
      </label>
    </Card>
  );
}

function Umplanung({
  staffMemberId,
  datum,
  user,
}: {
  staffMemberId: string;
  datum: string;
  user: CurrentUser;
}) {
  const queryClient = useQueryClient();
  const [grund, setGrund] = useState('');
  const [grundFehler, setGrundFehler] = useState<string | undefined>(undefined);
  const [erledigt, setErledigt] = useState<string[]>([]);
  const [abgesagt, setAbgesagt] = useState<number | null>(null);

  const darfUmplanen = canManageAppointments(user.roles);

  const tag = useQuery({
    queryKey: ['day-plan', datum, staffMemberId],
    queryFn: () => fetchDayPlan(datum, staffMemberId),
    retry: false,
  });

  const personen = useQuery({
    queryKey: ['assignable-therapists'],
    queryFn: fetchAssignableTherapists,
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: (gewaehlt: CancellationReason) => cancelStaffDay(staffMemberId, datum, gewaehlt),
    onSuccess: async (anzahl) => {
      setAbgesagt(anzahl);
      await queryClient.invalidateQueries({ queryKey: ['day-plan', datum, staffMemberId] });
      await queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
  });

  async function umplanen() {
    const gewaehlt = cancellationReasonSchema.safeParse(grund);
    if (!gewaehlt.success) {
      setGrundFehler('Bitte einen Absagegrund auswählen.');
      // Ohne den Wurf schlösse die Rückfrage sich trotz fehlender Angabe.
      throw new Error('Absagegrund fehlt');
    }
    setGrundFehler(undefined);
    await mutation.mutateAsync(gewaehlt.data);
  }

  const termine = tag.data ?? [];
  const betroffen = termine.filter(istBetroffen);
  const person = personen.data?.find((p) => p.staff_member_id === staffMemberId);
  const zone = termine[0]?.organization_time_zone;

  return (
    <>
      <PageHeader
        title="Tag umplanen"
        description={
          person
            ? `${person.display_name} · ${zone ? formatLocalDate(`${datum}T12:00:00Z`, zone) : datum}`
            : zone
              ? formatLocalDate(`${datum}T12:00:00Z`, zone)
              : datum
        }
      />

      {tag.isPending ? <LoadingState label="Der Tag wird geladen …" /> : null}
      {tag.isError ? <ErrorState title="Der Tag konnte nicht geladen werden." /> : null}

      {tag.isSuccess ? (
        <>
          {abgesagt === null ? (
            <Section titel={`Diese Termine werden abgesagt (${betroffen.length})`}>
              {betroffen.length === 0 ? (
                <EmptyState
                  title="Hier ist nichts umzuplanen."
                  description="An diesem Tag steht für diese Person kein bestätigter Termin. Abgeschlossene und bereits abgesagte Termine bleiben unberührt."
                />
              ) : (
                <>
                  <ul className="flex flex-col gap-1">
                    {betroffen.map((termin) => (
                      <li key={termin.id} className="text-ink text-[0.9375rem]">
                        <span className="tabular-nums">
                          {formatLocalTimeRange(
                            termin.starts_at,
                            termin.ends_at,
                            termin.organization_time_zone,
                          )}
                        </span>
                        {` · ${termin.patient_given_name} ${termin.patient_family_name}`}
                        {` · ${appointmentTypeLabels[termin.appointment_type]}`}{' '}
                        <Laengenzeichen termin={termin} />
                      </li>
                    ))}
                  </ul>

                  {darfUmplanen ? (
                    <div className="mt-5">
                      <div className="mb-3 max-w-xs">
                        <Select
                          label="Absagegrund"
                          value={grund}
                          error={grundFehler}
                          hint="Gilt für alle Termine dieses Tages."
                          onChange={(e) => {
                            setGrund(e.target.value);
                            setGrundFehler(undefined);
                          }}
                        >
                          <option value="">Bitte wählen</option>
                          {/* „Patient:in hat abgesagt" steht hier nicht: Der
                              Tag wird umgeplant, weil die behandelnde Person
                              ausfällt, und das ist praxisbedingt. Der Grund
                              hätte für jede Patient:in des Tages innerhalb der
                              Frist eine Ausfallgebühr vorgemerkt; seit CAL-016
                              weist ihn auch der Server ab (ADR-018 Fassung 2
                              Punkt 8.4). */}
                          {Object.entries(cancellationReasonLabels)
                            .filter(([wert]) => wert !== 'patient_request')
                            .map(([wert, beschriftung]) => (
                              <option key={wert} value={wert}>
                                {beschriftung}
                              </option>
                            ))}
                        </Select>
                      </div>

                      <Rueckfrage
                        ausloeser={`${betroffen.length} ${terminWort(betroffen.length)} absagen`}
                        bezeichnung="Tag umplanen"
                        bestaetigen="Ja, alle absagen"
                        bestaetigenLaeuft="Wird abgesagt …"
                        fehler={mutation.isError ? mutation.error.message : undefined}
                        laeuft={mutation.isPending}
                        onAbbrechen={() => setGrundFehler(undefined)}
                        onBestaetigen={umplanen}
                      >
                        Alle {betroffen.length} bestätigten {terminWort(betroffen.length)} dieses
                        Tages werden als abgesagt geführt. Sie bleiben vollständig erhalten und
                        geben ihre Zeiträume wieder frei. Eine Absage lässt sich nicht zurücknehmen
                        – danach steht die Anrufliste hier.
                      </Rueckfrage>
                    </div>
                  ) : (
                    <Statusmeldung className="mt-4">
                      Für das Absagen fehlt Ihrem Zugang die Berechtigung.
                    </Statusmeldung>
                  )}
                </>
              )}
            </Section>
          ) : (
            <Section titel={`Anrufliste (${termine.filter(istAnzurufen).length})`}>
              <Statusmeldung className="mb-4">
                {abgesagt === 1 ? 'Ein Termin ist abgesagt.' : `${abgesagt} Termine sind abgesagt.`}{' '}
                Jetzt anrufen.
              </Statusmeldung>

              <CardGrid>
                {termine.filter(istAnzurufen).map((termin) => (
                  <Anrufkarte
                    key={termin.id}
                    termin={termin}
                    erledigt={erledigt.includes(termin.id)}
                    onErledigt={(wert) =>
                      setErledigt((bisher) =>
                        wert ? [...bisher, termin.id] : bisher.filter((id) => id !== termin.id),
                      )
                    }
                  />
                ))}
              </CardGrid>

              <p className="text-ink-subtle mt-4 max-w-prose text-xs leading-relaxed">
                Die Haken gelten nur, solange diese Seite offen ist – sie werden nicht gespeichert.
              </p>
            </Section>
          )}
        </>
      ) : null}
    </>
  );
}

export function TagUmplanenPage({ user }: { user: CurrentUser }) {
  const [suche] = useSearchParams();
  const person = suche.get('person');
  const datum = suche.get('datum');

  // Ungültige Parameter fallen nicht still auf einen Standard zurück: „Tag
  // umplanen" ohne die richtige Person wäre der teuerste denkbare Irrtum.
  if (!person || !UUID_MUSTER.test(person) || !datum || !istIsoDatum(datum)) {
    return (
      <>
        <PageHeader title="Tag umplanen" />
        <ErrorState
          title="Person und Tag fehlen"
          description="Diese Seite wird aus dem Kalender geöffnet, wenn dort eine behandelnde Person und ein Tag gewählt sind."
        />
        <div className="mt-4">
          <Link to="/kalender" className="text-accent inline-flex min-h-11 items-center text-sm">
            Zum Kalender
          </Link>
        </div>
      </>
    );
  }

  return <Umplanung staffMemberId={person} datum={datum} user={user} />;
}
