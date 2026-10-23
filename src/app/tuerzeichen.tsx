/**
 * Die Zeichen der Türseiten (Handoff 2026-10-22, Abschnitt 5.2): im Raster 24
 * mit Strich 2, gezeichnet von `Vollseite` im Kreis über dem Titel. Nur
 * Schmuck - der Titel sagt, was los ist.
 */

/** Ein Brief: Die Einladung lässt sich nicht verwenden. */
export const BRIEF = (
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </>
);

/** Ein Schlüssel: Für die Adresse gibt es schon einen Zugang. */
export const SCHLUESSEL = (
  <>
    <circle cx="8" cy="15" r="4" />
    <path d="m10.8 12.2 8.7-8.7M16 7l3 3M13.5 9.5l2 2" />
  </>
);

/** Eine Person mit Haken: schon angemeldet. */
export const ANGEMELDET = (
  <>
    <circle cx="9" cy="8" r="4" />
    <path d="M2 21a7 7 0 0 1 14 0M16 11l2 2 4-4" />
  </>
);

/** Ein Telefon: Hier lässt sich kein Passkey anlegen. */
export const TELEFON = (
  <>
    <rect x="7" y="2" width="10" height="20" rx="2" />
    <path d="M11 18h2" />
  </>
);

/** Ein Schloss: gesperrt, zu viele Versuche. */
export const SCHLOSS = (
  <>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </>
);
