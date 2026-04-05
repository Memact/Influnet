#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import {
  analyzeInfluenceSnapshot,
  formatDotGraph,
  formatReadableDriftSignals,
  formatReadableEvidence,
  formatReadableFormationSignals,
  formatReadableGraph,
  formatReadableInsights,
  formatMarkdownPitchReport,
  formatReadableThemes,
  formatReadableTrajectories,
  formatTerminalReport,
} from "./engine.mjs";

const DEFAULT_SNAPSHOT_BASENAME = "captanet-snapshot.json";
const SNAPSHOT_FILENAME_PATTERN = /^captanet-snapshot(?:-[^.]+)?\.json$/i;

function printUsage() {
  console.log(`Influnet CLI

Usage:
  node src/cli.mjs --input <path-to-captanet-snapshot-*.json> [--format json|report|insights|graph|dot|themes|trajectories|drift|formation|pitch|evidence|all] [--field key|mode|label] [--window-minutes 45] [--min-count 3] [--min-source-count 5] [--top 3]

Options:
  --input           Path to a Captanet snapshot JSON file
  --format          Output format: json, report, insights, graph, dot, themes, trajectories, drift, formation, pitch, evidence, or all (default: report)
  --field           Activity identity field: key, mode, or label (default: key)
  --window-minutes  Maximum transition gap in minutes (default: 45)
  --min-count       Minimum repeated count for a valid chain (default: 3)
  --min-source-count Minimum source activity support count (default: 5)
  --top             Maximum number of reported chains (default: 3)
  --top-themes      Maximum number of reported themes (default: 5)
  --top-trajectories Maximum number of reported trajectories (default: 3)
  --min-trajectory-count Minimum repeated count for a reported trajectory (default: 2)
  --top-drift       Maximum number of reported drift signals (default: 3)
  --top-formations  Maximum number of reported formation signals (default: 3)
  --help            Show this help
`);
}

function parseArgs(argv) {
  const options = {
    format: "report",
    field: "key",
    windowMinutes: 45,
    minCount: 3,
    minSourceCount: 5,
    top: 3,
    topThemes: 5,
    topTrajectories: 3,
    minTrajectoryCount: 2,
    topDrift: 3,
    topFormations: 3,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--input") {
      options.input = next;
      index += 1;
      continue;
    }
    if (arg === "--format") {
      options.format = next || "all";
      index += 1;
      continue;
    }
    if (arg === "--field") {
      options.field = next || "key";
      index += 1;
      continue;
    }
    if (arg === "--window-minutes") {
      options.windowMinutes = Number(next || 45) || 45;
      index += 1;
      continue;
    }
    if (arg === "--min-count") {
      options.minCount = Number(next || 3) || 3;
      index += 1;
      continue;
    }
    if (arg === "--min-source-count") {
      options.minSourceCount = Number(next || 5) || 5;
      index += 1;
      continue;
    }
    if (arg === "--top") {
      options.top = Number(next || 3) || 3;
      index += 1;
      continue;
    }
    if (arg === "--top-themes") {
      options.topThemes = Number(next || 5) || 5;
      index += 1;
      continue;
    }
    if (arg === "--top-trajectories") {
      options.topTrajectories = Number(next || 3) || 3;
      index += 1;
      continue;
    }
    if (arg === "--min-trajectory-count") {
      options.minTrajectoryCount = Number(next || 2) || 2;
      index += 1;
      continue;
    }
    if (arg === "--top-drift") {
      options.topDrift = Number(next || 3) || 3;
      index += 1;
      continue;
    }
    if (arg === "--top-formations") {
      options.topFormations = Number(next || 3) || 3;
      index += 1;
    }
  }

  return options;
}

async function resolveInputPath(inputOption) {
  if (inputOption) {
    const candidate = path.resolve(process.cwd(), inputOption);
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      return null;
    }
  }

  const candidateDirectories = [
    path.resolve(process.cwd(), ".."),
    path.resolve(process.cwd()),
  ];

  for (const directory of candidateDirectories) {
    const candidates = await findSnapshotFiles(directory);
    if (candidates.length > 0) {
      return candidates[0];
    }
  }

  return null;
}

async function findSnapshotFiles(directory) {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const snapshotEntries = entries
      .filter(
        (entry) =>
          entry.isFile() &&
          (entry.name === DEFAULT_SNAPSHOT_BASENAME ||
            SNAPSHOT_FILENAME_PATTERN.test(entry.name))
      )
      .map((entry) => path.join(directory, entry.name));

    const withStats = await Promise.all(
      snapshotEntries.map(async (filePath) => ({
        filePath,
        stat: await fs.stat(filePath),
      }))
    );

    return withStats
      .sort((left, right) => right.stat.mtimeMs - left.stat.mtimeMs)
      .map((item) => item.filePath);
  } catch {
    return [];
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const inputPath = await resolveInputPath(options.input);
  if (!inputPath) {
    printUsage();
    throw new Error(
      "No Captanet snapshot was found. Pass --input <path> or place an exported captanet-snapshot-*.json file in the workspace root."
    );
  }
  const inputText = await fs.readFile(inputPath, "utf8");
  const snapshot = JSON.parse(inputText.replace(/^\uFEFF/, ""));
  const analysis = analyzeInfluenceSnapshot(snapshot, {
    activityField: options.field,
    windowMs: options.windowMinutes * 60 * 1000,
    minCount: options.minCount,
    minSourceCount: options.minSourceCount,
    topN: options.top,
    topThemes: options.topThemes,
    topTrajectories: options.topTrajectories,
    minTrajectoryCount: options.minTrajectoryCount,
    topDrift: options.topDrift,
    topFormations: options.topFormations,
  });

  const format = String(options.format || "all").toLowerCase();
  if (
    ![
      "json",
      "report",
      "insights",
      "graph",
      "dot",
      "themes",
      "trajectories",
      "drift",
      "formation",
      "pitch",
      "evidence",
      "all",
    ].includes(format)
  ) {
    throw new Error(`Unsupported format "${options.format}"`);
  }

  if (format === "all") {
    console.log(formatTerminalReport(analysis));
    console.log("");
    console.log("Evidence");
    console.log(formatReadableEvidence(analysis.valid_chains) || "No evidence-backed chains found.");
    console.log("");
    console.log("Graph");
    console.log(formatReadableGraph(analysis.valid_chains) || "No valid influence chains found.");
    console.log("");
    console.log("DOT");
    console.log(formatDotGraph(analysis.valid_chains));
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(analysis, null, 2));
    return;
  }

  if (format === "report") {
    console.log(formatTerminalReport(analysis));
    return;
  }

  if (format === "insights") {
    console.log(formatReadableInsights(analysis.insights) || "No valid influence chains found.");
    return;
  }

  if (format === "graph") {
    console.log(formatReadableGraph(analysis.valid_chains) || "No valid influence chains found.");
    return;
  }

  if (format === "themes") {
    console.log(formatReadableThemes(analysis.themes) || "No persistent themes found.");
    return;
  }

  if (format === "trajectories") {
    console.log(formatReadableTrajectories(analysis.trajectories) || "No repeated trajectories found.");
    return;
  }

  if (format === "drift") {
    console.log(formatReadableDriftSignals(analysis.drift_signals) || "No drift signals found.");
    return;
  }

  if (format === "formation") {
    console.log(
      formatReadableFormationSignals(analysis.formation_signals) || "No formation signals found."
    );
    return;
  }

  if (format === "pitch") {
    console.log(formatMarkdownPitchReport(analysis));
    return;
  }

  if (format === "evidence") {
    console.log(formatReadableEvidence(analysis.valid_chains) || "No evidence-backed chains found.");
    return;
  }

  console.log(formatDotGraph(analysis.valid_chains));
}

main().catch((error) => {
  console.error(String(error?.message || error || "Influnet failed."));
  process.exitCode = 1;
});
