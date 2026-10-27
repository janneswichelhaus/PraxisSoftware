import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { DataList, DataRow } from '@/components/ui/Card';
import { KnopfGroesse } from '@/components/ui/knopfGroesse';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Section } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { Textlink } from '@/components/ui/Textlink';
import { formatDate, formatLocalDate, formatLocalTimeRange } from '@/lib/datum';
import { leseRueckweg, mitRueckweg } from '@/lib/rueckweg';
import {
  canWriteTrainingClients,
  canReadTrainingProtocols,
  canWriteTrainingProtocols,
  type CurrentUser,
} from '@/features/core';
import {
  cancelAppointment,
  type CancellationReason,
  cancellationReasonSchema,
  tageslageNeuLaden,
  waehlbareAbsagegruende,
} from '@/features/calendar';
import {
  getTrainingAppointment,
  getTrainingProtocol,
  istProtokollierbar,
  listTrainingBases,
  trainingAbsageLabels,
  vereinbarungText,
  type TrainingAppointment,
} from './api';
import { TerminAbschluss, TrainingProtokoll } from './TrainingProtocol';
import { appointmentStatusLabels, appointmentStatusTon, leseAngelegtenTermin } from '@/lib/termin';

/**
 * Ein Trainingstermin (TRN-004, TRN-006).
 *
 * Gelesen über `get_training_appointment`: Ein Behandlungstermin ist dort
 * „nicht gefunden" - auch für owner, der ihn im Kalender sieht; er öffnet an
 * seiner eigenen Stelle (`/termine/:id`). Verschieben und Absagen laufen über
 * die vorhandenen Wege (ADR-022 Punkt 1). Seit TRN-EPIC-004 steht hier das
 * Trainingsprotokoll (owner und Trainingsbetreuung, ANN-184), und der Termin
 * lässt sich als durchgeführt vermerken und wieder öffnen (ANN-186).
 */
export function TrainingAppointmentPage({ user }: { user: CurrentUser }) {
  const { appointmentId = '' } = useParams();
  const [suche] = useSearchParams();
  const termin = useQuery({
    queryKey: ['training-appointment', appointmentId],
    queryFn: () => getTrainingAppointment(appointmentId),
    retry: false,
  });

  // Ein gescheitertes Nachladen nach einem Vorgang ersetzt die Seite nicht:
  // Im Protokoll darunter kann ungespeicherter Text stehen (Zweitreview 4).
  if (termin.data) return <Ansicht termin={termin.data} user={user} />;
  return (
    <>
      <Rueckweg standard={leseRueckweg(suche, '/kalender')} />
      <PageHeader title="Trainingstermin" />
      <Abfragezustand
        abfrage={termin}
        laden="Trainingstermin wird geladen …"
        fehler="Der Trainingstermin konnte nicht geladen werden."
        inKarte
        leer={{ wenn: (wert) => wert === null, titel: 'Trainingstermin nicht gefunden' }}
      >
        {() => null}
      </Abfragezustand>
    </>
  );
}

function Ansicht({ termin, user }: { termin: TrainingAppointment; user: CurrentUser }) {
  const [suche] = useSearchParams();
  // Jede Meldung ist eine neue Zeile und nimmt den Fokus erneut (`Rueckmeldung`).
  const [meldung, setMeldung] = useState<{ text: string; nummer: number } | null>(null);
  const zone = termin.organization_time_zone;
  const name = `${termin.client_given_name} ${termin.client_family_name}`;
  const darfSchreiben = canWriteTrainingClients(user.roles);
  const darfAendern = darfSchreiben && termin.status === 'confirmed';
  const darfAbschliessen =
    darfSchreiben && (termin.status === 'confirmed' || termin.status === 'completed');
  // ERN-012: Die Ernährungsberatung ist keine Trainingseinheit - ohne
  // Protokoll; mit dem Haken ist die Sitzung erfasst (ANN-664).
  const beratung = termin.occasion === 'nutrition_counselling';
  const darfProtokoll =
    !beratung && canWriteTrainingProtocols(user.roles) && istProtokollierbar(termin.status);
  // ABN-022 (BEF-113): Das Büro liest das Protokoll, schreibt es aber nicht.
  const liestProtokoll = !beratung && canReadTrainingProtocols(user.roles);
  const zeigtProtokoll = liestProtokoll && istProtokollierbar(termin.status);
  const angelegt = leseAngelegtenTermin(suche) === termin.id;
  const hier = `/training/termine/${termin.id}`;

  const vereinbarungen = useQuery({
    queryKey: ['training-bases', termin.training_relationship_id],
    queryFn: () => listTrainingBases(termin.training_relationship_id),
    enabled: termin.training_basis_id !== null,
    retry: false,
  });
  const vereinbarung = vereinbarungen.data?.find((v) => v.id === termin.training_basis_id);

  const ort =
    termin.appointment_type === 'practice'
      ? (termin.location_name ?? '—')
      : termin.appointment_type === 'video'
        ? 'Videotermin'
        : [
            [termin.visit_street, termin.visit_house_number].filter(Boolean).join(' '),
            [termin.visit_postal_code, termin.visit_city].filter(Boolean).join(' '),
          ]
            .filter(Boolean)
            .join(', ');

  function gemeldet(text: string) {
    setMeldung((bisher) => ({ text, nummer: (bisher?.nummer ?? 0) + 1 }));
  }

  return (
    <>
      <Rueckweg standard={leseRueckweg(suche, '/kalender')} />
      {/* Kopf wie das Termin-Fenster (Referenz, DESIGN.md): die Gattung als
          Zeile darüber, der Name als Weg zur Trainingskund:in (UX-012), Tag
          und Zeit darunter. */}
      <PageHeader
        kicker={beratung ? 'Ernährungsberatung' : 'Trainingstermin'}
        title={
          <Textlink to={mitRueckweg(`/training/${termin.training_relationship_id}`, hier)}>
            {name}
          </Textlink>
        }
        description={`${formatLocalDate(termin.starts_at, zone)}, ${formatLocalTimeRange(termin.starts_at, termin.ends_at, zone)}`}
        actions={
          // „Bestätigt" ist der Regelfall und trägt kein Abzeichen (UX-005i).
          termin.status === 'confirmed' ? null : (
            <Badge ton={appointmentStatusTon[termin.status]}>
              {appointmentStatusLabels[termin.status]}
            </Badge>
          )
        }
      />

      {/* Die Bestätigung steht unter dem Kopf und nimmt den Fokus (TER-04). */}
      {meldung ? (
        <Rueckmeldung key={meldung.nummer} className="mb-6">
          {meldung.text}
        </Rueckmeldung>
      ) : angelegt ? (
        <Rueckmeldung className="mb-6">Trainingstermin angelegt.</Rueckmeldung>
      ) : null}

      {/* Die Angaben als kurze Zeilen statt als Liste untereinander: Am
          Telefon steht das Protokoll so früher im Bild. */}
      <Section titel="Termin" rahmen>
        <DataList>
          <DataRow label="Betreuende Person">
            {`${termin.staff_given_name} ${termin.staff_family_name}`}
          </DataRow>
          {/* Keine Zeile „Art": Der Ort sagt schon, ob Praxis, Video oder
              Anschrift (UX-005i). */}
          <DataRow label="Ort">{ort || '—'}</DataRow>
          <DataRow label="Vereinbarung">
            {termin.training_basis_id === null
              ? 'Einzelstunde ohne Vereinbarung'
              : vereinbarung
                ? `Seit ${formatDate(vereinbarung.started_on)} · ${vereinbarungText(vereinbarung)}`
                : 'Vereinbarung'}
          </DataRow>
          {termin.status === 'cancelled' && termin.cancellation_reason ? (
            <DataRow label="Absagegrund">
              {trainingAbsageLabels[termin.cancellation_reason as CancellationReason] ?? '—'}
            </DataRow>
          ) : null}
        </DataList>

        {/* Die Vorgänge am Termin stehen in seiner Karte, kompakt wie an
            einer Karte üblich (DESIGN.md Regel 4). Der Hauptknopf der Seite
            ist der Abschluss des Protokolls in der Leiste darunter. */}
        {darfAendern || darfAbschliessen ? (
          <div className="border-line mt-3 flex flex-wrap items-start gap-2 border-t pt-3">
            <KnopfGroesse value="kompakt">
              {darfAbschliessen ? <TerminAbschluss termin={termin} onGeaendert={gemeldet} /> : null}
              {darfAendern ? (
                <ButtonLink to={mitRueckweg(`${hier}/bearbeiten`, hier)} variant="secondary">
                  Verschieben
                </ButtonLink>
              ) : null}
            </KnopfGroesse>
          </div>
        ) : null}
      </Section>

      {/* Das Protokoll ist das letzte Glied der Seite: Seine Leiste klebt
          über der Tableiste (DESIGN.md „Arbeitsseite“). */}
      {darfProtokoll || zeigtProtokoll ? (
        <TrainingProtokoll termin={termin} darfSchreiben={darfProtokoll} />
      ) : null}

      {/* Das Absagen leise am Ende der Seite, mit Rückfrage (DESIGN.md,
          Zerstörendes; R2-O10) - bis dahin stand es mitten in der
          Terminkarte neben „Verschieben“. */}
      {darfAendern ? (
        <div className="border-line max-w-formular mt-8 border-t pt-6">
          <Absagen
            termin={termin}
            name={name}
            liestProtokoll={liestProtokoll}
            onAbgesagt={() => gemeldet('Termin abgesagt.')}
          />
        </div>
      ) : null}
    </>
  );
}

/**
 * Absagen über `cancel_appointment` (ADR-018 Punkt 2: endgültig).
 *
 * Ohne Frage nach dem Eingang und ohne Hinweis auf ein Ausfallhonorar: Am
 * Trainingstermin setzt der Server keinen Anlass (ANN-178) - die Frage wäre
 * hier eine Behauptung.
 */
function Absagen({
  termin,
  name,
  liestProtokoll,
  onAbgesagt,
}: {
  termin: TrainingAppointment;
  name: string;
  liestProtokoll: boolean;
  onAbgesagt: () => void;
}) {
  const queryClient = useQueryClient();
  // Ein Protokollentwurf fällt mit der Absage (ANN-186). Die Rückfrage sagt
  // es vorher - auch dem Büro, das ihn seit ABN-022 lesen darf (BEF-113).
  const protokoll = useQuery({
    queryKey: ['training-protocol', termin.id],
    queryFn: () => getTrainingProtocol(termin.id),
    enabled: liestProtokoll,
    retry: false,
  });
  const entwurfGehtVerloren = protokoll.data?.status === 'draft';
  const [grund, setGrund] = useState('');
  const [grundFehler, setGrundFehler] = useState<string | undefined>(undefined);

  const mutation = useMutation({
    mutationFn: (g: CancellationReason) => cancelAppointment(termin.id, termin.updated_at, g),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['training-appointment', termin.id] });
      // UBK-011: Trainingstermine stehen in derselben Tagesroute (ADR-022).
      void tageslageNeuLaden(queryClient);
      void queryClient.invalidateQueries({ queryKey: ['training-bases'] });
      void queryClient.invalidateQueries({ queryKey: ['training-client-appointments'] });
      onAbgesagt();
    },
  });

  async function absagen() {
    const gewaehlt = cancellationReasonSchema.safeParse(grund);
    if (!gewaehlt.success) {
      setGrundFehler('Bitte einen Absagegrund auswählen.');
      throw new Error('Absagegrund fehlt');
    }
    setGrundFehler(undefined);
    await mutation.mutateAsync(gewaehlt.data);
  }

  return (
    <Rueckfrage
      ausloeser="Termin absagen"
      ausloeserVariante="quiet"
      bestaetigen="Ja, Termin absagen"
      bestaetigenLaeuft="Wird abgesagt …"
      fehler={mutation.isError ? mutation.error.message : undefined}
      laeuft={mutation.isPending}
      onAbbrechen={() => setGrundFehler(undefined)}
      onBestaetigen={absagen}
    >
      <p>
        Der Trainingstermin mit {name} wird als abgesagt geführt und gibt seinen Zeitraum frei. Eine
        Absage lässt sich nicht zurücknehmen – für einen neuen Termin bitte neu anlegen.
      </p>
      {entwurfGehtVerloren ? (
        <p className="text-warnung mt-2 font-semibold">
          Der Protokollentwurf zu dieser Einheit wird dabei verworfen.
        </p>
      ) : null}
      <div className="mt-3 max-w-xs">
        <Select
          label="Absagegrund"
          value={grund}
          error={grundFehler}
          onChange={(e) => {
            setGrund(e.target.value);
            setGrundFehler(undefined);
          }}
        >
          <option value="">Bitte wählen …</option>
          {waehlbareAbsagegruende(false, trainingAbsageLabels).map(([wert, beschriftung]) => (
            <option key={wert} value={wert}>
              {beschriftung}
            </option>
          ))}
        </Select>
      </div>
    </Rueckfrage>
  );
}
