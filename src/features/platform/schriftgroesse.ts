import { useCallback, useEffect, useState } from 'react';

/**
 * Schriftgröße der Plattform, auf diesem Gerät (POR-020, ANN-267).
 *
 * Gespeichert im Speicher des Browsers, nicht auf dem Server: Es ist eine
 * Bequemlichkeit des Geräts, kein Datum über die Person (Art. 5 Abs. 1
 * lit. c DSGVO), und auf dem Tablet der Tochter soll nicht die Schrift des
 * Telefons der Mutter gelten. Fehlt der Speicher (privates Fenster,
 * gesperrte Daten), gilt „Normal" - die Seite bleibt benutzbar.
 *
 * Wirkt über `data-schrift` an `<html>` (`src/index.css`), nur solange die
 * Plattform zu sehen ist; die Praxisoberfläche bleibt unberührt.
 */
export const SCHRIFTGROESSEN = ['normal', 'gross', 'sehr-gross'] as const;
export type Schriftgroesse = (typeof SCHRIFTGROESSEN)[number];

export const SCHRIFTGROESSE_NAME: Record<Schriftgroesse, string> = {
  normal: 'Normal',
  gross: 'Groß',
  'sehr-gross': 'Sehr groß',
};

const SCHLUESSEL = 'plattform-schriftgroesse';
const EREIGNIS = 'plattform-schriftgroesse';

/** Die Wahl ohne Speicher des Browsers, bis die Seite neu lädt. */
let sitzungswahl: Schriftgroesse | null = null;

export function gespeicherteSchriftgroesse(): Schriftgroesse {
  try {
    const wert = window.localStorage.getItem(SCHLUESSEL);
    return SCHRIFTGROESSEN.find((s) => s === wert) ?? sitzungswahl ?? 'normal';
  } catch {
    return sitzungswahl ?? 'normal';
  }
}

/**
 * Die gewählte Größe und ihr Setzen. Mehrere Stellen derselben Seite
 * (Gerüst und Einstellungen) bleiben über ein Ereignis gleich.
 */
export function useSchriftgroesse(): [Schriftgroesse, (groesse: Schriftgroesse) => void] {
  const [groesse, setGroesse] = useState<Schriftgroesse>(gespeicherteSchriftgroesse);

  useEffect(() => {
    const neu = () => setGroesse(gespeicherteSchriftgroesse());
    window.addEventListener(EREIGNIS, neu);
    return () => window.removeEventListener(EREIGNIS, neu);
  }, []);

  const setzen = useCallback((neu: Schriftgroesse) => {
    try {
      window.localStorage.setItem(SCHLUESSEL, neu);
    } catch {
      // Ohne Speicher gilt die Wahl, bis die Seite neu lädt.
      sitzungswahl = neu;
    }
    setGroesse(neu);
    window.dispatchEvent(new Event(EREIGNIS));
  }, []);

  return [groesse, setzen];
}

/**
 * Wendet die Größe an, solange das Plattformgerüst steht - genau eine Stelle
 * (`PlattformApp`), damit das Verlassen einer Unterseite sie nicht abschaltet.
 */
export function useSchriftgroesseAnwenden(): void {
  const [groesse] = useSchriftgroesse();
  useEffect(() => {
    if (groesse === 'normal') delete document.documentElement.dataset.schrift;
    else document.documentElement.dataset.schrift = groesse;
    return () => {
      delete document.documentElement.dataset.schrift;
    };
  }, [groesse]);
}
