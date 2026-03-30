import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
  StateManager,
  Figure,
  Experiment,
} from '../../core/state';
import { PhaseExecutor, PhaseExecutionContext } from '../../core/workflow';

export interface VisualizationConfig {
  outputDir: string;
  format: 'png' | 'pdf' | 'svg' | 'tex';
  dpi: number;
  style: 'default' | 'paper' | 'presentation';
  pythonPath: string;
}

interface FigureSeriesSpec {
  name: string;
  values: number[];
}

interface FigureSpec {
  id: string;
  type: Figure['type'];
  title: string;
  caption: string;
  outputPath: string;
  labels?: string[];
  series?: FigureSeriesSpec[];
  yLabel?: string;
  headers?: string[];
  rows?: string[][];
}

export class VisualizationGenerator implements PhaseExecutor {
  private stateManager: StateManager;
  private config: VisualizationConfig;

  constructor(
    stateManager: StateManager,
    config: Partial<VisualizationConfig> = {}
  ) {
    this.stateManager = stateManager;
    this.config = {
      outputDir: '.research/figures',
      format: 'tex',
      dpi: 300,
      style: 'paper',
      pythonPath: 'python3',
      ...config,
    };
  }

  async execute(context: PhaseExecutionContext): Promise<void> {
    const state = this.stateManager.getState();
    const experiments = state.experiments.filter(
      experiment => experiment.status === 'completed' && experiment.results
    );

    if (experiments.length === 0) {
      throw new Error('No completed experiments with results to visualize');
    }

    context.reportProgress(0, 'Preparing visualization assets from experiment outputs');

    const outputDir = path.resolve(this.config.outputDir);

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const figureSpecs = this.buildFigureSpecs(experiments);
    if (figureSpecs.length === 0) {
      throw new Error('Experiment outputs do not contain enough real metric/history data to generate figures');
    }

    const specsPath = path.join(outputDir, 'figure_specs.json');
    const scriptPath = path.join(outputDir, 'generate_figures.py');
    fs.writeFileSync(specsPath, JSON.stringify(figureSpecs, null, 2));
    fs.writeFileSync(scriptPath, this.generateVisualizationScript());

    context.reportProgress(35, 'Executing visualization script');
    this.runVisualizationScript(scriptPath, specsPath);

    context.reportProgress(70, 'Verifying generated figure assets');
    const figures = figureSpecs
      .filter(spec => fs.existsSync(spec.outputPath))
      .map(spec => this.toFigure(spec));

    if (figures.length === 0) {
      throw new Error('Visualization script finished without creating any referenced figure files');
    }

    this.stateManager.setFigures(figures);
    context.reportProgress(100, `Visualization complete with ${figures.length} figure assets`);
  }

  private buildFigureSpecs(experiments: Experiment[]): FigureSpec[] {
    const specs: FigureSpec[] = [];

    const metricFigure = this.buildMetricOverviewFigure(experiments);
    if (metricFigure) {
      specs.push(metricFigure);
    }

    const trainingFigure = this.buildTrainingCurveFigure(experiments);
    if (trainingFigure) {
      specs.push(trainingFigure);
    }

    const ablationFigure = this.buildAblationFigure(experiments);
    if (ablationFigure) {
      specs.push(ablationFigure);
    }

    const tableFigure = this.buildResultsTable(experiments);
    if (tableFigure) {
      specs.push(tableFigure);
    }

    return specs;
  }

  private buildMetricOverviewFigure(experiments: Experiment[]): FigureSpec | null {
    const commonMetric = this.getSharedMetric(experiments);
    if (commonMetric) {
      const points = experiments
        .filter(experiment => typeof experiment.results?.metrics?.[commonMetric] === 'number')
        .map(experiment => ({
          label: this.shortenLabel(experiment.name),
          value: experiment.results!.metrics[commonMetric],
        }));

      if (points.length > 0) {
        return {
          id: 'fig_metric_overview',
          type: 'bar_chart',
          title: 'Experiment Metric Overview',
          caption: `Bar chart of the shared experiment metric ${commonMetric.replace(/_/g, ' ')} across completed runs.`,
          outputPath: this.resolveOutputPath('fig_metric_overview.tex'),
          labels: points.map(point => point.label),
          series: [{ name: commonMetric, values: points.map(point => point.value) }],
          yLabel: commonMetric,
        };
      }
    }

    const fallbackExperiment = experiments.find(experiment => Object.keys(experiment.results?.metrics || {}).length > 0);
    if (!fallbackExperiment) {
      return null;
    }

    const metricEntries = Object.entries(fallbackExperiment.results?.metrics || {})
      .filter(([, value]) => typeof value === 'number')
      .slice(0, 6);

    if (metricEntries.length === 0) {
      return null;
    }

    return {
      id: 'fig_metric_overview',
      type: 'bar_chart',
      title: 'Metric Overview',
      caption: `Bar chart of reported metrics from ${fallbackExperiment.name}.`,
      outputPath: this.resolveOutputPath('fig_metric_overview.tex'),
      labels: metricEntries.map(([metric]) => metric.replace(/_/g, ' ')),
      series: [{
        name: fallbackExperiment.name,
        values: metricEntries.map(([, value]) => value),
      }],
      yLabel: 'metric value',
    };
  }

  private buildTrainingCurveFigure(experiments: Experiment[]): FigureSpec | null {
    for (const experiment of experiments) {
      const history = experiment.results?.history || {};
      const candidateSeries = Object.entries(history)
        .filter(([, values]) => Array.isArray(values) && values.length > 1)
        .slice(0, 2)
        .map(([name, values]) => ({
          name,
          values: this.downsample(values),
        }));

      if (candidateSeries.length > 0) {
        return {
          id: 'fig_training_curves',
          type: 'line_plot',
          title: 'Training Curves',
          caption: `Training history extracted from ${experiment.name}.`,
          outputPath: this.resolveOutputPath('fig_training_curves.tex'),
          labels: candidateSeries[0].values.map((_, index) => `${index + 1}`),
          series: candidateSeries,
          yLabel: 'value',
        };
      }
    }

    return null;
  }

  private buildAblationFigure(experiments: Experiment[]): FigureSpec | null {
    for (const experiment of experiments) {
      const ablationResults = experiment.results?.ablationResults || [];
      if (ablationResults.length > 0) {
        const metric = this.getMetricFromObjects(ablationResults.map(result => result.metrics));
        if (!metric) {
          continue;
        }

        const labels = ['full model', ...ablationResults.map(result => this.shortenLabel(result.component))];
        const values = [experiment.results?.metrics?.[metric] || 0, ...ablationResults.map(result => result.metrics[metric] || 0)];

        return {
          id: 'fig_ablation',
          type: 'bar_chart',
          title: 'Ablation Study',
          caption: `Ablation view for ${metric.replace(/_/g, ' ')} derived from ${experiment.name}.`,
          outputPath: this.resolveOutputPath('fig_ablation.tex'),
          labels,
          series: [{ name: metric, values }],
          yLabel: metric,
        };
      }
    }

    const ablationExperiments = experiments.filter(experiment => /^ablation:/i.test(experiment.name));
    const referenceExperiment = experiments.find(experiment => !/^ablation:/i.test(experiment.name));
    const sharedMetric = this.getSharedMetric(referenceExperiment ? [referenceExperiment, ...ablationExperiments] : ablationExperiments);

    if (!referenceExperiment || ablationExperiments.length === 0 || !sharedMetric) {
      return null;
    }

    const labels = [this.shortenLabel(referenceExperiment.name), ...ablationExperiments.map(experiment => this.shortenLabel(experiment.name.replace(/^ablation:/i, '').trim()))];
    const values = [
      referenceExperiment.results?.metrics?.[sharedMetric] || 0,
      ...ablationExperiments.map(experiment => experiment.results?.metrics?.[sharedMetric] || 0),
    ];

    return {
      id: 'fig_ablation',
      type: 'bar_chart',
      title: 'Ablation Study',
      caption: `Ablation-style comparison using the shared metric ${sharedMetric.replace(/_/g, ' ')}.`,
      outputPath: this.resolveOutputPath('fig_ablation.tex'),
      labels,
      series: [{ name: sharedMetric, values }],
      yLabel: sharedMetric,
    };
  }

  private buildResultsTable(experiments: Experiment[]): FigureSpec | null {
    const metricNames = this.collectMetricNames(experiments).slice(0, 4);
    if (metricNames.length === 0) {
      return null;
    }

    const rows = experiments.slice(0, 6).map(experiment => {
      return [
        this.escapeTableCell(this.shortenLabel(experiment.name, 28)),
        ...metricNames.map(metric => this.formatMetricValue(experiment.results?.metrics?.[metric])),
      ];
    });

    return {
      id: 'table_experiment_metrics',
      type: 'table',
      title: 'Experiment Metrics',
      caption: 'Tabulated metrics extracted from completed experiment outputs.',
      outputPath: this.resolveOutputPath('table_experiment_metrics.tex'),
      headers: ['Experiment', ...metricNames.map(metric => metric.replace(/_/g, ' '))],
      rows,
    };
  }

  private toFigure(spec: FigureSpec): Figure {
    const relativePath = `../figures/${path.basename(spec.outputPath)}`;
    const latexCode = spec.type === 'table'
      ? [
          '\\begin{table}[t]',
          '\\centering',
          `\\input{${relativePath}}`,
          `\\caption{${this.escapeLatex(spec.caption)}}`,
          `\\label{${this.getLatexLabel(spec)}}`,
          '\\end{table}',
        ].join('\n')
      : [
          '\\begin{figure}[t]',
          '\\centering',
          `\\input{${relativePath}}`,
          `\\caption{${this.escapeLatex(spec.caption)}}`,
          `\\label{${this.getLatexLabel(spec)}}`,
          '\\end{figure}',
        ].join('\n');

    return {
      id: spec.id,
      type: spec.type,
      title: spec.title,
      caption: spec.caption,
      filePath: spec.outputPath,
      latexCode,
      data: {
        labels: spec.labels,
        series: spec.series,
        headers: spec.headers,
        rows: spec.rows,
      },
    };
  }

  private runVisualizationScript(scriptPath: string, specsPath: string): void {
    const result = childProcess.spawnSync(this.config.pythonPath, [scriptPath, specsPath], {
      encoding: 'utf-8',
      cwd: path.resolve(this.config.outputDir),
    });

    if (result.status !== 0) {
      throw new Error(
        `Visualization generation failed: ${(result.stderr || result.stdout || 'unknown python error').trim()}`
      );
    }
  }

  private getSharedMetric(experiments: Experiment[]): string | null {
    const metricSets = experiments
      .map(experiment => new Set(Object.keys(experiment.results?.metrics || {}).filter(key => typeof experiment.results?.metrics?.[key] === 'number')))
      .filter(set => set.size > 0);

    if (metricSets.length === 0) {
      return null;
    }

    const [firstSet, ...rest] = metricSets;
    const sharedMetrics = Array.from(firstSet).filter(metric => rest.every(set => set.has(metric)));
    if (sharedMetrics.length > 0) {
      return sharedMetrics[0];
    }

    return Array.from(firstSet)[0] || null;
  }

  private collectMetricNames(experiments: Experiment[]): string[] {
    const metricNames = new Set<string>();
    for (const experiment of experiments) {
      for (const [metric, value] of Object.entries(experiment.results?.metrics || {})) {
        if (typeof value === 'number') {
          metricNames.add(metric);
        }
      }
    }

    return Array.from(metricNames);
  }

  private getMetricFromObjects(metricObjects: Array<Record<string, number>>): string | null {
    for (const metricObject of metricObjects) {
      for (const [metric, value] of Object.entries(metricObject)) {
        if (typeof value === 'number') {
          return metric;
        }
      }
    }

    return null;
  }

  private downsample(values: number[], maxPoints: number = 40): number[] {
    if (values.length <= maxPoints) {
      return values;
    }

    const sampled: number[] = [];
    for (let index = 0; index < maxPoints; index++) {
      const sourceIndex = Math.round(index * (values.length - 1) / (maxPoints - 1));
      sampled.push(values[sourceIndex]);
    }

    return sampled;
  }

  private shortenLabel(label: string, limit: number = 18): string {
    return label.length > limit ? `${label.slice(0, limit - 3)}...` : label;
  }

  private resolveOutputPath(fileName: string): string {
    return path.resolve(this.config.outputDir, fileName);
  }

  private formatMetricValue(value: number | undefined): string {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return '--';
    }

    return Math.abs(value) >= 10 ? value.toFixed(2) : value.toFixed(4);
  }

  private escapeLatex(text: string): string {
    return text
      .replace(/\\/g, '\\textbackslash{}')
      .replace(/([_%$&#{}])/g, '\\$1')
      .replace(/\^/g, '\\textasciicircum{}')
      .replace(/~/g, '\\textasciitilde{}');
  }

  private escapeTableCell(text: string): string {
    return this.escapeLatex(text);
  }

  private getLatexLabel(spec: FigureSpec): string {
    return spec.type === 'table' ? 'tab:experiment_metrics' : `fig:${spec.id.replace(/^fig_/, '')}`;
  }

  private generateVisualizationScript(): string {
    return String.raw`
import json
import math
import os
import sys

def tex_escape(text):
    return (text or '') \
        .replace('\\', '\\\\textbackslash{}') \
        .replace('_', '\\_') \
        .replace('%', '\\%') \
        .replace('&', '\\&') \
        .replace('#', '\\#') \
        .replace('{', '\\{') \
        .replace('}', '\\}') \
        .replace('$', '\\$')

def ensure_parent(path):
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)

def write_bar_chart(spec):
    series = spec.get('series') or []
    labels = spec.get('labels') or []
    values = []
    for item in series:
        values.extend(item.get('values') or [])
    if not values:
        return

    max_value = max(values)
    min_value = min(values)
    lower_bound = min(0.0, min_value)
    upper_bound = max_value if max_value > lower_bound else lower_bound + 1.0
    plot_width = 96
    plot_height = 54
    left = 16
    bottom = 14
    bar_count = max(1, len(labels))
    bar_width = max(6, int(plot_width / max(bar_count * 2, 2)))
    gap = bar_width
    lines = [
        '\\setlength{\\unitlength}{1mm}',
        '\\begin{picture}(120,78)',
        f'\\put({left},{bottom}){{\\vector(1,0){{{plot_width + 6}}}}}',
        f'\\put({left},{bottom}){{\\vector(0,1){{{plot_height + 6}}}}}',
    ]

    for tick in range(5):
        fraction = tick / 4
        y = bottom + int(fraction * plot_height)
        value = lower_bound + (upper_bound - lower_bound) * fraction
        lines.append(f'\\put({left - 2},{y}){{\\line(1,0){{2}}}}')
        lines.append(f'\\put(0,{y - 1}){{\\makebox({left - 4},0)[r]{{\\scriptsize {value:.2f}}}}}')

    for index, value in enumerate(values):
        x = left + gap // 2 + index * (bar_width + gap)
        normalized = 0 if upper_bound == lower_bound else (value - lower_bound) / (upper_bound - lower_bound)
        height = max(1, int(normalized * plot_height))
        label = labels[index] if index < len(labels) else f'item {index + 1}'
        lines.append(f'\\put({x},{bottom}){{\\rule{{{bar_width}mm}}{{{height}mm}}}}')
        lines.append(f'\\put({x + bar_width // 2},{bottom - 3}){{\\makebox(0,0)[t]{{\\scriptsize {tex_escape(label)}}}}}')
        lines.append(f'\\put({x + bar_width // 2},{bottom + height + 2}){{\\makebox(0,0)[b]{{\\scriptsize {value:.3f}}}}}')

    y_label = tex_escape(spec.get('yLabel') or 'value')
    lines.append(f'\\put(3,{bottom + plot_height // 2}){{\\makebox(0,0)[b]{{\\scriptsize {y_label}}}}}')
    lines.append('\\end{picture}')

    ensure_parent(spec['outputPath'])
    with open(spec['outputPath'], 'w', encoding='utf-8') as handle:
        handle.write('\n'.join(lines))

def write_line_chart(spec):
    series = spec.get('series') or []
    if not series:
        return

    values = []
    for item in series:
        values.extend(item.get('values') or [])
    if not values:
        return

    max_len = max(len(item.get('values') or []) for item in series)
    if max_len < 2:
        return

    min_value = min(values)
    max_value = max(values)
    if min_value == max_value:
        max_value = min_value + 1.0

    left = 16
    bottom = 14
    plot_width = 96
    plot_height = 54
    lines = [
        '\\setlength{\\unitlength}{1mm}',
        '\\begin{picture}(120,78)',
        f'\\put({left},{bottom}){{\\vector(1,0){{{plot_width + 6}}}}}',
        f'\\put({left},{bottom}){{\\vector(0,1){{{plot_height + 6}}}}}',
    ]

    for tick in range(5):
        fraction = tick / 4
        y = bottom + int(fraction * plot_height)
        value = min_value + (max_value - min_value) * fraction
        lines.append(f'\\put({left - 2},{y}){{\\line(1,0){{2}}}}')
        lines.append(f'\\put(0,{y - 1}){{\\makebox({left - 4},0)[r]{{\\scriptsize {value:.2f}}}}}')

    for offset, item in enumerate(series):
        points = []
        item_values = item.get('values') or []
        for index, value in enumerate(item_values):
            x = left + int(index * plot_width / max(1, len(item_values) - 1))
            y = bottom + int((value - min_value) * plot_height / (max_value - min_value))
            points.append((x, y))
        for idx in range(len(points) - 1):
            x1, y1 = points[idx]
            x2, y2 = points[idx + 1]
            xc = int((x1 + x2) / 2)
            yc = int((y1 + y2) / 2)
            lines.append(f'\\qbezier({x1},{y1})({xc},{yc})({x2},{y2})')
        for x, y in points:
            lines.append(f'\\put({x},{y}){{\\circle*{{1.2}}}}')
        legend_y = bottom + plot_height + 5 - offset * 4
        lines.append(f'\\put({left + 4},{legend_y}){{\\makebox(0,0)[l]{{\\scriptsize {tex_escape(item.get("name") or "series")}}}}}')

    lines.append(f'\\put({left + plot_width // 2},{bottom - 6}){{\\makebox(0,0)[t]{{\\scriptsize step}}}}')
    lines.append('\\end{picture}')

    ensure_parent(spec['outputPath'])
    with open(spec['outputPath'], 'w', encoding='utf-8') as handle:
        handle.write('\n'.join(lines))

def write_table(spec):
    headers = spec.get('headers') or []
    rows = spec.get('rows') or []
    if not headers:
        return

    column_spec = 'l' + 'c' * max(0, len(headers) - 1)
    lines = [
        f'\\begin{{tabular}}{{{column_spec}}}',
        '\\toprule',
        ' & '.join(tex_escape(cell) for cell in headers) + ' \\\\',
        '\\midrule',
    ]
    for row in rows:
        lines.append(' & '.join(tex_escape(cell) for cell in row) + ' \\\\')
    lines.append('\\bottomrule')
    lines.append('\\end{tabular}')

    ensure_parent(spec['outputPath'])
    with open(spec['outputPath'], 'w', encoding='utf-8') as handle:
        handle.write('\n'.join(lines))

def main():
    specs_path = sys.argv[1]
    with open(specs_path, 'r', encoding='utf-8') as handle:
        specs = json.load(handle)

    for spec in specs:
        if spec.get('type') == 'table':
            write_table(spec)
        elif spec.get('type') == 'line_plot':
            write_line_chart(spec)
        else:
            write_bar_chart(spec)

if __name__ == '__main__':
    main()
`.trim();
  }
}
