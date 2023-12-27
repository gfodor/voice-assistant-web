// ./app/api/chat/route.js
import OpenAI from "openai";
// import { OpenAIStream, StreamingTextResponse} from "ai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const runtime = "edge";

const threadMap = new Map();

import { NextResponse } from "next/server";

export async function POST(req: any) {
  let { content, thread_id } = await req.json();

  if (!thread_id) {
    thread_id = (await openai.beta.threads.create()).id;
  }

  await openai.beta.threads.messages.create(thread_id, { role: "user", content })

  let run = await openai.beta.threads.runs.create(thread_id, { assistant_id: "asst_NjKxDodlDYJrchNdqWVa2NSW" })

  while (run.status !== "failed" && run.status !== "completed" && run.status !== "expired") {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    run = await openai.beta.threads.runs.retrieve(thread_id, run.id);
  }

  const runStepId = (await openai.beta.threads.runs.steps.list(thread_id, run.id)).data[0].id;

  const step = (await openai.beta.threads.runs.steps.retrieve(thread_id, run.id, runStepId));
  let message = ""

  if (step.step_details.type == "message_creation") {
    const messageId = step.step_details.message_creation.message_id;
    const messageData = await openai.beta.threads.messages.retrieve(thread_id, messageId)

    // @ts-ignore
    message = messageData.content[0].text.value;
  }

  return NextResponse.json({ thread_id: thread_id,  message});
}
