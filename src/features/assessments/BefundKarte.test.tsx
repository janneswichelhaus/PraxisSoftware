import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type * as Api from './api';
import { renderWithProviders, testPatient } from '@/test-utils';

/**
 * Die Befund-Karte oben in der Doku (Akte entschlacken, 2026-10-03): der
 * Erstbefund mit Datum und erhebender Person, ein Weg auf die Befund-Seite.
 */
const PATIENT_ID = '66666666-6666-4666-8666-000000000001';
const fetchErhebungen = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof Api>()),
  fetchErhebungen: (id: string) => fetchErhebungen(id) as Promise<Api.Erhebung[]>,
}));

const { BefundKarte } = await import('./BefundKarte');

function erhebung(abweichung: Partial<Api.Erhebung> = {}): Api.Erhebung {
  return {
    id: 'e1',
    instrument_id: 'anamnese_v8',
    definition_version: '1.0.0',
    status: 'abgeschlossen',
    recorded_on: '2026-09-20',
    answers: {},
    supersedes_response_id: null,
    superseded_by_response_id: null,
    change_reason: null,
    created_at: '2026-09-20T08:00:00Z',
    updated_at: '2026-09-20T08:00:00Z',
    completed_at: '2026-09-20T08:10:00Z',
    author_name: 'Anna Beispiel',
    completed_by_name: 'Anna Beispiel',
    ...abweichung,
  };
}

describe('BefundKarte', () => {
  beforeEach(() => fetchErhebungen.mockReset());

  it('nennt den ältesten abgeschlossenen Befund und führt auf die Befund-Seite', async () => {
    fetchErhebungen.mockResolvedValue([
      erhebung({ id: 'neu', recorded_on: '2026-09-28' }),
      erhebung({ id: 'entwurf', status: 'entwurf', recorded_on: '2026-06-01' }),
      erhebung({ id: 'alt', recorded_on: '2026-06-02' }),
    ]);
    renderWithProviders(<BefundKarte patient={testPatient({ id: PATIENT_ID })} />);

    const karte = await screen.findByRole('link', { name: /Erstbefund vom 02\.06\.2026/ });
    expect(karte).toHaveAttribute('href', `/patienten/${PATIENT_ID}/doku/befund`);
    expect(karte).toHaveTextContent('Anna Beispiel');
  });

  it('sagt ohne Erhebung, dass noch kein Befund erhoben ist', async () => {
    fetchErhebungen.mockResolvedValue([erhebung({ status: 'entwurf' })]);
    renderWithProviders(<BefundKarte patient={testPatient({ id: PATIENT_ID })} />);

    expect(await screen.findByRole('link', { name: /Noch kein Befund erhoben/ })).toHaveAttribute(
      'href',
      `/patienten/${PATIENT_ID}/doku/befund`,
    );
  });
});
