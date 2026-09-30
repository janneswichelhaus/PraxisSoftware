import { Field } from '@/components/ui/Field';
import { Feldgruppe, Section } from '@/components/ui/Section';
import { heuteImGeraet, trainingFeldId, type TrainingFeld, type TrainingWerte } from './api';

/**
 * Eingabefelder einer Trainingskund:in - Anlegen und Ändern erfassen
 * dieselben (TRN-002).
 *
 * Bewusst **ohne** Screening- und Gesundheitsangaben: Sie brauchen eine
 * ausdrückliche Einwilligung (Art. 9 Abs. 2 lit. a DSGVO) und eine eigene
 * Frist; beides kommt mit dem Loop, der sie anlegt (ADR-021 Punkt 4). Der
 * Satz unter dem Formular sagt das, damit hier kein Freitext zur Gesundheit
 * entsteht.
 */

const OHNE_AUTOKORREKTUR = {
  spellCheck: false,
  autoCorrect: 'off',
  autoCapitalize: 'words',
} as const;

export function TrainingClientFields({
  werte,
  fehler,
  onChange,
  vertragsbeginnPflicht = false,
}: {
  werte: TrainingWerte;
  fehler: Partial<Record<TrainingFeld, string>>;
  onChange: (feld: TrainingFeld, wert: string) => void;
  /** Beim Ändern ist der Beginn gesetzt und bleibt es (der Server verlangt ihn). */
  vertragsbeginnPflicht?: boolean;
}) {
  function feld(name: TrainingFeld, label: string, extra: Record<string, unknown> = {}) {
    return (
      <Field
        label={label}
        name={name}
        feldId={trainingFeldId(name)}
        autoComplete="off"
        value={werte[name]}
        error={fehler[name]}
        onChange={(event) => onChange(name, event.target.value)}
        {...extra}
      />
    );
  }

  return (
    <>
      <Section titel="Person">
        <Feldgruppe>
          {feld('given_name', 'Vorname *', {
            ...OHNE_AUTOKORREKTUR,
            maxLength: 100,
            required: true,
          })}
          {feld('family_name', 'Nachname *', {
            ...OHNE_AUTOKORREKTUR,
            maxLength: 100,
            required: true,
          })}
          {feld('date_of_birth', 'Geburtsdatum', {
            type: 'date',
            min: '1900-01-01',
            max: heuteImGeraet(),
          })}
        </Feldgruppe>
      </Section>

      <Section titel="Kontakt">
        <Feldgruppe>
          {feld('phone', 'Telefon', { type: 'tel' })}
          {feld('email', 'E-Mail', { type: 'email' })}
          {feld('street', 'Straße und Hausnummer', { ...OHNE_AUTOKORREKTUR, maxLength: 200 })}
          {feld('postal_code', 'PLZ', { inputMode: 'numeric', maxLength: 12 })}
          {feld('city', 'Ort', { ...OHNE_AUTOKORREKTUR, maxLength: 100 })}
        </Feldgruppe>
      </Section>

      <Section titel="Vertrag">
        <Feldgruppe>
          {vertragsbeginnPflicht
            ? feld('contract_started_on', 'Vertragsbeginn *', {
                type: 'date',
                min: '2000-01-01',
                required: true,
              })
            : feld('contract_started_on', 'Vertragsbeginn', {
                type: 'date',
                min: '2000-01-01',
                hint: 'Ohne Angabe beginnt der Vertrag heute.',
              })}
        </Feldgruppe>
      </Section>
    </>
  );
}
