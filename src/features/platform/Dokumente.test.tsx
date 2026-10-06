import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as PlattformApi from './api';
import type { Dokument, Plattformzugang } from './api';
import { renderWithProviders } from '@/test-utils';

/**
 * Freigegebene Dokumente (POR-014, DSN-001 D3): nur, was die Praxis einzeln
 * freigegeben hat; Bilder in der Anwendung, PDF auf das Gerät.
 */

const ladeDokumente = vi.fn();
const ladeDokumentZumAnzeigen = vi.fn();
const ladeDokumentHerunter = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof PlattformApi>()),
  ladeDokumente: (...args: unknown[]) => ladeDokumente(...args) as Promise<Dokument[]>,
  ladeDokumentZumAnzeigen: (...args: unknown[]) =>
    ladeDokumentZumAnzeigen(...args) as Promise<{ bild: Blob; name: string }>,
  ladeDokumentHerunter: (...args: unknown[]) => ladeDokumentHerunter(...args) as Promise<void>,
}));

const { Dokumente } = await import('./Dokumente');

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

const BRIEF: Dokument = {
  id: 'abababab-abab-4bab-8bab-000000000001',
  document_type: 'arztbrief',
  display_name: 'Arztbrief Orthopaedie.pdf',
  mime_type: 'application/pdf',
  byte_size: 204_800,
  released_at: '2026-10-06T08:00:00.000Z',
};
const BILD: Dokument = {
  ...BRIEF,
  id: 'abababab-abab-4bab-8bab-000000000002',
  document_type: 'klinisches_bild',
  display_name: 'Roentgen.jpg',
  mime_type: 'image/jpeg',
};

beforeEach(() => {
  vi.clearAllMocks();
  ladeDokumentHerunter.mockResolvedValue(undefined);
  ladeDokumentZumAnzeigen.mockResolvedValue({
    bild: new Blob(['x'], { type: 'image/jpeg' }),
    name: 'Roentgen.jpg',
  });
  if (!URL.createObjectURL) {
    URL.createObjectURL = () => 'blob:test';
    URL.revokeObjectURL = () => undefined;
  }
});

describe('Dokumente (POR-014)', () => {
  it('listet freigegebene Dokumente und holt ein PDF auf das Geraet', async () => {
    const nutzer = userEvent.setup();
    ladeDokumente.mockResolvedValue([BRIEF, BILD]);
    renderWithProviders(<Dokumente zugang={ZUGANG} />, '/p/dokumente');
    expect(await screen.findByText('Arztbrief Orthopaedie.pdf')).toBeInTheDocument();
    expect(
      screen.getByText(/Arztbrief · 200 KB · freigegeben am 06\.10\.2026/),
    ).toBeInTheDocument();
    // Ein PDF hat nur „Herunterladen", ein Bild zusätzlich „Ansehen".
    expect(screen.getAllByRole('button', { name: /Herunterladen/ })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /Ansehen/ })).toHaveLength(1);
    await nutzer.click(
      screen.getByRole('button', { name: 'Herunterladen: Arztbrief Orthopaedie.pdf' }),
    );
    await waitFor(() =>
      expect(ladeDokumentHerunter).toHaveBeenCalledWith(ZUGANG.access_id, BRIEF.id),
    );
  });

  it('zeigt ein Bild in der Anwendung an', async () => {
    const nutzer = userEvent.setup();
    ladeDokumente.mockResolvedValue([BILD]);
    renderWithProviders(<Dokumente zugang={ZUGANG} />, '/p/dokumente');
    await nutzer.click(await screen.findByRole('button', { name: 'Ansehen: Roentgen.jpg' }));
    expect(await screen.findByRole('img', { name: 'Roentgen.jpg' })).toBeInTheDocument();
    expect(ladeDokumentZumAnzeigen).toHaveBeenCalledWith(ZUGANG.access_id, BILD.id);
  });

  it('sagt ohne Freigabe, wer entscheidet, und im Training, dass es keine gibt', async () => {
    ladeDokumente.mockResolvedValue([]);
    renderWithProviders(<Dokumente zugang={ZUGANG} />, '/p/dokumente');
    expect(await screen.findByText(/noch kein Dokument für Sie freigegeben/)).toBeInTheDocument();
    renderWithProviders(
      <Dokumente zugang={{ ...ZUGANG, relationship_kind: 'training' }} />,
      '/p/dokumente?bereich=training',
    );
    expect(screen.getByText('Im Training gibt es keine Dokumente.')).toBeInTheDocument();
  });

  it('meldet einen gescheiterten Abruf als Satz', async () => {
    const nutzer = userEvent.setup();
    ladeDokumente.mockResolvedValue([BRIEF]);
    ladeDokumentHerunter.mockRejectedValue(new Error('Das Dokument konnte nicht geöffnet werden.'));
    renderWithProviders(<Dokumente zugang={ZUGANG} />, '/p/dokumente');
    await nutzer.click(await screen.findByRole('button', { name: /Herunterladen/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('konnte nicht geöffnet werden');
  });
});
