import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Card';
import { EmptyState, ErrorState } from '@/components/ui/Feedback';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { Objektkopf, Warnzeile } from '@/components/ui/Objektkopf';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Schrittliste } from '@/components/ui/Schrittliste';
import { zeilen } from '@/components/ui/zeilen';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Tile, TileGrid } from '@/components/ui/Tile';
import { Zweispalter } from '@/components/ui/Zweispalter';
import { Zwischentitel } from '@/components/ui/Zwischentitel';
import { FREITEXT } from '@/features/documentation/format';
import {
  canReadExerciseLibrary,
  canWriteExercisePlans,
  type CurrentUser,
} from '@/features/session/types';
import { ZuEinemPlan } from '@/features/exercise-plans/ZuEinemPlan';
import { BEGRIFFE } from '@/lib/begriffe';
import { formatDate } from '@/lib/datum';
import {
  BIBLIOTHEK_SCHLUESSEL,
  archiviereUebung,
  archiviereVariante,
  fetchBibliothek,
  loescheUebung,
  loescheVariante,
  setzePruefvermerk,
  type Bibliothek,
  type Standarddosierung,
  type Uebung,
  type Variante,
} from './api';
import { UebungFormular, VarianteFormular } from './Formulare';
import { AUSGANGSSTELLUNG_LABEL, NIVEAU_LABEL, ZIEL_LABEL } from './katalog/typen';
import { variantenOrte } from './orte';
import { ungeprueft } from './suche';
import { KOERPERREGION_LABEL } from './types';
import { useFormularschutz } from './useFormularschutz';
import { VerbindungFormular, VerbindungenAnzeige } from './Verbindungen';

/**
 * Eine Übung (UEB-001; Welle B: Seitentyp „Objekt“).
 *
 * Oben der Objektkopf, darunter die Variante, die gerade gezeigt wird: die
 * Standarddosierung als Kacheln, die Anleitung in Schritten, typische Fehler
 * und die Hinweise für die Praxis. Eine Zeichnung gibt es nicht (ANN-539):
 * Bilder und Videos dreht die Praxis selbst, bis dahin erklärt der Text.
 * Weitere Varianten, leichter und schwerer, stehen als Zeilen daneben (ab
 * 900 px) oder darunter. Ein Sprung auf
 * `#variante-…` zeigt diese Variante.
 *
 * Pflegen darf nur die Praxisinhaber:in (ANN-293); der Server prüft das, die
 * Knöpfe folgen nur. Seltenes - archivieren, löschen, verbinden - steht leise
 * am Ende.
 */

type Schutz = ReturnType<typeof useFormularschutz>;
type Formular = 'uebung' | 'variante' | 'neue-variante' | 'verbinden' | null;

/** Die Kennung hinter `#`; ein kaputter Anker ist keiner. */
function ankerZiel(hash: string): string | null {
  if (!hash) return null;
  try {
    return decodeURIComponent(hash.slice(1));
  } catch {
    return null;
  }
}

function dauer(sekunden: number): string {
  return sekunden >= 120 && sekunden % 60 === 0 ? `${sekunden / 60} min` : `${sekunden} s`;
}

/**
 * Die Standarddosierung als Kacheln (ANN-384): Sätze, Wiederholungen oder
 * Dauer - je Seite und Halten als Nebenzeile -, wie oft am Tag. Drei passen
 * am Rechner in eine Reihe.
 */
function Dosierkacheln({ d }: { d: Standarddosierung }) {
  const wdh =
    d.reps_min === null || d.reps_max === null
      ? null
      : d.reps_min === d.reps_max
        ? `${d.reps_min}`
        : `${d.reps_min}–${d.reps_max}`;
  const zusatz = [
    d.per_side ? 'je Seite' : null,
    wdh && d.hold_seconds ? `${d.hold_seconds} s halten` : null,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <TileGrid spalte="kachel">
      <Tile label="Sätze">{d.sets}</Tile>
      <Tile label={wdh ? 'Wiederholungen' : 'Dauer'} {...(zusatz ? { zusatz } : {})}>
        {wdh ?? dauer(d.duration_seconds ?? 0)}
      </Tile>
      {d.times_per_day ? <Tile label="Am Tag">{d.times_per_day}-mal</Tile> : null}
    </TileGrid>
  );
}

/** Ordnungen des Katalogs als Zeile - Ziel · Ausgangsstellung · Niveau. */
function ordnungen(variante: Variante): string | null {
  const teile = [
    variante.goal ? ZIEL_LABEL[variante.goal] : null,
    variante.starting_position ? AUSGANGSSTELLUNG_LABEL[variante.starting_position] : null,
    variante.level ? NIVEAU_LABEL[variante.level as 1 | 2 | 3] : null,
  ].filter(Boolean);
  return teile.length > 0 ? teile.join(' · ') : null;
}

/** Anleitung, Fehler, Hinweise und Ausrüstung in einer Karte (L2). */
function Anleitung({ variante }: { variante: Variante }) {
  const fehler = zeilen(variante.common_faults);
  return (
    <Section titel="Anleitung" rahmen>
      <div className="text-liste">
        <Schrittliste text={variante.instruction} leer="Noch keine Anleitung." />
      </div>
      {fehler.length > 0 ? (
        <>
          <Zwischentitel>Typische Fehler</Zwischentitel>
          <ul className="text-liste text-ink flex list-disc flex-col gap-1 pl-5">
            {fehler.map((zeile, index) => (
              <li key={index}>{zeile}</li>
            ))}
          </ul>
        </>
      ) : null}
      {variante.practice_notes ? (
        <>
          <Zwischentitel>Hinweise für die Praxis</Zwischentitel>
          <p className={`text-liste text-ink max-w-prose ${FREITEXT}`}>{variante.practice_notes}</p>
        </>
      ) : null}
      <Zwischentitel>Ausrüstung</Zwischentitel>
      <p className="text-liste text-ink">
        {variante.equipment.length > 0 ? variante.equipment.join(', ') : 'Keine'}
      </p>
    </Section>
  );
}

/**
 * UEB-003 (IDEA-QSN-002): nur die zweite Sprachebene, so wie sie
 * Patient:innen und Kund:innen später lesen - ohne die fachlichen Angaben
 * der Praxis. Eine Vorschau, kein Versand.
 */
function Alltagsansicht({ uebungLaie, variante }: { uebungLaie: string; variante: Variante }) {
  return (
    <Disclosure summary={`Ansicht in ${BEGRIFFE.alltagssprache}`}>
      <div className="bg-surface-sunken rounded-card max-w-prose p-4">
        <p className="text-ink-muted text-sm">{uebungLaie}</p>
        <p className="text-ink text-liste font-semibold">{variante.lay_name}</p>
        {/* Die Schritte wie auf der Plattform (ANN-539). */}
        <div className="text-ink text-liste mt-2">
          <Schrittliste text={variante.instruction} leer="Noch keine Kurzanleitung." />
        </div>
        {variante.equipment.length > 0 ? (
          <p className="text-ink-muted mt-2 text-sm">Ausrüstung: {variante.equipment.join(', ')}</p>
        ) : null}
      </div>
    </Disclosure>
  );
}

/** Seltenes zur gezeigten Variante und zur Übung - leise am Ende (DESIGN.md 9.16). */
function Pflege({
  uebung,
  variante,
  onFormular,
}: {
  uebung: Uebung;
  variante: Variante | undefined;
  onFormular: (formular: Formular) => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const aktualisieren = () => queryClient.invalidateQueries({ queryKey: BIBLIOTHEK_SCHLUESSEL });
  const varianteArchivieren = useMutation({
    mutationFn: (v: Variante) => archiviereVariante(v.id, !v.archived),
    onSuccess: aktualisieren,
  });
  const varianteLoeschen = useMutation({
    mutationFn: (v: Variante) => loescheVariante(v.id),
    onSuccess: async () => {
      await aktualisieren();
      void navigate(`/uebungen/${uebung.id}`, { replace: true });
    },
  });
  const uebungArchivieren = useMutation({
    mutationFn: () => archiviereUebung(uebung.id, !uebung.archived),
    onSuccess: aktualisieren,
  });
  const uebungLoeschen = useMutation({
    mutationFn: () => loescheUebung(uebung.id),
    onSuccess: async () => {
      await aktualisieren();
      void navigate('/uebungen');
    },
  });
  const pruefvermerk = useMutation({
    mutationFn: (v: Variante) => setzePruefvermerk(v.id, false),
    onSuccess: aktualisieren,
  });
  const fehler = varianteArchivieren.error ?? uebungArchivieren.error ?? pruefvermerk.error ?? null;

  return (
    <div className="mt-8">
      <Disclosure summary="Pflege" kopf="label">
        <div className="flex flex-wrap items-start gap-3">
          <Button
            type="button"
            variant="secondary"
            groesse="kompakt"
            onClick={() => onFormular('uebung')}
          >
            Bezeichnung und Region
          </Button>
          {variante && !variante.archived ? (
            <Button
              type="button"
              variant="secondary"
              groesse="kompakt"
              onClick={() => onFormular('verbinden')}
            >
              Verbinden
            </Button>
          ) : null}
          {variante ? (
            <Button
              type="button"
              variant="secondary"
              groesse="kompakt"
              disabled={varianteArchivieren.isPending}
              onClick={() => varianteArchivieren.mutate(variante)}
            >
              {variante.archived ? 'Variante zurückholen' : 'Variante archivieren'}
            </Button>
          ) : null}
          {variante?.reviewed_at ? (
            <Button
              type="button"
              variant="quiet"
              groesse="kompakt"
              disabled={pruefvermerk.isPending}
              onClick={() => pruefvermerk.mutate(variante)}
            >
              Prüfvermerk zurücknehmen
            </Button>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            groesse="kompakt"
            disabled={uebungArchivieren.isPending}
            onClick={() => uebungArchivieren.mutate()}
          >
            {uebung.archived ? 'Übung zurückholen' : 'Übung archivieren'}
          </Button>
          {variante ? (
            <Rueckfrage
              ausloeser="Variante löschen"
              ausloeserVariante="quiet"
              ausloeserGroesse="kompakt"
              bezeichnung={`${BEGRIFFE.variante} „${variante.name}“ löschen`}
              bestaetigen="Ja, Variante löschen"
              bestaetigenLaeuft="Wird gelöscht …"
              fehler={varianteLoeschen.isError ? varianteLoeschen.error.message : undefined}
              laeuft={varianteLoeschen.isPending}
              onBestaetigen={() => varianteLoeschen.mutateAsync(variante)}
              onAbbrechen={() => varianteLoeschen.reset()}
            >
              Die Variante wird gelöscht. Was in Gebrauch war, besser archivieren – dann bleibt es
              nachlesbar.
            </Rueckfrage>
          ) : null}
          {uebung.variants.length === 0 ? (
            <Rueckfrage
              ausloeser="Übung löschen"
              ausloeserVariante="quiet"
              ausloeserGroesse="kompakt"
              bezeichnung={`${BEGRIFFE.uebung} „${uebung.name}“ löschen`}
              bestaetigen="Ja, Übung löschen"
              bestaetigenLaeuft="Wird gelöscht …"
              fehler={uebungLoeschen.isError ? uebungLoeschen.error.message : undefined}
              laeuft={uebungLoeschen.isPending}
              onBestaetigen={() => uebungLoeschen.mutateAsync()}
              onAbbrechen={() => uebungLoeschen.reset()}
            >
              Die Übung wird gelöscht.
            </Rueckfrage>
          ) : null}
        </div>
        {fehler ? (
          <Statusmeldung ton="fehler" className="mt-3">
            {fehler.message}
          </Statusmeldung>
        ) : null}
        <Kleingedrucktes className="mt-3">
          Archiviert steht eine Übung nicht mehr in der Bibliothek, bleibt aber nachlesbar. Löschen
          geht nur ohne Varianten.
        </Kleingedrucktes>
      </Disclosure>
    </div>
  );
}

function VarianteZeile({
  uebungId,
  variante,
  meta,
}: {
  uebungId: string;
  variante: Variante;
  meta: ReactNode;
}) {
  return (
    <ListRow
      titel={variante.name}
      meta={meta}
      to={`/uebungen/${uebungId}#variante-${variante.id}`}
    />
  );
}

export function UebungAnsicht({ user, uebungId }: { user: CurrentUser; uebungId: string }) {
  const darf = canReadExerciseLibrary(user.roles);
  const abfrage = useQuery({
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

  return (
    <>
      <Rueckweg standard="/uebungen" className="mb-3 max-sm:hidden" />
      <Abfragezustand
        abfrage={abfrage}
        laden="Übung wird geladen …"
        fehler="Die Übung konnte nicht geladen werden."
        inKarte
      >
        {(bibliothek) => {
          const uebung = bibliothek.exercises.find((eintrag) => eintrag.id === uebungId);
          return uebung ? (
            <Inhalt
              bibliothek={bibliothek}
              uebung={uebung}
              zuPlan={canWriteExercisePlans(user.roles, 'therapy')}
            />
          ) : (
            <EmptyState
              inKarte
              title="Übung nicht gefunden"
              description="Vielleicht wurde sie gelöscht. Die Bibliothek zeigt alle Übungen der Praxis."
            />
          );
        }}
      </Abfragezustand>
    </>
  );
}

function Inhalt({
  bibliothek,
  uebung,
  zuPlan,
}: {
  bibliothek: Bibliothek;
  uebung: Uebung;
  /** Darf die Person Übungspläne schreiben? Dann „Zu einem Plan“ (ANN-503). */
  zuPlan: boolean;
}) {
  const schutz: Schutz = useFormularschutz();
  const queryClient = useQueryClient();
  const [formular, setFormular] = useState<Formular>(null);
  const [meldung, setMeldung] = useState<{ text: string; nr: number } | null>(null);
  const orte = useMemo(() => variantenOrte(bibliothek), [bibliothek]);
  const pflegen = bibliothek.can_manage;

  // Nach dem Anlegen kommt die Seite mit einer Meldung (UebungenPage).
  const ort = useLocation();
  const angelegt = (ort.state as { angelegt?: string } | null)?.angelegt;

  // Ein Sprung von einer verbundenen Variante zielt auf sie (UEB-002); der
  // Router rollt zu einem Anker nicht von selbst.
  const ziel = ankerZiel(ort.hash);
  useEffect(() => {
    if (ziel) document.getElementById('variante')?.scrollIntoView?.();
  }, [ziel]);

  const aktiv = uebung.variants.filter((variante) => !variante.archived);
  const archiviert = uebung.variants.filter((variante) => variante.archived);
  const gezeigt =
    uebung.variants.find((variante) => ziel === `variante-${variante.id}`) ??
    aktiv[0] ??
    archiviert[0];

  const durchsehen = useMutation({
    mutationFn: (variante: Variante) => setzePruefvermerk(variante.id, true),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: BIBLIOTHEK_SCHLUESSEL });
      setMeldung((bisher) => ({
        text: 'Als durchgesehen vermerkt.',
        nr: (bisher?.nr ?? 0) + 1,
      }));
    },
  });

  const schliessen = () => setFormular(null);
  const melden = (text: string) => {
    setFormular(null);
    setMeldung((bisher) => ({ text, nr: (bisher?.nr ?? 0) + 1 }));
  };

  // Ein offenes Formular ist die Seite (Seitentyp „Formular“).
  if (formular === 'uebung') {
    return (
      <>
        <PageHeader title={`${BEGRIFFE.uebung} bearbeiten`} />
        <UebungFormular
          formularId="uebung"
          uebung={uebung}
          onFertig={() => melden('Gespeichert.')}
          onAbbrechen={schliessen}
          onUngespeichert={schutz.melden}
          schutz={schutz.schutzFuer('uebung')}
        />
      </>
    );
  }
  if (formular === 'variante' && gezeigt) {
    return (
      <>
        <PageHeader title={`${BEGRIFFE.variante} bearbeiten`} description={gezeigt.name} />
        <VarianteFormular
          formularId={gezeigt.id}
          uebungId={uebung.id}
          variante={gezeigt}
          onFertig={() => melden('Gespeichert.')}
          onAbbrechen={schliessen}
          onUngespeichert={schutz.melden}
          schutz={schutz.schutzFuer(gezeigt.id)}
        />
      </>
    );
  }
  if (formular === 'neue-variante') {
    return (
      <>
        <PageHeader title={`Neue ${BEGRIFFE.variante}`} description={uebung.name} />
        <VarianteFormular
          formularId="neue-variante"
          uebungId={uebung.id}
          onFertig={(name) => melden(`${BEGRIFFE.variante} „${name}“ angelegt.`)}
          onAbbrechen={schliessen}
          onUngespeichert={schutz.melden}
          schutz={schutz.schutzFuer('neue-variante')}
        />
      </>
    );
  }

  const offen = gezeigt ? ungeprueft(gezeigt) : false;
  const ordnung = gezeigt ? ordnungen(gezeigt) : null;
  const weitere = aktiv.filter((variante) => variante.id !== gezeigt?.id);

  return (
    <>
      <Objektkopf
        titel={uebung.name}
        rueckweg={{ to: '/uebungen', beschriftung: 'Zurück zu den Übungen' }}
        meta={`${uebung.lay_name} · ${KOERPERREGION_LABEL[uebung.body_region]}`}
        status={uebung.archived ? <Badge ton="warnung">Archiviert</Badge> : null}
        aktionen={
          gezeigt && (zuPlan || pflegen) ? (
            <>
              {zuPlan && !uebung.archived ? (
                <ZuEinemPlan
                  variante={gezeigt}
                  rueckweg={`/uebungen/${uebung.id}#variante-${gezeigt.id}`}
                />
              ) : null}
              {pflegen ? (
                <Button type="button" variant="secondary" onClick={() => setFormular('variante')}>
                  Bearbeiten
                </Button>
              ) : null}
            </>
          ) : null
        }
        hinweise={
          offen && gezeigt ? (
            // ANN-386: KI-erstellt und bis zur Durchsicht ungeprüft - vor dem
            // Einsatz bei echten Patient:innen sieht die Praxis sie durch.
            <Warnzeile
              aktion={
                pflegen ? (
                  <Button
                    type="button"
                    variant="secondary"
                    groesse="kompakt"
                    disabled={durchsehen.isPending}
                    onClick={() => durchsehen.mutate(gezeigt)}
                  >
                    {durchsehen.isPending ? 'Wird vermerkt …' : 'Als durchgesehen markieren'}
                  </Button>
                ) : null
              }
            >
              Aus dem Übungskatalog, noch nicht von der Praxis durchgesehen
            </Warnzeile>
          ) : undefined
        }
      />

      {angelegt && !meldung ? (
        <Rueckmeldung className="mt-4">
          {BEGRIFFE.uebung} „{angelegt}“ angelegt.
        </Rueckmeldung>
      ) : null}
      {meldung ? (
        <Rueckmeldung key={meldung.nr} className="mt-4">
          {meldung.text}
        </Rueckmeldung>
      ) : null}
      {durchsehen.isError ? (
        <Statusmeldung ton="fehler" className="mt-4">
          {durchsehen.error.message}
        </Statusmeldung>
      ) : null}

      <div className="mt-6">
        <Zweispalter
          kontextBreite="schmal"
          kontext={
            gezeigt ? (
              <>
                <VerbindungenAnzeige
                  variante={gezeigt}
                  uebungId={uebung.id}
                  bibliothek={bibliothek}
                  orte={orte}
                />
                {weitere.length > 0 || pflegen ? (
                  <Listenabschnitt
                    titel={gezeigt.archived ? BEGRIFFE.varianten : `Weitere ${BEGRIFFE.varianten}`}
                    {...(weitere.length > 0 ? { anzahl: weitere.length } : {})}
                    {...(pflegen
                      ? {
                          aktion: (
                            <Button
                              type="button"
                              variant="secondary"
                              groesse="kompakt"
                              onClick={() => setFormular('neue-variante')}
                            >
                              {BEGRIFFE.variante} anlegen
                            </Button>
                          ),
                        }
                      : {})}
                  >
                    {weitere.map((variante) => (
                      <VarianteZeile
                        key={variante.id}
                        uebungId={uebung.id}
                        variante={variante}
                        meta={variante.lay_name}
                      />
                    ))}
                  </Listenabschnitt>
                ) : null}
                {archiviert.filter((v) => v.id !== gezeigt.id).length > 0 ? (
                  <Disclosure
                    summary="Archivierte Varianten"
                    anzahl={archiviert.filter((v) => v.id !== gezeigt.id).length}
                    kopf="label"
                  >
                    <ListRows>
                      {archiviert
                        .filter((v) => v.id !== gezeigt.id)
                        .map((variante) => (
                          <VarianteZeile
                            key={variante.id}
                            uebungId={uebung.id}
                            variante={variante}
                            meta="archiviert"
                          />
                        ))}
                    </ListRows>
                  </Disclosure>
                ) : null}
              </>
            ) : undefined
          }
        >
          {gezeigt ? (
            <div id="variante" className="flex scroll-mt-4 flex-col gap-6 [&>section]:mt-0">
              {gezeigt.name !== uebung.name || aktiv.length > 1 || gezeigt.archived ? (
                <div>
                  <p className="text-ink text-liste font-semibold">
                    {gezeigt.name}
                    {gezeigt.archived ? (
                      <span className="ml-2 align-middle">
                        <Badge>Archiviert</Badge>
                      </span>
                    ) : null}
                  </p>
                  <p className="text-ink-muted text-sm">
                    {BEGRIFFE.alltagssprache}: {gezeigt.lay_name}
                  </p>
                </div>
              ) : null}
              {ordnung ? <p className="text-ink-muted text-sm">{ordnung}</p> : null}
              {gezeigt.default_dosage ? (
                <Section titel="Standarddosierung">
                  <Dosierkacheln d={gezeigt.default_dosage} />
                </Section>
              ) : null}
              <Anleitung variante={gezeigt} />
              <Alltagsansicht uebungLaie={uebung.lay_name} variante={gezeigt} />
              {formular === 'verbinden' ? (
                <Section titel="Verbinden">
                  <VerbindungFormular
                    variante={gezeigt}
                    bibliothek={bibliothek}
                    formularId={`verbindung-${gezeigt.id}`}
                    onFertig={schliessen}
                    onUngespeichert={schutz.melden}
                    schutz={schutz.schutzFuer(`verbindung-${gezeigt.id}`)}
                  />
                </Section>
              ) : null}
              {gezeigt.catalog_key ? (
                <Kleingedrucktes>
                  Aus dem Übungskatalog ({gezeigt.catalog_key}, Fassung {gezeigt.catalog_version}
                  ), Text KI-erstellt.
                  {gezeigt.reviewed_at
                    ? ` Durchgesehen am ${formatDate(gezeigt.reviewed_at.slice(0, 10))}${
                        gezeigt.reviewed_by_name ? ` von ${gezeigt.reviewed_by_name}` : ''
                      }.`
                    : ''}
                </Kleingedrucktes>
              ) : null}
            </div>
          ) : (
            <EmptyState
              inKarte
              title="Noch keine Variante"
              description={
                pflegen
                  ? 'Geübt wird immer in einer Variante.'
                  : 'Die Bibliothek pflegt die Praxisinhaber:in.'
              }
              {...(pflegen
                ? {
                    aktion: (
                      <Button
                        type="button"
                        variant="secondary"
                        groesse="kompakt"
                        onClick={() => setFormular('neue-variante')}
                      >
                        {BEGRIFFE.variante} anlegen
                      </Button>
                    ),
                  }
                : {})}
            />
          )}
        </Zweispalter>
      </div>

      {pflegen ? <Pflege uebung={uebung} variante={gezeigt} onFormular={setFormular} /> : null}
    </>
  );
}

export function UebungPage({ user }: { user: CurrentUser }) {
  const { uebungId = '' } = useParams<{ uebungId: string }>();
  // Ein Sprung zu einer verbundenen Übung ist eine neue Übung: Offene
  // Formulare der alten dürfen nicht mitwandern (Zweitreview H1).
  return <UebungAnsicht key={uebungId} user={user} uebungId={uebungId} />;
}
