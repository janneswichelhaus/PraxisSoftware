import { useQuery } from '@tanstack/react-query';
import { ErrorState } from '@/components/ui/Feedback';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { ListRow } from '@/components/ui/ListRow';
import { Section } from '@/components/ui/Section';
import { StatusMark } from '@/components/ui/StatusMark';
import { VERBINDUNG_PRUEFEN } from '@/components/ui/abfrageTexte';
import { bauartLabels } from '@/features/treatment-bases/api';
import { formatDate } from '@/lib/datum';
import { mitRueckweg } from '@/lib/rueckweg';
import { abfragen } from './eingang';
import { formatDay } from './format';
import { Anrufknopf } from './Symbole';

/**
 * „Verordnung endet" (PRX-016): Verordnungen ohne Anschluss, deren Termine
 * genutzt oder ganz verplant sind und deren letzter Termin in den nächsten
 * zwei Wochen ist. Die Liste sagt, ob eine Empfehlung zum Verordnungsende
 * vorliegt - geschrieben wird sie im Therapiebericht, nicht hier (DOK-005).
 * Keine Bewertung: ob es weitergeht, entscheiden Therapeut:in und
 * Verordner:in (§17). Die Zeile führt zu den Verordnungen der Person; daneben
 * der Anruf bei der Verordner:in. Endet keine, keine Gruppe.
 */
export function EndingPrescriptions({ timeZone }: { timeZone: string }) {
  const { data, isError, refetch } = useQuery(abfragen.verordnungEndet());

  if (isError && !data) {
    return (
      <Section titel="Verordnung endet">
        <ErrorState
          title="Die endenden Verordnungen konnten nicht geladen werden."
          description={VERBINDUNG_PRUEFEN}
          onErneut={() => refetch()}
        />
      </Section>
    );
  }
  if (!data || data.length === 0) return null;

  return (
    <Listenabschnitt titel="Verordnung endet" anzahl={data.length}>
      {data.map((eintrag) => (
        <ListRow
          key={eintrag.treatment_basis_id}
          titel={`${eintrag.patient_family_name}, ${eintrag.patient_given_name}`}
          meta={
            <>
              {bauartLabels[eintrag.treatment_basis_kind]} vom {formatDate(eintrag.issued_on)} ·{' '}
              {Math.max(eintrag.used, eintrag.planned)} von {eintrag.prescribed} Terminen
              {eintrag.last_appointment_at
                ? ` · letzter am ${formatDay(eintrag.last_appointment_at, timeZone)}`
                : ''}
              <span className="mt-0.5 block">
                {/* Fehlt die Empfehlung, ist das die offene Arbeit: Zeichen
                    und Wort; liegt sie vor, ein leises Wort mit Haken. */}
                {eintrag.has_recommendation ? (
                  <StatusMark ton="positiv">Empfehlung liegt vor</StatusMark>
                ) : (
                  <StatusMark ton="warnung">Keine Empfehlung</StatusMark>
                )}
                {eintrag.prescriber_name ? ` · ${eintrag.prescriber_name}` : ''}
                {/* Ab 640 px steht die Nummer im Anrufknopf daneben. */}
                {eintrag.prescriber_phone ? (
                  <span className="tabular-nums sm:hidden"> · {eintrag.prescriber_phone}</span>
                ) : null}
              </span>
            </>
          }
          to={mitRueckweg(`/patienten/${eintrag.patient_id}/verordnungen`, '/offen')}
          aktion={
            eintrag.prescriber_phone ? (
              <Anrufknopf
                nummer={eintrag.prescriber_phone}
                beschriftung={`${eintrag.prescriber_name ?? 'Verordner:in'} anrufen, ${eintrag.prescriber_phone}`}
              />
            ) : null
          }
        />
      ))}
    </Listenabschnitt>
  );
}

/**
 * „Versorgung abschließen?" (PRX-016, IDEA-LZK-009): Akten ohne Abschluss,
 * seit sechs Monaten ohne Termin und ohne kommenden. Ohne Abschluss läuft
 * keine Aufbewahrungsfrist (LOE-001b) - die Liste fragt, entscheiden und
 * abschließen tut die Therapeut:in in den Stammdaten.
 */
export function CareWithoutConclusionList({ timeZone }: { timeZone: string }) {
  const { data, isError, refetch } = useQuery(abfragen.ohneAbschluss());

  if (isError && !data) {
    return (
      <Section titel="Versorgung abschließen?">
        <ErrorState
          title="Die Akten ohne Abschluss konnten nicht geladen werden."
          description={VERBINDUNG_PRUEFEN}
          onErneut={() => refetch()}
        />
      </Section>
    );
  }
  if (!data || data.length === 0) return null;

  return (
    <Listenabschnitt
      titel="Versorgung abschließen?"
      anzahl={data.length}
      mehr={
        // Die Frist hängt am Abschluss (ADR-008) - deshalb steht der Satz
        // da, als Kleingedrucktes.
        <Kleingedrucktes>
          Seit sechs Monaten kein Termin und keiner geplant. Ist die Behandlung beendet, gehört der
          Abschluss in die Stammdaten – erst mit ihm läuft die Aufbewahrungsfrist.
        </Kleingedrucktes>
      }
    >
      {data.map((eintrag) => (
        <ListRow
          key={eintrag.patient_id}
          titel={`${eintrag.patient_family_name}, ${eintrag.patient_given_name}`}
          meta={
            eintrag.last_appointment_at
              ? `Letzter Termin am ${formatDay(eintrag.last_appointment_at, timeZone)}`
              : `Ohne Termin, angelegt am ${formatDay(eintrag.patient_created_at, timeZone)}`
          }
          to={mitRueckweg(`/patienten/${eintrag.patient_id}/stammdaten`, '/offen')}
        />
      ))}
    </Listenabschnitt>
  );
}
