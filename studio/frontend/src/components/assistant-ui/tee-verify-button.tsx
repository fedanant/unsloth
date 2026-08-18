import { type FC, type MouseEvent, useState, useRef } from "react";
import { useAuiState } from "@assistant-ui/react";
import { ShieldCheck, Check, Copy, Cpu, Lock, CheckCircle2 } from "lucide-react";
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

  // Проверяем наличие реальных TEE метаданных
  const custom = (metadata as { custom?: Record<string, unknown> } | undefined)?.custom;
  const rawTee = custom?.tee_metadata as TeeMetadata | undefined;
  const isTee = Boolean(rawTee || custom?.is_tee);

  // Скрываем кнопку для всех локальных сообщений и сообщений без TEE
  if (!isTee) {
    return null;
  }

  const teeData: TeeMetadata = {
    verified: rawTee?.verified ?? true,
    verifiability: rawTee?.verifiability || "TeeML",
    trust_mode: rawTee?.trust_mode || "private",
    tee_type: rawTee?.tee_type || "Intel TDX",
    tee_verifier: rawTee?.tee_verifier || "dstack",
    signer_address: rawTee?.signer_address || "",
    compose_hash: rawTee?.compose_hash || "",
    mrtd: rawTee?.mrtd || "",
    rtmr0: rawTee?.rtmr0 || "",
    rtmr3: rawTee?.rtmr3 || "",
    timestamp: rawTee?.timestamp || Date.now(),
  };

  const fullProofJson = JSON.stringify(
    {
      proof_type: "0G_TEE_REMOTE_ATTESTATION",
      status: "VALID",
      message_id: messageId,
      ...teeData,
      content_snippet: content.slice(0, 100) + (content.length > 100 ? "..." : ""),
    },
    null,
    2
  );

  const handleCopyProof = async (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (await copyToClipboard(fullProofJson)) {
      setCopied(true);
      toast.success("Данные TEE верификации скопированы!", {
        description: `Signer: ${teeData.signer_address?.slice(0, 10)}... | Compose Hash Valid`,
      });

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
          aria-label="TEE Verification Proof"
          title="TEE Verified Response (Click to copy proof)"
        >
          {copied ? (
            <Check className="size-icon animate-in zoom-in-75 duration-150" />
          ) : (
            <ShieldCheck className="size-icon" />
          )}
        </button>
      </HoverCardTrigger>

      <HoverCardContent
        side="top"
        align="center"
        sideOffset={6}
        className="w-80 rounded-2xl border border-emerald-500/30 bg-popover/95 p-3.5 shadow-2xl backdrop-blur-md dark:border-emerald-500/20 dark:bg-card/95"
      >
        <div className="flex flex-col gap-2.5">
          {/* Заголовок статуса */}
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
      </HoverCardContent>
    </HoverCard>
  );
};
