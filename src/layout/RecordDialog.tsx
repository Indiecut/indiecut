import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  createGainedMicStream,
  startVoiceoverCapture,
  type VoiceoverSession,
} from "../media/recordVoiceover";
import { setPreviewProjectMuted } from "../preview/audioMixer";
import { getEditorStore, useEditorStore } from "../store/editorStore";
import "./RecordDialog.css";

type Phase = "idle" | "countdown" | "recording" | "saving";

function formatTimer(ms: number): string {
  const totalSec = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map((n) => n.toString().padStart(2, "0")).join(":");
}

function LevelMeter({ analyser }: { analyser: AnalyserNode | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!analyser) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    let raf = 0;
    const bars = 40;

    const draw = () => {
      analyser.getByteFrequencyData(data);
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const barW = w / bars;
      for (let i = 0; i < bars; i++) {
        const idx = Math.floor((i / bars) * data.length);
        const v = (data[idx] ?? 0) / 255;
        const bh = Math.max(2, v * h);
        ctx.fillStyle = i / bars < 0.75 ? "#00c2cb" : "#e8a838";
        ctx.fillRect(i * barW + 1, h - bh, Math.max(1, barW - 2), bh);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [analyser]);

  return (
    <canvas
      ref={canvasRef}
      className="record-dialog__meter"
      width={280}
      height={28}
      aria-hidden
    />
  );
}

export function RecordDialog() {
  const open = useEditorStore((s) => s.recordDialogOpen);
  const setOpen = useEditorStore((s) => s.setRecordDialogOpen);
  const setCountdown = useEditorStore((s) => s.setRecordCountdown);
  const setPlaying = useEditorStore((s) => s.setPlaying);
  const projectPath = useEditorStore((s) => s.project.projectPath);

  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>("");
  const [volume, setVolume] = useState(100);
  const [echoReduction, setEchoReduction] = useState(true);
  const [muteProject, setMuteProject] = useState(false);
  const [micStatus, setMicStatus] = useState("Requesting microphone…");
  const [error, setError] = useState<string | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  const rawStreamRef = useRef<MediaStream | null>(null);
  const gainedRef = useRef<ReturnType<typeof createGainedMicStream> | null>(
    null,
  );
  const sessionRef = useRef<VoiceoverSession | null>(null);
  const startPlayheadRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const countdownRef = useRef<number | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origLeft: number;
    origTop: number;
  } | null>(null);

  const cleanupMic = useCallback(() => {
    gainedRef.current?.dispose();
    gainedRef.current = null;
    setAnalyser(null);
    rawStreamRef.current?.getTracks().forEach((t) => t.stop());
    rawStreamRef.current = null;
  }, []);

  const openMic = useCallback(async () => {
    cleanupMic();
    setError(null);
    try {
      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: echoReduction,
          noiseSuppression: echoReduction,
        },
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      rawStreamRef.current = stream;
      const gained = createGainedMicStream(stream, volume / 100);
      gainedRef.current = gained;
      setAnalyser(gained.analyser);
      setMicStatus("Microphone connected");

      const list = await navigator.mediaDevices.enumerateDevices();
      const inputs = list.filter((d) => d.kind === "audioinput");
      setDevices(inputs);
      if (!deviceId && inputs[0]?.deviceId) {
        setDeviceId(inputs[0].deviceId);
      }
    } catch (err) {
      setMicStatus("Microphone unavailable");
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [cleanupMic, deviceId, echoReduction, volume]);

  useEffect(() => {
    if (!open) {
      setPhase("idle");
      setElapsedMs(0);
      setCountdown(null);
      setPos(null);
      setPreviewProjectMuted(false);
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (countdownRef.current) {
        window.clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
      void sessionRef.current?.cancel();
      sessionRef.current = null;
      cleanupMic();
      return;
    }
    void openMic();
    return () => {
      /* keep mic while open; cleanup on close handled above */
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const onHeaderPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest(".record-dialog__close")) return;
    const el = dialogRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const left = pos?.left ?? rect.left;
    const top = pos?.top ?? rect.top;
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origLeft: left,
      origTop: top,
    };
    setPos({ left, top });
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onHeaderPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const el = dialogRef.current;
    const w = el?.offsetWidth ?? 360;
    const h = el?.offsetHeight ?? 200;
    const nextLeft = drag.origLeft + (e.clientX - drag.startX);
    const nextTop = drag.origTop + (e.clientY - drag.startY);
    const maxLeft = Math.max(8, window.innerWidth - w - 8);
    const maxTop = Math.max(8, window.innerHeight - h - 8);
    setPos({
      left: Math.min(maxLeft, Math.max(8, nextLeft)),
      top: Math.min(maxTop, Math.max(8, nextTop)),
    });
  };

  const onHeaderPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  };

  useEffect(() => {
    gainedRef.current?.setGain(volume / 100);
  }, [volume]);

  useEffect(() => {
    setPreviewProjectMuted(muteProject && open);
  }, [muteProject, open]);

  useEffect(() => {
    if (!open) return;
    void openMic();
  }, [deviceId, echoReduction]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopRecording = async () => {
    if (phase !== "recording" && phase !== "countdown") return;
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (countdownRef.current) {
      window.clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setCountdown(null);
    setPlaying(false);
    setPhase("saving");
    try {
      const session = sessionRef.current;
      sessionRef.current = null;
      if (session) await session.stop();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("idle");
    }
  };

  const beginCapture = async () => {
    const gained = gainedRef.current;
    if (!gained) {
      setError("Microphone not ready");
      return;
    }
    // Freeze during countdown; start preview + VO together at the same playhead.
    startPlayheadRef.current = getEditorStore().project.playheadMs;
    try {
      sessionRef.current = await startVoiceoverCapture({
        mediaStream: gained.stream,
        startPlayheadMs: startPlayheadRef.current,
      });
      setPhase("recording");
      setPlaying(true);
      setElapsedMs(0);
      const t0 = performance.now();
      timerRef.current = window.setInterval(() => {
        setElapsedMs(performance.now() - t0);
      }, 200);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("idle");
      setPlaying(false);
      setCountdown(null);
    }
  };

  const startCountdown = () => {
    if (!projectPath) {
      setError("Save or open a project before recording");
      return;
    }
    if (!gainedRef.current) {
      setError("Microphone not ready");
      return;
    }
    setError(null);
    setPhase("countdown");
    setElapsedMs(0);
    let n = 3;
    setCountdown(n);
    // Keep preview paused through 3→1 so recording and playback start together.
    setPlaying(false);
    countdownRef.current = window.setInterval(() => {
      n -= 1;
      if (n <= 0) {
        if (countdownRef.current) {
          window.clearInterval(countdownRef.current);
          countdownRef.current = null;
        }
        setCountdown(null);
        void beginCapture();
      } else {
        setCountdown(n);
      }
    }, 1000);
  };

  const onPrimaryClick = () => {
    if (phase === "idle") startCountdown();
    else if (phase === "countdown" || phase === "recording") {
      void stopRecording();
    }
  };

  const onClose = () => {
    if (phase === "recording" || phase === "countdown") {
      void stopRecording().finally(() => setOpen(false));
      return;
    }
    setOpen(false);
  };

  if (!open) return null;

  const statusLabel =
    phase === "countdown"
      ? "Waiting to record"
      : phase === "recording"
        ? "Recording…"
        : phase === "saving"
          ? "Saving…"
          : "Recording not started";

  const primaryHint =
    phase === "idle"
      ? "Click to start"
      : phase === "countdown" || phase === "recording"
        ? "Click to end recording"
        : "Saving…";

  return (
    <div
      ref={dialogRef}
      className="record-dialog"
      role="dialog"
      aria-label="Record"
      style={
        pos
          ? { left: pos.left, top: pos.top, right: "auto" }
          : undefined
      }
    >
      <div
        className="record-dialog__header"
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
        onPointerCancel={onHeaderPointerUp}
      >
        <h2 className="record-dialog__title">Record</h2>
        <button
          type="button"
          className="record-dialog__close"
          aria-label="Close"
          onClick={onClose}
        >
          ×
        </button>
      </div>

      <div className="record-dialog__body">
        <div className="record-dialog__status-row">
          <button
            type="button"
            className={
              phase === "recording" || phase === "countdown"
                ? "record-dialog__rec record-dialog__rec--stop"
                : "record-dialog__rec"
            }
            aria-label={primaryHint}
            disabled={phase === "saving"}
            onClick={onPrimaryClick}
          >
            {phase === "recording" || phase === "countdown" ? (
              <span className="record-dialog__stop-square" />
            ) : (
              <span className="record-dialog__rec-dot" />
            )}
          </button>
          <div className="record-dialog__timer-block">
            <div className="record-dialog__timer">{formatTimer(elapsedMs)}</div>
            <div className="record-dialog__status">{statusLabel}</div>
            <div className="record-dialog__hint">{primaryHint}</div>
          </div>
        </div>

        <LevelMeter analyser={analyser} />

        <label className="record-dialog__field">
          <span>Input device</span>
          <select
            value={deviceId}
            disabled={phase !== "idle"}
            onChange={(e) => setDeviceId(e.target.value)}
          >
            {devices.length === 0 ? (
              <option value="">Default</option>
            ) : (
              devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || "Microphone"}
                </option>
              ))
            )}
          </select>
          <span className="record-dialog__mic-status">{micStatus}</span>
        </label>

        <label className="record-dialog__field record-dialog__field--row">
          <span>Volume</span>
          <input
            type="range"
            min={0}
            max={200}
            value={volume}
            disabled={phase === "saving"}
            onChange={(e) => setVolume(Number(e.target.value))}
          />
          <input
            type="number"
            className="record-dialog__vol-num"
            min={0}
            max={200}
            value={volume}
            disabled={phase === "saving"}
            onChange={(e) => setVolume(Number(e.target.value) || 0)}
          />
        </label>
      </div>

      <div className="record-dialog__options">
        <label className="record-dialog__check">
          <input
            type="checkbox"
            checked={echoReduction}
            disabled={phase !== "idle"}
            onChange={(e) => setEchoReduction(e.target.checked)}
          />
          <span>
            <strong>Echo reduction</strong>
            <small>Turn on to avoid echo from the speaker</small>
          </span>
        </label>
        <label className="record-dialog__check">
          <input
            type="checkbox"
            checked={muteProject}
            onChange={(e) => setMuteProject(e.target.checked)}
          />
          <span>
            <strong>Mute project</strong>
            <small>
              Sounds in all clips will be turned off after Mute project turned
              on
            </small>
          </span>
        </label>
      </div>

      {error ? <p className="record-dialog__error">{error}</p> : null}
    </div>
  );
}
