#!/usr/bin/env node

import { writeFileSync } from 'fs';
import { join } from 'path';
import { ReportTemplateEngine } from '../src/lib/report-template-engine';
import { allMockData } from './mock-report-data';

async function generateSampleReports() {
  console.log('🎨 Generating sample reports with mock data...\n');
  
  const engine = new ReportTemplateEngine();
  
  try {
    // Load the template
    console.log('📄 Loading HTML template...');
    await engine.loadTemplate();
    console.log('✅ Template loaded successfully\n');
    
    // Generate reports for each mock data set
    for (const { name, data } of allMockData) {
      console.log(`📊 Generating ${name} report...`);
      
      try {
        // Generate the HTML
        const html = engine.generateReport(data);
        
        // Save to file
        const outputPath = join(process.cwd(), `test-reports`, `sample-${name}.html`);
        writeFileSync(outputPath, html);
        
        console.log(`✅ Generated: sample-${name}.html`);
        console.log(`   Sessions: ${data.metadata.totalSessions}`);
        console.log(`   Projects: ${data.metadata.projects}`);
        console.log(`   Quality Score: ${data.promptQuality.averageScore}/100\n`);
      } catch (error) {
        console.error(`❌ Failed to generate ${name} report:`, error);
      }
    }
    
    console.log('🎉 Sample report generation complete!');
    console.log('📁 Reports saved to: test-reports/');
    console.log('\n💡 Next steps:');
    console.log('1. Open the HTML files in a browser to review the design');
    console.log('2. Check for any layout issues or missing styles');
    console.log('3. Verify data is displayed correctly');
    console.log('4. Test responsive design by resizing browser window');
    
  } catch (error) {
    console.error('❌ Failed to load template:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  generateSampleReports().catch(console.error);
}

export { generateSampleReports };