import type { RoleKey } from '@/features/session/types';
import { Badge } from './Badge';
import { roleLabel } from './roleLabels';

/**
 * Die Rolle als Etikett (UIK-18): ein `Badge` im Ton `akzent` - keine eigene
 * Nachbildung seiner Klassen, damit beide nicht auseinanderlaufen. Eine Rolle
 * ist kein Zustand und trägt deshalb kein Zeichen.
 */
export function RoleBadge({ role }: { role: RoleKey }) {
  return <Badge ton="akzent">{roleLabel(role)}</Badge>;
}
