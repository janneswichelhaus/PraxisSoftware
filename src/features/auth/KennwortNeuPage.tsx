import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Wortmarke } from '@/components/ui/Wortmarke';
import { KENNWORT_MINDESTLAENGE, aendereKennwort, kennwortProblem } from '@/features/account/api';
import { loeseLinkEin } from './linkEinloesen';

/**
 * Neues Kennwort über den Link aus der Mail setzen (FIX-001).
 *
 * Die einzige Seite neben der Anmeldemaske, die ohne Sitzung erreichbar ist.
 * Sie schließt die Lücke, die STAFF-004 offen ließ: Es wurden Mails verschickt,
 * aber es gab keinen Ort, an dem ein Link ankommen konnte. Der Abnahmeschritt
 * „Der Link führt zum Ziel" war nur deshalb unauffällig, weil er im selben
 * Browser geprüft wurde, in dem noch eine Sitzung stand — angemeldet öffnet
 * „Mein Konto" ja immer.
 *
 * Drei Zustände, und der erste läuft von allein:
 *
 *   1. **Einlösen.** Der Hash aus der Adresszeile wird gegen eine Sitzung
 *      getauscht. Ohne diesen Schritt hätte die Person kein Recht, ein
 *      Kennwort zu setzen — das Formular kommt deshalb erst danach.
 *   2. **Setzen.** Dieselbe Prüfung wie auf „Mein Konto", aus derselben
 *      Funktion (ANN-027). Eine zweite Regel an zweiter Stelle wäre eine
 *      zweite Wahrheit.
 *   3. **Fertig.** Die Person ist angemeldet und geht weiter. Der Schritt ist
 *      ausdrücklich, damit die Bestätigung nicht im Seitenwechsel untergeht.
 *
 * Was hier **nicht** passiert: andere Geräte abmelden. Wer das will, findet es
 * auf „Mein Konto"; der Text unten sagt es. Ungefragt alle Sitzungen zu
 * beenden wäre eine Nebenwirkung, die niemand angefordert hat.
 */
type Zustand = 'einloesen' | 'ungueltig' | 'formular' | 'fertig';

export function KennwortNeuPage() {
  const [suche] = useSearchParams();
  const navigate = useNavigate();
  const tokenHash = suche.get('token_hash');

  const [zustand, setZustand] = useState<Zustand>(tokenHash ? 'einloesen' : 'ungueltig');
  const [kennwort, setKennwort] = useState('');
  const [wiederholung, setWiederholung] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  /**
   * Der Hash ist einmalig — ein zweiter Versuch verbrennt ihn. In der
   * Entwicklung montiert React jede Komponente unter `StrictMode` zweimal,
   * deshalb dieser Riegel.
   */
  const eingeloest = useRef(false);

  useEffect(() => {
    if (!tokenHash || eingeloest.current) return;
    eingeloest.current = true;

    let aktiv = true;
    loeseLinkEin(tokenHash, 'recovery')
      .then(() => aktiv && setZustand('formular'))
      .catch(() => aktiv && setZustand('ungueltig'));

    return () => {
      aktiv = false;
    };
  }, [tokenHash]);

  async function absenden(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const problem = kennwortProblem(kennwort, wiederholung);
    if (problem) {
      setFehler(problem);
      return;
    }

    setFehler(null);
    setPending(true);
    try {
      await aendereKennwort(kennwort);
      setZustand('fertig');
    } catch {
      setFehler('Das Kennwort konnte nicht geändert werden. Bitte erneut versuchen.');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-5 py-10">
      <div className="mb-8">
        {/* Wie die Anmeldemaske eine Vollseite ausserhalb des
            Anwendungsrahmens - sie traegt die Marke selbst (MARKE-001). */}
        <Wortmarke hoehe={40} />
        <h1 className="text-ink mt-5 text-2xl font-semibold tracking-[-0.01em]">
          Neues Kennwort setzen
        </h1>
      </div>

      {zustand === 'einloesen' ? <LoadingState label="Der Link wird geprüft …" /> : null}

      {zustand === 'ungueltig' ? (
        <>
          <ErrorState
            title="Dieser Link lässt sich nicht mehr verwenden."
            description="Links aus der Mail gelten einmalig und nur für kurze Zeit. Fordern Sie auf der Anmeldemaske einen neuen an."
          />
          <Button variant="secondary" className="mt-4" onClick={() => void navigate('/')}>
            Zur Anmeldung
          </Button>
        </>
      ) : null}

      {zustand === 'formular' ? (
        <form onSubmit={(event) => void absenden(event)} noValidate className="flex flex-col gap-4">
          <Field
            label="Neues Kennwort"
            hint={`Mindestens ${KENNWORT_MINDESTLAENGE} Zeichen. Eine Wortfolge, die Sie sich merken können, ist besser als ein kurzes Kunstwort.`}
            type="password"
            name="new_password"
            autoComplete="new-password"
            required
            value={kennwort}
            onChange={(event) => {
              setKennwort(event.target.value);
              setFehler(null);
            }}
          />
          <Field
            label="Neues Kennwort wiederholen"
            type="password"
            name="new_password_repeat"
            autoComplete="new-password"
            required
            error={fehler ?? undefined}
            value={wiederholung}
            onChange={(event) => {
              setWiederholung(event.target.value);
              setFehler(null);
            }}
          />
          <Button type="submit" disabled={pending} className="mt-2">
            {pending ? 'Wird gesetzt …' : 'Kennwort setzen'}
          </Button>
        </form>
      ) : null}

      {zustand === 'fertig' ? (
        <>
          <Statusmeldung>
            Das Kennwort ist gesetzt. Sie sind auf diesem Gerät angemeldet.
          </Statusmeldung>
          <p className="text-ink-muted mt-3 text-sm leading-relaxed">
            Andere Geräte bleiben angemeldet. Wurde das bisherige Kennwort womöglich bekannt,
            beenden Sie unter „Mein Konto" zusätzlich alle Sitzungen.
          </p>
          <Button className="mt-4" onClick={() => void navigate('/mein-konto')}>
            Weiter zu „Mein Konto"
          </Button>
        </>
      ) : null}

      <p className="text-ink-subtle mt-8 text-xs leading-relaxed">
        Zugänge werden von der Praxis vergeben. Jede Person benötigt ein eigenes Konto; geteilte
        Zugänge sind nicht zulässig.
      </p>
    </main>
  );
}
