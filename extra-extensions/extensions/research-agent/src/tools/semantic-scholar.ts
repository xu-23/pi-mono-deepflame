/**
 * Semantic Scholar API Client
 * 
 * Provides search and retrieval of papers from Semantic Scholar
 * with citation information and paper relationships
 */

import axios from 'axios';

// ============================================================================
// Types
// ============================================================================

export interface SemanticScholarPaper {
  paperId: string;
  title: string;
  abstract?: string;
  year?: number;
  authors: Array<{
    authorId: string;
    name: string;
  }>;
  venue?: string;
  citationCount: number;
  referenceCount: number;
  influentialCitationCount: number;
  isOpenAccess: boolean;
  openAccessPdf?: {
    url: string;
    status: string;
  };
  fieldsOfStudy?: string[];
  s2FieldsOfStudy?: Array<{
    category: string;
    source: 's2-fos-model' | 'mag';
  }>;
  url: string;
  arxivId?: string;
  doi?: string;
  publicationDate?: string;
  journal?: {
    name: string;
    pages?: string;
    volume?: string;
  };
}

export interface SemanticScholarSearchResult {
  total: number;
  offset: number;
  next?: number;
  data: SemanticScholarPaper[];
}

export interface SemanticScholarSearchOptions {
  query: string;
  limit?: number;
  offset?: number;
  year?: string; // e.g., "2020-2023" or "2020-"
  venue?: string[];
  fieldsOfStudy?: string[];
  isOpenAccess?: boolean;
}

export interface CitationInfo {
  paperId: string;
  title: string;
  authors: string[];
  year?: number;
  venue?: string;
  isInfluential: boolean;
  contexts: string[];
}

export interface ReferenceInfo {
  paperId: string;
  title: string;
  authors: string[];
  year?: number;
  venue?: string;
}

// ============================================================================
// Semantic Scholar API Client
// ============================================================================

const S2_API_BASE = 'https://api.semanticscholar.org/graph/v1';

export class SemanticScholarClient {
  private apiKey?: string;
  private timeout: number;

  constructor(apiKey?: string, timeout: number = 30000) {
    this.apiKey = apiKey;
    this.timeout = timeout;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'User-Agent': 'ResearchAgent/1.0',
    };
    if (this.apiKey) {
      headers['x-api-key'] = this.apiKey;
    }
    return headers;
  }

  /**
   * Search for papers
   */
  async search(options: SemanticScholarSearchOptions): Promise<SemanticScholarSearchResult> {
    const {
      query,
      limit = 20,
      offset = 0,
      year,
      venue,
      fieldsOfStudy,
      isOpenAccess,
    } = options;

    const params = new URLSearchParams({
      query,
      limit: limit.toString(),
      offset: offset.toString(),
      fields: 'paperId,title,abstract,year,authors,venue,citationCount,referenceCount,influentialCitationCount,isOpenAccess,openAccessPdf,fieldsOfStudy,url,arxivId,doi,publicationDate,journal',
    });

    if (year) {
      params.append('year', year);
    }
    if (venue && venue.length > 0) {
      params.append('venue', venue.join(','));
    }
    if (fieldsOfStudy && fieldsOfStudy.length > 0) {
      params.append('fieldsOfStudy', fieldsOfStudy.join(','));
    }
    if (isOpenAccess !== undefined) {
      params.append('isOpenAccess', isOpenAccess.toString());
    }

    const url = `${S2_API_BASE}/paper/search?${params.toString()}`;

    try {
      const response = await axios.get(url, {
        timeout: this.timeout,
        headers: this.getHeaders(),
      });

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 429) {
        throw new Error('Semantic Scholar API rate limit exceeded. Please try again later.');
      }
      throw new Error(`Semantic Scholar API error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get a paper by its ID
   */
  async getPaper(paperId: string): Promise<SemanticScholarPaper | null> {
    const fields = 'paperId,title,abstract,year,authors,venue,citationCount,referenceCount,influentialCitationCount,isOpenAccess,openAccessPdf,fieldsOfStudy,url,arxivId,doi,publicationDate,journal';
    
    const url = `${S2_API_BASE}/paper/${paperId}?fields=${fields}`;

    try {
      const response = await axios.get(url, {
        timeout: this.timeout,
        headers: this.getHeaders(),
      });

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      throw new Error(`Semantic Scholar API error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get paper by DOI
   */
  async getPaperByDOI(doi: string): Promise<SemanticScholarPaper | null> {
    return this.getPaper(`DOI:${doi}`);
  }

  /**
   * Get paper by arXiv ID
   */
  async getPaperByArxivId(arxivId: string): Promise<SemanticScholarPaper | null> {
    return this.getPaper(`ARXIV:${arxivId}`);
  }

  /**
   * Get citations for a paper
   */
  async getCitations(
    paperId: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<CitationInfo[]> {
    const fields = 'paperId,title,year,authors,venue,isInfluential,contexts';
    const url = `${S2_API_BASE}/paper/${paperId}/citations?fields=${fields}&limit=${limit}&offset=${offset}`;

    try {
      const response = await axios.get(url, {
        timeout: this.timeout,
        headers: this.getHeaders(),
      });

      return (response.data.data || []).map((item: any) => ({
        paperId: item.citingPaper.paperId,
        title: item.citingPaper.title,
        authors: (item.citingPaper.authors || []).map((a: any) => a.name),
        year: item.citingPaper.year,
        venue: item.citingPaper.venue,
        isInfluential: item.isInfluential,
        contexts: item.contexts || [],
      }));
    } catch (error) {
      throw new Error(`Semantic Scholar API error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get references for a paper
   */
  async getReferences(
    paperId: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<ReferenceInfo[]> {
    const fields = 'paperId,title,year,authors,venue';
    const url = `${S2_API_BASE}/paper/${paperId}/references?fields=${fields}&limit=${limit}&offset=${offset}`;

    try {
      const response = await axios.get(url, {
        timeout: this.timeout,
        headers: this.getHeaders(),
      });

      return (response.data.data || [])
        .filter((item: any) => item.referencedPaper) // Filter out null references
        .map((item: any) => ({
          paperId: item.referencedPaper.paperId,
          title: item.referencedPaper.title,
          authors: (item.referencedPaper.authors || []).map((a: any) => a.name),
          year: item.referencedPaper.year,
          venue: item.referencedPaper.venue,
        }));
    } catch (error) {
      throw new Error(`Semantic Scholar API error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get related papers
   */
  async getRelatedPapers(paperId: string, limit: number = 20): Promise<SemanticScholarPaper[]> {
    const fields = 'paperId,title,abstract,year,authors,venue,citationCount,url';
    const url = `${S2_API_BASE}/paper/${paperId}/related?fields=${fields}&limit=${limit}`;

    try {
      const response = await axios.get(url, {
        timeout: this.timeout,
        headers: this.getHeaders(),
      });

      return response.data.relatedPapers || [];
    } catch (error) {
      throw new Error(`Semantic Scholar API error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Batch get papers by IDs
   */
  async batchGetPapers(paperIds: string[]): Promise<SemanticScholarPaper[]> {
    if (paperIds.length === 0) return [];

    const fields = 'paperId,title,abstract,year,authors,venue,citationCount,referenceCount,url,arxivId,doi';
    const url = `${S2_API_BASE}/paper/batch?fields=${fields}`;

    try {
      const response = await axios.post(url, { ids: paperIds }, {
        timeout: this.timeout,
        headers: this.getHeaders(),
      });

      return response.data || [];
    } catch (error) {
      throw new Error(`Semantic Scholar API error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Search for authors
   */
  async searchAuthors(query: string, limit: number = 10): Promise<Array<{
    authorId: string;
    name: string;
    affiliation?: string;
    citationCount: number;
    paperCount: number;
  }>> {
    const url = `${S2_API_BASE}/author/search?query=${encodeURIComponent(query)}&limit=${limit}`;

    try {
      const response = await axios.get(url, {
        timeout: this.timeout,
        headers: this.getHeaders(),
      });

      return response.data.data || [];
    } catch (error) {
      throw new Error(`Semantic Scholar API error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Search for papers in ML/AI field
 */
export async function searchMLPapers(
  query: string,
  limit: number = 20,
  apiKey?: string
): Promise<SemanticScholarPaper[]> {
  const client = new SemanticScholarClient(apiKey);
  const result = await client.search({
    query,
    limit,
    fieldsOfStudy: ['Computer Science'],
    year: '2020-',
  });
  return result.data;
}

/**
 * Get highly cited papers on a topic
 */
export async function getHighlyCitedPapers(
  query: string,
  minCitations: number = 100,
  limit: number = 20,
  apiKey?: string
): Promise<SemanticScholarPaper[]> {
  const client = new SemanticScholarClient(apiKey);
  const result = await client.search({
    query,
    limit: limit * 2, // Get more to filter
    year: '2018-',
  });

  return result.data
    .filter(p => (p.citationCount || 0) >= minCitations)
    .sort((a, b) => (b.citationCount || 0) - (a.citationCount || 0))
    .slice(0, limit);
}

/**
 * Build a citation graph
 */
export async function buildCitationGraph(
  paperId: string,
  depth: number = 1,
  apiKey?: string
): Promise<{
  papers: Map<string, SemanticScholarPaper>;
  citations: Array<{ from: string; to: string }>;
}> {
  const client = new SemanticScholarClient(apiKey);
  const papers = new Map<string, SemanticScholarPaper>();
  const citations: Array<{ from: string; to: string }> = [];

  async function traverse(id: string, currentDepth: number) {
    if (currentDepth > depth || papers.has(id)) return;

    const paper = await client.getPaper(id);
    if (!paper) return;
    papers.set(id, paper);

    if (currentDepth < depth) {
      const refs = await client.getReferences(id, 50);
      for (const ref of refs) {
        if (ref.paperId) {
          citations.push({ from: id, to: ref.paperId });
          await traverse(ref.paperId, currentDepth + 1);
        }
      }
    }
  }

  await traverse(paperId, 0);

  return { papers, citations };
}

/**
 * Convert SemanticScholarPaper to internal Paper format
 */
export function toInternalPaper(s2Paper: SemanticScholarPaper): {
  id: string;
  title: string;
  authors: string[];
  abstract: string;
  year: number;
  url: string;
  arxivId?: string;
  doi?: string;
  citationCount: number;
  keywords: string[];
  source: 'semantic_scholar';
} {
  return {
    id: `s2_${s2Paper.paperId}`,
    title: s2Paper.title,
    authors: s2Paper.authors.map(a => a.name),
    abstract: s2Paper.abstract || '',
    year: s2Paper.year || 0,
    url: s2Paper.url,
    arxivId: s2Paper.arxivId,
    doi: s2Paper.doi,
    citationCount: s2Paper.citationCount,
    keywords: s2Paper.fieldsOfStudy || [],
    source: 'semantic_scholar',
  };
}