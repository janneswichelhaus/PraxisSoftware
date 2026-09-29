import { useEffect, useState } from 'react';
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
import { roleLabel } from '@/components/ui/roleLabels';
import { NachladeHinweis, Rueckmeldung } from '@/features/appointments/Rueckmeldungen';
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
  type Zustellung,
} from './konto-api';
import type { StaffMember } from './api';
import { ROLLENHINWEISE } from './rollenhinweise';

/** Rollen, die ein Praxiszugang bekommen kann. `patient` ist ein anderes Konzept (§4.6). */
const WAEHLBARE_ROLLEN: RoleKey[] = ['therapist', 'team_lead', 'office', 'owner'];

/** Was nach einem gescheiterten Vorgang zu tun ist (WRT-01). */
const ERNEUT = 'Bitte die Verbindung prüfen und erneut versuchen.';

function formatiereDatum(wert: string): string {
  const datum = new Date(wert);
  if (Number.isNaN(datum.getTime())) return '—';
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(datum);
}

const problemTexte: Record<string, string> = {
  account_already_exists: 'Für diese Person besteht bereits ein Zugang.',
  email_already_in_use: 'Diese E-Mail-Adresse gehört bereits zu einem Zugang dieser Praxis.',
  bereits_eingeladen: 'Für diese Person steht bereits eine Einladung offen.',
  unbekannt: `Die Einladung konnte nicht angelegt werden. ${ERNEUT}`,
};

/**
 * Die drei Antworten des Anmeldedienstes auf eine Anmeldemail (ORG-10, R3-008).
 *
 * Dieselben Sätze nach „Zugang einladen" und nach „Anmeldemail senden": Bis
 * UXR-011 verwarf das Einladen die Antwort, und die Praxisinhaber:in erfuhr
 * nicht, ob eine Mail hinausging - auch nicht, wenn der Dienst nicht erreichbar
 * war.
 */
function Zustellmeldung({ zustellung, email }: { zustellung: Zustellung; email: string }) {
  if (zustellung === 'gesendet') {
    return (
      <Statusmeldung ton="erfolg" className="mt-3">
        Die Anmeldemail wurde an {email} geschickt.
      </Statusmeldung>
    );
  }
  if (zustellung === 'kein_konto') {
    return (
      <Statusmeldung ton="warnung" className="mt-3">
        Zu {email} gibt es beim Anmeldedienst noch kein Konto. Es muss dort einmalig angelegt
        werden; die Einladung bleibt so lange offen.
      </Statusmeldung>
    );
  }
  return (
    <Statusmeldung ton="fehler" className="mt-3">
      Der Anmeldedienst war nicht erreichbar. Die Einladung bleibt offen – bitte später erneut
      senden.
    </Statusmeldung>
  );
}

/**
 * Formular für eine neue Einladung.
 *
 * Die Rollen werden ausdrücklich gewählt und nicht vorbelegt: Eine Rolle zu
 * vergeben ist Berechtigungsvergabe (ADR-004), und eine Vorbelegung wäre eine
 * Entscheidung, die niemand getroffen hat. Die E-Mail-Adresse ist aus der
 * dienstlichen Adresse vorbelegt, weil sie dort in aller Regel schon steht -
 * sie bleibt änderbar.
 *
 * Fehler stehen am Feld, zu dem sie gehören (ORG-15): die Adresse am Feld,
 * die fehlende Rolle an der Rollenwahl. Bis UXR-011 standen beide als eine
 * Sammelzeile unter dem Formular, die Vorlesesoftware keinem Feld zuordnete.
 */
function Einladungsformular({
  staff,
  onEingeladen,
}: {
  staff: StaffMember;
  onEingeladen: (zustellung: Zustellung) => void;
}) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState(staff.work_email ?? '');
  const [rollen, setRollen] = useState<RoleKey[]>([]);
  const [adressFehler, setAdressFehler] = useState<string | undefined>(undefined);
  const [rollenFehler, setRollenFehler] = useState<string | undefined>(undefined);

  const mutation = useMutation({
    mutationFn: () => ladeZugangEin(staff.id, email.trim(), rollen),
    onSuccess: async (zustellung) => {
      onEingeladen(zustellung);
      setRollen([]);
      // Hier wird gewartet: Erst mit der neuen Einladung wechselt der
      // Abschnitt zur offenen Einladung - ohne sie stünde das Formular
      // wieder bedienbar da und lüde ein zweites Mal ein.
      await queryClient.invalidateQueries({ queryKey: ['staff-invitations', staff.id] });
      await queryClient.invalidateQueries({ queryKey: ['staff-account', staff.id] });
    },
  });

  function umschalten(rolle: RoleKey, gewaehlt: boolean) {
    setRollen((bisher) =>
      gewaehlt ? [...bisher, rolle] : bisher.filter((eintrag) => eintrag !== rolle),
    );
    setRollenFehler(undefined);
  }

  function absenden() {
    if (mutation.isPending) return;
    const adresseFalsch = !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
    const ohneRolle = rollen.length === 0;
    setAdressFehler(adresseFalsch ? 'Bitte eine gültige E-Mail-Adresse angeben.' : undefined);
    setRollenFehler(ohneRolle ? 'Bitte mindestens eine Rolle wählen.' : undefined);
    // Der Fokus geht an das erste Feld mit Fehler; dort liest die
    // Vorlesesoftware den Fehler mit.
    if (adresseFalsch) {
      document.getElementById('einladung-email')?.focus();
      return;
    }
    if (ohneRolle) {
      document.getElementById(`einladung-rolle-${WAEHLBARE_ROLLEN[0]}`)?.focus();
      return;
    }
    mutation.mutate();
  }

  const serverFehler =
    mutation.error instanceof EinladungsError
      ? problemTexte[mutation.error.problem]
      : mutation.isError
        ? problemTexte.unbekannt
        : undefined;

  return (
    <div className="max-w-md">
      <p className="text-ink-muted mb-4 text-sm">
        Hier entsteht die Berechtigung, noch kein Konto. Wirksam wird sie, wenn die Person sich
        anmeldet und die Einladung annimmt.
      </p>

      <Field
        label="E-Mail-Adresse für den Zugang"
        feldId="einladung-email"
        type="email"
        name="invite_email"
        autoComplete="off"
        value={email}
        error={adressFehler}
        onChange={(event) => {
          setEmail(event.target.value);
          setAdressFehler(undefined);
        }}
      />

      <fieldset
        className="mt-5"
        aria-describedby={rollenFehler ? 'einladung-rollen-fehler' : undefined}
      >
        <legend className="text-ink mb-1 text-sm font-medium">Rollen</legend>
        <div className="flex flex-col">
          {WAEHLBARE_ROLLEN.map((rolle) => (
            <Checkbox
              key={rolle}
              feldId={`einladung-rolle-${rolle}`}
              label={roleLabel(rolle)}
              hint={ROLLENHINWEISE[rolle]}
              checked={rollen.includes(rolle)}
              onChange={(event) => umschalten(rolle, event.target.checked)}
            />
          ))}
        </div>
        {rollenFehler ? (
          <p id="einladung-rollen-fehler" className="text-danger mt-1 text-sm">
            {rollenFehler}
          </p>
        ) : null}
      </fieldset>

      {serverFehler ? (
        <Statusmeldung ton="fehler" className="mt-4">
          {serverFehler}
        </Statusmeldung>
      ) : null}

      <Button type="button" className="mt-5" disabled={mutation.isPending} onClick={absenden}>
        {/* Im Normalfall geht beim Einladen keine Mail hinaus - es entsteht
            die Einladung (ORG-10). */}
        {mutation.isPending ? 'Wird angelegt …' : 'Zugang einladen'}
      </Button>
    </div>
  );
}

/**
 * Eine offene Einladung: erneut senden oder zurücknehmen.
 *
 * `zustellung` ist die Antwort des Anmeldedienstes auf das Einladen, solange
 * die Seite offen ist; nach „Anmeldemail senden" gilt die neue.
 */
function OffeneEinladung({
  einladung,
  staffMemberId,
  zustellung,
  onZurueckgenommen,
}: {
  einladung: StaffInvitation;
  staffMemberId: string;
  zustellung: Zustellung | null;
  onZurueckgenommen: () => void;
}) {
  const queryClient = useQueryClient();
  const abgelaufen = istAbgelaufen(einladung);

  const erneutSenden = useMutation({ mutationFn: () => sendeZugangsMail(einladung.email) });
  const widerrufen = useMutation({
    mutationFn: () => widerrufeEinladung(einladung.id),
    onSuccess: async () => {
      onZurueckgenommen();
      await queryClient.invalidateQueries({ queryKey: ['staff-invitations', staffMemberId] });
    },
  });

  const letzteZustellung = erneutSenden.data ?? zustellung;

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

      {!abgelaufen && letzteZustellung ? (
        <Zustellmeldung zustellung={letzteZustellung} email={einladung.email} />
      ) : null}
      {erneutSenden.isError ? (
        <Statusmeldung ton="fehler" className="mt-3">
          Der Anmeldedienst war nicht erreichbar. Die Einladung bleibt offen – bitte später erneut
          senden.
        </Statusmeldung>
      ) : null}

      {/* Der Kasten beschreibt den Handgriff aus ANN-025. Weiß die Seite, dass
          es das Konto schon gibt - die Mail ging hinaus -, entfällt er
          (ORG-10). */}
      {!abgelaufen && letzteZustellung !== 'gesendet' ? (
        <div className="border-line bg-surface-sunken rounded-card mt-4 border p-3">
          <p className="text-ink text-sm font-medium">Nächster Schritt</p>
          <p className="text-ink-muted mt-1 text-sm leading-relaxed">
            Die Berechtigung steht. Damit sich die Person anmelden kann, braucht sie einmalig ein
            Konto beim Anmeldedienst – die Praxisplattform legt keines an, weil die
            Selbstregistrierung bewusst abgeschaltet ist. Das Konto legt an, wer den Anmeldedienst
            betreut: in dessen Verwaltung unter „Authentication → Users → Add user“, mit genau
            dieser Adresse. Danach „Anmeldemail senden“ – die Person meldet sich an und nimmt die
            Einladung an; die Rollen oben werden dabei gesetzt.
          </p>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {!abgelaufen ? (
          <Button
            type="button"
            variant="secondary"
            disabled={erneutSenden.isPending}
            onClick={() => erneutSenden.mutate()}
          >
            {erneutSenden.isPending ? 'Wird gesendet …' : 'Anmeldemail senden'}
          </Button>
        ) : null}

        <Rueckfrage
          ausloeser="Einladung zurücknehmen"
          bestaetigen="Zurücknehmen"
          bestaetigenLaeuft="Wird zurückgenommen …"
          fehler={
            widerrufen.isError
              ? `Die Einladung konnte nicht zurückgenommen werden. ${ERNEUT}`
              : undefined
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
    </div>
  );
}

const sperrTexte: Record<SperrProblem, string> = {
  last_owner_required:
    'Die letzte aktive Praxisinhaber:in behält ihre Rolle und ihren Zugang. Sonst könnte niemand mehr Zugänge, Rollen und das Protokoll verwalten.',
  cannot_lock_own_account: 'Der eigene Zugang lässt sich nicht sperren.',
  unbekannt: `Der Vorgang konnte nicht ausgeführt werden. ${ERNEUT}`,
};

function sperrText(fehler: unknown): string | undefined {
  if (fehler instanceof ZugangsError) return sperrTexte[fehler.problem];
  return fehler ? sperrTexte.unbekannt : undefined;
}

/** Eine Bestätigung, die beim Erscheinen den Fokus nimmt (ZST-16). */
interface Bestaetigung {
  text: string;
  nr: number;
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
  // Was der Server zuletzt bestätigt hat, bis der Zugangsstand nachgeladen ist.
  const [bestaetigt, setBestaetigt] = useState<RoleKey[] | null>(null);
  const [meldung, setMeldung] = useState<Bestaetigung | null>(null);

  // Kommt ein neuer Stand vom Server, gilt er.
  useEffect(() => {
    setBestaetigt(null);
  }, [konto.role_keys]);

  async function neuLaden() {
    await queryClient.invalidateQueries({ queryKey: ['staff-account', staff.id] });
    await queryClient.invalidateQueries({ queryKey: ['assignable-therapists'] });
  }

  function melden(text: string) {
    setMeldung((vorher) => ({ text, nr: (vorher?.nr ?? 0) + 1 }));
  }

  const rollenSpeichern = useMutation({
    mutationFn: (auswahl: RoleKey[]) => setzeRollen(staff.id, auswahl),
    onSuccess: (_, auswahl) => {
      setBestaetigt(auswahl);
      // Nur eine Rückmeldung - welche Rollen jetzt gelten (ORG-04). Bis
      // UXR-011 sprang nur der Knopf zurück.
      melden(`Rollen gespeichert: ${auswahl.map(roleLabel).join(', ')}.`);
      // Nicht abwarten (ZST-B01): Gespeichert ist es mit der Antwort des
      // Servers.
      void neuLaden();
    },
  });
  const sperren = useMutation({
    mutationFn: (zielAktiv: boolean) => setzeZugangAktiv(staff.id, zielAktiv),
    onSuccess: async (_, zielAktiv) => {
      // Hier wird gewartet: Beschriftung und Stand des Abschnitts hängen am
      // neuen Zugangsstand.
      await neuLaden();
      melden(zielAktiv ? 'Der Zugang ist entsperrt.' : 'Der Zugang ist gesperrt.');
    },
  });
  const kennwort = useMutation({
    mutationFn: () => stosseKennwortZuruecksetzenAn(staff.id),
  });

  const gespeichert = bestaetigt ?? konto.role_keys ?? [];
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
              hint={ROLLENHINWEISE[rolle]}
              checked={rollen.includes(rolle)}
              onChange={(event) => {
                setRollen((bisher) =>
                  event.target.checked
                    ? [...bisher, rolle]
                    : bisher.filter((eintrag) => eintrag !== rolle),
                );
                setMeldung(null);
              }}
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
          onClick={() => rollenSpeichern.mutate(rollen)}
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
          Ein Zugang braucht mindestens eine Rolle. Soll die Person keine Daten mehr sehen, sperren
          Sie den Zugang unten.
        </Statusmeldung>
      ) : null}

      {meldung ? (
        <Rueckmeldung key={meldung.nr} className="mt-3">
          {meldung.text}
        </Rueckmeldung>
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
              ? 'Die Person kann sich weiterhin anmelden, sieht aber keine Daten der Praxis mehr. Die Stammdaten, bestehende Termine und die Dokumentation bleiben unverändert.'
              : 'Die Person erhält ihren bisherigen Zugang mit den oben gezeigten Rollen zurück.'}
          </p>
        </Rueckfrage>

        <Rueckfrage
          ausloeser="Kennwort zurücksetzen"
          bestaetigen="Mail senden"
          bestaetigenLaeuft="Wird gesendet …"
          fehler={
            kennwort.isError
              ? `Das Zurücksetzen konnte nicht angestoßen werden. ${ERNEUT}`
              : undefined
          }
          laeuft={kennwort.isPending}
          onBestaetigen={() => kennwort.mutateAsync()}
          onAbbrechen={() => kennwort.reset()}
        >
          <p>
            Der Anmeldedienst schickt eine Mail an die hinterlegte Adresse. Das bisherige Kennwort
            bleibt gültig, bis ein neues gesetzt wird – der Zugang wird dadurch nicht gesperrt.
          </p>
        </Rueckfrage>
      </div>

      {kennwort.isSuccess ? (
        <Statusmeldung ton="erfolg" className="mt-3">
          Die Mail zum Zurücksetzen wurde an die hinterlegte Adresse geschickt.
        </Statusmeldung>
      ) : null}
    </div>
  );
}

/**
 * Der Zugangsteil des Mitarbeiterdatensatzes (STAFF-002b).
 *
 * Nur für die Praxisinhaber:in sichtbar - und das ist hier keine reine
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
  // Die Antwort des Anmeldedienstes auf das Einladen - das Formular ist fort,
  // sobald die Einladung steht; die Meldung gehört zur offenen Einladung.
  const [zustellung, setZustellung] = useState<Zustellung | null>(null);
  // Zähler statt Schalter: Jede Rücknahme ist eine neue Meldung mit Fokus.
  const [zurueckgenommen, setZurueckgenommen] = useState(0);

  if (konto.isPending || einladungen.isPending) {
    return (
      <Section titel="Zugang">
        <LoadingState label="Zugangsstand wird geladen …" />
      </Section>
    );
  }

  // Nur ohne Daten ersetzt der Fehler den Abschnitt (ZST-03): Scheitert ein
  // Nachladen, bleiben Rollenwahl und Eingaben stehen.
  if (konto.data === undefined || einladungen.data === undefined) {
    return (
      <Section titel="Zugang">
        <ErrorState
          title="Der Zugangsstand konnte nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => {
            void konto.refetch();
            void einladungen.refetch();
          }}
        />
      </Section>
    );
  }

  const offen = einladungen.data.find((eintrag) => eintrag.status === 'pending');
  const hatZugang = konto.data?.user_id != null;

  return (
    <Section titel="Zugang" hinweis="Zugang zur Anwendung. Die Stammdaten bleiben davon unberührt.">
      {konto.isError || einladungen.isError ? (
        <NachladeHinweis
          className="mb-4"
          laeuft={konto.isFetching || einladungen.isFetching}
          onErneut={() => {
            void konto.refetch();
            void einladungen.refetch();
          }}
        />
      ) : null}
      {zurueckgenommen > 0 && !offen && !hatZugang ? (
        <Rueckmeldung key={zurueckgenommen} className="mb-4">
          Die Einladung ist zurückgenommen.
        </Rueckmeldung>
      ) : null}

      {hatZugang && konto.data ? (
        <BestehenderZugang staff={staff} konto={konto.data} />
      ) : offen ? (
        <OffeneEinladung
          einladung={offen}
          staffMemberId={staff.id}
          zustellung={zustellung}
          onZurueckgenommen={() => {
            setZustellung(null);
            setZurueckgenommen((vorher) => vorher + 1);
          }}
        />
      ) : staff.employment_status === 'inactive' ? (
        <Statusmeldung>
          Für eine inaktive Person wird kein Zugang eingeladen. Dafür müsste sie zuerst wieder als
          aktiv geführt werden.
        </Statusmeldung>
      ) : (
        <Einladungsformular
          staff={staff}
          onEingeladen={(antwort) => {
            setZurueckgenommen(0);
            setZustellung(antwort);
          }}
        />
      )}
    </Section>
  );
}
