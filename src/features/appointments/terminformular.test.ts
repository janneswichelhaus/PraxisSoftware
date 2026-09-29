import { describe, expect, it } from 'vitest';
import { leererTermin } from './api';
import {
  DAUER_UNGUELTIG,
  MITTERNACHT_MELDUNG,
  leseAngelegtenTermin,
  leseDauer,
  leseMeldung,
  mitAngelegtemTermin,
  nachDemAnlegen,
  speicherfehlerText,
  terminFehlerliste,
  terminFeldfehler,
} from './terminformular';

const NEU = '77777777-7777-4777-8777-000000000002';

describe('terminFeldfehler (TER-06)', () => {
  const endeFehlt = [
    { path: ['start_time'], message: 'Beginn ist erforderlich.' },
    { path: ['end_time'], message: 'Ende ist erforderlich.' },
  ];

  it('laesst das abgeleitete Ende schweigen, solange der Beginn fehlt', () => {
    expect(terminFeldfehler(endeFehlt, leererTermin)).toEqual({
      start_time: 'Beginn ist erforderlich.',
    });
  });

  it('meldet einen Termin ueber Mitternacht am Beginn', () => {
    expect(
      terminFeldfehler([{ path: ['end_time'], message: 'Ende ist erforderlich.' }], {
        ...leererTermin,
        start_time: '23:30',
      }),
    ).toEqual({ start_time: MITTERNACHT_MELDUNG });
  });

  it('meldet ein leeres Minutenfeld am Minutenfeld', () => {
    expect(
      terminFeldfehler(
        [{ path: ['end_time'], message: 'Ende ist erforderlich.' }],
        { ...leererTermin, start_time: '09:00' },
        false,
      ),
    ).toEqual({ end_time: DAUER_UNGUELTIG });
  });

  it('nimmt je Feld die erste Meldung', () => {
    expect(
      terminFeldfehler(
        [
          { path: ['date'], message: 'Erste.' },
          { path: ['date'], message: 'Zweite.' },
        ],
        leererTermin,
      ),
    ).toEqual({ date: 'Erste.' });
  });
});

describe('terminFehlerliste (UIK-02)', () => {
  it('folgt der Reihenfolge des Formulars und springt auf die Felder', () => {
    expect(
      terminFehlerliste(
        {
          location_id: 'Für einen Praxistermin ist ein Standort erforderlich.',
          staff_member_id: 'Beteiligte Person fehlt.',
        },
        'Beteiligte Person',
      ),
    ).toEqual([
      { feldId: 'termin-person', feld: 'Beteiligte Person', meldung: 'Beteiligte Person fehlt.' },
      {
        feldId: 'termin-standort',
        feld: 'Standort',
        meldung: 'Für einen Praxistermin ist ein Standort erforderlich.',
      },
    ]);
  });
});

describe('speicherfehlerText (ZST-12)', () => {
  const titel = 'Der Termin konnte nicht angelegt werden.';

  it('wiederholt den Titel nicht, sondern sagt, was zu tun ist', () => {
    expect(speicherfehlerText(titel, titel)).toBe(
      'Die Eingaben stehen noch im Formular. Bitte die Verbindung prüfen und erneut speichern.',
    );
  });

  it('laesst einen genannten Grund stehen', () => {
    const grund = 'In diesem Zeitraum hat die behandelnde Person bereits einen Termin.';
    expect(speicherfehlerText(grund, titel)).toBe(grund);
  });
});

describe('mitAngelegtemTermin (TER-04)', () => {
  it('hebt im Kalender hervor wie bisher', () => {
    expect(mitAngelegtemTermin('/kalender?ansicht=tag', NEU)).toBe(
      `/kalender?ansicht=tag&neu=${NEU}`,
    );
  });

  it('haengt die Kennung an den Ausgangstermin und laesst dessen Rückweg stehen', () => {
    const ausgang = `/termine/abc?zurueck=${encodeURIComponent('/kalender?ansicht=tag')}`;
    expect(mitAngelegtemTermin(ausgang, NEU)).toBe(`${ausgang}&neu=${NEU}`);
  });

  it('ersetzt eine alte Kennung, statt eine zweite anzuhaengen', () => {
    expect(mitAngelegtemTermin(`/patienten/p/termine?neu=alt`, NEU)).toBe(
      `/patienten/p/termine?neu=${NEU}`,
    );
  });
});

describe('nachDemAnlegen (BEF-071)', () => {
  const warteliste = '/warteliste?filter=open';
  const suche = `/patienten/p1/plaetze?warteliste=e1&zurueck=${encodeURIComponent(warteliste)}`;

  it('führt aus der Terminsuche dorthin, wo die Suche begann', () => {
    expect(nachDemAnlegen(suche, true)).toBe(warteliste);
  });

  it('fällt ohne mitgereisten Rückweg auf die Termine der Akte zurück', () => {
    expect(nachDemAnlegen('/patienten/p1/plaetze?warteliste=e1', true)).toBe(
      '/patienten/p1/termine',
    );
  });

  it('lässt jeden anderen Rückweg und jeden Termin ohne Warteliste unverändert', () => {
    expect(nachDemAnlegen(suche, false)).toBe(suche);
    expect(nachDemAnlegen('/kalender?datum=2026-10-01', true)).toBe('/kalender?datum=2026-10-01');
    expect(nachDemAnlegen('', true)).toBe('');
  });
});

describe('Lesen aus Adresse und Verlauf', () => {
  it('liest nur eine gueltige Kennung', () => {
    expect(leseAngelegtenTermin(new URLSearchParams(`neu=${NEU}`))).toBe(NEU);
    expect(leseAngelegtenTermin(new URLSearchParams('neu=<script>'))).toBeNull();
    expect(leseAngelegtenTermin(new URLSearchParams(''))).toBeNull();
  });

  it('liest nur eine Dauer, die am selben Tag endet', () => {
    expect(leseDauer(new URLSearchParams('dauer=45'))).toBe(45);
    expect(leseDauer(new URLSearchParams('dauer=0'))).toBeNull();
    expect(leseDauer(new URLSearchParams('dauer=1440'))).toBeNull();
    expect(leseDauer(new URLSearchParams('dauer=4.5'))).toBeNull();
  });

  it('liest eine Meldung nur als nicht leeren Satz', () => {
    expect(leseMeldung({ meldung: 'Entwurf gespeichert.' })).toBe('Entwurf gespeichert.');
    expect(leseMeldung({ meldung: '  ' })).toBeNull();
    expect(leseMeldung({ meldung: 3 })).toBeNull();
    expect(leseMeldung(null)).toBeNull();
    expect(leseMeldung('Entwurf gespeichert.')).toBeNull();
  });
});
