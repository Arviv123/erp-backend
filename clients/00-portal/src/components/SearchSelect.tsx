import { useState, useRef, useEffect } from 'react';
import { Search, X, ChevronDown } from 'lucide-react';

interface Option {
  value: string;
  label: string;
  sublabel?: string;
}

interface SearchSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  clearable?: boolean;
}

/**
 * A searchable select/combobox that replaces the native <select> with a
 * filterable dropdown. Keyboard-accessible, works RTL.
 */
export default function SearchSelect({
  options,
  value,
  onChange,
  placeholder = 'חפש...',
  className = '',
  disabled = false,
  clearable = true,
}: SearchSelectProps) {
  const [open, setOpen]       = useState(false);
  const [query, setQuery]     = useState('');
  const wrapRef               = useRef<HTMLDivElement>(null);
  const inputRef              = useRef<HTMLInputElement>(null);

  const selected = options.find(o => o.value === value);

  // Close when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  const filtered = query.length > 0
    ? options.filter(o =>
        o.label.toLowerCase().includes(query.toLowerCase()) ||
        (o.sublabel ?? '').toLowerCase().includes(query.toLowerCase())
      )
    : options;

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setQuery('');
  };

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setQuery('');
  };

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      {/* Trigger button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => { if (!disabled) setOpen(o => !o); }}
        className={`w-full flex items-center justify-between gap-2 border rounded-lg px-3 py-2.5 text-sm text-right transition
          ${disabled ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : 'bg-white hover:border-blue-400 cursor-pointer'}
          ${open ? 'border-blue-500 ring-2 ring-blue-100' : 'border-gray-300'}
        `}
      >
        <span className={`flex-1 truncate text-right ${selected ? 'text-gray-800' : 'text-gray-400'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="flex items-center gap-1 shrink-0 text-gray-400">
          {clearable && selected && !disabled && (
            <X size={14} onClick={clear} className="hover:text-gray-600" />
          )}
          <ChevronDown size={15} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 top-full mt-1 right-0 w-full min-w-[220px] bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
            <Search size={14} className="text-gray-400 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="חיפוש..."
              className="flex-1 text-sm outline-none text-right bg-transparent"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} className="text-gray-400 hover:text-gray-600">
                <X size={13} />
              </button>
            )}
          </div>

          {/* Options */}
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-sm text-gray-400 text-center">לא נמצאו תוצאות</div>
            ) : (
              filtered.map(o => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => pick(o.value)}
                  className={`w-full text-right px-3 py-2 text-sm hover:bg-blue-50 transition flex flex-col items-start
                    ${o.value === value ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'}`}
                >
                  <span>{o.label}</span>
                  {o.sublabel && <span className="text-xs text-gray-400">{o.sublabel}</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
