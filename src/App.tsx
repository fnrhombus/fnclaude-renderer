/**
 * Top-level Ink component. Owns:
 *
 * - the in-memory event log (`ClaudeEvent[]`, append-only per session)
 * - the filter state (`FilterState`)
 * - input handling (Alt+1-8, Alt+0/9, Ctrl+L/D/C, typed text + Enter)
 * - status surface (preset, override count, momentary toast)
 *
 * Filter applies at render time (see docs/filter-state-spec.md), so a
 * toggle re-renders the whole transcript from the log through the new
 * filter — Ink reconciles the screen diff.
 *
 * `subscribeToClaude` / `sendUserTurn` are imported from `./claude-process.ts`
 * (slice A's contract; stubbed locally until that slice merges).
 * Per-element renderers are imported from `./renderers/` (slice C;
 * stubbed locally until that slice merges).
 */

import { Box, Text, useInput } from "ink";
import { useEffect, useMemo, useRef, useState } from "react";
import { sendUserTurn, subscribeToClaude } from "./claude-process.ts";
import {
  cyclePreset,
  defaultState,
  overrideCount,
  resolve,
  toggleElement,
} from "./filter-state.ts";
import { type Key, dispatchKey } from "./keybinds.ts";
import {
  AssistantTextStub,
  BashInputStub,
  BashOutputStub,
  EditDiffStub,
  ErrorStub,
  ReadContentStub,
  TaskNestedStub,
  ThinkingStub,
  ToolHeaderStub,
  WriteContentStub,
} from "./renderers/index.tsx";
import type {
  AssistantEvent,
  ClaudeEvent,
  ContentBlock,
  FilterState,
  ResultEvent,
  ToolUseBlock,
  UserEvent,
} from "./types/events.ts";

const TOAST_DURATION_MS = 2000;

export interface AppProps {
  /**
   * Seed the event log. Omit (or pass `undefined`) to subscribe live to
   * claude via slice A's `subscribeToClaude`. Tests pass a fixed array
   * so they don't need a running subprocess.
   */
  initialEvents?: ClaudeEvent[];
  /**
   * Test hook: receives the same handler `useInput` registers, so a test
   * can drive input deterministically without a TTY. Production code
   * never passes this — Ink wires real stdin.
   */
  testInputBus?: (handler: (input: string, key: Key) => void) => void;
}

/**
 * Map an in-band tool name → its element-specific renderer (input side).
 * The header is always rendered separately and unfiltered.
 */
function ToolUseElement({
  block,
  filter,
}: { block: ToolUseBlock; filter: FilterState }): React.ReactElement | null {
  switch (block.name) {
    case "Bash": {
      const visibility = resolve("Bash.input", filter);
      return <BashInputStub block={block} visibility={visibility} />;
    }
    case "Edit": {
      const visibility = resolve("Edit.diff", filter);
      return <EditDiffStub block={block} visibility={visibility} />;
    }
    case "Write": {
      const visibility = resolve("Write.content", filter);
      return <WriteContentStub block={block} visibility={visibility} />;
    }
    case "Task": {
      const visibility = resolve("Task.nested", filter);
      return <TaskNestedStub block={block} visibility={visibility} />;
    }
    default:
      // Tool we don't have a dedicated element for — header alone.
      return null;
  }
}

/**
 * Map a tool_result block to its element-specific renderer. We need the
 * matching `tool_use` to know which element (Bash.output vs Read.content)
 * the result belongs to — pass the resolved tool name through.
 */
function ToolResultElement({
  block,
  toolName,
  filter,
}: {
  block: Extract<ContentBlock, { type: "tool_result" }>;
  toolName: string | undefined;
  filter: FilterState;
}): React.ReactElement | null {
  if (block.is_error === true) {
    const visibility = resolve("errors", filter);
    const body =
      typeof block.content === "string" ? block.content : block.content.map((c) => c.text).join("");
    return <ErrorStub message={body} visibility={visibility} />;
  }
  switch (toolName) {
    case "Bash": {
      const visibility = resolve("Bash.output", filter);
      return <BashOutputStub block={block} visibility={visibility} />;
    }
    case "Read": {
      const visibility = resolve("Read.content", filter);
      return <ReadContentStub block={block} visibility={visibility} />;
    }
    default:
      return null;
  }
}

function AssistantRender({
  event,
  filter,
}: { event: AssistantEvent; filter: FilterState }): React.ReactElement {
  return (
    <Box flexDirection="column">
      {event.message.content.map((block, idx) => {
        const k = `${event.uuid}-${idx}`;
        if (block.type === "text") {
          return <AssistantTextStub key={k} block={block} />;
        }
        if (block.type === "thinking") {
          const visibility = resolve("thinking", filter);
          return <ThinkingStub key={k} block={block} visibility={visibility} />;
        }
        if (block.type === "tool_use") {
          return (
            <Box key={k} flexDirection="column">
              <ToolHeaderStub block={block} />
              <ToolUseElement block={block} filter={filter} />
            </Box>
          );
        }
        return null;
      })}
    </Box>
  );
}

function UserRender({
  event,
  toolNameById,
  filter,
}: {
  event: UserEvent;
  toolNameById: Map<string, string>;
  filter: FilterState;
}): React.ReactElement {
  const content = event.message.content;
  if (typeof content === "string") {
    return <Text>{content}</Text>;
  }
  return (
    <Box flexDirection="column">
      {content.map((block, idx) => {
        const k = `${event.uuid ?? "user"}-${idx}`;
        if (block.type === "text") {
          return <Text key={k}>{block.text}</Text>;
        }
        if (block.type === "tool_result") {
          const toolName = toolNameById.get(block.tool_use_id);
          return <ToolResultElement key={k} block={block} toolName={toolName} filter={filter} />;
        }
        return null;
      })}
    </Box>
  );
}

function ResultRender({
  event,
  filter,
}: { event: ResultEvent; filter: FilterState }): React.ReactElement {
  if (event.is_error) {
    const visibility = resolve("errors", filter);
    return <ErrorStub message={event.result} visibility={visibility} />;
  }
  // result.result is always-shown content.
  return <Text>{event.result}</Text>;
}

export function App(props: AppProps): React.ReactElement {
  const { initialEvents, testInputBus } = props;
  const [events, setEvents] = useState<ClaudeEvent[]>(() => initialEvents ?? []);
  const [filter, setFilter] = useState<FilterState>(defaultState);
  const [draft, setDraft] = useState<string>("");
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Subscribe to slice A only when no initialEvents were provided — tests
  // pass a static log; production starts empty and ingests live.
  useEffect(() => {
    if (initialEvents !== undefined) return;
    let cancelled = false;
    (async () => {
      for await (const event of subscribeToClaude()) {
        if (cancelled) break;
        setEvents((prev) => [...prev, event]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialEvents]);

  // Build a tool_use_id → tool name index for tool_result dispatch.
  // Re-derived from the log on every render; cheap, log is in-memory.
  const toolNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const event of events) {
      if (event.type === "assistant") {
        for (const block of event.message.content) {
          if (block.type === "tool_use") m.set(block.id, block.name);
        }
      }
    }
    return m;
  }, [events]);

  const flashToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current !== null) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_DURATION_MS);
  };

  // Cleanup the toast timer on unmount.
  useEffect(() => {
    return () => {
      if (toastTimer.current !== null) clearTimeout(toastTimer.current);
    };
  }, []);

  const handleKey = (input: string, key: Key) => {
    const action = dispatchKey(input, key);
    if (action !== null) {
      switch (action.kind) {
        case "toggleElement":
          setFilter((f) => toggleElement(f, action.element));
          flashToast(`toggled ${action.element}`);
          return;
        case "cyclePreset":
          setFilter((f) => cyclePreset(f, action.direction));
          flashToast(action.direction === 1 ? "preset cycled forward" : "preset cycled backward");
          return;
        case "repaint":
          // Force a no-op state update to trigger a fresh paint. The
          // event log already lives in state, so React's reconciler
          // walks it again on any state change.
          setFilter((f) => ({ ...f }));
          flashToast("repaint");
          return;
        case "closeStdin":
          // Slice A owns the actual stdin close; for now, just emit a
          // toast so the keybind is observable.
          flashToast("close stdin (slice A)");
          return;
        case "interrupt":
          flashToast("interrupt (slice A)");
          return;
      }
      return;
    }
    // Text input: typed chars go into the draft; Enter submits.
    if (key.return) {
      if (draft.length > 0) {
        sendUserTurn(draft);
        setDraft("");
      }
      return;
    }
    if (key.backspace || key.delete) {
      setDraft((d) => d.slice(0, -1));
      return;
    }
    // Ignore control/meta-only inputs that didn't match a bind.
    if (key.ctrl || key.meta) return;
    if (input.length > 0) {
      setDraft((d) => d + input);
    }
  };

  // Production: register the handler with Ink. Tests: expose it via
  // testInputBus instead so they don't need real stdin.
  //
  // `handleKey` closes over draft/filter state but reads them via
  // setState callbacks where it matters — passing it through a ref
  // avoids re-running the testInputBus effect on every render while
  // still letting the test observe the latest closure.
  const handleKeyRef = useRef(handleKey);
  handleKeyRef.current = handleKey;
  useInput((input, key) => handleKeyRef.current(input, key as unknown as Key), {
    isActive: testInputBus === undefined,
  });
  useEffect(() => {
    if (testInputBus !== undefined) {
      testInputBus((input, key) => handleKeyRef.current(input, key));
    }
  }, [testInputBus]);

  const statusLine = (() => {
    const n = overrideCount(filter);
    const parts = [`preset: ${filter.preset}`];
    if (n > 0) parts.push(`${n} override${n === 1 ? "" : "s"}`);
    if (toast !== null) parts.push(toast);
    return parts.join("  |  ");
  })();

  return (
    <Box flexDirection="column">
      <Box flexDirection="column">
        {events.map((event) => {
          const key =
            "uuid" in event && event.uuid ? event.uuid : `${event.type}-${events.indexOf(event)}`;
          if (event.type === "assistant") {
            return <AssistantRender key={key} event={event} filter={filter} />;
          }
          if (event.type === "user") {
            return (
              <UserRender key={key} event={event} toolNameById={toolNameById} filter={filter} />
            );
          }
          if (event.type === "result") {
            return <ResultRender key={key} event={event} filter={filter} />;
          }
          // system / rate_limit_event: header-only, always shown.
          if (event.type === "system") {
            return null;
          }
          return null;
        })}
      </Box>
      {draft.length > 0 ? <Text>{`> ${draft}`}</Text> : null}
      <Text>{statusLine}</Text>
    </Box>
  );
}
