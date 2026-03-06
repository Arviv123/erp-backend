import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { MessageCircle, Mail, Smartphone, Send, Search, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import api from '../lib/api';

type Channel = 'whatsapp' | 'email' | 'sms';

const STATUS_LABELS: Record<string, string> = {
  QUEUED: 'בתור',
  SENT: 'נשלח',
  DELIVERED: 'נמסר',
  READ: 'נקרא',
  FAILED: 'נכשל',
};

const STATUS_COLORS: Record<string, string> = {
  QUEUED: 'bg-yellow-100 text-yellow-700',
  SENT: 'bg-blue-100 text-blue-700',
  DELIVERED: 'bg-green-100 text-green-700',
  READ: 'bg-emerald-100 text-emerald-700',
  FAILED: 'bg-red-100 text-red-700',
};

const MESSAGE_TYPE_LABELS: Record<string, string> = {
  INVOICE: 'חשבונית',
  PAYMENT_REMINDER: 'תזכורת תשלום',
  QUOTE: 'הצעת מחיר',
  PAYMENT_LINK: 'קישור תשלום',
  GENERAL: 'כללי',
};

const TEMPLATES = {
  whatsapp: [
    { label: 'תזכורת חשבונית', text: 'שלום {שם}, נשמח לקבל תשלום עבור חשבונית {מספר} בסך ₪{סכום}. תודה!' },
    { label: 'אישור הזמנה', text: 'שלום {שם}, הזמנתך {מספר} התקבלה. נעדכן אותך על מצב המשלוח.' },
    { label: 'הודעה כללית', text: '' },
  ],
  email: [
    { label: 'שליחת חשבונית', text: 'בקובץ המצורף תמצאו את חשבונית מספר {מספר}.' },
    { label: 'הצעת מחיר', text: 'בקובץ המצורף תמצאו הצעת מחיר.' },
    { label: 'הודעה כללית', text: '' },
  ],
  sms: [
    { label: 'תזכורת תשלום', text: 'תזכורת: חשבונית {מספר} בסך ₪{סכום} ממתינה לתשלום.' },
    { label: 'אישור פגישה', text: 'תאום פגישה ל{תאריך} בשעה {שעה}. אנא אשר/י.' },
  ],
};

const CHANNEL_TABS = [
  { id: 'whatsapp' as Channel, label: 'WhatsApp', icon: MessageCircle, color: 'text-green-600' },
  { id: 'email' as Channel, label: 'אימייל', icon: Mail, color: 'text-blue-600' },
  { id: 'sms' as Channel, label: 'SMS', icon: Smartphone, color: 'text-purple-600' },
];

export default function NotificationsPage() {
  const [tab, setTab] = useState<Channel>('whatsapp');
  const [recipient, setRecipient] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [search, setSearch] = useState('');

  const { data: customers = [] } = useQuery({
    queryKey: ['customers-search', search],
    queryFn: () =>
      search.length > 1
        ? api.get('/crm/customers', { params: { search, pageSize: 8 } }).then(r => r.data?.data ?? r.data ?? [])
        : Promise.resolve([]),
    enabled: search.length > 1,
  });

  // WhatsApp sent history
  const { data: whatsappLogs, refetch: refetchLogs } = useQuery({
    queryKey: ['whatsapp-logs'],
    queryFn: async () => {
      const r = await api.get('/whatsapp/logs', { params: { page: 1, limit: 25 } });
      return r.data?.data ?? [];
    },
    enabled: tab === 'whatsapp',
  });

  const send = useMutation({
    mutationFn: () => {
      if (tab === 'whatsapp') {
        // POST /api/whatsapp/send/custom — body: { phone, message, refId? }
        return api.post('/whatsapp/send/custom', { phone, message: body });
      } else if (tab === 'email') {
        // POST /api/notifications — create an EMAIL channel notification
        return api.post('/notifications', {
          type: 'SYSTEM',
          channel: 'EMAIL',
          title: subject || 'הודעה',
          body,
          data: { to: email },
        });
      } else {
        // POST /api/notifications — create an SMS channel notification
        return api.post('/notifications', {
          type: 'SYSTEM',
          channel: 'SMS',
          title: 'הודעת SMS',
          body,
          data: { to: phone },
        });
      }
    },
    onSuccess: () => {
      setStatus('success');
      setBody('');
      setSubject('');
      if (tab === 'whatsapp') refetchLogs();
      setTimeout(() => setStatus('idle'), 3000);
    },
    onError: (e: any) => {
      setStatus('error');
      setErrorMsg(e?.response?.data?.error ?? 'שגיאה בשליחה');
      setTimeout(() => setStatus('idle'), 4000);
    },
  });

  const isSendDisabled =
    send.isPending ||
    !body ||
    (tab === 'email' ? !email : !phone);

  const logs: any[] = Array.isArray(whatsappLogs) ? whatsappLogs : [];

  return (
    <div className="space-y-6 max-w-3xl" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <MessageCircle className="w-6 h-6 text-green-600" />
          הודעות ועדכונים
        </h1>
        <p className="text-sm text-gray-500 mt-1">שלח הודעות ללקוחות וספקים דרך WhatsApp, אימייל ו-SMS</p>
      </div>

      {/* Channel tabs */}
      <div className="flex gap-0 border-b border-gray-200">
        {CHANNEL_TABS.map(ch => {
          const Icon = ch.icon;
          return (
            <button
              key={ch.id}
              onClick={() => setTab(ch.id)}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 transition ${
                tab === ch.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon size={16} className={tab === ch.id ? ch.color : ''} />
              {ch.label}
            </button>
          );
        })}
      </div>

      {/* Send form */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">

        {/* Recipient search */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">חפש לקוח/ספק</label>
          <div className="relative">
            <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="הקלד שם לקוח..."
              className="border border-gray-300 rounded-lg pr-9 pl-3 py-2 text-sm w-full focus:ring-2 focus:ring-blue-500 outline-none"
            />
            {(customers as any[]).length > 0 && search && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-40 overflow-y-auto">
                {(customers as any[]).slice(0, 8).map((c: any) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setRecipient(c.name);
                      setPhone(c.phone ?? '');
                      setEmail(c.email ?? '');
                      setSearch('');
                    }}
                    className="w-full text-right px-3 py-2 text-sm hover:bg-blue-50 flex items-center justify-between"
                  >
                    <span>{c.name}</span>
                    <span className="text-xs text-gray-400">{c.phone ?? c.email ?? ''}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {recipient && (
            <p className="text-xs text-green-600 mt-1 font-medium">נבחר: {recipient}</p>
          )}
        </div>

        {/* Phone field — WhatsApp & SMS */}
        {(tab === 'whatsapp' || tab === 'sms') && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">מספר טלפון</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="050-1234567 או +972501234567"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:ring-2 focus:ring-blue-500 outline-none"
              dir="ltr"
            />
          </div>
        )}

        {/* Email fields */}
        {tab === 'email' && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">אימייל</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="example@domain.com"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:ring-2 focus:ring-blue-500 outline-none"
                dir="ltr"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">נושא</label>
              <input
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="נושא ההודעה"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </>
        )}

        {/* Quick templates */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">תבניות מהירות</label>
          <div className="flex flex-wrap gap-2">
            {TEMPLATES[tab].map(t => (
              <button
                key={t.label}
                onClick={() => setBody(t.text)}
                className="text-xs bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-200 transition"
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Message body */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">תוכן ההודעה</label>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={4}
            placeholder="כתוב את ההודעה כאן..."
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:ring-2 focus:ring-blue-500 outline-none resize-none"
          />
          <p className="text-xs text-gray-400 mt-0.5">{body.length} / 4096 תווים</p>
        </div>

        {/* Status feedback */}
        {status === 'success' && (
          <div className="flex items-center gap-2 text-green-700 text-sm bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            <CheckCircle2 size={16} /> ההודעה נשלחה בהצלחה
          </div>
        )}
        {status === 'error' && (
          <div className="flex items-center gap-2 text-red-700 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <AlertCircle size={16} /> {errorMsg}
          </div>
        )}

        {/* Send button */}
        <button
          onClick={() => send.mutate()}
          disabled={isSendDisabled}
          className="w-full bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-40 transition"
        >
          <Send size={16} />
          {send.isPending
            ? 'שולח...'
            : `שלח ב${tab === 'whatsapp' ? 'WhatsApp' : tab === 'email' ? 'אימייל' : 'SMS'}`}
        </button>
      </div>

      {/* WhatsApp sent history */}
      {tab === 'whatsapp' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            <Clock size={14} className="text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-700">היסטוריית שליחה — WhatsApp</h2>
          </div>

          {logs.length === 0 ? (
            <div className="py-10 text-center text-gray-400 text-sm">אין הודעות שנשלחו</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">זמן</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">טלפון</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">סוג</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">סטטוס</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">הודעה</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {logs.map((log: any) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                      {new Date(log.createdAt ?? log.sentAt ?? '').toLocaleString('he-IL')}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-700 font-mono" dir="ltr">
                      {log.phone ?? log.to ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-600">
                      {MESSAGE_TYPE_LABELS[log.messageType] ?? log.messageType ?? '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[log.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {STATUS_LABELS[log.status] ?? log.status ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500 max-w-[200px] truncate">
                      {log.message ?? log.body ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
