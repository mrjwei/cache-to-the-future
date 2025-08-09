import fs from "fs";
import OpenAI from "openai";

const openai = new OpenAI();

import express from 'express';
const app = express();
const port = 3000;

app.get('/transcribe', async (req, res) => {
  const transcription = await openai.audio.transcriptions.create({
    file: fs.createReadStream(`./recordings/${req.params.filename}.webm`),
    model: "gpt-4o-transcribe",
  });
  res.json({"transcription": transcription})
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
