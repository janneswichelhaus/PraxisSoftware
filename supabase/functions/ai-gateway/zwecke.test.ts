import { describe, expect, it } from 'vitest';
import {
  ALLTAG_REGELN,
  AUDIOFORMATE,
  AUSZUG_HOECHST_EINTRAEGE,
  AUSZUG_HOECHST_JE_EINTRAG,
  AUSZUG_HOECHST_ZEICHEN,
  AUSZUG_REGELN,
  FELDER_REGELN,
  SCAN_FORMATE,
  SCAN_HOECHST_BYTES,
  VERORDNUNG_FELDER,
  DIKTAT_ABSCHNITTE,
  DIKTAT_REGELN,
  HOECHST_BYTES,
  HOECHST_DAUER_S,
  ENTWURF_REGELN,
  NACHRICHT_HOECHST_ZEICHEN,
  ORDNEN_HOECHST_ZEICHEN,
  ORDNEN_REGELN,
  ZWECKE,
  zweckAus,
} from './zwecke.ts';

// Die Zweckliste (ADR-005, PROJECT_PRINCIPLES.md 6.1): Ein neuer Zweck ist eine Entscheidung
// und steht deshalb hier als Liste; je Zweck Eingabe, Adapter, Ausgabe und Regeln.

describe('Zweckliste', () => {
  it('kennt genau diese Zwecke', () => {
    expect(Object.keys(ZWECKE)).toEqual([
      'dokumentation.diktat',
      'dokumentation.ordnen',
      'nachricht.entwurf',
      'nachricht.alltagssprache',
      'verlauf.auszug',
      'verordnung.felder',
    ]);
    for (const kennung of Object.keys(ZWECKE)) expect(zweckAus(kennung)?.kennung).toBe(kennung);
  });

  it.each([
    ['Dokumentation.Diktat'],
    [''],
    [' dokumentation.diktat'],
    ['toString'],
    ['__proto__'],
    [null],
    [42],
    [{}],
  ])('kennt %j nicht', (wert) => {
    expect(zweckAus(wert)).toBeNull();
  });

  it('lässt für jeden Zweck bis zur Anbieterentscheidung nur die Nachbildung zu', () => {
    for (const zweck of Object.values(ZWECKE)) expect(zweck.adapter).toEqual(['mock']);
  });

  it('erlaubt Ton in fünf Formaten, höchstens 5 MiB und fünf Minuten, auf Deutsch', () => {
    const { eingabe } = ZWECKE['dokumentation.diktat'];
    expect([...eingabe.formate]).toEqual([
      'audio/webm',
      'audio/ogg',
      'audio/mp4',
      'audio/mpeg',
      'audio/wav',
    ]);
    expect(eingabe.formate).toBe(AUDIOFORMATE);
    expect(eingabe.hoechstBytes).toBe(HOECHST_BYTES);
    expect(HOECHST_BYTES).toBe(5 * 1024 * 1024);
    expect(eingabe.hoechstDauerS).toBe(HOECHST_DAUER_S);
    expect(HOECHST_DAUER_S).toBe(300);
    expect(eingabe.sprache).toBe('de');
  });

  it('passt die Größengrenze zu fünf Minuten - mit Puffer, ohne Viertelstunden (ANN-523)', () => {
    const bytesBei = (kbits: number) => (HOECHST_DAUER_S * kbits * 1000) / 8;
    // Fünf Minuten passen auch, wenn ein Browser das Doppelte der 64 kbit/s nimmt …
    expect(HOECHST_BYTES).toBeGreaterThanOrEqual(bytesBei(128));
    // … aber nicht wesentlich mehr: bei 64 kbit/s höchstens knapp elf Minuten.
    expect(HOECHST_BYTES).toBeLessThanOrEqual(bytesBei(160));
    expect(HOECHST_BYTES / ((64 * 1000) / 8) / 60).toBeLessThan(11);
  });

  it('lässt bis zur Anbieterentscheidung nur die Nachbildung zu', () => {
    expect(ZWECKE['dokumentation.diktat'].adapter).toEqual(['mock']);
  });

  it('gibt Transkript und die vier Abschnitte der Vorlage aus', () => {
    expect(ZWECKE['dokumentation.diktat'].ausgabe.abschnitte).toEqual([
      'Angaben der Patient:in',
      'Befund',
      'Behandlung',
      'Plan',
    ]);
    expect(ZWECKE['dokumentation.diktat'].ausgabe.abschnitte).toBe(DIKTAT_ABSCHNITTE);
  });

  it.each([
    ['nichts ergänzen', /Nichts ergänzen/],
    [
      'keine Diagnose, keine Bewertung, keine Empfehlung',
      /keine Diagnose, keine Bewertung, keine Empfehlung/,
    ],
    ['nichts auslassen, nicht verdichten', /Nichts auslassen[^\n]*nicht verdichten/],
    ['nicht umformulieren, nur einordnen', /Nicht umformulieren[^\n]*zugeordnet/],
    ['Zahlen und Einheiten', /Zahlen, Einheiten/],
    ['Körperseiten', /Körperseiten/],
    ['Verneinungen', /Verneinungen/],
    ['Unsicherheiten', /Unsicherheiten/],
    ['Aussage der Patient:in gegen eigene Beobachtung', /Aussage der Patient:in[^\n]*Beobachtung/],
    ['[unverständlich] statt raten', /\[unverständlich\][^\n]*nie geraten/],
    ['diktierte Einschätzungen bleiben', /diktierte Einschätzungen[^\n]*bleiben erhalten/],
    ['leere Abschnitte entfallen', /bleibt leer und wird weggelassen/],
  ])('nennt in den Regeln für jeden Adapter: %s', (_punkt, muster) => {
    expect(DIKTAT_REGELN).toMatch(muster);
    expect(ZWECKE['dokumentation.diktat'].regeln).toBe(DIKTAT_REGELN);
  });

  it('nennt alle vier Abschnitte in den Regeln', () => {
    for (const titel of DIKTAT_ABSCHNITTE) expect(DIKTAT_REGELN).toContain(titel);
  });

  describe('Ordnen getippter Notizen', () => {
    const zweck = ZWECKE['dokumentation.ordnen'];

    it('nimmt Text bis zur Länge eines Eintrags und prüft am Termin', () => {
      expect(zweck.art).toBe('ordnen');
      expect(zweck.gegenstand).toBe('termin');
      expect(zweck.eingabe).toEqual({ hoechstZeichen: ORDNEN_HOECHST_ZEICHEN, sprache: 'de' });
      expect(ORDNEN_HOECHST_ZEICHEN).toBe(20_000);
    });

    it('ordnet in dieselben vier Abschnitte wie das Diktat', () => {
      expect(zweck.ausgabe.abschnitte).toBe(DIKTAT_ABSCHNITTE);
    });

    it.each([
      ['nur einordnen', /Nur einordnen, nicht interpretieren/],
      ['nur Titel als Antwort', /genau ein Titel[^\n]*kein Text/],
      ['nichts ergänzen', /Nichts ergänzen[^\n]*keine Diagnose, keine Bewertung, keine Empfehlung/],
      ['nichts auslassen', /Nichts auslassen[^\n]*nicht verdichten/],
      ['nicht umformulieren', /Nicht umformulieren[^\n]*Wortlaut/],
      ['Aussage gegen Beobachtung', /Aussage der Patient:in[^\n]*Beobachtung/],
    ])('nennt in den Regeln: %s', (_punkt, muster) => {
      expect(ORDNEN_REGELN).toMatch(muster);
      expect(zweck.regeln).toBe(ORDNEN_REGELN);
    });
  });

  describe('Antwort ausformulieren', () => {
    const zweck = ZWECKE['nachricht.entwurf'];

    it('nimmt Text bis zur Länge einer Antwort und prüft an der Rückfrage', () => {
      expect(zweck.art).toBe('umformen');
      expect(zweck.gegenstand).toBe('rueckfrage');
      expect(zweck.aufgabe).toBe('ausformulieren');
      expect(zweck.eingabe).toEqual({ hoechstZeichen: NACHRICHT_HOECHST_ZEICHEN, sprache: 'de' });
      expect(NACHRICHT_HOECHST_ZEICHEN).toBe(2000);
    });

    it.each([
      ['nur ausformulieren, nichts beantworten', /Nur ausformulieren, nichts beantworten/],
      ['die Frage liegt nicht vor', /Die Frage der Person liegt nicht vor/],
      ['ein Satz je Abschnitt', /je Abschnitt[^\n]*genau ein Satz/],
      [
        'kein weiterer Satz, kein Nebensatz mit Neuem',
        /kein weiterer Satz, kein Nebensatz mit Neuem/,
      ],
      ['keine Anrede, kein Gruß', /keine Anrede, kein Gruß/],
      ['kein Rat, keine Empfehlung, keine Diagnose', /kein Rat, keine Empfehlung, keine Diagnose/],
      ['keine Bewertung, keine Prognose', /keine Bewertung, keine Prognose/],
      ['nichts auslassen', /Nichts auslassen/],
      ['Zahlen als Ziffern', /Zahlen als Ziffern/],
      [
        'Körperseiten, Verneinungen, Unsicherheiten',
        /Körperseiten, Verneinungen[^\n]*Unsicherheiten/,
      ],
      ['im Zweifel der Wortlaut', /bleibt im Wortlaut des Abschnitts/],
    ])('nennt in den Regeln: %s', (_punkt, muster) => {
      expect(ENTWURF_REGELN).toMatch(muster);
      expect(zweck.regeln).toBe(ENTWURF_REGELN);
    });
  });

  describe('Antwort in Alltagssprache', () => {
    const zweck = ZWECKE['nachricht.alltagssprache'];

    it('gilt für denselben Gegenstand und dieselbe Länge wie das Ausformulieren', () => {
      expect(zweck.art).toBe('umformen');
      expect(zweck.gegenstand).toBe('rueckfrage');
      expect(zweck.aufgabe).toBe('alltagssprache');
      expect(zweck.eingabe).toEqual(ZWECKE['nachricht.entwurf'].eingabe);
    });

    it.each([
      ['dieselbe Aussage', /Die Aussage bleibt dieselbe/],
      [
        'Fachwörter ersetzen oder kurz erklären',
        /Fachwörter[^\n]*ersetzen oder in Klammern kurz erklären/,
      ],
      ['ein Satz je Abschnitt', /je Abschnitt[^\n]*genau ein Satz/],
      ['kein Rat, keine Empfehlung, keine Diagnose', /kein Rat, keine Empfehlung, keine Diagnose/],
      [
        'Zahlen, Seiten, Verneinungen bleiben',
        /Zahlen als Ziffern[^\n]*Körperseiten, Verneinungen/,
      ],
      ['ohne Fachwort im Wortlaut', /Ein Satz ohne Fachwort bleibt im Wortlaut/],
    ])('nennt in den Regeln: %s', (_punkt, muster) => {
      expect(ALLTAG_REGELN).toMatch(muster);
      expect(zweck.regeln).toBe(ALLTAG_REGELN);
    });
  });

  describe('Verlauf in Auszügen', () => {
    const zweck = ZWECKE['verlauf.auszug'];

    it('nimmt wenige Einträge und prüft an der Akte', () => {
      expect(zweck.art).toBe('auszug');
      expect(zweck.gegenstand).toBe('akte');
      expect(zweck.eingabe).toEqual({
        hoechstEintraege: AUSZUG_HOECHST_EINTRAEGE,
        hoechstZeichen: AUSZUG_HOECHST_ZEICHEN,
        sprache: 'de',
      });
      expect([AUSZUG_HOECHST_EINTRAEGE, AUSZUG_HOECHST_ZEICHEN]).toEqual([12, 60_000]);
      expect(zweck.ausgabe).toEqual({ hoechstJeEintrag: 2, titel: DIKTAT_ABSCHNITTE });
      expect(AUSZUG_HOECHST_JE_EINTRAG).toBe(2);
    });

    it.each([
      ['auswählen, höchstens zwei Sätze', /je Eintrag höchstens zwei Sätze auswählen/],
      ['nur Stellen, kein Text', /nur Stellen[^\n]*Kein Text/],
      ['keine Reihenfolge nach Wichtigkeit', /keine Reihenfolge nach Wichtigkeit/],
      ['keine Zusammenfassung in eigenen Worten', /keine Zusammenfassung in eigenen Worten/],
      ['kein Verlaufsurteil', /kein Verlaufsurteil wie „besser“ oder „schlechter“/],
      [
        'keine Bewertung, Diagnose, Empfehlung',
        /keine Bewertung[^\n]*keine Diagnose, keine Empfehlung/,
      ],
      ['der Auszug ist unvollständig', /Der Auszug ist unvollständig/],
    ])('nennt in den Regeln: %s', (_punkt, muster) => {
      expect(AUSZUG_REGELN).toMatch(muster);
      expect(zweck.regeln).toBe(AUSZUG_REGELN);
    });
  });

  describe('Felder vom Foto', () => {
    const zweck = ZWECKE['verordnung.felder'];

    it('nimmt nur, was die Ablage nimmt, und prüft am Scan', () => {
      expect(zweck.art).toBe('felder');
      expect(zweck.gegenstand).toBe('scan');
      // ADR-017 Punkt 18: PDF, JPEG, PNG, höchstens 10 MB - nie SVG, HTML oder Office.
      expect([...SCAN_FORMATE].sort()).toEqual(['application/pdf', 'image/jpeg', 'image/png']);
      expect(SCAN_HOECHST_BYTES).toBe(10_485_760);
      expect(zweck.eingabe).toEqual({
        formate: SCAN_FORMATE,
        hoechstBytes: SCAN_HOECHST_BYTES,
        sprache: 'de',
      });
    });

    it('fragt nur nach den Feldern des Formulars, ohne Name und Geburtsdatum der Person', () => {
      expect(VERORDNUNG_FELDER).toEqual({
        ausgestellt_am: 1,
        art: 1,
        verordnende: 1,
        icd10: 1,
        diagnose: 1,
        heilmittel: 4,
        hausbesuch: 1,
      });
      expect(zweck.ausgabe.felder).toBe(VERORDNUNG_FELDER);
    });

    it.each([
      ['abschreiben, wie es dasteht', /zeilenweise so abschreiben, wie er dasteht/],
      ['nichts ergänzen oder korrigieren', /Nichts ergänzen, nichts korrigieren/],
      ['nur Stellen, kein Text', /nur die Stelle im erkannten Text[^\n]*Kein Text/],
      ['nichts raten', /Nichts raten oder ableiten/],
      ['keine Diagnose oder Kodierung ergänzen', /keine Diagnose, keine Kodierung, keine Menge/],
    ])('nennt in den Regeln: %s', (_punkt, muster) => {
      expect(FELDER_REGELN).toMatch(muster);
      expect(zweck.regeln).toBe(FELDER_REGELN);
    });
  });
});
