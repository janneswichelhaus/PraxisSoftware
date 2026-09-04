import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { canReadTreatmentEvidence, type CurrentUser } from '@/features/session/types';
import {
  appointmentStatusLabels,
  appointmentTypeLabels,
  formatLocalDate,
  formatLocalTimeRange,
  staffName,
} from '@/features/appointments/api';
import type { Patient } from '@/features/patients/api';
import {
  fetchTreatmentEvidencePage,
  naechsteAkteSeite,
  type AkteCursor,
  type RecordAppointment,
  type TreatmentEvidenceEntry,
} from './api';
import { zeitpunkt } from './format';

/**
 * Kopfzeile eines Termins in der Akte - beiden Sichten gemeinsam.
 *
 * Datum, Zeit, Art, behandelnde Person und Terminstatus sind organisatorische
 * Angaben, die jede Praxisrolle am Termin ohnehin sieht (PROJECT_PRINCIPLES.md
 * 4.3). Was darunter steht, unterscheidet die Sichten.
 */
function TerminKopf({ termin }: { termin: RecordAppointment }) {
  const zone = termin.organization_time_zone;
  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-ink font-medium">{formatLocalDate(termin.starts_at, zone)}</p>
        <span className="border-line-strong bg-surface-sunken text-ink-muted rounded-full border px-2.5 py-0.5 text-xs font-medium">
          {appointmentStatusLabels[termin.appointment_status]}
        </span>
      </div>
      <p className="text-ink-muted mt-1 text-sm">
        {formatLocalTimeRange(termin.starts_at, termin.ends_at, zone)} ·{' '}
        {appointmentTypeLabels[termin.appointment_type]} · {staffName(termin)}
      </p>
    </>
  );
}

/**
 * Schaltflaeche fuer die naechste Seite der Akte.
 *
 * Eine volle Seite kann die letzte gewesen sein - dann bleibt nach dem Klick
 * die Liste unveraendert und die Schaltflaeche verschwindet. Ein leerer Aufruf
 * ist billiger als eine eigene Zaehlabfrage vorab.
 */
function WeitereSeite({
  sichtbar,
  laufend,
  fehler,
  onClick,
}: {
  sichtbar: boolean;
  laufend: boolean;
  fehler: boolean;
  onClick: () => void;
}) {
  if (!sichtbar) return null;
  return (
    <div className="mt-4">
      <Button type="button" variant="secondary" disabled={laufend} onClick={onClick}>
        {laufend ? 'Wird geladen …' : 'Ältere Termine anzeigen'}
      </Button>
      {fehler ? (
        <p className="text-danger mt-2 text-sm">
          Die weiteren Termine konnten nicht geladen werden. Bitte erneut versuchen.
        </p>
      ) : null}
    </div>
  );
}

/** Der Dokumentationsstand in einem Satz - ohne jeden Inhalt (ANN-006). */
function nachweisText(eintrag: TreatmentEvidenceEntry): string {
  if (eintrag.documentation_status === 'final' && eintrag.documented_at) {
    return `Dokumentation finalisiert am ${zeitpunkt(
      eintrag.documented_at,
      eintrag.organization_time_zone,
    )}.`;
  }
  if (eintrag.documentation_status === 'draft') {
    return 'Dokumentation als Entwurf vorhanden, noch nicht finalisiert.';
  }
  return 'Keine Dokumentation.';
}

/**
 * Behandlungsnachweis in der Akte (DOK-003, PROJECT_PRINCIPLES.md 4.4).
 *
 * Die datensparsame Sicht fuer die Verwaltung: je Termin nur, ob und wann
 * dokumentiert wurde. Sie ist eine eigene Serverfunktion mit eigenem
 * Datenumfang (ADR-004) - nichts hier wird aus klinischen Daten
 * herausgefiltert, weil nichts davon ankommt.
 */
function Behandlungsnachweis({ patient }: { patient: Patient }) {
  const seiten = useInfiniteQuery({
    queryKey: ['treatment-evidence', patient.id],
    queryFn: ({ pageParam }) => fetchTreatmentEvidencePage(patient.id, pageParam),
    initialPageParam: null as AkteCursor | null,
    getNextPageParam: (letzteSeite) => naechsteAkteSeite(letzteSeite),
    retry: false,
  });

  const eintraege = seiten.data?.pages.flat() ?? [];

  return (
    <section className="mt-8" aria-labelledby="behandlungsnachweis">
      <h2
        id="behandlungsnachweis"
        className="text-ink-muted text-sm font-semibold tracking-wide uppercase"
      >
        Behandlungsnachweis
      </h2>
      <p className="text-ink-muted mt-1 max-w-prose text-sm">
        Termine mit Status und Dokumentationsstand, ohne Behandlungsinhalte. Zukünftige Termine ohne
        Dokumentation stehen im Kalender.
      </p>

      {seiten.isPending ? <LoadingState label="Behandlungsnachweis wird geladen …" /> : null}

      {seiten.isError ? (
        <div className="mt-3">
          <ErrorState title="Der Behandlungsnachweis konnte nicht geladen werden." />
        </div>
      ) : null}

      {seiten.data && eintraege.length === 0 ? (
        <p className="text-ink-muted border-line mt-3 border-t pt-4 text-[0.9375rem]">
          Für diese Person gibt es noch keine Termine in der Akte.
        </p>
      ) : null}

      {eintraege.length > 0 ? (
        <ol className="divide-line border-line mt-3 divide-y border-t">
          {eintraege.map((eintrag) => (
            <li key={eintrag.appointment_id} className="py-4">
              <TerminKopf termin={eintrag} />
              <p className="text-ink mt-2 text-[0.9375rem]">{nachweisText(eintrag)}</p>
              <Link
                to={`/termine/${eintrag.appointment_id}`}
                className="text-accent mt-1 inline-flex min-h-11 items-center text-sm hover:underline"
              >
                Zum Termin
              </Link>
            </li>
          ))}
        </ol>
      ) : null}

      <WeitereSeite
        sichtbar={Boolean(seiten.hasNextPage)}
        laufend={seiten.isFetchingNextPage}
        fehler={seiten.isFetchNextPageError}
        onClick={() => void seiten.fetchNextPage()}
      />
    </section>
  );
}

/**
 * Dokumentation in der Akte, rollenabhaengig (DOK-003).
 *
 * Welche Sicht gerendert wird, entscheidet die Rolle nur fuer die
 * Darstellung: die Verwaltung bekommt den Behandlungsnachweis, ein
 * Patientenkonto keinen Abschnitt. Verbindlich prueft der Server in jeder
 * Sicht selbst (ADR-004); eine Rolle, die hier falsch waere, bekaeme vom
 * Server schlicht keine Daten.
 */
export function PatientRecordDocumentation({
  patient,
  user,
}: {
  patient: Patient;
  user: CurrentUser;
}) {
  if (!canReadTreatmentEvidence(user.roles)) return null;
  return <Behandlungsnachweis patient={patient} />;
}
