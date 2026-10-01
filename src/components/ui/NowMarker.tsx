import { zeitstrahlRaster, zeitstrahlSchiene } from './timelineStile';

/**
 * Die Jetzt-Marke im Zeitstrahl (Design-Handoff 2026-10-01, Abschnitt 5a
 * Punkt 1): die Uhrzeit in der Hauptfarbe, ein kleiner Punkt auf der Schiene
 * und eine Linie über die Inhaltsspalte.
 *
 * Ein Eintrag der Liste (`li`), der in dasselbe Raster fällt wie die Termine
 * (`timelineStile.ts`); die Seite setzt ihn vor den ersten Termin, der noch
 * nicht begonnen hat. Vorgelesen wird „Jetzt, 08:45 Uhr" - die sichtbare
 * Uhrzeit, der Punkt und die Linie sind dafür ausgeblendet, sonst stünde die
 * Zeit zweimal da.
 *
 * Die Uhrzeit kommt von der Seite, in der Zeit der Praxis und nicht des
 * Geräts; dass sie jede Minute nachrückt, ist ebenfalls Sache der Seite.
 */
export function NowMarker({
  zeit,
  letzter = false,
}: {
  /** „hh:mm" in der Zeit der Praxis. */
  zeit: string;
  /** Steht die Marke am Ende des Strahls, entfällt der Abstand darunter. */
  letzter?: boolean;
}) {
  return (
    <li className={zeitstrahlRaster} data-jetzt="">
      <span aria-hidden="true" className="text-accent text-xs leading-3 font-bold tabular-nums">
        {zeit}
      </span>
      <span aria-hidden="true" className="relative flex justify-center">
        <span className={zeitstrahlSchiene} />
        <span className="bg-accent rounded-pill relative mt-0.5 size-2" />
      </span>
      <div className={`min-w-0 ${letzter ? '' : 'pb-[18px]'}`.trim()}>
        <div aria-hidden="true" className="bg-accent rounded-pill mt-[5px] h-0.5" />
        <span className="sr-only">Jetzt, {zeit} Uhr</span>
      </div>
    </li>
  );
}
