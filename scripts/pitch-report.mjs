import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  analyzeInfluenceSnapshot,
  formatDotGraph,
  formatMarkdownPitchReport,
  formatReadableEvidence,
  formatReadableGraph,
  formatReadableInsights,
  formatTerminalReport,
} from "../src/engine.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(projectRoot, "..");
const defaultInputPath = path.join(workspaceRoot, "captanet-snapshot.json");
const defaultOutputDir = path.join(workspaceRoot, "pitch-output");

async function exists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function parseArgs(argv) {
  const options = {
    input: defaultInputPath,
    outputDir: defaultOutputDir,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--input") {
      options.input = path.resolve(process.cwd(), next || defaultInputPath);
      index += 1;
      continue;
    }

    if (arg === "--output-dir") {
      options.outputDir = path.resolve(process.cwd(), next || defaultOutputDir);
      index += 1;
    }
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!(await exists(options.input))) {
    throw new Error(
      `Captanet snapshot not found at ${options.input}. Export one first so Influnet has real data to analyze.`
    );
  }

  const snapshot = JSON.parse((await fs.readFile(options.input, "utf8")).replace(/^\uFEFF/, ""));
  const analysis = analyzeInfluenceSnapshot(snapshot);

  await fs.mkdir(options.outputDir, { recursive: true });

  const files = [
    {
      name: "influnet-analysis.json",
      content: `${JSON.stringify(analysis, null, 2)}\n`,
    },
    {
      name: "influnet-report.txt",
      content: `${formatTerminalReport(analysis)}\n`,
    },
    {
      name: "influnet-insights.txt",
      content: `${formatReadableInsights(analysis.insights) || "No valid influence chains found."}\n`,
    },
    {
      name: "influnet-evidence.txt",
      content: `${formatReadableEvidence(analysis.valid_chains) || "No evidence-backed chains found."}\n`,
    },
    {
      name: "influnet-graph.txt",
      content: `${formatReadableGraph(analysis.valid_chains) || "No valid influence chains found."}\n`,
    },
    {
      name: "influnet-graph.dot",
      content: `${formatDotGraph(analysis.valid_chains)}\n`,
    },
    {
      name: "influnet-pitch.md",
      content: `${formatMarkdownPitchReport(analysis)}\n`,
    },
  ];

  await Promise.all(
    files.map((file) =>
      fs.writeFile(path.join(options.outputDir, file.name), file.content, "utf8")
    )
  );

  console.log(`Influnet pitch artifacts written to ${options.outputDir}`);
  for (const file of files) {
    console.log(`- ${path.join(options.outputDir, file.name)}`);
  }
}

main().catch((error) => {
  console.error(String(error?.message || error || "Could not build Influnet pitch artifacts."));
  process.exitCode = 1;
});
