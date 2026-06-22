'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export function CollapsibleCard({
  title,
  icon,
  count,
  headerActions,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon?: ReactNode;
  count?: number;
  headerActions?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-lg border border-slate-200 mb-5">
      <div className="flex items-center justify-between px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 flex-1 text-start"
        >
          <ChevronDown className={'h-4 w-4 text-slate-400 transition-transform ' + (open ? '' : '-rotate-90')} />
          {icon}
          <span>{title}</span>
          {typeof count === 'number' && <span className="text-slate-400 font-normal">({count})</span>}
        </button>
        {headerActions && <div className="shrink-0">{headerActions}</div>}
      </div>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}
