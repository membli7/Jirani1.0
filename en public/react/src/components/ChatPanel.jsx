import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadChatMessages, postChatMessage } from "../chatActions.mjs";

function messageTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: "Africa/Nairobi",
    }).format(date);
}

function mergeMessage(messages, incoming) {
  if (!incoming?.id) return messages;
  const byId = new Map(messages.map(message => [message.id, message]));
  byId.set(incoming.id, incoming);
  return [...byId.values()].slice(-100);
}

export default function ChatPanel() {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [streamLive, setStreamLive] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const messagesEndRef = useRef(null);
  const ownerRef = useRef({});
  const activeRef = useRef(false);
  const writeRequester = useMemo(
    () => window.chamaWriteRequests.createWriteRequester(),
    [],
  );

  const refreshMessages = useCallback(async () => {
    try {
      const nextMessages = await loadChatMessages();
      if (!activeRef.current) return;
      setMessages(nextMessages);
      setError("");
    } catch (requestError) {
      if (!activeRef.current) return;
      if (requestError.status === 401) window.dispatchEvent(new Event("chama:session-ended"));
      if (requestError.status === 403 && requestError.data?.mustChangePin) {
        setEnabled(false);
        setError("");
        return;
      }
      setError(requestError.message || "Messages could not be loaded.");
    } finally {
      if (activeRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    activeRef.current = true;
    const onMessagesUpdated = () => { if (enabled) void refreshMessages(); };
    const onStreamState = event => setStreamLive(event.detail?.live === true);
    const onDashboardReady = () => {
      setEnabled(true);
      void refreshMessages();
    };
    const onOnline = () => { if (enabled) void refreshMessages(); };
    window.addEventListener("chama:messages-updated", onMessagesUpdated);
    window.addEventListener("chama:stream-state", onStreamState);
    window.addEventListener("chama:dashboard-ready", onDashboardReady);
    window.addEventListener("online", onOnline);
    void refreshMessages();
    return () => {
      activeRef.current = false;
      window.removeEventListener("chama:messages-updated", onMessagesUpdated);
      window.removeEventListener("chama:stream-state", onStreamState);
      window.removeEventListener("chama:dashboard-ready", onDashboardReady);
      window.removeEventListener("online", onOnline);
    };
  }, [enabled, refreshMessages]);

  useEffect(() => {
    if (!enabled) return undefined;
    const interval = window.setInterval(() => {
      if (navigator.onLine) void refreshMessages();
    }, streamLive ? 30000 : 5000);
    return () => window.clearInterval(interval);
  }, [enabled, refreshMessages, streamLive]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!enabled || pending || !draft.trim()) return;
    setPending(true);
    setError("");
    setStatus("");
    try {
      const result = await postChatMessage({
        text: draft,
        owner: ownerRef.current,
        writeRequester,
      });
      if (!activeRef.current) return;
      setMessages(current => mergeMessage(current, result.data));
      setDraft("");
      setStatus(result.message || "Message sent.");
    } catch (requestError) {
      if (!activeRef.current) return;
      if (requestError.status === 401) window.dispatchEvent(new Event("chama:session-ended"));
      const message = requestError.uncertain
        ? window.chamaWriteRequests.unconfirmedMessage("Group chat")
        : requestError.message || "The message could not be sent. Try again.";
      setError(message);
    } finally {
      if (activeRef.current) setPending(false);
    }
  }

  return (
    <div className="chat-panel-content">
      <div className="panel-heading">
        <div>
          <h2 id="chat-title">Group chat</h2>
          <p>Visible to all active members. Messages cannot be edited or deleted. Showing the latest 100.</p>
        </div>
      </div>
      <div id="chat-messages" className="chat-messages" aria-live="polite" aria-busy={loading}>
        {loading && messages.length === 0 ? <p className="empty-state" role="status">Loading messages…</p> : null}
        {!loading && messages.length === 0 ? <p className="empty-state">No messages yet.</p> : null}
        {messages.map(message => (
          <article className="chat-message" key={message.id}>
            <strong>{message.authorName}</strong>
            <p>{message.text}</p>
            <time dateTime={message.at}>{messageTime(message.at)}</time>
          </article>
        ))}
        <div ref={messagesEndRef} />
      </div>
      {error ? <p className="notice error" role="alert">{error}</p> : null}
      {status ? <p className="notice" role="status">{status}</p> : null}
      <form id="chat-form" className="form-body" onSubmit={handleSubmit}>
        <label className="field" htmlFor="chat-text">
          Message
          <textarea
            id="chat-text"
            name="text"
            maxLength={500}
            required
            value={draft}
            onChange={event => setDraft(event.target.value)}
          />
        </label>
        <button className="button-primary" type="submit" disabled={pending || !draft.trim()}>
          {pending ? "Sending…" : "Send"}
        </button>
      </form>
    </div>
  );
}
