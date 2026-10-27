import { useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { Chip } from '@/components/ui/Chip';
import { Field } from '@/components/ui/Field';
import { Fehlerzusammenfassung } from '@/components/ui/Fehlerzusammenfassung';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { Segment } from '@/components/ui/Segment';
import { Feldgruppe } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TextArea } from '@/components/ui/TextArea';
import { ACHSE_LABEL, type Achse } from '@/features/exercise/exercises/types';
import type { Bibliothek } from '@/features/exercise/exercises/api';
import {
  PLAENE_SCHLUESSEL,
  POSITIONSACHSEN,
  savePosition,
  type Position,
  type PositionEingabe,
} from './api';
import { dosierungKurz } from './dosierung';
import { Zahlschritt } from './Zahlschritt';

/**
 * Die Dosierung einer Position ändern (UEB-004, ANN-299; ANN-471: kompakt mit
 * Zahlschritten statt zehn Feldern untereinander).
 *
 * Oben, was fast jede Übung braucht - Sätze, Wiederholungen oder Dauer,
 * Halten, je Seite, wie oft am Tag (ANN-384) - mit Plus und Minus, ohne
 * Tastatur. Last, Tempo, Pause, doppelte Progression und der Hinweis an die
 * Person stehen unter „Mehr“.
 *
 * An einer Position aus der vorigen Fassung (UEB-006, ANN-301) gibt es
 * höchstens einen Schritt in genau einer Achse: eine andere Variante nur über
 * eine Verbindung der Bibliothek, sonst ein anderer Wert der Dosierung. Die
 * Verbindungen erscheinen erst, wenn die Fachperson Richtung und Achse wählt -
 * nichts schlägt einen Schritt vor (ADR-006 Punkt 10).
 */

type Feld = 'pause' | 'last' | 'doppelt' | 'achse';

const FELDNAMEN: Readonly<Record<Feld, string>> = {
  pause: 'Pause',
  last: 'Last',
  doppelt: 'Doppelte Progression',
  achse: 'Achse',
};

interface Werte {
  variantId: string;
  saetze: number;
  art: 'wdh' | 'dauer';
  bereich: boolean;
  wdhVon: number;
  wdhBis: number;
  dauer: number;
  halten: number;
  jeSeite: boolean;
  amTag: number;
  last: string;
  tempo: string;
  pause: string;
  doppelt: boolean;
  hinweis: string;
}

function ausgang(position: Position): Werte {
  const von = position.reps_min ?? 10;
  const bis = position.reps_max ?? von;
  return {
    variantId: position.variant_id,
    saetze: position.sets,
    art: position.duration_seconds !== null ? 'dauer' : 'wdh',
    bereich: bis > von,
    wdhVon: von,
    wdhBis: bis,
    dauer: position.duration_seconds ?? 30,
    halten: position.hold_seconds ?? 0,
    jeSeite: position.per_side,
    amTag: position.times_per_day ?? 0,
    last: position.load ?? '',
    tempo: position.tempo ?? '',
    pause: position.rest_seconds !== null ? String(position.rest_seconds) : '',
    doppelt: position.double_progression,
    hinweis: position.note ?? '',
  };
}

function ganz(text: string): number | null {
  const t = text.trim();
  if (!/^\d+$/.test(t)) return null;
  return Number(t);
}

type Richtung = 'kein' | 'harder' | 'easier';

export function PositionFormular({
  planId,
  position,
  vorige,
  bibliothek,
  idPraefix,
  onFertig,
  onAbbrechen,
  zusatz,
}: {
  planId: string;
  position: Position;
  /** Für die Verbindungen der vorigen Variante; ohne sie kein Wechsel der Übung. */
  bibliothek: Bibliothek | undefined;
  /** UEB-006: die Position der vorigen Fassung, gegen die der Schritt gilt. */
  vorige?: Position | undefined;
  idPraefix: string;
  onFertig: () => void;
  onAbbrechen: () => void;
  /** Weitere Handlungen unter dem Formular (Reihenfolge, entfernen). */
  zusatz?: ReactNode;
}) {
  const queryClient = useQueryClient();
  const [werte, setWerte] = useState<Werte>(() => ausgang(position));
  const [fehler, setFehler] = useState<Partial<Record<Feld, string>>>({});
  const [richtung, setRichtung] = useState<Richtung>(position.step_direction ?? 'kein');
  const [achse, setAchse] = useState<string>(position.step_axis ?? '');

  const namen = useMemo(() => {
    const karte = new Map<string, string>();
    for (const uebung of bibliothek?.exercises ?? []) {
      for (const v of uebung.variants) karte.set(v.id, v.name);
    }
    return karte;
  }, [bibliothek]);

  // Die Nachbarn der vorigen Variante entlang der gewählten Achse in der
  // gewählten Richtung - so, wie die Praxis sie verbunden hat (UEB-002).
  const nachbarn = useMemo(() => {
    if (!vorige || richtung === 'kein' || !achse || !bibliothek) return [];
    return bibliothek.links
      .filter(
        (link) =>
          link.axis === achse &&
          (richtung === 'harder'
            ? link.easier_variant_id === vorige.variant_id
            : link.harder_variant_id === vorige.variant_id),
      )
      .map((link) => (richtung === 'harder' ? link.harder_variant_id : link.easier_variant_id))
      .filter((id) => {
        const uebung = bibliothek.exercises.find((u) => u.variants.some((v) => v.id === id));
        const v = uebung?.variants.find((x) => x.id === id);
        return uebung !== undefined && v !== undefined && !uebung.archived && !v.archived;
      })
      .sort((a, b) => (namen.get(a) ?? '').localeCompare(namen.get(b) ?? '', 'de'));
  }, [vorige, richtung, achse, bibliothek, namen]);

  const speichern = useMutation({
    mutationFn: (eingabe: PositionEingabe) => savePosition(eingabe),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PLAENE_SCHLUESSEL });
      onFertig();
    },
  });

  function setze<K extends keyof Werte>(feld: K, wert: Werte[K]) {
    setWerte((bisher) => ({ ...bisher, [feld]: wert }));
  }

  function absenden() {
    const gefunden: Partial<Record<Feld, string>> = {};
    const mitWdh = werte.art === 'wdh';
    const von = werte.wdhVon;
    const bis = werte.bereich ? werte.wdhBis : werte.wdhVon;
    let pause: number | null = null;
    if (werte.pause.trim()) {
      pause = ganz(werte.pause);
      if (pause === null || pause > 600) gefunden.pause = 'Bitte 0 bis 600 Sekunden.';
    }
    if (werte.doppelt && mitWdh) {
      if (bis <= von) {
        gefunden.doppelt = 'Doppelte Progression braucht einen Bereich, etwa 8 bis 12.';
      } else if (!werte.last.trim()) {
        gefunden.last = 'Doppelte Progression braucht eine Last.';
      }
    }
    if (vorige && richtung !== 'kein' && !achse) gefunden.achse = 'Bitte die Achse wählen.';
    setFehler(gefunden);
    if (Object.keys(gefunden).length > 0) return;
    const schritt = vorige && richtung !== 'kein';
    speichern.mutate({
      id: position.id,
      planId,
      variantId: werte.variantId,
      saetze: werte.saetze,
      wdhVon: mitWdh ? von : null,
      wdhBis: mitWdh ? bis : null,
      dauer: mitWdh ? null : werte.dauer,
      last: werte.last,
      tempo: werte.tempo,
      pause,
      doppelt: mitWdh && werte.doppelt,
      hinweis: werte.hinweis,
      achse: schritt ? achse : null,
      richtung: schritt ? richtung : null,
      // Halten gibt es nur zu Wiederholungen; 0 heißt ohne (ANN-384).
      halten: mitWdh && werte.halten > 0 ? werte.halten : null,
      jeSeite: werte.jeSeite,
      amTag: werte.amTag > 0 ? werte.amTag : null,
    });
  }

  const id = (feld: string) => `${idPraefix}-${feld}`;
  const zusammenfassung = (Object.entries(fehler) as [Feld, string][]).map(([feld, meldung]) => ({
    feldId: id(feld),
    feld: FELDNAMEN[feld],
    meldung,
  }));

  return (
    <form
      noValidate
      aria-label="Übung im Plan ändern"
      onSubmit={(event) => {
        event.preventDefault();
        if (!speichern.isPending) absenden();
      }}
    >
      <Fehlerzusammenfassung fehler={zusammenfassung} />
      <Feldgruppe>
        {vorige ? (
          <fieldset id={id('achse')} tabIndex={-1} className="flex flex-col gap-3">
            <legend className="mb-1 text-sm font-medium">
              Schritt gegenüber der vorigen Fassung
            </legend>
            <p className="text-ink-muted text-sm">
              Vorher: {vorige.variant_name} · {dosierungKurz(vorige)}
            </p>
            <Segment
              beschriftung="Schritt"
              wahlen={[
                { wert: 'kein', text: 'Kein Schritt' },
                { wert: 'harder', text: 'Schwerer' },
                { wert: 'easier', text: 'Leichter' },
              ]}
              gewaehlt={richtung}
              onWaehlen={(wert) => {
                setRichtung(wert);
                if (wert === 'kein') setAchse('');
                setze('variantId', vorige.variant_id);
              }}
            />
            {richtung !== 'kein' ? (
              <Select
                label="Achse"
                value={achse}
                error={fehler.achse}
                onChange={(event) => {
                  setAchse(event.target.value);
                  setze('variantId', vorige.variant_id);
                }}
              >
                <option value="">Bitte wählen</option>
                {POSITIONSACHSEN.map((a) => (
                  <option key={a} value={a}>
                    {ACHSE_LABEL[a as Achse]}
                  </option>
                ))}
              </Select>
            ) : null}
            {richtung !== 'kein' && achse ? (
              nachbarn.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <p className="text-sm">
                    {richtung === 'harder' ? 'Schwerer' : 'Leichter'} laut Bibliothek – oder den
                    Wert unten ändern:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {nachbarn.map((nachbar) => (
                      <Chip
                        key={nachbar}
                        gewaehlt={werte.variantId === nachbar}
                        onClick={() =>
                          setze(
                            'variantId',
                            werte.variantId === nachbar ? vorige.variant_id : nachbar,
                          )
                        }
                      >
                        {namen.get(nachbar) ?? nachbar}
                      </Chip>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-ink-muted text-sm">
                  In der Bibliothek ist in diese Richtung keine Variante verbunden. Für Last,
                  Wiederholungen, Sätze, Tempo und Dichte den Wert unten ändern.
                </p>
              )
            ) : null}
          </fieldset>
        ) : null}

        <Segment
          beschriftung="Je Satz"
          wahlen={[
            { wert: 'wdh', text: 'Wiederholungen' },
            { wert: 'dauer', text: 'Dauer' },
          ]}
          gewaehlt={werte.art}
          onWaehlen={(art) => setze('art', art)}
        />

        <div className="grid grid-cols-2 gap-3">
          <Zahlschritt
            beschriftung="Sätze"
            wert={werte.saetze}
            min={1}
            max={20}
            onAendern={(wert) => setze('saetze', wert)}
          />
          {werte.art === 'dauer' ? (
            <Zahlschritt
              beschriftung="Dauer"
              einheit="s"
              wert={werte.dauer}
              min={5}
              max={3600}
              schritt={5}
              onAendern={(wert) => setze('dauer', wert)}
            />
          ) : werte.bereich ? (
            <>
              <Zahlschritt
                beschriftung="Wiederholungen von"
                wert={werte.wdhVon}
                min={1}
                max={100}
                onAendern={(wert) =>
                  setWerte((bisher) => ({
                    ...bisher,
                    wdhVon: wert,
                    wdhBis: Math.max(bisher.wdhBis, wert),
                  }))
                }
              />
              <Zahlschritt
                beschriftung="bis"
                wert={werte.wdhBis}
                min={1}
                max={100}
                onAendern={(wert) =>
                  setWerte((bisher) => ({
                    ...bisher,
                    wdhBis: wert,
                    wdhVon: Math.min(bisher.wdhVon, wert),
                  }))
                }
              />
            </>
          ) : (
            <Zahlschritt
              beschriftung="Wiederholungen"
              wert={werte.wdhVon}
              min={1}
              max={100}
              onAendern={(wert) =>
                setWerte((bisher) => ({ ...bisher, wdhVon: wert, wdhBis: wert }))
              }
            />
          )}
          {werte.art === 'wdh' ? (
            <Zahlschritt
              beschriftung="Halten"
              einheit="s"
              leer="ohne"
              wert={werte.halten}
              min={0}
              max={600}
              onAendern={(wert) => setze('halten', wert)}
            />
          ) : null}
          <Zahlschritt
            beschriftung="Am Tag"
            einheit="×"
            leer="ohne"
            wert={werte.amTag}
            min={0}
            max={10}
            onAendern={(wert) => setze('amTag', wert)}
          />
        </div>
        <Checkbox
          label="Je Seite"
          checked={werte.jeSeite}
          onChange={(event) => setze('jeSeite', event.target.checked)}
        />

        <Disclosure
          summary="Last, Tempo, Pause, Hinweis"
          offen={Boolean(
            werte.last ||
            werte.tempo ||
            werte.pause ||
            werte.doppelt ||
            werte.hinweis ||
            werte.bereich,
          )}
        >
          <Feldgruppe>
            <Field
              label="Last"
              hint="Frei, etwa „5 kg“ oder „Theraband rot“."
              feldId={id('last')}
              maxLength={40}
              value={werte.last}
              error={fehler.last}
              onChange={(event) => setze('last', event.target.value)}
            />
            <Field
              label="Tempo"
              hint="Frei, etwa „3 s runter, 1 s hoch“."
              feldId={id('tempo')}
              maxLength={40}
              value={werte.tempo}
              onChange={(event) => setze('tempo', event.target.value)}
            />
            <Field
              label="Pause zwischen den Sätzen (Sekunden)"
              feldId={id('pause')}
              inputMode="numeric"
              className="max-w-32"
              value={werte.pause}
              error={fehler.pause}
              onChange={(event) => setze('pause', event.target.value)}
            />
            {werte.art === 'wdh' ? (
              <>
                <Checkbox
                  label="Wiederholungen als Bereich (von – bis)"
                  checked={werte.bereich}
                  onChange={(event) => {
                    const an = event.target.checked;
                    setWerte((bisher) => ({
                      ...bisher,
                      bereich: an,
                      wdhBis: an
                        ? Math.min(100, Math.max(bisher.wdhBis, bisher.wdhVon + 2))
                        : bisher.wdhVon,
                      doppelt: an ? bisher.doppelt : false,
                    }));
                  }}
                />
                <Checkbox
                  label="Doppelte Progression"
                  hint="Erst die Wiederholungen bis zur Obergrenze, dann – nach Rücksprache – mehr Last."
                  feldId={id('doppelt')}
                  checked={werte.doppelt}
                  error={fehler.doppelt}
                  onChange={(event) => setze('doppelt', event.target.checked)}
                />
              </>
            ) : null}
            <TextArea
              label="Hinweis an die Person"
              hint="In Alltagssprache. Keine Angaben zu Diagnose oder Befund."
              maxLength={500}
              rows={2}
              value={werte.hinweis}
              onChange={(event) => setze('hinweis', event.target.value)}
            />
          </Feldgruppe>
        </Disclosure>
      </Feldgruppe>
      {speichern.isError ? (
        <Statusmeldung ton="fehler" className="mt-4">
          {speichern.error.message}
        </Statusmeldung>
      ) : null}
      <Formularfuss>
        <Button type="submit" disabled={speichern.isPending}>
          {speichern.isPending ? 'Wird gespeichert …' : 'Speichern'}
        </Button>
        <Button type="button" variant="quiet" onClick={onAbbrechen}>
          Abbrechen
        </Button>
      </Formularfuss>
      {zusatz}
    </form>
  );
}
