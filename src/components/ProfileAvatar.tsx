import React, { useEffect, useState } from 'react';
import { User } from 'lucide-react';
import { UserProfile } from '../types/budget';

interface ProfileAvatarProps {
  profile: UserProfile;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  inverted?: boolean;
}

export const ProfileAvatar: React.FC<ProfileAvatarProps> = ({
  profile,
  size = 'sm',
  inverted = false,
}) => {
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [profile.avatarUrl]);

  const sizeClasses = {
    xs: 'w-6 h-6 text-[11px]',
    sm: 'w-7 h-7 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-14 h-14 text-lg',
  }[size];

  const roundedClasses = size === 'lg' ? 'rounded-2xl' : 'rounded-full';

  if (profile.avatarUrl && !imgFailed) {
    return (
      <img
        src={profile.avatarUrl}
        alt={`Profilbild von ${profile.name}`}
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
        className={`${sizeClasses} ${roundedClasses} object-cover shrink-0 ring-1 ${
          inverted ? 'ring-[#FCFBF8]/30' : 'ring-[#3D322C]/15'
        }`}
      />
    );
  }

  const initial = profile.name.trim().charAt(0).toUpperCase();

  return (
    <div
      className={`${sizeClasses} ${roundedClasses} flex items-center justify-center font-display font-semibold shrink-0 transition-colors ${
        inverted
          ? 'bg-[#FCFBF8]/15 text-[#FCFBF8] ring-1 ring-[#FCFBF8]/25'
          : 'bg-[#EFEAE0] text-[#3D322C] ring-1 ring-[#DDD5C5]'
      }`}
      aria-hidden="true"
    >
      {initial || <User className="w-4 h-4" />}
    </div>
  );
};
