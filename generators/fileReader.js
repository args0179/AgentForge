'use strict';
const fs   = require('fs');
const path = require('path');

// ─── Default scan config (can be overridden per-call) ─────────
const DEFAULT_CONFIG = {
    maxFiles        : 120,
    maxFileSizeKB   : 500,
    maxLinesPerFile : 200,    // lines shown when file is truncated
    linesThreshold  : 500,    // truncate files larger than this
    tokenBudget     : 60000,  // stop reading content once est. tokens exceed this
    maxDepth        : 8,
    respectGitignore: true,
    excludePatterns : [],     // user extra excludes (simple glob-like strings)
    includePatterns : [],     // if non-empty, ONLY include matching files
};

// ─── Built-in skip lists ───────────────────────────────────────
const SKIP_DIRS = new Set([
    'node_modules', '.git', 'dist', 'build', '.next', '__pycache__',
    '.DS_Store', '.vscode', '.idea', 'coverage', '.cache', '.parcel-cache',
    'vendor', '.terraform', '.serverless', 'tmp', 'temp', '.nuxt',
    '.output', '.svelte-kit', 'target', 'bin', 'obj', '.angular',
    '.yarn', '.pnp', 'out', 'storybook-static', '.storybook-out',
]);

const SKIP_EXTENSIONS = new Set([
    '.png','.jpg','.jpeg','.gif','.ico','.bmp','.webp',
    '.woff','.woff2','.ttf','.eot','.otf',
    '.mp4','.mp3','.avi','.mov','.webm','.ogg','.wav','.flac',
    '.zip','.tar','.gz','.rar','.7z','.bz2',
    '.exe','.dll','.so','.dylib','.bin','.dat',
    '.pdf','.doc','.docx','.xls','.xlsx','.ppt','.pptx',
    '.pyc','.pyo','.class','.o','.obj',
    '.sqlite','.db','.mdb',
    '.map','.snap',
    // SVG is text but rarely useful for AI analysis
    '.svg',
]);

const SKIP_FILES = new Set([
    'package-lock.json','yarn.lock','pnpm-lock.yaml','composer.lock',
    'Gemfile.lock','Pipfile.lock','poetry.lock',
    '.DS_Store','Thumbs.db','desktop.ini',
    // Large auto-generated files
    'CHANGELOG.md','CHANGELOG','HISTORY.md',
]);

// ─── File importance scoring (higher = read first) ────────────
// Inspired by Repomix's git-change-frequency sorting.
// We don't have git here so we use a static priority map.
const FILE_PRIORITY = {
    // Project manifests — highest priority
    'package.json'         : 100,
    'pyproject.toml'       : 100,
    'Cargo.toml'           : 100,
    'go.mod'               : 100,
    'pom.xml'              : 100,
    'build.gradle'         : 100,
    'Gemfile'              : 100,
    // Config files
    'tsconfig.json'        : 90,
    'tsconfig.build.json'  : 85,
    'vite.config.ts'       : 85,
    'vite.config.js'       : 85,
    'next.config.js'       : 85,
    'next.config.mjs'      : 85,
    'tailwind.config.js'   : 80,
    'tailwind.config.ts'   : 80,
    'eslint.config.js'     : 75,
    '.eslintrc.json'       : 75,
    '.eslintrc.js'         : 75,
    'jest.config.js'       : 75,
    'jest.config.ts'       : 75,
    'vitest.config.ts'     : 75,
    'webpack.config.js'    : 75,
    'rollup.config.js'     : 75,
    'babel.config.js'      : 75,
    '.babelrc'             : 75,
    'Dockerfile'           : 70,
    'docker-compose.yml'   : 70,
    'docker-compose.yaml'  : 70,
    '.env.example'         : 65,
    '.env.sample'          : 65,
    // Entry points / main files
    'main.ts'              : 60,
    'main.js'              : 60,
    'index.ts'             : 58,
    'index.js'             : 58,
    'app.ts'               : 58,
    'app.js'               : 58,
    'server.ts'            : 58,
    'server.js'            : 58,
    'main.py'              : 58,
    'app.py'               : 58,
    'main.go'              : 58,
    'main.rs'              : 58,
    // Docs
    'README.md'            : 50,
    'CONTRIBUTING.md'      : 40,
    'requirements.txt'     : 70,
    'setup.py'             : 70,
    'Pipfile'              : 70,
};

// ─── Simple gitignore parser ───────────────────────────────────
function loadGitignorePatterns(dirPath) {
    const patterns = [];
    const gitignorePath = path.join(dirPath, '.gitignore');
    if (!fs.existsSync(gitignorePath)) return patterns;

    try {
        const lines = fs.readFileSync(gitignorePath, 'utf-8').split('\n');
        for (const line of lines) {
            const t = line.trim();
            if (!t || t.startsWith('#')) continue;
            patterns.push(compileGitignorePattern(t));
        }
    } catch { /* ignore unreadable */ }

    return patterns;
}

function compileGitignorePattern(pattern) {
    let p = pattern.replace(/\\/g, '/');
    const negate  = p.startsWith('!');
    if (negate) p = p.slice(1);
    const isDir   = p.endsWith('/');
    if (isDir) p  = p.slice(0, -1);
    const rooted  = p.includes('/');

    // Convert glob to regex
    let rx = p
        .replace(/[.+^${}()|[\]]/g, '\\$&')   // escape regex specials (not * ? \)
        .replace(/\*\*/g, '\u0000')            // protect **
        .replace(/\*/g, '[^/]*')               // * → any non-slash chars
        .replace(/\u0000/g, '.*')              // ** → anything
        .replace(/\?/g, '[^/]');               // ? → single non-slash

    const suffix = isDir ? '(/.*)?$' : '(/.*)?$';
    const regex  = rooted
        ? new RegExp('^' + rx + suffix)
        : new RegExp('(^|/)' + rx + suffix);

    return { regex, negate };
}

function isIgnoredByGitignore(relativePath, compiledPatterns) {
    const p = relativePath.replace(/\\/g, '/');
    let ignored = false;
    for (const { regex, negate } of compiledPatterns) {
        if (regex.test(p)) {
            ignored = !negate;
        }
    }
    return ignored;
}

// ─── User extra patterns (simple substring / glob) ────────────
function compileUserPatterns(patterns) {
    return patterns.map(p => {
        p = p.trim().replace(/\\/g, '/');
        let rx = p
            .replace(/[.+^${}()|[\]]/g, '\\$&')
            .replace(/\*\*/g, '\u0000')
            .replace(/\*/g, '[^/]*')
            .replace(/\u0000/g, '.*')
            .replace(/\?/g, '[^/]');
        return new RegExp('(^|/)' + rx + '(/.*)?$');
    });
}

function matchesAnyPattern(relativePath, compiled) {
    const p = relativePath.replace(/\\/g, '/');
    return compiled.some(rx => rx.test(p));
}

// ─── Token estimation ─────────────────────────────────────────
// Repomix uses tiktoken; we use a fast approximation: 1 token ≈ 4 chars
function estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
}

// ─── File priority score ──────────────────────────────────────
function filePriority(fileName) {
    return FILE_PRIORITY[fileName] ?? (fileName.endsWith('.md') ? 30 : 10);
}

// ─── Build file tree ──────────────────────────────────────────
function buildFileTree(dirPath, basePath = '', depth = 0, cfg = DEFAULT_CONFIG, gitignorePatterns = [], excludeCompiled = []) {
    const tree = [];
    if (depth > cfg.maxDepth) return tree;

    let entries;
    try {
        entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch { return tree; }

    // Sort: directories first, then files by priority (desc)
    entries.sort((a, b) => {
        const aDir = a.isDirectory(), bDir = b.isDirectory();
        if (aDir && !bDir) return -1;
        if (!aDir && bDir) return 1;
        if (!aDir && !bDir) return filePriority(b.name) - filePriority(a.name);
        return a.name.localeCompare(b.name);
    });

    for (const entry of entries) {
        const entryName   = entry.name;
        const fullPath    = path.join(dirPath, entryName);
        const relativePath = (basePath ? basePath + '/' + entryName : entryName).replace(/\\/g, '/');

        if (entry.isDirectory()) {
            // Built-in skip
            if (SKIP_DIRS.has(entryName)) continue;
            // Hidden dirs (except .github, .agents, .cursor, .claude, .kiro)
            if (entryName.startsWith('.') &&
                ![ '.github', '.agents', '.cursor', '.claude', '.kiro', '.vscode' ].includes(entryName)) continue;
            // Gitignore
            if (cfg.respectGitignore && isIgnoredByGitignore(relativePath, gitignorePatterns)) continue;
            // User excludes
            if (excludeCompiled.length && matchesAnyPattern(relativePath, excludeCompiled)) continue;

            const children = buildFileTree(fullPath, relativePath, depth + 1, cfg, gitignorePatterns, excludeCompiled);
            tree.push({ name: entryName, path: relativePath, type: 'directory', children });

        } else {
            const ext = path.extname(entryName).toLowerCase();
            if (SKIP_EXTENSIONS.has(ext) || SKIP_FILES.has(entryName)) continue;
            if (cfg.respectGitignore && isIgnoredByGitignore(relativePath, gitignorePatterns)) continue;
            if (excludeCompiled.length && matchesAnyPattern(relativePath, excludeCompiled)) continue;

            // Include pattern filter
            if (cfg.includePatterns && cfg.includePatterns.length) {
                const inc = compileUserPatterns(cfg.includePatterns);
                if (!matchesAnyPattern(relativePath, inc)) continue;
            }

            let stats;
            try { stats = fs.statSync(fullPath); } catch { continue; }
            if (stats.size > cfg.maxFileSizeKB * 1024) continue;

            tree.push({
                name    : entryName,
                path    : relativePath,
                type    : 'file',
                size    : stats.size,
                ext,
                priority: filePriority(entryName),
            });
        }
    }

    return tree;
}

// ─── Read file contents with token budget ─────────────────────
// Inspired by Repomix: respect a total token budget rather than
// just a raw file count — avoids blowing the context window.
function readFileContents(dirPath, tree, cfg = DEFAULT_CONFIG) {
    const contents = {};
    let fileCount   = 0;
    let tokensSoFar = 0;

    // Flatten tree into a priority-sorted list
    const allFiles = [];
    function collect(nodes) {
        for (const n of nodes) {
            if (n.type === 'file')      allFiles.push(n);
            else if (n.children)        collect(n.children);
        }
    }
    collect(tree);
    allFiles.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    for (const node of allFiles) {
        if (fileCount >= cfg.maxFiles) break;
        if (tokensSoFar >= cfg.tokenBudget) break;

        try {
            const fullPath = path.join(dirPath, node.path);
            let content    = fs.readFileSync(fullPath, 'utf-8');
            const lines    = content.split('\n');
            node.lineCount = lines.length;

            if (lines.length > cfg.linesThreshold) {
                content = lines.slice(0, cfg.maxLinesPerFile).join('\n')
                    + `\n\n... [truncated — ${cfg.maxLinesPerFile} of ${lines.length} lines shown]`;
            }

            const toks = estimateTokens(content);

            // If a single large file would blow the budget, include a shorter preview
            if (tokensSoFar + toks > cfg.tokenBudget && tokensSoFar > 0) {
                const headLines = Math.max(30, cfg.maxLinesPerFile - 50);
                content = lines.slice(0, headLines).join('\n')
                    + `\n\n... [budget-limited — ${headLines} of ${lines.length} lines shown]`;
            }

            contents[node.path] = content;
            tokensSoFar += estimateTokens(content);
            fileCount++;
        } catch { /* skip unreadable */ }
    }

    return { contents, tokenCount: tokensSoFar, fileCount };
}

// ─── Tech stack detection ──────────────────────────────────────
function detectTechStack(fileTree, fileContents) {
    const stack      = new Set();
    const frameworks = new Set();
    let hasDocker    = false;
    let hasTests     = false;
    let packageJson  = null;

    const has = name => fileContents[name] !== undefined;

    // ── Node / JS ecosystem ──
    if (has('package.json')) {
        try {
            packageJson = JSON.parse(fileContents['package.json']);
            stack.add('Node.js');
            const deps = { ...(packageJson.dependencies || {}), ...(packageJson.devDependencies || {}) };

            const fw = (dep, label) => { if (deps[dep]) { stack.add(label); frameworks.add(label); } };
            fw('react',           'React');
            fw('vue',             'Vue.js');
            fw('@angular/core',   'Angular');
            fw('svelte',          'Svelte');
            fw('next',            'Next.js');
            fw('nuxt',            'Nuxt.js');
            fw('@nuxt/core',      'Nuxt.js');
            fw('express',         'Express');
            fw('fastify',         'Fastify');
            fw('@nestjs/core',    'NestJS');
            fw('koa',             'Koa');
            fw('hono',            'Hono');
            fw('remix',           '@remix-run/node');
            fw('astro',           'Astro');
            fw('@solidjs/core',   'SolidJS');

            const lib = (dep, label) => { if (deps[dep]) stack.add(label); };
            lib('tailwindcss',    'Tailwind CSS');
            lib('@prisma/client', 'Prisma');
            lib('mongoose',       'MongoDB');
            lib('sequelize',      'Sequelize');
            lib('drizzle-orm',    'Drizzle ORM');
            lib('graphql',        'GraphQL');
            lib('socket.io',      'Socket.io');
            lib('trpc',           'tRPC');
            lib('@trpc/server',   'tRPC');
            lib('typescript',     'TypeScript');
            lib('zod',            'Zod');

            const testLibs = { jest: 'Jest', mocha: 'Mocha', vitest: 'Vitest', cypress: 'Cypress', playwright: 'Playwright' };
            for (const [dep, name] of Object.entries(testLibs)) {
                if (deps[dep]) { hasTests = true; stack.add(name); }
            }
        } catch { /* bad JSON */ }
    }

    // ── Python ──
    if (has('requirements.txt') || has('setup.py') || has('pyproject.toml') || has('Pipfile')) {
        stack.add('Python');
        const req = (fileContents['requirements.txt'] || '') + (fileContents['pyproject.toml'] || '');
        if (req.includes('django'))  { stack.add('Django');  frameworks.add('Django'); }
        if (req.includes('flask'))   { stack.add('Flask');   frameworks.add('Flask'); }
        if (req.includes('fastapi')) { stack.add('FastAPI'); frameworks.add('FastAPI'); }
        if (req.includes('pytest'))  { hasTests = true; }
    }

    // ── Go ──
    if (has('go.mod')) {
        stack.add('Go');
        const gm = fileContents['go.mod'] || '';
        if (gm.includes('gin-gonic'))    { stack.add('Gin');        frameworks.add('Gin'); }
        if (gm.includes('gorilla/mux'))  { stack.add('Gorilla Mux'); frameworks.add('Gorilla Mux'); }
        if (gm.includes('labstack/echo')){ stack.add('Echo');       frameworks.add('Echo'); }
        if (gm.includes('gofiber/fiber')){ stack.add('Fiber');      frameworks.add('Fiber'); }
    }

    // ── Rust ──
    if (has('Cargo.toml')) {
        stack.add('Rust');
        const ct = fileContents['Cargo.toml'] || '';
        if (ct.includes('actix-web')) { stack.add('Actix'); frameworks.add('Actix'); }
        if (ct.includes('axum'))      { stack.add('Axum');  frameworks.add('Axum'); }
    }

    // ── Java / Kotlin ──
    if (has('pom.xml') || has('build.gradle') || has('build.gradle.kts')) {
        stack.add('Java');
        if (has('build.gradle.kts')) stack.add('Kotlin');
        const pom = fileContents['pom.xml'] || '';
        if (pom.includes('spring-boot')) { stack.add('Spring Boot'); frameworks.add('Spring Boot'); }
    }

    // ── Ruby ──
    if (has('Gemfile')) {
        stack.add('Ruby');
        if ((fileContents['Gemfile'] || '').includes('rails')) {
            stack.add('Rails'); frameworks.add('Rails');
        }
    }

    // ── PHP ──
    if (has('composer.json')) {
        stack.add('PHP');
        const cj = fileContents['composer.json'] || '';
        if (cj.includes('laravel')) { stack.add('Laravel'); frameworks.add('Laravel'); }
        if (cj.includes('symfony')) { stack.add('Symfony'); frameworks.add('Symfony'); }
    }

    // ── Tree-based checks ──
    function treeHasFile(nodes, name) {
        for (const n of nodes) {
            if (n.type === 'file' && n.name.toLowerCase() === name.toLowerCase()) return true;
            if (n.children && treeHasFile(n.children, name)) return true;
        }
        return false;
    }
    function hasExt(nodes, ext) {
        for (const n of nodes) {
            if (n.type === 'file' && n.ext === ext) return true;
            if (n.children && hasExt(n.children, ext)) return true;
        }
        return false;
    }

    hasDocker = treeHasFile(fileTree, 'Dockerfile') ||
                treeHasFile(fileTree, 'docker-compose.yml') ||
                treeHasFile(fileTree, 'docker-compose.yaml');

    if (hasExt(fileTree, '.ts') || hasExt(fileTree, '.tsx')) stack.add('TypeScript');
    if (hasExt(fileTree, '.py'))                              stack.add('Python');
    if (hasExt(fileTree, '.cs'))                              stack.add('C#');
    if (hasExt(fileTree, '.cpp') || hasExt(fileTree, '.cc')) stack.add('C++');
    if (hasExt(fileTree, '.swift'))                           stack.add('Swift');
    if (hasExt(fileTree, '.kt'))                              stack.add('Kotlin');
    if (hasExt(fileTree, '.dart'))                            stack.add('Dart/Flutter');

    if (treeHasFile(fileTree, 'test') || treeHasFile(fileTree, 'tests') ||
        treeHasFile(fileTree, '__tests__') || treeHasFile(fileTree, 'spec')) {
        hasTests = true;
    }

    return { detectedStack: [...stack], frameworks: [...frameworks], hasDocker, hasTests, packageJson };
}

// ─── Count files in tree ───────────────────────────────────────
function countFiles(tree) {
    let n = 0;
    for (const node of tree) {
        if (node.type === 'file') n++;
        else if (node.children)  n += countFiles(node.children);
    }
    return n;
}

// ─── Main entry: scan project ─────────────────────────────────
async function scanProject(folderPath, userConfig = {}) {
    if (!fs.existsSync(folderPath))
        throw new Error(`Folder not found: ${folderPath}`);
    if (!fs.statSync(folderPath).isDirectory())
        throw new Error(`Path is not a directory: ${folderPath}`);

    const cfg = { ...DEFAULT_CONFIG, ...userConfig };

    // Load .gitignore patterns from project root
    const gitignorePatterns = cfg.respectGitignore
        ? loadGitignorePatterns(folderPath)
        : [];

    // Compile user-defined exclude patterns
    const excludeCompiled = cfg.excludePatterns.length
        ? compileUserPatterns(cfg.excludePatterns)
        : [];

    const fileTree  = buildFileTree(folderPath, '', 0, cfg, gitignorePatterns, excludeCompiled);
    const totalFiles = countFiles(fileTree);

    const { contents: fileContents, tokenCount, fileCount: filesRead } =
        readFileContents(folderPath, fileTree, cfg);

    const { detectedStack, frameworks, hasDocker, hasTests, packageJson } =
        detectTechStack(fileTree, fileContents);

    return {
        folderPath   : folderPath.replace(/\\/g, '/'),
        fileTree,
        fileContents,
        detectedStack,
        frameworks,
        totalFiles,
        filesRead,
        hasDocker,
        hasTests,
        packageJson,
        // Token stats — useful for estimate endpoint
        estimatedTokens: tokenCount,
        scanConfig      : cfg,
    };
}

// ─── Quick token-only estimate (no AI call needed) ────────────
async function estimateProject(folderPath, userConfig = {}) {
    const result = await scanProject(folderPath, userConfig);
    return {
        totalFiles      : result.totalFiles,
        filesRead       : result.filesRead,
        estimatedTokens : result.estimatedTokens,
        detectedStack   : result.detectedStack,
        frameworks      : result.frameworks,
        hasDocker       : result.hasDocker,
        hasTests        : result.hasTests,
        // Rough cost guide (USD, input tokens only, March 2025 rates)
        costGuide: {
            'Gemini 2.5 Flash' : `~$${(result.estimatedTokens / 1e6 * 0.075).toFixed(4)}`,
            'GPT-4o Mini'      : `~$${(result.estimatedTokens / 1e6 * 0.15).toFixed(4)}`,
            'Claude Haiku 3.5' : `~$${(result.estimatedTokens / 1e6 * 0.80).toFixed(4)}`,
            'Claude Sonnet 4.5': `~$${(result.estimatedTokens / 1e6 * 3.00).toFixed(4)}`,
            'GPT-4o'           : `~$${(result.estimatedTokens / 1e6 * 2.50).toFixed(4)}`,
        },
    };
}

module.exports = { scanProject, estimateProject, buildFileTree, countFiles, estimateTokens, DEFAULT_CONFIG };
