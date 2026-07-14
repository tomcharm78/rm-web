'use client';
// HOW TO USE — in-app documentation.
//
// Written from what the platform actually does, not from a spec. Kept short:
// people read documentation under duress, so each module gets what it IS, what
// it is FOR, and the one or two things that are not obvious.
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

type Doc = { key: string; en: string; ar: string; bodyEn: string[]; bodyAr: string[] };

const DOCS: Doc[] = [
  {
    key: 'roles',
    en: 'Roles and who sees what',
    ar: 'الأدوار ومن يرى ماذا',
    bodyEn: [
      'The platform has four working roles. **RM** and **ARM** do the front-line work: they own tasks, meet investors, and log sessions. An **Admin** heads a department and sees everything inside it. A **PMO** oversees the whole organisation, and a **PM** oversees the departments assigned to them.',
      'The rule that governs all of it: **visibility is not authority.** Governance (PMO/PM) can see work across departments in order to align it to strategy, but it cannot reach into a department and reassign its people. Work reaches the front line through that department\'s Admin.',
      'Because of this, a PMO assigns to PMs, Admins and Super Admins — never directly to an RM.',
    ],
    bodyAr: [
      'المنصة تعمل بأربعة أدوار. **مدير العلاقات (RM)** و**مساعده (ARM)** ينفّذان العمل الميداني. **المدير (Admin)** يرأس إدارة ويرى كل ما بداخلها. **مكتب إدارة المشاريع (PMO)** يشرف على المنظمة كاملة، و**مدير المشروع (PM)** يشرف على الإدارات المسندة إليه.',
      'القاعدة الحاكمة: **الرؤية ليست صلاحية.** الحوكمة ترى العمل عبر الإدارات لمواءمته مع الاستراتيجية، لكنها لا تعيد توزيع موظفي الإدارة. العمل يصل إلى الميدان عبر مدير الإدارة.',
      'لذلك يُسنِد الـPMO المهام إلى مديري المشاريع والمديرين — لا إلى مدير علاقات مباشرة.',
    ],
  },
  {
    key: 'language',
    en: 'Working in Arabic or English',
    ar: 'العمل بالعربية أو الإنجليزية',
    bodyEn: [
      'Switch language with the globe icon in the header. The whole interface flips, including text direction.',
      'When you create something — a task, a milestone, a subtask — you get **one** title box, not two. Whatever language you are working in, that is the language your text is stored as. You never have to translate your own work.',
      'If a colleague created a task in Arabic and you are reading in English, you will see the Arabic title. That is deliberate: showing you the real title is better than showing you nothing.',
    ],
    bodyAr: [
      'بدّل اللغة من أيقونة الكرة الأرضية في الأعلى. تنقلب الواجهة بالكامل، بما في ذلك اتجاه النص.',
      'عند إنشاء مهمة أو مرحلة أو مهمة فرعية، ستجد **حقل عنوان واحدًا** لا اثنين. النص يُحفَظ باللغة التي تعمل بها. لست مضطرًا لترجمة عملك.',
      'إذا أنشأ زميلك مهمة بالعربية وكنت تقرأ بالإنجليزية، سترى العنوان العربي — إظهار العنوان الحقيقي أفضل من إخفائه.',
    ],
  },
  {
    key: 'tasks',
    en: 'Tasks, milestones and support',
    ar: 'المهام والمراحل والدعم',
    bodyEn: [
      'A task is a unit of work with an owner and a due date. Break it into **milestones**, and each milestone into **subtasks**.',
      '**Asking for support:** assign a subtask to someone above you — your Admin, or (for governance) your PMO. They get a notification, and the subtask shows a **SUPPORT** badge until they accept or decline. Clicking the notification takes you straight to that subtask, with its milestone already open.',
      'Once support is requested, the subtask\'s owner is locked until the request is answered — you cannot quietly reassign it out from under them.',
      'The task **description** can be edited later by its assignee, its creator, or a super admin — look for the pencil.',
    ],
    bodyAr: [
      'المهمة وحدة عمل لها مالك وتاريخ استحقاق. قسّمها إلى **مراحل**، وكل مرحلة إلى **مهام فرعية**.',
      '**طلب الدعم:** أسنِد مهمة فرعية إلى من هو أعلى منك — مديرك، أو الـPMO في حالة الحوكمة. سيصله إشعار، وتظهر شارة **دعم** حتى يقبل أو يرفض. الضغط على الإشعار ينقلك مباشرة إلى تلك المهمة الفرعية وقد فُتحت مرحلتها.',
      'بعد طلب الدعم يُقفَل مالك المهمة الفرعية حتى يُجاب الطلب.',
      '**وصف المهمة** يمكن تعديله لاحقًا من المكلَّف أو المُنشئ أو المدير العام — ابحث عن أيقونة القلم.',
    ],
  },
  {
    key: 'kpis',
    en: 'KPIs: measuring alignment, not effort',
    ar: 'مؤشرات الأداء: قياس المواءمة لا الجهد',
    bodyEn: [
      'The KPI module answers one question: **is our effort aligned to our strategy, and which goals are being neglected?** It is not a scorecard for people.',
      'Goals form a chain: **organisation goals** (the national health objectives) → **deputyship goals** → **department executive goals**, which carry the actual quarterly targets.',
      'Link a task or a challenge to a department goal, and it counts toward that goal. A department with lots of completed work but few goal links has an *alignment* problem, however busy it looks.',
      'A department goal can also carry a **measurement formula** — this appears on the KPI scorecard export.',
    ],
    bodyAr: [
      'وحدة المؤشرات تجيب عن سؤال واحد: **هل جهدنا متوائم مع استراتيجيتنا، وأي الأهداف مهملة؟** ليست بطاقة تقييم للأشخاص.',
      'الأهداف تُشكّل سلسلة: **أهداف المنظمة** ← **أهداف الوكالة** ← **الأهداف التنفيذية للإدارات** التي تحمل المستهدفات الربعية.',
      'اربط مهمة أو تحديًا بهدف تنفيذي ليُحتسب ضمنه. الإدارة التي تنجز كثيرًا دون ربط بالأهداف لديها مشكلة **مواءمة**، مهما بدت مشغولة.',
      'يمكن أن يحمل الهدف التنفيذي **معادلة قياس** تظهر في بطاقة المؤشر عند التصدير.',
    ],
  },
  {
    key: 'reports',
    en: 'Reports',
    ar: 'التقارير',
    bodyEn: [
      'Reports **export**; they do not display. The Dashboard and KPI pages are where you look at data on screen. Reports are for producing a document to send, print, or present.',
      'Four reports: **Department Alignment** (how things stand), the **Weekly Report** (what moved this week), **KPI Scorecards** (one branded card per indicator), and **Employee Performance**.',
      'Choose the **language at export**, not before: a report is either Arabic or English, never a bilingual hybrid. Export twice if you need both.',
      'Your header and footer text are remembered per language. Set them once.',
      'What you can see in a report is what you can see in the platform — reports never widen your access.',
    ],
    bodyAr: [
      'التقارير **للتصدير** لا للعرض. لوحة المعلومات وصفحة المؤشرات هما مكان مطالعة البيانات. أما التقارير فلإنتاج مستند يُرسَل أو يُطبع أو يُعرض.',
      'أربعة تقارير: **مواءمة الإدارات**، و**التقرير الأسبوعي**، و**بطاقات المؤشرات**، و**أداء الموظفين**.',
      'تُختار **اللغة عند التصدير**: التقرير إما عربي أو إنجليزي، لا خليط. صدّر مرتين إن أردت الاثنين.',
      'تُحفَظ الترويسة والتذييل لكل لغة على حدة.',
      'ما تراه في التقرير هو ما تراه في المنصة — التقارير لا توسّع صلاحياتك.',
    ],
  },
  {
    key: 'support',
    en: 'Getting help',
    ar: 'طلب المساعدة',
    bodyEn: [
      'Settings → **Tech support** → New request. Answer the three questions and, if you can, attach a screenshot — it is the single most useful thing you can send.',
      'Your page, browser, role and department are attached automatically. You do not need to describe your setup.',
      'You will get a notification when your request is answered. A request is closed with a reply; if you are still stuck afterwards, file a new one.',
    ],
    bodyAr: [
      'الإعدادات ← **الدعم الفني** ← طلب جديد. أجب عن الأسئلة الثلاثة، وأرفق صورة للشاشة إن أمكن — فهي أكثر ما يساعدنا.',
      'تُرفق صفحتك ومتصفحك ودورك وإدارتك تلقائيًا. لا داعي لوصف جهازك.',
      'سيصلك إشعار عند الرد. يُغلَق الطلب بالرد؛ وإن بقيت المشكلة، افتح طلبًا جديدًا.',
    ],
  },
];

export function HowToUse({ ar }: { ar: boolean }) {
  const [open, setOpen] = useState<string | null>('roles');

  return (
    <div className="space-y-2">
      {DOCS.map((d) => {
        const isOpen = open === d.key;
        const body = ar ? d.bodyAr : d.bodyEn;
        return (
          <div key={d.key} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <button
              onClick={() => setOpen(isOpen ? null : d.key)}
              className="w-full flex items-center justify-between px-5 py-3 text-start hover:bg-slate-50"
            >
              <span className="text-sm font-medium">{ar ? d.ar : d.en}</span>
              <ChevronDown
                className={'h-4 w-4 text-slate-400 transition-transform ' + (isOpen ? 'rotate-180' : '')}
              />
            </button>
            {isOpen && (
              <div className="px-5 pb-4 space-y-3">
                {body.map((p, i) => (
                  <p
                    key={i}
                    className="text-sm text-slate-600 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: bold(p) }}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// **text** -> <strong>text</strong>
function bold(s: string): string {
  return s.replace(/\*\*(.+?)\*\*/g, '<strong class="text-slate-900 font-medium">$1</strong>');
}
