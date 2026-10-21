import assert from "node:assert/strict";
import test from "node:test";
import { getAllowedOrigins } from "./origin";

test("includes the active local frontend origins in development", () => {
  assert.deepEqual(
    getAllowedOrigins({
      appOrigin: "https://thepulpdoctor.com",
      developmentOrigins:
        "http://localhost:5175,http://127.0.0.1:5175",
      nodeEnv: "development",
    }),
    [
      "https://thepulpdoctor.com",
      "http://localhost:5175",
      "http://127.0.0.1:5175",
    ],
  );
});

test("does not add development origins outside development", () => {
  assert.deepEqual(
    getAllowedOrigins({
      appOrigin: "https://thepulpdoctor.com",
      developmentOrigins: "http://localhost:5175",
      nodeEnv: "production",
    }),
    ["https://thepulpdoctor.com"],
  );
});
