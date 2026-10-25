import { describe, expect, it } from 'vitest';
import { erlaubteWerte } from '../../supabase/tests/helpers/migrationen';
import { EREIGNISARTEN } from './verlaufsereignisse';

describe('Ereignisarten (ANN-106, ANN-364)', () => {
  it.each(['patient_course_events_kind_check', 'training_course_events_kind_check'])(
    'sind dieselben wie in %s',
    (constraint) => {
      expect(erlaubteWerte(constraint)).toEqual([...EREIGNISARTEN]);
    },
  );
});
