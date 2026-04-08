import type { Sentence } from "@/types/detection";

export type HighlightSegment = {
  text: string;
  score: number | null;
};

export function mapSentencesToHighlights(
  originalText: string,
  sentences: Sentence[]
): HighlightSegment[] {
  const segments: HighlightSegment[] = [];
  let cursor = 0;

  for (const sentence of sentences) {
    if (!sentence.text) continue;
    const idx = originalText.indexOf(sentence.text, cursor);
    if (idx === -1) continue;

    // Capture any gap before this sentence
    if (idx > cursor) {
      segments.push({ text: originalText.slice(cursor, idx), score: null });
    }

    segments.push({ text: sentence.text, score: sentence.score });
    cursor = idx + sentence.text.length;
  }

  // Capture any remaining text after the last matched sentence
  if (cursor < originalText.length) {
    segments.push({ text: originalText.slice(cursor), score: null });
  }

  return segments;
}

export function scoreToColor(score: number | null): string {
  if (score === null) return "transparent";
  if (score >= 70) return "rgba(239, 68, 68, 0.25)";
  if (score >= 40) return "rgba(234, 179, 8, 0.25)";
  return "rgba(34, 197, 94, 0.25)";
}

export function scoreToBorder(score: number | null): string {
  if (score === null) return "transparent";
  if (score >= 70) return "rgba(239, 68, 68, 0.6)";
  if (score >= 40) return "rgba(234, 179, 8, 0.6)";
  return "rgba(34, 197, 94, 0.6)";
}
