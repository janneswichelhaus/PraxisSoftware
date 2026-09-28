import { describe, expect, it } from 'vitest';
import {
  FEHLT_BEGINN,
  FEHLT_ENDE,
  abweichungenNachDatum,
  gleicheBloecke,
  halbeBloecke,
  ohneLeere,
} from './zeitbloecke';

describe('ohneLeere', () => {
  it('laesst nur ganz leere Bloecke weg, keinen halb ausgefuellten (ORG-02)', () => {
    expect(
      ohneLeere([
        { von: '08:00', bis: '12:00' },
        { von: '', bis: '' },
        { von: '13:00', bis: '' },
      ]),
    ).toEqual([
      { von: '08:00', bis: '12:00' },
      { von: '13:00', bis: '' },
    ]);
  });
});

describe('halbeBloecke', () => {
  it('meldet einen Block ohne Ende am Feld "bis"', () => {
    expect(halbeBloecke([{ von: '08:00', bis: '' }])).toEqual([{ bis: FEHLT_ENDE }]);
  });

  it('meldet einen Block ohne Beginn am Feld "von"', () => {
    expect(
      halbeBloecke([
        { von: '08:00', bis: '12:00' },
        { von: '', bis: '18:00' },
      ]),
    ).toEqual([{}, { von: FEHLT_BEGINN }]);
  });

  it('hat an vollstaendigen und ganz leeren Bloecken nichts auszusetzen', () => {
    expect(
      halbeBloecke([
        { von: '08:00', bis: '12:00' },
        { von: '', bis: '' },
      ]),
    ).toBeNull();
  });
});

describe('gleicheBloecke', () => {
  it('vergleicht unabhaengig von der Reihenfolge der Eingabe', () => {
    expect(
      gleicheBloecke(
        [
          { von: '13:00', bis: '18:00' },
          { von: '08:00', bis: '12:00' },
        ],
        [
          { von: '08:00', bis: '12:00' },
          { von: '13:00', bis: '18:00' },
        ],
      ),
    ).toBe(true);
  });

  it('erkennt eine geaenderte Zeit und einen fehlenden Block', () => {
    expect(gleicheBloecke([{ von: '09:00', bis: '12:00' }], [{ von: '08:00', bis: '12:00' }])).toBe(
      false,
    );
    expect(gleicheBloecke([], [{ von: '08:00', bis: '12:00' }])).toBe(false);
  });
});

describe('abweichungenNachDatum', () => {
  it('fasst die Bloecke eines Datums in einer Zeile zusammen (ORG-05)', () => {
    expect(
      abweichungenNachDatum([
        {
          id: 'x1',
          staff_member_id: 's',
          on_date: '2027-06-01',
          kind: 'block',
          starts_at: '13:00',
          ends_at: '15:00',
        },
        {
          id: 'x2',
          staff_member_id: 's',
          on_date: '2027-06-01',
          kind: 'block',
          starts_at: '08:00',
          ends_at: '11:00',
        },
        {
          id: 'x3',
          staff_member_id: 's',
          on_date: '2027-06-02',
          kind: 'unavailable',
          starts_at: null,
          ends_at: null,
        },
      ]),
    ).toEqual([
      {
        datum: '2027-06-01',
        frei: false,
        bloecke: [
          { von: '08:00', bis: '11:00' },
          { von: '13:00', bis: '15:00' },
        ],
      },
      { datum: '2027-06-02', frei: true, bloecke: [] },
    ]);
  });
});
