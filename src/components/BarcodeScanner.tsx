import { useEffect, useRef } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function BarcodeScanner({
  open,
  onClose,
  onDetected,
}: {
  open: boolean;
  onClose: () => void;
  onDetected: (text: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    if (!open) return;
    const reader = new BrowserMultiFormatReader();
    let cancelled = false;

    (async () => {
      try {
        const controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current!,
          (result, _err, ctrl) => {
            if (cancelled) return;
            if (result) {
              ctrl.stop();
              onDetected(result.getText());
              onClose();
            }
          },
        );
        controlsRef.current = controls;
      } catch (e) {
        console.error("Camera error", e);
      }
    })();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
    };
  }, [open, onDetected, onClose]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Scan barcode</DialogTitle>
        </DialogHeader>
        <div className="rounded-lg overflow-hidden bg-black aspect-video">
          <video ref={videoRef} className="w-full h-full object-cover" />
        </div>
        <p className="text-xs text-muted-foreground text-center">
          Point your camera at a barcode. Allow camera access if prompted.
        </p>
      </DialogContent>
    </Dialog>
  );
}