import { Field } from '@/components/ui/Field';
import type { StammdatenFeld } from './api';

function Abschnitt({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 first:mt-0">
      <h2 className="text-ink-muted text-sm font-semibold tracking-wide uppercase">{titel}</h2>
      <div className="mt-3 flex flex-col gap-4">{children}</div>
    </section>
  );
}

/**
 * Eingabefelder der organisatorischen Stammdaten.
 *
 * Anlegen und Ändern erfassen dieselben Felder. Die Felder liegen deshalb an
 * einer Stelle; Absenden, Fehlerbanner und Navigation bleiben bei der
 * jeweiligen Seite, weil sie sich fachlich unterscheiden.
 */
export function PatientMasterDataFields({
  werte,
  fehler,
  onChange,
}: {
  werte: Record<StammdatenFeld, string>;
  fehler: Partial<Record<StammdatenFeld, string>>;
  onChange: (feld: StammdatenFeld, wert: string) => void;
}) {
  return (
    <>
      <Abschnitt titel="Person">
        <Field
          label="Vorname *"
          name="given_name"
          autoComplete="off"
          required
          value={werte.given_name}
          error={fehler.given_name}
          onChange={(event) => onChange('given_name', event.target.value)}
        />
        <Field
          label="Nachname *"
          name="family_name"
          autoComplete="off"
          required
          value={werte.family_name}
          error={fehler.family_name}
          onChange={(event) => onChange('family_name', event.target.value)}
        />
        <Field
          label="Geburtsdatum *"
          name="date_of_birth"
          type="date"
          required
          value={werte.date_of_birth}
          error={fehler.date_of_birth}
          onChange={(event) => onChange('date_of_birth', event.target.value)}
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
          onChange={(event) => onChange('email', event.target.value)}
        />
        <Field
          label="Telefon"
          name="phone"
          type="tel"
          autoComplete="off"
          value={werte.phone}
          error={fehler.phone}
          onChange={(event) => onChange('phone', event.target.value)}
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
            onChange={(event) => onChange('street', event.target.value)}
          />
          <Field
            label="Hausnummer"
            name="house_number"
            autoComplete="off"
            value={werte.house_number}
            error={fehler.house_number}
            onChange={(event) => onChange('house_number', event.target.value)}
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
            onChange={(event) => onChange('postal_code', event.target.value)}
          />
          <Field
            label="Ort"
            name="city"
            autoComplete="off"
            value={werte.city}
            error={fehler.city}
            onChange={(event) => onChange('city', event.target.value)}
          />
        </div>
      </Abschnitt>
    </>
  );
}
