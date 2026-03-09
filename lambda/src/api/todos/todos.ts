// lambda/index.ts

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient();

// カスタムZodスキーマ for YYYY-MM-DD形式の日付
const dateSchema = z.string().refine(
  (val) => {
    return /^\d{4}-\d{2}-\d{2}$/.test(val) && !isNaN(Date.parse(val));
  },
  {
    message: "Invalid date format. Use YYYY-MM-DD",
  }
);

// Zodスキーマの定義
const TodoSchema = z.object({
  userId: z.string().min(1),
  title: z.string().min(1).max(100),
  description: z.string().default(""),
  completed: z.boolean(),
  dueDate: dateSchema.optional(),
});

const TodoUpdateSchema = TodoSchema.partial().omit({ userId: true });

const todos = new Hono()
  .post("/", zValidator("json", TodoSchema, (result, c) => {
    console.log(`${result}`)
    if (!result.success) {
      console.error("### zod error ###")
      console.error(result.error.format())
      return c.json({ error: result.error.format() }, 401);
    } else {
      console.log("### zod ok ###")
    }
  }), async (c) => {
    const validatedData = c.req.valid("json");

    try {
      const todo = await prisma.todo.create({
        data: {
          ...validatedData,
          dueDate: validatedData.dueDate ? new Date(validatedData.dueDate) : null,
        },
      });

      return c.json({ message: "Todo created successfully", todo }, 201);
    } catch (error) {
      console.error(error);
      return c.json({ error: "Failed to create todo" }, 500);
    }
  })
  .get("/user/:userId", async (c) => {
    const userId = c.req.param("userId");

    try {
      const todos = await prisma.todo.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
      });

      return c.json(todos);
    } catch (error) {
      console.error(error);
      return c.json({ error: "Failed to retrieve todos" }, 500);
    }
  })
  .get("/:id", async (c) => {
    const id = c.req.param("id");

    try {
      const todo = await prisma.todo.findUnique({
        where: { id },
      });

      if (!todo) {
        return c.json({ error: "Todo not found" }, 404);
      }

      return c.json(todo);
    } catch (error) {
      console.error(error);
      return c.json({ error: "Failed to retrieve todo" }, 500);
    }
  })
  .put("/:id", zValidator("json", TodoUpdateSchema), async (c) => {
    const id = c.req.param("id");
    const validatedData = c.req.valid("json");

    try {
      const todo = await prisma.todo.update({
        where: { id },
        data: {
          ...validatedData,
          dueDate: validatedData.dueDate ? new Date(validatedData.dueDate) : undefined,
        },
      });

      return c.json(todo);
    } catch (error) {
      console.error(error);
      return c.json({ error: "Failed to update todo" }, 500);
    }
  })
  .delete("/:id", async (c) => {
    const id = c.req.param("id");

    try {
      await prisma.todo.delete({
        where: { id },
      });

      return c.json({ message: "Todo deleted successfully" });
    } catch (error) {
      console.error(error);
      return c.json({ error: "Failed to delete todo" }, 500);
    }
  });

export { todos };
