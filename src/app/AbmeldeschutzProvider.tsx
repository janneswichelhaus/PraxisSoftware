import { useCallback, useMemo, useRef, type ReactNode } from 'react';
import { AbmeldeschutzKontext, type Abmeldeschutz } from './abmeldeschutz';

/**
 * Hält die Wachen, die das freiwillige Abmelden anhalten dürfen (FIX-014).
 *
 * Begründung und Grenzen stehen in `abmeldeschutz.ts` — insbesondere, dass die
 * **erzwungene** Beendigung einer Sitzung hier nicht vorbeikommt und
 * unverändert sofort greift.
 *
 * **Eine Menge, keine einzelne Stelle (NAV-01, DAT-04).** Bis UXR-002 hielt
 * der Schutz genau eine Wache. Seit auch Formulare ohne Dokumentationsbezug
 * und das ausstehende Foto sich anmelden, können zwei zugleich offen sein -
 * und mit einer einzigen Stelle verdrängte die zweite die erste, und wer
 * zuerst ging, nahm die andere mit.
 *
 * Wachen und Abmeldefunktion liegen in Referenzen: Beide ändern sich bei jedem
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
  const wachen = useRef(new Set<() => boolean>());
  // Die Wachen, die in der laufenden Runde noch nicht gefragt sind. Eine
  // Runde beginnt mit jedem Tap auf „Abmelden".
  const offen = useRef<(() => boolean)[]>([]);
  const abmeldenRef = useRef(onAbmelden);
  abmeldenRef.current = onAbmelden;

  const meldeWacheAn = useCallback((wache: () => boolean) => {
    wachen.current.add(wache);
    return () => {
      wachen.current.delete(wache);
    };
  }, []);

  const abmelden = useCallback(() => {
    // Die nächste Wache der Runde fragt. Eine Seite, die inzwischen fort ist,
    // fragt nicht mehr.
    for (let wache = offen.current.shift(); wache; wache = offen.current.shift()) {
      if (wachen.current.has(wache) && wache()) return;
    }
    // Die Wachen gelten für diesen einen Vorgang; danach sind die Seiten
    // ohnehin fort. Ohne das Zurücknehmen fragten sie bei einem zweiten Tap
    // auf „Abmelden" erneut, während die Anwendung schon abgemeldet wird.
    wachen.current.clear();
    abmeldenRef.current();
  }, []);

  const anfordern = useCallback(() => {
    // Übernimmt eine Wache, geschieht hier nichts weiter: Sie fragt, und sie
    // ruft später `abmelden()` — oder eben nicht.
    offen.current = [...wachen.current];
    abmelden();
  }, [abmelden]);

  const wert = useMemo<Abmeldeschutz>(
    () => ({ anfordern, abmelden, meldeWacheAn }),
    [anfordern, abmelden, meldeWacheAn],
  );

  return <AbmeldeschutzKontext.Provider value={wert}>{children}</AbmeldeschutzKontext.Provider>;
}
