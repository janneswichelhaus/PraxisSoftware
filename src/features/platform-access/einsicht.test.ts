import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EinsichtAbgewiesen,
  einsichtLesen,
  einsichtsadresse,
  istEinsichtspfad,
  ladeEinsichtskontext,
  rueckwegAusDerEinsicht,
  wegeAusDerEinsicht,
} from './einsicht';

/**
 * Die Praxisseite der Einsicht (E-001): Sie liest nur über `platform_preview`
 * und unterscheidet eine Abweisung des Servers von einem Netzfehler.
 */

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({ rpc }) }));

const ZUGANG = 'cafecafe-cafe-4afe-8afe-000000000002';
const ERIKA = '66666666-6666-4666-8666-000000000002';
const RUECKFRAGE = 'dddddddd-dddd-4ddd-8ddd-000000000002';

const kontext = {
  access_id: ZUGANG,
  organization_name: 'Test Praxis Tuebingen',
  relationship_kind: 'treatment',
  status: 'active',
  readable: true,
  read_until: null,
  access_kind: 'self',
  represented_name: null,
  own_name: 'Erika Beispiel',
  practice_phone: '+49 7071 0000000',
  relationship_id: ERIKA,
  person_name: 'Erika Beispiel',
};

describe('Einsicht der Praxis (E-001)', () => {
  beforeEach(() => rpc.mockReset());

  it('liest nur über platform_preview, mit Zugang, Funktion und Argumenten', async () => {
    rpc.mockResolvedValue({ data: [], error: null, status: 200 });
    expect(await einsichtLesen(ZUGANG, 'platform_invoice', { p_invoice_id: 'x' })).toEqual({
      data: [],
      error: null,
    });
    expect(rpc).toHaveBeenCalledWith('platform_preview', {
      p_access_id: ZUGANG,
      p_function: 'platform_invoice',
      p_args: { p_invoice_id: 'x' },
    });
  });

  it('nimmt HTTP 403 als Abweisung, auch mit dem Körper null (ANN-115)', async () => {
    rpc.mockResolvedValue({ data: null, error: null, status: 403 });
    const ergebnis = await einsichtLesen(ZUGANG, 'platform_messages');
    expect(ergebnis.error).toBeInstanceOf(EinsichtAbgewiesen);
    rpc.mockResolvedValue({ data: null, error: { code: '42501' }, status: 403 });
    expect((await einsichtLesen(ZUGANG, 'platform_messages')).error).toBeInstanceOf(
      EinsichtAbgewiesen,
    );
  });

  it('lädt den Kontext und sagt, wohin es zurückgeht', async () => {
    rpc.mockResolvedValue({ data: [kontext], error: null, status: 200 });
    const geladen = await ladeEinsichtskontext(ZUGANG);
    expect(geladen.person_name).toBe('Erika Beispiel');
    // DRP-N1, DRP-N2: wie die Person sie sieht.
    expect(geladen.own_name).toBe('Erika Beispiel');
    expect(geladen.practice_phone).toBe('+49 7071 0000000');
    expect(rueckwegAusDerEinsicht(geladen)).toEqual({
      ziel: `/patienten/${ERIKA}/stammdaten`,
      beschriftung: 'Zurück zur Akte',
    });
    expect(rueckwegAusDerEinsicht({ ...geladen, relationship_kind: 'training' }).ziel).toBe(
      `/training/${ERIKA}`,
    );
  });

  it('führt dorthin, wo die Praxis öffnet, was die Einsicht nicht öffnet (ANN-527)', async () => {
    rpc.mockResolvedValue({ data: [kontext], error: null, status: 200 });
    const behandlung = wegeAusDerEinsicht(await ladeEinsichtskontext(ZUGANG));
    // Eine Datei im Reiter der Akte, in dem sie steht (AKTE-007).
    expect(behandlung.datei?.('arztbrief')).toBe(`/patienten/${ERIKA}/doku`);
    expect(behandlung.datei?.('verordnungsscan')).toBe(`/patienten/${ERIKA}/verordnungen`);
    expect(behandlung.datei?.('vertrag')).toBe(`/patienten/${ERIKA}/stammdaten#anmeldebogen`);
    expect(behandlung.datei?.('unbekannte_art')).toBe(`/patienten/${ERIKA}/stammdaten`);
    // Eine Aufnahme an ihrer Rückfrage, im Bereich des Verhältnisses (DSN-001 D1).
    expect(behandlung.rueckfrage(RUECKFRAGE)).toBe(`/rueckfragen/${RUECKFRAGE}`);

    rpc.mockResolvedValue({
      data: [{ ...kontext, relationship_kind: 'training' }],
      error: null,
      status: 200,
    });
    const training = wegeAusDerEinsicht(await ladeEinsichtskontext(ZUGANG));
    expect(training.datei).toBeNull();
    expect(training.rueckfrage(RUECKFRAGE)).toBe(`/training/rueckfragen/${RUECKFRAGE}`);
  });

  it('unterscheidet Abweisung und Netzfehler beim Kontext', async () => {
    rpc.mockResolvedValue({ data: null, error: null, status: 403 });
    await expect(ladeEinsichtskontext(ZUGANG)).rejects.toBeInstanceOf(EinsichtAbgewiesen);
    rpc.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' }, status: 0 });
    await expect(ladeEinsichtskontext(ZUGANG)).rejects.toThrow(
      'Die Einsicht konnte nicht geladen werden.',
    );
    // Eine Vertretung oder ein anderer Zustand käme nie durch den Server - und
    // würde hier trotzdem nicht angenommen.
    rpc.mockResolvedValue({
      data: [{ ...kontext, access_kind: 'companion' }],
      error: null,
      status: 200,
    });
    await expect(ladeEinsichtskontext(ZUGANG)).rejects.toThrow(
      'Die Einsicht konnte nicht geladen werden.',
    );
  });

  it('baut die Adresse nur aus der Kennung und erkennt den Pfad', () => {
    expect(einsichtsadresse(ZUGANG)).toBe(`/p?zugang=${ZUGANG}`);
    expect(istEinsichtspfad('/p')).toBe(true);
    expect(istEinsichtspfad('/p/termine')).toBe(true);
    expect(istEinsichtspfad('/patienten')).toBe(false);
    expect(istEinsichtspfad('/pa')).toBe(false);
  });
});
