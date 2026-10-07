import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { formatLocalDate } from '@/features/appointments/api';
import { fetchPatientFiles } from '@/features/files/api';
import {
  einloeseadresse,
  getPlatformAccess,
  invitePlatformAccess,
  revokePlatformAccess,
  sendPlatformInvitation,
  setPlatformAccessLocked,
  zugangsschluessel,
  type Einladung,
  type Plattformzugang,
  type Verhaeltnisart,
} from './api';
import { QrCode } from './QrCode';
import { Vertretungen } from './Vertretungen';
import { ZUSTAND, anzeigezustand } from './zustand';

/**
 * Der Abschnitt „Plattform" an Akte und Trainingsverhältnis (POR-002,
 * DSN-001 Abschnitt 6, ADR-023 Punkte 6 bis 11).
 *
 * Zwei Abschnitte, nicht einer: Hat eine Person beide Verhältnisse, lädt die
 * Praxis je Verhältnis ein, sperrt je Verhältnis und entzieht je Verhältnis
 * (§4.8, Punkt 4). Der Abschnitt zeigt den Zustand und **nur den passenden
 * Knopf**. Wer das Verhältnis nur liest, sieht den Zustand ohne Knöpfe; die
 * Rolle prüft der Server (ADR-004).
 *
 * Der Code einer Einladung lebt nur in diesem Abschnitt, solange er offen
 * ist. Er steht nirgends sonst: nicht in der Adresse, nicht im
 * Abfragespeicher, nicht in der Datenbank (dort nur sein Hash).
 *
 * Darunter stehen die Vertretungen (POR-005): eigene Konten, die für die
 * Person handeln, mit eigenem Zugang zu diesem Verhältnis.
 */
export function PlattformAbschnitt({
  art,
  verhaeltnisId,
  darfVerwalten,
  zeitzone,
  praxis,
}: {
  art: Verhaeltnisart;
  verhaeltnisId: string;
  darfVerwalten: boolean;
  zeitzone: string;
  /** Name der Praxis für den Wortlaut der Einwilligung zur Begleitung. */
  praxis: string;
}) {
  const schluessel = zugangsschluessel(art, verhaeltnisId);
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: schluessel,
    queryFn: () => getPlatformAccess(art, verhaeltnisId),
  });
  const [einladung, setEinladung] = useState<{ einladung: Einladung; fuer?: string } | null>(null);

  return (
    // Ohne Erklärsatz: Zustand und Knöpfe sagen, worum es geht (Leitfaden
    // L1 und L2, Löschkandidat 3, ANN-260).
    <Section titel="Plattform" rahmen>
      {isPending ? (
        <LoadingState label="Zugang wird geladen …" />
      ) : isError ? (
        <ErrorState
          title="Der Zugang konnte nicht geladen werden."
          description="Bitte später erneut versuchen."
          onErneut={refetch}
        />
      ) : einladung ? (
        <EinladungVorOrt
          einladung={einladung.einladung}
          fuer={einladung.fuer}
          onFertig={() => setEinladung(null)}
        />
      ) : (
        <>
          <Zustand
            art={art}
            verhaeltnisId={verhaeltnisId}
            zugang={data ?? null}
            darfVerwalten={darfVerwalten}
            zeitzone={zeitzone}
            onEinladungVorOrt={(e) => setEinladung({ einladung: e })}
          />
          <Vertretungen
            art={art}
            verhaeltnisId={verhaeltnisId}
            darfVerwalten={darfVerwalten}
            zeitzone={zeitzone}
            praxis={praxis}
            onEinladungVorOrt={(e, fuer) => setEinladung({ einladung: e, fuer })}
          />
        </>
      )}
    </Section>
  );
}

function Zustand({
  art,
  verhaeltnisId,
  zugang,
  darfVerwalten,
  zeitzone,
  onEinladungVorOrt,
}: {
  art: Verhaeltnisart;
  verhaeltnisId: string;
  zugang: Plattformzugang | null;
  darfVerwalten: boolean;
  zeitzone: string;
  onEinladungVorOrt: (einladung: Einladung) => void;
}) {
  const queryClient = useQueryClient();
  const [meldung, setMeldung] = useState<string | null>(null);
  const zustand = anzeigezustand(zugang);
  const datum = (wert: string | null) => (wert ? formatLocalDate(wert, zeitzone) : '—');
  const neuLaden = () =>
    queryClient.invalidateQueries({ queryKey: zugangsschluessel(art, verhaeltnisId) });

  const einladen = useMutation({
    mutationFn: ({ weg, bestaetigt }: { weg: 'on_site' | 'email'; bestaetigt: boolean }) =>
      invitePlatformAccess(art, verhaeltnisId, weg, bestaetigt),
  });
  const versenden = useMutation({
    mutationFn: (e: Einladung) => sendPlatformInvitation(e.invitation_id, e.code),
  });
  const sperren = useMutation({
    mutationFn: (sperre: boolean) => setPlatformAccessLocked(zugang?.id ?? '', sperre),
    onSuccess: neuLaden,
  });
  const entziehen = useMutation({
    mutationFn: () => revokePlatformAccess(zugang?.id ?? ''),
    onSuccess: neuLaden,
  });

  async function vorOrt() {
    setMeldung(null);
    const e = await einladen.mutateAsync({ weg: 'on_site', bestaetigt: false });
    await neuLaden();
    onEinladungVorOrt(e);
  }

  async function perMail(bestaetigt: boolean) {
    setMeldung(null);
    const e = await einladen.mutateAsync({ weg: 'email', bestaetigt });
    await neuLaden();
    // Der Versand ist ein zweiter Schritt. Scheitert er, steht die
    // Einladung trotzdem - sie lässt sich vor Ort übergeben.
    try {
      await versenden.mutateAsync(e);
      setMeldung(`Die Einladung ist an ${zugang?.relationship_email ?? 'die Adresse'} unterwegs.`);
    } catch (fehler) {
      setMeldung((fehler as Error).message);
    }
    await neuLaden();
  }

  const kannEinladen = zustand === 'none' || zustand === 'revoked' || zustand === 'expired';
  const aktiv = zustand === 'active';
  const gesperrt = zustand === 'locked';
  const eingeladen = zustand === 'invited';

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge ton={ZUSTAND[zustand]!.ton}>{ZUSTAND[zustand]!.text}</Badge>
      </div>
      <DetailList>
        {aktiv || gesperrt ? (
          <DetailRow label="Eingerichtet">{datum(zugang?.activated_at ?? null)}</DetailRow>
        ) : null}
        {gesperrt ? (
          <DetailRow label="Gesperrt seit">{datum(zugang?.locked_at ?? null)}</DetailRow>
        ) : null}
        {zustand === 'revoked' ? (
          <DetailRow label="Entzogen am">{datum(zugang?.revoked_at ?? null)}</DetailRow>
        ) : null}
        {/* POR-014 (DSN-001 Abschnitt 6): was die Person unter „Dokumente" sieht. */}
        {art === 'treatment' && (aktiv || gesperrt) ? (
          <FreigegebeneDokumente patientId={verhaeltnisId} />
        ) : null}
        {zugang?.invitation_id ? (
          <DetailRow label={zugang.invitation_purpose === 'reset' ? 'Neues Kennwort' : 'Einladung'}>
            {zugang.invitation_channel === 'email'
              ? zugang.invitation_sent_at
                ? 'per Mail versandt'
                : 'per Mail, noch nicht versandt'
              : 'vor Ort'}
            , gültig bis {datum(zugang.invitation_expires_at)}
          </DetailRow>
        ) : null}
      </DetailList>

      {meldung ? (
        <Statusmeldung className="mt-3" ton={versenden.isError ? 'warnung' : 'erfolg'}>
          {meldung}
        </Statusmeldung>
      ) : null}

      {darfVerwalten ? (
        <div className="mt-4 flex flex-wrap items-start gap-3">
          {kannEinladen || eingeladen ? (
            <Rueckfrage
              ausloeser={eingeladen ? 'Neu einladen (vor Ort)' : 'Vor Ort einladen'}
              ausloeserVariante="primary"
              bestaetigen="Code anzeigen"
              bestaetigenLaeuft="Wird ausgestellt …"
              fehler={einladen.error?.message}
              onBestaetigen={vorOrt}
            >
              <p>
                Ein Code erscheint auf diesem Gerät. Die Person scannt ihn mit dem eigenen Telefon
                und legt dort Adresse und Kennwort fest. Die Übergabe ist die Prüfung, dass sie es
                selbst ist – bitte nur an die Person selbst zeigen.
              </p>
            </Rueckfrage>
          ) : null}
          {(kannEinladen || eingeladen) && zugang?.relationship_email ? (
            <MailEinladung
              adresse={zugang.relationship_email}
              fehler={einladen.error?.message}
              onEinladen={perMail}
            />
          ) : null}
          {aktiv ? (
            <Rueckfrage
              ausloeser="Neues Kennwort (vor Ort)"
              bestaetigen="Code anzeigen"
              bestaetigenLaeuft="Wird ausgestellt …"
              fehler={einladen.error?.message}
              onBestaetigen={vorOrt}
            >
              <p>
                Die Person hat ihr Kennwort vergessen? Mit diesem Code setzt sie auf dem eigenen
                Telefon ein neues. Ihr Zugang bleibt derselbe.
              </p>
            </Rueckfrage>
          ) : null}
          {aktiv || gesperrt ? (
            <Rueckfrage
              ausloeser={aktiv ? 'Sperren' : 'Entsperren'}
              bestaetigen={aktiv ? 'Sperren' : 'Entsperren'}
              bestaetigenLaeuft={aktiv ? 'Wird gesperrt …' : 'Wird entsperrt …'}
              fehler={sperren.error?.message}
              onBestaetigen={() => sperren.mutateAsync(aktiv)}
            >
              <p>
                {aktiv
                  ? 'Die Person sieht ab sofort nichts mehr auf der Plattform. Das lässt sich zurücknehmen.'
                  : 'Die Person kann die Plattform wieder nutzen.'}
              </p>
            </Rueckfrage>
          ) : null}
          {aktiv || gesperrt || eingeladen ? (
            <Rueckfrage
              ausloeser="Entziehen"
              ausloeserVariante="quiet"
              bestaetigen="Zugang entziehen"
              bestaetigenLaeuft="Wird entzogen …"
              fehler={entziehen.error?.message}
              onBestaetigen={() => entziehen.mutateAsync()}
            >
              <p>
                Der Zugang endet endgültig. Ein neuer braucht eine neue Einladung. An der Akte und
                am Verhältnis ändert sich nichts.
              </p>
            </Rueckfrage>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Einladung per Mail — nur an die Adresse im Verhältnis und nur, wenn die
 * Person sie selbst bestätigt hat (ADR-023 Punkt 11, Fassung 2, ANN-188).
 * Eine Adresse aus einer Überweisung oder von Angehörigen genügt nicht.
 */
function MailEinladung({
  adresse,
  fehler,
  onEinladen,
}: {
  adresse: string;
  fehler: string | undefined;
  onEinladen: (bestaetigt: boolean) => Promise<void>;
}) {
  const [bestaetigt, setBestaetigt] = useState(false);
  return (
    <Rueckfrage
      ausloeser="Per Mail einladen"
      bestaetigen="Einladung senden"
      bestaetigenLaeuft="Wird gesendet …"
      fehler={fehler}
      onBestaetigen={() => onEinladen(bestaetigt)}
      onAbbrechen={() => setBestaetigt(false)}
    >
      <p>
        Die Einladung geht an <strong>{adresse}</strong>.
      </p>
      <div className="mt-2">
        <Checkbox
          label="Die Person hat mir diese Adresse selbst bestätigt."
          hint="Nicht genug: eine Adresse aus einer Überweisung, einem Formular oder von Angehörigen."
          checked={bestaetigt}
          onChange={(event) => setBestaetigt(event.target.checked)}
        />
      </div>
    </Rueckfrage>
  );
}

/**
 * Der Code zum Scannen (ADR-023 Punkt 8). Bleibt nur so lange sichtbar, bis
 * die Praxis „Fertig" tippt; danach ist er aus dem Speicher der Seite.
 */
export function EinladungVorOrt({
  einladung,
  fuer,
  onFertig,
}: {
  einladung: Einladung;
  /** Bei einer Vertretung: wer scannt (POR-005). Ohne Angabe die Person selbst. */
  fuer?: string | undefined;
  onFertig: () => void;
}) {
  const adresse = einloeseadresse(window.location.origin, einladung.code);
  const wer = fuer ? fuer : 'die Person';
  return (
    <div className="flex flex-col items-start gap-4">
      <p className="text-ink max-w-prose text-sm">
        {einladung.purpose === 'reset'
          ? `Bitte ${wer} diesen Code mit dem eigenen Telefon scannen lassen. Dort entsteht ein neues Kennwort.`
          : `Bitte ${wer} diesen Code mit dem eigenen Telefon scannen lassen. Dort entstehen Adresse und Kennwort.`}
        {fuer ? ' Es ist ein eigenes Konto, nie das der Person.' : ''}
      </p>
      <QrCode inhalt={adresse} bezeichnung="Code zum Einlösen der Einladung" />
      <p className="text-ink-muted text-sm">
        Gilt 14 Tage und nur einmal. Nach „Fertig" ist er hier nicht mehr zu sehen.
      </p>
      <Button onClick={onFertig}>Fertig</Button>
    </div>
  );
}

/**
 * „Freigegeben: n Dokumente" (POR-014): dieselbe Liste wie in der Akte,
 * gezählt nach der Freigabe. Ohne Leserecht auf Dateien keine Zeile.
 */
function FreigegebeneDokumente({ patientId }: { patientId: string }) {
  const { data } = useQuery({
    queryKey: ['patient-files', patientId, 'plattform'],
    queryFn: () => fetchPatientFiles(patientId, null),
    retry: false,
  });
  if (!data) return null;
  const anzahl = data.filter((d) => d.released_at).length;
  return (
    <DetailRow label="Freigegeben">
      {anzahl === 0 ? 'kein Dokument' : anzahl === 1 ? '1 Dokument' : `${anzahl} Dokumente`}
    </DetailRow>
  );
}
