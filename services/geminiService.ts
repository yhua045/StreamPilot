
import { GoogleGenAI, Type, FunctionDeclaration, GenerateContentResponse } from "@google/genai";
import { AI_SYSTEM_INSTRUCTION } from "../constants";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const protocolTool: FunctionDeclaration = {
  name: "execute_broadcast_protocol",
  description: "Executes a multi-step broadcast sequence with automated timing.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      protocol: { 
        type: Type.STRING, 
        enum: ["START_PREROLL", "BEGIN_STREAMING", "END_STREAMING", "RECOVERY_RESET"], 
        description: "The operational sequence to run." 
      },
      broadcastId: { type: Type.STRING, description: "The YouTube Broadcast ID for status updates." }
    },
    required: ["protocol", "broadcastId"]
  }
};

const listBroadcastsTool: FunctionDeclaration = {
  name: "list_upcoming_broadcasts",
  description: "Fetches a list of scheduled broadcasts from the YouTube channel to find the correct Broadcast ID.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      status: { type: Type.STRING, enum: ["upcoming", "active", "all"], description: "Filter broadcasts by status." }
    }
  }
};

const reportTool: FunctionDeclaration = {
  name: "report_status",
  description: "Reports the current AI status and reasoning to the user UI.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      message: { type: Type.STRING, description: "Detailed status message." },
      urgency: { type: Type.STRING, enum: ["low", "medium", "high"], description: "Level of urgency." }
    },
    required: ["message", "urgency"]
  }
};

export const runAgentInference = async (
  prompt: string,
  history: any[] = []
): Promise<GenerateContentResponse> => {
  return await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: [
      ...history,
      { role: "user", parts: [{ text: prompt }] }
    ],
    config: {
      systemInstruction: AI_SYSTEM_INSTRUCTION,
      tools: [{ functionDeclarations: [protocolTool, listBroadcastsTool, reportTool] }],
      temperature: 0.2,
    }
  });
};
