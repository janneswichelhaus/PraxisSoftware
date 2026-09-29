import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';

/**
 * Aufgaben und Wiedervorlagen (PRX-012, ANN-142).
 *
 * Organisatorisch, nie klinisch: „Verordnung nachfordern", „Rückruf Frau X".
 * Wer lesen und schreiben darf, prüft der Server (`app.can_manage_tasks`);
 * Titel und Notiz stehen nie im Protokoll.
 */

const taskSchema = z.object({
  id: z.string(),
  title: z.string(),
  note: z.string().nullable(),
  due_on: z.string().nullable(),
  status: z.enum(['open', 'done']),
  patient_id: z.string().nullable(),
  patient_given_name: z.string().nullable(),
  patient_family_name: z.string().nullable(),
  assigned_staff_member_id: z.string().nullable(),
  assigned_name: z.string().nullable(),
  created_at: z.string(),
  created_by_name: z.string().nullable(),
  done_at: z.string().nullable(),
  done_by_name: z.string().nullable(),
});

export type Task = z.infer<typeof taskSchema>;
export type TaskStatus = Task['status'];

export interface TaskInput {
  title: string;
  note: string;
  dueOn: string;
  assignedStaffMemberId: string;
  patientId: string | null;
}

export const TASKS_KEY = ['open-points', 'tasks'] as const;

const LOAD_ERROR = 'Die Aufgaben konnten nicht geladen werden.';

export async function fetchTasks(status: TaskStatus, patientId?: string | null): Promise<Task[]> {
  const { data, error } = (await getSupabase().rpc('list_tasks', {
    p_status: status,
    p_patient_id: patientId ?? null,
  })) as { data: unknown; error: unknown };
  if (error) throw new Error(LOAD_ERROR);
  return antwort(z.array(taskSchema), data ?? [], LOAD_ERROR);
}

function argumente(eingabe: TaskInput) {
  return {
    p_title: eingabe.title.trim(),
    p_note: eingabe.note.trim() || null,
    p_due_on: eingabe.dueOn || null,
    p_assigned_staff_member_id: eingabe.assignedStaffMemberId || null,
    p_patient_id: eingabe.patientId,
  };
}

export async function createTask(eingabe: TaskInput): Promise<string> {
  const { data, error } = (await getSupabase().rpc('create_task', argumente(eingabe))) as {
    data: unknown;
    error: unknown;
  };
  const satz = 'Die Aufgabe konnte nicht angelegt werden.';
  if (error) throw new Error(satz);
  return antwort(z.string(), data, satz);
}

export async function updateTask(id: string, eingabe: TaskInput): Promise<void> {
  const { error } = (await getSupabase().rpc('update_task', {
    p_task_id: id,
    ...argumente(eingabe),
  })) as { error: unknown };
  if (error) throw new Error('Die Aufgabe konnte nicht geändert werden.');
}

export async function setTaskDone(id: string, done: boolean): Promise<void> {
  const { error } = (await getSupabase().rpc('set_task_done', {
    p_task_id: id,
    p_done: done,
  })) as { error: unknown };
  if (error) {
    throw new Error(
      done
        ? 'Die Aufgabe konnte nicht erledigt werden.'
        : 'Die Aufgabe konnte nicht wieder geöffnet werden.',
    );
  }
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = (await getSupabase().rpc('delete_task', { p_task_id: id })) as {
    error: unknown;
  };
  if (error) throw new Error('Die Aufgabe konnte nicht gelöscht werden.');
}

/**
 * Überfällig ist, was vor heute fällig war - am Fälligkeitstag selbst ist es
 * „heute fällig", nicht zu spät. Heute ist der Kalendertag der Praxis.
 */
export function isOverdue(task: Pick<Task, 'due_on' | 'status'>, today: string): boolean {
  return task.status === 'open' && task.due_on !== null && task.due_on < today;
}
