// A completed download is returned before any research selection is applied.
export async function loadResearchEvidence({fetch: fetcher = globalThis.fetch, timeoutMs = 45000} = {}) {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error('Evidence download timed out. Check your connection and retry.'));
      controller.abort();
    }, timeoutMs);
  });
  try {
    const download = (async () => {
      const response = await fetcher('./data/research.json', {signal: controller.signal, cache: 'no-cache'});
      if (!response.ok) throw new Error(`Evidence request failed (${response.status}). Try loading again.`);
      const data = await response.json();
      if (data?.data_kind !== 'real_official_financial_evidence') throw new Error('The response is not an official financial evidence bundle.');
      return data;
    })();
    return await Promise.race([download, deadline]);
  } finally {
    clearTimeout(timer);
  }
}
