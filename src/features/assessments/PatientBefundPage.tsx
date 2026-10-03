import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Card, Disclosure } from '@/components/ui/Card';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { Textlink } from '@/components/ui/Textlink';
import { usePatientRecord } from '@/features/patients/akte';
import { formatDate } from '@/lib/datum';
import { todayInTimeZone } from '@/features/appointments/api';
import type { Patient } from '@/features/patients/api';
import { Behandlungsliege } from '@/features/patients/Behandlungsliege';
import {
  canReadPatientDirectory,
  canWriteQuestionnaire,
  type CurrentUser,
} from '@/features/session/types';
import { erhebungenQueryKey, erhebungVerwerfen, fetchErhebungen, type Erhebung } from './api';
import { erhebenPfad } from './darstellung';
import { ErhebungAnsicht } from './ErhebungAnsicht';
import { Hervorhebungen } from './Hervorhebungen';
import { erhebbareInstrumente, fassungFuer, instrumentFuer } from './instrumente';
import type { ScoreDefinition } from './schema';
import { VerlaufAbschnitt } from './VerlaufAbschnitt';

/**
 * Der Befund in der Akte (FRB-EPIC-002), seit AKTE-007 im Reiter „Doku".
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
        // UX-005e: Ohne erklärenden Satz - die Überschrift und die beiden
        // Knöpfe sagen, worum es geht.
        <Section titel="Behandlungsliege" rahmen>
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
  // Nur ohne Daten ersetzt der Fehler den Befund (ZST-03): Ein gescheitertes
  // Nachladen lässt den zuletzt geladenen Stand stehen.
  if (erhebungen.data === undefined) {
    return (
      <ErrorState
        title="Die Fragebögen konnten nicht geladen werden."
        description="Bitte die Verbindung prüfen und erneut versuchen."
        onErneut={() => erhebungen.refetch()}
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
                    zeitzone={user.organizationTimeZone}
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

/**
 * Der Stand einer Erhebung als Etikett, groß geschrieben wie die übrigen
 * Etiketten der Anwendung (WRT-16).
 *
 * UX-005e: Der Regelfall - abgeschlossen und geltend - trägt kein Etikett;
 * markiert sind Entwurf und Korrektur.
 */
function Zustand({ erhebung, alle }: { erhebung: Erhebung; alle: readonly Erhebung[] }) {
  const nachfolger = alle.find((e) => e.id === erhebung.superseded_by_response_id);
  if (erhebung.status === 'entwurf') return <Badge ton="warnung">Entwurf</Badge>;
  if (nachfolger?.status === 'abgeschlossen') {
    return <Badge ton="neutral">Durch Korrektur ersetzt</Badge>;
  }
  if (nachfolger) return <Badge ton="positiv">Abgeschlossen · Korrektur im Entwurf</Badge>;
  return null;
}

/**
 * Herkunft einer Erhebung - nur, wo sie etwas über „Erhoben am" hinaus sagt
 * (UX-005e): ein anderer Tag des Abschlusses, eine andere Person als die
 * erfassende, oder eine ältere Fassung des Bogens.
 */
function herkunftszeile(
  erhebung: Erhebung,
  aktuell: ScoreDefinition,
  angezeigt: ScoreDefinition,
): string | null {
  const teile: string[] = [];
  const abschlusstag = erhebung.completed_at?.slice(0, 10) ?? null;
  const andererTag = abschlusstag !== null && abschlusstag !== erhebung.recorded_on;
  const anderePerson =
    erhebung.completed_by_name !== null && erhebung.completed_by_name !== erhebung.author_name;
  if (andererTag || anderePerson) {
    teile.push(erhebung.author_name ? `Erfasst von ${erhebung.author_name}` : 'Erfasst');
    if (abschlusstag) teile.push(`abgeschlossen am ${formatDate(abschlusstag)}`);
  }
  // „Fassung" für die Definition, wie in der Meldung der Erhebungsseite und
  // in den Instrumenten (BEF-16). Gezeigt wird die Erhebung in ihrer eigenen
  // Fassung (ABN-014); nur wenn die nicht im Release liegt, in der aktuellen.
  if (erhebung.definition_version !== aktuell.meta.version) {
    teile.push(
      angezeigt.meta.version === erhebung.definition_version
        ? `Fassung ${erhebung.definition_version} des Bogens`
        : `Fassung ${erhebung.definition_version} liegt nicht vor, gezeigt in Fassung ${angezeigt.meta.version}`,
    );
  }
  return teile.length > 0 ? teile.join(' · ') : null;
}

/** Die Fassung, mit der eine Erhebung erhoben wurde, sonst die aktuelle (ABN-014). */
function angezeigteFassung(erhebung: Erhebung, aktuell: ScoreDefinition): ScoreDefinition {
  return fassungFuer(erhebung.instrument_id, erhebung.definition_version) ?? aktuell;
}

/** Der Tag, an dem korrigiert wurde - getrennt vom Erhebungstag (BEF-101 Punkt 2). */
function korrekturtag(erhebung: Erhebung, zeitzone: string | null): string {
  return formatDate(
    zeitzone
      ? todayInTimeZone(zeitzone, new Date(erhebung.created_at))
      : erhebung.created_at.slice(0, 10),
  );
}

/**
 * Einen Entwurf aus der Akte verwerfen (BEF-02) - derselbe Serverweg wie auf
 * der Erhebungsseite, und wie dort erst nach einer Rückfrage (BEF-01). Ohne
 * diesen Weg blieb ein Entwurf aus einer früheren Fassung des Bogens stehen,
 * und in der Akte ließ sich kein neuer Bogen mehr beginnen.
 */
function EntwurfVerwerfen({ erhebung, patientId }: { erhebung: Erhebung; patientId: string }) {
  const queryClient = useQueryClient();
  const verwerfen = useMutation({
    mutationFn: () => erhebungVerwerfen(erhebung.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: erhebungenQueryKey(patientId) }),
  });

  return (
    <Rueckfrage
      ausloeser="Entwurf verwerfen"
      ausloeserVariante="quiet"
      bezeichnung={`Entwurf vom ${formatDate(erhebung.recorded_on)} verwerfen`}
      bestaetigen="Ja, Entwurf verwerfen"
      bestaetigenLaeuft="Wird verworfen …"
      fehler={verwerfen.isError ? verwerfen.error.message : undefined}
      onAbbrechen={() => verwerfen.reset()}
      onBestaetigen={() => verwerfen.mutateAsync()}
    >
      Die gespeicherten Antworten dieses Entwurfs werden gelöscht.
    </Rueckfrage>
  );
}

function ErhebungKarte({
  erhebung,
  alle,
  definition,
  patientId,
  darfErheben,
  zeitzone,
}: {
  erhebung: Erhebung;
  /** Alle Erhebungen desselben Instruments - für den Stand einer Korrektur. */
  alle: readonly Erhebung[];
  /** Die aktuelle Fassung des Instruments. */
  definition: ScoreDefinition;
  patientId: string;
  darfErheben: boolean;
  zeitzone: string | null;
}) {
  const nachfolger = alle.find((e) => e.id === erhebung.superseded_by_response_id);
  const ersetzt = nachfolger?.status === 'abgeschlossen';
  const korrigierbar = darfErheben && erhebung.status === 'abgeschlossen' && !nachfolger;
  const verwerfbar = darfErheben && erhebung.status === 'entwurf';
  const fassung = angezeigteFassung(erhebung, definition);
  const herkunft = herkunftszeile(erhebung, definition, fassung);

  return (
    <li>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-ink font-medium">Erhoben am {formatDate(erhebung.recorded_on)}</p>
          <Zustand erhebung={erhebung} alle={alle} />
        </div>
        {herkunft ? <p className="text-ink-muted mt-1 text-sm">{herkunft}</p> : null}
        {erhebung.change_reason ? (
          <p className="text-ink mt-1 text-sm">
            Korrektur vom {korrekturtag(erhebung, zeitzone)}: {erhebung.change_reason}
          </p>
        ) : null}
        {/* Hervorgehoben wird am geltenden, abgeschlossenen Bogen; ein Entwurf ist
            noch keine Angabe, ein ersetzter steht nicht neben seiner Korrektur. */}
        {erhebung.status === 'abgeschlossen' && !ersetzt ? (
          <Hervorhebungen
            definition={fassung}
            antworten={erhebung.answers}
            datum={erhebung.recorded_on}
          />
        ) : null}
        <Disclosure summary="Antworten">
          <ErhebungAnsicht definition={fassung} antworten={erhebung.answers} />
        </Disclosure>
        {korrigierbar || verwerfbar ? (
          <div className="mt-3 flex flex-wrap gap-3">
            {korrigierbar ? (
              <ButtonLink
                to={erhebenPfad(patientId, definition.meta.id, { korrigiert: erhebung.id })}
                variant="secondary"
              >
                Korrigieren
              </ButtonLink>
            ) : null}
            {verwerfbar ? <EntwurfVerwerfen erhebung={erhebung} patientId={patientId} /> : null}
          </div>
        ) : null}
      </Card>
    </li>
  );
}

/**
 * Eine Erhebung zu einem Instrument, das nicht mehr aktiv ist, verschwindet
 * nicht — sie bleibt Teil der Akte. Sie steht hier, lesbar, mit ihrem Stand
 * wie oben (BEF-02), ohne Aktion.
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
          const aktuell = instrumentFuer(erhebung.instrument_id, scores);
          const definition = aktuell ? angezeigteFassung(erhebung, aktuell) : undefined;
          return (
            <li key={erhebung.id}>
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-ink font-medium">
                    {definition?.meta.name_de ?? erhebung.instrument_id} ·{' '}
                    {formatDate(erhebung.recorded_on)}
                  </p>
                  <Zustand erhebung={erhebung} alle={erhebungen} />
                </div>
                {definition ? (
                  <Disclosure summary="Antworten">
                    <ErhebungAnsicht definition={definition} antworten={erhebung.answers} />
                  </Disclosure>
                ) : null}
              </Card>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

/**
 * Die Befund-Seite in der Akte (`doku/befund`, Akte entschlacken, 2026-10-03):
 * Bögen, Liege und Messverlauf, erreicht über die Befund-Karte der Doku.
 */
export function PatientBefundSeite() {
  const { patient, user } = usePatientRecord();
  return (
    <>
      <Textlink alleinstehend to={`/patienten/${patient.id}/doku`} className="mb-4 gap-1">
        <span aria-hidden="true">←</span> Zur Doku
      </Textlink>
      <Befund patient={patient} user={user} />
    </>
  );
}
