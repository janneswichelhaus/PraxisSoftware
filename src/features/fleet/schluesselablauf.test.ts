import { describe, expect, it } from 'vitest';
import {
  beginn,
  empfaenger,
  meldung,
  personName,
  personNachRadwahl,
  radZeile,
  raederZurWahl,
  schluesselOrt,
  schrittnummer,
  vonText,
  vorgang,
} from './schluesselablauf';
import { ANNA, NINA, TIM, testFlotte, testRad } from './testdaten';

/**
 * Schlüssel übergeben (Überholung 6, G4): welche Räder und Personen zur Wahl
 * stehen, wo der Ablauf beginnt, welcher Knopf am Ende steht.
 */

const BEI_TIM = testRad({
  id: 'rad-2',
  name: 'Lastenrad 2',
  key: { holder_staff_id: TIM.id, holder_name: TIM.name, taken_at: '2026-10-15T05:40:00Z' },
});
const BEI_ANNA = testRad({
  id: 'rad-6',
  name: 'Lastenrad 6',
  key: { holder_staff_id: ANNA.id, holder_name: ANNA.name, taken_at: '2026-10-15T05:40:00Z' },
});
const IM_TRESOR = testRad({ id: 'rad-4', name: 'Lastenrad 4' });

function flotte() {
  const start = testFlotte();
  return { ...start, bikes: [...start.bikes, BEI_TIM, BEI_ANNA] };
}

describe('Schlüssel übergeben – Auswahl', () => {
  it('bietet Räder mit Schlüssel im Tresor und bei jemandem an, gesperrte nicht', () => {
    expect(raederZurWahl(flotte()).map((rad) => rad.id)).toEqual([
      'rad-1',
      'rad-4',
      'rad-5',
      'rad-2',
      'rad-6',
    ]);
  });

  it('sagt an der Zeile, wo der Schlüssel liegt und wo das Rad steht', () => {
    const daten = flotte();
    expect(radZeile(IM_TRESOR, daten)).toBe('Schlüssel im Tresor · Raddepot Nord');
    expect(radZeile(BEI_TIM, daten)).toBe('Schlüssel bei Tim Teamleitung · Raddepot Nord');
    expect(schluesselOrt(BEI_ANNA, ANNA.id)).toBe('Schlüssel bei Ihnen');
    expect(schluesselOrt(BEI_ANNA, null)).toBe('Schlüssel bei Anna Beispiel');
  });

  it('stellt die eigene Person mit „(Sie)“ an den Anfang und lässt die heutige Halter:in weg', () => {
    const daten = flotte();
    expect(empfaenger(daten, IM_TRESOR).map((person) => personName(person, ANNA.id))).toEqual([
      'Anna Beispiel (Sie)',
      'Nina Neu',
      'Tim Teamleitung',
    ]);
    expect(empfaenger(daten, BEI_TIM).map((person) => person.id)).toEqual([ANNA.id, NINA.id]);
    // Liegt der Schlüssel bei mir, bin ich nicht dabei.
    expect(empfaenger(daten, BEI_ANNA).map((person) => person.id)).toEqual([NINA.id, TIM.id]);
    // Ohne eigenen Mitarbeiterdatensatz: der Stamm in seiner Reihenfolge.
    expect(
      empfaenger({ ...daten, my_staff_member_id: null }, IM_TRESOR).map((person) => person.id),
    ).toEqual([ANNA.id, NINA.id, TIM.id]);
  });
});

describe('Schlüssel übergeben – Beginn und Wechsel', () => {
  it('beginnt mit einem Rad aus der Adresse gleich bei „An wen?“', () => {
    expect(beginn(flotte(), 'rad-2')).toEqual({ seite: 'person', radId: 'rad-2' });
    expect(beginn(flotte(), 'rad-4')).toEqual({ seite: 'person', radId: 'rad-4' });
  });

  it('übernimmt kein gesperrtes oder unbekanntes Rad aus der Adresse', () => {
    expect(beginn(flotte(), 'rad-3')).toEqual({ seite: 'rad', radId: null });
    expect(beginn(flotte(), 'rad-weg')).toEqual({ seite: 'rad', radId: null });
    expect(beginn(flotte(), null)).toEqual({ seite: 'rad', radId: null });
  });

  it('behält die Person nach einem anderen Rad, außer der Schlüssel liegt schon bei ihr', () => {
    expect(personNachRadwahl(IM_TRESOR, TIM.id)).toBe(TIM.id);
    expect(personNachRadwahl(BEI_TIM, TIM.id)).toBeNull();
    expect(personNachRadwahl(BEI_TIM, NINA.id)).toBe(NINA.id);
    expect(personNachRadwahl(BEI_TIM, null)).toBeNull();
  });

  it('zählt das Rad als Schritt 1, auch wenn es aus der Adresse kommt', () => {
    expect((['rad', 'person', 'abschluss'] as const).map(schrittnummer)).toEqual([1, 2, 3]);
  });
});

describe('Schlüssel übergeben – Abschluss', () => {
  it('trägt einen Schlüssel aus dem Tresor ein - für sich ohne Personenangabe', () => {
    expect(vorgang(IM_TRESOR, ANNA, ANNA.id)).toEqual({
      art: 'eintragen',
      holderStaffId: null,
      knopf: 'Schlüssel eintragen',
      laeuft: 'Wird eingetragen …',
    });
    expect(vorgang(IM_TRESOR, TIM, ANNA.id)).toMatchObject({
      art: 'eintragen',
      holderStaffId: TIM.id,
    });
    expect(vonText(IM_TRESOR, ANNA.id)).toBe('Tresor');
  });

  it('übergibt einen Schlüssel bei jemandem von Hand zu Hand, auch an sich selbst', () => {
    expect(vorgang(BEI_TIM, NINA, ANNA.id)).toEqual({
      art: 'uebergeben',
      holderStaffId: NINA.id,
      knopf: 'Schlüssel an Nina Neu übergeben',
      laeuft: 'Wird übergeben …',
    });
    expect(vorgang(BEI_TIM, ANNA, ANNA.id)).toMatchObject({
      art: 'uebergeben',
      holderStaffId: ANNA.id,
      knopf: 'Schlüssel an Anna Beispiel übergeben',
    });
    expect(vonText(BEI_TIM, ANNA.id)).toBe('Tim Teamleitung');
    expect(vonText(BEI_ANNA, ANNA.id)).toBe('Anna Beispiel (Sie)');
  });

  it('sagt danach, was geschah - beim Eintragen in den Worten von bisher', () => {
    expect(meldung(IM_TRESOR, ANNA, ANNA.id)).toBe(
      'Schlüssel von Lastenrad 4 bei Ihnen eingetragen.',
    );
    expect(meldung(IM_TRESOR, TIM, ANNA.id)).toBe(
      'Schlüssel von Lastenrad 4 bei Tim Teamleitung eingetragen.',
    );
    expect(meldung(BEI_TIM, NINA, ANNA.id)).toBe(
      'Schlüssel von Lastenrad 2 an Nina Neu übergeben.',
    );
    expect(meldung(BEI_TIM, ANNA, ANNA.id)).toBe('Schlüssel von Lastenrad 2 an Sie übergeben.');
  });
});
