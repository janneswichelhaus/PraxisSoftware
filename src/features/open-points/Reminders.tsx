import { useQuery } from '@tanstack/react-query';
import { ErrorState } from '@/components/ui/Feedback';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { Textlink } from '@/components/ui/Textlink';
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
 * „Verordnung offen“ (B1, BEF-151): Personen, deren Verordnung noch Termine
 * braucht oder abzurechnen ist - die Karteileichen. Die Zeile führt zu den
 * Grundlagen der Akte; die ganze Liste steht sortiert in der Patientenliste.
 * Ersetzt „Versorgung abschließen?“: Die Frist rechnet seit ANN-511 ab der
 * letzten Behandlung, ein Abschluss ist dafür nicht mehr nötig.
 */
export function OffeneVerordnungen() {
  const { data, isError, refetch } = useQuery(abfragen.verordnungOffen());

  if (isError && !data) {
    return (
      <Section titel="Verordnung offen">
        <ErrorState
          title="Die offenen Verordnungen konnten nicht geladen werden."
          description={VERBINDUNG_PRUEFEN}
          onErneut={() => refetch()}
        />
      </Section>
    );
  }
  if (!data || data.length === 0) return null;

  return (
    <Listenabschnitt
      titel="Verordnung offen"
      anzahl={data.length}
      mehr={
        <Textlink alleinstehend to="/patienten?sort=verordnung" className="text-sm">
          In der Patientenliste
        </Textlink>
      }
    >
      {data.map((eintrag) => (
        <ListRow
          key={eintrag.id}
          titel={`${eintrag.family_name}, ${eintrag.given_name}`}
          status={
            eintrag.bases_ready > 0 ? (
              <StatusMark ton="warnung">Abrechnen</StatusMark>
            ) : (
              <StatusMark ton="warnung">Termine fehlen</StatusMark>
            )
          }
          to={mitRueckweg(`/patienten/${eintrag.id}/verordnungen`, '/offen')}
        />
      ))}
    </Listenabschnitt>
  );
}

/**
 * „Akte ohne Behandlung“ (Zweitreview A, ADR-008 Punkt 3): Akten ohne jede
 * Behandlung, Leistung und ohne Abschluss, seit sechs Monaten ohne Termin und
 * ohne kommenden. Sie haben keinen Fristanker (ANN-511) und stünden sonst
 * unbemerkt. Die Liste fragt nur; den Abschluss setzt die Therapeut:in in den
 * Stammdaten.
 */
export function AktenOhneBehandlung({ timeZone }: { timeZone: string }) {
  const { data, isError, refetch } = useQuery(abfragen.ohneBehandlung());

  if (isError && !data) {
    return (
      <Section titel="Akte ohne Behandlung">
        <ErrorState
          title="Die Akten ohne Behandlung konnten nicht geladen werden."
          description={VERBINDUNG_PRUEFEN}
          onErneut={() => refetch()}
        />
      </Section>
    );
  }
  if (!data || data.length === 0) return null;

  return (
    <Listenabschnitt
      titel="Akte ohne Behandlung"
      anzahl={data.length}
      mehr={
        // Ein Rechtssatz zur Frist (DESIGN.md Regel 6) - deshalb Kleingedrucktes.
        <Kleingedrucktes>
          Ohne Behandlung läuft keine Aufbewahrungsfrist. Ist nichts mehr geplant, gehört der
          Abschluss in die Stammdaten.
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
