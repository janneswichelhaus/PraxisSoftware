import { useQuery } from '@tanstack/react-query';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Section } from '@/components/ui/Section';
import { formatDay } from './format';
import { fetchOffeneScans } from '@/features/files/api';
import { mitRueckweg } from '@/lib/rueckweg';

export const OPEN_SCANS_KEY = ['open-points', 'prescription-scans'] as const;

/**
 * „Verordnungen zu erfassen" (PRX-011): Fotos vom Termin, die noch an keiner
 * Grundlage hängen. Jede Zeile führt ins Formular „Grundlage erfassen" mit dem
 * Foto daneben; beim Speichern hängt das Foto an der neuen Grundlage und
 * verschwindet hier.
 *
 * Die Liste zeigt kein Bild und erzeugt keinen Verweis (ADR-017 Punkt 15) -
 * geöffnet wird das Foto erst im Formular, auf Tipp.
 */
export function PrescriptionsToCapture({ timeZone }: { timeZone: string }) {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: OPEN_SCANS_KEY,
    queryFn: fetchOffeneScans,
    retry: false,
  });

  return (
    <Section
      titel={
        data && data.length > 0
          ? `Verordnungen zu erfassen (${data.length})`
          : 'Verordnungen zu erfassen'
      }
    >
      {isPending ? <LoadingState label="Verordnungen werden geladen …" /> : null}
      {isError ? (
        <ErrorState
          title="Die Verordnungen zum Erfassen konnten nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => refetch()}
        />
      ) : null}
      {/* Leer als ein Satz, nicht als großer Block: Die Seite trägt mehrere
          Listen, und leere Blöcke untereinander wären Lärm. */}
      {data && data.length === 0 ? (
        <p className="text-ink-muted text-sm">Keine Verordnung wartet aufs Erfassen.</p>
      ) : null}
      {data && data.length > 0 ? (
        <ul className="divide-line border-line bg-surface rounded-card divide-y border px-4 sm:px-5">
          {data.map((scan) => (
            <li
              key={scan.file_id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div className="min-w-0 wrap-anywhere">
                <p className="text-ink text-liste font-medium">
                  {scan.patient_family_name}, {scan.patient_given_name}
                </p>
                <p className="text-ink-muted text-sm">
                  Foto vom {formatDay(scan.uploaded_at, timeZone)}
                  {scan.uploaded_by_name ? ` · ${scan.uploaded_by_name}` : ''}
                </p>
              </div>
              <ButtonLink
                to={mitRueckweg(
                  `/patienten/${scan.patient_id}/verordnungen/neu?scan=${scan.file_id}`,
                  '/offen',
                )}
                variant="secondary"
                groesse="kompakt"
              >
                Grundlage erfassen
                <span className="sr-only">
                  : {scan.patient_given_name} {scan.patient_family_name}
                </span>
              </ButtonLink>
            </li>
          ))}
        </ul>
      ) : null}
    </Section>
  );
}
