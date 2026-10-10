import { createContext, useContext } from 'react';

/**
 * Endete die letzte Sitzung von außen, nicht durch „Abmelden" auf dieser
 * Seite? (BEF-047) Der `SessionProvider` setzt es, die Anmeldemaske liest es.
 *
 * Ein eigener Kontext neben `SessionContext`, nicht ein weiteres Feld darin:
 * Viele Tests ersetzen `sessionContext` durch einen Mock mit nur
 * `useSession`. Ohne Anbieter - in Tests und Vorschauen - gilt `false`.
 */
export const SitzungsendeContext = createContext(false);

export function useSitzungEndeteVonAussen(): boolean {
  return useContext(SitzungsendeContext);
}
