
import { GoogleGenAI, Type, FunctionDeclaration, GenerateContentResponse } from "@google/genai";
import { AI_SYSTEM_INSTRUCTION } from "../constants";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const protocolTool: FunctionDeclaration = {
  name: "execute_broadcast_protocol",
  description: "Executes one of the three core streaming workflows: Startup, Shutdown, or Health Recovery.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      protocol: { 
        type: Type.STRING, 
        enum: ["BEGIN_STREAM_SEQ", "END_STREAM_SEQ", "RETRANSMIT_SEQ"], 
        description: "The operational sequence to run." 
      },
      broadcastId: { type: Type.STRING, description: "The YouTube Broadcast ID context." }
    },
    required: ["protocol", "broadcastId"]
  }
};

const listBroadcastsTool: FunctionDeclaration = {
  name: "list_upcoming_broadcasts",
  description: "Fetches scheduled broadcasts to identify the active Slot ID.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      status: { type: Type.STRING, enum: ["upcoming", "active", "all"], description: "Filter status." }
    }
  }
};

const reportTool: FunctionDeclaration = {
  name: "report_status",
  description: "Reports AI reasoning or warnings to the UI dashboard.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      message: { type: Type.STRING, description: "Detailed status message." },
      urgency: { type: Type.STRING, enum: ["low", "medium", "high"], description: "Urgency level." }
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
      temperature: 0.1, // Lower temperature for more deterministic protocol selection
    }
  });
};