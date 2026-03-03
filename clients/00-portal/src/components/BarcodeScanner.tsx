import { useEffect, useRef, useState } from 'react';
import { X, Camera, Keyboard, ScanLine } from 'lucide-react';

interface Props {
  onScan: (code: string) => void;
  onClose: () => void;
}

// Check if BarcodeDetector is available (Chrome/Edge/Android)
const hasBarcodeDetector = typeof window !== 'undefined' && 'BarcodeDetector' in window;

export default function BarcodeScanner({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<any>(null);
  const scanLoopRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<'camera' | 'manual'>(hasBarcodeDetector ? 'camera' : 'manual');
  const [manualCode, setManualCode] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState('');

  // Start camera
  useEffect(() => {
    if (mode !== 'camera') return;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }

        // Create BarcodeDetector
        const detector = new (window as any).BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'qr_code', 'code_128', 'code_39', 'data_matrix', 'itf'],
        });
        detectorRef.current = detector;
        setScanning(true);
      } catch (err: any) {
        if (err.name === 'NotAllowedError') {
          setCameraError('גישה למצלמה נדחתה. אנא אשר גישה ונסה שנית.');
        } else if (err.name === 'NotFoundError') {
          setCameraError('לא נמצאה מצלמה במכשיר. השתמש בסריקה ידנית.');
        } else {
          setCameraError('שגיאה בפתיחת המצלמה. עבור לסריקה ידנית.');
        }
        setMode('manual');
      }
    }

    startCamera();

    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      if (scanLoopRef.current) cancelAnimationFrame(scanLoopRef.current);
    };
  }, [mode]);

  // Scan loop
  useEffect(() => {
    if (!scanning || !detectorRef.current || !videoRef.current) return;

    let active = true;

    async function scanFrame() {
      if (!active) return;
      try {
        if (videoRef.current && videoRef.current.readyState >= 2) {
          const barcodes = await detectorRef.current.detect(videoRef.current);
          if (barcodes.length > 0) {
            const code = barcodes[0].rawValue;
            if (code && code !== lastScan) {
              setLastScan(code);
              // Flash feedback
              setTimeout(() => setLastScan(''), 2000);
              onScan(code);
            }
          }
        }
      } catch {
        // Ignore individual frame errors
      }
      scanLoopRef.current = requestAnimationFrame(scanFrame);
    }

    scanLoopRef.current = requestAnimationFrame(scanFrame);
    return () => {
      active = false;
      if (scanLoopRef.current) cancelAnimationFrame(scanLoopRef.current);
    };
  }, [scanning, lastScan, onScan]);

  // Auto-focus manual input
  useEffect(() => {
    if (mode === 'manual') {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [mode]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) {
      onScan(manualCode.trim());
      setManualCode('');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <ScanLine className="w-5 h-5 text-indigo-600" />
            <h2 className="font-semibold text-gray-900">סריקת ברקוד</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex border-b border-gray-100">
          <button
            onClick={() => { setMode('camera'); setCameraError(''); }}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition ${
              mode === 'camera' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Camera className="w-4 h-4" /> מצלמה
          </button>
          <button
            onClick={() => setMode('manual')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition ${
              mode === 'manual' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Keyboard className="w-4 h-4" /> ידני / USB
          </button>
        </div>

        <div className="p-5">
          {mode === 'camera' ? (
            <div className="space-y-3">
              {cameraError ? (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                  {cameraError}
                </div>
              ) : (
                <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
                  <video
                    ref={videoRef}
                    className="w-full h-full object-cover"
                    playsInline
                    muted
                  />
                  {/* Scan overlay */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className={`w-56 h-32 border-2 rounded-lg transition-colors ${lastScan ? 'border-green-400' : 'border-white/60'}`}>
                      <div className="absolute top-0 right-0 w-5 h-5 border-t-2 border-r-2 border-indigo-400 rounded-tr-lg" />
                      <div className="absolute top-0 left-0 w-5 h-5 border-t-2 border-l-2 border-indigo-400 rounded-tl-lg" />
                      <div className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 border-indigo-400 rounded-br-lg" />
                      <div className="absolute bottom-0 left-0 w-5 h-5 border-b-2 border-l-2 border-indigo-400 rounded-bl-lg" />
                    </div>
                  </div>
                  {lastScan && (
                    <div className="absolute bottom-3 inset-x-3 bg-green-600/90 text-white text-xs text-center py-1.5 rounded-lg font-medium">
                      נסרק: {lastScan}
                    </div>
                  )}
                </div>
              )}
              <p className="text-xs text-center text-gray-500">
                {scanning ? 'כוון את המצלמה לברקוד — הסריקה אוטומטית' : 'פותח מצלמה...'}
              </p>
              {!hasBarcodeDetector && (
                <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-2 text-center">
                  הדפדפן אינו תומך בזיהוי ברקוד אוטומטי. השתמש במצב ידני.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                סרוק ברקוד עם קורא USB (הקוד יוקלד אוטומטית) או הקלד ידנית:
              </p>
              <form onSubmit={handleManualSubmit} className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={manualCode}
                  onChange={e => setManualCode(e.target.value)}
                  placeholder="ברקוד / מק&quot;ט..."
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                  autoComplete="off"
                />
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
                >
                  חפש
                </button>
              </form>
              <p className="text-xs text-gray-400">
                קורא ברקוד USB? פשוט סרוק — הקוד יוזן אוטומטית ויחפש.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
