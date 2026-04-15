import { Injectable, BadRequestException } from "@nestjs/common";
import AdmZip from "adm-zip";

// ── Constants ─────────────────────────────────────────────────────────────────

const ALLOWED_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx",
  ".py", ".java", ".cs", ".go", ".rb", ".php",
]);

const SKIP_PATH_SEGMENTS = [
  "node_modules/", ".git/", "dist/", "build/",
  ".next/", "coverage/", "__pycache__/", "vendor/",
];

const PRIORITY_FOLDERS = [
  "src/", "app/", "lib/", "api/",
  "controllers/", "services/", "routes/", "handlers/",
];

const MAX_LINES_PER_FILE = 200;
const MAX_OUTPUT_CHARS   = 400_000;
const MAX_GITHUB_FILES   = 60;
const GITHUB_API_BASE    = "https://api.github.com";
const GITHUB_RAW_BASE    = "https://raw.githubusercontent.com";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getExtension(filePath: string): string {
  const dot = filePath.lastIndexOf(".");
  return dot === -1 ? "" : filePath.slice(dot).toLowerCase();
}

function shouldSkip(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");

  // Skip entire directory segments
  if (SKIP_PATH_SEGMENTS.some((seg) => normalized.includes(seg))) return true;

  const ext = getExtension(normalized);

  // Skip minified and declaration files regardless of extension match
  if (normalized.endsWith(".min.js")) return true;
  if (normalized.endsWith(".d.ts"))   return true;

  return !ALLOWED_EXTENSIONS.has(ext);
}

function firstNLines(content: string, n: number): string {
  const lines = content.split("\n");
  return lines.slice(0, n).join("\n");
}

function formatFileBlock(relativePath: string, content: string): string {
  const truncated = firstNLines(content, MAX_LINES_PER_FILE);
  return `=== FILE: ${relativePath} ===\n${truncated}\n`;
}

function assemblOutput(blocks: string[], totalFiles: number): string {
  // Truncate oldest entries if over limit — keep the last (highest-priority) files
  let output = blocks.join("\n");
  if (output.length <= MAX_OUTPUT_CHARS) {
    return output;
  }

  // Drop from the front until we fit
  let kept = [...blocks];
  while (kept.length > 1 && kept.join("\n").length > MAX_OUTPUT_CHARS) {
    kept.shift();
  }

  const note = `// [Truncated: showing ${kept.length} of ${totalFiles} files due to context limit]\n\n`;
  return note + kept.join("\n");
}

// Sort paths so priority-folder files come first
function sortByPriority(paths: string[]): string[] {
  return [...paths].sort((a, b) => {
    const aIdx = PRIORITY_FOLDERS.findIndex((f) => a.includes(f));
    const bIdx = PRIORITY_FOLDERS.findIndex((f) => b.includes(f));
    const aScore = aIdx === -1 ? PRIORITY_FOLDERS.length : aIdx;
    const bScore = bIdx === -1 ? PRIORITY_FOLDERS.length : bIdx;
    return aScore - bScore;
  });
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class CodeExtractorService {

  // ── ZIP extraction ──────────────────────────────────────────────────────────

  extractFromZip(file: Express.Multer.File): string {
    let zip: AdmZip;
    try {
      zip = new AdmZip(file.buffer);
    } catch {
      throw new BadRequestException("Could not open zip file. Make sure it is a valid .zip archive.");
    }

    const entries = zip.getEntries();
    const kept: { path: string; content: string }[] = [];

    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const entryPath = entry.entryName.replace(/\\/g, "/");
      if (shouldSkip(entryPath)) continue;

      try {
        const raw = entry.getData().toString("utf-8");
        kept.push({ path: entryPath, content: raw });
      } catch {
        // Binary or unreadable entry — skip silently
      }
    }

    if (kept.length === 0) {
      throw new BadRequestException(
        "No supported source files found in the zip. Accepted: .ts .tsx .js .jsx .py .java .cs .go .rb .php",
      );
    }

    // Sort so priority-folder files come last (they survive truncation)
    const sorted = sortByPriority(kept.map((f) => f.path));
    const orderedKept = sorted.map((p) => kept.find((f) => f.path === p)!);

    const blocks = orderedKept.map((f) => formatFileBlock(f.path, f.content));
    console.log(`[CodeExtractor] ZIP: ${kept.length} files kept from ${entries.length} entries`);

    return assemblOutput(blocks, kept.length);
  }

  // ── GitHub extraction ───────────────────────────────────────────────────────

  async extractFromGithub(repoUrl: string): Promise<string> {
    const { owner, repo, branch: hintBranch } = this.parseGithubUrl(repoUrl);

    // Try hint branch, then main, then master
    const branchCandidates: string[] = [];
    if (hintBranch) branchCandidates.push(hintBranch);
    if (!branchCandidates.includes("main"))   branchCandidates.push("main");
    if (!branchCandidates.includes("master")) branchCandidates.push("master");

    let tree: Array<{ path: string; type: string }> | null = null;
    let resolvedBranch = "";

    for (const branch of branchCandidates) {
      const treeUrl = `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
      console.log(`[CodeExtractor] GitHub tree: ${treeUrl}`);
      const res = await fetch(treeUrl, {
        headers: { Accept: "application/vnd.github+json" },
      });

      if (res.ok) {
        const data = await res.json() as { tree: Array<{ path: string; type: string }> };
        tree = data.tree;
        resolvedBranch = branch;
        break;
      }

      if (res.status === 404) continue; // try next branch

      // Non-404 error — rate limit or server error
      throw new BadRequestException(
        `GitHub API error ${res.status} for ${owner}/${repo}. The repository may be private or the URL is incorrect.`,
      );
    }

    if (!tree) {
      throw new BadRequestException(
        `Repository not found: ${owner}/${repo}. Check the URL and make sure the repo is public.`,
      );
    }

    // Filter to source files only
    const allPaths = tree
      .filter((e) => e.type === "blob" && !shouldSkip(e.path))
      .map((e) => e.path);

    if (allPaths.length === 0) {
      throw new BadRequestException(
        "No supported source files found in the repository. Accepted: .ts .tsx .js .jsx .py .java .cs .go .rb .php",
      );
    }

    // Sort by priority folders, cap at MAX_GITHUB_FILES
    const prioritized = sortByPriority(allPaths).slice(0, MAX_GITHUB_FILES);
    console.log(`[CodeExtractor] GitHub: fetching ${prioritized.length} of ${allPaths.length} files from ${owner}/${repo}@${resolvedBranch}`);

    // Fetch file contents in parallel (batches of 10 to avoid overwhelming)
    const blocks: string[] = [];
    const BATCH = 10;

    for (let i = 0; i < prioritized.length; i += BATCH) {
      const batch = prioritized.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map(async (filePath) => {
          const rawUrl = `${GITHUB_RAW_BASE}/${owner}/${repo}/${resolvedBranch}/${filePath}`;
          const res = await fetch(rawUrl);
          if (!res.ok) return null;
          const text = await res.text();
          return { path: filePath, content: text };
        }),
      );

      for (const r of results) {
        if (r.status === "fulfilled" && r.value) {
          blocks.push(formatFileBlock(r.value.path, r.value.content));
        }
      }
    }

    if (blocks.length === 0) {
      throw new BadRequestException("Could not fetch any source files from the repository.");
    }

    return assemblOutput(blocks, allPaths.length);
  }

  // ── URL parser ──────────────────────────────────────────────────────────────

  private parseGithubUrl(url: string): { owner: string; repo: string; branch: string | null } {
    // Normalize trailing slash
    const clean = url.replace(/\/$/, "");

    // https://github.com/owner/repo/tree/branch
    const treeMatch = clean.match(/github\.com\/([^/]+)\/([^/]+)\/tree\/(.+)$/);
    if (treeMatch) {
      return { owner: treeMatch[1], repo: treeMatch[2], branch: treeMatch[3] };
    }

    // https://github.com/owner/repo
    const baseMatch = clean.match(/github\.com\/([^/]+)\/([^/]+)$/);
    if (baseMatch) {
      return { owner: baseMatch[1], repo: baseMatch[2], branch: null };
    }

    throw new BadRequestException(
      `Invalid GitHub URL: "${url}". Expected format: https://github.com/owner/repo`,
    );
  }
}
