'use client';

import { useFormStatus } from 'react-dom';
import type { ReactNode } from 'react';

export default function PendingSubmitButton({ children, pendingText, className, ...props }: {
  children: ReactNode;
  pendingText: string;
  className?: string;
  type?: 'submit';
  disabled?: boolean;
  role?: string;
  'aria-label'?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button {...props} type="submit" className={className} disabled={pending || props.disabled} aria-busy={pending}>
      {pending ? <><span className="action-spinner" aria-hidden="true" /><span>{pendingText}</span></> : children}
    </button>
  );
}
