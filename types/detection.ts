export type Sentence = {
  text: string
  score: number
}

export type AnalysisResult = {
  score: number
  label: string
  sentences: Sentence[]
  explanation: string[]
}

export type RewriteResult = {
  rewrite: string
}
