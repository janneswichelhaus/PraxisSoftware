import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/** Eine Bestätigung aus dem Verlauf, mit dem Schlüssel ihres Eintrags. */
export interface VerlaufsMeldung {
  text: string;
  schluessel: string;
}

/** Die gemerkte Meldung samt der Seite, zu der sie gehört (Pfad und Suche). */
interface Gemerkt extends VerlaufsMeldung {
  seite: string;
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
 * Sie gehört zu der Seite, auf der sie kam: Wechselt dieselbe Seite auf ein
 * anderes Konto (`?person=…`), ist sie weg und kommt auch beim Zurückwechseln
 * nicht wieder (Design-Review Überholung 9, Runde 2). `verwerfen` nimmt sie,
 * wenn ein weiterer Vorgang auf der Seite sie überholt hat, etwa ein
 * Zurücknehmen.
 *
 * Der Schlüssel gehört zum Eintrag, mit dem die Meldung kam: Als `key` der
 * `Rueckmeldung` nimmt eine neue Meldung wieder den Fokus, das Entfernen aus
 * dem Verlauf nicht.
 */
export function useMeldungAusVerlauf(): {
  meldung: VerlaufsMeldung | null;
  verwerfen: () => void;
} {
  const ort = useLocation();
  const navigate = useNavigate();
  const text = leseText(ort.state);
  const seite = `${ort.pathname}${ort.search}`;
  const [gemerkt, setGemerkt] = useState<Gemerkt | null>(null);

  useEffect(() => {
    if (text === null) return;
    setGemerkt({ text, schluessel: ort.key, seite });
    void navigate(
      { pathname: ort.pathname, search: ort.search, hash: ort.hash },
      { replace: true, state: null },
    );
    // Der ersetzte Eintrag trägt keine Meldung mehr - danach läuft hier nichts.
  }, [text, ort.key, ort.pathname, ort.search, ort.hash, seite, navigate]);

  useEffect(() => {
    if (gemerkt !== null && gemerkt.seite !== seite) setGemerkt(null);
  }, [gemerkt, seite]);

  const verwerfen = useCallback(() => setGemerkt(null), []);
  const meldung =
    text !== null
      ? { text, schluessel: ort.key }
      : gemerkt !== null && gemerkt.seite === seite
        ? { text: gemerkt.text, schluessel: gemerkt.schluessel }
        : null;
  return { meldung, verwerfen };
}

/**
 * Eine Bestätigung, die ein anderer Vorgang beim Seitenwechsel mitgibt: `navigate(ziel, { state:
 * { meldung } })`, ein kurzer Satz ohne Namen. Er steht im Verlauf des Browsers, nie in der Adresse.
 */
export function leseMeldung(zustand: unknown): string | null {
  if (typeof zustand !== 'object' || zustand === null || !('meldung' in zustand)) return null;
  const { meldung } = zustand;
  return typeof meldung === 'string' && meldung.trim() !== '' ? meldung : null;
}
