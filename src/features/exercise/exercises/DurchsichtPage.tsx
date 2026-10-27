import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Aktionsleiste } from '@/components/ui/Aktionsleiste';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Card';
import { Filterchips } from '@/components/ui/Chip';
import { EmptyState, ErrorState } from '@/components/ui/Feedback';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Textlink } from '@/components/ui/Textlink';
import { canReadExerciseLibrary, type CurrentUser } from '@/features/core/session/types';
import { BIBLIOTHEK_SCHLUESSEL, fetchBibliothek, setzePruefvermerk, type Bibliothek } from './api';
import { naechster, offeneDurchsicht, type Durchsichtsposten } from './durchsicht';
import { ordnungen } from './suche';
import { KOERPERREGION_LABEL, type Koerperregion } from './types';
import { Alltagsansicht, Anleitung, Dosierkacheln } from './Variantenteile';

/**
 * Durchsicht des Katalogs am Stück (UEB-015, ANN-386, ANN-561) unter
 * `/uebungen/durchsicht` - eine Arbeitsseite für die Praxisinhaber:in.
 *
 * Eine übernommene Übung nach der anderen, nach Region und Bezeichnung:
 * Dosierung, Anleitung in Schritten, Fehler, Hinweise, Alltagsansicht.
 * „Durchgesehen“ setzt den Prüfvermerk und zeigt die nächste - ein Tipp je
 * Übung; „Überspringen“ stellt sie hinten an; ändern geht auf der Übungsseite.
 * Die Region grenzt die Durchsicht auf eine Gruppe ein.
 *
 * Verbindlich prüft der Server (`set_exercise_variant_reviewed`, nur owner).
 */
export function DurchsichtPage({ user }: { user: CurrentUser }) {
  const darf = canReadExerciseLibrary(user.roles);
  const abfrage = useQuery({
    queryKey: BIBLIOTHEK_SCHLUESSEL,
    queryFn: fetchBibliothek,
    enabled: darf,
    retry: false,
  });
  return (
    <>
      <Rueckweg standard="/uebungen" className="mb-3 max-sm:hidden" />
      {/* Mit Daten trägt die Übung den Titel (Durchsicht), sonst die Seite. */}
      {abfrage.data?.can_manage ? null : <PageHeader title="Durchsicht" />}
      <Abfragezustand
        abfrage={abfrage}
        laden="Übungen werden geladen …"
        fehler="Die Übungen konnten nicht geladen werden."
        inKarte
      >
        {(bibliothek) =>
          darf && bibliothek.can_manage ? (
            <Durchsicht bibliothek={bibliothek} />
          ) : (
            <ErrorState
              title="Nicht freigegeben"
              description="Die Übungen sieht die Praxisinhaber:in durch."
            />
          )
        }
      </Abfragezustand>
    </>
  );
}

function Durchsicht({ bibliothek }: { bibliothek: Bibliothek }) {
  const queryClient = useQueryClient();
  // Eben vermerkt: Die Seite geht sofort weiter, die Bibliothek lädt
  // im Hintergrund nach.
  const [vermerkt, setVermerkt] = useState<ReadonlySet<string>>(new Set());
  const [uebersprungen, setUebersprungen] = useState<string[]>([]);
  const [region, setRegion] = useState<Koerperregion[]>([]);
  const [zuletzt, setZuletzt] = useState<Durchsichtsposten | null>(null);
  const [nr, setNr] = useState(0);

  const alle = offeneDurchsicht(bibliothek).filter((p) => !vermerkt.has(p.variante.id));
  const regionen = [...new Set(alle.map((p) => p.uebung.body_region))];
  const gewaehlt = region.filter((r) => regionen.includes(r));
  const offen =
    gewaehlt.length > 0 ? alle.filter((p) => gewaehlt.includes(p.uebung.body_region)) : alle;
  const jetzt = naechster(offen, vermerkt, uebersprungen);

  // Praxis-Review: Nach einem Tipp unten in der Leiste beginnt die nächste
  // Übung oben, mit Titel und Meldung im Blick.
  const jetztId = jetzt?.variante.id;
  useEffect(() => {
    if (nr > 0) window.scrollTo?.({ top: 0 });
  }, [jetztId, nr]);

  const durchsehen = useMutation({
    mutationFn: (posten: Durchsichtsposten) => setzePruefvermerk(posten.variante.id, true),
    onSuccess: (_daten, posten) => {
      setVermerkt((bisher) => new Set(bisher).add(posten.variante.id));
      setUebersprungen((bisher) => bisher.filter((id) => id !== posten.variante.id));
      setZuletzt(posten);
      setNr((n) => n + 1);
      void queryClient.invalidateQueries({ queryKey: BIBLIOTHEK_SCHLUESSEL });
    },
  });
  // Ein versehentliches „Durchgesehen“ zurücknehmen: Die Übung kommt als
  // nächste wieder.
  const zuruecknehmen = useMutation({
    mutationFn: (posten: Durchsichtsposten) => setzePruefvermerk(posten.variante.id, false),
    onSuccess: async (_daten, posten) => {
      await queryClient.invalidateQueries({ queryKey: BIBLIOTHEK_SCHLUESSEL });
      setVermerkt((bisher) => {
        const neu = new Set(bisher);
        neu.delete(posten.variante.id);
        return neu;
      });
      setZuletzt(null);
      setNr((n) => n + 1);
    },
  });

  const ueberspringen = (posten: Durchsichtsposten) => {
    durchsehen.reset();
    setNr((n) => n + 1);
    setUebersprungen((bisher) => [
      ...bisher.filter((id) => id !== posten.variante.id),
      posten.variante.id,
    ]);
  };

  const kicker = `Durchsicht · noch ${alle.length}`;

  return (
    <>
      {jetzt ? (
        <PageHeader kicker={kicker} title={jetzt.uebung.name} description={metazeile(jetzt)} />
      ) : (
        <PageHeader kicker={kicker} title="Durchsicht" />
      )}
      {regionen.length > 1 ? (
        // Seltenes eingeklappt (DESIGN.md Grundsatz 4): am Telefon steht die
        // Übung zuerst, die Region auf Abruf.
        <div className="mb-6">
          <Disclosure
            summary={gewaehlt[0] ? `Region: ${KOERPERREGION_LABEL[gewaehlt[0]]}` : 'Nach Region'}
            kopf="label"
          >
            <Filterchips
              beschriftung="Region"
              mehrfach={false}
              wahlen={regionen.map((r) => ({
                wert: r,
                text: `${KOERPERREGION_LABEL[r]} (${alle.filter((p) => p.uebung.body_region === r).length})`,
              }))}
              gewaehlt={gewaehlt}
              onAendern={setRegion}
            />
          </Disclosure>
        </div>
      ) : null}
      {zuletzt ? (
        <Rueckmeldung key={nr} className="mb-4">
          „{zuletzt.uebung.name}“ als durchgesehen vermerkt.{' '}
          <Button
            type="button"
            variant="quiet"
            groesse="kompakt"
            disabled={zuruecknehmen.isPending}
            onClick={() => zuruecknehmen.mutate(zuletzt)}
          >
            Zurücknehmen
          </Button>
        </Rueckmeldung>
      ) : null}
      {(durchsehen.error ?? zuruecknehmen.error) ? (
        <Statusmeldung ton="fehler" className="mb-4">
          {(durchsehen.error ?? zuruecknehmen.error)?.message}
        </Statusmeldung>
      ) : null}

      {jetzt ? (
        <Posten posten={jetzt} />
      ) : (
        <EmptyState
          inKarte
          title={
            gewaehlt.length > 0 ? 'In dieser Region ist alles durchgesehen' : 'Alles durchgesehen'
          }
          aktion={
            <Textlink alleinstehend to="/uebungen">
              Zu den Übungen
            </Textlink>
          }
        />
      )}

      {jetzt ? (
        <Aktionsleiste>
          <Button
            type="button"
            variant="secondary"
            disabled={durchsehen.isPending || offen.length < 2}
            onClick={() => ueberspringen(jetzt)}
          >
            Überspringen
          </Button>
          <Button
            type="button"
            className="ml-auto"
            disabled={durchsehen.isPending}
            onClick={() => durchsehen.mutate(jetzt)}
          >
            {durchsehen.isPending ? 'Wird vermerkt …' : 'Durchgesehen'}
          </Button>
        </Aktionsleiste>
      ) : null}
    </>
  );
}

/** Laie · Region · Variante, dann die Ordnungen des Katalogs - eine Zeile. */
function metazeile({ uebung, variante }: Durchsichtsposten): string {
  return [
    uebung.lay_name,
    KOERPERREGION_LABEL[uebung.body_region],
    variante.name !== uebung.name ? variante.name : null,
    ordnungen(variante),
  ]
    .filter(Boolean)
    .join(' · ');
}

function Posten({ posten: { uebung, variante } }: { posten: Durchsichtsposten }) {
  return (
    // Abschnitt zu Abschnitt 32 px aus `Section` (DESIGN.md, Rhythmus).
    <div className="max-w-spalte">
      {variante.default_dosage ? (
        <Section titel="Standarddosierung">
          <Dosierkacheln d={variante.default_dosage} />
        </Section>
      ) : null}
      <Anleitung variante={variante} />
      <div className="mt-8">
        <Alltagsansicht uebungLaie={uebung.lay_name} variante={variante} />
      </div>
      <Kleingedrucktes className="mt-8">
        Aus dem Übungskatalog ({variante.catalog_key}, Fassung {variante.catalog_version}), Text
        KI-erstellt.{' '}
        <Textlink to={`/uebungen/${uebung.id}#variante-${variante.id}`}>
          Auf der Übungsseite ändern
        </Textlink>
      </Kleingedrucktes>
    </div>
  );
}
