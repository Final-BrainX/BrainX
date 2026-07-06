import type {
  ChatThreadData,
  ChatThreadListData,
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

export type ChatRoute =
  | "NOTE_QA"
  | "WORKSPACE_SEARCH"
  | "COMPOSE"
  | "NOTE_ACTION"
  | "OUT_OF_SCOPE";

export type ChatMessageView = {
  id: string;
  role: "ai" | "user";
  text: string;
  modelId?: string;
  createdAt?: string;
  route?: ChatRoute;
  streaming?: boolean;
  error?: boolean;
  citations?: ChatCitation[];
};

export type DraftNoteSaveStatus = "saving" | "saved" | "error";

export type DraftNoteSaveState = {
  status: DraftNoteSaveStatus;
  noteId?: string;
  error?: string;
};

export type ThreadDeleteCandidate = Pick<ChatThreadData, "threadId" | "title">;
