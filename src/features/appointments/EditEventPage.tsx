import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Badge } from '@/components/ui/Badge';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Fehlerzusammenfassung } from '@/components/ui/Fehlerzusammenfassung';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Textlink } from '@/components/ui/Textlink';
import { roleLabels } from '@/components/ui/roleLabels';
import {
  EINGABETEXTE,
  useTextverlustschutz,
  type Verlustschutztexte,
} from '@/features/documentation/Textverlustschutz';
import { alsFormularfehler } from '@/lib/formularfehler';
import { RUECKWEG_PARAM } from '@/lib/rueckweg';
import { canManageAppointments, type CurrentUser } from '@/features/session/types';
import { EreignisArbeitszeitRueckfrage, EreignisFormFields } from './EreignisFormFields';
import {
  EREIGNIS_BESCHRIFTUNGEN,
  EREIGNIS_FEHLERFELDER,
  EREIGNIS_FELD_IDS,
  ereignisGeaendert,
} from './calendar';
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
  kalenderZumTermin,
  zurueckZumTermin,
} from './api';
import { formatDate } from '@/lib/datum';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';

/**
 * Die ganze Fehlzeit bearbeiten (CAL-017).
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
 * Liste unten führt den Weg dorthin - jede Teilnahme ist ein Link (TER-15).
 *
 * **Gehört das Ereignis zu einer Dauerfehlzeit (CAL-021)**, kommt eine dritte
 * Unterscheidung dazu, und sie steht ausdrücklich zur Wahl: dieses Vorkommen
 * oder die ganze Serie. Vorbelegt ist das Vorkommen — die kleinere Wirkung
 * ist die, die man versehentlich auslösen darf. Die Wahl steht vor den
 * Feldern, denn sie bestimmt, was die Felder bedeuten: Im Serienmodus bleiben
 * die Tage, und der Tag ist dann keine Eingabe (TER-14).
 *
 * Geänderte Eingaben gehen nicht still verloren (TER-05), und was fehlt,
 * steht zusammengefasst über dem Formular (TER-06).
 */
type Feld = keyof EreignisFormValues;

/** Die Sätze des Verlustschutzes für dieses Formular. */
const FEHLZEITTEXTE: Verlustschutztexte = {
  ...EINGABETEXTE,
  bezeichnung: 'Ungespeicherte Änderungen',
};

export function EditEventPage({ user }: { user: CurrentUser }) {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const navigate = useNavigate();
  const [suche] = useSearchParams();
  const rueckweg = suche.get(RUECKWEG_PARAM);
  const queryClient = useQueryClient();

  const [werte, setWerte] = useState<EreignisFormValues | null>(null);
  // Der geladene Stand: Was davon abweicht, ist eine Eingabe (TER-05).
  const [anfang, setAnfang] = useState<EreignisFormValues | null>(null);
  const [fehler, setFehler] = useState<Partial<Record<Feld, string>>>({});
  const [umfang, setUmfang] = useState<'vorkommen' | 'serie'>('vorkommen');

  const { freigeben, schutz } = useTextverlustschutz({
    ungespeichert: werte !== null && anfang !== null && ereignisGeaendert(werte, anfang),
    texte: FEHLZEITTEXTE,
  });

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
    const geladen: EreignisFormValues = {
      title: daten.title ?? '',
      staff_member_ids: [],
      appointment_type: daten.appointment_type === 'video' ? 'video' : 'practice',
      date: felder.date,
      start_time: felder.start_time,
      end_time: felder.end_time,
      location_id: daten.location_id ?? '',
    };
    setWerte(geladen);
    setAnfang(geladen);
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
      // Gespeichert: Der eigene Weg hinaus ist kein Verlust (ANN-046).
      freigeben();
      void navigate(zurueckZumTermin(rueckweg, appointmentId!), { replace: true });
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
        description={`Fehlzeiten bearbeiten dürfen alle vier Praxisrollen: ${roleLabels.owner}, ${roleLabels.therapist}, ${roleLabels.team_lead} und ${roleLabels.office}.`}
      />
    );
  }

  if (termin.isPending || standorte.isPending) {
    return <LoadingState label="Fehlzeit wird geladen …" />;
  }

  // Ein Ladefehler ist kein „Nicht gefunden" (TER-11, ZST-08): Im Funkloch
  // wirkte eine vorhandene Fehlzeit sonst gelöscht oder gesperrt. Der Weg
  // zurück steht in beiden Fällen da.
  if (termin.isError) {
    return (
      <>
        <Rueckweg standard="/kalender" />
        <ErrorState
          title="Die Fehlzeit konnte nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => termin.refetch()}
        />
      </>
    );
  }

  if (!termin.data) {
    return (
      <>
        <Rueckweg standard="/kalender" />
        <ErrorState
          title="Nicht gefunden"
          description="Diese Fehlzeit existiert nicht oder ist für Ihren Zugang nicht freigegeben."
        />
      </>
    );
  }

  const daten = termin.data;
  const zurueck = zurueckZumTermin(rueckweg, daten.id);

  if (daten.kind !== 'internal' || !gruppeId) {
    return (
      <>
        <Link
          to={zurueck}
          className="text-ink-muted hover:text-ink mb-4 inline-flex min-h-11 items-center text-sm"
        >
          ← Zurück zum Termin
        </Link>
        <ErrorState
          title="Keine Fehlzeit"
          description="Dieser Weg gilt für Fehlzeiten des Praxisbetriebs. Ein Behandlungstermin wird über „Bearbeiten“ geändert."
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
          ← Zurück zur Fehlzeit
        </Link>
        <ErrorState
          title="Abgesagte Fehlzeiten werden nicht bearbeitet"
          description="Die Fehlzeit bleibt zur Nachvollziehbarkeit erhalten. Für einen neuen Zeitraum bitte eine neue Fehlzeit eintragen."
        />
      </>
    );
  }

  const ausserhalb = mutation.isError && istAusserhalbArbeitszeit(mutation.error);
  const serienVorkommen = serie.data ?? [];
  // Dieselbe Grenze wie serverseitig: noch nicht begonnen und noch nicht
  // abgesagt - so zählt auch die Absage der ganzen Serie (TER-14).
  const kommende = serienVorkommen.filter(
    (v) => v.open_count > 0 && new Date(v.starts_at).getTime() > Date.now(),
  );
  // Ohne die Beteiligten lässt sich die Gruppe nicht schreiben (ZST-07).
  const listeFehlt =
    beteiligte.isError || (standorte.isError && werte?.appointment_type === 'practice');

  return (
    <>
      {/* Der Rückweg führt auf die Fehlzeit, von der die Bearbeitung ausging;
          der Kalenderstand reist dabei weiter. `Rueckweg` nähme ihn direkt
          und übersprünge die Fehlzeit. */}
      <Link
        to={zurueck}
        className="text-ink-muted hover:text-ink mb-4 inline-flex min-h-11 items-center text-sm"
      >
        ← Zurück zur Fehlzeit
      </Link>

      <PageHeader
        title="Fehlzeit bearbeiten"
        description={
          serieId
            ? 'Bezeichnung, Zeit und Ort gelten für alle Beteiligten. Diese Fehlzeit gehört zu einer Dauerfehlzeit – zuerst steht zur Wahl, was sich ändert.'
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
          {/* Was noch fehlt - und wo (TER-06). */}
          <Fehlerzusammenfassung
            fehler={alsFormularfehler(
              EREIGNIS_FEHLERFELDER,
              EREIGNIS_BESCHRIFTUNGEN,
              fehler,
              (feld) => EREIGNIS_FELD_IDS[feld],
            )}
          />

          {/* Dieses Vorkommen oder die ganze Serie (CAL-021) - ausdrücklich
              beschriftet, wie schon „Fehlzeit bearbeiten" gegen „Teilnahme
              ändern". Vorbelegt ist das Vorkommen. Vor den Feldern, weil die
              Wahl bestimmt, was sie bedeuten (TER-14). */}
          {serieId && serienVorkommen.length > 0 ? (
            <fieldset className="border-line bg-surface-sunken rounded-card mb-6 border p-4">
              <legend className="text-ink px-1 text-sm font-medium">Umfang der Änderung</legend>
              <div className="mt-2 flex flex-col gap-3">
                <label className="text-liste flex min-h-11 cursor-pointer gap-3">
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
                <label className="text-liste flex min-h-11 cursor-pointer gap-3">
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
                      {kommende.length} kommende von {serienVorkommen.length} Vorkommen. Die Tage
                      bleiben – geändert werden Bezeichnung, Uhrzeit, Länge, Art und Ort.
                    </span>
                  </span>
                </label>
              </div>
            </fieldset>
          ) : null}

          <EreignisFormFields
            werte={werte}
            fehler={fehler}
            onChange={setzen}
            standorte={standorte.data ?? []}
            zeitzone={user.organizationTimeZone}
            rasterMinuten={user.appointmentGridMinutes}
            // Im Serienmodus bleiben die Tage - der Tag ist dann keine Eingabe,
            // deren Wert der Server verwürfe (TER-14).
            datumFest={umfang === 'serie' ? 'Die Tage der Serie bleiben, wie sie sind.' : undefined}
            standorteFehler={
              standorte.isError ? (
                <ErrorState
                  title="Die Standorte konnten nicht geladen werden."
                  description="Bitte die Verbindung prüfen und erneut versuchen."
                  onErneut={() => standorte.refetch()}
                />
              ) : null
            }
            beteiligte={
              <div className="border-line bg-surface-sunken rounded-card border p-4">
                <p className="text-ink-muted text-sm">Beteiligte</p>
                {beteiligte.isPending ? (
                  <LoadingState label="Beteiligte werden geladen …" />
                ) : beteiligte.isError ? (
                  <div className="mt-2">
                    <ErrorState
                      title="Die Beteiligten konnten nicht geladen werden."
                      description="Bitte die Verbindung prüfen und erneut versuchen."
                      onErneut={() => beteiligte.refetch()}
                    />
                  </div>
                ) : (
                  <ul className="mt-2 flex flex-col gap-1">
                    {(beteiligte.data ?? []).map((person) => (
                      <li
                        key={person.appointment_id}
                        className="text-ink text-liste flex flex-wrap items-center gap-2"
                      >
                        {/* Die Teilnahme ist der Weg zum Austauschen oder
                            Absagen (TER-15) - mit Rückweg hierher. */}
                        <Textlink alleinstehend to={kalenderZumTermin(person.appointment_id)}>
                          {person.display_name}
                        </Textlink>
                        {person.status === 'confirmed' ? null : (
                          <Badge ton="kritisch">{appointmentStatusLabels[person.status]}</Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {/* Ein Satz statt dreier: Der Weg steht an jedem Namen (UX-005g). */}
                <Kleingedrucktes className="mt-3">
                  Teilnahme am jeweiligen Termin ändern.
                </Kleingedrucktes>
              </div>
            }
          />

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

          {/* Die Rückfrage vor dem Weggehen steht dort, wo gearbeitet wird. */}
          {schutz}

          <div className="mt-8 flex flex-wrap gap-3">
            <Button type="submit" disabled={mutation.isPending || listeFehlt}>
              {/* Dasselbe Verb wie beim Termin (WRT-10, TER-22). */}
              {mutation.isPending
                ? 'Wird gespeichert …'
                : umfang === 'serie'
                  ? 'Ganze Serie ändern'
                  : 'Änderungen speichern'}
            </Button>
            {/* Ein Seitenwechsel ist ein Link (UIK-13) - und läuft damit durch
                dieselbe Rückfrage wie jeder andere Weg hinaus. */}
            <ButtonLink to={zurueck} variant="secondary">
              Abbrechen
            </ButtonLink>
          </div>
        </form>
      ) : null}
    </>
  );
}
