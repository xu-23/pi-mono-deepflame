/**
 * Research Agent State Management
 * 
 * Manages the complete state of a research workflow including:
 * - Research direction and constraints
 * - Retrieved literature
 * - Generated proposals
 * - Experiment results
 * - Analysis outputs
 * - Paper drafts
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Type Definitions
// ============================================================================

export type ResearchDomain = 'ml' | 'dl' | 'nlp' | 'cv' | 'rl' | 'cfd' | 'optimization' | 'general';

export type ResearchPhase = 
  | 'idle'
  | 'intent_clarification'
  | 'literature_retrieval'
  | 'ideation'
  | 'evaluation'
  | 'selection'
  | 'experiment_design'
  | 'experiment_execution'
  | 'data_analysis'
  | 'visualization'
  | 'paper_writing'
  | 'completed'
  | 'paused'
  | 'error';

export interface ResearchIntent {
  // Core research direction
  domain: ResearchDomain;
  topic: string;
  problemStatement: string;
  
  // Constraints and requirements
  constraints: {
    compatibilityRequirements: string[];
    resourceConstraints: string[];
    timeConstraint?: string;
  };
  
  // Success criteria
  successCriteria: string[];
  evaluationBenchmarks: string[];
  
  // Clarification history
  clarificationRounds: ClarificationRound[];
  isConfirmed: boolean;
}

export interface ClarificationRound {
  round: number;
  questions: string[];
  answers: string[];
  timestamp: string;
}

export interface Paper {
  id: string;
  title: string;
  authors: string[];
  abstract: string;
  venue?: string;
  year: number;
  url: string;
  arxivId?: string;
  doi?: string;
  citationCount?: number;
  keywords: string[];
  keyFindings: string[];
  methodology: string;
  relevanceScore: number;
  source: 'arxiv' | 'semantic_scholar';
}

export interface ResearchProposal {
  id: string;
  title: string;
  motivation: string;
  problemDefinition: string;
  methodology: MethodologyDescription;
  noveltyAnalysis: NoveltyAnalysis;
  expectedContributions: string[];
  risks: string[];
  estimatedResources: ResourceEstimate;
  evaluationMetrics: string[];
  scores?: ProposalScores;
}

export interface MethodologyDescription {
  overview: string;
  technicalApproach: string;
  algorithms?: string[];
  architecture?: string;
  implementationSteps: string[];
}

export interface NoveltyAnalysis {
  comparedMethods: string[];
  keyDifferences: string[];
  noveltyScore: number; // 1-10
  noveltyJustification: string;
  priorArtSummary?: string;
  gapStatement?: string;
  supportingPapers?: PriorArtMatch[];
}

export interface PriorArtMatch {
  paperId: string;
  title: string;
  year: number;
  citationCount?: number;
  overlapKeywords: string[];
  overlapScore: number;
  rationale: string;
}

export interface ResourceEstimate {
  computeHours: number;
  memoryGB: number;
  datasetRequirements: string[];
  softwareDependencies: string[];
}

export interface ProposalScores {
  innovationScore: number;
  feasibilityScore: number;
  superiorityScore: number;
  overallScore: number;
  evaluationComments: EvaluationComment[];
}

export interface EvaluationComment {
  role: 'innovator' | 'feasibility_analyst' | 'superiority_analyst' | 'reviewer';
  comment: string;
  score: number;
  concerns: string[];
  suggestions: string[];
}

export interface Experiment {
  id: string;
  proposalId: string;
  name: string;
  description: string;
  hypothesis: string;
  methodology: string;
  code: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  results?: ExperimentResult;
  logs: string[];
  startTime?: string;
  endTime?: string;
}

export interface ExperimentResult {
  metrics: Record<string, number>;
  comparisons: ComparisonResult[];
  ablationResults?: AblationResult[];
  statisticalTests: StatisticalTest[];
  rawOutputPath?: string;
  history?: Record<string, number[]>;
}

export interface ComparisonResult {
  baseline: string;
  ourMethod: string;
  metrics: Record<string, { baseline: number; ours: number; improvement: number }>;
}

export interface AblationResult {
  component: string;
  metrics: Record<string, number>;
  impact: string;
}

export interface StatisticalTest {
  test: string;
  metric: string;
  pValue: number;
  significant: boolean;
  interpretation: string;
}

export interface Figure {
  id: string;
  type: 'line_plot' | 'bar_chart' | 'scatter_plot' | 'heatmap' | 'architecture' | 'table' | 'algorithm';
  title: string;
  caption: string;
  filePath: string;
  latexCode: string;
  data: any;
}

export interface PaperDraft {
  version: number;
  title: string;
  abstract: string;
  sections: PaperSection[];
  bibliography: BibliographyEntry[];
  generatedAt: string;
}

export interface PaperSection {
  name: string;
  content: string;
  subsections?: PaperSection[];
}

export interface BibliographyEntry {
  id: string;
  authors: string[];
  title: string;
  venue: string;
  year: number;
  doi?: string;
  url?: string;
}

// ============================================================================
// Main State Interface
// ============================================================================

export interface ResearchState {
  // Metadata
  id: string;
  createdAt: string;
  updatedAt: string;
  
  // Current status
  phase: ResearchPhase;
  phaseProgress: Record<ResearchPhase, number>; // 0-100
  statusMessage: string;
  error?: string;
  
  // Research intent
  intent: ResearchIntent;
  
  // Literature
  literature: {
    papers: Paper[];
    searchQueries: string[];
    lastUpdate?: string;
    summary?: string;
  };
  
  // Proposals
  proposals: ResearchProposal[];
  selectedProposalId?: string;
  
  // Experiments
  experiments: Experiment[];
  
  // Analysis
  analysis: {
    results?: ExperimentResult;
    insights: string[];
    conclusions: string[];
  };
  
  // Visualization
  figures: Figure[];
  
  // Paper
  paper: {
    drafts: PaperDraft[];
    currentDraft?: PaperDraft;
    finalPath?: string;
  };
  
  // Configuration
  config: ResearchConfig;
}

export interface ResearchConfig {
  domain: ResearchDomain;
  maxPapers: number;
  maxProposals: number;
  experimentTimeoutHours: number;
  outputLanguage: 'en' | 'zh';
  paperTemplate: 'neurips' | 'icml' | 'iclr' | 'cvpr' | 'acl' | 'ieee';
  autoConfirm: boolean;
  pauseAtPhases: ResearchPhase[];
}

// ============================================================================
// State Manager
// ============================================================================

export class StateManager {
  private statePath: string;
  private state: ResearchState;

  constructor(researchDir: string = '.research') {
    this.statePath = path.join(researchDir, 'state.json');
    this.state = this.loadOrCreate();
  }

  private getDefaultState(): ResearchState {
    return {
      id: this.generateId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      phase: 'idle',
      phaseProgress: {
        idle: 100,
        intent_clarification: 0,
        literature_retrieval: 0,
        ideation: 0,
        evaluation: 0,
        selection: 0,
        experiment_design: 0,
        experiment_execution: 0,
        data_analysis: 0,
        visualization: 0,
        paper_writing: 0,
        completed: 0,
        paused: 0,
        error: 0,
      },
      statusMessage: 'Ready to start research',
      intent: {
        domain: 'general',
        topic: '',
        problemStatement: '',
        constraints: {
          compatibilityRequirements: [],
          resourceConstraints: [],
        },
        successCriteria: [],
        evaluationBenchmarks: [],
        clarificationRounds: [],
        isConfirmed: false,
      },
      literature: {
        papers: [],
        searchQueries: [],
      },
      proposals: [],
      experiments: [],
      analysis: {
        insights: [],
        conclusions: [],
      },
      figures: [],
      paper: {
        drafts: [],
      },
      config: {
        domain: 'general',
        maxPapers: 50,
        maxProposals: 5,
        experimentTimeoutHours: 24,
        outputLanguage: 'en',
        paperTemplate: 'neurips',
        autoConfirm: false,
        pauseAtPhases: [],
      },
    };
  }

  private generateId(): string {
    return `research_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private loadOrCreate(): ResearchState {
    if (fs.existsSync(this.statePath)) {
      try {
        const data = fs.readFileSync(this.statePath, 'utf-8');
        return JSON.parse(data);
      } catch (e) {
        console.warn('Failed to load state, creating new one');
        return this.getDefaultState();
      }
    }
    return this.getDefaultState();
  }

  save(): void {
    this.state.updatedAt = new Date().toISOString();
    const dir = path.dirname(this.statePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2));
  }

  getState(): Readonly<ResearchState> {
    return this.state;
  }

  updateState(updates: Partial<ResearchState>): void {
    this.state = { ...this.state, ...updates };
    this.save();
  }

  setPhase(phase: ResearchPhase, message?: string): void {
    this.state.phase = phase;
    this.state.statusMessage = message || `Phase: ${phase}`;
    this.save();
  }

  setPhaseProgress(phase: ResearchPhase, progress: number): void {
    this.state.phaseProgress[phase] = Math.max(0, Math.min(100, progress));
    this.save();
  }

  setError(error: string): void {
    this.state.phase = 'error';
    this.state.error = error;
    this.state.statusMessage = `Error: ${error}`;
    this.save();
  }

  // Intent management
  updateIntent(updates: Partial<ResearchIntent>): void {
    this.state.intent = { ...this.state.intent, ...updates };
    this.save();
  }

  addClarificationRound(round: ClarificationRound): void {
    this.state.intent.clarificationRounds.push(round);
    this.save();
  }

  confirmIntent(): void {
    this.state.intent.isConfirmed = true;
    this.save();
  }

  // Literature management
  addPapers(papers: Paper[]): void {
    // Deduplicate by ID
    const existingIds = new Set(this.state.literature.papers.map(p => p.id));
    const newPapers = papers.filter(p => !existingIds.has(p.id));
    this.state.literature.papers.push(...newPapers);
    this.state.literature.lastUpdate = new Date().toISOString();
    this.save();
  }

  setLiteratureSummary(summary: string): void {
    this.state.literature.summary = summary;
    this.save();
  }

  // Proposal management
  addProposal(proposal: ResearchProposal): void {
    this.state.proposals.push(proposal);
    this.save();
  }

  updateProposal(id: string, updates: Partial<ResearchProposal>): void {
    const index = this.state.proposals.findIndex(p => p.id === id);
    if (index >= 0) {
      this.state.proposals[index] = { ...this.state.proposals[index], ...updates };
      this.save();
    }
  }

  selectProposal(id: string): void {
    if (this.state.proposals.some(p => p.id === id)) {
      this.state.selectedProposalId = id;
      this.save();
    }
  }

  // Experiment management
  addExperiment(experiment: Experiment): void {
    this.state.experiments.push(experiment);
    this.save();
  }

  updateExperiment(id: string, updates: Partial<Experiment>): void {
    const index = this.state.experiments.findIndex(e => e.id === id);
    if (index >= 0) {
      this.state.experiments[index] = { ...this.state.experiments[index], ...updates };
      this.save();
    }
  }

  // Analysis management
  setAnalysisResults(results: ExperimentResult): void {
    this.state.analysis.results = results;
    this.save();
  }

  addInsight(insight: string): void {
    this.state.analysis.insights.push(insight);
    this.save();
  }

  addConclusion(conclusion: string): void {
    this.state.analysis.conclusions.push(conclusion);
    this.save();
  }

  // Figure management
  addFigure(figure: Figure): void {
    this.state.figures.push(figure);
    this.save();
  }

  setFigures(figures: Figure[]): void {
    this.state.figures = figures;
    this.save();
  }

  // Paper management
  addDraft(draft: PaperDraft): void {
    this.state.paper.drafts.push(draft);
    this.state.paper.currentDraft = draft;
    this.save();
  }

  setFinalPaper(path: string): void {
    this.state.paper.finalPath = path;
    this.save();
  }

  // Configuration
  updateConfig(config: Partial<ResearchConfig>): void {
    this.state.config = { ...this.state.config, ...config };
    this.save();
  }

  // Reset
  reset(): void {
    this.state = this.getDefaultState();
    this.save();
  }
}

// Singleton instance
let stateManagerInstance: StateManager | null = null;

export function getStateManager(researchDir?: string): StateManager {
  if (!stateManagerInstance) {
    stateManagerInstance = new StateManager(researchDir);
  }
  return stateManagerInstance;
}

export function resetStateManager(): void {
  stateManagerInstance = null;
}
