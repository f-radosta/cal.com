import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "node:crypto";

import { HttpError } from "@calcom/lib/http-error";
import { defaultResponder } from "@calcom/lib/server/defaultResponder";
import { prisma } from "@calcom/prisma";
import { CreationSource, MembershipRole } from "@calcom/prisma/enums";

import { inviteMembersWithNoInviterPermissionCheck } from "@calcom/trpc/server/routers/viewer/teams/inviteMember/inviteMember.handler";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
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

  const { email, teamId = 1, role = MembershipRole.MEMBER } = req.body;

  if (!email) {
    return res.status(400).json({ message: "email is required" });
  }

  const result = await inviteMembersWithNoInviterPermissionCheck({
    teamId,
    language: "cs",
    inviterName: "Synaptica Admin",
    orgSlug: null,
    invitations: [{ usernameOrEmail: email, role }],
    creationSource: CreationSource.API_V1,
    isDirectUserAction: false,
  });

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true },
  });

  if (user?.id) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        timeZone: "Europe/Prague",
        locale: "cs",
        hideBranding: true,
        weekStart: "Monday",
      },
    });
  }

  return res.status(200).json({
    message: "Trainer invited",
    usernameOrEmail: result.usernameOrEmail,
    userId: user?.id ?? null,
  });
}

export default defaultResponder(handler, "/api/synaptica/invite-trainer");
