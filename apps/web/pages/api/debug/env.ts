import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const keys = [
    'SYNAPTICA_API_SECRET',
    'DATABASE_URL',
    'NEXT_PUBLIC_WEBAPP_URL',
    'NODE_ENV',
    'NEXTAUTH_SECRET',
    'RAILWAY_PROJECT_NAME',
    'RAILWAY_ENVIRONMENT',
    'RAILWAY_SERVICE_NAME',
    'CALENDSO_ENCRYPTION_KEY',
  ];
  const result: Record<string, { present: boolean; length: number }> = {};
  for (const key of keys) {
    const val = process.env[key];
    result[key] = { present: !!val, length: val?.length ?? 0 };
  }
  res.status(200).json(result);
}
