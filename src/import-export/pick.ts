// Asks for a file to open, with the types it can be. Returns its content, or undefined if none was chosen.
export function pickFile(accept: string[]): Promise<Uint8Array | undefined> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept.join(",");
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(undefined);
        return;
      }
      file.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)), reject);
    });
    input.addEventListener("cancel", () => resolve(undefined));
    input.click();
  });
}
