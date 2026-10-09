import { Directory } from "expo-file-system";

// Saves the file in a folder that the user picks. Returns whether it was saved (not if the picking was cancelled).
export async function saveFile(name: string, data: Uint8Array, mimeType: string) {
  let directory: Directory;
  try {
    directory = await Directory.pickDirectoryAsync();
  } catch (e) {
    if ((e.code === "ERR_PICKER_CANCELLED") || /cancelled/i.test(e.message)) {
      return false;
    }
    throw e;
  }
  const file = directory.createFile(name, mimeType);
  file.write(data);
  return true;
}
