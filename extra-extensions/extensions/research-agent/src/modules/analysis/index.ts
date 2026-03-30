/**
 * Data Analysis Module
 * 
 * Analyzes experiment results, performs statistical tests,
 * and generates insights.
 */

import { 
  StateManager, 
  ExperimentResult,
  StatisticalTest,
  ComparisonResult
} from '../../core/state';
import { PhaseExecutor, PhaseExecutionContext } from '../../core/workflow';

// ============================================================================
// Types
// ============================================================================

export interface AnalysisReport {
  summary: string;
  keyFindings: string[];
  statisticalSummary: StatisticalSummary[];
  recommendations: string[];
}

export interface StatisticalSummary {
  metric: string;
  mean: number;
  std: number;
  min: number;
  max: number;
  confidenceInterval: [number, number];
}

// ============================================================================
// Data Analyzer
// ============================================================================

export class DataAnalyzer implements PhaseExecutor {
  private stateManager: StateManager;

  constructor(stateManager: StateManager) {
    this.stateManager = stateManager;
  }

  /**
   * Execute analysis phase
   */
  async execute(context: PhaseExecutionContext): Promise<void> {
    const state = this.stateManager.getState();
    const experiments = state.experiments.filter(e => e.status === 'completed');

    if (experiments.length === 0) {
      throw new Error('No completed experiments to analyze');
    }

    context.reportProgress(0, 'Collecting experiment results');

    // Aggregate results
    const allResults = experiments.map(e => e.results).filter(Boolean) as ExperimentResult[];
    context.reportProgress(20, 'Performing statistical analysis');

    // Statistical analysis
    const statsSummary = this.computeStatistics(allResults);
    context.reportProgress(40, 'Analyzing comparisons');

    // Comparison analysis
    const comparisons = this.analyzeComparisons(allResults);
    context.reportProgress(60, 'Generating insights');

    // Generate insights
    const insights = this.generateInsights(allResults, statsSummary);
    context.reportProgress(80, 'Creating analysis report');

    // Create report
    const report = this.createReport(statsSummary, comparisons, insights);

    // Store results
    if (allResults.length > 0) {
      this.stateManager.setAnalysisResults(allResults[0]);
    }
    insights.forEach(i => this.stateManager.addInsight(i));

    context.reportProgress(100, 'Analysis complete');

    console.log('\n' + report.summary);
  }

  /**
   * Compute statistical summaries
   */
  private computeStatistics(results: ExperimentResult[]): StatisticalSummary[] {
    const summaries: StatisticalSummary[] = [];
    
    // Extract all metrics
    const metricsMap: Record<string, number[]> = {};
    
    for (const result of results) {
      for (const [key, value] of Object.entries(result.metrics)) {
        if (typeof value === 'number') {
          if (!metricsMap[key]) {
            metricsMap[key] = [];
          }
          metricsMap[key].push(value);
        }
      }
    }

    // Compute statistics for each metric
    for (const [metric, values] of Object.entries(metricsMap)) {
      if (values.length > 0) {
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
        const std = Math.sqrt(variance);
        const min = Math.min(...values);
        const max = Math.max(...values);
        
        // 95% confidence interval (simplified)
        const ciWidth = 1.96 * std / Math.sqrt(values.length);
        
        summaries.push({
          metric,
          mean,
          std,
          min,
          max,
          confidenceInterval: [mean - ciWidth, mean + ciWidth],
        });
      }
    }

    return summaries;
  }

  /**
   * Analyze comparisons
   */
  private analyzeComparisons(results: ExperimentResult[]): ComparisonResult[] {
    const allComparisons: ComparisonResult[] = [];
    
    for (const result of results) {
      if (result.comparisons) {
        allComparisons.push(...result.comparisons);
      }
    }

    return allComparisons;
  }

  /**
   * Generate insights from results
   */
  private generateInsights(
    results: ExperimentResult[],
    stats: StatisticalSummary[]
  ): string[] {
    const insights: string[] = [];

    // Overall performance
    const accuracyStats = stats.find(s => s.metric === 'accuracy');
    if (accuracyStats) {
      if (accuracyStats.mean > 0.85) {
        insights.push('Excellent overall performance with accuracy above 85%');
      } else if (accuracyStats.mean > 0.75) {
        insights.push('Good overall performance with accuracy above 75%');
      } else {
        insights.push('Moderate performance; consider further optimization');
      }
    }

    // Improvement analysis
    for (const result of results) {
      for (const comp of result.comparisons || []) {
        for (const [metric, values] of Object.entries(comp.metrics)) {
          if (values.improvement > 5) {
            insights.push(`Significant improvement in ${metric}: +${values.improvement.toFixed(1)}% over ${comp.baseline}`);
          } else if (values.improvement > 0) {
            insights.push(`Modest improvement in ${metric}: +${values.improvement.toFixed(1)}% over ${comp.baseline}`);
          }
        }
      }
    }

    // Ablation insights
    for (const result of results) {
      for (const ablation of result.ablationResults || []) {
        if (ablation.impact) {
          insights.push(`Ablation study: ${ablation.impact}`);
        }
      }
    }

    // Statistical significance
    for (const result of results) {
      for (const test of result.statisticalTests || []) {
        if (test.significant) {
          insights.push(`${test.metric}: ${test.interpretation}`);
        }
      }
    }

    // Default insight if none generated
    if (insights.length === 0) {
      insights.push('Results collected successfully; detailed analysis pending further experiments');
    }

    return insights;
  }

  /**
   * Create analysis report
   */
  private createReport(
    stats: StatisticalSummary[],
    comparisons: ComparisonResult[],
    insights: string[]
  ): AnalysisReport {
    const keyFindings = insights.slice(0, 5);
    
    const recommendations = this.generateRecommendations(stats, comparisons);

    const summary = `
## Data Analysis Report

### Statistical Summary
${stats.map(s => 
  `- ${s.metric}: ${s.mean.toFixed(3)} ± ${s.std.toFixed(3)} (95% CI: [${s.confidenceInterval[0].toFixed(3)}, ${s.confidenceInterval[1].toFixed(3)}])`
).join('\n')}

### Key Findings
${keyFindings.map(f => `- ${f}`).join('\n')}

### Recommendations
${recommendations.map(r => `- ${r}`).join('\n')}
`.trim();

    return {
      summary,
      keyFindings,
      statisticalSummary: stats,
      recommendations,
    };
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    stats: StatisticalSummary[],
    comparisons: ComparisonResult[]
  ): string[] {
    const recommendations: string[] = [];

    // Based on variance
    for (const s of stats) {
      const cv = s.std / s.mean; // Coefficient of variation
      if (cv > 0.1) {
        recommendations.push(`High variance in ${s.metric}; consider more stable training or ensemble methods`);
      }
    }

    // Based on comparisons
    for (const comp of comparisons) {
      for (const [metric, values] of Object.entries(comp.metrics)) {
        if (values.improvement < 2) {
          recommendations.push(`Small improvement in ${metric}; explore additional techniques for larger gains`);
        }
      }
    }

    // Default recommendations
    if (recommendations.length === 0) {
      recommendations.push('Results show promising performance; proceed to visualization and paper writing');
      recommendations.push('Consider additional experiments with different hyperparameters');
    }

    return recommendations;
  }
}