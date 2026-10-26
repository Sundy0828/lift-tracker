import { Avatar } from '@mantine/core';
import { useAuth } from '@lift/data/hooks/useAuth';
import { useProfile } from '@lift/data/hooks/useProfile';
import { accountPhoto, fullName, initials } from '@lift/domain/person';

/**
 * The signed-in person, as a circle: their photo when a linked account (Google)
 * has one, otherwise their initials on the accent colour — JS for Jerrod
 * Sunderland. Mantine falls back to the initials by itself if the photo will
 * not load.
 */
export function UserAvatar({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const name = fullName(profile);
  const photo = accountPhoto(user);

  return (
    <Avatar
      src={photo}
      alt={name === '' ? 'You' : name}
      color="sky"
      variant="filled"
      radius="xl"
      size={size}
      data-testid="user-avatar"
    >
      {initials(profile, user?.email ?? null)}
    </Avatar>
  );
}
