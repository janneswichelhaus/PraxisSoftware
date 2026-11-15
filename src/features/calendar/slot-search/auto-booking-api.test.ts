import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({ functions: { invoke } }) }));

const { bucheNaechstenTermin } = await import('./auto-booking-api');

const AUFTRAG = {
  patientId: '66666666-6666-4666-8666-000000000001',
  staffMemberId: null,
  duration: 60,
  from: '2099-10-05',
  to: '2099-10-18',
  windows: [{ weekday: 1, from: '08:00', to: '12:00' }],
  basisId: 'b1',
  waitlistId: null,
};
const TERMIN = {
  id: 't1',
  person: 's1',
  name: 'Anna Beispiel',
  datum: '2099-10-05',
  beginn: '08:15',
  ende: '09:15',
  gebiet: 'none',
};

function fehlerAntwort(koerper: unknown, status = 409) {
  return {
    data: null,
    error: new Error('FunctionsHttpError'),
    response: new Response(JSON.stringify(koerper), { status }),
  };
}

describe('Automatische Buchung im Browser (ANN-865)', () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it('schickt die laufende Suche und meldet den gebuchten Termin', async () => {
    invoke.mockResolvedValue({
      data: { ok: true, value: { ergebnis: 'gebucht', termin: TERMIN } },
      error: null,
    });
    expect(await bucheNaechstenTermin(AUFTRAG)).toEqual({ art: 'gebucht', termin: TERMIN });
    expect(invoke).toHaveBeenCalledWith('auto-booking', {
      body: {
        patient: AUFTRAG.patientId,
        person: null,
        dauer_minuten: 60,
        von: '2099-10-05',
        bis: '2099-10-18',
        wunschzeiten: AUFTRAG.windows,
        grundlage: 'b1',
        warteliste: null,
      },
    });
  });

  it('meldet keinen Platz mit der Zahl der ungeprüften Stellen', async () => {
    invoke.mockResolvedValue({
      data: { ok: true, value: { ergebnis: 'kein_platz', ungeprueft: 3, knapp: 12 } },
      error: null,
    });
    expect(await bucheNaechstenTermin(AUFTRAG)).toEqual({ art: 'kein_platz', ungeprueft: 3 });
  });

  it.each([
    ['travel_unavailable', 'Die Fahrzeiten lassen sich gerade nicht berechnen. Nichts gebucht.'],
    ['address_not_located', 'Die Anschrift ist noch nicht auf der Karte verortet. Nichts gebucht.'],
    ['waitlist_closed', 'Der Wartelisteneintrag ist nicht mehr offen. Nichts gebucht.'],
    ['session_invalid', 'Die Anmeldung ist abgelaufen. Bitte neu anmelden. Nichts gebucht.'],
    ['busy', 'Der Kalender ändert sich gerade. Bitte noch einmal versuchen. Nichts gebucht.'],
  ])('sagt zu %s, dass nichts gebucht ist', async (code, satz) => {
    invoke.mockResolvedValue(fehlerAntwort({ ok: false, error: { code, message: 'intern' } }));
    expect(await bucheNaechstenTermin(AUFTRAG)).toEqual({ art: 'nichts_gebucht', satz });
  });

  it('behauptet nie „nichts gebucht“, wenn der Ausgang offen ist', async () => {
    const unklar = {
      art: 'unklar',
      satz: 'Unklar, ob gebucht wurde. Bitte im Kalender nachsehen.',
    };

    invoke.mockResolvedValue(
      fehlerAntwort({ ok: false, error: { code: 'outcome_unknown', message: 'intern' } }, 502),
    );
    expect(await bucheNaechstenTermin(AUFTRAG)).toEqual(unklar);

    invoke.mockRejectedValue(new Error('Netz weg'));
    expect(await bucheNaechstenTermin(AUFTRAG)).toEqual(unklar);

    invoke.mockResolvedValue(fehlerAntwort('<html>Bad Gateway</html>', 502));
    expect(await bucheNaechstenTermin(AUFTRAG)).toEqual(unklar);

    invoke.mockResolvedValue(fehlerAntwort({ ok: false, error: { code: 'neu' } }, 500));
    expect(await bucheNaechstenTermin(AUFTRAG)).toEqual(unklar);

    invoke.mockResolvedValue({ data: { ok: true, value: { ergebnis: 'gebucht' } }, error: null });
    expect(await bucheNaechstenTermin(AUFTRAG)).toEqual(unklar);
  });

  it('sagt es, wenn es die Function in der Umgebung nicht gibt', async () => {
    invoke.mockResolvedValue(fehlerAntwort({ message: 'Function not found' }, 404));
    expect(await bucheNaechstenTermin(AUFTRAG)).toEqual({
      art: 'nichts_gebucht',
      satz: 'Automatisch buchen ist hier nicht eingerichtet. Nichts gebucht.',
    });
  });
});
