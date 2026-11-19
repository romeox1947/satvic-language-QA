export const profileAvatarOptions = [
  { id: 'sage', label: 'Sage' },
  { id: 'sunrise', label: 'Sunrise' },
  { id: 'meadow', label: 'Meadow' },
  { id: 'ocean', label: 'Ocean' },
  { id: 'rose', label: 'Rose' },
  { id: 'earth', label: 'Earth' },
] as const;

export type ProfileAvatarId = (typeof profileAvatarOptions)[number]['id'];

export function isProfileAvatarId(value: string): value is ProfileAvatarId {
  return profileAvatarOptions.some(option => option.id === value);
}

export function getProfileAvatarId(value: unknown): ProfileAvatarId {
  return typeof value === 'string' && isProfileAvatarId(value) ? value : 'sage';
}

export function getProfileAvatarSrc(value: unknown) {
  return `/avatars/${getProfileAvatarId(value)}.svg`;
}
