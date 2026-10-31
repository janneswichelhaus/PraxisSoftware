import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import {
  type AssignableTherapist,
  fetchAssignableTherapists,
  fetchAssignableTrainers,
  fetchLocations,
  fetchStaffMembers,
  type Location,
} from '@/features/workforce';

/** Wer den Termin übernimmt: Behandlung, Training oder Beteiligte einer Fehlzeit. */
export type AssigneeGroup = 'therapy' | 'training' | 'staff';

/** Beschriftung der Personenauswahl, ohne Pflichtsternchen auch in der Fehlerzusammenfassung. */
export const ASSIGNEE_LABELS: Readonly<Record<AssigneeGroup, string>> = {
  therapy: 'Behandelnde Person',
  training: 'Betreuende Person',
  staff: 'Beteiligte Person',
};

export interface AppointmentFormLists {
  group: AssigneeGroup;
  personen: UseQueryResult<AssignableTherapist[]>;
  standorte: UseQueryResult<Location[]>;
}

type StaffMembers = Awaited<ReturnType<typeof fetchStaffMembers>>;

// Auf Modulebene, damit die Abfrage das Ergebnis behält, solange die Liste gleich bleibt.
function activeStaff(liste: StaffMembers): AssignableTherapist[] {
  return liste
    .filter((person) => person.employment_status === 'active')
    .map((person) => ({
      staff_member_id: person.id,
      display_name: `${person.given_name} ${person.family_name}`,
    }));
}

/**
 * Die Auswahllisten des Terminformulars. Die Seite ruft sie vor ihrem eigenen Laden auf,
 * damit Personen und Standorte neben Akte oder Termin laden statt danach.
 */
export function useAppointmentFormLists(
  group: AssigneeGroup,
  enabled = true,
): AppointmentFormLists {
  const zuordenbar = useQuery({
    queryKey: [group === 'training' ? 'assignable-trainers' : 'assignable-therapists'],
    queryFn: group === 'training' ? fetchAssignableTrainers : fetchAssignableTherapists,
    enabled: enabled && group !== 'staff',
    retry: false,
  });
  const beschaeftigte = useQuery({
    queryKey: ['staff-members'],
    queryFn: fetchStaffMembers,
    select: activeStaff,
    enabled: enabled && group === 'staff',
    retry: false,
  });
  const standorte = useQuery({ queryKey: ['locations'], queryFn: fetchLocations, retry: false });
  return { group, personen: group === 'staff' ? beschaeftigte : zuordenbar, standorte };
}
