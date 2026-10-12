/**
 * Push auf diesem Gerät (KOM-011, ADR-024 Punkte 15, 17, 18).
 *
 * Erlaubt wird nur nach der ausdrücklichen Abfrage des Browsers, je Gerät.
 * Der Browser wählt den Push-Dienst seines Herstellers, nicht die Praxis
 * (Punkt 18). Ohne öffentlichen VAPID-Schlüssel, ohne Service Worker (etwa
 * in `pnpm dev`) oder ohne Push im Browser bietet die Anwendung Push nicht an
 * - unter iOS gibt es Push nur für eine Anwendung auf dem Startbildschirm mit
 * `display: standalone`, und die Anwendung nutzt `minimal-ui` (ANN-110).
 */

export type PushStand =
  | { readonly moeglich: true }
  | { readonly moeglich: false; readonly grund: 'nicht_eingerichtet' | 'browser' | 'abgelehnt' };

export interface PushRegistrierung {
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
}

const SCHLUESSEL = (import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '').trim();

export function pushStand(oeffentlich: string = SCHLUESSEL): PushStand {
  if (!/^[A-Za-z0-9_-]{87}$/.test(oeffentlich)) {
    return { moeglich: false, grund: 'nicht_eingerichtet' };
  }
  if (
    typeof navigator === 'undefined' ||
    !('serviceWorker' in navigator) ||
    typeof window === 'undefined' ||
    !('PushManager' in window) ||
    !('Notification' in window)
  ) {
    return { moeglich: false, grund: 'browser' };
  }
  if (Notification.permission === 'denied') return { moeglich: false, grund: 'abgelehnt' };
  return { moeglich: true };
}

async function registrierung(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

/** Der Endpunkt dieses Geräts, wenn es schon registriert ist. */
export async function eigenerEndpunkt(): Promise<string | null> {
  try {
    const reg = await registrierung();
    const abo = await reg?.pushManager.getSubscription();
    return abo?.endpoint ?? null;
  } catch {
    return null;
  }
}

function ausBase64url(text: string): Uint8Array<ArrayBuffer> {
  const normal = text.replace(/-/g, '+').replace(/_/g, '/');
  const binaer = atob(normal + '='.repeat((4 - (normal.length % 4)) % 4));
  return Uint8Array.from(binaer, (z) => z.charCodeAt(0));
}

/**
 * Fragt den Browser und registriert dieses Gerät beim Push-Dienst. Wirft mit
 * einem Satz für die Person, wenn es nicht geht.
 */
export async function pushErlauben(oeffentlich: string = SCHLUESSEL): Promise<PushRegistrierung> {
  const stand = pushStand(oeffentlich);
  if (!stand.moeglich) throw new Error('Mitteilungen sind auf diesem Gerät nicht möglich.');
  const erlaubnis = await Notification.requestPermission();
  if (erlaubnis !== 'granted') {
    throw new Error('Sie haben Mitteilungen auf diesem Gerät nicht erlaubt.');
  }
  const reg = await registrierung();
  if (!reg) throw new Error('Mitteilungen sind auf diesem Gerät nicht möglich.');
  const abo = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: ausBase64url(oeffentlich),
  });
  const json = abo.toJSON();
  const p256dh = json.keys?.['p256dh'];
  const auth = json.keys?.['auth'];
  if (!json.endpoint || !p256dh || !auth) {
    await abo.unsubscribe().catch(() => undefined);
    throw new Error('Mitteilungen sind auf diesem Gerät nicht möglich.');
  }
  return { endpoint: json.endpoint, p256dh, auth };
}

/** Meldet dieses Gerät beim Push-Dienst ab; den Endpunkt gibt es danach nicht mehr. */
export async function pushAbmelden(): Promise<void> {
  try {
    const reg = await registrierung();
    const abo = await reg?.pushManager.getSubscription();
    await abo?.unsubscribe();
  } catch {
    // Nichts zu tun: Der Server löscht den Endpunkt spätestens, wenn der
    // Push-Dienst ihn abweist (Punkt 16).
  }
}

/**
 * Vor dem Abmelden auf diesem Gerät: die Registrierung beim Server löschen
 * und beim Push-Dienst abmelden (Punkt 17). Ohne registriertes Gerät - jedes
 * Praxiskonto - kostet das nur eine Nachfrage beim Browser. Scheitert der
 * Server, meldet das Gerät trotzdem ab; die Abmeldung selbst hält das nie auf.
 */
export async function geraetBeimAbmeldenLoesen(
  entfernen: (endpunkt: string) => Promise<unknown>,
): Promise<void> {
  const endpunkt = await eigenerEndpunkt();
  if (endpunkt === null) return;
  await entfernen(endpunkt).catch(() => undefined);
  await pushAbmelden();
}
