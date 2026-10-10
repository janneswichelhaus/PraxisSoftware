import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Vollseite } from '@/app/Vollseite';
import { getSupabase } from '@/lib/supabase';
import { ANMELDESAETZE, anmeldesatz } from '../anmeldefehler';
import { useFokusNachWechsel } from '../fokus';
import { SPERRFRISTEN, type Sperrgrund } from './sperrstand';

/**
 * Die Sperrseite (ADR-025 Punkte 3 und 7).
 *
 * Ohne Namen, ohne Akte, ohne Termin - auch die E-Mail-Adresse steht nicht da;
 * die Anwendung kennt sie aus der Sitzung. Freigegeben wird mit dem Kennwort
 * des eigenen Kontos, so wie die Anmeldung es verlangt (ANN-028: der zweite
 * Faktor ist einrichtbar, nicht erzwungen; ANN-257). Ein Passkey kommt hinzu,
 * wenn der Anmeldedienst ihn außerhalb der Beta anbietet (W3).
 *
 * Wer nicht das eigene Konto freigeben will, meldet ab - das ist ein
 * Kontowechsel, und der räumt wie jeder andere (`SessionProvider`).
 */
const KENNWORT_FELD = 'sperre-kennwort';

export function Sperrseite({
  grund,
  haelt,
  email,
  onEntsperrt,
  onAbmelden,
}: {
  grund: Sperrgrund;
  /** Eine Seite mit ungesichertem Text wartet verborgen (Punkt 4). */
  haelt: boolean;
  email: string | undefined;
  onEntsperrt: () => void;
  onAbmelden: () => void;
}) {
  const [kennwort, setKennwort] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const fehlerkasten = useRef<HTMLDivElement>(null);
  useFokusNachWechsel(fehler, () => (fehler ? fehlerkasten.current : null));

  // Der Fokus steht im Kennwort: Wer zurückkommt, tippt sofort.
  useEffect(() => {
    document.getElementById(KENNWORT_FELD)?.focus();
  }, []);

  async function entsperren(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email) return;
    setFehler(null);
    setLaeuft(true);
    try {
      const { error } = await getSupabase().auth.signInWithPassword({
        email,
        password: kennwort,
      });
      if (error) {
        // Ein Funkloch ist kein falsches Kennwort (BEF-047).
        setFehler(anmeldesatz(error, 'Das Kennwort passt nicht. Bitte erneut eingeben.'));
        return;
      }
      setKennwort('');
      onEntsperrt();
    } catch {
      setFehler(ANMELDESAETZE.keineVerbindung);
    } finally {
      setLaeuft(false);
    }
  }

  const anlass =
    grund === 'hoechstdauer'
      ? `Nach ${SPERRFRISTEN.hoechstMinuten} Minuten ist eine erneute Anmeldung nötig.`
      : grund === 'inaktiv'
        ? `Nach ${SPERRFRISTEN.inaktivMinuten} Minuten ohne Bedienung hat sich die Anwendung gesperrt.`
        : 'Die Anwendung hat sich gesperrt.';

  return (
    <Vollseite
      titel="Gesperrt"
      einleitung={`${anlass} Mit Ihrem Kennwort geht es an derselben Stelle weiter.`}
      kleingedrucktes={
        haelt
          ? 'Eine Eingabe ließ sich nicht sichern. Sie steht nach dem Entsperren wieder da – bitte dann speichern. Wer sich mit einem anderen Konto anmeldet, verwirft sie.'
          : 'Offene Texte wurden vor der Sperre als Entwurf gesichert. Die Sperre schützt die Daten, wenn das Gerät liegen bleibt.'
      }
    >
      {email ? (
        <form
          onSubmit={(event) => void entsperren(event)}
          noValidate
          className="flex flex-col gap-4"
        >
          {fehler ? (
            <div ref={fehlerkasten} tabIndex={-1}>
              <ErrorState title={fehler} />
            </div>
          ) : null}
          {/* Für Passwortmanager: das Konto als verborgenes Feld, nicht sichtbar. */}
          <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />
          <Field
            label="Kennwort"
            type="password"
            name="password"
            autoComplete="current-password"
            required
            feldId={KENNWORT_FELD}
            value={kennwort}
            onChange={(event) => setKennwort(event.target.value)}
          />
          <Button type="submit" disabled={laeuft || kennwort === ''}>
            {laeuft ? 'Wird entsperrt …' : 'Entsperren'}
          </Button>
        </form>
      ) : null}
      <Button variant="quiet" className="mt-3 w-full" onClick={onAbmelden}>
        Mit anderem Konto anmelden
      </Button>
    </Vollseite>
  );
}
