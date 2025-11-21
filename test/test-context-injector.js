#!/usr/bin/env node

/**
 * Test script for context-injector module
 *
 * Usage: node test-context-injector.js
 */

const {
  buildPrompt,
  smartBuildPrompt,
  detectTaskType,
  extractCodeBlocks,
  estimateTokens,
  getStats
} = require('../lib/context-injector.js');

console.log('=== Context Injector Test Suite ===\n');

// Test 1: Task Type Detection
console.log('Test 1: Task Type Detection');
console.log('-----------------------------');
const testPrompts = [
  { prompt: 'Review this code for bugs', expected: 'code_review' },
  { prompt: 'Implement a circuit breaker pattern', expected: 'implementation' },
  { prompt: 'Fix the authentication error', expected: 'debugging' },
  { prompt: 'Refactor this function for better performance', expected: 'refactoring' },
  { prompt: 'Explain how async/await works', expected: 'explanation' },
  { prompt: 'What is the weather today?', expected: 'general' }
];

testPrompts.forEach(({ prompt, expected }) => {
  const detected = detectTaskType(prompt);
  const status = detected === expected ? '✓' : '✗';
  console.log(`${status} "${prompt}" → ${detected} ${detected !== expected ? `(expected: ${expected})` : ''}`);
});

console.log('\n');

// Test 2: Code Block Extraction
console.log('Test 2: Code Block Extraction');
console.log('-----------------------------');
const codePrompt = `Review this function:
\`\`\`javascript
function test() {
  return 42;
}
\`\`\`
And this one:
\`\`\`python
def test():
    return 42
\`\`\`
`;

const extracted = extractCodeBlocks(codePrompt);
console.log(`Has code: ${extracted.hasCode}`);
console.log(`Code blocks found: ${extracted.codeBlocks.length}`);
console.log('\n');

// Test 3: Token Estimation
console.log('Test 3: Token Estimation');
console.log('------------------------');
const testTexts = [
  'Hello World',
  'This is a longer sentence with multiple words.',
  'const x = 42; // Comment'
];

testTexts.forEach(text => {
  const tokens = estimateTokens(text);
  console.log(`"${text}" → ~${tokens} tokens`);
});

console.log('\n');

// Test 4: Smart Prompt Building
console.log('Test 4: Smart Prompt Building');
console.log('-----------------------------');
const simpleTask = 'Implement error handling';
const enhanced = smartBuildPrompt(simpleTask);
console.log(`Original length: ${simpleTask.length} chars`);
console.log(`Enhanced length: ${enhanced.length} chars`);
console.log(`Includes CORE_RULES: ${enhanced.includes('CORE_RULES') || enhanced.includes('Core Rules')}`);
console.log('\n');

// Test 5: Manual Prompt Building with Options
console.log('Test 5: Manual Prompt Building');
console.log('------------------------------');
const manualPrompt = buildPrompt('Test task', {
  includeRules: true,
  context: 'This is additional context',
  taskType: 'implementation'
});
console.log(`Prompt length: ${manualPrompt.length} chars`);
console.log(`Has task section: ${manualPrompt.includes('# Task')}`);
console.log(`Has context section: ${manualPrompt.includes('# Additional Context')}`);
console.log('\n');

// Test 6: Prompt Without Rules
console.log('Test 6: Prompt Without Rules');
console.log('-----------------------------');
const noRulesPrompt = buildPrompt('Casual question', {
  includeRules: false
});
console.log(`Prompt length: ${noRulesPrompt.length} chars`);
console.log(`Should be minimal: ${noRulesPrompt.length < 100 ? '✓' : '✗'}`);
console.log('\n');

// Test 7: Stats
console.log('Test 7: Module Statistics');
console.log('-------------------------');
const stats = getStats();
console.log(`CORE_RULES loaded: ${stats.coreRulesLoaded ? '✓' : '✗'}`);
console.log(`CORE_RULES tokens: ~${stats.coreRulesTokens}`);
console.log(`CORE_RULES path: ${stats.coreRulesPath}`);
console.log('\n');

// Test 8: Token Savings Calculation
console.log('Test 8: Token Savings Analysis');
console.log('------------------------------');
const FULL_CLAUDE_MD_TOKENS = 5000;  // Estimated
const coreRulesTokens = stats.coreRulesTokens;
const savings = Math.round((1 - coreRulesTokens / FULL_CLAUDE_MD_TOKENS) * 100);
console.log(`Full CLAUDE.md: ~${FULL_CLAUDE_MD_TOKENS} tokens`);
console.log(`CORE_RULES.md: ~${coreRulesTokens} tokens`);
console.log(`Savings: ~${savings}%`);
console.log('\n');

console.log('=== All Tests Complete ===');
