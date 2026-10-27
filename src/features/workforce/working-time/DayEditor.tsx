import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import {
  BREAK_CHOICES,
  FREE_DAY,
  formFromBlocks,
  needsBreak,
  suggestedEnd,
  withBreak,
  withoutBreak,
  type DayForm,
} from './dayForm';
import { workMinutes, type Block } from './rules';

/**
 * Ein Tag zum Ändern (G8, ANN-592): Beginn und Ende, dazu - wenn es sie gibt -
 * die Pause mit Lage und Dauer. „Pause einfügen“ erscheint erst, wenn der Tag
 * über 6 Stunden geht; kürzt eine längere Pause als bisher die Arbeitszeit,
 * steht der Vorschlag für das spätere Ende da, übernommen auf Tipp. Ein
 * früherer Schluss ist kein Anlass dafür - der Vorschlag nähme ihn zurück
 * (Praxis-Review Überholung 8).
 *
 * `freeAllowed` nur im Wochenplan: Dort dürfen Stunden zwischen den Tagen
 * wandern, ein Tag kann frei werden oder dazukommen. „Tag frei“ steht leise
 * am Ende, getrennt von der Pause; „Arbeitszeit eintragen“ bringt danach die
 * bisherigen Zeiten des Tages zurück.
 */
export function DayEditor({
  id,
  form,
  previous,
  freeAllowed,
  onChange,
}: {
  /** Vorsilbe für die Feldkennungen. */
  id: string;
  form: DayForm;
  /** Der Tag bisher - für den Vorschlag zum Ende und „Arbeitszeit eintragen“. */
  previous: readonly Block[];
  freeAllowed: boolean;
  onChange: (form: DayForm) => void;
}) {
  const previousForm = previous.length > 0 ? formFromBlocks(previous) : null;
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
            onChange(
              previousForm ?? {
                start: '08:00',
                end: '12:00',
                breakStart: null,
                breakMinutes: null,
              },
            )
          }
        >
          Arbeitszeit eintragen
        </Button>
      </div>
    );
  }

  const later =
    (form.breakMinutes ?? 0) > (previousForm?.breakMinutes ?? 0)
      ? suggestedEnd(form, workMinutes(previous))
      : null;
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
        <div className="flex flex-col gap-2">
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
          <div className="flex justify-end">
            <Button variant="quiet" groesse="kompakt" onClick={() => onChange(withoutBreak(form))}>
              Pause entfernen
            </Button>
          </div>
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

      {freeAllowed ? (
        <div className="border-line border-t pt-4">
          <Button variant="quiet" groesse="kompakt" onClick={() => onChange({ ...FREE_DAY })}>
            Tag frei
          </Button>
        </div>
      ) : null}
    </div>
  );
}
