export const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

export const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export const statusMap: Record<string, { label: string; color: string; icon: string }> = {
  DRAFT:     { label: 'טיוטה',    color: 'bg-gray-100 text-gray-700',   icon: '📄' },
  SENT:      { label: 'נשלח',     color: 'bg-blue-100 text-blue-700',   icon: '📨' },
  PAID:      { label: 'שולם',     color: 'bg-green-100 text-green-700', icon: '✅' },
  OVERDUE:   { label: 'פג תוקף',  color: 'bg-red-100 text-red-700',     icon: '🔴' },
  CANCELLED: { label: 'בוטל',     color: 'bg-orange-100 text-orange-700', icon: '❌' },
};
