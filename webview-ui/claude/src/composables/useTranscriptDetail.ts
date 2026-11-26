import { ref } from 'vue';

/**
 * Ctrl+O: every turn's steps shown (the default) or folded behind "Worked for".
 * Only the turns follow it; thoughts, explored lists and tool cards always start
 * closed and open only with a click, so the step list stays one line per step.
 */
export const transcriptDetail = ref(true);

export function toggleTranscriptDetail(): void {
  transcriptDetail.value = !transcriptDetail.value;
}
