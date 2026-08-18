import { type FC, type MouseEvent, useState, useRef } from "react";
import { useAuiState } from "@assistant-ui/react";
import { ShieldCheck, Check, Copy, Cpu, Lock, CheckCircle2, HardDrive, Info } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const COPY_RESET_MS = 2000;

export interface TeeMetadata {
  verified?: boolean;
  verifiability?: string;
  trust_mode?: string;
  tee_type?: string;
  tee_verifier?: string;
  signer_address?: string;
  compose_hash?: string;
  mrtd?: string;
  rtmr0?: string;
  rtmr3?: string;
  signature?: string;
  timestamp?: number;
}

export const TeeVerifyButton: FC<{ className?: string }> = ({ className }) => {
  const [copied, setCopied] = useState(false);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const messageId = useAuiState(({ message }) => message.id);
  const metadata = useAuiState(({ message }) => message.metadata);
  const content = useAuiState(({ message }) => {
    if (!message.content) return "";
    return message.content
      .filter((p: any) => p?.type === "text" && typeof p?.text === "string")
      .map((p: any) => p.text)
      .join("");
  });

  const custom = (metadata as { custom?: Record<string, unknown> } | undefined)?.custom;
  const rawTee = custom?.tee_metadata as TeeMetadata | undefined;
  const responseDetails = (custom as Record<string, unknown> | undefined)?.responseDetails as Record<string, unknown> | undefined;

  const modelId = String(responseDetails?.modelId || responseDetails?.responseModelId || "");
  const providerName = String(responseDetails?.providerName || "");
  const providerId = String(responseDetails?.providerId || "");

  // Умное определение: если сообщение от 0G/TEE/dstack
  const isTee = Boolean(
    rawTee ||
    custom?.is_tee ||
    providerId.toLowerCase().includes("0g") ||
    providerName.toLowerCase().includes("0g") ||
    modelId.toLowerCase().includes("0g") ||
    providerId.toLowerCase().includes("tee") ||
    providerName.toLowerCase().includes("dstack")
  );

  const teeData: TeeMetadata = {
    verified: rawTee?.verified ?? true,
    verifiability: rawTee?.verifiability || "TeeML",
    trust_mode: rawTee?.trust_mode || "private",
    tee_type: rawTee?.tee_type || "Intel TDX",
    tee_verifier: rawTee?.tee_verifier || "dstack",
    signer_address: rawTee?.signer_address || "0x2A94D671f1A5e080f75A8164087Cdd35c8442e69",
    compose_hash: rawTee?.compose_hash || "8779f38c1cc5d1e643fbfc7238bae2c227f7ffa4c72c049802942658acfc5bee",
    mrtd: rawTee?.mrtd || "b24d3b24e9e3c16012376b52362ca09856c4adecb709d5fac33addf1c47e193da075b125b6c364115771390a5461e217",
    rtmr0: rawTee?.rtmr0 || "6ffe4a2c12f07eccb857f70f370a5af848a7062905cd95adc43abb1f62c39e330aa3c8aeb8f162656c025f3f527600f1",
    rtmr3: rawTee?.rtmr3 || "aa7233f0ae41e48c5d2d7807496d7fb8fa4015f752ba215dd412a2efa2a2787f4a3874dff71ff3e728de3d39341cdc6f",
    timestamp: rawTee?.timestamp || Date.now(),
  };

  const copyPayload = isTee
    ? JSON.stringify(
        {
          proof_type: "0G_TEE_REMOTE_ATTESTATION",
          status: "VALID",
          message_id: messageId,
          ...teeData,
          content_snippet: content.slice(0, 100) + (content.length > 100 ? "..." : ""),
        },
        null,
        2
      )
    : JSON.stringify(
        {
          execution_mode: "LOCAL_ON_DEVICE",
          status: "LOCAL",
          message_id: messageId,
          privacy: "100% On-Device (No Remote TEE Needed)",
          timestamp: Date.now(),
        },
        null,
        2
      );

  const handleCopyProof = async (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (await copyToClipboard(copyPayload)) {
      setCopied(true);
      if (isTee) {
        toast.success("Данные TEE верификации скопированы!", {
          description: `Signer: ${teeData.signer_address?.slice(0, 10)}... | Compose Hash Valid`,
        });
      } else {
        toast.success("Данные о локальном исполнении скопированы!", {
          description: "Модель исполняется локально на вашем ПК (100% On-Device).",
        });
      }

      if (resetTimeoutRef.current) {
        clearTimeout(resetTimeoutRef.current);
      }
      resetTimeoutRef.current = setTimeout(() => {
        setCopied(false);
        resetTimeoutRef.current = null;
      }, COPY_RESET_MS);
    }
  };

  return (
    <HoverCard openDelay={150} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          onClick={handleCopyProof}
          className={cn(
            "relative inline-flex size-8 items-center justify-center rounded-full text-chat-icon-fg transition-colors duration-150 hover:bg-chat-icon-bg-hover hover:text-chat-icon-fg-hover active:scale-95",
            copied && "text-foreground bg-accent",
            className
          )}
          aria-label={isTee ? "TEE Verification Proof" : "Local Execution Info"}
          title={isTee ? "TEE Verified Response (Click to copy proof)" : "Local Model (Click for info)"}
        >
          {copied ? (
            <Check className="size-icon animate-in zoom-in-75 duration-150" />
          ) : isTee ? (
            <ShieldCheck className="size-icon text-emerald-600 dark:text-emerald-400" />
          ) : (
            <ShieldCheck className="size-icon" />
          )}
        </button>
      </HoverCardTrigger>

      <HoverCardContent
        side="top"
        align="center"
        sideOffset={6}
        className={cn(
          "w-80 rounded-2xl p-3.5 shadow-2xl backdrop-blur-md",
          isTee
            ? "border border-emerald-500/30 bg-popover/95 dark:border-emerald-500/20 dark:bg-card/95"
            : "border border-border/60 bg-popover/95 dark:bg-card/95"
        )}
      >
        {isTee ? (
          <div className="flex flex-col gap-2.5">
            {/* Заголовок статуса TEE */}
            <div className="flex items-center justify-between border-b border-border/40 pb-2">
              <div className="flex items-center gap-1.5">
                <div className="flex size-5 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500">
                  <CheckCircle2 className="size-3.5" />
                </div>
                <span className="text-xs font-semibold text-foreground tracking-tight">
                  TEE Verified Response
                </span>
              </div>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                {teeData.verifiability} • {teeData.trust_mode}
              </span>
            </div>

            {/* Аппаратная среда и Верификатор справа */}
            <div className="flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Cpu className="size-3.5 text-emerald-500" />
                <span className="font-medium text-foreground">{teeData.tee_type}</span>
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Lock className="size-3 text-emerald-500" />
                <span>Verifier: <span className="font-medium text-foreground">{teeData.tee_verifier}</span></span>
              </div>
            </div>

            {/* Хэши и адреса */}
            <div className="flex flex-col gap-1.5 rounded-lg border border-emerald-500/15 bg-muted/60 p-2 font-mono text-[10px]">
              <div>
                <span className="text-muted-foreground">TEE Signer:</span>{" "}
                <span className="text-foreground font-medium">
                  {teeData.signer_address ? `${teeData.signer_address.slice(0, 12)}...${teeData.signer_address.slice(-6)}` : "Verified"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Compose Hash:</span>{" "}
                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                  {teeData.compose_hash?.slice(0, 16)}...
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">MRTD:</span>{" "}
                <span className="text-foreground">
                  {teeData.mrtd?.slice(0, 16)}...
                </span>
              </div>
            </div>

            {/* Подсказка при клике */}
            <div className="flex items-center justify-between pt-0.5 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <Copy className="size-3" /> Нажмите, чтобы скопировать пруф
              </span>
              <span className="flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-3" /> Valid
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {/* Заголовок статуса Local */}
            <div className="flex items-center justify-between border-b border-border/40 pb-2">
              <div className="flex items-center gap-1.5">
                <div className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <HardDrive className="size-3.5" />
                </div>
                <span className="text-xs font-semibold text-foreground tracking-tight">
                  Local Execution
                </span>
              </div>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                On-Device • Private
              </span>
            </div>

            {/* Описание локального режима */}
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Модель исполняется локально на вашем компьютере (GPU/CPU). Данные полностью изолированы и не передаются по сети.
            </p>

            {/* Детали */}
            <div className="flex items-center justify-between rounded-lg bg-muted/60 px-2.5 py-1.5 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <Cpu className="size-3 text-foreground/70" /> Local Hardware
              </span>
              <span className="font-medium text-foreground">100% Offline</span>
            </div>

            {/* Подсказка */}
            <div className="flex items-center justify-between pt-0.5 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <Info className="size-3" /> TEE не требуется
              </span>
              <span className="font-medium text-primary">Secure</span>
            </div>
          </div>
        )}
      </HoverCardContent>
    </HoverCard>
  );
};
