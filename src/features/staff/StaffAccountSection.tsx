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
  ZugangsError,
  fetchStaffAccount,
  fetchStaffInvitations,
  istAbgelaufen,
  ladeZugangEin,
  sendeZugangsMail,
  setzeRollen,
  setzeZugangAktiv,
  stosseKennwortZuruecksetzenAn,
  widerrufeEinladung,
  type SperrProblem,
  type StaffAccount,
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
        ? 'Die Einladung konnte nicht angelegt werden.'
        : undefined;

  return (
    <div className="max-w-md">
      <p className="text-ink-muted mb-4 text-sm">
        Hier entsteht die Berechtigung, noch kein Konto. Wirksam wird sie, wenn die Person sich
        anmeldet und die Einladung annimmt.
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

      {!abgelaufen ? (
        <div className="border-line bg-surface-sunken rounded-card mt-4 border p-3">
          <p className="text-ink text-sm font-medium">Nächster Schritt</p>
          <p className="text-ink-muted mt-1 text-sm leading-relaxed">
            Die Berechtigung steht. Damit sich die Person anmelden kann, braucht sie einmalig ein
            Konto beim Anmeldedienst — die Praxisplattform legt keines an, weil die
            Selbstregistrierung bewusst abgeschaltet ist. Danach meldet sie sich an und nimmt die
            Einladung an; die Rollen oben werden dabei gesetzt.
          </p>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {!abgelaufen ? (
          <button
            type="button"
            className={kartenAktionKlassen()}
            disabled={erneutSenden.isPending}
            onClick={() => erneutSenden.mutate()}
          >
            {erneutSenden.isPending ? 'Wird gesendet …' : 'Anmeldemail senden'}
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

      {erneutSenden.data === 'gesendet' ? (
        <Statusmeldung className="mt-3">
          Die Anmeldemail wurde an {einladung.email} geschickt.
        </Statusmeldung>
      ) : null}
      {erneutSenden.data === 'kein_konto' ? (
        <Statusmeldung ton="warnung" className="mt-3">
          Zu {einladung.email} gibt es beim Anmeldedienst noch kein Konto. Es muss dort einmalig
          angelegt werden; die Einladung bleibt so lange offen.
        </Statusmeldung>
      ) : null}
      {erneutSenden.isError ? (
        <Statusmeldung ton="fehler" className="mt-3">
          Der Anmeldedienst war nicht erreichbar.
        </Statusmeldung>
      ) : null}
    </div>
  );
}

const sperrTexte: Record<SperrProblem, string> = {
  last_owner_required:
    'Die letzte aktive Praxisinhaberin behält ihre Rolle und ihren Zugang. Sonst könnte niemand mehr Zugänge, Rollen und das Auditlog verwalten.',
  cannot_lock_own_account: 'Der eigene Zugang lässt sich nicht sperren.',
  unbekannt: 'Der Vorgang konnte nicht ausgeführt werden.',
};

function sperrText(fehler: unknown): string | undefined {
  if (fehler instanceof ZugangsError) return sperrTexte[fehler.problem];
  return fehler ? sperrTexte.unbekannt : undefined;
}

/**
 * Ein bestehender Zugang: Rollen, Sperre, Kennwort (STAFF-002c, STAFF-003).
 *
 * Die drei Vorgänge stehen bewusst nebeneinander statt in einem Formular. Sie
 * sind verschieden endgültig: Eine Rolle zu ändern wirkt sofort auf die
 * Sichtbarkeit von Akten, eine Sperre nimmt den Zugang ganz, und das
 * Zurücksetzen des Kennworts ändert an den Berechtigungen gar nichts. Ein
 * gemeinsames „Speichern" würde diesen Unterschied einebnen.
 */
function BestehenderZugang({ staff, konto }: { staff: StaffMember; konto: StaffAccount }) {
  const queryClient = useQueryClient();
  const aktiv = konto.account_active !== false;
  const [rollen, setRollen] = useState<RoleKey[]>(konto.role_keys ?? []);

  async function neuLaden() {
    await queryClient.invalidateQueries({ queryKey: ['staff-account', staff.id] });
    await queryClient.invalidateQueries({ queryKey: ['assignable-therapists'] });
  }

  const rollenSpeichern = useMutation({
    mutationFn: () => setzeRollen(staff.id, rollen),
    onSuccess: neuLaden,
  });
  const sperren = useMutation({
    mutationFn: (zielAktiv: boolean) => setzeZugangAktiv(staff.id, zielAktiv),
    onSuccess: neuLaden,
  });
  const kennwort = useMutation({
    mutationFn: () => stosseKennwortZuruecksetzenAn(staff.id),
  });

  const gespeichert = konto.role_keys ?? [];
  const geaendert =
    rollen.length !== gespeichert.length || rollen.some((r) => !gespeichert.includes(r));

  return (
    <div className="max-w-md">
      <DetailList>
        <DetailRow label="Stand">{aktiv ? 'Eingerichtet' : 'Gesperrt'}</DetailRow>
      </DetailList>

      {!aktiv ? (
        <Statusmeldung ton="warnung" className="mt-3">
          Dieser Zugang ist gesperrt. Die Person kann sich anmelden, sieht aber keine Daten der
          Praxis.
        </Statusmeldung>
      ) : null}

      <fieldset className="mt-6">
        <legend className="text-ink mb-1 text-sm font-medium">Rollen</legend>
        <div className="flex flex-col">
          {WAEHLBARE_ROLLEN.map((rolle) => (
            <Checkbox
              key={rolle}
              label={roleLabel(rolle)}
              hint={rollenHinweis[rolle]}
              checked={rollen.includes(rolle)}
              onChange={(event) =>
                setRollen((bisher) =>
                  event.target.checked
                    ? [...bisher, rolle]
                    : bisher.filter((eintrag) => eintrag !== rolle),
                )
              }
            />
          ))}
        </div>
      </fieldset>

      {rollenSpeichern.isError ? (
        <Statusmeldung ton="fehler" className="mt-3">
          {sperrText(rollenSpeichern.error)}
        </Statusmeldung>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-3">
        <Button
          type="button"
          disabled={!geaendert || rollen.length === 0 || rollenSpeichern.isPending}
          onClick={() => rollenSpeichern.mutate()}
        >
          {rollenSpeichern.isPending ? 'Wird gespeichert …' : 'Rollen speichern'}
        </Button>
        {geaendert ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setRollen(gespeichert);
              rollenSpeichern.reset();
            }}
          >
            Verwerfen
          </Button>
        ) : null}
      </div>
      {rollen.length === 0 ? (
        <Statusmeldung className="mt-2">
          Ein Zugang braucht mindestens eine Rolle. Ohne Rolle wird er gesperrt, nicht entrechtet.
        </Statusmeldung>
      ) : null}

      <div className="border-line mt-8 flex flex-wrap items-center gap-3 border-t pt-6">
        <Rueckfrage
          ausloeser={aktiv ? 'Zugang sperren' : 'Zugang entsperren'}
          bestaetigen={aktiv ? 'Sperren' : 'Entsperren'}
          bestaetigenLaeuft="Wird geändert …"
          fehler={sperren.isError ? sperrText(sperren.error) : undefined}
          laeuft={sperren.isPending}
          onBestaetigen={() => sperren.mutateAsync(!aktiv)}
          onAbbrechen={() => sperren.reset()}
        >
          <p>
            {aktiv
              ? 'Die Person kann sich weiterhin anmelden, sieht aber keine Daten der Praxis mehr. Der Mitarbeiterdatensatz, bestehende Termine und die Dokumentation bleiben unverändert.'
              : 'Die Person erhält ihren bisherigen Zugang mit den oben gezeigten Rollen zurück.'}
          </p>
        </Rueckfrage>

        <Rueckfrage
          ausloeser="Kennwort zurücksetzen"
          bestaetigen="Mail senden"
          bestaetigenLaeuft="Wird gesendet …"
          fehler={kennwort.isError ? 'Das Zurücksetzen konnte nicht angestoßen werden.' : undefined}
          laeuft={kennwort.isPending}
          onBestaetigen={() => kennwort.mutateAsync()}
          onAbbrechen={() => kennwort.reset()}
        >
          <p>
            Der Anmeldedienst schickt eine Mail an die hinterlegte Adresse. Das bisherige Kennwort
            bleibt gültig, bis ein neues gesetzt wird — der Zugang wird dadurch nicht gesperrt.
          </p>
        </Rueckfrage>
      </div>

      {kennwort.isSuccess ? (
        <Statusmeldung className="mt-3">
          Die Mail zum Zurücksetzen wurde an die hinterlegte Adresse geschickt.
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
      {hatZugang && konto.data ? (
        <BestehenderZugang staff={staff} konto={konto.data} />
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
