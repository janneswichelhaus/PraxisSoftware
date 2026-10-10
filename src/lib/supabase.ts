import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readEnv } from '@/lib/env';

let client: SupabaseClient | undefined;

/**
 * Supabase-Client für den Browser.
 *
 * Verwendet ausschließlich den öffentlichen anon key. Die eigentliche
 * Autorisierung liegt in den RLS-Policies der Datenbank (ADR-004); der Client
 * ist bewusst nicht vertrauenswürdig.
 *
 * Wird bewusst erst beim ersten Zugriff erzeugt, damit ein Import des Moduls
 * (etwa in Tests) keine Konfiguration erzwingt.
 */
export function getSupabase(): SupabaseClient {
  if (!client) {
    const env = readEnv();
    client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        // Passkeys sind beim Anmeldedienst Beta und im SDK ausdrücklich
        // einzuschalten (ADR-025 Punkt 10, W3 ohne Schalter der Anwendung).
        // Benutzt werden sie nur über `features/auth/passkey.ts`.
        experimental: { passkey: true },
      },
    });
  }
  return client;
}
