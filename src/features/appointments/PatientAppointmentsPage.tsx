import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { kartenAktionKlassen } from '@/components/ui/buttonStile';
import { Section } from '@/components/ui/Section';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { usePatientRecord } from '@/features/patients/akte';
import { mitRueckweg } from '@/lib/rueckweg';
import type { Patient } from '@/features/patients/api';
import type { CurrentUser } from '@/features/session/types';
import { formatDate as formatIsoDate } from '@/features/prescriptions/api';
import { Mitteilungszeichen } from './Mitteilungszeichen';
import {
  appointmentStatusLabels,
  appointmentStatusTon,
  appointmentTypeLabels,
  fetchPatientAppointments,
  formatLocalDate,
  formatLocalTimeRange,
  naechsteTerminSeite,
  staffName,
  todayInTimeZone,
  type PatientAppointment,
  type TerminCursor,
} from './api';
import { schreibeParameter, ZOOM_STANDARD } from './calendar';

/**
 * Der Terminbereich der Akte (AKTE-003).
 *
 * Die Akte zeigte bisher fünf künftige Termine und - versteckt im
 * Behandlungsverlauf - die vergangenen als Dokumentationssicht. Die Frage „wann
 * war sie zuletzt da, und was ist noch vereinbart?" ließ sich damit nur über
 * zwei Stellen beantworten, und der abgesagte Termin von vorletzter Woche kam
 * in keiner davon organisatorisch vor.
 *
 * Hier steht beides untereinander: was ansteht, und was war - beides mit allen
 * Zuständen, beides geblättert. Geschrieben wird weiterhin am Termin; diese
 * Liste ist der Weg dorthin.
 */

/** Der Filter auf eine Verordnung reist in der Adresse (teilbar, neuladefest). */
const FILTER = 'verordnung';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Terminzeile({
  termin,
  patientId,
  mitVerordnung,
}: {
  termin: PatientAppointment;
  patientId: string;
  mitVerordnung: boolean;
}) {
  const zone = termin.organization_time_zone;

  return (
    // Die Trennlinie steht zwischen den Zeilen, nicht ueber der ersten: Im
    // weissen Rahmen (UI-002c) waere sie dort eine zweite Kante neben dem
    // Rahmen selbst.
    <li className="border-line border-t first:border-t-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
        <Link
          to={mitRueckweg(`/termine/${termin.id}`, `/patienten/${patientId}/termine`)}
          className="hover:bg-surface-sunken -mx-2 flex min-h-11 min-w-48 flex-1 flex-col justify-center rounded px-2 transition-colors"
        >
          <span className="text-ink text-[0.9375rem] font-medium">
            {formatLocalDate(termin.starts_at, zone)}
          </span>
          <span className="text-ink-muted text-sm">
            {formatLocalTimeRange(termin.starts_at, termin.ends_at, zone)}
            {` · ${appointmentTypeLabels[termin.appointment_type]}`}
            {` · ${staffName(termin)}`}
          </span>
        </Link>

        {/* Wege und Zustand beantworten dieselbe Frage: Ist an diesem Termin
            noch etwas zu tun? (CAL-012) */}
        <Mitteilungszeichen kanaele={termin.notification_channels} />
        {termin.status !== 'confirmed' ? (
          <Badge ton={appointmentStatusTon[termin.status]}>
            {appointmentStatusLabels[termin.status]}
          </Badge>
        ) : null}

        {/* Der Rückweg zur Verordnung: Wer einen Serientermin vor sich hat,
            will wissen, aus welchem Auftrag er stammt (CAL-007). Im gefilterten
            Zustand wäre der Hinweis an jeder Zeile dieselbe Auskunft. */}
        {mitVerordnung && termin.prescription_id ? (
          <Link
            to={`/patienten/${patientId}/verordnungen#verordnung-${termin.prescription_id}`}
            className="text-accent inline-flex min-h-11 shrink-0 items-center text-sm hover:underline"
          >
            {termin.prescription_issued_on
              ? `Verordnung vom ${formatIsoDate(termin.prescription_issued_on)}`
              : 'Zur Verordnung'}
          </Link>
        ) : null}
      </div>
    </li>
  );
}

function Terminliste({
  patientId,
  kuenftig,
  verordnung,
  leerText,
  weiterText,
}: {
  patientId: string;
  kuenftig: boolean;
  verordnung: string | null;
  leerText: string;
  weiterText: string;
}) {
  const seiten = useInfiniteQuery({
    queryKey: ['patient-appointments', patientId, kuenftig, verordnung],
    queryFn: ({ pageParam }) =>
      fetchPatientAppointments(patientId, {
        kuenftig,
        cursor: pageParam,
        verordnung,
      }),
    initialPageParam: null as TerminCursor | null,
    getNextPageParam: (letzteSeite) => naechsteTerminSeite(letzteSeite),
    // Beim Öffnen immer der aktuelle Stand: Wer eben am Termin abgesagt oder
    // abgeschlossen hat, soll das hier sofort sehen.
    staleTime: 0,
    retry: false,
  });

  const termine = seiten.data?.pages.flat() ?? [];

  return (
    <>
      {seiten.isPending ? <LoadingState label="Termine werden geladen …" /> : null}
      {seiten.isError ? <ErrorState title="Die Termine konnten nicht geladen werden." /> : null}

      {seiten.data && termine.length === 0 ? (
        <p className="text-ink-muted text-[0.9375rem]">{leerText}</p>
      ) : null}

      {termine.length > 0 ? (
        <ul>
          {termine.map((termin) => (
            <Terminzeile
              key={termin.id}
              termin={termin}
              patientId={patientId}
              mitVerordnung={verordnung === null}
            />
          ))}
        </ul>
      ) : null}

      {seiten.hasNextPage ? (
        <div className="mt-3">
          <Button
            type="button"
            variant="secondary"
            disabled={seiten.isFetchingNextPage}
            onClick={() => void seiten.fetchNextPage()}
          >
            {seiten.isFetchingNextPage ? 'Wird geladen …' : weiterText}
          </Button>
          {seiten.isFetchNextPageError ? (
            <Statusmeldung ton="fehler" className="mt-2">
              Die weiteren Termine konnten nicht geladen werden. Bitte erneut versuchen.
            </Statusmeldung>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

export function PatientAppointmentsPage() {
  const { patient, user } = usePatientRecord();
  return <Terminbereich patient={patient} user={user} />;
}

export function Terminbereich({ patient, user }: { patient: Patient; user: CurrentUser }) {
  const [suche, setSuche] = useSearchParams();

  const roh = suche.get(FILTER);
  const verordnung = roh && UUID.test(roh) ? roh : null;

  // Der Kalender übernimmt den Patientenfilter und öffnet den Tag, an dem
  // etwas ansteht - ohne Termin den heutigen (AKTE-003). Ohne Praxiszeitzone
  // führt der Weg trotzdem in den Kalender; dort steht dann, warum er sich
  // nicht darstellen lässt.
  const zone = user.organizationTimeZone;
  const naechster = useQuery({
    queryKey: ['patient-next-appointment', patient.id, verordnung],
    queryFn: () => fetchPatientAppointments(patient.id, { kuenftig: true, limit: 1, verordnung }),
    staleTime: 0,
    retry: false,
  });

  const ersterTermin = naechster.data?.[0] ?? null;
  const kalendertag =
    zone && ersterTermin
      ? todayInTimeZone(zone, new Date(ersterTermin.starts_at))
      : zone
        ? todayInTimeZone(zone)
        : null;

  const kalenderZiel = `/kalender?${schreibeParameter({
    ansicht: 'tag',
    datum: kalendertag ?? '',
    person: null,
    standort: null,
    status: 'active',
    patient: patient.id,
    // Der Verordnungsfilter reist mit in den Kalender: Wer dort eine freie
    // Stelle antippt, legt den Termin gleich zu dieser Verordnung an
    // (CAL-015c).
    verordnung,
    zoom: ZOOM_STANDARD,
  })}`;

  return (
    <>
      {verordnung ? (
        <div
          role="status"
          className="border-line-strong bg-surface-sunken rounded-card mb-6 flex flex-wrap items-center justify-between gap-3 border px-4 py-3"
        >
          <p className="text-ink text-sm">Nur die Termine einer Verordnung.</p>
          <div className="flex flex-wrap gap-2">
            <ButtonLink
              to={`/patienten/${patient.id}/verordnungen#verordnung-${verordnung}`}
              variant="secondary"
            >
              Zur Verordnung
            </ButtonLink>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const naechsteSuche = new URLSearchParams(suche);
                naechsteSuche.delete(FILTER);
                setSuche(naechsteSuche, { replace: true });
              }}
            >
              Alle Termine zeigen
            </Button>
          </div>
        </div>
      ) : null}

      <Section
        titel="Kommende Termine"
        rahmen
        aktion={
          // Kompakte Größe: Zwei Schaltflächen in voller Höhe schoben den
          // ersten Termin bei 375 px um mehr als hundert Pixel nach unten.
          <div className="flex flex-wrap gap-2">
            <Link
              to={`/patienten/${patient.id}/terminzettel`}
              className={kartenAktionKlassen('secondary')}
            >
              Termine mitteilen
            </Link>
            <Link to={kalenderZiel} className={kartenAktionKlassen('secondary')}>
              Im Kalender zeigen
            </Link>
          </div>
        }
      >
        <Terminliste
          patientId={patient.id}
          kuenftig
          verordnung={verordnung}
          leerText="Kein weiterer Termin vereinbart."
          weiterText="Weitere Termine anzeigen"
        />
      </Section>

      <Section
        titel="Vergangene Termine"
        hinweis="Neueste zuerst, einschließlich abgesagter Termine."
        rahmen
      >
        <Terminliste
          patientId={patient.id}
          kuenftig={false}
          verordnung={verordnung}
          leerText="Für diese Person gibt es noch keinen vergangenen Termin."
          weiterText="Ältere Termine anzeigen"
        />
      </Section>
    </>
  );
}
