import type { RoleKey } from '@/features/session/types';
import { roleLabel } from './roleLabels';

export function RoleBadge({ role }: { role: RoleKey }) {
  return (
    <span className="bg-accent-soft text-accent rounded-pill inline-flex items-center px-2.5 py-0.5 text-xs font-medium">
      {roleLabel(role)}
    </span>
  );
}
