import {
  NoveltyAnalysis,
  Paper,
  PriorArtMatch,
  ResearchIntent,
  ResearchProposal,
} from '../../core/state';

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'for', 'with', 'from', 'into', 'onto', 'over', 'under',
  'than', 'then', 'that', 'this', 'these', 'those', 'their', 'there', 'about', 'using', 'based',
  'toward', 'through', 'across', 'between', 'within', 'without', 'while', 'where', 'when', 'which',
  'what', 'whose', 'into', 'such', 'each', 'other', 'some', 'many', 'most', 'more', 'less', 'very',
  'also', 'only', 'into', 'being', 'been', 'have', 'has', 'had', 'will', 'would', 'could', 'should',
  'might', 'must', 'need', 'needs', 'needed', 'show', 'shows', 'showing', 'study', 'paper', 'method',
  'methods', 'model', 'models', 'approach', 'approaches', 'research', 'problem', 'problems', 'task',
  'tasks', 'results', 'result', 'evaluation', 'propose', 'proposed', 'proposes', 'novel', 'new',
  'improved', 'improving', 'improvement', 'analysis', 'systematic', 'framework', 'towards', 'via',
]);

export interface ProposalNoveltyInput {
  title: string;
  motivation: string;
  problemDefinition: string;
  overview: string;
  technicalApproach: string;
  expectedContributions: string[];
  gapHint?: string;
}

interface RankedPriorArtMatch extends PriorArtMatch {
  score: number;
}

const NON_GAP_PATTERNS = [
  /accuracy/i,
  /f1/i,
  /precision/i,
  /recall/i,
  /loss/i,
  /score/i,
  /improvement/i,
  /performance/i,
  /benchmark/i,
  /evaluation/i,
  /metric/i,
];

export function buildNoveltyAnalysisFromProposal(
  proposal: Pick<ResearchProposal, 'title' | 'motivation' | 'problemDefinition' | 'methodology' | 'expectedContributions'>,
  intent: ResearchIntent,
  papers: Paper[],
  gapHint?: string
): NoveltyAnalysis {
  return buildNoveltyAnalysis(
    {
      title: proposal.title,
      motivation: proposal.motivation,
      problemDefinition: proposal.problemDefinition,
      overview: proposal.methodology.overview,
      technicalApproach: proposal.methodology.technicalApproach,
      expectedContributions: proposal.expectedContributions,
      gapHint,
    },
    intent,
    papers
  );
}

export function buildNoveltyAnalysis(
  input: ProposalNoveltyInput,
  intent: ResearchIntent,
  papers: Paper[]
): NoveltyAnalysis {
  const evidenceTexts = [
    input.title,
    input.motivation,
    input.problemDefinition,
    input.overview,
    input.technicalApproach,
    ...input.expectedContributions,
    input.gapHint || '',
    intent.topic,
    intent.problemStatement,
    ...intent.constraints.compatibilityRequirements,
    ...intent.constraints.resourceConstraints,
  ].filter(Boolean);

  const proposalTerms = extractKeywords(evidenceTexts.join(' '), 24);
  const rankedMatches = papers
    .map(paper => rankPaperAgainstProposal(paper, proposalTerms, input))
    .filter(match => match.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const supportingPapers = rankedMatches.map(match => ({
    paperId: match.paperId,
    title: match.title,
    year: match.year,
    citationCount: match.citationCount,
    overlapKeywords: match.overlapKeywords,
    overlapScore: match.overlapScore,
    rationale: match.rationale,
  }));

  const comparedMethods = supportingPapers.map(paper => paper.title);
  const coverageMap = buildCoverageMap(proposalTerms, supportingPapers);
  const evidenceGaps = collectEvidenceGaps(input, intent, coverageMap);
  const distinctTerms = proposalTerms.filter(term => (coverageMap.get(term) || 0) <= 1).slice(0, 4);
  const keyDifferences = buildKeyDifferences(input, evidenceGaps, distinctTerms, supportingPapers);
  const averageOverlap = supportingPapers.length > 0
    ? supportingPapers.reduce((sum, paper) => sum + paper.overlapScore, 0) / supportingPapers.length
    : 0;
  const uncoveredGapRatio = evidenceGaps.length > 0
    ? evidenceGaps.filter(gap => gap.coverage === 0).length / evidenceGaps.length
    : 0.5;
  const distinctRatio = proposalTerms.length > 0 ? distinctTerms.length / proposalTerms.length : 0;

  const noveltyScore = clampScore(
    2 + (1 - averageOverlap) * 3.5 + uncoveredGapRatio * 2 + distinctRatio * 1.5
  );

  const priorArtSummary = buildPriorArtSummary(supportingPapers);
  const gapStatement = buildGapStatement(evidenceGaps, distinctTerms, supportingPapers);
  const noveltyJustification = buildNoveltyJustification(supportingPapers, evidenceGaps, distinctTerms);

  return {
    comparedMethods,
    keyDifferences,
    noveltyScore,
    noveltyJustification,
    priorArtSummary,
    gapStatement,
    supportingPapers,
  };
}

function rankPaperAgainstProposal(
  paper: Paper,
  proposalTerms: string[],
  input: ProposalNoveltyInput
): RankedPriorArtMatch {
  const titleTerms = new Set(extractKeywords(paper.title, 16));
  const abstractTerms = new Set(extractKeywords(paper.abstract, 24));
  const keywordTerms = new Set(extractKeywords(paper.keywords.join(' '), 12));
  const titleOverlap = proposalTerms.filter(term => titleTerms.has(term));
  const abstractOverlap = proposalTerms.filter(term => abstractTerms.has(term));
  const keywordOverlap = proposalTerms.filter(term => keywordTerms.has(term));
  const overlapKeywords = uniqueTerms([...titleOverlap, ...abstractOverlap, ...keywordOverlap]).slice(0, 6);
  const overlapScore = normalizeScore(
    proposalTerms.length === 0
      ? 0
      : titleOverlap.length * 0.5 / proposalTerms.length +
          abstractOverlap.length * 0.35 / proposalTerms.length +
          keywordOverlap.length * 0.15 / Math.max(1, proposalTerms.length)
  );

  const rationaleParts: string[] = [];
  if (overlapKeywords.length > 0) {
    rationaleParts.push(`shared focus on ${overlapKeywords.join(', ')}`);
  }
  if (paper.year) {
    rationaleParts.push(`published in ${paper.year}`);
  }
  if (paper.citationCount) {
    rationaleParts.push(`${paper.citationCount} citations`);
  }

  return {
    paperId: paper.id,
    title: paper.title,
    year: paper.year,
    citationCount: paper.citationCount,
    overlapKeywords,
    overlapScore,
    rationale: rationaleParts.join('; ') || `related to ${input.title}`,
    score: overlapScore + Math.min((paper.relevanceScore || 0) * 0.25, 0.25),
  };
}

function buildCoverageMap(terms: string[], papers: PriorArtMatch[]): Map<string, number> {
  const coverage = new Map<string, number>();
  for (const term of terms) {
    coverage.set(term, 0);
  }

  for (const paper of papers) {
    const paperTerms = new Set(paper.overlapKeywords);
    for (const term of terms) {
      if (paperTerms.has(term)) {
        coverage.set(term, (coverage.get(term) || 0) + 1);
      }
    }
  }

  return coverage;
}

function collectEvidenceGaps(
  input: ProposalNoveltyInput,
  intent: ResearchIntent,
  coverageMap: Map<string, number>
): Array<{ label: string; coverage: number }> {
  const candidates = [
    ...(input.gapHint ? [input.gapHint] : []),
    ...intent.constraints.compatibilityRequirements,
    ...intent.constraints.resourceConstraints,
  ]
    .map(item => item.trim())
    .filter(Boolean)
    .filter(item => isGapCandidate(item))
    .slice(0, 8);

  return candidates.map(label => {
    const keywords = extractKeywords(label, 6);
    const coverage = keywords.length === 0
      ? 0
      : keywords.reduce((sum, keyword) => sum + (coverageMap.get(keyword) || 0), 0);
    return { label, coverage };
  });
}

function buildKeyDifferences(
  input: ProposalNoveltyInput,
  evidenceGaps: Array<{ label: string; coverage: number }>,
  distinctTerms: string[],
  supportingPapers: PriorArtMatch[]
): string[] {
  const differences: string[] = [];
  const uncoveredGaps = evidenceGaps.filter(gap => gap.coverage === 0).slice(0, 2);

  for (const gap of uncoveredGaps) {
    differences.push(`Targets ${gap.label}, which is only weakly covered in the closest retrieved metadata`);
  }

  if (distinctTerms.length > 0) {
    differences.push(`Centers the method on underrepresented concepts in the retrieved literature: ${distinctTerms.join(', ')}`);
  }

  if (supportingPapers.length > 0) {
    const citedTitles = supportingPapers.slice(0, 2).map(paper => paper.title).join(' and ');
    differences.push(`Frames the contribution against ${citedTitles} by shifting emphasis from shared prior-art themes toward the proposal-specific target requirement`);
  }

  if (differences.length === 0) {
    differences.push(`Motivates the contribution through ${input.problemDefinition || input.motivation}`);
  }

  return differences.slice(0, 4);
}

function buildPriorArtSummary(papers: PriorArtMatch[]): string {
  if (papers.length === 0) {
    return 'The retrieved literature does not provide enough close matches to support a strong prior-art comparison.';
  }

  const summaries = papers.slice(0, 3).map(paper => {
    const overlap = paper.overlapKeywords.length > 0 ? `overlap: ${paper.overlapKeywords.join(', ')}` : 'limited keyword overlap';
    const citationText = typeof paper.citationCount === 'number' ? `, ${paper.citationCount} citations` : '';
    return `${paper.title} (${paper.year}${citationText}; ${overlap})`;
  });

  return `Closest prior art in the retrieved set includes ${summaries.join('; ')}.`;
}

function buildGapStatement(
  evidenceGaps: Array<{ label: string; coverage: number }>,
  distinctTerms: string[],
  supportingPapers: PriorArtMatch[]
): string {
  const uncovered = evidenceGaps.filter(gap => gap.coverage === 0).map(gap => gap.label);
  if (uncovered.length > 0) {
    return `Within the retrieved metadata, explicit coverage of ${uncovered.slice(0, 2).join(' and ')} is limited.`;
  }

  if (distinctTerms.length > 0) {
    return `The proposal appears somewhat differentiated through sparsely covered concepts such as ${distinctTerms.join(', ')}.`;
  }

  if (supportingPapers.length > 0) {
    return `The idea is closest to existing work on ${supportingPapers[0].overlapKeywords.join(', ') || 'the same topic'}, so novelty depends on execution quality rather than a clean unexplored gap.`;
  }

  return 'A concrete literature gap could not be isolated from the available retrieved metadata.';
}

function buildNoveltyJustification(
  supportingPapers: PriorArtMatch[],
  evidenceGaps: Array<{ label: string; coverage: number }>,
  distinctTerms: string[]
): string {
  if (supportingPapers.length === 0) {
    return 'Novelty remains uncertain because the retrieved metadata does not contain close prior-art matches to compare against.';
  }

  const anchorPapers = supportingPapers.slice(0, 2).map(paper => paper.title).join(' and ');
  const uncoveredGaps = evidenceGaps.filter(gap => gap.coverage === 0).map(gap => gap.label);

  if (uncoveredGaps.length > 0) {
    return `Compared with ${anchorPapers}, the proposal is framed around requirements such as ${uncoveredGaps.slice(0, 2).join(' and ')} that are not explicit in the retrieved metadata.`;
  }

  if (distinctTerms.length > 0) {
    return `Compared with ${anchorPapers}, the proposal shifts the focus toward underrepresented concepts such as ${distinctTerms.join(', ')}.`;
  }

  return `The proposal overlaps substantially with ${anchorPapers}, so it should be treated as an incremental extension unless future evidence shows stronger differentiation.`;
}

function extractKeywords(text: string, limit: number): string[] {
  if (!text) {
    return [];
  }

  const counts = new Map<string, number>();
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !STOP_WORDS.has(word));

  for (const word of words) {
    counts.set(word, (counts.get(word) || 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word)
    .slice(0, limit);
}

function uniqueTerms(terms: string[]): string[] {
  return Array.from(new Set(terms.filter(Boolean)));
}

function normalizeScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function clampScore(value: number): number {
  return Math.max(1, Math.min(10, Number(value.toFixed(1))));
}

function isGapCandidate(label: string): boolean {
  return !NON_GAP_PATTERNS.some(pattern => pattern.test(label));
}
