/**
 * arXiv API Client
 * 
 * Provides search and retrieval of papers from arXiv.org
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

// ============================================================================
// Types
// ============================================================================

export interface ArxivPaper {
  id: string;
  arxivId: string;
  title: string;
  authors: string[];
  abstract: string;
  categories: string[];
  publishedDate: string;
  updatedDate: string;
  pdfUrl: string;
  absUrl: string;
  comment?: string;
  journalRef?: string;
  doi?: string;
}

export interface ArxivSearchResult {
  papers: ArxivPaper[];
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
}

export interface ArxivSearchOptions {
  query: string;
  maxResults?: number;
  startIndex?: number;
  sortBy?: 'relevance' | 'lastUpdatedDate' | 'submittedDate';
  sortOrder?: 'ascending' | 'descending';
  categories?: string[];
}

// ============================================================================
// arXiv API Client
// ============================================================================

const ARXIV_API_BASE = 'http://export.arxiv.org/api/query';

export class ArxivClient {
  private timeout: number;

  constructor(timeout: number = 30000) {
    this.timeout = timeout;
  }

  /**
   * Search arXiv for papers matching the query
   */
  async search(options: ArxivSearchOptions): Promise<ArxivSearchResult> {
    const {
      query,
      maxResults = 20,
      startIndex = 0,
      sortBy = 'relevance',
      sortOrder = 'descending',
      categories = [],
    } = options;

    // Build search query
    let searchQuery = query;
    if (categories.length > 0) {
      const catQuery = categories.map(c => `cat:${c}`).join(' OR ');
      searchQuery = `(${query}) AND (${catQuery})`;
    }

    // Build URL
    const params = new URLSearchParams({
      search_query: searchQuery,
      start: startIndex.toString(),
      max_results: maxResults.toString(),
      sortBy,
      sortOrder,
    });

    const url = `${ARXIV_API_BASE}?${params.toString()}`;

    try {
      const response = await axios.get(url, {
        timeout: this.timeout,
        headers: {
          'User-Agent': 'ResearchAgent/1.0 (mailto:research@example.com)',
        },
      });

      return this.parseArxivResponse(response.data);
    } catch (error) {
      throw new Error(`arXiv API error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get a specific paper by arXiv ID
   */
  async getById(arxivId: string): Promise<ArxivPaper | null> {
    const params = new URLSearchParams({
      id_list: arxivId,
    });

    const url = `${ARXIV_API_BASE}?${params.toString()}`;

    try {
      const response = await axios.get(url, {
        timeout: this.timeout,
        headers: {
          'User-Agent': 'ResearchAgent/1.0',
        },
      });

      const result = this.parseArxivResponse(response.data);
      return result.papers.length > 0 ? result.papers[0] : null;
    } catch (error) {
      throw new Error(`arXiv API error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get multiple papers by their arXiv IDs
   */
  async getByIds(arxivIds: string[]): Promise<ArxivPaper[]> {
    if (arxivIds.length === 0) return [];

    const params = new URLSearchParams({
      id_list: arxivIds.join(','),
    });

    const url = `${ARXIV_API_BASE}?${params.toString()}`;

    try {
      const response = await axios.get(url, {
        timeout: this.timeout,
        headers: {
          'User-Agent': 'ResearchAgent/1.0',
        },
      });

      const result = this.parseArxivResponse(response.data);
      return result.papers;
    } catch (error) {
      throw new Error(`arXiv API error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Parse arXiv Atom feed response
   */
  private parseArxivResponse(xml: string): ArxivSearchResult {
    const $ = cheerio.load(xml, { xmlMode: true });

    const papers: ArxivPaper[] = [];
    let totalResults = 0;
    let startIndex = 0;
    let itemsPerPage = 0;

    // Parse feed metadata
    $('feed > totalResults').each((_, el) => {
      totalResults = parseInt($(el).text(), 10) || 0;
    });

    $('feed > startIndex').each((_, el) => {
      startIndex = parseInt($(el).text(), 10) || 0;
    });

    $('feed > itemsPerPage').each((_, el) => {
      itemsPerPage = parseInt($(el).text(), 10) || 0;
    });

    // Parse entries
    $('feed > entry').each((_, entry) => {
      const $entry = $(entry);

      // Extract arXiv ID from the id URL
      const idUrl = $entry.find('id').text() || '';
      const arxivId = this.extractArxivId(idUrl);

      // Extract authors
      const authors: string[] = [];
      $entry.find('author > name').each((_, nameEl) => {
        authors.push($(nameEl).text().trim());
      });

      // Extract categories
      const categories: string[] = [];
      $entry.find('category').each((_, catEl) => {
        const term = $(catEl).attr('term');
        if (term) categories.push(term);
      });

      // Extract links
      let pdfUrl = '';
      let absUrl = idUrl;
      $entry.find('link').each((_, linkEl) => {
        const $link = $(linkEl);
        const rel = $link.attr('rel');
        const type = $link.attr('type');
        const href = $link.attr('href') || '';

        if (type === 'application/pdf' || rel === 'related') {
          pdfUrl = href;
        }
      });

      // If no PDF link found, construct it
      if (!pdfUrl && arxivId) {
        pdfUrl = `https://arxiv.org/pdf/${arxivId}.pdf`;
      }

      const paper: ArxivPaper = {
        id: `arxiv_${arxivId}`,
        arxivId,
        title: $entry.find('title').text().trim().replace(/\s+/g, ' '),
        authors,
        abstract: $entry.find('summary').text().trim().replace(/\s+/g, ' '),
        categories,
        publishedDate: $entry.find('published').text() || '',
        updatedDate: $entry.find('updated').text() || '',
        pdfUrl,
        absUrl,
        comment: $entry.find('arxiv\\:comment').text() || undefined,
        journalRef: $entry.find('arxiv\\:journal_ref').text() || undefined,
        doi: $entry.find('arxiv\\:doi').text() || undefined,
      };

      papers.push(paper);
    });

    return {
      papers,
      totalResults,
      startIndex,
      itemsPerPage,
    };
  }

  /**
   * Extract arXiv ID from URL
   */
  private extractArxivId(url: string): string {
    // Match patterns like:
    // http://arxiv.org/abs/2301.12345
    // http://arxiv.org/abs/cs/0001234
    const match = url.match(/arxiv\.org\/abs\/([^/]+)$/);
    if (match) {
      return match[1];
    }
    return '';
  }

  /**
   * Build advanced search query
   */
  static buildQuery(params: {
    title?: string;
    author?: string;
    abstract?: string;
    all?: string;
    categories?: string[];
  }): string {
    const parts: string[] = [];

    if (params.title) {
      parts.push(`ti:${params.title}`);
    }
    if (params.author) {
      parts.push(`au:${params.author}`);
    }
    if (params.abstract) {
      parts.push(`abs:${params.abstract}`);
    }
    if (params.all) {
      parts.push(`all:${params.all}`);
    }
    if (params.categories && params.categories.length > 0) {
      parts.push(params.categories.map(c => `cat:${c}`).join(' OR '));
    }

    return parts.join(' AND ');
  }
}

// ============================================================================
// Common arXiv Categories
// ============================================================================

export const ARXIV_CATEGORIES = {
  // Computer Science
  cs: {
    ai: 'cs.AI',      // Artificial Intelligence
    cl: 'cs.CL',      // Computation and Language
    cv: 'cs.CV',      // Computer Vision and Pattern Recognition
    lg: 'cs.LG',      // Machine Learning
    ne: 'cs.NE',      // Neural and Evolutionary Computing
    ro: 'cs.RO',      // Robotics
    ds: 'cs.DS',      // Data Structures and Algorithms
    dc: 'cs.DC',      // Distributed, Parallel, and Cluster Computing
  },
  // Statistics
  stat: {
    ml: 'stat.ML',    // Machine Learning
  },
  // Mathematics
  math: {
    na: 'math.NA',    // Numerical Analysis
  },
  // Physics
  physics: {
    fluDyn: 'physics.flu-dyn', // Fluid Dynamics
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Search for ML/AI papers
 */
export async function searchMLPapers(
  query: string,
  maxResults: number = 20
): Promise<ArxivPaper[]> {
  const client = new ArxivClient();
  const result = await client.search({
    query,
    maxResults,
    categories: [ARXIV_CATEGORIES.cs.ai, ARXIV_CATEGORIES.cs.lg, ARXIV_CATEGORIES.cs.cl],
    sortBy: 'relevance',
  });
  return result.papers;
}

/**
 * Search for CFD papers
 */
export async function searchCFDPapers(
  query: string,
  maxResults: number = 20
): Promise<ArxivPaper[]> {
  const client = new ArxivClient();
  const result = await client.search({
    query,
    maxResults,
    categories: [ARXIV_CATEGORIES.physics.fluDyn, ARXIV_CATEGORIES.math.na],
    sortBy: 'relevance',
  });
  return result.papers;
}

/**
 * Convert ArxivPaper to internal Paper format
 */
export function toInternalPaper(arxivPaper: ArxivPaper): {
  id: string;
  title: string;
  authors: string[];
  abstract: string;
  year: number;
  url: string;
  arxivId: string;
  keywords: string[];
  source: 'arxiv';
} {
  return {
    id: arxivPaper.id,
    title: arxivPaper.title,
    authors: arxivPaper.authors,
    abstract: arxivPaper.abstract,
    year: new Date(arxivPaper.publishedDate).getFullYear(),
    url: arxivPaper.absUrl,
    arxivId: arxivPaper.arxivId,
    keywords: arxivPaper.categories,
    source: 'arxiv',
  };
}