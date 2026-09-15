import type { CurrentUser, RoleKey } from '@/features/session/types';
import type { Mitarbeitende } from './types';
import type { Vorschauzustand } from './vorschauContext';

/**
 * Wer man im Vorschaugerüst ist.
 *
 * Die Vorschaubereiche haben keine Anbindung an den echten Mitarbeiterstamm.
 * Damit „meine Anträge", „mein Rad" und „meine Erwähnungen" trotzdem etwas
 * bedeuten, wird das angemeldete Konto einer synthetischen Person zugeordnet:
 * bevorzugt über den Anzeigenamen, sonst über eine zur Rolle passende
 * Demoperson.
 *
 * Die Zuordnung wird in der Oberfläche immer benannt. Sie erweitert keine
 * Rechte und sagt nichts über echte Berechtigungen aus.
 */

const rollenVorgabe: Partial<Record<RoleKey, string>> = {
  owner: 'm1',
  team_lead: 'm2',
  office: 'm7',
  therapist: 'm3',
};

interface Vorschauidentitaet {
  person: Mitarbeitende;
  /** Wurde über den Anzeigenamen zugeordnet? */
  ueberNamen: boolean;
}

export function vorschauidentitaet(
  zustand: Vorschauzustand,
  user: CurrentUser,
): Vorschauidentitaet | null {
  if (zustand.mitarbeitende.length === 0) return null;

  const name = user.profile.display_name.trim().toLowerCase();
  const treffer = zustand.mitarbeitende.find((person) => person.name.trim().toLowerCase() === name);
  if (treffer) return { person: treffer, ueberNamen: true };

  for (const rolle of ['owner', 'team_lead', 'office', 'therapist'] as RoleKey[]) {
    if (!user.roles.includes(rolle)) continue;
    const vorgabe = zustand.mitarbeitende.find((person) => person.id === rollenVorgabe[rolle]);
    if (vorgabe) return { person: vorgabe, ueberNamen: false };
  }

  const erste = zustand.mitarbeitende[0];
  return erste ? { person: erste, ueberNamen: false } : null;
}

/** Darf diese Rolle in der Vorschau über Anträge entscheiden? */
export function darfEntscheiden(user: CurrentUser): boolean {
  return user.roles.some((rolle) => rolle === 'owner' || rolle === 'team_lead');
}
