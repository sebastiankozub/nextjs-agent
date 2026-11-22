import { after } from "next/server";
import { generateConversationTitle } from "../conversation-title";
import { renameConversation } from "../conversations";

type TitleJob = { conversationId: number; userText: string; reply: string };

/**
 * Tytuł nowej rozmowy nadaje model PO odpowiedzi – w tle (after), żeby nie opóźniać czatu.
 * Trzeba wywołać `schedule` (jest co tytułować) albo `cancel` – inaczej after() czekałby w nieskończoność.
 */
export function deferConversationTitle() {
  let resolve: (job: TitleJob | null) => void = () => {};
  const job = new Promise<TitleJob | null>((r) => (resolve = r));
  after(async () => {
    const ready = await job;
    if (!ready) return;
    const title = await generateConversationTitle(ready.userText, ready.reply);
    if (title) await renameConversation(ready.conversationId, title);
  });
  return { schedule: (ready: TitleJob) => resolve(ready), cancel: () => resolve(null) };
}

export type ConversationTitleJob = ReturnType<typeof deferConversationTitle>;
