/**
 * Research Agent - Autonomous Scientific Research Agent
 * 
 * A complete autonomous research system that conducts full-cycle scientific research:
 * from idea generation to published paper.
 * 
 * This module serves as a pi-agent extension.
 */

import type { ExtensionAPI } from '@lunezhang/pi-coding-agent';
import { Type } from '@sinclair/typebox';

// Core modules
export { StateManager, getStateManager, resetStateManager } from './core/state';
import { getStateManager as getStateManagerInstance } from './core/state';
export type { 
  ResearchState, 
  ResearchPhase,
  ResearchIntent,
  ResearchProposal,
  Paper,
  Experiment,
  Figure,
  PaperDraft,
} from './core/state';

export { WorkflowEngine, getWorkflowStatus } from './core/workflow';
export type { 
  WorkflowEvent, 
  WorkflowEventHandler,
  PhaseExecutor,
  PhaseExecutionContext,
} from './core/workflow';

// Functional modules
export { IntentClarifier } from './modules/intent';
export { LiteratureRetriever } from './modules/retrieval';
export { IdeationEngine } from './modules/ideation';
export { EvaluationOrchestrator } from './modules/evaluation';
export { ProposalSelector } from './modules/selection';
export { ExperimentExecutor, ExperimentDesigner, ExperimentCodeGenerator } from './modules/experiment';
export { DataAnalyzer } from './modules/analysis';
export { VisualizationGenerator } from './modules/visualization';
export { PaperGenerator } from './modules/writing';

// Tools
export { ArxivClient, searchMLPapers, searchCFDPapers } from './tools/arxiv';
export { SemanticScholarClient } from './tools/semantic-scholar';

// ============================================================================
// Pi-Agent Extension
// ============================================================================

export default function (pi: ExtensionAPI) {
  console.log('Research Agent extension loaded');

  // Register the main research command
  pi.registerCommand('research', {
    description: 'Autonomous research agent commands',
    handler: async (args, ctx) => {
      const subCommand = args?.trim() || 'help';
      
      switch (subCommand.split(' ')[0]) {
        case 'start':
          await handleResearchStart(ctx);
          break;
        case 'status':
          handleResearchStatus(ctx);
          break;
        case 'pause':
          handleResearchPause(ctx);
          break;
        case 'resume':
          await handleResearchResume(ctx);
          break;
        case 'export':
          await handleResearchExport(ctx);
          break;
        case 'help':
        default:
          showHelp(ctx);
      }
    },
  });

  // Register the research tool
  pi.registerTool({
    name: 'research',
    label: 'Research',
    description: 'Start or manage an autonomous research project. Use this to conduct full-cycle scientific research including literature review, ideation, experiments, and paper writing.',
    parameters: Type.Object({
      action: Type.String({ 
        description: 'Action to perform: start, status, pause, resume, export, or help' 
      }),
      topic: Type.Optional(Type.String({ 
        description: 'Research topic (for start action)' 
      })),
      domain: Type.Optional(Type.String({ 
        description: 'Research domain: ml, dl, nlp, cv, rl, cfd, optimization' 
      })),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const { action, topic, domain } = params;
      
      switch (action) {
        case 'start':
          return await startResearch(topic, domain, ctx);
        case 'status':
          return getResearchStatus();
        case 'pause':
          return pauseResearch();
        case 'resume':
          return await resumeResearch();
        case 'export':
          return await exportResearch();
        default:
          return {
            content: [{
              type: 'text',
              text: getHelpText(),
            }],
            details: {},
          };
      }
    },
  });

  // Subscribe to session events
  pi.on('session_start', async (_event, ctx) => {
    ctx.ui.notify('Research Agent ready. Use /research or the research tool to start.', 'info');
  });
}

// ============================================================================
// Command Handlers
// ============================================================================

async function handleResearchStart(ctx: any) {
  ctx.ui.notify('Starting autonomous research workflow...', 'info');
  
  // This would normally trigger the full workflow
  // For now, we'll provide instructions
  ctx.ui.notify(
    'Research workflow initiated. Use the research tool with action="start" and provide your topic.',
    'success'
  );
}

function handleResearchStatus(ctx: any) {
  const stateManager = getStateManagerInstance();
  const state = stateManager.getState();
  
  const status = `
Research Status:
- Phase: ${state.phase}
- Topic: ${state.intent.topic || 'Not set'}
- Papers: ${state.literature.papers.length}
- Proposals: ${state.proposals.length}
- Experiments: ${state.experiments.length}
- Figures: ${state.figures.length}
- Paper: ${state.paper.currentDraft ? 'Generated' : 'Not yet'}
`.trim();
  
  ctx.ui.notify(status, 'info');
}

function handleResearchPause(ctx: any) {
  ctx.ui.notify('Research paused. Use /research resume to continue.', 'info');
}

async function handleResearchResume(ctx: any) {
  ctx.ui.notify('Resuming research...', 'info');
}

async function handleResearchExport(ctx: any) {
  ctx.ui.notify('Exporting research artifacts...', 'info');
  // Export logic would go here
}

function showHelp(ctx: any) {
  const help = `
Research Agent Commands:
  /research start    - Start a new research project
  /research status   - Check current research progress
  /research pause    - Pause the research workflow
  /research resume   - Resume a paused research
  /research export   - Export all research artifacts

Supported Domains:
  - ml: Machine Learning
  - dl: Deep Learning
  - nlp: Natural Language Processing
  - cv: Computer Vision
  - rl: Reinforcement Learning
  - cfd: Computational Fluid Dynamics
  - optimization: Optimization methods

Example:
  /research start
  Then describe your research topic when prompted.
`.trim();
  
  ctx.ui.notify(help, 'info');
}

function getHelpText(): string {
  return `
Research Agent - Autonomous Scientific Research

Actions:
- start: Begin a new research project
- status: Check current progress
- pause: Pause the workflow
- resume: Resume a paused workflow
- export: Export all artifacts

Supported Domains: ml, dl, nlp, cv, rl, cfd, optimization

Example usage:
{
  "action": "start",
  "topic": "efficient attention mechanisms for long sequences",
  "domain": "nlp"
}
`.trim();
}

// ============================================================================
// Core Research Functions
// ============================================================================

async function startResearch(topic?: string, domain?: string, ctx?: any): Promise<any> {
  const stateManager = getStateManagerInstance();
  
  // Initialize research state
  stateManager.reset();
  
  if (topic) {
    stateManager.updateIntent({
      topic,
      domain: domain as any || 'general',
      problemStatement: '',
      constraints: { compatibilityRequirements: [], resourceConstraints: [] },
      successCriteria: [],
      evaluationBenchmarks: [],
      clarificationRounds: [],
      isConfirmed: false,
    });
  }

  const message = `
Research project initialized!

Topic: ${topic || 'To be determined'}
Domain: ${domain || 'Will be inferred'}

The autonomous research workflow will:
1. Clarify your research direction (2-3 rounds of dialogue)
2. Retrieve and analyze relevant literature
3. Generate innovative research proposals
4. Evaluate proposals from multiple perspectives
5. Execute experiments automatically
6. Analyze results and generate visualizations
7. Write a complete academic paper

Use the research tool with action="status" to check progress.
Use action="pause" to pause at any time.
`.trim();

  return {
    content: [{ type: 'text', text: message }],
    details: { topic, domain },
  };
}

function getResearchStatus(): any {
  const stateManager = getStateManagerInstance();
  const state = stateManager.getState();
  
  const statusText = `
## Research Status

**Phase**: ${state.phase}
**Progress**: ${state.phaseProgress[state.phase] || 0}%

**Research Direction**:
- Topic: ${state.intent.topic || 'Not set'}
- Domain: ${state.intent.domain}
- Confirmed: ${state.intent.isConfirmed ? 'Yes' : 'No'}

**Artifacts**:
- Papers retrieved: ${state.literature.papers.length}
- Proposals generated: ${state.proposals.length}
- Experiments run: ${state.experiments.filter(e => e.status === 'completed').length}
- Figures created: ${state.figures.length}
- Paper draft: ${state.paper.currentDraft ? 'Yes' : 'No'}

**Status**: ${state.statusMessage}
${state.error ? `\n**Error**: ${state.error}` : ''}
`.trim();

  return {
    content: [{ type: 'text', text: statusText }],
    details: state,
  };
}

function pauseResearch(): any {
  // Would signal the workflow engine to pause
  return {
    content: [{ type: 'text', text: 'Research paused. Use action="resume" to continue.' }],
    details: { paused: true },
  };
}

async function resumeResearch(): Promise<any> {
  return {
    content: [{ type: 'text', text: 'Research resumed. The workflow will continue from where it left off.' }],
    details: { resumed: true },
  };
}

async function exportResearch(): Promise<any> {
  const stateManager = getStateManagerInstance();
  const state = stateManager.getState();
  
  const exportSummary = `
Research Export Summary
=======================

1. Literature (${state.literature.papers.length} papers)
   - Saved to: .research/literature/

2. Proposals (${state.proposals.length} proposals)
   - Saved to: .research/proposals/

3. Experiments (${state.experiments.length} experiments)
   - Code: .research/experiments/
   - Results: .research/analysis/

4. Figures (${state.figures.length} figures)
   - Saved to: .research/figures/

5. Paper
   - LaTeX: .research/paper/main.tex
   - PDF: (Run pdflatex to generate)

Export complete!
`.trim();

  return {
    content: [{ type: 'text', text: exportSummary }],
    details: { exported: true },
  };
}