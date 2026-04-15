import { Injectable } from "@nestjs/common";
import { AiService } from "./ai.service";

export interface DuplicateMatch {
  id:         string;
  title:      string;
  similarity: "high" | "medium";
  reason:     string;
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  duplicates:  DuplicateMatch[];
}

interface CandidateCase {
  id:    string;
  title: string;
  steps: string;
}

const SYSTEM_PROMPT = `You are a QA engineer checking for duplicate test cases.
Analyze the candidate test case against the existing ones.
A duplicate means: same feature being tested, same scenario,
or steps that would catch the same bug even if worded differently.
Similar titles alone are NOT duplicates if they test different scenarios.
Return ONLY a valid JSON array containing exactly one object. No markdown, no explanation.`;

@Injectable()
export class DuplicateDetectorService {
  constructor(private readonly aiService: AiService) {}

  async findDuplicates(
    candidateTitle: string,
    candidateSteps: string,
    existingCases:  CandidateCase[],
  ): Promise<DuplicateCheckResult> {
    if (existingCases.length === 0) {
      return { isDuplicate: false, duplicates: [] };
    }

    // Cap at 200 — caller should pre-filter by suiteId to keep this small
    const cases = existingCases.slice(0, 200);

    const casesText = cases
      .map((c) => `ID: ${c.id}\nTitle: ${c.title}\nSteps: ${c.steps || "(none)"}`)
      .join("\n---\n");

    const userMessage = `Candidate test case:
Title: ${candidateTitle}
Steps: ${candidateSteps || "(none)"}

Existing test cases (check against these):
${casesText}

Return a JSON array containing exactly one object with this shape:
[{
  "isDuplicate": boolean,
  "duplicates": [
    {
      "id": "existing case id",
      "title": "existing case title",
      "similarity": "high | medium",
      "reason": "one sentence explaining why it is a duplicate"
    }
  ]
}]
Only include cases with similarity "high" or "medium".
If no duplicates found, return [{ "isDuplicate": false, "duplicates": [] }]`;

    try {
      const { cases: parsed } = await this.aiService.generateTestCasesWithPrompt(
        userMessage,
        SYSTEM_PROMPT,
      );

      // Providers return a JSON array; the result object is the first element
      const result = Array.isArray(parsed) && parsed.length > 0 ? parsed[0] : null;

      if (
        result &&
        typeof result === "object" &&
        typeof result.isDuplicate === "boolean" &&
        Array.isArray(result.duplicates)
      ) {
        // Sanitise each duplicate entry
        const duplicates: DuplicateMatch[] = result.duplicates
          .filter(
            (d: any) =>
              d &&
              typeof d.id === "string" &&
              typeof d.title === "string" &&
              (d.similarity === "high" || d.similarity === "medium") &&
              typeof d.reason === "string",
          )
          .map((d: any) => ({
            id:         d.id,
            title:      d.title,
            similarity: d.similarity as "high" | "medium",
            reason:     d.reason,
          }));

        return {
          isDuplicate: duplicates.length > 0,
          duplicates,
        };
      }

      // Unexpected shape — treat as no duplicates
      return { isDuplicate: false, duplicates: [] };
    } catch {
      // Never block saving due to detection failure
      return { isDuplicate: false, duplicates: [] };
    }
  }
}
