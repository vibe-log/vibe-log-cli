import inquirer from 'inquirer';
import { colors, box } from './styles';
import { setCustomPersonality, getStatusLinePersonality } from '../config';
import { showSuccess, showInfo } from '../ui';
import { logger } from '../../utils/logger';

/**
 * Display educational information about custom personalities
 */
function displayEducationalHeader(): void {
  console.log(colors.accent('\n✨ Create Custom Personality\n'));
  
  console.log(colors.subdued('Define your own unique coaching style!\n'));
  
  console.log(colors.info('Examples of Custom Personalities:'));
  console.log(colors.subdued('  • Yoda - "Wisdom in your prompts, you must have"'));
  console.log(colors.subdued('  • Morpheus - "Your prompt shows you the door, details open it"'));
  console.log(colors.subdued('  • Bob Ross - "Happy little contexts make beautiful prompts"'));
  console.log(colors.subdued('  • Socrates - "What is a prompt without self-examination?"'));
  console.log('');
  
  console.log(colors.info('How it works:'));
  console.log(colors.subdued('  1. Choose a name for your personality'));
  console.log(colors.subdued('  2. Describe how it should critique prompts'));
  console.log(colors.subdued('  3. Optionally define custom templates'));
  console.log(colors.subdued('  4. Your personality will transform feedback accordingly'));
  console.log('');
  
  console.log(box.horizontal.repeat(60));
  console.log('');
}

/**
 * Get example templates for a personality style
 */
function getExampleTemplates(name: string, style: string): {
  poor: string;
  fair: string;
  good: string;
  excellent: string;
} {
  // Generate contextual examples based on the personality
  const lowerName = name.toLowerCase();
  const lowerStyle = style.toLowerCase();
  
  // Check for specific known personalities
  if (lowerName.includes('yoda') || lowerStyle.includes('yoda')) {
    return {
      poor: 'Much to learn, you have. Context, missing it is!',
      fair: 'Progress, I see. But complete, your prompt is not.',
      good: 'Strong with the Force, this prompt is. Polish it, you must.',
      excellent: 'Mastery achieved, you have! Proud, I am!'
    };
  }
  
  if (lowerName.includes('morpheus') || lowerStyle.includes('matrix')) {
    return {
      poor: 'You think that\'s a prompt you\'re writing? Add reality!',
      fair: 'You\'re beginning to believe. Now see the whole Matrix.',
      good: 'You\'re the One... just need to dodge those edge cases.',
      excellent: 'Welcome to the real world. This prompt has no spoon!'
    };
  }
  
  if (lowerName.includes('bob ross') || lowerStyle.includes('painting')) {
    return {
      poor: 'We need a happy foundation. Let\'s add some context trees!',
      fair: 'Looking nice! Now let\'s blend in some details.',
      good: 'Beautiful work! Just needs a touch of titanium white.',
      excellent: 'A masterpiece! Every prompt needs a friend like this!'
    };
  }
  
  // Default templates with placeholder for custom personality
  return {
    poor: `${name} says: This needs work - add more context!`,
    fair: `${name} says: Getting better - keep adding details!`,
    good: `${name} says: Good work - almost there!`,
    excellent: `${name} says: Excellent! Perfect prompting!`
  };
}

/**
 * Create a custom personality through interactive prompts
 */
export async function createCustomPersonality(): Promise<void> {
  console.clear();
  displayEducationalHeader();

  try {
    // Step 1: Get personality name
    const { name } = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'What should we call your personality?',
        validate: (input: string) => {
          if (!input.trim()) {
            return 'Please enter a name';
          }
          if (input.length > 20) {
            return 'Name should be 20 characters or less';
          }
          return true;
        }
      }
    ]);

    console.log('');

    // Step 2: Get personality style description
    const { description } = await inquirer.prompt([
      {
        type: 'input',
        name: 'description',
        message: 'How should this personality critique prompts?',
        default: `Like ${name} would speak`,
        validate: (input: string) => {
          if (!input.trim()) {
            return 'Please describe the personality style';
          }
          if (input.length > 100) {
            return 'Description should be 100 characters or less';
          }
          return true;
        }
      }
    ]);

    console.log('');

    // Step 3: Ask if they want custom templates
    const { wantsTemplates } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'wantsTemplates',
        message: 'Would you like to define custom feedback templates?',
        default: false
      }
    ]);

    let templates;
    if (wantsTemplates) {
      console.log('');
      console.log(colors.info('Define feedback for different score ranges:'));
      console.log(colors.subdued('(Press Enter to use suggested templates)\n'));

      const examples = getExampleTemplates(name, description);

      // Get templates for each score range
      const templatePrompts = await inquirer.prompt([
        {
          type: 'input',
          name: 'poor',
          message: 'Poor (0-40):',
          default: examples.poor,
          validate: (input: string) => input.length <= 100 || 'Keep it under 100 characters'
        },
        {
          type: 'input',
          name: 'fair',
          message: 'Fair (41-60):',
          default: examples.fair,
          validate: (input: string) => input.length <= 100 || 'Keep it under 100 characters'
        },
        {
          type: 'input',
          name: 'good',
          message: 'Good (61-80):',
          default: examples.good,
          validate: (input: string) => input.length <= 100 || 'Keep it under 100 characters'
        },
        {
          type: 'input',
          name: 'excellent',
          message: 'Excellent (81-100):',
          default: examples.excellent,
          validate: (input: string) => input.length <= 100 || 'Keep it under 100 characters'
        }
      ]);

      templates = templatePrompts;
    }

    console.log('');
    console.log(box.horizontal.repeat(60));
    console.log('');
    
    // Preview the personality
    console.log(colors.highlight('Preview Your Personality:'));
    console.log('');
    console.log(`${colors.accent('Name:')} ${name}`);
    console.log(`${colors.accent('Style:')} ${description}`);
    
    if (templates) {
      console.log('');
      console.log(colors.accent('Sample Feedback:'));
      console.log(colors.dim(`  Poor: "${templates.poor}"`));
      console.log(colors.dim(`  Fair: "${templates.fair}"`));
      console.log(colors.dim(`  Good: "${templates.good}"`));
      console.log(colors.dim(`  Excellent: "${templates.excellent}"`));
    } else {
      console.log('');
      console.log(colors.subdued('AI will generate feedback in this personality style'));
    }
    
    console.log('');
    console.log(box.horizontal.repeat(60));
    console.log('');

    // Confirm creation
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Create this personality?',
        default: true
      }
    ]);

    if (!confirm) {
      console.log(colors.muted('\nPersonality creation cancelled'));
      return;
    }

    // Save the custom personality
    setCustomPersonality({
      name,
      description,
      templates
    });

    console.log('');
    showSuccess(`Custom personality "${name}" created and activated!`);
    console.log('');
    console.log(colors.primary('✨ Your custom personality is now active!'));
    console.log(colors.dim('  The status line will now use this personality'));
    console.log(colors.dim('  You can switch personalities anytime from the menu'));
    console.log('');
    
  } catch (error) {
    console.log('');
    logger.error('Failed to create custom personality:', error);
    showInfo('Personality creation cancelled');
  }
}

/**
 * Edit existing custom personality
 */
export async function editCustomPersonality(): Promise<void> {
  const config = getStatusLinePersonality();
  
  if (!config.customPersonality) {
    console.log('');
    showInfo('No custom personality found. Create one first!');
    return;
  }

  console.clear();
  console.log(colors.accent('\n📝 Edit Custom Personality\n'));
  
  // Show current personality
  console.log(colors.info('Current Personality:'));
  console.log(`  ${colors.accent('Name:')} ${config.customPersonality.name}`);
  console.log(`  ${colors.accent('Style:')} ${config.customPersonality.description}`);
  
  if (config.customPersonality.templates) {
    console.log('');
    console.log(colors.info('Current Templates:'));
    console.log(colors.dim(`  Poor: "${config.customPersonality.templates.poor}"`));
    console.log(colors.dim(`  Fair: "${config.customPersonality.templates.fair}"`));
    console.log(colors.dim(`  Good: "${config.customPersonality.templates.good}"`));
    console.log(colors.dim(`  Excellent: "${config.customPersonality.templates.excellent}"`));
  }
  
  console.log('');
  console.log(box.horizontal.repeat(60));
  console.log('');

  // Ask what to edit
  const { editChoice } = await inquirer.prompt([
    {
      type: 'list',
      name: 'editChoice',
      message: 'What would you like to edit?',
      choices: [
        { name: 'Edit Name & Style', value: 'basic' },
        { name: 'Edit Templates', value: 'templates' },
        { name: 'Replace Everything', value: 'replace' },
        { name: '← Cancel', value: 'cancel' }
      ]
    }
  ]);

  if (editChoice === 'cancel') {
    return;
  }

  if (editChoice === 'replace') {
    await createCustomPersonality();
    return;
  }

  if (editChoice === 'basic') {
    const updates = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Personality name:',
        default: config.customPersonality.name,
        validate: (input: string) => {
          if (!input.trim()) return 'Please enter a name';
          if (input.length > 20) return 'Name should be 20 characters or less';
          return true;
        }
      },
      {
        type: 'input',
        name: 'description',
        message: 'Personality style:',
        default: config.customPersonality.description,
        validate: (input: string) => {
          if (!input.trim()) return 'Please describe the personality style';
          if (input.length > 100) return 'Description should be 100 characters or less';
          return true;
        }
      }
    ]);

    setCustomPersonality({
      ...config.customPersonality,
      ...updates
    });

    console.log('');
    showSuccess('Personality updated successfully!');
  }

  if (editChoice === 'templates') {
    const currentTemplates = config.customPersonality.templates || 
      getExampleTemplates(config.customPersonality.name, config.customPersonality.description);

    const newTemplates = await inquirer.prompt([
      {
        type: 'input',
        name: 'poor',
        message: 'Poor (0-40):',
        default: currentTemplates.poor,
        validate: (input: string) => input.length <= 100 || 'Keep it under 100 characters'
      },
      {
        type: 'input',
        name: 'fair',
        message: 'Fair (41-60):',
        default: currentTemplates.fair,
        validate: (input: string) => input.length <= 100 || 'Keep it under 100 characters'
      },
      {
        type: 'input',
        name: 'good',
        message: 'Good (61-80):',
        default: currentTemplates.good,
        validate: (input: string) => input.length <= 100 || 'Keep it under 100 characters'
      },
      {
        type: 'input',
        name: 'excellent',
        message: 'Excellent (81-100):',
        default: currentTemplates.excellent,
        validate: (input: string) => input.length <= 100 || 'Keep it under 100 characters'
      }
    ]);

    setCustomPersonality({
      ...config.customPersonality,
      templates: newTemplates
    });

    console.log('');
    showSuccess('Templates updated successfully!');
  }
}