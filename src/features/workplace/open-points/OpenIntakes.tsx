import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { ErrorState } from '@/components/ui/Feedback';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { ListRow } from '@/components/ui/ListRow';
import { Section } from '@/components/ui/Section';
import { VERBINDUNG_PRUEFEN } from '@/components/ui/abfrageTexte';
import { mitRueckweg } from '@/lib/rueckweg';
import { abfragen } from './eingang';
import { intakeItemLabels, intakeItemTarget, openItemsText } from '@/features/patients';

/** So viele Zeilen zeigt die Gruppe, bevor „Alle … anzeigen" kommt. */
const KURZ = 5;

/**
 * „Erstaufnahme offen" (PRX-013): Personen in Versorgung, bei denen einer der
 * Punkte fehlt. Die Zeile führt in die Akte, der Knopf daneben an die Stelle,
 * an der der erste offene Punkt erledigt wird - und die Zeile verschwindet
 * von allein, sobald alles dort steht. Sind alle vollständig, keine Gruppe.
 *
 * Die Liste ist oft ein Rückstand, kein Tagesgeschäft: Sie zeigt die ersten
 * fünf, der Rest steht hinter „Alle … anzeigen" (die Zahl steht im Titel).
 */
export function OpenIntakes() {
  const { data, isError, refetch } = useQuery(abfragen.erstaufnahmen());
  const [alle, setAlle] = useState(false);

  if (isError && !data) {
    return (
      <Section titel="Erstaufnahme offen">
        <ErrorState
          title="Die offenen Erstaufnahmen konnten nicht geladen werden."
          description={VERBINDUNG_PRUEFEN}
          onErneut={() => refetch()}
        />
      </Section>
    );
  }
  if (!data || data.length === 0) return null;
  // Eine einzelne weitere Zeile steht gleich da - ein Knopf für eine Zeile
  // wäre länger als sie.
  const kuerzbar = data.length > KURZ + 1;
  const sichtbar = kuerzbar && !alle ? data.slice(0, KURZ) : data;

  return (
    <Listenabschnitt
      titel="Erstaufnahme offen"
      anzahl={data.length}
      mehr={
        kuerzbar ? (
          <Button type="button" variant="quiet" groesse="kompakt" onClick={() => setAlle(!alle)}>
            {alle ? 'Weniger anzeigen' : `Alle ${data.length} anzeigen`}
          </Button>
        ) : undefined
      }
    >
      {sichtbar.map((eintrag) => {
        const erster = eintrag.open_items[0];
        const name = `${eintrag.patient_given_name} ${eintrag.patient_family_name}`;
        return (
          <ListRow
            key={eintrag.patient_id}
            titel={
              <span className="wrap-anywhere">
                {eintrag.patient_family_name}, {eintrag.patient_given_name}
              </span>
            }
            // Die Gruppe heißt „Erstaufnahme offen" - ein „Offen:" je Zeile
            // wiederholte sie (UX-005h).
            meta={openItemsText(eintrag.open_items)}
            to={mitRueckweg(`/patienten/${eintrag.patient_id}`, '/offen')}
            aktion={
              erster ? (
                <ButtonLink
                  to={mitRueckweg(intakeItemTarget(eintrag.patient_id, erster), '/offen')}
                  variant="secondary"
                  aria-label={`${intakeItemLabels[erster]}: ${name}`}
                >
                  {intakeItemLabels[erster]}
                </ButtonLink>
              ) : null
            }
          />
        );
      })}
    </Listenabschnitt>
  );
}
