import * as ImagePicker from "expo-image-picker";

export async function pickImages(multiple = false) {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error("Photo library permission is required.");
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: multiple, selectionLimit: multiple ? 10 : 1, quality: .9 });
  return result.canceled ? [] : result.assets;
}

export async function pickMedia(multiple = false) {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error("Photo library permission is required.");
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images", "videos"], allowsMultipleSelection: multiple, selectionLimit: multiple ? 10 : 1, quality: .9, videoMaxDuration: 60 });
  return result.canceled ? [] : result.assets;
}

export async function takePhoto() {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new Error("Camera permission is required.");
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: .9 });
  return result.canceled ? null : result.assets[0];
}

export function appendAsset(form: FormData, key: string, asset: ImagePicker.ImagePickerAsset) {
  form.append(key, { uri: asset.uri, name: asset.fileName || `artclub-${Date.now()}.jpg`, type: asset.mimeType || "image/jpeg" } as any);
}

export async function uploadAsset(api: any, asset: ImagePicker.ImagePickerAsset) {
  const form = new FormData(); appendAsset(form, "file", asset);
  const result = await api.request("/upload", { method: "POST", body: form });
  return result.media;
}
