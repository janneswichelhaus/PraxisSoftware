import { useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { ErrorState } from '@/components/ui/Feedback';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Vollseite } from '@/app/Vollseite';
import { kennwortTestzugang } from '@/lib/env';
import { getSupabase } from '@/lib/supabase';
import { ANMELDESAETZE, anmeldesatz } from './anmeldefehler';
import { useFokusNachWechsel } from './fokus';
import { PASSKEY_SAETZE, PasskeyFehler, anmeldenMitPasskey, passkeyMoeglich } from './passkey';
import { usePasskeyVonSelbst } from './passkeyVonSelbst';
import { useSitzungEndeteVonAussen } from './sitzungsende';

/**
 * Der Kennwortweg für Testkonten (ADR-025 Punkt 15).
 *
 * Nur außerhalb der Produktion: Automatisierte Tests und der erste Einstieg in
 * der Test-Umgebung melden sich mit dem Kennwort der synthetischen Testkonten
 * an. In Produktion gibt es ihn nicht, und dort haben Konten auch kein
 * Kennwort (Punkt 9). Fehlermeldungen unterscheiden nicht zwischen „Konto
 * existiert nicht" und „Kennwort falsch" - die Maske ist kein Verzeichnis der
 * Konten (BEF-047).
 */
function KennwortTestzugang() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const fehlerkasten = useRef<HTMLDivElement>(null);
  useFokusNachWechsel(error, () => (error ? fehlerkasten.current : null));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    // Leere Felder gehen nicht erst zum Dienst.
    if (email.trim() === '' || password === '') {
      setError(ANMELDESAETZE.leer);
      return;
    }
    setPending(true);
    try {
      const { error: signInError } = await getSupabase().auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) setError(anmeldesatz(signInError, ANMELDESAETZE.pruefen));
    } catch {
      setError(ANMELDESAETZE.keineVerbindung);
    } finally {
      setPending(false);
    }
  }

  return (
    // Zugeklappt hinter „Testkonten" (Jannes, 2026-10-11): Die Seite zeigt so
    // schon das Bild des Betriebs, in dem es diesen Weg nicht gibt.
    <Disclosure summary="Testkonten">
      <Kleingedrucktes className="mb-4">
        Nur in Entwicklung und Test-Umgebung: Testkonten melden sich mit Kennwort an. Im Betrieb
        gibt es diesen Weg nicht.
      </Kleingedrucktes>
      <form
        onSubmit={(event) => void handleSubmit(event)}
        noValidate
        aria-label="Testzugang"
        className="flex flex-col gap-4"
      >
        {error ? (
          <div ref={fehlerkasten} tabIndex={-1}>
            <ErrorState title={error} />
          </div>
        ) : null}
        <Field
          label="E-Mail-Adresse"
          type="email"
          name="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Field
          label="Kennwort"
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <Button type="submit" variant="secondary" disabled={pending} className="mt-2">
          {pending ? 'Anmeldung läuft …' : 'Anmelden'}
        </Button>
      </form>
    </Disclosure>
  );
}

/**
 * Das Passkey-Fenster öffnet sich von selbst (Jannes 2026-10-11); der Knopf bleibt für den zweiten
 * Versuch. Ein Fehlschlag des ungefragten Starts steht nicht als Fehler da: Niemand hat ihn ausgelöst.
 */
export function LoginPage({
  testzugang = kennwortTestzugang(),
}: {
  /** Für Tests; sonst entscheidet die Umgebung (ANN-326). */
  testzugang?: boolean;
} = {}) {
  const endeVonAussen = useSitzungEndeteVonAussen();
  const passkeyGeht = passkeyMoeglich();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const fehlerkasten = useRef<HTMLDivElement>(null);
  useFokusNachWechsel(error, () => (error ? fehlerkasten.current : null));

  async function mitPasskey(vonSelbst = false) {
    setError(null);
    setPending(true);
    try {
      await anmeldenMitPasskey();
    } catch (fehler) {
      if (!vonSelbst) {
        setError(fehler instanceof PasskeyFehler ? fehler.message : ANMELDESAETZE.keineVerbindung);
      }
    } finally {
      setPending(false);
    }
  }

  usePasskeyVonSelbst(() => mitPasskey(true), passkeyGeht);

  return (
    // Die Anmeldemaske ist die Haustür: die Marke, der Titel, der Knopf. Jeder erklärende Satz
    // fiel weg (Jannes 2026-11-08); das Passkey-Fenster des Geräts sagt den Rest.
    <Vollseite titel="Anmelden">
      <div className="flex flex-col gap-4">
        {/* Kein Grund, kein Name (BEF-047): Was eine Sperre oder ein
            anderes Gerät ausgelöst hat, steht nicht auf einer Seite, die
            jeder am Gerät sieht. */}
        {endeVonAussen ? (
          <Statusmeldung ton="warnung">{ANMELDESAETZE.sitzungBeendet}</Statusmeldung>
        ) : null}

        {error ? (
          <div ref={fehlerkasten} tabIndex={-1}>
            <ErrorState title={error} />
          </div>
        ) : null}

        {passkeyGeht ? (
          <Button disabled={pending} onClick={() => void mitPasskey()}>
            {pending ? 'Wird geprüft …' : 'Mit Passkey anmelden'}
          </Button>
        ) : (
          <Statusmeldung ton="warnung">{PASSKEY_SAETZE.nichtUnterstuetzt}</Statusmeldung>
        )}
      </div>

      {testzugang ? (
        <div className="mt-6">
          <KennwortTestzugang />
        </div>
      ) : null}
    </Vollseite>
  );
}
