'use client';

import { useState } from 'react';
import { getProfileAvatarSrc, profileAvatarOptions, type ProfileAvatarId } from '../profile-avatar';

export default function AvatarPicker({ defaultValue = 'sage' }: { defaultValue?: ProfileAvatarId }) {
  const [selected, setSelected] = useState<ProfileAvatarId>(defaultValue);

  return <fieldset className="onboarding-avatar-picker">
    <legend>Choose your avatar</legend>
    <div className="onboarding-avatar-options" role="radiogroup" aria-label="Choose your dashboard avatar">
      {profileAvatarOptions.map(option => <button
        key={option.id}
        type="button"
        role="radio"
        aria-checked={selected === option.id}
        aria-label={`${option.label} avatar`}
        title={option.label}
        className={`onboarding-avatar-option${selected === option.id ? ' selected' : ''}`}
        onClick={() => setSelected(option.id)}
      ><img src={getProfileAvatarSrc(option.id)} alt=""/><span>{option.label}</span></button>)}
    </div>
    <input type="hidden" name="avatarId" value={selected}/>
  </fieldset>;
}
