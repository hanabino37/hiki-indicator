import { validateMachine } from "../src/lib/validateMachine";
import fs from "node:fs";

const raw = fs.readFileSync("./data/machines/examples/kyoraku_denoh.json", "utf8");
const obj = JSON.parse(raw);

const result = validateMachine(obj);
console.log(result);
if (!result.ok) process.exitCode = 1;
