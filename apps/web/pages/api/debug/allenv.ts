import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const allEnv = Object.fromEntries(
    Object.entries(process.env).map(([k, v]) => [k, { present: !!v, length: v?.length ?? 0 }])
  );
  res.status(200).json(allEnv);
}
