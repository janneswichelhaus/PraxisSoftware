import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Checkbox } from '@/components/ui/Checkbox';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Section } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Textlink } from '@/components/ui/Textlink';
import { Card, CardGrid } from '@/components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { canManageAppointments, type CurrentUser } from '@/features/session/types';
import { fetchDayPlan, rufnummern, type DayPlanEntry } from '@/features/today/api';
import { leseRueckweg, mitRueckweg } from '@/lib/rueckweg';
import { Laengenzeichen } from './Laengenzeichen';
import { istIsoDatum } from './calendar';
import {
  appointmentTypeHint,
  cancellationReasonSchema,
  waehlbareAbsagegruende,
  cancelStaffDay,
  fetchAssignableTherapists,
  formatLocalDate,
  formatLocalTimeRange,
  type CancellationReason,
} from './api';
import { tageslageNeuLaden } from './tageslage';

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
 *
 * **Die Anrufliste selbst steht in der Adresse (KAL-06).** Nach der Absage
 * trägt die Adresse die Kennungen der eben abgesagten Termine - nur
 * Kennungen, keine Namen (ADR-011). So übersteht die Liste den Abstecher in
 * die Akte, das Zurück und ein Neuladen nach dem Wechsel in die Telefon-App,
 * und sie enthält nur diesen Vorgang: Ein Termin, den die Patient:in vorher
 * selbst abgesagt hatte, gehört nicht auf die Liste der anzurufenden.
 */

const UUID_MUSTER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Parameter der Anrufliste: die Kennungen der eben abgesagten Termine. */
const ABGESAGT_PARAM = 'abgesagt';

/**
 * Die abgesagten Kennungen aus der Adresse - oder `null` vor der Absage.
 *
 * Die Kennungen filtern nur den geladenen Tagesplan und gehen nie an den
 * Server; geprüft wird deshalb nur ihre Form, und die Liste ist begrenzt.
 */
function leseAbgesagt(suche: URLSearchParams): string[] | null {
  const wert = suche.get(ABGESAGT_PARAM);
  if (wert === null) return null;
  return wert
    .split(',')
    .filter((kennung) => /^[\w-]{1,64}$/.test(kennung))
    .slice(0, 100);
}

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
  return termin.status === 'confirmed' && termin.kind === 'therapy';
}

/**
 * Wer nach dem Umplanen angerufen wird.
 *
 * Ein Ereignis hat niemanden, den man anrufen könnte - und es war gar nicht
 * abgesagt worden (CAL-016).
 */
function istAnzurufen(termin: DayPlanEntry): boolean {
  return termin.status === 'cancelled' && termin.kind === 'therapy';
}

function Anrufkarte({
  termin,
  erledigt,
  onErledigt,
  rueckweg,
}: {
  termin: DayPlanEntry;
  erledigt: boolean;
  onErledigt: (wert: boolean) => void;
  /** Diese Seite samt Anrufliste - der Weg aus der Akte zurück (KAL-06). */
  rueckweg: string;
}) {
  const zone = termin.organization_time_zone;
  const nummern = rufnummern(termin);

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-ink text-liste flex flex-wrap items-center gap-x-2 font-semibold tabular-nums">
          {formatLocalTimeRange(termin.starts_at, termin.ends_at, zone)}
          {/* §8.1: abweichende Länge gekennzeichnet (CAL-020). */}
          <Laengenzeichen termin={termin} />
        </p>
        {/* Kein Zustand je Karte: In der Anrufliste steht nur Abgesagtes (UX-005g). */}
      </div>

      {/* Der Name ist ein Weg in die Akte - sichtbar als Link, nicht erst
          beim Überfahren (RSP-06, UIK-15), und mit Rückweg hierher. */}
      <p className="text-ink mt-1 text-[1.0625rem] font-medium">
        <Textlink alleinstehend to={mitRueckweg(`/patienten/${termin.patient_id}`, rueckweg)}>
          {termin.patient_given_name} {termin.patient_family_name}
        </Textlink>
      </p>

      {nummern.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1">
          {nummern.map((nummer) => (
            <li key={nummer.href}>
              <a
                href={nummer.href}
                className="text-accent text-liste inline-flex min-h-11 items-center hover:underline"
              >
                {nummer.label}: {nummer.anzeige}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-muted mt-2 text-sm">Keine Rufnummer hinterlegt.</p>
      )}

      {/* Das Kästchen des Systems statt eines eigenen (KAL-24). */}
      <div className="mt-3">
        <Checkbox
          label="Angerufen"
          checked={erledigt}
          onChange={(e) => onErledigt(e.target.checked)}
        />
      </div>
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
  const [suche, setSuche] = useSearchParams();
  const ort = useLocation();
  const [grund, setGrund] = useState('');
  const [grundFehler, setGrundFehler] = useState<string | undefined>(undefined);
  const [erledigt, setErledigt] = useState<string[]>([]);
  const abgesagt = leseAbgesagt(suche);

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
    mutationFn: (auftrag: { grund: CancellationReason; kennungen: string[] }) =>
      cancelStaffDay(staffMemberId, datum, auftrag.grund),
    onSuccess: async (_anzahl, auftrag) => {
      // Die Anrufliste in die Adresse (KAL-06): Sie übersteht Zurück und
      // Neuladen. \`replace\`: Zurück soll nicht wieder zur Absage führen.
      setSuche(
        (bisher) => {
          const naechste = new URLSearchParams(bisher);
          naechste.set(ABGESAGT_PARAM, auftrag.kennungen.join(','));
          return naechste;
        },
        { replace: true },
      );
      // UBK-011: Tagesliste, Kalender, Tour und Fahrpuffer.
      await tageslageNeuLaden(queryClient);
    },
  });

  const termine = tag.data ?? [];
  const betroffen = termine.filter(istBetroffen);

  async function umplanen() {
    const gewaehlt = cancellationReasonSchema.safeParse(grund);
    if (!gewaehlt.success) {
      setGrundFehler('Bitte einen Absagegrund auswählen.');
      // Ohne den Wurf schlösse die Rückfrage sich trotz fehlender Angabe.
      throw new Error('Absagegrund fehlt');
    }
    setGrundFehler(undefined);
    // Die Kennungen VOR der Absage: genau die Termine, die diese Seite nennt.
    await mutation.mutateAsync({ grund: gewaehlt.data, kennungen: betroffen.map((t) => t.id) });
  }

  const anzurufen = abgesagt
    ? termine.filter((termin) => abgesagt.includes(termin.id) && istAnzurufen(termin))
    : [];
  const person = personen.data?.find((p) => p.staff_member_id === staffMemberId);
  // Die Zeitzone der Praxis, nicht die des ersten Termins: Ein Tag ohne
  // Termine stünde sonst als „2026-09-26" da (KAL-10).
  const zone = user.organizationTimeZone ?? termine[0]?.organization_time_zone;
  const tagText = zone ? formatLocalDate(`${datum}T12:00:00Z`, zone) : datum;
  const zumKalender = leseRueckweg(suche, '/kalender');

  return (
    <>
      <Rueckweg standard="/kalender" />

      <PageHeader
        title="Tag umplanen"
        description={person ? `${person.display_name} · ${tagText}` : tagText}
      />

      {tag.isPending ? <LoadingState label="Der Tag wird geladen …" /> : null}
      {tag.isError && !tag.data ? (
        <ErrorState
          title="Der Tag konnte nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => tag.refetch()}
        />
      ) : null}

      {/* Scheitert nur das Nachladen, bleibt der geladene Stand stehen -
          samt Anrufliste und Haken (ZST-03). */}
      {tag.isError && tag.data ? (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Statusmeldung ton="warnung">Der Stand konnte nicht aktualisiert werden.</Statusmeldung>
          <Button
            type="button"
            variant="secondary"
            groesse="kompakt"
            onClick={() => void tag.refetch()}
          >
            Erneut versuchen
          </Button>
        </div>
      ) : null}

      {tag.data ? (
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
                      <li key={termin.id} className="text-ink text-liste">
                        <span className="tabular-nums">
                          {formatLocalTimeRange(
                            termin.starts_at,
                            termin.ends_at,
                            termin.organization_time_zone,
                          )}
                        </span>
                        {` · ${termin.patient_given_name} ${termin.patient_family_name}`}
                        {/* Nur eine abweichende Terminart steht dran (ANN-192). */}
                        {appointmentTypeHint(termin.appointment_type)
                          ? ` · ${appointmentTypeHint(termin.appointment_type)}`
                          : ''}{' '}
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
                          <option value="">Bitte wählen …</option>
                          {/* „Patient:in hat abgesagt" steht hier nicht: Der
                              Tag wird umgeplant, weil die behandelnde Person
                              ausfällt, und das ist praxisbedingt. Der Grund
                              hätte für jede Patient:in des Tages innerhalb der
                              Frist eine Ausfallgebühr vorgemerkt; seit CAL-016
                              weist ihn auch der Server ab (ADR-018 Fassung 2
                              Punkt 8.4). */}
                          {waehlbareAbsagegruende(true).map(([wert, beschriftung]) => (
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
            <Section titel={`Anrufliste (${anzurufen.length})`}>
              <Statusmeldung ton="erfolg" className="mb-4">
                {abgesagt.length === 1
                  ? 'Ein Termin ist abgesagt.'
                  : `${abgesagt.length} Termine sind abgesagt.`}{' '}
                Jetzt anrufen.
              </Statusmeldung>

              <CardGrid>
                {anzurufen.map((termin) => (
                  <Anrufkarte
                    key={termin.id}
                    termin={termin}
                    rueckweg={`${ort.pathname}${ort.search}`}
                    erledigt={erledigt.includes(termin.id)}
                    onErledigt={(wert) =>
                      setErledigt((bisher) =>
                        wert ? [...bisher, termin.id] : bisher.filter((id) => id !== termin.id),
                      )
                    }
                  />
                ))}
              </CardGrid>

              <p className="text-ink-muted mt-4 max-w-prose text-xs leading-relaxed">
                Die Haken gelten nur, solange diese Seite offen ist – sie werden nicht gespeichert.
              </p>

              {/* Nach dem letzten Anruf der Weg zum freien Tag (KAL-19). */}
              <div className="mt-4">
                <ButtonLink to={zumKalender} variant="secondary">
                  Zum Kalender
                </ButtonLink>
              </div>
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
        {/* Der Weg dorthin als Schaltfläche, mit dem mitgereisten Rückweg
            (NAV-02) - bisher ein 14-px-Textlink, der ihn überging. */}
        <div className="mt-4">
          <ButtonLink to={leseRueckweg(suche, '/kalender')} variant="secondary">
            Zum Kalender
          </ButtonLink>
        </div>
      </>
    );
  }

  return <Umplanung staffMemberId={person} datum={datum} user={user} />;
}
