import { useEffect, useId, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Card';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { HakenSymbol } from '@/components/ui/HakenSymbol';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { StatusMark } from '@/components/ui/StatusMark';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Symbolknopf } from '@/components/ui/Symbolknopf';
import { TextArea } from '@/components/ui/TextArea';
import { VERBINDUNG_PRUEFEN } from '@/components/ui/abfrageTexte';
import { fetchPatient, fullName, Patientensuche } from '@/features/patients';
import { fetchStaffMembers } from '@/features/workforce';
import { formatDate } from '@/lib/datum';
import { mitRueckweg } from '@/lib/rueckweg';
import { abfragen } from './eingang';
import { StiftSymbol } from './Symbole';
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
      className="border-line-strong bg-surface-sunken flex flex-col gap-4 border-l-4 py-4 pr-4 pl-5 sm:py-6 sm:pr-6"
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

/** Fällig, für wen, zu wem - die Nebenzeile einer Aufgabe. */
function Nebenzeile({ task, today }: { task: Task; today: string }) {
  const teile = [
    task.due_on
      ? task.due_on === today
        ? 'Heute fällig'
        : `Fällig ${formatDate(task.due_on)}`
      : null,
    // „Für alle im Team" ist der Regelfall und steht nicht an jeder Zeile;
    // nur eine Zuweisung wird genannt (UX-005h).
    task.assigned_name ? `Für ${task.assigned_name}` : null,
    task.patient_id && task.patient_family_name
      ? `${task.patient_given_name ?? ''} ${task.patient_family_name}`.trim()
      : null,
    task.status !== 'open' && task.done_by_name ? `erledigt von ${task.done_by_name}` : null,
  ].filter((teil): teil is string => teil !== null);
  return (
    <>
      {isOverdue(task, today) ? (
        <>
          <StatusMark ton="warnung">Überfällig</StatusMark>
          {teile.length > 0 ? ' · ' : null}
        </>
      ) : null}
      {teile.join(' · ')}
      {task.note ? <span className="mt-0.5 block wrap-anywhere">{task.note}</span> : null}
    </>
  );
}

/**
 * Eine Aufgabe als Zeile: Mit einer Person ist die ganze Zeile der Weg in
 * ihre Akte; daneben die Arbeit - der Haken für „Erledigt" und „Ändern"
 * (Leitfaden L3).
 */
function TaskRow({
  task,
  today,
  onEdit,
  onMessage,
}: {
  task: Task;
  today: string;
  onEdit?: () => void;
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
  const offen = task.status === 'open';
  const person =
    task.patient_id && task.patient_family_name
      ? mitRueckweg(`/patienten/${task.patient_id}`, '/offen')
      : undefined;

  return (
    <ListRow
      titel={<span className="wrap-anywhere">{task.title}</span>}
      meta={
        <>
          <Nebenzeile task={task} today={today} />
          {erledigen.isError ? (
            <Statusmeldung ton="fehler" className="mt-1">
              {erledigen.error.message}
            </Statusmeldung>
          ) : null}
        </>
      }
      gedaempft={!offen}
      {...(person ? { to: person } : {})}
      aktion={
        offen ? (
          <>
            {/* Als Symbole, damit der Aufgabe am Telefon die Breite bleibt;
                der Haken außen, wie am Termin der Übersicht. */}
            {onEdit ? (
              <Symbolknopf beschriftung={`Ändern: ${task.title}`} onClick={onEdit}>
                <StiftSymbol />
              </Symbolknopf>
            ) : null}
            <Symbolknopf
              beschriftung={`Erledigt: ${task.title}`}
              variant="secondary"
              disabled={erledigen.isPending}
              onClick={() => erledigen.mutate(true)}
            >
              <HakenSymbol />
            </Symbolknopf>
          </>
        ) : (
          <Button
            type="button"
            variant="quiet"
            disabled={erledigen.isPending}
            onClick={() => erledigen.mutate(false)}
          >
            Wieder öffnen<span className="sr-only">: {task.title}</span>
          </Button>
        )
      }
    />
  );
}

/**
 * Eine neue Aufgabe (PRX-012). `patientId` belegt die Person vor - etwa aus
 * der Akte über `?aufgabe=neu&patient=…`.
 */
export function AufgabeAnlegen({
  patientId,
  onFertig,
}: {
  patientId: string | null;
  onFertig: (meldung: string) => void;
}) {
  return <TaskForm initial={{ ...EMPTY, patientId }} task={null} onDone={onFertig} />;
}

/**
 * Aufgaben und Wiedervorlagen (PRX-012) im Eingang: offen nach Fälligkeit,
 * überfällige mit Zeichen und Wort (Farbe ist nie allein Bedeutungsträger).
 * Ohne offene Aufgabe keine Gruppe - „Aufgabe anlegen" steht im Kopf der
 * Seite, die erledigten am Ende unter „Zuletzt erledigt".
 */
export function Tasks({
  today,
  onMeldung,
}: {
  today: string;
  onMeldung: (meldung: string) => void;
}) {
  // Die Kennung der Aufgabe, die gerade geändert wird.
  const [bearbeitet, setBearbeitet] = useState<string | null>(null);
  const offen = useQuery(abfragen.aufgaben());

  if (offen.isError && !offen.data) {
    return (
      <Section titel="Aufgaben">
        <ErrorState
          title="Die Aufgaben konnten nicht geladen werden."
          description={VERBINDUNG_PRUEFEN}
          onErneut={() => offen.refetch()}
        />
      </Section>
    );
  }
  const liste = offen.data ?? [];
  if (liste.length === 0) return null;

  return (
    <Listenabschnitt titel="Aufgaben" anzahl={liste.length}>
      {liste.map((task) =>
        bearbeitet === task.id ? (
          <li key={task.id} className="border-line border-t py-4 first:border-t-0">
            <TaskForm
              initial={toInput(task)}
              task={task}
              onDone={(meldung) => {
                setBearbeitet(null);
                if (meldung) onMeldung(meldung);
              }}
            />
          </li>
        ) : (
          <TaskRow
            key={task.id}
            task={task}
            today={today}
            onEdit={() => setBearbeitet(task.id)}
            onMessage={onMeldung}
          />
        ),
      )}
    </Listenabschnitt>
  );
}

/**
 * „Zuletzt erledigt" am Ende des Eingangs: ein Rückblick, kein
 * Arbeitsvorrat - geladen wird erst beim Aufklappen.
 */
export function ErledigteAufgaben({
  today,
  onMeldung,
}: {
  today: string;
  onMeldung: (meldung: string) => void;
}) {
  const [aufgeklappt, setAufgeklappt] = useState(false);
  const erledigt = useQuery({
    queryKey: [...TASKS_KEY, 'done'],
    queryFn: () => fetchTasks('done'),
    enabled: aufgeklappt,
    retry: false,
  });

  return (
    <Disclosure summary="Zuletzt erledigt" onUmschalten={setAufgeklappt}>
      {erledigt.isPending && aufgeklappt ? <LoadingState label="Wird geladen …" /> : null}
      {erledigt.isError ? (
        <Statusmeldung ton="fehler">{erledigt.error.message}</Statusmeldung>
      ) : null}
      {erledigt.data && erledigt.data.length === 0 ? (
        <p className="text-ink-muted text-sm">Noch nichts erledigt.</p>
      ) : null}
      {erledigt.data && erledigt.data.length > 0 ? (
        <ListRows>
          {erledigt.data.map((task) => (
            <TaskRow key={task.id} task={task} today={today} onMessage={onMeldung} />
          ))}
        </ListRows>
      ) : null}
    </Disclosure>
  );
}
