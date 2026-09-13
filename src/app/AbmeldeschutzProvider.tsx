import { useCallback, useMemo, useRef, type ReactNode } from 'react';
import { AbmeldeschutzKontext, type Abmeldeschutz } from './abmeldeschutz';

/**
 * Hält die Wache, die das freiwillige Abmelden anhalten darf (FIX-014).
 *
 * Begründung und Grenzen stehen in `abmeldeschutz.ts` — insbesondere, dass die
 * **erzwungene** Beendigung einer Sitzung hier nicht vorbeikommt und
 * unverändert sofort greift.
 *
 * Wache und Abmeldefunktion liegen in Referenzen: Beide ändern sich bei jedem
 * Rendern der Anwendung, und ein Kontextwert, der sich mitändert, ließe jede
 * Seite darunter neu rendern.
 */
export function AbmeldeschutzProvider({
  onAbmelden,
  children,
}: {
  onAbmelden: () => void;
  children: ReactNode;
}) {
  const wache = useRef<(() => boolean) | null>(null);
  const abmeldenRef = useRef(onAbmelden);
  abmeldenRef.current = onAbmelden;

  const setzeWache = useCallback((neue: (() => boolean) | null) => {
    wache.current = neue;
  }, []);

  const abmelden = useCallback(() => {
    // Die Wache gilt für diesen einen Vorgang; danach ist die Seite ohnehin
    // fort. Ohne das Zurücknehmen bliebe sie an einer Anwendung hängen, die
    // gerade abgemeldet wird.
    wache.current = null;
    abmeldenRef.current();
  }, []);

  const anfordern = useCallback(() => {
    // Übernimmt die Wache, geschieht hier nichts weiter: Sie fragt, und sie
    // ruft später `abmelden()` — oder eben nicht.
    if (wache.current?.()) return;
    abmelden();
  }, [abmelden]);

  const wert = useMemo<Abmeldeschutz>(
    () => ({ anfordern, abmelden, setzeWache }),
    [anfordern, abmelden, setzeWache],
  );

  return <AbmeldeschutzKontext.Provider value={wert}>{children}</AbmeldeschutzKontext.Provider>;
}
