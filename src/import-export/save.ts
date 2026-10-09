// Downloads the file. Returns whether it was saved (always, the browser takes care of the rest).
export async function saveFile(name: string, data: Uint8Array, mimeType: string) {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60 * 1000);
  return true;
}
