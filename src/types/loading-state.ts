import { PersonalityType } from '../lib/personality-manager';

/**
 * Loading state for prompt analysis
 * Written to latest.json when analysis begins, replaced when complete
 */
export interface LoadingState {
  status: 'loading';
  timestamp: string;
  sessionId?: string;
  personality?: PersonalityType;
  message?: string; // Optional custom loading message
}

/**
 * Union type for analysis file content
 * Can be either loading state or completed analysis
 */
export type AnalysisFileContent = LoadingState | CompletedAnalysis;

/**
 * Helper type guard to check if content is loading state
 */
export function isLoadingState(content: any): content is LoadingState {
  return content && content.status === 'loading';
}

/**
 * Check if a loading state is stale (older than 15 seconds)
 */
export function isStaleLoadingState(state: LoadingState, maxAgeMs: number = 15000): boolean {
  const stateTime = new Date(state.timestamp).getTime();
  const now = Date.now();
  return (now - stateTime) > maxAgeMs;
}

/**
 * Completed analysis state (extends existing PromptAnalysis)
 */
export interface CompletedAnalysis {
  status?: 'completed'; // Optional for backwards compatibility
  quality: 'poor' | 'fair' | 'good' | 'excellent';
  missing: string[];
  suggestion: string;
  score: number;
  contextualEmoji?: string;
  timestamp: string;
  sessionId?: string;
  originalPrompt?: string;
  promotionalTip?: string;
}

/**
 * Get loading message based on personality
 */
export function getLoadingMessage(personality?: PersonalityType, customName?: string): string {
  switch (personality) {
    case 'gordon':
      return "🔥 Gordon's inspecting your mise en place...";
    case 'vibe-log':
      return "💜 Vibe-log is compiling your prompt...";
    case 'custom':
      if (customName) {
        return `✨ ${customName} is analyzing your prompt...`;
      }
      return "✨ Analyzing your prompt...";
    default:
      return "⏳ Analyzing your prompt...";
  }
}