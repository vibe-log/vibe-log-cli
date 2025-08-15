/**
 * Types for vibe-log prompt orchestration
 */

export interface PromptContext {
  timeframe: string;
  days: number;
  projectPaths: string[];
  projectNames: string[];
}

export interface OrchestratedPrompt {
  prompt: string;
  systemPrompt: string;
  command: string;
  description: string;
}

export type SubAgentPhase = 'collection' | 'analysis' | 'visualization' | 'content';

export interface PhaseInstruction {
  phase: SubAgentPhase;
  agents: string[];
  objectives: string[];
}