import { messageRequestInputSchema } from "@artclub/models";
import { requireNetworkApiContext } from "@/lib/server/network-context";
import { apiError, connectionState, notify, profilePairKey } from "@/lib/server/network-service";
import { materializeUnifiedProfile } from "@/lib/server/unified-profile";
import { ConnectionModel, NetworkMessageRequestModel } from "@/lib/server/models";
export async function POST(req: Request) {
  const auth=await requireNetworkApiContext();if(!auth.ok)return auth.response;
  const parsed=messageRequestInputSchema.safeParse(await req.json().catch(()=>null));if(!parsed.success)return apiError("invalid_message_request",400,parsed.error.flatten());
  const target=await materializeUnifiedProfile(parsed.data.profileId);if(!target)return apiError("profile_not_found",404);if(String(target._id)===String(auth.context.profile._id))return apiError("cannot_message_self",409);
  let connection:any=await connectionState(auth.context.profile._id,target._id);if(connection?.status==="blocked")return apiError("profile_blocked",403);if(connection?.status==="accepted")return apiError("already_connected",409);if(connection?.status==="pending"&&String(connection.requesterProfileId)!==String(auth.context.profile._id))return apiError("incoming_request_requires_response",409);
  const pairKey=profilePairKey(auth.context.profile._id,target._id);
  if(!connection){try{connection=await ConnectionModel.create({pairKey,requesterProfileId:auth.context.profile._id,recipientProfileId:target._id,status:"pending"})}catch(error:any){if(error?.code===11000)connection=await connectionState(auth.context.profile._id,target._id);else throw error}}
  else if(connection.status!=="pending")connection=await ConnectionModel.findByIdAndUpdate(connection._id,{$set:{pairKey,requesterProfileId:auth.context.profile._id,recipientProfileId:target._id,status:"pending"},$unset:{respondedAt:1,blockedByProfileId:1}},{new:true});
  if(!connection)return apiError("connection_create_failed",500);
  const existing=await NetworkMessageRequestModel.findOne({pairKey});if(existing?.status==="pending")return apiError("message_request_already_pending",409);if(existing?.cooldownUntil&&existing.cooldownUntil>new Date())return apiError("message_request_cooldown",429,{until:existing.cooldownUntil});
  const item=await NetworkMessageRequestModel.findOneAndUpdate({pairKey},{$set:{requesterProfileId:auth.context.profile._id,recipientProfileId:target._id,connectionId:connection._id,text:parsed.data.text,status:"pending"},$unset:{respondedAt:1,cooldownUntil:1,conversationId:1}},{upsert:true,new:true});
  await notify({recipientProfileId:target._id,actorProfileId:auth.context.profile._id,type:"message_request",targetType:"connection",targetId:connection._id});return Response.json({ok:true,request:{id:item._id.toString(),connectionId:connection._id.toString(),state:"outgoing_pending"}},{status:201});
}
