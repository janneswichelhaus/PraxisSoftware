import { z } from 'zod';

/**
 * Clientseitige Konfiguration.
 *
 * Es dürfen ausschließlich öffentliche Werte über VITE_* laufen - alles mit
 * diesem Präfix landet im Browser-Bundle. Der Supabase service_role key gehört
 * niemals hierher (ADR-015, Sicherheitsregeln).
 */
const envSchema = z.object({
  supabaseUrl: z
    .string()
    .min(1, 'VITE_SUPABASE_URL fehlt.')
    .refine((value) => URL.canParse(value), 'VITE_SUPABASE_URL ist keine gültige URL.'),
  supabaseAnonKey: z.string().min(1, 'VITE_SUPABASE_ANON_KEY fehlt.'),
});

export type AppEnv = z.infer<typeof envSchema>;

/** Nur die Felder, die diese Anwendung tatsächlich liest. */
export interface EnvSource {
  VITE_SUPABASE_URL?: string | undefined;
  VITE_SUPABASE_ANON_KEY?: string | undefined;
}

export function readEnv(source: EnvSource = import.meta.env): AppEnv {
  // Fehlende Variablen werden auf '' abgebildet, damit die verstaendliche
  // Meldung greift statt einer generischen Typmeldung.
  const result = envSchema.safeParse({
    supabaseUrl: source.VITE_SUPABASE_URL ?? '',
    supabaseAnonKey: source.VITE_SUPABASE_ANON_KEY ?? '',
  });

  if (!result.success) {
    const details = result.error.issues.map((issue) => issue.message).join(' ');
    throw new Error(
      `Konfiguration unvollständig: ${details} Siehe .env.example und docs/DEVELOPMENT.md.`,
    );
  }

  return result.data;
}
