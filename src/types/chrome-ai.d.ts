// Chrome Built-in AI API Type Definitions
// Based on official Chrome extension samples and documentation

declare global {
  // ==================== PROMPT API (LanguageModel) ====================
  // Direct global class - NO ai namespace
  class LanguageModel {
    static availability(): Promise<
      "available" | "after-download" | "unavailable"
    >;
    static create(
      options?: LanguageModelCreateOptions
    ): Promise<LanguageModelSession>;
    static params(): Promise<LanguageModelParams>;
  }

  interface LanguageModelParams {
    defaultTemperature: number;
    defaultTopK: number;
    maxTopK: number;
  }

  interface LanguageModelCreateOptions {
    systemPrompt?: string;
    initialPrompts?: Array<{
      role: "system" | "user" | "assistant";
      content: string | Array<{ type: string; value: any }>;
    }>;
    temperature?: number;
    topK?: number;
    expectedInputs?: Array<{ type: string }>; // For multimodal (images, audio)
  }

  interface LanguageModelSession {
    prompt(input: string | Array<any>): Promise<string>;
    promptStreaming(input: string | Array<any>): ReadableStream;
    destroy(): void;
  }

  // ==================== SUMMARIZER API ====================
  // Direct global class - NO ai namespace
  class Summarizer {
    static availability(): Promise<
      "available" | "after-download" | "unavailable"
    >;
    static create(
      options?: SummarizerCreateOptions
    ): Promise<SummarizerSession>;
  }

  interface SummarizerCreateOptions {
    type?: "tl;dr" | "key-points" | "teaser" | "headline";
    format?: "plain-text" | "markdown";
    length?: "short" | "medium" | "long";
    sharedContext?: string;
  }

  interface SummarizerSession {
    summarize(text: string): Promise<string>;
    destroy(): void;
    ready?: Promise<void>;
    addEventListener?(event: string, handler: (e: any) => void): void;
  }

  // ==================== LANGUAGE DETECTOR API ====================
  // Direct global class - NO ai namespace
  class LanguageDetector {
    static availability(): Promise<
      "available" | "after-download" | "unavailable"
    >;
    static create(): Promise<LanguageDetectorSession>;
  }

  interface LanguageDetectorSession {
    detect(text: string): Promise<LanguageDetectorResult[]>;
    destroy(): void;
  }

  interface LanguageDetectorResult {
    detectedLanguage: string;
    confidence: number;
  }

  // ==================== TRANSLATION API ====================
  // Alternative access via translation global
  interface Translation {
    canDetect(): Promise<{ available: "readily" | "after-download" | "no" }>;
    createDetector(): Promise<LanguageDetectorSession>;
    canTranslate(options: {
      sourceLanguage: string;
      targetLanguage: string;
    }): Promise<"readily" | "after-download" | "no">;
    createTranslator(options: {
      sourceLanguage: string;
      targetLanguage: string;
    }): Promise<TranslatorSession>;
  }

  const translation: Translation | undefined;

  interface TranslatorSession {
    translate(text: string): Promise<string>;
    destroy(): void;
    ready?: Promise<void>;
    addEventListener?(event: string, handler: (e: any) => void): void;
  }

  // ==================== WRITER API (Origin Trial) ====================
  class Writer {
    static availability(): Promise<
      "available" | "after-download" | "unavailable"
    >;
    static create(options?: WriterCreateOptions): Promise<WriterSession>;
  }

  interface WriterCreateOptions {
    tone?: "casual" | "formal" | "neutral";
    format?: "plain-text" | "markdown";
    length?: "short" | "medium" | "long";
  }

  interface WriterSession {
    write(prompt: string, options?: { context?: string }): Promise<string>;
    destroy(): void;
  }

  // ==================== REWRITER API (Origin Trial) ====================
  class Rewriter {
    static availability(): Promise<
      "available" | "after-download" | "unavailable"
    >;
    static create(options?: RewriterCreateOptions): Promise<RewriterSession>;
  }

  interface RewriterCreateOptions {
    tone?: "as-is" | "more-formal" | "more-casual";
    format?: "plain-text" | "markdown";
    length?: "as-is" | "shorter" | "longer";
  }

  interface RewriterSession {
    rewrite(text: string): Promise<string>;
    destroy(): void;
  }

  // ==================== PROOFREADER API (Origin Trial) ====================
  class Proofreader {
    static availability(): Promise<
      "available" | "after-download" | "unavailable"
    >;
    static create(): Promise<ProofreaderSession>;
  }

  interface ProofreaderSession {
    proofread(text: string): Promise<string>;
    destroy(): void;
  }
}

export {};
