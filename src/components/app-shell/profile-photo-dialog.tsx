"use client";

import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/shared/badges";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { useData } from "@/lib/data/store";
import { useUI } from "@/lib/ui-state";

const ACCEPTED = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_BYTES = 5 * 1024 * 1024;
const OUTPUT_PX = 256;

/** Crops the image to a centred square and resizes it so it fits comfortably in local storage. */
async function toAvatarDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("unreadable"));
      el.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_PX;
    canvas.height = OUTPUT_PX;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.fillStyle = "#ffffff"; // transparent PNGs get a white background in the JPEG
    ctx.fillRect(0, 0, OUTPUT_PX, OUTPUT_PX);
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, OUTPUT_PX, OUTPUT_PX);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ProfilePhotoDialog() {
  const { profilePhotoOpen, setProfilePhotoOpen } = useUI();
  return (
    <Dialog open={profilePhotoOpen} onOpenChange={setProfilePhotoOpen}>
      <DialogContent size="sm">{profilePhotoOpen && <ProfilePhotoForm />}</DialogContent>
    </Dialog>
  );
}

function ProfilePhotoForm() {
  const { data, currentUserId, setMyAvatar } = useData();
  const { setProfilePhotoOpen } = useUI();
  const me = data.people.find((p) => p.id === currentUserId);
  const inputRef = useRef<HTMLInputElement>(null);
  // undefined = unchanged, null = remove, string = new photo
  const [pending, setPending] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!me) return null;

  const preview = pending === undefined ? me : { ...me, avatarUrl: pending };
  const hasPhoto = Boolean(preview.avatarUrl);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!ACCEPTED.includes(file.type)) return setError("Choose a PNG, JPG, WebP or GIF image.");
    if (file.size > MAX_BYTES) return setError("That image is over 5 MB. Choose a smaller one.");
    setBusy(true);
    try {
      setPending(await toAvatarDataUrl(file));
    } catch {
      setError("That image couldn't be read. Try another one.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const save = () => {
    if (pending === undefined) return setProfilePhotoOpen(false);
    const res = setMyAvatar(pending);
    if (!res.ok) return void toast.error(res.error);
    toast.success(pending ? "Profile photo updated" : "Profile photo removed");
    setProfilePhotoOpen(false);
  };

  return (
    <>
      <DialogHeader title="Your profile photo" description="Shown on your check-ins, tasks and anywhere your name appears." />
      <DialogBody className="flex flex-col items-center gap-4">
        <Avatar person={preview} size="xl" className="ring-2 ring-border" />
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED.join(",")}
          className="sr-only"
          tabIndex={-1}
          aria-label="Choose a profile photo"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="secondary" onClick={() => inputRef.current?.click()} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <ImagePlus />}
            {hasPhoto ? "Choose a different photo" : "Upload a photo"}
          </Button>
          {hasPhoto && (
            <Button variant="ghost" onClick={() => setPending(null)} disabled={busy}>
              <Trash2 />
              Remove
            </Button>
          )}
        </div>
        {error ? <p className="text-center text-xs font-medium text-[var(--error-fg)]">{error}</p> : <p className="text-center text-xs text-subtle">PNG, JPG, WebP or GIF, up to 5 MB. It&apos;s cropped to a square.</p>}
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={() => setProfilePhotoOpen(false)}>
          Cancel
        </Button>
        <Button variant="primary" onClick={save} disabled={busy || pending === undefined}>
          Save photo
        </Button>
      </DialogFooter>
    </>
  );
}
