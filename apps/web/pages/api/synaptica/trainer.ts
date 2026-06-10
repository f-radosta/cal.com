import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "node:crypto";

import { HttpError } from "@calcom/lib/http-error";
import { defaultResponder } from "@calcom/lib/server/defaultResponder";
import { prisma } from "@calcom/prisma";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  // Railway intermittently fails to inject SYNAPTICA_API_SECRET into the runtime,
  // so we fall back to the Deployment table where the SHA-256 hash is stored.
  const secretHash =
    process.env.SYNAPTICA_API_SECRET ||
    (
      await prisma.deployment.findFirst({
        select: { synapticaApiSecretHash: true },
      })
    )?.synapticaApiSecretHash;

  if (
    secretHash &&
    crypto.createHash("sha256").update(req.headers["x-synaptica-secret"] || "").digest("hex") !==
      secretHash
  ) {
    throw new HttpError({ statusCode: 401, message: "Unauthorized" });
  }

  const rawUserId = req.query.userId;
  const userId = Number(rawUserId);
  if (!rawUserId || isNaN(userId)) {
    return res.status(400).json({ message: "userId is required (number)" });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, name: true, email: true, completedOnboarding: true },
  });

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  return res.status(200).json(user);
}

export default defaultResponder(handler, "/api/synaptica/trainer");
