import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import type * as BerichtApi from './api';
import type { RoleKey } from '@/features/session/types';
import { renderWithProviders, testUser } from '@/test-utils';
import { BerichteDerVerordnung } from './BerichteDerVerordnung';

const PATIENT = 'p1';
const VERORDNUNG = 'v1';

function zeile(rest: Partial<BerichtApi.Berichtszeile> = {}): BerichtApi.Berichtszeile {
  return {
    id: 'b1',
    treatment_basis_id: VERORDNUNG,
    status: 'entwurf',
    created_at: '2026-09-20T08:00:00.000000+00:00',
    author_name: 'Anna Beispiel',
    completed_at: null,
    completed_on: null,
    completed_by_name: null,
    recommendation: null,
    recommendation_by_name: null,
    recommendation_on: null,
    ...rest,
  };
}

function zeigen(berichte: BerichtApi.Berichtszeile[], rollen: RoleKey[] = ['therapist']) {
  renderWithProviders(
    <BerichteDerVerordnung
      patientId={PATIENT}
      verordnungId={VERORDNUNG}
      berichte={berichte}
      user={testUser(rollen)}
    />,
  );
}

/**
 * Ein angefangener Entwurf geht einem neuen vor (DOK-11): Bis UXR-008 legte
 * der immer gleiche Knopf auch neben einem Entwurf einen zweiten, leeren an.
 */
describe('Berichte an der Verordnung (DOK-11, VER-01)', () => {
  it('bietet ohne Entwurf „Therapiebericht schreiben“ als leisen, kompakten Knopf an', () => {
    zeigen([]);

    const knopf = screen.getByRole('button', { name: 'Therapiebericht schreiben' });
    // Kompakt und leise: eine seltene Aktion an der Karte (VER-01).
    expect(knopf).toHaveClass('min-h-11', 'text-sm');
    expect(knopf).not.toHaveClass('border');
    expect(screen.queryByRole('link', { name: 'Entwurf weiterschreiben' })).toBeNull();
  });

  it('führt bei einem Entwurf zum jüngsten Entwurf und bietet einen neuen nur leise an', () => {
    zeigen([
      zeile({ id: 'alt', created_at: '2026-09-18T08:00:00.000000+00:00' }),
      zeile({ id: 'neu', created_at: '2026-09-25T08:00:00.000000+00:00' }),
      zeile({
        id: 'fertig',
        status: 'abgeschlossen',
        created_at: '2026-09-26T08:00:00.000000+00:00',
        completed_on: '2026-09-26',
      }),
    ]);

    expect(screen.getByRole('link', { name: 'Entwurf weiterschreiben' })).toHaveAttribute(
      'href',
      `/patienten/${PATIENT}/berichte/neu`,
    );
    expect(screen.getByRole('button', { name: 'Neuen Bericht anlegen' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Therapiebericht schreiben' })).toBeNull();
  });

  it('bietet office weder Weiterschreiben noch Anlegen an', () => {
    zeigen([zeile()], ['office']);

    expect(screen.queryByRole('link', { name: 'Entwurf weiterschreiben' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Neuen Bericht anlegen' })).toBeNull();
    // Office liest den Entwurf auf dem Blatt.
    expect(screen.getByRole('link', { name: 'Entwurf von Anna Beispiel' })).toHaveAttribute(
      'href',
      `/patienten/${PATIENT}/berichte/b1/druck`,
    );
  });
});
