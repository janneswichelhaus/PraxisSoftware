import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Disclosure } from '@/components/ui/Card';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Section } from '@/components/ui/Section';
import { formatDate } from '@/lib/datum';
import { usePatientRecord } from '@/features/patients/akte';
import type { Patient } from '@/features/patients/api';
import { Behandlungsliege } from '@/features/patients/Behandlungsliege';
import {
  canReadPatientDirectory,
  canWriteQuestionnaire,
  type CurrentUser,
} from '@/features/session/types';
import { erhebungenQueryKey, fetchErhebungen, type Erhebung } from './api';
import { erhebenPfad } from './darstellung';
import { ErhebungAnsicht } from './ErhebungAnsicht';
import { Hervorhebungen } from './Hervorhebungen';
import { erhebbareInstrumente, instrumentFuer } from './instrumente';
import type { ScoreDefinition } from './schema';
import { VerlaufAbschnitt } from './VerlaufAbschnitt';

/**
 * Der Befund in der Akte (FRB-EPIC-002).
 *
 * Eine Frage je Abschnitt: Was hat die Person im Anamnesebogen gesagt — und
 * wo liegt ein Bogen noch als Entwurf? Erhoben wird auf einer eigenen Seite
 * außerhalb des Rahmens, damit ein Tap auf die Bereichsleiste keine halbe
 * Anamnese verwirft (UX-009).
 *
 * Lesen dürfen die vier Praxisrollen, jeder gelieferte Bogen wird auf dem
 * Server protokolliert (ADR-010). Erheben nur die behandelnden Rollen; die
 * Schaltflächen sind Darstellung, verbindlich prüft der Server (ADR-004).
 *
 * Oben steht die Behandlungsliege (FRB-003c): gesetzt wird sie beim
 * Erstbefund, gebraucht beim Tagesstart (§9). Es ist dasselbe Merkmal wie in
 * den Stammdaten mit demselben Schreibpfad — kein zweiter Wert (ANN-116).
 * Sie steht auch dann, wenn die Fragebögen nicht laden.
 */
export function PatientBefundPage() {
  const { patient, user } = usePatientRecord();
  return <Befund patient={patient} user={user} />;
}

interface BefundProps {
  patient: Patient;
  user: CurrentUser;
  /** Nur für Tests; die Anwendung nutzt die Bibliothek des Releases. */
  scores?: ScoreDefinition[];
}

export function Befund(props: BefundProps) {
  return (
    <>
      {canReadPatientDirectory(props.user.roles) ? (
        <Section
          titel="Behandlungsliege"
          hinweis="Wird die Liege beim Hausbesuch gebraucht? Die Übersicht zeigt es morgens beim Tagesstart."
          rahmen
        >
          <Behandlungsliege patient={props.patient} darfAendern />
        </Section>
      ) : null}
      <Frageboegen {...props} />
    </>
  );
}

function Frageboegen({ patient, user, scores }: BefundProps) {
  const erhebungen = useQuery({
    queryKey: erhebungenQueryKey(patient.id),
    queryFn: () => fetchErhebungen(patient.id),
  });
  const darfErheben = canWriteQuestionnaire(user.roles);

  if (erhebungen.isPending) return <LoadingState label="Fragebögen werden geladen …" />;
  if (erhebungen.isError) {
    return (
      <ErrorState
        title="Die Fragebögen konnten nicht geladen werden."
        description="Bitte später erneut versuchen."
      />
    );
  }

  const instrumente = erhebbareInstrumente(scores);

  return (
    <>
      {instrumente.map((instrument) => {
        const eigene = erhebungen.data.filter((e) => e.instrument_id === instrument.meta.id);
        const offenerEntwurf = eigene.find((e) => e.status === 'entwurf');
        return (
          <Section
            key={instrument.meta.id}
            titel={instrument.meta.name_de}
            aktion={
              darfErheben ? (
                <ButtonLink
                  to={erhebenPfad(patient.id, instrument.meta.id, {
                    ...(offenerEntwurf ? { entwurf: offenerEntwurf.id } : {}),
                  })}
                  variant={offenerEntwurf ? 'secondary' : 'primary'}
                >
                  {offenerEntwurf ? 'Entwurf weiter ausfüllen' : 'Bogen erheben'}
                </ButtonLink>
              ) : undefined
            }
          >
            {eigene.length === 0 ? (
              <p className="text-ink-muted text-sm">Noch nicht erhoben.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {eigene.map((erhebung) => (
                  <ErhebungKarte
                    key={erhebung.id}
                    erhebung={erhebung}
                    alle={eigene}
                    definition={instrument}
                    patientId={patient.id}
                    darfErheben={darfErheben}
                  />
                ))}
              </ul>
            )}
          </Section>
        );
      })}
      <FremdeInstrumente erhebungen={erhebungen.data} scores={scores} />
      <VerlaufAbschnitt
        patientId={patient.id}
        erhebungen={erhebungen.data}
        instrumente={instrumente}
        darfSetzen={darfErheben}
        zeitzone={user.organizationTimeZone}
      />
    </>
  );
}

function ErhebungKarte({
  erhebung,
  alle,
  definition,
  patientId,
  darfErheben,
}: {
  erhebung: Erhebung;
  /** Alle Erhebungen desselben Instruments - für den Stand einer Korrektur. */
  alle: readonly Erhebung[];
  definition: ScoreDefinition;
  patientId: string;
  darfErheben: boolean;
}) {
  const nachfolger = alle.find((e) => e.id === erhebung.superseded_by_response_id);
  const ersetzt = nachfolger?.status === 'abgeschlossen';
  const korrigierbar = darfErheben && erhebung.status === 'abgeschlossen' && !nachfolger;

  return (
    <li className="border-line bg-surface rounded-card border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-ink font-medium">Erhoben am {formatDate(erhebung.recorded_on)}</p>
        {erhebung.status === 'entwurf' ? (
          <Badge ton="warnung">Entwurf</Badge>
        ) : ersetzt ? (
          <Badge ton="neutral">durch Korrektur ersetzt</Badge>
        ) : nachfolger ? (
          <Badge ton="positiv">abgeschlossen · Korrektur im Entwurf</Badge>
        ) : (
          <Badge ton="positiv">abgeschlossen</Badge>
        )}
      </div>
      <p className="text-ink-muted mt-1 text-sm">
        {erhebung.author_name ? `Erfasst von ${erhebung.author_name}` : 'Erfasst'}
        {erhebung.completed_at
          ? ` · abgeschlossen am ${formatDate(erhebung.completed_at.slice(0, 10))}`
          : ''}
        {erhebung.definition_version !== definition.meta.version
          ? ` · Version ${erhebung.definition_version} des Bogens`
          : ''}
      </p>
      {erhebung.change_reason ? (
        <p className="text-ink mt-1 text-sm">Korrektur: {erhebung.change_reason}</p>
      ) : null}
      {/* Hervorgehoben wird am geltenden, abgeschlossenen Bogen; ein Entwurf ist
          noch keine Angabe, ein ersetzter steht nicht neben seiner Korrektur. */}
      {erhebung.status === 'abgeschlossen' && !ersetzt ? (
        <Hervorhebungen
          definition={definition}
          antworten={erhebung.answers}
          datum={erhebung.recorded_on}
        />
      ) : null}
      <Disclosure summary="Antworten">
        <ErhebungAnsicht definition={definition} antworten={erhebung.answers} />
      </Disclosure>
      {korrigierbar ? (
        <div className="mt-3">
          <ButtonLink
            to={erhebenPfad(patientId, definition.meta.id, { korrigiert: erhebung.id })}
            variant="secondary"
          >
            Korrigieren
          </ButtonLink>
        </div>
      ) : null}
    </li>
  );
}

/**
 * Eine Erhebung zu einem Instrument, das nicht mehr aktiv ist, verschwindet
 * nicht — sie bleibt Teil der Akte. Sie steht hier, lesbar, ohne Aktion.
 */
function FremdeInstrumente({
  erhebungen,
  scores,
}: {
  erhebungen: Erhebung[];
  scores: ScoreDefinition[] | undefined;
}) {
  const aktiv = new Set(erhebbareInstrumente(scores).map((s) => s.meta.id));
  const uebrige = erhebungen.filter((e) => !aktiv.has(e.instrument_id));
  if (uebrige.length === 0) return null;

  return (
    <Section titel="Weitere Erhebungen">
      <ul className="flex flex-col gap-3">
        {uebrige.map((erhebung) => {
          const definition = instrumentFuer(erhebung.instrument_id, scores);
          return (
            <li key={erhebung.id} className="border-line bg-surface rounded-card border p-4">
              <p className="text-ink font-medium">
                {definition?.meta.name_de ?? erhebung.instrument_id} ·{' '}
                {formatDate(erhebung.recorded_on)}
              </p>
              {definition ? (
                <Disclosure summary="Antworten">
                  <ErhebungAnsicht definition={definition} antworten={erhebung.answers} />
                </Disclosure>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
