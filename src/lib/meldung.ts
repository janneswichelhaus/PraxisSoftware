import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/** Eine Bestätigung aus dem Verlauf, mit dem Schlüssel ihres Eintrags. */
export interface VerlaufsMeldung {
  text: string;
  schluessel: string;
}

function leseText(zustand: unknown): string | null {
  if (typeof zustand !== 'object' || zustand === null || !('meldung' in zustand)) return null;
  const { meldung } = zustand;
  return typeof meldung === 'string' && meldung.trim() !== '' ? meldung : null;
}

/**
 * Die Bestätigung eines Vorgangs (`navigate(ziel, { state: { meldung } })`),
 * genau einmal: Die Seite merkt sie sich und nimmt sie aus dem
 * Verlaufseintrag. Nach einem Neuladen oder „Zurück“ erschien sie sonst
 * wieder - mit einem Saldo oder Zustand, der längst nicht mehr gilt (Design-
 * und Praxis-Review Überholung 9; `Rueckmeldung` erscheint nur nach einem
 * bestätigten Erfolg).
 *
 * Der Schlüssel gehört zum Eintrag, mit dem die Meldung kam: Als `key` der
 * `Rueckmeldung` nimmt eine neue Meldung wieder den Fokus, das Entfernen aus
 * dem Verlauf nicht.
 */
export function useMeldungAusVerlauf(): VerlaufsMeldung | null {
  const ort = useLocation();
  const navigate = useNavigate();
  const text = leseText(ort.state);
  const [gemerkt, setGemerkt] = useState<VerlaufsMeldung | null>(null);

  useEffect(() => {
    if (text === null) return;
    setGemerkt({ text, schluessel: ort.key });
    void navigate(
      { pathname: ort.pathname, search: ort.search, hash: ort.hash },
      { replace: true, state: null },
    );
    // Der ersetzte Eintrag trägt keine Meldung mehr - danach läuft hier nichts.
  }, [text, ort.key, ort.pathname, ort.search, ort.hash, navigate]);

  return text !== null ? { text, schluessel: ort.key } : gemerkt;
}
