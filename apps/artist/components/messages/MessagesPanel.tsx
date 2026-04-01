"use client";

import { useState } from "react";

import { StatusMessage } from "@/components/forms/StatusMessage";
import { Button } from "@/components/primitives/Button";
import { PageTitle } from "@/components/primitives/PageTitle";
import { Section } from "@/components/primitives/Section";

type MessageItem = {
  id: string;
  senderRole: "artist" | "team";
  text: string;
  createdAt?: string | Date;
};

type MessagesPanelProps = {
  initialMessages: MessageItem[];
};

export function MessagesPanel({ initialMessages }: MessagesPanelProps) {
  const [messages, setMessages] = useState(initialMessages);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    const res = await fetch("/api/artist/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const json = (await res.json().catch(() => null)) as
      | { ok?: boolean; error?: string; message?: MessageItem }
      | null;
    if (!res.ok || !json?.message) {
      setStatus(json?.error || "Could not send message.");
      return;
    }
    setMessages((current) => [...current, json.message as MessageItem]);
    setText("");
  }

  return (
    <div className="space-y-8">
      <PageTitle title="Messages" subtitle="Real artist workspace messages. No mock threads." />

      <Section title="Conversation" subtitle={`${messages.length} messages`}>
        <div className="space-y-3">
          {messages.length ? (
            messages.map((message) => (
              <div key={message.id} className={`rounded-[1.5rem] px-4 py-4 text-sm leading-6 ${message.senderRole === "artist" ? "bg-neutral-950 text-white" : "bg-neutral-100 text-neutral-700"}`}>
                {message.text}
              </div>
            ))
          ) : (
            <div className="rounded-[1.75rem] bg-neutral-50 px-4 py-4 text-sm text-neutral-500">No messages yet.</div>
          )}
        </div>
      </Section>

      <Section title="Send message" subtitle="Messages are stored on the existing artist workspace thread.">
        <form className="space-y-4" onSubmit={sendMessage}>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="min-h-28 w-full rounded-[1.75rem] bg-neutral-100 px-4 py-3.5 text-[15px] text-neutral-950 placeholder:text-neutral-400 focus-visible:bg-neutral-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-950/10"
            placeholder="Write a message to the ARTCLUB team"
          />
          {status ? <StatusMessage tone="error">{status}</StatusMessage> : null}
          <Button type="submit">Send</Button>
        </form>
      </Section>
    </div>
  );
}
