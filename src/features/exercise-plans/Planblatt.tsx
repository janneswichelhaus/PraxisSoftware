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
 */

export interface BlattPosition extends Dosis {
  position: number;
  variant_lay_name: string;
  instruction: string | null;
  equipment: string[];
  note: string | null;
}

export interface BlattPlan {
  title: string;
  service_area: 'therapy' | 'training';
  sessions_per_week: number | null;
  runs_from: string | null;
  runs_until: string | null;
  items: BlattPosition[];
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
    <article aria-label="Planblatt" className="max-w-[210mm]">
      <div className="border-line border-b pb-3">
        {praxis ? <p className="text-ink-muted print:text-ink text-sm">{praxis}</p> : null}
        <p className="text-ink-muted print:text-ink mt-1 text-sm">
          {plan.service_area === 'therapy' ? 'Ihr Übungsplan' : 'Ihr Trainingsplan'}
          {fuer ? ` für ${fuer}` : ''}
        </p>
        <h2 className="mt-1 text-xl font-semibold">{plan.title}</h2>
        <p className="mt-1 text-sm">{zeitraum(plan)}</p>
        {plan.sessions_per_week ? (
          <p className="mt-1 text-sm">{haeufigkeit(plan.sessions_per_week)}</p>
        ) : null}
      </div>
      <ol className="mt-4 flex flex-col gap-4">
        {plan.items.map((p) => (
          <li key={p.position} className="border-line border-b pb-4 last:border-b-0">
            <h3 className="font-semibold">
              {p.position}. {p.variant_lay_name}
            </h3>
            <p className="mt-1">{dosierungAlltag(p)}</p>
            {p.instruction ? <p className="mt-1">{p.instruction}</p> : null}
            {p.equipment.length > 0 ? (
              <p className="text-ink-muted print:text-ink mt-1 text-sm">
                Sie brauchen: {p.equipment.join(', ')}
              </p>
            ) : null}
            {p.note ? (
              <p className="mt-1">
                <span className="font-semibold">Hinweis: </span>
                {p.note}
              </p>
            ) : null}
          </li>
        ))}
      </ol>
      <p className="text-ink-muted print:text-ink mt-6 text-sm">
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
