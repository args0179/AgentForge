/**
 * Prompt templates for generating AI agent configuration files.
 * Pattern: .agents/rules/base.md = single source of truth
 * All other AI files (@include / reference) that base file.
 */

function summarizeProject(analysis) {
    const { detectedStack, frameworks, totalFiles, hasDocker, hasTests, packageJson, folderPath } = analysis;
    const projectName = packageJson?.name || folderPath.split('/').pop() || 'project';

    // Build a concise file tree string (max 60 entries)
    function treeToString(nodes, indent = '', max = 60) {
        let result = '';
        let count = 0;
        for (const node of nodes) {
            if (count >= max) { result += `${indent}... and more\n`; break; }
            if (node.type === 'directory') {
                result += `${indent}${node.name}/\n`;
                result += treeToString(node.children || [], indent + '  ', max - count);
            } else {
                result += `${indent}${node.name}\n`;
            }
            count++;
        }
        return result;
    }

    // Pick key file contents (limited to most important)
    const keyFiles = [
        'package.json', 'tsconfig.json', 'vite.config.ts', 'vite.config.js',
        'next.config.js', 'next.config.mjs', 'tailwind.config.js',
        'eslint.config.js', '.eslintrc.json', 'jest.config.js', 'vitest.config.ts',
        'requirements.txt', 'pyproject.toml', 'go.mod', 'Cargo.toml',
        'Gemfile', 'Dockerfile', 'docker-compose.yml', '.env.example'
    ];

    let keyContents = '';
    for (const f of keyFiles) {
        if (analysis.fileContents[f]) {
            keyContents += `\n--- ${f} ---\n${analysis.fileContents[f]}\n`;
        }
    }

    // Pick first 5 source files (reduced from 15 for token efficiency)
    const sourceExts = ['.js', '.ts', '.jsx', '.tsx', '.py', '.go', '.rs', '.java', '.rb', '.php', '.vue', '.svelte'];
    let sourceContent = '';
    let srcCount = 0;
    for (const [filePath, content] of Object.entries(analysis.fileContents)) {
        if (srcCount >= 5) break;
        const ext = '.' + filePath.split('.').pop();
        if (sourceExts.includes(ext) && !keyFiles.includes(filePath)) {
            sourceContent += `\n--- ${filePath} ---\n${content}\n`;
            srcCount++;
        }
    }

    return {
        projectName,
        fileTreeStr: treeToString(analysis.fileTree),
        keyContents,
        sourceContent,
        stackStr: detectedStack.join(', '),
        frameworkStr: frameworks.join(', '),
        totalFiles,
        hasDocker,
        hasTests
    };
}

const SYSTEM_PROMPT = `You are an expert developer tool that analyzes codebases and generates precise, professional AI agent configuration files. Always output ONLY the file content, no explanations, no markdown fences around the entire output. Be specific: use actual file paths, real command names, detected tech versions.`;

// ─────────────────────────────────────────────────────────────
// Shared context block used by multiple templates
// ─────────────────────────────────────────────────────────────
function buildContext(s) {
    return `Project: ${s.projectName}
Tech Stack: ${s.stackStr}
Frameworks: ${s.frameworkStr || 'none detected'}
Total Files: ${s.totalFiles}
Has Docker: ${s.hasDocker}
Has Tests: ${s.hasTests}

File Structure:
${s.fileTreeStr}
Key Config Files:
${s.keyContents}
Source Samples:
${s.sourceContent}`;
}

function getTemplates() {
    return {

        // ── SINGLE SOURCE OF TRUTH ─────────────────────────────
        // All other AI files include/reference this one.
        // ──────────────────────────────────────────────────────
        '.agents/rules/base.md': (analysis) => {
            const s = summarizeProject(analysis);
            return `Generate a .agents/rules/base.md file — the single source of truth for ALL AI agents working on this project.
This file will be @included by AGENTS.md, CLAUDE.md, .cursorrules, and .cursor/rules/main.mdc.

${buildContext(s)}

Output this EXACT structure (populate every section with real, specific details from the project):

# ${s.projectName} — AI Agent Base Rules

## Project Overview
[2-3 sentences describing what the project does, its purpose, and who uses it]

## Tech Stack
[List each technology with version if detectable. Group: Runtime | Framework | Build | Test | Deploy]

## Project Structure
[Key directories and what lives in each — use actual paths from the file tree]

## Key Commands
\`\`\`bash
# Install
[exact install command]

# Development
[exact dev command]

# Build
[exact build command]

# Test
[exact test command]

# Lint / Format
[exact lint/format commands]
\`\`\`

## Entry Points
[List the main entry files — e.g., server.js, src/index.ts, app.py]

## Code Style & Conventions
- Naming: [camelCase / snake_case / PascalCase — inferred from source]
- Indentation: [spaces/tabs + count — inferred from source]
- Quotes: [single / double — inferred from source]
- [Any other detected conventions: import style, export style, async patterns]

## Architecture Decisions
[Key patterns detected: REST API / MVC / event-driven / etc. Explain the structure briefly]

## Working in This Codebase
- Before modifying a file, read it fully first
- Follow existing patterns — do not introduce new patterns without discussion
- [Any project-specific workflow rules inferred from the code]

## What NOT to Do
- Never modify [critical files that should not be changed]
- Do not add new dependencies without checking package.json first
- [Other "never do" rules specific to this project]

## Testing Requirements
[How tests are structured, what test framework is used, where test files live, naming convention]

Output ONLY the file content. No preamble. No markdown fences around the output.`;
        },

        // ── AGENTS.md ──────────────────────────────────────────
        // 2025 standard: plain markdown, references base.md.
        // Supported by: Claude Code, Cursor, Copilot, Gemini CLI,
        // Windsurf, Aider, Zed, Warp, RooCode.
        // ──────────────────────────────────────────────────────
        'AGENTS.md': (analysis) => {
            const s = summarizeProject(analysis);
            return `Generate an AGENTS.md file following the 2025 AGENTS.md standard (Linux Foundation / Agentic AI Foundation).
This is the universal AI agent instructions file. It starts with a single @include of base.md,
then adds agent-specific workflow rules on top.

${buildContext(s)}

Output this EXACT structure:

@.agents/rules/base.md

## Agent Workflow

### Before Starting Any Task
1. Read the relevant files fully before editing
2. Check existing patterns in the codebase — do not invent new ones
3. [Any project-specific pre-task steps inferred from the codebase]

### Making Changes
- Work in small, focused commits
- [Rules inferred from the project: e.g., run lint before committing, update tests, etc.]
- Never leave the codebase in a broken state

### Pull Request Standards
- [PR naming convention if detectable]
- [Required checks: tests, lint, build]
- [Any other PR rules inferred from .github/ if present]

## File Ownership
[List key files/directories and who/what should modify them — inferred from structure]

## Forbidden Actions
- Do not commit directly to main/master
- Do not expose secrets or API keys
- [Other project-specific forbidden actions]

Output ONLY the file content. No preamble.`;
        },

        // ── CLAUDE.md ──────────────────────────────────────────
        // Claude Code project memory file.
        // @path/to/file syntax pulls in base.md automatically.
        // Add Claude-specific extras after the include.
        // ──────────────────────────────────────────────────────
        'CLAUDE.md': (analysis) => {
            const s = summarizeProject(analysis);
            return `Generate a CLAUDE.md file for Claude Code (Anthropic's CLI agent).
This file uses @include syntax to pull in base.md, then adds Claude-specific instructions.

${buildContext(s)}

Output this EXACT structure:

@.agents/rules/base.md

## Claude-Specific Instructions

### How to Think About This Project
[1-2 sentences on the most important thing for Claude to understand about this codebase]

### Preferred Response Style
- Be concise and direct — show code, not theory
- When editing files, show only the changed sections with clear before/after context
- Use XML tags for complex multi-step tasks: <task>, <context>, <constraints>, <output>

### Code Generation Rules
- Match the existing code style exactly (indentation, quotes, naming — see Base Rules above)
- Always add error handling for async operations
- [Any project-specific generation rules inferred from the code]

### Running Commands
[List the exact commands Claude should run to verify its work: test, lint, type-check]

### Memory Notes
[Key architectural decisions or gotchas that Claude should remember across sessions — inferred from the codebase]

Output ONLY the file content. No preamble.`;
        },

        // ── .cursor/rules/main.mdc ─────────────────────────────
        // MDC format — newer Cursor (v0.43+) rules format.
        // alwaysApply: true means it loads for every file.
        // ──────────────────────────────────────────────────────
        '.cursor/rules/main.mdc': (analysis) => {
            const s = summarizeProject(analysis);
            return `Generate a .cursor/rules/main.mdc file for Cursor IDE (MDC format, Cursor v0.43+).
This is the primary rules file for Cursor. It uses YAML frontmatter and references base.md.

${buildContext(s)}

Output this EXACT structure (YAML frontmatter is required):

---
description: Main project rules for ${s.projectName}
alwaysApply: true
---

@.agents/rules/base.md

## Cursor-Specific Behavior

### Autocomplete Preferences
- Prioritize completing existing patterns over introducing new ones
- [Any specific autocomplete hints inferred from the code style]

### Chat & Composer Rules
- Always read the file being modified before suggesting changes
- Prefer targeted edits over full file rewrites
- [Project-specific composer rules]

### File Templates
[If any file templates or boilerplate patterns are detectable, describe them here]

Output ONLY the file content including the YAML frontmatter. No outer markdown fences.`;
        },

        // ── .cursorrules ───────────────────────────────────────
        // Legacy Cursor format (pre-v0.43, still widely used).
        // Plain text, no frontmatter. References base.md.
        // ──────────────────────────────────────────────────────
        '.cursorrules': (analysis) => {
            const s = summarizeProject(analysis);
            return `Generate a .cursorrules file for Cursor IDE (legacy plain-text format, max compatibility).
This is a thin wrapper that references base.md and adds any Cursor-specific additions.

${buildContext(s)}

Output this EXACT structure:

# Project Rules — see .agents/rules/base.md for full context

@.agents/rules/base.md

## Cursor Additions
[Any Cursor-specific rules not covered in base.md — inferred from the project]
- When generating new files, match the existing file structure in ${s.projectName}
- Prefer editing existing files over creating new ones unless clearly necessary
- [Other Cursor-specific preferences inferred from the project]

Output ONLY the file content. Plain text, no outer markdown fences.`;
        },

        // ── .windsurfrules ─────────────────────────────────────
        '.windsurfrules': (analysis) => {
            const s = summarizeProject(analysis);
            return `Generate a .windsurfrules file for Windsurf IDE.
References base.md and adds Windsurf-specific instructions.

${buildContext(s)}

Output this structure:

@.agents/rules/base.md

## Windsurf Cascade Rules
[Rules specific to Windsurf's Cascade AI — how it should navigate and edit this codebase]
- [Inferred from project structure and patterns]

Output ONLY the file content.`;
        },

        // ── .github/copilot-instructions.md ───────────────────
        // GitHub Copilot workspace instructions.
        // Read by Copilot Chat and Copilot Agents automatically.
        // ──────────────────────────────────────────────────────
        '.github/copilot-instructions.md': (analysis) => {
            const s = summarizeProject(analysis);
            return `Generate a .github/copilot-instructions.md file for GitHub Copilot.
This is read automatically by Copilot Chat and Copilot Agents in this repository.
References base.md and adds Copilot-specific agent definitions.

${buildContext(s)}

Output this EXACT structure:

@.agents/rules/base.md

## Copilot Agent Definitions

[Create 2-4 specialized @agents appropriate for this project.
Each agent targets a specific workflow. Format for EACH agent:]

### @[agent-name]
**Role:** [one line]
**Trigger:** Use when [specific scenario]
**Commands:**
\`\`\`bash
[exact commands this agent runs]
\`\`\`
**Focus:** [files/areas this agent works on]
**Avoid:** [what this agent should never touch]

[Example agents to create based on the detected stack:
- @docs-agent for documentation updates
- @test-agent for writing/fixing tests
- @refactor-agent for code cleanup
- @security-agent for vulnerability checks
Only include agents relevant to this specific project]

Output ONLY the file content. No preamble.`;
        },

        // ── SKILL.md ───────────────────────────────────────────
        // Repomix agent-skills format.
        // Used by Claude Code skills system (.claude/skills/).
        // ──────────────────────────────────────────────────────
        'SKILL.md': (analysis) => {
            const s = summarizeProject(analysis);
            return `Generate a SKILL.md file in repomix agent-skills format.
This file goes in .claude/skills/${s.projectName}/ and teaches AI assistants how to work with this codebase.

${buildContext(s)}

Output this EXACT structure with YAML frontmatter:

---
name: ${s.projectName}
description: "[One sentence: what this skill teaches an AI about this codebase]"
version: "1.0.0"
tags: [${s.stackStr.split(', ').map(t => `"${t.toLowerCase().replace(/[^a-z0-9]/g, '-')}"`).join(', ')}]
---

# ${s.projectName} Codebase Skill

## Purpose
[What this skill enables: what an AI can do better with this skill loaded]

## Codebase Overview
[Architecture summary: how the code is organized, main flows, key abstractions]

## Key Patterns
[3-5 code patterns found in this codebase that an AI should replicate when adding new code]

## How to Navigate This Codebase
- Start at: [entry point files]
- Core logic lives in: [key directories]
- Tests live in: [test directory]
- Config lives in: [config files]

## Common Tasks & How to Do Them
### Adding a new [feature type inferred from stack]
[Step-by-step based on existing patterns]

### Running the test suite
\`\`\`bash
[exact test command]
\`\`\`

### Debugging tips
[Any inferred debugging patterns from the code]

Output ONLY the file content including YAML frontmatter.`;
        },

        // ── base-rules.md ──────────────────────────────────────
        // Standalone coding rules file (for tools that don't
        // support @include but need explicit rules).
        // ──────────────────────────────────────────────────────
        'base-rules.md': (analysis) => {
            const s = summarizeProject(analysis);
            return `Generate a base-rules.md file — standalone coding rules derived entirely from the actual codebase.
This is identical in spirit to .agents/rules/base.md but formatted as a standalone reference doc.

${buildContext(s)}

Use this structure:
# Base Rules: ${s.projectName}

## Code Quality
[Rules inferred from the actual code patterns]

## Naming Conventions
[Derived from actual variable/function/file names in the source]

## File Organization
[Rules derived from the actual directory structure]

## Git Workflow
[Rules inferred from .github/ files, if present]

## Security Rules
[Inferred from the tech stack — e.g., never commit .env, always validate input]

## Performance Rules
[Inferred from the stack and patterns]

## Testing Rules
[Inferred from test files and test framework]

Output ONLY the file content.`;
        },

        // ── memories.md ────────────────────────────────────────
        // AI agent memory / persistent context.
        // ──────────────────────────────────────────────────────
        'memories.md': (analysis) => {
            const s = summarizeProject(analysis);
            return `Generate a memories.md file — persistent memory for AI agents working on this project.
This captures decisions, gotchas, and context that would otherwise be re-discovered every session.

${buildContext(s)}

Use this structure:
# Agent Memory: ${s.projectName}

## Architecture Decisions
[Key decisions visible in the codebase — why things are structured the way they are]

## Known Quirks & Gotchas
[Anything unusual or non-obvious in the codebase that would trip up an AI agent]

## Important File Locations
[Critical files and what they control — derived from the actual file tree]

## External Services & APIs
[Services used, detected from dependencies or .env.example]

## Environment Variables Required
[All env vars from .env.example or detected in code]

## Deployment Notes
[Inferred from Dockerfile, docker-compose.yml, or package.json scripts]

## Recent Context
[Leave blank — to be filled in by the AI agent during sessions]

Output ONLY the file content.`;
        },

        // ── Documentation files ────────────────────────────────
        'README.md': (analysis) => {
            const s = summarizeProject(analysis);
            return `Generate a professional README.md for this project.

${buildContext(s)}

Include: project title with emoji, description, features list, tech stack badges (use shields.io format),
installation instructions (step-by-step), usage guide with examples, folder structure,
environment variables table (from .env.example), contributing section, license.
Use real commands, real paths, real dependencies from the project.
Output ONLY the file content.`;
        },

        'CONTRIBUTING.md': (analysis) => {
            const s = summarizeProject(analysis);
            return `Generate a CONTRIBUTING.md for this project.

${buildContext(s)}

Include: development setup (step-by-step), coding standards (from detected conventions),
PR process, testing requirements, branch naming convention, commit message format (Conventional Commits if detectable).
Use real commands and tools from this project.
Output ONLY the file content.`;
        },

        'CODE_OF_CONDUCT.md': (analysis) => {
            const s = summarizeProject(analysis);
            return `Generate a CODE_OF_CONDUCT.md for ${s.projectName}.
Use the Contributor Covenant v2.1 as a base. Customize enforcement/contact section.
Output ONLY the file content.`;
        },

        'SECURITY.md': (analysis) => {
            const s = summarizeProject(analysis);
            return `Generate a SECURITY.md for this project.

Project: ${s.projectName}
Stack: ${s.stackStr}

Include: supported versions table, how to report vulnerabilities (private disclosure),
security policies, response timeline (acknowledge 48h, patch 90 days), security contacts.
Output ONLY the file content.`;
        },

        'CHANGELOG.md': (analysis) => {
            const s = summarizeProject(analysis);
            return `Generate an initial CHANGELOG.md for this project.

Project: ${s.projectName}
Stack: ${s.stackStr}

Follow Keep a Changelog format (keepachangelog.com). Use semantic versioning.
Include an [Unreleased] section and one initial release based on detected features.
Output ONLY the file content.`;
        },

        // ── Infrastructure files ───────────────────────────────
        'Dockerfile': (analysis) => {
            const s = summarizeProject(analysis);
            return `Generate a production-ready Dockerfile for this project.

${buildContext(s)}

Use multi-stage builds. Follow Docker best practices (non-root user, .dockerignore hints, minimal final image).
Pin specific base image versions. Add HEALTHCHECK if it's a web server.
Output ONLY the file content. No markdown fences.`;
        },

        'docker-compose.yml': (analysis) => {
            const s = summarizeProject(analysis);
            return `Generate a docker-compose.yml for this project.

${buildContext(s)}

Include all services needed (app + database + cache if detected in dependencies).
Use named volumes. Include healthchecks. Add a .env file reference for secrets.
Output ONLY the file content. No markdown fences.`;
        },

        'package.json': (analysis) => {
            const s = summarizeProject(analysis);
            return `Generate an improved package.json for this project.

Current package.json:
${s.keyContents}

Add or improve: description, keywords, repository, bugs, homepage, engines field,
and any missing scripts (test, lint, format, build). Keep ALL existing dependencies unchanged.
Output ONLY valid JSON content.`;
        }
    };
}

// ─────────────────────────────────────────────────────────────
// PROMPT GENERATOR — SINGLE MODE
// ─────────────────────────────────────────────────────────────
function getSinglePromptTemplate({ taskDescription, targetAI, promptStyle, projectSummary, relevantFiles }) {
    const styleGuides = {
        'Detailed': 'Be thorough. Include full context, explicit constraints, step-by-step expectations, and clear output format.',
        'Concise': 'Be minimal. Strip all fluff. Every sentence must add value. No repetition.',
        'Chain-of-thought': 'Instruct the AI to think step-by-step before answering. Use explicit <thinking> or "Let\'s reason through this" framing.',
        'Role-based': 'Open with a strong expert persona. The persona should deeply shape the tone, depth, and approach of the response.'
    };

    const aiHints = {
        'Claude': 'Claude responds well to XML tags (<task>, <context>, <constraints>), explicit success criteria, and "think step by step" instructions.',
        'GitHub Copilot Agent': 'Copilot agents need short, imperative instructions. State files to edit, functions to change, tests to pass.',
        'Cursor': 'Cursor reads .cursor/rules/main.mdc for project context. Focus on the specific change: file path, function name, expected behavior.',
        'Gemini': 'Gemini benefits from structured markdown sections and concrete examples. Be explicit about output format.',
        'ChatGPT': 'ChatGPT works well with numbered instructions, explicit roles, and "respond only with X" output constraints.'
    };

    return `You are a senior prompt engineer. Your job is to write a single, complete, professional prompt for ${targetAI}.

TASK THE USER WANTS TO ACCOMPLISH:
${taskDescription}

PROMPT STYLE: ${promptStyle}
Style guidance: ${styleGuides[promptStyle] || styleGuides['Detailed']}

TARGET AI HINTS:
${aiHints[targetAI] || ''}

${projectSummary ? `PROJECT CONTEXT (use this to make the prompt specific, not generic):\n${projectSummary}` : ''}

${relevantFiles ? `RELEVANT FILES (reference these in the prompt where appropriate):\n${relevantFiles}` : ''}

RULES FOR THE PROMPT YOU WRITE:
- Open with a clear role/persona definition
- Include only project context directly relevant to the task
- State the task with explicit acceptance criteria (what does "done" look like?)
- Add 3-5 concrete constraints (what to avoid, what not to change)
- Specify the exact output format expected
- Use ${promptStyle} style throughout
- Do NOT use forbidden words: sophisticated, leverage, utilize, seamlessly, robust, comprehensive
- Be specific: reference real file names, real function names, real commands if available from project context
- Make it copy-paste ready — the user will send this directly to ${targetAI}

OUTPUT: Write ONLY the final prompt text. No preamble. No explanation. No markdown fences around the output.`;
}

// ─────────────────────────────────────────────────────────────
// PROMPT GENERATOR — MULTI MODE
// ─────────────────────────────────────────────────────────────
function getMultiPromptTemplate({ taskDescription, targetAI, promptStyle, projectSummary, relevantFiles }) {
    const styleGuides = {
        'Detailed': 'Be thorough. Include full context, explicit constraints, step-by-step expectations, and clear output format.',
        'Concise': 'Be minimal. Every sentence must add value. No repetition.',
        'Chain-of-thought': 'Instruct the AI to think step-by-step. Use explicit reasoning framing.',
        'Role-based': 'Open each prompt with a strong expert persona that shapes tone and depth.'
    };

    return `You are a senior prompt engineer specializing in multi-step AI workflows.

The user has a complex task to accomplish with ${targetAI}. Break it into 3-5 SEPARATE, FOCUSED prompts — each targeting one clear sub-task best done in isolation.

TASK TO DECOMPOSE:
${taskDescription}

PROMPT STYLE: ${promptStyle}
Style guidance: ${styleGuides[promptStyle] || styleGuides['Detailed']}

${projectSummary ? `PROJECT CONTEXT:\n${projectSummary}` : ''}

${relevantFiles ? `RELEVANT FILES:\n${relevantFiles}` : ''}

DECOMPOSITION STRATEGY:
Good splits: Analysis → Implementation → Testing → Documentation
Or: Backend → Frontend → Integration → Review
Each prompt must be independently usable.

RULES FOR EACH PROMPT:
- Clear role/persona opening
- Context scoped to ONLY what that sub-task needs
- Explicit acceptance criteria
- 2-4 concrete constraints
- Output format specified
- No forbidden words: sophisticated, leverage, utilize, seamlessly, robust, comprehensive
- Reference real file/function names from project context where available

OUTPUT FORMAT — return ONLY this exact JSON, no preamble, no markdown fences:
{
  "guide": "2-3 sentence explanation of HOW to use these prompts in sequence.",
  "prompts": [
    {
      "filename": "01_descriptive_name.md",
      "label": "Short Tab Label",
      "when": "Use this first — before making any changes.",
      "content": "The full ready-to-send prompt text here."
    }
  ]
}

IMPORTANT: Each "content" field must be a complete, copy-paste-ready prompt for ${targetAI}. Output ONLY the JSON.`;
}

function getPromptGeneratorTemplate({ taskDescription, targetAI, promptStyle, projectSummary, relevantFiles, mode = 'single' }) {
    if (mode === 'multi') {
        return getMultiPromptTemplate({ taskDescription, targetAI, promptStyle, projectSummary, relevantFiles });
    }
    return getSinglePromptTemplate({ taskDescription, targetAI, promptStyle, projectSummary, relevantFiles });
}

const ROLE_PROMPTS = {
    'Context Engineer': `You are a Context Engineer assistant. Help the user design, generate, and improve AI agent configuration files (AGENTS.md, CLAUDE.md, SKILL.md, .cursor/rules/main.mdc, .agents/rules/base.md). You understand the 2025 single-source-of-truth pattern: base.md holds all rules, other files @include it.`,
    'Code Reviewer': `You are a senior code reviewer. Analyze code for bugs, security issues, performance problems, and style violations. Be specific: cite line numbers, function names, and exact issues. Prioritize by severity.`,
    'Architect': `You are a software architect. Help with system design decisions, module structure, scalability concerns, and technical trade-offs. Think in terms of maintainability, testability, and team velocity.`,
    'Debug Assistant': `You are a debugging specialist. When given an error or unexpected behavior, systematically identify root causes. Ask for stack traces, reproduce conditions, and suggest targeted fixes — not rewrites.`,
    'Docs Writer': `You are a technical documentation writer. Generate clear, accurate, developer-friendly documentation. Match the tone and style of existing docs. Prioritize examples over abstract descriptions.`
};

module.exports = { getTemplates, getPromptGeneratorTemplate, summarizeProject, SYSTEM_PROMPT, ROLE_PROMPTS };
