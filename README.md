# 🤖 AgentForge: AI Agent File Generator

[![Node.js](https://img.shields.io/badge/Node.js-20.x-green?logo=node.js)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-4.x-blue?logo=express)](https://expressjs.com/)
[![Gemini API](https://img.shields.io/badge/Google%20Gemini-API-orange?logo=google-gemini)](https://ai.google.dev/)
[![Anthropic Claude](https://img.shields.io/badge/Anthropic-Claude-red?logo=anthropic)](https://www.anthropic.com/api)
[![OpenAI](https://img.shields.io/badge/OpenAI-API-informational?logo=openai)](https://openai.com/docs/api)
[![License](https://img.shields.io/badge/License-MIT-brightgreen)](LICENSE)

AgentForge is a powerful AI Agent File Generator Tool designed to streamline the process of preparing your codebases for AI-driven development. It analyzes projects and generates precise, professional AI agent configuration files, such as `AGENTS.md` and `.agents/rules/base.md`, along with custom prompts for various AI models.

## ✨ Features

*   **Project Analysis**: Deep scans of codebases to understand tech stack, frameworks, file structure, and conventions.
*   **AI Agent File Generation**: Automatically creates standardized AI configuration files like `AGENTS.md` and `.agents/rules/base.md`.
*   **Multi-Provider AI Support**: Seamlessly integrates with Google Gemini, Anthropic Claude, OpenAI, Grok, and DeepSeek.
*   **Dynamic Prompt Generation**: Craft specific or multi-step prompts based on project context and desired AI agent roles.
*   **Interactive Chat**: Engage with AI models in a contextual chat, leveraging your project's analysis for more relevant conversations.
*   **Configurable Scans**: Customize file inclusion/exclusion, depth, and token budget for tailored project insights.
*   **Real-time Logging**: Monitor all operations and AI interactions with a comprehensive log system.
*   **Local Caching**: Persists project analysis to disk for faster subsequent operations.
*   **Cross-platform Folder Browsing**: Native folder selection dialogs for Windows, macOS, and Linux.

## 🚀 Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

You need Node.js (LTS recommended) installed on your system.
[Download Node.js](https://nodejs.org/en/download/)

### Installation

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/args0179/agentforge.git
    cd agentforge
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Configure Environment Variables**:
    Copy the `.env.example` file to `.env` and fill in your API key for Google Gemini (or any other provider you intend to use).

    ```bash
    cp .env.example .env
    ```

    Edit the new `.env` file:
    ```ini
    # Google Gemini API Key
    GEMINI_API_KEY=YOUR_GEMINI_API_KEY_HERE

    # Server port
    PORT=7312
    ```
    **Note**: While `GEMINI_API_KEY` is shown, AgentForge supports multiple providers. You will input other API keys (e.g., for Claude, OpenAI) directly in the application's UI.

### Running the Application

1.  **Start the server**:
    ```bash
    npm start
    ```
    This will start the Express server and automatically open the web interface in your default browser.

2.  **Access the Web Interface**:
    Open your browser and navigate to `http://localhost:7312`.

    If you prefer to run in development mode with `nodemon` for auto-restarts:
    ```bash
    npm run dev
    ```

## 💡 Usage Guide

1.  **Analyze Project**:
    *   In the AgentForge web interface, enter the `Path to Project Folder` you want to analyze.
    *   Enter your `API Key` for your preferred AI provider (e.g., Gemini, Claude, OpenAI).
    *   Click `Analyze Project`. The tool will scan your codebase and send a summary to the AI for analysis.
    *   The analyzed project context will be cached locally.

2.  **Generate AI Agent Files**:
    *   After analysis, select the type of AI agent files you want to generate (e.g., `AGENTS.md`, `.agents/rules/base.md`).
    *   Click `Generate`.
    *   The generated content will be displayed, ready for review.

3.  **Save Files**:
    *   If you're satisfied with the generated files, click `Save` to write them directly into your project folder.

4.  **Generate Prompts**:
    *   Use the `Generate Prompt` feature to create specific AI prompts tailored with project context for various tasks.

5.  **Chat with Context**:
    *   Utilize the `Chat` interface to interact with an AI model while providing it with the current project's analysis.

## 📁 Project Structure

```
agentforge/
├── generators/
│   ├── analyzer.js
│   ├── fileReader.js
│   └── templates.js
├── public/
│   └── index.html
├── .env.example
├── .gitignore
├── package.json
├── README.md
├── server.js
├── start.bat
└── stop.bat
```

*   `server.js`: The main Express.js application file, handling API routes and serving the frontend.
*   `public/`: Contains static assets for the web interface, primarily `index.html`.
*   `generators/`: Houses the core logic for project scanning, AI analysis, file generation, and prompt templating.
    *   `analyzer.js`: Connects to AI providers, performs project analysis, and generates content.
    *   `fileReader.js`: Scans the project directory, reads files, and estimates token usage.
    *   `templates.js`: Stores prompt templates for various AI agent configuration files.
*   `.env.example`: Template for environment variables.
*   `package.json`: Defines project metadata and dependencies.
*   `start.bat`/`stop.bat`: Simple batch scripts for Windows users to start/stop the application (not explicitly covered in `package.json` scripts but part of the project structure).

## ⚙️ Environment Variables

To run this project, you need to set up your environment variables. Copy `.env.example` to `.env` and fill in the values.

| Variable        | Description                            | Example Default (from `.env.example`) |
| :-------------- | :------------------------------------- | :------------------------------------ |
| `GEMINI_API_KEY`| Your API key for Google Gemini.        | `AIzaSyC...` (placeholder) |
| `PORT`          | The port on which the server will run. | `7312`                                |

## 🤝 Contributing

Contributions are welcome! If you have suggestions for improvements, new features, or bug fixes, please open an issue or submit a pull request.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.