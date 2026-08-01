import { z } from 'zod';

export const userSchema = z.object({
  username: z.string().min(3),
  email: z.string().email(),
  password: z.string().min(8),
});

export function handlePostUsers(req: { body: unknown }, res: { status: (code: number) => { json: (data: unknown) => void } }) {
  const result = userSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: "Invalid input", details: result.error.format() });
  }

  // Implementation for creating the user goes here
  return res.status(201).json({ message: "User created successfully", user: result.data });
}
