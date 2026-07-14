import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Linking, Share, Text, View } from "react-native";

import { track } from "../../src/analytics";
import { useAuth } from "../../src/auth";
import { useTheme } from "../../src/theme";
import { Avatar, Button, ErrorState, Loading, Page, Row, Section } from "../../src/ui";

export default function EventDetail() {
  const { id } = useLocalSearchParams<{ id: string }>(); const { api } = useAuth(); const { colors } = useTheme(); const router = useRouter(); const [event, setEvent] = useState<any>(null); const [error, setError] = useState("");
  const load = useCallback(async () => { try { const data = await api.request(`/events/${id}`); setEvent(data.event); setError(""); } catch { setError("This event could not be loaded."); } }, [api, id]);
  useEffect(() => { void load(); void track(api, "event_view", { eventId: id }); }, [load, api, id]);
  async function rsvp() { const result = await api.request(`/events/${id}/rsvp`, { method: event.attending ? "DELETE" : "POST" }); setEvent((value: any) => ({ ...value, ...result })); void track(api, result.attending ? "event_rsvp" : "event_rsvp_removed", { eventId: id }); }
  if (!event && !error) return <Loading/>; if (!event) return <ErrorState message={error} retry={load}/>;
  const place = [event.venueName, event.address, event.city, event.country].filter(Boolean).join(" · ");
  return <Page>{event.coverImageUrl ? <Image source={event.coverImageUrl} style={{ width: "100%", aspectRatio: 4 / 5, borderRadius: 4, backgroundColor: colors.surfaceMuted }} contentFit="cover"/> : null}<Text style={{ color: colors.text, fontSize: 29, lineHeight: 34, fontWeight: "600" }}>{event.title}</Text><Text style={{ color: colors.text, fontWeight: "600" }}>{new Date(event.startAt).toLocaleString()} · {event.timezone}</Text><Text style={{ color: colors.textMuted }}>{place || "Online event"}</Text><View style={{ flexDirection: "row", gap: 8 }}><View style={{ flex: 1 }}><Button label={event.attending ? "Going" : "RSVP"} icon={event.attending ? "checkmark" : "calendar-outline"} variant={event.attending ? "secondary" : "primary"} onPress={() => void rsvp()}/></View><View style={{ flex: 1 }}><Button label="Share" variant="secondary" icon="share-outline" onPress={() => void Share.share({ message: `https://network.artclub.wtf/events/${id}` })}/></View></View>{event.mine ? <Button label="Edit event" variant="secondary" icon="create-outline" onPress={() => router.push(`/events/${id}/edit` as never)}/> : null}{event.ticketUrl ? <Button label="Open tickets" variant="secondary" onPress={() => { void track(api, "event_ticket_click", { eventId: id }); void Linking.openURL(event.ticketUrl); }}/> : null}<Section title="About"><Text style={{ color: colors.text, lineHeight: 22 }}>{event.description || "No description provided."}</Text></Section><Section title={`${event.rsvpCount} attending`}><Row><Avatar profile={event.organizer}/><View><Text style={{ color: colors.text, fontWeight: "600" }}>{event.organizer?.displayName}</Text><Text style={{ color: colors.textMuted, fontSize: 12 }}>Organizer</Text></View></Row>{event.participants?.slice(0, 8).map((profile: any) => <Row key={profile.id}><Avatar profile={profile}/><Text style={{ color: colors.text }}>{profile.displayName}</Text></Row>)}</Section></Page>;
}
