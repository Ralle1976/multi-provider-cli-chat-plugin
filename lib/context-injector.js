#!/usr/bin/env node

/**
 * Context Injector Module
 *
 * Provides smart context injection for CLI commands, balancing
 * consistency with token efficiency.
 *
 * Strategy: Hybrid approach with CORE_RULES.md (~500 tokens)
 * instead of full CLAUDE.md (~5000 tokens) = 90% cost savings
 */

const fs = require('fs');
const path = require('path');

// Load CORE_RULES.md once at startup
const CORE_RULES_PATH = path.join(__dirname, '../../../CORE_RULES.md');
let CORE_RULES = null;

function loadCoreRules() {
  if (CORE_RULES === null) {
    try {
      CORE_RULES = fs.readFileSync(CORE_RULES_PATH, 'utf8');
    } catch (err) {
      console.error('Warning: CORE_RULES.md not found. Context injection disabled.');
      CORE_RULES = '';
    }
  }
  return CORE_RULES;
}

/**
 * Builds a prompt with optional context injection
 *
 * @param {string} task - The main task/prompt
 * @param {Object} options - Configuration options
 * @param {boolean} options.includeRules - Include CORE_RULES.md (default: true for code tasks)
 * @param {string} options.context - Additional task-specific context
 * @param {string} options.taskType - Type of task (code_review, implementation, etc.)
 * @returns {string} The complete prompt
 */
function buildPrompt(task, options = {}) {
  const parts = [];

  // Determine if we should include rules based on task type
  const shouldIncludeRules = options.includeRules !== false && (
    options.taskType === 'code_review' ||
    options.taskType === 'implementation' ||
    options.taskType === 'debugging' ||
    options.taskType === 'refactoring' ||
    !options.taskType  // Default to including rules if no type specified
  );

  // Include core rules for code-related tasks
  if (shouldIncludeRules) {
    const rules = loadCoreRules();
    if (rules) {
      parts.push('# Context and Rules\n');
      parts.push(rules);
      parts.push('\n---\n\n');
    }
  }

  // Add task-specific context if provided
  if (options.context) {
    parts.push('# Additional Context\n');
    parts.push(options.context);
    parts.push('\n\n');
  }

  // Add the actual task
  parts.push('# Task\n');
  parts.push(task);

  return parts.join('');
}

/**
 * Detects task type from prompt content
 *
 * @param {string} prompt - The user's prompt
 * @returns {string} Detected task type
 */
function detectTaskType(prompt) {
  const lowerPrompt = prompt.toLowerCase();

  if (lowerPrompt.includes('review') || lowerPrompt.includes('check')) {
    return 'code_review';
  }
  if (lowerPrompt.includes('implement') || lowerPrompt.includes('create') || lowerPrompt.includes('add')) {
    return 'implementation';
  }
  if (lowerPrompt.includes('debug') || lowerPrompt.includes('fix') || lowerPrompt.includes('error')) {
    return 'debugging';
  }
  if (lowerPrompt.includes('refactor') || lowerPrompt.includes('improve') || lowerPrompt.includes('optimize')) {
    return 'refactoring';
  }
  if (lowerPrompt.includes('explain') || lowerPrompt.includes('what') || lowerPrompt.includes('how')) {
    return 'explanation';
  }

  return 'general';
}

/**
 * Smart prompt builder that auto-detects task type
 *
 * @param {string} prompt - The user's prompt
 * @param {Object} options - Additional options
 * @returns {string} Enhanced prompt with appropriate context
 */
function smartBuildPrompt(prompt, options = {}) {
  const taskType = options.taskType || detectTaskType(prompt);

  return buildPrompt(prompt, {
    ...options,
    taskType
  });
}

/**
 * Extracts code blocks from a prompt for context
 *
 * @param {string} prompt - The prompt possibly containing code
 * @returns {Object} { hasCode: boolean, codeBlocks: string[] }
 */
function extractCodeBlocks(prompt) {
  const codeBlockRegex = /```[\s\S]*?```/g;
  const matches = prompt.match(codeBlockRegex);

  return {
    hasCode: matches !== null && matches.length > 0,
    codeBlocks: matches || []
  };
}

/**
 * Estimates token count (rough approximation)
 *
 * @param {string} text - Text to estimate
 * @returns {number} Estimated token count
 */
function estimateTokens(text) {
  // Rough estimate: ~4 characters per token
  return Math.ceil(text.length / 4);
}

/**
 * Gets statistics about context injection
 *
 * @returns {Object} Statistics
 */
function getStats() {
  const rules = loadCoreRules();
  return {
    coreRulesLoaded: rules.length > 0,
    coreRulesTokens: estimateTokens(rules),
    coreRulesPath: CORE_RULES_PATH
  };
}

module.exports = {
  buildPrompt,
  smartBuildPrompt,
  detectTaskType,
  extractCodeBlocks,
  estimateTokens,
  getStats
};
