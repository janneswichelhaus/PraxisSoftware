import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Feldgruppe } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { BEGRIFFE } from '@/lib/begriffe';
import {
  BIBLIOTHEK_SCHLUESSEL,
  loeseVerbindung,
  verbinde,
  type Bibliothek,
  type Variante,
  type Verbindung,
} from './api';
import type { Ort } from './orte';
import { ACHSEN, ACHSE_LABEL } from './types';

/**
 * Leichter und schwerer (UEB-002, IDEA-TRN-004, IDEA-TRN-005).
 *
 * Die Verbindungen einer Variante stehen da, wenn eine Person sie aufruft -
 * zum Nachschlagen. Nichts wählt daraus aus, nichts schlägt einen nächsten
 * Schritt vor (ADR-006 Punkt 10): Die Auswahl trifft, wer anleitet.
 */

function Nachbar({
  verbindung,
  ort,
  eigeneUebungId,
  darfPflegen,
}: {
  verbindung: Verbindung;
  ort: Ort;
  eigeneUebungId: string;
  darfPflegen: boolean;
}) {
  const queryClient = useQueryClient();
  const loesen = useMutation({
    mutationFn: () => loeseVerbindung(verbindung.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BIBLIOTHEK_SCHLUESSEL }),
  });
  const name =
    ort.uebung.id === eigeneUebungId
      ? ort.variante.name
      : `${ort.uebung.name}: ${ort.variante.name}`;

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 py-1">
      {/* Name als Ziel, die Achse darunter: Am Telefon bricht eine
          gemeinsame Zeile sonst mitten im „Achse: …“ um. Die Rückfrage zum
          Lösen öffnet in voller Breite darunter. */}
      <span className="min-w-0 flex-1">
        <Link
          to={`/uebungen/${ort.uebung.id}#variante-${ort.variante.id}`}
          className="text-accent inline-flex min-h-11 items-center font-medium break-words underline underline-offset-2"
        >
          {name}
        </Link>
        <span className="text-ink-muted block text-sm">
          Achse: {ACHSE_LABEL[verbindung.axis]}
          {ort.variante.archived ? ' · archiviert' : ''}
        </span>
      </span>
      {darfPflegen ? (
        <Rueckfrage
          ausloeser="Lösen"
          ausloeserVariante="quiet"
          ausloeserGroesse="kompakt"
          bezeichnung={`Verbindung zu „${name}“ lösen`}
          bestaetigen="Ja, Verbindung lösen"
          bestaetigenLaeuft="Wird gelöst …"
          fehler={loesen.isError ? loesen.error.message : undefined}
          laeuft={loesen.isPending}
          onBestaetigen={() => loesen.mutateAsync()}
          onAbbrechen={() => loesen.reset()}
        >
          Die Verbindung zu „{name}“ wird gelöst. Beide Varianten bleiben in der Bibliothek.
        </Rueckfrage>
      ) : null}
    </li>
  );
}

function Liste({
  titel,
  eintraege,
  orte,
  eigeneUebungId,
  darfPflegen,
  partner,
}: {
  titel: string;
  eintraege: Verbindung[];
  orte: Map<string, Ort>;
  eigeneUebungId: string;
  darfPflegen: boolean;
  partner: (verbindung: Verbindung) => string;
}) {
  return (
    <div>
      <h4 className="text-ink-muted text-sm">{titel}</h4>
      {eintraege.length === 0 ? (
        <p className="text-ink-muted text-sm">Keine Verbindung.</p>
      ) : (
        <ul>
          {eintraege.map((verbindung) => {
            const ort = orte.get(partner(verbindung));
            return ort ? (
              <Nachbar
                key={verbindung.id}
                verbindung={verbindung}
                ort={ort}
                eigeneUebungId={eigeneUebungId}
                darfPflegen={darfPflegen}
              />
            ) : null;
          })}
        </ul>
      )}
    </div>
  );
}

export function VerbindungenAnzeige({
  variante,
  uebungId,
  bibliothek,
  orte,
}: {
  variante: Variante;
  uebungId: string;
  bibliothek: Bibliothek;
  orte: Map<string, Ort>;
}) {
  const leichter = bibliothek.links.filter((l) => l.harder_variant_id === variante.id);
  const schwerer = bibliothek.links.filter((l) => l.easier_variant_id === variante.id);
  if (leichter.length === 0 && schwerer.length === 0 && !bibliothek.can_manage) return null;

  return (
    <div className="border-line mt-4 grid gap-3 border-t pt-3 sm:grid-cols-2">
      <Liste
        titel="Leichter"
        eintraege={leichter}
        orte={orte}
        eigeneUebungId={uebungId}
        darfPflegen={bibliothek.can_manage}
        partner={(l) => l.easier_variant_id}
      />
      <Liste
        titel="Schwerer"
        eintraege={schwerer}
        orte={orte}
        eigeneUebungId={uebungId}
        darfPflegen={bibliothek.can_manage}
        partner={(l) => l.harder_variant_id}
      />
    </div>
  );
}

export function VerbindungFormular({
  variante,
  bibliothek,
  formularId,
  onFertig,
  onUngespeichert,
  schutz,
}: {
  variante: Variante;
  bibliothek: Bibliothek;
  formularId: string;
  onFertig: () => void;
  onUngespeichert: (formularId: string, ungespeichert: boolean) => void;
  schutz: ReactNode;
}) {
  const queryClient = useQueryClient();
  const [richtung, setRichtung] = useState<'schwerer' | 'leichter'>('schwerer');
  const [andere, setAndere] = useState('');
  const [achse, setAchse] = useState('');
  const [fehler, setFehler] = useState<Partial<Record<'andere' | 'achse', string>>>({});

  const ungespeichert = andere !== '' || achse !== '';
  useEffect(() => {
    onUngespeichert(formularId, ungespeichert);
  }, [formularId, ungespeichert, onUngespeichert]);
  useEffect(() => () => onUngespeichert(formularId, false), [formularId, onUngespeichert]);

  // Schon verbundene Varianten stehen nicht zur Wahl: je Paar eine Verbindung.
  const verbunden = new Set(
    bibliothek.links.flatMap((l) =>
      l.easier_variant_id === variante.id
        ? [l.harder_variant_id]
        : l.harder_variant_id === variante.id
          ? [l.easier_variant_id]
          : [],
    ),
  );
  const gruppen = bibliothek.exercises
    .filter((uebung) => !uebung.archived)
    .map((uebung) => ({
      uebung,
      varianten: uebung.variants.filter(
        (v) => !v.archived && v.id !== variante.id && !verbunden.has(v.id),
      ),
    }))
    .filter((gruppe) => gruppe.varianten.length > 0);

  const speichern = useMutation({
    mutationFn: () =>
      richtung === 'schwerer'
        ? verbinde(variante.id, andere, achse)
        : verbinde(andere, variante.id, achse),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: BIBLIOTHEK_SCHLUESSEL });
      onFertig();
    },
  });

  if (gruppen.length === 0) {
    return (
      <div className="mt-3">
        <p className="text-ink-muted text-sm">
          Es gibt keine weitere Variante, mit der sich diese verbinden ließe.
        </p>
        <Button type="button" variant="quiet" groesse="kompakt" onClick={onFertig}>
          Schließen
        </Button>
      </div>
    );
  }

  return (
    <form
      noValidate
      className="mt-3 max-w-xl"
      onSubmit={(event) => {
        event.preventDefault();
        if (speichern.isPending) return;
        const gefunden: typeof fehler = {};
        if (!andere) gefunden.andere = 'Bitte eine Variante wählen.';
        if (!achse) gefunden.achse = 'Bitte eine Achse wählen.';
        setFehler(gefunden);
        if (Object.keys(gefunden).length > 0) return;
        speichern.mutate();
      }}
    >
      <Feldgruppe>
        <Select
          label="Die andere Variante ist"
          value={richtung}
          onChange={(event) => setRichtung(event.target.value as 'schwerer' | 'leichter')}
        >
          <option value="schwerer">schwerer als diese</option>
          <option value="leichter">leichter als diese</option>
        </Select>
        <Select
          label={`Andere ${BEGRIFFE.variante} *`}
          value={andere}
          error={fehler.andere}
          onChange={(event) => setAndere(event.target.value)}
        >
          <option value="">Bitte wählen</option>
          {gruppen.map(({ uebung, varianten }) => (
            <optgroup key={uebung.id} label={uebung.name}>
              {varianten.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
        <Select
          label="Achse *"
          hint="Die eine Achse, in der sich beide Varianten unterscheiden."
          value={achse}
          error={fehler.achse}
          onChange={(event) => setAchse(event.target.value)}
        >
          <option value="">Bitte wählen</option>
          {ACHSEN.map((kennung) => (
            <option key={kennung} value={kennung}>
              {ACHSE_LABEL[kennung]}
            </option>
          ))}
        </Select>
      </Feldgruppe>

      {schutz}

      {speichern.isError ? (
        <Statusmeldung ton="fehler" className="mt-4">
          {speichern.error.message}
        </Statusmeldung>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        <Button type="submit" disabled={speichern.isPending}>
          {speichern.isPending ? 'Wird verbunden …' : 'Verbinden'}
        </Button>
        <Button type="button" variant="quiet" onClick={onFertig}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}
