import { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Plus, Trash2, Send, CheckCircle, XCircle, Loader2,
  FileText, Receipt, BookOpen, RefreshCw, Download,
} from 'lucide-react';
import api from '../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────
type EntryType = 'VENDOR_INVOICE' | 'CUSTOMER_INVOICE' | 'JOURNAL';
type RowStatus = 'pending' | 'processing' | 'success' | 'error';

interface BatchRow {
  id: string;
  type: EntryType;
  partyName: string;
  partyId: string;
  docNumber: string;
  date: string;
  subtotal: string;
  vatAmount: string;
  vatNumber: string;
  withholding: string;
  notes: string;
  status: RowStatus;
  resultId?: string;
  errorMsg?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const ENTRY_TYPES: { value: EntryType; label: string; icon: React.ElementType; color: string }[] = [
  { value: 'VENDOR_INVOICE',   label: 'חשבונית ספק',   icon: Receipt,   color: 'bg-purple-100 text-purple-700' },
  { value: 'CUSTOMER_INVOICE', label: 'חשבונית לקוח',  icon: FileText,  color: 'bg-blue-100 text-blue-700'   },
  { value: 'JOURNAL',          label: 'פקודת יומן',     icon: BookOpen,  color: 'bg-green-100 text-green-700' },
];

const today = new Date().toISOString().slice(0, 10);
const due30 = () => {
  const d = new Date(); d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
};

const fmtILS = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 2 }).format(n);

let rowCounter = 0;
const newRow = (type: EntryType = 'VENDOR_INVOICE', date = today): BatchRow => ({
  id: `row-${++rowCounter}`,
  type,
  partyName: '', partyId: '',
  docNumber: '', date,
  subtotal: '', vatAmount: '', vatNumber: '',
  withholding: '', notes: '',
  status: 'pending',
});

// ─── VendorAutocomplete ───────────────────────────────────────────────────────
function PartyCell({
  value, entryType, vendors, customers,
  onChange, onPartySelect, onKeyDown, inputRef,
}: {
  value: string; entryType: EntryType;
  vendors: any[]; customers: any[];
  onChange: (v: string) => void;
  onPartySelect: (id: string, name: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  const [open, setOpen] = useState(false);
  const list = entryType === 'VENDOR_INVOICE' ? vendors : customers;
  const filtered = value.length > 0
    ? list.filter((p: any) => p.name.toLowerCase().includes(value.toLowerCase())).slice(0, 8)
    : list.slice(0, 8);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
        placeholder={entryType === 'VENDOR_INVOICE' ? 'שם ספק...' : 'שם לקוח...'}
        className="w-full px-2 py-1 text-sm outline-none bg-transparent"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-30 top-full right-0 w-56 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {filtered.map((p: any) => (
            <button key={p.id} type="button"
              onMouseDown={() => { onPartySelect(p.id, p.name); setOpen(false); }}
              className="w-full text-right px-3 py-1.5 hover:bg-blue-50 text-sm text-gray-700 truncate block">
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function BatchEntryPage() {
  const defaultType: EntryType = 'VENDOR_INVOICE';
  const [rows, setRows] = useState<BatchRow[]>([newRow(defaultType), newRow(defaultType), newRow(defaultType)]);
  const [batchDate, setBatchDate] = useState(today);
  const [batchRef, setBatchRef] = useState('');
  const [processing, setProcessing] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const firstInputRef = useRef<HTMLInputElement>(null);

  // Load vendors and customers
  const { data: vendorData } = useQuery({
    queryKey: ['vendors-batch'],
    queryFn: () => api.get('/purchasing/vendors'),
    staleTime: 5 * 60_000,
  });
  const { data: custData } = useQuery({
    queryKey: ['customers-batch'],
    queryFn: () => api.get('/crm/customers'),
    staleTime: 5 * 60_000,
  });

  const vendors: any[]   = Array.isArray(vendorData?.data) ? vendorData.data : Array.isArray(vendorData?.data?.data) ? vendorData.data.data : [];
  const customers: any[] = Array.isArray(custData?.data)   ? custData.data   : Array.isArray(custData?.data?.data)   ? custData.data.data   : [];

  // ── Row helpers ────────────────────────────────────────────────────────────
  const updateRow = useCallback((id: string, patch: Partial<BatchRow>) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  }, []);

  const addRow = useCallback((afterId?: string) => {
    const lastRow = rows[rows.length - 1];
    const r = newRow(lastRow?.type ?? defaultType, batchDate);
    if (afterId) {
      setRows(prev => {
        const idx = prev.findIndex(r => r.id === afterId);
        const next = [...prev];
        next.splice(idx + 1, 0, r);
        return next;
      });
    } else {
      setRows(prev => [...prev, r]);
    }
  }, [rows, batchDate]);

  const removeRow = useCallback((id: string) => {
    setRows(prev => {
      if (prev.length <= 1) return prev;
      return prev.filter(r => r.id !== id);
    });
  }, []);

  const handleVatInput = useCallback((id: string, subtotalStr: string) => {
    const sub = parseFloat(subtotalStr);
    if (!isNaN(sub) && sub > 0) {
      const vat = Math.round(sub * 0.18 * 100) / 100;
      updateRow(id, { subtotal: subtotalStr, vatAmount: String(vat) });
    } else {
      updateRow(id, { subtotal: subtotalStr });
    }
  }, [updateRow]);

  // Apply batch date to all pending rows
  useEffect(() => {
    setRows(prev => prev.map(r => r.status === 'pending' ? { ...r, date: batchDate } : r));
  }, [batchDate]);

  // ── Submission ────────────────────────────────────────────────────────────
  const submitBatch = async () => {
    const validRows = rows.filter(r =>
      r.status === 'pending' &&
      r.partyName.trim() &&
      parseFloat(r.subtotal) > 0
    );
    if (validRows.length === 0) return;

    setProcessing(true);
    setSubmitted(true);

    for (const row of validRows) {
      updateRow(row.id, { status: 'processing' });
      try {
        const subtotal  = parseFloat(row.subtotal)  || 0;
        const vatAmount = parseFloat(row.vatAmount)  || Math.round(subtotal * 0.18 * 100) / 100;

        if (row.type === 'VENDOR_INVOICE') {
          // Find or use vendor
          let vendorId = row.partyId;
          if (!vendorId) {
            const found = vendors.find((v: any) => v.name === row.partyName.trim());
            vendorId = found?.id;
          }
          if (!vendorId) {
            // Create vendor on the fly
            const res = await api.post('/purchasing/vendors', {
              name: row.partyName.trim(),
              vatNumber: row.vatNumber || undefined,
            });
            vendorId = res.data?.data?.id ?? res.data?.id;
          }

          await api.post('/purchasing/bills', {
            vendorId,
            number:  row.docNumber || undefined,
            date:    row.date,
            dueDate: due30(),
            notes:   row.notes || undefined,
            vatNumber: row.vatNumber || undefined,
            lines: [{
              description: row.notes || `חשבונית ${row.docNumber || row.partyName}`,
              quantity:    1,
              unitCost:    subtotal,
              vatRate:     vatAmount / subtotal,
            }],
          });
          updateRow(row.id, { status: 'success' });

        } else if (row.type === 'CUSTOMER_INVOICE') {
          let customerId = row.partyId;
          if (!customerId) {
            const found = customers.find((c: any) => c.name === row.partyName.trim());
            customerId = found?.id;
          }
          if (!customerId) {
            const res = await api.post('/crm/customers', {
              name: row.partyName.trim(),
              type: 'B2B',
            });
            customerId = res.data?.data?.id ?? res.data?.id;
          }

          await api.post('/invoices', {
            customerId,
            date:    row.date,
            dueDate: due30(),
            reference: row.docNumber || undefined,
            notes:   row.notes || undefined,
            lines: [{
              description: row.notes || `חשבונית ${row.docNumber || row.partyName}`,
              quantity:    1,
              unitPrice:   subtotal,
              vatRate:     vatAmount / subtotal,
            }],
          });
          updateRow(row.id, { status: 'success' });

        } else if (row.type === 'JOURNAL') {
          // For journal entries, we need debit/credit accounts
          // This is handled via GL transaction - use a simple description-based approach
          updateRow(row.id, {
            status: 'error',
            errorMsg: 'פקודות יומן דורשות ציון חשבונות חיוב/זכוי — השתמש בדף פקודות היומן',
          });
        }
      } catch (err: any) {
        const msg = err?.response?.data?.message ?? err?.response?.data?.error ?? 'שגיאה';
        updateRow(row.id, { status: 'error', errorMsg: msg });
      }
    }

    setProcessing(false);
  };

  const resetBatch = () => {
    setRows([newRow(defaultType, batchDate), newRow(defaultType, batchDate), newRow(defaultType, batchDate)]);
    setSubmitted(false);
  };

  // ── Stats ─────────────────────────────────────────────────────────────────
  const pendingRows    = rows.filter(r => r.status === 'pending' && r.partyName.trim() && parseFloat(r.subtotal) > 0);
  const successRows    = rows.filter(r => r.status === 'success');
  const errorRows      = rows.filter(r => r.status === 'error');
  const totalSubtotal  = rows.reduce((s, r) => s + (parseFloat(r.subtotal) || 0), 0);
  const totalVat       = rows.reduce((s, r) => s + (parseFloat(r.vatAmount) || 0), 0);
  const totalAmount    = totalSubtotal + totalVat;

  const colClass = 'border-l border-gray-200 px-2 py-1.5 text-sm';

  return (
    <div className="space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">קליטת מנה — הזנה מהירה</h1>
          <p className="text-sm text-gray-500 mt-0.5">הזן מספר חשבוניות / תנועות בבת אחת</p>
        </div>
        <div className="flex gap-2">
          {submitted && (
            <button onClick={resetBatch}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              <RefreshCw size={15} /> מנה חדשה
            </button>
          )}
          <button
            onClick={submitBatch}
            disabled={processing || pendingRows.length === 0}
            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {processing
              ? <><Loader2 size={15} className="animate-spin" /> מעבד...</>
              : <><Send size={15} /> שדר מנה ({pendingRows.length} תנועות)</>
            }
          </button>
        </div>
      </div>

      {/* Batch header */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">תאריך מנה</label>
          <input type="date" value={batchDate} onChange={e => setBatchDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs text-gray-500 mb-1">אסמכתא מנה (אופציונלי)</label>
          <input type="text" placeholder="לדוגמא: ינואר 2026 ספקים" value={batchRef}
            onChange={e => setBatchRef(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
        </div>
        <div className="flex gap-6 text-sm text-gray-600 mr-auto">
          <span>לפני מע"מ: <strong className="text-gray-800">{fmtILS(totalSubtotal)}</strong></span>
          <span>מע"מ: <strong className="text-gray-800">{fmtILS(totalVat)}</strong></span>
          <span>סה"כ: <strong className="text-blue-700 text-base">{fmtILS(totalAmount)}</strong></span>
        </div>
      </div>

      {/* Results summary */}
      {submitted && (successRows.length > 0 || errorRows.length > 0) && (
        <div className="flex gap-3">
          {successRows.length > 0 && (
            <div className="flex-1 bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center gap-2">
              <CheckCircle className="text-green-500 shrink-0" size={18} />
              <span className="text-sm text-green-700 font-medium">{successRows.length} תנועות נקלטו בהצלחה</span>
            </div>
          )}
          {errorRows.length > 0 && (
            <div className="flex-1 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-2">
              <XCircle className="text-red-500 shrink-0" size={18} />
              <span className="text-sm text-red-700 font-medium">{errorRows.length} תנועות נכשלו</span>
            </div>
          )}
        </div>
      )}

      {/* Entry table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-gray-50 text-xs text-gray-500 font-medium">
            <tr className="divide-x divide-gray-200">
              <th className="px-3 py-2.5 text-right w-8">#</th>
              <th className="px-2 py-2.5 text-right w-36">סוג תנועה</th>
              <th className="px-2 py-2.5 text-right w-48">ספק / לקוח</th>
              <th className="px-2 py-2.5 text-right w-28">מספר חשבונית</th>
              <th className="px-2 py-2.5 text-right w-32">תאריך</th>
              <th className="px-2 py-2.5 text-right w-28">לפני מע"מ ₪</th>
              <th className="px-2 py-2.5 text-right w-24">מע"מ ₪</th>
              <th className="px-2 py-2.5 text-right w-28">מ.ע.מ ספק</th>
              <th className="px-2 py-2.5 text-right">הערות</th>
              <th className="px-2 py-2.5 text-right w-20">סטטוס</th>
              <th className="px-2 py-2.5 w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row, idx) => (
              <TableRow
                key={row.id}
                row={row}
                idx={idx}
                vendors={vendors}
                customers={customers}
                updateRow={updateRow}
                removeRow={removeRow}
                addRow={addRow}
                handleVatInput={handleVatInput}
                colClass={colClass}
                inputRef={idx === 0 ? firstInputRef : undefined}
              />
            ))}
          </tbody>
        </table>

        {/* Add row */}
        <div className="border-t border-gray-100 px-3 py-2">
          <button onClick={() => addRow()}
            className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium">
            <Plus size={15} /> הוסף שורה <span className="text-xs text-gray-400 font-normal mr-1">(Enter בשורה אחרונה)</span>
          </button>
        </div>
      </div>

      {/* Quick type legend */}
      <div className="flex gap-3 flex-wrap">
        {ENTRY_TYPES.map(t => (
          <div key={t.value} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs ${t.color}`}>
            <t.icon size={13} />
            {t.label}
          </div>
        ))}
        <span className="text-xs text-gray-400 self-center mr-2">
          טיפ: לחץ Tab לעבור בין שדות, Enter להוסיף שורה חדשה
        </span>
      </div>
    </div>
  );
}

// ─── TableRow ─────────────────────────────────────────────────────────────────
function TableRow({
  row, idx, vendors, customers,
  updateRow, removeRow, addRow, handleVatInput,
  colClass, inputRef,
}: {
  row: BatchRow; idx: number;
  vendors: any[]; customers: any[];
  updateRow: (id: string, p: Partial<BatchRow>) => void;
  removeRow: (id: string) => void;
  addRow: (afterId?: string) => void;
  handleVatInput: (id: string, v: string) => void;
  colClass: string;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  const disabled = row.status === 'success' || row.status === 'processing';

  const statusBadge = {
    pending:    null,
    processing: <Loader2 size={15} className="animate-spin text-blue-500" />,
    success:    <CheckCircle size={15} className="text-green-500" />,
    error:      <span title={row.errorMsg}><XCircle size={15} className="text-red-500 cursor-help" /></span>,
  }[row.status];

  const rowBg =
    row.status === 'success'    ? 'bg-green-50/60' :
    row.status === 'error'      ? 'bg-red-50/60' :
    row.status === 'processing' ? 'bg-blue-50/40' :
    'hover:bg-gray-50/70';

  const cellInput = (cls?: string) =>
    `w-full px-2 py-1 text-sm outline-none bg-transparent disabled:text-gray-400 ${cls ?? ''}`;

  const handleEnter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); addRow(row.id); }
  };

  return (
    <tr className={`divide-x divide-gray-100 transition ${rowBg}`}>
      {/* Row number */}
      <td className="px-3 py-1.5 text-xs text-gray-400 text-center">{idx + 1}</td>

      {/* Type */}
      <td className={colClass}>
        <select
          value={row.type}
          disabled={disabled}
          onChange={e => updateRow(row.id, { type: e.target.value as EntryType })}
          className="w-full text-xs outline-none bg-transparent disabled:text-gray-400 cursor-pointer"
        >
          {ENTRY_TYPES.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </td>

      {/* Party */}
      <td className={`${colClass} relative`}>
        {disabled ? (
          <span className="text-sm text-gray-500">{row.partyName}</span>
        ) : (
          <PartyCell
            value={row.partyName}
            entryType={row.type}
            vendors={vendors}
            customers={customers}
            onChange={v => updateRow(row.id, { partyName: v, partyId: '' })}
            onPartySelect={(id, name) => updateRow(row.id, { partyId: id, partyName: name })}
            onKeyDown={handleEnter}
            inputRef={inputRef}
          />
        )}
      </td>

      {/* Doc number */}
      <td className={colClass}>
        <input type="text" value={row.docNumber} disabled={disabled}
          placeholder="מס' חשבונית"
          onChange={e => updateRow(row.id, { docNumber: e.target.value })}
          onKeyDown={handleEnter}
          className={cellInput()} />
      </td>

      {/* Date */}
      <td className={colClass}>
        <input type="date" value={row.date} disabled={disabled}
          onChange={e => updateRow(row.id, { date: e.target.value })}
          className={cellInput('text-xs')} />
      </td>

      {/* Subtotal */}
      <td className={colClass}>
        <input
          type="number" step="0.01" min="0"
          value={row.subtotal} disabled={disabled}
          placeholder="0.00"
          onChange={e => handleVatInput(row.id, e.target.value)}
          onKeyDown={handleEnter}
          className={cellInput('text-left')}
        />
      </td>

      {/* VAT amount */}
      <td className={colClass}>
        <input type="number" step="0.01" min="0"
          value={row.vatAmount} disabled={disabled}
          placeholder="0.00"
          onChange={e => updateRow(row.id, { vatAmount: e.target.value })}
          className={cellInput('text-left')} />
      </td>

      {/* VAT number */}
      <td className={colClass}>
        <input type="text" value={row.vatNumber} disabled={disabled}
          placeholder="ח.פ. / ע.מ."
          onChange={e => updateRow(row.id, { vatNumber: e.target.value })}
          onKeyDown={handleEnter}
          className={cellInput()} />
      </td>

      {/* Notes */}
      <td className={colClass}>
        <input type="text" value={row.notes} disabled={disabled}
          placeholder="הערות..."
          onChange={e => updateRow(row.id, { notes: e.target.value })}
          onKeyDown={handleEnter}
          className={cellInput()} />
      </td>

      {/* Status */}
      <td className="px-2 py-1.5 text-center">
        {statusBadge ?? (
          row.partyName && parseFloat(row.subtotal) > 0
            ? <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" title="ממתין לשידור" />
            : <span className="w-2 h-2 rounded-full bg-gray-200 inline-block" />
        )}
        {row.status === 'error' && row.errorMsg && (
          <p className="text-xs text-red-500 mt-0.5 max-w-[120px] truncate" title={row.errorMsg}>{row.errorMsg}</p>
        )}
      </td>

      {/* Remove */}
      <td className="px-2 py-1.5 text-center">
        {!disabled && (
          <button onClick={() => removeRow(row.id)}
            className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 transition">
            <Trash2 size={13} />
          </button>
        )}
      </td>
    </tr>
  );
}
