"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import {
  ValidateProgressPanel,
  ValidateAbortedError,
  applyProgressEvent,
  initialProgressState,
  streamValidate,
  type ValidateProgressState,
} from "@/components/reviews/validate-progress";
import { Play } from "lucide-react";

const RESUMABLE = new Set(["validating", "cancelled", "failed"]);

export function canContinueValidate(status: string) {
  return RESUMABLE.has(status);
}

type ContinueValidateButtonProps = {
  sessionId: string;
  status: string;
  size?: "sm" | "default";
  className?: string;
  /** Sau khi xong: mặc định điều hướng tới chi tiết phiên */
  onCompleted?: (sessionId: string) => void;
  stopPropagation?: boolean;
};

export function ContinueValidateButton({
  sessionId,
  status,
  size = "sm",
  className,
  onCompleted,
  stopPropagation = false,
}: ContinueValidateButtonProps) {
  const router = useRouter();
  const abortRef = useRef<AbortController | null>(null);
  const stopSafetyRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const [progress, setProgress] = useState<ValidateProgressState>(initialProgressState);

  if (!canContinueValidate(status)) return null;

  function clearStopSafety() {
    if (stopSafetyRef.current) {
      clearTimeout(stopSafetyRef.current);
      stopSafetyRef.current = null;
    }
  }

  function handleStop() {
    setStopping(true);
    setProgress((prev) => ({
      ...prev,
      phaseMessage: "Đang dừng validate — hủy request...",
    }));
    abortRef.current?.abort();

    clearStopSafety();
    stopSafetyRef.current = setTimeout(() => {
      setStopping(false);
      setRunning(false);
      setProgress((prev) => {
        if (prev.status !== "running") return prev;
        return {
          ...prev,
          status: "cancelled",
          phaseMessage: "Đã dừng validate.",
          currentComment: null,
        };
      });
      toast.info("Đã dừng tiếp tục validate");
      abortRef.current = null;
    }, 6_000);
  }

  async function startContinue(e?: React.MouseEvent) {
    if (stopPropagation) {
      e?.preventDefault();
      e?.stopPropagation();
    }
    if (running) return;

    const controller = new AbortController();
    abortRef.current = controller;
    clearStopSafety();
    setRunning(true);
    setStopping(false);
    setShowProgress(true);
    setProgress({
      ...initialProgressState,
      status: "running",
      phaseMessage: "Đang tiếp tục validate từ comment còn lại...",
    });

    try {
      const id = await streamValidate(
        { sessionId },
        (event) => setProgress((prev) => applyProgressEvent(prev, event)),
        controller.signal,
      );

      setProgress((prev) => ({
        ...prev,
        status: "complete",
        percent: 100,
        phaseMessage: prev.phaseMessage || "Hoàn tất tiếp tục validate.",
        currentComment: null,
        sessionId: id ?? sessionId,
      }));
      toast.success("Đã tiếp tục validate xong");

      if (onCompleted) {
        await onCompleted(id ?? sessionId);
      } else {
        await new Promise((r) => setTimeout(r, 600));
        setShowProgress(false);
        router.push(`/reviews/${id ?? sessionId}`);
        router.refresh();
      }
    } catch (err) {
      if (err instanceof ValidateAbortedError || controller.signal.aborted) {
        setProgress((prev) => ({
          ...prev,
          status: "cancelled",
          phaseMessage: err instanceof Error ? err.message : "Đã dừng",
          currentComment: null,
        }));
        toast.info("Đã dừng tiếp tục validate");
      } else {
        const message =
          err instanceof Error ? err.message : "Tiếp tục validate thất bại";
        setProgress((prev) => ({
          ...prev,
          status: "error",
          error: message,
          phaseMessage: message,
          currentComment: null,
        }));
        toast.error(message);
      }
    } finally {
      clearStopSafety();
      setRunning(false);
      setStopping(false);
      abortRef.current = null;
    }
  }

  return (
    <>
      <ValidateProgressPanel
        state={progress}
        visible={showProgress}
        runningTitle="Đang tiếp tục validate..."
        onClose={() => {
          if (running) return;
          setShowProgress(false);
        }}
        onStop={handleStop}
        stopping={stopping}
      />
      <Button
        type="button"
        variant="outline"
        size={size}
        className={className}
        onClick={(e) => void startContinue(e)}
        loading={running}
        disabled={running}
      >
        {!running && <Play className="h-3.5 w-3.5 fill-current" />}
        {running ? "Đang tiếp tục..." : "Tiếp tục validate"}
      </Button>
    </>
  );
}
