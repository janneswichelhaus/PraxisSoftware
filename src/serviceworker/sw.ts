/**
 * Der Service Worker (KOM-011, ADR-024 Abschnitt A; W5: eine eigene Datei,
 * keine Abhängigkeit). Genau zwei Aufgaben:
 *
 * 1. **Das Anwendungsgerüst vorhalten** - die Liste setzt der Build ein
 *    (`__GERUEST__`), die Regel steht in `geruest.ts`.
 * 2. **Push empfangen und eine Mitteilung zeigen** - Text aus dem Katalog
 *    (`mitteilung.ts`), Klick öffnet die Startseite.
 *
 * Eine neue Fassung übernimmt nie mitten in der Arbeit (Punkt 2): kein
 * `skipWaiting`, kein `clients.claim`. Sie gilt ab dem nächsten Start, und
 * beim Übernehmen fallen die alten Gerüste.
 *
 * Gebaut als eigenes Skript ohne Module (`scripts/vite-serviceworker.ts`);
 * deshalb die wenigen Typen des Worker-Bereichs hier statt `lib: WebWorker`,
 * das sich mit `DOM` im Projekt der Anwendung nicht verträgt.
 */

import { antwortweg, EINSTIEG, GERUEST_PRAEFIX } from './geruest';
import { mitteilungAusPush } from './mitteilung';

interface WartendesEreignis extends Event {
  waitUntil(versprechen: Promise<unknown>): void;
}
interface Abruf extends WartendesEreignis {
  readonly request: Request;
  respondWith(antwort: Promise<Response>): void;
}
interface PushEreignis extends WartendesEreignis {
  readonly data: { json(): unknown } | null;
}
interface Klick extends WartendesEreignis {
  readonly notification: { close(): void };
}
interface Fenster {
  readonly url: string;
  focus(): Promise<unknown>;
}
interface Bereich {
  readonly location: { readonly origin: string };
  readonly registration: {
    showNotification(titel: string, optionen: Record<string, unknown>): Promise<void>;
  };
  readonly clients: {
    matchAll(optionen: { type: 'window' }): Promise<readonly Fenster[]>;
    openWindow(url: string): Promise<unknown>;
  };
  addEventListener(art: 'install' | 'activate', f: (e: WartendesEreignis) => void): void;
  addEventListener(art: 'fetch', f: (e: Abruf) => void): void;
  addEventListener(art: 'push', f: (e: PushEreignis) => void): void;
  addEventListener(art: 'notificationclick', f: (e: Klick) => void): void;
}

declare const self: Bereich;
declare const __GERUEST__: readonly string[];
declare const __GERUEST_FASSUNG__: string;

const LISTE = new Set(__GERUEST__);
const SPEICHER = `${GERUEST_PRAEFIX}${__GERUEST_FASSUNG__}`;

self.addEventListener('install', (ereignis) => {
  ereignis.waitUntil(caches.open(SPEICHER).then((speicher) => speicher.addAll([...LISTE])));
});

self.addEventListener('activate', (ereignis) => {
  ereignis.waitUntil(
    caches
      .keys()
      .then((namen) =>
        Promise.all(
          namen
            .filter((name) => name.startsWith(GERUEST_PRAEFIX) && name !== SPEICHER)
            .map((name) => caches.delete(name)),
        ),
      ),
  );
});

self.addEventListener('fetch', (ereignis) => {
  const anfrage = ereignis.request;
  const weg = antwortweg(anfrage, self.location.origin, LISTE);
  if (weg === null) return;
  if (weg.art === 'speicher') {
    ereignis.respondWith(
      caches.match(weg.pfad, { cacheName: SPEICHER }).then((treffer) => treffer ?? fetch(anfrage)),
    );
    return;
  }
  ereignis.respondWith(
    fetch(anfrage).catch(() =>
      caches
        .match(EINSTIEG, { cacheName: SPEICHER })
        .then((treffer) => treffer ?? Response.error()),
    ),
  );
});

self.addEventListener('push', (ereignis) => {
  let daten: unknown = null;
  try {
    daten = ereignis.data?.json() ?? null;
  } catch {
    daten = null;
  }
  const mitteilung = mitteilungAusPush(daten);
  if (mitteilung === null) return;
  ereignis.waitUntil(
    self.registration.showNotification(mitteilung.titel, {
      body: mitteilung.text,
      tag: mitteilung.tag,
      icon: '/marke/own-motion-app-1024.png',
      badge: '/marke/own-motion-monogramm-48.png',
      lang: 'de',
    }),
  );
});

self.addEventListener('notificationclick', (ereignis) => {
  ereignis.notification.close();
  ereignis.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((fenster) => {
      const offen = fenster.find((f) => new URL(f.url).origin === self.location.origin);
      return offen ? offen.focus() : self.clients.openWindow('/');
    }),
  );
});
