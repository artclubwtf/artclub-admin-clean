import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Text } from "react-native";

import { useAuth } from "../../src/auth";
import { pickImages, uploadAsset } from "../../src/media";
import { useTheme } from "../../src/theme";
import { Button, Field, Page } from "../../src/ui";

export default function AddCollectionItem() {
  const { api } = useAuth(); const { colors } = useTheme(); const router = useRouter();
  const [artistName, setArtistName] = useState(""); const [artworkTitle, setArtworkTitle] = useState(""); const [note, setNote] = useState(""); const [asset, setAsset] = useState<any>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit() { setBusy(true); setError(""); try { const media = asset ? await uploadAsset(api, asset) : null; await api.request("/collection", { method: "POST", body: JSON.stringify({ customArtistName: artistName, customArtworkTitle: artworkTitle, customImageUrl: media?.url || "", customImageStorageKey: media?.storageKey, note, purchasePriceVisibility: "private", visibility: "private" }) }); router.replace("/profile"); } catch (reason) { setError(reason instanceof Error ? reason.message.replaceAll("_", " ") : "Collection item could not be saved."); } finally { setBusy(false); } }
  return <Page title="Add to collection" subtitle="Collection entries are private by default.">{asset ? <Image source={asset.uri} style={{ width: "100%", aspectRatio: 4 / 5, borderRadius: 4, backgroundColor: colors.surfaceMuted }}/> : null}<Button label={asset ? "Change image" : "Choose artwork image"} variant="secondary" icon="image-outline" onPress={() => void pickImages().then((items) => setAsset(items[0] || null)).catch((reason) => setError(reason.message))}/><Field label="Artist" value={artistName} onChangeText={setArtistName}/><Field label="Artwork title" value={artworkTitle} onChangeText={setArtworkTitle}/><Field label="Private note" value={note} onChangeText={setNote} multiline/>{error ? <Text style={{ color: colors.danger, textTransform: "capitalize" }}>{error}</Text> : null}<Button label={busy ? "Saving…" : "Save to collection"} onPress={() => void submit()} disabled={busy || !artistName || !artworkTitle}/></Page>;
}
