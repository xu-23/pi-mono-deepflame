/**
 * Proposal Selection Module
 * 
 * Selects the best research proposal based on evaluation scores
 * and user preferences
 */

import { 
  StateManager, 
  ResearchProposal 
} from '../../core/state';
import { PhaseExecutor, PhaseExecutionContext } from '../../core/workflow';

// ============================================================================
// Types
// ============================================================================

export interface SelectionCriteria {
  prioritizeInnovation: boolean;
  prioritizeFeasibility: boolean;
  prioritizeSuperiority: boolean;
  maxComputeHours: number;
  maxTimelineWeeks: number;
  riskTolerance: 'low' | 'medium' | 'high';
}

export interface SelectionResult {
  selectedProposal: ResearchProposal;
  reasoning: string;
  alternatives: ResearchProposal[];
}

// ============================================================================
// Proposal Selector
// ============================================================================

export class ProposalSelector implements PhaseExecutor {
  private stateManager: StateManager;
  private criteria: SelectionCriteria;

  constructor(stateManager: StateManager, criteria?: Partial<SelectionCriteria>) {
    this.stateManager = stateManager;
    this.criteria = {
      prioritizeInnovation: false,
      prioritizeFeasibility: false,
      prioritizeSuperiority: false,
      maxComputeHours: 200,
      maxTimelineWeeks: 8,
      riskTolerance: 'medium',
      ...criteria,
    };
  }

  /**
   * Execute selection phase
   */
  async execute(context: PhaseExecutionContext): Promise<void> {
    const state = this.stateManager.getState();
    const proposals = state.proposals;

    if (proposals.length === 0) {
      throw new Error('No proposals available for selection');
    }

    context.reportProgress(0, 'Analyzing proposals for selection');

    // Filter by hard constraints
    const viableProposals = this.filterByConstraints(proposals);
    context.reportProgress(30, `Found ${viableProposals.length} viable proposals`);

    if (viableProposals.length === 0) {
      // Relax constraints and retry
      this.criteria.maxComputeHours *= 2;
      const relaxedProposals = this.filterByConstraints(proposals);
      
      if (relaxedProposals.length === 0) {
        throw new Error('No proposals meet resource constraints');
      }
      
      context.reportProgress(40, 'Using relaxed constraints');
      viableProposals.push(...relaxedProposals);
    }

    // Rank proposals
    const rankedProposals = this.rankProposals(viableProposals);
    context.reportProgress(60, 'Proposals ranked');

    // Select best proposal
    const selected = rankedProposals[0];
    context.reportProgress(80, `Selected: ${selected.title.substring(0, 50)}...`);

    // Generate reasoning
    const reasoning = this.generateSelectionReasoning(selected, rankedProposals);

    // Store selection
    this.stateManager.selectProposal(selected.id);
    context.reportProgress(100, 'Selection complete');

    // Log result
    console.log('\n' + reasoning);
  }

  /**
   * Filter proposals by hard constraints
   */
  private filterByConstraints(proposals: ResearchProposal[]): ResearchProposal[] {
    return proposals.filter(p => {
      // Resource constraint
      if (p.estimatedResources.computeHours > this.criteria.maxComputeHours) {
        return false;
      }

      // Risk constraint
      if (this.criteria.riskTolerance === 'low' && p.risks.length > 2) {
        return false;
      }

      // Must have scores
      if (!p.scores) {
        return false;
      }

      return true;
    });
  }

  /**
   * Rank proposals by weighted criteria
   */
  private rankProposals(proposals: ResearchProposal[]): ResearchProposal[] {
    const weights = this.calculateWeights();

    return [...proposals].sort((a, b) => {
      const scoreA = this.calculateWeightedScore(a, weights);
      const scoreB = this.calculateWeightedScore(b, weights);
      return scoreB - scoreA;
    });
  }

  /**
   * Calculate weights based on priorities
   */
  private calculateWeights(): { innovation: number; feasibility: number; superiority: number } {
    let innovation = 0.35;
    let feasibility = 0.30;
    let superiority = 0.35;

    // Adjust based on priorities
    if (this.criteria.prioritizeInnovation) {
      innovation += 0.15;
      feasibility -= 0.05;
      superiority -= 0.10;
    }
    if (this.criteria.prioritizeFeasibility) {
      feasibility += 0.15;
      innovation -= 0.05;
      superiority -= 0.10;
    }
    if (this.criteria.prioritizeSuperiority) {
      superiority += 0.15;
      innovation -= 0.05;
      feasibility -= 0.10;
    }

    // Normalize
    const total = innovation + feasibility + superiority;
    return {
      innovation: innovation / total,
      feasibility: feasibility / total,
      superiority: superiority / total,
    };
  }

  /**
   * Calculate weighted score for a proposal
   */
  private calculateWeightedScore(
    proposal: ResearchProposal,
    weights: { innovation: number; feasibility: number; superiority: number }
  ): number {
    const scores = proposal.scores!;
    return (
      scores.innovationScore * weights.innovation +
      scores.feasibilityScore * weights.feasibility +
      scores.superiorityScore * weights.superiority
    );
  }

  /**
   * Generate reasoning for selection
   */
  private generateSelectionReasoning(
    selected: ResearchProposal,
    allRanked: ResearchProposal[]
  ): string {
    const scores = selected.scores!;
    const alternatives = allRanked.slice(1, 3);

    return `
## Proposal Selection Result

### Selected Proposal
**${selected.title}**

**Scores**:
- Innovation: ${scores.innovationScore.toFixed(1)}/10
- Feasibility: ${scores.feasibilityScore.toFixed(1)}/10
- Superiority: ${scores.superiorityScore.toFixed(1)}/10
- **Overall: ${scores.overallScore.toFixed(1)}/10**

**Selection Reasoning**:
${this.generateReasoningText(selected, allRanked)}

**Methodology Overview**:
${selected.methodology.overview}

**Key Innovation**:
${selected.noveltyAnalysis.noveltyJustification}

**Expected Contributions**:
${selected.expectedContributions.map(c => `- ${c}`).join('\n')}

**Resource Requirements**:
- Compute: ${selected.estimatedResources.computeHours} hours
- Memory: ${selected.estimatedResources.memoryGB} GB
- Datasets: ${selected.estimatedResources.datasetRequirements.join(', ') || 'Standard benchmarks'}

**Risks & Mitigation**:
${selected.risks.map(r => `- ${r}`).join('\n')}

${alternatives.length > 0 ? `
**Alternative Proposals**:
${alternatives.map((p, i) => `${i + 1}. ${p.title} (Score: ${p.scores?.overallScore.toFixed(1)})`).join('\n')}
` : ''}
`.trim();
  }

  /**
   * Generate reasoning text
   */
  private generateReasoningText(
    selected: ResearchProposal,
    allRanked: ResearchProposal[]
  ): string {
    const reasons: string[] = [];
    const scores = selected.scores!;

    // Highest overall score
    if (allRanked[0] === selected) {
      reasons.push('Highest weighted overall score among all proposals');
    }

    // Strength analysis
    if (scores.innovationScore >= 8) {
      reasons.push('Strong innovation potential with novel approach');
    }
    if (scores.feasibilityScore >= 7) {
      reasons.push('Feasible implementation within resource constraints');
    }
    if (scores.superiorityScore >= 7) {
      reasons.push('Clear advantages over existing methods expected');
    }

    // Balance analysis
    const scoreVariance = this.calculateVariance([
      scores.innovationScore,
      scores.feasibilityScore,
      scores.superiorityScore,
    ]);
    if (scoreVariance < 2) {
      reasons.push('Well-balanced across all evaluation dimensions');
    }

    // Resource efficiency
    if (selected.estimatedResources.computeHours < 100) {
      reasons.push('Resource-efficient compared to alternatives');
    }

    return reasons.map(r => `- ${r}`).join('\n');
  }

  /**
   * Calculate variance
   */
  private calculateVariance(values: number[]): number {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Quick selection based on highest overall score
 */
export function selectBestProposal(proposals: ResearchProposal[]): ResearchProposal | null {
  const scored = proposals.filter(p => p.scores);
  if (scored.length === 0) return null;

  return scored.reduce((best, p) =>
    (p.scores!.overallScore > (best.scores?.overallScore || 0)) ? p : best
  );
}

/**
 * Get selection summary for display
 */
export function getSelectionSummary(proposal: ResearchProposal): string {
  if (!proposal.scores) return 'Not evaluated';

  return `
Proposal: ${proposal.title}
Overall Score: ${proposal.scores.overallScore.toFixed(1)}/10
  - Innovation: ${proposal.scores.innovationScore.toFixed(1)}
  - Feasibility: ${proposal.scores.feasibilityScore.toFixed(1)}
  - Superiority: ${proposal.scores.superiorityScore.toFixed(1)}
`.trim();
}