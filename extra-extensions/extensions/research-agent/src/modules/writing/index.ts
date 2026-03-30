import * as fs from 'fs';
import * as path from 'path';
import {
  StateManager,
  PaperDraft,
  PaperSection,
  ResearchProposal,
  Experiment,
  ExperimentResult,
  Figure,
  Paper as LiteraturePaper,
  ResearchIntent,
  BibliographyEntry,
} from '../../core/state';
import { PhaseExecutor, PhaseExecutionContext } from '../../core/workflow';

export interface PaperTemplate {
  name: string;
  venue: string;
  sections: string[];
  bibliographyStyle: string;
}

interface WritingContextData {
  proposal: ResearchProposal;
  experiments: Experiment[];
  results?: ExperimentResult;
  analysisInsights: string[];
  analysisConclusions: string[];
  figures: Figure[];
  literature: LiteraturePaper[];
  intent: ResearchIntent;
}

const PAPER_TEMPLATES: Record<string, PaperTemplate> = {
  neurips: {
    name: 'NeurIPS',
    venue: 'NeurIPS',
    sections: ['Abstract', 'Introduction', 'Related Work', 'Method', 'Experiments', 'Results', 'Discussion', 'Conclusion', 'References'],
    bibliographyStyle: 'neurips_2024',
  },
  icml: {
    name: 'ICML',
    venue: 'ICML',
    sections: ['Abstract', 'Introduction', 'Related Work', 'Method', 'Experiments', 'Conclusion', 'References'],
    bibliographyStyle: 'icml2024',
  },
  iclr: {
    name: 'ICLR',
    venue: 'ICLR',
    sections: ['Abstract', 'Introduction', 'Background', 'Method', 'Experiments', 'Related Work', 'Conclusion', 'References'],
    bibliographyStyle: 'iclr2024_conference',
  },
  cvpr: {
    name: 'CVPR',
    venue: 'CVPR',
    sections: ['Abstract', 'Introduction', 'Related Work', 'Method', 'Experiments', 'Conclusion', 'References'],
    bibliographyStyle: 'cvpr',
  },
  ieee: {
    name: 'IEEE',
    venue: 'IEEE Transaction',
    sections: ['Abstract', 'Introduction', 'Related Work', 'Proposed Method', 'Experimental Results', 'Conclusion', 'References'],
    bibliographyStyle: 'IEEEtran',
  },
};

export class PaperGenerator implements PhaseExecutor {
  private stateManager: StateManager;
  private template: PaperTemplate;

  constructor(stateManager: StateManager, templateName: string = 'neurips') {
    this.stateManager = stateManager;
    this.template = PAPER_TEMPLATES[templateName] || PAPER_TEMPLATES.neurips;
  }

  async execute(context: PhaseExecutionContext): Promise<void> {
    const state = this.stateManager.getState();
    const selectedProposal = state.proposals.find(proposal => proposal.id === state.selectedProposalId);
    if (!selectedProposal) {
      throw new Error('No proposal selected for paper writing');
    }

    const paperDir = '.research/paper';
    if (!fs.existsSync(paperDir)) {
      fs.mkdirSync(paperDir, { recursive: true });
    }

    const writingContext: WritingContextData = {
      proposal: selectedProposal,
      experiments: state.experiments,
      results: state.analysis.results,
      analysisInsights: state.analysis.insights,
      analysisConclusions: state.analysis.conclusions,
      figures: state.figures,
      literature: state.literature.papers,
      intent: state.intent,
    };

    context.reportProgress(0, 'Building evidence-driven paper sections');
    const sections: PaperSection[] = [];

    for (let index = 0; index < this.template.sections.length; index++) {
      const sectionName = this.template.sections[index];
      const progress = ((index + 1) / this.template.sections.length) * 85;
      context.reportProgress(progress, `Writing ${sectionName}`);
      sections.push(this.generateSection(sectionName, writingContext));
    }

    const paper: PaperDraft = {
      version: 1,
      title: selectedProposal.title,
      abstract: sections.find(section => section.name === 'Abstract')?.content || '',
      sections: sections.filter(section => section.name !== 'Abstract' && section.name !== 'References'),
      bibliography: this.generateBibliography(state.literature.papers),
      generatedAt: new Date().toISOString(),
    };

    this.stateManager.addDraft(paper);

    const latexPath = path.join(paperDir, 'main.tex');
    const bibPath = path.join(paperDir, 'references.bib');
    fs.writeFileSync(latexPath, this.generateLatex(paper));
    fs.writeFileSync(bibPath, this.generateBibFile(paper.bibliography));
    this.stateManager.setFinalPaper(latexPath);

    context.reportProgress(100, 'Paper written successfully');
  }

  private generateSection(sectionName: string, context: WritingContextData): PaperSection {
    switch (sectionName) {
      case 'Abstract':
        return this.generateAbstract(context);
      case 'Introduction':
        return this.generateIntroduction(context);
      case 'Related Work':
        return this.generateRelatedWork(context);
      case 'Background':
        return this.generateBackground(context);
      case 'Method':
      case 'Proposed Method':
        return this.generateMethod(context, sectionName);
      case 'Experiments':
      case 'Experimental Results':
        return this.generateExperiments(context, sectionName);
      case 'Results':
        return this.generateResults(context);
      case 'Discussion':
        return this.generateDiscussion(context);
      case 'Conclusion':
        return this.generateConclusion(context);
      case 'References':
        return { name: 'References', content: '' };
      default:
        return { name: sectionName, content: '' };
    }
  }

  private generateAbstract(context: WritingContextData): PaperSection {
    const completedExperiments = this.getCompletedExperiments(context.experiments);
    const metricSentence = this.buildAbstractMetricSentence(completedExperiments, context.results);
    const priorArtSentence = context.proposal.noveltyAnalysis.priorArtSummary || context.proposal.noveltyAnalysis.noveltyJustification;
    const gapSentence = context.proposal.noveltyAnalysis.gapStatement || 'The proposal is framed around the clearest gap visible in the retrieved literature.';

    return {
      name: 'Abstract',
      content: [
        this.escapeLatex(this.ensureSentence(context.intent.problemStatement || context.proposal.problemDefinition)),
        this.escapeLatex(this.ensureSentence(priorArtSentence)),
        this.escapeLatex(this.ensureSentence(context.proposal.methodology.overview)),
        this.escapeLatex(this.ensureSentence(gapSentence)),
        this.escapeLatex(this.ensureSentence(metricSentence)),
      ].join(' '),
    };
  }

  private generateIntroduction(context: WritingContextData): PaperSection {
    const contributions = this.buildContributionList(context);
    const relatedAnchor = context.proposal.noveltyAnalysis.supportingPapers?.[0]?.title;

    return {
      name: 'Introduction',
      content: [
        this.sectionLabel('sec:introduction'),
        this.ensureParagraph(
          `${this.escapeLatex(context.intent.topic)} is the focus of this project because ${this.escapeLatex(context.proposal.motivation)}`
        ),
        this.ensureParagraph(
          `${this.escapeLatex(context.proposal.noveltyAnalysis.priorArtSummary || 'The retrieved literature establishes the local prior-art landscape.')}` +
          ` ${this.escapeLatex(context.proposal.noveltyAnalysis.gapStatement || 'The resulting proposal focuses on the most weakly covered requirement in that literature set.')}` +
          `${relatedAnchor ? ` The strongest nearby paper match is ${this.escapeLatex(relatedAnchor)}, which clarifies the baseline for comparison.` : ''}`
        ),
        'Our contributions are summarized below.',
        this.renderItemize(contributions),
        this.ensureParagraph('The remaining sections describe the retrieved literature, the proposed method, the experimental evidence, and the limitations that remain visible from the current results.'),
      ].join('\n\n'),
    };
  }

  private generateRelatedWork(context: WritingContextData): PaperSection {
    const citedPapers = this.getMostRelevantPapers(context).slice(0, 6);
    const paragraphs = citedPapers.map(paper => {
      const venue = paper.venue || paper.keywords[0] || paper.source;
      const abstractSnippet = this.summarizeText(paper.abstract, 160);
      return `${this.escapeLatex(paper.authors[0] || 'Unknown')} et al.~\\cite{${paper.id}} study ${this.escapeLatex(paper.title.toLowerCase())} (${this.escapeLatex(String(paper.year))}, ${this.escapeLatex(venue)}). ${this.escapeLatex(abstractSnippet)}`;
    });

    const differenceParagraph = `${this.escapeLatex(context.proposal.noveltyAnalysis.noveltyJustification)} The proposal distinguishes itself through ${this.escapeLatex(context.proposal.noveltyAnalysis.keyDifferences.join('; '))}.`;

    return {
      name: 'Related Work',
      content: [
        this.sectionLabel('sec:related'),
        ...paragraphs,
        differenceParagraph,
      ].join('\n\n'),
    };
  }

  private generateBackground(context: WritingContextData): PaperSection {
    const topThemes = this.getMostRelevantPapers(context)
      .slice(0, 3)
      .map(paper => paper.title)
      .join('; ');

    return {
      name: 'Background',
      content: [
        this.sectionLabel('sec:background'),
        this.ensureParagraph(`The retrieved literature suggests that the project sits closest to the following strands of work: ${this.escapeLatex(topThemes || context.intent.topic)}.`),
        this.ensureParagraph(`Instead of introducing unsupported formalism, we use the proposal text and retrieved metadata to motivate the design space. The working problem statement is: ${this.escapeLatex(context.proposal.problemDefinition)}.`),
      ].join('\n\n'),
    };
  }

  private generateMethod(context: WritingContextData, sectionName: string): PaperSection {
    const steps = context.proposal.methodology.implementationSteps.map(step => this.escapeLatex(step));

    return {
      name: sectionName,
      content: [
        this.sectionLabel('sec:method'),
        '\\subsection{Overview}',
        this.escapeLatex(this.ensureSentence(context.proposal.methodology.overview)),
        '\\subsection{Prior-Art-Grounded Design Rationale}',
        this.escapeLatex(this.ensureSentence(context.proposal.noveltyAnalysis.noveltyJustification)),
        this.escapeLatex(this.ensureSentence(context.proposal.noveltyAnalysis.gapStatement || 'The method is scoped to the evidence-supported gap in the retrieved literature.')),
        '\\subsection{Technical Plan}',
        this.escapeLatex(this.normalizeWhitespace(context.proposal.methodology.technicalApproach)),
        '\\subsection{Implementation Steps}',
        this.renderEnumerate(steps),
      ].join('\n\n'),
    };
  }

  private generateExperiments(context: WritingContextData, sectionName: string): PaperSection {
    const completedExperiments = this.getCompletedExperiments(context.experiments);
    const tableFigures = context.figures.filter(figure => figure.type === 'table');
    const experimentDescriptions = completedExperiments.length > 0
      ? completedExperiments.map(experiment => `${this.escapeLatex(experiment.name)}: ${this.escapeLatex(experiment.description)}`)
      : ['No completed experiments were available at paper-generation time.'];

    const body = [
      this.sectionLabel('sec:experiments'),
      '\\subsection{Setup}',
      this.ensureParagraph(`Datasets requested by the proposal are ${this.escapeLatex(context.proposal.estimatedResources.datasetRequirements.join(', ') || 'not specified')}. Evaluation focuses on ${this.escapeLatex(context.proposal.evaluationMetrics.join(', ') || 'the metrics reported by the experiments')}.`),
      this.ensureParagraph(`The closest retrieved baselines are ${this.escapeLatex(context.proposal.noveltyAnalysis.comparedMethods.slice(0, 5).join(', ') || 'not available from the retrieved literature')}.`),
      '\\subsection{Executed Experiments}',
      this.renderItemize(experimentDescriptions),
    ];

    if (tableFigures.length > 0) {
      body.push('\\subsection{Metric Table}');
      body.push(tableFigures.map(figure => figure.latexCode).join('\n\n'));
    }

    return {
      name: sectionName,
      content: body.join('\n\n'),
    };
  }

  private generateResults(context: WritingContextData): PaperSection {
    const completedExperiments = this.getCompletedExperiments(context.experiments);
    const resultHighlights = this.buildResultHighlights(context, completedExperiments);
    const nonTableFigures = context.figures.filter(figure => figure.type !== 'table');
    const figureParagraph = nonTableFigures.length > 0
      ? `The generated figures provide direct visual evidence from the experiment outputs and are inserted below.`
      : `No non-table figures were generated because the available experiment outputs did not contain plottable figure data beyond the metric table.`;

    const body = [
      this.sectionLabel('sec:results'),
      '\\subsection{Observed Evidence}',
      this.renderItemize(resultHighlights),
      this.ensureParagraph(figureParagraph),
    ];

    if (nonTableFigures.length > 0) {
      body.push(nonTableFigures.map(figure => figure.latexCode).join('\n\n'));
    }

    return {
      name: 'Results',
      content: body.join('\n\n'),
    };
  }

  private generateDiscussion(context: WritingContextData): PaperSection {
    const evidencePoints = [
      ...context.analysisInsights.slice(0, 4),
      ...((context.proposal.scores?.evaluationComments || []).slice(0, 2).map(comment => `${comment.role}: ${comment.comment}`)),
    ];
    const limitations = context.proposal.risks.length > 0
      ? context.proposal.risks
      : ['No explicit risks were recorded in the proposal.'];

    return {
      name: 'Discussion',
      content: [
        this.sectionLabel('sec:discussion'),
        '\\subsection{Interpretation}',
        this.renderItemize((evidencePoints.length > 0 ? evidencePoints : ['The available evidence is limited to the proposal, literature summary, and any completed experiment metrics.']).map(point => this.escapeLatex(point))),
        '\\subsection{Limitations}',
        this.renderItemize(limitations.map(limit => this.escapeLatex(limit))),
      ].join('\n\n'),
    };
  }

  private generateConclusion(context: WritingContextData): PaperSection {
    const closingEvidence = this.buildConclusionEvidence(context);

    return {
      name: 'Conclusion',
      content: [
        this.sectionLabel('sec:conclusion'),
        this.ensureParagraph(`This paper documented ${this.escapeLatex(context.proposal.title.toLowerCase())} as a proposal grounded in retrieved prior art rather than unsupported novelty claims.`),
        this.ensureParagraph(this.escapeLatex(closingEvidence)),
        this.ensureParagraph(`The remaining open issues are captured by the proposal risks and any gaps left in the experiment evidence, so future work should extend the evaluation before claiming stronger generality.`),
      ].join('\n\n'),
    };
  }

  private getCompletedExperiments(experiments: Experiment[]): Experiment[] {
    return experiments.filter(experiment => experiment.status === 'completed' && experiment.results);
  }

  private getMostRelevantPapers(context: WritingContextData): LiteraturePaper[] {
    const supportingIds = new Set((context.proposal.noveltyAnalysis.supportingPapers || []).map(paper => paper.paperId));
    const supporting = context.literature.filter(paper => supportingIds.has(paper.id));
    const remaining = context.literature
      .filter(paper => !supportingIds.has(paper.id))
      .sort((a, b) => b.relevanceScore - a.relevanceScore);

    return [...supporting, ...remaining];
  }

  private buildContributionList(context: WritingContextData): string[] {
    const contributions = [
      `A proposal scoped by retrieved-paper comparison: ${context.proposal.noveltyAnalysis.noveltyJustification}`,
      `A concrete implementation plan: ${context.proposal.methodology.implementationSteps.join('; ')}`,
    ];

    const completedExperiments = this.getCompletedExperiments(context.experiments);
    if (completedExperiments.length > 0) {
      contributions.push(`Completed experimental artifacts spanning ${completedExperiments.map(experiment => experiment.name).join(', ')}`);
    } else {
      contributions.push('A writing pipeline that explicitly avoids unsupported empirical claims when experiment evidence is missing');
    }

    return contributions.map(item => this.escapeLatex(item));
  }

  private buildAbstractMetricSentence(experiments: Experiment[], results?: ExperimentResult): string {
    if (experiments.length === 0 && !results) {
      return 'No completed experiments were available at generation time, so the paper limits itself to proposal, literature, and analysis evidence rather than making unsupported performance claims.';
    }

    const metrics = results?.metrics || experiments[0]?.results?.metrics || {};
    const metricEntries = Object.entries(metrics).filter(([, value]) => typeof value === 'number').slice(0, 3);
    if (metricEntries.length === 0) {
      return `The available empirical evidence consists of ${experiments.length} completed experiment${experiments.length === 1 ? '' : 's'}, but none reported scalar metrics suitable for summary.`;
    }

    const metricText = metricEntries
      .map(([metric, value]) => `${metric.replace(/_/g, ' ')}=${this.formatMetricValue(value)}`)
      .join(', ');

    return `The current empirical evidence covers ${experiments.length} completed experiment${experiments.length === 1 ? '' : 's'} and reports ${metricText}.`;
  }

  private buildResultHighlights(context: WritingContextData, experiments: Experiment[]): string[] {
    const highlights: string[] = [];
    const analysisMetrics = Object.entries(context.results?.metrics || {})
      .filter(([, value]) => typeof value === 'number')
      .slice(0, 4)
      .map(([metric, value]) => `${metric.replace(/_/g, ' ')}=${this.formatMetricValue(value)}`);

    if (analysisMetrics.length > 0) {
      highlights.push(`The main analyzed result reports ${analysisMetrics.join(', ')}.`);
    }

    for (const experiment of experiments.slice(0, 4)) {
      const metrics = Object.entries(experiment.results?.metrics || {})
        .filter(([, value]) => typeof value === 'number')
        .slice(0, 3)
        .map(([metric, value]) => `${metric.replace(/_/g, ' ')}=${this.formatMetricValue(value)}`);
      if (metrics.length > 0) {
        highlights.push(`${experiment.name}: ${metrics.join(', ')}.`);
      }
    }

    for (const insight of context.analysisInsights.slice(0, 3)) {
      highlights.push(insight);
    }

    for (const comparison of context.results?.comparisons || []) {
      const metric = Object.entries(comparison.metrics)[0];
      if (metric) {
        const [metricName, values] = metric;
        highlights.push(`Against ${comparison.baseline}, ${comparison.ourMethod} reports ${metricName.replace(/_/g, ' ')}=${this.formatMetricValue(values.ours)} versus ${this.formatMetricValue(values.baseline)}.`);
      }
    }

    if (highlights.length === 0) {
      highlights.push('No completed experiment produced analyzable scalar evidence, so we avoid making quantitative claims here.');
    }

    return highlights.map(item => this.escapeLatex(item));
  }

  private buildConclusionEvidence(context: WritingContextData): string {
    const completedExperiments = this.getCompletedExperiments(context.experiments);
    if (completedExperiments.length === 0) {
      return `At present, the strongest evidence comes from the prior-art analysis, the proposal rationale, and the absence of fabricated claims in the generated manuscript.`;
    }

    const experimentNames = completedExperiments.map(experiment => experiment.name).join(', ');
    return `The manuscript combines literature-grounded novelty analysis with completed experiment outputs from ${experimentNames}, and the generated figures/tables are drawn directly from those outputs.`;
  }

  private generateBibliography(papers: LiteraturePaper[]): BibliographyEntry[] {
    return papers.slice(0, 20).map(paper => ({
      id: paper.id,
      authors: paper.authors,
      title: paper.title,
      venue: paper.venue || (paper.source === 'arxiv' ? 'arXiv' : paper.keywords[0] || 'Unknown venue'),
      year: paper.year,
      doi: paper.doi,
      url: paper.url,
    }));
  }

  private generateBibFile(entries: BibliographyEntry[]): string {
    return entries.map(entry => {
      const authorField = entry.authors.map(author => this.escapeBib(author)).join(' and ');
      const fields = [
        `  author = {${authorField}}`,
        `  title = {${this.escapeBib(entry.title)}}`,
        `  year = {${entry.year}}`,
        `  journal = {${this.escapeBib(entry.venue)}}`,
      ];

      if (entry.doi) {
        fields.push(`  doi = {${this.escapeBib(entry.doi)}}`);
      }
      if (entry.url) {
        fields.push(`  url = {${this.escapeBib(entry.url)}}`);
      }

      return `@article{${entry.id},\n${fields.join(',\n')}\n}`;
    }).join('\n\n');
  }

  private generateLatex(draft: PaperDraft): string {
    return `
% Auto-generated by Research Agent
% ${draft.generatedAt}

\\documentclass{article}
\\usepackage[final]{neurips_2024}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{hyperref}
\\usepackage{url}
\\usepackage{booktabs}
\\usepackage{amsfonts}
\\usepackage{nicefrac}
\\usepackage{microtype}
\\usepackage{graphicx}
\\usepackage{subcaption}
\\usepackage{amsmath}
\\usepackage{amssymb}

\\title{${this.escapeLatex(draft.title)}}
\\author{Anonymous Author(s)}

\\begin{document}
\\maketitle

\\begin{abstract}
${draft.abstract}
\\end{abstract}

${draft.sections.map(section => `\\section{${this.escapeLatex(section.name)}}\n${section.content}`).join('\n\n')}

\\bibliographystyle{${this.template.bibliographyStyle}}
\\bibliography{references}

\\end{document}
`.trim();
  }

  private renderItemize(items: string[]): string {
    return ['\\begin{itemize}', ...items.map(item => `\\item ${item}`), '\\end{itemize}'].join('\n');
  }

  private renderEnumerate(items: string[]): string {
    return ['\\begin{enumerate}', ...items.map(item => `\\item ${item}`), '\\end{enumerate}'].join('\n');
  }

  private sectionLabel(label: string): string {
    return `\\label{${label}}`;
  }

  private ensureSentence(text: string): string {
    const normalized = this.normalizeWhitespace(text);
    if (!normalized) {
      return '';
    }
    return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
  }

  private ensureParagraph(text: string): string {
    return this.ensureSentence(text);
  }

  private normalizeWhitespace(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }

  private summarizeText(text: string, limit: number): string {
    const normalized = this.normalizeWhitespace(text || '');
    if (!normalized) {
      return 'No abstract summary was available in the retrieved metadata.';
    }
    if (normalized.length <= limit) {
      return this.ensureSentence(normalized);
    }
    return `${normalized.slice(0, limit - 3).trim()}...`;
  }

  private formatMetricValue(value: number): string {
    if (!Number.isFinite(value)) {
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

  private escapeBib(text: string): string {
    return text.replace(/[{}]/g, '');
  }
}
