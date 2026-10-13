import type { Uebungsbild as Bild } from '@/features/exercises/bild/schema';
import { Uebungsbild } from '@/features/exercises/bild/Uebungsbild';
import { formatDate } from '@/lib/datum';
import { dosierungAlltag, haeufigkeit, type Dosis } from './dosierung';

/**
 * Der zugewiesene Plan als Blatt (UEB-008, ANN-303) - zum Ausdrucken oder als
 * PDF über den Druckdialog des Browsers, dieselbe Technik wie Rechnung und
 * Terminzettel. Das Blatt hat den vollen Nutzen ohne Plattform: Wer kein
 * Konto hat, bekommt seinen Plan auf Papier (ADR-023 Punkt 7).
 *
 * **Reine Darstellung, kein Datenzugriff.** Die Praxis (`PlanblattSeite`) und
 * die Plattform (UEB-009) reichen den Plan aus ihrer eigenen Quelle herein;
 * das Blatt zeigt nur den **Schnappschuss** der Zuweisung in Alltagssprache
 * (ANN-300, IDEA-QSN-002) - nie die fachlichen Bezeichnungen, nie die
 * Bibliothek von heute. Kein Kopf in einem `header`: Er soll gedruckt werden
 * (`src/index.css`, UXR-001).
 *
 * Welle B (Profil „Druckblatt“): je Übung das eingefrorene Bild - Start und
 * Ende -, der Name, die Dosierung und die Anleitung in nummerierten
 * Schritten. Groß gesetzt (18 px, Überschriften 20 bis 24 px): Für ältere
 * Patient:innen im Hausbesuch ist das Papier oft das Hauptmedium. Eine Übung
 * bricht nicht über zwei Seiten.
 */

export interface BlattPosition extends Dosis {
  position: number;
  variant_lay_name: string;
  instruction: string | null;
  equipment: string[];
  note: string | null;
  /** UEB-012: das beim Zuweisen eingefrorene Bild (ANN-381); ohne Bild nur Text. */
  illustration?: Bild | null;
}

export interface BlattPlan {
  title: string;
  service_area: 'therapy' | 'training';
  sessions_per_week: number | null;
  runs_from: string | null;
  runs_until: string | null;
  items: BlattPosition[];
}

/** Die Anleitung in Schritten - je Zeile einer (Katalog), sonst ein Absatz. */
function schritte(text: string | null): string[] {
  return (text ?? '')
    .split('\n')
    .map((zeile) => zeile.trim())
    .filter(Boolean);
}

export function Planblatt({
  plan,
  praxis,
  fuer,
}: {
  plan: BlattPlan;
  praxis: string | null;
  /** Der Name der Person - auf dem Blatt der Praxis, nicht auf der Plattform. */
  fuer?: string;
}) {
  return (
    <article aria-label="Planblatt" className="text-ink max-w-[210mm] text-lg">
      <div className="border-line border-b pb-3">
        {praxis ? <p className="text-ink-muted print:text-ink text-base">{praxis}</p> : null}
        <p className="text-ink-muted print:text-ink mt-1 text-base">
          {plan.service_area === 'therapy' ? 'Ihr Übungsplan' : 'Ihr Trainingsplan'}
          {fuer ? ` für ${fuer}` : ''}
        </p>
        <h2 className="text-h3 mt-1 font-bold">{plan.title}</h2>
        <p className="mt-1">{zeitraum(plan)}</p>
        {plan.sessions_per_week ? (
          <p className="mt-1">{haeufigkeit(plan.sessions_per_week)}</p>
        ) : null}
      </div>
      <ol className="mt-4 flex flex-col gap-5">
        {plan.items.map((p) => {
          const anleitung = schritte(p.instruction);
          return (
            <li
              key={p.position}
              className="border-line break-inside-avoid border-b pb-5 last:border-b-0"
            >
              <h3 className="text-h4 font-bold">
                {p.position}. {p.variant_lay_name}
              </h3>
              {p.illustration ? (
                <div className="mt-2 max-w-[120mm]">
                  <Uebungsbild
                    bild={p.illustration}
                    name={p.variant_lay_name}
                    darstellung="start-ende"
                  />
                </div>
              ) : null}
              <p className="mt-2 font-semibold">{dosierungAlltag(p)}</p>
              {anleitung.length > 1 ? (
                <ol className="mt-2 flex list-decimal flex-col gap-1 pl-6">
                  {anleitung.map((schritt, index) => (
                    <li key={index}>{schritt}</li>
                  ))}
                </ol>
              ) : anleitung.length === 1 ? (
                <p className="mt-2">{anleitung[0]}</p>
              ) : null}
              {p.equipment.length > 0 ? (
                <p className="mt-2">Sie brauchen: {p.equipment.join(', ')}</p>
              ) : null}
              {p.note ? (
                <p className="mt-2">
                  <span className="font-semibold">Hinweis: </span>
                  {p.note}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
      <p className="text-ink-muted print:text-ink mt-6 text-base">
        Fragen zu den Übungen? Sprechen Sie uns beim nächsten Termin an.
      </p>
    </article>
  );
}

function zeitraum(plan: Pick<BlattPlan, 'runs_from' | 'runs_until'>): string {
  if (plan.runs_from && plan.runs_until) {
    return `Gültig vom ${formatDate(plan.runs_from)} bis ${formatDate(plan.runs_until)}`;
  }
  return plan.runs_from ? `Gültig ab ${formatDate(plan.runs_from)}` : '';
}
