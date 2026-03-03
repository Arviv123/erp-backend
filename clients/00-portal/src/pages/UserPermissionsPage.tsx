import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Shield, Save, Check, Users } from 'lucide-react';
import api from '../lib/api';
import { MODULES, ROLE_DEFAULTS, type ModuleKey } from '../lib/modules';
import { usePermissions } from '../contexts/PermissionsContext';

export default function UserPermissionsPage() {
  const { getUserModules, setUserModules } = usePermissions();
  const [selected, setSelected] = useState<string | null>(null);
  const [modules, setModules] = useState<ModuleKey[]>([]);
  const [saved, setSaved] = useState(false);

  const { data } = useQuery({
    queryKey: ['users-list'],
    queryFn: () => api.get('/users'),
  });

  const users: any[] = Array.isArray(data?.data) ? data.data
    : Array.isArray(data) ? data : [];

  function selectUser(u: any) {
    setSelected(u.id);
    setSaved(false);
    // Load saved permissions or fall back to role defaults
    const saved = getUserModules(u.id);
    setModules(saved ?? (ROLE_DEFAULTS[u.role] ?? ['DASHBOARD', 'ATTENDANCE']));
  }

  function toggleModule(key: ModuleKey) {
    setModules(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
    setSaved(false);
  }

  function handleSave() {
    if (!selected) return;
    setUserModules(selected, modules);
    setSaved(true);
  }

  function selectAll() { setModules(MODULES.map(m => m.key)); setSaved(false); }
  function clearAll() { setModules([]); setSaved(false); }

  const selectedUser = users.find(u => u.id === selected);

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <Shield size={24} className="text-blue-600" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">ניהול הרשאות משתמשים</h1>
          <p className="text-sm text-gray-500">בחר משתמש וסמן אילו מודולים הוא יראה בממשק</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Users list */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50">
            <Users size={16} className="text-gray-500" />
            <span className="font-medium text-sm text-gray-700">משתמשים</span>
          </div>
          <div className="divide-y divide-gray-50">
            {users.length === 0 && (
              <p className="text-center py-10 text-gray-400 text-sm">טוען...</p>
            )}
            {users.map((u: any) => {
              const customized = getUserModules(u.id) !== null;
              return (
                <button key={u.id} onClick={() => selectUser(u)}
                  className={`w-full text-right px-4 py-3 hover:bg-blue-50 transition ${selected === u.id ? 'bg-blue-50 border-r-2 border-blue-600' : ''}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{u.name || u.email}</p>
                      <p className="text-xs text-gray-400">{u.role}</p>
                    </div>
                    {customized && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">מותאם</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Permissions panel */}
        <div className="md:col-span-2">
          {!selected ? (
            <div className="bg-white rounded-xl border border-gray-200 flex items-center justify-center py-20">
              <p className="text-gray-400 text-sm">בחר משתמש מהרשימה כדי לערוך הרשאות</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-800">{selectedUser?.name || selectedUser?.email}</p>
                  <p className="text-xs text-gray-400">תפקיד: {selectedUser?.role}</p>
                </div>
                <div className="flex gap-2 text-xs">
                  <button onClick={selectAll} className="text-blue-600 hover:underline">בחר הכל</button>
                  <span className="text-gray-300">|</span>
                  <button onClick={clearAll} className="text-gray-400 hover:underline">נקה הכל</button>
                </div>
              </div>

              <div className="p-5 grid grid-cols-2 gap-3">
                {MODULES.map(mod => {
                  const on = modules.includes(mod.key);
                  return (
                    <button key={mod.key} onClick={() => toggleModule(mod.key)}
                      className={`flex items-start gap-3 p-3 rounded-xl border-2 text-right transition ${
                        on ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300 bg-white'}`}>
                      <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        on ? 'bg-blue-600' : 'border-2 border-gray-300'}`}>
                        {on && <Check size={12} className="text-white" strokeWidth={3} />}
                      </div>
                      <div>
                        <p className={`text-sm font-medium ${on ? 'text-blue-800' : 'text-gray-700'}`}>{mod.label}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{mod.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="px-5 pb-5">
                <button onClick={handleSave}
                  className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition ${
                    saved ? 'bg-green-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}>
                  {saved ? <Check size={16} /> : <Save size={16} />}
                  {saved ? 'נשמר!' : 'שמור הרשאות'}
                </button>
                <p className="text-xs text-gray-400 mt-2">
                  ההרשאות נשמרות מקומית. בפעם הבאה שהמשתמש יתחבר — הוא יראה רק את המודולים שנבחרו.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
