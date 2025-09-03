# HTML Report Styling Standardization Plan

## Overview
Standardize the HTML report styling in vibe-log-cli to match the design system used in vibe-log-react-router, creating a cohesive visual experience across the platform.

## Current Architecture
1. **Claude generates** the core HTML content via prompts in `orchestrator.ts`
2. **System post-processes** the HTML in `report-generator.ts` by adding stats and promotional content

## Design System Elements to Standardize

### Color Palette (Dark Theme)
- **Backgrounds**: `#1a1a1a` to `#0f0f0f` gradients
- **Cards**: `#1a1b1e` with `#374151` borders  
- **Primary Accent**: `#8b5cf6`, `#a78bfa` (purple)
- **Success**: `#10b981` (green)
- **Warning**: `#f59e0b` (amber)
- **Error**: `#ef4444` (red)
- **Text Hierarchy**: 
  - Primary: `#e5e5e5`
  - Secondary: `#999`
  - Muted: `#666`
- **Borders**: `#2a2a2a`, `#27272a`

### Typography
- **Font Family**: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
- **Section Headers**: Uppercase with `letter-spacing: 0.5px`
- **Consistent sizing and weights throughout**

### Activity Colors (from SessionCard)
- **Feature Development**: Green (`#10b981`)
- **Debugging**: Orange (`#f59e0b`) 
- **Refactoring**: Blue (`#3b82f6`)
- **Testing**: Purple (`#8b5cf6`)
- **Code Review**: Yellow (`#eab308`)
- **Research**: Cyan (`#06b6d4`)
- **Planning**: Pink (`#ec4899`)
- **Other**: Gray (`#6b7280`)

## Implementation Tasks

### 1. Update Claude Prompt Template (`orchestrator.ts`)
- Replace basic CSS with comprehensive dark theme styles
- Add subtle CTA banner at top of report
- Structure sections using card-based layouts
- Include activity breakdown bars with proper colors
- Ensure responsive design for mobile/desktop

### 2. Modify Report Post-Processing (`report-generator.ts`)
- Remove promotional footer (lines 234-311)
- Keep execution stats but restyle for dark theme
- Ensure stats use card-based layout with proper spacing

### 3. Create Standardized HTML Structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vibe-Log Development Report</title>
    <style>
        /* Dark theme base styles */
        body {
            background: linear-gradient(135deg, #1a1a1a 0%, #0f0f0f 100%);
            color: #e5e5e5;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        
        /* CTA Banner (subtle, at top) */
        .cta-banner {
            background: linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%);
            padding: 12px;
            text-align: center;
            margin-bottom: 24px;
        }
        
        /* Card components */
        .card {
            background: #1a1b1e;
            border: 1px solid #374151;
            border-radius: 12px;
            padding: 24px;
            margin-bottom: 20px;
        }
        
        /* Activity bars matching SessionCard */
        .activity-bar {
            height: 4px;
            display: flex;
            background: #27272a;
            border-radius: 2px;
        }
        
        /* Stats grid */
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
        }
    </style>
</head>
<body>
    <!-- Report content here -->
</body>
</html>
```

### 4. Visual Components to Include

#### Executive Summary Card
- Dark background with gradient
- Key metrics in grid layout
- Icons for visual interest
- Proper text hierarchy

#### Activity Distribution
- Horizontal stacked bar chart
- Colors matching ACTIVITY_COLORS constant
- Percentage labels
- Legend with color indicators

#### Accomplishments Section
- Card-based layout
- Bullet points with custom styling
- Proper spacing and typography

#### Project Breakdown
- Individual cards per project
- Stats in consistent format
- Activity bars for each project

#### Prompt Quality Analysis
- Table with dark theme styling
- Alternating row colors for readability
- Quality scores with color coding

### 5. CSS Specifics

```css
/* Core dark theme variables */
:root {
    --bg-primary: #1a1a1a;
    --bg-secondary: #0f0f0f;
    --bg-card: #1a1b1e;
    --border-color: #374151;
    --border-subtle: #2a2a2a;
    --text-primary: #e5e5e5;
    --text-secondary: #999;
    --text-muted: #666;
    --accent-purple: #8b5cf6;
    --accent-green: #10b981;
    --accent-amber: #f59e0b;
}

/* Animations */
@keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}

/* Card hover effects */
.card:hover {
    box-shadow: 0 4px 6px rgba(139, 92, 246, 0.1);
    transform: translateY(-2px);
    transition: all 0.3s ease;
}
```

## Testing Checklist
- [ ] Generate report with new styling
- [ ] Verify dark theme consistency
- [ ] Check responsive layout on mobile/desktop
- [ ] Ensure CTA is subtle but visible
- [ ] Confirm activity colors match SessionCard
- [ ] Test execution stats display
- [ ] Validate all sections render correctly
- [ ] Compare with vibe-log-react-router UI

## Success Criteria
1. Visual consistency between web app and reports
2. Professional dark theme appearance
3. Clear information hierarchy
4. Responsive design works on all devices
5. No intrusive promotional content
6. Subtle CTA encourages platform usage

## Notes
- Claude generates the HTML, so prompt must include all styling
- Keep execution stats but style them consistently
- Focus on readability in dark theme
- Ensure accessibility with proper contrast ratios