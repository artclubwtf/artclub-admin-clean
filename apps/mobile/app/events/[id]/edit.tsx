import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Text } from "react-native";

import { track } from "../../../src/analytics";
import { useAuth } from "../../../src/auth";
import { useTheme } from "../../../src/theme";
import { Button, Field, Loading, Page } from "../../../src/ui";

export default function EditEvent() {
  const { id } = useLocalSearchParams<{ id: string }>(); const { api } = useAuth(); const { colors } = useTheme(); const router = useRouter();
  const [event, setEvent] = useState<any>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useEffect(() => { void api.request(`/events/${id}`).then((data: any) => setEvent({ ...data.event, startAt: new Date(data.event.startAt).toISOString().slice(0, 16), endAt: data.event.endAt ? new Date(data.event.endAt).toISOString().slice(0, 16) : "" })).catch(() => setError("Event could not be loaded.")); }, [api, id]);
  async function save() { setBusy(true); try { await api.request(`/events/${id}`, { method: "PATCH", body: JSON.stringify({ title: event.title, description: event.description, startAt: new Date(event.startAt).toISOString(), ...(event.endAt ? { endAt: new Date(event.endAt).toISOString() } : {}), venueName: event.venueName, address: event.address, city: event.city, ticketUrl: event.ticketUrl }) }); void track(api, "event_edit", { eventId: id }); router.replace(`/events/${id}` as never); } catch (reason) { setError(reason instanceof Error ? reason.message.replaceAll("_", " ") : "Event could not be saved."); } finally { setBusy(false); } }
  if (!event && !error) return <Loading/>;
  return <Page title="Edit event"><Field label="Title" value={event?.title || ""} onChangeText={(title) => setEvent((value: any) => ({ ...value, title }))}/><Field label="Description" value={event?.description || ""} onChangeText={(description) => setEvent((value: any) => ({ ...value, description }))} multiline/><Field label="Starts" value={event?.startAt || ""} onChangeText={(startAt) => setEvent((value: any) => ({ ...value, startAt }))}/><Field label="Ends" value={event?.endAt || ""} onChangeText={(endAt) => setEvent((value: any) => ({ ...value, endAt }))}/><Field label="Venue" value={event?.venueName || ""} onChangeText={(venueName) => setEvent((value: any) => ({ ...value, venueName }))}/><Field label="Address" value={event?.address || ""} onChangeText={(address) => setEvent((value: any) => ({ ...value, address }))}/><Field label="City" value={event?.city || ""} onChangeText={(city) => setEvent((value: any) => ({ ...value, city }))}/><Field label="Ticket URL" value={event?.ticketUrl || ""} onChangeText={(ticketUrl) => setEvent((value: any) => ({ ...value, ticketUrl }))}/>{error ? <Text style={{ color: colors.danger, textTransform: "capitalize" }}>{error}</Text> : null}<Button label={busy ? "Saving…" : "Save event"} onPress={() => void save()} disabled={busy || !event?.title}/></Page>;
}
