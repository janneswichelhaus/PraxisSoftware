import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Vollseite } from '@/app/Vollseite';
import { EINLADUNG_TITEL } from '@/app/tabtitel';
import { kennwortTestzugang } from '@/lib/env';
import { getSupabase } from '@/lib/supabase';
import { hatPin } from '@/features/auth/appPin';
import { AnmeldungEinrichten } from '@/features/auth/einrichtung/AnmeldungEinrichten';
import { useFokusNachWechsel } from '@/features/auth/fokus';
import { meldeSelbstAb } from '@/features/auth/eigeneAbmeldung';
import { hinweisAngemeldet } from '@/features/auth/fremdeSitzung';
import { loeseLinkEin } from '@/features/auth/linkEinloesen';
import { PasskeyFehler, anmeldenMitPasskey } from '@/features/auth/passkey';
import { useSession } from '@/features/auth/sessionContext';
import { EinloeseError, codeAusFragment, loeseEinladungEin } from './einladung';

/**
 * Eine Einladung zur Plattform einlösen (POR-003; ADR-023 Fassung 4, Punkte 7
 * und 8; ADR-025 Fassung 2, Punkt 13).
 *
 * Die Person kommt über den QR-Code auf ihrem eigenen Telefon hierher oder
 * über den Link aus der Mail. **Es gibt kein Kennwort.** Sie gibt ihre
 * Adresse an; der Zugangsdienst legt das Konto an und meldet sie einmalig an.
 * Danach richtet sie hier einen Passkey auf diesem Gerät und eine PIN ein.
 * Wer schon ein Konto hat, meldet sich zuerst mit dem Passkey an und löst den
 * Code dann für dieses Konto ein - ein bestehendes Konto wird nie über seine
 * Adresse übernommen.
 *
 * **Der Code verlässt die Adresszeile sofort.** Er wird beim Öffnen gelesen
 * und aus dem Verlaufseintrag genommen; danach steht er nur noch im Speicher
 * dieser Seite. Für unbekannte, abgelaufene und benutzte Codes gibt es
 * dieselbe Auskunft (Punkt 8, §13).
 */
type Zustand =
  | 'angemeldet'
  | 'formular'
  | 'vorhanden'
  | 'ungueltig'
  | 'anmelden'
  | 'einrichten'
  | 'nicht-angemeldet';

const FELD_EMAIL = 'einladung-email';

export function EinladungPage() {
  const navigate = useNavigate();
  const { session } = useSession();
  const [code] = useState(() => codeAusFragment(window.location.hash));

  // Der Code verlässt die Adresszeile und den Verlaufseintrag, sobald er
  // gelesen ist. Als Effekt und nicht beim Lesen: Unter `StrictMode` liest
  // React den Anfangswert zweimal, und der zweite Lauf fände sonst nichts mehr.
  useEffect(() => {
    if (window.location.hash !== '') {
      window.history.replaceState(window.history.state, '', window.location.pathname);
    }
  }, []);
  const [zustand, setZustand] = useState<Zustand>(() => {
    if (code === null) return 'ungueltig';
    return session !== null ? 'angemeldet' : 'formular';
  });
  const [email, setEmail] = useState('');
  const [emailFehler, setEmailFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [pinDa, setPinDa] = useState(false);
  const auskunft = useRef<HTMLDivElement>(null);

  useFokusNachWechsel(zustand, () =>
    zustand === 'formular' ? document.getElementById(FELD_EMAIL) : auskunft.current,
  );

  /** Die Fehler des Einlösens als Zustand oder Satz - ohne Auskunft über fremde Konten. */
  function fehlschlag(fehler: unknown) {
    const art = fehler instanceof EinloeseError ? fehler.art : 'unavailable';
    if (art === 'invitation_invalid') {
      setZustand('ungueltig');
    } else if (art === 'email_taken') {
      setZustand('vorhanden');
    } else if (art === 'account_conflict') {
      setMeldung(
        'Mit diesem Konto lässt sich der Zugang nicht einrichten. Bitte melden Sie sich ab und nehmen Sie eine andere Adresse.',
      );
    } else if (art === 'sign_in_not_created') {
      setZustand('nicht-angemeldet');
    } else if (art === 'session_invalid') {
      setMeldung(
        'Die Anwendung ist auf diesem Gerät gesperrt. Bitte zuerst dort entsperren – oder abmelden und ein neues Konto einrichten.',
      );
    } else {
      setMeldung(
        'Der Zugang lässt sich gerade nicht einrichten. Ihr Code ist deswegen nicht verbraucht – bitte später erneut versuchen.',
      );
    }
  }

  /** Mit der Einmal-Anmeldung anmelden, dann Passkey und PIN einrichten. */
  async function anmeldenUndEinrichten(tokenHash: string) {
    setZustand('anmelden');
    try {
      await loeseLinkEin(tokenHash, 'magiclink');
    } catch {
      setZustand('nicht-angemeldet');
      return;
    }
    try {
      setPinDa(await hatPin());
    } catch {
      setPinDa(false);
    }
    setZustand('einrichten');
  }

  async function absenden(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (laeuft || code === null) return;
    setMeldung(null);
    setEmailFehler(null);
    const adresse = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adresse)) {
      setEmailFehler('Bitte eine E-Mail-Adresse eingeben, etwa name@beispiel.de.');
      document.getElementById(FELD_EMAIL)?.focus();
      return;
    }
    setLaeuft(true);
    try {
      const ergebnis = await loeseEinladungEin(code, adresse);
      if (ergebnis.tokenHash === null) {
        void navigate('/', { replace: true });
        return;
      }
      await anmeldenUndEinrichten(ergebnis.tokenHash);
    } catch (fehler) {
      fehlschlag(fehler);
    } finally {
      setLaeuft(false);
    }
  }

  /** Für das angemeldete Konto einlösen - die Sitzung steht im Kopf des Aufrufs. */
  async function mitSitzungEinloesen() {
    if (code === null) return;
    setMeldung(null);
    setLaeuft(true);
    try {
      await loeseEinladungEin(code, '');
      void navigate('/', { replace: true });
    } catch (fehler) {
      fehlschlag(fehler);
    } finally {
      setLaeuft(false);
    }
  }

  async function mitPasskeyAnmeldenUndEinloesen() {
    setMeldung(null);
    setLaeuft(true);
    try {
      await anmeldenMitPasskey();
    } catch (fehler) {
      setLaeuft(false);
      setMeldung(fehler instanceof PasskeyFehler ? fehler.message : 'Die Anmeldung gelang nicht.');
      return;
    }
    await mitSitzungEinloesen();
  }

  if (zustand === 'einrichten') {
    return (
      <AnmeldungEinrichten
        // Ein Passkey entsteht auf diesem Gerät, auch wenn das Konto schon
        // einen hat (verlorenes Telefon, Punkt 12).
        stand={{ passkeys: 0, pin: pinDa }}
        onFertig={() => void navigate('/', { replace: true })}
        onAbmelden={() =>
          void meldeSelbstAb(() => getSupabase().auth.signOut({ scope: 'local' })).then(() =>
            navigate('/', { replace: true }),
          )
        }
        onSpaeter={kennwortTestzugang() ? () => void navigate('/', { replace: true }) : undefined}
        // DR-105: Auf der Plattform heißt der Ort nicht „Mein Konto“.
        weitererPasskey="unter „Ich → Einstellungen → Passkey und PIN“"
      />
    );
  }

  return (
    <Vollseite
      titel="Ihr Zugang"
      tabtitel={EINLADUNG_TITEL}
      kleingedrucktes="Der Zugang gehört nur Ihnen. Angehörige bekommen auf Wunsch einen eigenen Zugang von der Praxis."
    >
      {meldung ? (
        <div className="mb-4">
          <Statusmeldung ton="fehler">{meldung}</Statusmeldung>
        </div>
      ) : null}

      {zustand === 'angemeldet' ? (
        <div ref={auskunft} tabIndex={-1}>
          {/* Ohne Adresse: Die Seite liegt vor der Sitzungssperre, und eine
              gesperrte Sitzung zeigt keine Angaben zum Konto (ADR-025 Punkt 3). */}
          <Statusmeldung ton="warnung">{hinweisAngemeldet(undefined)}</Statusmeldung>
          <div className="mt-4 flex flex-col gap-3">
            <Button disabled={laeuft} onClick={() => void mitSitzungEinloesen()}>
              {laeuft ? 'Wird eingelöst …' : 'Für dieses Konto einlösen'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                // Selbst ausgelöst (BEF-047): Die Seite bleibt, ohne
                // „Ihre Sitzung wurde beendet".
                void meldeSelbstAb(() => getSupabase().auth.signOut({ scope: 'local' })).then(() =>
                  setZustand('formular'),
                );
              }}
            >
              Abmelden und neues Konto einrichten
            </Button>
          </div>
        </div>
      ) : null}

      {zustand === 'vorhanden' ? (
        <div ref={auskunft} tabIndex={-1}>
          <Statusmeldung ton="warnung">
            Für diese Adresse gibt es schon ein Konto. Melden Sie sich mit dessen Passkey an – dann
            gilt der Code für dieses Konto.
          </Statusmeldung>
          <div className="mt-4 flex flex-col gap-3">
            <Button disabled={laeuft} onClick={() => void mitPasskeyAnmeldenUndEinloesen()}>
              {laeuft ? 'Wird geprüft …' : 'Mit Passkey anmelden und einlösen'}
            </Button>
            <Button variant="secondary" onClick={() => setZustand('formular')}>
              Andere Adresse eingeben
            </Button>
          </div>
        </div>
      ) : null}

      {zustand === 'ungueltig' ? (
        <div ref={auskunft} tabIndex={-1}>
          <ErrorState
            title="Diese Einladung lässt sich nicht verwenden."
            description="Einladungen gelten 14 Tage und nur einmal. Die Praxis stellt Ihnen gern eine neue aus."
          />
          <ButtonLink to="/" variant="secondary" className="mt-4">
            Zur Anmeldung
          </ButtonLink>
        </div>
      ) : null}

      {zustand === 'anmelden' ? <LoadingState label="Sie werden angemeldet …" /> : null}

      {zustand === 'nicht-angemeldet' ? (
        <div ref={auskunft} tabIndex={-1}>
          <ErrorState
            title="Der Zugang ist eingerichtet, die Anmeldung gelang aber nicht."
            description="Der Code ist verbraucht. Bitte lassen Sie sich von der Praxis einen neuen geben – damit melden Sie sich an und richten Ihren Passkey ein."
          />
          <ButtonLink to="/" variant="secondary" className="mt-4">
            Zur Anmeldung
          </ButtonLink>
        </div>
      ) : null}

      {zustand === 'formular' ? (
        <form onSubmit={(event) => void absenden(event)} noValidate className="flex flex-col gap-4">
          <p className="text-ink text-sm leading-relaxed">
            Geben Sie Ihre E-Mail-Adresse an. Danach richten Sie auf diesem Telefon einen Passkey
            und eine PIN ein – ein Kennwort gibt es nicht.
          </p>
          <Field
            label="E-Mail-Adresse"
            feldId={FELD_EMAIL}
            type="email"
            name="username"
            autoComplete="username"
            inputMode="email"
            required
            value={email}
            error={emailFehler ?? undefined}
            onChange={(event) => {
              setEmail(event.target.value);
              setEmailFehler(null);
            }}
          />
          <Button type="submit" disabled={laeuft} className="mt-2">
            {laeuft ? 'Wird eingerichtet …' : 'Weiter'}
          </Button>
        </form>
      ) : null}
    </Vollseite>
  );
}
