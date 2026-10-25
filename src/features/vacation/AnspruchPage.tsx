import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { EmptyState } from '@/components/ui/Feedback';
import { Fehlerzusammenfassung } from '@/components/ui/Fehlerzusammenfassung';
import { Field } from '@/components/ui/Field';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Feldgruppe, Section } from '@/components/ui/Section';
import { Segment } from '@/components/ui/Segment';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import type { CurrentUser } from '@/features/session/types';
import { alsFormularfehler } from '@/lib/formularfehler';
import {
  URLAUB_SCHLUESSEL,
  fetchUrlaub,
  setLeaveEntitlement,
  urlaubSchluessel,
  type FremdesKonto,
  type Urlaubskonto,
} from './api';
import { urlaubsfenster } from './fenster';
import { todayInTimeZone } from '@/lib/datum';

type Feld = 'tage' | 'uebertrag';
const FELDER: readonly Feld[] = ['tage', 'uebertrag'];
const BESCHRIFTUNG: Record<Feld, string> = {
  tage: 'Urlaubstage im Jahr',
  uebertrag: 'Übertrag aus dem Vorjahr',
};
const feldId = (feld: Feld) => `anspruch-${feld}`;

/** Ganze Tage von 0 bis 60, wie der Server sie annimmt. */
function tagesfehler(wert: string, pflicht: boolean): string | undefined {
  if (wert.trim() === '') return pflicht ? 'Bitte die Tage angeben.' : undefined;
  const zahl = Number(wert);
  return Number.isInteger(zahl) && zahl >= 0 && zahl <= 60
    ? undefined
    : 'Bitte zwischen 0 und 60 Tagen.';
}

/** Was für ein Jahr schon eingetragen ist - zum Vorbelegen. */
function vorbelegt(konto: Urlaubskonto | null): { tage: string; uebertrag: string } {
  return {
    tage: konto?.entitlement == null ? '' : String(konto.entitlement),
    uebertrag: String(konto?.carryover ?? 0),
  };
}

/**
 * Urlaubsanspruch einer Person eintragen (URL-001): Tage im Jahr und
 * Übertrag aus dem Vorjahr. Nur owner - es sind Beschäftigungsangaben
 * (`app.can_manage_staff_employment`, ANN-580); der Server weist alle
 * anderen ab. Ein Übertrag verfällt nicht von selbst: Ob er nach dem
 * 31. März noch gilt, hängt am Hinweis an die Person (EuGH C-684/16) - die
 * Zahl trägt die Inhaber:in ein.
 */

const ZUM_URLAUB = '/betrieb/urlaub';

export function AnspruchPage({ user }: { user: CurrentUser }) {
  const { staffMemberId } = useParams();
  const heute = todayInTimeZone(user.organizationTimeZone ?? 'Europe/Berlin');
  const fenster = urlaubsfenster(heute);
  const abfrage = useQuery({
    queryKey: urlaubSchluessel(fenster.von, fenster.bis),
    queryFn: () => fetchUrlaub(fenster.von, fenster.bis),
    retry: false,
  });

  return (
    <>
      <Rueckweg standard={ZUM_URLAUB} beschriftung="Zurück zum Urlaub" />
      <Abfragezustand
        abfrage={abfrage}
        laden="Urlaubsanspruch wird geladen …"
        fehler="Der Urlaubsanspruch konnte nicht geladen werden."
        rahmen={(zustand) => (
          <>
            <PageHeader title="Urlaubsanspruch" />
            {zustand}
          </>
        )}
      >
        {(stand) => {
          const konto = stand.balances.find((k) => k.staff_member_id === staffMemberId);
          if (!stand.can_manage_entitlements || !konto) {
            return (
              <>
                <PageHeader title="Urlaubsanspruch" />
                <EmptyState
                  inKarte
                  title="Nicht verfügbar"
                  description="Den Urlaubsanspruch trägt die Praxisinhaber:in ein."
                />
              </>
            );
          }
          return <Formular konto={konto} jahr={Number(heute.slice(0, 4))} />;
        }}
      </Abfragezustand>
    </>
  );
}

function Formular({ konto, jahr }: { konto: FremdesKonto; jahr: number }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [gewaehltesJahr, setGewaehltesJahr] = useState(String(jahr));
  // Beide Jahre sind bekannt: Ein vorab eingetragener Anspruch fürs Folgejahr
  // wird vorbelegt, nicht leer überschrieben (Design- und Praxis-Review).
  const kontoFuer = (wert: string): Urlaubskonto | null =>
    wert === String(konto.balance.year)
      ? konto.balance
      : wert === String(konto.next_balance.year)
        ? konto.next_balance
        : null;
  const [tage, setTage] = useState(() => vorbelegt(kontoFuer(String(jahr))).tage);
  const [uebertrag, setUebertrag] = useState(() => vorbelegt(kontoFuer(String(jahr))).uebertrag);
  const [fehler, setFehler] = useState<Partial<Record<Feld, string>>>({});
  const name = konto.name ?? 'Unbekannte Person';

  const tageZahl = Number(tage);
  const uebertragZahl = Number(uebertrag === '' ? '0' : uebertrag);

  const speichern = useMutation({
    mutationFn: () =>
      setLeaveEntitlement({
        staffMemberId: konto.staff_member_id,
        jahr: Number(gewaehltesJahr),
        tage: tageZahl,
        uebertrag: uebertragZahl,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: URLAUB_SCHLUESSEL });
      void navigate(ZUM_URLAUB, {
        state: {
          meldung: `Urlaubsanspruch ${gewaehltesJahr} für ${name}: ${tageZahl} Tage${
            uebertragZahl > 0 ? ` und ${uebertragZahl} Übertrag` : ''
          }.`,
        },
      });
    },
  });

  function absenden(event: FormEvent) {
    event.preventDefault();
    if (speichern.isPending) return;
    // Jedes Feld für sich; die Zusammenfassung nennt, was fehlt.
    const gefunden: Partial<Record<Feld, string>> = {};
    const fehlerTage = tagesfehler(tage, true);
    const fehlerUebertrag = tagesfehler(uebertrag, false);
    if (fehlerTage) gefunden.tage = fehlerTage;
    if (fehlerUebertrag) gefunden.uebertrag = fehlerUebertrag;
    setFehler(gefunden);
    if (gefunden.tage || gefunden.uebertrag) return;
    speichern.mutate();
  }

  return (
    <form onSubmit={absenden} noValidate className="max-w-formular">
      <PageHeader title="Urlaubsanspruch" description={name} />
      <Fehlerzusammenfassung fehler={alsFormularfehler(FELDER, BESCHRIFTUNG, fehler, feldId)} />
      <Section titel="Jahr">
        <Segment
          beschriftung="Jahr"
          wahlen={[
            { wert: String(jahr), text: String(jahr) },
            { wert: String(jahr + 1), text: String(jahr + 1) },
          ]}
          gewaehlt={gewaehltesJahr}
          onWaehlen={(wert) => {
            setGewaehltesJahr(wert);
            const belegt = vorbelegt(kontoFuer(wert));
            setTage(belegt.tage);
            setUebertrag(belegt.uebertrag);
            setFehler({});
          }}
        />
      </Section>
      <Section titel="Tage">
        <Feldgruppe>
          <Field
            label={BESCHRIFTUNG.tage}
            feldId={feldId('tage')}
            inputMode="numeric"
            value={tage}
            onChange={(e) => {
              setTage(e.target.value.replace(/\D/g, ''));
              setFehler((bisher) => {
                const neu = { ...bisher };
                delete neu.tage;
                return neu;
              });
            }}
            error={fehler.tage}
          />
          <Field
            label={BESCHRIFTUNG.uebertrag}
            feldId={feldId('uebertrag')}
            inputMode="numeric"
            value={uebertrag}
            onChange={(e) => {
              setUebertrag(e.target.value.replace(/\D/g, ''));
              setFehler((bisher) => {
                const neu = { ...bisher };
                delete neu.uebertrag;
                return neu;
              });
            }}
            error={fehler.uebertrag}
          />
        </Feldgruppe>
      </Section>
      {speichern.isError ? (
        <Statusmeldung ton="fehler" className="mt-4">
          {speichern.error instanceof Error
            ? speichern.error.message
            : 'Der Anspruch konnte nicht gespeichert werden.'}
        </Statusmeldung>
      ) : null}
      <Formularfuss>
        <Button type="submit" disabled={speichern.isPending}>
          {speichern.isPending ? 'Wird gespeichert …' : 'Anspruch speichern'}
        </Button>
        <ButtonLink to={ZUM_URLAUB} variant="quiet">
          Abbrechen
        </ButtonLink>
      </Formularfuss>
    </form>
  );
}
