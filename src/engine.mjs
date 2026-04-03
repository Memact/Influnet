const DEFAULT_WINDOW_MS = 45 * 60 * 1000;
const DEFAULT_MIN_COUNT = 3;
const DEFAULT_MIN_SOURCE_COUNT = 5;
const DEFAULT_TOP_N = 3;
const DIRECTIONAL_COUNT_MARGIN = 2;
const DIRECTIONAL_COUNT_RATIO = 1.5;

export const DEFAULT_ACTIVITY_NORMALIZATION_RULES = [
  {
    key: "startup",
    label: "Startup",
    human_label: "startup-related content",
    keywords: [
      "startup",
      "founder",
      "startup school",
      "y combinator",
      "entrepreneur",
    ],
  },
  {
    key: "exam",
    label: "Exam",
    human_label: "exam-related content",
    keywords: [
      "exam",
      "revision",
      "mock test",
      "question bank",
      "syllabus",
      "practice set",
      "prep",
      "preparation",
    ],
  },
  {
    key: "coding",
    label: "Coding",
    human_label: "coding work",
    keywords: [
      "coding",
      "programming",
      "debug",
      "repo",
      "pull request",
      "commit",
      "cursor",
      "codex",
      "implementation",
    ],
  },
];

function normalizeText(value, maxLength = 0) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) {
    return "";
  }
  if (maxLength && text.length > maxLength) {
    return `${text.slice(0, maxLength - 3).trim()}...`;
  }
  return text;
}

function toTimestamp(value) {
  const timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round((Number(value || 0) + Number.EPSILON) * factor) / factor;
}

function titleCase(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeKey(value) {
  return normalizeText(value, 120).toLowerCase();
}

function buildHumanActivityLabel(key, mode = "") {
  const normalizedKey = normalizeKey(key);
  const normalizedMode = normalizeKey(mode);

  if (!normalizedKey && !normalizedMode) {
    return "that activity";
  }
  if (normalizedMode === "coding" || normalizedKey === "coding") {
    return "coding work";
  }
  if (normalizedMode === "reading" && normalizedKey) {
    return `${normalizedKey}-related content`;
  }
  if (normalizedMode === "memory") {
    return normalizedKey ? `${normalizedKey}-related activity` : "that activity";
  }
  if (normalizedKey === "reading") {
    return "reading activity";
  }
  if (normalizedKey === "memory") {
    return "memory activity";
  }
  return normalizedKey ? `${normalizedKey}-related content` : "that activity";
}

function simplifyActivityDescriptor(value) {
  const normalized = normalizeText(value, 160).toLowerCase();
  if (!normalized) {
    return "";
  }

  const withoutPrefix = normalized.replace(
    /^(reading|watching|listening|exploring|working on|using|reviewing|studying|researching|engaging with)\s+(about\s+)?/i,
    ""
  );

  return withoutPrefix
    .replace(
      /\b(content|podcast|podcasts|video|videos|interview|interviews|article|articles|notes|note|material|materials|thread|threads|talk|talks|session|sessions)\b/gi,
      " "
    )
    .replace(/\b(the|a|an|about|related)\b/gi, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function collectActivityTexts(rawActivity) {
  return [
    rawActivity?.key,
    rawActivity?.activity_key,
    rawActivity?.subject,
    rawActivity?.label,
    rawActivity?.summary,
    rawActivity?.mode,
  ]
    .map((value) => normalizeText(value, 160))
    .filter(Boolean);
}

function matchNormalizationRule(texts, rules) {
  const haystack = texts.join(" | ").toLowerCase();
  if (!haystack) {
    return null;
  }

  let bestMatch = null;
  for (const rule of rules) {
    let score = 0;
    for (const keyword of Array.isArray(rule?.keywords) ? rule.keywords : []) {
      const normalizedKeyword = normalizeText(keyword, 80).toLowerCase();
      if (!normalizedKeyword) {
        continue;
      }
      if (haystack.includes(normalizedKeyword)) {
        score += normalizedKeyword.includes(" ") ? 3 : 2;
      }
    }

    if (score > (bestMatch?.score || 0)) {
      bestMatch = {
        score,
        rule,
      };
    }
  }

  return bestMatch?.score ? bestMatch.rule : null;
}

function buildFallbackIdentity(rawActivity, baseKey, baseLabel) {
  const candidate = [
    rawActivity?.key,
    rawActivity?.activity_key,
    rawActivity?.subject,
    rawActivity?.label,
    rawActivity?.summary,
  ]
    .map((value) => simplifyActivityDescriptor(value))
    .find(Boolean);

  const fallbackKey =
    normalizeKey(candidate) ||
    normalizeKey(baseKey) ||
    normalizeKey(baseLabel) ||
    normalizeKey(rawActivity?.mode);

  return {
    key: fallbackKey,
    label: fallbackKey ? titleCase(fallbackKey) : "Unknown activity",
    human_label: buildHumanActivityLabel(fallbackKey, rawActivity?.mode),
    rule_key: null,
  };
}

function resolveActivityIdentity(rawActivity, activityField = "key", normalizationRules = []) {
  const normalizedField = normalizeText(activityField, 40).toLowerCase();

  if (normalizedField === "mode") {
    const mode = normalizeText(rawActivity?.mode, 40);
    return {
      key: normalizeKey(mode),
      label: mode ? titleCase(mode) : "Unknown activity",
      human_label: buildHumanActivityLabel(mode, mode),
      rule_key: null,
    };
  }

  const baseKey = normalizeKey(
    rawActivity?.key ||
      rawActivity?.activity_key ||
      rawActivity?.subject ||
      rawActivity?.mode ||
      rawActivity?.label
  );
  const baseLabel = normalizeText(
    rawActivity?.label ||
      rawActivity?.subject ||
      rawActivity?.mode ||
      rawActivity?.key ||
      rawActivity?.activity_key,
    120
  );
  const texts = collectActivityTexts(rawActivity);
  const matchedRule = matchNormalizationRule(texts, normalizationRules);

  if (matchedRule) {
    return {
      key: normalizeKey(matchedRule.key),
      label: normalizeText(matchedRule.label, 120) || titleCase(matchedRule.key),
      human_label:
        normalizeText(matchedRule.human_label, 120) ||
        buildHumanActivityLabel(matchedRule.key, rawActivity?.mode),
      rule_key: normalizeKey(matchedRule.key),
    };
  }

  return buildFallbackIdentity(rawActivity, baseKey, baseLabel);
}

function normalizeActivity(rawActivity, index = 0, activityField = "key", normalizationRules = []) {
  const startedAt = normalizeText(rawActivity?.started_at || rawActivity?.startedAt, 80);
  const endedAt =
    normalizeText(rawActivity?.ended_at || rawActivity?.endedAt, 80) || startedAt;
  const originalLabel = normalizeText(
    rawActivity?.label ||
      rawActivity?.subject ||
      rawActivity?.key ||
      rawActivity?.activity_key ||
      rawActivity?.mode,
    120
  );
  const identity = resolveActivityIdentity(rawActivity, activityField, normalizationRules);

  return {
    id: rawActivity?.id ?? index + 1,
    key: identity.key || `activity-${index + 1}`,
    label: identity.label || titleCase(identity.key) || `Activity ${index + 1}`,
    human_label:
      identity.human_label || buildHumanActivityLabel(identity.key, rawActivity?.mode),
    subject: normalizeText(rawActivity?.subject || rawActivity?.label, 120),
    summary: normalizeText(rawActivity?.summary, 240),
    started_at: startedAt,
    ended_at: endedAt,
    started_timestamp: toTimestamp(startedAt),
    ended_timestamp: toTimestamp(endedAt) || toTimestamp(startedAt),
    event_count: Math.max(1, Number(rawActivity?.event_count || rawActivity?.eventCount || 1)),
    mode: normalizeText(rawActivity?.mode, 40),
    raw_labels: originalLabel ? [originalLabel] : [],
    normalization_rule: identity.rule_key,
  };
}

function condenseActivities(activities, windowMs) {
  const condensed = [];

  for (const activity of activities) {
    const previous = condensed[condensed.length - 1];
    if (!previous) {
      condensed.push({ ...activity });
      continue;
    }

    const gap = activity.started_timestamp - previous.ended_timestamp;
    if (previous.key === activity.key && gap >= 0 && gap <= windowMs) {
      previous.ended_at = activity.ended_at;
      previous.ended_timestamp = activity.ended_timestamp;
      previous.event_count += activity.event_count;
      previous.summary = previous.summary || activity.summary;
      previous.raw_labels = [...new Set([...(previous.raw_labels || []), ...(activity.raw_labels || [])])].slice(0, 5);
      continue;
    }

    condensed.push({ ...activity });
  }

  return condensed;
}

function collectLabelExamples(activities) {
  const examplesByKey = new Map();
  for (const activity of activities) {
    const existing = examplesByKey.get(activity.key) || [];
    const merged = [...new Set([...existing, ...(activity.raw_labels || [])])].slice(0, 5);
    examplesByKey.set(activity.key, merged);
  }
  return examplesByKey;
}

function isDominantDirection(chain, reverseChain) {
  if (!reverseChain || !reverseChain.count) {
    return true;
  }

  const strongerProbability =
    chain.conditional_probability > reverseChain.conditional_probability;
  const strongerCount =
    chain.count >= reverseChain.count + DIRECTIONAL_COUNT_MARGIN ||
    chain.count >= Math.ceil(reverseChain.count * DIRECTIONAL_COUNT_RATIO);
  const strongerLift = chain.probability_lift > reverseChain.probability_lift;

  return (
    strongerProbability ||
    strongerCount ||
    (chain.conditional_probability === reverseChain.conditional_probability && strongerLift)
  );
}

function buildInsightSummary(chain) {
  const fromHuman = normalizeText(
    chain.from_human_label || chain.from_label || chain.from,
    120
  ).toLowerCase();
  const toHuman = normalizeText(
    chain.to_human_label || chain.to_label || chain.to,
    120
  ).toLowerCase();

  return `After engaging with ${fromHuman}, you tended to move toward ${toHuman}. This pattern appeared ${chain.count} times within ${chain.window_minutes} minutes.`;
}

export function analyzeInfluenceSnapshot(snapshot, options = {}) {
  const windowMs = Math.max(60 * 1000, Number(options.windowMs || DEFAULT_WINDOW_MS));
  const minCount = Math.max(1, Number(options.minCount || DEFAULT_MIN_COUNT));
  const minSourceCount = Math.max(
    1,
    Number(options.minSourceCount || DEFAULT_MIN_SOURCE_COUNT)
  );
  const topN = Math.max(1, Number(options.topN || DEFAULT_TOP_N));
  const activityField = normalizeText(options.activityField || "key", 40).toLowerCase() || "key";
  const normalizationRules = Array.isArray(options.normalizationRules)
    ? [...DEFAULT_ACTIVITY_NORMALIZATION_RULES, ...options.normalizationRules]
    : DEFAULT_ACTIVITY_NORMALIZATION_RULES;
  const rawActivities = Array.isArray(snapshot?.activities)
    ? snapshot.activities
    : Array.isArray(snapshot?.sessions)
      ? snapshot.sessions
      : Array.isArray(snapshot)
        ? snapshot
        : [];

  const normalizedActivities = rawActivities
    .map((activity, index) =>
      normalizeActivity(activity, index, activityField, normalizationRules)
    )
    .filter((activity) => activity.started_timestamp)
    .sort((left, right) => left.started_timestamp - right.started_timestamp);

  const activities = condenseActivities(normalizedActivities, windowMs);
  const labelExamplesByKey = collectLabelExamples(activities);
  const occurrenceCounts = new Map();
  for (const activity of activities) {
    occurrenceCounts.set(activity.key, (occurrenceCounts.get(activity.key) || 0) + 1);
  }

  const pairCounts = new Map();
  const samplesByPair = new Map();

  for (let index = 0; index < activities.length - 1; index += 1) {
    const source = activities[index];
    const target = activities[index + 1];
    const gapMs = target.started_timestamp - source.ended_timestamp;

    if (gapMs < 0 || gapMs > windowMs) {
      continue;
    }
    if (!source.key || !target.key || source.key === target.key) {
      continue;
    }

    const pairKey = `${source.key}=>${target.key}`;
    pairCounts.set(pairKey, (pairCounts.get(pairKey) || 0) + 1);

    const samples = samplesByPair.get(pairKey) || [];
    if (samples.length < 5) {
      samples.push({
        from_activity_id: source.id,
        to_activity_id: target.id,
        from_at: source.started_at,
        to_at: target.started_at,
        gap_minutes: round(gapMs / (60 * 1000), 2),
      });
      samplesByPair.set(pairKey, samples);
    }
  }

  const activityCount = activities.length;
  const chains = [...pairCounts.entries()]
    .map(([pairKey, count]) => {
      const [fromKey, toKey] = pairKey.split("=>");
      const fromActivity = activities.find((activity) => activity.key === fromKey);
      const toActivity = activities.find((activity) => activity.key === toKey);
      const sourceCount = occurrenceCounts.get(fromKey) || 0;
      const targetCount = occurrenceCounts.get(toKey) || 0;
      const conditionalProbability = count / Math.max(1, sourceCount);
      const baselineProbability = activityCount
        ? targetCount / activityCount
        : 0;
      const probabilityLift = baselineProbability
        ? conditionalProbability / baselineProbability
        : 0;
      const probabilityDelta = Math.max(0, conditionalProbability - baselineProbability);
      const reversePairKey = `${toKey}=>${fromKey}`;
      const reverseCount = pairCounts.get(reversePairKey) || 0;
      const reverseSourceCount = occurrenceCounts.get(toKey) || 0;
      const reverseConditionalProbability = reverseCount / Math.max(1, reverseSourceCount);
      const reverseBaselineProbability = activityCount
        ? sourceCount / activityCount
        : 0;
      const reverseLift = reverseBaselineProbability
        ? reverseConditionalProbability / reverseBaselineProbability
        : 0;

      return {
        from: fromKey,
        from_label: fromActivity?.label || titleCase(fromKey),
        from_human_label:
          fromActivity?.human_label || buildHumanActivityLabel(fromKey, fromActivity?.mode),
        from_count: sourceCount,
        from_examples: labelExamplesByKey.get(fromKey) || [],
        to: toKey,
        to_label: toActivity?.label || titleCase(toKey),
        to_human_label:
          toActivity?.human_label || buildHumanActivityLabel(toKey, toActivity?.mode),
        to_count: targetCount,
        to_examples: labelExamplesByKey.get(toKey) || [],
        count,
        conditional_probability: round(conditionalProbability),
        baseline_probability: round(baselineProbability),
        probability_lift: round(probabilityLift),
        probability_delta: round(probabilityDelta),
        reverse_count: reverseCount,
        reverse_conditional_probability: round(reverseConditionalProbability),
        reverse_lift: round(reverseLift),
        confidence: round(count * probabilityDelta),
        window_minutes: Math.round(windowMs / (60 * 1000)),
        supporting_samples: samplesByPair.get(pairKey) || [],
      };
    })
    .sort(
      (left, right) =>
        right.confidence - left.confidence ||
        right.count - left.count ||
        right.probability_lift - left.probability_lift ||
        right.conditional_probability - left.conditional_probability
    );

  const chainsByPairKey = new Map(
    chains.map((chain) => [`${chain.from}=>${chain.to}`, chain])
  );

  const validChains = chains
    .filter(
      (chain) =>
        chain.from_count >= minSourceCount &&
        chain.count >= minCount &&
        chain.conditional_probability > chain.baseline_probability &&
        isDominantDirection(
          chain,
          chainsByPairKey.get(`${chain.to}=>${chain.from}`) || null
        )
    )
    .slice(0, topN);

  const insights = validChains.map((chain, index) => ({
    type: "influence_chain",
    rank: index + 1,
    summary: buildInsightSummary(chain),
    from: chain.from,
    from_label: chain.from_label,
    from_human_label: chain.from_human_label,
    to: chain.to,
    to_label: chain.to_label,
    to_human_label: chain.to_human_label,
    count: chain.count,
    conditional_probability: chain.conditional_probability,
    baseline_probability: chain.baseline_probability,
    probability_lift: chain.probability_lift,
    probability_delta: chain.probability_delta,
    confidence: chain.confidence,
    window_minutes: chain.window_minutes,
    supporting_samples: chain.supporting_samples,
  }));

  return {
    meta: {
      activity_count: activities.length,
      candidate_transition_count: chains.length,
      reported_chain_count: validChains.length,
      window_minutes: Math.round(windowMs / (60 * 1000)),
      min_count: minCount,
      min_source_count: minSourceCount,
      top_n: topN,
      activity_field: activityField,
      normalization_rule_count: normalizationRules.length,
    },
    transitions: chains,
    valid_chains: validChains,
    insights,
  };
}

export function formatReadableGraph(chains) {
  return (Array.isArray(chains) ? chains : [])
    .map(
      (chain) =>
        `[${chain.from}] -> [${chain.to}] (${chain.count}) lift=${chain.probability_lift} confidence=${chain.confidence}`
    )
    .join("\n");
}

export function formatReadableInsights(insights) {
  return (Array.isArray(insights) ? insights : [])
    .map((insight) => insight.summary)
    .join("\n");
}

export function formatDotGraph(chains) {
  const edges = (Array.isArray(chains) ? chains : [])
    .map(
      (chain) =>
        `  "${chain.from}" -> "${chain.to}" [label="${chain.count} | lift=${chain.probability_lift} | conf=${chain.confidence}"];`
    )
    .join("\n");

  return `digraph Influnet {\n${edges}\n}`;
}
