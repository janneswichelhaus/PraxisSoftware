import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { ErrorState } from '@/components/ui/Feedback';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Wortmarke } from '@/components/ui/Wortmarke';
import { getSupabase } from '@/lib/supabase';
import { fordereKennwortMailAn } from '@/features/account/api';

/**
 * Kennwort vergessen (STAFF-004a).
 *
 * Die Bestätigung ist immer dieselbe und sagt bewusst nicht, ob es zu dieser
 * Adresse ein Konto gibt - sonst wäre das Formular ein Verzeichnis der
 * Mitarbeitenden dieser Praxis. Aus demselben Grund wird ein Fehler des
 * Anmeldedienstes hier nicht unterschieden: Auch „unbekannte Adresse" wäre
 * eine Auskunft.
 */
function KennwortVergessen({ voreingestellteAdresse }: { voreingestellteAdresse: string }) {
  const [offen, setOffen] = useState(false);
  const [email, setEmail] = useState('');
  const [gesendet, setGesendet] = useState(false);
  const [pending, setPending] = useState(false);

  if (gesendet) {
    return (
      <Statusmeldung className="mt-6">
        Falls für diese Adresse ein Zugang besteht, ist eine Mail zum Zurücksetzen unterwegs. Bitte
        auch den Spam-Ordner ansehen.
      </Statusmeldung>
    );
  }

  if (!offen) {
    return (
      <button
        type="button"
        onClick={() => {
          setEmail(voreingestellteAdresse);
          setOffen(true);
        }}
        className="text-ink-muted hover:text-ink mt-4 inline-flex min-h-11 items-center self-start text-sm underline underline-offset-4"
      >
        Kennwort vergessen?
      </button>
    );
  }

  async function absenden(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      await fordereKennwortMailAn(email);
    } catch {
      // Bewusst ohne eigene Meldung - siehe oben.
    } finally {
      setPending(false);
      setGesendet(true);
    }
  }

  return (
    <form
      onSubmit={(event) => void absenden(event)}
      noValidate
      aria-labelledby="kennwort-vergessen"
      className="border-line mt-8 flex flex-col gap-3 border-t pt-6"
    >
      {/* Ohne eigene Ueberschrift liest sich der Abschnitt wie eine zweite
          Zeile des Anmeldeformulars - zwei E-Mail-Felder untereinander, ohne
          dass klar waere, wofuer das zweite da ist. */}
      <h2 id="kennwort-vergessen" className="text-ink text-base font-semibold">
        Kennwort vergessen
      </h2>
      <Field
        label="E-Mail-Adresse des Zugangs"
        hint="Wir schicken einen Link, mit dem ein neues Kennwort gesetzt wird."
        type="email"
        name="reset_email"
        autoComplete="username"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="secondary" disabled={pending || email.trim() === ''}>
          {pending ? 'Wird gesendet …' : 'Link anfordern'}
        </Button>
        <Button type="button" variant="quiet" onClick={() => setOffen(false)}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}

/**
 * Anmeldung über Supabase Auth.
 *
 * Fehlermeldungen sind bewusst unspezifisch: Sie unterscheiden nicht zwischen
 * "Konto existiert nicht" und "Kennwort falsch", damit die Anmeldemaske keine
 * Auskunft darüber gibt, wer ein Konto in dieser Praxis hat.
 */
export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const { error: signInError } = await getSupabase().auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        setError('Anmeldung nicht möglich. Bitte E-Mail-Adresse und Kennwort prüfen.');
      }
    } catch {
      setError('Der Anmeldedienst ist derzeit nicht erreichbar.');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-5 py-10">
      <div className="mb-8">
        {/* Die Anmeldemaske ist die Haustür — hier steht die Marke selbst, nicht
            ihr Name als Text. 40 px liegen deutlich über der Mindestgröße von
            24 px, und `mt-5` (20 px) hält den Schutzraum ein, den die
            MOTION-Zeile bei dieser Höhe verlangt (14,4 px) — mit etwas Luft,
            damit die Überschrift die Marke nicht optisch berührt. */}
        <Wortmarke hoehe={40} />
        <h1 className="text-ink mt-5 text-2xl font-semibold tracking-[-0.01em]">Anmelden</h1>
        <p className="text-ink-muted mt-2 text-sm">
          Zugang ausschließlich für Mitarbeitende und Patient:innen der Praxis.
        </p>
      </div>

      <form
        onSubmit={(event) => void handleSubmit(event)}
        noValidate
        className="flex flex-col gap-4"
      >
        {error ? <ErrorState title={error} /> : null}

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

        <Button type="submit" disabled={pending} className="mt-2">
          {pending ? 'Anmeldung läuft …' : 'Anmelden'}
        </Button>
      </form>

      <KennwortVergessen voreingestellteAdresse={email} />

      <p className="text-ink-subtle mt-8 text-xs leading-relaxed">
        Zugänge werden von der Praxis vergeben. Jede Person benötigt ein eigenes Konto; geteilte
        Zugänge sind nicht zulässig.
      </p>
    </main>
  );
}
