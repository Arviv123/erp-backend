/**
 * SendDocumentModal — universal document sender
 *
 * Shows a pre-built message (editable) and lets the user choose
 * one or more send channels: WhatsApp, Email.
 *
 * Usage:
 *   <SendDocumentModal
 *     isOpen={open}
 *     onClose={() => setOpen(false)}
 *     documentType="invoice"
 *     documentId={invoice.id}
 *     documentNumber={invoice.number}
 *     recipientName={invoice.customer?.name}
 *     recipientPhone={invoice.customer?.phone}
 *     recipientEmail={invoice.customer?.email}
 *     amount={invoice.total}
 *   />
 */
import React, { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { X, MessageCircle, Mail, Send, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import api from '../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DocumentType = 'invoice' | 'quote' | 'salesOrder' | 'payslip' | 'receipt' | 'bill';

export interface SendDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentType: DocumentType;
  documentId: string;
  documentNumber?: string;
  recipientName?: string;
  recipientPhone?: string;
  recipientEmail?: string;
  amount?: number;
  /** Optional extra text to append to default message */
  extraNote?: string;
}

// ─── Label helpers ─────────────────────────────────────────────────────────────

const DOC_LABELS: Record<DocumentType, string> = {
  invoice:     'חשבונית',
  receipt:     'קבלה',
  quote:       'הצעת מחיר',
  salesOrder:  'הזמנת מכירה',
  payslip:     'תלוש שכר',
  bill:        'חשבונית ספק',
};

function buildDefaultMessage(
  type: DocumentType,
  number: string,
  recipientName: string,
  amount?: number,
): string {
  const amountStr = amount ? ` על סך ₪${Number(amount).toFixed(2)}` : '';
  const greeting  = recipientName ? `שלום ${recipientName},\n` : '';

  switch (type) {
    case 'invoice':
      return `${greeting}מצורפת חשבונית מס מספר ${number}${amountStr}.\nלפרטים נוספים אנא פנו אלינו.\nתודה על שיתוף הפעולה.`;
    case 'receipt':
      return `${greeting}מצורפת קבלה מספר ${number}${amountStr}.\nתודה על תשלומך.`;
    case 'quote':
      return `${greeting}מצורפת הצעת מחיר מספר ${number}${amountStr}.\nאנא עיינו בפרטים ויידעונו בתגובתכם.\nנשמח לענות על כל שאלה.`;
    case 'salesOrder':
      return `${greeting}הזמנתכם מספר ${number} התקבלה ומטופלת.\nנשלח עדכון בהמשך.\nתודה.`;
    case 'payslip':
      return `${greeting}מצורף תלוש שכר לחודש ${number}.\nלשאלות בנוגע לתלוש אנא פנו למחלקת HR.`;
    case 'bill':
      return `${greeting}מצורפת חשבונית ספק מספר ${number}${amountStr}.\nאנא אשרו קבלה.`;
  }
}

// ─── Channel button ────────────────────────────────────────────────────────────

interface ChannelBtnProps {
  channel: 'whatsapp' | 'email';
  selected: boolean;
  hasContact: boolean;
  onToggle: () => void;
}

function ChannelBtn({ channel, selected, hasContact, onToggle }: ChannelBtnProps) {
  const isWA = channel === 'whatsapp';
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={!hasContact}
      title={!hasContact ? (isWA ? 'אין מספר טלפון' : 'אין כתובת מייל') : undefined}
      className={`
        flex items-center gap-2 px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all
        ${selected
          ? isWA
            ? 'border-green-500 bg-green-50 text-green-700'
            : 'border-blue-500 bg-blue-50 text-blue-700'
          : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'}
        ${!hasContact ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      {isWA
        ? <MessageCircle className="w-4 h-4" />
        : <Mail className="w-4 h-4" />}
      {isWA ? 'WhatsApp' : 'מייל'}
      {!hasContact && (
        <span className="text-xs opacity-70">(חסר)</span>
      )}
    </button>
  );
}

// ─── SendDocumentModal ────────────────────────────────────────────────────────

export default function SendDocumentModal({
  isOpen,
  onClose,
  documentType,
  documentId,
  documentNumber = '',
  recipientName = '',
  recipientPhone,
  recipientEmail,
  amount,
}: SendDocumentModalProps) {
  const [channels, setChannels]       = useState<Set<'whatsapp' | 'email'>>(new Set());
  const [message, setMessage]         = useState('');
  const [phone, setPhone]             = useState('');
  const [email, setEmail]             = useState('');
  const [subject, setSubject]         = useState('');
  const [results, setResults]         = useState<null | Record<string, { ok: boolean; error?: string }>>(null);

  // Reset when opened
  useEffect(() => {
    if (!isOpen) return;
    setMessage(buildDefaultMessage(documentType, documentNumber, recipientName, amount));
    setPhone(recipientPhone ?? '');
    setEmail(recipientEmail ?? '');
    setSubject(`${DOC_LABELS[documentType]} ${documentNumber}`);
    // Pre-select channels that have contact info
    const initial = new Set<'whatsapp' | 'email'>();
    if (recipientPhone) initial.add('whatsapp');
    if (recipientEmail) initial.add('email');
    setChannels(initial);
    setResults(null);
  }, [isOpen, documentType, documentId, documentNumber, recipientName, recipientPhone, recipientEmail, amount]);

  const toggleChannel = (ch: 'whatsapp' | 'email') => {
    setChannels(prev => {
      const next = new Set(prev);
      if (next.has(ch)) next.delete(ch); else next.add(ch);
      return next;
    });
  };

  const sendMutation = useMutation({
    mutationFn: () =>
      api.post('/notifications/send-document', {
        documentType,
        documentId,
        channels: Array.from(channels),
        message,
        recipientPhone: phone || undefined,
        recipientEmail: email || undefined,
        subject,
      }).then(r => r.data?.data ?? r.data),
    onSuccess: (data) => {
      setResults(data?.results ?? {});
    },
  });

  if (!isOpen) return null;

  const hasWA    = !!phone;
  const hasEmail = !!email;
  const allOk    = results && Object.values(results).every(r => r.ok);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-lg font-bold text-gray-800">שלח מסמך</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {DOC_LABELS[documentType]} {documentNumber}
              {recipientName && ` — ${recipientName}`}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        {results ? (
          <div className="p-6 space-y-3">
            {allOk && (
              <div className="flex items-center gap-2 text-green-600 font-medium">
                <CheckCircle className="w-5 h-5" /> נשלח בהצלחה!
              </div>
            )}
            {Object.entries(results).map(([ch, r]) => (
              <div key={ch} className={`flex items-start gap-2 text-sm rounded-lg px-3 py-2 ${r.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {r.ok
                  ? <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
                <span>
                  <b>{ch === 'whatsapp' ? 'WhatsApp' : 'מייל'}</b>
                  {r.ok ? ' — נשלח' : ` — ${r.error}`}
                </span>
              </div>
            ))}
            <button onClick={onClose} className="w-full mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">
              סגור
            </button>
          </div>
        ) : (
          <div className="p-6 space-y-4">

            {/* Channel selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">ערוץ שליחה</label>
              <div className="flex gap-3">
                <ChannelBtn channel="whatsapp" selected={channels.has('whatsapp')} hasContact={hasWA} onToggle={() => toggleChannel('whatsapp')} />
                <ChannelBtn channel="email"    selected={channels.has('email')}    hasContact={hasEmail} onToggle={() => toggleChannel('email')} />
              </div>
            </div>

            {/* Contact overrides */}
            <div className="grid grid-cols-2 gap-3">
              {(channels.has('whatsapp') || !hasWA) && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">טלפון</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="050-0000000"
                    className="w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
              {(channels.has('email') || !hasEmail) && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">מייל</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="email@example.com"
                    className="w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>

            {/* Email subject */}
            {channels.has('email') && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">נושא המייל</label>
                <input
                  type="text"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  className="w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            {/* Message */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">תוכן ההודעה</label>
              <textarea
                rows={6}
                value={message}
                onChange={e => setMessage(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="תוכן ההודעה..."
              />
              <p className="text-xs text-gray-400 mt-1">ניתן לערוך את ההודעה לפני שליחה</p>
            </div>

            {/* Error */}
            {sendMutation.isError && (
              <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                שגיאה: {(sendMutation.error as any)?.response?.data?.error ?? 'שגיאה בשליחה'}
              </div>
            )}

          </div>
        )}

        {/* Footer */}
        {!results && (
          <div className="px-6 py-4 border-t flex justify-between items-center">
            <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">
              ביטול
            </button>
            <button
              onClick={() => sendMutation.mutate()}
              disabled={channels.size === 0 || !message.trim() || sendMutation.isPending}
              className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sendMutation.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> שולח...</>
                : <><Send className="w-4 h-4" /> שלח</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
