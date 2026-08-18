import type { Generated } from 'kysely';

export interface ProjectTable {
  id: string; tenantId: string; userId: string; fileName: string; storageKey: string;
  totalChars: number; sliceCount: number; outline: string; status: number; errorMsg: string;
  tokensUsed: string; episodeCount: number; episodeDuration: number; splitMethod: string;
  modelId: string; unifiedCode: string; saasDramaId: number | null;
  createdAt: string; updatedAt: string;
}
export interface EpisodeTable {
  id: string; tenantId: string; projectId: string; epNum: number; title: string; summary: string;
  contentRaw: string; contentFinal: string; status: number; durationEst: number; sliceIds: string;
  createdAt: string; updatedAt: string;
}
export interface SegmentTable {
  id: string; tenantId: string; projectId: string; episodeId: string; epNum: number; seq: number;
  timeStart: string; timeEnd: string; sceneDesc: string; dialogue: string; actionDesc: string; emotion: string;
  videoPrompt: string; associatedRoles: string; dismissedRefs: string; startFrame: string; endFrame: string;
  improvementNotes: string; promptVersions: string; activeVersion: number; isInserted: number; status: number;
  videoUrl: string; createdAt: string; updatedAt: string;
}
export interface AssetTable {
  id: string; tenantId: string; projectId: string; name: string; type: string; description: string;
  imagePath: string; audioPath: string; importance: number; styleHint: string; promptVersions: string;
  activePromptVersion: number; posX: number; posY: number; createdAt: string; updatedAt: string;
}
export interface ProjectSettingTable {
  projectId: string; tenantId: string; segmentCount: number; segmentDuration: number; splittingMode: string;
  splittingScript: string; videoPromptScript: string; editorModelId: string; directorModelId: string;
  promptModelId: string; preScriptContent: string; selectedSchemeKey: string; isConfigured: number;
}
export interface JobTable {
  id: string; tenantId: string; userId: string; projectId: string | null; kind: string; status: string;
  progress: number; message: string; payload: string; result: string | null; error: string | null;
  createdAt: string; updatedAt: string;
}
export interface VideoGenerationTable {
  id: string; tenantId: string; userId: string; projectId: string; episodeId: string | null; segmentId: string | null;
  shotSeq: number; featurePointKey: string; modelName: string; prompt: string; params: string; status: string;
  rhTaskId: string; resultUrl: string; videoUrl: string; error: string; isFeatured: number; createdAt: string; updatedAt: string;
}

export interface LocalWalletTable {
  id: string; tenantId: string; userId: string; currency: string; balanceMinor: number;
  totalRechargedMinor: number; totalConsumedMinor: number; createdAt: string; updatedAt: string;
}
export interface PaymentOrderTable {
  id: string; tenantId: string; userId: string; provider: string; method: string; amountMinor: number; currency: string;
  status: string; idempotencyKey: string; providerSessionId: string | null; providerPaymentIntentId: string | null;
  checkoutUrl: string | null; metadata: string; createdAt: string; updatedAt: string; paidAt: string | null;
}
export interface PaymentEventTable {
  id: string; provider: string; eventType: string; payload: string; processedAt: string;
}
export interface CreditLedgerTable {
  id: string; tenantId: string; userId: string; currency: string; deltaMinor: number; source: string; sourceId: string;
  description: string; createdAt: string;
}

export interface Database {
  projects: ProjectTable;
  episodes: EpisodeTable;
  segments: SegmentTable;
  assets: AssetTable;
  project_settings: ProjectSettingTable;
  jobs: JobTable;
  video_generations: VideoGenerationTable;
  local_wallets: LocalWalletTable;
  payment_orders: PaymentOrderTable;
  payment_events: PaymentEventTable;
  credit_ledger: CreditLedgerTable;
}
