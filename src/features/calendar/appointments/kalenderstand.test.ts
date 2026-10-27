import { beforeEach, describe, expect, it } from 'vitest';
import { letzterKalenderstand, merkeKalenderstand, vergissKalenderstaende } from './kalenderstand';

describe('Kalenderstand (BEF-073)', () => {
  beforeEach(() => vergissKalenderstaende());

  it('liefert den gemerkten Stand desselben Tages', () => {
    merkeKalenderstand('u1', new URLSearchParams('ansicht=tag&datum=2027-05-12'), '2027-05-12');
    expect(letzterKalenderstand('u1', '2027-05-12')?.toString()).toBe(
      'ansicht=tag&datum=2027-05-12',
    );
  });

  it('vergisst ihn am nächsten Tag und kennt keinen fremden Benutzer', () => {
    merkeKalenderstand('u1', new URLSearchParams('ansicht=tag&datum=2027-05-12'), '2027-05-12');
    expect(letzterKalenderstand('u1', '2027-05-13')).toBeNull();
    expect(letzterKalenderstand('u2', '2027-05-12')).toBeNull();
  });
});
