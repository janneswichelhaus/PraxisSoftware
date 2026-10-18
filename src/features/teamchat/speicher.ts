import { ordneKanaele, type Kanal } from './api';
import { ausgangLeeren } from './ausgang';
import { entwuerfeLeeren } from './entwuerfe';
import { scrollstaendeLeeren } from './scrollstand';
import { sucheLeeren } from './suche';

/**
 * Alles, was der Teamchat im Arbeitsspeicher hält - Entwürfe, Ausgang,
 * Scrollstände, die letzte Suche, das zuletzt offene Gespräch -, fällt beim
 * Abmelden und beim Kontowechsel (`SessionProvider`, wie der
 * Abfragespeicher). Bis TEAM-001 blieb ein Entwurf stehen und erschien im
 * selben Kanal der nächsten Person (TEAM-002).
 */
export function teamchatLeeren(): void {
  entwuerfeLeeren();
  ausgangLeeren();
  scrollstaendeLeeren();
  sucheLeeren();
  zuletzt = null;
}

let zuletzt: { kontoId: string; kanalId: string } | null = null;

/**
 * Am Rechner öffnet der Teamchat dort, wo man zuletzt war (wie Slack) - nur
 * für dasselbe Konto und nur im Arbeitsspeicher.
 */
export function zuletztOffen(kontoId: string): string | null {
  return zuletzt?.kontoId === kontoId ? zuletzt.kanalId : null;
}

export function merkeOffen(kontoId: string, kanalId: string): void {
  zuletzt = { kontoId, kanalId };
}

/**
 * Das Gespräch, mit dem der Teamchat am Rechner öffnet: das zuletzt offene,
 * sonst das erste der Liste (Favoriten, Kanäle, Direktnachrichten).
 */
export function standardGespraech(kanaele: readonly Kanal[], kontoId: string): Kanal | undefined {
  const { favoriten, kanaele: offene, direkt } = ordneKanaele(kanaele);
  const reihe = [...favoriten, ...offene, ...direkt];
  const zuletzt = zuletztOffen(kontoId);
  return reihe.find((k) => k.id === zuletzt) ?? reihe[0];
}
