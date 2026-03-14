# Base Rules: agentforge

## Code Quality
- **Modularity**: Complex logic for AI interactions, file system operations, and prompt templating is cleanly separated into dedicated modules within the `generators/` directory.
- **Error Handling**: API routes consistently employ `try...catch` blocks for robust error management. A `classifyError` utility centralizes error message interpretation and standardizes error codes (e.g., `BAD_KEY`, `RATE_LIMIT`, `CONTEXT_TOO_LARGE`) for client-side feedback.
- **Configuration Management**: Default configurations (e.g., `DEFAULT_CONFIG` for file scanning, `DEFAULT_MODELS` for AI providers) are clearly defined and can be overridden. Environment variables are used for sensitive credentials (e.g., `GEMINI_API_KEY`) and server port (`PORT`).
- **Logging**: A centralized `addLog` function (`logStore` in `server.js`) is used across the application for consistent structured logging of info, success, and error events, facilitating debugging and monitoring.
- **Path Handling**: The Node.js `path` module (`path.join`, `path.resolve`, `path.dirname`) is consistently used for reliable and cross-platform compatible file system path manipulations.
- **Constant Declarations**: Preference for `const` over `let` and `var` for variables whose values do not change, enhancing code predictability and reducing side effects.

## Naming Conventions
- **JavaScript Variables and Functions**: `camelCase` (e.g., `folderPath`, `scanProject`, `cachedAnalysis`, `createProvider`, `classifyError`).
- **JavaScript Global Constants**: `SCREAMING_SNAKE_CASE` for significant constants (e.g., `PORT`, `DEFAULT_CONFIG`, `CACHE_FILE`, `SKIP_DIRS`, `SYSTEM_PROMPT`).
- **File Names**: `camelCase` for JavaScript source files (e.g., `analyzer.js`, `fileReader.js`, `server.js`). Other configuration and documentation files often use `kebab-case` (e.g., `package.json`, `base-rules.md`).
- **Environment Variables**: `SCREAMING_SNAKE_CASE` (e.g., `GEMINI_API_KEY`, `PORT`).

## File Organization
- **Root Directory**: Contains the main application entry point (`server.js`), project metadata (`package.json`, `README.md`), environment variable template (`.env.example`), Git ignore rules (`.gitignore`), and platform-specific scripts (`start.bat`, `stop.bat`). It also hosts persistent application state files (`.agentforge-cache.json`, `.agentforge-config.json`).
- **`generators/` Directory**: Dedicated to core application logic, further divided into:
    - `analyzer.js`: Handles AI model integration, project analysis, and file generation.
    - `fileReader.js`: Manages file system scanning, project structure analysis, and content extraction, including ignore patterns and limits.
    - `templates.js`: Provides prompt templates for various AI outputs and project summarization utilities.
- **`public/` Directory**: Stores static assets (e.g., `index.html`) that are served directly by the Express server.

## Git Workflow
- **Ignore List**: A `.gitignore` file is present in the project root to explicitly exclude generated files, build artifacts, dependency directories (`node_modules`), and sensitive environment files (`.env`).
- **Commit Practices**: While not explicitly enforced by automated tooling in the provided context, the modular structure of the codebase implies a practice of focused and logically grouped commits.

## Security Rules
- **API Key Management**: All API keys for AI services (e.g., `GEMINI_API_KEY`) must be stored in environment variables and loaded via `dotenv`. They are explicitly excluded from version control using `.gitignore`.
- **Input Validation**: API endpoints implement checks for required parameters (`folderPath`, `apiKey`, `messages`) and basic type validation, preventing common misuse or erroneous operations.
- **File System Access**: Access to the file system is carefully controlled by `fileReader.js`, which uses explicit skip lists (`SKIP_DIRS`, `SKIP_EXTENSIONS`, `SKIP_FILES`) and user-defined exclusions to prevent unauthorized or unintended file exposure.
- **CORS Configuration**: The `cors` middleware is enabled (`app.use(cors())`) to manage cross-origin resource sharing, preventing unauthorized cross-domain requests to the API.

## Performance Rules
- **Token Budgeting**: The `fileReader.js` module enforces a `tokenBudget` (`60000` tokens by default) to limit the total content size sent to AI models, controlling costs and preventing context window overflows.
- **File Scan Limits**: Configurable limits like `maxFiles`, `maxFileSizeKB`, `maxLinesPerFile`, `linesThreshold`, and `maxDepth` are applied during project scanning to efficiently manage the scope and detail of analysis.
- **Caching**: Project analysis results (`cachedAnalysis`) are persisted to `.agentforge-cache.json` and loaded on startup to minimize redundant AI API calls for previously analyzed or unchanged projects.
- **Priority-Based File Reading**: `fileReader.js` utilizes a `FILE_PRIORITY` map to read more critical project configuration files (e.g., `package.json`, `server.js`) ahead of less critical ones, ensuring essential context is gathered within token limits.

## Testing Rules
- **No Automated Tests**: The current codebase explicitly indicates `Has Tests: false`, meaning there are no automated unit, integration, or end-to-end tests implemented.
- **Manual Verification**: Features are expected to be manually tested by interacting with the running application and its API endpoints.
- **Future Integration**: Any new significant features or critical components should consider the addition of automated tests to ensure correctness, prevent regressions, and improve code maintainability.
