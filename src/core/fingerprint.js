import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";

export async function fingerprintFile(filePath) {
  const fileStat = await stat(filePath);
  const sha256 = createHash("sha256");
  const sha1 = createHash("sha1");
  const md5 = createHash("md5");

  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);

    stream.on("data", (chunk) => {
      sha256.update(chunk);
      sha1.update(chunk);
      md5.update(chunk);
    });
    stream.on("end", resolve);
    stream.on("error", reject);
  });

  return {
    absolutePath: filePath,
    baseName: path.basename(filePath),
    extension: path.extname(filePath).toLowerCase(),
    sizeBytes: fileStat.size,
    modifiedAt: new Date(fileStat.mtimeMs).toISOString(),
    sha256: sha256.digest("hex"),
    sha1: sha1.digest("hex"),
    md5: md5.digest("hex")
  };
}

