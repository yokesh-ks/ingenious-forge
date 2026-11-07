import { type FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface RenameDialogProps {
  open: boolean;
  title: string;
  description?: string;
  /** What is being named, for the input. */
  label: string;
  initial: string;
  /** Saves the name; a rejection is shown in the dialog, which stays open. */
  onRename: (name: string) => Promise<void>;
  onClose: () => void;
}

export default function RenameDialog({
  open,
  title,
  description,
  label,
  initial,
  onRename,
  onClose,
}: RenameDialogProps) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(initial);
      setError(null);
    }
  }, [open, initial]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onRename(name);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {description ?? `Enter a new ${label.toLowerCase()}.`}
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label={label}
            value={name}
            autoFocus
            onChange={(event) => setName(event.target.value)}
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || name.trim() === ""}>
              Rename
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
