
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  StreamStatus, 
  StreamHealth, 
  BroadcastLog, 
  StreamMetrics, 
  CompanionConfig, 
  YouTubeConfig,
  ScheduleSession
} from './types';
import { DEFAULT_COMPANION_CONFIG, BROADCAST_SCHEDULE } from './constants';
import { runAgentInference } from './services/geminiService';
import MetricsChart from './components/MetricsChart';

const VERIFICATION_WINDOW_MS = 10 * 60 * 1000; 

const App: React.FC = () => {
  // Config
  const [companionConfig, setCompanionConfig] = useState<CompanionConfig>(() => {
    const saved = localStorage.getItem('companion_config');
    return saved ? JSON.parse(saved) : DEFAULT_COMPANION_CONFIG;
  });
  const [ytConfig, setYtConfig] = useState<YouTubeConfig>(() => {
    const saved = localStorage.getItem('youtube_config');
    return saved ? JSON.parse(saved) : { broadcastId: '', streamName: 'Main_FHD_60', refreshToken: '' };
  });

  // UI & Metrics
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [status, setStatus] = useState<StreamStatus>(StreamStatus.IDLE);
  const [health, setHealth] = useState<StreamHealth>(StreamHealth.UNKNOWN);
  const [logs, setLogs] = useState<BroadcastLog[]>([]);
  const [metrics, setMetrics] = useState<StreamMetrics>({
    bitrate: 4500,
    fps: 60,
    droppedFrames: 0,
    viewerCount: 0,
    concurrentViewers: 0
  });
  const [metricsHistory, setMetricsHistory] = useState<Array<{ time: string; bitrate: number; dropped: number }>>([]);
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const [isAutoSchedule, setIsAutoSchedule] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showToken, setShowToken] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [activeProtocolStep, setActiveProtocolStep] = useState<string | null>(null);
  
  // Ref tracking
  const [streamStartedAt, setStreamStartedAt] = useState<number | null>(null);
  const statusRef = useRef(status);

  useEffect(() => {
    localStorage.setItem('companion_config', JSON.stringify(companionConfig));
    localStorage.setItem('youtube_config', JSON.stringify(ytConfig));
  }, [companionConfig, ytConfig]);

  const addLog = useCallback((message: string, source: BroadcastLog['source'], level: BroadcastLog['level'] = 'info') => {
    const newLog: BroadcastLog = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date(),
      level,
      message,
      source
    };
    setLogs(prev => [newLog, ...prev].slice(0, 100));
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // High-Level Protocol Implementation
  const runProtocol = async (protocol: string, broadcastId: string) => {
    setActiveProtocolStep(`Initializing ${protocol}...`);
    addLog(`Protocol Triggered: ${protocol} (ID: ${broadcastId})`, 'SYSTEM', 'info');

    try {
      if (protocol === 'START_PREROLL') {
        addLog('Action: Pressing 1/7 (Preroll)', 'COMPANION', 'info');
        setStatus(StreamStatus.STARTING);
        // Simulation of API call to Companion
      }
      
      if (protocol === 'BEGIN_STREAMING') {
        setActiveProtocolStep('Waiting 20s for RTMP handshake...');
        await wait(20000);
        addLog('Action: Pressing 1/8 (Begin)', 'COMPANION', 'info');
        setStatus(StreamStatus.LIVE);
        setStreamStartedAt(Date.now());
      }

      if (protocol === 'END_STREAMING') {
        addLog('Action: Pressing 1/16 (End)', 'COMPANION', 'info');
        setStatus(StreamStatus.COMPLETED);
        setStreamStartedAt(null);
      }

      if (protocol === 'RECOVERY_RESET') {
        addLog('INITIATING RECOVERY RESET CYCLE', 'AI_AGENT', 'warn');
        
        setActiveProtocolStep('Step 1: Stop Current Stream (1/16)...');
        addLog('Action: Pressing 1/16', 'COMPANION', 'warn');
        await wait(10000);
        
        setActiveProtocolStep('Step 2: Restarting Preroll (1/7)...');
        addLog('Action: Pressing 1/7', 'COMPANION', 'info');
        await wait(20000);
        
        setActiveProtocolStep('Step 3: Begin Streaming (1/8)...');
        addLog('Action: Pressing 1/8', 'COMPANION', 'info');
        setStatus(StreamStatus.LIVE);
        setStreamStartedAt(Date.now());
      }

      setActiveProtocolStep(null);
      addLog(`${protocol} Completed successfully.`, 'SYSTEM', 'info');
    } catch (err) {
      addLog(`Protocol Error: ${err}`, 'SYSTEM', 'error');
      setActiveProtocolStep(null);
    }
  };

  const runAgentTurn = useCallback(async (customPrompt?: string) => {
    if (!isAgentRunning && !customPrompt) return;

    const currentHHmm = currentTime.getHours().toString().padStart(2, '0') + ':' + currentTime.getMinutes().toString().padStart(2, '0');
    const timeSinceStart = streamStartedAt ? Date.now() - streamStartedAt : 0;
    const isInsideVerificationWindow = statusRef.current === StreamStatus.LIVE && timeSinceStart < VERIFICATION_WINDOW_MS;

    const contextPrompt = customPrompt || `
      CURRENT TIME: ${currentTime.toLocaleDateString()} ${currentHHmm}
      MODE: ${isAutoSchedule ? 'AUTO' : 'MANUAL'}
      SESSION_STATUS: ${statusRef.current}
      TIME_ELAPSED_SINCE_LIVE: ${Math.floor(timeSinceStart / 1000 / 60)} minutes
      INGEST_GUARD_ACTIVE: ${isInsideVerificationWindow}
      
      CONFIG: Companion @ ${companionConfig.host}, Broadcast ID: ${ytConfig.broadcastId || 'UNKNOWN'}
      TELEMETRY: Bitrate: ${metrics.bitrate}kbps, Ingest Health: ${health}
      
      DECISION: Evaluate if a Protocol (START_PREROLL, BEGIN_STREAMING, END_STREAMING, RECOVERY_RESET) needs to be executed based on the schedule and health.
    `;

    try {
      const response = await runAgentInference(contextPrompt);
      const calls = response.functionCalls || [];

      if (calls.length > 0) {
        for (const call of calls) {
          if (call.name === 'execute_broadcast_protocol') {
            const { protocol, broadcastId } = call.args as any;
            await runProtocol(protocol, broadcastId);
          }
          if (call.name === 'list_upcoming_broadcasts') {
            setIsDiscovering(true);
            addLog(`Querying YouTube...`, 'YOUTUBE', 'info');
            setTimeout(() => {
              const mockId = "YT_LIVE_" + Math.random().toString(36).substr(2, 5).toUpperCase();
              setYtConfig(prev => ({ ...prev, broadcastId: mockId }));
              addLog(`Discovered Broadcast ID: ${mockId}`, 'YOUTUBE', 'info');
              setIsDiscovering(false);
            }, 2000);
          }
          if (call.name === 'report_status') {
            const { message, urgency } = call.args as any;
            addLog(`Agent: ${message}`, 'AI_AGENT', urgency === 'high' ? 'warn' : 'info');
          }
        }
      } else if (response.text) {
        addLog(response.text, 'AI_AGENT', 'ai');
      }
    } catch (error) {
      addLog(`AI Error: ${error}`, 'SYSTEM', 'error');
    }
  }, [isAgentRunning, isAutoSchedule, health, metrics, currentTime, streamStartedAt, addLog, companionConfig, ytConfig]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // Simulated Telemetry
  useEffect(() => {
    const interval = setInterval(() => {
      if (status === StreamStatus.LIVE) {
        const timeSinceStart = streamStartedAt ? Date.now() - streamStartedAt : 0;
        const isVerifying = timeSinceStart < VERIFICATION_WINDOW_MS;
        let newBitrate = Math.floor(Math.random() * 2000) + 3000;
        
        // Occasional "No Data" simulation
        if (isVerifying && Math.random() > 0.985) newBitrate = 45;

        setMetrics(prev => ({ ...prev, bitrate: newBitrate }));
        setMetricsHistory(prev => [...prev, { time: new Date().toLocaleTimeString([], { hour12: false }), bitrate: newBitrate, dropped: 0 }].slice(-20));
        
        if (newBitrate < 500) setHealth(StreamHealth.CRITICAL);
        else if (newBitrate < 2500) setHealth(StreamHealth.BAD);
        else setHealth(StreamHealth.EXCELLENT);
      } else {
        setHealth(StreamHealth.UNKNOWN);
        setMetrics(prev => ({ ...prev, bitrate: 0 }));
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [status, streamStartedAt]);

  // Agent Polling Control
  useEffect(() => {
    let timer: any;
    if (isAgentRunning) {
      const timeSinceStart = streamStartedAt ? Date.now() - streamStartedAt : 0;
      const isVerifying = status === StreamStatus.LIVE && timeSinceStart < VERIFICATION_WINDOW_MS;
      const interval = isVerifying ? 60000 : 300000;
      
      timer = setInterval(() => runAgentTurn(), interval);
      addLog(`Mode: ${isVerifying ? 'Verification (60s)' : 'Maintenance (300s)'}`, "SYSTEM", "info");
    }
    return () => clearInterval(timer);
  }, [isAgentRunning, status, streamStartedAt, runAgentTurn]);

  const activeSession = useMemo(() => {
    const currentHHmm = currentTime.getHours().toString().padStart(2, '0') + ':' + currentTime.getMinutes().toString().padStart(2, '0');
    return BROADCAST_SCHEDULE.find(s => s.day === currentTime.getDay() && currentHHmm >= s.startTime && currentHHmm <= s.endTime);
  }, [currentTime]);

  const timeSinceStart = streamStartedAt ? Date.now() - streamStartedAt : 0;
  const verificationProgress = Math.min(100, (timeSinceStart / VERIFICATION_WINDOW_MS) * 100);
  const isVerifying = status === StreamStatus.LIVE && timeSinceStart < VERIFICATION_WINDOW_MS;

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col gap-6 max-w-7xl mx-auto">
      {/* Settings */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="glass w-full max-w-lg rounded-3xl p-8 shadow-2xl">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-xl font-bold">System Configuration</h2>
              <button onClick={() => setIsSettingsOpen(false)} className="text-slate-400 hover:text-white p-2">
                <i className="fas fa-times text-xl"></i>
              </button>
            </div>
            <div className="space-y-6">
              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">YouTube Integration</label>
                <div className="relative">
                  <input 
                    type={showToken ? "text" : "password"} 
                    placeholder="Refresh Token" 
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm focus:border-blue-500 outline-none pr-12"
                    value={ytConfig.refreshToken || ''}
                    onChange={(e) => setYtConfig({...ytConfig, refreshToken: e.target.value})}
                  />
                  <button onClick={() => setShowToken(!showToken)} className="absolute right-4 top-3.5 text-slate-500">
                    <i className={`fas ${showToken ? 'fa-eye-slash' : 'fa-eye'} text-xs`}></i>
                  </button>
                </div>
              </div>
              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Companion Connection</label>
                <div className="flex gap-3">
                  <input 
                    type="text" 
                    placeholder="Host (127.0.0.1)" 
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm focus:border-blue-500 outline-none"
                    value={companionConfig.host}
                    onChange={(e) => setCompanionConfig({...companionConfig, host: e.target.value})}
                  />
                  <input 
                    type="number" 
                    placeholder="Port" 
                    className="w-24 bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm focus:border-blue-500 outline-none"
                    value={companionConfig.port}
                    onChange={(e) => setCompanionConfig({...companionConfig, port: parseInt(e.target.value) || 8000})}
                  />
                </div>
              </div>
            </div>
            <button 
              onClick={() => setIsSettingsOpen(false)}
              className="w-full mt-10 py-4 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-2xl transition-all shadow-xl shadow-blue-900/40 uppercase tracking-widest text-xs"
            >
              Update Configuration
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 glass p-6 rounded-3xl border-slate-800 shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-3.5 rounded-2xl">
            <i className="fas fa-satellite-dish text-2xl text-white"></i>
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tighter">STREAMPILOT</h1>
            <div className="text-slate-500 text-xs font-mono mt-0.5">{currentTime.toLocaleTimeString()}</div>
          </div>
        </div>

        <div className="flex items-center gap-4">
           <button onClick={() => setIsSettingsOpen(true)} className="p-3 rounded-2xl border border-slate-800 text-slate-400 hover:text-white transition-all">
             <i className="fas fa-cog"></i>
           </button>
           <button 
              onClick={() => setIsAutoSchedule(!isAutoSchedule)}
              className={`text-[10px] font-black px-3 py-1 rounded-lg border ${isAutoSchedule ? 'bg-blue-500/10 border-blue-500 text-blue-400' : 'bg-slate-900 border-slate-800 text-slate-600'}`}
            >
              AUTO: {isAutoSchedule ? 'ON' : 'OFF'}
            </button>
          <button 
            onClick={() => setIsAgentRunning(!isAgentRunning)}
            className={`px-8 py-3 rounded-2xl font-black text-xs tracking-widest uppercase transition-all ${
              isAgentRunning ? 'bg-red-500/10 text-red-400 border border-red-500/50' : 'bg-blue-600 text-white shadow-2xl shadow-blue-900/40'
            }`}
          >
            {isAgentRunning ? 'Stop Agent' : 'Start Agent'}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
        <div className="lg:col-span-8 flex flex-col gap-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="glass p-6 rounded-3xl border-slate-800/50">
              <span className="text-slate-500 text-[10px] font-black uppercase mb-2 block">YouTube Stream</span>
              <div className="text-sm font-mono font-bold text-slate-200 truncate">
                {ytConfig.broadcastId || 'SEARCHING...'}
              </div>
            </div>
            <div className="glass p-6 rounded-3xl border-slate-800/50">
              <span className="text-slate-500 text-[10px] font-black uppercase mb-2 block">Status</span>
              <div className="flex items-center gap-2">
                 <div className={`w-2 h-2 rounded-full ${status === StreamStatus.LIVE ? 'bg-red-500 status-pulse' : 'bg-slate-600'}`}></div>
                 <div className="text-sm font-bold uppercase text-white">{status}</div>
              </div>
            </div>
            <div className="glass p-6 rounded-3xl border-slate-800/50">
              <span className="text-slate-500 text-[10px] font-black uppercase mb-2 block">Health</span>
              <div className={`text-sm font-bold ${health === StreamHealth.EXCELLENT ? 'text-green-400' : 'text-red-400'}`}>{health}</div>
            </div>
          </div>

          {/* Protocol Step Indicator */}
          {activeProtocolStep && (
            <div className="bg-blue-600/10 border border-blue-500/50 p-4 rounded-2xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                 <i className="fas fa-circle-notch animate-spin text-blue-400"></i>
                 <span className="text-sm font-bold text-blue-300 uppercase tracking-widest">{activeProtocolStep}</span>
              </div>
              <div className="text-[10px] font-black text-blue-500 uppercase">Hardware Busy</div>
            </div>
          )}

          {status === StreamStatus.LIVE && (
            <div className="glass p-8 rounded-3xl border-slate-800/50">
              <div className="flex justify-between items-end mb-4">
                <h3 className="text-sm font-black flex items-center gap-2 text-white uppercase">
                  {isVerifying ? <><i className="fas fa-shield-halved text-blue-400 animate-pulse"></i> Ingest Guard Active</> : <><i className="fas fa-check-circle text-green-400"></i> Stream Stable</>}
                </h3>
                <span className="text-xs font-mono text-blue-400">{Math.floor(verificationProgress)}%</span>
              </div>
              <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
                <div className={`h-full transition-all duration-1000 ${isVerifying ? 'bg-blue-600' : 'bg-green-500'}`} style={{ width: `${verificationProgress}%` }}></div>
              </div>
            </div>
          )}

          <div className="glass p-8 rounded-3xl border-slate-800/50">
            <MetricsChart data={metricsHistory} />
          </div>

          <div className="glass rounded-3xl flex flex-col flex-1 min-h-[350px] overflow-hidden">
             <div className="bg-slate-800/30 px-6 py-4 border-b border-slate-800 flex justify-between items-center">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Operation Log</span>
                <span className="text-[9px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded font-bold">MONITORING</span>
             </div>
             <div className="p-6 flex-1 overflow-y-auto font-mono text-xs space-y-2">
               {logs.map(log => (
                 <div key={log.id} className="flex gap-4">
                   <span className="text-slate-700 whitespace-nowrap">[{log.timestamp.toLocaleTimeString([], {hour12: false})}]</span>
                   <span className={`font-black px-1.5 rounded-[4px] text-[9px] min-w-[75px] text-center border ${
                     log.source === 'AI_AGENT' ? 'text-purple-400 border-purple-500/20' :
                     log.source === 'YOUTUBE' ? 'text-red-400 border-red-500/20' : 'text-blue-400 border-blue-500/20'
                   }`}>{log.source}</span>
                   <span className={log.level === 'ai' ? 'text-purple-300 italic' : 'text-slate-300'}>{log.message}</span>
                 </div>
               ))}
             </div>
          </div>
        </div>

        <div className="lg:col-span-4 flex flex-col gap-6">
          <section className="glass p-8 rounded-3xl bg-gradient-to-br from-slate-900 to-slate-800/40">
            <h3 className="font-black text-[11px] tracking-widest text-slate-500 uppercase mb-6">Schedule</h3>
            <div className="space-y-4">
              {BROADCAST_SCHEDULE.map(session => {
                const isCurrent = activeSession?.id === session.id;
                return (
                  <div key={session.id} className={`p-5 rounded-2xl border ${isCurrent ? 'bg-blue-600/10 border-blue-500/50 shadow-xl' : 'bg-slate-900/40 border-slate-800'}`}>
                    <div className="flex justify-between items-center mb-1">
                      <span className={`text-sm font-bold ${isCurrent ? 'text-blue-400' : 'text-slate-300'}`}>{session.name}</span>
                      {isCurrent && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div>}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">{session.startTime} — {session.endTime}</div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="glass p-8 rounded-3xl">
             <h3 className="font-black text-[11px] tracking-widest text-slate-500 uppercase mb-6">Device Context</h3>
             <div className="space-y-4">
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-slate-500">Wait Intervals</span>
                  <span className="text-slate-300 font-bold">10s / 20s</span>
                </div>
                <div className="flex justify-between items-center text-[11px]">
                   <span className="text-slate-500">Host IP</span>
                   <span className="text-slate-300 font-mono">{companionConfig.host}</span>
                </div>
                <div className="flex justify-between items-center text-[11px]">
                   <span className="text-slate-500">Companion Port</span>
                   <span className="text-slate-300 font-mono">{companionConfig.port}</span>
                </div>
             </div>
          </section>

          <div className="flex-1 glass p-8 rounded-3xl flex flex-col items-center justify-center text-center gap-6 border-slate-800 shadow-2xl relative overflow-hidden group">
            <div className={`p-8 rounded-full border-2 transition-all duration-700 ${isAgentRunning ? 'border-blue-500/50 text-blue-400 bg-blue-500/5' : 'border-slate-800 text-slate-800'}`}>
              <i className="fas fa-fingerprint text-5xl"></i>
            </div>
            <div>
              <h4 className="font-black text-slate-300 uppercase tracking-widest text-[10px]">{isAgentRunning ? 'Autopilot Engaged' : 'System Dormant'}</h4>
              <p className="text-[11px] text-slate-500 px-6 mt-3 leading-relaxed">
                {isAgentRunning ? "The Agent is managing protocols. Windows 10 wait-times are enforced for device reliability." : "Start the Agent to enable protocol automation."}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
