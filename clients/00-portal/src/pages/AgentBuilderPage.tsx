import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import {
  ChevronRight,
  ChevronLeft,
  Check,
  Bot,
  Lightbulb,
  Sparkles,
  Save,
} from 'lucide-react';
import api from '../lib/api';

// ── Types ───────────────────────────────────────────────────────────────────────

interface RoleTemplate {
  emoji: string;
  name: string;
  description: string;
  defaultSkills: string[];
  suggestedColor: string;
  suggestedIcon: string;
}

interface Skill {
  id: string;
  label: string;
  description: string;
  category: string;
}

interface SkillCategory {
  emoji: string;
  label: string;
  skills: Skill[];
}

interface BuilderState {
  selectedRole: string | null;
  name: string;
  description: string;
  color: string;
  icon: string;
  provider: string;
  selectedSkills: string[];
  customInstructions: string;
  systemPrompt: string;
  promptEdited: boolean;
}

// ── Constants ────────────────────────────────────────────────────────────────────

const ROLE_TEMPLATES: RoleTemplate[] = [
  {
    emoji: '🔬',
    name: 'מנתח פיננסי',
    description: 'מומחה לדוחות כספיים, תזרים ורווחיות',
    defaultSkills: ['financial_reporting', 'vat_management', 'budget_analysis', 'cash_flow'],
    suggestedColor: 'blue',
    suggestedIcon: '🔬',
  },
  {
    emoji: '💼',
    name: 'מנהל מכירות',
    description: 'עוקב אחר לקוחות, הצעות מחיר והזמנות',
    defaultSkills: ['invoice_management', 'quote_management', 'customer_insights', 'sales_forecasting'],
    suggestedColor: 'green',
    suggestedIcon: '💼',
  },
  {
    emoji: '📦',
    name: 'מנהל מלאי',
    description: 'מנטר מלאי, הזמנות חוסר וספקים',
    defaultSkills: ['stock_monitoring', 'supplier_management', 'goods_receipt'],
    suggestedColor: 'orange',
    suggestedIcon: '📦',
  },
  {
    emoji: '👥',
    name: 'מנהל משאבי אנוש',
    description: 'מנהל שכר, נוכחות וחופשות',
    defaultSkills: ['payroll_calculation', 'attendance_monitoring', 'leave_management', 'employee_analytics'],
    suggestedColor: 'purple',
    suggestedIcon: '👥',
  },
  {
    emoji: '🛒',
    name: 'מנהל רכש',
    description: 'עוקב אחר ספקים, חשבוניות וקבלת סחורה',
    defaultSkills: ['supplier_management', 'goods_receipt', 'invoice_management'],
    suggestedColor: 'red',
    suggestedIcon: '🛒',
  },
  {
    emoji: '🤝',
    name: 'יועץ לקוחות',
    description: 'מומחה ל-CRM ושביעות רצון לקוחות',
    defaultSkills: ['customer_insights', 'quote_management', 'sales_forecasting'],
    suggestedColor: 'green',
    suggestedIcon: '🤝',
  },
  {
    emoji: '📊',
    name: 'אנליסט עסקי',
    description: 'מנתח מגמות, KPI ותחזיות',
    defaultSkills: ['financial_reporting', 'sales_forecasting', 'budget_analysis', 'report_generation'],
    suggestedColor: 'blue',
    suggestedIcon: '📊',
  },
  {
    emoji: '⚙️',
    name: 'סוכן מותאם',
    description: 'צור סוכן מאפס לפי הצרכים שלך',
    defaultSkills: ['data_search', 'report_generation'],
    suggestedColor: 'blue',
    suggestedIcon: '⚙️',
  },
];

const SKILL_CATEGORIES: SkillCategory[] = [
  {
    emoji: '📊',
    label: 'ניתוח פיננסי',
    skills: [
      { id: 'financial_reporting', label: 'דוחות פיננסיים', description: 'ניתוח דוחות רווח והפסד, מאזן ותזרים מזומנים', category: 'financial' },
      { id: 'vat_management', label: 'ניהול מע"מ', description: 'חישוב וניתוח דוחות מע"מ ועסקאות', category: 'financial' },
      { id: 'budget_analysis', label: 'ניתוח תקציב', description: 'השוואת תקציב מול ביצוע וניתוח חריגות', category: 'financial' },
      { id: 'cash_flow', label: 'תזרים מזומנים', description: 'תחזית תזרים ומעקב נזילות', category: 'financial' },
    ],
  },
  {
    emoji: '💰',
    label: 'מכירות ולקוחות',
    skills: [
      { id: 'invoice_management', label: 'ניהול חשבוניות', description: 'יצירה, מעקב וניהול חשבוניות מכירה', category: 'sales' },
      { id: 'quote_management', label: 'ניהול הצעות מחיר', description: 'ניהול הצעות מחיר ומעקב המרות', category: 'sales' },
      { id: 'customer_insights', label: 'תובנות לקוחות', description: 'ניתוח דפוסי קנייה ושביעות רצון לקוחות', category: 'sales' },
      { id: 'sales_forecasting', label: 'תחזיות מכירות', description: 'תחזיות מכירות ומגמות עסקיות', category: 'sales' },
    ],
  },
  {
    emoji: '📦',
    label: 'מלאי ורכש',
    skills: [
      { id: 'stock_monitoring', label: 'מעקב מלאי', description: 'מעקב רמות מלאי והתראות חוסר', category: 'inventory' },
      { id: 'supplier_management', label: 'ניהול ספקים', description: 'ניהול ספקים, הזמנות וחשבוניות', category: 'inventory' },
      { id: 'goods_receipt', label: 'קבלת סחורה', description: 'תיעוד ובקרת קבלת סחורה', category: 'inventory' },
      { id: 'rfid_tracking', label: 'מעקב RFID', description: 'מעקב מלאי ונכסים באמצעות RFID', category: 'inventory' },
    ],
  },
  {
    emoji: '👥',
    label: 'משאבי אנוש',
    skills: [
      { id: 'payroll_calculation', label: 'חישוב שכר', description: 'חישוב שכר ישראלי, מס הכנסה וביטוח לאומי', category: 'hr' },
      { id: 'attendance_monitoring', label: 'מעקב נוכחות', description: 'מעקב נוכחות, שעות עבודה וחריגות', category: 'hr' },
      { id: 'leave_management', label: 'ניהול חופשות', description: 'ניהול בקשות חופשה ומחלה', category: 'hr' },
      { id: 'employee_analytics', label: 'אנליטיקת עובדים', description: 'ניתוח נתוני עובדים ומדדי HR', category: 'hr' },
    ],
  },
  {
    emoji: '🔧',
    label: 'כלליים',
    skills: [
      { id: 'data_search', label: 'חיפוש נתונים', description: 'חיפוש וסינון נתונים בכל מודולי המערכת', category: 'general' },
      { id: 'report_generation', label: 'יצירת דוחות', description: 'יצירת דוחות מותאמים אישית ופעולות ייצוא', category: 'general' },
      { id: 'alert_management', label: 'ניהול התראות', description: 'הגדרה ומעקב אחר התראות אוטומטיות', category: 'general' },
      { id: 'task_automation', label: 'אוטומציה', description: 'הגדרת תהליכים אוטומטיים וזרימות עבודה', category: 'general' },
    ],
  },
];

// Flat map for quick description lookup
const SKILLS_MAP: Record<string, string> = {};
SKILL_CATEGORIES.forEach(cat => {
  cat.skills.forEach(s => {
    SKILLS_MAP[s.id] = s.description;
  });
});

const COLOR_OPTIONS = [
  { value: 'blue',   bg: 'bg-blue-500',   ring: 'ring-blue-400' },
  { value: 'green',  bg: 'bg-green-500',  ring: 'ring-green-400' },
  { value: 'purple', bg: 'bg-purple-500', ring: 'ring-purple-400' },
  { value: 'orange', bg: 'bg-orange-500', ring: 'ring-orange-400' },
  { value: 'red',    bg: 'bg-red-500',    ring: 'ring-red-400' },
];

const PROVIDERS = [
  { value: '',          label: 'ברירת מחדל' },
  { value: 'openai',    label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'gemini',    label: 'Gemini' },
];

const STEP_LABELS = [
  'בחר תפקיד',
  'הגדר סוכן',
  'יכולות',
  'סקירה ושמירה',
];

// ── Helpers ──────────────────────────────────────────────────────────────────────

function colorIconClasses(color?: string): string {
  switch (color) {
    case 'blue':   return 'bg-blue-100 text-blue-600';
    case 'green':  return 'bg-green-100 text-green-600';
    case 'purple': return 'bg-purple-100 text-purple-600';
    case 'orange': return 'bg-orange-100 text-orange-600';
    case 'red':    return 'bg-red-100 text-red-600';
    default:       return 'bg-slate-100 text-slate-600';
  }
}

function generateSystemPrompt(roleName: string, skills: string[], customInstructions: string): string {
  const skillDescriptions = skills.map(s => SKILLS_MAP[s]).filter(Boolean);
  return `אתה ${roleName} AI מתקדם של מערכת ה-ERP.

תפקידך:
${skillDescriptions.map(d => `• ${d}`).join('\n')}

הנחיות כלליות:
• תמיד השב בעברית
• בסס תשובות על נתוני המערכת בלבד
• ציין מקורות ותאריכים בכל תשובה
• כשאין לך מידע מספיק, ציין זאת בבירור${customInstructions ? `\n\nהוראות נוספות:\n${customInstructions}` : ''}`;
}

const INITIAL_STATE: BuilderState = {
  selectedRole: null,
  name: '',
  description: '',
  color: 'blue',
  icon: '🤖',
  provider: '',
  selectedSkills: [],
  customInstructions: '',
  systemPrompt: '',
  promptEdited: false,
};

// ── Step Indicator ────────────────────────────────────────────────────────────────

function StepIndicator({
  current,
  completed,
  onJump,
}: {
  current: number;
  completed: number[];
  onJump: (step: number) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8 select-none">
      {STEP_LABELS.map((label, idx) => {
        const stepNum = idx + 1;
        const isActive = stepNum === current;
        const isDone = completed.includes(stepNum);
        const canJump = isDone && stepNum !== current;

        return (
          <div key={stepNum} className="flex items-center">
            {/* Circle */}
            <button
              type="button"
              disabled={!isDone && !isActive}
              onClick={() => canJump && onJump(stepNum)}
              className={`flex flex-col items-center gap-1 group ${canJump ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <span
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all
                  ${isActive
                    ? 'border-blue-600 bg-blue-600 text-white shadow-md shadow-blue-200'
                    : isDone
                      ? 'border-green-500 bg-green-500 text-white'
                      : 'border-slate-200 bg-white text-slate-400'
                  }
                  ${canJump ? 'group-hover:scale-105' : ''}
                `}
              >
                {isDone && !isActive ? <Check className="w-4 h-4" /> : stepNum}
              </span>
              <span
                className={`text-xs font-medium hidden sm:block transition-colors
                  ${isActive ? 'text-blue-600' : isDone ? 'text-green-600' : 'text-slate-400'}
                `}
              >
                {label}
              </span>
            </button>

            {/* Connector line */}
            {idx < STEP_LABELS.length - 1 && (
              <div
                className={`h-0.5 w-8 sm:w-16 mx-1 transition-colors ${
                  completed.includes(stepNum) ? 'bg-green-400' : 'bg-slate-200'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Step 1: Choose Role ───────────────────────────────────────────────────────────

function Step1ChooseRole({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (role: RoleTemplate) => void;
}) {
  return (
    <div>
      <h2 className="text-xl font-bold text-slate-800 mb-1">בחר תפקיד לסוכן</h2>
      <p className="text-sm text-slate-500 mb-6">
        בחר תבנית מוכנה או צור סוכן מאפס. ניתן לשנות את כל ההגדרות בהמשך.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {ROLE_TEMPLATES.map(role => {
          const isSelected = selected === role.name;
          return (
            <button
              key={role.name}
              type="button"
              onClick={() => onSelect(role)}
              className={`text-right p-4 rounded-2xl border-2 transition-all hover:shadow-md group
                ${isSelected
                  ? 'border-blue-500 bg-blue-50 shadow-md shadow-blue-100'
                  : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50'
                }
              `}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`text-2xl w-11 h-11 flex items-center justify-center rounded-xl shrink-0 transition-colors
                    ${isSelected ? 'bg-blue-100' : 'bg-slate-100 group-hover:bg-blue-50'}
                  `}
                >
                  {role.emoji}
                </span>
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold text-sm leading-tight ${isSelected ? 'text-blue-700' : 'text-slate-800'}`}>
                    {role.name}
                  </p>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">{role.description}</p>
                </div>
              </div>
              {isSelected && (
                <div className="mt-3 flex items-center gap-1 text-blue-600">
                  <Check className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium">נבחר</span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Step 2: Configure ─────────────────────────────────────────────────────────────

function Step2Configure({
  state,
  onChange,
}: {
  state: BuilderState;
  onChange: (partial: Partial<BuilderState>) => void;
}) {
  return (
    <div className="max-w-xl mx-auto">
      <h2 className="text-xl font-bold text-slate-800 mb-1">הגדר את הסוכן</h2>
      <p className="text-sm text-slate-500 mb-6">תן שם לסוכן, תיאור קצר, והגדר את הצבע והספק המועדפים.</p>

      <div className="flex flex-col gap-5">

        {/* Name */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700">
            שם הסוכן <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={state.name}
            onChange={e => onChange({ name: e.target.value })}
            placeholder='לדוגמה: "מנהל מכירות AI"'
            className="border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition"
          />
        </div>

        {/* Description */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700">תיאור קצר</label>
          <textarea
            rows={2}
            value={state.description}
            onChange={e => onChange({ description: e.target.value })}
            placeholder="תאר בקצרה את המומחיות של הסוכן"
            className="border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent resize-none transition"
          />
        </div>

        {/* Icon + Color */}
        <div className="flex gap-5 items-end">
          {/* Icon */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700">אייקון</label>
            <div className="flex items-center gap-2">
              <span className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${colorIconClasses(state.color)}`}>
                {state.icon}
              </span>
              <input
                type="text"
                value={state.icon}
                onChange={e => onChange({ icon: e.target.value.slice(-2) || '🤖' })}
                maxLength={2}
                className="w-16 border border-slate-200 rounded-lg px-2 py-2 text-xl text-center focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="🤖"
              />
            </div>
          </div>

          {/* Color */}
          <div className="flex flex-col gap-1.5 flex-1">
            <label className="text-sm font-medium text-slate-700">צבע</label>
            <div className="flex items-center gap-3 mt-1">
              {COLOR_OPTIONS.map(c => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => onChange({ color: c.value })}
                  className={`w-9 h-9 rounded-full ${c.bg} transition-transform
                    ${state.color === c.value
                      ? `ring-2 ring-offset-2 ${c.ring} scale-110`
                      : 'hover:scale-105 opacity-70 hover:opacity-100'
                    }
                  `}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Provider */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700">ספק AI מועדף</label>
          <select
            value={state.provider}
            onChange={e => onChange({ provider: e.target.value })}
            className="border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white transition"
          >
            {PROVIDERS.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

// ── Step 3: Skills ────────────────────────────────────────────────────────────────

function Step3Skills({
  state,
  onChange,
}: {
  state: BuilderState;
  onChange: (partial: Partial<BuilderState>) => void;
}) {
  const toggleSkill = (skillId: string) => {
    const current = state.selectedSkills;
    const next = current.includes(skillId)
      ? current.filter(s => s !== skillId)
      : [...current, skillId];

    // Auto-regenerate prompt unless manually edited
    const newPrompt = !state.promptEdited
      ? generateSystemPrompt(state.name || 'הסוכן', next, state.customInstructions)
      : state.systemPrompt;

    onChange({ selectedSkills: next, systemPrompt: newPrompt });
  };

  const handleCustomInstructions = (val: string) => {
    const newPrompt = !state.promptEdited
      ? generateSystemPrompt(state.name || 'הסוכן', state.selectedSkills, val)
      : state.systemPrompt;
    onChange({ customInstructions: val, systemPrompt: newPrompt });
  };

  const handlePromptEdit = (val: string) => {
    onChange({ systemPrompt: val, promptEdited: true });
  };

  const handleRegenerate = () => {
    const newPrompt = generateSystemPrompt(state.name || 'הסוכן', state.selectedSkills, state.customInstructions);
    onChange({ systemPrompt: newPrompt, promptEdited: false });
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-slate-800 mb-1">הגדר יכולות</h2>
      <p className="text-sm text-slate-500 mb-4">
        סמן את היכולות שהסוכן יצטרך. הפרומט יווצר אוטומטית.
      </p>

      {/* Tip box */}
      <div className="flex gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5">
        <Lightbulb className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700 leading-relaxed">
          <strong>מהו System Prompt?</strong> הוראות שנשלחות לסוכן AI לפני כל שיחה. הן מגדירות את זהות הסוכן, מה הוא יכול לעשות ואיך הוא אמור להתנהג. כאשר תסמן יכולות, הפרומט ייווצר אוטומטית עבורך.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">

        {/* Left: Skills checklist */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-col gap-5">
            {SKILL_CATEGORIES.map(cat => (
              <div key={cat.label}>
                <h3 className="text-sm font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
                  <span>{cat.emoji}</span>
                  <span>{cat.label}</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {cat.skills.map(skill => {
                    const checked = state.selectedSkills.includes(skill.id);
                    return (
                      <label
                        key={skill.id}
                        className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all
                          ${checked
                            ? 'border-blue-300 bg-blue-50'
                            : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50'
                          }
                        `}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSkill(skill.id)}
                          className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-400 shrink-0"
                        />
                        <div className="min-w-0">
                          <p className={`text-sm font-medium leading-tight ${checked ? 'text-blue-700' : 'text-slate-700'}`}>
                            {skill.label}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{skill.description}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Custom instructions */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-700">הוראות נוספות (אופציונלי)</label>
              <textarea
                rows={3}
                value={state.customInstructions}
                onChange={e => handleCustomInstructions(e.target.value)}
                placeholder="הוסף הוראות ספציפיות לסוכן זה..."
                className="border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none transition"
              />
            </div>
          </div>
        </div>

        {/* Right: System prompt preview */}
        <div className="lg:w-80 shrink-0">
          <div className="sticky top-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-blue-500" />
                System Prompt
              </h3>
              <div className="flex items-center gap-2">
                {state.promptEdited && (
                  <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                    נערך ידנית
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleRegenerate}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors"
                >
                  {state.promptEdited ? 'אפס לאוטומטי' : 'צור מחדש'}
                </button>
              </div>
            </div>
            <textarea
              rows={20}
              value={state.systemPrompt || (state.selectedSkills.length === 0
                ? '← סמן יכולות כדי לייצר את הפרומט אוטומטית'
                : ''
              )}
              onChange={e => handlePromptEdit(e.target.value)}
              dir="rtl"
              className="w-full bg-slate-900 text-green-300 font-mono text-xs rounded-xl px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed"
              placeholder="← סמן יכולות כדי לייצר את הפרומט אוטומטית"
            />
            <p className="text-xs text-slate-400 mt-1.5">
              {state.selectedSkills.length} יכולות נבחרו
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Step 4: Review & Save ──────────────────────────────────────────────────────────

function Step4Review({
  state,
  onSystemPromptChange,
  onSave,
  onBack,
  isSaving,
  error,
}: {
  state: BuilderState;
  onSystemPromptChange: (val: string) => void;
  onSave: () => void;
  onBack: () => void;
  isSaving: boolean;
  error: string;
}) {
  const allSkillsFlat: Skill[] = SKILL_CATEGORIES.flatMap(c => c.skills);

  return (
    <div>
      <h2 className="text-xl font-bold text-slate-800 mb-1">סקירה ושמירה</h2>
      <p className="text-sm text-slate-500 mb-6">בדוק את הגדרות הסוכן לפני השמירה.</p>

      <div className="flex flex-col lg:flex-row gap-6">

        {/* Summary card */}
        <div className="flex-1 min-w-0 flex flex-col gap-5">

          {/* Profile preview */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-start gap-4">
              <span className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0 ${colorIconClasses(state.color)}`}>
                {state.icon}
              </span>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-slate-800 text-lg">{state.name}</h3>
                {state.description && (
                  <p className="text-sm text-slate-500 mt-0.5">{state.description}</p>
                )}
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {state.selectedRole && (
                    <span className="text-xs bg-blue-50 text-blue-600 border border-blue-100 px-2.5 py-0.5 rounded-full font-medium">
                      {state.selectedRole}
                    </span>
                  )}
                  {state.provider && (
                    <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-full font-mono">
                      {state.provider}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Selected skills */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h4 className="text-sm font-semibold text-slate-700 mb-3">
              יכולות שנבחרו ({state.selectedSkills.length})
            </h4>
            {state.selectedSkills.length === 0 ? (
              <p className="text-sm text-slate-400">לא נבחרו יכולות</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {state.selectedSkills.map(skillId => {
                  const skill = allSkillsFlat.find(s => s.id === skillId);
                  return skill ? (
                    <span
                      key={skillId}
                      className="text-xs bg-blue-50 text-blue-700 border border-blue-100 px-2.5 py-1 rounded-full font-medium"
                    >
                      {skill.label}
                    </span>
                  ) : null;
                })}
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* System prompt (editable) */}
        <div className="lg:w-96 shrink-0 flex flex-col gap-2">
          <label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-blue-500" />
            System Prompt הסופי
          </label>
          <p className="text-xs text-slate-400">ניתן לערוך לפני השמירה</p>
          <textarea
            rows={18}
            value={state.systemPrompt}
            onChange={e => onSystemPromptChange(e.target.value)}
            dir="rtl"
            className="w-full bg-slate-900 text-green-300 font-mono text-xs rounded-xl px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed"
          />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-between mt-8 pt-5 border-t border-slate-100">
        <button
          type="button"
          onClick={onBack}
          disabled={isSaving}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors disabled:opacity-50"
        >
          <ChevronRight className="w-4 h-4" />
          חזור ועדכן
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving || !state.name.trim()}
          className="flex items-center gap-2 px-7 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-md shadow-blue-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? (
            <>
              <span className="animate-spin text-base">⏳</span>
              שומר...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              שמור סוכן
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ── Nav Bar (Next / Back) ─────────────────────────────────────────────────────────

function NavButtons({
  step,
  onNext,
  onBack,
  nextDisabled,
  nextLabel,
}: {
  step: number;
  onNext: () => void;
  onBack: () => void;
  nextDisabled?: boolean;
  nextLabel?: string;
}) {
  if (step === 4) return null; // Step 4 has its own buttons

  return (
    <div className="flex items-center justify-between mt-8 pt-5 border-t border-slate-100">
      <button
        type="button"
        onClick={onBack}
        disabled={step === 1}
        className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <ChevronRight className="w-4 h-4" />
        חזור
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled}
        className="flex items-center gap-2 px-7 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-md shadow-blue-100 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {nextLabel ?? 'הבא'}
        <ChevronLeft className="w-4 h-4" />
      </button>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────────

export default function AgentBuilderPage() {
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [completed, setCompleted] = useState<number[]>([]);
  const [builderState, setBuilderState] = useState<BuilderState>(INITIAL_STATE);
  const [saveError, setSaveError] = useState('');

  const completeStep = (s: number) => {
    setCompleted(prev => prev.includes(s) ? prev : [...prev, s]);
  };

  const patchState = (partial: Partial<BuilderState>) => {
    setBuilderState(prev => ({ ...prev, ...partial }));
  };

  // Auto-generate prompt when name changes (unless manually edited)
  const handleNameChange = (name: string) => {
    const newPrompt = !builderState.promptEdited
      ? generateSystemPrompt(name, builderState.selectedSkills, builderState.customInstructions)
      : builderState.systemPrompt;
    patchState({ name, systemPrompt: newPrompt });
  };

  // Handlers per step
  const handleRoleSelect = (role: RoleTemplate) => {
    const prompt = generateSystemPrompt(role.name + ' AI', role.defaultSkills, '');
    patchState({
      selectedRole: role.name,
      name: role.name + ' AI',
      description: role.description,
      icon: role.suggestedIcon,
      color: role.suggestedColor,
      selectedSkills: role.defaultSkills,
      systemPrompt: prompt,
      promptEdited: false,
    });
    // Immediately advance
    completeStep(1);
    setStep(2);
  };

  const handleNext = () => {
    if (step === 2) {
      if (!builderState.name.trim()) return;
      completeStep(2);
      setStep(3);
    } else if (step === 3) {
      completeStep(3);
      setStep(4);
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleJump = (target: number) => {
    setStep(target);
  };

  // Decide step-specific next disabled
  const nextDisabled = useMemo(() => {
    if (step === 1) return !builderState.selectedRole;
    if (step === 2) return !builderState.name.trim();
    return false;
  }, [step, builderState]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: () =>
      api.post('/agents/profiles', {
        name: builderState.name,
        description: builderState.description,
        systemPrompt: builderState.systemPrompt,
        icon: builderState.icon,
        color: builderState.color,
        provider: builderState.provider,
        isDefault: false,
        domain: builderState.selectedRole ?? undefined,
      }),
    onSuccess: () => {
      navigate('/agents/profiles');
    },
    onError: () => {
      setSaveError('שגיאה בשמירת הסוכן. אנא נסה שוב.');
    },
  });

  const handleSave = () => {
    setSaveError('');
    if (!builderState.name.trim()) {
      setSaveError('שם הסוכן הוא שדה חובה.');
      return;
    }
    if (!builderState.systemPrompt.trim()) {
      setSaveError('הפרומט ריק. אנא בחר יכולות או כתוב פרומט ידנית.');
      return;
    }
    saveMutation.mutate();
  };

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">

        {/* Page header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-200">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">בניית סוכן AI</h1>
              <p className="text-sm text-slate-500">אשף שלב-אחר-שלב ליצירת סוכן מותאם אישית</p>
            </div>
          </div>
        </div>

        {/* Step indicator */}
        <StepIndicator
          current={step}
          completed={completed}
          onJump={handleJump}
        />

        {/* Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">

          {/* Step content */}
          {step === 1 && (
            <Step1ChooseRole
              selected={builderState.selectedRole}
              onSelect={handleRoleSelect}
            />
          )}

          {step === 2 && (
            <Step2Configure
              state={builderState}
              onChange={partial => {
                if ('name' in partial && typeof partial.name === 'string') {
                  handleNameChange(partial.name);
                  const { name: _n, ...rest } = partial;
                  if (Object.keys(rest).length) patchState(rest);
                } else {
                  patchState(partial);
                }
              }}
            />
          )}

          {step === 3 && (
            <Step3Skills
              state={builderState}
              onChange={patchState}
            />
          )}

          {step === 4 && (
            <Step4Review
              state={builderState}
              onSystemPromptChange={val => patchState({ systemPrompt: val, promptEdited: true })}
              onSave={handleSave}
              onBack={() => setStep(3)}
              isSaving={saveMutation.isPending}
              error={saveError}
            />
          )}

          {/* Navigation buttons (not shown on step 1 since clicking a card advances, or step 4 which has its own) */}
          {step !== 1 && (
            <NavButtons
              step={step}
              onNext={handleNext}
              onBack={handleBack}
              nextDisabled={nextDisabled}
              nextLabel={step === 3 ? 'לסקירה' : 'הבא'}
            />
          )}
        </div>

        {/* Bottom cancel link */}
        <div className="text-center mt-4">
          <button
            type="button"
            onClick={() => navigate('/agents/profiles')}
            className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
          >
            ביטול — חזור לרשימת הסוכנים
          </button>
        </div>
      </div>
    </div>
  );
}
