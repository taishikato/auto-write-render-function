const { createClient } = require("@supabase/supabase-js");
const express = require("express");
const bodyParser = require("body-parser");
const asyncHandler = require("express-async-handler");
const Queue = require("bull");
const app = express();

const port = process.env.PORT || 3001;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const jsonParser = bodyParser.json();

const vectorQueue = new Queue("create an article", process.env.REDIS_URL);

vectorQueue.process(async (job, done) => {
  const jobData = job.data;
  const { topic, userId } = jobData;

  // generate article
  const json = await fetch("https://api.openai.com/v1/chat/completions", {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    method: "POST",
    body: JSON.stringify(createPayload(topic)),
  })
    .then((res) => res.json())
    .catch((err) => console.error(err));

  await supabaseAdmin.from("articles").insert({
    content: json.choices[0].message.content ?? "Sorry...an error occurred.",
    user_id: userId,
  });

  done();
});

vectorQueue.on("completed", (job, result) => {
  const jobData = job.data;
  console.log(
    `job with filterId ${
      jobData.filterId
    } is completed with result: ${JSON.stringify(result)}`
  );
});

app.get("/", (req, res, next) => {
  console.log("Info: / is called!");

  return res.json({ result: "ok" });
});

app.post(
  "/create-article",
  jsonParser,
  asyncHandler(async (req, res, next) => {
    console.log("/create-article is called!");

    const { topicsAndUserIds } = req.body;

    console.log("Info: Job set");
    for (const data of topicsAndUserIds) {
      await vectorQueue.add({
        topic: data.topic,
        userId: data.userId,
      });
    }

    console.log("End: Request successfully done.");
    return res.json({
      result: "ok",
    });
  })
);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send(err.message || "An error occurred!");
});

app.listen(port, () => {
  console.log(`App listening on port ${port}!`);
});
