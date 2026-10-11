/**
 * Format und Bitrate der Videoaufnahme (KOM-007, ADR-017 Punkte 62 und 63,
 * ANN-336).
 */

/** ANN-336: Videobitrate - 30 Sekunden bleiben deutlich unter 10 MB. */
export const VIDEO_BITRATE = 2_000_000;

/** Was der Browser kann, in der Reihenfolge der Wahl. Server und Bucket kennen nur diese. */
const FORMATE = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];

export function videoformat(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  return FORMATE.find((f) => MediaRecorder.isTypeSupported(f)) ?? null;
}
