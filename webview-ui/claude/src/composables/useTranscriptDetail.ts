import { ref } from 'vue';

/**
 * Ctrl+O, as in the CLI (detailed transcript): every turn unfolded and every
 * thought, explored list and tool card opened; Ctrl+O again goes back to the
 * compact view. Each of those components drops its own toggle when this
 * changes, so the switch always shows everything or nothing; a click in
 * between still opens or closes one item.
 */
export const transcriptDetail = ref(false);

export function toggleTranscriptDetail(): void {
  transcriptDetail.value = !transcriptDetail.value;
}
