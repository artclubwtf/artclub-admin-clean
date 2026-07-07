"use client";

import { useState } from "react";
import { Modal } from "@/components/primitives/Modal";

export function MessageRequestModal({open,recipient,onClose,onSend}:{open:boolean;recipient:{displayName:string;profileImageUrl?:string};onClose:()=>void;onSend:(text:string)=>Promise<void>}) {
  const[text,setText]=useState("");const[busy,setBusy]=useState(false);const[error,setError]=useState("");
  async function send(){const clean=text.trim();if(!clean||clean.length>100||busy)return;setBusy(true);setError("");try{await onSend(clean);setText("");onClose()}catch{setError("The message request could not be sent.")}finally{setBusy(false)}}
  return <Modal open={open} onClose={()=>!busy&&onClose()} title="Message request" subtitle="You can send one short introduction before you are connected."><div className="flex items-center gap-3">{recipient.profileImageUrl?<img src={recipient.profileImageUrl} alt="" className="h-12 w-12 rounded-full object-cover"/>:<div className="grid h-12 w-12 place-items-center rounded-full bg-[var(--surface-muted)] font-medium">{recipient.displayName.slice(0,1)}</div>}<p className="font-medium">{recipient.displayName}</p></div><label className="mt-5 block"><span className="sr-only">Message</span><textarea autoFocus value={text} onChange={event=>setText(event.target.value.slice(0,100))} maxLength={100} rows={4} className="control w-full resize-none" placeholder="Introduce yourself…"/></label><div className="mt-1 text-right text-xs tabular-nums text-[var(--text-muted)]">{text.length}/100</div>{error?<p role="alert" className="mt-2 text-sm text-[var(--danger)]">{error}</p>:null}<div className="mt-4 flex justify-end gap-2"><button type="button" disabled={busy} onClick={onClose} className="secondary-action">Cancel</button><button type="button" disabled={busy||!text.trim()} onClick={()=>void send()} className="primary-action disabled:opacity-40">{busy?"Sending…":"Send"}</button></div></Modal>;
}
