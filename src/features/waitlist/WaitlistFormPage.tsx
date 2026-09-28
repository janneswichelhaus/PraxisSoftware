import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Feldgruppe, Section } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Symbolknopf } from '@/components/ui/Symbolknopf';
import { TextArea } from '@/components/ui/TextArea';
import {
  appointmentTypeLabels,
  appointmentTypeSchema,
  fetchAssignableTherapists,
} from '@/features/appointments/api';
import {
  EINGABETEXTE,
  useTextverlustschutz,
  type Verlustschutztexte,
} from '@/features/documentation/Textverlustschutz';
import { Patientensuche } from '@/features/patients/Patientensuche';
import { fetchPatient, fullName } from '@/features/patients/api';
import { fetchPatientTreatmentBases, grundlageBezeichnung } from '@/features/treatment-bases/api';
import { formatDate } from '@/lib/datum';
import { leseRueckweg } from '@/lib/rueckweg';
import { EMPTY, fromEntry, validate, type FieldName, type FormState } from './form';
import {
  DURATION_MAX,
  DURATION_MIN,
  NOTE_MAX,
  REASONS,
  WINDOWS_MAX,
  createWaitlistEntry,
  fetchWaitlist,
  reasonLabels,
  updateWaitlistEntry,
  type EntryValues,
  type Reason,
  type TimeWindow,
  type WaitlistEntry,
} from './api';

const LIST = '/warteliste';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LOSS_TEXTS: Verlustschutztexte = {
  ...EINGABETEXTE,
  bezeichnung: 'Ungespeicherter Eintrag der Warteliste',
};

const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: 'Montag' },
  { value: 2, label: 'Dienstag' },
  { value: 3, label: 'Mittwoch' },
  { value: 4, label: 'Donnerstag' },
  { value: 5, label: 'Freitag' },
  { value: 6, label: 'Samstag' },
  { value: 7, label: 'Sonntag' },
];

function EntryForm({
  patientId,
  patientLabel,
  entry,
  back,
}: {
  patientId: string;
  patientLabel: string;
  entry: WaitlistEntry | null;
  back: string;
}) {
  const [initial] = useState<FormState>(() => (entry ? fromEntry(entry) : EMPTY));
  const [state, setState] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const bases = useQuery({
    queryKey: ['treatment-bases', patientId],
    queryFn: () => fetchPatientTreatmentBases(patientId),
    retry: false,
  });
  const therapists = useQuery({
    queryKey: ['assignable-therapists'],
    queryFn: fetchAssignableTherapists,
    retry: false,
  });

  const unsaved = JSON.stringify(state) !== JSON.stringify(initial);
  const { freigeben, schutz } = useTextverlustschutz({ ungespeichert: unsaved, texte: LOSS_TEXTS });

  const mutation = useMutation({
    mutationFn: async (values: EntryValues) => {
      if (entry) await updateWaitlistEntry(entry, values);
      else await createWaitlistEntry(patientId, values);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['waitlist'] });
      freigeben();
      void navigate(back, { replace: true });
    },
  });

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((before) => ({ ...before, [key]: value }));
  }

  function setWindow(index: number, change: Partial<TimeWindow>) {
    set(
      'windows',
      state.windows.map((w, i) => (i === index ? { ...w, ...change } : w)),
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending) return;
    const result = validate(state);
    if ('errors' in result) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    mutation.mutate(result.values);
  }

  return (
    <>
      <Rueckweg standard={back} beschriftung="Zurück zur Warteliste" />
      <PageHeader
        title={entry ? 'Eintrag der Warteliste bearbeiten' : 'Auf die Warteliste setzen'}
        description={patientLabel}
      />
      {schutz}

      <form onSubmit={submit} noValidate className="max-w-xl">
        <Section titel="Termin">
          <Feldgruppe>
            <Select
              label="Behandlungsgrundlage"
              value={state.treatmentBasisId}
              onChange={(e) => set('treatmentBasisId', e.target.value)}
              hint={bases.isError ? 'Die Grundlagen konnten nicht geladen werden.' : undefined}
            >
              <option value="">Ohne Bezug</option>
              {(bases.data ?? []).map((basis) => {
                const { bauart, praeposition } = grundlageBezeichnung(basis);
                return (
                  <option key={basis.id} value={basis.id}>
                    {bauart} {praeposition} {formatDate(basis.issued_on)}
                  </option>
                );
              })}
            </Select>
            <Select
              label="Terminart"
              value={state.type}
              onChange={(e) => set('type', appointmentTypeSchema.parse(e.target.value))}
            >
              {appointmentTypeSchema.options.map((type) => (
                <option key={type} value={type}>
                  {appointmentTypeLabels[type]}
                </option>
              ))}
            </Select>
            <Field
              label="Dauer in Minuten"
              type="number"
              inputMode="numeric"
              min={DURATION_MIN}
              max={DURATION_MAX}
              step={5}
              value={state.duration}
              onChange={(e) => set('duration', e.target.value)}
              error={errors.duration}
            />
            <Select
              label="Therapeut:in"
              value={state.staffMemberId}
              onChange={(e) => set('staffMemberId', e.target.value)}
            >
              <option value="">Egal</option>
              {(therapists.data ?? []).map((t) => (
                <option key={t.staff_member_id} value={t.staff_member_id}>
                  {t.display_name}
                </option>
              ))}
            </Select>
          </Feldgruppe>
        </Section>

        <Section titel="Wunschzeiten" hinweis="Wann die Person kann. Ohne Angabe heißt: jederzeit.">
          {state.windows.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {state.windows.map((w, index) => (
                <li
                  key={index}
                  className="border-line rounded-card grid grid-cols-[1fr_auto] gap-3 border p-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end"
                >
                  <Select
                    label="Wochentag"
                    value={String(w.weekday)}
                    onChange={(e) => setWindow(index, { weekday: Number(e.target.value) })}
                  >
                    {WEEKDAYS.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </Select>
                  <div className="col-span-2 grid grid-cols-2 gap-3 sm:col-span-2">
                    <Field
                      label="von"
                      type="time"
                      value={w.from}
                      onChange={(e) => setWindow(index, { from: e.target.value })}
                    />
                    <Field
                      label="bis"
                      type="time"
                      value={w.to}
                      onChange={(e) => setWindow(index, { to: e.target.value })}
                    />
                  </div>
                  <div className="col-start-2 row-start-1 self-end sm:col-start-4">
                    <Symbolknopf
                      beschriftung={`Wunschzeit ${index + 1} entfernen`}
                      onClick={() =>
                        set(
                          'windows',
                          state.windows.filter((_, i) => i !== index),
                        )
                      }
                    >
                      ×
                    </Symbolknopf>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
          {errors.windows ? (
            <Statusmeldung ton="fehler" className="mt-2">
              {errors.windows}
            </Statusmeldung>
          ) : null}
          {state.windows.length < WINDOWS_MAX ? (
            <Button
              type="button"
              variant="secondary"
              groesse="kompakt"
              className="mt-3"
              onClick={() =>
                set('windows', [...state.windows, { weekday: 1, from: '08:00', to: '12:00' }])
              }
            >
              Wunschzeit hinzufügen
            </Button>
          ) : null}
        </Section>

        <Section
          titel="Dringlichkeit"
          hinweis="Ein organisatorischer Grund – keine Einschätzung des Beschwerdebilds."
        >
          <Feldgruppe>
            <Select
              label="Grund"
              value={state.reason}
              onChange={(e) => set('reason', e.target.value as Reason)}
            >
              {REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {reasonLabels[reason]}
                </option>
              ))}
            </Select>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Frühestens ab"
                type="date"
                value={state.earliestOn}
                onChange={(e) => set('earliestOn', e.target.value)}
              />
              <Field
                label="Bis spätestens"
                type="date"
                value={state.neededBy}
                onChange={(e) => set('neededBy', e.target.value)}
                error={errors.dates}
              />
            </div>
            <TextArea
              label="Notiz"
              hint="Organisatorisch, etwa wann die Person erreichbar ist. Keine Befunde."
              maxLength={NOTE_MAX}
              rows={3}
              value={state.note}
              onChange={(e) => set('note', e.target.value)}
              error={errors.note}
            />
          </Feldgruppe>
        </Section>

        {mutation.error ? (
          <Statusmeldung ton="fehler" className="mt-6">
            {mutation.error.message}
          </Statusmeldung>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Wird gespeichert …' : 'Speichern'}
          </Button>
          <ButtonLink to={back} variant="quiet">
            Abbrechen
          </ButtonLink>
        </div>
      </form>
    </>
  );
}

/** Neuer Eintrag: erst die Person, dann das Formular (wie beim Termin, UX-005). */
export function NewWaitlistEntryPage() {
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const back = leseRueckweg(search, LIST);
  const patientId = search.get('patient');
  const valid = patientId && UUID.test(patientId) ? patientId : null;

  const patient = useQuery({
    queryKey: ['patient', valid],
    queryFn: () => fetchPatient(valid!),
    enabled: Boolean(valid),
    retry: false,
  });

  if (!valid) {
    return (
      <>
        <Rueckweg standard={LIST} beschriftung="Zurück zur Warteliste" />
        <PageHeader title="Auf die Warteliste setzen" description="Zuerst die Patient:in wählen." />
        <div className="max-w-md">
          <Patientensuche
            label="Patient:in suchen"
            labelSichtbar
            onAuswahl={(id) => {
              const next = new URLSearchParams(search);
              next.set('patient', id);
              void navigate(`/warteliste/neu?${next.toString()}`, { replace: true });
            }}
          />
        </div>
      </>
    );
  }

  if (patient.isPending) return <LoadingState label="Patient:in wird geladen …" />;
  if (patient.isError || !patient.data) {
    return (
      <ErrorState
        title="Die Patient:in konnte nicht geladen werden."
        description="Bitte die Verbindung prüfen und erneut versuchen."
        onErneut={() => void patient.refetch()}
      />
    );
  }

  return (
    <EntryForm patientId={valid} patientLabel={fullName(patient.data)} entry={null} back={back} />
  );
}

/** Bestehenden, offenen Eintrag ändern. */
export function EditWaitlistEntryPage() {
  const { entryId } = useParams();
  const [search] = useSearchParams();
  const back = leseRueckweg(search, LIST);

  const list = useQuery({
    queryKey: ['waitlist', 'open'],
    queryFn: () => fetchWaitlist('open'),
    retry: false,
  });

  if (list.isPending) return <LoadingState label="Eintrag wird geladen …" />;
  if (list.isError) {
    return (
      <ErrorState
        title="Der Eintrag konnte nicht geladen werden."
        description="Bitte die Verbindung prüfen und erneut versuchen."
        onErneut={() => void list.refetch()}
      />
    );
  }
  const entry = list.data.find((e) => e.id === entryId);
  if (!entry) {
    return (
      <ErrorState
        title="Diesen Eintrag gibt es nicht mehr."
        description="Er wurde geschlossen oder gelöscht. Die Warteliste zeigt den aktuellen Stand."
      />
    );
  }

  return (
    <EntryForm
      patientId={entry.patient_id}
      patientLabel={`${entry.patient_given_name} ${entry.patient_family_name}`}
      entry={entry}
      back={back}
    />
  );
}
