import { redirect } from "next/navigation";

export default async function ArtistsV2Page() {
  redirect("/admin/artists");
}
