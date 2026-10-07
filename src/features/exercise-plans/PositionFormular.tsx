import { useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Field } from '@/components/ui/Field';
import { Fehlerzusammenfassung } from '@/components/ui/Fehlerzusammenfassung';
import { SearchField } from '@/components/ui/SearchField';
import { Feldgruppe } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TextArea } from '@/components/ui/TextArea';
import { KOERPERREGION_LABEL } from '@/features/exercises/types';
import { filtere, KEIN_FILTER } from '@/features/exercises/suche';
import type { Bibliothek } from '@/features/exercises/api';
import { PLAENE_SCHLUESSEL, savePosition, type Position, type PositionEingabe } from './api';

/**
 * Eine Position anlegen oder ändern (UEB-004): Übung aus der Bibliothek und
 * Dosierung (ANN-299).
 *
 * Gewählt wird über die Suche der Bibliothek - in beiden Sprachebenen, nach
 * Bezeichnung geordnet (ADR-006 Punkt 10). Archivierte Varianten stehen nicht
 * zur Wahl; eine schon gewählte bleibt (ANN-296).
 *
 * `schritt` (UEB-006) erscheint nur an einer Position, die aus der vorigen
 * Fassung stammt.
 */

type Feld = 'variante' | 'saetze' | 'wdhVon' | 'wdhBis' | 'dauer' | 'pause' | 'last' | 'doppelt';

const FELDNAMEN: Readonly<Record<Feld, string>> = {
  variante: 'Übung',
  saetze: 'Sätze',
  wdhVon: 'Wiederholungen von',
  wdhBis: 'Wiederholungen bis',
  dauer: 'Dauer',
  pause: 'Pause',
  last: 'Last',
  doppelt: 'Doppelte Progression',
};

interface Werte {
  variantId: string;
  saetze: string;
  art: 'wdh' | 'dauer';
  wdhVon: string;
  wdhBis: string;
  dauer: string;
  last: string;
  tempo: string;
  pause: string;
  doppelt: boolean;
  hinweis: string;
}

function ausgang(position?: Position): Werte {
  return {
    variantId: position?.variant_id ?? '',
    saetze: String(position?.sets ?? 3),
    art: position?.duration_seconds != null ? 'dauer' : 'wdh',
    wdhVon: position?.reps_min != null ? String(position.reps_min) : '10',
    wdhBis: position?.reps_max != null ? String(position.reps_max) : '12',
    dauer: position?.duration_seconds != null ? String(position.duration_seconds) : '30',
    last: position?.load ?? '',
    tempo: position?.tempo ?? '',
    pause: position?.rest_seconds != null ? String(position.rest_seconds) : '',
    doppelt: position?.double_progression ?? false,
    hinweis: position?.note ?? '',
  };
}

function ganz(text: string): number | null {
  const t = text.trim();
  if (!/^\d+$/.test(t)) return null;
  return Number(t);
}

export function PositionFormular({
  planId,
  position,
  bibliothek,
  schritt,
  idPraefix,
  onFertig,
  onAbbrechen,
}: {
  planId: string;
  position?: Position;
  bibliothek: Bibliothek;
  /** UEB-006: Auswahl des einen Schritts - liefert Achse und Richtung. */
  schritt?: (werte: { variantId: string }) => {
    feld: ReactNode;
    achse: string | null;
    richtung: 'harder' | 'easier' | null;
    fehler?: string;
  };
  idPraefix: string;
  onFertig: () => void;
  onAbbrechen: () => void;
}) {
  const queryClient = useQueryClient();
  const [werte, setWerte] = useState<Werte>(() => ausgang(position));
  const [suche, setSuche] = useState('');
  const [waehlen, setWaehlen] = useState(!position);
  const [fehler, setFehler] = useState<Partial<Record<Feld, string>>>({});

  const varianten = useMemo(() => {
    const karte = new Map<
      string,
      { uebung: string; uebungLaie: string; region: string; name: string; laie: string }
    >();
    for (const uebung of bibliothek.exercises) {
      for (const v of uebung.variants) {
        karte.set(v.id, {
          uebung: uebung.name,
          uebungLaie: uebung.lay_name,
          region: KOERPERREGION_LABEL[uebung.body_region],
          name: v.name,
          laie: v.lay_name,
        });
      }
    }
    return karte;
  }, [bibliothek]);

  const treffer = useMemo(
    () =>
      filtere(
        bibliothek.exercises.filter((uebung) => !uebung.archived),
        { ...KEIN_FILTER, text: suche },
      ),
    [bibliothek, suche],
  );

  const gewaehlt = varianten.get(werte.variantId);
  const schrittWahl = schritt?.({ variantId: werte.variantId });

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
    if (!werte.variantId) gefunden.variante = 'Bitte eine Übung wählen.';
    const saetze = ganz(werte.saetze);
    if (saetze === null || saetze < 1 || saetze > 20) gefunden.saetze = 'Bitte 1 bis 20 Sätze.';
    let wdhVon: number | null = null;
    let wdhBis: number | null = null;
    let dauer: number | null = null;
    if (werte.art === 'wdh') {
      wdhVon = ganz(werte.wdhVon);
      wdhBis = ganz(werte.wdhBis);
      if (wdhVon === null || wdhVon < 1 || wdhVon > 100) gefunden.wdhVon = 'Bitte 1 bis 100.';
      if (wdhBis === null || wdhBis < 1 || wdhBis > 100) gefunden.wdhBis = 'Bitte 1 bis 100.';
      else if (wdhVon !== null && wdhBis < wdhVon) gefunden.wdhBis = 'Bis ist kleiner als von.';
    } else {
      dauer = ganz(werte.dauer);
      if (dauer === null || dauer < 1 || dauer > 3600)
        gefunden.dauer = 'Bitte 1 bis 3600 Sekunden.';
    }
    let pause: number | null = null;
    if (werte.pause.trim()) {
      pause = ganz(werte.pause);
      if (pause === null || pause > 600) gefunden.pause = 'Bitte 0 bis 600 Sekunden.';
    }
    if (werte.doppelt) {
      if (werte.art !== 'wdh' || wdhVon === null || wdhBis === null || wdhBis <= wdhVon) {
        gefunden.doppelt = 'Doppelte Progression braucht einen Bereich, etwa 8 bis 12.';
      } else if (!werte.last.trim()) {
        gefunden.last = 'Doppelte Progression braucht eine Last.';
      }
    }
    setFehler(gefunden);
    if (Object.keys(gefunden).length > 0 || schrittWahl?.fehler) return;
    speichern.mutate({
      ...(position ? { id: position.id } : {}),
      planId,
      variantId: werte.variantId,
      saetze: saetze ?? 0,
      wdhVon,
      wdhBis,
      dauer,
      last: werte.last,
      tempo: werte.tempo,
      pause,
      doppelt: werte.doppelt,
      hinweis: werte.hinweis,
      achse: schrittWahl?.achse ?? null,
      richtung: schrittWahl?.richtung ?? null,
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
      className="max-w-xl"
      aria-label={position ? 'Übung im Plan ändern' : 'Übung zum Plan hinzufügen'}
      onSubmit={(event) => {
        event.preventDefault();
        if (!speichern.isPending) absenden();
      }}
    >
      <Fehlerzusammenfassung fehler={zusammenfassung} />
      <Feldgruppe>
        <fieldset id={id('variante')} tabIndex={-1} className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Übung *</legend>
          {gewaehlt ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm">
                <span className="font-medium">{gewaehlt.name}</span>
                <span className="text-ink-muted block">
                  {gewaehlt.uebung} · {gewaehlt.region}
                </span>
              </p>
              {!waehlen && !schritt ? (
                <Button
                  type="button"
                  variant="quiet"
                  groesse="kompakt"
                  onClick={() => setWaehlen(true)}
                >
                  Andere Übung wählen
                </Button>
              ) : null}
            </div>
          ) : null}
          {schrittWahl ? schrittWahl.feld : null}
          {waehlen && !schritt ? (
            <div className="flex flex-col gap-2">
              <SearchField
                label="Übung suchen"
                placeholder="fachlich oder in Alltagssprache"
                value={suche}
                onChange={setSuche}
              />
              {treffer.length === 0 ? (
                <p className="text-ink-muted text-sm">Keine Übung gefunden.</p>
              ) : (
                <ul className="border-line bg-surface rounded-card max-h-72 overflow-y-auto border">
                  {treffer.flatMap(({ uebung }) =>
                    uebung.variants
                      .filter((v) => !v.archived)
                      .map((v) => (
                        <li key={v.id} className="border-line border-b last:border-b-0">
                          <button
                            type="button"
                            aria-pressed={werte.variantId === v.id}
                            className={`hover:bg-surface-sunken min-h-11 w-full px-3 py-2 text-left text-sm ${
                              werte.variantId === v.id ? 'bg-accent-soft' : ''
                            }`}
                            onClick={() => {
                              setze('variantId', v.id);
                              setWaehlen(false);
                            }}
                          >
                            <span className="font-medium">{v.name}</span>
                            <span className="text-ink-muted block">
                              {uebung.name} · {v.lay_name}
                            </span>
                          </button>
                        </li>
                      )),
                  )}
                </ul>
              )}
            </div>
          ) : null}
          {fehler.variante ? (
            <p className="text-danger text-sm" role="alert">
              {fehler.variante}
            </p>
          ) : null}
        </fieldset>

        <Field
          label="Sätze *"
          feldId={id('saetze')}
          inputMode="numeric"
          className="max-w-32"
          value={werte.saetze}
          error={fehler.saetze}
          onChange={(event) => setze('saetze', event.target.value)}
        />

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Je Satz *</legend>
          <div className="flex flex-wrap gap-x-6">
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="radio"
                name={id('art')}
                checked={werte.art === 'wdh'}
                onChange={() => setze('art', 'wdh')}
              />
              Wiederholungen
            </label>
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="radio"
                name={id('art')}
                checked={werte.art === 'dauer'}
                onChange={() => {
                  setze('art', 'dauer');
                  setze('doppelt', false);
                }}
              />
              Dauer
            </label>
          </div>
          {werte.art === 'wdh' ? (
            <div className="flex flex-wrap gap-4">
              <Field
                label="von"
                feldId={id('wdhVon')}
                inputMode="numeric"
                className="max-w-24"
                value={werte.wdhVon}
                error={fehler.wdhVon}
                onChange={(event) => setze('wdhVon', event.target.value)}
              />
              <Field
                label="bis"
                hint="Gleich „von“ für eine feste Zahl."
                feldId={id('wdhBis')}
                inputMode="numeric"
                className="max-w-24"
                value={werte.wdhBis}
                error={fehler.wdhBis}
                onChange={(event) => setze('wdhBis', event.target.value)}
              />
            </div>
          ) : (
            <Field
              label="Sekunden"
              feldId={id('dauer')}
              inputMode="numeric"
              className="max-w-32"
              value={werte.dauer}
              error={fehler.dauer}
              onChange={(event) => setze('dauer', event.target.value)}
            />
          )}
        </fieldset>

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
          <Checkbox
            label="Doppelte Progression"
            hint="Erst die Wiederholungen bis zur Obergrenze, dann – nach Rücksprache – mehr Last."
            feldId={id('doppelt')}
            checked={werte.doppelt}
            error={fehler.doppelt}
            onChange={(event) => setze('doppelt', event.target.checked)}
          />
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
      {speichern.isError ? (
        <Statusmeldung ton="fehler" className="mt-4">
          {speichern.error.message}
        </Statusmeldung>
      ) : null}
      <div className="mt-5 flex flex-wrap gap-3">
        <Button type="submit" disabled={speichern.isPending}>
          {speichern.isPending ? 'Wird gespeichert …' : position ? 'Speichern' : 'Hinzufügen'}
        </Button>
        <Button type="button" variant="quiet" onClick={onAbbrechen}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}
