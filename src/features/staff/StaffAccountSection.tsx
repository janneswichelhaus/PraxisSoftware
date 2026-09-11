import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { Field } from '@/components/ui/Field';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { RoleBadge } from '@/components/ui/RoleBadge';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { kartenAktionKlassen } from '@/components/ui/buttonStile';
import { roleLabel } from '@/components/ui/roleLabels';
import type { RoleKey } from '@/features/session/types';
import {
  EinladungsError,
  fetchStaffAccount,
  fetchStaffInvitations,
  istAbgelaufen,
  ladeZugangEin,
  sendeZugangsMail,
  widerrufeEinladung,
  type StaffInvitation,
} from './konto-api';
import type { StaffMember } from './api';

/** Rollen, die ein Praxiszugang bekommen kann. `patient` ist ein anderes Konzept (§4.6). */
const WAEHLBARE_ROLLEN: RoleKey[] = ['therapist', 'team_lead', 'office', 'owner'];

const rollenHinweis: Record<string, string> = {
  therapist: 'Behandelt, dokumentiert, sieht alle Akten der Praxis.',
  team_lead: 'Wie Therapeut:in, dazu Dienstplan und organisatorische Auswertungen.',
  office: 'Organisatorisch: Stammdaten, Termine, Abrechnung. Kein klinischer Freitext.',
  owner: 'Vollzugriff einschließlich Zugängen, Rollen und Auditlog.',
};

function formatiereDatum(wert: string): string {
  const datum = new Date(wert);
  if (Number.isNaN(datum.getTime())) return '—';
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(datum);
}

const problemTexte: Record<string, string> = {
  account_already_exists: 'Für diese Person besteht bereits ein Zugang.',
  email_already_in_use: 'Diese E-Mail-Adresse gehört bereits zu einem Zugang dieser Praxis.',
  bereits_eingeladen: 'Für diese Person steht bereits eine Einladung offen.',
  unbekannt: 'Die Einladung konnte nicht angelegt werden.',
};

/**
 * Formular für eine neue Einladung.
 *
 * Die Rollen werden ausdrücklich gewählt und nicht vorbelegt: Eine Rolle zu
 * vergeben ist Berechtigungsvergabe (ADR-004), und eine Vorbelegung wäre eine
 * Entscheidung, die niemand getroffen hat. Die E-Mail-Adresse ist aus der
 * dienstlichen Adresse vorbelegt, weil sie dort in aller Regel schon steht -
 * sie bleibt änderbar.
 */
function Einladungsformular({ staff }: { staff: StaffMember }) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState(staff.work_email ?? '');
  const [rollen, setRollen] = useState<RoleKey[]>([]);
  const [fehler, setFehler] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => ladeZugangEin(staff.id, email.trim(), rollen),
    onSuccess: async () => {
      setRollen([]);
      await queryClient.invalidateQueries({ queryKey: ['staff-invitations', staff.id] });
      await queryClient.invalidateQueries({ queryKey: ['staff-account', staff.id] });
    },
  });

  function umschalten(rolle: RoleKey, gewaehlt: boolean) {
    setRollen((bisher) =>
      gewaehlt ? [...bisher, rolle] : bisher.filter((eintrag) => eintrag !== rolle),
    );
    setFehler(null);
  }

  function absenden() {
    if (mutation.isPending) return;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setFehler('Bitte eine gültige E-Mail-Adresse angeben.');
      return;
    }
    if (rollen.length === 0) {
      setFehler('Bitte mindestens eine Rolle wählen.');
      return;
    }
    setFehler(null);
    mutation.mutate();
  }

  const serverFehler =
    mutation.error instanceof EinladungsError
      ? problemTexte[mutation.error.problem]
      : mutation.isError
        ? 'Die Einladung konnte nicht angelegt oder zugestellt werden.'
        : undefined;

  return (
    <div className="max-w-md">
      <p className="text-ink-muted mb-4 text-sm">
        Die eingeladene Person erhält eine E-Mail des Anmeldedienstes und richtet ihr Kennwort
        selbst ein. Ein Zugang entsteht erst, wenn sie die Einladung annimmt.
      </p>

      <Field
        label="E-Mail-Adresse für den Zugang"
        type="email"
        name="invite_email"
        autoComplete="off"
        value={email}
        onChange={(event) => {
          setEmail(event.target.value);
          setFehler(null);
        }}
      />

      <fieldset className="mt-5">
        <legend className="text-ink mb-1 text-sm font-medium">Rollen</legend>
        <div className="flex flex-col">
          {WAEHLBARE_ROLLEN.map((rolle) => (
            <Checkbox
              key={rolle}
              label={roleLabel(rolle)}
              hint={rollenHinweis[rolle]}
              checked={rollen.includes(rolle)}
              onChange={(event) => umschalten(rolle, event.target.checked)}
            />
          ))}
        </div>
      </fieldset>

      {fehler || serverFehler ? (
        <Statusmeldung ton="fehler" className="mt-4">
          {fehler ?? serverFehler}
        </Statusmeldung>
      ) : null}

      <Button type="button" className="mt-5" disabled={mutation.isPending} onClick={absenden}>
        {mutation.isPending ? 'Einladung wird gesendet …' : 'Zugang einladen'}
      </Button>
    </div>
  );
}

/** Eine offene Einladung: erneut senden oder zurücknehmen. */
function OffeneEinladung({
  einladung,
  staffMemberId,
}: {
  einladung: StaffInvitation;
  staffMemberId: string;
}) {
  const queryClient = useQueryClient();
  const abgelaufen = istAbgelaufen(einladung);

  const erneutSenden = useMutation({ mutationFn: () => sendeZugangsMail(einladung.email) });
  const widerrufen = useMutation({
    mutationFn: () => widerrufeEinladung(einladung.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['staff-invitations', staffMemberId] });
    },
  });

  return (
    <div>
      <DetailList>
        <DetailRow label="Eingeladen an">{einladung.email}</DetailRow>
        <DetailRow label="Vorgesehene Rollen">
          <span className="flex flex-wrap gap-1.5">
            {einladung.role_keys.map((rolle) => (
              <RoleBadge key={rolle} role={rolle} />
            ))}
          </span>
        </DetailRow>
        <DetailRow label="Stand">
          {abgelaufen
            ? `Abgelaufen am ${formatiereDatum(einladung.expires_at)}`
            : `Offen bis ${formatiereDatum(einladung.expires_at)}`}
        </DetailRow>
      </DetailList>

      {abgelaufen ? (
        <Statusmeldung ton="warnung" className="mt-3">
          Diese Einladung gilt nicht mehr. Bitte zurücknehmen und neu einladen.
        </Statusmeldung>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {!abgelaufen ? (
          <button
            type="button"
            className={kartenAktionKlassen()}
            disabled={erneutSenden.isPending}
            onClick={() => erneutSenden.mutate()}
          >
            {erneutSenden.isPending ? 'Wird gesendet …' : 'Einladung erneut senden'}
          </button>
        ) : null}

        <Rueckfrage
          ausloeser="Einladung zurücknehmen"
          bestaetigen="Zurücknehmen"
          bestaetigenLaeuft="Wird zurückgenommen …"
          fehler={
            widerrufen.isError ? 'Die Einladung konnte nicht zurückgenommen werden.' : undefined
          }
          laeuft={widerrufen.isPending}
          onBestaetigen={() => widerrufen.mutateAsync()}
          onAbbrechen={() => widerrufen.reset()}
        >
          <p>
            Die Einladung verliert ihre Gültigkeit. Ein Konto, das sich danach mit dieser Adresse
            anmeldet, erhält keinen Zugang zur Praxis. Der Vorgang bleibt als Nachweis erhalten.
          </p>
        </Rueckfrage>
      </div>

      {erneutSenden.isSuccess ? (
        <Statusmeldung className="mt-3">Die Einladung wurde erneut zugestellt.</Statusmeldung>
      ) : null}
      {erneutSenden.isError ? (
        <Statusmeldung ton="fehler" className="mt-3">
          Die Einladung konnte nicht zugestellt werden.
        </Statusmeldung>
      ) : null}
    </div>
  );
}

/**
 * Der Zugangsteil des Mitarbeiterdatensatzes (STAFF-002b).
 *
 * Nur für die Praxisinhaberin sichtbar - und das ist hier keine reine
 * Darstellungsfrage: Die Policy auf `staff_account_invitations` liefert allen
 * anderen Rollen gar keine Zeilen, und die RPCs weisen sie ab (ADR-004).
 */
export function StaffAccountSection({ staff }: { staff: StaffMember }) {
  const konto = useQuery({
    queryKey: ['staff-account', staff.id],
    queryFn: () => fetchStaffAccount(staff.id),
    retry: false,
  });
  const einladungen = useQuery({
    queryKey: ['staff-invitations', staff.id],
    queryFn: () => fetchStaffInvitations(staff.id),
    retry: false,
  });

  if (konto.isPending || einladungen.isPending) {
    return (
      <Section titel="Zugang">
        <LoadingState label="Zugangsstand wird geladen …" />
      </Section>
    );
  }

  if (konto.isError || einladungen.isError) {
    return (
      <Section titel="Zugang">
        <ErrorState title="Der Zugangsstand konnte nicht geladen werden." />
      </Section>
    );
  }

  const offen = einladungen.data.find((eintrag) => eintrag.status === 'pending');
  const hatZugang = konto.data?.user_id != null;

  return (
    <Section
      titel="Zugang"
      hinweis="Zugang zur Anwendung. Der Mitarbeiterdatensatz bleibt davon unberührt."
    >
      {hatZugang ? (
        <DetailList>
          <DetailRow label="Stand">
            {konto.data?.account_active === false ? 'Gesperrt' : 'Eingerichtet'}
          </DetailRow>
          <DetailRow label="Rollen">
            <span className="flex flex-wrap gap-1.5">
              {(konto.data?.role_keys ?? []).map((rolle) => (
                <RoleBadge key={rolle} role={rolle} />
              ))}
            </span>
          </DetailRow>
        </DetailList>
      ) : offen ? (
        <OffeneEinladung einladung={offen} staffMemberId={staff.id} />
      ) : staff.employment_status === 'inactive' ? (
        <Statusmeldung>
          Für eine ausgeschiedene Person wird kein Zugang eingeladen. Dafür müsste sie zuerst wieder
          als aktiv geführt werden.
        </Statusmeldung>
      ) : (
        <Einladungsformular staff={staff} />
      )}
    </Section>
  );
}
