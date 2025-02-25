const express = require("express");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");
const axios = require("axios");
require("dotenv").config();

const app = express();
const allowedOrigins = [
  "https://ayotto-brain-ai-frontend-production.up.railway.app",
  "http://localhost:5173"
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  }
}));

app.use(express.json());

const upload = multer({ dest: "uploads/" });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

app.post("/generate", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    console.log("✅ Image uploaded:", req.file.path);

    // Read file and convert to Base64
    const imageBase64 = fs.readFileSync(req.file.path, { encoding: "base64" });

    const payload = {
      contents: [
        {
          parts: [
            {
              text: `Analyze this image and extract multiple-choice questions (MCQs) exactly as they appear in the image. Maintain the original language and formatting.

              - If the image contains an stamp image before any question, replace it with "[image here]".
              - Ensure every question has at least one correct answer.
              - If reference text or explanation (solution) exists, include them.
              - Return ONLY raw JSON in this format:

              [
                {
                  "questionText": "string",
                  "referenceText": "",
                  "solutionText": "",
                  "options": [
                    { "text": "string", "isCorrect": boolean }
                  ]
                }
              ]

              Rules:
              1. Extract all MCQs, not just one.
              2. Preserve exact wording. Keep the original language (do not translate)
              3. Keep all relevant details (diagrams = [image] if needed).
              4. Return ONLY JSON, no explanations, no markdown or code blocks.
              5. Return empty string for referenceText and solutionText if not applicable
              6. Reference text can be inside []/(). Also, solutionText can be inside ব্যাখ্যা/Solution/Solve or any similar part
              7. Create EXACT clones of question(s). Do not change anything`
            },
            {
              inlineData: {
                mimeType: req.file.mimetype,
                data: imageBase64,
              },
            },
          ],
        },
      ],
    };

    console.log("📡 Sending request to Gemini API...");
    const response = await axios.post(GEMINI_API_URL, payload, {
      headers: { "Content-Type": "application/json" },
    });

    console.log("📨 Gemini API Full Response:", JSON.stringify(response.data, null, 2));

    // Check for valid response format
    const candidates = response.data?.candidates;
    if (!candidates || candidates.length === 0) {
      return res.status(500).json({ error: "No candidates found in response" });
    }

    const rawText = candidates[0]?.content?.parts[0]?.text || "";
    console.log("📄 Raw JSON text from Gemini:", rawText);

    // Clean the JSON text
    const cleanedJson = rawText.replace(/```json|```/g, "").trim();
    console.log("✅ Cleaned JSON:", cleanedJson);

    // Parse JSON safely
    let questionsArray;
    try {
      questionsArray = JSON.parse(cleanedJson);
    } catch (parseError) {
      console.error("❌ JSON Parse Error:", parseError);
      return res.status(500).json({ error: "Invalid JSON format from Gemini API" });
    }

    res.json({ success: true, questions: questionsArray });
  } catch (error) {
    console.error("❌ Error processing image:", error.message);
    res.status(500).json({ error: "Failed to process image", details: error.message });
  }
});

app.listen(5000, () => console.log("🚀 Server running on port 5000"));
