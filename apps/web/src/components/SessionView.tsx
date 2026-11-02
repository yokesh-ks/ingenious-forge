import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Message, MessageContent } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";

interface SessionMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

export default function SessionView() {
  // Streaming real session events over the server's WebSocket is wired up
  // in a later story; this story only needs the scroller/message/bubble
  // shell to render correctly once messages exist.
  const messages: SessionMessage[] = [];

  if (messages.length === 0) {
    return (
      <section className="flex flex-1 items-center justify-center" aria-label="Session">
        <p className="text-sm text-muted-foreground">
          No messages yet. Send a task to get started.
        </p>
      </section>
    );
  }

  return (
    <MessageScrollerProvider autoScroll>
      <MessageScroller className="flex-1" aria-label="Session">
        <MessageScrollerViewport>
          <MessageScrollerContent className="mx-auto flex w-full max-w-3xl flex-col gap-6 py-6">
            {messages.map((message) => (
              <MessageScrollerItem
                key={message.id}
                messageId={message.id}
                scrollAnchor={message.role === "user"}
              >
                <Message align={message.role === "user" ? "end" : "start"}>
                  <MessageContent>
                    <Bubble align={message.role === "user" ? "end" : "start"} variant="muted">
                      <BubbleContent>{message.text}</BubbleContent>
                    </Bubble>
                  </MessageContent>
                </Message>
              </MessageScrollerItem>
            ))}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  );
}
