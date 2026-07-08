import type {
  ChatThreadData,
  ChatThreadListData,
  ChatWebSearchProgressEvent,
  ChatWebSourceData,
  LlmFeedbackRating,
} from "@/lib/intelligence-api";

export type ChatThreadListItem = ChatThreadListData["threads"][number];

export type ChatModelOption = {
  id: string;
  name: string;
  sub: string;
};

export type ChatCitation = {
  noteId: string;
  title: string;
  score?: number;
  sourcePath?: string;
  sourceFilename?: string;
};

export type ChatWebSource = ChatWebSourceData;

export type ChatRoute =
  | "NOTE_QA"
  | "WORKSPACE_SEARCH"
  | "COMPOSE"
  | "NOTE_ACTION"
  | "OUT_OF_SCOPE";

export type ChatStreamPhase = "ROUTING" | "WEB_SEARCHING" | "ANSWERING";

export type ChatMessageView = {
  id: string;
  role: "ai" | "user";
  text: string;
  modelId?: string;
  createdAt?: string;
  route?: ChatRoute;
  savedDraftNoteId?: string | null;
  llmRunId?: string | null;
  feedbackRating?: LlmFeedbackRating | null;
  requiresWebSearch?: boolean;
  webSearchQuery?: string | null;
  webSearchProgress?: ChatWebSearchProgressEvent | null;
  streamPhase?: ChatStreamPhase | null;
  streaming?: boolean;
  error?: boolean;
  citations?: ChatCitation[];
  webSources?: ChatWebSource[];
};

export type DraftNoteSaveStatus = "saving" | "saved" | "error";

export type DraftNoteSaveState = {
  status: DraftNoteSaveStatus;
  noteId?: string;
  error?: string;
};

export type ThreadDeleteCandidate = Pick<ChatThreadData, "threadId" | "title">;
