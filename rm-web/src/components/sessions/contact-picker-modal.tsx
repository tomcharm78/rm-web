'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Search, Check, Loader2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/providers/language-provider';
import { listDirectory } from '@/lib/contacts/queries';
import type { DirectoryEntry } from '@/types/contact';

export function ContactPickerModal({
  onClose, onPick,
}: {
  onClose: () => void;
  onPick: (entries: DirectoryEntry[]) => void;
}) {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const dirQ = useQuery({ queryKey: ['directory'], queryFn: listDirectory });
  const all = dirQ.data ?? [];

  const filtered = all.filter((e) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [e.name, e.nameAr, e.email, e.organization].filter(Boolean).some((s) => s!.toLowerCase().includes(q));
  });

  const toggle = (id: string) => setSelected((s) => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const confirm = () => {
    const picked = all.filter((e) => selected.has(e.id));
    onPick(picked);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onMouseDown={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg my-8" onMouseDown={(e) => e.stopPropagation()} dir={ar ? 'rtl' : 'ltr'}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">{ar ? 'اختيار من جهات الاتصال' : 'Pick from Contacts'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>

        <div className="px-5 py-3 border-b border-slate-100">
          <div className="relative">
            <Search className="h-4 w-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder={ar ? 'بحث بالاسم أو الجهة أو البريد…' : 'Search by name, organization, email…'}
              className="w-full rounded-md border border-slate-200 ps-9 pe-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="max-h-[50vh] overflow-y-auto px-2 py-2">
          {dirQ.isLoading && <div className="p-4 text-center"><Loader2 className="h-5 w-5 animate-spin text-indigo-500 mx-auto" /></div>}
          {!dirQ.isLoading && filtered.length === 0 && (
            <p className="text-sm text-slate-400 text-center p-4">{ar ? 'لا نتائج.' : 'No matches.'}</p>
          )}
          {filtered.map((e) => {
            const isSel = selected.has(e.id);
            return (
              <button
                key={e.id} type="button" onClick={() => toggle(e.id)}
                className={'w-full text-start rounded-md px-3 py-2 flex items-center gap-3 ' + (isSel ? 'bg-indigo-50' : 'hover:bg-slate-50')}
              >
                <span className={'h-4 w-4 rounded border shrink-0 flex items-center justify-center ' + (isSel ? 'border-indigo-500 bg-indigo-500' : 'border-slate-300')}>
                  {isSel && <Check className="h-3 w-3 text-white" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-slate-800 truncate">{ar ? e.nameAr || e.name : e.name || e.nameAr}</span>
                  <span className="block text-xs text-slate-400 truncate">
                    {[e.organization, e.role].filter(Boolean).join(' · ')}{e.email ? ` · ${e.email}` : ''}
                  </span>
                </span>
                <span className="text-[10px] rounded px-1.5 py-0.5 bg-slate-100 text-slate-500 shrink-0">
                  {e.source === 'investor' ? (ar ? 'مستثمر' : 'Investor') : (ar ? 'جهة اتصال' : 'Contact')}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50">
          <span className="text-xs text-slate-400">{selected.size} {ar ? 'محدد' : 'selected'}</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>{ar ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={confirm} disabled={selected.size === 0} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
              <UserPlus className="h-4 w-4" />{ar ? `إضافة (${selected.size})` : `Add (${selected.size})`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
