/**
 * Woher die Kartenkomponente ihre Anzeigekonfiguration bekommt.
 *
 * Diese Datei ist die Nahtstelle zwischen Anwendung und Anbieter: Fachcode
 * fragt hier nach einer `MapDisplayConfig` und erfährt nie, wer die Kacheln
 * liefert (ADR-019 Punkt 1). Ein Anbieterwechsel tauscht den Import unten und
 * berührt keine Oberfläche.
 */

import { readMapTileApiKey } from '@/lib/env';
import type { MapDisplayConfig } from './contract';
import { createPtvMapDisplayConfig } from './ptv-display';

/**
 * Die Anzeigekonfiguration - oder `null`, wenn kein Kachelschlüssel
 * konfiguriert ist.
 *
 * `null` ist kein Fehlerfall: Das kostenlose Abo und der Schlüssel liegen bei
 * Jannes und nie im Repository (ADR-019 Punkt 24). Ohne Schlüssel zeigt die
 * Karte einen Hinweis, und es geht **keine** Anfrage an den Anbieter.
 */
export function createMapDisplayConfig(
  apiKey: string | null = readMapTileApiKey(),
): MapDisplayConfig | null {
  return apiKey === null ? null : createPtvMapDisplayConfig(apiKey);
}
