"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import Kbd from "@/components/ui/Kbd";
import { useTasks } from "@/lib/store-context";
import { toISODate } from "@/lib/parse";
import { isTypingTarget } from "@/lib/shortcuts";
import { TOUR, TOUR_START_EVENT, placeCard, type Rect, type TourGoal } from "@/lib/tour";

/** `committed` holds ids, so a swap on a full day still counts as committing a new task. */
type Metrics = { tasks: number; committed: string[]; timer: string | null };

/** What the frame loop last saw for a step: the lit element's box, and the card's size. */
type Seen = {
  id: string;
  status: "wait" | "found" | "none";
  rect: Rect | null;
  card: { width: number; height: number };
  view: { width: number; height: number };
};

/** Room around the lit element, so its own focus ring and edges stay visible. */
const PAD = 6;
/** How long to wait for a page to render the anchor before showing the card centred. */
const ANCHOR_WAIT_MS = 2500;
const DEFAULT_CARD = { width: 320, height: 220 };

function reached(goal: TourGoal, base: Metrics, now: Metrics): boolean {
  if (goal === "taskAdded") return now.tasks > base.tasks;
  if (goal === "committed") return now.committed.some((id) => !base.committed.includes(id));
  return now.timer !== base.timer;
}

function sameSeen(a: Seen | null, b: Seen): boolean {
  if (!a || a.id !== b.id || a.status !== b.status) return false;
  const r = a.rect, s = b.rect;
  const rectSame =
    r === s ||
    (!!r && !!s && r.top === s.top && r.left === s.left && r.width === s.width && r.height === s.height);
  return (
    rectSame &&
    a.card.width === b.card.width &&
    a.card.height === b.card.height &&
    a.view.width === b.view.width &&
    a.view.height === b.view.height
  );
}

/**
 * The in-app walkthrough. Goes to each step's page, lights up the real
 * element and holds the rest of the page still, with a card beside it. Steps
 * with a "Try it" move on by themselves once you've done it. Started from
 * What's new and the profile menu; never opens by itself.
 */
export default function Tour() {
  const router = useRouter();
  const pathname = usePathname();
  const { projects, tasks, running } = useTasks();
  const [run, setRun] = useState<{ index: number; base: Metrics } | null>(null);
  const [seen, setSeen] = useState<Seen | null>(null);
  const cardRef = useRef<HTMLElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();

  const project = projects.find((p) => !p.archived);
  const steps = useMemo(() => TOUR.filter((s) => s.route !== "project" || project), [project]);

  const metrics: Metrics = useMemo(() => {
    const today = toISODate(new Date());
    return {
      tasks: tasks.length,
      committed: tasks.filter((t) => t.committedOn === today).map((t) => t.id),
      timer: running?.taskId ?? null,
    };
  }, [tasks, running]);
  const metricsRef = useRef(metrics);
  useEffect(() => {
    metricsRef.current = metrics;
  });

  const go = useCallback(
    (index: number) => {
      if (index < 0) return;
      setRun(index >= steps.length ? null : { index, base: metricsRef.current });
    },
    [steps.length],
  );
  const end = useCallback(() => setRun(null), []);

  useEffect(() => {
    const start = (event: Event) => {
      const id = (event as CustomEvent<string | undefined>).detail;
      go(Math.max(0, steps.findIndex((s) => s.id === id)));
    };
    window.addEventListener(TOUR_START_EVENT, start);
    return () => window.removeEventListener(TOUR_START_EVENT, start);
  }, [go, steps]);

  const step = run ? steps[run.index] : null;
  const href = !step?.route ? null : step.route === "project" ? `/projects/${project?.id}` : step.route;

  // Open the step's page.
  useEffect(() => {
    if (href && pathname !== href) router.push(href);
  }, [href, pathname, router]);

  // Follow the anchor every frame: pages load data, lists grow, panes scroll.
  useEffect(() => {
    if (!step) return;
    let raf = 0;
    let el: Element | null = null;
    let scrolled = false;
    const started = performance.now();
    const tick = () => {
      const onPage = !href || window.location.pathname === href;
      if (step.anchor && onPage && (!el || !el.isConnected)) {
        el = document.querySelector(step.anchor);
        scrolled = false;
      }
      const box = el?.getBoundingClientRect();
      const visible = !!box && box.width > 0 && box.height > 0;
      if (visible && !scrolled) {
        el!.scrollIntoView({ block: "nearest", inline: "nearest" });
        scrolled = true;
      }
      const card = cardRef.current;
      const next: Seen = {
        id: step.id,
        status: visible
          ? "found"
          : !step.anchor || performance.now() - started > ANCHOR_WAIT_MS
            ? "none"
            : "wait",
        rect: visible
          ? { top: box!.top, left: box!.left, width: box!.width, height: box!.height }
          : null,
        card: card ? { width: card.offsetWidth, height: card.offsetHeight } : DEFAULT_CARD,
        view: { width: window.innerWidth, height: window.innerHeight },
      };
      setSeen((prev) => (sameSeen(prev, next) ? prev : next));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [step, href]);

  const current = step && seen?.id === step.id ? seen : null;
  const status = current?.status ?? "wait";
  const achieved = !!(run && step?.goal && reached(step.goal, run.base, metrics));

  // A finished "Try it" moves on after a beat, so the result is seen first.
  useEffect(() => {
    if (!achieved || !run) return;
    const t = setTimeout(() => go(run.index + 1), 1200);
    return () => clearTimeout(t);
  }, [achieved, run, go]);

  // Keyboard: Next takes focus unless the step wants you typing on the page.
  useEffect(() => {
    if (status !== "wait" && !step?.interactive) nextRef.current?.focus({ preventScroll: true });
  }, [status, step]);

  useEffect(() => {
    if (!run) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        end();
        return;
      }
      if (isTypingTarget(event.target)) return;
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        event.stopPropagation();
        go(run.index + (event.key === "ArrowRight" ? 1 : -1));
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [run, go, end]);

  if (!run || !step) return null;

  const view = current?.view ?? { width: 0, height: 0 };
  const hole =
    current?.rect && {
      top: Math.max(current.rect.top - PAD, 0),
      left: Math.max(current.rect.left - PAD, 0),
      width: Math.min(current.rect.width + PAD * 2, view.width),
      height: Math.min(current.rect.height + PAD * 2, view.height),
    };
  const pos = placeCard(hole || null, current?.card ?? DEFAULT_CARD, view, step.side);
  const last = run.index === steps.length - 1;
  const block = "fixed pointer-events-auto";

  return createPortal(
    <div data-testid="tour" className="pointer-events-none fixed inset-0 z-45">
      {hole ? (
        <>
          {/* Four panes around the lit element take the clicks meant for the rest of the page. */}
          <div className={block} style={{ top: 0, left: 0, right: 0, height: hole.top }} />
          <div className={block} style={{ top: hole.top + hole.height, left: 0, right: 0, bottom: 0 }} />
          <div className={block} style={{ top: hole.top, left: 0, width: hole.left, height: hole.height }} />
          <div
            className={block}
            style={{ top: hole.top, left: hole.left + hole.width, right: 0, height: hole.height }}
          />
          {!step.interactive && <div className={block} style={hole} />}
          <div
            aria-hidden
            className="fixed rounded-row shadow-[0_0_0_9999px_var(--color-scrim)] ring-2 ring-accent transition-[top,left,width,height] duration-200 ease-out"
            style={hole}
          />
        </>
      ) : (
        <div className={`${block} inset-0 ${status === "none" ? "bg-scrim" : ""}`} />
      )}

      {status !== "wait" && (
        // A region, not a dialog: the app turns task shortcuts off while any
        // dialog is open, and the tour wants them on (the commit step uses *).
        <section
          ref={cardRef}
          aria-labelledby={titleId}
          aria-describedby={bodyId}
          className="pointer-events-auto fixed flex w-80 flex-col gap-3 rounded-card bg-surface p-5 shadow-md ring-1 ring-line transition-[top,left] duration-200 ease-out"
          style={pos}
        >
          <p className="text-meta text-ink-3">
            {run.index + 1} of {steps.length}
          </p>
          <h2 id={titleId} className="-mt-2 text-title font-medium text-ink">
            {step.title}
          </h2>
          <p id={bodyId} className="text-secondary text-ink-2">
            {step.body}
          </p>
          {step.keys && (
            <ul className="flex flex-col gap-1.5">
              {step.keys.map((k) => (
                <li key={k.label} className="flex items-center justify-between gap-3 text-meta text-ink-3">
                  <span>{k.label}</span>
                  {k.combo ? (
                    <Kbd keys={k.keys} />
                  ) : (
                    <span className="flex items-center gap-1.5">
                      {k.keys.map((key) => (
                        <Kbd key={key}>{key}</Kbd>
                      ))}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {step.tryIt && (
            <p
              role="status"
              className="flex items-start gap-2 rounded-row bg-accent-soft px-3 py-2 text-meta text-accent"
            >
              <span className="mt-0.5 shrink-0">
                <Icon name={achieved ? "check" : "target"} size={14} />
              </span>
              {achieved ? "Done. On to the next step." : `Try it: ${step.tryIt}`}
            </p>
          )}
          <div className="mt-1 flex items-center gap-2">
            {!last && (
              <Button size="sm" onClick={end} className="-ml-3 mr-auto">
                End tour
              </Button>
            )}
            {run.index > 0 && (
              <Button size="sm" onClick={() => go(run.index - 1)} className={last ? "-ml-3 mr-auto" : ""}>
                Back
              </Button>
            )}
            <Button ref={nextRef} size="sm" variant="primary" onClick={() => go(run.index + 1)}>
              {run.index === 0 ? "Start" : last ? "Finish" : "Next"}
            </Button>
          </div>
        </section>
      )}
    </div>,
    document.body,
  );
}
