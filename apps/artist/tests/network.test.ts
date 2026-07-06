import { describe, expect, it } from "vitest";
import { canApplyConnectionAction, canCreateNetworkEvent, canSendNetworkMessage, canViewNetworkPost, collectionItemInputSchema, donationStatusForStripeEvent, networkEngagementRate, networkEventInputSchema, networkPostInputSchema, networkProfileInputSchema, networkSlug } from "@artclub/models";

describe("network permissions", () => {
  it("restricts event creation to eligible roles", () => { expect(canCreateNetworkEvent("artist")).toBe(true); expect(canCreateNetworkEvent("gallery")).toBe(true); expect(canCreateNetworkEvent("collector")).toBe(false); });
  it("requires recipient authority for pending requests", () => { expect(canApplyConnectionAction({ status:"pending", action:"accept", actorIsRecipient:true })).toBe(true); expect(canApplyConnectionAction({ status:"pending", action:"accept", actorIsRecipient:false })).toBe(false); });
  it("blocks messages regardless of open inbox", () => { expect(canSendNetworkMessage({ sameProfile:false, blocked:true, connected:true, recipientAllowsMessages:true })).toBe(false); expect(canSendNetworkMessage({ sameProfile:false, blocked:false, connected:false, recipientAllowsMessages:true })).toBe(true); });
  it("enforces post visibility", () => { expect(canViewNetworkPost({ visibility:"private",isOwner:false,connected:true,blocked:false })).toBe(false); expect(canViewNetworkPost({ visibility:"connections",isOwner:false,connected:true,blocked:false })).toBe(true); });
});

describe("network validation", () => {
  it("validates onboarding and normalizes usernames", () => { const result=networkProfileInputSchema.parse({profileType:"collector",displayName:"Ada",username:"ADA.COLLECTS"});expect(result.username).toBe("ada.collects"); });
  it("rejects empty posts", () => { expect(networkPostInputSchema.safeParse({type:"text",text:"",media:[]}).success).toBe(false); });
  it("requires a location for published events", () => { expect(networkEventInputSchema.safeParse({title:"Opening",startAt:new Date(),timezone:"Europe/Berlin",status:"published"}).success).toBe(false); });
  it("keeps external collection price private by default", () => { const value=collectionItemInputSchema.parse({customArtistName:"A",customArtworkTitle:"B"});expect(value.purchasePriceVisibility).toBe("private"); });
  it("generates stable safe artist slugs", () => { expect(networkSlug("Éva Müller Studio")).toBe("eva-muller-studio"); });
});

describe("donations and analytics", () => {
  it("does not overwrite paid donations with a failed event", () => { expect(donationStatusForStripeEvent({eventType:"payment_intent.payment_failed",currentStatus:"paid"})).toBe("paid"); });
  it("distinguishes partial and full refunds", () => { expect(donationStatusForStripeEvent({eventType:"charge.refunded",currentStatus:"paid",amount:1000,amountRefunded:500})).toBe("partially_refunded");expect(donationStatusForStripeEvent({eventType:"charge.refunded",currentStatus:"paid",amount:1000,amountRefunded:1000})).toBe("refunded"); });
  it("uses the documented engagement denominator", () => { expect(networkEngagementRate({likes:4,comments:1,saves:1,shares:1,messageClicks:1,postImpressions:60,profileViews:20})).toBe(10); });
});
