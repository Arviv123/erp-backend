import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Search, Plus, Eye, DollarSign } from 'lucide-react';
import api from '../lib/api';
import SalaryUpdateModal from '../components/SalaryUpdateModal';

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

const EMPLOYMENT_LABEL: Record<string, string> = {
  FULL_TIME: 'משרה מלאה',
  PART_TIME: 'משרה חלקית',
  HOURLY: 'שעתי',
  CONTRACTOR: 'קבלן',
};

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  department: string;
  grossSalary: number;
  employmentType: string;
  isActive: boolean;
}

interface EmployeesResponse {
  data: Employee[];
  meta?: { total: number; page: number; pageSize: number };
}

async function getEmployees(params: Record<string, string | number>) {
  const res = await api.get<EmployeesResponse>('/employees', { params });
  return res.data;
}

export default function EmployeesPage() {
  const [search, setSearch]         = useState('');
  const [department, setDepartment] = useState('');
  const [page, setPage]             = useState(1);
  const [salaryModal, setSalaryModal] = useState<Employee | null>(null);

  const params: Record<string, string | number> = { page, pageSize: 20 };
  if (department) params.department = department;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['employees', { department, page }],
    queryFn: () => getEmployees(params),
  });

  const employees: Employee[] = Array.isArray(data?.data) ? (data as any).data : Array.isArray(data) ? data as any : [];
  const total = (data as any)?.meta?.total ?? employees.length;
  const totalPages = Math.ceil(total / 20);

  // Client-side search filter
  const filtered = search
    ? employees.filter(
        (e) =>
          `${e.firstName} ${e.lastName}`.includes(search) ||
          e.jobTitle?.includes(search) ||
          e.department?.includes(search)
      )
    : employees;

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">עובדים</h1>
        <Link
          to="/employees/new"
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
        >
          <Plus className="w-4 h-4" />
          הוסף עובד
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="חיפוש לפי שם / תפקיד / מחלקה"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-gray-300 rounded-lg pr-9 pl-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
        <select
          value={department}
          onChange={(e) => { setDepartment(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
        >
          <option value="">כל המחלקות</option>
          <option value="טכנולוגיה">טכנולוגיה</option>
          <option value="שיווק">שיווק</option>
          <option value="מכירות">מכירות</option>
          <option value="כספים">כספים</option>
          <option value="משאבי אנוש">משאבי אנוש</option>
          <option value="תפעול">תפעול</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-gray-500">טוען עובדים...</div>
        ) : error ? (
          <div className="flex items-center justify-center h-40 text-red-500">שגיאה בטעינת נתונים</div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-gray-400">אין עובדים להצגה</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-right px-4 py-3 font-medium text-gray-600">שם מלא</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">תפקיד</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">מחלקה</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">סוג העסקה</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">שכר ברוטו</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">סטאטוס</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((emp) => (
                <tr key={emp.id} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {emp.firstName} {emp.lastName}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{emp.jobTitle}</td>
                  <td className="px-4 py-3 text-gray-600">{emp.department}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                      {EMPLOYMENT_LABEL[emp.employmentType] ?? emp.employmentType}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {fmtCurrency(emp.grossSalary)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        emp.isActive
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {emp.isActive ? 'פעיל' : 'לא פעיל'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/employees/${emp.id}`}
                        className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs font-medium"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        צפה
                      </Link>
                      <button
                        onClick={() => setSalaryModal(emp)}
                        className="flex items-center gap-1 text-green-600 hover:text-green-800 text-xs font-medium"
                      >
                        <DollarSign className="w-3.5 h-3.5" />
                        עדכן שכר
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1.5 text-sm border rounded-md disabled:opacity-40 hover:bg-gray-50"
          >
            הקודם
          </button>
          <span className="text-sm text-gray-600">
            עמוד {page} מתוך {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 text-sm border rounded-md disabled:opacity-40 hover:bg-gray-50"
          >
            הבא
          </button>
        </div>
      )}

      {/* Salary Modal */}
      {salaryModal && (
        <SalaryUpdateModal
          employee={salaryModal}
          onClose={() => setSalaryModal(null)}
          onSuccess={() => { setSalaryModal(null); refetch(); }}
        />
      )}
    </div>
  );
}
