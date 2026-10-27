import { useQuery } from '@tanstack/react-query';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { ErrorState } from '@/components/ui/Feedback';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { ListRow } from '@/components/ui/ListRow';
import { Section } from '@/components/ui/Section';
import { VERBINDUNG_PRUEFEN } from '@/components/ui/abfrageTexte';
import { mitRueckweg } from '@/lib/rueckweg';
import { abfragen } from './eingang';
import { formatDay } from './format';

/**
 * „Verordnungen zu erfassen" (PRX-011): Fotos vom Termin, die noch an keiner
 * Grundlage hängen. Die Zeile führt in die Akte; daneben „Erfassen" ins
 * Formular „Grundlage erfassen" mit dem Foto daneben. Beim Speichern hängt das
 * Foto an der neuen Grundlage und verschwindet hier.
 *
 * Die Liste zeigt kein Bild und erzeugt keinen Verweis (ADR-017 Punkt 15) -
 * geöffnet wird das Foto erst im Formular, auf Tipp. Ohne Foto keine Gruppe.
 */
export function PrescriptionsToCapture({ timeZone }: { timeZone: string }) {
  const { data, isError, refetch } = useQuery(abfragen.scans());

  if (isError && !data) {
    return (
      <Section titel="Verordnungen zu erfassen">
        <ErrorState
          title="Die Verordnungen zum Erfassen konnten nicht geladen werden."
          description={VERBINDUNG_PRUEFEN}
          onErneut={() => refetch()}
        />
      </Section>
    );
  }
  if (!data || data.length === 0) return null;

  return (
    <Listenabschnitt titel="Verordnungen zu erfassen" anzahl={data.length}>
      {data.map((scan) => {
        const name = `${scan.patient_given_name} ${scan.patient_family_name}`;
        return (
          <ListRow
            key={scan.file_id}
            titel={`${scan.patient_family_name}, ${scan.patient_given_name}`}
            meta={`Foto vom ${formatDay(scan.uploaded_at, timeZone)}${
              scan.uploaded_by_name ? ` · ${scan.uploaded_by_name}` : ''
            }`}
            to={mitRueckweg(`/patienten/${scan.patient_id}`, '/offen')}
            aktion={
              <ButtonLink
                to={mitRueckweg(
                  `/patienten/${scan.patient_id}/verordnungen/neu?scan=${scan.file_id}`,
                  '/offen',
                )}
                variant="secondary"
                aria-label={`Grundlage erfassen: ${name}`}
              >
                Erfassen
              </ButtonLink>
            }
          />
        );
      })}
    </Listenabschnitt>
  );
}
