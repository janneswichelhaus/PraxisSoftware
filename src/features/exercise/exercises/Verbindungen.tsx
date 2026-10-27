import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Dialogfenster } from '@/components/ui/Dialogfenster';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { ListRow } from '@/components/ui/ListRow';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
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

interface Nachbar {
  verbindung: Verbindung;
  ort: Ort;
  richtung: 'Leichter' | 'Schwerer';
}

function nachbarName(ort: Ort, eigeneUebungId: string): string {
  return ort.uebung.id === eigeneUebungId
    ? ort.variante.name
    : `${ort.uebung.name}: ${ort.variante.name}`;
}

/** Die leichteren und schwereren Nachbarn einer Variante - leichtere zuerst. */
function nachbarn(variante: Variante, bibliothek: Bibliothek, orte: Map<string, Ort>): Nachbar[] {
  const liste: Nachbar[] = [];
  for (const verbindung of bibliothek.links) {
    if (verbindung.harder_variant_id === variante.id) {
      const ort = orte.get(verbindung.easier_variant_id);
      if (ort) liste.push({ verbindung, ort, richtung: 'Leichter' });
    }
  }
  for (const verbindung of bibliothek.links) {
    if (verbindung.easier_variant_id === variante.id) {
      const ort = orte.get(verbindung.harder_variant_id);
      if (ort) liste.push({ verbindung, ort, richtung: 'Schwerer' });
    }
  }
  return liste;
}

/**
 * Die Nachbarn als Zeilen: Name, „Leichter · Achse: Hebel“ und der Weg
 * zur Variante. Owner löst eine Verbindung nach Rückfrage im Fenster.
 */
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
  const queryClient = useQueryClient();
  const [loesen, setLoesen] = useState<Nachbar | null>(null);
  const loeseMutation = useMutation({
    mutationFn: (verbindungId: string) => loeseVerbindung(verbindungId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: BIBLIOTHEK_SCHLUESSEL });
      setLoesen(null);
    },
  });
  const liste = nachbarn(variante, bibliothek, orte);
  if (liste.length === 0) return null;

  return (
    <>
      <Listenabschnitt titel="Leichter und schwerer">
        {liste.map((nachbar) => {
          const name = nachbarName(nachbar.ort, uebungId);
          return (
            <ListRow
              key={nachbar.verbindung.id}
              titel={name}
              meta={`${nachbar.richtung} · Achse: ${ACHSE_LABEL[nachbar.verbindung.axis]}${
                nachbar.ort.variante.archived ? ' · archiviert' : ''
              }`}
              to={`/uebungen/${nachbar.ort.uebung.id}#variante-${nachbar.ort.variante.id}`}
              {...(bibliothek.can_manage
                ? {
                    aktion: (
                      <Button
                        type="button"
                        variant="quiet"
                        aria-label={`Verbindung zu „${name}“ lösen`}
                        onClick={() => {
                          loeseMutation.reset();
                          setLoesen(nachbar);
                        }}
                      >
                        Lösen
                      </Button>
                    ),
                  }
                : {})}
            />
          );
        })}
      </Listenabschnitt>
      {loesen ? (
        <Dialogfenster
          titel={`Verbindung zu „${nachbarName(loesen.ort, uebungId)}“ lösen`}
          onSchliessen={() => setLoesen(null)}
        >
          <p className="text-ink text-sm">Beide Varianten bleiben in der Bibliothek.</p>
          {loeseMutation.isError ? (
            <Statusmeldung ton="fehler" className="mt-3">
              {loeseMutation.error.message}
            </Statusmeldung>
          ) : null}
          <Formularfuss>
            <Button
              type="button"
              data-autofocus
              disabled={loeseMutation.isPending}
              onClick={() => loeseMutation.mutate(loesen.verbindung.id)}
            >
              {loeseMutation.isPending ? 'Wird gelöst …' : 'Ja, Verbindung lösen'}
            </Button>
            <Button
              type="button"
              variant="quiet"
              disabled={loeseMutation.isPending}
              onClick={() => setLoesen(null)}
            >
              Abbrechen
            </Button>
          </Formularfuss>
        </Dialogfenster>
      ) : null}
    </>
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
      className="max-w-formular mt-3"
      aria-label={`${BEGRIFFE.variante} verbinden`}
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

      <Formularfuss>
        <Button type="submit" disabled={speichern.isPending}>
          {speichern.isPending ? 'Wird verbunden …' : 'Verbinden'}
        </Button>
        <Button type="button" variant="quiet" onClick={onFertig}>
          Abbrechen
        </Button>
      </Formularfuss>
    </form>
  );
}
