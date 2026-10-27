import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Field } from '@/components/ui/Field';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Feldgruppe, Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TextArea } from '@/components/ui/TextArea';
import { canManageWorkingHours, type CurrentUser } from '@/features/core/session/types';
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
  { value: 1, label: 'Montag', kurz: 'Mo' },
  { value: 2, label: 'Dienstag', kurz: 'Di' },
  { value: 3, label: 'Mittwoch', kurz: 'Mi' },
  { value: 4, label: 'Donnerstag', kurz: 'Do' },
  { value: 5, label: 'Freitag', kurz: 'Fr' },
  { value: 6, label: 'Samstag', kurz: 'Sa' },
  { value: 7, label: 'Sonntag', kurz: 'So' },
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
  const [removeError, setRemoveError] = useState<string | undefined>();

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
    <>
      <form onSubmit={submit} noValidate className="max-w-formular">
        <Feldgruppe>
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
            {/* Der Satz ändert die Eingabe: Er sagt, was ein Haken bedeutet. */}
            <p className="text-ink-muted mt-1 text-sm">
              Vormittag heißt Beginn vor 12 Uhr, Nachmittag Beginn ab 12 Uhr.
            </p>
            <div className="mt-2 flex flex-col gap-1">
              {WEEKDAYS.map((day) => {
                const [am, pm] = grid[day.value] ?? [false, false];
                return (
                  // Am Telefon der Tag kurz: „Nachmittag“ passte sonst nicht
                  // neben „Donnerstag“ und lief über die Karte hinaus. Die
                  // Kästchen tragen den vollen Namen (aria-label).
                  <div
                    key={day.value}
                    className="grid grid-cols-[2.5rem_1fr_1fr] items-center gap-2 sm:grid-cols-[7rem_1fr_1fr]"
                  >
                    <span aria-hidden="true" className="text-ink text-sm">
                      <span className="sm:hidden">{day.kurz}</span>
                      <span className="max-sm:hidden">{day.label}</span>
                    </span>
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
        </Feldgruppe>
        {mutation.error ? (
          <Statusmeldung ton="fehler" className="mt-4">
            {mutation.error.message}
          </Statusmeldung>
        ) : null}
        <Formularfuss>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Wird gespeichert …' : 'Gebiet speichern'}
          </Button>
          <Button type="button" variant="quiet" onClick={onDone}>
            Abbrechen
          </Button>
        </Formularfuss>
      </form>

      {/* Zerstörendes leise am Ende des Formulars, mit Rückfrage
          (DESIGN.md, Lücke 9.16). */}
      {territory ? (
        <div className="border-line mt-6 flex border-t pt-4">
          <Rueckfrage
            ausloeser="Gebiet entfernen"
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
  );
}

/**
 * Gebietstage (PRX-002), Seitentyp „Liste“ (DESIGN.md).
 *
 * Die Praxis ordnet Postleitzahlen festen Tagen zu. Beim Hausbesuch sagt das
 * Terminformular, ob der Termin im Gebietstag liegt; die Terminsuche stellt
 * solche Vorschläge nach vorn. Eine Vorbelegung, keine Optimierung — und
 * keine Auswertung über Personen (B6).
 *
 * Jedes Gebiet ist eine Zeile; „Bearbeiten“ öffnet das Formular an ihrer
 * Stelle, „Entfernen“ steht leise an dessen Ende.
 */
export function TerritoriesPage({ user }: { user: CurrentUser }) {
  const mayEdit = canManageWorkingHours(user.roles);
  const [editing, setEditing] = useState<string | null>(null);

  const abfrage = useQuery({
    queryKey: ['territories'],
    queryFn: fetchTerritories,
    retry: false,
  });

  return (
    <>
      <PageHeader
        title="Gebietstage"
        actions={
          mayEdit && editing === null ? (
            <Button type="button" onClick={() => setEditing('new')}>
              Gebiet anlegen
            </Button>
          ) : undefined
        }
      />

      {editing === 'new' ? (
        <Section titel="Neues Gebiet">
          <TerritoryForm territory={null} onDone={() => setEditing(null)} />
        </Section>
      ) : null}

      <div className={editing === 'new' ? 'mt-8' : ''}>
        <Abfragezustand
          abfrage={abfrage}
          laden="Gebiete werden geladen …"
          fehler="Die Gebiete konnten nicht geladen werden."
          inKarte
          // Während ein neues Gebiet entsteht, steht kein Leerzustand darunter.
          leer={{
            wenn: (gebiete) => gebiete.length === 0 && editing !== 'new',
            titel: 'Noch keine Gebiete',
            beschreibung:
              'Ohne Gebiete gibt es keinen Hinweis beim Hausbesuch, und die Terminsuche ordnet nur nach Datum.',
          }}
        >
          {(gebiete) =>
            gebiete.length === 0 ? null : (
              <ListRows>
                {gebiete.map((territory) =>
                  editing === territory.id ? (
                    // Bearbeitet wird an der Stelle der Zeile.
                    <li key={territory.id} className="border-line border-t py-4 first:border-t-0">
                      <TerritoryForm territory={territory} onDone={() => setEditing(null)} />
                    </li>
                  ) : (
                    <ListRow
                      key={territory.id}
                      titel={territory.name}
                      meta={
                        <>
                          <span className="text-ink block">
                            {dayPartsText(territory.day_parts)}
                          </span>
                          <span className="block break-words">
                            {territory.postal_codes.length > 0
                              ? territory.postal_codes.join(', ')
                              : 'Keine Postleitzahlen'}
                          </span>
                        </>
                      }
                      aktion={
                        mayEdit && editing === null ? (
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setEditing(territory.id)}
                          >
                            Bearbeiten
                            <span className="sr-only">: {territory.name}</span>
                          </Button>
                        ) : undefined
                      }
                    />
                  ),
                )}
              </ListRows>
            )
          }
        </Abfragezustand>
      </div>

      {/* Was die Regel bewirkt - und was nicht. Ohne Gebiete sagt es der
          Leerzustand. */}
      {abfrage.data && abfrage.data.length > 0 ? (
        <Kleingedrucktes className="mt-8">
          Gebietstage warnen beim Hausbesuch; sie verbieten nichts.
        </Kleingedrucktes>
      ) : null}
    </>
  );
}
