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

type AppEnv = z.infer<typeof envSchema>;

/** Nur die Felder, die diese Anwendung tatsächlich liest. */
interface EnvSource {
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

/** Nur das Feld, aus dem der Kachelschlüssel kommt. */
interface TileEnvSource {
  VITE_PTV_TILE_API_KEY?: string | undefined;
}

/**
 * Kachelschlüssel des Kartendienstes - **optional**, deshalb getrennt von
 * `readEnv`.
 *
 * Ohne diesen Schlüssel läuft die Anwendung vollständig; nur die Karte zeigt
 * statt Kartenmaterial einen Hinweis. Eine fehlende Supabase-Adresse ist ein
 * Konfigurationsfehler, ein fehlender Kachelschlüssel nicht - deshalb wirft
 * diese Funktion nicht, sondern liefert `null`.
 *
 * Der Schlüssel ist kein Secret im Sinne von `PROJECT_PRINCIPLES.md` 3.3,
 * sondern eine im Browser sichtbare Abrechnungskennung (ADR-019 Punkt 19).
 * Er gehört trotzdem nie ins Repository: `.env.local` bleibt ungetrackt, und
 * der serverseitige Schlüssel für Geocoding, Routing und Matrix ist ein
 * anderer und bleibt ein Secret.
 */
export function readMapTileApiKey(source: TileEnvSource = import.meta.env): string | null {
  const wert = source.VITE_PTV_TILE_API_KEY?.trim();
  return wert ? wert : null;
}
