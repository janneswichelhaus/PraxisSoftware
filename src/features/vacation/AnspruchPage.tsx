import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { EmptyState } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Feldgruppe, Section } from '@/components/ui/Section';
import { Segment } from '@/components/ui/Segment';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { todayInTimeZone } from '@/features/appointments/api';
import type { CurrentUser } from '@/features/session/types';
import {
  URLAUB_SCHLUESSEL,
  fetchUrlaub,
  setLeaveEntitlement,
  urlaubSchluessel,
  type FremdesKonto,
} from './api';
import { urlaubsfenster } from './fenster';

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
  // Bekannt ist der Anspruch des laufenden Jahres; das nächste beginnt leer.
  const bekannt = gewaehltesJahr === String(konto.balance.year);
  const [tage, setTage] = useState(
    bekannt && konto.balance.entitlement !== null ? String(konto.balance.entitlement) : '',
  );
  const [uebertrag, setUebertrag] = useState(
    bekannt && konto.balance.carryover !== null ? String(konto.balance.carryover) : '0',
  );
  const name = konto.name ?? 'Unbekannte Person';

  const tageZahl = Number(tage);
  const uebertragZahl = Number(uebertrag === '' ? '0' : uebertrag);
  const gueltig =
    tage.trim() !== '' &&
    Number.isInteger(tageZahl) &&
    tageZahl >= 0 &&
    tageZahl <= 60 &&
    Number.isInteger(uebertragZahl) &&
    uebertragZahl >= 0 &&
    uebertragZahl <= 60;

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
    if (gueltig) speichern.mutate();
  }

  return (
    <form onSubmit={absenden} noValidate className="max-w-formular">
      <PageHeader title="Urlaubsanspruch" description={name} />
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
            if (wert !== String(konto.balance.year)) {
              setTage('');
              setUebertrag('0');
            } else {
              setTage(konto.balance.entitlement === null ? '' : String(konto.balance.entitlement));
              setUebertrag(String(konto.balance.carryover ?? 0));
            }
          }}
        />
      </Section>
      <Section titel="Tage">
        <Feldgruppe>
          <Field
            label="Urlaubstage im Jahr"
            inputMode="numeric"
            value={tage}
            onChange={(e) => setTage(e.target.value.replace(/\D/g, ''))}
            error={tage !== '' && !gueltig ? 'Bitte zwischen 0 und 60 Tagen.' : undefined}
          />
          <Field
            label="Übertrag aus dem Vorjahr"
            inputMode="numeric"
            value={uebertrag}
            onChange={(e) => setUebertrag(e.target.value.replace(/\D/g, ''))}
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
        <Button type="submit" disabled={!gueltig || speichern.isPending}>
          {speichern.isPending ? 'Wird gespeichert …' : 'Anspruch speichern'}
        </Button>
        <ButtonLink to={ZUM_URLAUB} variant="quiet">
          Abbrechen
        </ButtonLink>
      </Formularfuss>
    </form>
  );
}
