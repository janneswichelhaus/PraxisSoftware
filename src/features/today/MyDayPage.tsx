import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import {
  appointmentStatusLabels,
  appointmentTypeLabels,
  fetchAppointments,
  formatLocalTimeRange,
  patientName,
  staffName,
  todayInTimeZone,
  type CalendarEntry,
} from '@/features/appointments/api';
import {
  canManageAppointments,
  canReadPatientDirectory,
  isStaff,
  type CurrentUser,
} from '@/features/session/types';
import { useVorschau } from '@/features/preview/vorschauContext';
import { vorschauidentitaet, darfEntscheiden } from '@/features/preview/identitaet';
import { Abschnitt } from '@/features/preview/ui';
import { formatDatum } from '@/features/preview/format';
import { fetchOwnStaffMemberId } from './api';

/**
 * Mein Tag - der persönliche Einstieg.
 *
 * Die Seite beantwortet eine Frage: was ist als Nächstes zu tun. Sie ist
 * deshalb kein Begrüßungsbildschirm mit Kennzahl, sondern eine Aufgabenliste
 * aus echten Terminen und - klar getrennt - den Hinweisen aus den noch nicht
 * angebundenen Bereichen.
 *
 * Sie führt keine zweite Terminliste: die Besuche kommen aus demselben
 * Kalender wie im Bereich „Touren & Termine", nur auf die eigene Person und
 * den heutigen Tag eingegrenzt.
 */

function fruehesteZuerst(a: CalendarEntry, b: CalendarEntry): number {
  return a.starts_at.localeCompare(b.starts_at);
}

/**
 * Kurze Ortsangabe eines Termins.
 *
 * Die Kalenderabfrage liefert bewusst keine Besuchsadresse - für die
 * Tagesübersicht ist sie nicht erforderlich (ADR-004, Datenminimierung). Die
 * vollständige Adresse steht in der Termindetailansicht.
 */
function ortKurz(termin: CalendarEntry): string {
  if (termin.appointment_type === 'video') return 'Videotermin';
  if (termin.appointment_type === 'practice') return termin.location_name ?? '';
  return 'Hausbesuch';
}

function greeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 11) return 'Guten Morgen';
  if (hour < 18) return 'Guten Tag';
  return 'Guten Abend';
}

function firstName(displayName: string): string {
  return displayName.split(' ')[0] ?? displayName;
}

function Terminzeile({ termin, zeitzone }: { termin: CalendarEntry; zeitzone: string }) {
  return (
    <li>
      <Link
        to={`/termine/${termin.id}`}
        className="hover:bg-surface-sunken flex min-h-16 items-center gap-4 py-3 transition-colors"
      >
        <span className="text-ink w-28 shrink-0 text-sm font-medium tabular-nums">
          {formatLocalTimeRange(termin.starts_at, termin.ends_at, zeitzone)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-ink block truncate text-[0.9375rem] font-medium">
            {patientName(termin)}
          </span>
          <span className="text-ink-muted mt-0.5 block truncate text-sm">
            {appointmentTypeLabels[termin.appointment_type]}
            {ortKurz(termin) ? ` · ${ortKurz(termin)}` : ''}
            {` · ${staffName(termin)}`}
          </span>
        </span>
        {termin.status !== 'scheduled' ? (
          <Badge ton={termin.status === 'cancelled' ? 'kritisch' : 'positiv'}>
            {appointmentStatusLabels[termin.status]}
          </Badge>
        ) : null}
      </Link>
    </li>
  );
}

export function MyDayPage({ user }: { user: CurrentUser }) {
  const zeitzone = user.organizationTimeZone ?? 'Europe/Berlin';
  const heute = todayInTimeZone(zeitzone);
  const darfTermine = canManageAppointments(user.roles);
  const praxisrolle = isStaff(user.roles);

  const { data: eigeneStaffId } = useQuery({
    queryKey: ['own-staff-member', user.profile.person_id],
    queryFn: () => fetchOwnStaffMemberId(user.profile.person_id),
    enabled: praxisrolle,
    retry: false,
  });

  const {
    data: termine,
    isPending,
    isError,
  } = useQuery({
    queryKey: ['appointments', heute, heute, null, null, 'active'],
    queryFn: () =>
      fetchAppointments({ von: heute, bis: heute, person: null, standort: null, status: 'active' }),
    enabled: darfTermine,
    retry: false,
  });

  const alleHeute = [...(termine ?? [])].sort(fruehesteZuerst);
  const eigeneHeute = eigeneStaffId
    ? alleHeute.filter((termin) => termin.staff_member_id === eigeneStaffId)
    : [];

  if (!praxisrolle) {
    return (
      <>
        <PageHeader
          title={`${greeting()}, ${firstName(user.profile.display_name)}`}
          description={formatDatum(heute)}
        />
        <Abschnitt titel="Ihr Zugang">
          <p className="text-ink-muted max-w-prose text-[0.9375rem]">
            Sie sehen ausschließlich Ihre eigenen Daten. Weitere Bereiche des Patientenportals
            werden schrittweise ergänzt.
          </p>
        </Abschnitt>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${firstName(user.profile.display_name)}`}
        description={formatDatum(heute)}
      />

      {darfTermine ? (
        <>
          {isPending ? <LoadingState label="Termine werden geladen …" /> : null}
          {isError ? (
            <ErrorState
              title="Die Termine konnten nicht geladen werden."
              description="Bitte später erneut versuchen. Sind Sie noch angemeldet?"
            />
          ) : null}

          {eigeneStaffId ? (
            <Abschnitt
              titel="Meine Besuche heute"
              beschreibung="Aus dem Kalender der Praxis – keine zweite Terminliste."
              aktionen={
                <Link
                  to={`/kalender?ansicht=tag&datum=${heute}`}
                  className="text-accent hover:text-accent-hover inline-flex min-h-11 items-center text-[0.9375rem] font-medium"
                >
                  Im Kalender öffnen →
                </Link>
              }
            >
              {termine && eigeneHeute.length === 0 ? (
                <EmptyState
                  title="Heute keine eigenen Besuche"
                  description="Der Tagesplan des Teams steht darunter."
                />
              ) : (
                <ul className="divide-line border-line divide-y border-y">
                  {eigeneHeute.map((termin) => (
                    <Terminzeile key={termin.id} termin={termin} zeitzone={zeitzone} />
                  ))}
                </ul>
              )}
            </Abschnitt>
          ) : null}

          <Abschnitt
            titel="Tagesplan des Teams"
            beschreibung="Alle Besuche des heutigen Tages."
            aktionen={
              <Link
                to={`/kalender?ansicht=tag&datum=${heute}`}
                className="text-accent hover:text-accent-hover inline-flex min-h-11 items-center text-[0.9375rem] font-medium"
              >
                Zum Kalender →
              </Link>
            }
          >
            {termine && alleHeute.length === 0 ? (
              <EmptyState title="Heute sind keine Termine geplant" />
            ) : (
              <ul className="divide-line border-line divide-y border-y">
                {alleHeute.map((termin) => (
                  <Terminzeile key={termin.id} termin={termin} zeitzone={zeitzone} />
                ))}
              </ul>
            )}
          </Abschnitt>
        </>
      ) : null}

      <MeinTagVorschau user={user} />

      {canReadPatientDirectory(user.roles) ? (
        <p className="text-ink-subtle mt-10 max-w-prose text-sm">
          Früher Entwicklungsstand mit ausschließlich synthetischen Testdaten.
        </p>
      ) : null}
    </>
  );
}

// -----------------------------------------------------------------------------
// Vorschauteil
// -----------------------------------------------------------------------------

/**
 * Der Teil von „Mein Tag", dessen Hintergrundfunktionen noch fehlen.
 *
 * Bewusst als eigener, sichtbar abgesetzter Block unter den echten Terminen:
 * Wer die Seite morgens öffnet, muss auf einen Blick unterscheiden können,
 * worauf er sich verlassen kann.
 */
function MeinTagVorschau({ user }: { user: CurrentUser }) {
  const { zustand } = useVorschau();
  const identitaet = vorschauidentitaet(zustand, user);
  if (!identitaet) return null;

  const ich = identitaet.person;
  const meinRad = zustand.raeder.find(
    (rad) => rad.stammnutzerId === ich.id || rad.aktuellerNutzerId === ich.id,
  );
  const meineOffenen =
    zustand.urlaub.filter(
      (antrag) => antrag.mitarbeiterId === ich.id && antrag.status === 'beantragt',
    ).length +
    zustand.erstattungen.filter(
      (antrag) =>
        antrag.mitarbeiterId === ich.id &&
        (antrag.stand === 'eingereicht' || antrag.stand === 'genehmigt'),
    ).length;
  const zuEntscheiden = darfEntscheiden(user)
    ? zustand.urlaub.filter((antrag) => antrag.status === 'beantragt').length +
      zustand.erstattungen.filter((antrag) => antrag.stand === 'eingereicht').length
    : 0;
  const ungelesen = zustand.nachrichten.filter((nachricht) => !nachricht.gelesen).length;
  const meineTour = zustand.touren.find((tour) => tour.mitarbeiterId === ich.id);

  return (
    <section className="border-line mt-10 border-t pt-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge ton="warnung">Vorschau</Badge>
        <h2 className="text-ink text-[1.0625rem] font-semibold tracking-[-0.01em]">
          Betrieb, Wege und Team
        </h2>
      </div>
      <p className="text-ink-muted mb-4 max-w-prose text-sm">
        Diese Bereiche sind noch nicht angebunden. Angezeigt werden synthetische Daten der
        Demoperson <strong className="text-ink">{ich.name}</strong>
        {identitaet.ueberNamen ? '' : ' (zur Rolle passend gewählt)'}. Es entstehen keine echten
        Vorgänge.
      </p>

      <div className="grid [grid-template-columns:repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-3">
        <Card>
          <p className="text-ink-muted text-sm">Mein Rad heute</p>
          <p className="text-ink mt-1 text-[0.9375rem] font-medium">
            {meinRad ? meinRad.name : 'Kein Rad zugeordnet'}
          </p>
          {meinRad ? (
            <p className="text-ink-muted mt-1 text-sm">
              {meinRad.schluesselInhaber
                ? `Schlüssel bei ${meinRad.schluesselInhaber}`
                : 'Schlüssel im Tresor'}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-3">
            <Link
              to="/betrieb/flotte"
              className="text-accent hover:text-accent-hover text-sm font-medium"
            >
              Zur Radflotte →
            </Link>
            <Link
              to="/betrieb/flotte/panne"
              className="text-danger text-sm font-medium hover:underline"
            >
              Panne melden
            </Link>
          </div>
        </Card>

        <Card>
          <p className="text-ink-muted text-sm">Meine Wege heute</p>
          <p className="text-ink mt-1 text-[0.9375rem] font-medium">
            {meineTour ? `${meineTour.stopps.length} Stopps` : 'Keine Tour hinterlegt'}
          </p>
          <p className="text-ink-muted mt-1 text-sm">Wegzeiten sind geschätzt, nicht berechnet.</p>
          <Link
            to="/touren"
            className="text-accent hover:text-accent-hover mt-3 inline-block text-sm font-medium"
          >
            Zur Besuchsfolge →
          </Link>
        </Card>

        <Card>
          <p className="text-ink-muted text-sm">Meine Anträge</p>
          <p className="text-ink mt-1 text-[0.9375rem] font-medium">
            {meineOffenen === 0
              ? 'Nichts offen'
              : `${meineOffenen} offen${meineOffenen === 1 ? '' : 'e'}`}
          </p>
          <p className="text-ink-muted mt-1 text-sm">Urlaub, Zeitkonto und Erstattungen.</p>
          <Link
            to="/betrieb/urlaub"
            className="text-accent hover:text-accent-hover mt-3 inline-block text-sm font-medium"
          >
            Zu meinen Anträgen →
          </Link>
        </Card>

        {zuEntscheiden > 0 ? (
          <Card>
            <p className="text-ink-muted text-sm">Zu entscheiden</p>
            <p className="text-ink mt-1 text-[0.9375rem] font-medium">
              {zuEntscheiden} Vorgang{zuEntscheiden === 1 ? '' : 'e'}
            </p>
            <p className="text-ink-muted mt-1 text-sm">Urlaubsanträge und Erstattungen.</p>
            <Link
              to="/betrieb/urlaub"
              className="text-accent hover:text-accent-hover mt-3 inline-block text-sm font-medium"
            >
              Freigaben öffnen →
            </Link>
          </Card>
        ) : null}

        <Card>
          <p className="text-ink-muted text-sm">Team</p>
          <p className="text-ink mt-1 text-[0.9375rem] font-medium">
            {ungelesen === 0 ? 'Nichts Ungelesenes' : `${ungelesen} ungelesen`}
          </p>
          <p className="text-ink-muted mt-1 text-sm">Kanäle und Direktnachrichten.</p>
          <Link
            to="/team"
            className="text-accent hover:text-accent-hover mt-3 inline-block text-sm font-medium"
          >
            Zum Team →
          </Link>
        </Card>
      </div>
    </section>
  );
}
