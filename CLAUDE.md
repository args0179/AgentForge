@.agents/rules/base.md

## Claude-Specific Instructions

### How to Think About This Project
This is a Node.js/Express web application designed to analyze codebases and generate AI agent configuration files. Its primary function is to facilitate the creation of AI prompts and agent rules for other projects. Focus on precise file path handling, API integration with LLMs, and robust error classification.

### Preferred Response Style
- Be concise and direct, prioritizing actionable code and file content over verbose explanations.
- When making modifications to existing files, provide only the changed sections, clearly indicating additions, deletions, or modifications with appropriate context.
- For complex multi-step tasks or structured outputs, utilize XML tags like `<task>`, `<context>`, `<constraints>`, and `<output>` to clearly define steps and expected results.

### Code Generation Rules
- Adhere strictly to the existing code style, including 4-space indentation, single quotes for strings, and `camelCase` naming conventions for JavaScript/Node.js files.
- Always implement comprehensive error handling for asynchronous operations and API calls, using `try...catch` blocks and the `classifyError` utility as seen in `server.js`.
- Prioritize modularity and maintainability, aligning with the `generators/` directory structure for core logic.

### Running Commands
- To start the development server: `npm run dev`
- To run the production server: `npm start`
- To install dependencies: `npm install`

### Memory Notes
- The application maintains persistent state for project analysis (`cachedAnalysis`) and scan configuration (`scanConfig`), stored in `.agentforge-cache.json` and `.agentforge-config.json` respectively. Understand that these files represent the current project context.
- Recognize that the system integrates with multiple AI providers (Gemini, Claude, OpenAI) and dynamically creates provider instances using `createProvider` in `generators/analyzer.js`. Be mindful of API key handling and model specific behaviors.
