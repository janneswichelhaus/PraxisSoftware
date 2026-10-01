import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { ErrorState } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Vollseite } from '@/app/Vollseite';
import { KENNWORT_MINDESTLAENGE } from '@/features/account/api';
import { kennwortFehler, type Kennwortfehler } from '@/features/account/kennwortFehler';
import { useFokusNachWechsel } from '@/features/auth/fokus';
import { hinweisAngemeldet } from '@/features/auth/fremdeSitzung';
import { useSession } from '@/features/auth/sessionContext';
import { getSupabase } from '@/lib/supabase';
import { EinloeseError, codeAusFragment, loeseEinladungEin } from './einladung';

/**
 * Eine Einladung zur Plattform einlösen (POR-003, ADR-023 Punkte 7 und 8).
 *
 * Die Person kommt über den QR-Code auf ihrem eigenen Telefon hierher oder
 * über den Link aus der Mail. Sie legt Adresse und Kennwort fest; wer schon
 * ein Konto hat, gibt dessen Adresse und Kennwort ein (ANN-191). Danach ist
 * sie angemeldet.
 *
 * **Der Code verlässt die Adresszeile sofort.** Er wird beim Öffnen gelesen
 * und aus dem Verlaufseintrag genommen; danach steht er nur noch im Speicher
 * dieser Seite. Für unbekannte, abgelaufene und benutzte Codes gibt es
 * dieselbe Auskunft (Punkt 8, §13).
 */
type Zustand = 'fremde-sitzung' | 'formular' | 'ungueltig' | 'fertig-anmelden';

const FELD_EMAIL = 'einladung-email';
const FELD_KENNWORT = 'einladung-kennwort';
const FELD_WIEDERHOLUNG = 'einladung-kennwort-wiederholung';

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
    return session !== null ? 'fremde-sitzung' : 'formular';
  });
  const [email, setEmail] = useState('');
  const [kennwort, setKennwort] = useState('');
  const [wiederholung, setWiederholung] = useState('');
  const [feldfehler, setFeldfehler] = useState<Kennwortfehler | null>(null);
  const [emailFehler, setEmailFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const auskunft = useRef<HTMLDivElement>(null);

  useFokusNachWechsel(zustand, () =>
    zustand === 'formular' ? document.getElementById(FELD_EMAIL) : auskunft.current,
  );

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
    const problem = kennwortFehler(kennwort, wiederholung);
    if (problem) {
      setFeldfehler(problem);
      document
        .getElementById(problem.feld === 'kennwort' ? FELD_KENNWORT : FELD_WIEDERHOLUNG)
        ?.focus();
      return;
    }
    setFeldfehler(null);
    setLaeuft(true);
    try {
      await loeseEinladungEin(code, adresse, kennwort);
    } catch (fehler) {
      setLaeuft(false);
      const art = fehler instanceof EinloeseError ? fehler.art : 'unavailable';
      if (art === 'invitation_invalid') {
        setZustand('ungueltig');
      } else if (art === 'password_not_set') {
        // Der Code ist verbraucht, das Kennwort blieb das alte (Zweitreview).
        setMeldung(
          'Das neue Kennwort ließ sich nicht setzen, und der Code ist verbraucht. Bitte lassen Sie sich von der Praxis einen neuen geben.',
        );
      } else if (art === 'email_taken') {
        setEmailFehler(
          'Für diese Adresse gibt es schon ein Konto. Mit dessen Kennwort geht es weiter – oder Sie nehmen eine andere Adresse.',
        );
        document.getElementById(FELD_EMAIL)?.focus();
      } else if (art === 'account_conflict') {
        setEmailFehler(
          'Mit dieser Adresse lässt sich der Zugang nicht einrichten. Bitte nehmen Sie eine andere Adresse.',
        );
        document.getElementById(FELD_EMAIL)?.focus();
      } else if (art === 'weak_password') {
        setFeldfehler({
          feld: 'kennwort',
          text: `Das Kennwort braucht mindestens ${KENNWORT_MINDESTLAENGE} Zeichen.`,
        });
        document.getElementById(FELD_KENNWORT)?.focus();
      } else {
        setMeldung(
          'Der Zugang lässt sich gerade nicht einrichten. Ihr Code ist deswegen nicht verbraucht – bitte später erneut versuchen.',
        );
      }
      return;
    }

    // Eingerichtet: anmelden wie immer, mit Adresse und Kennwort (Punkt 18).
    const { error } = await getSupabase().auth.signInWithPassword({
      email: adresse,
      password: kennwort,
    });
    setLaeuft(false);
    if (error) {
      // Beim neuen Kennwort gilt die Adresse des bestehenden Kontos. Wer eine
      // andere eingegeben hat, meldet sich mit der richtigen an.
      setZustand('fertig-anmelden');
      return;
    }
    void navigate('/', { replace: true });
  }

  return (
    <Vollseite
      titel="Ihr Zugang"
      kleingedrucktes="Der Zugang gehört nur Ihnen. Bitte geben Sie Adresse und Kennwort nicht weiter – Angehörige bekommen auf Wunsch einen eigenen Zugang von der Praxis."
    >
      {zustand === 'fremde-sitzung' ? (
        <div ref={auskunft} tabIndex={-1}>
          <Statusmeldung ton="warnung">{hinweisAngemeldet(session?.user.email)}</Statusmeldung>
          <div className="mt-4 flex flex-col gap-3">
            <Button
              onClick={() => {
                void getSupabase()
                  .auth.signOut({ scope: 'local' })
                  .then(() => setZustand('formular'));
              }}
            >
              Abmelden und Zugang einrichten
            </Button>
            <ButtonLink to="/" replace variant="secondary">
              Angemeldet bleiben
            </ButtonLink>
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

      {zustand === 'fertig-anmelden' ? (
        <div ref={auskunft} tabIndex={-1}>
          <Statusmeldung ton="erfolg">Ihr Kennwort ist gesetzt.</Statusmeldung>
          <p className="text-ink-muted mt-3 text-sm leading-relaxed">
            Bitte melden Sie sich jetzt mit der Adresse Ihres Kontos und dem neuen Kennwort an.
          </p>
          <ButtonLink to="/" className="mt-4">
            Zur Anmeldung
          </ButtonLink>
        </div>
      ) : null}

      {zustand === 'formular' ? (
        <form onSubmit={(event) => void absenden(event)} noValidate className="flex flex-col gap-4">
          <p className="text-ink text-sm leading-relaxed">
            Legen Sie Ihre E-Mail-Adresse und ein Kennwort fest. Damit melden Sie sich künftig an.
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
          <Field
            label="Kennwort"
            feldId={FELD_KENNWORT}
            hint={`Mindestens ${KENNWORT_MINDESTLAENGE} Zeichen. Eine Wortfolge, die Sie sich merken können, ist besser als ein kurzes Kunstwort.`}
            type="password"
            name="new_password"
            autoComplete="new-password"
            required
            value={kennwort}
            error={feldfehler?.feld === 'kennwort' ? feldfehler.text : undefined}
            onChange={(event) => {
              setKennwort(event.target.value);
              setFeldfehler(null);
            }}
          />
          <Field
            label="Kennwort wiederholen"
            feldId={FELD_WIEDERHOLUNG}
            type="password"
            name="new_password_repeat"
            autoComplete="new-password"
            required
            value={wiederholung}
            error={feldfehler?.feld === 'wiederholung' ? feldfehler.text : undefined}
            onChange={(event) => {
              setWiederholung(event.target.value);
              setFeldfehler(null);
            }}
          />
          {meldung ? <Statusmeldung ton="fehler">{meldung}</Statusmeldung> : null}
          <Button type="submit" disabled={laeuft} className="mt-2">
            {laeuft ? 'Wird eingerichtet …' : 'Zugang einrichten'}
          </Button>
        </form>
      ) : null}
    </Vollseite>
  );
}
