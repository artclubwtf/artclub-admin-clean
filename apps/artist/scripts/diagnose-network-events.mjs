import mongoose from "mongoose";

const repair = process.argv.includes("--repair");
const mongoUrl = process.env.MONGODB_URI;
if (!mongoUrl) throw new Error("MONGODB_URI is required");

await mongoose.connect(mongoUrl);
const collection = mongoose.connection.db.collection("networkevents");
const invalid = [];
for await (const event of collection.find({}, { projection: { title: 1, status: 1, startAt: 1 } })) {
  const valid = event.startAt instanceof Date && !Number.isNaN(event.startAt.getTime());
  if (!valid) invalid.push({ id: String(event._id), title: String(event.title || ""), status: String(event.status || "") });
}

let repairedCount = 0;
if (repair) {
  for (const event of invalid) {
    const _id = new mongoose.Types.ObjectId(event.id);
    const published = event.status === "published" || event.status === "cancelled";
    const update = published
      ? { $set: { status: "draft" }, $unset: { startAt: "", publishedAt: "" } }
      : { $unset: { startAt: "" } };
    const result = await collection.updateOne({ _id }, update);
    repairedCount += result.modifiedCount;
  }
}

console.log(JSON.stringify({ mode: repair ? "repair" : "diagnostic", invalidCount: invalid.length, repairedCount, events: invalid }, null, 2));
await mongoose.disconnect();
