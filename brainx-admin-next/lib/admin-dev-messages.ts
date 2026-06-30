import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type DevAdminMessageScope = "ALL" | "SELECTED";

type DevAdminMessage = {
  messageId: string;
  senderAdminUserId: string;
  senderName: string;
  recipientScope: DevAdminMessageScope;
  recipientAdminUserIds: string[];
  body: string;
  sentAt: string;
  readByAdminUserIds: string[];
};

type DevAdminMessageStore = {
  messages: DevAdminMessage[];
};

const DEV_MESSAGE_DIR = path.join(process.cwd(), ".dev-data");
const DEV_MESSAGE_FILE = path.join(DEV_MESSAGE_DIR, "admin-messages.json");

async function readStore(): Promise<DevAdminMessageStore> {
  try {
    const raw = await readFile(DEV_MESSAGE_FILE, "utf8");
    const parsed = JSON.parse(raw) as DevAdminMessageStore;
    return Array.isArray(parsed.messages) ? parsed : { messages: [] };
  } catch {
    return { messages: [] };
  }
}

async function writeStore(data: DevAdminMessageStore) {
  await mkdir(DEV_MESSAGE_DIR, { recursive: true });
  await writeFile(DEV_MESSAGE_FILE, JSON.stringify(data, null, 2), "utf8");
}

function visibleToAdmin(message: DevAdminMessage, adminUserId: string) {
  return message.senderAdminUserId === adminUserId || message.recipientScope === "ALL" || message.recipientAdminUserIds.includes(adminUserId);
}

export async function listDevAdminMessages(adminUserId: string) {
  const data = await readStore();
  const messages = data.messages
    .filter((message) => visibleToAdmin(message, adminUserId))
    .sort((left, right) => new Date(left.sentAt).getTime() - new Date(right.sentAt).getTime())
    .map((message) => ({
      messageId: message.messageId,
      senderAdminUserId: message.senderAdminUserId,
      senderName: message.senderName,
      recipientScope: message.recipientScope,
      recipientAdminUserIds: message.recipientAdminUserIds,
      body: message.body,
      sentAt: message.sentAt,
      isRead: message.senderAdminUserId === adminUserId || message.readByAdminUserIds.includes(adminUserId)
    }));

  return {
    messages,
    unreadCount: messages.filter((message) => !message.isRead).length
  };
}

export async function createDevAdminMessage(input: {
  senderAdminUserId: string;
  senderName: string;
  recipientScope: DevAdminMessageScope;
  recipientAdminUserIds: string[];
  body: string;
}) {
  const data = await readStore();
  const nextMessage: DevAdminMessage = {
    messageId: `adm_msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    senderAdminUserId: input.senderAdminUserId,
    senderName: input.senderName,
    recipientScope: input.recipientScope,
    recipientAdminUserIds: input.recipientScope === "SELECTED" ? input.recipientAdminUserIds : [],
    body: input.body,
    sentAt: new Date().toISOString(),
    readByAdminUserIds: [input.senderAdminUserId]
  };

  data.messages.push(nextMessage);
  await writeStore(data);

  const list = await listDevAdminMessages(input.senderAdminUserId);
  return {
    message: list.messages.find((message) => message.messageId === nextMessage.messageId) ?? {
      messageId: nextMessage.messageId,
      senderAdminUserId: nextMessage.senderAdminUserId,
      senderName: nextMessage.senderName,
      recipientScope: nextMessage.recipientScope,
      recipientAdminUserIds: nextMessage.recipientAdminUserIds,
      body: nextMessage.body,
      sentAt: nextMessage.sentAt,
      isRead: true
    },
    unreadCount: list.unreadCount
  };
}

export async function readDevAdminMessage(adminUserId: string, messageId: string) {
  const data = await readStore();
  const message = data.messages.find((item) => item.messageId === messageId && visibleToAdmin(item, adminUserId));
  if (!message) {
    return null;
  }
  if (!message.readByAdminUserIds.includes(adminUserId)) {
    message.readByAdminUserIds.push(adminUserId);
    await writeStore(data);
  }
  return {
    messageId,
    unreadCount: (await listDevAdminMessages(adminUserId)).unreadCount
  };
}
