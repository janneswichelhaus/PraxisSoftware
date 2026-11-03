/**
 * Einziger Einstieg mit Laufzeit; hält nur das Token einer Rolle, die genau `calendar_feed` darf
 * (ANN-839), scharf erst nach der Prüfung der Edge Runtime (ADR-015 Punkt 20).
 */

import { erstelleHandler } from './handler.ts';
import { erstelleQuelle } from './quelle.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const apiKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
// Ein eigenes Secret statt einer Vorgabe der Laufzeit: scharf erst, wenn es jemand bewusst setzt.
const rollenToken = Deno.env.get('CALENDAR_FEED_ROLE_KEY') ?? '';

Deno.serve(
  erstelleHandler({
    quelle: [supabaseUrl, apiKey, rollenToken].every((wert) => wert.trim() !== '')
      ? erstelleQuelle({ supabaseUrl, apiKey, rollenToken })
      : null,
  }),
);
