"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import Icon from "@/components/ui/Icon";
import { useTasks } from "@/lib/store-context";
import {
  WHATS_NEW,
  WHATS_NEW_OPEN_EVENT,
  hasSeenWhatsNew,
  markWhatsNewSeen,
  type WhatsNewTarget,
} from "@/lib/whats-new";
import { startTour } from "@/lib/tour";

/**
 * "What's new" sheet. Opens by itself once per WHATS_NEW_VERSION, and again
 * from the profile menu. Same Dialog and row rhythm as the shortcut sheet.
 */
export default function WhatsNew() {
  const router = useRouter();
  const { projects, ready } = useTasks();
  const [asked, setAsked] = useState(false);
  const [closed, setClosed] = useState(false);

  // The first open waits for the store so "Show me" can find a project, and
  // so the sheet doesn't flash over the loading shell. `ready` is false on
  // the server, so localStorage is only read in the browser.
  const open = asked || (ready && !closed && !hasSeenWhatsNew());

  useEffect(() => {
    const show = () => setAsked(true);
    window.addEventListener(WHATS_NEW_OPEN_EVENT, show);
    return () => window.removeEventListener(WHATS_NEW_OPEN_EVENT, show);
  }, []);

  const close = () => {
    markWhatsNewSeen();
    setAsked(false);
    setClosed(true);
  };

  const project = projects.find((p) => !p.archived);
  const hrefFor = (target: WhatsNewTarget): string | null => {
    if (target === "project") return project ? `/projects/${project.id}` : null;
    if (target === "inbox") return "/inbox";
    if (target === "upcoming") return "/upcoming";
    if (target === "tracking") return "/tracking";
    return "/settings#projects";
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title="What's new"
      description="Projects and boards now behave the way they look."
      actions={
        <>
          <Button onClick={close}>Got it</Button>
          <Button
            variant="primary"
            onClick={() => {
              close();
              startTour();
            }}
          >
            Take the tour
          </Button>
        </>
      }
    >
      <div className="-mt-4 max-h-[60vh] overflow-y-auto">
        {WHATS_NEW.map((group) => (
          <section key={group.title}>
            <h3 className="px-3 pb-1 pt-4 text-meta font-normal text-ink-3">{group.title}</h3>
            <ul className="task-list">
              {group.items.map((item) => {
                const href = item.target ? hrefFor(item.target) : null;
                return (
                  <li key={item.title} className="flex items-start gap-3 rounded-row p-3">
                    <span
                      aria-hidden
                      className="grid size-8 shrink-0 place-items-center rounded-tile bg-sunk text-ink-2"
                    >
                      <Icon name={item.icon} size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-secondary font-medium text-ink">{item.title}</span>
                      <span className="mt-0.5 block text-meta text-ink-3">{item.body}</span>
                    </span>
                    {href && (
                      <Button
                        size="sm"
                        iconAfter="chev"
                        aria-label={`Show me: ${item.title}`}
                        onClick={() => {
                          close();
                          router.push(href);
                        }}
                        className="mt-0.5"
                      >
                        Show me
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
