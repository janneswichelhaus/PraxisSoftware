import { useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Card';
import { Fehlerzusammenfassung } from '@/components/ui/Fehlerzusammenfassung';
import { Field } from '@/components/ui/Field';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { Feldgruppe, Section } from '@/components/ui/Section';
import { Segment } from '@/components/ui/Segment';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { EINGABETEXTE, useTextverlustschutz } from '@/features/documentation/Textverlustschutz';
import { alsFormularfehler } from '@/lib/formularfehler';
import {
  bezug,
  LEBENSMITTEL_BESCHRIFTUNG,
  LEBENSMITTEL_FELDER,
  lebensmittelPruefen,
  type Lebensmittel,
  type LebensmittelAngaben,
  type LebensmittelFeld,
  type LebensmittelWerte,
} from './lebensmittel';

const feldId = (feld: LebensmittelFeld) => `lebensmittel-${feld}`;

/**
 * Ein eigenes Lebensmittel mit Nährwerten von der Verpackung (ADR-027
 * Punkt 9) - für die Praxis und für die Person. Pflicht sind Name, Energie,
 * Eiweiß, Fett und Kohlenhydrate; das Übrige steht eingeklappt.
 */
export function LebensmittelFormular({
  anfang,
  speichernText,
  laeuft,
  fehlermeldung,
  onSpeichern,
  onAbbrechen,
  unten,
  beschriftung,
}: {
  anfang: LebensmittelWerte;
  speichernText: string;
  laeuft: boolean;
  fehlermeldung?: string | undefined;
  onSpeichern: (angaben: LebensmittelAngaben, freigeben: () => void) => void;
  onAbbrechen: () => void;
  /** Zerstörendes leise am Ende (DESIGN.md Regel 10). */
  unten?: ReactNode;
  beschriftung: string;
}) {
  const [werte, setWerte] = useState<LebensmittelWerte>(anfang);
  const [fehler, setFehler] = useState<Partial<Record<LebensmittelFeld, string>>>({});
  const geaendert = JSON.stringify(werte) !== JSON.stringify(anfang);
  const { freigeben, schutz } = useTextverlustschutz({
    ungespeichert: geaendert,
    texte: EINGABETEXTE,
  });

  function feld(name: LebensmittelFeld, zusatz: { zahl?: boolean; hint?: string } = {}) {
    return (
      <Field
        feldId={feldId(name)}
        label={LEBENSMITTEL_BESCHRIFTUNG[name]}
        {...(zusatz.hint ? { hint: zusatz.hint } : {})}
        {...(zusatz.zahl ? { inputMode: 'decimal' as const } : {})}
        autoComplete="off"
        value={werte[name]}
        error={fehler[name]}
        onChange={(event) => setWerte((w) => ({ ...w, [name]: event.target.value }))}
      />
    );
  }

  function absenden(event: FormEvent) {
    event.preventDefault();
    const ergebnis = lebensmittelPruefen(werte);
    if ('fehler' in ergebnis) {
      setFehler(ergebnis.fehler);
      return;
    }
    setFehler({});
    onSpeichern(ergebnis.angaben, freigeben);
  }

  const je = `je ${bezug(werte.base_unit)}`;
  const weitereOffen = Boolean(
    fehler.sugar_g || fehler.fibre_g || fehler.saturated_fat_g || fehler.salt_g,
  );
  return (
    <>
      <form onSubmit={absenden} noValidate className="max-w-formular" aria-label={beschriftung}>
        <Fehlerzusammenfassung
          fehler={alsFormularfehler(LEBENSMITTEL_FELDER, LEBENSMITTEL_BESCHRIFTUNG, fehler, feldId)}
        />
        <Section titel="Lebensmittel">
          <Feldgruppe>
            {feld('name')}
            {feld('brand')}
          </Feldgruppe>
        </Section>
        <Section titel={`Nährwerte ${je}`}>
          <Feldgruppe>
            <Segment
              beschriftung="Die Werte gelten"
              wahlen={[
                { wert: 'g', text: 'je 100 g' },
                { wert: 'ml', text: 'je 100 ml' },
              ]}
              gewaehlt={werte.base_unit}
              onWaehlen={(einheit: Lebensmittel['base_unit']) =>
                setWerte((w) => ({ ...w, base_unit: einheit }))
              }
            />
            {feld('energy_kcal', { zahl: true })}
            {feld('protein_g', { zahl: true })}
            {feld('fat_g', { zahl: true })}
            {feld('carbohydrate_g', { zahl: true })}
            <Disclosure summary="Weitere Nährwerte" offen={weitereOffen}>
              <Feldgruppe>
                {feld('saturated_fat_g', { zahl: true })}
                {feld('sugar_g', { zahl: true })}
                {feld('fibre_g', { zahl: true })}
                {feld('salt_g', { zahl: true })}
              </Feldgruppe>
            </Disclosure>
          </Feldgruppe>
        </Section>
        <Section titel="Portion">
          <Feldgruppe>
            {feld('portion_label', { hint: 'etwa „1 Riegel“' })}
            {feld('portion_amount', { zahl: true, hint: `in ${werte.base_unit}` })}
          </Feldgruppe>
        </Section>
        {fehlermeldung ? (
          <Statusmeldung ton="fehler" className="mt-4">
            {fehlermeldung}
          </Statusmeldung>
        ) : null}
        <Formularfuss>
          <Button type="submit" disabled={laeuft}>
            {laeuft ? 'Wird gespeichert …' : speichernText}
          </Button>
          <Button type="button" variant="quiet" onClick={onAbbrechen}>
            Abbrechen
          </Button>
        </Formularfuss>
        {schutz}
      </form>
      {unten ? <div className="max-w-formular mt-8">{unten}</div> : null}
    </>
  );
}
