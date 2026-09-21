import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import security from 'eslint-plugin-security';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['dist', 'coverage', 'playwright-report', 'test-results', '.tmp', 'node_modules'],
  },
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  // Statische Sicherheitsanalyse fuer JavaScript/TypeScript (ADR-013).
  security.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',

      /* detect-object-injection meldet in TypeScript praktisch jeden Zugriff
         auf ein Record mit typisiertem Schluessel. Der Compiler schliesst hier
         bereits aus, dass ein beliebiger String als Index landet; die uebrigen
         Regeln von eslint-plugin-security bleiben aktiv. */
      'security/detect-object-injection': 'off',

      /* ADR-011: keine patientenbezogenen Daten in Logs. console.log ist der
         haeufigste Weg, wie Nutzdaten unbeabsichtigt in Betriebslogs geraten.
         Erlaubt bleiben console.warn/error fuer technische Fehlermeldungen. */
      'no-console': ['error', { allow: ['warn', 'error'] }],

      /* ADR-015 / Sicherheitsregeln: service_role darf nie in den Browser. */
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/service_role/i]',
          message:
            'service_role darf niemals im Anwendungscode oder Browser-Bundle vorkommen (ADR-015).',
        },
      ],
    },
  },
  {
    /* ADR-019 Punkt 1 und 6: Fachcode spricht den providerneutralen Vertrag
       aus `src/lib/location/contract.ts`, nie einen Anbieter. Ein Import aus
       einem PTV-Modul waere der Punkt, an dem ein Anbieterwechsel wieder die
       Oberflaeche kostete - die Regel faengt ihn, bevor er entsteht
       (MAP-002, Akzeptanzkriterium 3). Die Nahtstelle fuer den Fachcode ist
       `src/lib/location/display.ts`. */
    files: ['src/features/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/ptv*'],
              message:
                'Fachcode kennt keinen Kartendienst: ueber src/lib/location/contract.ts und display.ts gehen (ADR-019 Punkt 1).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}', 'scripts/**/*'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // Werkzeuge unter scripts/ laufen in Node, nicht im Browser
    // (scripts/screenshots.mjs seit UI-000).
    files: ['scripts/**/*.{js,mjs,cjs}'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['supabase/tests/**/*.ts', 'tests/**/*.ts', 'src/**/*.test.{ts,tsx}'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      'no-restricted-syntax': 'off',

      /* Gate-Tests lesen den versionierten Baum: sie laufen ueber src/,
         marke/ und public/, um Regeln gegen den Quelltext zu pruefen. Die
         Pfade stammen aus dem Verzeichnis, nie aus einer Eingabe - ein
         Pfad-Sink ist das nicht. Fuer den Anwendungscode bleibt die Regel
         aktiv. */
      'security/detect-non-literal-fs-filename': 'off',
    },
  },
  prettier,
);
