import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Disclosure } from '@/components/ui/Card';
import { EmptyState, ErrorState } from '@/components/ui/Feedback';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Textlink } from '@/components/ui/Textlink';
import { canReadExerciseLibrary, type CurrentUser } from '@/features/session/types';
import { BEGRIFFE } from '@/lib/begriffe';
import {
  BIBLIOTHEK_SCHLUESSEL,
  fetchBibliothek,
  importiereKatalog,
  type Bibliothek,
  type Uebernahme,
} from './api';
import { offeneDurchsicht } from './durchsicht';
import { NeueUebungFormular } from './Formulare';
import type { Katalogeintrag } from './katalog/typen';
import {
  KATALOG_SCHLUESSEL,
  katalogUebernommen,
  ladeKatalog,
  neueKatalogeintraege,
} from './katalogLaden';
import { Bibliotheksfilter } from './Bibliotheksfilter';
import {
  KEIN_FILTER,
  ZEILEN_JE_SEITE,
  filtere,
  gesetzteFilter,
  ohneFilter,
  ordnungZeile,
  ungeprueft,
  type Filter,
  type Treffer,
} from './suche';
import { useFormularschutz } from './useFormularschutz';

/**
 * Die Übungsbibliothek der Praxis (UEB-EPIC-001; Welle B: Seitentyp „Liste“).
 *
 * Ein Katalog zum Nachschlagen - sortiert nach Bezeichnung, nach nichts
 * sonst. Keine Liste „passend zu" einer Diagnose, einem Befund oder einem
 * Verlauf (ADR-006 Punkt 10): Die Auswahl trifft die Person, die anleitet.
 *
 * Zeilen mit Vorschaubild, Suche in beiden Sprachebenen, Filter als Chips
 * (Region, Ziel, Ausgangsstellung, Hilfsmittel, Niveau), am Telefon hinter
 * „Filter (n)“. Owner übernimmt die mitgelieferte Standardbibliothek
 * (ANN-385) und legt eine Übung samt erster Variante in einem Formular an.
 */

function anzahlVarianten(n: number): string {
  return n === 1 ? `1 ${BEGRIFFE.variante}` : `${n} ${BEGRIFFE.varianten}`;
}

function Zeile({ treffer: { uebung, varianten, variantenTreffer } }: { treffer: Treffer }) {
  const aktiv = uebung.variants.filter((variante) => !variante.archived);
  // Ziel und Niveau von der ersten passenden Variante; eine Übung aus
  // dem Katalog hat genau eine (ANN-382).
  const erste = varianten[0] ?? aktiv[0];
  const offen = aktiv.some(ungeprueft);
  return (
    <ListRow
      titel={uebung.name}
      meta={
        <>
          {ordnungZeile(uebung, erste)}
          {aktiv.length > 1 ? ` · ${anzahlVarianten(aktiv.length)}` : ''}
          {/* ANN-386: leise in der Zeile, kein Abzeichen - bis zur Durchsicht
              ist „ungeprüft“ der Regelfall jeder übernommenen Übung. */}
          {offen ? ' · ungeprüft' : ''}
          {variantenTreffer.length > 0 ? (
            <span className="block">Gefunden in: {variantenTreffer.join(', ')}</span>
          ) : null}
        </>
      }
      to={`/uebungen/${uebung.id}`}
    />
  );
}

/**
 * Die Meldung nach der Übernahme (ANN-385). Sie nennt den Text
 * freiwillig „KI-erstellt“ und „ungeprüft“ (ANN-388, ANN-386).
 */
function uebernahmeSatz(e: Uebernahme): string {
  return [
    `${e.imported.length === 1 ? '1 Übung' : `${e.imported.length} Übungen`} übernommen`,
    e.skipped.length > 0 ? `, ${e.skipped.length} schon vorhanden und unverändert` : '',
    e.conflicts.length > 0
      ? `, ${e.conflicts.length} wegen gleicher Bezeichnung ausgelassen: ${e.conflicts
          .map((k) => k.name)
          .join(', ')}`
      : '',
    '. Die Übungen sind KI-erstellt und gelten bis zur Durchsicht durch die Praxis als ungeprüft.',
  ].join('');
}

/**
 * UEB-012 (ANN-385): den mitgelieferten Übungskatalog übernehmen - nur owner.
 * Der Katalog ist ein eigener Teil des Builds und wird nur für owner geladen.
 * Was die Praxis schon hat, bleibt unverändert; Namenskonflikte werden
 * genannt.
 *
 * Prominent, solange noch nichts übernommen ist; danach leise, und nur, wenn
 * der Katalog Einträge hat, die der Praxis fehlen.
 */
function KatalogUebernehmen({
  bibliothek,
  katalog,
  laeuft,
  onUebernehmen,
}: {
  bibliothek: Bibliothek;
  katalog: readonly Katalogeintrag[] | undefined;
  laeuft: boolean;
  onUebernehmen: () => void;
}) {
  if (!katalogUebernommen(bibliothek)) {
    return (
      <Section titel="Standardbibliothek" rahmen>
        <p className="text-liste text-ink max-w-prose">
          {katalog ? `${katalog.length} Übungen` : 'Übungen'} mit Anleitung in Schritten und
          Standarddosierung – als Kopie in die Bibliothek der Praxis.
        </p>
        <div className="mt-3">
          <Button type="button" disabled={laeuft} onClick={onUebernehmen}>
            {laeuft ? 'Wird übernommen …' : 'Standardbibliothek übernehmen'}
          </Button>
        </div>
      </Section>
    );
  }
  const neu = katalog ? neueKatalogeintraege(bibliothek, katalog) : 0;
  if (neu === 0) return null;
  return (
    <div className="mt-6 flex flex-wrap items-center gap-x-3">
      <p className="text-ink-muted text-sm">
        {neu === 1 ? '1 neuer Eintrag im Katalog' : `${neu} neue Einträge im Katalog`}
      </p>
      <Button
        type="button"
        variant="quiet"
        groesse="kompakt"
        disabled={laeuft}
        onClick={onUebernehmen}
      >
        {laeuft ? 'Wird übernommen …' : 'Übernehmen'}
      </Button>
    </div>
  );
}

/**
 * UEB-015 (ANN-561): Solange übernommene Übungen ungeprüft sind, steht für
 * owner eine Zeile mit dem Weg zur Durchsicht über der Liste.
 */
function Durchsichtszeile({ bibliothek }: { bibliothek: Bibliothek }) {
  if (!bibliothek.can_manage) return null;
  const offen = offeneDurchsicht(bibliothek).length;
  if (offen === 0) return null;
  return (
    <Statusmeldung ton="warnung" className="mb-4">
      {offen === 1 ? '1 Übung' : `${offen} Übungen`} aus dem Katalog noch nicht durchgesehen.{' '}
      <Textlink alleinstehend to="/uebungen/durchsicht">
        Durchsicht
      </Textlink>
    </Statusmeldung>
  );
}

function Liste({
  bibliothek,
  filter,
  setFilter,
}: {
  bibliothek: Bibliothek;
  filter: Filter;
  setFilter: (filter: Filter) => void;
}) {
  const alle = bibliothek.exercises;
  const aktivAlle = alle.filter((uebung) => !uebung.archived);
  const aktiv = filtere(aktivAlle, filter);
  const archiviert = filtere(
    alle.filter((uebung) => uebung.archived),
    filter,
  );
  const gefiltert = filter.text.trim() !== '' || gesetzteFilter(filter) > 0;
  const ueber = (n: number) => (n === 1 ? '1 Übung' : `${n} Übungen`);
  // „Weitere laden“ (DESIGN.md, Liste): 200 Zeilen auf einmal kosten
  // am Telefon Zeit und Rollen; eine neue Suche beginnt wieder oben.
  const [zeigen, setZeigen] = useState(ZEILEN_JE_SEITE);
  const filtern = (neu: Filter) => {
    setZeigen(ZEILEN_JE_SEITE);
    setFilter(neu);
  };

  return (
    <>
      <Bibliotheksfilter
        filter={filter}
        setFilter={filtern}
        uebungen={aktivAlle}
        ergebnis={
          gefiltert ? `${aktiv.length} von ${ueber(aktivAlle.length)}` : ueber(aktivAlle.length)
        }
      />
      {aktiv.length === 0 ? (
        <EmptyState
          inKarte
          title={
            gefiltert ? 'Keine Übung passt zu Suche und Filter.' : 'Alle Übungen sind archiviert.'
          }
          {...(gesetzteFilter(filter) > 0
            ? {
                aktion: (
                  <Button
                    type="button"
                    variant="secondary"
                    groesse="kompakt"
                    onClick={() => filtern(ohneFilter(filter))}
                  >
                    Filter zurücksetzen
                  </Button>
                ),
              }
            : {})}
        />
      ) : (
        <>
          <ListRows>
            {aktiv.slice(0, zeigen).map((treffer) => (
              <Zeile key={treffer.uebung.id} treffer={treffer} />
            ))}
          </ListRows>
          {aktiv.length > zeigen ? (
            <div className="mt-3">
              <Button
                type="button"
                variant="secondary"
                groesse="kompakt"
                onClick={() => setZeigen((bisher) => bisher + ZEILEN_JE_SEITE)}
              >
                Weitere laden ({aktiv.length - zeigen})
              </Button>
            </div>
          ) : null}
        </>
      )}
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
  );
}

export function UebungenPage({ user }: { user: CurrentUser }) {
  const darf = canReadExerciseLibrary(user.roles);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [anlegen, setAnlegen] = useState(false);
  const { melden, schutzFuer, freigeben } = useFormularschutz();
  const [filter, setFilter] = useState<Filter>(KEIN_FILTER);

  const abfrage = useQuery({
    queryKey: BIBLIOTHEK_SCHLUESSEL,
    queryFn: fetchBibliothek,
    enabled: darf,
    retry: false,
  });
  const pflegen = abfrage.data?.can_manage === true;
  const katalog = useQuery({
    queryKey: KATALOG_SCHLUESSEL,
    queryFn: ladeKatalog,
    enabled: pflegen,
    staleTime: Infinity,
    retry: false,
  });
  const uebernehmen = useMutation({
    mutationFn: async () => importiereKatalog(katalog.data ?? (await ladeKatalog())),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BIBLIOTHEK_SCHLUESSEL }),
  });

  if (!darf) {
    return (
      <ErrorState
        title="Nicht freigegeben"
        description="Die Übungsbibliothek steht den Rollen offen, die Übungen anleiten."
      />
    );
  }

  if (anlegen) {
    return (
      <>
        <PageHeader title={`Neue ${BEGRIFFE.uebung}`} />
        <NeueUebungFormular
          formularId="neu"
          onFertig={(angelegt) => {
            freigeben();
            void navigate(`/uebungen/${angelegt.uebungId}`, {
              state: { angelegt: angelegt.name, ohneVariante: angelegt.varianteId === null },
            });
          }}
          onAbbrechen={() => setAnlegen(false)}
          onUngespeichert={melden}
          schutz={schutzFuer('neu')}
        />
      </>
    );
  }

  const katalogKnopf = (bibliothek: Bibliothek) =>
    bibliothek.can_manage ? (
      <KatalogUebernehmen
        bibliothek={bibliothek}
        katalog={katalog.data}
        laeuft={uebernehmen.isPending}
        onUebernehmen={() => uebernehmen.mutate()}
      />
    ) : null;

  return (
    <>
      <PageHeader
        title={BEGRIFFE.uebungen}
        actions={
          <>
            {/* UEB-014: Vorlagen der Praxis und mitgelieferte. */}
            <ButtonLink variant="secondary" to="/uebungen/vorlagen">
              Vorlagen
            </ButtonLink>
            {pflegen ? (
              <Button type="button" onClick={() => setAnlegen(true)}>
                {BEGRIFFE.uebung} anlegen
              </Button>
            ) : null}
          </>
        }
      />
      {abfrage.data ? <Durchsichtszeile bibliothek={abfrage.data} /> : null}

      {uebernehmen.data ? (
        <Rueckmeldung key={uebernehmen.submittedAt} className="mb-4">
          {uebernahmeSatz(uebernehmen.data)}
        </Rueckmeldung>
      ) : null}
      {uebernehmen.isError ? (
        <Statusmeldung ton="fehler" className="mb-4">
          {uebernehmen.error.message}
        </Statusmeldung>
      ) : null}

      <Abfragezustand
        abfrage={abfrage}
        laden="Übungen werden geladen …"
        fehler="Die Übungsbibliothek konnte nicht geladen werden."
        inKarte
        leer={{
          wenn: (bibliothek) => bibliothek.exercises.length === 0 && !bibliothek.can_manage,
          titel: 'Noch keine Übungen',
          beschreibung: 'Die Übungsbibliothek pflegt die Praxisinhaber:in.',
        }}
      >
        {(bibliothek) =>
          bibliothek.exercises.length === 0 ? (
            // Nur owner: der Weg in die leere Bibliothek ist die Übernahme.
            katalogKnopf(bibliothek)
          ) : katalogUebernommen(bibliothek) ? (
            <>
              <Liste bibliothek={bibliothek} filter={filter} setFilter={setFilter} />
              {katalogKnopf(bibliothek)}
            </>
          ) : (
            <>
              {/* Prominent vor der Liste, solange nichts übernommen ist. */}
              {bibliothek.can_manage ? (
                <div className="mb-6">{katalogKnopf(bibliothek)}</div>
              ) : null}
              <Liste bibliothek={bibliothek} filter={filter} setFilter={setFilter} />
            </>
          )
        }
      </Abfragezustand>
    </>
  );
}
