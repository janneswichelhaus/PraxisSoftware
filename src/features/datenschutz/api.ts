import { z } from 'zod';
import { getSupabase } from '@/lib/supabase';

/**
 * Betroffenenrechte: Auskunft und Aufbewahrungsstand (OPS-006).
 *
 * Beide Wege laufen über eine Datenbankfunktion, die `owner`-Rolle und
 * Organisation selbst prüft — es gibt kein SELECT-Recht, das dieselbe Kopie
 * zusammensetzen könnte. Die Oberfläche kann diese Prüfung nicht umgehen
 * (ADR-004); sie blendet den Zugang nur aus, was keine Zugriffskontrolle ist.
 */

const auskunftSchema = z.object({
  erstellt_am: z.string(),
  organisation: z.string().nullable(),
  patient_id: z.string(),
  rechtsgrundlage: z.string(),
  /**
   * Ein Schlüssel je Tabelle, die Zeilen darunter. Bewusst ohne Schema je
   * Spalte: Was in der Kopie steht, entscheidet die Datenbankfunktion, und ein
   * zweites Feldverzeichnis hier wäre die Stelle, an der beide auseinander
   * laufen. Die Oberfläche zeigt Abschnitte und Anzahlen, die Datei den Inhalt.
   */
  tabellen: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
  nicht_enthalten: z.array(z.object({ was: z.string(), grund: z.string() })),
});

export type Auskunft = z.infer<typeof auskunftSchema>;

export async function fetchAuskunft(patientId: string): Promise<Auskunft> {
  // Ohne generierte Datenbanktypen liefert rpc() `any`. Die Antwort wird
  // deshalb als `unknown` behandelt und ausschliesslich über Zod validiert.
  const { data, error } = (await getSupabase().rpc('export_patient_record', {
    p_patient_id: patientId,
  })) as { data: unknown; error: unknown };

  if (error) throw new Error('Die Auskunft konnte nicht erstellt werden.');
  return auskunftSchema.parse(data);
}

const klasseSchema = z.object({
  key: z.string(),
  legal_reference: z.string().nullable(),
  anchor: z.string(),
  /** Tag, ab dem die Frist läuft; leer, solange der Anker fehlt. */
  anker_datum: z.string().nullable(),
  /** Letzter Tag der Aufbewahrung. */
  frist_ende: z.string().nullable(),
  /** Zeitpunkt, ab dem gelöscht werden darf (Mitternacht der Praxiszeitzone). */
  loeschbar_ab: z.string().nullable(),
  datensaetze: z.number(),
});

export type Aufbewahrungsklasse = z.infer<typeof klasseSchema>;

const standSchema = z.object({
  patient_id: z.string(),
  zeitzone: z.string(),
  versorgung_abgeschlossen_am: z.string().nullable(),
  klassen: z.array(klasseSchema),
  loeschsperre: z.object({ seit: z.string(), grund: z.string() }).nullable(),
});

export type Aufbewahrungsstand = z.infer<typeof standSchema>;

export async function fetchAufbewahrungsstand(patientId: string): Promise<Aufbewahrungsstand> {
  const { data, error } = (await getSupabase().rpc('patient_retention_status', {
    p_patient_id: patientId,
  })) as { data: unknown; error: unknown };

  if (error) throw new Error('Der Aufbewahrungsstand konnte nicht geladen werden.');
  return standSchema.parse(data);
}
