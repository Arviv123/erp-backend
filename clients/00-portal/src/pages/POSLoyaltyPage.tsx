import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Star, History, Save, ChevronLeft } from 'lucide-react';
import api from '../lib/api';

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

const fmtDate = (d: string) =>
  d ? new Date(d).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : '—';

type Tier = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
type TxType = 'EARN' | 'REDEEM' | 'EXPIRE' | 'ADJUST';

const TIER_LABELS: Record<Tier, string> = {
  BRONZE: 'ברונזה',
  SILVER: 'כסף',
  GOLD: 'זהב',
  PLATINUM: 'פלטינום',
};

const TIER_COLORS: Record<Tier, string> = {
  BRONZE: 'bg-amber-100 text-amber-800',
  SILVER: 'bg-gray-100 text-gray-700',
  GOLD: 'bg-yellow-100 text-yellow-800',
  PLATINUM: 'bg-purple-100 text-purple-800',
};

const TX_LABELS: Record<TxType, string> = {
  EARN: 'צבירה',
  REDEEM: 'מימוש',
  EXPIRE: 'פקיעה',
  ADJUST: 'התאמה',
};

const TX_COLORS: Record<TxType, string> = {
  EARN: 'text-green-600',
  REDEEM: 'text-red-600',
  EXPIRE: 'text-gray-400',
  ADJUST: 'text-blue-600',
};

interface LoyaltyTier {
  name: string;
  minPoints: number;
  discountPct: number;
}

interface LoyaltyProgram {
  id: string;
  name: string;
  pointsPerShekel: number;
  shekelPerPoint: number;
  minRedemption: number;
  tiers: LoyaltyTier[];
}

interface LoyaltyAccount {
  id: string;
  customerId: string;
  customerName: string;
  points: number;
  tier: Tier;
  totalEarned: number;
}

interface LoyaltyTx {
  id: string;
  type: TxType;
  points: number;
  description: string;
  createdAt: string;
}

export default function POSLoyaltyPage() {
  const queryClient = useQueryClient();
  const [searchQ, setSearchQ] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<LoyaltyAccount | null>(null);
  const [settingsForm, setSettingsForm] = useState<Partial<LoyaltyProgram>>({});
  const [settingsEditing, setSettingsEditing] = useState(false);
  const [settingsError, setSettingsError] = useState('');

  // Program settings
  const { data: program, isLoading: programLoading } = useQuery<LoyaltyProgram>({
    queryKey: ['loyalty-program'],
    queryFn: async () => {
      const res = await api.get('/pos/loyalty/program');
      return res.data;
    },
    onSuccess: (data: LoyaltyProgram) => {
      setSettingsForm({
        pointsPerShekel: data.pointsPerShekel,
        shekelPerPoint: data.shekelPerPoint,
        minRedemption: data.minRedemption,
      });
    },
  } as any);

  const updateProgramMutation = useMutation({
    mutationFn: (body: object) => api.put('/pos/loyalty/program', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loyalty-program'] });
      setSettingsEditing(false);
      setSettingsError('');
    },
    onError: () => setSettingsError('שגיאה בשמירת ההגדרות'),
  });

  // Search accounts
  const { data: accounts = [], isLoading: accountsLoading } = useQuery<LoyaltyAccount[]>({
    queryKey: ['loyalty-accounts', searchQ],
    queryFn: async () => {
      if (!searchQ.trim()) return [];
      const res = await api.get('/pos/loyalty/accounts', { params: { q: searchQ } });
      return Array.isArray(res.data) ? res.data : res.data?.data ?? [];
    },
    enabled: !!searchQ.trim(),
  });

  // Account history
  const { data: history = [], isLoading: historyLoading } = useQuery<LoyaltyTx[]>({
    queryKey: ['loyalty-history', selectedAccount?.id],
    queryFn: async () => {
      const res = await api.get(`/pos/loyalty/accounts/${selectedAccount!.id}/history`);
      return Array.isArray(res.data) ? res.data : res.data?.data ?? [];
    },
    enabled: !!selectedAccount,
  });

  const handleSearch = () => {
    setSearchQ(searchInput);
    setSelectedAccount(null);
  };

  const handleSaveSettings = () => {
    if (!program) return;
    updateProgramMutation.mutate({
      name: program.name,
      pointsPerShekel: Number(settingsForm.pointsPerShekel) || 0,
      shekelPerPoint: Number(settingsForm.shekelPerPoint) || 0,
      minRedemption: Number(settingsForm.minRedemption) || 0,
      tiers: program.tiers,
    });
  };

  const handleCancelSettings = () => {
    if (program) {
      setSettingsForm({
        pointsPerShekel: program.pointsPerShekel,
        shekelPerPoint: program.shekelPerPoint,
        minRedemption: program.minRedemption,
      });
    }
    setSettingsEditing(false);
    setSettingsError('');
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Star className="text-yellow-500" size={24} />
        <h1 className="text-2xl font-bold text-gray-900">תכנית נאמנות</h1>
      </div>

      {/* Section A: Program Settings */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800">הגדרות תכנית</h2>
          {!settingsEditing && (
            <button
              onClick={() => setSettingsEditing(true)}
              className="bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 text-sm"
            >
              ערוך הגדרות
            </button>
          )}
        </div>

        {programLoading ? (
          <div className="text-center py-8 text-gray-500">טוען...</div>
        ) : !program ? (
          <div className="text-center py-6 text-gray-400">לא נמצאה תכנית נאמנות</div>
        ) : (
          <>
            {settingsError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2 mb-4 text-sm">
                {settingsError}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">נקודות לשקל</label>
                {settingsEditing ? (
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={settingsForm.pointsPerShekel ?? ''}
                    onChange={e => setSettingsForm(f => ({ ...f, pointsPerShekel: Number(e.target.value) }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  <p className="text-xl font-bold text-gray-900">{program.pointsPerShekel}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">שקל לנקודה (ערך מימוש)</label>
                {settingsEditing ? (
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={settingsForm.shekelPerPoint ?? ''}
                    onChange={e => setSettingsForm(f => ({ ...f, shekelPerPoint: Number(e.target.value) }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  <p className="text-xl font-bold text-gray-900">{program.shekelPerPoint} ₪</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">מינימום נקודות למימוש</label>
                {settingsEditing ? (
                  <input
                    type="number"
                    min="0"
                    value={settingsForm.minRedemption ?? ''}
                    onChange={e => setSettingsForm(f => ({ ...f, minRedemption: Number(e.target.value) }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  <p className="text-xl font-bold text-gray-900">{program.minRedemption} נק'</p>
                )}
              </div>
            </div>

            {/* Tiers */}
            {program.tiers && program.tiers.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">רמות חברות</h3>
                <div className="flex flex-wrap gap-3">
                  {program.tiers.map((tier, i) => (
                    <div key={i} className={`rounded-lg px-4 py-2 text-sm font-medium ${TIER_COLORS[tier.name as Tier] ?? 'bg-gray-100 text-gray-700'}`}>
                      <span className="font-bold">{TIER_LABELS[tier.name as Tier] ?? tier.name}</span>
                      <span className="mx-1 text-xs opacity-70">—</span>
                      <span>מ-{tier.minPoints} נק'</span>
                      {tier.discountPct > 0 && <span className="mr-1 text-xs">({tier.discountPct}% הנחה)</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {settingsEditing && (
              <div className="flex gap-3 mt-5">
                <button
                  onClick={handleSaveSettings}
                  disabled={updateProgramMutation.isPending}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm disabled:opacity-60 flex items-center gap-2"
                >
                  <Save size={14} />
                  {updateProgramMutation.isPending ? 'שומר...' : 'שמור הגדרות'}
                </button>
                <button
                  onClick={handleCancelSettings}
                  className="bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 text-sm"
                >
                  ביטול
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Section B: Member Search */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">חיפוש חברים</h2>
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="חפש לפי שם לקוח, טלפון או מספר חבר..."
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleSearch}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm flex items-center gap-2"
          >
            <Search size={15} />
            חפש
          </button>
        </div>

        {accountsLoading && <div className="text-center py-6 text-gray-500">טוען...</div>}

        {!accountsLoading && searchQ && accounts.length === 0 && (
          <div className="text-center py-6 text-gray-400 text-sm">לא נמצאו תוצאות עבור "{searchQ}"</div>
        )}

        {accounts.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">שם לקוח</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">נקודות</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">רמה</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">סה"כ נצבר</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {accounts.map((acc) => (
                  <tr
                    key={acc.id}
                    className={`hover:bg-gray-50 transition-colors ${selectedAccount?.id === acc.id ? 'bg-blue-50' : ''}`}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">{acc.customerName}</td>
                    <td className="px-4 py-3 text-gray-800 font-semibold">{acc.points.toLocaleString('he-IL')}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${TIER_COLORS[acc.tier] ?? 'bg-gray-100 text-gray-600'}`}>
                        {TIER_LABELS[acc.tier] ?? acc.tier}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{acc.totalEarned.toLocaleString('he-IL')} נק'</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setSelectedAccount(selectedAccount?.id === acc.id ? null : acc)}
                        className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs font-medium"
                      >
                        <History size={13} />
                        {selectedAccount?.id === acc.id ? 'סגור היסטוריה' : 'היסטוריה'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section C: Points History */}
      {selectedAccount && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">
                היסטוריית נקודות — {selectedAccount.customerName}
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">
                יתרה: <strong>{selectedAccount.points.toLocaleString('he-IL')}</strong> נקודות |
                רמה: <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mr-1 ${TIER_COLORS[selectedAccount.tier] ?? 'bg-gray-100'}`}>
                  {TIER_LABELS[selectedAccount.tier] ?? selectedAccount.tier}
                </span>
              </p>
            </div>
            <button
              onClick={() => setSelectedAccount(null)}
              className="text-gray-400 hover:text-gray-600 p-1"
            >
              <ChevronLeft size={18} />
            </button>
          </div>

          {historyLoading ? (
            <div className="text-center py-8 text-gray-500">טוען...</div>
          ) : history.length === 0 ? (
            <div className="text-center py-6 text-gray-400 text-sm">אין היסטוריית עסקאות</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">תאריך</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">סוג</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">נקודות</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">תיאור</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {history.map((tx) => (
                    <tr key={tx.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(tx.createdAt)}</td>
                      <td className="px-4 py-3">
                        <span className={`font-medium text-xs ${TX_COLORS[tx.type] ?? 'text-gray-600'}`}>
                          {TX_LABELS[tx.type] ?? tx.type}
                        </span>
                      </td>
                      <td className={`px-4 py-3 font-semibold ${tx.type === 'EARN' || tx.type === 'ADJUST' ? 'text-green-600' : 'text-red-600'}`}>
                        {tx.type === 'EARN' || tx.type === 'ADJUST' ? '+' : '-'}{Math.abs(tx.points).toLocaleString('he-IL')}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{tx.description || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
