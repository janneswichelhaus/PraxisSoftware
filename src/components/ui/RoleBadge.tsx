import type { RoleKey } from '@/features/session/types';
import { roleLabel } from './roleLabels';

export function RoleBadge({ role }: { role: RoleKey }) {
  return (
    <span className="bg-accent-soft text-accent inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium">
      {roleLabel(role)}
    </span>
  );
}
