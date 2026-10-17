import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import {
  BREAK_CHOICES,
  FREE_DAY,
  needsBreak,
  suggestedEnd,
  withBreak,
  withoutBreak,
  type DayForm,
} from './dayForm';

/**
 * Ein Tag zum Ändern (G8, ANN-592): Beginn und Ende, dazu - wenn es sie gibt -
 * die Pause mit Lage und Dauer. „Pause einfügen“ erscheint erst, wenn der Tag
 * über 6 Stunden geht; kürzt eine längere Pause die Arbeitszeit, steht der
 * Vorschlag für das spätere Ende da, übernommen auf Tipp.
 *
 * `freiMoeglich` nur im Wochenplan: Dort dürfen Stunden zwischen den Tagen
 * wandern, ein Tag kann frei werden oder dazukommen.
 */
export function DayEditor({
  id,
  form,
  previousMinutes,
  freeAllowed,
  onChange,
}: {
  /** Vorsilbe für die Feldkennungen. */
  id: string;
  form: DayForm;
  /** Was dieser Tag bisher an Arbeit hatte - für den Vorschlag zum Ende. */
  previousMinutes: number;
  freeAllowed: boolean;
  onChange: (form: DayForm) => void;
}) {
  const free = form.start === '' && form.end === '' && form.breakStart === null;
  if (free) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-ink text-liste">An diesem Tag frei.</p>
        <Button
          variant="secondary"
          className="w-full"
          data-autofocus
          onClick={() =>
            onChange({ start: '08:00', end: '12:00', breakStart: null, breakMinutes: null })
          }
        >
          Arbeitszeit eintragen
        </Button>
      </div>
    );
  }

  const later = suggestedEnd(form, previousMinutes);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Beginn"
          feldId={`${id}-beginn`}
          type="time"
          value={form.start}
          data-autofocus
          onChange={(e) => onChange({ ...form, start: e.target.value })}
        />
        <Field
          label="Ende"
          feldId={`${id}-ende`}
          type="time"
          value={form.end}
          onChange={(e) => onChange({ ...form, end: e.target.value })}
        />
      </div>

      {form.breakStart !== null ? (
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Pause ab"
            feldId={`${id}-pause`}
            type="time"
            value={form.breakStart}
            onChange={(e) => onChange({ ...form, breakStart: e.target.value })}
          />
          <Select
            label="Dauer der Pause"
            feldId={`${id}-dauer`}
            value={String(form.breakMinutes ?? 30)}
            onChange={(e) => onChange({ ...form, breakMinutes: Number(e.target.value) })}
          >
            {[...new Set([...BREAK_CHOICES, form.breakMinutes ?? 30])]
              .sort((a, b) => a - b)
              .map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} Minuten
                </option>
              ))}
          </Select>
        </div>
      ) : null}

      {later ? (
        <div className="flex flex-col gap-2">
          <p className="text-ink text-sm">Mit der längeren Pause fehlt Arbeitszeit.</p>
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => onChange({ ...form, end: later })}
          >
            Ende auf {later} setzen
          </Button>
        </div>
      ) : null}

      {needsBreak(form) ? (
        <div className="flex flex-col gap-2">
          <p className="text-ink text-sm">Über 6 Stunden braucht der Tag eine Pause.</p>
          <Button variant="secondary" className="w-full" onClick={() => onChange(withBreak(form))}>
            Pause einfügen
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {form.breakStart !== null ? (
          <Button variant="quiet" groesse="kompakt" onClick={() => onChange(withoutBreak(form))}>
            Pause entfernen
          </Button>
        ) : null}
        {freeAllowed ? (
          <Button variant="quiet" groesse="kompakt" onClick={() => onChange({ ...FREE_DAY })}>
            Tag frei
          </Button>
        ) : null}
      </div>
    </div>
  );
}
