import type { Kanal } from './api';

/**
 * Wege im Teamchat (TEAM-001) - eine Stelle für Liste, Suche und Seiten. Das
 * Gespräch der Radflotte steht in der Radflotte, nicht im Teamchat (ANN-613).
 */
const FLOTTE = '/betrieb/flotte/nachrichten';

type Ort = Pick<Kanal, 'id' | 'kind'>;

export function gespraechPfad(kanal: Ort): string {
  return kanal.kind === 'fleet' ? FLOTTE : `/team/${kanal.id}`;
}

/** Der Thread einer Ausgangsnachricht; `nachricht` hebt eine Stelle hervor. */
export function threadPfad(kanal: Ort, threadId: string, nachricht?: string): string {
  const pfad = `${gespraechPfad(kanal)}/${threadId}`;
  return nachricht && nachricht !== threadId ? `${pfad}?nachricht=${nachricht}` : pfad;
}
