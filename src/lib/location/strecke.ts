/**
 * Strecke und Fahrzeit für die Anzeige (MAP-003b).
 *
 * Beides kommt vom Kartendienst metergenau und sekundengenau zurück — und
 * beides wird hier gerundet, bevor es jemand liest. Eine Fahrzeit auf die
 * Sekunde genau behauptet eine Sicherheit, die keine Route hat: Sie hängt an
 * Ampeln, Wetter und Beladung. Gerundet wird deshalb auf hundert Meter und
 * auf Minuten, und unter einer Minute steht „unter 1 Minute" statt „0 min".
 *
 * Deutsche Schreibweise mit Komma; die Zahlen stehen in der Oberfläche in
 * `tabular-nums`, damit Zeilen untereinander vergleichbar bleiben.
 */

/** Strecke in Metern als Text: unter einem Kilometer in Metern, darüber in Kilometern. */
export function formatiereStrecke(meter: number): string {
  if (!Number.isFinite(meter) || meter < 0) return '—';
  if (meter < 1000) return `${Math.round(meter / 10) * 10} m`;
  // Erst auf hundert Meter runden, dann schreiben: `toFixed(1)` rundet auf
  // der Grenze nach der Binärdarstellung, und 3150 Meter ergäben damit
  // 3,1 km statt 3,2 km.
  return `${(Math.round(meter / 100) / 10).toFixed(1).replace('.', ',')} km`;
}

/** Fahrzeit in Sekunden als Text: Minuten, ab einer Stunde Stunden und Minuten. */
export function formatiereFahrzeit(sekunden: number): string {
  if (!Number.isFinite(sekunden) || sekunden < 0) return '—';

  const minuten = Math.round(sekunden / 60);
  if (minuten === 0) return 'unter 1 Min.';
  if (minuten < 60) return `${minuten} Min.`;

  const stunden = Math.floor(minuten / 60);
  const rest = minuten % 60;
  return rest === 0 ? `${stunden} Std.` : `${stunden} Std. ${rest} Min.`;
}
