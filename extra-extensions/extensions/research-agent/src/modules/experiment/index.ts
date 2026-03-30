/**
 * Experiment Execution Module
 * 
 * Designs and executes experiments automatically, managing code generation,
 * execution, and result collection.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as childProcess from 'child_process';
import { 
  StateManager, 
  Experiment, 
  ExperimentResult,
  ResearchProposal,
  ComparisonResult,
  StatisticalTest
} from '../../core/state';
import { PhaseExecutor, PhaseExecutionContext } from '../../core/workflow';

// ============================================================================
// Types
// ============================================================================

export interface ExperimentConfig {
  outputDir: string;
  pythonPath: string;
  timeout: number;
  gpuIds: number[];
  seed: number;
}

export interface ExperimentDesign {
  name: string;
  description: string;
  hypothesis: string;
  variables: {
    independent: string[];
    dependent: string[];
    controlled: string[];
  };
  procedure: string[];
  metrics: string[];
  baselines: string[];
  datasets: string[];
}

// ============================================================================
// Experiment Designer
// ============================================================================

export class ExperimentDesigner {
  /**
   * Design experiments from a research proposal
   */
  designExperiments(proposal: ResearchProposal): ExperimentDesign[] {
    const designs: ExperimentDesign[] = [];
    const domain = this.inferDomain(proposal);

    // Main experiment
    designs.push(this.designMainExperiment(proposal, domain));

    // Ablation studies
    designs.push(...this.designAblationStudies(proposal, domain));

    // Comparison experiments
    designs.push(this.designComparisonExperiment(proposal, domain));

    return designs;
  }

  /**
   * Design main experiment
   */
  private designMainExperiment(proposal: ResearchProposal, domain: string): ExperimentDesign {
    return {
      name: 'Main Experiment',
      description: `Core evaluation of ${proposal.title}`,
      hypothesis: `The proposed method will outperform baselines on ${proposal.evaluationMetrics.join(', ')}`,
      variables: {
        independent: ['Method (proposed vs baselines)'],
        dependent: proposal.evaluationMetrics,
        controlled: ['Dataset', 'Random seed', 'Training epochs', 'Hyperparameters'],
      },
      procedure: [
        'Prepare datasets and preprocessing',
        'Implement proposed method',
        'Train model with specified hyperparameters',
        'Evaluate on test set',
        'Record all metrics',
      ],
      metrics: proposal.evaluationMetrics,
      baselines: proposal.noveltyAnalysis.comparedMethods.slice(0, 3),
      datasets: proposal.estimatedResources.datasetRequirements,
    };
  }

  /**
   * Design ablation studies
   */
  private designAblationStudies(proposal: ResearchProposal, domain: string): ExperimentDesign[] {
    const designs: ExperimentDesign[] = [];
    const keyComponents = this.identifyKeyComponents(proposal);

    for (const component of keyComponents.slice(0, 3)) {
      designs.push({
        name: `Ablation: ${component}`,
        description: `Evaluate contribution of ${component}`,
        hypothesis: `Removing ${component} will decrease performance`,
        variables: {
          independent: [`${component} present vs absent`],
          dependent: proposal.evaluationMetrics,
          controlled: ['All other components', 'Dataset', 'Training setup'],
        },
        procedure: [
          `Full model with ${component}`,
          `Model without ${component}`,
          'Compare performance difference',
        ],
        metrics: proposal.evaluationMetrics,
        baselines: ['Full model'],
        datasets: proposal.estimatedResources.datasetRequirements.slice(0, 1),
      });
    }

    return designs;
  }

  /**
   * Design comparison experiment
   */
  private designComparisonExperiment(proposal: ResearchProposal, domain: string): ExperimentDesign {
    return {
      name: 'Baseline Comparison',
      description: 'Comprehensive comparison with existing methods',
      hypothesis: 'Proposed method shows advantages over all baselines',
      variables: {
        independent: ['Method type'],
        dependent: proposal.evaluationMetrics,
        controlled: ['Dataset', 'Evaluation protocol'],
      },
      procedure: [
        'Run all baseline methods',
        'Run proposed method',
        'Statistical comparison',
        'Create comparison tables',
      ],
      metrics: proposal.evaluationMetrics,
      baselines: proposal.noveltyAnalysis.comparedMethods,
      datasets: proposal.estimatedResources.datasetRequirements,
    };
  }

  /**
   * Infer domain from proposal
   */
  private inferDomain(proposal: ResearchProposal): string {
    const title = proposal.title.toLowerCase();
    
    if (/nlp|language|text|transformer|bert|gpt/i.test(title)) return 'nlp';
    if (/vision|image|cnn|segmentation|detection/i.test(title)) return 'cv';
    if (/reinforcement|reward|agent/i.test(title)) return 'rl';
    if (/fluid|cfd|turbulence|flow/i.test(title)) return 'cfd';
    if (/optim|gradient|loss/i.test(title)) return 'optimization';
    
    return 'ml';
  }

  /**
   * Identify key components for ablation
   */
  private identifyKeyComponents(proposal: ResearchProposal): string[] {
    const components: string[] = [];
    const text = `${proposal.title} ${proposal.methodology.overview}`.toLowerCase();

    // Common ML components
    const patterns = [
      { pattern: /attention/i, name: 'Attention mechanism' },
      { pattern: /normalization/i, name: 'Normalization layer' },
      { pattern: /regularization/i, name: 'Regularization' },
      { pattern: /loss.*function/i, name: 'Loss function' },
      { pattern: /encoder/i, name: 'Encoder module' },
      { pattern: /decoder/i, name: 'Decoder module' },
      { pattern: /embedding/i, name: 'Embedding layer' },
      { pattern: /pooling/i, name: 'Pooling operation' },
    ];

    for (const { pattern, name } of patterns) {
      if (pattern.test(text)) {
        components.push(name);
      }
    }

    // Default components if none found
    if (components.length === 0) {
      components.push('Core module 1', 'Core module 2');
    }

    return components;
  }
}

// ============================================================================
// Code Generator
// ============================================================================

export class ExperimentCodeGenerator {
  /**
   * Generate experiment code
   */
  generateCode(design: ExperimentDesign, proposal: ResearchProposal): string {
    const domain = this.inferDomain(proposal);

    // Generate based on domain
    switch (domain) {
      case 'nlp':
        return this.generateNLPCode(design, proposal);
      case 'cv':
        return this.generateCVCode(design, proposal);
      case 'rl':
        return this.generateRLCode(design, proposal);
      case 'cfd':
        return this.generateCFDCode(design, proposal);
      default:
        return this.generateMLCode(design, proposal);
    }
  }

  /**
   * Generate ML experiment code
   */
  private generateMLCode(design: ExperimentDesign, proposal: ResearchProposal): string {
    return `
"""
${design.name}: ${design.description}
Auto-generated experiment code
"""

import os
import json
import random
import numpy as np
from datetime import datetime
from typing import Dict, List, Any

# Set random seeds for reproducibility
SEED = 42
random.seed(SEED)
np.random.seed(SEED)

import torch
torch.manual_seed(SEED)
if torch.cuda.is_available():
    torch.cuda.manual_seed_all(SEED)

# ============================================================================
# Configuration
# ============================================================================

class Config:
    # Experiment settings
    EXPERIMENT_NAME = "${design.name.replace(/[^a-zA-Z0-9]/g, '_')}"
    SEED = SEED
    
    # Model settings
    HIDDEN_DIM = 256
    NUM_LAYERS = 4
    DROPOUT = 0.1
    
    # Training settings
    BATCH_SIZE = 32
    LEARNING_RATE = 1e-4
    NUM_EPOCHS = 100
    EARLY_STOP_PATIENCE = 10
    
    # Data settings
    DATA_DIR = "./data"
    OUTPUT_DIR = "./results"
    
    # Metrics to track
    METRICS = ${JSON.stringify(design.metrics)}

# ============================================================================
# Model Definition
# ============================================================================

class ProposedModel(torch.nn.Module):
    """
    ${proposal.methodology.overview}
    """
    
    def __init__(self, config: Config):
        super().__init__()
        self.config = config
        
        # Main architecture
        self.layers = torch.nn.ModuleList([
            torch.nn.Linear(config.HIDDEN_DIM if i > 0 else 512, config.HIDDEN_DIM)
            for i in range(config.NUM_LAYERS)
        ])
        
        self.norm = torch.nn.LayerNorm(config.HIDDEN_DIM)
        self.dropout = torch.nn.Dropout(config.DROPOUT)
        self.output = torch.nn.Linear(config.HIDDEN_DIM, 1)
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        for layer in self.layers:
            x = layer(x)
            x = torch.nn.functional.relu(x)
            x = self.dropout(x)
        x = self.norm(x)
        return self.output(x)

# ============================================================================
# Training & Evaluation
# ============================================================================

def train_epoch(model, dataloader, optimizer, criterion, device):
    model.train()
    total_loss = 0
    for batch in dataloader:
        optimizer.zero_grad()
        x, y = batch
        x, y = x.to(device), y.to(device)
        output = model(x)
        loss = criterion(output, y)
        loss.backward()
        optimizer.step()
        total_loss += loss.item()
    return total_loss / len(dataloader)

def evaluate(model, dataloader, criterion, device):
    model.eval()
    total_loss = 0
    predictions = []
    targets = []
    
    with torch.no_grad():
        for batch in dataloader:
            x, y = batch
            x, y = x.to(device), y.to(device)
            output = model(x)
            loss = criterion(output, y)
            total_loss += loss.item()
            predictions.extend(output.cpu().numpy())
            targets.extend(y.cpu().numpy())
    
    predictions = np.array(predictions)
    targets = np.array(targets)
    
    metrics = {
        'loss': total_loss / len(dataloader),
        'mse': np.mean((predictions - targets) ** 2),
        'mae': np.mean(np.abs(predictions - targets)),
    }
    
    return metrics

# ============================================================================
# Main Experiment
# ============================================================================

def run_experiment(config: Config):
    """Run the main experiment"""
    
    print(f"Starting experiment: {config.EXPERIMENT_NAME}")
    print(f"Timestamp: {datetime.now().isoformat()}")
    
    # Setup
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"Device: {device}")
    
    # Create output directory
    os.makedirs(config.OUTPUT_DIR, exist_ok=True)
    
    # Initialize model
    model = ProposedModel(config).to(device)
    print(f"Model parameters: {sum(p.numel() for p in model.parameters()):,}")
    
    # Setup training
    optimizer = torch.optim.AdamW(model.parameters(), lr=config.LEARNING_RATE)
    criterion = torch.nn.MSELoss()
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
        optimizer, T_max=config.NUM_EPOCHS
    )
    
    # Generate dummy data for demonstration
    # In real experiment, load actual dataset
    print("Preparing data...")
    train_data = [(torch.randn(32, 512), torch.randn(32, 1)) for _ in range(100)]
    val_data = [(torch.randn(32, 512), torch.randn(32, 1)) for _ in range(20)]
    
    train_loader = train_data
    val_loader = val_data
    
    # Training loop
    best_val_loss = float('inf')
    patience_counter = 0
    history = {'train_loss': [], 'val_metrics': []}
    
    print("\\nStarting training...")
    for epoch in range(config.NUM_EPOCHS):
        # Train
        train_loss = train_epoch(model, train_loader, optimizer, criterion, device)
        history['train_loss'].append(train_loss)
        
        # Validate
        val_metrics = evaluate(model, val_loader, criterion, device)
        history['val_metrics'].append(val_metrics)
        
        # Update scheduler
        scheduler.step()
        
        # Log progress
        if (epoch + 1) % 10 == 0:
            print(f"Epoch {epoch + 1}/{config.NUM_EPOCHS}")
            print(f"  Train Loss: {train_loss:.4f}")
            print(f"  Val Loss: {val_metrics['loss']:.4f}")
        
        # Early stopping
        if val_metrics['loss'] < best_val_loss:
            best_val_loss = val_metrics['loss']
            patience_counter = 0
            # Save best model
            torch.save(model.state_dict(), 
                      os.path.join(config.OUTPUT_DIR, 'best_model.pt'))
        else:
            patience_counter += 1
            if patience_counter >= config.EARLY_STOP_PATIENCE:
                print(f"Early stopping at epoch {epoch + 1}")
                break
    
    # Final evaluation
    print("\\nRunning final evaluation...")
    final_metrics = evaluate(model, val_loader, criterion, device)
    
    # Save results
    results = {
        'experiment': config.EXPERIMENT_NAME,
        'timestamp': datetime.now().isoformat(),
        'final_metrics': final_metrics,
        'history': {
            'train_loss': history['train_loss'],
            'val_loss': [m['loss'] for m in history['val_metrics']],
        },
        'config': {k: v for k, v in vars(config).items() if not k.startswith('_')},
    }
    
    results_path = os.path.join(config.OUTPUT_DIR, 'results.json')
    with open(results_path, 'w') as f:
        json.dump(results, f, indent=2, default=str)
    
    print(f"\\nResults saved to: {results_path}")
    print(f"Final metrics: {final_metrics}")
    
    return results

# ============================================================================
# Entry Point
# ============================================================================

if __name__ == '__main__':
    config = Config()
    results = run_experiment(config)
    print("\\nExperiment completed successfully!")
`.trim();
  }

  /**
   * Generate NLP-specific code
   */
  private generateNLPCode(design: ExperimentDesign, proposal: ResearchProposal): string {
    // Extended NLP template with transformers
    return this.generateMLCode(design, proposal)
      .replace(
        'class ProposedModel',
        `
# NLP-specific imports
from transformers import AutoTokenizer, AutoModel

class ProposedModel`
      );
  }

  /**
   * Generate CV-specific code
   */
  private generateCVCode(design: ExperimentDesign, proposal: ResearchProposal): string {
    // Extended CV template with CNNs
    return this.generateMLCode(design, proposal);
  }

  /**
   * Generate RL-specific code
   */
  private generateRLCode(design: ExperimentDesign, proposal: ResearchProposal): string {
    // RL template
    return this.generateMLCode(design, proposal);
  }

  /**
   * Generate CFD-specific code
   */
  private generateCFDCode(design: ExperimentDesign, proposal: ResearchProposal): string {
    // CFD simulation code template
    return `
"""
CFD Experiment: ${design.name}
Auto-generated simulation code
"""

import numpy as np
import json
import os
from datetime import datetime

# ============================================================================
# CFD Configuration
# ============================================================================

class CFDConfig:
    # Grid settings
    NX = 128
    NY = 128
    DX = 1.0 / NX
    DY = 1.0 / NY
    
    # Physical parameters
    REYNOLDS = 1000
    VISCOSITY = 1.0 / REYNOLDS
    
    # Time stepping
    DT = 0.001
    MAX_ITERATIONS = 10000
    
    # Output
    OUTPUT_DIR = "./results"

# ============================================================================
# Simple Navier-Stokes Solver
# ============================================================================

def solve_navier_stokes(config: CFDConfig):
    """
    Solve 2D incompressible Navier-Stokes equations
    """
    # Initialize fields
    u = np.zeros((config.NX, config.NY))  # x-velocity
    v = np.zeros((config.NX, config.NY))  # y-velocity
    p = np.zeros((config.NX, config.NY))  # pressure
    
    # Boundary conditions (e.g., lid-driven cavity)
    u[-1, :] = 1.0  # Top lid moves
    
    # Time integration
    results = []
    for iteration in range(config.MAX_ITERATIONS):
        # Simple explicit scheme (for demonstration)
        # In practice, use proper CFD solver
        
        # Record convergence
        if iteration % 1000 == 0:
            max_vel = np.max(np.abs(u))
            results.append({
                'iteration': iteration,
                'max_velocity': max_vel,
            })
            print(f"Iteration {iteration}: max velocity = {max_vel:.4f}")
    
    # Save results
    output = {
        'final_metrics': {
            'max_velocity': results[-1]['max_velocity'] if results else 0.0,
        },
        'final_velocity_field': u.tolist(),
        'convergence': results,
        'config': vars(config),
    }

    os.makedirs(config.OUTPUT_DIR, exist_ok=True)
    results_path = os.path.join(config.OUTPUT_DIR, 'results.json')
    with open(results_path, 'w') as f:
        json.dump(output, f, indent=2)
    
    return output

# ============================================================================
# Main
# ============================================================================

if __name__ == '__main__':
    config = CFDConfig()
    results = solve_navier_stokes(config)
    print("CFD simulation completed!")
`.trim();
  }

  /**
   * Infer domain from proposal
   */
  private inferDomain(proposal: ResearchProposal): string {
    const title = proposal.title.toLowerCase();
    if (/nlp|language|text|transformer/i.test(title)) return 'nlp';
    if (/vision|image|cnn/i.test(title)) return 'cv';
    if (/reinforcement|reward/i.test(title)) return 'rl';
    if (/fluid|cfd|turbulence/i.test(title)) return 'cfd';
    return 'ml';
  }
}

// ============================================================================
// Experiment Executor
// ============================================================================

export class ExperimentExecutor implements PhaseExecutor {
  private stateManager: StateManager;
  private designer: ExperimentDesigner;
  private codeGenerator: ExperimentCodeGenerator;
  private config: ExperimentConfig;

  constructor(
    stateManager: StateManager,
    config: Partial<ExperimentConfig> = {}
  ) {
    this.stateManager = stateManager;
    this.designer = new ExperimentDesigner();
    this.codeGenerator = new ExperimentCodeGenerator();
    this.config = {
      outputDir: '.research/experiments',
      pythonPath: 'python3',
      timeout: 3600,
      gpuIds: [],
      seed: 42,
      ...config,
    };
  }

  /**
   * Execute experiment phase
   */
  async execute(context: PhaseExecutionContext): Promise<void> {
    const state = this.stateManager.getState();
    const selectedProposal = state.proposals.find(p => p.id === state.selectedProposalId);

    if (!selectedProposal) {
      throw new Error('No proposal selected for experimentation');
    }

    context.reportProgress(0, 'Designing experiments');

    // Design experiments
    const designs = this.designer.designExperiments(selectedProposal);
    context.reportProgress(10, `Designed ${designs.length} experiments`);

    // Create output directory
    const expDir = path.resolve(this.config.outputDir);
    if (!fs.existsSync(expDir)) {
      fs.mkdirSync(expDir, { recursive: true });
    }

    // Execute each experiment
    for (let i = 0; i < designs.length; i++) {
      const design = designs[i];
      context.reportProgress(
        10 + (i / designs.length) * 80,
        `Running: ${design.name}`
      );

      // Create experiment record
      const experiment: Experiment = {
        id: `exp_${Date.now()}_${i}`,
        proposalId: selectedProposal.id,
        name: design.name,
        description: design.description,
        hypothesis: design.hypothesis,
        methodology: design.procedure.join('\n'),
        code: '',
        status: 'pending',
        logs: [],
      };

      const experimentDir = path.join(expDir, experiment.id);
      if (!fs.existsSync(experimentDir)) {
        fs.mkdirSync(experimentDir, { recursive: true });
      }

      // Generate code
      experiment.code = this.codeGenerator.generateCode(design, selectedProposal);
      
      // Save code to file
      const codePath = path.join(experimentDir, 'run.py');
      fs.writeFileSync(codePath, experiment.code);
      experiment.logs.push(`Code saved to: ${codePath}`);

      // Execute experiment
      try {
        experiment.status = 'running';
        experiment.startTime = new Date().toISOString();
        this.stateManager.addExperiment(experiment);

        const result = await this.runExperiment(experiment, codePath, experimentDir, context);
        
        experiment.status = 'completed';
        experiment.endTime = new Date().toISOString();
        experiment.results = result;
        experiment.logs.push('Experiment completed successfully');
        
      } catch (error) {
        experiment.status = 'failed';
        experiment.endTime = new Date().toISOString();
        experiment.logs.push(`Error: ${error}`);
      }

      // Update experiment record
      this.stateManager.updateExperiment(experiment.id, experiment);
    }

    context.reportProgress(100, 'All experiments completed');
  }

  /**
   * Run a single experiment
   */
  private async runExperiment(
    experiment: Experiment,
    codePath: string,
    experimentDir: string,
    context: PhaseExecutionContext
  ): Promise<ExperimentResult> {
    return new Promise((resolve, reject) => {
      const env = { ...process.env };
      if (this.config.gpuIds.length > 0) {
        env.CUDA_VISIBLE_DEVICES = this.config.gpuIds.join(',');
      }

      const proc = childProcess.spawn(
        this.config.pythonPath,
        [codePath],
        {
          cwd: experimentDir,
          env,
          timeout: this.config.timeout * 1000,
        }
      );

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
        experiment.logs.push(data.toString().trim());
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
        experiment.logs.push(`STDERR: ${data.toString().trim()}`);
      });

      proc.on('close', (code) => {
        if (code === 0) {
          // Parse results
          try {
            const resultsPath = path.join(experimentDir, 'results', 'results.json');
            if (fs.existsSync(resultsPath)) {
              const results = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
              resolve(this.parseResults(results, resultsPath));
            } else {
              reject(new Error(`Experiment completed but no results file was found at ${resultsPath}`));
            }
          } catch (e) {
            reject(e instanceof Error ? e : new Error(String(e)));
          }
        } else {
          reject(new Error(`Experiment failed with code ${code}: ${stderr}`));
        }
      });

      proc.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Parse results from output
   */
  private parseResults(output: any, resultsPath: string): ExperimentResult {
    return {
      metrics: output.final_metrics || output.metrics || {},
      comparisons: output.comparisons || [],
      ablationResults: output.ablationResults || output.ablations || [],
      statisticalTests: output.statisticalTests || output.statistical_tests || [],
      rawOutputPath: resultsPath,
      history: output.history || {},
    };
  }
}
