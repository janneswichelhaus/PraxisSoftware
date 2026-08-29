import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { ErrorState } from '@/components/ui/Feedback';
import { createPatient, newPatientSchema, type NewPatientInput } from './api';

type FeldName = keyof NewPatientInput;

const leer: Record<FeldName, string> = {
  given_name: '',
  family_name: '',
  date_of_birth: '',
  email: '',
  phone: '',
  street: '',
  house_number: '',
  postal_code: '',
  city: '',
};

function Abschnitt({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 first:mt-0">
      <h2 className="text-ink-muted text-sm font-semibold tracking-wide uppercase">{titel}</h2>
      <div className="mt-3 flex flex-col gap-4">{children}</div>
    </section>
  );
}

/**
 * Anlage eines neuen Patienten.
 *
 * Die Prüfung im Formular dient der Bedienbarkeit. Verbindlich sind
 * Berechtigung, Organisationszuordnung und Normalisierung in der
 * Serverfunktion `create_patient` (ADR-004).
 */
export function NewPatientPage() {
  const [werte, setWerte] = useState<Record<FeldName, string>>(leer);
  const [fehler, setFehler] = useState<Partial<Record<FeldName, string>>>({});
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: createPatient,
    onSuccess: async (patientId) => {
      await queryClient.invalidateQueries({ queryKey: ['patients'] });
      void navigate(`/patienten/${patientId}`, { replace: true });
    },
  });

  function setzen(feld: FeldName, wert: string) {
    setWerte((bisher) => ({ ...bisher, [feld]: wert }));
    if (fehler[feld]) setFehler((bisher) => ({ ...bisher, [feld]: undefined }));
  }

  function absenden(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Schutz gegen mehrfaches Absenden: solange ein Vorgang läuft, wird kein
    // zweiter gestartet. Der Button ist zusätzlich deaktiviert.
    if (mutation.isPending) return;

    const ergebnis = newPatientSchema.safeParse(werte);
    if (!ergebnis.success) {
      const gefunden: Partial<Record<FeldName, string>> = {};
      for (const problem of ergebnis.error.issues) {
        const feld = problem.path[0] as FeldName | undefined;
        if (feld && !gefunden[feld]) gefunden[feld] = problem.message;
      }
      setFehler(gefunden);
      return;
    }

    setFehler({});
    mutation.mutate(ergebnis.data);
  }

  return (
    <>
      <Link
        to="/patienten"
        className="text-ink-muted hover:text-ink mb-4 inline-flex min-h-11 items-center text-sm"
      >
        ← Zurück zur Liste
      </Link>

      <PageHeader
        title="Neue:r Patient:in"
        description="Stammdaten für die Aufnahme in die Praxis. Mit * markierte Felder sind erforderlich."
      />

      <form onSubmit={absenden} noValidate className="max-w-xl">
        {mutation.isError ? (
          <div className="mb-6">
            <ErrorState
              title="Der Patient konnte nicht angelegt werden."
              description="Bitte erneut versuchen. Sind Sie noch angemeldet und berechtigt?"
            />
          </div>
        ) : null}

        <Abschnitt titel="Person">
          <Field
            label="Vorname *"
            name="given_name"
            autoComplete="off"
            required
            value={werte.given_name}
            error={fehler.given_name}
            onChange={(event) => setzen('given_name', event.target.value)}
          />
          <Field
            label="Nachname *"
            name="family_name"
            autoComplete="off"
            required
            value={werte.family_name}
            error={fehler.family_name}
            onChange={(event) => setzen('family_name', event.target.value)}
          />
          <Field
            label="Geburtsdatum *"
            name="date_of_birth"
            type="date"
            required
            value={werte.date_of_birth}
            error={fehler.date_of_birth}
            onChange={(event) => setzen('date_of_birth', event.target.value)}
          />
        </Abschnitt>

        <Abschnitt titel="Kontakt">
          <Field
            label="E-Mail"
            name="email"
            type="email"
            autoComplete="off"
            value={werte.email}
            error={fehler.email}
            onChange={(event) => setzen('email', event.target.value)}
          />
          <Field
            label="Telefon"
            name="phone"
            type="tel"
            autoComplete="off"
            value={werte.phone}
            error={fehler.phone}
            onChange={(event) => setzen('phone', event.target.value)}
          />
        </Abschnitt>

        <Abschnitt titel="Adresse">
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <Field
              label="Straße"
              name="street"
              autoComplete="off"
              value={werte.street}
              error={fehler.street}
              onChange={(event) => setzen('street', event.target.value)}
            />
            <Field
              label="Hausnummer"
              name="house_number"
              autoComplete="off"
              value={werte.house_number}
              error={fehler.house_number}
              onChange={(event) => setzen('house_number', event.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
            <Field
              label="PLZ"
              name="postal_code"
              inputMode="numeric"
              autoComplete="off"
              value={werte.postal_code}
              error={fehler.postal_code}
              onChange={(event) => setzen('postal_code', event.target.value)}
            />
            <Field
              label="Ort"
              name="city"
              autoComplete="off"
              value={werte.city}
              error={fehler.city}
              onChange={(event) => setzen('city', event.target.value)}
            />
          </div>
        </Abschnitt>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Wird angelegt …' : 'Patient anlegen'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => void navigate('/patienten')}>
            Abbrechen
          </Button>
        </div>
      </form>

      <p className="text-ink-subtle mt-10 max-w-prose text-xs leading-relaxed">
        Es werden ausschließlich organisatorische Stammdaten erfasst. Klinische Angaben und ein
        Portalzugang entstehen hier nicht.
      </p>
    </>
  );
}
