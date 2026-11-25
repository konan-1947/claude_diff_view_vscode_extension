# Sticky prompt header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Khi lăn lên trong Claude UI, ghim 1 dòng tin nhắn người dùng của turn đang ở đầu màn hình; bấm để cuộn tới bubble gốc.

**Architecture:** Một component overlay `StickyPrompt.vue` đặt trong `.main` (ngoài khung cuộn); `ChatPage.vue` đo vị trí turn trên scroll (gộp rAF) để chọn turn.

**Tech Stack:** Vue 3 SFC, TypeScript, Vite.

**Spec:** `docs/superpowers/specs/2026-11-25-sticky-prompt-header-design.md`

## Global Constraints
- Overlay, không layout shift; 1 dòng ellipsis; chỉ text; ẩn khi bubble gốc còn thấy, khi `dimTranscript`, khi không có tin nhắn.
- Không có test runner: cổng là `npm run typecheck` + `npm run compile` + thử tay.

## Review Focus
- Turn không có user message (tiếp nối) ở đầu màn hình → dải ẩn.
- Tin nhắn chỉ có ảnh (text rỗng) → dải ẩn.
- Đổi session / tin nhắn mới tự cuộn xuống đáy → dải cập nhật (ẩn).
- Resize pane (side bar ↔ Agent mode) → tính lại.
- Dải không che thanh cuộn (6px bên phải).

---

### Task 1: Text helper + StickyPrompt + wiring
**Files:** Create `webview-ui/claude/src/utils/userText.ts` (`userMessageText(message: Message): string`, dùng lại trong `UserMessage.vue`), Create `components/Messages/StickyPrompt.vue` (props `text: string`, emit `jump`), Modify `pages/ChatPage.vue` (`data-turn-key`, `stickyKey`, scroll/ResizeObserver, click → `scrollIntoView({ block: 'start' })`).
- [ ] Implement
- [ ] `npm run typecheck` + `npm run compile` pass
- [ ] Thử tay theo spec
