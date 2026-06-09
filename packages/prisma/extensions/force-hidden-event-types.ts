import { Prisma } from "../generated/prisma/client";

export const forceHiddenEventTypesExtension = () => {
  return Prisma.defineExtension({
    name: "forceHiddenEventTypes",
    query: {
      eventType: {
        $allOperations({ operation, args, query }) {
          if (operation === "create") {
            (args as { data?: Record<string, unknown> }).data = {
              ...(args as { data?: Record<string, unknown> }).data,
              hidden: true,
            };
          }
          if (operation === "createMany") {
            const createArgs = args as { data?: Array<Record<string, unknown>> };
            if (Array.isArray(createArgs.data)) {
              createArgs.data = createArgs.data.map((d) => ({
                ...d,
                hidden: true,
              }));
            }
          }
          if (operation === "update" || operation === "updateMany") {
            (args as { data?: Record<string, unknown> }).data = {
              ...(args as { data?: Record<string, unknown> }).data,
              hidden: true,
            };
          }
          if (operation === "upsert") {
            const upsertArgs = args as { create?: Record<string, unknown>; update?: Record<string, unknown> };
            upsertArgs.create = { ...upsertArgs.create, hidden: true };
            upsertArgs.update = { ...upsertArgs.update, hidden: true };
          }
          return query(args);
        },
      },
    },
  });
};
