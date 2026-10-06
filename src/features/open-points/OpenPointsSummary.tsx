import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { fetchOffeneScans } from '@/features/files/api';
import {
  canManageAppointments,
  canManageTasks,
  canReadTrainingClients,
  canWriteTreatmentBases,
  type CurrentUser,
} from '@/features/session/types';
import { OPEN_SCANS_KEY } from './PrescriptionsToCapture';
import { PLATFORM_REQUESTS_KEY, fetchPlatformRequests } from './platform-requests-api';
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
 *
 * Seit dem Design-Handoff vom 2026-10-01 eine Zeile in einer Karte, 60 px
 * hoch: der Titel, darunter was fällig ist, rechts die Summe und der Pfeil.
 * Die ganze Zeile ist der Weg (UX-005h); die Summe ist nur Bild - was sie
 * zählt, steht daneben als Text.
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

  // POR-011: offene Terminwünsche von der Plattform.
  const wuensche = useQuery({
    queryKey: PLATFORM_REQUESTS_KEY,
    queryFn: () => fetchPlatformRequests('open'),
    enabled: canManageAppointments(user.roles) || canReadTrainingClients(user.roles),
    retry: false,
  });

  const offen = aufgaben.data ?? [];
  const ueberfaellig = offen.filter((task) => isOverdue(task, today)).length;
  const heute = offen.filter((task) => task.due_on === today).length;
  const fotos = scans.data?.length ?? 0;
  const terminwuensche = wuensche.data?.length ?? 0;

  const teile = [
    ueberfaellig > 0 ? anzahl(ueberfaellig, 'überfällige Aufgabe', 'überfällige Aufgaben') : null,
    heute > 0 ? anzahl(heute, 'Aufgabe heute fällig', 'Aufgaben heute fällig') : null,
    fotos > 0 ? anzahl(fotos, 'Verordnung zu erfassen', 'Verordnungen zu erfassen') : null,
    terminwuensche > 0 ? anzahl(terminwuensche, 'Terminwunsch', 'Terminwünsche') : null,
  ].filter((teil): teil is string => teil !== null);

  if (teile.length === 0) return null;

  return (
    // Die Zeile ist selbst der Weg: ein zweiter Link „Zu den offenen Punkten"
    // daneben nannte das Ziel zweimal (UX-005h).
    <Link
      to="/offen"
      className="border-line bg-surface rounded-card hover:bg-accent-soft mt-6 flex min-h-15 items-center justify-between gap-3 border px-4 py-2 transition-colors duration-120"
    >
      <span className="min-w-0">
        <span className="text-ink block text-base font-semibold">
          Offene Punkte
          {/* Für Vorlesesoftware ein Satz: „Offene Punkte: 2 überfällige …". */}
          <span className="sr-only">:</span>
        </span>
        {/* Das Leerzeichen steht zwischen den beiden Zeilen und nicht in
            einer von ihnen: Am Rand eines Elements fiele es weg, und
            Vorlesesoftware läse „Punkte:2". */}{' '}
        <span className="text-ink-muted block text-sm">{teile.join(' · ')}</span>
      </span>
      <span
        aria-hidden="true"
        className="text-accent flex shrink-0 items-center gap-1.5 text-base font-bold tabular-nums"
      >
        {ueberfaellig + heute + fotos + terminwuensche}
        <span>→</span>
      </span>
    </Link>
  );
}
