const fs = require('fs');

const path = '../Cyberbistro/src/features/auth/components/LoginForm.tsx';
let c = fs.readFileSync(path, 'utf8');

c = c.replace(
  "  const [isVisible, setIsVisible] = useState(false);\n  const [showPinGate, setShowPinGate] = useState(false);\n\n  useEffect(() => {\n    setIsVisible(true);\n  }, []);",
  `  const [isVisible, setIsVisible] = useState(false);
  const [showPinGate, setShowPinGate] = useState(false);

  // Updater states
  const [updatePhase, setUpdatePhase] = useState<'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error'>('idle');
  const [updatePercent, setUpdatePercent] = useState(0);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  // Update logic
  useEffect(() => {
    const electron = (window as any).electronAPI;
    if (!electron?.onUpdateEvents) return;

    electron.getUpdateState().then((state: any) => {
      if (state) {
        setUpdatePhase(state.phase || 'idle');
        setUpdatePercent(state.percent || 0);
      }
    }).catch(() => {});

    const removeListeners = electron.onUpdateEvents({
      onChecking: () => setUpdatePhase('checking'),
      onUpdateAvailable: () => setUpdatePhase('available'),
      onUpdateNotAvailable: () => setUpdatePhase('idle'),
      onDownloadProgress: (progress: any) => {
        setUpdatePhase('downloading');
        setUpdatePercent(Math.round(progress.percent));
      },
      onUpdateDownloaded: () => setUpdatePhase('ready'),
      onUpdateError: () => setUpdatePhase('error')
    });

    return () => removeListeners();
  }, []);`
);

// Fallback to CRLF if first replace failed
c = c.replace(
  "  const [isVisible, setIsVisible] = useState(false);\r\n  const [showPinGate, setShowPinGate] = useState(false);\r\n\r\n  useEffect(() => {\r\n    setIsVisible(true);\r\n  }, []);",
  `  const [isVisible, setIsVisible] = useState(false);
  const [showPinGate, setShowPinGate] = useState(false);

  // Updater states
  const [updatePhase, setUpdatePhase] = useState<'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error'>('idle');
  const [updatePercent, setUpdatePercent] = useState(0);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  // Update logic
  useEffect(() => {
    const electron = (window as any).electronAPI;
    if (!electron?.onUpdateEvents) return;

    electron.getUpdateState().then((state: any) => {
      if (state) {
        setUpdatePhase(state.phase || 'idle');
        setUpdatePercent(state.percent || 0);
      }
    }).catch(() => {});

    const removeListeners = electron.onUpdateEvents({
      onChecking: () => setUpdatePhase('checking'),
      onUpdateAvailable: () => setUpdatePhase('available'),
      onUpdateNotAvailable: () => setUpdatePhase('idle'),
      onDownloadProgress: (progress: any) => {
        setUpdatePhase('downloading');
        setUpdatePercent(Math.round(progress.percent));
      },
      onUpdateDownloaded: () => setUpdatePhase('ready'),
      onUpdateError: () => setUpdatePhase('error')
    });

    return () => removeListeners();
  }, []);`
);

c = c.replace(
  "                  )}\n                </button>\n              </div>",
  `                  )}
                </button>
              </div>

              {/* Updater Info */}
              <div className="w-full mt-4 text-center font-['Inter',sans-serif] text-[11px] text-[#76777d] uppercase tracking-[0.05em] font-semibold">
                <div className="mb-1">Versión {__APP_VERSION__}</div>
                {updatePhase === 'checking' && (
                  <div className="mt-1 bg-[rgba(38,38,38,0.6)] text-[#adaaaa] p-1.5 rounded-[4px]">Buscando actualizaciones...</div>
                )}
                {updatePhase === 'available' && (
                  <div className="mt-1 bg-[rgba(0,102,204,0.1)] text-[#5c9ce6] p-1.5 rounded-[4px] animate-pulse">Actualización disponible. Descargando...</div>
                )}
                {updatePhase === 'downloading' && (
                  <div className="mt-1 bg-[rgba(0,102,204,0.1)] text-[#5c9ce6] p-1.5 rounded-[4px]">Descargando: {updatePercent}%</div>
                )}
                {updatePhase === 'ready' && (
                  <div className="mt-1 bg-[rgba(89,238,80,0.1)] text-[#59ee50] p-1.5 rounded-[4px]">
                    Actualización lista. <button onClick={(e) => { e.preventDefault(); (window as any).electronAPI?.installUpdate(); }} className="underline hover:text-[#7dff75]">Instalar y reiniciar</button>
                  </div>
                )}
                {updatePhase === 'error' && (
                  <div className="mt-1 bg-[rgba(255,115,70,0.1)] text-[#ff7346] p-1.5 rounded-[4px]">Error de actualización</div>
                )}
              </div>`
);

c = c.replace(
  "                  )}\r\n                </button>\r\n              </div>",
  `                  )}
                </button>
              </div>

              {/* Updater Info */}
              <div className="w-full mt-4 text-center font-['Inter',sans-serif] text-[11px] text-[#76777d] uppercase tracking-[0.05em] font-semibold">
                <div className="mb-1">Versión {__APP_VERSION__}</div>
                {updatePhase === 'checking' && (
                  <div className="mt-1 bg-[rgba(38,38,38,0.6)] text-[#adaaaa] p-1.5 rounded-[4px]">Buscando actualizaciones...</div>
                )}
                {updatePhase === 'available' && (
                  <div className="mt-1 bg-[rgba(0,102,204,0.1)] text-[#5c9ce6] p-1.5 rounded-[4px] animate-pulse">Actualización disponible. Descargando...</div>
                )}
                {updatePhase === 'downloading' && (
                  <div className="mt-1 bg-[rgba(0,102,204,0.1)] text-[#5c9ce6] p-1.5 rounded-[4px]">Descargando: {updatePercent}%</div>
                )}
                {updatePhase === 'ready' && (
                  <div className="mt-1 bg-[rgba(89,238,80,0.1)] text-[#59ee50] p-1.5 rounded-[4px]">
                    Actualización lista. <button onClick={(e) => { e.preventDefault(); (window as any).electronAPI?.installUpdate(); }} className="underline hover:text-[#7dff75]">Instalar y reiniciar</button>
                  </div>
                )}
                {updatePhase === 'error' && (
                  <div className="mt-1 bg-[rgba(255,115,70,0.1)] text-[#ff7346] p-1.5 rounded-[4px]">Error de actualización</div>
                )}
              </div>`
);

// We should also remove the version from the header in Cyberbistro since we moved it below the credentials.
c = c.replace(
  "        <div className=\"font-['Inter',sans-serif] text-[#adaaaa] text-[10px] sm:text-[12px] text-center tracking-[1px] sm:tracking-[1.2px] uppercase\">\n          Gastronomy Operating System · {__APP_VERSION__}\n        </div>",
  "        <div className=\"font-['Inter',sans-serif] text-[#adaaaa] text-[10px] sm:text-[12px] text-center tracking-[1px] sm:tracking-[1.2px] uppercase\">\n          Gastronomy Operating System\n        </div>"
);

c = c.replace(
  "        <div className=\"font-['Inter',sans-serif] text-[#adaaaa] text-[10px] sm:text-[12px] text-center tracking-[1px] sm:tracking-[1.2px] uppercase\">\r\n          Gastronomy Operating System · {__APP_VERSION__}\r\n        </div>",
  "        <div className=\"font-['Inter',sans-serif] text-[#adaaaa] text-[10px] sm:text-[12px] text-center tracking-[1px] sm:tracking-[1.2px] uppercase\">\r\n          Gastronomy Operating System\r\n        </div>"
);

fs.writeFileSync(path, c);
console.log("Updated Cyberbistro LoginForm.tsx successfully");
