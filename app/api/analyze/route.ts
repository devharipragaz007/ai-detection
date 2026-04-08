import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import type { AnalysisResult } from "@/types/detection";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { text?: unknown };
  const text = body.text;

  if (typeof text !== "string" || text.trim().length === 0) {
    return NextResponse.json({ error: "Text is required" }, { status: 400 });
  }

  if (text.trim().length < 20) {
    return NextResponse.json(
      { error: "Text must be at least 20 characters" },
      { status: 400 }
    );
  }

  try {
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0.3,
      max_tokens: 1024,
      messages: [
        {
          role: "system",
          content:
            "You are an AI detection engine. Your job is to analyze text and determine the probability that it was written by an AI rather than a human. You must respond only in valid JSON. No explanation outside the JSON block. No markdown. No backticks.",
        },
        {
          role: "user",
          content: `Analyze the following text for AI-generated patterns.

Return this exact JSON structure:
{
  "score": <integer 0-100, likelihood of AI authorship>,
  "label": <"Likely AI-generated" | "Possibly AI-generated" | "Likely Human">,
  "sentences": [
    { "text": <exact sentence from input>, "score": <integer 0-100> }
  ],
  "explanation": [
    <2-3 plain English strings explaining why the text looks AI-written or human>
  ]
}

Rules:
- score above 70 → label must be "Likely AI-generated"
- score 40-70 → label must be "Possibly AI-generated"
- score below 40 → label must be "Likely Human"
- sentences array must use exact substrings from the input text
- explanation must be non-technical, readable by anyone

Text to analyze:
"""
${text}
"""`,
        },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? "";
    const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();

    let parsed: AnalysisResult;
    try {
      parsed = JSON.parse(stripped) as AnalysisResult;
    } catch {
      return NextResponse.json(
        { error: "Detection failed. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json(parsed);
  } catch (error) {
    console.error("Groq analyze error:", error);
    return NextResponse.json(
      { error: "Detection failed. Please try again." },
      { status: 500 }
    );
  }
}
