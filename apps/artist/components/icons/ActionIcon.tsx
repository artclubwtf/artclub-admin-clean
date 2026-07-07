export type ActionIconName = "like" | "comment" | "save" | "share" | "more" | "edit" | "delete" | "send" | "play" | "pause" | "volume" | "muted" | "close";

export function ActionIcon({ name, className = "h-5 w-5", filled = false }: { name: ActionIconName; className?: string; filled?: boolean }) {
  const common = { stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return <svg viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} className={className} aria-hidden>
    {name === "like" && <path d="M20.8 8.4c0 5-8.8 10.2-8.8 10.2S3.2 13.4 3.2 8.4A4.4 4.4 0 0 1 12 7.7a4.4 4.4 0 0 1 8.8.7Z" {...common}/>} 
    {name === "comment" && <path d="M4 5.5h16v11H9l-5 3v-14Z" {...common}/>} 
    {name === "save" && <path d="M6 4.5h12v15l-6-3.6-6 3.6v-15Z" {...common}/>} 
    {name === "share" && <><circle cx="18" cy="5.5" r="2" {...common}/><circle cx="6" cy="12" r="2" {...common}/><circle cx="18" cy="18.5" r="2" {...common}/><path d="m7.8 11 8.4-4.5M7.8 13l8.4 4.5" {...common}/></>} 
    {name === "more" && <><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/></>} 
    {name === "edit" && <><path d="m5 16-.8 4 4-.8L19 8.4 15.6 5 5 16Z" {...common}/><path d="m13.8 6.8 3.4 3.4" {...common}/></>} 
    {name === "delete" && <><path d="M5 7h14M9 4h6M7 7l.8 13h8.4L17 7M10 10.5v6M14 10.5v6" {...common}/></>} 
    {name === "send" && <path d="m3.5 4 17 8-17 8 3-8-3-8Zm3 8h8" {...common}/>} 
    {name === "play" && <path d="m9 6 9 6-9 6V6Z" {...common}/>} 
    {name === "pause" && <path d="M9 6v12M15 6v12" {...common}/>} 
    {name === "volume" && <><path d="M5 10h3l4-3v10l-4-3H5v-4Z" {...common}/><path d="M15 9c1.5 1.7 1.5 4.3 0 6M17.5 6.5c3 3.1 3 7.9 0 11" {...common}/></>} 
    {name === "muted" && <><path d="M5 10h3l4-3v10l-4-3H5v-4Z" {...common}/><path d="m16 10 4 4m0-4-4 4" {...common}/></>} 
    {name === "close" && <path d="m6 6 12 12M18 6 6 18" {...common}/>} 
  </svg>;
}
