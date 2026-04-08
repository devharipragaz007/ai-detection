import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import type { RewriteResult } from "@/types/detection";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { text?: unknown };
  const text = body.text;

  if (typeof text !== "string" || text.trim().length === 0) {
    return NextResponse.json({ error: "Text is required" }, { status: 400 });
  }

  try {
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0.3,
      max_tokens: 2048,
      messages: [
        {
          role: "system",
          content:
            "You are a writing assistant that rewrites AI-generated text to sound more natural and human. Preserve the original meaning exactly. Do not add new information. Do not remove key points. Return only the rewritten text. No explanation. No preamble. No markdown.",
        },
        {
          role: "user",
          content: `Rewrite the following text to sound more human and natural. Vary sentence structure. Use contractions where appropriate. Remove overly formal transitions. Keep the meaning identical.

Text:
"""
${text}
"""

Return only the rewritten text. Nothing else.`,
        },
      ],
    });

    const rewrite = response.choices[0]?.message?.content ?? "";
    if (!rewrite) {
      return NextResponse.json(
        { error: "Rewrite failed. Please try again." },
        { status: 500 }
      );
    }

    const result: RewriteResult = { rewrite };
    return NextResponse.json(result);
  } catch (error) {
    console.error("Groq rewrite error:", error);
    return NextResponse.json(
      { error: "Rewrite failed. Please try again." },
      { status: 500 }
    );
  }
}
