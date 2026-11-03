export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
export interface PublicAiAnswer {
  answer: string;
  model: string;
  generatedAt: string;
  incomplete: boolean;
  basis: {
    events: number;
    cameras: number;
    checkedAt: string;
    sources: { name: string; url: string; status: string }[];
  };
}
export function validateChat(input: unknown): ChatMessage[] {
  if (
    !input ||
    typeof input !== "object" ||
    !("messages" in input) ||
    !Array.isArray(input.messages) ||
    input.messages.length < 1 ||
    input.messages.length > 12
  )
    throw new Error("Диалог должен содержать от 1 до 12 сообщений.");
  const messages = input.messages.map((item: unknown) => {
    if (
      !item ||
      typeof item !== "object" ||
      !("role" in item) ||
      !("content" in item) ||
      !["user", "assistant"].includes(String(item.role)) ||
      typeof item.content !== "string" ||
      item.content.trim().length < 1 ||
      item.content.length > 2000
    )
      throw new Error("Неверное сообщение. Максимум 2000 символов.");
    return {
      role: item.role as ChatMessage["role"],
      content: item.content.trim(),
    };
  });
  if (messages.at(-1)?.role !== "user")
    throw new Error("Последним должен быть вопрос пользователя.");
  return messages;
}
