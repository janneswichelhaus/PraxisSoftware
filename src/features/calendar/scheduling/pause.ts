/**
 * Pause frei im Kalender (ANN-863): Dauer aus dem Plan, Lage je Tag. Dieselbe Regel
 * wie `app.break_gaps` und `app.working_ranges`, damit Raster und Rückfrage vorher stimmen.
 */

export interface Band {
  vonMinute: number;
  bisMinute: number;
}

export interface Pause extends Band {
  /** Beginn der Lücke im Plan - so findet der Server die Pause wieder. */
  planVonMinute: number;
  /** Liegt woanders als im Plan. */
  verschoben: boolean;
}

/** Die Lage einer Pause an einem Tag, wie sie die Tabelle führt. */
export interface Pausenlage {
  staff_member_id: string;
  on_date: string;
  plan_starts_at: string;
  starts_at: string;
  ends_at: string;
}

export const PAUSE_MIN = 15;
export const PAUSE_MAX = 60;
/** § 4 ArbZG: höchstens 6 Stunden am Stück, über 6 Stunden 30 und über 9 Stunden 45 Minuten Pause. */
export const AM_STUECK_MAX = 6 * 60;
const PAUSE_UEBER_NEUN = { ab: 9 * 60, minuten: 45 } as const;

function minute(zeit: string): number {
  const [h, m] = zeit.split(':').map(Number) as [number, number];
  return h * 60 + m;
}

/** Bänder sortiert und Überlappendes oder Anstoßendes zusammengelegt. */
export function zusammengelegt(baender: readonly Band[]): Band[] {
  const sortiert = [...baender]
    .filter((b) => b.bisMinute > b.vonMinute)
    .sort((a, b) => a.vonMinute - b.vonMinute);
  const ergebnis: Band[] = [];
  for (const b of sortiert) {
    const letztes = ergebnis.at(-1);
    if (letztes && b.vonMinute <= letztes.bisMinute) {
      letztes.bisMinute = Math.max(letztes.bisMinute, b.bisMinute);
    } else {
      ergebnis.push({ ...b });
    }
  }
  return ergebnis;
}

function ohne(baender: readonly Band[], weg: Band): Band[] {
  return baender.flatMap((b) => {
    if (weg.bisMinute <= b.vonMinute || weg.vonMinute >= b.bisMinute) return [b];
    const teile: Band[] = [];
    if (weg.vonMinute > b.vonMinute)
      teile.push({ vonMinute: b.vonMinute, bisMinute: weg.vonMinute });
    if (weg.bisMinute < b.bisMinute)
      teile.push({ vonMinute: weg.bisMinute, bisMinute: b.bisMinute });
    return teile;
  });
}

function deckt(baender: readonly Band[], b: Band): boolean {
  return baender.some((x) => x.vonMinute <= b.vonMinute && x.bisMinute >= b.bisMinute);
}

/** Die verschiebbaren Pausen eines Plans: Lücken von 15 bis 60 Minuten. */
export function pausenLuecken(plan: readonly Band[]): Band[] {
  const tag = zusammengelegt(plan);
  const luecken: Band[] = [];
  for (let i = 1; i < tag.length; i += 1) {
    const laenge = tag[i]!.vonMinute - tag[i - 1]!.bisMinute;
    if (laenge >= PAUSE_MIN && laenge <= PAUSE_MAX) {
      luecken.push({ vonMinute: tag[i - 1]!.bisMinute, bisMinute: tag[i]!.vonMinute });
    }
  }
  return luecken;
}

/**
 * Arbeitszeit und Pausen eines Tages mit den Lagen des Tages - dieselbe Regel
 * wie `app.working_ranges`: Nur eine Lage, die zur Lücke passt und ganz in der
 * Arbeitszeit liegt, verschiebt; sonst bleibt die Pause, wo der Plan sie hat.
 */
export function tagMitPausen(
  plan: readonly Band[],
  lagen: readonly Pausenlage[],
): { arbeitszeit: Band[]; pausen: Pause[] } {
  const passend = pausenLuecken(plan).map((luecke) => {
    const lage = lagen.find((l) => minute(l.plan_starts_at) === luecke.vonMinute);
    const ziel = lage
      ? { vonMinute: minute(lage.starts_at), bisMinute: minute(lage.ends_at) }
      : null;
    const gleichLang =
      ziel !== null && ziel.bisMinute - ziel.vonMinute === luecke.bisMinute - luecke.vonMinute;
    return { luecke, ziel: gleichLang ? ziel : null };
  });
  // Erst alle Lücken mit Lage öffnen, dann prüfen: Die Reihenfolge der Pausen entscheidet nichts.
  const offen = zusammengelegt([...plan, ...passend.flatMap((p) => (p.ziel ? [p.luecke] : []))]);
  const gilt = passend.map((p) => ({ ...p, ziel: p.ziel && deckt(offen, p.ziel) ? p.ziel : null }));
  let arbeitszeit = zusammengelegt([...plan, ...gilt.flatMap((p) => (p.ziel ? [p.luecke] : []))]);
  for (const p of gilt) if (p.ziel) arbeitszeit = ohne(arbeitszeit, p.ziel);
  return {
    arbeitszeit,
    pausen: gilt.map(({ luecke, ziel }) =>
      ziel
        ? { ...ziel, planVonMinute: luecke.vonMinute, verschoben: true }
        : { ...luecke, planVonMinute: luecke.vonMinute, verschoben: false },
    ),
  };
}

export type Pausenproblem = 'ueberlagert' | 'zu_kurz' | 'am_stueck';

/**
 * Was an der Pause eines Tages nicht stimmt (§ 4 ArbZG), aus Arbeitszeit und Terminen.
 * Darstellung, keine Sperre; gespeichert wird nichts davon (§ 20).
 */
export function pausenProbleme(
  arbeitszeit: readonly Band[],
  pausen: readonly Pause[],
  termine: readonly Band[],
): Pausenproblem[] {
  if (pausen.length === 0) return [];
  const probleme: Pausenproblem[] = [];
  if (
    pausen.some((p) => termine.some((t) => t.vonMinute < p.bisMinute && t.bisMinute > p.vonMinute))
  ) {
    probleme.push('ueberlagert');
  }
  let tag = zusammengelegt([...arbeitszeit, ...termine]);
  for (const p of pausen) {
    if (!termine.some((t) => t.vonMinute < p.bisMinute && t.bisMinute > p.vonMinute)) {
      tag = ohne(tag, p);
    }
  }
  let stueck = 0;
  let laengstes = 0;
  let arbeit = 0;
  let pause = 0;
  let ende: number | null = null;
  for (const b of tag) {
    const luecke = ende === null ? null : b.vonMinute - ende;
    if (luecke !== null && luecke >= PAUSE_MIN) pause += luecke;
    stueck =
      luecke !== null && luecke < PAUSE_MIN
        ? stueck + luecke + (b.bisMinute - b.vonMinute)
        : b.bisMinute - b.vonMinute;
    laengstes = Math.max(laengstes, stueck);
    arbeit += b.bisMinute - b.vonMinute;
    ende = b.bisMinute;
  }
  const noetig =
    arbeit > PAUSE_UEBER_NEUN.ab ? PAUSE_UEBER_NEUN.minuten : arbeit > AM_STUECK_MAX ? 30 : 0;
  if (pause < noetig) probleme.push('zu_kurz');
  if (laengstes > AM_STUECK_MAX) probleme.push('am_stueck');
  return probleme;
}

export const PAUSENPROBLEM_TEXT: Record<Pausenproblem, string> = {
  ueberlagert: 'Ein Termin liegt in der Pause.',
  zu_kurz: 'Pause zu kurz: über 6 Std. 30, über 9 Std. 45 Min. (§ 4 ArbZG).',
  am_stueck: 'Mehr als 6 Std. am Stück ohne Pause (§ 4 ArbZG).',
};

/** Kennung einer Pause im Raster: neben den Terminen ziehbar, nie mit ihnen verwechselt. */
export function pausenKennung(spalteId: string, planVonMinute: number): string {
  return `pause:${spalteId}:${planVonMinute}`;
}

export function ausPausenKennung(
  kennung: string,
): { spalteId: string; planVonMinute: number } | null {
  const teile = /^pause:(.+):(\d+)$/.exec(kennung);
  return teile ? { spalteId: teile[1]!, planVonMinute: Number(teile[2]) } : null;
}
