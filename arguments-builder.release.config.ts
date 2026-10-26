import { defineConfig } from "@iringo/arguments-builder";
import { argsFull, output } from "./arguments-builder.full.config";

export default defineConfig({ output: { ...output, boxjsSettings: { ...output.boxjsSettings, path: "./dist/BiliBili.Redirect.boxjs.json" } }, args: argsFull });
