const fs = require("fs");
const key = fs.readFileSync(
  "./course-nest-6d3e1-firebase-adminsdk-key.json",
  "utf8"
);
const base64 = Buffer.from(key).toString("base64");
console.log(base64);
