'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Target, Pencil, Archive } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import { listStrategicGoals, listDepartmentGoals, archiveStrategicGoal, archiveDepartmentGoal } from '@/lib/kpi/queries';
import { getMyDepartmentId, listAllDepartments } from '@/lib/dashboard/dept-queries';
import { yearlyTarget, type StrategicGoal, type DepartmentGoal } from '@/types/kpi';
import { GoalEditorModal, TIER_COLOR } from '@/components/kpi/goal-editor-modal';
import { LinkageOverview } from '@/components/kpi/linkage-overview';
import { AlignmentView } from '@/components/kpi/alignment-view';

function TargetChips({ g, ar }: { g: { q1Target: number; q2Target: number; q3Target: number; q4Target: number }; ar: boolean }) {
  const qs = [['Q1', g.q1Target], ['Q2', g.q2Target], ['Q3', g.q3Target], ['Q4', g.q4Target]] as const;
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      {qs.map(([label, v]) => (
        <span key={label} style={{ fontSize: 11, background: 'hsl(var(--muted))', borderRadius: 6, padding: '2px 8px', color: 'hsl(var(--foreground))' }}>
          {label}: <strong>{v ?? 0}</strong>
        </span>
      ))}
      <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>· {ar ? 'سنوي' : 'yr'} {yearlyTarget(g)}</span>
    </div>
  );
}

export default function KpiPage() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const ar = language === 'ar';
  const qc = useQueryClient();
  const year = new Date().getUTCFullYear();

  const isSuper = user?.role === 'super_admin';
  const isAdmin = user?.role === 'admin';

  const [modal, setModal] = useState<null | { kind: 'strategic'; tier: 'organization' | 'deputyship'; editing?: StrategicGoal } | { kind: 'department'; editing?: DepartmentGoal }>(null);

  const orgGoalsQ = useQuery({ queryKey: ['strategic-goals', 'organization', year], queryFn: () => listStrategicGoals('organization'), enabled: isSuper });
  const depGoalsQ = useQuery({ queryKey: ['strategic-goals', 'deputyship', year], queryFn: () => listStrategicGoals('deputyship') });
  const myDeptQ = useQuery({ queryKey: ['my-dept-id'], queryFn: getMyDepartmentId, enabled: isAdmin });
  const allDeptsQ = useQuery({ queryKey: ['all-depts'], queryFn: listAllDepartments, enabled: isSuper });

  const deptId = isAdmin ? (myDeptQ.data ?? null) : null;
  const deptGoalsQ = useQuery({
    queryKey: ['department-goals', deptId, year],
    queryFn: () => listDepartmentGoals(deptId!, year),
    enabled: isAdmin && !!deptId,
  });
  const allDeptGoalsQ = useQuery({
    queryKey: ['department-goals', 'all', year],
    queryFn: () => listDepartmentGoals(undefined, year),
    enabled: isSuper,
  });

  const deputyshipOptions = (depGoalsQ.data ?? []).map((g) => ({ id: g.id, label: ar ? g.titleAr || g.title : g.title }));
  const deptNameById = new Map((allDeptsQ.data ?? []).map((d) => [d.id, ar ? d.nameAr || d.name : d.name]));

  async function archiveStrat(id: string) {
    if (!confirm(ar ? 'أرشفة هذا الهدف؟' : 'Archive this goal?')) return;
    await archiveStrategicGoal(id);
    qc.invalidateQueries({ queryKey: ['strategic-goals'] });
  }
  async function archiveDept(id: string) {
    if (!confirm(ar ? 'أرشفة هذا الهدف؟' : 'Archive this goal?')) return;
    await archiveDepartmentGoal(id);
    qc.invalidateQueries({ queryKey: ['department-goals'] });
  }

  if (!user) return null;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '1.5rem 1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <Target size={20} />
        <h1 style={{ fontSize: 20, fontWeight: 500 }}>{ar ? 'مؤشرات الأداء والأهداف الاستراتيجية' : 'KPIs & Strategic Goals'}</h1>
      </div>
      <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', marginBottom: 24 }}>
        {ar ? `مواءمة العمليات مع استراتيجية الوكالة · ${year}` : `Aligning operations with deputyship strategy · ${year}`}
      </p>

      {/* SUPER: organization strategic goals */}
      {isSuper && (
        <Section tier="organization"
          title={ar ? 'الأهداف الاستراتيجية للمنظمة' : 'Organization strategic goals'}
          hint={ar ? 'الرؤية عالية المستوى (نوعية)' : 'high-level vision (qualitative)'}
          onAdd={() => setModal({ kind: 'strategic', tier: 'organization' })} ar={ar}>
          {(orgGoalsQ.data ?? []).length === 0 && <Empty ar={ar} />}
          {(orgGoalsQ.data ?? []).map((g) => (
            <GoalRow key={g.id} accent={TIER_COLOR.organization} title={ar ? g.titleAr || g.title : g.title} desc={ar ? g.descriptionAr || g.description : g.description}
              onEdit={() => setModal({ kind: 'strategic', tier: 'organization', editing: g })} onArchive={() => archiveStrat(g.id)} ar={ar} />
          ))}
        </Section>
      )}

      {/* SUPER: deputyship strategic goals (qualitative) */}
      {isSuper && (
        <Section tier="deputyship"
          title={ar ? 'الأهداف الاستراتيجية للوكالة' : 'Deputyship strategic goals'}
          hint={ar ? 'مرتبطة بأهداف المنظمة (نوعية)' : 'linked to org goals (qualitative)'}
          onAdd={() => setModal({ kind: 'strategic', tier: 'deputyship' })} ar={ar}>
          {(depGoalsQ.data ?? []).length === 0 && <Empty ar={ar} />}
          {(depGoalsQ.data ?? []).map((g) => (
            <GoalRow key={g.id} accent={TIER_COLOR.deputyship} title={ar ? g.titleAr || g.title : g.title} desc={ar ? g.descriptionAr || g.description : g.description}
              onEdit={() => setModal({ kind: 'strategic', tier: 'deputyship', editing: g })} onArchive={() => archiveStrat(g.id)} ar={ar} />
          ))}
        </Section>
      )}

      {/* SUPER: executive goals overview */}
      {isSuper && (
        <Section tier="executive" title={ar ? 'الأهداف التنفيذية للأقسام (نظرة عامة)' : 'Department executive goals (overview)'} hint={ar ? 'ما تلتزم به الأقسام (أهداف ربعية)' : 'what departments committed to (quarterly targets)'} ar={ar}>
          {(allDeptGoalsQ.data ?? []).length === 0 && <Empty ar={ar} />}
          {(allDeptGoalsQ.data ?? []).map((g) => (
            <GoalRow key={g.id} accent={TIER_COLOR.executive} title={ar ? g.titleAr || g.title : g.title}
              desc={`${deptNameById.get(g.departmentId) ?? ''}`} chips={<TargetChips g={g} ar={ar} />} ar={ar} readOnly />
          ))}
        </Section>
      )}

      {/* ADMIN: their executive goals */}
      {isAdmin && (
        <Section tier="executive"
          title={ar ? 'الأهداف التنفيذية لقسمي' : 'My department executive goals'}
          hint={ar ? 'يجب ربط كل هدف بهدف استراتيجي للوكالة' : 'each links to a deputyship strategic goal'}
          onAdd={deputyshipOptions.length > 0 ? () => setModal({ kind: 'department' }) : undefined} ar={ar}>
          {!deptId && !myDeptQ.isLoading && <div style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>{ar ? 'لا يوجد قسم معيّن لك.' : 'No department assigned to you.'}</div>}
          {deputyshipOptions.length === 0 && <div style={{ fontSize: 12, color: '#c98500' }}>{ar ? 'لا توجد أهداف وكالة بعد — انتظر أن ينشئها المدير العام.' : 'No deputyship goals yet — waiting for super admin.'}</div>}
          {(deptGoalsQ.data ?? []).length === 0 && deptId && <Empty ar={ar} />}
          {(deptGoalsQ.data ?? []).map((g) => {
            const parent = (depGoalsQ.data ?? []).find((d) => d.id === g.deputyshipGoalId);
            return (
              <GoalRow key={g.id} accent={TIER_COLOR.executive} title={ar ? g.titleAr || g.title : g.title}
                desc={parent ? `↑ ${ar ? parent.titleAr || parent.title : parent.title}` : ''}
                chips={<TargetChips g={g} ar={ar} />}
                onEdit={() => setModal({ kind: 'department', editing: g })} onArchive={() => archiveDept(g.id)} ar={ar} />
            );
          })}
        </Section>
      )}

      <AlignmentView scopeDeptId={isSuper ? null : deptId} deptNameById={deptNameById} ar={ar} />

      <LinkageOverview scopeDeptId={isSuper ? null : deptId} deptNameById={deptNameById} ar={ar} />

      {modal && (
        <GoalEditorModal year={year} onClose={() => setModal(null)}
          mode={modal.kind === 'strategic'
            ? { kind: 'strategic', tier: modal.tier, editing: modal.editing }
            : { kind: 'department', departmentId: deptId!, deputyshipGoals: deputyshipOptions, editing: modal.editing }} />
      )}
    </div>
  );
}

function Section({ tier, title, hint, onAdd, children, ar }: { tier: 'organization' | 'deputyship' | 'executive'; title: string; hint: string; onAdd?: () => void; children: React.ReactNode; ar: boolean }) {
  const color = TIER_COLOR[tier];
  return (
    <div style={{ marginBottom: 28, borderLeft: `3px solid ${color}`, paddingLeft: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color }}>{title}</div>
          <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>{hint}</div>
        </div>
        {onAdd && (
          <button onClick={onAdd} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '6px 12px', borderRadius: 8, border: `0.5px solid ${color}`, background: color + '11', cursor: 'pointer', color }}>
            <Plus size={14} /> {ar ? 'إضافة' : 'Add'}
          </button>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </div>
  );
}

function GoalRow({ accent, title, desc, chips, onEdit, onArchive, ar, readOnly }: { accent: string; title: string; desc?: string; chips?: React.ReactNode; onEdit?: () => void; onArchive?: () => void; ar: boolean; readOnly?: boolean }) {
  return (
    <div style={{ background: 'hsl(var(--card))', border: '0.5px solid hsl(var(--border))', borderLeft: `3px solid ${accent}`, borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{title}</div>
        {desc && <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', margin: '2px 0 6px' }}>{desc}</div>}
        {chips}
      </div>
      {!readOnly && (
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {onEdit && <button onClick={onEdit} title={ar ? 'تعديل' : 'Edit'} style={iconBtn}><Pencil size={14} /></button>}
          {onArchive && <button onClick={onArchive} title={ar ? 'أرشفة' : 'Archive'} style={iconBtn}><Archive size={14} /></button>}
        </div>
      )}
    </div>
  );
}

function Empty({ ar }: { ar: boolean }) {
  return <div style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', padding: '8px 0' }}>{ar ? 'لا توجد أهداف بعد.' : 'No goals yet.'}</div>;
}

const iconBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 7, border: '0.5px solid hsl(var(--border))', background: 'hsl(var(--muted))', cursor: 'pointer', color: 'hsl(var(--muted-foreground))' };
