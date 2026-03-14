@.agents/rules/base.md

## Agent Workflow

### Before Starting Any Task
1. Read the relevant files fully before editing.
2. Check existing patterns in the codebase — do not invent new ones.
3. Understand the flow of API requests in `server.js` and how they interact with modules in `generators/`.
4. Review the error classification logic in `server.js` for handling external API errors.

### Making Changes
- Work in small, focused commits.
- Ensure `package.json` dependencies are updated if new libraries are introduced.
- Verify changes by running `npm start` and manually testing affected API endpoints.
- Never leave the codebase in a broken state.

### Pull Request Standards
- Commits should be descriptive, clearly stating the purpose of the change.
- No automated tests are configured, so thorough manual verification of functionality is expected.
- Ensure the application starts without errors and all relevant API routes are functional.

## File Ownership
- `server.js`: Main application entry point, API routing, state management, core logic flow.
- `generators/`: Contains logic for project scanning, AI analysis, file generation, and prompt creation.
- `public/`: Frontend assets and `index.html`.
- `package.json`, `.env.example`, `README.md`: Project metadata, environment variables, and documentation.
- `.gitignore`, `start.bat`, `stop.bat`: Version control exclusions and local execution scripts.

## Forbidden Actions
- Do not commit directly to main/master.
- Do not expose API keys or other sensitive information directly in source code or publicly accessible logs. All sensitive info must be loaded from `.env`.
- Do not introduce new dependencies without a clear justification and update `package.json`.
- Avoid making breaking changes to existing API endpoints without explicit approval.
