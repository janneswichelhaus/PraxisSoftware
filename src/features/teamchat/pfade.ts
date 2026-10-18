import type { Kanal } from './api';

/**
 * Wege im Teamchat (TEAM-001, TEAM-002) - eine Stelle für Liste, Suche, „Für
 * dich“ und Seiten. Das Gespräch der Radflotte steht in der Radflotte, nicht
 * im Teamchat (ANN-613).
 *
 * In einer Adresse stehen nur Kennungen - nie ein Name, ein Suchbegriff oder
 * Text einer Nachricht (ADR-011).
 */
export const TEAMCHAT = '/team';
export const FLOTTE = '/betrieb/flotte/nachrichten';
export const THREADS = '/team/threads';
export const GEMERKT = '/team/gemerkt';
export const ENTWUERFE = '/team/entwuerfe';
export const SUCHE = '/team/suche';
export const NEU = '/team/neu';
export const FUER_DICH = '/fuer-dich';

type Ort = Pick<Kanal, 'id' | 'kind'>;

export function gespraechPfad(kanal: Ort): string {
  return kanal.kind === 'fleet' ? FLOTTE : `${TEAMCHAT}/${kanal.id}`;
}

/** Der Thread einer Ausgangsnachricht; `nachricht` hebt eine Stelle hervor. */
export function threadPfad(kanal: Ort, threadId: string, nachricht?: string): string {
  const pfad = `${gespraechPfad(kanal)}/${threadId}`;
  return nachricht && nachricht !== threadId ? `${pfad}?nachricht=${nachricht}` : pfad;
}

/** Eine Stelle im Gespräch - aus Suche, „Für dich“ und „Für später“. */
export function stellePfad(
  kanal: Ort,
  nachricht: { id: string; parent_id: string | null },
): string {
  return nachricht.parent_id
    ? threadPfad(kanal, nachricht.parent_id, nachricht.id)
    : `${gespraechPfad(kanal)}?nachricht=${nachricht.id}`;
}
