import {notFound} from "next/navigation";
import {EventDetailClient} from "@/components/network/EventDetailClient";
import {requireNetworkContext} from "@/lib/server/network-context";
import {validId} from "@/lib/server/network-service";
export const dynamic="force-dynamic";
export default async function EventPage({params}:{params:Promise<{id:string}>}){await requireNetworkContext();const{id}=await params;if(!validId(id))notFound();return <EventDetailClient id={id}/>}
