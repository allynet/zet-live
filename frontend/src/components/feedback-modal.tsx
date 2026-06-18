import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_MAX_CONTACT_LEN,
  FEEDBACK_MAX_MESSAGE_LEN,
  FEEDBACK_MAX_NAME_LEN,
  feedbackPayloadSchema,
  type FeedbackCategory,
} from "@/app/entity/v1/feedback";
import { useFeedbackSubmit } from "@/hooks/use-feedback";
import { closeFeedback, openFeedback, useFeedbackOpen } from "@/feedback-store";
import { cn } from "@/utils/style";

type FieldErrors = {
  category?: string;
  message?: string;
  name?: string;
  contact?: string;
};

const INITIAL_CATEGORY: FeedbackCategory = "bug";

export function FeedbackModal() {
  const open = useFeedbackOpen();

  const [category, setCategory] = useState<FeedbackCategory>(INITIAL_CATEGORY);
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const submit = useFeedbackSubmit();
  const firstInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        closeFeedback();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    queueMicrotask(() => {
      firstInputRef.current?.focus();
    });
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function resetForm() {
    setCategory(INITIAL_CATEGORY);
    setMessage("");
    setName("");
    setContact("");
    setHoneypot("");
    setErrors({});
  }

  function handleClose() {
    if (submitting) return;
    closeFeedback();
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    const trimmedMessage = message.trim();
    const trimmedName = name.trim();
    const trimmedContact = contact.trim();

    const parsed = feedbackPayloadSchema.safeParse({
      category,
      message: trimmedMessage,
      name: trimmedName || undefined,
      contact: trimmedContact || undefined,
      website: honeypot,
    });

    if (!parsed.success) {
      const next: FieldErrors = {};
      const issues = parsed.error.issues;
      for (const issue of issues) {
        const key = issue.path[0];
        if (key === "category" || key === "message" || key === "name" || key === "contact") {
          if (!next[key]) {
            next[key] = issue.message;
          }
        }
      }
      setErrors(next);
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      const ok = await submit({
        category: parsed.data.category,
        message: parsed.data.message,
        name: parsed.data.name,
        contact: parsed.data.contact,
        website: parsed.data.website,
      });
      if (ok) {
        resetForm();
      }
    } finally {
      setSubmitting(false);
    }
  }

  const messageLen = message.length;

  return (
    <AnimatePresence>
      {open && (
        <div
          id="feedback-panel"
          className="pointer-events-auto fixed inset-0 z-2000 flex items-center justify-center"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-black/30"
            onClick={handleClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="bg-surface relative z-10 max-h-[85dvh] w-[90vw] max-w-md overflow-auto rounded-2xl shadow-xl"
            aria-label="Send feedback"
            aria-modal="true"
            aria-expanded="true"
          >
            <div className="bg-surface sticky top-0 flex items-center justify-between rounded-t-2xl px-4 py-2">
              <h2 className="text-on-surface text-base font-bold">Send feedback</h2>
              <button
                type="button"
                aria-label="Close feedback"
                aria-expanded={open}
                aria-controls="feedback-panel"
                onClick={handleClose}
                disabled={submitting}
                className="text-on-surface-faint hover:bg-surface-hover hover:text-on-surface-muted rounded-full p-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <form
              className="flex flex-col gap-4 px-5 pb-5"
              onSubmit={(e) => {
                e.preventDefault();
                void handleSubmit(e);
              }}
              noValidate
            >
              <Field label="Type" error={errors.category}>
                <div className="grid grid-cols-3 gap-2">
                  {FEEDBACK_CATEGORIES.map((c) => (
                    <CategorySelect
                      key={c.id}
                      selected={category === c.id}
                      title={c.label}
                      description={c.description}
                      onSelect={() => {
                        setCategory(c.id);
                      }}
                    />
                  ))}
                </div>
              </Field>

              <Field label="Message" error={errors.message}>
                <textarea
                  ref={firstInputRef}
                  value={message}
                  onChange={(e) => {
                    setMessage(e.target.value);
                  }}
                  maxLength={FEEDBACK_MAX_MESSAGE_LEN}
                  placeholder="What went wrong, or what would you like to see?"
                  rows={4}
                  className={cn(
                    "min-h-[96px] resize-y rounded-lg border px-3 py-2 text-sm transition-colors outline-none",
                    "border-outline bg-surface-dim text-on-surface placeholder:text-on-surface-faint focus:border-primary",
                    errors.message && "border-danger",
                  )}
                />
                <div className="text-on-surface-faint mt-1 text-right text-xs">
                  {messageLen} / {FEEDBACK_MAX_MESSAGE_LEN}
                </div>
              </Field>

              <Field label="Name (optional)" error={errors.name}>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                  }}
                  maxLength={FEEDBACK_MAX_NAME_LEN}
                  placeholder="Your name"
                  className={cn(
                    "rounded-lg border px-3 py-2 text-sm transition-colors outline-none",
                    "border-outline bg-surface-dim text-on-surface placeholder:text-on-surface-faint focus:border-primary",
                    errors.name && "border-danger",
                  )}
                />
              </Field>

              <Field label="Contact (optional)" error={errors.contact}>
                <input
                  type="text"
                  value={contact}
                  onChange={(e) => {
                    setContact(e.target.value);
                  }}
                  maxLength={FEEDBACK_MAX_CONTACT_LEN}
                  placeholder="Email or handle, if you want a reply"
                  className={cn(
                    "rounded-lg border px-3 py-2 text-sm transition-colors outline-none",
                    "border-outline bg-surface-dim text-on-surface placeholder:text-on-surface-faint focus:border-primary",
                    errors.contact && "border-danger",
                  )}
                />
              </Field>

              {/* Honeypot — must stay empty. Visually hidden from real users. */}
              <input
                type="text"
                value={honeypot}
                onChange={(e) => {
                  setHoneypot(e.target.value);
                }}
                name="website"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="absolute h-0 w-0 opacity-0"
                style={{ position: "absolute", left: "-9999px", top: "auto" }}
              />

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={submitting}
                  className="text-on-surface-variant hover:bg-surface-hover rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-primary text-on-primary hover:bg-primary-container hover:text-on-primary-container rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? "Sending…" : "Send"}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function Field(props: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-on-surface-muted text-xs font-semibold tracking-wide uppercase">
        {props.label}
      </span>
      {props.children}
      {props.error ? (
        <span className="text-on-danger-container text-xs font-medium">{props.error}</span>
      ) : null}
    </label>
  );
}

function CategorySelect(props: {
  selected: boolean;
  title: string;
  description: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={props.selected}
      tabIndex={0}
      onClick={props.onSelect}
      className={cn(
        "cursor-pointer rounded-lg border px-2 py-2 text-center text-sm font-medium transition-colors",
        props.selected
          ? "border-primary bg-primary-container text-on-primary-container"
          : "border-outline bg-surface text-on-surface-variant hover:bg-surface-hover",
      )}
    >
      <span className="block">{props.title}</span>
      <span className="text-on-surface-muted block text-[0.65rem] leading-tight font-normal">
        {props.description}
      </span>
    </button>
  );
}

export function FeedbackButton() {
  const open = useFeedbackOpen();

  return (
    <button
      type="button"
      aria-label="Send feedback"
      onClick={() => {
        openFeedback();
      }}
      aria-expanded={open}
      aria-controls="feedback-panel"
      title="Send feedback"
      className="bg-surface-overlay text-on-surface-variant hover:bg-surface flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg shadow-md backdrop-blur-sm transition-colors"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    </button>
  );
}
