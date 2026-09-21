/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Optionaler Kachelschlüssel der Karte (MAP-002); fehlt er, bleibt die Karte leer. */
  readonly VITE_PTV_TILE_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
