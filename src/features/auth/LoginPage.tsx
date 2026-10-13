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
 * Die Köpfe der Aufklapper mittig wie der Rest der Seite (Sichtung
 * 13.10.2026, L8); was aufklappt - das Formular -, steht linksbündig.
 */
const AUFKLAPPER_MITTIG = '[&_summary]:justify-center';

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
    <div className="text-left">
      <Disclosure summary="Testkonten">
        <Kleingedrucktes className="mb-4">
          Nur in Entwicklung und Test-Umgebung: Testkonten melden sich mit Kennwort an. Im Betrieb
          gibt es diesen Weg nicht.
        </Kleingedrucktes>
        <form
          onSubmit={(event) => void handleSubmit(event)}
          noValidate
          aria-label="Testzugang"
          className="flex flex-col gap-4 text-left"
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
    </div>
  );
}

/**
 * Anmeldung per Passkey (SEC-EPIC-002, ADR-025 Fassung 2, Punkte 9 und 10).
 *
 * Es gibt kein Kennwort und kein „Kennwort vergessen": Wer seinen Passkey
 * verloren hat, bekommt von der Praxis eine neue Einladung (Punkt 12). Ein
 * neues Gerät nutzt den Passkey des Telefons - der Browser bietet dafür im
 * Passkey-Fenster einen QR-Code an.
 *
 * Das Passkey-Fenster öffnet sich beim Aufruf von selbst (Jannes,
 * 2026-10-11); der Knopf bleibt für den zweiten Versuch und für Browser, die
 * eine Zeremonie ohne Fingertipp nicht beginnen. Ein Fehlschlag dieses
 * ungefragten Starts steht nicht als Fehler da - die Person hat nichts
 * ausgelöst, und der Knopf sagt, wie es weitergeht.
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
    // Die Anmeldemaske ist die Haustür — hier steht die Marke selbst, nicht
    // ihr Name als Text (`Vollseite`, MARKE-001).
    // Ein Satz zum Lesen statt drei grauer (Sichtung 13.10.2026, L8): Wer
    // den Passkey verloren hat, liest den Weg in Tinte und 16 px; die Hilfe am
    // Rechner steht auf Abruf; wer die Seite nutzen darf, sagt das
    // Kleingedruckte am Fuß. Alles mittig wie Marke und Titel.
    <Vollseite
      mittig
      titel="Anmelden"
      kleingedrucktes="Nur für Mitarbeitende und Patient:innen der Praxis, jede Person mit eigenem Konto."
    >
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

        <p className="text-ink text-base">
          Passkey verloren oder neues Telefon? Die Praxis gibt Ihnen eine neue Einladung.
        </p>
      </div>

      <div className={`mt-6 ${AUFKLAPPER_MITTIG}`}>
        <Disclosure summary="Am Rechner anmelden">
          <p className="text-ink text-base">
            Im Passkey-Fenster „anderes Gerät“ wählen und den Code mit dem Telefon scannen.
          </p>
        </Disclosure>
        {testzugang ? <KennwortTestzugang /> : null}
      </div>
    </Vollseite>
  );
}
