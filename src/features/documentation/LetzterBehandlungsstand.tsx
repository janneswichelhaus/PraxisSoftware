import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Section } from '@/components/ui/Section';
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
import { mitRueckweg } from '@/lib/rueckweg';
import { fetchTreatmentEvidencePage, type TreatmentEvidenceEntry } from './api';
import { zeitpunkt } from './format';

/**
 * Der letzte Behandlungs- und Dokumentationsstand auf der Übersicht (AKTE-004).
 *
 * Die Frage dahinter ist eine Arbeitsaufgabe, keine Rückschau: „Ist die letzte
 * Behandlung dokumentiert?" Ein offener Entwurf oder eine fehlende
 * Dokumentation ist etwas, das heute zu erledigen ist - und stand bisher am
 * Ende einer sehr langen Seite.
 *
 * Gelesen wird der **Behandlungsnachweis** (DOK-003, ANN-006): Termin,
 * Zustand, Dokumentationsstand - ohne jeden Inhalt. Das ist die Sicht, die
 * alle vier Praxisrollen sehen dürfen, und sie erzeugt keinen Auditeintrag je
 * Eintrag. Die klinische Sicht mit Inhalt bleibt dem Behandlungsverlauf
 * vorbehalten, wo das Lesen protokolliert wird (ADR-010).
 */

function dokumentationsstand(eintrag: TreatmentEvidenceEntry): {
  text: string;
  offen: boolean;
} {
  if (eintrag.documentation_status === 'final' && eintrag.documented_at) {
    return {
      text: `Dokumentation finalisiert am ${zeitpunkt(eintrag.documented_at, eintrag.organization_time_zone)}.`,
      offen: false,
    };
  }
  if (eintrag.documentation_status === 'draft') {
    return { text: 'Dokumentation liegt als Entwurf vor, noch nicht finalisiert.', offen: true };
  }
  return { text: 'Keine Dokumentation.', offen: true };
}

export function LetzterBehandlungsstand({
  patient,
  user,
}: {
  patient: Patient;
  user: CurrentUser;
}) {
  const darfLesen = canReadTreatmentEvidence(user.roles);

  const { data, isPending, isError } = useQuery({
    // Eigener Schlüssel und nicht der des Behandlungsnachweises: Der steht
    // hinter einer `useInfiniteQuery` mit Seiten, hier steht eine einzelne
    // Seite. Derselbe Schlüssel für zwei Formen desselben Inhalts wäre ein
    // Zwischenspeicher, der sich selbst widerspricht.
    queryKey: ['treatment-evidence-neuester', patient.id],
    queryFn: () => fetchTreatmentEvidencePage(patient.id, null),
    enabled: darfLesen,
    // Beim Öffnen der Akte immer der aktuelle Stand: Wer gerade finalisiert
    // hat, soll das hier sofort sehen.
    staleTime: 0,
    retry: false,
  });

  if (!darfLesen) return null;

  const letzter = data?.[0] ?? null;
  const stand = letzter ? dokumentationsstand(letzter) : null;

  return (
    <Section titel="Letzter Behandlungsstand">
      {isPending ? <LoadingState label="Behandlungsstand wird geladen …" /> : null}
      {isError ? <ErrorState title="Der Behandlungsstand konnte nicht geladen werden." /> : null}

      {data && !letzter ? (
        <p className="text-ink-muted text-[0.9375rem]">
          Für diese Person gibt es noch keinen begonnenen Termin.
        </p>
      ) : null}

      {letzter && stand ? (
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="text-ink text-[0.9375rem] font-medium">
              {formatLocalDate(letzter.starts_at, letzter.organization_time_zone)}
            </p>
            <Badge>{appointmentStatusLabels[letzter.appointment_status]}</Badge>
          </div>
          <p className="text-ink-muted mt-0.5 text-sm">
            {formatLocalTimeRange(
              letzter.starts_at,
              letzter.ends_at,
              letzter.organization_time_zone,
            )}
            {` · ${appointmentTypeLabels[letzter.appointment_type]}`}
            {` · ${staffName(letzter)}`}
          </p>

          {/* Der offene Stand wird als solcher benannt statt nur beschrieben:
              Er ist die Aufgabe, nicht die Auskunft. */}
          <p className={`mt-2 text-[0.9375rem] ${stand.offen ? 'text-warnung' : 'text-ink'}`}>
            {stand.text}
          </p>

          <div className="flex flex-wrap items-center gap-x-4">
            <Link
              to={mitRueckweg(`/termine/${letzter.appointment_id}`, `/patienten/${patient.id}`)}
              className="text-accent inline-flex min-h-11 items-center text-sm hover:underline"
            >
              Zum Termin
            </Link>
            <Link
              to={`/patienten/${patient.id}/verlauf`}
              className="text-accent inline-flex min-h-11 items-center text-sm hover:underline"
            >
              Behandlungsverlauf
            </Link>
          </div>
        </div>
      ) : null}
    </Section>
  );
}
