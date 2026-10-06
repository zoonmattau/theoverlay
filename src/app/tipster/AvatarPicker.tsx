"use client";

import { useState } from "react";

import { initials, TipsterAvatar } from "@/components/TipsterAvatar";

/**
 * Pick a letter or two, or upload a logo. The logo is cropped square from its
 * middle and shrunk to 256px in the browser, so a phone photo goes up as a few
 * kilobytes and shows as a circle everywhere.
 */
export function AvatarPicker({ name, letter, url, action }: { name: string; letter: string | null; url: string | null; action: (form: FormData) => Promise<void> }) {
  const [typed, setTyped] = useState(letter ?? "");
  const [image, setImage] = useState<string | null>(null);
  const [remove, setRemove] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    const bitmap = await createImageBitmap(file);
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    canvas.getContext("2d")!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 256, 256);
    setImage(canvas.toDataURL("image/jpeg", 0.88));
    setRemove(false);
  };

  const preview = { name, avatar_letter: typed || null, avatar_url: remove ? null : (image ?? url) };
  return (
    <form action={action} className="mt-3 flex flex-wrap items-end gap-4 text-sm">
      <TipsterAvatar tipster={preview} size={64} />
      <label className="field"><span>Letter</span><input name="letter" value={typed} onChange={(e) => setTyped(e.target.value.replace(/[^a-z0-9]/gi, "").slice(0, 3).toUpperCase())} className="field-input w-20 text-center" placeholder={initials(name)} /></label>
      <label className="field"><span>Or a logo</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => pick(e.target.files?.[0])} className="text-xs" /></label>
      {(url || image) && !remove && <button type="button" onClick={() => { setRemove(true); setImage(null); }} className="text-xs text-ink-soft underline pb-2">Remove logo</button>}
      <input type="hidden" name="image" value={image ?? ""} />
      <input type="hidden" name="remove" value={remove ? "1" : ""} />
      <button className="btn btn-secondary btn-sm" type="submit">Save</button>
    </form>
  );
}
