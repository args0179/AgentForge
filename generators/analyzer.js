const { getTemplates, getPromptGeneratorTemplate, summarizeProject, SYSTEM_PROMPT, ROLE_PROMPTS } = require('./templates');

// ──────────────────────────────────────────
// Default models per provider
// ──────────────────────────────────────────
const DEFAULT_MODELS = {
    gemini: 'gemini-2.5-flash',
    claude: 'claude-sonnet-4-5',
    openai: 'gpt-4o-mini',
    grok: 'grok-3-mini',
    deepseek: 'deepseek-chat'
};

// ──────────────────────────────────────────
// Multi-provider factory
// ──────────────────────────────────────────
function createProvider(apiKey, modelName, provider = 'gemini') {
    if (provider === 'gemini') {
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        return {
            type: 'gemini',
            model: new GoogleGenerativeAI(apiKey).getGenerativeModel({
                model: modelName || DEFAULT_MODELS.gemini,
                systemInstruction: SYSTEM_PROMPT
            })
        };
    }
    if (provider === 'claude') {
        const Anthropic = require('@anthropic-ai/sdk');
        return {
            type: 'claude',
            client: new Anthropic({ apiKey }),
            modelName: modelName || DEFAULT_MODELS.claude
        };
    }
    // OpenAI-compatible: openai, grok, deepseek
    const baseURLs = {
        openai: 'https://api.openai.com/v1',
        grok: 'https://api.x.ai/v1',
        deepseek: 'https://api.deepseek.com/v1'
    };
    const OpenAI = require('openai');
    return {
        type: 'openai-compat',
        client: new OpenAI({ apiKey, baseURL: baseURLs[provider] }),
        modelName: modelName || DEFAULT_MODELS[provider]
    };
}

// ──────────────────────────────────────────
// Unified provider call
// ──────────────────────────────────────────
async function callProvider(p, prompt) {
    if (p.type === 'gemini') {
        const r = await p.model.generateContent(prompt);
        const u = r.response.usageMetadata;
        return {
            text: r.response.text(),
            tokens: { input: u?.promptTokenCount, output: u?.candidatesTokenCount }
        };
    }
    if (p.type === 'claude') {
        const r = await p.client.messages.create({
            model: p.modelName,
            max_tokens: 8192,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: prompt }]
        });
        return {
            text: r.content[0].text,
            tokens: { input: r.usage?.input_tokens, output: r.usage?.output_tokens }
        };
    }
    // openai-compat (openai, grok, deepseek)
    const r = await p.client.chat.completions.create({
        model: p.modelName,
        max_tokens: 8192,
        messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: prompt }
        ]
    });
    return {
        text: r.choices[0].message.content,
        tokens: { input: r.usage?.prompt_tokens, output: r.usage?.completion_tokens }
    };
}

// ──────────────────────────────────────────
// Analyze a scanned project
// ──────────────────────────────────────────
async function analyzeProject(projectData, apiKey, modelName, provider = 'gemini', logFn = null) {
    const p = createProvider(apiKey, modelName, provider);
    const s = summarizeProject(projectData);

    const prompt = `Analyze this project and provide a concise JSON summary:

Project: ${s.projectName}
Tech Stack: ${s.stackStr}
Frameworks: ${s.frameworkStr}
Total Files: ${s.totalFiles}
Has Docker: ${s.hasDocker}
Has Tests: ${s.hasTests}

File Structure:
${s.fileTreeStr}

Key Files:
${s.keyContents}

Source Code Samples:
${s.sourceContent}

Return a JSON object with:
{
  "summary": "2-3 sentence project description",
  "mainLanguage": "primary language",
  "architecture": "e.g., monolith, microservices, serverless",
  "entryPoints": ["list of main entry files"],
  "codePatterns": ["patterns detected: MVC, REST API, etc."],
  "conventions": {
    "naming": "camelCase/snake_case/etc",
    "indentation": "spaces/tabs and count",
    "quoteStyle": "single/double"
  },
  "recommendations": ["list of recommended agent files to generate"]
}

Output ONLY valid JSON.`;

    const result = await callProvider(p, prompt);
    if (logFn) logFn(result.tokens);

    // Try to parse JSON from response
    let geminiAnalysis;
    try {
        const cleaned = result.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        geminiAnalysis = JSON.parse(cleaned);
    } catch {
        geminiAnalysis = { summary: result.text, raw: true };
    }

    return {
        ...projectData,
        geminiAnalysis
    };
}

// ──────────────────────────────────────────
// Generate a single file
// ──────────────────────────────────────────
async function generateFile(fileType, projectAnalysis, apiKey, modelName, provider = 'gemini', logFn = null) {
    const p = createProvider(apiKey, modelName, provider);
    const templates = getTemplates();

    const templateFn = templates[fileType];
    if (!templateFn) {
        throw new Error(`Unknown file type: ${fileType}`);
    }

    const prompt = templateFn(projectAnalysis);
    const result = await callProvider(p, prompt);
    if (logFn) logFn(result.tokens);

    // Clean wrapping code fences if the model accidentally adds them
    let content = result.text;
    content = content.replace(/^```[\w]*\n/, '').replace(/\n```\s*$/, '').trim();

    return content;
}

// ──────────────────────────────────────────
// Generate a professional prompt (multi-file output)
// ──────────────────────────────────────────
// ──────────────────────────────────────────
// Generate a professional prompt (single or multi-file output)
// ──────────────────────────────────────────
async function generatePrompt({ taskDescription, targetAI, promptStyle, includeProjectContext, includeGeneratedFiles, projectAnalysis, generatedFiles, apiKey, modelName, provider = 'gemini', mode = 'multi', logFn = null }) {
    const log = typeof logFn === 'function' ? logFn : () => {};

    let projectSummary = '';
    if (includeProjectContext && projectAnalysis) {
        const s = summarizeProject(projectAnalysis);
        projectSummary = `Project: ${s.projectName}\nStack: ${s.stackStr}\nFrameworks: ${s.frameworkStr}\nStructure:\n${s.fileTreeStr}`;
        if (projectAnalysis.geminiAnalysis?.summary) {
            projectSummary += `\nAnalysis: ${projectAnalysis.geminiAnalysis.summary}`;
        }
    }

    let relevantFiles = '';
    if (includeGeneratedFiles && generatedFiles) {
        for (const [name, content] of Object.entries(generatedFiles)) {
            relevantFiles += `\n--- ${name} ---\n${content}\n`;
        }
    }

    // Pass mode into template so it returns correct instructions
    const prompt = getPromptGeneratorTemplate({
        taskDescription, targetAI, promptStyle,
        projectSummary, relevantFiles,
        mode
    });

    log('info', 'generator', `Generating ${mode} prompt for ${targetAI} (${promptStyle})...`);
    const result = await callProvider(createProvider(apiKey, modelName, provider), prompt);
    log('success', 'generator', `Prompt generated`, { tokens: result.tokens });

    const rawText = result.text.trim();

    // ── SINGLE mode ──────────────────────────────────────────
    if (mode === 'single') {
        return { type: 'single', content: rawText };
    }

    // ── MULTI mode ───────────────────────────────────────────
    // Try to parse JSON. Apply multiple cleaning strategies before giving up.
    const parsed = tryParseMultiJSON(rawText, log);

    if (parsed && isValidMultiResult(parsed)) {
        log('success', 'generator', `Multi-prompt parsed: ${parsed.prompts.length} prompts`);
        return { type: 'multi', guide: parsed.guide, prompts: parsed.prompts };
    }

    // Fallback: if JSON fails, wrap the full response as a single prompt
    log('warn', 'generator', 'Multi JSON parse failed — falling back to single prompt');
    return {
        type: 'single',
        content: rawText
    };
}

// ── JSON parsing helpers ─────────────────────────────────────
function tryParseMultiJSON(text, log) {
    // Strategy 1: direct parse
    try { return JSON.parse(text); } catch {}

    // Strategy 2: strip ```json fences
    try {
        const s2 = text.replace(/^```json\s*/i, '').replace(/\s*```\s*$/, '').trim();
        return JSON.parse(s2);
    } catch {}

    // Strategy 3: strip any ``` fences
    try {
        const s3 = text.replace(/^```\w*\s*/m, '').replace(/\s*```\s*$/, '').trim();
        return JSON.parse(s3);
    } catch {}

    // Strategy 4: find first { ... } block in response
    try {
        const match = text.match(/\{[\s\S]*\}/);
        if (match) return JSON.parse(match[0]);
    } catch {}

    // Strategy 5: find JSON between first { and last }
    try {
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start !== -1 && end !== -1 && end > start) {
            return JSON.parse(text.slice(start, end + 1));
        }
    } catch {}

    if (log) log('error', 'generator', 'All JSON parse strategies failed', { preview: text.slice(0, 200) });
    return null;
}

function isValidMultiResult(obj) {
    if (!obj || typeof obj !== 'object') return false;
    if (typeof obj.guide !== 'string' || !obj.guide.trim()) return false;
    if (!Array.isArray(obj.prompts) || obj.prompts.length === 0) return false;
    // Each prompt must have at minimum a content field
    return obj.prompts.every(p =>
        p && typeof p.content === 'string' && p.content.trim().length > 20
    );
}

module.exports = { analyzeProject, generateFile, generatePrompt, createProvider, callProvider, DEFAULT_MODELS };
