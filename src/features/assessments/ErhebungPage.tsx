import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TextArea } from '@/components/ui/TextArea';
import { todayInTimeZone } from '@/features/appointments/api';
import { fetchPatient, fullName, type Patient } from '@/features/patients/api';
import { canWriteQuestionnaire, type CurrentUser } from '@/features/session/types';
import { antwortenSchema, type Antwort, type Antworten } from './antworten';
import {
  erhebungAbschliessen,
  erhebungenQueryKey,
  erhebungSpeichern,
  erhebungVerwerfen,
  fetchErhebungen,
  type Erhebung as ErhebungDaten,
} from './api';
import { beschriftung } from './darstellung';
import { FragebogenFelder } from './FragebogenFelder';
import { erhebbareInstrumente } from './instrumente';
import type { ScoreDefinition } from './schema';

/**
 * Einen Fragebogen erheben (FRB-002b).
 *
 * Drei Wege, eine Seite: neu erheben, einen Entwurf weiter ausfüllen
 * (`?entwurf=`), einen abgeschlossenen Bogen korrigieren (`?korrigiert=`). Die
 * Korrektur beginnt mit den alten Antworten und endet als **neue** Erhebung
 * mit Begründung — die alte bleibt, wie sie war (ANN-103).
 *
 * Die Seite liegt außerhalb des Aktenrahmens: Wer 39 Fragen ausfüllt, soll
 * nicht mit einem Tap auf die Bereichsleiste alles verlieren (UX-009).
 */
export function ErhebungPage({ user }: { user: CurrentUser }) {
  const { patientId } = useParams<{ patientId: string }>();
  return <Erhebung patientId={patientId} user={user} />;
}

export function Erhebung({
  patientId,
  user,
}: {
  patientId: string | undefined;
  user: CurrentUser;
}) {
  const [suche] = useSearchParams();

  const patient = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => fetchPatient(patientId!),
    enabled: Boolean(patientId),
    retry: false,
  });
  const erhebungen = useQuery({
    queryKey: erhebungenQueryKey(patientId ?? ''),
    queryFn: () => fetchErhebungen(patientId!),
    enabled: Boolean(patientId),
  });

  if (!canWriteQuestionnaire(user.roles)) {
    return (
      <ErrorState
        title="Nicht freigegeben"
        description="Fragebögen erheben die behandelnden Rollen."
      />
    );
  }
  if (patient.isPending || erhebungen.isPending) return <LoadingState label="Wird geladen …" />;
  if (patient.isError || erhebungen.isError || !patient.data) {
    return (
      <ErrorState
        title="Der Bogen konnte nicht geöffnet werden."
        description="Dieser Datensatz existiert nicht oder ist für Ihren Zugang nicht freigegeben."
      />
    );
  }

  const definition = erhebbareInstrumente().find(
    (score) => score.meta.id === suche.get('instrument'),
  );
  if (!definition) {
    return <ErrorState title="Diesen Fragebogen gibt es nicht oder er ist nicht freigegeben." />;
  }

  const entwurf = erhebungen.data.find(
    (e) => e.id === suche.get('entwurf') && e.status === 'entwurf',
  );
  const korrigiert = erhebungen.data.find(
    (e) =>
      e.id === suche.get('korrigiert') &&
      e.status === 'abgeschlossen' &&
      e.superseded_by_response_id === null,
  );
  if ((suche.get('entwurf') && !entwurf) || (suche.get('korrigiert') && !korrigiert)) {
    return (
      <ErrorState
        title="Dieser Bogen lässt sich hier nicht mehr bearbeiten."
        description="Er ist inzwischen abgeschlossen, korrigiert oder verworfen."
      />
    );
  }
  // Ein Entwurf haelt die Version fest, mit der er begonnen wurde; der Server
  // aendert sie nicht. Stimmt sie nicht mehr, wird neu begonnen statt still
  // gegen eine andere Fassung weiterzuschreiben.
  if (entwurf && entwurf.definition_version !== definition.meta.version) {
    return (
      <ErrorState
        title="Der Entwurf gehört zu einer früheren Fassung des Bogens."
        description="Bitte in der Akte verwerfen und neu erheben."
      />
    );
  }

  return (
    <Formular
      key={entwurf?.id ?? korrigiert?.id ?? 'neu'}
      patient={patient.data}
      definition={definition}
      entwurf={entwurf}
      korrigiert={korrigiert}
      heute={user.organizationTimeZone ? todayInTimeZone(user.organizationTimeZone) : ''}
    />
  );
}

function Formular({
  patient,
  definition,
  entwurf,
  korrigiert,
  heute,
}: {
  patient: Patient;
  definition: ScoreDefinition;
  entwurf: ErhebungDaten | undefined;
  korrigiert: ErhebungDaten | undefined;
  heute: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const zurueck = `/patienten/${patient.id}/befund`;

  const [antworten, setAntworten] = useState<Antworten>(
    () => entwurf?.answers ?? korrigiert?.answers ?? {},
  );
  const [datum, setDatum] = useState(entwurf?.recorded_on ?? korrigiert?.recorded_on ?? heute);
  const [begruendung, setBegruendung] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);

  function setzen(itemId: string, antwort: Antwort | undefined) {
    setAntworten((bisher) => {
      const neu = { ...bisher };
      if (antwort === undefined) delete neu[itemId];
      else neu[itemId] = antwort;
      return neu;
    });
  }

  const speichern = useMutation({
    mutationFn: async (abschliessen: boolean) => {
      const id = await erhebungSpeichern({
        patientId: patient.id,
        erhebungId: entwurf?.id ?? null,
        instrumentId: definition.meta.id,
        version: definition.meta.version,
        datum,
        antworten,
        korrigiert: korrigiert?.id ?? null,
        begruendung: korrigiert ? begruendung.trim() : null,
      });
      if (abschliessen) await erhebungAbschliessen(id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: erhebungenQueryKey(patient.id) });
      void navigate(zurueck, { replace: true });
    },
  });

  const verwerfen = useMutation({
    mutationFn: () => erhebungVerwerfen(entwurf!.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: erhebungenQueryKey(patient.id) });
      void navigate(zurueck, { replace: true });
    },
  });

  function pruefen(): boolean {
    const ergebnis = antwortenSchema(definition).safeParse(antworten);
    if (!ergebnis.success) {
      const itemId = String(ergebnis.error.issues[0]?.path[0] ?? '');
      const item = definition.items.find((i) => i.id === itemId);
      setFehler(
        item
          ? `Bitte die Antwort auf „${beschriftung(item)}“ prüfen: ${ergebnis.error.issues[0]!.message}`
          : 'Bitte die Antworten prüfen.',
      );
      return false;
    }
    if (datum === '') {
      setFehler('Bitte das Datum der Erhebung angeben.');
      return false;
    }
    if (korrigiert && begruendung.trim().length < 3) {
      setFehler('Eine Korrektur braucht eine Begründung.');
      return false;
    }
    setFehler(null);
    return true;
  }

  function absenden(abschliessen: boolean) {
    return (event?: FormEvent) => {
      event?.preventDefault();
      if (speichern.isPending || !pruefen()) return;
      speichern.mutate(abschliessen);
    };
  }

  const titel = korrigiert ? `${definition.meta.name_de} korrigieren` : definition.meta.name_de;

  return (
    <>
      <Rueckweg standard={zurueck} beschriftung="Zurück zum Befund" />
      <PageHeader
        title={titel}
        description={`${fullName(patient)} · Version ${definition.meta.version} · Jede Frage darf offen bleiben.`}
      />

      <form onSubmit={absenden(false)} noValidate className="max-w-2xl">
        <FragebogenFelder definition={definition} antworten={antworten} onChange={setzen} />

        <div className="border-line mt-8 flex flex-col gap-4 border-t pt-6">
          <Field
            label="Datum der Erhebung"
            type="date"
            value={datum}
            max={heute || undefined}
            required
            onChange={(e) => setDatum(e.target.value)}
          />
          {korrigiert ? (
            <TextArea
              label="Begründung der Korrektur"
              hint="Der ursprüngliche Bogen bleibt unverändert in der Akte."
              rows={2}
              maxLength={500}
              required
              value={begruendung}
              onChange={(e) => setBegruendung(e.target.value)}
            />
          ) : null}

          {fehler ? <Statusmeldung ton="fehler">{fehler}</Statusmeldung> : null}
          {speichern.isError ? (
            <Statusmeldung ton="fehler">{speichern.error.message}</Statusmeldung>
          ) : null}
          {verwerfen.isError ? (
            <Statusmeldung ton="fehler">{verwerfen.error.message}</Statusmeldung>
          ) : null}

          <p className="text-ink-muted text-sm">
            Abgeschlossen lässt sich der Bogen nicht mehr ändern, nur noch korrigieren.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={absenden(true)} disabled={speichern.isPending}>
              {speichern.isPending ? 'Wird gespeichert …' : 'Abschließen'}
            </Button>
            <Button type="submit" variant="secondary" disabled={speichern.isPending}>
              Als Entwurf speichern
            </Button>
            {entwurf ? (
              <Button
                type="button"
                variant="quiet"
                disabled={verwerfen.isPending}
                onClick={() => verwerfen.mutate()}
              >
                Entwurf verwerfen
              </Button>
            ) : null}
          </div>
        </div>
      </form>
    </>
  );
}
