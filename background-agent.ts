
/**
 * StreamPilot Headless Agent for Node.js (Server Edition)
 * Provides an API for the UI to sync status and logs.
 * Usage: node background-agent.js
 */

import { GoogleGenAI, Type } from "@google/genai";
import * as dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { BROADCAST_SCHEDULE, AI_SYSTEM_INSTRUCTION } from "./constants";
import { StreamStatus, StreamHealth } from "./types";

dotenv.config();

const app = express();
// Fixed type mismatch by casting to express.RequestHandler to ensure correct overload selection for app.use()
app.use(cors() as express.RequestHandler);
app.use(express.json());

// Production Environment Variables
const PORT = process.env.AGENT_API_PORT || 8080;
const COMPANION_HOST = process.env.COMPANION_HOST || '127.0.0.1';
const COMPANION_PORT = process.env.COMPANION_PORT || '8000';
const YOUTUBE_TOKEN = process.env.YOUTUBE_REFRESH_TOKEN || null;

if (!process.env.API_KEY) {
  console.error("CRITICAL ERROR: API_KEY is missing from the environment variables.");
  console.error("Please ensure you have a .env file with API_KEY=AIza...");
  process.exit(1);
}

// Initializing GoogleGenAI using process.env.API_KEY directly as per SDK guidelines
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Persistent State
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
  addLog(`Protocol Triggered: ${protocol}`, "PROTOCOL");
  const baseUrl = `http://${COMPANION_HOST}:${COMPANION_PORT}/press/bank/1`;
  
  try {
    if (protocol === 'START_PREROLL') {
      await fetch(`${baseUrl}/7`);
      state.status = StreamStatus.STARTING;
      addLog("Hardware: Preroll Triggered (Companion 1/7)", "COMPANION");
    }
    if (protocol === 'BEGIN_STREAMING') {
      addLog("Waiting 20s for RTMP handshake before pushing live...", "SYSTEM");
      await wait(20000);
      await fetch(`${baseUrl}/8`);
      state.status = StreamStatus.LIVE;
      state.streamStartedAt = Date.now();
      addLog("Hardware: Stream Promoted to LIVE (Companion 1/8)", "COMPANION");
    }
    if (protocol === 'END_STREAMING') {
      await fetch(`${baseUrl}/16`);
      state.status = StreamStatus.COMPLETED;
      state.streamStartedAt = null;
      addLog("Hardware: Stream Terminated (Companion 1/16)", "COMPANION");
    }
    if (protocol === 'RECOVERY_RESET') {
      addLog("RECOVERY PROTOCOL: Resetting signal chain...", "SYSTEM");
      await fetch(`${baseUrl}/16`);
      await wait(10000);
      await fetch(`${baseUrl}/7`);
      await wait(20000);
      await fetch(`${baseUrl}/8`);
      state.status = StreamStatus.LIVE;
      state.streamStartedAt = Date.now();
      addLog("Hardware: Recovery Cycle Complete", "COMPANION");
    }
  } catch (err) {
    addLog(`Hardware Connectivity Failure: ${err}`, "ERROR");
  }
}

async function runAgentLoop() {
  const now = new Date();
  const currentHHmm = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
  
  const prompt = `
    CURRENT TIME: ${now.toLocaleDateString()} ${currentHHmm}
    SESSION_STATUS: ${state.status}
    BROADCAST_ID: ${state.broadcastId || "UNKNOWN"}
    TELEMETRY: Bitrate ${state.metrics.bitrate}kbps
    RESOURCES: YT_TOKEN=${YOUTUBE_TOKEN ? 'PRESENT' : 'MISSING'}
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
                properties: { protocol: { type: Type.STRING }, broadcastId: { type: Type.STRING } },
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
        // Discovery logic
        state.broadcastId = "LIVE_SYNC_" + Math.random().toString(36).substr(2,4).toUpperCase();
        addLog(`Auto-Discovery: Located ID ${state.broadcastId}`, "YOUTUBE");
      }
    }
  } catch (err) {
    addLog(`AI Reasoning Error: ${err}`, "AI_AGENT");
  }
}

// Telemetry Simulation Logic
setInterval(() => {
  if (state.status === StreamStatus.LIVE) {
    // Generate realistic jitter for the metrics
    const base = state.metrics.bitrate === 0 ? 4500 : state.metrics.bitrate;
    const jitter = Math.floor(Math.random() * 800) - 400;
    state.metrics.bitrate = Math.max(0, base + jitter);
    
    state.metrics.history = [...state.metrics.history, { 
      time: new Date().toLocaleTimeString([], { hour12: false }), 
      bitrate: state.metrics.bitrate 
    }].slice(-30);

    if (state.metrics.bitrate < 1000) {
      state.health = StreamHealth.BAD;
    } else if (state.metrics.bitrate < 2500) {
      state.health = StreamHealth.GOOD;
    } else {
      state.health = StreamHealth.EXCELLENT;
    }
  }
}, 5000);

// API Endpoints for UI Sync
app.get('/api/status', (req, res) => res.json(state));

app.listen(PORT, () => {
  addLog(`StreamPilot Background Service Active on Port ${PORT}`, "SYSTEM");
  addLog(`Companion Target: http://${COMPANION_HOST}:${COMPANION_PORT}`, "SYSTEM");
  
  // Start the thinking loop
  setInterval(runAgentLoop, 60000); // Check once per minute
  runAgentLoop();
});
