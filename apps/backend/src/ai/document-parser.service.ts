import { Injectable, BadRequestException } from "@nestjs/common";
import * as mammoth from "mammoth";

// pdf-parse ships no bundled types; import via require so TS doesn't complain.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;

const MAX_CHARS = 500_000;

@Injectable()
export class DocumentParserService {
  async parseDocument(file: Express.Multer.File): Promise<string> {
    const mime = file.mimetype ?? "";
    const ext  = (file.originalname ?? "").split(".").pop()?.toLowerCase() ?? "";

    let text: string;

    if (mime === "application/pdf" || ext === "pdf") {
      try {
        const result = await pdfParse(file.buffer);
        text = result.text;
      } catch (err) {
        throw new BadRequestException(
          `Failed to parse PDF: ${err instanceof Error ? err.message : "unknown error"}`,
        );
      }
    } else if (
      mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      ext === "docx"
    ) {
      try {
        let result: { value: string };
        try {
          // Try buffer approach first
          result = await mammoth.extractRawText({
            buffer: Buffer.from(file.buffer),
          });
        } catch {
          // Fallback: convert to ArrayBuffer
          const arrayBuffer = file.buffer.buffer.slice(
            file.buffer.byteOffset,
            file.buffer.byteOffset + file.buffer.byteLength,
          ) as ArrayBuffer;
          result = await mammoth.extractRawText({ arrayBuffer });
        }
        text = result.value;
      } catch (err) {
        throw new BadRequestException(
          `Failed to parse Word document: ${err instanceof Error ? err.message : "unknown error"}`,
        );
      }
    } else if (mime === "text/plain" || ext === "txt") {
      text = file.buffer.toString("utf-8");
    } else {
      throw new BadRequestException(
        `Unsupported file type: ${mime || ext || "unknown"}. Accepted formats: PDF, Word (.docx), plain text (.txt).`,
      );
    }

    if (!text.trim()) {
      throw new BadRequestException("Document appears to be empty or unreadable.");
    }

    if (text.length > MAX_CHARS) {
      console.warn(
        `[DocumentParser] Document truncated from ${text.length} to ${MAX_CHARS} chars (Groq context window safety limit)`,
      );
      text = text.slice(0, MAX_CHARS);
    }

    return text;
  }
}
