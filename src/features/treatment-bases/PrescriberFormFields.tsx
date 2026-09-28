import type { ChangeEvent } from 'react';
import { Field } from '@/components/ui/Field';
import type { PrescriberFeld } from './api';
import { Feldgruppe, Section } from '@/components/ui/Section';
import {
  VERORDNER_BESCHRIFTUNG,
  VERORDNER_HOECHSTLAENGE,
  verordnerFeldId,
} from './verordnerfelder';

/**
 * Eingabefelder einer Verordner:in.
 *
 * Anlegen und Ändern erfassen dieselben Felder. Erfasst wird nur, was nötig
 * ist, um die Person zu erkennen und für eine Folgeverordnung zu erreichen -
 * kein LANR, keine Betriebsstättennummer: das sind GKV-Merkmale und hier ohne
 * Zweck (ADR-009).
 *
 * Jedes Feld trägt eine feste Kennung, auf die die Fehlerzusammenfassung
 * springt, und seine Höchstlänge (UIK-02, VER-15; `verordnerfelder.ts`).
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
  /** Was jedes Feld gleich trägt: Name, Kennung, Grenze, Wert und Fehler. */
  function feld(name: PrescriberFeld) {
    return {
      name,
      feldId: verordnerFeldId(name),
      maxLength: VERORDNER_HOECHSTLAENGE[name],
      autoComplete: 'off',
      value: werte[name],
      error: fehler[name],
      onChange: (event: ChangeEvent<HTMLInputElement>) => onChange(name, event.target.value),
    };
  }

  return (
    <>
      <Section titel="Person">
        <Feldgruppe>
          <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
            <Field label={VERORDNER_BESCHRIFTUNG.title} {...feld('title')} />
            <Field label={VERORDNER_BESCHRIFTUNG.given_name} {...feld('given_name')} />
          </div>
          <Field
            label={`${VERORDNER_BESCHRIFTUNG.family_name} *`}
            required
            {...feld('family_name')}
          />
          <Field
            label={VERORDNER_BESCHRIFTUNG.practice_name}
            hint="Unterscheidet zwei gleichnamige Ärzt:innen in der Auswahlliste."
            {...feld('practice_name')}
          />
          <Field label={VERORDNER_BESCHRIFTUNG.speciality} {...feld('speciality')} />
        </Feldgruppe>
      </Section>

      <Section titel="Anschrift">
        <Feldgruppe>
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <Field label={VERORDNER_BESCHRIFTUNG.street} {...feld('street')} />
            <Field label={VERORDNER_BESCHRIFTUNG.house_number} {...feld('house_number')} />
          </div>
          <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
            <Field
              label={VERORDNER_BESCHRIFTUNG.postal_code}
              inputMode="numeric"
              {...feld('postal_code')}
            />
            <Field label={VERORDNER_BESCHRIFTUNG.city} {...feld('city')} />
          </div>
        </Feldgruppe>
      </Section>

      <Section titel="Kontakt">
        <Feldgruppe>
          <Field label={VERORDNER_BESCHRIFTUNG.phone} type="tel" {...feld('phone')} />
          <Field
            label={VERORDNER_BESCHRIFTUNG.fax}
            type="tel"
            hint="Viele Praxen nehmen die Anforderung einer Folgeverordnung per Fax entgegen."
            {...feld('fax')}
          />
          <Field label={VERORDNER_BESCHRIFTUNG.email} type="email" {...feld('email')} />
        </Feldgruppe>
      </Section>
    </>
  );
}
