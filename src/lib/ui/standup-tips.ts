/**
 * Curated collection of productivity tips for standup report generation
 * These tips rotate during the 2-4 minute analysis period to provide value while waiting
 */

export interface StandupTip {
  text: string;
  category: 'productivity' | 'feature' | 'workflow' | 'collaboration' | 'analysis' | 'claude';
}

/**
 * Get all available standup tips
 * Tips are carefully curated to be:
 * - Actionable and practical
 * - Relevant to developer productivity
 * - Educational about vibe-log features
 * - Concise (fit on one line)
 */
export function getStandupTips(): StandupTip[] {
  return [
    // Productivity Tips
    {
      text: '🎯 Focus tip: Batch similar tasks together for better flow state',
      category: 'productivity'
    },
    {
      text: '⏰ Time-box difficult problems - take a break if stuck for 30+ minutes',
      category: 'productivity'
    },
 
    {
      text: '📊 Track your energy levels to schedule complex work at peak times',
      category: 'productivity'
    },
    {
      text: '🚫 Block distractions during deep work - use focus mode on your devices',
      category: 'productivity'
    },
    {
      text: '✅ Start with a quick win to build momentum for the day',
      category: 'productivity'
    },

    // Vibe-log Feature Tips
    {
      text: '💡 Use hooks for automatic session capture without manual uploads',
      category: 'feature'
    },
    {
      text: '📈 View your productivity patterns at app.vibe-log.dev/dashboard',
      category: 'feature'
    },
    {
      text: '📧 Setup Vibe-Log cloud account to get Weekly recaps and Daily standup emails',
      category: 'feature'
    },
    {
      text: '📱 Install sub-agents for specialized  work',
      category: 'feature'
    },
    {
      text: '🔐 When using Cloud Your sessions are sanitized - sensitive data never leaves your machine',
      category: 'feature'
    },
 
    {
      text: '📋 Generate local reports without cloud upload using the main menu',
      category: 'feature'
    },

    // Claude Code Tips
    {
      text: '🤖 Clear, specific prompts lead to better AI assistance',
      category: 'claude'
    },
    {
      text: '💬 Break complex tasks into smaller, focused conversations',
      category: 'claude'
    },
    {
      text: '🔍 To give Claude Better context use @ and pin point to the files you want to modify',
      category: 'claude'
    },
    {
      text: '📚 Provide context about your project structure for better help',
      category: 'claude'
    },
    {
      text: '🎯 Be specific about requirements - examples help Claude understand',
      category: 'claude'
    },
    {
      text: '💡 Claude can explain code, not just write it - ask "why" questions',
      category: 'claude'
    },

    // Workflow Optimization
    {
      text: '🔄 Commit frequently with clear messages for better session tracking',
      category: 'workflow'
    },
    {
      text: '🏗️ Set up your dev environment once, save the setup script',
      category: 'workflow'
    },
    {
      text: '⚡ Learn keyboard shortcuts - they compound into huge time savings',
      category: 'workflow'
    },
    {
      text: '🔧 Automate repetitive tasks - even 5-minute tasks add up',
      category: 'workflow'
    },
    {
      text: '📦 Keep dependencies updated regularly to avoid big migrations',
      category: 'workflow'
    },
    {
      text: '🧪 Write tests as you code - debugging is harder than preventing bugs',
      category: 'workflow'
    },

    // Collaboration Tips
    {
      text: '👥 Share your standup reports with your team for transparency',
      category: 'collaboration'
    },
    {
      text: '💬 Over-communicate in remote teams - assume nothing is obvious',
      category: 'collaboration'
    },
 
    {
      text: '🤝 Pair program on complex problems - two minds are better than one',
      category: 'collaboration'
    },
    {
      text: '📊 Share your wins and learnings - everyone benefits from knowledge',
      category: 'collaboration'
    },

    // Analysis Quality Tips
    {
      text: '📈 Longer prompts with clear goals produce better AI insights',
      category: 'analysis'
    },
 
    {
      text: '🎯 Define success criteria before starting work for clearer reports',
      category: 'analysis'
    },
 
    {
      text: '💡 Include "why" in your commits for richer standup summaries',
      category: 'analysis'
    }
  ];
}

/**
 * Get a random selection of tips
 * @param count Number of tips to return
 * @param categories Optional filter by categories
 */
export function getRandomTips(
  count: number,
  categories?: StandupTip['category'][]
): StandupTip[] {
  let tips = getStandupTips();

  // Filter by categories if specified
  if (categories && categories.length > 0) {
    tips = tips.filter(tip => categories.includes(tip.category));
  }

  // Shuffle and return requested count
  const shuffled = [...tips].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

/**
 * Get tips in a rotating sequence
 * Ensures good variety by cycling through categories
 */
export function getTipsForRotation(): string[] {
  const tips = getStandupTips();

  // Group by category
  const byCategory: Record<string, StandupTip[]> = {};
  tips.forEach(tip => {
    if (!byCategory[tip.category]) {
      byCategory[tip.category] = [];
    }
    byCategory[tip.category].push(tip);
  });

  // Build rotation ensuring category variety
  const rotation: string[] = [];
  const categories = Object.keys(byCategory);
  let maxTipsPerCategory = 0;

  // Find max tips in any category
  categories.forEach(cat => {
    if (byCategory[cat].length > maxTipsPerCategory) {
      maxTipsPerCategory = byCategory[cat].length;
    }
  });

  // Round-robin through categories
  for (let i = 0; i < maxTipsPerCategory; i++) {
    categories.forEach(cat => {
      if (byCategory[cat][i]) {
        rotation.push(byCategory[cat][i].text);
      }
    });
  }

  return rotation;
}