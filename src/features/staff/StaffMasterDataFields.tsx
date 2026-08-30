import type { ReactNode } from 'react';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import type { Location } from '@/features/appointments/api';
import type { StaffFeld } from './api';

function Abschnitt({
  titel,
  hinweis,
  children,
}: {
  titel: string;
  hinweis?: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-8 first:mt-0">
      <h2 className="text-ink-muted text-sm font-semibold tracking-wide uppercase">{titel}</h2>
      {hinweis ? <p className="text-ink-subtle mt-1 text-sm">{hinweis}</p> : null}
      <div className="mt-3 flex flex-col gap-4">{children}</div>
    </section>
  );
}

/**
 * Eingabefelder der Mitarbeiterstammdaten.
 *
 * Anlegen und Ändern erfassen dieselben Felder; sie liegen deshalb an einer
 * Stelle. Absenden, Fehlerbanner und Navigation bleiben bei der jeweiligen
 * Seite.
 *
 * Die Privatangaben stehen bewusst in einem eigenen Abschnitt mit eigenem
 * Hinweis: sie liegen in einer eigenen Tabelle und sind nur für die
 * Praxisinhaberin und die betroffene Person lesbar
 * (PROJECT_PRINCIPLES.md 20).
 */
export function StaffMasterDataFields({
  werte,
  fehler,
  standorte,
  onChange,
}: {
  werte: Record<StaffFeld, string>;
  fehler: Partial<Record<StaffFeld, string>>;
  standorte: readonly Location[];
  onChange: (feld: StaffFeld, wert: string) => void;
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
      </Abschnitt>

      <Abschnitt
        titel="Dienstlich"
        hinweis="Für alle Praxisrollen sichtbar - für Vertretung, Rückfragen und Einsatzplanung."
      >
        <Field
          label="Dienstliche E-Mail"
          name="work_email"
          type="email"
          autoComplete="off"
          value={werte.work_email}
          error={fehler.work_email}
          onChange={(event) => onChange('work_email', event.target.value)}
        />
        <Field
          label="Diensttelefon"
          name="work_phone"
          type="tel"
          autoComplete="off"
          value={werte.work_phone}
          error={fehler.work_phone}
          onChange={(event) => onChange('work_phone', event.target.value)}
        />
        <Select
          label="Hauptstandort"
          name="primary_location_id"
          value={werte.primary_location_id}
          error={fehler.primary_location_id}
          onChange={(event) => onChange('primary_location_id', event.target.value)}
        >
          <option value="">— kein fester Standort —</option>
          {standorte.map((standort) => (
            <option key={standort.id} value={standort.id}>
              {standort.name}
            </option>
          ))}
        </Select>
      </Abschnitt>

      <Abschnitt
        titel="Privat"
        hinweis="Beschäftigtendaten. Nur für die Praxisinhaberin und die betroffene Person sichtbar; alle Angaben sind freiwillig."
      >
        <Field
          label="Geburtsdatum"
          name="date_of_birth"
          type="date"
          value={werte.date_of_birth}
          error={fehler.date_of_birth}
          onChange={(event) => onChange('date_of_birth', event.target.value)}
        />
        <Field
          label="Private E-Mail"
          name="private_email"
          type="email"
          autoComplete="off"
          value={werte.private_email}
          error={fehler.private_email}
          onChange={(event) => onChange('private_email', event.target.value)}
        />
        <Field
          label="Privattelefon"
          name="private_phone"
          type="tel"
          autoComplete="off"
          value={werte.private_phone}
          error={fehler.private_phone}
          onChange={(event) => onChange('private_phone', event.target.value)}
        />
        <Field
          label="Straße und Hausnummer"
          name="street"
          autoComplete="off"
          value={werte.street}
          error={fehler.street}
          onChange={(event) => onChange('street', event.target.value)}
        />
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
