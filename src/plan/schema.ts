import { z } from "zod";

const simpleActionSchema = z.enum(["rename", "format", "regex"]);

const verifySchema = z.object({
  command: z.string().optional(),
});

const baseTaskSchema = z.object({
  id: z.string().min(1),
  files: z.array(z.string()).min(1),
});

export const simpleTaskSchema = baseTaskSchema.extend({
  type: z.literal("simple"),
  action: simpleActionSchema,
  find: z.string().optional(),
  replace: z.string().optional(),
});

export const aiTaskSchema = baseTaskSchema.extend({
  type: z.literal("ai"),
  worker: z.enum(["agy", "claude"]),
  prompt: z.string().min(1),
  verify: verifySchema.optional(),
});

export const taskSchema = z.discriminatedUnion("type", [simpleTaskSchema, aiTaskSchema]);

export const planSchema = z.object({
  tasks: z.array(taskSchema).min(1),
});

export type SimpleTask = z.infer<typeof simpleTaskSchema>;
export type AiTask = z.infer<typeof aiTaskSchema>;
export type Task = z.infer<typeof taskSchema>;
export type Plan = z.infer<typeof planSchema>;
