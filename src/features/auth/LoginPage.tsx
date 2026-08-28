import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { ErrorState } from '@/components/ui/Feedback';
import { getSupabase } from '@/lib/supabase';

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
        <p className="text-accent text-sm font-medium tracking-wide uppercase">Praxisplattform</p>
        <h1 className="text-ink mt-2 text-2xl font-semibold tracking-[-0.01em]">Anmelden</h1>
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

      <p className="text-ink-subtle mt-8 text-xs leading-relaxed">
        Zugänge werden von der Praxis vergeben. Jede Person benötigt ein eigenes Konto; geteilte
        Zugänge sind nicht zulässig.
      </p>
    </main>
  );
}
