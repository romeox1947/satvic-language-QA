export type AnalysisProgress = {
  id: string;
  stage: string;
  percent: number;
  status: 'processing' | 'complete' | 'error';
  startedAt: number;
  updatedAt: number;
  error?: string;
};

type ProgressGlobal = typeof globalThis & { __satvicAnalysisProgress?: Map<string, AnalysisProgress> };
const root = globalThis as ProgressGlobal;
const store = root.__satvicAnalysisProgress ?? (root.__satvicAnalysisProgress = new Map());

export function updateAnalysisProgress(id: string, stage: string, percent: number, status: AnalysisProgress['status'] = 'processing', error?: string) {
  if (!id) return;
  const previous = store.get(id);
  store.set(id, { id, stage, percent, status, startedAt: previous?.startedAt ?? Date.now(), updatedAt: Date.now(), ...(error ? { error } : {}) });
  if (store.size > 40) {
    const oldest = [...store.values()].sort((a, b) => a.updatedAt - b.updatedAt)[0];
    if (oldest && oldest.id !== id) store.delete(oldest.id);
  }
}

export function getAnalysisProgress(id: string) {
  return store.get(id) ?? null;
}
