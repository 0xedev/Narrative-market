import { fetchSubstream } from "@substreams/core";

const SPKG = process.env.SPKG_URL ?? "https://spkg.io/streamingfast/blocks-v1.0.0.spkg";

const pkg = await fetchSubstream(SPKG);
console.log("package:", pkg.package?.name, pkg.package?.version);
for (const module of pkg.modules?.modules ?? []) {
  console.log("module:", module.name, "kind:", module.kind, "output:", JSON.stringify(module.output?.type?.typeName ?? module.output?.type ?? null));
}
console.log("protos:", (pkg.protoFiles ?? []).map((f) => f.name).join(", "));
