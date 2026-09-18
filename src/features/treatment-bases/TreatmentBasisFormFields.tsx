import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { TextArea } from '@/components/ui/TextArea';
import { Feldgruppe, Section } from '@/components/ui/Section';
import {
  BAUARTEN,
  bauartDatumsBeschriftung,
  bauartLabels,
  istVerordnung,
  prescriberLabel,
  type Bauart,
  type PositionEingabe,
  type Prescriber,
  type TreatmentBasisFeld,
} from './api';
import { grundlageFeldId } from './grundlagenfelder';

export type PositionsFehler = Partial<Record<keyof PositionEingabe, string>>;

/**
 * Eingabefelder einer Behandlungsgrundlage.
 *
 * **Die Bauart steht zuerst** (GRD-001, ADR-020): Sie entscheidet, welche
 * Felder danach überhaupt kommen. Eine Verordnung verlangt eine Verordner:in
 * und trägt die klinischen Felder; ein Selbstzahler hat beides nicht — das
 * Formular fragt dort nicht danach, statt leere Felder anzubieten, die niemand
 * ausfüllen soll (ADR-020 Punkt 3 und 4).
 *
 * Die Positionen sind der eigentliche Inhalt: sie tragen das Kontingent, wegen
 * dessen eine Grundlage im Alltag überhaupt aufgeschlagen wird. „Genutzt"
 * pflegt die Praxis bis auf Weiteres selbst (ANN-012).
 *
 * ANN-014: Das letzte Feld heißt ausdrücklich „Empfehlung der Therapeut:in zum
 * Verordnungsende". Die Anwendung erzeugt keine Empfehlung — sie nimmt die
 * auf, die eine Therapeut:in selbst formuliert (ADR-006 Punkt 4).
 */
export function TreatmentBasisFormFields({
  werte,
  fehler,
  onChange,
  positionen,
  positionsFehler,
  onPositionChange,
  onPositionHinzufuegen,
  onPositionEntfernen,
  verordnerinnen,
  verordnerAnlegenZiel,
  onVerordnerAnlegenKlick,
}: {
  werte: Record<TreatmentBasisFeld, string>;
  fehler: Partial<Record<TreatmentBasisFeld, string>>;
  onChange: (feld: TreatmentBasisFeld, wert: string) => void;
  positionen: PositionEingabe[];
  positionsFehler: PositionsFehler[];
  onPositionChange: (index: number, feld: keyof PositionEingabe, wert: string) => void;
  onPositionHinzufuegen: () => void;
  onPositionEntfernen: (index: number) => void;
  verordnerinnen: Prescriber[];
  verordnerAnlegenZiel: string;
  /** Merkt den Formularzustand, bevor die Seite zum Anlegen wechselt (VER-003). */
  onVerordnerAnlegenKlick: () => void;
}) {
  const bauart = werte.treatment_basis_kind as Bauart;
  const verordnung = istVerordnung(bauart);

  return (
    <>
      <Section titel="Behandlungsgrundlage">
        <Feldgruppe>
          <Select
            label="Art *"
            name="treatment_basis_kind"
            feldId={grundlageFeldId('treatment_basis_kind')}
            required
            hint="Eine Verordnung liegt als Rezept vor; ein Selbstzahler vereinbart die Behandlungen mit der Praxis."
            value={werte.treatment_basis_kind}
            error={fehler.treatment_basis_kind}
            onChange={(event) => onChange('treatment_basis_kind', event.target.value)}
          >
            {BAUARTEN.map((wert) => (
              <option key={wert} value={wert}>
                {bauartLabels[wert]}
              </option>
            ))}
          </Select>
          {verordnung ? (
            <Select
              label="Verordner:in *"
              name="prescriber_id"
              feldId={grundlageFeldId('prescriber_id')}
              required
              value={werte.prescriber_id}
              error={fehler.prescriber_id}
              hint={
                <>
                  Fehlt die Praxis?{' '}
                  <Link
                    to={verordnerAnlegenZiel}
                    onClick={onVerordnerAnlegenKlick}
                    className="text-accent hover:underline"
                  >
                    Verordner:in anlegen
                  </Link>
                </>
              }
              onChange={(event) => onChange('prescriber_id', event.target.value)}
            >
              <option value="">Bitte auswählen</option>
              {verordnerinnen.map((verordner) => (
                <option key={verordner.id} value={verordner.id}>
                  {prescriberLabel(verordner)}
                </option>
              ))}
            </Select>
          ) : null}
          <Field
            label={`${bauartDatumsBeschriftung[bauart]} *`}
            name="issued_on"
            feldId={grundlageFeldId('issued_on')}
            type="date"
            required
            value={werte.issued_on}
            error={fehler.issued_on}
            onChange={(event) => onChange('issued_on', event.target.value)}
          />
          <Field
            label="Frequenz"
            name="frequency_note"
            feldId={grundlageFeldId('frequency_note')}
            autoComplete="off"
            hint={
              verordnung
                ? 'So, wie sie auf dem Rezept steht — etwa „2x pro Woche".'
                : 'Wie vereinbart — etwa „1x pro Woche".'
            }
            value={werte.frequency_note}
            error={fehler.frequency_note}
            onChange={(event) => onChange('frequency_note', event.target.value)}
          />
        </Feldgruppe>
      </Section>

      <Section
        titel="Positionen"
        hinweis={
          verordnung
            ? 'Je verordnetem Heilmittel eine Position. „Genutzt" wird derzeit von Hand gepflegt; die Restmenge ergibt sich daraus.'
            : 'Je vereinbartem Heilmittel eine Position. „Genutzt" wird derzeit von Hand gepflegt; die Restmenge ergibt sich daraus.'
        }
      >
        <Feldgruppe>
          {positionen.map((position, index) => (
            <fieldset
              key={position.id ?? `neu-${index}`}
              className="border-line rounded-card border p-4"
            >
              <legend className="text-ink-muted px-1 text-sm">Position {index + 1}</legend>
              <div className="flex flex-col gap-4">
                <Field
                  label="Heilmittel *"
                  name={`remedy-${index}`}
                  autoComplete="off"
                  required
                  value={position.remedy}
                  error={positionsFehler[index]?.remedy}
                  onChange={(event) => onPositionChange(index, 'remedy', event.target.value)}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label={`${verordnung ? 'Verordnet' : 'Vereinbart'} *`}
                    name={`prescribed-${index}`}
                    inputMode="numeric"
                    required
                    value={position.prescribed_quantity}
                    error={positionsFehler[index]?.prescribed_quantity}
                    onChange={(event) =>
                      onPositionChange(index, 'prescribed_quantity', event.target.value)
                    }
                  />
                  <Field
                    label="Genutzt"
                    name={`used-${index}`}
                    inputMode="numeric"
                    value={position.used_quantity}
                    error={positionsFehler[index]?.used_quantity}
                    onChange={(event) =>
                      onPositionChange(index, 'used_quantity', event.target.value)
                    }
                  />
                </div>
                {positionen.length > 1 ? (
                  <div className="flex">
                    <Button
                      type="button"
                      variant="quiet"
                      onClick={() => onPositionEntfernen(index)}
                    >
                      Position {index + 1} entfernen
                    </Button>
                  </div>
                ) : null}
              </div>
            </fieldset>
          ))}
          <div className="flex">
            <Button type="button" variant="secondary" onClick={onPositionHinzufuegen}>
              Position hinzufügen
            </Button>
          </div>
        </Feldgruppe>
      </Section>

      {/* ADR-020 Punkt 4: Die klinischen Felder bleiben klinisch - und beim
          Selbstzahler leer. Sie werden hier nicht angeboten; was beim Wechsel
          der Bauart schon dastand, leert das Formular sichtbar (siehe
          TreatmentBasisFormPage). */}
      {verordnung ? (
        <Section
          titel="Klinische Angaben"
          hinweis="Für Praxismanagement-Zugänge nicht sichtbar. Der Behandlungsverlauf gehört in die Behandlungsdokumentation, nicht hierher."
        >
          <Feldgruppe>
            <TextArea
              label="Diagnose oder Leitsymptomatik"
              name="diagnosis"
              feldId={grundlageFeldId('diagnosis')}
              rows={3}
              value={werte.diagnosis}
              error={fehler.diagnosis}
              onChange={(event) => onChange('diagnosis', event.target.value)}
            />
            <TextArea
              label="Therapieziel"
              name="therapy_goal"
              feldId={grundlageFeldId('therapy_goal')}
              rows={2}
              value={werte.therapy_goal}
              error={fehler.therapy_goal}
              onChange={(event) => onChange('therapy_goal', event.target.value)}
            />
            <TextArea
              label="Hinweis der Verordner:in"
              name="prescriber_note"
              feldId={grundlageFeldId('prescriber_note')}
              rows={2}
              hint="Was auf dem Rezept steht, unverändert übernommen."
              value={werte.prescriber_note}
              error={fehler.prescriber_note}
              onChange={(event) => onChange('prescriber_note', event.target.value)}
            />
            <TextArea
              label="Empfehlung der Therapeut:in zum Verordnungsende"
              name="follow_up_recommendation"
              feldId={grundlageFeldId('follow_up_recommendation')}
              rows={2}
              hint="Ihre eigene Einschätzung. Die Anwendung erzeugt keine Empfehlung."
              value={werte.follow_up_recommendation}
              error={fehler.follow_up_recommendation}
              onChange={(event) => onChange('follow_up_recommendation', event.target.value)}
            />
          </Feldgruppe>
        </Section>
      ) : null}

      <Section titel="Organisatorisch">
        <Feldgruppe>
          <TextArea
            label="Bemerkung"
            name="note"
            feldId={grundlageFeldId('note')}
            rows={2}
            hint={'Für alle Praxisrollen sichtbar, etwa „Rezept liegt im Ordner".'}
            value={werte.note}
            error={fehler.note}
            onChange={(event) => onChange('note', event.target.value)}
          />
        </Feldgruppe>
      </Section>
    </>
  );
}
