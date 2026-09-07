import { Field } from '@/components/ui/Field';
import type { PrescriberFeld } from './api';
import { Feldgruppe, Section } from '@/components/ui/Section';

/**
 * Eingabefelder einer Verordner:in.
 *
 * Anlegen und Ändern erfassen dieselben Felder. Erfasst wird nur, was nötig
 * ist, um die Person zu erkennen und für eine Folgeverordnung zu erreichen -
 * kein LANR, keine Betriebsstättennummer: das sind GKV-Merkmale und hier ohne
 * Zweck (ADR-009).
 */
export function PrescriberFormFields({
  werte,
  fehler,
  onChange,
}: {
  werte: Record<PrescriberFeld, string>;
  fehler: Partial<Record<PrescriberFeld, string>>;
  onChange: (feld: PrescriberFeld, wert: string) => void;
}) {
  return (
    <>
      <Section titel="Person">
        <Feldgruppe>
          <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
            <Field
              label="Titel"
              name="title"
              autoComplete="off"
              value={werte.title}
              error={fehler.title}
              onChange={(event) => onChange('title', event.target.value)}
            />
            <Field
              label="Vorname"
              name="given_name"
              autoComplete="off"
              value={werte.given_name}
              error={fehler.given_name}
              onChange={(event) => onChange('given_name', event.target.value)}
            />
          </div>
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
            label="Praxis oder Einrichtung"
            name="practice_name"
            autoComplete="off"
            hint="Unterscheidet zwei gleichnamige Ärzt:innen in der Auswahlliste."
            value={werte.practice_name}
            error={fehler.practice_name}
            onChange={(event) => onChange('practice_name', event.target.value)}
          />
          <Field
            label="Fachrichtung"
            name="speciality"
            autoComplete="off"
            value={werte.speciality}
            error={fehler.speciality}
            onChange={(event) => onChange('speciality', event.target.value)}
          />
        </Feldgruppe>
      </Section>

      <Section titel="Anschrift">
        <Feldgruppe>
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
        </Feldgruppe>
      </Section>

      <Section titel="Kontakt">
        <Feldgruppe>
          <Field
            label="Telefon"
            name="phone"
            type="tel"
            autoComplete="off"
            value={werte.phone}
            error={fehler.phone}
            onChange={(event) => onChange('phone', event.target.value)}
          />
          <Field
            label="Telefax"
            name="fax"
            type="tel"
            autoComplete="off"
            hint="Viele Praxen nehmen die Anforderung einer Folgeverordnung per Fax entgegen."
            value={werte.fax}
            error={fehler.fax}
            onChange={(event) => onChange('fax', event.target.value)}
          />
          <Field
            label="E-Mail"
            name="email"
            type="email"
            autoComplete="off"
            value={werte.email}
            error={fehler.email}
            onChange={(event) => onChange('email', event.target.value)}
          />
        </Feldgruppe>
      </Section>
    </>
  );
}
