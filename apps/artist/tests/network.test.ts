import { describe, expect, it } from "vitest";
import { canApplyConnectionAction, canCreateNetworkEvent, canSendNetworkMessage, canViewNetworkPost, collectionItemInputSchema, connectionViewState, donationStatusForStripeEvent, eventRsvpState, messageRequestInputSchema, networkEngagementRate, networkEventInputSchema, networkPostInputSchema, networkProfileInputSchema, networkSlug, stableFeedPage, zonedDateTimeToUtc } from "@artclub/models";

describe("network permissions", () => {
  it("restricts event creation to eligible roles", () => { expect(canCreateNetworkEvent("artist")).toBe(true); expect(canCreateNetworkEvent("gallery")).toBe(true); expect(canCreateNetworkEvent("collector")).toBe(false); });
  it("requires recipient authority for pending requests", () => { expect(canApplyConnectionAction({ status:"pending", action:"accept", actorIsRecipient:true })).toBe(true); expect(canApplyConnectionAction({ status:"pending", action:"accept", actorIsRecipient:false })).toBe(false); });
  it("shows an existing reverse request as incoming",()=>{expect(connectionViewState({status:"pending",requesterId:"a",viewerId:"b"})).toBe("incoming_pending");expect(connectionViewState({status:"pending",requesterId:"a",viewerId:"a"})).toBe("outgoing_pending")});
  it("blocks messages regardless of open inbox", () => { expect(canSendNetworkMessage({ sameProfile:false, blocked:true, connected:true, recipientAllowsMessages:true })).toBe(false); expect(canSendNetworkMessage({ sameProfile:false, blocked:false, connected:false, recipientAllowsMessages:true })).toBe(true); });
  it("enforces post visibility", () => { expect(canViewNetworkPost({ visibility:"private",isOwner:false,connected:true,blocked:false })).toBe(false); expect(canViewNetworkPost({ visibility:"connections",isOwner:false,connected:true,blocked:false })).toBe(true); });
});

describe("network validation", () => {
  it("validates onboarding and normalizes usernames", () => { const result=networkProfileInputSchema.parse({profileType:"collector",displayName:"Ada",username:"ADA.COLLECTS"});expect(result.username).toBe("ada.collects"); });
  it("rejects empty posts", () => { expect(networkPostInputSchema.safeParse({type:"text",text:"",media:[]}).success).toBe(false); });
  it("requires a location for published events", () => { expect(networkEventInputSchema.safeParse({title:"Opening",startAt:new Date(),timezone:"Europe/Berlin",status:"published"}).success).toBe(false); });
  it("keeps external collection price private by default", () => { const value=collectionItemInputSchema.parse({customArtistName:"A",customArtworkTitle:"B"});expect(value.purchasePriceVisibility).toBe("private"); });
  it("generates stable safe artist slugs", () => { expect(networkSlug("Éva Müller Studio")).toBe("eva-muller-studio"); });
  it("limits message requests to 100 characters",()=>{expect(messageRequestInputSchema.safeParse({profileId:"artist:123",text:"a".repeat(100)}).success).toBe(true);expect(messageRequestInputSchema.safeParse({profileId:"artist:123",text:"a".repeat(101)}).success).toBe(false)});
  it("paginates mixed feed items without repeating the cursor",()=>{const items=[{id:"post:b",sortDate:"2026-01-02"},{id:"artwork:a",sortDate:"2026-01-02"},{id:"post:a",sortDate:"2026-01-01"}];expect(stableFeedPage(items,{date:"2026-01-02",key:"post:b"},10).map(item=>item.id)).toEqual(["artwork:a","post:a"])});
  it("paginates events with posts and artworks without duplicates",()=>{const items=[{id:"event:c",sortDate:"2026-01-03"},{id:"post:b",sortDate:"2026-01-02"},{id:"artwork:a",sortDate:"2026-01-01"}];expect(stableFeedPage(items,{date:"2026-01-03",key:"event:c"},10).map(item=>item.id)).toEqual(["post:b","artwork:a"])});
  it("converts an explicit Berlin wall-clock time to UTC",()=>{expect(zonedDateTimeToUtc("2026-07-07T20:00","Europe/Berlin").toISOString()).toBe("2026-07-07T18:00:00.000Z")});
  it("blocks RSVP for past, cancelled and full events",()=>{const base={status:"published",rsvpEnabled:true,startAt:"2026-07-08T18:00:00Z",rsvpCount:0,now:"2026-07-07T18:00:00Z"};expect(eventRsvpState(base)).toBe("available");expect(eventRsvpState({...base,status:"cancelled"})).toBe("unavailable");expect(eventRsvpState({...base,startAt:"2026-07-06T18:00:00Z"})).toBe("past");expect(eventRsvpState({...base,capacity:1,rsvpCount:1})).toBe("full")});
});

describe("donations and analytics", () => {
  it("does not overwrite paid donations with a failed event", () => { expect(donationStatusForStripeEvent({eventType:"payment_intent.payment_failed",currentStatus:"paid"})).toBe("paid"); });
  it("distinguishes partial and full refunds", () => { expect(donationStatusForStripeEvent({eventType:"charge.refunded",currentStatus:"paid",amount:1000,amountRefunded:500})).toBe("partially_refunded");expect(donationStatusForStripeEvent({eventType:"charge.refunded",currentStatus:"paid",amount:1000,amountRefunded:1000})).toBe("refunded"); });
  it("uses the documented engagement denominator", () => { expect(networkEngagementRate({likes:4,comments:1,saves:1,shares:1,messageClicks:1,postImpressions:60,profileViews:20})).toBe(10); });
});
