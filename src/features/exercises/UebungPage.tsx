import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, Disclosure } from '@/components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { FREITEXT } from '@/features/documentation/format';
import { canReadExerciseLibrary, type CurrentUser } from '@/features/session/types';
import { BEGRIFFE } from '@/lib/begriffe';
import {
  BIBLIOTHEK_SCHLUESSEL,
  archiviereUebung,
  archiviereVariante,
  fetchBibliothek,
  loescheUebung,
  loescheVariante,
  type Bibliothek,
  type Uebung,
  type Variante,
} from './api';
import { UebungFormular, VarianteFormular } from './Formulare';
import { variantenOrte, type Ort } from './orte';
import { VerbindungFormular, VerbindungenAnzeige } from './Verbindungen';
import { KOERPERREGION_LABEL } from './types';
import { useFormularschutz } from './useFormularschutz';

/**
 * Eine Übung mit ihren Varianten (UEB-001).
 *
 * Jede Variante steht mit beiden Bezeichnungen da - der fachlichen und der in
 * Alltagssprache (IDEA-QSN-002) -, dazu Kurzanleitung, Ausrüstung,
 * Ausweichbewegungen und die Hinweise für die Praxis. Pflegen darf nur die
 * Praxisinhaber:in (ANN-293); der Server prüft das, die Knöpfe folgen nur.
 */

type Schutz = ReturnType<typeof useFormularschutz>;

function Angabe({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-ink-muted text-sm">{label}</dt>
      <dd className={`text-ink text-liste mt-0.5 max-w-prose ${FREITEXT}`}>{children}</dd>
    </div>
  );
}

function VarianteKarte({
  uebungId,
  uebungLaie,
  variante,
  bibliothek,
  orte,
  schutz,
}: {
  uebungId: string;
  /** Die Übung in Alltagssprache - Überschrift der Ansicht für Patient:innen. */
  uebungLaie: string;
  variante: Variante;
  bibliothek: Bibliothek;
  orte: Map<string, Ort>;
  schutz: Schutz;
}) {
  const darfPflegen = bibliothek.can_manage;
  const queryClient = useQueryClient();
  const [bearbeiten, setBearbeiten] = useState(false);
  const [verbinden, setVerbinden] = useState(false);
  const aktualisieren = () => queryClient.invalidateQueries({ queryKey: BIBLIOTHEK_SCHLUESSEL });

  const archivieren = useMutation({
    mutationFn: () => archiviereVariante(variante.id, !variante.archived),
    onSuccess: aktualisieren,
  });
  const loeschen = useMutation({
    mutationFn: () => loescheVariante(variante.id),
    onSuccess: aktualisieren,
  });

  return (
    <Card>
      <div id={`variante-${variante.id}`} className="scroll-mt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-ink text-liste font-semibold">{variante.name}</h3>
          {variante.archived ? <Badge ton="neutral">Archiviert</Badge> : null}
        </div>
        <p className="text-ink-muted mt-0.5 text-sm">
          {BEGRIFFE.alltagssprache}: {variante.lay_name}
        </p>

        {bearbeiten ? (
          <div className="mt-4">
            <VarianteFormular
              formularId={variante.id}
              uebungId={uebungId}
              variante={variante}
              onFertig={() => setBearbeiten(false)}
              onAbbrechen={() => setBearbeiten(false)}
              onUngespeichert={schutz.melden}
              schutz={schutz.schutzFuer(variante.id)}
            />
          </div>
        ) : (
          <>
            <dl className="mt-3 flex flex-col gap-3">
              {variante.instruction ? (
                <Angabe label="Kurzanleitung">{variante.instruction}</Angabe>
              ) : null}
              <Angabe label="Ausrüstung">
                {variante.equipment.length > 0 ? variante.equipment.join(', ') : 'Keine'}
              </Angabe>
              {variante.common_faults ? (
                <Angabe label="Typische Ausweichbewegungen">{variante.common_faults}</Angabe>
              ) : null}
              {variante.practice_notes ? (
                <Angabe label="Hinweise für die Praxis">{variante.practice_notes}</Angabe>
              ) : null}
            </dl>

            {/* UEB-003 (IDEA-QSN-002): nur die zweite Sprachebene, so wie sie
                Patient:innen und Kund:innen später lesen - ohne die fachlichen
                Angaben der Praxis. Eine Vorschau, kein Versand. */}
            <Disclosure summary={`Ansicht in ${BEGRIFFE.alltagssprache}`}>
              <div className="bg-surface-sunken rounded-card max-w-prose p-4">
                <p className="text-ink-muted text-sm">{uebungLaie}</p>
                <p className="text-ink text-liste font-semibold">{variante.lay_name}</p>
                <p className={`text-ink text-liste mt-2 ${FREITEXT}`}>
                  {variante.instruction ?? 'Noch keine Kurzanleitung.'}
                </p>
                {variante.equipment.length > 0 ? (
                  <p className="text-ink-muted mt-2 text-sm">
                    Ausrüstung: {variante.equipment.join(', ')}
                  </p>
                ) : null}
              </div>
            </Disclosure>

            {/* UEB-002: leichter und schwerer - zum Nachschlagen. */}
            <VerbindungenAnzeige
              variante={variante}
              uebungId={uebungId}
              bibliothek={bibliothek}
              orte={orte}
            />
            {verbinden ? (
              <VerbindungFormular
                variante={variante}
                bibliothek={bibliothek}
                formularId={`verbindung-${variante.id}`}
                onFertig={() => setVerbinden(false)}
                onUngespeichert={schutz.melden}
                schutz={schutz.schutzFuer(`verbindung-${variante.id}`)}
              />
            ) : null}

            {darfPflegen && !verbinden ? (
              <div className="mt-4 flex flex-wrap items-start gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  groesse="kompakt"
                  onClick={() => setBearbeiten(true)}
                >
                  Bearbeiten
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  groesse="kompakt"
                  disabled={archivieren.isPending}
                  onClick={() => archivieren.mutate()}
                >
                  {variante.archived ? 'Zurückholen' : 'Archivieren'}
                </Button>
                {variante.archived ? null : (
                  <Button
                    type="button"
                    variant="secondary"
                    groesse="kompakt"
                    onClick={() => setVerbinden(true)}
                  >
                    Verbinden
                  </Button>
                )}
                <Rueckfrage
                  ausloeser="Löschen"
                  ausloeserGroesse="kompakt"
                  bezeichnung={`${BEGRIFFE.variante} „${variante.name}“ löschen`}
                  bestaetigen="Ja, Variante löschen"
                  bestaetigenLaeuft="Wird gelöscht …"
                  fehler={loeschen.isError ? loeschen.error.message : undefined}
                  laeuft={loeschen.isPending}
                  onBestaetigen={() => loeschen.mutateAsync()}
                  onAbbrechen={() => loeschen.reset()}
                >
                  Die Variante wird gelöscht. Was in Gebrauch war, besser archivieren – dann bleibt
                  es nachlesbar.
                </Rueckfrage>
              </div>
            ) : null}
            {archivieren.isError ? (
              <Statusmeldung ton="fehler" className="mt-3">
                {archivieren.error.message}
              </Statusmeldung>
            ) : null}
          </>
        )}
      </div>
    </Card>
  );
}

function Verwalten({ uebung }: { uebung: Uebung }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const archivieren = useMutation({
    mutationFn: () => archiviereUebung(uebung.id, !uebung.archived),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BIBLIOTHEK_SCHLUESSEL }),
  });
  const loeschen = useMutation({
    mutationFn: () => loescheUebung(uebung.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: BIBLIOTHEK_SCHLUESSEL });
      void navigate('/uebungen');
    },
  });

  return (
    <div className="mt-10">
      <Disclosure summary="Übung archivieren oder löschen" kopf="label">
        <p className="text-ink-muted max-w-prose text-sm">
          Archiviert steht die Übung nicht mehr in der Bibliothek, bleibt aber nachlesbar. Löschen
          geht nur ohne Varianten – für eine versehentlich angelegte Übung.
        </p>
        <div className="mt-3 flex flex-wrap items-start gap-3">
          <Button
            type="button"
            variant="secondary"
            disabled={archivieren.isPending}
            onClick={() => archivieren.mutate()}
          >
            {uebung.archived ? 'Übung zurückholen' : 'Übung archivieren'}
          </Button>
          {uebung.variants.length === 0 ? (
            <Rueckfrage
              ausloeser="Übung löschen"
              bezeichnung={`${BEGRIFFE.uebung} „${uebung.name}“ löschen`}
              bestaetigen="Ja, Übung löschen"
              bestaetigenLaeuft="Wird gelöscht …"
              fehler={loeschen.isError ? loeschen.error.message : undefined}
              laeuft={loeschen.isPending}
              onBestaetigen={() => loeschen.mutateAsync()}
              onAbbrechen={() => loeschen.reset()}
            >
              Die Übung wird gelöscht.
            </Rueckfrage>
          ) : null}
        </div>
        {archivieren.isError ? (
          <Statusmeldung ton="fehler" className="mt-3">
            {archivieren.error.message}
          </Statusmeldung>
        ) : null}
      </Disclosure>
    </div>
  );
}

export function UebungAnsicht({ user, uebungId }: { user: CurrentUser; uebungId: string }) {
  const darf = canReadExerciseLibrary(user.roles);
  const schutz = useFormularschutz();
  const [bearbeiten, setBearbeiten] = useState(false);
  const [neueVariante, setNeueVariante] = useState(false);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: BIBLIOTHEK_SCHLUESSEL,
    queryFn: fetchBibliothek,
    enabled: darf,
    retry: false,
  });
  const orte = useMemo(() => (data ? variantenOrte(data) : new Map<string, Ort>()), [data]);

  // Ein Sprung von einer verbundenen Variante zielt auf ihre Karte (UEB-002);
  // der Router scrollt zu einem Anker nicht von selbst.
  const { hash } = useLocation();
  useEffect(() => {
    if (!data || !hash) return;
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView?.();
  }, [data, hash]);

  if (!darf) {
    return (
      <ErrorState
        title="Nicht freigegeben"
        description="Die Übungsbibliothek steht den Rollen offen, die Übungen anleiten."
      />
    );
  }

  const zurueck = <Rueckweg standard="/uebungen" />;

  if (isPending) return <LoadingState label="Übung wird geladen …" />;
  if (isError) {
    return (
      <>
        {zurueck}
        <ErrorState
          title="Die Übung konnte nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => refetch()}
        />
      </>
    );
  }

  const uebung = data.exercises.find((eintrag) => eintrag.id === uebungId);
  if (!uebung) {
    return (
      <>
        {zurueck}
        <EmptyState
          title="Übung nicht gefunden"
          description="Vielleicht wurde sie gelöscht. Die Bibliothek zeigt alle Übungen der Praxis."
        />
      </>
    );
  }

  const darfPflegen = data.can_manage;
  const aktiv = uebung.variants.filter((variante) => !variante.archived);
  const archiviert = uebung.variants.filter((variante) => variante.archived);

  return (
    <>
      {zurueck}
      <PageHeader
        kicker={BEGRIFFE.uebung}
        title={uebung.name}
        description={
          <div className="flex flex-wrap items-center gap-2">
            <span>
              {BEGRIFFE.alltagssprache}: {uebung.lay_name}
            </span>
            <Badge ton="neutral">{KOERPERREGION_LABEL[uebung.body_region]}</Badge>
            {uebung.archived ? <Badge ton="warnung">Archiviert</Badge> : null}
          </div>
        }
        actions={
          darfPflegen && !bearbeiten ? (
            <Button type="button" variant="secondary" onClick={() => setBearbeiten(true)}>
              Bearbeiten
            </Button>
          ) : null
        }
      />

      {bearbeiten ? (
        <Section titel={`${BEGRIFFE.uebung} bearbeiten`}>
          <UebungFormular
            formularId="uebung"
            uebung={uebung}
            onFertig={() => setBearbeiten(false)}
            onAbbrechen={() => setBearbeiten(false)}
            onUngespeichert={schutz.melden}
            schutz={schutz.schutzFuer('uebung')}
          />
        </Section>
      ) : null}

      <Section
        titel={BEGRIFFE.varianten}
        aktion={
          darfPflegen && !neueVariante ? (
            <Button type="button" groesse="kompakt" onClick={() => setNeueVariante(true)}>
              {BEGRIFFE.variante} anlegen
            </Button>
          ) : null
        }
      >
        {neueVariante ? (
          <Card className="mb-3">
            <h3 className="text-ink text-liste mb-3 font-semibold">Neue {BEGRIFFE.variante}</h3>
            <VarianteFormular
              formularId="neue-variante"
              uebungId={uebung.id}
              onFertig={() => setNeueVariante(false)}
              onAbbrechen={() => setNeueVariante(false)}
              onUngespeichert={schutz.melden}
              schutz={schutz.schutzFuer('neue-variante')}
            />
          </Card>
        ) : null}

        {aktiv.length === 0 ? (
          <p className="text-ink-muted text-liste">
            {darfPflegen
              ? 'Noch keine Variante. Geübt wird immer in einer Variante – legen Sie die erste an.'
              : 'Noch keine Variante.'}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {aktiv.map((variante) => (
              <VarianteKarte
                key={variante.id}
                uebungId={uebung.id}
                uebungLaie={uebung.lay_name}
                variante={variante}
                bibliothek={data}
                orte={orte}
                schutz={schutz}
              />
            ))}
          </div>
        )}

        {archiviert.length > 0 ? (
          <Disclosure summary="Archivierte Varianten" anzahl={archiviert.length}>
            <div className="flex flex-col gap-3">
              {archiviert.map((variante) => (
                <VarianteKarte
                  key={variante.id}
                  uebungId={uebung.id}
                  uebungLaie={uebung.lay_name}
                  variante={variante}
                  bibliothek={data}
                  orte={orte}
                  schutz={schutz}
                />
              ))}
            </div>
          </Disclosure>
        ) : null}
      </Section>

      {darfPflegen ? <Verwalten uebung={uebung} /> : null}
    </>
  );
}

export function UebungPage({ user }: { user: CurrentUser }) {
  const { uebungId = '' } = useParams<{ uebungId: string }>();
  return <UebungAnsicht user={user} uebungId={uebungId} />;
}
