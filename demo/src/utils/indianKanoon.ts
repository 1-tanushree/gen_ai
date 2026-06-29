export interface IKSearchResult {
  docId: number;
  title: string;
  date: string;
  court: string;
  url: string;
}

export interface IKDocument {
  title: string;
  doc: string; // HTML content
  publishdate: string;
  docsource: string;
  courtcopy: boolean;
}

export const searchIndianKanoon = async (query: string): Promise<IKSearchResult | null> => {
  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    if (!response.ok) return null;

    const data = await response.json();
    if (!data.docs || data.docs.length === 0) return null;

    const doc = data.docs[0];
    return {
      docId: doc.tid,
      title: doc.title,
      date: doc.publishdate,
      court: doc.docsource,
      url: `https://indiankanoon.org/doc/${doc.tid}/`,
    };
  } catch {
    return null;
  }
};

export const fetchIndianKanoonDoc = async (docId: number): Promise<IKDocument | null> => {
  try {
    const response = await fetch(`/api/doc/${docId}`);
    if (!response.ok) return null;

    const data = await response.json();
    if (data.error || data.errmsg) return null;

    return data as IKDocument;
  } catch {
    return null;
  }
};
