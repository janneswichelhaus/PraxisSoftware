import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Eine Bestätigung nach dem Absenden (`?gesendet=1`, `?checkin=1`, …) gilt
 * genau einmal, an der Stelle, an die der Ablauf zurückführt (DR-160,
 * Design-Review Lauf 1). Der Wert wird beim ersten Lesen gemerkt und der
 * Parameter sofort aus der Adresse genommen: So trägt ihn kein Reiter, kein
 * Link und kein Neuladen an eine andere Seite. Vorher stand nach dem Senden
 * einer Nachricht unter „Termine“ „Ihr Wunsch ist bei der Praxis angekommen“,
 * ohne dass ein Wunsch gesendet wurde.
 */
export function useEinmaligeRueckmeldung(name: string): string | null {
  const [suche, setSuche] = useSearchParams();
  const aktuell = suche.get(name);
  const [wert, setWert] = useState(aktuell);
  useEffect(() => {
    if (aktuell === null) return;
    setWert(aktuell);
    setSuche(
      (alt) => {
        const neu = new URLSearchParams(alt);
        neu.delete(name);
        return neu;
      },
      { replace: true },
    );
  }, [aktuell, name, setSuche]);
  return wert;
}
