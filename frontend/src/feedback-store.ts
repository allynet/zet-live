import { create } from "zustand";

export type FeedbackState = {
  /**
   * Whether the feedback modal is currently shown. Ephemeral — not persisted
   * (always starts `false` on page load).
   */
  open: boolean;
};

export const feedbackStore = create<FeedbackState>()(() => ({
  open: false,
}));

export function useFeedbackOpen(): boolean {
  return feedbackStore((s) => s.open);
}

export function openFeedback(): void {
  feedbackStore.setState({ open: true });
}

export function closeFeedback(): void {
  feedbackStore.setState({ open: false });
}

export function setFeedbackOpen(open: boolean): void {
  feedbackStore.setState({ open });
}
