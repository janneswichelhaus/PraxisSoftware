import { describe, expect, it } from 'vitest';
import type { Mitarbeitende, Urlaubsantrag } from '@/features/preview/types';
import {
  ueberschneidet,
  ueberschneidungen,
  urlaubskonto,
  urlaubstageInWoche,
  werktageImZeitraum,
  zeitgleicheAbwesenheiten,
} from './urlaub';

function antrag(teil: Partial<Urlaubsantrag>): Urlaubsantrag {
  return {
    id: 'u1',
    mitarbeiterId: 'm1',
    von: '2026-09-07',
    bis: '2026-09-11',
    tage: 5,
    grund: '',
    status: 'genehmigt',
    eingereichtAm: '2026-08-01',
    entschiedenVon: '',
    entschiedenAm: '',
    ablehnungsgrund: '',
    unterschrift: false,
    ...teil,
  };
}

const person: Mitarbeitende = {
  id: 'm1',
  name: 'Testperson',
  rolle: 'Physiotherapie',
  kategorie: 'Physiotherapie',
  stufe: '',
  telefon: '',
  email: '',
  geburtstag: '',
  imTeamSeit: '',
  urlaubsanspruch: 28,
  resturlaubVorjahr: 3,
  notfallkontaktName: '',
  notfallkontaktTelefon: '',
  notiz: '',
};

describe('werktageImZeitraum', () => {
  it('zaehlt eine volle Arbeitswoche als fuenf Tage', () => {
    // Montag bis Freitag
    expect(werktageImZeitraum('2026-09-07', '2026-09-11')).toBe(5);
  });

  it('laesst Samstag und Sonntag aus', () => {
    expect(werktageImZeitraum('2026-09-07', '2026-09-13')).toBe(5);
    expect(werktageImZeitraum('2026-09-12', '2026-09-13')).toBe(0);
  });

  it('zaehlt einen einzelnen Werktag', () => {
    expect(werktageImZeitraum('2026-09-07', '2026-09-07')).toBe(1);
  });

  it('gibt bei unsinnigen Angaben null zurueck statt zu raten', () => {
    expect(werktageImZeitraum('2026-09-11', '2026-09-07')).toBe(0);
    expect(werktageImZeitraum('', '2026-09-07')).toBe(0);
  });

  it('rechnet ueber einen Monatswechsel hinweg', () => {
    // 28.09. (Mo) bis 02.10. (Fr)
    expect(werktageImZeitraum('2026-09-28', '2026-10-02')).toBe(5);
  });
});

describe('ueberschneidet', () => {
  it('erkennt eine Ueberlappung an genau einem Tag', () => {
    expect(
      ueberschneidet(
        { von: '2026-09-07', bis: '2026-09-11' },
        { von: '2026-09-11', bis: '2026-09-18' },
      ),
    ).toBe(true);
  });

  it('erkennt luekenlose, aber getrennte Zeitraeume nicht als Ueberlappung', () => {
    expect(
      ueberschneidet(
        { von: '2026-09-07', bis: '2026-09-10' },
        { von: '2026-09-11', bis: '2026-09-18' },
      ),
    ).toBe(false);
  });
});

describe('ueberschneidungen', () => {
  const bestand = [
    antrag({ id: 'a', mitarbeiterId: 'm1', von: '2026-09-07', bis: '2026-09-11' }),
    antrag({
      id: 'b',
      mitarbeiterId: 'm1',
      von: '2026-10-05',
      bis: '2026-10-09',
      status: 'abgelehnt',
    }),
    antrag({ id: 'c', mitarbeiterId: 'm2', von: '2026-09-07', bis: '2026-09-11' }),
  ];

  it('meldet einen bestehenden Antrag derselben Person', () => {
    const treffer = ueberschneidungen(bestand, 'm1', { von: '2026-09-09', bis: '2026-09-14' });
    expect(treffer.map((eintrag) => eintrag.id)).toEqual(['a']);
  });

  it('ignoriert abgelehnte Antraege - sie blockieren nichts', () => {
    const treffer = ueberschneidungen(bestand, 'm1', { von: '2026-10-05', bis: '2026-10-09' });
    expect(treffer).toEqual([]);
  });

  it('ignoriert Antraege anderer Personen', () => {
    const treffer = ueberschneidungen(bestand, 'm1', { von: '2026-09-07', bis: '2026-09-11' });
    expect(treffer.map((eintrag) => eintrag.id)).not.toContain('c');
  });

  it('meldet den eigenen Antrag beim Bearbeiten nicht als Konflikt', () => {
    const treffer = ueberschneidungen(bestand, 'm1', { von: '2026-09-07', bis: '2026-09-11' }, 'a');
    expect(treffer).toEqual([]);
  });
});

describe('zeitgleicheAbwesenheiten', () => {
  it('nennt genehmigte Abwesenheiten anderer Personen im selben Zeitraum', () => {
    const bestand = [
      antrag({ id: 'a', mitarbeiterId: 'm1' }),
      antrag({ id: 'b', mitarbeiterId: 'm2' }),
      antrag({ id: 'c', mitarbeiterId: 'm3', status: 'beantragt' }),
    ];
    const treffer = zeitgleicheAbwesenheiten(
      bestand,
      { von: '2026-09-07', bis: '2026-09-11' },
      'm1',
    );
    // Nur genehmigte zaehlen: ein offener Antrag ist noch keine Abwesenheit.
    expect(treffer.map((eintrag) => eintrag.id)).toEqual(['b']);
  });
});

describe('urlaubskonto', () => {
  it('rechnet Anspruch und Uebertrag zusammen und zieht Genehmigtes ab', () => {
    const konto = urlaubskonto(person, [antrag({ tage: 5 })], 2026);
    expect(konto.anspruch).toBe(28);
    expect(konto.uebertrag).toBe(3);
    expect(konto.genehmigt).toBe(5);
    expect(konto.rest).toBe(26);
  });

  it('fuehrt Beantragtes getrennt und zieht es nicht ab', () => {
    const konto = urlaubskonto(person, [antrag({ tage: 5, status: 'beantragt' })], 2026);
    expect(konto.beantragt).toBe(5);
    expect(konto.genehmigt).toBe(0);
    expect(konto.rest).toBe(31);
  });

  it('zaehlt abgelehnte Antraege nicht mit', () => {
    const konto = urlaubskonto(person, [antrag({ tage: 5, status: 'abgelehnt' })], 2026);
    expect(konto.genehmigt).toBe(0);
    expect(konto.beantragt).toBe(0);
  });

  it('trennt die Kalenderjahre', () => {
    const konto = urlaubskonto(
      person,
      [antrag({ tage: 5, von: '2027-01-04', bis: '2027-01-08' })],
      2026,
    );
    expect(konto.genehmigt).toBe(0);
  });
});

describe('urlaubstageInWoche', () => {
  const montag = '2026-09-07';

  it('zaehlt eine ganze Arbeitswoche als fuenf', () => {
    expect(urlaubstageInWoche([antrag({})], 'm1', montag)).toBe(5);
  });

  it('schneidet einen laengeren Urlaub auf die Woche zu', () => {
    const lang = antrag({ von: '2026-09-02', bis: '2026-09-20', tage: 15 });
    expect(urlaubstageInWoche([lang], 'm1', montag)).toBe(5);
  });

  it('zaehlt nur die Tage, die in der Woche liegen', () => {
    const kurz = antrag({ von: '2026-09-10', bis: '2026-09-14' });
    // Do und Fr in dieser Woche; der Montag danach zaehlt zur naechsten.
    expect(urlaubstageInWoche([kurz], 'm1', montag)).toBe(2);
  });

  it('ignoriert offene Antraege und andere Personen', () => {
    expect(urlaubstageInWoche([antrag({ status: 'beantragt' })], 'm1', montag)).toBe(0);
    expect(urlaubstageInWoche([antrag({})], 'm2', montag)).toBe(0);
  });

  it('gibt fuer eine Woche ohne Urlaub null zurueck', () => {
    expect(urlaubstageInWoche([antrag({})], 'm1', '2026-09-21')).toBe(0);
  });
});
