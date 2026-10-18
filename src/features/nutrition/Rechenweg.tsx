import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Disclosure } from '@/components/ui/Card';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import {
  EIWEISS_GRUNDLAGE,
  EINGABE_TEXTE,
  energieRegel,
  FEHLT_TEXTE,
  GESCHLECHT_TEXTE,
  GRUNDUMSATZ_FORMELN,
  kg,
  liter,
  palText,
  zahl,
} from './texte';
import type { BerechneteZielwerte, Zielwerte } from './zielwerte';

/**
 * Zielwerte mit Rechenweg (ERN-001, ADR-006 Punkt 14 b: Formel, Eingaben und
 * Rechenweg neben dem Ergebnis).
 *
 * Gerechnet hat der Server (`app.nutrition_calculation`); hier wird nur
 * angezeigt, was er zurückgibt - auch die Faktoren der Formeln. Eine
 * Überschreibung der Beratung steht als solche da, ebenso ein Wert unter dem
 * Grundumsatz oder ein Zielgewicht unter BMI 18,5 (ADR-027 Punkt 22) - als
 * Angabe zur Zahl, ohne Aussage über die Gesundheit.
 *
 * Ohne Datenzugriff: Die Plattform zeigt dieselbe Anzeige (ADR-023 Punkt 26).
 */
export function Zielwertliste({ zielwerte }: { zielwerte: Zielwerte }) {
  if (zielwerte.status === 'missing') {
    return (
      <p className="text-ink-muted text-liste">
        Für Zielwerte fehlt noch:{' '}
        {zielwerte.missing.map((feld) => FEHLT_TEXTE[feld] ?? feld).join(', ')}.
      </p>
    );
  }
  const z = zielwerte;
  return (
    <>
      <DetailList>
        <DetailRow label="Energie">
          <Wert ueberschrieben={z.energy.overridden}>{zahl(z.energy.kcal)} kcal</Wert>
          {z.energy.below_bmr ? (
            <Badge ton="warnung" eigenesZeichen="!">
              unter dem Grundumsatz
            </Badge>
          ) : null}
        </DetailRow>
        <DetailRow label="Eiweiß">
          <Wert ueberschrieben={z.protein.overridden}>{zahl(z.protein.g)} g</Wert>
        </DetailRow>
        <DetailRow label="Kohlenhydrate">
          <Wert ueberschrieben={z.carbohydrate.overridden}>{zahl(z.carbohydrate.g)} g</Wert>
        </DetailRow>
        <DetailRow label="Fett">
          <Wert ueberschrieben={z.fat.overridden}>{zahl(z.fat.g)} g</Wert>
        </DetailRow>
        <DetailRow label="Wasser">
          <Wert ueberschrieben={z.water.overridden}>{liter(z.water.ml)}</Wert>
        </DetailRow>
        {z.target_weight.kg !== null ? (
          <DetailRow label="Zielgewicht">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {kg(z.target_weight.kg)}
              {z.target_weight.weeks !== null ? (
                <span className="text-ink-muted">
                  · rechnerisch etwa {zahl(z.target_weight.weeks)} Wochen
                </span>
              ) : null}
              {z.target_weight.below_floor ? (
                <Badge ton="warnung" eigenesZeichen="!">
                  unter BMI {zahl(z.target_weight.bmi_floor, 1)}
                </Badge>
              ) : null}
            </span>
          </DetailRow>
        ) : null}
      </DetailList>
      <div className="mt-3">
        <Disclosure summary="Rechenweg">
          <Rechenweg z={z} />
        </Disclosure>
      </div>
    </>
  );
}

function Wert({ ueberschrieben, children }: { ueberschrieben: boolean; children: ReactNode }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {children}
      {ueberschrieben ? <Badge ton="akzent">von der Beratung gesetzt</Badge> : null}
    </span>
  );
}

function eingabe(z: BerechneteZielwerte, schluessel: string): string {
  const text = EINGABE_TEXTE[schluessel]!;
  const wert =
    schluessel === 'weight_kg'
      ? zahl(z.inputs.weight_kg, 1)
      : schluessel === 'height_cm'
        ? zahl(z.inputs.height_cm)
        : schluessel === 'age_years'
          ? zahl(z.inputs.age_years)
          : zahl(z.bmr.lean_mass_kg ?? 0, 1);
  return `${wert} ${text.einheit}`;
}

/** Ein Faktor ohne überflüssige Nullen: 10, 6,25, 88,362. */
function faktor(wert: number): string {
  return zahl(wert, 3).replace(/,?0+$/, '');
}

/** „10 × 80,0 kg + 6,25 × 180 cm − 5 × 35 Jahre + 5 = 1755 kcal“ */
function formelzeile(
  z: BerechneteZielwerte,
  variante: BerechneteZielwerte['bmr']['variants'][number],
): string {
  const glied = (wert: number, rest: string) =>
    `${wert < 0 ? '−' : '+'} ${faktor(Math.abs(wert))}${rest}`;
  const terme = variante.terms.map((term) => glied(term.factor, ` × ${eingabe(z, term.input)}`));
  const konstante = glied(variante.constant, '');
  // Bei Mifflin-St Jeor ist die Konstante der Zuschlag am Ende, sonst der Anfang.
  const glieder =
    z.bmr.formula === 'mifflin_st_jeor' ? [...terme, konstante] : [konstante, ...terme];
  return `${glieder.join(' ').replace(/^\+ /, '')} = ${zahl(variante.kcal)} kcal`;
}

function Rechenweg({ z }: { z: BerechneteZielwerte }) {
  const e = z.energy;
  return (
    <dl className="text-liste flex flex-col gap-3">
      <Schritt titel={`Grundumsatz nach ${GRUNDUMSATZ_FORMELN[z.bmr.formula]}`}>
        {z.bmr.lean_mass_kg !== null && z.inputs.body_fat_percent !== null ? (
          <span className="block">
            fettfreie Masse = {zahl(z.inputs.weight_kg, 1)} kg × (1 −{' '}
            {zahl(z.inputs.body_fat_percent, 1)} %) = {zahl(z.bmr.lean_mass_kg, 1)} kg
          </span>
        ) : null}
        {z.bmr.variants.map((variante) => (
          <span key={variante.sex ?? 'ohne'} className="block">
            {z.bmr.averaged && variante.sex ? `${GESCHLECHT_TEXTE[variante.sex]}: ` : ''}
            {formelzeile(z, variante)}
          </span>
        ))}
        {z.bmr.averaged ? (
          <span className="block">
            Ohne Angabe des Geschlechts: Mittel beider Varianten = {zahl(z.bmr.kcal)} kcal
          </span>
        ) : null}
      </Schritt>
      <Schritt titel="Gesamtumsatz">
        {zahl(z.bmr.kcal)} kcal × PAL {palText(z.tee.pal)} = {zahl(z.tee.kcal)} kcal
      </Schritt>
      <Schritt titel="Energieziel">
        <span className="block">
          {energieRegel(z)} = {zahl(e.computed_kcal)} kcal
        </span>
        {e.floor_applied ? (
          <span className="block">nicht unter dem Grundumsatz: {zahl(z.bmr.kcal)} kcal</span>
        ) : null}
        {e.overridden ? (
          <span className="block">von der Beratung gesetzt: {zahl(e.kcal)} kcal</span>
        ) : null}
      </Schritt>
      <Schritt titel="Eiweiß">
        {zahl(z.protein.g_per_kg, 1)} g je kg ({EIWEISS_GRUNDLAGE[z.protein.basis]}) ×{' '}
        {zahl(z.inputs.weight_kg, 1)} kg = {zahl(z.protein.computed_g)} g
        {z.protein.overridden ? `; von der Beratung gesetzt: ${zahl(z.protein.g)} g` : ''}
      </Schritt>
      <Schritt titel="Fett">
        {zahl(z.fat.share * 100)} % von {zahl(e.kcal)} kcal ÷ {zahl(z.fat.kcal_per_g)} kcal je g ={' '}
        {zahl(z.fat.overridden ? z.fat.computed_g : z.fat.g)} g
        {z.fat.overridden ? `; von der Beratung gesetzt: ${zahl(z.fat.g)} g` : ''}
      </Schritt>
      <Schritt titel="Kohlenhydrate">
        der Rest: ({zahl(e.kcal)} − {zahl(z.protein.kcal_per_g)} × {zahl(z.protein.g)} −{' '}
        {zahl(z.fat.kcal_per_g)} × {zahl(z.fat.g)}) ÷ {zahl(z.carbohydrate.kcal_per_g)} kcal je g
        {z.carbohydrate.overridden
          ? `; von der Beratung gesetzt: ${zahl(z.carbohydrate.g)} g`
          : ` = ${zahl(z.carbohydrate.g)} g`}
      </Schritt>
      <Schritt titel="Wasser">
        {zahl(z.water.ml_per_kg)} ml × {zahl(z.inputs.weight_kg, 1)} kg, mindestens{' '}
        {liter(z.water.minimum_ml)} = {liter(z.water.computed_ml)}
        {z.water.overridden ? `; von der Beratung gesetzt: ${liter(z.water.ml)}` : ''}
      </Schritt>
      <Schritt titel="Zielgewicht">
        <span className="block">
          nicht unter BMI {zahl(z.target_weight.bmi_floor, 1)}: {kg(z.target_weight.floor_kg)} bei{' '}
          {zahl(z.inputs.height_cm)} cm
        </span>
        {z.target_weight.kg !== null && z.target_weight.weeks !== null ? (
          <span className="block">
            ({zahl(z.inputs.weight_kg, 1)} − {zahl(z.target_weight.kg, 1)}) kg ×{' '}
            {zahl(z.target_weight.kcal_per_kg)} kcal ÷ {zahl(Math.abs(z.tee.kcal - e.kcal))} kcal am
            Tag ≈ {zahl(z.target_weight.weeks)} Wochen, ohne Gewähr
          </span>
        ) : null}
      </Schritt>
    </dl>
  );
}

function Schritt({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-ink-muted text-sm">{titel}</dt>
      <dd className="text-ink wrap-anywhere">{children}</dd>
    </div>
  );
}
