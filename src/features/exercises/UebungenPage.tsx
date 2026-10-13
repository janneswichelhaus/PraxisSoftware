import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { SearchField } from '@/components/ui/SearchField';
import { Section } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { canReadExerciseLibrary, type CurrentUser } from '@/features/session/types';
import { BEGRIFFE } from '@/lib/begriffe';
import { BIBLIOTHEK_SCHLUESSEL, fetchBibliothek, importiereKatalog, type Uebung } from './api';
import { Uebungsbild } from './bild/Uebungsbild';
import { UebungFormular } from './Formulare';
import {
  KEIN_FILTER,
  OHNE_AUSRUESTUNG,
  ausruestungen,
  filtere,
  gesetzteFilter,
  type Filter,
  type Treffer,
} from './suche';
import { KOERPERREGIONEN, KOERPERREGION_LABEL } from './types';
import { useFormularschutz } from './useFormularschutz';

/**
 * Die Übungsbibliothek der Praxis (UEB-EPIC-001).
 *
 * Ein Katalog zum Nachschlagen - sortiert nach Bezeichnung, nach nichts
 * sonst. Keine Liste „passend zu" einer Diagnose, einem Befund oder einem
 * Verlauf (ADR-006 Punkt 10): Die Auswahl trifft die Person, die anleitet.
 *
 * Suche in beiden Sprachebenen, Filter nach Körperregion und Ausrüstung
 * (UEB-003); die Filter sind eingeklappt, bis jemand sie braucht.
 */

function anzahlVarianten(uebung: Uebung): string {
  const n = uebung.variants.filter((variante) => !variante.archived).length;
  return n === 1 ? `1 ${BEGRIFFE.variante}` : `${n} ${BEGRIFFE.varianten}`;
}

function Zeile({ treffer: { uebung, variantenTreffer } }: { treffer: Treffer }) {
  // UEB-012: das erste Bild der Übung als Vorschau (56 px); ohne Bild nur Text.
  const bild = uebung.variants.find((v) => !v.archived && v.illustration)?.illustration ?? null;
  return (
    <ListRow
      {...(bild
        ? {
            zeit: (
              <span className="block size-14">
                <Uebungsbild bild={bild} name={uebung.lay_name} darstellung="vorschau" dekorativ />
              </span>
            ),
          }
        : {})}
      titel={uebung.name}
      meta={
        <>
          {uebung.lay_name} · {KOERPERREGION_LABEL[uebung.body_region]} · {anzahlVarianten(uebung)}
          {variantenTreffer.length > 0 ? (
            <span className="block">Gefunden in: {variantenTreffer.join(', ')}</span>
          ) : null}
        </>
      }
      to={`/uebungen/${uebung.id}`}
    />
  );
}

function Filterleiste({
  filter,
  setFilter,
  uebungen,
}: {
  filter: Filter;
  setFilter: (filter: Filter) => void;
  uebungen: readonly Uebung[];
}) {
  const geraete = ausruestungen(uebungen);
  const anzahl = gesetzteFilter(filter);
  return (
    <div className="mb-6 flex flex-col gap-2">
      <div className="max-w-xl">
        <SearchField
          label="Suche"
          placeholder="Bezeichnung, auch in Alltagssprache"
          value={filter.text}
          onChange={(text) => setFilter({ ...filter, text })}
        />
      </div>
      <Disclosure summary="Filter" {...(anzahl > 0 ? { anzahl } : {})} offen={anzahl > 0}>
        <div className="grid max-w-xl gap-4 sm:grid-cols-2">
          <Select
            label="Körperregion"
            value={filter.region}
            onChange={(event) => setFilter({ ...filter, region: event.target.value })}
          >
            <option value="">Alle</option>
            {KOERPERREGIONEN.map((kennung) => (
              <option key={kennung} value={kennung}>
                {KOERPERREGION_LABEL[kennung]}
              </option>
            ))}
          </Select>
          <Select
            label="Ausrüstung"
            value={filter.ausruestung}
            onChange={(event) => setFilter({ ...filter, ausruestung: event.target.value })}
          >
            <option value="">Alle</option>
            <option value={OHNE_AUSRUESTUNG}>Ohne Ausrüstung</option>
            {geraete.map((geraet) => (
              <option key={geraet} value={geraet}>
                {geraet}
              </option>
            ))}
          </Select>
        </div>
        {anzahl > 0 ? (
          <Button
            type="button"
            variant="quiet"
            groesse="kompakt"
            className="mt-2"
            onClick={() => setFilter({ ...filter, region: '', ausruestung: '' })}
          >
            Filter zurücksetzen
          </Button>
        ) : null}
      </Disclosure>
    </div>
  );
}

/**
 * UEB-012 (ANN-385): den mitgelieferten Übungskatalog übernehmen - nur owner.
 * Der Katalog wird erst beim Tippen geladen (eigener Teil des Builds). Was die
 * Praxis schon hat, bleibt unverändert; Namenskonflikte werden genannt. Die
 * Meldung nennt Text und Bild freiwillig „KI-erstellt" und „ungeprüft"
 * (ANN-388, ANN-386).
 */
function KatalogUebernehmen() {
  const queryClient = useQueryClient();
  const uebernehmen = useMutation({
    mutationFn: async () => {
      const { KATALOG } = await import('./katalog');
      return importiereKatalog(KATALOG);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BIBLIOTHEK_SCHLUESSEL }),
  });
  const e = uebernehmen.data;
  return (
    <div className="mb-6 flex flex-col gap-2">
      <div>
        <Button
          type="button"
          variant="secondary"
          disabled={uebernehmen.isPending}
          onClick={() => uebernehmen.mutate()}
        >
          {uebernehmen.isPending ? 'Wird übernommen …' : 'Standardbibliothek übernehmen'}
        </Button>
      </div>
      {e ? (
        <Statusmeldung ton="erfolg">
          {e.imported.length === 1 ? '1 Übung' : `${e.imported.length} Übungen`} übernommen
          {e.skipped.length > 0 ? `, ${e.skipped.length} schon vorhanden und unverändert` : ''}
          {e.conflicts.length > 0
            ? `, ${e.conflicts.length} wegen gleicher Bezeichnung ausgelassen: ${e.conflicts
                .map((k) => k.name)
                .join(', ')}`
            : ''}
          . Die Übungen sind KI-erstellt und gelten bis zur Durchsicht durch die Praxis als
          ungeprüft.
        </Statusmeldung>
      ) : null}
      {uebernehmen.isError ? (
        <Statusmeldung ton="fehler">{uebernehmen.error.message}</Statusmeldung>
      ) : null}
    </div>
  );
}

export function UebungenPage({ user }: { user: CurrentUser }) {
  const darf = canReadExerciseLibrary(user.roles);
  const [anlegen, setAnlegen] = useState(false);
  const [angelegt, setAngelegt] = useState<{ name: string; id: string } | null>(null);
  const bestaetigung = useRef<HTMLDivElement>(null);
  const { melden, schutzFuer } = useFormularschutz();
  const [filter, setFilter] = useState<Filter>(KEIN_FILTER);

  useEffect(() => {
    if (angelegt) bestaetigung.current?.focus();
  }, [angelegt]);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: BIBLIOTHEK_SCHLUESSEL,
    queryFn: fetchBibliothek,
    enabled: darf,
    retry: false,
  });

  if (!darf) {
    return (
      <ErrorState
        title="Nicht freigegeben"
        description="Die Übungsbibliothek steht den Rollen offen, die Übungen anleiten."
      />
    );
  }

  const alle = data?.exercises ?? [];
  const aktivAlle = alle.filter((uebung) => !uebung.archived);
  const aktiv = filtere(aktivAlle, filter);
  const archiviert = filtere(
    alle.filter((uebung) => uebung.archived),
    filter,
  );
  const gefiltert = filter.text.trim() !== '' || gesetzteFilter(filter) > 0;

  return (
    <>
      <PageHeader
        title={BEGRIFFE.uebungen}
        description="Die Übungsbibliothek der Praxis für Behandlung und Training – zum Nachschlagen, sortiert nach Bezeichnung."
        actions={
          data?.can_manage && !anlegen ? (
            <Button
              type="button"
              onClick={() => {
                setAngelegt(null);
                setAnlegen(true);
              }}
            >
              {BEGRIFFE.uebung} anlegen
            </Button>
          ) : null
        }
      />

      {anlegen ? (
        <Section titel={`Neue ${BEGRIFFE.uebung}`}>
          <UebungFormular
            formularId="neu"
            onFertig={(name, id) => {
              setAnlegen(false);
              setAngelegt({ name, id });
            }}
            onAbbrechen={() => setAnlegen(false)}
            onUngespeichert={melden}
            schutz={schutzFuer('neu')}
          />
        </Section>
      ) : null}

      {angelegt ? (
        <div ref={bestaetigung} tabIndex={-1} className="mb-4">
          <Statusmeldung ton="erfolg">
            {BEGRIFFE.uebung} „{angelegt.name}“ angelegt. Varianten legen Sie in der Übung an.
          </Statusmeldung>
        </div>
      ) : null}

      {data?.can_manage ? <KatalogUebernehmen /> : null}

      {isPending ? <LoadingState label="Übungen werden geladen …" /> : null}
      {isError ? (
        <ErrorState
          title="Die Übungsbibliothek konnte nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => refetch()}
        />
      ) : null}

      {data ? (
        alle.length === 0 ? (
          <EmptyState
            title="Noch keine Übungen"
            description={
              data.can_manage
                ? 'Legen Sie die erste Übung an.'
                : 'Die Übungsbibliothek pflegt die Praxisinhaber:in.'
            }
          />
        ) : (
          <>
            <Filterleiste filter={filter} setFilter={setFilter} uebungen={aktivAlle} />
            <Section titel={BEGRIFFE.uebungen}>
              {/* Wie viele die Suche zeigt, sagt eine Zeile, die Vorlesesoftware
                  beim Tippen mitliest. */}
              <p role="status" className="text-ink-muted mb-2 text-sm">
                {gefiltert ? `${aktiv.length} von ${aktivAlle.length} Übungen` : null}
              </p>
              {aktiv.length === 0 ? (
                <p className="text-ink-muted text-liste">
                  {gefiltert
                    ? 'Keine Übung passt zu Suche und Filter.'
                    : 'Alle Übungen sind archiviert.'}
                </p>
              ) : (
                <ListRows>
                  {aktiv.map((treffer) => (
                    <Zeile key={treffer.uebung.id} treffer={treffer} />
                  ))}
                </ListRows>
              )}
            </Section>
            {archiviert.length > 0 ? (
              <div className="mt-8">
                <Disclosure summary="Archiviert" anzahl={archiviert.length} kopf="label">
                  <ListRows>
                    {archiviert.map((treffer) => (
                      <Zeile key={treffer.uebung.id} treffer={treffer} />
                    ))}
                  </ListRows>
                </Disclosure>
              </div>
            ) : null}
          </>
        )
      ) : null}
    </>
  );
}
