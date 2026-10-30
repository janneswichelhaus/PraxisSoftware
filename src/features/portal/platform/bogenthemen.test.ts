import { describe, expect, it } from 'vitest';
import type { Antworten } from '@/features/clinical/assessments/antworten';
import type { ScoreItem } from '@/features/clinical/assessments/schema';
import { bogenschritte } from './bogenschritte';
import {
  ankerSatz,
  beginn,
  bogenthemen,
  frageText,
  istJaNein,
  offeneFragen,
  offenText,
  seitentitel,
  sichtbar,
} from './bogenthemen';
import { fuerDiePlattform } from './instrumentwahl';

/**
 * Der Anamnesebogen in 14 Themen (Handoff Selbstauskunft, 5.2): jedes Item der Vorlage außer dem
 * Feld der Praxis in genau einem Thema, in der Folge der Vorlage; jede andere Vorlage nach der Regel
 * der Schritte.
 */
const anamnese = fuerDiePlattform()[0]!;
const themen = bogenthemen(anamnese);
const item = (id: string): ScoreItem => anamnese.items.find((i) => i.id === id)!;
const thema = (titel: string) => themen.find((t) => t.titel === titel)!;

describe('bogenthemen', () => {
  it('teilt den Anamnesebogen in die 14 Themen der Tabelle', () => {
    expect(themen.map((t) => [t.titel, t.fragen.length])).toEqual([
      ['Zu Ihrer Person', 2],
      ['Wo haben Sie Beschwerden?', 1],
      ['Ihre Schmerzen heute', 2],
      ['Schmerzen, Beweglichkeit und Kraft', 3],
      ['Wie fühlen sich die Beschwerden an?', 2],
      ['Seit wann und wie?', 3],
      ['Was verbessert, was verschlechtert?', 2],
      ['Die vergangenen zwei Wochen', 8],
      ['Ihre Einschätzung', 2],
      ['Beobachtungen der letzten Wochen', 3],
      ['Vorerkrankungen und Ereignisse', 7],
      ['Medikamente', 1],
      ['Alltag und Lebensstil', 7],
      ['Untersuchungen, Erwartungen und Ziele', 2],
    ]);
  });

  it('stellt jedes Item außer dem Feld der Praxis genau einmal, in der Folge der Vorlage', () => {
    const kennungen = themen.flatMap((t) => t.fragen.map((f) => f.item.id));
    const vorlage = anamnese.items.filter((i) => i.ausgefuellt_von !== 'therapeut');
    expect(kennungen).toEqual(vorlage.map((i) => i.id));
    expect(kennungen).toHaveLength(45);
    expect(new Set(kennungen).size).toBe(45);
    // Das Feld der Praxis steht in keinem Thema.
    expect(anamnese.items.some((i) => i.ausgefuellt_von === 'therapeut')).toBe(true);
    expect(
      themen.flatMap((t) => t.fragen).some((f) => f.item.ausgefuellt_von === 'therapeut'),
    ).toBe(false);
  });

  it('kennt drei Zeilen für 8 und 39, Folgefragen zu 26 mit „ja“ und Linien in Thema 8', () => {
    const fragen = themen.flatMap((t) => t.fragen);
    expect(fragen.filter((f) => f.mehrzeilig).map((f) => f.item.id)).toEqual([
      'weitere_beschwerden',
      'erwartungen_ziele',
    ]);
    expect(fragen.filter((f) => f.folgeVon).map((f) => [f.item.id, f.folgeVon])).toEqual([
      ['tumor_welcher', { itemId: 'tumor', wahl: 'ja' }],
      ['tumor_wann', { itemId: 'tumor', wahl: 'ja' }],
      ['tumor_nachuntersuchung', { itemId: 'tumor', wahl: 'ja' }],
    ]);
    expect(themen.filter((t) => t.linien).map((t) => t.titel)).toEqual([
      'Die vergangenen zwei Wochen',
    ]);
  });

  it('zeigt den Wortlaut ohne Hinweise für Papier und ohne Doppelpunkt am Ende', () => {
    expect(frageText(item('beruf'))).toBe('Beruf');
    expect(frageText(item('sport_hobby'))).toBe('Sport/Hobby');
    expect(frageText(item('beschwerden_ort'))).toBe('1. Wo haben Sie Ihre Beschwerden?');
    expect(frageText(item('schmerzstaerke'))).toBe('3. Wie stark sind Ihre Schmerzen?');
    expect(frageText(item('schmerz_durchschnitt'))).toBe(
      '13. Wie stark waren Ihre Schmerzen im Durchschnitt?',
    );
    // Die Aufzählung der Antworten in der Frage bleibt, auch mit Doppelpunkt mitten im Satz.
    expect(frageText(item('schmerzart'))).toBe(
      '4. Haben Sie: Ruheschmerzen, Nachtschmerzen, Dauerschmerzen?',
    );
    for (const frage of themen.flatMap((t) => t.fragen)) {
      expect(frageText(frage.item)).not.toMatch(/\(bitte |:$/);
    }
  });

  it('trägt in einem Thema mit einer Frage die Frage als Titel', () => {
    expect(seitentitel(thema('Wo haben Sie Beschwerden?'))).toBe(
      '1. Wo haben Sie Ihre Beschwerden?',
    );
    expect(seitentitel(thema('Medikamente'))).toMatch(/^30\. Nehmen Sie momentan Medikamente/);
    expect(seitentitel(thema('Ihre Schmerzen heute'))).toBe('Ihre Schmerzen heute');
  });

  it('setzt den Satz der Anker und erkennt ja/nein', () => {
    expect(ankerSatz(item('schmerzstaerke'))).toBe(
      '0 heißt „kein Schmerz“, 10 heißt „maximaler Schmerz“.',
    );
    expect(ankerSatz(item('stress_arbeit'))).toBe(
      '0 heißt „kein Stress“, 10 heißt „maximaler Stress“.',
    );
    expect(ankerSatz(item('beruf'))).toBeNull();
    expect(istJaNein(item('tumor'))).toBe(true);
    expect(istJaNein(item('beschwerden_zeitlich'))).toBe(false);
    expect(istJaNein(item('schmerzart'))).toBe(false);
  });

  it('zählt offene Fragen; Folgefragen zu 26 erst mit „ja“ oder mit einer Antwort', () => {
    const vorerkrankungen = thema('Vorerkrankungen und Ereignisse');
    const folge = vorerkrankungen.fragen.find((f) => f.item.id === 'tumor_wann')!;
    expect(offeneFragen(vorerkrankungen, {})).toBe(4);
    expect(sichtbar(folge, {})).toBe(false);
    const nein: Antworten = { tumor: { auswahl: 'nein' } };
    expect(sichtbar(folge, nein)).toBe(false);
    expect(offeneFragen(vorerkrankungen, nein)).toBe(3);
    const ja: Antworten = { tumor: { auswahl: 'ja' } };
    expect(sichtbar(folge, ja)).toBe(true);
    expect(offeneFragen(vorerkrankungen, ja)).toBe(6);
    // Aus einem Entwurf: Eine Folgefrage mit Antwort bleibt sichtbar, auch ohne „ja“.
    expect(sichtbar(folge, { ...nein, tumor_wann: { text: '2019' } })).toBe(true);
    expect(offenText(1)).toBe('1 Frage offen');
    expect(offenText(2)).toBe('2 Fragen offen');
  });

  it('öffnet nach dem letzten Thema mit Antwort, nach dem letzten beim Abschluss', () => {
    expect(beginn(themen, {})).toBe(0);
    expect(beginn(themen, { beruf: { text: 'Lehrerin' } })).toBe(1);
    expect(beginn(themen, { beruf: { text: 'Lehrerin' }, schmerzstaerke: { wert: 4 } })).toBe(3);
    expect(beginn(themen, { erwartungen_ziele: { text: 'Wieder Rad fahren' } })).toBe(14);
    // Das Feld der Praxis zählt nicht.
    expect(beginn(themen, { anmerkungen_therapeut: { text: 'x' } })).toBe(0);
  });

  it('behält für eine andere Vorlage oder Fassung die Regel der Schritte, ohne Feld der Praxis', () => {
    const andere = { ...anamnese, meta: { ...anamnese.meta, id: 'andere_vorlage' } };
    const schritte = bogenthemen(andere);
    const ohnePraxis = anamnese.items.filter((i) => i.ausgefuellt_von !== 'therapeut');
    expect(schritte.map((s) => s.fragen.map((f) => f.item.id))).toEqual(
      bogenschritte(ohnePraxis).map((s) => s.map((i) => i.id)),
    );
    expect(schritte[0]!.titel).toBe('Fragen 1 bis 6');
    // Passt der Plan nicht mehr zur Fassung, gilt ebenfalls die Regel.
    const gekuerzt = { ...anamnese, items: anamnese.items.filter((i) => i.id !== 'rauchen') };
    expect(bogenthemen(gekuerzt).map((t) => t.titel)).not.toContain('Alltag und Lebensstil');
  });
});
