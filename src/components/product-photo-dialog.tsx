import * as Dialog from "@radix-ui/react-dialog";
import { Maximize2, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ProductPhotoDialog({
  src,
  name,
  children,
  triggerClassName,
}: {
  src: string;
  name: string;
  children: ReactNode;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label={`View full-screen picture of ${name}`}
          className={cn(
            "group relative cursor-zoom-in overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-ring",
            triggerClassName,
          )}
        >
          {children}
          <span className="absolute right-1 bottom-1 grid h-5 w-5 place-items-center rounded-md bg-background/90 text-foreground opacity-80 shadow-sm transition-opacity group-hover:opacity-100">
            <Maximize2 size={11} aria-hidden="true" />
          </span>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/90 backdrop-blur-sm data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
          className="fixed inset-0 z-50 grid h-dvh w-screen grid-rows-[auto_minmax(0,1fr)_auto] gap-3 bg-background p-4 outline-none sm:p-6"
        >
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <Dialog.Title className="min-w-0 truncate text-base font-semibold">{name}</Dialog.Title>
            <Dialog.Close asChild>
              <Button
                variant="secondary"
                size="icon"
                aria-label="Close full-screen picture"
                className="h-11 w-11 shrink-0 rounded-xl"
              >
                <X size={20} />
              </Button>
            </Dialog.Close>
          </div>
          <div
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) setOpen(false);
            }}
            className="grid min-h-0 place-items-center overflow-hidden rounded-xl bg-card"
          >
            <img src={src} alt={name} className="block max-h-full max-w-full object-contain" />
          </div>
          <Dialog.Description className="truncate text-center text-sm text-muted-foreground">
            {name}
          </Dialog.Description>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
