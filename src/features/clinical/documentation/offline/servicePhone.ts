import { useEffect, useState } from 'react';
import { z } from 'zod';
import { dauerfachAendern, dauerfachLesen, fachAendern } from '@/lib/geraeteablage';

/**
 * Das eingerichtete Diensttelefon (OFF-001, ADR-024 Punkt 6, ANN-360).
 *
 * Die Ablage für Praxiskonten ist je Gerät aus. Eingeschaltet wird sie unter
 * „Mein Konto" mit der Bestätigung der Gerätevorgabe (`GERAETEVORGABE`). Die
 * Anwendung kann die Vorgabe nicht prüfen; die Praxis verantwortet sie. Ohne
 * Einrichtung gilt für das Gerät dasselbe wie bisher: Text im Speicher der
 * Seite (ANN-319), sonst nichts.
 *
 * Die Einrichtung liegt in der Dauerablage des Kontos: Sie überlebt das
 * Abmelden, damit die Person sie nicht an jedem Morgen neu bestätigt, und gilt
 * nur für dieses Konto auf diesem Gerät. Ein Schalter, an einer Stelle - die
 * Rücknahme von W1 (c) nach (a) setzt `ABLAGE_FUER_PRAXISKONTEN` auf `false`.
 */

/** ADR-024 W1 (c), Rücknahme `mittel`: der eine Schalter im Ablagemodul. */
export const ABLAGE_FUER_PRAXISKONTEN = true;

/**
 * Die Gerätevorgabe aus ADR-024 Punkt 6, wie sie bei der Einrichtung bestätigt
 * wird. Die Betriebsdokumentation (ADR-012) übernimmt denselben Wortlaut.
 */
export const GERAETEVORGABE = [
  'Das Gerät ist mit Code, Fingerabdruck oder Gesicht gesperrt.',
  'Die Geräteverschlüsselung ist eingeschaltet.',
  'Das Betriebssystem ist aktuell.',
  'Es ist ein Diensttelefon der Praxis, kein privates Gerät.',
  'Niemand sonst nutzt das Gerät mit einem eigenen Gerätekonto.',
] as const;

const FACH = 'diensttelefon';

const einrichtungSchema = z.object({ eingerichtetAm: z.string() });
export type Einrichtung = z.infer<typeof einrichtungSchema>;

const hoerer = new Set<() => void>();
export function einrichtungGeaendert(): void {
  for (const h of hoerer) h();
}

export async function einrichtungLesen(besitzer: string): Promise<Einrichtung | null> {
  if (!ABLAGE_FUER_PRAXISKONTEN) return null;
  const g = einrichtungSchema.safeParse(await dauerfachLesen(besitzer, FACH).catch(() => null));
  return g.success ? g.data : null;
}

export async function einrichten(besitzer: string, jetzt = new Date()): Promise<void> {
  await dauerfachAendern(besitzer, FACH, () => ({ eingerichtetAm: jetzt.toISOString() }));
  einrichtungGeaendert();
}

/**
 * Ausschalten: Die Einrichtung fällt, mit ihr der Tagesplan und die Schlüssel
 * für die Freigabe ohne Netz. Entwürfe fallen dabei nie (§13) - wer
 * ausschalten will, überträgt sie vorher; die Ansicht lässt es sonst nicht zu.
 */
export async function ausschalten(besitzer: string): Promise<void> {
  await dauerfachAendern(besitzer, FACH, () => undefined);
  await fachAendern(besitzer, 'tagesplan', () => undefined);
  await fachAendern(besitzer, 'passkeys', () => undefined);
  einrichtungGeaendert();
}

/** Ist dieses Gerät für dieses Konto eingerichtet? `undefined`, solange gelesen wird. */
export function useEinrichtung(besitzer: string): Einrichtung | null | undefined {
  const [stand, setStand] = useState<Einrichtung | null | undefined>(undefined);
  useEffect(() => {
    let aktiv = true;
    const neu = () =>
      void einrichtungLesen(besitzer).then((e) => {
        if (aktiv) setStand(e);
      });
    neu();
    hoerer.add(neu);
    return () => {
      aktiv = false;
      hoerer.delete(neu);
    };
  }, [besitzer]);
  return stand;
}
