
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

const AGENT_API_URL = 'http://localhost:8080/api/status';

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

  // Sync Mode State
  const [isSyncMode, setIsSyncMode] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  // UI State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'connection' | 'production'>('connection');
  const [status, setStatus] = useState<StreamStatus>(StreamStatus.IDLE);
  const [health, setHealth] = useState<StreamHealth>(StreamHealth.UNKNOWN);
  const [logs, setLogs] = useState<BroadcastLog[]>([]);
  const [metrics, setMetrics] = useState<StreamMetrics>({ bitrate: 0, fps: 0, droppedFrames: 0, viewerCount: 0, concurrentViewers: 0 });
  const [metricsHistory, setMetricsHistory] = useState<any[]>([]);
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Background Sync Loop
  useEffect(() => {
    if (!isSyncMode) return;

    const poll = async () => {
      try {
        const res = await fetch(AGENT_API_URL);
        const data = await res.json();
        setIsConnected(true);
        setStatus(data.status);
        setHealth(data.health);
        setYtConfig(prev => ({ ...prev, broadcastId: data.broadcastId }));
        setLogs(data.logs);
        setMetrics(prev => ({ ...prev, bitrate: data.metrics.bitrate }));
        setMetricsHistory(data.metrics.history);
      } catch (err) {
        setIsConnected(false);
      }
    };

    const timer = setInterval(poll, 2000);
    poll();
    return () => clearInterval(timer);
  }, [isSyncMode]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const copyEnvToClipboard = () => {
    const env = `API_KEY=YOUR_GEMINI_API_KEY
COMPANION_HOST=${companionConfig.host}
COMPANION_PORT=${companionConfig.port}
AGENT_API_PORT=8080
YOUTUBE_REFRESH_TOKEN=${ytConfig.refreshToken || ''}`;
    navigator.clipboard.writeText(env);
    alert('Environment variables copied to clipboard!');
  };

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col gap-6 max-w-7xl mx-auto">
      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
           <div className="glass w-full max-w-xl rounded-3xl p-8 shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold">System Management</h2>
                <div className="flex bg-slate-800 p-1 rounded-xl">
                  <button 
                    onClick={() => setSettingsTab('connection')}
                    className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${settingsTab === 'connection' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}
                  >
                    Sync Mode
                  </button>
                  <button 
                    onClick={() => setSettingsTab('production')}
                    className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${settingsTab === 'production' ? 'bg-purple-600 text-white' : 'text-slate-400'}`}
                  >
                    Prod Setup
                  </button>
                </div>
              </div>

              {settingsTab === 'connection' ? (
                <div className="space-y-4">
                  <button 
                    onClick={() => setIsSyncMode(false)}
                    className={`w-full p-4 rounded-2xl border text-left flex justify-between items-center transition-all ${!isSyncMode ? 'border-blue-500 bg-blue-500/10' : 'border-slate-800 hover:border-slate-700'}`}
                  >
                    <div>
                      <div className="font-bold text-sm">Standalone (UI-only)</div>
                      <div className="text-[10px] text-slate-500">Runs logic in this browser tab. Stops when closed.</div>
                    </div>
                    {!isSyncMode && <i className="fas fa-check-circle text-blue-500"></i>}
                  </button>
                  <button 
                    onClick={() => setIsSyncMode(true)}
                    className={`w-full p-4 rounded-2xl border text-left flex justify-between items-center transition-all ${isSyncMode ? 'border-purple-500 bg-purple-500/10' : 'border-slate-800 hover:border-slate-700'}`}
                  >
                    <div>
                      <div className="font-bold text-sm">Sync with Background Agent</div>
                      <div className="text-[10px] text-slate-500">Connects to Node.js service running on localhost:8080.</div>
                    </div>
                    {isSyncMode && <i className="fas fa-check-circle text-purple-500"></i>}
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 font-mono text-[11px] text-blue-300">
                    <div className="mb-2 text-slate-500 uppercase text-[9px] font-black tracking-tighter">Recommended .env for production</div>
                    <p>API_KEY=YOUR_GEMINI_API_KEY</p>
                    <p>COMPANION_HOST={companionConfig.host}</p>
                    <p>COMPANION_PORT={companionConfig.port}</p>
                    <p>AGENT_API_PORT=8080</p>
                    <p>YOUTUBE_REFRESH_TOKEN={ytConfig.refreshToken || '...'}</p>
                  </div>
                  <button 
                    onClick={copyEnvToClipboard}
                    className="w-full py-3 bg-purple-600/20 text-purple-400 border border-purple-500/30 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-purple-600/30 transition-all"
                  >
                    <i className="fas fa-copy mr-2"></i> Copy .env Template
                  </button>
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Target Dependencies</h4>
                    <p className="text-[11px] text-slate-400">Install these on the production machine: <code className="bg-slate-900 px-1.5 py-0.5 rounded text-blue-400">@google/genai dotenv express cors</code></p>
                  </div>
                </div>
              )}

              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="w-full mt-8 py-4 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-2xl transition-all uppercase tracking-widest text-[10px]"
              >
                Close Settings
              </button>
           </div>
        </div>
      )}

      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 glass p-6 rounded-3xl border-slate-800 shadow-2xl">
        <div className="flex items-center gap-4">
          <div className={`p-3.5 rounded-2xl transition-colors ${isSyncMode ? 'bg-purple-600 shadow-purple-500/20' : 'bg-blue-600 shadow-blue-500/20'}`}>
            <i className={`fas ${isSyncMode ? 'fa-network-wired' : 'fa-satellite-dish'} text-2xl text-white`}></i>
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tighter">STREAMPILOT</h1>
            <div className="flex items-center gap-2 text-slate-500 text-[10px] font-mono mt-0.5">
              <div className={`w-1.5 h-1.5 rounded-full ${isSyncMode ? (isConnected ? 'bg-green-500' : 'bg-red-500') : 'bg-blue-500'}`}></div>
              {isSyncMode ? (isConnected ? 'CONNECTED TO BACKGROUND AGENT' : 'AGENT DISCONNECTED') : 'LOCAL SIMULATION MODE'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={() => setIsSettingsOpen(true)} className="p-3 rounded-2xl border border-slate-800 text-slate-400 hover:text-white transition-all">
             <i className="fas fa-cog"></i>
          </button>
          {!isSyncMode && (
             <button 
              onClick={() => setIsAgentRunning(!isAgentRunning)}
              className={`px-8 py-3 rounded-2xl font-black text-[10px] tracking-widest uppercase transition-all ${
                isAgentRunning ? 'bg-red-500/10 text-red-400 border border-red-500/50' : 'bg-blue-600 text-white shadow-xl'
              }`}
            >
              {isAgentRunning ? 'Stop UI Loop' : 'Start UI Loop'}
            </button>
          )}
          {isSyncMode && (
            <div className="px-6 py-3 rounded-2xl bg-purple-600/10 border border-purple-500/30 text-purple-400 font-black text-[10px] tracking-widest uppercase">
              Monitoring Service
            </div>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
        <div className="lg:col-span-8 flex flex-col gap-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="glass p-6 rounded-3xl border-slate-800/50">
              <span className="text-slate-500 text-[10px] font-black uppercase mb-2 block">YouTube ID</span>
              <div className="text-sm font-mono font-bold text-slate-200 truncate">{ytConfig.broadcastId || 'IDLE'}</div>
            </div>
            <div className="glass p-6 rounded-3xl border-slate-800/50">
              <span className="text-slate-500 text-[10px] font-black uppercase mb-2 block">Session Status</span>
              <div className="flex items-center gap-2">
                 <div className={`w-2 h-2 rounded-full ${status === StreamStatus.LIVE ? 'bg-red-500 status-pulse' : 'bg-slate-600'}`}></div>
                 <div className="text-sm font-bold uppercase text-white">{status}</div>
              </div>
            </div>
            <div className="glass p-6 rounded-3xl border-slate-800/50">
              <span className="text-slate-500 text-[10px] font-black uppercase mb-2 block">Bitrate</span>
              <div className="text-sm font-mono font-bold text-blue-400">{metrics.bitrate.toLocaleString()} kbps</div>
            </div>
          </div>

          <div className="glass p-8 rounded-3xl border-slate-800/50">
            <MetricsChart data={metricsHistory} />
          </div>

          <div className="glass rounded-3xl flex flex-col flex-1 min-h-[350px] overflow-hidden">
             <div className="bg-slate-800/30 px-6 py-4 border-b border-slate-800 flex justify-between items-center">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Live Agent Logs</span>
                {isSyncMode && <span className="text-[9px] text-purple-400 font-bold"><i className="fas fa-cloud-download-alt mr-1"></i> SYNCED</span>}
             </div>
             <div className="p-6 flex-1 overflow-y-auto font-mono text-xs space-y-2">
               {logs.map((log: any) => (
                 <div key={log.id} className="flex gap-4">
                   <span className="text-slate-700">[{new Date(log.timestamp).toLocaleTimeString([], {hour12: false})}]</span>
                   <span className={`font-black px-1.5 rounded-[4px] text-[9px] min-w-[75px] text-center border ${
                     log.source === 'AI_AGENT' ? 'text-purple-400 border-purple-500/20' : 'text-blue-400 border-blue-500/20'
                   }`}>{log.source}</span>
                   <span className="text-slate-300">{log.message}</span>
                 </div>
               ))}
               {logs.length === 0 && <div className="text-slate-600 italic">No activity detected.</div>}
             </div>
          </div>
        </div>

        <div className="lg:col-span-4 flex flex-col gap-6">
           <section className="glass p-8 rounded-3xl">
             <h3 className="font-black text-[11px] tracking-widest text-slate-500 uppercase mb-6">Device Context</h3>
             <div className="space-y-4">
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-slate-500">Service Mode</span>
                  <span className={`font-black px-2 py-0.5 rounded-lg border ${isSyncMode ? 'text-purple-400 border-purple-500/30' : 'text-blue-400 border-blue-500/30'}`}>
                    {isSyncMode ? 'REMOTE SYNC' : 'STANDALONE'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[11px]">
                   <span className="text-slate-500">Node API</span>
                   <span className="text-slate-300 font-mono">localhost:8080</span>
                </div>
             </div>
          </section>

          <div className="flex-1 glass p-8 rounded-3xl flex flex-col items-center justify-center text-center gap-6 border-slate-800 relative overflow-hidden">
            <div className={`p-8 rounded-full border-2 transition-all duration-700 ${isSyncMode && isConnected ? 'border-green-500/50 text-green-400 bg-green-500/5' : 'border-slate-800 text-slate-800'}`}>
              <i className={`fas ${isSyncMode ? 'fa-server' : 'fa-window-maximize'} text-5xl`}></i>
            </div>
            <div>
              <h4 className="font-black text-slate-300 uppercase tracking-widest text-[10px]">
                {isSyncMode ? 'Background Agent Linked' : 'Standalone UI Active'}
              </h4>
              <p className="text-[11px] text-slate-500 px-6 mt-3 leading-relaxed">
                {isSyncMode 
                  ? "The UI is currently a viewport for the Node.js background service. All logs and decisions are synced from the headless agent."
                  : "The UI is running its own autonomous logic. Monitoring will stop if this tab is closed."}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
