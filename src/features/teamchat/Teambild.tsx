import { Personenbild } from '@/components/ui/Personenbild';
import { avatarVon, useAvatare, useProfilbild } from './teambilder';

/**
 * Eine Person des Teams als Bild (TEAM-006, TEAM-007): ihr Profilbild mit
 * dem Umriss ihrer Farbe, sonst die Initialen darauf - auch, solange das Bild
 * lädt. Der Name kommt vom Aufrufer, der ihn ohnehin daneben schreibt.
 */
export function Teambild({
  staffMemberId,
  name,
  groesse = 'zeile',
}: {
  staffMemberId: string | null | undefined;
  name: string | null | undefined;
  groesse?: 'klein' | 'zeile' | 'gross';
}) {
  const avatare = useAvatare();
  const avatar = avatarVon(avatare.data, staffMemberId);
  const bild = useProfilbild(avatar?.picture_id);
  return (
    <Personenbild
      name={name}
      farbe={avatar?.color}
      bild={avatar?.picture_id ? bild.data : null}
      groesse={groesse}
    />
  );
}

/** Name mit kleinem Bild davor - als Beschriftung eines Kästchens. */
export function NameMitBild({ staffMemberId, name }: { staffMemberId: string; name: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <Teambild staffMemberId={staffMemberId} name={name} groesse="klein" />
      <span className="min-w-0">{name}</span>
    </span>
  );
}

/**
 * Bild vor einem Eintrag einer Liste (TEAM-008): wer die Nachricht
 * geschrieben hat. Ist sie entfernt, steht niemand da - der Platz bleibt,
 * damit die Zeilen untereinander stehen.
 */
export function Verfasserbild({
  staffMemberId,
  name,
  groesse = 'zeile',
}: {
  staffMemberId: string | null;
  name: string | null;
  groesse?: 'klein' | 'zeile';
}) {
  if (!staffMemberId) {
    return (
      <span
        aria-hidden="true"
        className={`${groesse === 'klein' ? 'size-6' : 'size-9'} shrink-0`}
      />
    );
  }
  return <Teambild staffMemberId={staffMemberId} name={name} groesse={groesse} />;
}
