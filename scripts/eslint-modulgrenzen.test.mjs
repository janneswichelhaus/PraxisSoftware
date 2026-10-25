import { join } from 'node:path';
import { RuleTester } from 'eslint';
import { describe, expect, it } from 'vitest';
import modulgrenzen, { tieferImport } from './eslint-modulgrenzen.mjs';

const nurTermine = (modul) => modul === 'appointments';
const HEUTE = 'src/features/today/MyDayPage.tsx';

describe('tieferImport', () => {
  it('meldet den Griff an der index.ts eines anderen Moduls vorbei', () => {
    expect(tieferImport(HEUTE, '@/features/appointments/api', nurTermine)).toBe('appointments');
    expect(tieferImport(HEUTE, '../appointments/haken', nurTermine)).toBe('appointments');
  });

  it('lässt die Schnittstelle, das eigene Modul und Module ohne index.ts durch', () => {
    expect(tieferImport(HEUTE, '@/features/appointments', nurTermine)).toBeNull();
    expect(tieferImport(HEUTE, '@/features/appointments/index', nurTermine)).toBeNull();
    expect(
      tieferImport('src/features/appointments/CalendarPage.tsx', './api', nurTermine),
    ).toBeNull();
    expect(
      tieferImport('src/features/appointments/x.ts', '@/features/appointments/api', nurTermine),
    ).toBeNull();
    expect(tieferImport(HEUTE, '@/features/patients/api', nurTermine)).toBeNull();
    expect(tieferImport(HEUTE, '@/lib/termin', nurTermine)).toBeNull();
    expect(tieferImport(HEUTE, 'react', nurTermine)).toBeNull();
  });
});

describe('Regel nur-ueber-index am Baum', () => {
  RuleTester.describe = describe;
  RuleTester.it = it;
  RuleTester.itOnly = it.only;
  const pruefer = new RuleTester({
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  });
  const in_ = (pfad) => join(import.meta.dirname, '..', pfad);

  pruefer.run('nur-ueber-index', modulgrenzen.rules['nur-ueber-index'], {
    valid: [
      { code: "import { hakenFehlt } from '@/features/appointments';", filename: in_(HEUTE) },
      {
        code: "import { fetchAppointment } from './api';",
        filename: in_('src/features/appointments/a.ts'),
      },
    ],
    invalid: [
      {
        code: "import { hakenFehlt } from '@/features/appointments/haken';",
        filename: in_(HEUTE),
        errors: [{ messageId: 'tief' }],
      },
      {
        code: "export { fetchAppointment } from '@/features/appointments/api';",
        filename: in_('src/app/x.ts'),
        errors: [{ messageId: 'tief' }],
      },
      {
        code: "const seite = import('@/features/appointments/CalendarPage');",
        filename: in_(HEUTE),
        errors: [{ messageId: 'tief' }],
      },
    ],
  });
});
