import { formatLocalTime, formatLocalTimeRange } from '@/features/appointments/api';
import { adressZeilen, dayPlanStatusLabels, rufnummern, type DayPlanEntry } from './api';
import { zugangMitStockwerk } from './stockwerk';
import { einordnung, terminName } from './tagesstart';

/**
 * Der eigene Tag auf Papier - der Papierweg für den Ausfall (BEF-052,
 * ANN-021 Fassung 3, ADR-012 Punkt 9).
 *
 * Am Bildschirm unsichtbar (`hidden`, auch für Vorlesesoftware), im Druck das
 * Einzige auf der Seite: Der Zeitstrahl zeigt Rufnummern nur hinter dem
 * Info-Knopf und Anschriften nur an der ausgeklappten Karte. Auf Papier stand
 * deshalb bis UX-009a keine Rufnummer und nur eine Anschrift - im Ausfall
 * hilft das nicht. Hier steht **jeder** eigene Termin des Tages mit Uhrzeit,
 * Name, Anschrift, Etage, Zugangshinweis, Besonderheit und Rufnummern, also
 * genau, was das Handy hinter dem Info-Knopf zeigt, und nichts aus der Akte.
 *
 * Die Quelle ist dieselbe Liste wie am Bildschirm (`list_day_plan`); es gibt
 * keinen eigenen Lesepfad und keinen Export (ANN-021). Ist die Liste nicht
 * frisch, sagt das Blatt, von wann sie ist.
 */
export function TagesplanDruck({
  termine,
  name,
  datum,
  zeitzone,
  standVon,
}: {
  termine: readonly DayPlanEntry[];
  /** Der Name der Person, deren Tag es ist. */
  name: string;
  /** „Montag, 4. Januar 2027". */
  datum: string;
  zeitzone: string;
  /** Zeitpunkt des Ladens, wenn die Liste nicht mehr frisch ist. */
  standVon: number | null;
}) {
  return (
    // `aria-hidden`: am Bildschirm ist das Blatt ohnehin nicht da; so bleibt
    // es auch aus dem Baum der Vorlesesoftware, wo CSS nicht greift.
    <section className="hidden print:block" aria-hidden="true" data-testid="tagesplan-druck">
      <h1 className="text-h4 font-bold">Tagesplan · {datum}</h1>
      <p className="mt-1 text-sm">
        {name}
        {standVon !== null
          ? ` · Stand ${formatLocalTime(new Date(standVon).toISOString(), zeitzone)} Uhr, kann veraltet sein`
          : ''}
      </p>

      {termine.length === 0 ? (
        <p className="mt-4">Keine Termine an diesem Tag.</p>
      ) : (
        <ol className="border-line mt-4 border-t">
          {termine.map((termin) => (
            <DruckZeile key={termin.id} termin={termin} />
          ))}
        </ol>
      )}
    </section>
  );
}

function DruckZeile({ termin }: { termin: DayPlanEntry }) {
  const zone = termin.organization_time_zone;
  const art = einordnung(termin);
  const anschrift = adressZeilen(termin).join(', ');
  const { stockwerk, rest: zugang } = zugangMitStockwerk(termin.home_visit_access_note);
  const besonderheit = termin.special_note?.trim() || null;
  const nummern = rufnummern(termin);
  // „Steht aus" ist der Regelfall und steht nicht da (UX-005h).
  const zustand = termin.status !== 'confirmed' ? dayPlanStatusLabels[termin.status] : null;

  const angaben: [string, string][] = [
    ...(anschrift ? [['Anschrift', anschrift] as [string, string]] : []),
    ...(stockwerk ? [['Etage', stockwerk] as [string, string]] : []),
    ...(zugang ? [['Zugangshinweis', zugang] as [string, string]] : []),
    ...(besonderheit ? [['Besonderheit', besonderheit] as [string, string]] : []),
    ...nummern.map((nummer) => [nummer.label, nummer.anzeige] as [string, string]),
  ];

  return (
    <li className="border-line grid grid-cols-[34mm_minmax(0,1fr)] gap-x-4 border-b py-2">
      <p className="font-semibold tabular-nums">
        {formatLocalTimeRange(termin.starts_at, termin.ends_at, zone)}
      </p>
      <div className="min-w-0">
        <p className="font-semibold wrap-anywhere">
          {terminName(termin)}
          {zustand ? ` · ${zustand}` : ''}
        </p>
        {art ? <p className="text-sm">{art}</p> : null}
        {angaben.length > 0 ? (
          <dl className="mt-1 grid grid-cols-[30mm_minmax(0,1fr)] gap-x-3 text-sm">
            {angaben.map(([titel, wert]) => (
              <div key={titel} className="contents">
                <dt className="font-semibold">{titel}</dt>
                <dd className="wrap-anywhere">{wert}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </li>
  );
}
