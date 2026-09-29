import { useEffect, useId, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Aufklappzeichen } from '@/components/ui/Card';
import { aufklappKopfKlassen } from '@/components/ui/aufklappStile';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TextArea } from '@/components/ui/TextArea';
import { fetchPatient, fullName } from '@/features/patients/api';
import { Patientensuche } from '@/features/patients/Patientensuche';
import { fetchStaffMembers } from '@/features/staff/api';
import { formatDate } from '@/lib/datum';
import { mitRueckweg } from '@/lib/rueckweg';
import {
  TASKS_KEY,
  createTask,
  deleteTask,
  fetchTasks,
  isOverdue,
  setTaskDone,
  updateTask,
  type Task,
  type TaskInput,
} from './tasks-api';

const EMPTY: TaskInput = {
  title: '',
  note: '',
  dueOn: '',
  assignedStaffMemberId: '',
  patientId: null,
};

function toInput(task: Task): TaskInput {
  return {
    title: task.title,
    note: task.note ?? '',
    dueOn: task.due_on ?? '',
    assignedStaffMemberId: task.assigned_staff_member_id ?? '',
    patientId: task.patient_id,
  };
}

/** Die gewählte Person als Name - aus derselben Abfrage wie die Akte. */
function PatientChoice({ patientId, onRemove }: { patientId: string; onRemove: () => void }) {
  const { data } = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => fetchPatient(patientId),
    retry: false,
  });
  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="text-ink text-sm">
        <span className="font-medium">Zur Person: </span>
        {data ? fullName(data) : '…'}
      </p>
      <Button type="button" variant="quiet" groesse="kompakt" onClick={onRemove}>
        Bezug entfernen
      </Button>
    </div>
  );
}

/**
 * Anlegen und Ändern einer Aufgabe - ein Formular für beides.
 *
 * Der Hinweis unter dem Titel sagt, was nicht hierher gehört: Befunde und
 * Verläufe stehen in der Dokumentation (ADR-016); eine Aufgabe ist ein
 * Vorgang der Praxis.
 */
function TaskForm({
  initial,
  task,
  onDone,
}: {
  initial: TaskInput;
  task: Task | null;
  onDone: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const titleId = useId();
  const [werte, setWerte] = useState<TaskInput>(initial);
  const [titelFehler, setTitelFehler] = useState<string | undefined>();

  const staff = useQuery({
    queryKey: ['staff-members'],
    queryFn: fetchStaffMembers,
    retry: false,
  });

  useEffect(() => {
    document.getElementById(titleId)?.focus();
  }, [titleId]);

  const speichern = useMutation({
    mutationFn: async (eingabe: TaskInput) => {
      if (task) await updateTask(task.id, eingabe);
      else await createTask(eingabe);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: TASKS_KEY });
      onDone(task ? 'Aufgabe geändert.' : 'Aufgabe angelegt.');
    },
  });

  const loeschen = useMutation({
    mutationFn: () => deleteTask(task!.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: TASKS_KEY });
      onDone('Aufgabe gelöscht.');
    },
  });

  function absenden(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (speichern.isPending) return;
    const titel = werte.title.trim();
    if (titel.length === 0) {
      setTitelFehler('Was ist zu tun?');
      document.getElementById(titleId)?.focus();
      return;
    }
    if (titel.length > 200) {
      setTitelFehler('Höchstens 200 Zeichen.');
      return;
    }
    speichern.mutate(werte);
  }

  const aktive = (staff.data ?? []).filter(
    (person) => person.employment_status === 'active' || person.id === werte.assignedStaffMemberId,
  );

  return (
    <form
      onSubmit={absenden}
      noValidate
      aria-label={task ? 'Aufgabe ändern' : 'Aufgabe anlegen'}
      className="border-line-strong bg-surface-sunken rounded-card flex flex-col gap-4 border p-4 sm:p-6"
    >
      <Field
        feldId={titleId}
        label="Was ist zu tun? *"
        hint="Nur Organisatorisches – Befunde und Verläufe gehören in die Dokumentation."
        value={werte.title}
        maxLength={200}
        error={titelFehler}
        onChange={(e) => {
          setWerte({ ...werte, title: e.target.value });
          setTitelFehler(undefined);
        }}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Fällig am"
          type="date"
          value={werte.dueOn}
          onChange={(e) => setWerte({ ...werte, dueOn: e.target.value })}
        />
        <Select
          label="Für"
          value={werte.assignedStaffMemberId}
          onChange={(e) => setWerte({ ...werte, assignedStaffMemberId: e.target.value })}
        >
          <option value="">Alle im Team</option>
          {aktive.map((person) => (
            <option key={person.id} value={person.id}>
              {person.given_name} {person.family_name}
            </option>
          ))}
        </Select>
      </div>
      {werte.patientId ? (
        <PatientChoice
          patientId={werte.patientId}
          onRemove={() => setWerte({ ...werte, patientId: null })}
        />
      ) : (
        <div className="max-w-md">
          <Patientensuche
            label="Bezug auf eine Person (optional)"
            labelSichtbar
            onAuswahl={(patientId) => setWerte({ ...werte, patientId })}
          />
        </div>
      )}
      <TextArea
        label="Notiz"
        rows={2}
        maxLength={1000}
        value={werte.note}
        onChange={(e) => setWerte({ ...werte, note: e.target.value })}
      />
      {speichern.isError ? (
        <Statusmeldung ton="fehler">{speichern.error.message}</Statusmeldung>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={speichern.isPending}>
          {speichern.isPending ? 'Wird gespeichert …' : task ? 'Änderung speichern' : 'Anlegen'}
        </Button>
        <Button type="button" variant="quiet" onClick={() => onDone('')}>
          Abbrechen
        </Button>
        {task ? (
          <Rueckfrage
            ausloeser="Löschen"
            ausloeserVariante="quiet"
            bezeichnung="Aufgabe löschen"
            bestaetigen="Ja, löschen"
            bestaetigenLaeuft="Wird gelöscht …"
            fehler={loeschen.isError ? loeschen.error.message : undefined}
            onBestaetigen={() => loeschen.mutateAsync()}
          >
            Die Aufgabe wird entfernt. Für eine erledigte ist „Erledigt“ der richtige Weg.
          </Rueckfrage>
        ) : null}
      </div>
    </form>
  );
}

/** Eine Zeile: was, bis wann, für wen, zu wem - und „Erledigt". */
function TaskRow({
  task,
  today,
  onEdit,
  onMessage,
}: {
  task: Task;
  today: string;
  onEdit: () => void;
  onMessage: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const erledigen = useMutation({
    mutationFn: (done: boolean) => setTaskDone(task.id, done),
    onSuccess: async (_ergebnis, done) => {
      await queryClient.invalidateQueries({ queryKey: TASKS_KEY });
      onMessage(done ? `„${task.title}“ erledigt.` : `„${task.title}“ wieder offen.`);
    },
  });
  const ueberfaellig = isOverdue(task, today);
  const offen = task.status === 'open';

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-3">
      <div className="min-w-0 wrap-anywhere">
        <p className="text-ink text-liste font-medium">{task.title}</p>
        <p className="text-ink-muted mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          {task.due_on ? (
            <span>
              {task.due_on === today ? 'Heute fällig' : `Fällig ${formatDate(task.due_on)}`}
            </span>
          ) : null}
          {ueberfaellig ? <Badge ton="warnung">Überfällig</Badge> : null}
          <span>{task.assigned_name ? `Für ${task.assigned_name}` : 'Für alle im Team'}</span>
          {task.patient_id && task.patient_family_name ? (
            <Link
              to={mitRueckweg(`/patienten/${task.patient_id}`, '/offen')}
              className="text-accent hover:underline"
            >
              {task.patient_given_name} {task.patient_family_name}
            </Link>
          ) : null}
          {!offen && task.done_by_name ? <span>erledigt von {task.done_by_name}</span> : null}
        </p>
        {task.note ? <p className="text-ink-muted mt-1 max-w-prose text-sm">{task.note}</p> : null}
        {erledigen.isError ? (
          <Statusmeldung ton="fehler" className="mt-2">
            {erledigen.error.message}
          </Statusmeldung>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {offen ? (
          <>
            <Button
              type="button"
              variant="secondary"
              groesse="kompakt"
              disabled={erledigen.isPending}
              onClick={() => erledigen.mutate(true)}
            >
              Erledigt<span className="sr-only">: {task.title}</span>
            </Button>
            <Button type="button" variant="quiet" groesse="kompakt" onClick={onEdit}>
              Ändern<span className="sr-only">: {task.title}</span>
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="quiet"
            groesse="kompakt"
            disabled={erledigen.isPending}
            onClick={() => erledigen.mutate(false)}
          >
            Wieder öffnen<span className="sr-only">: {task.title}</span>
          </Button>
        )}
      </div>
    </li>
  );
}

/**
 * Aufgaben und Wiedervorlagen (PRX-012): offen nach Fälligkeit, überfällige
 * als Wort gekennzeichnet (Farbe ist nie allein Bedeutungsträger), die
 * erledigten zugeklappt darunter.
 *
 * `openForm` öffnet das Formular sofort, `patientId` belegt die Person vor -
 * etwa aus der Akte.
 */
export function Tasks({
  today,
  openForm = false,
  patientId = null,
}: {
  today: string;
  openForm?: boolean;
  patientId?: string | null;
}) {
  const [formular, setFormular] = useState<'neu' | string | null>(openForm ? 'neu' : null);
  const [meldung, setMeldung] = useState('');

  const offen = useQuery({
    queryKey: [...TASKS_KEY, 'open'],
    queryFn: () => fetchTasks('open'),
    retry: false,
  });
  const [erledigteOffen, setErledigteOffen] = useState(false);
  const erledigt = useQuery({
    queryKey: [...TASKS_KEY, 'done'],
    queryFn: () => fetchTasks('done'),
    enabled: erledigteOffen,
    retry: false,
  });

  function fertig(nachricht: string) {
    setFormular(null);
    setMeldung(nachricht);
  }

  const liste = offen.data ?? [];
  const bearbeitet = typeof formular === 'string' && formular !== 'neu' ? formular : null;

  return (
    <Section
      titel={liste.length > 0 ? `Aufgaben (${liste.length})` : 'Aufgaben'}
      hinweis="Wiedervorlagen und Erledigungen, auf Wunsch mit Bezug auf eine Person."
      aktion={
        formular === 'neu' ? null : (
          <Button
            type="button"
            variant="secondary"
            groesse="kompakt"
            onClick={() => {
              setMeldung('');
              setFormular('neu');
            }}
          >
            Aufgabe anlegen
          </Button>
        )
      }
    >
      {meldung ? (
        <Statusmeldung ton="erfolg" className="mb-3">
          {meldung}
        </Statusmeldung>
      ) : null}
      {formular === 'neu' ? (
        <div className="mb-4">
          <TaskForm initial={{ ...EMPTY, patientId }} task={null} onDone={fertig} />
        </div>
      ) : null}

      {offen.isPending ? <LoadingState label="Aufgaben werden geladen …" /> : null}
      {offen.isError ? (
        <ErrorState
          title="Die Aufgaben konnten nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => offen.refetch()}
        />
      ) : null}
      {offen.data && liste.length === 0 ? (
        <p className="text-ink-muted text-sm">Keine offene Aufgabe.</p>
      ) : null}
      {liste.length > 0 ? (
        <ul className="divide-line border-line bg-surface rounded-card divide-y border px-4 sm:px-5">
          {liste.map((task) =>
            bearbeitet === task.id ? (
              <li key={task.id} className="py-3">
                <TaskForm initial={toInput(task)} task={task} onDone={fertig} />
              </li>
            ) : (
              <TaskRow
                key={task.id}
                task={task}
                today={today}
                onEdit={() => {
                  setMeldung('');
                  setFormular(task.id);
                }}
                onMessage={setMeldung}
              />
            ),
          )}
        </ul>
      ) : null}

      {/* Die erledigten erst beim Aufklappen laden: ein Rückblick, kein
          Arbeitsvorrat. */}
      <details
        className="group border-line mt-3 border-t pt-2"
        onToggle={(event) => setErledigteOffen(event.currentTarget.open)}
      >
        <summary className={`${aufklappKopfKlassen} text-ink-muted hover:text-ink text-sm`}>
          <Aufklappzeichen />
          Zuletzt erledigt
        </summary>
        <div className="mt-2">
          {erledigt.isPending && erledigteOffen ? <LoadingState label="Wird geladen …" /> : null}
          {erledigt.isError ? (
            <Statusmeldung ton="fehler">{erledigt.error.message}</Statusmeldung>
          ) : null}
          {erledigt.data && erledigt.data.length === 0 ? (
            <p className="text-ink-muted text-sm">Noch nichts erledigt.</p>
          ) : null}
          {erledigt.data && erledigt.data.length > 0 ? (
            <ul className="divide-line divide-y">
              {erledigt.data.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  today={today}
                  onEdit={() => undefined}
                  onMessage={setMeldung}
                />
              ))}
            </ul>
          ) : null}
        </div>
      </details>
    </Section>
  );
}
