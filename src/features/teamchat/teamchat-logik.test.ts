import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { gesperrtSatz, istFett, kanalTitel, ordneKanaele, type Kanal, type Nachricht } from './api';
import { aufgabeAus, NOTIZ_MAX, TITEL_MAX } from './aufgabe';
import { entwuerfeLeeren, entwuerfeVon, entwurfLesen, entwurfSetzen } from './entwuerfe';
import { alleErwaehnt, angefangeneErwaehnung, erwaehnte, passendePersonen } from './erwaehnung';
import { flaechenhoehe, MINDESTHOEHE_PX, spaltenFuer } from './flaeche';
import { anriss, auszeichnung, bloecke, ohneFormatierung } from './formatierung';
import { nachrichtKennung } from './kennung';
import { sucheMoeglich, LEERE_SUCHE } from './suche';
import { flach, zeitVergleich } from './verlauf';
import { erinnerungsvorschlaege, freieZeit, geplantFuer, planvorschlaege } from './zeit';

/**
 * Die reinen Regeln des Teamchats (TEAM-002): Formatierung, Erwähnungen,
 * Zeiten zum Planen und Erinnern, die Maße der Chatfläche, das Blättern ohne
 * Doppel, Entwürfe je Konto, die Suche nach ANN-651 und die Kennung der
 * Nachricht wie auf dem Server.
 */

describe('Formatierung (ANN-649)', () => {
  it('erkennt Auszeichnungen nur an Wortgrenzen', () => {
    expect(auszeichnung('ein *fettes* Wort', '*')).toEqual({ an: 4, innen: 'fettes' });
    expect(auszeichnung('2*3*4', '*')).toBeNull();
    expect(auszeichnung('* kein * fett', '*')).toBeNull();
    expect(auszeichnung('über\n*zwei\nZeilen*', '*')).toBeNull();
  });

  it('zerlegt Zitat, Liste, Code und Absatz', () => {
    expect(bloecke('> zitiert\n- eins\n- zwei\n```\nx = 1\n```\nEnde')).toEqual([
      { art: 'zitat', zeilen: ['zitiert'] },
      { art: 'liste', nummeriert: false, punkte: ['eins', 'zwei'] },
      { art: 'code', text: 'x = 1' },
      { art: 'absatz', zeilen: ['Ende'] },
    ]);
    expect(bloecke('1. erst\n2. dann')).toEqual([
      { art: 'liste', nummeriert: true, punkte: ['erst', 'dann'] },
    ]);
  });

  it('kürzt ein Zitat am Wortende und zeigt, dass mehr da war', () => {
    expect(anriss('Kurz und gut', 80)).toBe('Kurz und gut');
    expect(anriss('Wer hat den Schlüssel für das Depot Nord, das Rad steht', 40)).toBe(
      'Wer hat den Schlüssel für das Depot …',
    );
    expect(anriss('x'.repeat(50), 10)).toBe(`${'x'.repeat(10)} …`);
  });

  it('nimmt für Listenzeilen die Zeichen heraus', () => {
    expect(ohneFormatierung('*Wichtig:* `Rad 3` _heute_\n> bitte ~nicht~')).toBe(
      'Wichtig: Rad 3 heute bitte nicht',
    );
  });
});

describe('Erwähnungen (ANN-647)', () => {
  const team = [
    { staff_member_id: 't', name: 'Tim' },
    { staff_member_id: 'ti', name: 'Tina' },
  ];
  it('erwähnt nur das ganze Wort - @Tina ist nicht @Tim', () => {
    expect(erwaehnte('@Tina kommst du?', team)).toEqual(['ti']);
    expect(erwaehnte('@Tim, @Tina', team)).toEqual(['t', 'ti']);
  });
  it('erkennt ein getipptes „@“ nur am Wortanfang und grenzt mit jedem Buchstaben ein', () => {
    expect(angefangeneErwaehnung('Hallo @Ol', 9)).toEqual({ von: 6, wort: 'Ol' });
    expect(angefangeneErwaehnung('@', 1)).toEqual({ von: 0, wort: '' });
    // Eine Mailadresse ist keine Erwähnung, eine neue Zeile beendet sie.
    expect(angefangeneErwaehnung('info@praxis', 11)).toBeNull();
    expect(angefangeneErwaehnung('@Tim\nweiter', 11)).toBeNull();
    // Es zählt, was vor der Schreibmarke steht.
    expect(angefangeneErwaehnung('@Ti und mehr', 3)).toEqual({ von: 0, wort: 'Ti' });
    const personen = [{ name: 'Olivia Office' }, { name: 'Tim Teamleitung' }, { name: 'Tina' }];
    expect(passendePersonen(personen, 'off')).toEqual([{ name: 'Olivia Office' }]);
    expect(passendePersonen(personen, 'TI')).toEqual([
      { name: 'Tim Teamleitung' },
      { name: 'Tina' },
    ]);
    expect(passendePersonen(personen, 'Tim Teamleitung ')).toEqual([]);
    expect(passendePersonen(personen, '')).toHaveLength(3);
  });
  it('kennt @alle nur, wo mehr als zwei lesen', () => {
    expect(alleErwaehnt('@alle Teamtreffen', 'channel')).toBe(true);
    expect(alleErwaehnt('@alle Teamtreffen', 'direct')).toBe(false);
    expect(alleErwaehnt('@allerlei', 'channel')).toBe(false);
  });
});

describe('Zeiten zum Planen und Erinnern (ANN-643, ANN-646)', () => {
  // Freitag, 16.10.2026, 14:00 in Berlin.
  const freitag = new Date('2026-10-16T12:00:00Z');
  it('plant am Freitag auf Montag, nie ins Wochenende', () => {
    const vorschlaege = planvorschlaege('Europe/Berlin', freitag);
    expect(vorschlaege.map((v) => v.text)).toEqual(['Montag, 7:30', 'Montag, 12:00']);
    expect(vorschlaege[0]!.um).toBe('2026-10-19T05:30:00.000Z');
  });
  it('erinnert in einer Stunde, heute 17 Uhr, morgen 8 Uhr, Montag 8 Uhr', () => {
    expect(erinnerungsvorschlaege('Europe/Berlin', freitag).map((v) => v.text)).toEqual([
      'In einer Stunde',
      'Heute, 17:00',
      'Morgen, 8:00',
      'Nächste Woche, Montag 8:00',
    ]);
    const spaet = new Date('2026-10-16T14:45:00Z'); // 16:45 in Berlin
    expect(erinnerungsvorschlaege('Europe/Berlin', spaet).map((v) => v.text)).not.toContain(
      'Heute, 17:00',
    );
  });
  it('rechnet frei Gewähltes in der Zeitzone der Praxis und liest es zurück', () => {
    expect(freieZeit('2026-10-20', '08:15', 'Europe/Berlin')).toBe('2026-10-20T06:15:00.000Z');
    expect(freieZeit('20.10.2026', '08:15', 'Europe/Berlin')).toBeNull();
    expect(geplantFuer('2026-10-17T05:30:00Z', 'Europe/Berlin', freitag)).toBe('morgen, 07:30');
  });
});

describe('Chatfläche (ANN-648)', () => {
  it('endet über der Tastatur und über der Tableiste', () => {
    // Tastatur offen: sichtbar bis 400, die Tableiste läge bei 600.
    expect(flaechenhoehe({ oben: 100, sichtbarUnten: 400, tableisteOben: 600 })).toBe(300);
    // Ohne Tastatur endet sie an der Tableiste.
    expect(flaechenhoehe({ oben: 100, sichtbarUnten: 667, tableisteOben: 611 })).toBe(511);
    // Am Rechner gibt es keine Tableiste; nie kleiner als das Mindestmaß.
    expect(flaechenhoehe({ oben: 100, sichtbarUnten: 900, tableisteOben: null })).toBe(800);
    expect(flaechenhoehe({ oben: 300, sichtbarUnten: 320, tableisteOben: null })).toBe(
      MINDESTHOEHE_PX,
    );
  });
  it('trägt ab 900 px zwei Spalten, ab 1000 px den Thread daneben', () => {
    expect(spaltenFuer(375)).toBe(1);
    expect(spaltenFuer(776)).toBe(1);
    expect(spaltenFuer(900)).toBe(2);
    expect(spaltenFuer(1032)).toBe(3);
  });
});

function n(id: string, created_at: string): Nachricht {
  return { id, created_at } as Nachricht;
}

describe('Blättern ohne Doppel (ANN-641)', () => {
  it('vergleicht Zeiten mit Mikrosekunden als Text', () => {
    expect(
      zeitVergleich('2026-10-17T07:00:00.123456+00:00', '2026-10-17T07:00:00.123457+00:00'),
    ).toBe(-1);
    expect(zeitVergleich('2026-10-17T07:00:00Z', '2026-10-17T09:00:00+02:00')).toBe(0);
  });
  it('macht aus den Seiten eine Folge - aufsteigend, jede Nachricht einmal', () => {
    const neueste = [n('c', '2026-10-17T07:02:00Z'), n('d', '2026-10-17T07:03:00Z')];
    const aeltere = [
      n('a', '2026-10-17T07:00:00Z'),
      n('b', '2026-10-17T07:02:00Z'),
      n('c', '2026-10-17T07:02:00Z'),
    ];
    expect(flach([neueste, aeltere]).map((x) => x.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('Entwürfe je Konto (ANN-641)', () => {
  it('trennt Konten, Gespräche und Threads und räumt beim Abmelden alles ab', () => {
    entwuerfeLeeren();
    entwurfSetzen('anna', 'k1', null, 'Im Kanal');
    entwurfSetzen('anna', 'k1', 't1', 'Im Thread');
    expect(entwurfLesen('anna', 'k1', null)).toBe('Im Kanal');
    expect(entwurfLesen('anna', 'k1', 't1')).toBe('Im Thread');
    expect(entwurfLesen('olivia', 'k1', null)).toBe('');
    expect(entwuerfeVon('olivia')).toEqual([]);
    expect(entwuerfeVon('anna')).toHaveLength(2);
    entwurfSetzen('anna', 'k1', null, ' ');
    expect(entwuerfeVon('anna').map((e) => e.text)).toEqual(['Im Thread']);
    entwuerfeLeeren();
    expect(entwurfLesen('anna', 'k1', 't1')).toBe('');
  });
});

describe('Suche (ANN-651)', () => {
  it('sucht mit Wort, ohne Wort nur in einem Gespräch und nie nach Person allein', () => {
    expect(sucheMoeglich({ ...LEERE_SUCHE, text: 'Rad' })).toBe(true);
    expect(sucheMoeglich({ ...LEERE_SUCHE, text: 'R' })).toBe(false);
    expect(sucheMoeglich({ ...LEERE_SUCHE, kanalId: 'k1' })).toBe(true);
    expect(sucheMoeglich({ ...LEERE_SUCHE, personId: 'p1' })).toBe(false);
    expect(sucheMoeglich({ ...LEERE_SUCHE, kanalId: 'k1', personId: 'p1' })).toBe(false);
    expect(sucheMoeglich({ ...LEERE_SUCHE, text: 'Rad', personId: 'p1' })).toBe(true);
  });
});

describe('Kennung der Nachricht (ANN-641, ADR-024 Punkt 7)', () => {
  it('leitet wie der Server ab: SHA-256 über „Person:Gerät“, die ersten 128 Bit', async () => {
    const person = '55555555-5555-4555-8555-000000000002';
    const geraet = 'C0FFEE00-0000-4000-8000-000000000001';
    const erwartet = createHash('sha256')
      .update(`${person}:${geraet.toLowerCase()}`)
      .digest('hex')
      .slice(0, 32);
    const kennung = await nachrichtKennung(person, geraet);
    expect(kennung.replace(/-/g, '')).toBe(erwartet);
    expect(kennung).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(await nachrichtKennung('55555555-5555-4555-8555-000000000003', geraet)).not.toBe(
      kennung,
    );
  });
});

describe('Als Aufgabe (ANN-650)', () => {
  it('nimmt die erste Zeile ohne Zeichen als Titel und hält die Grenzen ein', () => {
    expect(aufgabeAus('\n*Belege* bis Freitag\nDetails', '# Allgemein, 17.10.')).toEqual({
      titel: 'Belege bis Freitag',
      notiz: '*Belege* bis Freitag\nDetails\n\n# Allgemein, 17.10.',
    });
    const lang = aufgabeAus('x'.repeat(5000), 'Herkunft');
    expect(lang.titel).toHaveLength(TITEL_MAX);
    expect(lang.notiz).toHaveLength(NOTIZ_MAX);
  });
});

function kanal(overrides: Partial<Kanal>): Kanal {
  return {
    id: 'k',
    kind: 'channel',
    name: 'Allgemein',
    description: null,
    archived: false,
    partner_staff_member_id: null,
    partner_name: null,
    partner_active: null,
    member_names: null,
    member_count: null,
    unread: 0,
    mentions: 0,
    last_message_at: null,
    notify: 'all',
    starred: false,
    manageable: false,
    ...overrides,
  };
}

describe('Gespräche ordnen (ANN-647)', () => {
  it('stellt fett nach der eigenen Stufe - stumm nur mit Erwähnung', () => {
    expect(istFett(kanal({ unread: 2 }))).toBe(true);
    expect(istFett(kanal({ unread: 2, notify: 'none' }))).toBe(false);
    expect(istFett(kanal({ unread: 2, notify: 'none', mentions: 1 }))).toBe(true);
    expect(istFett(kanal({ unread: 2, notify: 'mentions' }))).toBe(false);
    expect(istFett(kanal({ kind: 'direct', unread: 1, notify: 'mentions' }))).toBe(true);
  });
  it('trennt Favoriten, Kanäle, Nachrichten und Archiv; die Radflotte fehlt', () => {
    const geordnet = ordneKanaele([
      kanal({ id: 'b', name: 'Beta' }),
      kanal({ id: 'a', name: 'Alpha' }),
      kanal({ id: 'f', name: 'Favorit', starred: true }),
      kanal({ id: 'n', name: 'Neu', unread: 1 }),
      kanal({ id: 'd', kind: 'direct', name: null, partner_name: 'Tim' }),
      kanal({ id: 'x', name: 'Alt', archived: true }),
      kanal({ id: 'r', kind: 'fleet', name: null }),
    ]);
    expect(geordnet.favoriten.map((k) => k.id)).toEqual(['f']);
    expect(geordnet.kanaele.map((k) => k.id)).toEqual(['n', 'a', 'b']);
    expect(geordnet.direkt.map((k) => k.id)).toEqual(['d']);
    expect(geordnet.archiviert.map((k) => k.id)).toEqual(['x']);
  });
  it('nennt Gespräche und sperrt, wo niemand mehr antworten kann', () => {
    expect(kanalTitel(kanal({ kind: 'group', name: null, member_names: ['Olivia', 'Tim'] }))).toBe(
      'Olivia, Tim',
    );
    expect(gesperrtSatz(kanal({ archived: true }))).toBe('Archiviert – nur noch lesbar.');
    expect(
      gesperrtSatz(kanal({ kind: 'direct', partner_active: false, partner_name: 'Tom' })),
    ).toBe('Tom ist nicht mehr im Team.');
    expect(gesperrtSatz(kanal({}))).toBeNull();
  });
});
