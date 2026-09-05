import { z } from 'zod';
import { getSupabase } from '@/lib/supabase';

/**
 * Zugriff auf das Auditlog (ADR-010).
 *
 * Gelesen wird ausschließlich über die Funktion `list_audit_events`. Es gibt
 * kein direktes SELECT-Recht auf `audit_log`; die Funktion prüft
 * Authentifizierung, owner-Rolle und Organisation serverseitig. Die UI kann
 * diese Prüfung nicht umgehen.
 */
const auditEventSchema = z.object({
  id: z.string(),
  occurred_at: z.string(),
  actor_user_id: z.string().nullable(),
  /** system: zeitgesteuerter Vorgang ohne Account, etwa die automatische Finalisierung (DOK-004). */
  actor_kind: z.enum(['user', 'system']),
  actor_display_name: z.string().nullable(),
  action: z.string(),
  subject_type: z.string(),
  subject_id: z.string().nullable(),
  outcome: z.string(),
  total_count: z.union([z.number(), z.string()]).transform(Number),
});

export type AuditEvent = z.infer<typeof auditEventSchema>;

export interface AuditFilter {
  from?: string | undefined;
  to?: string | undefined;
  actorUserId?: string | undefined;
  action?: string | undefined;
  page: number;
  pageSize: number;
}

export interface AuditPage {
  events: AuditEvent[];
  totalCount: number;
}

/** Tagesbeginn lokal; `null` bei leerer Eingabe. */
function startOfDay(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Beginn des Folgetags - die Serverfunktion vergleicht `< p_to`. */
function startOfNextDay(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() + 1);
  return date.toISOString();
}

export async function fetchAuditEvents(filter: AuditFilter): Promise<AuditPage> {
  // Ohne generierte Datenbanktypen liefert rpc() `any`. Die Antwort wird
  // deshalb als `unknown` behandelt und ausschliesslich ueber Zod validiert.
  const { data, error } = (await getSupabase().rpc('list_audit_events', {
    p_from: startOfDay(filter.from),
    p_to: startOfNextDay(filter.to),
    p_actor_user_id: filter.actorUserId ?? null,
    p_action: filter.action ?? null,
    p_limit: filter.pageSize,
    p_offset: filter.page * filter.pageSize,
  })) as { data: unknown; error: unknown };

  if (error) throw new Error('Die Auditeinträge konnten nicht geladen werden.');

  const events = z.array(auditEventSchema).parse(data ?? []);
  return { events, totalCount: events[0]?.total_count ?? 0 };
}

const memberSchema = z.object({ id: z.string(), display_name: z.string() });
export type OrganizationMember = z.infer<typeof memberSchema>;

/** Auswahlliste für den Benutzerfilter. RLS gibt owner die Profile der eigenen Organisation frei. */
export async function fetchOrganizationMembers(): Promise<OrganizationMember[]> {
  const { data, error } = await getSupabase()
    .from('user_profiles')
    .select('id, display_name')
    .order('display_name');

  if (error) throw new Error('Die Benutzerliste konnte nicht geladen werden.');
  return z.array(memberSchema).parse(data ?? []);
}

export function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'medium' }).format(date);
}

/** Kurzreferenz auf das betroffene Objekt - die vollständige ID bleibt als Titel erreichbar. */
export function shortReference(subjectId: string | null): string {
  if (!subjectId) return '—';
  return `…${subjectId.slice(-12)}`;
}
