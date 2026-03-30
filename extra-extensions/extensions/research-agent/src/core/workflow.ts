/**
 * Research Workflow Engine
 * 
 * Orchestrates the autonomous research workflow, managing phase transitions,
 * error handling, and user interactions.
 */

import { 
  ResearchState, 
  ResearchPhase, 
  StateManager,
  ResearchProposal,
  Paper,
  Experiment
} from './state';

// ============================================================================
// Phase Definitions
// ============================================================================

interface PhaseDefinition {
  name: ResearchPhase;
  description: string;
  requiresUserInput: boolean;
  canPause: boolean;
  timeout?: number; // minutes
  dependencies: ResearchPhase[];
  onFailure: 'retry' | 'skip' | 'abort' | 'ask_user';
}

const PHASE_DEFINITIONS: Record<ResearchPhase, PhaseDefinition> = {
  idle: {
    name: 'idle',
    description: 'Waiting to start research',
    requiresUserInput: true,
    canPause: false,
    dependencies: [],
    onFailure: 'abort',
  },
  intent_clarification: {
    name: 'intent_clarification',
    description: 'Clarifying research direction with user',
    requiresUserInput: true,
    canPause: false,
    timeout: 30,
    dependencies: ['idle'],
    onFailure: 'ask_user',
  },
  literature_retrieval: {
    name: 'literature_retrieval',
    description: 'Retrieving and analyzing relevant literature',
    requiresUserInput: false,
    canPause: true,
    timeout: 60,
    dependencies: ['intent_clarification'],
    onFailure: 'retry',
  },
  ideation: {
    name: 'ideation',
    description: 'Generating innovative research proposals',
    requiresUserInput: false,
    canPause: true,
    timeout: 45,
    dependencies: ['literature_retrieval'],
    onFailure: 'retry',
  },
  evaluation: {
    name: 'evaluation',
    description: 'Multi-role evaluation of proposals',
    requiresUserInput: false,
    canPause: true,
    timeout: 30,
    dependencies: ['ideation'],
    onFailure: 'retry',
  },
  selection: {
    name: 'selection',
    description: 'Selecting the best proposal',
    requiresUserInput: false,
    canPause: true,
    dependencies: ['evaluation'],
    onFailure: 'ask_user',
  },
  experiment_design: {
    name: 'experiment_design',
    description: 'Designing experiments',
    requiresUserInput: false,
    canPause: true,
    timeout: 30,
    dependencies: ['selection'],
    onFailure: 'retry',
  },
  experiment_execution: {
    name: 'experiment_execution',
    description: 'Executing experiments and collecting results',
    requiresUserInput: false,
    canPause: true,
    timeout: 1440, // 24 hours max
    dependencies: ['experiment_design'],
    onFailure: 'retry',
  },
  data_analysis: {
    name: 'data_analysis',
    description: 'Analyzing experiment data',
    requiresUserInput: false,
    canPause: true,
    timeout: 60,
    dependencies: ['experiment_execution'],
    onFailure: 'retry',
  },
  visualization: {
    name: 'visualization',
    description: 'Creating visualizations and figures',
    requiresUserInput: false,
    canPause: true,
    timeout: 30,
    dependencies: ['data_analysis'],
    onFailure: 'retry',
  },
  paper_writing: {
    name: 'paper_writing',
    description: 'Writing the academic paper',
    requiresUserInput: false,
    canPause: true,
    timeout: 60,
    dependencies: ['visualization'],
    onFailure: 'retry',
  },
  completed: {
    name: 'completed',
    description: 'Research completed successfully',
    requiresUserInput: false,
    canPause: false,
    dependencies: ['paper_writing'],
    onFailure: 'abort',
  },
  paused: {
    name: 'paused',
    description: 'Research paused by user',
    requiresUserInput: true,
    canPause: false,
    dependencies: [],
    onFailure: 'abort',
  },
  error: {
    name: 'error',
    description: 'Error occurred in workflow',
    requiresUserInput: true,
    canPause: false,
    dependencies: [],
    onFailure: 'ask_user',
  },
};

// ============================================================================
// Workflow Events
// ============================================================================

export type WorkflowEvent = 
  | { type: 'phase_start'; phase: ResearchPhase }
  | { type: 'phase_progress'; phase: ResearchPhase; progress: number; message: string }
  | { type: 'phase_complete'; phase: ResearchPhase; result: any }
  | { type: 'phase_error'; phase: ResearchPhase; error: string }
  | { type: 'user_input_required'; phase: ResearchPhase; question: string; options?: string[] }
  | { type: 'workflow_complete'; summary: string }
  | { type: 'workflow_error'; error: string };

export type WorkflowEventHandler = (event: WorkflowEvent) => void | Promise<void>;

// ============================================================================
// Workflow Engine
// ============================================================================

export class WorkflowEngine {
  private stateManager: StateManager;
  private eventHandlers: WorkflowEventHandler[] = [];
  private currentPhasePromise: Promise<void> | null = null;
  private abortController: AbortController | null = null;
  private phaseExecutors: Map<ResearchPhase, PhaseExecutor>;

  constructor(stateManager: StateManager) {
    this.stateManager = stateManager;
    this.phaseExecutors = new Map();
  }

  // Event handling
  on(eventHandler: WorkflowEventHandler): void {
    this.eventHandlers.push(eventHandler);
  }

  off(eventHandler: WorkflowEventHandler): void {
    const index = this.eventHandlers.indexOf(eventHandler);
    if (index >= 0) {
      this.eventHandlers.splice(index, 1);
    }
  }

  private emit(event: WorkflowEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (e) {
        console.error('Error in event handler:', e);
      }
    }
  }

  // Phase executor registration
  registerExecutor(phase: ResearchPhase, executor: PhaseExecutor): void {
    this.phaseExecutors.set(phase, executor);
  }

  // Workflow control
  async start(): Promise<void> {
    const state = this.stateManager.getState();
    
    if (state.phase !== 'idle' && state.phase !== 'paused' && state.phase !== 'error') {
      throw new Error(`Cannot start workflow from phase: ${state.phase}`);
    }

    // Determine starting phase
    let startPhase: ResearchPhase = 'intent_clarification';
    
    if (state.intent.isConfirmed) {
      // Intent already confirmed, find the right phase
      startPhase = this.findNextIncompletePhase();
    }

    await this.runFromPhase(startPhase);
  }

  async pause(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.stateManager.setPhase('paused', 'Paused by user');
    this.emit({ type: 'phase_start', phase: 'paused' });
  }

  async resume(): Promise<void> {
    const state = this.stateManager.getState();
    if (state.phase !== 'paused') {
      throw new Error('Can only resume from paused state');
    }

    // Find the phase before pause
    const lastPhase = this.findLastInProgressPhase();
    await this.runFromPhase(lastPhase);
  }

  async retry(): Promise<void> {
    const state = this.stateManager.getState();
    if (state.phase !== 'error') {
      throw new Error('Can only retry from error state');
    }

    // Find the phase that failed
    const lastPhase = this.findLastInProgressPhase();
    await this.runFromPhase(lastPhase);
  }

  // Internal workflow execution
  private async runFromPhase(startPhase: ResearchPhase): Promise<void> {
    const phases = this.getPhaseSequence(startPhase);

    for (const phase of phases) {
      if (this.stateManager.getState().phase === 'paused') {
        return;
      }

      const phaseDef = PHASE_DEFINITIONS[phase];
      
      try {
        this.stateManager.setPhase(phase, phaseDef.description);
        this.emit({ type: 'phase_start', phase });

        // Check if phase requires user input
        if (phaseDef.requiresUserInput) {
          await this.executeInteractivePhase(phase);
        } else {
          await this.executeAutonomousPhase(phase);
        }

        this.stateManager.setPhaseProgress(phase, 100);
        this.emit({ type: 'phase_complete', phase, result: null });

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.emit({ type: 'phase_error', phase, error: errorMsg });

        if (phaseDef.onFailure === 'abort') {
          this.stateManager.setError(errorMsg);
          return;
        } else if (phaseDef.onFailure === 'ask_user') {
          // Will wait for user decision
          return;
        } else if (phaseDef.onFailure === 'skip') {
          continue;
        }
        // retry: continue to next iteration (handled externally)
        return;
      }
    }

    // Workflow completed
    this.stateManager.setPhase('completed', 'Research completed successfully');
    this.emit({ type: 'workflow_complete', summary: 'Research workflow completed' });
  }

  private async executeInteractivePhase(phase: ResearchPhase): Promise<void> {
    const executor = this.phaseExecutors.get(phase);
    if (!executor) {
      throw new Error(`No executor registered for phase: ${phase}`);
    }

    this.abortController = new AbortController();
    
    await executor.execute({
      signal: this.abortController.signal,
      reportProgress: (progress, message) => {
        this.stateManager.setPhaseProgress(phase, progress);
        this.emit({ type: 'phase_progress', phase, progress, message });
      },
      requestUserInput: async (question, options) => {
        return new Promise((resolve) => {
          this.emit({ type: 'user_input_required', phase, question, options });
          // The resolve will be called externally when user responds
          (executor as any).pendingResolve = resolve;
        });
      },
      stateManager: this.stateManager,
    });
  }

  private async executeAutonomousPhase(phase: ResearchPhase): Promise<void> {
    const executor = this.phaseExecutors.get(phase);
    if (!executor) {
      throw new Error(`No executor registered for phase: ${phase}`);
    }

    this.abortController = new AbortController();
    const phaseDef = PHASE_DEFINITIONS[phase];

    // Set up timeout if defined
    let timeoutId: NodeJS.Timeout | null = null;
    if (phaseDef.timeout) {
      timeoutId = setTimeout(() => {
        this.abortController?.abort();
      }, phaseDef.timeout * 60 * 1000);
    }

    try {
      await executor.execute({
        signal: this.abortController.signal,
        reportProgress: (progress, message) => {
          this.stateManager.setPhaseProgress(phase, progress);
          this.emit({ type: 'phase_progress', phase, progress, message });
        },
        requestUserInput: async (question, options) => {
          // Autonomous phases should not request user input normally
          // But we allow it for critical decisions
          return new Promise((resolve) => {
            this.emit({ type: 'user_input_required', phase, question, options });
            (executor as any).pendingResolve = resolve;
          });
        },
        stateManager: this.stateManager,
      });
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  // Helper methods
  private getPhaseSequence(fromPhase: ResearchPhase): ResearchPhase[] {
    const sequence: ResearchPhase[] = [
      'intent_clarification',
      'literature_retrieval',
      'ideation',
      'evaluation',
      'selection',
      'experiment_design',
      'experiment_execution',
      'data_analysis',
      'visualization',
      'paper_writing',
      'completed',
    ];

    const startIndex = sequence.indexOf(fromPhase);
    if (startIndex < 0) {
      return sequence;
    }
    return sequence.slice(startIndex);
  }

  private findNextIncompletePhase(): ResearchPhase {
    const progress = this.stateManager.getState().phaseProgress;
    const sequence = this.getPhaseSequence('intent_clarification');
    
    for (const phase of sequence) {
      if ((progress[phase] || 0) < 100) {
        return phase;
      }
    }
    return 'completed';
  }

  private findLastInProgressPhase(): ResearchPhase {
    const progress = this.stateManager.getState().phaseProgress;
    const sequence = this.getPhaseSequence('intent_clarification');
    
    let lastIncomplete = sequence[0];
    for (const phase of sequence) {
      if ((progress[phase] || 0) < 100) {
        lastIncomplete = phase;
      }
    }
    return lastIncomplete;
  }

  // User response handling
  handleUserResponse(response: string): void {
    // Find the current executor and resolve its pending promise
    const state = this.stateManager.getState();
    const executor = this.phaseExecutors.get(state.phase);
    
    if (executor && (executor as any).pendingResolve) {
      (executor as any).pendingResolve(response);
      (executor as any).pendingResolve = null;
    }
  }
}

// ============================================================================
// Phase Executor Interface
// ============================================================================

export interface PhaseExecutionContext {
  signal: AbortSignal;
  reportProgress: (progress: number, message: string) => void;
  requestUserInput: (question: string, options?: string[]) => Promise<string>;
  stateManager: StateManager;
}

export interface PhaseExecutor {
  execute(context: PhaseExecutionContext): Promise<void>;
}

// ============================================================================
// Workflow Status
// ============================================================================

export interface WorkflowStatus {
  phase: ResearchPhase;
  progress: number;
  message: string;
  canPause: boolean;
  canResume: boolean;
  canRetry: boolean;
  nextPhases: ResearchPhase[];
}

export function getWorkflowStatus(state: ResearchState): WorkflowStatus {
  const phaseDef = PHASE_DEFINITIONS[state.phase];
  
  return {
    phase: state.phase,
    progress: state.phaseProgress[state.phase] || 0,
    message: state.statusMessage,
    canPause: phaseDef?.canPause || false,
    canResume: state.phase === 'paused',
    canRetry: state.phase === 'error',
    nextPhases: phaseDef?.dependencies || [],
  };
}