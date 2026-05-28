import { useEffect, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { animate, motion, useDragControls, useMotionValue } from "motion/react";

type SheetState = "minimized" | "expanded" | "maximized";

type Props = {
  open: boolean;
  title: ComponentChildren;
  onClose: () => void;
  children: ComponentChildren;
  minimizedBody?: ComponentChildren;
  expandedHeight?: string;
  maximizedHeight?: string;
};

type DragInfo = {
  offset: { x: number; y: number };
  velocity: { x: number; y: number };
};

const SPRING = { type: "spring" as const, damping: 25, stiffness: 300 };
const ENTER = { type: "tween" as const, duration: 0.3, ease: [0.32, 0.72, 0, 1] };
const DRAG_THRESHOLD = 50;
const VELOCITY_THRESHOLD = 500;

export function BottomSheet({
  open,
  title,
  onClose,
  children,
  minimizedBody,
  expandedHeight = "40dvh",
  maximizedHeight = "95dvh",
}: Props) {
  const [sheetState, setSheetState] = useState<SheetState>("expanded");
  const [rendered, setRendered] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const y = useMotionValue(0);
  const dragControls = useDragControls();

  const minimized = sheetState === "minimized";
  const maximized = sheetState === "maximized";

  const getDismissY = () => (sheetRef.current?.offsetHeight ?? 400) + 20;

  useEffect(() => {
    if (open) {
      setSheetState("expanded");
      y.set(2000);
      setRendered(true);
    }
  }, [open, y]);

  useEffect(() => {
    if (!rendered) return;

    if (open) {
      const sheetHeight = sheetRef.current?.offsetHeight ?? 300;
      y.set(sheetHeight);
      requestAnimationFrame(() => {
        animate(y, 0, ENTER);
      });
    } else {
      const sheetHeight = sheetRef.current?.offsetHeight ?? 300;
      animate(y, sheetHeight, {
        ...SPRING,
        onComplete: () => {
          setRendered(false);
        },
      });
    }
  }, [rendered, open, y]);

  if (!rendered) return null;

  return (
    <div class="pointer-events-none fixed right-0 bottom-0 left-0 z-999 flex justify-center">
      <motion.div
        aria-role="dialog"
        aria-label="Bottom sheet"
        aria-modal="true"
        role="dialog"
        ref={sheetRef}
        style={{ y }}
        animate={{
          maxHeight: maximized ? maximizedHeight : expandedHeight,
        }}
        initial={false}
        drag="y"
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={{ top: -150, bottom: getDismissY() }}
        dragElastic={0.1}
        dragMomentum={false}
        onDragEnd={(_: Event, info: DragInfo) => {
          const downPastThreshold =
            info.offset.y > DRAG_THRESHOLD || info.velocity.y > VELOCITY_THRESHOLD;
          const upPastThreshold =
            info.offset.y < -DRAG_THRESHOLD || info.velocity.y < -VELOCITY_THRESHOLD;

          if (sheetState === "minimized") {
            if (downPastThreshold) {
              animate(y, getDismissY(), { ...SPRING, onComplete: onClose });
            } else if (upPastThreshold) {
              animate(y, 0, SPRING);
              setSheetState("expanded");
            } else {
              animate(y, 0, SPRING);
            }
          } else if (sheetState === "expanded") {
            if (downPastThreshold) {
              animate(y, 0, SPRING);
              setSheetState("minimized");
            } else if (upPastThreshold) {
              animate(y, 0, SPRING);
              setSheetState("maximized");
            } else {
              animate(y, 0, SPRING);
            }
          } else {
            if (downPastThreshold) {
              animate(y, 0, SPRING);
              setSheetState("expanded");
            } else {
              animate(y, 0, SPRING);
            }
          }
        }}
        class="pointer-events-auto grid w-full max-w-md grid-rows-[auto_1fr_auto] overflow-hidden rounded-t-xl bg-white/90 shadow-lg backdrop-blur-sm"
        data-minimized={minimized ? "true" : "false"}
        data-maximized={maximized ? "true" : "false"}
      >
        <div
          onPointerDown={(e) => {
            dragControls.start(e);
          }}
          class="flex shrink-0 cursor-grab items-center justify-between gap-2 px-4 py-3 active:cursor-grabbing"
        >
          <div
            class="min-w-0 flex-1 select-none"
            onClick={() => {
              setSheetState((s) => (s === "minimized" ? "expanded" : "minimized"));
            }}
          >
            {title}
          </div>
          <div class="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setSheetState((s) => (s === "minimized" ? "expanded" : "minimized"));
              }}
              class="rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-200/60 hover:text-gray-600"
            >
              {minimized ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="18 15 12 9 6 15" />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              class="rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-200/60 hover:text-gray-600"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        <motion.div
          animate={{
            height: minimized ? 0 : "auto",
            opacity: minimized ? 0 : 1,
          }}
          transition={SPRING}
          class="max-h-full overflow-auto overscroll-y-contain"
        >
          {children}
        </motion.div>

        {minimizedBody && (
          <motion.div
            animate={{
              height: minimized ? "auto" : 0,
              opacity: minimized ? 1 : 0,
            }}
            transition={SPRING}
            class="overflow-hidden"
          >
            <div class="px-4 pb-3">{minimizedBody}</div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
