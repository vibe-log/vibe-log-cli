import type { ReportData } from '../src/types/report-data';

// Mock data for testing the report template system

export const minimalReportData: ReportData = {
  metadata: {
    totalSessions: 2,
    dataProcessed: "0.5 MB",
    activeDevelopment: "2h 15m",
    projects: 1,
    generatedAt: "December 5, 2024",
    dateRange: "December 1-5, 2024"
  },
  executiveSummary: [
    "Light development activity with 2 sessions focused on bug fixes",
    "Single project engagement showing targeted problem-solving"
  ],
  activityDistribution: {
    "Debugging": 60,
    "Testing": 40
  },
  keyAccomplishments: [
    "Fixed critical authentication bug in login flow",
    "Added comprehensive test coverage for user module"
  ],
  promptQuality: {
    methodology: "Session quality assessed based on context clarity and outcome achievement",
    breakdown: {
      excellent: 50,
      good: 50,
      fair: 0,
      poor: 0
    },
    insights: "Clear problem statements with successful resolutions",
    averageScore: 85
  },
  projectBreakdown: [
    {
      name: "auth-service",
      sessions: 2,
      largestSession: "256 KB",
      focus: "Bug fixes and testing improvements"
    }
  ],
  reportGeneration: {
    duration: "2m 15s",
    apiTime: "2m 30s",
    turns: 8,
    estimatedCost: 0.15,
    sessionId: "mock-minimal-001"
  }
};

export const typicalReportData: ReportData = {
  metadata: {
    totalSessions: 15,
    dataProcessed: "7.8 MB",
    activeDevelopment: "18h 30m",
    projects: 3,
    generatedAt: "December 5, 2024",
    dateRange: "November 29 - December 5, 2024"
  },
  executiveSummary: [
    "<strong>Productive week:</strong> 15 comprehensive development sessions across 3 active projects",
    "<strong>Feature-focused development:</strong> 60% of time spent on new feature implementation",
    "<strong>Quality emphasis:</strong> Significant testing and code review activities",
    "<strong>Multi-project coordination:</strong> Balanced progress across frontend, backend, and CLI tools"
  ],
  activityDistribution: {
    "Feature Development": 45,
    "Testing": 20,
    "Debugging": 15,
    "Refactoring": 10,
    "Planning": 10
  },
  keyAccomplishments: [
    "<strong>Payment Integration:</strong> Completed Stripe payment gateway integration with webhook handlers",
    "<strong>Dashboard Redesign:</strong> Implemented new analytics dashboard with real-time data visualization",
    "<strong>Performance Optimization:</strong> Reduced API response times by 40% through query optimization",
    "<strong>Test Coverage:</strong> Increased unit test coverage from 65% to 85%",
    "<strong>Documentation:</strong> Created comprehensive API documentation with OpenAPI spec"
  ],
  promptQuality: {
    methodology: "Evaluated based on problem articulation, context provision, and iterative refinement",
    breakdown: {
      excellent: 40,
      good: 35,
      fair: 20,
      poor: 5
    },
    insights: "Strong technical communication with room for improvement in initial context provision",
    averageScore: 78
  },
  projectBreakdown: [
    {
      name: "web-app",
      sessions: 7,
      largestSession: "1.2 MB",
      focus: "Frontend features and UI improvements"
    },
    {
      name: "api-service",
      sessions: 5,
      largestSession: "890 KB",
      focus: "Backend optimization and payment integration"
    },
    {
      name: "cli-tools",
      sessions: 3,
      largestSession: "450 KB",
      focus: "Command additions and bug fixes"
    }
  ],
  reportGeneration: {
    duration: "8m 45s",
    apiTime: "9m 12s",
    turns: 25,
    estimatedCost: 0.78,
    sessionId: "mock-typical-002"
  }
};

export const richReportData: ReportData = {
  metadata: {
    totalSessions: 52,
    dataProcessed: "28.4 MB",
    activeDevelopment: "72h 15m",
    projects: 8,
    generatedAt: "December 5, 2024",
    dateRange: "November 1 - December 5, 2024"
  },
  executiveSummary: [
    "<strong>Exceptional productivity:</strong> 52 intensive development sessions demonstrating sustained high-output delivery",
    "<strong>Enterprise-scale development:</strong> Managing 8 concurrent projects with complex interdependencies",
    "<strong>Full-stack mastery:</strong> Balanced work across frontend, backend, DevOps, and mobile platforms",
    "<strong>Innovation focus:</strong> 30% time dedicated to R&D and architectural improvements",
    "<strong>Team leadership:</strong> Code review and mentoring activities indicate senior technical role"
  ],
  activityDistribution: {
    "Feature Development": 35,
    "Architecture & Planning": 15,
    "Integration & Testing": 15,
    "Debugging & Optimization": 10,
    "Code Review": 10,
    "Research": 8,
    "Documentation": 7
  },
  keyAccomplishments: [
    "<strong>Microservices Migration:</strong> Successfully migrated monolithic application to microservices architecture (12 services)",
    "<strong>AI Feature Integration:</strong> Implemented GPT-4 powered code review assistant with 95% accuracy",
    "<strong>Mobile App Launch:</strong> Released React Native app to both iOS and Android stores (4.8★ rating)",
    "<strong>Performance Breakthrough:</strong> Achieved 10x performance improvement in data processing pipeline",
    "<strong>Security Hardening:</strong> Passed SOC2 compliance audit with zero critical findings",
    "<strong>Open Source Contribution:</strong> Published 3 NPM packages with 2,000+ weekly downloads",
    "<strong>Team Scaling:</strong> Onboarded and mentored 4 new developers with structured training program"
  ],
  promptQuality: {
    methodology: "Advanced analysis using context depth, technical sophistication, and outcome metrics",
    breakdown: {
      excellent: 65,
      good: 25,
      fair: 8,
      poor: 2
    },
    insights: "Exceptional prompt engineering with clear technical specifications and iterative refinement patterns",
    averageScore: 92
  },
  projectBreakdown: [
    {
      name: "enterprise-platform",
      sessions: 15,
      largestSession: "2.8 MB",
      focus: "Core platform architecture and scaling"
    },
    {
      name: "mobile-app",
      sessions: 10,
      largestSession: "1.9 MB",
      focus: "React Native cross-platform development"
    },
    {
      name: "data-pipeline",
      sessions: 8,
      largestSession: "2.1 MB",
      focus: "ETL optimization and real-time processing"
    },
    {
      name: "ai-assistant",
      sessions: 6,
      largestSession: "1.5 MB",
      focus: "ML model integration and prompt engineering"
    },
    {
      name: "auth-service",
      sessions: 5,
      largestSession: "980 KB",
      focus: "OAuth2 and SSO implementation"
    },
    {
      name: "analytics-dashboard",
      sessions: 4,
      largestSession: "1.1 MB",
      focus: "Data visualization and reporting"
    },
    {
      name: "devops-automation",
      sessions: 3,
      largestSession: "750 KB",
      focus: "CI/CD pipeline and infrastructure as code"
    },
    {
      name: "documentation-site",
      sessions: 1,
      largestSession: "320 KB",
      focus: "Technical documentation and API specs"
    }
  ],
  reportGeneration: {
    duration: "18m 30s",
    apiTime: "19m 45s",
    turns: 48,
    estimatedCost: 2.45,
    sessionId: "mock-rich-003"
  }
};

export const edgeCaseReportData: ReportData = {
  metadata: {
    totalSessions: 1,
    dataProcessed: "0.1 MB",
    activeDevelopment: "15m",
    projects: 1,
    generatedAt: "December 5, 2024",
    dateRange: "December 5, 2024"
  },
  executiveSummary: [
    "Single exploratory session with minimal activity"
  ],
  activityDistribution: {
    "Research": 100
  },
  keyAccomplishments: [
    "Initial project setup and environment configuration"
  ],
  promptQuality: {
    methodology: "Limited data for comprehensive analysis",
    breakdown: {
      excellent: 0,
      good: 0,
      fair: 100,
      poor: 0
    },
    insights: "Insufficient data for meaningful quality assessment",
    averageScore: 50
  },
  projectBreakdown: [
    {
      name: "test-project",
      sessions: 1,
      largestSession: "100 KB",
      focus: "Initial exploration"
    }
  ],
  reportGeneration: {
    duration: "1m 5s",
    apiTime: "1m 10s",
    turns: 3,
    estimatedCost: 0.05,
    sessionId: "mock-edge-004"
  }
};

// Export all mock data as an array for easy iteration
export const allMockData = [
  { name: 'minimal', data: minimalReportData },
  { name: 'typical', data: typicalReportData },
  { name: 'rich', data: richReportData },
  { name: 'edge-case', data: edgeCaseReportData }
];