require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');

const { scanProject, estimateProject, DEFAULT_CONFIG } = require('./generators/fileReader');
const { analyzeProject, generateFile, generatePrompt, createProvider, callProvider, DEFAULT_MODELS } = require('./generators/analyzer');

const app  = express();
const PORT = process.env.PORT || 3456;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Persistent files ─────────────────────────────────────────
const CACHE_FILE       = path.join(__dirname, '.agentforge-cache.json');
const SCAN_CONFIG_FILE = path.join(__dirname, '.agentforge-config.json');

// ─── In-memory state ──────────────────────────────────────────
let cachedAnalysis = null;
let scanConfig     = { ...DEFAULT_CONFIG };

// Load analysis cache on startup
if (fs.existsSync(CACHE_FILE)) {
    try {
        cachedAnalysis = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
        console.log('  ✅ Loaded cached analysis from disk');
    } catch { console.log('  ⚠️  Cache file unreadable — starting fresh'); }
}

// Load scan config on startup
if (fs.existsSync(SCAN_CONFIG_FILE)) {
    try {
        scanConfig = { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(SCAN_CONFIG_FILE, 'utf-8')) };
        console.log('  ✅ Loaded scan config from disk');
    } catch { /* ignore */ }
}

function saveAnalysisCache(data) {
    cachedAnalysis = data;
    try { fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2)); } catch { /* non-fatal */ }
}

function saveScanConfig(cfg) {
    scanConfig = { ...DEFAULT_CONFIG, ...cfg };
    try { fs.writeFileSync(SCAN_CONFIG_FILE, JSON.stringify(scanConfig, null, 2)); } catch { /* non-fatal */ }
}

// ─── Log system ───────────────────────────────────────────────
const logStore = [];
function addLog(level, category, message, data = null) {
    const e = {
        id       : Date.now() + Math.random(),
        timestamp: new Date().toISOString(),
        level,
        category,
        message,
        data: data ? JSON.stringify(data).slice(0, 300) : null,
    };
    logStore.push(e);
    if (logStore.length > 500) logStore.shift();
    return e;
}

// ─── Error classifier ─────────────────────────────────────────
function classifyError(err) {
    const msg = (err.message || '').toLowerCase();
    if (msg.includes('401') || msg.includes('invalid api key') || msg.includes('authentication') || msg.includes('unauthorized'))
        return { message: 'API key không hợp lệ hoặc hết hạn. Vui lòng kiểm tra lại.', code: 'BAD_KEY' };
    if (msg.includes('403') || msg.includes('forbidden') || msg.includes('permission'))
        return { message: 'API key không có quyền truy cập model này.', code: 'NO_PERMISSION' };
    if (msg.includes('404') || msg.includes('model not found') || msg.includes('not exist'))
        return { message: 'Model không tồn tại. Vui lòng chọn model khác.', code: 'NO_MODEL' };
    if (msg.includes('429') || msg.includes('rate limit') || msg.includes('quota'))
        return { message: 'Vượt rate limit. Chờ vài giây rồi thử lại.', code: 'RATE_LIMIT' };
    if (msg.includes('context') || msg.includes('too long') || msg.includes('token') && msg.includes('limit'))
        return { message: 'Project quá lớn cho model này. Thử giảm maxFiles hoặc dùng model có context window lớn hơn.', code: 'CONTEXT_TOO_LARGE' };
    if (msg.includes('timeout') || msg.includes('econnrefused') || msg.includes('network') || msg.includes('enotfound'))
        return { message: 'Lỗi kết nối. Kiểm tra internet và thử lại.', code: 'NETWORK' };
    if (msg.includes('not found') || msg.includes('not a directory'))
        return { message: err.message, code: 'BAD_PATH' };
    return { message: err.message || 'Unknown error', code: 'UNKNOWN' };
}

// ─── POST /api/analyze ────────────────────────────────────────
app.post('/api/analyze', async (req, res) => {
    try {
        const { folderPath, apiKey, modelName, provider = 'gemini' } = req.body;
        if (!folderPath) return res.status(400).json({ error: 'folderPath is required' });
        if (!apiKey)     return res.status(400).json({ error: 'API key is required. Enter your API key in the header bar.' });

        const normalizedPath = path.resolve(folderPath);

        addLog('info', 'file-reader', `Scanning: ${normalizedPath}`);
        const projectData = await scanProject(normalizedPath, scanConfig);
        addLog('info', 'file-reader',
            `Found ${projectData.totalFiles} files (read ${projectData.filesRead}) | ~${projectData.estimatedTokens.toLocaleString()} tokens | Stack: ${projectData.detectedStack.join(', ')}`);

        const analysis = await analyzeProject(projectData, apiKey, modelName, provider);
        addLog('success', 'analyzer', `Analysis complete`, { provider, model: modelName });

        saveAnalysisCache(analysis);

        res.json({
            folderPath      : analysis.folderPath,
            fileTree        : analysis.fileTree,
            detectedStack   : analysis.detectedStack,
            totalFiles      : analysis.totalFiles,
            filesRead       : analysis.filesRead,
            estimatedTokens : analysis.estimatedTokens,
            hasDocker       : analysis.hasDocker,
            hasTests        : analysis.hasTests,
            frameworks      : analysis.frameworks,
            packageJson     : analysis.packageJson,
            geminiAnalysis  : analysis.geminiAnalysis,
        });
    } catch (err) {
        console.error('Analyze error:', err);
        const { message, code } = classifyError(err);
        addLog('error', 'analyzer', message);
        const status = ['BAD_PATH'].includes(code) ? 400 : 500;
        res.status(status).json({ error: message, code });
    }
});

// ─── POST /api/estimate ───────────────────────────────────────
// Quick scan WITHOUT calling AI — shows token count & cost guide
app.post('/api/estimate', async (req, res) => {
    try {
        const { folderPath } = req.body;
        if (!folderPath) return res.status(400).json({ error: 'folderPath is required' });

        const normalizedPath = path.resolve(folderPath);
        addLog('info', 'file-reader', `Estimating: ${normalizedPath}`);

        const result = await estimateProject(normalizedPath, scanConfig);
        addLog('info', 'file-reader', `Estimate: ${result.totalFiles} files, ~${result.estimatedTokens.toLocaleString()} tokens`);

        res.json(result);
    } catch (err) {
        const { message } = classifyError(err);
        res.status(400).json({ error: message });
    }
});

// ─── GET /api/scan-config ─────────────────────────────────────
app.get('/api/scan-config', (req, res) => {
    res.json({ config: scanConfig, defaults: DEFAULT_CONFIG });
});

// ─── POST /api/scan-config ────────────────────────────────────
app.post('/api/scan-config', (req, res) => {
    try {
        const { config } = req.body;
        if (!config || typeof config !== 'object')
            return res.status(400).json({ error: 'config object required' });

        // Validate numeric fields
        const numFields = ['maxFiles','maxFileSizeKB','maxLinesPerFile','linesThreshold','tokenBudget','maxDepth'];
        for (const f of numFields) {
            if (config[f] !== undefined && (typeof config[f] !== 'number' || config[f] < 1))
                return res.status(400).json({ error: `${f} must be a positive number` });
        }

        saveScanConfig(config);
        addLog('info', 'settings', 'Scan config updated', config);
        res.json({ saved: true, config: scanConfig });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /api/generate ───────────────────────────────────────
app.post('/api/generate', async (req, res) => {
    try {
        const { selectedFiles, apiKey, modelName, provider = 'gemini' } = req.body;
        if (!selectedFiles?.length) return res.status(400).json({ error: 'No files selected for generation' });
        if (!apiKey)                return res.status(400).json({ error: 'API key is required' });
        if (!cachedAnalysis)        return res.status(400).json({ error: 'No project analysis found. Please analyze a project first.' });

        const files  = {};
        const errors = [];

        for (const fileType of selectedFiles) {
            try {
                addLog('info', 'generator', `Generating ${fileType}...`);
                files[fileType] = await generateFile(fileType, cachedAnalysis, apiKey, modelName, provider);
                addLog('success', 'generator', `${fileType} done (${files[fileType].length} chars)`);
            } catch (err) {
                const { message } = classifyError(err);
                addLog('error', 'generator', `${fileType} failed: ${message}`);
                errors.push({ file: fileType, error: message });
            }
        }

        res.json({ files, errors });
    } catch (err) {
        const { message } = classifyError(err);
        addLog('error', 'generator', message);
        res.status(500).json({ error: message });
    }
});

// ─── POST /api/save ───────────────────────────────────────────
app.post('/api/save', async (req, res) => {
    try {
        const { folderPath, files } = req.body;
        if (!folderPath || !files) return res.status(400).json({ error: 'folderPath and files are required' });

        const normalizedPath = path.resolve(folderPath);
        if (!fs.existsSync(normalizedPath)) return res.status(400).json({ error: `Folder not found: ${normalizedPath}` });

        const saved  = [];
        const errors = [];

        for (const [fileName, content] of Object.entries(files)) {
            try {
                const filePath = path.join(normalizedPath, fileName);
                fs.mkdirSync(path.dirname(filePath), { recursive: true });
                fs.writeFileSync(filePath, content, 'utf-8');
                saved.push(fileName);
            } catch (err) {
                errors.push({ file: fileName, error: err.message });
            }
        }

        addLog('success', 'save', `Saved ${saved.length} files to ${normalizedPath}`);
        res.json({ saved, errors });
    } catch (err) {
        addLog('error', 'save', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /api/generate-prompt ────────────────────────────────
app.post('/api/generate-prompt', async (req, res) => {
    try {
        const {
            taskDescription, targetAI, promptStyle,
            includeProjectContext, includeGeneratedFiles,
            generatedFiles, apiKey, modelName, provider = 'gemini', mode = 'multi'
        } = req.body;

        if (!taskDescription) return res.status(400).json({ error: 'Task description is required' });
        if (!apiKey)          return res.status(400).json({ error: 'API key is required' });

        const result = await generatePrompt({
            taskDescription,
            targetAI             : targetAI || 'Claude',
            promptStyle          : promptStyle || 'Detailed',
            includeProjectContext: includeProjectContext || false,
            includeGeneratedFiles: includeGeneratedFiles || false,
            projectAnalysis      : cachedAnalysis,
            generatedFiles       : generatedFiles || {},
            apiKey, modelName, provider, mode,
            logFn: (l, c, m, d) => addLog(l, c, m, d),
        });

        res.json(result);
    } catch (err) {
        const { message } = classifyError(err);
        addLog('error', 'generator', message);
        res.status(500).json({ error: message });
    }
});

// ─── POST /api/chat ───────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
    try {
        const { messages, role = 'Context Engineer', apiKey, modelName, provider = 'gemini', includeProjectContext = true } = req.body;
        if (!messages?.length) return res.status(400).json({ error: 'messages required' });
        if (!apiKey)           return res.status(400).json({ error: 'API key required' });

        const { ROLE_PROMPTS, summarizeProject } = require('./generators/templates');

        let systemPrompt = ROLE_PROMPTS[role] || ROLE_PROMPTS['Context Engineer'];
        if (includeProjectContext && cachedAnalysis) {
            const s = summarizeProject(cachedAnalysis);
            systemPrompt += `\n\nCurrent project context:\n- Name: ${s.projectName}\n- Stack: ${s.stackStr}\n- Frameworks: ${s.frameworkStr}\n- Files: ${s.totalFiles}\n\nFile structure:\n${s.fileTreeStr}\n\nKey files:\n${s.keyContents}`;
        }

        addLog('info', 'chat', `Chat request (${role}, ${provider})`);
        const instance = createProvider(apiKey, modelName, provider);
        let responseText;

        if (instance.type === 'gemini') {
            const { GoogleGenerativeAI } = require('@google/generative-ai');
            const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
                model: modelName || 'gemini-2.5-flash',
                systemInstruction: systemPrompt,
            });
            const history = messages.slice(0, -1).map(m => ({
                role : m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }],
            }));
            const r = await model.startChat({ history }).sendMessage(messages[messages.length - 1].content);
            responseText = r.response.text();
            addLog('success', 'chat', `Chat reply (${role})`, { tokens: { input: r.response.usageMetadata?.promptTokenCount, output: r.response.usageMetadata?.candidatesTokenCount } });

        } else if (instance.type === 'claude') {
            const r = await instance.client.messages.create({
                model    : instance.modelName, max_tokens: 4096,
                system   : systemPrompt,
                messages : messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
            });
            responseText = r.content[0].text;
            addLog('success', 'chat', `Chat reply (${role})`, { tokens: { input: r.usage?.input_tokens, output: r.usage?.output_tokens } });

        } else {
            const r = await instance.client.chat.completions.create({
                model: instance.modelName, max_tokens: 4096,
                messages: [{ role: 'system', content: systemPrompt }, ...messages.map(m => ({ role: m.role, content: m.content }))],
            });
            responseText = r.choices[0].message.content;
            addLog('success', 'chat', `Chat reply (${role})`, { tokens: { input: r.usage?.prompt_tokens, output: r.usage?.completion_tokens } });
        }

        res.json({ reply: responseText });
    } catch (err) {
        const { message } = classifyError(err);
        addLog('error', 'chat', message);
        res.status(500).json({ error: message });
    }
});

// ─── GET /api/logs ────────────────────────────────────────────
app.get('/api/logs', (req, res) => {
    res.json({ logs: logStore.filter(l => l.id > Number(req.query.since || 0)), total: logStore.length });
});

app.delete('/api/logs', (req, res) => {
    logStore.length = 0;
    res.json({ cleared: true });
});

// ─── GET /api/providers ───────────────────────────────────────
app.get('/api/providers', (req, res) => {
    res.json({
        providers    : ['gemini','claude','openai','grok','deepseek'],
        defaultModels: DEFAULT_MODELS,
        modelSuggestions: {
            gemini: [
                { id: 'gemini-2.5-flash',      label: 'Gemini 2.5 Flash',      tier: 'free', note: '⭐ Recommended — free tier, fast' },
                { id: 'gemini-2.5-flash-lite',  label: 'Gemini 2.5 Flash-Lite', tier: 'free', note: 'Lightest & cheapest, high volume tasks' },
                { id: 'gemini-2.5-pro',         label: 'Gemini 2.5 Pro',        tier: 'paid', note: 'Best reasoning, large context — requires billing' },
            ],
            claude: [
                { id: 'claude-sonnet-4-5',       label: 'Claude Sonnet 4.5',   tier: 'paid', note: '⭐ Best balance — fast & smart' },
                { id: 'claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku',    tier: 'paid', note: 'Fastest & cheapest Claude' },
                { id: 'claude-opus-4-5',         label: 'Claude Opus 4.5',     tier: 'paid', note: 'Most powerful — highest cost' },
            ],
            openai: [
                { id: 'gpt-4o-mini',   label: 'GPT-4o Mini',   tier: 'paid', note: '⭐ Best value — fast & affordable' },
                { id: 'gpt-4o',        label: 'GPT-4o',        tier: 'paid', note: 'Full power multimodal' },
                { id: 'o3-mini',       label: 'o3-mini',       tier: 'paid', note: 'Efficient reasoning model' },
            ],
            grok: [
                { id: 'grok-3',          label: 'Grok 3',          tier: 'paid', note: '⭐ Latest — most capable' },
                { id: 'grok-3-mini',     label: 'Grok 3 Mini',     tier: 'paid', note: 'Fast & affordable' },
                { id: 'grok-3-reasoner', label: 'Grok 3 Reasoner', tier: 'paid', note: 'Deep reasoning tasks' },
            ],
            deepseek: [
                { id: 'deepseek-chat',     label: 'DeepSeek Chat',     tier: 'paid', note: '⭐ Fast & very cheap' },
                { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner', tier: 'paid', note: 'Step-by-step reasoning (R1)' },
            ],
        },
    });
});

// ─── POST /api/validate-key ───────────────────────────────────
app.post('/api/validate-key', async (req, res) => {
    const { apiKey, provider = 'gemini', modelName } = req.body;
    if (!apiKey) return res.status(400).json({ valid: false, error: 'No API key provided' });
    try {
        await callProvider(createProvider(apiKey, modelName || DEFAULT_MODELS[provider], provider), 'Reply with exactly: OK');
        addLog('success', 'analyzer', `API key validated for ${provider}`);
        res.json({ valid: true, provider });
    } catch (e) {
        const { message } = classifyError(e);
        addLog('error', 'analyzer', `Key validation failed for ${provider}: ${message}`);
        res.json({ valid: false, error: message });
    }
});

// ─── GET /api/browse-folder ───────────────────────────────────
app.get('/api/browse-folder', (req, res) => {
    const { exec } = require('child_process');
    const platform = process.platform;
    let cmd;
    if (platform === 'win32') {
        cmd = `powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description = 'Select project folder'; if ($d.ShowDialog() -eq 'OK') { Write-Output $d.SelectedPath }"`;
    } else if (platform === 'darwin') {
        cmd = `osascript -e 'POSIX path of (choose folder with prompt "Select project folder")'`;
    } else {
        cmd = `zenity --file-selection --directory --title="Select project folder" 2>/dev/null || kdialog --getexistingdirectory 2>/dev/null`;
    }
    exec(cmd, (err, stdout) => {
        if (err || !stdout.trim()) return res.json({ path: null, cancelled: true });
        res.json({ path: stdout.trim().replace(/\/$/, '') });
    });
});

// ─── GET /api/cache-status ────────────────────────────────────
app.get('/api/cache-status', (req, res) => {
    if (!cachedAnalysis) return res.json({ hasCache: false });
    res.json({
        hasCache  : true,
        folderPath: cachedAnalysis.folderPath,
        totalFiles: cachedAnalysis.totalFiles,
        stack     : cachedAnalysis.detectedStack,
    });
});

// ─── DELETE /api/cache ────────────────────────────────────────
app.delete('/api/cache', (req, res) => {
    cachedAnalysis = null;
    try { if (fs.existsSync(CACHE_FILE)) fs.unlinkSync(CACHE_FILE); } catch { /* non-fatal */ }
    addLog('info', 'settings', 'Analysis cache cleared');
    res.json({ cleared: true });
});

// ─── Start ────────────────────────────────────────────────────
app.listen(PORT, async () => {
    console.log(`\n  🤖 AgentForge is running at http://localhost:${PORT}\n`);
    try {
        const open = (await import('open')).default;
        open(`http://localhost:${PORT}`);
    } catch {
        console.log('  (Could not auto-open browser — open the URL manually.)');
    }
});
