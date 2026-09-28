import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TextArea } from '@/components/ui/TextArea';
import { canManageWorkingHours, type CurrentUser } from '@/features/session/types';
import {
  dayPartsText,
  fetchTerritories,
  parsePostalCodes,
  removeTerritory,
  saveTerritory,
  type DayPart,
  type Territory,
} from './api';

const WEEKDAYS = [
  { value: 1, label: 'Montag' },
  { value: 2, label: 'Dienstag' },
  { value: 3, label: 'Mittwoch' },
  { value: 4, label: 'Donnerstag' },
  { value: 5, label: 'Freitag' },
  { value: 6, label: 'Samstag' },
  { value: 7, label: 'Sonntag' },
];

/** Häkchen je Wochentag und Hälfte: [Vormittag, Nachmittag]. */
type Grid = Record<number, [boolean, boolean]>;

function toGrid(parts: readonly DayPart[]): Grid {
  const grid: Grid = {};
  for (const day of WEEKDAYS) grid[day.value] = [false, false];
  for (const p of parts) {
    const cell = grid[p.weekday]!;
    if (p.part === 'am' || p.part === 'day') cell[0] = true;
    if (p.part === 'pm' || p.part === 'day') cell[1] = true;
  }
  return grid;
}

/** Beide Hälften angehakt heißt ganztags. */
function fromGrid(grid: Grid): DayPart[] {
  const parts: DayPart[] = [];
  for (const day of WEEKDAYS) {
    const [am, pm] = grid[day.value] ?? [false, false];
    if (am && pm) parts.push({ weekday: day.value, part: 'day' });
    else if (am) parts.push({ weekday: day.value, part: 'am' });
    else if (pm) parts.push({ weekday: day.value, part: 'pm' });
  }
  return parts;
}

function TerritoryForm({ territory, onDone }: { territory: Territory | null; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(territory?.name ?? '');
  const [codes, setCodes] = useState(territory?.postal_codes.join(', ') ?? '');
  const [grid, setGrid] = useState<Grid>(() => toGrid(territory?.day_parts ?? []));
  const [errors, setErrors] = useState<{ name?: string; codes?: string }>({});

  const mutation = useMutation({
    mutationFn: (values: { name: string; postalCodes: string[]; dayParts: DayPart[] }) =>
      saveTerritory(territory, values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['territories'] });
      await queryClient.invalidateQueries({ queryKey: ['territory-check'] });
      onDone();
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending) return;
    const parsed = parsePostalCodes(codes);
    const found: { name?: string; codes?: string } = {};
    if (name.trim() === '') found.name = 'Bitte einen Namen angeben, etwa „Nord“.';
    if (parsed.invalid.length > 0) {
      found.codes = `Keine Postleitzahl: ${parsed.invalid.join(', ')}. Fünf Ziffern, getrennt durch Komma oder Leerzeichen.`;
    }
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    mutation.mutate({ name: name.trim(), postalCodes: parsed.codes, dayParts: fromGrid(grid) });
  }

  return (
    <form onSubmit={submit} noValidate className="flex max-w-xl flex-col gap-4">
      <Field
        label="Name des Gebiets"
        value={name}
        maxLength={60}
        onChange={(e) => setName(e.target.value)}
        error={errors.name}
      />
      <TextArea
        label="Postleitzahlen"
        hint="Getrennt durch Komma oder Leerzeichen. Eine Postleitzahl gehört zu höchstens einem Gebiet."
        rows={2}
        value={codes}
        onChange={(e) => setCodes(e.target.value)}
        error={errors.codes}
      />
      <fieldset>
        <legend className="text-ink text-sm font-medium">Gebietstage</legend>
        <p className="text-ink-muted mt-1 text-sm">
          Vormittag heißt Beginn vor 12 Uhr, Nachmittag Beginn ab 12 Uhr.
        </p>
        <div className="mt-2 flex flex-col gap-1">
          {WEEKDAYS.map((day) => {
            const [am, pm] = grid[day.value] ?? [false, false];
            return (
              <div key={day.value} className="grid grid-cols-[7rem_1fr_1fr] items-center gap-2">
                <span className="text-ink text-sm">{day.label}</span>
                <Checkbox
                  label="Vormittag"
                  checked={am}
                  onChange={(e) =>
                    setGrid((before) => ({ ...before, [day.value]: [e.target.checked, pm] }))
                  }
                  aria-label={`${day.label} Vormittag`}
                />
                <Checkbox
                  label="Nachmittag"
                  checked={pm}
                  onChange={(e) =>
                    setGrid((before) => ({ ...before, [day.value]: [am, e.target.checked] }))
                  }
                  aria-label={`${day.label} Nachmittag`}
                />
              </div>
            );
          })}
        </div>
      </fieldset>
      {mutation.error ? <Statusmeldung ton="fehler">{mutation.error.message}</Statusmeldung> : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Wird gespeichert …' : 'Gebiet speichern'}
        </Button>
        <Button type="button" variant="quiet" onClick={onDone}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}

/**
 * Gebietstage (PRX-002).
 *
 * Die Praxis ordnet Postleitzahlen festen Tagen zu. Beim Hausbesuch sagt das
 * Terminformular, ob der Termin im Gebietstag liegt; die Terminsuche stellt
 * solche Vorschläge nach vorn. Eine Vorbelegung, keine Optimierung — und
 * keine Auswertung über Personen (B6).
 */
export function TerritoriesPage({ user }: { user: CurrentUser }) {
  const queryClient = useQueryClient();
  const mayEdit = canManageWorkingHours(user.roles);
  const [editing, setEditing] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | undefined>();

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['territories'],
    queryFn: fetchTerritories,
    retry: false,
  });

  return (
    <>
      <PageHeader
        title="Gebietstage"
        description="Welche Postleitzahlen an welchen Tagen dran sind. Die Regel warnt beim Hausbesuch, sie verbietet nichts."
        actions={
          mayEdit && editing === null ? (
            <Button type="button" onClick={() => setEditing('new')}>
              Gebiet anlegen
            </Button>
          ) : undefined
        }
      />

      {editing === 'new' ? (
        <Section titel="Neues Gebiet" rahmen>
          <TerritoryForm territory={null} onDone={() => setEditing(null)} />
        </Section>
      ) : null}

      {isPending ? <LoadingState label="Gebiete werden geladen …" /> : null}
      {isError ? (
        <ErrorState
          title="Die Gebiete konnten nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => void refetch()}
        />
      ) : null}
      {data && data.length === 0 && editing !== 'new' ? (
        <EmptyState
          title="Noch keine Gebiete"
          description="Ohne Gebiete gibt es keinen Hinweis beim Hausbesuch, und die Terminsuche ordnet nur nach Datum."
        />
      ) : null}

      {data && data.length > 0 ? (
        <ul className="mt-6 flex flex-col gap-4">
          {data.map((territory) => (
            <li key={territory.id} className="border-line bg-surface rounded-card border p-4">
              {editing === territory.id ? (
                <TerritoryForm territory={territory} onDone={() => setEditing(null)} />
              ) : (
                <>
                  <h2 className="text-ink text-liste font-medium">{territory.name}</h2>
                  <p className="text-ink mt-1 text-sm">{dayPartsText(territory.day_parts)}</p>
                  <p className="text-ink-muted mt-1 text-sm break-words">
                    {territory.postal_codes.length > 0
                      ? territory.postal_codes.join(', ')
                      : 'Keine Postleitzahlen'}
                  </p>
                  {mayEdit ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        groesse="kompakt"
                        onClick={() => setEditing(territory.id)}
                      >
                        Bearbeiten
                      </Button>
                      <Rueckfrage
                        ausloeser="Entfernen"
                        ausloeserVariante="quiet"
                        bestaetigen="Gebiet entfernen"
                        fehler={removeError}
                        onAbbrechen={() => setRemoveError(undefined)}
                        onBestaetigen={async () => {
                          try {
                            await removeTerritory(territory.id);
                            await queryClient.invalidateQueries({ queryKey: ['territories'] });
                          } catch (caught) {
                            setRemoveError(caught instanceof Error ? caught.message : undefined);
                            throw caught;
                          }
                        }}
                      >
                        Gebiet „{territory.name}“ entfernen? Termine bleiben, wie sie sind.
                      </Rueckfrage>
                    </div>
                  ) : null}
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
