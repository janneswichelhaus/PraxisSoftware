import { useId } from 'react';
import { pufferText, travelPlan, type TravelLevel } from './travelPlan';

/**
 * Farben je Stufe: die Spur (der Puffer), die Fahrt darauf, der Text daneben.
 *
 * Zwei Farben plus Warnfläche, keine weiteren Töne (Design-Handoff
 * 2026-10-01). `warnung-mittel` ist nur Fläche - der Text der beiden
 * Orange-Stufen steht in `warnung`.
 */
const stufen: Record<TravelLevel, { spur: string; fahrt: string; text: string }> = {
  // Die Spur ist seit Grundton B in jeder Stufe dieselbe sichtbare Spur
  // (Leitfaden L4, `--color-spur`, mindestens 3:1): Die Stufe sagt die Fahrt
  // in ihrer Farbe und der Text daneben, nicht ein getönter Grund, der auf
  // Weiß verschwindet.
  late: { spur: 'bg-spur', fahrt: 'bg-danger', text: 'text-danger' },
  tight: { spur: 'bg-spur', fahrt: 'bg-warnung', text: 'text-warnung' },
  narrow: { spur: 'bg-spur', fahrt: 'bg-warnung-mittel', text: 'text-warnung' },
  clear: { spur: 'bg-spur', fahrt: 'bg-accent', text: 'text-accent' },
};

/**
 * Was über dem Balken steht. Farbe trägt nie allein (WCAG 1.4.1): Die Stufe
 * steht als Wort da, das Zeichen davor ist Schmuck.
 */
const hinweise: Record<TravelLevel, string> = {
  late: 'Zu spät, Abfahrt sofort',
  tight: 'Knapp, Abfahrt spätestens',
  narrow: 'Knapp, Abfahrt spätestens',
  clear: 'Abfahrt spätestens',
};

interface Wegpunkt {
  /** Uhrzeit als „hh:mm" in der Zeit der Praxis. */
  zeit: string;
  /** Was dort ist: „Ende Erika Beispiel", „Start am Rad", der Name des Ziels. */
  label: string;
}

/**
 * Der Wegbalken: wie viel Zeit zwischen zwei Terminen eingeplant ist, wie viel
 * davon die Fahrt braucht und was als Puffer bleibt (Design-Handoff
 * 2026-10-01, Abschnitte 3 und 5a).
 *
 * Die Spur ist die eingeplante Zeit in der Farbe des Puffers, die Fahrt liegt
 * als Pille **mittig** darauf - der Puffer bleibt links und rechts sichtbar.
 * Keine Marker, keine Kreise, keine Bewegung. Der Balken selbst ist für
 * Vorlesesoftware ausgeblendet: Alles, was er zeigt, steht daneben als Zahl.
 *
 * `size="klein"` ist der schmale Übergang über einem späteren Hausbesuch im
 * Zeitstrahl: nur Balken und eine Zeile „≈ 9 min Rad · 11 min Puffer".
 *
 * Die Fahrzeit ist eine Schätzung (ADR-019) und steht deshalb mit „≈" da.
 * Gerechnet wird in `travelPlan.ts`.
 */
export function TravelBar({
  von,
  bis,
  fahrtMin,
  size = 'gross',
  titel = 'Nächster Weg',
  ebene = 2,
}: {
  /** Ende des vorigen Termins oder Startort. */
  von: Wegpunkt;
  /** Beginn des nächsten Termins. */
  bis: Wegpunkt;
  /** Geschätzte Fahrzeit in Minuten (ADR-019). */
  fahrtMin: number;
  size?: 'gross' | 'klein';
  /** Beschriftung der großen Fassung, etwa „Nächster Weg danach". */
  titel?: string;
  /** Ebene der Überschrift der großen Fassung. */
  ebene?: 2 | 3;
}) {
  const titelId = useId();
  const { geplantMin, pufferMin, abfahrt, anteil, stufe } = travelPlan(
    von.zeit,
    bis.zeit,
    fahrtMin,
  );
  const farben = stufen[stufe];
  const fahrt = `≈ ${Math.max(0, Math.round(fahrtMin))} min Rad`;
  const puffer = pufferText(pufferMin);
  const knapp = stufe !== 'clear';

  if (size === 'klein') {
    return (
      <div className="flex min-h-5 items-center gap-2.5">
        <div aria-hidden="true" className="relative h-2.5 min-w-8 flex-1">
          <div className={`rounded-pill absolute inset-x-0 top-[3px] h-1 ${farben.spur}`} />
          <div
            className={`rounded-pill absolute top-0.5 left-1/2 h-1.5 min-w-3 -translate-x-1/2 ${farben.fahrt}`}
            style={{ width: `${anteil}%` }}
          />
        </div>
        <span className={`text-xs font-semibold whitespace-nowrap ${farben.text}`}>
          {knapp ? <span aria-hidden="true">! </span> : null}
          {fahrt} · {puffer}
        </span>
      </div>
    );
  }

  const Ueberschrift = ebene === 3 ? 'h3' : 'h2';
  return (
    <section
      aria-labelledby={titelId}
      className="rounded-card border-line bg-surface border px-4 pt-3.5 pb-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <Ueberschrift
          id={titelId}
          className="text-ink-muted tracking-label text-xs font-semibold uppercase"
        >
          {titel}
        </Ueberschrift>
        <p className={`text-sm ${knapp ? farben.text : 'text-ink-muted'}`}>
          {knapp ? <span aria-hidden="true">! </span> : null}
          <span className="font-semibold">{hinweise[stufe]}</span>
          {stufe === 'late' ? null : <span className="font-bold tabular-nums"> {abfahrt}</span>}
        </p>
      </div>

      {/* Die Beschriftungen dürfen gekürzt werden, der Balken behält Platz:
          Ein langer Name schöbe ihn sonst am Telefon auf null. */}
      <div className="mt-2.5 grid grid-cols-[minmax(0,auto)_minmax(3rem,1fr)_minmax(0,auto)] items-center gap-3">
        <div className="min-w-0">
          <p className="text-ink text-base font-bold tabular-nums">{von.zeit}</p>
          <p className="text-ink-muted truncate text-sm">{von.label}</p>
        </div>
        <div aria-hidden="true" className="relative h-4">
          <div className={`rounded-pill absolute inset-x-0 top-[5px] h-1.5 ${farben.spur}`} />
          <div
            className={`rounded-pill absolute top-[3px] left-1/2 h-2.5 min-w-5 -translate-x-1/2 ${farben.fahrt}`}
            style={{ width: `${anteil}%` }}
          />
        </div>
        <div className="min-w-0 text-right">
          <p className="text-ink text-base font-bold tabular-nums">{bis.zeit}</p>
          <p className="text-ink-muted truncate text-sm">{bis.label}</p>
        </div>
      </div>

      {/* Legende in drei Spalten: Puffer in seiner Farbe, Fahrt in Tinte,
          Summe leise. Ohne Farbpunkte davor - mit ihnen passen die drei bei
          375 px nicht in eine Zeile, und die Zuordnung trägt schon der Text. */}
      <div className="text-ink-muted mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm tabular-nums">
        <span className={`font-semibold whitespace-nowrap ${farben.text}`}>{puffer}</span>
        <span className="text-ink font-semibold whitespace-nowrap">{fahrt}</span>
        <span className="whitespace-nowrap">{geplantMin} min eingeplant</span>
      </div>
    </section>
  );
}
