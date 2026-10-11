import { useEffect, useRef } from 'react';

/**
 * Das Passkey-Fenster öffnet sich von selbst (Jannes, 2026-10-11): auf der
 * Anmeldeseite und auf der Sperrseite, sobald sie erscheinen.
 *
 * Einmal beim Erscheinen - auch wenn React den Effekt doppelt ausführt - und
 * noch einmal, wenn die Person in den Tab oder die App zurückkehrt: Ein
 * verborgener Tab darf keine Zeremonie beginnen, und eine Sperre, die im
 * Hintergrund kam, soll beim Zurückkommen schon fragen.
 *
 * `starten` gibt ein Versprechen zurück, das endet, wenn die Zeremonie endet;
 * solange eine läuft, beginnt keine zweite.
 */
export function usePasskeyVonSelbst(starten: () => Promise<void>, aktiv: boolean): void {
  const laeuft = useRef(false);
  const gestartet = useRef(false);
  const aktuell = useRef(starten);
  aktuell.current = starten;

  useEffect(() => {
    if (!aktiv) return;
    function versuchen() {
      if (laeuft.current || document.visibilityState !== 'visible') return;
      laeuft.current = true;
      void aktuell.current().finally(() => {
        laeuft.current = false;
      });
    }
    if (!gestartet.current) {
      gestartet.current = true;
      versuchen();
    }
    function beiRueckkehr() {
      if (document.visibilityState === 'visible') versuchen();
    }
    document.addEventListener('visibilitychange', beiRueckkehr);
    return () => document.removeEventListener('visibilitychange', beiRueckkehr);
  }, [aktiv]);
}
