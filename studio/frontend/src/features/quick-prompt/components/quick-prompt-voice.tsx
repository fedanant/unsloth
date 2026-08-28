// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026-present the Unsloth AI Inc. team. All rights reserved. See /studio/LICENSE.AGPL-3.0

import { Button } from "@/components/ui/button";
import { transcribeAudioBlob } from "@/features/chat/adapters/studio-model-dictation-adapter";
import { startDictationLevelMeter, subscribeDictationLevel } from "@/features/chat/adapters/dictation-level";
import { toast } from "@/lib/toast";
import { MicIcon, SquareIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useQuickPromptStore } from "../stores/quick-prompt-store";

export function QuickPromptVoiceButton() {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [level, setLevel] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const cleanupMeterRef = useRef<(() => void) | null>(null);

  const setPromptText = useQuickPromptStore((s) => s.setPromptText);

  useEffect(() => {
    if (!isRecording) return;
    const unsubscribe = subscribeDictationLevel((lvl) => {
      setLevel(lvl);
    });
    return () => unsubscribe();
  }, [isRecording]);

  // Clean up recording on unmount
  useEffect(() => {
    return () => {
      stopRecordingCleanup();
    };
  }, []);

  const stopRecordingCleanup = () => {
    if (cleanupMeterRef.current) {
      cleanupMeterRef.current();
      cleanupMeterRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // Ignore
      }
      mediaRecorderRef.current = null;
    }
  };

  const handleToggleRecord = async () => {
    if (isRecording) {
      // Stop recording and transcribe
      setIsRecording(false);
      setLevel(0);
      setIsTranscribing(true);

      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.onstop = async () => {
          try {
            const mimeType = mediaRecorderRef.current?.mimeType || "audio/webm";
            const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
            stopRecordingCleanup();

            if (audioBlob.size > 0) {
              const transcript = await transcribeAudioBlob(audioBlob);
              if (transcript) {
                const current = useQuickPromptStore.getState().promptText;
                const separator = current && !current.endsWith(" ") ? " " : "";
                setPromptText(`${current}${separator}${transcript}`);
              }
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Transcription failed";
            toast.error(msg);
          } finally {
            setIsTranscribing(false);
          }
        };
        mediaRecorderRef.current.stop();
      } else {
        stopRecordingCleanup();
        setIsTranscribing(false);
      }
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      audioChunksRef.current = [];

      const cleanupMeter = startDictationLevelMeter(stream);
      cleanupMeterRef.current = cleanupMeter;

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.start(250);
      setIsRecording(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to access microphone";
      toast.error(msg);
      stopRecordingCleanup();
      setIsRecording(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      {isRecording && (
        <div className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-500 text-[11px] font-medium animate-pulse">
          <span
            className="inline-block size-1.5 rounded-full bg-red-500 transition-transform"
            style={{
              transform: `scale(${1 + level * 2.5})`,
            }}
          />
          <span className="ml-1">Recording…</span>
        </div>
      )}

      {isTranscribing && (
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground animate-pulse">
          <span>Transcribing…</span>
        </div>
      )}

      <Button
        type="button"
        variant={isRecording ? "destructive" : "ghost"}
        size="icon-sm"
        disabled={isTranscribing}
        onClick={() => void handleToggleRecord()}
        className={`size-8 rounded-lg transition-colors ${
          isRecording
            ? "bg-red-500 text-white hover:bg-red-600 shadow-sm"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
        title={isRecording ? "Stop and transcribe" : "Voice input (Whisper)"}
        aria-label={isRecording ? "Stop voice recording" : "Start voice recording"}
      >
        {isRecording ? (
          <SquareIcon className="size-3.5 fill-current" />
        ) : (
          <MicIcon className="size-4" />
        )}
      </Button>
    </div>
  );
}
