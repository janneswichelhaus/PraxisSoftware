import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { BIBLIOTHEK_SCHLUESSEL, fetchBibliothek, type Uebung } from './api';
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
  return (
    <ListRow
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
