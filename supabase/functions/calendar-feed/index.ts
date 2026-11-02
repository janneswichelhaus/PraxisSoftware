/**
 * Einziger Einstieg mit Laufzeit; hält einen eigenen Schlüssel nur für `calendar_feed` (ANN-839),
 * scharf erst nach der Prüfung der Edge Runtime (ADR-015 Punkt 20).
 */

import { erstelleHandler } from './handler.ts';
import { erstelleQuelle } from './quelle.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
// Ein eigenes Secret statt der Vorgabe der Laufzeit: scharf erst, wenn es jemand bewusst setzt.
const adminKey = Deno.env.get('CALENDAR_FEED_ADMIN_KEY') ?? '';

Deno.serve(
  erstelleHandler({
    quelle:
      supabaseUrl.trim() !== '' && adminKey.trim() !== ''
        ? erstelleQuelle({ supabaseUrl, adminKey })
        : null,
  }),
);
