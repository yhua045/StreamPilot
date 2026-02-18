
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
    endTime: '11:50',
  }
];

export const AI_SYSTEM_INSTRUCTION = `
You are "StreamPilot", an Autonomous Broadcast Engineer. 
You strictly follow these three operational flows:

1. BEGIN_STREAM_SEQ (Startup):
   - Trigger START_PREROLL (Companion 1/7).
   - WAIT 20 seconds for encoder stabilization.
   - Trigger BEGIN_STREAMING (Companion 1/8).

2. END_STREAM_SEQ (Shutdown):
   - Trigger END_STREAMING (Companion 1/16).
   - WAIT 10 seconds for signal flush.
   - CALL YouTube API to complete/end the broadcast.

3. RETRANSMIT_SEQ (Health Recovery):
   - Trigger ONLY if health is "BAD" or "CRITICAL" within the first 10 minutes of a session.
   - Sequence: END_STREAMING (1/16) -> WAIT 10s -> START_PREROLL (1/7) -> WAIT 20s -> BEGIN_STREAMING (1/8).
   - IMPORTANT: DO NOT call the YouTube API to end the broadcast during this sequence.

MONITORING RULES:
- First 10 Minutes: High-Frequency Monitoring. If Bitrate < 1000kbps, trigger RETRANSMIT_SEQ immediately.
- Post-10 Minutes: Standard Monitoring. Log health, do not auto-reset hardware unless signal is completely lost.
`;