import { useQuery } from '@tanstack/react-query';
import { Textlink } from '@/components/ui/Textlink';
import { fetchOffeneScans } from '@/features/files/api';
import { canManageTasks, canWriteTreatmentBases, type CurrentUser } from '@/features/session/types';
import { OPEN_SCANS_KEY } from './PrescriptionsToCapture';
import { TASKS_KEY, fetchTasks, isOverdue } from './tasks-api';

/** „1 Aufgabe", „2 Aufgaben" - Zahl und Wort gehören zusammen. */
function anzahl(n: number, eins: string, mehr: string): string {
  return `${n} ${n === 1 ? eins : mehr}`;
}

/**
 * Die offenen Punkte als eine Zeile in der Übersicht (PRX-012, PRX-011): was
 * überfällig oder heute fällig ist, dazu Verordnungen, die nur als Foto da
 * sind. Ohne etwas Fälliges keine Zeile - ein leerer Block am Tagesbeginn ist
 * Lärm (BEF-051).
 *
 * Dieselben Abfragen wie die Seite „Offene Punkte": Wer weitertippt, sieht
 * dort sofort denselben Stand.
 */
export function OpenPointsSummary({ user, today }: { user: CurrentUser; today: string }) {
  const aufgaben = useQuery({
    queryKey: [...TASKS_KEY, 'open'],
    queryFn: () => fetchTasks('open'),
    enabled: canManageTasks(user.roles),
    retry: false,
  });
  const scans = useQuery({
    queryKey: OPEN_SCANS_KEY,
    queryFn: fetchOffeneScans,
    enabled: canWriteTreatmentBases(user.roles),
    retry: false,
  });

  const offen = aufgaben.data ?? [];
  const ueberfaellig = offen.filter((task) => isOverdue(task, today)).length;
  const heute = offen.filter((task) => task.due_on === today).length;
  const fotos = scans.data?.length ?? 0;

  const teile = [
    ueberfaellig > 0 ? anzahl(ueberfaellig, 'überfällige Aufgabe', 'überfällige Aufgaben') : null,
    heute > 0 ? anzahl(heute, 'Aufgabe heute fällig', 'Aufgaben heute fällig') : null,
    fotos > 0 ? anzahl(fotos, 'Verordnung zu erfassen', 'Verordnungen zu erfassen') : null,
  ].filter((teil): teil is string => teil !== null);

  if (teile.length === 0) return null;

  return (
    <div className="border-line bg-surface rounded-card mt-6 flex flex-wrap items-center justify-between gap-3 border px-4 py-3 lg:max-w-3xl">
      <p className="text-ink text-liste">
        <span className="font-semibold">Offene Punkte: </span>
        {teile.join(' · ')}
      </p>
      <Textlink alleinstehend to="/offen" className="text-liste font-medium">
        Zu den offenen Punkten
      </Textlink>
    </div>
  );
}
