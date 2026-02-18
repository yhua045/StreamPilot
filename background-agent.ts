
/**
 * StreamPilot Headless Agent for Node.js (Server Edition)
 * Strictly implements Begin, End, and Retransmit workflows.
 */

import { GoogleGenAI, Type } from "@google/genai";
import * as dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { BROADCAST_SCHEDULE, AI_SYSTEM_INSTRUCTION } from "./constants";
import { StreamStatus, StreamHealth } from "./types";

dotenv.config();

const app = express();
app.use(cors() as any);
app.use(express.json() as any);

const PORT = process.env.AGENT_API_PORT || 8080;
const COMPANION_HOST = process.env.COMPANION_HOST || '127.0.0.1';
const COMPANION_PORT = process.env.COMPANION_PORT || '8000';
const YOUTUBE_TOKEN = process.env.YOUTUBE_REFRESH_TOKEN || null;

if (!process.env.API_KEY) {
  console.error("CRITICAL ERROR: API_KEY is missing.");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const state = {
  status: StreamStatus.IDLE,
  health: StreamHealth.UNKNOWN,
  broadcastId: "",
  streamStartedAt: null as number | null,
  logs: [] as any[],
  metrics: {
    bitrate: 0,
    history: [] as any[]
  }
};

const addLog = (message: string, source = "SYSTEM") => {
  const logEntry = {
    id: Math.random().toString(36).substr(2, 9),
    timestamp: new Date(),
    message,
    source,
    level: source === 'AI_AGENT' ? 'ai' : 'info'
  };
  state.logs = [logEntry, ...state.logs].slice(0, 50);
  console.log(`[${logEntry.timestamp.toLocaleTimeString()}] [${source}] ${message}`);
};

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function executeProtocol(protocol: string) {
  const baseUrl = `http://${COMPANION_HOST}:${COMPANION_PORT}/press/bank/1`;
  
  try {
    if (protocol === 'BEGIN_STREAM_SEQ') {
      addLog("Starting BEGIN_STREAMING sequence...", "PROTOCOL");
      // 1. Preroll
      await fetch(`${baseUrl}/7`);
      state.status = StreamStatus.STARTING;
      addLog("Step 1/2: Hardware Preroll Triggered (1/7). Waiting 20s for stabilization...", "COMPANION");
      
      await wait(20000);
      
      // 2. Begin
      await fetch(`${baseUrl}/8`);
      state.status = StreamStatus.LIVE;
      state.streamStartedAt = Date.now();
      addLog("Step 2/2: Hardware Stream Live (1/8). Begin Streaming complete.", "COMPANION");
    }

    if (protocol === 'END_STREAM_SEQ') {
      addLog("Starting END_STREAMING sequence...", "PROTOCOL");
      // 1. Hardware Stop
      await fetch(`${baseUrl}/16`);
      state.status = StreamStatus.ENDING;
      addLog("Step 1/2: Hardware Terminated (1/16). Waiting 10s for buffer flush...", "COMPANION");
      
      await wait(10000);
      
      // 2. YouTube Stop (Simulated call)
      addLog("Step 2/2: Calling YouTube API broadcasts.transition(complete)...", "YOUTUBE");
      state.status = StreamStatus.COMPLETED;
      state.streamStartedAt = null;
      addLog("Shutdown complete. Session finalized.", "SYSTEM");
    }

    if (protocol === 'RETRANSMIT_SEQ') {
      addLog("⚠️ RETRANSMIT_SEQ triggered (Health Recovery).", "PROTOCOL");
      addLog("Hardware reset initiated. Note: YouTube session will NOT be closed.", "SYSTEM");
      
      // 1. Stop
      await fetch(`${baseUrl}/16`);
      addLog("Step 1/3: Signal drop (1/16). Waiting 10s...", "COMPANION");
      await wait(10000);
      
      // 2. Preroll
      await fetch(`${baseUrl}/7`);
      addLog("Step 2/3: Signal re-init (1/7). Waiting 20s...", "COMPANION");
      await wait(20000);
      
      // 3. Begin
      await fetch(`${baseUrl}/8`);
      state.status = StreamStatus.LIVE;
      addLog("Step 3/3: Signal restored (1/8). Retransmission complete.", "COMPANION");
    }
  } catch (err) {
    addLog(`Connectivity failure during sequence execution: ${err}`, "ERROR");
    state.status = StreamStatus.ERROR;
  }
}

async function runAgentLoop() {
  const now = new Date();
  const currentHHmm = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
  
  // Check if we are in the first 10 minutes of a live stream
  const minutesLive = state.streamStartedAt ? (Date.now() - state.streamStartedAt) / 60000 : 0;
  const inCriticalWindow = state.status === StreamStatus.LIVE && minutesLive < 10;

  const prompt = `
    CURRENT TIME: ${now.toLocaleDateString()} ${currentHHmm}
    SESSION_STATUS: ${state.status}
    MINUTES_LIVE: ${minutesLive.toFixed(1)}
    CRITICAL_WINDOW_ACTIVE: ${inCriticalWindow}
    BROADCAST_ID: ${state.broadcastId || "UNKNOWN"}
    TELEMETRY: Bitrate ${state.metrics.bitrate}kbps | Health ${state.health}
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction: AI_SYSTEM_INSTRUCTION,
        tools: [{ 
          functionDeclarations: [
            {
              name: "execute_broadcast_protocol",
              parameters: {
                type: Type.OBJECT,
                properties: { 
                  protocol: { type: Type.STRING, enum: ["BEGIN_STREAM_SEQ", "END_STREAM_SEQ", "RETRANSMIT_SEQ"] }, 
                  broadcastId: { type: Type.STRING } 
                },
                required: ["protocol", "broadcastId"]
              }
            },
            {
              name: "list_upcoming_broadcasts",
              parameters: { type: Type.OBJECT, properties: { status: { type: Type.STRING } } }
            }
          ] 
        }]
      }
    });

    const calls = response.functionCalls || [];
    for (const call of calls) {
      if (call.name === 'execute_broadcast_protocol') {
        const args = call.args as any;
        await executeProtocol(args.protocol);
      }
      if (call.name === 'list_upcoming_broadcasts') {
        state.broadcastId = "LIVE_" + currentHHmm.replace(':','');
        addLog(`Discovery: Monitoring Slot ID ${state.broadcastId}`, "YOUTUBE");
      }
    }
  } catch (err) {
    addLog(`AI reasoning failure: ${err}`, "AI_AGENT");
  }
}

// Telemetry Logic
setInterval(() => {
  if (state.status === StreamStatus.LIVE) {
    const base = state.metrics.bitrate === 0 ? 4500 : state.metrics.bitrate;
    const jitter = Math.floor(Math.random() * 800) - 400;
    state.metrics.bitrate = Math.max(0, base + jitter);
    
    state.metrics.history = [...state.metrics.history, { 
      time: new Date().toLocaleTimeString([], { hour12: false }), 
      bitrate: state.metrics.bitrate 
    }].slice(-30);

    if (state.metrics.bitrate < 1000) state.health = StreamHealth.CRITICAL;
    else if (state.metrics.bitrate < 2500) state.health = StreamHealth.GOOD;
    else state.health = StreamHealth.EXCELLENT;
  }
}, 5000);

app.get('/api/status', (req, res) => res.json(state));

app.listen(PORT, () => {
  addLog(`StreamPilot background agent listening on port ${PORT}`, "SYSTEM");
  setInterval(runAgentLoop, 60000);
  runAgentLoop();
});
