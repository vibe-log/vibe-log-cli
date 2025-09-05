export interface ReportData {
  metadata: {
    totalSessions: number;
    dataProcessed: string;
    activeDevelopment: string;
    projects: number;
    generatedAt: string;
    dateRange: string;
  };
  executiveSummary: string[];
  activityDistribution: {
    [activityType: string]: number; // percentages
  };
  keyAccomplishments: string[];
  promptQuality: {
    methodology: string;
    breakdown: {
      excellent: number;
      good: number;
      fair: number;
      poor: number;
    };
    insights: string;
    averageScore: number;
  };
  projectBreakdown: Array<{
    name: string;
    sessions: number;
    largestSession: string;
    focus: string;
  }>;
  reportGeneration: {
    duration: string;
    apiTime: string;
    turns: number;
    estimatedCost: number;
    sessionId: string;
  };
}