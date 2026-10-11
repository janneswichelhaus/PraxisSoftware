import { hatPin } from '../appPin';
import { ladePasskeys } from '../passkey';

/**
 * Wie weit die Anmeldung des eigenen Kontos eingerichtet ist (ADR-025
 * Fassung 2, Punkte 10 bis 13): wie viele Passkeys, und ob es eine PIN gibt.
 */
export interface Einrichtungsstand {
  /** Freigegebene Passkeys; nur sie öffnen eine Sitzung (ANN-329). */
  passkeys: number;
  pin: boolean;
}

export const EINRICHTUNG_SCHLUESSEL = ['anmeldung-einrichtung'] as const;

export async function ladeEinrichtungsstand(): Promise<Einrichtungsstand> {
  const [passkeys, pin] = await Promise.all([ladePasskeys(), hatPin()]);
  return { passkeys: passkeys.filter((p) => p.freigegeben).length, pin };
}

/** Fertig eingerichtet: mindestens ein Passkey und eine PIN. */
export function istEingerichtet(stand: Einrichtungsstand): boolean {
  return stand.passkeys > 0 && stand.pin;
}
