import { POST as registerV2 } from "@/app/api/artists/v2/register/route";

export async function POST(req: Request) {
  return registerV2(req);
}
