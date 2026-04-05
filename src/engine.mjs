const DEFAULT_WINDOW_MS = 45 * 60 * 1000;
const DEFAULT_MIN_COUNT = 3;
const DEFAULT_MIN_SOURCE_COUNT = 5;
const DEFAULT_TOP_N = 3;
const DEFAULT_MIN_TRAJECTORY_COUNT = 2;
const DEFAULT_TOP_THEME_COUNT = 5;
const DEFAULT_TOP_TRAJECTORY_COUNT = 3;
const DEFAULT_TOP_DRIFT_COUNT = 3;
const DEFAULT_TOP_FORMATION_COUNT = 3;
const DIRECTIONAL_COUNT_MARGIN = 2;
const DIRECTIONAL_COUNT_RATIO = 1.5;
const DRIFT_MIN_ACTIVE_DAYS = 2;
const DRIFT_MIN_SHARE_DELTA = 0.05;
const MAX_LABEL_EXAMPLES = 5;
const MAX_SOURCE_ITEMS = 16;
const MAX_SUPPORTING_SAMPLES = 5;

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
      "yc",
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
      "github",
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

function normalizeKey(value) {
  return normalizeText(value, 120).toLowerCase();
}

function titleCase(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round((Number(value || 0) + Number.EPSILON) * factor) / factor;
}

function toTimestamp(value) {
  const timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function toDayKey(value) {
  const timestamp = typeof value === "number" ? value : toTimestamp(value);
  if (!timestamp) {
    return "";
  }
  return new Date(timestamp).toISOString().slice(0, 10);
}

function hostnameFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function listify(values = []) {
  const items = (Array.isArray(values) ? values : [])
    .map((value) => normalizeText(value, 120))
    .filter(Boolean);
  return [...new Set(items)];
}

function formatList(values = []) {
  const items = listify(values);
  if (!items.length) {
    return "";
  }
  if (items.length === 1) {
    return items[0];
  }
  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function formatCountList(items = [], labelKey = "label") {
  return (Array.isArray(items) ? items : [])
    .map((item) => `${item[labelKey]} (${item.count})`)
    .join(", ");
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

function pushCount(map, key, amount = 1) {
  const normalized = normalizeText(key, 160);
  if (!normalized) {
    return;
  }
  map.set(normalized, (map.get(normalized) || 0) + amount);
}

function summarizeCountMap(map, limit = 3) {
  return [...(map instanceof Map ? map.entries() : [])]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([label, count]) => ({
      key: normalizeKey(label),
      label,
      count,
    }));
}

function summarizeSourceTitles(sourceItems, limit = 3) {
  const counts = new Map();
  for (const item of Array.isArray(sourceItems) ? sourceItems : []) {
    const title = normalizeText(item?.title, 160) || normalizeText(item?.url, 160);
    if (!title) {
      continue;
    }
    const key = normalizeKey(item?.url || `${item?.domain || ""}|${title}`);
    const existing = counts.get(key) || {
      title,
      domain: normalizeText(item?.domain, 120),
      url: normalizeText(item?.url, 400),
      count: 0,
    };
    existing.count += 1;
    counts.set(key, existing);
  }
  return [...counts.values()]
    .sort((left, right) => right.count - left.count || left.title.localeCompare(right.title))
    .slice(0, limit);
}

function dedupeSourceItems(items, limit = MAX_SOURCE_ITEMS) {
  const output = [];
  const seen = new Set();

  for (const item of Array.isArray(items) ? items : []) {
    const domain = normalizeText(item?.domain, 120);
    const title = normalizeText(item?.title, 160);
    const url = normalizeText(item?.url, 400);
    const application = normalizeText(item?.application, 80);
    const occurredAt = normalizeText(item?.occurred_at, 80);
    const key = normalizeKey(url || `${domain}|${title}|${application}|${occurredAt}`);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push({
      occurred_at: occurredAt,
      domain,
      title: title || url || domain || "Untitled source",
      url,
      application,
      summary: normalizeText(item?.summary, 200),
    });
    if (output.length >= limit) {
      break;
    }
  }

  return output;
}

function collectActivityTextBuckets(rawActivity) {
  const primary = [
    rawActivity?.key,
    rawActivity?.activity_key,
    rawActivity?.subject,
    rawActivity?.label,
  ]
    .map((value) => normalizeText(value, 160))
    .filter(Boolean);

  const secondary = [
    rawActivity?.summary,
    rawActivity?.mode,
    ...(Array.isArray(rawActivity?.keyphrases) ? rawActivity.keyphrases : []),
    ...(Array.isArray(rawActivity?.events)
      ? rawActivity.events.flatMap((event) => [event?.title, event?.structured_summary, event?.domain])
      : []),
  ]
    .map((value) => normalizeText(value, 160))
    .filter(Boolean);

  return {
    primary,
    secondary,
  };
}

function matchNormalizationRule(textBuckets, rules) {
  const primaryHaystack = (textBuckets?.primary || []).join(" | ").toLowerCase();
  const secondaryHaystack = (textBuckets?.secondary || []).join(" | ").toLowerCase();
  if (!primaryHaystack && !secondaryHaystack) {
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
      if (primaryHaystack.includes(normalizedKeyword)) {
        score += normalizedKeyword.includes(" ") ? 5 : 4;
        continue;
      }
      if (secondaryHaystack.includes(normalizedKeyword)) {
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
  const textBuckets = collectActivityTextBuckets(rawActivity);
  const matchedRule = matchNormalizationRule(textBuckets, normalizationRules);

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

function normalizeSourceItem(rawSource, fallbackActivity = {}) {
  const url = normalizeText(rawSource?.url, 400);
  const domain =
    normalizeText(rawSource?.domain, 120).toLowerCase() ||
    hostnameFromUrl(url) ||
    normalizeText(fallbackActivity?.domains?.[0], 120).toLowerCase();
  const title = normalizeText(
    rawSource?.title ||
      rawSource?.window_title ||
      rawSource?.context_subject ||
      rawSource?.structured_summary ||
      rawSource?.summary ||
      fallbackActivity?.label,
    160
  );
  const application =
    normalizeText(rawSource?.application, 80) ||
    normalizeText(fallbackActivity?.applications?.[0], 80) ||
    normalizeText(fallbackActivity?.mode, 80);
  const occurredAt = normalizeText(
    rawSource?.occurred_at || rawSource?.started_at || fallbackActivity?.started_at,
    80
  );

  if (!title && !url && !domain && !application) {
    return null;
  }

  return {
    occurred_at: occurredAt,
    domain,
    title: title || url || domain || application || "Untitled source",
    url,
    application,
    summary: normalizeText(rawSource?.structured_summary || rawSource?.summary, 200),
  };
}

function collectSourceItems(rawActivity) {
  const directEvents = Array.isArray(rawActivity?.events)
    ? rawActivity.events
        .map((event) => normalizeSourceItem(event, rawActivity))
        .filter(Boolean)
    : [];

  if (directEvents.length) {
    return dedupeSourceItems(directEvents);
  }

  const fallbackSources = [];
  for (const domain of Array.isArray(rawActivity?.domains) ? rawActivity.domains : []) {
    fallbackSources.push({
      domain,
      title: rawActivity?.label || rawActivity?.subject || rawActivity?.key,
      application: Array.isArray(rawActivity?.applications) ? rawActivity.applications[0] : "",
      occurred_at: rawActivity?.started_at,
    });
  }

  if (!fallbackSources.length) {
    fallbackSources.push({
      title: rawActivity?.label || rawActivity?.subject || rawActivity?.key,
      application: rawActivity?.mode,
      occurred_at: rawActivity?.started_at,
    });
  }

  return dedupeSourceItems(
    fallbackSources
      .map((item) => normalizeSourceItem(item, rawActivity))
      .filter(Boolean)
  );
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
  const sourceItems = collectSourceItems(rawActivity);
  const domains = listify([
    ...(Array.isArray(rawActivity?.domains) ? rawActivity.domains : []),
    ...sourceItems.map((item) => item.domain),
  ]).map((value) => value.toLowerCase());
  const applications = listify([
    ...(Array.isArray(rawActivity?.applications) ? rawActivity.applications : []),
    ...sourceItems.map((item) => item.application),
  ]);
  const startedTimestamp = toTimestamp(startedAt);
  const endedTimestamp = toTimestamp(endedAt) || startedTimestamp;

  return {
    id: rawActivity?.id ?? index + 1,
    activity_ids: [rawActivity?.id ?? index + 1],
    key: identity.key || `activity-${index + 1}`,
    label: identity.label || titleCase(identity.key) || `Activity ${index + 1}`,
    human_label:
      identity.human_label || buildHumanActivityLabel(identity.key, rawActivity?.mode),
    subject: normalizeText(rawActivity?.subject || rawActivity?.label, 120),
    summary: normalizeText(rawActivity?.summary, 240),
    started_at: startedAt,
    ended_at: endedAt,
    started_timestamp: startedTimestamp,
    ended_timestamp: endedTimestamp,
    duration_ms:
      Math.max(0, Number(rawActivity?.duration_ms || 0)) ||
      Math.max(0, endedTimestamp - startedTimestamp),
    event_count: Math.max(1, Number(rawActivity?.event_count || rawActivity?.eventCount || 1)),
    mode: normalizeText(rawActivity?.mode, 40),
    raw_labels: originalLabel ? [originalLabel] : [],
    normalization_rule: identity.rule_key,
    source_items: sourceItems,
    domains,
    applications,
    day_key: toDayKey(startedTimestamp),
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
      previous.activity_ids = [...new Set([...(previous.activity_ids || []), ...(activity.activity_ids || [])])];
      previous.ended_at = activity.ended_at;
      previous.ended_timestamp = activity.ended_timestamp;
      previous.duration_ms = Math.max(0, previous.ended_timestamp - previous.started_timestamp);
      previous.event_count += activity.event_count;
      previous.summary = previous.summary || activity.summary;
      previous.raw_labels = [...new Set([...(previous.raw_labels || []), ...(activity.raw_labels || [])])].slice(
        0,
        MAX_LABEL_EXAMPLES
      );
      previous.source_items = dedupeSourceItems([
        ...(previous.source_items || []),
        ...(activity.source_items || []),
      ]);
      previous.domains = listify([...(previous.domains || []), ...(activity.domains || [])]).map(
        (value) => value.toLowerCase()
      );
      previous.applications = listify([
        ...(previous.applications || []),
        ...(activity.applications || []),
      ]);
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
    const merged = [...new Set([...existing, ...(activity.raw_labels || [])])].slice(
      0,
      MAX_LABEL_EXAMPLES
    );
    examplesByKey.set(activity.key, merged);
  }
  return examplesByKey;
}

function buildTimelineMeta(activities) {
  const ordered = (Array.isArray(activities) ? activities : []).filter(
    (activity) => activity.started_timestamp
  );
  if (!ordered.length) {
    return {
      started_at: null,
      ended_at: null,
      days_spanned: 0,
    };
  }
  const start = ordered[0];
  const end = ordered[ordered.length - 1];
  const dayKeys = new Set(ordered.map((activity) => activity.day_key).filter(Boolean));
  return {
    started_at: start.started_at,
    ended_at: end.ended_at,
    days_spanned: dayKeys.size,
  };
}

function buildSourceEvidence(sourceItems = [], limit = 3) {
  const domainCounts = new Map();
  const applicationCounts = new Map();

  for (const item of Array.isArray(sourceItems) ? sourceItems : []) {
    pushCount(domainCounts, item?.domain);
    pushCount(applicationCounts, item?.application);
  }

  return {
    domains: summarizeCountMap(domainCounts, limit),
    applications: summarizeCountMap(applicationCounts, limit),
    titles: summarizeSourceTitles(sourceItems, limit),
  };
}

function mergeActivityEvidence(activities = []) {
  const sourceItems = dedupeSourceItems(
    (Array.isArray(activities) ? activities : []).flatMap((activity) => activity?.source_items || []),
    24
  );
  return buildSourceEvidence(sourceItems, 3);
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

function buildChainEvidence(pairSupport, activityById) {
  const fromActivities = [...(pairSupport?.source_activity_ids || [])]
    .map((id) => activityById.get(id))
    .filter(Boolean);
  const toActivities = [...(pairSupport?.target_activity_ids || [])]
    .map((id) => activityById.get(id))
    .filter(Boolean);
  const fromEvidence = mergeActivityEvidence(fromActivities);
  const toEvidence = mergeActivityEvidence(toActivities);
  const orderedSamples = [...(pairSupport?.samples || [])].sort(
    (left, right) => toTimestamp(left.from_at) - toTimestamp(right.from_at)
  );

  return {
    active_days: [...(pairSupport?.day_keys || [])].filter(Boolean).length,
    first_observed_at: orderedSamples[0]?.from_at || null,
    last_observed_at: orderedSamples.at(-1)?.to_at || null,
    source_domains: fromEvidence.domains,
    source_applications: fromEvidence.applications,
    source_titles: fromEvidence.titles,
    destination_domains: toEvidence.domains,
    destination_applications: toEvidence.applications,
    destination_titles: toEvidence.titles,
  };
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
  const dayPhrase =
    chain.evidence?.active_days > 1 ? ` across ${chain.evidence.active_days} days` : "";
  const sourceDomains = listify(
    (chain.evidence?.source_domains || []).slice(0, 2).map((item) => item.label)
  );

  let summary = `After engaging with ${fromHuman}, you tended to move toward ${toHuman}. This pattern appeared ${chain.count} times within ${chain.window_minutes} minutes${dayPhrase}.`;
  if (sourceDomains.length) {
    summary += ` The clearest repeating sources before that shift were ${formatList(sourceDomains)}.`;
  }
  return summary;
}

function buildThemeProfiles(activities, totalActivityCount, topN = DEFAULT_TOP_THEME_COUNT) {
  const activitiesByKey = new Map();

  for (const activity of Array.isArray(activities) ? activities : []) {
    const bucket = activitiesByKey.get(activity.key) || [];
    bucket.push(activity);
    activitiesByKey.set(activity.key, bucket);
  }

  return [...activitiesByKey.entries()]
    .map(([key, groupedActivities]) => {
      const activityCount = groupedActivities.length;
      const totalDurationMs = groupedActivities.reduce(
        (sum, activity) => sum + Number(activity.duration_ms || 0),
        0
      );
      const dayKeys = [...new Set(groupedActivities.map((activity) => activity.day_key).filter(Boolean))];
      const sourceEvidence = mergeActivityEvidence(groupedActivities);
      const exampleLabels = [
        ...new Set(groupedActivities.flatMap((activity) => activity.raw_labels || []).filter(Boolean)),
      ].slice(0, MAX_LABEL_EXAMPLES);
      const share = totalActivityCount ? activityCount / totalActivityCount : 0;

      return {
        key,
        label: groupedActivities[0]?.label || titleCase(key),
        human_label:
          groupedActivities[0]?.human_label || buildHumanActivityLabel(key, groupedActivities[0]?.mode),
        count: activityCount,
        total_duration_minutes: round(totalDurationMs / (60 * 1000), 1),
        active_days: dayKeys.length,
        first_seen_at: groupedActivities[0]?.started_at || null,
        last_seen_at: groupedActivities.at(-1)?.ended_at || null,
        share: round(share),
        persistence_score: round(activityCount * Math.max(dayKeys.length, 1) * Math.max(share, 0.01)),
        example_labels: exampleLabels,
        source_domains: sourceEvidence.domains,
        source_titles: sourceEvidence.titles,
      };
    })
    .sort(
      (left, right) =>
        right.persistence_score - left.persistence_score ||
        right.count - left.count ||
        right.total_duration_minutes - left.total_duration_minutes
    )
    .slice(0, topN);
}

function buildDriftSignals(
  activities,
  themeProfiles,
  {
    topN = DEFAULT_TOP_DRIFT_COUNT,
    minCount = DEFAULT_MIN_COUNT,
    minActiveDays = DRIFT_MIN_ACTIVE_DAYS,
    minShareDelta = DRIFT_MIN_SHARE_DELTA,
  } = {}
) {
  const ordered = Array.isArray(activities) ? activities : [];
  if (ordered.length < 4) {
    return [];
  }

  const splitIndex = Math.max(1, Math.floor(ordered.length / 2));
  const early = ordered.slice(0, splitIndex);
  const late = ordered.slice(splitIndex);
  if (!early.length || !late.length) {
    return [];
  }

  const earlyCountByKey = new Map();
  const lateCountByKey = new Map();
  for (const activity of early) {
    pushCount(earlyCountByKey, activity.key);
  }
  for (const activity of late) {
    pushCount(lateCountByKey, activity.key);
  }

  return (Array.isArray(themeProfiles) ? themeProfiles : [])
    .map((theme) => {
      const earlyCount = earlyCountByKey.get(theme.key) || 0;
      const lateCount = lateCountByKey.get(theme.key) || 0;
      const earlyShare = early.length ? earlyCount / early.length : 0;
      const lateShare = late.length ? lateCount / late.length : 0;
      const shareDelta = lateShare - earlyShare;
      const confidence = round(theme.count * Math.max(shareDelta, 0) * Math.max(theme.active_days, 1));

      return {
        key: theme.key,
        label: theme.label,
        human_label: theme.human_label,
        count: theme.count,
        active_days: theme.active_days,
        early_count: earlyCount,
        late_count: lateCount,
        early_share: round(earlyShare),
        late_share: round(lateShare),
        share_delta: round(shareDelta),
        confidence,
        first_seen_at: theme.first_seen_at,
        last_seen_at: theme.last_seen_at,
        source_domains: theme.source_domains,
        source_titles: theme.source_titles,
        summary: `${theme.human_label} became more persistent later in the timeline. Its share rose from ${round(
          earlyShare,
          3
        )} to ${round(lateShare, 3)} across ${theme.active_days} active days.`,
      };
    })
    .filter(
      (signal) =>
        signal.count >= minCount &&
        signal.active_days >= minActiveDays &&
        signal.share_delta >= minShareDelta &&
        signal.late_count >= signal.early_count
    )
    .sort(
      (left, right) =>
        right.confidence - left.confidence ||
        right.share_delta - left.share_delta ||
        right.count - left.count
    )
    .slice(0, topN);
}

function buildFormationSignals(
  themes,
  driftSignals,
  validChains,
  trajectories,
  topN = DEFAULT_TOP_FORMATION_COUNT
) {
  const driftByKey = new Map(
    (Array.isArray(driftSignals) ? driftSignals : []).map((signal) => [signal.key, signal])
  );
  const chainGroups = new Map();
  const trajectoryGroups = new Map();

  for (const chain of Array.isArray(validChains) ? validChains : []) {
    const fromChains = chainGroups.get(chain.from) || [];
    fromChains.push(chain);
    chainGroups.set(chain.from, fromChains);

    const toChains = chainGroups.get(chain.to) || [];
    toChains.push(chain);
    chainGroups.set(chain.to, toChains);
  }

  for (const trajectory of Array.isArray(trajectories) ? trajectories : []) {
    for (const key of Array.isArray(trajectory.path) ? trajectory.path : []) {
      const items = trajectoryGroups.get(key) || [];
      items.push(trajectory);
      trajectoryGroups.set(key, items);
    }
  }

  return (Array.isArray(themes) ? themes : [])
    .map((theme) => {
      const drift = driftByKey.get(theme.key) || null;
      const relatedChains = chainGroups.get(theme.key) || [];
      const relatedTrajectories = trajectoryGroups.get(theme.key) || [];
      const strongestOutgoingChain =
        relatedChains
          .filter((chain) => chain.from === theme.key)
          .sort((left, right) => right.confidence - left.confidence || right.count - left.count)[0] ||
        null;
      const strongestIncomingChain =
        relatedChains
          .filter((chain) => chain.to === theme.key)
          .sort((left, right) => right.confidence - left.confidence || right.count - left.count)[0] ||
        null;
      const strongestTrajectory =
        [...relatedTrajectories].sort(
          (left, right) => right.confidence - left.confidence || right.count - left.count
        )[0] || null;

      let kind = "recurring_theme";
      let summary = `${theme.human_label} appeared repeatedly across ${theme.active_days} days.`;

      if (drift && strongestOutgoingChain) {
        kind = "growing_directional_pattern";
        summary = `${theme.human_label} became more persistent later in the timeline and repeatedly preceded shifts toward ${(
          strongestOutgoingChain.to_human_label || strongestOutgoingChain.to_label || strongestOutgoingChain.to
        ).toLowerCase()}.`;
      } else if (drift) {
        kind = "growing_theme";
        summary = `${theme.human_label} moved from lighter activity into a more recurring attention pattern later in the timeline.`;
      } else if (strongestOutgoingChain && strongestIncomingChain) {
        kind = "bridge_theme";
        summary = `${theme.human_label} sat between other recurring themes and showed up in repeated directional transitions.`;
      } else if (strongestOutgoingChain) {
        kind = "launch_theme";
        summary = `${theme.human_label} repeatedly acted as a starting point before activity shifted elsewhere.`;
      } else if (strongestIncomingChain) {
        kind = "destination_theme";
        summary = `${theme.human_label} repeatedly appeared as a destination after earlier activity.`;
      } else if (strongestTrajectory) {
        kind = "trajectory_theme";
        summary = `${theme.human_label} kept reappearing inside longer multi-step trajectories.`;
      }

      const confidence = round(
        (drift?.confidence || 0) +
          (strongestOutgoingChain?.confidence || 0) * 0.7 +
          (strongestIncomingChain?.confidence || 0) * 0.35 +
          (strongestTrajectory?.confidence || 0) * 0.5 +
          Math.max(theme.persistence_score || 0, 0) * 0.1
      );

      return {
        key: theme.key,
        label: theme.label,
        human_label: theme.human_label,
        kind,
        count: theme.count,
        active_days: theme.active_days,
        share: theme.share,
        persistence_score: theme.persistence_score,
        confidence,
        drift_signal: drift,
        strongest_outgoing_chain: strongestOutgoingChain,
        strongest_incoming_chain: strongestIncomingChain,
        strongest_trajectory: strongestTrajectory,
        source_domains: theme.source_domains,
        source_titles: theme.source_titles,
        summary,
      };
    })
    .filter(
      (signal) =>
        signal.count >= DEFAULT_MIN_COUNT &&
        (signal.drift_signal || signal.strongest_outgoing_chain || signal.strongest_trajectory)
    )
    .sort(
      (left, right) =>
        right.confidence - left.confidence ||
        right.active_days - left.active_days ||
        right.count - left.count
    )
    .slice(0, topN);
}

function buildTrajectories(
  activities,
  chainsByPairKey,
  {
    windowMs = DEFAULT_WINDOW_MS,
    minCount = DEFAULT_MIN_TRAJECTORY_COUNT,
    topN = DEFAULT_TOP_TRAJECTORY_COUNT,
    minSourceCount = DEFAULT_MIN_SOURCE_COUNT,
  } = {}
) {
  const countsByPath = new Map();

  for (let index = 0; index < activities.length - 2; index += 1) {
    const first = activities[index];
    const second = activities[index + 1];
    const third = activities[index + 2];

    const gapAB = second.started_timestamp - first.ended_timestamp;
    const gapBC = third.started_timestamp - second.ended_timestamp;
    if (gapAB < 0 || gapBC < 0 || gapAB > windowMs || gapBC > windowMs) {
      continue;
    }
    if (!first.key || !second.key || !third.key) {
      continue;
    }
    if (first.key === second.key || second.key === third.key) {
      continue;
    }

    const edgeAB = chainsByPairKey.get(`${first.key}=>${second.key}`);
    const edgeBC = chainsByPairKey.get(`${second.key}=>${third.key}`);
    if (!edgeAB || !edgeBC) {
      continue;
    }
    if (
      edgeAB.count < DEFAULT_MIN_COUNT ||
      edgeBC.count < DEFAULT_MIN_COUNT ||
      edgeAB.from_count < minSourceCount ||
      edgeBC.from_count < minSourceCount ||
      edgeAB.conditional_probability <= edgeAB.baseline_probability ||
      edgeBC.conditional_probability <= edgeBC.baseline_probability
    ) {
      continue;
    }

    const pathKey = `${first.key}=>${second.key}=>${third.key}`;
    const existing = countsByPath.get(pathKey) || {
      count: 0,
      day_keys: new Set(),
      samples: [],
      first_activity_ids: new Set(),
      second_activity_ids: new Set(),
      third_activity_ids: new Set(),
    };

    existing.count += 1;
    existing.day_keys.add(first.day_key || second.day_key || third.day_key);
    existing.first_activity_ids.add(first.id);
    existing.second_activity_ids.add(second.id);
    existing.third_activity_ids.add(third.id);
    if (existing.samples.length < MAX_SUPPORTING_SAMPLES) {
      existing.samples.push({
        first_activity_id: first.id,
        second_activity_id: second.id,
        third_activity_id: third.id,
        started_at: first.started_at,
        completed_at: third.ended_at,
        labels: [first.label, second.label, third.label],
      });
    }

    countsByPath.set(pathKey, existing);
  }

  const activityById = new Map(activities.map((activity) => [activity.id, activity]));

  return [...countsByPath.entries()]
    .map(([pathKey, support]) => {
      const [firstKey, secondKey, thirdKey] = pathKey.split("=>");
      const edgeAB = chainsByPairKey.get(`${firstKey}=>${secondKey}`);
      const edgeBC = chainsByPairKey.get(`${secondKey}=>${thirdKey}`);
      const firstActivities = [...support.first_activity_ids]
        .map((id) => activityById.get(id))
        .filter(Boolean);
      const secondActivities = [...support.second_activity_ids]
        .map((id) => activityById.get(id))
        .filter(Boolean);
      const thirdActivities = [...support.third_activity_ids]
        .map((id) => activityById.get(id))
        .filter(Boolean);
      const firstEvidence = mergeActivityEvidence(firstActivities);
      const secondEvidence = mergeActivityEvidence(secondActivities);
      const thirdEvidence = mergeActivityEvidence(thirdActivities);
      const probabilityDelta =
        ((edgeAB?.probability_delta || 0) + (edgeBC?.probability_delta || 0)) / 2;

      return {
        path: [firstKey, secondKey, thirdKey],
        count: support.count,
        active_days: support.day_keys.size,
        confidence: round(support.count * probabilityDelta),
        average_lift: round(((edgeAB?.probability_lift || 0) + (edgeBC?.probability_lift || 0)) / 2),
        first_label: firstActivities[0]?.label || titleCase(firstKey),
        second_label: secondActivities[0]?.label || titleCase(secondKey),
        third_label: thirdActivities[0]?.label || titleCase(thirdKey),
        first_human_label:
          firstActivities[0]?.human_label || buildHumanActivityLabel(firstKey, firstActivities[0]?.mode),
        second_human_label:
          secondActivities[0]?.human_label || buildHumanActivityLabel(secondKey, secondActivities[0]?.mode),
        third_human_label:
          thirdActivities[0]?.human_label || buildHumanActivityLabel(thirdKey, thirdActivities[0]?.mode),
        first_sources: firstEvidence,
        second_sources: secondEvidence,
        third_sources: thirdEvidence,
        supporting_samples: support.samples,
        summary: `You often moved from ${(
          firstActivities[0]?.human_label || buildHumanActivityLabel(firstKey, firstActivities[0]?.mode)
        ).toLowerCase()} into ${(
          secondActivities[0]?.human_label || buildHumanActivityLabel(secondKey, secondActivities[0]?.mode)
        ).toLowerCase()}, and then into ${(
          thirdActivities[0]?.human_label || buildHumanActivityLabel(thirdKey, thirdActivities[0]?.mode)
        ).toLowerCase()}. This path appeared ${support.count} times.`,
      };
    })
    .filter((trajectory) => trajectory.count >= minCount)
    .sort(
      (left, right) =>
        right.confidence - left.confidence ||
        right.count - left.count ||
        right.average_lift - left.average_lift
    )
    .slice(0, topN);
}

export function analyzeInfluenceSnapshot(snapshot, options = {}) {
  const windowMs = Math.max(60 * 1000, Number(options.windowMs || DEFAULT_WINDOW_MS));
  const minCount = Math.max(1, Number(options.minCount || DEFAULT_MIN_COUNT));
  const minSourceCount = Math.max(
    1,
    Number(options.minSourceCount || DEFAULT_MIN_SOURCE_COUNT)
  );
  const topN = Math.max(1, Number(options.topN || DEFAULT_TOP_N));
  const topThemes = Math.max(1, Number(options.topThemes || DEFAULT_TOP_THEME_COUNT));
  const topTrajectories = Math.max(
    1,
    Number(options.topTrajectories || DEFAULT_TOP_TRAJECTORY_COUNT)
  );
  const minTrajectoryCount = Math.max(
    1,
    Number(options.minTrajectoryCount || DEFAULT_MIN_TRAJECTORY_COUNT)
  );
  const topDrift = Math.max(1, Number(options.topDrift || DEFAULT_TOP_DRIFT_COUNT));
  const topFormations = Math.max(1, Number(options.topFormations || DEFAULT_TOP_FORMATION_COUNT));
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
  const timeline = buildTimelineMeta(activities);
  const labelExamplesByKey = collectLabelExamples(activities);
  const activityById = new Map(activities.map((activity) => [activity.id, activity]));
  const occurrenceCounts = new Map();
  const activityMetaByKey = new Map();

  for (const activity of activities) {
    pushCount(occurrenceCounts, activity.key);
    if (!activityMetaByKey.has(activity.key)) {
      activityMetaByKey.set(activity.key, {
        label: activity.label,
        human_label: activity.human_label,
        mode: activity.mode,
      });
    }
  }

  const pairCounts = new Map();
  const pairSupportByKey = new Map();

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

    const support = pairSupportByKey.get(pairKey) || {
      samples: [],
      day_keys: new Set(),
      source_activity_ids: new Set(),
      target_activity_ids: new Set(),
    };

    support.day_keys.add(source.day_key || target.day_key);
    support.source_activity_ids.add(source.id);
    support.target_activity_ids.add(target.id);

    if (support.samples.length < MAX_SUPPORTING_SAMPLES) {
      support.samples.push({
        from_activity_id: source.id,
        to_activity_id: target.id,
        from_label: source.label,
        to_label: target.label,
        from_at: source.started_at,
        to_at: target.started_at,
        gap_minutes: round(gapMs / (60 * 1000), 2),
      });
    }

    pairSupportByKey.set(pairKey, support);
  }

  const activityCount = activities.length;
  const chains = [...pairCounts.entries()]
    .map(([pairKey, count]) => {
      const [fromKey, toKey] = pairKey.split("=>");
      const fromMeta = activityMetaByKey.get(fromKey) || {};
      const toMeta = activityMetaByKey.get(toKey) || {};
      const sourceCount = occurrenceCounts.get(fromKey) || 0;
      const targetCount = occurrenceCounts.get(toKey) || 0;
      const conditionalProbability = count / Math.max(1, sourceCount);
      const baselineProbability = activityCount ? targetCount / activityCount : 0;
      const probabilityLift = baselineProbability
        ? conditionalProbability / baselineProbability
        : 0;
      const probabilityDelta = Math.max(0, conditionalProbability - baselineProbability);
      const reversePairKey = `${toKey}=>${fromKey}`;
      const reverseCount = pairCounts.get(reversePairKey) || 0;
      const reverseSourceCount = occurrenceCounts.get(toKey) || 0;
      const reverseConditionalProbability = reverseCount / Math.max(1, reverseSourceCount);
      const reverseBaselineProbability = activityCount ? sourceCount / activityCount : 0;
      const reverseLift = reverseBaselineProbability
        ? reverseConditionalProbability / reverseBaselineProbability
        : 0;
      const evidence = buildChainEvidence(pairSupportByKey.get(pairKey), activityById);

      return {
        from: fromKey,
        from_label: fromMeta.label || titleCase(fromKey),
        from_human_label:
          fromMeta.human_label || buildHumanActivityLabel(fromKey, fromMeta.mode),
        from_count: sourceCount,
        from_examples: labelExamplesByKey.get(fromKey) || [],
        to: toKey,
        to_label: toMeta.label || titleCase(toKey),
        to_human_label: toMeta.human_label || buildHumanActivityLabel(toKey, toMeta.mode),
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
        supporting_samples: pairSupportByKey.get(pairKey)?.samples || [],
        evidence,
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
    evidence: chain.evidence,
  }));

  const themes = buildThemeProfiles(activities, activityCount, topThemes);
  const trajectories = buildTrajectories(activities, chainsByPairKey, {
    windowMs,
    minCount: minTrajectoryCount,
    topN: topTrajectories,
    minSourceCount,
  });
  const driftSignals = buildDriftSignals(activities, themes, {
    topN: topDrift,
    minCount,
  });
  const formationSignals = buildFormationSignals(
    themes,
    driftSignals,
    validChains,
    trajectories,
    topFormations
  );

  return {
    meta: {
      activity_count: activities.length,
      candidate_transition_count: chains.length,
      reported_chain_count: validChains.length,
      window_minutes: Math.round(windowMs / (60 * 1000)),
      min_count: minCount,
      min_source_count: minSourceCount,
      min_trajectory_count: minTrajectoryCount,
      top_n: topN,
      top_themes: topThemes,
      top_trajectories: topTrajectories,
      top_drift: topDrift,
      top_formations: topFormations,
      activity_field: activityField,
      normalization_rule_count: normalizationRules.length,
      timeline,
    },
    transitions: chains,
    valid_chains: validChains,
    insights,
    themes,
    trajectories,
    drift_signals: driftSignals,
    formation_signals: formationSignals,
  };
}

export function formatReadableGraph(chains) {
  return (Array.isArray(chains) ? chains : [])
    .map((chain) => {
      const days = chain?.evidence?.active_days ? ` days=${chain.evidence.active_days}` : "";
      return `[${chain.from}] -> [${chain.to}] (${chain.count}) lift=${chain.probability_lift} confidence=${chain.confidence}${days}`;
    })
    .join("\n");
}

export function formatReadableInsights(insights) {
  return (Array.isArray(insights) ? insights : [])
    .map((insight) => insight.summary)
    .join("\n");
}

export function formatReadableThemes(themes) {
  return (Array.isArray(themes) ? themes : [])
    .map((theme) => {
      const sources = formatCountList(theme.source_domains);
      const sourceSuffix = sources ? ` | sources: ${sources}` : "";
      return `${theme.key}: count=${theme.count} active_days=${theme.active_days} duration_minutes=${theme.total_duration_minutes}${sourceSuffix}`;
    })
    .join("\n");
}

export function formatReadableTrajectories(trajectories) {
  return (Array.isArray(trajectories) ? trajectories : [])
    .map((trajectory) => {
      const path = trajectory.path.map((step) => `[${step}]`).join(" -> ");
      const sources = formatCountList(trajectory.first_sources?.domains || []);
      const sourceSuffix = sources ? ` | sources: ${sources}` : "";
      return `${path} (${trajectory.count}) lift=${trajectory.average_lift} confidence=${trajectory.confidence}${sourceSuffix}`;
    })
    .join("\n");
}

export function formatReadableDriftSignals(signals) {
  return (Array.isArray(signals) ? signals : [])
    .map((signal) => {
      const sources = formatCountList(signal.source_domains || []);
      const sourceSuffix = sources ? ` | sources: ${sources}` : "";
      return `${signal.key}: early=${signal.early_share} late=${signal.late_share} delta=${signal.share_delta} confidence=${signal.confidence}${sourceSuffix}`;
    })
    .join("\n");
}

export function formatReadableFormationSignals(signals) {
  return (Array.isArray(signals) ? signals : [])
    .map((signal) => {
      const sources = formatCountList(signal.source_domains || []);
      const sourceSuffix = sources ? ` | sources: ${sources}` : "";
      return `${signal.key}: ${signal.summary} confidence=${signal.confidence}${sourceSuffix}`;
    })
    .join("\n");
}

export function formatReadableEvidence(chains) {
  return (Array.isArray(chains) ? chains : [])
    .map((chain, index) => {
      const sourceDomains = formatCountList(chain.evidence?.source_domains || []);
      const sourceTitles = (chain.evidence?.source_titles || [])
        .map((item) => `${item.title} (${item.count})`)
        .join(", ");
      const destinationDomains = formatCountList(chain.evidence?.destination_domains || []);
      const destinationTitles = (chain.evidence?.destination_titles || [])
        .map((item) => `${item.title} (${item.count})`)
        .join(", ");

      return [
        `${index + 1}. [${chain.from}] -> [${chain.to}] (${chain.count})`,
        sourceDomains ? `   before-shift domains: ${sourceDomains}` : "",
        sourceTitles ? `   before-shift titles: ${sourceTitles}` : "",
        destinationDomains ? `   after-shift domains: ${destinationDomains}` : "",
        destinationTitles ? `   after-shift titles: ${destinationTitles}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");
}

export function formatDotGraph(chains) {
  const edges = (Array.isArray(chains) ? chains : [])
    .map((chain) => {
      const days = chain?.evidence?.active_days ? ` | days=${chain.evidence.active_days}` : "";
      return `  "${chain.from}" -> "${chain.to}" [label="${chain.count} | lift=${chain.probability_lift} | conf=${chain.confidence}${days}"];`;
    })
    .join("\n");

  return `digraph Influnet {\n${edges}\n}`;
}

export function formatMarkdownPitchReport(analysis) {
  const lines = [];
  const meta = analysis?.meta || {};
  const timeline = meta.timeline || {};

  lines.push("# Influnet Pitch Report");
  lines.push("");
  lines.push(
    `Generated from a Captanet snapshot with ${meta.activity_count || 0} normalized activities across ${timeline.days_spanned || 0} active days.`
  );
  lines.push("");

  lines.push("## Strongest Directional Patterns");
  if (analysis?.valid_chains?.length) {
    for (const chain of analysis.valid_chains) {
      lines.push(
        `- **${chain.from_label} -> ${chain.to_label}**: ${buildInsightSummary(chain)}`
      );
    }
  } else {
    lines.push("- No strong directional patterns met the current support rules.");
  }
  lines.push("");

  lines.push("## Formation Signals");
  if (analysis?.formation_signals?.length) {
    for (const signal of analysis.formation_signals) {
      lines.push(`- **${signal.label}**: ${signal.summary}`);
    }
  } else {
    lines.push("- No formation signals met the current support rules.");
  }
  lines.push("");

  lines.push("## Repeated Trajectories");
  if (analysis?.trajectories?.length) {
    for (const trajectory of analysis.trajectories) {
      lines.push(
        `- **${trajectory.path.join(" -> ")}**: ${trajectory.summary}`
      );
    }
  } else {
    lines.push("- No repeated multi-step trajectories were found.");
  }
  lines.push("");

  lines.push("## Source Evidence");
  if (analysis?.valid_chains?.length) {
    for (const chain of analysis.valid_chains) {
      const sourceDomains = formatCountList(chain.evidence?.source_domains || []);
      const destinationDomains = formatCountList(chain.evidence?.destination_domains || []);
      lines.push(
        `- **${chain.from_label} -> ${chain.to_label}**: before=${sourceDomains || "unknown"} | after=${destinationDomains || "unknown"}`
      );
    }
  } else {
    lines.push("- No evidence-backed chain set available.");
  }

  return lines.join("\n");
}

export function formatTerminalReport(analysis) {
  const meta = analysis?.meta || {};
  const timeline = meta.timeline || {};
  const lines = [];

  lines.push("Influnet Report");
  if (timeline.started_at || timeline.ended_at) {
    lines.push(
      `Timeline: ${timeline.started_at || "unknown"} -> ${timeline.ended_at || "unknown"} | days=${timeline.days_spanned || 0} | activities=${meta.activity_count || 0}`
    );
  } else {
    lines.push(`Timeline: activities=${meta.activity_count || 0}`);
  }

  lines.push("");
  lines.push("Strongest Chains");
  if (analysis?.valid_chains?.length) {
    for (const [index, chain] of analysis.valid_chains.entries()) {
      lines.push(
        `${index + 1}. [${chain.from}] -> [${chain.to}] (${chain.count}) lift=${chain.probability_lift} confidence=${chain.confidence}`
      );
      lines.push(`   ${buildInsightSummary(chain)}`);
      if (chain.evidence?.source_domains?.length) {
        lines.push(`   recurring source domains: ${formatCountList(chain.evidence.source_domains)}`);
      }
      if (chain.evidence?.source_titles?.length) {
        lines.push(
          `   recurring source titles: ${chain.evidence.source_titles
            .map((item) => `${item.title} (${item.count})`)
            .join(", ")}`
        );
      }
    }
  } else {
    lines.push("No valid influence chains found.");
  }

  lines.push("");
  lines.push("Repeated Trajectories");
  if (analysis?.trajectories?.length) {
    for (const [index, trajectory] of analysis.trajectories.entries()) {
      lines.push(
        `${index + 1}. ${trajectory.path.map((step) => `[${step}]`).join(" -> ")} (${trajectory.count}) lift=${trajectory.average_lift} confidence=${trajectory.confidence}`
      );
      lines.push(`   ${trajectory.summary}`);
      if (trajectory.first_sources?.domains?.length) {
        lines.push(`   starting sources: ${formatCountList(trajectory.first_sources.domains)}`);
      }
      if (trajectory.third_sources?.domains?.length) {
        lines.push(`   ending sources: ${formatCountList(trajectory.third_sources.domains)}`);
      }
    }
  } else {
    lines.push("No repeated trajectories found.");
  }

  lines.push("");
  lines.push("Persistent Themes");
  if (analysis?.themes?.length) {
    for (const theme of analysis.themes) {
      const sources = formatCountList(theme.source_domains);
      lines.push(
        `- ${theme.key}: count=${theme.count}, days=${theme.active_days}, duration_minutes=${theme.total_duration_minutes}${sources ? `, sources=${sources}` : ""}`
      );
    }
  } else {
    lines.push("No persistent themes found.");
  }

  lines.push("");
  lines.push("Drift Signals");
  if (analysis?.drift_signals?.length) {
    for (const signal of analysis.drift_signals) {
      lines.push(`- ${signal.summary}`);
      if (signal.source_domains?.length) {
        lines.push(`  recurring sources: ${formatCountList(signal.source_domains)}`);
      }
    }
  } else {
    lines.push("No drift signals found.");
  }

  lines.push("");
  lines.push("Formation Signals");
  if (analysis?.formation_signals?.length) {
    for (const signal of analysis.formation_signals) {
      lines.push(`- ${signal.summary}`);
      if (signal.source_domains?.length) {
        lines.push(`  recurring sources: ${formatCountList(signal.source_domains)}`);
      }
    }
  } else {
    lines.push("No formation signals found.");
  }

  return lines.join("\n");
}
