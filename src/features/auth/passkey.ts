import { getSupabase } from '@/lib/supabase';
import { ANMELDESAETZE, anmeldesatz } from './anmeldefehler';
import { offlineschluesselAus, type Offlineschluessel } from './freigabeOhneNetz';

/**
 * Der Passkey (SEC-EPIC-002, ADR-025 Fassung 2, Punkt 10).
 *
 * Alles, was die Anwendung mit Passkeys tut, geht durch dieses Modul: Der
 * Anmeldedienst bietet sie als Beta an, und die Schnittstelle des SDK kann
 * sich ändern (ADR-025, Konsequenzen). Ändert sie sich, wird hier angepasst
 * und nirgends sonst.
 *
 * Die WebAuthn-Zeremonie selbst führt das SDK (`signInWithPasskey`,
 * `registerPasskey`); hier wird nichts an Schlüsseln oder Signaturen gebaut
 * (§3.4). Biometrische Merkmale verlassen das Gerät nicht, der Anmeldedienst
 * speichert nur den öffentlichen Schlüssel.
 */

/** Ein Fehlschlag mit einem Satz, der der Person sagt, was zu tun ist. */
export class PasskeyFehler extends Error {
  /** Die Person hat abgebrochen oder nicht bestätigt. */
  readonly abgebrochen: boolean;

  constructor(satz: string, abgebrochen = false) {
    super(satz);
    this.name = 'PasskeyFehler';
    this.abgebrochen = abgebrochen;
  }
}

export const PASSKEY_SAETZE = {
  nichtUnterstuetzt:
    'Dieses Gerät oder dieser Browser unterstützt keine Passkeys. Bitte ein aktuelles Telefon oder einen aktuellen Browser verwenden.',
  abgebrochen: 'Nicht bestätigt. Bitte erneut versuchen.',
  nichtAngenommen:
    'Der Passkey wurde nicht angenommen. Ist er für dieses Konto auf diesem Gerät eingerichtet?',
  ausgeschaltet: 'Passkeys sind beim Anmeldedienst noch nicht eingeschaltet.',
  schonEingerichtet: 'Auf diesem Gerät ist für dieses Konto schon ein Passkey eingerichtet.',
  zweiterFaktor: 'Bitte zuerst den zweiten Faktor bestätigen, dann den Passkey einrichten.',
  hoechstzahl: 'Für dieses Konto sind schon so viele Passkeys eingerichtet, wie möglich sind.',
  geraet: 'Der Passkey ließ sich auf diesem Gerät nicht verwenden. Bitte erneut versuchen.',
  nichtFreigegeben:
    'Der Passkey ist angelegt, aber nicht freigegeben und öffnet deshalb nichts. Bitte in „Mein Konto“ entfernen und neu einrichten.',
} as const;

/** Kann dieser Browser überhaupt Passkeys? Ohne WebAuthn bietet die Seite sie nicht an. */
export function passkeyMoeglich(): boolean {
  return typeof window !== 'undefined' && typeof window.PublicKeyCredential === 'function';
}

interface Fehlerform {
  name?: string | undefined;
  status?: number | undefined;
  code?: string | undefined;
}

/** Ein Fehler aus Zeremonie oder Anmeldedienst als Satz; verrät nichts über fremde Konten. */
function alsPasskeyFehler(fehler: Fehlerform): PasskeyFehler {
  const code = fehler.code ?? '';
  // Fehler der Zeremonie am Gerät tragen einen Code `ERROR_…` (SDK 2.112).
  if (code.startsWith('ERROR_')) {
    if (code === 'ERROR_CEREMONY_ABORTED' || fehler.name === 'NotAllowedError') {
      return new PasskeyFehler(PASSKEY_SAETZE.abgebrochen, true);
    }
    if (code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') {
      return new PasskeyFehler(PASSKEY_SAETZE.schonEingerichtet);
    }
    return new PasskeyFehler(PASSKEY_SAETZE.geraet);
  }
  if (code === 'passkey_disabled') return new PasskeyFehler(PASSKEY_SAETZE.ausgeschaltet);
  if (code === 'insufficient_aal') return new PasskeyFehler(PASSKEY_SAETZE.zweiterFaktor);
  if (code === 'too_many_passkeys') return new PasskeyFehler(PASSKEY_SAETZE.hoechstzahl);
  return new PasskeyFehler(anmeldesatz(fehler, PASSKEY_SAETZE.nichtAngenommen));
}

type Zeremonie = CredentialsContainer['get'];

/**
 * Die Prüfung der Person am Gerät wird verlangt, nicht nur gewünscht
 * (ADR-025 Punkt 10).
 *
 * Der Anmeldedienst schickt `userVerification: 'preferred'`, und das SDK
 * reicht die Optionen unverändert an den Browser. Für die Dauer der einen
 * Zeremonie setzt diese Hülle `required` ein: Ein Gerät, das Gesicht, Finger
 * oder Geräte-PIN nicht prüfen kann, wird dann abgelehnt, statt still nur
 * den Besitz zu zeigen. Durchsetzen kann es der Server heute nicht - das ist
 * die Restlücke für OPS-001.
 */
async function mitPruefungAmGeraet<T>(
  ablauf: () => Promise<T>,
  /** TRK-009: Wer den angelegten Passkey sehen will (öffentlicher Schlüssel). */
  beimAnlegen?: (angelegt: Credential | null) => void,
): Promise<T> {
  const container = typeof navigator === 'undefined' ? undefined : navigator.credentials;
  if (!container) return ablauf();
  const holen = container.get.bind(container);
  const anlegen = container.create.bind(container);
  const eigen = container as CredentialsContainer & { get: Zeremonie; create: Zeremonie };
  eigen.get = (optionen) =>
    holen(
      optionen?.publicKey
        ? { ...optionen, publicKey: { ...optionen.publicKey, userVerification: 'required' } }
        : optionen,
    );
  eigen.create = async (optionen?: CredentialCreationOptions) => {
    const angelegt = await anlegen(
      optionen?.publicKey
        ? {
            ...optionen,
            publicKey: {
              ...optionen.publicKey,
              authenticatorSelection: {
                ...optionen.publicKey.authenticatorSelection,
                userVerification: 'required',
              },
            },
          }
        : optionen,
    );
    beimAnlegen?.(angelegt);
    return angelegt;
  };
  try {
    return await ablauf();
  } finally {
    // Die eigenen Eigenschaften fallen weg; es gilt wieder die des Browsers.
    delete (eigen as Partial<typeof eigen>).get;
    delete (eigen as Partial<typeof eigen>).create;
  }
}

/** Anmelden oder freigeben mit einem Passkey dieses Geräts. Wirft `PasskeyFehler`. */
export async function anmeldenMitPasskey(): Promise<void> {
  if (!passkeyMoeglich()) throw new PasskeyFehler(PASSKEY_SAETZE.nichtUnterstuetzt);
  let ergebnis: Awaited<ReturnType<ReturnType<typeof getSupabase>['auth']['signInWithPasskey']>>;
  try {
    ergebnis = await mitPruefungAmGeraet(() => getSupabase().auth.signInWithPasskey());
  } catch {
    throw new PasskeyFehler(ANMELDESAETZE.keineVerbindung);
  }
  if (ergebnis.error) throw alsPasskeyFehler(ergebnis.error);
}

/**
 * Einen Passkey für das angemeldete Konto auf diesem Gerät einrichten und
 * sofort freigeben (ANN-329): Erst ein freigegebener Passkey öffnet eine
 * Sitzung, und freigeben lässt er sich nur in offener Sitzung kurz nach dem
 * Anlegen. So öffnet ein Passkey, den jemand mit einem gesperrten Token beim
 * Anmeldedienst anlegt, nichts. Wirft `PasskeyFehler`.
 */
export async function passkeyEinrichten(): Promise<void> {
  if (!passkeyMoeglich()) throw new PasskeyFehler(PASSKEY_SAETZE.nichtUnterstuetzt);
  let ergebnis: Awaited<ReturnType<ReturnType<typeof getSupabase>['auth']['registerPasskey']>>;
  // TRK-009 (ANN-359): Den öffentlichen Schlüssel nennt nur der Browser, beim Anlegen.
  let schluessel: Offlineschluessel | null = null;
  try {
    ergebnis = await mitPruefungAmGeraet(
      () => getSupabase().auth.registerPasskey(),
      (angelegt) => {
        schluessel = offlineschluesselAus(angelegt);
      },
    );
  } catch {
    throw new PasskeyFehler(ANMELDESAETZE.keineVerbindung);
  }
  if (ergebnis.error) throw alsPasskeyFehler(ergebnis.error);
  await gibPasskeyFrei(ergebnis.data.id, schluessel);
}

/**
 * Freigabe in der Datenbank, wahlweise mit dem Schlüssel für die Freigabe
 * ohne Netz; ein Funkloch bekommt einen zweiten Versuch.
 */
async function gibPasskeyFrei(id: string, schluessel: Offlineschluessel | null): Promise<void> {
  for (let versuch = 0; versuch < 2; versuch += 1) {
    try {
      const { error } = await getSupabase().rpc('approve_own_passkey', {
        p_credential_id: id,
        ...(schluessel
          ? {
              p_webauthn_id: schluessel.webauthn_id,
              p_public_key: schluessel.public_key,
              p_public_key_alg: schluessel.public_key_alg,
            }
          : {}),
      });
      if (!error) return;
      break;
    } catch {
      // erneut
    }
  }
  throw new PasskeyFehler(PASSKEY_SAETZE.nichtFreigegeben);
}

export interface Passkey {
  id: string;
  name: string | null;
  angelegtAm: string;
  zuletztAm: string | null;
  /** Nur ein freigegebener Passkey öffnet eine Sitzung (ANN-329). */
  freigegeben: boolean;
}

/** Die Passkeys des eigenen Kontos. Wirft `PasskeyFehler`. */
export async function ladePasskeys(): Promise<Passkey[]> {
  let ergebnis: Awaited<ReturnType<ReturnType<typeof getSupabase>['auth']['passkey']['list']>>;
  try {
    ergebnis = await getSupabase().auth.passkey.list();
  } catch {
    throw new PasskeyFehler(ANMELDESAETZE.keineVerbindung);
  }
  if (ergebnis.error) throw alsPasskeyFehler(ergebnis.error);
  const freigaben = (await getSupabase().rpc('own_passkey_approvals')) as {
    data: unknown;
    error: unknown;
  };
  if (freigaben.error || !Array.isArray(freigaben.data)) {
    throw new PasskeyFehler(ANMELDESAETZE.keineVerbindung);
  }
  const frei = new Set(freigaben.data.filter((id): id is string => typeof id === 'string'));
  return ergebnis.data.map((p) => ({
    id: p.id,
    name: p.friendly_name ?? null,
    angelegtAm: p.created_at,
    zuletztAm: p.last_used_at ?? null,
    freigegeben: frei.has(p.id),
  }));
}

/** Einen Passkey des eigenen Kontos entfernen. Wirft `PasskeyFehler`. */
export async function entfernePasskey(id: string): Promise<void> {
  let ergebnis: Awaited<ReturnType<ReturnType<typeof getSupabase>['auth']['passkey']['delete']>>;
  try {
    ergebnis = await getSupabase().auth.passkey.delete({ passkeyId: id });
  } catch {
    throw new PasskeyFehler(ANMELDESAETZE.keineVerbindung);
  }
  if (ergebnis.error) throw alsPasskeyFehler(ergebnis.error);
}
