import type { ZodType } from 'zod';

/**
 * Die Antwort einer Serverfunktion gegen ihr Schema prüfen — und bei einer
 * unerwarteten Form denselben deutschen Satz werfen wie bei einem Fehler des
 * Servers (R3-023).
 *
 * `schema.parse(data)` wirft einen `ZodError`, dessen `message` ein englischer
 * JSON-Text ist (`[ { "expected": "number", "code": "invalid_type", … } ]`).
 * Die Seiten zeigen `mutation.error.message` unverändert an — damit stand der
 * Text im Bedienbildschirm. Er sagt niemandem, was zu tun ist
 * (`PROJECT_PRINCIPLES.md` §13), und er gehört auch sonst nicht dorthin.
 *
 * Der Satz ist derselbe wie im Fehlerfall daneben: Für die bedienende Person
 * ist es dieselbe Lage — der Vorgang ist nicht sicher durchgelaufen.
 */
export function antwort<T>(schema: ZodType<T>, data: unknown, satz: string): T {
  const geprueft = schema.safeParse(data);
  if (!geprueft.success) throw new Error(satz);
  return geprueft.data;
}
