import { useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  destructive,
  requireReason,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  requireReason?: boolean;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-[13px] text-muted-foreground">{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {requireReason && (
          <div className="space-y-1">
            <Label htmlFor="confirm-reason" className="text-[12px]">
              Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="confirm-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Enter the reason for this action"
              className="text-[13px]"
            />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel className="h-8 text-[13px]">Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={
              destructive
                ? "h-8 bg-destructive text-[13px] hover:bg-destructive/90"
                : "h-8 text-[13px]"
            }
            disabled={requireReason && reason.trim().length < 3}
            onClick={(e) => {
              if (requireReason && reason.trim().length < 3) {
                e.preventDefault();
                return;
              }
              onConfirm(reason);
              setReason("");
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
