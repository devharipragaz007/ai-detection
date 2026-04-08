export type DiffSegment = {
  text: string;
  type: "added" | "removed" | "unchanged";
};

function splitWords(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

function buildLCS(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0)
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp;
}

export function wordDiff(original: string, rewritten: string): DiffSegment[] {
  const origWords = splitWords(original);
  const rewrWords = splitWords(rewritten);

  const dp = buildLCS(origWords, rewrWords);

  // Backtrack through LCS table to build raw op list (reversed)
  const raw: Array<{ type: "unchanged" | "removed" | "added"; text: string }> =
    [];
  let i = origWords.length;
  let j = rewrWords.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && origWords[i - 1] === rewrWords[j - 1]) {
      raw.push({ type: "unchanged", text: origWords[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      raw.push({ type: "added", text: rewrWords[j - 1] });
      j--;
    } else {
      raw.push({ type: "removed", text: origWords[i - 1] });
      i--;
    }
  }

  raw.reverse();

  // Merge consecutive same-type ops into segments; separate words with spaces
  const segments: DiffSegment[] = [];
  for (let k = 0; k < raw.length; k++) {
    const word = raw[k].text + (k < raw.length - 1 ? " " : "");
    const { type } = raw[k];
    const last = segments[segments.length - 1];
    if (last && last.type === type) {
      last.text += word;
    } else {
      segments.push({ text: word, type });
    }
  }

  return segments;
}
