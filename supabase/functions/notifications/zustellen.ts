/**
 * Fällige Benachrichtigungen zustellen (KOM-010, ADR-024 Punkte 14, 16, 17).
 *
 * Die Datenbank entscheidet, was geht (`claim_notification_deliveries`
 * prüft Zugang, Wahl, Schalter, Sinn, Obergrenzen und Ruhezeit); diese Datei
 * baut nur den Inhalt aus dem Katalog und meldet das Ergebnis zurück.
 *
 * - **Mail:** Titel als Betreff, der Katalogtext, ein Link auf die Startseite.
 *   Kein Anmeldelink, keine Kennung, kein Zählpixel, keine Klickverfolgung
 *   (Punkt 14, ANN-331).
 * - **Push:** nur Katalogschlüssel, Zeitpunkt und Zeitzone. Den Text setzt
 *   der Service Worker aus demselben Katalog.
 */

import {
  BENACHRICHTIGUNGEN,
  benachrichtigungstext,
  istBenachrichtigungsart,
  type Benachrichtigungsart,
} from '../../../src/lib/begriffe.ts';
import type { Wege } from './versand.ts';
import type { PushZiel } from './webpush.ts';

export interface Faellig {
  readonly id: string;
  readonly kind: string;
  readonly channel: string;
  readonly subject_at: string | null;
  readonly time_zone: string | null;
  readonly email: string | null;
  readonly push_targets: readonly PushZiel[] | null;
  /** Der Anspruch aus dem Abholen - Melden verlangt ihn zurück (BEF-148). */
  readonly claimed_at: string;
}

export type Ausgang = 'sent' | 'failed' | 'gone';

export interface Auftragsbuch {
  readonly abholen: (anzahl: number) => Promise<Faellig[] | null>;
  readonly melden: (
    auftrag: Pick<Faellig, 'id' | 'claimed_at'>,
    ausgang: Ausgang,
    weg: readonly string[],
  ) => Promise<boolean>;
}

/** Was der Aufrufer erfährt - Kennung, Weg, Ergebnis; nie Adresse, Endpunkt oder Text. */
export interface Protokollzeile {
  readonly auftrag: string;
  readonly weg: string;
  readonly ergebnis: Ausgang;
}

export function mailtext(
  art: Benachrichtigungsart,
  zeitpunkt: string | null,
  zeitzone: string,
  appUrl: string,
): { betreff: string; text: string } {
  const { titel, text } = benachrichtigungstext(art, zeitpunkt, zeitzone);
  const start = `${appUrl.trim().replace(/\/+$/, '')}/`;
  return {
    betreff: titel,
    text: [
      'Guten Tag,',
      '',
      text,
      '',
      'Mehr sehen Sie nach der Anmeldung in Ihrer Übersicht:',
      start,
      '',
      'Diese Mitteilungen schalten Sie unter „Ich“ → „Einstellungen“ ab.',
    ].join('\n'),
  };
}

export function pushinhalt(art: Benachrichtigungsart, zeitpunkt: string | null, zeitzone: string) {
  const inhalt = BENACHRICHTIGUNGEN[art].zeitangabe
    ? { k: art, t: zeitpunkt, z: zeitzone }
    : { k: art };
  return new TextEncoder().encode(JSON.stringify(inhalt));
}

const RUNDEN = 5;
const MELDEVERSUCHE = 3;
const JE_RUNDE = 50;

export async function zustellen(
  buch: Auftragsbuch,
  wege: Wege,
  appUrl: string,
): Promise<Protokollzeile[] | null> {
  const protokoll: Protokollzeile[] = [];
  for (let runde = 0; runde < RUNDEN; runde += 1) {
    const faellig = await buch.abholen(JE_RUNDE);
    if (faellig === null) return protokoll.length === 0 ? null : protokoll;
    for (const auftrag of faellig) {
      const { ausgang, weg } = await stelleZu(auftrag, wege, appUrl);
      // Mit dem Anspruch: Hat ein zweiter Lauf den Auftrag inzwischen
      // abgeholt, überschreibt dieses Melden nichts (BEF-148). Scheitert nur
      // das Melden, noch zweimal - sonst holte der nächste Lauf den schon
      // gesendeten Auftrag nach 15 Minuten erneut ab.
      for (let versuch = 0; versuch < MELDEVERSUCHE; versuch += 1) {
        if (await buch.melden(auftrag, ausgang, weg)) break;
      }
      protokoll.push({ auftrag: auftrag.id, weg: auftrag.channel, ergebnis: ausgang });
    }
    if (faellig.length < JE_RUNDE) break;
  }
  return protokoll;
}

async function stelleZu(
  auftrag: Faellig,
  wege: Wege,
  appUrl: string,
): Promise<{ ausgang: Ausgang; weg: string[] }> {
  if (!istBenachrichtigungsart(auftrag.kind)) return { ausgang: 'failed', weg: [] };
  const zone = auftrag.time_zone ?? 'Europe/Berlin';

  if (auftrag.channel === 'email') {
    if (wege.mail === null || auftrag.email === null) return { ausgang: 'failed', weg: [] };
    const { betreff, text } = mailtext(auftrag.kind, auftrag.subject_at, zone, appUrl);
    return { ausgang: await wege.mail.sende({ an: auftrag.email, betreff, text }), weg: [] };
  }

  if (auftrag.channel === 'push') {
    const ziele = auftrag.push_targets ?? [];
    if (wege.push === null || ziele.length === 0) return { ausgang: 'failed', weg: [] };
    const inhalt = pushinhalt(auftrag.kind, auftrag.subject_at, zone);
    const weg: string[] = [];
    let gesendet = false;
    for (const ziel of ziele) {
      const ergebnis = await wege.push.sende(ziel, inhalt);
      if (ergebnis === 'gone') weg.push(ziel.endpoint);
      if (ergebnis === 'sent') gesendet = true;
    }
    if (gesendet) return { ausgang: 'sent', weg };
    return { ausgang: weg.length === ziele.length ? 'gone' : 'failed', weg };
  }

  return { ausgang: 'failed', weg: [] };
}
