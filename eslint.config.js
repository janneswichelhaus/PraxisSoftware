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
    files: ['**/*.{js,mjs,cjs}', 'scripts/**/*'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['supabase/tests/**/*.ts', 'tests/**/*.ts', 'src/**/*.test.{ts,tsx}'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      'no-restricted-syntax': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  prettier,
);
