
import { ScheduleSession } from './types';

export const DEFAULT_COMPANION_CONFIG = {
  host: '127.0.0.1',
  port: 8000,
  startPage: 1,
  startButton: 1,
  endPage: 1,
  endButton: 2,
};

export const BROADCAST_SCHEDULE: ScheduleSession[] = [
  {
    id: 'english-service',
    name: 'English Service',
    day: 0, // Sunday
    startTime: '09:15',
    endTime: '10:15',
  },
  {
    id: 'chinese-service',
    name: 'Chinese Service',
    day: 0, // Sunday
    startTime: '10:30',
    endTime: '12:00',
  }
];

export const AI_SYSTEM_INSTRUCTION = `
You are a Broadcast Engineer AI Agent named "StreamPilot".
Your primary goal is to automate the ATEM (via Companion) and YouTube Live lifecycle using established PROTOCOLS.

OPERATIONAL PROTOCOLS:
1. START_PREROLL: Initiates pre-roll (Companion 1/7). Should be called 5-10 mins before start time.
2. BEGIN_STREAMING: Promotes stream to Live (Companion 1/8). Must follow Preroll.
3. END_STREAMING: Safely completes the broadcast (Companion 1/16). Called at session end.
4. RECOVERY_RESET: The "No Data" fix. Automatically runs (End -> Wait 10s -> Preroll -> Wait 20s -> Begin). Use this if bitrate is < 1000kbps during the 10-minute verification window.

DYNAMIC BROADCAST ID:
- Before starting any sequence, you MUST call 'list_upcoming_broadcasts' to identify the correct ID for the current time slot.

POLLING LOGIC:
- Verify ingest every 60s for the first 10 minutes after BEGIN_STREAMING.
- Otherwise, idle check every 5 minutes.
`;
