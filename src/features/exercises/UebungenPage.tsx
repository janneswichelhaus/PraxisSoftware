import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { canReadExerciseLibrary, type CurrentUser } from '@/features/session/types';
import { BEGRIFFE } from '@/lib/begriffe';
import { BIBLIOTHEK_SCHLUESSEL, fetchBibliothek, type Uebung } from './api';
import { UebungFormular } from './Formulare';
import { KOERPERREGION_LABEL } from './types';
import { useFormularschutz } from './useFormularschutz';

/**
 * Die Übungsbibliothek der Praxis (UEB-EPIC-001).
 *
 * Ein Katalog zum Nachschlagen - sortiert nach Bezeichnung, nach nichts
 * sonst. Keine Liste „passend zu" einer Diagnose, einem Befund oder einem
 * Verlauf (ADR-006 Punkt 10): Die Auswahl trifft die Person, die anleitet.
 */

function anzahlVarianten(uebung: Uebung): string {
  const n = uebung.variants.filter((variante) => !variante.archived).length;
  return n === 1 ? `1 ${BEGRIFFE.variante}` : `${n} ${BEGRIFFE.varianten}`;
}

function Zeile({ uebung }: { uebung: Uebung }) {
  return (
    <ListRow
      titel={uebung.name}
      meta={`${uebung.lay_name} · ${KOERPERREGION_LABEL[uebung.body_region]} · ${anzahlVarianten(uebung)}`}
      to={`/uebungen/${uebung.id}`}
    />
  );
}

export function UebungenPage({ user }: { user: CurrentUser }) {
  const darf = canReadExerciseLibrary(user.roles);
  const [anlegen, setAnlegen] = useState(false);
  const [angelegt, setAngelegt] = useState<{ name: string; id: string } | null>(null);
  const bestaetigung = useRef<HTMLDivElement>(null);
  const { melden, schutzFuer } = useFormularschutz();

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

  const aktiv = (data?.exercises ?? []).filter((uebung) => !uebung.archived);
  const archiviert = (data?.exercises ?? []).filter((uebung) => uebung.archived);

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
        aktiv.length === 0 && archiviert.length === 0 ? (
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
            <Section titel={BEGRIFFE.uebungen}>
              {aktiv.length === 0 ? (
                <p className="text-ink-muted text-liste">Alle Übungen sind archiviert.</p>
              ) : (
                <ListRows>
                  {aktiv.map((uebung) => (
                    <Zeile key={uebung.id} uebung={uebung} />
                  ))}
                </ListRows>
              )}
            </Section>
            {archiviert.length > 0 ? (
              <div className="mt-8">
                <Disclosure summary="Archiviert" anzahl={archiviert.length} kopf="label">
                  <ListRows>
                    {archiviert.map((uebung) => (
                      <Zeile key={uebung.id} uebung={uebung} />
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
