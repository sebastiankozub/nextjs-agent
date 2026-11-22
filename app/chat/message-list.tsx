import type { ChatStatus, UIMessage } from "ai";
import { AnswerStats, ModelUsed } from "./answer-stats";
import { MessagePart } from "./message-part";
import { lastHasText } from "./messages";
import { KnowledgeSources, Sources } from "./sources";
import { ToolLabels } from "./tool-labels";

type Props = {
  messages: UIMessage[];
  /** Powitanie w rozmowie zaczętej od zera – tylko widok, nie trafia do bazy ani do modelu. */
  greeting: string | null;
  /** Błędy przypięte do wiadomości (id wiadomości użytkownika → treść). */
  messageErrors: Record<string, string>;
  status: ChatStatus;
  generating: boolean;
};

export function MessageList({ messages, greeting, messageErrors, status, generating }: Props) {
  return (
    <section className="messages" aria-label="Rozmowa" aria-live="polite">
      {greeting && (
        <div className="message assistant greeting">
          <span className="author">Chatbot</span>
          <p>{greeting}</p>
        </div>
      )}
      {messages.map((message, index) => {
        const previous = messages[index - 1];
        return (
          <div key={message.id} className={`message ${message.role}`}>
            <span className="author">{message.role === "user" ? "Ty" : "Chatbot"}</span>
            <ToolLabels message={message} previous={previous} />
            {message.parts.map((part, i) => (
              <MessagePart key={i} part={part} message={message} />
            ))}
            <Sources message={message} />
            <KnowledgeSources message={message} />
            <ModelUsed message={message} previous={previous} />
            <AnswerStats message={message} />
            {messageErrors[message.id] && (
              <p className="msg-error" role="alert">
                ⚠️ {messageErrors[message.id]}
              </p>
            )}
          </div>
        );
      })}

      {status === "submitted" && <p className="pending typing">Agent pisze</p>}
      {status === "streaming" && !lastHasText(messages) && <p className="pending typing">Agent pracuje</p>}
      {generating && <p className="pending typing">Generuję obraz</p>}
    </section>
  );
}
