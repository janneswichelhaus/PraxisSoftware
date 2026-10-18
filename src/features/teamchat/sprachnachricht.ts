import {
  aufnahmeMoeglich,
  mikrofonErlaubt,
  waehleFormat,
  type Aufnahmefehler,
} from '@/features/documentation/aufnahme';
import { tontyp } from '@/features/platform/videometadaten';

/**
 * Sprachnachrichten im Teamchat (TEAM-004, ADR-017 Abschnitt N): was das Gerät
 * dafür können muss, wie lang eine sein darf und was die Person liest, wenn
 * die Aufnahme nicht gelingt. Aufgenommen wird mit derselben Aufnahme wie das
 * Diktat (`useAufnahme`): nur auf ausdrücklichen Tipp, sichtbar, bis zum
 * Hochladen nur im Arbeitsspeicher (Punkt 83).
 */

/** Höchstdauer in Sekunden (Punkt 83) - am Server `app.team_voice_max_seconds()`. */
export const SPRACHNACHRICHT_HOECHSTDAUER_S = 120;

/**
 * Kann dieses Gerät hier eine Sprachnachricht aufnehmen? Ein Mikrofon, das die
 * Seite öffnen darf, und ein Format, das der Server nimmt (WebM oder MP4,
 * Punkt 84). Sonst steht „Sprachnachricht aufnehmen“ gar nicht da.
 */
export function sprachnachrichtMoeglich(): boolean {
  if (!aufnahmeMoeglich() || !mikrofonErlaubt()) return false;
  const format = waehleFormat((typ) => MediaRecorder.isTypeSupported(typ));
  return format !== undefined && tontyp(format) !== null;
}

/** Warum keine Sprachnachricht entstand - in einem Satz, der sagt, was zu tun ist. */
export const AUFNAHMEFEHLER: Readonly<Record<Aufnahmefehler, string>> = {
  verweigert: 'Kein Zugriff auf das Mikrofon. Bitte im Browser erlauben – oder schreiben.',
  kein_mikrofon: 'Kein Mikrofon gefunden oder es ist belegt.',
  leer: 'Nichts aufgenommen. Bitte noch einmal.',
  fehler: 'Die Aufnahme ist gescheitert. Bitte noch einmal.',
};

/** Ganze Sekunden für den Server: mindestens 1, höchstens die Grenze (ANN-655). */
export function dauerSekunden(dauerS: number): number {
  if (!Number.isFinite(dauerS)) return 1;
  return Math.min(SPRACHNACHRICHT_HOECHSTDAUER_S, Math.max(1, Math.round(dauerS)));
}
