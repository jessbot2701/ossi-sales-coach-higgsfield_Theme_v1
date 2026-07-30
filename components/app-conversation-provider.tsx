"use client";

import {
  ConversationProvider,
  useConversationControls,
  useConversationStatus,
} from "@elevenlabs/react";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

type ConversationControls = ReturnType<typeof useConversationControls>;
type AppConversationContextValue = ConversationControls & {
  status: ReturnType<typeof useConversationStatus>["status"];
  isLocked: boolean;
};

const AppConversationContext = createContext<AppConversationContextValue | null>(null);
const INTERACTIVE_SELECTOR = "a,button,input,select,textarea,[role='button'],[role='link']";
const ALLOWED_SELECTOR = "[data-voice-session-allowed='true']";
const NAVIGATION_WARNING = "Das Voice-Gespräch läuft noch. Möchtest du es beenden und diese Seite verlassen?";

function SessionGuard({ children }: { children: ReactNode }) {
  const controls = useConversationControls();
  const { endSession } = controls;
  const { status } = useConversationStatus();
  const isLocked = status === "connecting" || status === "connected";
  const [notice, setNotice] = useState<string | null>(null);
  const navigationApproved = useRef(false);
  const guardEntryActive = useRef(false);

  const value = useMemo(() => ({
    ...controls,
    status,
    isLocked,
  }), [controls, status, isLocked]);

  useEffect(() => {
    if (!isLocked) {
      navigationApproved.current = false;
      if (guardEntryActive.current && window.history.state?.ossiVoiceSessionGuard) {
        guardEntryActive.current = false;
        window.history.back();
      }
      return;
    }

    const previousState = window.history.state;
    window.history.pushState({ ...previousState, ossiVoiceSessionGuard: true }, "", window.location.href);
    guardEntryActive.current = true;

    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (navigationApproved.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const popState = () => {
      if (navigationApproved.current) return;
      if (!window.confirm(NAVIGATION_WARNING)) {
        window.history.pushState({ ...previousState, ossiVoiceSessionGuard: true }, "", window.location.href);
        return;
      }
      navigationApproved.current = true;
      guardEntryActive.current = false;
      endSession();
      window.setTimeout(() => window.history.back(), 0);
    };

    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("popstate", popState);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("popstate", popState);
    };
  }, [endSession, isLocked]);

  function blockedTarget(target: EventTarget | null) {
    if (!isLocked || !(target instanceof Element)) return false;
    const interactive = target.closest(INTERACTIVE_SELECTOR);
    return Boolean(interactive && !interactive.closest(ALLOWED_SELECTOR));
  }

  function blockClick(event: MouseEvent<HTMLDivElement>) {
    if (!blockedTarget(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    setNotice("Während des Voice-Gesprächs sind App-Aktionen gesperrt. Auflegen und Abmelden bleiben verfügbar.");
  }

  function blockKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (!["Enter", " "].includes(event.key) || !blockedTarget(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    setNotice("Während des Voice-Gesprächs sind App-Aktionen gesperrt.");
  }

  return (
    <AppConversationContext.Provider value={value}>
      <div
        className={isLocked ? "voice-session-locked" : undefined}
        data-voice-session-status={status}
        onClickCapture={blockClick}
        onKeyDownCapture={blockKeyboard}
      >
        {children}
      </div>
      <p className="sr-only" role="status" aria-live="polite">{notice}</p>
    </AppConversationContext.Provider>
  );
}

export function AppConversationProvider({ children }: { children: ReactNode }) {
  return (
    <ConversationProvider serverLocation="eu-residency">
      <SessionGuard>{children}</SessionGuard>
    </ConversationProvider>
  );
}

export function useAppConversation() {
  const context = useContext(AppConversationContext);
  if (!context) throw new Error("useAppConversation must be used within AppConversationProvider.");
  return context;
}
