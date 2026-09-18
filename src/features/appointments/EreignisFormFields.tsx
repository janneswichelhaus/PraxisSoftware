import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { Dialogfenster } from '@/components/ui/Dialogfenster';
import { todayInTimeZone, type EreignisFormValues, type Location } from './api';

/**
 * Eingabefelder eines Ereignisses (CAL-015c, CAL-017).
 *
 * Vom Eintragen und vom Bearbeiten gemeinsam genutzt: beide erfassen
 * Bezeichnung, Ort, Tag und die beiden freien Enden, und beide meinen damit
 * dasselbe. Was sich unterscheidet, ist die Frage nach den Beteiligten - beim
 * Eintragen eine Auswahl, beim Bearbeiten eine Liste - und die reicht die
 * jeweilige Seite als `beteiligte` herein.
 *
 * Die Prüfung hier ist Bedienkomfort. Verbindlich prüfen `create_appointment_event`
 * und `update_appointment_event` (ADR-004).
 */
type EreignisFeld = keyof EreignisFormValues;

export function EreignisFormFields({
  werte,
  fehler,
  onChange,
  standorte,
  zeitzone,
  rasterMinuten,
  beteiligte,
}: {
  werte: EreignisFormValues;
  fehler: Partial<Record<EreignisFeld, string>>;
  onChange: <F extends EreignisFeld>(feld: F, wert: EreignisFormValues[F]) => void;
  standorte: Location[];
  zeitzone?: string | null | undefined;
  /** Praxisraster in Minuten. Steuert die Schrittweite beider Enden (CAL-005). */
  rasterMinuten?: number | null | undefined;
  /** Die Frage nach den Beteiligten - je nach Vorgang verschieden. */
  beteiligte: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5">
      <Field
        label="Bezeichnung *"
        value={werte.title}
        error={fehler.title}
        maxLength={120}
        hint="Steht so im Kalender. Keine Angaben über Patient:innen."
        onChange={(e) => onChange('title', e.target.value)}
      />

      {beteiligte}

      <Select
        label="Ort *"
        value={werte.appointment_type}
        onChange={(e) =>
          onChange('appointment_type', e.target.value === 'video' ? 'video' : 'practice')
        }
      >
        <option value="practice">In der Praxis</option>
        <option value="video">Video</option>
      </Select>

      {werte.appointment_type === 'practice' ? (
        <Select
          label="Standort *"
          value={werte.location_id}
          error={fehler.location_id}
          onChange={(e) => onChange('location_id', e.target.value)}
        >
          <option value="">Bitte wählen …</option>
          {standorte.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
      ) : null}

      <Field
        label="Datum *"
        type="date"
        value={werte.date}
        error={fehler.date}
        min={zeitzone ? todayInTimeZone(zeitzone) : undefined}
        onChange={(e) => onChange('date', e.target.value)}
      />

      {/* Beide Enden im Raster: Anders als beim Behandlungstermin ist die
          Länge hier frei (§8.1) - gebunden bleibt sie ans Praxisraster,
          und das prüft der Server an beiden Enden. */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field
          label="Beginn *"
          type="time"
          value={werte.start_time}
          error={fehler.start_time}
          step={rasterMinuten ? rasterMinuten * 60 : undefined}
          hint={rasterMinuten ? `Praxisraster: ${rasterMinuten} Minuten` : undefined}
          onChange={(e) => onChange('start_time', e.target.value)}
        />
        <Field
          label="Ende *"
          type="time"
          value={werte.end_time}
          error={fehler.end_time}
          step={rasterMinuten ? rasterMinuten * 60 : undefined}
          hint="Frei wählbar, im Praxisraster."
          onChange={(e) => onChange('end_time', e.target.value)}
        />
      </div>
    </div>
  );
}

/**
 * Die Rückfrage „außerhalb der Arbeitszeit" für Ereignisse (CAL-005).
 *
 * Wie beim Termin eine Warnung, keine Grenze - der Text ist ein anderer, weil
 * es hier mehrere Beteiligte gibt und weil der Server den **ganzen** Vorgang
 * abgewiesen hat, nicht die Hälfte.
 */
export function EreignisArbeitszeitRueckfrage({
  beschriftung,
  laeuft,
  onBestaetigen,
  onAbbrechen,
}: {
  beschriftung: string;
  laeuft: boolean;
  onBestaetigen: () => void;
  onAbbrechen: () => void;
}) {
  // Seit FIX-016 ein Fenster ueber dem Formular (BEF-016), wie beim
  // Behandlungstermin.
  return (
    <Dialogfenster titel="Außerhalb der Arbeitszeit" onSchliessen={onAbbrechen}>
      <p className="text-ink text-sm">
        Mindestens eine beteiligte Person hat zu dieser Zeit keine hinterlegte Arbeitszeit. Es wurde
        noch nichts geschrieben.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button type="button" disabled={laeuft} data-autofocus onClick={onBestaetigen}>
          {beschriftung}
        </Button>
        <Button type="button" variant="quiet" disabled={laeuft} onClick={onAbbrechen}>
          Zurück zum Formular
        </Button>
      </div>
    </Dialogfenster>
  );
}
