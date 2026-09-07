import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { TextArea } from '@/components/ui/TextArea';
import {
  prescriberLabel,
  prescriptionKindLabels,
  type PositionEingabe,
  type Prescriber,
  type PrescriptionFeld,
} from './api';

export type PositionsFehler = Partial<Record<keyof PositionEingabe, string>>;

function Abschnitt({
  titel,
  hinweis,
  children,
}: {
  titel: string;
  hinweis?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8 first:mt-0">
      <h2 className="text-ink-muted text-sm font-semibold tracking-wide uppercase">{titel}</h2>
      {hinweis ? <p className="text-ink-muted mt-1 max-w-prose text-sm">{hinweis}</p> : null}
      <div className="mt-3 flex flex-col gap-4">{children}</div>
    </section>
  );
}

/**
 * Eingabefelder einer Verordnung.
 *
 * Die Positionen sind der eigentliche Inhalt: sie tragen das Kontingent, wegen
 * dessen eine Verordnung im Alltag überhaupt aufgeschlagen wird. „Genutzt"
 * pflegt die Praxis bis auf Weiteres selbst (ANN-012).
 *
 * ANN-014: Das letzte Feld heißt ausdrücklich „Empfehlung der Therapeut:in zum
 * Verordnungsende". Die Anwendung erzeugt keine Empfehlung — sie nimmt die
 * auf, die eine Therapeut:in selbst formuliert (ADR-006 Punkt 4).
 */
export function PrescriptionFormFields({
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
}: {
  werte: Record<PrescriptionFeld, string>;
  fehler: Partial<Record<PrescriptionFeld, string>>;
  onChange: (feld: PrescriptionFeld, wert: string) => void;
  positionen: PositionEingabe[];
  positionsFehler: PositionsFehler[];
  onPositionChange: (index: number, feld: keyof PositionEingabe, wert: string) => void;
  onPositionHinzufuegen: () => void;
  onPositionEntfernen: (index: number) => void;
  verordnerinnen: Prescriber[];
  verordnerAnlegenZiel: string;
}) {
  return (
    <>
      <Abschnitt titel="Verordnung">
        <Select
          label="Verordner:in *"
          name="prescriber_id"
          required
          value={werte.prescriber_id}
          error={fehler.prescriber_id}
          hint={
            <>
              Fehlt die Praxis?{' '}
              <Link to={verordnerAnlegenZiel} className="text-accent hover:underline">
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
        <Select
          label="Art *"
          name="prescription_kind"
          required
          value={werte.prescription_kind}
          error={fehler.prescription_kind}
          onChange={(event) => onChange('prescription_kind', event.target.value)}
        >
          <option value="first">{prescriptionKindLabels.first}</option>
          <option value="follow_up">{prescriptionKindLabels.follow_up}</option>
        </Select>
        <Field
          label="Ausstellungsdatum *"
          name="issued_on"
          type="date"
          required
          value={werte.issued_on}
          error={fehler.issued_on}
          onChange={(event) => onChange('issued_on', event.target.value)}
        />
        <Field
          label="Frequenz"
          name="frequency_note"
          autoComplete="off"
          hint={'So, wie sie auf dem Rezept steht — etwa „2x pro Woche".'}
          value={werte.frequency_note}
          error={fehler.frequency_note}
          onChange={(event) => onChange('frequency_note', event.target.value)}
        />
      </Abschnitt>

      <Abschnitt
        titel="Positionen"
        hinweis={
          'Je verordnetem Heilmittel eine Position. „Genutzt" wird derzeit von Hand gepflegt; die Restmenge ergibt sich daraus.'
        }
      >
        {positionen.map((position, index) => (
          <fieldset
            key={position.id ?? `neu-${index}`}
            className="border-line rounded-lg border p-4"
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
                  label="Verordnet *"
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
                  onChange={(event) => onPositionChange(index, 'used_quantity', event.target.value)}
                />
              </div>
              {positionen.length > 1 ? (
                <div className="flex">
                  <Button type="button" variant="quiet" onClick={() => onPositionEntfernen(index)}>
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
      </Abschnitt>

      <Abschnitt
        titel="Klinische Angaben"
        hinweis="Für Praxismanagement-Zugänge nicht sichtbar. Der Behandlungsverlauf gehört in die Behandlungsdokumentation, nicht hierher."
      >
        <TextArea
          label="Diagnose oder Leitsymptomatik"
          name="diagnosis"
          rows={3}
          value={werte.diagnosis}
          error={fehler.diagnosis}
          onChange={(event) => onChange('diagnosis', event.target.value)}
        />
        <TextArea
          label="Therapieziel"
          name="therapy_goal"
          rows={2}
          value={werte.therapy_goal}
          error={fehler.therapy_goal}
          onChange={(event) => onChange('therapy_goal', event.target.value)}
        />
        <TextArea
          label="Hinweis der Verordner:in"
          name="prescriber_note"
          rows={2}
          hint="Was auf dem Rezept steht, unverändert übernommen."
          value={werte.prescriber_note}
          error={fehler.prescriber_note}
          onChange={(event) => onChange('prescriber_note', event.target.value)}
        />
        <TextArea
          label="Empfehlung der Therapeut:in zum Verordnungsende"
          name="follow_up_recommendation"
          rows={2}
          hint="Ihre eigene Einschätzung. Die Anwendung erzeugt keine Empfehlung."
          value={werte.follow_up_recommendation}
          error={fehler.follow_up_recommendation}
          onChange={(event) => onChange('follow_up_recommendation', event.target.value)}
        />
      </Abschnitt>

      <Abschnitt titel="Organisatorisch">
        <TextArea
          label="Bemerkung"
          name="note"
          rows={2}
          hint={'Für alle Praxisrollen sichtbar, etwa „Rezept liegt im Ordner".'}
          value={werte.note}
          error={fehler.note}
          onChange={(event) => onChange('note', event.target.value)}
        />
      </Abschnitt>
    </>
  );
}
