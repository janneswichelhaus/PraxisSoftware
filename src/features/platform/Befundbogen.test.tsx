import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as PlattformApi from './api';
import type { Bogenstand, Plattformzugang } from './api';
import { renderWithProviders } from '@/test-utils';

/**
 * Befundbogen vorab (POR-012, §7, DSN-001 4.1): derselbe Bogen wie in der
 * Praxis, geprüft mit denselben Regeln; Absenden heißt abgeschlossen; liegt
 * er vor, sagt die Seite das statt den Bogen noch einmal zu zeigen.
 */

const ladeBefundbogen = vi.fn();
const befundbogenSpeichern = vi.fn();
const befundbogenAbsenden = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof PlattformApi>()),
  ladeBefundbogen: (...args: unknown[]) => ladeBefundbogen(...args) as Promise<Bogenstand[]>,
  befundbogenSpeichern: (...args: unknown[]) => befundbogenSpeichern(...args) as Promise<string>,
  befundbogenAbsenden: (...args: unknown[]) => befundbogenAbsenden(...args) as Promise<void>,
}));

const { Befundbogen } = await import('./Befundbogen');
const { fuerDiePlattform } = await import('./befundbogen');

const ZUGANG: Plattformzugang = {
  access_id: 'cafecafe-cafe-4afe-8afe-000000000002',
  organization_name: 'Test Praxis Tuebingen',
  relationship_kind: 'treatment',
  status: 'active',
  readable: true,
  read_until: null,
  access_kind: 'self',
  represented_name: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  befundbogenSpeichern.mockResolvedValue('bbbbbbbb-bbbb-4bbb-8bbb-000000000001');
  befundbogenAbsenden.mockResolvedValue(undefined);
});

describe('Befundbogen (POR-012)', () => {
  it('bietet genau die Boegen an, die die Person ausfuellt (ANN-245)', () => {
    const boegen = fuerDiePlattform();
    expect(boegen.map((b) => b.meta.id)).toEqual(['anamnese_v8']);
    expect(boegen.every((b) => b.meta.ausgefuellt_von === 'patient' && b.meta.aktiv)).toBe(true);
  });

  it(
    'zeigt den Anamnesebogen und sendet die Antworten als Entwurf und Abschluss',
    { timeout: 20_000 },
    async () => {
      const nutzer = userEvent.setup();
      ladeBefundbogen.mockResolvedValue([]);
      renderWithProviders(<Befundbogen zugang={ZUGANG} />, '/p/befundbogen?bereich=treatment');
      expect(
        await screen.findByRole('heading', { name: 'Anamnesebogen Version 8 (DIGOTOR)' }),
      ).toBeInTheDocument();
      await nutzer.type(screen.getByLabelText(/^Beruf/), 'Lehrerin');
      await nutzer.click(screen.getByRole('button', { name: 'Absenden' }));
      await waitFor(() =>
        expect(befundbogenSpeichern).toHaveBeenCalledWith(
          expect.objectContaining({
            zugangId: ZUGANG.access_id,
            entwurfId: null,
            instrumentId: 'anamnese_v8',
            version: '1.0.0',
            antworten: { beruf: { text: 'Lehrerin' } },
          }),
        ),
      );
      await waitFor(() =>
        expect(befundbogenAbsenden).toHaveBeenCalledWith(
          ZUGANG.access_id,
          'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',
        ),
      );
    },
  );

  it(
    'speichert zwischen, ohne abzusenden, und nimmt einen Entwurf wieder auf',
    { timeout: 20_000 },
    async () => {
      const nutzer = userEvent.setup();
      ladeBefundbogen.mockResolvedValue([
        {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',
          instrument_id: 'anamnese_v8',
          definition_version: '1.0.0',
          status: 'entwurf',
          recorded_on: '2026-10-06',
          source: 'platform',
          answers: { beruf: { text: 'Lehrerin' } },
          updated_at: '2026-10-06T08:00:00.000Z',
          completed_at: null,
        },
      ]);
      renderWithProviders(<Befundbogen zugang={ZUGANG} />, '/p/befundbogen');
      expect(await screen.findByLabelText(/^Beruf/)).toHaveValue('Lehrerin');
      await nutzer.click(screen.getByRole('button', { name: 'Zwischenspeichern' }));
      await waitFor(() =>
        expect(befundbogenSpeichern).toHaveBeenCalledWith(
          expect.objectContaining({ entwurfId: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001' }),
        ),
      );
      expect(befundbogenAbsenden).not.toHaveBeenCalled();
      expect(await screen.findByText(/Zwischengespeichert/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Entwurf verwerfen' })).toBeInTheDocument();
    },
  );

  it(
    'sagt, dass der Bogen vorliegt, statt ihn noch einmal zu zeigen',
    { timeout: 20_000 },
    async () => {
      ladeBefundbogen.mockResolvedValue([
        {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000002',
          instrument_id: 'anamnese_v8',
          definition_version: '1.0.0',
          status: 'abgeschlossen',
          recorded_on: '2026-10-01',
          source: 'practice',
          answers: null,
          updated_at: '2026-10-01T08:00:00.000Z',
          completed_at: '2026-10-01T08:00:00.000Z',
        },
      ]);
      renderWithProviders(<Befundbogen zugang={ZUGANG} />, '/p/befundbogen');
      expect(await screen.findByText(/Ihr Befundbogen liegt der Praxis vor/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Absenden' })).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/^Beruf/)).not.toBeInTheDocument();
    },
  );

  it('zeigt im Training nichts zum Ausfuellen', async () => {
    ladeBefundbogen.mockResolvedValue([]);
    renderWithProviders(
      <Befundbogen zugang={{ ...ZUGANG, relationship_kind: 'training' }} />,
      '/p/befundbogen?bereich=training',
    );
    expect(await screen.findByText(/nichts auszufüllen/)).toBeInTheDocument();
  });
});
