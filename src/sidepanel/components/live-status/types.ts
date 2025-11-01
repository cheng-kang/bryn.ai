export interface LiveStatusLinks {
  onQueue?: () => void;
  onIntents?: () => void;
  onPages?: () => void;
}

export type LiveStatusVariant = "overview" | "diagnostics";
