
export enum StreamStatus {
  IDLE = 'IDLE',
  STARTING = 'STARTING',
  LIVE = 'LIVE',
  ENDING = 'ENDING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

export enum StreamHealth {
  EXCELLENT = 'EXCELLENT',
  GOOD = 'GOOD',
  BAD = 'BAD',
  CRITICAL = 'CRITICAL',
  UNKNOWN = 'UNKNOWN'
}

export interface BroadcastLog {
  id: string;
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'ai';
  message: string;
  source: 'SYSTEM' | 'AI_AGENT' | 'YOUTUBE' | 'COMPANION';
}

export interface StreamMetrics {
  bitrate: number;
  fps: number;
  droppedFrames: number;
  viewerCount: number;
  concurrentViewers: number;
}

export interface CompanionConfig {
  host: string;
  port: number;
  startPage: number;
  startButton: number;
  endPage: number;
  endButton: number;
}

export interface YouTubeConfig {
  broadcastId: string;
  streamName: string;
  refreshToken?: string;
}

export interface ScheduleSession {
  id: string;
  name: string;
  day: number; // 0 for Sunday
  startTime: string; // HH:mm
  endTime: string; // HH:mm
}
