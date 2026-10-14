import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Bibliothek, Uebung, Variante } from '@/features/exercises/api';
import { katalogeintrag } from '@/features/exercises/katalog';
import type { Katalogeintrag } from '@/features/exercises/katalog/typen';
import { ZEILEN_JE_SEITE } from '@/features/exercises/suche';
import { OHNE_KATALOG } from '@/features/exercises/testdaten';
import { renderWithProviders } from '@/test-utils';
import { Uebungsauswahl, type Gewaehlt } from './Uebungsauswahl';

/**
 * Das Auswahlblatt (Welle B, ANN-443): Mehrfachauswahl mit Haken, nichts
 * vorausgewählt, Standarddosierung an der Zeile, „schon im Plan“ als Wort.
 */

function variante(id: string, name: string, zusatz: Partial<Variante> = {}): Variante {
  return {
    id,
    name,
    lay_name: `${name} (Alltag)`,
    instruction: null,
    equipment: [],
    common_faults: null,
    practice_notes: null,
    archived: false,
    ...OHNE_KATALOG,
    ...zusatz,
  };
}

function uebung(
  id: string,
  name: string,
  varianten: Variante[],
  region: Uebung['body_region'] = 'knie',
): Uebung {
  return { id, name, lay_name: name, body_region: region, archived: false, variants: varianten };
}

const BIBLIOTHEK: Bibliothek = {
  can_manage: false,
  links: [],
  exercises: [
    uebung(
      'u1',
      'Brücke',
      [
        variante('v1', 'Brücke', {
          catalog_key: 'LW-01',
          default_dosage: {
            sets: 2,
            reps_min: 10,
            reps_max: 10,
            duration_seconds: null,
            hold_seconds: 3,
            per_side: false,
            times_per_day: 1,
          },
        }),
      ],
      'lws',
    ),
    uebung('u2', 'Kniebeuge', [
      variante('v2', 'Kniebeuge am Geländer'),
      variante('v3', 'Kniebeuge frei'),
      variante('v4', 'Kniebeuge alt', { archived: true }),
    ]),
    { ...uebung('u3', 'Beinpresse', [variante('v5', 'Beinpresse')]), archived: true },
  ],
};

function zeigen(
  bibliothek: Bibliothek = BIBLIOTHEK,
  imPlan: ReadonlySet<string> = new Set(),
  onHinzufuegen: (g: Gewaehlt[]) => void = () => undefined,
  katalog: readonly Katalogeintrag[] = [],
  katalogFehlt = false,
) {
  return renderWithProviders(
    <Uebungsauswahl
      bibliothek={bibliothek}
      katalog={katalog}
      katalogFehlt={katalogFehlt}
      imPlan={imPlan}
      laeuft={null}
      fehler={null}
      onHinzufuegen={onHinzufuegen}
      onSchliessen={() => undefined}
    />,
  );
}

describe('Uebungsauswahl', () => {
  it('zeigt jede nicht archivierte Variante mit Standarddosierung - nichts vorausgewählt', () => {
    zeigen(BIBLIOTHEK, new Set(['v3']));
    const blatt = screen.getByRole('dialog', { name: 'Übungen hinzufügen' });
    const haken = within(blatt).getAllByRole('checkbox');
    expect(haken).toHaveLength(3);
    expect(haken.every((k) => !(k as HTMLInputElement).checked)).toBe(true);
    expect(within(blatt).getByRole('checkbox', { name: /^Brücke/ })).toHaveAccessibleName(
      /Lendenwirbelsäule · 2 × 10 · 3 s halten · 1× täglich · ungeprüft/,
    );
    // Eigene Übung ohne Standarddosierung: die bisherige Vorbelegung.
    expect(
      within(blatt).getByRole('checkbox', { name: /Kniebeuge am Geländer/ }),
    ).toHaveAccessibleName(/3 × 10–12/);
    expect(within(blatt).getByRole('checkbox', { name: /Kniebeuge frei/ })).toHaveAccessibleName(
      /schon im Plan/,
    );
    expect(within(blatt).queryByRole('checkbox', { name: /Kniebeuge alt|Beinpresse/ })).toBeNull();
    expect(within(blatt).getByRole('button', { name: 'Hinzufügen' })).toBeDisabled();
  });

  it('gibt die gewählten in der Reihenfolge der Wahl weiter', async () => {
    const user = userEvent.setup();
    const onHinzufuegen = vi.fn<(g: Gewaehlt[]) => void>();
    zeigen(BIBLIOTHEK, new Set(), onHinzufuegen);
    await user.click(screen.getByRole('checkbox', { name: /Kniebeuge frei/ }));
    await user.click(screen.getByRole('checkbox', { name: /^Brücke/ }));
    await user.click(screen.getByRole('checkbox', { name: /Kniebeuge am Geländer/ }));
    await user.click(screen.getByRole('checkbox', { name: /Kniebeuge am Geländer/ }));
    await user.click(screen.getByRole('button', { name: '2 hinzufügen' }));
    expect(onHinzufuegen.mock.calls[0]![0].map((g) => g.variante.id)).toEqual(['v3', 'v1']);
  });

  it('sucht auch ohne Umlaute und behält die Wahl über die Suche hinweg', async () => {
    const user = userEvent.setup();
    zeigen();
    await user.click(screen.getByRole('checkbox', { name: /Kniebeuge frei/ }));
    await user.type(screen.getByRole('searchbox', { name: 'Übung suchen' }), 'bruecke');
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.getByText('1 von 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1 hinzufügen' })).toBeEnabled();
  });

  it('zeigt viele Zeilen seitenweise', async () => {
    const user = userEvent.setup();
    const viele: Bibliothek = {
      ...BIBLIOTHEK,
      exercises: Array.from({ length: ZEILEN_JE_SEITE + 5 }, (_, i) =>
        uebung(`x${i}`, `Übung ${String(i).padStart(3, '0')}`, [
          variante(`y${i}`, `Übung ${String(i).padStart(3, '0')}`),
        ]),
      ),
    };
    zeigen(viele);
    expect(screen.getAllByRole('checkbox')).toHaveLength(ZEILEN_JE_SEITE);
    await user.click(screen.getByRole('button', { name: 'Weitere laden (5)' }));
    expect(screen.getAllByRole('checkbox')).toHaveLength(ZEILEN_JE_SEITE + 5);
  });

  it('bietet das Anlegen nur an, wenn der Server pflegen lässt (ANN-293)', () => {
    const { unmount } = zeigen();
    expect(screen.queryByRole('button', { name: /Übung anlegen/ })).toBeNull();
    unmount();
    zeigen({ ...BIBLIOTHEK, can_manage: true });
    expect(screen.getByRole('button', { name: 'Nicht dabei? Übung anlegen' })).toBeInTheDocument();
  });

  describe('eine Liste mit dem Katalog (Befund B9, O-002)', () => {
    // Die Brücke der Bibliothek trägt den Schlüssel LW-01 - er zählt, nicht der Name.
    const LW01 = katalogeintrag('LW-01')!;
    const KN01 = katalogeintrag('KN-01')!;
    const HU01 = katalogeintrag('HU-01')!;

    it('zeigt fehlende Katalogeinträge mit in der Liste, ungeprüft, und Vorhandenes nur einmal', () => {
      zeigen(BIBLIOTHEK, new Set(), undefined, [LW01, KN01, HU01]);
      const blatt = screen.getByRole('dialog', { name: 'Übungen hinzufügen' });
      // Brücke (LW-01) steht schon in der Bibliothek: einmal.
      expect(within(blatt).getAllByRole('checkbox', { name: /^Brücke/ })).toHaveLength(1);
      expect(within(blatt).getAllByRole('checkbox')).toHaveLength(5);
      expect(
        within(blatt).getByRole('checkbox', { name: (n) => n.startsWith(KN01.name) }),
      ).toHaveAccessibleName(/ungeprüft/);
      expect(within(blatt).getByText('5 Übungen')).toBeInTheDocument();
      // Kein Wort „Katalog“ oder „Bibliothek“ im Blatt.
      expect(blatt).not.toHaveTextContent(/Katalog|Bibliothek/);
    });

    it('gibt einen gewählten Katalogeintrag mit seinem Schlüssel weiter', async () => {
      const user = userEvent.setup();
      const onHinzufuegen = vi.fn<(g: Gewaehlt[]) => void>();
      zeigen(BIBLIOTHEK, new Set(), onHinzufuegen, [KN01]);
      await user.type(screen.getByRole('searchbox', { name: 'Übung suchen' }), KN01.alltagsname);
      await user.click(screen.getByRole('checkbox', { name: (n) => n.startsWith(KN01.name) }));
      await user.click(screen.getByRole('button', { name: '1 hinzufügen' }));
      const [gewaehlt] = onHinzufuegen.mock.calls[0]![0];
      expect(gewaehlt!.variante).toMatchObject({ id: 'katalog:KN-01', catalog_key: 'KN-01' });
    });

    it('sagt es, wenn der Katalog fehlt, und zeigt die Bibliothek', () => {
      zeigen(BIBLIOTHEK, new Set(), undefined, [], true);
      expect(screen.getByText('Nicht alle Übungen konnten geladen werden.')).toBeInTheDocument();
      expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    });

    // B9: Ein langer Fachname bricht um, statt in den Haken zu laufen; ob er
    // bei 375 px passt, misst plaene.spec.ts im Browser.
    it('lässt einen langen Fachnamen umbrechen', () => {
      const BT01 = katalogeintrag('BT-01')!;
      zeigen(BIBLIOTHEK, new Set(), undefined, [BT01]);
      const titel = screen.getByText('Fußpumpe (Dorsal-/Plantarflexion)');
      expect(titel).toHaveClass('wrap-anywhere');
      expect(titel.parentElement).toHaveClass('min-w-0');
    });
  });
});
