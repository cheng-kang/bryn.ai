// User settings for AI resource management

export type AIIntensity = "light" | "balanced" | "comprehensive";

export interface UserSettings {
  aiIntensity: AIIntensity;
  maxConcurrentAI: number;
  enableVerification: boolean;
  enableMergeScans: boolean;
  enableTemporalSmoothing: boolean;
}

export const AI_INTENSITY_PRESETS: Record<AIIntensity, Partial<UserSettings>> = {
  light: {
    maxConcurrentAI: 1,
    enableVerification: false,
    enableMergeScans: false,
    enableTemporalSmoothing: true,
  },
  balanced: {
    maxConcurrentAI: 2,
    enableVerification: true,
    enableMergeScans: true,
    enableTemporalSmoothing: true,
  },
  comprehensive: {
    maxConcurrentAI: 3,
    enableVerification: true,
    enableMergeScans: true,
    enableTemporalSmoothing: false, // Faster processing
  },
};

export const DEFAULT_SETTINGS: UserSettings = {
  aiIntensity: "balanced",
  maxConcurrentAI: 2,
  enableVerification: true,
  enableMergeScans: true,
  enableTemporalSmoothing: true,
};



