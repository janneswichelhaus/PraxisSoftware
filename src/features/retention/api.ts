import { z } from 'zod';
import { getSupabase } from '@/lib/supabase';

/**
 * Lesezugriff auf Aufbewahrung und Löschung (LOE-002b).
 *
 * Drei Quellen, drei Rechtelagen:
 *
 *   Aufbewahrungsplan  `retention_classes`/`retention_assignments` — Konfiguration
 *                      ohne Personenbezug, für Praxisrollen lesbar.
 *   Löschsperren       `list_legal_holds()` — nur `owner`; die Funktion prüft
 *                      das selbst, die Tabelle hat weder Recht noch Policy.
 *   Löschläufe         `list_deletion_runs()` — nur `owner`, Zahlen über
 *                      bereits gelöschte Datensätze.
 *
 * Geschrieben wird hier nichts: Eine Frist ändert sich über eine Migration,
 * nicht über die Oberfläche (ADR-008, ADR-013).
 */

const klasseSchema = z.object({
  key: z.string(),
  basis: z.string(),
  legal_reference: z.string().nullable(),
  anchor: z.string(),
  // PostgREST liefert `interval` als Zeichenkette; die Umrechnung in Worte
  // macht `fristText` in klassen.ts.
  retention_interval: z.string().nullable(),
  // Optionale Obergrenze - bisher nur bei Patientenfotos (ADR-017 Punkt 38).
  upper_bound_anchor: z.string().nullable(),
  upper_bound_interval: z.string().nullable(),
  assumption_key: z.string().nullable(),
  note: z.string(),
  sort_order: z.number(),
});

const zuordnungSchema = z.object({
  table_name: z.string(),
  class_key: z.string(),
  deletion_mode: z.string(),
  sort_order: z.number(),
});

export type Datenklasse = z.infer<typeof klasseSchema> & {
  tabellen: { name: string; modus: string }[];
};

export async function fetchRetentionSchedule(): Promise<Datenklasse[]> {
  const supabase = getSupabase();

  const [klassen, zuordnungen] = await Promise.all([
    supabase
      .from('retention_classes')
      .select(
        'key, basis, legal_reference, anchor, retention_interval, upper_bound_anchor, upper_bound_interval, assumption_key, note, sort_order',
      )
      .order('sort_order'),
    supabase
      .from('retention_assignments')
      .select('table_name, class_key, deletion_mode, sort_order')
      .order('sort_order'),
  ]);

  if (klassen.error || zuordnungen.error) {
    throw new Error('Der Aufbewahrungsplan konnte nicht geladen werden.');
  }

  const zugeordnet = z.array(zuordnungSchema).parse(zuordnungen.data ?? []);

  return z
    .array(klasseSchema)
    .parse(klassen.data ?? [])
    .map((klasse) => ({
      ...klasse,
      tabellen: zugeordnet
        .filter((z) => z.class_key === klasse.key)
        .map((z) => ({ name: z.table_name, modus: z.deletion_mode })),
    }));
}

const sperreSchema = z.object({
  id: z.string(),
  subject_type: z.string(),
  subject_id: z.string(),
  subject_name: z.string().nullable(),
  reason: z.string(),
  placed_at: z.string(),
  placed_by_name: z.string().nullable(),
});

export type Loeschsperre = z.infer<typeof sperreSchema>;

export async function fetchLegalHolds(): Promise<Loeschsperre[]> {
  // Ohne generierte Datenbanktypen liefert rpc() `any`. Die Antwort wird
  // deshalb als `unknown` behandelt und ausschliesslich über Zod validiert.
  const { data, error } = (await getSupabase().rpc('list_legal_holds')) as {
    data: unknown;
    error: unknown;
  };

  if (error) throw new Error('Die Löschsperren konnten nicht geladen werden.');
  return z.array(sperreSchema).parse(data ?? []);
}

const laufSchema = z.object({
  run_id: z.string(),
  deleted_at: z.string(),
  retention_class: z.string(),
  target_table: z.string(),
  record_count: z.union([z.number(), z.string()]).transform(Number),
});

export type Loeschlauf = z.infer<typeof laufSchema>;

export async function fetchDeletionRuns(): Promise<Loeschlauf[]> {
  const { data, error } = (await getSupabase().rpc('list_deletion_runs', { p_limit: 50 })) as {
    data: unknown;
    error: unknown;
  };

  if (error) throw new Error('Das Löschjournal konnte nicht geladen werden.');
  return z.array(laufSchema).parse(data ?? []);
}

/** Zeitpunkt als „11.09.2026, 14:30". */
export function formatZeitpunkt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}
