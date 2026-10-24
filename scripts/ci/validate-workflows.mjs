import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

// JSON_SCHEMA preserves GitHub's `on` key as a string and rejects custom tags.
// Keep json:false: duplicate mapping keys must throw, never silently overwrite.
export function parseWorkflow(source, filename) {
  const workflow = yaml.load(source, {
    filename,
    schema: yaml.JSON_SCHEMA,
    json: false
  });
  if (!workflow || typeof workflow !== "object" || Array.isArray(workflow)) {
    throw new Error(`${filename}: expected a workflow mapping`);
  }
  return workflow;
}

export function validateWorkflows(directory) {
  const files = readdirSync(directory).filter((file) => /\.ya?ml$/i.test(file)).sort();
  if (!files.length) throw new Error(`No workflows found in ${directory}`);
  const errors = [];
  for (const file of files) {
    const filename = path.join(directory, file);
    try {
      parseWorkflow(readFileSync(filename, "utf8"), filename);
    } catch (error) {
      errors.push(error.message);
    }
  }
  if (errors.length) throw new Error(errors.join("\n\n"));
  return files;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = fileURLToPath(new URL("../../.github/workflows/", import.meta.url));
  try {
    const files = validateWorkflows(directory);
    console.log(`Workflow YAML OK: ${files.length} files; no syntax errors or duplicate keys.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
