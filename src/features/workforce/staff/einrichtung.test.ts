import { describe, expect, it } from 'vitest';
import { aendern, beginne, weiter, type Abfolge } from '@/components/ui/abfolge';
import {
  behandelt,
  einrichtung,
  ergebnisschritte,
  kontextFuer,
  mitErgebnisseite,
  naechste,
  schritt,
  seitenfolge,
  vollstaendig,
  zurueckIm,
  type Antworten,
  type Seite,
} from './einrichtung';

const OWNER = kontextFuer(['owner']);
const OFFICE = kontextFuer(['office']);

const PERSON = {
  given_name: 'Nina',
  family_name: 'Neu',
  work_email: 'nina.neu@praxis.invalid',
  work_phone: '',
};

/** Ein vollständiger Weg der Inhaber:in mit Rolle, Vorlage, Rad und Einladung. */
const VOLL: Antworten = {
  person: PERSON,
  rolle: ['therapist'],
  arbeitszeit: 'vollzeit',
  rad: { radId: 'rad-2' },
  einladung: { email: 'nina.neu@praxis.invalid' },
};

describe('Neue:n Mitarbeiter:in einrichten: welche Seiten wem erscheinen', () => {
  it('führt die Inhaber:in durch alle sechs Seiten', () => {
    expect(seitenfolge(OWNER, {})).toEqual([
      'person',
      'rolle',
      'arbeitszeit',
      'rad',
      'einladung',
      'abschluss',
    ]);
    expect(schritt(OWNER, {}, 'person')).toEqual({ nummer: 1, von: 6 });
    expect(schritt(OWNER, VOLL, 'einladung')).toEqual({ nummer: 5, von: 6 });
  });

  it('zeigt dem Büro weder Rolle noch Einladung noch Arbeitszeiten', () => {
    // Rolle und Einladung vergibt nur owner; Arbeitszeiten nimmt der Server
    // erst an, wenn owner die Person in den Kalender genommen hat (ANN-226).
    expect(OFFICE).toEqual({ zugang: false, arbeitszeiten: false, radflotte: true });
    expect(seitenfolge(OFFICE, {})).toEqual(['person', 'rad', 'abschluss']);
    expect(schritt(OFFICE, {}, 'rad')).toEqual({ nummer: 2, von: 3 });
  });

  it('nimmt nach „Später“ bei der Rolle die Einladung aus dem Weg', () => {
    const antworten: Antworten = { person: PERSON, rolle: 'spaeter' };
    expect(seitenfolge(OWNER, antworten)).toEqual([
      'person',
      'rolle',
      'arbeitszeit',
      'rad',
      'abschluss',
    ]);
    // Ohne Rolle wie eine Therapeut:in: Arbeitszeit und Rad werden gefragt.
    expect(behandelt(antworten)).toBe(true);
  });

  it('fragt bei einer Rolle ohne Behandlung weder Arbeitszeit noch Rad', () => {
    expect(seitenfolge(OWNER, { person: PERSON, rolle: ['office'] })).toEqual([
      'person',
      'rolle',
      'einladung',
      'abschluss',
    ]);
    expect(seitenfolge(OWNER, { person: PERSON, rolle: ['trainer'] })).not.toContain('rad');
    expect(seitenfolge(OWNER, { person: PERSON, rolle: ['office', 'team_lead'] })).toContain(
      'arbeitszeit',
    );
  });

  it('ohne Zugang zur Radflotte keine Seite zum Rad', () => {
    expect(seitenfolge(kontextFuer(['trainer']), {})).not.toContain('rad');
  });
});

describe('Neue:n Mitarbeiter:in einrichten: weiter, vollständig, zurück', () => {
  it('geht der Reihe nach weiter und ist erst mit jeder Antwort vollständig', () => {
    let antworten: Antworten = { person: PERSON };
    expect(naechste(OWNER, antworten, 'person')).toBe('rolle');
    antworten = { ...antworten, rolle: ['therapist'] };
    expect(naechste(OWNER, antworten, 'rolle')).toBe('arbeitszeit');
    antworten = { ...antworten, arbeitszeit: 'spaeter' };
    expect(naechste(OWNER, antworten, 'arbeitszeit')).toBe('rad');
    antworten = { ...antworten, rad: 'kein' };
    expect(vollstaendig(OWNER, antworten)).toBe(false);
    expect(naechste(OWNER, antworten, 'rad')).toBe('einladung');
    antworten = { ...antworten, einladung: 'spaeter' };
    expect(naechste(OWNER, antworten, 'einladung')).toBe('abschluss');
    expect(vollstaendig(OWNER, antworten)).toBe(true);
  });

  it('führt nach einer neuen Rolle aus dem Abschluss erst durch die neue Frage', () => {
    // Vorher „Später“, also ohne Einladung - jetzt mit Rolle.
    const vorher: Antworten = {
      person: PERSON,
      rolle: 'spaeter',
      arbeitszeit: 'vollzeit',
      rad: { radId: 'rad-2' },
    };
    expect(vollstaendig(OWNER, vorher)).toBe(true);
    let abfolge: Abfolge<Seite> = beginne<Seite>('person');
    for (const seite of ['rolle', 'arbeitszeit', 'rad', 'abschluss'] as const) {
      abfolge = weiter(abfolge, seite);
    }
    abfolge = aendern(abfolge, 'rolle');
    const nachher: Antworten = { ...vorher, rolle: ['therapist'] };
    expect(vollstaendig(OWNER, nachher)).toBe(false);
    const ziel = naechste(OWNER, nachher, 'rolle', true);
    expect(ziel).toBe('einladung');
    abfolge = weiter(abfolge, ziel, vollstaendig(OWNER, nachher));
    expect(abfolge.seite).toBe('einladung');
    const fertig: Antworten = { ...nachher, einladung: { email: 'nina.neu@praxis.invalid' } };
    abfolge = weiter(abfolge, naechste(OWNER, fertig, 'einladung', true), true);
    expect(abfolge.seite).toBe('abschluss');
  });

  it('springt mit „← Zurück“ über eine Seite, die eine andere Rolle weggenommen hat', () => {
    let abfolge: Abfolge<Seite> = beginne<Seite>('person');
    for (const seite of ['rolle', 'arbeitszeit', 'rad', 'einladung', 'abschluss'] as const) {
      abfolge = weiter(abfolge, seite);
    }
    // Jetzt nur noch Praxismanagement: Arbeitszeit und Rad sind nicht mehr im Weg.
    const antworten: Antworten = { ...VOLL, rolle: ['office'] };
    const einmal = zurueckIm(OWNER, antworten, abfolge)!;
    expect(einmal.seite).toBe('einladung');
    expect(zurueckIm(OWNER, antworten, einmal)!.seite).toBe('rolle');
    expect(zurueckIm(OWNER, antworten, beginne<Seite>('person'))).toBeNull();
  });
});

describe('Neue:n Mitarbeiter:in einrichten: was geschrieben wird', () => {
  it('schreibt alles Gewählte, nichts vor der letzten Antwort', () => {
    expect(einrichtung(OWNER, { person: PERSON, rolle: ['therapist'] })).toBeNull();
    expect(einrichtung(OWNER, VOLL)).toEqual({
      person: PERSON,
      vorlage: 'vollzeit',
      radId: 'rad-2',
      einladung: { email: 'nina.neu@praxis.invalid', rollen: ['therapist'] },
    });
  });

  it('schreibt keine Antwort, deren Seite nicht mehr im Weg steht', () => {
    // Erst Therapeut:in mit Vorlage und Rad, dann nur Praxismanagement.
    expect(einrichtung(OWNER, { ...VOLL, rolle: ['office'] })).toEqual({
      person: PERSON,
      vorlage: null,
      radId: null,
      einladung: { email: 'nina.neu@praxis.invalid', rollen: ['office'] },
    });
  });

  it('lädt das Büro nie ein und setzt keinen Wochenplan', () => {
    expect(einrichtung(OFFICE, { person: PERSON, rad: { radId: 'rad-2' } })).toEqual({
      person: PERSON,
      vorlage: null,
      radId: 'rad-2',
      einladung: null,
    });
  });
});

describe('Neue:n Mitarbeiter:in einrichten: wie jeder Schritt steht', () => {
  it('nennt jeden gewählten Schritt erledigt, wenn alles gelang - nur das Stammrad bleibt offen', () => {
    const ausgaenge = {
      arbeitszeit: { ok: true },
      schluessel: { ok: true },
      einladung: { ok: true, zustellung: 'gesendet' },
    } as const;
    expect(ergebnisschritte(OWNER, VOLL, ausgaenge)).toEqual([
      { art: 'arbeitszeit', stand: 'erledigt' },
      { art: 'schluessel', stand: 'erledigt' },
      { art: 'stammrad', stand: 'offen' },
      { art: 'zugang', stand: 'erledigt' },
    ]);
    expect(mitErgebnisseite(OWNER, VOLL, ausgaenge)).toBe(false);
  });

  it('lässt keinen gescheiterten Schritt still weg', () => {
    const ausgaenge = {
      arbeitszeit: {
        ok: false,
        fehler: 'Die Arbeitszeit konnte nicht gespeichert werden.',
        amKalender: false,
      },
      schluessel: { ok: false, fehler: 'Der Schlüssel ist schon entnommen.' },
      einladung: { ok: false, fehler: 'Für diese Person steht bereits eine Einladung offen.' },
    } as const;
    expect(ergebnisschritte(OWNER, VOLL, ausgaenge).map((s) => s.stand)).toEqual([
      'fehlt',
      'fehlt',
      'offen',
      'fehlt',
    ]);
    expect(mitErgebnisseite(OWNER, VOLL, ausgaenge)).toBe(true);
  });

  it('nennt einen Schritt ohne Bestätigung des Servers nie erledigt', () => {
    // Etwa abgebrochen: Ohne Ausgang gilt der Schritt als fehlend.
    expect(ergebnisschritte(OWNER, VOLL, {}).map((s) => s.stand)).toEqual([
      'fehlt',
      'fehlt',
      'offen',
      'fehlt',
    ]);
  });

  it('bleibt bei der Ergebnisseite, wenn die Anmeldemail nicht hinausging', () => {
    for (const zustellung of ['kein_konto', 'dienst_nicht_erreichbar'] as const) {
      const ausgaenge = {
        arbeitszeit: { ok: true },
        schluessel: { ok: true },
        einladung: { ok: true, zustellung },
      } as const;
      expect(ergebnisschritte(OWNER, VOLL, ausgaenge).at(-1)).toEqual({
        art: 'zugang',
        stand: 'offen',
      });
      expect(mitErgebnisseite(OWNER, VOLL, ausgaenge)).toBe(true);
    }
  });

  it('nennt „Später“ als später und „Kein Rad“ gar nicht', () => {
    const antworten: Antworten = {
      person: PERSON,
      rolle: ['therapist'],
      arbeitszeit: 'spaeter',
      rad: 'kein',
      einladung: 'spaeter',
    };
    expect(ergebnisschritte(OWNER, antworten, {})).toEqual([
      { art: 'arbeitszeit', stand: 'spaeter' },
      { art: 'zugang', stand: 'spaeter' },
    ]);
    expect(mitErgebnisseite(OWNER, antworten, {})).toBe(false);
  });

  it('nennt dem Büro Wochenplan, Stammrad und Zugang als offen, ohne aufzuhalten', () => {
    const antworten: Antworten = { person: PERSON, rad: { radId: 'rad-2' } };
    expect(ergebnisschritte(OFFICE, antworten)).toEqual([
      { art: 'arbeitszeit', stand: 'offen' },
      { art: 'schluessel', stand: 'erledigt' },
      { art: 'stammrad', stand: 'offen' },
      { art: 'zugang', stand: 'offen' },
    ]);
    expect(mitErgebnisseite(OFFICE, antworten, { schluessel: { ok: true } })).toBe(false);
  });
});
