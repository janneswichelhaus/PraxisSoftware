import { Personenbild } from '@/components/ui/Personenbild';
import { avatarVon, useAvatare } from './teambilder';

/**
 * Eine Person des Teams als Bild (TEAM-006): Initialen auf ihrer Farbe. Der
 * Name kommt vom Aufrufer, der ihn ohnehin daneben schreibt.
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
  return <Personenbild name={name} farbe={avatar?.color} groesse={groesse} />;
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
