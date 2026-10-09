import { File } from "expo-file-system";

// Asks for a file to open, with the types it can be. Returns its content, or undefined if none was chosen.
export async function pickFile(accept: string[]): Promise<Uint8Array | undefined> {
  // (the system's picker knows types, not the endings of names)
  const result = await File.pickFileAsync({ mimeTypes: accept.filter((x) => x.includes("/")) });
  if (result.canceled) {
    return undefined;
  }
  return await result.result.bytes();
}
