/**
 * STUB — Slice C contract.
 *
 * Per-element renderers each accept a `visibility: Visibility` prop and
 * decide what to do with it (`show`/`hide`/`summary`/`dim`). Slice C
 * implements the real components in `src/renderers/<X>.tsx`; this file
 * provides minimal placeholders so slice B (this slice) can be
 * developed, tested, and merged independently.
 *
 * Each stub renders nothing when `visibility === "hide"` so the App's
 * filter dispatch is observable end-to-end (the App test depends on
 * this).
 */

import { Text } from "ink";
import type { ReactElement } from "react";
import type {
  TextBlock,
  ThinkingBlock,
  ToolResultBlock,
  ToolUseBlock,
  Visibility,
} from "../types/events.ts";

interface CommonProps {
  visibility: Visibility;
}

interface ToolUseProps extends CommonProps {
  block: ToolUseBlock;
}

interface ToolResultProps extends CommonProps {
  block: ToolResultBlock;
}

interface ThinkingProps extends CommonProps {
  block: ThinkingBlock;
}

interface TextProps {
  block: TextBlock;
}

/** Helper: render nothing for `hide`, full block for `show`/`summary`/`dim`. */
function renderWithVisibility(
  visibility: Visibility,
  marker: string,
  body: string,
): ReactElement | null {
  if (visibility === "hide") return null;
  const prefix = visibility === "summary" ? "[summary] " : visibility === "dim" ? "[dim] " : "";
  return <Text>{`${prefix}${marker}: ${body}`}</Text>;
}

/**
 * Assistant text — always shown (not filterable per the spec).
 */
export function AssistantTextStub({ block }: TextProps): ReactElement {
  return <Text>{block.text}</Text>;
}

/**
 * Tool-call header — always shown (not filterable per the spec).
 * Body (Bash.input / Edit.diff / etc.) is filterable separately.
 */
export function ToolHeaderStub({ block }: { block: ToolUseBlock }): ReactElement {
  return <Text>{`> ${block.name}`}</Text>;
}

export function ThinkingStub({ block, visibility }: ThinkingProps): ReactElement | null {
  return renderWithVisibility(visibility, "thinking", block.thinking);
}

export function BashInputStub({ block, visibility }: ToolUseProps): ReactElement | null {
  const cmd = typeof block.input.command === "string" ? block.input.command : "";
  return renderWithVisibility(visibility, "Bash.input", cmd);
}

export function BashOutputStub({ block, visibility }: ToolResultProps): ReactElement | null {
  const body =
    typeof block.content === "string" ? block.content : block.content.map((c) => c.text).join("");
  return renderWithVisibility(visibility, "Bash.output", body);
}

export function EditDiffStub({ block, visibility }: ToolUseProps): ReactElement | null {
  return renderWithVisibility(visibility, "Edit.diff", JSON.stringify(block.input));
}

export function ReadContentStub({ block, visibility }: ToolResultProps): ReactElement | null {
  const body =
    typeof block.content === "string" ? block.content : block.content.map((c) => c.text).join("");
  return renderWithVisibility(visibility, "Read.content", body);
}

export function WriteContentStub({ block, visibility }: ToolUseProps): ReactElement | null {
  const content = typeof block.input.content === "string" ? block.input.content : "";
  return renderWithVisibility(visibility, "Write.content", content);
}

export function TaskNestedStub({ block, visibility }: ToolUseProps): ReactElement | null {
  const prompt = typeof block.input.prompt === "string" ? block.input.prompt : "";
  return renderWithVisibility(visibility, "Task.nested", prompt);
}

export function ErrorStub({
  message,
  visibility,
}: { message: string; visibility: Visibility }): ReactElement | null {
  return renderWithVisibility(visibility, "error", message);
}
